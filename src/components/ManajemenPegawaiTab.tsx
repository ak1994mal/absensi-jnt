import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Clock,
  History,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  UserCheck,
  UserX,
  X
} from 'lucide-react';
import { toast } from 'sonner';
import {
  fetchDataPenempatanApi,
  fetchRiwayatPenempatanApi,
  savePenempatanApi
} from '../api';
import {
  ALL_DAYS,
  DayCode,
  DEFAULT_WORK_DAYS,
  PegawaiWithPenempatan,
  PenempatanRecord
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

interface ManajemenPegawaiTabProps {
  outlets: OutletOption[];
  positions: PositionOption[];
  todayYmd: string;
  onRequireAuth: () => void;
  onDataChanged?: () => void;
}

function formatWorkDaysShort(days?: DayCode[]): string {
  if (!days || days.length === 0) return '-';
  if (days.length === 7) return 'Setiap Hari';
  const monToSat = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  if (days.length === 6 && monToSat.every((d) => days.includes(d as DayCode))) {
    return 'Sen – Sab';
  }
  const monToFri = ['MON', 'TUE', 'WED', 'THU', 'FRI'];
  if (days.length === 5 && monToFri.every((d) => days.includes(d as DayCode))) {
    return 'Sen – Jum';
  }
  return days
    .map((d) => ALL_DAYS.find((x) => x.code === d)?.short || d)
    .join(', ');
}

function formatYmdToDmy(ymd?: string): string {
  if (!ymd) return '-';
  const m = String(ymd).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  return ymd;
}

export default function ManajemenPegawaiTab({
  outlets: propOutlets,
  positions: propPositions,
  todayYmd,
  onRequireAuth,
  onDataChanged
}: ManajemenPegawaiTabProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [employees, setEmployees] = useState<PegawaiWithPenempatan[]>([]);
  const [apiOutlets, setApiOutlets] = useState<OutletOption[]>([]);
  const [apiPositions, setApiPositions] = useState<PositionOption[]>([]);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [outletFilter, setOutletFilter] = useState('ALL');
  const [posisiFilter, setPosisiFilter] = useState('ALL');
  const [placementFilter, setPlacementFilter] = useState<'ALL' | 'ASSIGNED' | 'UNASSIGNED'>('ALL');

  // Edit / Assign modal state
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [selectedEmp, setSelectedEmp] = useState<PegawaiWithPenempatan | null>(null);
  const [formOutlet, setFormOutlet] = useState('');
  const [formPosisi, setFormPosisi] = useState('');
  const [formJamMasuk, setFormJamMasuk] = useState('08:00');
  const [formJamPulang, setFormJamPulang] = useState('20:00');
  const [formHariKerja, setFormHariKerja] = useState<DayCode[]>(DEFAULT_WORK_DAYS);
  const [formTanggalMulai, setFormTanggalMulai] = useState(todayYmd);
  const [formTanggalAkhir, setFormTanggalAkhir] = useState('');
  const [replaceSameStart, setReplaceSameStart] = useState(false);
  const [confirmSaveOpen, setConfirmSaveOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // History modal
  const [historyModalEmp, setHistoryModalEmp] = useState<PegawaiWithPenempatan | null>(null);
  const [historyRows, setHistoryRows] = useState<PenempatanRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');

  // Deactivate modal
  const [deactivateTarget, setDeactivateTarget] = useState<PegawaiWithPenempatan | null>(null);
  const [deactivateDate, setDeactivateDate] = useState(todayYmd);

  const effectiveOutlets = apiOutlets.length > 0 ? apiOutlets : propOutlets;
  const effectivePositions = apiPositions.length > 0 ? apiPositions : propPositions;

  const loadData = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetchDataPenempatanApi();
      if (res?.status === 'success') {
        setEmployees(Array.isArray(res.data) ? res.data : []);
        if (Array.isArray(res.outlets) && res.outlets.length > 0) setApiOutlets(res.outlets);
        if (Array.isArray(res.positions) && res.positions.length > 0) setApiPositions(res.positions);
      } else {
        throw new Error(res?.message || 'Gagal memuat data penempatan pegawai.');
      }
    } catch (err: any) {
      setError(err?.message || 'Gagal memuat data penempatan.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const stats = useMemo(() => {
    const total = employees.length;
    const assigned = employees.filter((e) => e.hasPlacement).length;
    const unassigned = total - assigned;
    const missingId = employees.filter((e) => e.missingId).length;
    const duplicateName = employees.filter((e) => e.duplicateName).length;
    return { total, assigned, unassigned, missingId, duplicateName };
  }, [employees]);

  const filteredEmployees = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return employees.filter((emp) => {
      if (q) {
        const matchName = emp.nama.toLowerCase().includes(q);
        const matchId = (emp.idPegawai || '').toLowerCase().includes(q);
        if (!matchName && !matchId) return false;
      }
      if (placementFilter === 'ASSIGNED' && !emp.hasPlacement) return false;
      if (placementFilter === 'UNASSIGNED' && emp.hasPlacement) return false;

      const empOutlet = emp.penempatanAktif?.outlet || '';
      if (outletFilter !== 'ALL' && empOutlet !== outletFilter) return false;

      const empPosisi = emp.penempatanAktif?.posisi || '';
      if (posisiFilter !== 'ALL' && empPosisi !== posisiFilter) return false;

      return true;
    });
  }, [employees, searchQuery, placementFilter, outletFilter, posisiFilter]);

  const openEditModal = (emp: PegawaiWithPenempatan) => {
    setSelectedEmp(emp);
    const active = emp.penempatanAktif;
    const defaultOutlet = active?.outlet || (effectiveOutlets[0]?.nama || '');
    const defaultPos = active?.posisi || (effectivePositions[0]?.name || '');
    const posCfg = effectivePositions.find((p) => p.name.toLowerCase() === defaultPos.toLowerCase());

    setFormOutlet(defaultOutlet);
    setFormPosisi(defaultPos);
    setFormJamMasuk(active?.jamMasuk || posCfg?.jamMasuk || '08:00');
    setFormJamPulang(active?.jamPulang || posCfg?.jamPulang || '20:00');
    setFormHariKerja(
      active?.hariKerja && active.hariKerja.length > 0 ? active.hariKerja : [...DEFAULT_WORK_DAYS]
    );
    setFormTanggalMulai(todayYmd);
    setFormTanggalAkhir('');
    setReplaceSameStart(false);
    setConfirmSaveOpen(false);
    setEditModalOpen(true);
  };

  const handlePosisiChange = (nextPos: string) => {
    setFormPosisi(nextPos);
    const cfg = effectivePositions.find((p) => p.name.toLowerCase() === nextPos.toLowerCase());
    if (cfg) {
      setFormJamMasuk(cfg.jamMasuk || '08:00');
      setFormJamPulang(cfg.jamPulang || '20:00');
    }
  };

  const toggleWorkDay = (code: DayCode) => {
    setFormHariKerja((prev) => {
      if (prev.includes(code)) {
        if (prev.length === 1) {
          toast.error('Minimal harus memilih 1 hari kerja.');
          return prev;
        }
        return prev.filter((d) => d !== code);
      }
      return [...prev, code];
    });
  };

  const handleRequestSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmp) return;
    if (!formOutlet) return toast.error('Pilih Outlet penempatan terlebih dahulu.');
    if (!formPosisi) return toast.error('Pilih Posisi terlebih dahulu.');
    if (!formJamMasuk || !formJamPulang || formJamMasuk === formJamPulang) {
      return toast.error('Jam Masuk dan Jam Pulang harus valid dan tidak boleh sama.');
    }
    if (!formTanggalMulai) return toast.error('Tanggal Mulai Berlaku wajib diisi.');
    if (formTanggalAkhir && formTanggalAkhir < formTanggalMulai) {
      return toast.error('Tanggal Akhir Berlaku tidak boleh lebih awal dari Tanggal Mulai.');
    }
    setConfirmSaveOpen(true);
  };

  const handleConfirmSave = async () => {
    if (!selectedEmp) return;
    setSubmitting(true);
    try {
      const res = await savePenempatanApi({
        idPegawai: selectedEmp.idPegawai,
        nama: selectedEmp.nama,
        outlet: formOutlet,
        posisi: formPosisi,
        jamMasuk: formJamMasuk,
        jamPulang: formJamPulang,
        hariKerja: formHariKerja,
        tanggalMulai: formTanggalMulai,
        tanggalAkhir: formTanggalAkhir || '',
        replaceSameStart
      });
      if (res?.authRequired) {
        onRequireAuth();
        toast.error(res.message || 'Sesi Owner berakhir. Silakan login ulang.');
        return;
      }
      if (res?.status !== 'success') {
        throw new Error(res?.message || 'Gagal menyimpan penempatan.');
      }
      toast.success(res.message || 'Penempatan berhasil disimpan.');
      setEditModalOpen(false);
      setConfirmSaveOpen(false);
      await loadData();
      onDataChanged?.();
    } catch (err: any) {
      toast.error(err?.message || 'Gagal menyimpan penempatan.');
      setConfirmSaveOpen(false);
    } finally {
      setSubmitting(false);
    }
  };

  const openHistoryModal = async (emp: PegawaiWithPenempatan) => {
    setHistoryModalEmp(emp);
    setHistoryRows([]);
    setHistoryError('');
    setHistoryLoading(true);
    try {
      const res = await fetchRiwayatPenempatanApi(emp.idPegawai, emp.nama);
      if (res?.status === 'success') {
        setHistoryRows(Array.isArray(res.data) ? res.data : []);
      } else {
        throw new Error(res?.message || 'Gagal memuat riwayat penempatan.');
      }
    } catch (err: any) {
      setHistoryError(err?.message || 'Gagal memuat riwayat penempatan.');
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleConfirmDeactivate = async () => {
    if (!deactivateTarget?.penempatanAktif?.rowIndex) return;
    setSubmitting(true);
    try {
      const res = await savePenempatanApi({
        actionMode: 'deactivate',
        rowIndex: deactivateTarget.penempatanAktif.rowIndex,
        idPegawai: deactivateTarget.idPegawai,
        nama: deactivateTarget.nama,
        tanggalAkhir: deactivateDate
      });
      if (res?.authRequired) {
        onRequireAuth();
        toast.error(res.message || 'Sesi Owner berakhir.');
        return;
      }
      if (res?.status !== 'success') {
        throw new Error(res?.message || 'Gagal menonaktifkan penempatan.');
      }
      toast.success(res.message || 'Penempatan dinonaktifkan.');
      setDeactivateTarget(null);
      await loadData();
      onDataChanged?.();
    } catch (err: any) {
      toast.error(err?.message || 'Gagal menonaktifkan penempatan.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-neutral-100 pb-4">
        <div>
          <h2 className="text-lg font-bold text-neutral-800">Manajemen Penempatan Pegawai</h2>
          <p className="text-xs text-neutral-500 mt-0.5">
            Atur outlet permanen, posisi default, jam kerja individual, dan hari kerja aktif seluruh pegawai.
          </p>
        </div>
        <button
          type="button"
          onClick={loadData}
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 px-3.5 py-2 text-xs font-semibold text-neutral-700 bg-neutral-100 hover:bg-neutral-200 rounded-lg transition cursor-pointer disabled:opacity-50 self-start sm:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Muat Ulang
        </button>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-neutral-50 border border-neutral-200 rounded-lg p-3.5">
          <p className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wide">Pegawai Aktif</p>
          <p className="text-2xl font-bold text-neutral-900 font-mono tabular-nums mt-1">{stats.total}</p>
        </div>
        <div className="bg-emerald-50/70 border border-emerald-200 rounded-lg p-3.5">
          <p className="text-[11px] font-semibold text-emerald-700 uppercase tracking-wide">Sudah Ditempatkan</p>
          <p className="text-2xl font-bold text-emerald-800 font-mono tabular-nums mt-1">{stats.assigned}</p>
        </div>
        <div className="bg-amber-50/70 border border-amber-200 rounded-lg p-3.5">
          <p className="text-[11px] font-semibold text-amber-800 uppercase tracking-wide">Belum Ada Penempatan</p>
          <p className="text-2xl font-bold text-amber-900 font-mono tabular-nums mt-1">{stats.unassigned}</p>
        </div>
        <div className="bg-white border border-neutral-200 rounded-lg p-3.5">
          <p className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wide">Peringatan Data ID</p>
          <p className="text-2xl font-bold text-neutral-800 font-mono tabular-nums mt-1">
            {stats.missingId + stats.duplicateName}
          </p>
        </div>
      </div>

      {/* Warning banner for missing ID / duplicate name */}
      {(stats.missingId > 0 || stats.duplicateName > 0) && (
        <div className="p-3.5 bg-amber-50 border border-amber-300 rounded-lg flex items-start gap-2.5 text-xs text-amber-900">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold">Integritas Identitas DataPegawai</p>
            <p className="mt-0.5 leading-relaxed">
              {stats.missingId > 0 && `${stats.missingId} pegawai belum memiliki ID Pegawai di sheet DataPegawai (Kolom A). `}
              {stats.duplicateName > 0 && `${stats.duplicateName} pegawai terdeteksi memiliki nama duplikat. `}
              Lengkapi ID Pegawai unik di sheet DataPegawai agar penempatan tidak tertukar.
            </p>
          </div>
        </div>
      )}

      {/* Filter Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 bg-neutral-50 p-3 rounded-lg border border-neutral-200">
        <div className="relative">
          <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari nama atau ID pegawai..."
            className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-neutral-300 rounded-md focus:ring-2 focus:ring-[#cc0000] outline-none"
          />
        </div>
        <select
          value={outletFilter}
          onChange={(e) => setOutletFilter(e.target.value)}
          className="px-3 py-2 text-xs bg-white border border-neutral-300 rounded-md focus:ring-2 focus:ring-[#cc0000] outline-none"
        >
          <option value="ALL">Semua Outlet</option>
          {effectiveOutlets.map((o) => (
            <option key={o.nama} value={o.nama}>{o.nama}</option>
          ))}
        </select>
        <select
          value={posisiFilter}
          onChange={(e) => setPosisiFilter(e.target.value)}
          className="px-3 py-2 text-xs bg-white border border-neutral-300 rounded-md focus:ring-2 focus:ring-[#cc0000] outline-none"
        >
          <option value="ALL">Semua Posisi</option>
          {effectivePositions.map((p) => (
            <option key={p.name} value={p.name}>{p.name}</option>
          ))}
        </select>
        <select
          value={placementFilter}
          onChange={(e) => setPlacementFilter(e.target.value as any)}
          className="px-3 py-2 text-xs bg-white border border-neutral-300 rounded-md focus:ring-2 focus:ring-[#cc0000] outline-none"
        >
          <option value="ALL">Semua Status Penempatan</option>
          <option value="ASSIGNED">Sudah Ditempatkan</option>
          <option value="UNASSIGNED">Belum Ada Penempatan</option>
        </select>
      </div>

      {/* Main Content */}
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
            onClick={loadData}
            className="px-4 py-2 bg-[#cc0000] text-white text-xs font-bold rounded-lg hover:bg-[#a30000] transition cursor-pointer"
          >
            Coba Lagi
          </button>
        </div>
      ) : filteredEmployees.length === 0 ? (
        <div className="p-8 text-center border border-neutral-200 rounded-lg text-sm text-neutral-500">
          Tidak ada pegawai yang sesuai dengan filter saat ini.
        </div>
      ) : (
        <>
          {/* Desktop Table */}
          <div className="hidden md:block overflow-x-auto border border-neutral-200 rounded-lg bg-white">
            <table className="w-full text-xs text-left">
              <thead className="bg-neutral-50 text-neutral-500 uppercase border-b border-neutral-200">
                <tr>
                  <th className="px-4 py-3 font-semibold">Pegawai</th>
                  <th className="px-4 py-3 font-semibold">Outlet Permanen</th>
                  <th className="px-4 py-3 font-semibold">Posisi</th>
                  <th className="px-4 py-3 font-semibold">Jam Kerja</th>
                  <th className="px-4 py-3 font-semibold">Hari Kerja</th>
                  <th className="px-4 py-3 font-semibold">Berlaku</th>
                  <th className="px-4 py-3 font-semibold text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {filteredEmployees.map((emp, idx) => {
                  const p = emp.penempatanAktif;
                  return (
                    <tr key={emp.idPegawai || `${emp.nama}-${idx}`} className="hover:bg-neutral-50/70">
                      <td className="px-4 py-3 align-top">
                        <div className="font-bold text-neutral-900">{emp.nama}</div>
                        <div className="text-[11px] text-neutral-500 font-mono mt-0.5 flex flex-wrap items-center gap-1.5">
                          <span>ID: {emp.idPegawai || 'Kosong'}</span>
                          {emp.missingId && (
                            <span className="px-1.5 py-0.5 bg-amber-100 text-amber-800 rounded font-sans font-semibold text-[10px]">
                              ID Belum Ada
                            </span>
                          )}
                          {emp.duplicateName && (
                            <span className="px-1.5 py-0.5 bg-red-100 text-red-700 rounded font-sans font-semibold text-[10px]">
                              Nama Duplikat
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 align-top">
                        {p ? (
                          <span className="font-medium text-neutral-800">{p.outlet}</span>
                        ) : (
                          <span className="inline-block px-2 py-0.5 bg-amber-50 text-amber-800 border border-amber-200 rounded font-semibold text-[11px]">
                            Belum Ada Penempatan
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 align-top">
                        {p ? (
                          <span className="font-bold text-[#cc0000]">{p.posisi}</span>
                        ) : (
                          <span className="text-neutral-400">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 align-top font-mono tabular-nums text-neutral-700">
                        {p ? `${p.jamMasuk} – ${p.jamPulang}` : '-'}
                      </td>
                      <td className="px-4 py-3 align-top text-neutral-700">
                        {p ? formatWorkDaysShort(p.hariKerja) : '-'}
                      </td>
                      <td className="px-4 py-3 align-top font-mono tabular-nums text-neutral-600">
                        {p ? (
                          <div>
                            <div>{formatYmdToDmy(p.tanggalMulai)}</div>
                            <div className="text-[10px] text-neutral-400">
                              {p.tanggalAkhir ? `s.d. ${formatYmdToDmy(p.tanggalAkhir)}` : 'Aktif'}
                            </div>
                          </div>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td className="px-4 py-3 align-top text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => openEditModal(emp)}
                            className="px-2.5 py-1.5 bg-[#cc0000] hover:bg-[#a30000] text-white font-semibold rounded-md transition inline-flex items-center gap-1 cursor-pointer"
                          >
                            {p ? <Pencil className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
                            <span>{p ? 'Ubah' : 'Atur'}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => openHistoryModal(emp)}
                            className="px-2.5 py-1.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-semibold rounded-md transition inline-flex items-center gap-1 cursor-pointer"
                            title="Riwayat Penempatan"
                          >
                            <History className="w-3 h-3" />
                            <span>Riwayat</span>
                          </button>
                          {p?.rowIndex && (
                            <button
                              type="button"
                              onClick={() => {
                                setDeactivateTarget(emp);
                                setDeactivateDate(todayYmd);
                              }}
                              className="p-1.5 text-neutral-500 hover:text-red-700 hover:bg-red-50 rounded-md transition cursor-pointer"
                              title="Nonaktifkan Penempatan"
                            >
                              <UserX className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Card List */}
          <div className="md:hidden space-y-3">
            {filteredEmployees.map((emp, idx) => {
              const p = emp.penempatanAktif;
              return (
                <div key={emp.idPegawai || `${emp.nama}-${idx}`} className="bg-white border border-neutral-200 rounded-lg p-3.5 space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-bold text-sm text-neutral-900">{emp.nama}</p>
                      <p className="text-[11px] font-mono text-neutral-500">ID: {emp.idPegawai || 'Kosong'}</p>
                    </div>
                    {p ? (
                      <span className="px-2 py-0.5 bg-red-50 text-[#cc0000] border border-red-100 rounded text-[11px] font-bold">
                        {p.posisi}
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 bg-amber-50 text-amber-800 border border-amber-200 rounded text-[11px] font-semibold">
                        Belum Ditempatkan
                      </span>
                    )}
                  </div>
                  {p && (
                    <div className="grid grid-cols-2 gap-2 bg-neutral-50 p-2.5 rounded border border-neutral-100 text-xs">
                      <div className="col-span-2">
                        <span className="text-[10px] text-neutral-500 block">Outlet Permanen</span>
                        <span className="font-semibold text-neutral-800">{p.outlet}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-neutral-500 block">Jam Kerja</span>
                        <span className="font-mono font-semibold text-neutral-800">{p.jamMasuk} – {p.jamPulang}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-neutral-500 block">Hari Kerja</span>
                        <span className="font-medium text-neutral-800">{formatWorkDaysShort(p.hariKerja)}</span>
                      </div>
                    </div>
                  )}
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => openEditModal(emp)}
                      className="flex-1 py-2 bg-[#cc0000] text-white text-xs font-bold rounded-md cursor-pointer"
                    >
                      {p ? 'Ubah Penempatan' : 'Atur Penempatan'}
                    </button>
                    <button
                      type="button"
                      onClick={() => openHistoryModal(emp)}
                      className="px-3 py-2 bg-neutral-100 text-neutral-700 text-xs font-semibold rounded-md cursor-pointer"
                    >
                      Riwayat
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Modal Tambah / Ubah Penempatan */}
      {editModalOpen && selectedEmp && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setEditModalOpen(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-neutral-200 flex items-center justify-between bg-neutral-50">
              <div>
                <h3 className="font-bold text-neutral-900 text-base">
                  {selectedEmp.penempatanAktif ? 'Ubah Penempatan Pegawai' : 'Atur Penempatan Baru'}
                </h3>
                <p className="text-xs text-neutral-500 mt-0.5">
                  {selectedEmp.nama} {selectedEmp.idPegawai ? `(${selectedEmp.idPegawai})` : ''}
                </p>
              </div>
              <button type="button" onClick={() => setEditModalOpen(false)} className="p-1.5 text-neutral-500 hover:bg-neutral-200 rounded-md cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleRequestSave} className="p-5 space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-neutral-700 mb-1">Outlet Penempatan</label>
                <select
                  value={formOutlet}
                  onChange={(e) => setFormOutlet(e.target.value)}
                  className="w-full p-2.5 border border-neutral-300 rounded-md bg-white focus:ring-2 focus:ring-[#cc0000] outline-none"
                  required
                >
                  <option value="" disabled>Pilih Outlet</option>
                  {effectiveOutlets.map((o) => (
                    <option key={o.nama} value={o.nama}>{o.nama}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-neutral-700 mb-1">Posisi Permanen</label>
                <select
                  value={formPosisi}
                  onChange={(e) => handlePosisiChange(e.target.value)}
                  className="w-full p-2.5 border border-neutral-300 rounded-md bg-white focus:ring-2 focus:ring-[#cc0000] outline-none"
                  required
                >
                  <option value="" disabled>Pilih Posisi</option>
                  {effectivePositions.map((p) => (
                    <option key={p.name} value={p.name}>{p.name} ({p.jamMasuk} - {p.jamPulang})</option>
                  ))}
                </select>
                <p className="text-[11px] text-neutral-500 mt-1">
                  Jam kerja terisi otomatis sesuai master DataPosisi, dan dapat disesuaikan khusus untuk pegawai ini.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-neutral-700 mb-1">Jam Masuk Individual</label>
                  <input
                    type="time"
                    value={formJamMasuk}
                    onChange={(e) => setFormJamMasuk(e.target.value)}
                    className="w-full p-2 border border-neutral-300 rounded-md font-mono"
                    required
                  />
                </div>
                <div>
                  <label className="block font-semibold text-neutral-700 mb-1">Jam Pulang Individual</label>
                  <input
                    type="time"
                    value={formJamPulang}
                    onChange={(e) => setFormJamPulang(e.target.value)}
                    className="w-full p-2 border border-neutral-300 rounded-md font-mono"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-neutral-700 mb-1.5">Hari Kerja Aktif (Default Sen – Sab)</label>
                <div className="grid grid-cols-7 gap-1.5">
                  {ALL_DAYS.map((day) => {
                    const active = formHariKerja.includes(day.code);
                    return (
                      <button
                        key={day.code}
                        type="button"
                        onClick={() => toggleWorkDay(day.code)}
                        className={`py-2 rounded-md font-bold border text-center transition cursor-pointer ${
                          active
                            ? 'bg-[#cc0000] text-white border-[#cc0000]'
                            : 'bg-neutral-50 text-neutral-600 border-neutral-200 hover:bg-neutral-100'
                        }`}
                      >
                        {day.short}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-neutral-700 mb-1">Tanggal Mulai Berlaku</label>
                  <input
                    type="date"
                    value={formTanggalMulai}
                    onChange={(e) => setFormTanggalMulai(e.target.value)}
                    className="w-full p-2 border border-neutral-300 rounded-md font-mono"
                    required
                  />
                </div>
                <div>
                  <label className="block font-semibold text-neutral-700 mb-1">Tanggal Akhir (Opsional)</label>
                  <input
                    type="date"
                    value={formTanggalAkhir}
                    onChange={(e) => setFormTanggalAkhir(e.target.value)}
                    className="w-full p-2 border border-neutral-300 rounded-md font-mono"
                  />
                </div>
              </div>

              {selectedEmp.penempatanAktif && (
                <label className="flex items-start gap-2 bg-neutral-50 p-2.5 rounded border border-neutral-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={replaceSameStart}
                    onChange={(e) => setReplaceSameStart(e.target.checked)}
                    className="mt-0.5 accent-[#cc0000]"
                  />
                  <span className="text-[11px] text-neutral-700">
                    Timpa jika sudah ada penempatan dengan Tanggal Mulai yang sama persis ({formatYmdToDmy(formTanggalMulai)}).
                  </span>
                </label>
              )}

              {confirmSaveOpen ? (
                <div className="p-3.5 bg-amber-50 border border-amber-300 rounded-lg space-y-2.5">
                  <p className="font-bold text-amber-900">Konfirmasi Simpan Penempatan</p>
                  <p className="text-amber-800 leading-relaxed">
                    Pegawai <strong>{selectedEmp.nama}</strong> akan ditempatkan permanen di <strong>{formOutlet}</strong> sebagai <strong>{formPosisi}</strong> ({formJamMasuk} – {formJamPulang}) mulai {formatYmdToDmy(formTanggalMulai)}. Penempatan aktif sebelumnya (jika ada) akan ditutup otomatis H-1 tanpa menghapus histori.
                  </p>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setConfirmSaveOpen(false)}
                      disabled={submitting}
                      className="px-3 py-1.5 bg-white border border-neutral-300 text-neutral-700 font-semibold rounded-md cursor-pointer"
                    >
                      Periksa Lagi
                    </button>
                    <button
                      type="button"
                      onClick={handleConfirmSave}
                      disabled={submitting}
                      className="px-3.5 py-1.5 bg-[#cc0000] hover:bg-[#a30000] text-white font-bold rounded-md cursor-pointer disabled:opacity-50"
                    >
                      {submitting ? 'Menyimpan...' : 'Ya, Simpan Penempatan'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex justify-end gap-2 pt-2 border-t border-neutral-100">
                  <button
                    type="button"
                    onClick={() => setEditModalOpen(false)}
                    className="px-4 py-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-semibold rounded-md cursor-pointer"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-[#cc0000] hover:bg-[#a30000] text-white font-bold rounded-md cursor-pointer inline-flex items-center gap-1.5"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Simpan Penempatan
                  </button>
                </div>
              )}
            </form>
          </div>
        </div>
      )}

      {/* Modal Riwayat Penempatan */}
      {historyModalEmp && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setHistoryModalEmp(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-neutral-200 flex items-center justify-between bg-neutral-50">
              <div>
                <h3 className="font-bold text-neutral-900 text-base">Riwayat Penempatan Pegawai</h3>
                <p className="text-xs text-neutral-500">{historyModalEmp.nama} {historyModalEmp.idPegawai ? `(${historyModalEmp.idPegawai})` : ''}</p>
              </div>
              <button type="button" onClick={() => setHistoryModalEmp(null)} className="p-1.5 text-neutral-500 hover:bg-neutral-200 rounded-md cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 overflow-y-auto flex-1">
              {historyLoading ? (
                <div className="py-8 text-center text-xs text-neutral-500">Memuat riwayat penempatan...</div>
              ) : historyError ? (
                <div className="p-4 bg-red-50 text-red-700 text-xs rounded-lg">{historyError}</div>
              ) : historyRows.length === 0 ? (
                <div className="py-8 text-center text-xs text-neutral-500">Belum ada riwayat penempatan di sheet DataPenempatan.</div>
              ) : (
                <div className="space-y-2.5">
                  {historyRows.map((h, i) => (
                    <div key={i} className="border border-neutral-200 rounded-lg p-3.5 text-xs bg-white">
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2">
                          <Building2 className="w-3.5 h-3.5 text-[#cc0000]" />
                          <span className="font-bold text-neutral-900">{h.outlet}</span>
                          <span className="font-bold text-[#cc0000]">• {h.posisi}</span>
                        </div>
                        <span className={`px-2 py-0.5 rounded font-bold text-[10px] ${h.status === 'AKTIF' ? 'bg-emerald-100 text-emerald-800' : 'bg-neutral-100 text-neutral-600'}`}>
                          {h.status}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px] text-neutral-600">
                        <div>Jam: <span className="font-mono font-semibold text-neutral-800">{h.jamMasuk} – {h.jamPulang}</span></div>
                        <div>Hari: <span className="font-medium text-neutral-800">{formatWorkDaysShort(h.hariKerja)}</span></div>
                        <div>Berlaku: <span className="font-mono">{formatYmdToDmy(h.tanggalMulai)} s.d. {h.tanggalAkhir ? formatYmdToDmy(h.tanggalAkhir) : 'Sekarang'}</span></div>
                      </div>
                      {(h.updatedAt || h.updatedBy) && (
                        <div className="mt-2 pt-2 border-t border-neutral-100 text-[10px] text-neutral-400">
                          Diperbarui oleh {h.updatedBy || 'Owner'} pada {h.updatedAt || '-'}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal Konfirmasi Nonaktifkan */}
      {deactivateTarget && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setDeactivateTarget(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-5 space-y-4 text-xs" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold text-base text-neutral-900">Nonaktifkan Penempatan?</h3>
            <p className="text-neutral-600 leading-relaxed">
              Penempatan aktif <strong>{deactivateTarget.nama}</strong> di <strong>{deactivateTarget.penempatanAktif?.outlet}</strong> akan ditutup dan statusnya menjadi <strong>NONAKTIF</strong>. Data absensi masa lalu tidak berubah.
            </p>
            <div>
              <label className="block font-semibold text-neutral-700 mb-1">Tanggal Akhir Berlaku</label>
              <input
                type="date"
                value={deactivateDate}
                onChange={(e) => setDeactivateDate(e.target.value)}
                className="w-full p-2 border border-neutral-300 rounded-md font-mono"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeactivateTarget(null)}
                className="px-3.5 py-2 bg-neutral-100 text-neutral-700 font-semibold rounded-md cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmDeactivate}
                disabled={submitting}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-bold rounded-md cursor-pointer disabled:opacity-50"
              >
                {submitting ? 'Memproses...' : 'Ya, Nonaktifkan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
