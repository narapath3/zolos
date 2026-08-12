-- Card refinement belongs to its owner. A claimed card always enters the
-- recipient inventory at one star, while rejected mail retains its original
-- stats so returning it cannot damage the sender's collection.
CREATE OR REPLACE FUNCTION public.claim_card_mail(p_mail_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_mail public.card_mailbox%ROWTYPE;
  v_recipient public.characters%ROWTYPE;
  v_received_stats jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'not_authed');
  END IF;

  SELECT * INTO v_mail FROM public.card_mailbox WHERE id = p_mail_id FOR UPDATE;
  IF NOT FOUND OR v_mail.status <> 'pending' THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'gone');
  END IF;

  SELECT * INTO v_recipient FROM public.characters WHERE id = v_mail.recipient_char_id;
  IF NOT FOUND OR v_recipient.user_id <> auth.uid() THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'not_yours');
  END IF;

  IF v_mail.price > 0 THEN
    IF v_recipient.gold < v_mail.price THEN
      RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'not_enough_gold');
    END IF;
    UPDATE public.characters SET gold = gold - v_mail.price, updated_at = now() WHERE id = v_recipient.id;
    UPDATE public.characters SET gold = LEAST(gold + v_mail.price, 500000000), updated_at = now()
      WHERE id = v_mail.sender_char_id;
  END IF;

  v_received_stats := pg_catalog.jsonb_build_object(
    'card_id', v_mail.stats->>'card_id',
    'card_stars', 1,
    'card_pity', 0
  );
  UPDATE public.inventory SET quantity = quantity + v_mail.quantity
    WHERE character_id = v_recipient.id AND item_name = v_mail.item_name;
  IF NOT FOUND THEN
    INSERT INTO public.inventory (character_id, item_name, item_type, quantity, stats)
    VALUES (v_recipient.id, v_mail.item_name, v_mail.item_type, v_mail.quantity, v_received_stats);
  END IF;

  UPDATE public.card_mailbox SET status = 'claimed', resolved_at = now() WHERE id = p_mail_id;
  RETURN pg_catalog.jsonb_build_object(
    'ok', true, 'item_name', v_mail.item_name, 'item_type', v_mail.item_type,
    'quantity', v_mail.quantity, 'price', v_mail.price, 'sender_name', v_mail.sender_name,
    'recipient_gold', v_recipient.gold - CASE WHEN v_mail.price > 0 THEN v_mail.price ELSE 0 END
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.claim_card_mail(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.claim_card_mail(uuid) TO authenticated;
