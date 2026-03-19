"use client";

import { useState, useEffect } from 'react';
import { useAppStore } from '@/store/appStore';
import { supabase } from '@/lib/supabase';
import { Calendar, Users, ChevronLeft, ChevronRight, UserCheck, Clock, Loader2 } from 'lucide-react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, parseISO } from 'date-fns';

interface AttendanceRecord {
    id: string;
    shift_date: string;
    shift_number: number;
    employee_id: string;
    nozzle_man: string;
    machine: string;
    side: string;
}

export default function AttendancePage() {
    const { language, user } = useAppStore();
    const [loading, setLoading] = useState(true);
    const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
    const [viewDate, setViewDate] = useState(new Date());
    const [summary, setSummary] = useState<Record<string, number>>({});

    const monthStart = startOfMonth(viewDate);
    const monthEnd = endOfMonth(viewDate);
    const days = eachDayOfInterval({ start: monthStart, end: monthEnd });

    useEffect(() => {
        fetchAttendance();
    }, [viewDate]);

    const fetchAttendance = async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from('shift_sides')
            .select(`
                id,
                nozzle_man,
                employee_id,
                machine,
                side,
                shifts!inner (
                    shift_date,
                    shift_number
                )
            `)
            .filter('shifts.shift_date', 'gte', format(monthStart, 'yyyy-MM-dd'))
            .filter('shifts.shift_date', 'lte', format(monthEnd, 'yyyy-MM-dd'));

        if (!error && data) {
            const flat: AttendanceRecord[] = data.map((item: any) => ({
                id: item.id,
                shift_date: item.shifts.shift_date,
                shift_number: item.shifts.shift_number,
                employee_id: item.employee_id,
                nozzle_man: item.nozzle_man,
                machine: item.machine,
                side: item.side
            }));
            setAttendance(flat);

            const counts: Record<string, number> = {};
            const uniqueShifts = new Set();
            flat.forEach(r => {
                if (r.employee_id) {
                    const key = `${r.shift_date}-${r.shift_number}-${r.employee_id}`;
                    if (!uniqueShifts.has(key)) {
                        uniqueShifts.add(key);
                        counts[r.nozzle_man] = (counts[r.nozzle_man] || 0) + 1;
                    }
                }
            });
            setSummary(counts);
        } else if (error) {
            console.error('Attendance fetch error:', error);
        }
        setLoading(false);
    };

    const handlePrevMonth = () => {
        setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1));
    };

    const handleNextMonth = () => {
        setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1));
    };

    if (user?.role !== 'Admin' && user?.role !== 'Manager') {
        return <div className="p-8 text-center text-red-500 font-bold">Access Denied</div>;
    }

    return (
        <div className="max-w-7xl mx-auto space-y-4 sm:space-y-8 pb-24 sm:pb-20">
            {/* Header with Monthly Navigation */}
            <div className="bg-white p-4 sm:p-6 rounded-2xl sm:rounded-3xl shadow-sm border border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-4 w-full sm:w-auto">
                    <div className="p-3 bg-blue-600 rounded-2xl text-white shadow-lg shadow-blue-200 flex-shrink-0">
                        <Users size={24} />
                    </div>
                    <div>
                        <h1 className="text-xl sm:text-2xl font-black text-slate-800">Attendance Log</h1>
                        <p className="text-slate-500 text-[10px] sm:text-sm font-medium">Digital register synced with Shift Reports.</p>
                    </div>
                </div>

                <div className="flex items-center bg-slate-100 p-1.5 rounded-xl sm:rounded-2xl border border-slate-200 shadow-inner w-full sm:w-auto">
                    <button
                        onClick={handlePrevMonth}
                        className="p-1.5 sm:p-2 bg-white rounded-lg sm:rounded-xl shadow-sm hover:text-blue-600 transition-colors border border-slate-200"
                    >
                        <ChevronLeft size={20} />
                    </button>
                    <div className="flex-1 px-4 sm:px-8 py-1 sm:py-2 text-sm sm:text-lg font-black text-slate-700 text-center min-w-[140px]">
                        {format(viewDate, 'MMMM yyyy')}
                    </div>
                    <button
                        onClick={handleNextMonth}
                        className="p-1.5 sm:p-2 bg-white rounded-lg sm:rounded-xl shadow-sm hover:text-blue-600 transition-colors border border-slate-200"
                    >
                        <ChevronRight size={20} />
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                {/* Summary Sidebar (Employee Totals) */}
                <div className="lg:col-span-1 space-y-4 sm:space-y-6 order-2 lg:order-1">
                    <div className="bg-white p-4 sm:p-6 rounded-2xl sm:rounded-3xl border border-slate-200 shadow-sm sm:sticky sm:top-6">
                        <h3 className="text-[10px] sm:text-xs font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                            <UserCheck size={16} className="text-blue-600" /> Monthly Summary
                        </h3>
                        <div className="space-y-2 sm:space-y-3 max-h-[400px] lg:max-h-none overflow-y-auto pr-1">
                            {Object.entries(summary).sort((a, b) => b[1] - a[1]).map(([name, count]) => (
                                <div key={name} className="flex items-center justify-between p-2.5 sm:p-3 bg-slate-50/50 hover:bg-white rounded-xl border border-slate-100/50 hover:border-blue-100 hover:shadow-md hover:shadow-blue-500/5 transition-all group">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center font-black text-xs group-hover:bg-blue-600 group-hover:text-white transition-colors">
                                            {name[0]}
                                        </div>
                                        <span className="text-xs sm:text-sm font-bold text-slate-700 truncate max-w-[100px] sm:max-w-none">{name}</span>
                                    </div>
                                    <div className="flex items-center gap-2 px-3 py-1 bg-white rounded-lg border border-slate-200 shadow-sm">
                                        <span className="text-sm font-black text-blue-600">{count}</span>
                                        <span className="text-[9px] font-black text-slate-400 uppercase">Shifts</span>
                                    </div>
                                </div>
                            ))}
                            {Object.keys(summary).length === 0 && !loading && (
                                <div className="text-center py-12 text-slate-300">
                                    <Calendar className="mx-auto mb-2 opacity-20" size={32} />
                                    <p className="text-xs font-bold">No records found</p>
                                </div>
                            )}
                            {loading && <div className="p-8 text-center text-slate-300 animate-pulse font-black text-xs uppercase tracking-tighter">Updating...</div>}
                        </div>
                    </div>
                </div>

                {/* Vertical Attendance Log (Days) */}
                <div className="lg:col-span-3 space-y-4 order-1 lg:order-2">
                    <h2 className="text-[10px] px-2 font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                        <Clock size={16} className="text-blue-500" /> Daily Breakdown
                    </h2>

                    <div className="space-y-4">
                        {days.slice().reverse().map(day => {
                            const dateStr = format(day, 'yyyy-MM-dd');
                            const dayAttendance = attendance.filter(a => a.shift_date === dateStr);

                            // To make the UI cleaner, we can hide empty days or show them as "No Shift Report"
                            const hasData = dayAttendance.length > 0;
                            const s1Emps = Array.from(new Set(dayAttendance.filter(a => a.shift_number === 1).map(a => a.nozzle_man)));
                            const s2Emps = Array.from(new Set(dayAttendance.filter(a => a.shift_number === 2).map(a => a.nozzle_man)));

                            return (
                                <div key={dateStr} className={`bg-white rounded-2xl sm:rounded-3xl border transition-all ${hasData ? 'border-slate-200 shadow-sm hover:shadow-md' : 'border-slate-100 opacity-60'}`}>
                                    <div className={`px-4 sm:px-6 py-2.5 sm:py-3 flex items-center justify-between ${hasData ? 'bg-slate-50 border-b border-slate-100' : ''}`}>
                                        <div className="flex items-center gap-3">
                                            <span className={`text-lg sm:text-xl font-black ${hasData ? 'text-slate-800' : 'text-slate-400'}`}>{format(day, 'd')}</span>
                                            <div>
                                                <div className="text-[10px] font-black text-slate-400 uppercase leading-none tracking-tighter">{format(day, 'EEEE')}</div>
                                                <div className="text-[10px] font-bold text-slate-500">{format(day, 'MMM yyyy')}</div>
                                            </div>
                                        </div>
                                        {!hasData && <span className="text-[9px] font-black uppercase text-slate-300 tracking-widest">No Shift Data</span>}
                                    </div>

                                    {hasData && (
                                        <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-100">
                                            {/* Shift 1 Column */}
                                            <div className="p-4 sm:p-6 bg-orange-50/10">
                                                <div className="flex items-center justify-between mb-4">
                                                    <span className="px-2 py-0.5 bg-orange-100 text-orange-700 rounded text-[9px] font-black uppercase tracking-widest">Shift 1 (Day)</span>
                                                    <span className="text-[10px] font-bold text-orange-400">{s1Emps.length} present</span>
                                                </div>
                                                <div className="flex flex-wrap gap-2">
                                                    {s1Emps.map(name => (
                                                        <div key={name} className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 rounded-xl shadow-sm text-xs font-bold text-slate-700">
                                                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                                            {name}
                                                        </div>
                                                    ))}
                                                    {s1Emps.length === 0 && <span className="text-[10px] text-slate-400 italic font-medium">No report entered</span>}
                                                </div>
                                            </div>

                                            {/* Shift 2 Column */}
                                            <div className="p-4 sm:p-6 bg-indigo-50/10">
                                                <div className="flex items-center justify-between mb-4">
                                                    <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded text-[9px] font-black uppercase tracking-widest">Shift 2 (Night)</span>
                                                    <span className="text-[10px] font-bold text-indigo-400">{s2Emps.length} present</span>
                                                </div>
                                                <div className="flex flex-wrap gap-2">
                                                    {s2Emps.map(name => (
                                                        <div key={name} className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 rounded-xl shadow-sm text-xs font-bold text-slate-700">
                                                            <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                                                            {name}
                                                        </div>
                                                    ))}
                                                    {s2Emps.length === 0 && <span className="text-[10px] text-slate-400 italic font-medium">No report entered</span>}
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                        {loading && (
                            <div className="flex flex-col items-center justify-center py-20 bg-white rounded-3xl border border-slate-200 shadow-sm border-dashed">
                                <Loader2 className="animate-spin text-blue-500 mb-4" size={40} />
                                <p className="text-sm font-black text-slate-400 uppercase tracking-widest">Reconstructing Logs...</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
