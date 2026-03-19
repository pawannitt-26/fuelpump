"use client";

import { Suspense, useEffect, useState } from 'react';
import { useAppStore } from '@/store/appStore';
import { t } from '@/lib/i18n';
import { Save, MoveLeft, Loader2, UserRound, Banknote, CreditCard, Calculator, Gauge, AlertTriangle, FlaskConical, Vault, Truck } from 'lucide-react';
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
    employeeId?: string;
    cash: number;
    online: number;
    ghatti: number;
}

interface TankDip {
    tankName: string;
    manualDip: number;
    autoDip: number;
}

interface Employee {
    id: string;
    name: string;
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
    const [employees, setEmployees] = useState<Employee[]>([]);

    // Manage state for the 4 sides
    const [sides, setSides] = useState<SideEntry[]>([
        { id: 'Front-A', machine: 'Front', side: 'A', label: '1 & 3', nozzleMan: '', cash: 0, online: 0, ghatti: 0 },
        { id: 'Front-B', machine: 'Front', side: 'B', label: '2 & 4', nozzleMan: '', cash: 0, online: 0, ghatti: 0 },
        { id: 'Back-A', machine: 'Back', side: 'A', label: '1 & 3', nozzleMan: '', cash: 0, online: 0, ghatti: 0 },
        { id: 'Back-B', machine: 'Back', side: 'B', label: '2 & 4', nozzleMan: '', cash: 0, online: 0, ghatti: 0 },
    ]);

    // Dedicated state for Lube Sales
    const [lubeState, setLubeState] = useState({ total: 0, cash: 0, online: 0 });

    // Fuel Receipt State
    const [msReceipt, setMsReceipt] = useState<number>(0);
    const [hsdReceipt, setHsdReceipt] = useState<number>(0);

    // Tank Dip Readings State
    const [tankDips, setTankDips] = useState<TankDip[]>([
        { tankName: '1-HSD', manualDip: 0, autoDip: 0 },
        { tankName: '2-HSD', manualDip: 0, autoDip: 0 },
        { tankName: '3-MS', manualDip: 0, autoDip: 0 },
    ]);
    const updateTankDip = (tankName: string, field: 'manualDip' | 'autoDip', value: number) => {
        setTankDips(prev => prev.map(t => t.tankName === tankName ? { ...t, [field]: value } : t));
    };

    // Unified Nozzleman State (stores employeeIds that are being unified)
    const [unifiedEmps, setUnifiedEmps] = useState<string[]>([]);

    // Owner cash handover state
    const [cashToOwner, setCashToOwner] = useState<number>(0);

    // Fetch Products, Rates & Auto-Fill Meters from Previous Shift
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

                    // Fetch Active Employees
                    const { data: emps } = await supabase.from('employees').select('id, name').eq('is_active', true).order('name');
                    if (emps) setEmployees(emps);

                    // If Edit Mode: Fetch Existing Data
                    if (editId) {
                        const { data: existingShift } = await supabase
                            .from('shifts')
                            .select(`
                                *,
                                shift_entries(*, products(name)),
                                shift_sides(*),
                                shift_tanks(*)
                            `)
                            .eq('id', editId)
                            .single();

                        if (existingShift) {
                            setDate(existingShift.shift_date);
                            setShift(existingShift.shift_number.toString() as '1' | '2');
                            setMsReceipt(parseFloat(existingShift.ms_receipt) || 0);
                            setHsdReceipt(parseFloat(existingShift.hsd_receipt) || 0);

                            // Detect if unification is needed based on patterns (e.g. if one side has all cash/online and same emp is elsewhere)
                            // But better to let user toggle. However, if multiple sides have same emp, we might want to pre-unify if they were unified before.
                            // For now, we'll just load the sides.
                            const sideEmpCounts: Record<string, number> = {};
                            if (existingShift.shift_sides) {
                                existingShift.shift_sides.forEach((s: any) => {
                                    if (s.employee_id) sideEmpCounts[s.employee_id] = (sideEmpCounts[s.employee_id] || 0) + 1;
                                });
                            }
                            const potentiallyUnified = Object.keys(sideEmpCounts).filter(id => sideEmpCounts[id] > 1);
                            // We only unify if the split looks unified (e.g. only one side has non-zero payment)
                            // But let's keep it simple: if same emp is on >1 side, we can offer unification.
                            setUnifiedEmps(potentiallyUnified);

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
                                    online: parseFloat(s.online_received) || 0,
                                    ghatti: parseFloat(s.ghatti) || 0
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
                            if (existingShift.shift_tanks && existingShift.shift_tanks.length > 0) {
                                setTankDips(existingShift.shift_tanks.map((t: any) => ({
                                    tankName: t.tank_name,
                                    manualDip: parseFloat(t.manual_dip) || 0,
                                    autoDip: parseFloat(t.auto_dip) || 0
                                })));
                            }
                            setCashToOwner(parseFloat(existingShift.cash_to_owner) || 0);
                        }
                        return; // Skip setting default zero entries
                    }

                    // --- NEW SHIFT: Auto-fill opening meters from previous shift's closing meters ---
                    const { data: previousShiftEntries } = await supabase
                        .from('shift_entries')
                        .select('nozzle_no, closing_meter, shifts!inner(shift_date, shift_number)')
                        .order('shifts(shift_date)', { ascending: false })
                        .order('shifts(shift_number)', { ascending: false })
                        .limit(8);

                    // Build a map from nozzle_no -> closing_meter
                    const prevClosingMap: Record<string, number> = {};
                    if (previousShiftEntries) {
                        previousShiftEntries.forEach((e: any) => {
                            prevClosingMap[e.nozzle_no] = parseFloat(e.closing_meter) || 0;
                        });
                    }

                    // Default Initial State for New Shift, auto-filling opening from previous closing
                    setEntries([
                        { id: 'F1', machine: 'Front', side: 'A', product: 'HSD', product_id: rateMap['HSD'].id, nozzleNo: '1', opening: prevClosingMap['Front-1'] || 0, closing: 0, testing: 0, rate: rateMap['HSD'].rate },
                        { id: 'F3', machine: 'Front', side: 'A', product: 'MS', product_id: rateMap['MS'].id, nozzleNo: '3', opening: prevClosingMap['Front-3'] || 0, closing: 0, testing: 0, rate: rateMap['MS'].rate },
                        { id: 'F2', machine: 'Front', side: 'B', product: 'HSD', product_id: rateMap['HSD'].id, nozzleNo: '2', opening: prevClosingMap['Front-2'] || 0, closing: 0, testing: 0, rate: rateMap['HSD'].rate },
                        { id: 'F4', machine: 'Front', side: 'B', product: 'MS', product_id: rateMap['MS'].id, nozzleNo: '4', opening: prevClosingMap['Front-4'] || 0, closing: 0, testing: 0, rate: rateMap['MS'].rate },
                        { id: 'B1', machine: 'Back', side: 'A', product: 'HSD', product_id: rateMap['HSD'].id, nozzleNo: '1', opening: prevClosingMap['Back-1'] || 0, closing: 0, testing: 0, rate: rateMap['HSD'].rate },
                        { id: 'B3', machine: 'Back', side: 'A', product: 'MS', product_id: rateMap['MS'].id, nozzleNo: '3', opening: prevClosingMap['Back-3'] || 0, closing: 0, testing: 0, rate: rateMap['MS'].rate },
                        { id: 'B2', machine: 'Back', side: 'B', product: 'HSD', product_id: rateMap['HSD'].id, nozzleNo: '2', opening: prevClosingMap['Back-2'] || 0, closing: 0, testing: 0, rate: rateMap['HSD'].rate },
                        { id: 'B4', machine: 'Back', side: 'B', product: 'MS', product_id: rateMap['MS'].id, nozzleNo: '4', opening: prevClosingMap['Back-4'] || 0, closing: 0, testing: 0, rate: rateMap['MS'].rate },
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

    const updateSideProperty = (machine: string, side: string, field: keyof SideEntry, value: string | number) => {
        setSides(sides.map(s => (s.machine === machine && s.side === side) ? { ...s, [field]: value } : s));
    };

    // Helper to calculate totals for a specific side
    const getSideTotals = (machine: string, side: string) => {
        const sideEntries = entries.filter(e => e.machine === machine && e.side === side);
        const sideData = sides.find(s => s.machine === machine && s.side === side);

        const amount = sideEntries.reduce((sum, e) => {
            const qty = (e.closing || 0) - (e.opening || 0) - (e.testing || 0);
            return sum + qty;
        }, 0);

        const totalValue = sideEntries.reduce((sum, e) => {
            const qty = (e.closing || 0) - (e.opening || 0) - (e.testing || 0);
            return sum + (qty * e.rate);
        }, 0);

        const variance = (sideData?.cash || 0) + (sideData?.online || 0) - totalValue;

        return { amount, total: totalValue, variance };
    };

    // Helper for Unified Nozzleman Update
    const updateUnifiedCollection = (empId: string, field: 'cash' | 'online', totalValue: number) => {
        const linkedSides = sides.filter(s => s.employeeId === empId);
        if (linkedSides.length === 0) return;

        // Unified logic: we put everything on the FIRST linked side for internal reconciliation consistency, or distribute it.
        // The prompt says "mostly split manually". I'll split it proportional to their VALUE to keep variances clean.
        const linkedValues = linkedSides.map(ls => {
            const ent = entries.filter(e => e.machine === ls.machine && e.side === ls.side);
            return ent.reduce((sum, e) => sum + ((e.closing - e.opening - e.testing) * e.rate), 0);
        });
        const combinedValue = linkedValues.reduce((a, b) => a + b, 0);

        setSides(prev => prev.map(s => {
            if (s.employeeId !== empId) return s;

            const sideIndex = linkedSides.findIndex(ls => ls.id === s.id);
            const sideVal = linkedValues[sideIndex];

            // Proportional split (to keep variance near zero on all sides if possible)
            let splitAmount = combinedValue > 0 ? (sideVal / combinedValue) * totalValue : totalValue / linkedSides.length;

            return { ...s, [field]: parseFloat(splitAmount.toFixed(2)) };
        }));
    };

    // Calculate Global Unified Stats for the UI
    const getUnifiedStats = (empId: string) => {
        const linkedSides = sides.filter(s => s.employeeId === empId);
        let totalCash = 0;
        let totalOnline = 0;
        let totalValue = 0;

        linkedSides.forEach(ls => {
            totalCash += ls.cash || 0;
            totalOnline += ls.online || 0;
            const ent = entries.filter(e => e.machine === ls.machine && e.side === ls.side);
            totalValue += ent.reduce((sum, e) => sum + ((e.closing - e.opening - e.testing) * e.rate), 0);
        });

        return { totalCash, totalOnline, totalValue, variance: totalCash + totalOnline - totalValue };
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

    // Total Ghatti across all sides
    const totalGhatti = sides.reduce((sum, s) => sum + (s.ghatti || 0), 0);

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
                        manager_id: user.id,
                        ms_receipt: msReceipt,
                        hsd_receipt: hsdReceipt
                    }).eq('id', editId);
                if (updateErr) throw updateErr;

                // Scrub old children
                await supabase.from('shift_entries').delete().eq('shift_id', editId);
                await supabase.from('shift_sides').delete().eq('shift_id', editId);
                await supabase.from('shift_summaries').delete().eq('shift_id', editId);
                await supabase.from('employee_transactions').delete().eq('shift_id', editId);
                await supabase.from('locker_transactions').delete().eq('shift_id', editId);
            } else {
                // Insert New Shift Record Mode
                const { data: shiftData, error: shiftError } = await supabase
                    .from('shifts')
                    .insert([{
                        shift_date: date,
                        shift_number: parseInt(shift),
                        manager_id: user.id,
                        status: 'Pending',
                        locked_flag: false,
                        cash_to_owner: cashToOwner,
                        ms_receipt: msReceipt,
                        hsd_receipt: hsdReceipt
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

            // 3. Insert Sides Data (with ghatti)
            const sidesInserts = sides.map(s => ({
                shift_id: shiftId,
                machine: s.machine,
                side: s.label,
                nozzle_man: s.nozzleMan || 'Unassigned',
                cash_received: s.cash || 0,
                online_received: s.online || 0,
                lube_sales: 0,
                ghatti: s.ghatti || 0
            }));

            // Push dedicated Lube sales record
            sidesInserts.push({
                shift_id: shiftId,
                machine: 'Lube' as any,
                side: 'Sales',
                nozzle_man: 'Manager',
                cash_received: lubeState.cash || 0,
                online_received: lubeState.online || 0,
                lube_sales: lubeState.total || 0,
                ghatti: 0
            });

            const { error: sidesError } = await supabase.from('shift_sides').insert(sidesInserts);
            if (sidesError) throw sidesError;

            // 3a. Record Employee Losses for any Ghatti > 0
            const empTxInserts = sides
                .filter(s => s.ghatti > 0 && s.nozzleMan && s.nozzleMan !== 'Unassigned') // Ensure there's a loss and an employee selected
                .map(s => {
                    const empId = employees.find(e => e.name === s.nozzleMan)?.id;
                    if (!empId) return null;
                    return {
                        employee_id: empId,
                        type: 'loss',
                        amount: s.ghatti,
                        description: `Shortage (Ghatti) on ${s.machine} Side ${s.label} (${date} Shift ${shift})`,
                        shift_id: shiftId
                    };
                }).filter(Boolean);

            if (empTxInserts.length > 0) {
                await supabase.from('employee_transactions').insert(empTxInserts);
            }

            // 3b. Delete previous tank dips if editing, then insert new ones
            if (editId) await supabase.from('shift_tanks').delete().eq('shift_id', shiftId);
            const { error: tanksError } = await supabase.from('shift_tanks').insert(
                tankDips.map(td => ({
                    shift_id: shiftId,
                    tank_name: td.tankName,
                    manual_dip: td.manualDip || 0,
                    auto_dip: td.autoDip || 0
                }))
            );
            if (tanksError) console.warn('Tank dips save failed (non-critical):', tanksError);

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

            // 5. Update Virtual Locker
            const lockerDeposit = totalCashGlobal - cashToOwner;
            if (lockerDeposit !== 0) {
                const { error: lockerError } = await supabase.from('locker_transactions').insert([{
                    type: 'shift_deposit',
                    amount: lockerDeposit,
                    description: `Shift Deposit (${date} Shift ${shift})`,
                    shift_id: shiftId
                }]);
                if (lockerError) console.warn('Locker save failed:', lockerError);
            }

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
        <div className="max-w-7xl mx-auto space-y-4 sm:space-y-6 lg:space-y-8 pb-28 sm:pb-24">
            {/* Header Area */}
            <div className="flex flex-col sm:flex-row items-start sm:justify-between gap-2.5 sm:gap-3 bg-white p-3 sm:p-6 rounded-xl sm:rounded-2xl shadow-sm border border-slate-100">
                <div className="flex items-center gap-2.5 sm:gap-5 w-full sm:w-auto">
                    <Link href="/dashboard/manager" className="text-slate-400 hover:text-blue-600 bg-slate-50 hover:bg-blue-50 p-2 sm:p-3 rounded-lg sm:rounded-xl transition-all h-fit shrink-0">
                        <MoveLeft size={18} />
                    </Link>
                    <div className="min-w-0">
                        <h1 className="text-lg sm:text-2xl lg:text-3xl font-extrabold text-slate-800 m-0 tracking-tight flex items-center gap-2 sm:gap-3">
                            <span className="bg-blue-600 text-white p-1 sm:p-2 rounded-lg sm:rounded-xl text-xs sm:text-lg shadow-md shrink-0">
                                <Banknote size={16} />
                            </span>
                            <span className="truncate">{editId ? 'Edit' : t('newShift', language)} Entry</span>
                        </h1>
                        <p className="text-slate-400 font-medium mt-0.5 sm:mt-2 text-[10px] sm:text-sm">{editId ? 'Update' : 'Record'} nozzle readings & collections.</p>
                    </div>
                </div>

                <div className="hidden lg:flex items-center gap-2 bg-emerald-50 text-emerald-700 px-4 py-2 rounded-full font-bold text-sm border border-emerald-100 shadow-sm shadow-emerald-100/50 shrink-0">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div> Active Shift Session
                </div>
            </div>

            {/* Shift Details Context */}
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-6">
                <div className="bg-white p-2.5 sm:p-5 rounded-xl sm:rounded-2xl border-b-4 border-l border-r border-t border-slate-100 border-b-blue-500 shadow-sm relative overflow-hidden group">
                    <label className="text-[9px] sm:text-xs font-bold text-slate-400 uppercase tracking-widest mb-1 sm:mb-2 block">{t('date', language)}</label>
                    <input
                        type="date"
                        className="w-full bg-transparent border-0 p-0 text-sm sm:text-xl font-bold text-slate-800 focus:ring-0"
                        value={date}
                        onChange={(e) => setDate(e.target.value)}
                    />
                </div>
                <div className="bg-white p-2.5 sm:p-5 rounded-xl sm:rounded-2xl border-b-4 border-l border-r border-t border-slate-100 border-b-indigo-500 shadow-sm relative overflow-hidden group">
                    <label className="text-[9px] sm:text-xs font-bold text-slate-400 uppercase tracking-widest mb-1 sm:mb-2 block">{t('shift', language)}</label>
                    <select
                        className="w-full bg-transparent border-0 p-0 text-sm sm:text-xl font-bold text-slate-800 focus:ring-0 appearance-none cursor-pointer"
                        value={shift}
                        onChange={(e) => setShift(e.target.value as '1' | '2')}
                    >
                        <option value="1">Shift 1 (AM)</option>
                        <option value="2">Shift 2 (PM)</option>
                    </select>
                </div>
                <div className="col-span-2 lg:col-span-1 bg-gradient-to-br from-slate-50 to-slate-100 p-2.5 sm:p-5 rounded-xl sm:rounded-2xl border border-slate-200 shadow-inner">
                    <label className="text-[9px] sm:text-xs font-bold text-slate-400 uppercase tracking-widest mb-1 sm:mb-2 block">{t('managerName', language)}</label>
                    <div className="flex items-center gap-1.5 sm:gap-3">
                        <div className="bg-slate-200 p-1 rounded-full"><UserRound size={12} className="text-slate-600" /></div>
                        <input type="text" className="w-full bg-transparent border-0 p-0 text-sm sm:text-xl font-bold text-slate-600 focus:ring-0" value={user?.name || ''} disabled />
                    </div>
                </div>
            </div>

            {/* Machine Layouts */}
            {['Front', 'Back'].map((machine) => {
                const machineStats = getMachineTotals(machine);
                const isFront = machine === 'Front';

                return (
                    <div key={machine} className={`bg-white rounded-2xl sm:rounded-3xl overflow-hidden shadow-xl shadow-slate-200/40 border ${isFront ? 'border-blue-100' : 'border-purple-100'} transition-shadow hover:shadow-2xl`}>
                        {/* Machine Header */}
                        <div className={`p-3 sm:p-6 bg-gradient-to-r ${isFront ? 'from-blue-900 to-blue-800' : 'from-purple-900 to-purple-800'} text-white flex flex-row justify-between items-center gap-2 sm:gap-4`}>
                            <h2 className="text-base sm:text-2xl font-extrabold m-0 flex items-center gap-1.5 sm:gap-3">
                                <div className={`p-1 sm:p-2 rounded-lg sm:rounded-xl ${isFront ? 'bg-blue-700/50' : 'bg-purple-700/50'} shadow-inner shrink-0`}>
                                    <Calculator size={16} className="text-white/90" />
                                </div>
                                <span className="truncate">{machine} Machine</span>
                            </h2>
                            <div className="flex gap-2 items-center bg-white/10 px-2 sm:px-5 py-1 sm:py-2.5 rounded-lg sm:rounded-2xl backdrop-blur-sm border border-white/10 shrink-0">
                                <span className="text-[10px] sm:text-sm font-medium text-white/70 uppercase tracking-wider hidden xs:inline">Total</span>
                                <strong className="text-sm sm:text-2xl font-black tracking-tight text-white drop-shadow-md">₹{machineStats.totalSale.toFixed(0)}</strong>
                            </div>
                        </div>

                        {/* Sides Loop */}
                        {['A', 'B'].map((sideMarker) => {
                            const sideLabel = sideMarker === 'A' ? '1 & 3' : '2 & 4';
                            const sideState = sides.find(s => s.machine === machine && s.side === sideMarker);
                            const sideStats = getSideTotals(machine, sideMarker);

                            // Unified check
                            const empSides = sideState?.employeeId ? sides.filter(s => s.employeeId === sideState.employeeId) : [];
                            const isUnifiedCandidate = empSides.length > 1;
                            const isUnified = isUnifiedCandidate && unifiedEmps.includes(sideState?.employeeId || '');
                            const isFirstOfUnified = isUnified && empSides[0].id === sideState?.id;
                            const empName = employees.find(e => e.id === sideState?.employeeId)?.name || 'Unknown';
                            const unifiedStats = isUnified ? getUnifiedStats(sideState!.employeeId!) : null;

                            return (
                                <div key={`${machine}-${sideMarker}`} className="border-b-2 border-slate-100/60 last:border-b-0">
                                    <div className="bg-slate-50/50 p-3 sm:p-6 flex flex-col xl:flex-row justify-between xl:items-center gap-3 sm:gap-6">

                                        {/* Left: Side Name & Nozzle Man */}
                                        <div className="flex items-center gap-2 sm:gap-3 xl:w-1/4">
                                            <div className={`flex justify-center items-center w-9 h-9 sm:w-14 sm:h-14 rounded-lg sm:rounded-2xl font-black text-sm sm:text-xl shadow-sm border-2 shrink-0 ${sideMarker === 'A' ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-rose-50 text-rose-700 border-rose-200'}`}>
                                                {sideMarker}
                                            </div>
                                            <div className="space-y-1 sm:space-y-2 flex-1 min-w-0">
                                                <div className="flex items-center justify-between mb-1 sm:mb-2">
                                                    <div className="text-[9px] sm:text-xs font-bold text-slate-400 uppercase tracking-widest truncate">Side {sideMarker} <span className="text-slate-300 hidden sm:inline">({sideLabel})</span></div>

                                                    {isUnifiedCandidate && (
                                                        <button
                                                            onClick={() => {
                                                                const eid = sideState!.employeeId!;
                                                                setUnifiedEmps(prev => prev.includes(eid) ? prev.filter(p => p !== eid) : [...prev, eid]);
                                                            }}
                                                            className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[9px] font-black uppercase transition-all ${isUnified ? 'bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-500/20' : 'bg-white border-slate-200 text-slate-500 hover:border-blue-400'}`}
                                                        >
                                                            <Calculator size={10} />
                                                            {isUnified ? 'Unified' : 'Unify Collection'}
                                                        </button>
                                                    )}
                                                </div>
                                                <select
                                                    value={sideState?.employeeId || ''}
                                                    onChange={(e) => updateSideProperty(machine, sideMarker, 'employeeId', e.target.value)}
                                                    className="w-full py-1.5 sm:py-2.5 px-2 bg-white/80 rounded-lg text-xs sm:text-base text-slate-700 font-bold focus:bg-white focus:ring-2 focus:ring-blue-400 focus:outline-none transition-all shadow-sm border border-slate-200 appearance-none"
                                                    disabled={loading}
                                                >
                                                    <option value="">Employee...</option>
                                                    {employees.map(emp => (
                                                        <option key={emp.id} value={emp.id}>{emp.name}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        </div>

                                        {/* Right: Real-time Stats Context */}
                                        <div className={`grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4 xl:w-3/4 ${isUnified ? 'opacity-40 grayscale pointer-events-none' : ''}`}>
                                            <div className="bg-white p-2 sm:p-4 rounded-lg sm:rounded-2xl shadow-sm border border-slate-100">
                                                <div className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5 flex items-center gap-1"><div className="w-1 h-1 bg-blue-400 rounded-full"></div> Disbursed</div>
                                                <div className="text-sm sm:text-xl font-black text-slate-700">{sideStats.amount.toFixed(1)} L</div>
                                            </div>
                                            <div className="bg-white p-2 sm:p-4 rounded-lg sm:rounded-2xl shadow-sm border border-slate-100">
                                                <div className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5 flex items-center gap-1"><Banknote size={10} className="text-emerald-500" /> Value</div>
                                                <div className="text-sm sm:text-xl font-black text-emerald-600 tracking-tight">₹{sideStats.total.toFixed(0)}</div>
                                            </div>

                                            {/* Transaction Inputs Layer */}
                                            <div className="bg-white p-2 sm:p-4 rounded-lg sm:rounded-2xl shadow-sm border border-slate-200 focus-within:border-emerald-300 focus-within:ring-2 focus-within:ring-emerald-500/10 transition-all">
                                                <label className="text-[9px] sm:text-[10px] font-bold text-emerald-500 uppercase tracking-widest mb-0.5 block">Cash Rx</label>
                                                <div className="flex items-center">
                                                    <span className="text-emerald-400 font-medium mr-1 text-xs">₹</span>
                                                    <input
                                                        type="number"
                                                        placeholder="0"
                                                        className="w-full bg-transparent border-0 p-0 text-sm sm:text-xl font-black text-slate-800 focus:ring-0 placeholder:text-slate-200"
                                                        value={sideState?.cash || ''}
                                                        onChange={(e) => updateSideProperty(machine, sideMarker, 'cash', parseFloat(e.target.value) || 0)}
                                                    />
                                                </div>
                                            </div>
                                            <div className="bg-white p-2 sm:p-4 rounded-lg sm:rounded-2xl shadow-sm border border-slate-200 focus-within:border-indigo-300 focus-within:ring-2 focus-within:ring-indigo-500/10 transition-all">
                                                <label className="text-[9px] sm:text-[10px] font-bold text-indigo-500 uppercase tracking-widest mb-0.5 block">UPI Rx</label>
                                                <div className="flex items-center">
                                                    <span className="text-indigo-400 font-medium mr-1 text-xs">₹</span>
                                                    <input
                                                        type="number"
                                                        placeholder="0"
                                                        className="w-full bg-transparent border-0 p-0 text-sm sm:text-xl font-black text-slate-800 focus:ring-0 placeholder:text-slate-200"
                                                        value={sideState?.online || ''}
                                                        onChange={(e) => updateSideProperty(machine, sideMarker, 'online', parseFloat(e.target.value) || 0)}
                                                    />
                                                </div>
                                            </div>
                                        </div>

                                    </div>

                                    {isUnified && isFirstOfUnified && (
                                        <div className="mx-2 sm:mx-6 mb-4 p-3 sm:p-5 bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl sm:rounded-2xl border border-slate-700 shadow-xl overflow-hidden relative">
                                            <div className="relative z-10 flex flex-col gap-3">
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse"></div>
                                                        <span className="text-[10px] sm:text-xs font-black text-blue-300 uppercase tracking-widest">Unified Collection: {empName}</span>
                                                    </div>
                                                </div>

                                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                                    <div className="bg-white/5 p-2 rounded-lg border border-white/5">
                                                        <div className="text-[8px] sm:text-[9px] font-bold text-slate-500 uppercase">Total Value</div>
                                                        <div className="text-sm sm:text-lg font-black text-white">₹{unifiedStats?.totalValue.toFixed(0)}</div>
                                                    </div>

                                                    <div className="bg-slate-700/50 p-2 rounded-lg border border-emerald-500/30">
                                                        <div className="text-[8px] sm:text-[9px] font-bold text-emerald-400 uppercase">Total Cash</div>
                                                        <div className="flex items-center border-b border-emerald-500/20 pb-0.5 mt-1">
                                                            <span className="text-emerald-500 text-[10px] mr-1">₹</span>
                                                            <input
                                                                type="number"
                                                                className="w-full bg-transparent border-none p-0 text-sm sm:text-lg font-black text-white focus:ring-0"
                                                                placeholder="0"
                                                                value={unifiedStats?.totalCash || ''}
                                                                onChange={(e) => updateUnifiedCollection(sideState?.employeeId || '', 'cash', parseFloat(e.target.value) || 0)}
                                                            />
                                                        </div>
                                                    </div>

                                                    <div className="bg-slate-700/50 p-2 rounded-lg border border-indigo-500/30">
                                                        <div className="text-[8px] sm:text-[9px] font-bold text-indigo-400 uppercase">Total UPI</div>
                                                        <div className="flex items-center border-b border-indigo-500/20 pb-0.5 mt-1">
                                                            <span className="text-indigo-500 text-[10px] mr-1">₹</span>
                                                            <input
                                                                type="number"
                                                                className="w-full bg-transparent border-none p-0 text-sm sm:text-lg font-black text-white focus:ring-0"
                                                                placeholder="0"
                                                                value={unifiedStats?.totalOnline || ''}
                                                                onChange={(e) => updateUnifiedCollection(sideState?.employeeId || '', 'online', parseFloat(e.target.value) || 0)}
                                                            />
                                                        </div>
                                                    </div>

                                                    <div className={`p-2 rounded-lg border ${Math.abs(unifiedStats?.variance || 0) > 10 ? 'bg-red-500/10 border-red-500/30 text-red-400' : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'}`}>
                                                        <div className="text-[8px] sm:text-[9px] font-bold uppercase opacity-70">Margin</div>
                                                        <div className="text-sm sm:text-lg font-black">₹{unifiedStats?.variance.toFixed(0)}</div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* Nozzle Meter Entries */}
                                    <div className="bg-white p-2 sm:p-6 border-t border-slate-100">
                                        <h4 className="text-[11px] sm:text-sm font-bold text-slate-500 mb-2 sm:mb-4 flex items-center gap-1.5">
                                            <Gauge size={12} className="text-blue-500" />
                                            Nozzles - Side {sideMarker}
                                        </h4>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 sm:gap-4">
                                            {entries.filter(e => e.machine === machine && e.side === sideMarker).map(entry => (
                                                <div key={entry.id} className="bg-slate-50/50 p-2 sm:p-4 rounded-lg sm:rounded-xl border border-slate-200">
                                                    <div className="flex items-center gap-1.5 sm:gap-2 mb-1.5 sm:mb-3">
                                                        <div className={`w-6 h-6 sm:w-8 sm:h-8 rounded-md sm:rounded-lg flex items-center justify-center font-black text-[10px] sm:text-sm shrink-0 ${entry.product === 'MS' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                                                            {entry.nozzleNo}
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <div className="text-[10px] sm:text-xs font-bold text-slate-500 truncate">{entry.product} - N{entry.nozzleNo}</div>
                                                            <div className="text-[9px] text-slate-400">₹{entry.rate}/L</div>
                                                        </div>
                                                        <div className="text-right">
                                                            <div className="text-[9px] text-slate-400 leading-none">Sale</div>
                                                            <div className="text-[11px] sm:text-sm font-black text-slate-700">{(entry.closing - entry.opening - entry.testing).toFixed(1)}L</div>
                                                        </div>
                                                    </div>
                                                    <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
                                                        <div>
                                                            <label className="text-[8px] sm:text-[9px] font-bold text-slate-400 uppercase block mb-0.5 sm:mb-1">Open</label>
                                                            <input
                                                                type="number"
                                                                step="0.01"
                                                                inputMode="decimal"
                                                                className="w-full px-1.5 sm:px-2 py-1.5 sm:py-2 bg-white rounded-lg border border-slate-200 text-xs sm:text-sm font-mono font-bold text-slate-700 focus:ring-2 focus:ring-blue-400 focus:outline-none"
                                                                value={entry.opening || ''}
                                                                onChange={(e) => updateEntry(entry.id, 'opening', parseFloat(e.target.value) || 0)}
                                                                placeholder="0"
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="text-[8px] sm:text-[9px] font-bold text-slate-400 uppercase block mb-0.5 sm:mb-1">Close</label>
                                                            <input
                                                                type="number"
                                                                step="0.01"
                                                                inputMode="decimal"
                                                                className="w-full px-1.5 sm:px-2 py-1.5 sm:py-2 bg-white rounded-lg border border-slate-200 text-xs sm:text-sm font-mono font-bold text-slate-700 focus:ring-2 focus:ring-blue-400 focus:outline-none"
                                                                value={entry.closing || ''}
                                                                onChange={(e) => updateEntry(entry.id, 'closing', parseFloat(e.target.value) || 0)}
                                                                placeholder="0"
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="text-[8px] sm:text-[9px] font-bold text-slate-400 uppercase block mb-0.5 sm:mb-1">Test</label>
                                                            <input
                                                                type="number"
                                                                step="0.01"
                                                                inputMode="decimal"
                                                                className="w-full px-1.5 sm:px-2 py-1.5 sm:py-2 bg-white rounded-lg border border-slate-200 text-xs sm:text-sm font-mono font-bold text-slate-700 focus:ring-2 focus:ring-blue-400 focus:outline-none"
                                                                value={entry.testing || ''}
                                                                onChange={(e) => updateEntry(entry.id, 'testing', parseFloat(e.target.value) || 0)}
                                                                placeholder="0"
                                                            />
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Verification Matrix Row */}
                                    <div className="bg-white px-2.5 sm:px-6 py-2 sm:py-4 flex flex-row justify-between items-center gap-2 sm:gap-4 border-t border-slate-50/50">
                                        <div className="bg-slate-50 px-2 sm:px-4 py-1.5 rounded-lg sm:rounded-xl border border-slate-100 flex items-center gap-1.5">
                                            <div className="text-[8px] sm:text-[9px] font-bold text-slate-400 uppercase tracking-wider">Ghatti</div>
                                            <div className="flex items-center text-red-500 font-bold min-w-0">
                                                <span className="text-[10px] mr-0.5">₹</span>
                                                <input
                                                    type="number"
                                                    inputMode="decimal"
                                                    placeholder="0"
                                                    className="w-12 sm:w-16 bg-transparent border-0 p-0 focus:ring-0 text-red-600 font-black text-xs sm:text-sm placeholder:text-red-300/50"
                                                    value={sideState?.ghatti || ''}
                                                    onChange={(e) => updateSideProperty(machine, sideMarker, 'ghatti', parseFloat(e.target.value) || 0)}
                                                />
                                            </div>
                                        </div>

                                        <div className={`px-2.5 sm:px-5 py-1.5 rounded-lg sm:rounded-xl flex items-center gap-2 sm:gap-3 font-bold border shadow-sm ${Math.abs(sideStats.variance) > 5 ? 'bg-red-50 text-red-600 border-red-200 shadow-red-500/10' : 'bg-emerald-50 text-emerald-700 border-emerald-200 shadow-emerald-500/10'}`}>
                                            <span className="text-[9px] sm:text-[10px] uppercase tracking-wider opacity-80 hidden xs:inline">Margin</span>
                                            <span className="text-xs sm:text-lg font-black">{sideStats.variance > 0 ? '+' : ''}₹{sideStats.variance.toFixed(0)}</span>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                );
            })}

            {/* Lube Sales Card */}
            <div className="bg-white rounded-2xl sm:rounded-3xl overflow-hidden shadow-xl shadow-slate-200/40 border border-amber-100">
                {/* Lube Header */}
                <div className="p-3 sm:p-6 bg-gradient-to-r from-amber-900 to-amber-800 text-white flex flex-row justify-between items-center gap-2 sm:gap-3">
                    <h2 className="text-base sm:text-2xl font-extrabold m-0 flex items-center gap-1.5 sm:gap-3">
                        <div className="p-1 sm:p-2 rounded-lg sm:rounded-xl bg-amber-700/50 shadow-inner shrink-0">
                            <FlaskConical size={16} className="text-white/90" />
                        </div>
                        <span className="truncate">Lube Sales</span>
                    </h2>
                    <div className="flex gap-2 items-center bg-white/10 px-2 sm:px-5 py-1 sm:py-2.5 rounded-lg sm:rounded-2xl backdrop-blur-sm border border-white/10 shrink-0">
                        <span className="text-[10px] sm:text-sm font-medium text-white/70 uppercase tracking-wider hidden xs:inline">Total</span>
                        <strong className="text-sm sm:text-2xl font-black tracking-tight text-white drop-shadow-md">₹{lubeState.total.toFixed(0)}</strong>
                    </div>
                </div>

                {/* Lube Content */}
                <div className="bg-white p-2.5 sm:p-6">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-6">
                        <div className="bg-gradient-to-br from-amber-50 to-amber-100/50 p-2.5 sm:p-5 rounded-xl sm:rounded-2xl border-2 border-amber-100 shadow-sm flex items-center sm:block gap-3 sm:gap-0">
                            <label className="text-[9px] sm:text-xs font-bold text-amber-600 uppercase tracking-widest sm:mb-2 block sm:w-auto w-16 shrink-0">Lube Total</label>
                            <div className="flex items-center flex-1">
                                <span className="text-amber-500 font-medium mr-1 text-sm sm:text-xl">₹</span>
                                <input type="number" inputMode="decimal" placeholder="0" className="w-full bg-white border border-amber-200 rounded-lg sm:rounded-xl px-2 sm:px-4 py-1.5 sm:py-3 text-sm sm:text-2xl font-black text-slate-800 focus:ring-2 focus:ring-amber-400/30 focus:outline-none placeholder:text-slate-300 transition-all"
                                    value={lubeState.total || ''}
                                    onChange={(e) => setLubeState({ ...lubeState, total: parseFloat(e.target.value) || 0 })}
                                />
                            </div>
                        </div>
                        <div className="bg-gradient-to-br from-emerald-50 to-emerald-100/50 p-2.5 sm:p-5 rounded-xl sm:rounded-2xl border-2 border-emerald-100 shadow-sm flex items-center sm:block gap-3 sm:gap-0">
                            <label className="text-[9px] sm:text-xs font-bold text-emerald-600 uppercase tracking-widest sm:mb-2 block sm:w-auto w-16 shrink-0">Cash Rx</label>
                            <div className="flex items-center flex-1">
                                <span className="text-emerald-500 font-medium mr-1 text-sm sm:text-xl">₹</span>
                                <input type="number" inputMode="decimal" placeholder="0" className="w-full bg-white border border-emerald-200 rounded-lg sm:rounded-xl px-2 sm:px-4 py-1.5 sm:py-3 text-sm sm:text-2xl font-black text-slate-800 focus:ring-2 focus:ring-emerald-400/30 focus:outline-none placeholder:text-slate-300 transition-all"
                                    value={lubeState.cash || ''}
                                    onChange={(e) => setLubeState({ ...lubeState, cash: parseFloat(e.target.value) || 0 })}
                                />
                            </div>
                        </div>
                        <div className="bg-gradient-to-br from-indigo-50 to-indigo-100/50 p-2.5 sm:p-5 rounded-xl sm:rounded-2xl border-2 border-indigo-100 shadow-sm flex items-center sm:block gap-3 sm:gap-0">
                            <label className="text-[9px] sm:text-xs font-bold text-indigo-600 uppercase tracking-widest sm:mb-2 block sm:w-auto w-16 shrink-0">UPI Rx</label>
                            <div className="flex items-center flex-1">
                                <span className="text-indigo-500 font-medium mr-1 text-sm sm:text-xl">₹</span>
                                <input type="number" inputMode="decimal" placeholder="0" className="w-full bg-white border border-indigo-200 rounded-lg sm:rounded-xl px-2 sm:px-4 py-1.5 sm:py-3 text-sm sm:text-2xl font-black text-slate-800 focus:ring-2 focus:ring-indigo-400/30 focus:outline-none placeholder:text-slate-300 transition-all"
                                    value={lubeState.online || ''}
                                    onChange={(e) => setLubeState({ ...lubeState, online: parseFloat(e.target.value) || 0 })}
                                />
                            </div>
                        </div>
                    </div>

                    <div className="mt-4 sm:mt-6 bg-slate-50/50 p-3 sm:p-5 rounded-xl sm:rounded-2xl border border-slate-200">
                        <div className="flex flex-row justify-between items-center gap-3">
                            <div>
                                <div className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-widest mb-0.5">Collection</div>
                                <div className="text-lg sm:text-2xl font-black text-slate-700">₹{(lubeState.cash + lubeState.online).toFixed(0)}</div>
                            </div>
                            <div className={`px-3 sm:px-6 py-2 sm:py-3 rounded-lg sm:rounded-xl flex items-center gap-2 sm:gap-3 font-bold border shadow-sm ${Math.abs((lubeState.cash + lubeState.online) - lubeState.total) > 5 ? 'bg-red-50 text-red-600 border-red-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
                                <span className="text-[9px] sm:text-xs uppercase tracking-wider opacity-80">Var</span>
                                <span className="text-base sm:text-xl font-black">
                                    {((lubeState.cash + lubeState.online) - lubeState.total) > 0 ? '+' : ''}
                                    ₹{((lubeState.cash + lubeState.online) - lubeState.total).toFixed(0)}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Tank Dip Readings Card */}
            <div className="card w-full relative border border-teal-100 shadow-lg bg-gradient-to-br from-teal-50/50 to-white overflow-hidden rounded-xl sm:rounded-[2rem] p-2.5 sm:p-6">
                <div className="flex items-center gap-2 sm:gap-4 border-b border-teal-100 pb-2 sm:pb-5 mb-3 sm:mb-6">
                    <div className="w-8 h-8 sm:w-12 sm:h-12 bg-teal-100 rounded-lg sm:rounded-2xl flex items-center justify-center shadow-inner shrink-0">
                        <Gauge size={16} className="text-teal-600" />
                    </div>
                    <div className="min-w-0">
                        <h3 className="text-sm sm:text-xl font-black text-slate-800 tracking-tight m-0">Tank Dip Readings</h3>
                        <p className="text-[9px] sm:text-xs font-bold text-slate-400 uppercase tracking-widest mt-0.5 truncate text-wrap">Manual & Auto per Tank</p>
                    </div>
                </div>

                <div className="overflow-x-auto hide-scrollbar -mx-1 sm:mx-0">
                    <table className="w-full text-left min-w-[340px]">
                        <thead>
                            <tr className="bg-teal-50/60 text-slate-400 text-[8px] sm:text-[10px] uppercase font-bold tracking-widest border-b border-teal-100">
                                <th className="py-2 px-2 sm:px-5">Tank</th>
                                <th className="py-2 px-2 sm:px-5">Type</th>
                                <th className="py-2 px-2 sm:px-5">Manual</th>
                                <th className="py-2 px-2 sm:px-5">Auto</th>
                                <th className="py-2 px-2 sm:px-5 text-right">Diff</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-teal-100/60">
                            {tankDips.map((td, i) => {
                                const diff = td.autoDip - td.manualDip;
                                return (
                                    <tr key={td.tankName} className={`${i % 2 === 0 ? 'bg-white' : 'bg-teal-50/20'}`}>
                                        <td className="py-1.5 px-2 sm:px-5">
                                            <span className="font-black text-slate-700 text-xs sm:text-base">{td.tankName.split('-')[0]}</span>
                                        </td>
                                        <td className="py-1.5 px-2 sm:px-5">
                                            <span className={`px-1.5 py-0.5 rounded text-[8px] sm:text-xs font-bold ring-1 ring-inset ${td.tankName.endsWith('HSD') ? 'bg-amber-50 text-amber-700 ring-amber-200' : 'bg-emerald-50 text-emerald-700 ring-emerald-200'}`}>
                                                {td.tankName.endsWith('HSD') ? 'HSD' : 'MS'}
                                            </span>
                                        </td>
                                        <td className="py-1.5 px-1.5 sm:px-5">
                                            <input type="number" inputMode="decimal" placeholder="0"
                                                className="w-12 sm:w-full py-1 sm:py-2 px-1.5 sm:px-3 bg-slate-100/80 rounded-lg text-xs sm:text-sm text-slate-700 font-semibold focus:bg-white focus:ring-2 focus:ring-teal-400 focus:outline-none transition-all placeholder:text-slate-300"
                                                value={td.manualDip === 0 ? '' : td.manualDip}
                                                onChange={(e) => updateTankDip(td.tankName, 'manualDip', parseFloat(e.target.value) || 0)}
                                            />
                                        </td>
                                        <td className="py-1.5 px-1.5 sm:px-5">
                                            <input type="number" inputMode="decimal" placeholder="0"
                                                className="w-12 sm:w-full py-1 sm:py-2 px-1.5 sm:px-3 bg-slate-100/80 rounded-lg text-xs sm:text-sm text-slate-700 font-semibold focus:bg-white focus:ring-2 focus:ring-teal-400 focus:outline-none transition-all placeholder:text-slate-300"
                                                value={td.autoDip === 0 ? '' : td.autoDip}
                                                onChange={(e) => updateTankDip(td.tankName, 'autoDip', parseFloat(e.target.value) || 0)}
                                            />
                                        </td>
                                        <td className={`py-1.5 px-2 sm:px-5 text-right text-xs sm:text-sm font-bold ${Math.abs(diff) > 1 ? (diff < 0 ? 'text-red-500' : 'text-emerald-600') : 'text-slate-400'}`}>
                                            {diff !== 0 ? `${diff > 0 ? '+' : ''}${diff.toFixed(1)}` : '-'}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Fuel Receipt Section */}
            <div className="card w-full relative border border-blue-100 shadow-lg bg-gradient-to-br from-blue-50/50 to-white overflow-hidden rounded-xl sm:rounded-[2rem] p-4 sm:p-6">
                <div className="flex items-center gap-2 sm:gap-4 border-b border-blue-100 pb-3 sm:pb-5 mb-4 sm:mb-6">
                    <div className="w-8 h-8 sm:w-12 sm:h-12 bg-blue-100 rounded-lg sm:rounded-2xl flex items-center justify-center shadow-inner shrink-0">
                        <Truck size={18} className="text-blue-600 sm:w-6 sm:h-6" />
                    </div>
                    <div className="min-w-0">
                        <h3 className="text-sm sm:text-xl font-black text-slate-800 tracking-tight m-0">Fuel Receipt</h3>
                        <p className="text-[9px] sm:text-xs font-bold text-slate-400 uppercase tracking-widest mt-0.5 truncate text-wrap">Quantity loaded today</p>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-3 sm:gap-6">
                    <div className="space-y-1.5 sm:space-y-2">
                        <label className="flex items-center gap-1.5 text-[10px] sm:text-xs font-black text-emerald-600 uppercase tracking-widest ml-1">
                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
                            MS Petrol (Ltr)
                        </label>
                        <div className="relative group">
                            <input
                                type="number"
                                inputMode="decimal"
                                placeholder="0.00"
                                className="w-full py-2.5 sm:py-4 px-3 sm:px-5 bg-slate-100/80 rounded-xl sm:rounded-2xl text-base sm:text-xl font-mono font-black text-slate-800 focus:bg-white focus:ring-4 focus:ring-emerald-400/20 focus:outline-none transition-all placeholder:text-slate-300"
                                value={msReceipt === 0 ? '' : msReceipt}
                                onChange={(e) => setMsReceipt(parseFloat(e.target.value) || 0)}
                            />
                        </div>
                    </div>
                    <div className="space-y-1.5 sm:space-y-2">
                        <label className="flex items-center gap-1.5 text-[10px] sm:text-xs font-black text-amber-600 uppercase tracking-widest ml-1">
                            <div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></div>
                            HSD Diesel (Ltr)
                        </label>
                        <div className="relative group">
                            <input
                                type="number"
                                inputMode="decimal"
                                placeholder="0.00"
                                className="w-full py-2.5 sm:py-4 px-3 sm:px-5 bg-slate-100/80 rounded-xl sm:rounded-2xl text-base sm:text-xl font-mono font-black text-slate-800 focus:bg-white focus:ring-4 focus:ring-amber-400/20 focus:outline-none transition-all placeholder:text-slate-300"
                                value={hsdReceipt === 0 ? '' : hsdReceipt}
                                onChange={(e) => setHsdReceipt(parseFloat(e.target.value) || 0)}
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* Grand Global Summary */}
            <div className="card relative overflow-hidden bg-gradient-to-r from-blue-950 via-slate-900 to-slate-950 text-white shadow-2xl shadow-blue-900/40 border-none px-4 py-6 sm:px-6 sm:py-8 md:p-10 rounded-2xl sm:rounded-3xl">
                <div className="absolute top-0 right-0 w-40 sm:w-64 h-40 sm:h-64 bg-blue-500 rounded-full blur-[80px] sm:blur-[100px] opacity-20 pointer-events-none"></div>

                <div className="relative z-10">
                    <div>
                        <div className="inline-block px-2.5 sm:px-3 py-1 mb-2 sm:mb-3 rounded-full bg-blue-500/20 text-blue-300 text-[10px] sm:text-xs font-bold uppercase tracking-widest border border-blue-500/30">Summary</div>
                        <h2 className="text-2xl sm:text-3xl lg:text-4xl font-black m-0 text-white tracking-tight">Grand Shift Summary</h2>
                    </div>

                    <div className="bg-white/5 backdrop-blur-md p-3 sm:p-6 rounded-xl sm:rounded-2xl border border-white/10 w-full mt-3 sm:mt-6 shadow-inner">
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5 sm:gap-4">
                            <div>
                                <div className="text-[8px] sm:text-[10px] text-emerald-400 uppercase tracking-widest font-bold mb-0.5">MS Fuel</div>
                                <div className="text-base sm:text-xl font-black text-white">{grandTotals.ms.toFixed(1)}L</div>
                            </div>
                            <div>
                                <div className="text-[8px] sm:text-[10px] text-amber-400 uppercase tracking-widest font-bold mb-0.5">HSD Fuel</div>
                                <div className="text-base sm:text-xl font-black text-white">{grandTotals.hsd.toFixed(1)}L</div>
                            </div>
                            <div className="col-span-1">
                                <div className="text-[8px] sm:text-[10px] text-blue-300/80 uppercase tracking-widest font-bold mb-0.5">Exp Sale</div>
                                <div className="text-lg sm:text-2xl lg:text-3xl font-black text-white">₹{grandTotals.amount.toFixed(0)}</div>
                            </div>
                            <div className="col-span-1">
                                <div className="text-[8px] sm:text-[10px] text-amber-300/80 uppercase tracking-widest font-bold mb-0.5">Lube</div>
                                <div className="text-base sm:text-xl font-black text-amber-400">₹{grandTotals.lube.toFixed(0)}</div>
                            </div>

                            {totalGhatti > 0 && <div>
                                <div className="text-[8px] sm:text-[10px] text-red-300/80 uppercase tracking-widest font-bold mb-0.5 flex items-center gap-1"><AlertTriangle size={8} /> Ghatti</div>
                                <div className="text-base sm:text-xl font-black text-red-400">₹{totalGhatti.toFixed(0)}</div>
                            </div>}

                            <div>
                                <div className="text-[8px] sm:text-[10px] text-emerald-300/80 uppercase tracking-widest font-bold mb-0.5">Cash Rx</div>
                                <div className="text-base sm:text-xl font-black text-emerald-400">₹{totalCashGlobal.toFixed(0)}</div>
                            </div>
                            <div>
                                <div className="text-[8px] sm:text-[10px] text-indigo-300/80 uppercase tracking-widest font-bold mb-0.5">UPI Rx</div>
                                <div className="text-base sm:text-xl font-black text-indigo-400">₹{totalOnlineGlobal.toFixed(0)}</div>
                            </div>

                            {/* Owner Handover & Locker */}
                            <div className="bg-slate-900/50 p-2 sm:p-4 rounded-lg sm:rounded-xl border border-slate-800">
                                <div className="text-[8px] sm:text-[10px] text-rose-300/80 font-bold uppercase tracking-widest mb-0.5 flex items-center gap-1"><Banknote size={8} /> Handover</div>
                                <div className="flex items-center text-rose-400 font-black text-sm sm:text-xl">
                                    <span className="mr-0.5 text-[10px] sm:text-sm">₹</span>
                                    <input type="number" inputMode="decimal" min="0" placeholder="0"
                                        className="w-12 sm:w-20 bg-transparent border-0 border-b border-rose-500/30 p-0 text-rose-400 focus:ring-0 focus:border-rose-400 text-sm sm:text-xl font-black placeholder:text-rose-900/50 transition-colors"
                                        value={cashToOwner === 0 ? '' : cashToOwner}
                                        onChange={(e) => setCashToOwner(parseFloat(e.target.value) || 0)}
                                    />
                                </div>
                            </div>

                            <div className="bg-slate-900/50 p-2 sm:p-4 rounded-lg sm:rounded-xl border border-slate-800">
                                <div className="text-[8px] sm:text-[10px] text-teal-300/80 font-bold uppercase tracking-widest mb-0.5 flex items-center gap-1"><Vault size={8} /> Locker</div>
                                <div className="text-base sm:text-xl font-black text-teal-400">₹{(totalCashGlobal - cashToOwner).toFixed(0)}</div>
                            </div>

                            {/* Net Discrepancy */}
                            <div className="col-span-2 sm:col-span-1">
                                <div className="text-[8px] sm:text-[10px] text-blue-300/80 font-bold uppercase tracking-widest mb-0.5">Variance</div>
                                <div className={`px-2 sm:px-4 py-1.5 sm:py-2 rounded-lg sm:rounded-xl text-base sm:text-2xl lg:text-3xl font-black border inline-block ${hasGlobalMismatch ? (globalDiff < 0 ? 'text-red-300 bg-red-900/30 border-red-500/30' : 'text-emerald-300 bg-emerald-900/30 border-emerald-500/30') : 'text-slate-300 bg-slate-800 border-slate-600/50'}`}>
                                    {globalDiff > 0 ? '+' : ''}₹{globalDiff.toFixed(0)}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Desktop submit */}
                <div className="mt-6 sm:mt-10 hidden sm:flex justify-end relative z-10 border-t border-white/10 pt-6 sm:pt-8">
                    <button
                        onClick={handleSubmit}
                        disabled={loading}
                        className="bg-blue-600 hover:bg-blue-500 text-white pl-6 pr-8 py-4 rounded-xl sm:rounded-2xl font-black text-lg sm:text-xl shadow-xl shadow-blue-600/20 hover:shadow-blue-500/40 hover:-translate-y-1 flex items-center gap-3 sm:gap-4 transition-all duration-300 disabled:opacity-50 disabled:hover:translate-y-0 disabled:cursor-not-allowed focus:ring-4 focus:ring-blue-500/30 outline-none"
                    >
                        {loading ? <Loader2 size={22} className="animate-spin" /> : <Save size={22} />}
                        {loading ? 'Submitting...' : 'Submit Shift Entry'}
                    </button>
                </div>
            </div>

            {/* Mobile Fixed Bottom Submit Button */}
            <div className="sm:hidden fixed bottom-0 left-0 right-0 z-50 p-3 bg-white/95 backdrop-blur-md border-t border-slate-200 safe-area-bottom">
                <button
                    onClick={handleSubmit}
                    disabled={loading}
                    className="w-full bg-blue-600 hover:bg-blue-500 text-white py-3.5 rounded-xl font-bold text-base shadow-lg shadow-blue-600/20 flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]"
                >
                    {loading ? <Loader2 size={20} className="animate-spin" /> : <Save size={20} />}
                    {loading ? 'Submitting...' : 'Submit Shift'}
                </button>
            </div>
        </div>
    );
}

export default function ShiftEntryPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen bg-slate-50 flex items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <Loader2 size={48} className="text-blue-500 animate-spin" />
                    <p className="text-slate-500 font-medium">Loading shift system...</p>
                </div>
            </div>
        }>
            <ShiftEntryContent />
        </Suspense>
    );
}