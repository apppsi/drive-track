"use client";
import React, { useState, useEffect } from 'react';
import { Lock } from 'lucide-react';

export default function PinGuard({ children }: { children: React.ReactNode }) {
  const [pin, setPin] = useState('');
  const [isAuth, setIsAuth] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    // Busca o PIN. Se não existir, define "123456" para o primeiro acesso
    const saved = localStorage.getItem('user_pin');
    if (!saved) localStorage.setItem('user_pin', '200407'); 
  }, []);

  const checkPin = (val: string) => {
    const numericVal = val.replace(/\D/g, '');
    setPin(numericVal);
    
    if (numericVal.length === 6) {
      if (numericVal === localStorage.getItem('user_pin')) {
        setIsAuth(true);
      } else {
        setError(true);
        setTimeout(() => { setPin(''); setError(false); }, 1000);
      }
    }
  };

  if (!isAuth) {
    return (
      <div className="fixed inset-0 bg-slate-950 flex flex-col items-center justify-center p-6 z-50">
        <div className="bg-slate-900 p-8 rounded-2xl border border-slate-800 flex flex-col items-center shadow-2xl">
          <Lock className={`w-12 h-12 mb-6 transition-colors ${error ? 'text-red-500 animate-bounce' : 'text-blue-500'}`} />
          <h1 className="text-slate-100 text-xl font-bold mb-2">Acesso Restrito</h1>
          <p className="text-slate-400 text-sm mb-8 text-center">Digite seu PIN de 6 dígitos para acessar a administração financeira.</p>
          
          <input 
            type="password" 
            inputMode="numeric"
            maxLength={6} 
            value={pin}
            onChange={(e) => checkPin(e.target.value)}
            className="bg-slate-950 text-slate-100 text-center text-3xl tracking-[0.5em] p-4 rounded-xl border border-slate-700 focus:border-blue-500 outline-none w-full max-w-[280px] transition-all"
            placeholder="••••••"
          />
        </div>
      </div>
    );
  }

  return <>{children}</>;
}