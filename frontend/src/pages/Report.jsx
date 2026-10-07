import React, { useState, useEffect, useMemo } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { 
  TrendingUp, TrendingDown, DollarSign, PieChart as PieChartIcon, 
  Download, Calendar, Briefcase, Activity, Target, ShieldCheck, 
  ArrowUpRight, ArrowDownRight, Wallet, Percent, FileText
} from 'lucide-react';

const CAT_LABELS = {
  'food': 'Makanan & Minuman',
  'transport': 'Transportasi',
  'shopping': 'Belanja',
  'bills': 'Tagihan Rutin',
  'entertainment': 'Hiburan',
  'investment': 'Investasi',
};
export default function Report() {
  const [transactions, setTransactions] = useState([]);
  const [investments, setInvestments] = useState([]);
  const [banks, setBanks] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  // Filter states
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  const months = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  const years = [2024, 2025, 2026, 2027];

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        // Fetch Tx
        const txRes = await fetch(`${import.meta.env.VITE_API_URL || `http://${window.location.hostname}/BUDGETIN/api`}/financial/react_transaction.php`);
        const txData = await txRes.json();
        if (txData.success) setTransactions(txData.data);

        // Fetch Banks
        const bRes = await fetch(`${import.meta.env.VITE_API_URL || `http://${window.location.hostname}/BUDGETIN/api`}/financial/react_bank.php`);
        const bData = await bRes.json();
        if (bData.success) setBanks(bData.data);

        // Fetch Investments (API)
        const invRes = await fetch(`${import.meta.env.VITE_API_URL || `http://${window.location.hostname}/BUDGETIN/api`}/financial/react_investment.php`);
        const invData = await invRes.json();
        if (invData.success) {
          setInvestments(invData.data.map(i => ({
            ...i,
            totalUnits: Number(i.total_units),
            avgPrice: Number(i.avg_price),
            currentPrice: Number(i.current_price)
          })));
        }

      } catch (e) {
        console.error(e);
      }
      setIsLoading(false);
    };
    fetchData();
  }, []);

  // Compute Metrics based on selected month/year
  const filteredTx = useMemo(() => {
    return transactions.filter(tx => {
      const date = new Date(tx.transaction_date);
      return date.getMonth() === selectedMonth && date.getFullYear() === selectedYear;
    });
  }, [transactions, selectedMonth, selectedYear]);

  const { income, expense, expenseByCategory } = useMemo(() => {
    let inc = 0;
    let exp = 0;
    let byCat = {};

    filteredTx.forEach(tx => {
      const amt = Number(tx.amount);
      if (tx.type === 'income') {
        inc += amt;
      } else {
        exp += amt;
        const cat = tx.category || 'Lainnya';
        byCat[cat] = (byCat[cat] || 0) + amt;
      }
    });

    return { income: inc, expense: exp, expenseByCategory: byCat };
  }, [filteredTx]);

  const netCashFlow = income - expense;
  const savingsRate = income > 0 ? ((netCashFlow / income) * 100).toFixed(1) : 0;

  // Compute Investment Metrics (Not strictly filtered by month, since portfolio is absolute)
  const { totalCost, totalValue, unrealizedPnL, pnlPercent } = useMemo(() => {
    let cost = 0;
    let val = 0;
    investments.forEach(inv => {
      const qty = Number(inv.totalUnits || 0);
      cost += qty * Number(inv.avgPrice || 0);
      val += qty * Number(inv.currentPrice || inv.avgPrice || 0);
    });
    
    // Check local market-price updates if available from localStorage cache?
    // Actually we'll just use what's saved in investments state (which Investment.jsx updates).
    
    const pnl = val - cost;
    const pct = cost > 0 ? ((pnl / cost) * 100).toFixed(2) : 0;
    return { totalCost: cost, totalValue: val, unrealizedPnL: pnl, pnlPercent: pct };
  }, [investments]);

  // Asset Allocation
  const assetAllocation = useMemo(() => {
    const alloc = {};
    let total = 0;
    investments.forEach(inv => {
      const qty = Number(inv.totalUnits || 0);
      const val = qty * Number(inv.currentPrice || inv.avgPrice || 0);
      const type = inv.type || 'Lainnya';
      alloc[type] = (alloc[type] || 0) + val;
      total += val;
    });
    return Object.entries(alloc).map(([name, value]) => ({
      name,
      value,
      percent: total > 0 ? ((value / total) * 100).toFixed(1) : 0
    })).sort((a,b) => b.value - a.value);
  }, [investments]);

  const COLORS = {
    'food': 'bg-orange-500',
    'transport': 'bg-blue-500',
    'shopping': 'bg-pink-500',
    'bills': 'bg-red-500',
    'entertainment': 'bg-purple-500',
    'investment': 'bg-emerald-500',
    'stock': 'bg-blue-600',
    'gold': 'bg-yellow-500',
    'mutualfund': 'bg-emerald-500',
    'bond': 'bg-purple-500',
    'Lainnya': 'bg-slate-400'
  };

  // Convert categories object to array sorted by amount
  const sortedCategories = Object.entries(expenseByCategory)
    .map(([cat, amt]) => ({
      id: cat,
      name: CAT_LABELS[cat] || cat,
      amount: amt,
      percent: expense > 0 ? ((amt / expense) * 100).toFixed(1) : 0
    }))
    .sort((a,b) => b.amount - a.amount);

  const topExpense = sortedCategories.length > 0 ? sortedCategories[0] : null;

    const handleExportPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(22);
    doc.setTextColor(37, 99, 235);
    doc.text(`Budgetin - Laporan Keuangan`, 14, 22);
    
    doc.setFontSize(11);
    doc.setTextColor(100);
    doc.text(`Periode: ${months[selectedMonth]} ${selectedYear}`, 14, 30);
    doc.text(`Total Pemasukan: Rp ${income.toLocaleString('id-ID')}`, 14, 36);
    doc.text(`Total Pengeluaran: Rp ${expense.toLocaleString('id-ID')}`, 14, 42);
    doc.text(`Net Cash Flow: Rp ${netCashFlow.toLocaleString('id-ID')}`, 14, 48);
    
    const tableColumn = ["Tanggal", "Kategori", "Tipe", "Nominal (Rp)", "Dompet/Bank", "Catatan"];
    const tableRows = [];

    filteredTx.forEach(tx => {
      tableRows.push([
        tx.transaction_date,
        CAT_LABELS[tx.category] || tx.category,
        tx.type === 'income' ? 'Pemasukan' : 'Pengeluaran',
        Number(tx.amount).toLocaleString('id-ID'),
        tx.wallet_name || '-',
        tx.note || '-'
      ]);
    });

    autoTable(doc, {
      startY: 55,
      head: [tableColumn],
      body: tableRows,
      theme: 'grid',
      headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      styles: { fontSize: 9 }
    });

    doc.save(`Laporan_Keuangan_${months[selectedMonth]}_${selectedYear}.pdf`);
  };

  const handleExportExcel = () => {
    const dataToExport = filteredTx.map(tx => ({
      Tanggal: tx.transaction_date,
      Kategori: CAT_LABELS[tx.category] || tx.category,
      Tipe: tx.type === 'income' ? 'Pemasukan' : 'Pengeluaran',
      'Nominal (Rp)': Number(tx.amount),
      'Dompet / Bank': tx.wallet_name || '-',
      Catatan: tx.note || '-'
    }));

    // Add Summary Row at bottom
    dataToExport.push({ Tanggal: '', Kategori: '', Tipe: '', 'Nominal (Rp)': null, 'Dompet / Bank': '', Catatan: '' });
    dataToExport.push({ Tanggal: 'TOTAL PEMASUKAN', Kategori: '', Tipe: '', 'Nominal (Rp)': income, 'Dompet / Bank': '', Catatan: '' });
    dataToExport.push({ Tanggal: 'TOTAL PENGELUARAN', Kategori: '', Tipe: '', 'Nominal (Rp)': expense, 'Dompet / Bank': '', Catatan: '' });
    dataToExport.push({ Tanggal: 'NET CASH FLOW', Kategori: '', Tipe: '', 'Nominal (Rp)': netCashFlow, 'Dompet / Bank': '', Catatan: '' });

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    
    // Auto-width for columns
    const wscols = [
      {wch:15}, {wch:20}, {wch:15}, {wch:20}, {wch:15}, {wch:35}
    ];
    worksheet['!cols'] = wscols;

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Laporan Keuangan");
    
    XLSX.writeFile(workbook, `Laporan_Keuangan_${months[selectedMonth]}_${selectedYear}.xlsx`);
  };

  if (isLoading) {
    return <div className="flex items-center justify-center h-[60vh]"><div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div></div>;
  }

  return (
    <div className="w-full 2xl:max-w-screen-2xl mx-auto space-y-8 pb-20">
      
      {/* HEADER & FILTER */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-4 md:p-6 shadow-sm border border-slate-200 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4 animate-in fade-in slide-in-from-top-4">
        <div>
          <h2 className="text-2xl font-black text-slate-800 dark:text-white flex items-center gap-3">
            <PieChartIcon className="text-blue-600" size={28} />
            Analytics & Reports
          </h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">Laporan komprehensif arus kas dan performa aset investasi.</p>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 p-1.5 rounded-xl border border-slate-200 dark:border-slate-700">
            <Calendar size={18} className="text-slate-500 ml-2" />
            <select value={selectedMonth} onChange={e => setSelectedMonth(Number(e.target.value))} className="bg-transparent text-sm font-bold text-slate-800 dark:text-white outline-none cursor-pointer p-2">
              {months.map((m, i) => <option key={i} value={i}>{m}</option>)}
            </select>
            <select value={selectedYear} onChange={e => setSelectedYear(Number(e.target.value))} className="bg-transparent text-sm font-bold text-slate-800 dark:text-white outline-none cursor-pointer p-2 border-l border-slate-300 dark:border-slate-600">
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
                      <div className="flex items-center gap-2">
              <button onClick={handleExportExcel} className="bg-emerald-600 text-white px-4 py-3 rounded-xl text-sm font-bold shadow-lg shadow-emerald-600/30 hover:-translate-y-1 hover:shadow-xl transition-all flex items-center gap-2 cursor-pointer">
                <FileText size={16} /> <span className="hidden sm:inline">Export Excel</span>
              </button>
              <button onClick={handleExportPDF} className="bg-red-600 text-white px-4 py-3 rounded-xl text-sm font-bold shadow-lg shadow-red-600/30 hover:-translate-y-1 hover:shadow-xl transition-all flex items-center gap-2 cursor-pointer">
                <Download size={16} /> <span className="hidden sm:inline">Export PDF</span>
              </button>
            </div>
        </div>
      </div>

      {/* SECTION 1: RINGKASAN CASHFLOW */}
      <div>
        <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
          <Wallet size={20} className="text-blue-500" /> Ringkasan Arus Kas
        </h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-slate-800 p-4 md:p-5 rounded-3xl border border-slate-100 dark:border-slate-700 shadow-sm relative overflow-hidden group">
            <div className="absolute -right-4 -top-4 w-20 h-20 bg-emerald-500/10 rounded-full blur-xl group-hover:bg-emerald-500/20 transition-all"></div>
            <p className="text-slate-500 dark:text-slate-400 text-sm font-semibold mb-1">Total Pemasukan</p>
            <h4 className="text-xl md:text-2xl font-black text-slate-800 dark:text-white mb-2 whitespace-nowrap truncate">Rp {income.toLocaleString('id-ID')}</h4>
            <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600 bg-emerald-100 dark:bg-emerald-500/20 px-2 py-1 rounded-md">
              <TrendingUp size={12} /> {filteredTx.filter(t=>t.type==='income').length} Transaksi
            </span>
          </div>
          
          <div className="bg-white dark:bg-slate-800 p-4 md:p-5 rounded-3xl border border-slate-100 dark:border-slate-700 shadow-sm relative overflow-hidden group">
            <div className="absolute -right-4 -top-4 w-20 h-20 bg-red-500/10 rounded-full blur-xl group-hover:bg-red-500/20 transition-all"></div>
            <p className="text-slate-500 dark:text-slate-400 text-sm font-semibold mb-1">Total Pengeluaran</p>
            <h4 className="text-xl md:text-2xl font-black text-slate-800 dark:text-white mb-2 whitespace-nowrap truncate">Rp {expense.toLocaleString('id-ID')}</h4>
            <span className="inline-flex items-center gap-1 text-xs font-bold text-red-600 bg-red-100 dark:bg-red-500/20 px-2 py-1 rounded-md">
              <TrendingDown size={12} /> {filteredTx.filter(t=>t.type==='expense').length} Transaksi
            </span>
          </div>

          <div className="bg-slate-900 dark:bg-slate-950 p-5 rounded-3xl border border-slate-800 shadow-lg relative overflow-hidden group col-span-2 md:col-span-1">
            <div className="absolute -right-10 -bottom-10 w-32 h-32 bg-blue-500/20 rounded-full blur-2xl group-hover:bg-blue-500/30 transition-all"></div>
            <p className="text-slate-300 text-sm font-semibold mb-1">Net Cash Flow</p>
            <h4 className={`text-2xl md:text-3xl font-black mb-2 whitespace-nowrap truncate ${netCashFlow >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>Rp {netCashFlow.toLocaleString('id-ID')}</h4>
            <p className="text-xs text-slate-400 font-medium">Sisa uang murni bulan ini</p>
          </div>

          <div className="bg-blue-600 dark:bg-blue-700 p-5 rounded-3xl shadow-lg shadow-blue-600/30 relative overflow-hidden group col-span-2 md:col-span-1">
            <div className="absolute right-0 top-0 w-32 h-32 bg-white/10 rounded-full blur-2xl group-hover:bg-white/20 transition-all"></div>
            <p className="text-blue-100 text-sm font-semibold mb-1">Savings Rate</p>
            <h4 className="text-2xl md:text-3xl font-black text-white mb-2 flex items-baseline gap-1 whitespace-nowrap">
              {savingsRate} <span className="text-xl">%</span>
            </h4>
            <p className="text-xs text-blue-200 font-medium">Dari total pemasukan ditabung</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:p-8">
        
        {/* SECTION 2: EXPENSE ANALYTICS */}
        <div>
          <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
            <Activity size={20} className="text-red-500" /> Analisis Pengeluaran
          </h3>
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-4 md:p-6 shadow-sm border border-slate-200 dark:border-slate-800 h-full">
            
            {sortedCategories.length > 0 ? (
              <>
                <div className="mb-6 flex justify-between items-end">
                  <div>
                    <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">Pengeluaran Terbesar</p>
                    <h4 className="text-xl font-bold text-slate-800 dark:text-white">{topExpense.name}</h4>
                  </div>
                  <div className="text-right">
                    <strong className="text-lg text-red-600 dark:text-red-400 font-black">Rp {topExpense.amount.toLocaleString('id-ID')}</strong>
                    <p className="text-xs font-bold text-slate-500">{topExpense.percent}% dari total</p>
                  </div>
                </div>

                {/* Stacked Progress Bar */}
                <div className="w-full h-4 bg-slate-100 dark:bg-slate-800 rounded-full flex overflow-hidden mb-8 shadow-inner">
                  {sortedCategories.map(cat => (
                    <div 
                      key={cat.id} 
                      style={{ width: `${cat.percent}%` }} 
                      className={`${COLORS[cat.id] || COLORS['Lainnya']} h-full transition-all hover:opacity-80`}
                      title={`${cat.name}: ${cat.percent}%`}
                    ></div>
                  ))}
                </div>

                {/* Breakdown List */}
                <div className="space-y-4 max-h-64 overflow-y-auto custom-scrollbar pr-2">
                  {sortedCategories.map(cat => (
                    <div key={cat.id} className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-3 h-3 rounded-full ${COLORS[cat.id] || COLORS['Lainnya']}`}></div>
                        <div>
                          <p className="text-sm font-bold text-slate-800 dark:text-white">{cat.name}</p>
                          <p className="text-xs text-slate-500 font-medium">{cat.percent}%</p>
                        </div>
                      </div>
                      <strong className="text-sm font-bold text-slate-800 dark:text-slate-300">Rp {cat.amount.toLocaleString('id-ID')}</strong>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center h-48 text-center">
                <div className="w-12 h-12 bg-slate-50 dark:bg-slate-800 rounded-full flex items-center justify-center text-slate-400 mb-3">
                  <FileText size={24} />
                </div>
                <p className="text-slate-500 dark:text-slate-400 font-medium text-sm">Belum ada data pengeluaran<br/>di bulan ini.</p>
              </div>
            )}
          </div>
        </div>

        {/* SECTION 3: INVESTMENT PORTFOLIO */}
        <div>
          <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
            <Briefcase size={20} className="text-emerald-500" /> Performa Portfolio (Global)
          </h3>
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-4 md:p-6 shadow-sm border border-slate-200 dark:border-slate-800 h-full flex flex-col">
            
            {investments.length > 0 ? (
              <>
                <div className="grid grid-cols-2 gap-4 mb-8">
                  <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700">
                    <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">Modal Masuk (Cost)</p>
                    <h5 className="text-lg font-black text-slate-800 dark:text-white">Rp {totalCost.toLocaleString('id-ID')}</h5>
                  </div>
                  <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700">
                    <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">Nilai Terkini (Value)</p>
                    <h5 className="text-lg font-black text-slate-800 dark:text-white">Rp {totalValue.toLocaleString('id-ID')}</h5>
                  </div>
                  <div className={`col-span-2 p-4 rounded-2xl border flex items-center justify-between ${unrealizedPnL >= 0 ? 'bg-emerald-50 border-emerald-100 dark:bg-emerald-900/10 dark:border-emerald-500/20' : 'bg-red-50 border-red-100 dark:bg-red-900/10 dark:border-red-500/20'}`}>
                    <div>
                      <p className={`text-xs font-bold mb-1 ${unrealizedPnL >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400'}`}>Unrealized Profit/Loss</p>
                      <h4 className={`text-2xl font-black ${unrealizedPnL >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                        {unrealizedPnL >= 0 ? '+' : ''}Rp {unrealizedPnL.toLocaleString('id-ID')}
                      </h4>
                    </div>
                    <div className={`flex items-center gap-1 px-3 py-1.5 rounded-lg font-black text-sm ${unrealizedPnL >= 0 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400' : 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400'}`}>
                      {unrealizedPnL >= 0 ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />}
                      {pnlPercent}%
                    </div>
                  </div>
                </div>

                <div className="mt-auto">
                  <h4 className="text-sm font-bold text-slate-800 dark:text-white mb-3">Alokasi Aset</h4>
                  
                  <div className="w-full h-3 bg-slate-100 dark:bg-slate-800 rounded-full flex overflow-hidden mb-4 shadow-inner">
                    {assetAllocation.map(ast => (
                      <div 
                        key={ast.name} 
                        style={{ width: `${ast.percent}%` }} 
                        className={`${COLORS[ast.name] || COLORS['Lainnya']} h-full transition-all`}
                        title={`${ast.name}: ${ast.percent}%`}
                      ></div>
                    ))}
                  </div>
                  
                  <div className="flex flex-wrap gap-x-4 gap-y-2">
                    {assetAllocation.map(ast => (
                      <div key={ast.name} className="flex items-center gap-2">
                        <div className={`w-2.5 h-2.5 rounded-full ${COLORS[ast.name] || COLORS['Lainnya']}`}></div>
                        <span className="text-xs font-bold text-slate-600 dark:text-slate-400 capitalize">{ast.name} <span className="text-slate-400 dark:text-slate-500">({ast.percent}%)</span></span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <div className="w-16 h-16 bg-slate-50 dark:bg-slate-800 rounded-full flex items-center justify-center text-slate-400 mb-4">
                  <ShieldCheck size={32} />
                </div>
                <p className="text-slate-500 dark:text-slate-400 font-medium text-sm mb-2">Portfolio Investasi Kosong</p>
                <button className="text-blue-600 text-xs font-bold bg-blue-50 px-3 py-1.5 rounded-lg hover:bg-blue-100 transition-colors">Tambah Aset di Menu Investasi</button>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}











