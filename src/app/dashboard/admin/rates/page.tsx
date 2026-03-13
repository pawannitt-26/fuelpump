"use client";

import { useAppStore } from '@/store/appStore';
import { t } from '@/lib/i18n';
import { IndianRupee, Save, Loader2, ArrowRight } from 'lucide-react';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';

export default function RatesManagement() {
    const { language, user } = useAppStore();
    const router = useRouter();

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [products, setProducts] = useState<any[]>([]);

    // Local state for the editable fields
    const [newRates, setNewRates] = useState<Record<string, string>>({});

    useEffect(() => {
        // Basic protection
        if (user?.role !== 'Admin') {
            router.replace('/');
            return;
        }

        async function fetchProductsAndRates() {
            try {
                const { data: prods, error: pErr } = await supabase.from('products').select('*');
                if (pErr) throw pErr;

                const withRates = await Promise.all((prods || []).map(async (p) => {
                    const { data: rates } = await supabase
                        .from('rates')
                        .select('rate')
                        .eq('product_id', p.id)
                        .order('effective_date', { ascending: false })
                        .limit(1);

                    const currentRate = rates && rates.length > 0 ? rates[0].rate : 0;
                    return { ...p, currentRate };
                }));

                setProducts(withRates);

                // initialize input state
                const initialForm: Record<string, string> = {};
                withRates.forEach(p => {
                    initialForm[p.id] = p.currentRate.toString();
                });
                setNewRates(initialForm);

            } catch (err) {
                console.error('Error fetching rates:', err);
            } finally {
                setLoading(false);
            }
        }

        fetchProductsAndRates();
    }, [user, router]);

    const handleSave = async (productId: string) => {
        if (!user) return;
        setSaving(true);
        try {
            const rateValue = parseFloat(newRates[productId]);
            if (isNaN(rateValue) || rateValue <= 0) {
                throw new Error('Please enter a valid rate.');
            }

            // 1. Insert into rates table
            const { error: rErr } = await supabase
                .from('rates')
                .insert([{
                    product_id: productId,
                    rate: rateValue,
                    effective_date: new Date().toISOString().split('T')[0]
                }]);

            if (rErr) throw rErr;

            // 2. Audit log
            await supabase.from('audit_logs').insert([{
                user_id: user.id,
                action: 'UPDATE_RATE',
                target_table: 'rates',
                target_id: productId,
                details: { new_rate: rateValue }
            }]);

            // Update local UI
            setProducts(products.map(p => p.id === productId ? { ...p, currentRate: rateValue } : p));
            alert('Rate updated successfully today!');

        } catch (err: any) {
            console.error('Save error', err);
            if (err.code === '23505') {
                alert('A rate for this product has already been set for today. You can only set one rate per day in this prototype.');
            } else {
                alert(err.message || 'Error saving rate');
            }
        } finally {
            setSaving(false);
        }
    };

    if (loading) return (
        <div className="p-20 flex flex-col items-center justify-center space-y-4">
            <Loader2 className="animate-spin text-blue-500" size={40} />
            <p className="text-slate-500 font-medium">Loading active products and rates...</p>
        </div>
    );

    return (
        <div className="max-w-5xl mx-auto space-y-8 pb-20">
            <div className="flex items-center justify-between border-b pb-6 border-slate-200">
                <div>
                    <h1 className="text-3xl font-extrabold text-slate-800 m-0 flex items-center gap-3 tracking-tight">
                        <IndianRupee className="text-blue-600 bg-blue-50 p-1.5 rounded-lg" size={36} />
                        {t('updateRates', language)}
                    </h1>
                    <p className="text-slate-500 mt-2 font-medium">Manage and set active daily prices for fuel products.</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {products.map(product => {
                    const hasChanged = parseFloat(newRates[product.id]) !== parseFloat(product.currentRate) && !isNaN(parseFloat(newRates[product.id]));

                    return (
                        <div key={product.id} className="card relative overflow-hidden bg-white shadow-xl shadow-slate-200/50 border border-slate-100 hover:shadow-2xl hover:-translate-y-1 transition-all duration-300">
                            {/* Decorative Top Accent */}
                            <div className={`absolute top-0 left-0 right-0 h-1.5 ${product.name === 'HSD' ? 'bg-amber-400' : 'bg-green-500'}`} />

                            <div className="p-8">
                                <div className="flex justify-between items-start mb-8">
                                    <div>
                                        <div className={`inline-block px-3 py-1 rounded-full text-xs font-bold mb-2 uppercase tracking-widest ${product.name === 'HSD' ? 'bg-amber-100 text-amber-800' : 'bg-green-100 text-green-800'}`}>
                                            Active Product
                                        </div>
                                        <h2 className="text-3xl font-extrabold text-slate-800">{product.name}</h2>
                                    </div>
                                    <div className="text-right bg-slate-50 px-4 py-2 rounded-xl border border-slate-100">
                                        <span className="text-xs text-slate-400 uppercase font-bold block mb-1">Current Base</span>
                                        <span className="text-2xl font-bold text-slate-700">₹{parseFloat(product.currentRate).toFixed(2)}</span>
                                    </div>
                                </div>

                                <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100 relative">
                                    <label className="text-sm text-blue-600 uppercase font-bold mb-3 flex items-center gap-2">
                                        Set New Configuration <ArrowRight size={14} />
                                    </label>

                                    <div className="relative flex items-center">
                                        <span className="absolute left-4 text-slate-400 font-medium text-lg">₹</span>
                                        <input
                                            type="number"
                                            step="0.01"
                                            className="w-full bg-white border-2 border-slate-200 rounded-xl pl-10 pr-4 py-4 text-2xl font-bold text-slate-800 focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all placeholder:text-slate-300"
                                            placeholder="0.00"
                                            value={newRates[product.id] || ''}
                                            onChange={(e) => setNewRates({ ...newRates, [product.id]: e.target.value })}
                                        />
                                    </div>
                                </div>

                                <div className="mt-8 flex justify-center items-end">
                                    <button
                                        onClick={() => handleSave(product.id)}
                                        disabled={saving || !hasChanged}
                                        className={`btn py-3 px-8 text-base font-bold shadow-lg flex items-center  gap-2 transition-all ${hasChanged
                                            ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-blue-500/30 hover:shadow-blue-500/50 hover:-translate-y-0.5'
                                            : 'bg-slate-100 text-slate-400 shadow-none hover:translate-y-0'
                                            } disabled:opacity-60 disabled:cursor-not-allowed`}
                                    >
                                        {saving ? <Loader2 size={20} className="animate-spin" /> : <Save size={20} />}
                                        {saving ? 'Saving...' : 'Apply Rate'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
