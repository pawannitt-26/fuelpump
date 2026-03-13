"use client";

import { useAppStore } from '@/store/appStore';
import { t } from '@/lib/i18n';
import { Download, FileSpreadsheet, Calendar, Loader2, Fuel, Droplet, Calculator } from 'lucide-react';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { generatePDF } from '@/lib/pdf';

interface NozzleRow {
    machine: string;
    nozzleNo: string;
    product: string;
    openingS1: number;
    closingS2: number;
    testingTotal: number;
    saleVolTotal: number;
    rate: number;
    amountTotal: number;
}

export default function DsrReport() {
    const { language } = useAppStore();
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [loading, setLoading] = useState(false);

    const [dsrData, setDsrData] = useState<any>(null);

    useEffect(() => {
        async function fetchDSR() {
            setLoading(true);
            try {
                // Fetch Approved Shifts for the Date
                const { data: shifts, error } = await supabase
                    .from('shifts')
                    .select(`
            id, shift_number,
            shift_entries ( products(name), rate, sale_qty, amount, opening_meter, closing_meter, testing_qty, nozzle_no ),
            shift_sides ( machine, side, cash_received, online_received, lube_sales )
          `)
                    .eq('shift_date', date)
                    .eq('status', 'Approved');

                if (error) throw error;

                // Restructure Aggregation
                const nozzleMap = new Map<string, NozzleRow>();

                const agg = {
                    totalSale: 0,
                    lubeTotal: 0,
                    cash: { s1: 0, s2: 0, total: 0 },
                    online: { s1: 0, s2: 0, total: 0 },
                    grandTotals: { msVol: 0, hsdVol: 0, msAmt: 0, hsdAmt: 0 }
                };

                (shifts || []).forEach((s: any) => {
                    const isS1 = s.shift_number === 1;
                    const sides = s.shift_sides || [];
                    const entries = s.shift_entries || [];

                    // Calculate sides (Cash / Online / Lube)
                    let shiftCash = 0;
                    let shiftOnline = 0;
                    let shiftLube = 0;

                    sides.forEach((side: any) => {
                        shiftCash += parseFloat(side.cash_received) || 0;
                        shiftOnline += parseFloat(side.online_received) || 0;
                        shiftLube += parseFloat(side.lube_sales) || 0;
                    });

                    if (isS1) {
                        agg.cash.s1 += shiftCash;
                        agg.online.s1 += shiftOnline;
                    } else {
                        agg.cash.s2 += shiftCash;
                        agg.online.s2 += shiftOnline;
                    }

                    agg.cash.total += shiftCash;
                    agg.online.total += shiftOnline;
                    agg.lubeTotal += shiftLube;
                    agg.totalSale += shiftLube; // Lube included in total sales expectation

                    // Calculate entries (Nozzle Mapping)
                    entries.forEach((e: any) => {
                        const machine = e.nozzle_no.split('-')[0];
                        const nozNo = e.nozzle_no.split('-')[1];
                        const prod = e.products?.name === 'MS' ? 'MS' : 'HSD';

                        const nozzleKey = e.nozzle_no; // 'Front-1', 'Back-3'

                        if (!nozzleMap.has(nozzleKey)) {
                            nozzleMap.set(nozzleKey, {
                                machine,
                                nozzleNo: nozNo,
                                product: prod,
                                openingS1: 0,
                                closingS2: 0,
                                testingTotal: 0,
                                saleVolTotal: 0,
                                rate: parseFloat(e.rate) || 0,
                                amountTotal: 0
                            });
                        }

                        const row: any = nozzleMap.get(nozzleKey);

                        // Map S1 Opening or S2 Closing
                        if (isS1) {
                            row.openingS1 = parseFloat(e.opening_meter) || 0;
                            // If there is only Shift 1, its closing is the final closing so far
                            if (row.closingS2 === 0) row.closingS2 = parseFloat(e.closing_meter) || 0;
                        } else {
                            // If Shift 2 exists, its closing meter takes overriding precedence
                            row.closingS2 = parseFloat(e.closing_meter) || 0;
                            // If S1 was missing, use S2's opening as a fallback baseline
                            if (row.openingS1 === 0) row.openingS1 = parseFloat(e.opening_meter) || 0;
                        }

                        const testQty = parseFloat(e.testing_qty) || 0;
                        const amt = parseFloat(e.amount) || 0;
                        const vol = parseFloat(e.sale_qty) || 0;

                        row.testingTotal += testQty;
                        row.saleVolTotal += vol;
                        row.amountTotal += amt;
                        row.rate = parseFloat(e.rate) || row.rate;

                        // Add to Grand Product Totals
                        if (prod === 'MS') {
                            agg.grandTotals.msVol += vol;
                            agg.grandTotals.msAmt += amt;
                        } else {
                            agg.grandTotals.hsdVol += vol;
                            agg.grandTotals.hsdAmt += amt;
                        }

                        agg.totalSale += amt;
                    });
                });

                // Generate Array to sort cleanly
                const orderedNozzles = Array.from(nozzleMap.values()).sort((a, b) => {
                    if (a.machine !== b.machine) return a.machine.localeCompare(b.machine); // Front then Back
                    return parseInt(a.nozzleNo) - parseInt(b.nozzleNo); // 1, 2, 3, 4
                });

                if (shifts && shifts.length > 0) {
                    setDsrData({ agg, nozzles: orderedNozzles });
                } else {
                    setDsrData(null);
                }

            } catch (err) {
                console.error('Failed to fetch DSR', err);
            } finally {
                setLoading(false);
            }
        }
        fetchDSR();
    }, [date]);

    return (
        <div className="max-w-7xl mx-auto space-y-6 pb-20">
            <div className="flex items-center justify-between">
                <h1 className="text-3xl font-black text-slate-800 m-0 flex items-center gap-3 tracking-tight">
                    <span className="bg-blue-600 text-white p-2 rounded-xl shadow-md">
                        <FileSpreadsheet size={24} />
                    </span>
                    {t('dsrReport', language)}
                </h1>
                <div className="flex items-center gap-4 bg-white p-2 rounded-2xl shadow-sm border border-slate-200">
                    <div className="flex items-center gap-2 pl-2">
                        <Calendar size={18} className="text-slate-400" />
                        <input
                            type="date"
                            className="bg-transparent border-0 p-0 text-slate-700 font-bold focus:ring-0 cursor-pointer"
                            value={date}
                            onChange={(e) => setDate(e.target.value)}
                        />
                    </div>
                    <div className="w-px h-6 bg-slate-200"></div>
                    <button
                        onClick={() => generatePDF('dsr-receipt', `DSR_${date}`)}
                        className="btn btn-primary shadow-lg shadow-blue-500/20 flex items-center gap-2 py-2 px-6 disabled:opacity-50"
                        disabled={!dsrData}
                    >
                        <Download size={18} />
                        Download PDF
                    </button>
                </div>
            </div>

            {loading && (
                <div className="card flex justify-center items-center py-32 rounded-3xl border border-slate-100 shadow-sm bg-white">
                    <Loader2 className="animate-spin text-blue-500" size={48} />
                </div>
            )}

            {!loading && !dsrData && (
                <div className="card flex flex-col justify-center items-center gap-4 py-32 rounded-3xl border border-slate-100 shadow-sm bg-slate-50">
                    <FileSpreadsheet size={48} className="text-slate-300" />
                    <p className="text-slate-500 font-medium text-lg">No approved shifts found for {date}.</p>
                </div>
            )}

            {!loading && dsrData && (
                <div id="dsr-receipt" className="space-y-8 print-section bg-white p-4 sm:p-6 md:p-12 rounded-[2rem] shadow-xl border border-slate-100 max-w-full overflow-hidden">

                    {/* Brand Header */}
                    <div className="text-center pb-8 border-b-2 border-slate-100 relative max-w-full overflow-hidden">
                        <h2 className="text-xl sm:text-2xl md:text-4xl font-black text-slate-800 uppercase tracking-wide sm:tracking-widest md:tracking-[0.2em] break-words px-2">Maa Lakshmi Fuel Station</h2>
                        <p className="text-slate-500 font-medium tracking-wide md:tracking-widest mt-2 uppercase text-xs md:text-sm">Official Daily Sales Report</p>
                        <div className="inline-flex items-center align-center gap-2 md:gap-3 mt-4 md:mt-6 px-3 sm:px-4 md:px-6 py-2 md:py-2.5 bg-blue-50 text-blue-700 rounded-full font-bold border border-blue-100 shadow-sm text-xs sm:text-sm">
                            <Calendar size={16} className="sm:w-[18px] sm:h-[18px]" />
                            <span className="whitespace-nowrap">Report Date: {date}</span>
                        </div>
                    </div>

                    {/* Highly Detail Nozzle Grid */}
                    <div className="max-w-full overflow-hidden">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4 px-2">
                            <div className="flex items-center gap-3">
                                <Fuel className="text-blue-500 flex-shrink-0" size={24} />
                                <h3 className="text-lg sm:text-xl font-bold text-slate-800 m-0 tracking-tight">Meter Output Matrix</h3>
                            </div>
                            <span className="text-xs sm:text-sm font-medium text-slate-400 lg:hidden italic">← Swipe to view all →</span>
                        </div>
                        <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-sm -mx-4 sm:mx-0">
                            <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-slate-300 scrollbar-track-slate-100">
                                <table className="w-full text-left text-sm min-w-[800px]">
                                    <thead>
                                        <tr className="bg-slate-800 text-slate-200 font-bold uppercase tracking-wider text-[10px]">
                                            <th className="py-3 sm:py-4 px-2 sm:px-4 text-center border-b border-slate-700 sticky left-0 bg-slate-800 z-10">Machine</th>
                                            <th className="py-3 sm:py-4 px-2 sm:px-4 border-b border-slate-700">Noz</th>
                                            <th className="py-3 sm:py-4 px-2 sm:px-4 border-b border-slate-700">Prod</th>
                                            <th className="py-3 sm:py-4 px-2 sm:px-4 text-right border-b border-slate-700">Open <span className="text-slate-400 font-normal lowercase hidden sm:inline">(S-1)</span></th>
                                            <th className="py-3 sm:py-4 px-2 sm:px-4 text-right border-b border-r border-slate-700">Close <span className="text-slate-400 font-normal lowercase hidden sm:inline">(S-2)</span></th>
                                            <th className="py-3 sm:py-4 px-2 sm:px-4 text-right border-b border-slate-700 text-amber-300">Test</th>
                                            <th className="py-3 sm:py-4 px-2 sm:px-4 text-right border-b border-r border-slate-700 text-emerald-300">Sale Ltrs</th>
                                            <th className="py-3 sm:py-4 px-2 sm:px-4 text-right border-b border-slate-700">Rate</th>
                                            <th className="py-3 sm:py-4 px-2 sm:px-4 text-right border-b border-slate-700 text-blue-300">Amount</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 text-slate-700 font-medium">
                                        {dsrData.nozzles.map((n: NozzleRow, idx: number) => (
                                            <tr key={`${n.machine}-${n.nozzleNo}`} className={`${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'} hover:bg-blue-50/30 transition-colors`}>
                                                <td className="py-2 sm:py-3 px-2 sm:px-4 text-center sticky left-0 bg-inherit z-10">
                                                    <span className={`px-1.5 sm:px-2.5 py-0.5 sm:py-1 rounded-md text-[9px] sm:text-[10px] font-bold uppercase tracking-wider sm:tracking-widest ${n.machine === 'Front' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>{n.machine}</span>
                                                </td>
                                                <td className="py-2 sm:py-3 px-2 sm:px-4 font-bold text-slate-500 text-xs sm:text-sm">#{n.nozzleNo}</td>
                                                <td className="py-2 sm:py-3 px-2 sm:px-4">
                                                    <span className={`px-1.5 sm:px-2 py-0.5 rounded text-[10px] sm:text-xs font-bold ring-1 ring-inset ${n.product === 'HSD' ? 'bg-amber-50 text-amber-700 ring-amber-200' : 'bg-emerald-50 text-emerald-700 ring-emerald-200'}`}>{n.product}</span>
                                                </td>
                                                <td className="py-2 sm:py-3 px-2 sm:px-4 text-right font-mono text-xs sm:text-sm">{n.openingS1.toFixed(2)}</td>
                                                <td className="py-2 sm:py-3 px-2 sm:px-4 text-right font-mono text-xs sm:text-sm font-bold border-r border-slate-100">{n.closingS2.toFixed(2)}</td>
                                                <td className="py-2 sm:py-3 px-2 sm:px-4 text-right bg-amber-50/30 text-amber-700 font-mono text-xs sm:text-sm">{n.testingTotal > 0 ? n.testingTotal.toFixed(2) : '-'}</td>
                                                <td className="py-2 sm:py-3 px-2 sm:px-4 text-right bg-emerald-50/30 text-emerald-700 font-mono text-xs sm:text-sm font-bold border-r border-slate-100">{n.saleVolTotal.toFixed(2)}</td>
                                                <td className="py-2 sm:py-3 px-2 sm:px-4 text-right text-slate-500 font-mono text-[11px] sm:text-[13px]">₹{n.rate.toFixed(2)}</td>
                                                <td className="py-2 sm:py-3 px-2 sm:px-4 text-right font-bold text-blue-700 font-mono text-xs sm:text-sm">₹{n.amountTotal.toFixed(2)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* Aggregate Section Grid */}
                        <div className="flex flex-col lg:flex-row gap-6 lg:gap-8 mt-6">
                            {/* Left: Product & Lube Sales Summary */}
                            <div className="space-y-6 w-full lg:w-1/2">
                                <div className="bg-slate-50 p-4 sm:p-6 rounded-2xl border border-slate-200">
                                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2"><Droplet size={14} className="text-blue-500" /> Combined Sale Volumes</h3>
                                    <div className="space-y-4">
                                        <div className="flex justify-between items-end border-b border-slate-200 pb-3">
                                            <div>
                                                <div className="text-base sm:text-lg font-bold text-slate-700">MS (Petrol)</div>
                                                <div className="text-xs sm:text-sm font-medium text-slate-500">{dsrData.agg.grandTotals.msVol.toFixed(2)} Ltrs</div>
                                            </div>
                                            <div className="text-lg sm:text-xl font-black text-slate-800 font-mono">₹{dsrData.agg.grandTotals.msAmt.toFixed(2)}</div>
                                        </div>
                                        <div className="flex justify-between items-end border-b border-slate-200 pb-3">
                                            <div>
                                                <div className="text-base sm:text-lg font-bold text-slate-700">HSD (Diesel)</div>
                                                <div className="text-xs sm:text-sm font-medium text-slate-500">{dsrData.agg.grandTotals.hsdVol.toFixed(2)} Ltrs</div>
                                            </div>
                                            <div className="text-lg sm:text-xl font-black text-slate-800 font-mono">₹{dsrData.agg.grandTotals.hsdAmt.toFixed(2)}</div>
                                        </div>
                                        <div className="flex justify-between items-end pt-2">
                                            <div>
                                                <div className="text-base sm:text-lg font-bold text-slate-700">Lube Sales</div>
                                                <div className="text-xs sm:text-sm font-medium text-amber-600">Additional Goods</div>
                                            </div>
                                            <div className="text-lg sm:text-xl font-black text-amber-600 font-mono">₹{dsrData.agg.lubeTotal.toFixed(2)}</div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Right: Financial Reconciliation */}
                            <div className="space-y-6 w-full lg:w-1/2">
                                <div className="bg-slate-800 p-6 sm:p-8 rounded-2xl shadow-xl border border-slate-700 text-white relative">
                                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-6 flex items-center gap-2"><Calculator size={14} className="text-emerald-400" /> Sales Reconciliation</h3>

                                    <div className="space-y-4 relative z-10">
                                        <div className="flex justify-between items-center bg-white/5 p-3 sm:p-4 rounded-xl border border-white/10">
                                            <span className="text-slate-300 font-medium tracking-wide text-sm sm:text-base">Expected Total Sales</span>
                                            <span className="text-xl sm:text-2xl font-black font-mono">₹{dsrData.agg.totalSale.toFixed(2)}</span>
                                        </div>

                                        <div className="flex justify-between items-center p-2 px-3 sm:px-4">
                                            <span className="text-emerald-300 font-medium tracking-wide text-xs sm:text-sm">+ Total Cash Handed</span>
                                            <span className="text-lg sm:text-xl font-bold font-mono text-emerald-400 drop-shadow-sm">₹{dsrData.agg.cash.total.toFixed(2)}</span>
                                        </div>

                                        <div className="flex justify-between items-center p-2 px-3 sm:px-4 border-b border-white/10 pb-6">
                                            <span className="text-indigo-300 font-medium tracking-wide text-xs sm:text-sm">+ Total Digital Handed</span>
                                            <span className="text-lg sm:text-xl font-bold font-mono text-indigo-400 drop-shadow-sm">₹{dsrData.agg.online.total.toFixed(2)}</span>
                                        </div>

                                        <div className="flex justify-between items-center pt-2 px-2">
                                            <span className="text-slate-400 font-bold uppercase tracking-widest text-xs">Total Collected</span>
                                            <span className="text-base sm:text-lg font-bold font-mono text-slate-300">₹{(dsrData.agg.cash.total + dsrData.agg.online.total).toFixed(2)}</span>
                                        </div>

                                        <div className={`mt-6 p-4 sm:p-5 rounded-xl border flex justify-between items-center ${((dsrData.agg.cash.total + dsrData.agg.online.total) - dsrData.agg.totalSale) < 0 ? 'bg-red-500/20 border-red-500/30 text-rose-300' : 'bg-green-500/20 border-green-500/30 text-emerald-300'}`}>
                                            <span className="font-bold uppercase tracking-widest text-xs sm:text-sm">Net Balance</span>
                                            <span className="text-2xl sm:text-3xl font-black font-mono">
                                                {((dsrData.agg.cash.total + dsrData.agg.online.total) - dsrData.agg.totalSale) > 0 ? '+' : ''}
                                                ₹{((dsrData.agg.cash.total + dsrData.agg.online.total) - dsrData.agg.totalSale).toFixed(2)}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Signature Block */}
                        <div className="pt-12 sm:pt-20 pb-8 flex flex-col sm:flex-row justify-between items-center sm:items-end gap-8 border-t border-slate-200 mt-12">
                            <div className="text-center">
                                <div className="w-40 sm:w-48 border-b-2 border-slate-800 mb-2"></div>
                                <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Manager Signature</span>
                            </div>
                            <div className="text-center">
                                <div className="w-40 sm:w-48 border-b-2 border-slate-800 mb-2"></div>
                                <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Admin Signature</span>
                            </div>
                        </div>

                    </div>
                </div>
            )}
        </div>
    );
}