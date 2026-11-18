import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Calendar,
  FileEdit,
  History,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X
} from 'lucide-react';
import { toast } from 'sonner';
import {
  addManualAbsensi,
  deleteAbsensi,
  getAbsensiByDate,
  updateAbsensi
} from '../api';
import { AbsensiAuditRow, PegawaiSafe } from '../types/attendance';

interface PositionOption {
  name: string;
  jamMasuk: string;
  jamPulang: string;
}

interface OutletOption {
  nama: string;
}

interface KoreksiAbsensiTabProps {
  outlets: OutletOption[];
  positions: PositionOption[];
  todayYmd: string;
  onRequireAuth: () => void;
  onDataChanged?: () => void;
}

function toMinutes(hhmm: string): number | null {
  const m = String(hhmm || '').trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

function computePreviewCalc(
  jamDatang: string,
  jamPulang: string,
  posisi: string,
  positions: PositionOption[],
  toleransiTelat: number,
  statusSelect: string,
  oldStatusMasuk: string
) {
  const posCfg = positions.find(
    (p) => p.name.trim().toLowerCase() === String(posisi || '').trim().toLowerCase()
  );
  const targetIn = posCfg?.jamMasuk || '08:00';
  const targetOut = posCfg?.jamPulang || '20:00';
  const inMin = toMinutes(jamDatang);
  const outMin = toMinutes(jamPulang);
  const targetInMin = toMinutes(targetIn) ?? 480;
  const targetOutMin = toMinutes(targetOut) ?? 1200;

  let calcMasuk = oldStatusMasuk || 'TEPAT WAKTU';
  if (inMin !== null) {
    calcMasuk = inMin <= targetInMin + toleransiTelat ? 'TEPAT WAKTU' : 'TELAT';
  }
  const finalStatusMasuk =
    statusSelect && statusSelect !== 'AUTO' ? statusSelect : calcMasuk;

  let totalJam = '-';
  let statusPulangLabel = 'BELUM PULANG';
  let invalidOrder = false;

  if (outMin !== null) {
    if (inMin === null) {
      invalidOrder = true;
    } else if (outMin < inMin) {
      invalidOrder = true;
    } else {
      const diff = outMin - inMin;
      const h = Math.floor(diff / 60);
      const m = diff % 60;
      totalJam = `${h}j ${m}m`;
      if (h >= 13) statusPulangLabel = 'LEMBUR';
      else if (outMin < targetOutMin) statusPulangLabel = 'PULANG CEPAT';
      else statusPulangLabel = 'PULANG NORMAL';
    }
  }

  return {
    totalJam,
    statusMasuk: finalStatusMasuk,
    statusPulangLabel,
    invalidOrder
  };
}

function parseSnapshotDisplay(raw: string): Record<string, any> | null {
  if (!raw || raw === 'MANUAL_ENTRY') return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export default function KoreksiAbsensiTab({
  outlets: propOutlets,
  positions: propPositions,
  todayYmd,
  onRequireAuth,
  onDataChanged
}: KoreksiAbsensiTabProps) {
  const [selectedDate, setSelectedDate] = useState(todayYmd);
  const [outletFilter, setOutletFilter] = useState('ALL');
  const [searchName, setSearchName] = useState('');
  const [showCancelled, setShowCancelled] = useState(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [rows, setRows] = useState<AbsensiAuditRow[]>([]);
  const [employees, setEmployees] = useState<PegawaiSafe[]>([]);
  const [apiOutlets, setApiOutlets] = useState<OutletOption[]>([]);
  const [apiPositions, setApiPositions] = useState<PositionOption[]>([]);
  const [toleransiTelat, setToleransiTelat] = useState<number>(60);

  // Modal Edit
  const [editTarget, setEditTarget] = useState<AbsensiAuditRow | null>(null);
  const [editJamDatang, setEditJamDatang] = useState('');
  const [editJamPulang, setEditJamPulang] = useState('');
  const [editStatus, setEditStatus] = useState('AUTO');
  const [editKetDatang, setEditKetDatang] = useState('');
  const [editKetPulang, setEditKetPulang] = useState('');
  const [editAlasan, setEditAlasan] = useState('');

  // Modal Tambah Manual
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [manualTanggal, setManualTanggal] = useState(todayYmd);
  const [manualNama, setManualNama] = useState('');
  const [manualOutlet, setManualOutlet] = useState('');
  const [manualPosisi, setManualPosisi] = useState('');
  const [manualJamDatang, setManualJamDatang] = useState('08:00');
  const [manualJamPulang, setManualJamPulang] = useState('');
  const [manualStatus, setManualStatus] = useState('AUTO');
  const [manualKetDatang, setManualKetDatang] = useState('');
  const [manualKetPulang, setManualKetPulang] = useState('');
  const [manualAlasan, setManualAlasan] = useState('');
  const [manualDateRows, setManualDateRows] = useState<AbsensiAuditRow[] | null>(null);

  // Modal Delete Confirmation
  const [deleteTarget, setDeleteTarget] = useState<AbsensiAuditRow | null>(null);
  const [deleteAlasan, setDeleteAlasan] = useState('');

  // Modal Audit Trail
  const [auditTarget, setAuditTarget] = useState<AbsensiAuditRow | null>(null);

  const [submitting, setSubmitting] = useState(false);

  const effectiveOutlets = apiOutlets.length > 0 ? apiOutlets : propOutlets;
  const effectivePositions = apiPositions.length > 0 ? apiPositions : propPositions;

  const loadData = async (dateVal = selectedDate) => {
    setLoading(true);
    setError('');
    try {
      const res = await getAbsensiByDate({ tanggal: dateVal });
      if (res?.authRequired) {
        onRequireAuth();
        setError(res.message || 'Sesi Owner berakhir. Silakan login ulang.');
        return;
      }
      if (res?.status !== 'success') {
        throw new Error(res?.message || 'Gagal memuat data absensi.');
      }
      setRows(Array.isArray(res.data) ? res.data : []);
      if (Array.isArray(res.employees)) setEmployees(res.employees);
      if (Array.isArray(res.outlets) && res.outlets.length > 0) setApiOutlets(res.outlets);
      if (Array.isArray(res.positions) && res.positions.length > 0) setApiPositions(res.positions);
      if (typeof res.toleransiTelat === 'number') setToleransiTelat(res.toleransiTelat);
    } catch (err: any) {
      setError(err?.message || 'Gagal memuat daftar koreksi absensi.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData(selectedDate);
  }, [selectedDate]);

  useEffect(() => {
    if (!addModalOpen) return;
    if (manualTanggal === selectedDate) {
      setManualDateRows(rows);
      return;
    }
    let cancelled = false;
    getAbsensiByDate({ tanggal: manualTanggal })
      .then((res) => {
        if (!cancelled && res?.status === 'success' && Array.isArray(res.data)) {
          setManualDateRows(res.data);
        }
      })
      .catch(() => {
        if (!cancelled) setManualDateRows(null);
      });
    return () => {
      cancelled = true;
    };
  }, [addModalOpen, manualTanggal, selectedDate, rows]);

  const filteredRows = useMemo(() => {
    const q = searchName.trim().toLowerCase();
    return rows.filter((r) => {
      if (!showCancelled && r.isCancelled) return false;
      if (outletFilter !== 'ALL' && r.outlet !== outletFilter) return false;
      if (q && !r.nama.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, outletFilter, searchName, showCancelled]);

  const openEditModal = (row: AbsensiAuditRow) => {
    setEditTarget(row);
    setEditJamDatang(row.jamDatang && row.jamDatang !== '-' ? row.jamDatang : '');
    setEditJamPulang(row.jamPulang && row.jamPulang !== '-' ? row.jamPulang : '');
    setEditStatus('AUTO');
    setEditKetDatang(row.keteranganDatang && row.keteranganDatang !== '-' ? row.keteranganDatang : '');
    setEditKetPulang(row.keteranganPulang && row.keteranganPulang !== '-' ? row.keteranganPulang : '');
    setEditAlasan('');
  };

  const editPreview = useMemo(() => {
    if (!editTarget) return null;
    return computePreviewCalc(
      editJamDatang,
      editJamPulang,
      editTarget.posisi,
      effectivePositions,
      toleransiTelat,
      editStatus,
      editTarget.statusMasuk
    );
  }, [editTarget, editJamDatang, editJamPulang, editStatus, effectivePositions, toleransiTelat]);

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTarget) return;
    if (!editAlasan.trim()) {
      return toast.error('Alasan koreksi wajib diisi.');
    }
    if (editJamPulang && !editJamDatang) {
      return toast.error('Jam Pulang tidak dapat diisi jika Jam Datang kosong.');
    }
    if (editPreview?.invalidOrder) {
      return toast.error('Jam Pulang tidak boleh lebih awal dari Jam Datang.');
    }

    setSubmitting(true);
    try {
      const res = await updateAbsensi({
        rowIndex: editTarget.rowIndex,
        jamDatang: editJamDatang || '-',
        jamPulang: editJamPulang || '-',
        status: editStatus,
        keteranganDatang: editKetDatang.trim() || '-',
        keteranganPulang: editKetPulang.trim() || '-',
        alasanKoreksi: editAlasan.trim()
      });
      if (res?.authRequired) {
        onRequireAuth();
        toast.error(res.message);
        return;
      }
      if (res?.status !== 'success') {
        throw new Error(res?.message || 'Gagal menyimpan koreksi absensi.');
      }
      toast.success(res.message || 'Koreksi absensi berhasil disimpan.');
      setEditTarget(null);
      await loadData(selectedDate);
      onDataChanged?.();
    } catch (err: any) {
      toast.error(err?.message || 'Gagal menyimpan koreksi absensi.');
    } finally {
      setSubmitting(false);
    }
  };

  const openAddManualModal = () => {
    setManualTanggal(selectedDate);
    setManualNama(employees[0]?.nama || '');
    setManualOutlet(effectiveOutlets[0]?.nama || '');
    setManualPosisi(effectivePositions[0]?.name || 'Admin');
    setManualJamDatang('08:00');
    setManualJamPulang('');
    setManualStatus('AUTO');
    setManualKetDatang('');
    setManualKetPulang('');
    setManualAlasan('');
    setAddModalOpen(true);
  };

  const duplicateWarning = useMemo(() => {
    if (!manualNama || !manualDateRows) return null;
    const match = manualDateRows.find(
      (r) =>
        !r.isCancelled &&
        r.statusMasuk !== 'IZIN' &&
        r.jamDatang !== '-' &&
        r.nama.trim().toLowerCase() === manualNama.trim().toLowerCase()
    );
    return match || null;
  }, [manualNama, manualDateRows]);

  const handleSaveManual = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualTanggal) return toast.error('Tanggal wajib dipilih.');
    if (manualTanggal > todayYmd) return toast.error('Tanggal absensi manual tidak boleh di masa depan.');
    if (!manualNama) return toast.error('Pilih nama pegawai.');
    if (!manualOutlet) return toast.error('Pilih outlet.');
    if (!manualPosisi) return toast.error('Pilih posisi.');
    if (!manualJamDatang) return toast.error('Jam Datang wajib diisi.');
    if (manualJamPulang) {
      const inMin = toMinutes(manualJamDatang);
      const outMin = toMinutes(manualJamPulang);
      if (inMin !== null && outMin !== null && outMin < inMin) {
        return toast.error('Jam Pulang tidak boleh lebih awal dari Jam Datang.');
      }
    }
    if (!manualAlasan.trim()) return toast.error('Alasan input manual wajib diisi.');

    const selectedEmp = employees.find((emp) => emp.nama === manualNama);
    setSubmitting(true);
    try {
      const res = await addManualAbsensi({
        tanggal: manualTanggal,
        nama: manualNama,
        idPegawai: selectedEmp?.idPegawai || '',
        outlet: manualOutlet,
        posisi: manualPosisi,
        jamDatang: manualJamDatang,
        jamPulang: manualJamPulang || undefined,
        status: manualStatus,
        keteranganDatang: manualKetDatang.trim() || undefined,
        keteranganPulang: manualKetPulang.trim() || undefined,
        alasanManual: manualAlasan.trim()
      });
      if (res?.authRequired) {
        onRequireAuth();
        toast.error(res.message);
        return;
      }
      if (res?.status !== 'success') {
        throw new Error(res?.message || 'Gagal menambah absensi manual.');
      }
      toast.success(res.message || 'Absensi manual berhasil ditambahkan.');
      setAddModalOpen(false);
      if (manualTanggal !== selectedDate) {
        setSelectedDate(manualTanggal);
      } else {
        await loadData(selectedDate);
      }
      onDataChanged?.();
    } catch (err: any) {
      toast.error(err?.message || 'Gagal menambah absensi manual.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmDelete = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deleteTarget) return;
    if (!deleteAlasan.trim()) {
      return toast.error('Alasan penghapusan absensi wajib diisi.');
    }
    setSubmitting(true);
    try {
      const res = await deleteAbsensi({
        rowIndex: deleteTarget.rowIndex,
        alasanHapus: deleteAlasan.trim()
      });
      if (res?.authRequired) {
        onRequireAuth();
        toast.error(res.message);
        return;
      }
      if (res?.status !== 'success') {
        throw new Error(res?.message || 'Gagal membatalkan absensi.');
      }
      toast.success(res.message || 'Baris absensi ditandai DIBATALKAN.');
      setDeleteTarget(null);
      setDeleteAlasan('');
      await loadData(selectedDate);
      onDataChanged?.();
    } catch (err: any) {
      toast.error(err?.message || 'Gagal membatalkan absensi.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header & Primary Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-neutral-200 pb-4">
        <div>
          <h2 className="text-lg font-bold text-neutral-900 flex items-center gap-2">
            <FileEdit className="w-5 h-5 text-[#cc0000]" />
            Koreksi Absensi Manual
          </h2>
          <p className="text-xs text-neutral-500 mt-0.5">
            Edit jam datang/pulang, tambah absensi lupa masuk, atau batalkan transaksi dengan jejak audit lengkap.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 bg-neutral-50 border border-neutral-300 rounded-lg px-2.5 py-2">
            <Calendar className="w-3.5 h-3.5 text-[#cc0000]" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="text-xs font-mono font-semibold bg-transparent outline-none text-neutral-800"
            />
          </div>
          <button
            type="button"
            onClick={openAddManualModal}
            className="px-3.5 py-2 bg-[#cc0000] hover:bg-[#a30000] text-white text-xs font-bold rounded-lg transition inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" />
            Tambah Absensi Manual
          </button>
          <button
            type="button"
            onClick={() => loadData(selectedDate)}
            disabled={loading}
            className="p-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 rounded-lg transition cursor-pointer disabled:opacity-50"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 bg-neutral-50 p-3 rounded-lg border border-neutral-200 items-center">
        <div className="relative">
          <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchName}
            onChange={(e) => setSearchName(e.target.value)}
            placeholder="Cari nama pegawai..."
            className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-neutral-300 rounded-md outline-none focus:ring-2 focus:ring-[#cc0000]"
          />
        </div>
        <select
          value={outletFilter}
          onChange={(e) => setOutletFilter(e.target.value)}
          className="px-3 py-2 text-xs bg-white border border-neutral-300 rounded-md outline-none focus:ring-2 focus:ring-[#cc0000]"
        >
          <option value="ALL">Semua Outlet</option>
          {effectiveOutlets.map((o) => (
            <option key={o.nama} value={o.nama}>
              {o.nama}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-xs font-medium text-neutral-700 cursor-pointer px-1">
          <input
            type="checkbox"
            checked={showCancelled}
            onChange={(e) => setShowCancelled(e.target.checked)}
            className="accent-[#cc0000]"
          />
          Tampilkan baris DIBATALKAN ({rows.filter((r) => r.isCancelled).length})
        </label>
      </div>

      {/* Data Content */}
      {loading ? (
        <div className="border border-neutral-200 rounded-lg p-5 space-y-3 animate-pulse bg-white">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-11 bg-neutral-100 rounded-md" />
          ))}
        </div>
      ) : error ? (
        <div className="p-6 bg-red-50 border border-red-200 rounded-lg text-center space-y-3">
          <p className="text-sm font-semibold text-red-800">{error}</p>
          <button
            type="button"
            onClick={() => loadData(selectedDate)}
            className="px-4 py-2 bg-[#cc0000] text-white text-xs font-bold rounded-lg cursor-pointer"
          >
            Coba Lagi
          </button>
        </div>
      ) : filteredRows.length === 0 ? (
        <div className="p-8 text-center border border-neutral-200 rounded-lg bg-white space-y-3">
          <p className="text-sm text-neutral-600">
            Tidak ada data absensi pada tanggal dan filter yang dipilih.
          </p>
          <button
            type="button"
            onClick={openAddManualModal}
            className="px-4 py-2 bg-[#cc0000] text-white text-xs font-bold rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            Tambah Absensi Manual
          </button>
        </div>
      ) : (
        <>
          {/* Desktop Table */}
          <div className="hidden md:block overflow-x-auto border border-neutral-200 rounded-lg bg-white">
            <table className="w-full text-xs text-left">
              <thead className="bg-neutral-50 text-neutral-500 uppercase border-b border-neutral-200">
                <tr>
                  <th className="px-3.5 py-3 font-semibold">Nama</th>
                  <th className="px-3.5 py-3 font-semibold">Outlet</th>
                  <th className="px-3.5 py-3 font-semibold">Posisi</th>
                  <th className="px-3.5 py-3 font-semibold">Jam Datang</th>
                  <th className="px-3.5 py-3 font-semibold">Jam Pulang</th>
                  <th className="px-3.5 py-3 font-semibold">Status</th>
                  <th className="px-3.5 py-3 font-semibold">Keterangan</th>
                  <th className="px-3.5 py-3 font-semibold text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {filteredRows.map((row) => {
                  const hasAudit = Boolean(row.editedBy || row.originalSnapshot);
                  return (
                    <tr
                      key={row.rowIndex}
                      className={`hover:bg-neutral-50/70 align-top ${row.isCancelled ? 'opacity-60 bg-neutral-50' : ''}`}
                    >
                      <td className="px-3.5 py-3">
                        <div className="font-bold text-neutral-900">{row.nama}</div>
                        <div className="text-[11px] text-neutral-500 font-mono tabular-nums mt-0.5">
                          Row #{row.rowIndex}
                          {row.originalSnapshot === 'MANUAL_ENTRY' && ' · Manual'}
                          {row.editedBy && row.originalSnapshot !== 'MANUAL_ENTRY' && ` · Koreksi: ${row.editedBy}`}
                        </div>
                      </td>
                      <td className="px-3.5 py-3 text-neutral-700 max-w-[180px] whitespace-normal">{row.outlet}</td>
                      <td className="px-3.5 py-3 font-semibold text-[#cc0000] whitespace-nowrap">{row.posisi}</td>
                      <td className="px-3.5 py-3 font-mono tabular-nums font-semibold text-neutral-900 whitespace-nowrap">
                        {row.jamDatang}
                      </td>
                      <td className="px-3.5 py-3 font-mono tabular-nums whitespace-nowrap">
                        <div className="font-semibold text-neutral-900">{row.jamPulang}</div>
                        {row.totalJam && row.totalJam !== '-' && (
                          <div className="text-[11px] text-neutral-500">{row.totalJam}</div>
                        )}
                      </td>
                      <td className="px-3.5 py-3 whitespace-nowrap">
                        <div
                          className={`font-bold ${
                            row.isCancelled
                              ? 'text-neutral-500 line-through'
                              : row.statusMasuk === 'TELAT'
                              ? 'text-red-700'
                              : row.statusMasuk === 'IZIN'
                              ? 'text-blue-700'
                              : 'text-emerald-700'
                          }`}
                        >
                          {row.statusMasuk}
                        </div>
                        {!row.isCancelled && row.statusMasuk !== 'IZIN' && (
                          <div className="text-[11px] text-neutral-500 mt-0.5">
                            {row.statusPulangLabel}
                          </div>
                        )}
                      </td>
                      <td className="px-3.5 py-3 text-neutral-600 max-w-[190px] whitespace-normal">
                        {row.keteranganDatang !== '-' && (
                          <div>
                            <span className="text-neutral-400">Datang:</span> {row.keteranganDatang}
                          </div>
                        )}
                        {row.keteranganPulang !== '-' && (
                          <div className="mt-0.5">
                            <span className="text-neutral-400">Pulang:</span> {row.keteranganPulang}
                          </div>
                        )}
                        {row.keteranganDatang === '-' && row.keteranganPulang === '-' && '-'}
                      </td>
                      <td className="px-3.5 py-3 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1">
                          {hasAudit && (
                            <button
                              type="button"
                              onClick={() => setAuditTarget(row)}
                              className="p-1.5 text-neutral-600 hover:bg-neutral-100 rounded cursor-pointer"
                              title="Lihat Audit Trail"
                            >
                              <History className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {!row.isCancelled && (
                            <>
                              <button
                                type="button"
                                onClick={() => openEditModal(row)}
                                className="p-1.5 text-blue-700 hover:bg-blue-50 rounded cursor-pointer"
                                title="Edit Absensi"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setDeleteTarget(row);
                                  setDeleteAlasan('');
                                }}
                                className="p-1.5 text-red-600 hover:bg-red-50 rounded cursor-pointer"
                                title="Batalkan / Hapus Absensi"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Card View */}
          <div className="md:hidden space-y-3">
            {filteredRows.map((row) => {
              const hasAudit = Boolean(row.editedBy || row.originalSnapshot);
              return (
                <div
                  key={row.rowIndex}
                  className={`bg-white border border-neutral-200 rounded-lg p-4 space-y-3 text-xs ${
                    row.isCancelled ? 'opacity-60' : ''
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-bold text-sm text-neutral-900">{row.nama}</p>
                      <p className="text-[11px] font-semibold text-[#cc0000]">
                        {row.posisi} · {row.outlet}
                      </p>
                      <p className="text-[11px] text-neutral-500 font-mono tabular-nums mt-0.5">
                        Row #{row.rowIndex}
                        {row.originalSnapshot === 'MANUAL_ENTRY' && ' · Manual'}
                        {row.editedBy && row.originalSnapshot !== 'MANUAL_ENTRY' && ` · Edit: ${row.editedBy}`}
                      </p>
                    </div>
                    <div className="text-right">
                      <span
                        className={`font-bold ${
                          row.isCancelled
                            ? 'text-neutral-500 line-through'
                            : row.statusMasuk === 'TELAT'
                            ? 'text-red-700'
                            : row.statusMasuk === 'IZIN'
                            ? 'text-blue-700'
                            : 'text-emerald-700'
                        }`}
                      >
                        {row.statusMasuk}
                      </span>
                      {!row.isCancelled && row.statusMasuk !== 'IZIN' && (
                        <div className="text-[11px] text-neutral-500">{row.statusPulangLabel}</div>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 bg-neutral-50 p-2.5 rounded border border-neutral-100 font-mono tabular-nums">
                    <div>
                      <span className="text-[10px] font-sans text-neutral-500 block">Datang</span>
                      <span className="font-bold text-neutral-900">{row.jamDatang}</span>
                    </div>
                    <div>
                      <span className="text-[10px] font-sans text-neutral-500 block">Pulang</span>
                      <span className="font-bold text-neutral-900">{row.jamPulang}</span>
                    </div>
                    <div>
                      <span className="text-[10px] font-sans text-neutral-500 block">Durasi</span>
                      <span className="font-bold text-neutral-900">{row.totalJam}</span>
                    </div>
                  </div>

                  {(row.keteranganDatang !== '-' || row.keteranganPulang !== '-') && (
                    <div className="text-[11px] text-neutral-600 space-y-0.5">
                      {row.keteranganDatang !== '-' && <p>Ket. Datang: {row.keteranganDatang}</p>}
                      {row.keteranganPulang !== '-' && <p>Ket. Pulang: {row.keteranganPulang}</p>}
                    </div>
                  )}

                  <div className="flex items-center justify-end gap-2 pt-1 border-t border-neutral-100">
                    {hasAudit && (
                      <button
                        type="button"
                        onClick={() => setAuditTarget(row)}
                        className="px-3 py-2 bg-neutral-100 text-neutral-700 font-semibold rounded-md inline-flex items-center gap-1 cursor-pointer"
                      >
                        <History className="w-3.5 h-3.5" />
                        Audit
                      </button>
                    )}
                    {!row.isCancelled && (
                      <>
                        <button
                          type="button"
                          onClick={() => openEditModal(row)}
                          className="px-3 py-2 bg-blue-50 text-blue-700 font-semibold rounded-md inline-flex items-center gap-1 cursor-pointer"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setDeleteTarget(row);
                            setDeleteAlasan('');
                          }}
                          className="px-3 py-2 bg-red-50 text-red-700 font-semibold rounded-md inline-flex items-center gap-1 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Hapus
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Modal Edit Absensi */}
      {editTarget && editPreview && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setEditTarget(null)}
        >
          <div
            className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden text-xs"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b bg-neutral-50 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-base text-neutral-900">Koreksi Absensi: {editTarget.nama}</h3>
                <p className="text-neutral-500">
                  {editTarget.tanggal} · {editTarget.outlet} · {editTarget.posisi}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditTarget(null)}
                className="p-1.5 text-neutral-500 hover:bg-neutral-200 rounded cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="p-5 overflow-y-auto space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-neutral-700 mb-1">Jam Datang</label>
                  <input
                    type="time"
                    value={editJamDatang}
                    onChange={(e) => setEditJamDatang(e.target.value)}
                    className="w-full p-2.5 border border-neutral-300 rounded-md font-mono"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-semibold text-neutral-700">Jam Pulang</label>
                    {editJamPulang && (
                      <button
                        type="button"
                        onClick={() => setEditJamPulang('')}
                        className="text-[11px] text-red-600 underline cursor-pointer"
                      >
                        Kosongkan
                      </button>
                    )}
                  </div>
                  <input
                    type="time"
                    value={editJamPulang}
                    onChange={(e) => setEditJamPulang(e.target.value)}
                    className="w-full p-2.5 border border-neutral-300 rounded-md font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-neutral-700 mb-1">Status Masuk</label>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value)}
                  className="w-full p-2.5 border border-neutral-300 rounded-md bg-white"
                >
                  <option value="AUTO">Otomatis (hitung ulang berdasarkan jam masuk)</option>
                  <option value="TEPAT WAKTU">TEPAT WAKTU</option>
                  <option value="TELAT">TELAT</option>
                  <option value="IZIN">IZIN</option>
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-neutral-700 mb-1">Keterangan Datang</label>
                  <input
                    type="text"
                    value={editKetDatang}
                    onChange={(e) => setEditKetDatang(e.target.value)}
                    placeholder="Opsional..."
                    className="w-full p-2.5 border border-neutral-300 rounded-md"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-neutral-700 mb-1">Keterangan Pulang</label>
                  <input
                    type="text"
                    value={editKetPulang}
                    onChange={(e) => setEditKetPulang(e.target.value)}
                    placeholder="Opsional..."
                    className="w-full p-2.5 border border-neutral-300 rounded-md"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-neutral-700 mb-1">
                  Alasan Koreksi <span className="text-red-600">*</span>
                </label>
                <textarea
                  rows={2}
                  value={editAlasan}
                  onChange={(e) => setEditAlasan(e.target.value)}
                  placeholder="Mis. Lupa absen pulang / koreksi kesalahan jam masuk..."
                  className="w-full p-2.5 border border-neutral-300 rounded-md"
                  required
                />
              </div>

              {/* Preview Data Lama vs Data Baru */}
              <div className="border border-neutral-200 rounded-lg p-3 bg-neutral-50 space-y-2">
                <p className="font-bold text-neutral-800">Preview Perubahan (Sebelum Simpan)</p>
                {editPreview.invalidOrder ? (
                  <p className="text-red-700 font-semibold">
                    Jam Pulang tidak valid terhadap Jam Datang.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 font-mono tabular-nums">
                    <div className="p-2 bg-white border border-neutral-200 rounded">
                      <span className="font-sans text-[10px] font-semibold text-neutral-500 block mb-1">
                        DATA LAMA
                      </span>
                      <div>Masuk: {editTarget.jamDatang} ({editTarget.statusMasuk})</div>
                      <div>Pulang: {editTarget.jamPulang} ({editTarget.statusPulangLabel})</div>
                      <div>Durasi: {editTarget.totalJam}</div>
                    </div>
                    <div className="p-2 bg-emerald-50/70 border border-emerald-200 rounded">
                      <span className="font-sans text-[10px] font-semibold text-emerald-800 flex items-center gap-1 mb-1">
                        <ArrowRight className="w-3 h-3" /> DATA BARU
                      </span>
                      <div>Masuk: {editJamDatang || '-'} ({editPreview.statusMasuk})</div>
                      <div>Pulang: {editJamPulang || '-'} ({editPreview.statusPulangLabel})</div>
                      <div>Durasi: {editPreview.totalJam}</div>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t">
                <button
                  type="button"
                  onClick={() => setEditTarget(null)}
                  className="px-4 py-2 bg-neutral-100 rounded-md font-semibold cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitting || editPreview.invalidOrder}
                  className="px-4 py-2 bg-[#cc0000] text-white rounded-md font-bold cursor-pointer disabled:opacity-50"
                >
                  {submitting ? 'Menyimpan...' : 'Simpan Koreksi'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Tambah Absensi Manual */}
      {addModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setAddModalOpen(false)}
        >
          <div
            className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden text-xs"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b bg-neutral-50 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-base text-neutral-900">Tambah Absensi Manual</h3>
                <p className="text-neutral-500">Catat absensi untuk pegawai yang lupa absen total.</p>
              </div>
              <button
                type="button"
                onClick={() => setAddModalOpen(false)}
                className="p-1.5 text-neutral-500 hover:bg-neutral-200 rounded cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveManual} className="p-5 overflow-y-auto space-y-3.5">
              {duplicateWarning && (
                <div className="p-3 bg-amber-50 border border-amber-300 rounded-lg text-amber-900 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold">Absensi Aktif Sudah Ada</p>
                    <p>
                      {duplicateWarning.nama} sudah memiliki catatan DATANG pada {duplicateWarning.tanggal} ({duplicateWarning.jamDatang} – {duplicateWarning.jamPulang}). Gunakan menu Edit alih-alih input manual baru.
                    </p>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-neutral-700 mb-1">
                    Tanggal <span className="text-red-600">*</span>
                  </label>
                  <input
                    type="date"
                    max={todayYmd}
                    value={manualTanggal}
                    onChange={(e) => setManualTanggal(e.target.value)}
                    className="w-full p-2.5 border border-neutral-300 rounded-md font-mono"
                    required
                  />
                </div>
                <div>
                  <label className="block font-semibold text-neutral-700 mb-1">
                    Nama Pegawai <span className="text-red-600">*</span>
                  </label>
                  <select
                    value={manualNama}
                    onChange={(e) => setManualNama(e.target.value)}
                    className="w-full p-2.5 border border-neutral-300 rounded-md bg-white"
                    required
                  >
                    <option value="" disabled>Pilih Pegawai</option>
                    {employees.map((emp) => (
                      <option key={`${emp.idPegawai}-${emp.nama}`} value={emp.nama}>
                        {emp.nama} {emp.idPegawai ? `(${emp.idPegawai})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-neutral-700 mb-1">
                    Outlet <span className="text-red-600">*</span>
                  </label>
                  <select
                    value={manualOutlet}
                    onChange={(e) => setManualOutlet(e.target.value)}
                    className="w-full p-2.5 border border-neutral-300 rounded-md bg-white"
                    required
                  >
                    <option value="" disabled>Pilih Outlet</option>
                    {effectiveOutlets.map((o) => (
                      <option key={o.nama} value={o.nama}>
                        {o.nama}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-neutral-700 mb-1">
                    Posisi <span className="text-red-600">*</span>
                  </label>
                  <select
                    value={manualPosisi}
                    onChange={(e) => setManualPosisi(e.target.value)}
                    className="w-full p-2.5 border border-neutral-300 rounded-md bg-white"
                    required
                  >
                    <option value="" disabled>Pilih Posisi</option>
                    {effectivePositions.map((p) => (
                      <option key={p.name} value={p.name}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-semibold text-neutral-700 mb-1">
                    Jam Datang <span className="text-red-600">*</span>
                  </label>
                  <input
                    type="time"
                    value={manualJamDatang}
                    onChange={(e) => setManualJamDatang(e.target.value)}
                    className="w-full p-2.5 border border-neutral-300 rounded-md font-mono"
                    required
                  />
                </div>
                <div>
                  <label className="block font-semibold text-neutral-700 mb-1">Jam Pulang (Opsional)</label>
                  <input
                    type="time"
                    value={manualJamPulang}
                    onChange={(e) => setManualJamPulang(e.target.value)}
                    className="w-full p-2.5 border border-neutral-300 rounded-md font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-neutral-700 mb-1">Status</label>
                  <select
                    value={manualStatus}
                    onChange={(e) => setManualStatus(e.target.value)}
                    className="w-full p-2.5 border border-neutral-300 rounded-md bg-white"
                  >
                    <option value="AUTO">Otomatis</option>
                    <option value="TEPAT WAKTU">TEPAT WAKTU</option>
                    <option value="TELAT">TELAT</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-neutral-700 mb-1">Keterangan Datang</label>
                  <input
                    type="text"
                    value={manualKetDatang}
                    onChange={(e) => setManualKetDatang(e.target.value)}
                    placeholder="Opsional..."
                    className="w-full p-2.5 border border-neutral-300 rounded-md"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-neutral-700 mb-1">Keterangan Pulang</label>
                  <input
                    type="text"
                    value={manualKetPulang}
                    onChange={(e) => setManualKetPulang(e.target.value)}
                    placeholder="Opsional..."
                    className="w-full p-2.5 border border-neutral-300 rounded-md"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-neutral-700 mb-1">
                  Alasan Input Manual <span className="text-red-600">*</span>
                </label>
                <textarea
                  rows={2}
                  value={manualAlasan}
                  onChange={(e) => setManualAlasan(e.target.value)}
                  placeholder="Mis. HP pegawai mati / sinyal hilang seharian..."
                  className="w-full p-2.5 border border-neutral-300 rounded-md"
                  required
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t">
                <button
                  type="button"
                  onClick={() => setAddModalOpen(false)}
                  className="px-4 py-2 bg-neutral-100 rounded-md font-semibold cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitting || Boolean(duplicateWarning)}
                  className="px-4 py-2 bg-[#cc0000] text-white rounded-md font-bold cursor-pointer disabled:opacity-50"
                >
                  {submitting ? 'Menyimpan...' : 'Simpan Absensi Manual'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Konfirmasi Hapus / Batalkan Absensi */}
      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setDeleteTarget(null)}
        >
          <div
            className="bg-white rounded-xl shadow-2xl w-full max-w-md p-5 space-y-4 text-xs"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-base text-neutral-900">Batalkan Baris Absensi?</h3>
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="p-1 text-neutral-500 hover:bg-neutral-100 rounded cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-neutral-600 leading-relaxed">
              Baris absensi <strong>{deleteTarget.nama}</strong> pada{' '}
              <span className="font-mono">{deleteTarget.tanggal}</span> ({deleteTarget.jamDatang} –{' '}
              {deleteTarget.jamPulang}) akan ditandai <strong>DIBATALKAN</strong> agar tidak dihitung pada ringkasan maupun laporan, sementara riwayat audit tetap tersimpan.
            </p>
            <form onSubmit={handleConfirmDelete} className="space-y-3">
              <div>
                <label className="block font-semibold text-neutral-700 mb-1">
                  Alasan Pembatalan <span className="text-red-600">*</span>
                </label>
                <textarea
                  rows={2}
                  value={deleteAlasan}
                  onChange={(e) => setDeleteAlasan(e.target.value)}
                  placeholder="Mis. Salah input pegawai / duplikat..."
                  className="w-full p-2.5 border border-neutral-300 rounded-md"
                  required
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setDeleteTarget(null)}
                  className="px-4 py-2 bg-neutral-100 rounded-md font-semibold cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-red-600 text-white rounded-md font-bold cursor-pointer disabled:opacity-50"
                >
                  {submitting ? 'Memproses...' : 'Ya, Tandai DIBATALKAN'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Audit Trail */}
      {auditTarget && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setAuditTarget(null)}
        >
          <div
            className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden text-xs"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b bg-neutral-50 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-base text-neutral-900">Audit Trail Absensi</h3>
                <p className="text-neutral-500">
                  {auditTarget.nama} · {auditTarget.tanggal} (Row #{auditTarget.rowIndex})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAuditTarget(null)}
                className="p-1.5 text-neutral-500 hover:bg-neutral-200 rounded cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-3">
              <div className="grid grid-cols-2 gap-3 bg-neutral-50 p-3 rounded-lg border border-neutral-200">
                <div>
                  <span className="text-neutral-500 block">Diubah / Dicatat Oleh</span>
                  <strong className="text-neutral-900">{auditTarget.editedBy || '-'}</strong>
                </div>
                <div>
                  <span className="text-neutral-500 block">Waktu Koreksi (WIB)</span>
                  <strong className="font-mono text-neutral-900">{auditTarget.editedAt || '-'}</strong>
                </div>
              </div>

              {(() => {
                if (auditTarget.originalSnapshot === 'MANUAL_ENTRY') {
                  return (
                    <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-blue-900">
                      <p className="font-bold">Entri Absensi Manual (MANUAL_ENTRY)</p>
                      <p className="mt-1">Baris ini ditambahkan langsung oleh Owner dari panel Koreksi Absensi.</p>
                    </div>
                  );
                }
                const parsed = parseSnapshotDisplay(auditTarget.originalSnapshot);
                if (!parsed) {
                  return (
                    <div className="p-3 bg-neutral-50 border border-neutral-200 rounded-lg font-mono break-all">
                      {auditTarget.originalSnapshot || 'Tidak ada data snapshot.'}
                    </div>
                  );
                }
                return (
                  <div className="space-y-3">
                    {parsed.alasan && (
                      <div className="p-2.5 bg-neutral-50 border border-neutral-200 rounded-lg">
                        <span className="text-neutral-500 block font-semibold">Alasan Koreksi / Hapus:</span>
                        <p className="text-neutral-900 mt-0.5">{parsed.alasan}</p>
                      </div>
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 font-mono tabular-nums">
                      <div className="p-3 bg-neutral-50 border border-neutral-200 rounded-lg">
                        <span className="font-sans font-bold text-neutral-600 block mb-1.5">
                          DATA SEBELUM DIUBAH
                        </span>
                        <div>Masuk: {parsed.before?.jamDatang || '-'}</div>
                        <div>Pulang: {parsed.before?.jamPulang || '-'}</div>
                        <div>Durasi: {parsed.before?.totalJam || '-'}</div>
                        <div>Status Masuk: {parsed.before?.statusMasuk || '-'}</div>
                        <div>Status Pulang: {parsed.before?.statusPulang || '-'}</div>
                      </div>
                      <div className="p-3 bg-neutral-50 border border-neutral-200 rounded-lg">
                        <span className="font-sans font-bold text-neutral-600 block mb-1.5">
                          DATA SESUDAH DIUBAH
                        </span>
                        <div>Masuk: {parsed.after?.jamDatang || auditTarget.jamDatang}</div>
                        <div>Pulang: {parsed.after?.jamPulang || auditTarget.jamPulang}</div>
                        <div>Durasi: {parsed.after?.totalJam || auditTarget.totalJam}</div>
                        <div>Status Masuk: {parsed.after?.statusMasuk || auditTarget.statusMasuk}</div>
                        <div>Status Pulang: {parsed.after?.statusPulang || auditTarget.statusPulang}</div>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
