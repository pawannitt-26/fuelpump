"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAppStore } from '@/store/appStore';
import { Plus, Eye, Clock, CheckCircle, ChevronRight, Filter, Search, Loader2 } from 'lucide-react';
import { format } from 'date-fns';

export default function DecantationListing() {
  const { user } = useAppStore();
  const [decantations, setDecantations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('All');

  useEffect(() => {
    fetchDecantations();
  }, [filter]);

  const fetchDecantations = async () => {
    setLoading(true);
    try {
      const url = filter === 'All' ? '/api/decantation' : `/api/decantation?status=${filter}`;
      const res = await fetch(url);
      const data = await res.json();
      if (Array.isArray(data)) {
        setDecantations(data);
      }
    } catch (error) {
      console.error('Error fetching decantations:', error);
    } finally {
      setLoading(false);
    }
  };

  const statusColors = {
    'Pending': 'bg-amber-100 text-amber-700 border-amber-200',
    'Approved': 'bg-emerald-100 text-emerald-700 border-emerald-200'
  };

  return (
    <div className="p-4 lg:p-8 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-800 tracking-tight">Decantations</h1>
          <p className="text-slate-500 mt-1">Manage and view fuel unloading records</p>
        </div>
        <Link
          href="/decantation/new"
          className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-2xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20 transition-all hover:-translate-y-0.5 active:translate-y-0"
        >
          <Plus size={20} />
          New Decantation
        </Link>
      </div>

      <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-4 border-b border-slate-50 bg-slate-50/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex p-1 bg-white border border-slate-200 rounded-xl w-fit">
            {['All', 'Pending', 'Approved'].map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-all ${filter === f ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
              >
                {f}
              </button>
            ))}
          </div>

          <div className="relative w-full sm:max-w-xs md:max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              type="text"
              placeholder="Search by challan or vehicle..."
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition-all text-sm"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-400">
              <Loader2 className="animate-spin mb-2" size={32} />
              <p>Loading decantations...</p>
            </div>
          ) : decantations.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-400">
              <Clock size={48} className="mb-4 opacity-20" />
              <p className="text-lg font-medium">No records found</p>
              <p className="text-sm">Try changing filters or create a new one.</p>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50/50">
                  <th className="px-6 py-4 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">Date & Challan</th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">Vehicle & Provider</th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">Quantities (MS/HSD)</th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-4 text-right text-xs font-bold text-slate-400 uppercase tracking-wider">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {decantations.map((d) => (
                  <tr key={d.id} className="hover:bg-slate-50/80 transition-colors group">
                    <td className="px-6 py-5">
                      <div className="font-bold text-slate-800">{format(new Date(d.date), 'dd MMM yyyy')}</div>
                      <div className="text-xs text-slate-500 mt-0.5">Challan: {d.challan_no}</div>
                    </td>
                    <td className="px-6 py-5">
                      <div className="font-semibold text-slate-700">{d.vehicle_no}</div>
                      <div className="text-xs text-slate-400 mt-0.5">{d.service_provider}</div>
                    </td>
                    <td className="px-6 py-5">
                      <div className="flex gap-2">
                        <span className="px-2 py-0.5 bg-blue-50 text-blue-600 rounded text-xs font-bold">MS: {d.receipt_ms}</span>
                        <span className="px-2 py-0.5 bg-emerald-50 text-emerald-600 rounded text-xs font-bold">HSD: {Number(d.receipt_hsd1) + Number(d.receipt_hsd2)}</span>
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      <span className={`px-3 py-1 rounded-full text-xs font-bold border ${statusColors[d.status as keyof typeof statusColors] || ''}`}>
                        {d.status}
                      </span>
                    </td>
                    <td className="px-6 py-5 text-right">
                      <Link
                        href={`/decantation/${d.id}`}
                        className="inline-flex items-center gap-1 text-blue-600 font-bold text-sm hover:underline"
                      >
                        {d.status === 'Pending' && user?.role === 'Manager' ? 'Edit' : 'View'}
                        <ChevronRight size={16} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
