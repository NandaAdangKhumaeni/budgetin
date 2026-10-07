import React, { useState, useEffect, useRef } from 'react';
import { X, User, Bell, Shield, Moon, Sun, Smartphone, Save, Send } from 'lucide-react';

export default function ProfileDrawer({ isOpen, onClose, initialTab = 'profile', userProfile, onUpdateProfile, isDarkMode, toggleDarkMode }) {
  const [activeTab, setActiveTab] = useState(initialTab);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState('');

  // Local state for the form so we can edit before saving
  
  const [localProfile, setLocalProfile] = useState(userProfile);
  const fileInputRef = useRef(null);
  const [uploadingPic, setUploadingPic] = useState(false);
  
  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploadingPic(true);
    const formData = new FormData();
    formData.append('profile_picture', file);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL || `http://${window.location.hostname}/BUDGETIN/api`}/financial/react_profile.php`, {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (data.success) {
        setLocalProfile({...localProfile, profile_picture: data.url});
        if (onUpdateProfile) onUpdateProfile({...localProfile, profile_picture: data.url});
        // small hack to update layout if needed
        window.location.reload();
      } else {
        alert(data.message);
      }
    } catch (e) {
      console.error(e);
      alert("Gagal mengunggah foto");
    }
    setUploadingPic(false);
  };

  
  const [telegram, setTelegram] = useState({
    enabled: userProfile?.telegram_enabled == 1,
    chatId: userProfile?.telegram_chat_id || '',
    reminderDays: userProfile?.telegram_reminder_days || 3,
    reminderTime: '08:00'
  });


  
  const handleSave = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL || `http://${window.location.hostname}/BUDGETIN/api`}/financial/react_profile.php`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          telegram_enabled: telegram.enabled,
          telegram_chat_id: telegram.chatId,
          telegram_reminder_days: parseInt(telegram.reminderDays)
        })
      });
      const data = await res.json();
      if (data.success) {
        setSaveStatus('Tersimpan!');
        onUpdateProfile({ 
          ...localProfile, 
          telegram_enabled: telegram.enabled ? 1 : 0, 
          telegram_chat_id: telegram.chatId,
          telegram_reminder_days: parseInt(telegram.reminderDays)
        });
        setTimeout(() => {
          setSaveStatus('');
          onClose();
        }, 800);
      }
    } catch(err) {
      console.error(err);
      setSaveStatus('Error');
    }
    setIsSaving(false);
  };


  
  const handleTestTelegram = async () => {
    if (!telegram.chatId) {
      alert('Isi Chat ID dulu bro!');
      return;
    }
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL || `http://${window.location.hostname}/BUDGETIN/api`}/financial/react_profile.php`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          telegram_chat_id: telegram.chatId,
          test_telegram: true
        })
      });
      alert('Pesan test sudah dikirim! Cek Telegram kamu.');
    } catch(err) {
      alert('Gagal mengirim pesan test.');
    }
  };


  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[60] animate-in fade-in"
        onClick={onClose}
      />
      
      {/* Drawer */}
      <div className="fixed top-0 right-0 h-full w-full max-w-md bg-white shadow-2xl z-[70] flex flex-col animate-in slide-in-from-right duration-300">
        
        {/* HEADER */}
        <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-white dark:bg-slate-900 shrink-0 transition-colors">
          <h2 className="text-xl font-bold text-slate-800 dark:text-white">
            {activeTab === 'profile' ? 'Profil Saya' : 'Pengaturan'}
          </h2>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 dark:text-slate-500 transition-colors cursor-pointer">
            <X size={20} />
          </button>
        </div>

        {/* TABS */}
        <div className="flex px-6 border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0 transition-colors">
          <button 
            onClick={() => setActiveTab('profile')}
            className={`py-4 px-4 font-semibold text-sm border-b-2 transition-colors cursor-pointer ${activeTab === 'profile' ? 'border-blue-600 text-blue-600 dark:text-blue-400' : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
          >
            Data Profil
          </button>
          <button 
            onClick={() => setActiveTab('settings')}
            className={`py-4 px-4 font-semibold text-sm border-b-2 transition-colors cursor-pointer ${activeTab === 'settings' ? 'border-blue-600 text-blue-600 dark:text-blue-400' : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
          >
            Sistem & Notifikasi
          </button>
        </div>

        {/* CONTENT */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50 dark:bg-slate-950 transition-colors">
          
          {/* ================= PROFILE TAB ================= */}
          {activeTab === 'profile' && (
            <div className="space-y-6 animate-in fade-in">
              <div className="flex flex-col items-center mb-8">
                <div className="relative w-24 h-24 mb-4">
                    {localProfile.profile_picture ? (
                      <img src={`http://${window.location.hostname}${localProfile.profile_picture}`} alt="Profile" className="w-24 h-24 rounded-full object-cover border-4 border-white dark:border-slate-800 shadow-lg" />
                    ) : (
                      <div className="w-24 h-24 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-full flex items-center justify-center text-3xl font-bold border-4 border-white dark:border-slate-800 shadow-lg">
                        {localProfile.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                  </div>
                  <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept="image/*" />
                  <button onClick={() => fileInputRef.current.click()} disabled={uploadingPic} className="text-sm font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer">
                    {uploadingPic ? 'Mengunggah...' : 'Ubah Foto Profil'}
                  </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Nama Panggilan</label>
                  <div className="relative">
                    <User size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
                    <input type="text" value={localProfile.name} onChange={e => setLocalProfile({...localProfile, name: e.target.value})} className="w-full pl-10 pr-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-white rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-colors" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Email</label>
                  <div className="relative">
                    <Shield size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
                    <input type="email" value={localProfile.email} onChange={e => setLocalProfile({...localProfile, email: e.target.value})} className="w-full pl-10 pr-4 py-3 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none text-slate-500 dark:text-slate-400 cursor-not-allowed transition-colors" disabled />
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Email digunakan untuk login dan tidak dapat diubah.</p>
                </div>
              </div>
            </div>
          )}

          {/* ================= SETTINGS TAB ================= */}
          {activeTab === 'settings' && (
            <div className="space-y-8 animate-in fade-in">
              
              {/* Telegram Integration Section */}
              <section>
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                    <Send size={16} />
                  </div>
                  <h3 className="font-bold text-slate-800 dark:text-white">Integrasi Telegram</h3>
                </div>
                
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-5 shadow-sm transition-colors">
                  <div className="flex items-center justify-between">
                    <div>
                      <strong className="block text-sm text-slate-800 dark:text-slate-200">Aktifkan Notifikasi Bot</strong>
                      <span className="text-xs text-slate-500 dark:text-slate-400">Terima pengingat tagihan via Telegram</span>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" checked={telegram.enabled} onChange={e => setTelegram({...telegram, enabled: e.target.checked})} className="sr-only peer" />
                      <div className="w-11 h-6 bg-slate-200 dark:bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 dark:after:border-slate-600 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                    </label>
                  </div>

                  {telegram.enabled && (
                    <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-4 animate-in slide-in-from-top-2">
                      <div>
                        <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Telegram Chat ID</label>
                        <input type="text" value={telegram.chatId} onChange={e => setTelegram({...telegram, chatId: e.target.value})} className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm transition-colors" placeholder="Contoh: 123456789" />
                        <button onClick={handleTestTelegram} className="text-xs text-blue-600 dark:text-blue-400 font-semibold mt-2 hover:underline cursor-pointer">Test Kirim Pesan</button>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Ingatkan Pada</label>
                          <select value={telegram.reminderDays} onChange={e => setTelegram({...telegram, reminderDays: e.target.value})} className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-white rounded-lg text-sm outline-none cursor-pointer transition-colors">
                            <option value="1">H-1 Jatuh Tempo</option>
                            <option value="3">H-3 Jatuh Tempo</option>
                            <option value="7">H-7 Jatuh Tempo</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Waktu (WIB)</label>
                          <input type="time" value={telegram.reminderTime} onChange={e => setTelegram({...telegram, reminderTime: e.target.value})} className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-white rounded-lg text-sm outline-none cursor-pointer transition-colors" />
                        </div>
                      </div>
                      
                      <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg flex items-start gap-2 border border-blue-100 dark:border-blue-800/50">
                        <Bell size={16} className="text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                        <p className="text-xs text-blue-800 dark:text-blue-300 leading-relaxed">
                          Pastikan Anda sudah memulai percakapan dengan Bot Telegram Budgetin (<strong>@budgetin_bot</strong>) agar pesan bisa masuk.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </section>

              {/* Preferences Section */}
              <section>
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                    <Smartphone size={16} />
                  </div>
                  <h3 className="font-bold text-slate-800 dark:text-white">Preferensi Tampilan</h3>
                </div>
                
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-2 flex gap-2 transition-colors">
                  <button 
                    onClick={() => { if(isDarkMode) toggleDarkMode(); }}
                    className={`flex-1 py-2 flex items-center justify-center gap-2 rounded-xl text-sm font-semibold transition-colors cursor-pointer ${!isDarkMode ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                  >
                    <Sun size={16} /> Terang
                  </button>
                  <button 
                    onClick={() => { if(!isDarkMode) toggleDarkMode(); }}
                    className={`flex-1 py-2 flex items-center justify-center gap-2 rounded-xl text-sm font-semibold transition-colors cursor-pointer ${isDarkMode ? 'bg-blue-900 text-white dark:bg-slate-700' : 'text-slate-500 hover:bg-slate-50'}`}
                  >
                    <Moon size={16} /> Gelap
                  </button>
                </div>
              </section>
              
            </div>
          )}
        </div>

        {/* FOOTER ACTIONS */}
        <div className="p-6 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 shrink-0 transition-colors">
          <button 
            onClick={handleSave}
            disabled={isSaving}
            className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-lg shadow-blue-600/30 transition-all flex items-center justify-center gap-2 disabled:opacity-70 cursor-pointer"
          >
            {isSaving ? (
              <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
            ) : saveStatus ? (
              saveStatus
            ) : (
              <><Save size={18} /> Simpan Perubahan</>
            )}
          </button>
        </div>

      </div>
    </>
  );
}
