"use client";

import { useState, useEffect } from 'react';
import { useAppStore } from '@/store/appStore';
import { supabase } from '@/lib/supabase';
import { Users, Plus, UserPlus, Power, AlertCircle, TrendingUp, History, Download, X, IndianRupee } from 'lucide-react';

interface Employee {
    id: string;
    name: string;
    is_active: boolean;
    created_at: string;
    balance: number; // calculated from transactions
}

interface EmpTransaction {
    id: string;
    type: 'loss' | 'advance' | 'salary' | 'settlement';
    amount: number;
    description: string;
    created_at: string;
}

export default function EmployeesPage() {
    const { language, user } = useAppStore();
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [loading, setLoading] = useState(true);
    const [newName, setNewName] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Ledger Modal State
    const [selectedEmp, setSelectedEmp] = useState<Employee | null>(null);
    const [transactions, setTransactions] = useState<EmpTransaction[]>([]);
    const [loadingLedger, setLoadingLedger] = useState(false);

    // New Transaction State (Advance/Settlement)
    const [txType, setTxType] = useState<'advance' | 'settlement'>('advance');
    const [txAmount, setTxAmount] = useState('');
    const [txDesc, setTxDesc] = useState('');

    useEffect(() => {
        fetchEmployees();
    }, []);

    const fetchEmployees = async () => {
        setLoading(true);
        // Fetch all employees
        const { data: emps, error: empErr } = await supabase
            .from('employees')
            .select('*')
            .order('name');

        if (empErr || !emps) {
            console.error('Error fetching employees:', empErr);
            setLoading(false);
            return;
        }

        // Fetch balances (sum of transactions)
        const { data: txs, error: txErr } = await supabase
            .from('employee_transactions')
            .select('employee_id, amount');

        const balances: Record<string, number> = {};
        if (!txErr && txs) {
            txs.forEach((tx) => {
                balances[tx.employee_id] = (balances[tx.employee_id] || 0) + Number(tx.amount);
            });
        }

        const merged = emps.map(emp => ({
            ...emp,
            balance: balances[emp.id] || 0
        }));

        setEmployees(merged);
        setLoading(false);
    };

    const handleAddEmployee = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newName.trim()) return;
        setIsSubmitting(true);

        const { error } = await supabase
            .from('employees')
            .insert([{ name: newName.trim() }]);

        if (!error) {
            setNewName('');
            fetchEmployees();
        } else {
            alert('Failed to add employee: ' + error.message);
        }
        setIsSubmitting(false);
    };

    const toggleActive = async (emp: Employee) => {
        const { error } = await supabase
            .from('employees')
            .update({ is_active: !emp.is_active })
            .eq('id', emp.id);

        if (!error) {
            setEmployees(employees.map(e => e.id === emp.id ? { ...e, is_active: !e.is_active } : e));
        }
    };

    const openLedger = async (emp: Employee) => {
        setSelectedEmp(emp);
        setLoadingLedger(true);

        const { data, error } = await supabase
            .from('employee_transactions')
            .select('*')
            .eq('employee_id', emp.id)
            .order('created_at', { ascending: false });

        if (!error && data) {
            setTransactions(data);
        }
        setLoadingLedger(false);
    };

    const handleAddTransaction = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedEmp || !txAmount || isNaN(Number(txAmount))) return;
        setIsSubmitting(true);

        // Advance: paying employee (station loses cash, employee ledger drops/goes negative)
        // Settlement: employee paying station back (station gains cash, employee ledger rises toward 0)
        let amount = Math.abs(Number(txAmount));
        if (txType === 'advance') amount = -amount; // Neg means we gave them money

        const desc = txDesc.trim() || (txType === 'advance' ? 'Cash Advance' : 'Settlement Paid');

        const { error: txError } = await supabase
            .from('employee_transactions')
            .insert([{
                employee_id: selectedEmp.id,
                type: txType,
                amount: amount,
                description: desc
            }]);

        if (!txError) {
            // Also update the Virtual Locker for Advance/Settlement
            await supabase.from('locker_transactions').insert([{
                type: txType === 'advance' ? 'employee_advance' : 'shift_deposit',
                amount: txType === 'advance' ? amount : Math.abs(amount),
                description: `${txType === 'advance' ? 'Advance to' : 'Settlement from'} ${selectedEmp.name}`
            }]);

            setTxAmount('');
            setTxDesc('');
            openLedger(selectedEmp); // refresh modal
            fetchEmployees(); // refresh background balances
        }
        setIsSubmitting(false);
    };

    if (user?.role !== 'Admin') {
        return <div className="p-8 text-center text-red-500 font-bold">Access Denied</div>;
    }

    return (
        <div className="max-w-7xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-white p-4 sm:p-6 rounded-xl sm:rounded-2xl shadow-sm border border-slate-200">
                <h1 className="text-xl sm:text-2xl font-black text-slate-800 m-0 flex items-center gap-2 sm:gap-3">
                    <span className="bg-indigo-600 text-white p-1.5 sm:p-2 rounded-lg sm:rounded-xl shadow-md"><Users size={20} /></span>
                    Employee Management
                </h1>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                {/* Left Col: Add New Employee */}
                <div className="lg:col-span-1 space-y-4 sm:space-y-6">
                    <div className="card bg-white p-4 sm:p-6 rounded-2xl sm:rounded-3xl border border-slate-200 shadow-sm">
                        <h2 className="text-base sm:text-lg font-bold text-slate-800 mb-3 sm:mb-4 flex items-center gap-2">
                            <UserPlus size={18} className="text-indigo-500" />
                            Add New Employee
                        </h2>
                        <form onSubmit={handleAddEmployee} className="space-y-3 sm:space-y-4">
                            <div>
                                <label className="block text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 or-2">Full Name</label>
                                <input
                                    type="text"
                                    required
                                    className="input-field w-full rounded-lg sm:rounded-xl bg-slate-50 border-slate-200 focus:bg-white text-sm sm:text-base py-2 sm:py-2.5 px-3 sm:px-4"
                                    placeholder="e.g. Rahul Kumar"
                                    value={newName}
                                    onChange={(e) => setNewName(e.target.value)}
                                    disabled={isSubmitting}
                                />
                            </div>
                            <button
                                type="submit"
                                disabled={isSubmitting}
                                className="btn w-full bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg sm:rounded-xl py-2.5 sm:py-3 shadow-lg shadow-indigo-600/20 flex items-center justify-center gap-2 font-bold disabled:opacity-50 text-sm sm:text-base"
                            >
                                <Plus size={18} /> Add Employee
                            </button>
                        </form>
                    </div>

                    <div className="bg-blue-50 border border-blue-100 p-4 sm:p-5 rounded-2xl sm:rounded-3xl flex gap-2 sm:gap-3 text-blue-800 text-xs sm:text-sm">
                        <AlertCircle size={18} className="shrink-0 text-blue-500" />
                        <p>
                            <strong>Ledger Balances:</strong><br />
                            A <span className="text-red-600 font-bold">Positive</span> balance means they owe (Shortages/Loss).<br />
                            A <span className="text-green-700 font-bold">Negative</span> balance means paid (Advances).
                        </p>
                    </div>
                </div>

                {/* Right Col: Employee List */}
                <div className="lg:col-span-2 card bg-white rounded-2xl sm:rounded-3xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                    <div className="p-3 sm:p-4 bg-slate-50 border-b border-slate-100 font-bold text-slate-700 flex items-center justify-between text-sm sm:text-base">
                        <span>Active Staff Roster ({employees.filter(e => e.is_active).length})</span>
                    </div>

                    {/* Mobile Card List (Hidden on sm) */}
                    <div className="sm:hidden divide-y divide-slate-100">
                        {loading ? (
                            <div className="p-8 text-center text-slate-400">Loading...</div>
                        ) : employees.length === 0 ? (
                            <div className="p-8 text-center text-slate-400">No employees found.</div>
                        ) : (
                            employees.map(emp => (
                                <div key={emp.id} className="p-4 space-y-3">
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <div className="font-bold text-slate-800 text-base">{emp.name}</div>
                                            <div className="mt-1">
                                                <button
                                                    onClick={() => toggleActive(emp)}
                                                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold transition-colors ${emp.is_active ? 'bg-green-100 text-green-700' : 'bg-slate-200 text-slate-500'}`}
                                                >
                                                    <Power size={10} />
                                                    {emp.is_active ? 'Active' : 'Inactive'}
                                                </button>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wider mb-1">Balance</div>
                                            <span className={`font-mono font-bold px-2 py-0.5 rounded text-sm ${emp.balance > 0 ? 'bg-red-50 text-red-600' : emp.balance < 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                                                ₹ {emp.balance.toFixed(0)}
                                            </span>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => openLedger(emp)}
                                        className="w-full py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold text-indigo-600 flex items-center justify-center gap-2 active:bg-indigo-50"
                                    >
                                        <History size={16} /> View Ledger
                                    </button>
                                </div>
                            ))
                        )}
                    </div>

                    {/* Desktop Table View (Hidden on Mobile) */}
                    <div className="hidden sm:block overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-slate-50/50 text-slate-500 text-xs uppercase tracking-wider">
                                    <th className="p-4 font-semibold">Name</th>
                                    <th className="p-4 font-semibold text-right">Ledger Balance</th>
                                    <th className="p-4 font-semibold text-center">Status</th>
                                    <th className="p-4 font-semibold text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {loading ? (
                                    <tr><td colSpan={4} className="p-8 text-center text-slate-400">Loading...</td></tr>
                                ) : employees.length === 0 ? (
                                    <tr><td colSpan={4} className="p-8 text-center text-slate-400">No employees found. Add one to start.</td></tr>
                                ) : (
                                    employees.map(emp => (
                                        <tr key={emp.id} className="hover:bg-slate-50 transition-colors group">
                                            <td className="p-4 font-bold text-slate-800">{emp.name}</td>
                                            <td className="p-4 text-right">
                                                <span className={`font-mono font-bold px-3 py-1 rounded-full ${emp.balance > 0 ? 'bg-red-50 text-red-600' :
                                                    emp.balance < 0 ? 'bg-emerald-50 text-emerald-700' :
                                                        'bg-slate-100 text-slate-600'
                                                    }`}>
                                                    ₹ {emp.balance.toFixed(2)}
                                                </span>
                                            </td>
                                            <td className="p-4 text-center">
                                                <button
                                                    onClick={() => toggleActive(emp)}
                                                    className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold transition-colors ${emp.is_active ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-slate-200 text-slate-500 hover:bg-slate-300'
                                                        }`}
                                                >
                                                    <Power size={12} />
                                                    {emp.is_active ? 'Active' : 'Inactive'}
                                                </button>
                                            </td>
                                            <td className="p-4 text-right">
                                                <button
                                                    onClick={() => openLedger(emp)}
                                                    className="btn border border-slate-200 hover:border-indigo-300 text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 px-4 py-1.5 rounded-lg text-sm font-semibold transition-all shadow-sm"
                                                >
                                                    Ledger
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

            </div>

            {/* Ledger Modal */}
            {selectedEmp && (
                <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 backdrop-blur-sm">
                    <div className="bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden animate-in slide-in-from-bottom sm:zoom-in-95 duration-300">

                        {/* Modal Header */}
                        <div className="p-4 sm:p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/80">
                            <div>
                                <h3 className="text-lg sm:text-xl font-black text-slate-800 flex items-center gap-2 sm:gap-3">
                                    <History className="text-indigo-500" size={18} />
                                    <span className="truncate">{selectedEmp.name}'s Ledger</span>
                                </h3>
                                <p className="text-slate-500 text-xs sm:text-sm mt-0.5 sm:mt-1">
                                    Balance: <span className={`font-mono font-bold ${selectedEmp.balance > 0 ? 'text-red-500' : selectedEmp.balance < 0 ? 'text-emerald-600' : 'text-slate-600'}`}>₹ {selectedEmp.balance.toFixed(2)}</span>
                                </p>
                            </div>
                            <button onClick={() => setSelectedEmp(null)} className="p-2 bg-white rounded-full text-slate-400 hover:bg-slate-200 transition-colors shadow-sm">
                                <X size={20} />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-50/50">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">


                                {/* Add Transaction Form */}
                                <div className="md:col-span-1 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm self-start sticky top-0">
                                    <h4 className="font-bold text-slate-700 mb-4 flex items-center gap-2 text-sm border-b pb-3">
                                        <IndianRupee size={16} className="text-indigo-500" />
                                        Record Payment
                                    </h4>
                                    <form onSubmit={handleAddTransaction} className="space-y-4">
                                        <div>
                                            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Type</label>
                                            <div className="grid grid-cols-2 gap-2">
                                                <button type="button" onClick={() => setTxType('advance')} className={`py-2 text-xs font-bold rounded-xl border transition-colors ${txType === 'advance' ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-white border-slate-200 text-slate-500'}`}>
                                                    Give Advance
                                                </button>
                                                <button type="button" onClick={() => setTxType('settlement')} className={`py-2 text-xs font-bold rounded-xl border transition-colors ${txType === 'settlement' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-white border-slate-200 text-slate-500'}`}>
                                                    Receive Settle
                                                </button>
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Amount (₹)</label>
                                            <input type="number" min="0" step="0.01" required className="input-field w-full rounded-xl p-2.5 text-sm font-mono font-bold" value={txAmount} onChange={(e) => setTxAmount(e.target.value)} disabled={isSubmitting} />
                                        </div>
                                        <div>
                                            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Description</label>
                                            <input type="text" className="input-field w-full rounded-xl p-2.5 text-sm" placeholder="e.g. Weekly Payment" value={txDesc} onChange={(e) => setTxDesc(e.target.value)} disabled={isSubmitting} />
                                        </div>
                                        <button type="submit" disabled={isSubmitting} className="btn w-full bg-slate-800 hover:bg-slate-900 text-white rounded-xl py-2.5 font-bold disabled:opacity-50 text-sm shadow-md">
                                            Save Record
                                        </button>
                                    </form>
                                    <p className="text-[10px] text-slate-400 mt-4 leading-tight text-center">
                                        Advances lower the locker balance. Settlements increase it. Both affect the employee's ledger.
                                    </p>
                                </div>

                                {/* Transaction History */}
                                <div className="md:col-span-2">
                                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                                        <table className="w-full text-left text-sm">
                                            <thead className="bg-slate-50 border-b border-slate-100">
                                                <tr>
                                                    <th className="p-3 font-semibold text-slate-500">Date/Time</th>
                                                    <th className="p-3 font-semibold text-slate-500">Description</th>
                                                    <th className="p-3 font-semibold text-slate-500 text-right">Amount</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                                {loadingLedger ? (
                                                    <tr><td colSpan={3} className="p-8 text-center text-slate-400">Loading ledger...</td></tr>
                                                ) : transactions.length === 0 ? (
                                                    <tr><td colSpan={3} className="p-8 text-center text-slate-400">No transaction history found for this employee.</td></tr>
                                                ) : (
                                                    transactions.map(tx => (
                                                        <tr key={tx.id} className="hover:bg-slate-50/50">
                                                            <td className="p-3 text-slate-500 font-mono text-xs">{new Date(tx.created_at).toLocaleString()}</td>
                                                            <td className="p-3">
                                                                <span className="font-medium text-slate-700">{tx.description}</span>
                                                                {tx.type === 'loss' && <span className="ml-2 inline-block px-1.5 py-0.5 bg-red-100 text-red-600 rounded text-[10px] font-bold tracking-wider uppercase">Loss</span>}
                                                                {tx.type === 'advance' && <span className="ml-2 inline-block px-1.5 py-0.5 bg-indigo-100 text-indigo-600 rounded text-[10px] font-bold tracking-wider uppercase">Advance</span>}
                                                                {tx.type === 'settlement' && <span className="ml-2 inline-block px-1.5 py-0.5 bg-emerald-100 text-emerald-600 rounded text-[10px] font-bold tracking-wider uppercase">Settlement</span>}
                                                            </td>
                                                            <td className="p-3 text-right font-mono font-bold">
                                                                <span className={tx.amount > 0 ? 'text-red-500' : 'text-emerald-600'}>
                                                                    {tx.amount > 0 ? '+' : ''}{tx.amount.toFixed(2)}
                                                                </span>
                                                            </td>
                                                        </tr>
                                                    ))
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}