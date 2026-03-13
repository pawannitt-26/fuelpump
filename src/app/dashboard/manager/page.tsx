"use client";

import { useAppStore } from '@/store/appStore';
import { t } from '@/lib/i18n';
import Link from 'next/link';
import { FileText, Clock, CheckCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

interface Shift {
    id: string;
    shift_date: string;
    shift_number: number;
    status: string;
}

export default function ManagerDashboard() {
    const { language, user } = useAppStore();
    const [shifts, setShifts] = useState<Shift[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchShifts() {
            if (!user) return;
            try {
                const { data, error } = await supabase
                    .from('shifts')
                    .select('id, shift_date, shift_number, status')
                    .eq('manager_id', user.id)
                    .order('shift_date', { ascending: false })
                    .order('shift_number', { ascending: false });

                if (error) throw error;
                setShifts(data || []);
            } catch (err) {
                console.error('Error fetching shifts:', err);
            } finally {
                setLoading(false);
            }
        }

        fetchShifts();
    }, [user]);

    const pendingCount = shifts.filter(s => s.status === 'Pending').length;
    const approvedCount = shifts.filter(s => s.status === 'Approved').length;

    return (
        <div className="max-w-5xl mx-auto space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold text-slate-800 m-0">{t('dashboard', language)}</h1>
                <Link
                    href="/shift/entry"
                    className="btn btn-primary shadow-md shadow-blue-500/20"
                >
                    <FileText size={18} />
                    {t('newShift', language)}
                </Link>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <div className="card border-t-4 border-t-blue-500 flex flex-col items-center justify-center p-8 text-center bg-gradient-to-b from-white to-blue-50/30">
                    <Clock className="text-blue-500 mb-4" size={40} />
                    <h3 className="text-slate-500 font-medium">{t('pending', language)} Shifts</h3>
                    <p className="text-4xl font-bold text-slate-800 mt-2">{loading ? '-' : pendingCount}</p>
                </div>

                <div className="card border-t-4 border-t-green-500 flex flex-col items-center justify-center p-8 text-center bg-gradient-to-b from-white to-green-50/30">
                    <CheckCircle className="text-green-500 mb-4" size={40} />
                    <h3 className="text-slate-500 font-medium">All Time {t('approved', language)}</h3>
                    <p className="text-4xl font-bold text-slate-800 mt-2">{loading ? '-' : approvedCount}</p>
                </div>
            </div>

            <div className="card p-0 overflow-hidden">
                <div className="p-6 border-b border-slate-100 bg-slate-50/50">
                    <h2 className="text-lg font-semibold text-slate-800 m-0">Recent Shifts</h2>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-slate-50 text-slate-500 font-medium">
                            <tr>
                                <th className="px-6 py-4">{t('date', language)}</th>
                                <th className="px-6 py-4">{t('shift', language)}</th>
                                <th className="px-6 py-4">Status</th>
                                <th className="px-6 py-4 text-right">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {loading && <tr><td colSpan={4} className="text-center py-8 text-slate-500">Loading...</td></tr>}
                            {!loading && shifts.length === 0 && <tr><td colSpan={4} className="text-center py-8 text-slate-500">No shifts recorded yet.</td></tr>}
                            {!loading && shifts.map(s => (
                                <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                                    <td className="px-6 py-4 text-slate-700">{s.shift_date}</td>
                                    <td className="px-6 py-4 text-slate-700">Shift {s.shift_number}</td>
                                    <td className="px-6 py-4">
                                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full font-medium ${s.status === 'Approved' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                                            }`}>
                                            {s.status === 'Approved' ? t('approved', language) : t('pending', language)}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <Link
                                            href={s.status === 'Pending' ? `/shift/entry?id=${s.id}` : `/shift/review/${s.id}`}
                                            className="text-blue-600 hover:text-blue-800 font-medium"
                                        >
                                            {s.status === 'Pending' ? 'Edit' : 'View PDF'}
                                        </Link>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
