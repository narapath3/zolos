-- Self-hosted ports of the Supabase RPCs. auth.uid() -> p_user_id parameter
-- (the API passes the JWT-verified user id). Logic mirrors the originals.
-- Run against the local `zolos` DB as owner (zolos_app).

CREATE OR REPLACE FUNCTION public.sync_card_mail_collection()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE v_card_id text;
BEGIN
  v_card_id := CASE WHEN TG_OP = 'INSERT' THEN NEW.stats->>'card_id'
    ELSE COALESCE(NEW.stats->>'card_id', OLD.stats->>'card_id') END;
  IF v_card_id IS NULL OR v_card_id = '' THEN RAISE EXCEPTION 'mail card_id is required'; END IF;
  IF TG_OP = 'INSERT' THEN
    UPDATE public.character_cards SET owned = owned - NEW.quantity
      WHERE character_id = NEW.sender_char_id AND card_id = v_card_id AND owned >= NEW.quantity;
    IF NOT FOUND THEN RAISE EXCEPTION 'not enough authoritative card copies'; END IF;
    RETURN NEW;
  END IF;
  IF OLD.status = 'pending' AND NEW.status = 'claimed' THEN
    INSERT INTO public.character_cards(character_id,card_id,owned,stars,pity)
      VALUES(NEW.recipient_char_id,v_card_id,NEW.quantity,1,0)
      ON CONFLICT(character_id,card_id) DO UPDATE SET owned=public.character_cards.owned+EXCLUDED.owned;
  ELSIF OLD.status = 'pending' AND NEW.status = 'returned' THEN
    INSERT INTO public.character_cards(character_id,card_id,owned,stars,pity)
      VALUES(NEW.sender_char_id,v_card_id,NEW.quantity,1,0)
      ON CONFLICT(character_id,card_id) DO UPDATE SET owned=public.character_cards.owned+EXCLUDED.owned;
  END IF;
  RETURN NEW;
END $function$;
DROP TRIGGER IF EXISTS card_mail_collection_insert ON public.card_mailbox;
CREATE TRIGGER card_mail_collection_insert BEFORE INSERT ON public.card_mailbox
  FOR EACH ROW EXECUTE FUNCTION public.sync_card_mail_collection();
DROP TRIGGER IF EXISTS card_mail_collection_resolve ON public.card_mailbox;
CREATE TRIGGER card_mail_collection_resolve AFTER UPDATE OF status ON public.card_mailbox
  FOR EACH ROW EXECUTE FUNCTION public.sync_card_mail_collection();

CREATE OR REPLACE FUNCTION public.buy_market_item(p_user_id uuid, p_listing_id uuid)
RETURNS jsonb LANGUAGE plpgsql AS $function$
DECLARE
  v_listing marketplace%ROWTYPE;
  v_buyer characters%ROWTYPE;
BEGIN
  IF p_user_id IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_authed'); END IF;
  SELECT * INTO v_listing FROM marketplace WHERE id = p_listing_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'gone'); END IF;
  IF v_listing.seller_id = p_user_id THEN RETURN jsonb_build_object('ok', false, 'reason', 'own_listing'); END IF;
  SELECT * INTO v_buyer FROM characters
    WHERE user_id = p_user_id ORDER BY created_at LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'no_character'); END IF;
  IF v_buyer.gold < v_listing.price THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_enough_gold'); END IF;
  UPDATE characters SET gold = gold - v_listing.price, updated_at = now() WHERE id = v_buyer.id;
  UPDATE characters SET gold = LEAST(gold + v_listing.price, 500000000), updated_at = now() WHERE user_id = v_listing.seller_id;
  UPDATE inventory SET quantity = quantity + v_listing.quantity WHERE character_id = v_buyer.id AND item_name = v_listing.item_name;
  IF NOT FOUND THEN
    INSERT INTO inventory (character_id, item_name, item_type, quantity, stats)
    VALUES (v_buyer.id, v_listing.item_name, v_listing.item_type, v_listing.quantity, COALESCE(v_listing.stats, '{}'::jsonb));
  END IF;
  DELETE FROM marketplace WHERE id = p_listing_id;
  INSERT INTO market_history (item_name, quantity, price) VALUES (v_listing.item_name, v_listing.quantity, v_listing.price);
  RETURN jsonb_build_object('ok', true, 'buyer_gold', v_buyer.gold - v_listing.price,
    'item_name', v_listing.item_name, 'item_type', v_listing.item_type,
    'quantity', v_listing.quantity, 'price', v_listing.price,
    'seller_name', v_listing.seller_name, 'stats', COALESCE(v_listing.stats, '{}'::jsonb));
END $function$;

CREATE OR REPLACE FUNCTION public.send_card_mail(p_user_id uuid, p_recipient_char_id text, p_item_name text, p_item_type text, p_quantity integer, p_price integer, p_stats jsonb, p_request_id text)
RETURNS jsonb LANGUAGE plpgsql AS $function$
DECLARE
  v_sender characters%ROWTYPE; v_recipient characters%ROWTYPE; v_inv inventory%ROWTYPE; v_existing card_mailbox%ROWTYPE;
  v_qty integer := floor(p_quantity)::int; v_price integer := GREATEST(0, floor(p_price)::int); v_mail_id uuid;
BEGIN
  IF p_user_id IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_authed'); END IF;
  IF p_request_id IS NULL OR p_request_id !~ '^[A-Za-z0-9:_-]{1,160}$' THEN RETURN jsonb_build_object('ok', false, 'reason', 'invalid_request'); END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || p_request_id, 0));
  SELECT * INTO v_existing FROM card_mailbox WHERE sender_user_id = p_user_id AND request_id = p_request_id;
  IF FOUND THEN
    RETURN jsonb_build_object('ok', true, 'mail_id', v_existing.id,
      'recipient_char_id', v_existing.recipient_char_id, 'idempotent_replay', true);
  END IF;
  IF v_qty < 1 THEN RETURN jsonb_build_object('ok', false, 'reason', 'bad_quantity'); END IF;
  SELECT * INTO v_sender FROM characters WHERE user_id = p_user_id ORDER BY created_at LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'no_character'); END IF;
  SELECT * INTO v_recipient FROM characters WHERE id = p_recipient_char_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'no_recipient'); END IF;
  IF v_recipient.user_id = p_user_id THEN RETURN jsonb_build_object('ok', false, 'reason', 'self'); END IF;
  SELECT * INTO v_inv FROM inventory
    WHERE character_id = v_sender.id AND item_name = p_item_name
    ORDER BY quantity DESC LIMIT 1 FOR UPDATE;
  IF NOT FOUND OR v_inv.quantity < v_qty THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_enough'); END IF;
  IF (v_inv.stats->>'equipped') = 'true' AND (v_inv.quantity - v_qty) < 1 THEN RETURN jsonb_build_object('ok', false, 'reason', 'socketed_reserve'); END IF;
  UPDATE inventory SET quantity = quantity - v_qty WHERE id = v_inv.id;
  DELETE FROM inventory WHERE id = v_inv.id AND quantity <= 0;
  INSERT INTO card_mailbox (sender_char_id, sender_user_id, sender_name, recipient_char_id, recipient_user_id, item_name, item_type, quantity, price, stats, request_id)
  VALUES (v_sender.id, p_user_id, v_sender.name, v_recipient.id, v_recipient.user_id, p_item_name, COALESCE(p_item_type, 'card'), v_qty, v_price, COALESCE(p_stats, '{}'::jsonb), p_request_id)
  RETURNING id INTO v_mail_id;
  RETURN jsonb_build_object('ok', true, 'mail_id', v_mail_id, 'recipient_name', v_recipient.name, 'recipient_char_id', v_recipient.id);
END $function$;

CREATE OR REPLACE FUNCTION public.claim_card_mail(p_user_id uuid, p_mail_id uuid)
RETURNS jsonb LANGUAGE plpgsql AS $function$
DECLARE v_mail card_mailbox%ROWTYPE; v_recipient characters%ROWTYPE;
BEGIN
  IF p_user_id IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_authed'); END IF;
  SELECT * INTO v_mail FROM card_mailbox WHERE id = p_mail_id FOR UPDATE;
  IF NOT FOUND OR v_mail.status <> 'pending' THEN RETURN jsonb_build_object('ok', false, 'reason', 'gone'); END IF;
  SELECT * INTO v_recipient FROM characters WHERE id = v_mail.recipient_char_id;
  IF NOT FOUND OR v_recipient.user_id <> p_user_id THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_yours'); END IF;
  IF v_mail.price > 0 THEN
    IF v_recipient.gold < v_mail.price THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_enough_gold'); END IF;
    UPDATE characters SET gold = gold - v_mail.price, updated_at = now() WHERE id = v_recipient.id;
    UPDATE characters SET gold = LEAST(gold + v_mail.price, 500000000), updated_at = now() WHERE id = v_mail.sender_char_id;
  END IF;
  UPDATE inventory SET quantity = quantity + v_mail.quantity WHERE character_id = v_recipient.id AND item_name = v_mail.item_name;
  IF NOT FOUND THEN
    INSERT INTO inventory (character_id, item_name, item_type, quantity, stats)
    VALUES (v_recipient.id, v_mail.item_name, v_mail.item_type, v_mail.quantity,
      jsonb_build_object('card_id', v_mail.stats->>'card_id', 'card_stars', 1, 'card_pity', 0));
  END IF;
  UPDATE card_mailbox SET status = 'claimed', resolved_at = now() WHERE id = p_mail_id;
  RETURN jsonb_build_object('ok', true, 'item_name', v_mail.item_name, 'item_type', v_mail.item_type,
    'quantity', v_mail.quantity, 'price', v_mail.price, 'sender_name', v_mail.sender_name,
    'recipient_gold', v_recipient.gold - CASE WHEN v_mail.price > 0 THEN v_mail.price ELSE 0 END);
END $function$;

CREATE OR REPLACE FUNCTION public.return_card_mail(p_user_id uuid, p_mail_id uuid)
RETURNS jsonb LANGUAGE plpgsql AS $function$
DECLARE v_mail card_mailbox%ROWTYPE;
BEGIN
  IF p_user_id IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_authed'); END IF;
  SELECT * INTO v_mail FROM card_mailbox WHERE id = p_mail_id FOR UPDATE;
  IF NOT FOUND OR v_mail.status <> 'pending' THEN RETURN jsonb_build_object('ok', false, 'reason', 'gone'); END IF;
  IF p_user_id <> v_mail.sender_user_id AND p_user_id <> v_mail.recipient_user_id THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_yours'); END IF;
  UPDATE inventory SET quantity = quantity + v_mail.quantity WHERE character_id = v_mail.sender_char_id AND item_name = v_mail.item_name;
  IF NOT FOUND THEN
    INSERT INTO inventory (character_id, item_name, item_type, quantity, stats)
    VALUES (v_mail.sender_char_id, v_mail.item_name, v_mail.item_type, v_mail.quantity, COALESCE(v_mail.stats, '{}'::jsonb));
  END IF;
  UPDATE card_mailbox SET status = 'returned', resolved_at = now() WHERE id = p_mail_id;
  RETURN jsonb_build_object('ok', true, 'item_name', v_mail.item_name, 'quantity', v_mail.quantity);
END $function$;

CREATE OR REPLACE FUNCTION public.admin_update_character(p_user_id uuid, target_char_id text, updates jsonb)
RETURNS json LANGUAGE plpgsql AS $function$
DECLARE caller_is_admin boolean;
BEGIN
  SELECT is_admin INTO caller_is_admin FROM public.profiles WHERE id = p_user_id;
  IF caller_is_admin IS NOT TRUE THEN RAISE EXCEPTION 'Unauthorized: Only admins can update characters'; END IF;
  UPDATE public.characters SET
    level = COALESCE((updates->>'level')::integer, level),
    gold = COALESCE((updates->>'gold')::integer, gold),
    total_kills = COALESCE((updates->>'total_kills')::integer, total_kills),
    play_time = COALESCE((updates->>'play_time')::integer, play_time),
    updated_at = now()
  WHERE id = target_char_id;
  RETURN json_build_object('success', true);
END $function$;

CREATE OR REPLACE FUNCTION public.admin_delete_character(p_user_id uuid, target_char_id text)
RETURNS json LANGUAGE plpgsql AS $function$
DECLARE target_user_id uuid; caller_is_admin boolean;
BEGIN
  SELECT is_admin INTO caller_is_admin FROM public.profiles WHERE id = p_user_id;
  IF caller_is_admin IS NOT TRUE THEN RAISE EXCEPTION 'Unauthorized: Only admins can delete characters'; END IF;
  SELECT user_id INTO target_user_id FROM public.characters WHERE id = target_char_id;
  IF target_user_id IS NULL THEN RETURN json_build_object('success', false, 'message', 'Character not found'); END IF;
  DELETE FROM public.inventory WHERE character_id = target_char_id;
  DELETE FROM public.marketplace WHERE seller_id = target_user_id;
  DELETE FROM public.vending_stalls WHERE user_id = target_user_id;
  DELETE FROM public.characters WHERE id = target_char_id;
  DELETE FROM public.profiles WHERE id = target_user_id;
  RETURN json_build_object('success', true, 'message', 'Character and associated data deleted successfully');
END $function$;

-- ============ Atomic marketplace escrow ============
-- A seller cannot create a listing unless the item is locked and removed from
-- their own inventory in this same transaction. The client supplies only the
-- character id, item name, quantity, and price; item type/stats/name come from
-- trusted rows.
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
