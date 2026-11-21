# 📋 PROJECT PROGRESS — APLIKASI ABSENSI J&T

Dokumen ini mencatat status pengembangan, daftar fitur, rencana roadmap, serta log pembaruan (changelog) untuk **Aplikasi Absensi Internal J&T**.

---

## 📌 1. Informasi Versi Aplikasi

| Atribut | Keterangan |
|---|---|
| **Nama Aplikasi** | Aplikasi Absensi J&T (Internal Attendance System) |
| **Versi Saat Ini** | `v2.9.3` (Phase B Attendance Logic & Data Integrity Audit — Siap Deploy GAS & Vercel) |
| **Terakhir Diperbarui** | 21 November 2026 |
| **Status Build** | ✅ Passing (`tsc --noEmit`, Vite Production Build, Lint, `node scripts/verify-kode-gs.mjs` 48/48) |
| **Frontend Stack** | React 19, TypeScript, Tailwind CSS v4, Lucide React, Motion, Leaflet, Sonner |
| **Backend & Storage**| Google Apps Script (GAS) Web App + Google Sheets Database (`Data_Absensi`, `DataPegawai`, `DataOutlet`, `DataPosisi`, `DataPenempatan`, `JadwalHarian`, `DataKetidakhadiran`, `SnapshotAbsensi`, `AbsenIzin`, `Settings`) + Google Drive API |
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
- [x] **Owner Authentication:** Login tervalidasi server via GAS (`ownerLogin`) yang menerbitkan token sesi (`CacheService` + `PropertiesService`) untuk seluruh aksi tulis Owner (`savePenempatan`, `saveJadwalHarian`, `saveKetidakhadiran`, `closeDailyAttendance`, `saveSettings`).
- [x] **Manajemen Outlet & Koordinat:**
  - Penambahan, pengubahan, dan penghapusan master outlet.
  - Peta interaktif Leaflet untuk memilih titik koordinat latitude/longitude outlet dan mengatur radius toleransi geofencing.
- [x] **Manajemen Posisi & Jam Kerja:**
  - Konfigurasi jam masuk dan jam pulang per posisi pegawai (Admin, Kurir, Pickup, Magang, dsb).
  - Pengaturan fleksibel posisi aktif/non-aktif.
- [x] **Sistem Pengaturan Global:**
  - Toggle wajibkan lokasi GPS (`requireLocation`).
  - Toggle aktifkan toleransi jam kerja (`enableWorkHours`) & toleransi keterlambatan (`toleransi_telat`).
  - Sinkronisasi instan ke sheet `Settings` di backend GAS dengan validasi `ownerToken`.

### F. Integrasi Khusus & Developer Tools
- [x] **Integrasi Form Feishu:** Tampilan iframe otomatis form Feishu khusus posisi Admin pada outlet tertentu (Pasir Jaha & Jayanti).
- [x] **Modal Konfigurasi GAS:**
  - Input & validasi URL endpoint Web App Google Apps Script.
  - Tombol **"Salin Kode.gs Lengkap"** dan **"Unduh .gs"** untuk kemudahan redeploy backend.
- [x] **Timeout & Retry Jaringan:** `fetchWithTimeout` (20 detik GET/POST standar, 35 detik upload foto absen/izin) dengan pesan error `AbortError` ramah pengguna.

### G. Manajemen Kehadiran Seluruh Pegawai (`DataKetidakhadiran`)
- [x] **Status Kehadiran Lengkap Harian:** Memantau seluruh pegawai `AKTIF` (`HADIR`, `BELUM ABSEN`, `LIBUR`, `IZIN`, `SAKIT`, `ALPA`) di tab `Ringkasan Harian` & `Kehadiran Pegawai`.
- [x] **Filter Lintas Dimensi:** Filter berdasarkan Tanggal, Outlet, Posisi, Status Kehadiran, dan pencarian Nama Pegawai.
- [x] **Tutup Hari / Tandai ALPA Otomatis:** Aksi Owner (`closeDailyAttendance`) menandai pegawai `BELUM ABSEN` menjadi `ALPA` pada `DataKetidakhadiran` tanpa membuat baris `DATANG` palsu di `Data_Absensi`.
- [x] **Sinkronisasi Form Pegawai Anti-Duplikat:** Pengajuan `IZIN`/`SAKIT` pegawai tersinkron ke `DataKetidakhadiran` (master), `AbsenIzin`, dan `Data_Absensi` dengan kunci `[REF:...]` agar tidak dobel saat disubmit ulang pada hari yang sama.

### H. Manajemen Penempatan Pegawai (`DataPenempatan`)
- [x] **Penempatan Permanen Berbasis Riwayat:** Owner dapat mengatur Outlet, Posisi, Jam Masuk, Jam Pulang, dan Hari Kerja per individu (`Manajemen Pegawai`). Perubahan baru otomatis menutup baris lama (`Tanggal Akhir = H-1`) tanpa menghapus histori.
- [x] **Perlindungan Data Sensitif:** `getActiveEmployeesSafe()` tidak pernah mengekspos `password`, `SidikWajah`, maupun `FaceDescriptor`.

### I. Jadwal Dinamis, Admin Backup & Rotasi Outlet (`JadwalHarian` + `SnapshotAbsensi`)
- [x] **Override Harian Tanpa Mengubah Penempatan Permanen:** Sheet `JadwalHarian` (`NORMAL`, `BACKUP`, `ROTASI`, `PENGGANTI`; status `DIJADWALKAN`, `LIBUR`, `DIBATALKAN`) memungkinkan Pickup/Magang ditugaskan sebagai **Admin Backup** sementara tanpa mengubah posisi permanen di `DataPenempatan`.
- [x] **Deteksi Bentrok & Kesiapan Outlet:** Penolakan otomatis jadwal ganda bentrok jam pada tanggal yang sama, konfirmasi khusus saat `LIBUR` bertabrakan dengan `DATANG`/`IZIN`/`SAKIT`, serta alert kesiapan Admin per outlet (`NO_ADMIN`, `ADMIN_ABSENT_NO_BACKUP`, `SCHEDULE_IZIN_CONFLICT`).
- [x] **Snapshot Penugasan Saat `DATANG` (`SnapshotAbsensi`):** Penugasan efektif saat `DATANG` dibekukan untuk validasi `PULANG` sehingga perubahan jadwal setelah `DATANG` tidak mematahkan proses absen `PULANG`.

### J. Koreksi Absensi Manual & Audit Trail (`Data_Absensi` Kolom P–R)
- [x] **Tab Owner `Koreksi Absensi`:** Melihat daftar transaksi `Data_Absensi` per tanggal (`Asia/Jakarta`) dengan filter outlet, pencarian nama, dan toggle baris `DIBATALKAN`.
- [x] **Edit Jam & Hitung Ulang Otomatis:** Koreksi jam datang, jam pulang, status, dan keterangan dengan penghitungan ulang otomatis durasi kerja, `TEPAT WAKTU`/`TELAT`, serta `NORMAL`/`PULANG CEPAT`/`LEMBUR` terhadap target `SnapshotAbsensi` / `DataPosisi`.
- [x] **Tambah Absensi Manual:** Input transaksi manual untuk pegawai yang lupa absen total (`prependDataRow()` ke Row 2, validasi anti-duplikat & larangan tanggal masa depan, `OriginalSnapshot = "MANUAL_ENTRY"`).
- [x] **Pembatalan Aman & Jejak Audit (`EditedBy`, `EditedAt`, `OriginalSnapshot`):** Hapus menandai baris sebagai `DIBATALKAN` tanpa menggeser indeks baris sheet, dikecualikan dari `Ringkasan Harian`/`Laporan Bulanan`/`Riwayat`, dan seluruh perubahan tercatat di kolom audit `P–R`.

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

### [v2.9.3] — 21 November 2026
- **AUDIT & HARDENING — Phase B: Attendance Logic & Data Integrity (`Kode.gs`, `src/kodeGsSource.ts`, `src/types/attendance.ts`, `src/api.ts`, `src/App.tsx`, `KehadiranPegawaiTab.tsx`, `JadwalRotasiTab.tsx`):**
  - **B1 — Split-Shift & Effective Assignment (`getEffectiveWorkAssignment`):** Memperbaiki resolusi multi-jadwal aktif pada tanggal yang sama dengan pencocokan outlet + jam target/konteks tanpa silent fallback pada jadwal ambigu; menyertakan `BELUM_DIJADWALKAN` jika pegawai aktif belum memiliki `DataPenempatan` maupun `JadwalHarian` aktif; mendukung mode `allowSplitShift` di `saveJadwalHarian` / `JadwalRotasiTab.tsx`.
  - **B2 — Integritas `DATANG`/`PULANG` & Shift Lintas Tengah Malam (`processForm`):** Validasi pegawai aktif ketat, mencegah `DATANG` saat masih ada shift terbuka di outlet mana pun, mendukung split-shift lewat `completedScheduleIds`, mendukung `PULANG` untuk shift semalam (tanggal kemarin belum pulang), menyinkronkan target jam snapshot ke `Data_Absensi`, dan memblokir `IZIN`/`SAKIT` jika sudah absen `DATANG` hari tersebut.
  - **B3 — Anti-Duplikasi & Soft-Cancel `IZIN`/`SAKIT` (`DataKetidakhadiran` + `Data_Absensi`):** Deduplikasi `IZIN`/`SAKIT` in-place agar tidak menggandakan baris di `DataKetidakhadiran`, `AbsenIzin`, maupun `Data_Absensi`; `cancelKetidakhadiran` menandai `DIBATALKAN` pada `DataKetidakhadiran` sekaligus menyinkronkan pembatalan baris `IZIN` di `Data_Absensi` dengan audit kolom `P–R` tanpa menghapus histori `DATANG`/`PULANG`.
  - **B4 & B5 — `BELUM DIJADWALKAN` & Tutup Hari Aman (`closeDailyAttendance`):** Pegawai aktif tanpa `DataPenempatan` maupun `JadwalHarian` aktif (atau sebelum `tanggalAktif`) tampil sebagai `BELUM DIJADWALKAN` dan dikecualikan dari `ALPA` saat Tutup Hari; menambahkan `dryRun` preview, penolakan tanggal masa depan, deteksi `alreadyClosed`, serta ringkasan `partial`/`skipped` pada UI.
  - **B6 — Konsistensi Agregasi Harian & Bulanan:** `getRingkasanHarian` membaca seluruh record `DataKetidakhadiran` termasuk `SAKIT` dengan normalisasi kunci nama; `getLaporanBulanan` menggabungkan `Data_Absensi` valid dan `DataKetidakhadiran` aktif (`IZIN`, `SAKIT`, `ALPA`, `LIBUR`) tanpa double counting serta tetap menghitung histori pegawai yang kini `NONAKTIF`.
  - **Verifikasi Otomatis (`scripts/verify-kode-gs.mjs`):** 48/48 skenario lolos (16 regresi lama + 18 Phase A + 14 Phase B `PB-1`..`PB-14`) dan sinkronisasi 100% byte-per-byte `Kode.gs` === `src/kodeGsSource.ts`.

### [v2.9.2] — 21 November 2026
- **SECURITY — Phase A: Security & Employee Identity Hardening (`Kode.gs`, `src/kodeGsSource.ts`, `src/api.ts`, `src/App.tsx`, Tab Owner):**
  - **Strict Active Employee Filter (`getActiveEmployeesSafe()`):** Hanya status eksplisit `AKTIF` (trimmed case-insensitive) yang lolos; status kosong, `NONAKTIF`, `NON-AKTIF`, `INACTIVE`, `RESIGN`, atau lainnya dikecualikan tanpa mengubah sheet `DataPegawai`.
  - **Minimum-Data Serializers (`serializeEmployeePublic`, `serializeEmployeeForOwner`):** Endpoint publik (`getPegawai`, `getPegawaiDetail` publik) hanya menerima field minimal (`idPegawai`, `nama`, `outlet`, `posisi`, `status`, `effectiveAssignment`) tanpa `email`, `noTelepon`, `tanggalAktif`, `tanggalNonAktif`, `placementHistory`, atau `absenceToday`. Field sensitif (`password`, `SidikWajah`, `FaceDescriptor`) tetap dihilangkan di semua endpoint.
  - **Penghapusan Password Hardcoded `"jntowner"`:** Dihapus dari `getConfiguredOwnerPassword()` di `Kode.gs` dan fallback Preview di `App.tsx`; jika password Owner belum terkonfigurasi di `Settings`/`ScriptProperties`, login ditolak aman (`notConfigured: true`).
  - **Hardening Sesi & Endpoint Owner via `doPost` + `ownerToken`:** `doGet` menolak `saveSettings`, seluruh endpoint Owner (`getDataPenempatan`, `getRiwayatPenempatan`, `getJadwalHarian`, `getRiwayatRotasi`, `getKehadiranHarian`, `getKetidakhadiran`, `getAbsensiByDate`, `getRingkasanHarian`, `getLaporanBulanan`), dan setiap query parameter `ownerToken`/`token`. `checkOwnerToken` fail-closed pada cache/properti rusak, dan `ownerLogout` memvalidasi pencabutan token di `CacheService` maupun `PropertiesService`.
  - **Frontend Session Hardening:** Token sesi Owner dan state `isOwnerLoggedIn` hanya disimpan di memory/`sessionStorage` (membersihkan `localStorage`), fallback GET `saveSettings` dihapus, `verifyOwnerSessionApi` fail-closed saat jaringan gagal, dan seluruh tab Owner menangani `authRequired`.
  - **Verifikasi Otomatis (`scripts/verify-kode-gs.mjs`):** 16 skenario regresi lama + 18 skenario Phase A (`PA-1`..`PA-18`) lolos seluruhnya.

### [v2.9.1] — 18 November 2026
- **FEATURE — Koreksi Absensi Manual & Audit Trail (`KoreksiAbsensiTab.tsx` & `Kode.gs`):**
  - Menambahkan kolom audit pada `Data_Absensi` tanpa mengubah kolom `A–O`: Kolom P (`EditedBy`), Kolom Q (`EditedAt` ISO Asia/Jakarta), dan Kolom R (`OriginalSnapshot` JSON / `"MANUAL_ENTRY"`), dikelola otomatis oleh `ensureAuditColumns()`.
  - Menambahkan 4 endpoint baru terproteksi `ownerToken`: `getAbsensiByDate` (GET read-only), `updateAbsensi` (POST edit & recalculate via `recalculateAttendanceStatus()`), `deleteAbsensi` (POST tandai `DIBATALKAN` tanpa menggeser `rowIndex`), dan `addManualAbsensi` (POST sisip Row 2 via `prependDataRow()`).
  - Menambahkan helper backend `ensureAuditColumns()`, `recalculateAttendanceStatus()`, dan `logAuditTrail()`.
  - Seluruh pembaca `Data_Absensi` (`getRingkasanHarian`, `computeKehadiranHarianInternal`, `getLaporanBulanan`, `getRiwayat`, `getRiwayatBulan`, `checkHasDatangOnDate`, `processForm`) mengecualikan baris `DIBATALKAN`.
  - Menambahkan sub-tab Owner ke-8 **"Koreksi Absensi"** lengkap dengan modal Edit (preview Data Lama vs Data Baru), modal Tambah Manual (peringatan duplikat absen), modal konfirmasi Hapus, dan modal Audit Trail.
  - Sinkronisasi 100% `Kode.gs` ke `src/kodeGsSource.ts` dan penambahan skenario uji lengkap di `scripts/verify-kode-gs.mjs`.

### [v2.9.0] — 16 November 2026
- **FEATURE — Manajemen Kehadiran (`DataKetidakhadiran` & Tab `Kehadiran Pegawai` + Ekspansi `Ringkasan Harian`):**
  - Menambahkan sheet `DataKetidakhadiran` untuk status `LIBUR`, `IZIN`, `SAKIT`, dan `ALPA`.
  - Menampilkan seluruh pegawai aktif beserta ringkasan (`Hadir`, `Belum Absen`, `Libur`, `Izin/Sakit`, `ALPA`, `Telat`) lintas outlet, posisi, dan status.
  - Menambahkan tombol Owner **Tandai ALPA (Tutup Hari)** (`closeDailyAttendance`) yang menandai pegawai `BELUM ABSEN` menjadi `ALPA` tanpa menyisipkan baris `DATANG` palsu ke `Data_Absensi`.
  - Sinkronisasi form `IZIN`/`SAKIT` pegawai ke `DataKetidakhadiran`, `AbsenIzin`, dan `Data_Absensi` dengan deduplikasi harian (`[REF:...]`).
  - Membatalkan catatan ketidakhadiran hanya menghapus/mengubah baris di `DataKetidakhadiran` tanpa merusak histori `Data_Absensi`.
- **FEATURE — Manajemen Penempatan Pegawai (`DataPenempatan` & Tab `Manajemen Pegawai`):**
  - Owner dapat mengatur outlet kerja, posisi permanen, jam masuk/pulang override individu, dan hari kerja (default Senin–Sabtu) per pegawai.
  - Perubahan penempatan baru otomatis menutup baris penempatan lama pada `H-1` untuk menjaga keutuhan riwayat historis.
- **FEATURE — Addendum Jadwal Dinamis, Admin Backup & Rotasi Outlet (`JadwalHarian`, `SnapshotAbsensi`, & Tab `Jadwal & Rotasi`):**
  - Menambahkan sheet `JadwalHarian` (dengan dukungan `NORMAL`, `BACKUP`, `ROTASI`, `PENGGANTI`, serta `DIJADWALKAN`, `LIBUR`, `DIBATALKAN`) dan `SnapshotAbsensi` tanpa mengubah kolom `Data_Absensi` (A–O) maupun `DataPegawai` (A–J).
  - Pegawai Pickup/Magang dapat ditugaskan sebagai **Admin Backup** atau dirotasi ke outlet lain pada tanggal tertentu tanpa mengubah posisi permanennya di `DataPenempatan`.
  - Deteksi otomatis bentrok jadwal pada tanggal & jam tumpang tindih, konflik dengan `IZIN`/`SAKIT`, serta peringatan kesiapan Admin outlet (`NO_ADMIN`, `ADMIN_ABSENT_NO_BACKUP`, `BACKUP_READY`, `SCHEDULE_IZIN_CONFLICT`).
  - `SnapshotAbsensi` mengunci assignment efektif saat `DATANG` agar validasi `PULANG` tetap konsisten meski jadwal berubah setelah `DATANG`.
- **SECURITY & RELIABILITY:**
  - Autentikasi Owner melalui endpoint GAS (`ownerLogin`, `verifyOwnerSession`, `ownerLogout`) dengan token sesi berbatas waktu yang wajib pada seluruh aksi tulis Owner (termasuk `saveSettings`).
  - `getActiveEmployeesSafe()` memastikan kolom sensitif `password`, `SidikWajah`, dan `FaceDescriptor` dari `DataPegawai` tidak pernah dikirim ke client.
  - Seluruh request jaringan menggunakan `fetchWithTimeout` (20 detik standar, 35 detik untuk upload foto) dengan penanganan `AbortError` yang jelas.
  - **Catatan Deploy:** Memerlukan *New Deployment* di Google Apps Script dan build ulang Vercel sebelum perubahan v2.9.0 aktif di produksi.

### [v2.8.0] — 01 Oktober 2026
- **FIX (Bug #1 — Ringkasan Absensi Hari Ini Sisi Owner):**
  - Mengaudit perbedaan Preview vs Live: Preview sebelumnya membaca `VITE_GAS_URL` lama/rusak yang mengarah ke login Google, sehingga `fetchRingkasanHarian` gagal dan menelan error (`setErrorRingkasan("")`) lalu menampilkan "Belum ada absensi hari ini (01/10/2026)".
  - Memperbaiki `BOOTSTRAP_GAS_URL` di `src/api.ts` dengan menyaring URL usang dan memastikan mengarah ke URL produksi aktif terverifikasi (`AKfycbwiyyUb...`).
  - Menghapus fallback dummy `DEFAULT_OFFLINE_RINGKASAN` dan fallback riwayat dummy.
  - Jika request API gagal, menampilkan error transparan "Data absensi gagal dimuat." lengkap dengan tombol "Coba Lagi", tidak lagi memalsukannya sebagai "Belum ada absensi hari ini".
  - Mengimplementasikan helper terpusat `getBusinessDateJakarta()`, `getJakartaMinutes()`, `getJakartaTimeStr()`, dan normalisasi format dua arah (`normalizeDateStr`) untuk `YYYY-MM-DD` dan `DD/MM/YYYY`.
- **FIX (Bug #2 — Jam Masuk & Pulang Aktif):**
  - Enforcement utama di Backend (`Kode.gs`): Jika aturan jam kerja posisi aktif, transaksi `PULANG` sebelum jadwal jam pulang posisi (dibaca dari `DataPosisi`) **DITOLAK** dengan pesan error informatif: *"Belum waktunya absen PULANG. Jam pulang Anda adalah HH:MM."*
  - Frontend UX: Memeriksa waktu Asia/Jakarta sekarang (`getJakartaMinutes()`). Jika belum mencapai jadwal jam pulang, formulir menampilkan banner peringatan informatif, tombol KIRIM ABSEN dinonaktifkan dengan label *"Belum Waktunya Pulang (HH:MM)"*, dan `kirimAbsen` menolak pengiriman via toast error.
- **FIX (Bug #3 — Toleransi Keterlambatan):**
  - Mengoreksi perhitungan keterlambatan di `Kode.gs` dan `src/App.tsx`:
    `batasToleransiMenit = jamMasukMenit + toleransiMenit`.
  - Penetapan batas inclusive yang konsisten: Kehadiran sampai dengan batas toleransi (`jamMasuk + toleransi`, misalnya Masuk 08:00 + toleransi 60m = 09:00) dinyatakan **TEPAT WAKTU / NORMAL** (08:20 = NORMAL, 08:59 = NORMAL, 09:00 = NORMAL).
  - Kehadiran setelah batas toleransi (> 09:00, misalnya 09:01) dicatat berstatus **TELAT** dan pegawai diwajibkan menyertakan alasan keterlambatan.
  - Sinkronisasi UI Owner Settings untuk pengaturan nilai `toleransi_telat` yang tersimpan langsung ke Google Sheets `Settings!A7:B7`.

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
