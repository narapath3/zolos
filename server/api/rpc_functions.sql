-- Self-hosted ports of the Supabase RPCs. auth.uid() -> p_user_id parameter
-- (the API passes the JWT-verified user id). Logic mirrors the originals.
-- Run against the local `zolos` DB as owner (zolos_app).

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
  SELECT * INTO v_buyer FROM characters WHERE user_id = p_user_id ORDER BY created_at LIMIT 1;
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

CREATE OR REPLACE FUNCTION public.send_card_mail(p_user_id uuid, p_recipient_char_id text, p_item_name text, p_item_type text, p_quantity integer, p_price integer, p_stats jsonb)
RETURNS jsonb LANGUAGE plpgsql AS $function$
DECLARE
  v_sender characters%ROWTYPE; v_recipient characters%ROWTYPE; v_inv inventory%ROWTYPE;
  v_qty integer := floor(p_quantity)::int; v_price integer := GREATEST(0, floor(p_price)::int); v_mail_id uuid;
BEGIN
  IF p_user_id IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_authed'); END IF;
  IF v_qty < 1 THEN RETURN jsonb_build_object('ok', false, 'reason', 'bad_quantity'); END IF;
  SELECT * INTO v_sender FROM characters WHERE user_id = p_user_id ORDER BY created_at LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'no_character'); END IF;
  SELECT * INTO v_recipient FROM characters WHERE id = p_recipient_char_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'no_recipient'); END IF;
  IF v_recipient.user_id = p_user_id THEN RETURN jsonb_build_object('ok', false, 'reason', 'self'); END IF;
  SELECT * INTO v_inv FROM inventory WHERE character_id = v_sender.id AND item_name = p_item_name ORDER BY quantity DESC LIMIT 1;
  IF NOT FOUND OR v_inv.quantity < v_qty THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_enough'); END IF;
  IF (v_inv.stats->>'equipped') = 'true' AND (v_inv.quantity - v_qty) < 1 THEN RETURN jsonb_build_object('ok', false, 'reason', 'socketed_reserve'); END IF;
  UPDATE inventory SET quantity = quantity - v_qty WHERE id = v_inv.id;
  DELETE FROM inventory WHERE id = v_inv.id AND quantity <= 0;
  INSERT INTO card_mailbox (sender_char_id, sender_user_id, sender_name, recipient_char_id, recipient_user_id, item_name, item_type, quantity, price, stats)
  VALUES (v_sender.id, p_user_id, v_sender.name, v_recipient.id, v_recipient.user_id, p_item_name, COALESCE(p_item_type, 'card'), v_qty, v_price, COALESCE(p_stats, '{}'::jsonb))
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
    VALUES (v_recipient.id, v_mail.item_name, v_mail.item_type, v_mail.quantity, COALESCE(v_mail.stats, '{}'::jsonb));
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
