"use client";

import { useAppStore } from '@/store/appStore';
import { useRouter } from 'next/navigation';
import { ShieldCheck, UserCog, Loader2, LogIn, AlertCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export default function Home() {
  const { user, setUser } = useAppStore();
  const router = useRouter();

  const [role, setRole] = useState<'Admin' | 'Manager'>('Manager');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  // On page load, if user exists, redirect to dashboard
  useEffect(() => {
    setMounted(true);
    if (user) {
      router.replace(`/dashboard/${user.role.toLowerCase()}`);
    }
  }, [user, router]);

  if (!mounted) return null;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (!email || !password) {
        throw new Error('Please enter both email and password.');
      }

      // 1. Verify credentials against Supabase
      const { data: users, error: dbError } = await supabase
        .from('users')
        .select('*')
        .eq('email', email)
        .eq('role', role)
        .eq('password', password)
        .limit(1);

      if (dbError) throw dbError;

      const loggedInUser = users && users.length > 0 ? users[0] : null;

      if (!loggedInUser) {
        throw new Error('Invalid email or password for the selected role.');
      }

      // 2. Set into Zustand and redirect
      setUser({
        id: loggedInUser.id,
        name: loggedInUser.name,
        role: loggedInUser.role as 'Admin' | 'Manager'
      });

      router.push(`/dashboard/${role.toLowerCase()}`);

    } catch (err: any) {
      console.error('Login error:', err);
      setError(err.message || 'Error logging in. Make sure Supabase is configured and tables exist.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center px-4 py-8 safe-area-bottom">
      <div className="text-center mb-6 sm:mb-10 max-w-lg">
        <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-slate-800 mb-3 sm:mb-4 tracking-tight">
          Fuel Station <span className="text-blue-600">DSR</span>
        </h1>
      </div>

      <div className="w-full max-w-md card p-5 sm:p-8 shadow-xl shadow-blue-900/5 border-t-4 border-t-blue-500">

        {/* Role Toggle */}
        <div className="flex p-1 bg-slate-100 rounded-lg mb-6 sm:mb-8">
          <button
            type="button"
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-semibold rounded-md transition-all ${role === 'Manager'
              ? 'bg-white text-blue-600 shadow-sm'
              : 'text-slate-500 hover:text-slate-700'
              }`}
            onClick={() => setRole('Manager')}
          >
            <UserCog size={18} /> Manager
          </button>
          <button
            type="button"
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-semibold rounded-md transition-all ${role === 'Admin'
              ? 'bg-white text-indigo-600 shadow-sm'
              : 'text-slate-500 hover:text-slate-700'
              }`}
            onClick={() => setRole('Admin')}
          >
            <ShieldCheck size={18} /> Admin
          </button>
        </div>

        <form onSubmit={handleLogin} className="space-y-4 sm:space-y-5">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg flex items-start gap-2">
              <AlertCircle size={16} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">Email Address</label>
            <input
              type="email"
              required
              placeholder={role === 'Manager' ? 'manager@gmail.com' : 'admin@gmail.com'}
              className="w-full px-4 py-3 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-slate-800 bg-slate-50 text-base"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">Password</label>
            <input
              type="password"
              required
              placeholder="Enter your password"
              className="w-full px-4 py-3 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-slate-800 bg-slate-50 text-base"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className={`w-full py-3.5 px-4 rounded-lg text-white font-bold text-base sm:text-lg flex items-center justify-center gap-2 transition-all shadow-lg hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-70 disabled:hover:translate-y-0 min-h-[48px] ${role === 'Admin'
              ? 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-500/30'
              : 'bg-blue-600 hover:bg-blue-700 shadow-blue-500/30'
              }`}
          >
            {loading ? <Loader2 size={22} className="animate-spin" /> : <LogIn size={22} />}
            Sign In as {role}
          </button>
        </form>
      </div>
    </div>
  );
}
