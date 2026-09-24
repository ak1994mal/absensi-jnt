# 📋 PROJECT PROGRESS — APLIKASI ABSENSI J&T

Dokumen ini mencatat status pengembangan, daftar fitur, rencana roadmap, serta log pembaruan (changelog) untuk **Aplikasi Absensi Internal J&T**.

---

## 📌 1. Informasi Versi Aplikasi

| Atribut | Keterangan |
|---|---|
| **Nama Aplikasi** | Aplikasi Absensi J&T (Internal Attendance System) |
| **Versi Saat Ini** | `v2.5.1` (Production Stable) |
| **Terakhir Diperbarui** | 24 September 2026 |
| **Status Build** | ✅ Passing (`tsc --noEmit`, Vite Production Build) |
| **Frontend Stack** | React 19, TypeScript, Tailwind CSS v4, Lucide React, Motion, Leaflet, Sonner |
| **Backend & Storage**| Google Apps Script (GAS) Web App + Google Sheets Database (`Data_Absensi`, `Settings`) + Google Drive API (Foto Selfie & Bukti) |
| **Environment Target**| Web App (Mobile & Desktop Browser Responsive) |

---

## ✅ 2. Fitur Selesai (Completed)

### A. Absensi & Presensi Pegawai
- [x] **Absen Masuk (DATANG):**
  - Pengambilan foto selfie langsung via kamera perangkat.
  - Verifikasi posisi pegawai dan outlet penempatan.
  - Pencatatan otomatis waktu masuk (jam & menit).
  - Deteksi keterlambatan otomatis berdasarkan jam masuk yang dikonfigurasi per posisi.
  - Input alasan keterlambatan jika masuk melebihi batas toleransi.
- [x] **Absen Pulang (PULANG):**
  - Pengambilan foto selfie saat pulang kerja.
  - Penghitungan otomatis total durasi kerja (`...j ...m`) dan jam lembur (jika jam kerja $\ge$ 13 jam).
  - Deteksi pulang lebih awal (*early leave*) beserta catatan alasan.
  - Update in-place pada baris transaksi DATANG di Google Sheets tanpa menduplikasi baris.
- [x] **Pengajuan Izin & Sakit (IZIN / SAKIT):**
  - Form izin dengan pilihan kategori (Izin keperluan pribadi, Sakit, dsb).
  - Upload bukti surat dokter / foto surat keterangan.
  - Bypassing validasi radius GPS untuk pengajuan izin dari luar outlet.

### B. Geolocation & Geofencing
- [x] **GPS Device Tracking:**
  - Pengambilan koordinat GPS aktual perangkat pegawai (`navigator.geolocation.getCurrentPosition`).
  - Fallback berjenjang: High accuracy (12s) $\rightarrow$ Low accuracy (15s cache) saat sinyal satelit lemah.
- [x] **Geofencing Radius Outlet:**
  - Penghitungan jarak Euclidean/Haversine antara koordinat pegawai dan outlet terpilih.
  - Validasi batas radius maksimal (default: 150 meter atau sesuai pengaturan outlet).
  - Penolakan submit absensi jika pegawai berada di luar radius yang ditentukan.
- [x] **Penyimpanan URL Peta:**
  - Konversi koordinat menjadi URL Google Maps (`https://maps.google.com/?q=LAT,LNG`).
  - Tersimpan permanen di Kolom J (Lokasi Datang) dan Kolom K (Lokasi Pulang).

### C. Google Apps Script & Google Sheets Backend
- [x] **Arsitektur Prepend Row (Data Terbaru di Atas):**
  - Implementasi `prependDataRow()` via `sheet.insertRowBefore(2)` sehingga data absensi terbaru selalu masuk ke **Row 2**.
  - Baris header tetap aman di Row 1.
- [x] **Penyimpanan Gambar ke Google Drive:**
  - Konversi Base64 image ke file binary di Google Drive folder terdedikasi.
  - Penataan izin file dan pembuatan direct image preview link.
- [x] **Normalisasi Format Tanggal & Waktu:**
  - Robust parser `parseSheetTime()` menangani tipe data `Date` object, pecahan desimal hari (*Google Sheets time fraction*), dan format string `HH:MM`.
  - Normalisasi tanggal `DD/MM/YYYY` untuk filter dan agregasi yang konsisten.

### D. Riwayat & Rekapitulasi
- [x] **Tabel Riwayat Bulanan:**
  - Filter riwayat absensi berdasarkan nama pegawai dan bulan berjalan.
  - Indikator status kehadiran: Tepat Waktu, Telat, Pulang Normal, Pulang Cepat, Izin.
  - Perhitungan akumulasi: Total jam kerja, total lembur, total hadir, dan total telat.
- [x] **Modal Preview Interaktif:**
  - Preview peta Google Maps interaktif (iframe embed & tombol tautan langsung).
  - Preview foto selfie datang dan pulang resolusi tinggi.

### E. Dashboard Owner & Pengaturan
- [x] **Owner Authentication:** Login terproteksi password (`jntowner`) dengan persistensi sesi di `localStorage`.
- [x] **Manajemen Outlet & Koordinat:**
  - Penambahan, pengubahan, dan penghapusan master outlet.
  - Peta interaktif Leaflet untuk memilih titik koordinat latitude/longitude outlet dan mengatur radius toleransi geofencing.
- [x] **Manajemen Posisi & Jam Kerja:**
  - Konfigurasi jam masuk dan jam pulang per posisi pegawai (Admin, Kurir, Pickup, dsb).
  - Pengaturan fleksibel posisi aktif/non-aktif.
- [x] **Sistem Pengaturan Global:**
  - Toggle wajibkan lokasi GPS (`requireLocation`).
  - Toggle aktifkan toleransi jam kerja (`enableWorkHours`).
  - Sinkronisasi instan ke sheet `Settings` di backend GAS.

### F. Integrasi Khusus & Developer Tools
- [x] **Integrasi Form Feishu:** Tampilan iframe otomatis form Feishu khusus posisi Admin pada outlet tertentu (Pasir Jaha & Jayanti).
- [x] **Modal Konfigurasi GAS:**
  - Input & validasi URL endpoint Web App Google Apps Script.
  - Tombol **"Salin Kode.gs Lengkap"** dan **"Unduh .gs"** untuk kemudahan redeploy backend.

---

## 🔄 3. Sedang Dikerjakan (In Progress)



---

## 📅 4. Rencana Fitur Selanjutnya (To Do)

### Jangka Pendek
- [ ] **Ekspor Laporan ke Excel (.xlsx) / PDF:**
  - Fitur unduh rekap absensi bulanan per outlet atau per pegawai ke format spreadsheet siap cetak untuk keperluan payroll.
- [ ] **Filter Multi-Outlet di Dashboard Owner:**
  - Kemampuan melihat performa kehadiran pegawai lintas outlet secara agregat dalam satu layar ringkasan.

### Jangka Menengah
- [ ] **Notifikasi Telegram / WhatsApp Bot:**
  - Kirim notifikasi ringkas otomatis ke whatsapp owner setiap kali ada pegawai yang terlambat atau mengajukan izin.


---

## 📝 5. Log Pembaruan (Changelog)

### [v2.5.2] — 24 September 2026
- **FIX (Lokasi Pulang Kosong, Auto-Fill Pulang pada Form, & Error Simpan Pengaturan 404):**
  - **Bug 1 (Lokasi Pulang Kosong):** Menambahkan `lokasi` dan `lokasiPulang` pada payload transaksi PULANG di `src/App.tsx`. Mengimplementasikan `lastKnownLocationRef` dan passive background GPS watcher agar koordinat lokasi selalu tersedia (tidak kosong). Pada `Kode.gs`, nilai kolom K (Lokasi Pulang) diproteksi dengan fallback `lokasiUrl || "-"` sehingga tidak akan pernah kosong atau tertimpa string kosong.
  - **Bug 2 (Auto-Fill Pulang saat Pilih Nama Pegawai):** Menambahkan logika deteksi otomatis saat nama pegawai dipilih (`nama` & `riwayat`): jika terdeteksi record DATANG aktif hari ini (`openAttendanceToday`), formulir otomatis mengatur Aktivitas ke `PULANG`, serta auto-fill `posisi` dan `outlet` dari record datang aktif. Ditambahkan helper `normalizeOutletName` untuk toleransi spasi/casing (`YZ_MDP Jayanti Cikande` vs `YZ_ MDP JAYANTI CIKANDE`).
  - **Bug 3 (Error 404 saat Simpan Pengaturan Owner):** Memperbaiki URL default `DEFAULT_GAS_URL` di `src/api.ts` yang sebelumnya mengarah ke deployment 404, mengembalikannya ke URL deployment aktif repository, serta mem-blacklist URL 404 di `localStorage`. Menambahkan fungsi `sendSaveSettings` dengan fallback otomatis POST & GET, dan menambahkan handler `saveSettings` di `doGet` `Kode.gs`.
  - Sinkronisasi `Kode.gs` ke `src/kodeGsSource.ts` dengan versi `2026-09-24-v2.5.2`.

### [v2.5.1] — 24 September 2026
- **FIX (Diagnosis & Penyelesaian Live Bug TypeError: jamDatang.split):**
  - Mengaudit dan membuktikan bahwa URL `DEFAULT_GAS_URL` sebelumnya mengarah ke deployment lama Google Apps Script yang belum ter-update dan mengembalikan `TypeError: jamDatang.split is not a function`.
  - Mengarahkan `DEFAULT_GAS_URL` ke URL Web App deployment aktif terverifikasi (`AKfycbwVrPuN...`).
  - Menghapus seluruh pemanggilan `.split(":")` pada waktu di `src/App.tsx` (`getSisaWaktuKerja`, `checkIfLate`, `checkIfEarlyLeave`) dan menggantinya dengan `formatSheetTime()` serta regex.
  - Menambahkan endpoint diagnosis `getDeploymentInfo()` dan konstanta `BACKEND_VERSION = "2026-09-24-v2.5.1"` di `Kode.gs`.
  - Menyertakan `backendVersion` pada setiap respons sukses dan error dari `processForm()` di Google Apps Script.
  - Memperbarui `getRiwayat`, `getRingkasanHarian`, dan `getRiwayatBulan` dengan `getDisplayValues()` agar nilai waktu tidak terkonversi menjadi Date object / ISO datetime timezone offset.
  - Menambahkan deteksi diagnosis versi backend otomatis pada dialog Tes Koneksi di `GasUrlModal`.
  - Menyelaraskan seluruh file: `Kode.gs`, `src/kodeGsSource.ts`, dan `kode_dump.txt`.

### [v2.5.0] — 24 September 2026
- **FIX (Bug #4 - Salah Anggap Pegawai Sudah Absen Pulang):**
  - Mengganti penentuan status PULANG yang sebelumnya hanya memakai `riwayat.find(record tanggal hari ini)` pertama dengan helper terpusat `findOpenAttendanceToday()` dan `findClosedAttendanceToday()`.
  - Mengimplementasikan 3 tahapan validasi PULANG:
    1. Cari record terbuka hari ini (`isToday && hasValidTime(jamDatang) && !hasValidTime(jamPulang)`). Jika ADA, proses absensi PULANG langsung diizinkan.
    2. Jika tidak ada record terbuka, cek apakah ada record yang sudah checkout (`findClosedAttendanceToday()`). Jika ADA, baru tampilkan "Anda sudah melakukan absen PULANG hari ini!".
    3. Jika tidak ada data kehadiran sama sekali hari ini, tampilkan "Anda belum absen DATANG hari ini!".
  - Normalisasi robust waktu `formatSheetTime()` sebelum menentukan status `jamPulang` (`jamPulang === "-"` dianggap belum pulang, `jamPulang !== "-"` dianggap sudah pulang).
  - Sinkronisasi payload `jamDatang` pada transaksi PULANG agar selalu mengambil waktu datang dari record terbuka yang valid.
  - Memperbarui pencarian baris PULANG di `Kode.gs` agar memprioritaskan baris absensi terbuka hari ini (`rowJamPulang === "-"`).

### [v2.4.0] — 24 September 2026
- **FIX (Bug #3 - Lokasi Datang Kosong):**
  - Memperbaiki validasi koordinat GPS di `src/App.tsx` menggunakan `Number.isFinite()`, mencegah pengiriman nilai `NaN` atau `undefined`.
  - Menambahkan helper `buildLocationUrl(lat, lng)` di `Kode.gs` untuk memformat koordinat menjadi `https://maps.google.com/?q=lat,lng`.
  - Memastikan Kolom J (Lokasi Datang) selalu terisi pada absensi DATANG dan tidak tertimpa saat absensi PULANG (Kolom K).
  - Memberikan pesan error yang jelas jika lokasi GPS belum tersedia saat `requireLocation = TRUE`.
  - Menyelaraskan distribusi source code di `src/kodeGsSource.ts` dan `kode_dump.txt`.

### [v2.3.0] — 23 September 2026
- **FIX (Bug #1 - TypeError: jamDatang.split is not a function):**
  - Memperbaiki error saat absen pulang akibat sel spreadsheet mengembalikan tipe data `Date` object atau nilai angka pecahan hari.
  - Implementasi parser waktu universal `parseSheetTime()` yang menangani objek `Date`, epoch timestamp, desimal fractional day, dan string.
  - Normalisasi pengiriman data jam datang dari frontend ke backend.
- **FIX (Bug #2 - Urutan Baris Absensi Terbaru):**
  - Mengganti seluruh operasi `sheet.appendRow()` untuk transaksi baru dengan `prependDataRow()` (`sheet.insertRowBefore(2)`).
  - Memastikan baris absensi terbaru selalu berada tepat di **Row 2** di bawah header tabel.
  - Menghapus pembalikan array `riwayat.reverse()` di backend karena data sudah otomatis berurutan secara kronologis menurun.

### [v2.2.0] — 20 September 2026
- **FEATURE:** Integrasi peta Leaflet interaktif pada manajemen outlet di menu Owner.
- **FEATURE:** Pengaturan radius geofencing kustom per outlet (meter).
- **IMPROVE:** Dukungan kamera selfie mobile dengan resolusi optimal dan kompresi JPEG untuk penghematan kuota upload.

### [v2.1.0] — 15 September 2026
- **FEATURE:** Penambahan form izin dan sakit beserta fitur upload foto surat dokter ke Google Drive.
- **FEATURE:** Integrasi iframe form Feishu khusus untuk posisi Admin di outlet Pasir Jaha dan Jayanti Cikande.
- **IMPROVE:** Peningkatan keamanan halaman Owner dengan dialog login sandi.

### [v2.0.0] — 01 September 2026
- **INIT:** Rilis arsitektur modern berbasis React 19, TypeScript, dan Tailwind CSS v4 terhubung ke Google Apps Script dan Google Sheets.
