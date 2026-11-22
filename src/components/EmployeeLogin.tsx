import React, { useEffect, useState } from 'react';
import { browserSupportsWebAuthn } from '@simplewebauthn/browser';
import {
  AlertCircle,
  Eye,
  EyeOff,
  Fingerprint,
  KeyRound,
  Lock,
  ShieldCheck,
  Sparkles,
  User
} from 'lucide-react';
import {
  employeeLoginApi,
  getLastBiometricHint,
  saveLastBiometricHint
} from '../api';
import { EmployeeSession } from '../types/attendance';
import { detectCameraAvailable } from '../utils/biometricHelpers';
import BiometricLogin from './BiometricLogin';
import FaceLogin from './FaceLogin';

interface EmployeeLoginProps {
  gasUrlConfigured: boolean;
  onLoginSuccess: (session: EmployeeSession) => void;
}

export default function EmployeeLogin({ gasUrlConfigured, onLoginSuccess }: EmployeeLoginProps) {
  const [initialHint] = useState(() => getLastBiometricHint());
  const webAuthnSupported = typeof window !== 'undefined' && browserSupportsWebAuthn();
  const [cameraSupported, setCameraSupported] = useState(false);

  const [identifier, setIdentifier] = useState(() => initialHint?.identifier || '');
  const [authTab, setAuthTab] = useState<'biometric' | 'pin'>(webAuthnSupported ? 'biometric' : 'pin');
  const [pin, setPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [fallbackNotice, setFallbackNotice] = useState('');

  useEffect(() => {
    let active = true;
    detectCameraAvailable().then((hasCam) => {
      if (!active) return;
      setCameraSupported(hasCam);
      if (hasCam && !webAuthnSupported && !pin && !fallbackNotice) {
        setAuthTab('biometric');
      }
    });
    return () => {
      active = false;
    };
  }, []);

  const anyBiometricAvailable = webAuthnSupported || cameraSupported;
  const cleanIdLower = identifier.trim().toLowerCase();
  const matchesHint =
    !!initialHint &&
    cleanIdLower.length > 0 &&
    (cleanIdLower === (initialHint.identifier || '').toLowerCase() ||
      cleanIdLower === (initialHint.idPegawai || '').toLowerCase() ||
      cleanIdLower === (initialHint.nama || '').toLowerCase()) &&
    (initialHint.hasWebAuthn || initialHint.hasFace);

  const handlePinChange = (val: string) => {
    const digitsOnly = val.replace(/\D/g, '').slice(0, 6);
    setPin(digitsOnly);
  };

  const handleFallbackToPin = (reasonMsg?: string) => {
    setAuthTab('pin');
    setFallbackNotice(reasonMsg || 'Biometric gagal, silakan gunakan PIN.');
    setError('');
  };

  const handleSubmitPin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setFallbackNotice('');

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
        if (res.hasWebAuthn || res.hasFaceDescriptor) {
          saveLastBiometricHint({
            identifier: res.idPegawai || res.nama || cleanId,
            nama: res.nama,
            idPegawai: res.idPegawai,
            hasWebAuthn: !!res.hasWebAuthn,
            hasFace: !!res.hasFaceDescriptor
          });
        }
        onLoginSuccess({
          employeeToken: res.employeeToken,
          nama: res.nama,
          idPegawai: res.idPegawai || '',
          outlet: res.outlet || '',
          posisi: res.posisi || '',
          expiresAt: res.expiresAt,
          authMethod: 'pin',
          hasWebAuthn: !!res.hasWebAuthn,
          webAuthnDeviceCount: res.webAuthnDeviceCount || 0,
          hasFaceDescriptor: !!res.hasFaceDescriptor
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
        <p className="text-xs text-red-100 mt-0.5">
          Masuk dengan Biometric (Sidik Jari / Wajah) atau PIN absensi
        </p>
      </div>

      <div className="p-6 space-y-4">
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
              onChange={(e) => {
                setIdentifier(e.target.value);
                setError('');
              }}
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

        {/* Mode Switcher: Biometric vs PIN */}
        <div className="grid grid-cols-2 gap-1.5 p-1 bg-neutral-100 rounded-xl border border-neutral-200">
          <button
            type="button"
            disabled={!anyBiometricAvailable}
            onClick={() => {
              setAuthTab('biometric');
              setError('');
            }}
            className={`min-h-[42px] px-3 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed ${
              authTab === 'biometric'
                ? 'bg-white text-[#cc0000] shadow-sm border border-neutral-200'
                : 'text-neutral-600 hover:text-neutral-900'
            }`}
          >
            <Fingerprint className="w-4 h-4 shrink-0" />
            <span>Biometric</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setAuthTab('pin');
              setError('');
            }}
            className={`min-h-[42px] px-3 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer ${
              authTab === 'pin'
                ? 'bg-white text-[#cc0000] shadow-sm border border-neutral-200'
                : 'text-neutral-600 hover:text-neutral-900'
            }`}
          >
            <KeyRound className="w-4 h-4 shrink-0" />
            <span>PIN Cadangan</span>
          </button>
        </div>

        {authTab === 'biometric' ? (
          <div className="space-y-3">
            {matchesHint && (
              <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center gap-2 text-xs text-emerald-900">
                <Sparkles className="w-4 h-4 text-emerald-600 shrink-0" />
                <span className="font-medium">
                  Biometric terdeteksi untuk akun Anda — tap untuk login cepat.
                </span>
              </div>
            )}

            {webAuthnSupported && (
              <BiometricLogin
                identifier={identifier}
                gasUrlConfigured={gasUrlConfigured}
                highlighted={matchesHint ? !!initialHint?.hasWebAuthn : true}
                onLoginSuccess={onLoginSuccess}
                onFallbackToPin={handleFallbackToPin}
              />
            )}

            {cameraSupported && (
              <FaceLogin
                identifier={identifier}
                gasUrlConfigured={gasUrlConfigured}
                onLoginSuccess={onLoginSuccess}
                onFallbackToPin={handleFallbackToPin}
              />
            )}

            {!anyBiometricAvailable && (
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900">
                Perangkat atau browser ini tidak mendukung sensor Biometric/Kamera. Gunakan tab <strong>PIN Cadangan</strong>.
              </div>
            )}

            <p className="text-[11px] text-neutral-500 text-center leading-relaxed pt-1">
              Belum mendaftarkan sidik jari atau wajah? Masuk dengan{' '}
              <button
                type="button"
                onClick={() => setAuthTab('pin')}
                className="font-bold text-[#cc0000] hover:underline cursor-pointer"
              >
                PIN terlebih dahulu
              </button>
              , lalu aktifkan dari menu <strong>Biometric</strong>.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmitPin} className="space-y-4">
            {fallbackNotice && (
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 flex items-start gap-2.5 text-xs text-amber-900">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <span className="leading-relaxed font-medium">{fallbackNotice}</span>
              </div>
            )}

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
          </form>
        )}

        <div className="pt-2 border-t border-neutral-100 text-[11px] text-neutral-500 leading-relaxed text-center">
          Belum punya PIN atau lupa PIN? Hubungi <strong>Owner</strong> untuk mengatur ulang PIN melalui menu Manajemen Pegawai.
        </div>
      </div>
    </div>
  );
}

