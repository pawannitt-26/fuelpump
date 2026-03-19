-- Migration: Add description to shift_sides table
ALTER TABLE public.shift_sides ADD COLUMN IF NOT EXISTS description TEXT;
