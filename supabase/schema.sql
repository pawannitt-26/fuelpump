-- 1. Create enum for User Roles
CREATE TYPE user_role AS ENUM ('Admin', 'Manager');

-- 2. Create Users Table
CREATE TABLE public.users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    role user_role NOT NULL DEFAULT 'Manager',
    email TEXT UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Create Products Table (MS, HSD)
CREATE TABLE public.products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT UNIQUE NOT NULL, -- 'MS' or 'HSD'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Seed initial products
INSERT INTO public.products (name) VALUES ('MS'), ('HSD');

-- 4. Create Rates Table
CREATE TABLE public.rates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
    rate NUMERIC(10, 2) NOT NULL,
    effective_date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(product_id, effective_date)
);

-- 5. Create Shifts Table
CREATE TABLE public.shifts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shift_date DATE NOT NULL DEFAULT CURRENT_DATE,
    shift_number INTEGER NOT NULL CHECK (shift_number IN (1, 2)),
    manager_id UUID REFERENCES public.users(id) ON DELETE RESTRICT,
    status TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Approved')),
    locked_flag BOOLEAN NOT NULL DEFAULT FALSE,
    approved_at TIMESTAMP WITH TIME ZONE,
    approved_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    ms_receipt NUMERIC(12, 2) DEFAULT 0,
    hsd_receipt NUMERIC(12, 2) DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(shift_date, shift_number)
);

-- 6. Create Shift Entries (Nozzle Readings)
CREATE TABLE public.shift_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shift_id UUID REFERENCES public.shifts(id) ON DELETE CASCADE,
    product_id UUID REFERENCES public.products(id) ON DELETE RESTRICT,
    nozzle_no TEXT NOT NULL,
    opening_meter NUMERIC(12, 2) NOT NULL,
    closing_meter NUMERIC(12, 2) NOT NULL,
    testing_qty NUMERIC(10, 2) DEFAULT 0,
    rate NUMERIC(10, 2) NOT NULL,
    sale_qty NUMERIC(12, 2) GENERATED ALWAYS AS (closing_meter - opening_meter - testing_qty) STORED,
    amount NUMERIC(12, 2) GENERATED ALWAYS AS ((closing_meter - opening_meter - testing_qty) * rate) STORED,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 7. Create Shift Summaries
-- Captures the aggregate and the manual cash/online inputs
CREATE TABLE public.shift_summaries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shift_id UUID UNIQUE REFERENCES public.shifts(id) ON DELETE CASCADE,
    total_ms_qty NUMERIC(12, 2) DEFAULT 0,
    total_hsd_qty NUMERIC(12, 2) DEFAULT 0,
    total_sale_amount NUMERIC(12, 2) DEFAULT 0,
    cash_received NUMERIC(12, 2) DEFAULT 0,
    online_received NUMERIC(12, 2) DEFAULT 0,
    difference NUMERIC(12, 2) GENERATED ALWAYS AS (cash_received + online_received - total_sale_amount) STORED,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 8. Create DSR Reports
CREATE TABLE public.dsr_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dsr_date DATE UNIQUE NOT NULL,
    shift1_id UUID REFERENCES public.shifts(id) ON DELETE RESTRICT,
    shift2_id UUID REFERENCES public.shifts(id) ON DELETE RESTRICT,
    grand_total NUMERIC(12, 2) NOT NULL DEFAULT 0,
    net_balance NUMERIC(12, 2) NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 9. Create Expenses Table 
CREATE TABLE public.expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dsr_id UUID REFERENCES public.dsr_reports(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    amount NUMERIC(12, 2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 10. Audit Logs
CREATE TABLE public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    action TEXT NOT NULL, -- e.g., 'APPROVE_SHIFT', 'EDIT_RATE'
    target_table TEXT NOT NULL,
    target_id UUID NOT NULL,
    details JSONB,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Optional: Enable Row Level Security (RLS)
-- ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
-- (RLS policies will be added later depending on Supabase auth setup)

-- 11. Create Decantations Table
CREATE TABLE public.decantations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    service_provider TEXT NOT NULL,
    challan_no TEXT NOT NULL,
    vehicle_no TEXT NOT NULL,
    invoice_amount_ms NUMERIC(12, 2) DEFAULT 0,
    invoice_amount_hsd NUMERIC(12, 2) DEFAULT 0,
    receipt_ms NUMERIC(12, 2) DEFAULT 0,
    receipt_hsd1 NUMERIC(12, 2) DEFAULT 0,
    receipt_hsd2 NUMERIC(12, 2) DEFAULT 0,
    density_data JSONB DEFAULT '{}'::jsonb,
    nozzle_data JSONB DEFAULT '{}'::jsonb,
    tt_dip_data JSONB DEFAULT '[]'::jsonb,
    tank_dip_data JSONB DEFAULT '{}'::jsonb,
    status TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Approved')),
    manager_id UUID REFERENCES public.users(id) ON DELETE RESTRICT,
    approved_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);
