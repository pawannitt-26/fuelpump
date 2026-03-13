"use client";

import { Suspense, useEffect, useState } from 'react';
import { useAppStore } from '@/store/appStore';
import { t } from '@/lib/i18n';
import { Save, MoveLeft, Loader2, UserRound, Banknote, CreditCard, Calculator } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';

interface NozzleEntry {
    id: string;
    machine: 'Front' | 'Back';
    side: 'A' | 'B';
    product: 'MS' | 'HSD';
    product_id: string;
    nozzleNo: string;
    opening: number;
    closing: number;
    testing: number;
    rate: number;
}

interface SideEntry {
    id: string;
    machine: 'Front' | 'Back';
    side: 'A' | 'B';
    label: string;
    nozzleMan: string;
    cash: number;
    online: number;
}

function ShiftEntryContent() {
    const { language, user } = useAppStore();
    const router = useRouter();
    const searchParams = useSearchParams();
    const editId = searchParams.get('id');

    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [shift, setShift] = useState<'1' | '2'>('1');
    const [loading, setLoading] = useState(false);

    // Rates mapping from DB
    const [rates, setRates] = useState<{ MS: { rate: number, id: string }, HSD: { rate: number, id: string } }>({
        MS: { rate: 0, id: '' },
        HSD: { rate: 0, id: '' }
    });

    const [entries, setEntries] = useState<NozzleEntry[]>([]);

    // Manage state for the 4 sides
    const [sides, setSides] = useState<SideEntry[]>([
        { id: 'Front-A', machine: 'Front', side: 'A', label: '1 & 3', nozzleMan: '', cash: 0, online: 0 },
        { id: 'Front-B', machine: 'Front', side: 'B', label: '2 & 4', nozzleMan: '', cash: 0, online: 0 },
        { id: 'Back-A', machine: 'Back', side: 'A', label: '1 & 3', nozzleMan: '', cash: 0, online: 0 },
        { id: 'Back-B', machine: 'Back', side: 'B', label: '2 & 4', nozzleMan: '', cash: 0, online: 0 },
    ]);

    // Dedicated state for Lube Sales
    const [lubeState, setLubeState] = useState({ total: 0, cash: 0, online: 0 });

    // Fetch Products and their active rates
    useEffect(() => {
        async function fetchProductsAndRates() {
            setLoading(true);
            try {
                const { data: products } = await supabase.from('products').select('*');
                if (products) {
                    const rateMap: any = { MS: { rate: 100, id: '' }, HSD: { rate: 90, id: '' } };

                    for (const p of products) {
                        rateMap[p.name].id = p.id;
                        const { data: activeRates } = await supabase
                            .from('rates')
                            .select('rate')
                            .eq('product_id', p.id)
                            .order('effective_date', { ascending: false })
                            .limit(1);

                        if (activeRates && activeRates.length > 0) {
                            rateMap[p.name].rate = activeRates[0].rate;
                        } else {
                            rateMap[p.name].rate = p.name === 'MS' ? 105.45 : 92.30;
                        }
                    }
                    setRates(rateMap);

                    // If Edit Mode: Fetch Existing Data
                    if (editId) {
                        const { data: existingShift } = await supabase
                            .from('shifts')
                            .select(`
                                *,
                                shift_entries(*, products(name)),
                                shift_sides(*)
                            `)
                            .eq('id', editId)
                            .single();

                        if (existingShift) {
                            setDate(existingShift.shift_date);
                            setShift(existingShift.shift_number.toString() as '1' | '2');

                            if (existingShift.shift_entries) {
                                const loadedEntries = existingShift.shift_entries.map((e: any) => ({
                                    id: e.id,
                                    machine: e.nozzle_no.split('-')[0],
                                    side: (e.nozzle_no.endsWith('-1') || e.nozzle_no.endsWith('-3')) ? 'A' : 'B',
                                    product: e.products?.name || 'MS',
                                    product_id: e.product_id,
                                    nozzleNo: e.nozzle_no.split('-')[1] || e.nozzle_no,
                                    opening: e.opening_meter || 0,
                                    closing: e.closing_meter || 0,
                                    testing: e.testing_qty || 0,
                                    rate: parseFloat(e.rate) || 0
                                }));
                                setEntries(loadedEntries);
                            }
                            if (existingShift.shift_sides && existingShift.shift_sides.length > 0) {
                                const loadedSides = existingShift.shift_sides.filter((s: any) => s.machine !== 'Lube').map((s: any) => ({
                                    id: s.id,
                                    machine: s.machine,
                                    side: s.side === '1 & 3' ? 'A' : 'B',
                                    label: s.side,
                                    nozzleMan: s.nozzle_man,
                                    cash: parseFloat(s.cash_received) || 0,
                                    online: parseFloat(s.online_received) || 0
                                }));
                                setSides(loadedSides);

                                const lubeSide = existingShift.shift_sides.find((s: any) => s.machine === 'Lube');
                                if (lubeSide) {
                                    setLubeState({
                                        total: parseFloat(lubeSide.lube_sales) || 0,
                                        cash: parseFloat(lubeSide.cash_received) || 0,
                                        online: parseFloat(lubeSide.online_received) || 0
                                    });
                                }
                            }
                        }
                        return; // Skip setting default zero entries
                    }

                    // Default Initial State for New Shift
                    setEntries([
                        { id: 'F1', machine: 'Front', side: 'A', product: 'HSD', product_id: rateMap['HSD'].id, nozzleNo: '1', opening: 0, closing: 0, testing: 0, rate: rateMap['HSD'].rate },
                        { id: 'F3', machine: 'Front', side: 'A', product: 'MS', product_id: rateMap['MS'].id, nozzleNo: '3', opening: 0, closing: 0, testing: 0, rate: rateMap['MS'].rate },
                        { id: 'F2', machine: 'Front', side: 'B', product: 'HSD', product_id: rateMap['HSD'].id, nozzleNo: '2', opening: 0, closing: 0, testing: 0, rate: rateMap['HSD'].rate },
                        { id: 'F4', machine: 'Front', side: 'B', product: 'MS', product_id: rateMap['MS'].id, nozzleNo: '4', opening: 0, closing: 0, testing: 0, rate: rateMap['MS'].rate },
                        { id: 'B1', machine: 'Back', side: 'A', product: 'HSD', product_id: rateMap['HSD'].id, nozzleNo: '1', opening: 0, closing: 0, testing: 0, rate: rateMap['HSD'].rate },
                        { id: 'B3', machine: 'Back', side: 'A', product: 'MS', product_id: rateMap['MS'].id, nozzleNo: '3', opening: 0, closing: 0, testing: 0, rate: rateMap['MS'].rate },
                        { id: 'B2', machine: 'Back', side: 'B', product: 'HSD', product_id: rateMap['HSD'].id, nozzleNo: '2', opening: 0, closing: 0, testing: 0, rate: rateMap['HSD'].rate },
                        { id: 'B4', machine: 'Back', side: 'B', product: 'MS', product_id: rateMap['MS'].id, nozzleNo: '4', opening: 0, closing: 0, testing: 0, rate: rateMap['MS'].rate },
                    ]);

                }
            } catch (error) {
                console.error("Error fetching rates:", error);
            } finally {
                setLoading(false);
            }
        }
        fetchProductsAndRates();
    }, [editId]);

    const updateEntry = (id: string, field: keyof NozzleEntry, value: string | number) => {
        setEntries(entries.map(e => e.id === id ? { ...e, [field]: value } : e));
    };

    const updateSide = (id: string, field: keyof SideEntry, value: string | number) => {
        setSides(sides.map(s => s.id === id ? { ...s, [field]: value } : s));
    };

    // Helper to calculate totals for a specific side
    const getSideTotals = (machine: string, side: string) => {
        const sideEntries = entries.filter(e => e.machine === machine && e.side === side);
        const sideData = sides.find(s => s.machine === machine && s.side === side);

        const totalSale = sideEntries.reduce((sum, e) => {
            const qty = (e.closing || 0) - (e.opening || 0) - (e.testing || 0);
            return sum + (qty * e.rate);
        }, 0);

        const collected = (sideData?.cash || 0) + (sideData?.online || 0);
        const diff = collected - totalSale;

        return { totalSale, collected, diff };
    };

    // Helper to calculate totals for a full machine
    const getMachineTotals = (machine: string) => {
        const machineEntries = entries.filter(e => e.machine === machine);
        const machineSides = sides.filter(s => s.machine === machine);

        const totalSale = machineEntries.reduce((sum, e) => {
            const qty = (e.closing || 0) - (e.opening || 0) - (e.testing || 0);
            return sum + (qty * e.rate);
        }, 0);

        const totalCash = machineSides.reduce((sum, s) => sum + (s.cash || 0), 0);
        const totalOnline = machineSides.reduce((sum, s) => sum + (s.online || 0), 0);
        const collected = totalCash + totalOnline;
        const diff = collected - totalSale;

        return { totalSale, totalCash, totalOnline, collected, diff };
    };

    // Global Totals (Grand Summary)
    const grandTotals = entries.reduce((acc, curr) => {
        const saleQty = (curr.closing || 0) - (curr.opening || 0) - (curr.testing || 0);
        const amount = saleQty * curr.rate;

        if (curr.product === 'MS') acc.ms += saleQty;
        if (curr.product === 'HSD') acc.hsd += saleQty;
        acc.amount += amount;
        return acc;
    }, { ms: 0, hsd: 0, amount: lubeState.total, lube: lubeState.total });

    const totalCashGlobal = sides.reduce((sum, s) => sum + (s.cash || 0), 0) + lubeState.cash;
    const totalOnlineGlobal = sides.reduce((sum, s) => sum + (s.online || 0), 0) + lubeState.online;
    const globalDiff = (totalCashGlobal + totalOnlineGlobal) - grandTotals.amount;
    const hasGlobalMismatch = Math.abs(globalDiff) > 5;

    const handleSubmit = async () => {
        if (!user) return alert('Session lost');
        setLoading(true);

        try {
            let shiftId = editId;

            if (editId) {
                // Update Shift Record Mode
                const { error: updateErr } = await supabase.from('shifts')
                    .update({
                        shift_date: date,
                        shift_number: parseInt(shift),
                        manager_id: user.id
                    }).eq('id', editId);
                if (updateErr) throw updateErr;

                // Scrub old children
                await supabase.from('shift_entries').delete().eq('shift_id', editId);
                await supabase.from('shift_sides').delete().eq('shift_id', editId);
                await supabase.from('shift_summaries').delete().eq('shift_id', editId);
            } else {
                // Insert New Shift Record Mode
                const { data: shiftData, error: shiftError } = await supabase
                    .from('shifts')
                    .insert([{
                        shift_date: date,
                        shift_number: parseInt(shift),
                        manager_id: user.id,
                        status: 'Pending',
                        locked_flag: false
                    }])
                    .select()
                    .single();

                if (shiftError) throw shiftError;
                shiftId = shiftData.id;
            }

            // 2. Insert Entries
            const entryInserts = entries.map(e => ({
                shift_id: shiftId,
                product_id: e.product_id,
                nozzle_no: `${e.machine}-${e.nozzleNo}`,
                opening_meter: e.opening || 0,
                closing_meter: e.closing || 0,
                testing_qty: e.testing || 0,
                rate: e.rate
            }));

            const { error: entriesError } = await supabase.from('shift_entries').insert(entryInserts);
            if (entriesError) throw entriesError;

            // 3. Insert Sides Data
            const sidesInserts = sides.map(s => ({
                shift_id: shiftId,
                machine: s.machine,
                side: s.label,
                nozzle_man: s.nozzleMan || 'Unassigned',
                cash_received: s.cash || 0,
                online_received: s.online || 0,
                lube_sales: 0
            }));

            // Push dedicated Lube sales record
            sidesInserts.push({
                shift_id: shiftId,
                machine: 'Lube' as any,
                side: 'Sales',
                nozzle_man: 'Manager',
                cash_received: lubeState.cash || 0,
                online_received: lubeState.online || 0,
                lube_sales: lubeState.total || 0
            });

            // Note: This will fail if add_shift_sides.sql was not run by the user yet
            const { error: sidesError } = await supabase.from('shift_sides').insert(sidesInserts);
            if (sidesError) throw sidesError;

            // 4. Create Shift Summary (Aggregate)
            const { error: summaryError } = await supabase.from('shift_summaries').insert([{
                shift_id: shiftId,
                total_ms_qty: grandTotals.ms,
                total_hsd_qty: grandTotals.hsd,
                total_sale_amount: grandTotals.amount,
                cash_received: totalCashGlobal,
                online_received: totalOnlineGlobal
            }]);

            if (summaryError) throw summaryError;

            alert('Shift submitted successfully!');
            router.push('/dashboard/manager');
        } catch (err: any) {
            console.error('Submit error:', err);
            if (err.code === '23505') {
                alert('A shift for this date and shift number already exists!');
            } else if (err.code === '42P01') {
                alert('Database Missing Table: You need to run the add_shift_sides.sql migration script first!');
            } else {
                alert('Failed to submit shift.');
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="max-w-7xl mx-auto space-y-8 pb-24">
            {/* Header Area */}
            <div className="flex items-start justify-between bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                <div className="flex items-center gap-5">
                    <Link href="/dashboard/manager" className="text-slate-400 hover:text-blue-600 bg-slate-50 hover:bg-blue-50 p-3 rounded-xl transition-all h-fit self-start mt-1">
                        <MoveLeft size={24} />
                    </Link>
                    <div>
                        <h1 className="text-3xl font-extrabold text-slate-800 m-0 tracking-tight flex items-center gap-3">
                            <span className="bg-blue-600 text-white p-2 rounded-xl text-lg shadow-md">
                                <Banknote size={24} />
                            </span>
                            {editId ? 'Edit Shift' : t('newShift', language)} Entry
                        </h1>
                        <p className="text-slate-500 font-medium mt-2">{editId ? 'Update your' : 'Record accurate'} nozzle readings and nozzleman collections for this operational shift.</p>
                    </div>
                </div>

                <div className="hidden lg:flex items-center gap-2 bg-emerald-50 text-emerald-700 px-4 py-2 rounded-full font-bold text-sm border border-emerald-100 shadow-sm shadow-emerald-100/50">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div> Active Shift Session
                </div>
            </div>

            {/* Shift Details Context */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white p-5 rounded-2xl border-b-4 border-l border-r border-t border-slate-100 border-b-blue-500 shadow-sm relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-blue-50 rounded-bl-full -z-10 transition-transform group-hover:scale-110"></div>
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 block">{t('date', language)}</label>
                    <input
                        type="date"
                        className="w-full bg-transparent border-0 p-0 text-xl font-bold text-slate-800 focus:ring-0"
                        value={date}
                        onChange={(e) => setDate(e.target.value)}
                    />
                </div>
                <div className="bg-white p-5 rounded-2xl border-b-4 border-l border-r border-t border-slate-100 border-b-indigo-500 shadow-sm relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-50 rounded-bl-full -z-10 transition-transform group-hover:scale-110"></div>
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 block">{t('shift', language)}</label>
                    <select
                        className="w-full bg-transparent border-0 p-0 text-xl font-bold text-slate-800 focus:ring-0 appearance-none cursor-pointer"
                        value={shift}
                        onChange={(e) => setShift(e.target.value as '1' | '2')}
                    >
                        <option value="1">Shift 1 (Morning)</option>
                        <option value="2">Shift 2 (Evening)</option>
                    </select>
                </div>
                <div className="bg-gradient-to-br from-slate-50 to-slate-100 p-5 rounded-2xl border border-slate-200 shadow-inner">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 block">{t('managerName', language)}</label>
                    <div className="flex items-center gap-3">
                        <div className="bg-slate-200 p-1.5 rounded-full"><UserRound size={16} className="text-slate-600" /></div>
                        <input type="text" className="w-full bg-transparent border-0 p-0 text-xl font-bold text-slate-600 focus:ring-0" value={user?.name || ''} disabled />
                    </div>
                </div>
            </div>

            {/* Machine Layouts */}
            {['Front', 'Back'].map((machine) => {
                const machineStats = getMachineTotals(machine);
                const isFront = machine === 'Front';

                return (
                    <div key={machine} className={`bg-white rounded-3xl overflow-hidden shadow-xl shadow-slate-200/40 border ${isFront ? 'border-blue-100' : 'border-purple-100'} transition-shadow hover:shadow-2xl`}>
                        {/* Machine Header */}
                        <div className={`p-6 bg-gradient-to-r ${isFront ? 'from-blue-900 to-blue-800' : 'from-purple-900 to-purple-800'} text-white flex flex-col md:flex-row justify-between items-start md:items-center gap-4`}>
                            <h2 className="text-2xl font-extrabold m-0 flex items-center gap-3">
                                <div className={`p-2 rounded-xl ${isFront ? 'bg-blue-700/50' : 'bg-purple-700/50'} shadow-inner`}>
                                    <Calculator size={24} className="text-white/90" />
                                </div>
                                {machine} Machine
                            </h2>
                            <div className="flex gap-4 items-center bg-white/10 px-5 py-2.5 rounded-2xl backdrop-blur-sm border border-white/10">
                                <span className="text-sm font-medium text-white/70 uppercase tracking-wider">Total Sale</span>
                                <strong className="text-2xl font-black tracking-tight text-white drop-shadow-md">₹{machineStats.totalSale.toFixed(2)}</strong>
                            </div>
                        </div>

                        {/* Sides Loop */}
                        {['A', 'B'].map((sideMarker) => {
                            const sideLabel = sideMarker === 'A' ? '1 & 3' : '2 & 4';
                            const sideState = sides.find(s => s.machine === machine && s.side === sideMarker);
                            const sideStats = getSideTotals(machine, sideMarker);

                            return (
                                <div key={`${machine}-${sideMarker}`} className="border-b-2 border-slate-100/60 last:border-b-0">
                                    <div className="bg-slate-50/50 p-6 flex flex-col xl:flex-row justify-between xl:items-center gap-6">

                                        {/* Left: Side Name & Nozzle Man */}
                                        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 xl:w-1/5">
                                            <div className={`flex justify-center items-center w-14 h-14 rounded-2xl font-black text-xl shadow-sm border-2 ${sideMarker === 'A' ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-rose-50 text-rose-700 border-rose-200'}`}>
                                                {sideMarker}
                                            </div>
                                            <div className="space-y-2 w-full">
                                                <div className="text-xs font-bold text-slate-400 uppercase tracking-widest pl-1">Side {sideMarker} <span className="text-slate-300">({sideLabel})</span></div>
                                                <div className="flex items-center relative w-full">
                                                    <div className="absolute left-3 w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center text-slate-500">
                                                        <UserRound size={16} />
                                                    </div>
                                                    <input
                                                        type="text"
                                                        placeholder="Name / Staff ID"
                                                        className="w-full pl-14 pr-4 py-3 bg-white border-2 border-slate-200 rounded-xl font-bold text-slate-800 focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all placeholder:text-slate-300"
                                                        value={sideState?.nozzleMan || ''}
                                                        onChange={(e) => updateSide(sideState!.id, 'nozzleMan', e.target.value)}
                                                    />
                                                </div>
                                            </div>
                                        </div>

                                        {/* Center: Table Data */}
                                        <div className="overflow-x-auto xl:w-1/2 -mx-4 sm:mx-0 px-4 sm:px-0">
                                            <div className="min-w-[600px] border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-sm">
                                                <table className="w-full text-left">
                                                    <thead>
                                                        <tr className="bg-slate-50/80 text-slate-400 text-[10px] uppercase font-bold tracking-wider">
                                                            <th className="py-3 px-4 w-24">Petrol/Diesel</th>
                                                            <th className="py-3 px-4 w-16">Noz</th>
                                                            <th className="py-3 px-4">Initial Open</th>
                                                            <th className="py-3 px-4">Final Close</th>
                                                            <th className="py-3 px-4">Test Qty</th>
                                                            <th className="py-3 px-4 text-right bg-blue-50/50 text-blue-800 border-l border-blue-100">Sale Ltrs</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-slate-100">
                                                        {entries.filter(e => e.machine === machine && e.side === sideMarker).map((entry, index) => {
                                                            const saleQty = (entry.closing || 0) - (entry.opening || 0) - (entry.testing || 0);
                                                            return (
                                                                <tr key={entry.id} className={`${index % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'} group hover:bg-blue-50/20 transition-colors`}>
                                                                    <td className="py-3 px-4">
                                                                        <span className={`px-2.5 py-1 rounded-md text-xs font-bold ring-1 ring-inset ${entry.product === 'HSD' ? 'bg-amber-50 text-amber-700 ring-amber-200' : 'bg-emerald-50 text-emerald-700 ring-emerald-200'}`}>
                                                                            {entry.product}
                                                                        </span>
                                                                    </td>
                                                                    <td className="py-3 px-4 text-slate-500 font-bold">#{entry.nozzleNo}</td>
                                                                    <td className="py-2 px-3">
                                                                        <input type="number" className="w-full py-2 px-3 bg-slate-100/80 rounded-lg text-slate-700 font-semibold focus:bg-white focus:ring-2 focus:ring-blue-400 focus:outline-none transition-all placeholder:text-slate-300 border-transparent focus:border-transparent" placeholder="0.00" value={entry.opening === 0 ? '' : entry.opening} onChange={(e) => updateEntry(entry.id, 'opening', parseFloat(e.target.value) || 0)} />
                                                                    </td>
                                                                    <td className="py-2 px-3">
                                                                        <input type="number" className="w-full py-2 px-3 bg-slate-100/80 rounded-lg text-slate-700 font-semibold focus:bg-white focus:ring-2 focus:ring-blue-400 focus:outline-none transition-all placeholder:text-slate-300 border-transparent focus:border-transparent" placeholder="0.00" value={entry.closing === 0 ? '' : entry.closing} onChange={(e) => updateEntry(entry.id, 'closing', parseFloat(e.target.value) || 0)} />
                                                                    </td>
                                                                    <td className="py-2 px-3">
                                                                        <input type="number" className="w-full py-2 px-3 bg-slate-100/80 rounded-lg text-slate-600 focus:bg-white focus:ring-2 focus:ring-blue-400 focus:outline-none transition-all placeholder:text-slate-300 border-transparent focus:border-transparent" placeholder="Test" value={entry.testing === 0 ? '' : entry.testing} onChange={(e) => updateEntry(entry.id, 'testing', parseFloat(e.target.value) || 0)} />
                                                                    </td>
                                                                    <td className="py-3 px-4 text-right font-bold text-blue-700 bg-blue-50/30 border-l border-blue-50">
                                                                        {saleQty > 0 ? saleQty.toFixed(2) : '-'}
                                                                    </td>
                                                                </tr>
                                                            );
                                                        })}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>

                                        {/* Right: Cash & Online Collections */}
                                        <div className="xl:w-1/4 flex flex-col gap-3">
                                            <div className="bg-white p-3 rounded-2xl border-2 border-slate-100 shadow-sm relative overflow-hidden group">
                                                <div className="absolute top-0 right-0 w-16 h-16 bg-emerald-50 rounded-bl-full -z-10 group-focus-within:scale-150 transition-transform"></div>
                                                <label className="text-[11px] font-bold text-slate-400 uppercase mb-1.5 flex items-center gap-1.5"><Banknote size={14} className="text-emerald-500" /> Cash Collected</label>
                                                <div className="flex items-center">
                                                    <span className="text-slate-400 font-medium text-lg mr-2">₹</span>
                                                    <input
                                                        type="number"
                                                        placeholder="0.00"
                                                        className="w-full bg-transparent border-0 p-0 text-xl font-bold text-emerald-700 focus:ring-0 placeholder:text-slate-200"
                                                        value={sideState?.cash || ''}
                                                        onChange={(e) => updateSide(sideState!.id, 'cash', parseFloat(e.target.value) || 0)}
                                                    />
                                                </div>
                                            </div>
                                            <div className="bg-white p-3 rounded-2xl border-2 border-slate-100 shadow-sm relative overflow-hidden group">
                                                <div className="absolute top-0 right-0 w-16 h-16 bg-indigo-50 rounded-bl-full -z-10 group-focus-within:scale-150 transition-transform"></div>
                                                <label className="text-[11px] font-bold text-slate-400 uppercase mb-1.5 flex items-center gap-1.5"><CreditCard size={14} className="text-indigo-500" /> Online Collected</label>
                                                <div className="flex items-center">
                                                    <span className="text-slate-400 font-medium text-lg mr-2">₹</span>
                                                    <input
                                                        type="number"
                                                        placeholder="0.00"
                                                        className="w-full bg-transparent border-0 p-0 text-xl font-bold text-indigo-700 focus:ring-0 placeholder:text-slate-200"
                                                        value={sideState?.online || ''}
                                                        onChange={(e) => updateSide(sideState!.id, 'online', parseFloat(e.target.value) || 0)}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Side Sub-summary bar */}
                                    <div className={`px-6 py-3 flex flex-wrap justify-end items-center gap-6 border-t border-slate-100 text-sm ${Math.abs(sideStats.diff) > 5 ? (sideStats.diff < 0 ? 'bg-red-50/50' : 'bg-emerald-50/50') : 'bg-white'}`}>
                                        <div className="text-slate-500 font-medium">Side Expected Value: <strong className="text-slate-700 ml-1">₹{sideStats.totalSale.toFixed(2)}</strong></div>
                                        <div className="w-1.5 h-1.5 rounded-full bg-slate-300"></div>
                                        <div className="text-slate-500 font-medium">Provided by Staff: <strong className="text-slate-700 ml-1">₹{sideStats.collected.toFixed(2)}</strong></div>

                                        <div className={`ml-4 pl-4 border-l-2 font-black ${Math.abs(sideStats.diff) > 5 ? (sideStats.diff < 0 ? 'text-red-600 border-red-200' : 'text-emerald-600 border-emerald-200') : 'text-slate-400 border-slate-200'}`}>
                                            STATUS: {Math.abs(sideStats.diff) <= 5 ? 'MATCHED ✓' : (sideStats.diff < 0 ? `SHORT ₹${Math.abs(sideStats.diff).toFixed(2)}` : `EXCESS +₹${sideStats.diff.toFixed(2)}`)}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}

                        {/* Machine Total Footer */}
                        <div className="bg-slate-50 p-6 flex flex-col md:flex-row justify-between items-center gap-6 border-t font-sans">
                            <div className="font-extrabold text-slate-400 uppercase tracking-widest text-sm flex items-center gap-2">
                                <span className={`w-3 h-3 rounded-full ${isFront ? 'bg-blue-400' : 'bg-purple-400'}`}></span>
                                {machine} Machine Audit
                            </div>
                            <div className="flex flex-wrap justify-center gap-8">
                                <div className="text-center">
                                    <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">Expected Income</div>
                                    <div className="text-xl font-bold text-slate-700">₹{machineStats.totalSale.toFixed(2)}</div>
                                </div>
                                <div className="w-px h-10 bg-slate-200"></div>
                                <div className="text-center">
                                    <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">Total Reported Cash</div>
                                    <div className="text-xl font-bold text-emerald-600">₹{machineStats.totalCash.toFixed(2)}</div>
                                </div>
                                <div className="text-center">
                                    <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">Total Digital Payments</div>
                                    <div className="text-xl font-bold text-indigo-600">₹{machineStats.totalOnline.toFixed(2)}</div>
                                </div>
                                <div className={`text-center px-6 py-2 rounded-xl ring-1 ${Math.abs(machineStats.diff) > 5 ? (machineStats.diff < 0 ? 'bg-red-50 ring-red-200' : 'bg-emerald-50 ring-emerald-200') : 'bg-white ring-slate-200'} shadow-sm`}>
                                    <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">Machine Variance</div>
                                    <div className={`text-xl font-black ${Math.abs(machineStats.diff) > 5 ? (machineStats.diff < 0 ? 'text-red-600' : 'text-emerald-600') : 'text-slate-800'}`}>
                                        {machineStats.diff > 0 ? '+' : ''}₹{machineStats.diff.toFixed(2)}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                );
            })}

            {/* Dedicated Lube Sales Module */}
            <div className="card w-full mb-8 relative border-2 border-amber-100 shadow-lg shadow-amber-500/5 bg-gradient-to-br from-amber-50/50 to-white overflow-hidden rounded-[2rem]">
                <div className="absolute top-0 right-0 w-64 h-64 bg-amber-400 rounded-full blur-[100px] opacity-10 pointer-events-none"></div>
                <div className="flex items-center gap-4 border-b border-amber-100 pb-5 mb-6 relative z-10">
                    <div className="w-12 h-12 bg-amber-100 rounded-2xl flex items-center justify-center shadow-inner">
                        <Banknote size={24} className="text-amber-600" />
                    </div>
                    <div>
                        <h3 className="text-xl font-black text-slate-800 tracking-tight m-0">Consolidated Lube Sales</h3>
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Additional Goods Revenue</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 relative z-10">
                    <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm group">
                        <label className="text-[11px] font-bold text-slate-400 uppercase mb-2 flex items-center gap-1.5">Total Sold Value</label>
                        <div className="flex items-center">
                            <span className="text-slate-400 font-medium text-2xl mr-2">₹</span>
                            <input
                                type="number"
                                placeholder="0.00"
                                className="w-full bg-transparent border-0 p-0 text-3xl font-black text-slate-800 focus:ring-0 placeholder:text-slate-200"
                                value={lubeState.total === 0 ? '' : lubeState.total}
                                onChange={(e) => setLubeState({ ...lubeState, total: parseFloat(e.target.value) || 0 })}
                            />
                        </div>
                    </div>
                    <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm group">
                        <label className="text-[11px] font-bold text-emerald-500 uppercase mb-2 flex items-center gap-1.5">Cash Collected</label>
                        <div className="flex items-center">
                            <span className="text-emerald-400 font-medium text-2xl mr-2">₹</span>
                            <input
                                type="number"
                                placeholder="0.00"
                                className="w-full bg-transparent border-0 p-0 text-3xl font-black text-emerald-700 focus:ring-0 placeholder:text-slate-200"
                                value={lubeState.cash === 0 ? '' : lubeState.cash}
                                onChange={(e) => setLubeState({ ...lubeState, cash: parseFloat(e.target.value) || 0 })}
                            />
                        </div>
                    </div>
                    <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm group">
                        <label className="text-[11px] font-bold text-indigo-500 uppercase mb-2 flex items-center gap-1.5">Online Collected</label>
                        <div className="flex items-center">
                            <span className="text-indigo-400 font-medium text-2xl mr-2">₹</span>
                            <input
                                type="number"
                                placeholder="0.00"
                                className="w-full bg-transparent border-0 p-0 text-3xl font-black text-indigo-700 focus:ring-0 placeholder:text-slate-200"
                                value={lubeState.online === 0 ? '' : lubeState.online}
                                onChange={(e) => setLubeState({ ...lubeState, online: parseFloat(e.target.value) || 0 })}
                            />
                        </div>
                    </div>
                </div>

                <div className={`mt-6 px-6 py-4 rounded-xl flex justify-between items-center text-sm font-bold border ${Math.abs((lubeState.cash + lubeState.online) - lubeState.total) > 5 ? 'bg-red-50 border-red-200 text-red-600' : 'bg-emerald-50 border-emerald-200 text-emerald-700'}`}>
                    <span>LUBE NET BALANCE / VARIANCE</span>
                    <span className="text-xl font-black">{((lubeState.cash + lubeState.online) - lubeState.total) > 0 ? '+' : ''}₹{((lubeState.cash + lubeState.online) - lubeState.total).toFixed(2)}</span>
                </div>
            </div>

            {/* Grand Global Summary Context */}
            <div className="card relative overflow-hidden bg-gradient-to-r from-blue-950 via-slate-900 to-slate-950 text-white shadow-2xl shadow-blue-900/40 border-none px-6 py-8 md:p-10 rounded-3xl group">
                {/* Background Decor */}
                <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500 rounded-full blur-[100px] opacity-20 group-hover:opacity-30 transition-opacity pointer-events-none"></div>
                <div className="absolute bottom-0 left-0 w-64 h-64 bg-emerald-500 rounded-full blur-[100px] opacity-10 group-hover:opacity-20 transition-opacity pointer-events-none"></div>

                <div className="relative z-10 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-8">
                    <div>
                        <div className="inline-block px-3 py-1 mb-3 rounded-full bg-blue-500/20 text-blue-300 text-xs font-bold uppercase tracking-widest border border-blue-500/30">Verification Level</div>
                        <h2 className="text-4xl font-black m-0 text-white tracking-tight">Grand Shift Summary</h2>
                        <p className="text-blue-200 mt-2 font-medium max-w-md leading-relaxed">System-wide reconciliation across all machines and assigned operational sides to verify physical inventory against financial receipts.</p>
                    </div>

                    <div className="bg-white/5 backdrop-blur-md p-6 rounded-2xl border border-white/10 w-full lg:w-xl shadow-inner">
                        <div className="flex flex-wrap items-center gap-x-10 gap-y-6">
                            <div>
                                <div className="text-[10px] text-blue-300/80 font-bold uppercase tracking-widest mb-1.5 flex items-center gap-1.5"><div className="w-1.5 h-1.5 bg-blue-400 rounded-full"></div> Total Liquid Disbursed</div>
                                <div className="flex gap-4 text-xl font-medium text-white/80">
                                    <span className="flex flex-col"><span className="text-[10px] text-emerald-400 uppercase tracking-widest font-bold">MS Fuel</span> <strong className="text-white font-black">{grandTotals.ms.toFixed(2)}L</strong></span>
                                    <div className="w-px bg-white/10 my-1"></div>
                                    <span className="flex flex-col"><span className="text-[10px] text-amber-400 uppercase tracking-widest font-bold">HSD Fuel</span> <strong className="text-white font-black">{grandTotals.hsd.toFixed(2)}L</strong></span>
                                </div>
                            </div>

                            <div className="w-px h-16 bg-white/10 hidden md:block"></div>

                            <div>
                                <div className="text-[10px] text-blue-300/80 font-bold uppercase tracking-widest mb-1.5">Expected Cash</div>
                                <div className="text-4xl font-black text-white tracking-tight">₹{grandTotals.amount.toFixed(2)}</div>
                            </div>

                            <div>
                                <div className="text-[10px] text-amber-300/80 font-bold uppercase tracking-widest mb-1.5 flex items-center gap-1.5"><Banknote size={12} /> Total Lube</div>
                                <div className="text-2xl font-black text-amber-400 tracking-tight">₹{grandTotals.lube.toFixed(2)}</div>
                            </div>

                            <div>
                                <div className="text-[10px] text-emerald-300/80 font-bold uppercase tracking-widest mb-1.5 flex items-center gap-1.5"><Banknote size={12} /> Handed Cash</div>
                                <div className="text-2xl font-black text-emerald-400 tracking-tight">₹{totalCashGlobal.toFixed(2)}</div>
                            </div>
                            <div>
                                <div className="text-[10px] text-indigo-300/80 font-bold uppercase tracking-widest mb-1.5 flex items-center gap-1.5"><CreditCard size={12} /> Received Digital</div>
                                <div className="text-2xl font-black text-indigo-400 tracking-tight">₹{totalOnlineGlobal.toFixed(2)}</div>
                            </div>

                            <div className="w-px h-16 bg-white/10 hidden md:block"></div>

                            <div>
                                <div className="text-[10px] text-blue-300/80 font-bold uppercase tracking-widest mb-1.5">Net Discrepancy Margin</div>
                                <div className={`px-4 py-2 rounded-xl text-3xl font-black border ${hasGlobalMismatch ? (globalDiff < 0 ? 'text-red-300 bg-red-900/30 border-red-500/30' : 'text-emerald-300 bg-emerald-900/30 border-emerald-500/30') : 'text-slate-300 bg-slate-800 border-slate-600/50'} shadow-sm`}>
                                    {globalDiff > 0 ? '+' : ''}₹{globalDiff.toFixed(2)}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="mt-10 flex justify-end relative z-10 border-t border-white/10 pt-8">
                    <button
                        onClick={handleSubmit}
                        disabled={loading}
                        className="bg-blue-600 hover:bg-blue-500 text-white pl-8 pr-10 py-5 rounded-2xl font-black text-xl shadow-xl shadow-blue-600/20 hover:shadow-blue-500/40 hover:-translate-y-1 flex items-center gap-4 transition-all duration-300 disabled:opacity-50 disabled:hover:translate-y-0 disabled:cursor-not-allowed group/btn focus:ring-4 focus:ring-blue-500/30 outline-none"
                    >
                        {loading ? <Loader2 size={24} className="animate-spin" /> : <Save size={24} className="group-hover/btn:scale-110 transition-transform" />}
                        {editId ? 'Update Modified Shift' : t('submitShift', language) + ' to Secure Ledger'}
                    </button>
                </div>
            </div>
        </div>
    );
}

export default function ShiftEntry() {
    return (
        <Suspense fallback={<div className="p-20 flex justify-center"><Loader2 className="animate-spin text-blue-500" size={40} /></div>}>
            <ShiftEntryContent />
        </Suspense>
    );
}
