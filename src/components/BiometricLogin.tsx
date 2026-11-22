import React, { useState } from 'react';
import { browserSupportsWebAuthn, startAuthentication } from '@simplewebauthn/browser';
import { AlertCircle, Fingerprint, Loader2 } from 'lucide-react';
import {
  getWebAuthnLoginChallengeApi,
  loginWebAuthnApi,
  saveLastBiometricHint
} from '../api';
import { EmployeeSession } from '../types/attendance';
import { getWebAuthnRpId, parseSignCountFromAuthDataB64Url } from '../utils/biometricHelpers';

interface BiometricLoginProps {
  identifier: string;
  gasUrlConfigured: boolean;
  highlighted?: boolean;
  onLoginSuccess: (session: EmployeeSession) => void;
  onFallbackToPin: (reasonMsg?: string) => void;
}

export default function BiometricLogin({
  identifier,
  gasUrlConfigured,
  highlighted = false,
  onLoginSuccess,
  onFallbackToPin
}: BiometricLoginProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleWebAuthnLogin = async () => {
    setError('');
    const cleanId = identifier.trim();
    if (!cleanId) {
      setError('Masukkan Nama Lengkap atau ID Pegawai Anda terlebih dahulu.');
      return;
    }
    if (!gasUrlConfigured) {
      setError('URL server Google Apps Script belum terkonfigurasi.');
      return;
    }
    if (!browserSupportsWebAuthn()) {
      onFallbackToPin('Browser ini tidak mendukung Fingerprint/Face ID, silakan gunakan PIN.');
      return;
    }

    setLoading(true);
    try {
      const rpId = getWebAuthnRpId();
      const challengeRes = await getWebAuthnLoginChallengeApi(cleanId, rpId);
      if (challengeRes?.status !== 'success' || !challengeRes?.challenge) {
        const msg = challengeRes?.message || 'Perangkat biometric belum terdaftar untuk akun ini.';
        if (challengeRes?.biometricNotRegistered || challengeRes?.rateLimited) {
          onFallbackToPin(msg);
          return;
        }
        setError(msg);
        return;
      }

      const assertion = await startAuthentication({
        optionsJSON: {
          challenge: challengeRes.challenge,
          rpId: challengeRes.rpId || rpId,
          allowCredentials: (challengeRes.allowCredentials || []).map((c: any) => ({
            id: c.id,
            type: 'public-key'
          })),
          userVerification: 'preferred',
          timeout: 60000
        }
      });

      const counter = parseSignCountFromAuthDataB64Url(assertion.response.authenticatorData);
      const loginRes = await loginWebAuthnApi({
        identifier: cleanId,
        credentialId: assertion.id,
        authenticatorData: assertion.response.authenticatorData,
        clientDataJSON: assertion.response.clientDataJSON,
        signature: assertion.response.signature,
        counter
      });

      if (loginRes?.status === 'success' && loginRes?.employeeToken) {
        saveLastBiometricHint({
          identifier: loginRes.idPegawai || loginRes.nama || cleanId,
          nama: loginRes.nama,
          idPegawai: loginRes.idPegawai,
          hasWebAuthn: true,
          hasFace: !!loginRes.hasFaceDescriptor
        });
        onLoginSuccess({
          employeeToken: loginRes.employeeToken,
          nama: loginRes.nama,
          idPegawai: loginRes.idPegawai || '',
          outlet: loginRes.outlet || '',
          posisi: loginRes.posisi || '',
          expiresAt: loginRes.expiresAt,
          authMethod: 'webauthn',
          hasWebAuthn: true,
          webAuthnDeviceCount: loginRes.webAuthnDeviceCount || 1,
          hasFaceDescriptor: !!loginRes.hasFaceDescriptor
        });
      } else {
        const errMsg = loginRes?.message || 'Biometric gagal, silakan gunakan PIN.';
        onFallbackToPin(errMsg);
      }
    } catch (err: any) {
      const rawName = String(err?.name || '');
      const msg =
        rawName === 'NotAllowedError'
          ? 'Verifikasi biometric dibatalkan atau waktu habis. Silakan gunakan PIN jika diperlukan.'
          : err?.message || 'Biometric gagal, silakan gunakan PIN.';
      onFallbackToPin(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={handleWebAuthnLogin}
        disabled={loading}
        className={`w-full min-h-[52px] px-4 py-3 rounded-xl font-bold text-sm transition flex items-center justify-center gap-2.5 shadow-sm cursor-pointer disabled:opacity-60 ${
          highlighted
            ? 'bg-[#cc0000] hover:bg-[#a30000] text-white'
            : 'bg-neutral-900 hover:bg-neutral-800 text-white'
        }`}
      >
        {loading ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin shrink-0" />
            <span className="whitespace-nowrap">Menunggu Sensor Perangkat...</span>
          </>
        ) : (
          <>
            <Fingerprint className="w-5 h-5 shrink-0" />
            <span className="whitespace-nowrap">Login dengan Fingerprint / Face ID</span>
          </>
        )}
      </button>

      {error && (
        <div className="p-3 rounded-xl bg-red-50 border border-red-200 flex items-start gap-2.5 text-xs text-red-800">
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
          <span className="leading-relaxed font-medium">{error}</span>
        </div>
      )}
    </div>
  );
}
