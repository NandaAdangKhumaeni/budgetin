import React, { useState, useMemo, useEffect } from 'react';
import { TrendingUp, ArrowUpRight, ArrowDownRight, Activity, Plus, RefreshCw, X, AlertCircle, PieChart, Landmark, Trash2 } from 'lucide-react';

export default function Investment() {
  const [isUpdating, setIsUpdating] = useState(false);
  const [lastUpdated, setLastUpdated] = useState('Menggunakan harga terakhir yang tersedia.');
  const [activeFilter, setActiveFilter] = useState('Semua');
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSellModalOpen, setIsSellModalOpen] = useState(false);
  const [selectedInvest, setSelectedInvest] = useState(null);
  
  const [selectedBankId, setSelectedBankId] = useState(1);
  const [invType, setInvType] = useState('stock');
  const [formData, setFormData] = useState({
    qty: '', unit: 'lot', price: '', 
    bondNominal: '', bondCoupon: '', 
    navUnit: '', navPrice: '', name: ''
  });

  const [sellQty, setSellQty] = useState('');
  const [sellWallet, setSellWallet] = useState('');

  const [bankAccounts, setBankAccounts] = useState([]);
  const [investments, setInvestments] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchInvestments = async () => {
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL || `http://${window.location.hostname}/BUDGETIN/api`}/financial/react_investment.php`);
      const data = await res.json();
      if (data.success && data.data) {
        setInvestments(data.data.map(i => ({
          ...i,
          id: Number(i.id),
          units: Number(i.total_units),
          buyPrice: Number(i.avg_price),
          currentPrice: Number(i.current_price),
          unitType: i.type === 'stock' ? 'Lot' : i.type === 'gold' ? 'Gram' : 'Unit'
        })));
      }
    } catch(err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetch(`${import.meta.env.VITE_API_URL || `http://${window.location.hostname}/BUDGETIN/api`}/financial/react_bank.php`)
      .then(res => res.json())
      .then(data => {
        if(data.success && data.data) {
          setBankAccounts(data.data);
          if(data.data.length > 0) {
            setSellWallet(data.data[0].name);
            setSelectedBankId(data.data[0].id);
          }
        }
      })
      .catch(e => console.error(e));

    fetchInvestments().then(() => setIsLoading(false));
  }, []);

  const handleUpdateHarga = async () => {
    setIsUpdating(true);
    setLastUpdated('Memperbarui dari Live Market...');
    try {
      const assetsPayload = investments.map(inv => {
         let cleanSymbol = inv.name.replace(/\s*\(.*?\)\s*/g, '').trim(); 
         return { symbol: cleanSymbol, type: inv.type, unit: inv.unitType };
      });

      const res = await fetch(`${import.meta.env.VITE_API_URL || `http://${window.location.hostname}/BUDGETIN/api`}/market-price.php`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assets: assetsPayload })
      });
      const data = await res.json();
      
      if (data.available && data.quotes) {
        let updated = false;
        for (let i = 0; i < investments.length; i++) {
          const quote = data.quotes[i];
          if (quote && quote.available && quote.price > 0) {
            await fetch(`${import.meta.env.VITE_API_URL || `http://${window.location.hostname}/BUDGETIN/api`}/financial/react_investment.php?id=${investments[i].id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ current_price: quote.price })
            });
            updated = true;
          }
        }
        
        if (updated) await fetchInvestments();
        const time = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
        setLastUpdated(`Harga pasar sinkron - ${time} WIB.`);
      } else {
        setLastUpdated(`Gagal: ${data.message || 'API tidak tersedia.'}`);
      }
    } catch(err) {
      console.error(err);
      setLastUpdated('Gagal terhubung ke API pasar.');
    } finally {
      setIsUpdating(false);
    }
  };

  const [toastMessage, setToastMessage] = useState('');

  const totalInvestasi = useMemo(() => {
    const p = Number(formData.price) || 0;
    const q = Number(formData.qty) || 0;
    
    if (invType === 'stock') {
      return formData.unit === 'lot' ? q * 100 * p : q * p;
    } else if (invType === 'gold') {
      return q * p;
    } else if (invType === 'bond') {
      return Number(formData.bondNominal) || 0;
    } else if (invType === 'reksadana') {
      const nu = Number(formData.navUnit) || 0;
      const np = Number(formData.navPrice) || 0;
      return nu * np;
    }
    return 0;
  }, [invType, formData]);

  const handleAddSubmit = async (e) => {
    e.preventDefault();
    
    const selectedBank = bankAccounts.find(b => b.id === selectedBankId);
    if (!selectedBank) return;

    try {
      await fetch(`${import.meta.env.VITE_API_URL || `http://${window.location.hostname}/BUDGETIN/api`}/financial/react_transaction.php`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: totalInvestasi,
          type: 'expense',
          category: 'investment',
          wallet: selectedBank.name,
          note: `Pembelian Aset: ${formData.name || 'Aset Baru'}`
        })
      });
    } catch(err) {
      console.error("Failed to POST buy transaction", err);
    }

    let units = 0;
    let price = 0;
    
    if (invType === 'stock') {
       units = formData.unit === 'lot' ? Number(formData.qty) : Number(formData.qty) / 100;
       price = Number(formData.price);
    } else if (invType === 'gold') {
       units = Number(formData.qty);
       price = Number(formData.price);
    } else if (invType === 'bond') {
       units = 1;
       price = Number(formData.bondNominal);
    } else if (invType === 'reksadana') {
       units = Number(formData.navUnit);
       price = Number(formData.navPrice);
    }

    try {
      await fetch(`${import.meta.env.VITE_API_URL || `http://${window.location.hostname}/BUDGETIN/api`}/financial/react_investment.php`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: invType,
          name: formData.name || 'Aset Baru',
          total_units: units,
          avg_price: price,
          current_price: price
        })
      });
      
      await fetchInvestments();
      setToastMessage(`Berhasil membeli ${formData.name || 'Aset'} senilai Rp ${totalInvestasi.toLocaleString('id-ID')}!`);
      setTimeout(() => setToastMessage(''), 3500);
      setIsModalOpen(false);
      setFormData({ qty: '', unit: 'lot', price: '', bondNominal: '', bondCoupon: '', navUnit: '', navPrice: '', name: '' });
    } catch(err) {
      console.error(err);
    }
  };

  const openSellModal = (inv) => {
    setSelectedInvest(inv);
    setSellQty(inv.units.toString());
    setIsSellModalOpen(true);
  };

  const handleSellSubmit = async (e) => {
    e.preventDefault();
    const qtyToSell = Number(sellQty);
    if (qtyToSell <= 0 || isNaN(qtyToSell)) return;

    let multiplier = (selectedInvest.type === 'stock' && selectedInvest.unitType === 'Lot') ? 100 : 1;
    const amt = Math.floor(qtyToSell * multiplier * selectedInvest.currentPrice);

    try {
      await fetch(`${import.meta.env.VITE_API_URL || `http://${window.location.hostname}/BUDGETIN/api`}/financial/react_transaction.php`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: amt,
          type: 'income',
          category: 'other',
          wallet: sellWallet || (bankAccounts[0]?.name || 'BCA Utama'),
          note: `Pencairan Aset: ${selectedInvest.name} (${qtyToSell} ${selectedInvest.unitType || 'Unit'})`
        })
      });

      if (qtyToSell >= selectedInvest.units) {
        await fetch(`${import.meta.env.VITE_API_URL || `http://${window.location.hostname}/BUDGETIN/api`}/financial/react_investment.php?id=${selectedInvest.id}`, { method: 'DELETE' });
      } else {
        await fetch(`${import.meta.env.VITE_API_URL || `http://${window.location.hostname}/BUDGETIN/api`}/financial/react_investment.php?id=${selectedInvest.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ total_units: selectedInvest.units - qtyToSell })
        });
      }

      await fetchInvestments();
      setIsSellModalOpen(false);
      setSelectedInvest(null);
      setSellQty('');
    } catch(err) {
      console.error(err);
    }
  };

  const typeMap = { 'Semua': 'all', 'Saham': 'stock', 'Emas': 'gold', 'Reksadana': 'reksadana', 'Obligasi': 'bond' };
  const filteredInvestments = activeFilter === 'Semua' ? investments : investments.filter(inv => inv.type === typeMap[activeFilter]);

  const totalModal = investments.reduce((sum, inv) => {
    let u = inv.units;
    if (inv.type === 'stock') u = u * 100;
    return sum + (u * inv.buyPrice);
  }, 0);

  const totalCurrentValue = investments.reduce((sum, inv) => {
    let u = inv.units;
    if (inv.type === 'stock') u = u * 100;
    return sum + (u * inv.currentPrice);
  }, 0);

  const totalNetPL = totalCurrentValue - totalModal;
  const totalNetPLPercent = totalModal > 0 ? (totalNetPL / totalModal) * 100 : 0;

  if (isLoading) {
    return <div className="flex items-center justify-center h-[60vh]"><div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div></div>;
  }

  return (
    <div className="w-full 2xl:max-w-screen-2xl mx-auto space-y-6 pb-20 relative">
      
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-4 md:p-8 left-1/2 -translate-x-1/2 z-[100] bg-emerald-500 text-white px-6 py-3 rounded-full shadow-lg font-bold animate-in slide-in-from-top-4 fade-in flex items-center gap-2">
          <AlertCircle size={18} />
          {toastMessage}
        </div>
      )}
      
      {/* Total Portofolio Card */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:p-6 mb-8">
        <div className="bg-slate-900 rounded-3xl p-4 md:p-6 text-white shadow-xl relative overflow-hidden md:col-span-2">
          <div className="absolute top-0 right-0 p-4 md:p-8 opacity-10">
            <TrendingUp size={100} />
          </div>
          <div className="relative z-10">
            <p className="text-slate-400 font-medium text-sm uppercase tracking-wider mb-2">Total Portofolio Saat Ini</p>
            <h2 className="text-4xl font-bold mb-4">Rp {totalCurrentValue.toLocaleString('id-ID', {maximumFractionDigits:0})}</h2>
            <div className="flex flex-wrap gap-4">
              <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-semibold border ${totalNetPL >= 0 ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/20' : 'bg-red-500/20 text-red-400 border-red-500/20'}`}>
                {totalNetPL >= 0 ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />} 
                Net P/L: {totalNetPL > 0 ? '+' : ''}Rp {totalNetPL.toLocaleString('id-ID', {maximumFractionDigits:0})} ({totalNetPLPercent.toFixed(2)}%)
              </div>
              <div className="inline-flex items-center gap-2 bg-white/10 text-slate-300 px-3 py-1.5 rounded-lg text-sm font-semibold border border-white/10">
                Total Modal (Beli): Rp {totalModal.toLocaleString('id-ID', {maximumFractionDigits:0})}
              </div>
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-3xl p-4 md:p-6 border border-slate-200 shadow-sm flex flex-col justify-center items-center text-center relative overflow-hidden">
          <div className="absolute right-[-20px] top-[-20px] opacity-5">
            <PieChart size={120} />
          </div>
          <div className="w-16 h-16 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mb-4 z-10">
            <Activity size={32} />
          </div>
          <strong className="text-lg text-slate-800 z-10">Auto-Invest Aktif</strong>
          <p className="text-sm text-slate-500 mt-2 z-10">Rp 1.000.000 / bulan</p>
        </div>
      </div>

      {/* Main List */}
      <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm p-4 md:p-8">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-4 gap-4">
            <h3 className="text-xl font-bold text-slate-800 dark:text-white leading-tight">Daftar Aset</h3>
            <div className="flex flex-wrap gap-2.5 items-center">
              <button 
                onClick={() => setIsModalOpen(true)}
                className="flex-none w-auto inline-flex items-center justify-center gap-1.5 md:gap-2 px-3 md:px-4 py-2 md:py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors text-xs md:text-sm font-bold shadow-sm shadow-blue-500/20 cursor-pointer whitespace-nowrap"
              >
                <Plus size={16} /> Tambah Investasi
              </button>
              <button 
                onClick={handleUpdateHarga}
                disabled={isUpdating}
                className="flex-none w-auto inline-flex items-center justify-center gap-1.5 md:gap-2 px-3 md:px-4 py-2 md:py-2.5 bg-emerald-500 text-white rounded-xl hover:bg-emerald-600 transition-colors text-xs md:text-sm font-bold shadow-sm disabled:opacity-70 cursor-pointer whitespace-nowrap"
              >
                <RefreshCw size={14} className={isUpdating ? 'animate-spin' : ''} /> 
                {isUpdating ? 'Memperbarui...' : 'Update Harga Pasar'}
              </button>
            </div>
        </div>
        
        <p className={`text-sm mb-6 ${lastUpdated.includes('Harga pasar') ? 'text-emerald-600 font-medium' : 'text-slate-500'}`}>
          {lastUpdated}
        </p>

        {/* Filter Tabs */}
        <div className="flex gap-2 mb-6 overflow-x-auto pb-2 custom-scrollbar">
          {['Semua', 'Saham', 'Emas', 'Reksadana', 'Obligasi'].map(filter => (
            <button
              key={filter}
              onClick={() => setActiveFilter(filter)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                activeFilter === filter 
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20' 
                  : 'bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100'
              }`}
            >
              {filter}
            </button>
          ))}
        </div>

        <div className="space-y-4">
          {filteredInvestments.map((inv) => {
            let u = inv.units;
            if (inv.type === 'stock') u = u * 100; // if it's stock, units is stored in lots, but for value calculation we need shares. Wait, I stored 'units' as Lots if they selected Lot.
            
            const itemModal = u * inv.buyPrice;
            const itemCurrent = u * inv.currentPrice;
            const itemPL = itemCurrent - itemModal;
            const itemPLPercent = itemModal > 0 ? (itemPL / itemModal) * 100 : 0;
            const isPos = itemPL >= 0;

            return (
              <div key={inv.id} className="flex flex-col md:flex-row justify-between md:items-center p-5 rounded-2xl border border-slate-100 hover:border-blue-200 hover:shadow-md hover:bg-blue-50/30 transition-all group gap-4">
                <div className="flex-1">
                  <strong className="block text-slate-800 font-bold text-lg mb-1 group-hover:text-blue-600 transition-colors">{inv.name}</strong>
                  <div className="flex gap-2 text-sm">
                    <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded capitalize font-medium">{inv.type}</span>
                    <span className="text-slate-500">&bull; {inv.units.toFixed(2)} {inv.unitType || 'Unit'}</span>
                  </div>
                </div>
                
                <div className="flex items-center gap-4 md:p-8 md:text-right">
                  <div className="hidden sm:block">
                    <small className="text-slate-400 block mb-1 font-medium">Harga Modal (Beli)</small>
                    <strong className="text-slate-600">Rp {itemModal.toLocaleString('id-ID', {maximumFractionDigits:0})}</strong>
                  </div>
                  <div>
                    <small className="text-slate-400 block mb-1 font-medium">Nilai Saat Ini (Jual)</small>
                    <strong className="text-slate-800 font-bold block text-lg">Rp {itemCurrent.toLocaleString('id-ID', {maximumFractionDigits:0})}</strong>
                    <small className={`flex items-center md:justify-end gap-1 font-semibold ${isPos ? 'text-emerald-500' : 'text-red-500'}`}>
                      {isPos ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />} 
                      {isPos ? '+' : ''}Rp {itemPL.toLocaleString('id-ID', {maximumFractionDigits:0})} ({itemPLPercent.toFixed(2)}%)
                    </small>
                  </div>
                  <div>
                    <button 
                      onClick={() => openSellModal(inv)}
                      className="px-4 py-2 bg-orange-100 text-orange-700 hover:bg-orange-200 font-bold rounded-xl transition-colors cursor-pointer text-sm"
                    >
                      Jual
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
          {filteredInvestments.length === 0 && (
            <div className="text-center py-10 bg-slate-50 rounded-2xl border border-slate-100 text-slate-500">
              Belum ada portofolio aset untuk kategori ini.
            </div>
          )}
        </div>
      </div>

      {/* JUAL ASET MODAL */}
      {isSellModalOpen && selectedInvest && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl animate-in zoom-in-95 p-4 md:p-6">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                <Landmark className="text-orange-500" /> Jual Aset
              </h3>
              <button onClick={() => setIsSellModalOpen(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleSellSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-slate-500 mb-2">Aset yang Dijual</label>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 font-bold text-slate-700">
                  {selectedInvest.name}
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-500 mb-2">Jumlah yang Dijual ({selectedInvest.unitType || 'Unit/Gram'})</label>
                <input 
                  type="number" required step="any" min="0" max={selectedInvest.units}
                  value={sellQty} 
                  onChange={e => setSellQty(e.target.value)}
                  className="w-full p-3 bg-white rounded-xl border border-slate-200 font-bold text-slate-800 outline-none focus:ring-2 focus:ring-orange-500"
                />
                <div className="bg-orange-50 rounded-xl p-3 mt-3 border border-orange-100 flex justify-between items-center">
                   <small className="text-orange-700 font-bold">Estimasi Pendapatan</small>
                   <strong className="text-orange-600 font-bold text-lg">
                      Rp {(() => {
                         const q = Number(sellQty) || 0;
                         const m = selectedInvest.type === 'stock' ? 100 : 1;
                         return Math.floor(q * m * selectedInvest.currentPrice).toLocaleString('id-ID');
                      })()}
                   </strong>
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-500 mb-2">Cairkan Ke Rekening</label>
                <select 
                  required value={sellWallet} onChange={e=>setSellWallet(e.target.value)}
                  className="w-full p-3 bg-white rounded-xl border border-slate-200 font-bold text-slate-800 outline-none focus:ring-2 focus:ring-orange-500 cursor-pointer"
                >
                  <option value="" disabled>Pilih Rekening Tujuan...</option>
                  {bankAccounts.map(b => (
                    <option key={b.id} value={b.name}>{b.name}</option>
                  ))}
                </select>
              </div>

              <button type="submit" className="w-full mt-4 py-3 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-xl shadow-lg shadow-orange-500/30 transition-colors flex items-center justify-center gap-2 cursor-pointer">
                Konfirmasi Pencairan
              </button>
            </form>
          </div>
        </div>
      )}

      {/* TAMBAH MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4 pt-10">
          <div className="bg-white rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl animate-in zoom-in-95 flex flex-col max-h-[90vh]">
            <div className="flex justify-between items-center p-4 md:p-6 border-b border-slate-100 shrink-0">
              <h3 className="text-xl font-bold text-slate-800">Tambah Investasi Baru</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:bg-slate-100 p-2 rounded-full transition-colors cursor-pointer">
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleAddSubmit} className="p-4 md:p-6 space-y-6 overflow-y-auto custom-scrollbar flex-1">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-3">Pilih Instrumen</label>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[{id:'stock', label:'Saham'}, {id:'gold', label:'Emas'}, {id:'reksadana', label:'Reksadana'}, {id:'bond', label:'Obligasi'}].map(type => (
                    <div 
                      key={type.id}
                      onClick={() => setInvType(type.id)}
                      className={`p-3 rounded-xl border text-center font-semibold cursor-pointer transition-colors ${invType === type.id ? 'bg-blue-50 border-blue-600 text-blue-700 ring-1 ring-blue-600' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                    >
                      {type.label}
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-slate-50/50 p-5 rounded-2xl border border-slate-100">
                {['stock', 'gold'].includes(invType) && (
                  <div className="space-y-4 animate-in fade-in">
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1">{invType === 'stock' ? 'Kode Saham / Nama Aset' : 'Jenis Emas'}</label>
                      <input type="text" value={formData.name || ''} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl outline-none focus:border-blue-500 uppercase" placeholder={invType === 'stock' ? 'Contoh: BBCA' : 'Contoh: Antam'} required />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-1">Jumlah Beli</label>
                        <input 
                          type="number" min="0" step="any" required
                          value={formData.qty} onChange={e => setFormData({...formData, qty: e.target.value})}
                          className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl outline-none focus:border-blue-500" placeholder="Contoh: 10" 
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-1">Satuan</label>
                        <select 
                          value={formData.unit} onChange={e => setFormData({...formData, unit: e.target.value})}
                          className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl outline-none focus:border-blue-500"
                        >
                          {invType === 'stock' ? (
                            <><option value="lot">Lot (100 Lembar)</option><option value="share">Lembar</option></>
                          ) : (
                            <><option value="gram">Gram</option></>
                          )}
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1">
                        {invType === 'stock' ? 'Harga Beli per Lembar' : 'Harga Beli per Gram'}
                      </label>
                      <input 
                        type="number" min="0" required
                        value={formData.price} onChange={e => setFormData({...formData, price: e.target.value})}
                        className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl outline-none focus:border-blue-500" placeholder={invType === 'stock' ? "Contoh: 9000" : "Contoh: 1400000"} 
                      />
                    </div>
                  </div>
                )}
                {invType === 'bond' && (
                  <div className="space-y-4 animate-in fade-in">
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1">Nama Obligasi</label>
                      <input type="text" value={formData.name || ''} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl outline-none focus:border-blue-500" placeholder="Contoh: ORI027" required />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1">Nominal Pokok</label>
                      <input 
                        type="number" min="0" required
                        value={formData.bondNominal} onChange={e => setFormData({...formData, bondNominal: e.target.value})}
                        className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl outline-none focus:border-blue-500" placeholder="5000000" 
                      />
                    </div>
                  </div>
                )}
                {invType === 'reksadana' && (
                  <div className="space-y-4 animate-in fade-in">
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1">Nama Reksadana</label>
                      <input type="text" value={formData.name || ''} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl outline-none focus:border-blue-500" placeholder="Contoh: Sucorinvest" required />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-1">Jumlah Unit</label>
                        <input 
                          type="number" step="any" min="0" required
                          value={formData.navUnit} onChange={e => setFormData({...formData, navUnit: e.target.value})}
                          className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl outline-none focus:border-blue-500" placeholder="Contoh: 1540.23" 
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-1">NAV (Harga Beli per Unit)</label>
                        <input 
                          type="number" step="any" min="0" required
                          value={formData.navPrice} onChange={e => setFormData({...formData, navPrice: e.target.value})}
                          className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl outline-none focus:border-blue-500" placeholder="Contoh: 1250.5" 
                        />
                      </div>
                    </div>
                  </div>
                )}
                
                <div className="mt-4">
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Beli Melalui Rekening</label>
                  <select 
                    value={selectedBankId} onChange={e => setSelectedBankId(Number(e.target.value))}
                    className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl outline-none focus:border-blue-500 cursor-pointer"
                  >
                    {bankAccounts.map(b => (
                      <option key={b.id} value={b.id}>{b.name} (Saldo: Rp {(Number(b.balance)).toLocaleString('id-ID')})</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="bg-blue-50 rounded-2xl p-5 border border-blue-100 flex justify-between items-center mt-6">
                <div>
                  <small className="block text-blue-700 font-semibold mb-1">Total Nilai Investasi</small>
                </div>
                <strong className="text-2xl font-bold text-blue-700">
                  Rp {totalInvestasi.toLocaleString('id-ID')}
                </strong>
              </div>

              <div className="pt-2 flex gap-3">
                <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 py-4 px-4 bg-slate-100 text-slate-700 font-bold rounded-xl hover:bg-slate-200 transition-colors cursor-pointer">
                  Batal
                </button>
                <button 
                  type="submit" 
                  disabled={totalInvestasi <= 0}
                  className="flex-1 py-4 px-4 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 shadow-lg shadow-blue-500/30 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Beli & Simpan
                </button>
              </div>

            </form>
          </div>
        </div>
      )}
    </div>
  );
}






