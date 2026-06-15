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
    
    // Data_Absensi: Kolom (A - M): Tanggal, Nama Pegawai, Posisi, Outlet, Jam Datang, Jam Pulang, Total Jam, Status Masuk, Status Pulang, Lokasi Datang, Lokasi Pulang, Foto Datang, Foto Pulang
    const sheetData = ss.getSheetByName("Data_Absensi");
    sheetData.appendRow([
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
      "-"            // M. Foto Pulang
    ]);

    return { status: "success", message: `Data ${jenisKeterangan} berhasil dicatat.` };
  }
  
  const sheetData = ss.getSheetByName("Data_Absensi");
  const dataRange = sheetData.getDataRange().getValues();
  let userRowIndex = -1;
  
  // Cari absen hari ini munddur dari bawah
  // Kolom A (0) = Tanggal, Kolom B (1) = Nama, Kolom H (7) = Status Masuk
  for (let i = dataRange.length - 1; i > 0; i--) { 
    if (dataRange[i][0] == tanggalStr && dataRange[i][1] == data.nama && dataRange[i][7] !== "IZIN") { 
      userRowIndex = i + 1;
      break;
    }
  }
  
  if (data.status === "DATANG") {
    // Jam Datang ada di Kolom E (index 4)
    if (userRowIndex !== -1 && dataRange[userRowIndex - 1][4] !== "-") { 
      return { status: "error", message: "Anda sudah melakukan absen DATANG hari ini." };
    }
    
    let statusMasuk = "TEPAT WAKTU";
    const minutes = dateObj.getHours() * 60 + dateObj.getMinutes();
    
    if (data.posisi === "Admin" && minutes > 510) { // Lewat jam 08:30 (8*60+30)
      statusMasuk = "TELAT";
    } else if (data.posisi === "Pickup" && minutes >= 780) { // Lewat jam 13:00 (13*60)
      statusMasuk = "TELAT";
    }

    const filename = "Masuk-" + data.nama.replace(/\s+/g, '-') + "-" + new Date().getTime() + ".jpg";
    const imageUrl = uploadImageToDrive(data.image, filename);
    
    // (A-M) Tanggal, Nama Pegawai, Posisi, Outlet, Jam Datang, Jam Pulang, Total Jam, Status Masuk, Status Pulang, Lokasi Datang, Lokasi Pulang, Foto Datang, Foto Pulang
    sheetData.appendRow([
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
      "-"           // M
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
    const jamDatang = dataRange[userRowIndex - 1][4]; 
    let totalJamStr = "-";
    let statusPulang = "NORMAL";
    
    if (jamDatang && jamDatang !== "-") {
      const pDatang = jamDatang.split(":");
      const hoursDiff = dateObj.getHours() - parseInt(pDatang[0]);
      const minsDiff = dateObj.getMinutes() - parseInt(pDatang[1]);
      
      let totalMins = (hoursDiff * 60) + minsDiff;
      if (totalMins < 0) totalMins = 0;
      
      const rH = Math.floor(totalMins / 60);
      const rM = totalMins % 60;
      totalJamStr = rH + "j " + rM + "m";
      
      if (dateObj.getHours() >= 21 || rH >= 13) {
        statusPulang = "LEMBUR";
      }
    }

    const filename = "Pulang-" + data.nama.replace(/\s+/g, '-') + "-" + new Date().getTime() + ".jpg";
    const imageUrl = uploadImageToDrive(data.image, filename);
    
    // Update data di baris user (Urutan getRange adalah 1-based indexing)
    sheetData.getRange(userRowIndex, 6).setValue(jam);           // F (Jam Pulang)
    sheetData.getRange(userRowIndex, 7).setValue(totalJamStr);   // G (Total Jam)
    sheetData.getRange(userRowIndex, 9).setValue(statusPulang);  // I (Status Pulang)
    sheetData.getRange(userRowIndex, 11).setValue(lokasiUrl);    // K (Lokasi Pulang)
    sheetData.getRange(userRowIndex, 13).setValue(imageUrl);     // M (Foto Pulang)
    
    return { status: "success", message: "Absen PULANG berhasil dicatat." };
  }
  
  return { status: "error", message: "Status absen tidak valid." };
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
  
  for (let i = values.length - 1; i > 0; i--) {
    if (values[i][1] === nama) {
      riwayat.push({
        tanggal: values[i][0],
        nama: values[i][1],
        posisi: values[i][2],
        outlet: values[i][3],
        jamDatang: values[i][4],
        jamPulang: values[i][5],
        totalJam: values[i][6],
        statusMasuk: values[i][7],
        statusPulang: values[i][8],
        lokasiDatang: values[i][9],
        lokasiPulang: values[i][10],
        fotoDatang: values[i][11],
        fotoPulang: values[i][12],
        keterangan: values[i][7] === "IZIN" ? "IZIN" : "HADIR"
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
    if (values[i][0] === filterTanggal) {
      ringkasan.push({
        tanggal: values[i][0],
        nama: values[i][1],
        posisi: values[i][2],
        outlet: values[i][3],
        jamDatang: values[i][4],
        jamPulang: values[i][5],
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
  for (let i = 1; i < values.length; i++) {
    const tgl = values[i][0] || ""; 
    if (mmFilter && !tgl.toString().includes(mmFilter)) {
      continue;
    }
    
    const nama = values[i][1];
    if (!summaryMap[nama]) {
      summaryMap[nama] = {
        nama: nama,
        posisi: values[i][2], // index 2
        totalMenitKerja: 0,
        jumlahJamLembur: 0,
        jumlahTelat: 0,
        jumlahMasuk: 0,
        jumlahIzin: 0
      };
    }
    
    const sts = summaryMap[nama];
    const statMasuk = values[i][7]; // index 7
    const statPulang = values[i][8]; // index 8
    const totJam = values[i][6]; // index 6
    
    if (statMasuk === "IZIN") {
      sts.jumlahIzin += 1;
    } else {
      sts.jumlahMasuk += 1;
      if (statMasuk === "TELAT") {
        sts.jumlahTelat += 1;
      }
      if (statPulang === "LEMBUR") {
        sts.jumlahJamLembur += 1; 
      }
      if (totJam && totJam !== "-") {
        const parts = totJam.toString().match(/(\d+)j (\d+)m/);
        if (parts && parts.length === 3) {
          sts.totalMenitKerja += (parseInt(parts[1]) * 60) + parseInt(parts[2]);
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
  return { status: "success", data: hasil };
}

function getRiwayatBulan(nama, bulan) {
  const bulanPrefix = (bulan || "").split("-"); 
  const mmFilter = bulanPrefix[1] ? ("/" + bulanPrefix[1] + "/" + bulanPrefix[0]) : "";
  
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName("Data_Absensi");
  const values = sheet.getDataRange().getValues();
  
  const riwayat = [];
  for (let i = 1; i < values.length; i++) {
    const tgl = values[i][0] || ""; 
    if (values[i][1] === nama && tgl.toString().includes(mmFilter)) {
      riwayat.push({
        tanggal: values[i][0],
        nama: values[i][1],
        posisi: values[i][2],
        outlet: values[i][3],
        jamDatang: values[i][4],
        jamPulang: values[i][5],
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
