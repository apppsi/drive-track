"use client";
import React, { useState, useEffect } from 'react';
import PinGuard from '../components/PinGuard';
import { supabase } from '../lib/supabase';
import { 
  TrendingUp, DollarSign, Fuel, Plus, 
  Coffee, Repeat, X, BarChart3, List, Download, Calendar, CreditCard, ArrowRight
} from 'lucide-react';
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

type Transaction = { 
  id: string; 
  type: string; 
  amount: number; 
  card?: string; 
  desc?: string; 
  date: string;
  rawDate: string; 
  installments?: number;
  status?: string;
};

type DbAccount = {
  id: string;
  name: string;
};

export default function Dashboard() {
  const [fuelPrice, setFuelPrice] = useState<number | string>(3.89);
  const [fuelType, setFuelType] = useState<'alcool' | 'gasolina'>('alcool');
  const [efficiencyAlcool, setEfficiencyAlcool] = useState<number | string>(9);
  const [efficiencyGasolina, setEfficiencyGasolina] = useState<number | string>(13);
  
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [dbAccounts, setDbAccounts] = useState<DbAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  const [activeModal, setActiveModal] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'dashboard' | 'reports'>('dashboard');

  const [amount, setAmount] = useState('');
  const [desc, setDesc] = useState('');
  const [card, setCard] = useState('nubank');
  const [installments, setInstallments] = useState('1');
  
  const [incomeType, setIncomeType] = useState<'uber' | 'aporte'>('uber');

  const today = new Date();
  const formattedDate = today.toLocaleDateString('pt-BR');

  const loadData = async () => {
    setIsLoading(true);
    
    // 1. Busca Contas e executa rotina de Auto-Cura
    const { data: accs } = await supabase.from('accounts').select('*');
    let currentAccounts = (accs as DbAccount[]) || [];

    const hasNubank = currentAccounts.some(a => a.name.toLowerCase().includes('nubank'));
    const hasC6 = currentAccounts.some(a => a.name.toLowerCase().includes('c6'));

    if (!hasNubank) {
      const { data: nAcc } = await supabase.from('accounts').insert({ name: 'Nubank' }).select().single();
      if (nAcc) currentAccounts.push(nAcc as DbAccount);
    }
    if (!hasC6) {
      const { data: cAcc } = await supabase.from('accounts').insert({ name: 'C6 Bank' }).select().single();
      if (cAcc) currentAccounts.push(cAcc as DbAccount);
    }
    setDbAccounts(currentAccounts);

    // 2. Busca Despesas e Ganhos
    const { data: expenses } = await supabase.from('expenses').select('id, description, amount, category, installments_total, due_date, status, accounts(name)');
    const { data: workDays } = await supabase.from('work_days').select('id, extra_earnings, aporte, date, fuel_price');

    const formattedTxs: Transaction[] = [];

    if (expenses) {
      expenses.forEach(e => {
        const accountData: any = e.accounts;
        const accountName = Array.isArray(accountData) ? accountData[0]?.name : accountData?.name;

        formattedTxs.push({
          id: e.id,
          type: e.category,
          amount: Number(e.amount),
          desc: e.description,
          card: accountName?.toLowerCase().includes('nubank') ? 'nubank' : 'c6',
          installments: e.installments_total,
          date: new Date(e.due_date).toLocaleDateString('pt-BR', { timeZone: 'UTC' }),
          rawDate: e.due_date,
          status: e.status || 'pendente'
        });
      });
    }

    if (workDays) {
      workDays.forEach(w => {
        if(w.extra_earnings > 0) {
          formattedTxs.push({
            id: w.id + '-g',
            type: 'ganho',
            amount: Number(w.extra_earnings),
            desc: 'Ganhos Uber',
            date: new Date(w.date).toLocaleDateString('pt-BR', { timeZone: 'UTC' }),
            rawDate: w.date
          });
        }
        if(w.aporte > 0) {
          formattedTxs.push({
            id: w.id + '-a',
            type: 'aporte',
            amount: Number(w.aporte),
            desc: 'Aporte Externo',
            date: new Date(w.date).toLocaleDateString('pt-BR', { timeZone: 'UTC' }),
            rawDate: w.date
          });
        }
        if(w.fuel_price > 0) {
          formattedTxs.push({
            id: w.id + '-c',
            type: 'combustivel',
            amount: Number(w.fuel_price),
            desc: 'Abastecimento (Legado)',
            date: new Date(w.date).toLocaleDateString('pt-BR', { timeZone: 'UTC' }),
            rawDate: w.date
          });
        }
      });
    }

    setTransactions(formattedTxs.sort((a, b) => new Date(b.rawDate).getTime() - new Date(a.rawDate).getTime()));
    setIsLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  const closeModal = () => {
    setActiveModal(null);
    setAmount(''); setDesc(''); setInstallments('1'); setCard('nubank'); setIncomeType('uber');
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || Number(amount) <= 0) return;

    try {
      if (activeModal === 'pagamento') {
        const targetCardName = card;
        const targetCloseDay = targetCardName === 'nubank' ? 10 : 14;
        
        const todayStr = new Date().toISOString().split('T')[0];
        const todayObj = new Date(todayStr);
        let currentMonth = todayObj.getMonth();
        let currentYear = todayObj.getFullYear();
        if (todayObj.getDate() > targetCloseDay) {
          currentMonth += 1;
          if (currentMonth > 11) { currentMonth = 0; currentYear += 1; }
        }
        const closeDate = new Date(currentYear, currentMonth, targetCloseDay);

        const invoiceTotal = calculateInvoice(targetCardName, targetCloseDay);
        const paidValue = Number(amount);

        // Fallback de Auto-Cura de segurança durante a execução
        let acc = dbAccounts.find(a => a.name.toLowerCase().includes(targetCardName));
        if (!acc) {
          const { data: newAcc, error: errC } = await supabase.from('accounts').insert({ name: targetCardName }).select().single();
          if (errC) throw new Error("Erro do banco ao registrar conta: " + errC.message);
          acc = newAcc;
        }

        await supabase
          .from('expenses')
          .update({ status: 'pago' })
          .eq('account_id', acc!.id)
          .eq('status', 'pendente')
          .lte('due_date', closeDate.toISOString().split('T')[0]);

        if (paidValue < invoiceTotal) {
          const rolloverAmount = invoiceTotal - paidValue;
          const nextMonthDate = new Date();
          nextMonthDate.setMonth(nextMonthDate.getMonth() + 1);
          nextMonthDate.setDate(targetCloseDay + 1);
          
          await supabase.from('expenses').insert({
            description: `Rolagem Restante Fatura ${targetCardName.toUpperCase()}`,
            amount: rolloverAmount,
            installments_total: 1,
            account_id: acc!.id,
            due_date: nextMonthDate.toISOString().split('T')[0],
            category: 'despesa',
            status: 'pendente'
          });
          
          alert(`Pagamento parcial. R$ ${rolloverAmount.toFixed(2)} rolados para a próxima fatura.`);
        } else {
           alert("Fatura quitada com sucesso!");
        }
        
      } else if (activeModal === 'despesa' || activeModal === 'recorrente' || activeModal === 'combustivel') {
        
        // Fallback de Auto-Cura de segurança para Lançamentos
        let acc = dbAccounts.find(a => a.name.toLowerCase().includes(card));
        if (!acc) {
          const { data: newAcc, error: errC } = await supabase.from('accounts').insert({ name: card }).select().single();
          if (errC) throw new Error("Falha ao registrar cartão automaticamente: " + errC.message);
          acc = newAcc;
        }

        const finalDesc = activeModal === 'combustivel' ? `Abastecimento (${fuelType})` : desc;

        await supabase.from('expenses').insert({
          description: finalDesc || activeModal,
          amount: Number(amount),
          installments_total: activeModal === 'combustivel' ? 1 : Number(installments),
          account_id: acc!.id,
          due_date: new Date().toISOString().split('T')[0],
          category: activeModal,
          status: 'pendente'
        });

      } else if (activeModal === 'ganho') {
        const payload = incomeType === 'uber' 
          ? { date: new Date().toISOString().split('T')[0], extra_earnings: Number(amount) }
          : { date: new Date().toISOString().split('T')[0], aporte: Number(amount) };
          
        await supabase.from('work_days').insert(payload);
      }

      closeModal();
      loadData();
    } catch (err) {
      alert("Falha: " + (err as Error).message);
    }
  };

  const handleDownloadPDF = async () => {
    const element = document.getElementById('report-content');
    if (!element) return;
    const canvas = await html2canvas(element, { backgroundColor: '#020617', scale: 2 });
    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF('p', 'mm', 'a4');
    pdf.addImage(imgData, 'PNG', 0, 10, pdf.internal.pageSize.getWidth(), (canvas.height * pdf.internal.pageSize.getWidth()) / canvas.width);
    pdf.save(`DriveTrack-Relatorio-${formattedDate.replace(/\//g, '-')}.pdf`);
  };

  const getMonthlyEvolution = () => {
    const monthly: Record<string, { name: string; Uber: number; Aportes: number; Despesas: number; sortKey: number }> = {};
    transactions.forEach(t => {
      const dateObj = new Date(t.rawDate);
      const monthStr = dateObj.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit', timeZone: 'UTC' }).replace('.', '');
      const sortKey = dateObj.getFullYear() * 100 + dateObj.getMonth();
      
      if (!monthly[monthStr]) monthly[monthStr] = { name: monthStr, Uber: 0, Aportes: 0, Despesas: 0, sortKey };
      
      if (t.type === 'ganho') monthly[monthStr].Uber += t.amount;
      else if (t.type === 'aporte') monthly[monthStr].Aportes += t.amount;
      else monthly[monthStr].Despesas += t.amount;
    });
    return Object.values(monthly).sort((a, b) => a.sortKey - b.sortKey).slice(-6);
  };

  const calculateInvoice = (cardTarget: string, closeDay: number) => {
    const todayStr = new Date().toISOString().split('T')[0];
    const todayObj = new Date(todayStr);
    
    let currentMonth = todayObj.getMonth();
    let currentYear = todayObj.getFullYear();

    if (todayObj.getDate() > closeDay) {
      currentMonth += 1;
      if (currentMonth > 11) { currentMonth = 0; currentYear += 1; }
    }

    const closeDate = new Date(currentYear, currentMonth, closeDay);
    const openDate = new Date(currentYear, currentMonth - 1, closeDay + 1);

    return transactions
      .filter(t => t.card === cardTarget && t.type !== 'ganho' && t.type !== 'aporte' && t.status === 'pendente')
      .reduce((acc, t) => {
        const tDate = new Date(t.rawDate);
        if (tDate >= openDate && tDate <= closeDate) return acc + t.amount;
        return acc;
      }, 0);
  };

  const evolutionData = getMonthlyEvolution();
  const numFuelPrice = Number(fuelPrice) || 0;
  const currentEfficiency = fuelType === 'alcool' ? (Number(efficiencyAlcool) || 9) : (Number(efficiencyGasolina) || 13);
  const netProfitPerKm = numFuelPrice > 0 && currentEfficiency > 0 ? 2.00 - (numFuelPrice / currentEfficiency) : 0;

  const currentMonthNum = new Date().getMonth();
  const currentMonthYear = new Date().getFullYear();
  
  const totalUber = transactions
    .filter(t => t.type === 'ganho' && new Date(t.rawDate).getMonth() === currentMonthNum && new Date(t.rawDate).getFullYear() === currentMonthYear)
    .reduce((acc, t) => acc + t.amount, 0);

  const totalAporte = transactions
    .filter(t => t.type === 'aporte' && new Date(t.rawDate).getMonth() === currentMonthNum && new Date(t.rawDate).getFullYear() === currentMonthYear)
    .reduce((acc, t) => acc + t.amount, 0);
    
  const totalBills = transactions
    .filter(t => t.type !== 'ganho' && t.type !== 'aporte' && new Date(t.rawDate).getMonth() === currentMonthNum && new Date(t.rawDate).getFullYear() === currentMonthYear)
    .reduce((acc, t) => acc + t.amount, 0);

  const nubankInvoice = calculateInvoice('nubank', 10);
  const c6Invoice = calculateInvoice('c6', 14);
  const totalInvoices = nubankInvoice + c6Invoice;

  const remainingTargetReais = Math.max(totalInvoices - (totalUber + totalAporte), 0);
  const requiredKm = remainingTargetReais > 0 && netProfitPerKm > 0 ? Math.ceil(remainingTargetReais / netProfitPerKm) : 0;

  return (
    <PinGuard>
      <main className="min-h-screen bg-slate-950 text-slate-100 p-4 pb-24 font-sans max-w-md mx-auto">
        <header className="flex justify-between items-center mb-6 mt-2 border-b border-slate-800 pb-4">
          <div>
            <h1 className="text-xl font-bold text-slate-50 tracking-tight">Drive & Track</h1>
            <p className="text-xs text-slate-400 mt-1 flex items-center gap-1">
              <Calendar size={12}/> Hoje: {formattedDate}
            </p>
          </div>
          <div className="flex bg-slate-900 rounded-lg p-1 border border-slate-800">
            <button onClick={() => setViewMode('dashboard')} className={`p-2 rounded transition-colors ${viewMode === 'dashboard' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}>
              <TrendingUp size={18} />
            </button>
            <button onClick={() => setViewMode('reports')} className={`p-2 rounded transition-colors ${viewMode === 'reports' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}>
              <BarChart3 size={18} />
            </button>
          </div>
        </header>

        {viewMode === 'dashboard' ? (
          <div className="space-y-4">
            <div className="flex gap-3">
              <div className="flex-1 bg-slate-900 border border-slate-800 p-4 rounded-xl flex flex-col justify-center">
                <p className="text-[10px] text-slate-400 font-bold uppercase mb-1 tracking-wider">Despesas do Mês</p>
                <p className="text-2xl font-bold text-red-400">R$ {totalBills.toFixed(2)}</p>
              </div>
              <div className="flex-1 flex flex-col gap-2">
                <div className="bg-slate-900 border border-slate-800 p-2 px-3 rounded-xl flex justify-between items-center">
                  <span className="text-[10px] text-slate-400 font-bold uppercase">🚕 Uber</span>
                  <span className="text-sm font-bold text-emerald-400">R$ {totalUber.toFixed(2)}</span>
                </div>
                <div className="bg-slate-900 border border-slate-800 p-2 px-3 rounded-xl flex justify-between items-center">
                  <span className="text-[10px] text-slate-400 font-bold uppercase">💰 Aporte</span>
                  <span className="text-sm font-bold text-amber-400">R$ {totalAporte.toFixed(2)}</span>
                </div>
              </div>
            </div>

            <section className="bg-blue-950/30 border border-blue-900/50 p-5 rounded-2xl shadow-lg relative overflow-hidden flex justify-between items-center">
              <div>
                <p className="text-[10px] text-blue-400 font-bold uppercase mb-1 tracking-wider">Falta Pagar</p>
                <p className="text-2xl font-extrabold text-white">R$ {remainingTargetReais.toFixed(2)}</p>
              </div>
              <ArrowRight className="text-blue-500/50" />
              <div className="text-right">
                <p className="text-[10px] text-blue-400 font-bold uppercase mb-1 tracking-wider">Meta em Pista</p>
                <p className="text-2xl font-extrabold text-white">{requiredKm} <span className="text-sm text-blue-200 font-normal">km</span></p>
              </div>
            </section>

            <section className="bg-slate-900 border border-slate-800 p-4 rounded-xl space-y-4">
              <div className="flex justify-between items-center border-b border-slate-800 pb-3">
                <div>
                  <h3 className="text-sm font-bold text-[#8a05be]">Nubank</h3>
                  <p className="text-[10px] text-slate-500">Fecha dia 10 • Paga dia 17</p>
                </div>
                <p className="text-lg font-bold text-slate-200">R$ {nubankInvoice.toFixed(2)}</p>
              </div>
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-sm font-bold text-slate-300">C6 Bank</h3>
                  <p className="text-[10px] text-slate-500">Fecha dia 14 • Paga dia 20</p>
                </div>
                <p className="text-lg font-bold text-slate-200">R$ {c6Invoice.toFixed(2)}</p>
              </div>
            </section>

            <section>
              <div className="flex gap-4 mb-4">
                 <div className="flex-1 bg-slate-900 border border-slate-800 p-4 rounded-xl">
                   <label className="text-[10px] text-slate-500 font-bold uppercase mb-1 block">R$/Litro</label>
                   <input type="number" step="0.01" value={fuelPrice} onChange={(e) => setFuelPrice(e.target.value)} className="w-full bg-transparent text-lg font-bold outline-none text-slate-200" />
                 </div>
                 <div className="flex-1 bg-slate-900 border border-slate-800 p-4 rounded-xl">
                   <label className="text-[10px] text-slate-500 font-bold uppercase mb-1 block">Motor</label>
                   <select value={fuelType} onChange={(e) => setFuelType(e.target.value as any)} className="w-full bg-transparent text-lg font-bold outline-none text-slate-200">
                     <option value="alcool">Álcool</option>
                     <option value="gasolina">Gasolina</option>
                   </select>
                 </div>
              </div>
              <div className="flex gap-4">
                 <div className="flex-1 bg-slate-900 border border-slate-800 p-3 rounded-xl flex items-center justify-between">
                   <label className="text-[10px] text-slate-500 font-bold uppercase block">Km/L (Álc)</label>
                   <input type="number" step="0.1" value={efficiencyAlcool} onChange={(e) => setEfficiencyAlcool(e.target.value)} className="w-16 bg-transparent text-right text-sm font-bold outline-none text-slate-200 border-b border-slate-700 focus:border-blue-500" />
                 </div>
                 <div className="flex-1 bg-slate-900 border border-slate-800 p-3 rounded-xl flex items-center justify-between">
                   <label className="text-[10px] text-slate-500 font-bold uppercase block">Km/L (Gas)</label>
                   <input type="number" step="0.1" value={efficiencyGasolina} onChange={(e) => setEfficiencyGasolina(e.target.value)} className="w-16 bg-transparent text-right text-sm font-bold outline-none text-slate-200 border-b border-slate-700 focus:border-blue-500" />
                 </div>
              </div>
            </section>
          </div>
        ) : (
          <div id="report-content" className="space-y-6 bg-slate-950 p-2 pb-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold text-slate-100">Evolução Mensal</h2>
              <button onClick={handleDownloadPDF} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-3 py-2 rounded-lg transition-colors shadow-lg">
                <Download size={16} /> Baixar PDF
              </button>
            </div>
            
            <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 h-72 mb-6">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={evolutionData}>
                  <XAxis dataKey="name" stroke="#475569" fontSize={11} tickMargin={10} />
                  <Tooltip cursor={{fill: '#1e293b'}} contentStyle={{backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px', color: '#fff'}} />
                  <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                  <Bar dataKey="Uber" fill="#34d399" radius={[4, 4, 0, 0]} maxBarSize={30} />
                  <Bar dataKey="Aportes" fill="#fbbf24" radius={[4, 4, 0, 0]} maxBarSize={30} />
                  <Bar dataKey="Despesas" fill="#3b82f6" radius={[4, 4, 0, 0]} maxBarSize={30} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            
            <div>
              <h3 className="text-sm font-bold text-slate-400 border-b border-slate-800 pb-2 mb-3">Detalhamento Completo</h3>
              <div className="space-y-2">
                {transactions.map(t => (
                  <div key={t.id} className="flex justify-between items-center py-2 border-b border-slate-800/50">
                    <div>
                      <p className="text-sm font-medium text-slate-300 capitalize">
                        {t.desc} {t.status === 'pago' ? <span className="text-[9px] bg-emerald-500/20 text-emerald-400 px-1 rounded ml-1">PAGO</span> : ''}
                      </p>
                      <p className="text-[10px] text-slate-500">{t.date} {t.card ? `• ${t.card}` : ''}</p>
                    </div>
                    <span className={`font-bold text-sm ${t.type === 'ganho' ? 'text-emerald-400' : t.type === 'aporte' ? 'text-amber-400' : 'text-slate-200'}`}>
                      {t.type === 'ganho' || t.type === 'aporte' ? '+' : '-'} R$ {t.amount.toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-slate-800 border border-slate-700 p-2 rounded-full shadow-2xl flex gap-2 z-40">
          <button onClick={() => setActiveModal('ganho')} className="bg-emerald-500/20 text-emerald-400 p-3 rounded-full hover:bg-emerald-500/30 transition">
            <DollarSign size={20} />
          </button>
          <button onClick={() => setActiveModal('combustivel')} className="bg-orange-500/20 text-orange-400 p-3 rounded-full hover:bg-orange-500/30 transition">
            <Fuel size={20} />
          </button>
          <button onClick={() => setActiveModal('despesa')} className="bg-blue-500/20 text-blue-400 p-3 rounded-full hover:bg-blue-500/30 transition">
            <Coffee size={20} />
          </button>
          <button onClick={() => setActiveModal('recorrente')} className="bg-purple-500/20 text-purple-400 p-3 rounded-full hover:bg-purple-500/30 transition">
            <Repeat size={20} />
          </button>
          <button onClick={() => setActiveModal('pagamento')} className="bg-red-500/20 text-red-400 p-3 rounded-full hover:bg-red-500/30 transition" title="Pagar Fatura">
            <CreditCard size={20} />
          </button>
        </div>

        {activeModal && (
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <form onSubmit={handleSave} className="bg-slate-900 border border-slate-700 p-6 rounded-2xl w-full max-w-sm shadow-2xl">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-bold capitalize text-slate-100">
                  {activeModal === 'pagamento' ? 'Pagar Fatura' : `Lançar ${activeModal}`}
                </h3>
                <button type="button" onClick={closeModal} className="text-slate-500 hover:text-slate-300 transition-colors"><X size={24}/></button>
              </div>

              {activeModal === 'ganho' && (
                <div className="mb-6">
                  <label className="text-xs text-slate-400 mb-1 block">Origem do Dinheiro</label>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setIncomeType('uber')} className={`flex-1 p-3 rounded-lg border font-bold text-sm transition ${incomeType === 'uber' ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400' : 'bg-slate-950 border-slate-700 text-slate-500'}`}>🚕 Uber</button>
                    <button type="button" onClick={() => setIncomeType('aporte')} className={`flex-1 p-3 rounded-lg border font-bold text-sm transition ${incomeType === 'aporte' ? 'bg-amber-500/20 border-amber-500 text-amber-400' : 'bg-slate-950 border-slate-700 text-slate-500'}`}>💰 Aporte</button>
                  </div>
                </div>
              )}

              {activeModal !== 'ganho' && activeModal !== 'combustivel' && activeModal !== 'pagamento' && (
                <div className="mb-4">
                  <label className="text-xs text-slate-400 mb-1 block">Descrição</label>
                  <input autoFocus type="text" value={desc} onChange={(e) => setDesc(e.target.value)} required className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-slate-200 outline-none focus:border-blue-500" placeholder="Ex: Almoço" />
                </div>
              )}

              {activeModal !== 'ganho' && (
                <div className="mb-6">
                  <label className="text-xs text-slate-400 mb-1 block">Cartão</label>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setCard('nubank')} className={`flex-1 p-3 rounded-lg border font-bold text-sm transition ${card === 'nubank' ? 'bg-[#8a05be]/20 border-[#8a05be] text-[#8a05be]' : 'bg-slate-950 border-slate-700 text-slate-500'}`}>Nubank</button>
                    <button type="button" onClick={() => setCard('c6')} className={`flex-1 p-3 rounded-lg border font-bold text-sm transition ${card === 'c6' ? 'bg-slate-700 border-slate-500 text-white' : 'bg-slate-950 border-slate-700 text-slate-500'}`}>C6 Bank</button>
                  </div>
                </div>
              )}

              {activeModal === 'pagamento' && (
                <div className="mb-4 p-3 bg-slate-950 rounded-lg border border-slate-800 text-center">
                   <p className="text-xs text-slate-500 uppercase">Fatura Atual ({card})</p>
                   <p className="text-xl font-bold text-slate-200">
                     R$ {(card === 'nubank' ? nubankInvoice : c6Invoice).toFixed(2)}
                   </p>
                </div>
              )}

              <div className="mb-6">
                <label className="text-xs text-slate-400 mb-1 block">
                  {activeModal === 'pagamento' ? 'Valor Pago (R$)' : 'Valor (R$)'}
                </label>
                <input autoFocus={activeModal === 'ganho' || activeModal === 'combustivel'} type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-slate-200 text-2xl font-bold outline-none focus:border-blue-500" placeholder="0.00" />
              </div>

              {activeModal === 'despesa' && (
                <div className="mb-6">
                  <label className="text-xs text-slate-400 mb-1 block">Parcelas</label>
                  <select value={installments} onChange={(e) => setInstallments(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-slate-200 outline-none focus:border-blue-500">
                    <option value="1">À vista (1x)</option>
                    {Array.from({ length: 23 }, (_, i) => i + 2).map(n => (
                      <option key={n} value={n}>{n}x</option>
                    ))}
                  </select>
                </div>
              )}

              <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-xl transition shadow-lg flex justify-center items-center gap-2">
                <Plus size={20} /> {activeModal === 'pagamento' ? 'Registrar Pagamento' : 'Confirmar Lançamento'}
              </button>
            </form>
          </div>
        )}

      </main>
    </PinGuard>
  );
}