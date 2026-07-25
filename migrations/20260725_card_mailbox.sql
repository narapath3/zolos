-- ============================================================
-- Card Mailbox — offline P2P card delivery (escrow)
-- ============================================================
-- Lets a player send a card to another player by UID even when the
-- recipient is offline. The card is escrowed (removed from the sender's
-- inventory) the moment it is sent, waits in card_mailbox, and is delivered
-- when the recipient claims it. A price (0 = free gift) is settled at claim
-- time, moving Zeny recipient -> sender atomically (mirrors buy_market_item).
--
-- Writes go only through the SECURITY DEFINER RPCs below; RLS grants players
-- read-only visibility of the mail they sent or received.

CREATE TABLE IF NOT EXISTS public.card_mailbox (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_char_id    text        NOT NULL,
  sender_user_id    uuid        NOT NULL,
  sender_name       text        NOT NULL,
  recipient_char_id text        NOT NULL,
  recipient_user_id uuid        NOT NULL,
  item_name         text        NOT NULL,
  item_type         text        NOT NULL DEFAULT 'card',
  quantity          integer     NOT NULL CHECK (quantity > 0),
  price             integer     NOT NULL DEFAULT 0 CHECK (price >= 0),
  stats             jsonb       NOT NULL DEFAULT '{}'::jsonb,
  status            text        NOT NULL DEFAULT 'pending',  -- pending | claimed | returned
  created_at        timestamptz NOT NULL DEFAULT now(),
  resolved_at       timestamptz
);

CREATE INDEX IF NOT EXISTS card_mailbox_recipient_idx ON public.card_mailbox (recipient_user_id, status);
CREATE INDEX IF NOT EXISTS card_mailbox_sender_idx    ON public.card_mailbox (sender_user_id, status);

ALTER TABLE public.card_mailbox ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS card_mailbox_select_own ON public.card_mailbox;
CREATE POLICY card_mailbox_select_own ON public.card_mailbox
  FOR SELECT USING (recipient_user_id = auth.uid() OR sender_user_id = auth.uid());

-- ------------------------------------------------------------
-- send_card_mail: escrow a card into the recipient's mailbox
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.send_card_mail(
  p_recipient_char_id text,
  p_item_name         text,
  p_item_type         text,
  p_quantity          integer,
  p_price             integer,
  p_stats             jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_sender    characters%ROWTYPE;
  v_recipient characters%ROWTYPE;
  v_inv       inventory%ROWTYPE;
  v_qty       integer := floor(p_quantity)::int;
  v_price     integer := GREATEST(0, floor(p_price)::int);
  v_mail_id   uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_authed');
  END IF;
  IF v_qty < 1 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'bad_quantity');
  END IF;

  SELECT * INTO v_sender FROM characters WHERE user_id = auth.uid() ORDER BY created_at LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_character');
  END IF;

  SELECT * INTO v_recipient FROM characters WHERE id = p_recipient_char_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_recipient');
  END IF;
  IF v_recipient.user_id = auth.uid() THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'self');
  END IF;

  -- Sender must actually own enough copies to give away.
  SELECT * INTO v_inv FROM inventory
    WHERE character_id = v_sender.id AND item_name = p_item_name
    ORDER BY quantity DESC LIMIT 1;
  IF NOT FOUND OR v_inv.quantity < v_qty THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_enough');
  END IF;
  -- A socketed card keeps the one physically-socketed copy reserved.
  IF (v_inv.stats->>'equipped') = 'true' AND (v_inv.quantity - v_qty) < 1 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'socketed_reserve');
  END IF;

  -- Escrow: take the copies out of the sender's inventory now.
  UPDATE inventory SET quantity = quantity - v_qty WHERE id = v_inv.id;
  DELETE FROM inventory WHERE id = v_inv.id AND quantity <= 0;

  INSERT INTO card_mailbox (
    sender_char_id, sender_user_id, sender_name,
    recipient_char_id, recipient_user_id,
    item_name, item_type, quantity, price, stats
  ) VALUES (
    v_sender.id, auth.uid(), v_sender.name,
    v_recipient.id, v_recipient.user_id,
    p_item_name, COALESCE(p_item_type, 'card'), v_qty, v_price, COALESCE(p_stats, '{}'::jsonb)
  ) RETURNING id INTO v_mail_id;

  RETURN jsonb_build_object('ok', true, 'mail_id', v_mail_id,
    'recipient_name', v_recipient.name, 'recipient_char_id', v_recipient.id);
END $function$;

-- ------------------------------------------------------------
-- claim_card_mail: deliver an escrowed card, settling the price
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_card_mail(p_mail_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_mail      card_mailbox%ROWTYPE;
  v_recipient characters%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_authed');
  END IF;

  SELECT * INTO v_mail FROM card_mailbox WHERE id = p_mail_id FOR UPDATE;
  IF NOT FOUND OR v_mail.status <> 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'gone');
  END IF;

  SELECT * INTO v_recipient FROM characters WHERE id = v_mail.recipient_char_id;
  IF NOT FOUND OR v_recipient.user_id <> auth.uid() THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_yours');
  END IF;

  IF v_mail.price > 0 THEN
    IF v_recipient.gold < v_mail.price THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'not_enough_gold');
    END IF;
    UPDATE characters SET gold = gold - v_mail.price, updated_at = now() WHERE id = v_recipient.id;
    UPDATE characters SET gold = LEAST(gold + v_mail.price, 500000000), updated_at = now()
      WHERE id = v_mail.sender_char_id;
  END IF;

  -- Deliver the card (merge with an existing stack, else insert).
  UPDATE inventory SET quantity = quantity + v_mail.quantity
    WHERE character_id = v_recipient.id AND item_name = v_mail.item_name;
  IF NOT FOUND THEN
    INSERT INTO inventory (character_id, item_name, item_type, quantity, stats)
    VALUES (v_recipient.id, v_mail.item_name, v_mail.item_type, v_mail.quantity, COALESCE(v_mail.stats, '{}'::jsonb));
  END IF;

  UPDATE card_mailbox SET status = 'claimed', resolved_at = now() WHERE id = p_mail_id;

  RETURN jsonb_build_object('ok', true,
    'item_name', v_mail.item_name, 'item_type', v_mail.item_type,
    'quantity', v_mail.quantity, 'price', v_mail.price,
    'sender_name', v_mail.sender_name,
    'recipient_gold', v_recipient.gold - CASE WHEN v_mail.price > 0 THEN v_mail.price ELSE 0 END);
END $function$;

-- ------------------------------------------------------------
-- return_card_mail: send an escrowed card back to the sender.
-- Either party may trigger this while the mail is still pending
-- (recipient rejects, or sender cancels).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.return_card_mail(p_mail_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_mail card_mailbox%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_authed');
  END IF;

  SELECT * INTO v_mail FROM card_mailbox WHERE id = p_mail_id FOR UPDATE;
  IF NOT FOUND OR v_mail.status <> 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'gone');
  END IF;
  IF auth.uid() <> v_mail.sender_user_id AND auth.uid() <> v_mail.recipient_user_id THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_yours');
  END IF;

  -- Give the escrowed copies back to the sender.
  UPDATE inventory SET quantity = quantity + v_mail.quantity
    WHERE character_id = v_mail.sender_char_id AND item_name = v_mail.item_name;
  IF NOT FOUND THEN
    INSERT INTO inventory (character_id, item_name, item_type, quantity, stats)
    VALUES (v_mail.sender_char_id, v_mail.item_name, v_mail.item_type, v_mail.quantity, COALESCE(v_mail.stats, '{}'::jsonb));
  END IF;

  UPDATE card_mailbox SET status = 'returned', resolved_at = now() WHERE id = p_mail_id;

  RETURN jsonb_build_object('ok', true, 'item_name', v_mail.item_name, 'quantity', v_mail.quantity);
END $function$;

-- Only signed-in users may call these; anon/public execute is revoked so the
-- linter (and the project's buy_market_item convention) stays satisfied.
REVOKE EXECUTE ON FUNCTION public.send_card_mail(text, text, text, integer, integer, jsonb) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.claim_card_mail(uuid)  FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.return_card_mail(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.send_card_mail(text, text, text, integer, integer, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_card_mail(uuid)  TO authenticated;
GRANT EXECUTE ON FUNCTION public.return_card_mail(uuid) TO authenticated;
