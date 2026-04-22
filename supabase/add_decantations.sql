-- Create Decantations Table
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
