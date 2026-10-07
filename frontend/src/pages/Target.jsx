import React, { useState, useEffect, useRef } from 'react';
import { 
  Target as TargetIcon, Plus, ChevronRight, X, Image as ImageIcon, 
  UploadCloud, CheckCircle2, MoreVertical, TrendingUp, Wallet, ShieldCheck, Plane, Laptop, Home,
  Trash2, Edit, AlertCircle, Send, ArrowRightLeft, ArrowDownToLine, Users
} from 'lucide-react';

const defaultPresets = [
  { id: 'japan', url: 'https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?q=80&w=600&auto=format&fit=crop', label: 'Liburan' },
  { id: 'macbook', url: 'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?q=80&w=600&auto=format&fit=crop', label: 'Gadget' },
  { id: 'house', url: 'https://images.unsplash.com/photo-1518780664697-55e3ad937233?q=80&w=600&auto=format&fit=crop', label: 'Rumah' },
  { id: 'car', url: 'https://images.unsplash.com/photo-1494976388531-d1058494cdd8?q=80&w=600&auto=format&fit=crop', label: 'Kendaraan' },
  { id: 'emergency', url: 'https://images.unsplash.com/photo-1607863680198-23d4b2565df0?q=80&w=600&auto=format&fit=crop', label: 'Darurat' }
];

export default function Target() {
  const [targets, setTargets] = useState([]);
  const [bankList, setBankList] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchTargets = async () => {
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL || `http://${window.location.hostname}/BUDGETIN/api`}/financial/react_target.php`);
      const data = await res.json();
      if (data.success && data.data) {
        setTargets(data.data.map(t => ({
          ...t,
          id: Number(t.id), shared_with_email: t.shared_with_email, share_status: t.share_status,
          target: Number(t.target_amount),
          current: Number(t.current_amount),
          image: t.image_url,
          history: t.history ? JSON.parse(t.history) : []
        })));
      }
    } catch(e) {
      console.error(e);
    }
  };
  
  useEffect(() => {
    const fetchBanks = async () => {
      try {
        const res = await fetch(`${import.meta.env.VITE_API_URL || `http://${window.location.hostname}/BUDGETIN/api`}/financial/react_bank.php`);
        const data = await res.json();
        if (data.success && data.data) {
          setBankList(data.data);
          if(data.data.length > 0) setTopUpWallet(data.data[0].name);
        }
      } catch (e) {
        console.error(e);
      }
    };
    fetchBanks();
    fetchTargets().then(() => setIsLoading(false));
  }, []);

  // Modal States
  const [showAddModal, setShowAddModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showDetailDrawer, setShowDetailDrawer] = useState(false);
  const [selectedTarget, setSelectedTarget] = useState(null);

  // Transfer State
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferAmount, setTransferAmount] = useState('');
  const [transferTargetId, setTransferTargetId] = useState('');
  const [transferError, setTransferError] = useState('');

  // Delete State
  const [deleteAction, setDeleteAction] = useState('refund'); // 'refund' | 'transfer'
  const [deleteRefundWallet, setDeleteRefundWallet] = useState('');
  const [deleteTransferTargetId, setDeleteTransferTargetId] = useState('');

  // Form State
  const [formData, setFormData] = useState({ name: '', target: '', current: '', image: defaultPresets[0].url, shared_with_email: '', isCoupleGoal: false });
  const [imageType, setImageType] = useState('preset'); 
  
  // Top Up State
  const [topUpAmount, setTopUpAmount] = useState('');
  const [topUpWallet, setTopUpWallet] = useState('');
  const [topUpError, setTopUpError] = useState('');

    // Dropdown Menu State
  const [showMenu, setShowMenu] = useState(false);

  // AI Planner States
  const [plannerMode, setPlannerMode] = useState('date');
  const [plannerMonth, setPlannerMonth] = useState(new Date().getMonth() + 2 > 12 ? 1 : new Date().getMonth() + 2);
  const [plannerYear, setPlannerYear] = useState(new Date().getMonth() + 2 > 12 ? new Date().getFullYear() + 1 : new Date().getFullYear());
  const [plannerBudget, setPlannerBudget] = useState('');

  const calculateDatePlanner = () => {
    if(!selectedTarget) return { monthly: 0, daily: 0, monthsLeft: 0 };
    const remains = Math.max(0, selectedTarget.target - selectedTarget.current);
    const now = new Date();
    const targetDate = new Date(plannerYear, plannerMonth - 1, 1);
    
    let monthsLeft = (targetDate.getFullYear() - now.getFullYear()) * 12 + (targetDate.getMonth() - now.getMonth());
    if (monthsLeft <= 0) monthsLeft = 1;
    
    const monthly = remains / monthsLeft;
    const daily = monthly / 30;
    return { monthly, daily, monthsLeft };
  };

  const calculateBudgetPlanner = () => {
    if(!selectedTarget) return { date: null, monthsLeft: 0 };
    const remains = Math.max(0, selectedTarget.target - selectedTarget.current);
    const budget = Number(plannerBudget) || 1;
    
    const monthsLeft = Math.ceil(remains / budget);
    const date = new Date();
    date.setMonth(date.getMonth() + monthsLeft);
    return { date, monthsLeft };
  };

  const handleOpenDetail = (t) => {
    setSelectedTarget(t);
    setShowDetailDrawer(true);
    setShowMenu(false);
    setTopUpAmount('');
    setTopUpError('');
  };

    const handleTargetAmountChange = (e) => {
    const val = e.target.value.replace(/[^0-9]/g, '');
    setFormData({...formData, target: val});
  };
  const handleCurrentAmountChange = (e) => {
    const val = e.target.value.replace(/[^0-9]/g, '');
    setFormData({...formData, current: val});
  };
  const handleTopUpAmountChange = (e) => {
    setTopUpAmount(e.target.value.replace(/[^0-9]/g, ''));
  };
  const handleTransferAmountChange = (e) => {
    setTransferAmount(e.target.value.replace(/[^0-9]/g, ''));
  };

  const handleSaveTarget = async (e) => {
    e.preventDefault();
    
    const payload = {
      name: formData.name,
      target_amount: Number(formData.target),
      current_amount: Number(formData.current) || 0,
      target_date: new Date().getFullYear().toString(),
      image_url: formData.image,
        shared_with_email: formData.isCoupleGoal ? formData.shared_with_email : ''
      };

    try {
      if (isEditing) {
        payload.history = JSON.stringify(selectedTarget.history || []);
        await fetch(`${import.meta.env.VITE_API_URL || `http://${window.location.hostname}/BUDGETIN/api`}/financial/react_target.php?id=${selectedTarget.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      } else {
        payload.history = JSON.stringify([]);
        await fetch(`${import.meta.env.VITE_API_URL || `http://${window.location.hostname}/BUDGETIN/api`}/financial/react_target.php`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      }
      setShowAddModal(false);
      fetchTargets();
      if(isEditing) {
        setSelectedTarget({ ...selectedTarget, name: payload.name, target: payload.target_amount, current: payload.current_amount, image: payload.image_url });
      }
    } catch(err) {
      console.error(err);
    }
  };
  
  const handleConfirmDelete = async () => {
    if (selectedTarget.current > 0) {
      if (deleteAction === 'refund') {
        const wallet = deleteRefundWallet || (bankList[0]?.name || 'BCA Utama');
        // POST to refund
        try {
          await fetch(`${import.meta.env.VITE_API_URL || `http://${window.location.hostname}/BUDGETIN/api`}/financial/react_transaction.php`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              amount: selectedTarget.current,
              type: 'income',
              category: 'other',
              wallet: wallet,
              note: `Refund Hapus Target: ${selectedTarget.name}`
            })
          });
        } catch (e) {
          console.error("Refund failed", e);
        }
      } else if (deleteAction === 'transfer') {
        if (deleteTransferTargetId) {
          const targetToReceive = targets.find(t => t.id === Number(deleteTransferTargetId));
          if(targetToReceive) {
            const newHistory = [{
              id: Date.now(), date: new Date().toISOString(), amount: selectedTarget.current, 
              note: `Limpahan dari ${selectedTarget.name}`, wallet: 'Internal Transfer'
            }, ...(targetToReceive.history || [])];
            
            await fetch(`${import.meta.env.VITE_API_URL || `http://${window.location.hostname}/BUDGETIN/api`}/financial/react_target.php?id=${targetToReceive.id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                current_amount: targetToReceive.current + selectedTarget.current,
                history: JSON.stringify(newHistory)
              })
            });
          }
        }
      }
    }
    
    await fetch(`${import.meta.env.VITE_API_URL || `http://${window.location.hostname}/BUDGETIN/api`}/financial/react_target.php?id=${selectedTarget.id}`, { method: 'DELETE' });
    
    setShowDeleteModal(false);
    setShowDetailDrawer(false);
    fetchTargets();
  };

  const handleTransfer = async (e) => {
    e.preventDefault();
    setTransferError('');
    const amt = Number(transferAmount);
    if(amt > selectedTarget.current) return setTransferError('Nominal melebihi saldo target saat ini!');
    if(!transferTargetId) return setTransferError('Pilih target tujuan!');

    const targetToReceive = targets.find(t => t.id === Number(transferTargetId));
    
    const senderHistory = [{ id: Date.now(), date: new Date().toISOString(), amount: -amt, note: `Transfer keluar ke ${targetToReceive.name}`, wallet: 'Internal' }, ...(selectedTarget.history || [])];
    const receiverHistory = [{ id: Date.now()+1, date: new Date().toISOString(), amount: amt, note: `Transfer masuk dari ${selectedTarget.name}`, wallet: 'Internal' }, ...(targetToReceive.history || [])];

    try {
      await fetch(`${import.meta.env.VITE_API_URL || `http://${window.location.hostname}/BUDGETIN/api`}/financial/react_target.php?id=${selectedTarget.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ current_amount: selectedTarget.current - amt, history: JSON.stringify(senderHistory) })
      });
      
      await fetch(`${import.meta.env.VITE_API_URL || `http://${window.location.hostname}/BUDGETIN/api`}/financial/react_target.php?id=${targetToReceive.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ current_amount: targetToReceive.current + amt, history: JSON.stringify(receiverHistory) })
      });

      setShowTransferModal(false);
      setTransferAmount('');
      fetchTargets();
      setSelectedTarget({ ...selectedTarget, current: selectedTarget.current - amt, history: senderHistory });
    } catch(err) {
      console.error(err);
    }
  };

  const handleEditClick = () => {
    setIsEditing(true);
    setFormData({ name: selectedTarget.name, target: selectedTarget.target, current: selectedTarget.current, image: selectedTarget.image, shared_with_email: selectedTarget.shared_with_email || '', isCoupleGoal: !!selectedTarget.shared_with_email });
    setImageType(defaultPresets.find(p => p.url === selectedTarget.image) ? 'preset' : 'upload');
    setShowMenu(false);
    setShowAddModal(true);
  };

  const handleTopUp = async (e) => {
    e.preventDefault();
    setTopUpError('');
    if(!topUpAmount) return;
    
    const amount = Number(topUpAmount);
    
    const selectedBank = bankList.find(b => b.name === topUpWallet);
    if (selectedBank) {
      const balance = Number(selectedBank.balance);
      if (amount > balance) return setTopUpError(`Saldo tidak mencukupi. Sisa saldo ${topUpWallet}: Rp ${balance.toLocaleString('id-ID')}`);
    }

    const newHistory = {
      id: Date.now(),
      date: new Date().toISOString(),
      amount: amount,
      note: 'Top up manual',
      wallet: topUpWallet || 'Dompet'
    };

    const finalHistory = [newHistory, ...(selectedTarget.history || [])];

    try {
      await fetch(`${import.meta.env.VITE_API_URL || `http://${window.location.hostname}/BUDGETIN/api`}/financial/react_target.php?id=${selectedTarget.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          current_amount: selectedTarget.current + amount,
          history: JSON.stringify(finalHistory)
        })
      });

      if (selectedBank) {
        await fetch(`${import.meta.env.VITE_API_URL || `http://${window.location.hostname}/BUDGETIN/api`}/financial/react_transaction.php`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            amount: amount,
            type: 'expense',
            category: 'other',
            wallet: topUpWallet,
            note: `Isi Target: ${selectedTarget.name}`
          })
        });
      }

      setTopUpAmount('');
      fetchTargets();
      setSelectedTarget({ ...selectedTarget, current: selectedTarget.current + amount, history: finalHistory });
    } catch(err) {
      console.error(err);
    }
  };

  const calculateProgress = (current, target) => Math.min(Math.round((current / target) * 100), 100);
  const formatDate = (isoStr) => {
    const d = new Date(isoStr);
    return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) + ' WIB';
  };

  if (isLoading) {
    return <div className="flex items-center justify-center h-[60vh]"><div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div></div>;
  }

  return (
    <div className="w-full 2xl:max-w-screen-2xl mx-auto space-y-6 animate-in fade-in duration-500 pb-20">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-6 md:mb-8 gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-extrabold text-slate-800 dark:text-white leading-tight">Target Tabungan</h1>
            <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">Wujudkan impianmu satu per satu.</p>
          </div>
          <div className="flex flex-wrap gap-2.5 items-center">
            <button 
              onClick={() => { setIsEditing(false); setFormData({ name: '', target: '', current: '', image: defaultPresets[0].url, shared_with_email: '', isCoupleGoal: false }); setImageType('preset'); setShowAddModal(true); }}
              className="flex-none w-auto inline-flex items-center justify-center gap-1.5 md:gap-2 px-4 md:px-5 py-2.5 md:py-3 bg-blue-600 text-white rounded-2xl hover:bg-blue-700 transition-all font-bold cursor-pointer shadow-lg shadow-blue-500/30 transform hover:-translate-y-1 text-xs md:text-sm whitespace-nowrap"
            >
              <Plus size={18} strokeWidth={3} /> Buat Target Baru
            </button>
          </div>
        </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 md:p-6">
        {targets.map((item) => {
          const progress = calculateProgress(item.current, item.target);
          const isCompleted = progress >= 100;
          return (
            <div 
              key={item.id} 
              onClick={() => handleOpenDetail(item)}
              className="relative h-64 rounded-3xl overflow-hidden shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 cursor-pointer group"
            >
              {/* Background Image */}
              <div 
                className="absolute inset-0 bg-cover bg-center transition-transform duration-700 group-hover:scale-110"
                style={{ backgroundImage: `url(${item.image})` }}
              ></div>
              {/* Gradient Overlay */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-black/10"></div>
              
              {/* Content */}
              <div className="absolute inset-0 p-4 md:p-6 flex flex-col justify-end text-white">
                <div className="flex justify-between items-end mb-2">
                  <div>
                    <h3 className="text-2xl font-bold mb-1 shadow-sm flex items-center gap-2">
  {item.name} 
  {item.shared_with_email && <Users size={18} className="text-pink-300 drop-shadow-md" title="Couple Goal" />}
</h3>
                    <p className="text-white/80 font-medium">Rp {item.current.toLocaleString('id-ID')} <span className="text-white/50 text-sm">/ Rp {item.target.toLocaleString('id-ID')}</span></p>
                  </div>
                  <div className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-md border border-white/30 flex items-center justify-center font-bold shadow-sm">
                    {progress}%
                  </div>
                </div>
                
                {/* Progress Bar */}
                <div className="mt-4 h-2 w-full bg-white/20 rounded-full overflow-hidden backdrop-blur-sm">
                  <div 
                    className={`h-full rounded-full transition-all duration-1000 ${isCompleted ? 'bg-emerald-400' : 'bg-blue-400'}`}
                    style={{ width: `${progress}%` }}
                  ></div>
                </div>
              </div>

              {isCompleted && (
                <div className="absolute top-4 right-4 bg-emerald-500 text-white px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1 shadow-lg">
                  <CheckCircle2 size={14} /> Tercapai
                </div>
              )}
            </div>
          );
        })}
        {targets.length === 0 && (
          <div className="col-span-full flex flex-col items-center justify-center p-12 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-3xl">
             <div className="w-16 h-16 bg-slate-50 dark:bg-slate-800 rounded-full flex items-center justify-center text-slate-400 mb-4">
                <TargetIcon size={32} />
             </div>
             <p className="text-slate-500 dark:text-slate-400 font-medium">Belum ada target tabungan.</p>
          </div>
        )}
      </div>

      {/* MODAL BUAT TARGET BARU */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-10 duration-300">
            <div className="flex justify-between items-center p-4 md:p-6 border-b border-slate-100 dark:border-slate-800">
              <h2 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
                <TargetIcon className="text-blue-500" /> {isEditing ? 'Edit Target Tabungan' : 'Buat Target Baru'}
              </h2>
              <button onClick={() => setShowAddModal(false)} className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 bg-slate-100 dark:bg-slate-800 rounded-full cursor-pointer transition-colors">
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleSaveTarget} className="p-4 md:p-6 space-y-6">
              <div>
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">Nama Target (Impian)</label>
                <input 
                  type="text" required
                  value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})}
                  className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-medium text-slate-800 dark:text-white"
                  placeholder="Misal: Liburan Korea, DP Rumah"
                />
              </div>

              
                <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-sm font-bold text-slate-800 dark:text-white flex items-center gap-2">
                        <Users size={16} className="text-pink-500" /> Couple Goals
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400">Nabung bareng pasangan</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" className="sr-only peer" checked={formData.isCoupleGoal} onChange={e => setFormData({...formData, isCoupleGoal: e.target.checked})} />
                      <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-slate-600 peer-checked:bg-pink-500"></div>
                    </label>
                  </div>
                  {formData.isCoupleGoal && (
                    <div className="animate-in slide-in-from-top-2 duration-300">
                      <input 
                        type="email" 
                        value={formData.shared_with_email} 
                        onChange={e => setFormData({...formData, shared_with_email: e.target.value})}
                        className="w-full px-4 py-3 bg-pink-50 dark:bg-pink-900/10 border border-pink-200 dark:border-pink-800/50 rounded-xl outline-none focus:ring-2 focus:ring-pink-500 font-medium text-slate-800 dark:text-white"
                        placeholder="Email Pasangan (misal: ayang@gmail.com)"
                        required={formData.isCoupleGoal}
                      />
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">Target Kumpul (Rp)</label>
                  <input 
                    type="text" required
                    value={formData.target ? Number(formData.target).toLocaleString('id-ID') : ''} onChange={e => setFormData({...formData, target: e.target.value.replace(/\D/g, '')})}
                    className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-medium text-slate-800 dark:text-white"
                    placeholder="15.000.000"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">Tabungan Awal (Rp)</label>
                  <input 
                    type="text" 
                    value={formData.current ? Number(formData.current).toLocaleString('id-ID') : ''} onChange={e => setFormData({...formData, current: e.target.value.replace(/\D/g, '')})}
                    className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-medium text-slate-800 dark:text-white"
                    placeholder="0"
                  />
                </div>
              </div>

              {/* IMAGE PICKER */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="block text-sm font-bold text-slate-700 dark:text-slate-300">Gambar Cover</label>
                  <div className="flex gap-2 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
                    <button type="button" onClick={() => setImageType('preset')} className={`px-3 py-1 text-xs font-semibold rounded-md transition-all cursor-pointer ${imageType === 'preset' ? 'bg-white dark:bg-slate-700 shadow-sm text-blue-600 dark:text-blue-400' : 'text-slate-500'}`}>Koleksi Web</button>
                    <button type="button" onClick={() => setImageType('upload')} className={`px-3 py-1 text-xs font-semibold rounded-md transition-all cursor-pointer ${imageType === 'upload' ? 'bg-white dark:bg-slate-700 shadow-sm text-blue-600 dark:text-blue-400' : 'text-slate-500'}`}>Upload Sendiri</button>
                  </div>
                </div>

                {imageType === 'preset' ? (
                  <div className="grid grid-cols-5 gap-2">
                    {defaultPresets.map(preset => (
                      <div 
                        key={preset.id}
                        onClick={() => setFormData({...formData, image: preset.url})}
                        className={`relative aspect-square rounded-xl overflow-hidden cursor-pointer border-2 transition-all ${formData.image === preset.url ? 'border-blue-500 shadow-md scale-105 z-10' : 'border-transparent hover:opacity-80'}`}
                      >
                        <img src={preset.url} alt={preset.label} className="w-full h-full object-cover" />
                        {formData.image === preset.url && (
                          <div className="absolute inset-0 bg-blue-500/20 flex items-center justify-center">
                            <CheckCircle2 className="text-white drop-shadow-md" size={24} />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-xl p-4 md:p-8 flex flex-col items-center justify-center text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer group relative overflow-hidden">
                    <UploadCloud size={40} className="mb-2 group-hover:text-blue-500 transition-colors" />
                    <p className="font-semibold text-sm">Klik untuk upload gambar</p>
                    <p className="text-xs mt-1">JPG, PNG, WEBP (Max 2MB)</p>
                    <input 
                      type="file" 
                      accept="image/*" 
                      className="absolute inset-0 opacity-0 cursor-pointer"
                      onChange={(e) => {
                        const file = e.target.files[0];
                        if(file) {
                          const url = URL.createObjectURL(file);
                          setFormData({...formData, image: url});
                        }
                      }}
                    />
                    {formData.image && imageType === 'upload' && !defaultPresets.find(p => p.url === formData.image) && (
                      <div className="absolute inset-0">
                        <img src={formData.image} alt="Upload preview" className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                          <UploadCloud size={30} className="text-white mb-2" />
                          <span className="text-white font-bold text-sm">Ganti Gambar</span>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <button type="submit" className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-lg shadow-blue-600/30 transition-all cursor-pointer">
                {isEditing ? 'Simpan Perubahan' : 'Simpan Target Tabungan'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* SLIDE-OVER DRAWER DETAIL TARGET */}
      {showDetailDrawer && selectedTarget && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-slate-900/20 backdrop-blur-sm animate-in fade-in duration-300"
            onClick={() => setShowDetailDrawer(false)}
          ></div>
          
          {/* Drawer Panel */}
          <div className="relative w-full max-w-md bg-white dark:bg-slate-900 h-full shadow-2xl animate-in slide-in-from-right duration-500 flex flex-col">
            
            {/* Header Image */}
            <div className="relative h-64 shrink-0">
              <img src={selectedTarget.image} alt="Cover" className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/40 to-transparent"></div>
              
              <button 
                onClick={() => setShowDetailDrawer(false)} 
                className="absolute top-4 md:p-6 left-6 p-2 bg-black/20 hover:bg-black/40 backdrop-blur-md rounded-full text-white transition-colors cursor-pointer"
              >
                <ChevronRight size={24} className="rotate-180" />
              </button>

              <div className="absolute top-4 md:p-6 right-6 z-10">
                <button 
                  onClick={() => setShowMenu(!showMenu)}
                  className="p-2 bg-black/20 hover:bg-black/40 backdrop-blur-md rounded-full text-white transition-colors cursor-pointer"
                >
                  <MoreVertical size={20} />
                </button>
                {showMenu && (
                  <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-slate-800 rounded-xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95 origin-top-right border border-slate-100 dark:border-slate-700">
                    <button 
                      onClick={handleEditClick}
                      className="w-full px-4 py-3 text-left text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors flex items-center gap-2 cursor-pointer"
                    >
                      <Edit size={16} /> Edit Target
                    </button>
                    <button 
                      onClick={() => { setShowMenu(false); setShowTransferModal(true); }}
                      className="w-full px-4 py-3 text-left text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors flex items-center gap-2 cursor-pointer"
                    >
                      <ArrowRightLeft size={16} /> Pindah Saldo
                    </button>
                    <button 
                      onClick={() => { setShowMenu(false); setShowDeleteModal(true); }}
                      className="w-full px-4 py-3 text-left text-sm font-semibold text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors flex items-center gap-2 cursor-pointer"
                    >
                      <Trash2 size={16} /> Hapus Target
                    </button>
                  </div>
                )}
              </div>

              <div className="absolute bottom-6 left-6 right-6 text-white">
                <h2 className="text-3xl font-extrabold shadow-sm">{selectedTarget.name}</h2>
                <p className="text-white/80 font-medium flex items-center gap-2 mt-1">
                  <TargetIcon size={16} /> Rp {selectedTarget.target.toLocaleString('id-ID')}
                </p>
              </div>
            </div>

            {/* Content Scrollable */}
            <div className="flex-1 overflow-y-auto p-4 md:p-6 custom-scrollbar">
              
              {/* Progress Big Ring (Simulated with div) */}
              <div className="bg-slate-50 dark:bg-slate-800/50 rounded-3xl p-4 md:p-6 border border-slate-100 dark:border-slate-800 mb-8 text-center flex flex-col items-center relative overflow-hidden">
                <div className="relative w-40 h-40 flex items-center justify-center">
                  <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                    <circle cx="50" cy="50" r="45" fill="none" stroke="currentColor" strokeWidth="8" className="text-slate-200 dark:text-slate-700" />
                    <circle 
                      cx="50" cy="50" r="45" fill="none" stroke="currentColor" strokeWidth="8" 
                      strokeLinecap="round"
                      className="text-blue-500 drop-shadow-md transition-all duration-1000 ease-out"
                      strokeDasharray="283" 
                      strokeDashoffset={283 - (283 * calculateProgress(selectedTarget.current, selectedTarget.target)) / 100}
                    />
                  </svg>
                  <div className="absolute flex flex-col items-center">
                    <span className="text-4xl font-black text-slate-800 dark:text-white">{calculateProgress(selectedTarget.current, selectedTarget.target)}%</span>
                    <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Tercapai</span>
                  </div>
                </div>

                <div className="mt-6 w-full flex justify-between px-2">
                  <div className="text-left">
                    <p className="text-xs font-bold text-slate-400 uppercase">Terkumpul</p>
                    <p className="font-extrabold text-slate-800 dark:text-white">Rp {(selectedTarget.current / 1000000).toFixed(1)} JT</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-bold text-slate-400 uppercase">Kekurangan</p>
                    <p className="font-extrabold text-red-500">Rp {(Math.max(0, selectedTarget.target - selectedTarget.current) / 1000000).toFixed(1)} JT</p>
                  </div>
                </div>
              </div>

                            {/* AI PLANNER WIDGET */}
              <div className="mb-8 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-3xl p-4 md:p-6 text-white shadow-xl shadow-purple-500/20 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none">
                  <TargetIcon size={120} />
                </div>
                <div className="relative z-10">
                  <h3 className="font-extrabold text-lg flex items-center gap-2 mb-4">
                    <TrendingUp size={20} className="text-purple-200" /> Smart Planner
                  </h3>
                  
                  {/* Tabs */}
                  <div className="flex bg-white/10 p-1 rounded-xl mb-5">
                    <button onClick={() => setPlannerMode('date')} className={`flex-1 py-2 text-xs font-bold rounded-lg transition-colors ${plannerMode === 'date' ? 'bg-white text-purple-600 shadow-sm' : 'text-purple-100 hover:bg-white/10'}`}>Target Tanggal</button>
                    <button onClick={() => setPlannerMode('budget')} className={`flex-1 py-2 text-xs font-bold rounded-lg transition-colors ${plannerMode === 'budget' ? 'bg-white text-purple-600 shadow-sm' : 'text-purple-100 hover:bg-white/10'}`}>Target Budget</button>
                  </div>

                  {plannerMode === 'date' ? (
                    <div className="space-y-4 animate-in fade-in slide-in-from-right-4">
                      <div className="flex gap-2">
                        <select value={plannerMonth} onChange={e=>setPlannerMonth(Number(e.target.value))} className="w-1/2 p-2 bg-white/10 border border-white/20 rounded-lg text-sm font-bold text-white outline-none cursor-pointer">
                          {['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Ags', 'Sep', 'Okt', 'Nov', 'Des'].map((m, i) => <option key={i} value={i+1} className="text-slate-800">{m}</option>)}
                        </select>
                        <select value={plannerYear} onChange={e=>setPlannerYear(Number(e.target.value))} className="w-1/2 p-2 bg-white/10 border border-white/20 rounded-lg text-sm font-bold text-white outline-none cursor-pointer">
                          {[0,1,2,3,4,5].map(y => <option key={y} value={new Date().getFullYear() + y} className="text-slate-800">{new Date().getFullYear() + y}</option>)}
                        </select>
                      </div>
                      
                      <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-xl p-4">
                        <p className="text-xs text-purple-200 font-medium mb-2">Sisa {calculateDatePlanner().monthsLeft} Bulan. Kamu harus menabung minimal:</p>
                        <div className="flex justify-between items-end border-b border-white/10 pb-2 mb-2">
                          <span className="text-xs font-bold text-purple-100">Per Bulan</span>
                          <span className="text-lg font-black">Rp {Math.round(calculateDatePlanner().monthly).toLocaleString('id-ID')}</span>
                        </div>
                        <div className="flex justify-between items-end">
                          <span className="text-xs font-bold text-purple-100">Per Hari</span>
                          <span className="text-lg font-black">Rp {Math.round(calculateDatePlanner().daily).toLocaleString('id-ID')}</span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4 animate-in fade-in slide-in-from-right-4">
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold text-purple-200">Rp</span>
                        <input 
                          type="text" value={plannerBudget ? Number(plannerBudget).toLocaleString('id-ID') : ''} 
                          onChange={e=>setPlannerBudget(e.target.value.replace(/\D/g, ''))}
                          className="w-full pl-10 p-2.5 bg-white/10 border border-white/20 rounded-lg text-sm font-bold text-white outline-none placeholder-purple-300"
                          placeholder="Kapasitas nabung / bulan"
                        />
                      </div>
                      
                      <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-xl p-4">
                        <p className="text-xs text-purple-200 font-medium mb-1">Target akan tercapai pada:</p>
                        <h4 className="text-xl font-black mb-1">
                          {calculateBudgetPlanner().date ? 
                            calculateBudgetPlanner().date.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' }) : '-'}
                        </h4>
                        <p className="text-xs font-bold text-purple-100">Butuh waktu sekitar {calculateBudgetPlanner().monthsLeft} Bulan lagi.</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Action: Top Up */}
              <h3 className="font-bold text-slate-800 dark:text-white mb-4">Top Up Target Ini</h3>
              <form onSubmit={handleTopUp} className="flex flex-col gap-3 mb-8">
                
                {topUpError && (
                  <div className="p-3 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-sm font-semibold rounded-xl flex items-start gap-2 animate-in slide-in-from-top-2">
                    <AlertCircle size={18} className="shrink-0 mt-0.5" />
                    {topUpError}
                  </div>
                )}

                <div className="flex gap-3">
                  <div className="relative flex-1">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 font-bold text-slate-400">Rp</span>
                    <input 
                      type="text" required
                      value={topUpAmount ? Number(topUpAmount).toLocaleString('id-ID') : ''} onChange={(e) => {
                        setTopUpAmount(e.target.value.replace(/\D/g, ''));
                        if(topUpError) setTopUpError(''); // Clear error on typing
                      }}
                      className={`w-full pl-12 pr-4 py-3 bg-slate-50 dark:bg-slate-800 border ${topUpError ? 'border-red-400 ring-4 ring-red-500/10' : 'border-slate-200 dark:border-slate-700'} rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-bold text-slate-800 dark:text-white transition-all`}
                      placeholder="500000"
                    />
                  </div>
                  <button type="submit" className="px-6 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-lg shadow-blue-500/20 transition-all cursor-pointer flex items-center gap-2 shrink-0">
                    <Plus size={20} /> Isi
                  </button>
                </div>
                
                {/* Select Source Wallet/Bank */}
                <select 
                  value={topUpWallet} 
                  onChange={e => {
                    setTopUpWallet(e.target.value);
                    if(topUpError) setTopUpError('');
                  }}
                  className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-blue-500 font-medium cursor-pointer"
                >
                  <option value="" disabled>Pilih Sumber Rekening</option>
                  {bankList.map(bank => (
                    <option key={bank.id} value={bank.name}>{bank.name} - Rp {Number(bank.balance).toLocaleString('id-ID')}</option>
                  ))}
                  <option value="Dompet">Dompet Cash</option>
                </select>
              </form>

              {/* History Data */}
              <h3 className="font-bold text-slate-800 dark:text-white mb-4">Riwayat Tabungan</h3>
              <div className="space-y-4 pb-8">
                {selectedTarget.history && selectedTarget.history.length > 0 ? (
                  selectedTarget.history.map(item => (
                    <div key={item.id} className="flex items-center gap-4 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600 transition-colors">
                      <div className="w-12 h-12 shrink-0 rounded-xl bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                        <TrendingUp size={20} />
                      </div>
                      <div className="flex-1 overflow-hidden">
                        <p className="font-bold text-slate-700 dark:text-slate-200 text-sm truncate">{item.note}</p>
                        <p className="text-xs text-slate-400 truncate">{formatDate(item.date)} &bull; {item.wallet}</p>
                      </div>
                      <div className={`font-bold shrink-0 ${item.amount < 0 ? "text-red-500" : "text-emerald-500"}`}>{item.amount < 0 ? "-" : "+"} Rp {Math.abs(item.amount).toLocaleString("id-ID")}</div>
                    </div>
                  ))
                ) : (
                  <div className="text-center p-4 md:p-6 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-2xl">
                    <p className="text-slate-500 dark:text-slate-400 text-sm font-medium">Belum ada riwayat tabungan.</p>
                  </div>
                )}
              </div>
            </div>

          </div>
        </div>
      )}

      
      {/* MODAL PINDAH SALDO */}
      {showTransferModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-3xl shadow-2xl p-4 md:p-6 animate-in zoom-in-95 duration-300">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
                <ArrowRightLeft className="text-blue-500" /> Pindah Saldo
              </h3>
              <button onClick={() => setShowTransferModal(false)} className="text-slate-400 hover:text-slate-600"><X size={20}/></button>
            </div>
            
            <form onSubmit={handleTransfer} className="space-y-4">
              {transferError && <p className="text-red-500 text-sm font-bold">{transferError}</p>}
              
              <div>
                <label className="block text-sm font-bold text-slate-500 mb-2">Pindah Dari</label>
                <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 font-bold text-slate-700 dark:text-slate-300">
                  {selectedTarget?.name} (Rp {selectedTarget?.current.toLocaleString('id-ID')})
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-500 mb-2">Pindah Ke Target</label>
                <select 
                  required value={transferTargetId} onChange={e=>setTransferTargetId(e.target.value)}
                  className="w-full p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 font-bold text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="" disabled>Pilih Target Tujuan...</option>
                  {targets.filter(t => t.id !== selectedTarget?.id).map(t => (
                    <option key={t.id} value={t.id}>{t.name} (Saldo: Rp {t.current.toLocaleString('id-ID')})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-500 mb-2">Nominal Pindah (Rp)</label>
                <input 
                  type="text" required value={transferAmount ? Number(transferAmount).toLocaleString('id-ID') : ''} onChange={e=>setTransferAmount(e.target.value.replace(/\D/g, ''))}
                  className="w-full p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 font-bold text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Misal: 500000"
                />
              </div>

              <button type="submit" className="w-full mt-4 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-lg shadow-blue-500/30 transition-colors flex items-center justify-center gap-2">
                <Send size={18} /> Transfer Sekarang
              </button>
            </form>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-3xl shadow-2xl p-4 md:p-6 animate-in zoom-in-95 duration-300">
            <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-full flex items-center justify-center mx-auto mb-4">
              <Trash2 size={32} />
            </div>
            <h3 className="text-xl font-bold text-slate-800 dark:text-white text-center mb-2">Hapus Target?</h3>
            <p className="text-slate-500 dark:text-slate-400 text-sm text-center mb-6">
              Kamu akan menghapus target <b>{selectedTarget?.name}</b>.
            </p>
            
            {selectedTarget?.current > 0 ? (
              <div className="mb-6 space-y-4">
                <div className="p-4 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-xl">
                  <p className="text-orange-800 dark:text-orange-300 text-sm font-bold mb-3">Terdapat sisa saldo Rp {selectedTarget.current.toLocaleString('id-ID')}. Mau dikemanakan?</p>
                  
                  <div className="flex flex-col gap-2">
                    <label className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800">
                      <input type="radio" name="deleteAction" value="refund" checked={deleteAction === 'refund'} onChange={() => setDeleteAction('refund')} className="w-4 h-4 text-blue-600" />
                      <span className="font-semibold text-slate-700 dark:text-slate-300">Kembalikan ke Rekening</span>
                    </label>
                    {deleteAction === 'refund' && (
                      <select value={deleteRefundWallet} onChange={e=>setDeleteRefundWallet(e.target.value)} className="ml-7 p-2 text-sm bg-white dark:bg-slate-900 border rounded-lg outline-none">
                        <option value="">Pilih Rekening Tujuan...</option>
                        {bankList.map(b => <option key={b.id} value={b.name}>{b.name}</option>)}
                      </select>
                    )}

                    <label className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800">
                      <input type="radio" name="deleteAction" value="transfer" checked={deleteAction === 'transfer'} onChange={() => setDeleteAction('transfer')} className="w-4 h-4 text-blue-600" />
                      <span className="font-semibold text-slate-700 dark:text-slate-300">Pindahkan ke Target Lain</span>
                    </label>
                    {deleteAction === 'transfer' && (
                      <select value={deleteTransferTargetId} onChange={e=>setDeleteTransferTargetId(e.target.value)} className="ml-7 p-2 text-sm bg-white dark:bg-slate-900 border rounded-lg outline-none">
                        <option value="">Pilih Target...</option>
                        {targets.filter(t => t.id !== selectedTarget?.id).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </select>
                    )}
                  </div>
                </div>
              </div>
            ) : null}

            <div className="flex gap-3 mt-2">
              <button onClick={() => setShowDeleteModal(false)} className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold rounded-xl transition-colors cursor-pointer">
                Batal
              </button>
              <button onClick={handleConfirmDelete} className="flex-1 py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl shadow-lg shadow-red-500/30 transition-colors cursor-pointer">
                Ya, Eksekusi
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}







