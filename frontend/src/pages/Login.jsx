import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, Lock, Eye, EyeOff, ArrowRight, User, X, CheckCircle2, Sun, Moon } from 'lucide-react';

export default function Login() {
  const [view, setView] = useState('login'); // 'login' | 'register'
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [showToast, setShowToast] = useState({ show: false, title: '', message: '', type: 'success' });
  
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const [isDarkMode, setIsDarkMode] = useState(() => {
    return localStorage.getItem("budgetin_theme") === "dark";
  });

  React.useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("budgetin_theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("budgetin_theme", "light");
    }
  }, [isDarkMode]);


  const triggerToast = (title, message, type = 'success') => {
    setShowToast({ show: true, title, message, type });
    setTimeout(() => setShowToast({ show: false, title: '', message: '', type: 'success' }), 4000);
  };

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    
    const formData = new FormData(e.target);
    const data = Object.fromEntries(formData.entries());

    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL || `http://${window.location.hostname}/BUDGETIN/api`}/auth/login.php`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      const result = await response.json();
      
      if (result.success) {
        localStorage.setItem('budgetin_user', JSON.stringify(result.user));
        navigate('/');
      } else {
        triggerToast('Gagal Masuk', result.message || 'Kredensial tidak valid', 'error');
      }
    } catch(err) {
      triggerToast('Gagal', 'Terjadi kesalahan koneksi', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegisterSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    
    const formData = new FormData(e.target);
    const data = Object.fromEntries(formData.entries());

    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL || `http://${window.location.hostname}/BUDGETIN/api`}/auth/register.php`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      const result = await response.json();
      
      if (result.success) {
        triggerToast('Berhasil', 'Akun berhasil dibuat! Silakan masuk.');
        setView('login');
      } else {
        triggerToast('Gagal', result.message || 'Cek kembali data Anda', 'error');
      }
    } catch(err) {
      triggerToast('Gagal', 'Terjadi kesalahan koneksi', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotSubmit = (e) => {
    e.preventDefault();
    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
      setShowForgotModal(false);
      triggerToast('Link Terkirim!', 'Kami telah mengirimkan instruksi reset password ke email Anda.');
    }, 1500);
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4 relative overflow-hidden">
      
      {/* CUSTOM TOAST NOTIFICATION */}
      <div className={`fixed top-4 md:p-8 left-1/2 -translate-x-1/2 z-50 transition-all duration-500 transform ${showToast.show ? 'translate-y-0 opacity-100' : '-translate-y-10 opacity-0 pointer-events-none'}`}>
        <div className="bg-slate-800 text-white px-6 py-4 rounded-2xl shadow-2xl flex items-start gap-4 max-w-sm">
          <div className="text-emerald-400 mt-0.5">
            <CheckCircle2 size={24} />
          </div>
          <div>
            <h4 className="font-bold text-white text-sm">{showToast.title}</h4>
            <p className="text-slate-300 text-sm mt-1">{showToast.message}</p>
          </div>
        </div>
      </div>

      {/* MAIN SPLIT LAYOUT */}
      <div className="max-w-5xl w-full bg-white dark:bg-slate-900 rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col md:flex-row min-h-[600px] relative z-10">
        
        {/* LEFT SIDE - BRANDING */}
        <div className="hidden md:flex md:w-1/2 bg-blue-600 p-12 flex-col justify-between relative overflow-hidden transition-all duration-500">
          <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500 rounded-full mix-blend-multiply filter blur-3xl opacity-50 translate-x-1/2 -translate-y-1/2"></div>
          <div className="absolute bottom-0 left-0 w-80 h-80 bg-blue-400 rounded-full mix-blend-multiply filter blur-3xl opacity-30 -translate-x-1/2 translate-y-1/2"></div>

          <div className="relative z-10">
            <img src="/logo.png" alt="Budgetin Logo" className="h-16 w-auto object-contain mb-6 drop-shadow-2xl" />
            <h1 className="text-4xl font-extrabold text-white leading-tight mb-4">
              {view === 'login' ? 'Pegang Kendali\nKeuangan Anda.' : 'Mulai Perjalanan\nFinansial Anda.'}
            </h1>
            <p className="text-blue-100 text-lg">
              {view === 'login' 
                ? 'Catat, lacak, dan capai target finansial Anda dengan lebih cerdas bersama Budgetin.'
                : 'Bergabunglah dengan ribuan pengguna lain yang telah berhasil mengatur keuangan mereka.'}
            </p>
          </div>

          <div className="relative z-10 bg-white/10 backdrop-blur-md border border-white/20 p-4 md:p-6 rounded-2xl">
            <p className="text-white italic">
              "Semenjak pakai Budgetin, saya jadi tau kemana bocornya gaji saya tiap bulan. UI-nya juga juara!"
            </p>
            <div className="mt-4 flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-400 rounded-full flex items-center justify-center text-white font-bold">N</div>
              <div>
                <strong className="block text-white text-sm">Nan</strong>
                <small className="text-blue-200">Personal Account</small>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT SIDE - FORMS */}
        <div className="w-full md:w-1/2 p-4 md:p-8 md:p-14 flex flex-col justify-center bg-white dark:bg-slate-900 relative transition-colors">
          {/* DARK MODE TOGGLE */}
          <button 
            type="button"
            onClick={() => setIsDarkMode(!isDarkMode)}
            className="absolute top-4 md:p-8 right-8 w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 dark:text-slate-300 flex items-center justify-center hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer z-50"
          >
            {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
          </button>

          
          <img src="/logo.png" alt="Budgetin Logo" className="h-12 w-auto object-contain mb-8 md:hidden" />

          {/* ================= LOGIN FORM ================= */}
          {view === 'login' && (
            <div className="animate-in slide-in-from-right-8 duration-500 fade-in">
              <div className="mb-8">
                <h2 className="text-3xl font-extrabold text-slate-800 dark:text-white mb-2">Selamat Datang ??</h2>
                <p className="text-slate-500 dark:text-slate-400">Masukkan email dan password untuk melanjutkan.</p>
              </div>

              <form onSubmit={handleLoginSubmit} className="space-y-5">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">Email Address</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400"><Mail size={20} /></div>
                    <input name="email" type="email" required className="w-full pl-11 pr-4 py-3.5 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl focus:ring-4 focus:ring-blue-500/10 focus:border-blue-600 outline-none transition-all font-medium text-slate-800 dark:text-white placeholder-slate-400" placeholder="nama@email.com" />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">Password</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400"><Lock size={20} /></div>
                    <input name="password" type={showPassword ? "text" : "password"} required className="w-full pl-11 pr-12 py-3.5 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl focus:ring-4 focus:ring-blue-500/10 focus:border-blue-600 outline-none transition-all font-medium text-slate-800 dark:text-white placeholder-slate-400" placeholder="Masukkan password" />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute inset-y-0 right-0 pr-4 flex items-center text-slate-400 hover:text-slate-600 dark:text-slate-300 transition-colors cursor-pointer">
                      {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between text-sm">
                  <label className="flex items-center gap-2 cursor-pointer group">
                    <input type="checkbox" className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-600 cursor-pointer" />
                    <span className="text-slate-600 dark:text-slate-300 font-medium group-hover:text-slate-800 dark:text-white transition-colors">Ingat saya</span>
                  </label>
                  <button type="button" onClick={() => setShowForgotModal(true)} className="text-blue-600 font-semibold hover:text-blue-700 transition-colors cursor-pointer">Lupa Password?</button>
                </div>

                <button type="submit" disabled={isLoading} className="w-full py-4 mt-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-2xl shadow-lg shadow-blue-600/30 transition-all flex items-center justify-center gap-2 group disabled:opacity-70 disabled:cursor-not-allowed cursor-pointer">
                  {isLoading ? <div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin"></div> : <><>Masuk Sekarang</><ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" /></>}
                </button>
              </form>

              <p className="mt-8 text-center text-slate-600 dark:text-slate-300 text-sm font-medium">
                Belum punya akun? <button onClick={() => setView('register')} className="text-blue-600 font-bold hover:underline cursor-pointer">Daftar sekarang</button>
              </p>
            </div>
          )}

          {/* ================= REGISTER FORM ================= */}
          {view === 'register' && (
            <div className="animate-in slide-in-from-left-8 duration-500 fade-in">
              <div className="mb-8">
                <h2 className="text-3xl font-extrabold text-slate-800 dark:text-white mb-2">Buat Akun Baru</h2>
                <p className="text-slate-500 dark:text-slate-400">Lengkapi data di bawah untuk bergabung.</p>
              </div>

              <form onSubmit={handleRegisterSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">Nama Lengkap</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400"><User size={20} /></div>
                    <input type="text" required className="w-full pl-11 pr-4 py-3.5 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl focus:ring-4 focus:ring-blue-500/10 focus:border-blue-600 outline-none transition-all font-medium text-slate-800 dark:text-white" name="name" placeholder="Nama Anda" />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">Email Address</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400"><Mail size={20} /></div>
                    <input name="email" type="email" required className="w-full pl-11 pr-4 py-3.5 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl focus:ring-4 focus:ring-blue-500/10 focus:border-blue-600 outline-none transition-all font-medium text-slate-800 dark:text-white" placeholder="nama@email.com" />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">Password</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400"><Lock size={20} /></div>
                    <input name="password" type="password" required className="w-full pl-11 pr-4 py-3.5 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl focus:ring-4 focus:ring-blue-500/10 focus:border-blue-600 outline-none transition-all font-medium text-slate-800 dark:text-white" placeholder="Minimal 8 karakter" />
                  </div>
                </div>

                <button type="submit" disabled={isLoading} className="w-full py-4 mt-4 bg-slate-800 hover:bg-slate-900 text-white font-bold rounded-2xl shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed cursor-pointer">
                  {isLoading ? <div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin"></div> : 'Daftar Sekarang'}
                </button>
              </form>

              <p className="mt-8 text-center text-slate-600 dark:text-slate-300 text-sm font-medium">
                Sudah punya akun? <button onClick={() => setView('login')} className="text-blue-600 font-bold hover:underline cursor-pointer">Masuk di sini</button>
              </p>
            </div>
          )}

        </div>
      </div>

      {/* ================= FORGOT PASSWORD MODAL ================= */}
      {showForgotModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-300">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-md p-4 md:p-8 shadow-2xl animate-in zoom-in-95 duration-300 relative">
            <button onClick={() => setShowForgotModal(false)} className="absolute top-4 md:p-6 right-6 text-slate-400 hover:text-slate-600 dark:text-slate-300 bg-slate-100 p-2 rounded-full cursor-pointer transition-colors">
              <X size={20} />
            </button>
            
            <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mb-6">
              <Lock size={32} />
            </div>
            
            <h3 className="text-2xl font-bold text-slate-800 dark:text-white mb-2">Lupa Password?</h3>
            <p className="text-slate-500 dark:text-slate-400 mb-8">Jangan khawatir! Masukkan email yang terdaftar dan kami akan mengirimkan instruksi untuk mereset password Anda.</p>
            
            <form onSubmit={handleForgotSubmit}>
              <div className="mb-6">
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">Email Address</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400"><Mail size={20} /></div>
                  <input name="email" type="email" required className="w-full pl-11 pr-4 py-3.5 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-4 focus:ring-blue-500/10 focus:border-blue-600 outline-none transition-all font-medium text-slate-800 dark:text-white" placeholder="nama@email.com" />
                </div>
              </div>
              <button type="submit" disabled={isLoading} className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-lg shadow-blue-600/30 transition-all flex items-center justify-center cursor-pointer disabled:opacity-70">
                 {isLoading ? <div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin"></div> : 'Kirim Link Reset'}
              </button>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}









