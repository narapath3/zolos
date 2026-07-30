-- Admin-privileged inventory grant/remove for ANY character (bypasses the
-- normal ownership check after verifying the caller is an admin). p_qty > 0
-- adds, p_qty < 0 removes (deletes the row if it hits <= 0).
CREATE OR REPLACE FUNCTION public.admin_give_item(p_user_id uuid, target_char_id text, p_item_name text, p_item_type text, p_qty integer, p_stats jsonb)
RETURNS jsonb LANGUAGE plpgsql AS $function$
DECLARE caller_is_admin boolean; v_inv inventory%ROWTYPE; v_new integer;
BEGIN
  SELECT is_admin INTO caller_is_admin FROM public.profiles WHERE id = p_user_id;
  IF caller_is_admin IS NOT TRUE THEN RAISE EXCEPTION 'Unauthorized: admin only' USING ERRCODE = '42501'; END IF;
  IF target_char_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.characters WHERE id = target_char_id) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_character');
  END IF;
  SELECT * INTO v_inv FROM public.inventory WHERE character_id = target_char_id AND item_name = p_item_name ORDER BY quantity DESC LIMIT 1;
  IF FOUND THEN
    v_new := v_inv.quantity + p_qty;
    IF v_new <= 0 THEN
      DELETE FROM public.inventory WHERE id = v_inv.id;
      RETURN jsonb_build_object('ok', true, 'removed', true, 'item_name', p_item_name);
    END IF;
    UPDATE public.inventory SET quantity = v_new, stats = COALESCE(p_stats, stats) WHERE id = v_inv.id;
    RETURN jsonb_build_object('ok', true, 'item_name', p_item_name, 'quantity', v_new);
  END IF;
  IF p_qty <= 0 THEN RETURN jsonb_build_object('ok', false, 'reason', 'nothing_to_remove'); END IF;
  INSERT INTO public.inventory (character_id, item_name, item_type, quantity, stats)
  VALUES (target_char_id, p_item_name, COALESCE(p_item_type, 'material'), p_qty, COALESCE(p_stats, '{}'::jsonb));
  RETURN jsonb_build_object('ok', true, 'item_name', p_item_name, 'quantity', p_qty);
END $function$;
