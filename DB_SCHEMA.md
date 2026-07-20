# Inventory Table Schema

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | gen_random_uuid() |
| character_id | text | NO | - |
| item_name | text | NO | - |
| item_type | text | NO | - |
| quantity | integer | NO | 1 |
| stats | jsonb | NO | '{}'::jsonb |
| created_at | timestamptz | NO | now() |

Foreign key: inventory.character_id -> characters.id

RLS: enabled
