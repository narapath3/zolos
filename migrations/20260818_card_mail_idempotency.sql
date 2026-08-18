-- ZOLOS card mail idempotency hardening.
-- A retry with the same sender/request key must return the original escrow.

ALTER TABLE public.card_mailbox
  ADD COLUMN IF NOT EXISTS request_id text;

CREATE UNIQUE INDEX IF NOT EXISTS card_mailbox_sender_request_uidx
  ON public.card_mailbox (sender_user_id, request_id)
  WHERE request_id IS NOT NULL;

DROP FUNCTION IF EXISTS public.send_card_mail(text, text, text, integer, integer, jsonb);

CREATE OR REPLACE FUNCTION public.send_card_mail(
  p_recipient_char_id text,
  p_item_name text,
  p_item_type text,
  p_quantity integer,
  p_price integer,
  p_stats jsonb,
  p_request_id text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_sender    public.characters%ROWTYPE;
  v_recipient public.characters%ROWTYPE;
  v_inv       public.inventory%ROWTYPE;
  v_existing  public.card_mailbox%ROWTYPE;
  v_qty       integer := floor(p_quantity)::int;
  v_price     integer := GREATEST(0, floor(p_price)::int);
  v_mail_id   uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_authed');
  END IF;
  IF p_request_id IS NULL OR p_request_id !~ '^[A-Za-z0-9:_-]{1,160}$' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_request');
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(auth.uid()::text || ':' || p_request_id, 0)
  );
  SELECT * INTO v_existing FROM public.card_mailbox
    WHERE sender_user_id = auth.uid() AND request_id = p_request_id;
  IF FOUND THEN
    RETURN jsonb_build_object('ok', true, 'mail_id', v_existing.id,
      'recipient_char_id', v_existing.recipient_char_id, 'idempotent_replay', true);
  END IF;

  IF v_qty < 1 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'bad_quantity');
  END IF;
  SELECT * INTO v_sender FROM public.characters
    WHERE user_id = auth.uid() ORDER BY created_at LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_character');
  END IF;
  SELECT * INTO v_recipient FROM public.characters WHERE id = p_recipient_char_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_recipient');
  END IF;
  IF v_recipient.user_id = auth.uid() THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'self');
  END IF;

  SELECT * INTO v_inv FROM public.inventory
    WHERE character_id = v_sender.id AND item_name = p_item_name
    ORDER BY quantity DESC LIMIT 1 FOR UPDATE;
  IF NOT FOUND OR v_inv.quantity < v_qty THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_enough');
  END IF;
  IF (v_inv.stats->>'equipped') = 'true' AND (v_inv.quantity - v_qty) < 1 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'socketed_reserve');
  END IF;

  UPDATE public.inventory SET quantity = quantity - v_qty WHERE id = v_inv.id;
  DELETE FROM public.inventory WHERE id = v_inv.id AND quantity <= 0;
  INSERT INTO public.card_mailbox (
    sender_char_id, sender_user_id, sender_name,
    recipient_char_id, recipient_user_id,
    item_name, item_type, quantity, price, stats, request_id
  ) VALUES (
    v_sender.id, auth.uid(), v_sender.name,
    v_recipient.id, v_recipient.user_id,
    p_item_name, COALESCE(p_item_type, 'card'), v_qty, v_price,
    COALESCE(p_stats, '{}'::jsonb), p_request_id
  ) RETURNING id INTO v_mail_id;

  RETURN jsonb_build_object('ok', true, 'mail_id', v_mail_id,
    'recipient_name', v_recipient.name, 'recipient_char_id', v_recipient.id);
END $function$;

REVOKE EXECUTE ON FUNCTION public.send_card_mail(text, text, text, integer, integer, jsonb, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.send_card_mail(text, text, text, integer, integer, jsonb, text) TO authenticated;
