import React, { useState, useEffect, useRef } from 'react';
import { 
  Plus, Search, Filter, ReceiptText, Coffee, Briefcase, Car, Home as HomeIcon, Zap, Smartphone,
  MoreVertical, X, Upload, ScanLine, Camera, ArrowDownRight, ArrowUpRight, CheckCircle2, ChevronRight,
  Trash2, AlertTriangle, FileSpreadsheet, Clock
} from 'lucide-react';

export default function Transaction() {
  const fileInputRef = useRef(null);
  const scanInputRef = useRef(null);
  const [showFilterDrawer, setShowFilterDrawer] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [txToDelete, setTxToDelete] = useState(null);
  
  // Toast & Loading State
  const [showToast, setShowToast] = useState({ show: false, message: '', type: 'success' });
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  
  // Data State
  const [dbTransactions, setDbTransactions] = useState([]);
  
  // Filter & Search State
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [filterDate, setFilterDate] = useState('all');
  const [filterBank, setFilterBank] = useState('all');
  const [banks, setBanks] = useState([]);

  // Add Transaction States
  
  const [addMode, setAddMode] = useState('manual'); // 'manual' | 'scan' | 'import'
  const [isImporting, setIsImporting] = useState(false);
  const [importPreview, setImportPreview] = useState(null);
 // 'manual' | 'scan'
  const [txType, setTxType] = useState('expense'); // 'expense' | 'income'
  const [selectedCategory, setSelectedCategory] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [scanSuccess, setScanSuccess] = useState(false);
  
  // Form State
  const [formData, setFormData] = useState({
    amount: '',
    note: '',
    wallet: ''
  });

  const getCategoryDetails = (catId) => {
    switch (catId) {
      case 'food': return { name: 'Makan/Minum', icon: <Coffee size={20} className="text-orange-500"/> };
      case 'transport': return { name: 'Transportasi', icon: <Car size={20} className="text-blue-500"/> };
      case 'groceries': return { name: 'Belanja', icon: <ReceiptText size={20} className="text-purple-500"/> };
      case 'bills': return { name: 'Tagihan', icon: <Zap size={20} className="text-yellow-500"/> };
      case 'salary': return { name: 'Gaji', icon: <Briefcase size={20} className="text-emerald-500"/> };
      default: return { name: 'Lainnya', icon: <HomeIcon size={20} className="text-slate-500"/> };
    }
  };

  const categories = [
    { id: 'food', name: 'Makan/Minum', icon: <Coffee size={24} />, color: 'bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400' },
    { id: 'transport', name: 'Transportasi', icon: <Car size={24} />, color: 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' },
    { id: 'groceries', name: 'Belanja', icon: <ReceiptText size={24} />, color: 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400' },
    { id: 'bills', name: 'Tagihan', icon: <Zap size={24} />, color: 'bg-yellow-100 text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-500' },
    { id: 'salary', name: 'Gaji', icon: <Briefcase size={24} />, color: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400', type: 'income' },
    { id: 'other', name: 'Lainnya', icon: <HomeIcon size={24} />, color: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400' },
  ];

  const fetchTransactions = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL || `http://${window.location.hostname}/BUDGETIN/api`}/financial/react_transaction.php`);
      const data = await res.json();
      if (data.success) {
        setDbTransactions(data.data);
      }
    } catch (e) {
      console.error(e);
      triggerToast('Gagal memuat transaksi', 'error');
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchTransactions();
    fetch(`${import.meta.env.VITE_API_URL || `http://${window.location.hostname}/BUDGETIN/api`}/financial/react_bank.php`)
      .then(res => res.json())
      .then(data => {
        if(data.success) setBanks(data.data);
      });
  }, []);

  const triggerToast = (message, type = 'success') => {
    setShowToast({ show: true, message, type });
    setTimeout(() => setShowToast({ show: false, message: '', type: 'success' }), 3000);
  };

  const confirmDelete = (tx) => {
    const note = tx.note || '';
    if (tx.category === 'investment' || note.includes('Pencairan Aset') || note.includes('Pembelian Aset')) {
      triggerToast('Gagal: Hapus atau jual aset ini melalui menu Investasi.', 'error');
      return;
    }
    if (tx.category === 'target' || note.includes('Top Up Target')) {
      triggerToast('Gagal: Hapus atau tarik saldo melalui menu Target Tabungan.', 'error');
      return;
    }
    setTxToDelete(tx.id);
    setShowDeleteModal(true);
  };

  const executeDelete = async () => {
    if (!txToDelete) return;
    
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL || `http://${window.location.hostname}/BUDGETIN/api`}/financial/react_transaction.php?id=${txToDelete}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        triggerToast('Transaksi dihapus & saldo dikembalikan!');
        fetchTransactions();
      } else {
        triggerToast(data.message, 'error');
      }
    } catch (e) {
      triggerToast('Error menghapus transaksi', 'error');
    } finally {
      setShowDeleteModal(false);
      setTxToDelete(null);
    }
  };

  
  const handleSimulateImport = async (file) => {
    setIsImporting(true);
    try {
      if (!file) {
        setIsImporting(false);
        return;
      }
      const reader = new FileReader();
      reader.onloadend = async () => {
        try {
          const base64Data = reader.result.split(',')[1];
          const proxyUrl = import.meta.env.VITE_API_URL || `http://${window.location.hostname}/BUDGETIN/api`;
          const proxyRes = await fetch(proxyUrl + '/financial/gemini_proxy.php', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                  base64Data,
                  mimeType: file.type || 'application/pdf',
                  prompt: 'Analyze this bank statement. Extract all transaction records. Return ONLY a valid JSON array of objects. Each object must have exactly these keys: "date" (string, YYYY-MM-DD), "desc" (string, the description), "amount" (number, positive integer), "type" (string, either "income" or "expense"), "cat" (string, guess the category: "transport", "food", "income", or "other").'
              })
          });
          const proxyJson = await proxyRes.json();
          if (proxyJson.error) throw new Error(proxyJson.error);
          const parsedData = proxyJson.result;
          setImportPreview(parsedData);
          setIsImporting(false);
        } catch (apiErr) {
          console.error(apiErr);
          setIsImporting(false);
          triggerToast('Gagal dibaca AI: ' + apiErr.message, 'error');
        }
      };
      reader.readAsDataURL(file);
    } catch (e) {
      setIsImporting(false);
      triggerToast('Gagal memproses file', 'error');
    }
  };

  const handleSaveImport = async () => {
    setIsSaving(true);
    try {
      for (const item of importPreview) {
        await fetch(`${import.meta.env.VITE_API_URL || `http://${window.location.hostname}/BUDGETIN/api`}/financial/react_transaction.php`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            amount: item.amount,
            type: item.type,
            category: item.cat,
            wallet: '',
            note: item.desc
          })
        });
      }
      setIsSaving(false);
      setImportPreview(null);
      setShowAddModal(false);
      fetchTransactions();
      triggerToast('Berhasil import ' + importPreview.length + ' transaksi ke Database!');
    } catch (e) {
      setIsSaving(false);
      triggerToast('Gagal import mutasi', 'error');
    }
  };

  const handleSimulateScan = async (file) => {
    if (!file) return;
    setIsScanning(true);
    setScanSuccess(false);
    
    try {
      const reader = new FileReader();
      reader.onloadend = async () => {
        try {
          const base64Data = reader.result.split(',')[1];
          const proxyUrl = import.meta.env.VITE_API_URL || `http://${window.location.hostname}/BUDGETIN/api`;
          const proxyRes = await fetch(proxyUrl + '/financial/gemini_proxy.php', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                  base64Data,
                  mimeType: file.type || 'image/jpeg',
                  prompt: 'Analyze this receipt image. Extract the total amount, store name, and guess the category. Return ONLY a valid JSON object with exactly these keys: "amount" (number, the final grand total), "note" (string, the store name followed by a short summary of the main items bought in parentheses, e.g., \"Indomaret (Aqua, Roti)\"), "cat" (string, must be exactly one of: "food", "transport", "groceries", "bills", or "other"). Do not use markdown format blocks like ```json. Return just the raw JSON object.'
              })
          });
          const proxyJson = await proxyRes.json();
          if (proxyJson.error) throw new Error(proxyJson.error);
          const parsedData = proxyJson.result;
          
          setFormData({
            amount: String(parsedData.amount),
            note: parsedData.note + ' (Otomatis dari Struk AI)',
            wallet: '' // default wallet
          });
          setSelectedCategory(parsedData.cat || 'other');
          setTxType('expense');

          setIsScanning(false);
          setScanSuccess(true);
          
          setTimeout(() => {
            setScanSuccess(false);
            setAddMode('manual');
            triggerToast('Berhasil mengekstrak data struk!');
          }, 1500);
        } catch (apiErr) {
          console.error(apiErr);
          setIsScanning(false);
          triggerToast('Gagal membaca gambar dengan AI', 'error');
        }
      };
      reader.readAsDataURL(file);
    } catch (e) {
      setIsScanning(false);
      triggerToast('Gagal memproses gambar', 'error');
    }
  };

  const handleSaveTransaction = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL || `http://${window.location.hostname}/BUDGETIN/api`}/financial/react_transaction.php`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          amount: formData.amount,
          type: txType,
          category: selectedCategory || 'other',
          wallet: formData.wallet,
          note: formData.note
        })
      });

      const data = await response.json();
      
      if (data.success) {
        setShowAddModal(false);
        triggerToast('Yeay! Transaksi berhasil & Saldo Terupdate 🚀');
        setFormData({ amount: '', note: '', wallet: '' });
        setSelectedCategory('');
        fetchTransactions(); // Refresh data!
      } else {
        triggerToast(data.message || 'Gagal menyimpan transaksi', 'error');
      }
    } catch (error) {
      triggerToast('Gagal terhubung ke Server PHP', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // Filter Logic Applied to Raw Data
  const getFilteredData = () => {
    let filtered = [...dbTransactions];

    // 1. Search Query Filter
    if (searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(tx => 
        (tx.note && tx.note.toLowerCase().includes(q)) || 
        (tx.category && tx.category.toLowerCase().includes(q)) ||
        (tx.wallet_name && tx.wallet_name.toLowerCase().includes(q))
      );
    }

    // 2. Type Filter
    if (filterType !== 'all') {
      filtered = filtered.filter(tx => tx.type === filterType);
    }

    // 3. Bank Filter
    if (filterBank !== 'all') {
      filtered = filtered.filter(tx => tx.wallet_name === filterBank);
    }
    // 4. Date Filter
    if (filterDate !== 'all') {
      const today = new Date();
      filtered = filtered.filter(tx => {
        const txDate = new Date(tx.transaction_date);
        const diffTime = Math.abs(today - txDate);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
        
        if (filterDate === '7days') return diffDays <= 7;
        if (filterDate === '30days') return diffDays <= 30;
        if (filterDate === 'year') return txDate.getFullYear() === today.getFullYear();
        return true;
      });
    }

    // Grouping by Date for UI
    const grouped = filtered.reduce((acc, curr) => {
      const date = curr.transaction_date;
      if (!acc[date]) acc[date] = [];
      acc[date].push(curr);
      return acc;
    }, {});
    
    const groupedArr = Object.keys(grouped).map(date => {
      const d = new Date(date);
      const formatted = d.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' });
      return { date: formatted, rawDate: date, items: grouped[date] };
    });
    
    groupedArr.sort((a, b) => new Date(b.rawDate) - new Date(a.rawDate));
    return groupedArr;
  };

  const displayData = getFilteredData();

  return (
    <div className="w-full 2xl:max-w-screen-2xl mx-auto space-y-6">
      
      {/* HEADER & SEARCH BAR */}
      <div className="flex justify-between items-center mb-8 gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" size={20} />
          <input 
            type="text" 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari transaksi..." 
            className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-white rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 dark:focus:border-blue-500 transition-all shadow-sm"
          />
        </div>
        <div className="flex gap-3">
          <button 
            onClick={() => setShowFilterDrawer(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors font-medium shadow-sm cursor-pointer relative"
          >
            <Filter size={18} /> <span className="hidden md:inline">Filter</span>
            {(filterType !== 'all' || filterDate !== 'all') && (
              <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-white dark:border-slate-900"></span>
            )}
          </button>
          <button 
            onClick={() => { setShowAddModal(true); setAddMode('manual'); }}
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors font-bold shadow-lg shadow-blue-500/30 cursor-pointer"
          >
            <Plus size={20} /> <span className="hidden md:inline">Tambah Transaksi</span>
          </button>
        </div>
      </div>

      {/* TIMELINE LIST */}
      <div className="space-y-8 min-h-[400px]">
        {isLoading ? (
          <div className="flex justify-center items-center py-20 text-slate-400">
             <div className="w-8 h-8 border-4 border-slate-200 border-t-blue-500 rounded-full animate-spin"></div>
          </div>
        ) : displayData.length === 0 ? (
          <div className="text-center py-20 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 animate-in fade-in zoom-in-95">
             <ReceiptText size={48} className="mx-auto text-slate-300 dark:text-slate-700 mb-4" />
             <h3 className="text-lg font-bold text-slate-500 dark:text-slate-400">Pencarian Tidak Ditemukan</h3>
             <p className="text-sm text-slate-400 dark:text-slate-500">Coba gunakan kata kunci atau filter lain.</p>
          </div>
        ) : (
          displayData.map((group, gIdx) => (
            <div key={gIdx} className="animate-in fade-in slide-in-from-bottom-4 duration-500" style={{ animationDelay: `${gIdx * 100}ms` }}>
              <h3 className="text-sm font-bold text-slate-400 dark:text-slate-500 mb-4 sticky top-24 bg-slate-50/80 dark:bg-slate-900/80 backdrop-blur-sm py-2 px-1 z-10">
                {group.date}
              </h3>
              
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-sm overflow-hidden divide-y divide-slate-100 dark:divide-slate-800/60 transition-colors">
                {group.items.map((tx) => {
                  const cat = getCategoryDetails(tx.category);
                  return (
                  <div key={tx.id} className="flex items-center p-3 md:p-5 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group">
                    <div className="w-8 h-8 md:w-14 md:h-14 rounded-lg md:rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 flex items-center justify-center mr-2 md:mr-5 group-hover:bg-white dark:group-hover:bg-slate-700 group-hover:shadow-sm transition-all shrink-0">
                      {cat.icon}
                    </div>
                    <div className="flex-1 min-w-0 pr-4">
                      <strong className="block text-[13px] md:text-lg leading-snug md:leading-normal text-slate-800 dark:text-white font-bold line-clamp-2 md:truncate">{tx.note || cat.name}</strong>
                      <div className="flex flex-wrap items-center gap-1 md:gap-2 mt-0.5 md:mt-1">
                        <span className="text-[11px] md:text-sm text-slate-500 dark:text-slate-400">{cat.name}</span>
                        <span className="w-1 h-1 rounded-full bg-slate-300 dark:bg-slate-600"></span>
                        <span className="text-[11px] md:text-sm font-medium text-slate-400 dark:text-slate-500">{tx.wallet_name || 'Dompet'}</span>
                        </div>
                        {tx.created_at && (
                          <div className="flex items-center gap-1 mt-1 text-[10px] md:text-[11px] text-slate-400 dark:text-slate-500 font-medium bg-slate-100 dark:bg-slate-800/80 w-fit px-1.5 py-0.5 rounded">
                            <Clock size={10} className="opacity-70" />
                            <span>{tx.created_at.split(' ')[1]?.slice(0, 5)} WIB</span>
                          </div>
                        )}
                    </div>
                    <div className="text-right shrink-0">
                      <div className={`text-[13px] md:text-lg font-bold ${tx.type === 'income' ? 'text-emerald-500' : 'text-slate-800 dark:text-white'}`}>
                        {tx.type === 'income' ? '+' : '-'}Rp {Number(tx.amount).toLocaleString('id-ID')}
                      </div>
                      <div className="flex justify-end gap-2 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => confirmDelete(tx)} className="text-xs text-red-500 hover:underline cursor-pointer font-medium flex items-center gap-1"><Trash2 size={12}/>Hapus</button>
                      </div>
                    </div>
                  </div>
                )})}
              </div>
            </div>
          ))
        )}
      </div>

      {/* ================= CUSTOM DELETE MODAL ================= */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowDeleteModal(false)} />
          <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-3xl shadow-2xl relative z-10 p-4 md:p-6 text-center animate-in zoom-in-95 duration-200">
            <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertTriangle size={32} />
            </div>
            <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-2">Hapus Transaksi?</h3>
            <p className="text-slate-500 dark:text-slate-400 mb-6 text-sm">
              Data akan dihapus permanen dan saldo rekening terkait akan dikembalikan secara otomatis.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setShowDeleteModal(false)} className="flex-1 py-3 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer">
                Batal
              </button>
              <button onClick={executeDelete} className="flex-1 py-3 bg-red-500 text-white font-bold rounded-xl hover:bg-red-600 transition-colors cursor-pointer shadow-lg shadow-red-500/20">
                Ya, Hapus
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= FILTER DRAWER (RIGHT SIDE) ================= */}
      {showFilterDrawer && (
        <>
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[60] animate-in fade-in" onClick={() => setShowFilterDrawer(false)} />
          <div className="fixed top-0 right-0 h-full w-full max-w-sm bg-white dark:bg-slate-900 shadow-2xl z-[70] flex flex-col animate-in slide-in-from-right duration-300 border-l border-slate-200 dark:border-slate-800 transition-colors">
            <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-white dark:bg-slate-900">
              <h2 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2"><Filter size={20}/> Filter</h2>
              <button onClick={() => setShowFilterDrawer(false)} className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 cursor-pointer">
                <X size={20} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
              
              <div>
                <label className="block text-sm font-bold text-slate-800 dark:text-white mb-3">Tipe Transaksi</label>
                <div className="flex gap-2">
                    <button onClick={() => setFilterType('all')} className={`flex-1 py-2.5 rounded-2xl border font-semibold text-sm cursor-pointer ${filterType === 'all' ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'}`}>Semua</button>
                  <button onClick={() => setFilterType('expense')} className={`flex-1 py-2.5 rounded-2xl border font-semibold text-sm cursor-pointer ${filterType === 'expense' ? 'border-red-500 bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'}`}>Pengeluaran</button>
                  <button onClick={() => setFilterType('income')} className={`flex-1 py-2.5 rounded-2xl border font-semibold text-sm cursor-pointer ${filterType === 'income' ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'}`}>Pemasukan</button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-800 dark:text-white mb-3">Sumber Rekening</label>
                <div className="flex flex-wrap gap-2">
                    <button onClick={() => setFilterBank('all')} className={`px-4 py-2 rounded-2xl border font-semibold text-sm cursor-pointer transition-all ${filterBank === 'all' ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 shadow-sm' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'}`}>Semua Rekening</button>
                    {banks.map(b => (
                      <button key={b.id} onClick={() => setFilterBank(b.name)} className={`px-4 py-2 rounded-2xl border font-semibold text-sm cursor-pointer transition-all ${filterBank === b.name ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 shadow-sm' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'}`}>{b.name}</button>
                    ))}
                  </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-800 dark:text-white mb-3">Rentang Waktu</label>
                <div className="flex flex-wrap gap-2">
                    <button onClick={() => setFilterDate('all')} className={`px-4 py-2 rounded-2xl border font-semibold text-sm cursor-pointer transition-all ${filterDate === 'all' ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 shadow-sm' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'}`}>Semua Waktu</button>
                    <button onClick={() => setFilterDate('7days')} className={`px-4 py-2 rounded-2xl border font-semibold text-sm cursor-pointer transition-all ${filterDate === '7days' ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 shadow-sm' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'}`}>7 Hari Terakhir</button>
                    <button onClick={() => setFilterDate('30days')} className={`px-4 py-2 rounded-2xl border font-semibold text-sm cursor-pointer transition-all ${filterDate === '30days' ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 shadow-sm' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'}`}>30 Hari Terakhir</button>
                    <button onClick={() => setFilterDate('year')} className={`px-4 py-2 rounded-2xl border font-semibold text-sm cursor-pointer transition-all ${filterDate === 'year' ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 shadow-sm' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'}`}>Tahun Ini</button>
                  </div>
              </div>

            </div>
            <div className="p-4 md:p-6 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800">
              <button onClick={() => setShowFilterDrawer(false)} className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-2xl shadow-lg shadow-blue-600/30 transition-all cursor-pointer">
                Terapkan Filter
              </button>
            </div>
          </div>
        </>
      )}


      {/* ================= ADD TRANSACTION MODAL ================= */}
      {showAddModal && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-300">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowAddModal(false)} />
          
          <div className="bg-white dark:bg-slate-900 w-full max-w-2xl sm:rounded-[2.5rem] rounded-t-[2.5rem] shadow-2xl relative z-10 flex flex-col max-h-[90vh] sm:max-h-[85vh] animate-in slide-in-from-bottom sm:zoom-in-95 duration-300 overflow-hidden">
            
            {/* Header Modal */}
            <div className="px-8 py-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-white dark:bg-slate-900 shrink-0">
              <h2 className="text-2xl font-extrabold text-slate-800 dark:text-white">Catat Transaksi</h2>
              <button onClick={() => setShowAddModal(false)} className="w-10 h-10 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer">
                <X size={20} />
              </button>
            </div>

            
              {/* Mode Switcher */}
              <div className="px-8 pt-6 shrink-0">
                <div className="flex bg-slate-100 dark:bg-slate-800 p-1.5 rounded-2xl overflow-x-auto custom-scrollbar">
                  <button 
                    onClick={() => setAddMode('manual')}
                    className={`flex-1 min-w-[120px] flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition-all cursor-pointer ${addMode === 'manual' ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
                  >
                    Input Manual
                  </button>
                  <button 
                    onClick={() => setAddMode('scan')}
                    className={`flex-1 min-w-[120px] flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition-all cursor-pointer ${addMode === 'scan' ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
                  >
                    Scan Struk (AI)
                  </button>
                  <button 
                    onClick={() => setAddMode('import')}
                    className={`flex-1 min-w-[120px] flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition-all cursor-pointer ${addMode === 'import' ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
                  >
                    Import Mutasi
                  </button>
                </div>
              </div>
  {/* Content Area */}
            <div className="flex-1 overflow-y-auto px-8 py-6 custom-scrollbar">
              
              {/* === MODE SCAN STRUK === */}
              {addMode === 'scan' && (
                <div className="h-full flex flex-col items-center justify-center text-center animate-in fade-in duration-500">
                  
                  {!isScanning && !scanSuccess ? (
                    <>
                      
                        <input type="file" accept="image/*" ref={scanInputRef} className="hidden" onChange={(e) => { if(e.target.files[0]) handleSimulateScan(e.target.files[0]); }} />
                        <div className="w-32 h-32 bg-blue-50 dark:bg-blue-900/20 text-blue-500 rounded-full flex items-center justify-center mb-6 relative overflow-hidden group cursor-pointer" onClick={() => scanInputRef.current.click()}>

                        <div className="absolute inset-0 bg-blue-500/10 group-hover:bg-blue-500/20 transition-colors"></div>
                        <Camera size={48} />
                      </div>
                      <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-2">Upload Foto Struk</h3>
                      <p className="text-slate-500 dark:text-slate-400 max-w-sm mx-auto mb-8">
                        Tekan ikon kamera di atas. AI Budgetin akan otomatis mengenali total belanja, nama toko, dan kategori tanpa perlu diketik manual!
                      </p>
                    </>
                  ) : isScanning ? (
                    <>
                      <div className="w-48 h-64 border-4 border-blue-500/30 rounded-2xl relative overflow-hidden mb-6 bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                        <ReceiptText size={64} className="text-slate-300 dark:text-slate-600" />
                        <div className="absolute left-0 right-0 h-1 bg-green-500 shadow-[0_0_15px_5px_rgba(34,197,94,0.5)] animate-[scan_1.5s_ease-in-out_infinite]"></div>
                      </div>
                      <h3 className="text-lg font-bold text-slate-800 dark:text-white animate-pulse">AI sedang menganalisis struk...</h3>
                      <p className="text-slate-500 dark:text-slate-400 mt-2">Mengekstrak nominal dan kategori</p>
                    </>
                  ) : (
                    <>
                      <div className="w-24 h-24 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-500 rounded-full flex items-center justify-center mb-4 animate-in zoom-in">
                        <CheckCircle2 size={48} />
                      </div>
                      <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-2">Data Ditemukan!</h3>
                      <p className="text-slate-500 dark:text-slate-400">Mengarahkan ke form pengisian...</p>
                    </>
                  )}
                  
                </div>
              )}

              
              {/* === MODE IMPORT MUTASI === */}
              {addMode === 'import' && (
                <div className="h-full flex flex-col animate-in fade-in duration-500">
                  
                  {!isImporting && !importPreview ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-center">
                      
                      <input 
                        type="file" 
                        ref={fileInputRef} 
                        className="hidden" 
                        accept=".pdf,.csv" 
                        onChange={(e) => {
                          if (e.target.files && e.target.files.length > 0) {
                            handleSimulateImport(e.target.files[0]);
                          }
                        }} 
                      />
                      <div className="w-full max-w-md border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-3xl p-10 flex flex-col items-center justify-center text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer group mb-6 relative overflow-hidden" onClick={() => fileInputRef.current.click()}>

                        <div className="w-20 h-20 bg-blue-50 dark:bg-blue-900/30 text-blue-500 rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                          <FileSpreadsheet size={40} />
                        </div>
                        <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-2">Upload Mutasi BCA/Mandiri</h3>
                        <p className="text-sm">Format PDF atau CSV. AI akan otomatis mengkategorikan transaksi untukmu!</p>
                      </div>
                    </div>
                  ) : isImporting ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-center">
                      <div className="relative w-32 h-32 mb-8">
                        <div className="absolute inset-0 border-4 border-slate-100 dark:border-slate-800 rounded-2xl"></div>
                        <div className="absolute inset-0 border-4 border-blue-500 rounded-2xl border-t-transparent animate-spin"></div>
                        <div className="absolute inset-0 flex items-center justify-center text-blue-500">
                          <FileSpreadsheet size={32} />
                        </div>
                      </div>
                      <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-2 animate-pulse">AI Sedang Membaca Mutasi...</h3>
                      <p className="text-slate-500 dark:text-slate-400">Mengekstrak tanggal, nominal, dan menebak kategori...</p>
                    </div>
                  ) : (
                    <div className="flex flex-col h-full">
                      <div className="flex justify-between items-end mb-4">
                        <div>
                          <h3 className="text-lg font-bold text-slate-800 dark:text-white">Smart Preview</h3>
                          <p className="text-sm text-slate-500">Ditemukan {importPreview.length} transaksi.</p>
                        </div>
                      </div>
                      
                      <div className="flex-1 overflow-y-auto border border-slate-200 dark:border-slate-700 rounded-2xl bg-slate-50 dark:bg-slate-900 mb-6 custom-scrollbar">
                        <table className="w-full text-left text-sm">
                          <thead className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 sticky top-0 z-10">
                            <tr>
                              <th className="px-4 py-3 font-semibold"><input type="checkbox" defaultChecked className="rounded text-blue-600 cursor-pointer" /></th>
                              <th className="px-4 py-3 font-semibold">Deskripsi Asli</th>
                              <th className="px-4 py-3 font-semibold text-right">Nominal</th>
                              <th className="px-4 py-3 font-semibold">Tebakan Kategori</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                            {importPreview.map((item, idx) => (
                              <tr key={idx} className="hover:bg-white dark:hover:bg-slate-800/50 transition-colors">
                                <td className="px-4 py-3"><input type="checkbox" defaultChecked className="rounded text-blue-600 cursor-pointer" /></td>
                                <td className="px-4 py-3">
                                  <div className="font-bold text-slate-800 dark:text-white truncate max-w-[150px]">{item.desc}</div>
                                  <div className="text-xs text-slate-500">{item.date}</div>
                                </td>
                                <td className={`px-4 py-3 font-bold text-right ${item.type === 'income' ? 'text-emerald-600' : 'text-slate-800 dark:text-white'}`}>
                                  {item.type === 'income' ? '+' : '-'} Rp {(item.amount/1000).toLocaleString('id-ID')}k
                                </td>
                                <td className="px-4 py-3">
                                  <select className="bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg px-2 py-1 text-xs font-semibold border-none outline-none cursor-pointer" defaultValue={item.cat}>
                                    <option value="transport">Kendaraan</option>
                                    <option value="food">Makanan</option>
                                    <option value="income">Pemasukan</option>
                                    <option value="other">Lainnya</option>
                                  </select>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      
                      <button onClick={handleSaveImport} disabled={isSaving} className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white text-lg font-bold rounded-2xl shadow-xl shadow-blue-600/30 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-70 disabled:cursor-not-allowed">
                        {isSaving ? <div className="w-6 h-6 border-4 border-white/30 border-t-white rounded-full animate-spin"></div> : <><CheckCircle2 size={24} /> Simpan Semua ke Database</>}
                      </button>
                    </div>
                  )}

                </div>
              )}


              {/* === MODE MANUAL === */}
              {addMode === 'manual' && (
                <form onSubmit={handleSaveTransaction} className="space-y-8 animate-in fade-in duration-500">
                  
                  {/* Type Toggle */}
                  <div className="flex gap-4">
                    <button type="button" onClick={() => setTxType('expense')} className={`flex-1 flex flex-col items-center justify-center p-4 rounded-2xl border-2 transition-all cursor-pointer ${txType === 'expense' ? 'border-red-500 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400' : 'border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-500 hover:border-slate-200 dark:hover:border-slate-700'}`}>
                      <ArrowUpRight size={28} className="mb-2" />
                      <span className="font-bold">Pengeluaran</span>
                    </button>
                    <button type="button" onClick={() => setTxType('income')} className={`flex-1 flex flex-col items-center justify-center p-4 rounded-2xl border-2 transition-all cursor-pointer ${txType === 'income' ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400' : 'border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-500 hover:border-slate-200 dark:hover:border-slate-700'}`}>
                      <ArrowDownRight size={28} className="mb-2" />
                      <span className="font-bold">Pemasukan</span>
                    </button>
                  </div>

                  {/* Nominal Input */}
                  <div>
                    <label className="block text-center text-slate-500 dark:text-slate-400 font-bold mb-4 uppercase tracking-wider text-sm">Nominal Transaksi</label>
                    <div className={`flex items-center justify-center border-b-2 pb-2 ${txType === 'expense' ? 'border-red-200 dark:border-red-900/50' : 'border-emerald-200 dark:border-emerald-900/50'}`}>
                      <span className="text-4xl font-bold text-slate-400 mr-2">Rp</span>
                      <input 
                        type="text" 
                        required
                        value={formData.amount ? Number(formData.amount).toLocaleString('id-ID') : ''}
                        onChange={(e) => setFormData({...formData, amount: e.target.value.replace(/\D/g, '')})}
                        className={`text-5xl md:text-6xl font-black bg-transparent w-full outline-none text-center ${txType === 'expense' ? 'text-slate-800 dark:text-white' : 'text-emerald-600 dark:text-emerald-400'}`}
                        placeholder="0"
                      />
                    </div>
                  </div>

                  {/* Category Grid */}
                  <div>
                    <label className="block text-sm font-bold text-slate-800 dark:text-white mb-4">Pilih Kategori</label>
                    <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
                      {categories.filter(c => txType === 'income' ? c.type === 'income' || c.id === 'other' : c.type !== 'income').map(cat => (
                        <div 
                          key={cat.id} 
                          onClick={() => setSelectedCategory(cat.id)}
                          className={`flex flex-col items-center gap-2 p-3 rounded-2xl cursor-pointer border-2 transition-all ${selectedCategory === cat.id ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-transparent hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                        >
                          <div className={`w-14 h-14 rounded-full flex items-center justify-center ${cat.color} ${selectedCategory === cat.id ? 'shadow-md' : ''}`}>
                            {cat.icon}
                          </div>
                          <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 text-center">{cat.name}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Wallet & Notes */}
                  <div className="grid sm:grid-cols-2 gap-4 md:p-6 bg-slate-50 dark:bg-slate-800/50 p-4 md:p-6 rounded-3xl border border-slate-100 dark:border-slate-800">
                    <div>
                      <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">Sumber Rekening</label>
                      <select 
                        value={formData.wallet}
                        onChange={(e) => setFormData({...formData, wallet: e.target.value})}
                        className="w-full px-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-blue-500 font-medium cursor-pointer"
                      >
                        <option value="" disabled hidden>-- Pilih Rekening --</option>
                          {banks.filter(b => b.is_active !== 0).length === 0 ? (
                            <option value="" disabled>Tidak ada rekening aktif</option>
                          ) : (
                            banks.filter(b => b.is_active !== 0).map(b => (
                              <option key={b.id} value={b.name}>{b.name}</option>
                            ))
                          )}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">Catatan Tambahan</label>
                      <input 
                        type="text" 
                        value={formData.note}
                        onChange={(e) => setFormData({...formData, note: e.target.value})}
                        className="w-full px-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-blue-500" 
                        placeholder="Misal: Makan Siang Nasi Padang"
                      />
                    </div>
                  </div>

                  {/* Submit Action */}
                  <button disabled={isSaving} type="submit" className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white text-lg font-bold rounded-2xl shadow-xl shadow-blue-600/30 transition-all transform hover:-translate-y-1 cursor-pointer flex items-center justify-center gap-2 disabled:opacity-70 disabled:transform-none">
                    {isSaving ? (
                      <div className="w-6 h-6 border-4 border-white/30 border-t-white rounded-full animate-spin"></div>
                    ) : (
                      <>
                        <CheckCircle2 size={24} /> Simpan Transaksi
                      </>
                    )}
                  </button>

                </form>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Global CSS for Scanner Animation */}
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes scan {
          0% { top: -10%; opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { top: 110%; opacity: 0; }
        }
      `}} />

      {/* Elegant Toast Notification */}
      {showToast.show && (
        <div className="fixed top-4 md:p-8 left-1/2 -translate-x-1/2 z-[200] animate-in fade-in slide-in-from-top-4 duration-300">
          <div className={`px-6 py-4 rounded-full shadow-2xl flex items-center gap-3 font-semibold text-sm ${showToast.type === 'error' ? 'bg-red-500 text-white' : 'bg-slate-800 text-white dark:bg-slate-100 dark:text-slate-900'}`}>
            <CheckCircle2 size={20} className={showToast.type === 'error' ? 'hidden' : 'text-emerald-400 dark:text-emerald-500'} />
            {showToast.message}
          </div>
        </div>
      )}
    </div>
  );
}















