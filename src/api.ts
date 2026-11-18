// API Helper for Google Apps Script Integration

// URL Web App deployment aktif terverifikasi (Production LIVE Google Apps Script)
export const VERIFIED_GAS_URL = "https://script.google.com/macros/s/AKfycbwiyyUb4fJ_9amA2GvMClr1KrI6ZECC9o4icsJzySSYVqa-Ulz798tlPquEO74tHhkk/exec";

// URL yang diketahui usang / meminta login Google / non-publik
const BLACKLISTED_GAS_URLS = [
  "AKfycbwVrPuN3FH2UBiq1gZ4ZsgjqZxwuISWB-HI7iAzmURA-NqQAMFWwJjaFkDGsS9-6jNd", // Memerlukan login Google
  "AKfycbwwPFCh_erWDclX-zyWFhkgFtlMMZcU5egyRzAN3Op23nNfaw16zVJeoujJo4JpvONM"
];

const resolveBootstrapGasUrl = (): string => {
  const envUrl = (import.meta as any).env?.VITE_GAS_URL;
  if (typeof envUrl === "string" && envUrl.trim()) {
    const trimmed = envUrl.trim();
    const isBlacklisted = BLACKLISTED_GAS_URLS.some(bad => trimmed.includes(bad));
    if (!isBlacklisted && trimmed.startsWith("https://script.google.com/macros/s/")) {
      return trimmed;
    }
  }
  return VERIFIED_GAS_URL;
};

// Dipakai untuk inisialisasi awal. URL aktif dapat diperbarui dari nilai Settings sheet (B9).
export const BOOTSTRAP_GAS_URL = resolveBootstrapGasUrl();

// Module-level variable sebagai satu sumber kebenaran (single source of truth) URL GAS aktif
let activeGasUrl: string = BOOTSTRAP_GAS_URL;

export const getActiveGasUrl = (): string => {
  return activeGasUrl;
};

export const setActiveGasUrl = (url: string): void => {
  if (url && typeof url === "string") {
    const trimmed = url.trim();
    const isBlacklisted = BLACKLISTED_GAS_URLS.some(bad => trimmed.includes(bad));
    if (!isBlacklisted && trimmed.startsWith("https://script.google.com/macros/s/")) {
      activeGasUrl = trimmed;
    }
  }
};

/**
 * Helper fetch dengan batas waktu (timeout) via AbortController.
 * Mencegah request menggantung tanpa batas waktu pada jaringan lemah (mis. iPhone/Safari).
 */
export function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 20000): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  if (options.signal) {
    options.signal.addEventListener('abort', () => controller.abort(), { once: true });
  }
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timeoutId));
}

/**
 * Memeriksa apakah error yang terjadi berasal dari pembatalan / timeout AbortController.
 */
export function isAbortError(err: any): boolean {
  return (
    err?.name === 'AbortError' ||
    err?.code === 20 ||
    (typeof err?.message === 'string' && (err.message.includes('aborted') || err.message.includes('AbortError')))
  );
}

/**
 * Safely parses response from Google Apps Script.
 * Catches HTML error responses (like 404 "Halaman Tidak Ditemukan" or Google Drive permission errors)
 * and formats clear human-readable error messages.
 */
export const parseApiResponse = async (res: Response, endpoint: string): Promise<any> => {
  const textData = await res.text();
  if (!textData || textData.trim().startsWith('<') || textData.includes('<!DOCTYPE') || textData.includes('<html')) {
    // Cek penyebab spesifik respons HTML dari Google
    if (res.status === 404 || textData.includes('Halaman Tidak Ditemukan') || textData.includes('Page not found')) {
      throw new Error(`URL Web App tidak ditemukan (404). Pastikan URL Web App benar dan berakhiran '/exec'.`);
    }
    
    if (textData.includes('accounts.google.com') || textData.includes('ServiceLogin') || textData.includes('Sign in')) {
      throw new Error(`Akses Google Apps Script memerlukan login Google. Pastikan pada saat Deploy, opsi "Who has access" dipilih "Anyone" (Siapa saja).`);
    }

    if (textData.includes('Authorization is required') || textData.includes('izin otorisasi') || textData.includes('izin akses')) {
      throw new Error(`Google Apps Script membutuhkan otorisasi akun. Silakan buka editor Apps Script dan jalankan salah satu fungsi (Review Permissions).`);
    }

    if (textData.includes('tidak dapat membuka file') || textData.includes('Unable to open the file')) {
      throw new Error(`Google Drive / Apps Script terkendala saat mengakses file foto atau spreadsheet. Periksa ID Folder Google Drive dan pastikan kapasitas penyimpanan akun Google masih tersedia.`);
    }

    // Ambil cuplikan title HTML jika ada
    const titleMatch = textData.match(/<title>([^<]*)<\/title>/i);
    const pageTitle = titleMatch ? titleMatch[1].trim() : '';

    const msg = pageTitle 
      ? `Google Apps Script mengembalikan halaman: "${pageTitle}" (${endpoint}). Jika baru mengubah kode, pastikan klik Deploy > New deployment (versi baru).`
      : `Google Apps Script mengembalikan respons HTML, bukan JSON valid (${endpoint}). Pastikan Web App di-deploy dengan versi baru dan opsi akses 'Anyone'.`;
    throw new Error(msg);
  }

  try {
    return JSON.parse(textData);
  } catch (err: any) {
    throw new Error(`Format respons JSON tidak valid dari server (${endpoint}): ${err?.message || 'Parse Error'}`);
  }
};

export const DEFAULT_OFFLINE_PEGAWAI = [
  "Mohammad Danang",
  "Bambang",
  "Fitri Fajria",
  "Irma Damayanti",
  "M. Hari Yanto"
];

export const DEFAULT_OFFLINE_POSITIONS = [
  { name: "Admin", jamMasuk: "08:00", jamPulang: "20:00", enabled: true },
  { name: "Pickup", jamMasuk: "08:00", jamPulang: "20:00", enabled: true },
  { name: "Sprinter", jamMasuk: "08:00", jamPulang: "20:00", enabled: true },
  { name: "Drop Point", jamMasuk: "08:00", jamPulang: "20:00", enabled: true }
];

export const DEFAULT_OFFLINE_OUTLETS: Array<{ nama: string; lat: number; lng: number; radius: number }> = [];

export const DEFAULT_OFFLINE_SETTINGS = {
  requireLocation: true,
  enableWorkHours: true,
  toleransiTelat: 60,
  positions: DEFAULT_OFFLINE_POSITIONS,
  outlets: DEFAULT_OFFLINE_OUTLETS,
  favicon: "",
  gasUrl: ""
};

// ==================== OWNER AUTH SESSION HELPERS ====================

const OWNER_TOKEN_STORAGE_KEY = "jnt_owner_session_token";

export function getOwnerToken(): string {
  try {
    return sessionStorage.getItem(OWNER_TOKEN_STORAGE_KEY) || localStorage.getItem(OWNER_TOKEN_STORAGE_KEY) || "";
  } catch (e) {
    return "";
  }
}

export function setOwnerToken(token: string): void {
  try {
    if (token) {
      sessionStorage.setItem(OWNER_TOKEN_STORAGE_KEY, token);
      localStorage.setItem(OWNER_TOKEN_STORAGE_KEY, token);
    } else {
      sessionStorage.removeItem(OWNER_TOKEN_STORAGE_KEY);
      localStorage.removeItem(OWNER_TOKEN_STORAGE_KEY);
    }
  } catch (e) {}
}

function normalizeApiError(err: any, fallbackMsg: string): Error {
  if (isAbortError(err)) {
    return new Error("Koneksi timeout, sinyal mungkin lemah. Silakan coba lagi.");
  }
  return err instanceof Error ? err : new Error(err?.message || fallbackMsg);
}

async function gasGet(action: string, params: Record<string, string | undefined> = {}, timeoutMs = 20000): Promise<any> {
  const baseUrl = getActiveGasUrl();
  if (!baseUrl) {
    throw new Error("URL Google Apps Script belum terkonfigurasi.");
  }
  const search = new URLSearchParams({ action });
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") {
      search.set(k, v);
    }
  }
  const url = `${baseUrl}?${search.toString()}`;
  let lastErr: any;
  for (let i = 0; i <= 1; i++) {
    try {
      const res = await fetchWithTimeout(url, { cache: 'no-store' }, timeoutMs);
      return await parseApiResponse(res, action);
    } catch (err) {
      lastErr = err;
      if (i < 1) {
        await new Promise((r) => setTimeout(r, 900));
      }
    }
  }
  throw normalizeApiError(lastErr, `Gagal memuat ${action}`);
}

async function gasPost(action: string, data: any = {}, includeOwnerToken = true, timeoutMs = 20000): Promise<any> {
  const baseUrl = getActiveGasUrl();
  if (!baseUrl) {
    throw new Error("URL Google Apps Script belum terkonfigurasi.");
  }
  const payload: any = { action, data };
  if (includeOwnerToken) {
    payload.ownerToken = getOwnerToken();
  }
  try {
    const res = await fetchWithTimeout(
      baseUrl,
      {
        method: 'POST',
        body: JSON.stringify(payload)
      },
      timeoutMs
    );
    return await parseApiResponse(res, action);
  } catch (err) {
    throw normalizeApiError(err, `Gagal mengirim ${action}`);
  }
}

export async function ownerLoginApi(password: string) {
  return gasPost('ownerLogin', { password }, false, 20000);
}

export async function ownerLogoutApi(token?: string) {
  return gasPost('ownerLogout', { ownerToken: token || getOwnerToken() }, true, 15000);
}

export async function verifyOwnerSessionApi(token?: string) {
  const tok = token || getOwnerToken();
  if (!tok) return { status: 'error', valid: false, message: 'Token tidak tersedia' };
  return gasGet('verifyOwnerSession', { token: tok }, 15000);
}

export async function fetchDataPenempatanApi() {
  return gasGet('getDataPenempatan');
}

export async function fetchRiwayatPenempatanApi(idPegawai?: string, nama?: string) {
  return gasGet('getRiwayatPenempatan', { idPegawai, nama });
}

export async function savePenempatanApi(data: any) {
  return gasPost('savePenempatan', data, true, 20000);
}

export async function fetchJadwalHarianApi(tanggal: string) {
  return gasGet('getJadwalHarian', { tanggal });
}

export async function fetchRiwayatRotasiApi(params?: { nama?: string; outlet?: string; bulan?: string }) {
  return gasGet('getRiwayatRotasi', params || {});
}

export async function saveJadwalHarianApi(data: any) {
  return gasPost('saveJadwalHarian', data, true, 20000);
}

export async function updateJadwalHarianApi(data: any) {
  return gasPost('updateJadwalHarian', data, true, 20000);
}

export async function cancelJadwalHarianApi(data: any) {
  return gasPost('cancelJadwalHarian', data, true, 20000);
}

export async function fetchKehadiranHarianApi(tanggal: string) {
  return gasGet('getKehadiranHarian', { tanggal });
}

export async function fetchKetidakhadiranApi(params?: { tanggal?: string; bulan?: string; nama?: string; outlet?: string }) {
  return gasGet('getKetidakhadiran', params || {});
}

export async function saveKetidakhadiranApi(data: any) {
  const timeout = data?.image ? 35000 : 20000;
  return gasPost('saveKetidakhadiran', data, true, timeout);
}

export async function updateKetidakhadiranApi(data: any) {
  const timeout = data?.image ? 35000 : 20000;
  return gasPost('updateKetidakhadiran', data, true, timeout);
}

export async function cancelKetidakhadiranApi(data: any) {
  return gasPost('cancelKetidakhadiran', data, true, 20000);
}

export async function closeDailyAttendanceApi(data: { tanggal: string; alasan?: string; targetNames?: string[] }) {
  return gasPost('closeDailyAttendance', data, true, 25000);
}

export async function fetchPegawaiDetailApi(nama: string, idPegawai?: string, tanggal?: string) {
  return gasGet('getPegawaiDetail', { nama, idPegawai, tanggal }, 15000);
}

export async function getAbsensiByDate(params: { tanggal?: string; outlet?: string; search?: string } = {}) {
  return gasGet(
    'getAbsensiByDate',
    {
      tanggal: params.tanggal,
      outlet: params.outlet,
      search: params.search,
      ownerToken: getOwnerToken()
    },
    20000
  );
}

export async function updateAbsensi(data: {
  rowIndex: number;
  jamDatang?: string;
  jamPulang?: string;
  status?: string;
  keteranganDatang?: string;
  keteranganPulang?: string;
  alasanKoreksi: string;
}) {
  return gasPost('updateAbsensi', data, true, 20000);
}

export async function deleteAbsensi(data: { rowIndex: number; alasanHapus: string }) {
  return gasPost('deleteAbsensi', data, true, 20000);
}

export async function addManualAbsensi(data: {
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
}) {
  return gasPost('addManualAbsensi', data, true, 20000);
}
