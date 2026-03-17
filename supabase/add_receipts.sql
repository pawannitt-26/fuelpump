-- Migration: Add fuel receipt columns to shifts table
ALTER TABLE public.shifts 
ADD COLUMN ms_receipt NUMERIC(12, 2) DEFAULT 0,
ADD COLUMN hsd_receipt NUMERIC(12, 2) DEFAULT 0;
