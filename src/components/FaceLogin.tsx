import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, Camera, Loader2, ScanFace, X } from 'lucide-react';
import { loginFaceRecognitionApi, saveLastBiometricHint } from '../api';
import { EmployeeSession } from '../types/attendance';
import { extractLivenessMetrics, loadFaceModelsLazy } from '../utils/biometricHelpers';

interface FaceLoginProps {
  identifier: string;
  gasUrlConfigured: boolean;
  onLoginSuccess: (session: EmployeeSession) => void;
  onFallbackToPin: (reasonMsg?: string) => void;
}

export default function FaceLogin({
  identifier,
  gasUrlConfigured,
  onLoginSuccess,
  onFallbackToPin
}: FaceLoginProps) {
  const [active, setActive] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [livenessProgress, setLivenessProgress] = useState(0);
  const [error, setError] = useState('');

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const cancelledRef = useRef(false);

  const stopCamera = () => {
    cancelledRef.current = true;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => {
        try { t.stop(); } catch (e) {}
      });
      streamRef.current = null;
    }
    if (videoRef.current) {
      try { videoRef.current.srcObject = null; } catch (e) {}
    }
  };

  useEffect(() => {
    return () => stopCamera();
  }, []);

  const handleStartFaceScan = async () => {
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

    cancelledRef.current = false;
    setActive(true);
    setLivenessProgress(10);
    setStatusText('Memuat model pengenalan wajah...');

    try {
      const [faceapi, stream] = await Promise.all([
        loadFaceModelsLazy(),
        navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
          audio: false
        })
      ]);

      if (cancelledRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      setLivenessProgress(35);
      setStatusText('Arahkan wajah ke kamera, lalu kedip atau gerakkan kepala sedikit...');

      let baseMetrics: { ear: number; noseNormX: number; noseNormY: number } | null = null;
      let livenessPassed = false;
      let bestDescriptor: number[] | null = null;
      const startedAt = Date.now();
      const timeoutMs = 12000;

      while (!cancelledRef.current && Date.now() - startedAt < timeoutMs) {
        if (!videoRef.current || videoRef.current.readyState < 2) {
          await new Promise((r) => setTimeout(r, 180));
          continue;
        }

        const det = await faceapi
          .detectSingleFace(videoRef.current, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.55 }))
          .withFaceLandmarks()
          .withFaceDescriptor();

        if (det && det.descriptor) {
          const metrics = extractLivenessMetrics(det.landmarks, det.detection.box);
          if (!baseMetrics) {
            baseMetrics = metrics;
            setLivenessProgress(60);
          } else {
            const earDelta = Math.abs(metrics.ear - baseMetrics.ear);
            const moveDelta = Math.hypot(
              metrics.noseNormX - baseMetrics.noseNormX,
              metrics.noseNormY - baseMetrics.noseNormY
            );
            if (metrics.ear < 0.22 || earDelta >= 0.038 || moveDelta >= 0.032) {
              livenessPassed = true;
              bestDescriptor = Array.from(det.descriptor).map((n) => Number(n.toFixed(6)));
              setLivenessProgress(85);
              break;
            }
          }
        }
        await new Promise((r) => setTimeout(r, 240));
      }

      stopCamera();
      setActive(false);

      if (cancelledRef.current) return;

      if (!livenessPassed || !bestDescriptor) {
        const msg = 'Wajah atau gerakan tidak terdeteksi jelas (pastikan cahaya cukup). Silakan gunakan PIN.';
        setError(msg);
        onFallbackToPin(msg);
        return;
      }

      setStatusText('Memverifikasi wajah di server...');
      const res = await loginFaceRecognitionApi(cleanId, bestDescriptor);

      if (res?.status === 'success' && res?.employeeToken) {
        saveLastBiometricHint({
          identifier: res.idPegawai || res.nama || cleanId,
          nama: res.nama,
          idPegawai: res.idPegawai,
          hasWebAuthn: !!res.hasWebAuthn,
          hasFace: true
        });
        onLoginSuccess({
          employeeToken: res.employeeToken,
          nama: res.nama,
          idPegawai: res.idPegawai || '',
          outlet: res.outlet || '',
          posisi: res.posisi || '',
          expiresAt: res.expiresAt,
          authMethod: 'face',
          hasWebAuthn: !!res.hasWebAuthn,
          webAuthnDeviceCount: res.webAuthnDeviceCount || 0,
          hasFaceDescriptor: true
        });
      } else {
        const failMsg = res?.message || 'Wajah tidak cocok. Silakan gunakan PIN.';
        onFallbackToPin(failMsg);
      }
    } catch (err: any) {
      stopCamera();
      setActive(false);
      const errMsg =
        err?.name === 'NotAllowedError'
          ? 'Izin kamera ditolak. Silakan aktifkan kamera atau gunakan PIN.'
          : err?.message || 'Verifikasi wajah gagal, silakan gunakan PIN.';
      setError(errMsg);
      onFallbackToPin(errMsg);
    }
  };

  return (
    <div className="space-y-3">
      {!active ? (
        <button
          type="button"
          onClick={handleStartFaceScan}
          className="w-full min-h-[48px] px-4 py-2.5 bg-neutral-100 hover:bg-neutral-200 border border-neutral-300 text-neutral-900 font-bold text-sm rounded-xl transition flex items-center justify-center gap-2 cursor-pointer"
        >
          <ScanFace className="w-5 h-5 text-[#cc0000] shrink-0" />
          <span className="whitespace-nowrap">Login dengan Wajah</span>
        </button>
      ) : (
        <div className="rounded-xl border border-neutral-200 bg-neutral-950 overflow-hidden">
          <div className="relative aspect-[4/3] w-full bg-black flex items-center justify-center">
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              className="w-full h-full object-cover scale-x-[-1]"
            />
            <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/85 via-black/45 to-transparent text-white space-y-1.5">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="font-medium flex items-center gap-1.5">
                  {livenessProgress < 85 ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                  ) : (
                    <Camera className="w-3.5 h-3.5 shrink-0" />
                  )}
                  <span>{statusText}</span>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    stopCamera();
                    setActive(false);
                  }}
                  className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg bg-white/15 hover:bg-white/25 text-white cursor-pointer"
                  aria-label="Batalkan pindai wajah"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="w-full h-1.5 bg-white/20 rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#cc0000] transition-all duration-200"
                  style={{ width: `${livenessProgress}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="p-3 rounded-xl bg-red-50 border border-red-200 flex items-start gap-2.5 text-xs text-red-800">
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
          <span className="leading-relaxed font-medium">{error}</span>
        </div>
      )}
    </div>
  );
}
