"use client";
import React, { useState } from 'react';
import { Lock } from 'lucide-react';

export default function PinGuard({ children }: { children: React.ReactNode }) {
  const [pin, setPin] = useState('');
  const [isAuth, setIsAuth] = useState(false);
  const [error, setError] = useState(false);

  // Autenticação blindada direta na constante
  const MASTER_PIN = '200407';

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (pin === MASTER_PIN) {
      setIsAuth(true);
      setError(false);
    } else {
      setError(true);
      setPin('');
    }
  };

  if (isAuth) return <>{children}</>;

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 p-8 rounded-2xl w-full max-w-sm shadow-2xl flex flex-col items-center">
        <div className="bg-blue-500/20 p-4 rounded-full mb-6">
          <Lock className="text-blue-500" size={32} />
        </div>
        <h1 className="text-xl font-bold text-slate-100 mb-2">Acesso Restrito</h1>
        <p className="text-sm text-slate-400 mb-8 text-center">Insira seu PIN de segurança para acessar o financeiro.</p>
        
        <form onSubmit={handleLogin} className="w-full flex flex-col gap-4">
          <input
            type="password"
            inputMode="numeric"
            autoFocus
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            className="w-full bg-slate-950 border border-slate-700 rounded-lg p-4 text-center text-2xl tracking-[0.5em] text-slate-200 outline-none focus:border-blue-500 transition-colors"
            placeholder="••••••"
          />
          {error && <p className="text-red-400 text-xs text-center font-bold">PIN Incorreto.</p>}
          <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-xl transition shadow-lg mt-2">
            Desbloquear
          </button>
        </form>
      </div>
    </div>
  );
}