// API Helper for Google Apps Script Integration

// Dipakai HANYA untuk request pertama (getSettings) sebelum Settings sheet berhasil dibaca. Setelah itu, URL aktif mengikuti nilai gasUrl dari Settings sheet, disimpan di module-level variable, BUKAN konstanta ini.
export const BOOTSTRAP_GAS_URL = (import.meta as any).env.VITE_GAS_URL || "https://script.google.com/macros/s/AKfycbwVrPuN3FH2UBiq1gZ4ZsgjqZxwuISWB-HI7iAzmURA-NqQAMFWwJjaFkDGsS9-6jNd/exec";

// Module-level variable sebagai satu sumber kebenaran (single source of truth) URL GAS aktif
let activeGasUrl: string = BOOTSTRAP_GAS_URL;

export const getActiveGasUrl = (): string => {
  return activeGasUrl;
};

export const setActiveGasUrl = (url: string): void => {
  if (url && typeof url === "string") {
    activeGasUrl = url.trim();
  }
};

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
  positions: DEFAULT_OFFLINE_POSITIONS,
  outlets: DEFAULT_OFFLINE_OUTLETS,
  favicon: "",
  gasUrl: ""
};

export const DEFAULT_OFFLINE_RINGKASAN = [
  { 
    nama: "Mohammad Danang", 
    posisi: "Admin",
    outlet: "YZ_ MDP PASIR JAHA BALARAJA", 
    jamDatang: "07:55", 
    statusMasuk: "TEPAT WAKTU",
    jamPulang: "20:05",
    totalJam: "12j 10m",
    statusPulang: "NORMAL",
    fotoDatang: "https://placehold.co/100x100?text=Masuk",
    fotoPulang: "https://placehold.co/100x100?text=Pulang",
    lokasiDatang: "https://maps.google.com/?q=-6.2056,106.4513",
    lokasiPulang: "https://maps.google.com/?q=-6.2056,106.4513"
  },
  { 
    nama: "Fitri Fajria", 
    posisi: "Pickup",
    outlet: "YZ_ MDP JAYANTI CIKANDE", 
    jamDatang: "08:40", 
    statusMasuk: "TELAT",
    alasan: "Ban bocor di jalan tol",
    jamPulang: "-",
    totalJam: "-",
    statusPulang: "-",
    fotoDatang: "https://placehold.co/100x100?text=Masuk",
    fotoPulang: "",
    lokasiDatang: "https://maps.google.com/?q=-6.2065,106.3862",
    lokasiPulang: ""
  }
];
