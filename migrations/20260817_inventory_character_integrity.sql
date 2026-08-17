-- ZOLOS data-integrity hardening
--
-- Run this migration only after taking a database backup. It is idempotent:
-- it adds the missing character columns, consolidates duplicate inventory rows,
-- removes empty stacks, and then enforces one row per character/item.

BEGIN;

-- The client/server save payload includes these equipment columns.
ALTER TABLE public.characters
    ADD COLUMN IF NOT EXISTS shield TEXT,
    ADD COLUMN IF NOT EXISTS armor TEXT;

-- Consolidate duplicate inventory rows before creating the unique constraint.
-- Quantity is summed; item_type/stats remain from the most recently-created row.
WITH ranked AS (
    SELECT
        id,
        SUM(quantity) OVER (PARTITION BY character_id, item_name) AS total_quantity,
        ROW_NUMBER() OVER (
            PARTITION BY character_id, item_name
            ORDER BY created_at DESC NULLS LAST, id DESC
        ) AS row_number
    FROM public.inventory
)
UPDATE public.inventory AS inventory
SET quantity = ranked.total_quantity
FROM ranked
WHERE inventory.id = ranked.id
  AND ranked.row_number = 1;

WITH ranked AS (
    SELECT
        id,
        ROW_NUMBER() OVER (
            PARTITION BY character_id, item_name
            ORDER BY created_at DESC NULLS LAST, id DESC
        ) AS row_number
    FROM public.inventory
)
DELETE FROM public.inventory AS inventory
USING ranked
WHERE inventory.id = ranked.id
  AND ranked.row_number > 1;

-- Empty stacks have no useful persisted state and should not remain queryable.
DELETE FROM public.inventory
WHERE quantity <= 0;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'inventory_character_item_unique'
          AND conrelid = 'public.inventory'::regclass
    ) THEN
        ALTER TABLE public.inventory
            ADD CONSTRAINT inventory_character_item_unique
            UNIQUE (character_id, item_name);
    END IF;
END $$;

COMMIT;
