"use client";

import React, { useState, useEffect, useMemo } from 'react';
import {
  BarChart3,
  Calendar,
  RefreshCw,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { format, parseISO, getDaysInMonth } from 'date-fns';
import { dipToLiters } from '@/lib/fuelUtils';
import { useAppStore } from '@/store/appStore';
import { useRouter } from 'next/navigation';
import { ChevronDown, ChevronUp, Info, IndianRupee } from 'lucide-react';

export default function AnalyticsPage() {
  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), 'yyyy-MM'));
  const [loading, setLoading] = useState(true);
  const [shifts, setShifts] = useState<any[]>([]);
  const [decantations, setDecantations] = useState<any[]>([]);
  const [activeMobileTank, setActiveMobileTank] = useState<'T1' | 'T2' | 'T3'>('T1');
  const [showProfitFormula, setShowProfitFormula] = useState(false);
  const [liveRates, setLiveRates] = useState<Record<string, number>>({ MS: 106.06, HSD: 92.27 });

  const { user } = useAppStore();
  const router = useRouter();

  useEffect(() => {
    if (user && user.role !== 'Admin') {
      router.push('/dashboard/manager');
    }
  }, [user, router]);

  useEffect(() => {
    if (user?.role === 'Admin') {
      fetchData();
    }
  }, [selectedMonth, user]);

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
          shift_entries ( nozzle_no, opening_meter, closing_meter, testing_qty, amount ),
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

      // 3. Fetch Latest Rates from DB
      const { data: prodsData } = await supabase.from('products').select('id, name');
      const ratesMap: Record<string, number> = { MS: 106.06, HSD: 92.27 };
      if (prodsData) {
        await Promise.all(prodsData.map(async (p) => {
          const { data: rData } = await supabase
            .from('rates')
            .select('rate')
            .eq('product_id', p.id)
            .order('effective_date', { ascending: false })
            .limit(1);
          if (rData?.[0]?.rate) {
            ratesMap[p.name] = parseFloat(rData[0].rate);
          }
        }));
      }
      setLiveRates(ratesMap);

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

    const variationData: any[] = [];

    // Grouping by Shift (Date + Shift Number)
    shifts.forEach((shift, index) => {
      const currentShiftNozzleSales = { tank1: 0, tank2: 0, tank3: 0 };
      const currentShiftNozzleAmounts = { tank1: 0, tank2: 0, tank3: 0 };

      shift.shift_entries?.forEach((entry: any) => {
        const sale = (parseFloat(entry.closing_meter) || 0) - (parseFloat(entry.opening_meter) || 0) - (parseFloat(entry.testing_qty) || 0);
        const amount = parseFloat(entry.amount) || 0;

        // Mapping Logic:
        // Tank 1 (HSD-1): Front-1, Front-2
        // Tank 2 (HSD-2): Back-1, Back-2
        // Tank 3 (MS-3): Front-3, Front-4, Back-3, Back-4
        if (['Front-1', 'Front-2'].includes(entry.nozzle_no)) {
          currentShiftNozzleSales.tank1 += sale;
          currentShiftNozzleAmounts.tank1 += amount;
        } else if (['Back-1', 'Back-2'].includes(entry.nozzle_no)) {
          currentShiftNozzleSales.tank2 += sale;
          currentShiftNozzleAmounts.tank2 += amount;
        } else if (['Front-3', 'Front-4', 'Back-3', 'Back-4'].includes(entry.nozzle_no)) {
          currentShiftNozzleSales.tank3 += sale;
          currentShiftNozzleAmounts.tank3 += amount;
        }
      });

      // Tank Sale (Physical) calculation
      // For shift-wise variation, we need the NEXT shift's opening dip as our closing dip.
      const nextShift = shifts[index + 1];

      let tank1Variation = 0;
      let tank2Variation = 0;
      let tank3Variation = 0;
      let tank1Physical = 0;
      let tank2Physical = 0;
      let tank3Physical = 0;

      if (nextShift) {
        const getShiftDip = (s: any, tankName: string) => {
          const match = s.shift_tanks?.find((t: any) => t.tank_name === tankName);
          return parseFloat(match?.manual_dip) || 0;
        };

        const t1Opening = getShiftDip(shift, '1-HSD');
        const t2Opening = getShiftDip(shift, '2-HSD');
        const t3Opening = getShiftDip(shift, '3-MS');

        const t1Closing = getShiftDip(nextShift, '1-HSD');
        const t2Closing = getShiftDip(nextShift, '2-HSD');
        const t3Closing = getShiftDip(nextShift, '3-MS');

        const t1Receipt = parseFloat(shift.hsd_receipt) || 0; // Assuming receipts are tied to the shift they were entered in
        const t2Receipt = 0; // If total hsd_receipt covers both, we might need more logic, but user says HSD-1 and HSD-2 are separate tanks. 
        // Typically, decantations are mapped to specific tanks.
        // Let's look at decantations for the exact shift if possible.

        // Refined Receipt logic:
        const t1VolOpening = dipToLiters(t1Opening);
        const t2VolOpening = dipToLiters(t2Opening);
        const t3VolOpening = dipToLiters(t3Opening);
        const t1VolClosing = dipToLiters(t1Closing);
        const t2VolClosing = dipToLiters(t2Closing);
        const t3VolClosing = dipToLiters(t3Closing);

        // Receipts from the shifts table (usually entered in shift 1 or 2)
        // Wait, the decantations table has receipt_hsd1 and receipt_hsd2!
        // Let's find decantations for this specific date
        const dayDecants = decantations.filter(d => d.date === shift.shift_date);
        const t1ReceiptVol = dayDecants.reduce((sum, d) => sum + (parseFloat(d.receipt_hsd1) || 0), 0) / (shift.shift_number === 1 ? 1 : 1);
        // This is tricky because decants are daily. Let's assume receipts happen in Shift 1 for calculation simplicity OR check shift_date.
        // For now, let's use the shift's own receipt fields if they exist.
        const sT1Receipt = parseFloat(shift.hsd_receipt_1) || 0; // Hypothetical, let's stick to decantations if available.

        // Standard formula: Opening + Receipt - Closing = Physical Sale
        // Since decantations are daily, let's only add receipts to the shift they belong to.
        // If we don't know the shift of receipt, we'll assign it to shift 1.
        const isShift1 = shift.shift_number === 1;
        const t1Rec = isShift1 ? dayDecants.reduce((sum, d) => sum + (parseFloat(d.receipt_hsd1) || 0), 0) : 0;
        const t2Rec = isShift1 ? dayDecants.reduce((sum, d) => sum + (parseFloat(d.receipt_hsd2) || 0), 0) : 0;
        const t3Rec = isShift1 ? dayDecants.reduce((sum, d) => sum + (parseFloat(d.receipt_ms) || 0), 0) : 0;

        tank1Physical = (t1VolOpening > 0 && t1VolClosing > 0) ? (t1VolOpening + t1Rec) - t1VolClosing : 0;
        tank2Physical = (t2VolOpening > 0 && t2VolClosing > 0) ? (t2VolOpening + t2Rec) - t2VolClosing : 0;
        tank3Physical = (t3VolOpening > 0 && t3VolClosing > 0) ? (t3VolOpening + t3Rec) - t3VolClosing : 0;

        if (t1VolOpening > 0 && t1VolClosing > 0) tank1Variation = currentShiftNozzleSales.tank1 - tank1Physical;
        if (t2VolOpening > 0 && t2VolClosing > 0) tank2Variation = currentShiftNozzleSales.tank2 - tank2Physical;
        if (t3VolOpening > 0 && t3VolClosing > 0) tank3Variation = currentShiftNozzleSales.tank3 - tank3Physical;
      }

      variationData.push({
        date: shift.shift_date,
        shift_number: shift.shift_number,
        t1: { nozzle: currentShiftNozzleSales.tank1, tank: tank1Physical, diff: tank1Variation, amount: currentShiftNozzleAmounts.tank1 },
        t2: { nozzle: currentShiftNozzleSales.tank2, tank: tank2Physical, diff: tank2Variation, amount: currentShiftNozzleAmounts.tank2 },
        t3: { nozzle: currentShiftNozzleSales.tank3, tank: tank3Physical, diff: tank3Variation, amount: currentShiftNozzleAmounts.tank3 },
      });
    });

    // Month Start Readings (First shift of the month)
    const firstShift = shifts[0];
    const monthStartReadings = firstShift?.shift_entries?.map((e: any) => ({
      nozzle: e.nozzle_no,
      reading: e.opening_meter
    })) || [];

    // Latest Shift Readings (Last recorded shift)
    const latestShift = shifts[shifts.length - 1];
    const latestClosingReadings = latestShift?.shift_entries?.map((e: any) => ({
      nozzle: e.nozzle_no,
      reading: e.closing_meter
    })) || [];

    const nozzleSalesSummary = monthStartReadings.map((start: any) => {
      const end = latestClosingReadings.find((r: any) => r.nozzle === start.nozzle);
      const opening = parseFloat(start.reading) || 0;
      const closing = parseFloat(end?.reading) || 0;
      return {
        nozzle: start.nozzle,
        opening,
        closing,
        sale: (closing > 0 && opening > 0 && closing >= opening) ? (closing - opening) : 0
      };
    });

    const totalT1Sales = variationData.reduce((sum, row) => sum + row.t1.nozzle, 0);
    const totalT2Sales = variationData.reduce((sum, row) => sum + row.t2.nozzle, 0);
    const totalT3Sales = variationData.reduce((sum, row) => sum + row.t3.nozzle, 0);

    // Total profit: MS * 4.032 + HSD * 2.5713
    // T1 & T2 are HSD, T3 is MS
    const totalProfit = (totalT3Sales * 4.032) + ((totalT1Sales + totalT2Sales) * 2.5713);

    // Total Sales Amounts (from shift entries)
    const totalSalesAmountMS = variationData.reduce((sum, row) => sum + row.t3.amount, 0);
    const totalSalesAmountHSD = variationData.reduce((sum, row) => sum + row.t1.amount + row.t2.amount, 0);
    const totalSalesAmountOverall = totalSalesAmountMS + totalSalesAmountHSD;

    // Total Spent on Fuel (from decantations)
    const totalSpentMS = decantations.reduce((sum, d) => sum + (parseFloat(d.invoice_amount_ms) || 0), 0);
    const totalSpentHSD = decantations.reduce((sum, d) => sum + (parseFloat(d.invoice_amount_hsd) || 0), 0);
    const totalSpentOverall = totalSpentMS + totalSpentHSD;

    // Total Receipt Volumes
    const totalReceiptMS = decantations.reduce((sum, d) => sum + (parseFloat(d.receipt_ms) || 0), 0);
    const totalReceiptHSD = decantations.reduce((sum, d) => sum + (parseFloat(d.receipt_hsd1) || 0) + (parseFloat(d.receipt_hsd2) || 0), 0);

    // --- Theoretical Profit ---
    const getTankVolumes = (s: any) => {
      if (!s) return { t1: 0, t2: 0, t3: 0 };
      const t1 = parseFloat(s.shift_tanks?.find((t: any) => t.tank_name === '1-HSD')?.manual_dip) || 0;
      const t2 = parseFloat(s.shift_tanks?.find((t: any) => t.tank_name === '2-HSD')?.manual_dip) || 0;
      const t3 = parseFloat(s.shift_tanks?.find((t: any) => t.tank_name === '3-MS')?.manual_dip) || 0;
      return {
        t1: dipToLiters(t1),
        t2: dipToLiters(t2),
        t3: dipToLiters(t3)
      };
    };

    const openingTanks = getTankVolumes(firstShift);
    const closingTanks = getTankVolumes(latestShift);
    
    // Product-wise Depletion Logic (Net per product group)
    const netMSDepletion = openingTanks.t3 - closingTanks.t3;
    const netHSDDepletion = (openingTanks.t1 + openingTanks.t2) - (closingTanks.t1 + closingTanks.t2);
    
    // Average cost per product (Using Live Rates from DB as requested)
    const avgCostMS = liveRates.MS;
    const avgCostHSD = liveRates.HSD;
    
    const depletionValueMS = netMSDepletion > 0 ? (netMSDepletion * avgCostMS) : 0;
    const depletionValueHSD = netHSDDepletion > 0 ? (netHSDDepletion * avgCostHSD) : 0;
    
    const depletionValue = depletionValueMS + depletionValueHSD;
    const theoreticalProfit = totalSalesAmountOverall - totalSpentOverall - depletionValue;

    return {
      totalT1Sales,
      totalT2Sales,
      totalT3Sales,
      totalProfit,
      totalSpentMS,
      totalSpentHSD,
      totalSpentOverall,
      totalSalesAmountMS,
      totalSalesAmountHSD,
      totalSalesAmountOverall,
      theoreticalProfit,
      stockDepletion: (netMSDepletion > 0 ? netMSDepletion : 0) + (netHSDDepletion > 0 ? netHSDDepletion : 0),
      depletionValue,
      avgCostMS,
      avgCostHSD,
      openingTanks,
      closingTanks,
      totalReceiptMS,
      totalReceiptHSD,
      monthStartReadings,
      latestClosingReadings,
      nozzleSalesSummary,
      firstShiftDate: firstShift?.shift_date,
      latestShiftDate: latestShift?.shift_date,
      variationData,
      totalT1Variation: variationData.reduce((sum, row) => sum + row.t1.diff, 0),
      totalT2Variation: variationData.reduce((sum, row) => sum + row.t2.diff, 0),
      totalT3Variation: variationData.reduce((sum, row) => sum + row.t3.diff, 0),
    };
  }, [shifts, decantations, selectedMonth, liveRates]);

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



  return (
    <div className="p-2 sm:p-4 md:p-6 max-w-7xl mx-auto space-y-4 bg-slate-50/50 min-h-screen text-slate-800 overflow-hidden">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-800 tracking-tight flex items-center gap-2">
            <BarChart3 className="text-blue-600" size={20} />
            Analytics Dashboard
          </h1>
        </div>

        <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border border-slate-200 shadow-sm">
          <Calendar className="text-slate-400" size={16} />
          <input
            type="month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="border-0 focus:ring-0 text-slate-700 font-semibold bg-transparent cursor-pointer text-sm p-0 w-32"
          />
          <button
            onClick={fetchData}
            className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-blue-600 transition-colors"
            title="Refresh Data"
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 sm:gap-3">
        {[
          { label: 'T1 (HSD-1)', value: stats?.totalT1Sales, unit: 'L', color: 'text-blue-600' },
          { label: 'T2 (HSD-2)', value: stats?.totalT2Sales, unit: 'L', color: 'text-emerald-600' },
          { label: 'T3 (MS-3)', value: stats?.totalT3Sales, unit: 'L', color: 'text-amber-600' },
          {
            label: 'Total Var',
            value: (stats?.totalT1Variation || 0) + (stats?.totalT2Variation || 0) + (stats?.totalT3Variation || 0),
            unit: 'L',
            color: ((stats?.totalT1Variation || 0) + (stats?.totalT2Variation || 0) + (stats?.totalT3Variation || 0)) >= 0 ? 'text-emerald-600' : 'text-red-600',
          },
          {
            label: 'Est. Profit',
            value: stats?.totalProfit,
            unit: '',
            color: 'text-indigo-600',
            isCurrency: true
          }
        ].map((kpi, i) => (
          <div key={i} className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">{kpi.label}</p>
            <div className="flex items-baseline gap-1">
              {kpi.isCurrency && <span className={`font-semibold text-sm ${kpi.color}`}>₹</span>}
              <span className={`text-lg font-bold ${kpi.color}`}>
                {kpi.isCurrency
                  ? kpi.value?.toLocaleString('en-IN', { maximumFractionDigits: 0 })
                  : kpi.value?.toLocaleString() || '0'}
              </span>
              {!kpi.isCurrency && <span className="text-xs text-slate-400 font-medium">{kpi.unit}</span>}
            </div>
          </div>
        ))}
      </div>

      {/* Financial Purchase Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
        {[
          { label: 'Purchase: Petrol (MS)', value: stats?.totalSpentMS, color: 'text-amber-600' },
          { label: 'Purchase: Diesel (HSD)', value: stats?.totalSpentHSD, color: 'text-emerald-600' },
          { label: 'Total Fuel Purchase', value: stats?.totalSpentOverall, color: 'text-slate-900' },
        ].map((kpi, i) => (
          <div key={i} className={`bg-white p-3 rounded-xl border border-slate-200 shadow-sm`}>
            <p className={`text-[10px] font-bold uppercase tracking-wider mb-1 text-slate-400`}>{kpi.label}</p>
            <div className="flex items-baseline gap-1">
              <span className={`font-semibold text-sm ${kpi.color}`}>₹</span>
              <span className={`text-lg font-bold ${kpi.color}`}>
                {kpi.value?.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
              </span>
            </div>
          </div>
        ))}
      </div>
      {/* Financial Sales Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
        {[
          { label: 'Sales: Petrol (MS)', value: stats?.totalSalesAmountMS, color: 'text-amber-600' },
          { label: 'Sales: Diesel (HSD)', value: stats?.totalSalesAmountHSD, color: 'text-emerald-600' },
          { label: 'Total Fuel Sales', value: stats?.totalSalesAmountOverall, color: 'text-slate-900' },
        ].map((kpi, i) => (
          <div key={i} className={`bg-white p-3 rounded-xl border border-slate-200 shadow-sm`}>
            <p className={`text-[10px] font-bold uppercase tracking-wider mb-1 text-slate-400`}>{kpi.label}</p>
            <div className="flex items-baseline gap-1">
              <span className={`font-semibold text-sm ${kpi.color}`}>₹</span>
              <span className={`text-lg font-bold ${kpi.color}`}>
                {kpi.value?.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Theoretical Profit Card */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl">
              <IndianRupee size={20} />
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Theoretical Profit (Net)</p>
              <h2 className={`text-2xl font-black ${(stats?.theoreticalProfit || 0) >= 0 ? 'text-slate-800' : 'text-red-600'}`}>
                ₹ {stats?.theoreticalProfit?.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
              </h2>
            </div>
          </div>
          <button
            onClick={() => setShowProfitFormula(!showProfitFormula)}
            className="flex items-center gap-1.5 text-[10px] font-bold text-blue-600 bg-blue-50 px-3 py-1.5 rounded-lg hover:bg-blue-100 transition-colors"
          >
            <Info size={14} />
            {showProfitFormula ? 'Hide Formula' : 'Audit Formula'}
            {showProfitFormula ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>

        {showProfitFormula && (
          <div className="px-4 pb-4 pt-2 border-t border-slate-50 bg-slate-50/30 animate-in slide-in-from-top-2 duration-200">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-[11px]">
              <div className="space-y-1">
                <p className="text-slate-400 font-bold uppercase tracking-tighter">Gross Margin</p>
                <p className="text-slate-700 font-medium">Sales (₹{stats?.totalSalesAmountOverall.toLocaleString('en-IN')}) - Purchase (₹{stats?.totalSpentOverall.toLocaleString('en-IN')})</p>
                <p className="text-blue-600 font-bold">= ₹{(stats?.totalSalesAmountOverall! - stats?.totalSpentOverall!).toLocaleString('en-IN')}</p>
              </div>
              <div className="space-y-1">
                <p className="text-slate-400 font-bold uppercase tracking-tighter">Stock Audit (Tank-wise)</p>
                <div className="space-y-1 mt-1">
                  {[
                    { label: 'T1 (HSD)', open: stats?.openingTanks.t1, close: stats?.closingTanks.t1 },
                    { label: 'T2 (HSD)', open: stats?.openingTanks.t2, close: stats?.closingTanks.t2 },
                    { label: 'T3 (MS)', open: stats?.openingTanks.t3, close: stats?.closingTanks.t3 },
                  ].map((tank, i) => (
                    <div key={i} className="flex justify-between border-b border-slate-100 pb-0.5 last:border-0">
                      <span className="text-slate-500">{tank.label}:</span>
                      <span className="font-medium text-slate-700">
                        {tank.open?.toLocaleString()} → {tank.close?.toLocaleString()} 
                        <span className={`ml-1 text-[9px] ${(tank.close || 0) < (tank.open || 0) ? 'text-amber-600' : 'text-emerald-600'}`}>
                          ({((tank.close || 0) - (tank.open || 0)).toLocaleString()})
                        </span>
                      </span>
                    </div>
                  ))}
                  <div className="pt-1 text-[9px] text-slate-400 font-bold uppercase border-t border-slate-100 mt-1">
                    Rates: MS @ ₹{stats?.avgCostMS.toFixed(2)} | HSD @ ₹{stats?.avgCostHSD.toFixed(2)}
                  </div>
                </div>
                <p className="text-amber-600 font-bold pt-1">
                  Depletion Adj: - ₹{stats?.depletionValue?.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-slate-400 font-bold uppercase tracking-tighter">Final Calculation</p>
                <div className="bg-white p-2 rounded border border-slate-100 space-y-1">
                  <div className="flex justify-between text-slate-500">
                    <span>Gross Margin:</span>
                    <span>₹{(stats?.totalSalesAmountOverall! - stats?.totalSpentOverall!).toLocaleString('en-IN')}</span>
                  </div>
                  <div className="flex justify-between text-amber-600">
                    <span>Stock Depletion:</span>
                    <span>- ₹{stats?.depletionValue?.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
                  </div>
                  <div className="flex justify-between border-t border-slate-100 pt-1 font-black text-indigo-600 text-[13px]">
                    <span>Net Profit:</span>
                    <span>₹{stats?.theoreticalProfit?.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Fuel Sold Stats Bar */}
      <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center gap-3">
        <div className="whitespace-nowrap">
          <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
            Volume Dist.
          </h3>
        </div>
        <div className="flex-1 w-full flex h-5 rounded overflow-hidden border border-slate-100">
          {[
            { label: 'HSD-1', value: stats?.totalT1Sales || 0, color: 'bg-blue-500' },
            { label: 'HSD-2', value: stats?.totalT2Sales || 0, color: 'bg-emerald-500' },
            { label: 'MS-3', value: stats?.totalT3Sales || 0, color: 'bg-amber-500' }
          ].map((tank, i) => {
            const total = (stats?.totalT1Sales || 0) + (stats?.totalT2Sales || 0) + (stats?.totalT3Sales || 0);
            const width = total > 0 ? (tank.value / total) * 100 : 0;
            if (width === 0) return null;
            return (
              <div key={i} style={{ width: `${width}%` }} className={`${tank.color} relative flex items-center justify-center text-[9px] font-bold text-white px-1`}>
                {width > 10 ? `${tank.label} (${width.toFixed(0)}%)` : ''}
              </div>
            );
          })}
        </div>
      </div>

      {/* Monthly Meter & Sales Audit */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Monthly Meter & Sales Audit</h3>
          <div className="flex gap-4">
            {stats?.firstShiftDate && <span className="text-[9px] font-bold text-slate-400">Start: {format(parseISO(stats.firstShiftDate), 'dd MMM')}</span>}
            {stats?.latestShiftDate && <span className="text-[9px] font-bold text-slate-400">End: {format(parseISO(stats.latestShiftDate), 'dd MMM')}</span>}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-50/30">
                <th className="px-4 py-2 text-left text-[9px] font-bold text-slate-400 uppercase tracking-widest border-b">Nozzle</th>
                <th className="px-4 py-2 text-right text-[9px] font-bold text-slate-400 uppercase tracking-widest border-b">Opening</th>
                <th className="px-4 py-2 text-right text-[9px] font-bold text-slate-400 uppercase tracking-widest border-b">Closing</th>
                <th className="px-4 py-2 text-right text-[9px] font-bold text-blue-600 uppercase tracking-widest border-b bg-blue-50/30">Total Sale</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {stats?.nozzleSalesSummary.map((nr: any, i: number) => (
                <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-4 py-2 font-bold text-slate-600 uppercase tracking-wider">{nr.nozzle}</td>
                  <td className="px-4 py-2 text-right text-slate-500">{nr.opening.toLocaleString()}</td>
                  <td className="px-4 py-2 text-right text-slate-500">{nr.closing.toLocaleString()}</td>
                  <td className="px-4 py-2 text-right font-bold text-blue-600 bg-blue-50/10">{nr.sale.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-slate-50 font-bold border-t border-slate-200 text-slate-700">
              <tr>
                <td colSpan={3} className="px-4 py-2 text-right uppercase text-[9px] tracking-widest text-slate-400">Monthly Total (HSD)</td>
                <td className="px-4 py-2 text-right text-emerald-600">{(stats?.totalT1Sales + stats?.totalT2Sales).toLocaleString()} L</td>
              </tr>
              <tr>
                <td colSpan={3} className="px-4 py-2 text-right uppercase text-[9px] tracking-widest text-slate-400">Monthly Total (MS)</td>
                <td className="px-4 py-2 text-right text-amber-600">{stats?.totalT3Sales.toLocaleString()} L</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Receipts History */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/50">
          <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Receipt History</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-50/30">
                <th className="px-4 py-2 text-left text-[9px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100">Date</th>
                <th className="px-4 py-2 text-left text-[9px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100">Vehicle</th>
                <th className="px-4 py-2 text-right text-[9px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100">MS</th>
                <th className="px-4 py-2 text-right text-[9px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100">HSD</th>
                <th className="px-4 py-2 text-right text-[9px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {decantations.map((d, i) => (
                <tr key={i} className="hover:bg-slate-50/50">
                  <td className="px-4 py-2 font-medium text-slate-700 whitespace-nowrap">{format(parseISO(d.date), 'dd MMM')}</td>
                  <td className="px-4 py-2 text-slate-500">{d.vehicle_no}</td>
                  <td className="px-4 py-2 text-right font-medium text-slate-700">{d.receipt_ms || 0}</td>
                  <td className="px-4 py-2 text-right font-medium text-slate-700">{(Number(d.receipt_hsd1) + Number(d.receipt_hsd2)).toLocaleString()}</td>
                  <td className="px-4 py-2 text-right">
                    <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase ${d.status === 'Approved' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-amber-50 text-amber-600 border border-amber-100'}`}>
                      {d.status}
                    </span>
                  </td>
                </tr>
              ))}
              {decantations.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-4 text-center text-slate-400 text-xs italic">No receipts found for this period.</td>
                </tr>
              )}
            </tbody>
            {decantations.length > 0 && (
              <tfoot className="bg-slate-50 font-bold border-t border-slate-200 text-slate-700">
                <tr>
                  <td colSpan={2} className="px-4 py-2 text-left uppercase text-[9px] tracking-widest text-slate-400">Total Receipts</td>
                  <td className="px-4 py-2 text-right">{stats?.totalReceiptMS.toLocaleString()}</td>
                  <td className="px-4 py-2 text-right">{stats?.totalReceiptHSD.toLocaleString()}</td>
                  <td className="px-4 py-2"></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Sales Variation Table */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden border border-slate-200">
        <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Sales Variation Audit</h3>
          </div>
          <div className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider">
            Formula: [Noz - Tank]
          </div>
        </div>
        <div className="overflow-x-auto">
          {/* Mobile Tank Selector */}
          <div className="md:hidden flex gap-2 p-4 pt-0 border-b border-slate-100">
            {['T1', 'T2', 'T3'].map(t => (
              <button
                key={t}
                onClick={() => setActiveMobileTank(t as any)}
                className={`flex-1 py-1.5 text-[10px] font-bold rounded-lg border transition-colors ${activeMobileTank === t ? 'bg-slate-800 text-white border-slate-800 shadow-md' : 'bg-white text-slate-500 border-slate-200'}`}
              >
                {t === 'T1' ? 'Tank 1 (HSD)' : t === 'T2' ? 'Tank 2 (HSD)' : 'Tank 3 (MS)'}
              </button>
            ))}
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-50/80">
                <th rowSpan={2} className="px-4 py-3 text-left text-[9px] font-bold text-slate-500 uppercase tracking-widest border-r border-slate-200 border-b">Date / Shift</th>
                <th colSpan={3} className={`px-2 py-2 text-center text-[9px] font-bold text-blue-600 uppercase tracking-widest border-b border-slate-200 border-r bg-blue-50/30 ${activeMobileTank === 'T1' ? '' : 'hidden md:table-cell'}`}>Tank 1 (HSD)</th>
                <th colSpan={3} className={`px-2 py-2 text-center text-[9px] font-bold text-emerald-600 uppercase tracking-widest border-b border-slate-200 border-r bg-emerald-50/30 ${activeMobileTank === 'T2' ? '' : 'hidden md:table-cell'}`}>Tank 2 (HSD)</th>
                <th colSpan={3} className={`px-2 py-2 text-center text-[9px] font-bold text-amber-600 uppercase tracking-widest border-b border-slate-200 bg-amber-50/30 ${activeMobileTank === 'T3' ? '' : 'hidden md:table-cell'}`}>Tank 3 (MS)</th>
              </tr>
              <tr className="bg-slate-50/30">
                {/* T1 */}
                <th className={`px-2 py-1.5 text-center text-[8px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100 ${activeMobileTank === 'T1' ? '' : 'hidden md:table-cell'}`}>Noz</th>
                <th className={`px-2 py-1.5 text-center text-[8px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100 ${activeMobileTank === 'T1' ? '' : 'hidden md:table-cell'}`}>Tank</th>
                <th className={`px-2 py-1.5 text-center text-[8px] font-bold text-slate-400 uppercase tracking-widest border-r border-b border-slate-200 ${activeMobileTank === 'T1' ? '' : 'hidden md:table-cell'}`}>Var</th>
                {/* T2 */}
                <th className={`px-2 py-1.5 text-center text-[8px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100 ${activeMobileTank === 'T2' ? '' : 'hidden md:table-cell'}`}>Noz</th>
                <th className={`px-2 py-1.5 text-center text-[8px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100 ${activeMobileTank === 'T2' ? '' : 'hidden md:table-cell'}`}>Tank</th>
                <th className={`px-2 py-1.5 text-center text-[8px] font-bold text-slate-400 uppercase tracking-widest border-r border-b border-slate-200 ${activeMobileTank === 'T2' ? '' : 'hidden md:table-cell'}`}>Var</th>
                {/* T3 */}
                <th className={`px-2 py-1.5 text-center text-[8px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100 ${activeMobileTank === 'T3' ? '' : 'hidden md:table-cell'}`}>Noz</th>
                <th className={`px-2 py-1.5 text-center text-[8px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100 ${activeMobileTank === 'T3' ? '' : 'hidden md:table-cell'}`}>Tank</th>
                <th className={`px-2 py-1.5 text-center text-[8px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100 ${activeMobileTank === 'T3' ? '' : 'hidden md:table-cell'}`}>Var</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {stats?.variationData.map((row, i) => (
                <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-4 py-2 font-medium text-slate-700 border-r border-slate-100 whitespace-nowrap">
                    <span className="text-slate-400 text-[9px] mr-1">S{row.shift_number}</span>
                    {format(parseISO(row.date), 'dd MMM')}
                  </td>

                  {/* Tank 1 */}
                  <td className={`px-2 py-2 text-center text-slate-600 ${activeMobileTank === 'T1' ? '' : 'hidden md:table-cell'}`}>{row.t1.nozzle.toLocaleString()}</td>
                  <td className={`px-2 py-2 text-center text-slate-600 ${activeMobileTank === 'T1' ? '' : 'hidden md:table-cell'}`}>{row.t1.tank.toLocaleString()}</td>
                  <td className={`px-2 py-2 text-center font-bold border-r border-slate-100 ${row.t1.diff >= 0 ? 'text-emerald-600' : 'text-red-500'} ${activeMobileTank === 'T1' ? '' : 'hidden md:table-cell'}`}>
                    {row.t1.diff > 0 ? '+' : ''}{row.t1.diff.toLocaleString()}
                  </td>

                  {/* Tank 2 */}
                  <td className={`px-2 py-2 text-center text-slate-600 ${activeMobileTank === 'T2' ? '' : 'hidden md:table-cell'}`}>{row.t2.nozzle.toLocaleString()}</td>
                  <td className={`px-2 py-2 text-center text-slate-600 ${activeMobileTank === 'T2' ? '' : 'hidden md:table-cell'}`}>{row.t2.tank.toLocaleString()}</td>
                  <td className={`px-2 py-2 text-center font-bold border-r border-slate-100 ${row.t2.diff >= 0 ? 'text-emerald-600' : 'text-red-500'} ${activeMobileTank === 'T2' ? '' : 'hidden md:table-cell'}`}>
                    {row.t2.diff > 0 ? '+' : ''}{row.t2.diff.toLocaleString()}
                  </td>

                  {/* Tank 3 */}
                  <td className={`px-2 py-2 text-center text-slate-600 ${activeMobileTank === 'T3' ? '' : 'hidden md:table-cell'}`}>{row.t3.nozzle.toLocaleString()}</td>
                  <td className={`px-2 py-2 text-center text-slate-600 ${activeMobileTank === 'T3' ? '' : 'hidden md:table-cell'}`}>{row.t3.tank.toLocaleString()}</td>
                  <td className={`px-2 py-2 text-center font-bold ${row.t3.diff >= 0 ? 'text-emerald-600' : 'text-red-500'} ${activeMobileTank === 'T3' ? '' : 'hidden md:table-cell'}`}>
                    {row.t3.diff > 0 ? '+' : ''}{row.t3.diff.toLocaleString()}
                  </td>
                </tr>
              ))}
              {stats?.variationData.length === 0 && (
                <tr>
                  <td colSpan={10} className="py-8 text-center text-slate-400 italic">
                    No data available for this period.
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot className="bg-slate-50 border-t border-slate-200">
              <tr>
                <td className="px-4 py-3 border-r border-slate-200 font-bold text-[9px] uppercase tracking-widest text-slate-600">Totals</td>
                {/* T1 */}
                <td className={`px-2 py-3 text-center text-slate-700 font-semibold ${activeMobileTank === 'T1' ? '' : 'hidden md:table-cell'}`}>{stats?.totalT1Sales.toLocaleString()}</td>
                <td className={`px-2 py-3 text-center text-slate-700 font-semibold ${activeMobileTank === 'T1' ? '' : 'hidden md:table-cell'}`}>{stats?.variationData.reduce((s, r) => s + r.t1.tank, 0).toLocaleString()}</td>
                <td className={`px-2 py-3 text-center font-bold border-r border-slate-200 ${stats?.totalT1Variation! >= 0 ? 'text-emerald-600' : 'text-red-600'} ${activeMobileTank === 'T1' ? '' : 'hidden md:table-cell'}`}>
                  {stats?.totalT1Variation! > 0 ? '+' : ''}{stats?.totalT1Variation?.toLocaleString()}
                </td>
                {/* T2 */}
                <td className={`px-2 py-3 text-center text-slate-700 font-semibold ${activeMobileTank === 'T2' ? '' : 'hidden md:table-cell'}`}>{stats?.totalT2Sales.toLocaleString()}</td>
                <td className={`px-2 py-3 text-center text-slate-700 font-semibold ${activeMobileTank === 'T2' ? '' : 'hidden md:table-cell'}`}>{stats?.variationData.reduce((s, r) => s + r.t2.tank, 0).toLocaleString()}</td>
                <td className={`px-2 py-3 text-center font-bold border-r border-slate-200 ${stats?.totalT2Variation! >= 0 ? 'text-emerald-600' : 'text-red-600'} ${activeMobileTank === 'T2' ? '' : 'hidden md:table-cell'}`}>
                  {stats?.totalT2Variation! > 0 ? '+' : ''}{stats?.totalT2Variation?.toLocaleString()}
                </td>
                {/* T3 */}
                <td className={`px-2 py-3 text-center text-slate-700 font-semibold ${activeMobileTank === 'T3' ? '' : 'hidden md:table-cell'}`}>{stats?.totalT3Sales.toLocaleString()}</td>
                <td className={`px-2 py-3 text-center text-slate-700 font-semibold ${activeMobileTank === 'T3' ? '' : 'hidden md:table-cell'}`}>{stats?.variationData.reduce((s, r) => s + r.t3.tank, 0).toLocaleString()}</td>
                <td className={`px-2 py-3 text-center font-bold ${stats?.totalT3Variation! >= 0 ? 'text-emerald-600' : 'text-red-600'} ${activeMobileTank === 'T3' ? '' : 'hidden md:table-cell'}`}>
                  {stats?.totalT3Variation! > 0 ? '+' : ''}{stats?.totalT3Variation?.toLocaleString()}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}
