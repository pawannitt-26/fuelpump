import React, { useState, useEffect } from 'react';
import { Calendar, User, Hash, Truck, IndianRupee, Droplet, Gauge, Database, CheckCircle2, Save, ArrowLeft } from 'lucide-react';
import { dipToLiters } from '@/lib/fuelUtils';

interface DecantationFormProps {
  initialData?: any;
  onSubmit: (data: any) => void;
  isReadOnly?: boolean;
  onBack?: () => void;
}

export default function DecantationForm({ initialData, onSubmit, isReadOnly = false, onBack }: DecantationFormProps) {
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    service_provider: '',
    challan_no: '',
    vehicle_no: '',
    invoice_amount_ms: 0,
    invoice_amount_hsd: 0,
    receipt_ms: 0,
    receipt_hsd1: 0,
    receipt_hsd2: 0,
    density_data: {
      hsd: { challan: '', pump: '', pump_15c: '', diff: '' },
      ms: { challan: '', pump: '', pump_15c: '', diff: '' }
    },
    nozzle_data: {
      diesel_nozzle_1: { front: '', back: '' },
      petrol_nozzle_3: { front: '', back: '' },
      diesel_nozzle_2: { front: '', back: '' },
      petrol_nozzle_4: { front: '', back: '' }
    },
    tt_dip_data: [
      { tank_no: 1, pl_cm: '', dip_cm: '', qty_kl: '', dip_rod: '', diff: '' },
      { tank_no: 2, pl_cm: '', dip_cm: '', qty_kl: '', dip_rod: '', diff: '' },
      { tank_no: 3, pl_cm: '', dip_cm: '', qty_kl: '', dip_rod: '', diff: '' },
      { tank_no: 4, pl_cm: '', dip_cm: '', qty_kl: '', dip_rod: '', diff: '' }
    ],
    tank_dip_data: {
      hsd1: {
        dip_rod: { dip_cm_before: '', net_vol_before: '', dip_cm_after: '', net_vol_after: '', diff: '' },
        auto: { dip_cm_before: '', net_vol_before: '', dip_cm_after: '', net_vol_after: '', diff: '' }
      },
      hsd2: {
        dip_rod: { dip_cm_before: '', net_vol_before: '', dip_cm_after: '', net_vol_after: '', diff: '' },
        auto: { dip_cm_before: '', net_vol_before: '', dip_cm_after: '', net_vol_after: '', diff: '' }
      },
      ms3: {
        dip_rod: { dip_cm_before: '', net_vol_before: '', dip_cm_after: '', net_vol_after: '', diff: '' },
        auto: { dip_cm_before: '', net_vol_before: '', dip_cm_after: '', net_vol_after: '', diff: '' }
      }
    }
  });

  useEffect(() => {
    if (initialData) {
      // Merge initialData with defaults to prevent undefined fields
      const mergedData = { ...formData, ...initialData };
      
      // Ensure nested objects are merged correctly if they exist in initialData
      if (initialData.density_data) mergedData.density_data = { ...formData.density_data, ...initialData.density_data };
      if (initialData.nozzle_data) mergedData.nozzle_data = { ...formData.nozzle_data, ...initialData.nozzle_data };
      if (initialData.tank_dip_data) mergedData.tank_dip_data = { ...formData.tank_dip_data, ...initialData.tank_dip_data };
      
      mergedData.date = initialData.date || new Date().toISOString().split('T')[0];
      setFormData(mergedData);
    }
  }, [initialData]);

  // Automatic Difference Calculation: [challan - density @ 15]
  useEffect(() => {
    const calculateDiff = (challan: string | number, pump15: string | number) => {
      const c = parseFloat(String(challan)) || 0;
      const p = parseFloat(String(pump15)) || 0;
      if (!challan && !pump15) return '';
      return (c - p).toFixed(2);
    };

    const hsdDiff = calculateDiff(formData.density_data.hsd.challan, formData.density_data.hsd.pump_15c);
    const msDiff = calculateDiff(formData.density_data.ms.challan, formData.density_data.ms.pump_15c);

    if (hsdDiff !== formData.density_data.hsd.diff || msDiff !== formData.density_data.ms.diff) {
      setFormData(prev => ({
        ...prev,
        density_data: {
          hsd: { ...prev.density_data.hsd, diff: hsdDiff },
          ms: { ...prev.density_data.ms, diff: msDiff }
        }
      }));
    }
  }, [formData.density_data.hsd.challan, formData.density_data.hsd.pump_15c, formData.density_data.ms.challan, formData.density_data.ms.pump_15c]);

  // Automatic Tank DIP Volume & Difference Calculation
  useEffect(() => {
    let changed = false;
    const newTankDipData = JSON.parse(JSON.stringify(formData.tank_dip_data));

    ['hsd1', 'hsd2', 'ms3'].forEach(tank => {
      ['dip_rod', 'auto'].forEach(type => {
        const values = newTankDipData[tank][type];
        
        // 1. Calculate Volumes from DIPs
        const beforeVol = dipToLiters(parseFloat(values.dip_cm_before));
        const afterVol = dipToLiters(parseFloat(values.dip_cm_after));
        
        // 2. Get Receipt based on tank
        let receipt = 0;
        if (tank === 'hsd1') receipt = parseFloat(String(formData.receipt_hsd1)) || 0;
        if (tank === 'hsd2') receipt = parseFloat(String(formData.receipt_hsd2)) || 0;
        if (tank === 'ms3') receipt = parseFloat(String(formData.receipt_ms)) || 0;

        // 3. Calculate Difference: [NET_VOL_AFTER - NET_VOL_BEFORE - RECEIPT]
        const shortageGainNum = afterVol - beforeVol - receipt;
        const shortageGainStr = shortageGainNum.toFixed(2);
        
        // Only show shortage/gain if both readings are present
        const hasDips = values.dip_cm_before && values.dip_cm_after;

        if (values.net_vol_before !== String(beforeVol) || 
            values.net_vol_after !== String(afterVol) || 
            values.diff !== (hasDips ? shortageGainStr : '')) {
          
          values.net_vol_before = beforeVol ? String(beforeVol) : '';
          values.net_vol_after = afterVol ? String(afterVol) : '';
          values.diff = hasDips ? shortageGainStr : '';
          changed = true;
        }
      });
    });

    if (changed) {
      setFormData(prev => ({ ...prev, tank_dip_data: newTankDipData }));
    }
  }, [
    formData.tank_dip_data.hsd1.dip_rod.dip_cm_before, formData.tank_dip_data.hsd1.dip_rod.dip_cm_after,
    formData.tank_dip_data.hsd1.auto.dip_cm_before, formData.tank_dip_data.hsd1.auto.dip_cm_after,
    formData.tank_dip_data.hsd2.dip_rod.dip_cm_before, formData.tank_dip_data.hsd2.dip_rod.dip_cm_after,
    formData.tank_dip_data.hsd2.auto.dip_cm_before, formData.tank_dip_data.hsd2.auto.dip_cm_after,
    formData.tank_dip_data.ms3.dip_rod.dip_cm_before, formData.tank_dip_data.ms3.dip_rod.dip_cm_after,
    formData.tank_dip_data.ms3.auto.dip_cm_before, formData.tank_dip_data.ms3.auto.dip_cm_after,
    formData.receipt_ms, formData.receipt_hsd1, formData.receipt_hsd2
  ]);

  // Automatic TT DIP Difference Calculation: [DIP Rod - DIP-CM]
  useEffect(() => {
    let changed = false;
    const newData = JSON.parse(JSON.stringify(formData.tt_dip_data));

    newData.forEach((row: any, idx: number) => {
      const rod = parseFloat(row.dip_rod) || 0;
      const dip = parseFloat(row.dip_cm) || 0;
      const diff = (rod - dip).toFixed(2);
      
      const targetDiff = (row.dip_rod && row.dip_cm) ? diff : '';

      if (row.diff !== targetDiff) {
        newData[idx].diff = targetDiff;
        changed = true;
      }
    });

    if (changed) {
      setFormData(prev => ({ ...prev, tt_dip_data: newData }));
    }
  }, [
    formData.tt_dip_data[0]?.dip_rod, formData.tt_dip_data[0]?.dip_cm,
    formData.tt_dip_data[1]?.dip_rod, formData.tt_dip_data[1]?.dip_cm,
    formData.tt_dip_data[2]?.dip_rod, formData.tt_dip_data[2]?.dip_cm,
    formData.tt_dip_data[3]?.dip_rod, formData.tt_dip_data[3]?.dip_cm
  ]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    if (e.target.value === '0') {
      const { name } = e.target;
      if (['invoice_amount_ms', 'invoice_amount_hsd', 'receipt_ms', 'receipt_hsd1', 'receipt_hsd2'].includes(name)) {
        setFormData(prev => ({ ...prev, [name]: '' }));
      }
    }
  };

  const handleDensityChange = (product: 'hsd' | 'ms', field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      density_data: {
        ...prev.density_data,
        [product]: { ...prev.density_data[product], [field]: value }
      }
    }));
  };

  const handleNozzleChange = (nozzle: string, field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      nozzle_data: {
        ...prev.nozzle_data,
        [nozzle]: { ...prev.nozzle_data[nozzle as keyof typeof prev.nozzle_data], [field]: value }
      }
    }));
  };

  const handleTTDipChange = (index: number, field: string, value: string) => {
    const newData = [...formData.tt_dip_data];
    newData[index] = { ...newData[index], [field]: value };
    setFormData(prev => ({ ...prev, tt_dip_data: newData }));
  };

  const handleTankDipChange = (tank: string, type: string, field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      tank_dip_data: {
        ...prev.tank_dip_data,
        [tank]: {
          ...prev.tank_dip_data[tank as keyof typeof prev.tank_dip_data],
          [type]: {
            ...prev.tank_dip_data[tank as keyof typeof prev.tank_dip_data][type as 'dip_rod' | 'auto'],
            [field]: value
          }
        }
      }
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isReadOnly) return;
    onSubmit(formData);
  };

  const sectionClass = "bg-white p-6 rounded-2xl shadow-sm border border-slate-100 mb-6";
  const labelClass = "text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1 block";
  const inputClass = "w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-slate-800 bg-slate-50/50";
  const tableHeaderClass = "text-xs font-bold text-slate-400 uppercase p-2 border-b border-slate-100 text-center";
  const tableCellClass = "p-2 border-b border-slate-50";

  return (
    <form onSubmit={handleSubmit} className="max-w-5xl mx-auto pb-10">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div className="flex items-center gap-4">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-600 active:bg-slate-200"
            >
              <ArrowLeft size={24} />
            </button>
          )}
          <div>
            <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Decantation Form</h1>
            <p className="text-slate-500 text-sm">Fill in the fuel unloading details</p>
          </div>
        </div>
        {!isReadOnly && (
          <button
            type="submit"
            className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20 transition-all active:scale-[0.98]"
          >
            <Save size={20} />
            Save Form
          </button>
        )}
      </div>

      {/* Section 1: Basic Info */}
      <div className={sectionClass}>
        <div className="flex items-center gap-2 mb-4">
          <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
            <Database size={18} />
          </div>
          <h2 className="font-bold text-slate-800">Basic Information</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className={labelClass}>Date</label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input
                type="date"
                name="date"
                value={formData.date}
                onChange={handleChange}
                disabled={isReadOnly}
                className={`${inputClass} pl-10`}
              />
            </div>
          </div>
          <div>
            <label className={labelClass}>Service Provider</label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input
                type="text"
                name="service_provider"
                value={formData.service_provider}
                onChange={handleChange}
                disabled={isReadOnly}
                placeholder="e.g. Subhash Kumar"
                className={`${inputClass} pl-10`}
              />
            </div>
          </div>
          <div>
            <label className={labelClass}>Challan No.</label>
            <div className="relative">
              <Hash className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input
                type="text"
                name="challan_no"
                value={formData.challan_no}
                onChange={handleChange}
                disabled={isReadOnly}
                placeholder="7005306510"
                className={`${inputClass} pl-10`}
              />
            </div>
          </div>
          <div>
            <label className={labelClass}>Vehicle No.</label>
            <div className="relative">
              <Truck className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input
                type="text"
                name="vehicle_no"
                value={formData.vehicle_no}
                onChange={handleChange}
                disabled={isReadOnly}
                placeholder="BR09GB 7687"
                className={`${inputClass} pl-10`}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Section 2: Invoice & Receipts */}
      <div className={sectionClass}>
        <div className="flex items-center gap-2 mb-4">
          <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
            <IndianRupee size={18} />
          </div>
          <h2 className="font-bold text-slate-800">Invoice & Receipts</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="bg-slate-50/50 p-4 rounded-2xl border border-slate-100">
            <label className={labelClass}>Invoice Amt (MS)</label>
            <div className="relative">
              <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input
                type="number"
                name="invoice_amount_ms"
                value={formData.invoice_amount_ms || ''}
                onChange={handleChange}
                onFocus={handleFocus}
                disabled={isReadOnly}
                className={`${inputClass} pl-10`}
                placeholder="0.00"
              />
            </div>
            {formData.invoice_amount_ms > 0 && (
              <div className="text-[11px] font-bold text-blue-600 mt-1.5 px-1 bg-blue-50/50 w-fit rounded-md py-0.5">
                ₹ {Number(formData.invoice_amount_ms).toLocaleString('en-IN')}
              </div>
            )}
          </div>
          <div className="bg-slate-50/50 p-4 rounded-2xl border border-slate-100">
            <label className={labelClass}>Invoice Amt (HSD)</label>
            <div className="relative">
              <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input
                type="number"
                name="invoice_amount_hsd"
                value={formData.invoice_amount_hsd || ''}
                onChange={handleChange}
                onFocus={handleFocus}
                disabled={isReadOnly}
                className={`${inputClass} pl-10`}
                placeholder="0.00"
              />
            </div>
            {formData.invoice_amount_hsd > 0 && (
              <div className="text-[11px] font-bold text-blue-600 mt-1.5 px-1 bg-blue-50/50 w-fit rounded-md py-0.5">
                ₹ {Number(formData.invoice_amount_hsd).toLocaleString('en-IN')}
              </div>
            )}
          </div>
          <div className="md:col-span-2 lg:col-span-3 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-slate-50/50 p-4 rounded-2xl border border-slate-100">
              <label className={labelClass}>Receipt MS</label>
              <input
                type="number"
                name="receipt_ms"
                value={formData.receipt_ms}
                onChange={handleChange}
                onFocus={handleFocus}
                disabled={isReadOnly}
                className={inputClass}
              />
            </div>
            <div className="bg-slate-50/50 p-4 rounded-2xl border border-slate-100">
              <label className={labelClass}>Receipt HSD-1</label>
              <input
                type="number"
                name="receipt_hsd1"
                value={formData.receipt_hsd1}
                onChange={handleChange}
                onFocus={handleFocus}
                disabled={isReadOnly}
                className={inputClass}
              />
            </div>
            <div className="bg-slate-50/50 p-4 rounded-2xl border border-slate-100">
              <label className={labelClass}>Receipt HSD-2</label>
              <input
                type="number"
                name="receipt_hsd2"
                value={formData.receipt_hsd2}
                onChange={handleChange}
                onFocus={handleFocus}
                disabled={isReadOnly}
                className={inputClass}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Section 3: Density Table */}
      <div className={sectionClass}>
        <div className="flex items-center gap-2 mb-4">
          <div className="p-2 bg-amber-50 text-amber-600 rounded-lg">
            <Droplet size={18} />
          </div>
          <h2 className="font-bold text-slate-800">Density Details</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm ">
            <thead>
              <tr>
                <th className={tableHeaderClass}>Metric</th>
                <th className={tableHeaderClass}>HSD</th>
                <th className={tableHeaderClass}>MS</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className={tableCellClass + " font-medium text-slate-600"}>Challan Density</td>
                <td className={tableCellClass}>
                  <input
                    type="text"
                    value={formData.density_data.hsd.challan}
                    onChange={(e) => handleDensityChange('hsd', 'challan', e.target.value)}
                    disabled={isReadOnly}
                    className="w-full text-center px-2 py-1.5 rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-sm"
                  />
                </td>
                <td className={tableCellClass}>
                  <input
                    type="text"
                    value={formData.density_data.ms.challan}
                    onChange={(e) => handleDensityChange('ms', 'challan', e.target.value)}
                    disabled={isReadOnly}
                    className="w-full text-center px-2 py-1.5 rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-sm"
                  />
                </td>
              </tr>
              <tr>
                <td className={tableCellClass + " font-medium text-slate-600"}>Density @ Pump</td>
                <td className={tableCellClass}>
                  <input
                    type="text"
                    value={formData.density_data.hsd.pump}
                    onChange={(e) => handleDensityChange('hsd', 'pump', e.target.value)}
                    disabled={isReadOnly}
                    className="w-full text-center px-2 py-1.5 rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-sm"
                  />
                </td>
                <td className={tableCellClass}>
                  <input
                    type="text"
                    value={formData.density_data.ms.pump}
                    onChange={(e) => handleDensityChange('ms', 'pump', e.target.value)}
                    disabled={isReadOnly}
                    className="w-full text-center px-2 py-1.5 rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-sm"
                  />
                </td>
              </tr>
              <tr>
                <td className={tableCellClass + " font-medium text-slate-600"}>Density @ 15°C</td>
                <td className={tableCellClass}>
                  <input
                    type="text"
                    value={formData.density_data.hsd.pump_15c}
                    onChange={(e) => handleDensityChange('hsd', 'pump_15c', e.target.value)}
                    disabled={isReadOnly}
                    className="w-full text-center px-2 py-1.5 rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-sm"
                  />
                </td>
                <td className={tableCellClass}>
                  <input
                    type="text"
                    value={formData.density_data.ms.pump_15c}
                    onChange={(e) => handleDensityChange('ms', 'pump_15c', e.target.value)}
                    disabled={isReadOnly}
                    className="w-full text-center px-2 py-1.5 rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-sm"
                  />
                </td>
              </tr>
              <tr>
                <td className={tableCellClass + " font-medium text-slate-600"}>Difference</td>
                <td className={tableCellClass}>
                  <input
                    type="text"
                    value={formData.density_data.hsd.diff}
                    disabled={true}
                    placeholder="Calculated"
                    className="w-full text-center px-2 py-1.5 rounded-lg border border-slate-100 bg-slate-50 text-slate-500 font-bold text-sm"
                  />
                </td>
                <td className={tableCellClass}>
                  <input
                    type="text"
                    value={formData.density_data.ms.diff}
                    disabled={true}
                    placeholder="Calculated"
                    className="w-full text-center px-2 py-1.5 rounded-lg border border-slate-100 bg-slate-50 text-slate-500 font-bold text-sm"
                  />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Section 4: Nozzle Reading Table */}
      <div className={sectionClass}>
        <div className="flex items-center gap-2 mb-4">
          <div className="p-2 bg-purple-50 text-purple-600 rounded-lg">
            <Gauge size={18} />
          </div>
          <h2 className="font-bold text-slate-800">Nozzle Readings</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {Object.entries(formData.nozzle_data).map(([key, value]) => (
            <div key={key} className="bg-slate-50 p-4 rounded-xl border border-slate-100">
              <h3 className="text-xs font-bold text-slate-500 uppercase mb-3 text-center">{key.replace('_', ' ')}</h3>
              <div className="space-y-3">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Front Machine</label>
                  <input
                    type="text"
                    value={value.front}
                    onChange={(e) => handleNozzleChange(key, 'front', e.target.value)}
                    disabled={isReadOnly}
                    className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-sm"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Back Machine</label>
                  <input
                    type="text"
                    value={value.back}
                    onChange={(e) => handleNozzleChange(key, 'back', e.target.value)}
                    disabled={isReadOnly}
                    className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-sm"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Section 5: TT DIP Table */}
      <div className={sectionClass}>
        <div className="flex items-center gap-2 mb-4">
          <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
            <Truck size={18} />
          </div>
          <h2 className="font-bold text-slate-800">Tank Truck (TT) DIP</h2>
        </div>

        {/* Desktop View */}
        <div className="hidden lg:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className={tableHeaderClass}>Tank</th>
                <th className={tableHeaderClass}>PL-CM</th>
                <th className={tableHeaderClass}>DIP-CM</th>
                <th className={tableHeaderClass}>QTY-kl</th>
                <th className={tableHeaderClass}>DIP Rod</th>
                <th className={tableHeaderClass}>Diff</th>
              </tr>
            </thead>
            <tbody>
              {formData.tt_dip_data.map((row, idx) => (
                <tr key={idx}>
                  <td className={tableCellClass + " font-bold text-center"}>{row.tank_no}</td>
                  {['pl_cm', 'dip_cm', 'qty_kl', 'dip_rod'].map(field => (
                    <td key={field} className={tableCellClass}>
                      <input
                        type="text"
                        value={row[field as keyof typeof row] || ''}
                        onChange={(e) => handleTTDipChange(idx, field, e.target.value)}
                        disabled={isReadOnly}
                        className="w-full text-center px-2 py-1.5 rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-sm"
                      />
                    </td>
                  ))}
                  <td className={tableCellClass}>
                    <input
                      type="text"
                      value={row.diff || ''}
                      disabled={true}
                      placeholder="Auto"
                      className={`w-full text-center px-2 py-1.5 rounded-lg border font-bold text-sm ${
                        parseFloat(row.diff) < 0 ? 'bg-red-50 text-red-600 border-red-100' : 
                        parseFloat(row.diff) > 0 ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 
                        'bg-slate-50 text-slate-500 border-slate-100'
                      }`}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile View */}
        <div className="lg:hidden space-y-4">
          {formData.tt_dip_data.map((row, idx) => (
            <div key={idx} className="bg-slate-50 p-4 rounded-xl border border-slate-100 space-y-3">
              <div className="flex items-center justify-between border-b border-slate-200 pb-2 mb-2">
                <span className="font-bold text-slate-700">Tank {row.tank_no}</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'PL-CM', field: 'pl_cm' },
                  { label: 'DIP-CM', field: 'dip_cm' },
                  { label: 'QTY-kl', field: 'qty_kl' },
                  { label: 'DIP Rod', field: 'dip_rod' },
                ].map(item => (
                  <div key={item.field}>
                    <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">{item.label}</label>
                    <input
                      type="text"
                      value={row[item.field as keyof typeof row] || ''}
                      onChange={(e) => handleTTDipChange(idx, item.field, e.target.value)}
                      disabled={isReadOnly}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-sm"
                    />
                  </div>
                ))}
                <div className="col-span-2 pt-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Difference</label>
                  <input
                    type="text"
                    value={row.diff || ''}
                    disabled={true}
                    className={`w-full px-3 py-2 rounded-lg border font-bold text-sm ${
                      parseFloat(row.diff) < 0 ? 'bg-red-50 text-red-600 border-red-100' : 
                      parseFloat(row.diff) > 0 ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 
                      'bg-slate-50 text-slate-500 border-slate-100'
                    }`}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Section 6: Tank DIP Table */}
      <div className={sectionClass}>
        <div className="flex items-center gap-2 mb-4">
          <div className="p-2 bg-rose-50 text-rose-600 rounded-lg">
            <Droplet size={18} />
          </div>
          <h2 className="font-bold text-slate-800">Storage Tank DIP</h2>
        </div>

        {/* Desktop View */}
        <div className="hidden lg:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className={tableHeaderClass}>Tank</th>
                <th className={tableHeaderClass}>Type</th>
                <th className={tableHeaderClass}>DIP Before</th>
                <th className={tableHeaderClass}>VOL Before</th>
                <th className={tableHeaderClass}>DIP After</th>
                <th className={tableHeaderClass}>VOL After</th>
                <th className={tableHeaderClass}>Shortage/Gain</th>
              </tr>
            </thead>
            <tbody>
              {['hsd1', 'hsd2', 'ms3'].map((tank) => (
                <React.Fragment key={tank}>
                  {['dip_rod', 'auto'].map((type, typeIdx) => {
                    const values = formData.tank_dip_data[tank as keyof typeof formData.tank_dip_data][type as 'dip_rod' | 'auto'];
                    return (
                      <tr key={`${tank}-${type}`}>
                        {typeIdx === 0 && (
                          <td rowSpan={2} className={tableCellClass + " font-bold text-center border-r border-slate-100 bg-slate-50/50"}>
                            {tank.toUpperCase()}
                          </td>
                        )}
                        <td className={tableCellClass + " text-center font-medium text-slate-500 italic"}>
                          {type === 'dip_rod' ? 'DIP Rod' : 'Auto'}
                        </td>
                        <td className={tableCellClass}>
                          <input
                            type="text"
                            value={values.dip_cm_before || ''}
                            onChange={(e) => handleTankDipChange(tank, type, 'dip_cm_before', e.target.value)}
                            disabled={isReadOnly}
                            className="w-full text-center px-2 py-1.5 rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-sm"
                          />
                        </td>
                        <td className={tableCellClass}>
                          <input
                            type="text"
                            value={values.net_vol_before || ''}
                            disabled={true}
                            placeholder="Auto"
                            className="w-full text-center px-2 py-1.5 rounded-lg border border-slate-100 bg-slate-50 text-slate-500 font-bold text-sm"
                          />
                        </td>
                        <td className={tableCellClass}>
                          <input
                            type="text"
                            value={values.dip_cm_after || ''}
                            onChange={(e) => handleTankDipChange(tank, type, 'dip_cm_after', e.target.value)}
                            disabled={isReadOnly}
                            className="w-full text-center px-2 py-1.5 rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-sm"
                          />
                        </td>
                        <td className={tableCellClass}>
                          <input
                            type="text"
                            value={values.net_vol_after || ''}
                            disabled={true}
                            placeholder="Auto"
                            className="w-full text-center px-2 py-1.5 rounded-lg border border-slate-100 bg-slate-50 text-slate-500 font-bold text-sm"
                          />
                        </td>
                        <td className={tableCellClass}>
                          <input
                            type="text"
                            value={values.diff || ''}
                            disabled={true}
                            placeholder="Auto"
                            className={`w-full text-center px-2 py-1.5 rounded-lg border font-bold text-sm ${
                              parseFloat(values.diff) < 0 ? 'bg-red-50 text-red-600 border-red-100' : 
                              parseFloat(values.diff) > 0 ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 
                              'bg-slate-50 text-slate-500 border-slate-100'
                            }`}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile View */}
        <div className="lg:hidden space-y-6">
          {['hsd1', 'hsd2', 'ms3'].map((tank) => {
            const types = formData.tank_dip_data[tank as keyof typeof formData.tank_dip_data];
            return (
              <div key={tank} className="space-y-4">
                <h3 className="font-extrabold text-slate-800 border-b pb-1 text-sm uppercase tracking-wider">{tank.toUpperCase()}</h3>
                <div className="grid grid-cols-1 gap-4">
                  {['dip_rod', 'auto'].map((type) => {
                    const values = types[type as 'dip_rod' | 'auto'];
                    return (
                      <div key={type} className="bg-slate-50 p-4 rounded-xl border border-slate-100 space-y-3">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-bold text-blue-600 uppercase">{type === 'dip_rod' ? 'DIP Rod Method' : 'Auto Sensor Method'}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="col-span-2 grid grid-cols-2 gap-3">
                            <div>
                              <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">DIP Before (cm)</label>
                              <input
                                type="text"
                                value={values.dip_cm_before}
                                onChange={(e) => handleTankDipChange(tank, type, 'dip_cm_before', e.target.value)}
                                disabled={isReadOnly}
                                className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-sm"
                              />
                            </div>
                            <div>
                              <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">VOL Before (L)</label>
                              <input
                                type="text"
                                value={values.net_vol_before}
                                disabled={true}
                                className="w-full px-3 py-2 rounded-lg border border-slate-100 bg-slate-50 text-slate-500 font-bold text-sm"
                              />
                            </div>
                          </div>

                          <div className="col-span-2 grid grid-cols-2 gap-3 border-t border-slate-100 pt-3">
                            <div>
                              <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">DIP After (cm)</label>
                              <input
                                type="text"
                                value={values.dip_cm_after}
                                onChange={(e) => handleTankDipChange(tank, type, 'dip_cm_after', e.target.value)}
                                disabled={isReadOnly}
                                className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-sm"
                              />
                            </div>
                            <div>
                              <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">VOL After (L)</label>
                              <input
                                type="text"
                                value={values.net_vol_after}
                                disabled={true}
                                className="w-full px-3 py-2 rounded-lg border border-slate-100 bg-slate-50 text-slate-500 font-bold text-sm"
                              />
                            </div>
                          </div>

                          <div className="col-span-2 pt-1">
                            <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Shortage / Gain</label>
                            <input
                              type="text"
                              value={values.diff}
                              disabled={true}
                              className={`w-full px-3 py-2 rounded-lg border font-bold text-sm ${
                                parseFloat(values.diff) < 0 ? 'bg-red-50 text-red-600 border-red-100' : 
                                parseFloat(values.diff) > 0 ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 
                                'bg-slate-50 text-slate-500 border-slate-100'
                              }`}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Admin Actions */}
      {isReadOnly && initialData?.status === 'Pending' && (
        <div className="mt-8 bg-blue-50 p-6 rounded-2xl border border-blue-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-600 text-white rounded-full">
              <CheckCircle2 size={24} />
            </div>
            <div>
              <h3 className="font-bold text-blue-900 text-lg">Ready for Approval</h3>
              <p className="text-blue-700">Please review the details before approving this decantation.</p>
            </div>
          </div>
        </div>
      )}
    </form>
  );
}
