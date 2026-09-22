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
