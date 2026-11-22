import React, { useEffect, useState } from 'react';
import { browserSupportsWebAuthn, startRegistration } from '@simplewebauthn/browser';
import {
  AlertCircle,
  CheckCircle2,
  Fingerprint,
  Loader2,
  Plus,
  Smartphone,
  Trash2
} from 'lucide-react';
import { toast } from 'sonner';
import {
  getWebAuthnDevicesApi,
  getWebAuthnRegisterChallengeApi,
  registerWebAuthnCredentialApi,
  revokeWebAuthnDeviceApi,
  saveLastBiometricHint
} from '../api';
import { WebAuthnDeviceSummary } from '../types/attendance';
import {
  detectFriendlyDeviceName,
  getWebAuthnRpId,
  stringToBase64Url
} from '../utils/biometricHelpers';

interface DaftarBiometricProps {
  employeeNama: string;
  employeeId: string;
  hasFace?: boolean;
  onDevicesChanged?: (devices: WebAuthnDeviceSummary[]) => void;
  onSessionExpired?: () => void;
}

function formatShortWib(iso?: string): string {
  if (!iso) return '-';
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}:\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1]} ${m[4]}`;
  return iso;
}

export default function DaftarBiometric({
  employeeNama,
  employeeId,
  hasFace = false,
  onDevicesChanged,
  onSessionExpired
}: DaftarBiometricProps) {
  const [devices, setDevices] = useState<WebAuthnDeviceSummary[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [registering, setRegistering] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [deviceLabel, setDeviceLabel] = useState(() => detectFriendlyDeviceName());
  const [error, setError] = useState('');
  const supported = typeof window !== 'undefined' && browserSupportsWebAuthn();

  const loadDevices = async () => {
    setLoadingList(true);
    setError('');
    try {
      const res = await getWebAuthnDevicesApi();
      if (res?.authRequired) {
        onSessionExpired?.();
        return;
      }
      if (res?.status === 'success') {
        const list = Array.isArray(res.devices) ? res.devices : [];
        setDevices(list);
        onDevicesChanged?.(list);
      } else {
        setError(res?.message || 'Gagal memuat daftar perangkat biometric.');
      }
    } catch (err: any) {
      setError(err?.message || 'Gagal memuat daftar perangkat biometric.');
    } finally {
      setLoadingList(false);
    }
  };

  useEffect(() => {
    loadDevices();
  }, []);

  const handleRegister = async () => {
    setError('');
    if (!supported) {
      setError('Browser atau perangkat ini tidak mendukung WebAuthn (Fingerprint/Face ID).');
      return;
    }

    setRegistering(true);
    try {
      const rpId = getWebAuthnRpId();
      const chRes = await getWebAuthnRegisterChallengeApi(rpId);
      if (chRes?.authRequired) {
        onSessionExpired?.();
        return;
      }
      if (chRes?.status !== 'success' || !chRes?.challenge) {
        throw new Error(chRes?.message || 'Gagal memulai pendaftaran biometric.');
      }

      const attestation = await startRegistration({
        optionsJSON: {
          challenge: chRes.challenge,
          rp: {
            name: chRes.rpName || 'J&T Absensi',
            id: chRes.rpId || rpId
          },
          user: {
            id: stringToBase64Url(chRes.userId || employeeId || employeeNama),
            name: chRes.userName || employeeNama,
            displayName: employeeNama
          },
          pubKeyCredParams: [{ alg: -7, type: 'public-key' }],
          timeout: 60000,
          attestation: 'none',
          excludeCredentials: (chRes.excludeCredentials || []).map((c: any) => ({
            id: c.id,
            type: 'public-key'
          })),
          authenticatorSelection: {
            userVerification: 'preferred',
            residentKey: 'preferred'
          }
        }
      });

      const saveRes = await registerWebAuthnCredentialApi({
        credentialId: attestation.id,
        publicKey: (attestation.response as any).publicKey || '',
        counter: 0,
        deviceName: deviceLabel.trim() || detectFriendlyDeviceName(),
        clientDataJSON: attestation.response.clientDataJSON,
        attestationObject: attestation.response.attestationObject,
        authenticatorData: (attestation.response as any).authenticatorData || ''
      });

      if (saveRes?.authRequired) {
        onSessionExpired?.();
        return;
      }
      if (saveRes?.status !== 'success') {
        throw new Error(saveRes?.message || 'Gagal menyimpan kredensial biometric.');
      }

      const nextList = Array.isArray(saveRes.devices) ? saveRes.devices : [];
      setDevices(nextList);
      onDevicesChanged?.(nextList);
      saveLastBiometricHint({
        identifier: employeeId || employeeNama,
        nama: employeeNama,
        idPegawai: employeeId,
        hasWebAuthn: nextList.length > 0,
        hasFace
      });
      toast.success(saveRes.message || 'Biometric berhasil didaftarkan');
    } catch (err: any) {
      const msg =
        err?.name === 'NotAllowedError'
          ? 'Pendaftaran dibatalkan atau sensor tidak merespons.'
          : err?.name === 'InvalidStateError'
          ? 'Perangkat ini sudah pernah didaftarkan untuk akun Anda.'
          : err?.message || 'Gagal mendaftarkan biometric.';
      setError(msg);
    } finally {
      setRegistering(false);
    }
  };

  const handleRevoke = async (credentialId: string, deviceName: string) => {
    setRevokingId(credentialId);
    setError('');
    try {
      const res = await revokeWebAuthnDeviceApi({ credentialId });
      if (res?.authRequired) {
        onSessionExpired?.();
        return;
      }
      if (res?.status !== 'success') {
        throw new Error(res?.message || 'Gagal menghapus perangkat biometric.');
      }
      const nextList = Array.isArray(res.devices) ? res.devices : [];
      setDevices(nextList);
      onDevicesChanged?.(nextList);
      saveLastBiometricHint({
        identifier: employeeId || employeeNama,
        nama: employeeNama,
        idPegawai: employeeId,
        hasWebAuthn: nextList.length > 0,
        hasFace
      });
      toast.success(`Perangkat "${deviceName}" dihapus.`);
    } catch (err: any) {
      setError(err?.message || 'Gagal menghapus perangkat.');
    } finally {
      setRevokingId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="p-3.5 rounded-xl bg-neutral-50 border border-neutral-200 space-y-3">
        <div className="flex items-start gap-2.5">
          <Fingerprint className="w-5 h-5 text-[#cc0000] shrink-0 mt-0.5" />
          <div className="text-xs text-neutral-700 leading-relaxed">
            <p className="font-bold text-neutral-900">Daftarkan Fingerprint / Face ID Perangkat</p>
            <p className="text-neutral-600 mt-0.5">
              Aktifkan login 1 sentuhan di HP atau laptop ini. Maksimal 5 perangkat dapat didaftarkan.
            </p>
          </div>
        </div>

        <div>
          <label htmlFor="bio-device-name" className="block text-xs font-semibold text-neutral-700 mb-1">
            Nama Perangkat
          </label>
          <input
            id="bio-device-name"
            type="text"
            value={deviceLabel}
            onChange={(e) => setDeviceLabel(e.target.value)}
            maxLength={60}
            disabled={registering || !supported}
            placeholder="Contoh: Samsung A54 · Chrome"
            className="w-full min-h-[44px] px-3 py-2 bg-white border border-neutral-300 rounded-lg text-xs text-neutral-900 focus:ring-2 focus:ring-[#cc0000] outline-none"
          />
        </div>

        <button
          type="button"
          onClick={handleRegister}
          disabled={registering || !supported || devices.length >= 5}
          className="w-full min-h-[46px] px-4 py-2.5 bg-[#cc0000] hover:bg-[#a30000] text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 transition disabled:opacity-50 cursor-pointer"
        >
          {registering ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Memindai Sensor...</span>
            </>
          ) : (
            <>
              <Plus className="w-4 h-4" />
              <span>Daftarkan Fingerprint/Face ID</span>
            </>
          )}
        </button>

        {!supported && (
          <p className="text-[11px] text-amber-700 font-medium">
            Browser ini tidak mendukung WebAuthn. Gunakan Chrome/Safari modern atau metode Wajah/PIN.
          </p>
        )}
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-red-50 border border-red-200 flex items-start gap-2 text-xs text-red-800">
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
          <span className="leading-relaxed">{error}</span>
        </div>
      )}

      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="font-bold text-neutral-800">Perangkat Terdaftar</span>
          <span className="text-neutral-500 font-mono tabular-nums">{devices.length} / 5</span>
        </div>

        {loadingList ? (
          <div className="py-6 text-center text-xs text-neutral-500 flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Memuat perangkat...</span>
          </div>
        ) : devices.length === 0 ? (
          <div className="p-4 rounded-xl border border-dashed border-neutral-200 text-center text-xs text-neutral-500">
            Belum ada perangkat Fingerprint / Face ID terdaftar.
          </div>
        ) : (
          <div className="divide-y divide-neutral-200 border border-neutral-200 rounded-xl bg-white overflow-hidden">
            {devices.map((dev) => (
              <div key={dev.credentialId} className="p-3 flex items-center justify-between gap-3">
                <div className="flex items-start gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center shrink-0">
                    <Smartphone className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-xs font-bold text-neutral-900 truncate">{dev.deviceName}</p>
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    </div>
                    <p className="text-[11px] text-neutral-500 font-mono tabular-nums mt-0.5">
                      Didaftarkan {formatShortWib(dev.registeredAt)} · Dipakai {formatShortWib(dev.lastUsedAt)}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleRevoke(dev.credentialId, dev.deviceName)}
                  disabled={revokingId === dev.credentialId}
                  className="min-h-[40px] px-3 py-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-700 text-xs font-semibold inline-flex items-center gap-1 shrink-0 transition cursor-pointer disabled:opacity-50"
                >
                  {revokingId === dev.credentialId ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="w-3.5 h-3.5" />
                  )}
                  <span>Hapus</span>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
