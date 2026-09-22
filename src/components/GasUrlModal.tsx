import React, { useState } from 'react';
import { Globe, RefreshCw, CheckCircle2, AlertCircle, Copy, Check, RotateCcw, X, ExternalLink, Download, FileCode } from 'lucide-react';
import { toast } from 'sonner';
import { parseApiResponse, DEFAULT_GAS_URL, BACKUP_LEGACY_GAS_URL } from '../api';
import { KODE_GS_CODE } from '../kodeGsSource';

interface GasUrlModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUrl: string;
  onSave: (newUrl: string) => void;
  onReset: () => void;
}

export default function GasUrlModal({
  isOpen,
  onClose,
  currentUrl,
  onSave,
  onReset
}: GasUrlModalProps) {
  const [urlInput, setUrlInput] = useState(currentUrl);
  const [testing, setTesting] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [showScriptDetails, setShowScriptDetails] = useState(false);

  if (!isOpen) return null;

  const handleTest = async () => {
    const trimmed = urlInput.trim();
    if (!trimmed) {
      toast.error("Masukkan URL Web App terlebih dahulu");
      return;
    }
    setTesting(true);
    const toastId = toast.loading("Menguji koneksi ke Google Apps Script...");
    try {
      const res = await fetch(`${trimmed}?action=getPegawai`, { cache: 'no-store' });
      const data = await parseApiResponse(res, 'testConnection');
      if (data && data.status === 'success') {
        toast.success(`Koneksi berhasil! Terhubung dengan ${data.data?.length || 0} pegawai terdaftar.`, { id: toastId });
      } else {
        toast.warning(`Terkoneksi namun server mengembalikan: ${data?.message || 'Unknown status'}`, { id: toastId });
      }
    } catch (err: any) {
      toast.error(`Koneksi gagal: ${err.message}`, { id: toastId });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = () => {
    const trimmed = urlInput.trim();
    if (!trimmed) {
      toast.error("URL tidak boleh kosong.");
      return;
    }
    if (!trimmed.startsWith("https://script.google.com/macros/s/")) {
      toast.warning("URL harus berawalan: https://script.google.com/macros/s/...");
    }
    onSave(trimmed);
  };

  const handleCopyKodeGs = () => {
    try {
      navigator.clipboard.writeText(KODE_GS_CODE);
      setCopiedCode(true);
      toast.success("✅ Seluruh kode Kode.gs berhasil disalin! Silakan tempel di script.google.com");
      setTimeout(() => setCopiedCode(false), 3000);
    } catch (e) {
      toast.error("Gagal menyalin kode secara otomatis.");
    }
  };

  const handleDownloadKodeGs = () => {
    const blob = new Blob([KODE_GS_CODE], { type: "text/javascript" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "Kode.gs";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("File Kode.gs berhasil diunduh!");
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden border border-neutral-200 my-auto">
        <div className="px-6 py-4 border-b border-neutral-100 flex items-center justify-between bg-neutral-50/50">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-red-100 text-[#cc0000] rounded-lg">
              <Globe className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-neutral-800 text-base">Konfigurasi Google Apps Script</h3>
              <p className="text-xs text-neutral-500">Koneksi data absensi dan backend Google Spreadsheet</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-neutral-400 hover:text-neutral-600 rounded-lg hover:bg-neutral-100 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 flex flex-col gap-4 max-h-[75vh] overflow-y-auto">
          {/* Card Panduan Deploy & Solusi Bug */}
          <div className="text-xs text-neutral-700 leading-relaxed bg-amber-50 border border-amber-200 p-3.5 rounded-xl space-y-2">
            <div className="flex items-center gap-1.5 font-bold text-amber-900">
              <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0" />
              <span>Panduan Mengatasi Bug & Deploy Ulang:</span>
            </div>
            <ul className="list-disc list-inside space-y-1 text-amber-950/85">
              <li>
                <b>Bug jamDatang.split is not a function</b> terjadi jika skrip backend lama mem-parse waktu spreadsheet sebagai objek Date. Frontend sekarang sudah otomatis mengirim jam datang yang aman, dan skrip terbaru di bawah sudah kebal terhadap tipe data apa pun.
              </li>
              <li>
                <b>Penting saat deploy:</b> Di script.google.com, klik <b>Deploy</b> &rarr; <b>New deployment</b> (wajib versi baru, bukan sekadar Save).
              </li>
              <li>
                Pilih type <b>Web app</b>, <i>Execute as: <b>Me</b></i>, dan <i>Who has access: <b>Anyone</b></i>.
              </li>
              <li>
                Gunakan URL berakhiran <b>/exec</b> (jangan gunakan URL /dev).
              </li>
            </ul>
          </div>

          {/* Tombol Salin / Unduh Script Kode.gs */}
          <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-3.5 flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileCode className="w-4 h-4 text-[#cc0000]" />
                <span className="text-xs font-bold text-neutral-800">Kode Backend Terbaru (Kode.gs)</span>
              </div>
              <span className="text-[10px] bg-emerald-100 text-emerald-800 font-semibold px-2 py-0.5 rounded-full">Bebas Bug</span>
            </div>
            <p className="text-[11px] text-neutral-500 leading-relaxed">
              Jika Anda baru saja mengedit skrip Google Spreadsheet, salin kode terbaru ini ke Google Apps Script Anda untuk menjamin bebas error.
            </p>
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={handleCopyKodeGs}
                className="flex-1 px-3 py-2 bg-neutral-800 hover:bg-neutral-900 text-white text-xs font-bold rounded-lg transition flex items-center justify-center gap-1.5"
              >
                {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedCode ? "Tersalin ke Clipboard!" : "Salin Kode.gs Lengkap"}
              </button>
              <button
                type="button"
                onClick={handleDownloadKodeGs}
                className="px-3 py-2 bg-white hover:bg-neutral-100 border border-neutral-300 text-neutral-700 text-xs font-bold rounded-lg transition flex items-center justify-center gap-1.5"
                title="Download file Kode.gs"
              >
                <Download className="w-3.5 h-3.5" />
                Unduh .gs
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-neutral-700 uppercase tracking-wider mb-1.5">
              URL Web App Deployment (/exec)
            </label>
            <div className="flex flex-col gap-2">
              <textarea
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="https://script.google.com/macros/s/.../exec"
                rows={2}
                className="w-full text-xs font-mono p-3 border border-neutral-300 rounded-xl focus:ring-2 focus:ring-[#cc0000] focus:border-red-500 outline-none transition"
              />
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={handleTest}
                  disabled={testing}
                  className="px-3 py-1.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 text-xs font-bold rounded-lg transition flex items-center gap-1.5"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${testing ? 'animate-spin' : ''}`} />
                  {testing ? 'Menguji...' : 'Tes Koneksi'}
                </button>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setUrlInput(DEFAULT_GAS_URL)}
                    className="px-2.5 py-1 text-[11px] text-neutral-500 hover:text-neutral-800 underline"
                  >
                    Pakai URL V2
                  </button>
                  <button
                    type="button"
                    onClick={() => setUrlInput(BACKUP_LEGACY_GAS_URL)}
                    className="px-2.5 py-1 text-[11px] text-neutral-500 hover:text-neutral-800 underline"
                  >
                    Pakai URL V1
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="px-6 py-4 bg-neutral-50 border-t border-neutral-100 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onReset}
            className="px-3 py-2 text-neutral-600 hover:text-red-700 text-xs font-semibold flex items-center gap-1.5 transition"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset Default
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-neutral-200 hover:bg-neutral-300 text-neutral-700 text-xs font-bold rounded-xl transition"
            >
              Tutup
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="px-5 py-2 bg-[#cc0000] hover:bg-red-700 text-white text-xs font-bold rounded-xl shadow-sm transition flex items-center gap-1.5"
            >
              <Check className="w-4 h-4" />
              Simpan & Hubungkan
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
