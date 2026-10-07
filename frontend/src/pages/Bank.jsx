import React, { useState } from 'react';
import { Landmark, CreditCard, Wallet, Plus, MoreHorizontal, X, Edit2, Trash2, CheckCircle2 } from 'lucide-react';

export default function Bank() {
    const [accounts, setAccounts] = useState([]);
  
  const fetchAccounts = () => {
    fetch(`${import.meta.env.VITE_API_URL || `http://${window.location.hostname}/BUDGETIN/api`}/financial/react_bank.php`)
      .then(res => res.json())
      .then(data => {
        if(data.success) {
          const mapped = data.data.map((b, i) => {
            const colors = ['bg-blue-600', 'bg-emerald-600', 'bg-yellow-500', 'bg-purple-600'];
            return {
              id: b.id,
              name: b.name,
              balance: b.balance,
              is_active: b.is_active,
              type: 'Bank',
              number: b.legacy_id,
              color: colors[i % colors.length]
            };
          });
          setAccounts(mapped);
        }
      });
  };

  React.useEffect(() => {
    fetchAccounts();
  }, []);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [activeMenuId, setActiveMenuId] = useState(null);
  const [deleteAccount, setDeleteAccount] = useState(null);
    const [deleteError, setDeleteError] = useState('');
  
  const [formData, setFormData] = useState({
    name: '',
    type: 'Bank Account',
    balance: '',
    number: '',
    color: 'bg-blue-600'
  });

  const getIcon = (type) => {
    switch(type) {
      case 'E-Wallet': return <Wallet size={24}/>;
      case 'Credit Card': return <CreditCard size={24}/>;
      default: return <Landmark size={24}/>;
    }
  };

  const handleBalanceChange = (e) => {
    const rawValue = e.target.value.replace(/[^0-9]/g, '');
    setFormData({ ...formData, balance: rawValue });
  };

  const handleOpenModal = (account = null) => {
    if (account) {
      setEditingId(account.id);
      setFormData({
        name: account.name,
        type: account.type,
        balance: account.balance.toString(),
        number: account.number,
        color: account.color
      });
    } else {
      setEditingId(null);
      setFormData({ name: '', type: 'Bank Account', balance: '', number: '', color: 'bg-blue-600' });
    }
    setIsModalOpen(true);
    setActiveMenuId(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const balanceNum = parseInt(formData.balance) || 0;
    
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL || `http://${window.location.hostname}/BUDGETIN/api`}/financial/react_bank.php`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          balance: balanceNum
        })
      });
      const data = await response.json();
      if(data.success) {
        setIsModalOpen(false);
        fetchAccounts();
      } else {
        alert(data.message || 'Gagal menyimpan rekening');
      }
    } catch(err) {
      alert('Gagal terhubung ke server');
    }
  };




  const handleToggleActive = async (id, currentStatus) => {
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL || `http://${window.location.hostname}/BUDGETIN/api`}/financial/react_bank.php`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ action: 'toggle', id, is_active: !currentStatus })
      });
      const data = await response.json();
      if(data.success) {
        fetchAccounts();
      }
    } catch(err) {}
    setActiveMenuId(null);
  };

  const handleDeleteClick = (acc) => {
    setActiveMenuId(null);
    setDeleteAccount(acc); setDeleteError('');
  };

  const executeDelete = async (id) => {
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL || `http://${window.location.hostname}/BUDGETIN/api`}/financial/react_bank.php?id=${id}`, {
        method: 'DELETE'
      });
      const data = await response.json();
      if (data.success) {
        fetchAccounts();
        setDeleteAccount(null);
      } else {
        setDeleteError(data.message || 'Gagal menghapus rekening');
        setTimeout(() => {
          setDeleteAccount(null);
          setDeleteError('');
        }, 3500);
      }
    } catch(e) {
      setDeleteError('Terjadi kesalahan koneksi');
    }
  };

  const colors = ['bg-blue-600', 'bg-emerald-500', 'bg-yellow-500', 'bg-purple-600', 'bg-slate-700', 'bg-rose-500', 'bg-orange-500'];

  return (
    <div className="w-full 2xl:max-w-screen-2xl mx-auto space-y-6 pb-20">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Daftar Rekening & Dompet</h2>
          <p className="text-slate-500 text-sm mt-1">Kelola semua sumber dana Anda di satu tempat</p>
        </div>
        <button 
          onClick={() => handleOpenModal()}
          className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors font-semibold cursor-pointer shadow-lg shadow-blue-500/20"
        >
          <Plus size={18} /> Tambah Rekening
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:p-6">
        {accounts.map((acc) => (
          <div key={acc.id} className={"bg-white p-4 md:p-6 rounded-3xl border border-slate-200 hover:shadow-lg transition-shadow relative group overflow-hidden " + (acc.is_active === 0 ? "opacity-60 grayscale bg-slate-50" : "")}>
    {acc.is_active === 0 && <div className="absolute top-0 left-0 bg-slate-700 text-white text-[10px] px-3 py-1 rounded-br-xl font-bold z-10 tracking-wider">NONAKTIF</div>}
            <div className="flex justify-between items-start mb-6">
              <div className="flex items-center gap-4">
                <div className={`w-12 h-12 rounded-xl text-white flex items-center justify-center shadow-md ${acc.color}`}>
                  {getIcon(acc.type)}
                </div>
                <div>
                  <strong className="block text-lg font-bold text-slate-800">{acc.name}</strong>
                  <small className="text-slate-500">{acc.type} &bull; {acc.number}</small>
                </div>
              </div>
              
              <div className="relative">
                <button 
                  onClick={() => setActiveMenuId(activeMenuId === acc.id ? null : acc.id)}
                  className="text-slate-400 hover:text-slate-700 p-2 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer"
                >
                  <MoreHorizontal size={20} />
                </button>
                
                {activeMenuId === acc.id && (
                  <div className="absolute right-0 mt-2 w-36 bg-white rounded-xl shadow-xl border border-slate-100 py-2 z-10 animate-in fade-in">
                    <button 
                      onClick={() => handleOpenModal(acc)}
                      className="w-full text-left px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 hover:text-blue-600 flex items-center gap-2 cursor-pointer"
                    >
                      <Edit2 size={14} /> Edit
                    </button>
                    <button onClick={() => handleToggleActive(acc.id, acc.is_active !== 0)} className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2 cursor-pointer font-medium border-b border-slate-100">
    <CheckCircle2 size={14} className={acc.is_active !== 0 ? "text-orange-500" : "text-emerald-500"} /> {acc.is_active !== 0 ? 'Nonaktifkan' : 'Aktifkan'}
  </button>
  <button onClick={() => handleDeleteClick(acc)} className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2 cursor-pointer font-medium">
    <Trash2 size={14} /> Hapus Permanen
  </button>
                  </div>
                )}
              </div>
            </div>
            
            <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
              <span className="text-slate-500 text-sm font-medium block mb-1">Saldo Aktif</span>
              <strong className={`text-2xl font-bold ${acc.balance < 0 ? 'text-red-500' : 'text-slate-800'}`}>
                Rp {Number(acc.balance).toLocaleString('id-ID')}
              </strong>
            </div>
          </div>
        ))}
      </div>

      {/* Modal Tambah/Edit */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl w-full max-w-md overflow-hidden shadow-2xl animate-in slide-in-from-bottom-4">
            <div className="flex justify-between items-center p-4 md:p-6 border-b border-slate-100">
              <h3 className="text-xl font-bold text-slate-800">
                {editingId ? 'Edit Rekening' : 'Tambah Rekening Baru'}
              </h3>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 bg-slate-50 p-2 rounded-full cursor-pointer transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-4 md:p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Nama Rekening</label>
                <input type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                  placeholder="Contoh: Tabungan Mandiri"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Jenis</label>
                  <select 
                    value={formData.type} onChange={e => setFormData({...formData, type: e.target.value})}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none cursor-pointer"
                  >
                    <option value="Bank Account">Rekening Bank</option>
                    <option value="E-Wallet">E-Wallet</option>
                    <option value="Credit Card">Kartu Kredit</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Nomor (Opsional)</label>
                  <input 
                    type="text"
                    value={formData.number} onChange={e => setFormData({...formData, number: e.target.value})}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                    placeholder="**** 1234"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Saldo Saat Ini</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 font-semibold">Rp</span>
                  <input type="text" value={formData.balance ? Number(formData.balance).toLocaleString('id-ID') : ''} onChange={handleBalanceChange}
                    className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                    placeholder="0"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Warna Kartu</label>
                <div className="flex gap-3">
                  {colors.map(color => (
                    <button
                      key={color} type="button"
                      onClick={() => setFormData({...formData, color})}
                      className={`w-8 h-8 rounded-full ${color} flex items-center justify-center transition-transform ${formData.color === color ? 'scale-110 ring-4 ring-slate-200' : 'hover:scale-110'}`}
                    >
                      {formData.color === color && <div className="w-2.5 h-2.5 bg-white rounded-full"></div>}
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-4 mt-6 border-t border-slate-100 flex gap-3">
                <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 px-4 py-3 bg-slate-100 text-slate-700 font-semibold rounded-xl hover:bg-slate-200 transition-colors cursor-pointer">
                  Batal
                </button>
                <button type="submit" className="flex-1 px-4 py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition-colors shadow-lg shadow-blue-500/30 cursor-pointer">
                  Simpan Rekening
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete/Deactivate Warning Modal */}
      {deleteAccount && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-3xl w-full max-w-sm p-6 shadow-2xl">
            {deleteAccount.is_active !== 0 ? (
              <div className="text-center">
                <div className="w-16 h-16 rounded-full bg-orange-100 text-orange-500 flex items-center justify-center mx-auto mb-4">
                  <span className="text-3xl font-bold">!</span>
                </div>
                <h3 className="text-xl font-bold text-slate-800 mb-2">Rekening Masih Aktif</h3>
                <p className="text-slate-500 mb-6 text-sm">
                  Silakan <b>nonaktifkan</b> rekening <b>{deleteAccount.name}</b> terlebih dahulu sebelum dihapus permanen.
                </p>
                <button 
                  onClick={() => { setDeleteAccount(null); setDeleteError(''); }}
                  className="w-full px-4 py-3 bg-slate-100 text-slate-700 font-semibold rounded-xl hover:bg-slate-200 transition-colors cursor-pointer"
                >
                  Mengerti
                </button>
              </div>
            ) : (
              <div className="text-center">
                {deleteError ? (
                  <>
                    <div className="w-16 h-16 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto mb-4">
                      <X size={24} />
                    </div>
                    <h3 className="text-xl font-bold text-slate-800 mb-2">Penghapusan Gagal</h3>
                    <div className="bg-red-50 text-red-600 p-4 rounded-xl text-sm font-semibold border border-red-100 mb-2">
                      {deleteError}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="w-16 h-16 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto mb-4">
                      <Trash2 size={24} />
                    </div>
                    <h3 className="text-xl font-bold text-slate-800 mb-2">Hapus Permanen?</h3>
                    <p className="text-slate-500 mb-6 text-sm">
                      Apakah Anda yakin ingin menghapus rekening <b>{deleteAccount.name}</b>? Tindakan ini tidak dapat dibatalkan.
                    </p>
                    <div className="flex gap-3">
                      <button 
                        onClick={() => { setDeleteAccount(null); setDeleteError(''); }}
                        className="flex-1 px-4 py-3 bg-slate-100 text-slate-700 font-semibold rounded-xl hover:bg-slate-200 transition-colors cursor-pointer"
                      >
                        Batal
                      </button>
                      <button 
                        onClick={() => executeDelete(deleteAccount.id)}
                        className="flex-1 px-4 py-3 bg-red-600 text-white font-semibold rounded-xl hover:bg-red-700 transition-colors cursor-pointer"
                      >
                        Ya, Hapus
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
