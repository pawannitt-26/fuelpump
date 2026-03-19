"use client";

import { useState, useEffect } from 'react';
import { useAppStore } from '@/store/appStore';
import { supabase } from '@/lib/supabase';
import { Vault, ArrowUpRight, ArrowDownRight, History, Check, Landmark } from 'lucide-react';

interface LockerTransaction {
    id: string;
    type: 'shift_deposit' | 'expense' | 'employee_advance' | 'owner_withdrawal' | 'owner_deposit';
    amount: number;
    description: string;
    created_at: string;
    runningBalance?: number;
}

export default function VirtualLockerPage() {
    const { language, user } = useAppStore();
    const [transactions, setTransactions] = useState<LockerTransaction[]>([]);
    const [balance, setBalance] = useState(0);
    const [loading, setLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // New Transaction Form State
    const [txType, setTxType] = useState<'owner_deposit' | 'owner_withdrawal' | 'expense'>('owner_withdrawal');
    const [txAmount, setTxAmount] = useState('');
    const [txDesc, setTxDesc] = useState('');
    const [txDate, setTxDate] = useState(new Date().toISOString().substring(0, 10));

    useEffect(() => {
        fetchLockerData();
    }, []);

    const fetchLockerData = async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from('locker_transactions')
            .select('*')
            .order('created_at', { ascending: true }); // Process chronologically for running balance

        if (!error && data) {
            let currentTotal = 0;
            const processed = data.map(tx => {
                currentTotal += Number(tx.amount);
                return { ...tx, runningBalance: currentTotal };
            });
            // Show latest first
            setTransactions([...processed].reverse());
            setBalance(currentTotal);
        } else if (error) {
            console.error('Error fetching locker transactions:', error);
        }
        setLoading(false);
    };

    const handleAddTransaction = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!txAmount || isNaN(Number(txAmount))) return;
        setIsSubmitting(true);

        const absAmount = Math.abs(Number(txAmount));
        // owner_deposit adds to locker (+), expense/withdrawal/advance removes (-)
        const isAddition = txType === 'owner_deposit';
        const finalAmount = isAddition ? absAmount : -absAmount;

        const { error } = await supabase
            .from('locker_transactions')
            .insert([{
                type: txType,
                amount: finalAmount,
                description: txDesc.trim() || (txType === 'expense' ? 'Station Expense' : isAddition ? 'Owner Deposit' : 'Owner Withdrawal'),
                created_at: new Date(txDate).toISOString()
            }]);

        if (!error) {
            setTxAmount('');
            setTxDesc('');
            fetchLockerData();
        } else {
            alert('Failed to record transaction: ' + error.message);
        }
        setIsSubmitting(false);
    };

    if (user?.role !== 'Admin' && user?.role !== 'Manager') {
        return <div className="p-8 text-center text-red-500 font-bold">Access Denied</div>;
    }

    return (
        <div className="max-w-7xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white p-4 sm:p-6 rounded-xl sm:rounded-2xl shadow-sm border border-slate-200">
                <div className="flex items-center gap-3 sm:gap-4 w-full sm:w-auto">
                    <div className="bg-emerald-600 text-white p-2 sm:p-3 rounded-lg sm:rounded-2xl shadow-md shrink-0">
                        <Vault size={24} className="sm:w-7 sm:h-7" />
                    </div>
                    <div className="min-w-0">
                        <h1 className="text-xl sm:text-2xl font-black text-slate-800 m-0 truncate">Virtual Locker</h1>
                        <p className="text-slate-500 text-[10px] sm:text-sm truncate">Track float cash and deposits.</p>
                    </div>
                </div>

                <div className="flex flex-col items-center sm:items-end text-center sm:text-right bg-slate-50 px-4 sm:px-6 py-2 sm:py-3 rounded-lg sm:rounded-2xl border border-slate-200 w-full sm:w-auto">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Available Float</span>
                    <span className={`text-2xl sm:text-3xl font-black font-mono tracking-tight ${balance >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                        ₹ {balance.toLocaleString('en-IN', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                    </span>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                {/* Left Col: Add Transaction */}
                <div className="lg:col-span-1 space-y-4 sm:space-y-6">
                    <div className="card bg-white p-4 sm:p-6 rounded-2xl sm:rounded-3xl border border-slate-200 shadow-sm sm:sticky sm:top-6">
                        <h2 className="text-base sm:text-lg font-bold text-slate-800 mb-4 sm:mb-6 flex items-center justify-between border-b pb-3 sm:pb-4">
                            <div className="flex items-center gap-2">
                                <Landmark size={18} className="text-emerald-500" />
                                Record Cash
                            </div>
                            <div className="px-2 py-0.5 bg-slate-100 rounded text-[10px] font-mono font-bold text-slate-500">
                                Bal: ₹{balance.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                            </div>
                        </h2>
                        <form onSubmit={handleAddTransaction} className="space-y-4 sm:space-y-5">
                            <div>
                                <label className="block text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5 sm:mb-2 text-center sm:text-left">Category</label>
                                <div className="grid grid-cols-1 gap-2">
                                    <button type="button" onClick={() => setTxType('owner_deposit')} className={`py-2 sm:py-2.5 px-3 text-xs sm:text-sm font-bold justify-start rounded-lg sm:rounded-xl border flex items-center gap-2 transition-colors ${txType === 'owner_deposit' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'}`}>
                                        <ArrowUpRight size={14} className="sm:w-4 sm:h-4" /> Deposit From Owner
                                    </button>
                                    <button type="button" onClick={() => setTxType('owner_withdrawal')} className={`py-2 sm:py-2.5 px-3 text-xs sm:text-sm font-bold justify-start rounded-lg sm:rounded-xl border flex items-center gap-2 transition-colors ${txType === 'owner_withdrawal' ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'}`}>
                                        <ArrowDownRight size={14} className="sm:w-4 sm:h-4" /> Handover to Owner
                                    </button>
                                    <button type="button" onClick={() => setTxType('expense')} className={`py-2 sm:py-2.5 px-3 text-xs sm:text-sm font-bold justify-start rounded-lg sm:rounded-xl border flex items-center gap-2 transition-colors ${txType === 'expense' ? 'bg-rose-50 border-rose-200 text-rose-700' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'}`}>
                                        <ArrowDownRight size={14} className="sm:w-4 sm:h-4" /> Station Expense
                                    </button>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-1 gap-4">
                                <div>
                                    <label className="block text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5 sm:mb-2">Transaction Date</label>
                                    <input
                                        type="date"
                                        required
                                        className="input-field w-full rounded-lg sm:rounded-xl p-2.5 sm:p-3 text-sm sm:text-base font-bold bg-slate-50 border-slate-200 capitalize"
                                        value={txDate}
                                        onChange={(e) => setTxDate(e.target.value)}
                                        disabled={isSubmitting}
                                    />
                                </div>

                                <div>
                                    <label className="block text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5 sm:mb-2">Amount (₹)</label>
                                    <input
                                        type="number"
                                        min="0.01"
                                        step="0.01"
                                        required
                                        className="input-field w-full rounded-lg sm:rounded-xl p-2.5 sm:p-3 text-base sm:text-lg font-mono font-black tracking-tight"
                                        placeholder="0.00"
                                        value={txAmount}
                                        onChange={(e) => setTxAmount(e.target.value)}
                                        disabled={isSubmitting}
                                    />
                                </div>

                                <div>
                                    <label className="block text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5 sm:mb-2">Note</label>
                                    <input
                                        type="text"
                                        className="input-field w-full rounded-lg sm:rounded-xl p-2.5 sm:p-3 text-xs sm:text-sm text-slate-700"
                                        placeholder="E.g. Electricity bill"
                                        value={txDesc}
                                        onChange={(e) => setTxDesc(e.target.value)}
                                        disabled={isSubmitting}
                                    />
                                </div>
                            </div>

                            <button
                                type="submit"
                                disabled={isSubmitting}
                                className="btn w-full bg-slate-800 hover:bg-slate-900 text-white rounded-lg sm:rounded-xl py-3 sm:py-3.5 shadow-lg shadow-slate-800/20 flex items-center justify-center gap-2 font-bold disabled:opacity-50 text-sm sm:text-base mt-2"
                            >
                                <Check size={18} /> Save Record
                            </button>
                        </form>
                    </div>
                </div>

                {/* Right Col: Ledger List */}
                <div className="lg:col-span-2 card bg-white rounded-2xl sm:rounded-3xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                    <div className="p-3 sm:p-5 bg-slate-50 border-b border-slate-100 font-bold text-slate-800 flex items-center gap-2 sm:gap-3 text-sm sm:text-base">
                        <History size={18} className="text-slate-400" />
                        Statement History
                    </div>

                    {/* Mobile Card List (Hidden on sm) */}
                    <div className="sm:hidden divide-y divide-slate-100">
                        {loading ? (
                            <div className="p-12 text-center text-slate-400">Loading ledger...</div>
                        ) : transactions.length === 0 ? (
                            <div className="p-12 text-center text-slate-400">No transactions found.</div>
                        ) : (
                            transactions.map(tx => {
                                const isPos = tx.amount > 0;
                                const absAmount = Math.abs(tx.amount).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

                                // Dynamic labeling based on type
                                let displayLabel = tx.type as string;
                                let typeClass = "bg-slate-100 text-slate-600";
                                if (tx.type === 'shift_deposit') { displayLabel = "Income"; typeClass = "bg-teal-100 text-teal-700"; }
                                if (tx.type === 'expense') { displayLabel = "Expense"; typeClass = "bg-rose-100 text-rose-700"; }
                                if (tx.type === 'owner_withdrawal') { displayLabel = "Handover"; typeClass = "bg-indigo-100 text-indigo-700"; }
                                if (tx.type === 'owner_deposit') { displayLabel = "Deposit"; typeClass = "bg-emerald-100 text-emerald-700"; }
                                if (tx.type === 'employee_advance') { displayLabel = "Advance"; typeClass = "bg-amber-100 text-amber-700"; }

                                return (
                                    <div key={tx.id} className="p-4 space-y-2">
                                        <div className="flex justify-between items-start">
                                            <div className="min-w-0 flex-1 pr-2">
                                                <div className="text-xs text-slate-400 font-medium mb-0.5">
                                                    {new Date(tx.created_at).toLocaleDateString('en-GB')}
                                                </div>
                                                <div className="font-bold text-slate-800 text-sm leading-tight mb-1">{tx.description}</div>
                                                <div className="flex items-center gap-2">
                                                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider ${typeClass}`}>
                                                        {displayLabel}
                                                    </span>
                                                    <span className="text-[10px] font-bold text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100">
                                                        Bal: ₹{tx.runningBalance?.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                                                    </span>
                                                </div>
                                            </div>
                                            <div className={`text-right font-mono font-black text-sm shrink-0 ${isPos ? 'text-emerald-600' : 'text-rose-600'}`}>
                                                {isPos ? '+' : '-'}₹{absAmount}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>

                    {/* Desktop Table View (Hidden on Mobile) */}
                    <div className="hidden sm:block overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-slate-50 text-slate-500 text-[10px] uppercase tracking-widest border-b border-slate-100">
                                    <th className="p-4 font-bold">Date</th>
                                    <th className="p-4 font-bold">Details</th>
                                    <th className="p-4 font-bold text-right">Amount</th>
                                    <th className="p-4 font-bold text-right">Balance</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {loading ? (
                                    <tr><td colSpan={4} className="p-12 text-center text-slate-400 font-medium">Loading ledger...</td></tr>
                                ) : transactions.length === 0 ? (
                                    <tr><td colSpan={4} className="p-12 text-center text-slate-400 font-medium">No transactions found. The locker is empty.</td></tr>
                                ) : (
                                    transactions.map(tx => {
                                        const isPos = tx.amount > 0;
                                        const absAmount = Math.abs(tx.amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

                                        // Dynamic labeling based on type
                                        let TypeBadge = () => <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-100 text-slate-600">{tx.type}</span>;
                                        if (tx.type === 'shift_deposit') TypeBadge = () => <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-teal-100 text-teal-700">Shift Income</span>;
                                        if (tx.type === 'expense') TypeBadge = () => <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-rose-100 text-rose-700">Expense</span>;
                                        if (tx.type === 'owner_withdrawal') TypeBadge = () => <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-indigo-100 text-indigo-700">Handover</span>;
                                        if (tx.type === 'owner_deposit') TypeBadge = () => <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-emerald-100 text-emerald-700">Deposit</span>;
                                        if (tx.type === 'employee_advance') TypeBadge = () => <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-amber-100 text-amber-700">Emp Advance</span>;

                                        return (
                                            <tr key={tx.id} className="hover:bg-slate-50/50 group transition-colors">
                                                <td className="p-4">
                                                    <div className="text-sm font-bold text-slate-700">{new Date(tx.created_at).toLocaleDateString('en-GB')}</div>
                                                </td>
                                                <td className="p-4">
                                                    <div className="font-semibold text-slate-800 text-sm mb-1">{tx.description}</div>
                                                    <TypeBadge />
                                                </td>
                                                <td className={`p-4 text-right font-mono font-black ${isPos ? 'text-emerald-600' : 'text-rose-600'}`}>
                                                    {isPos ? '+' : '-'} ₹{absAmount}
                                                </td>
                                                <td className="p-4 text-right font-mono font-black text-slate-700 bg-slate-50/30">
                                                    ₹{tx.runningBalance?.toLocaleString('en-IN', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

            </div>
        </div>
    );
}
