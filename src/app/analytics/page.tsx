"use client";

import React, { useState, useEffect, useMemo } from 'react';
import {
  BarChart3,
  Calendar,
  TrendingDown,
  TrendingUp,
  Droplets,
  Database,
  ArrowRight,
  History,
  Info,
  ChevronDown,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  Clock
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { format, startOfMonth, endOfMonth, isFuture, parseISO, getDaysInMonth } from 'date-fns';
import { dipToLiters } from '@/lib/fuelUtils';
import { IndianRupee } from 'lucide-react';

const MS_NOZZLES = ['Front-3', 'Front-4', 'Back-3', 'Back-4'];
const HSD_NOZZLES = ['Front-1', 'Front-2', 'Back-1', 'Back-2'];

export default function AnalyticsPage() {
  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), 'yyyy-MM'));
  const [loading, setLoading] = useState(true);
  const [shifts, setShifts] = useState<any[]>([]);
  const [decantations, setDecantations] = useState<any[]>([]);

  useEffect(() => {
    fetchData();
  }, [selectedMonth]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const startDate = `${selectedMonth}-01`;
      const lastDay = getDaysInMonth(parseISO(startDate));
      const endDate = `${selectedMonth}-${String(lastDay).padStart(2, '0')}`;

      // 1. Fetch Shifts (for sales & stock)
      const { data: shiftsData } = await supabase
        .from('shifts')
        .select(`
          id, shift_date, shift_number, ms_receipt, hsd_receipt,
          shift_entries ( nozzle_no, opening_meter, closing_meter, testing_qty ),
          shift_tanks ( tank_name, manual_dip )
        `)
        .gte('shift_date', startDate)
        .lte('shift_date', endDate)
        .order('shift_date', { ascending: true })
        .order('shift_number', { ascending: true });

      // 2. Fetch Decantations (for receipt history & audit)
      const { data: decantData } = await supabase
        .from('decantations')
        .select('*')
        .gte('date', startDate)
        .lte('date', endDate)
        .order('date', { ascending: true });

      setShifts(shiftsData || []);
      setDecantations(decantData || []);
    } catch (error) {
      console.error('Error fetching analytics data:', error);
    } finally {
      setLoading(false);
    }
  };

  // --- Process Analytics ---
  const stats = useMemo(() => {
    if (shifts.length === 0) return null;

    let finalMsVariation = 0;
    let finalHsdVariation = 0;

    const variationData: any[] = [];

    const groupedByDate = shifts.reduce((acc: any, shift) => {
      if (!acc[shift.shift_date]) acc[shift.shift_date] = [];
      acc[shift.shift_date].push(shift);
      return acc;
    }, {});

    const dates = Object.keys(groupedByDate).sort();

    dates.forEach((date, index) => {
      const dayShifts = groupedByDate[date];
      const nextDayDate = dates[index + 1];
      const nextDayShifts = nextDayDate ? groupedByDate[nextDayDate] : [];

      // Calculate Day Sales (Nozzle)
      let msNozzleSales = 0;
      let hsdNozzleSales = 0;

      dayShifts.forEach((shift: any) => {
        shift.shift_entries?.forEach((entry: any) => {
          const sale = (parseFloat(entry.closing_meter) || 0) - (parseFloat(entry.opening_meter) || 0) - (parseFloat(entry.testing_qty) || 0);
          if (MS_NOZZLES.includes(entry.nozzle_no)) msNozzleSales += sale;
          if (HSD_NOZZLES.includes(entry.nozzle_no)) hsdNozzleSales += sale;
        });
      });

      // Calculate Day Stock Change (Tank)
      const firstShift = dayShifts[0];
      const nextDayFirstShift = nextDayShifts[0];

      if (firstShift && nextDayFirstShift) {
        // More robust dip volume retrieval
        const getDayDipVol = (dayShifts: any[], tankNames: string[]) => {
          let totalVol = 0;
          tankNames.forEach(name => {
            const tanks = dayShifts.flatMap(s => s.shift_tanks || []);
            const match = tanks.find(t => t.tank_name === name && parseFloat(t.manual_dip) > 0);
            if (match) totalVol += dipToLiters(parseFloat(match.manual_dip));
          });
          return totalVol;
        };
        
        const msOpening = getDayDipVol(dayShifts, ['3-MS']);
        const hsdOpening = getDayDipVol(dayShifts, ['1-HSD', '2-HSD']);
        const msClosing = getDayDipVol(nextDayShifts, ['3-MS']);
        const hsdClosing = getDayDipVol(nextDayShifts, ['1-HSD', '2-HSD']);

        const msReceipts = dayShifts.reduce((sum: number, s: any) => sum + (parseFloat(s.ms_receipt) || 0), 0);
        const hsdReceipts = dayShifts.reduce((sum: number, s: any) => sum + (parseFloat(s.hsd_receipt) || 0), 0);

        // Formula: (Opening + Receipts) - Closing = Total physical stock change (Tank Sale)
        // Only calculate variation if both opening and closing dips are present
        const msTankSale = (msOpening > 0 && msClosing > 0) ? (msOpening + msReceipts) - msClosing : 0;
        const hsdTankSale = (hsdOpening > 0 && hsdClosing > 0) ? (hsdOpening + hsdReceipts) - hsdClosing : 0;

        variationData.push({
          date,
          ms: { 
            nozzle: msNozzleSales, 
            tank: msTankSale, 
            diff: (msOpening > 0 && msClosing > 0) ? msNozzleSales - msTankSale : 0 
          },
          hsd: { 
            nozzle: hsdNozzleSales, 
            tank: hsdTankSale, 
            diff: (hsdOpening > 0 && hsdClosing > 0) ? hsdNozzleSales - hsdTankSale : 0 
          }
        });
      }
    });

    finalMsVariation = variationData.reduce((sum, row) => sum + row.ms.diff, 0);
    finalHsdVariation = variationData.reduce((sum, row) => sum + row.hsd.diff, 0);

    const totalMsSales = variationData.reduce((sum, row) => sum + row.ms.nozzle, 0);
    const totalHsdSales = variationData.reduce((sum, row) => sum + row.hsd.nozzle, 0);
    const totalProfit = totalMsSales * 4.032 + totalHsdSales * 2.5713;

    return {
      totalMsSales,
      totalHsdSales,
      totalMsVariation: finalMsVariation,
      totalHsdVariation: finalHsdVariation,
      totalProfit,
      openingDay: shifts[0],
      closingDayShift: shifts[shifts.length - 1],
      closingDayStr: `${selectedMonth}-${String(getDaysInMonth(parseISO(`${selectedMonth}-01`))).padStart(2, '0')}`,
      variationData,
      decantSummary: decantations.reduce((acc, d) => ({
        ms: acc.ms + (Number(d.receipt_ms) || 0),
        hsd: acc.hsd + (Number(d.receipt_hsd1) || 0) + (Number(d.receipt_hsd2) || 0)
      }), { ms: 0, hsd: 0 })
    };
  }, [shifts, decantations, selectedMonth]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div className="relative">
            <div className="w-12 h-12 border-4 border-blue-100 rounded-full animate-spin border-t-blue-600"></div>
            <RefreshCw className="absolute inset-0 m-auto text-blue-600 animate-pulse" size={20} />
          </div>
          <p className="text-slate-500 font-medium animate-pulse text-sm">Generating Month Analytics...</p>
        </div>
      </div>
    );
  }

  const openingStock = stats?.openingDay ? {
    ms: stats.openingDay.shift_tanks?.filter((t: any) => t.tank_name === '3-MS').reduce((sum: number, t: any) => sum + dipToLiters(parseFloat(t.manual_dip) || 0), 0),
    hsd: stats.openingDay.shift_tanks?.filter((t: any) => t.tank_name.includes('HSD')).reduce((sum: number, t: any) => sum + dipToLiters(parseFloat(t.manual_dip) || 0), 0)
  } : { ms: 0, hsd: 0 };

  const closingStock = stats?.closingDayShift ? {
    ms: stats.closingDayShift.shift_tanks?.filter((t: any) => t.tank_name === '3-MS').reduce((sum: number, t: any) => sum + dipToLiters(parseFloat(t.manual_dip) || 0), 0),
    hsd: stats.closingDayShift.shift_tanks?.filter((t: any) => t.tank_name.includes('HSD')).reduce((sum: number, t: any) => sum + dipToLiters(parseFloat(t.manual_dip) || 0), 0)
  } : null;

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto space-y-6 md:space-y-8 bg-slate-50/30 min-h-screen">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-800 tracking-tight flex items-center gap-3">
            <BarChart3 className="text-blue-600" size={32} />
            Analytics Dashboard
          </h1>
          <p className="text-slate-500 mt-1 flex items-center gap-1.5 text-sm md:text-base">
            Performance insights for <span className="font-bold text-slate-700 bg-white px-2 py-0.5 rounded-lg border border-slate-200">{format(parseISO(`${selectedMonth}-01`), 'MMMM yyyy')}</span>
          </p>
        </div>

        <div className="flex items-center gap-3 bg-white p-2 rounded-2xl border border-slate-100 shadow-sm">
          <Calendar className="text-slate-400 ml-2" size={20} />
          <input
            type="month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="border-0 focus:ring-0 text-slate-700 font-bold bg-transparent cursor-pointer"
          />
          <button
            onClick={fetchData}
            className="p-2 hover:bg-slate-50 rounded-xl transition-colors text-slate-400 hover:text-blue-600"
          >
            <RefreshCw size={18} />
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
        {[
          { label: 'Total MS Sales', value: stats?.totalMsSales, unit: 'Ltrs', icon: Droplets, color: 'blue' },
          { label: 'Total HSD Sales', value: stats?.totalHsdSales, unit: 'Ltrs', icon: Droplets, color: 'emerald' },
          {
            label: 'MS Variation',
            value: stats?.totalMsVariation,
            unit: 'Ltrs',
            icon: stats?.totalMsVariation! >= 0 ? TrendingUp : TrendingDown,
            color: stats?.totalMsVariation! >= 0 ? 'emerald' : 'red',
            showTrend: true
          },
          {
            label: 'HSD Variation',
            value: stats?.totalHsdVariation,
            unit: 'Ltrs',
            icon: stats?.totalHsdVariation! >= 0 ? TrendingUp : TrendingDown,
            color: stats?.totalHsdVariation! >= 0 ? 'emerald' : 'red',
            showTrend: true
          },
        ].map((kpi, i) => (
          <div key={i} className="bg-white p-6 rounded-2xl md:rounded-[2rem] border border-slate-100 shadow-sm hover:shadow-md transition-all group overflow-hidden relative">
            <div className="flex items-center gap-4 mb-4">
              <div className={`p-3 bg-${kpi.color}-50 text-${kpi.color}-600 rounded-2xl group-hover:scale-110 transition-transform`}>
                <kpi.icon size={22} />
              </div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{kpi.label}</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className={`text-2xl md:text-3xl font-black text-slate-800 ${kpi.showTrend && kpi.value! < 0 ? 'text-red-600' : ''}`}>
                {kpi.value?.toLocaleString() || '0'}
              </span>
              <span className="text-slate-400 font-bold text-xs md:text-sm">{kpi.unit}</span>
            </div>
          </div>
        ))}

        {/* Profit Card */}
        <div className="md:col-span-2 lg:col-span-4 bg-gradient-to-br from-amber-500 to-orange-600 p-6 md:p-8 rounded-2xl md:rounded-[2.5rem] shadow-xl shadow-amber-500/20 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:scale-110 transition-transform">
            <IndianRupee size={120} className="text-white" />
          </div>
          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-white/20 backdrop-blur-md rounded-xl text-white">
                <TrendingUp size={20} />
              </div>
              <span className="text-xs font-bold text-white/80 uppercase tracking-widest">Monthly Estimated Profit</span>
            </div>
            <div className="flex items-baseline gap-3">
              <span className="text-3xl md:text-5xl font-black text-white tracking-tight">
                ₹{stats?.totalProfit.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
              </span>
              <span className="text-white/60 font-bold text-lg">INR</span>
            </div>
            <p className="text-white/60 text-xs mt-4 font-medium flex items-center gap-2">
              <Info size={14} /> Based on MS: ₹4.032/L and HSD: ₹2.5713/L profit margins
            </p>
          </div>
        </div>
      </div>

      {/* Opening & Closing Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Opening Day */}
        <div className="bg-white p-6 rounded-2xl md:rounded-3xl border border-slate-100 shadow-sm relative overflow-hidden group">
          <div className="absolute top-0 left-0 w-1.5 h-full bg-blue-500" />
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl">
                <History size={20} />
              </div>
              <div>
                <h3 className="font-black text-slate-800 text-lg">Opening Day Stats</h3>
                <p className="text-slate-400 text-[10px] font-bold uppercase tracking-wider">1st {format(parseISO(`${selectedMonth}-01`), 'MMM yyyy')}</p>
              </div>
            </div>
          </div>

          {stats?.openingDay ? (
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-slate-50/50 p-4 rounded-xl md:rounded-2xl border border-slate-100 group-hover:bg-blue-50/30 transition-colors">
                <p className="text-[9px] font-black text-slate-400 uppercase mb-1 tracking-widest">MS Stock</p>
                <p className="text-lg md:text-xl font-black text-slate-800">{openingStock.ms?.toLocaleString()} <span className="text-[10px] font-bold text-slate-400 uppercase">L</span></p>
              </div>
              <div className="bg-slate-50/50 p-4 rounded-xl md:rounded-2xl border border-slate-100 group-hover:bg-blue-50/30 transition-colors">
                <p className="text-[9px] font-black text-slate-400 uppercase mb-1 tracking-widest">HSD Stock</p>
                <p className="text-lg md:text-xl font-black text-slate-800">{openingStock.hsd?.toLocaleString()} <span className="text-[10px] font-bold text-slate-400 uppercase">L</span></p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-slate-400 border-2 border-dashed border-slate-100 rounded-2xl">
              <AlertCircle size={24} className="mb-2 opacity-20" />
              <p className="font-bold text-xs uppercase tracking-widest">No Baseline Data</p>
            </div>
          )}
        </div>

        {/* Closing Day */}
        <div className="bg-white p-6 rounded-2xl md:rounded-3xl border border-slate-100 shadow-sm relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-1.5 h-full bg-emerald-500" />
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl">
                <Database size={20} />
              </div>
              <div>
                <h3 className="font-black text-slate-800 text-lg">Closing Day Stats</h3>
                <p className="text-slate-400 text-[10px] font-bold uppercase tracking-wider">Audit Results</p>
              </div>
            </div>
          </div>

          {isFuture(parseISO(stats?.closingDayStr || '')) ? (
            <div className="flex flex-col items-center justify-center py-8 bg-slate-50/50 border-2 border-dashed border-slate-100 rounded-2xl">
              <Clock className="text-slate-300 animate-pulse mb-2" size={24} />
              <p className="font-black text-slate-400 uppercase tracking-widest text-[9px] mb-1">Month in Progress</p>
            </div>
          ) : closingStock ? (
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-slate-50/50 p-4 rounded-xl md:rounded-2xl border border-slate-100 group-hover:bg-emerald-50/30 transition-colors">
                <p className="text-[9px] font-black text-slate-400 uppercase mb-1 tracking-widest">MS Stock</p>
                <p className="text-lg md:text-xl font-black text-slate-800">{closingStock.ms?.toLocaleString()} <span className="text-[10px] font-bold text-slate-400 uppercase">L</span></p>
              </div>
              <div className="bg-slate-50/50 p-4 rounded-xl md:rounded-2xl border border-slate-100 group-hover:bg-emerald-50/30 transition-colors">
                <p className="text-[9px] font-black text-slate-400 uppercase mb-1 tracking-widest">HSD Stock</p>
                <p className="text-lg md:text-xl font-black text-slate-800">{closingStock.hsd?.toLocaleString()} <span className="text-[10px] font-bold text-slate-400 uppercase">L</span></p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-slate-400 border-2 border-dashed border-slate-100 rounded-2xl">
              <AlertCircle size={24} className="mb-2 opacity-20" />
              <p className="font-bold text-xs uppercase tracking-widest">Awaiting Closure</p>
            </div>
          )}
        </div>
      </div>

      {/* Receipts History */}
      <div className="bg-white rounded-2xl md:rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-50 text-amber-600 rounded-xl">
              <History size={20} />
            </div>
            <h3 className="font-black text-slate-800 text-lg">Receipt History</h3>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50/50">
                <th className="px-6 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-200">Date</th>
                <th className="px-6 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-200">Vehicle</th>
                <th className="px-6 py-4 text-right text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-200">MS</th>
                <th className="px-6 py-4 text-right text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-200">HSD</th>
                <th className="px-6 py-4 text-right text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-200">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {decantations.map((d, i) => (
                <tr key={i} className="hover:bg-slate-50/50">
                  <td className="px-6 py-4 font-bold text-slate-700 border-r border-slate-100">{format(parseISO(d.date), 'dd MMM')}</td>
                  <td className="px-6 py-4 text-slate-500 font-medium">{d.vehicle_no}</td>
                  <td className="px-6 py-4 text-right font-black text-slate-800">{d.receipt_ms || 0}</td>
                  <td className="px-6 py-4 text-right font-black text-slate-800">{(Number(d.receipt_hsd1) + Number(d.receipt_hsd2)).toLocaleString()}</td>
                  <td className="px-6 py-4 text-right">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${d.status === 'Approved' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
                      {d.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Sales Variation Table */}
      <div className="bg-white rounded-2xl md:rounded-[3rem] shadow-sm overflow-hidden border border-slate-200">
        <div className="p-6 md:p-8 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl border border-blue-200">
              <TrendingUp size={24} />
            </div>
            <div>
              <h3 className="font-black text-slate-800 text-lg md:text-xl">Sales Variation Audit</h3>
              <p className="text-slate-500 text-xs md:text-sm font-medium">Comparison between Tank Stock & Nozzle Meters</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-[10px] md:text-xs font-bold text-slate-400 bg-slate-50 px-4 py-2 rounded-xl border border-slate-200">
            <AlertCircle size={14} className="text-amber-500" />
            Formula: [Nozzle Sale - Tank Sale]
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50/80">
                <th rowSpan={2} className="px-6 md:px-8 py-6 text-left text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] border-r border-slate-200 border-b">Date</th>
                <th colSpan={3} className="px-4 py-4 text-center text-[10px] font-black text-blue-600 uppercase tracking-[0.2em] border-b border-slate-200 border-r">Motor Spirit (MS)</th>
                <th colSpan={3} className="px-4 py-4 text-center text-[10px] font-black text-emerald-600 uppercase tracking-[0.2em] border-b border-slate-200">Diesel (HSD)</th>
              </tr>
              <tr className="bg-slate-50/50">
                <th className="px-4 py-4 text-center text-[9px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-200">Nozzle</th>
                <th className="px-4 py-4 text-center text-[9px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-200">Tank</th>
                <th className="px-4 py-4 text-center text-[9px] font-black text-slate-400 uppercase tracking-widest border-r border-b border-slate-200">Var</th>
                <th className="px-4 py-4 text-center text-[9px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-200">Nozzle</th>
                <th className="px-4 py-4 text-center text-[9px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-200">Tank</th>
                <th className="px-4 py-4 text-center text-[9px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-200">Var</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {stats?.variationData.map((row, i) => (
                <tr key={i} className="hover:bg-slate-50/80 transition-colors">
                  <td className="px-6 md:px-8 py-5 font-bold text-slate-700 border-r border-slate-200 whitespace-nowrap">{format(parseISO(row.date), 'dd MMM')}</td>

                  {/* MS */}
                  <td className="px-4 py-4 text-center text-slate-800 font-medium border-r border-slate-100">{row.ms.nozzle.toLocaleString()}</td>
                  <td className="px-4 py-4 text-center text-slate-800 font-medium border-r border-slate-100">{row.ms.tank.toLocaleString()}</td>
                  <td className={`px-4 py-4 text-center font-black border-r border-slate-200 ${row.ms.diff >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                    {row.ms.diff > 0 ? '+' : ''}{row.ms.diff.toLocaleString()}
                  </td>

                  {/* HSD */}
                  <td className="px-6 py-4 text-center text-slate-800 font-medium border-r border-slate-100">{row.hsd.nozzle.toLocaleString()}</td>
                  <td className="px-6 py-4 text-center text-slate-800 font-medium border-r border-slate-100">{row.hsd.tank.toLocaleString()}</td>
                  <td className={`px-6 py-4 text-center font-black ${row.hsd.diff >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                    {row.hsd.diff > 0 ? '+' : ''}{row.hsd.diff.toLocaleString()}
                  </td>
                </tr>
              ))}
              {stats?.variationData.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-20 text-center text-slate-500 font-bold italic">
                    Insufficient data to calculate sales variation
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot className="bg-slate-50 font-black text-slate-800 border-t border-slate-300">
              <tr>
                <td className="px-8 py-6 border-r border-slate-200 uppercase text-[10px] tracking-widest">Monthly Totals</td>
                <td className="px-6 py-5 text-center text-slate-800 border-r border-slate-100">{stats?.variationData.reduce((s, r) => s + r.ms.nozzle, 0).toLocaleString()}</td>
                <td className="px-6 py-5 text-center text-slate-800 border-r border-slate-100">{stats?.variationData.reduce((s, r) => s + r.ms.tank, 0).toLocaleString()}</td>
                <td className={`px-6 py-5 text-center border-r border-slate-200 ${stats?.totalMsVariation! >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                  {stats?.totalMsVariation! > 0 ? '+' : ''}{stats?.totalMsVariation?.toLocaleString()}
                </td>
                <td className="px-6 py-5 text-center text-slate-800 border-r border-slate-100">{stats?.variationData.reduce((s, r) => s + r.hsd.nozzle, 0).toLocaleString()}</td>
                <td className="px-6 py-5 text-center text-slate-800 border-r border-slate-100">{stats?.variationData.reduce((s, r) => s + r.hsd.tank, 0).toLocaleString()}</td>
                <td className={`px-6 py-5 text-center ${stats?.totalHsdVariation! >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                  {stats?.totalHsdVariation! > 0 ? '+' : ''}{stats?.totalHsdVariation?.toLocaleString()}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}
