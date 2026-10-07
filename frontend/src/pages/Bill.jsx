import React, { useState, useEffect } from 'react';
import { Bell, Wifi, Zap, Droplets, MonitorPlay, AlertCircle, Plus, Edit2, Trash2, CheckCircle2, CreditCard, Calendar, Smartphone, Home, ShieldCheck, Car, GraduationCap, ShoppingBag, HeartPulse, Gamepad2, Utensils, Music, Plane } from 'lucide-react';

const ICONS = [
  { id: 'wifi', icon: <Wifi size={24}/>, color: 'text-red-500', bg: 'bg-red-50 dark:bg-red-500/10' },
  { id: 'zap', icon: <Zap size={24}/>, color: 'text-yellow-500', bg: 'bg-yellow-50 dark:bg-yellow-500/10' },
  { id: 'droplets', icon: <Droplets size={24}/>, color: 'text-blue-500', bg: 'bg-blue-50 dark:bg-blue-500/10' },
  { id: 'monitor', icon: <MonitorPlay size={24}/>, color: 'text-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-500/10' },
  { id: 'smartphone', icon: <Smartphone size={24}/>, color: 'text-purple-500', bg: 'bg-purple-50 dark:bg-purple-500/10' },
  { id: 'home', icon: <Home size={24}/>, color: 'text-orange-500', bg: 'bg-orange-50 dark:bg-orange-500/10' },
  { id: 'car', icon: <Car size={24}/>, color: 'text-slate-600 dark:text-slate-300', bg: 'bg-slate-100 dark:bg-slate-800' },
  { id: 'edu', icon: <GraduationCap size={24}/>, color: 'text-indigo-500', bg: 'bg-indigo-50 dark:bg-indigo-500/10' },
  { id: 'shop', icon: <ShoppingBag size={24}/>, color: 'text-pink-500', bg: 'bg-pink-50 dark:bg-pink-500/10' },
  { id: 'health', icon: <HeartPulse size={24}/>, color: 'text-rose-500', bg: 'bg-rose-50 dark:bg-rose-500/10' },
  { id: 'game', icon: <Gamepad2 size={24}/>, color: 'text-cyan-500', bg: 'bg-cyan-50 dark:bg-cyan-500/10' },
  { id: 'food', icon: <Utensils size={24}/>, color: 'text-amber-500', bg: 'bg-amber-50 dark:bg-amber-500/10' },
  { id: 'music', icon: <Music size={24}/>, color: 'text-fuchsia-500', bg: 'bg-fuchsia-50 dark:bg-fuchsia-500/10' },
  { id: 'travel', icon: <Plane size={24}/>, color: 'text-sky-500', bg: 'bg-sky-50 dark:bg-sky-500/10' },
];

export default function Bill() {
  const [bills, setBills] = useState([]);
  const [banks, setBanks] = useState([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showPayModal, setShowPayModal] = useState(false);
  const [selectedBill, setSelectedBill] = useState(null);
  
  const [formData, setFormData] = useState({ name: '', amount: '', date: '1', iconId: 'wifi', type: 'rutin', currentTenor: '1', totalTenor: '12' });
  const [payData, setPayData] = useState({ bankId: '' });
  
  const [showToast, setShowToast] = useState({ show: false, message: '', type: 'success' });
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [billToDelete, setBillToDelete] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  const triggerToast = (message, type = 'success') => {
    setShowToast({ show: true, message, type });
    setTimeout(() => setShowToast({ show: false, message: '', type: 'success' }), 3000);
  };

  const fetchBills = async () => {
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL || `http://${window.location.hostname}/BUDGETIN/api`}/financial/react_bill.php`);
      const data = await res.json();
      if (data.success) {
        
        // Auto-Reset if month changed
        const currentMonth = new Date().toISOString().slice(0,7); // YYYY-MM
        let loadedBills = data.data.map(b => ({
          ...b,
          amount: Number(b.amount),
          date: Number(b.due_date),
          isPaid: b.is_paid == 1,
          isInstallment: b.is_installment == 1,
          isCompleted: b.is_completed == 1,
          currentTenor: b.current_tenor ? Number(b.current_tenor) : null,
          totalTenor: b.total_tenor ? Number(b.total_tenor) : null,
          iconId: b.icon_id,
          lastPaidMonth: b.last_paid_month
        }));

        let needsUpdate = false;
        
        for (let b of loadedBills) {
          if (b.isCompleted) continue;

          if (b.isPaid && b.lastPaidMonth !== currentMonth) {
            needsUpdate = true;
            b.isPaid = false;
            let updatePayload = { is_paid: 0 };
            
            if (b.isInstallment) {
              b.currentTenor = Number(b.currentTenor) + 1;
              updatePayload.current_tenor = b.currentTenor;
              if (b.currentTenor > Number(b.totalTenor)) {
                b.isCompleted = true;
                b.isPaid = true;
                b.currentTenor = b.totalTenor;
                updatePayload.is_completed = 1;
                updatePayload.is_paid = 1;
                updatePayload.current_tenor = b.currentTenor;
              }
            }
            
            // Push update to DB
            await fetch(`${import.meta.env.VITE_API_URL || `http://${window.location.hostname}/BUDGETIN/api`}/financial/react_bill.php?id=${b.id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(updatePayload)
            });
          }
        }

        setBills(loadedBills);
      }
    } catch (e) {
      console.error(e);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    // Load Banks from API
    fetch(`${import.meta.env.VITE_API_URL || `http://${window.location.hostname}/BUDGETIN/api`}/financial/react_bank.php`)
      .then(res => res.json())
      .then(data => {
        if(data.success && data.data) {
          setBanks(data.data);
        }
      })
      .catch(e => console.error(e));

    fetchBills();
  }, []);

  const handleAddSubmit = async (e) => {
    e.preventDefault();
    const isCicilan = formData.type === 'cicilan';
    const amountNum = Number(formData.amount.toString().replace(/\./g, ''));
    
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL || `http://${window.location.hostname}/BUDGETIN/api`}/financial/react_bill.php`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: formData.type,
          name: formData.name,
          amount: amountNum,
          due_date: Number(formData.date),
          icon_id: formData.iconId,
          is_paid: 0,
          is_installment: isCicilan ? 1 : 0,
          current_tenor: isCicilan ? Number(formData.currentTenor) : null,
          total_tenor: isCicilan ? Number(formData.totalTenor) : null,
          is_completed: 0
        })
      });
      const data = await res.json();
      if(data.success) {
        setShowAddModal(false);
        setFormData({ name: '', amount: '', date: '1', iconId: 'wifi', type: 'rutin', currentTenor: '1', totalTenor: '12' });
        triggerToast('Tagihan berhasil ditambahkan!');
        fetchBills(); // refresh
      }
    } catch(e) {
      console.error(e);
      triggerToast('Gagal menambahkan tagihan', 'error');
    }
  };

  const requestDelete = (id) => {
    setBillToDelete(id);
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL || `http://${window.location.hostname}/BUDGETIN/api`}/financial/react_bill.php?id=${billToDelete}`, { method: 'DELETE' });
      const data = await res.json();
      if(data.success) {
        setShowDeleteModal(false);
        triggerToast('Tagihan berhasil dihapus!');
        fetchBills();
      }
    } catch(e) {
      console.error(e);
    }
  };

  const handlePay = async (e) => {
    e.preventDefault();
    if (!payData.bankId) return triggerToast('Pilih rekening untuk membayar', 'error');
    
    const bankIndex = banks.findIndex(b => b.id === Number(payData.bankId));
    if (bankIndex === -1) return;
    const selectedBank = banks[bankIndex];
    if (selectedBank.balance < selectedBill.amount) return triggerToast('Saldo tidak mencukupi!', 'error');

    // Add Transaction via API
    await fetch(`${import.meta.env.VITE_API_URL || `http://${window.location.hostname}/BUDGETIN/api`}/financial/react_transaction.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: selectedBill.amount,
        type: 'expense',
        category: 'bills',
        wallet: selectedBank.name,
        note: `Bayar Tagihan: ${selectedBill.name} ${selectedBill.isInstallment ? `(Bulan ke-${selectedBill.currentTenor})` : ''}`
      })
    }).catch(e => console.error(e));

    // Update Bill Status
    const currentMonth = new Date().toISOString().slice(0,7);
    
    try {
      await fetch(`${import.meta.env.VITE_API_URL || `http://${window.location.hostname}/BUDGETIN/api`}/financial/react_bill.php?id=${selectedBill.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          is_paid: 1,
          last_paid_month: currentMonth
        })
      });
      setShowPayModal(false);
      triggerToast('Tagihan berhasil dibayar!');
      fetchBills();
    } catch (e) {
      console.error(e);
      triggerToast('Gagal update tagihan', 'error');
    }
  };

  const today = new Date().getDate();
  const getStatus = (bill) => {
    if (bill.isCompleted) return { label: 'Lunas Permanen', color: 'text-amber-500' };
    if (bill.isPaid) return { label: 'Lunas Bulan Ini', color: 'text-emerald-500' };
    const diff = bill.date - today;
    if (diff < 0) return { label: 'Terlewat', color: 'text-red-600' };
    if (diff <= 3) return { label: `Jatuh tempo dlm ${diff} hari`, color: 'text-red-500' };
    return { label: `Jatuh tempo tgl ${bill.date}`, color: 'text-slate-500 dark:text-slate-400' };
  };

  const urgentBill = bills.find(b => !b.isPaid && !b.isCompleted && (b.date - today <= 3));

  if (isLoading) {
    return <div className="flex items-center justify-center h-[60vh]"><div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div></div>;
  }

  return (
    <div className="w-full 2xl:max-w-screen-2xl mx-auto space-y-6 pb-20">
      
            {urgentBill && (
        <div className="bg-red-50 dark:bg-red-500/10 border border-red-100 dark:border-red-500/20 rounded-2xl p-4 md:p-5 flex flex-col md:flex-row items-start md:items-center gap-4 md:gap-4 mb-6 md:mb-8 shadow-sm animate-in fade-in slide-in-from-top-4">
            <div className="flex items-center gap-3 md:gap-4 flex-1 w-full">
              <div className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-red-100 dark:bg-red-500/20 text-red-600 flex items-center justify-center shrink-0">
                <AlertCircle className="w-5 h-5 md:w-6 md:h-6" />
              </div>
              <div className="flex-1">
                <strong className="block text-red-800 dark:text-red-400 font-bold text-[14px] md:text-base leading-tight md:leading-normal">
                  {(urgentBill.date - today) < 0 ? 'Tagihan TERLEWAT Jatuh Tempo!' : 'Ada Tagihan Segera Jatuh Tempo'}
                </strong>
                <p className="text-red-600 dark:text-red-300 text-[12px] md:text-sm mt-1 leading-snug md:leading-normal">
                  Siapkan dana Rp {urgentBill.amount.toLocaleString('id-ID')} untuk tagihan {urgentBill.name} (Tgl {urgentBill.date}).
                </p>
              </div>
            </div>
            <button onClick={() => { setSelectedBill(urgentBill); setShowPayModal(true); }} className="w-full md:w-auto bg-red-600 text-white px-5 py-2.5 rounded-xl text-sm font-bold hover:bg-red-700 transition-colors cursor-pointer shadow-lg shadow-red-500/30 whitespace-nowrap">
              Bayar Sekarang
            </button>
          </div>
      )}

      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-4 gap-4">
          <h3 className="text-lg md:text-xl font-bold text-slate-800 dark:text-white leading-tight">Daftar Tagihan & Cicilan</h3>
          <div className="flex flex-wrap gap-2.5 items-center">
            <button onClick={() => setShowAddModal(true)} className="flex-none w-auto inline-flex items-center justify-center gap-1.5 md:gap-2 px-3 md:px-4 py-2 md:py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs md:text-sm font-bold shadow-md shadow-blue-500/20 cursor-pointer transition-colors whitespace-nowrap">
              <Plus size={16} /> Tambah Tagihan
            </button>
          </div>
        </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {bills.map((bill) => {
          const iconObj = ICONS.find(i => i.id === bill.iconId) || ICONS[0];
          const status = getStatus(bill);
          
          return (
            <div key={bill.id} className={`p-4 md:p-5 rounded-2xl border flex items-center gap-3 md:gap-4 transition-all ${bill.isCompleted ? 'bg-amber-50/50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800' : 'bg-white dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 hover:shadow-lg'}`}>
              <div className={`w-12 h-12 md:w-14 md:h-14 rounded-2xl flex items-center justify-center shrink-0 ${bill.isCompleted ? 'bg-amber-100 text-amber-600' : `${iconObj.bg} ${iconObj.color}`}`}>
                {bill.isCompleted ? <ShieldCheck size={24} /> : iconObj.icon}
              </div>
              
              <div className="flex-1 min-w-0">
                <strong className="block text-slate-800 dark:text-white font-bold truncate">{bill.name}</strong>
                {bill.isInstallment && !bill.isCompleted && (
                   <div className="mt-1 mb-1">
                     <span className="text-[10px] uppercase tracking-wider font-bold bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-md">
                       Cicilan ke-{bill.currentTenor} / {bill.totalTenor}
                     </span>
                   </div>
                )}
                {bill.isCompleted && (
                   <div className="mt-1 mb-1">
                     <span className="text-[10px] uppercase tracking-wider font-bold bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 px-2 py-0.5 rounded-md">
                       Cicilan Selesai ??
                     </span>
                   </div>
                )}
                <small className={`block text-[11px] md:text-xs font-medium mt-1 leading-tight ${status.color}`}>
                  {status.label}
                </small>
              </div>
              
              <div className="text-right flex flex-col items-end justify-center shrink-0">
                <strong className={`block font-bold text-[14px] md:text-lg leading-tight ${bill.isCompleted ? 'text-amber-600 line-through opacity-50' : 'text-slate-800 dark:text-white'}`}>
                  Rp {bill.amount.toLocaleString('id-ID')}
                </strong>
                
                {bill.isCompleted ? (
                   <span className="flex items-center gap-1 text-xs font-bold text-amber-600 mt-1">Lunas Total</span>
                ) : bill.isPaid ? (
                  <span className="flex items-center gap-1 text-xs font-bold text-emerald-500 mt-1 bg-emerald-50 dark:bg-emerald-500/10 px-2 py-1 rounded-md">
                    <CheckCircle2 size={12} /> Lunas Bulan Ini
                  </span>
                ) : (
                  <button onClick={() => { setSelectedBill(bill); setShowPayModal(true); }} className="text-[10px] md:text-xs font-bold text-blue-600 dark:text-blue-400 hover:text-blue-800 bg-blue-50 dark:bg-blue-500/10 px-2.5 py-1.5 md:px-3 rounded-lg mt-1.5 md:mt-2 cursor-pointer transition-colors whitespace-nowrap">
                    Bayar Sekarang
                  </button>
                )}
              </div>
              
              <button onClick={() => requestDelete(bill.id)} className="ml-2 p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-colors cursor-pointer shrink-0">
                <Trash2 size={16} />
              </button>
            </div>
          );
        })}
        
        {bills.length === 0 && (
          <div className="col-span-1 md:col-span-2 text-center p-12 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-3xl">
            <p className="text-slate-500 dark:text-slate-400 font-medium">Belum ada tagihan atau cicilan yang dicatat.</p>
          </div>
        )}
      </div>

      {/* ADD BILL MODAL */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-md p-4 md:p-6 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-y-auto max-h-screen custom-scrollbar">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-slate-800 dark:text-white">Tambah Tagihan</h3>
              <button onClick={() => setShowAddModal(false)} className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 cursor-pointer hover:bg-slate-200"><Plus size={18} className="rotate-45" /></button>
            </div>
            
            <form onSubmit={handleAddSubmit} className="space-y-4">
              
              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Tipe Pembayaran</label>
                <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
                  <button type="button" onClick={() => setFormData({...formData, type: 'rutin'})} className={`flex-1 py-2 text-sm font-bold rounded-lg transition-colors cursor-pointer ${formData.type === 'rutin' ? 'bg-white dark:bg-slate-700 shadow-sm text-blue-600 dark:text-blue-400' : 'text-slate-500'}`}>Berlangganan / Rutin</button>
                  <button type="button" onClick={() => setFormData({...formData, type: 'cicilan'})} className={`flex-1 py-2 text-sm font-bold rounded-lg transition-colors cursor-pointer ${formData.type === 'cicilan' ? 'bg-white dark:bg-slate-700 shadow-sm text-blue-600 dark:text-blue-400' : 'text-slate-500'}`}>Cicilan Berjangka</button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Nama {formData.type === 'cicilan' ? 'Cicilan' : 'Tagihan'}</label>
                <input type="text" required value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-white outline-none focus:border-blue-500" placeholder={formData.type === 'cicilan' ? "Cth: Cicilan Motor PCX" : "Cth: Netflix Premium"} />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Jumlah (Rp)</label>
                  <input type="text" required value={formData.amount} onChange={e => {
                    const rawValue = e.target.value.replace(/\D/g, '');
                    const formatted = rawValue ? Number(rawValue).toLocaleString('id-ID') : '';
                    setFormData({...formData, amount: formatted});
                  }} className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-white outline-none focus:border-blue-500" placeholder="0" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Jatuh Tempo (Tgl)</label>
                  <input type="number" min="1" max="31" required value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-white outline-none focus:border-blue-500" />
                </div>
              </div>

              {formData.type === 'cicilan' && (
                <div className="grid grid-cols-2 gap-4 bg-blue-50 dark:bg-blue-900/10 p-4 rounded-xl border border-blue-100 dark:border-blue-900/30 animate-in slide-in-from-top-2">
                  <div>
                    <label className="block text-xs font-semibold text-blue-800 dark:text-blue-300 mb-1">Total Tenor (Bulan)</label>
                    <input type="number" min="1" required value={formData.totalTenor} onChange={e => setFormData({...formData, totalTenor: e.target.value})} className="w-full p-2 bg-white dark:bg-slate-800 border border-blue-200 dark:border-blue-800 rounded-lg text-sm text-slate-800 dark:text-white outline-none focus:border-blue-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-blue-800 dark:text-blue-300 mb-1">Bayar Ke- (Bulan ini)</label>
                    <input type="number" min="1" max={formData.totalTenor} required value={formData.currentTenor} onChange={e => setFormData({...formData, currentTenor: e.target.value})} className="w-full p-2 bg-white dark:bg-slate-800 border border-blue-200 dark:border-blue-800 rounded-lg text-sm text-slate-800 dark:text-white outline-none focus:border-blue-500" />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Pilih Ikon</label>
                <div className="flex gap-3 overflow-x-auto pb-2 custom-scrollbar">
                  {ICONS.map(i => (
                    <div key={i.id} onClick={() => setFormData({...formData, iconId: i.id})} className={`w-12 h-12 rounded-xl shrink-0 flex items-center justify-center cursor-pointer transition-all ${i.color} ${i.bg} ${formData.iconId === i.id ? 'ring-2 ring-offset-2 ring-blue-500 dark:ring-offset-slate-900 scale-110' : 'hover:scale-105 opacity-60 hover:opacity-100'}`}>
                      {i.icon}
                    </div>
                  ))}
                </div>
              </div>
              <button type="submit" className="w-full py-4 mt-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-lg cursor-pointer transition-colors">Simpan Data</button>
            </form>
          </div>
        </div>
      )}

      {/* PAY BILL MODAL */}
      {showPayModal && selectedBill && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-sm p-4 md:p-6 border border-slate-200 dark:border-slate-800 shadow-2xl text-center">
            <div className="w-16 h-16 rounded-full bg-blue-50 dark:bg-blue-500/10 text-blue-600 flex items-center justify-center mx-auto mb-4">
              <CreditCard size={32} />
            </div>
            <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-2">Bayar {selectedBill.name}</h3>
            {selectedBill.isInstallment && (
              <p className="text-sm font-bold text-blue-600 bg-blue-50 dark:bg-blue-900/30 inline-block px-3 py-1 rounded-full mb-3">
                Cicilan Bulan Ke-{selectedBill.currentTenor}
              </p>
            )}
            <p className="text-3xl font-extrabold text-slate-800 dark:text-white mb-6">Rp {selectedBill.amount.toLocaleString('id-ID')}</p>
            
            <form onSubmit={handlePay} className="text-left space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Sumber Dana</label>
                <select required value={payData.bankId} onChange={e => setPayData({ bankId: e.target.value })} className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-white outline-none focus:border-blue-500 appearance-none font-medium cursor-pointer">
                  <option value="" disabled>-- Pilih Rekening / Dompet --</option>
                  {banks.map(b => (
                    <option key={b.id} value={b.id}>{b.name} (Saldo: Rp {Number(b.balance).toLocaleString('id-ID')})</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-3 mt-6">
                <button type="button" onClick={() => setShowPayModal(false)} className="flex-1 py-3 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold rounded-xl hover:bg-slate-200 cursor-pointer transition-colors">Batal</button>
                <button type="submit" className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-lg cursor-pointer transition-colors">Konfirmasi</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CUSTOM TOAST */}
      <div className={`fixed top-4 md:p-8 left-1/2 -translate-x-1/2 z-[100] transition-all duration-500 transform ${showToast.show ? 'translate-y-0 opacity-100' : '-translate-y-10 opacity-0 pointer-events-none'}`}>
        <div className={`${showToast.type === 'success' ? 'bg-slate-800' : 'bg-red-600'} text-white px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-3`}>
          {showToast.type === 'success' ? <CheckCircle2 size={20} className="text-emerald-400" /> : <AlertCircle size={20} className="text-white" />}
          <p className="font-bold text-sm">{showToast.message}</p>
        </div>
      </div>

      {/* DELETE CONFIRMATION MODAL */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-sm p-4 md:p-8 border border-slate-200 dark:border-slate-800 shadow-2xl text-center">
            <div className="w-20 h-20 bg-red-50 dark:bg-red-500/10 text-red-500 rounded-full flex items-center justify-center mx-auto mb-6">
              <Trash2 size={40} />
            </div>
            <h3 className="text-2xl font-bold text-slate-800 dark:text-white mb-2">Hapus Tagihan?</h3>
            <p className="text-slate-500 dark:text-slate-400 mb-8">Apakah Anda yakin ingin menghapus tagihan ini secara permanen?</p>
            <div className="flex gap-3">
              <button onClick={() => setShowDeleteModal(false)} className="flex-1 py-3 px-4 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer">Batal</button>
              <button onClick={confirmDelete} className="flex-1 py-3 px-4 bg-red-500 hover:bg-red-600 text-white font-bold rounded-xl shadow-lg shadow-red-500/30 transition-colors cursor-pointer">Ya, Hapus</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}







