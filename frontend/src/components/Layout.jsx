import React, { useState, useEffect, useRef } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Home, Receipt, Target, Landmark, TrendingUp, Bell, PieChart, LogOut, User, ChevronDown, Settings, AlertTriangle, Moon, Sun, Menu, ChevronLeft, ChevronRight as ChevronRightIcon, Users } from 'lucide-react';
import ProfileDrawer from './ProfileDrawer';

const Sidebar = ({ isOpen, setIsOpen }) => {
  const menuItems = [
    { name: 'Dashboard', path: '/', icon: <Home size={22} /> },
    { name: 'Transaksi', path: '/transaction', icon: <Receipt size={22} /> },
    { name: 'Target', path: '/target', icon: <Target size={22} /> },
    { name: 'Rekening', path: '/bank', icon: <Landmark size={22} /> },
    { name: 'Investasi', path: '/investment', icon: <TrendingUp size={22} /> },
    { name: 'Tagihan', path: '/bill', icon: <Bell size={22} /> },
    { name: 'Laporan', path: '/report', icon: <PieChart size={22} /> },
  ];

  return (
    <>
    {isOpen && (
      <div 
        className="fixed inset-0 bg-black/50 z-[90] md:hidden" 
        onClick={() => setIsOpen(false)}
      />
    )}
    
    {/* Mobile Backdrop */}
    {isOpen && (
      <div 
        className="fixed inset-0 bg-black/50 z-[90] md:hidden" 
        onClick={() => setIsOpen(false)}
      />
    )}
    <aside className={`fixed md:sticky top-0 left-0 h-screen bg-slate-900 dark:bg-slate-950 text-slate-300 flex flex-col z-[100] transition-transform duration-300 overflow-hidden ${isOpen ? 'translate-x-0 w-64' : '-translate-x-full md:translate-x-0 md:w-20'}`}>
      <div className={`flex justify-center p-6 mb-2 transition-all duration-300 ${isOpen ? 'h-32' : 'h-20'} items-center`}>
        <img 
          src="/logo.png" 
          alt="Budgetin Logo" 
          className={`object-contain transition-all duration-300 ${isOpen ? 'w-24 h-24' : 'w-10 h-10'}`} 
        />
      </div>

      <nav className="flex flex-col gap-1 px-4 flex-1 overflow-y-auto custom-scrollbar overflow-x-hidden min-w-max">
        {menuItems.map((item, idx) => (
          <NavLink
            key={idx}
            to={item.path}
            className={({ isActive }) =>
              `flex items-center gap-3 p-3 rounded-xl transition-all duration-200 ${
                isActive
                  ? 'bg-blue-600 text-white font-medium shadow-md shadow-blue-600/20'
                  : 'hover:bg-slate-800 hover:text-white dark:hover:bg-slate-800'
              }`
            }
          >
            <div className="w-6 shrink-0 flex justify-center ml-1">{item.icon}</div>
            <span className={`text-sm transition-opacity duration-300 whitespace-nowrap ${isOpen ? 'opacity-100' : 'opacity-0'}`}>{item.name}</span>
          </NavLink>
        ))}
      </nav>

      <div className="p-4 border-t border-slate-800">
        <button 
          onClick={() => setIsOpen(!isOpen)}
          className="hidden md:flex w-full items-center justify-center p-3 rounded-xl hover:bg-slate-800 transition-colors cursor-pointer text-slate-400 hover:text-white"
        >
          {isOpen ? <ChevronLeft size={20} /> : <ChevronRightIcon size={20} />}
        </button>
      </div>
    </aside>

    </>
  );
};

const Header = ({ userProfile, openDrawer, isDarkMode, toggleDarkMode, isSidebarOpen, setIsSidebarOpen }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [activeDropdown, setActiveDropdown] = useState(null);
  const headerRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (headerRef.current && !headerRef.current.contains(event.target)) {
        setActiveDropdown(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);
    const [showLogoutModal, setShowLogoutModal] = useState(false);
    const [notifications, setNotifications] = useState([]);

  useEffect(() => {
    const fetchNotifs = async () => {
      const notifs = [];
      try {
        const [billRes, bankRes, targetRes, inviteRes] = await Promise.all([
            fetch(`${import.meta.env.VITE_API_URL || `http://${window.location.hostname}/BUDGETIN/api`}/financial/react_bill.php`),
            fetch(`${import.meta.env.VITE_API_URL || `http://${window.location.hostname}/BUDGETIN/api`}/financial/react_bank.php`),
            fetch(`${import.meta.env.VITE_API_URL || `http://${window.location.hostname}/BUDGETIN/api`}/financial/react_target.php`),
              fetch(`${import.meta.env.VITE_API_URL || `http://${window.location.hostname}/BUDGETIN/api`}/financial/react_target.php?pending_invites=1`)
          ]);
        const billData = await billRes.json();
        const bankData = await bankRes.json();
        const targetData = await targetRes.json();
          const inviteData = await inviteRes.json();
        
        if (billData.success) {
          const today = new Date().getDate();
          billData.data.forEach(b => {
            if (!b.is_paid && !b.is_completed) {
              const diff = Number(b.due_date) - today;
              if (diff <= 3) {
                notifs.push({
                  id: `bill-${b.id}`,
                  title: diff < 0 ? `Terlewat: ${b.name}` : `Tagihan ${b.name}`,
                  desc: diff < 0 ? `Rp ${Number(b.amount).toLocaleString('id-ID')} sudah TERLEWAT jatuh tempo!` : `Rp ${Number(b.amount).toLocaleString('id-ID')} jatuh tempo ${diff === 0 ? 'hari ini' : 'dalam ' + diff + ' hari'}.`,
                  type: 'urgent',
                  icon: <AlertTriangle size={16} className="text-red-500" />
                });
              }
            }
          });
        }
        if (bankData.success) {
          bankData.data.forEach(b => {
            const bal = Number(b.balance);
            if (bal > 0 && bal < 500000) {
              notifs.push({
                id: `bank-${b.id}`,
                title: `Saldo ${b.name} Menipis`,
                desc: `Sisa saldo Rp ${bal.toLocaleString('id-ID')}.`,
                type: 'warning',
                icon: <AlertTriangle size={16} className="text-yellow-500" />
              });
            }
          });
        }
        if (inviteData.success) {
            inviteData.data.forEach(inv => {
              notifs.push({
                id: `invite-${inv.id}`,
                target_id: inv.id,
                title: 'Undangan Couple Goal 💑',
                desc: `${inv.inviter_name} ngajak nabung bareng untuk "${inv.name}" (Rp ${Number(inv.target_amount).toLocaleString('id-ID')})`,
                type: 'invite',
                icon: <Users size={16} className="text-pink-500" />
              });
            });
          }
          if (targetData.success) {
          targetData.data.forEach(t => {
            const cur = Number(t.current_amount);
            const tgt = Number(t.target_amount);
            if(tgt > 0) {
              const percent = Math.floor((cur / tgt) * 100);
              if (percent >= 90 && percent < 100) {
                notifs.push({
                  id: `target-${t.id}`,
                  title: `Target ${t.name} Hampir Tercapai!`,
                  desc: `Sudah mencapai ${percent}%. Dikit lagi bro!`,
                  type: 'success',
                  icon: <Target size={16} className="text-emerald-500" />
                });
              }
            }
          });
        }
        setNotifications(notifs);
      } catch (e) {
        console.error("Failed to fetch notifications:", e);
      }
    };
    fetchNotifs();
  }, [location.pathname]);

  const getPageName = () => {
    switch (location.pathname) {
      case '/': return 'Dashboard';
      case '/transaction': return 'Transaksi';
      case '/target': return 'Target Tabungan';
      case '/bank': return 'Kelola Rekening';
      case '/investment': return 'Investasi';
      case '/bill': return 'Tagihan Rutin';
      case '/report': return 'Laporan Keuangan';
      default: return 'Overview';
    }
  };

    const handleAcceptInvite = async (id, accept) => {
    try {
      await fetch(`${import.meta.env.VITE_API_URL || `http://${window.location.hostname}/BUDGETIN/api`}/financial/react_target.php?${accept ? 'accept_invite' : 'reject_invite'}=1&id=${id}`, { method: 'PUT' });
      window.location.reload();
    } catch(err) {
      console.error(err);
    }
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good Morning';
    if (hour < 15) return 'Good Afternoon';
    if (hour < 18) return 'Good Evening';
    return 'Good Night';
  };

  const handleLogoutConfirm = () => {
    localStorage.removeItem('budgetin_user');
    setShowLogoutModal(false);
    navigate('/login');
  };

  return (
    <>
      
      <header ref={headerRef} className="px-4 md:px-8 py-5 flex justify-between items-center sticky top-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md z-40 border-b border-slate-200 dark:border-slate-800 transition-colors relative">
        <div className="flex items-center gap-3">
          <button className="md:hidden p-2 -ml-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300" onClick={() => setIsSidebarOpen(true)}>
            <Menu size={24} />
          </button>
          <div>
            {location.pathname === '/' ? (
              <p className="text-sm font-semibold text-slate-500 dark:text-slate-400 mb-0.5">{getGreeting()}, Mr. {userProfile.name}</p>
            ) : null}
            <h1 className="text-2xl font-bold text-slate-800 dark:text-white">{getPageName()}</h1>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="relative">
            <button onClick={() => setActiveDropdown(activeDropdown === 'notif' ? null : 'notif')} className="relative w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer">
              <Bell size={20} />
              {notifications.length > 0 && (
                <span className="absolute top-2 right-2.5 w-2 h-2 rounded-full bg-red-500 ring-2 ring-white dark:ring-slate-900"></span>
              )}
            </button>
            {activeDropdown === 'notif' && (
                <>
                  
              <div className="absolute right-[-3.5rem] sm:right-0 mt-2 w-[calc(100vw-2rem)] sm:w-80 max-w-[340px] bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-700 overflow-hidden animate-in fade-in zoom-in-95 slide-in-from-top-2 duration-200 ease-out z-[50]">
                <div className="p-4 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 flex justify-between items-center">
                  <strong className="text-sm font-bold text-slate-800 dark:text-white">Notifikasi</strong>
                  <span className="text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 px-2 py-0.5 rounded-md font-bold">{notifications.length} Baru</span>
                </div>
                <div className="max-h-80 overflow-y-auto custom-scrollbar">
                  {notifications.length > 0 ? (
                    notifications.map(n => (
                      <div key={n.id} onClick={() => { if (n.type !== 'invite') { navigate('/bill'); setActiveDropdown(null); } }} className="p-4 border-b border-slate-100 dark:border-slate-700 last:border-0 hover:bg-slate-50 dark:hover:bg-slate-800/80 transition-colors cursor-pointer flex gap-3">
                        <div className="mt-0.5">{n.icon}</div>
                        <div>
                          <strong className="block text-sm font-bold text-slate-800 dark:text-white mb-0.5">{n.title}</strong>
                          <p className="text-xs text-slate-500 dark:text-slate-400">{n.desc}</p>
                            {n.type === 'invite' && (
                              <div className="flex gap-2 mt-2">
                                <button onClick={() => handleAcceptInvite(n.target_id, true)} className="flex-1 bg-pink-500 hover:bg-pink-600 text-white text-xs font-bold py-1.5 px-3 rounded-lg transition-colors cursor-pointer">Terima</button>
                                <button onClick={() => handleAcceptInvite(n.target_id, false)} className="flex-1 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 text-xs font-bold py-1.5 px-3 rounded-lg transition-colors cursor-pointer">Tolak</button>
                              </div>
                            )}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="p-8 text-center text-slate-500 dark:text-slate-400">
                      <Bell size={24} className="mx-auto mb-2 opacity-50" />
                      <p className="text-sm font-medium">Belum ada notifikasi baru</p>
                      </div>
                    )}
                  </div>
                </div>
                </>
              )}
          </div>
          
          <div className="relative">
            <button onClick={() => setActiveDropdown(activeDropdown === 'profile' ? null : 'profile')} className="flex items-center gap-3 hover:opacity-80 transition-opacity cursor-pointer">
              {userProfile.profile_picture ? (
                  <img src={`http://${window.location.hostname}${userProfile.profile_picture}`} alt="Avatar" className="w-10 h-10 rounded-full object-cover shadow-md shadow-blue-600/30" />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-lg shadow-md shadow-blue-600/30">
                    {userProfile.name.charAt(0)}
                  </div>
                )}
              <div className="hidden md:block text-left">
                <p className="text-sm font-bold text-slate-800 dark:text-white leading-tight">{userProfile.name}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">Personal Account</p>
              </div>
              <ChevronDown size={16} className="text-slate-400" />
            </button>
            {activeDropdown === 'profile' && (
                <>
                  
              <div className="absolute right-0 mt-2 w-[calc(100vw-2rem)] sm:w-56 max-w-[280px] bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-700 overflow-hidden animate-in fade-in zoom-in-95 slide-in-from-top-2 duration-200 ease-out z-[50]">
                <div className="p-4 border-b border-slate-100 dark:border-slate-700">
                  <p className="text-sm font-bold text-slate-800 dark:text-white">{userProfile.name}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{userProfile.email}</p>
                </div>
                <div className="p-2">
                  <button onClick={() => { setActiveDropdown(null); openDrawer('profile'); }} className="w-full flex items-center gap-3 p-2 hover:bg-slate-50 dark:hover:bg-slate-700/50 rounded-xl text-sm font-medium text-slate-700 dark:text-slate-300 transition-colors cursor-pointer">
                    <User size={16} /> Edit Profil
                  </button>
                  <button onClick={() => { setActiveDropdown(null); toggleDarkMode(); }} className="w-full flex items-center gap-3 p-2 hover:bg-slate-50 dark:hover:bg-slate-700/50 rounded-xl text-sm font-medium text-slate-700 dark:text-slate-300 transition-colors cursor-pointer">
                    {isDarkMode ? <Sun size={16} /> : <Moon size={16} />} 
                    {isDarkMode ? 'Mode Terang' : 'Mode Gelap'}
                  </button>
                  <button onClick={() => { setActiveDropdown(null); openDrawer('settings'); }} className="w-full flex items-center gap-3 p-2 hover:bg-slate-50 dark:hover:bg-slate-700/50 rounded-xl text-sm font-medium text-slate-700 dark:text-slate-300 transition-colors cursor-pointer">
                    <Settings size={16} /> Pengaturan
                  </button>
                </div>
                <div className="p-2 border-t border-slate-100 dark:border-slate-700">
                  <button onClick={() => { setActiveDropdown(null); setShowLogoutModal(true); }} className="w-full flex items-center gap-3 p-2 hover:bg-red-50 dark:hover:bg-red-500/10 text-red-600 rounded-xl text-sm font-medium transition-colors cursor-pointer">
                    <LogOut size={16} /> Keluar
                    </button>
                  </div>
                </div>
                </>
              )}
          </div>
        </div>
      </header>
      
      {showLogoutModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-3xl w-full max-w-sm p-8 shadow-2xl animate-in zoom-in-95 duration-300 relative text-center border border-slate-200 dark:border-slate-700">
            <div className="w-20 h-20 bg-red-50 dark:bg-red-500/10 text-red-500 rounded-full flex items-center justify-center mx-auto mb-6">
              <AlertTriangle size={40} />
            </div>
            <h3 className="text-2xl font-bold text-slate-800 dark:text-white mb-2">Keluar Aplikasi?</h3>
            <p className="text-slate-500 dark:text-slate-400 mb-8">Apakah Anda yakin ingin keluar dari Budgetin? Sesi Anda akan diakhiri.</p>
            <div className="flex gap-3">
              <button onClick={() => setShowLogoutModal(false)} className="flex-1 py-3 px-4 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold rounded-xl hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors cursor-pointer">
                Batal
              </button>
              <button onClick={handleLogoutConfirm} className="flex-1 py-3 px-4 bg-red-500 hover:bg-red-600 text-white font-bold rounded-xl shadow-lg shadow-red-500/30 transition-colors cursor-pointer">
                Ya, Keluar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
export default function Layout({ children }) {
  const navigate = useNavigate();
  const location = useLocation();
  // Global State for Profile
  const [userProfile, setUserProfile] = useState(() => {
    const saved = localStorage.getItem('budgetin_user');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (!parsed || typeof parsed !== 'object') {
          return { name: 'Guest', email: 'guest@example.com' };
        }
        if (!parsed.name || parsed.name.toLowerCase() === 'user') {
          parsed.name = (parsed.email && parsed.email.includes('@')) ? parsed.email.split('@')[0] : 'User';
        }
        return parsed;
      } catch(e) { 
        return { name: 'Guest', email: 'guest@example.com' };
      }
    }
    return { name: 'Guest', email: 'guest@example.com' };
  });

  
  useEffect(() => {
    fetch(`${import.meta.env.VITE_API_URL || `http://${window.location.hostname}/BUDGETIN/api`}/financial/react_profile.php`)
      .then(res => res.json())
      .then(data => {
        if (data.success && data.data) {
          setUserProfile(prev => {
            const newProfile = { ...prev, ...data.data };
            localStorage.setItem('budgetin_user', JSON.stringify(newProfile));
            return newProfile;
          });
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem('budgetin_user');
    if (!saved && location.pathname !== '/login') {
      navigate('/login');
    }
  }, [location.pathname, navigate]);
  
  // Dark Mode State
  const [isDarkMode, setIsDarkMode] = useState(() => {
    return localStorage.getItem('budgetin_theme') === 'dark';
  });

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('budgetin_theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('budgetin_theme', 'light');
    }
  }, [isDarkMode]);

  const toggleDarkMode = () => setIsDarkMode(!isDarkMode);

  // Drawer states
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [drawerTab, setDrawerTab] = useState('profile');

  const openDrawer = (tab) => {
    setDrawerTab(tab);
    setIsDrawerOpen(true);
  };

  // Sidebar state
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex transition-colors">
      <Sidebar isOpen={isSidebarOpen} setIsOpen={setIsSidebarOpen} />
      <div className="flex-1 flex flex-col min-w-0 bg-slate-50 dark:bg-slate-900 transition-colors">
                  <Header 
            userProfile={userProfile} 
            openDrawer={openDrawer} 
            isDarkMode={isDarkMode} 
            toggleDarkMode={toggleDarkMode}
            isSidebarOpen={isSidebarOpen}
            setIsSidebarOpen={setIsSidebarOpen}
          />
        <main className="flex-1 p-4 md:p-8 overflow-y-auto overflow-x-hidden">
          {children}
        </main>
      </div>

      <ProfileDrawer 
        isOpen={isDrawerOpen} 
        onClose={() => setIsDrawerOpen(false)} 
        initialTab={drawerTab} 
        userProfile={userProfile}
        onUpdateProfile={setUserProfile}
        isDarkMode={isDarkMode}
        toggleDarkMode={toggleDarkMode}
      />
    </div>
  );
}









