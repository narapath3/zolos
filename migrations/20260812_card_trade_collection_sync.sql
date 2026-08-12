CREATE OR REPLACE FUNCTION public.sync_card_mail_collection()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_card_id text;
BEGIN
  v_card_id := CASE WHEN TG_OP = 'INSERT' THEN NEW.stats->>'card_id'
    ELSE COALESCE(NEW.stats->>'card_id', OLD.stats->>'card_id') END;
  IF v_card_id IS NULL OR v_card_id = '' THEN
    RAISE EXCEPTION 'mail card_id is required';
  END IF;

  IF TG_OP = 'INSERT' THEN
    UPDATE public.character_cards
    SET owned = owned - NEW.quantity
    WHERE character_id = NEW.sender_char_id
      AND card_id = v_card_id
      AND owned >= NEW.quantity;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'not enough authoritative card copies';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.status = 'pending' AND NEW.status = 'claimed' THEN
    INSERT INTO public.character_cards (character_id, card_id, owned, stars, pity)
    VALUES (NEW.recipient_char_id, v_card_id, NEW.quantity, 1, 0)
    ON CONFLICT (character_id, card_id) DO UPDATE
      SET owned = public.character_cards.owned + EXCLUDED.owned;
  ELSIF OLD.status = 'pending' AND NEW.status = 'returned' THEN
    INSERT INTO public.character_cards (character_id, card_id, owned, stars, pity)
    VALUES (NEW.sender_char_id, v_card_id, NEW.quantity, 1, 0)
    ON CONFLICT (character_id, card_id) DO UPDATE
      SET owned = public.character_cards.owned + EXCLUDED.owned;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS card_mail_collection_insert ON public.card_mailbox;
CREATE TRIGGER card_mail_collection_insert
BEFORE INSERT ON public.card_mailbox
FOR EACH ROW EXECUTE FUNCTION public.sync_card_mail_collection();

DROP TRIGGER IF EXISTS card_mail_collection_resolve ON public.card_mailbox;
CREATE TRIGGER card_mail_collection_resolve
AFTER UPDATE OF status ON public.card_mailbox
FOR EACH ROW EXECUTE FUNCTION public.sync_card_mail_collection();

REVOKE ALL ON FUNCTION public.sync_card_mail_collection() FROM PUBLIC, anon, authenticated;

-- Mail created before this trigger already removed inventory copies but did
-- not reserve them in character_cards. Reconcile those pending parcels once.
WITH pending AS (
  SELECT sender_char_id, stats->>'card_id' AS card_id, SUM(quantity)::integer AS quantity
  FROM public.card_mailbox
  WHERE status = 'pending' AND COALESCE(stats->>'card_id', '') <> ''
  GROUP BY sender_char_id, stats->>'card_id'
)
UPDATE public.character_cards AS cc
SET owned = GREATEST(0, cc.owned - pending.quantity)
FROM pending
WHERE cc.character_id = pending.sender_char_id AND cc.card_id = pending.card_id;
