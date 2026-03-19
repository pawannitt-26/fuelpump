"use client";

import { useAppStore } from '@/store/appStore';
import { t } from '@/lib/i18n';
import Link from 'next/link';
import { IndianRupee, TrendingUp, AlertTriangle, Loader2, Calendar, Database, History, Droplet, Fuel, CreditCard, Banknote, Clock, Users, Vault, CalendarCheck } from 'lucide-react';
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
    const [activeTab, setActiveTab] = useState<'total' | 'month' | 'history' | 'date'>('date');
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
                        id, shift_date, shift_number,
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

    // Shift-wise breakdown for selected date
    const shiftWiseStats = useMemo(() => {
        const filtered = allShifts.filter(s => s.shift_date === selectedDate);
        const grouped: Record<number, any[]> = {};
        filtered.forEach(s => {
            const sn = s.shift_number || 0;
            if (!grouped[sn]) grouped[sn] = [];
            grouped[sn].push(s);
        });
        const sortedKeys = Object.keys(grouped).map(Number).sort((a, b) => a - b);
        return sortedKeys.map(sn => ({
            shiftNumber: sn,
            stats: aggregateShifts(grouped[sn])
        }));
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
        <div className="space-y-4 sm:space-y-6 animate-fade-in">
            {title && <h3 className="text-base sm:text-lg font-bold text-slate-800 tracking-tight">{title}</h3>}

            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 sm:gap-6">
                {/* Total Sales */}
                <div className="col-span-2 md:col-span-1 bg-gradient-to-br from-indigo-50 to-blue-50/50 p-4 sm:p-6 rounded-xl sm:rounded-2xl border border-indigo-100 shadow-sm">
                    <div className="flex justify-between items-start mb-2 sm:mb-4">
                        <div className="text-[10px] sm:text-sm font-bold text-indigo-800/60 uppercase tracking-widest">Total Sales</div>
                        <div className="p-2 bg-indigo-100/50 rounded-lg text-indigo-600"><IndianRupee size={18} /></div>
                    </div>
                    <div className="text-xl sm:text-3xl font-black text-indigo-900 tracking-tight">₹{stats.totalSale.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>
                </div>

                {/* Online Collection */}
                <div className="bg-gradient-to-br from-purple-50 to-fuchsia-50/50 p-4 sm:p-6 rounded-xl sm:rounded-2xl border border-purple-100 shadow-sm">
                    <div className="flex justify-between items-start mb-2 sm:mb-4">
                        <div className="text-[10px] sm:text-sm font-bold text-purple-800/60 uppercase tracking-widest">Online</div>
                        <div className="p-2 bg-purple-100/50 rounded-lg text-purple-600"><CreditCard size={18} /></div>
                    </div>
                    <div className="text-xl sm:text-3xl font-black text-purple-900 tracking-tight">₹{stats.online.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>
                </div>

                {/* Cash Collection */}
                <div className="bg-gradient-to-br from-emerald-50 to-teal-50/50 p-4 sm:p-6 rounded-xl sm:rounded-2xl border border-emerald-100 shadow-sm">
                    <div className="flex justify-between items-start mb-2 sm:mb-4">
                        <div className="text-[10px] sm:text-sm font-bold text-emerald-800/60 uppercase tracking-widest">Cash</div>
                        <div className="p-2 bg-emerald-100/50 rounded-lg text-emerald-600"><Banknote size={18} /></div>
                    </div>
                    <div className="text-xl sm:text-3xl font-black text-emerald-900 tracking-tight">₹{stats.cash.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>
                </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-6">
                <div className="bg-white p-3 sm:p-6 rounded-xl sm:rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
                    <div>
                        <div className="text-[10px] sm:text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">MS (Petrol)</div>
                        <div className="text-base sm:text-xl font-bold text-slate-800">{stats.msVol.toLocaleString('en-IN', { maximumFractionDigits: 1 })} <span className="text-[10px] sm:text-sm font-normal text-slate-500">L</span></div>
                    </div>
                    <div className="w-9 h-9 sm:w-12 sm:h-12 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-500 shrink-0"><Fuel size={16} /></div>
                </div>
                <div className="bg-white p-3 sm:p-6 rounded-xl sm:rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
                    <div>
                        <div className="text-[10px] sm:text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">HSD (Diesel)</div>
                        <div className="text-base sm:text-xl font-bold text-slate-800">{stats.hsdVol.toLocaleString('en-IN', { maximumFractionDigits: 1 })} <span className="text-[10px] sm:text-sm font-normal text-slate-500">L</span></div>
                    </div>
                    <div className="w-9 h-9 sm:w-12 sm:h-12 rounded-full bg-amber-50 flex items-center justify-center text-amber-500 shrink-0"><Fuel size={16} /></div>
                </div>
                <div className="col-span-2 lg:col-span-1 bg-white p-3 sm:p-6 rounded-xl sm:rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
                    <div>
                        <div className="text-[10px] sm:text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Lube Sales</div>
                        <div className="text-base sm:text-xl font-bold text-slate-800">₹{stats.lube.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>
                    </div>
                    <div className="w-9 h-9 sm:w-12 sm:h-12 rounded-full bg-blue-50 flex items-center justify-center text-blue-500 shrink-0"><Droplet size={16} /></div>
                </div>
            </div>
        </div>
    );

    return (
        <div className="max-w-6xl mx-auto space-y-5 sm:space-y-8 pb-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
                <h1 className="text-xl sm:text-2xl md:text-3xl font-black text-slate-800 m-0 tracking-tight">Admin {t('dashboard', language)}</h1>

                {/* Pending Quick Metrics */}
                {pending.length > 0 && (
                    <a href="#pending-approvals" className="flex items-center gap-2 sm:gap-4 bg-amber-50 border border-amber-200 py-1.5 sm:py-2 px-3 sm:px-4 rounded-lg sm:rounded-xl shadow-sm hover:bg-amber-100 transition-colors text-sm">
                        <div className="flex items-center gap-1.5 sm:gap-2 text-amber-700 font-bold">
                            <AlertTriangle size={16} className="animate-pulse shrink-0" />
                            <span className="text-xs sm:text-sm">{pending.length} Pending</span>
                        </div>
                        <div className="w-px h-5 bg-amber-200"></div>
                        <div className={`font-bold text-xs sm:text-sm ${totalMismatch < 0 ? 'text-red-500' : totalMismatch > 0 ? 'text-emerald-600' : 'text-slate-500'}`}>
                            {totalMismatch !== 0 ? `₹${Math.abs(totalMismatch).toFixed(0)}` : 'OK'}
                        </div>
                    </a>
                )}
            </div>

            {loading ? (
                <div className="flex justify-center items-center py-32"><Loader2 className="animate-spin text-blue-500" size={48} /></div>
            ) : (
                <div className="space-y-4 sm:space-y-8">
                    {/* Navigation Tabs */}
                    <div className="flex overflow-x-auto hide-scrollbar bg-white p-1 sm:p-1.5 rounded-xl sm:rounded-2xl border border-slate-200 shadow-sm gap-0.5 sm:gap-1">
                        <button
                            onClick={() => setActiveTab('total')}
                            className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-lg sm:rounded-xl text-xs sm:text-sm font-bold whitespace-nowrap transition-all min-h-[36px] ${activeTab === 'total' ? 'bg-indigo-500 text-white shadow-md shadow-indigo-500/20' : 'text-slate-500 hover:bg-slate-50'}`}
                        >
                            <Database size={14} /> <span className="hidden sm:inline">All-Time</span> Totals
                        </button>
                        <button
                            onClick={() => setActiveTab('month')}
                            className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-lg sm:rounded-xl text-xs sm:text-sm font-bold whitespace-nowrap transition-all min-h-[36px] ${activeTab === 'month' ? 'bg-blue-500 text-white shadow-md shadow-blue-500/20' : 'text-slate-500 hover:bg-slate-50'}`}
                        >
                            <TrendingUp size={14} /> Month
                        </button>
                        <button
                            onClick={() => setActiveTab('date')}
                            className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-lg sm:rounded-xl text-xs sm:text-sm font-bold whitespace-nowrap transition-all min-h-[36px] ${activeTab === 'date' ? 'bg-purple-500 text-white shadow-md shadow-purple-500/20' : 'text-slate-500 hover:bg-slate-50'}`}
                        >
                            <Calendar size={14} /> Date
                        </button>
                        <button
                            onClick={() => setActiveTab('history')}
                            className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-lg sm:rounded-xl text-xs sm:text-sm font-bold whitespace-nowrap transition-all min-h-[36px] ${activeTab === 'history' ? 'bg-slate-800 text-white shadow-md shadow-slate-800/20' : 'text-slate-500 hover:bg-slate-50'}`}
                        >
                            <History size={14} /> History
                        </button>
                    </div>

                    {/* Stats Display Area */}
                    <div className="bg-slate-50/50 p-2.5 sm:p-6 md:p-8 rounded-xl sm:rounded-[2rem] border border-slate-100">
                        {activeTab !== 'history' ? (
                            <div className="space-y-4 sm:space-y-6">
                                {/* Date Picker shown only on 'date' tab */}
                                {activeTab === 'date' && (
                                    <div className="flex items-center gap-3 bg-white p-2.5 sm:p-3 rounded-xl sm:rounded-2xl border border-purple-100 shadow-sm shadow-purple-500/5 max-w-xs sm:max-w-sm mb-4 sm:mb-8 animate-fade-in">
                                        <div className="p-1.5 sm:p-2 bg-purple-50 rounded-lg sm:rounded-xl text-purple-500"><Calendar size={16} /></div>
                                        <div className="flex-1 min-w-0">
                                            <div className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none mb-0.5">Select Date</div>
                                            <input
                                                type="date"
                                                className="bg-transparent border-0 p-0 text-sm sm:text-base text-slate-800 font-bold focus:ring-0 cursor-pointer w-full outline-none"
                                                value={selectedDate}
                                                onChange={(e) => setSelectedDate(e.target.value)}
                                            />
                                        </div>
                                    </div>
                                )}

                                <div className="flex items-center gap-2 sm:gap-3 mb-3 sm:mb-6">
                                    {activeTab === 'total' && <Database className="text-indigo-500 shrink-0" size={18} />}
                                    {activeTab === 'month' && <TrendingUp className="text-blue-500 shrink-0" size={18} />}
                                    {activeTab === 'date' && <Clock className="text-purple-500 shrink-0" size={18} />}
                                    <h2 className="text-base sm:text-xl font-black text-slate-800 m-0 truncate">
                                        {activeTab === 'total' ? 'Lifetime Stats' : activeTab === 'month' ? `${format(new Date(), 'MMM yyyy')}` : `${format(parseISO(selectedDate), 'dd MMM yyyy')}`}
                                    </h2>
                                </div>

                                {activeStats.totalSale === 0 ? (
                                    <div className="py-8 sm:py-12 text-center bg-white rounded-xl sm:rounded-2xl border border-slate-200">
                                        <div className="inline-flex w-12 h-12 sm:w-16 sm:h-16 rounded-full bg-slate-50 items-center justify-center text-slate-300 mb-3 sm:mb-4"><Database size={20} /></div>
                                        <h3 className="text-sm sm:text-lg font-bold text-slate-700">No Data</h3>
                                        <p className="text-xs sm:text-sm text-slate-500">No approved shifts for this period.</p>
                                    </div>
                                ) : (
                                    <>
                                        <StatsGrid stats={activeStats} />

                                        {/* Shift-Wise Breakdown — only on date tab */}
                                        {activeTab === 'date' && shiftWiseStats.length > 0 && (
                                            <div className="mt-6 sm:mt-8 space-y-4 sm:space-y-6 animate-fade-in">
                                                <h3 className="text-base sm:text-lg font-black text-slate-800 tracking-tight flex items-center gap-2">
                                                    <Clock size={18} className="text-purple-500" />
                                                    Shift-Wise Breakdown
                                                </h3>
                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                                                    {shiftWiseStats.map(sw => (
                                                        <div key={sw.shiftNumber} className="bg-white p-4 sm:p-6 rounded-xl sm:rounded-2xl border border-slate-200 shadow-sm">
                                                            <div className="flex items-center gap-2 mb-4">
                                                                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-purple-100 flex items-center justify-center text-purple-700 font-black text-sm sm:text-base">
                                                                    S{sw.shiftNumber}
                                                                </div>
                                                                <div>
                                                                    <div className="text-sm sm:text-base font-bold text-slate-800">Shift {sw.shiftNumber}</div>
                                                                    <div className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">Approved</div>
                                                                </div>
                                                            </div>
                                                            <div className="grid grid-cols-2 gap-3">
                                                                <div>
                                                                    <div className="text-[9px] sm:text-[10px] text-slate-400 uppercase tracking-widest font-bold mb-0.5">Total Sale</div>
                                                                    <div className="text-base sm:text-lg font-black text-slate-800">₹{sw.stats.totalSale.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>
                                                                </div>
                                                                <div>
                                                                    <div className="text-[9px] sm:text-[10px] text-emerald-500 uppercase tracking-widest font-bold mb-0.5">Cash</div>
                                                                    <div className="text-base sm:text-lg font-black text-emerald-700">₹{sw.stats.cash.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>
                                                                </div>
                                                                <div>
                                                                    <div className="text-[9px] sm:text-[10px] text-purple-500 uppercase tracking-widest font-bold mb-0.5">Online</div>
                                                                    <div className="text-base sm:text-lg font-black text-purple-700">₹{sw.stats.online.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>
                                                                </div>
                                                                <div>
                                                                    <div className="text-[9px] sm:text-[10px] text-amber-500 uppercase tracking-widest font-bold mb-0.5">Lube</div>
                                                                    <div className="text-base sm:text-lg font-black text-amber-700">₹{sw.stats.lube.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>
                                                                </div>
                                                                <div>
                                                                    <div className="text-[9px] sm:text-[10px] text-slate-400 uppercase tracking-widest font-bold mb-0.5">MS</div>
                                                                    <div className="text-sm font-bold text-slate-600">{sw.stats.msVol.toLocaleString('en-IN', { maximumFractionDigits: 1 })} L</div>
                                                                </div>
                                                                <div>
                                                                    <div className="text-[9px] sm:text-[10px] text-slate-400 uppercase tracking-widest font-bold mb-0.5">HSD</div>
                                                                    <div className="text-sm font-bold text-slate-600">{sw.stats.hsdVol.toLocaleString('en-IN', { maximumFractionDigits: 1 })} L</div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>
                        ) : (
                            <div className="space-y-6 sm:space-y-12 animate-fade-in">
                                <div className="flex items-center gap-2 sm:gap-3 mb-2">
                                    <History className="text-slate-800 shrink-0" size={18} />
                                    <h2 className="text-base sm:text-xl font-black text-slate-800 m-0">Monthly History</h2>
                                </div>
                                {historyMonths.length === 0 ? (
                                    <p className="text-sm text-slate-500">No historical data available yet.</p>
                                ) : (
                                    historyMonths.map((hm, idx) => (
                                        <div key={idx} className="relative">
                                            {idx !== historyMonths.length - 1 && <div className="absolute left-6 top-16 bottom-[-3rem] w-px bg-slate-200 z-0 hidden sm:block"></div>}

                                            <div className="relative z-10 bg-white p-3 sm:p-6 md:p-8 rounded-xl sm:rounded-[2rem] border border-slate-200 shadow-sm shadow-slate-100">
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
            <div id="pending-approvals" className="card p-0 overflow-hidden shadow-sm mt-8 sm:mt-12">
                <div className="p-4 sm:p-6 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                    <h2 className="text-base sm:text-lg font-semibold text-slate-800 m-0">{t('pendingApprovals', language)}</h2>
                </div>

                {/* Desktop Table */}
                <div className="hidden sm:block overflow-x-auto">
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

                {/* Mobile Card List */}
                <div className="sm:hidden divide-y divide-slate-100">
                    {loading && <div className="text-center py-8 text-slate-500">Loading...</div>}
                    {!loading && pending.map(s => (
                        <div key={s.id} className="p-4 space-y-2">
                            <div className="flex justify-between items-start">
                                <div>
                                    <div className="text-sm font-bold text-slate-800">{s.date} · Shift {s.shift}</div>
                                    <div className="text-xs text-slate-500 mt-0.5">{s.manager}</div>
                                </div>
                                <Link href={`/shift/review/${s.id}`} className="btn btn-primary py-1.5 px-3 text-xs">Review</Link>
                            </div>
                            <div className="flex gap-4 text-xs">
                                <span className="text-slate-600">Total: <strong>₹{s.total.toLocaleString('en-IN')}</strong></span>
                                <span className={s.diff < 0 ? 'text-red-500 font-bold' : s.diff > 0 ? 'text-emerald-600 font-bold' : 'text-slate-400'}>
                                    Diff: {s.diff !== 0 ? `₹${s.diff.toLocaleString('en-IN')}` : '-'}
                                </span>
                            </div>
                        </div>
                    ))}
                    {!loading && pending.length === 0 && (
                        <div className="text-center py-8 text-slate-500">No pending approvals</div>
                    )}
                </div>
            </div>
        </div>
    );
}
