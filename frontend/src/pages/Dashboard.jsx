import React, { useState, useEffect } from 'react';
import {  
  Landmark, Wallet, Target, TrendingUp, 
  ArrowUpRight, ArrowDownRight, Coffee, Briefcase, 
  Smartphone, PieChart, ChevronRight, Zap, ReceiptText, Home as HomeIcon, Car, Laptop, Plane, ShieldCheck
 } from 'lucide-react';
import CustomSelect from '../components/CustomSelect';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, 
  Tooltip, ResponsiveContainer, Area, AreaChart 
} from 'recharts';
import { Link } from 'react-router-dom';

export default function Dashboard() {
  const [chartPeriod, setChartPeriod] = useState('Bulan Ini');
  const [allTransactions, setAllTransactions] = useState([]);
  const [recentTransactions, setRecentTransactions] = useState([]);
  const [bankAccounts, setBankAccounts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Dynamic Chart Data state
  const [activeChartData, setActiveChartData] = useState([]);
  const [totalIncome, setTotalIncome] = useState(0);
  const [totalExpense, setTotalExpense] = useState(0);

  // Dynamic Totals State
  const [totalBank, setTotalBank] = useState(0);
  const [totalTarget, setTotalTarget] = useState(0);
  const [totalInvestment, setTotalInvestment] = useState(0);
  const [realTargets, setRealTargets] = useState([]);


    // Mock targets for Target Kapsul Concept
  const [targets] = useState([
    { id: 1, name: 'Macbook Pro', icon: <Laptop size={28} className="text-blue-500" />, current: 15000000, total: 20000000, ringColor: '#3b82f6' },
    { id: 2, name: 'Liburan Bali', icon: <Plane size={28} className="text-emerald-500" />, current: 3000000, total: 5000000, ringColor: '#10b981' },
    { id: 3, name: 'DP Mobil', icon: <Car size={28} className="text-purple-500" />, current: 10000000, total: 50000000, ringColor: '#a855f7' },
    { id: 4, name: 'Dana Darurat', icon: <ShieldCheck size={28} className="text-orange-500" />, current: 8000000, total: 10000000, ringColor: '#f59e0b' },
  ]);

  const getCategoryIcon = (catId) => {
    switch (catId) {
      case 'food': return <Coffee size={20} className="text-orange-500"/>;
      case 'transport': return <Car size={20} className="text-blue-500"/>;
      case 'groceries': return <ReceiptText size={20} className="text-purple-500"/>;
      case 'bills': return <Zap size={20} className="text-yellow-500"/>;
      case 'salary': return <Briefcase size={20} className="text-emerald-500"/>;
      default: return <HomeIcon size={20} className="text-slate-500"/>;
    }
  };

  
  useEffect(() => {
    // Check telegram reminders quietly in the background
    fetch(`${import.meta.env.VITE_API_URL || `http://${window.location.hostname}/BUDGETIN/api`}/financial/react_check_reminders.php`).catch(() => {});
  }, []);

  useEffect(() => {
    const fetchDashboardData = async () => {
      setIsLoading(true);
      try {
        const [txRes, bankRes, targetRes, invRes] = await Promise.all([
          fetch(`${import.meta.env.VITE_API_URL || `http://${window.location.hostname}/BUDGETIN/api`}/financial/react_transaction.php`),
          fetch(`${import.meta.env.VITE_API_URL || `http://${window.location.hostname}/BUDGETIN/api`}/financial/react_bank.php`),
          fetch(`${import.meta.env.VITE_API_URL || `http://${window.location.hostname}/BUDGETIN/api`}/financial/react_target.php`),
          fetch(`${import.meta.env.VITE_API_URL || `http://${window.location.hostname}/BUDGETIN/api`}/financial/react_investment.php`)
        ]);
        const txData = await txRes.json();
        const bankData = await bankRes.json();
        const targetData = await targetRes.json();
        const invData = await invRes.json();
        
        if (txData.success) {
          setAllTransactions(txData.data);
          setRecentTransactions(txData.data.slice(0, 5));
        }
        if (bankData.success) {
          setBankAccounts(bankData.data.slice(0, 3));
          
          // SUM BANKS
          const tBank = bankData.data.reduce((acc, curr) => acc + (Number(curr.balance) || 0), 0);
          setTotalBank(tBank);
        }
        
                if (targetData.success) {
          const formattedTargets = targetData.data.map(t => ({
             id: t.id,
             name: t.name,
             current: Number(t.current_amount),
             target: Number(t.target_amount),
             image: t.image_url
          }));
          setRealTargets(formattedTargets);
          const tTarget = formattedTargets.reduce((acc, curr) => acc + (curr.current || 0), 0);
          setTotalTarget(tTarget);
        }
        
        if (invData.success) {
          const tInvest = invData.data.reduce((acc, curr) => {
            let u = Number(curr.total_units) || 0;
            if (curr.type === 'stock') u = u * 100;
            return acc + (u * (Number(curr.current_price) || 0));
          }, 0);
          setTotalInvestment(tInvest);
        }
      } catch (e) {
        console.error("Dashboard fetch error:", e);
      } finally {
        setIsLoading(false);
      }
    };
    fetchDashboardData();
  }, []);

  // Compute Chart Data when Period or Transactions change
  useEffect(() => {
    

        let groupedData = {};
      let inc = 0;
      let exp = 0;
  
      const now = new Date();
      
      if (chartPeriod === 'Minggu Ini') {
        ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'].forEach(d => groupedData[d] = { name: d, income: 0, expense: 0 });
      } else if (chartPeriod === 'Bulan Ini') {
        ['1', '5', '10', '15', '20', '25', '30'].forEach(d => groupedData[d] = { name: d, income: 0, expense: 0 });
      } else if (chartPeriod === 'Tahun Ini') {
        ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Ags', 'Sep', 'Okt', 'Nov', 'Des'].forEach(d => groupedData[d] = { name: d, income: 0, expense: 0 });
      }
      
      allTransactions.forEach(tx => {
        const txDate = new Date(tx.transaction_date);
        const amount = Number(tx.amount);
        
        let key = '';
        
        if (chartPeriod === 'Minggu Ini') {
          if (txDate.getMonth() === now.getMonth() && txDate.getFullYear() === now.getFullYear()) {
            const daysAgo = Math.floor((now - txDate) / (1000 * 60 * 60 * 24));
            if (daysAgo <= 7) {
              const days = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
              key = days[txDate.getDay()];
            }
          }
        } else if (chartPeriod === 'Bulan Ini') {
          if (txDate.getMonth() === now.getMonth() && txDate.getFullYear() === now.getFullYear()) {
            let dateNum = txDate.getDate();
            if(dateNum <= 5) key = '5';
            else if(dateNum <= 10) key = '10';
            else if(dateNum <= 15) key = '15';
            else if(dateNum <= 20) key = '20';
            else if(dateNum <= 25) key = '25';
            else key = '30';
          }
        } else if (chartPeriod === 'Tahun Ini') {
          if (txDate.getFullYear() === now.getFullYear()) {
            const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Ags', 'Sep', 'Okt', 'Nov', 'Des'];
            key = months[txDate.getMonth()];
          }
        }
  
        if (key && groupedData[key]) {
          if (tx.type === 'income') {
            groupedData[key].income += amount;
            inc += amount;
          } else {
            groupedData[key].expense += amount;
            exp += amount;
          }
        }
      });
      
      const sortedData = Object.values(groupedData);
    
    setActiveChartData(sortedData);
    setTotalIncome(inc);
    setTotalExpense(exp);

  }, [chartPeriod, allTransactions]);

  return (
    <div className="w-full 2xl:max-w-screen-2xl mx-auto space-y-6">
      
      {/* ================= TOTAL KEKAYAAN ================= */}
      <div className="bg-slate-900 dark:bg-slate-950 rounded-3xl p-5 md:p-4 md:p-8 text-white shadow-xl relative overflow-hidden transition-colors border border-slate-800/50 dark:border-slate-800">
        <div className="absolute top-0 right-0 p-12 opacity-5 pointer-events-none">
          <Landmark size={200} />
        </div>
        
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 md:mb-8 gap-4 md:gap-0 relative z-10">
          <div>
            <p className="text-slate-400 font-medium text-sm uppercase tracking-wider mb-2">Total Kekayaan</p>
            <h2 className="text-3xl md:text-5xl font-bold truncate">Rp {(totalBank + totalTarget + totalInvestment).toLocaleString('id-ID', {maximumFractionDigits:0})}</h2>
          </div>
          <Link to="/bank" className="bg-white/10 hover:bg-white/20 text-white px-5 py-2.5 rounded-full text-sm font-semibold transition-colors flex items-center gap-2 cursor-pointer border border-white/10">
            Lihat Rekening <ChevronRight size={16} />
          </Link>
        </div>
        
        <div className="flex overflow-x-auto md:grid md:grid-cols-3 gap-4 relative z-10 pb-2 md:pb-0 custom-scrollbar snap-x">
          <div className="bg-white/5 border border-white/10 p-4 md:p-5 rounded-2xl flex items-center gap-3 md:gap-4 hover:bg-white/10 transition-colors shrink-0 w-[200px] md:w-auto snap-center">
            <div className="w-12 h-12 bg-blue-500/20 text-blue-400 rounded-xl flex items-center justify-center">
              <Wallet size={24} />
            </div>
            <div>
              <p className="text-slate-400 text-xs mb-1">Rekening</p>
              <h3 className="text-lg md:text-xl font-bold whitespace-nowrap truncate">Rp {totalBank.toLocaleString('id-ID', {maximumFractionDigits:0})}</h3>
            </div>
          </div>
          
          <div className="bg-white/5 border border-white/10 p-4 md:p-5 rounded-2xl flex items-center gap-3 md:gap-4 hover:bg-white/10 transition-colors shrink-0 w-[200px] md:w-auto snap-center">
            <div className="w-12 h-12 bg-purple-500/20 text-purple-400 rounded-xl flex items-center justify-center">
              <Target size={24} />
            </div>
            <div>
              <p className="text-slate-400 text-xs mb-1">Tabungan Target</p>
              <h3 className="text-lg md:text-xl font-bold whitespace-nowrap truncate">Rp {totalTarget.toLocaleString('id-ID', {maximumFractionDigits:0})}</h3>
            </div>
          </div>
          
          <div className="bg-white/5 border border-white/10 p-4 md:p-5 rounded-2xl flex items-center gap-3 md:gap-4 hover:bg-white/10 transition-colors shrink-0 w-[200px] md:w-auto snap-center">
            <div className="w-12 h-12 bg-emerald-500/20 text-emerald-400 rounded-xl flex items-center justify-center">
              <TrendingUp size={24} />
            </div>
            <div>
              <p className="text-slate-400 text-xs mb-1">Investasi</p>
              <h3 className="text-lg md:text-xl font-bold whitespace-nowrap truncate">Rp {totalInvestment.toLocaleString('id-ID', {maximumFractionDigits:0})}</h3>
            </div>
          </div>
        </div>
      </div>

      {/* ================= TARGET KAPSUL (SMART TARGET TRACKER) ================= */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-4 md:p-4 md:p-6 lg:p-4 md:p-8 border border-slate-200 dark:border-slate-800 shadow-sm transition-colors">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
            <Target size={24} className="text-purple-500" /> Target Impian
          </h2>
          <Link to="/target" className="text-sm font-semibold text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300">Lihat Semua</Link>
        </div>
        
        {/* Horizontal Scrollable Capsules */}
        <div className="flex gap-4 overflow-x-auto pb-4 custom-scrollbar snap-x">
          {realTargets.length === 0 ? (<div className="w-full text-center py-8 text-slate-500">Belum ada target impian. Yuk, mulai menabung!</div>) : realTargets.map(target => {
            const currentVal = target.current || 0;
            const targetVal = target.target || target.total || 1;
            const remains = targetVal - currentVal;
            const percent = Math.min(100, (currentVal / targetVal) * 100);
            const isCompleted = percent >= 100;
            
            
            return (
              <div 
                key={target.id} 
                className="group relative flex-shrink-0 w-60 md:w-64 p-4 md:p-5 rounded-3xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 hover:bg-white dark:hover:bg-slate-800 hover:shadow-xl hover:border-purple-200 dark:hover:border-purple-500/30 transition-all cursor-pointer snap-center overflow-hidden"
              >
                {/* Progress Background Sweep */}
                <div 
                  className="absolute bottom-0 left-0 h-1 bg-gradient-to-r from-purple-500 to-blue-500 transition-all duration-1000 ease-out" 
                  style={{ width: `${percent}%` }}
                />

                <div className="flex justify-between items-start mb-4">
                  <div className="w-14 h-14 rounded-2xl bg-white dark:bg-slate-700 shadow-sm flex items-center justify-center text-3xl z-10 relative">
                    {/* SVG Ring Progress */}
                    <svg className="absolute inset-0 w-full h-full -rotate-90 transform" viewBox="0 0 100 100">
                      <circle cx="50" cy="50" r="46" fill="transparent" stroke="currentColor" strokeWidth="8" className="text-slate-100 dark:text-slate-600" />
                      <circle 
                        cx="50" cy="50" r="46" 
                        fill="transparent" 
                        stroke={target.ringColor || "#8b5cf6"} 
                        strokeWidth="8" 
                        strokeDasharray="289" 
                        strokeDashoffset={289 - (289 * percent) / 100}
                        strokeLinecap="round"
                        className="transition-all duration-1000 ease-out"
                      />
                    </svg>
                    {target.image ? <img src={target.image} alt={target.name} className="w-10 h-10 object-cover rounded-xl z-20" /> : (target.icon || "??")}
                  </div>
                  <div className="text-right">
                    <strong className="block text-2xl font-bold text-slate-800 dark:text-white">
                      {Math.floor(percent)}<span className="text-sm">%</span>
                    </strong>
                  </div>
                </div>
                
                <h3 className="font-bold text-slate-800 dark:text-white text-lg mb-1">{target.name}</h3>
                
                {/* Default State */}
                <div className="block group-hover:hidden transition-all text-sm text-slate-500 dark:text-slate-400 font-medium">
                  Rp {(currentVal / 1000000).toFixed(1)}jt / Rp {(targetVal / 1000000).toFixed(1)}jt
                </div>
                
                {/* Hover State (Kurang) */}
                <div className="hidden group-hover:block transition-all text-sm text-purple-600 dark:text-purple-400 font-bold animate-in fade-in slide-in-from-bottom-1">
                  {isCompleted ? 'Target Tercapai!' : `Kurang Rp ${(remains / 1000000).toFixed(1)}jt lagi`}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:p-6">
        
        {/* ================= CASH FLOW CHART ================= */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 rounded-3xl p-5 md:p-4 md:p-8 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col transition-colors">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold text-slate-800 dark:text-white">Cash Flow</h2>
            <CustomSelect 
              value={chartPeriod} 
              onChange={(e) => setChartPeriod(e.target.value)}
              className="px-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-sm font-medium outline-none cursor-pointer transition-colors"
              options={[
                {value: 'Minggu Ini', label: 'Minggu Ini'},
                {value: 'Bulan Ini', label: 'Bulan Ini'},
                {value: 'Tahun Ini', label: 'Tahun Ini'}
              ]}
            />
          </div>
          
          <div className="flex flex-wrap gap-4 md:gap-4 md:p-8 mb-6 md:mb-8">
            <div>
              <small className="flex items-center gap-1 text-slate-500 dark:text-slate-400 font-medium mb-1">
                <ArrowDownRight size={16} className="text-emerald-500" /> Pemasukan
              </small>
              <strong className="text-2xl text-emerald-600 dark:text-emerald-500 font-bold">Rp {totalIncome.toLocaleString('id-ID')}</strong>
            </div>
            <div>
              <small className="flex items-center gap-1 text-slate-500 dark:text-slate-400 font-medium mb-1">
                <ArrowUpRight size={16} className="text-red-500" /> Pengeluaran
              </small>
              <strong className="text-2xl text-red-600 dark:text-red-500 font-bold">Rp {totalExpense.toLocaleString('id-ID')}</strong>
            </div>
          </div>

          <div className="flex-1 min-h-[250px] w-full mt-4">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={activeChartData} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorIncome" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorExpense" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 12}} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 12}} tickFormatter={(val) => `Rp ${val / 1000000}M`} />
                <Tooltip 
                  contentStyle={{ backgroundColor: 'var(--color-slate-800)', borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.3)' }}
                  itemStyle={{ color: '#fff' }}
                  labelStyle={{ color: '#94a3b8' }}
                  formatter={(value) => [`Rp ${value.toLocaleString('id-ID')}`, undefined]}
                />
                <Area type="monotone" dataKey="income" name="Pemasukan" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorIncome)" />
                <Area type="monotone" dataKey="expense" name="Pengeluaran" stroke="#ef4444" strokeWidth={3} fillOpacity={1} fill="url(#colorExpense)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* ================= SIDE WIDGETS ================= */}
        <div className="space-y-6 flex flex-col">
          
          {/* Laporan Keuangan Card */}
          <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-3xl p-4 md:p-4 md:p-6 text-white shadow-lg shadow-blue-500/20 relative overflow-hidden group">
            <div className="absolute -right-4 -bottom-4 opacity-20 transform group-hover:scale-110 transition-transform duration-500">
              <PieChart size={100} />
            </div>
            <div className="relative z-10">
              <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center mb-4 backdrop-blur-sm">
                <PieChart size={24} className="text-white" />
              </div>
              <small className="block text-blue-100 font-medium mb-1">Laporan Keuangan</small>
              <strong className="block text-xl mb-2 leading-tight">Lihat ringkasan keuangan kamu</strong>
              <span className="text-xs text-blue-100 block mb-6">Pemasukan &bull; Pengeluaran &bull; Investasi</span>
              
              <Link to="/report" className="inline-flex bg-white text-blue-600 hover:bg-blue-50 px-5 py-2.5 rounded-xl text-sm font-bold transition-colors shadow-sm items-center gap-2">
                Buka Laporan <ArrowUpRight size={16} />
              </Link>
            </div>
          </div>

          {/* Rekening Ringkas */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-4 md:p-4 md:p-6 border border-slate-200 dark:border-slate-800 shadow-sm flex-1 transition-colors">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
                <Landmark size={20} className="text-blue-500" /> Rekening
              </h3>
              <Link to="/bank" className="text-sm font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300">Semua</Link>
            </div>
            
            <div className="space-y-4 min-h-[200px]">
              {isLoading ? (
                <div className="flex justify-center items-center h-full">
                  <div className="w-6 h-6 border-4 border-slate-200 border-t-blue-500 rounded-full animate-spin"></div>
                </div>
              ) : bankAccounts.map((bank, i) => {
                const getBankCode = (name) => {
                  if (name.toLowerCase().includes('mandiri')) return 'MDR';
                  if (name.toLowerCase().includes('ovo') || name.toLowerCase().includes('gopay')) return 'E-W';
                  return name.substring(0,3).toUpperCase();
                };
                const bgColors = ['bg-blue-100 text-blue-600', 'bg-yellow-100 text-yellow-600', 'bg-purple-100 text-purple-600'];
                const bCol = bgColors[i % bgColors.length];
                
                return (
                  <div key={bank.id} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-lg ${bCol} dark:bg-opacity-30 dark:text-opacity-80 flex items-center justify-center font-bold text-xs`}>
                        {getBankCode(bank.name)}
                      </div>
                      <div>
                        <strong className="block text-sm font-bold text-slate-800 dark:text-white">{bank.name}</strong>
                        <small className="text-xs text-slate-500 dark:text-slate-400">**** ****</small>
                      </div>
                    </div>
                    <strong className="text-sm font-bold text-slate-800 dark:text-white">Rp {(bank.balance / 1000000).toFixed(1)}M</strong>
                  </div>
                );
              })}
            </div>
          </div>

        </div>
      </div>

      {/* ================= RECENT TRANSACTIONS ================= */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 md:p-4 md:p-8 border border-slate-200 dark:border-slate-800 shadow-sm transition-colors min-h-[300px]">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-slate-800 dark:text-white">Transaksi Terakhir</h2>
          <Link to="/transaction" className="text-blue-600 dark:text-blue-400 text-sm font-semibold hover:bg-blue-50 dark:hover:bg-blue-900/30 px-4 py-2 rounded-lg transition-colors cursor-pointer">
            Lihat Semua
          </Link>
        </div>
        
        <div className="flex flex-col gap-0 divide-y divide-slate-100 dark:divide-slate-800/60">
          {isLoading ? (
            <div className="flex justify-center items-center h-40">
              <div className="w-8 h-8 border-4 border-slate-200 border-t-blue-500 rounded-full animate-spin"></div>
            </div>
          ) : recentTransactions.map((tx) => (
            <div key={tx.id} className="flex items-center py-3 md:py-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer px-2 rounded-xl group">
              <div className="w-8 h-8 md:w-12 md:h-12 rounded-md md:rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mr-2 md:mr-4 shrink-0 group-hover:bg-white dark:group-hover:bg-slate-700 group-hover:shadow-sm border border-transparent group-hover:border-slate-200 dark:group-hover:border-slate-600 transition-all">
                {getCategoryIcon(tx.category)}
              </div>
              <div className="flex-1 min-w-0 pr-2">
                <strong className="block text-[13px] md:text-base text-slate-800 dark:text-white font-semibold line-clamp-2 md:truncate">{tx.note || tx.category}</strong>
                <small className="block text-[11px] md:text-sm text-slate-500 dark:text-slate-400 truncate">{tx.category} &bull; {tx.wallet_name}</small>
              </div>
              <div className={`font-bold text-[13px] md:text-base shrink-0 whitespace-nowrap ${tx.type === 'income' ? 'text-emerald-500' : 'text-slate-800 dark:text-white'}`}>
                {tx.type === 'income' ? '+' : '-'}Rp {Number(tx.amount).toLocaleString('id-ID')}
              </div>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}























