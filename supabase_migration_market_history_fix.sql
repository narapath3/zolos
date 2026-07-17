-- ============================================================
-- Fix: marketplace / vending-stall purchases failed on EVERY buy
-- ============================================================
-- Applied to production 2026-07-17.
--
-- Symptom: buying any item from a player's stall failed with a generic
-- "ซื้อไม่สำเร็จ กรุณาลองใหม่อีกครั้ง".
--
-- Root cause (found in the Postgres logs):
--   ERROR: null value in column "item_id" of relation "market_history"
--          violates not-null constraint
-- The buy_market_item() RPC finishes a purchase by logging to market_history
-- with INSERT (item_name, quantity, price). market_history.item_id was NOT NULL
-- with no default, so that final insert threw and rolled back the WHOLE
-- transaction (gold move + item delivery + listing removal) — so every purchase
-- silently failed.
--
-- item_id is unused (price history keys on item_name), so make it nullable.

ALTER TABLE public.market_history ALTER COLUMN item_id DROP NOT NULL;
