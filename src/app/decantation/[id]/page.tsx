"use client";

import React, { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAppStore } from '@/store/appStore';
import DecantationForm from '@/components/decantation/DecantationForm';
import { Loader2, CheckCircle2, AlertCircle, Trash2, Printer } from 'lucide-react';

export default function ViewDecantation() {
  const router = useRouter();
  const params = useParams();
  const { user } = useAppStore();

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchDecantation();
  }, [params.id]);

  const fetchDecantation = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/decantation/${params.id}`);
      if (!res.ok) throw new Error('Failed to fetch decantation');
      const json = await res.json();
      setData(json);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async (formData: any) => {
    setActionLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/decantation/${params.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error || 'Failed to update');
      }

      const updated = await res.json();
      setData(updated);
      router.refresh();
      alert('Updated successfully!');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleApprove = async () => {
    if (!user || user.role !== 'Admin') return;

    if (!confirm('Are you sure you want to approve this decantation? This will lock the form.')) return;

    setActionLoading(true);
    try {
      const res = await fetch(`/api/decantation/${params.id}/approve`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approved_by: user.id })
      });

      if (!res.ok) throw new Error('Approval failed');

      const updated = await res.json();
      setData(updated);
      router.refresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center text-slate-400">
        <Loader2 className="animate-spin mb-4" size={48} />
        <p className="font-medium">Fetching details...</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-8 text-center">
        <AlertCircle size={48} className="mx-auto mb-4 text-rose-500 opacity-20" />
        <h2 className="text-2xl font-bold text-slate-800">Form Not Found</h2>
        <button onClick={() => router.push('/decantation')} className="mt-4 text-blue-600 font-bold hover:underline">
          Back to List
        </button>
      </div>
    );
  }

  const isPending = data.status === 'Pending';
  const isAdmin = user?.role === 'Admin';
  const canEdit = isPending && user?.role === 'Manager';
  const canApprove = isPending && isAdmin;

  return (
    <div className="p-4 lg:p-8">
      {/* Action Banner */}
      <div className="max-w-5xl mx-auto mb-8 flex flex-wrap items-center justify-between gap-4 p-4 rounded-3xl bg-white border border-slate-100 shadow-sm">
        <div className="flex items-center gap-3">
          <span className={`px-4 py-1.5 rounded-full text-sm font-bold border ${data.status === 'Approved' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-amber-100 text-amber-700 border-amber-200'}`}>
            {data.status}
          </span>
          {data.status === 'Approved' && (
            <div className="text-sm text-slate-500 font-medium">
              Approved by <span className="text-slate-800 font-bold">{data.approver?.name || 'Admin'}</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => window.print()}
            className="p-2.5 bg-slate-100 text-slate-600 rounded-xl hover:bg-slate-200 transition-all flex items-center gap-2 font-bold text-sm"
          >
            <Printer size={18} />
            Print
          </button>

          {canApprove && (
            <button
              onClick={handleApprove}
              disabled={actionLoading}
              className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2.5 rounded-xl font-bold flex items-center gap-2 shadow-lg shadow-emerald-500/20 transition-all disabled:opacity-50"
            >
              {actionLoading ? <Loader2 className="animate-spin" size={20} /> : <CheckCircle2 size={20} />}
              Approve Now
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="max-w-5xl mx-auto mb-6 p-4 bg-red-50 border border-red-200 text-red-600 rounded-2xl flex items-center gap-3">
          <AlertCircle size={20} />
          <span className="font-medium">{error}</span>
        </div>
      )}

      {actionLoading && (
        <div className="fixed inset-0 bg-slate-900/10 backdrop-blur-[2px] z-50 flex items-center justify-center">
          <Loader2 className="animate-spin text-blue-600" size={48} />
        </div>
      )}

      <DecantationForm
        initialData={data}
        onSubmit={handleUpdate}
        isReadOnly={!canEdit}
        onBack={() => router.push('/decantation')}
      />
    </div>
  );
}
