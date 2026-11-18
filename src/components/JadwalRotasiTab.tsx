import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Calendar,
  History,
  Pencil,
  Plus,
  RefreshCw,
  ShieldAlert,
  UserCheck,
  UserMinus,
  X
} from 'lucide-react';
import { toast } from 'sonner';
import {
  cancelJadwalHarianApi,
  fetchJadwalHarianApi,
  fetchRiwayatRotasiApi,
  saveJadwalHarianApi,
  updateJadwalHarianApi
} from '../api';
import {
  JadwalHarianRecord,
  JenisPenugasan,
  KehadiranHarianRow,
  OutletReadinessAlert,
  PegawaiSafe
} from '../types/attendance';

interface PositionOption {
  name: string;
  jamMasuk: string;
  jamPulang: string;
  enabled?: boolean;
}

interface OutletOption {
  nama: string;
  lat: number;
  lng: number;
  radius: number;
}

interface JadwalRotasiTabProps {
  outlets: OutletOption[];
  positions: PositionOption[];
  todayYmd: string;
  onRequireAuth: () => void;
  onDataChanged?: () => void;
}

const JENIS_BADGE_MAP: Record<JenisPenugasan, string> = {
  NORMAL: 'bg-neutral-100 text-neutral-700 border-neutral-200',
  BACKUP: 'bg-amber-100 text-amber-900 border-amber-300',
  ROTASI: 'bg-blue-100 text-blue-800 border-blue-200',
  PENGGANTI: 'bg-purple-100 text-purple-800 border-purple-200'
};

export default function JadwalRotasiTab({
  outlets: propOutlets,
  positions: propPositions,
  todayYmd,
  onRequireAuth,
  onDataChanged
}: JadwalRotasiTabProps) {
  const [selectedDate, setSelectedDate] = useState(todayYmd);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [jadwalRows, setJadwalRows] = useState<JadwalHarianRecord[]>([]);
  const [effectiveSchedules, setEffectiveSchedules] = useState<KehadiranHarianRow[]>([]);
  const [unscheduledEmployees, setUnscheduledEmployees] = useState<KehadiranHarianRow[]>([]);
  const [alerts, setAlerts] = useState<OutletReadinessAlert[]>([]);
  const [employees, setEmployees] = useState<PegawaiSafe[]>([]);
  const [apiOutlets, setApiOutlets] = useState<OutletOption[]>([]);
  const [apiPositions, setApiPositions] = useState<PositionOption[]>([]);

  const [subTab, setSubTab] = useState<'efektif' | 'override'>('efektif');
  const [outletFilter, setOutletFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Modal Add Assignment / Backup / Libur
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [addMode, setAddMode] = useState<'DIJADWALKAN' | 'LIBUR'>('DIJADWALKAN');
  const [formEmployeeName, setFormEmployeeName] = useState('');
  const [formOutlet, setFormOutlet] = useState('');
  const [formPosisiPenugasan, setFormPosisiPenugasan] = useState('Admin');
  const [formJenisPenugasan, setFormJenisPenugasan] = useState<JenisPenugasan>('BACKUP');
  const [formJamMasuk, setFormJamMasuk] = useState('08:00');
  const [formJamPulang, setFormJamPulang] = useState('20:00');
  const [formTanggalMulai, setFormTanggalMulai] = useState(todayYmd);
  const [formTanggalAkhir, setFormTanggalAkhir] = useState(todayYmd);
  const [formCatatan, setFormCatatan] = useState('');
  const [confirmConflictIzin, setConfirmConflictIzin] = useState(false);
  const [confirmAfterDatang, setConfirmAfterDatang] = useState(false);
  const [pendingWarningMsg, setPendingWarningMsg] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Modal Edit JadwalHarian
  const [editTarget, setEditTarget] = useState<JadwalHarianRecord | null>(null);
  const [editOutlet, setEditOutlet] = useState('');
  const [editPosisi, setEditPosisi] = useState('');
  const [editJenis, setEditJenis] = useState<JenisPenugasan>('BACKUP');
  const [editStatus, setEditStatus] = useState<'DIJADWALKAN' | 'LIBUR'>('DIJADWALKAN');
  const [editJamMasuk, setEditJamMasuk] = useState('08:00');
  const [editJamPulang, setEditJamPulang] = useState('20:00');
  const [editCatatan, setEditCatatan] = useState('');
  const [editConfirmDatang, setEditConfirmDatang] = useState(false);

  // Modal Cancel JadwalHarian
  const [cancelTarget, setCancelTarget] = useState<JadwalHarianRecord | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelConfirmDatang, setCancelConfirmDatang] = useState(false);

  // Modal Riwayat Rotasi
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyBulan, setHistoryBulan] = useState(todayYmd.slice(0, 7));
  const [historyOutlet, setHistoryOutlet] = useState('');
  const [historyNama, setHistoryNama] = useState('');
  const [historyRows, setHistoryRows] = useState<JadwalHarianRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const effectiveOutlets = apiOutlets.length > 0 ? apiOutlets : propOutlets;
  const effectivePositions = useMemo(() => {
    const base = apiPositions.length > 0 ? apiPositions : propPositions;
    const hasAdmin = base.some((p) => p.name.toLowerCase() === 'admin');
    return hasAdmin ? base : [{ name: 'Admin', jamMasuk: '08:00', jamPulang: '20:00', enabled: true }, ...base];
  }, [apiPositions, propPositions]);

  const loadData = async (dateVal = selectedDate) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetchJadwalHarianApi(dateVal);
      if (res?.status === 'success') {
        setJadwalRows(Array.isArray(res.jadwal) ? res.jadwal : []);
        setEffectiveSchedules(Array.isArray(res.effectiveSchedules) ? res.effectiveSchedules : []);
        setUnscheduledEmployees(Array.isArray(res.unscheduledEmployees) ? res.unscheduledEmployees : []);
        setAlerts(Array.isArray(res.alerts) ? res.alerts : []);
        setEmployees(Array.isArray(res.employees) ? res.employees : []);
        if (Array.isArray(res.outlets) && res.outlets.length > 0) setApiOutlets(res.outlets);
        if (Array.isArray(res.positions) && res.positions.length > 0) setApiPositions(res.positions);
      } else {
        throw new Error(res?.message || 'Gagal memuat jadwal harian.');
      }
    } catch (err: any) {
      setError(err?.message || 'Gagal memuat data jadwal & rotasi.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData(selectedDate);
  }, [selectedDate]);

  const openAddModal = (opts?: {
    mode?: 'DIJADWALKAN' | 'LIBUR';
    empName?: string;
    outletName?: string;
    posisiPenugasan?: string;
    jenis?: JenisPenugasan;
  }) => {
    const mode = opts?.mode || 'DIJADWALKAN';
    const targetEmp = opts?.empName || (employees[0]?.nama || '');
    const targetOutlet = opts?.outletName || (effectiveOutlets[0]?.nama || '');
    const targetPos = opts?.posisiPenugasan || (mode === 'LIBUR' ? '-' : 'Admin');
    const posCfg = effectivePositions.find((p) => p.name.toLowerCase() === targetPos.toLowerCase());

    setAddMode(mode);
    setFormEmployeeName(targetEmp);
    setFormOutlet(targetOutlet);
    setFormPosisiPenugasan(targetPos);
    setFormJenisPenugasan(opts?.jenis || (mode === 'LIBUR' ? 'NORMAL' : 'BACKUP'));
    setFormJamMasuk(posCfg?.jamMasuk || '08:00');
    setFormJamPulang(posCfg?.jamPulang || '20:00');
    setFormTanggalMulai(selectedDate);
    setFormTanggalAkhir(selectedDate);
    setFormCatatan('');
    setConfirmConflictIzin(false);
    setConfirmAfterDatang(false);
    setPendingWarningMsg('');
    setAddModalOpen(true);
  };

  const handleFormPosisiChange = (nextPos: string) => {
    setFormPosisiPenugasan(nextPos);
    const posCfg = effectivePositions.find((p) => p.name.toLowerCase() === nextPos.toLowerCase());
    if (posCfg) {
      setFormJamMasuk(posCfg.jamMasuk || '08:00');
      setFormJamPulang(posCfg.jamPulang || '20:00');
    }
  };

  const submitAddSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formEmployeeName) return toast.error('Pilih Pegawai terlebih dahulu.');
    if (addMode === 'DIJADWALKAN' && !formOutlet) return toast.error('Pilih Outlet penugasan.');

    const selectedEmp = employees.find((x) => x.nama === formEmployeeName);
    setSubmitting(true);
    try {
      const res = await saveJadwalHarianApi({
        idPegawai: selectedEmp?.idPegawai || '',
        nama: formEmployeeName,
        outlet: addMode === 'DIJADWALKAN' ? formOutlet : (formOutlet || '-'),
        posisiPenugasan: addMode === 'DIJADWALKAN' ? formPosisiPenugasan : '-',
        jamMasuk: addMode === 'DIJADWALKAN' ? formJamMasuk : '-',
        jamPulang: addMode === 'DIJADWALKAN' ? formJamPulang : '-',
        jenisPenugasan: addMode === 'LIBUR' ? 'NORMAL' : formJenisPenugasan,
        statusJadwal: addMode,
        tanggalMulai: formTanggalMulai,
        tanggalAkhir: formTanggalAkhir || formTanggalMulai,
        catatan: formCatatan,
        confirmConflictIzin,
        confirmAfterDatang
      });

      if (res?.authRequired) {
        onRequireAuth();
        toast.error(res.message || 'Sesi Owner berakhir. Silakan login ulang.');
        return;
      }
      if (res?.requiresConflictConfirmation) {
        setConfirmConflictIzin(true);
        setPendingWarningMsg(res.message);
        return;
      }
      if (res?.requiresDatangConfirmation) {
        setConfirmAfterDatang(true);
        setPendingWarningMsg(res.message);
        return;
      }
      if (res?.status !== 'success') {
        throw new Error(res?.message || 'Gagal menyimpan jadwal harian.');
      }
      toast.success(res.message || 'Jadwal harian berhasil disimpan.');
      if (Array.isArray(res.warnings) && res.warnings.length > 0) {
        toast.warning(res.warnings.join(' '));
      }
      setAddModalOpen(false);
      await loadData(selectedDate);
      onDataChanged?.();
    } catch (err: any) {
      toast.error(err?.message || 'Gagal menyimpan jadwal harian.');
    } finally {
      setSubmitting(false);
    }
  };

  const openEditModal = (rec: JadwalHarianRecord) => {
    setEditTarget(rec);
    setEditOutlet(rec.outlet);
    setEditPosisi(rec.posisiPenugasan);
    setEditJenis(rec.jenisPenugasan);
    setEditStatus(rec.statusJadwal === 'LIBUR' ? 'LIBUR' : 'DIJADWALKAN');
    setEditJamMasuk(rec.jamMasuk && rec.jamMasuk !== '-' ? rec.jamMasuk : '08:00');
    setEditJamPulang(rec.jamPulang && rec.jamPulang !== '-' ? rec.jamPulang : '20:00');
    setEditCatatan(rec.catatan || '');
    setEditConfirmDatang(false);
  };

  const submitEditSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTarget) return;
    setSubmitting(true);
    try {
      const res = await updateJadwalHarianApi({
        idJadwal: editTarget.idJadwal,
        outlet: editOutlet,
        posisiPenugasan: editPosisi,
        jenisPenugasan: editJenis,
        statusJadwal: editStatus,
        jamMasuk: editStatus === 'DIJADWALKAN' ? editJamMasuk : '-',
        jamPulang: editStatus === 'DIJADWALKAN' ? editJamPulang : '-',
        catatan: editCatatan,
        confirmAfterDatang: editConfirmDatang
      });
      if (res?.authRequired) {
        onRequireAuth();
        toast.error(res.message);
        return;
      }
      if (res?.requiresDatangConfirmation) {
        setEditConfirmDatang(true);
        return;
      }
      if (res?.status !== 'success') {
        throw new Error(res?.message || 'Gagal memperbarui jadwal.');
      }
      toast.success(res.message || 'Jadwal diperbarui.');
      setEditTarget(null);
      await loadData(selectedDate);
      onDataChanged?.();
    } catch (err: any) {
      toast.error(err?.message || 'Gagal memperbarui jadwal.');
    } finally {
      setSubmitting(false);
    }
  };

  const submitCancelSchedule = async () => {
    if (!cancelTarget) return;
    setSubmitting(true);
    try {
      const res = await cancelJadwalHarianApi({
        idJadwal: cancelTarget.idJadwal,
        alasan: cancelReason,
        confirmAfterDatang: cancelConfirmDatang
      });
      if (res?.authRequired) {
        onRequireAuth();
        toast.error(res.message);
        return;
      }
      if (res?.requiresDatangConfirmation) {
        setCancelConfirmDatang(true);
        return;
      }
      if (res?.status !== 'success') {
        throw new Error(res?.message || 'Gagal membatalkan jadwal.');
      }
      toast.success(res.message || 'Jadwal dibatalkan.');
      setCancelTarget(null);
      setCancelReason('');
      setCancelConfirmDatang(false);
      await loadData(selectedDate);
      onDataChanged?.();
    } catch (err: any) {
      toast.error(err?.message || 'Gagal membatalkan jadwal.');
    } finally {
      setSubmitting(false);
    }
  };

  const loadRotationHistory = async () => {
    setHistoryOpen(true);
    setHistoryLoading(true);
    try {
      const res = await fetchRiwayatRotasiApi({
        bulan: historyBulan,
        outlet: historyOutlet || undefined,
        nama: historyNama || undefined
      });
      if (res?.status === 'success') {
        setHistoryRows(Array.isArray(res.data) ? res.data : []);
      }
    } catch (err: any) {
      toast.error(err?.message || 'Gagal memuat riwayat rotasi.');
    } finally {
      setHistoryLoading(false);
    }
  };

  const filteredEffective = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return effectiveSchedules.filter((row) => {
      if (outletFilter !== 'ALL' && row.outlet !== outletFilter) return false;
      if (q && !row.nama.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [effectiveSchedules, outletFilter, searchQuery]);

  const filteredOverrides = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return jadwalRows.filter((row) => {
      if (outletFilter !== 'ALL' && row.outlet !== outletFilter) return false;
      if (q && !row.nama.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [jadwalRows, outletFilter, searchQuery]);

  const groupedByOutlet = useMemo(() => {
    const map: Record<string, KehadiranHarianRow[]> = {};
    filteredEffective.forEach((row) => {
      const key = row.outlet && row.outlet !== '-' ? row.outlet : 'Belum Ditempatkan';
      if (!map[key]) map[key] = [];
      map[key].push(row);
    });
    return Object.entries(map);
  }, [filteredEffective]);

  return (
    <div className="space-y-5">
      {/* Header & Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-neutral-100 pb-4">
        <div>
          <h2 className="text-lg font-bold text-neutral-800">Jadwal Dinamis, Admin Backup & Rotasi Outlet</h2>
          <p className="text-xs text-neutral-500 mt-0.5">
            Tugaskan Admin Backup, rotasi outlet sementara, atau jadwal khusus harian tanpa mengubah posisi permanen pegawai.
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
            onClick={() => openAddModal({ mode: 'DIJADWALKAN', jenis: 'BACKUP', posisiPenugasan: 'Admin' })}
            className="px-3 py-2 bg-[#cc0000] hover:bg-[#a30000] text-white text-xs font-bold rounded-lg transition inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            Tambah Penugasan / Backup
          </button>
          <button
            type="button"
            onClick={() => openAddModal({ mode: 'LIBUR', jenis: 'NORMAL' })}
            className="px-3 py-2 bg-neutral-800 hover:bg-neutral-900 text-white text-xs font-semibold rounded-lg transition inline-flex items-center gap-1.5 cursor-pointer"
          >
            <UserMinus className="w-3.5 h-3.5" />
            Tandai Libur
          </button>
          <button
            type="button"
            onClick={loadRotationHistory}
            className="px-3 py-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 text-xs font-semibold rounded-lg transition inline-flex items-center gap-1.5 cursor-pointer"
          >
            <History className="w-3.5 h-3.5" />
            Riwayat Rotasi
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

      {/* Outlet Readiness Alerts */}
      {!loading && alerts.length > 0 && (
        <div className="bg-amber-50/70 border border-amber-300 rounded-lg p-4 space-y-2.5">
          <div className="flex items-center gap-2 text-amber-900 font-bold text-xs uppercase tracking-wide">
            <ShieldAlert className="w-4 h-4 text-[#cc0000]" />
            <span>Peringatan Kesiapan Outlet ({alerts.length})</span>
          </div>
          <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
            {alerts.map((al, i) => (
              <div
                key={i}
                className={`flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 rounded-md border text-xs ${
                  al.severity === 'error'
                    ? 'bg-red-50 border-red-200 text-red-900'
                    : 'bg-white border-amber-200 text-amber-900'
                }`}
              >
                <div className="flex items-start gap-2">
                  <AlertTriangle className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${al.severity === 'error' ? 'text-red-600' : 'text-amber-600'}`} />
                  <span>{al.message}</span>
                </div>
                {(al.type === 'ADMIN_ABSENT_NO_BACKUP' || al.type === 'NO_ADMIN') && al.outlet && (
                  <button
                    type="button"
                    onClick={() =>
                      openAddModal({
                        mode: 'DIJADWALKAN',
                        outletName: al.outlet,
                        posisiPenugasan: 'Admin',
                        jenis: 'BACKUP'
                      })
                    }
                    className="shrink-0 px-2.5 py-1 bg-[#cc0000] hover:bg-[#a30000] text-white font-bold rounded text-[11px] cursor-pointer self-start sm:self-auto"
                  >
                    Tugaskan Admin Backup
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Unscheduled Employees Strip */}
      {!loading && unscheduledEmployees.length > 0 && (
        <div className="bg-neutral-50 border border-neutral-200 rounded-lg p-3.5">
          <p className="text-xs font-bold text-neutral-800 mb-2">
            Pegawai Belum Mendapat Penempatan / Jadwal Harian ({unscheduledEmployees.length})
          </p>
          <div className="flex flex-wrap gap-2">
            {unscheduledEmployees.map((u) => (
              <button
                key={u.nama}
                type="button"
                onClick={() =>
                  openAddModal({
                    mode: 'DIJADWALKAN',
                    empName: u.nama,
                    posisiPenugasan: 'Pickup',
                    jenis: 'NORMAL'
                  })
                }
                className="px-2.5 py-1.5 bg-white hover:bg-red-50 border border-neutral-300 hover:border-[#cc0000] rounded-md text-xs font-medium text-neutral-800 inline-flex items-center gap-1.5 transition cursor-pointer"
              >
                <span>{u.nama}</span>
                <span className="text-[10px] font-bold text-[#cc0000]">+ Atur</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Sub-view switcher & Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-neutral-50 p-3 rounded-lg border border-neutral-200">
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => setSubTab('efektif')}
            className={`px-3 py-1.5 rounded-md text-xs font-bold transition cursor-pointer ${
              subTab === 'efektif' ? 'bg-[#cc0000] text-white' : 'bg-white text-neutral-600 border border-neutral-200'
            }`}
          >
            Jadwal Efektif per Outlet
          </button>
          <button
            type="button"
            onClick={() => setSubTab('override')}
            className={`px-3 py-1.5 rounded-md text-xs font-bold transition cursor-pointer ${
              subTab === 'override' ? 'bg-[#cc0000] text-white' : 'bg-white text-neutral-600 border border-neutral-200'
            }`}
          >
            Penugasan JadwalHarian ({jadwalRows.length})
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari nama pegawai..."
            className="px-3 py-1.5 text-xs bg-white border border-neutral-300 rounded-md outline-none focus:ring-2 focus:ring-[#cc0000]"
          />
          <select
            value={outletFilter}
            onChange={(e) => setOutletFilter(e.target.value)}
            className="px-3 py-1.5 text-xs bg-white border border-neutral-300 rounded-md outline-none focus:ring-2 focus:ring-[#cc0000]"
          >
            <option value="ALL">Semua Outlet</option>
            {effectiveOutlets.map((o) => (
              <option key={o.nama} value={o.nama}>{o.nama}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="border border-neutral-200 rounded-lg p-6 space-y-3 animate-pulse">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 bg-neutral-100 rounded-md" />
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
      ) : subTab === 'efektif' ? (
        groupedByOutlet.length === 0 ? (
          <div className="p-8 text-center border border-neutral-200 rounded-lg text-sm text-neutral-500">
            Tidak ada jadwal efektif untuk filter yang dipilih.
          </div>
        ) : (
          <div className="space-y-4">
            {groupedByOutlet.map(([outletName, list]) => (
              <div key={outletName} className="border border-neutral-200 rounded-lg overflow-hidden bg-white">
                <div className="px-4 py-2.5 bg-neutral-50 border-b border-neutral-200 flex items-center justify-between">
                  <span className="font-bold text-xs text-neutral-800">{outletName}</span>
                  <span className="text-[11px] font-mono text-neutral-500">{list.length} pegawai</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-neutral-50/50 text-neutral-500 border-b border-neutral-100">
                      <tr>
                        <th className="px-4 py-2.5 font-semibold">Pegawai</th>
                        <th className="px-4 py-2.5 font-semibold">Posisi Permanen</th>
                        <th className="px-4 py-2.5 font-semibold">Posisi Penugasan</th>
                        <th className="px-4 py-2.5 font-semibold">Jenis</th>
                        <th className="px-4 py-2.5 font-semibold">Jam Efektif</th>
                        <th className="px-4 py-2.5 font-semibold">Sumber / Status</th>
                        <th className="px-4 py-2.5 font-semibold text-right">Aksi Cepat</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100">
                      {list.map((row) => (
                        <tr key={row.nama} className="hover:bg-neutral-50/60">
                          <td className="px-4 py-2.5 font-bold text-neutral-900">
                            {row.nama}
                            {row.hasScheduleConflict && (
                              <span className="ml-2 px-1.5 py-0.5 bg-red-100 text-red-700 rounded text-[10px] font-bold">
                                KONFLIK {row.statusKehadiran}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-neutral-600">{row.posisiPermanen || '-'}</td>
                          <td className="px-4 py-2.5 font-bold text-[#cc0000]">{row.posisiPenugasan || '-'}</td>
                          <td className="px-4 py-2.5">
                            <span className={`px-2 py-0.5 rounded border text-[10px] font-bold ${JENIS_BADGE_MAP[row.jenisPenugasan] || JENIS_BADGE_MAP.NORMAL}`}>
                              {row.jenisPenugasan}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 font-mono tabular-nums text-neutral-700">
                            {row.statusKehadiran === 'LIBUR' ? '-' : `${row.jamMasukJadwal} – ${row.jamPulangJadwal}`}
                          </td>
                          <td className="px-4 py-2.5">
                            <div className="text-[11px] font-semibold text-neutral-800">{row.statusKehadiran}</div>
                            <div className="text-[10px] text-neutral-400">{row.sumberJadwal}</div>
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            <div className="inline-flex gap-1.5">
                              <button
                                type="button"
                                onClick={() =>
                                  openAddModal({
                                    mode: 'DIJADWALKAN',
                                    empName: row.nama,
                                    outletName: outletName !== 'Belum Ditempatkan' ? outletName : undefined,
                                    posisiPenugasan: row.posisiPenugasan !== '-' ? row.posisiPenugasan : 'Admin',
                                    jenis: 'ROTASI'
                                  })
                                }
                                className="px-2 py-1 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 rounded text-[11px] font-semibold cursor-pointer"
                              >
                                Rotasi/Backup
                              </button>
                              <button
                                type="button"
                                onClick={() => openAddModal({ mode: 'LIBUR', empName: row.nama, jenis: 'NORMAL' })}
                                className="px-2 py-1 bg-neutral-100 hover:bg-amber-100 text-neutral-700 hover:text-amber-900 rounded text-[11px] font-semibold cursor-pointer"
                              >
                                Liburkan
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )
      ) : filteredOverrides.length === 0 ? (
        <div className="p-8 text-center border border-neutral-200 rounded-lg text-sm text-neutral-500">
          Belum ada penugasan khusus di sheet JadwalHarian untuk tanggal ini.
        </div>
      ) : (
        <div className="overflow-x-auto border border-neutral-200 rounded-lg bg-white">
          <table className="w-full text-xs text-left">
            <thead className="bg-neutral-50 text-neutral-500 border-b border-neutral-200">
              <tr>
                <th className="px-4 py-3 font-semibold">ID Jadwal</th>
                <th className="px-4 py-3 font-semibold">Pegawai</th>
                <th className="px-4 py-3 font-semibold">Outlet & Posisi</th>
                <th className="px-4 py-3 font-semibold">Jam</th>
                <th className="px-4 py-3 font-semibold">Jenis & Status</th>
                <th className="px-4 py-3 font-semibold">Catatan</th>
                <th className="px-4 py-3 font-semibold text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {filteredOverrides.map((j) => (
                <tr key={j.idJadwal} className="hover:bg-neutral-50/70">
                  <td className="px-4 py-3 font-mono text-[11px] text-neutral-500">{j.idJadwal}</td>
                  <td className="px-4 py-3">
                    <div className="font-bold text-neutral-900">{j.nama}</div>
                    <div className="text-[10px] text-neutral-500">Permanen: {j.posisiPermanen || '-'}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-neutral-800">{j.outlet}</div>
                    <div className="text-[11px] font-bold text-[#cc0000]">Tugas: {j.posisiPenugasan}</div>
                  </td>
                  <td className="px-4 py-3 font-mono tabular-nums text-neutral-700">
                    {j.statusJadwal === 'DIJADWALKAN' ? `${j.jamMasuk} – ${j.jamPulang}` : '-'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-1 items-start">
                      <span className={`px-2 py-0.5 rounded border text-[10px] font-bold ${JENIS_BADGE_MAP[j.jenisPenugasan]}`}>
                        {j.jenisPenugasan}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          j.statusJadwal === 'DIJADWALKAN'
                            ? 'bg-emerald-100 text-emerald-800'
                            : j.statusJadwal === 'LIBUR'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-neutral-200 text-neutral-600'
                        }`}
                      >
                        {j.statusJadwal}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-neutral-600 max-w-[180px] whitespace-normal">{j.catatan || '-'}</td>
                  <td className="px-4 py-3 text-right">
                    {j.statusJadwal !== 'DIBATALKAN' && (
                      <div className="inline-flex gap-1.5">
                        <button
                          type="button"
                          onClick={() => openEditModal(j)}
                          className="px-2.5 py-1 bg-neutral-100 hover:bg-neutral-200 text-neutral-800 font-semibold rounded cursor-pointer inline-flex items-center gap-1"
                        >
                          <Pencil className="w-3 h-3" /> Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setCancelTarget(j);
                            setCancelReason('');
                            setCancelConfirmDatang(false);
                          }}
                          className="px-2.5 py-1 bg-red-50 hover:bg-red-100 text-red-700 font-semibold rounded cursor-pointer"
                        >
                          Batalkan
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal Tambah Penugasan / Libur */}
      {addModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setAddModalOpen(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-neutral-200 flex items-center justify-between bg-neutral-50">
              <h3 className="font-bold text-neutral-900 text-base">
                {addMode === 'LIBUR' ? 'Tandai Pegawai Libur' : 'Tambah Penugasan / Backup / Rotasi'}
              </h3>
              <button type="button" onClick={() => setAddModalOpen(false)} className="p-1.5 text-neutral-500 hover:bg-neutral-200 rounded-md cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={submitAddSchedule} className="p-5 space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-neutral-700 mb-1">Pegawai (DataPegawai Aktif)</label>
                <select
                  value={formEmployeeName}
                  onChange={(e) => setFormEmployeeName(e.target.value)}
                  className="w-full p-2.5 border border-neutral-300 rounded-md bg-white"
                  required
                >
                  <option value="" disabled>Pilih Pegawai</option>
                  {employees.map((emp) => (
                    <option key={emp.idPegawai || emp.nama} value={emp.nama}>
                      {emp.nama} {emp.idPegawai ? `(${emp.idPegawai})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {addMode === 'DIJADWALKAN' && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block font-semibold text-neutral-700 mb-1">Jenis Penugasan</label>
                      <select
                        value={formJenisPenugasan}
                        onChange={(e) => setFormJenisPenugasan(e.target.value as JenisPenugasan)}
                        className="w-full p-2.5 border border-neutral-300 rounded-md bg-white font-semibold"
                      >
                        <option value="BACKUP">BACKUP (Admin Backup)</option>
                        <option value="ROTASI">ROTASI (Pindah Outlet Sementara)</option>
                        <option value="PENGGANTI">PENGGANTI</option>
                        <option value="NORMAL">NORMAL (Jadwal Khusus)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block font-semibold text-neutral-700 mb-1">Posisi Penugasan</label>
                      <select
                        value={formPosisiPenugasan}
                        onChange={(e) => handleFormPosisiChange(e.target.value)}
                        className="w-full p-2.5 border border-neutral-300 rounded-md bg-white font-semibold"
                      >
                        {effectivePositions.map((p) => (
                          <option key={p.name} value={p.name}>{p.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block font-semibold text-neutral-700 mb-1">Outlet Penugasan</label>
                    <select
                      value={formOutlet}
                      onChange={(e) => setFormOutlet(e.target.value)}
                      className="w-full p-2.5 border border-neutral-300 rounded-md bg-white"
                      required
                    >
                      <option value="" disabled>Pilih Outlet</option>
                      {effectiveOutlets.map((o) => (
                        <option key={o.nama} value={o.nama}>{o.nama}</option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block font-semibold text-neutral-700 mb-1">Jam Masuk Khusus</label>
                      <input
                        type="time"
                        value={formJamMasuk}
                        onChange={(e) => setFormJamMasuk(e.target.value)}
                        className="w-full p-2 border border-neutral-300 rounded-md font-mono"
                        required
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-neutral-700 mb-1">Jam Pulang Khusus</label>
                      <input
                        type="time"
                        value={formJamPulang}
                        onChange={(e) => setFormJamPulang(e.target.value)}
                        className="w-full p-2 border border-neutral-300 rounded-md font-mono"
                        required
                      />
                    </div>
                  </div>
                </>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-neutral-700 mb-1">Tanggal Mulai</label>
                  <input
                    type="date"
                    value={formTanggalMulai}
                    onChange={(e) => setFormTanggalMulai(e.target.value)}
                    className="w-full p-2 border border-neutral-300 rounded-md font-mono"
                    required
                  />
                </div>
                <div>
                  <label className="block font-semibold text-neutral-700 mb-1">Tanggal Akhir (Rentang)</label>
                  <input
                    type="date"
                    value={formTanggalAkhir}
                    onChange={(e) => setFormTanggalAkhir(e.target.value)}
                    className="w-full p-2 border border-neutral-300 rounded-md font-mono"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-neutral-700 mb-1">Catatan Penugasan</label>
                <input
                  type="text"
                  value={formCatatan}
                  onChange={(e) => setFormCatatan(e.target.value)}
                  placeholder="Contoh: Backup Admin libur / rotasi outlet..."
                  className="w-full p-2.5 border border-neutral-300 rounded-md"
                />
              </div>

              {pendingWarningMsg && (
                <div className="p-3 bg-amber-50 border border-amber-300 rounded-lg text-amber-900 space-y-2">
                  <p className="font-bold">Konfirmasi Diperlukan</p>
                  <p>{pendingWarningMsg}</p>
                  <p className="text-[11px] font-semibold">Klik Simpan Sekali Lagi untuk melanjutkan dengan konfirmasi ini.</p>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2 border-t border-neutral-100">
                <button
                  type="button"
                  onClick={() => setAddModalOpen(false)}
                  className="px-4 py-2 bg-neutral-100 text-neutral-700 font-semibold rounded-md cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-[#cc0000] hover:bg-[#a30000] text-white font-bold rounded-md cursor-pointer disabled:opacity-50"
                >
                  {submitting ? 'Menyimpan...' : pendingWarningMsg ? 'Konfirmasi & Simpan' : 'Simpan Jadwal'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Edit Jadwal */}
      {editTarget && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setEditTarget(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-5 space-y-4 text-xs" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-neutral-200 pb-3">
              <div>
                <h3 className="font-bold text-base text-neutral-900">Edit JadwalHarian</h3>
                <p className="text-neutral-500">{editTarget.nama} • {editTarget.tanggal}</p>
              </div>
              <button type="button" onClick={() => setEditTarget(null)} className="p-1 text-neutral-500 hover:bg-neutral-100 rounded cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={submitEditSchedule} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-neutral-700 mb-1">Status</label>
                  <select value={editStatus} onChange={(e) => setEditStatus(e.target.value as any)} className="w-full p-2 border border-neutral-300 rounded-md">
                    <option value="DIJADWALKAN">DIJADWALKAN</option>
                    <option value="LIBUR">LIBUR</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-neutral-700 mb-1">Jenis Penugasan</label>
                  <select value={editJenis} onChange={(e) => setEditJenis(e.target.value as JenisPenugasan)} className="w-full p-2 border border-neutral-300 rounded-md">
                    <option value="NORMAL">NORMAL</option>
                    <option value="BACKUP">BACKUP</option>
                    <option value="ROTASI">ROTASI</option>
                    <option value="PENGGANTI">PENGGANTI</option>
                  </select>
                </div>
              </div>
              {editStatus === 'DIJADWALKAN' && (
                <>
                  <div>
                    <label className="block font-semibold text-neutral-700 mb-1">Outlet</label>
                    <select value={editOutlet} onChange={(e) => setEditOutlet(e.target.value)} className="w-full p-2 border border-neutral-300 rounded-md">
                      {effectiveOutlets.map((o) => <option key={o.nama} value={o.nama}>{o.nama}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block font-semibold text-neutral-700 mb-1">Posisi Penugasan</label>
                    <select value={editPosisi} onChange={(e) => setEditPosisi(e.target.value)} className="w-full p-2 border border-neutral-300 rounded-md">
                      {effectivePositions.map((p) => <option key={p.name} value={p.name}>{p.name}</option>)}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block font-semibold text-neutral-700 mb-1">Jam Masuk</label>
                      <input type="time" value={editJamMasuk} onChange={(e) => setEditJamMasuk(e.target.value)} className="w-full p-2 border border-neutral-300 rounded-md font-mono" />
                    </div>
                    <div>
                      <label className="block font-semibold text-neutral-700 mb-1">Jam Pulang</label>
                      <input type="time" value={editJamPulang} onChange={(e) => setEditJamPulang(e.target.value)} className="w-full p-2 border border-neutral-300 rounded-md font-mono" />
                    </div>
                  </div>
                </>
              )}
              <div>
                <label className="block font-semibold text-neutral-700 mb-1">Catatan</label>
                <input type="text" value={editCatatan} onChange={(e) => setEditCatatan(e.target.value)} className="w-full p-2 border border-neutral-300 rounded-md" />
              </div>
              {editConfirmDatang && (
                <div className="p-3 bg-amber-50 border border-amber-300 rounded-md text-amber-900">
                  <p className="font-bold">Pegawai sudah absen DATANG</p>
                  <p className="mt-0.5">Snapshot transaksi saat DATANG tetap terjaga. Klik Simpan Ulang untuk melanjutkan perubahan jadwal.</p>
                </div>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setEditTarget(null)} className="px-3.5 py-2 bg-neutral-100 rounded-md font-semibold cursor-pointer">Batal</button>
                <button type="submit" disabled={submitting} className="px-4 py-2 bg-[#cc0000] text-white rounded-md font-bold cursor-pointer disabled:opacity-50">
                  {submitting ? 'Menyimpan...' : editConfirmDatang ? 'Konfirmasi & Simpan' : 'Simpan Perubahan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Cancel Jadwal */}
      {cancelTarget && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setCancelTarget(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-5 space-y-4 text-xs" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold text-base text-neutral-900">Batalkan JadwalHarian?</h3>
            <p className="text-neutral-600">
              Jadwal <strong>{cancelTarget.jenisPenugasan}</strong> untuk <strong>{cancelTarget.nama}</strong> pada {cancelTarget.tanggal} akan berstatus <strong>DIBATALKAN</strong>.
            </p>
            <div>
              <label className="block font-semibold text-neutral-700 mb-1">Alasan Pembatalan</label>
              <input
                type="text"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Opsional..."
                className="w-full p-2 border border-neutral-300 rounded-md"
              />
            </div>
            {cancelConfirmDatang && (
              <div className="p-3 bg-amber-50 border border-amber-300 rounded-md text-amber-900">
                Pegawai sudah absen DATANG hari ini. Tekan tombol merah lagi untuk memastikan pembatalan jadwal.
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setCancelTarget(null)} className="px-3.5 py-2 bg-neutral-100 rounded-md font-semibold cursor-pointer">Tutup</button>
              <button
                type="button"
                onClick={submitCancelSchedule}
                disabled={submitting}
                className="px-4 py-2 bg-red-600 text-white rounded-md font-bold cursor-pointer disabled:opacity-50"
              >
                {submitting ? 'Memproses...' : cancelConfirmDatang ? 'Konfirmasi Batalkan' : 'Ya, Batalkan Jadwal'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Riwayat Rotasi */}
      {historyOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setHistoryOpen(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-neutral-200 flex items-center justify-between bg-neutral-50">
              <h3 className="font-bold text-base text-neutral-900">Riwayat Rotasi & Admin Backup</h3>
              <button type="button" onClick={() => setHistoryOpen(false)} className="p-1.5 text-neutral-500 hover:bg-neutral-200 rounded-md cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 border-b border-neutral-200 flex flex-wrap gap-2 items-center bg-white">
              <input
                type="month"
                value={historyBulan}
                onChange={(e) => setHistoryBulan(e.target.value)}
                className="px-2.5 py-1.5 border border-neutral-300 rounded-md text-xs font-mono"
              />
              <select
                value={historyOutlet}
                onChange={(e) => setHistoryOutlet(e.target.value)}
                className="px-2.5 py-1.5 border border-neutral-300 rounded-md text-xs"
              >
                <option value="">Semua Outlet</option>
                {effectiveOutlets.map((o) => <option key={o.nama} value={o.nama}>{o.nama}</option>)}
              </select>
              <input
                type="text"
                value={historyNama}
                onChange={(e) => setHistoryNama(e.target.value)}
                placeholder="Nama pegawai..."
                className="px-2.5 py-1.5 border border-neutral-300 rounded-md text-xs"
              />
              <button
                type="button"
                onClick={loadRotationHistory}
                className="px-3 py-1.5 bg-[#cc0000] text-white font-bold text-xs rounded-md cursor-pointer"
              >
                Terapkan
              </button>
            </div>
            <div className="p-4 overflow-y-auto flex-1">
              {historyLoading ? (
                <div className="py-8 text-center text-xs text-neutral-500">Memuat riwayat rotasi...</div>
              ) : historyRows.length === 0 ? (
                <div className="py-8 text-center text-xs text-neutral-500">Belum ada riwayat rotasi pada periode ini.</div>
              ) : (
                <table className="w-full text-xs text-left">
                  <thead className="bg-neutral-50 text-neutral-500 border-b">
                    <tr>
                      <th className="px-3 py-2">Tanggal</th>
                      <th className="px-3 py-2">Pegawai</th>
                      <th className="px-3 py-2">Outlet & Posisi</th>
                      <th className="px-3 py-2">Jenis</th>
                      <th className="px-3 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {historyRows.map((r) => (
                      <tr key={r.idJadwal}>
                        <td className="px-3 py-2 font-mono">{r.tanggal}</td>
                        <td className="px-3 py-2 font-bold text-neutral-900">{r.nama}</td>
                        <td className="px-3 py-2">{r.outlet} • <strong className="text-[#cc0000]">{r.posisiPenugasan}</strong></td>
                        <td className="px-3 py-2 font-semibold">{r.jenisPenugasan}</td>
                        <td className="px-3 py-2">{r.statusJadwal}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
