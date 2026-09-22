import React, { useState } from 'react';
import { Globe, RefreshCw, CheckCircle2, AlertCircle, Copy, Check, RotateCcw, X, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { parseApiResponse, DEFAULT_GAS_URL, BACKUP_LEGACY_GAS_URL } from '../api';

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
        toast.success(`Koneksi berhasil! Terhubung dengan ${data.data?.length || 0} pegawai.`, { id: toastId });
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
    const info = `File backend Kode.gs ada di project ini. Anda dapat menyalin isinya dan menempelkannya di editor Google Apps Script (script.google.com). Setelah itu klik: Deploy > New deployment > Web app > Execute as: Me > Who has access: Anyone.`;
    navigator.clipboard.writeText(info);
    setCopiedCode(true);
    toast.success("Petunjuk deploy disalin ke clipboard!");
    setTimeout(() => setCopiedCode(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden border border-neutral-200">
        <div className="px-6 py-4 border-b border-neutral-100 flex items-center justify-between bg-neutral-50/50">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-red-100 text-[#cc0000] rounded-lg">
              <Globe className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-neutral-800 text-base">Konfigurasi Google Apps Script</h3>
              <p className="text-xs text-neutral-500">Koneksi data absensi dan Google Spreadsheet</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-neutral-400 hover:text-neutral-600 rounded-lg hover:bg-neutral-100 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 flex flex-col gap-4">
          <div className="text-xs text-neutral-600 leading-relaxed bg-blue-50 border border-blue-100 p-3 rounded-xl">
            <span className="font-bold text-blue-900 block mb-1">Cara Mendapatkan URL Web App:</span>
            1. Buka script Google Apps Script Anda di <span className="font-mono font-semibold">script.google.com</span>.<br/>
            2. Klik <b>Deploy</b> &rarr; <b>Manage deployments</b> (atau <b>New deployment</b>).<br/>
            3. Pastikan jenisnya <b>Web app</b>, <i>Execute as: Me</i>, dan <i>Who has access: <b>Anyone</b></i>.<br/>
            4. Salin URL Web App yang berakhiran <span className="font-mono font-semibold">/exec</span> dan tempel di bawah.
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
                rows={3}
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
              Batal
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
