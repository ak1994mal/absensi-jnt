import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  ClipboardCheck,
  Eye,
  FileImage,
  MapPin,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X
} from 'lucide-react';
import { toast } from 'sonner';
import {
  cancelKetidakhadiranApi,
  closeDailyAttendanceApi,
  fetchKehadiranHarianApi,
  saveKetidakhadiranApi,
  updateKetidakhadiranApi
} from '../api';
import {
  KehadiranHarianRow,
  KehadiranSummaryStats,
  StatusKehadiranHarian,
  StatusKetidakhadiran
} from '../types/attendance';

interface PositionOption {
  name: string;
  jamMasuk: string;
  jamPulang: string;
}

interface OutletOption {
  nama: string;
}

interface KehadiranPegawaiTabProps {
  outlets: OutletOption[];
  positions: PositionOption[];
  todayYmd: string;
  onPreview: (modal: { type: 'image' | 'map'; title: string; url: string }) => void;
  onRequireAuth: () => void;
  onDataChanged?: () => void;
}

const STATUS_BADGE_MAP: Record<StatusKehadiranHarian, string> = {
  HADIR: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  'BELUM ABSEN': 'bg-amber-100 text-amber-900 border-amber-300',
  'BELUM DIJADWALKAN': 'bg-neutral-100 text-neutral-500 border-neutral-300',
  LIBUR: 'bg-neutral-100 text-neutral-700 border-neutral-200',
  IZIN: 'bg-blue-100 text-blue-800 border-blue-200',
  SAKIT: 'bg-indigo-100 text-indigo-800 border-indigo-200',
  ALPA: 'bg-red-100 text-red-800 border-red-200'
};

export default function KehadiranPegawaiTab({
  outlets: propOutlets,
  positions: propPositions,
  todayYmd,
  onPreview,
  onRequireAuth,
  onDataChanged
}: KehadiranPegawaiTabProps) {
  const [selectedDate, setSelectedDate] = useState(todayYmd);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [rows, setRows] = useState<KehadiranHarianRow[]>([]);
  const [summary, setSummary] = useState<KehadiranSummaryStats | null>(null);
  const [apiOutlets, setApiOutlets] = useState<OutletOption[]>([]);
  const [apiPositions, setApiPositions] = useState<PositionOption[]>([]);

  // Filters
  const [outletFilter, setOutletFilter] = useState('ALL');
  const [posisiFilter, setPosisiFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | StatusKehadiranHarian>('ALL');
  const [searchName, setSearchName] = useState('');

  // Modal Detail
  const [detailRow, setDetailRow] = useState<KehadiranHarianRow | null>(null);

  // Modal Catat / Edit Ketidakhadiran
  const [absenceModalOpen, setAbsenceModalOpen] = useState(false);
  const [editingAbsenceRow, setEditingAbsenceRow] = useState<KehadiranHarianRow | null>(null);
  const [formPegawaiNama, setFormPegawaiNama] = useState('');
  const [formStatus, setFormStatus] = useState<StatusKetidakhadiran>('IZIN');
  const [formAlasan, setFormAlasan] = useState('');
  const [formKeterangan, setFormKeterangan] = useState('');
  const [formImageBase64, setFormImageBase64] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Modal Batalkan Ketidakhadiran
  const [cancelTarget, setCancelTarget] = useState<KehadiranHarianRow | null>(null);

  // Modal Tutup Pemeriksaan Harian
  const [closeModalOpen, setCloseModalOpen] = useState(false);
  const [closeReason, setCloseReason] = useState('Tidak hadir tanpa keterangan');
  const [selectedAlpaNames, setSelectedAlpaNames] = useState<string[]>([]);

  const effectiveOutlets = apiOutlets.length > 0 ? apiOutlets : propOutlets;
  const effectivePositions = apiPositions.length > 0 ? apiPositions : propPositions;

  const loadData = async (dateVal = selectedDate) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetchKehadiranHarianApi(dateVal);
      if (res?.authRequired) {
        onRequireAuth();
        toast.error(res.message || 'Sesi Owner berakhir. Silakan login ulang.');
        return;
      }
      if (res?.status === 'success') {
        setRows(Array.isArray(res.data) ? res.data : []);
        setSummary(res.summary || null);
        if (Array.isArray(res.outlets) && res.outlets.length > 0) setApiOutlets(res.outlets);
        if (Array.isArray(res.positions) && res.positions.length > 0) setApiPositions(res.positions);
      } else {
        throw new Error(res?.message || 'Gagal memuat data kehadiran harian.');
      }
    } catch (err: any) {
      setError(err?.message || 'Gagal memuat data kehadiran harian.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData(selectedDate);
  }, [selectedDate]);

  const filteredRows = useMemo(() => {
    const q = searchName.trim().toLowerCase();
    return rows.filter((r) => {
      if (outletFilter !== 'ALL' && r.outlet !== outletFilter) return false;
      if (posisiFilter !== 'ALL' && r.posisiPenugasan !== posisiFilter && r.posisi !== posisiFilter) return false;
      if (statusFilter !== 'ALL' && r.statusKehadiran !== statusFilter) return false;
      if (q && !r.nama.toLowerCase().includes(q) && !(r.idPegawai || '').toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, outletFilter, posisiFilter, statusFilter, searchName]);

  const belumAbsenList = useMemo(
    () => rows.filter((r) => r.statusKehadiran === 'BELUM ABSEN'),
    [rows]
  );

  const openAddAbsenceModal = (prefillRow?: KehadiranHarianRow, defaultStatus: StatusKetidakhadiran = 'IZIN') => {
    setEditingAbsenceRow(null);
    setFormPegawaiNama(prefillRow?.nama || (rows[0]?.nama || ''));
    setFormStatus(defaultStatus);
    setFormAlasan('');
    setFormKeterangan('');
    setFormImageBase64('');
    setAbsenceModalOpen(true);
  };

  const openEditAbsenceModal = (row: KehadiranHarianRow) => {
    setEditingAbsenceRow(row);
    setFormPegawaiNama(row.nama);
    const st = (row.absenceRecord?.status || (row.statusKehadiran === 'SAKIT' || row.statusKehadiran === 'ALPA' || row.statusKehadiran === 'LIBUR' ? row.statusKehadiran : 'IZIN')) as StatusKetidakhadiran;
    setFormStatus(st);
    setFormAlasan(row.absenceRecord?.alasan || row.alasan || '');
    setFormKeterangan(row.absenceRecord?.keterangan || '');
    setFormImageBase64('');
    setAbsenceModalOpen(true);
  };

  const handleImageFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      if (ev.target?.result) setFormImageBase64(String(ev.target.result));
    };
    reader.readAsDataURL(file);
  };

  const submitAbsence = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formPegawaiNama) return toast.error('Pilih nama pegawai.');
    if ((formStatus === 'IZIN' || formStatus === 'SAKIT' || formStatus === 'ALPA') && !formAlasan.trim()) {
      return toast.error(`Alasan wajib diisi untuk status ${formStatus}.`);
    }

    const empRow = rows.find((r) => r.nama === formPegawaiNama);
    setSubmitting(true);
    try {
      const payload = {
        rowIndex: editingAbsenceRow?.absenceRecord?.rowIndex,
        tanggal: selectedDate,
        idPegawai: empRow?.idPegawai || '',
        nama: formPegawaiNama,
        outlet: empRow?.outlet || '-',
        posisi: empRow?.posisiPenugasan || empRow?.posisi || '-',
        status: formStatus,
        alasan: formAlasan.trim(),
        keterangan: formKeterangan.trim(),
        image: formImageBase64 || undefined
      };

      const res = editingAbsenceRow
        ? await updateKetidakhadiranApi(payload)
        : await saveKetidakhadiranApi(payload);

      if (res?.authRequired) {
        onRequireAuth();
        toast.error(res.message);
        return;
      }
      if (res?.status !== 'success') {
        throw new Error(res?.message || 'Gagal menyimpan catatan ketidakhadiran.');
      }
      toast.success(res.message || 'Ketidakhadiran berhasil dicatat.');
      if (res.scheduleConflictWarning) {
        toast.warning(res.scheduleConflictWarning, { duration: 8000 });
      }
      setAbsenceModalOpen(false);
      await loadData(selectedDate);
      onDataChanged?.();
    } catch (err: any) {
      toast.error(err?.message || 'Gagal menyimpan ketidakhadiran.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmCancelAbsence = async () => {
    if (!cancelTarget) return;
    setSubmitting(true);
    try {
      const res = await cancelKetidakhadiranApi({
        rowIndex: cancelTarget.absenceRecord?.rowIndex,
        tanggal: selectedDate,
        idPegawai: cancelTarget.idPegawai,
        nama: cancelTarget.nama
      });
      if (res?.authRequired) {
        onRequireAuth();
        toast.error(res.message);
        return;
      }
      if (res?.status !== 'success') {
        throw new Error(res?.message || 'Gagal membatalkan ketidakhadiran.');
      }
      toast.success(res.message || 'Catatan ketidakhadiran dibatalkan.');
      setCancelTarget(null);
      await loadData(selectedDate);
      onDataChanged?.();
    } catch (err: any) {
      toast.error(err?.message || 'Gagal membatalkan ketidakhadiran.');
    } finally {
      setSubmitting(false);
    }
  };

  const openCloseAttendanceModal = () => {
    setSelectedAlpaNames(belumAbsenList.map((r) => r.nama));
    setCloseReason('Tidak hadir tanpa keterangan');
    setCloseModalOpen(true);
  };

  const toggleAlpaSelection = (name: string) => {
    setSelectedAlpaNames((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]
    );
  };

  const submitCloseDailyAttendance = async () => {
    if (selectedAlpaNames.length === 0) {
      return toast.error('Pilih minimal 1 pegawai yang belum absen.');
    }
    setSubmitting(true);
    try {
      const res = await closeDailyAttendanceApi({
        tanggal: selectedDate,
        alasan: closeReason.trim() || 'Tidak hadir tanpa keterangan',
        targetNames: selectedAlpaNames
      });
      if (res?.authRequired) {
        onRequireAuth();
        toast.error(res.message);
        return;
      }
      if (res?.status !== 'success') {
        throw new Error(res?.message || 'Gagal menutup pemeriksaan harian.');
      }
      if (res.partial) {
        toast.warning(res.message || 'Pemeriksaan harian selesai sebagian.', { duration: 7000 });
      } else {
        toast.success(res.message || 'Pemeriksaan harian berhasil ditutup.');
      }
      setCloseModalOpen(false);
      await loadData(selectedDate);
      onDataChanged?.();
    } catch (err: any) {
      toast.error(err?.message || 'Gagal menutup pemeriksaan harian.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header & Main Actions */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-neutral-100 pb-4">
        <div>
          <h2 className="text-lg font-bold text-neutral-800">Kehadiran Seluruh Pegawai</h2>
          <p className="text-xs text-neutral-500 mt-0.5">
            Pantau status harian seluruh pegawai aktif (HADIR, BELUM ABSEN, LIBUR, IZIN, SAKIT, ALPA).
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 bg-neutral-50 border border-neutral-300 rounded-lg px-2.5 py-1.5">
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
            onClick={() => openAddAbsenceModal(undefined, 'IZIN')}
            className="px-3 py-2 bg-[#cc0000] hover:bg-[#a30000] text-white text-xs font-bold rounded-lg transition inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            Catat Ketidakhadiran
          </button>
          <button
            type="button"
            onClick={openCloseAttendanceModal}
            disabled={loading || belumAbsenList.length === 0}
            className="px-3 py-2 bg-neutral-800 hover:bg-neutral-900 text-white text-xs font-semibold rounded-lg transition inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
          >
            <ClipboardCheck className="w-3.5 h-3.5" />
            Tutup Pemeriksaan Harian ({belumAbsenList.length})
          </button>
          <button
            type="button"
            onClick={() => loadData(selectedDate)}
            disabled={loading}
            className="p-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 rounded-lg transition cursor-pointer disabled:opacity-50"
            title="Refresh"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* 9 Summary Counters */}
      {summary && (
        <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-9 gap-2.5">
          {[
            { label: 'Aktif', val: summary.totalPegawaiAktif, cls: 'bg-neutral-50 border-neutral-200 text-neutral-900' },
            { label: 'Dijadwalkan', val: summary.totalDijadwalkan, cls: 'bg-neutral-50 border-neutral-200 text-neutral-800' },
            { label: 'Hadir', val: summary.hadir, cls: 'bg-emerald-50 border-emerald-200 text-emerald-800' },
            { label: 'Belum Absen', val: summary.belumAbsen, cls: 'bg-amber-50 border-amber-200 text-amber-900' },
            { label: 'Libur', val: summary.libur, cls: 'bg-neutral-100 border-neutral-200 text-neutral-700' },
            { label: 'Izin', val: summary.izin, cls: 'bg-blue-50 border-blue-200 text-blue-800' },
            { label: 'Sakit', val: summary.sakit, cls: 'bg-indigo-50 border-indigo-200 text-indigo-800' },
            { label: 'ALPA', val: summary.alpa, cls: 'bg-red-50 border-red-200 text-red-800' },
            { label: 'Telat', val: summary.telat, cls: 'bg-rose-50 border-rose-200 text-rose-800' }
          ].map((c) => (
            <div key={c.label} className={`border rounded-lg p-2.5 text-center ${c.cls}`}>
              <p className="text-[10px] font-bold uppercase tracking-wide opacity-80">{c.label}</p>
              <p className="text-xl font-bold font-mono tabular-nums mt-0.5">{c.val}</p>
            </div>
          ))}
        </div>
      )}

      {/* Filter Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 bg-neutral-50 p-3 rounded-lg border border-neutral-200">
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
            <option key={o.nama} value={o.nama}>{o.nama}</option>
          ))}
        </select>
        <select
          value={posisiFilter}
          onChange={(e) => setPosisiFilter(e.target.value)}
          className="px-3 py-2 text-xs bg-white border border-neutral-300 rounded-md outline-none focus:ring-2 focus:ring-[#cc0000]"
        >
          <option value="ALL">Semua Posisi</option>
          {effectivePositions.map((p) => (
            <option key={p.name} value={p.name}>{p.name}</option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as any)}
          className="px-3 py-2 text-xs bg-white border border-neutral-300 rounded-md outline-none focus:ring-2 focus:ring-[#cc0000]"
        >
          <option value="ALL">Semua Status Kehadiran</option>
          <option value="HADIR">HADIR</option>
          <option value="BELUM ABSEN">BELUM ABSEN</option>
          <option value="BELUM DIJADWALKAN">BELUM DIJADWALKAN</option>
          <option value="LIBUR">LIBUR</option>
          <option value="IZIN">IZIN</option>
          <option value="SAKIT">SAKIT</option>
          <option value="ALPA">ALPA</option>
        </select>
      </div>

      {/* Main List */}
      {loading ? (
        <div className="border border-neutral-200 rounded-lg p-6 space-y-3 animate-pulse">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-12 bg-neutral-100 rounded-md" />
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
        <div className="p-8 text-center border border-neutral-200 rounded-lg text-sm text-neutral-500">
          Tidak ada pegawai pada filter kehadiran saat ini.
        </div>
      ) : (
        <>
          {/* Desktop Table */}
          <div className="hidden md:block overflow-x-auto border border-neutral-200 rounded-lg bg-white">
            <table className="w-full text-xs text-left">
              <thead className="bg-neutral-50 text-neutral-500 uppercase border-b border-neutral-200">
                <tr>
                  <th className="px-4 py-3 font-semibold">Tanggal</th>
                  <th className="px-4 py-3 font-semibold">Nama</th>
                  <th className="px-4 py-3 font-semibold">Posisi</th>
                  <th className="px-4 py-3 font-semibold">Outlet</th>
                  <th className="px-4 py-3 font-semibold">Jam Masuk</th>
                  <th className="px-4 py-3 font-semibold">Jam Pulang</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {filteredRows.map((row, idx) => (
                  <tr key={row.idPegawai || `${row.nama}-${idx}`} className="hover:bg-neutral-50/70 align-top">
                    <td className="px-4 py-3 font-mono text-neutral-600 whitespace-nowrap">{row.tanggal}</td>
                    <td className="px-4 py-3">
                      <div className="font-bold text-neutral-900">{row.nama}</div>
                      <div className="text-[10px] text-neutral-500 flex flex-wrap gap-1 mt-0.5">
                        {row.jenisPenugasan !== 'NORMAL' && (
                          <span className="px-1.5 py-0.5 bg-amber-100 text-amber-900 rounded font-bold">
                            {row.jenisPenugasan}
                          </span>
                        )}
                        {row.hasScheduleConflict && (
                          <span className="px-1.5 py-0.5 bg-red-100 text-red-800 rounded font-bold">
                            Konflik Jadwal
                          </span>
                        )}
                        {row.missingId && (
                          <span className="px-1.5 py-0.5 bg-neutral-100 text-neutral-600 rounded">
                            ID Kosong
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-bold text-[#cc0000]">{row.posisiPenugasan || row.posisi || '-'}</div>
                      {row.posisiPermanen && row.posisiPermanen !== '-' && row.posisiPermanen !== row.posisiPenugasan && (
                        <div className="text-[10px] text-neutral-500">Permanen: {row.posisiPermanen}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-neutral-800 max-w-[200px] whitespace-normal">{row.outlet || '-'}</td>
                    <td className="px-4 py-3 font-mono tabular-nums">
                      <div className="font-semibold text-neutral-900">{row.jamDatang}</div>
                      {row.statusMasuk === 'TELAT' && (
                        <span className="text-[10px] font-bold text-red-700">TELAT</span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono tabular-nums">
                      <div className="font-semibold text-neutral-900">{row.jamPulang}</div>
                      {row.totalJam && row.totalJam !== '-' && (
                        <div className="text-[10px] text-neutral-500">{row.totalJam}</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded border text-[10px] font-bold ${STATUS_BADGE_MAP[row.statusKehadiran]}`}>
                        {row.statusKehadiran}
                      </span>
                      {row.alasan && (
                        <p className="text-[11px] text-neutral-500 mt-1 max-w-[160px] whitespace-normal">
                          {row.alasan}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setDetailRow(row)}
                          className="p-1.5 text-neutral-600 hover:bg-neutral-100 rounded cursor-pointer"
                          title="Detail"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        {row.absenceRecord ? (
                          <>
                            <button
                              type="button"
                              onClick={() => openEditAbsenceModal(row)}
                              className="p-1.5 text-blue-700 hover:bg-blue-50 rounded cursor-pointer"
                              title="Edit Ketidakhadiran"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setCancelTarget(row)}
                              className="p-1.5 text-red-600 hover:bg-red-50 rounded cursor-pointer"
                              title="Batalkan Ketidakhadiran"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        ) : row.statusKehadiran === 'BELUM ABSEN' ? (
                          <button
                            type="button"
                            onClick={() => openAddAbsenceModal(row, 'IZIN')}
                            className="px-2 py-1 bg-neutral-100 hover:bg-neutral-200 text-neutral-800 font-semibold rounded text-[11px] cursor-pointer"
                          >
                            Catat
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className="md:hidden space-y-3">
            {filteredRows.map((row, idx) => (
              <div key={row.idPegawai || `${row.nama}-${idx}`} className="bg-white border border-neutral-200 rounded-lg p-3.5 space-y-2.5 text-xs">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-bold text-sm text-neutral-900">{row.nama}</p>
                    <p className="text-[11px] font-bold text-[#cc0000]">
                      {row.posisiPenugasan} {row.jenisPenugasan !== 'NORMAL' ? `(${row.jenisPenugasan})` : ''}
                    </p>
                    <p className="text-[11px] text-neutral-500">{row.outlet}</p>
                  </div>
                  <span className={`px-2 py-0.5 rounded border text-[10px] font-bold ${STATUS_BADGE_MAP[row.statusKehadiran]}`}>
                    {row.statusKehadiran}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 bg-neutral-50 p-2 rounded border border-neutral-100 font-mono">
                  <div>
                    <span className="text-[10px] font-sans text-neutral-500 block">Masuk</span>
                    <span className="font-bold">{row.jamDatang}</span>
                  </div>
                  <div>
                    <span className="text-[10px] font-sans text-neutral-500 block">Pulang</span>
                    <span className="font-bold">{row.jamPulang}</span>
                  </div>
                </div>
                {row.alasan && <p className="text-[11px] text-neutral-600 italic">"{row.alasan}"</p>}
                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setDetailRow(row)}
                    className="px-3 py-1.5 bg-neutral-100 text-neutral-700 font-semibold rounded cursor-pointer"
                  >
                    Detail
                  </button>
                  {row.absenceRecord ? (
                    <>
                      <button
                        type="button"
                        onClick={() => openEditAbsenceModal(row)}
                        className="px-3 py-1.5 bg-blue-50 text-blue-700 font-semibold rounded cursor-pointer"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => setCancelTarget(row)}
                        className="px-3 py-1.5 bg-red-50 text-red-700 font-semibold rounded cursor-pointer"
                      >
                        Batalkan
                      </button>
                    </>
                  ) : row.statusKehadiran === 'BELUM ABSEN' ? (
                    <button
                      type="button"
                      onClick={() => openAddAbsenceModal(row, 'IZIN')}
                      className="px-3 py-1.5 bg-[#cc0000] text-white font-bold rounded cursor-pointer"
                    >
                      Catat Status
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Modal Detail Kehadiran */}
      {detailRow && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setDetailRow(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-5 space-y-3 text-xs" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b pb-3">
              <div>
                <h3 className="font-bold text-base text-neutral-900">{detailRow.nama}</h3>
                <p className="text-neutral-500">{detailRow.tanggal} • {detailRow.outlet}</p>
              </div>
              <button type="button" onClick={() => setDetailRow(null)} className="p-1 text-neutral-500 hover:bg-neutral-100 rounded cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2.5 bg-neutral-50 p-3 rounded-lg border">
              <div><span className="text-neutral-500 block">Status Kehadiran</span><strong>{detailRow.statusKehadiran}</strong></div>
              <div><span className="text-neutral-500 block">Sumber Jadwal</span><strong>{detailRow.sumberJadwal}</strong></div>
              <div><span className="text-neutral-500 block">Posisi Permanen</span><strong>{detailRow.posisiPermanen}</strong></div>
              <div><span className="text-neutral-500 block">Posisi Penugasan</span><strong className="text-[#cc0000]">{detailRow.posisiPenugasan}</strong></div>
              <div><span className="text-neutral-500 block">Jadwal Kerja</span><strong className="font-mono">{detailRow.jamMasukJadwal} – {detailRow.jamPulangJadwal}</strong></div>
              <div><span className="text-neutral-500 block">Absen Aktual</span><strong className="font-mono">{detailRow.jamDatang} – {detailRow.jamPulang}</strong></div>
            </div>
            {detailRow.alasan && (
              <div className="p-2.5 bg-neutral-50 rounded border text-neutral-700">
                <span className="font-semibold block text-neutral-500 mb-0.5">Alasan / Keterangan:</span>
                {detailRow.alasan}
              </div>
            )}
            <div className="flex flex-wrap gap-2 pt-2">
              {detailRow.fotoDatang && (
                <button
                  type="button"
                  onClick={() => onPreview({ type: 'image', title: `Foto/Bukti ${detailRow.nama}`, url: detailRow.fotoDatang })}
                  className="px-3 py-1.5 bg-neutral-100 hover:bg-neutral-200 rounded font-semibold inline-flex items-center gap-1 cursor-pointer"
                >
                  <FileImage className="w-3.5 h-3.5" /> Foto Masuk / Bukti
                </button>
              )}
              {detailRow.fotoPulang && (
                <button
                  type="button"
                  onClick={() => onPreview({ type: 'image', title: `Foto Pulang ${detailRow.nama}`, url: detailRow.fotoPulang })}
                  className="px-3 py-1.5 bg-neutral-100 hover:bg-neutral-200 rounded font-semibold inline-flex items-center gap-1 cursor-pointer"
                >
                  <FileImage className="w-3.5 h-3.5" /> Foto Pulang
                </button>
              )}
              {detailRow.lokasiDatang && detailRow.lokasiDatang !== '-' && (
                <button
                  type="button"
                  onClick={() => onPreview({ type: 'map', title: `GPS Masuk ${detailRow.nama}`, url: detailRow.lokasiDatang })}
                  className="px-3 py-1.5 bg-blue-50 text-blue-700 rounded font-semibold inline-flex items-center gap-1 cursor-pointer"
                >
                  <MapPin className="w-3.5 h-3.5" /> GPS Masuk
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal Catat / Edit Ketidakhadiran */}
      {absenceModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setAbsenceModalOpen(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-5 space-y-4 text-xs" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-base text-neutral-900">
                {editingAbsenceRow ? 'Edit Catatan Ketidakhadiran' : 'Catat Ketidakhadiran Pegawai'}
              </h3>
              <button type="button" onClick={() => setAbsenceModalOpen(false)} className="p-1 text-neutral-500 hover:bg-neutral-100 rounded cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={submitAbsence} className="space-y-3.5">
              <div>
                <label className="block font-semibold text-neutral-700 mb-1">Pegawai</label>
                <select
                  value={formPegawaiNama}
                  onChange={(e) => setFormPegawaiNama(e.target.value)}
                  disabled={!!editingAbsenceRow}
                  className="w-full p-2.5 border border-neutral-300 rounded-md bg-white disabled:bg-neutral-100"
                  required
                >
                  <option value="" disabled>Pilih Pegawai</option>
                  {rows.map((r) => (
                    <option key={r.nama} value={r.nama}>
                      {r.nama} ({r.statusKehadiran})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-neutral-700 mb-1">Status Ketidakhadiran</label>
                <div className="grid grid-cols-4 gap-1.5">
                  {(['LIBUR', 'IZIN', 'SAKIT', 'ALPA'] as StatusKetidakhadiran[]).map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setFormStatus(st)}
                      className={`py-2 rounded-md font-bold border transition cursor-pointer ${
                        formStatus === st
                          ? 'bg-[#cc0000] text-white border-[#cc0000]'
                          : 'bg-neutral-50 text-neutral-700 border-neutral-200 hover:bg-neutral-100'
                      }`}
                    >
                      {st}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block font-semibold text-neutral-700 mb-1">
                  Alasan {formStatus !== 'LIBUR' && <span className="text-red-600">*</span>}
                </label>
                <input
                  type="text"
                  value={formAlasan}
                  onChange={(e) => setFormAlasan(e.target.value)}
                  placeholder={formStatus === 'LIBUR' ? 'Opsional (mis. Libur mingguan)' : `Masukkan alasan ${formStatus}...`}
                  className="w-full p-2.5 border border-neutral-300 rounded-md"
                  required={formStatus !== 'LIBUR'}
                />
              </div>

              <div>
                <label className="block font-semibold text-neutral-700 mb-1">Bukti Foto / Surat (Opsional)</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageFile}
                  className="w-full text-[11px] text-neutral-600"
                />
              </div>

              <div>
                <label className="block font-semibold text-neutral-700 mb-1">Keterangan Tambahan</label>
                <input
                  type="text"
                  value={formKeterangan}
                  onChange={(e) => setFormKeterangan(e.target.value)}
                  placeholder="Catatan opsional Owner..."
                  className="w-full p-2.5 border border-neutral-300 rounded-md"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t">
                <button type="button" onClick={() => setAbsenceModalOpen(false)} className="px-4 py-2 bg-neutral-100 rounded-md font-semibold cursor-pointer">
                  Batal
                </button>
                <button type="submit" disabled={submitting} className="px-4 py-2 bg-[#cc0000] text-white rounded-md font-bold cursor-pointer disabled:opacity-50">
                  {submitting ? 'Menyimpan...' : 'Simpan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Konfirmasi Batalkan Ketidakhadiran */}
      {cancelTarget && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setCancelTarget(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-5 space-y-4 text-xs" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold text-base text-neutral-900">Batalkan Catatan Ketidakhadiran?</h3>
            <p className="text-neutral-600 leading-relaxed">
              Catatan <strong>{cancelTarget.statusKehadiran}</strong> untuk <strong>{cancelTarget.nama}</strong> pada {cancelTarget.tanggal} akan ditandai <strong>DIBATALKAN</strong> di DataKetidakhadiran (dan baris sinkron IZIN terkait di Data_Absensi jika ada). Transaksi absensi hadir DATANG/PULANG tidak akan tersentuh.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setCancelTarget(null)} className="px-3.5 py-2 bg-neutral-100 rounded-md font-semibold cursor-pointer">Tutup</button>
              <button
                type="button"
                onClick={handleConfirmCancelAbsence}
                disabled={submitting}
                className="px-4 py-2 bg-red-600 text-white rounded-md font-bold cursor-pointer disabled:opacity-50"
              >
                {submitting ? 'Memproses...' : 'Ya, Batalkan Catatan'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Tutup Pemeriksaan Harian */}
      {closeModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setCloseModalOpen(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden text-xs" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b bg-neutral-50 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-base text-neutral-900">Tutup Pemeriksaan Harian</h3>
                <p className="text-neutral-500">Tandai pegawai yang masih BELUM ABSEN menjadi ALPA (tanggal {selectedDate}).</p>
              </div>
              <button type="button" onClick={() => setCloseModalOpen(false)} className="p-1.5 text-neutral-500 hover:bg-neutral-200 rounded cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 overflow-y-auto space-y-4">
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-md text-amber-900">
                Pegawai berstatus <strong>LIBUR</strong>, <strong>IZIN</strong>, <strong>SAKIT</strong>, atau <strong>HADIR</strong> tidak akan tersentuh, dan tidak ada transaksi DATANG palsu yang dibuat.
              </div>
              <div>
                <label className="block font-semibold text-neutral-700 mb-1">Alasan Pencatatan ALPA</label>
                <input
                  type="text"
                  value={closeReason}
                  onChange={(e) => setCloseReason(e.target.value)}
                  className="w-full p-2 border border-neutral-300 rounded-md"
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-semibold text-neutral-700">Pegawai BELUM ABSEN ({selectedAlpaNames.length}/{belumAbsenList.length})</span>
                  <button
                    type="button"
                    onClick={() => setSelectedAlpaNames(selectedAlpaNames.length === belumAbsenList.length ? [] : belumAbsenList.map((r) => r.nama))}
                    className="text-[#cc0000] font-bold underline cursor-pointer"
                  >
                    {selectedAlpaNames.length === belumAbsenList.length ? 'Kosongkan Semua' : 'Pilih Semua'}
                  </button>
                </div>
                <div className="border rounded-md divide-y max-h-48 overflow-y-auto">
                  {belumAbsenList.map((r) => (
                    <label key={r.nama} className="flex items-center justify-between px-3 py-2 hover:bg-neutral-50 cursor-pointer">
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={selectedAlpaNames.includes(r.nama)}
                          onChange={() => toggleAlpaSelection(r.nama)}
                          className="accent-[#cc0000]"
                        />
                        <span className="font-semibold text-neutral-900">{r.nama}</span>
                      </div>
                      <span className="text-[11px] text-neutral-500">{r.outlet} • {r.posisiPenugasan}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <div className="px-5 py-3 border-t bg-neutral-50 flex justify-end gap-2">
              <button type="button" onClick={() => setCloseModalOpen(false)} className="px-4 py-2 bg-neutral-100 rounded-md font-semibold cursor-pointer">Batal</button>
              <button
                type="button"
                onClick={submitCloseDailyAttendance}
                disabled={submitting || selectedAlpaNames.length === 0}
                className="px-4 py-2 bg-[#cc0000] text-white rounded-md font-bold cursor-pointer disabled:opacity-50"
              >
                {submitting ? 'Memproses...' : `Tandai ${selectedAlpaNames.length} Pegawai ALPA`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
