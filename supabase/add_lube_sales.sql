-- Migration: Add lube_sales to shift_sides table
ALTER TABLE public.shift_sides ADD COLUMN IF NOT EXISTS lube_sales NUMERIC(12, 2) DEFAULT 0;
