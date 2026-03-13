-- Add table to track nozzleman and payments per machine side (A: nozzles 1&3, B: nozzles 2&4)
CREATE TABLE IF NOT EXISTS public.shift_sides (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shift_id UUID REFERENCES public.shifts(id) ON DELETE CASCADE,
    machine TEXT NOT NULL, -- 'Front' or 'Back'
    side TEXT NOT NULL, -- 'A (1 & 3)' or 'B (2 & 4)'
    nozzle_man TEXT,
    cash_received NUMERIC(12, 2) DEFAULT 0,
    online_received NUMERIC(12, 2) DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Note: No RLS enabled for demo ease, or disable if it inherits any issues
ALTER TABLE public.shift_sides DISABLE ROW LEVEL SECURITY;
