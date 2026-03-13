"use client";

import { useAppStore } from '@/store/appStore';
import { t } from '@/lib/i18n';
import Link from 'next/link';
import { IndianRupee, TrendingUp, AlertTriangle, Loader2, Calendar, Database, History, Droplet, Fuel, CreditCard, Banknote, Clock } from 'lucide-react';
import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { format, parseISO } from 'date-fns';

interface PendingApproval {
    id: string;
    date: string;
    shift: number;
    manager: string;
    total: number;
    diff: number;
}

export default function AdminDashboard() {
    const { language } = useAppStore();
    const [loading, setLoading] = useState(true);

    const [pending, setPending] = useState<PendingApproval[]>([]);
    const [allShifts, setAllShifts] = useState<any[]>([]);
    const [totalMismatch, setTotalMismatch] = useState(0);

    // UI State
    const [activeTab, setActiveTab] = useState<'total' | 'month' | 'history' | 'date'>('month');
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);

    useEffect(() => {
        async function fetchData() {
            try {
                // Fetch Pending Shifts
                const { data: pendingData, error: pendingErr } = await supabase
                    .from('shifts')
                    .select(`
            id, shift_date, shift_number, status,
            users!shifts_manager_id_fkey ( name ),
            shift_summaries ( total_sale_amount, difference )
          `)
                    .eq('status', 'Pending')
                    .order('shift_date', { ascending: false });

                if (pendingErr) throw pendingErr;

                let mismatch = 0;
                const formattedPending = (pendingData || []).map((p: any) => {
                    const summary = p.shift_summaries?.[0] || { total_sale_amount: 0, difference: 0 };
                    mismatch += summary.difference;
                    return {
                        id: p.id,
                        date: p.shift_date,
                        shift: p.shift_number,
                        manager: p.users?.name || 'Unknown',
                        total: summary.total_sale_amount,
                        diff: summary.difference
                    };
                });

                setTotalMismatch(mismatch);
                setPending(formattedPending);

                // Fetch ALL Approved Shifts with entries and sides for deep analytics
                const { data: approvedData, error: approvedErr } = await supabase
                    .from('shifts')
                    .select(`
                        id, shift_date,
                        shift_sides ( cash_received, online_received, lube_sales ),
                        shift_entries ( products(name), sale_qty, amount )
                    `)
                    .eq('status', 'Approved')
                    .order('shift_date', { ascending: false });

                if (approvedErr) throw approvedErr;
                setAllShifts(approvedData || []);

            } catch (err) {
                console.error('Error fetching admin data:', err);
            } finally {
                setLoading(false);
            }
        }
        fetchData();
    }, []);

    // Aggregation Helper
    const aggregateShifts = (shifts: any[]) => {
        let msVol = 0, hsdVol = 0, msAmt = 0, hsdAmt = 0;
        let cash = 0, online = 0, lube = 0, totalSale = 0;

        shifts.forEach(s => {
            const sides = s.shift_sides || [];
            const entries = s.shift_entries || [];

            sides.forEach((side: any) => {
                cash += parseFloat(side.cash_received) || 0;
                online += parseFloat(side.online_received) || 0;
                lube += parseFloat(side.lube_sales) || 0;
            });

            entries.forEach((e: any) => {
                const vol = parseFloat(e.sale_qty) || 0;
                const amt = parseFloat(e.amount) || 0;
                if (e.products?.name === 'MS') {
                    msVol += vol;
                    msAmt += amt;
                } else if (e.products?.name === 'HSD') {
                    hsdVol += vol;
                    hsdAmt += amt;
                }
            });
        });

        totalSale = lube + msAmt + hsdAmt;

        return { msVol, hsdVol, msAmt, hsdAmt, cash, online, lube, totalSale };
    };

    // Derived Metrics
    const statsTotal = useMemo(() => aggregateShifts(allShifts), [allShifts]);

    const statsCurrentMonth = useMemo(() => {
        const currentMonthPrefix = new Date().toISOString().substring(0, 7); // YYYY-MM
        const filtered = allShifts.filter(s => s.shift_date.startsWith(currentMonthPrefix));
        return aggregateShifts(filtered);
    }, [allShifts]);

    const statsSelectedDate = useMemo(() => {
        const filtered = allShifts.filter(s => s.shift_date === selectedDate);
        return aggregateShifts(filtered);
    }, [allShifts, selectedDate]);

    // Group past months
    const historyMonths = useMemo(() => {
        const grouped: Record<string, any[]> = {};
        allShifts.forEach(s => {
            const monthStr = s.shift_date.substring(0, 7);
            if (!grouped[monthStr]) grouped[monthStr] = [];
            grouped[monthStr].push(s);
        });

        const sortedKeys = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

        return sortedKeys.map(key => ({
            monthLabel: format(parseISO(`${key}-01`), 'MMMM yyyy'),
            stats: aggregateShifts(grouped[key])
        }));
    }, [allShifts]);

    // Select which stats to show based on active tab
    const activeStats = activeTab === 'total' ? statsTotal : activeTab === 'month' ? statsCurrentMonth : statsSelectedDate;

    // Handle Hash Scroll
    useEffect(() => {
        const scrollToHash = () => {
            const hash = window.location.hash;
            if (hash === '#pending-approvals') {
                const element = document.getElementById('pending-approvals');
                if (element) {
                    setTimeout(() => {
                        element.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        element.classList.add('ring-4', 'ring-blue-500', 'ring-opacity-50', 'transition-shadow');
                        setTimeout(() => element.classList.remove('ring-4', 'ring-blue-500', 'ring-opacity-50'), 2000);
                    }, 100);
                }
            }
        };
        scrollToHash();
        window.addEventListener('hashchange', scrollToHash);

        const originalPushState = history.pushState;
        history.pushState = function (...args) {
            originalPushState.apply(this, args);
            window.dispatchEvent(new Event('hashchange'));
        };
        const originalReplaceState = history.replaceState;
        history.replaceState = function (...args) {
            originalReplaceState.apply(this, args);
            window.dispatchEvent(new Event('hashchange'));
        };

        return () => {
            window.removeEventListener('hashchange', scrollToHash);
            history.pushState = originalPushState;
            history.replaceState = originalReplaceState;
        };
    }, []);

    // Reusable Stats Grid Component
    const StatsGrid = ({ stats, title }: { stats: any, title?: string }) => (
        <div className="space-y-6 animate-fade-in">
            {title && <h3 className="text-lg font-bold text-slate-800 tracking-tight">{title}</h3>}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Total Sales */}
                <div className="bg-gradient-to-br from-indigo-50 to-blue-50/50 p-6 rounded-2xl border border-indigo-100 shadow-sm">
                    <div className="flex justify-between items-start mb-4">
                        <div className="text-sm font-bold text-indigo-800/60 uppercase tracking-widest">Total Sales</div>
                        <div className="p-2 bg-indigo-100/50 rounded-lg text-indigo-600"><IndianRupee size={18} /></div>
                    </div>
                    <div className="text-3xl font-black text-indigo-900 tracking-tight">₹{stats.totalSale.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>
                </div>

                {/* Online Collection */}
                <div className="bg-gradient-to-br from-purple-50 to-fuchsia-50/50 p-6 rounded-2xl border border-purple-100 shadow-sm">
                    <div className="flex justify-between items-start mb-4">
                        <div className="text-sm font-bold text-purple-800/60 uppercase tracking-widest">Online Col.</div>
                        <div className="p-2 bg-purple-100/50 rounded-lg text-purple-600"><CreditCard size={18} /></div>
                    </div>
                    <div className="text-3xl font-black text-purple-900 tracking-tight">₹{stats.online.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>
                </div>

                {/* Cash Collection */}
                <div className="bg-gradient-to-br from-emerald-50 to-teal-50/50 p-6 rounded-2xl border border-emerald-100 shadow-sm">
                    <div className="flex justify-between items-start mb-4">
                        <div className="text-sm font-bold text-emerald-800/60 uppercase tracking-widest">Cash Col.</div>
                        <div className="p-2 bg-emerald-100/50 rounded-lg text-emerald-600"><Banknote size={18} /></div>
                    </div>
                    <div className="text-3xl font-black text-emerald-900 tracking-tight">₹{stats.cash.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {/* MS Sold */}
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
                    <div>
                        <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">MS (Petrol)</div>
                        <div className="text-xl font-bold text-slate-800">{stats.msVol.toLocaleString('en-IN', { maximumFractionDigits: 1 })} <span className="text-sm font-normal text-slate-500">Ltrs</span></div>
                    </div>
                    <div className="w-12 h-12 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-500"><Fuel size={20} /></div>
                </div>

                {/* HSD Sold */}
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
                    <div>
                        <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">HSD (Diesel)</div>
                        <div className="text-xl font-bold text-slate-800">{stats.hsdVol.toLocaleString('en-IN', { maximumFractionDigits: 1 })} <span className="text-sm font-normal text-slate-500">Ltrs</span></div>
                    </div>
                    <div className="w-12 h-12 rounded-full bg-amber-50 flex items-center justify-center text-amber-500"><Fuel size={20} /></div>
                </div>

                {/* Lube Sold */}
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
                    <div>
                        <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Lube Sales</div>
                        <div className="text-xl font-bold text-slate-800">₹{stats.lube.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>
                    </div>
                    <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center text-blue-500"><Droplet size={20} /></div>
                </div>
            </div>
        </div>
    );

    return (
        <div className="max-w-6xl mx-auto space-y-8 pb-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <h1 className="text-2xl sm:text-3xl font-black text-slate-800 m-0 tracking-tight">Admin {t('dashboard', language)}</h1>

                {/* Pending Quick Metrics */}
                {pending.length > 0 && (
                    <a href="#pending-approvals" className="flex items-center gap-4 bg-amber-50 border border-amber-200 py-2 px-4 rounded-xl shadow-sm hover:bg-amber-100 transition-colors">
                        <div className="flex items-center gap-2 text-amber-700 font-bold">
                            <AlertTriangle size={18} className="animate-pulse" />
                            <span>{pending.length} Pending Approval{pending.length > 1 ? 's' : ''}</span>
                        </div>
                        <div className="w-px h-6 bg-amber-200"></div>
                        <div className={`font-bold ${totalMismatch < 0 ? 'text-red-500' : totalMismatch > 0 ? 'text-emerald-600' : 'text-slate-500'}`}>
                            {totalMismatch !== 0 ? `Diff: ₹${Math.abs(totalMismatch).toFixed(0)}` : 'Matches OK'}
                        </div>
                    </a>
                )}
            </div>

            {loading ? (
                <div className="flex justify-center items-center py-32"><Loader2 className="animate-spin text-blue-500" size={48} /></div>
            ) : (
                <div className="space-y-8">
                    {/* Navigation Tabs */}
                    <div className="flex overflow-x-auto hide-scrollbar bg-white p-1.5 rounded-2xl border border-slate-200 shadow-sm gap-1">
                        <button
                            onClick={() => setActiveTab('total')}
                            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold whitespace-nowrap transition-all ${activeTab === 'total' ? 'bg-indigo-500 text-white shadow-md shadow-indigo-500/20' : 'text-slate-500 hover:bg-slate-50'}`}
                        >
                            <Database size={16} /> All-Time Totals
                        </button>
                        <button
                            onClick={() => setActiveTab('month')}
                            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold whitespace-nowrap transition-all ${activeTab === 'month' ? 'bg-blue-500 text-white shadow-md shadow-blue-500/20' : 'text-slate-500 hover:bg-slate-50'}`}
                        >
                            <TrendingUp size={16} /> Current Month
                        </button>
                        <button
                            onClick={() => setActiveTab('date')}
                            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold whitespace-nowrap transition-all ${activeTab === 'date' ? 'bg-purple-500 text-white shadow-md shadow-purple-500/20' : 'text-slate-500 hover:bg-slate-50'}`}
                        >
                            <Calendar size={16} /> Specific Date
                        </button>
                        <button
                            onClick={() => setActiveTab('history')}
                            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold whitespace-nowrap transition-all ${activeTab === 'history' ? 'bg-slate-800 text-white shadow-md shadow-slate-800/20' : 'text-slate-500 hover:bg-slate-50'}`}
                        >
                            <History size={16} /> Past Months
                        </button>
                    </div>

                    {/* Stats Display Area */}
                    <div className="bg-slate-50/50 p-6 md:p-8 rounded-[2rem] border border-slate-100">
                        {activeTab !== 'history' ? (
                            <div className="space-y-6">
                                {/* Date Picker shown only on 'date' tab */}
                                {activeTab === 'date' && (
                                    <div className="flex items-center gap-4 bg-white p-3 rounded-2xl border border-purple-100 shadow-sm shadow-purple-500/5 max-w-sm mb-8 animate-fade-in">
                                        <div className="p-2 bg-purple-50 rounded-xl text-purple-500"><Calendar size={20} /></div>
                                        <div className="flex-1">
                                            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none mb-1">Select Date</div>
                                            <input
                                                type="date"
                                                className="bg-transparent border-0 p-0 text-slate-800 font-bold focus:ring-0 cursor-pointer w-full outline-none"
                                                value={selectedDate}
                                                onChange={(e) => setSelectedDate(e.target.value)}
                                            />
                                        </div>
                                    </div>
                                )}

                                <div className="flex items-center gap-3 mb-6">
                                    {activeTab === 'total' && <Database className="text-indigo-500" size={24} />}
                                    {activeTab === 'month' && <TrendingUp className="text-blue-500" size={24} />}
                                    {activeTab === 'date' && <Clock className="text-purple-500" size={24} />}
                                    <h2 className="text-xl font-black text-slate-800 m-0">
                                        {activeTab === 'total' ? 'Platform Lifetime Statistics' : activeTab === 'month' ? `Statistics for ${format(new Date(), 'MMMM yyyy')}` : `Statistics for ${format(parseISO(selectedDate), 'dd MMM yyyy')}`}
                                    </h2>
                                </div>

                                {activeStats.totalSale === 0 ? (
                                    <div className="py-12 text-center bg-white rounded-2xl border border-slate-200">
                                        <div className="inline-flex w-16 h-16 rounded-full bg-slate-50 items-center justify-center text-slate-300 mb-4"><Database size={24} /></div>
                                        <h3 className="text-lg font-bold text-slate-700">No Data Available</h3>
                                        <p className="text-slate-500">There are no approved shifts for this period.</p>
                                    </div>
                                ) : (
                                    <StatsGrid stats={activeStats} />
                                )}
                            </div>
                        ) : (
                            <div className="space-y-12 animate-fade-in">
                                <div className="flex items-center gap-3 mb-2">
                                    <History className="text-slate-800" size={24} />
                                    <h2 className="text-xl font-black text-slate-800 m-0">Historical Monthly Breakdown</h2>
                                </div>
                                {historyMonths.length === 0 ? (
                                    <p className="text-slate-500">No historical data available yet.</p>
                                ) : (
                                    historyMonths.map((hm, idx) => (
                                        <div key={idx} className="relative">
                                            {/* Decorative timeline line */}
                                            {idx !== historyMonths.length - 1 && <div className="absolute left-6 top-16 bottom-[-3rem] w-px bg-slate-200 z-0"></div>}

                                            <div className="relative z-10 bg-white p-6 md:p-8 rounded-[2rem] border border-slate-200 shadow-sm shadow-slate-100">
                                                <StatsGrid stats={hm.stats} title={hm.monthLabel} />
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Pending Approvals Table */}
            <div id="pending-approvals" className="card p-0 overflow-hidden shadow-sm mt-12">
                <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                    <h2 className="text-lg font-semibold text-slate-800 m-0">Action Required: {t('pendingApprovals', language)}</h2>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm whitespace-nowrap">
                        <thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-200">
                            <tr>
                                <th className="px-6 py-4">{t('date', language)}</th>
                                <th className="px-6 py-4">{t('shift', language)}</th>
                                <th className="px-6 py-4">{t('managerName', language)}</th>
                                <th className="px-6 py-4 text-right">{t('totalSale', language)}</th>
                                <th className="px-6 py-4 text-right">{t('difference', language)}</th>
                                <th className="px-6 py-4 text-center">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {loading && <tr><td colSpan={6} className="px-6 py-8 text-center text-slate-500">Loading...</td></tr>}
                            {!loading && pending.map(s => (
                                <tr key={s.id} className="hover:bg-slate-50 transition-colors group">
                                    <td className="px-6 py-4 text-slate-700 font-medium">{s.date}</td>
                                    <td className="px-6 py-4 text-slate-700">Shift {s.shift}</td>
                                    <td className="px-6 py-4 text-slate-600">{s.manager}</td>
                                    <td className="px-6 py-4 text-slate-800 font-bold text-right">₹ {s.total.toLocaleString('en-IN')}</td>
                                    <td className={`px-6 py-4 text-right font-bold ${s.diff < 0 ? 'text-danger-text' : s.diff > 0 ? 'text-success-text' : 'text-slate-400'}`}>
                                        {s.diff !== 0 ? `₹ ${s.diff.toLocaleString('en-IN')}` : '-'}
                                    </td>
                                    <td className="px-6 py-4 text-center">
                                        <Link
                                            href={`/shift/review/${s.id}`}
                                            className="btn btn-primary py-1.5 px-4 text-xs shadow-md shadow-blue-500/20 opacity-90 group-hover:opacity-100 transition-opacity"
                                        >
                                            Review
                                        </Link>
                                    </td>
                                </tr>
                            ))}
                            {!loading && pending.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                                        <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-300">
                                            <AlertTriangle size={24} />
                                        </div>
                                        <div className="font-bold text-slate-700 mb-1">No pending approvals</div>
                                        <div>All shifts have been processed and caught up!</div>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
