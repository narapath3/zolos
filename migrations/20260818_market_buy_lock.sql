-- Marketplace purchase race hardening.
-- The listing and buyer character are locked before checking gold so two
-- concurrent requests cannot spend the same balance or claim one listing twice.

CREATE OR REPLACE FUNCTION public.buy_market_item(p_listing_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_listing public.marketplace%ROWTYPE;
  v_buyer public.characters%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_authed'); END IF;
  SELECT * INTO v_listing FROM public.marketplace
    WHERE id = p_listing_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'gone'); END IF;
  IF v_listing.seller_id = auth.uid() THEN RETURN jsonb_build_object('ok', false, 'reason', 'own_listing'); END IF;

  SELECT * INTO v_buyer FROM public.characters
    WHERE user_id = auth.uid() ORDER BY created_at LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'no_character'); END IF;
  IF v_buyer.gold < v_listing.price THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_enough_gold'); END IF;

  UPDATE public.characters
    SET gold = gold - v_listing.price, updated_at = now()
    WHERE id = v_buyer.id;
  UPDATE public.characters
    SET gold = LEAST(gold + v_listing.price, 500000000), updated_at = now()
    WHERE user_id = v_listing.seller_id;

  UPDATE public.inventory
    SET quantity = quantity + v_listing.quantity
    WHERE character_id = v_buyer.id AND item_name = v_listing.item_name;
  IF NOT FOUND THEN
    INSERT INTO public.inventory (character_id, item_name, item_type, quantity, stats)
    VALUES (v_buyer.id, v_listing.item_name, v_listing.item_type, v_listing.quantity,
            COALESCE(v_listing.stats, '{}'::jsonb));
  END IF;

  DELETE FROM public.marketplace WHERE id = p_listing_id;
  INSERT INTO public.market_history (item_name, quantity, price)
    VALUES (v_listing.item_name, v_listing.quantity, v_listing.price);

  RETURN jsonb_build_object('ok', true, 'buyer_gold', v_buyer.gold - v_listing.price,
    'item_name', v_listing.item_name, 'item_type', v_listing.item_type,
    'quantity', v_listing.quantity, 'price', v_listing.price,
    'seller_name', v_listing.seller_name, 'stats', COALESCE(v_listing.stats, '{}'::jsonb));
END $function$;

REVOKE EXECUTE ON FUNCTION public.buy_market_item(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.buy_market_item(uuid) TO authenticated;
