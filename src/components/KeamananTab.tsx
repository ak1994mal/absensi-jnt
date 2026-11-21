import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Check,
  Download,
  Eye,
  EyeOff,
  History,
  KeyRound,
  LogOut,
  RefreshCw,
  Shield,
  Trash2,
  X
} from 'lucide-react';
import { toast } from 'sonner';
import {
  changeOwnerPasswordApi,
  fetchAuditLogsApi,
  fetchOwnerSessionsApi,
  revokeOwnerSessionApi
} from '../api';
import { AuditLogItem, OwnerSessionItem } from '../types/attendance';

interface KeamananTabProps {
  onRequireAuth: () => void;
  onPasswordChanged: () => void;
}

function formatIsoWib(isoStr?: string): string {
  if (!isoStr || isoStr === '-') return '-';
  const m = String(isoStr).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}:\d{2}:\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1]} ${m[4]}`;
  return isoStr;
}

function escapeCsvCell(val: any): string {
  const s = String(val === null || val === undefined ? '' : val);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export default function KeamananTab({ onRequireAuth, onPasswordChanged }: KeamananTabProps) {
  // Section 1: Change Owner Password
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);

  // Section 2: Active Sessions
  const [sessions, setSessions] = useState<OwnerSessionItem[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  // Section 3: Audit Logs
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(true);
  const [filterAction, setFilterAction] = useState('');
  const [filterActor, setFilterActor] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');

  const passwordRules = useMemo(() => {
    return {
      minLength: newPassword.length >= 8,
      hasLetter: /[a-zA-Z]/.test(newPassword),
      hasNumber: /[0-9]/.test(newPassword),
      matchesConfirm: newPassword.length > 0 && newPassword === confirmPassword
    };
  }, [newPassword, confirmPassword]);

  const isPasswordFormValid =
    currentPassword.length > 0 &&
    passwordRules.minLength &&
    passwordRules.hasLetter &&
    passwordRules.hasNumber &&
    passwordRules.matchesConfirm;

  const loadSessions = async () => {
    setLoadingSessions(true);
    try {
      const res = await fetchOwnerSessionsApi();
      if (res?.authRequired) {
        onRequireAuth();
        return;
      }
      if (res?.status === 'success') {
        setSessions(Array.isArray(res.data) ? res.data : []);
      } else {
        toast.error(res?.message || 'Gagal memuat sesi aktif.');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Gagal memuat sesi aktif.');
    } finally {
      setLoadingSessions(false);
    }
  };

  const loadAuditLogs = async () => {
    setLoadingLogs(true);
    try {
      const res = await fetchAuditLogsApi({
        action: filterAction.trim(),
        actor: filterActor.trim(),
        dateFrom: filterDateFrom,
        dateTo: filterDateTo,
        limit: 50
      });
      if (res?.authRequired) {
        onRequireAuth();
        return;
      }
      if (res?.status === 'success') {
        setLogs(Array.isArray(res.data) ? res.data : []);
      } else {
        toast.error(res?.message || 'Gagal memuat audit log.');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Gagal memuat audit log.');
    } finally {
      setLoadingLogs(false);
    }
  };

  useEffect(() => {
    loadSessions();
    loadAuditLogs();
  }, []);

  const handleRequestPasswordChange = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isPasswordFormValid) {
      toast.error('Lengkapi semua persyaratan password baru terlebih dahulu.');
      return;
    }
    setConfirmDialogOpen(true);
  };

  const handleConfirmPasswordChange = async () => {
    setChangingPassword(true);
    try {
      const res = await changeOwnerPasswordApi(currentPassword, newPassword);
      if (res?.authRequired) {
        setConfirmDialogOpen(false);
        onRequireAuth();
        return;
      }
      if (res?.status === 'success') {
        setConfirmDialogOpen(false);
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        toast.success(res.message || 'Password berhasil diubah. Silakan login kembali.');
        onPasswordChanged();
      } else {
        toast.error(res?.message || 'Gagal mengganti password Owner.');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Gagal menghubungi server.');
    } finally {
      setChangingPassword(false);
    }
  };

  const handleRevokeSession = async (sessionId: string) => {
    setRevokingId(sessionId);
    try {
      const res = await revokeOwnerSessionApi({ sessionId });
      if (res?.authRequired) {
        onRequireAuth();
        return;
      }
      if (res?.status === 'success') {
        toast.success(res.message || 'Sesi berhasil dicabut.');
        await loadSessions();
        await loadAuditLogs();
      } else {
        toast.error(res?.message || 'Gagal mencabut sesi.');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Gagal menghubungi server.');
    } finally {
      setRevokingId(null);
    }
  };

  const handleRevokeAllOthers = async () => {
    setRevokingId('ALL_OTHERS');
    try {
      const res = await revokeOwnerSessionApi({ revokeAllOthers: true });
      if (res?.authRequired) {
        onRequireAuth();
        return;
      }
      if (res?.status === 'success') {
        toast.success(res.message || 'Semua sesi lainnya telah dicabut.');
        await loadSessions();
        await loadAuditLogs();
      } else {
        toast.error(res?.message || 'Gagal mencabut sesi lainnya.');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Gagal menghubungi server.');
    } finally {
      setRevokingId(null);
    }
  };

  const handleExportCsv = () => {
    if (logs.length === 0) {
      toast.error('Tidak ada data log untuk diekspor.');
      return;
    }
    const headers = ['Timestamp (WIB)', 'Action', 'Actor', 'Device / IP', 'UserAgent', 'Status', 'Details'];
    const lines = [
      headers.map(escapeCsvCell).join(','),
      ...logs.map((row) =>
        [
          row.timestamp,
          row.action,
          row.actor,
          row.ipAddress,
          row.userAgent,
          row.status,
          row.details
        ]
          .map(escapeCsvCell)
          .join(',')
      )
    ];
    const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `audit-log-jnt-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success('Audit log berhasil diunduh (CSV).');
  };

  const otherActiveSessionsCount = sessions.filter((s) => !s.isCurrent).length;

  return (
    <div className="space-y-6 text-neutral-800">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 pb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-red-50 border border-red-100 flex items-center justify-center text-[#cc0000]">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-bold text-neutral-900 text-base">Keamanan &amp; Audit Akses</h2>
            <p className="text-xs text-neutral-500">Kelola kredensial Owner, sesi login aktif, dan log keamanan server</p>
          </div>
        </div>
      </div>

      {/* Section 1: Ganti Password Owner */}
      <section className="bg-white border border-neutral-200 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <KeyRound className="w-4 h-4 text-[#cc0000]" />
          <h3 className="font-bold text-sm text-neutral-900">Ganti Password Owner</h3>
        </div>

        <form onSubmit={handleRequestPasswordChange} className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="space-y-3.5 text-xs">
            <div>
              <label className="block font-semibold text-neutral-700 mb-1">Password Saat Ini</label>
              <div className="relative">
                <input
                  type={showCurrent ? 'text' : 'password'}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Masukkan password saat ini"
                  className="w-full min-h-[40px] pl-3 pr-10 py-2 bg-neutral-50 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-[#cc0000] focus:bg-white outline-none"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowCurrent((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-neutral-500 hover:text-neutral-800 cursor-pointer"
                >
                  {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block font-semibold text-neutral-700 mb-1">Password Baru</label>
              <div className="relative">
                <input
                  type={showNew ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Minimal 8 karakter (huruf + angka)"
                  className="w-full min-h-[40px] pl-3 pr-10 py-2 bg-neutral-50 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-[#cc0000] focus:bg-white outline-none"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowNew((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-neutral-500 hover:text-neutral-800 cursor-pointer"
                >
                  {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block font-semibold text-neutral-700 mb-1">Konfirmasi Password Baru</label>
              <input
                type={showNew ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Ketik ulang password baru"
                className="w-full min-h-[40px] px-3 py-2 bg-neutral-50 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-[#cc0000] focus:bg-white outline-none"
                required
              />
            </div>

            <div className="pt-1">
              <button
                type="submit"
                disabled={!isPasswordFormValid || changingPassword}
                className="min-h-[42px] px-4 py-2 bg-[#cc0000] hover:bg-[#a30000] text-white font-bold rounded-lg transition disabled:opacity-50 cursor-pointer inline-flex items-center gap-2"
              >
                <KeyRound className="w-3.5 h-3.5" />
                <span>Simpan Password Baru</span>
              </button>
            </div>
          </div>

          <div className="bg-neutral-50 border border-neutral-200 rounded-lg p-4 text-xs flex flex-col justify-between">
            <div>
              <p className="font-bold text-neutral-800 mb-2.5">Standar Keamanan Password</p>
              <ul className="space-y-2">
                {[
                  { ok: passwordRules.minLength, label: 'Minimal 8 karakter' },
                  { ok: passwordRules.hasLetter, label: 'Mengandung minimal 1 huruf (A–Z)' },
                  { ok: passwordRules.hasNumber, label: 'Mengandung minimal 1 angka (0–9)' },
                  { ok: passwordRules.matchesConfirm, label: 'Konfirmasi password cocok' }
                ].map((rule, idx) => (
                  <li key={idx} className={`flex items-center gap-2 ${rule.ok ? 'text-emerald-700 font-semibold' : 'text-neutral-500'}`}>
                    <span className={`w-4 h-4 rounded flex items-center justify-center text-[10px] ${rule.ok ? 'bg-emerald-100 text-emerald-700' : 'bg-neutral-200 text-neutral-500'}`}>
                      {rule.ok ? <Check className="w-3 h-3" /> : '•'}
                    </span>
                    <span>{rule.label}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="mt-4 pt-3 border-t border-neutral-200 text-[11px] text-neutral-600 leading-relaxed flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <span>
                Tidak boleh memakai ulang 5 password terakhir. Mengubah password akan otomatis mencabut seluruh sesi login Owner yang sedang aktif.
              </span>
            </div>
          </div>
        </form>
      </section>

      {/* Section 2: Sesi Aktif Owner */}
      <section className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 bg-neutral-50 border-b border-neutral-200 flex flex-wrap items-center justify-between gap-2.5">
          <div>
            <h3 className="font-bold text-sm text-neutral-900">Sesi Aktif Owner</h3>
            <p className="text-[11px] text-neutral-500">Daftar perangkat yang saat ini memiliki token Owner aktif</p>
          </div>
          <div className="flex items-center gap-2">
            {otherActiveSessionsCount > 0 && (
              <button
                type="button"
                onClick={handleRevokeAllOthers}
                disabled={revokingId !== null}
                className="px-3 py-1.5 bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 font-bold text-xs rounded-lg transition cursor-pointer inline-flex items-center gap-1.5 disabled:opacity-50"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Logout Semua Sesi Lain ({otherActiveSessionsCount})</span>
              </button>
            )}
            <button
              type="button"
              onClick={loadSessions}
              disabled={loadingSessions}
              className="px-3 py-1.5 bg-white hover:bg-neutral-100 border border-neutral-300 text-neutral-700 font-semibold text-xs rounded-lg transition cursor-pointer inline-flex items-center gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingSessions ? 'animate-spin' : ''}`} />
              <span>Muat Ulang</span>
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          {loadingSessions ? (
            <div className="p-6 text-center text-xs text-neutral-500">Memuat daftar sesi aktif...</div>
          ) : sessions.length === 0 ? (
            <div className="p-6 text-center text-xs text-neutral-500">Tidak ada sesi Owner aktif yang tercatat.</div>
          ) : (
            <table className="w-full text-xs text-left">
              <thead className="bg-neutral-50 text-neutral-500 uppercase text-[11px] border-b border-neutral-200">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">Token</th>
                  <th className="px-4 py-2.5 font-semibold">Dibuat</th>
                  <th className="px-4 py-2.5 font-semibold">Terakhir Digunakan</th>
                  <th className="px-4 py-2.5 font-semibold">Device / Client</th>
                  <th className="px-4 py-2.5 font-semibold text-right">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => (
                  <tr key={s.sessionId} className="border-b border-neutral-100 last:border-0 hover:bg-neutral-50">
                    <td className="px-4 py-3 font-mono font-semibold text-neutral-800 whitespace-nowrap">
                      <span>{s.tokenMask}</span>
                      {s.isCurrent && (
                        <span className="ml-2 text-[10px] font-sans font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">
                          Sesi Ini
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono tabular-nums text-neutral-600 whitespace-nowrap">{formatIsoWib(s.issuedAt)}</td>
                    <td className="px-4 py-3 font-mono tabular-nums text-neutral-600 whitespace-nowrap">{formatIsoWib(s.lastUsedAt)}</td>
                    <td className="px-4 py-3 text-neutral-600 max-w-[240px]">
                      <div className="font-mono text-[11px] text-neutral-800 truncate">{s.deviceId}</div>
                      <div className="text-[10px] text-neutral-400 truncate" title={s.userAgent}>{s.userAgent}</div>
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {!s.isCurrent ? (
                        <button
                          type="button"
                          onClick={() => handleRevokeSession(s.sessionId)}
                          disabled={revokingId !== null}
                          className="px-2.5 py-1.5 bg-white hover:bg-red-50 border border-red-200 text-red-700 font-bold rounded-md text-[11px] transition cursor-pointer inline-flex items-center gap-1 disabled:opacity-50"
                        >
                          <Trash2 className="w-3 h-3" />
                          <span>{revokingId === s.sessionId ? 'Mencabut...' : 'Revoke'}</span>
                        </button>
                      ) : (
                        <span className="text-[11px] text-neutral-400">Aktif</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {/* Section 3: Audit Log */}
      <section className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 bg-neutral-50 border-b border-neutral-200 flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-[#cc0000]" />
            <div>
              <h3 className="font-bold text-sm text-neutral-900">Audit Log Keamanan (50 Terbaru)</h3>
              <p className="text-[11px] text-neutral-500">Riwayat aktivitas login, PIN, perubahan password, dan akses endpoint</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleExportCsv}
              disabled={logs.length === 0}
              className="px-3 py-1.5 bg-white hover:bg-neutral-100 border border-neutral-300 text-neutral-800 font-semibold text-xs rounded-lg transition cursor-pointer inline-flex items-center gap-1.5 disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV</span>
            </button>
            <button
              type="button"
              onClick={loadAuditLogs}
              disabled={loadingLogs}
              className="px-3 py-1.5 bg-[#cc0000] hover:bg-[#a30000] text-white font-bold text-xs rounded-lg transition cursor-pointer inline-flex items-center gap-1.5 disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingLogs ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="p-3 bg-neutral-50/70 border-b border-neutral-200 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2 text-xs">
          <input
            type="text"
            value={filterAction}
            onChange={(e) => setFilterAction(e.target.value)}
            placeholder="Filter action (mis. employeeLogin)"
            className="px-2.5 py-1.5 bg-white border border-neutral-300 rounded-md outline-none focus:ring-2 focus:ring-[#cc0000]"
          />
          <input
            type="text"
            value={filterActor}
            onChange={(e) => setFilterActor(e.target.value)}
            placeholder="Filter actor (mis. Owner / nama)"
            className="px-2.5 py-1.5 bg-white border border-neutral-300 rounded-md outline-none focus:ring-2 focus:ring-[#cc0000]"
          />
          <input
            type="date"
            value={filterDateFrom}
            onChange={(e) => setFilterDateFrom(e.target.value)}
            aria-label="Tanggal mulai audit log"
            className="px-2.5 py-1.5 bg-white border border-neutral-300 rounded-md font-mono outline-none focus:ring-2 focus:ring-[#cc0000]"
          />
          <input
            type="date"
            value={filterDateTo}
            onChange={(e) => setFilterDateTo(e.target.value)}
            aria-label="Tanggal akhir audit log"
            className="px-2.5 py-1.5 bg-white border border-neutral-300 rounded-md font-mono outline-none focus:ring-2 focus:ring-[#cc0000]"
          />
          <button
            type="button"
            onClick={loadAuditLogs}
            className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-900 text-white font-bold rounded-md cursor-pointer transition"
          >
            Terapkan Filter
          </button>
        </div>

        <div className="overflow-x-auto max-h-[440px]">
          {loadingLogs ? (
            <div className="p-8 text-center text-xs text-neutral-500">Memuat audit log keamanan...</div>
          ) : logs.length === 0 ? (
            <div className="p-8 text-center text-xs text-neutral-500">Belum ada catatan audit log sesuai filter.</div>
          ) : (
            <table className="w-full text-xs text-left">
              <thead className="bg-neutral-50 text-neutral-500 uppercase text-[11px] border-b border-neutral-200 sticky top-0">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">Timestamp (WIB)</th>
                  <th className="px-4 py-2.5 font-semibold">Action</th>
                  <th className="px-4 py-2.5 font-semibold">Actor</th>
                  <th className="px-4 py-2.5 font-semibold">Device / IP</th>
                  <th className="px-4 py-2.5 font-semibold">Status</th>
                  <th className="px-4 py-2.5 font-semibold">Details</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((row, idx) => (
                  <tr key={idx} className="border-b border-neutral-100 last:border-0 hover:bg-neutral-50">
                    <td className="px-4 py-2.5 font-mono tabular-nums text-neutral-600 whitespace-nowrap">
                      {formatIsoWib(row.timestamp)}
                    </td>
                    <td className="px-4 py-2.5 font-mono font-semibold text-neutral-800 whitespace-nowrap">
                      {row.action}
                    </td>
                    <td className="px-4 py-2.5 font-medium text-neutral-800 whitespace-nowrap">
                      {row.actor}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-[11px] text-neutral-500 max-w-[140px] truncate" title={`${row.ipAddress} | ${row.userAgent}`}>
                      {row.ipAddress}
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <span
                        className={`px-1.5 py-0.5 rounded font-bold text-[10px] ${
                          row.status === 'SUCCESS'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-red-50 text-red-700 border border-red-200'
                        }`}
                      >
                        {row.status}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-[11px] text-neutral-600 max-w-[260px] truncate" title={row.details}>
                      {row.details}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {/* Modal Konfirmasi Ganti Password */}
      {confirmDialogOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => !changingPassword && setConfirmDialogOpen(false)}
        >
          <div
            className="bg-white rounded-xl shadow-xl border border-neutral-200 w-full max-w-md p-5 space-y-4 text-xs"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2 text-amber-700">
                <AlertTriangle className="w-5 h-5 shrink-0" />
                <h3 className="font-bold text-sm text-neutral-900">Konfirmasi Ubah Password Owner</h3>
              </div>
              <button
                type="button"
                onClick={() => !changingPassword && setConfirmDialogOpen(false)}
                className="p-1 text-neutral-400 hover:text-neutral-700 rounded cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-neutral-600 leading-relaxed">
              Setelah password diubah, <strong>semua sesi login Owner di seluruh perangkat akan otomatis berakhir</strong> dan Anda harus login kembali menggunakan password baru.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={changingPassword}
                onClick={() => setConfirmDialogOpen(false)}
                className="px-3.5 py-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-semibold rounded-lg cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={changingPassword}
                onClick={handleConfirmPasswordChange}
                className="px-4 py-2 bg-[#cc0000] hover:bg-[#a30000] text-white font-bold rounded-lg cursor-pointer disabled:opacity-50"
              >
                {changingPassword ? 'Menyimpan...' : 'Ya, Ubah Password'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
