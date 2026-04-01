"use client";

import { useAppStore } from '@/store/appStore';
import { Download, FileSpreadsheet, Calendar, Loader2 } from 'lucide-react';
import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { generatePDF } from '@/lib/pdf';
import { format, getDaysInMonth, parseISO, subMonths, addDays } from 'date-fns';

// ---- Dip-to-Volume Lookup Table (cm -> Liters) via linear interpolation ----
const DIP_TABLE: Record<number, number> = {
    1: 12, 2: 34, 3: 62, 4: 96, 5: 134, 6: 175, 7: 221, 8: 269, 9: 321, 10: 375,
    11: 432, 12: 491, 13: 553, 14: 617, 15: 684, 16: 752, 17: 822, 18: 895, 19: 969, 20: 1045,
    21: 1122, 22: 1201, 23: 1282, 24: 1365, 25: 1449, 26: 1534, 27: 1621, 28: 1709, 29: 1799, 30: 1890,
    31: 1982, 32: 2075, 33: 2170, 34: 2265, 35: 2362, 36: 2460, 37: 2560, 38: 2660, 39: 2761, 40: 2863,
    41: 2966, 42: 3071, 43: 3176, 44: 3282, 45: 3389, 46: 3496, 47: 3605, 48: 3714, 49: 3825, 50: 3936,
    51: 4048, 52: 4160, 53: 4274, 54: 4388, 55: 4503, 56: 4618, 57: 4734, 58: 4851, 59: 4968, 60: 5086,
    61: 5205, 62: 5324, 63: 5444, 64: 5564, 65: 5685, 66: 5807, 67: 5928, 68: 6051, 69: 6174, 70: 6297,
    71: 6421, 72: 6545, 73: 6670, 74: 6795, 75: 6921, 76: 7047, 77: 7173, 78: 7300, 79: 7427, 80: 7554,
    81: 7682, 82: 7810, 83: 7938, 84: 8067, 85: 8196, 86: 8325, 87: 8454, 88: 8584, 89: 8714, 90: 8819,
    91: 8974, 92: 9105, 93: 9236, 94: 9367, 95: 9498, 96: 9629, 97: 9760, 98: 9892, 99: 10024, 100: 10156,
    101: 10287, 102: 10419, 103: 10552, 104: 10684, 105: 10732, 106: 10864, 107: 10996, 108: 11128, 109: 11260, 110: 11392,
    111: 11523, 112: 11655, 113: 11786, 114: 11917, 115: 12048, 116: 12179, 117: 12310, 118: 12441, 119: 12571, 120: 12701,
    121: 12831, 122: 12961, 123: 13090, 124: 13219, 125: 13348, 126: 13476, 127: 13605, 128: 13733, 129: 13860, 130: 13988,
    131: 14115, 132: 14241, 133: 14367, 134: 14493, 135: 14619, 136: 14744, 137: 14868, 138: 14993, 139: 15116, 140: 15240,
    141: 15363, 142: 15485, 143: 15607, 144: 15728, 145: 15849, 146: 15969, 147: 16089, 148: 16208, 149: 16326, 150: 16444,
    151: 16561, 152: 16678, 153: 16794, 154: 16909, 155: 17024, 156: 17138, 157: 17251, 158: 17364, 159: 17475, 160: 17586,
    161: 17696, 162: 17806, 163: 17914, 164: 18022, 165: 18129, 166: 18234, 167: 18339, 168: 18443, 169: 18546, 170: 18648,
    171: 18749, 172: 18849, 173: 18948, 174: 19046, 175: 19143, 176: 19238, 177: 19333, 178: 19426, 179: 19518, 180: 19608,
    181: 19697, 182: 19785, 183: 19872, 184: 19957, 185: 20041, 186: 20123, 187: 20203, 188: 20282, 189: 20360, 190: 20435,
    191: 20509, 192: 20581, 193: 20651, 194: 20719, 195: 20785, 196: 20848, 197: 20910, 198: 20969, 199: 21025, 200: 21079,
    201: 21130, 202: 21178, 203: 21222, 204: 21263, 205: 21300, 206: 21333, 207: 21360, 208: 21380
};

function dipToLiters(cm: number): number {
    if (!cm || cm <= 0) return 0;
    const low = Math.floor(cm);
    const high = Math.ceil(cm);
    const lowVal = DIP_TABLE[low];
    const highVal = DIP_TABLE[high];
    if (lowVal === undefined || highVal === undefined) return 0;
    return Math.round(lowVal + (cm - low) * (highVal - lowVal));
}

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

                // ---- Fetch historical totals before this month ----
                const { data: histData } = await supabase
                    .from('shift_summaries')
                    .select('total_ms_qty, total_hsd_qty, shifts!inner(shift_date)')
                    .lt('shifts.shift_date', startDate);
                
                let histMs = DSR_INIT_CUM_PETROL;
                let histHsd = DSR_INIT_CUM_DIESEL;
                
                if (histData) {
                    histData.forEach((row: any) => {
                        histMs += Number(row.total_ms_qty) || 0;
                        histHsd += Number(row.total_hsd_qty) || 0;
                    });
                }
                setHistoricalCum({ ms: histMs, hsd: histHsd });

                // ---- Fetch current month shifts + 1st day of next month ----
                const { data: shifts } = await supabase
                    .from('shifts')
                    .select(`
            id, shift_date, shift_number, ms_receipt, hsd_receipt,
            shift_entries ( nozzle_no, opening_meter, testing_qty ),
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
                const s2 = shifts.find((s: any) => s.shift_number === 2);
                const s2Rec = s2?.shift_entries?.find((e: any) => e.nozzle_no === no);
                if (s2Rec) return parseFloat(s2Rec.opening_meter) || 0;
                const s1 = shifts.find((s: any) => s.shift_number === 1);
                const s1Rec = s1?.shift_entries?.find((e: any) => e.nozzle_no === no);
                if (s1Rec) return parseFloat(s1Rec.opening_meter) || 0;
                const targetEntries = shifts.flatMap((s: any) => s.shift_entries || []).filter((e: any) => e.nozzle_no === no);
                if (targetEntries.length === 0) return 0;
                const minVal = Math.min(...targetEntries.map((e: any) => parseFloat(e.opening_meter) || 0));
                return isFinite(minVal) ? minVal : 0;
            };
            const meters: Record<string, number> = {};
            [...MS_NOZZLES, ...HSD_NOZZLES].forEach(no => meters[no] = getOpen(no));
            return meters;
        };

        const daySummaries = rawData.map(day => {
            const allShifts = day.shifts;
            const meters = getMetersForShifts(allShifts);

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
                const validMatch = matches.slice().reverse().find((t: any) => {
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

            // To calculate sales, find the next valid day's meters
            const nextValidDay = daySummaries.slice(idx + 1).find(d => d.hasData);

            let msSaleVol = 0;
            let hsdSaleVol = 0;

            if (nextValidDay) {
                msSaleVol = MS_NOZZLES.reduce((sum, no) => sum + (nextValidDay.meters[no] - day.meters[no]), 0) - day.msTesting;
                hsdSaleVol = HSD_NOZZLES.reduce((sum, no) => sum + (nextValidDay.meters[no] - day.meters[no]), 0) - day.hsdTesting;
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

    // ---- Compute Variations (Total - Sale - NextDayOpen) ----
    const finalRows = useMemo(() => {
        return processedRows.map((row, idx) => {
            if (!row.hasData) return { ...row, msVariation: 0, hsdVariation: 0 };

            const nextDay = processedRows[idx + 1];
            // If we have a next day with data, variation = (Total - Sale) - NextDayOpen
            // If it's the last day or next day has no data, variation is 0 for now
            const msVariation = nextDay?.hasData
                ? (row.msTotalStock - row.msSaleVol) - nextDay.msOpenStock
                : 0;

            const hsdVariation = nextDay?.hasData
                ? (row.hsdTotalStock - row.hsdSaleVol) - nextDay.hsdOpenStock
                : 0;

            return { ...row, msVariation, hsdVariation };
        });
    }, [processedRows]);

    const hasData = finalRows.some(d => d.hasData);
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
                                        Petrol DSR Record <span className="font-normal text-[9px]">(S2 Opening Meter)</span>
                                    </th>
                                    <th className={`${thBase} bg-teal-300 text-teal-900`}>Testing</th>
                                    <th className={`${thBase} bg-teal-200 text-teal-900`} colSpan={3}>Sales & Variation</th>
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
                                    <th className={`${thBase} bg-rose-100 text-rose-900`}>Variation (L)</th>
                                </tr>
                            </thead>
                            <tbody>
                                {finalRows.map((row, idx) => (
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
                                        <td className={`${tdBase} font-black ${row.hasData ? (row.msVariation > 0 ? 'text-red-600' : 'text-emerald-600') : ''} bg-rose-50/20 text-center`}>
                                            {row.hasData && idx < finalRows.length - 1 && finalRows[idx + 1].hasData ? (
                                                <div className="flex flex-col leading-none py-1">
                                                    <span className="text-xs">{Math.abs(row.msVariation).toFixed(2)}</span>
                                                    <span className="text-[7.5px] uppercase font-black mt-0.5">
                                                        {row.msVariation > 0 ? 'Loss' : 'Gain'}
                                                    </span>
                                                </div>
                                            ) : '-'}
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
                                        Diesel DSR Record <span className="font-normal text-[9px]">(S2 Opening Meter)</span>
                                    </th>
                                    <th className={`${thBase} bg-teal-300 text-teal-900`}>Testing</th>
                                    <th className={`${thBase} bg-teal-200 text-teal-900`} colSpan={3}>Sales & Variation</th>
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
                                    <th className={`${thBase} bg-rose-100 text-rose-900`}>Variation (L)</th>
                                </tr>
                            </thead>
                            <tbody>
                                {finalRows.map((row, idx) => (
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
                                        <td className={`${tdBase} font-black ${row.hasData ? (row.hsdVariation > 0 ? 'text-red-600' : 'text-emerald-600') : ''} bg-rose-50/20 text-center`}>
                                            {row.hasData && idx < finalRows.length - 1 && finalRows[idx + 1].hasData ? (
                                                <div className="flex flex-col leading-none py-1">
                                                    <span className="text-xs">{Math.abs(row.hsdVariation).toFixed(2)}</span>
                                                    <span className="text-[7.5px] uppercase font-black mt-0.5">
                                                        {row.hsdVariation > 0 ? 'Loss' : 'Gain'}
                                                    </span>
                                                </div>
                                            ) : '-'}
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