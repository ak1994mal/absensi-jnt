export type DayCode = 'MON' | 'TUE' | 'WED' | 'THU' | 'FRI' | 'SAT' | 'SUN';

export const ALL_DAYS: { code: DayCode; label: string; short: string }[] = [
  { code: 'MON', label: 'Senin', short: 'Sen' },
  { code: 'TUE', label: 'Selasa', short: 'Sel' },
  { code: 'WED', label: 'Rabu', short: 'Rab' },
  { code: 'THU', label: 'Kamis', short: 'Kam' },
  { code: 'FRI', label: 'Jumat', short: 'Jum' },
  { code: 'SAT', label: 'Sabtu', short: 'Sab' },
  { code: 'SUN', label: 'Minggu', short: 'Min' }
];

export const DEFAULT_WORK_DAYS: DayCode[] = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

export interface PegawaiSafe {
  idPegawai: string;
  nama: string;
  email?: string;
  noTelepon?: string;
  tanggalAktif?: string;
  tanggalNonAktif?: string;
  status: string;
  missingId: boolean;
  duplicateName: boolean;
}

export interface PenempatanRecord {
  rowIndex?: number;
  idPegawai: string;
  nama: string;
  outlet: string;
  posisi: string;
  jamMasuk: string;
  jamPulang: string;
  hariKerja: DayCode[];
  tanggalMulai: string;
  tanggalAkhir: string;
  status: 'AKTIF' | 'NONAKTIF';
  updatedAt?: string;
  updatedBy?: string;
}

export interface PegawaiWithPenempatan extends PegawaiSafe {
  hasPlacement: boolean;
  penempatanAktif: PenempatanRecord | null;
}

export type JenisPenugasan = 'NORMAL' | 'BACKUP' | 'ROTASI' | 'PENGGANTI';
export type StatusJadwal = 'DIJADWALKAN' | 'LIBUR' | 'DIBATALKAN';

export interface JadwalHarianRecord {
  rowIndex?: number;
  idJadwal: string;
  tanggal: string;
  idPegawai: string;
  nama: string;
  outlet: string;
  posisiPermanen?: string;
  posisiPenugasan: string;
  jamMasuk: string;
  jamPulang: string;
  jenisPenugasan: JenisPenugasan;
  statusJadwal: StatusJadwal;
  catatan?: string;
  dibuatOleh?: string;
  waktuDibuat?: string;
  updatedAt?: string;
  sudahDatang?: boolean;
  hasConflictIzin?: boolean;
}

export type StatusKetidakhadiran = 'LIBUR' | 'IZIN' | 'SAKIT' | 'ALPA';

export interface KetidakhadiranRecord {
  rowIndex?: number;
  tanggal: string;
  idPegawai: string;
  nama: string;
  outlet: string;
  posisi: string;
  status: StatusKetidakhadiran;
  alasan: string;
  buktiFoto: string;
  dicatatOleh: string;
  waktuInput: string;
  keterangan: string;
}

export interface EffectiveWorkAssignment {
  idPegawai: string;
  nama: string;
  outletEfektif: string;
  posisiPermanen: string;
  posisiPenugasan: string;
  jamMasukEfektif: string;
  jamPulangEfektif: string;
  jenisPenugasan: JenisPenugasan;
  statusJadwal: StatusJadwal | 'BELUM_DIJADWALKAN';
  hariKerja: DayCode[];
  sumberJadwal: 'JADWAL_HARIAN' | 'DATA_PENEMPATAN' | 'DATA_POSISI' | 'BELUM_DIJADWALKAN';
  idJadwal?: string;
  hasPlacement: boolean;
  isWorkDay: boolean;
  isScheduledToWork?: boolean;
  multipleSchedules?: boolean;
  ambiguous?: boolean;
  ambiguityReason?: string;
  outletMismatch?: boolean;
}

export type StatusKehadiranHarian = 'HADIR' | 'BELUM ABSEN' | 'BELUM DIJADWALKAN' | 'LIBUR' | 'IZIN' | 'SAKIT' | 'ALPA';

export interface KehadiranHarianRow {
  idPegawai: string;
  nama: string;
  tanggal: string;
  outlet: string;
  posisiPermanen: string;
  posisiPenugasan: string;
  posisi: string;
  jamMasukJadwal: string;
  jamPulangJadwal: string;
  jamDatang: string;
  jamPulang: string;
  totalJam: string;
  statusMasuk: string;
  statusPulang: string;
  statusKehadiran: StatusKehadiranHarian;
  jenisPenugasan: JenisPenugasan;
  sumberJadwal: string;
  idJadwal?: string;
  lokasiDatang: string;
  lokasiPulang: string;
  fotoDatang: string;
  fotoPulang: string;
  alasan: string;
  buktiDokumen: string;
  dicatatOleh?: string;
  hasPlacement: boolean;
  isScheduledToWork?: boolean;
  multipleSchedules?: boolean;
  ambiguousSchedule?: boolean;
  shiftCount?: number;
  missingId: boolean;
  duplicateName: boolean;
  hasScheduleConflict: boolean;
  absenceRecord?: KetidakhadiranRecord | null;
}

export interface KehadiranSummaryStats {
  totalPegawaiAktif: number;
  totalDijadwalkan: number;
  hadir: number;
  belumAbsen: number;
  belumDijadwalkan?: number;
  libur: number;
  izin: number;
  sakit: number;
  alpa: number;
  telat: number;
}

export interface OutletReadinessAlert {
  type: 'NO_ADMIN' | 'ADMIN_ABSENT_NO_BACKUP' | 'DOUBLE_ASSIGNMENT' | 'NO_SCHEDULE' | 'INCOMPLETE_HOURS' | 'SCHEDULE_IZIN_CONFLICT';
  severity: 'error' | 'warning';
  outlet?: string;
  nama?: string;
  message: string;
}

export interface AbsensiAuditRow {
  rowIndex: number;
  tanggal: string;
  nama: string;
  posisi: string;
  outlet: string;
  jamDatang: string;
  jamPulang: string;
  totalJam: string;
  statusMasuk: string;
  statusPulang: string;
  statusPulangLabel: string;
  lokasiDatang: string;
  lokasiPulang: string;
  fotoDatang: string;
  fotoPulang: string;
  keteranganDatang: string;
  keteranganPulang: string;
  editedBy: string;
  editedAt: string;
  originalSnapshot: string;
  isCancelled: boolean;
}

export interface UpdateAbsensiPayload {
  rowIndex: number;
  jamDatang?: string;
  jamPulang?: string;
  status?: string;
  keteranganDatang?: string;
  keteranganPulang?: string;
  alasanKoreksi: string;
}

export interface DeleteAbsensiPayload {
  rowIndex: number;
  alasanHapus: string;
}

export interface AddManualAbsensiPayload {
  tanggal: string;
  nama: string;
  idPegawai?: string;
  outlet: string;
  posisi: string;
  jamDatang: string;
  jamPulang?: string;
  status?: string;
  keteranganDatang?: string;
  keteranganPulang?: string;
  alasanManual: string;
}

