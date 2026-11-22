import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Camera,
  CheckCircle2,
  Loader2,
  RotateCcw,
  ScanFace,
  Trash2,
  X
} from 'lucide-react';
import { toast } from 'sonner';
import {
  deleteFaceDescriptorApi,
  getWebAuthnDevicesApi,
  registerFaceDescriptorApi,
  saveLastBiometricHint
} from '../api';
import {
  averageAndNormalizeDescriptors,
  loadFaceModelsLazy
} from '../utils/biometricHelpers';

interface DaftarWajahProps {
  employeeNama: string;
  employeeId: string;
  hasWebAuthn?: boolean;
  initialHasFace?: boolean;
  onFaceStatusChanged?: (hasFace: boolean) => void;
  onSessionExpired?: () => void;
}

const ANGLES = [
  { key: 'front', label: 'Hadap Depan', hint: 'Tatap lurus ke kamera dengan cahaya cukup' },
  { key: 'left', label: 'Toleh Sedikit Kiri', hint: 'Putar kepala sedikit ke kiri (~15°)' },
  { key: 'right', label: 'Toleh Sedikit Kanan', hint: 'Putar kepala sedikit ke kanan (~15°)' }
];

function formatShortWib(iso?: string): string {
  if (!iso) return '-';
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}:\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1]} ${m[4]}`;
  return iso;
}

export default function DaftarWajah({
  employeeNama,
  employeeId,
  hasWebAuthn = false,
  initialHasFace = false,
  onFaceStatusChanged,
  onSessionExpired
}: DaftarWajahProps) {
  const [hasFace, setHasFace] = useState(initialHasFace);
  const [faceRegisteredAt, setFaceRegisteredAt] = useState('');
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [modelsReady, setModelsReady] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  const [stepIdx, setStepIdx] = useState(0);
  const [captures, setCaptures] = useState<Array<{ descriptor: number[]; preview: string }>>([]);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const faceApiRef = useRef<any>(null);

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => {
        try { t.stop(); } catch (e) {}
      });
      streamRef.current = null;
    }
    if (videoRef.current) {
      try { videoRef.current.srcObject = null; } catch (e) {}
    }
    setCameraOpen(false);
  };

  useEffect(() => {
    let active = true;
    const loadStatus = async () => {
      setLoadingStatus(true);
      try {
        const res = await getWebAuthnDevicesApi();
        if (!active) return;
        if (res?.authRequired) {
          onSessionExpired?.();
          return;
        }
        if (res?.status === 'success') {
          setHasFace(!!res.hasFaceDescriptor);
          setFaceRegisteredAt(res.faceRegisteredAt || '');
        }
      } catch (e) {
      } finally {
        if (active) setLoadingStatus(false);
      }
    };
    loadStatus();
    return () => {
      active = false;
      stopCamera();
    };
  }, []);

  const handleOpenCamera = async () => {
    setError('');
    setCaptures([]);
    setStepIdx(0);
    setCameraOpen(true);
    setModelsReady(false);

    try {
      const [faceapi, stream] = await Promise.all([
        loadFaceModelsLazy(),
        navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
          audio: false
        })
      ]);
      faceApiRef.current = faceapi;
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setModelsReady(true);
    } catch (err: any) {
      stopCamera();
      setError(
        err?.name === 'NotAllowedError'
          ? 'Izin kamera ditolak oleh browser.'
          : err?.message || 'Gagal menyiapkan kamera atau model pengenalan wajah.'
      );
    }
  };

  const handleCaptureAngle = async () => {
    if (!videoRef.current || !faceApiRef.current || !modelsReady) return;
    setError('');
    setCapturing(true);
    try {
      const faceapi = faceApiRef.current;
      const det = await faceapi
        .detectSingleFace(videoRef.current, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.55 }))
        .withFaceLandmarks()
        .withFaceDescriptor();

      if (!det || !det.descriptor) {
        setError('Wajah belum terdeteksi jelas. Posisikan wajah di tengah frame dengan pencahayaan cukup.');
        return;
      }

      const canvas = document.createElement('canvas');
      canvas.width = 240;
      canvas.height = 180;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
      }
      const previewUrl = canvas.toDataURL('image/jpeg', 0.7);
      const nextCaptures = [
        ...captures,
        {
          descriptor: Array.from(det.descriptor as Float32Array),
          preview: previewUrl
        }
      ];
      setCaptures(nextCaptures);

      if (nextCaptures.length >= ANGLES.length) {
        stopCamera();
        await handleSubmitDescriptors(nextCaptures.map((c) => c.descriptor));
      } else {
        setStepIdx(nextCaptures.length);
      }
    } catch (err: any) {
      setError(err?.message || 'Gagal menangkap foto wajah.');
    } finally {
      setCapturing(false);
    }
  };

  const handleSubmitDescriptors = async (rawList: number[][]) => {
    setSaving(true);
    setError('');
    try {
      const averaged = averageAndNormalizeDescriptors(rawList);
      const res = await registerFaceDescriptorApi(averaged, true);
      if (res?.authRequired) {
        onSessionExpired?.();
        return;
      }
      if (res?.status !== 'success') {
        throw new Error(res?.message || 'Gagal menyimpan profil wajah.');
      }
      setHasFace(true);
      setFaceRegisteredAt(res.faceRegisteredAt || '');
      onFaceStatusChanged?.(true);
      saveLastBiometricHint({
        identifier: employeeId || employeeNama,
        nama: employeeNama,
        idPegawai: employeeId,
        hasWebAuthn,
        hasFace: true
      });
      toast.success('Profil wajah berhasil didaftarkan.');
    } catch (err: any) {
      setError(err?.message || 'Gagal menyimpan profil wajah.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteFace = async () => {
    setDeleting(true);
    setError('');
    try {
      const res = await deleteFaceDescriptorApi();
      if (res?.authRequired) {
        onSessionExpired?.();
        return;
      }
      if (res?.status !== 'success') {
        throw new Error(res?.message || 'Gagal menghapus profil wajah.');
      }
      setHasFace(false);
      setFaceRegisteredAt('');
      setCaptures([]);
      onFaceStatusChanged?.(false);
      saveLastBiometricHint({
        identifier: employeeId || employeeNama,
        nama: employeeNama,
        idPegawai: employeeId,
        hasWebAuthn,
        hasFace: false
      });
      toast.success('Profil wajah berhasil dihapus.');
    } catch (err: any) {
      setError(err?.message || 'Gagal menghapus profil wajah.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="p-3.5 rounded-xl bg-neutral-50 border border-neutral-200 space-y-3">
        <div className="flex items-start gap-2.5">
          <ScanFace className="w-5 h-5 text-[#cc0000] shrink-0 mt-0.5" />
          <div className="text-xs text-neutral-700 leading-relaxed">
            <p className="font-bold text-neutral-900">Pendaftaran Wajah (3 Sudut)</p>
            <p className="text-neutral-600 mt-0.5">
              Hanya vektor matematis 128 dimensi yang disimpan, bukan foto mentah. Digunakan sebagai pelengkap jika sidik jari tidak tersedia.
            </p>
          </div>
        </div>

        {loadingStatus ? (
          <div className="py-3 text-xs text-neutral-500 flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Memeriksa status profil wajah...</span>
          </div>
        ) : hasFace && !cameraOpen ? (
          <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs text-emerald-900">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <div>
                <p className="font-bold">Profil Wajah Aktif</p>
                <p className="text-[11px] text-emerald-700 font-mono tabular-nums">
                  Terdaftar: {formatShortWib(faceRegisteredAt)}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleDeleteFace}
              disabled={deleting}
              className="min-h-[40px] px-3 py-1.5 rounded-lg bg-white border border-red-200 text-red-700 hover:bg-red-50 text-xs font-semibold inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
            >
              {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              <span>Hapus</span>
            </button>
          </div>
        ) : null}

        {!cameraOpen && (
          <button
            type="button"
            onClick={handleOpenCamera}
            disabled={saving}
            className="w-full min-h-[46px] px-4 py-2.5 bg-[#cc0000] hover:bg-[#a30000] text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 transition disabled:opacity-50 cursor-pointer"
          >
            <Camera className="w-4 h-4" />
            <span>{hasFace ? 'Perbarui Profil Wajah (3 Foto)' : 'Daftarkan Wajah'}</span>
          </button>
        )}
      </div>

      {cameraOpen && (
        <div className="rounded-xl border border-neutral-200 bg-neutral-950 overflow-hidden space-y-0">
          <div className="px-3.5 py-2.5 bg-neutral-900 text-white flex items-center justify-between text-xs">
            <div>
              <p className="font-bold">Langkah {stepIdx + 1} / 3: {ANGLES[stepIdx].label}</p>
              <p className="text-[11px] text-neutral-300">{ANGLES[stepIdx].hint}</p>
            </div>
            <button
              type="button"
              onClick={stopCamera}
              className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg bg-white/10 hover:bg-white/20 cursor-pointer"
              aria-label="Tutup kamera"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="relative aspect-[4/3] bg-black flex items-center justify-center">
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              className="w-full h-full object-cover scale-x-[-1]"
            />
            {!modelsReady && (
              <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center text-white gap-2 text-xs">
                <Loader2 className="w-6 h-6 animate-spin" />
                <span>Menyiapkan kamera & model AI wajah...</span>
              </div>
            )}
          </div>

          <div className="p-3 bg-white flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => {
                setCaptures([]);
                setStepIdx(0);
              }}
              disabled={capturing || captures.length === 0}
              className="min-h-[44px] px-3 py-2 rounded-lg bg-neutral-100 text-neutral-700 text-xs font-semibold inline-flex items-center gap-1 disabled:opacity-40 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Ulangi</span>
            </button>
            <button
              type="button"
              onClick={handleCaptureAngle}
              disabled={!modelsReady || capturing}
              className="flex-1 min-h-[44px] px-4 py-2 rounded-lg bg-[#cc0000] hover:bg-[#a30000] text-white text-xs font-bold inline-flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
            >
              {capturing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
              <span>{capturing ? 'Mendeteksi...' : `Ambil Foto (${ANGLES[stepIdx].label})`}</span>
            </button>
          </div>
        </div>
      )}

      {captures.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {ANGLES.map((ang, i) => {
            const shot = captures[i];
            return (
              <div key={ang.key} className="rounded-lg border border-neutral-200 bg-neutral-50 overflow-hidden text-center">
                {shot ? (
                  <img src={shot.preview} alt={ang.label} className="w-full h-20 object-cover" />
                ) : (
                  <div className="w-full h-20 flex items-center justify-center text-[11px] text-neutral-400">
                    Menunggu
                  </div>
                )}
                <p className="text-[10px] font-semibold text-neutral-700 py-1 px-1 truncate">{ang.label}</p>
              </div>
            );
          })}
        </div>
      )}

      {saving && (
        <div className="p-3 rounded-xl bg-neutral-50 border border-neutral-200 flex items-center gap-2 text-xs text-neutral-700">
          <Loader2 className="w-4 h-4 animate-spin text-[#cc0000]" />
          <span>Menyimpan descriptor wajah terenkripsi ke profil Anda...</span>
        </div>
      )}

      {error && (
        <div className="p-3 rounded-xl bg-red-50 border border-red-200 flex items-start gap-2 text-xs text-red-800">
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
          <span className="leading-relaxed">{error}</span>
        </div>
      )}
    </div>
  );
}
