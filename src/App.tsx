import React, { useState, useEffect, useRef } from 'react';
import { Camera, MapPin, Send, AlertCircle, LocateFixed, CheckCircle2, FileImage, ClipboardList, History, Users, Bell, X, LogOut } from 'lucide-react';
import { Toaster, toast } from 'sonner';
import OutletMapManager from './components/OutletMapManager';


const GAS_URL = (import.meta as any).env.VITE_GAS_URL || "https://script.google.com/macros/s/AKfycbwwPFCh_erWDclX-zyWFhkgFtlMMZcU5egyRzAN3Op23nNfaw16zVJeoujJo4JpvONM/exec";


const getMapEmbedUrl = (url?: string) => {
  if (!url) return null;
  const match = url.match(/q=([-0-9.]+),([-0-9.]+)/);
  if (match) {
    return `https://maps.google.com/maps?q=${match[1]},${match[2]}&t=&z=14&ie=UTF8&iwloc=&output=embed`;
  }
  return null;
};


export const OUTLETS = [
  { name: "YZ_ MDP PASIR JAHA BALARAJA", lat: -6.205649180689262, lng: 106.45134398119775 },
  { name: "YZ_ MDP JAYANTI CIKANDE", lat: -6.206571510648256, lng: 106.38621792361727 }
];


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
  if (!val) return "-";
  const str = String(val).trim();
  if (str === "-") return "-";
  
  if (str.includes("T") && !isNaN(Date.parse(str))) {
    const d = new Date(str);
    const h = d.getHours().toString().padStart(2, '0');
    const m = d.getMinutes().toString().padStart(2, '0');
    return `${h}:${m}`;
  }
  
  return str;
};


type StatusAbsen = "DATANG" | "PULANG" | "IZIN";
type PosisiPegawai = "Admin" | "Admin (Training)" | "Pickup" | "";


export default function App() {
  const [activeTab, setActiveTab] = useState<'absen' | 'owner'>('absen');
  const [isOwnerLoggedIn, setIsOwnerLoggedIn] = useState(false);
  const [ownerPasswordInput, setOwnerPasswordInput] = useState("");
  const [ownerLoginError, setOwnerLoginError] = useState("");


  const [daftarPegawai, setDaftarPegawai] = useState<string[]>([]);
  const [loadingNames, setLoadingNames] = useState(true);
  
  const [nama, setNama] = useState("");
  const [posisi, setPosisi] = useState<PosisiPegawai>("");
  const [outlet, setOutlet] = useState("");
  const [keterangan, setKeterangan] = useState<StatusAbsen>("DATANG");
  const [jenisIzin, setJenisIzin] = useState<"Izin" | "Sakit">("Izin");
  const [alasan, setAlasan] = useState("");
  const [keteranganTelat, setKeteranganTelat] = useState("");
  
  const [imageBase64, setImageBase64] = useState("");
  const [loadingSubmit, setLoadingSubmit] = useState(false);
  const [buktiFeishuBase64, setBuktiFeishuBase64] = useState("");
  const [isFeishuOpen, setIsFeishuOpen] = useState(false);


  const [riwayat, setRiwayat] = useState<any[]>([]);
  const [loadingRiwayat, setLoadingRiwayat] = useState(false);


  const [ringkasanHarian, setRingkasanHarian] = useState<any[]>([]);
  const [loadingRingkasan, setLoadingRingkasan] = useState(false);


  const [snoozeUntil, setSnoozeUntil] = useState<number | null>(null);
  const [showPulangReminder, setShowPulangReminder] = useState(false);


  const [laporanBulanan, setLaporanBulanan] = useState<any[]>([]);
  const [loadingLaporan, setLoadingLaporan] = useState(false);
  const [ownerView, setOwnerView] = useState<'harian' | 'bulanan' | 'settings'>('harian');
  const [targetJamKerja, setTargetJamKerja] = useState<number>(8);
  const [laporanPosisiFilter, setLaporanPosisiFilter] = useState<'Semua' | 'Admin' | 'Pickup'>('Semua');
  const [laporanBulan, setLaporanBulan] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}`;
  });

  const [errorNames, setErrorNames] = useState("");
  const [errorRiwayat, setErrorRiwayat] = useState("");
  const [errorRingkasan, setErrorRingkasan] = useState("");
  const [errorLaporan, setErrorLaporan] = useState("");
  const [settingsData, setSettingsData] = useState<any>(null);
  const [loadingSettings, setLoadingSettings] = useState(false);
  const [errorSettings, setErrorSettings] = useState("");

  const fetchWithRetry = async (url: string, options?: RequestInit, retries = 2): Promise<Response> => {
    let lastErr: any;
    for (let i = 0; i <= retries; i++) {
      try {
        const res = await fetch(url, options);
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


  const getTodayString = () => {
    const d = new Date();
    return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;
  };


  const todayStr = getTodayString();
  const absenHariIni = riwayat.find(r => r.tanggal === todayStr || r.tanggal === new Date().toLocaleDateString('id-ID'));


  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  useEffect(() => {
    if (!('Notification' in window) || !('geolocation' in navigator)) return;

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        if (hasNotifiedGeoRef.current) return;
        
        // Jika sudah absen hari ini, tak perlu notifikasi
        if (absenHariIni && absenHariIni.jamDatang && absenHariIni.jamDatang !== "-") return;

        const userLat = pos.coords.latitude;
        const userLng = pos.coords.longitude;
        const activeOutlets = settingsData?.outlets?.length ? settingsData.outlets : OUTLETS;

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
  }, [absenHariIni, settingsData?.outlets]);


  const getSisaWaktuKerja = (jamDatangStr: string, targetJam: number) => {
    if (!jamDatangStr || jamDatangStr === "-") return null;
    const parts = jamDatangStr.split(":");
    if (parts.length !== 2) return null;
    
    const hDatang = parseInt(parts[0], 10);
    const mDatang = parseInt(parts[1], 10);
    
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
    const now = new Date();
    const hours = now.getHours();
    const minutes = now.getMinutes();
    const totalMinutes = hours * 60 + minutes;


    if (posisi === "Admin" || posisi === "Admin (Training)") {
      return totalMinutes > 510; // > 08:30 (8 * 60 + 30)
    } else if (posisi === "Pickup") {
      return totalMinutes >= 780; // >= 13:00 (13 * 60)
    }
    return false;
  };


  const isLate = checkIfLate();


  useEffect(() => {
    if (keterangan === "PULANG" && absenHariIni) {
      if (absenHariIni.outlet) setOutlet(absenHariIni.outlet);
      if (absenHariIni.posisi) setPosisi(absenHariIni.posisi as PosisiPegawai);
    }
  }, [keterangan, absenHariIni]);


  const fetchPegawai = async () => {
    setLoadingNames(true);
    setErrorNames("");
    try {
      if (!GAS_URL) {
        setDaftarPegawai(["Mohammad Danang", "Bambang", "Fitri Fajria", "Irma Damayanti", "M. Hari Yanto"]);
        setLoadingNames(false);
        return;
      }

      console.log(`[fetchPegawai] Mengirim request ke: ${GAS_URL}?action=getPegawai`);
      const res = await fetchWithRetry(`${GAS_URL}?action=getPegawai`);
      const textData = await res.text();
      console.log(`[fetchPegawai] Response raw text:`, textData);
      
      let data;
      try {
        data = JSON.parse(textData);
      } catch (parseErr) {
        console.error(`[fetchPegawai] JSON Parse Error. Response bukan JSON yang valid. Pastikan URL Web App benar dan di-deploy sebagai 'Anyone'. Raw:`, textData);
        throw new Error("Format respons dari server tidak valid (Bukan JSON). Periksa URL App Script Anda.");
      }

      if (data.status === 'success') {
        console.log(`[fetchPegawai] Berhasil mendapatkan data pegawai:`, data.data);
        setDaftarPegawai(data.data);
        setErrorNames("");
      } else {
        console.error(`[fetchPegawai] Error dari server:`, data.message);
        throw new Error(`Gagal load data pegawai: ${data.message || 'Unknown error'}`);
      }
    } catch (err: any) {
      console.error(`[fetchPegawai] Kesalahan jaringan atau fetch:`, err);
      setErrorNames(`Gagal memuat daftar pegawai: ${err?.message}`);
      // Fallback for preview
      setDaftarPegawai(["Fitri Fajria (Preview offline)", "Mohammad Danang (Preview offline)"]);
    } finally {
      setLoadingNames(false);
    }
  };

  useEffect(() => {
    fetchPegawai();
    fetchSettings();
  }, [GAS_URL, activeTab]);


  const fetchRiwayat = async (pegawaiName: string) => {
    setLoadingRiwayat(true);
    setErrorRiwayat("");
    if (!GAS_URL) {
      setTimeout(() => {
        setRiwayat([
          { tanggal: getTodayString(), jamDatang: "08:00", jamPulang: "20:00", statusMasuk: "TEPAT WAKTU", statusPulang: "NORMAL", outlet: "YZ_ MDP PASIR JAHA BALARAJA", posisi: "Admin" },
          { tanggal: "01/06/2026", jamDatang: "08:15", jamPulang: "19:45", statusMasuk: "TELAT", statusPulang: "NORMAL", outlet: "YZ_ MDP PASIR JAHA BALARAJA", posisi: "Admin" },
        ]);
        setLoadingRiwayat(false);
      }, 800);
      return;
    }


    try {
      console.log(`[fetchRiwayat] Mendapatkan riwayat untuk ${pegawaiName}...`);
      const res = await fetchWithRetry(`${GAS_URL}?action=getRiwayat&nama=${encodeURIComponent(pegawaiName)}`);
      const textData = await res.text();
      console.log(`[fetchRiwayat] Response raw text:`, textData);
      
      let data;
      try {
        data = JSON.parse(textData);
      } catch (e) {
        throw new Error("Gagal mem-parsing riwayat. Periksa koneksi atau URL GAS.");
      }
      
      if (data.status === 'success') {
        console.log(`[fetchRiwayat] Sukses mendapatkan ${data.data?.length} baris riwayat.`);
        const formattedData = data.data.map((r: any) => ({
          ...r,
          tanggal: formatSheetDate(r.tanggal),
          jamDatang: formatSheetTime(r.jamDatang),
          jamPulang: formatSheetTime(r.jamPulang),
        }));
        setRiwayat(formattedData);
      } else {
        console.error(`[fetchRiwayat] Error dari server: ${data.message}`);
        throw new Error(data.message || 'Unknown error');
      }
    } catch (e: any) {
      console.error(`[fetchRiwayat] Kesalahan:`, e);
      setErrorRiwayat(`Gagal memuat riwayat: ${e?.message}`);
      toast.error(`Gagal memuat riwayat: ${e.message}`);
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
      const textData = await res.text();
      console.log(`[fetchRingkasanHarian] Response raw text:`, textData);
      
      let data = JSON.parse(textData);
      if (data.status === 'success') {
        console.log(`[fetchRingkasanHarian] Berhasil mendapat ${data.data?.length} ringkasan harian.`);
        const formattedData = data.data.map((r: any) => ({
          ...r,
          tanggal: formatSheetDate(r.tanggal),
          jamDatang: formatSheetTime(r.jamDatang),
          jamPulang: formatSheetTime(r.jamPulang),
        }));
        setRingkasanHarian(formattedData);
      } else {
        console.error(`[fetchRingkasanHarian] Server Error: ${data.message}`);
        throw new Error(data.message || 'Unknown error');
      }
    } catch (e: any) {
      console.error(`[fetchRingkasanHarian] Error:`, e);
      setErrorRingkasan(`Gagal memuat ringkasan harian: ${e.message}`);
      // if (activeTab === 'monitoring') { // Actually 'owner' now
      //   toast.error(`Gagal memuat ringkasan harian: ${e.message}`);
      // }
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
        setLoadingLaporan(false);
      }, 800);
      return;
    }


    try {
      console.log(`[fetchLaporanBulanan] Memuat laporan untuk bulan ${bulan}...`);
      const res = await fetchWithRetry(`${GAS_URL}?action=getLaporanBulanan&bulan=${bulan}`);
      const textData = await res.text();
      console.log(`[fetchLaporanBulanan] Response raw text:`, textData);
      
      let data = JSON.parse(textData);
      if (data.status === 'success') {
        console.log(`[fetchLaporanBulanan] Berhasil mendapatkan laporan ${data.data?.length} pegawai.`);
        setLaporanBulanan(data.data);
      } else {
        console.error(`[fetchLaporanBulanan] Server Error: ${data.message}`);
        throw new Error(data.message || 'Unknown error');
      }
    } catch (e: any) {
      console.error(`[fetchLaporanBulanan] Error:`, e);
      setErrorLaporan(`Gagal memuat laporan bulanan: ${e.message}`);
    } finally {
      setLoadingLaporan(false);
    }
  };

  const [savingSettings, setSavingSettings] = useState(false);

  const toggleLocationTracking = async () => {
    const newStatus = settingsData?.requireLocation === false ? true : false;
    
    // Update locally first for instant feedback
    setSettingsData((prev: any) => ({
        ...prev,
        requireLocation: newStatus
    }));

    setSavingSettings(true);
    const loadingToastId = toast.loading("Menyimpan pengaturan...");
    try {
      const payload = {
        action: 'saveSettings',
        data: { requireLocation: newStatus }
      };
      const response = await fetch(GAS_URL, {
        method: "POST",
        body: JSON.stringify(payload)
      });
      const result = await response.json();
      if (result.status === "success") {
        toast.success("Pengaturan lokasi berhasil disimpan.", { id: loadingToastId });
      } else {
        toast.error(`Gagal menyimpan (pastikan Kode.gs diperbarui): ${result.message}`, { id: loadingToastId });
      }
    } catch (e: any) {
        toast.error(`Error menyimpan pengaturan: ${e.message}`, { id: loadingToastId });
    } finally {
        setSavingSettings(false);
    }
  };

  const handleUpdateOutlets = async (updatedOutlets: any[]) => {
    // Update locally first for instant feedback
    setSettingsData((prev: any) => ({
        ...prev,
        outlets: updatedOutlets
    }));

    setSavingSettings(true);
    const loadingToastId = toast.loading("Menyimpan koordinat outlet...");
    try {
      const payload = {
        action: 'saveSettings',
        data: { 
          requireLocation: settingsData?.requireLocation !== false,
          outlets: updatedOutlets 
        }
      };
      const response = await fetch(GAS_URL, {
        method: "POST",
        body: JSON.stringify(payload)
      });
      const result = await response.json();
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
      const textData = await res.text();
      console.log(`[fetchSettings] Response raw text:`, textData);
      let data = JSON.parse(textData);
      if (data.status === 'success') {
        setSettingsData(data.data);
        if (data.data.favicon) {
          let link = document.querySelector("link[rel~='icon']") as HTMLLinkElement;
          if (!link) {
            link = document.createElement('link');
            link.rel = 'icon';
            document.getElementsByTagName('head')[0].appendChild(link);
          }
          link.href = data.data.favicon;
        }
      } else {
        throw new Error(data.message || 'Unknown error fetching settings');
      }
    } catch (e: any) {
      console.error(`[fetchSettings] Error:`, e);
      setErrorSettings(`Gagal memuat pengaturan: ${e.message}`);
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
      const res = await fetch(`${GAS_URL}?action=getRiwayatBulan&nama=${encodeURIComponent(pegawaiName)}&bulan=${bulan}`);
      const data = await res.json();
      if (data.status === 'success') {
        const formattedData = data.data.map((r: any) => ({
          ...r,
          tanggal: formatSheetDate(r.tanggal),
          jamDatang: formatSheetTime(r.jamDatang),
          jamPulang: formatSheetTime(r.jamPulang),
        }));
        setDetailRiwayat(formattedData);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingDetail(false);
    }
  };


  useEffect(() => {
    if (activeTab === 'absen' && nama) {
      fetchRiwayat(nama);
    }
  }, [nama, activeTab]);


  useEffect(() => {
    if (activeTab === 'owner' && isOwnerLoggedIn) {
      if (ownerView === 'harian') fetchRingkasanHarian();
      if (ownerView === 'bulanan') fetchLaporanBulanan(laporanBulan);
    }
  }, [activeTab, isOwnerLoggedIn, ownerView, laporanBulan]);


  useEffect(() => {
    const checkReminder = () => {
      const now = new Date();
      if (now.getHours() >= 20) {
        if (snoozeUntil && now.getTime() < snoozeUntil) {
          setShowPulangReminder(false);
        } else {
          setShowPulangReminder(true);
        }
      } else {
        setShowPulangReminder(false);
      }
    };
    
    checkReminder();
    const interval = setInterval(checkReminder, 60000);
    return () => clearInterval(interval);
  }, [snoozeUntil]);


  const handleSnooze = () => {
    setSnoozeUntil(new Date().getTime() + 30 * 60 * 1000); // 30 mins
    setShowPulangReminder(false);
  };


  const handleAbsenSekarang = () => {
    setActiveTab('absen');
    setKeterangan('PULANG');
    setShowPulangReminder(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };


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
      if (!absenHariIni || !absenHariIni.jamDatang || absenHariIni.jamDatang === "-") {
        return toast.error("Anda belum absen DATANG hari ini!");
      }
      if (absenHariIni.jamPulang && absenHariIni.jamPulang !== "-") {
        return toast.error("Anda sudah melakukan absen PULANG hari ini!");
      }
    }


    if (keterangan === "DATANG" && absenHariIni && absenHariIni.jamDatang && absenHariIni.jamDatang !== "-") {
      return toast.error("Anda sudah melakukan absen DATANG hari ini! Silakan pilih Aktivitas absensi PULANG.");
    }


    if (keterangan !== "IZIN") {
      if (!outlet) return toast.error("Pilih Outlet tempat Anda absen!");
      if (!imageBase64) return toast.error("Silahkan ambil foto selfie bukti absensi!");
      if (isLate && !keteranganTelat) return toast.error("Harap isi keterangan alasan Anda telat!");
    } else {
      if (!alasan) return toast.error("Alasan detail tidak boleh kosong!");
      if (!imageBase64) return toast.error("Harap lampirkan bukti foto (Surat dokter / bukti lainnya)!");
    }


    if (showFeishu() && !buktiFeishuBase64) {
      return toast.error("Harap upload screenshot bukti mengisi Form Pusat (Feishu) terlebih dahulu!");
    }


    setLoadingSubmit(true);
    toast.info("Memproses data absen...");

    const sendPayload = async (userLat: number, userLng: number) => {
        toast.info("⏳ Mengirim data absen, mohon tunggu...");
        
        const payload = {
          action: "processForm",
          data: {
            nama: nama,
            posisi: posisi,
            status: keterangan,
            jenisIzin: keterangan === "IZIN" ? jenisIzin : "",
            outlet: keterangan === "IZIN" ? "TIDAK MASUK" : outlet,
            alasan: keterangan === "IZIN" ? alasan : (isLate ? keteranganTelat : ""),
            lat: userLat,
            lng: userLng,
            image: imageBase64, // Always send image, either selfie or doctor note
            buktiFeishu: showFeishu() ? buktiFeishuBase64 : ""
          }
        };


        if (!GAS_URL) {
          // Simulate submit in AI Studio
          setTimeout(() => {
            setLoadingSubmit(false);
            toast.success(`✅ Berhasil Absen (Mode Preview). Payload GPS: ${userLat}, ${userLng}`);
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
          const textData = await res.text();
          console.log(`[kirimAbsen] Raw response dari server:`, textData);
          
          let result;
          try {
            result = JSON.parse(textData);
          } catch(e) {
            throw new Error(`Data tidak valid dari server (Web App perlu redeploy). Raw: ${textData.substring(0,50)}...`);
          }
          
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
            console.error(`[kirimAbsen] Gagal kirim API:`, result.message);
            toast.error(`Gagal: ${result.message}`);
          }
        } catch (err: any) {
          console.error(`[kirimAbsen] Exception Fetch/POST:`, err);
          toast.error(`Error: ${err.message}`);
        } finally {
          setLoadingSubmit(false);
        }
    };

    const requireLocation = settingsData?.requireLocation !== undefined ? settingsData.requireLocation : true;

    if (keterangan === 'IZIN' || !requireLocation) {
      sendPayload(0, 0); // Skip GPS requirement for IZIN or if location tracking is disabled
    } else {
      toast.info("Mendapatkan lokasi GPS...");
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const userLat = pos.coords.latitude;
          const userLng = pos.coords.longitude;


          // Verifikasi Radius Lokasi
          let outletLat = 0;
          let outletLng = 0;
          let maxRadius = 150;

          if (settingsData?.outlets && settingsData.outlets.length > 0) {
            const selectedOutlet = settingsData.outlets.find((o: any) => o.nama === outlet);
            if (selectedOutlet) {
              outletLat = selectedOutlet.lat;
              outletLng = selectedOutlet.lng;
              maxRadius = selectedOutlet.radius || 150;
            }
          } else {
            if (outlet === "YZ_ MDP PASIR JAHA BALARAJA") {
              outletLat = -6.205649180689262;
              outletLng = 106.45134398119775;
            } else if (outlet === "YZ_ MDP JAYANTI CIKANDE") {
              outletLat = -6.206571510648256;
              outletLng = 106.38621792361727;
            }
          }

          if (outletLat !== 0 && outletLng !== 0) {
            const distance = calculateDistance(userLat, userLng, outletLat, outletLng);

            if (distance > maxRadius) {
              setLoadingSubmit(false);
              return toast.error(`Lokasi Anda terlalu jauh dari outlet! (Jarak: ${Math.round(distance)} meter). Maksimal radius adalah ${maxRadius} meter.`);
            }
          }

          sendPayload(userLat, userLng);
        },
        (err) => {
          setLoadingSubmit(false);
          console.error("GPS Error:", err);
          let errMsg = `GPS Error! Pastikan izin lokasi aktif. (${err.message})`;
          if (err.code === 1) errMsg = "Akses Lokasi Ditolak! Tolong izinkan GPS di pengaturan browser Anda.";
          else if (err.code === 2) errMsg = "Lokasi Tidak Tersedia! Pastikan GPS perangkat Anda aktif.";
          else if (err.code === 3) errMsg = "Pencarian lokasi Timeout. Sinyal GPS mungkin lemah, coba di tempat yang lebih terbuka.";
          toast.error(errMsg);
        },
        { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
      );
    }
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
    if (ownerPasswordInput === "admin123") {
      setIsOwnerLoggedIn(true);
      setOwnerLoginError("");
    } else {
      setOwnerLoginError("Password salah!");
    }
  };


  return (
    <div className="min-h-screen bg-neutral-100 p-4 md:p-8 font-sans text-neutral-800 flex flex-col items-center">
      <Toaster position="top-center" richColors />
      
      {/* Reminder Absen Pulang */}
      {showPulangReminder && (
        <div className="w-full max-w-sm sm:max-w-md mb-6 bg-[#fff8eb] border border-[#f0c14b] p-4 rounded-xl shadow-sm animate-in fade-in slide-in-from-top-4 flex flex-col gap-3">
          <div className="flex gap-3">
            <Bell className="w-5 h-5 text-[#d49921] shrink-0 mt-0.5" />
            <div>
              <h3 className="font-bold text-[#b47a12]">Waktu Absen Pulang!</h3>
              <p className="text-sm text-[#a3690d] mt-1 leading-relaxed">Waktu sudah menunjukkan pukul 20:00 atau lebih. Jangan lupa untuk melakukan absen pulang jika pekerjaan Anda telah selesai.</p>
            </div>
          </div>
          <div className="flex gap-2 justify-end mt-1">
            <button 
              onClick={handleSnooze}
              className="px-3 py-1.5 text-sm font-semibold text-[#8a5b10] bg-[#faebb5] hover:bg-[#ebd591] rounded-md transition"
            >
              Lanjut Kerja
            </button>
            <button 
              onClick={handleAbsenSekarang}
              className="px-3 py-1.5 text-sm font-semibold text-white bg-[#cc0000] hover:bg-[#a30000] rounded-md shadow-sm transition"
            >
              Absen Sekarang
            </button>
          </div>
        </div>
      )}


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
                className="w-full p-2.5 bg-neutral-50 border border-neutral-300 rounded-md focus:ring-2 focus:ring-[#cc0000] outline-none transition disabled:opacity-60 disabled:bg-neutral-100"
              >
                <option value="" disabled>Pilih Posisi</option>
                <option value="Admin">Admin</option>
                <option value="Admin (Training)">Admin (Training)</option>
                <option value="Pickup">Pickup</option>
              </select>
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
                    {settingsData?.outlets && settingsData.outlets.length > 0 ? (
                      settingsData.outlets.map((o: any) => (
                        <option key={o.nama} value={o.nama}>{o.nama}</option>
                      ))
                    ) : (
                      <>
                        <option value="YZ_ MDP PASIR JAHA BALARAJA">J&T Pasir Jaha Balaraja</option>
                        <option value="YZ_ MDP JAYANTI CIKANDE">J&T Jayanti Cikande</option>
                      </>
                    )}
                  </select>
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
                WAJIB ISI FORM PUSAT & UPLOAD BUKTI
              </div>
              
              <div className="w-full h-[550px] border-b border-neutral-200 bg-neutral-50">
                <iframe 
                  src="https://jtexpress.sg.feishu.cn/share/base/form/shrlgF7kXWhZJOFC4wOQSOWbo6g" 
                  className="w-full h-full border-0"
                  title="Form Feishu"
                  allow="geolocation"
                />
              </div>
              
              <div className="p-4 w-full flex flex-col items-center gap-3 border-b border-neutral-200">
                <p className="text-sm text-neutral-600 text-center font-medium">
                  Silakan isi form Feishu di atas langsung pada frame ini. Setelah selesai, ambil screenshot bukti pengisian dan upload di bawah.
                </p>
              </div>


              <div className="p-5 w-full bg-neutral-50">
                <label className="block text-sm font-semibold text-neutral-700 mb-3 text-center">Upload Bukti Screenshot Absen Feishu</label>
                
                {buktiFeishuBase64 ? (
                  <div className="relative group rounded-md overflow-hidden bg-black max-w-[250px] mx-auto border border-neutral-300 shadow-sm">
                    <img src={buktiFeishuBase64} alt="Bukti Feishu" className="w-full h-auto object-contain max-h-[250px] mx-auto bg-white" />
                    <button 
                      onClick={() => { setBuktiFeishuBase64(""); if (feishuImageInputRef.current) feishuImageInputRef.current.value = ""; }}
                      className="absolute top-2 right-2 bg-red-600 text-white rounded-full p-1.5 shadow-lg flex items-center justify-center opacity-90 hover:opacity-100 transition"
                      title="Hapus Bukti"
                    >
                      <AlertCircle className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div 
                    className="cursor-pointer max-w-[250px] mx-auto flex flex-col items-center justify-center py-5 px-4 bg-white border-2 border-dashed border-neutral-300 rounded shadow-sm hover:bg-neutral-50 transition"
                    onClick={() => feishuImageInputRef.current?.click()}
                  >
                    <FileImage className="w-8 h-8 text-neutral-400 mb-2" />
                    <span className="text-sm font-medium text-neutral-600">Pilih Screenshot</span>
                  </div>
                )}
                
                <input 
                  ref={feishuImageInputRef}
                  type="file" 
                  accept="image/*" 
                  onChange={handleBuktiFeishu}
                  className="hidden" 
                />
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
        </div>
      </div>


      {/* Riwayat Pribadi */}
      {nama && activeTab === 'absen' && (
        <div id="riwayat-absen" className="w-full max-w-md mt-6 bg-white border border-neutral-200 rounded-xl shadow-sm overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="bg-neutral-50 px-4 py-3 border-b border-neutral-200 flex items-center justify-between">
            <div className="font-bold text-neutral-700 flex items-center gap-2 text-sm">
              <History className="w-4 h-4 text-[#cc0000]" />
              Riwayat Absensi Bulan Ini
            </div>
            <button onClick={() => fetchRiwayat(nama)} className="text-xs text-neutral-500 hover:text-neutral-800 underline">Refresh</button>
          </div>
          <div className="p-0 overflow-x-auto">
            {loadingRiwayat ? (
              <div className="text-center text-sm text-neutral-500 py-6">Memuat riwayat...</div>
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
              <table className="w-full text-xs text-left whitespace-nowrap">
                <thead className="text-neutral-500 uppercase bg-neutral-50/50">
                  <tr>
                    <th className="px-4 py-2.5 font-semibold">Tanggal</th>
                    <th className="px-4 py-2.5 font-semibold">Masuk</th>
                    <th className="px-4 py-2.5 font-semibold">Status</th>
                    <th className="px-4 py-2.5 font-semibold">Pulang</th>
                  </tr>
                </thead>
                <tbody>
                  {riwayat.map((r, i) => (
                    <tr key={i} className="border-t border-neutral-100 last:border-0 hover:bg-neutral-50">
                      <td className="px-4 py-3">{r.tanggal}</td>
                      <td className="px-4 py-3">{r.jamDatang}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded font-bold ${r.statusMasuk === 'TEPAT WAKTU' ? 'bg-green-100 text-green-700' : r.statusMasuk === 'TELAT' ? 'bg-red-100 text-red-700' : 'bg-neutral-100 text-neutral-700'}`}>
                          {r.statusMasuk}
                        </span>
                      </td>
                      <td className="px-4 py-3">{r.jamPulang || '-'}</td>
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
        <div className="w-full max-w-3xl bg-white rounded-xl shadow-lg border border-neutral-200 overflow-hidden animate-in fade-in">
          <div className="bg-[#cc0000] p-4 text-center relative">
            <h1 className="text-xl font-bold text-white tracking-wide flex justify-center items-center gap-2">
              <Users className="w-6 h-6" />
              Halaman OWNER
            </h1>
            {isOwnerLoggedIn && (
               <button
                  onClick={() => {
                    setIsOwnerLoggedIn(false);
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
                    onClick={() => {
                      setOwnerView('settings');
                    }}
                    className={`px-4 py-2 font-bold text-sm rounded-t-lg transition-colors ${ownerView === 'settings' ? 'text-[#cc0000] border-b-2 border-[#cc0000]' : 'text-neutral-500 hover:text-neutral-800'}`}
                  >
                    Settings
                  </button>
                </div>
              </div>


              {ownerView === 'harian' && (
                <>
                  <div className="flex flex-wrap items-center justify-between mb-4 gap-3">
                    <h2 className="font-bold text-neutral-700 text-lg">Ringkasan Absensi Hari Ini</h2>
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="flex items-center gap-2 bg-neutral-50 px-3 py-1.5 rounded-lg border border-neutral-200">
                         <label className="text-xs font-bold text-neutral-600">Target Kerja:</label>
                         <div className="flex items-center gap-1">
                           <input type="number" min="1" max="24" value={targetJamKerja} onChange={(e) => setTargetJamKerja(Number(e.target.value))} className="w-12 p-1 text-sm bg-white border border-neutral-300 rounded focus:ring-1 focus:ring-[#cc0000] outline-none text-center font-bold" />
                           <span className="text-xs font-bold text-neutral-500">Jam</span>
                         </div>
                      </div>
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
                <div className="text-center text-neutral-500 py-10 border border-neutral-200 rounded-lg">Memuat data hari ini...</div>
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
                                  <img src={row.fotoDatang} alt="Masuk" className="w-full h-full object-cover" />
                                </button>
                              ) : <div className="w-10 h-10 bg-neutral-100 border border-neutral-200 border-dashed rounded flex items-center justify-center text-xs text-neutral-400" title="Belum Masuk">-</div>}
                              
                              {row.fotoPulang ? (
                                <button type="button" onClick={() => setPreviewModal({ type: 'image', title: `Foto Pulang ${row.nama}`, url: row.fotoPulang })} className="block w-10 h-10 bg-neutral-200 rounded border border-neutral-300 overflow-hidden hover:opacity-80 transition" title="Foto Pulang">
                                  <img src={row.fotoPulang} alt="Pulang" className="w-full h-full object-cover" />
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
              </>
              )}


              {ownerView === 'bulanan' && (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                    <h2 className="font-bold text-neutral-700 text-lg">Laporan Absensi</h2>
                    <div className="flex flex-wrap items-center gap-2">
                       <select
                         value={laporanPosisiFilter}
                         onChange={(e) => setLaporanPosisiFilter(e.target.value as any)}
                         className="p-2 text-sm bg-neutral-50 border border-neutral-300 rounded-md focus:ring-2 focus:ring-[#cc0000] outline-none font-medium text-neutral-700 h-[38px]"
                       >
                         <option value="Semua">Semua Posisi</option>
                         <option value="Admin">Admin</option>
                         <option value="Admin (Training)">Admin (Training)</option>
                         <option value="Pickup">Pickup</option>
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
                  </div>
                  
                  {errorLaporan && (
                    <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg flex items-center justify-between">
                      <span className="text-sm font-medium">{errorLaporan}</span>
                      <button onClick={() => fetchLaporanBulanan(laporanBulan)} className="px-3 py-1.5 bg-red-100 hover:bg-red-200 text-red-700 text-sm font-bold rounded transition">
                        Coba Lagi
                      </button>
                    </div>
                  )}
                  
                  <div className="w-full">
                  {loadingLaporan ? (
                    <div className="text-center text-neutral-500 py-10 border border-neutral-200 rounded-lg">Memuat laporan bulanan...</div>
                  ) : laporanBulanan.length === 0 ? (
                    <div className="text-center text-neutral-500 py-10 border border-neutral-200 rounded-lg">Belum ada data bulan ini.</div>
                  ) : (
                    <>
                    {/* Desktop Table View */}
                    <div className="hidden md:block overflow-x-auto border border-neutral-200 rounded-lg">
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
                  )}
                  </div>
                </>
              )}


              {ownerView === 'settings' && (
                <div className="flex flex-col gap-4 w-full">
                  <h2 className="font-bold text-neutral-700 text-lg">Pengaturan Aplikasi</h2>
                  
                  {loadingSettings ? (
                    <div className="text-center text-neutral-500 py-10 border border-neutral-200 rounded-lg">Memuat pengaturan...</div>
                  ) : errorSettings ? (
                    <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg flex items-center justify-between">
                      <span className="text-sm font-medium">{errorSettings}</span>
                      <button onClick={fetchSettings} className="px-3 py-1.5 bg-red-100 hover:bg-red-200 text-red-700 text-sm font-bold rounded transition">
                        Coba Lagi
                      </button>
                    </div>
                  ) : settingsData ? (
                    <div className="flex flex-col xl:flex-row items-start gap-6 w-full">
                      <div className="bg-white border flex flex-col items-center border-neutral-200 rounded-xl p-6 shadow-sm w-full xl:max-w-xs gap-4 shrink-0">
                        {settingsData.favicon ? (
                          <>
                            <img src={settingsData.favicon} alt="Favicon URL" className="w-16 h-16 object-contain rounded-full shadow-sm bg-neutral-100" />
                            <p className="text-xs font-medium text-center text-neutral-600 break-all">{settingsData.favicon}</p>
                          </>
                        ) : (
                           <p className="text-sm text-neutral-500 text-center">Tidak ada favicon yang dikonfigurasi di Google Sheets 'Settings'.</p>
                        )}
                        
                        <div className="w-full h-px bg-neutral-100 my-2"></div>

                        <div className="w-full flex items-center justify-between">
                          <div>
                            <p className="font-bold text-neutral-800 text-sm">Wajibkan GPS Absensi</p>
                            <p className="text-xs text-neutral-500 mt-0.5">Harus absen di lokasi outlet</p>
                          </div>
                          <button 
                            onClick={toggleLocationTracking}
                            disabled={savingSettings}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                              (settingsData.requireLocation !== false) ? 'bg-[#cc0000]' : 'bg-neutral-300'
                            }`}
                          >
                            <span 
                              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                                (settingsData.requireLocation !== false) ? 'translate-x-6' : 'translate-x-1'
                              }`}
                            />
                          </button>
                        </div>

                        <button onClick={fetchSettings} className="w-full text-sm font-bold text-neutral-700 bg-neutral-100 hover:bg-neutral-200 px-4 py-2 mt-2 rounded-lg transition">
                          Muat Ulang Settings
                        </button>
                      </div>

                      {/* Outlet Location Map & Coordinates Editor */}
                      <div className="flex-1 w-full shrink-0">
                        <OutletMapManager 
                          outlets={settingsData.outlets || []}
                          onSaveOutlets={handleUpdateOutlets}
                          saving={savingSettings}
                        />
                      </div>
                    </div>
                  ) : (
                     <div className="text-center text-neutral-500 py-10 border border-neutral-200 rounded-lg">Tidak ada data pengaturan.</div>
                  )}
                </div>
              )}
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
                <img src={previewModal.url} alt={previewModal.title} className="max-w-full max-h-[75vh] object-contain block mx-auto" />
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
      {selectedPegawaiDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 duration-300">
            {/* Header Modal */}
            <div className="p-4 border-b border-neutral-100 flex items-center justify-between bg-neutral-50">
              <div>
                <h3 className="font-bold text-neutral-800 text-lg">{selectedPegawaiDetail.nama}</h3>
                <p className="text-xs text-neutral-500 font-medium">Bulan: {selectedPegawaiDetail.bulan}</p>
              </div>
              <button 
                onClick={() => setSelectedPegawaiDetail(null)}
                className="p-2 text-neutral-400 hover:text-neutral-700 hover:bg-neutral-200 rounded-full transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>


            {/* Body / List Absensi */}
            <div className="p-4 overflow-y-auto flex-1 bg-neutral-50">
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
          </div>
        </div>
      )}
    </div>
  );
}
