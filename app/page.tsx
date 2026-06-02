"use client";
import React, { useState, useEffect } from 'react';
import PinGuard from '../components/PinGuard';
import { supabase } from '../lib/supabase';
import { 
  DollarSign, Fuel, Plus, Coffee, Repeat, X, 
  CreditCard, Edit2, Trash2, ChevronLeft, ChevronRight, CalendarSearch, TrendingUp, List, Clock, ArrowRight, BarChart3, Download
} from 'lucide-react';
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

type Transaction = { 
  id: string; 
  dbId: string;
  dbTable: 'expenses' | 'work_days';
  type: string; 
  amount: number; 
  card?: string; 
  desc?: string; 
  rawDate: string; 
  status?: string;
  invoiceMonth: string; 
};

type DbAccount = { id: string; name: string; };

export default function Dashboard() {
  const [fuelPrice, setFuelPrice] = useState<number | string>(3.89);
  const [fuelType, setFuelType] = useState<'alcool' | 'gasolina'>('alcool');
  const [efficiencyAlcool, setEfficiencyAlcool] = useState<number | string>(9);
  const [efficiencyGasolina, setEfficiencyGasolina] = useState<number | string>(13);

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [dbAccounts, setDbAccounts] = useState<DbAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  const [activeModal, setActiveModal] = useState<string | null>(null);
  const [editModalTx, setEditModalTx] = useState<Transaction | null>(null);
  const [viewMode, setViewMode] = useState<'dashboard' | 'reports' | 'future'>('dashboard');

  const [amount, setAmount] = useState('');
  const [desc, setDesc] = useState('');
  const [card, setCard] = useState('nubank');
  const [installments, setInstallments] = useState('1');
  const [incomeType, setIncomeType] = useState<'uber' | 'aporte'>('uber');
  const [historyFilter, setHistoryFilter] = useState<'all' | 'nubank' | 'c6' | 'outros'>('all');
  
  const [txDate, setTxDate] = useState(new Date().toISOString().split('T')[0]);
  const [editType, setEditType] = useState<'despesa' | 'recorrente'>('despesa');

  const [activeMonthStr, setActiveMonthStr] = useState(''); 
  const [customMonthPicker, setCustomMonthPicker] = useState(false);

  const today = new Date();
  const formattedDate = today.toLocaleDateString('pt-BR');

  useEffect(() => {
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const yyyy = today.getFullYear();
    setActiveMonthStr(`${yyyy}-${mm}`);
  }, []);

  // Motor Matemático Baseado na Data de CORTE
  const getInvoiceMonth = (dateStr: string, thresholdDay: number) => {
    const [yStr, mStr, dStr] = dateStr.split('T')[0].split('-');
    let y = parseInt(yStr, 10);
    let m = parseInt(mStr, 10);
    const d = parseInt(dStr, 10);

    if (d > thresholdDay) {
        m += 1;
        if (m > 12) { m = 1; y += 1; }
    }
    return `${y}-${String(m).padStart(2, '0')}`; 
  };

  const loadData = async () => {
    setIsLoading(true);
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

    const { data: expenses } = await supabase.from('expenses').select('id, description, amount, category, installments_total, due_date, status, accounts(name)');
    const { data: workDays } = await supabase.from('work_days').select('id, extra_earnings, aporte, date, fuel_price');

    const formattedTxs: Transaction[] = [];

    if (expenses) {
      expenses.forEach(e => {
        const accountData: any = e.accounts;
        const accountName = Array.isArray(accountData) ? accountData[0]?.name : accountData?.name;
        const cardName = accountName?.toLowerCase().includes('nubank') ? 'nubank' : 'c6';
        
        // REGRAS DE CORTE: Nubank (Dia 10) | C6 Bank (Dia 14)
        const threshold = cardName === 'nubank' ? 10 : 14;
        
        formattedTxs.push({
          id: `exp_${e.id}`, dbId: e.id, dbTable: 'expenses', type: e.category, amount: Number(e.amount),
          desc: e.description, card: cardName, rawDate: e.due_date, status: e.status || 'pendente',
          invoiceMonth: getInvoiceMonth(e.due_date, threshold)
        });
      });
    }

    if (workDays) {
      workDays.forEach(w => {
        // REGRAS DE CORTE: Entradas, Uber e Combustível (Dia 20)
        const invMonth = getInvoiceMonth(w.date, 20);
        if(w.extra_earnings > 0) formattedTxs.push({ id: `wdg_${w.id}`, dbId: w.id, dbTable: 'work_days', type: 'ganho', amount: Number(w.extra_earnings), desc: 'Ganhos Uber', rawDate: w.date, invoiceMonth: invMonth });
        if(w.aporte > 0) formattedTxs.push({ id: `wda_${w.id}`, dbId: w.id, dbTable: 'work_days', type: 'aporte', amount: Number(w.aporte), desc: 'Aporte Externo', rawDate: w.date, invoiceMonth: invMonth });
        if(w.fuel_price > 0) formattedTxs.push({ id: `wdc_${w.id}`, dbId: w.id, dbTable: 'work_days', type: 'combustivel', amount: Number(w.fuel_price), desc: 'Abastecimento', rawDate: w.date, invoiceMonth: invMonth });
      });
    }

    setTransactions(formattedTxs.sort((a, b) => new Date(b.rawDate).getTime() - new Date(a.rawDate).getTime()));
    setIsLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  const closeModal = () => {
    setActiveModal(null); setEditModalTx(null);
    setAmount(''); setDesc(''); setInstallments('1'); setCard('nubank'); setIncomeType('uber');
    setTxDate(new Date().toISOString().split('T')[0]);
    setEditType('despesa');
  };

  const openEditModal = (tx: Transaction) => {
    setEditModalTx(tx); 
    setAmount(tx.amount.toString()); 
    const cleanDesc = tx.desc ? tx.desc.replace(/(\s*\(\d+\/\d+\))+$/, '').trim() : '';
    setDesc(cleanDesc); 
    if (tx.card) setCard(tx.card);
    setTxDate(tx.rawDate);
    setInstallments('1');
    setEditType(tx.type === 'recorrente' ? 'recorrente' : 'despesa');
  };

  const handleDelete = async (tx: Transaction) => {
    if (tx.type === 'recorrente') {
      if(!confirm(`Apagar assinatura "${tx.desc}" neste mês e nos próximos?`)) return;
      try {
        await supabase.from('expenses').delete().eq('category', 'recorrente').eq('description', tx.desc).gte('due_date', tx.rawDate);
        loadData();
      } catch (e) { alert("Erro ao apagar."); }
      return;
    }

    if (tx.dbTable === 'expenses' && tx.desc?.match(/\(\d+\/\d+\)$/)) {
      const cleanDesc = tx.desc.replace(/(\s*\(\d+\/\d+\))+$/, '').trim();
      const cascade = confirm(`Compra parcelada!\n\n[OK] = Apagar esta e as futuras\n[Cancelar] = Apagar só esta`);
      try {
        if(cascade) await supabase.from('expenses').delete().like('description', `${cleanDesc} (%`).gte('due_date', tx.rawDate);
        else await supabase.from('expenses').delete().eq('id', tx.dbId);
        loadData();
      } catch (e) { alert("Erro ao apagar."); }
      return;
    }

    if(!confirm("Tem certeza que deseja apagar?")) return;
    try {
      if (tx.dbTable === 'work_days') {
        const updateData: any = {};
        if (tx.type === 'ganho') updateData.extra_earnings = 0;
        if (tx.type === 'aporte') updateData.aporte = 0;
        if (tx.type === 'combustivel') updateData.fuel_price = 0;
        await supabase.from('work_days').update(updateData).eq('id', tx.dbId);
      } else {
        await supabase.from('expenses').delete().eq('id', tx.dbId);
      }
      loadData();
    } catch (e) { alert("Erro ao apagar."); }
  };

  const handleUpdateEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editModalTx || !amount || Number(amount) <= 0) return;
    const baseDesc = desc.trim();

    try {
      if (editModalTx.dbTable === 'work_days') {
        const updateData: any = { date: txDate };
        if (editModalTx.type === 'ganho') updateData.extra_earnings = Number(amount);
        if (editModalTx.type === 'aporte') updateData.aporte = Number(amount);
        if (editModalTx.type === 'combustivel') updateData.fuel_price = Number(amount);
        await supabase.from('work_days').update(updateData).eq('id', editModalTx.dbId);
      } else {
        const acc = dbAccounts.find(a => a.name.toLowerCase().includes(card));
        const numInst = editType === 'recorrente' ? 120 : Number(installments);
        
        const baseAmount = editType === 'despesa' && numInst > 1 ? Number(amount) / numInst : Number(amount);
        
        if (editModalTx.desc?.match(/\(\d+\/\d+\)$/)) {
            const originalBase = editModalTx.desc.replace(/(\s*\(\d+\/\d+\))+$/, '').trim();
            await supabase.from('expenses').delete().like('description', `${originalBase} (%`).gt('due_date', editModalTx.rawDate);
        }

        if (numInst === 1) {
            await supabase.from('expenses').update({ 
                description: baseDesc, amount: baseAmount, account_id: acc?.id, due_date: txDate, category: editType 
            }).eq('id', editModalTx.dbId);
        } else {
            const [yy, mm, dd] = txDate.split('-').map(Number);
            await supabase.from('expenses').update({ 
                description: editType === 'recorrente' ? baseDesc : `${baseDesc} (1/${numInst})`, 
                amount: baseAmount, account_id: acc?.id, due_date: txDate,
                installments_total: numInst, category: editType
            }).eq('id', editModalTx.dbId);

            const inserts = [];
            for (let i = 1; i < numInst; i++) {
                const nextDate = new Date(yy, (mm - 1) + i, dd);
                const nextDateStr = nextDate.getFullYear() + '-' + String(nextDate.getMonth() + 1).padStart(2, '0') + '-' + String(nextDate.getDate()).padStart(2, '0');
                inserts.push({
                    description: editType === 'recorrente' ? baseDesc : `${baseDesc} (${i + 1}/${numInst})`,
                    amount: baseAmount, installments_total: numInst, account_id: acc!.id,
                    due_date: nextDateStr, category: editType, status: 'pendente'
                });
            }
            await supabase.from('expenses').insert(inserts);
        }
      }
      closeModal(); loadData();
    } catch (err) { alert("Falha ao atualizar."); }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || Number(amount) <= 0) return;

    try {
      if (activeModal === 'pagamento') {
        const acc = dbAccounts.find(a => a.name.toLowerCase().includes(card));
        const txsToPay = transactions.filter(t => t.card === card && t.type !== 'ganho' && t.type !== 'aporte' && t.status === 'pendente' && t.invoiceMonth === activeMonthStr);
        
        const invoiceTotal = txsToPay.reduce((acc, t) => acc + t.amount, 0);
        const paidValue = Number(amount);

        for (const t of txsToPay) {
           await supabase.from('expenses').update({ status: 'pago' }).eq('id', t.dbId);
        }

        if (paidValue < invoiceTotal) {
          const rolloverAmount = invoiceTotal - paidValue;
          const threshold = card === 'nubank' ? 10 : 14;
          const [yStr, mStr] = activeMonthStr.split('-');
          
          const nextDateStr = `${yStr}-${mStr}-${String(threshold + 2).padStart(2, '0')}`;
          
          await supabase.from('expenses').insert({
            description: `Restante Fatura ${card.toUpperCase()}`,
            amount: rolloverAmount, installments_total: 1, account_id: acc!.id,
            due_date: nextDateStr, category: 'despesa', status: 'pendente'
          });
          alert(`Pagamento parcial. R$ ${rolloverAmount.toFixed(2)} rolados para a próxima fatura.`);
        } else {
           alert("Fatura quitada com sucesso!");
        }
        
      } else if (activeModal === 'despesa' || activeModal === 'recorrente' || activeModal === 'combustivel') {
        let acc = dbAccounts.find(a => a.name.toLowerCase().includes(card));
        const numInst = activeModal === 'recorrente' ? 120 : (activeModal === 'combustivel' ? 1 : Number(installments));
        const baseAmount = activeModal === 'despesa' && numInst > 1 ? Number(amount) / numInst : Number(amount); 
        const baseDesc = activeModal === 'combustivel' ? `Abastecimento` : desc.trim();

        const inserts = [];
        const [yy, mm, dd] = txDate.split('-').map(Number); 

        for (let i = 0; i < numInst; i++) {
          const nextDate = new Date(yy, (mm - 1) + i, dd);
          const nextDateStr = nextDate.getFullYear() + '-' + String(nextDate.getMonth() + 1).padStart(2, '0') + '-' + String(nextDate.getDate()).padStart(2, '0');
          
          inserts.push({
            description: activeModal === 'recorrente' ? baseDesc : (numInst > 1 ? `${baseDesc} (${i + 1}/${numInst})` : baseDesc),
            amount: baseAmount,
            installments_total: numInst,
            account_id: acc!.id,
            due_date: nextDateStr,
            category: activeModal,
            status: 'pendente'
          });
        }
        await supabase.from('expenses').insert(inserts);

      } else if (activeModal === 'ganho') {
        const payload = incomeType === 'uber' ? { date: txDate, extra_earnings: Number(amount) } : { date: txDate, aporte: Number(amount) };
        await supabase.from('work_days').insert(payload);
      }
      closeModal(); loadData();
    } catch (err) { alert("Falha: " + (err as Error).message); }
  };

  const changeMonth = (offset: number) => {
    if(!activeMonthStr) return;
    const [y, m] = activeMonthStr.split('-').map(Number);
    const d = new Date(y, m - 1 + offset, 1);
    setActiveMonthStr(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };

  const getMonthLabel = (dateStr: string) => {
    if(!dateStr) return '';
    const [y, m] = dateStr.split('-');
    const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    return `${months[parseInt(m)-1]} ${y}`;
  };

  const getMonthlyEvolution = () => {
    const monthly: Record<string, { name: string; sortKey: number; Uber: number; Aportes: number; Despesas: number }> = {};
    transactions.forEach(t => {
      const [y, m] = t.invoiceMonth.split('-');
      const sortKey = parseInt(y) * 100 + parseInt(m);
      const name = `${['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'][parseInt(m)-1]} ${y.slice(2)}`;
      if (!monthly[t.invoiceMonth]) monthly[t.invoiceMonth] = { name, sortKey, Uber: 0, Aportes: 0, Despesas: 0 };
      if (t.type === 'ganho') monthly[t.invoiceMonth].Uber += t.amount;
      else if (t.type === 'aporte') monthly[t.invoiceMonth].Aportes += t.amount;
      else monthly[t.invoiceMonth].Despesas += t.amount;
    });
    return Object.values(monthly).sort((a, b) => a.sortKey - b.sortKey).slice(-6);
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

  const currentViewTransactions = transactions.filter(t => t.invoiceMonth === activeMonthStr);
  const pendingNubank = currentViewTransactions.filter(t => t.card === 'nubank' && t.type !== 'ganho' && t.type !== 'aporte' && t.status === 'pendente').reduce((acc, t) => acc + t.amount, 0);
  const pendingC6 = currentViewTransactions.filter(t => t.card === 'c6' && t.type !== 'ganho' && t.type !== 'aporte' && t.status === 'pendente').reduce((acc, t) => acc + t.amount, 0);
  const totalUber = currentViewTransactions.filter(t => t.type === 'ganho').reduce((acc, t) => acc + t.amount, 0);
  const totalAporte = currentViewTransactions.filter(t => t.type === 'aporte').reduce((acc, t) => acc + t.amount, 0);

  const remainingTargetReais = Math.max((pendingNubank + pendingC6) - (totalUber + totalAporte), 0);
  const numFuelPrice = Number(fuelPrice) || 0;
  const currentEfficiency = fuelType === 'alcool' ? (Number(efficiencyAlcool) || 9) : (Number(efficiencyGasolina) || 13);
  const netProfitPerKm = numFuelPrice > 0 && currentEfficiency > 0 ? 2.00 - (numFuelPrice / currentEfficiency) : 0;
  const requiredKm = remainingTargetReais > 0 && netProfitPerKm > 0 ? Math.ceil(remainingTargetReais / netProfitPerKm) : 0;

  const filteredHistory = currentViewTransactions.filter(t => {
    if (historyFilter === 'nubank' && t.card !== 'nubank') return false;
    if (historyFilter === 'c6' && t.card !== 'c6') return false;
    if (historyFilter === 'outros' && t.card) return false;
    return true;
  });

  return (
    <PinGuard>
      <main className="min-h-screen bg-slate-950 text-slate-100 pb-24 font-sans max-w-md mx-auto">
        <header className="bg-slate-900 border-b border-slate-800 p-6 pt-10 rounded-b-3xl shadow-xl relative">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-xl font-bold text-slate-50 tracking-tight">Drive & Track</h1>
            <div className="flex gap-2">
              <button onClick={() => setCustomMonthPicker(!customMonthPicker)} className="p-2 bg-slate-800 rounded-full text-blue-400"><CalendarSearch size={18} /></button>
              <button onClick={() => setViewMode('reports')} className={`p-2 rounded-full transition-colors ${viewMode === 'reports' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400'}`}><BarChart3 size={18} /></button>
              <button onClick={() => setViewMode('dashboard')} className={`p-2 rounded-full transition-colors ${viewMode === 'dashboard' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400'}`}><List size={18} /></button>
            </div>
          </div>

          {viewMode !== 'reports' && (
            <>
              <div className="flex justify-between items-center bg-slate-950 rounded-full p-1 border border-slate-800 mb-6">
                <button onClick={() => changeMonth(-1)} className="p-2 text-slate-400 hover:text-white"><ChevronLeft size={20}/></button>
                <span className="font-bold text-blue-400 uppercase tracking-widest text-sm">{getMonthLabel(activeMonthStr)}</span>
                <button onClick={() => changeMonth(1)} className="p-2 text-slate-400 hover:text-white"><ChevronRight size={20}/></button>
              </div>

              {customMonthPicker && (
                <div className="absolute top-20 right-6 bg-slate-800 p-3 rounded-lg border border-slate-700 z-50 shadow-2xl flex gap-2">
                  <input type="month" value={activeMonthStr} onChange={(e) => { setActiveMonthStr(e.target.value); setCustomMonthPicker(false); }} className="bg-slate-950 text-white p-2 rounded outline-none" />
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-[#8a05be]/10 border border-[#8a05be]/30 p-4 rounded-2xl relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-1 h-full bg-[#8a05be]"></div>
                  <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">Fatura Nubank</p>
                  <p className="text-xl font-bold text-[#8a05be]">R$ {pendingNubank.toFixed(2)}</p>
                  <p className="text-[9px] text-slate-500 mt-1">Corta dia 10 • Vence dia 17</p>
                </div>
                <div className="bg-slate-800/50 border border-slate-700/50 p-4 rounded-2xl relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-1 h-full bg-slate-500"></div>
                  <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">Fatura C6 Bank</p>
                  <p className="text-xl font-bold text-slate-300">R$ {pendingC6.toFixed(2)}</p>
                  <p className="text-[9px] text-slate-500 mt-1">Corta dia 14 • Vence dia 20</p>
                </div>
              </div>
              <div className="mt-3 bg-emerald-500/10 border border-emerald-500/30 p-4 rounded-2xl flex justify-between items-center">
                 <div>
                   <p className="text-[10px] text-emerald-400/80 font-bold uppercase mb-1">Entradas (Corte Dia 20)</p>
                   <p className="text-lg font-bold text-emerald-400">R$ {(totalUber + totalAporte).toFixed(2)}</p>
                 </div>
                 <div className="text-right">
                    <p className="text-[10px] text-slate-500 uppercase">Aportes</p>
                    <p className="text-sm font-bold text-amber-400">R$ {totalAporte.toFixed(2)}</p>
                 </div>
              </div>
            </>
          )}
        </header>

        {viewMode === 'dashboard' && (
          <div className="p-4 mt-2">
            <section className="bg-blue-950/30 border border-blue-900/50 p-5 rounded-2xl shadow-lg relative overflow-hidden flex justify-between items-center mb-6 mt-2">
              <div>
                <p className="text-[10px] text-blue-400 font-bold uppercase mb-1 tracking-wider">Falta para Quitar</p>
                <p className="text-2xl font-extrabold text-white">R$ {remainingTargetReais.toFixed(2)}</p>
              </div>
              <ArrowRight className="text-blue-500/50" />
              <div className="text-right">
                <p className="text-[10px] text-blue-400 font-bold uppercase mb-1 tracking-wider">Meta Diária</p>
                <p className="text-2xl font-extrabold text-white">{requiredKm} <span className="text-sm text-blue-200 font-normal">km</span></p>
              </div>
            </section>

            <div className="flex justify-between items-end mb-4 px-1">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest">Lançamentos</h3>
              <div className="flex gap-2">
                <button onClick={() => setHistoryFilter('all')} className={`text-[9px] uppercase font-bold px-2 py-1 rounded border ${historyFilter === 'all' ? 'bg-slate-700 text-white' : 'border-slate-800 text-slate-500'}`}>Tudo</button>
                <button onClick={() => setHistoryFilter('nubank')} className={`text-[9px] uppercase font-bold px-2 py-1 rounded border ${historyFilter === 'nubank' ? 'bg-[#8a05be]/20 text-[#8a05be]' : 'border-slate-800 text-slate-500'}`}>Nu</button>
                <button onClick={() => setHistoryFilter('c6')} className={`text-[9px] uppercase font-bold px-2 py-1 rounded border ${historyFilter === 'c6' ? 'bg-slate-700 text-white' : 'border-slate-800 text-slate-500'}`}>C6</button>
                <button onClick={() => setHistoryFilter('outros')} className={`text-[9px] uppercase font-bold px-2 py-1 rounded border ${historyFilter === 'outros' ? 'bg-emerald-500/20 text-emerald-400' : 'border-slate-800 text-slate-500'}`}>Ganhos</button>
              </div>
            </div>
            
            <div className="space-y-3 mb-8 max-h-[45vh] overflow-y-auto pr-2 pb-2">
              {filteredHistory.map(t => (
                <div key={t.id} className="bg-slate-900 border border-slate-800/50 p-4 rounded-2xl flex justify-between items-center shadow-sm">
                  <div className="flex items-center gap-3 w-2/3">
                    <div className={`w-1.5 h-10 rounded-full ${t.card === 'nubank' ? 'bg-[#8a05be]' : t.card === 'c6' ? 'bg-slate-500' : 'bg-emerald-500'}`}></div>
                    <div className="truncate w-full">
                      <p className="text-sm font-bold text-slate-200 capitalize truncate">
                        {t.type === 'recorrente' && <Repeat size={12} className="inline text-purple-400 mr-1" />}
                        {t.desc}
                      </p>
                      <p className="text-[10px] text-slate-500 mt-0.5">
                        {t.rawDate.split('-').reverse().join('/')} 
                        {t.status === 'pago' ? <span className="bg-emerald-500/20 text-emerald-400 px-1 rounded ml-2">PAGO</span> : ''}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className={`font-extrabold text-[15px] tracking-tight ${t.type === 'ganho' ? 'text-emerald-400' : t.type === 'aporte' ? 'text-amber-400' : 'text-slate-100'}`}>
                      {t.type === 'ganho' || t.type === 'aporte' ? '+' : '-'} R$ {t.amount.toFixed(2)}
                    </span>
                    <div className="flex gap-3 mt-1">
                      <button onClick={() => openEditModal(t)} className="text-slate-500 hover:text-blue-400 transition"><Edit2 size={14} /></button>
                      <button onClick={() => handleDelete(t)} className="text-slate-500 hover:text-red-400 transition"><Trash2 size={14} /></button>
                    </div>
                  </div>
                </div>
              ))}
              
              {filteredHistory.length === 0 && (
                <div className="text-center py-10 border border-dashed border-slate-800 rounded-2xl mt-6">
                  <p className="text-slate-500 text-sm">Nenhuma movimentação nesta fatura.</p>
                </div>
              )}
            </div>

            <section className="mt-6 border-t border-slate-800 pt-6">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4">Configuração de Pista</h3>
              <div className="flex gap-4 mb-4">
                 <div className="flex-1 bg-slate-900 border border-slate-800 p-4 rounded-xl">
                   <label className="text-[10px] text-slate-500 font-bold uppercase mb-1 block">R$/Litro</label>
                   <input type="number" step="0.01" value={fuelPrice} onChange={(e) => setFuelPrice(e.target.value)} className="w-full bg-transparent text-lg font-bold outline-none text-slate-200" />
                 </div>
                 <div className="flex-1 bg-slate-900 border border-slate-800 p-4 rounded-xl">
                   <label className="text-[10px] text-slate-500 font-bold uppercase mb-1 block">Combustível</label>
                   <select value={fuelType} onChange={(e) => setFuelType(e.target.value as any)} className="w-full bg-transparent text-lg font-bold outline-none text-slate-200">
                     <option value="alcool">Álcool</option>
                     <option value="gasolina">Gasolina</option>
                   </select>
                 </div>
              </div>
              <div className="flex gap-4">
                 <div className="flex-1 bg-slate-900 border border-slate-800 p-3 rounded-xl flex items-center justify-between">
                   <label className="text-[10px] text-slate-500 font-bold uppercase block">Km/L (Álc)</label>
                   <input type="number" step="0.1" value={efficiencyAlcool} onChange={(e) => setEfficiencyAlcool(e.target.value)} className="w-16 bg-transparent text-right text-sm font-bold outline-none text-slate-200 border-b border-slate-700" />
                 </div>
                 <div className="flex-1 bg-slate-900 border border-slate-800 p-3 rounded-xl flex items-center justify-between">
                   <label className="text-[10px] text-slate-500 font-bold uppercase block">Km/L (Gas)</label>
                   <input type="number" step="0.1" value={efficiencyGasolina} onChange={(e) => setEfficiencyGasolina(e.target.value)} className="w-16 bg-transparent text-right text-sm font-bold outline-none text-slate-200 border-b border-slate-700" />
                 </div>
              </div>
            </section>

          </div>
        )}

        {viewMode === 'reports' && (
          <div id="report-content" className="p-4 mt-2 space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-bold text-slate-100">Visão Geral</h2>
              <button onClick={handleDownloadPDF} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-3 py-2 rounded-lg transition-colors">
                <Download size={16} /> Baixar Relatório
              </button>
            </div>
            
            <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={getMonthlyEvolution()}>
                  <XAxis dataKey="name" stroke="#475569" fontSize={11} tickMargin={10} />
                  <Tooltip cursor={{fill: '#1e293b'}} contentStyle={{backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px', color: '#fff'}} />
                  <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                  <Bar dataKey="Uber" fill="#34d399" radius={[4, 4, 0, 0]} maxBarSize={30} />
                  <Bar dataKey="Aportes" fill="#fbbf24" radius={[4, 4, 0, 0]} maxBarSize={30} />
                  <Bar dataKey="Despesas" fill="#3b82f6" radius={[4, 4, 0, 0]} maxBarSize={30} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-slate-800/90 backdrop-blur-md border border-slate-700 p-2 rounded-full shadow-[0_20px_50px_rgba(0,0,0,0.5)] flex gap-2 z-40">
          <button onClick={() => setActiveModal('ganho')} className="bg-emerald-500/20 text-emerald-400 p-3 rounded-full hover:bg-emerald-500/30 transition"><DollarSign size={20} /></button>
          <button onClick={() => setActiveModal('combustivel')} className="bg-orange-500/20 text-orange-400 p-3 rounded-full hover:bg-orange-500/30 transition"><Fuel size={20} /></button>
          <button onClick={() => setActiveModal('despesa')} className="bg-blue-500/20 text-blue-400 p-3 rounded-full hover:bg-blue-500/30 transition"><Plus size={20} /></button>
          <button onClick={() => setActiveModal('recorrente')} className="bg-purple-500/20 text-purple-400 p-3 rounded-full hover:bg-purple-500/30 transition"><Repeat size={20} /></button>
          <button onClick={() => setActiveModal('pagamento')} className="bg-red-500/20 text-red-400 p-3 rounded-full hover:bg-red-500/30 transition"><CreditCard size={20} /></button>
        </div>

        {/* MODAL DE EDIÇÃO */}
        {editModalTx && (
          <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
            <form onSubmit={handleUpdateEdit} className="bg-slate-900 border border-blue-900/50 p-6 rounded-3xl w-full max-w-sm shadow-2xl my-auto">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2"><Edit2 size={18} className="text-blue-400"/> Editar</h3>
                <button type="button" onClick={closeModal} className="text-slate-500 hover:text-slate-300 transition-colors"><X size={24}/></button>
              </div>

              {editModalTx.dbTable === 'expenses' && (
                <div className="mb-4">
                  <label className="text-xs text-slate-400 mb-1 block">Descrição</label>
                  <input type="text" value={desc} onChange={(e) => setDesc(e.target.value)} required className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-slate-200 outline-none focus:border-blue-500" />
                </div>
              )}

              {editModalTx.dbTable === 'expenses' && (
                <div className="mb-4">
                  <label className="text-xs text-slate-400 mb-1 block">Tipo</label>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setEditType('despesa')} className={`flex-1 p-2 rounded-xl border font-bold text-xs transition ${editType === 'despesa' ? 'bg-blue-500/20 border-blue-500 text-blue-400' : 'bg-slate-950 border-slate-700 text-slate-500'}`}>Parcelado (1/x)</button>
                    <button type="button" onClick={() => setEditType('recorrente')} className={`flex-1 p-2 rounded-xl border font-bold text-xs transition ${editType === 'recorrente' ? 'bg-purple-500/20 border-purple-500 text-purple-400' : 'bg-slate-950 border-slate-700 text-slate-500'}`}>Assinatura Fixa</button>
                  </div>
                </div>
              )}

              {editModalTx.dbTable === 'expenses' && (
                <div className="mb-4">
                  <label className="text-xs text-slate-400 mb-1 block">Cartão</label>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setCard('nubank')} className={`flex-1 p-3 rounded-xl border font-bold text-sm transition ${card === 'nubank' ? 'bg-[#8a05be]/20 border-[#8a05be] text-[#8a05be]' : 'bg-slate-950 border-slate-700 text-slate-500'}`}>Nubank</button>
                    <button type="button" onClick={() => setCard('c6')} className={`flex-1 p-3 rounded-xl border font-bold text-sm transition ${card === 'c6' ? 'bg-slate-700 border-slate-500 text-white' : 'bg-slate-950 border-slate-700 text-slate-500'}`}>C6 Bank</button>
                  </div>
                </div>
              )}

              <div className="mb-4">
                <label className="text-xs text-slate-400 mb-1 block">Data da Compra</label>
                <input type="date" value={txDate} onChange={(e) => setTxDate(e.target.value)} required className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-slate-200 outline-none focus:border-blue-500" />
              </div>

              <div className="mb-6">
                <label className="text-xs text-slate-400 mb-1 block">{editType === 'despesa' && installments !== '1' ? 'Valor TOTAL da Compra (R$)' : 'Valor da Parcela/Mês (R$)'}</label>
                <input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-slate-200 text-2xl font-bold outline-none focus:border-blue-500" />
              </div>

              {editModalTx.dbTable === 'expenses' && editType === 'despesa' && (
                <div className="mb-6">
                  <label className="text-xs text-slate-400 mb-1 block">O sistema vai dividir sozinho:</label>
                  <select value={installments} onChange={(e) => setInstallments(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-slate-200 outline-none focus:border-blue-500">
                    <option value="1">Manter única (1x)</option>
                    {Array.from({ length: 35 }, (_, i) => i + 2).map(n => (<option key={n} value={n}>Dividir em {n}x</option>))}
                  </select>
                </div>
              )}

              <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-2xl transition shadow-lg">Salvar Alterações</button>
            </form>
          </div>
        )}

        {/* MODAL DE INSERÇÃO */}
        {activeModal && !editModalTx && (
          <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
            <form onSubmit={handleSave} className="bg-slate-900 border border-slate-700 p-6 rounded-3xl w-full max-w-sm shadow-2xl my-auto">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-bold capitalize text-slate-100 flex items-center gap-2">
                  {activeModal === 'recorrente' ? <><Repeat className="text-purple-400"/> Assinatura</> : activeModal === 'pagamento' ? 'Quitar Fatura' : `Lançar ${activeModal}`}
                </h3>
                <button type="button" onClick={closeModal} className="text-slate-500 hover:text-slate-300 transition-colors"><X size={24}/></button>
              </div>

              {activeModal !== 'ganho' && activeModal !== 'combustivel' && (
                <div className="mb-4">
                  <label className="text-xs text-slate-400 mb-1 block">
                    {activeModal === 'pagamento' ? 'Qual cartão você vai pagar?' : 'Cartão'}
                  </label>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setCard('nubank')} className={`flex-1 p-3 rounded-xl border font-bold text-sm transition ${card === 'nubank' ? 'bg-[#8a05be]/20 border-[#8a05be] text-[#8a05be]' : 'bg-slate-950 border-slate-700 text-slate-500'}`}>Nubank</button>
                    <button type="button" onClick={() => setCard('c6')} className={`flex-1 p-3 rounded-xl border font-bold text-sm transition ${card === 'c6' ? 'bg-slate-700 border-slate-500 text-white' : 'bg-slate-950 border-slate-700 text-slate-500'}`}>C6 Bank</button>
                  </div>
                </div>
              )}
              
              {activeModal === 'pagamento' && (
                <div className="mb-4 p-3 bg-slate-950 rounded-xl border border-slate-800 text-center">
                   <p className="text-xs text-slate-500 uppercase">Fatura de {getMonthLabel(activeMonthStr)} ({card})</p>
                   <p className="text-xl font-bold text-slate-200">R$ {(card === 'nubank' ? pendingNubank : pendingC6).toFixed(2)}</p>
                </div>
              )}

              {activeModal === 'ganho' && (
                <div className="mb-4">
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setIncomeType('uber')} className={`flex-1 p-3 rounded-xl border font-bold text-sm transition ${incomeType === 'uber' ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400' : 'bg-slate-950 border-slate-700 text-slate-500'}`}>🚕 Uber</button>
                    <button type="button" onClick={() => setIncomeType('aporte')} className={`flex-1 p-3 rounded-xl border font-bold text-sm transition ${incomeType === 'aporte' ? 'bg-amber-500/20 border-amber-500 text-amber-400' : 'bg-slate-950 border-slate-700 text-slate-500'}`}>💰 Aporte</button>
                  </div>
                </div>
              )}

              {activeModal !== 'ganho' && activeModal !== 'combustivel' && activeModal !== 'pagamento' && (
                <div className="mb-4">
                  <label className="text-xs text-slate-400 mb-1 block">Descrição</label>
                  <input autoFocus type="text" value={desc} onChange={(e) => setDesc(e.target.value)} required className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-slate-200 outline-none focus:border-blue-500" placeholder="Ex: Mercado" />
                </div>
              )}

              {activeModal !== 'pagamento' && (
                <div className="mb-4">
                  <label className="text-xs text-slate-400 mb-1 block">Data da Transação</label>
                  <input type="date" value={txDate} onChange={(e) => setTxDate(e.target.value)} required className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-slate-200 outline-none focus:border-blue-500" />
                </div>
              )}

              <div className="mb-4">
                <label className="text-xs text-slate-400 mb-1 block">{activeModal === 'pagamento' ? 'Valor Pago (R$)' : (activeModal === 'despesa' && installments !== '1' ? 'Valor TOTAL da Compra (R$)' : 'Valor (R$)')}</label>
                <input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-slate-200 text-2xl font-bold outline-none focus:border-blue-500" placeholder="0.00" />
              </div>

              {activeModal === 'despesa' && (
                <div className="mb-6">
                  <label className="text-xs text-slate-400 mb-1 block">O sistema vai dividir sozinho:</label>
                  <select value={installments} onChange={(e) => setInstallments(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-slate-200 outline-none focus:border-blue-500">
                    <option value="1">1x (À vista)</option>
                    {Array.from({ length: 35 }, (_, i) => i + 2).map(n => (<option key={n} value={n}>Dividir em {n}x</option>))}
                  </select>
                </div>
              )}

              <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-2xl transition shadow-lg flex justify-center items-center gap-2">
                <Plus size={20} /> Confirmar
              </button>
            </form>
          </div>
        )}
      </main>
    </PinGuard>
  );
}