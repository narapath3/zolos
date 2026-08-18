-- ZOLOS market escrow hardening: seller inventory is moved atomically.
-- Apply after the marketplace/inventory tables exist.

CREATE OR REPLACE FUNCTION public.create_market_listing(
  p_user_id uuid, p_character_id text, p_item_name text,
  p_quantity integer, p_price integer
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE
  v_char public.characters%ROWTYPE;
  v_inv public.inventory%ROWTYPE;
  v_listing public.marketplace%ROWTYPE;
BEGIN
  IF p_user_id IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_authed'); END IF;
  IF p_character_id IS NULL OR p_item_name IS NULL OR p_quantity IS NULL OR p_quantity < 1 OR p_quantity > 999999
     THEN RETURN jsonb_build_object('ok', false, 'reason', 'bad_listing'); END IF;
  IF p_price IS NULL OR p_price < 0 OR p_price > 500000000
     THEN RETURN jsonb_build_object('ok', false, 'reason', 'bad_price'); END IF;

  SELECT * INTO v_char FROM public.characters
    WHERE id = p_character_id AND user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_owner'); END IF;

  SELECT * INTO v_inv FROM public.inventory
    WHERE character_id = v_char.id AND item_name = left(trim(p_item_name), 64)
    FOR UPDATE;
  IF NOT FOUND OR v_inv.quantity < p_quantity THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_enough_items');
  END IF;
  IF v_inv.item_type = 'system' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'system_item');
  END IF;

  IF v_inv.quantity = p_quantity THEN
    DELETE FROM public.inventory WHERE id = v_inv.id;
  ELSE
    UPDATE public.inventory SET quantity = quantity - p_quantity WHERE id = v_inv.id;
  END IF;

  INSERT INTO public.marketplace
    (item_id, item_name, item_type, quantity, price, seller_id, seller_name, stats)
  VALUES
    ('item_' || substr(md5(random()::text || clock_timestamp()::text), 1, 24),
     v_inv.item_name, v_inv.item_type, p_quantity, p_price, p_user_id, v_char.name,
     COALESCE(v_inv.stats, '{}'::jsonb))
  RETURNING * INTO v_listing;

  RETURN jsonb_build_object('ok', true, 'serverAuthoritative', true, 'listing', to_jsonb(v_listing));
END $function$;

CREATE OR REPLACE FUNCTION public.cancel_market_listing(p_user_id uuid, p_listing_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE
  v_listing public.marketplace%ROWTYPE;
  v_char_id text;
  v_inv public.inventory%ROWTYPE;
BEGIN
  IF p_user_id IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_authed'); END IF;
  SELECT * INTO v_listing FROM public.marketplace
    WHERE id = p_listing_id AND seller_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_owner_or_gone'); END IF;

  SELECT id INTO v_char_id FROM public.characters
    WHERE user_id = p_user_id ORDER BY created_at LIMIT 1 FOR UPDATE;
  IF v_char_id IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'no_character'); END IF;

  SELECT * INTO v_inv FROM public.inventory
    WHERE character_id = v_char_id AND item_name = v_listing.item_name FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.inventory (character_id, item_name, item_type, quantity, stats)
      VALUES (v_char_id, v_listing.item_name, v_listing.item_type, v_listing.quantity,
              COALESCE(v_listing.stats, '{}'::jsonb));
  ELSE
    UPDATE public.inventory SET quantity = quantity + v_listing.quantity WHERE id = v_inv.id;
  END IF;
  DELETE FROM public.marketplace WHERE id = p_listing_id;
  RETURN jsonb_build_object('ok', true, 'serverAuthoritative', true, 'listing', to_jsonb(v_listing));
END $function$;
