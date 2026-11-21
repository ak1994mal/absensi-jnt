import React, { useState } from 'react';
import { AlertCircle, Eye, EyeOff, KeyRound, Lock, ShieldCheck, User } from 'lucide-react';
import { employeeLoginApi } from '../api';
import { EmployeeSession } from '../types/attendance';

interface EmployeeLoginProps {
  gasUrlConfigured: boolean;
  onLoginSuccess: (session: EmployeeSession) => void;
}

export default function EmployeeLogin({ gasUrlConfigured, onLoginSuccess }: EmployeeLoginProps) {
  const [identifier, setIdentifier] = useState('');
  const [pin, setPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handlePinChange = (val: string) => {
    const digitsOnly = val.replace(/\D/g, '').slice(0, 6);
    setPin(digitsOnly);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const cleanId = identifier.trim();
    const cleanPin = pin.trim();

    if (!cleanId) {
      setError('Masukkan Nama Lengkap atau ID Pegawai Anda.');
      return;
    }
    if (!/^\d{4,6}$/.test(cleanPin)) {
      setError('PIN absensi harus terdiri dari 4 sampai 6 digit angka.');
      return;
    }
    if (!gasUrlConfigured) {
      setError('URL server Google Apps Script belum terkonfigurasi.');
      return;
    }

    setLoading(true);
    try {
      const res = await employeeLoginApi(cleanId, cleanPin);
      if (res?.status === 'success' && res?.employeeToken) {
        onLoginSuccess({
          employeeToken: res.employeeToken,
          nama: res.nama,
          idPegawai: res.idPegawai || '',
          outlet: res.outlet || '',
          posisi: res.posisi || '',
          expiresAt: res.expiresAt
        });
        setPin('');
      } else {
        setError(res?.message || 'Nama / ID Pegawai atau PIN tidak valid.');
      }
    } catch (err: any) {
      setError(err?.message || 'Gagal menghubungi server untuk login pegawai.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-neutral-200 overflow-hidden animate-in fade-in duration-300">
      <div className="bg-[#cc0000] px-6 py-5 text-white text-center">
        <div className="w-11 h-11 rounded-xl bg-white/15 border border-white/25 flex items-center justify-center mx-auto mb-2.5">
          <ShieldCheck className="w-6 h-6 text-white" />
        </div>
        <h1 className="text-lg font-bold tracking-wide">ABSENSI J&amp;T</h1>
        <p className="text-xs text-red-100 mt-0.5">Masuk menggunakan identitas dan PIN absensi Anda</p>
      </div>

      <form onSubmit={handleSubmit} className="p-6 space-y-4">
        <div>
          <label htmlFor="emp-identifier" className="block text-sm font-semibold text-neutral-700 mb-1.5">
            Nama Lengkap atau ID Pegawai
          </label>
          <div className="relative">
            <User className="w-4 h-4 text-neutral-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              id="emp-identifier"
              type="text"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="Contoh: Rahma Putri atau JT0101008"
              autoComplete="username"
              disabled={loading}
              className="w-full min-h-[44px] pl-10 pr-3.5 py-2.5 bg-neutral-50 border border-neutral-300 rounded-xl text-sm text-neutral-900 focus:ring-2 focus:ring-[#cc0000] focus:border-[#cc0000] focus:bg-white outline-none transition"
            />
          </div>
          <p className="text-[11px] text-neutral-500 mt-1">
            Saran: gunakan ID Pegawai Anda.
          </p>
        </div>

        <div>
          <label htmlFor="emp-pin" className="block text-sm font-semibold text-neutral-700 mb-1.5">
            PIN Absensi (4–6 Digit)
          </label>
          <div className="relative">
            <KeyRound className="w-4 h-4 text-neutral-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              id="emp-pin"
              type={showPin ? 'text' : 'password'}
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              value={pin}
              onChange={(e) => handlePinChange(e.target.value)}
              placeholder="••••••"
              autoComplete="current-password"
              disabled={loading}
              className="w-full min-h-[44px] pl-10 pr-12 py-2.5 bg-neutral-50 border border-neutral-300 rounded-xl text-base font-mono tracking-[0.25em] text-neutral-900 focus:ring-2 focus:ring-[#cc0000] focus:border-[#cc0000] focus:bg-white outline-none transition"
            />
            <button
              type="button"
              onClick={() => setShowPin((v) => !v)}
              aria-label={showPin ? 'Sembunyikan PIN' : 'Tampilkan PIN'}
              className="absolute right-1 top-1/2 -translate-y-1/2 min-h-[44px] min-w-[44px] flex items-center justify-center text-neutral-500 hover:text-neutral-800 cursor-pointer"
            >
              {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-red-50 border border-red-200 flex items-start gap-2.5 text-xs text-red-800">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <span className="leading-relaxed font-medium">{error}</span>
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full min-h-[48px] bg-[#cc0000] hover:bg-[#a30000] active:scale-[0.99] text-white font-bold text-sm rounded-xl shadow-sm transition flex items-center justify-center gap-2 disabled:opacity-60 cursor-pointer"
        >
          <Lock className="w-4 h-4" />
          <span>{loading ? 'Memverifikasi...' : 'Login'}</span>
        </button>

        <div className="pt-2 border-t border-neutral-100 text-[11px] text-neutral-500 leading-relaxed text-center">
          Belum punya PIN atau lupa PIN? Hubungi <strong>Owner</strong> untuk mengatur ulang PIN melalui menu Manajemen Pegawai.
        </div>
      </form>
    </div>
  );
}
