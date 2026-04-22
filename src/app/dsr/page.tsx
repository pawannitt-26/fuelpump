"use client";

import { useAppStore } from '@/store/appStore';
import { Download, FileSpreadsheet, Calendar, Loader2 } from 'lucide-react';
import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { generatePDF } from '@/lib/pdf';
import { format, getDaysInMonth, parseISO, subMonths, addDays } from 'date-fns';
import { dipToLiters } from '@/lib/fuelUtils';



// Nozzle sets
const MS_NOZZLES = ['Front-3', 'Front-4', 'Back-3', 'Back-4'];
const HSD_NOZZLES = ['Front-1', 'Front-2', 'Back-1', 'Back-2'];

/** Starting cumulative sales before this tracking period began (e.g. from manual records).
 *  Update these constants whenever the historical baseline changes. */
const DSR_INIT_CUM_PETROL = 0;   // Petrol (MS) litres sold before month tracking start
const DSR_INIT_CUM_DIESEL = 0;   // Diesel (HSD) litres sold before month tracking start

interface DayData { date: string; shifts: any[]; }
interface BaselineMeters { [nozzle: string]: number; }

export default function DsrReport() {
    const { language } = useAppStore();
    const [month, setMonth] = useState(new Date().toISOString().substring(0, 7));
    const [loading, setLoading] = useState(false);
    const [rawData, setRawData] = useState<DayData[]>([]);
    const [historicalCum, setHistoricalCum] = useState({ ms: DSR_INIT_CUM_PETROL, hsd: DSR_INIT_CUM_DIESEL });


    useEffect(() => {
        async function fetchAll() {
            setLoading(true);
            setRawData([]);

            try {
                const startDate = `${month}-01`;
                const daysInMonth = getDaysInMonth(parseISO(startDate));
                const endDate = `${month}-${String(daysInMonth).padStart(2, '0')}`;

                const nextMonth1st = format(addDays(parseISO(endDate), 1), 'yyyy-MM-dd');

                // ---- Cumulative overrides (reset per month) ----
                setHistoricalCum({ ms: 0, hsd: 0 });

                // ---- Fetch current month shifts + 1st day of next month ----
                const { data: shifts } = await supabase
                    .from('shifts')
                    .select(`
            id, shift_date, shift_number, ms_receipt, hsd_receipt,
            shift_entries ( nozzle_no, opening_meter, closing_meter, testing_qty ),
            shift_tanks ( tank_name, manual_dip )
          `)
                    .gte('shift_date', startDate)
                    .lte('shift_date', nextMonth1st)
                    .order('shift_date', { ascending: true })
                    .order('shift_number', { ascending: true });

                // Group by date
                const dayMap = new Map<string, DayData>();
                for (let d = 1; d <= daysInMonth; d++) {
                    const dateStr = `${month}-${String(d).padStart(2, '0')}`;
                    dayMap.set(dateStr, { date: dateStr, shifts: [] });
                }
                dayMap.set(nextMonth1st, { date: nextMonth1st, shifts: [] });

                (shifts || []).forEach((s: any) => {
                    const day = dayMap.get(s.shift_date);
                    if (day) day.shifts.push(s);
                });
                setRawData(Array.from(dayMap.values()));



            } catch (err) {
                console.error('DSR fetch error', err);
            } finally {
                setLoading(false);
            }
        }
        fetchAll();
    }, [month]);

    // ---- Build one row per date ----
    const processedRows = useMemo(() => {
        const getMetersForShifts = (shifts: any[]) => {
            const getOpen = (no: string) => {
                const s1 = shifts.find((s: any) => s.shift_number === 1);
                const s1Rec = s1?.shift_entries?.find((e: any) => e.nozzle_no === no);
                if (s1Rec) return parseFloat(s1Rec.opening_meter) || 0;
                const s2 = shifts.find((s: any) => s.shift_number === 2);
                const s2Rec = s2?.shift_entries?.find((e: any) => e.nozzle_no === no);
                if (s2Rec) return parseFloat(s2Rec.opening_meter) || 0;
                const targetEntries = shifts.flatMap((s: any) => s.shift_entries || []).filter((e: any) => e.nozzle_no === no);
                if (targetEntries.length === 0) return 0;
                const minVal = Math.min(...targetEntries.map((e: any) => parseFloat(e.opening_meter) || 0));
                return isFinite(minVal) ? minVal : 0;
            };
            const meters: Record<string, number> = {};
            [...MS_NOZZLES, ...HSD_NOZZLES].forEach(no => meters[no] = getOpen(no));
            return meters;
        };

        const getClosingMetersForShifts = (shifts: any[]) => {
            const getClose = (no: string) => {
                // Prefer Shift 2's closing meter, fallback to Shift 1
                const s2 = shifts.find((s: any) => s.shift_number === 2);
                const s2Rec = s2?.shift_entries?.find((e: any) => e.nozzle_no === no);
                if (s2Rec && s2Rec.closing_meter) return parseFloat(s2Rec.closing_meter) || 0;

                const s1 = shifts.find((s: any) => s.shift_number === 1);
                const s1Rec = s1?.shift_entries?.find((e: any) => e.nozzle_no === no);
                if (s1Rec && s1Rec.closing_meter) return parseFloat(s1Rec.closing_meter) || 0;

                return 0;
            };
            const meters: Record<string, number> = {};
            [...MS_NOZZLES, ...HSD_NOZZLES].forEach(no => meters[no] = getClose(no));
            return meters;
        };

        const daySummaries = rawData.map(day => {
            const allShifts = day.shifts;
            const meters = getMetersForShifts(allShifts);
            const closingMeters = getClosingMetersForShifts(allShifts);

            const allEntries = allShifts.flatMap((s: any) => s.shift_entries || []);
            const getTestSum = (nozzles: string[]) =>
                allEntries.filter((e: any) => nozzles.includes(e.nozzle_no))
                    .reduce((sum: number, e: any) => sum + (parseFloat(e.testing_qty) || 0), 0);

            const msTesting = getTestSum(MS_NOZZLES);
            const hsdTesting = getTestSum(HSD_NOZZLES);

            const tanks: any[] = allShifts.flatMap((s: any) => s.shift_tanks || []);
            const getValidDip = (tankName: string) => {
                const matches = tanks.filter((t: any) => t.tank_name === tankName);
                if (matches.length === 0) return 0;

                // Find the first valid dip in chronological order (i.e. Shift 1 first)
                const validMatch = matches.find((t: any) => {
                    const val = parseFloat(t.manual_dip);
                    return !isNaN(val) && val > 0;
                });
                return validMatch ? parseFloat(validMatch.manual_dip) : 0;
            };

            const msReceipt = allShifts.reduce((sum: number, s: any) => sum + (parseFloat(s.ms_receipt) || 0), 0);
            const hsdReceipt = allShifts.reduce((sum: number, s: any) => sum + (parseFloat(s.hsd_receipt) || 0), 0);

            return {
                date: day.date,
                shifts: allShifts,
                hasData: allShifts.length > 0,
                meters,
                closingMeters,
                msTesting,
                hsdTesting,
                dipMS: getValidDip('3-MS'),
                dip1HSD: getValidDip('1-HSD'),
                dip2HSD: getValidDip('2-HSD'),
                msReceipt,
                hsdReceipt,
            };
        });

        let cumPetrol = historicalCum.ms;
        let cumDiesel = historicalCum.hsd;

        // Strip the extra 1st-of-next-month day from the actual table
        return daySummaries.slice(0, -1).map((day, idx) => {
            if (!day.hasData) {
                return {
                    date: day.date, hasData: false,
                    dipMS: 0, msOpenStock: 0, msReceipt: 0, msTotalStock: 0,
                    msD1: 0, msD2: 0, msD3: 0, msD4: 0,
                    msTesting: 0, msSaleVol: 0, cumPetrol,
                    dip1HSD: 0, hsd1Vol: 0, dip2HSD: 0, hsd2Vol: 0,
                    hsdOpenStock: 0, hsdReceipt: 0, hsdTotalStock: 0,
                    hsdD1: 0, hsdD2: 0, hsdD3: 0, hsdD4: 0,
                    hsdTesting: 0, hsdSaleVol: 0, cumDiesel,
                };
            }

            let msSaleVol = 0;
            let hsdSaleVol = 0;

            if (day.hasData) {
                msSaleVol = MS_NOZZLES.reduce((sum, no) => sum + (day.closingMeters[no] - day.meters[no]), 0) - day.msTesting;
                hsdSaleVol = HSD_NOZZLES.reduce((sum, no) => sum + (day.closingMeters[no] - day.meters[no]), 0) - day.hsdTesting;
            }

            // Prevent negative sales if something was entered wrong
            msSaleVol = Math.max(0, msSaleVol);
            hsdSaleVol = Math.max(0, hsdSaleVol);

            // Cumulative ONLY increases for real calculated sales
            cumPetrol += msSaleVol;
            cumDiesel += hsdSaleVol;

            const msOpenStock = dipToLiters(day.dipMS);
            const hsd1Vol = dipToLiters(day.dip1HSD);
            const hsd2Vol = dipToLiters(day.dip2HSD);
            const hsdOpenStock = hsd1Vol + hsd2Vol;

            return {
                date: day.date,
                hasData: true,
                dipMS: day.dipMS, msOpenStock, msReceipt: day.msReceipt, msTotalStock: msOpenStock + day.msReceipt,
                msD1: day.meters['Back-3'],
                msD2: day.meters['Back-4'],
                msD3: day.meters['Front-3'],
                msD4: day.meters['Front-4'],
                msTesting: day.msTesting, msSaleVol, cumPetrol,
                dip1HSD: day.dip1HSD, hsd1Vol, dip2HSD: day.dip2HSD, hsd2Vol,
                hsdOpenStock, hsdReceipt: day.hsdReceipt, hsdTotalStock: hsdOpenStock + day.hsdReceipt,
                hsdD1: day.meters['Back-1'],
                hsdD2: day.meters['Back-2'],
                hsdD3: day.meters['Front-1'],
                hsdD4: day.meters['Front-2'],
                hsdTesting: day.hsdTesting, hsdSaleVol, cumDiesel,
            };
        });
    }, [rawData]);

    const hasData = processedRows.some(d => d.hasData);
    const monthLabel = format(parseISO(`${month}-01`), 'MMMM yyyy').toUpperCase();

    const thBase = "py-2 px-2 text-center font-bold text-[10px] border border-slate-300 whitespace-nowrap";
    const tdBase = "py-1.5 px-2 text-right text-xs border border-slate-200 font-mono";
    const tdLabel = "py-1.5 px-2 text-xs border border-slate-200 font-bold text-slate-700";

    return (
        <div className="max-w-full mx-auto space-y-4 sm:space-y-6 pb-20">
            {/* Header */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4 bg-white p-3 sm:p-4 rounded-xl sm:rounded-2xl shadow-sm border border-slate-200">
                <h1 className="text-lg sm:text-2xl font-black text-slate-800 m-0 flex items-center gap-2 sm:gap-3 tracking-tight">
                    <span className="bg-blue-600 text-white p-1.5 sm:p-2 rounded-lg sm:rounded-xl shadow-md"><FileSpreadsheet size={18} /></span>
                    Monthly DSR
                </h1>
                <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto">
                    <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 sm:px-4 py-2 rounded-lg sm:rounded-xl flex-1 sm:flex-initial">
                        <Calendar size={14} className="text-slate-400" />
                        <input type="month" className="bg-transparent border-0 p-0 text-slate-700 font-bold focus:ring-0 cursor-pointer text-sm sm:text-base min-w-0"
                            value={month} onChange={(e) => setMonth(e.target.value)} />
                    </div>
                    <button onClick={() => generatePDF('dsr-receipt', `DSR_${month}`)} disabled={!hasData}
                        className="btn btn-primary shadow-lg shadow-blue-500/20 flex items-center gap-2 py-2 px-3 sm:px-5 disabled:opacity-50 text-sm shrink-0">
                        <Download size={14} /> PDF
                    </button>
                </div>
            </div>



            {loading && (
                <div className="card flex justify-center items-center py-32 bg-white rounded-3xl border border-slate-100">
                    <Loader2 className="animate-spin text-blue-500" size={48} />
                </div>
            )}

            {!loading && !hasData && (
                <div className="card flex flex-col justify-center items-center gap-4 py-32 rounded-3xl border border-slate-100 bg-slate-50">
                    <FileSpreadsheet size={48} className="text-slate-300" />
                    <p className="text-slate-500 font-medium text-lg">No shifts in {monthLabel}.</p>
                </div>
            )}

            {!loading && hasData && (
                <div id="dsr-receipt" className="bg-white rounded-xl sm:rounded-2xl shadow-xl border border-slate-100 overflow-hidden">
                    <div className="text-center py-4 sm:py-6 border-b border-slate-200 bg-slate-50">
                        <h2 className="text-base sm:text-2xl font-black text-slate-800 tracking-widest uppercase m-0">Maa Lakshmi Fuel Station</h2>
                        <p className="text-slate-500 font-medium uppercase tracking-widest text-[10px] sm:text-xs mt-1">Monthly DSR — {monthLabel}</p>
                    </div>

                    {/* ======= PETROL SECTION ======= */}
                    <div className="overflow-x-auto hide-scrollbar">
                        <table className="w-full border-collapse text-xs" style={{ minWidth: '1000px' }}>
                            <thead>
                                <tr>
                                    <th className={`${thBase} bg-yellow-300 text-yellow-900`} rowSpan={2}>
                                        {monthLabel.split(' ')[0]}<br /><span className="font-normal text-[9px]">Date</span>
                                    </th>
                                    <th className={`${thBase} bg-orange-300 text-orange-900`} colSpan={4}>Petrol DIP Readings</th>
                                    <th className={`${thBase} bg-teal-300 text-teal-900`} colSpan={4}>
                                        Petrol DSR Record <span className="font-normal text-[9px]">(S1 Opening Meter)</span>
                                    </th>
                                    <th className={`${thBase} bg-teal-300 text-teal-900`}>Testing</th>
                                    <th className={`${thBase} bg-teal-200 text-teal-900`} colSpan={2}>Sales</th>
                                </tr>
                                <tr>
                                    <th className={`${thBase} bg-orange-100 text-orange-800`}>DIP-MS (cm)</th>
                                    <th className={`${thBase} bg-orange-100 text-orange-800`}>Opening Stock (L)</th>
                                    <th className={`${thBase} bg-orange-100 text-orange-800`}>Receipt (L)</th>
                                    <th className={`${thBase} bg-orange-100 text-orange-800`}>Total Stocks (L)</th>
                                    <th className={`${thBase} bg-teal-100 text-teal-800`}>DSR-1<br /><span className="font-normal text-[9px]">B-Noz 3</span></th>
                                    <th className={`${thBase} bg-teal-100 text-teal-800`}>DSR-2<br /><span className="font-normal text-[9px]">B-Noz 4</span></th>
                                    <th className={`${thBase} bg-teal-100 text-teal-800`}>DSR-3<br /><span className="font-normal text-[9px]">F-Noz 3</span></th>
                                    <th className={`${thBase} bg-teal-100 text-teal-800`}>DSR-4<br /><span className="font-normal text-[9px]">F-Noz 4</span></th>
                                    <th className={`${thBase} bg-teal-100 text-teal-800`}>Petrol (L)</th>
                                    <th className={`${thBase} bg-teal-50 text-teal-900`}>Sales (L)</th>
                                    <th className={`${thBase} bg-teal-50 text-teal-900`}>Cum. Sales (L)</th>
                                </tr>
                            </thead>
                            <tbody>
                                {processedRows.map((row, idx) => (
                                    <tr key={row.date}
                                        className={`${row.hasData ? '' : 'text-slate-300'} ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'} hover:bg-orange-50/20 transition-colors`}>
                                        <td className={`${tdLabel} text-center bg-slate-100`}>{format(parseISO(row.date), 'd/M/yy')}</td>
                                        <td className={tdBase}>{row.hasData ? row.dipMS.toFixed(2) : ''}</td>
                                        <td className={`${tdBase} text-emerald-700`}>{row.hasData ? row.msOpenStock.toLocaleString() : ''}</td>
                                        <td className={tdBase}>{row.hasData ? row.msReceipt.toFixed(2) : ''}</td>
                                        <td className={`${tdBase} font-bold`}>{row.hasData ? row.msTotalStock.toLocaleString() : ''}</td>
                                        <td className={`${tdBase} bg-teal-50/40`}>{row.hasData && row.msD1 ? row.msD1.toFixed(2) : ''}</td>
                                        <td className={`${tdBase} bg-teal-50/40`}>{row.hasData && row.msD2 ? row.msD2.toFixed(2) : ''}</td>
                                        <td className={`${tdBase} bg-teal-50/40`}>{row.hasData && row.msD3 ? row.msD3.toFixed(2) : ''}</td>
                                        <td className={`${tdBase} bg-teal-50/40`}>{row.hasData && row.msD4 ? row.msD4.toFixed(2) : ''}</td>
                                        <td className={tdBase}>{row.hasData && row.msTesting ? row.msTesting.toFixed(2) : ''}</td>
                                        <td className={`${tdBase} font-bold text-indigo-700`}>
                                            {row.hasData ? row.msSaleVol.toFixed(2) : ''}
                                        </td>
                                        <td className={`${tdBase} font-bold text-blue-800 bg-blue-50/30`}>
                                            {row.hasData ? row.cumPetrol.toFixed(2) : ''}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div className="h-3 sm:h-4 bg-slate-100 border-y border-slate-200" />

                    {/* ======= DIESEL SECTION ======= */}
                    <div className="overflow-x-auto hide-scrollbar">
                        <table className="w-full border-collapse text-xs" style={{ minWidth: '1100px' }}>
                            <thead>
                                <tr>
                                    <th className={`${thBase} bg-slate-200 text-slate-700`} rowSpan={2}>Date</th>
                                    <th className={`${thBase} bg-orange-300 text-orange-900`} colSpan={7}>Diesel Dip Readings</th>
                                    <th className={`${thBase} bg-teal-300 text-teal-900`} colSpan={4}>
                                        Diesel DSR Record <span className="font-normal text-[9px]">(S1 Opening Meter)</span>
                                    </th>
                                    <th className={`${thBase} bg-teal-300 text-teal-900`}>Testing</th>
                                    <th className={`${thBase} bg-teal-200 text-teal-900`} colSpan={2}>Sales</th>
                                </tr>
                                <tr>
                                    <th className={`${thBase} bg-orange-100 text-orange-800`}>HSD-1 (cm)</th>
                                    <th className={`${thBase} bg-orange-100 text-orange-800`}>Volume (L)</th>
                                    <th className={`${thBase} bg-orange-100 text-orange-800`}>HSD-2 (cm)</th>
                                    <th className={`${thBase} bg-orange-100 text-orange-800`}>Volume (L)</th>
                                    <th className={`${thBase} bg-orange-100 text-orange-800`}>Opening Stock (L)</th>
                                    <th className={`${thBase} bg-orange-100 text-orange-800`}>Receipt (L)</th>
                                    <th className={`${thBase} bg-orange-100 text-orange-800`}>Total Stocks (L)</th>
                                    <th className={`${thBase} bg-teal-100 text-teal-800`}>DSR-1<br /><span className="font-normal text-[9px]">B-Noz 1</span></th>
                                    <th className={`${thBase} bg-teal-100 text-teal-800`}>DSR-2<br /><span className="font-normal text-[9px]">B-Noz 2</span></th>
                                    <th className={`${thBase} bg-teal-100 text-teal-800`}>DSR-3<br /><span className="font-normal text-[9px]">F-Noz 1</span></th>
                                    <th className={`${thBase} bg-teal-100 text-teal-800`}>DSR-4<br /><span className="font-normal text-[9px]">F-Noz 2</span></th>
                                    <th className={`${thBase} bg-teal-100 text-teal-800`}>Diesel (L)</th>
                                    <th className={`${thBase} bg-teal-50 text-teal-900`}>Sales (L)</th>
                                    <th className={`${thBase} bg-teal-50 text-teal-900`}>Cum. Sales (L)</th>
                                </tr>
                            </thead>
                            <tbody>
                                {processedRows.map((row, idx) => (
                                    <tr key={row.date}
                                        className={`${row.hasData ? '' : 'text-slate-300'} ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'} hover:bg-amber-50/20 transition-colors`}>
                                        <td className={`${tdLabel} text-center bg-slate-100`}>{format(parseISO(row.date), 'd/M/yy')}</td>
                                        <td className={tdBase}>{row.hasData ? row.dip1HSD.toFixed(2) : ''}</td>
                                        <td className={`${tdBase} text-emerald-700`}>{row.hasData ? row.hsd1Vol.toLocaleString() : ''}</td>
                                        <td className={tdBase}>{row.hasData ? row.dip2HSD.toFixed(2) : ''}</td>
                                        <td className={`${tdBase} text-emerald-700`}>{row.hasData ? row.hsd2Vol.toLocaleString() : ''}</td>
                                        <td className={`${tdBase} font-semibold`}>{row.hasData ? row.hsdOpenStock.toLocaleString() : ''}</td>
                                        <td className={tdBase}>{row.hasData ? row.hsdReceipt.toFixed(2) : ''}</td>
                                        <td className={`${tdBase} font-bold`}>{row.hasData ? row.hsdTotalStock.toLocaleString() : ''}</td>
                                        <td className={`${tdBase} bg-teal-50/40`}>{row.hasData && row.hsdD1 ? row.hsdD1.toFixed(2) : ''}</td>
                                        <td className={`${tdBase} bg-teal-50/40`}>{row.hasData && row.hsdD2 ? row.hsdD2.toFixed(2) : ''}</td>
                                        <td className={`${tdBase} bg-teal-50/40`}>{row.hasData && row.hsdD3 ? row.hsdD3.toFixed(2) : ''}</td>
                                        <td className={`${tdBase} bg-teal-50/40`}>{row.hasData && row.hsdD4 ? row.hsdD4.toFixed(2) : ''}</td>
                                        <td className={tdBase}>{row.hasData && row.hsdTesting ? row.hsdTesting.toFixed(2) : ''}</td>
                                        <td className={`${tdBase} font-bold text-indigo-700`}>
                                            {row.hasData ? row.hsdSaleVol.toFixed(2) : ''}
                                        </td>
                                        <td className={`${tdBase} font-bold text-indigo-700 bg-orange-50/30`}>
                                            {row.hasData ? row.cumDiesel.toFixed(2) : ''}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}