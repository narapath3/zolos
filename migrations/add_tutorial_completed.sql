ALTER TABLE public.characters
ADD COLUMN IF NOT EXISTS tutorial_completed BOOLEAN DEFAULT false;
