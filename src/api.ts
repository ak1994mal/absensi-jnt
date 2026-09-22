// API Helper for Google Apps Script Integration

export const DEFAULT_GAS_URL = (import.meta as any).env.VITE_GAS_URL || "https://script.google.com/macros/s/AKfycbwwPFCh_erWDclX-zyWFhkgFtlMMZcU5egyRzAN3Op23nNfaw16zVJeoujJo4JpvONM/exec";
export const BACKUP_LEGACY_GAS_URL = "https://script.google.com/macros/s/AKfycbwVrPuN3FH2UBiq1gZ4ZsgjqZxwuISWB-HI7iAzmURA-NqQAMFWwJjaFkDGsS9-6jNd/exec";

export const getStoredGasUrl = (): string => {
  try {
    const saved = localStorage.getItem("custom_gas_url");
    if (saved && saved.trim().startsWith("https://script.google.com/macros/s/")) {
      return saved.trim();
    }
  } catch (e) {}
  return DEFAULT_GAS_URL;
};

export const setStoredGasUrl = (url: string): void => {
  try {
    localStorage.setItem("custom_gas_url", url.trim());
  } catch (e) {}
};

export const resetStoredGasUrl = (): void => {
  try {
    localStorage.removeItem("custom_gas_url");
  } catch (e) {}
};

/**
 * Safely parses response from Google Apps Script.
 * Catches HTML error responses (like 404 "Halaman Tidak Ditemukan" or Google Drive permission errors)
 * and formats clear human-readable error messages.
 */
export const parseApiResponse = async (res: Response, endpoint: string): Promise<any> => {
  const textData = await res.text();
  if (!textData || textData.trim().startsWith('<') || textData.includes('<!DOCTYPE') || textData.includes('<html')) {
    const is404 = textData.includes('Halaman Tidak Ditemukan') || textData.includes('tidak dapat membuka file') || textData.includes('Page not found');
    const msg = is404
      ? `URL Web App Google Apps Script tidak dapat dibuka (404/File tidak ditemukan). Pastikan URL Web App benar dan di-deploy sebagai 'Anyone'.`
      : `Google Apps Script mengembalikan respons HTML, bukan JSON valid (${endpoint}). Pastikan Web App di-deploy dengan opsi akses 'Anyone'.`;
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

export const DEFAULT_OFFLINE_OUTLETS = [
  { nama: "YZ_ MDP PASIR JAHA BALARAJA", lat: -6.205649180689262, lng: 106.45134398119775, radius: 150 },
  { nama: "YZ_ MDP JAYANTI CIKANDE", lat: -6.206571510648256, lng: 106.38621792361727, radius: 150 }
];

export const DEFAULT_OFFLINE_SETTINGS = {
  requireLocation: true,
  enableWorkHours: true,
  positions: DEFAULT_OFFLINE_POSITIONS,
  outlets: DEFAULT_OFFLINE_OUTLETS,
  favicon: ""
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
