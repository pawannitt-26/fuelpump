"use client";

import { useAppStore } from '@/store/appStore';
import { t } from '@/lib/i18n';
import Link from 'next/link';
import { MoveLeft, CheckCircle, ShieldAlert, Download, Loader2 } from 'lucide-react';
import { useState, useEffect, use } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { generatePDF } from '@/lib/pdf';

export default function ShiftReview({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const { language, user } = useAppStore();
    const router = useRouter();

    const [loading, setLoading] = useState(true);
    const [approving, setApproving] = useState(false);
    const [shiftData, setShiftData] = useState<any>(null);

    useEffect(() => {
        async function fetchShift() {
            try {
                const { data, error } = await supabase
                    .from('shifts')
                    .select(`
            *,
            users!shifts_manager_id_fkey ( name ),
            shift_entries ( *, products(name) ),
            shift_summaries ( * )
          `)
                    .eq('id', id)
                    .single();

                if (error) throw error;

                // Fetch sides separately to bypass potential PostgREST schema cache relationship delays
                const { data: sidesData } = await supabase
                    .from('shift_sides')
                    .select('*')
                    .eq('shift_id', id);

                data.shift_sides = sidesData || [];

                setShiftData(data);
            } catch (err) {
                console.error("Error fetching shift:", err);
            } finally {
                setLoading(false);
            }
        }

        if (id) {
            fetchShift();
        }
    }, [id]);

    if (loading) {
        return <div className="p-20 flex justify-center"><Loader2 className="animate-spin text-blue-500" size={40} /></div>;
    }

    if (!shiftData) {
        return <div className="p-20 text-center font-semibold text-slate-500">Shift not found.</div>;
    }

    const entries = shiftData.shift_entries || [];
    const sides = shiftData.shift_sides || [];

    // Dynamically calculate totals since shift_summaries might be missing or broken on edit
    const calculatedTotals = entries.reduce((acc: any, curr: any) => {
        const qty = parseFloat(curr.sale_qty || 0);
        const amount = parseFloat(curr.amount || 0);

        if (curr.products?.name === 'MS') acc.totalMS += qty;
        if (curr.products?.name === 'HSD') acc.totalHSD += qty;
        acc.totalSale += amount;
        return acc;
    }, { totalMS: 0, totalHSD: 0, totalSale: 0 });

    const totalCash = sides.reduce((sum: number, s: any) => sum + (parseFloat(s.cash_received) || 0), 0);
    const totalOnline = sides.reduce((sum: number, s: any) => sum + (parseFloat(s.online_received) || 0), 0);
    const calculatedDifference = (totalCash + totalOnline) - calculatedTotals.totalSale;

    const managerName = shiftData.users?.name || 'Unknown Manager';
    const hasMismatch = Math.abs(calculatedDifference) > 5;

    const handleApprove = async () => {
        if (!user) return alert('Session lost');
        setApproving(true);
        try {
            // 1. Update Shift Status
            const { error: updateErr } = await supabase
                .from('shifts')
                .update({
                    status: 'Approved',
                    locked_flag: true,
                    approved_at: new Date().toISOString(),
                    approved_by: user.id
                })
                .eq('id', shiftData.id);

            if (updateErr) throw updateErr;

            // 2. Audit Log
            await supabase.from('audit_logs').insert([{
                user_id: user.id,
                action: 'APPROVE_SHIFT',
                target_table: 'shifts',
                target_id: shiftData.id,
                details: { difference: calculatedDifference }
            }]);

            alert('Shift successfully approved and locked!');
            router.push('/dashboard/admin');
        } catch (err) {
            console.error("Error approving:", err);
            alert('Failed to approve shift.');
            setApproving(false);
        }
    };

    return (
        <div className="max-w-4xl mx-auto space-y-6 pb-20">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Link href="/dashboard/manager" className="text-slate-500 hover:text-blue-600 transition-colors">
                        <MoveLeft size={24} />
                    </Link>
                    <h1 className="text-2xl font-bold text-slate-800 m-0">Shift Review</h1>
                </div>
                <div className="flex gap-3">
                    {shiftData.status === 'Approved' ? (
                        <button
                            onClick={() => generatePDF('shift-receipt', `Shift_${shiftData.shift_date}_${shiftData.shift_number}`)}
                            className="btn btn-outline border-blue-200 text-blue-600 bg-blue-50 hover:bg-blue-100 flex items-center gap-2"
                        >
                            <Download size={18} />
                            {t('downloadPDF', language)}
                        </button>
                    ) : (
                        <span className="px-4 py-1.5 rounded-full bg-amber-100 text-amber-700 font-medium text-sm flex gap-2 items-center">
                            <ShieldAlert size={16} /> {t('pending', language)}
                        </span>
                    )}
                </div>
            </div>

            <div id="shift-receipt" className="card print-section bg-white">
                <div className="border-b pb-6 mb-6">
                    <div className="flex justify-between items-start">
                        <div>
                            <h2 className="text-xl font-bold text-slate-800 uppercase tracking-wide">Fuel Station XYZ</h2>
                            <p className="text-slate-500 mt-1 flex gap-4">
                                <span>{t('date', language)}: <strong>{shiftData.shift_date}</strong></span>
                                <span>{t('shift', language)}: <strong>{shiftData.shift_number}</strong></span>
                            </p>
                            <p className="text-slate-500 mt-1">
                                {t('managerName', language)}: <strong>{managerName}</strong>
                            </p>
                        </div>

                        {shiftData.status === 'Approved' && (
                            <div className="text-right">
                                <div className="inline-flex items-center gap-2 text-green-600 bg-green-50 px-4 py-2 rounded-lg border border-green-200 mb-2">
                                    <CheckCircle size={20} />
                                    <span className="font-bold">{t('approved', language)}</span>
                                </div>
                                <p className="text-xs text-slate-400">Locked on {new Date(shiftData.approved_at).toISOString().split('T')[0]}</p>
                                <p className="text-xs text-slate-400">By Admin</p>
                            </div>
                        )}
                    </div>
                </div>

                <div className="mb-6">
                    <h3 className="text-lg font-semibold text-slate-800 mb-3 border-b pb-2">Nozzle & Collection Breakdowns</h3>

                    {sides.filter((s: any) => s.machine !== 'Lube').length > 0 ? (
                        <div className="space-y-6">
                            {sides.filter((s: any) => s.machine !== 'Lube').map((side: any) => {
                                // Find the specific entries for this machine side using the nozzle prefix
                                // The new format saves nozzle_no as "Front-1", "Front-3" etc.
                                // We know Side '1 & 3' has nozzles ending in 1 and 3
                                const sideNozzleSuffixes = side.side === '1 & 3' ? ['-1', '-3'] : ['-2', '-4'];
                                const sideEntries = entries.filter((e: any) =>
                                    e.nozzle_no.startsWith(side.machine) &&
                                    sideNozzleSuffixes.some(suf => e.nozzle_no.endsWith(suf))
                                );

                                return (
                                    <div key={side.id} className="border border-slate-200 rounded-lg overflow-hidden shadow-sm">
                                        <div className="bg-slate-100 flex flex-col md:flex-row justify-between items-start md:items-center px-4 py-3 border-b border-slate-200 gap-2">
                                            <div className="flex flex-wrap items-center gap-3 font-medium text-sm">
                                                <span className={`px-3 py-1 rounded shadow-sm text-white font-bold ${side.machine === 'Front' ? 'bg-blue-600' : 'bg-purple-600'}`}>
                                                    {side.machine} Machine - Side {side.side}
                                                </span>
                                                <span className="text-slate-600 bg-white border px-3 py-1 rounded">
                                                    👤 Nozzle Man: <strong className="text-slate-800">{side.nozzle_man || 'Unassigned'}</strong>
                                                </span>
                                            </div>
                                            <div className="flex gap-2 text-sm font-bold">
                                                <span className="text-emerald-700 bg-emerald-100 border border-emerald-200 px-3 py-1 rounded">
                                                    Cash: ₹{parseFloat(side.cash_received || 0).toFixed(2)}
                                                </span>
                                                <span className="text-indigo-700 bg-indigo-100 border border-indigo-200 px-3 py-1 rounded">
                                                    Online: ₹{parseFloat(side.online_received || 0).toFixed(2)}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="overflow-x-auto">
                                            <table className="w-full text-left text-sm">
                                                <thead className="bg-white text-slate-500 font-medium border-b border-slate-100 text-xs uppercase">
                                                    <tr>
                                                        <th className="py-2 px-3">{t('product', language)}</th>
                                                        <th className="py-2 px-3">Nozzle</th>
                                                        <th className="py-2 px-3 text-right">Open</th>
                                                        <th className="py-2 px-3 text-right">Close</th>
                                                        <th className="py-2 px-3 text-right">Test</th>
                                                        <th className="py-2 px-3 text-right">Rate</th>
                                                        <th className="py-2 px-3 text-right text-blue-600 bg-blue-50/50">Qty</th>
                                                        <th className="py-2 px-3 text-right text-slate-800 bg-blue-50/50">Amt</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-50">
                                                    {sideEntries.map((e: any, i: number) => (
                                                        <tr key={i} className="hover:bg-slate-50 transition-colors">
                                                            <td className="py-2.5 px-3 font-medium">
                                                                <span className={`px-2 py-0.5 rounded text-xs font-bold ${e.products?.name === 'HSD' ? 'bg-amber-100 text-amber-800' : 'bg-green-100 text-green-800'}`}>
                                                                    {e.products?.name}
                                                                </span>
                                                            </td>
                                                            <td className="py-2.5 px-3 text-slate-500 font-bold">{e.nozzle_no}</td>
                                                            <td className="py-2.5 px-3 text-right text-slate-500">{e.opening_meter}</td>
                                                            <td className="py-2.5 px-3 text-right text-slate-500">{e.closing_meter}</td>
                                                            <td className="py-2.5 px-3 text-right text-slate-400">{e.testing_qty || '-'}</td>
                                                            <td className="py-2.5 px-3 text-right text-slate-500">₹{parseFloat(e.rate).toFixed(2)}</td>
                                                            <td className="py-2.5 px-3 text-right font-bold text-blue-600 bg-blue-50/30">{parseFloat(e.sale_qty).toFixed(2)}</td>
                                                            <td className="py-2.5 px-3 text-right font-bold text-slate-800 bg-blue-50/30">₹{parseFloat(e.amount).toFixed(2)}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="overflow-x-auto border border-slate-200 rounded-lg">
                            <table className="w-full text-left text-sm">
                                <thead className="bg-slate-50 text-slate-600 font-medium border-b">
                                    <tr>
                                        <th className="py-3 px-3">{t('product', language)}</th>
                                        <th className="py-3 px-3">Nozzle</th>
                                        <th className="py-3 px-3 text-right">Open</th>
                                        <th className="py-3 px-3 text-right">Close</th>
                                        <th className="py-3 px-3 text-right">Test</th>
                                        <th className="py-3 px-3 text-right">Rate</th>
                                        <th className="py-3 px-3 text-right text-blue-600 font-bold bg-blue-50/30">Qty</th>
                                        <th className="py-3 px-3 text-right text-slate-800 font-bold bg-blue-50/30">Amt</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {entries.map((e: any, i: number) => (
                                        <tr key={i} className="hover:bg-slate-50">
                                            <td className="py-3 px-3 font-medium">{e.products?.name}</td>
                                            <td className="py-3 px-3 text-slate-500 bg-slate-100">{e.nozzle_no}</td>
                                            <td className="py-3 px-3 text-right text-slate-500">{e.opening_meter}</td>
                                            <td className="py-3 px-3 text-right text-slate-500">{e.closing_meter}</td>
                                            <td className="py-3 px-3 text-right text-slate-400">{e.testing_qty || '-'}</td>
                                            <td className="py-3 px-3 text-right text-slate-500">₹{parseFloat(e.rate).toFixed(2)}</td>
                                            <td className="py-3 px-3 text-right font-bold text-blue-600 bg-blue-50/10">{parseFloat(e.sale_qty).toFixed(2)}</td>
                                            <td className="py-3 px-3 text-right font-bold text-slate-800 bg-blue-50/10">₹{parseFloat(e.amount).toFixed(2)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {sides.find((s: any) => s.machine === 'Lube') && (
                    <div className="mb-6">
                        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 shadow-sm">
                            <h3 className="text-md font-bold text-amber-800 uppercase tracking-widest mb-4 flex items-center gap-2">🛒 Consolidated Lube Sales</h3>
                            <div className="flex flex-wrap gap-6 items-center">
                                <div className="bg-white px-4 py-3 rounded-lg border border-amber-100 flex-1 min-w-[200px]">
                                    <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Total Lube Sold</div>
                                    <div className="text-xl font-black text-slate-800">₹{parseFloat(sides.find((s: any) => s.machine === 'Lube').lube_sales || 0).toFixed(2)}</div>
                                </div>
                                <div className="bg-white px-4 py-3 rounded-lg border border-emerald-100 flex-1 min-w-[200px]">
                                    <div className="text-xs font-bold text-emerald-500 uppercase tracking-wider mb-1">Cash Collected</div>
                                    <div className="text-xl font-black text-emerald-700">₹{parseFloat(sides.find((s: any) => s.machine === 'Lube').cash_received || 0).toFixed(2)}</div>
                                </div>
                                <div className="bg-white px-4 py-3 rounded-lg border border-indigo-100 flex-1 min-w-[200px]">
                                    <div className="text-xs font-bold text-indigo-500 uppercase tracking-wider mb-1">Online Collected</div>
                                    <div className="text-xl font-black text-indigo-700">₹{parseFloat(sides.find((s: any) => s.machine === 'Lube').online_received || 0).toFixed(2)}</div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                <div className="grid grid-cols-2 gap-8 pt-4 border-t">
                    <div>
                        <h3 className="text-md font-semibold text-slate-800 border-b pb-2 mb-3">Sales Summary</h3>
                        <div className="space-y-2 text-sm">
                            <div className="flex justify-between flex-row">
                                <span className="text-slate-500">{t('totalMS', language)}</span>
                                <span className="font-semibold text-slate-700">{calculatedTotals.totalMS.toFixed(2)} Lts</span>
                            </div>
                            <div className="flex justify-between flex-row">
                                <span className="text-slate-500">{t('totalHSD', language)}</span>
                                <span className="font-semibold text-slate-700">{calculatedTotals.totalHSD.toFixed(2)} Lts</span>
                            </div>
                            <div className="flex justify-between flex-row border-t pt-2 mt-2 font-bold text-lg">
                                <span className="text-slate-800">{t('totalSale', language)}</span>
                                <span className="text-blue-600">₹ {calculatedTotals.totalSale.toFixed(2)}</span>
                            </div>
                        </div>
                    </div>

                    <div>
                        <h3 className="text-md font-semibold text-slate-800 border-b pb-2 mb-3">Reconciliation</h3>
                        <div className="space-y-2 text-sm">
                            <div className="flex justify-between flex-row">
                                <span className="text-slate-500">{t('cashReceived', language)}</span>
                                <span className="font-semibold text-slate-700">₹ {totalCash.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between flex-row">
                                <span className="text-slate-500">{t('onlineReceived', language)}</span>
                                <span className="font-semibold text-slate-700">₹ {totalOnline.toFixed(2)}</span>
                            </div>
                            <div className={`flex justify-between flex-row border-t pt-2 mt-2 font-bold text-lg p-2 rounded ${Math.abs(calculatedDifference) > 5 ? 'mismatch-highlight' : 'text-green-600 bg-green-50'}`}>
                                <span>{t('difference', language)}</span>
                                <span>{calculatedDifference > 0 ? '+' : ''}₹ {calculatedDifference.toFixed(2)}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {shiftData.status === 'Pending' && (
                <div className="card bg-blue-50 border-blue-200 mt-6 md:flex justify-between items-center space-y-4 md:space-y-0 p-6">
                    <div>
                        <h3 className="font-semibold text-blue-900 flex items-center gap-2"><ShieldAlert size={18} /> Approval Required</h3>
                        <p className="text-sm text-blue-700 mt-1">Review the details above carefully. Once approved, this record will be permanently locked and logged.</p>
                    </div>
                    <button
                        onClick={handleApprove}
                        disabled={approving}
                        className="btn btn-primary bg-blue-600 hover:bg-blue-700 w-full md:w-auto px-8 py-3 text-lg shadow-lg shadow-blue-500/30 flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                        {approving ? <Loader2 size={20} className="animate-spin" /> : <CheckCircle size={20} />}
                        {t('approve', language)} & Lock
                    </button>
                </div>
            )}
        </div>
    );
}
