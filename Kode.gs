const FOLDER_INTI_ID = "14Spw44yA0pGTajzildh0egJ-KuqFF7Gq";
const SPREADSHEET_ID = "1f9WVUQSVShJyqRnNgR3MlynCk3znbDQ8qoAWMLb1fWA";
const FOLDER_FOTO_ID = "1mhDtsYrdtdv2nl5dwjax8URSAGKYzatY";

// Set to true to allow CORS from all origins (important for requests from Vercel)
const HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

/**
 * Handle HTTP OPTIONS request for CORS preflight
 */
function doOptions(e) {
  return ContentService.createTextOutput("")
    .setMimeType(ContentService.MimeType.TEXT);
}

/**
 * Handle HTTP GET requests
 */
function doGet(e) {
  try {
    const action = e.parameter.action;
    let result = {};

    if (action === 'getPegawai') {
      result = getPegawai();
    } else if (action === 'getRiwayat') {
      result = getRiwayat(e.parameter.nama);
    } else if (action === 'getRingkasanHarian') {
      result = getRingkasanHarian();
    } else if (action === 'getLaporanBulanan') {
      result = getLaporanBulanan(e.parameter.bulan);
    } else if (action === 'getRiwayatBulan') {
      result = getRiwayatBulan(e.parameter.nama, e.parameter.bulan);
    } else if (action === 'getSettings') {
      result = getSettings();
    } else {
      result = { status: 'error', message: 'Aksi GET tidak valid' };
    }

    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Handle HTTP POST requests
 */
function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    const action = payload.action;
    let result = {};

    if (action === 'processForm') {
      result = processForm(payload.data);
    } else if (action === 'saveSettings') {
      result = saveSettings(payload.data);
    } else {
      result = { status: 'error', message: 'Aksi POST tidak valid' };
    }

    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function getSpreadsheet() {
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

// Baca toleransi telat (menit) dari sheet Settings!B7. Default 30 kalau kosong/tidak valid.
function getToleransiTelat() {
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName("Settings");
  if (!sheet) return 30;
  const val = sheet.getRange("B7").getValue();
  const num = parseInt(val, 10);
  return isNaN(num) ? 30 : num;
}

// Baca jam masuk untuk posisi tertentu dari sheet DataPosisi. Default "08:00" kalau tidak ditemukan.
function getJamMasukPosisi(posisi) {
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName("DataPosisi");
  if (!sheet) return "08:00";
  const values = sheet.getDataRange().getValues();
  const target = (posisi || "").toString().trim().toLowerCase();
  for (let i = 1; i < values.length; i++) {
    const rowPos = (values[i][0] || "").toString().trim().toLowerCase();
    if (rowPos === target) {
      const parsed = parseSheetTime(values[i][1]);
      return (parsed && parsed !== "-") ? parsed : "08:00";
    }
  }
  return "08:00";
}

// "08:30" -> 510
function timeStrToMinutes(str) {
  if (str === null || str === undefined || str === "") return 480;
  const timeFormatted = parseSheetTime(str);
  if (!timeFormatted || timeFormatted === "-") return 480;
  const match = String(timeFormatted).match(/(\d{1,2}):(\d{2})/);
  if (match) {
    const h = parseInt(match[1], 10) || 0;
    const m = parseInt(match[2], 10) || 0;
    return (h * 60) + m;
  }
  return 480;
}

// 510 -> "08:30"
function minutesToTimeStr(mins) {
  const m = Math.max(0, Math.floor(mins || 0));
  const h = Math.floor(m / 60) % 24;
  const min = m % 60;
  return ("0" + h).slice(-2) + ":" + ("0" + min).slice(-2);
}

// Baca jam pulang untuk posisi tertentu dari sheet DataPosisi. Default "20:00" kalau tidak ditemukan.
function getJamPulangPosisi(posisi) {
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName("DataPosisi");
  if (!sheet) return "20:00";
  const values = sheet.getDataRange().getValues();
  const target = (posisi || "").toString().trim().toLowerCase();
  for (let i = 1; i < values.length; i++) {
    const rowPos = (values[i][0] || "").toString().trim().toLowerCase();
    if (rowPos === target) {
      const parsed = parseSheetTime(values[i][2]);
      return (parsed && parsed !== "-") ? parsed : "20:00";
    }
  }
  return "20:00";
}

// Sisipkan baris baru persis di bawah header (row 2), bukan di paling bawah,
// supaya data terbaru selalu di atas tanpa perlu scroll.
function prependDataRow(sheet, rowValues) {
  sheet.insertRowBefore(2);
  sheet.getRange(2, 1, 1, rowValues.length).setValues([rowValues]);
}

function uploadImageToDrive(base64Data, filename) {
  if (!base64Data) return "";
  try {
    const splitBase = base64Data.split(',');
    const type = splitBase[0].split(';')[0].replace('data:', '');
    const byteCharacters = Utilities.base64Decode(splitBase[1]);
    const blob = Utilities.newBlob(byteCharacters, type, filename);
    
    // Simpan di Subfolder inti untuk foto
    const folder = DriveApp.getFolderById(FOLDER_FOTO_ID);
    const file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return file.getUrl();
  } catch (e) {
    console.error("Gagal upload foto: " + e.toString());
    return "";
  }
}

function processForm(data) {
  const ss = getSpreadsheet();
  const dateObj = new Date();
  
  // Format Tanggal: DD/MM/YYYY
  const day = ("0" + dateObj.getDate()).slice(-2);
  const month = ("0" + (dateObj.getMonth() + 1)).slice(-2);
  const year = dateObj.getFullYear();
  const tanggalStr = day + "/" + month + "/" + year;
  
  // Format Jam: HH:MM
  const jam = ("0" + dateObj.getHours()).slice(-2) + ":" + ("0" + dateObj.getMinutes()).slice(-2);
  const lokasiUrl = (data.lat && data.lng) ? `https://maps.google.com/?q=${data.lat},${data.lng}` : "";
  
  // Handling Izin / Sakit
  if (data.status === "IZIN" || data.status === "SAKIT") {
    const jenisKeterangan = data.jenisIzin || "IZIN";
    const filename = jenisKeterangan + "-" + data.nama.replace(/\s+/g, '-') + "-" + new Date().getTime() + ".jpg";
    const imageUrl = uploadImageToDrive(data.image, filename);
    
    // Sheet AbsenIzin: Kolom (A - G): Tanggal, Nama Pegawai, Posisi, Jenis (Izin atau Sakit), Alasan, Jam Input, Bukti Foto
    const sheetIzin = ss.getSheetByName("AbsenIzin");
    sheetIzin.appendRow([
      tanggalStr, 
      data.nama, 
      data.posisi,
      jenisKeterangan,
      data.alasan,
      jam,
      imageUrl
    ]);
    
    // Data_Absensi: Kolom (A - O): Tanggal, Nama Pegawai, Posisi, Outlet, Jam Datang, Jam Pulang, Total Jam, Status Masuk, Status Pulang, Lokasi Datang, Lokasi Pulang, Foto Datang, Foto Pulang, Keterangan Datang, Keterangan Pulang
    const sheetData = ss.getSheetByName("Data_Absensi");
    prependDataRow(sheetData, [
      tanggalStr,    // A. Tanggal
      data.nama,     // B. Nama
      data.posisi,   // C. Posisi
      "-",           // D. Outlet
      "-",           // E. Jam Datang
      "-",           // F. Jam Pulang
      "-",           // G. Total Jam
      "IZIN",        // H. Status Masuk
      "-",           // I. Status Pulang
      "-",           // J. Lokasi Datang
      "-",           // K. Lokasi Pulang
      imageUrl,      // L. Foto Datang (Bukti Izin)
      "-",           // M. Foto Pulang
      data.alasan || "-", // N. Keterangan Datang
      "-"            // O. Keterangan Pulang
    ]);

    return { status: "success", message: `Data ${jenisKeterangan} berhasil dicatat.` };
  }
  
  const sheetData = ss.getSheetByName("Data_Absensi");
  const dataRange = sheetData.getDataRange().getValues();
  let userRowIndex = -1;
  
  // Cari absen hari ini untuk NAMA + OUTLET ini secara spesifik.
  // Baris terbaru ada di paling atas (row 2), jadi loop dari atas ke bawah.
  // Kunci pencarian disertakan "outlet" supaya pegawai bisa absen DATANG lagi
  // di outlet lain di hari yang sama (mis. jadi backup shift di outlet berbeda)
  // tanpa dianggap "sudah absen" oleh outlet asalnya.
  // Kolom A (0) = Tanggal, Kolom B (1) = Nama, Kolom D (3) = Outlet, Kolom H (7) = Status Masuk
  for (let i = 1; i < dataRange.length; i++) { 
    const rowTanggal = parseSheetDate(dataRange[i][0]);
    if (rowTanggal == tanggalStr && dataRange[i][1] == data.nama && dataRange[i][3] == data.outlet && dataRange[i][7] !== "IZIN") { 
      userRowIndex = i + 1;
      break;
    }
  }
  
  if (data.status === "DATANG") {
    // Jam Datang ada di Kolom E (index 4)
    if (userRowIndex !== -1 && dataRange[userRowIndex - 1][4] !== "-") { 
      return { status: "error", message: "Anda sudah melakukan absen DATANG hari ini." };
    }

    // Cek telat & batas absen berdasarkan jam masuk posisi (DataPosisi) + toleransi (Settings!B7)
    const jamMasukPosisi = getJamMasukPosisi(data.posisi);
    const toleransiMenit = getToleransiTelat();
    const jamMasukMenit = timeStrToMinutes(jamMasukPosisi);
    const batasTelatMenit = jamMasukMenit + toleransiMenit;
    const minutes = dateObj.getHours() * 60 + dateObj.getMinutes();

    if (minutes > batasTelatMenit) {
      const batasStr = minutesToTimeStr(batasTelatMenit);
      return {
        status: "error",
        message: `Absen DATANG ditolak. Batas absen untuk posisi ${data.posisi} adalah ${jamMasukPosisi} + toleransi ${toleransiMenit} menit (maksimal ${batasStr}). Silakan ajukan IZIN/SAKIT jika terlambat lebih dari batas ini.`
      };
    }

    const statusMasuk = minutes > jamMasukMenit ? "TELAT" : "TEPAT WAKTU";

    const filename = "Masuk-" + data.nama.replace(/\s+/g, '-') + "-" + new Date().getTime() + ".jpg";
    const imageUrl = uploadImageToDrive(data.image, filename);
    
    // (A-O) Tanggal, Nama Pegawai, Posisi, Outlet, Jam Datang, Jam Pulang, Total Jam, Status Masuk, Status Pulang, Lokasi Datang, Lokasi Pulang, Foto Datang, Foto Pulang, Keterangan Datang, Keterangan Pulang
    prependDataRow(sheetData, [
      tanggalStr,   // A
      data.nama,    // B
      data.posisi,  // C
      data.outlet,  // D
      jam,          // E (Jam Datang)
      "-",          // F (Jam Pulang)
      "-",          // G (Total Jam)
      statusMasuk,  // H
      "-",          // I (Status Pulang)
      lokasiUrl,    // J (Lokasi Datang)
      "-",          // K (Lokasi Pulang)
      imageUrl,     // L
      "-",          // M
      data.alasan || "-", // N (Keterangan Datang, mis. alasan telat)
      "-"           // O (Keterangan Pulang, diisi saat PULANG)
    ]);
    
    return { status: "success", message: "Absen DATANG berhasil dicatat." };
    
  } else if (data.status === "PULANG") {
    if (userRowIndex === -1) {
      return { status: "error", message: "Anda belum absen DATANG hari ini." };
    }
    // Jam Pulang ada di kolom F (index 5)
    if (dataRange[userRowIndex - 1][5] !== "-") { 
      return { status: "error", message: "Anda sudah absen PULANG hari ini." };
    }
    
    // Jam Datang Kolom E (index 4)
    let jamDatangStr = parseSheetTime(dataRange[userRowIndex - 1][4]);
    
    let totalJamStr = "-";
    let statusPulang = "NORMAL";
    
    if (jamDatangStr && jamDatangStr !== "-") {
      const pDatang = jamDatangStr.split(":");
      const hoursDiff = dateObj.getHours() - parseInt(pDatang[0]);
      const minsDiff = dateObj.getMinutes() - parseInt(pDatang[1]);
      
      let totalMins = (hoursDiff * 60) + minsDiff;
      if (totalMins < 0) totalMins = 0;
      
      const rH = Math.floor(totalMins / 60);
      const rM = totalMins % 60;
      totalJamStr = rH + "j " + rM + "m";
      
      if (rH >= 13) {
        statusPulang = "LEMBUR";
      }
    }

    // Deteksi pulang cepat: bandingkan jam pulang aktual vs jadwal jam pulang posisi (DataPosisi).
    // Tidak menimpa status LEMBUR yang sudah dihitung di atas.
    if (statusPulang !== "LEMBUR") {
      const jamPulangPosisi = getJamPulangPosisi(data.posisi);
      const jamPulangJadwalMenit = timeStrToMinutes(jamPulangPosisi);
      const jamSekarangMenit = dateObj.getHours() * 60 + dateObj.getMinutes();
      if (jamSekarangMenit < jamPulangJadwalMenit) {
        statusPulang = "PULANG CEPAT";
      }
    }
    const keteranganPulang = (statusPulang === "PULANG CEPAT") ? (data.alasan || "-") : "-";

    const filename = "Pulang-" + data.nama.replace(/\s+/g, '-') + "-" + new Date().getTime() + ".jpg";
    const imageUrl = uploadImageToDrive(data.image, filename);
    
    // Update data di baris user (Urutan getRange adalah 1-based indexing)
    sheetData.getRange(userRowIndex, 6).setValue(jam);           // F (Jam Pulang)
    sheetData.getRange(userRowIndex, 7).setValue(totalJamStr);   // G (Total Jam)
    sheetData.getRange(userRowIndex, 9).setValue(statusPulang);  // I (Status Pulang)
    sheetData.getRange(userRowIndex, 11).setValue(lokasiUrl);    // K (Lokasi Pulang)
    sheetData.getRange(userRowIndex, 13).setValue(imageUrl);     // M (Foto Pulang)
    sheetData.getRange(userRowIndex, 15).setValue(keteranganPulang); // O (Keterangan Pulang)
    
    return { status: "success", message: "Absen PULANG berhasil dicatat." };
  }
  
  return { status: "error", message: "Status absen tidak valid." };
}

function getSettings() {
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName("Settings");
  if (!sheet) {
    return { status: "error", message: "Sheet Settings tidak ditemukan" };
  }
  
  // Mengambil favicon dari B2 (Row 2, Column 2)
  const faviconUrl = sheet.getRange("B2").getValue();
  
  // Mengambil requireLocation dari B3 (Row 3, Column 2)
  let requireLocation = true; // default true
  const requireLocationVal = sheet.getRange("B3").getValue();
  if (requireLocationVal !== "") {
    requireLocation = requireLocationVal === true || requireLocationVal === "TRUE" || requireLocationVal === "true";
  }

  // Mengambil data posisi
  let positions = [];
  let sheetPosisi = ss.getSheetByName("DataPosisi");
  if (sheetPosisi) {
    const pValues = sheetPosisi.getDataRange().getValues();
    for (let i = 1; i < pValues.length; i++) {
      if (pValues[i][0]) {
        let jamMasuk = parseSheetTime(pValues[i][1]);
        let jamPulang = parseSheetTime(pValues[i][2]);
        positions.push({
          name: pValues[i][0].toString().trim(),
          jamMasuk: (jamMasuk && jamMasuk !== "-") ? jamMasuk : "08:00",
          jamPulang: (jamPulang && jamPulang !== "-") ? jamPulang : "20:00"
        });
      }
    }
  }
  // Catatan: fallback lama yang membaca Settings!B4 sebagai daftar posisi sudah dihapus.
  // Sel itu sekarang dipakai untuk "working_days" (bukan daftar posisi), jadi kalau
  // dibaca sebagai posisi akan menghasilkan data sampah. Kalau sheet DataPosisi tidak
  // ada/kosong, langsung pakai default di bawah ini.
  if (!positions || positions.length === 0) {
    positions = [
      { name: "Admin", jamMasuk: "08:00", jamPulang: "20:00" },
      { name: "Admin (Training)", jamMasuk: "08:00", jamPulang: "20:00" },
      { name: "Pickup", jamMasuk: "14:00", jamPulang: "22:00" },
      { name: "Magang", jamMasuk: "08:00", jamPulang: "17:00" }
    ];
  }
  
  // Mengambil data outlet
  let sheetOutlet = ss.getSheetByName("DataOutlet");
  if (!sheetOutlet) {
    sheetOutlet = ss.insertSheet("DataOutlet");
    sheetOutlet.getRange(1, 1, 1, 4).setValues([["Nama Outlet", "Latitude", "Longitude", "Toleransi Radius"]]);
  }
  
  let outlets = [];
  const values = sheetOutlet.getDataRange().getValues();
  // If the sheet is empty or only contains headers, values.length will be 1 or less
  for (let i = 1; i < values.length; i++) {
    if (values[i][0]) {
      outlets.push({
        nama: values[i][0],
        lat: parseFloat(values[i][1]) || 0,
        lng: parseFloat(values[i][2]) || 0,
        radius: parseFloat(values[i][3]) || 150
      });
    }
  }

  return { status: "success", data: { favicon: faviconUrl, requireLocation: requireLocation, outlets: outlets, positions: positions, toleransiTelat: getToleransiTelat() } };
}

function saveSettings(data) {
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName("Settings");
  if (!sheet) {
    return { status: "error", message: "Sheet Settings tidak ditemukan" };
  }
  
  // Set requireLocation ke B3
  if (data.requireLocation !== undefined) {
    sheet.getRange("B3").setValue(data.requireLocation ? "TRUE" : "FALSE");
  }

  // Update positions if provided
  if (data.positions && Array.isArray(data.positions)) {
    let sheetPosisi = ss.getSheetByName("DataPosisi");
    if (!sheetPosisi) {
      sheetPosisi = ss.insertSheet("DataPosisi");
    }
    sheetPosisi.getRange(1, 1, 1, 3).setValues([["Nama Posisi", "Jam Masuk", "Jam Pulang"]]);
    const lastRow = sheetPosisi.getLastRow();
    if (lastRow > 1) {
      sheetPosisi.getRange(2, 1, lastRow - 1, 3).clearContent();
    }
    data.positions.forEach(function(pos, idx) {
      if (pos) {
        let name = typeof pos === 'string' ? pos.trim() : (pos.name || "").trim();
        let jamMasuk = typeof pos === 'object' && pos.jamMasuk ? pos.jamMasuk : "08:00";
        let jamPulang = typeof pos === 'object' && pos.jamPulang ? pos.jamPulang : "20:00";
        if (name) {
          sheetPosisi.getRange(idx + 2, 1).setValue(name);
          sheetPosisi.getRange(idx + 2, 2).setValue(jamMasuk);
          sheetPosisi.getRange(idx + 2, 3).setValue(jamPulang);
        }
      }
    });
    sheet.getRange("B4").setValue(JSON.stringify(data.positions));
  }
  
  // Update outlets if provided
  if (data.outlets && Array.isArray(data.outlets)) {
    let sheetOutlet = ss.getSheetByName("DataOutlet");
    if (!sheetOutlet) {
      sheetOutlet = ss.insertSheet("DataOutlet");
    }
    
    // Pastikan header selalu terpasang rapi di baris pertama
    sheetOutlet.getRange(1, 1, 1, 4).setValues([["Nama Outlet", "Latitude", "Longitude", "Toleransi Radius"]]);
    
    const lastRow = sheetOutlet.getLastRow();
    if (lastRow > 1) {
      sheetOutlet.getRange(2, 1, lastRow - 1, 4).clearContent();
    }
    
    data.outlets.forEach((out, idx) => {
      sheetOutlet.getRange(idx + 2, 1).setValue(out.nama || "");
      sheetOutlet.getRange(idx + 2, 2).setValue(Number(out.lat) || 0);
      sheetOutlet.getRange(idx + 2, 3).setValue(Number(out.lng) || 0);
      sheetOutlet.getRange(idx + 2, 4).setValue(Number(out.radius) || 150);
    });
  }
  
  return { status: "success", message: "Pengaturan berhasil disimpan" };
}

function getPegawai() {
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName("DataPegawai");
  const values = sheet.getDataRange().getValues();
  
  const pegawai = [];
  // (A-J): Nama Pegawai, ID Pegawai, email, password, no_Telepon, Tanggal Aktif Kerja, Tanggal Non-aktif Kerja, Status, Sidik Wajah (JSON), FaceDescriptor
  for (let i = 1; i < values.length; i++) {
    // index 0 = Nama, index 7 = Status
    if (values[i][0]) {
      const status = values[i][7] ? values[i][7].toString().trim().toLowerCase() : "";
      if (status !== "non-aktif" && status !== "nonaktif" && status !== "inactive") { // Memastikan hanya yang berstatus aktif/kosong ditarik
        pegawai.push(values[i][0]);
      }
    }
  }
  return { status: "success", data: pegawai };
}

function getRiwayat(nama) {
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName("Data_Absensi");
  const values = sheet.getDataRange().getValues();
  
  const riwayat = [];
  
  // Baris terbaru ada di row 2 (paling atas), jadi loop dari atas ke bawah
  // supaya "riwayat" tetap terurut dari yang terbaru.
  for (let i = 1; i < values.length; i++) {
    if (values[i][1] === nama) {
      riwayat.push({
        tanggal: parseSheetDate(values[i][0]),
        nama: values[i][1],
        posisi: values[i][2],
        outlet: values[i][3],
        jamDatang: parseSheetTime(values[i][4]),
        jamPulang: parseSheetTime(values[i][5]),
        totalJam: values[i][6],
        statusMasuk: values[i][7],
        statusPulang: values[i][8],
        lokasiDatang: values[i][9],
        lokasiPulang: values[i][10],
        fotoDatang: values[i][11],
        fotoPulang: values[i][12],
        keterangan: values[i][7] === "IZIN" ? "IZIN" : "HADIR",
        keteranganDatang: values[i][13] || "-",
        keteranganPulang: values[i][14] || "-"
      });
      if (riwayat.length >= 31) break; 
    }
  }
  return { status: "success", data: riwayat };
}

function getRingkasanHarian() {
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName("Data_Absensi");
  const values = sheet.getDataRange().getValues();
  
  const dateObj = new Date();
  const day = ("0" + dateObj.getDate()).slice(-2);
  const month = ("0" + (dateObj.getMonth() + 1)).slice(-2);
  const year = dateObj.getFullYear();
  const filterTanggal = day + "/" + month + "/" + year;
  
  const ringkasan = [];
  
  for (let i = 1; i < values.length; i++) {
    const rowTanggal = parseSheetDate(values[i][0]);
    if (rowTanggal === filterTanggal) {
      ringkasan.push({
        tanggal: rowTanggal,
        nama: values[i][1],
        posisi: values[i][2],
        outlet: values[i][3],
        jamDatang: parseSheetTime(values[i][4]),
        jamPulang: parseSheetTime(values[i][5]),
        totalJam: values[i][6],
        statusMasuk: values[i][7],
        statusPulang: values[i][8],
        lokasiDatang: values[i][9],
        lokasiPulang: values[i][10],
        fotoDatang: values[i][11],
        fotoPulang: values[i][12],
        keterangan: values[i][7] === "IZIN" ? "IZIN" : "HADIR"
      });
    }
  }
  return { status: "success", data: ringkasan };
}

function getLaporanBulanan(bulan) {
  const bulanPrefix = (bulan || "").split("-"); 
  const mmFilter = bulanPrefix[1] ? ("/" + bulanPrefix[1] + "/" + bulanPrefix[0]) : "";
  
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName("Data_Absensi");
  const values = sheet.getDataRange().getValues();
  
  const summaryMap = {};
  const outletMap = {};

  for (let i = 1; i < values.length; i++) {
    const tgl = parseSheetDate(values[i][0]); 
    if (mmFilter && !tgl.includes(mmFilter)) {
      continue;
    }
    
    const nama = values[i][1];
    const posisi = values[i][2];
    const outlet = values[i][3] || "Lainnya";
    
    if (!summaryMap[nama]) {
      summaryMap[nama] = {
        nama: nama,
        posisi: posisi,
        totalMenitKerja: 0,
        jumlahJamLembur: 0,
        jumlahTelat: 0,
        jumlahMasuk: 0,
        jumlahIzin: 0
      };
    }
    
    if (outlet && outlet !== "-" && outlet.trim() !== "") {
      if (!outletMap[outlet]) {
        outletMap[outlet] = {
          outlet: outlet,
          totalMenitKerja: 0,
          jumlahJamLembur: 0,
          jumlahTelat: 0,
          jumlahMasuk: 0,
          jumlahIzin: 0,
          pegawai: {}
        };
      }
    }
    
    const sts = summaryMap[nama];
    const statMasuk = values[i][7]; // index 7
    const statPulang = values[i][8]; // index 8
    const totJam = values[i][6]; // index 6
    
    let isIzin = (statMasuk === "IZIN");
    let isTelat = (statMasuk === "TELAT");
    let menit = 0;
    let lembur = 0;
    
    if (totJam && totJam !== "-") {
      const parts = totJam.toString().match(/(\d+)j (\d+)m/);
      if (parts && parts.length === 3) {
        const rH = parseInt(parts[1]);
        const rM = parseInt(parts[2]);
        menit = (rH * 60) + rM;
        if (rH >= 13) {
          lembur = (rH - 12);
        }
      }
    }
    
    if (isIzin) {
      sts.jumlahIzin += 1;
      if (outlet && outletMap[outlet]) {
        outletMap[outlet].jumlahIzin += 1;
      }
    } else {
      sts.jumlahMasuk += 1;
      if (isTelat) {
        sts.jumlahTelat += 1;
      }
      sts.totalMenitKerja += menit;
      sts.jumlahJamLembur += lembur;
      
      if (outlet && outletMap[outlet]) {
        const out = outletMap[outlet];
        out.jumlahMasuk += 1;
        if (isTelat) {
          out.jumlahTelat += 1;
        }
        out.totalMenitKerja += menit;
        out.jumlahJamLembur += lembur;
        
        if (!out.pegawai[nama]) {
          out.pegawai[nama] = {
            nama: nama,
            posisi: posisi,
            jumlahMasuk: 0,
            totalMenitKerja: 0,
            jumlahJamLembur: 0,
            jumlahTelat: 0
          };
        }
        const pStats = out.pegawai[nama];
        pStats.jumlahMasuk += 1;
        pStats.totalMenitKerja += menit;
        pStats.jumlahJamLembur += lembur;
        if (isTelat) {
          pStats.jumlahTelat += 1;
        }
      }
    }
  }
  
  const hasil = [];
  for (let key in summaryMap) {
    const sts = summaryMap[key];
    const totJamLabel = Math.floor(sts.totalMenitKerja / 60) + "j " + (sts.totalMenitKerja % 60) + "m";
    sts.totalJamKerja = totJamLabel;
    hasil.push(sts);
  }
  
  const hasilOutlet = [];
  for (let key in outletMap) {
    const out = outletMap[key];
    out.totalJamKerja = Math.floor(out.totalMenitKerja / 60) + "j " + (out.totalMenitKerja % 60) + "m";
    
    const pegList = [];
    for (let pKey in out.pegawai) {
      const peg = out.pegawai[pKey];
      peg.totalJamKerja = Math.floor(peg.totalMenitKerja / 60) + "j " + (peg.totalMenitKerja % 60) + "m";
      pegList.push(peg);
    }
    out.daftarPegawai = pegList;
    hasilOutlet.push(out);
  }
  
  return { status: "success", data: hasil, dataOutlet: hasilOutlet };
}

function getRiwayatBulan(nama, bulan) {
  const bulanPrefix = (bulan || "").split("-"); 
  const mmFilter = bulanPrefix[1] ? ("/" + bulanPrefix[1] + "/" + bulanPrefix[0]) : "";
  
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName("Data_Absensi");
  const values = sheet.getDataRange().getValues();
  
  const riwayat = [];
  for (let i = 1; i < values.length; i++) {
    const tgl = parseSheetDate(values[i][0]); 
    if (values[i][1] === nama && tgl.includes(mmFilter)) {
      riwayat.push({
        tanggal: tgl,
        nama: values[i][1],
        posisi: values[i][2],
        outlet: values[i][3],
        jamDatang: parseSheetTime(values[i][4]),
        jamPulang: parseSheetTime(values[i][5]),
        totalJam: values[i][6],
        statusMasuk: values[i][7],
        statusPulang: values[i][8],
        lokasiDatang: values[i][9],
        lokasiPulang: values[i][10],
        fotoDatang: values[i][11],
        fotoPulang: values[i][12],
        keterangan: values[i][7] === "IZIN" ? "IZIN" : "HADIR",
        alasan: values[i][7] === "IZIN" ? "-" : "" 
      });
    }
  }
  
  riwayat.reverse(); 
  return { status: "success", data: riwayat };
}

/**
 * Robust date formatting helper function to handle both Date objects and various string date formats.
 * Ensures dates are consistently returned in DD/MM/YYYY format.
 */
function parseSheetTime(val) {
  if (val === null || val === undefined || val === "") return "-";
  if (val === "-") return "-";
  
  if (val instanceof Date) {
    const hh = ("0" + val.getHours()).slice(-2);
    const mm = ("0" + val.getMinutes()).slice(-2);
    return hh + ":" + mm;
  } else if (typeof val === "number") {
    // Check if it's a fractional day (gas time format)
    let totalSeconds = Math.round(val * 24 * 60 * 60);
    let h = Math.floor(totalSeconds / 3600);
    let m = Math.floor((totalSeconds % 3600) / 60);
    return ("0" + h).slice(-2) + ":" + ("0" + m).slice(-2);
  } else if (typeof val === "string") {
    if (val.includes("T") && !isNaN(Date.parse(val))) {
      const d = new Date(val);
      const hh = ("0" + d.getHours()).slice(-2);
      const mm = ("0" + d.getMinutes()).slice(-2);
      return hh + ":" + mm;
    }
    const match = val.match(/(\d{1,2}):(\d{2})/);
    if (match) {
      const hh = ("0" + match[1]).slice(-2);
      const mm = match[2];
      return hh + ":" + mm;
    }
  }
  
  return String(val);
}

function parseSheetDate(val) {
  if (!val) return "";
  if (val instanceof Date) {
    const day = ("0" + val.getDate()).slice(-2);
    const month = ("0" + (val.getMonth() + 1)).slice(-2);
    const year = val.getFullYear();
    return day + "/" + month + "/" + year;
  }
  
  const str = String(val).trim();
  if (str === "-") return "-";
  
  // Handle ISO string format "YYYY-MM-DDTHH:mm:ss..."
  if (str.includes("T")) {
    try {
      const d = new Date(str);
      if (!isNaN(d.getTime())) {
        const day = ("0" + d.getDate()).slice(-2);
        const month = ("0" + (d.getMonth() + 1)).slice(-2);
        const year = d.getFullYear();
        return day + "/" + month + "/" + year;
      }
    } catch (e) {}
  }
  
  // Handle "YYYY-MM-DD" format
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
    try {
      const d = new Date(str);
      if (!isNaN(d.getTime())) {
        const day = ("0" + d.getDate()).slice(-2);
        const month = ("0" + (d.getMonth() + 1)).slice(-2);
        const year = d.getFullYear();
        return day + "/" + month + "/" + year;
      }
    } catch(e) {}
  }

  // Handle standard "DD/MM/YYYY" or other string format
  return str;
}