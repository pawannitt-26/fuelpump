"use client";

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAppStore } from '@/store/appStore';
import DecantationForm from '@/components/decantation/DecantationForm';
import { Loader2 } from 'lucide-react';

export default function NewDecantation() {
  const router = useRouter();
  const { user } = useAppStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (formData: any) => {
    if (!user) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const res = await fetch('/api/decantation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          manager_id: user.id
        })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save decantation form');
      }

      router.push('/decantation');
      router.refresh();
    } catch (err: any) {
      console.error('Error saving decantation:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 lg:p-8">
      {error && (
        <div className="max-w-5xl mx-auto mb-6 p-4 bg-red-50 border border-red-200 text-red-600 rounded-2xl flex items-center gap-3">
          <div className="p-2 bg-red-100 rounded-full text-red-600 font-bold text-xs">!</div>
          <span className="font-medium">{error}</span>
        </div>
      )}
      
      {loading && (
        <div className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-white p-8 rounded-3xl shadow-xl flex flex-col items-center">
            <Loader2 className="animate-spin text-blue-600 mb-4" size={40} />
            <p className="font-bold text-slate-800 text-lg">Saving Form...</p>
            <p className="text-slate-500 text-sm">Please wait while we record the data.</p>
          </div>
        </div>
      )}

      <DecantationForm 
        onSubmit={handleSubmit} 
        onBack={() => router.push('/decantation')}
      />
    </div>
  );
}
