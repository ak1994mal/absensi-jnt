import React, { useState, useEffect, useRef } from 'react';
import { Camera, MapPin, Send, AlertCircle, LocateFixed, CheckCircle2, FileImage, ClipboardList, History, Users, Bell, X, LogOut, RefreshCw, BarChart3, CalendarDays, Clock, ExternalLink, Store, Briefcase, Plus, Pencil, Trash2, Check, Globe } from 'lucide-react';
import { Toaster, toast } from 'sonner';
import OutletMapManager from './components/OutletMapManager';
import GasUrlModal from './components/GasUrlModal';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { motion, AnimatePresence } from 'motion/react';
import { 
  DEFAULT_GAS_URL, 
  getStoredGasUrl, 
  setStoredGasUrl, 
  resetStoredGasUrl, 
  parseApiResponse,
  DEFAULT_OFFLINE_PEGAWAI,
  DEFAULT_OFFLINE_SETTINGS,
  DEFAULT_OFFLINE_RINGKASAN
} from './api';


const getMapEmbedUrl = (url?: string) => {
  if (!url) return null;
  const match = url.match(/q=([-0-9.]+),([-0-9.]+)/);
  if (match) {
    return `https://maps.google.com/maps?q=${match[1]},${match[2]}&t=&z=14&ie=UTF8&iwloc=&output=embed`;
  }
  return null;
};


const getSummaryByPosition = (rows: any[]) => {
  const summary: Record<string, {
    posisi: string;
    totalMenit: number;
    jumlahMasuk: number;
    jumlahTelat: number;
    jumlahIzin: number;
    jumlahLembur: number;
  }> = {};

  rows.forEach(row => {
    const pos = row.posisi || "Tidak Diketahui";
    if (!summary[pos]) {
      summary[pos] = {
        posisi: pos,
        totalMenit: 0,
        jumlahMasuk: 0,
        jumlahTelat: 0,
        jumlahIzin: 0,
        jumlahLembur: 0
      };
    }

    const item = summary[pos];
    if (row.keterangan === 'IZIN' || row.statusMasuk === 'IZIN') {
      item.jumlahIzin += 1;
    } else {
      item.jumlahMasuk += 1;
      if (row.statusMasuk && row.statusMasuk.toUpperCase().includes('TELAT')) {
        item.jumlahTelat += 1;
      }

      const totJam = row.totalJam;
      if (totJam && totJam !== "-") {
        const parts = String(totJam).match(/(\d+)j (\d+)m/);
        if (parts && parts.length === 3) {
          const rH = parseInt(parts[1]);
          const rM = parseInt(parts[2]);
          item.totalMenit += (rH * 60) + rM;

          if (rH >= 13) {
            item.jumlahLembur += (rH - 12);
          }
        }
      }
    }
  });

  return Object.values(summary);
};


// Catatan: Seluruh data master outlet bersumber langsung dari Google Spreadsheet sheet "DataOutlet".
const EMPTY_ARRAY: any[] = [];


export const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const R = 6371e3; // Radius bumi dalam meter
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;


  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));


  return R * c; // Jarak dalam meter
};


export const formatSheetDate = (val: any): string => {
  if (!val) return "";
  const str = String(val).trim();
  if (str === "-") return "-";
  
  if (str.includes("T") && !isNaN(Date.parse(str))) {
    const d = new Date(str);
    if (d.getFullYear() === 1899) {
      return "-";
    }
    const day = d.getDate().toString().padStart(2, '0');
    const month = (d.getMonth() + 1).toString().padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  }
  
  return str;
};


export const formatSheetTime = (val: any): string => {
  if (val === null || val === undefined || val === "" || val === "-") return "-";

  // 1. Date object (instanceof or object with getHours)
  if (val instanceof Date || Object.prototype.toString.call(val) === '[object Date]' || (typeof val === 'object' && typeof val?.getHours === 'function')) {
    try {
      const h = String(val.getHours()).padStart(2, '0');
      const m = String(val.getMinutes()).padStart(2, '0');
      return `${h}:${m}`;
    } catch (e) {}
  }

  // 2. Number: either epoch timestamp or fractional day (Google Sheets time serial)
  if (typeof val === "number" && !isNaN(val)) {
    if (val > 100000000) {
      try {
        const d = new Date(val);
        const h = String(d.getHours()).padStart(2, '0');
        const m = String(d.getMinutes()).padStart(2, '0');
        return `${h}:${m}`;
      } catch (e) {}
    }
    let frac = val % 1;
    if (frac < 0) frac += 1;
    const totalSecs = Math.round(frac * 86400);
    const h = String(Math.floor(totalSecs / 3600) % 24).padStart(2, '0');
    const m = String(Math.floor((totalSecs % 3600) / 60)).padStart(2, '0');
    return `${h}:${m}`;
  }

  // 3. String representation
  const str = String(val).trim();
  if (!str || str === "-" || str === "[object Object]") return "-";

  // ISO string or parsable Date string
  if (str.includes("T") && !isNaN(Date.parse(str))) {
    try {
      const d = new Date(str);
      const h = String(d.getHours()).padStart(2, '0');
      const m = String(d.getMinutes()).padStart(2, '0');
      return `${h}:${m}`;
    } catch (e) {}
  }

  // Look for time pattern: H:MM or HH:MM or HH.MM
  const match = str.match(/(?:^|\s|T)?(\d{1,2})[:.](\d{2})(?::\d{2})?(?:\s|$)?/);
  if (match) {
    const h = match[1].padStart(2, '0');
    const m = match[2].padStart(2, '0');
    return `${h}:${m}`;
  }

  return "-";
};


export const getDirectDriveUrl = (url: string | null | undefined): string => {
  if (!url) return "";
  const str = String(url).trim();
  if (str.includes("drive.google.com") || str.includes("docs.google.com")) {
    const match = str.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) || str.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (match && match[1]) {
      return `https://lh3.googleusercontent.com/d/${match[1]}`;
    }
  }
  return str;
};

export const getTodayString = (): string => {
  const d = new Date();
  return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;
};

export const normalizeDateStr = (str: string): string => {
  if (!str) return "";
  const cleaned = str.trim().replace(/-/g, '/');
  const parts = cleaned.split('/');
  if (parts.length === 3) {
    const d = parts[0].padStart(2, '0');
    const m = parts[1].padStart(2, '0');
    const y = parts[2];
    return `${d}/${m}/${y.length === 2 ? '20' + y : y}`;
  }
  return cleaned;
};

export const hasValidTime = (val: any): boolean => {
  if (val === null || val === undefined || val === "" || val === "-") return false;
  const formatted = formatSheetTime(val);
  return formatted !== "-" && formatted !== "";
};

export const isToday = (dateVal: any): boolean => {
  if (!dateVal) return false;
  const formatted = formatSheetDate(dateVal);
  const normRecord = normalizeDateStr(formatted);
  const normToday = normalizeDateStr(getTodayString());
  const normTodayLocal = normalizeDateStr(new Date().toLocaleDateString('id-ID'));
  return normRecord === normToday || normRecord === normTodayLocal;
};

export const findOpenAttendanceToday = (records: any[]): any | null => {
  if (!Array.isArray(records)) return null;
  return records.find(r => 
    isToday(r.tanggal) &&
    r.statusMasuk !== 'IZIN' &&
    r.keterangan !== 'IZIN' &&
    hasValidTime(r.jamDatang) &&
    !hasValidTime(r.jamPulang)
  ) || null;
};

export const findClosedAttendanceToday = (records: any[]): any | null => {
  if (!Array.isArray(records)) return null;
  return records.find(r =>
    isToday(r.tanggal) &&
    r.statusMasuk !== 'IZIN' &&
    r.keterangan !== 'IZIN' &&
    hasValidTime(r.jamDatang) &&
    hasValidTime(r.jamPulang)
  ) || null;
};

export const normalizeOutletName = (name: string | null | undefined): string => {
  return (name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
};


type StatusAbsen = "DATANG" | "PULANG" | "IZIN";
type PosisiPegawai = string;
export type PositionConfig = {
  name: string;
  jamMasuk: string;
  jamPulang: string;
  enabled?: boolean;
};

export const DEFAULT_POSITIONS: PositionConfig[] = [
  { name: "Admin", jamMasuk: "08:00", jamPulang: "20:00", enabled: true },
  { name: "Admin (Training)", jamMasuk: "08:00", jamPulang: "20:00", enabled: true },
  { name: "Pickup", jamMasuk: "14:00", jamPulang: "22:00", enabled: true },
  { name: "Magang", jamMasuk: "08:00", jamPulang: "17:00", enabled: true }
];

export const cleanTimeString = (val: any, fallback: string = "08:00"): string => {
  if (!val) return fallback;
  const match = String(val).match(/(\d{1,2}):(\d{2})/);
  if (match) {
    const hh = match[1].padStart(2, '0');
    const mm = match[2];
    return `${hh}:${mm}`;
  }
  return fallback;
};


const updateFavicon = (url: string) => {
  if (!url) return;

  // Add cache-busting parameter to force the browser/tab to redownload and refresh the icon
  const separator = url.includes('?') ? '&' : '?';
  const cleanUrl = `${url}${separator}t=${Date.now()}`;

  const applyToDoc = (doc: Document) => {
    try {
      // Find all icon-related links and remove them to clean the head
      const existing = doc.querySelectorAll("link[rel~='icon'], link[id='dynamic-favicon']");
      existing.forEach(el => el.parentNode?.removeChild(el));

      const head = doc.getElementsByTagName('head')[0];
      if (!head) return;

      // Create new 'shortcut icon' link
      const shortcutLink = doc.createElement('link');
      shortcutLink.id = 'dynamic-favicon';
      shortcutLink.rel = 'shortcut icon';
      shortcutLink.href = cleanUrl;

      // Determine correct mime type
      if (url.includes('.ico')) {
        shortcutLink.type = 'image/x-icon';
      } else if (url.includes('.png')) {
        shortcutLink.type = 'image/png';
      } else if (url.includes('.svg')) {
        shortcutLink.type = 'image/svg+xml';
      } else {
        shortcutLink.type = 'image/x-icon';
      }

      head.appendChild(shortcutLink);

      // Create and append a backup standard 'icon' link for maximum browser compatibility
      const iconLink = doc.createElement('link');
      iconLink.rel = 'icon';
      iconLink.type = shortcutLink.type;
      iconLink.href = cleanUrl;
      head.appendChild(iconLink);
    } catch (e) {
      console.warn("Failed to apply favicon to document object", e);
    }
  };

  // Apply to current document
  applyToDoc(document);

  // Safely try to apply to parent document if inside same-origin iframe
  try {
    if (window.parent && window.parent !== window && window.parent.document) {
      applyToDoc(window.parent.document);
    }
  } catch (err) {
    // Expected same-origin query blocks inside cross-origin context, ignore silently
  }
};


export default function App() {
  const [activeTab, setActiveTab] = useState<'absen' | 'owner'>(() => {
    return (localStorage.getItem("activeTab") as 'absen' | 'owner') || 'absen';
  });
  const [isOwnerLoggedIn, setIsOwnerLoggedIn] = useState(() => {
    return localStorage.getItem("isOwnerLoggedIn") === "true";
  });
  const [ownerPasswordInput, setOwnerPasswordInput] = useState("");
  const [ownerLoginError, setOwnerLoginError] = useState("");

  // Dynamic Google Apps Script Web App URL state & modal controls
  const [gasUrl, setGasUrl] = useState<string>(() => getStoredGasUrl());
  const [showGasUrlModal, setShowGasUrlModal] = useState(false);
  const GAS_URL = gasUrl;

  const handleSaveGasUrl = (newUrl: string) => {
    setStoredGasUrl(newUrl);
    setGasUrl(newUrl);
    setShowGasUrlModal(false);
    toast.success("URL Web App berhasil disimpan.");
    setTimeout(() => {
      fetchPegawai();
      fetchSettings();
      if (activeTab === 'owner') {
        if (ownerView === 'harian') fetchRingkasanHarian();
        if (ownerView === 'bulanan') fetchLaporanBulanan(laporanBulan);
      }
    }, 150);
  };

  const handleResetGasUrl = () => {
    resetStoredGasUrl();
    setGasUrl(DEFAULT_GAS_URL);
    setShowGasUrlModal(false);
    toast.info("URL Web App dikembalikan ke default.");
    setTimeout(() => {
      fetchPegawai();
      fetchSettings();
    }, 150);
  };

  // Keep activeTab persisted
  useEffect(() => {
    localStorage.setItem("activeTab", activeTab);
  }, [activeTab]);


  const [daftarPegawai, setDaftarPegawai] = useState<string[]>([]);
  const [loadingNames, setLoadingNames] = useState(true);
  
  const [nama, setNama] = useState("");
  const [posisi, setPosisi] = useState<PosisiPegawai>("");
  const [outlet, setOutlet] = useState("");
  const [keterangan, setKeterangan] = useState<StatusAbsen>("DATANG");
  const [jenisIzin, setJenisIzin] = useState<"Izin" | "Sakit">("Izin");
  const [alasan, setAlasan] = useState("");
  const [keteranganTelat, setKeteranganTelat] = useState("");
  const [keteranganPulangCepat, setKeteranganPulangCepat] = useState("");
  
  const [imageBase64, setImageBase64] = useState("");
  const [loadingSubmit, setLoadingSubmit] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<string>('');
  const [buktiFeishuBase64, setBuktiFeishuBase64] = useState("");
  const [isFeishuOpen, setIsFeishuOpen] = useState(false);


  const [riwayat, setRiwayat] = useState<any[]>([]);
  const [loadingRiwayat, setLoadingRiwayat] = useState(false);


  const [ringkasanHarian, setRingkasanHarian] = useState<any[]>([]);
  const [loadingRingkasan, setLoadingRingkasan] = useState(false);





  const [laporanBulanan, setLaporanBulanan] = useState<any[]>([]);
  const [laporanBulananOutlet, setLaporanBulananOutlet] = useState<any[]>([]);
  const [loadingLaporan, setLoadingLaporan] = useState(false);
  const [ownerView, setOwnerView] = useState<'harian' | 'bulanan' | 'outlet' | 'settings'>('harian');
  const [laporanBulananSubView, setLaporanBulananSubView] = useState<'pegawai' | 'outlet'>('pegawai');
  const [targetJamKerja, setTargetJamKerja] = useState<number>(12);
  const [laporanPosisiFilter, setLaporanPosisiFilter] = useState<'Semua' | 'Admin' | 'Pickup'>('Semua');
  const [laporanBulan, setLaporanBulan] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}`;
  });
  const [riwayatBulan, setRiwayatBulan] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}`;
  });

  const [errorNames, setErrorNames] = useState("");
  const [errorRiwayat, setErrorRiwayat] = useState("");
  const [errorRingkasan, setErrorRingkasan] = useState("");
  const [errorLaporan, setErrorLaporan] = useState("");
  const [settingsData, setSettingsData] = useState<any>(() => {
    try {
      const saved = localStorage.getItem("settingsData_offline");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === "object") {
          return {
            ...parsed,
            outlets: Array.isArray(parsed.outlets) ? parsed.outlets : []
          };
        }
      }
    } catch (e) {}
    return {
      requireLocation: true,
      positions: DEFAULT_POSITIONS,
      outlets: []
    };
  });
  const [loadingSettings, setLoadingSettings] = useState(false);
  const [errorSettings, setErrorSettings] = useState("");
  const [faviconError, setFaviconError] = useState(false);

  const [newPosisiInput, setNewPosisiInput] = useState("");
  const [editingPosisiIndex, setEditingPosisiIndex] = useState<number | null>(null);
  const [editingPosisiValue, setEditingPosisiValue] = useState("");

  const availablePositions: PositionConfig[] = (settingsData?.positions && Array.isArray(settingsData.positions) && settingsData.positions.length > 0)
    ? settingsData.positions.map((p: any) => {
        if (typeof p === 'string') {
          return { name: p, jamMasuk: "08:00", jamPulang: "20:00", enabled: true };
        }
        return {
          name: p.name || "",
          jamMasuk: cleanTimeString(p.jamMasuk, "08:00"),
          jamPulang: cleanTimeString(p.jamPulang, "20:00"),
          enabled: p.enabled !== false && p.enabled !== 'FALSE' && p.enabled !== 'false'
        };
      })
    : DEFAULT_POSITIONS;

  const fetchWithRetry = async (url: string, options?: RequestInit, retries = 2): Promise<Response> => {
    let lastErr: any;
    // Safari/iOS nge-cache response fetch GET ke URL yang sama secara default,
    // beda dari Chrome. Paksa no-store biar data (daftar pegawai, settings, dll) selalu fresh.
    const finalOptions: RequestInit = { ...options, cache: 'no-store' };
    for (let i = 0; i <= retries; i++) {
      try {
        const res = await fetch(url, finalOptions);
        return res;
      } catch (err) {
        lastErr = err;
        console.warn(`[Network] Fetch attempt ${i + 1} failed. Retrying...`);
        if (i < retries) {
          await new Promise(resolve => setTimeout(resolve, 1500));
        }
      }
    }
    throw lastErr;
  };


  const [selectedPegawaiDetail, setSelectedPegawaiDetail] = useState<{nama: string, bulan: string} | null>(null);
  const [detailRiwayat, setDetailRiwayat] = useState<any[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [previewModal, setPreviewModal] = useState<{type: 'image' | 'map', title: string, url: string} | null>(null);


  const fileInputRef = useRef<HTMLInputElement>(null);
  const feishuImageInputRef = useRef<HTMLInputElement>(null);
  const hasNotifiedGeoRef = useRef(false);
  const lastScheduledNotificationDateRef = useRef("");
  const lastKnownLocationRef = useRef<{ lat: number, lng: number, timestamp: number } | null>(null);

  // Background passive location watcher to ensure GPS coordinates are warm and never blank
  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const uLat = pos?.coords?.latitude;
        const uLng = pos?.coords?.longitude;
        if (typeof uLat === "number" && typeof uLng === "number" && Number.isFinite(uLat) && Number.isFinite(uLng) && !(uLat === 0 && uLng === 0)) {
          lastKnownLocationRef.current = { lat: uLat, lng: uLng, timestamp: Date.now() };
        }
      },
      () => {},
      { enableHighAccuracy: false, timeout: 6000, maximumAge: 300000 }
    );

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const uLat = pos?.coords?.latitude;
        const uLng = pos?.coords?.longitude;
        if (typeof uLat === "number" && typeof uLng === "number" && Number.isFinite(uLat) && Number.isFinite(uLng) && !(uLat === 0 && uLng === 0)) {
          lastKnownLocationRef.current = { lat: uLat, lng: uLng, timestamp: Date.now() };
        }
      },
      () => {},
      { enableHighAccuracy: false, maximumAge: 60000, timeout: 20000 }
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, []);


  const todayStr = getTodayString();
  const normalizedToday = normalizeDateStr(todayStr);
  const openAttendanceToday = findOpenAttendanceToday(riwayat);
  const closedAttendanceToday = findClosedAttendanceToday(riwayat);
  // Absen hari ini: prioritaskan record terbuka jika ada, lalu record closed, atau record hari ini apapun
  const absenHariIni = openAttendanceToday || closedAttendanceToday || riwayat.find(r => isToday(r?.tanggal));




  // Update favicon and reset error state when favicon config changes
  useEffect(() => {
    setFaviconError(false);
    if (settingsData?.favicon) {
      updateFavicon(settingsData.favicon);
    }
  }, [settingsData?.favicon]);

  // Pengingat absensi otomatis (local push notification) pada jam 08:00 pagi jika belum absen
  useEffect(() => {
    if (!('Notification' in window)) return;

    const interval = setInterval(() => {
      const now = new Date();
      // Pukul 08:00 pagi
      if (now.getHours() === 8 && now.getMinutes() === 0) {
        const dateStr = now.toDateString();
        if (lastScheduledNotificationDateRef.current !== dateStr) {
          // Periksa apakah sudah absen datang hari ini (baik open maupun closed)
          const sudahAbsenCheck = (openAttendanceToday || closedAttendanceToday) && hasValidTime((openAttendanceToday || closedAttendanceToday)?.jamDatang);
          if (!sudahAbsenCheck) {
            lastScheduledNotificationDateRef.current = dateStr;
            if (Notification.permission === 'granted') {
              new Notification("Pengingat Absensi J&T", {
                body: "Sudah pukul 08:00 pagi! Anda belum melakukan Absen DATANG hari ini. Harap segera melakukan absensi.",
                icon: "https://upload.wikimedia.org/wikipedia/commons/3/3a/J%26T_Express_logo.svg",
                vibrate: [350, 100, 350, 100, 350],
                requireInteraction: true
              } as any);
            }
          }
        }
      }
    }, 30000); // Periksa tiap 30 detik agar tidak melewatkan menit awal

    return () => clearInterval(interval);
  }, [openAttendanceToday, closedAttendanceToday]);

  useEffect(() => {
    if (!('Notification' in window) || !('geolocation' in navigator)) return;

    const rawReq = settingsData?.requireLocation;
    const requireLocation = rawReq === true || rawReq === 'TRUE' || rawReq === 'true' || rawReq === undefined || rawReq === null;
    if (!requireLocation) return;

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        if (hasNotifiedGeoRef.current) return;
        
        // Jika sudah absen hari ini, tak perlu notifikasi
        if ((openAttendanceToday || closedAttendanceToday) && hasValidTime((openAttendanceToday || closedAttendanceToday)?.jamDatang)) return;

        const userLat = pos.coords.latitude;
        const userLng = pos.coords.longitude;
        const activeOutlets = settingsData?.outlets || [];
        if (!activeOutlets.length) return;

        for (const out of activeOutlets) {
          const radius = out.radius || 150;
          const dist = calculateDistance(userLat, userLng, out.lat, out.lng);
          if (dist <= radius) {
            hasNotifiedGeoRef.current = true;
            if (Notification.permission === 'granted') {
              new Notification("Pengingat Absensi J&T", {
                body: `Anda berada di sekitar ${out.name || out.nama}. Jangan lupa untuk Absen DATANG!`,
                icon: "https://upload.wikimedia.org/wikipedia/commons/3/3a/J%26T_Express_logo.svg",
                vibrate: [200, 100, 200]
              } as any);
            }
            break;
          }
        }
      },
      (err) => {
        console.warn("Watch position notification error:", err);
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 30000 }
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, [openAttendanceToday, closedAttendanceToday, settingsData?.outlets, settingsData?.requireLocation]);


  const getSisaWaktuKerja = (jamDatangStr: any, targetJam: number) => {
    const formatted = formatSheetTime(jamDatangStr);
    if (!formatted || formatted === "-") return null;
    
    const match = formatted.match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return null;
    
    const hDatang = parseInt(match[1], 10);
    const mDatang = parseInt(match[2], 10);
    
    const now = new Date();
    const currentH = now.getHours();
    const currentM = now.getMinutes();


    let diffMinutes = (currentH * 60 + currentM) - (hDatang * 60 + mDatang);
    if (diffMinutes < 0) diffMinutes = 0;
    
    const targetMinutes = targetJam * 60;
    const remainMinutes = targetMinutes - diffMinutes;
    
    if (remainMinutes <= 0) return "Selesai/Lembur";
    
    const rH = Math.floor(remainMinutes / 60);
    const rM = remainMinutes % 60;
    
    if (rH > 0) return `Sisa: ${rH}j ${rM}m`;
    return `Sisa: ${rM}m`;
  };


  const checkIfLate = () => {
    if (keterangan !== "DATANG" || !posisi) return false;

    // Cek toggle master aturan jam masuk & pulang
    const rawHours = settingsData?.enableWorkHours;
    const workHoursActive = rawHours === true || rawHours === 'TRUE' || rawHours === 'true' || rawHours === undefined || rawHours === null;
    if (!workHoursActive) return false;

    const posisiConfig = availablePositions.find(p => p.name === posisi);
    if (posisiConfig && posisiConfig.enabled === false) return false;

    const now = new Date();
    const totalMinutes = now.getHours() * 60 + now.getMinutes();

    const jamMasuk = formatSheetTime(posisiConfig?.jamMasuk) || "08:00";
    const matchMasuk = jamMasuk.match(/^(\d{1,2}):(\d{2})$/);
    const jm = matchMasuk ? parseInt(matchMasuk[1], 10) : 8;
    const mm = matchMasuk ? parseInt(matchMasuk[2], 10) : 0;
    const jamMasukMenit = jm * 60 + mm;
    const toleransi = settingsData?.toleransiTelat ?? 30;

    // Cuma dipakai buat tampilan/validasi form (UX). Keputusan final (termasuk blokir
    // kalau lewat toleransi) tetap di backend processForm, ini cuma biar konsisten.
    return totalMinutes > jamMasukMenit && totalMinutes <= jamMasukMenit + toleransi;
  };


  const isLate = checkIfLate();

  const checkIfEarlyLeave = () => {
    if (keterangan !== "PULANG" || !posisi) return false;

    // Cek toggle master aturan jam masuk & pulang
    const rawHours = settingsData?.enableWorkHours;
    const workHoursActive = rawHours === true || rawHours === 'TRUE' || rawHours === 'true' || rawHours === undefined || rawHours === null;
    if (!workHoursActive) return false;

    const posisiConfig = availablePositions.find(p => p.name === posisi);
    if (posisiConfig && posisiConfig.enabled === false) return false;

    const now = new Date();
    const totalMinutes = now.getHours() * 60 + now.getMinutes();

    const jamPulang = formatSheetTime(posisiConfig?.jamPulang) || "20:00";
    const matchPulang = jamPulang.match(/^(\d{1,2}):(\d{2})$/);
    const jp = matchPulang ? parseInt(matchPulang[1], 10) : 20;
    const mp = matchPulang ? parseInt(matchPulang[2], 10) : 0;
    const jamPulangMenit = jp * 60 + mp;

    // Sama seperti backend: lembur (>=13 jam kerja) sudah ditangani terpisah di sana,
    // ini cuma buat munculin field alasan kalau pulang sebelum jadwal.
    return totalMinutes < jamPulangMenit;
  };

  const isEarlyLeave = checkIfEarlyLeave();


  const matchOutletOption = (rawOutlet: string | undefined): string => {
    if (!rawOutlet) return "";
    const list = settingsData?.outlets || [];
    const norm = normalizeOutletName(rawOutlet);
    const found = list.find((o: any) => normalizeOutletName(o.nama || o.name) === norm);
    return found ? (found.nama || found.name) : rawOutlet;
  };

  const matchPosisiOption = (rawPosisi: string | undefined): PosisiPegawai => {
    if (!rawPosisi) return "";
    const norm = rawPosisi.toLowerCase().trim();
    const found = availablePositions.find(p => p.name.toLowerCase().trim() === norm);
    return (found ? found.name : rawPosisi) as PosisiPegawai;
  };

  // 1. Auto-fill Posisi, Aktivitas (PULANG), dan Outlet ketika nama pegawai dipilih dan terdeteksi absen DATANG aktif
  useEffect(() => {
    if (!nama) return;
    const openRecord = findOpenAttendanceToday(riwayat);
    if (openRecord) {
      setKeterangan("PULANG");
      if (openRecord.outlet) setOutlet(matchOutletOption(openRecord.outlet));
      if (openRecord.posisi) setPosisi(matchPosisiOption(openRecord.posisi));
    }
  }, [nama, riwayat, settingsData?.outlets]);

  // 2. Sinkronisasi otomatis saat aktivitas diubah manual ke "PULANG"
  useEffect(() => {
    if (keterangan === "PULANG") {
      const targetRecord = openAttendanceToday || closedAttendanceToday || absenHariIni;
      if (targetRecord) {
        if (targetRecord.outlet) setOutlet(matchOutletOption(targetRecord.outlet));
        if (targetRecord.posisi) setPosisi(matchPosisiOption(targetRecord.posisi));
      }
    }
  }, [keterangan, openAttendanceToday, closedAttendanceToday, absenHariIni, settingsData?.outlets]);


  const fetchPegawai = async () => {
    setLoadingNames(true);
    setErrorNames("");
    try {
      if (!GAS_URL) {
        setDaftarPegawai(DEFAULT_OFFLINE_PEGAWAI);
        setLoadingNames(false);
        return;
      }

      console.log(`[fetchPegawai] Mengirim request ke: ${GAS_URL}?action=getPegawai`);
      const res = await fetchWithRetry(`${GAS_URL}?action=getPegawai`);
      const data = await parseApiResponse(res, 'getPegawai');

      if (data.status === 'success') {
        console.log(`[fetchPegawai] Berhasil mendapatkan data pegawai:`, data.data);
        setDaftarPegawai(data.data);
        try {
          localStorage.setItem("cached_pegawai", JSON.stringify(data.data));
        } catch (e) {}
        setErrorNames("");
      } else {
        throw new Error(data.message || 'Unknown error');
      }
    } catch (err: any) {
      console.warn(`[fetchPegawai] Mode offline / server terkendala:`, err?.message || err);
      // Coba ambil dari offline cache terlebih dahulu
      let loaded = false;
      try {
        const cached = localStorage.getItem("cached_pegawai");
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setDaftarPegawai(parsed);
            loaded = true;
          }
        }
      } catch (e) {}
      if (!loaded) {
        setDaftarPegawai(DEFAULT_OFFLINE_PEGAWAI);
      }
      setErrorNames("");
    } finally {
      setLoadingNames(false);
    }
  };

  useEffect(() => {
    fetchPegawai();
    fetchSettings();
  }, [GAS_URL, activeTab]);


  const fetchRiwayat = async (pegawaiName: string, bulan: string = riwayatBulan) => {
    setLoadingRiwayat(true);
    setErrorRiwayat("");
    if (!GAS_URL) {
      setTimeout(() => {
        setRiwayat([
          { tanggal: getTodayString(), jamDatang: "08:00", jamPulang: "-", totalJam: "-", statusMasuk: "TEPAT WAKTU", statusPulang: "-", outlet: "YZ_ MDP PASIR JAHA BALARAJA", posisi: "Admin" },
          { tanggal: "01/06/2026", jamDatang: "08:15", jamPulang: "19:45", totalJam: "11j 30m", statusMasuk: "TELAT", statusPulang: "NORMAL", outlet: "YZ_ MDP PASIR JAHA BALARAJA", posisi: "Admin" },
        ]);
        setLoadingRiwayat(false);
      }, 800);
      return;
    }


    try {
      console.log(`[fetchRiwayat] Mendapatkan riwayat untuk ${pegawaiName} bulan ${bulan}...`);
      const res = await fetchWithRetry(`${GAS_URL}?action=getRiwayatBulan&nama=${encodeURIComponent(pegawaiName)}&bulan=${bulan}`);
      const data = await parseApiResponse(res, 'getRiwayatBulan');
      
      if (data.status === 'success') {
        console.log(`[fetchRiwayat] Sukses mendapatkan ${data.data?.length} baris riwayat.`);
        const formattedData = (data.data || []).map((r: any) => ({
          ...r,
          tanggal: formatSheetDate(r.tanggal),
          jamDatang: formatSheetTime(r.jamDatang),
          jamPulang: formatSheetTime(r.jamPulang),
        }));
        setRiwayat(formattedData);
        setErrorRiwayat("");
        const openRec = findOpenAttendanceToday(formattedData);
        if (openRec) {
          setKeterangan("PULANG");
          if (openRec.outlet) setOutlet(matchOutletOption(openRec.outlet));
          if (openRec.posisi) setPosisi(matchPosisiOption(openRec.posisi));
        }
      } else {
        throw new Error(data.message || 'Unknown error');
      }
    } catch (e: any) {
      console.warn(`[fetchRiwayat] Mode offline / fallback:`, e?.message || e);
      setRiwayat([
        { tanggal: getTodayString(), jamDatang: "08:00", jamPulang: "-", totalJam: "-", statusMasuk: "TEPAT WAKTU", statusPulang: "-", outlet: "YZ_ MDP PASIR JAHA BALARAJA", posisi: "Admin" },
        { tanggal: "01/06/2026", jamDatang: "08:15", jamPulang: "19:45", totalJam: "11j 30m", statusMasuk: "TELAT", statusPulang: "NORMAL", outlet: "YZ_ MDP PASIR JAHA BALARAJA", posisi: "Admin" },
      ]);
      setErrorRiwayat("");
    } finally {
      setLoadingRiwayat(false);
    }
  };


  const fetchRingkasanHarian = async () => {
    setLoadingRingkasan(true);
    setErrorRingkasan("");
    if (!GAS_URL) {
      setTimeout(() => {
        setRingkasanHarian([
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
          },
        ]);
        setLoadingRingkasan(false);
      }, 800);
      return;
    }


    try {
      console.log(`[fetchRingkasanHarian] Memuat ringkasan hari ini...`);
      const res = await fetchWithRetry(`${GAS_URL}?action=getRingkasanHarian`);
      const data = await parseApiResponse(res, 'getRingkasanHarian');
      
      if (data.status === 'success') {
        console.log(`[fetchRingkasanHarian] Berhasil mendapat ${data.data?.length} ringkasan harian.`);
        const formattedData = (data.data || []).map((r: any) => ({
          ...r,
          tanggal: formatSheetDate(r.tanggal),
          jamDatang: formatSheetTime(r.jamDatang),
          jamPulang: formatSheetTime(r.jamPulang),
        }));
        setRingkasanHarian(formattedData);
        try {
          localStorage.setItem("cached_ringkasan_harian", JSON.stringify(formattedData));
        } catch (e) {}
        setErrorRingkasan("");
      } else {
        throw new Error(data.message || 'Unknown error');
      }
    } catch (e: any) {
      console.warn(`[fetchRingkasanHarian] Mode offline / fallback:`, e?.message || e);
      // Coba load offline cache
      let loaded = false;
      try {
        const cached = localStorage.getItem("cached_ringkasan_harian");
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setRingkasanHarian(parsed);
            loaded = true;
          }
        }
      } catch (err) {}
      if (!loaded) {
        setRingkasanHarian(DEFAULT_OFFLINE_RINGKASAN);
      }
      setErrorRingkasan("");
    } finally {
      setLoadingRingkasan(false);
    }
  };


  const fetchLaporanBulanan = async (bulan: string = laporanBulan) => {
    setLoadingLaporan(true);
    setErrorLaporan("");
    if (!GAS_URL) {
      setTimeout(() => {
        setLaporanBulanan([
          { 
            nama: "Mohammad Danang", 
            posisi: "Admin",
            totalJamKerja: "145j 30m",
            jumlahJamLembur: 3,
            jumlahTelat: 2,
            jumlahMasuk: 20
          },
          { 
            nama: "Fitri Fajria", 
            posisi: "Pickup",
            totalJamKerja: "135j 15m",
            jumlahJamLembur: 0,
            jumlahTelat: 5,
            jumlahMasuk: 18
          },
        ]);
        setLaporanBulananOutlet([
          {
            outlet: "YZ_ MDP PASIR JAHA BALARAJA",
            totalJamKerja: "145j 30m",
            jumlahJamLembur: 3,
            jumlahTelat: 2,
            jumlahMasuk: 20,
            jumlahIzin: 0,
            daftarPegawai: [
              { nama: "Mohammad Danang", posisi: "Admin", totalJamKerja: "145j 30m", jumlahJamLembur: 3, jumlahTelat: 2, jumlahMasuk: 20 }
            ]
          },
          {
            outlet: "YZ_ MDP JAYANTI CIKANDE",
            totalJamKerja: "135j 15m",
            jumlahJamLembur: 0,
            jumlahTelat: 5,
            jumlahMasuk: 18,
            jumlahIzin: 1,
            daftarPegawai: [
              { nama: "Fitri Fajria", posisi: "Pickup", totalJamKerja: "135j 15m", jumlahJamLembur: 0, jumlahTelat: 5, jumlahMasuk: 18 }
            ]
          }
        ]);
        setLoadingLaporan(false);
      }, 800);
      return;
    }


    try {
      console.log(`[fetchLaporanBulanan] Memuat laporan untuk bulan ${bulan}...`);
      const res = await fetchWithRetry(`${GAS_URL}?action=getLaporanBulanan&bulan=${bulan}`);
      const data = await parseApiResponse(res, 'getLaporanBulanan');
      
      if (data.status === 'success') {
        console.log(`[fetchLaporanBulanan] Berhasil mendapatkan laporan ${data.data?.length} pegawai.`);
        setLaporanBulanan(data.data || []);
        setLaporanBulananOutlet(data.dataOutlet || []);
        setErrorLaporan("");
      } else {
        throw new Error(data.message || 'Unknown error');
      }
    } catch (e: any) {
      console.warn(`[fetchLaporanBulanan] Mode offline / fallback:`, e?.message || e);
      setLaporanBulanan([
        { 
          nama: "Mohammad Danang", 
          posisi: "Admin",
          totalJamKerja: "145j 30m",
          jumlahJamLembur: 3,
          jumlahTelat: 2,
          jumlahMasuk: 20
        },
        { 
          nama: "Fitri Fajria", 
          posisi: "Pickup",
          totalJamKerja: "135j 15m",
          jumlahJamLembur: 0,
          jumlahTelat: 5,
          jumlahMasuk: 18
        },
      ]);
      setLaporanBulananOutlet([
        {
          outlet: "YZ_ MDP PASIR JAHA BALARAJA",
          totalJamKerja: "145j 30m",
          jumlahJamLembur: 3,
          jumlahTelat: 2,
          jumlahMasuk: 20,
          jumlahIzin: 0,
          daftarPegawai: [
            { nama: "Mohammad Danang", posisi: "Admin", totalJamKerja: "145j 30m", jumlahJamLembur: 3, jumlahTelat: 2, jumlahMasuk: 20 }
          ]
        },
        {
          outlet: "YZ_ MDP JAYANTI CIKANDE",
          totalJamKerja: "135j 15m",
          jumlahJamLembur: 0,
          jumlahTelat: 5,
          jumlahMasuk: 18,
          jumlahIzin: 1,
          daftarPegawai: [
            { nama: "Fitri Fajria", posisi: "Pickup", totalJamKerja: "135j 15m", jumlahJamLembur: 0, jumlahTelat: 5, jumlahMasuk: 18 }
          ]
        }
      ]);
      setErrorLaporan("");
    } finally {
      setLoadingLaporan(false);
    }
  };

  const [savingSettings, setSavingSettings] = useState(false);

  const sendSaveSettings = async (data: any) => {
    const payload = {
      action: 'saveSettings',
      data
    };
    try {
      const response = await fetch(GAS_URL, {
        method: "POST",
        body: JSON.stringify(payload)
      });
      return await parseApiResponse(response, 'saveSettings');
    } catch (err: any) {
      console.warn("[saveSettings] POST error, trying GET fallback:", err?.message || err);
      const url = `${GAS_URL}?action=saveSettings&data=${encodeURIComponent(JSON.stringify(data))}`;
      const response = await fetch(url, { cache: 'no-store' });
      return await parseApiResponse(response, 'saveSettings');
    }
  };

  const toggleLocationTracking = async () => {
    const rawReq = settingsData?.requireLocation;
    const currentIsRequired = rawReq === true || rawReq === 'TRUE' || rawReq === 'true' || rawReq === undefined || rawReq === null;
    const newStatus = !currentIsRequired;

    const rawHours = settingsData?.enableWorkHours;
    const workHoursActive = rawHours === true || rawHours === 'TRUE' || rawHours === 'true' || rawHours === undefined || rawHours === null;
    
    // Update locally first for instant feedback (persisting to localStorage)
    const updatedSettings = {
      ...settingsData,
      requireLocation: newStatus,
      enableWorkHours: workHoursActive
    };
    setSettingsData(updatedSettings);
    try {
      localStorage.setItem("settingsData_offline", JSON.stringify(updatedSettings));
    } catch (e) {}

    if (!GAS_URL) {
      toast.success("Pengaturan lokasi berhasil diperbarui (Mode Preview).");
      return;
    }

    setSavingSettings(true);
    const loadingToastId = toast.loading("Menyimpan pengaturan...");
    try {
      const result = await sendSaveSettings({ 
        requireLocation: newStatus,
        enableWorkHours: workHoursActive,
        outlets: settingsData?.outlets || [],
        positions: availablePositions
      });
      if (result.status === "success") {
        toast.success("Pengaturan lokasi berhasil disimpan.", { id: loadingToastId });
      } else {
        toast.error(`Gagal menyimpan: ${result.message}`, { id: loadingToastId });
      }
    } catch (e: any) {
        toast.error(`Error menyimpan pengaturan: ${e.message}`, { id: loadingToastId });
    } finally {
        setSavingSettings(false);
    }
  };

  const toggleWorkHours = async () => {
    const rawHours = settingsData?.enableWorkHours;
    const currentIsActive = rawHours === true || rawHours === 'TRUE' || rawHours === 'true' || rawHours === undefined || rawHours === null;
    const newStatus = !currentIsActive;

    const rawReq = settingsData?.requireLocation;
    const isCurrentlyReq = rawReq === true || rawReq === 'TRUE' || rawReq === 'true' || rawReq === undefined || rawReq === null;

    const updatedSettings = {
      ...settingsData,
      enableWorkHours: newStatus,
      requireLocation: isCurrentlyReq
    };
    setSettingsData(updatedSettings);
    try {
      localStorage.setItem("settingsData_offline", JSON.stringify(updatedSettings));
    } catch (e) {}

    if (!GAS_URL) {
      toast.success(`Aturan jam masuk/pulang berhasil ${newStatus ? 'diaktifkan' : 'dinonaktifkan'} (Mode Preview).`);
      return;
    }

    setSavingSettings(true);
    const loadingToastId = toast.loading("Menyimpan pengaturan jam kerja...");
    try {
      const result = await sendSaveSettings({ 
        requireLocation: isCurrentlyReq,
        enableWorkHours: newStatus,
        outlets: settingsData?.outlets || [],
        positions: availablePositions
      });
      if (result.status === "success") {
        toast.success(`Aturan jam masuk/pulang berhasil ${newStatus ? 'diaktifkan' : 'dinonaktifkan'}.`, { id: loadingToastId });
      } else {
        toast.error(`Gagal menyimpan: ${result.message}`, { id: loadingToastId });
      }
    } catch (e: any) {
        toast.error(`Error menyimpan pengaturan: ${e.message}`, { id: loadingToastId });
    } finally {
        setSavingSettings(false);
    }
  };

  const handleUpdateOutlets = async (updatedOutlets: any[]) => {
    const rawReq = settingsData?.requireLocation;
    const isCurrentlyReq = rawReq === true || rawReq === 'TRUE' || rawReq === 'true' || rawReq === undefined || rawReq === null;

    const rawHours = settingsData?.enableWorkHours;
    const workHoursActive = rawHours === true || rawHours === 'TRUE' || rawHours === 'true' || rawHours === undefined || rawHours === null;

    // Update locally first for instant feedback (persisting to localStorage)
    const updatedSettings = {
      ...settingsData,
      requireLocation: isCurrentlyReq,
      enableWorkHours: workHoursActive,
      outlets: updatedOutlets
    };
    setSettingsData(updatedSettings);
    try {
      localStorage.setItem("settingsData_offline", JSON.stringify(updatedSettings));
    } catch (e) {}

    if (!GAS_URL) {
      toast.success("Koordinat outlet berhasil disimpan (Mode Preview).");
      return;
    }

    setSavingSettings(true);
    const loadingToastId = toast.loading("Menyimpan koordinat outlet...");
    try {
      const result = await sendSaveSettings({ 
        requireLocation: isCurrentlyReq,
        enableWorkHours: workHoursActive,
        outlets: updatedOutlets,
        positions: availablePositions
      });
      if (result.status === "success") {
        toast.success("Koordinat outlet berhasil disimpan ke Google Sheets.", { id: loadingToastId });
      } else {
        toast.error(`Gagal menyimpan: ${result.message}`, { id: loadingToastId });
      }
    } catch (e: any) {
        toast.error(`Error menyimpan koordinat: ${e.message}`, { id: loadingToastId });
    } finally {
        setSavingSettings(false);
    }
  };

  const handleUpdatePositions = async (updatedPositions: PositionConfig[]) => {
    const rawReq = settingsData?.requireLocation;
    const isCurrentlyReq = rawReq === true || rawReq === 'TRUE' || rawReq === 'true' || rawReq === undefined || rawReq === null;

    const rawHours = settingsData?.enableWorkHours;
    const workHoursActive = rawHours === true || rawHours === 'TRUE' || rawHours === 'true' || rawHours === undefined || rawHours === null;

    const updatedSettings = {
      ...settingsData,
      requireLocation: isCurrentlyReq,
      enableWorkHours: workHoursActive,
      positions: updatedPositions
    };
    setSettingsData(updatedSettings);
    try {
      localStorage.setItem("settingsData_offline", JSON.stringify(updatedSettings));
    } catch (e) {}

    if (!GAS_URL) {
      toast.success("Daftar posisi berhasil disimpan (Mode Preview).");
      return;
    }

    setSavingSettings(true);
    const loadingToastId = toast.loading("Menyimpan daftar posisi...");
    try {
      const result = await sendSaveSettings({ 
        requireLocation: isCurrentlyReq,
        enableWorkHours: workHoursActive,
        outlets: settingsData?.outlets || [],
        positions: updatedPositions
      });
      if (result.status === "success") {
        toast.success("Daftar posisi berhasil disimpan ke Google Sheets.", { id: loadingToastId });
      } else {
        toast.error(`Gagal menyimpan posisi: ${result.message}`, { id: loadingToastId });
      }
    } catch (e: any) {
        toast.error(`Error menyimpan posisi: ${e.message}`, { id: loadingToastId });
    } finally {
        setSavingSettings(false);
    }
  };

  const handleTogglePositionHours = (idx: number) => {
    const updated = [...availablePositions];
    const currentEnabled = updated[idx].enabled !== false;
    updated[idx] = {
      ...updated[idx],
      enabled: !currentEnabled
    };
    handleUpdatePositions(updated);
  };

  const handleAddPosisi = () => {
    const trimmed = newPosisiInput.trim();
    if (!trimmed) {
      toast.error("Nama posisi tidak boleh kosong.");
      return;
    }
    if (availablePositions.some(p => p.name.toLowerCase() === trimmed.toLowerCase())) {
      toast.error(`Posisi "${trimmed}" sudah ada.`);
      return;
    }

    const updated = [...availablePositions, { name: trimmed, jamMasuk: "08:00", jamPulang: "20:00", enabled: true }];
    setNewPosisiInput("");
    handleUpdatePositions(updated);
    toast.success(`Posisi "${trimmed}" berhasil ditambahkan.`);
  };

  const handleStartEditPosisi = (index: number, val: string) => {
    setEditingPosisiIndex(index);
    setEditingPosisiValue(val);
  };

  const handleSaveEditPosisi = (index: number) => {
    const trimmed = editingPosisiValue.trim();
    if (!trimmed) {
      toast.error("Nama posisi tidak boleh kosong.");
      return;
    }
    if (availablePositions.some((p, i) => i !== index && p.name.toLowerCase() === trimmed.toLowerCase())) {
      toast.error(`Posisi "${trimmed}" sudah ada.`);
      return;
    }

    const updated = [...availablePositions];
    updated[index] = { ...updated[index], name: trimmed };
    setEditingPosisiIndex(null);
    setEditingPosisiValue("");
    handleUpdatePositions(updated);
  };

  const handleDeletePosisi = (index: number) => {
    if (availablePositions.length <= 1) {
      toast.error("Minimal harus ada 1 posisi terdaftar.");
      return;
    }
    const removedName = availablePositions[index].name;
    const updated = availablePositions.filter((_, i) => i !== index);
    handleUpdatePositions(updated);
    toast.success(`Posisi "${removedName}" berhasil dihapus.`);
  };

  const fetchSettings = async () => {
    setLoadingSettings(true);
    setErrorSettings("");
    if (!GAS_URL) {
      setLoadingSettings(false);
      return;
    }
    try {
      console.log(`[fetchSettings] Memuat pengaturan...`);
      const res = await fetchWithRetry(`${GAS_URL}?action=getSettings`);
      const data = await parseApiResponse(res, 'getSettings');
      if (data.status === 'success') {
        const d = data.data || {};
        const rawReq = d.requireLocation;
        d.requireLocation = rawReq === true || rawReq === 'TRUE' || rawReq === 'true' || rawReq === undefined || rawReq === null;
        const rawHours = d.enableWorkHours;
        d.enableWorkHours = rawHours === true || rawHours === 'TRUE' || rawHours === 'true' || rawHours === undefined || rawHours === null;
        if (!d.positions || !Array.isArray(d.positions) || d.positions.length === 0) {
          d.positions = DEFAULT_POSITIONS;
        } else {
          d.positions = d.positions.map((p: any) => ({
            name: typeof p === 'string' ? p : p.name,
            jamMasuk: cleanTimeString(p.jamMasuk, "08:00"),
            jamPulang: cleanTimeString(p.jamPulang, "20:00"),
            enabled: p.enabled !== false && p.enabled !== 'FALSE' && p.enabled !== 'false'
          }));
        }
        d.outlets = Array.isArray(d.outlets) ? d.outlets : [];
        setSettingsData(d);
        try {
          localStorage.setItem("settingsData_offline", JSON.stringify(d));
        } catch (e) {}
        if (d.favicon) {
          updateFavicon(d.favicon);
        }
        setErrorSettings("");
      } else {
        throw new Error(data.message || 'Unknown error fetching settings');
      }
    } catch (e: any) {
      console.warn(`[fetchSettings] Server terkendala:`, e?.message || e);
      setErrorSettings("Data outlet belum tersedia atau gagal dimuat dari Google Spreadsheet. Silakan periksa koneksi dan sheet DataOutlet.");
    } finally {
      setLoadingSettings(false);
    }
  };


  const fetchDetailRiwayat = async (pegawaiName: string, bulan: string) => {
    setLoadingDetail(true);
    setSelectedPegawaiDetail({ nama: pegawaiName, bulan });
    setDetailRiwayat([]); // Reset old data
    
    if (!GAS_URL) {
      setTimeout(() => {
        setDetailRiwayat([
          { tanggal: "01/06/2026", jamDatang: "08:15", jamPulang: "19:45", statusMasuk: "TELAT", statusPulang: "NORMAL", outlet: "YZ_ MDP PASIR JAHA BALARAJA", posisi: "Admin" },
          { tanggal: "02/06/2026", jamDatang: "08:00", jamPulang: "20:00", statusMasuk: "TEPAT WAKTU", statusPulang: "NORMAL", outlet: "YZ_ MDP PASIR JAHA BALARAJA", posisi: "Admin" }
        ]);
        setLoadingDetail(false);
      }, 800);
      return;
    }


    try {
      const res = await fetch(`${GAS_URL}?action=getRiwayatBulan&nama=${encodeURIComponent(pegawaiName)}&bulan=${bulan}`, { cache: 'no-store' });
      const data = await parseApiResponse(res, 'getRiwayatBulan');
      if (data.status === 'success') {
        const formattedData = (data.data || []).map((r: any) => ({
          ...r,
          tanggal: formatSheetDate(r.tanggal),
          jamDatang: formatSheetTime(r.jamDatang),
          jamPulang: formatSheetTime(r.jamPulang),
        }));
        setDetailRiwayat(formattedData);
      }
    } catch (e) {
      console.warn('[fetchDetailRiwayat] Mode offline / fallback:', e);
    } finally {
      setLoadingDetail(false);
    }
  };


  useEffect(() => {
    if (activeTab === 'absen' && nama) {
      fetchRiwayat(nama, riwayatBulan);
    }
  }, [nama, activeTab, riwayatBulan]);


  useEffect(() => {
    if (activeTab === 'owner' && isOwnerLoggedIn) {
      if (ownerView === 'harian') fetchRingkasanHarian();
      if (ownerView === 'bulanan') fetchLaporanBulanan(laporanBulan);
    }
  }, [activeTab, isOwnerLoggedIn, ownerView, laporanBulan]);





  const handleBuktiFeishu = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result) {
        setBuktiFeishuBase64(event.target.result as string);
      }
    };
    reader.readAsDataURL(file);
  };


  const prosesWatermark = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;


    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let w = img.width;
        let h = img.height;
        const limit = 800;
        
        if (w > limit) {
          h *= limit / w;
          w = limit;
        }
        
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;


        ctx.drawImage(img, 0, 0, w, h);


        const now = new Date();
        const tgl = `${now.toLocaleDateString('id-ID')} ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')} WIB`;
        const namaUser = nama || "Pegawai";
        
        const fSize = Math.min(w * 0.05, 30);
        ctx.font = `bold ${fSize}px sans-serif`;
        ctx.textAlign = "center";
        
        // Setup shadow/stroke for visibility
        ctx.fillStyle = "white";
        ctx.strokeStyle = "rgba(0,0,0,0.8)";
        ctx.lineWidth = 3;
        
        // Draw Name
        ctx.strokeText(namaUser, w / 2, h - 50);
        ctx.fillText(namaUser, w / 2, h - 50);
        
        // Draw Date
        ctx.strokeText(tgl, w / 2, h - 15);
        ctx.fillText(tgl, w / 2, h - 15);


        setImageBase64(canvas.toDataURL("image/jpeg", 0.7));
      };
      if (event.target?.result) {
        img.src = event.target.result as string;
      }
    };
    reader.readAsDataURL(file);
  };


  const kirimAbsen = () => {
    
    if (!nama) return toast.error("Pilih Nama Pegawai terlebih dahulu!");
    if (keterangan !== "PULANG" && !posisi) return toast.error("Pilih Posisi terlebih dahulu!");
    
    if (keterangan === "PULANG") {
      // 1. Cari record terbuka hari ini (open attendance: tanggal hari ini, jamDatang valid, belum ada jamPulang)
      const openRecord = findOpenAttendanceToday(riwayat);
      if (!openRecord) {
        // 2. Jika tidak ada record terbuka, periksa apakah sudah ada record hari ini yang sudah pulang
        const closedRecord = findClosedAttendanceToday(riwayat);
        if (closedRecord) {
          return toast.error("Anda sudah melakukan absen PULANG hari ini!");
        }
        // 3. Jika belum pernah absen datang hari ini
        return toast.error("Anda belum absen DATANG hari ini!");
      }
    }


    if (keterangan === "DATANG" && outlet) {
      const sudahAbsenDiOutletIni = riwayat.some(r => {
        if (!r.tanggal) return false;
        return isToday(r.tanggal) && r.outlet === outlet && hasValidTime(r.jamDatang);
      });
      if (sudahAbsenDiOutletIni) {
        return toast.error("Anda sudah melakukan absen DATANG hari ini di outlet ini! Kalau backup shift di outlet lain, pilih outlet yang berbeda.");
      }
    }


    if (keterangan !== "IZIN") {
      if (!outlet) return toast.error("Pilih Outlet tempat Anda absen!");
      if (!imageBase64) return toast.error("Silahkan ambil foto selfie bukti absensi!");
      if (isLate && !keteranganTelat) return toast.error("Harap isi keterangan alasan Anda telat!");
      if (isEarlyLeave && !keteranganPulangCepat) return toast.error("Harap isi keterangan alasan Anda pulang cepat!");
    } else {
      if (!alasan) return toast.error("Alasan detail tidak boleh kosong!");
      if (!imageBase64) return toast.error("Harap lampirkan bukti foto (Surat dokter / bukti lainnya)!");
    }


    setLoadingSubmit(true);
    setSubmitStatus("Memulai...");
    toast.info("Memproses data absen...");

    const sendPayload = async (userLat: number, userLng: number) => {
        setSubmitStatus("Mengirim data absensi ke sistem...");
        toast.info("⏳ Mengirim data absen, mohon tunggu...");

        // Dapatkan jam datang jika status PULANG untuk mencegah error di backend
        let jamDatangTerdata = "";
        const openRecord = findOpenAttendanceToday(riwayat);
        const targetOutlet = (keterangan === "PULANG" && openRecord?.outlet) ? openRecord.outlet : (outlet || "-");
        const targetPosisi = (keterangan === "PULANG" && openRecord?.posisi) ? (openRecord.posisi as PosisiPegawai) : (posisi || "");

        if (keterangan === "PULANG") {
          const raw = openRecord?.jamDatang || "";
          const formatted = formatSheetTime(raw);
          jamDatangTerdata = (formatted && formatted !== "-") ? formatted : "";
        }
        
        const effectiveGpsUrl = (Number(userLat) !== 0 && Number(userLng) !== 0) ? `https://maps.google.com/?q=${userLat},${userLng}` : "-";
        const payload = {
          action: "processForm",
          data: {
            nama: nama,
            posisi: targetPosisi,
            status: keterangan,
            jenisIzin: keterangan === "IZIN" ? jenisIzin : "",
            outlet: keterangan === "IZIN" ? "TIDAK MASUK" : targetOutlet,
            alasan: keterangan === "IZIN" ? alasan : (isLate ? keteranganTelat : (isEarlyLeave ? keteranganPulangCepat : "")),
            lat: Number(userLat),
            lng: Number(userLng),
            lokasi: effectiveGpsUrl,
            lokasiPulang: effectiveGpsUrl,
            lokasiDatang: effectiveGpsUrl,
            image: imageBase64, // Always send image, either selfie or doctor note
            buktiFeishu: "",
            jamDatang: jamDatangTerdata
          }
        };


        if (!GAS_URL) {
          // Simulate submit in AI Studio
          setTimeout(() => {
            setLoadingSubmit(false);
            const mockGps = (Number(userLat) !== 0 && Number(userLng) !== 0) ? `https://maps.google.com/?q=${userLat},${userLng}` : "-";
            toast.success(`✅ Berhasil Absen (Mode Preview). Lokasi: ${mockGps}`);
            setImageBase64("");
            setBuktiFeishuBase64("");
            setIsFeishuOpen(false);
            fetchRiwayat(nama);
            setTimeout(() => {
              document.getElementById('riwayat-absen')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 300);
          }, 1500);
          return;
        }


        try {
          console.log(`[kirimAbsen] Kirim payload (POST) ke: ${GAS_URL}`);
          console.log(`[kirimAbsen] Data yg dikirim:`, payload);
          const res = await fetch(GAS_URL, {
            method: 'POST',
            body: JSON.stringify(payload)
          });
          const result = await parseApiResponse(res, 'submitAbsen');
          
          if (result.status === 'success') {
            console.log(`[kirimAbsen] Berhasil mencatat absen:`, result);
            toast.success(result.message);
            setImageBase64(""); // reset photo
            setBuktiFeishuBase64("");
            setIsFeishuOpen(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
            if (feishuImageInputRef.current) feishuImageInputRef.current.value = '';
            fetchRiwayat(nama);
            setTimeout(() => {
              document.getElementById('riwayat-absen')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 300);
          } else {
            console.warn(`[kirimAbsen] Tanggapan API:`, result.message);
            toast.error(`Gagal: ${result.message}`);
          }
        } catch (err: any) {
          console.warn(`[kirimAbsen] Exception Fetch/POST:`, err);
          toast.error(`Error: ${err.message}`);
        } finally {
          setLoadingSubmit(false);
          setSubmitStatus("");
        }
    };

    const rawReq = settingsData?.requireLocation;
    const requireLocation = rawReq === true || rawReq === 'TRUE' || rawReq === 'true' || rawReq === undefined || rawReq === null;

    if (keterangan === 'IZIN') {
      sendPayload(0, 0); // Skip GPS requirement for IZIN
      return;
    }

    // Jika requireLocation = FALSE, coba ambil koordinat GPS secara pasif/cepat jika tersedia, 
    // jika gagal atau tidak didukung tetap izinkan submit tanpa GPS
    if (!requireLocation) {
      if (lastKnownLocationRef.current && (Date.now() - lastKnownLocationRef.current.timestamp < 300000)) {
        sendPayload(lastKnownLocationRef.current.lat, lastKnownLocationRef.current.lng);
        return;
      }
      if (typeof navigator !== "undefined" && navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const userLat = pos?.coords?.latitude;
            const userLng = pos?.coords?.longitude;
            if (typeof userLat === "number" && typeof userLng === "number" && Number.isFinite(userLat) && Number.isFinite(userLng) && !(userLat === 0 && userLng === 0)) {
              lastKnownLocationRef.current = { lat: userLat, lng: userLng, timestamp: Date.now() };
              sendPayload(userLat, userLng);
            } else {
              const cached = lastKnownLocationRef.current;
              sendPayload(cached ? cached.lat : 0, cached ? cached.lng : 0);
            }
          },
          () => {
            const cached = lastKnownLocationRef.current;
            sendPayload(cached ? cached.lat : 0, cached ? cached.lng : 0);
          },
          { enableHighAccuracy: false, timeout: 6000, maximumAge: 120000 }
        );
      } else {
        const cached = lastKnownLocationRef.current;
        sendPayload(cached ? cached.lat : 0, cached ? cached.lng : 0);
      }
      return;
    }

    // Mulai alur requireLocation = TRUE
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setLoadingSubmit(false);
      setSubmitStatus("");
      return toast.error("Browser tidak mendukung GPS/Geolocation. Pastikan izin lokasi aktif dan coba lagi.");
    }

    setSubmitStatus("Mendapatkan lokasi GPS...");
    toast.info("Mendapatkan lokasi GPS...");
    
    const requestGPS = (useHighAcc: boolean, timeoutMs: number, maxAgeMs: number) => {
      setSubmitStatus(useHighAcc ? "Mencari GPS akurasi tinggi..." : "Gagal dapat satelit, re-try GPS akurasi rendah...");
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const userLat = pos?.coords?.latitude;
          const userLng = pos?.coords?.longitude;

          // Validasi GPS sebelum kirim absen
          const isValidLat = typeof userLat === "number" && Number.isFinite(userLat);
          const isValidLng = typeof userLng === "number" && Number.isFinite(userLng);

          if (!isValidLat || !isValidLng || (userLat === 0 && userLng === 0)) {
            setLoadingSubmit(false);
            setSubmitStatus("");
            return toast.error("Lokasi GPS belum tersedia. Pastikan izin lokasi aktif dan coba lagi.");
          }

          // Verifikasi Radius Lokasi
          let outletLat = 0;
          let outletLng = 0;
          let maxRadius = 150;

          const openRec = findOpenAttendanceToday(riwayat);
          const effectiveOutlet = (keterangan === "PULANG" && openRec?.outlet) ? openRec.outlet : outlet;

          if (settingsData?.outlets && settingsData.outlets.length > 0) {
            const selectedOutlet = settingsData.outlets.find((o: any) => normalizeOutletName(o.nama) === normalizeOutletName(effectiveOutlet));
            if (selectedOutlet) {
              outletLat = selectedOutlet.lat;
              outletLng = selectedOutlet.lng;
              maxRadius = selectedOutlet.radius || 150;
            }
          }

          if (settingsData?.requireLocation && (outletLat === 0 || outletLng === 0)) {
            setLoadingSubmit(false);
            setSubmitStatus("");
            return toast.error(`Koordinat untuk outlet "${effectiveOutlet}" belum diatur di sheet DataOutlet. Silakan hubungi Admin/Owner.`);
          }

          if (outletLat !== 0 && outletLng !== 0) {
            setSubmitStatus("Memeriksa kesesuaian radius dengan outlet...");
            const distance = calculateDistance(userLat, userLng, outletLat, outletLng);

            if (distance > maxRadius) {
              setLoadingSubmit(false);
              setSubmitStatus("");
              return toast.error(`Lokasi Anda terlalu jauh dari outlet! (Jarak: ${Math.round(distance)} meter). Maksimal radius adalah ${maxRadius} meter.`);
            }
          }

          // Simpan koordinat aktif dan kirim payload
          lastKnownLocationRef.current = { lat: userLat, lng: userLng, timestamp: Date.now() };
          sendPayload(userLat, userLng);
        },
        (err) => {
          if (useHighAcc && (err.code === 3 || err.code === 2)) {
             console.warn("GPS High Accuracy timeout/unavailable. Retrying with Low Accuracy...", err);
             setSubmitStatus("GPS Timeout. Mencoba sinyal rendah...");
             toast.info("Sinyal GPS lemah, mencoba alternatif lokasi...");
             requestGPS(false, 15000, 60000); // Fallback: low accuracy, wait 15s, allow 1 min old cache
             return;
          }
          
          setLoadingSubmit(false);
          setSubmitStatus("");
          console.warn("GPS Error:", err);
          let errMsg = "Lokasi GPS belum tersedia. Pastikan izin lokasi aktif dan coba lagi.";
          if (err.code === 1) errMsg = "Akses Lokasi Ditolak! Tolong izinkan GPS di pengaturan browser Anda.";
          else if (err.code === 2) errMsg = "Lokasi Tidak Tersedia! Pastikan GPS perangkat aktif dan ada koneksi internet.";
          else if (err.code === 3) errMsg = "Pencarian lokasi Timeout. Sinyal lemah, coba di tempat yang lebih terbuka atau gunakan koneksi Wi-Fi.";
          toast.error(errMsg);
        },
        { enableHighAccuracy: useHighAcc, timeout: timeoutMs, maximumAge: maxAgeMs }
      );
    };
    
    // Attempt 1: High Accuracy, 12 detik, tanpa cache
    requestGPS(true, 12000, 0);
  };


  // Logika tampilan Iframe form Feishu
  const showFeishu = () => {
    if (posisi !== "Admin") return false;

    const isAdminPasirJaha = outlet.toUpperCase().includes("PASIR JAHA") || outlet === "YZ_ MDP PASIR JAHA BALARAJA";
    const isAdminJayanti = outlet.toUpperCase().includes("JAYANTI") || outlet === "YZ_ MDP JAYANTI CIKANDE";
    
    if (keterangan !== "IZIN" && (isAdminPasirJaha || isAdminJayanti)) {
      if (keterangan === "PULANG") {
        return new Date().getHours() >= 20;
      }
      return true; // Untuk DATANG langsung show
    }
    return false;
  };


  const handleOwnerLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (ownerPasswordInput === "jntowner") {
      setIsOwnerLoggedIn(true);
      localStorage.setItem("isOwnerLoggedIn", "true");
      setOwnerLoginError("");
    } else {
      setOwnerLoginError("Password salah!");
    }
  };


  const handleHapusCache = () => {
    const toastId = toast.loading("Sedang menghapus cache sistem...");
    setTimeout(() => {
      try {
        localStorage.clear();
        sessionStorage.clear();
        
        if (navigator.serviceWorker) {
          navigator.serviceWorker.getRegistrations().then((registrations) => {
            for (const r of registrations) {
              r.unregister();
            }
          });
        }
        
        if (window.caches) {
          caches.keys().then((names) => {
            for (const name of names) {
              caches.delete(name);
            }
          });
        }
        
        toast.success("Cache berhasil dibersihkan! Memuat ulang...", { id: toastId });
        setTimeout(() => {
          window.location.reload();
        }, 800);
      } catch (err) {
        toast.error("Gagal membersihkan cache secara penuh, memuat ulang...", { id: toastId });
        setTimeout(() => {
          window.location.reload();
        }, 1000);
      }
    }, 1200);
  };


  return (
    <div className="min-h-screen bg-neutral-100 p-4 md:p-8 font-sans text-neutral-800 flex flex-col items-center">
      <Toaster position="top-center" richColors />
      
      {/* Reminder Absen Pulang */}



      {/* Navigation Tabs */}
      <div className="w-full max-w-sm mb-6 flex gap-3 p-1 bg-neutral-200/60 rounded-xl">
        <button 
          onClick={() => setActiveTab('absen')}
          className={`flex-1 py-2.5 rounded-lg font-bold text-sm transition-all flex justify-center items-center gap-2 ${activeTab === 'absen' ? 'bg-white text-[#cc0000] shadow-sm' : 'text-neutral-500 hover:text-neutral-700'}`}
        >
          <Camera className="w-4 h-4" />
          Absensi
        </button>
        <button 
          onClick={() => setActiveTab('owner')}
          className={`flex-1 py-2.5 rounded-lg font-bold text-sm transition-all flex justify-center items-center gap-2 ${activeTab === 'owner' ? 'bg-white text-[#cc0000] shadow-sm' : 'text-neutral-500 hover:text-neutral-700'}`}
        >
          <Users className="w-4 h-4" />
          Owner
        </button>
      </div>


      {activeTab === 'absen' && (
        <>
          <div className="w-full max-w-md bg-white rounded-xl shadow-lg border border-neutral-200 overflow-hidden">
            
            {/* Header */}
            <div className="bg-[#cc0000] p-4 text-center">
              <h1 className="text-xl font-bold text-white tracking-wide">ABSENSI J&T</h1>
            </div>


        {/* Formulir */}
        <div className="p-6 space-y-5">


          <div className="space-y-4">
            {/* Nama */}
            <div>
              <label className="block text-sm font-semibold text-neutral-700 mb-1">Nama Pegawai</label>
              <select 
                value={nama} 
                onChange={e => setNama(e.target.value)}
                disabled={loadingNames}
                className="w-full p-2.5 bg-neutral-50 border border-neutral-300 rounded-md focus:ring-2 focus:ring-[#cc0000] focus:border-red-500 outline-none transition"
              >
                <option value="" disabled>{loadingNames ? "Memuat nama..." : "Pilih Nama Pegawai"}</option>
                {daftarPegawai.map((n, i) => <option key={i} value={n}>{n}</option>)}
              </select>
              {errorNames && (
                <div className="mt-2 p-2 bg-red-50 border border-red-200 text-sm text-red-700 rounded flex flex-col sm:flex-row sm:justify-between items-start sm:items-center gap-2">
                  <span className="leading-tight">{errorNames}</span>
                  <button type="button" onClick={() => fetchPegawai()} className="shrink-0 px-3 py-1 bg-white border border-red-300 font-bold rounded hover:bg-red-50 transition shadow-sm">
                    Coba Lagi
                  </button>
                </div>
              )}
            </div>


            {/* Posisi */}
            <div>
              <label className="block text-sm font-semibold text-neutral-700 mb-1">Posisi</label>
              <select 
                value={posisi} 
                onChange={e => setPosisi(e.target.value as PosisiPegawai)}
                disabled={keterangan === 'PULANG'}
                className="w-full p-2.5 bg-neutral-50 border border-neutral-300 rounded-md focus:ring-2 focus:ring-[#cc0000] outline-none transition disabled:opacity-60 disabled:bg-neutral-100 font-medium text-neutral-800"
              >
                <option value="" disabled>Pilih Posisi</option>
                {posisi && !availablePositions.some(p => p.name === posisi) && (
                  <option value={posisi}>{posisi}</option>
                )}
                {availablePositions.map((p) => (
                  <option key={p.name} value={p.name}>{p.name}</option>
                ))}
              </select>
              {keterangan === 'PULANG' && (
                <p className="text-[11px] text-neutral-500 mt-1">Otomatis diambil dari data absen DATANG aktif.</p>
              )}
            </div>


            {/* Keterangan */}
            <div>
              <label className="block text-sm font-semibold text-neutral-700 mb-1">Aktivitas</label>
              <select 
                value={keterangan} 
                onChange={e => setKeterangan(e.target.value as StatusAbsen)}
                className="w-full p-2.5 bg-neutral-50 border border-neutral-300 rounded-md focus:ring-2 focus:ring-[#cc0000] focus:border-red-500 outline-none transition font-medium"
              >
                <option value="" disabled>Pilih Aktivitas</option>
                <option value="DATANG">DATANG (Mulai Kerja)</option>
                <option value="PULANG">PULANG (Selesai)</option>
                <option value="IZIN">IZIN (Tidak Masuk)</option>
              </select>
              {keterangan === 'PULANG' && openAttendanceToday && (
                <div className="mt-1.5 p-2 bg-emerald-50 border border-emerald-200 rounded text-xs text-emerald-800">
                  Absen DATANG aktif terdeteksi ({openAttendanceToday.outlet || outlet || '-'}).
                </div>
              )}
            </div>


            {/* Dinamis: Izin vs Hadir */}
            {keterangan === 'IZIN' ? (
              <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                <div>
                  <label className="block text-sm font-semibold text-neutral-700 mb-2">Jenis Ketidakhadiran</label>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 cursor-pointer bg-neutral-50 px-4 py-2 border border-neutral-200 rounded-md hover:bg-neutral-100 transition shadow-sm w-full">
                      <input type="radio" value="Izin" checked={jenisIzin === "Izin"} onChange={() => setJenisIzin("Izin")} className="w-4 h-4 text-[#cc0000] accent-[#cc0000]" />
                      <span className="text-sm font-bold text-neutral-700">Izin</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer bg-neutral-50 px-4 py-2 border border-neutral-200 rounded-md hover:bg-neutral-100 transition shadow-sm w-full">
                      <input type="radio" value="Sakit" checked={jenisIzin === "Sakit"} onChange={() => setJenisIzin("Sakit")} className="w-4 h-4 text-[#cc0000] accent-[#cc0000]" />
                      <span className="text-sm font-bold text-neutral-700">Sakit</span>
                    </label>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-neutral-700 mb-1">Alasan Detail</label>
                  <input 
                    type="text" 
                    value={alasan}
                    onChange={e => setAlasan(e.target.value)}
                    placeholder={`Masukkan alasan ${jenisIzin.toLowerCase()} Anda...`}
                    className="w-full p-2.5 bg-neutral-50 border border-neutral-300 rounded-md focus:ring-2 focus:ring-[#cc0000] focus:border-red-500 outline-none transition"
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                
                {/* Alasan Telat */}
                {isLate && (
                  <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                    <label className="block text-sm font-semibold text-neutral-700 mb-1">
                      Keterangan Telat <span className="text-red-500">*</span>
                    </label>
                    <input 
                      type="text" 
                      value={keteranganTelat}
                      onChange={e => setKeteranganTelat(e.target.value)}
                      placeholder="Masukkan alasan keterlambatan..."
                      className="w-full p-2.5 bg-neutral-50 border border-red-300 rounded-md focus:ring-2 focus:ring-red-500 outline-none transition"
                    />
                  </div>
                )}

                {/* Alasan Pulang Cepat */}
                {isEarlyLeave && (
                  <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                    <label className="block text-sm font-semibold text-neutral-700 mb-1">
                      Keterangan Pulang Cepat <span className="text-red-500">*</span>
                    </label>
                    <input 
                      type="text" 
                      value={keteranganPulangCepat}
                      onChange={e => setKeteranganPulangCepat(e.target.value)}
                      placeholder="Masukkan alasan pulang cepat (mis. sakit, izin)..."
                      className="w-full p-2.5 bg-neutral-50 border border-amber-300 rounded-md focus:ring-2 focus:ring-amber-500 outline-none transition"
                    />
                  </div>
                )}


                {/* Outlet */}
                <div>
                  <label className="block text-sm font-semibold text-neutral-700 mb-1">Outlet</label>
                  <select 
                    value={outlet} 
                    onChange={e => setOutlet(e.target.value)}
                    disabled={keterangan === 'PULANG'}
                    className="w-full p-2.5 bg-neutral-50 border border-neutral-300 rounded-md focus:ring-2 focus:ring-[#cc0000] outline-none transition disabled:opacity-60 disabled:bg-neutral-100"
                  >
                    <option value="" disabled>Pilih Lokasi Outlet</option>
                    {outlet && !(settingsData?.outlets && settingsData.outlets.some((o: any) => o.nama === outlet)) && (
                      <option value={outlet}>{outlet}</option>
                    )}
                    {settingsData?.outlets && settingsData.outlets.length > 0 ? (
                      settingsData.outlets.map((o: any) => (
                        <option key={o.nama} value={o.nama}>{o.nama}</option>
                      ))
                    ) : (
                      <option value="" disabled>
                        {loadingSettings ? "Memuat data outlet..." : "Data outlet belum tersedia. Silakan periksa sheet DataOutlet."}
                      </option>
                    )}
                  </select>
                  {(!settingsData?.outlets || settingsData.outlets.length === 0) && !loadingSettings && (
                    <div className="flex items-center justify-between text-[11px] text-amber-700 bg-amber-50 p-2 rounded border border-amber-200 mt-1.5">
                      <span>Data outlet belum tersedia dari spreadsheet.</span>
                      <button 
                        type="button" 
                        onClick={fetchSettings} 
                        className="font-bold underline hover:text-amber-900 cursor-pointer"
                      >
                        Coba Lagi
                      </button>
                    </div>
                  )}
                  {keterangan === 'PULANG' && (
                    <p className="text-[11px] text-neutral-500 mt-1">Otomatis diambil dari data absen DATANG aktif.</p>
                  )}
                </div>
              </div>
            )}

            {/* Foto Section (Dinamis: Selfie atau Upload Bukti) */}
            <div className="border border-dashed border-neutral-300 rounded-lg p-4 bg-neutral-50 text-center relative mt-4 animate-in fade-in">
              <label className="block text-sm font-semibold text-neutral-700 mb-3 text-left">
                {keterangan === 'IZIN' ? 'Upload Surat Dokter / Bukti Izin' : 'Foto Selfie (Watermark Otomatis)'}
              </label>
              
              {imageBase64 ? (
                <div className="relative group rounded-md overflow-hidden bg-black">
                  <img src={imageBase64} alt="Preview" className="w-full h-auto object-contain max-h-[350px] mx-auto rounded" />
                  <button 
                    onClick={() => { setImageBase64(""); if (fileInputRef.current) fileInputRef.current.value = ""; }}
                    className="absolute top-2 right-2 bg-red-600 text-white rounded-full p-1.5 shadow-lg flex items-center justify-center opacity-90 hover:opacity-100 transition"
                    title="Hapus Foto"
                  >
                     <AlertCircle className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div 
                  className="cursor-pointer flex flex-col items-center justify-center py-6 px-4 bg-white border border-neutral-200 rounded shadow-sm hover:bg-neutral-100 transition"
                  onClick={() => fileInputRef.current?.click()}
                >
                  {keterangan === 'IZIN' ? <FileImage className="w-10 h-10 text-neutral-400 mb-2" /> : <Camera className="w-10 h-10 text-neutral-400 mb-2" />}
                  <span className="text-sm font-medium text-neutral-600">{keterangan === 'IZIN' ? 'Pilih Gambar Bukti' : 'Ambil/Pilih Foto'}</span>
                  <span className="text-xs text-neutral-400 mt-1">
                    {keterangan === 'IZIN' ? 'Upload foto surat keterangan/pendukung' : 'Gunakan kamera depan untuk selfie bukti kehadiran'}
                  </span>
                </div>
              )}

              <input 
                ref={fileInputRef}
                type="file" 
                accept="image/jpeg, image/png, image/webp" 
                capture={keterangan === 'IZIN' ? undefined : "user"} 
                onChange={prosesWatermark}
                className="hidden" 
              />
            </div>
          </div>


          {/* Feishu Integration */}
          {showFeishu() && (
            <div className="w-full mt-6 flex flex-col items-center animate-in fade-in slide-in-from-bottom-4 duration-500 border border-neutral-200 rounded-lg overflow-hidden shadow-sm bg-white">
              <div className="w-full text-center font-bold bg-[#ffcc00] text-amber-900 py-2.5 text-sm flex items-center justify-center gap-2">
                <ClipboardList className="w-4 h-4" />
                WAJIB ISI FORM PUSAT (FEISHU)
              </div>
              
              {/* Solusi Khusus iPhone / Masalah Upload Selfie */}
              <div className="p-3 w-full bg-amber-50 border-b border-neutral-200 flex flex-col md:flex-row items-center justify-between gap-3 px-4">
                <div className="flex gap-2.5 items-start">
                  <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div className="text-left">
                    <p className="text-[12px] font-bold text-amber-800">
                      Kendala Upload Foto di iPhone?
                    </p>
                    <p className="text-[11px] text-amber-700 leading-snug mt-1">
                      Sistem iOS/iPhone (Safari/Chrome) memblokir pengunggahan foto di dalam frame. Jika foto selfie Anda tidak terupload pada form di bawah, silakan tekan tombol merah di sebelah kanan untuk mengisinya langsung secara lancar di browser handphone Anda.
                    </p>
                  </div>
                </div>
                <a 
                  href="https://jtexpress.sg.feishu.cn/share/base/form/shrlgF7kXWhZJOFC4wOQSOWbo6g" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="shrink-0 w-full md:w-auto text-center bg-[#cc0000] hover:bg-[#a30000] active:scale-95 text-white font-bold text-xs py-2 px-3.5 rounded-lg shadow-sm transition flex items-center justify-center gap-1.5"
                >
                  <ExternalLink className="w-4 h-4" />
                  Buka Form di Tab Baru
                </a>
              </div>
              
              <div className="w-full h-[550px] border-b border-neutral-200 bg-neutral-50">
                <iframe 
                  src="https://jtexpress.sg.feishu.cn/share/base/form/shrlgF7kXWhZJOFC4wOQSOWbo6g" 
                  className="w-full h-full border-0"
                  title="Form Feishu"
                  allow="geolocation"
                />
              </div>
              
              <div className="p-4 w-full flex flex-col items-center gap-3 bg-neutral-50">
                <p className="text-xs text-neutral-600 text-center font-medium">
                  Silakan isi form Feishu di atas langsung pada frame ini atau melalui tab baru. Setelah selesai mengisi form, klik tombol <strong>"Kirim Absensi"</strong> di bawah untuk menyelesaikan proses pencatatan absen di sistem internal.
                </p>
              </div>
            </div>
          )}


          <button 
            onClick={kirimAbsen}
            disabled={loadingSubmit}
            className="w-full flex items-center justify-center gap-2 bg-[#cc0000] hover:bg-[#a30000] text-white font-bold py-3.5 px-4 rounded-md shadow transition disabled:opacity-70 disabled:cursor-not-allowed mt-6"
          >
            {loadingSubmit ? (
              <>
                <svg className="animate-spin -ml-1 mr-2 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                <span>Memproses...</span>
              </>
            ) : (
              <>
                <Send className="w-5 h-5" />
                <span>KIRIM ABSEN</span>
              </>
            )}
          </button>
          
          {/* Dynamic Status Indicator */}
          {submitStatus && (
            <div className="mt-3 w-full flex items-center justify-center gap-2 animate-in fade-in duration-300">
              <span className="relative flex h-2.5 w-2.5 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#cc0000] opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#cc0000]"></span>
              </span>
              <p className="text-xs font-medium text-neutral-600 truncate">{submitStatus}</p>
            </div>
          )}
        </div>
      </div>


      {/* Riwayat Pribadi */}
      {nama && activeTab === 'absen' && (
        <div id="riwayat-absen" className="w-full max-w-md mt-6 bg-white border border-neutral-200 rounded-xl shadow-sm overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="bg-neutral-50 px-4 py-3 border-b border-neutral-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div className="font-bold text-neutral-700 flex items-center gap-2 text-sm">
              <History className="w-4 h-4 text-[#cc0000]" />
              Riwayat Absensi
            </div>
            <div className="flex items-center gap-2 self-end sm:self-auto">
              <input 
                type="month" 
                value={riwayatBulan} 
                onChange={(e) => setRiwayatBulan(e.target.value)}
                className="p-1 px-2 text-xs bg-white border border-neutral-300 rounded-md focus:ring-2 focus:ring-[#cc0000] outline-none font-medium text-neutral-700 h-[30px]"
              />
              <button 
                onClick={() => fetchRiwayat(nama, riwayatBulan)} 
                className="text-xs text-neutral-500 hover:text-neutral-800 hover:underline font-bold bg-white border border-neutral-200 px-2.5 h-[30px] rounded-md transition shadow-sm"
              >
                Refresh
              </button>
            </div>
          </div>
          
          {!loadingRiwayat && !errorRiwayat && riwayat.length > 0 && (
            <div className="px-4 py-3 bg-white border-b border-neutral-100 flex items-center gap-3">
              <div className="flex-1 bg-emerald-50/80 border border-emerald-100 rounded-lg p-2.5 flex items-center gap-3 shadow-sm">
                <div className="bg-emerald-100/80 text-emerald-600 p-2 rounded-md shrink-0">
                   <CalendarDays className="w-4 h-4" />
                </div>
                <div>
                   <p className="text-[10px] uppercase tracking-wider font-bold text-emerald-800">Total Masuk</p>
                   <div className="flex items-baseline gap-1 mt-0.5">
                     <p className="text-lg font-black text-emerald-700 leading-none">{riwayat.filter(r => r.keterangan !== 'IZIN' && r.jamDatang && r.jamDatang !== '-').length}</p>
                     <span className="text-xs font-semibold text-emerald-600">Hari</span>
                   </div>
                </div>
              </div>
              <div className="flex-1 bg-rose-50/80 border border-rose-100 rounded-lg p-2.5 flex items-center gap-3 shadow-sm">
                <div className="bg-rose-100/80 text-rose-600 p-2 rounded-md shrink-0">
                   <Clock className="w-4 h-4" />
                </div>
                <div>
                   <p className="text-[10px] uppercase tracking-wider font-bold text-rose-800">Terlambat</p>
                   <div className="flex items-baseline gap-1 mt-0.5">
                     <p className="text-lg font-black text-rose-700 leading-none">{riwayat.filter(r => r.statusMasuk && r.statusMasuk.toUpperCase().includes('TELAT')).length}</p>
                     <span className="text-xs font-semibold text-rose-600">Kali</span>
                   </div>
                </div>
              </div>
            </div>
          )}

          <div className="p-0 overflow-x-auto">
            {loadingRiwayat ? (
              <div className="w-full p-4 animate-pulse flex flex-col gap-3">
                <div className="grid grid-cols-4 gap-4 pb-2 border-b border-neutral-150">
                  <div className="h-4 bg-neutral-200 rounded col-span-1"></div>
                  <div className="h-4 bg-neutral-200 rounded col-span-1"></div>
                  <div className="h-4 bg-neutral-200 rounded col-span-1"></div>
                  <div className="h-4 bg-neutral-200 rounded col-span-1"></div>
                </div>
                {[1, 2, 3, 4, 5].map((idx) => (
                  <div key={idx} className="grid grid-cols-4 gap-4 py-1.5 border-b border-neutral-100 last:border-0 items-center">
                    <div className="h-3 bg-neutral-100 rounded col-span-1"></div>
                    <div className="h-5 bg-neutral-100 rounded col-span-1 w-24"></div>
                    <div className="h-5 bg-neutral-100 rounded col-span-1 w-24"></div>
                    <div className="h-3 bg-neutral-100 rounded col-span-1 w-16"></div>
                  </div>
                ))}
              </div>
            ) : errorRiwayat ? (
              <div className="text-center p-4">
                <div className="bg-red-50 text-red-700 text-sm p-3 rounded mb-3 font-medium border border-red-200">
                  {errorRiwayat}
                </div>
                <button onClick={() => fetchRiwayat(nama)} className="px-4 py-1.5 text-sm font-bold bg-white border border-neutral-300 rounded shadow-sm hover:bg-neutral-50 transition">
                  Coba Lagi
                </button>
              </div>
            ) : riwayat.length === 0 ? (
               <div className="text-center text-sm text-neutral-500 py-6">Belum ada riwayat absensi.</div>
            ) : (
              <table className="w-full text-xs text-left">
                <thead className="text-neutral-500 uppercase bg-neutral-50/50">
                  <tr>
                    <th className="px-4 py-2.5 font-semibold">Tanggal</th>
                    <th className="px-4 py-2.5 font-semibold">Masuk</th>
                    <th className="px-4 py-2.5 font-semibold">Pulang</th>
                    <th className="px-4 py-2.5 font-semibold">Durasi</th>
                  </tr>
                </thead>
                <tbody>
                  {riwayat.map((r, i) => (
                    <tr key={i} className="border-t border-neutral-100 last:border-0 hover:bg-neutral-50">
                      <td className="px-4 py-3 align-middle">
                        <div className="flex flex-col gap-0.5 items-start">
                          <span className="font-medium text-neutral-600">{r.tanggal}</span>
                          {r.posisi && (
                            <span className="bg-red-50 text-[#cc0000] px-1.5 py-0.5 rounded font-extrabold text-[9px] uppercase tracking-wider">
                              {r.posisi}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 align-middle">
                        <div className="flex flex-col gap-1 items-start">
                          <span className="font-mono font-bold text-neutral-800 text-sm">{r.jamDatang || '-'}</span>
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${r.statusMasuk === 'TEPAT WAKTU' ? 'bg-green-100 text-green-700' : r.statusMasuk === 'TELAT' ? 'bg-red-100 text-red-700' : 'bg-neutral-100 text-neutral-700'}`}>
                            {r.statusMasuk}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 align-middle">
                        <div className="flex flex-col gap-1 items-start">
                          <span className="font-mono font-bold text-neutral-800 text-sm">{r.jamPulang && r.jamPulang !== '-' ? r.jamPulang : '-'}</span>
                          {r.jamPulang && r.jamPulang !== '-' ? (
                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${r.statusPulang === 'NORMAL' ? 'bg-green-100 text-green-700' : r.statusPulang === 'LEMBUR' ? 'bg-purple-100 text-purple-700' : 'bg-neutral-100 text-neutral-700'}`}>
                              {r.statusPulang || 'NORMAL'}
                            </span>
                          ) : r.jamDatang ? (
                            <span className="text-[9px] text-neutral-400 italic">Belum Pulang</span>
                          ) : (
                            <span className="text-neutral-400">-</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 align-middle">
                        <span className="font-mono font-bold text-neutral-800 text-sm">{r.totalJam && r.totalJam !== '-' ? r.totalJam : '-'}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
      </>
      )}


      {/* PANEL OWNER */}
      {activeTab === 'owner' && (
        <div className={`w-full ${isOwnerLoggedIn ? 'max-w-6xl' : 'max-w-3xl'} bg-white rounded-xl shadow-lg border border-neutral-200 overflow-hidden transition-all duration-300 animate-in fade-in`}>
          <div className="bg-[#cc0000] p-4 text-center relative">
            <h1 className="text-xl font-bold text-white tracking-wide flex justify-center items-center gap-2">
              <Users className="w-6 h-6" />
              Halaman OWNER
            </h1>
            {isOwnerLoggedIn && (
               <button
                  onClick={() => {
                    setIsOwnerLoggedIn(false);
                    localStorage.removeItem("isOwnerLoggedIn");
                    setOwnerPasswordInput("");
                    setOwnerView('harian');
                  }}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-white hover:bg-[#a30000] p-2 rounded-lg transition"
                  title="Logout"
               >
                 <LogOut className="w-5 h-5" />
               </button>
            )}
          </div>
          {!isOwnerLoggedIn ? (
            <div className="p-8 flex flex-col items-center justify-center min-h-[300px]">
              <h2 className="text-xl font-bold text-neutral-800 mb-2">Akses Dibatasi</h2>
              <p className="text-neutral-500 mb-6 text-center max-w-sm">Masukkan password owner untuk melihat data absensi pegawai.</p>
              <form onSubmit={handleOwnerLogin} className="w-full max-w-xs space-y-4">
                <div>
                  <input 
                    type="password" 
                    placeholder="Masukkan password..." 
                    value={ownerPasswordInput}
                    onChange={(e) => setOwnerPasswordInput(e.target.value)}
                    className="w-full p-3 bg-neutral-50 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-[#cc0000] focus:border-[#cc0000] outline-none transition"
                  />
                </div>
                {ownerLoginError && <p className="text-red-600 text-sm font-semibold">{ownerLoginError}</p>}
                <button type="submit" className="w-full bg-[#cc0000] hover:bg-[#a30000] text-white font-bold py-3 rounded-lg shadow transition">
                  Login
                </button>
              </form>
            </div>
          ) : (
            <div className="p-4 md:p-6">
              
              {/* Owner Sub-Tabs */}
              <div className="flex gap-2 mb-6 border-b border-neutral-200 pb-2 overflow-x-auto">
                <div className="flex gap-2 min-w-max">
                  <button 
                    onClick={() => setOwnerView('harian')}
                    className={`px-4 py-2 font-bold text-sm rounded-t-lg transition-colors ${ownerView === 'harian' ? 'text-[#cc0000] border-b-2 border-[#cc0000]' : 'text-neutral-500 hover:text-neutral-800'}`}
                  >
                    Ringkasan Harian
                  </button>
                  <button 
                    onClick={() => setOwnerView('bulanan')}
                    className={`px-4 py-2 font-bold text-sm rounded-t-lg transition-colors ${ownerView === 'bulanan' ? 'text-[#cc0000] border-b-2 border-[#cc0000]' : 'text-neutral-500 hover:text-neutral-800'}`}
                  >
                    Laporan Bulanan
                  </button>
                  <button 
                    onClick={() => setOwnerView('outlet')}
                    className={`px-4 py-2 font-bold text-sm rounded-t-lg transition-colors ${ownerView === 'outlet' ? 'text-[#cc0000] border-b-2 border-[#cc0000]' : 'text-neutral-500 hover:text-neutral-800'}`}
                  >
                    Kelola Outlet
                  </button>
                  <button 
                    onClick={() => {
                      setOwnerView('settings');
                    }}
                    className={`px-4 py-2 font-bold text-sm rounded-t-lg transition-colors ${ownerView === 'settings' ? 'text-[#cc0000] border-b-2 border-[#cc0000]' : 'text-neutral-500 hover:text-neutral-800'}`}
                  >
                    Settings
                  </button>
                </div>
              </div>


              <AnimatePresence mode="wait">
                {ownerView === 'harian' && (
                  <motion.div
                    key="owner-harian"
                    initial={{ opacity: 0, x: 15 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -15 }}
                    transition={{ duration: 0.2 }}
                  >
                    <div className="flex flex-wrap items-center justify-between mb-4 gap-3">
                    <h2 className="font-bold text-neutral-700 text-lg">Ringkasan Absensi Hari Ini</h2>
                    <div className="flex flex-wrap items-center gap-3">
                      <button 
                        onClick={fetchRingkasanHarian} 
                        className="text-sm bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-medium px-4 py-2 rounded-lg transition h-[36px]"
                      >
                        Refresh Data
                      </button>
                    </div>
                  </div>
                  
                  {errorRingkasan && (
                    <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg flex items-center justify-between">
                      <span className="text-sm font-medium">{errorRingkasan}</span>
                      <button onClick={fetchRingkasanHarian} className="px-3 py-1.5 bg-red-100 hover:bg-red-200 text-red-700 text-sm font-bold rounded transition">
                        Coba Lagi
                      </button>
                    </div>
                  )}
                  
                  {!loadingRingkasan && ringkasanHarian.length > 0 && (
                    <div className="grid grid-cols-3 gap-3 mb-6">
                      <div className="bg-white border border-neutral-200 p-4 rounded-xl shadow-sm flex flex-col justify-center items-center">
                        <p className="text-xs text-neutral-500 font-bold mb-1">Pegawai Hadir</p>
                        <p className="text-2xl font-black text-neutral-800">{ringkasanHarian.filter(r => r.keterangan !== 'IZIN' && r.jamDatang).length}</p>
                      </div>
                      <div className="bg-white border border-red-100 p-4 rounded-xl shadow-sm flex flex-col justify-center items-center">
                        <p className="text-xs text-red-500 font-bold mb-1">Total Telat</p>
                        <p className="text-2xl font-black text-red-600">{ringkasanHarian.filter(r => r.statusMasuk === 'TELAT').length}</p>
                      </div>
                      <div className="bg-white border border-blue-100 p-4 rounded-xl shadow-sm flex flex-col justify-center items-center">
                        <p className="text-xs text-blue-500 font-bold mb-1">Belum Pulang</p>
                        <p className="text-2xl font-black text-blue-600">{ringkasanHarian.filter(r => r.keterangan !== 'IZIN' && r.jamDatang && (!r.jamPulang || r.jamPulang === '-')).length}</p>
                      </div>
                    </div>
                  )}


                  <div className="w-full">
              {loadingRingkasan ? (
                <div className="w-full flex flex-col gap-6 animate-pulse">
                  {/* Cards Loader */}
                  <div className="grid grid-cols-3 gap-3">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="bg-neutral-50 border border-neutral-200 p-4 rounded-xl flex flex-col items-center gap-2">
                        <div className="h-3 bg-neutral-200 rounded w-16"></div>
                        <div className="h-6 bg-neutral-300 rounded w-8"></div>
                      </div>
                    ))}
                  </div>
                  {/* Table Loader */}
                  <div className="border border-neutral-200 rounded-lg overflow-hidden bg-white">
                    <div className="bg-neutral-50 px-5 py-4 border-b border-neutral-200 grid grid-cols-4 md:grid-cols-6 gap-4">
                      <div className="h-4 bg-neutral-250 rounded col-span-1"></div>
                      <div className="h-4 bg-neutral-250 rounded col-span-1"></div>
                      <div className="h-4 bg-neutral-250 rounded col-span-1 select-none hidden md:block"></div>
                      <div className="h-4 bg-neutral-250 rounded col-span-1"></div>
                      <div className="h-4 bg-neutral-250 rounded col-span-1 select-none hidden md:block"></div>
                      <div className="h-4 bg-neutral-250 rounded col-span-1"></div>
                    </div>
                    {[1, 2, 3].map((idx) => (
                      <div key={idx} className="p-5 border-b border-neutral-100 last:border-0 grid grid-cols-4 md:grid-cols-6 gap-4 items-start">
                        <div className="flex flex-col gap-2 col-span-1">
                          <div className="h-4 bg-neutral-150 rounded w-20 md:w-28"></div>
                          <div className="h-3 bg-neutral-100 rounded w-12 md:w-16"></div>
                          <div className="h-3 bg-neutral-100 rounded w-24 md:w-32"></div>
                        </div>
                        <div className="flex flex-col gap-2 col-span-1">
                          <div className="h-4 bg-neutral-150 rounded w-12"></div>
                          <div className="h-4 bg-neutral-100 rounded w-16"></div>
                        </div>
                        <div className="h-4 bg-neutral-100 rounded w-10 col-span-1 hidden md:block"></div>
                        <div className="h-4 bg-neutral-150 rounded w-14 col-span-1"></div>
                        <div className="flex justify-center items-center col-span-1 hidden md:flex">
                          <div className="w-10 h-10 bg-neutral-100 rounded-md"></div>
                        </div>
                        <div className="flex justify-center items-center col-span-1">
                          <div className="w-14 h-10 bg-neutral-100 rounded-md"></div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : ringkasanHarian.length === 0 ? (
                <div className="text-center text-neutral-500 py-10 border border-neutral-200 rounded-lg">Belum ada absensi hari ini.</div>
              ) : (
                <>
                {/* Desktop Table View */}
                <div className="hidden md:block overflow-x-auto border border-neutral-200 rounded-lg">
                  <table className="w-full text-sm text-left whitespace-nowrap min-w-[800px]">
                    <thead className="text-xs text-neutral-500 uppercase bg-neutral-50 border-b border-neutral-200">
                      <tr>
                        <th className="px-5 py-4 font-semibold">Data Pegawai</th>
                        <th className="px-5 py-4 font-semibold">Absen Masuk</th>
                        <th className="px-5 py-4 font-semibold">Absen Pulang</th>
                        <th className="px-5 py-4 font-semibold">Durasi & Status</th>
                        <th className="px-5 py-4 font-semibold text-center">Foto (M/P)</th>
                        <th className="px-5 py-4 font-semibold text-center">GPS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ringkasanHarian.map((row, idx) => (
                        <tr key={idx} className="border-b border-neutral-100 last:border-0 hover:bg-neutral-50 align-top">
                          <td className="px-5 py-4">
                            <div className="font-bold text-neutral-800">{row.nama}</div>
                            {row.posisi && <div className="text-xs font-semibold text-[#cc0000] mt-0.5">{row.posisi}</div>}
                            <div className="text-xs text-neutral-500 mt-1 max-w-[200px] truncate" title={row.outlet || "IZIN"}>{row.outlet || "IZIN"}</div>
                            {row.keterangan === 'IZIN' && (
                               <span className="inline-block mt-2 px-2.5 py-1 bg-[#cc0000] text-white text-[10px] font-bold rounded shadow-sm animate-pulse">
                                 SEDANG IZIN
                               </span>
                            )}
                          </td>
                          <td className="px-5 py-4">
                            <div className="font-mono font-medium text-neutral-700">{row.jamDatang || "-"}</div>
                            <div className="mt-1 flex flex-col gap-1 items-start">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${row.statusMasuk === 'TEPAT WAKTU' ? 'bg-green-100 text-green-700' : row.statusMasuk === 'TELAT' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>
                                {row.statusMasuk || row.keterangan || "-"}
                              </span>
                              {(row.statusMasuk === 'TELAT' || row.keterangan === 'IZIN') && row.alasan && (
                                <span className="bg-red-50 text-red-600 border border-red-100 text-[10px] px-2 py-1 rounded-md max-w-[150px] whitespace-normal italic">
                                  "{row.alasan}"
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-5 py-4">
                            <div className="font-mono font-medium text-neutral-700">{row.jamPulang && row.jamPulang !== "-" ? row.jamPulang : "-"}</div>
                          </td>
                          <td className="px-5 py-4">
                            <div className="font-medium text-neutral-700 mb-1">
                              {row.totalJam && row.totalJam !== "-" ? row.totalJam : (
                                 row.keterangan === 'IZIN' ? "-" : row.jamDatang && row.jamDatang !== '-' ? (
                                   <span className="text-[10px] text-orange-700 bg-orange-50 font-bold px-2 py-0.5 rounded border border-orange-200">
                                     {getSisaWaktuKerja(row.jamDatang, targetJamKerja)}
                                   </span>
                                 ) : "-"
                              )}
                            </div>
                            {row.statusPulang && row.statusPulang !== "-" && (
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${row.statusPulang === 'NORMAL' ? 'bg-green-100 text-green-700' : row.statusPulang === 'LEMBUR' ? 'bg-purple-100 text-purple-700' : 'bg-neutral-100 text-neutral-700'}`}>
                                {row.statusPulang}
                              </span>
                            )}
                          </td>
                          <td className="px-5 py-4">
                            <div className="flex justify-center gap-2">
                              {row.fotoDatang ? (
                                <button type="button" onClick={() => setPreviewModal({ type: 'image', title: `Foto Masuk ${row.nama}`, url: row.fotoDatang })} className="block w-10 h-10 bg-neutral-200 rounded border border-neutral-300 overflow-hidden hover:opacity-80 transition" title="Foto Datang">
                                  <img src={getDirectDriveUrl(row.fotoDatang)} alt="Masuk" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                </button>
                              ) : <div className="w-10 h-10 bg-neutral-100 border border-neutral-200 border-dashed rounded flex items-center justify-center text-xs text-neutral-400" title="Belum Masuk">-</div>}
                              
                              {row.fotoPulang ? (
                                <button type="button" onClick={() => setPreviewModal({ type: 'image', title: `Foto Pulang ${row.nama}`, url: row.fotoPulang })} className="block w-10 h-10 bg-neutral-200 rounded border border-neutral-300 overflow-hidden hover:opacity-80 transition" title="Foto Pulang">
                                  <img src={getDirectDriveUrl(row.fotoPulang)} alt="Pulang" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                </button>
                              ) : <div className="w-10 h-10 bg-neutral-100 border border-neutral-200 border-dashed rounded flex items-center justify-center text-xs text-neutral-400" title="Belum Pulang">-</div>}
                            </div>
                          </td>
                          <td className="px-5 py-4">
                            <div className="flex gap-2 justify-center items-start min-w-[200px]">
                              <div className="flex flex-col items-center gap-1">
                                {row.lokasiDatang && getMapEmbedUrl(row.lokasiDatang) ? (
                                  <>
                                    <iframe 
                                      src={getMapEmbedUrl(row.lokasiDatang)!} 
                                      className="w-24 h-24 rounded-md border-2 border-blue-400 shadow-sm cursor-pointer"
                                      title="Lokasi Masuk"
                                      loading="lazy"
                                    />
                                    <button type="button" onClick={() => setPreviewModal({ type: 'map', title: `Peta Masuk ${row.nama}`, url: getMapEmbedUrl(row.lokasiDatang)! })} className="text-[10px] bg-blue-50 text-blue-600 hover:bg-blue-100 px-2.5 py-1 rounded-md flex items-center gap-1 font-bold border border-blue-200">
                                      <MapPin className="w-3 h-3" /> Masuk
                                    </button>
                                  </>
                                ) : (
                                  <div className="w-24 h-24 bg-neutral-100 border border-neutral-200 border-dashed rounded flex flex-col items-center justify-center text-xs text-neutral-400">
                                     <MapPin className="w-4 h-4 mb-1" />
                                     -
                                  </div>
                                )}
                              </div>
                              
                              <div className="flex flex-col items-center gap-1">
                                {row.lokasiPulang && getMapEmbedUrl(row.lokasiPulang) ? (
                                  <>
                                    <iframe 
                                      src={getMapEmbedUrl(row.lokasiPulang)!} 
                                      className="w-24 h-24 rounded-md border-2 border-indigo-400 shadow-sm cursor-pointer"
                                      title="Lokasi Pulang"
                                      loading="lazy"
                                    />
                                    <button type="button" onClick={() => setPreviewModal({ type: 'map', title: `Peta Pulang ${row.nama}`, url: getMapEmbedUrl(row.lokasiPulang)! })} className="text-[10px] bg-indigo-50 text-indigo-600 hover:bg-indigo-100 px-2.5 py-1 rounded-md flex items-center gap-1 font-bold border border-indigo-200">
                                      <MapPin className="w-3 h-3" /> Pulang
                                    </button>
                                  </>
                                ) : (
                                  <div className="w-24 h-24 bg-neutral-100 border border-neutral-200 border-dashed rounded flex flex-col items-center justify-center text-xs text-neutral-400">
                                     <MapPin className="w-4 h-4 mb-1" />
                                     -
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>


                {/* Mobile Card View */}
                <div className="md:hidden flex flex-col gap-4">
                  {ringkasanHarian.map((row, idx) => (
                    <div key={idx} className="bg-white border border-neutral-200 rounded-xl p-4 shadow-sm flex flex-col gap-3 relative overflow-hidden">
                      {/* Status indicator line on the left */}
                      <div className={`absolute left-0 top-0 bottom-0 w-1 ${row.statusMasuk === 'TEPAT WAKTU' ? 'bg-green-500' : row.statusMasuk === 'TELAT' ? 'bg-red-500' : 'bg-blue-500'}`}></div>
                      
                      <div className="flex justify-between items-start border-b border-neutral-100 pb-3 pl-2">
                        <div>
                          <div className="font-bold text-neutral-800 text-base flex flex-wrap items-center gap-2">
                            {row.nama}
                            {row.keterangan === 'IZIN' && (
                              <span className="px-2 py-0.5 bg-[#cc0000] text-white text-[9px] font-bold rounded shadow-sm animate-pulse">SEDANG IZIN</span>
                            )}
                          </div>
                          {row.posisi && <div className="text-[11px] font-bold text-[#cc0000] mt-0.5">{row.posisi}</div>}
                          <div className="text-xs text-neutral-500 mt-1 max-w-[200px] truncate leading-tight">{row.outlet || "IZIN"}</div>
                        </div>
                        <div className="text-right flex flex-col items-end gap-1">
                          {row.keterangan === 'IZIN' ? (
                            <span className="px-2.5 py-1 rounded-md text-[10px] font-bold bg-blue-100 text-blue-700">IZIN</span>
                          ) : (
                            <span className={`px-2.5 py-1 rounded-md text-[10px] font-bold ${row.statusMasuk === 'TEPAT WAKTU' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{row.statusMasuk || '-'}</span>
                          )}
                          {(row.statusMasuk === 'TELAT' || row.keterangan === 'IZIN') && row.alasan && (
                            <span className="bg-red-50 text-red-600 border border-red-100 text-[9px] px-2 py-1 rounded-md max-w-[120px] whitespace-normal italic text-right leading-tight">
                              "{row.alasan}"
                            </span>
                          )}
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-3 mb-1 pl-2">
                        <div className="bg-neutral-50 p-2.5 rounded-lg border border-neutral-100 flex flex-col">
                          <p className="text-[10px] text-neutral-500 font-semibold mb-1 flex items-center gap-1">MASUK</p>
                          <div className="font-mono font-bold text-neutral-800 text-sm flex-1">{row.jamDatang || "-"}</div>
                          {row.fotoDatang && (
                            <button type="button" onClick={() => setPreviewModal({ type: 'image', title: `Foto Masuk ${row.nama}`, url: row.fotoDatang })} className="mt-2 inline-block text-[10px] bg-white text-neutral-600 hover:text-blue-600 px-2 py-1.5 rounded shadow-sm border border-neutral-200 font-medium transition w-full text-center">
                              Lihat Foto
                            </button>
                          )}
                        </div>
                        <div className="bg-neutral-50 p-2.5 rounded-lg border border-neutral-100 flex flex-col">
                          <p className="text-[10px] text-neutral-500 font-semibold mb-1 flex items-center justify-between">
                            PULANG
                            {row.statusPulang && row.statusPulang !== "-" && (
                              <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold ${row.statusPulang === 'NORMAL' ? 'bg-green-100 text-green-700' : row.statusPulang === 'LEMBUR' ? 'bg-purple-100 text-purple-700' : 'bg-neutral-100 text-neutral-700'}`}>{row.statusPulang}</span>
                            )}
                          </p>
                          <div className="font-mono font-bold text-neutral-800 text-sm flex-1">{row.jamPulang && row.jamPulang !== "-" ? row.jamPulang : "-"}</div>
                          {row.fotoPulang && (
                            <button type="button" onClick={() => setPreviewModal({ type: 'image', title: `Foto Pulang ${row.nama}`, url: row.fotoPulang })} className="mt-2 inline-block text-[10px] bg-white text-neutral-600 hover:text-indigo-600 px-2 py-1.5 rounded shadow-sm border border-neutral-200 font-medium transition w-full text-center">
                              Lihat Foto
                            </button>
                          )}
                        </div>
                      </div>


                      <div className="flex items-center justify-between border-t border-neutral-100 pt-3 pl-2">
                        <div>
                          <p className="text-[10px] text-neutral-500 font-semibold mb-0.5">DURASI KERJA</p>
                          <p className="font-medium text-sm text-neutral-800">
                            {row.totalJam && row.totalJam !== "-" ? row.totalJam : (
                               row.keterangan === 'IZIN' ? "-" : row.jamDatang && row.jamDatang !== '-' ? (
                                 <span className="text-[10px] text-orange-700 bg-orange-50 font-bold px-2 py-0.5 rounded border border-orange-200 block mt-1 w-max">
                                   {getSisaWaktuKerja(row.jamDatang, targetJamKerja)}
                                 </span>
                               ) : "-"
                            )}
                          </p>
                        </div>
                        <div className="flex gap-1.5">
                          {row.lokasiDatang ? (
                            <button type="button" onClick={() => setPreviewModal({ type: 'map', title: `Peta Masuk ${row.nama}`, url: getMapEmbedUrl(row.lokasiDatang)! })} className="text-[10px] bg-blue-50 text-blue-700 hover:bg-blue-100 px-3 py-2 rounded-md flex items-center gap-1 font-bold border border-blue-200 transition">
                              <MapPin className="w-3 h-3" /> Map Masuk
                            </button>
                          ) : (
                             <span className="text-[10px] bg-neutral-50 text-neutral-400 px-3 py-2 rounded-md flex items-center gap-1 font-medium border border-neutral-200 transition">
                               <MapPin className="w-3 h-3" /> -
                             </span>
                          )}
                          {row.lokasiPulang ? (
                            <button type="button" onClick={() => setPreviewModal({ type: 'map', title: `Peta Pulang ${row.nama}`, url: getMapEmbedUrl(row.lokasiPulang)! })} className="text-[10px] bg-indigo-50 text-indigo-700 hover:bg-indigo-100 px-3 py-2 rounded-md flex items-center gap-1 font-bold border border-indigo-200 transition">
                              <MapPin className="w-3 h-3" /> Map Pulang
                            </button>
                          ) : (
                             <span className="text-[10px] bg-neutral-50 text-neutral-400 px-3 py-2 rounded-md flex items-center gap-1 font-medium border border-neutral-200 transition">
                               <MapPin className="w-3 h-3" /> -
                             </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                </>
              )}
                  </div>
                </motion.div>
              )}


              {ownerView === 'bulanan' && (
                <motion.div
                  key="owner-bulanan"
                  initial={{ opacity: 0, x: 15 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -15 }}
                  transition={{ duration: 0.2 }}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                    <h2 className="font-bold text-neutral-700 text-lg">Laporan Absensi</h2>
                    <div className="flex flex-wrap items-center gap-2">
                       <select
                         value={laporanPosisiFilter}
                         onChange={(e) => setLaporanPosisiFilter(e.target.value as any)}
                         className="p-2 text-sm bg-neutral-50 border border-neutral-300 rounded-md focus:ring-2 focus:ring-[#cc0000] outline-none font-medium text-neutral-700 h-[38px]"
                       >
                         <option value="Semua">Semua Posisi</option>
                         {availablePositions.map((p) => (
                           <option key={p.name} value={p.name}>{p.name}</option>
                         ))}
                       </select>
                       <input 
                         type="month" 
                         value={laporanBulan} 
                         onChange={(e) => setLaporanBulan(e.target.value)}
                         className="p-2 text-sm bg-neutral-50 border border-neutral-300 rounded-md focus:ring-2 focus:ring-[#cc0000] outline-none font-medium text-neutral-700 h-[38px]"
                       />
                       <button 
                         onClick={() => fetchLaporanBulanan(laporanBulan)} 
                         className="text-sm bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-medium px-4 h-[38px] rounded-md transition"
                       >
                         Refresh
                       </button>
                    </div>
                  </div>                  {errorLaporan && (
                    <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg flex items-center justify-between">
                      <span className="text-sm font-medium">{errorLaporan}</span>
                      <button onClick={() => fetchLaporanBulanan(laporanBulan)} className="px-3 py-1.5 bg-red-100 hover:bg-red-200 text-red-700 text-sm font-bold rounded transition">
                        Coba Lagi
                      </button>
                    </div>
                  )}

                  {/* Sub-Tabs: Pegawai vs Outlet */}
                  <div className="flex bg-neutral-100 p-1 rounded-lg w-fit mb-5 font-sans border border-neutral-200">
                    <button
                      type="button"
                      onClick={() => setLaporanBulananSubView('pegawai')}
                      className={`px-4 py-1.5 rounded-md text-xs font-bold transition flex items-center gap-1.5 ${laporanBulananSubView === 'pegawai' ? 'bg-white text-[#cc0000] shadow-sm' : 'text-neutral-500 hover:text-neutral-800'}`}
                    >
                      <Users className="w-3.5 h-3.5" />
                      Analisis Pegawai
                    </button>
                    <button
                      type="button"
                      onClick={() => setLaporanBulananSubView('outlet')}
                      className={`px-4 py-1.5 rounded-md text-xs font-bold transition flex items-center gap-1.5 ${laporanBulananSubView === 'outlet' ? 'bg-white text-[#cc0000] shadow-sm' : 'text-neutral-500 hover:text-neutral-800'}`}
                    >
                      <Store className="w-3.5 h-3.5" />
                      Performa Cabang (Outlet)
                    </button>
                  </div>
                  
                  <div className="w-full">
                  {loadingLaporan ? (
                    <div className="text-center text-neutral-500 py-10 border border-neutral-200 rounded-lg">Memuat laporan bulanan...</div>
                  ) : laporanBulanan.length === 0 ? (
                    <div className="text-center text-neutral-500 py-10 border border-neutral-200 rounded-lg">Belum ada data bulan ini.</div>
                  ) : (
                    <>
                    {laporanBulananSubView === 'pegawai' ? (
                      <>
                      {/* Chart Visualization */}
                      <div className="mb-6 bg-white border border-neutral-200 rounded-xl p-5 shadow-sm">
                        <h3 className="text-neutral-700 font-bold text-sm mb-4 flex items-center gap-1.5">
                          <BarChart3 className="w-4 h-4 text-[#cc0000]" />
                          Visualisasi Total vs Target Jam Kerja ({laporanBulan})
                        </h3>
                        <div className="w-full h-80">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart
                              data={laporanBulanan
                                .filter(row => laporanPosisiFilter === 'Semua' || row.posisi === laporanPosisiFilter)
                                .map(row => {
                                  const totalHours = typeof row.totalMenitKerja === 'number'
                                    ? Number((row.totalMenitKerja / 60).toFixed(1))
                                    : 0;
                                  const targetHours = (row.jumlahMasuk || 0) * 13;
                                  return {
                                    nama: row.nama,
                                    "Total Kerja": totalHours,
                                    "Target Kerja": targetHours,
                                  };
                                })
                              }
                              margin={{ top: 10, right: 10, left: -20, bottom: 5 }}
                            >
                              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                              <XAxis 
                                dataKey="nama" 
                                tick={{ fill: '#6b7280', fontSize: 11 }}
                                axisLine={{ stroke: '#e5e7eb' }}
                                tickLine={false}
                              />
                              <YAxis 
                                tick={{ fill: '#6b7280', fontSize: 11 }}
                                axisLine={{ stroke: '#e5e7eb' }}
                                tickLine={false}
                                unit="j"
                              />
                              <Tooltip 
                                contentStyle={{ 
                                  backgroundColor: '#ffffff', 
                                  borderRadius: '8px', 
                                  borderColor: '#e5e7eb',
                                  fontSize: '12px',
                                  fontFamily: 'Inter, sans-serif'
                                }} 
                                formatter={(value) => [`${value} jam`]}
                              />
                              <Legend 
                                verticalAlign="top" 
                                height={36}
                                iconType="circle"
                                iconSize={8}
                                wrapperStyle={{ fontSize: '11px', fontFamily: 'Inter, sans-serif' }}
                              />
                              <Bar dataKey="Total Kerja" fill="#cc0000" radius={[4, 4, 0, 0]} maxBarSize={40} />
                              <Bar dataKey="Target Kerja" fill="#9ca3af" radius={[4, 4, 0, 0]} maxBarSize={40} />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </div>

                      {/* Desktop Table View */}
                      <div className="hidden md:block overflow-x-auto border border-neutral-200 rounded-lg bg-white shadow-sm">
                        <table className="w-full text-sm text-left whitespace-nowrap min-w-[600px]">
                          <thead className="text-xs text-neutral-500 uppercase bg-neutral-50 border-b border-neutral-200">
                            <tr>
                              <th className="px-5 py-4 font-semibold">Data Pegawai</th>
                              <th className="px-5 py-4 font-semibold">Total Jam Kerja</th>
                              <th className="px-5 py-4 font-semibold border-x border-neutral-200 bg-neutral-100/50">Total Lembur</th>
                              <th className="px-5 py-4 font-semibold">Jumlah Kehadiran</th>
                              <th className="px-5 py-4 font-semibold text-center">Keterlambatan</th>
                            </tr>
                          </thead>
                          <tbody>
                            {laporanBulanan.filter(row => laporanPosisiFilter === 'Semua' || row.posisi === laporanPosisiFilter).map((row, idx) => (
                              <tr key={idx} onClick={() => fetchDetailRiwayat(row.nama, laporanBulan)} className="border-b border-neutral-100 last:border-0 hover:bg-red-50 align-top cursor-pointer transition">
                                <td className="px-5 py-4">
                                  <div className="font-bold text-neutral-800">{row.nama}</div>
                                  {row.posisi && <div className="text-xs font-semibold text-[#cc0000] mt-0.5">{row.posisi}</div>}
                                </td>
                                <td className="px-5 py-4">
                                  <div className="font-mono font-medium text-neutral-700">{row.totalJamKerja || "0j 0m"}</div>
                                </td>
                                <td className="px-5 py-4 border-x border-neutral-200">
                                  <div className="font-mono font-bold text-[#cc0000]">{row.jumlahJamLembur ? `${row.jumlahJamLembur} jam` : "0 jam"}</div>
                                </td>
                                <td className="px-5 py-4">
                                  <div className="font-medium text-neutral-700">{row.jumlahMasuk || 0} hari</div>
                                </td>
                                <td className="px-5 py-4 text-center">
                                  {row.jumlahTelat > 0 ? (
                                    <span className="px-2.5 py-1 rounded-md text-xs font-bold bg-red-100 text-red-700">
                                      {row.jumlahTelat} kali
                                    </span>
                                  ) : (
                                    <span className="px-2.5 py-1 rounded-md text-xs font-bold bg-green-100 text-green-700">
                                      Tepat Waktu
                                    </span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {/* Mobile Card View */}
                      <div className="md:hidden flex flex-col gap-4">
                        {laporanBulanan.filter(row => laporanPosisiFilter === 'Semua' || row.posisi === laporanPosisiFilter).map((row, idx) => (
                          <div key={idx} onClick={() => fetchDetailRiwayat(row.nama, laporanBulan)} className="bg-white border border-neutral-200 rounded-xl p-4 shadow-sm flex flex-col gap-4 cursor-pointer hover:border-[#cc0000] focus:ring focus:ring-red-100 transition">
                            <div className="flex justify-between items-start border-b border-neutral-100 pb-3">
                              <div>
                                <div className="font-bold text-neutral-800 text-base">{row.nama}</div>
                                {row.posisi && <div className="text-[11px] font-bold text-[#cc0000] mt-0.5">{row.posisi}</div>}
                              </div>
                              <div className="text-right">
                                {row.jumlahTelat > 0 ? (
                                  <span className="px-2.5 py-1.5 rounded-md text-[10px] font-bold bg-red-100 text-red-700 flex items-center gap-1">
                                    <AlertCircle className="w-3.5 h-3.5" /> Telat {row.jumlahTelat}x
                                  </span>
                                ) : (
                                  <span className="px-2.5 py-1.5 rounded-md text-[10px] font-bold bg-green-100 text-green-700 flex items-center gap-1">
                                    <CheckCircle2 className="w-3.5 h-3.5" /> Tepat Waktu
                                  </span>
                                )}
                              </div>
                            </div>
                            
                            <div className="grid grid-cols-3 gap-2">
                              <div className="bg-neutral-50 px-2 py-3 rounded-lg border border-neutral-100 text-center flex flex-col justify-center">
                                <p className="text-[10px] text-neutral-500 font-semibold mb-0.5">KEHADIRAN</p>
                                <p className="font-bold text-sm text-neutral-800">{row.jumlahMasuk || 0} hr</p>
                              </div>
                              <div className="bg-neutral-50 px-2 py-3 rounded-lg border border-neutral-100 text-center flex flex-col justify-center">
                                <p className="text-[10px] text-neutral-500 font-semibold mb-0.5">TOT. KERJA</p>
                                <p className="font-mono font-bold text-sm text-neutral-800">{row.totalJamKerja || "0j 0m"}</p>
                              </div>
                              <div className="bg-[#fff8f8] px-2 py-3 rounded-lg border border-[#ffdada] text-center flex flex-col justify-center">
                                <p className="text-[10px] text-[#cc0000] font-semibold mb-0.5">LEMBUR</p>
                                <p className="font-mono font-bold text-sm text-[#cc0000]">{row.jumlahJamLembur ? `${row.jumlahJamLembur} jam` : "0 jam"}</p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                      </>
                    ) : (
                      /* Outlet Performance Grouped View */
                      <div className="grid grid-cols-1 gap-6 font-sans">
                        {laporanBulananOutlet.length === 0 ? (
                          <div className="text-center text-neutral-500 py-12 border border-neutral-200 rounded-2xl bg-white shadow-sm flex flex-col items-center justify-center">
                            <Store className="w-10 h-10 text-neutral-300 mb-2.5" />
                            <p className="text-sm font-semibold text-neutral-700">Data outlet belum tersedia untuk bulan ini.</p>
                            <p className="text-xs text-neutral-400 mt-1 max-w-[280px]">Pastikan pegawai Anda sudah melakukan absensi pada bulan yang dipilih.</p>
                          </div>
                        ) : (
                          laporanBulananOutlet.map((out, idx) => (
                            <div key={idx} className="bg-white border border-neutral-200 rounded-2xl shadow-sm overflow-hidden border-t-4 border-t-[#cc0000] transition hover:shadow-md">
                              {/* Header Card */}
                              <div className="bg-neutral-50/50 p-5 border-b border-neutral-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
                                <div className="flex items-center gap-3">
                                  <div className="p-2.5 bg-red-50 text-[#cc0000] rounded-xl border border-red-100">
                                    <Store className="w-6 h-6" />
                                  </div>
                                  <div>
                                    <h4 className="font-bold text-neutral-800 text-lg leading-snug">{out.outlet}</h4>
                                    <p className="text-xs text-neutral-500 font-semibold flex items-center gap-1 mt-0.5">
                                      <Users className="w-3.5 h-3.5 text-[#cc0000]" />
                                      {out.daftarPegawai?.length || 0} Pegawai Aktif Bulan Ini
                                    </p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2.5 self-start md:self-auto bg-white p-2 rounded-xl border border-neutral-100 shadow-sm">
                                  <span className="text-[11px] text-neutral-400 font-bold uppercase tracking-wider pl-1">Total Jam Kerja Cabang:</span>
                                  <span className="font-mono font-bold text-xs text-neutral-850 bg-neutral-100 px-2.5 py-1 rounded-md">
                                    {out.totalJamKerja || "0j 0m"}
                                  </span>
                                </div>
                              </div>

                              {/* Stats Bento Grid */}
                              <div className="p-5 grid grid-cols-2 sm:grid-cols-4 gap-3 bg-neutral-50/30 border-b border-neutral-100">
                                <div className="bg-white p-4 rounded-xl border border-neutral-200 shadow-sm">
                                  <p className="text-[10px] font-bold text-neutral-450 uppercase tracking-wider mb-1">TOTAL MASUK</p>
                                  <p className="text-xl font-black text-emerald-600">{out.jumlahMasuk || 0} <span className="text-xs font-normal text-neutral-500">Hari</span></p>
                                </div>
                                <div className="bg-white p-4 rounded-xl border border-neutral-200 shadow-sm">
                                  <p className="text-[10px] font-bold text-neutral-450 uppercase tracking-wider mb-1">TOTAL LEMBUR</p>
                                  <p className="text-xl font-black text-purple-600">{out.jumlahJamLembur || 0} <span className="text-xs font-normal text-neutral-500">Jam</span></p>
                                </div>
                                <div className="bg-white p-4 rounded-xl border border-neutral-200 shadow-sm">
                                  <p className="text-[10px] font-bold text-neutral-450 uppercase tracking-wider mb-1">TOTAL TELAT</p>
                                  <p className="text-xl font-black text-red-500">{out.jumlahTelat || 0} <span className="text-xs font-normal text-neutral-500">Kali</span></p>
                                </div>
                                <div className="bg-white p-4 rounded-xl border border-neutral-200 shadow-sm">
                                  <p className="text-[10px] font-bold text-neutral-450 uppercase tracking-wider mb-1">TOTAL IZIN/SAKIT</p>
                                  <p className="text-xl font-black text-amber-500">{out.jumlahIzin || 0} <span className="text-xs font-normal text-neutral-500">Hari</span></p>
                                </div>
                              </div>

                              {/* Employees Under This Outlet */}
                              <div className="p-5">
                                <h5 className="font-bold text-neutral-700 text-sm mb-3.5 flex items-center gap-1.5">
                                  <ClipboardList className="w-4 h-4 text-[#cc0000]" />
                                  Kontribusi Kerja Pegawai di Cabang Ini
                                </h5>
                                <div className="overflow-x-auto border border-neutral-200 rounded-xl bg-white shadow-sm">
                                  <table className="w-full text-xs text-left whitespace-nowrap">
                                    <thead className="bg-neutral-50 border-b border-neutral-200 text-neutral-500 uppercase tracking-wider font-bold">
                                      <tr>
                                        <th className="px-4 py-3">Nama Pegawai</th>
                                        <th className="px-4 py-3">Posisi</th>
                                        <th className="px-4 py-3">Kehadiran</th>
                                        <th className="px-4 py-3">Durasi Kerja</th>
                                        <th className="px-4 py-3">Total Lembur</th>
                                        <th className="px-4 py-3">Keterlambatan</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-neutral-100 font-medium text-neutral-700">
                                      {out.daftarPegawai && out.daftarPegawai.length > 0 ? (
                                        out.daftarPegawai.map((peg: any, pIdx: number) => (
                                          <tr key={pIdx} className="hover:bg-red-50 cursor-pointer transition" onClick={() => fetchDetailRiwayat(peg.nama, laporanBulan)}>
                                            <td className="px-4 py-3 font-bold text-neutral-800">{peg.nama}</td>
                                            <td className="px-4 py-3">
                                              <span className="bg-red-50 text-[#cc0000] px-2 py-0.5 rounded font-extrabold text-[9px] uppercase tracking-wider">
                                                {peg.posisi || "Admin"}
                                              </span>
                                            </td>
                                            <td className="px-4 py-3">{peg.jumlahMasuk} Hari</td>
                                            <td className="px-4 py-3 font-mono text-neutral-600 font-bold">{peg.totalJamKerja || "0j 0m"}</td>
                                            <td className="px-4 py-3 text-purple-600 font-bold">{peg.jumlahJamLembur ? `${peg.jumlahJamLembur} Jam` : "0 Jam"}</td>
                                            <td className="px-4 py-3">
                                              {peg.jumlahTelat > 0 ? (
                                                <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded font-bold text-[10px]">
                                                  {peg.jumlahTelat}x Telat
                                                </span>
                                              ) : (
                                                <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded font-bold text-[10px]">
                                                  Tepat Waktu
                                                </span>
                                              )}
                                            </td>
                                          </tr>
                                        ))
                                      ) : (
                                        <tr>
                                          <td colSpan={6} className="px-4 py-4 text-center text-neutral-450">Tidak ada data kontribusi pegawai.</td>
                                        </tr>
                                      )}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                    </>
                  )}
                  </div>
                </motion.div>
              )}


              {ownerView === 'outlet' && (
                <motion.div
                  key="owner-outlet"
                  initial={{ opacity: 0, x: 15 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -15 }}
                  transition={{ duration: 0.2 }}
                >
                  <OutletMapManager 
                    outlets={settingsData?.outlets || EMPTY_ARRAY}
                    onSaveOutlets={handleUpdateOutlets}
                    saving={savingSettings}
                    onRefresh={fetchSettings}
                  />
                </motion.div>
              )}

              {ownerView === 'settings' && (
                <motion.div
                  key="owner-settings"
                  initial={{ opacity: 0, x: 15 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -15 }}
                  transition={{ duration: 0.2 }}
                  className="flex flex-col gap-4 w-full"
                >
                  <div className="border-b border-neutral-100 pb-2">
                    <h2 className="font-bold text-neutral-800 text-lg">Pengaturan Aplikasi & Outlet</h2>
                    <p className="text-xs text-neutral-500">Konfigurasi preferensi global dan koordinat batas wilayah (geofence) absensi.</p>
                  </div>
                  
                  {errorSettings && (
                    <div className="p-3.5 bg-amber-50 border border-amber-200 text-amber-900 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-sm">
                      <div className="flex items-center gap-2.5">
                        <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
                        <div>
                          <p className="text-xs font-bold">Koneksi Server Google Apps Script Terkendala</p>
                          <p className="text-[11px] text-amber-700 leading-tight">{errorSettings}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto">
                        <button 
                          onClick={() => setShowGasUrlModal(true)} 
                          className="flex-1 sm:flex-none px-3 py-1.5 bg-[#cc0000] hover:bg-red-700 text-white text-xs font-bold rounded-lg transition shadow-sm flex items-center justify-center gap-1.5"
                        >
                          <Globe className="w-3.5 h-3.5" />
                          Atur URL Web App
                        </button>
                        <button 
                          onClick={fetchSettings} 
                          className="px-3 py-1.5 bg-amber-100 hover:bg-amber-200 text-amber-900 text-xs font-bold rounded-lg transition"
                        >
                          Coba Lagi
                        </button>
                      </div>
                    </div>
                  )}

                  {loadingSettings && !settingsData ? (
                    <div className="text-center text-neutral-500 py-10 border border-neutral-200 rounded-lg">Memuat pengaturan...</div>
                  ) : settingsData ? (
                    <div className="flex flex-col md:flex-row items-start gap-6 w-full">
                      {/* Left Sidebar: App Info & Main Toggles */}
                      <div className="bg-white border flex flex-col items-center border-neutral-200 rounded-xl p-6 shadow-sm w-full md:max-w-[280px] gap-4 shrink-0 md:sticky md:top-4">
                        <div className="flex flex-col items-center text-center gap-2">
                          <span className="text-[10px] font-bold text-neutral-400 tracking-wider uppercase">Logo / Favicon</span>
                          {settingsData.favicon && !faviconError ? (
                            <img 
                              src={settingsData.favicon} 
                              alt="Favicon" 
                              referrerPolicy="no-referrer"
                              onError={() => setFaviconError(true)}
                              className="w-16 h-16 object-contain rounded-full shadow-sm bg-neutral-50 border p-2" 
                            />
                          ) : (
                            <div className="w-16 h-16 rounded-full bg-[#cc0000] flex flex-col items-center justify-center text-white font-extrabold border-2 border-white shadow-md text-xs select-none">
                              <span>J&T</span>
                            </div>
                          )}
                          <p className="text-[10px] text-neutral-500 font-mono break-all line-clamp-2 max-w-[200px]" title={settingsData.favicon}>{settingsData.favicon || 'Standard J&T Icon'}</p>
                        </div>
                        
                        <div className="w-full h-px bg-neutral-100"></div>

                        {/* GAS Web App Endpoint Status */}
                        <div className="w-full flex flex-col gap-1.5 py-1">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-neutral-800 flex items-center gap-1.5">
                              <Globe className="w-3.5 h-3.5 text-[#cc0000]" />
                              Koneksi Spreadsheet
                            </span>
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-600">
                              GAS
                            </span>
                          </div>
                          <p className="text-[10px] text-neutral-400 font-mono truncate" title={GAS_URL}>
                            {GAS_URL}
                          </p>
                          <button
                            type="button"
                            onClick={() => setShowGasUrlModal(true)}
                            className="mt-1 w-full py-1.5 px-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 text-xs font-bold rounded-lg transition text-center"
                          >
                            Ubah URL Web App
                          </button>
                        </div>

                        <div className="w-full h-px bg-neutral-100"></div>

                        <div className="w-full flex items-center justify-between gap-2 py-1">
                          <div className="flex-1">
                            <p className="font-bold text-neutral-800 text-sm">Wajibkan GPS</p>
                            <p className="text-[10px] text-neutral-400 leading-tight">Pegawai harus absen radius outlet</p>
                          </div>
                           <button 
                            onClick={toggleLocationTracking}
                            disabled={savingSettings}
                            type="button"
                            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                              settingsData.requireLocation ? 'bg-[#cc0000]' : 'bg-neutral-300'
                            }`}
                          >
                            <span 
                              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                                settingsData.requireLocation ? 'translate-x-6' : 'translate-x-1'
                              }`}
                            />
                          </button>
                        </div>

                        <div className="w-full h-px bg-neutral-100"></div>

                        <div className="w-full flex items-center justify-between gap-2 py-1">
                          <div className="flex-1">
                            <p className="font-bold text-neutral-800 text-sm">Jam Masuk / Pulang</p>
                            <p className="text-[10px] text-neutral-400 leading-tight">
                              {settingsData.enableWorkHours !== false ? 'Aturan jam kerja aktif' : 'Bebas jam (nonaktif)'}
                            </p>
                          </div>
                           <button 
                            onClick={toggleWorkHours}
                            disabled={savingSettings}
                            type="button"
                            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                              settingsData.enableWorkHours !== false ? 'bg-[#cc0000]' : 'bg-neutral-300'
                            }`}
                          >
                            <span 
                              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                                settingsData.enableWorkHours !== false ? 'translate-x-6' : 'translate-x-1'
                              }`}
                            />
                          </button>
                        </div>
                      </div>

                      {/* Right Panel: Position Manager & Interactive Outlet Map */}
                      <div className="flex-1 w-full min-w-0 flex flex-col gap-6">
                        {/* Kelola Posisi Pegawai */}
                        <div className="bg-white border border-neutral-200 rounded-xl p-5 shadow-sm">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 mb-4 border-b border-neutral-100">
                            <div className="flex items-center gap-2.5">
                              <div className="p-2 bg-red-50 text-[#cc0000] rounded-lg border border-red-100">
                                <Briefcase className="w-5 h-5" />
                              </div>
                              <div>
                                <h3 className="font-bold text-neutral-800 text-base">Kelola Posisi Pegawai</h3>
                                <p className="text-xs text-neutral-500">Tambah, edit, atau hapus daftar posisi serta jadwal jam masuk dan pulang.</p>
                              </div>
                            </div>
                            <span className="self-start sm:self-auto text-xs font-bold px-2.5 py-1 bg-neutral-100 text-neutral-700 rounded-full border border-neutral-200">
                              {availablePositions.length} Posisi
                            </span>
                          </div>

                          {/* Tombol On/Off Aturan Jam Masuk & Pulang */}
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 mb-5 rounded-xl bg-neutral-50 border border-neutral-200">
                            <div className="flex items-center gap-3">
                              <div className={`p-2 rounded-lg ${settingsData.enableWorkHours !== false ? 'bg-red-50 text-[#cc0000] border border-red-100' : 'bg-neutral-200 text-neutral-600'}`}>
                                <Clock className="w-5 h-5" />
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="font-bold text-neutral-800 text-sm">Aturan Jam Masuk & Pulang</span>
                                  <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${
                                    settingsData.enableWorkHours !== false ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' : 'bg-neutral-200 text-neutral-600'
                                  }`}>
                                    {settingsData.enableWorkHours !== false ? 'ON' : 'OFF'}
                                  </span>
                                </div>
                                <p className="text-xs text-neutral-500">
                                  {settingsData.enableWorkHours !== false 
                                    ? 'Aktif: Jam masuk, toleransi batas telat, dan deteksi pulang cepat diberlakukan.' 
                                    : 'Nonaktif: Pegawai bebas absen kapan saja tanpa penolakan batas waktu.'}
                                </p>
                              </div>
                            </div>
                            <button 
                              type="button"
                              onClick={toggleWorkHours}
                              disabled={savingSettings}
                              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors cursor-pointer self-start sm:self-center ${
                                settingsData.enableWorkHours !== false ? 'bg-[#cc0000]' : 'bg-neutral-300'
                              }`}
                            >
                              <span 
                                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                                  settingsData.enableWorkHours !== false ? 'translate-x-6' : 'translate-x-1'
                                }`}
                              />
                            </button>
                          </div>

                          {/* Form Tambah Posisi */}
                          <div className="flex items-center gap-2 mb-5">
                            <input
                              type="text"
                              value={newPosisiInput}
                              onChange={(e) => setNewPosisiInput(e.target.value)}
                              onKeyDown={(e) => { if (e.key === 'Enter') handleAddPosisi(); }}
                              placeholder="Ketik nama posisi baru (misal: Kurir, Supervisor, Driver)..."
                              className="flex-1 p-2.5 text-sm bg-neutral-50 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-[#cc0000] focus:bg-white outline-none transition"
                            />
                            <button
                              type="button"
                              onClick={handleAddPosisi}
                              disabled={savingSettings}
                              className="px-4 py-2.5 bg-[#cc0000] hover:bg-red-700 text-white font-bold text-sm rounded-lg shadow-sm flex items-center gap-1.5 transition shrink-0 disabled:opacity-50"
                            >
                              <Plus className="w-4 h-4" />
                              <span>Tambah Posisi</span>
                            </button>
                          </div>

                          {/* List Posisi */}
                          <div className="overflow-hidden border border-neutral-200 rounded-xl bg-neutral-50/50">
                            <div className="divide-y divide-neutral-200">
                              {availablePositions.map((pos, idx) => (
                                <div key={idx} className="p-3.5 bg-white flex items-center justify-between gap-3 hover:bg-neutral-50 transition">
                                  {editingPosisiIndex === idx ? (
                                    <div className="flex flex-col gap-2 flex-1">
                                      <input
                                        type="text"
                                        value={editingPosisiValue}
                                        onChange={(e) => setEditingPosisiValue(e.target.value)}
                                        onKeyDown={(e) => { if (e.key === 'Enter') handleSaveEditPosisi(idx); if (e.key === 'Escape') setEditingPosisiIndex(null); }}
                                        className="flex-1 p-2 text-sm bg-white border border-[#cc0000] rounded-md focus:ring-2 focus:ring-[#cc0000] outline-none font-semibold text-neutral-800"
                                        autoFocus
                                      />
                                      <div className="flex gap-2">
                                        <div className="flex-1 flex items-center gap-2">
                                          <label className="text-xs text-neutral-500 w-16">Masuk:</label>
                                          <input type="time" value={pos.jamMasuk} onChange={(e) => {
                                            const updated = [...availablePositions];
                                            updated[idx].jamMasuk = e.target.value;
                                            handleUpdatePositions(updated);
                                          }} className="p-1 border rounded text-xs" />
                                        </div>
                                        <div className="flex-1 flex items-center gap-2">
                                          <label className="text-xs text-neutral-500 w-16">Pulang:</label>
                                          <input type="time" value={pos.jamPulang} onChange={(e) => {
                                            const updated = [...availablePositions];
                                            updated[idx].jamPulang = e.target.value;
                                            handleUpdatePositions(updated);
                                          }} className="p-1 border rounded text-xs" />
                                        </div>
                                      </div>
                                      <div className="flex items-center justify-between mt-1">
                                        <label className="flex items-center gap-2 text-xs font-semibold text-neutral-700 cursor-pointer">
                                          <input 
                                            type="checkbox"
                                            checked={pos.enabled !== false}
                                            onChange={(e) => {
                                              const updated = [...availablePositions];
                                              updated[idx].enabled = e.target.checked;
                                              handleUpdatePositions(updated);
                                            }}
                                            className="rounded text-[#cc0000] focus:ring-[#cc0000]"
                                          />
                                          <span>Aktifkan aturan jam masuk/pulang untuk posisi ini</span>
                                        </label>
                                      </div>
                                      <div className="flex gap-2 justify-end mt-1">
                                        <button
                                          type="button"
                                          onClick={() => handleSaveEditPosisi(idx)}
                                          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md transition text-xs font-bold flex items-center gap-1 shadow-sm"
                                          title="Simpan"
                                        >
                                          <Check className="w-3.5 h-3.5" />
                                          <span>Simpan</span>
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => setEditingPosisiIndex(null)}
                                          className="px-3 py-1.5 bg-neutral-200 hover:bg-neutral-300 text-neutral-700 rounded-md transition text-xs font-bold"
                                          title="Batal"
                                        >
                                          <span>Batal</span>
                                        </button>
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="flex items-center justify-between w-full">
                                      <div className="flex flex-col gap-1">
                                        <div className="flex items-center gap-2.5">
                                          <span className="w-6 h-6 rounded-full bg-red-50 text-[#cc0000] font-mono text-xs font-extrabold flex items-center justify-center border border-red-100">
                                            {idx + 1}
                                          </span>
                                          <span className="font-bold text-neutral-800 text-sm">{pos.name}</span>
                                        </div>
                                        <div className="flex flex-wrap items-center gap-3 pl-8 text-xs text-neutral-500">
                                          <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> Masuk: <strong className="text-neutral-700">{pos.jamMasuk}</strong></span>
                                          <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> Pulang: <strong className="text-neutral-700">{pos.jamPulang}</strong></span>
                                          <button
                                            type="button"
                                            onClick={() => handleTogglePositionHours(idx)}
                                            disabled={savingSettings}
                                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold border transition cursor-pointer ${
                                              pos.enabled !== false 
                                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100' 
                                                : 'bg-neutral-100 text-neutral-500 border-neutral-200 hover:bg-neutral-200'
                                            }`}
                                            title="Klik untuk mengubah status aturan jam masuk/pulang posisi ini"
                                          >
                                            {pos.enabled !== false ? 'Jam: ON' : 'Jam: OFF'}
                                          </button>
                                        </div>
                                      </div>
                                      <div className="flex items-center gap-1.5 shrink-0">
                                        <button
                                          type="button"
                                          onClick={() => handleStartEditPosisi(idx, pos.name)}
                                          disabled={savingSettings}
                                          className="p-1.5 text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 rounded-md transition flex items-center gap-1 text-xs font-medium border border-transparent hover:border-neutral-200"
                                          title="Edit Posisi"
                                        >
                                          <Pencil className="w-3.5 h-3.5 text-neutral-500" />
                                          <span className="hidden sm:inline">Edit</span>
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => handleDeletePosisi(idx)}
                                          disabled={savingSettings}
                                          className="p-1.5 text-red-600 hover:text-red-700 hover:bg-red-50 rounded-md transition flex items-center gap-1 text-xs font-medium border border-transparent hover:border-red-100"
                                          title="Hapus Posisi"
                                        >
                                          <Trash2 className="w-3.5 h-3.5" />
                                          <span className="hidden sm:inline">Hapus</span>
                                        </button>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>

                        <OutletMapManager 
                          outlets={settingsData.outlets || EMPTY_ARRAY}
                          onSaveOutlets={handleUpdateOutlets}
                          saving={savingSettings}
                          onRefresh={fetchSettings}
                        />
                      </div>
                    </div>
                  ) : (
                     <div className="text-center text-neutral-500 py-10 border border-neutral-200 rounded-lg">Tidak ada data pengaturan.</div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
            </div>
          )}
        </div>
      )}


      {/* Preview Modal for Images and Maps */}
      {previewModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200" onClick={() => setPreviewModal(null)}>
          <div 
            className="bg-white rounded-xl shadow-2xl w-full max-w-3xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-300"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-3 border-b flex items-center justify-between">
              <h3 className="font-bold text-neutral-800">{previewModal.title}</h3>
              <button onClick={() => setPreviewModal(null)} className="p-1.5 text-neutral-500 hover:text-neutral-800 hover:bg-neutral-100 rounded-full transition">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-0 bg-neutral-100 flex items-center justify-center min-h-[300px] max-h-[75vh]">
              {previewModal.type === 'image' ? (
                <img src={getDirectDriveUrl(previewModal.url)} alt={previewModal.title} className="max-w-full max-h-[75vh] object-contain block mx-auto" referrerPolicy="no-referrer" />
              ) : (
                <iframe src={previewModal.url} className="w-full h-[60vh] border-0" title={previewModal.title} allowFullScreen loading="lazy" />
              )}
            </div>
            <div className="p-3 border-t bg-neutral-50 flex justify-end">
              <a href={previewModal.url} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-blue-600 hover:text-blue-700 bg-white border border-neutral-200 px-4 py-2 rounded shadow-sm transition">
                Buka di Tab Baru
              </a>
            </div>
          </div>
        </div>
      )}


      {/* Modal Detail Bulanan */}
      <AnimatePresence>
        {selectedPegawaiDetail && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-end bg-black/60 backdrop-blur-sm"
            onClick={() => setSelectedPegawaiDetail(null)}
          >
            <motion.div 
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 240 }}
              className="bg-white h-full w-full max-w-2xl shadow-2xl flex flex-col overflow-hidden md:rounded-l-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header Modal */}
              <div className="p-4 border-b border-neutral-100 bg-neutral-50 font-sans">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-bold text-neutral-800 text-lg">{selectedPegawaiDetail.nama}</h3>
                    <p className="text-xs text-neutral-500 font-semibold">Bulan: {selectedPegawaiDetail.bulan}</p>
                  </div>
                  <button 
                    onClick={() => setSelectedPegawaiDetail(null)}
                    className="p-2 text-neutral-400 hover:text-neutral-700 hover:bg-neutral-200 rounded-full transition cursor-pointer shrink-0"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {!loadingDetail && detailRiwayat.length > 0 && (() => {
                  const posSummaries = getSummaryByPosition(detailRiwayat);
                  return (
                    <div className="mt-3.5 grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full">
                      {posSummaries.map((ps) => (
                        <div key={ps.posisi} className="bg-white border border-neutral-200 rounded-xl p-3 shadow-sm flex flex-col justify-between">
                          <div>
                            <div className="text-xs font-bold text-neutral-800 border-b border-neutral-100 pb-1.5 mb-2 flex items-center justify-between">
                              <span className="bg-red-50 text-[#cc0000] px-2 py-0.5 rounded-md font-extrabold uppercase text-[10px]">
                                {ps.posisi}
                              </span>
                              <span className="text-[10px] text-neutral-500 font-semibold">({ps.jumlahMasuk} Hari Kerja)</span>
                            </div>
                            <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px] text-neutral-600 font-semibold">
                              <div className="flex justify-between border-b border-neutral-50 pb-0.5">
                                <span className="text-neutral-400 font-medium">Masuk:</span>
                                <span className="text-emerald-600 font-black">{ps.jumlahMasuk} H</span>
                              </div>
                              <div className="flex justify-between border-b border-neutral-50 pb-0.5">
                                <span className="text-neutral-400 font-medium">Lembur:</span>
                                <span className="text-purple-600 font-black">{ps.jumlahLembur} Jam</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-neutral-400 font-medium">Telat:</span>
                                <span className="text-red-500 font-black">{ps.jumlahTelat} x</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-neutral-400 font-medium">Izin/Sakit:</span>
                                <span className="text-amber-600 font-black">{ps.jumlahIzin} H</span>
                              </div>
                            </div>
                          </div>
                          <div className="mt-3 pt-2 border-t border-dashed border-neutral-100 flex justify-between items-center text-[11px]">
                            <span className="text-neutral-400 font-medium">Total Durasi:</span>
                            <span className="font-mono font-bold text-neutral-800 bg-neutral-100 px-1.5 py-0.5 rounded text-[10px]">
                              {Math.floor(ps.totalMenit / 60)}j {ps.totalMenit % 60}m
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>


              {/* Body / List Absensi */}
              <div className="p-4 overflow-y-auto flex-1 bg-neutral-50 font-sans">
                {loadingDetail ? (
                  <div className="text-center py-12 flex flex-col justify-center items-center gap-3">
                    <div className="w-8 h-8 rounded-full border-4 border-neutral-200 border-t-[#cc0000] animate-spin"></div>
                    <p className="text-sm font-medium text-neutral-500">Memuat detail riwayat...</p>
                  </div>
                ) : detailRiwayat.length === 0 ? (
                  <div className="text-center py-10 bg-white rounded-xl border border-neutral-200 shadow-sm">
                    <p className="text-neutral-500 text-sm font-medium">Belum ada riwayat absensi di bulan ini.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {detailRiwayat.map((row, idx) => (
                      <div key={idx} className="bg-white border border-neutral-200 rounded-xl p-4 flex flex-col gap-3 shadow-sm hover:border-[#cc0000]/30 transition relative overflow-hidden">
                        <div className={`absolute left-0 top-0 bottom-0 w-1 ${row.statusMasuk === 'TEPAT WAKTU' ? 'bg-green-500' : row.statusMasuk === 'TELAT' ? 'bg-red-500' : 'bg-blue-500'}`}></div>
                        
                        <div className="flex justify-between items-center border-b border-neutral-100 pb-3 pl-2">
                          <div className="flex items-center gap-2">
                            <div className="bg-neutral-100 px-3 py-1 rounded-md text-xs font-bold text-neutral-700">
                              {row.tanggal}
                            </div>
                          </div>
                          <span className={`px-2.5 py-1 rounded-md text-[10px] font-bold ${row.statusMasuk === 'TEPAT WAKTU' ? 'bg-green-100 text-green-700' : row.statusMasuk === 'TELAT' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>
                            {row.statusMasuk || row.keterangan || "-"}
                          </span>
                        </div>


                        <div className="grid grid-cols-2 gap-3 pl-2">
                          <div className="flex flex-col gap-1">
                            <p className="text-[10px] text-neutral-500 font-bold">MASUK</p>
                            <p className="font-mono font-bold text-neutral-800 text-sm">{row.jamDatang || "-"}</p>
                            {(row.statusMasuk === 'TELAT' || row.keterangan === 'IZIN') && row.alasan && (
                              <p className="text-[10px] text-red-600 bg-red-50 px-2 py-1 rounded italic mt-1 leading-tight border border-red-100">
                                "{row.alasan}"
                              </p>
                            )}
                          </div>
                          <div className="flex flex-col gap-1 items-end text-right">
                            <p className="text-[10px] text-neutral-500 font-bold flex gap-1 items-center">
                              {row.statusPulang && row.statusPulang !== "-" && (
                                <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold ${row.statusPulang === 'NORMAL' ? 'bg-green-100 text-green-700' : row.statusPulang === 'LEMBUR' ? 'bg-purple-100 text-purple-700' : 'bg-neutral-100 text-neutral-700'}`}>{row.statusPulang}</span>
                              )}
                              PULANG
                            </p>
                            <p className="font-mono font-bold text-neutral-800 text-sm">{row.jamPulang && row.jamPulang !== "-" ? row.jamPulang : "-"}</p>
                            <p className="text-[10px] text-neutral-500 font-semibold mt-1">Durasi: {row.totalJam && row.totalJam !== "-" ? row.totalJam : "-"}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Footer / Clear Cache Button */}
      <div className="mt-8 mb-4 max-w-xs w-full flex flex-col items-center gap-1.5 text-center px-4 self-center animate-in fade-in duration-300">
        <button
          onClick={handleHapusCache}
          className="text-[11px] font-bold text-neutral-500 hover:text-[#cc0000] hover:border-[#cc0000] border border-neutral-300 bg-white hover:bg-red-50/40 px-4 py-2.5 rounded-lg transition shadow-sm select-none uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer w-full"
        >
          <RefreshCw className="w-3.5 h-3.5 transition-transform duration-500 hover:rotate-180" />
          Hapus Cache / Reload Aplikasi
        </button>
        <p className="text-[10px] text-neutral-400 font-medium leading-relaxed">
          Gunakan tombol di atas agar pengaturan sistem terbaru muncul di HP Anda.
        </p>

        <button
          type="button"
          onClick={() => setShowGasUrlModal(true)}
          className="text-[11px] text-neutral-400 hover:text-neutral-700 font-semibold flex items-center justify-center gap-1.5 py-1 transition"
        >
          <Globe className="w-3.5 h-3.5 text-[#cc0000]" />
          Konfigurasi URL Google Apps Script
        </button>
      </div>

      <GasUrlModal
        isOpen={showGasUrlModal}
        onClose={() => setShowGasUrlModal(false)}
        currentUrl={gasUrl}
        onSave={handleSaveGasUrl}
        onReset={handleResetGasUrl}
      />
    </div>
  );
}