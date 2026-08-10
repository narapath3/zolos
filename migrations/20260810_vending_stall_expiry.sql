-- Player vending stalls last at most 48 hours. The Node scheduler performs the
-- atomic item return; these indexes keep its once-per-minute scan inexpensive.
UPDATE public.vending_stalls
SET updated_at = created_at
WHERE updated_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_vending_stalls_expiry
ON public.vending_stalls ((COALESCE(updated_at, created_at)));

CREATE INDEX IF NOT EXISTS idx_marketplace_seller
ON public.marketplace (seller_id);
