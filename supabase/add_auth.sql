-- Add password hash to users
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS password_hash TEXT;

-- For demo purposes, we will set simple passwords 
-- In a real app we would use pgcrypto or Supabase Auth, but since we are using plain SQL inserts:
-- manager: 'manager123'
-- admin: 'admin123'

-- To make things easy, we will just store plain text for the sake of the prototype since the user specifically didn't ask for full Supabase Auth setup, just a simple credential lock.
-- Re-naming column to 'password' for clarity of this prototype
ALTER TABLE public.users RENAME COLUMN password_hash TO password;

-- Create default admin if not exists
INSERT INTO public.users (name, email, role, password)
VALUES ('System Admin', 'admin@demo.com', 'Admin', 'admin123')
ON CONFLICT (email) DO UPDATE SET password = 'admin123';

-- Create default manager if not exists
INSERT INTO public.users (name, email, role, password)
VALUES ('Demo Manager', 'manager@demo.com', 'Manager', 'manager123')
ON CONFLICT (email) DO UPDATE SET password = 'manager123';
