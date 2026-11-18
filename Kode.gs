const BACKEND_VERSION = "2026-11-16-v2.9.0-dynamic-schedule";
const FOLDER_INTI_ID = "14Spw44yA0pGTajzildh0egJ-KuqFF7Gq";
const SPREADSHEET_ID = "1f9WVUQSVShJyqRnNgR3MlynCk3znbDQ8qoAWMLb1fWA";
const FOLDER_FOTO_ID = "1mhDtsYrdtdv2nl5dwjax8URSAGKYzatY";

const DEFAULT_WORK_DAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT"];
const ALLOWED_DAY_CODES = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
const ALLOWED_ABSENCE_STATUSES = ["LIBUR", "IZIN", "SAKIT", "ALPA"];
const ALLOWED_ASSIGNMENT_TYPES = ["NORMAL", "BACKUP", "ROTASI", "PENGGANTI"];
const ALLOWED_SCHEDULE_STATUSES = ["DIJADWALKAN", "LIBUR", "DIBATALKAN"];

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
 * Diagnostic info endpoint to verify which version of Apps Script deployment is currently active
 */
function getDeploymentInfo() {
  return {
    status: "success",
    backendVersion: BACKEND_VERSION,
    serverTime: new Date().toISOString(),
    parserVersion: "safe-time-parser-v3",
    features: [
      "prependRow2",
      "robustTimeParser",
      "multiOutletSearch",
      "gpsUrl",
      "displayValues",
      "saveSettingsViaGetAndPost",
      "strictPulangCheck",
      "inclusiveLatenessTolerance",
      "ownerSessionAuth",
      "dataPenempatan",
      "dataKetidakhadiran",
      "jadwalHarian",
      "snapshotAbsensi",
      "getEffectiveWorkAssignment"
    ]
  };
}

/**
 * Handle HTTP GET requests
 */
function doGet(e) {
  try {
    const action = e.parameter.action;
    let result = {};

    if (action === 'getDeploymentInfo' || action === 'ping') {
      result = getDeploymentInfo();
    } else if (action === 'verifyOwnerSession') {
      result = verifyOwnerSession(e.parameter.token || e.parameter.ownerToken);
    } else if (action === 'getPegawai') {
      result = getPegawai();
    } else if (action === 'getPegawaiDetail') {
      result = getPegawaiDetail(e.parameter.nama, e.parameter.idPegawai, e.parameter.tanggal);
    } else if (action === 'getDataPenempatan') {
      result = getDataPenempatan();
    } else if (action === 'getRiwayatPenempatan') {
      result = getRiwayatPenempatan(e.parameter.idPegawai, e.parameter.nama);
    } else if (action === 'getJadwalHarian') {
      result = getJadwalHarian(e.parameter.tanggal);
    } else if (action === 'getRiwayatRotasi') {
      result = getRiwayatRotasi(e.parameter.nama, e.parameter.outlet, e.parameter.bulan);
    } else if (action === 'getKehadiranHarian') {
      result = getKehadiranHarian(e.parameter.tanggal);
    } else if (action === 'getKetidakhadiran') {
      result = getKetidakhadiran(e.parameter.tanggal, e.parameter.bulan, e.parameter.nama, e.parameter.outlet);
    } else if (action === 'getRiwayat') {
      result = getRiwayat(e.parameter.nama);
    } else if (action === 'getRingkasanHarian') {
      result = getRingkasanHarian(e.parameter.tanggal);
    } else if (action === 'getLaporanBulanan') {
      result = getLaporanBulanan(e.parameter.bulan);
    } else if (action === 'getRiwayatBulan') {
      result = getRiwayatBulan(e.parameter.nama, e.parameter.bulan);
    } else if (action === 'getOutlets') {
      result = { status: 'success', data: getOutlets(), backendVersion: BACKEND_VERSION };
    } else if (action === 'getSettings') {
      result = getSettings();
    } else if (action === 'saveSettings') {
      let dataObj = {};
      try {
        dataObj = JSON.parse(e.parameter.data || "{}");
      } catch (err) {}
      result = saveSettings(dataObj, e.parameter.ownerToken || dataObj.ownerToken);
    } else {
      result = { status: 'error', message: 'Aksi GET tidak valid', backendVersion: BACKEND_VERSION };
    }

    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: error.toString(), backendVersion: BACKEND_VERSION }))
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
    const ownerToken = payload.ownerToken || payload.token || (payload.data && payload.data.ownerToken) || "";
    let result = {};

    if (action === 'ownerLogin') {
      result = ownerLogin(payload.data || payload);
    } else if (action === 'ownerLogout') {
      result = ownerLogout(ownerToken);
    } else if (action === 'verifyOwnerSession') {
      result = verifyOwnerSession(ownerToken);
    } else if (action === 'processForm') {
      result = processForm(payload.data);
    } else if (action === 'saveSettings') {
      result = saveSettings(payload.data, ownerToken);
    } else if (action === 'savePenempatan') {
      result = savePenempatan(payload.data, ownerToken);
    } else if (action === 'saveJadwalHarian') {
      result = saveJadwalHarian(payload.data, ownerToken);
    } else if (action === 'updateJadwalHarian') {
      result = updateJadwalHarian(payload.data, ownerToken);
    } else if (action === 'cancelJadwalHarian') {
      result = cancelJadwalHarian(payload.data, ownerToken);
    } else if (action === 'saveKetidakhadiran') {
      result = saveKetidakhadiran(payload.data, ownerToken);
    } else if (action === 'updateKetidakhadiran') {
      result = updateKetidakhadiran(payload.data, ownerToken);
    } else if (action === 'cancelKetidakhadiran') {
      result = cancelKetidakhadiran(payload.data, ownerToken);
    } else if (action === 'closeDailyAttendance') {
      result = closeDailyAttendance(payload.data, ownerToken);
    } else {
      result = { status: 'error', message: 'Aksi POST tidak valid', backendVersion: BACKEND_VERSION };
    }

    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: error.toString(), backendVersion: BACKEND_VERSION }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

let _cachedSpreadsheet = null;
function getSpreadsheet() {
  if (!_cachedSpreadsheet) {
    _cachedSpreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  }
  return _cachedSpreadsheet;
}

// ==================== TIMEZONE & DATE HELPERS (Asia/Jakarta) ====================

function getJakartaNow() {
  return new Date();
}

function getJakartaDateStr(dateObj) {
  const d = dateObj || new Date();
  try {
    return Utilities.formatDate(d, "Asia/Jakarta", "dd/MM/yyyy");
  } catch (e) {
    return ("0" + d.getDate()).slice(-2) + "/" + ("0" + (d.getMonth() + 1)).slice(-2) + "/" + d.getFullYear();
  }
}

function getJakartaTimeStr(dateObj) {
  const d = dateObj || new Date();
  try {
    return Utilities.formatDate(d, "Asia/Jakarta", "HH:mm");
  } catch (e) {
    return ("0" + d.getHours()).slice(-2) + ":" + ("0" + d.getMinutes()).slice(-2);
  }
}

function getJakartaTimestampStr(dateObj) {
  const d = dateObj || new Date();
  try {
    return Utilities.formatDate(d, "Asia/Jakarta", "yyyy-MM-dd HH:mm:ss");
  } catch (e) {
    return d.toISOString();
  }
}

function toYmd(val) {
  if (!val) return "";
  const dmy = normalizeDateStr(parseSheetDate(val));
  const m = String(dmy).match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) {
    return m[3] + "-" + m[2] + "-" + m[1];
  }
  return "";
}

function toDmy(val) {
  if (!val) return "";
  const dmy = normalizeDateStr(parseSheetDate(val));
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(dmy)) return dmy;
  return "";
}

function isValidDateInput(val) {
  const ymd = toYmd(val);
  if (!ymd) return false;
  const parts = ymd.split("-");
  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  const d = parseInt(parts[2], 10);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && (dt.getUTCMonth() + 1) === m && dt.getUTCDate() === d;
}

function addDaysYmd(ymdStr, deltaDays) {
  const parts = String(ymdStr).split("-");
  if (parts.length !== 3) return "";
  const dt = new Date(Date.UTC(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10) + deltaDays));
  const y = dt.getUTCFullYear();
  const m = ("0" + (dt.getUTCMonth() + 1)).slice(-2);
  const d = ("0" + dt.getUTCDate()).slice(-2);
  return y + "-" + m + "-" + d;
}

function getDayCodeFromYmd(ymdStr) {
  const parts = String(ymdStr).split("-");
  if (parts.length !== 3) return "MON";
  const dt = new Date(Date.UTC(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10)));
  const codes = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
  return codes[dt.getUTCDay()] || "MON";
}

function expandDateRangeYmd(startInput, endInput, maxDays) {
  const startYmd = toYmd(startInput);
  const endYmd = endInput ? toYmd(endInput) : startYmd;
  if (!startYmd || !endYmd || endYmd < startYmd) return [];
  const limit = maxDays || 31;
  const out = [];
  let cur = startYmd;
  while (cur <= endYmd && out.length < limit) {
    out.push(cur);
    cur = addDaysYmd(cur, 1);
  }
  return out;
}

function isValidHHMM(str) {
  if (!str) return false;
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(str).trim());
}

function normalizeTextKey(val) {
  return String(val || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizeOutletKey(val) {
  return String(val || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function parseWorkDays(raw) {
  if (Array.isArray(raw)) {
    const clean = raw.map(function(d) { return String(d).trim().toUpperCase(); }).filter(function(d) { return ALLOWED_DAY_CODES.indexOf(d) !== -1; });
    return clean.length > 0 ? clean : DEFAULT_WORK_DAYS.slice();
  }
  if (typeof raw === "string" && raw.trim() !== "") {
    const s = raw.trim();
    try {
      const parsed = JSON.parse(s);
      if (Array.isArray(parsed)) {
        const clean = parsed.map(function(d) { return String(d).trim().toUpperCase(); }).filter(function(d) { return ALLOWED_DAY_CODES.indexOf(d) !== -1; });
        if (clean.length > 0) return clean;
      }
    } catch (e) {
      const split = s.split(/[,;|]+/).map(function(d) { return d.trim().toUpperCase(); }).filter(function(d) { return ALLOWED_DAY_CODES.indexOf(d) !== -1; });
      if (split.length > 0) return split;
    }
  }
  return DEFAULT_WORK_DAYS.slice();
}

function intervalsOverlap(startA, endA, startB, endB) {
  const a1 = timeStrToMinutes(startA);
  let a2 = timeStrToMinutes(endA);
  if (a2 <= a1) a2 += 1440;
  const b1 = timeStrToMinutes(startB);
  let b2 = timeStrToMinutes(endB);
  if (b2 <= b1) b2 += 1440;
  return a1 < b2 && b1 < a2;
}

// ==================== OWNER AUTHENTICATION ====================

function getConfiguredOwnerPassword(ss) {
  try {
    const sSheet = (ss || getSpreadsheet()).getSheetByName("Settings");
    if (sSheet) {
      const a10 = String(sSheet.getRange("A10").getValue() || "").trim().toLowerCase();
      const b10 = String(sSheet.getRange("B10").getValue() || "").trim();
      if (b10 && (a10 === "owner_password" || a10 === "password_owner" || a10 === "")) {
        return b10;
      }
    }
  } catch (e) {}
  try {
    const propPass = PropertiesService.getScriptProperties().getProperty("OWNER_PASSWORD");
    if (propPass && String(propPass).trim()) return String(propPass).trim();
  } catch (e) {}
  return "jntowner";
}

function ownerLogin(data) {
  const ss = getSpreadsheet();
  const password = data && data.password ? String(data.password) : "";
  const expected = getConfiguredOwnerPassword(ss);
  if (!password || password !== expected) {
    return {
      status: "error",
      message: "Password Owner salah!",
      backendVersion: BACKEND_VERSION
    };
  }

  const token = Utilities.getUuid().replace(/-/g, "") + "-" + new Date().getTime().toString(36);
  const ttlSeconds = 21600; // 6 jam di CacheService
  const expiresAtMs = new Date().getTime() + 8 * 3600 * 1000; // 8 jam di ScriptProperties
  const sessionObj = {
    ownerName: "Owner",
    issuedAt: getJakartaTimestampStr(),
    expiresAt: expiresAtMs
  };

  try {
    CacheService.getScriptCache().put("OWNER_TOKEN_" + token, JSON.stringify(sessionObj), ttlSeconds);
  } catch (e) {}

  try {
    const props = PropertiesService.getScriptProperties();
    // Bersihkan token kedaluwarsa secara berkala agar tidak menumpuk
    const allProps = props.getProperties();
    const nowMs = new Date().getTime();
    for (var k in allProps) {
      if (k.indexOf("OWNER_TOKEN_") === 0) {
        try {
          var obj = JSON.parse(allProps[k]);
          if (!obj || !obj.expiresAt || obj.expiresAt < nowMs) {
            props.deleteProperty(k);
          }
        } catch (err) {
          props.deleteProperty(k);
        }
      }
    }
    props.setProperty("OWNER_TOKEN_" + token, JSON.stringify(sessionObj));
  } catch (e) {}

  return {
    status: "success",
    token: token,
    ownerName: sessionObj.ownerName,
    expiresAt: expiresAtMs,
    backendVersion: BACKEND_VERSION
  };
}

function ownerLogout(token) {
  if (token) {
    try { CacheService.getScriptCache().remove("OWNER_TOKEN_" + token); } catch (e) {}
    try { PropertiesService.getScriptProperties().deleteProperty("OWNER_TOKEN_" + token); } catch (e) {}
  }
  return { status: "success", message: "Logout berhasil", backendVersion: BACKEND_VERSION };
}

function checkOwnerToken(token) {
  if (!token || typeof token !== "string" || token.trim() === "") {
    return { ok: false, message: "Autentikasi Owner diperlukan. Silakan login Owner terlebih dahulu." };
  }
  const cleanToken = token.trim();
  const nowMs = new Date().getTime();

  try {
    const cached = CacheService.getScriptCache().get("OWNER_TOKEN_" + cleanToken);
    if (cached) {
      const obj = JSON.parse(cached);
      if (obj && obj.expiresAt && obj.expiresAt >= nowMs) {
        return { ok: true, ownerName: obj.ownerName || "Owner" };
      }
    }
  } catch (e) {}

  try {
    const rawProp = PropertiesService.getScriptProperties().getProperty("OWNER_TOKEN_" + cleanToken);
    if (rawProp) {
      const obj = JSON.parse(rawProp);
      if (obj && obj.expiresAt && obj.expiresAt >= nowMs) {
        try { CacheService.getScriptCache().put("OWNER_TOKEN_" + cleanToken, rawProp, 21600); } catch (err) {}
        return { ok: true, ownerName: obj.ownerName || "Owner" };
      } else {
        PropertiesService.getScriptProperties().deleteProperty("OWNER_TOKEN_" + cleanToken);
      }
    }
  } catch (e) {}

  return { ok: false, message: "Sesi Owner tidak valid atau sudah berakhir. Silakan login ulang." };
}

function verifyOwnerSession(token) {
  const chk = checkOwnerToken(token);
  if (!chk.ok) {
    return { status: "error", valid: false, authRequired: true, message: chk.message, backendVersion: BACKEND_VERSION };
  }
  return { status: "success", valid: true, ownerName: chk.ownerName, backendVersion: BACKEND_VERSION };
}

// ==================== SHEET INITIALIZERS ====================

function ensureDataPenempatanSheet(ss) {
  let sheet = ss.getSheetByName("DataPenempatan");
  if (!sheet) {
    sheet = ss.insertSheet("DataPenempatan");
    sheet.getRange(1, 1, 1, 12).setValues([[
      "ID Pegawai", "Nama Pegawai", "Outlet", "Posisi", "Jam Masuk", "Jam Pulang",
      "Hari Kerja", "Tanggal Mulai Berlaku", "Tanggal Akhir Berlaku", "Status", "Updated At", "Updated By"
    ]]);
  }
  return sheet;
}

function ensureJadwalHarianSheet(ss) {
  let sheet = ss.getSheetByName("JadwalHarian");
  if (!sheet) {
    sheet = ss.insertSheet("JadwalHarian");
    sheet.getRange(1, 1, 1, 14).setValues([[
      "ID Jadwal", "Tanggal", "ID Pegawai", "Nama Pegawai", "Outlet", "Posisi Penugasan",
      "Jam Masuk", "Jam Pulang", "Jenis Penugasan", "Status Jadwal", "Catatan", "Dibuat Oleh", "Waktu Dibuat", "Updated At"
    ]]);
  }
  return sheet;
}

function ensureDataKetidakhadiranSheet(ss) {
  let sheet = ss.getSheetByName("DataKetidakhadiran");
  if (!sheet) {
    sheet = ss.insertSheet("DataKetidakhadiran");
    sheet.getRange(1, 1, 1, 11).setValues([[
      "Tanggal", "ID Pegawai", "Nama Pegawai", "Outlet", "Posisi", "Status",
      "Alasan", "Bukti Foto / Dokumen", "Dicatat Oleh", "Waktu Input", "Keterangan"
    ]]);
  }
  return sheet;
}

function ensureSnapshotAbsensiSheet(ss) {
  let sheet = ss.getSheetByName("SnapshotAbsensi");
  if (!sheet) {
    sheet = ss.insertSheet("SnapshotAbsensi");
    sheet.getRange(1, 1, 1, 13).setValues([[
      "SnapshotKey", "Tanggal", "ID Pegawai", "Nama Pegawai", "ID Jadwal", "Outlet",
      "Posisi Permanen", "Posisi Penugasan", "Jam Masuk Efektif", "Jam Pulang Efektif",
      "Jenis Penugasan", "Sumber Jadwal", "Waktu Datang"
    ]]);
  }
  return sheet;
}

// ==================== SAFE READERS & CONTEXT ====================

function getActiveEmployeesSafe(ss) {
  const sheet = (ss || getSpreadsheet()).getSheetByName("DataPegawai");
  if (!sheet) return [];
  const values = sheet.getDataRange().getValues();
  const rawList = [];
  const nameCounts = {};

  // (A-J): Nama(0), ID(1), email(2), password(3 - NEVER EXPOSE), no_Telepon(4), TglAktif(5), TglNonAktif(6), Status(7), SidikWajah(8 - NEVER EXPOSE), FaceDescriptor(9 - NEVER EXPOSE)
  for (let i = 1; i < values.length; i++) {
    const nama = values[i][0] ? String(values[i][0]).trim() : "";
    if (!nama) continue;
    const statusRaw = values[i][7] ? String(values[i][7]).trim() : "";
    const statusLower = statusRaw.toLowerCase();
    if (statusLower === "non-aktif" || statusLower === "nonaktif" || statusLower === "inactive") continue;

    const idPegawai = values[i][1] ? String(values[i][1]).trim() : "";
    const normName = normalizeTextKey(nama);
    nameCounts[normName] = (nameCounts[normName] || 0) + 1;

    rawList.push({
      idPegawai: idPegawai,
      nama: nama,
      email: values[i][2] ? String(values[i][2]).trim() : "",
      noTelepon: values[i][4] ? String(values[i][4]).trim() : "",
      tanggalAktif: parseSheetDate(values[i][5]),
      tanggalNonAktif: parseSheetDate(values[i][6]),
      status: statusRaw || "AKTIF"
    });
  }

  return rawList.map(function(emp) {
    const normName = normalizeTextKey(emp.nama);
    return {
      idPegawai: emp.idPegawai,
      nama: emp.nama,
      email: emp.email,
      noTelepon: emp.noTelepon,
      tanggalAktif: emp.tanggalAktif,
      tanggalNonAktif: emp.tanggalNonAktif,
      status: emp.status,
      missingId: !emp.idPegawai,
      duplicateName: (nameCounts[normName] || 0) > 1
    };
  });
}

function getPositionsMap(ss) {
  const map = {};
  const sheet = (ss || getSpreadsheet()).getSheetByName("DataPosisi");
  if (sheet) {
    const values = sheet.getDataRange().getValues();
    for (let i = 1; i < values.length; i++) {
      if (values[i][0]) {
        const name = String(values[i][0]).trim();
        const jm = parseSheetTime(values[i][1]);
        const jp = parseSheetTime(values[i][2]);
        const enabledVal = values[i][3];
        const enabled = enabledVal === "" || enabledVal === null || enabledVal === undefined || enabledVal === true || enabledVal === "TRUE" || enabledVal === "true" || enabledVal === "ON" || enabledVal === "on";
        map[normalizeTextKey(name)] = {
          name: name,
          jamMasuk: (jm && jm !== "-") ? jm : "08:00",
          jamPulang: (jp && jp !== "-") ? jp : "20:00",
          enabled: enabled
        };
      }
    }
  }
  return map;
}

function readAllPenempatanRows(ss) {
  const sheet = ss.getSheetByName("DataPenempatan");
  if (!sheet) return [];
  const values = sheet.getDataRange().getValues();
  const displayValues = sheet.getDataRange().getDisplayValues();
  const rows = [];
  for (let i = 1; i < values.length; i++) {
    const nama = values[i][1] ? String(values[i][1]).trim() : "";
    const idPegawai = values[i][0] ? String(values[i][0]).trim() : "";
    if (!nama && !idPegawai) continue;
    const jm = parseSheetTime(displayValues[i] && displayValues[i][4] ? displayValues[i][4] : values[i][4]);
    const jp = parseSheetTime(displayValues[i] && displayValues[i][5] ? displayValues[i][5] : values[i][5]);
    const st = String(values[i][9] || "AKTIF").trim().toUpperCase();
    rows.push({
      rowIndex: i + 1,
      idPegawai: idPegawai,
      nama: nama,
      outlet: String(values[i][2] || "").trim(),
      posisi: String(values[i][3] || "").trim(),
      jamMasuk: (jm && jm !== "-") ? jm : "",
      jamPulang: (jp && jp !== "-") ? jp : "",
      hariKerja: parseWorkDays(values[i][6]),
      tanggalMulai: toYmd(displayValues[i] && displayValues[i][7] ? displayValues[i][7] : values[i][7]),
      tanggalAkhir: toYmd(displayValues[i] && displayValues[i][8] ? displayValues[i][8] : values[i][8]),
      status: st === "NONAKTIF" ? "NONAKTIF" : "AKTIF",
      updatedAt: String(displayValues[i] ? displayValues[i][10] : values[i][10] || ""),
      updatedBy: String(values[i][11] || "")
    });
  }
  return rows;
}

function readAllJadwalHarianRows(ss) {
  const sheet = ss.getSheetByName("JadwalHarian");
  if (!sheet) return [];
  const values = sheet.getDataRange().getValues();
  const displayValues = sheet.getDataRange().getDisplayValues();
  const rows = [];
  for (let i = 1; i < values.length; i++) {
    const idJadwal = values[i][0] ? String(values[i][0]).trim() : "";
    const nama = values[i][3] ? String(values[i][3]).trim() : "";
    if (!idJadwal && !nama) continue;
    const tglRaw = displayValues[i] && displayValues[i][1] ? displayValues[i][1] : values[i][1];
    const jm = parseSheetTime(displayValues[i] && displayValues[i][6] ? displayValues[i][6] : values[i][6]);
    const jp = parseSheetTime(displayValues[i] && displayValues[i][7] ? displayValues[i][7] : values[i][7]);
    rows.push({
      rowIndex: i + 1,
      idJadwal: idJadwal,
      tanggal: toDmy(tglRaw),
      tanggalYmd: toYmd(tglRaw),
      idPegawai: String(values[i][2] || "").trim(),
      nama: nama,
      outlet: String(values[i][4] || "").trim(),
      posisiPenugasan: String(values[i][5] || "").trim(),
      jamMasuk: (jm && jm !== "-") ? jm : "",
      jamPulang: (jp && jp !== "-") ? jp : "",
      jenisPenugasan: String(values[i][8] || "NORMAL").trim().toUpperCase(),
      statusJadwal: String(values[i][9] || "DIJADWALKAN").trim().toUpperCase(),
      catatan: String(values[i][10] || "").trim(),
      dibuatOleh: String(values[i][11] || "").trim(),
      waktuDibuat: String(displayValues[i] ? displayValues[i][12] : values[i][12] || ""),
      updatedAt: String(displayValues[i] ? displayValues[i][13] : values[i][13] || "")
    });
  }
  return rows;
}

function readAllKetidakhadiranRows(ss) {
  const sheet = ss.getSheetByName("DataKetidakhadiran");
  if (!sheet) return [];
  const values = sheet.getDataRange().getValues();
  const displayValues = sheet.getDataRange().getDisplayValues();
  const rows = [];
  for (let i = 1; i < values.length; i++) {
    const nama = values[i][2] ? String(values[i][2]).trim() : "";
    const status = values[i][5] ? String(values[i][5]).trim().toUpperCase() : "";
    if (!nama || !status) continue;
    const tglRaw = displayValues[i] && displayValues[i][0] ? displayValues[i][0] : values[i][0];
    rows.push({
      rowIndex: i + 1,
      tanggal: toDmy(tglRaw),
      tanggalYmd: toYmd(tglRaw),
      idPegawai: String(values[i][1] || "").trim(),
      nama: nama,
      outlet: String(values[i][3] || "").trim(),
      posisi: String(values[i][4] || "").trim(),
      status: status,
      alasan: String(values[i][6] || "").trim(),
      buktiFoto: String(values[i][7] || "").trim(),
      dicatatOleh: String(values[i][8] || "").trim(),
      waktuInput: String(displayValues[i] ? displayValues[i][9] : values[i][9] || ""),
      keterangan: String(values[i][10] || "").trim()
    });
  }
  return rows;
}

function readAllSnapshotRows(ss) {
  const sheet = ss.getSheetByName("SnapshotAbsensi");
  if (!sheet) return [];
  const values = sheet.getDataRange().getValues();
  const displayValues = sheet.getDataRange().getDisplayValues();
  const rows = [];
  for (let i = 1; i < values.length; i++) {
    const key = values[i][0] ? String(values[i][0]).trim() : "";
    if (!key) continue;
    rows.push({
      rowIndex: i + 1,
      snapshotKey: key,
      tanggal: toDmy(displayValues[i] ? displayValues[i][1] : values[i][1]),
      idPegawai: String(values[i][2] || "").trim(),
      nama: String(values[i][3] || "").trim(),
      idJadwal: String(values[i][4] || "").trim(),
      outlet: String(values[i][5] || "").trim(),
      posisiPermanen: String(values[i][6] || "").trim(),
      posisiPenugasan: String(values[i][7] || "").trim(),
      jamMasukEfektif: parseSheetTime(displayValues[i] ? displayValues[i][8] : values[i][8]),
      jamPulangEfektif: parseSheetTime(displayValues[i] ? displayValues[i][9] : values[i][9]),
      jenisPenugasan: String(values[i][10] || "NORMAL").trim(),
      sumberJadwal: String(values[i][11] || "DATA_POSISI").trim(),
      waktuDatang: parseSheetTime(displayValues[i] ? displayValues[i][12] : values[i][12])
    });
  }
  return rows;
}

function employeeMatches(rowId, rowName, targetEmp) {
  if (!targetEmp) return false;
  if (targetEmp.idPegawai && rowId) {
    return String(rowId).trim().toLowerCase() === String(targetEmp.idPegawai).trim().toLowerCase();
  }
  return normalizeTextKey(rowName) === normalizeTextKey(targetEmp.nama);
}

function buildAssignmentContext(ss, targetDateInput) {
  const s = ss || getSpreadsheet();
  return {
    ss: s,
    employees: getActiveEmployeesSafe(s),
    positionsMap: getPositionsMap(s),
    penempatanRows: readAllPenempatanRows(s),
    jadwalRows: readAllJadwalHarianRows(s),
    absenceRows: readAllKetidakhadiranRows(s),
    outlets: getOutlets()
  };
}

function findEmployeeInList(employees, idOrName, fallbackName) {
  const qId = String(idOrName || "").trim();
  const qFallback = String(fallbackName || "").trim();
  if (qId) {
    const byId = employees.find(function(e) { return e.idPegawai && e.idPegawai.toLowerCase() === qId.toLowerCase(); });
    if (byId) return byId;
  }
  const byName = employees.find(function(e) { return normalizeTextKey(e.nama) === normalizeTextKey(qId || qFallback); });
  if (byName) return byName;
  if (qFallback) {
    const byFb = employees.find(function(e) { return normalizeTextKey(e.nama) === normalizeTextKey(qFallback); });
    if (byFb) return byFb;
  }
  return null;
}

function getEffectivePlacementForDate(emp, targetYmd, penempatanRows) {
  const matches = penempatanRows.filter(function(p) {
    if (p.status !== "AKTIF") return false;
    if (!employeeMatches(p.idPegawai, p.nama, emp)) return false;
    const startOk = !p.tanggalMulai || p.tanggalMulai <= targetYmd;
    const endOk = !p.tanggalAkhir || p.tanggalAkhir >= targetYmd;
    return startOk && endOk;
  });
  if (matches.length === 0) return null;
  matches.sort(function(a, b) {
    if (a.tanggalMulai !== b.tanggalMulai) return a.tanggalMulai > b.tanggalMulai ? -1 : 1;
    return (b.rowIndex || 0) - (a.rowIndex || 0);
  });
  return matches[0];
}

/**
 * FUNGSI RESOLVER TERPUSAT
 * Prioritas:
 * 1. JadwalHarian (DIJADWALKAN / LIBUR) untuk pegawai & tanggal terkait
 * 2. DataPenempatan yang berlaku pada tanggal tersebut
 * 3. Fallback DataPosisi jika konfigurasi existing mengizinkan
 */
function getEffectiveWorkAssignment(employeeIdOrName, dateInput, ctx) {
  const ss = (ctx && ctx.ss) ? ctx.ss : getSpreadsheet();
  const context = ctx || buildAssignmentContext(ss, dateInput);
  const targetDmy = toDmy(dateInput) || getJakartaDateStr();
  const targetYmd = toYmd(targetDmy);
  const dayCode = getDayCodeFromYmd(targetYmd);

  const emp = findEmployeeInList(context.employees, employeeIdOrName, ctx && ctx.fallbackName) || {
    idPegawai: "",
    nama: String(employeeIdOrName || (ctx && ctx.fallbackName) || "").trim(),
    missingId: true,
    duplicateName: false
  };

  const placement = getEffectivePlacementForDate(emp, targetYmd, context.penempatanRows);
  const permanentPos = placement ? placement.posisi : "";
  const permanentOutlet = placement ? placement.outlet : "";
  const defaultWorkDays = placement ? placement.hariKerja : DEFAULT_WORK_DAYS.slice();

  const getPosTimes = function(posName) {
    const key = normalizeTextKey(posName);
    const cfg = key && context.positionsMap[key] ? context.positionsMap[key] : null;
    return {
      jamMasuk: cfg ? cfg.jamMasuk : "08:00",
      jamPulang: cfg ? cfg.jamPulang : "20:00"
    };
  };

  // Priority 1: JadwalHarian aktif pada tanggal target
  const activeSchedules = context.jadwalRows.filter(function(j) {
    return j.tanggal === targetDmy &&
      j.statusJadwal !== "DIBATALKAN" &&
      employeeMatches(j.idPegawai, j.nama, emp);
  });

  const scheduledOnes = activeSchedules.filter(function(j) { return j.statusJadwal === "DIJADWALKAN"; });
  if (scheduledOnes.length > 0) {
    // Jika ada lebih dari satu shift non-overlapping dan ctx meminta outlet tertentu, prioritaskan yang cocok
    let chosen = scheduledOnes[0];
    if (ctx && ctx.preferredOutlet) {
      const prefKey = normalizeOutletKey(ctx.preferredOutlet);
      const foundPref = scheduledOnes.find(function(j) { return normalizeOutletKey(j.outlet) === prefKey; });
      if (foundPref) chosen = foundPref;
    }
    const posTimes = getPosTimes(chosen.posisiPenugasan || permanentPos);
    return {
      idPegawai: emp.idPegawai || chosen.idPegawai || "",
      nama: emp.nama || chosen.nama,
      outletEfektif: chosen.outlet || permanentOutlet,
      posisiPermanen: permanentPos,
      posisiPenugasan: chosen.posisiPenugasan || permanentPos,
      jamMasukEfektif: (chosen.jamMasuk && chosen.jamMasuk !== "-") ? chosen.jamMasuk : (placement && placement.jamMasuk ? placement.jamMasuk : posTimes.jamMasuk),
      jamPulangEfektif: (chosen.jamPulang && chosen.jamPulang !== "-") ? chosen.jamPulang : (placement && placement.jamPulang ? placement.jamPulang : posTimes.jamPulang),
      jenisPenugasan: chosen.jenisPenugasan || "NORMAL",
      statusJadwal: "DIJADWALKAN",
      hariKerja: defaultWorkDays,
      sumberJadwal: "JADWAL_HARIAN",
      idJadwal: chosen.idJadwal,
      hasPlacement: !!placement,
      isWorkDay: true,
      multipleSchedules: scheduledOnes.length > 1,
      allSchedulesToday: scheduledOnes
    };
  }

  const liburJadwal = activeSchedules.find(function(j) { return j.statusJadwal === "LIBUR"; });
  if (liburJadwal) {
    const posTimes = getPosTimes(permanentPos);
    return {
      idPegawai: emp.idPegawai || liburJadwal.idPegawai || "",
      nama: emp.nama || liburJadwal.nama,
      outletEfektif: liburJadwal.outlet || permanentOutlet,
      posisiPermanen: permanentPos,
      posisiPenugasan: liburJadwal.posisiPenugasan || permanentPos,
      jamMasukEfektif: placement && placement.jamMasuk ? placement.jamMasuk : posTimes.jamMasuk,
      jamPulangEfektif: placement && placement.jamPulang ? placement.jamPulang : posTimes.jamPulang,
      jenisPenugasan: liburJadwal.jenisPenugasan || "NORMAL",
      statusJadwal: "LIBUR",
      hariKerja: defaultWorkDays,
      sumberJadwal: "JADWAL_HARIAN",
      idJadwal: liburJadwal.idJadwal,
      hasPlacement: !!placement,
      isWorkDay: false,
      multipleSchedules: false,
      allSchedulesToday: []
    };
  }

  // Priority 2: DataPenempatan yang berlaku pada tanggal target
  if (placement) {
    const posTimes = getPosTimes(placement.posisi);
    const isWorkDay = placement.hariKerja.indexOf(dayCode) !== -1;
    return {
      idPegawai: emp.idPegawai || placement.idPegawai || "",
      nama: emp.nama || placement.nama,
      outletEfektif: placement.outlet,
      posisiPermanen: placement.posisi,
      posisiPenugasan: placement.posisi,
      jamMasukEfektif: placement.jamMasuk || posTimes.jamMasuk,
      jamPulangEfektif: placement.jamPulang || posTimes.jamPulang,
      jenisPenugasan: "NORMAL",
      statusJadwal: isWorkDay ? "DIJADWALKAN" : "LIBUR",
      hariKerja: placement.hariKerja,
      sumberJadwal: "DATA_PENEMPATAN",
      idJadwal: "",
      hasPlacement: true,
      isWorkDay: isWorkDay,
      multipleSchedules: false,
      allSchedulesToday: []
    };
  }

  // Priority 3: Fallback DataPosisi
  const fallbackPos = (ctx && ctx.fallbackPosisi) ? String(ctx.fallbackPosisi).trim() : "";
  const fbTimes = getPosTimes(fallbackPos);
  const isWorkDayFb = DEFAULT_WORK_DAYS.indexOf(dayCode) !== -1;
  return {
    idPegawai: emp.idPegawai || "",
    nama: emp.nama,
    outletEfektif: "",
    posisiPermanen: "",
    posisiPenugasan: fallbackPos,
    jamMasukEfektif: fbTimes.jamMasuk,
    jamPulangEfektif: fbTimes.jamPulang,
    jenisPenugasan: "NORMAL",
    statusJadwal: isWorkDayFb ? "DIJADWALKAN" : "LIBUR",
    hariKerja: DEFAULT_WORK_DAYS.slice(),
    sumberJadwal: "DATA_POSISI",
    idJadwal: "",
    hasPlacement: false,
    isWorkDay: isWorkDayFb,
    multipleSchedules: false,
    allSchedulesToday: []
  };
}

// ==================== SETTINGS & EXISTING MASTER HELPERS ====================

// Baca toleransi telat (menit) dari sheet Settings!B7. Default 30 kalau kosong/tidak valid.
function getToleransiTelat() {
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName("Settings");
  if (!sheet) return 30;
  const val = sheet.getRange("B7").getValue();
  const num = parseInt(val, 10);
  return isNaN(num) ? 30 : num;
}

// Baca status aktif aturan jam masuk/pulang dari sheet Settings!B8. Default true.
function getEnableWorkHours(ss) {
  try {
    const sheet = (ss || getSpreadsheet()).getSheetByName("Settings");
    if (!sheet) return true;
    const val = sheet.getRange("B8").getValue();
    if (val === "" || val === null || val === undefined) return true;
    return val === true || val === "TRUE" || val === "true";
  } catch (e) {
    return true;
  }
}

// Cek apakah jam kerja (masuk/pulang) aktif untuk posisi tertentu
function isPosisiHoursEnabled(posisi, ss) {
  try {
    if (!getEnableWorkHours(ss)) return false;
    const sheet = (ss || getSpreadsheet()).getSheetByName("DataPosisi");
    if (!sheet) return true;
    const values = sheet.getDataRange().getValues();
    const target = (posisi || "").toString().trim().toLowerCase();
    for (let i = 1; i < values.length; i++) {
      const rowPos = (values[i][0] || "").toString().trim().toLowerCase();
      if (rowPos === target) {
        const statusVal = values[i][3];
        if (statusVal === "" || statusVal === null || statusVal === undefined) return true;
        return statusVal === true || statusVal === "TRUE" || statusVal === "true" || statusVal === "ON" || statusVal === "on";
      }
    }
    return true;
  } catch (e) {
    return true;
  }
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
  if (sheet.getMaxRows() < 2) {
    sheet.insertRowAfter(1);
  } else {
    sheet.insertRowBefore(2);
  }
  sheet.getRange(2, 1, 1, rowValues.length).setValues([rowValues]);
}

function uploadImageToDrive(base64Data, filename) {
  if (!base64Data) return "";
  if (typeof base64Data === "string" && (base64Data.indexOf("http://") === 0 || base64Data.indexOf("https://") === 0)) {
    return base64Data;
  }
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

/**
 * Helper untuk membuat URL Google Maps dari koordinat lat, lng atau URL raw.
 * Mengembalikan format "https://maps.google.com/?q=LAT,LNG" jika valid.
 * Mengembalikan "-" jika koordinat kosong, tidak valid, atau (0,0).
 */
function buildLocationUrl(lat, lng, rawUrl) {
  if (rawUrl && typeof rawUrl === "string" && (rawUrl.startsWith("http://") || rawUrl.startsWith("https://"))) {
    return rawUrl;
  }
  if (lat === null || lat === undefined || lat === "" || lng === null || lng === undefined || lng === "") {
    return "-";
  }
  const latitude = Number(lat);
  const longitude = Number(lng);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return "-";
  }

  // Jika koordinat 0, 0 (misal izin atau absen tanpa GPS)
  if (latitude === 0 && longitude === 0) {
    return "-";
  }

  return "https://maps.google.com/?q=" + latitude + "," + longitude;
}

// ==================== PENEMPATAN PERMANEN (DataPenempatan) ====================

function getDataPenempatan() {
  const ss = getSpreadsheet();
  ensureDataPenempatanSheet(ss);
  const ctx = buildAssignmentContext(ss);
  const todayYmd = toYmd(getJakartaDateStr());

  const pegawaiList = ctx.employees.map(function(emp) {
    const activePlacement = getEffectivePlacementForDate(emp, todayYmd, ctx.penempatanRows);
    return {
      idPegawai: emp.idPegawai,
      nama: emp.nama,
      email: emp.email,
      noTelepon: emp.noTelepon,
      tanggalAktif: emp.tanggalAktif,
      status: emp.status,
      missingId: emp.missingId,
      duplicateName: emp.duplicateName,
      hasPlacement: !!activePlacement,
      penempatanAktif: activePlacement
    };
  });

  const allPenempatan = ctx.penempatanRows.filter(function(p) { return p.status === "AKTIF"; });

  return {
    status: "success",
    data: pegawaiList,
    penempatan: allPenempatan,
    outlets: ctx.outlets,
    positions: getSettings().data.positions,
    backendVersion: BACKEND_VERSION
  };
}

function getRiwayatPenempatan(idPegawai, nama) {
  const ss = getSpreadsheet();
  ensureDataPenempatanSheet(ss);
  const ctx = buildAssignmentContext(ss);
  const emp = findEmployeeInList(ctx.employees, idPegawai || nama, nama) || {
    idPegawai: String(idPegawai || "").trim(),
    nama: String(nama || "").trim()
  };

  const history = ctx.penempatanRows.filter(function(p) {
    return employeeMatches(p.idPegawai, p.nama, emp);
  }).sort(function(a, b) {
    if (a.tanggalMulai !== b.tanggalMulai) return a.tanggalMulai > b.tanggalMulai ? -1 : 1;
    return (b.rowIndex || 0) - (a.rowIndex || 0);
  });

  return {
    status: "success",
    data: history,
    pegawai: emp,
    backendVersion: BACKEND_VERSION
  };
}

function savePenempatan(data, ownerToken) {
  const auth = checkOwnerToken(ownerToken);
  if (!auth.ok) {
    return { status: "error", authRequired: true, message: auth.message, backendVersion: BACKEND_VERSION };
  }

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
    const ss = getSpreadsheet();
    const sheet = ensureDataPenempatanSheet(ss);
    const employees = getActiveEmployeesSafe(ss);
    const outlets = getOutlets();
    const positionsMap = getPositionsMap(ss);

    const reqNama = data && data.nama ? String(data.nama).trim() : "";
    const reqId = data && data.idPegawai ? String(data.idPegawai).trim() : "";
    const emp = findEmployeeInList(employees, reqId || reqNama, reqNama);
    if (!emp) {
      return { status: "error", message: "Pegawai tidak ditemukan atau sudah nonaktif di DataPegawai.", backendVersion: BACKEND_VERSION };
    }
    if (emp.duplicateName && !emp.idPegawai && !reqId) {
      return {
        status: "error",
        message: "Nama pegawai \"" + emp.nama + "\" duplikat di DataPegawai dan ID Pegawai kosong. Lengkapi ID Pegawai unik terlebih dahulu.",
        backendVersion: BACKEND_VERSION
      };
    }
    const effectiveId = emp.idPegawai || reqId;

    // Mode nonaktifkan penempatan
    if (data.actionMode === "deactivate" || String(data.status || "").toUpperCase() === "NONAKTIF") {
      const targetRowIdx = parseInt(data.rowIndex, 10);
      if (!targetRowIdx || targetRowIdx < 2) {
        return { status: "error", message: "Baris penempatan yang akan dinonaktifkan tidak valid.", backendVersion: BACKEND_VERSION };
      }
      const closeDate = toYmd(data.tanggalAkhir) || toYmd(getJakartaDateStr());
      const nowTs = getJakartaTimestampStr();
      sheet.getRange(targetRowIdx, 9).setValue(closeDate);
      sheet.getRange(targetRowIdx, 10).setValue("NONAKTIF");
      sheet.getRange(targetRowIdx, 11).setValue(nowTs);
      sheet.getRange(targetRowIdx, 12).setValue(auth.ownerName);
      return { status: "success", message: "Penempatan berhasil dinonaktifkan.", backendVersion: BACKEND_VERSION };
    }

    const outlet = data.outlet ? String(data.outlet).trim() : "";
    const outletValid = outlets.some(function(o) { return normalizeOutletKey(o.nama) === normalizeOutletKey(outlet); });
    if (!outlet || !outletValid) {
      return { status: "error", message: "Outlet \"" + outlet + "\" tidak terdaftar di DataOutlet.", backendVersion: BACKEND_VERSION };
    }

    const posisi = data.posisi ? String(data.posisi).trim() : "";
    const posCfg = positionsMap[normalizeTextKey(posisi)];
    if (!posisi || !posCfg) {
      return { status: "error", message: "Posisi \"" + posisi + "\" tidak terdaftar di DataPosisi.", backendVersion: BACKEND_VERSION };
    }

    const jamMasuk = data.jamMasuk ? String(data.jamMasuk).trim() : posCfg.jamMasuk;
    const jamPulang = data.jamPulang ? String(data.jamPulang).trim() : posCfg.jamPulang;
    if (!isValidHHMM(jamMasuk) || !isValidHHMM(jamPulang)) {
      return { status: "error", message: "Format Jam Masuk dan Jam Pulang harus valid (HH:MM).", backendVersion: BACKEND_VERSION };
    }
    if (jamMasuk === jamPulang) {
      return { status: "error", message: "Jam Pulang tidak boleh sama dengan Jam Masuk.", backendVersion: BACKEND_VERSION };
    }

    const tanggalMulai = toYmd(data.tanggalMulai);
    if (!tanggalMulai || !isValidDateInput(tanggalMulai)) {
      return { status: "error", message: "Tanggal Mulai Berlaku wajib diisi dengan format tanggal yang valid.", backendVersion: BACKEND_VERSION };
    }
    const tanggalAkhir = data.tanggalAkhir ? toYmd(data.tanggalAkhir) : "";
    if (data.tanggalAkhir && (!tanggalAkhir || !isValidDateInput(tanggalAkhir))) {
      return { status: "error", message: "Tanggal Akhir Berlaku tidak valid.", backendVersion: BACKEND_VERSION };
    }
    if (tanggalAkhir && tanggalAkhir < tanggalMulai) {
      return { status: "error", message: "Tanggal Akhir Berlaku tidak boleh lebih awal dari Tanggal Mulai Berlaku.", backendVersion: BACKEND_VERSION };
    }

    const hariKerja = parseWorkDays(data.hariKerja);
    const existingRows = readAllPenempatanRows(ss);
    const nowTs = getJakartaTimestampStr();
    const newEndBound = tanggalAkhir || "9999-12-31";

    // Tutup penempatan aktif sebelumnya yang mulai sebelum tanggalMulai baru & masih terbuka/mencakup tanggalMulai baru,
    // dan validasi agar tidak ada periode tumpang tindih dengan penempatan aktif lain.
    const empActiveRows = existingRows.filter(function(r) {
      return r.status === "AKTIF" && employeeMatches(r.idPegawai, r.nama, { idPegawai: effectiveId, nama: emp.nama });
    });

    const rowsToCloseBeforeNewStart = [];
    for (let i = 0; i < empActiveRows.length; i++) {
      const r = empActiveRows[i];
      const rStart = r.tanggalMulai || "1970-01-01";
      const rEnd = r.tanggalAkhir || "9999-12-31";
      if (rStart < tanggalMulai && rEnd >= tanggalMulai) {
        rowsToCloseBeforeNewStart.push(r);
      } else if (rStart <= newEndBound && tanggalMulai <= rEnd) {
        // Jika sama-sama mulai di tanggal yang persis sama, tolak kecuali Owner memilih ganti di hari yang sama
        if (rStart === tanggalMulai && data.replaceSameStart === true) {
          sheet.getRange(r.rowIndex, 9).setValue(tanggalMulai);
          sheet.getRange(r.rowIndex, 10).setValue("NONAKTIF");
          sheet.getRange(r.rowIndex, 11).setValue(nowTs);
          sheet.getRange(r.rowIndex, 12).setValue(auth.ownerName);
        } else {
          return {
            status: "error",
            message: "Periode penempatan bertabrakan dengan penempatan aktif mulai " + toDmy(rStart) + (r.tanggalAkhir ? (" s.d. " + toDmy(r.tanggalAkhir)) : " (aktif)") + ".",
            backendVersion: BACKEND_VERSION
          };
        }
      }
    }

    // Tutup penempatan lama dengan Tanggal Akhir = 1 hari sebelum Tanggal Mulai baru
    const prevEndDate = addDaysYmd(tanggalMulai, -1);
    rowsToCloseBeforeNewStart.forEach(function(r) {
      sheet.getRange(r.rowIndex, 9).setValue(prevEndDate);
      sheet.getRange(r.rowIndex, 11).setValue(nowTs);
      sheet.getRange(r.rowIndex, 12).setValue(auth.ownerName);
    });

    const matchedOutlet = outlets.find(function(o) { return normalizeOutletKey(o.nama) === normalizeOutletKey(outlet); });
    const canonicalOutlet = matchedOutlet ? matchedOutlet.nama : outlet;

    prependDataRow(sheet, [
      effectiveId,
      emp.nama,
      canonicalOutlet,
      posCfg.name,
      jamMasuk,
      jamPulang,
      JSON.stringify(hariKerja),
      tanggalMulai,
      tanggalAkhir,
      "AKTIF",
      nowTs,
      auth.ownerName
    ]);

    return {
      status: "success",
      message: "Penempatan pegawai " + emp.nama + " berhasil disimpan mulai " + toDmy(tanggalMulai) + ".",
      backendVersion: BACKEND_VERSION
    };
  } catch (err) {
    return { status: "error", message: "Gagal menyimpan penempatan: " + (err.message || err.toString()), backendVersion: BACKEND_VERSION };
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

// ==================== JADWAL DINAMIS, BACKUP & ROTASI (JadwalHarian) ====================

function checkHasDatangOnDate(ss, emp, targetDmy) {
  const sheetData = ss.getSheetByName("Data_Absensi");
  if (!sheetData) return false;
  const values = sheetData.getDataRange().getValues();
  const displayValues = sheetData.getDataRange().getDisplayValues();
  for (let i = 1; i < values.length; i++) {
    const rowTanggal = toDmy(displayValues[i] && displayValues[i][0] ? displayValues[i][0] : values[i][0]);
    if (rowTanggal === targetDmy && normalizeTextKey(values[i][1]) === normalizeTextKey(emp.nama) && values[i][7] !== "IZIN") {
      const jamDatang = parseSheetTime(displayValues[i] ? displayValues[i][4] : values[i][4]);
      if (jamDatang && jamDatang !== "-") return true;
    }
  }
  return false;
}

function buildOutletReadinessAlerts(targetDmy, context, kehadiranRows) {
  const alerts = [];
  const outlets = context.outlets || [];
  const rows = kehadiranRows || [];

  // 1. Cek kelengkapan Admin per outlet
  outlets.forEach(function(out) {
    const outKey = normalizeOutletKey(out.nama);
    const assignedToOutlet = rows.filter(function(r) {
      return normalizeOutletKey(r.outlet) === outKey;
    });

    const activeAdmin = assignedToOutlet.filter(function(r) {
      const posLow = normalizeTextKey(r.posisiPenugasan || r.posisi);
      const isAdminRole = posLow === "admin" || posLow.indexOf("admin") === 0;
      return isAdminRole && (r.statusKehadiran === "HADIR" || r.statusKehadiran === "BELUM ABSEN");
    });

    const absentAdmin = assignedToOutlet.filter(function(r) {
      const posLow = normalizeTextKey(r.posisiPermanen || r.posisi);
      const isAdminRole = posLow === "admin" || posLow.indexOf("admin") === 0;
      return isAdminRole && (r.statusKehadiran === "LIBUR" || r.statusKehadiran === "IZIN" || r.statusKehadiran === "SAKIT" || r.statusKehadiran === "ALPA");
    });

    if (activeAdmin.length === 0) {
      if (absentAdmin.length > 0) {
        alerts.push({
          type: "ADMIN_ABSENT_NO_BACKUP",
          severity: "error",
          outlet: out.nama,
          message: "Outlet " + out.nama + ": Admin utama " + absentAdmin.map(function(a) { return a.nama + " (" + a.statusKehadiran + ")"; }).join(", ") + " — belum ada Admin Backup."
        });
      } else {
        alerts.push({
          type: "NO_ADMIN",
          severity: "warning",
          outlet: out.nama,
          message: "Outlet " + out.nama + " belum memiliki Admin yang dijadwalkan pada tanggal " + targetDmy + "."
        });
      }
    }
  });

  // 2. Cek penugasan ganda pada JadwalHarian aktif
  const schedByEmp = {};
  context.jadwalRows.forEach(function(j) {
    if (j.tanggal === targetDmy && j.statusJadwal === "DIJADWALKAN") {
      const empKey = j.idPegawai ? j.idPegawai.toLowerCase() : normalizeTextKey(j.nama);
      if (!schedByEmp[empKey]) schedByEmp[empKey] = [];
      schedByEmp[empKey].push(j);
    }
  });
  for (var ek in schedByEmp) {
    if (schedByEmp[ek].length > 1) {
      alerts.push({
        type: "DOUBLE_ASSIGNMENT",
        severity: "warning",
        nama: schedByEmp[ek][0].nama,
        message: "Pegawai " + schedByEmp[ek][0].nama + " memiliki " + schedByEmp[ek].length + " penugasan aktif pada tanggal " + targetDmy + "."
      });
    }
  }

  // 3. Cek pegawai belum ada penempatan / jadwal belum diisi & jam kerja tidak lengkap & konflik izin
  rows.forEach(function(r) {
    if (!r.hasPlacement && r.sumberJadwal === "DATA_POSISI") {
      alerts.push({
        type: "NO_SCHEDULE",
        severity: "warning",
        nama: r.nama,
        message: r.nama + " belum memiliki penempatan permanen maupun jadwal harian."
      });
    }
    if (r.statusKehadiran !== "LIBUR" && (!isValidHHMM(r.jamMasukJadwal) || !isValidHHMM(r.jamPulangJadwal))) {
      alerts.push({
        type: "INCOMPLETE_HOURS",
        severity: "warning",
        nama: r.nama,
        outlet: r.outlet,
        message: "Jam kerja " + r.nama + " belum lengkap pada tanggal " + targetDmy + "."
      });
    }
    if (r.hasScheduleConflict) {
      alerts.push({
        type: "SCHEDULE_IZIN_CONFLICT",
        severity: "error",
        nama: r.nama,
        outlet: r.outlet,
        message: "KONFLIK: " + r.nama + " dijadwalkan " + r.jenisPenugasan + " di " + r.outlet + " tetapi berstatus " + r.statusKehadiran + ". Batalkan atau tugaskan pengganti."
      });
    }
  });

  return alerts;
}

function getJadwalHarian(paramTanggal) {
  const ss = getSpreadsheet();
  ensureJadwalHarianSheet(ss);
  ensureDataPenempatanSheet(ss);
  ensureDataKetidakhadiranSheet(ss);

  const targetDmy = toDmy(paramTanggal) || getJakartaDateStr();
  const ctx = buildAssignmentContext(ss, targetDmy);
  const kehadiranRes = computeKehadiranHarianInternal(targetDmy, ctx);

  // Semua baris JadwalHarian pada tanggal ini (termasuk LIBUR & DIBATALKAN untuk audit, plus flag sudahDatang)
  const sheetAbsensi = ss.getSheetByName("Data_Absensi");
  const absensiVals = sheetAbsensi ? sheetAbsensi.getDataRange().getValues() : [];
  const absensiDisp = sheetAbsensi ? sheetAbsensi.getDataRange().getDisplayValues() : [];
  const datangMap = {};
  for (let i = 1; i < absensiVals.length; i++) {
    const rTgl = toDmy(absensiDisp[i] && absensiDisp[i][0] ? absensiDisp[i][0] : absensiVals[i][0]);
    if (rTgl === targetDmy && absensiVals[i][7] !== "IZIN") {
      const jd = parseSheetTime(absensiDisp[i] ? absensiDisp[i][4] : absensiVals[i][4]);
      if (jd && jd !== "-") {
        datangMap[normalizeTextKey(absensiVals[i][1])] = true;
      }
    }
  }

  const jadwalHariIni = ctx.jadwalRows.filter(function(j) {
    return j.tanggal === targetDmy;
  }).map(function(j) {
    const emp = findEmployeeInList(ctx.employees, j.idPegawai || j.nama, j.nama);
    const placement = emp ? getEffectivePlacementForDate(emp, toYmd(targetDmy), ctx.penempatanRows) : null;
    const absence = ctx.absenceRows.find(function(a) {
      return a.tanggal === targetDmy && employeeMatches(a.idPegawai, a.nama, emp || { idPegawai: j.idPegawai, nama: j.nama });
    });
    return {
      rowIndex: j.rowIndex,
      idJadwal: j.idJadwal,
      tanggal: j.tanggal,
      idPegawai: j.idPegawai || (emp ? emp.idPegawai : ""),
      nama: j.nama,
      outlet: j.outlet,
      posisiPermanen: placement ? placement.posisi : "-",
      posisiPenugasan: j.posisiPenugasan,
      jamMasuk: j.jamMasuk,
      jamPulang: j.jamPulang,
      jenisPenugasan: j.jenisPenugasan,
      statusJadwal: j.statusJadwal,
      catatan: j.catatan,
      dibuatOleh: j.dibuatOleh,
      waktuDibuat: j.waktuDibuat,
      updatedAt: j.updatedAt,
      sudahDatang: !!datangMap[normalizeTextKey(j.nama)],
      hasConflictIzin: !!(j.statusJadwal === "DIJADWALKAN" && absence && (absence.status === "IZIN" || absence.status === "SAKIT"))
    };
  });

  const effectiveByOutlet = kehadiranRes.data;
  const unscheduledEmployees = effectiveByOutlet.filter(function(r) {
    return !r.hasPlacement && r.sumberJadwal === "DATA_POSISI";
  });

  const alerts = buildOutletReadinessAlerts(targetDmy, ctx, effectiveByOutlet);

  return {
    status: "success",
    tanggal: targetDmy,
    jadwal: jadwalHariIni,
    effectiveSchedules: effectiveByOutlet,
    unscheduledEmployees: unscheduledEmployees,
    alerts: alerts,
    outlets: ctx.outlets,
    positions: getSettings().data.positions,
    employees: ctx.employees,
    backendVersion: BACKEND_VERSION
  };
}

function getRiwayatRotasi(nama, outlet, bulan) {
  const ss = getSpreadsheet();
  ensureJadwalHarianSheet(ss);
  const rows = readAllJadwalHarianRows(ss);
  const bulanPrefix = (bulan || "").split("-");
  const mmFilter = bulanPrefix[1] ? ("/" + bulanPrefix[1] + "/" + bulanPrefix[0]) : "";

  const filtered = rows.filter(function(r) {
    if (mmFilter && r.tanggal.indexOf(mmFilter) === -1) return false;
    if (nama && normalizeTextKey(r.nama).indexOf(normalizeTextKey(nama)) === -1) return false;
    if (outlet && normalizeOutletKey(r.outlet) !== normalizeOutletKey(outlet)) return false;
    return true;
  }).sort(function(a, b) {
    if (a.tanggalYmd !== b.tanggalYmd) return a.tanggalYmd > b.tanggalYmd ? -1 : 1;
    return (b.rowIndex || 0) - (a.rowIndex || 0);
  });

  return {
    status: "success",
    data: filtered,
    backendVersion: BACKEND_VERSION
  };
}

function saveJadwalHarian(data, ownerToken) {
  const auth = checkOwnerToken(ownerToken);
  if (!auth.ok) {
    return { status: "error", authRequired: true, message: auth.message, backendVersion: BACKEND_VERSION };
  }

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
    const ss = getSpreadsheet();
    const sheet = ensureJadwalHarianSheet(ss);
    const employees = getActiveEmployeesSafe(ss);
    const outlets = getOutlets();
    const positionsMap = getPositionsMap(ss);

    const emp = findEmployeeInList(employees, data.idPegawai || data.nama, data.nama);
    if (!emp) {
      return { status: "error", message: "Pegawai tidak ditemukan atau nonaktif di DataPegawai.", backendVersion: BACKEND_VERSION };
    }
    if (emp.duplicateName && !emp.idPegawai && !data.idPegawai) {
      return { status: "error", message: "Nama pegawai duplikat & ID Pegawai kosong. Lengkapi ID Pegawai terlebih dahulu.", backendVersion: BACKEND_VERSION };
    }

    const startInput = data.tanggalMulai || data.tanggal;
    const endInput = data.tanggalAkhir || startInput;
    const dateRangeYmd = expandDateRangeYmd(startInput, endInput, 31);
    if (dateRangeYmd.length === 0) {
      return { status: "error", message: "Tanggal atau rentang tanggal tidak valid (maksimal 31 hari).", backendVersion: BACKEND_VERSION };
    }

    const jenisPenugasan = String(data.jenisPenugasan || "NORMAL").trim().toUpperCase();
    if (ALLOWED_ASSIGNMENT_TYPES.indexOf(jenisPenugasan) === -1) {
      return { status: "error", message: "Jenis penugasan tidak valid (NORMAL / BACKUP / ROTASI / PENGGANTI).", backendVersion: BACKEND_VERSION };
    }

    const statusJadwal = String(data.statusJadwal || "DIJADWALKAN").trim().toUpperCase();
    if (ALLOWED_SCHEDULE_STATUSES.indexOf(statusJadwal) === -1) {
      return { status: "error", message: "Status jadwal tidak valid.", backendVersion: BACKEND_VERSION };
    }

    let canonicalOutlet = data.outlet ? String(data.outlet).trim() : "";
    if (statusJadwal === "DIJADWALKAN") {
      const matchedOutlet = outlets.find(function(o) { return normalizeOutletKey(o.nama) === normalizeOutletKey(canonicalOutlet); });
      if (!matchedOutlet) {
        return { status: "error", message: "Outlet \"" + canonicalOutlet + "\" tidak ditemukan di DataOutlet.", backendVersion: BACKEND_VERSION };
      }
      canonicalOutlet = matchedOutlet.nama;
    } else if (canonicalOutlet) {
      const matchedOutlet = outlets.find(function(o) { return normalizeOutletKey(o.nama) === normalizeOutletKey(canonicalOutlet); });
      if (matchedOutlet) canonicalOutlet = matchedOutlet.nama;
    }

    let posisiPenugasan = data.posisiPenugasan ? String(data.posisiPenugasan).trim() : "";
    if (statusJadwal === "DIJADWALKAN") {
      // Validasi posisi berasal dari DataPosisi atau opsi penugasan resmi ("Admin")
      const posCfg = positionsMap[normalizeTextKey(posisiPenugasan)];
      if (posCfg) {
        posisiPenugasan = posCfg.name;
      } else if (normalizeTextKey(posisiPenugasan) === "admin") {
        posisiPenugasan = "Admin";
      } else {
        return { status: "error", message: "Posisi penugasan \"" + posisiPenugasan + "\" tidak valid di DataPosisi.", backendVersion: BACKEND_VERSION };
      }
    }

    let jamMasuk = data.jamMasuk ? String(data.jamMasuk).trim() : "";
    let jamPulang = data.jamPulang ? String(data.jamPulang).trim() : "";
    if (statusJadwal === "DIJADWALKAN") {
      const posCfg = positionsMap[normalizeTextKey(posisiPenugasan)];
      if (!jamMasuk && posCfg) jamMasuk = posCfg.jamMasuk;
      if (!jamPulang && posCfg) jamPulang = posCfg.jamPulang;
      if (!isValidHHMM(jamMasuk) || !isValidHHMM(jamPulang)) {
        return { status: "error", message: "Format Jam Masuk dan Jam Pulang harus HH:MM.", backendVersion: BACKEND_VERSION };
      }
      if (jamMasuk === jamPulang) {
        return { status: "error", message: "Jam Pulang tidak boleh sama dengan Jam Masuk.", backendVersion: BACKEND_VERSION };
      }
    } else {
      jamMasuk = jamMasuk || "-";
      jamPulang = jamPulang || "-";
    }

    const existingJadwal = readAllJadwalHarianRows(ss);
    const existingAbsences = readAllKetidakhadiranRows(ss);
    const nowTs = getJakartaTimestampStr();
    const createdIds = [];
    const warnings = [];

    // Validasi seluruh tanggal sebelum menulis apa pun (atomic validation)
    for (let i = 0; i < dateRangeYmd.length; i++) {
      const dmy = toDmy(dateRangeYmd[i]);
      const activeOnDay = existingJadwal.filter(function(j) {
        return j.tanggal === dmy && j.statusJadwal !== "DIBATALKAN" && employeeMatches(j.idPegawai, j.nama, emp);
      });

      if (statusJadwal === "DIJADWALKAN") {
        for (let k = 0; k < activeOnDay.length; k++) {
          const ex = activeOnDay[k];
          if (ex.statusJadwal === "LIBUR") {
            return {
              status: "error",
              message: emp.nama + " sudah ditandai LIBUR pada " + dmy + ". Batalkan status LIBUR terlebih dahulu atau ubah jadwal tersebut.",
              backendVersion: BACKEND_VERSION
            };
          }
          if (ex.statusJadwal === "DIJADWALKAN") {
            if (!data.allowSplitShift || intervalsOverlap(jamMasuk, jamPulang, ex.jamMasuk, ex.jamPulang)) {
              return {
                status: "error",
                message: "Konflik jadwal: " + emp.nama + " sudah memiliki penugasan aktif di " + ex.outlet + " (" + ex.jamMasuk + "-" + ex.jamPulang + ") pada tanggal " + dmy + ".",
                backendVersion: BACKEND_VERSION
              };
            }
          }
        }
        const abs = existingAbsences.find(function(a) {
          return a.tanggal === dmy && employeeMatches(a.idPegawai, a.nama, emp) && (a.status === "IZIN" || a.status === "SAKIT");
        });
        if (abs && !data.confirmConflictIzin) {
          return {
            status: "error",
            requiresConflictConfirmation: true,
            message: emp.nama + " tercatat " + abs.status + " pada " + dmy + ". Apakah Anda yakin tetap menjadwalkan penugasan?",
            backendVersion: BACKEND_VERSION
          };
        }
        if (abs) {
          warnings.push("Peringatan: " + emp.nama + " memiliki catatan " + abs.status + " pada " + dmy + ".");
        }
      } else if (statusJadwal === "LIBUR") {
        const hasDatang = checkHasDatangOnDate(ss, emp, dmy);
        if (hasDatang && !data.confirmAfterDatang) {
          return {
            status: "error",
            requiresDatangConfirmation: true,
            message: emp.nama + " sudah melakukan absen DATANG pada " + dmy + ". Diperlukan konfirmasi khusus untuk menandai LIBUR.",
            backendVersion: BACKEND_VERSION
          };
        }
        const conflictSched = activeOnDay.find(function(ex) { return ex.statusJadwal === "DIJADWALKAN"; });
        if (conflictSched) {
          return {
            status: "error",
            message: emp.nama + " masih memiliki jadwal aktif " + conflictSched.jenisPenugasan + " di " + conflictSched.outlet + " pada " + dmy + ". Batalkan jadwal tersebut terlebih dahulu.",
            backendVersion: BACKEND_VERSION
          };
        }
      }
    }

    // Tulis baris baru ke JadwalHarian
    dateRangeYmd.forEach(function(ymd, idx) {
      const dmy = toDmy(ymd);
      const idJadwal = "JWL-" + ymd.replace(/-/g, "") + "-" + Utilities.getUuid().slice(0, 6).toUpperCase() + (idx + 1);
      createdIds.push(idJadwal);
      prependDataRow(sheet, [
        idJadwal,
        dmy,
        emp.idPegawai || "",
        emp.nama,
        canonicalOutlet || "-",
        posisiPenugasan || "-",
        jamMasuk,
        jamPulang,
        jenisPenugasan,
        statusJadwal,
        data.catatan ? String(data.catatan).trim() : "",
        auth.ownerName,
        nowTs,
        nowTs
      ]);
    });

    return {
      status: "success",
      message: "Jadwal " + jenisPenugasan + " untuk " + emp.nama + " berhasil disimpan (" + createdIds.length + " hari).",
      createdIds: createdIds,
      warnings: warnings,
      backendVersion: BACKEND_VERSION
    };
  } catch (err) {
    return { status: "error", message: "Gagal menyimpan jadwal harian: " + (err.message || err.toString()), backendVersion: BACKEND_VERSION };
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

function updateJadwalHarian(data, ownerToken) {
  const auth = checkOwnerToken(ownerToken);
  if (!auth.ok) {
    return { status: "error", authRequired: true, message: auth.message, backendVersion: BACKEND_VERSION };
  }

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
    const ss = getSpreadsheet();
    const sheet = ensureJadwalHarianSheet(ss);
    const idJadwal = data && data.idJadwal ? String(data.idJadwal).trim() : "";
    if (!idJadwal) {
      return { status: "error", message: "ID Jadwal wajib disertakan.", backendVersion: BACKEND_VERSION };
    }

    const rows = readAllJadwalHarianRows(ss);
    const target = rows.find(function(r) { return r.idJadwal === idJadwal; });
    if (!target) {
      return { status: "error", message: "Jadwal tidak ditemukan.", backendVersion: BACKEND_VERSION };
    }

    const employees = getActiveEmployeesSafe(ss);
    const emp = findEmployeeInList(employees, target.idPegawai || target.nama, target.nama) || { idPegawai: target.idPegawai, nama: target.nama };
    const hasDatang = checkHasDatangOnDate(ss, emp, target.tanggal);
    if (hasDatang && !data.confirmAfterDatang) {
      return {
        status: "error",
        requiresDatangConfirmation: true,
        message: target.nama + " sudah melakukan absen DATANG pada " + target.tanggal + ". Diperlukan konfirmasi khusus untuk mengubah jadwal (snapshot transaksi tetap terjaga).",
        backendVersion: BACKEND_VERSION
      };
    }

    const outlets = getOutlets();
    const positionsMap = getPositionsMap(ss);

    const nextStatus = String(data.statusJadwal || target.statusJadwal).trim().toUpperCase();
    const nextJenis = String(data.jenisPenugasan || target.jenisPenugasan).trim().toUpperCase();
    if (ALLOWED_SCHEDULE_STATUSES.indexOf(nextStatus) === -1 || ALLOWED_ASSIGNMENT_TYPES.indexOf(nextJenis) === -1) {
      return { status: "error", message: "Status atau jenis penugasan tidak valid.", backendVersion: BACKEND_VERSION };
    }

    let nextOutlet = data.outlet !== undefined ? String(data.outlet).trim() : target.outlet;
    if (nextStatus === "DIJADWALKAN") {
      const mOut = outlets.find(function(o) { return normalizeOutletKey(o.nama) === normalizeOutletKey(nextOutlet); });
      if (!mOut) return { status: "error", message: "Outlet tidak terdaftar di DataOutlet.", backendVersion: BACKEND_VERSION };
      nextOutlet = mOut.nama;
    }

    let nextPosisi = data.posisiPenugasan !== undefined ? String(data.posisiPenugasan).trim() : target.posisiPenugasan;
    if (nextStatus === "DIJADWALKAN") {
      const pCfg = positionsMap[normalizeTextKey(nextPosisi)];
      if (pCfg) nextPosisi = pCfg.name;
      else if (normalizeTextKey(nextPosisi) === "admin") nextPosisi = "Admin";
      else return { status: "error", message: "Posisi penugasan tidak valid.", backendVersion: BACKEND_VERSION };
    }

    const nextJamMasuk = data.jamMasuk !== undefined ? String(data.jamMasuk).trim() : target.jamMasuk;
    const nextJamPulang = data.jamPulang !== undefined ? String(data.jamPulang).trim() : target.jamPulang;
    if (nextStatus === "DIJADWALKAN") {
      if (!isValidHHMM(nextJamMasuk) || !isValidHHMM(nextJamPulang) || nextJamMasuk === nextJamPulang) {
        return { status: "error", message: "Jam Masuk dan Jam Pulang harus valid (HH:MM) dan tidak boleh sama.", backendVersion: BACKEND_VERSION };
      }
      // Validasi bentrok dengan jadwal lain milik pegawai yang sama pada tanggal yang sama
      const otherConflict = rows.find(function(r) {
        return r.idJadwal !== idJadwal &&
          r.tanggal === target.tanggal &&
          r.statusJadwal === "DIJADWALKAN" &&
          employeeMatches(r.idPegawai, r.nama, emp) &&
          intervalsOverlap(nextJamMasuk, nextJamPulang, r.jamMasuk, r.jamPulang);
      });
      if (otherConflict) {
        return {
          status: "error",
          message: "Jadwal bentrok dengan penugasan lain di " + otherConflict.outlet + " (" + otherConflict.jamMasuk + "-" + otherConflict.jamPulang + ").",
          backendVersion: BACKEND_VERSION
        };
      }
    }

    const nowTs = getJakartaTimestampStr();
    sheet.getRange(target.rowIndex, 5).setValue(nextOutlet);
    sheet.getRange(target.rowIndex, 6).setValue(nextPosisi);
    sheet.getRange(target.rowIndex, 7).setValue(nextJamMasuk);
    sheet.getRange(target.rowIndex, 8).setValue(nextJamPulang);
    sheet.getRange(target.rowIndex, 9).setValue(nextJenis);
    sheet.getRange(target.rowIndex, 10).setValue(nextStatus);
    if (data.catatan !== undefined) sheet.getRange(target.rowIndex, 11).setValue(String(data.catatan).trim());
    sheet.getRange(target.rowIndex, 14).setValue(nowTs);

    return {
      status: "success",
      message: "Jadwal harian " + idJadwal + " berhasil diperbarui.",
      backendVersion: BACKEND_VERSION
    };
  } catch (err) {
    return { status: "error", message: "Gagal memperbarui jadwal: " + (err.message || err.toString()), backendVersion: BACKEND_VERSION };
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

function cancelJadwalHarian(data, ownerToken) {
  const auth = checkOwnerToken(ownerToken);
  if (!auth.ok) {
    return { status: "error", authRequired: true, message: auth.message, backendVersion: BACKEND_VERSION };
  }

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
    const ss = getSpreadsheet();
    const sheet = ensureJadwalHarianSheet(ss);
    const idJadwal = data && data.idJadwal ? String(data.idJadwal).trim() : "";
    if (!idJadwal) return { status: "error", message: "ID Jadwal wajib diisi.", backendVersion: BACKEND_VERSION };

    const rows = readAllJadwalHarianRows(ss);
    const target = rows.find(function(r) { return r.idJadwal === idJadwal; });
    if (!target) return { status: "error", message: "Jadwal tidak ditemukan.", backendVersion: BACKEND_VERSION };

    const employees = getActiveEmployeesSafe(ss);
    const emp = findEmployeeInList(employees, target.idPegawai || target.nama, target.nama) || { idPegawai: target.idPegawai, nama: target.nama };
    const hasDatang = checkHasDatangOnDate(ss, emp, target.tanggal);
    if (hasDatang && !data.confirmAfterDatang) {
      return {
        status: "error",
        requiresDatangConfirmation: true,
        message: target.nama + " sudah absen DATANG pada " + target.tanggal + ". Diperlukan konfirmasi khusus untuk membatalkan jadwal.",
        backendVersion: BACKEND_VERSION
      };
    }

    const nowTs = getJakartaTimestampStr();
    sheet.getRange(target.rowIndex, 10).setValue("DIBATALKAN");
    if (data.alasan) {
      const oldNote = target.catatan ? (target.catatan + " | ") : "";
      sheet.getRange(target.rowIndex, 11).setValue(oldNote + "Dibatalkan oleh " + auth.ownerName + ": " + String(data.alasan).trim());
    }
    sheet.getRange(target.rowIndex, 14).setValue(nowTs);

    return {
      status: "success",
      message: "Jadwal " + idJadwal + " berhasil dibatalkan.",
      backendVersion: BACKEND_VERSION
    };
  } catch (err) {
    return { status: "error", message: "Gagal membatalkan jadwal: " + (err.message || err.toString()), backendVersion: BACKEND_VERSION };
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

// ==================== KETIDAKHADIRAN & KEHADIRAN HARIAN ====================

function getKetidakhadiran(paramTanggal, paramBulan, paramNama, paramOutlet) {
  const ss = getSpreadsheet();
  ensureDataKetidakhadiranSheet(ss);
  const rows = readAllKetidakhadiranRows(ss);
  const targetDmy = paramTanggal ? toDmy(paramTanggal) : "";
  const bulanPrefix = (paramBulan || "").split("-");
  const mmFilter = bulanPrefix[1] ? ("/" + bulanPrefix[1] + "/" + bulanPrefix[0]) : "";

  const filtered = rows.filter(function(r) {
    if (targetDmy && r.tanggal !== targetDmy) return false;
    if (mmFilter && r.tanggal.indexOf(mmFilter) === -1) return false;
    if (paramNama && normalizeTextKey(r.nama).indexOf(normalizeTextKey(paramNama)) === -1) return false;
    if (paramOutlet && normalizeOutletKey(r.outlet) !== normalizeOutletKey(paramOutlet)) return false;
    return true;
  });

  return {
    status: "success",
    data: filtered,
    backendVersion: BACKEND_VERSION
  };
}

function saveKetidakhadiran(data, ownerToken) {
  const auth = checkOwnerToken(ownerToken);
  if (!auth.ok) {
    return { status: "error", authRequired: true, message: auth.message, backendVersion: BACKEND_VERSION };
  }

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
    const ss = getSpreadsheet();
    const sheet = ensureDataKetidakhadiranSheet(ss);
    const employees = getActiveEmployeesSafe(ss);

    const emp = findEmployeeInList(employees, data.idPegawai || data.nama, data.nama);
    if (!emp) {
      return { status: "error", message: "Nama pegawai tidak ditemukan atau nonaktif di DataPegawai.", backendVersion: BACKEND_VERSION };
    }
    if (emp.duplicateName && !emp.idPegawai && !data.idPegawai) {
      return { status: "error", message: "Nama pegawai duplikat & ID Pegawai kosong. Selesaikan identitas di DataPegawai terlebih dahulu.", backendVersion: BACKEND_VERSION };
    }

    const tanggalDmy = toDmy(data.tanggal);
    if (!tanggalDmy || !isValidDateInput(tanggalDmy)) {
      return { status: "error", message: "Tanggal wajib valid.", backendVersion: BACKEND_VERSION };
    }

    const status = String(data.status || "").trim().toUpperCase();
    if (ALLOWED_ABSENCE_STATUSES.indexOf(status) === -1) {
      return { status: "error", message: "Status harus salah satu dari LIBUR, IZIN, SAKIT, atau ALPA.", backendVersion: BACKEND_VERSION };
    }

    const alasan = data.alasan ? String(data.alasan).trim() : "";
    if ((status === "IZIN" || status === "SAKIT" || status === "ALPA") && !alasan) {
      return { status: "error", message: "Alasan wajib diisi untuk status " + status + ".", backendVersion: BACKEND_VERSION };
    }

    const existingAbs = readAllKetidakhadiranRows(ss);
    const duplicate = existingAbs.find(function(a) {
      return a.tanggal === tanggalDmy && employeeMatches(a.idPegawai, a.nama, emp);
    });
    if (duplicate) {
      return {
        status: "error",
        message: emp.nama + " sudah memiliki catatan ketidakhadiran aktif (" + duplicate.status + ") pada tanggal " + tanggalDmy + ". Gunakan Edit atau Batalkan catatan lama.",
        backendVersion: BACKEND_VERSION
      };
    }

    const ctx = buildAssignmentContext(ss, tanggalDmy);
    const eff = getEffectiveWorkAssignment(emp.idPegawai || emp.nama, tanggalDmy, ctx);
    const outletStr = data.outlet ? String(data.outlet).trim() : (eff.outletEfektif || "-");
    const posisiStr = data.posisi ? String(data.posisi).trim() : (eff.posisiPenugasan || eff.posisiPermanen || "-");

    let buktiUrl = data.buktiFoto ? String(data.buktiFoto).trim() : "";
    if (!buktiUrl && data.image) {
      const fn = status + "-" + emp.nama.replace(/\s+/g, "-") + "-" + new Date().getTime() + ".jpg";
      buktiUrl = uploadImageToDrive(data.image, fn);
    }

    const nowTs = getJakartaTimestampStr();
    prependDataRow(sheet, [
      tanggalDmy,
      emp.idPegawai || "",
      emp.nama,
      outletStr,
      posisiStr,
      status,
      alasan || (status === "LIBUR" ? "Jadwal Libur" : "-"),
      buktiUrl || "",
      auth.ownerName,
      nowTs,
      data.keterangan ? String(data.keterangan).trim() : "Dicatat Owner"
    ]);

    // Cek apakah pegawai punya jadwal BACKUP / ROTASI aktif pada tanggal tersebut (jangan auto-hapus!)
    let scheduleConflictWarning = "";
    if (status === "IZIN" || status === "SAKIT" || status === "LIBUR") {
      const conflictJadwal = ctx.jadwalRows.find(function(j) {
        return j.tanggal === tanggalDmy &&
          j.statusJadwal === "DIJADWALKAN" &&
          employeeMatches(j.idPegawai, j.nama, emp);
      });
      if (conflictJadwal) {
        scheduleConflictWarning = "PERHATIAN KONFLIK JADWAL: " + emp.nama + " masih terjadwal " + conflictJadwal.jenisPenugasan + " (" + conflictJadwal.posisiPenugasan + ") di " + conflictJadwal.outlet + " pada " + tanggalDmy + ". Silakan batalkan jadwal atau tugaskan Admin Backup secara eksplisit.";
      }
    }

    return {
      status: "success",
      message: "Catatan " + status + " untuk " + emp.nama + " (" + tanggalDmy + ") berhasil disimpan.",
      scheduleConflictWarning: scheduleConflictWarning,
      backendVersion: BACKEND_VERSION
    };
  } catch (err) {
    return { status: "error", message: "Gagal menyimpan ketidakhadiran: " + (err.message || err.toString()), backendVersion: BACKEND_VERSION };
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

function updateKetidakhadiran(data, ownerToken) {
  const auth = checkOwnerToken(ownerToken);
  if (!auth.ok) {
    return { status: "error", authRequired: true, message: auth.message, backendVersion: BACKEND_VERSION };
  }

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
    const ss = getSpreadsheet();
    const sheet = ensureDataKetidakhadiranSheet(ss);
    const employees = getActiveEmployeesSafe(ss);

    const emp = findEmployeeInList(employees, data.idPegawai || data.nama, data.nama);
    if (!emp) return { status: "error", message: "Pegawai tidak ditemukan.", backendVersion: BACKEND_VERSION };

    const tanggalDmy = toDmy(data.tanggal);
    const rows = readAllKetidakhadiranRows(ss);
    const target = rows.find(function(r) {
      if (data.rowIndex && r.rowIndex === parseInt(data.rowIndex, 10)) return true;
      return r.tanggal === tanggalDmy && employeeMatches(r.idPegawai, r.nama, emp);
    });
    if (!target) {
      return { status: "error", message: "Catatan ketidakhadiran tidak ditemukan.", backendVersion: BACKEND_VERSION };
    }

    const nextStatus = String(data.status || target.status).trim().toUpperCase();
    if (ALLOWED_ABSENCE_STATUSES.indexOf(nextStatus) === -1) {
      return { status: "error", message: "Status tidak valid.", backendVersion: BACKEND_VERSION };
    }
    const nextAlasan = data.alasan !== undefined ? String(data.alasan).trim() : target.alasan;
    if ((nextStatus === "IZIN" || nextStatus === "SAKIT" || nextStatus === "ALPA") && !nextAlasan) {
      return { status: "error", message: "Alasan wajib diisi untuk status " + nextStatus + ".", backendVersion: BACKEND_VERSION };
    }

    let nextBukti = data.buktiFoto !== undefined ? String(data.buktiFoto).trim() : target.buktiFoto;
    if (data.image) {
      const fn = nextStatus + "-" + emp.nama.replace(/\s+/g, "-") + "-" + new Date().getTime() + ".jpg";
      nextBukti = uploadImageToDrive(data.image, fn);
    }

    const nowTs = getJakartaTimestampStr();
    sheet.getRange(target.rowIndex, 6).setValue(nextStatus);
    sheet.getRange(target.rowIndex, 7).setValue(nextAlasan || (nextStatus === "LIBUR" ? "Jadwal Libur" : "-"));
    sheet.getRange(target.rowIndex, 8).setValue(nextBukti);
    sheet.getRange(target.rowIndex, 9).setValue(auth.ownerName);
    sheet.getRange(target.rowIndex, 10).setValue(nowTs);
    if (data.keterangan !== undefined) sheet.getRange(target.rowIndex, 11).setValue(String(data.keterangan).trim());

    return {
      status: "success",
      message: "Catatan ketidakhadiran " + emp.nama + " berhasil diperbarui menjadi " + nextStatus + ".",
      backendVersion: BACKEND_VERSION
    };
  } catch (err) {
    return { status: "error", message: "Gagal memperbarui ketidakhadiran: " + (err.message || err.toString()), backendVersion: BACKEND_VERSION };
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

function cancelKetidakhadiran(data, ownerToken) {
  const auth = checkOwnerToken(ownerToken);
  if (!auth.ok) {
    return { status: "error", authRequired: true, message: auth.message, backendVersion: BACKEND_VERSION };
  }

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
    const ss = getSpreadsheet();
    const sheet = ensureDataKetidakhadiranSheet(ss);
    const employees = getActiveEmployeesSafe(ss);
    const tanggalDmy = toDmy(data.tanggal);
    const emp = findEmployeeInList(employees, data.idPegawai || data.nama, data.nama) || {
      idPegawai: String(data.idPegawai || "").trim(),
      nama: String(data.nama || "").trim()
    };

    const rows = readAllKetidakhadiranRows(ss);
    const target = rows.find(function(r) {
      if (data.rowIndex && r.rowIndex === parseInt(data.rowIndex, 10)) return true;
      return r.tanggal === tanggalDmy && employeeMatches(r.idPegawai, r.nama, emp);
    });
    if (!target) {
      return { status: "error", message: "Catatan ketidakhadiran tidak ditemukan.", backendVersion: BACKEND_VERSION };
    }

    // Hapus hanya baris dari DataKetidakhadiran — JANGAN menghapus transaksi asli di Data_Absensi
    sheet.deleteRow(target.rowIndex);

    return {
      status: "success",
      message: "Catatan " + target.status + " untuk " + target.nama + " (" + target.tanggal + ") berhasil dibatalkan.",
      backendVersion: BACKEND_VERSION
    };
  } catch (err) {
    return { status: "error", message: "Gagal membatalkan ketidakhadiran: " + (err.message || err.toString()), backendVersion: BACKEND_VERSION };
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

function closeDailyAttendance(data, ownerToken) {
  const auth = checkOwnerToken(ownerToken);
  if (!auth.ok) {
    return { status: "error", authRequired: true, message: auth.message, backendVersion: BACKEND_VERSION };
  }

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
    const ss = getSpreadsheet();
    const sheet = ensureDataKetidakhadiranSheet(ss);
    const targetDmy = toDmy(data && data.tanggal) || getJakartaDateStr();
    const ctx = buildAssignmentContext(ss, targetDmy);
    const daily = computeKehadiranHarianInternal(targetDmy, ctx);
    const targetNames = (data && Array.isArray(data.targetNames) && data.targetNames.length > 0)
      ? data.targetNames.map(function(n) { return normalizeTextKey(n); })
      : null;

    const alasanDefault = (data && data.alasan && String(data.alasan).trim())
      ? String(data.alasan).trim()
      : "Tidak hadir tanpa keterangan (Tutup pemeriksaan harian Owner)";

    const nowTs = getJakartaTimestampStr();
    const marked = [];

    daily.data.forEach(function(row) {
      if (row.statusKehadiran !== "BELUM ABSEN") return;
      if (targetNames && targetNames.indexOf(normalizeTextKey(row.nama)) === -1) return;

      prependDataRow(sheet, [
        targetDmy,
        row.idPegawai || "",
        row.nama,
        row.outlet || "-",
        row.posisiPenugasan || row.posisi || "-",
        "ALPA",
        alasanDefault,
        "",
        auth.ownerName,
        nowTs,
        "Pemeriksaan harian"
      ]);
      marked.push(row.nama);
    });

    return {
      status: "success",
      message: marked.length > 0
        ? ("Pemeriksaan harian selesai: " + marked.length + " pegawai ditandai ALPA.")
        : "Tidak ada pegawai berstatus BELUM ABSEN yang perlu ditandai ALPA.",
      markedCount: marked.length,
      markedNames: marked,
      backendVersion: BACKEND_VERSION
    };
  } catch (err) {
    return { status: "error", message: "Gagal menutup pemeriksaan harian: " + (err.message || err.toString()), backendVersion: BACKEND_VERSION };
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

function computeKehadiranHarianInternal(targetDmy, ctx) {
  const ss = ctx.ss;
  const sheetAbsensi = ss.getSheetByName("Data_Absensi");
  const absValues = sheetAbsensi ? sheetAbsensi.getDataRange().getValues() : [];
  const absDisplay = sheetAbsensi ? sheetAbsensi.getDataRange().getDisplayValues() : [];

  // Kumpulkan transaksi Data_Absensi pada tanggal target per pegawai
  const txByEmployee = {};
  for (let i = 1; i < absValues.length; i++) {
    const rawVal = absDisplay[i] && absDisplay[i][0] ? absDisplay[i][0] : absValues[i][0];
    const rowDate = toDmy(rawVal);
    if (rowDate !== targetDmy) continue;

    const nama = String(absValues[i][1] || "").trim();
    if (!nama) continue;
    const key = normalizeTextKey(nama);
    const jamDatangParsed = (absDisplay[i] && absDisplay[i][4] && absDisplay[i][4] !== "-")
      ? parseSheetTime(absDisplay[i][4])
      : parseSheetTime(absValues[i][4]);
    const jamPulangParsed = (absDisplay[i] && absDisplay[i][5] && absDisplay[i][5] !== "-")
      ? parseSheetTime(absDisplay[i][5])
      : parseSheetTime(absValues[i][5]);

    const rec = {
      tanggal: rowDate,
      nama: nama,
      posisi: String(absValues[i][2] || "").trim(),
      outlet: String(absValues[i][3] || "").trim(),
      jamDatang: jamDatangParsed,
      jamPulang: jamPulangParsed,
      totalJam: absValues[i][6] || "-",
      statusMasuk: String(absValues[i][7] || "").trim(),
      statusPulang: String(absValues[i][8] || "").trim(),
      lokasiDatang: absValues[i][9] || "",
      lokasiPulang: absValues[i][10] || "",
      fotoDatang: absValues[i][11] || "",
      fotoPulang: absValues[i][12] || "",
      keteranganDatang: absValues[i][13] || "-",
      keteranganPulang: absValues[i][14] || "-"
    };
    if (!txByEmployee[key]) txByEmployee[key] = [];
    txByEmployee[key].push(rec);
  }

  const rows = [];
  const stats = {
    totalPegawaiAktif: ctx.employees.length,
    totalDijadwalkan: 0,
    hadir: 0,
    belumAbsen: 0,
    libur: 0,
    izin: 0,
    sakit: 0,
    alpa: 0,
    telat: 0
  };

  ctx.employees.forEach(function(emp) {
    const eff = getEffectiveWorkAssignment(emp.idPegawai || emp.nama, targetDmy, ctx);
    const empKey = normalizeTextKey(emp.nama);
    const empTxs = txByEmployee[empKey] || [];
    const hadirTxs = empTxs.filter(function(t) { return t.statusMasuk !== "IZIN" && t.jamDatang && t.jamDatang !== "-"; });
    const legacyIzinTx = empTxs.find(function(t) { return t.statusMasuk === "IZIN"; });

    const absenceRec = ctx.absenceRows.find(function(a) {
      return a.tanggal === targetDmy && employeeMatches(a.idPegawai, a.nama, emp);
    }) || null;

    // Deteksi konflik jadwal BACKUP/ROTASI aktif vs catatan IZIN/SAKIT
    const activeJadwal = ctx.jadwalRows.find(function(j) {
      return j.tanggal === targetDmy && j.statusJadwal === "DIJADWALKAN" && employeeMatches(j.idPegawai, j.nama, emp);
    });
    const hasScheduleConflict = !!(
      activeJadwal &&
      ((absenceRec && (absenceRec.status === "IZIN" || absenceRec.status === "SAKIT")) || legacyIzinTx)
    );

    let statusKehadiran = "BELUM ABSEN";
    const primaryTx = hadirTxs[0] || legacyIzinTx || null;

    // Urutan prioritas status harian:
    // 1. Jika ada transaksi HADIR aktual di Data_Absensi (termasuk jika lembur di hari libur): HADIR
    // 2. Jika ada catatan DataKetidakhadiran IZIN / SAKIT (atau legacy Data_Absensi IZIN): IZIN / SAKIT
    // 3. Jika ada jadwal/penempatan LIBUR (dan tidak ada catatan ALPA atau transaksi HADIR): LIBUR
    // 4. Jika ada catatan DataKetidakhadiran LIBUR: LIBUR
    // 5. Jika ada catatan DataKetidakhadiran ALPA: ALPA
    // 6. Jika dijadwalkan bekerja dan belum ada transaksi: BELUM ABSEN
    if (hadirTxs.length > 0) {
      statusKehadiran = "HADIR";
    } else if (absenceRec && (absenceRec.status === "IZIN" || absenceRec.status === "SAKIT")) {
      statusKehadiran = absenceRec.status;
    } else if (legacyIzinTx) {
      statusKehadiran = (legacyIzinTx.keteranganDatang && legacyIzinTx.keteranganDatang.toLowerCase().indexOf("sakit") !== -1) ? "SAKIT" : "IZIN";
    } else if (absenceRec && absenceRec.status === "LIBUR") {
      statusKehadiran = "LIBUR";
    } else if (!eff.isWorkDay || eff.statusJadwal === "LIBUR") {
      statusKehadiran = "LIBUR";
    } else if (absenceRec && absenceRec.status === "ALPA") {
      statusKehadiran = "ALPA";
    } else {
      statusKehadiran = "BELUM ABSEN";
    }

    // Update statistik konsisten
    const isScheduledToWork = (eff.statusJadwal === "DIJADWALKAN" && eff.isWorkDay) || statusKehadiran === "HADIR" || statusKehadiran === "ALPA";
    if (statusKehadiran !== "LIBUR" && isScheduledToWork) {
      stats.totalDijadwalkan += 1;
    }

    if (statusKehadiran === "HADIR") {
      stats.hadir += 1;
      if (hadirTxs.some(function(t) { return t.statusMasuk === "TELAT"; })) {
        stats.telat += 1;
      }
    } else if (statusKehadiran === "IZIN") {
      stats.izin += 1;
    } else if (statusKehadiran === "SAKIT") {
      stats.sakit += 1;
    } else if (statusKehadiran === "LIBUR") {
      stats.libur += 1;
    } else if (statusKehadiran === "ALPA") {
      stats.alpa += 1;
    } else {
      stats.belumAbsen += 1;
    }

    const displayOutlet = (hadirTxs[0] && hadirTxs[0].outlet) || eff.outletEfektif || (absenceRec && absenceRec.outlet) || "-";
    const displayPosisiPenugasan = (hadirTxs[0] && hadirTxs[0].posisi) || eff.posisiPenugasan || (absenceRec && absenceRec.posisi) || "-";

    rows.push({
      idPegawai: emp.idPegawai,
      nama: emp.nama,
      tanggal: targetDmy,
      outlet: displayOutlet,
      posisiPermanen: eff.posisiPermanen || "-",
      posisiPenugasan: displayPosisiPenugasan,
      posisi: displayPosisiPenugasan,
      jamMasukJadwal: eff.jamMasukEfektif,
      jamPulangJadwal: eff.jamPulangEfektif,
      jamDatang: hadirTxs[0] ? hadirTxs[0].jamDatang : "-",
      jamPulang: hadirTxs[0] ? hadirTxs[0].jamPulang : "-",
      totalJam: hadirTxs[0] ? hadirTxs[0].totalJam : "-",
      statusMasuk: hadirTxs[0] ? hadirTxs[0].statusMasuk : (statusKehadiran === "IZIN" || statusKehadiran === "SAKIT" ? statusKehadiran : "-"),
      statusPulang: hadirTxs[0] ? hadirTxs[0].statusPulang : "-",
      statusKehadiran: statusKehadiran,
      jenisPenugasan: eff.jenisPenugasan,
      sumberJadwal: eff.sumberJadwal,
      idJadwal: eff.idJadwal || "",
      lokasiDatang: hadirTxs[0] ? hadirTxs[0].lokasiDatang : "",
      lokasiPulang: hadirTxs[0] ? hadirTxs[0].lokasiPulang : "",
      fotoDatang: (hadirTxs[0] && hadirTxs[0].fotoDatang) || (absenceRec && absenceRec.buktiFoto) || (legacyIzinTx && legacyIzinTx.fotoDatang) || "",
      fotoPulang: hadirTxs[0] ? hadirTxs[0].fotoPulang : "",
      alasan: (absenceRec && absenceRec.alasan) || (primaryTx && primaryTx.keteranganDatang !== "-" ? primaryTx.keteranganDatang : "") || "",
      buktiDokumen: (absenceRec && absenceRec.buktiFoto) || (legacyIzinTx && legacyIzinTx.fotoDatang) || "",
      dicatatOleh: absenceRec ? absenceRec.dicatatOleh : "",
      hasPlacement: eff.hasPlacement,
      missingId: emp.missingId,
      duplicateName: emp.duplicateName,
      hasScheduleConflict: hasScheduleConflict,
      absenceRecord: absenceRec
    });
  });

  return {
    status: "success",
    tanggal: targetDmy,
    data: rows,
    summary: stats,
    backendVersion: BACKEND_VERSION
  };
}

function getKehadiranHarian(paramTanggal) {
  const ss = getSpreadsheet();
  ensureDataPenempatanSheet(ss);
  ensureJadwalHarianSheet(ss);
  ensureDataKetidakhadiranSheet(ss);
  const targetDmy = toDmy(paramTanggal) || getJakartaDateStr();
  const ctx = buildAssignmentContext(ss, targetDmy);
  const res = computeKehadiranHarianInternal(targetDmy, ctx);
  res.alerts = buildOutletReadinessAlerts(targetDmy, ctx, res.data);
  res.outlets = ctx.outlets;
  res.positions = getSettings().data.positions;
  return res;
}

function getPegawaiDetail(nama, idPegawai, paramTanggal) {
  const ss = getSpreadsheet();
  const targetDmy = toDmy(paramTanggal) || getJakartaDateStr();
  const ctx = buildAssignmentContext(ss, targetDmy);
  const emp = findEmployeeInList(ctx.employees, idPegawai || nama, nama);
  if (!emp) {
    return { status: "error", message: "Pegawai tidak ditemukan.", backendVersion: BACKEND_VERSION };
  }
  const assignment = getEffectiveWorkAssignment(emp.idPegawai || emp.nama, targetDmy, ctx);
  const placementHistory = ctx.penempatanRows.filter(function(p) {
    return employeeMatches(p.idPegawai, p.nama, emp);
  });
  const absenceToday = ctx.absenceRows.find(function(a) {
    return a.tanggal === targetDmy && employeeMatches(a.idPegawai, a.nama, emp);
  }) || null;

  return {
    status: "success",
    pegawai: emp,
    tanggal: targetDmy,
    effectiveAssignment: assignment,
    placementHistory: placementHistory,
    absenceToday: absenceToday,
    backendVersion: BACKEND_VERSION
  };
}

// ==================== PROCESS FORM (DATANG / PULANG / IZIN) ====================

function processForm(data) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
    const ss = getSpreadsheet();
    const dateObj = new Date();
    
    // Format Tanggal & Jam berdasarkan timezone bisnis Asia/Jakarta (WIB)
    const tanggalStr = getJakartaDateStr(dateObj);
    const jam = getJakartaTimeStr(dateObj);
    const jamParts = jam.split(":");
    const jamSekarangMenit = (parseInt(jamParts[0], 10) || 0) * 60 + (parseInt(jamParts[1], 10) || 0);
    const minutes = jamSekarangMenit;

    const lat = data.lat !== undefined && data.lat !== null && data.lat !== "" ? Number(data.lat) : (data.latitude ? Number(data.latitude) : null);
    const lng = data.lng !== undefined && data.lng !== null && data.lng !== "" ? Number(data.lng) : (data.longitude ? Number(data.longitude) : null);
    const rawLokasi = data.lokasi || data.lokasiPulang || data.lokasiDatang || "";
    const lokasiUrl = buildLocationUrl(lat, lng, rawLokasi);

    const ctx = buildAssignmentContext(ss, tanggalStr);
    const emp = findEmployeeInList(ctx.employees, data.idPegawai || data.nama, data.nama);
    const empId = emp ? emp.idPegawai : (data.idPegawai || "");
    
    // Handling Izin / Sakit (Master ke DataKetidakhadiran + sinkron AbsenIzin & Data_Absensi anti-duplikat)
    if (data.status === "IZIN" || data.status === "SAKIT") {
      const jenisKeterangan = data.jenisIzin || (data.status === "SAKIT" ? "Sakit" : "Izin");
      const normStatus = jenisKeterangan.toUpperCase().indexOf("SAKIT") !== -1 ? "SAKIT" : "IZIN";
      const filename = jenisKeterangan + "-" + data.nama.replace(/\s+/g, '-') + "-" + new Date().getTime() + ".jpg";
      const imageUrl = uploadImageToDrive(data.image, filename);

      // 1. Sinkronkan ke master DataKetidakhadiran dengan deduplikasi ID Pegawai + Tanggal
      const sheetKet = ensureDataKetidakhadiranSheet(ss);
      const existingKet = readAllKetidakhadiranRows(ss);
      const existingMatch = existingKet.find(function(k) {
        return k.tanggal === tanggalStr && employeeMatches(k.idPegawai, k.nama, emp || { idPegawai: empId, nama: data.nama });
      });

      const effIzin = getEffectiveWorkAssignment(empId || data.nama, tanggalStr, ctx);
      const nowTs = getJakartaTimestampStr(dateObj);
      const refId = "REF-" + toYmd(tanggalStr).replace(/-/g, "") + "-" + (empId || normalizeTextKey(data.nama).replace(/\s+/g, "_"));

      if (existingMatch) {
        sheetKet.getRange(existingMatch.rowIndex, 6).setValue(normStatus);
        sheetKet.getRange(existingMatch.rowIndex, 7).setValue(data.alasan || "-");
        if (imageUrl) sheetKet.getRange(existingMatch.rowIndex, 8).setValue(imageUrl);
        sheetKet.getRange(existingMatch.rowIndex, 9).setValue(data.nama);
        sheetKet.getRange(existingMatch.rowIndex, 10).setValue(nowTs);
        sheetKet.getRange(existingMatch.rowIndex, 11).setValue("Sync Form Pegawai [" + refId + "]");
      } else {
        prependDataRow(sheetKet, [
          tanggalStr,
          empId,
          data.nama,
          effIzin.outletEfektif || "-",
          data.posisi || effIzin.posisiPenugasan || "-",
          normStatus,
          data.alasan || "-",
          imageUrl,
          data.nama,
          nowTs,
          "Sync Form Pegawai [" + refId + "]"
        ]);
      }
      
      // 2. Sheet AbsenIzin: Kolom (A - G)
      const sheetIzin = ss.getSheetByName("AbsenIzin");
      if (sheetIzin) {
        prependDataRow(sheetIzin, [
          tanggalStr, 
          data.nama, 
          data.posisi,
          jenisKeterangan,
          data.alasan,
          jam,
          imageUrl
        ]);
      }
      
      // 3. Data_Absensi: Kolom (A - O) tetap dipertahankan untuk kompatibilitas histori (dengan ref tag di N jika perlu)
      const sheetData = ss.getSheetByName("Data_Absensi");
      const absVals = sheetData.getDataRange().getValues();
      const absDisp = sheetData.getDataRange().getDisplayValues();
      let alreadyHasIzinRow = false;
      for (let i = 1; i < absVals.length; i++) {
        const rTgl = toDmy(absDisp[i] ? absDisp[i][0] : absVals[i][0]);
        if (rTgl === tanggalStr && normalizeTextKey(absVals[i][1]) === normalizeTextKey(data.nama) && absVals[i][7] === "IZIN") {
          alreadyHasIzinRow = true;
          break;
        }
      }
      if (!alreadyHasIzinRow) {
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
      }

      return { status: "success", message: "Data " + jenisKeterangan + " berhasil dicatat.", backendVersion: BACKEND_VERSION };
    }
    
    const sheetData = ss.getSheetByName("Data_Absensi");
    const dataRange = sheetData.getDataRange().getValues();
    const displayRange = sheetData.getDataRange().getDisplayValues();
    let userRowIndex = -1;
    
    if (data.status === "PULANG") {
      // 1. Cari baris hari ini untuk Nama + Outlet yang MASIH TERBUKA (jam pulang belum terisi / "-")
      for (let i = 1; i < dataRange.length; i++) { 
        const rowTanggal = parseSheetDate(dataRange[i][0]);
        const rowJamPulang = parseSheetTime(displayRange[i] ? displayRange[i][5] : dataRange[i][5]);
        if (rowTanggal == tanggalStr && dataRange[i][1] == data.nama && dataRange[i][3] == data.outlet && dataRange[i][7] !== "IZIN" && rowJamPulang === "-") { 
          userRowIndex = i + 1;
          break;
        }
      }
      // 2. Fallback pencarian untuk PULANG jika outlet tidak persis sama (misal ada perbedaan spasi)
      if (userRowIndex === -1) {
        for (let i = 1; i < dataRange.length; i++) {
          const rowTanggal = parseSheetDate(dataRange[i][0]);
          const rowJamPulang = parseSheetTime(displayRange[i] ? displayRange[i][5] : dataRange[i][5]);
          if (rowTanggal == tanggalStr && dataRange[i][1] == data.nama && dataRange[i][7] !== "IZIN" && rowJamPulang === "-") {
            userRowIndex = i + 1;
            break;
          }
        }
      }
    } else {
      for (let i = 1; i < dataRange.length; i++) { 
        const rowTanggal = parseSheetDate(dataRange[i][0]);
        if (rowTanggal == tanggalStr && dataRange[i][1] == data.nama && dataRange[i][3] == data.outlet && dataRange[i][7] !== "IZIN") { 
          userRowIndex = i + 1;
          break;
        }
      }
    }
    
    if (data.status === "DATANG") {
      // Jam Datang ada di Kolom E (index 4)
      const currentJamDatang = parseSheetTime(displayRange[userRowIndex - 1] ? displayRange[userRowIndex - 1][4] : (userRowIndex !== -1 ? dataRange[userRowIndex - 1][4] : "-"));
      if (userRowIndex !== -1 && currentJamDatang !== "-") { 
        return { status: "error", message: "Anda sudah melakukan absen DATANG hari ini.", backendVersion: BACKEND_VERSION };
      }

      // Gunakan resolver jadwal terpusat getEffectiveWorkAssignment()
      const assignmentCtx = Object.assign({}, ctx, { preferredOutlet: data.outlet, fallbackPosisi: data.posisi });
      const effectiveAssign = getEffectiveWorkAssignment(empId || data.nama, tanggalStr, assignmentCtx);

      // Validasi outlet di DataOutlet
      let effectiveOutlet = data.outlet || effectiveAssign.outletEfektif || "";
      if (ctx.outlets && ctx.outlets.length > 0 && effectiveOutlet && effectiveOutlet !== "-") {
        const matchedOut = ctx.outlets.find(function(o) { return normalizeOutletKey(o.nama) === normalizeOutletKey(effectiveOutlet); });
        if (!matchedOut) {
          return { status: "error", message: "Outlet \"" + effectiveOutlet + "\" tidak terdaftar di DataOutlet.", backendVersion: BACKEND_VERSION };
        }
        effectiveOutlet = matchedOut.nama;
      }

      // Tentukan posisi penugasan & jam masuk efektif
      // Jika pegawai memiliki penempatan/jadwal di tanggal ini, gunakan posisi penugasan & jam individual efektifnya
      // kecuali pegawai absen backup manual memilih posisi lain pada form dan belum ada JadwalHarian spesifik.
      let effectivePosisi = data.posisi || effectiveAssign.posisiPenugasan || "";
      let jamMasukEfektif = getJamMasukPosisi(effectivePosisi);
      let jamPulangEfektif = getJamPulangPosisi(effectivePosisi);

      if (effectiveAssign.sumberJadwal === "JADWAL_HARIAN" || effectiveAssign.sumberJadwal === "DATA_PENEMPATAN") {
        // Jika posisi yang dikirim sesuai penugasan aktif (atau tidak disuplai), pakai jam efektif individual
        if (!data.posisi || normalizeTextKey(data.posisi) === normalizeTextKey(effectiveAssign.posisiPenugasan)) {
          effectivePosisi = effectiveAssign.posisiPenugasan || effectivePosisi;
          jamMasukEfektif = effectiveAssign.jamMasukEfektif || jamMasukEfektif;
          jamPulangEfektif = effectiveAssign.jamPulangEfektif || jamPulangEfektif;
        }
      }

      // Cek apakah jam kerja aktif (berdasarkan master toggle Settings!B8 dan status posisi DataPosisi)
      const isHoursActive = isPosisiHoursEnabled(effectivePosisi, ss);

      let statusMasuk = "TEPAT WAKTU";
      if (isHoursActive) {
        const toleransiMenit = getToleransiTelat();
        const jamMasukMenit = timeStrToMinutes(jamMasukEfektif);
        const batasToleransiMenit = jamMasukMenit + toleransiMenit;
        statusMasuk = (minutes <= batasToleransiMenit) ? "TEPAT WAKTU" : "TELAT";
      }

      const filename = "Masuk-" + data.nama.replace(/\s+/g, '-') + "-" + new Date().getTime() + ".jpg";
      const imageUrl = uploadImageToDrive(data.image, filename);
      
      // (A-O) tetap 15 kolom identik tanpa mengubah struktur Data_Absensi
      prependDataRow(sheetData, [
        tanggalStr,      // A
        data.nama,       // B
        effectivePosisi, // C
        effectiveOutlet, // D
        jam,             // E (Jam Datang)
        "-",             // F (Jam Pulang)
        "-",             // G (Total Jam)
        statusMasuk,     // H
        "-",             // I (Status Pulang)
        lokasiUrl,       // J (Lokasi Datang)
        "-",             // K (Lokasi Pulang)
        imageUrl,        // L
        "-",             // M
        data.alasan || "-", // N (Keterangan Datang, mis. alasan telat)
        "-"              // O (Keterangan Pulang, diisi saat PULANG)
      ]);

      // Simpan snapshot penugasan ke SnapshotAbsensi agar PULANG kebal terhadap perubahan jadwal setelah DATANG
      const snapshotSheet = ensureSnapshotAbsensiSheet(ss);
      const snapshotKey = tanggalStr + "|" + normalizeTextKey(data.nama) + "|" + normalizeOutletKey(effectiveOutlet) + "|" + jam;
      prependDataRow(snapshotSheet, [
        snapshotKey,
        tanggalStr,
        empId,
        data.nama,
        effectiveAssign.idJadwal || "",
        effectiveOutlet,
        effectiveAssign.posisiPermanen || effectivePosisi,
        effectivePosisi,
        jamMasukEfektif,
        jamPulangEfektif,
        effectiveAssign.jenisPenugasan || "NORMAL",
        effectiveAssign.sumberJadwal || "DATA_POSISI",
        jam
      ]);
      
      return {
        status: "success",
        message: "Absen DATANG berhasil dicatat.",
        assignmentUsed: {
          outlet: effectiveOutlet,
          posisiPenugasan: effectivePosisi,
          jamMasukEfektif: jamMasukEfektif,
          jamPulangEfektif: jamPulangEfektif,
          sumberJadwal: effectiveAssign.sumberJadwal
        },
        backendVersion: BACKEND_VERSION
      };
      
    } else if (data.status === "PULANG") {
      if (userRowIndex === -1) {
        let sudahPernahPulang = false;
        for (let i = 1; i < dataRange.length; i++) {
          const rowTanggal = parseSheetDate(dataRange[i][0]);
          const rowJamPulang = parseSheetTime(displayRange[i] ? displayRange[i][5] : dataRange[i][5]);
          if (rowTanggal == tanggalStr && dataRange[i][1] == data.nama && dataRange[i][7] !== "IZIN" && rowJamPulang !== "-") {
            sudahPernahPulang = true;
            break;
          }
        }
        if (sudahPernahPulang) {
          return { status: "error", message: "Anda sudah absen PULANG hari ini.", backendVersion: BACKEND_VERSION };
        }
        return { status: "error", message: "Anda belum absen DATANG hari ini.", backendVersion: BACKEND_VERSION };
      }

      // Jam Pulang ada di kolom F (index 5)
      const existingJamPulang = parseSheetTime(displayRange[userRowIndex - 1] ? displayRange[userRowIndex - 1][5] : dataRange[userRowIndex - 1][5]);
      if (existingJamPulang !== "-") { 
        return { status: "error", message: "Anda sudah absen PULANG hari ini.", backendVersion: BACKEND_VERSION };
      }

      // Normalisasi jam datang, posisi & outlet dari baris DATANG terbuka
      var rawFromDisplay = displayRange[userRowIndex - 1] ? displayRange[userRowIndex - 1][4] : null;
      var rawFromSheet = dataRange[userRowIndex - 1][4];
      var rawFromPayload = (data && data.jamDatang) ? data.jamDatang : null;
      var jamDatang = parseSheetTime(rawFromDisplay);
      if (!jamDatang || jamDatang === "-") jamDatang = parseSheetTime(rawFromSheet);
      if (!jamDatang || jamDatang === "-") jamDatang = parseSheetTime(rawFromPayload);

      const rowPosisi = String(dataRange[userRowIndex - 1][2] || data.posisi || "").trim();
      const rowOutlet = String(dataRange[userRowIndex - 1][3] || data.outlet || "").trim();

      // Cari snapshot penugasan saat DATANG di SnapshotAbsensi (WAJIB dipakai agar perubahan JadwalHarian/DataPenempatan setelah DATANG tidak merusak PULANG)
      const snapshotRows = readAllSnapshotRows(ss);
      const expectedKey = tanggalStr + "|" + normalizeTextKey(data.nama) + "|" + normalizeOutletKey(rowOutlet) + "|" + jamDatang;
      let snap = snapshotRows.find(function(s) { return s.snapshotKey === expectedKey; });
      if (!snap) {
        snap = snapshotRows.find(function(s) {
          return s.tanggal === tanggalStr && normalizeTextKey(s.nama) === normalizeTextKey(data.nama) && normalizeOutletKey(s.outlet) === normalizeOutletKey(rowOutlet);
        });
      }

      const posisiReferensiPulang = snap ? (snap.posisiPenugasan || rowPosisi) : rowPosisi;
      let jamPulangJadwal = (snap && snap.jamPulangEfektif && snap.jamPulangEfektif !== "-") ? snap.jamPulangEfektif : "";
      if (!jamPulangJadwal) {
        // Fallback hanya jika transaksi DATANG lama sebelum SnapshotAbsensi ada
        const placementAtDatang = emp ? getEffectivePlacementForDate(emp, toYmd(tanggalStr), ctx.penempatanRows) : null;
        if (placementAtDatang && normalizeTextKey(placementAtDatang.posisi) === normalizeTextKey(posisiReferensiPulang) && placementAtDatang.jamPulang) {
          jamPulangJadwal = placementAtDatang.jamPulang;
        } else {
          jamPulangJadwal = getJamPulangPosisi(posisiReferensiPulang);
        }
      }

      // Validasi Jam Pulang (Enforcement Backend) menggunakan jam pulang dari snapshot saat DATANG
      if (isPosisiHoursEnabled(posisiReferensiPulang, ss)) {
        const jamPulangJadwalMenit = timeStrToMinutes(jamPulangJadwal);
        if (jamSekarangMenit < jamPulangJadwalMenit) {
          return {
            status: "error",
            message: "Belum waktunya absen PULANG. Jam pulang Anda adalah " + jamPulangJadwal + ".",
            backendVersion: BACKEND_VERSION
          };
        }
      }
      
      var totalJamStr = "-";
      var statusPulang = "NORMAL";
      
      if (jamDatang && jamDatang !== "-") {
        var matchDatang = String(jamDatang).match(/^(\d{1,2}):(\d{2})$/);
        if (matchDatang) {
          var jamH = parseInt(matchDatang[1], 10) || 0;
          var jamM = parseInt(matchDatang[2], 10) || 0;
          var totalMins = jamSekarangMenit - (jamH * 60 + jamM);
          if (totalMins < 0) totalMins = 0;
          
          var rH = Math.floor(totalMins / 60);
          var rM = totalMins % 60;
          totalJamStr = rH + "j " + rM + "m";
          
          if (rH >= 13) {
            statusPulang = "LEMBUR";
          }
        }
      }

      var keteranganPulang = data.alasan || "-";

      var filename = "Pulang-" + data.nama.replace(/\s+/g, '-') + "-" + new Date().getTime() + ".jpg";
      var imageUrl = uploadImageToDrive(data.image, filename);
      
      // Update data di baris user (Urutan getRange adalah 1-based indexing)
      sheetData.getRange(userRowIndex, 6).setValue(jam);           // F (Jam Pulang)
      sheetData.getRange(userRowIndex, 7).setValue(totalJamStr);   // G (Total Jam)
      sheetData.getRange(userRowIndex, 9).setValue(statusPulang);  // I (Status Pulang)
      sheetData.getRange(userRowIndex, 11).setValue(lokasiUrl || "-");    // K (Lokasi Pulang)
      sheetData.getRange(userRowIndex, 13).setValue(imageUrl);     // M (Foto Pulang)
      sheetData.getRange(userRowIndex, 15).setValue(keteranganPulang); // O (Keterangan Pulang)
      
      return { status: "success", message: "Absen PULANG berhasil dicatat.", backendVersion: BACKEND_VERSION };
    }
    
    return { status: "error", message: "Status absen tidak valid.", backendVersion: BACKEND_VERSION };
  } catch (err) {
    return {
      status: "error",
      message: "GAS Backend Error: " + (err.message || err.toString()),
      backendVersion: BACKEND_VERSION
    };
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

function getSettings() {
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName("Settings");
  if (!sheet) {
    return { status: "error", message: "Sheet Settings tidak ditemukan" };
  }
  
  // Baca seluruh sel B1:B10 dalam SATU operasi getValues agar cepat (menghemat network roundtrips)
  const settingsValues = sheet.getRange(1, 1, 10, 2).getValues();
  
  // Favicon dari B2 (baris 2, kolom 2 -> index [1][1])
  const faviconUrl = settingsValues[1] ? settingsValues[1][1] : "";
  
  // requireLocation dari B3 (baris 3, kolom 2 -> index [2][1])
  let requireLocation = true;
  const requireLocationVal = settingsValues[2] ? settingsValues[2][1] : "";
  if (requireLocationVal !== "") {
    requireLocation = requireLocationVal === true || requireLocationVal === "TRUE" || requireLocationVal === "true";
  }

  // toleransiTelat dari B7 (baris 7, kolom 2 -> index [6][1])
  const toleransiVal = settingsValues[6] ? parseInt(settingsValues[6][1], 10) : 30;
  const toleransiTelat = isNaN(toleransiVal) ? 30 : toleransiVal;

  // enableWorkHours dari B8 (baris 8, kolom 2 -> index [7][1])
  let enableWorkHours = true;
  const enableWorkHoursVal = settingsValues[7] ? settingsValues[7][1] : "";
  if (enableWorkHoursVal !== "") {
    enableWorkHours = enableWorkHoursVal === true || enableWorkHoursVal === "TRUE" || enableWorkHoursVal === "true";
  }

  // gasUrl dari B9 (baris 9, kolom 2 -> index [8][1])
  const gasUrlVal = settingsValues[8] ? settingsValues[8][1] : "";
  const gasUrl = gasUrlVal ? String(gasUrlVal).trim() : "";

  // Mengambil data posisi
  let positions = [];
  let sheetPosisi = ss.getSheetByName("DataPosisi");
  if (sheetPosisi) {
    const pValues = sheetPosisi.getDataRange().getValues();
    for (let i = 1; i < pValues.length; i++) {
      if (pValues[i][0]) {
        let jamMasuk = parseSheetTime(pValues[i][1]);
        let jamPulang = parseSheetTime(pValues[i][2]);
        let enabledVal = pValues[i][3];
        let enabled = enabledVal === "" || enabledVal === null || enabledVal === undefined || enabledVal === true || enabledVal === "TRUE" || enabledVal === "true" || enabledVal === "ON" || enabledVal === "on";
        positions.push({
          name: pValues[i][0].toString().trim(),
          jamMasuk: (jamMasuk && jamMasuk !== "-") ? jamMasuk : "08:00",
          jamPulang: (jamPulang && jamPulang !== "-") ? jamPulang : "20:00",
          enabled: enabled
        });
      }
    }
  }
  if (!positions || positions.length === 0) {
    positions = [
      { name: "Admin", jamMasuk: "08:00", jamPulang: "20:00", enabled: true },
      { name: "Admin (Training)", jamMasuk: "08:00", jamPulang: "20:00", enabled: true },
      { name: "Pickup", jamMasuk: "14:00", jamPulang: "22:00", enabled: true },
      { name: "Magang", jamMasuk: "08:00", jamPulang: "17:00", enabled: true }
    ];
  }
  
  // Mengambil data outlet langsung dari sheet DataOutlet
  const outlets = getOutlets();

  return { status: "success", data: { favicon: faviconUrl, requireLocation: requireLocation, enableWorkHours: enableWorkHours, outlets: outlets, positions: positions, toleransiTelat: toleransiTelat, toleransi_telat: toleransiTelat, gasUrl: gasUrl } };
}

/**
 * Membaca seluruh data master outlet langsung dari sheet "DataOutlet".
 * Mengembalikan array objek outlet yang dinormalisasi: [{ nama, lat, lng, radius }, ...]
 */
function getOutlets() {
  const ss = getSpreadsheet();
  let sheetOutlet = ss.getSheetByName("DataOutlet");
  if (!sheetOutlet) {
    sheetOutlet = ss.insertSheet("DataOutlet");
    sheetOutlet.getRange(1, 1, 1, 4).setValues([["Nama Outlet", "Latitude", "Longitude", "Toleransi Radius"]]);
    return [];
  }
  
  const outlets = [];
  const values = sheetOutlet.getDataRange().getValues();
  // Baris 1 adalah header: ["Nama Outlet", "Latitude", "Longitude", "Toleransi Radius"]
  for (let i = 1; i < values.length; i++) {
    const rawNama = values[i][0];
    if (rawNama && String(rawNama).trim() !== "") {
      outlets.push({
        nama: String(rawNama).trim(),
        lat: parseFloat(values[i][1]) || 0,
        lng: parseFloat(values[i][2]) || 0,
        radius: parseFloat(values[i][3]) || 150
      });
    }
  }
  return outlets;
}

function saveSettings(data, ownerToken) {
  const auth = checkOwnerToken(ownerToken);
  if (!auth.ok) {
    return { status: "error", authRequired: true, message: auth.message, backendVersion: BACKEND_VERSION };
  }

  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName("Settings");
  if (!sheet) {
    return { status: "error", message: "Sheet Settings tidak ditemukan" };
  }
  
  // Set requireLocation ke B3
  if (data.requireLocation !== undefined) {
    sheet.getRange("B3").setValue(data.requireLocation ? "TRUE" : "FALSE");
  }

  // Set enableWorkHours ke B8
  if (data.enableWorkHours !== undefined) {
    sheet.getRange("B8").setValue(data.enableWorkHours ? "TRUE" : "FALSE");
  }

  // Set toleransi_telat ke A7:B7
  const rawToleransi = data.toleransiTelat !== undefined ? data.toleransiTelat : data.toleransi_telat;
  if (rawToleransi !== undefined) {
    const val = parseInt(rawToleransi, 10);
    const toleransi = isNaN(val) ? 30 : Math.max(0, val);
    sheet.getRange("A7").setValue("toleransi_telat");
    sheet.getRange("B7").setValue(toleransi);
  }

  // Update positions if provided
  if (data.positions && Array.isArray(data.positions)) {
    let sheetPosisi = ss.getSheetByName("DataPosisi");
    if (!sheetPosisi) {
      sheetPosisi = ss.insertSheet("DataPosisi");
    }
    sheetPosisi.getRange(1, 1, 1, 4).setValues([["Nama Posisi", "Jam Masuk", "Jam Pulang", "Status Jam"]]);
    const lastRow = sheetPosisi.getLastRow();
    if (lastRow > 1) {
      sheetPosisi.getRange(2, 1, lastRow - 1, 4).clearContent();
    }
    data.positions.forEach(function(pos, idx) {
      if (pos) {
        let name = typeof pos === 'string' ? pos.trim() : (pos.name || "").trim();
        let jamMasuk = typeof pos === 'object' && pos.jamMasuk ? pos.jamMasuk : "08:00";
        let jamPulang = typeof pos === 'object' && pos.jamPulang ? pos.jamPulang : "20:00";
        let isEnabled = typeof pos === 'object' && pos.enabled !== undefined ? (pos.enabled ? "TRUE" : "FALSE") : "TRUE";
        if (name) {
          sheetPosisi.getRange(idx + 2, 1).setValue(name);
          sheetPosisi.getRange(idx + 2, 2).setValue(jamMasuk);
          sheetPosisi.getRange(idx + 2, 3).setValue(jamPulang);
          sheetPosisi.getRange(idx + 2, 4).setValue(isEnabled);
        }
      }
    });
    sheet.getRange("B4").setValue(JSON.stringify(data.positions));
  }
  
  // Update outlets langsung ke sheet DataOutlet
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
    
    const validOutlets = data.outlets.filter(function(out) {
      return out && out.nama && String(out.nama).trim() !== "";
    });

    if (validOutlets.length > 0) {
      const rows = validOutlets.map(function(out) {
        return [
          String(out.nama).trim(),
          Number(out.lat) || 0,
          Number(out.lng) || 0,
          Number(out.radius) || 150
        ];
      });
      sheetOutlet.getRange(2, 1, rows.length, 4).setValues(rows);
    }
  }
  
  return { status: "success", message: "Pengaturan berhasil disimpan", backendVersion: BACKEND_VERSION };
}

function getPegawai() {
  const ss = getSpreadsheet();
  const safeEmps = getActiveEmployeesSafe(ss);
  const pegawai = safeEmps.map(function(e) { return e.nama; });
  return { status: "success", data: pegawai, backendVersion: BACKEND_VERSION };
}

function getRiwayat(nama) {
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName("Data_Absensi");
  const values = sheet.getDataRange().getValues();
  const displayValues = sheet.getDataRange().getDisplayValues();
  
  const riwayat = [];
  
  // Baris terbaru ada di row 2 (paling atas), jadi loop dari atas ke bawah
  // supaya "riwayat" tetap terurut dari yang terbaru.
  for (let i = 1; i < values.length; i++) {
    if (values[i][1] === nama) {
      const jamDatangParsed = (displayValues[i] && displayValues[i][4] && displayValues[i][4] !== "-") 
        ? parseSheetTime(displayValues[i][4]) 
        : parseSheetTime(values[i][4]);
      const jamPulangParsed = (displayValues[i] && displayValues[i][5] && displayValues[i][5] !== "-") 
        ? parseSheetTime(displayValues[i][5]) 
        : parseSheetTime(values[i][5]);

      riwayat.push({
        tanggal: parseSheetDate(values[i][0]),
        nama: values[i][1],
        posisi: values[i][2],
        outlet: values[i][3],
        jamDatang: jamDatangParsed,
        jamPulang: jamPulangParsed,
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
  return { status: "success", data: riwayat, backendVersion: BACKEND_VERSION };
}

function getRingkasanHarian(paramTanggal) {
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName("Data_Absensi");
  const targetDate = (paramTanggal && String(paramTanggal).trim() !== "")
    ? normalizeDateStr(String(paramTanggal).trim())
    : normalizeDateStr(getJakartaDateStr());

  const ringkasan = [];
  if (sheet) {
    const values = sheet.getDataRange().getValues();
    const displayValues = sheet.getDataRange().getDisplayValues();
    for (let i = 1; i < values.length; i++) {
      const rawVal = displayValues[i] && displayValues[i][0] ? displayValues[i][0] : values[i][0];
      const rowDate = normalizeDateStr(parseSheetDate(rawVal));

      if (rowDate === targetDate) {
        const jamDatangParsed = (displayValues[i] && displayValues[i][4] && displayValues[i][4] !== "-") 
          ? parseSheetTime(displayValues[i][4]) 
          : parseSheetTime(values[i][4]);
        const jamPulangParsed = (displayValues[i] && displayValues[i][5] && displayValues[i][5] !== "-") 
          ? parseSheetTime(displayValues[i][5]) 
          : parseSheetTime(values[i][5]);

        ringkasan.push({
          tanggal: rowDate,
          nama: values[i][1],
          posisi: values[i][2],
          outlet: values[i][3],
          jamDatang: jamDatangParsed,
          jamPulang: jamPulangParsed,
          totalJam: values[i][6],
          statusMasuk: values[i][7],
          statusPulang: values[i][8],
          lokasiDatang: values[i][9],
          lokasiPulang: values[i][10],
          fotoDatang: values[i][11],
          fotoPulang: values[i][12],
          keterangan: values[i][7] === "IZIN" ? "IZIN" : "HADIR",
          alasan: values[i][13] && values[i][13] !== "-" ? values[i][13] : ""
        });
      }
    }
  }

  // Perluasan: sertakan juga status seluruh pegawai aktif (DataPegawai + JadwalHarian + DataPenempatan + DataKetidakhadiran + Data_Absensi)
  const ctx = buildAssignmentContext(ss, targetDate);
  const fullKehadiran = computeKehadiranHarianInternal(targetDmyOrDefault(targetDate), ctx);

  return {
    status: "success",
    data: ringkasan,
    fullList: fullKehadiran.data,
    summary: fullKehadiran.summary,
    tanggal: targetDate,
    backendVersion: BACKEND_VERSION
  };
}

function targetDmyOrDefault(str) {
  return toDmy(str) || getJakartaDateStr();
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
  const displayValues = sheet.getDataRange().getDisplayValues();
  
  const riwayat = [];
  for (let i = 1; i < values.length; i++) {
    const tgl = parseSheetDate(values[i][0]); 
    if (values[i][1] === nama && tgl.includes(mmFilter)) {
      const jamDatangParsed = (displayValues[i] && displayValues[i][4] && displayValues[i][4] !== "-") 
        ? parseSheetTime(displayValues[i][4]) 
        : parseSheetTime(values[i][4]);
      const jamPulangParsed = (displayValues[i] && displayValues[i][5] && displayValues[i][5] !== "-") 
        ? parseSheetTime(displayValues[i][5]) 
        : parseSheetTime(values[i][5]);

      riwayat.push({
        tanggal: tgl,
        nama: values[i][1],
        posisi: values[i][2],
        outlet: values[i][3],
        jamDatang: jamDatangParsed,
        jamPulang: jamPulangParsed,
        totalJam: values[i][6],
        statusMasuk: values[i][7],
        statusPulang: values[i][8],
        lokasiDatang: values[i][9],
        lokasiPulang: values[i][10],
        fotoDatang: values[i][11],
        fotoPulang: values[i][12],
        keterangan: values[i][7] === "IZIN" ? "IZIN" : "HADIR",
        alasan: values[i][13] && values[i][13] !== "-" ? values[i][13] : ""
      });
    }
  }
  
  // Data di sheet sudah terurut dari row 2 (terbaru) ke bawah, sehingga tidak perlu di-reverse
  return { status: "success", data: riwayat, backendVersion: BACKEND_VERSION };
}

/**
 * Robust time formatting helper function to handle Date objects, fractional days, and various string formats.
 * Ensures times are consistently returned in HH:MM format or "-" if invalid/absent.
 */
function parseSheetTime(val) {
  if (val === null || val === undefined || val === "" || val === "-") return "-";
  
  // 1. Date object
  if (val instanceof Date || Object.prototype.toString.call(val) === '[object Date]' || (typeof val === 'object' && typeof val.getHours === 'function')) {
    try {
      const hh = ("0" + val.getHours()).slice(-2);
      const mm = ("0" + val.getMinutes()).slice(-2);
      return hh + ":" + mm;
    } catch (e) {}
  }
  
  // 2. Number: Google Sheets fractional day or epoch timestamp
  if (typeof val === "number" && !isNaN(val)) {
    if (val > 100000000) {
      try {
        const d = new Date(val);
        const hh = ("0" + d.getHours()).slice(-2);
        const mm = ("0" + d.getMinutes()).slice(-2);
        return hh + ":" + mm;
      } catch (e) {}
    }
    let frac = val % 1;
    if (frac < 0) frac += 1;
    let totalSeconds = Math.round(frac * 86400);
    let h = Math.floor(totalSeconds / 3600) % 24;
    let m = Math.floor((totalSeconds % 3600) / 60);
    return ("0" + h).slice(-2) + ":" + ("0" + m).slice(-2);
  }
  
  // 3. String
  const s = String(val).trim();
  if (!s || s === "-" || s === "[object Object]") return "-";
  
  if (s.includes("T") && !isNaN(Date.parse(s))) {
    try {
      const d = new Date(s);
      const hh = ("0" + d.getHours()).slice(-2);
      const mm = ("0" + d.getMinutes()).slice(-2);
      return hh + ":" + mm;
    } catch (e) {}
  }
  
  const match = s.match(/(?:^|\s|T)?(\d{1,2})[:.](\d{2})(?::\d{2})?(?:\s|$)?/);
  if (match) {
    const hh = ("0" + match[1]).slice(-2);
    const mm = ("0" + match[2]).slice(-2);
    return hh + ":" + mm;
  }
  
  return "-";
}

function parseSheetDate(val) {
  if (!val) return "";
  if (val instanceof Date) {
    try {
      return Utilities.formatDate(val, "Asia/Jakarta", "dd/MM/yyyy");
    } catch (e) {
      const day = ("0" + val.getDate()).slice(-2);
      const month = ("0" + (val.getMonth() + 1)).slice(-2);
      const year = val.getFullYear();
      return day + "/" + month + "/" + year;
    }
  }
  
  const str = String(val).trim();
  if (str === "-") return "-";
  
  // Handle ISO string format "YYYY-MM-DDTHH:mm:ss..."
  if (str.includes("T")) {
    try {
      const d = new Date(str);
      if (!isNaN(d.getTime())) {
        return Utilities.formatDate(d, "Asia/Jakarta", "dd/MM/yyyy");
      }
    } catch (e) {}
  }
  
  // Handle "YYYY-MM-DD" or "YYYY/MM/DD" format
  const ymd = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (ymd) {
    return ("0" + ymd[3]).slice(-2) + "/" + ("0" + ymd[2]).slice(-2) + "/" + ymd[1];
  }

  // Handle "DD-MM-YYYY" or "DD/MM/YYYY" format
  const dmy = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})/);
  if (dmy) {
    const y = dmy[3].length === 2 ? ("20" + dmy[3]) : dmy[3];
    return ("0" + dmy[1]).slice(-2) + "/" + ("0" + dmy[2]).slice(-2) + "/" + y;
  }

  return str;
}

function normalizeDateStr(str) {
  if (!str) return "";
  const s = String(str).trim();
  const ymd = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (ymd) {
    return ("0" + ymd[3]).slice(-2) + "/" + ("0" + ymd[2]).slice(-2) + "/" + ymd[1];
  }
  const dmy = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})/);
  if (dmy) {
    const y = dmy[3].length === 2 ? ("20" + dmy[3]) : dmy[3];
    return ("0" + dmy[1]).slice(-2) + "/" + ("0" + dmy[2]).slice(-2) + "/" + y;
  }
  return s;
}