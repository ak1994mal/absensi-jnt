const BACKEND_VERSION = "2026-11-21-v2.10.0-layered-security";
const FOLDER_INTI_ID = "14Spw44yA0pGTajzildh0egJ-KuqFF7Gq";
const SPREADSHEET_ID = "1f9WVUQSVShJyqRnNgR3MlynCk3znbDQ8qoAWMLb1fWA";
const FOLDER_FOTO_ID = "1mhDtsYrdtdv2nl5dwjax8URSAGKYzatY";

const DEFAULT_WORK_DAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT"];
const ALLOWED_DAY_CODES = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
const ALLOWED_ABSENCE_STATUSES = ["LIBUR", "IZIN", "SAKIT", "ALPA"];
const ALLOWED_ASSIGNMENT_TYPES = ["NORMAL", "BACKUP", "ROTASI", "PENGGANTI"];
const ALLOWED_SCHEDULE_STATUSES = ["DIJADWALKAN", "LIBUR", "DIBATALKAN"];

// Request metadata context populated per HTTP request for audit & rate-limit tracking
let _currentRequestMeta = { deviceId: "", userAgent: "" };

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
      "saveSettingsPostOnly",
      "strictPulangCheck",
      "inclusiveLatenessTolerance",
      "strictOwnerSessionAuth",
      "strictActiveEmployeeFilter",
      "dataPrivacySerializers",
      "dataPenempatan",
      "dataKetidakhadiran",
      "jadwalHarian",
      "snapshotAbsensi",
      "getEffectiveWorkAssignment",
      "koreksiAbsensiManual",
      "auditTrail",
      "splitShiftResolution",
      "softCancelKetidakhadiran",
      "unscheduledExclusionFromAlpa",
      "canonicalMonthlyReport",
      "employeePinAuth",
      "rateLimiting",
      "auditLog",
      "ownerPasswordRotation",
      "ownerSessionManagement"
    ]
  };
}

/**
 * Handle HTTP GET requests (hanya untuk endpoint publik non-sensitif; token tidak pernah diterima via URL query)
 */
function doGet(e) {
  const prevMeta = _currentRequestMeta;
  try {
    const params = (e && e.parameter) ? e.parameter : {};
    _currentRequestMeta = {
      deviceId: String(params.deviceId || params.clientKey || "get_client").slice(0, 80),
      userAgent: String(params.userAgent || "GET").slice(0, 160)
    };

    if (params.ownerToken || params.token) {
      logAudit("doGet:" + (params.action || "-"), "anonymous", _currentRequestMeta.deviceId, _currentRequestMeta.userAgent, "FAILED", { reason: "token_in_url" });
      return ContentService.createTextOutput(JSON.stringify({
        status: 'error',
        authRequired: true,
        message: 'Token sesi tidak diperbolehkan melalui parameter URL (GET). Gunakan metode POST.',
        backendVersion: BACKEND_VERSION
      })).setMimeType(ContentService.MimeType.JSON);
    }

    const action = params.action || "";
    const rl = checkRateLimit(_currentRequestMeta.deviceId || "get_anonymous", "GET_" + (action || "unknown"), 60, 1);
    if (!rl.allowed) {
      logAudit("doGet:" + action, "anonymous", _currentRequestMeta.deviceId, _currentRequestMeta.userAgent, "FAILED", { reason: "rate_limit" });
      return ContentService.createTextOutput(JSON.stringify({
        status: 'error',
        rateLimited: true,
        retryAfterSeconds: rl.retryAfterSeconds,
        message: 'Terlalu banyak permintaan. Coba lagi dalam beberapa detik.',
        backendVersion: BACKEND_VERSION
      })).setMimeType(ContentService.MimeType.JSON);
    }

    let result = {};

    if (action === 'getDeploymentInfo' || action === 'ping') {
      result = getDeploymentInfo();
    } else if (action === 'getOutlets') {
      result = { status: 'success', data: getOutlets(), backendVersion: BACKEND_VERSION };
    } else if (action === 'getSettings') {
      result = getSettings();
    } else if (action === 'employeeVerify') {
      result = employeeVerify(params.employeeToken || "");
    } else if (
      action === 'getPegawai' ||
      action === 'getPegawaiDetail' ||
      action === 'getRiwayat' ||
      action === 'getRiwayatBulan' ||
      action === 'saveSettings' ||
      action === 'verifyOwnerSession' ||
      action === 'getDataPenempatan' ||
      action === 'getRiwayatPenempatan' ||
      action === 'getJadwalHarian' ||
      action === 'getRiwayatRotasi' ||
      action === 'getKehadiranHarian' ||
      action === 'getKetidakhadiran' ||
      action === 'getAbsensiByDate' ||
      action === 'getRingkasanHarian' ||
      action === 'getLaporanBulanan' ||
      action === 'getOwnerSessions' ||
      action === 'getAuditLogs'
    ) {
      logAudit("doGet:" + action, "anonymous", _currentRequestMeta.deviceId, _currentRequestMeta.userAgent, "FAILED", { reason: "auth_required_post_only" });
      result = {
        status: 'error',
        authRequired: true,
        message: 'Endpoint terproteksi wajib menggunakan metode POST dengan token sesi di body.',
        backendVersion: BACKEND_VERSION
      };
    } else {
      result = { status: 'error', message: 'Aksi GET tidak valid', backendVersion: BACKEND_VERSION };
    }

    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: 'Terjadi kesalahan pada server.', backendVersion: BACKEND_VERSION }))
      .setMimeType(ContentService.MimeType.JSON);
  } finally {
    _currentRequestMeta = prevMeta;
  }
}

/**
 * Handle HTTP POST requests
 */
function doPost(e) {
  const prevMeta = _currentRequestMeta;
  try {
    const rawBody = (e && e.postData && e.postData.contents) ? e.postData.contents : "{}";
    const payload = JSON.parse(rawBody);
    const data = (payload && payload.data && typeof payload.data === 'object') ? payload.data : {};
    const action = payload.action;
    const ownerToken = payload.ownerToken || payload.token || data.ownerToken || "";
    const employeeToken = payload.employeeToken || data.employeeToken || "";
    const deviceId = String(payload.deviceId || data.deviceId || "post_client").slice(0, 80);
    const userAgent = String(payload.userAgent || data.userAgent || "POST").slice(0, 160);
    _currentRequestMeta = { deviceId: deviceId, userAgent: userAgent };

    const authTokens = { ownerToken: ownerToken, employeeToken: employeeToken, deviceId: deviceId, userAgent: userAgent };
    let result = {};

    if (action === 'ownerLogin') {
      result = ownerLogin(Object.assign({}, (payload.data || payload), { deviceId: deviceId, userAgent: userAgent }));
    } else if (action === 'ownerLogout') {
      result = ownerLogout(ownerToken);
    } else if (action === 'verifyOwnerSession') {
      result = verifyOwnerSession(ownerToken);
    } else if (action === 'changeOwnerPassword') {
      result = changeOwnerPassword(data, ownerToken);
    } else if (action === 'getOwnerSessions') {
      result = getOwnerSessions(ownerToken);
    } else if (action === 'revokeOwnerSession') {
      result = revokeOwnerSession(data, ownerToken);
    } else if (action === 'getAuditLogs') {
      result = getAuditLogs(data, ownerToken);
    } else if (action === 'employeeLogin') {
      result = employeeLogin(Object.assign({}, (payload.data || payload), { deviceId: deviceId, userAgent: userAgent }));
    } else if (action === 'employeeVerify') {
      result = employeeVerify(employeeToken);
    } else if (action === 'employeeLogout') {
      result = employeeLogout(employeeToken);
    } else if (action === 'setEmployeePin') {
      result = setEmployeePin(data, ownerToken);
    } else if (action === 'getPegawai') {
      result = getPegawai(ownerToken);
    } else if (action === 'getRiwayat') {
      result = getRiwayat(data.nama, authTokens);
    } else if (action === 'getRiwayatBulan') {
      result = getRiwayatBulan(data.nama, data.bulan, authTokens);
    } else if (action === 'processForm') {
      result = processForm(data, authTokens);
    } else if (action === 'saveSettings') {
      result = saveSettings(data, ownerToken);
    } else if (action === 'getDataPenempatan') {
      result = getDataPenempatan(ownerToken);
    } else if (action === 'getRiwayatPenempatan') {
      result = getRiwayatPenempatan(data.idPegawai, data.nama, ownerToken);
    } else if (action === 'getJadwalHarian') {
      result = getJadwalHarian(data.tanggal, ownerToken);
    } else if (action === 'getRiwayatRotasi') {
      result = getRiwayatRotasi(data.nama, data.outlet, data.bulan, ownerToken);
    } else if (action === 'getKehadiranHarian') {
      result = getKehadiranHarian(data.tanggal, ownerToken);
    } else if (action === 'getKetidakhadiran') {
      result = getKetidakhadiran(data.tanggal, data.bulan, data.nama, data.outlet, ownerToken);
    } else if (action === 'getAbsensiByDate') {
      result = getAbsensiByDate(data.tanggal, data.outlet, data.search, ownerToken);
    } else if (action === 'getRingkasanHarian') {
      result = getRingkasanHarian(data.tanggal, ownerToken, employeeToken);
    } else if (action === 'getLaporanBulanan') {
      result = getLaporanBulanan(data.bulan, ownerToken);
    } else if (action === 'getPegawaiDetail') {
      result = getPegawaiDetail(data.nama, data.idPegawai, data.tanggal, authTokens);
    } else if (action === 'savePenempatan') {
      result = savePenempatan(data, ownerToken);
    } else if (action === 'saveJadwalHarian') {
      result = saveJadwalHarian(data, ownerToken);
    } else if (action === 'updateJadwalHarian') {
      result = updateJadwalHarian(data, ownerToken);
    } else if (action === 'cancelJadwalHarian') {
      result = cancelJadwalHarian(data, ownerToken);
    } else if (action === 'saveKetidakhadiran') {
      result = saveKetidakhadiran(data, ownerToken);
    } else if (action === 'updateKetidakhadiran') {
      result = updateKetidakhadiran(data, ownerToken);
    } else if (action === 'cancelKetidakhadiran') {
      result = cancelKetidakhadiran(data, ownerToken);
    } else if (action === 'closeDailyAttendance') {
      result = closeDailyAttendance(data, ownerToken);
    } else if (action === 'updateAbsensi') {
      result = updateAbsensi(data, ownerToken);
    } else if (action === 'deleteAbsensi') {
      result = deleteAbsensi(data, ownerToken);
    } else if (action === 'addManualAbsensi') {
      result = addManualAbsensi(data, ownerToken);
    } else {
      result = { status: 'error', message: 'Aksi POST tidak valid', backendVersion: BACKEND_VERSION };
    }

    const selfLoggedActions = [
      'ownerLogin', 'ownerLogout', 'changeOwnerPassword', 'getOwnerSessions',
      'revokeOwnerSession', 'setEmployeePin', 'employeeLogin', 'employeeLogout',
      'getPegawai', 'getRiwayat', 'getRiwayatBulan', 'getRingkasanHarian',
      'getPegawaiDetail', 'processForm'
    ];
    if (selfLoggedActions.indexOf(action) === -1 && action !== 'getAuditLogs') {
      const actorLabel = ownerToken ? 'Owner' : (employeeToken ? 'Pegawai' : 'anonymous');
      const statusLabel = (result && result.status === 'success') ? 'SUCCESS' : 'FAILED';
      logAudit(action || 'unknown', actorLabel, deviceId, userAgent, statusLabel, {
        message: (result && result.message) ? String(result.message).slice(0, 140) : ''
      });
    }

    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: 'Terjadi kesalahan pada server.', backendVersion: BACKEND_VERSION }))
      .setMimeType(ContentService.MimeType.JSON);
  } finally {
    _currentRequestMeta = prevMeta;
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

function getJakartaIsoTimestampStr(dateObj) {
  const d = dateObj || new Date();
  try {
    return Utilities.formatDate(d, "Asia/Jakarta", "yyyy-MM-dd HH:mm:ss").replace(" ", "T") + "+07:00";
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

// ==================== CRYPTO, RATE LIMITING & AUDIT LOG ====================

function sha256Hex(input) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(input || ""));
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i] < 0 ? bytes[i] + 256 : bytes[i];
    hex += ("0" + b.toString(16)).slice(-2);
  }
  return hex;
}

function hashSecret(secret, saltOptional) {
  const salt = saltOptional || Utilities.getUuid().replace(/-/g, "").slice(0, 16);
  return "sha256$" + salt + "$" + sha256Hex(salt + ":" + String(secret || ""));
}

function verifySecret(candidate, stored) {
  if (!candidate || !stored) return false;
  const s = String(stored).trim();
  const c = String(candidate);
  if (s.indexOf("sha256$") === 0) {
    const parts = s.split("$");
    if (parts.length !== 3 || !parts[1] || !parts[2]) return false;
    return sha256Hex(parts[1] + ":" + c) === parts[2];
  }
  return c === s;
}

function maskTokenPreview(tok) {
  const clean = String(tok || "").trim();
  if (!clean) return "-";
  if (clean.length <= 10) return clean.slice(0, 3) + "****";
  return clean.slice(0, 6) + "****" + clean.slice(-4);
}

function sanitizeAuditDetails(details) {
  if (details === undefined || details === null) return {};
  if (typeof details !== "object") return { value: String(details).slice(0, 200) };
  if (Array.isArray(details)) {
    return details.slice(0, 20).map(sanitizeAuditDetails);
  }
  const out = {};
  const keys = Object.keys(details);
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    if (/password|pin|token|secret|image|base64|foto/i.test(k) && k.indexOf("Prefix") === -1 && k.indexOf("Mask") === -1 && k.indexOf("Count") === -1) {
      out[k] = "[REDACTED]";
    } else {
      const v = details[k];
      out[k] = (v && typeof v === "object") ? sanitizeAuditDetails(v) : v;
    }
  }
  return out;
}

function ensureAuditLogSheet(ss) {
  const targetSs = ss || getSpreadsheet();
  let sheet = targetSs.getSheetByName("AuditLog");
  if (!sheet) {
    sheet = targetSs.insertSheet("AuditLog");
    sheet.getRange(1, 1, 1, 7).setValues([[
      "Timestamp", "Action", "Actor", "IP Address", "UserAgent", "Status", "Details"
    ]]);
  } else if (String(sheet.getRange(1, 1).getValue() || "").trim() !== "Timestamp") {
    sheet.getRange(1, 1, 1, 7).setValues([[
      "Timestamp", "Action", "Actor", "IP Address", "UserAgent", "Status", "Details"
    ]]);
  }
  return sheet;
}

function logAudit(action, actor, ip, userAgent, status, details) {
  try {
    const ss = getSpreadsheet();
    const sheet = ensureAuditLogSheet(ss);
    const meta = _currentRequestMeta || { deviceId: "", userAgent: "" };
    const effectiveIp = String(ip || meta.deviceId || "internal").slice(0, 80);
    const effectiveUa = String(userAgent || meta.userAgent || "GAS").slice(0, 160);
    const ts = getJakartaIsoTimestampStr();
    const statusStr = String(status || "SUCCESS").toUpperCase();
    const safeJson = JSON.stringify(sanitizeAuditDetails(details || {}));
    prependDataRow(sheet, [
      ts,
      String(action || "-"),
      String(actor || "anonymous"),
      effectiveIp,
      effectiveUa,
      statusStr,
      safeJson
    ]);
  } catch (e) {}
}

function checkRateLimit(keyOrIp, action, maxRequests, windowMinutes) {
  const cleanAction = String(action || "default").trim();
  const cleanKey = String(keyOrIp || "anonymous").trim();
  const propKey = "RL_" + sha256Hex(cleanAction + "|" + cleanKey).slice(0, 24);
  const windowMs = Math.max(1, Number(windowMinutes) || 1) * 60 * 1000;
  const maxReq = Math.max(1, Number(maxRequests) || 1);
  const nowMs = new Date().getTime();

  try {
    const props = PropertiesService.getScriptProperties();
    const raw = props.getProperty(propKey);
    let rec = null;
    if (raw) {
      try { rec = JSON.parse(raw); } catch (e) { rec = null; }
    }
    if (!rec || typeof rec.firstRequest !== "number" || (nowMs - rec.firstRequest) >= windowMs) {
      rec = { count: 1, firstRequest: nowMs, windowMs: windowMs };
      props.setProperty(propKey, JSON.stringify(rec));
      return { allowed: true, remaining: maxReq - 1 };
    }
    if (rec.count >= maxReq) {
      const retryAfterSeconds = Math.max(1, Math.ceil((windowMs - (nowMs - rec.firstRequest)) / 1000));
      return { allowed: false, remaining: 0, retryAfterSeconds: retryAfterSeconds };
    }
    rec.count = (Number(rec.count) || 0) + 1;
    props.setProperty(propKey, JSON.stringify(rec));
    return { allowed: true, remaining: Math.max(0, maxReq - rec.count) };
  } catch (e) {
    // Fail-safe allow only if rate-limit store transiently unavailable without opening auth bypass
    return { allowed: true, remaining: maxReq };
  }
}

// ==================== OWNER AUTHENTICATION & SECURITY MANAGEMENT ====================

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
  return "";
}

function ownerLogin(data) {
  const ss = getSpreadsheet();
  const meta = {
    deviceId: (data && data.deviceId) ? String(data.deviceId).slice(0, 80) : (_currentRequestMeta.deviceId || "owner_client"),
    userAgent: (data && data.userAgent) ? String(data.userAgent).slice(0, 160) : (_currentRequestMeta.userAgent || "Browser")
  };

  const rl = checkRateLimit(meta.deviceId, "ownerLogin", 3, 15);
  if (!rl.allowed) {
    logAudit("ownerLogin", "Owner", meta.deviceId, meta.userAgent, "FAILED", { reason: "rate_limit", retryAfterSeconds: rl.retryAfterSeconds });
    return {
      status: "error",
      rateLimited: true,
      retryAfterSeconds: rl.retryAfterSeconds,
      message: "Terlalu banyak percobaan login Owner. Silakan coba lagi dalam " + Math.ceil((rl.retryAfterSeconds || 60) / 60) + " menit.",
      backendVersion: BACKEND_VERSION
    };
  }

  const password = data && data.password ? String(data.password) : "";
  const expected = getConfiguredOwnerPassword(ss);
  if (!expected) {
    logAudit("ownerLogin", "Owner", meta.deviceId, meta.userAgent, "FAILED", { reason: "not_configured" });
    return {
      status: "error",
      notConfigured: true,
      message: "Password Owner belum dikonfigurasi pada server (Settings!B10 atau Script Properties OWNER_PASSWORD).",
      backendVersion: BACKEND_VERSION
    };
  }
  if (!password || !verifySecret(password, expected)) {
    logAudit("ownerLogin", "Owner", meta.deviceId, meta.userAgent, "FAILED", { reason: "invalid_password" });
    return {
      status: "error",
      message: "Password Owner salah!",
      backendVersion: BACKEND_VERSION
    };
  }

  const token = Utilities.getUuid().replace(/-/g, "") + "-" + new Date().getTime().toString(36);
  const ttlSeconds = 21600; // 6 jam di CacheService
  const nowMs = new Date().getTime();
  const expiresAtMs = nowMs + 8 * 3600 * 1000; // 8 jam di ScriptProperties
  const nowIso = getJakartaIsoTimestampStr();
  const sessionObj = {
    tokenId: token.slice(0, 8),
    tokenMask: maskTokenPreview(token),
    ownerName: "Owner",
    issuedAt: nowIso,
    lastUsedAt: nowIso,
    lastUsedMs: nowMs,
    expiresAt: expiresAtMs,
    deviceId: meta.deviceId,
    userAgent: meta.userAgent
  };
  const serializedSession = JSON.stringify(sessionObj);

  let cacheSaved = false;
  let propSaved = false;

  try {
    CacheService.getScriptCache().put("OWNER_TOKEN_" + token, serializedSession, ttlSeconds);
    cacheSaved = true;
  } catch (e) {}

  try {
    const props = PropertiesService.getScriptProperties();
    const allProps = props.getProperties();
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
    props.setProperty("OWNER_TOKEN_" + token, serializedSession);
    propSaved = true;
  } catch (e) {}

  if (!cacheSaved && !propSaved) {
    logAudit("ownerLogin", "Owner", meta.deviceId, meta.userAgent, "FAILED", { reason: "storage_error" });
    return {
      status: "error",
      message: "Gagal menyimpan sesi Owner pada penyimpanan server.",
      backendVersion: BACKEND_VERSION
    };
  }

  logAudit("ownerLogin", "Owner", meta.deviceId, meta.userAgent, "SUCCESS", { sessionId: sessionObj.tokenId });

  return {
    status: "success",
    token: token,
    ownerName: sessionObj.ownerName,
    expiresAt: expiresAtMs,
    backendVersion: BACKEND_VERSION
  };
}

function ownerLogout(token) {
  if (!token || typeof token !== "string" || token.trim() === "") {
    return { status: "error", message: "Token sesi tidak valid.", backendVersion: BACKEND_VERSION };
  }
  const cleanToken = token.trim();
  const key = "OWNER_TOKEN_" + cleanToken;
  let cacheRemoved = false;
  let propRemoved = false;

  try {
    CacheService.getScriptCache().remove(key);
    cacheRemoved = true;
  } catch (e) {}

  try {
    PropertiesService.getScriptProperties().deleteProperty(key);
    propRemoved = true;
  } catch (e) {}

  if (!cacheRemoved || !propRemoved) {
    logAudit("ownerLogout", "Owner", "", "", "FAILED", { sessionMask: maskTokenPreview(cleanToken) });
    return {
      status: "error",
      message: "Gagal mencabut sesi Owner secara penuh dari penyimpanan server.",
      backendVersion: BACKEND_VERSION
    };
  }

  logAudit("ownerLogout", "Owner", "", "", "SUCCESS", { sessionMask: maskTokenPreview(cleanToken) });
  return { status: "success", message: "Logout berhasil", backendVersion: BACKEND_VERSION };
}

function touchOwnerSessionLastUsed(key) {
  try {
    const props = PropertiesService.getScriptProperties();
    const raw = props.getProperty(key);
    if (!raw) return;
    const obj = JSON.parse(raw);
    if (!obj) return;
    const nowMs = new Date().getTime();
    if (obj.lastUsedMs && (nowMs - obj.lastUsedMs) < 30000) return;
    obj.lastUsedMs = nowMs;
    obj.lastUsedAt = getJakartaIsoTimestampStr();
    props.setProperty(key, JSON.stringify(obj));
  } catch (e) {}
}

function checkOwnerToken(token) {
  if (!token || typeof token !== "string") {
    return { ok: false, message: "Autentikasi Owner diperlukan. Silakan login Owner terlebih dahulu." };
  }
  const cleanToken = token.trim();
  if (!cleanToken || cleanToken.length > 200 || /\s/.test(cleanToken)) {
    return { ok: false, message: "Autentikasi Owner diperlukan. Silakan login Owner terlebih dahulu." };
  }
  const key = "OWNER_TOKEN_" + cleanToken;
  const nowMs = new Date().getTime();

  try {
    const cached = CacheService.getScriptCache().get(key);
    if (cached) {
      try {
        const obj = JSON.parse(cached);
        if (obj && typeof obj.expiresAt === "number" && obj.expiresAt >= nowMs) {
          touchOwnerSessionLastUsed(key);
          return { ok: true, ownerName: obj.ownerName || "Owner", sessionId: obj.tokenId || cleanToken.slice(0, 8), tokenMask: maskTokenPreview(cleanToken) };
        }
        try { CacheService.getScriptCache().remove(key); } catch (rmErr) {}
      } catch (parseErr) {
        try { CacheService.getScriptCache().remove(key); } catch (rmErr) {}
      }
    }
  } catch (e) {
    return { ok: false, message: "Gagal memverifikasi sesi Owner. Silakan login ulang." };
  }

  try {
    const props = PropertiesService.getScriptProperties();
    const rawProp = props.getProperty(key);
    if (rawProp) {
      let obj = null;
      try {
        obj = JSON.parse(rawProp);
      } catch (parseErr) {
        try { props.deleteProperty(key); } catch (delErr) {}
        return { ok: false, message: "Sesi Owner tidak valid. Silakan login ulang." };
      }
      if (obj && typeof obj.expiresAt === "number" && obj.expiresAt >= nowMs) {
        try { CacheService.getScriptCache().put(key, rawProp, 21600); } catch (err) {}
        touchOwnerSessionLastUsed(key);
        return { ok: true, ownerName: obj.ownerName || "Owner", sessionId: obj.tokenId || cleanToken.slice(0, 8), tokenMask: maskTokenPreview(cleanToken) };
      } else {
        try { props.deleteProperty(key); } catch (delErr) {}
      }
    }
  } catch (e) {
    return { ok: false, message: "Gagal memverifikasi sesi Owner. Silakan login ulang." };
  }

  return { ok: false, message: "Sesi Owner tidak valid atau sudah berakhir. Silakan login ulang." };
}

function verifyOwnerSession(token) {
  const chk = checkOwnerToken(token);
  if (!chk.ok) {
    return { status: "error", valid: false, authRequired: true, message: chk.message, backendVersion: BACKEND_VERSION };
  }
  return { status: "success", valid: true, ownerName: chk.ownerName, sessionId: chk.sessionId, backendVersion: BACKEND_VERSION };
}

function changeOwnerPassword(data, ownerToken) {
  const auth = checkOwnerToken(ownerToken);
  if (!auth.ok) {
    logAudit("changeOwnerPassword", "anonymous", "", "", "FAILED", { reason: "unauthorized" });
    return { status: "error", authRequired: true, message: auth.message, backendVersion: BACKEND_VERSION };
  }

  const currentPassword = data && data.currentPassword !== undefined ? String(data.currentPassword) : "";
  const newPassword = data && data.newPassword !== undefined ? String(data.newPassword) : "";

  if (!currentPassword || !newPassword) {
    logAudit("changeOwnerPassword", "Owner", "", "", "FAILED", { reason: "missing_fields" });
    return { status: "error", message: "Password saat ini dan password baru wajib diisi.", backendVersion: BACKEND_VERSION };
  }

  if (newPassword.length < 8 || !/[a-zA-Z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
    logAudit("changeOwnerPassword", "Owner", "", "", "FAILED", { reason: "weak_password" });
    return { status: "error", message: "Password baru minimal 8 karakter dan wajib mengandung huruf serta angka.", backendVersion: BACKEND_VERSION };
  }

  const ss = getSpreadsheet();
  const expected = getConfiguredOwnerPassword(ss);
  if (!expected || !verifySecret(currentPassword, expected)) {
    logAudit("changeOwnerPassword", "Owner", "", "", "FAILED", { reason: "wrong_current_password" });
    return { status: "error", message: "Password saat ini salah!", backendVersion: BACKEND_VERSION };
  }

  if (currentPassword === newPassword) {
    logAudit("changeOwnerPassword", "Owner", "", "", "FAILED", { reason: "same_as_current" });
    return { status: "error", message: "Password baru tidak boleh sama dengan password saat ini.", backendVersion: BACKEND_VERSION };
  }

  const props = PropertiesService.getScriptProperties();
  let history = [];
  try {
    const rawHist = props.getProperty("OWNER_PASSWORD_HISTORY");
    if (rawHist) {
      const parsed = JSON.parse(rawHist);
      if (Array.isArray(parsed)) history = parsed;
    }
  } catch (e) { history = []; }

  const recentFive = history.slice(-5);
  for (let i = 0; i < recentFive.length; i++) {
    if (verifySecret(newPassword, recentFive[i])) {
      logAudit("changeOwnerPassword", "Owner", "", "", "FAILED", { reason: "password_history_reuse" });
      return { status: "error", message: "Password baru tidak boleh sama dengan 5 password terakhir.", backendVersion: BACKEND_VERSION };
    }
  }

  const normalizedOldHash = expected.indexOf("sha256$") === 0 ? expected : hashSecret(currentPassword);
  if (recentFive.length === 0) {
    recentFive.push(normalizedOldHash);
  }
  const newHash = hashSecret(newPassword);
  recentFive.push(newHash);
  const trimmedHistory = recentFive.slice(-5);

  try {
    const sSheet = ss.getSheetByName("Settings");
    if (sSheet) {
      sSheet.getRange("A10").setValue("owner_password");
      sSheet.getRange("B10").setValue(newHash);
    }
    props.setProperty("OWNER_PASSWORD", newHash);
    props.setProperty("OWNER_PASSWORD_HISTORY", JSON.stringify(trimmedHistory));
  } catch (e) {
    logAudit("changeOwnerPassword", "Owner", "", "", "FAILED", { reason: "save_error" });
    return { status: "error", message: "Gagal menyimpan password baru di server.", backendVersion: BACKEND_VERSION };
  }

  // Invalidate ALL active Owner sessions
  let invalidatedCount = 0;
  try {
    const cache = CacheService.getScriptCache();
    const allProps = props.getProperties();
    for (var k in allProps) {
      if (k.indexOf("OWNER_TOKEN_") === 0) {
        try { cache.remove(k); } catch (e1) {}
        try { props.deleteProperty(k); } catch (e2) {}
        invalidatedCount++;
      }
    }
  } catch (e) {}

  logAudit("changeOwnerPassword", "Owner", "", "", "SUCCESS", {
    oldPasswordHashPrefix: sha256Hex(normalizedOldHash).slice(0, 12),
    newPasswordHashPrefix: sha256Hex(newHash).slice(0, 12),
    invalidatedSessions: invalidatedCount
  });

  return {
    status: "success",
    message: "Password Owner berhasil diubah. Semua sesi aktif telah dikeluarkan, silakan login ulang.",
    invalidatedSessions: invalidatedCount,
    backendVersion: BACKEND_VERSION
  };
}

function getOwnerSessions(ownerToken) {
  const auth = checkOwnerToken(ownerToken);
  if (!auth.ok) {
    logAudit("getOwnerSessions", "anonymous", "", "", "FAILED", { reason: "unauthorized" });
    return { status: "error", authRequired: true, message: auth.message, backendVersion: BACKEND_VERSION };
  }

  const cleanCurrent = String(ownerToken || "").trim();
  const currentKey = "OWNER_TOKEN_" + cleanCurrent;
  const nowMs = new Date().getTime();
  const sessions = [];

  try {
    const props = PropertiesService.getScriptProperties();
    const allProps = props.getProperties();
    for (var k in allProps) {
      if (k.indexOf("OWNER_TOKEN_") === 0) {
        try {
          const obj = JSON.parse(allProps[k]);
          if (!obj || typeof obj.expiresAt !== "number" || obj.expiresAt < nowMs) {
            props.deleteProperty(k);
            continue;
          }
          const tokSuffix = k.slice("OWNER_TOKEN_".length);
          sessions.push({
            sessionId: obj.tokenId || tokSuffix.slice(0, 8),
            tokenMask: obj.tokenMask || maskTokenPreview(tokSuffix),
            issuedAt: obj.issuedAt || "-",
            lastUsedAt: obj.lastUsedAt || obj.issuedAt || "-",
            expiresAt: obj.expiresAt,
            deviceId: obj.deviceId || "-",
            userAgent: obj.userAgent || "-",
            isCurrent: k === currentKey
          });
        } catch (err) {
          props.deleteProperty(k);
        }
      }
    }
  } catch (e) {
    return { status: "error", message: "Gagal memuat daftar sesi Owner.", backendVersion: BACKEND_VERSION };
  }

  sessions.sort(function(a, b) {
    if (a.isCurrent !== b.isCurrent) return a.isCurrent ? -1 : 1;
    return String(b.lastUsedAt).localeCompare(String(a.lastUsedAt));
  });

  logAudit("getOwnerSessions", "Owner", "", "", "SUCCESS", { count: sessions.length });
  return { status: "success", data: sessions, backendVersion: BACKEND_VERSION };
}

function revokeOwnerSession(data, ownerToken) {
  const auth = checkOwnerToken(ownerToken);
  if (!auth.ok) {
    logAudit("revokeOwnerSession", "anonymous", "", "", "FAILED", { reason: "unauthorized" });
    return { status: "error", authRequired: true, message: auth.message, backendVersion: BACKEND_VERSION };
  }

  const cleanCurrent = String(ownerToken || "").trim();
  const currentKey = "OWNER_TOKEN_" + cleanCurrent;
  const revokeAllOthers = !!(data && data.revokeAllOthers);
  const targetToken = data && data.tokenToRevoke ? String(data.tokenToRevoke).trim() : "";
  const targetSessionId = data && data.sessionId ? String(data.sessionId).trim() : "";

  if (!revokeAllOthers && !targetToken && !targetSessionId) {
    return { status: "error", message: "Target sesi yang akan dicabut wajib diisi.", backendVersion: BACKEND_VERSION };
  }

  let revokedCount = 0;
  try {
    const cache = CacheService.getScriptCache();
    const props = PropertiesService.getScriptProperties();
    const allProps = props.getProperties();

    for (var k in allProps) {
      if (k.indexOf("OWNER_TOKEN_") !== 0) continue;
      const rawTok = k.slice("OWNER_TOKEN_".length);
      let obj = null;
      try { obj = JSON.parse(allProps[k]); } catch (e) { obj = null; }
      const sid = (obj && obj.tokenId) ? obj.tokenId : rawTok.slice(0, 8);
      const tMask = (obj && obj.tokenMask) ? obj.tokenMask : maskTokenPreview(rawTok);

      let matched = false;
      if (revokeAllOthers) {
        matched = (k !== currentKey);
      } else {
        matched = (targetToken && (rawTok === targetToken || tMask === targetToken)) || (targetSessionId && sid === targetSessionId);
      }
      if (matched) {
        cache.remove(k);
        props.deleteProperty(k);
        revokedCount++;
      }
    }
  } catch (e) {
    logAudit("revokeOwnerSession", "Owner", "", "", "FAILED", { reason: "storage_error" });
    return { status: "error", message: "Gagal mencabut sesi target.", backendVersion: BACKEND_VERSION };
  }

  if (revokedCount === 0 && !revokeAllOthers) {
    return { status: "error", message: "Sesi target tidak ditemukan atau sudah berakhir.", backendVersion: BACKEND_VERSION };
  }

  logAudit("revokeOwnerSession", "Owner", "", "", "SUCCESS", { revokeAllOthers: revokeAllOthers, targetSessionId: targetSessionId || "-", revokedCount: revokedCount });
  return {
    status: "success",
    revokedCount: revokedCount,
    message: revokeAllOthers ? (revokedCount + " sesi lainnya berhasil dicabut.") : "Sesi berhasil dicabut.",
    backendVersion: BACKEND_VERSION
  };
}

function getAuditLogs(filters, ownerToken) {
  const auth = checkOwnerToken(ownerToken);
  if (!auth.ok) {
    logAudit("getAuditLogs", "anonymous", "", "", "FAILED", { reason: "unauthorized" });
    return { status: "error", authRequired: true, message: auth.message, backendVersion: BACKEND_VERSION };
  }

  const ss = getSpreadsheet();
  const sheet = ensureAuditLogSheet(ss);
  const values = sheet.getDataRange().getValues();
  const fAction = filters && filters.action ? normalizeTextKey(filters.action) : "";
  const fActor = filters && filters.actor ? normalizeTextKey(filters.actor) : "";
  const fDateFrom = filters && filters.dateFrom ? toYmd(filters.dateFrom) : "";
  const fDateTo = filters && filters.dateTo ? toYmd(filters.dateTo) : "";
  const limit = Math.min(200, Math.max(1, parseInt(filters && filters.limit, 10) || 50));

  const logs = [];
  for (let i = 1; i < values.length; i++) {
    const ts = String(values[i][0] || "").trim();
    if (!ts) continue;
    const actionVal = String(values[i][1] || "");
    const actorVal = String(values[i][2] || "");
    if (fAction && normalizeTextKey(actionVal).indexOf(fAction) === -1) continue;
    if (fActor && normalizeTextKey(actorVal).indexOf(fActor) === -1) continue;
    const rowYmd = ts.slice(0, 10);
    if (fDateFrom && rowYmd < fDateFrom) continue;
    if (fDateTo && rowYmd > fDateTo) continue;

    logs.push({
      timestamp: ts,
      action: actionVal,
      actor: actorVal,
      ipAddress: String(values[i][3] || "-"),
      userAgent: String(values[i][4] || "-"),
      status: String(values[i][5] || "-"),
      details: String(values[i][6] || "{}")
    });
    if (logs.length >= limit) break;
  }

  return { status: "success", data: logs, backendVersion: BACKEND_VERSION };
}

// ==================== EMPLOYEE PIN AUTHENTICATION ====================

function ensurePinColumns(sheet) {
  if (!sheet) return;
  const hK = String(sheet.getRange(1, 11).getValue() || "").trim();
  const hL = String(sheet.getRange(1, 12).getValue() || "").trim();
  const hM = String(sheet.getRange(1, 13).getValue() || "").trim();
  if (hK !== "PinAbsen") sheet.getRange(1, 11).setValue("PinAbsen");
  if (hL !== "PinCreatedAt") sheet.getRange(1, 12).setValue("PinCreatedAt");
  if (hM !== "PinLastUsed") sheet.getRange(1, 13).setValue("PinLastUsed");
}

function findActiveEmployeeRowForAuth(ss, identifier) {
  const sheet = (ss || getSpreadsheet()).getSheetByName("DataPegawai");
  if (!sheet) return { ok: false, reason: "no_sheet" };
  ensurePinColumns(sheet);
  const values = sheet.getDataRange().getValues();
  const cleanIdOrName = String(identifier || "").trim();
  if (!cleanIdOrName) return { ok: false, reason: "empty" };
  const normKey = normalizeTextKey(cleanIdOrName);

  const idMatches = [];
  const nameMatches = [];

  for (let i = 1; i < values.length; i++) {
    const nama = values[i][0] ? String(values[i][0]).trim() : "";
    if (!nama) continue;
    const statusRaw = (values[i][7] !== null && values[i][7] !== undefined) ? String(values[i][7]).trim().toUpperCase() : "";
    if (statusRaw !== "AKTIF") continue;

    const idPegawai = values[i][1] ? String(values[i][1]).trim() : "";
    const rec = {
      rowIndex: i + 1,
      nama: nama,
      idPegawai: idPegawai,
      pinHash: values[i][10] ? String(values[i][10]).trim() : "",
      pinCreatedAt: values[i][11] ? String(values[i][11]).trim() : "",
      pinLastUsed: values[i][12] ? String(values[i][12]).trim() : ""
    };

    if (idPegawai && normalizeTextKey(idPegawai) === normKey) {
      idMatches.push(rec);
    }
    if (normalizeTextKey(nama) === normKey) {
      nameMatches.push(rec);
    }
  }

  if (idMatches.length === 1) return { ok: true, sheet: sheet, employee: idMatches[0] };
  if (idMatches.length > 1) return { ok: false, reason: "ambiguous" };
  if (nameMatches.length === 1) return { ok: true, sheet: sheet, employee: nameMatches[0] };
  if (nameMatches.length > 1) return { ok: false, reason: "ambiguous_name" };
  return { ok: false, reason: "not_found" };
}

function setEmployeePin(data, ownerToken) {
  const auth = checkOwnerToken(ownerToken);
  if (!auth.ok) {
    logAudit("setEmployeePin", "anonymous", "", "", "FAILED", { reason: "unauthorized" });
    return { status: "error", authRequired: true, message: auth.message, backendVersion: BACKEND_VERSION };
  }

  const identifier = (data && (data.idPegawai || data.nama)) ? String(data.idPegawai || data.nama).trim() : "";
  const pin = (data && data.pin !== undefined && data.pin !== null) ? String(data.pin).trim() : "";

  if (!identifier) {
    return { status: "error", message: "Nama atau ID Pegawai wajib diisi.", backendVersion: BACKEND_VERSION };
  }
  if (!/^\d{4,6}$/.test(pin)) {
    return { status: "error", message: "PIN harus terdiri dari 4 sampai 6 digit angka.", backendVersion: BACKEND_VERSION };
  }

  const ss = getSpreadsheet();
  const lookup = findActiveEmployeeRowForAuth(ss, identifier);
  if (!lookup.ok) {
    const msg = lookup.reason === "ambiguous_name"
      ? "Nama pegawai duplikat. Gunakan ID Pegawai untuk mengatur PIN."
      : "Pegawai aktif tidak ditemukan.";
    return { status: "error", message: msg, backendVersion: BACKEND_VERSION };
  }

  const emp = lookup.employee;
  const nowIso = getJakartaIsoTimestampStr();
  const pinHash = hashSecret(pin);

  lookup.sheet.getRange(emp.rowIndex, 11).setValue(pinHash);
  lookup.sheet.getRange(emp.rowIndex, 12).setValue(nowIso);

  // Clear any existing brute-force lockout upon Owner PIN reset
  try {
    const lockKey = "EMP_LOCK_" + sha256Hex((emp.idPegawai || emp.nama).toLowerCase()).slice(0, 24);
    PropertiesService.getScriptProperties().deleteProperty(lockKey);
  } catch (e) {}

  logAudit("setEmployeePin", "Owner", "", "", "SUCCESS", { idPegawai: emp.idPegawai || "-", nama: emp.nama });

  return {
    status: "success",
    message: "PIN absensi untuk " + emp.nama + " berhasil diatur.",
    nama: emp.nama,
    idPegawai: emp.idPegawai,
    pinCreatedAt: nowIso,
    backendVersion: BACKEND_VERSION
  };
}

function employeeLogin(data) {
  const identifier = (data && (data.identifier || data.idPegawai || data.nama)) ? String(data.identifier || data.idPegawai || data.nama).trim() : "";
  const pin = (data && data.pin !== undefined && data.pin !== null) ? String(data.pin).trim() : "";
  const deviceId = (data && data.deviceId) ? String(data.deviceId).slice(0, 80) : (_currentRequestMeta.deviceId || "emp_client");
  const userAgent = (data && data.userAgent) ? String(data.userAgent).slice(0, 160) : (_currentRequestMeta.userAgent || "Browser");

  const accountKey = normalizeTextKey(identifier || "-");
  const rl = checkRateLimit(accountKey + "|" + deviceId, "employeeLogin", 5, 15);
  if (!rl.allowed) {
    logAudit("employeeLogin", identifier || "anonymous", deviceId, userAgent, "FAILED", { reason: "rate_limit", retryAfterSeconds: rl.retryAfterSeconds });
    return {
      status: "error",
      rateLimited: true,
      retryAfterSeconds: rl.retryAfterSeconds,
      message: "Terlalu banyak percobaan login. Silakan coba lagi dalam " + Math.ceil((rl.retryAfterSeconds || 60) / 60) + " menit.",
      backendVersion: BACKEND_VERSION
    };
  }

  if (!identifier || !pin) {
    logAudit("employeeLogin", identifier || "anonymous", deviceId, userAgent, "FAILED", { reason: "missing_credentials" });
    return { status: "error", message: "Nama / ID Pegawai dan PIN wajib diisi.", backendVersion: BACKEND_VERSION };
  }

  if (!/^\d{4,6}$/.test(pin)) {
    logAudit("employeeLogin", identifier, deviceId, userAgent, "FAILED", { reason: "invalid_pin_format" });
    return { status: "error", message: "Format PIN harus 4–6 digit angka.", backendVersion: BACKEND_VERSION };
  }

  const ss = getSpreadsheet();
  const lookup = findActiveEmployeeRowForAuth(ss, identifier);
  if (!lookup.ok) {
    logAudit("employeeLogin", identifier, deviceId, userAgent, "FAILED", { reason: lookup.reason });
    if (lookup.reason === "ambiguous_name") {
      return {
        status: "error",
        ambiguousName: true,
        message: "Terdapat nama pegawai yang sama. Silakan login menggunakan ID Pegawai Anda.",
        backendVersion: BACKEND_VERSION
      };
    }
    return { status: "error", message: "Nama / ID Pegawai atau PIN tidak valid.", backendVersion: BACKEND_VERSION };
  }

  const emp = lookup.employee;
  const props = PropertiesService.getScriptProperties();
  const lockKey = "EMP_LOCK_" + sha256Hex((emp.idPegawai || emp.nama).toLowerCase()).slice(0, 24);
  const nowMs = new Date().getTime();

  let lockRec = { failCount: 0, lockedUntil: 0 };
  try {
    const rawLock = props.getProperty(lockKey);
    if (rawLock) {
      const parsed = JSON.parse(rawLock);
      if (parsed && typeof parsed === "object") lockRec = parsed;
    }
  } catch (e) {}

  if (lockRec.lockedUntil && lockRec.lockedUntil > nowMs) {
    const waitMins = Math.max(1, Math.ceil((lockRec.lockedUntil - nowMs) / 60000));
    logAudit("employeeLogin", emp.nama, deviceId, userAgent, "FAILED", { reason: "account_locked", idPegawai: emp.idPegawai || "-" });
    return {
      status: "error",
      locked: true,
      lockedUntil: lockRec.lockedUntil,
      message: "Akun terkunci sementara karena 3 kali salah PIN. Coba lagi dalam " + waitMins + " menit.",
      backendVersion: BACKEND_VERSION
    };
  }

  if (!emp.pinHash) {
    logAudit("employeeLogin", emp.nama, deviceId, userAgent, "FAILED", { reason: "pin_not_set", idPegawai: emp.idPegawai || "-" });
    return {
      status: "error",
      pinNotSet: true,
      message: "PIN absensi Anda belum diatur. Hubungi Owner untuk mengatur PIN terlebih dahulu.",
      backendVersion: BACKEND_VERSION
    };
  }

  if (!verifySecret(pin, emp.pinHash)) {
    const nextFail = (Number(lockRec.failCount) || 0) + 1;
    const isNowLocked = nextFail >= 3;
    const nextLockedUntil = isNowLocked ? (nowMs + 15 * 60 * 1000) : 0;
    try {
      props.setProperty(lockKey, JSON.stringify({ failCount: nextFail, lockedUntil: nextLockedUntil }));
    } catch (e) {}
    logAudit("employeeLogin", emp.nama, deviceId, userAgent, "FAILED", {
      reason: "wrong_pin",
      failCount: nextFail,
      locked: isNowLocked,
      idPegawai: emp.idPegawai || "-"
    });
    if (isNowLocked) {
      return {
        status: "error",
        locked: true,
        lockedUntil: nextLockedUntil,
        message: "PIN salah 3 kali berturut-turut. Akun terkunci selama 15 menit.",
        backendVersion: BACKEND_VERSION
      };
    }
    return {
      status: "error",
      remainingAttempts: 3 - nextFail,
      message: "PIN salah! Sisa percobaan sebelum terkunci: " + (3 - nextFail) + ".",
      backendVersion: BACKEND_VERSION
    };
  }

  // PIN verified: reset lock & upgrade legacy plaintext numeric PIN if typed manually in Sheets
  try { props.deleteProperty(lockKey); } catch (e) {}
  const nowIso = getJakartaIsoTimestampStr();
  if (emp.pinHash.indexOf("sha256$") !== 0) {
    try {
      lookup.sheet.getRange(emp.rowIndex, 11).setValue(hashSecret(pin));
      if (!emp.pinCreatedAt) lookup.sheet.getRange(emp.rowIndex, 12).setValue(nowIso);
    } catch (e) {}
  }
  try {
    lookup.sheet.getRange(emp.rowIndex, 13).setValue(nowIso);
  } catch (e) {}

  // Resolve effective outlet/posisi for convenient frontend bootstrap
  const todayDmy = getJakartaDateStr();
  let empOutlet = "";
  let empPosisi = "";
  try {
    const ctx = buildAssignmentContext(ss, todayDmy);
    const assign = getEffectiveWorkAssignment(emp.idPegawai || emp.nama, todayDmy, ctx);
    empOutlet = assign.outletEfektif || "";
    empPosisi = assign.posisiPenugasan || assign.posisiPermanen || "";
  } catch (e) {}

  const token = "EMP-" + Utilities.getUuid().replace(/-/g, "") + "-" + nowMs.toString(36);
  const expiresAtMs = nowMs + 4 * 3600 * 1000; // 4 jam PropertiesService, 2 jam CacheService
  const sessionObj = {
    idPegawai: emp.idPegawai || "",
    nama: emp.nama,
    outlet: empOutlet,
    posisi: empPosisi,
    issuedAt: nowIso,
    expiresAt: expiresAtMs,
    deviceId: deviceId
  };
  const serialized = JSON.stringify(sessionObj);

  let cacheSaved = false;
  let propSaved = false;
  try {
    CacheService.getScriptCache().put("EMP_TOKEN_" + token, serialized, 7200);
    cacheSaved = true;
  } catch (e) {}
  try {
    const allProps = props.getProperties();
    for (var k in allProps) {
      if (k.indexOf("EMP_TOKEN_") === 0) {
        try {
          var o = JSON.parse(allProps[k]);
          if (!o || !o.expiresAt || o.expiresAt < nowMs) {
            props.deleteProperty(k);
          }
        } catch (err) {
          props.deleteProperty(k);
        }
      }
    }
    props.setProperty("EMP_TOKEN_" + token, serialized);
    propSaved = true;
  } catch (e) {}

  if (!cacheSaved && !propSaved) {
    logAudit("employeeLogin", emp.nama, deviceId, userAgent, "FAILED", { reason: "storage_error" });
    return { status: "error", message: "Gagal menyimpan sesi pegawai di server.", backendVersion: BACKEND_VERSION };
  }

  logAudit("employeeLogin", emp.nama, deviceId, userAgent, "SUCCESS", { idPegawai: emp.idPegawai || "-" });

  return {
    status: "success",
    employeeToken: token,
    nama: emp.nama,
    idPegawai: emp.idPegawai || "",
    outlet: empOutlet,
    posisi: empPosisi,
    expiresAt: expiresAtMs,
    backendVersion: BACKEND_VERSION
  };
}

function checkEmployeeToken(token) {
  if (!token || typeof token !== "string") {
    return { ok: false, message: "Autentikasi pegawai diperlukan. Silakan login terlebih dahulu." };
  }
  const cleanToken = token.trim();
  if (!cleanToken || cleanToken.length > 200 || /\s/.test(cleanToken)) {
    return { ok: false, message: "Sesi pegawai tidak valid. Silakan login ulang." };
  }

  const key = "EMP_TOKEN_" + cleanToken;
  const nowMs = new Date().getTime();
  let sessionObj = null;

  try {
    const cached = CacheService.getScriptCache().get(key);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (parsed && typeof parsed.expiresAt === "number" && parsed.expiresAt >= nowMs) {
          sessionObj = parsed;
        } else {
          try { CacheService.getScriptCache().remove(key); } catch (e1) {}
        }
      } catch (err) {
        try { CacheService.getScriptCache().remove(key); } catch (e1) {}
      }
    }
  } catch (e) {
    return { ok: false, message: "Gagal memverifikasi sesi pegawai. Silakan login ulang." };
  }

  if (!sessionObj) {
    try {
      const props = PropertiesService.getScriptProperties();
      const rawProp = props.getProperty(key);
      if (rawProp) {
        try {
          const parsed = JSON.parse(rawProp);
          if (parsed && typeof parsed.expiresAt === "number" && parsed.expiresAt >= nowMs) {
            sessionObj = parsed;
            try { CacheService.getScriptCache().put(key, rawProp, 7200); } catch (e1) {}
          } else {
            try { props.deleteProperty(key); } catch (e1) {}
          }
        } catch (err) {
          try { props.deleteProperty(key); } catch (e1) {}
          return { ok: false, message: "Sesi pegawai tidak valid. Silakan login ulang." };
        }
      }
    } catch (e) {
      return { ok: false, message: "Gagal memverifikasi sesi pegawai. Silakan login ulang." };
    }
  }

  if (!sessionObj || !sessionObj.nama) {
    return { ok: false, message: "Sesi pegawai tidak valid atau sudah berakhir. Silakan login ulang." };
  }

  // Re-verify employee is still AKTIF in DataPegawai
  const ss = getSpreadsheet();
  const activeEmps = getActiveEmployeesSafe(ss);
  const matched = findEmployeeInList(activeEmps, sessionObj.idPegawai || sessionObj.nama, sessionObj.nama);
  if (!matched) {
    return { ok: false, message: "Akun pegawai berstatus nonaktif atau tidak ditemukan. Silakan hubungi Owner." };
  }

  return {
    ok: true,
    idPegawai: matched.idPegawai || sessionObj.idPegawai || "",
    nama: matched.nama,
    outlet: sessionObj.outlet || "",
    posisi: sessionObj.posisi || ""
  };
}

function employeeVerify(token) {
  const chk = checkEmployeeToken(token);
  if (!chk.ok) {
    return { status: "error", valid: false, authRequired: true, message: chk.message, backendVersion: BACKEND_VERSION };
  }
  return {
    status: "success",
    valid: true,
    nama: chk.nama,
    idPegawai: chk.idPegawai,
    outlet: chk.outlet,
    posisi: chk.posisi,
    backendVersion: BACKEND_VERSION
  };
}

function employeeLogout(token) {
  if (!token || typeof token !== "string" || token.trim() === "") {
    return { status: "error", message: "Token pegawai tidak valid.", backendVersion: BACKEND_VERSION };
  }
  const cleanToken = token.trim();
  const key = "EMP_TOKEN_" + cleanToken;
  let actor = "Pegawai";
  try {
    const existing = PropertiesService.getScriptProperties().getProperty(key);
    if (existing) {
      const parsed = JSON.parse(existing);
      if (parsed && parsed.nama) actor = parsed.nama;
    }
  } catch (e) {}

  let cacheRemoved = false;
  let propRemoved = false;
  try {
    CacheService.getScriptCache().remove(key);
    cacheRemoved = true;
  } catch (e) {}
  try {
    PropertiesService.getScriptProperties().deleteProperty(key);
    propRemoved = true;
  } catch (e) {}

  if (!cacheRemoved || !propRemoved) {
    logAudit("employeeLogout", actor, "", "", "FAILED", { sessionMask: maskTokenPreview(cleanToken) });
    return { status: "error", message: "Gagal mencabut sesi pegawai.", backendVersion: BACKEND_VERSION };
  }

  logAudit("employeeLogout", actor, "", "", "SUCCESS", { sessionMask: maskTokenPreview(cleanToken) });
  return { status: "success", message: "Logout berhasil", backendVersion: BACKEND_VERSION };
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

function serializeEmployeePublic(emp) {
  if (!emp) return null;
  return {
    idPegawai: emp.idPegawai || "",
    nama: emp.nama || "",
    status: emp.status || "AKTIF",
    missingId: !!emp.missingId,
    duplicateName: !!emp.duplicateName
  };
}

function serializeEmployeeForOwner(emp) {
  if (!emp) return null;
  return {
    idPegawai: emp.idPegawai || "",
    nama: emp.nama || "",
    email: emp.email || "",
    noTelepon: emp.noTelepon || "",
    tanggalAktif: emp.tanggalAktif || "",
    tanggalNonAktif: emp.tanggalNonAktif || "",
    status: emp.status || "AKTIF",
    missingId: !!emp.missingId,
    duplicateName: !!emp.duplicateName,
    hasPin: !!emp.hasPin,
    pinCreatedAt: emp.pinCreatedAt || "",
    pinLastUsed: emp.pinLastUsed || ""
  };
}

function getActiveEmployeesSafe(ss) {
  const sheet = (ss || getSpreadsheet()).getSheetByName("DataPegawai");
  if (!sheet) return [];
  const values = sheet.getDataRange().getValues();
  const rawList = [];
  const nameCounts = {};

  // (A-M): Nama(0), ID(1), email(2), password(3 - NEVER EXPOSE), no_Telepon(4), TglAktif(5), TglNonAktif(6), Status(7), SidikWajah(8 - NEVER EXPOSE), FaceDescriptor(9 - NEVER EXPOSE), PinAbsen(10 - NEVER EXPOSE), PinCreatedAt(11), PinLastUsed(12)
  for (let i = 1; i < values.length; i++) {
    const nama = values[i][0] ? String(values[i][0]).trim() : "";
    if (!nama) continue;
    const statusRaw = (values[i][7] !== null && values[i][7] !== undefined) ? String(values[i][7]).trim() : "";
    if (statusRaw.toUpperCase() !== "AKTIF") continue;

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
      status: "AKTIF",
      hasPin: !!(values[i][10] && String(values[i][10]).trim() !== ""),
      pinCreatedAt: values[i][11] ? String(values[i][11]).trim() : "",
      pinLastUsed: values[i][12] ? String(values[i][12]).trim() : ""
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
      duplicateName: (nameCounts[normName] || 0) > 1,
      hasPin: emp.hasPin,
      pinCreatedAt: emp.pinCreatedAt,
      pinLastUsed: emp.pinLastUsed
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

function readAllKetidakhadiranRows(ss, includeCancelled) {
  const sheet = ss.getSheetByName("DataKetidakhadiran");
  if (!sheet) return [];
  const values = sheet.getDataRange().getValues();
  const displayValues = sheet.getDataRange().getDisplayValues();
  const rows = [];
  for (let i = 1; i < values.length; i++) {
    const nama = values[i][2] ? String(values[i][2]).trim() : "";
    const status = values[i][5] ? String(values[i][5]).trim().toUpperCase() : "";
    if (!nama || !status) continue;
    if (!includeCancelled && status === "DIBATALKAN") continue;
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

function getJakartaNowMinutes(dateObj) {
  const t = getJakartaTimeStr(dateObj || new Date());
  const parts = String(t).split(":");
  return (parseInt(parts[0], 10) || 0) * 60 + (parseInt(parts[1], 10) || 0);
}

function isTimeWithinShiftWindow(refMinutes, startStr, endStr, earlyGraceMin, lateGraceMin) {
  if (typeof refMinutes !== "number" || isNaN(refMinutes)) return false;
  if (!isValidHHMM(startStr) || !isValidHHMM(endStr)) return false;
  const startMin = timeStrToMinutes(startStr);
  let endMin = timeStrToMinutes(endStr);
  const early = typeof earlyGraceMin === "number" ? earlyGraceMin : 60;
  const late = typeof lateGraceMin === "number" ? lateGraceMin : 0;
  if (endMin <= startMin) {
    endMin += 1440;
  }
  const low = startMin - early;
  const high = endMin + late;
  return (refMinutes >= low && refMinutes <= high) || ((refMinutes + 1440) >= low && (refMinutes + 1440) <= high);
}

/**
 * FUNGSI RESOLVER TERPUSAT
 * Prioritas:
 * 1. JadwalHarian (DIJADWALKAN / LIBUR) untuk pegawai & tanggal terkait
 *    - Multi-jadwal / split shift diselesaikan lewat outlet + jendela jam shift;
 *      jika masih ambigu, ditandai ambiguous: true (tidak memilih diam-diam).
 * 2. DataPenempatan yang berlaku pada tanggal tersebut
 * 3. Tanpa JadwalHarian dan tanpa DataPenempatan -> BELUM_DIJADWALKAN (dikecualikan dari ALPA)
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
    let candidates = scheduledOnes.slice();
    if (ctx && Array.isArray(ctx.excludeScheduleIds) && ctx.excludeScheduleIds.length > 0) {
      const remaining = candidates.filter(function(j) {
        return ctx.excludeScheduleIds.indexOf(j.idJadwal) === -1;
      });
      if (remaining.length > 0) {
        candidates = remaining;
      }
    }

    let chosen = null;
    let ambiguous = false;
    let ambiguityReason = "";
    let outletMismatch = false;

    if (ctx && ctx.preferredIdJadwal) {
      chosen = candidates.find(function(j) { return j.idJadwal === ctx.preferredIdJadwal; }) || null;
    }

    if (!chosen && candidates.length === 1) {
      chosen = candidates[0];
      if (ctx && ctx.preferredOutlet && normalizeOutletKey(chosen.outlet) !== normalizeOutletKey(ctx.preferredOutlet)) {
        outletMismatch = true;
      }
    } else if (!chosen && candidates.length > 1) {
      let pool = candidates.slice();
      if (ctx && ctx.preferredOutlet) {
        const prefKey = normalizeOutletKey(ctx.preferredOutlet);
        pool = pool.filter(function(j) { return normalizeOutletKey(j.outlet) === prefKey; });
        if (pool.length === 0) {
          ambiguous = true;
          outletMismatch = true;
          ambiguityReason = "Outlet pengajuan (" + ctx.preferredOutlet + ") tidak sesuai dengan jadwal aktif hari ini (" +
            scheduledOnes.map(function(s) { return s.outlet + " " + s.jamMasuk + "-" + s.jamPulang; }).join("; ") + ").";
        }
      }

      if (!ambiguous && pool.length === 1) {
        chosen = pool[0];
      } else if (!ambiguous && pool.length > 1) {
        const refMin = (ctx && typeof ctx.referenceMinutes === "number")
          ? ctx.referenceMinutes
          : (targetDmy === getJakartaDateStr() ? getJakartaNowMinutes() : null);

        if (typeof refMin === "number") {
          const strictWin = pool.filter(function(j) {
            return isTimeWithinShiftWindow(refMin, j.jamMasuk, j.jamPulang, 60, 0);
          });
          if (strictWin.length === 1) {
            chosen = strictWin[0];
          } else {
            const wideWin = strictWin.length > 1
              ? strictWin
              : pool.filter(function(j) {
                  return isTimeWithinShiftWindow(refMin, j.jamMasuk, j.jamPulang, 120, 60);
                });
            if (wideWin.length === 1) {
              chosen = wideWin[0];
            } else {
              ambiguous = true;
              ambiguityReason = "Terdapat " + pool.length + " jadwal aktif yang masih ambigu pada jam saat ini (" +
                pool.map(function(s) { return s.outlet + " " + s.jamMasuk + "-" + s.jamPulang; }).join("; ") + ").";
            }
          }
        } else {
          ambiguous = true;
          ambiguityReason = "Pegawai memiliki " + pool.length + " jadwal aktif pada " + targetDmy + " tanpa konteks outlet/jam shift.";
        }
      }
    }

    if (ambiguous || !chosen) {
      return {
        idPegawai: emp.idPegawai || (scheduledOnes[0] && scheduledOnes[0].idPegawai) || "",
        nama: emp.nama || (scheduledOnes[0] && scheduledOnes[0].nama) || "",
        outletEfektif: ctx && ctx.preferredOutlet ? ctx.preferredOutlet : "",
        posisiPermanen: permanentPos,
        posisiPenugasan: "",
        jamMasukEfektif: "-",
        jamPulangEfektif: "-",
        jenisPenugasan: "NORMAL",
        statusJadwal: "DIJADWALKAN",
        hariKerja: defaultWorkDays,
        sumberJadwal: "JADWAL_HARIAN",
        idJadwal: "",
        hasPlacement: !!placement,
        isWorkDay: true,
        isScheduledToWork: true,
        multipleSchedules: scheduledOnes.length > 1,
        ambiguous: true,
        ambiguityReason: ambiguityReason,
        outletMismatch: outletMismatch,
        allSchedulesToday: scheduledOnes
      };
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
      isScheduledToWork: true,
      multipleSchedules: scheduledOnes.length > 1,
      ambiguous: false,
      ambiguityReason: "",
      outletMismatch: outletMismatch,
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
      isScheduledToWork: false,
      multipleSchedules: false,
      ambiguous: false,
      ambiguityReason: "",
      outletMismatch: false,
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
      isScheduledToWork: isWorkDay,
      multipleSchedules: false,
      ambiguous: false,
      ambiguityReason: "",
      outletMismatch: false,
      allSchedulesToday: []
    };
  }

  // Priority 3: Pegawai tanpa DataPenempatan maupun JadwalHarian aktif -> BELUM_DIJADWALKAN (dikecualikan dari ALPA)
  const fallbackPos = (ctx && ctx.fallbackPosisi) ? String(ctx.fallbackPosisi).trim() : "";
  const fbTimes = fallbackPos ? getPosTimes(fallbackPos) : { jamMasuk: "-", jamPulang: "-" };
  return {
    idPegawai: emp.idPegawai || "",
    nama: emp.nama,
    outletEfektif: "",
    posisiPermanen: "",
    posisiPenugasan: fallbackPos,
    jamMasukEfektif: fbTimes.jamMasuk,
    jamPulangEfektif: fbTimes.jamPulang,
    jenisPenugasan: "NORMAL",
    statusJadwal: "BELUM_DIJADWALKAN",
    hariKerja: DEFAULT_WORK_DAYS.slice(),
    sumberJadwal: "BELUM_DIJADWALKAN",
    idJadwal: "",
    hasPlacement: false,
    isWorkDay: false,
    isScheduledToWork: false,
    multipleSchedules: false,
    ambiguous: false,
    ambiguityReason: "",
    outletMismatch: false,
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

function getDataPenempatan(ownerToken) {
  const auth = checkOwnerToken(ownerToken);
  if (!auth.ok) {
    return { status: "error", authRequired: true, message: auth.message, backendVersion: BACKEND_VERSION };
  }

  const ss = getSpreadsheet();
  const pegSheet = ss.getSheetByName("DataPegawai");
  if (pegSheet) ensurePinColumns(pegSheet);
  ensureDataPenempatanSheet(ss);
  const ctx = buildAssignmentContext(ss);
  const todayYmd = toYmd(getJakartaDateStr());

  const pegawaiList = ctx.employees.map(function(emp) {
    const activePlacement = getEffectivePlacementForDate(emp, todayYmd, ctx.penempatanRows);
    const ownerSafe = serializeEmployeeForOwner(emp);
    ownerSafe.hasPlacement = !!activePlacement;
    ownerSafe.penempatanAktif = activePlacement;
    return ownerSafe;
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

function getRiwayatPenempatan(idPegawai, nama, ownerToken) {
  const auth = checkOwnerToken(ownerToken);
  if (!auth.ok) {
    return { status: "error", authRequired: true, message: auth.message, backendVersion: BACKEND_VERSION };
  }

  const ss = getSpreadsheet();
  ensureDataPenempatanSheet(ss);
  const ctx = buildAssignmentContext(ss);
  const emp = findEmployeeInList(ctx.employees, idPegawai || nama, nama) || {
    idPegawai: String(idPegawai || "").trim(),
    nama: String(nama || "").trim(),
    status: "AKTIF",
    missingId: !idPegawai,
    duplicateName: false
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
    pegawai: serializeEmployeeForOwner(emp),
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
    const statusMasuk = String(values[i][7] || "").trim().toUpperCase();
    const rowTanggal = toDmy(displayValues[i] && displayValues[i][0] ? displayValues[i][0] : values[i][0]);
    if (rowTanggal === targetDmy && normalizeTextKey(values[i][1]) === normalizeTextKey(emp.nama) && statusMasuk !== "IZIN" && statusMasuk !== "DIBATALKAN") {
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
    if (!r.hasPlacement && (r.sumberJadwal === "BELUM_DIJADWALKAN" || r.sumberJadwal === "DATA_POSISI")) {
      alerts.push({
        type: "NO_SCHEDULE",
        severity: "warning",
        nama: r.nama,
        message: r.nama + " belum memiliki penempatan permanen maupun jadwal harian."
      });
    }
    if (r.statusKehadiran !== "LIBUR" && r.statusKehadiran !== "BELUM DIJADWALKAN" && (!isValidHHMM(r.jamMasukJadwal) || !isValidHHMM(r.jamPulangJadwal))) {
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

function getJadwalHarian(paramTanggal, ownerToken) {
  const auth = checkOwnerToken(ownerToken);
  if (!auth.ok) {
    return { status: "error", authRequired: true, message: auth.message, backendVersion: BACKEND_VERSION };
  }

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
    const rowSts = String(absensiVals[i][7] || "").trim().toUpperCase();
    if (rTgl === targetDmy && rowSts !== "IZIN" && rowSts !== "DIBATALKAN") {
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
    return !r.hasPlacement && (r.sumberJadwal === "BELUM_DIJADWALKAN" || r.sumberJadwal === "DATA_POSISI");
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
    employees: ctx.employees.map(serializeEmployeeForOwner),
    backendVersion: BACKEND_VERSION
  };
}

function getRiwayatRotasi(nama, outlet, bulan, ownerToken) {
  const auth = checkOwnerToken(ownerToken);
  if (!auth.ok) {
    return { status: "error", authRequired: true, message: auth.message, backendVersion: BACKEND_VERSION };
  }

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
      const otherLibur = rows.find(function(r) {
        return r.idJadwal !== idJadwal &&
          r.tanggal === target.tanggal &&
          r.statusJadwal === "LIBUR" &&
          employeeMatches(r.idPegawai, r.nama, emp);
      });
      if (otherLibur) {
        return {
          status: "error",
          message: target.nama + " sudah ditandai LIBUR pada " + target.tanggal + ". Batalkan status LIBUR terlebih dahulu.",
          backendVersion: BACKEND_VERSION
        };
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
    } else if (nextStatus === "LIBUR") {
      const otherScheduled = rows.find(function(r) {
        return r.idJadwal !== idJadwal &&
          r.tanggal === target.tanggal &&
          r.statusJadwal === "DIJADWALKAN" &&
          employeeMatches(r.idPegawai, r.nama, emp);
      });
      if (otherScheduled) {
        return {
          status: "error",
          message: target.nama + " masih memiliki jadwal aktif lain di " + otherScheduled.outlet + " pada " + target.tanggal + ". Batalkan jadwal tersebut terlebih dahulu.",
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

function syncCancelAbsenceInDataAbsensi(ss, targetDmy, targetNama, ownerName, reasonText) {
  const sheetAbs = ss.getSheetByName("Data_Absensi");
  if (!sheetAbs) return 0;
  const vals = sheetAbs.getDataRange().getValues();
  const disp = sheetAbs.getDataRange().getDisplayValues();
  let updatedCount = 0;
  for (let i = 1; i < vals.length; i++) {
    const rTgl = toDmy(disp[i] && disp[i][0] ? disp[i][0] : vals[i][0]);
    const rNama = String(vals[i][1] || "").trim();
    const rStatusMasuk = String(vals[i][7] || "").trim().toUpperCase();
    if (rTgl === targetDmy && normalizeTextKey(rNama) === normalizeTextKey(targetNama) && rStatusMasuk === "IZIN") {
      const rowIdx = i + 1;
      const oldData = {
        tanggal: rTgl,
        nama: rNama,
        posisi: String(vals[i][2] || "").trim(),
        outlet: String(vals[i][3] || "").trim(),
        jamDatang: parseSheetTime(disp[i] && disp[i][4] !== "-" ? disp[i][4] : vals[i][4]),
        jamPulang: parseSheetTime(disp[i] && disp[i][5] !== "-" ? disp[i][5] : vals[i][5]),
        totalJam: String(vals[i][6] || "-"),
        statusMasuk: rStatusMasuk,
        statusPulang: String(vals[i][8] || "-"),
        keteranganDatang: String(vals[i][13] || "-"),
        keteranganPulang: String(vals[i][14] || "-"),
        previousOriginalSnapshot: String(vals[i][17] || "").trim()
      };
      sheetAbs.getRange(rowIdx, 8).setValue("DIBATALKAN");
      sheetAbs.getRange(rowIdx, 15).setValue("Ketidakhadiran dibatalkan: " + (reasonText || "Owner"));
      logAuditTrail(sheetAbs, rowIdx, oldData, { statusMasuk: "DIBATALKAN" }, ownerName || "Owner", "CANCEL_ABSENCE", reasonText || "Ketidakhadiran dibatalkan Owner");
      updatedCount += 1;
    }
  }
  return updatedCount;
}

function getKetidakhadiran(paramTanggal, paramBulan, paramNama, paramOutlet, ownerToken, includeCancelled) {
  const auth = checkOwnerToken(ownerToken);
  if (!auth.ok) {
    return { status: "error", authRequired: true, message: auth.message, backendVersion: BACKEND_VERSION };
  }

  const ss = getSpreadsheet();
  ensureDataKetidakhadiranSheet(ss);
  const rows = readAllKetidakhadiranRows(ss, !!includeCancelled);
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

    const hasDatang = checkHasDatangOnDate(ss, emp, tanggalDmy);
    if (status === "ALPA" && hasDatang) {
      return {
        status: "error",
        message: emp.nama + " sudah memiliki absen HADIR pada tanggal " + tanggalDmy + " dan tidak dapat ditandai ALPA.",
        backendVersion: BACKEND_VERSION
      };
    }

    const ctx = buildAssignmentContext(ss, tanggalDmy);
    const eff = getEffectiveWorkAssignment(emp.idPegawai || emp.nama, tanggalDmy, ctx);
    if (status === "ALPA" && !eff.isScheduledToWork) {
      return {
        status: "error",
        message: emp.nama + " berstatus " + eff.statusJadwal + " pada tanggal " + tanggalDmy + " dan tidak layak ditandai ALPA.",
        backendVersion: BACKEND_VERSION
      };
    }

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
    if (nextStatus === "ALPA" && checkHasDatangOnDate(ss, emp, target.tanggal)) {
      return { status: "error", message: emp.nama + " sudah memiliki absen HADIR pada tanggal " + target.tanggal + ".", backendVersion: BACKEND_VERSION };
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

    // Sinkronkan baris IZIN terkait di Data_Absensi agar tidak basi
    if (nextStatus !== "IZIN" && nextStatus !== "SAKIT") {
      syncCancelAbsenceInDataAbsensi(ss, target.tanggal, target.nama, auth.ownerName, "Status diubah ke " + nextStatus);
    } else {
      const sheetAbs = ss.getSheetByName("Data_Absensi");
      if (sheetAbs) {
        const vals = sheetAbs.getDataRange().getValues();
        const disp = sheetAbs.getDataRange().getDisplayValues();
        for (let i = 1; i < vals.length; i++) {
          const rTgl = toDmy(disp[i] && disp[i][0] ? disp[i][0] : vals[i][0]);
          const rSts = String(vals[i][7] || "").trim().toUpperCase();
          if (rTgl === target.tanggal && normalizeTextKey(vals[i][1]) === normalizeTextKey(target.nama) && rSts === "IZIN") {
            if (nextBukti) sheetAbs.getRange(i + 1, 12).setValue(nextBukti);
            sheetAbs.getRange(i + 1, 14).setValue(nextAlasan || "-");
          }
        }
      }
    }

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
      return { status: "error", message: "Catatan ketidakhadiran tidak ditemukan atau sudah dibatalkan.", backendVersion: BACKEND_VERSION };
    }

    const nowTs = getJakartaTimestampStr();
    const cancelReason = data && data.alasan ? String(data.alasan).trim() : "Dibatalkan Owner";
    const cancelNote = (target.keterangan ? (target.keterangan + " | ") : "") + "Dibatalkan oleh " + auth.ownerName + " (" + nowTs + "): " + cancelReason;

    // Soft-cancel di DataKetidakhadiran agar riwayat audit tetap tersimpan tanpa menggeser rowIndex
    sheet.getRange(target.rowIndex, 6).setValue("DIBATALKAN");
    sheet.getRange(target.rowIndex, 9).setValue(auth.ownerName);
    sheet.getRange(target.rowIndex, 10).setValue(nowTs);
    sheet.getRange(target.rowIndex, 11).setValue(cancelNote);

    // Sinkronkan pembatalan hanya pada baris IZIN terkait di Data_Absensi (JANGAN menyentuh transaksi DATANG/PULANG)
    const syncedDataAbsensi = syncCancelAbsenceInDataAbsensi(ss, target.tanggal, target.nama, auth.ownerName, cancelReason);

    return {
      status: "success",
      message: "Catatan " + target.status + " untuk " + target.nama + " (" + target.tanggal + ") berhasil dibatalkan.",
      syncedDataAbsensiCancelled: syncedDataAbsensi,
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

  const rawDateInput = data && data.tanggal ? String(data.tanggal).trim() : "";
  if (rawDateInput && (!toDmy(rawDateInput) || !isValidDateInput(rawDateInput))) {
    return { status: "error", message: "Tanggal Tutup Hari tidak valid.", backendVersion: BACKEND_VERSION };
  }
  const targetDmy = rawDateInput ? toDmy(rawDateInput) : getJakartaDateStr();
  const targetYmd = toYmd(targetDmy);
  const todayYmd = toYmd(getJakartaDateStr());
  if (todayYmd && targetYmd > todayYmd) {
    return {
      status: "error",
      message: "Tidak dapat menutup pemeriksaan harian untuk tanggal masa depan (" + targetDmy + ").",
      backendVersion: BACKEND_VERSION
    };
  }

  const isDryRun = !!(data && (data.dryRun === true || data.preview === true));

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
    const ss = getSpreadsheet();
    const sheet = ensureDataKetidakhadiranSheet(ss);
    const ctx = buildAssignmentContext(ss, targetDmy);
    const daily = computeKehadiranHarianInternal(targetDmy, ctx);

    let requestedKeys = null;
    const requestedNameMap = {};
    if (data && Array.isArray(data.targetNames) && data.targetNames.length > 0) {
      requestedKeys = [];
      data.targetNames.forEach(function(n) {
        const clean = String(n || "").trim();
        const key = normalizeTextKey(clean);
        if (key && requestedKeys.indexOf(key) === -1) {
          requestedKeys.push(key);
          requestedNameMap[key] = clean;
        }
      });
    }

    const alasanDefault = (data && data.alasan && String(data.alasan).trim())
      ? String(data.alasan).trim()
      : "Tidak hadir tanpa keterangan (Tutup pemeriksaan harian Owner)";

    const existingActiveKeys = {};
    readAllKetidakhadiranRows(ss).forEach(function(k) {
      if (k.tanggal === targetDmy) {
        const kId = k.idPegawai ? k.idPegawai.toLowerCase() : "";
        if (kId) existingActiveKeys["id:" + kId] = k.status;
        existingActiveKeys["name:" + normalizeTextKey(k.nama)] = k.status;
      }
    });

    const eligible = [];
    const ineligible = [];
    const matchedRequestedKeys = {};

    daily.data.forEach(function(row) {
      const empKey = normalizeTextKey(row.nama);
      if (requestedKeys) {
        if (requestedKeys.indexOf(empKey) === -1) return;
        matchedRequestedKeys[empKey] = true;
      }
      const dupKeyId = row.idPegawai ? ("id:" + row.idPegawai.toLowerCase()) : "";
      const dupKeyName = "name:" + empKey;
      const alreadyActiveStatus = (dupKeyId && existingActiveKeys[dupKeyId]) || existingActiveKeys[dupKeyName] || "";

      if (row.statusKehadiran === "BELUM ABSEN" && row.isScheduledToWork !== false && !alreadyActiveStatus) {
        eligible.push(row);
      } else {
        ineligible.push({
          nama: row.nama,
          idPegawai: row.idPegawai || "",
          reason: alreadyActiveStatus
            ? ("Sudah tercatat " + alreadyActiveStatus)
            : ("Status saat ini: " + row.statusKehadiran)
        });
      }
    });

    const unknownTargets = [];
    if (requestedKeys) {
      requestedKeys.forEach(function(k) {
        if (!matchedRequestedKeys[k]) {
          unknownTargets.push({ nama: requestedNameMap[k], reason: "Pegawai tidak ditemukan atau berstatus nonaktif" });
        }
      });
    }

    if (isDryRun) {
      return {
        status: "success",
        dryRun: true,
        tanggal: targetDmy,
        eligibleCount: eligible.length,
        eligible: eligible.map(function(r) {
          return { idPegawai: r.idPegawai, nama: r.nama, outlet: r.outlet, posisi: r.posisiPenugasan || r.posisi };
        }),
        ineligible: ineligible.concat(unknownTargets),
        message: "Pratinjau Tutup Hari " + targetDmy + ": " + eligible.length + " pegawai layak ditandai ALPA.",
        backendVersion: BACKEND_VERSION
      };
    }

    if (requestedKeys && eligible.length === 0 && unknownTargets.length > 0 && ineligible.length === 0) {
      return {
        status: "error",
        message: "Tidak ada pegawai valid yang dapat ditandai ALPA.",
        markedCount: 0,
        markedNames: [],
        skipped: unknownTargets,
        backendVersion: BACKEND_VERSION
      };
    }

    const nowTs = getJakartaTimestampStr();
    const marked = [];

    eligible.forEach(function(row) {
      const empKey = normalizeTextKey(row.nama);
      const dupKeyId = row.idPegawai ? ("id:" + row.idPegawai.toLowerCase()) : "";
      const dupKeyName = "name:" + empKey;
      if ((dupKeyId && existingActiveKeys[dupKeyId]) || existingActiveKeys[dupKeyName]) return;

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
      if (dupKeyId) existingActiveKeys[dupKeyId] = "ALPA";
      existingActiveKeys[dupKeyName] = "ALPA";
      marked.push(row.nama);
    });

    const skippedAll = (requestedKeys ? ineligible : []).concat(unknownTargets);
    const isPartial = marked.length > 0 && skippedAll.length > 0;
    const isAlreadyClosed = marked.length === 0 && skippedAll.length === 0;

    return {
      status: "success",
      partial: isPartial,
      alreadyClosed: isAlreadyClosed,
      tanggal: targetDmy,
      message: marked.length > 0
        ? ("Pemeriksaan harian selesai: " + marked.length + " pegawai ditandai ALPA" + (isPartial ? (" (" + skippedAll.length + " dilewati).") : "."))
        : (skippedAll.length > 0
            ? "Tidak ada pegawai yang ditandai ALPA (" + skippedAll.length + " target tidak memenuhi syarat)."
            : "Tidak ada pegawai berstatus BELUM ABSEN yang perlu ditandai ALPA."),
      markedCount: marked.length,
      markedNames: marked,
      skippedCount: skippedAll.length,
      skipped: skippedAll,
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
  const targetYmd = toYmd(targetDmy);
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
    const statusMasukRaw = String(absValues[i][7] || "").trim();
    if (!nama || statusMasukRaw.toUpperCase() === "DIBATALKAN") continue;
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
      statusMasuk: statusMasukRaw,
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
    belumDijadwalkan: 0,
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
    const hadirTxs = empTxs.filter(function(t) { return t.statusMasuk.toUpperCase() !== "IZIN" && t.jamDatang && t.jamDatang !== "-"; });
    const legacyIzinTx = empTxs.find(function(t) { return t.statusMasuk.toUpperCase() === "IZIN"; });

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

    const empStartYmd = emp.tanggalAktif ? toYmd(emp.tanggalAktif) : "";
    const employedOnTargetDate = !empStartYmd || !targetYmd || empStartYmd <= targetYmd;
    const isScheduledWorkDay = employedOnTargetDate && (eff.statusJadwal === "DIJADWALKAN" && eff.isWorkDay);

    let statusKehadiran = "BELUM ABSEN";
    const sortedHadirTxs = hadirTxs.slice().sort(function(a, b) {
      return timeStrToMinutes(a.jamDatang) - timeStrToMinutes(b.jamDatang);
    });
    const primaryTx = sortedHadirTxs[0] || legacyIzinTx || null;
    const latestTx = sortedHadirTxs.length > 0 ? sortedHadirTxs[sortedHadirTxs.length - 1] : null;

    // Urutan prioritas status harian deterministik:
    // 1. Transaksi HADIR aktual di Data_Absensi (termasuk lembur di hari libur / tanpa jadwal)
    // 2. Catatan IZIN / SAKIT aktif (DataKetidakhadiran atau legacy Data_Absensi IZIN non-batal)
    // 3. LIBUR (DataKetidakhadiran LIBUR, JadwalHarian LIBUR, atau hari non-kerja DataPenempatan)
    // 4. BELUM DIJADWALKAN (pegawai tanpa DataPenempatan & tanpa JadwalHarian aktif, atau sebelum tanggalAktif)
    // 5. ALPA (hanya bila dijadwalkan bekerja)
    // 6. BELUM ABSEN (dijadwalkan bekerja & belum ada transaksi)
    if (sortedHadirTxs.length > 0) {
      statusKehadiran = "HADIR";
    } else if (absenceRec && (absenceRec.status === "IZIN" || absenceRec.status === "SAKIT")) {
      statusKehadiran = absenceRec.status;
    } else if (legacyIzinTx) {
      statusKehadiran = (legacyIzinTx.keteranganDatang && legacyIzinTx.keteranganDatang.toLowerCase().indexOf("sakit") !== -1) ? "SAKIT" : "IZIN";
    } else if ((absenceRec && absenceRec.status === "LIBUR") || eff.statusJadwal === "LIBUR" || (eff.hasPlacement && !eff.isWorkDay)) {
      statusKehadiran = "LIBUR";
    } else if (!employedOnTargetDate || eff.statusJadwal === "BELUM_DIJADWALKAN") {
      statusKehadiran = "BELUM DIJADWALKAN";
    } else if (absenceRec && absenceRec.status === "ALPA") {
      statusKehadiran = "ALPA";
    } else {
      statusKehadiran = "BELUM ABSEN";
    }

    const isScheduledToWork = isScheduledWorkDay || statusKehadiran === "HADIR" || statusKehadiran === "ALPA";
    if (statusKehadiran !== "LIBUR" && statusKehadiran !== "BELUM DIJADWALKAN" && isScheduledToWork) {
      stats.totalDijadwalkan += 1;
    }

    if (statusKehadiran === "HADIR") {
      stats.hadir += 1;
      if (sortedHadirTxs.some(function(t) { return t.statusMasuk === "TELAT"; })) {
        stats.telat += 1;
      }
    } else if (statusKehadiran === "IZIN") {
      stats.izin += 1;
    } else if (statusKehadiran === "SAKIT") {
      stats.sakit += 1;
    } else if (statusKehadiran === "LIBUR") {
      stats.libur += 1;
    } else if (statusKehadiran === "BELUM DIJADWALKAN") {
      stats.belumDijadwalkan += 1;
    } else if (statusKehadiran === "ALPA") {
      stats.alpa += 1;
    } else {
      stats.belumAbsen += 1;
    }

    let combinedTotalJam = primaryTx ? primaryTx.totalJam : "-";
    if (sortedHadirTxs.length > 1) {
      let totalMins = 0;
      let anyParsed = false;
      sortedHadirTxs.forEach(function(t) {
        const m = t.totalJam ? String(t.totalJam).match(/(\d+)j\s*(\d+)m/) : null;
        if (m) {
          totalMins += (parseInt(m[1], 10) * 60) + parseInt(m[2], 10);
          anyParsed = true;
        }
      });
      if (anyParsed) {
        combinedTotalJam = Math.floor(totalMins / 60) + "j " + (totalMins % 60) + "m";
      }
    }

    const anyLate = sortedHadirTxs.some(function(t) { return t.statusMasuk === "TELAT"; });
    const displayOutlet = (sortedHadirTxs[0] && sortedHadirTxs[0].outlet) || eff.outletEfektif || (absenceRec && absenceRec.outlet) || "-";
    const displayPosisiPenugasan = (sortedHadirTxs[0] && sortedHadirTxs[0].posisi) || eff.posisiPenugasan || (absenceRec && absenceRec.posisi) || "-";

    rows.push({
      idPegawai: emp.idPegawai,
      nama: emp.nama,
      tanggal: targetDmy,
      outlet: displayOutlet || "-",
      posisiPermanen: eff.posisiPermanen || "-",
      posisiPenugasan: displayPosisiPenugasan || "-",
      posisi: displayPosisiPenugasan || "-",
      jamMasukJadwal: eff.jamMasukEfektif || "-",
      jamPulangJadwal: eff.jamPulangEfektif || "-",
      jamDatang: sortedHadirTxs[0] ? sortedHadirTxs[0].jamDatang : "-",
      jamPulang: latestTx ? latestTx.jamPulang : "-",
      totalJam: combinedTotalJam,
      statusMasuk: sortedHadirTxs[0] ? (anyLate ? "TELAT" : sortedHadirTxs[0].statusMasuk) : (statusKehadiran === "IZIN" || statusKehadiran === "SAKIT" ? statusKehadiran : "-"),
      statusPulang: latestTx ? latestTx.statusPulang : "-",
      statusKehadiran: statusKehadiran,
      jenisPenugasan: eff.jenisPenugasan,
      sumberJadwal: eff.sumberJadwal,
      idJadwal: eff.idJadwal || "",
      lokasiDatang: sortedHadirTxs[0] ? sortedHadirTxs[0].lokasiDatang : "",
      lokasiPulang: latestTx ? latestTx.lokasiPulang : "",
      fotoDatang: (sortedHadirTxs[0] && sortedHadirTxs[0].fotoDatang) || (absenceRec && absenceRec.buktiFoto) || (legacyIzinTx && legacyIzinTx.fotoDatang) || "",
      fotoPulang: latestTx ? latestTx.fotoPulang : "",
      alasan: (absenceRec && absenceRec.alasan) || (primaryTx && primaryTx.keteranganDatang !== "-" ? primaryTx.keteranganDatang : "") || "",
      buktiDokumen: (absenceRec && absenceRec.buktiFoto) || (legacyIzinTx && legacyIzinTx.fotoDatang) || "",
      dicatatOleh: absenceRec ? absenceRec.dicatatOleh : "",
      hasPlacement: eff.hasPlacement,
      isScheduledToWork: isScheduledWorkDay,
      multipleSchedules: !!eff.multipleSchedules,
      ambiguousSchedule: !!eff.ambiguous,
      shiftCount: sortedHadirTxs.length,
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

function getKehadiranHarian(paramTanggal, ownerToken) {
  const auth = checkOwnerToken(ownerToken);
  if (!auth.ok) {
    return { status: "error", authRequired: true, message: auth.message, backendVersion: BACKEND_VERSION };
  }

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

function getPegawaiDetail(nama, idPegawai, paramTanggal, authOrToken) {
  const tokens = (authOrToken && typeof authOrToken === "object")
    ? authOrToken
    : { ownerToken: authOrToken || "", employeeToken: "" };
  const ownerCheck = tokens.ownerToken ? checkOwnerToken(tokens.ownerToken) : { ok: false };
  const empCheck = (!ownerCheck.ok && tokens.employeeToken) ? checkEmployeeToken(tokens.employeeToken) : { ok: false };

  if (!ownerCheck.ok && !empCheck.ok) {
    logAudit("getPegawaiDetail", nama || idPegawai || "anonymous", "", "", "FAILED", { reason: "unauthorized" });
    return { status: "error", authRequired: true, message: "Autentikasi diperlukan untuk mengakses detail pegawai.", backendVersion: BACKEND_VERSION };
  }

  let effectiveLookupId = idPegawai || nama;
  let effectiveLookupName = nama;
  if (!ownerCheck.ok && empCheck.ok) {
    if (nama && normalizeTextKey(nama) !== normalizeTextKey(empCheck.nama)) {
      logAudit("getPegawaiDetail", empCheck.nama, "", "", "FAILED", { reason: "cross_employee_denied", requestedNama: nama });
      return { status: "error", authRequired: true, message: "Akses ditolak: hanya diperbolehkan mengakses data Anda sendiri.", backendVersion: BACKEND_VERSION };
    }
    if (idPegawai && empCheck.idPegawai && normalizeTextKey(idPegawai) !== normalizeTextKey(empCheck.idPegawai)) {
      logAudit("getPegawaiDetail", empCheck.nama, "", "", "FAILED", { reason: "cross_employee_id_denied", requestedId: idPegawai });
      return { status: "error", authRequired: true, message: "Akses ditolak: hanya diperbolehkan mengakses data Anda sendiri.", backendVersion: BACKEND_VERSION };
    }
    effectiveLookupId = empCheck.idPegawai || empCheck.nama;
    effectiveLookupName = empCheck.nama;
  }

  const ss = getSpreadsheet();
  const targetDmy = toDmy(paramTanggal) || getJakartaDateStr();
  const ctx = buildAssignmentContext(ss, targetDmy);
  const emp = findEmployeeInList(ctx.employees, effectiveLookupId, effectiveLookupName);
  if (!emp) {
    return { status: "error", message: "Pegawai tidak ditemukan.", backendVersion: BACKEND_VERSION };
  }
  const assignmentCtx = (targetDmy === getJakartaDateStr())
    ? Object.assign({}, ctx, { referenceMinutes: getJakartaNowMinutes() })
    : ctx;
  const assignment = getEffectiveWorkAssignment(emp.idPegawai || emp.nama, targetDmy, assignmentCtx);

  if (!ownerCheck.ok) {
    logAudit("getPegawaiDetail", empCheck.nama, "", "", "SUCCESS", { self: true });
    return {
      status: "success",
      pegawai: serializeEmployeePublic(emp),
      tanggal: targetDmy,
      effectiveAssignment: assignment,
      backendVersion: BACKEND_VERSION
    };
  }

  const placementHistory = ctx.penempatanRows.filter(function(p) {
    return employeeMatches(p.idPegawai, p.nama, emp);
  });
  const absenceToday = ctx.absenceRows.find(function(a) {
    return a.tanggal === targetDmy && employeeMatches(a.idPegawai, a.nama, emp);
  }) || null;

  logAudit("getPegawaiDetail", "Owner", "", "", "SUCCESS", { targetNama: emp.nama });
  return {
    status: "success",
    pegawai: serializeEmployeeForOwner(emp),
    tanggal: targetDmy,
    effectiveAssignment: assignment,
    placementHistory: placementHistory,
    absenceToday: absenceToday,
    backendVersion: BACKEND_VERSION
  };
}

// ==================== PROCESS FORM (DATANG / PULANG / IZIN) ====================

function processForm(data, authTokens) {
  const empTok = (authTokens && authTokens.employeeToken) || (data && data.employeeToken) || "";
  const empAuth = checkEmployeeToken(empTok);
  if (!empAuth.ok) {
    logAudit("processForm", (data && (data.nama || data.idPegawai)) || "anonymous", "", "", "FAILED", { reason: "unauthorized" });
    return {
      status: "error",
      authRequired: true,
      message: empAuth.message || "Autentikasi pegawai diperlukan sebelum mengirim absensi.",
      backendVersion: BACKEND_VERSION
    };
  }

  if (data && data.nama && normalizeTextKey(data.nama) !== normalizeTextKey(empAuth.nama)) {
    logAudit("processForm", empAuth.nama, "", "", "FAILED", { reason: "identity_spoofing_nama", requestedNama: data.nama });
    return {
      status: "error",
      authRequired: true,
      message: "Akses ditolak: nama pegawai tidak sesuai dengan akun yang sedang login.",
      backendVersion: BACKEND_VERSION
    };
  }
  if (data && data.idPegawai && empAuth.idPegawai && normalizeTextKey(data.idPegawai) !== normalizeTextKey(empAuth.idPegawai)) {
    logAudit("processForm", empAuth.nama, "", "", "FAILED", { reason: "identity_spoofing_id", requestedId: data.idPegawai });
    return {
      status: "error",
      authRequired: true,
      message: "Akses ditolak: ID pegawai tidak sesuai dengan akun yang sedang login.",
      backendVersion: BACKEND_VERSION
    };
  }

  const rl = checkRateLimit(empTok, "processForm", 10, 60);
  if (!rl.allowed) {
    logAudit("processForm", empAuth.nama, "", "", "FAILED", { reason: "rate_limit", retryAfterSeconds: rl.retryAfterSeconds });
    return {
      status: "error",
      rateLimited: true,
      retryAfterSeconds: rl.retryAfterSeconds,
      message: "Batas pengiriman absensi tercapai (maksimal 10 kali per jam). Coba lagi nanti.",
      backendVersion: BACKEND_VERSION
    };
  }

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
    const emp = findEmployeeInList(ctx.employees, empAuth.idPegawai || empAuth.nama, empAuth.nama);
    if (!emp) {
      logAudit("processForm", empAuth.nama, "", "", "FAILED", { reason: "employee_inactive_or_missing" });
      return {
        status: "error",
        message: "Pegawai \"" + (empAuth.nama || "-") + "\" tidak ditemukan atau berstatus nonaktif.",
        backendVersion: BACKEND_VERSION
      };
    }

    const empId = emp.idPegawai || "";
    const canonicalNama = emp.nama;
    const empNormKey = normalizeTextKey(canonicalNama);
    
    // Handling Izin / Sakit (Master ke DataKetidakhadiran + sinkron AbsenIzin & Data_Absensi anti-duplikat)
    if (data.status === "IZIN" || data.status === "SAKIT") {
      const sheetData = ss.getSheetByName("Data_Absensi");
      if (sheetData) {
        const absCheckVals = sheetData.getDataRange().getValues();
        const absCheckDisp = sheetData.getDataRange().getDisplayValues();
        for (let i = 1; i < absCheckVals.length; i++) {
          const rTgl = toDmy(absCheckDisp[i] && absCheckDisp[i][0] ? absCheckDisp[i][0] : absCheckVals[i][0]);
          const rSts = String(absCheckVals[i][7] || "").trim().toUpperCase();
          if (rTgl === tanggalStr && normalizeTextKey(absCheckVals[i][1]) === empNormKey && rSts !== "IZIN" && rSts !== "DIBATALKAN") {
            return {
              status: "error",
              message: canonicalNama + " sudah melakukan absen DATANG pada tanggal " + tanggalStr + ". Tidak dapat mengajukan izin/sakit.",
              backendVersion: BACKEND_VERSION
            };
          }
        }
      }

      const jenisKeterangan = data.jenisIzin || (data.status === "SAKIT" ? "Sakit" : "Izin");
      const normStatus = jenisKeterangan.toUpperCase().indexOf("SAKIT") !== -1 ? "SAKIT" : "IZIN";
      const filename = jenisKeterangan + "-" + canonicalNama.replace(/\s+/g, '-') + "-" + new Date().getTime() + ".jpg";
      const imageUrl = uploadImageToDrive(data.image, filename);

      // 1. Sinkronkan ke master DataKetidakhadiran dengan deduplikasi ID Pegawai + Tanggal (abaikan DIBATALKAN)
      const sheetKet = ensureDataKetidakhadiranSheet(ss);
      const existingKet = readAllKetidakhadiranRows(ss);
      const existingMatch = existingKet.find(function(k) {
        return k.tanggal === tanggalStr && employeeMatches(k.idPegawai, k.nama, emp);
      });

      const effIzin = getEffectiveWorkAssignment(empId || canonicalNama, tanggalStr, ctx);
      const outIzin = effIzin.outletEfektif || data.outlet || "-";
      const posIzin = data.posisi || effIzin.posisiPenugasan || effIzin.posisiPermanen || "-";
      const nowTs = getJakartaTimestampStr(dateObj);
      const refId = "REF-" + toYmd(tanggalStr).replace(/-/g, "") + "-" + (empId || empNormKey.replace(/\s+/g, "_"));

      if (existingMatch) {
        sheetKet.getRange(existingMatch.rowIndex, 4).setValue(outIzin);
        sheetKet.getRange(existingMatch.rowIndex, 5).setValue(posIzin);
        sheetKet.getRange(existingMatch.rowIndex, 6).setValue(normStatus);
        sheetKet.getRange(existingMatch.rowIndex, 7).setValue(data.alasan || "-");
        if (imageUrl) sheetKet.getRange(existingMatch.rowIndex, 8).setValue(imageUrl);
        sheetKet.getRange(existingMatch.rowIndex, 9).setValue(canonicalNama);
        sheetKet.getRange(existingMatch.rowIndex, 10).setValue(nowTs);
        sheetKet.getRange(existingMatch.rowIndex, 11).setValue("Sync Form Pegawai [" + refId + "]");
      } else {
        prependDataRow(sheetKet, [
          tanggalStr,
          empId,
          canonicalNama,
          outIzin,
          posIzin,
          normStatus,
          data.alasan || "-",
          imageUrl,
          canonicalNama,
          nowTs,
          "Sync Form Pegawai [" + refId + "]"
        ]);
      }
      
      // 2. Sheet AbsenIzin: Kolom (A - G) deduplikasi per (tanggalStr, canonicalNama)
      const sheetIzin = ss.getSheetByName("AbsenIzin");
      if (sheetIzin) {
        const izinVals = sheetIzin.getDataRange().getValues();
        const izinDisp = sheetIzin.getDataRange().getDisplayValues();
        let izinRowIdx = -1;
        for (let i = 1; i < izinVals.length; i++) {
          const rTgl = toDmy(izinDisp[i] && izinDisp[i][0] ? izinDisp[i][0] : izinVals[i][0]);
          if (rTgl === tanggalStr && normalizeTextKey(izinVals[i][1]) === empNormKey) {
            izinRowIdx = i + 1;
            break;
          }
        }
        if (izinRowIdx !== -1) {
          sheetIzin.getRange(izinRowIdx, 3).setValue(posIzin);
          sheetIzin.getRange(izinRowIdx, 4).setValue(jenisKeterangan);
          sheetIzin.getRange(izinRowIdx, 5).setValue(data.alasan || "-");
          sheetIzin.getRange(izinRowIdx, 6).setValue(jam);
          if (imageUrl) sheetIzin.getRange(izinRowIdx, 7).setValue(imageUrl);
        } else {
          prependDataRow(sheetIzin, [
            tanggalStr, 
            canonicalNama, 
            posIzin,
            jenisKeterangan,
            data.alasan || "-",
            jam,
            imageUrl
          ]);
        }
      }
      
      // 3. Data_Absensi: Kolom (A - O) tetap dipertahankan dengan update in-place jika baris IZIN aktif sudah ada (baris DIBATALKAN diabaikan)
      const absVals = sheetData.getDataRange().getValues();
      const absDisp = sheetData.getDataRange().getDisplayValues();
      let izinAbsRowIdx = -1;
      for (let i = 1; i < absVals.length; i++) {
        const rTgl = toDmy(absDisp[i] && absDisp[i][0] ? absDisp[i][0] : absVals[i][0]);
        const rSts = String(absVals[i][7] || "").trim().toUpperCase();
        if (rTgl === tanggalStr && normalizeTextKey(absVals[i][1]) === empNormKey && rSts === "IZIN") {
          izinAbsRowIdx = i + 1;
          break;
        }
      }
      if (izinAbsRowIdx !== -1) {
        sheetData.getRange(izinAbsRowIdx, 3).setValue(posIzin);
        if (imageUrl) sheetData.getRange(izinAbsRowIdx, 12).setValue(imageUrl);
        sheetData.getRange(izinAbsRowIdx, 14).setValue(data.alasan || "-");
      } else {
        prependDataRow(sheetData, [
          tanggalStr,    // A. Tanggal
          canonicalNama, // B. Nama
          posIzin,       // C. Posisi
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

      logAudit("processForm", canonicalNama, "", "", "SUCCESS", { status: normStatus, outlet: outIzin, jenis: jenisKeterangan });
      return { status: "success", message: "Data " + jenisKeterangan + " berhasil dicatat.", backendVersion: BACKEND_VERSION };
    }
    
    const sheetData = ss.getSheetByName("Data_Absensi");
    const dataRange = sheetData.getDataRange().getValues();
    const displayRange = sheetData.getDataRange().getDisplayValues();

    if (data.status === "DATANG") {
      // Kumpulkan seluruh transaksi DATANG hari ini milik pegawai (di outlet mana pun)
      const openRowsToday = [];
      const closedRowsToday = [];
      for (let i = 1; i < dataRange.length; i++) {
        const rowTanggal = toDmy(displayRange[i] && displayRange[i][0] ? displayRange[i][0] : dataRange[i][0]);
        const rowSts = String(dataRange[i][7] || "").trim().toUpperCase();
        if (rowTanggal !== tanggalStr || normalizeTextKey(dataRange[i][1]) !== empNormKey || rowSts === "IZIN" || rowSts === "DIBATALKAN") continue;
        const rJd = parseSheetTime(displayRange[i] && displayRange[i][4] !== "-" ? displayRange[i][4] : dataRange[i][4]);
        const rJp = parseSheetTime(displayRange[i] && displayRange[i][5] !== "-" ? displayRange[i][5] : dataRange[i][5]);
        if (rJd && rJd !== "-") {
          const item = { rowIndex: i + 1, outlet: String(dataRange[i][3] || "").trim(), jamDatang: rJd, jamPulang: rJp };
          if (rJp === "-") {
            openRowsToday.push(item);
          } else {
            closedRowsToday.push(item);
          }
        }
      }

      if (openRowsToday.length > 0) {
        return {
          status: "error",
          message: "Anda masih memiliki absensi DATANG yang belum PULANG di outlet " + (openRowsToday[0].outlet || "-") + " (" + openRowsToday[0].jamDatang + "). Selesaikan absen PULANG terlebih dahulu.",
          backendVersion: BACKEND_VERSION
        };
      }

      // Identifikasi ID jadwal shift yang sudah diselesaikan hari ini (untuk split shift)
      const snapToday = readAllSnapshotRows(ss).filter(function(s) {
        return s.tanggal === tanggalStr && employeeMatches(s.idPegawai, s.nama, emp);
      });
      const completedScheduleIds = [];
      closedRowsToday.forEach(function(closed) {
        const matchedSnap = snapToday.find(function(s) {
          return normalizeOutletKey(s.outlet) === normalizeOutletKey(closed.outlet) && s.waktuDatang === closed.jamDatang;
        });
        if (matchedSnap && matchedSnap.idJadwal && completedScheduleIds.indexOf(matchedSnap.idJadwal) === -1) {
          completedScheduleIds.push(matchedSnap.idJadwal);
        }
      });

      const scheduledToday = ctx.jadwalRows.filter(function(j) {
        return j.tanggal === tanggalStr && j.statusJadwal === "DIJADWALKAN" && employeeMatches(j.idPegawai, j.nama, emp);
      });
      const remainingScheduled = scheduledToday.filter(function(j) {
        return completedScheduleIds.indexOf(j.idJadwal) === -1;
      });

      if (closedRowsToday.length > 0 && remainingScheduled.length === 0) {
        return { status: "error", message: "Anda sudah melakukan absen DATANG hari ini.", backendVersion: BACKEND_VERSION };
      }

      // Gunakan resolver jadwal terpusat getEffectiveWorkAssignment() dengan konteks outlet & jam shift
      const assignmentCtx = Object.assign({}, ctx, {
        preferredOutlet: data.outlet,
        referenceMinutes: jamSekarangMenit,
        excludeScheduleIds: completedScheduleIds,
        fallbackPosisi: data.posisi,
        fallbackName: canonicalNama
      });
      const effectiveAssign = getEffectiveWorkAssignment(empId || canonicalNama, tanggalStr, assignmentCtx);

      if (effectiveAssign.ambiguous) {
        return {
          status: "error",
          message: effectiveAssign.ambiguityReason || "Jadwal kerja hari ini ambigu. Hubungi Owner untuk memastikan shift & outlet Anda.",
          backendVersion: BACKEND_VERSION
        };
      }
      if (effectiveAssign.sumberJadwal === "JADWAL_HARIAN" && effectiveAssign.outletMismatch) {
        return {
          status: "error",
          message: "Outlet yang dipilih (" + (data.outlet || "-") + ") tidak sesuai jadwal aktif hari ini (" + (effectiveAssign.outletEfektif || "-") + ").",
          backendVersion: BACKEND_VERSION
        };
      }

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
      let effectivePosisi = data.posisi || effectiveAssign.posisiPenugasan || "";
      let jamMasukEfektif = getJamMasukPosisi(effectivePosisi);
      let jamPulangEfektif = getJamPulangPosisi(effectivePosisi);
      let sumberSnapshot = effectiveAssign.sumberJadwal || "DATA_POSISI";

      if (effectiveAssign.sumberJadwal === "JADWAL_HARIAN") {
        if (!data.posisi || normalizeTextKey(data.posisi) === normalizeTextKey(effectiveAssign.posisiPenugasan)) {
          effectivePosisi = effectiveAssign.posisiPenugasan || effectivePosisi;
          jamMasukEfektif = effectiveAssign.jamMasukEfektif || jamMasukEfektif;
          jamPulangEfektif = effectiveAssign.jamPulangEfektif || jamPulangEfektif;
        }
      } else if (effectiveAssign.sumberJadwal === "DATA_PENEMPATAN") {
        const isSameAsPlacementOutlet = !effectiveOutlet || !effectiveAssign.outletEfektif || normalizeOutletKey(effectiveOutlet) === normalizeOutletKey(effectiveAssign.outletEfektif);
        if (isSameAsPlacementOutlet) {
          if (!data.posisi || normalizeTextKey(data.posisi) === normalizeTextKey(effectiveAssign.posisiPenugasan)) {
            effectivePosisi = effectiveAssign.posisiPenugasan || effectivePosisi;
            jamMasukEfektif = effectiveAssign.jamMasukEfektif || jamMasukEfektif;
            jamPulangEfektif = effectiveAssign.jamPulangEfektif || jamPulangEfektif;
          }
        } else {
          // Backup ad-hoc di outlet lain tanpa JadwalHarian: jangan pakai jam penempatan outlet asal secara diam-diam
          sumberSnapshot = "MANUAL_OUTLET_OVERRIDE";
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

      const filename = "Masuk-" + canonicalNama.replace(/\s+/g, '-') + "-" + new Date().getTime() + ".jpg";
      const imageUrl = uploadImageToDrive(data.image, filename);
      
      // (A-O) tetap 15 kolom identik tanpa mengubah struktur Data_Absensi
      prependDataRow(sheetData, [
        tanggalStr,      // A
        canonicalNama,   // B
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
      const snapshotKey = tanggalStr + "|" + empNormKey + "|" + normalizeOutletKey(effectiveOutlet) + "|" + jam;
      prependDataRow(snapshotSheet, [
        snapshotKey,
        tanggalStr,
        empId,
        canonicalNama,
        effectiveAssign.idJadwal || "",
        effectiveOutlet,
        effectiveAssign.posisiPermanen || effectivePosisi,
        effectivePosisi,
        jamMasukEfektif,
        jamPulangEfektif,
        effectiveAssign.jenisPenugasan || "NORMAL",
        sumberSnapshot,
        jam
      ]);
      
      logAudit("processForm", canonicalNama, "", "", "SUCCESS", { status: "DATANG", outlet: effectiveOutlet, statusMasuk: statusMasuk });
      return {
        status: "success",
        message: "Absen DATANG berhasil dicatat.",
        assignmentUsed: {
          outlet: effectiveOutlet,
          posisiPenugasan: effectivePosisi,
          jamMasukEfektif: jamMasukEfektif,
          jamPulangEfektif: jamPulangEfektif,
          sumberJadwal: sumberSnapshot
        },
        backendVersion: BACKEND_VERSION
      };
      
    } else if (data.status === "PULANG") {
      const normPrefOutlet = normalizeOutletKey(data.outlet || "");
      const openRowsToday = [];
      let alreadyClosedToday = false;

      for (let i = 1; i < dataRange.length; i++) {
        const rowTanggal = toDmy(displayRange[i] && displayRange[i][0] ? displayRange[i][0] : dataRange[i][0]);
        const rowSts = String(dataRange[i][7] || "").trim().toUpperCase();
        if (rowTanggal !== tanggalStr || normalizeTextKey(dataRange[i][1]) !== empNormKey || rowSts === "IZIN" || rowSts === "DIBATALKAN") continue;
        const rowJamPulang = parseSheetTime(displayRange[i] && displayRange[i][5] !== "-" ? displayRange[i][5] : dataRange[i][5]);
        if (rowJamPulang === "-") {
          openRowsToday.push({ rowIndex: i + 1, outlet: String(dataRange[i][3] || "").trim() });
        } else {
          alreadyClosedToday = true;
        }
      }

      let userRowIndex = -1;
      let targetShiftDateDmy = tanggalStr;
      let isOvernightRow = false;

      if (openRowsToday.length > 0) {
        const exactMatch = normPrefOutlet
          ? openRowsToday.find(function(r) { return normalizeOutletKey(r.outlet) === normPrefOutlet; })
          : null;
        if (exactMatch) {
          userRowIndex = exactMatch.rowIndex;
        } else if (openRowsToday.length === 1) {
          userRowIndex = openRowsToday[0].rowIndex;
        } else {
          return {
            status: "error",
            message: "Terdapat lebih dari satu absensi DATANG terbuka hari ini. Pilih outlet yang sesuai saat absen PULANG.",
            backendVersion: BACKEND_VERSION
          };
        }
      } else {
        // Cek shift lintas hari (kemarin belum PULANG dan snapshot/jadwalnya memang lintas tengah malam)
        const yesterdayDmy = toDmy(addDaysYmd(toYmd(tanggalStr), -1));
        const allSnaps = readAllSnapshotRows(ss);
        const overnightCandidates = [];
        for (let i = 1; i < dataRange.length; i++) {
          const rowTanggal = toDmy(displayRange[i] && displayRange[i][0] ? displayRange[i][0] : dataRange[i][0]);
          const rowSts = String(dataRange[i][7] || "").trim().toUpperCase();
          if (rowTanggal !== yesterdayDmy || normalizeTextKey(dataRange[i][1]) !== empNormKey || rowSts === "IZIN" || rowSts === "DIBATALKAN") continue;
          const rowJamPulang = parseSheetTime(displayRange[i] && displayRange[i][5] !== "-" ? displayRange[i][5] : dataRange[i][5]);
          if (rowJamPulang !== "-") continue;
          const rowJd = parseSheetTime(displayRange[i] && displayRange[i][4] !== "-" ? displayRange[i][4] : dataRange[i][4]);
          const rowOut = String(dataRange[i][3] || "").trim();
          const sMatch = allSnaps.find(function(s) {
            return s.tanggal === yesterdayDmy && normalizeTextKey(s.nama) === empNormKey && normalizeOutletKey(s.outlet) === normalizeOutletKey(rowOut) && (!rowJd || rowJd === "-" || s.waktuDatang === rowJd);
          });
          if (sMatch && isValidHHMM(sMatch.jamMasukEfektif) && isValidHHMM(sMatch.jamPulangEfektif) && timeStrToMinutes(sMatch.jamPulangEfektif) <= timeStrToMinutes(sMatch.jamMasukEfektif)) {
            overnightCandidates.push({ rowIndex: i + 1, outlet: rowOut });
          }
        }
        if (overnightCandidates.length > 0) {
          const exactOvernight = normPrefOutlet
            ? overnightCandidates.find(function(r) { return normalizeOutletKey(r.outlet) === normPrefOutlet; })
            : null;
          if (exactOvernight || overnightCandidates.length === 1) {
            userRowIndex = (exactOvernight || overnightCandidates[0]).rowIndex;
            targetShiftDateDmy = yesterdayDmy;
            isOvernightRow = true;
          }
        }
      }

      if (userRowIndex === -1) {
        if (alreadyClosedToday) {
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
      const expectedKey = targetShiftDateDmy + "|" + empNormKey + "|" + normalizeOutletKey(rowOutlet) + "|" + jamDatang;
      let snap = snapshotRows.find(function(s) { return s.snapshotKey === expectedKey; });
      if (!snap && jamDatang && jamDatang !== "-") {
        snap = snapshotRows.find(function(s) {
          return s.tanggal === targetShiftDateDmy &&
            normalizeTextKey(s.nama) === empNormKey &&
            normalizeOutletKey(s.outlet) === normalizeOutletKey(rowOutlet) &&
            s.waktuDatang === jamDatang;
        });
      }
      if (!snap) {
        const outletSnaps = snapshotRows.filter(function(s) {
          return s.tanggal === targetShiftDateDmy && normalizeTextKey(s.nama) === empNormKey && normalizeOutletKey(s.outlet) === normalizeOutletKey(rowOutlet);
        });
        if (outletSnaps.length === 1) {
          snap = outletSnaps[0];
        }
      }

      const posisiReferensiPulang = snap ? (snap.posisiPenugasan || rowPosisi) : rowPosisi;
      const jamMasukJadwal = (snap && isValidHHMM(snap.jamMasukEfektif)) ? snap.jamMasukEfektif : "";
      let jamPulangJadwal = (snap && snap.jamPulangEfektif && snap.jamPulangEfektif !== "-") ? snap.jamPulangEfektif : "";
      if (!jamPulangJadwal) {
        // Fallback hanya jika transaksi DATANG lama sebelum SnapshotAbsensi ada
        const placementAtDatang = getEffectivePlacementForDate(emp, toYmd(targetShiftDateDmy), ctx.penempatanRows);
        if (placementAtDatang && normalizeTextKey(placementAtDatang.posisi) === normalizeTextKey(posisiReferensiPulang) && placementAtDatang.jamPulang) {
          jamPulangJadwal = placementAtDatang.jamPulang;
        } else {
          jamPulangJadwal = getJamPulangPosisi(posisiReferensiPulang);
        }
      }

      // Validasi Jam Pulang (Enforcement Backend) menggunakan jam pulang dari snapshot saat DATANG
      if (isPosisiHoursEnabled(posisiReferensiPulang, ss)) {
        const startMinRef = jamMasukJadwal ? timeStrToMinutes(jamMasukJadwal) : (jamDatang && jamDatang !== "-" ? timeStrToMinutes(jamDatang) : 0);
        let targetEndMin = timeStrToMinutes(jamPulangJadwal);
        const shiftCrossesMidnight = isOvernightRow || (jamMasukJadwal && targetEndMin <= startMinRef);
        if (shiftCrossesMidnight && targetEndMin <= startMinRef) {
          targetEndMin += 1440;
        }
        const currentCompareMin = isOvernightRow ? (jamSekarangMenit + 1440) : jamSekarangMenit;
        if (currentCompareMin < targetEndMin) {
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
          var datangMenit = jamH * 60 + jamM;
          var totalMins = isOvernightRow ? ((jamSekarangMenit + 1440) - datangMenit) : (jamSekarangMenit - datangMenit);
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

      var filename = "Pulang-" + canonicalNama.replace(/\s+/g, '-') + "-" + new Date().getTime() + ".jpg";
      var imageUrl = uploadImageToDrive(data.image, filename);
      
      // Update data di baris user (Urutan getRange adalah 1-based indexing)
      sheetData.getRange(userRowIndex, 6).setValue(jam);           // F (Jam Pulang)
      sheetData.getRange(userRowIndex, 7).setValue(totalJamStr);   // G (Total Jam)
      sheetData.getRange(userRowIndex, 9).setValue(statusPulang);  // I (Status Pulang)
      sheetData.getRange(userRowIndex, 11).setValue(lokasiUrl || "-");    // K (Lokasi Pulang)
      sheetData.getRange(userRowIndex, 13).setValue(imageUrl);     // M (Foto Pulang)
      sheetData.getRange(userRowIndex, 15).setValue(keteranganPulang); // O (Keterangan Pulang)
      
      logAudit("processForm", canonicalNama, "", "", "SUCCESS", { status: "PULANG", outlet: rowOutlet, statusPulang: statusPulang, totalJam: totalJamStr });
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

function getPegawai(ownerToken) {
  const auth = checkOwnerToken(ownerToken);
  if (!auth.ok) {
    logAudit("getPegawai", "anonymous", "", "", "FAILED", { reason: "unauthorized" });
    return { status: "error", authRequired: true, message: auth.message, backendVersion: BACKEND_VERSION };
  }
  const ss = getSpreadsheet();
  const pegSheet = ss.getSheetByName("DataPegawai");
  if (pegSheet) ensurePinColumns(pegSheet);
  const safeEmps = getActiveEmployeesSafe(ss);
  const pegawai = safeEmps.map(function(e) { return e.nama; });
  logAudit("getPegawai", "Owner", "", "", "SUCCESS", { count: pegawai.length });
  return { status: "success", data: pegawai, backendVersion: BACKEND_VERSION };
}

function getRiwayat(nama, authOrToken) {
  const tokens = (authOrToken && typeof authOrToken === "object")
    ? authOrToken
    : { ownerToken: authOrToken || "", employeeToken: "" };
  const ownerCheck = tokens.ownerToken ? checkOwnerToken(tokens.ownerToken) : { ok: false };
  const empCheck = (!ownerCheck.ok && tokens.employeeToken) ? checkEmployeeToken(tokens.employeeToken) : { ok: false };

  if (!ownerCheck.ok && !empCheck.ok) {
    logAudit("getRiwayat", nama || "anonymous", "", "", "FAILED", { reason: "unauthorized" });
    return { status: "error", authRequired: true, message: "Autentikasi diperlukan untuk melihat riwayat absensi.", backendVersion: BACKEND_VERSION };
  }

  let targetNama = nama;
  if (!ownerCheck.ok && empCheck.ok) {
    if (nama && normalizeTextKey(nama) !== normalizeTextKey(empCheck.nama)) {
      logAudit("getRiwayat", empCheck.nama, "", "", "FAILED", { reason: "cross_employee_denied", requestedNama: nama });
      return { status: "error", authRequired: true, message: "Akses ditolak: Anda hanya dapat melihat riwayat Anda sendiri.", backendVersion: BACKEND_VERSION };
    }
    targetNama = empCheck.nama;
  }

  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName("Data_Absensi");
  const values = sheet.getDataRange().getValues();
  const displayValues = sheet.getDataRange().getDisplayValues();
  const normNama = normalizeTextKey(targetNama);
  const absenceRows = readAllKetidakhadiranRows(ss);
  
  const riwayat = [];
  
  // Baris terbaru ada di row 2 (paling atas), jadi loop dari atas ke bawah
  // supaya "riwayat" tetap terurut dari yang terbaru.
  for (let i = 1; i < values.length; i++) {
    const rowSts = String(values[i][7] || "").trim().toUpperCase();
    if (!values[i][1] || rowSts === "DIBATALKAN") continue;
    if (normalizeTextKey(values[i][1]) === normNama) {
      const jamDatangParsed = (displayValues[i] && displayValues[i][4] && displayValues[i][4] !== "-") 
        ? parseSheetTime(displayValues[i][4]) 
        : parseSheetTime(values[i][4]);
      const jamPulangParsed = (displayValues[i] && displayValues[i][5] && displayValues[i][5] !== "-") 
        ? parseSheetTime(displayValues[i][5]) 
        : parseSheetTime(values[i][5]);

      const tglParsed = toDmy(displayValues[i] && displayValues[i][0] ? displayValues[i][0] : values[i][0]);
      let ketLabel = "HADIR";
      if (rowSts === "IZIN") {
        const matchedAbs = absenceRows.find(function(a) {
          return a.tanggal === tglParsed && normalizeTextKey(a.nama) === normNama;
        });
        if (matchedAbs && matchedAbs.status === "SAKIT") {
          ketLabel = "SAKIT";
        } else {
          const ketStr = String(values[i][13] || "").toLowerCase();
          ketLabel = ketStr.indexOf("sakit") !== -1 ? "SAKIT" : "IZIN";
        }
      }

      riwayat.push({
        tanggal: tglParsed,
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
        keterangan: ketLabel,
        keteranganDatang: values[i][13] || "-",
        keteranganPulang: values[i][14] || "-"
      });
      if (riwayat.length >= 31) break; 
    }
  }
  logAudit("getRiwayat", ownerCheck.ok ? "Owner" : empCheck.nama, "", "", "SUCCESS", { targetNama: targetNama, count: riwayat.length });
  return { status: "success", data: riwayat, backendVersion: BACKEND_VERSION };
}

function getRingkasanHarian(paramTanggal, ownerToken, employeeToken) {
  const ownerAuth = ownerToken ? checkOwnerToken(ownerToken) : { ok: false };
  const empAuth = (!ownerAuth.ok && employeeToken) ? checkEmployeeToken(employeeToken) : { ok: false };
  if (!ownerAuth.ok && !empAuth.ok) {
    logAudit("getRingkasanHarian", "anonymous", "", "", "FAILED", { reason: "unauthorized" });
    return { status: "error", authRequired: true, message: ownerAuth.message || "Autentikasi diperlukan.", backendVersion: BACKEND_VERSION };
  }

  const filterNormNama = (!ownerAuth.ok && empAuth.ok) ? normalizeTextKey(empAuth.nama) : "";

  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName("Data_Absensi");
  const targetDate = toDmy(paramTanggal) || getJakartaDateStr();
  const ctx = buildAssignmentContext(ss, targetDate);

  const ringkasan = [];
  if (sheet) {
    const values = sheet.getDataRange().getValues();
    const displayValues = sheet.getDataRange().getDisplayValues();
    for (let i = 1; i < values.length; i++) {
      const rowSts = String(values[i][7] || "").trim().toUpperCase();
      if (!values[i][1] || rowSts === "DIBATALKAN") continue;
      if (filterNormNama && normalizeTextKey(values[i][1]) !== filterNormNama) continue;
      const rawVal = displayValues[i] && displayValues[i][0] ? displayValues[i][0] : values[i][0];
      const rowDate = toDmy(rawVal);

      if (rowDate === targetDate) {
        const jamDatangParsed = (displayValues[i] && displayValues[i][4] && displayValues[i][4] !== "-") 
          ? parseSheetTime(displayValues[i][4]) 
          : parseSheetTime(values[i][4]);
        const jamPulangParsed = (displayValues[i] && displayValues[i][5] && displayValues[i][5] !== "-") 
          ? parseSheetTime(displayValues[i][5]) 
          : parseSheetTime(values[i][5]);

        const empKey = normalizeTextKey(values[i][1]);
        let ketLabel = "HADIR";
        if (rowSts === "IZIN") {
          const matchedAbs = ctx.absenceRows.find(function(a) {
            return a.tanggal === rowDate && normalizeTextKey(a.nama) === empKey;
          });
          if (matchedAbs && matchedAbs.status === "SAKIT") {
            ketLabel = "SAKIT";
          } else {
            const alasanStr = String(values[i][13] || "").toLowerCase();
            ketLabel = alasanStr.indexOf("sakit") !== -1 ? "SAKIT" : "IZIN";
          }
        }

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
          keterangan: ketLabel,
          alasan: values[i][13] && values[i][13] !== "-" ? values[i][13] : ""
        });
      }
    }
  }

  // Sertakan status kehadiran: penuh untuk Owner, atau strictly data sendiri jika employeeToken
  const fullKehadiran = computeKehadiranHarianInternal(targetDate, ctx);
  if (filterNormNama) {
    const selfList = (fullKehadiran.data || []).filter(function(r) {
      return normalizeTextKey(r.nama) === filterNormNama;
    });
    logAudit("getRingkasanHarian", empAuth.nama, "", "", "SUCCESS", { selfOnly: true, tanggal: targetDate });
    return {
      status: "success",
      data: ringkasan,
      fullList: selfList,
      tanggal: targetDate,
      backendVersion: BACKEND_VERSION
    };
  }

  logAudit("getRingkasanHarian", "Owner", "", "", "SUCCESS", { tanggal: targetDate, count: ringkasan.length });
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

function getLaporanBulanan(bulan, ownerToken) {
  const auth = checkOwnerToken(ownerToken);
  if (!auth.ok) {
    return { status: "error", authRequired: true, message: auth.message, backendVersion: BACKEND_VERSION };
  }

  const bulanPrefix = String(bulan || "").split("-");
  const mmFilter = (bulanPrefix.length >= 2 && bulanPrefix[1] && bulanPrefix[0])
    ? ("/" + ("0" + bulanPrefix[1]).slice(-2) + "/" + bulanPrefix[0])
    : "";
  
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName("Data_Absensi");
  const values = sheet ? sheet.getDataRange().getValues() : [];
  const displayValues = sheet ? sheet.getDataRange().getDisplayValues() : [];
  const absenceRows = readAllKetidakhadiranRows(ss); // Hanya status aktif (DIBATALKAN dikecualikan)
  const penempatanRows = readAllPenempatanRows(ss);

  const summaryMap = {};
  const outletMap = {};
  const hadirDates = {};
  const absIzinByEmpDate = {};

  function ensureEmployeeBucket(namaDisplay, posisiDisplay) {
    const empKey = normalizeTextKey(namaDisplay);
    if (!summaryMap[empKey]) {
      summaryMap[empKey] = {
        nama: String(namaDisplay).trim(),
        posisi: posisiDisplay || "-",
        totalMenitKerja: 0,
        jumlahJamLembur: 0,
        jumlahTelat: 0,
        jumlahMasuk: 0,
        jumlahIzin: 0,
        jumlahSakit: 0,
        jumlahAlpa: 0,
        jumlahLibur: 0
      };
    } else if ((!summaryMap[empKey].posisi || summaryMap[empKey].posisi === "-") && posisiDisplay) {
      summaryMap[empKey].posisi = posisiDisplay;
    }
    return summaryMap[empKey];
  }

  function ensureOutletBucket(outletName) {
    if (!outletName || outletName === "-" || String(outletName).trim() === "") return null;
    const cleanOut = String(outletName).trim();
    const outKey = normalizeOutletKey(cleanOut);
    if (!outletMap[outKey]) {
      outletMap[outKey] = {
        outlet: cleanOut,
        totalMenitKerja: 0,
        jumlahJamLembur: 0,
        jumlahTelat: 0,
        jumlahMasuk: 0,
        jumlahIzin: 0,
        jumlahSakit: 0,
        jumlahAlpa: 0,
        pegawai: {}
      };
    }
    return outletMap[outKey];
  }

  // 1. Proses Data_Absensi (termasuk riwayat historis pegawai yang di kemudian hari NONAKTIF)
  for (let i = 1; i < values.length; i++) {
    const rowSts = String(values[i][7] || "").trim().toUpperCase();
    if (!values[i][1] || rowSts === "DIBATALKAN") continue;
    const rawTgl = (displayValues[i] && displayValues[i][0]) ? displayValues[i][0] : values[i][0];
    const tgl = toDmy(rawTgl);
    if (!tgl || (mmFilter && tgl.indexOf(mmFilter) === -1)) {
      continue;
    }

    const nama = String(values[i][1]).trim();
    const empKey = normalizeTextKey(nama);
    const posisi = String(values[i][2] || "-").trim();
    let outlet = String(values[i][3] || "").trim();
    const jamDatangVal = parseSheetTime(displayValues[i] && displayValues[i][4] !== "-" ? displayValues[i][4] : values[i][4]);

    if (rowSts === "IZIN") {
      const empTglKey = empKey + "|" + tgl;
      if (!absIzinByEmpDate[empTglKey]) {
        absIzinByEmpDate[empTglKey] = {
          nama: nama,
          posisi: posisi,
          outlet: outlet,
          keteranganDatang: String(values[i][13] || "").trim()
        };
      }
      continue;
    }

    if (!jamDatangVal || jamDatangVal === "-") continue;

    const sts = ensureEmployeeBucket(nama, posisi);
    if ((!outlet || outlet === "-") && penempatanRows.length > 0) {
      const pl = penempatanRows.find(function(p) { return p.status === "AKTIF" && normalizeTextKey(p.nama) === empKey; });
      if (pl && pl.outlet) outlet = pl.outlet;
    }
    const outBucket = ensureOutletBucket(outlet);

    const isTelat = (rowSts === "TELAT");
    const totJam = values[i][6];
    let menit = 0;
    let lembur = 0;

    if (totJam && totJam !== "-") {
      const parts = totJam.toString().match(/(\d+)j\s*(\d+)m/);
      if (parts && parts.length === 3) {
        const rH = parseInt(parts[1], 10);
        const rM = parseInt(parts[2], 10);
        menit = (rH * 60) + rM;
        if (rH >= 13) {
          lembur = (rH - 12);
        }
      }
    }

    hadirDates[empKey + "|" + tgl] = true;
    sts.jumlahMasuk += 1;
    if (isTelat) sts.jumlahTelat += 1;
    sts.totalMenitKerja += menit;
    sts.jumlahJamLembur += lembur;

    if (outBucket) {
      outBucket.jumlahMasuk += 1;
      if (isTelat) outBucket.jumlahTelat += 1;
      outBucket.totalMenitKerja += menit;
      outBucket.jumlahJamLembur += lembur;

      if (!outBucket.pegawai[empKey]) {
        outBucket.pegawai[empKey] = {
          nama: sts.nama,
          posisi: posisi,
          jumlahMasuk: 0,
          totalMenitKerja: 0,
          jumlahJamLembur: 0,
          jumlahTelat: 0
        };
      }
      const pStats = outBucket.pegawai[empKey];
      pStats.jumlahMasuk += 1;
      pStats.totalMenitKerja += menit;
      pStats.jumlahJamLembur += lembur;
      if (isTelat) pStats.jumlahTelat += 1;
    }
  }

  // 2. Gabungkan DataKetidakhadiran aktif (IZIN, SAKIT, ALPA, LIBUR) tanpa double-counting
  const countedKetidakhadiran = {};
  absenceRows.forEach(function(k) {
    if (!k.tanggal || (mmFilter && k.tanggal.indexOf(mmFilter) === -1)) return;
    const empKey = normalizeTextKey(k.nama);
    if (!empKey) return;
    const empTglKey = empKey + "|" + k.tanggal;

    // Jika pegawai sudah punya transaksi HADIR valid di tanggal tersebut, HADIR selalu menang (no double count ALPA/IZIN)
    if (hadirDates[empTglKey]) return;
    if (countedKetidakhadiran[empTglKey]) return;
    countedKetidakhadiran[empTglKey] = true;

    const sts = ensureEmployeeBucket(k.nama, k.posisi);
    let outletName = k.outlet;
    if ((!outletName || outletName === "-") && penempatanRows.length > 0) {
      const pl = penempatanRows.find(function(p) { return p.status === "AKTIF" && normalizeTextKey(p.nama) === empKey; });
      if (pl && pl.outlet) outletName = pl.outlet;
    }
    const outBucket = ensureOutletBucket(outletName);

    if (k.status === "SAKIT") {
      sts.jumlahSakit += 1;
      if (outBucket) outBucket.jumlahSakit += 1;
    } else if (k.status === "IZIN") {
      sts.jumlahIzin += 1;
      if (outBucket) outBucket.jumlahIzin += 1;
    } else if (k.status === "ALPA") {
      sts.jumlahAlpa += 1;
      if (outBucket) outBucket.jumlahAlpa += 1;
    } else if (k.status === "LIBUR") {
      sts.jumlahLibur += 1;
    }
  });

  // 3. Fallback baris IZIN lama di Data_Absensi yang belum tercatat di DataKetidakhadiran (hanya jika belum dihitung & bukan hari HADIR)
  Object.keys(absIzinByEmpDate).forEach(function(empTglKey) {
    if (hadirDates[empTglKey] || countedKetidakhadiran[empTglKey]) return;
    const rec = absIzinByEmpDate[empTglKey];
    const sts = ensureEmployeeBucket(rec.nama, rec.posisi);
    const isSakitLegacy = rec.keteranganDatang && rec.keteranganDatang.toLowerCase().indexOf("sakit") !== -1;
    const outBucket = ensureOutletBucket(rec.outlet);
    if (isSakitLegacy) {
      sts.jumlahSakit += 1;
      if (outBucket) outBucket.jumlahSakit += 1;
    } else {
      sts.jumlahIzin += 1;
      if (outBucket) outBucket.jumlahIzin += 1;
    }
  });
  
  const hasil = [];
  for (let key in summaryMap) {
    const sts = summaryMap[key];
    sts.totalJamKerja = Math.floor(sts.totalMenitKerja / 60) + "j " + (sts.totalMenitKerja % 60) + "m";
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
  
  return { status: "success", data: hasil, dataOutlet: hasilOutlet, backendVersion: BACKEND_VERSION };
}

function getRiwayatBulan(nama, bulan, authOrToken) {
  const tokens = (authOrToken && typeof authOrToken === "object")
    ? authOrToken
    : { ownerToken: authOrToken || "", employeeToken: "" };
  const ownerCheck = tokens.ownerToken ? checkOwnerToken(tokens.ownerToken) : { ok: false };
  const empCheck = (!ownerCheck.ok && tokens.employeeToken) ? checkEmployeeToken(tokens.employeeToken) : { ok: false };

  if (!ownerCheck.ok && !empCheck.ok) {
    logAudit("getRiwayatBulan", nama || "anonymous", "", "", "FAILED", { reason: "unauthorized" });
    return { status: "error", authRequired: true, message: "Autentikasi diperlukan untuk melihat riwayat absensi bulanan.", backendVersion: BACKEND_VERSION };
  }

  let targetNama = nama;
  if (!ownerCheck.ok && empCheck.ok) {
    if (nama && normalizeTextKey(nama) !== normalizeTextKey(empCheck.nama)) {
      logAudit("getRiwayatBulan", empCheck.nama, "", "", "FAILED", { reason: "cross_employee_denied", requestedNama: nama });
      return { status: "error", authRequired: true, message: "Akses ditolak: Anda hanya dapat melihat riwayat Anda sendiri.", backendVersion: BACKEND_VERSION };
    }
    targetNama = empCheck.nama;
  }

  const bulanPrefix = String(bulan || "").split("-"); 
  const mmFilter = (bulanPrefix.length >= 2 && bulanPrefix[1] && bulanPrefix[0])
    ? ("/" + ("0" + bulanPrefix[1]).slice(-2) + "/" + bulanPrefix[0])
    : "";
  
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName("Data_Absensi");
  const values = sheet.getDataRange().getValues();
  const displayValues = sheet.getDataRange().getDisplayValues();
  const normNama = normalizeTextKey(targetNama);
  const absenceRows = readAllKetidakhadiranRows(ss);
  
  const riwayat = [];
  for (let i = 1; i < values.length; i++) {
    const rowSts = String(values[i][7] || "").trim().toUpperCase();
    if (!values[i][1] || rowSts === "DIBATALKAN") continue;
    const tgl = toDmy(displayValues[i] && displayValues[i][0] ? displayValues[i][0] : values[i][0]); 
    if (normalizeTextKey(values[i][1]) === normNama && (!mmFilter || tgl.indexOf(mmFilter) !== -1)) {
      const jamDatangParsed = (displayValues[i] && displayValues[i][4] && displayValues[i][4] !== "-") 
        ? parseSheetTime(displayValues[i][4]) 
        : parseSheetTime(values[i][4]);
      const jamPulangParsed = (displayValues[i] && displayValues[i][5] && displayValues[i][5] !== "-") 
        ? parseSheetTime(displayValues[i][5]) 
        : parseSheetTime(values[i][5]);

      let ketLabel = "HADIR";
      if (rowSts === "IZIN") {
        const matchedAbs = absenceRows.find(function(a) {
          return a.tanggal === tgl && normalizeTextKey(a.nama) === normNama;
        });
        if (matchedAbs && matchedAbs.status === "SAKIT") {
          ketLabel = "SAKIT";
        } else {
          const ketStr = String(values[i][13] || "").toLowerCase();
          ketLabel = ketStr.indexOf("sakit") !== -1 ? "SAKIT" : "IZIN";
        }
      }

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
        keterangan: ketLabel,
        alasan: values[i][13] && values[i][13] !== "-" ? values[i][13] : ""
      });
    }
  }
  
  logAudit("getRiwayatBulan", ownerCheck.ok ? "Owner" : empCheck.nama, "", "", "SUCCESS", { targetNama: targetNama, bulan: bulan || "-", count: riwayat.length });
  // Data di sheet sudah terurut dari row 2 (terbaru) ke bawah, sehingga tidak perlu di-reverse
  return { status: "success", data: riwayat, backendVersion: BACKEND_VERSION };
}

// ==================== KOREKSI ABSENSI MANUAL & AUDIT TRAIL ====================

function ensureAuditColumns(sheet) {
  if (!sheet) return;
  const headerP = String(sheet.getRange(1, 16).getValue() || "").trim();
  const headerQ = String(sheet.getRange(1, 17).getValue() || "").trim();
  const headerR = String(sheet.getRange(1, 18).getValue() || "").trim();
  if (headerP !== "EditedBy") sheet.getRange(1, 16).setValue("EditedBy");
  if (headerQ !== "EditedAt") sheet.getRange(1, 17).setValue("EditedAt");
  if (headerR !== "OriginalSnapshot") sheet.getRange(1, 18).setValue("OriginalSnapshot");
}

function normalizeStatusMasukInput(rawStatus) {
  if (!rawStatus) return "";
  const s = String(rawStatus).trim().toUpperCase();
  if (s === "AUTO") return "AUTO";
  if (s === "TEPAT_WAKTU" || s === "TEPAT WAKTU") return "TEPAT WAKTU";
  if (s === "TELAT") return "TELAT";
  if (s === "IZIN") return "IZIN";
  if (s === "DIBATALKAN") return "DIBATALKAN";
  return s;
}

function getPulangDisplayLabel(jamPulang, statusPulang) {
  if (!jamPulang || jamPulang === "-") return "BELUM PULANG";
  const sp = String(statusPulang || "").trim().toUpperCase();
  if (sp === "NORMAL" || sp === "PULANG_NORMAL" || sp === "PULANG NORMAL" || sp === "-" || sp === "") return "PULANG NORMAL";
  if (sp === "PULANG_CEPAT" || sp === "PULANG CEPAT") return "PULANG CEPAT";
  return sp;
}

function resolveTargetHoursForRow(ss, tanggalDmy, nama, outlet, posisi, jamDatang) {
  const toleransiTelat = getToleransiTelat();
  let jamMasukTarget = getJamMasukPosisi(posisi || "Admin");
  let jamPulangTarget = getJamPulangPosisi(posisi || "Admin");
  let sumberTarget = "DATA_POSISI";

  try {
    const snapRows = readAllSnapshotRows(ss);
    const normNama = normalizeTextKey(nama);
    const normOut = outlet && outlet !== "-" ? normalizeOutletKey(outlet) : "";
    const cleanJd = jamDatang && jamDatang !== "-" ? parseSheetTime(jamDatang) : "";

    let snap = (cleanJd && cleanJd !== "-")
      ? snapRows.find(function(s) {
          return s.tanggal === tanggalDmy &&
            normalizeTextKey(s.nama) === normNama &&
            (!normOut || normalizeOutletKey(s.outlet) === normOut) &&
            s.waktuDatang === cleanJd;
        })
      : null;

    if (!snap) {
      snap = snapRows.find(function(s) {
        return s.tanggal === tanggalDmy &&
          normalizeTextKey(s.nama) === normNama &&
          (!normOut || normalizeOutletKey(s.outlet) === normOut);
      }) || snapRows.find(function(s) {
        return s.tanggal === tanggalDmy && normalizeTextKey(s.nama) === normNama;
      });
    }

    if (snap) {
      if (isValidHHMM(snap.jamMasukEfektif)) jamMasukTarget = snap.jamMasukEfektif;
      if (isValidHHMM(snap.jamPulangEfektif)) jamPulangTarget = snap.jamPulangEfektif;
      sumberTarget = "SNAPSHOT_ABSENSI";
      return {
        jamMasukTarget: jamMasukTarget,
        jamPulangTarget: jamPulangTarget,
        toleransiTelat: toleransiTelat,
        sumberTarget: sumberTarget
      };
    }

    const ctx = buildAssignmentContext(ss, tanggalDmy);
    const emp = findEmployeeInList(ctx.employees, nama, nama);
    if (emp) {
      const refMins = (cleanJd && isValidHHMM(cleanJd)) ? timeStrToMinutes(cleanJd) : null;
      const effCtx = Object.assign({}, ctx, { preferredOutlet: outlet || "", referenceMinutes: refMins });
      const eff = getEffectiveWorkAssignment(emp.idPegawai || emp.nama, tanggalDmy, effCtx);
      if (eff && !eff.ambiguous && (!posisi || normalizeTextKey(eff.posisiPenugasan) === normalizeTextKey(posisi))) {
        if (isValidHHMM(eff.jamMasukEfektif)) jamMasukTarget = eff.jamMasukEfektif;
        if (isValidHHMM(eff.jamPulangEfektif)) jamPulangTarget = eff.jamPulangEfektif;
        sumberTarget = eff.sumberJadwal || "DATA_POSISI";
      }
    }
  } catch (e) {}

  return {
    jamMasukTarget: jamMasukTarget,
    jamPulangTarget: jamPulangTarget,
    toleransiTelat: toleransiTelat,
    sumberTarget: sumberTarget
  };
}

function recalculateAttendanceStatus(jamDatang, jamPulang, jamMasukTarget, jamPulangTarget, toleransiTelat) {
  const cleanDatang = parseSheetTime(jamDatang);
  const cleanPulang = parseSheetTime(jamPulang);
  const targetIn = isValidHHMM(jamMasukTarget) ? jamMasukTarget : "08:00";
  const targetOut = isValidHHMM(jamPulangTarget) ? jamPulangTarget : "20:00";
  const tol = (typeof toleransiTelat === "number" && !isNaN(toleransiTelat)) ? toleransiTelat : 60;

  let statusMasuk = "TEPAT WAKTU";
  let statusMasukCode = "TEPAT_WAKTU";
  if (cleanDatang && cleanDatang !== "-") {
    const datangMin = timeStrToMinutes(cleanDatang);
    const targetInMin = timeStrToMinutes(targetIn);
    if (datangMin <= targetInMin + tol) {
      statusMasuk = "TEPAT WAKTU";
      statusMasukCode = "TEPAT_WAKTU";
    } else {
      statusMasuk = "TELAT";
      statusMasukCode = "TELAT";
    }
  }

  if (!cleanPulang || cleanPulang === "-") {
    return {
      invalidOrder: false,
      jamDatang: cleanDatang,
      jamPulang: "-",
      totalJam: "-",
      totalMenit: 0,
      statusMasuk: statusMasuk,
      statusMasukCode: statusMasukCode,
      statusPulang: "-",
      statusPulangCode: "BELUM_PULANG",
      statusPulangLabel: "BELUM PULANG"
    };
  }

  const datangMin = (cleanDatang && cleanDatang !== "-") ? timeStrToMinutes(cleanDatang) : 0;
  const pulangMin = timeStrToMinutes(cleanPulang);
  if (cleanDatang && cleanDatang !== "-" && pulangMin < datangMin) {
    return {
      invalidOrder: true,
      jamDatang: cleanDatang,
      jamPulang: cleanPulang,
      totalJam: "-",
      totalMenit: 0,
      statusMasuk: statusMasuk,
      statusMasukCode: statusMasukCode,
      statusPulang: "-",
      statusPulangCode: "INVALID",
      statusPulangLabel: "INVALID"
    };
  }

  const diffMin = (cleanDatang && cleanDatang !== "-") ? Math.max(0, pulangMin - datangMin) : 0;
  const rH = Math.floor(diffMin / 60);
  const rM = diffMin % 60;
  const totalJam = (cleanDatang && cleanDatang !== "-") ? (rH + "j " + rM + "m") : "-";

  const targetOutMin = timeStrToMinutes(targetOut);
  let statusPulang = "NORMAL";
  let statusPulangCode = "PULANG_NORMAL";
  let statusPulangLabel = "PULANG NORMAL";

  if (rH >= 13) {
    statusPulang = "LEMBUR";
    statusPulangCode = "LEMBUR";
    statusPulangLabel = "LEMBUR";
  } else if (pulangMin < targetOutMin) {
    statusPulang = "PULANG CEPAT";
    statusPulangCode = "PULANG_CEPAT";
    statusPulangLabel = "PULANG CEPAT";
  }

  return {
    invalidOrder: false,
    jamDatang: cleanDatang,
    jamPulang: cleanPulang,
    totalJam: totalJam,
    totalMenit: diffMin,
    statusMasuk: statusMasuk,
    statusMasukCode: statusMasukCode,
    statusPulang: statusPulang,
    statusPulangCode: statusPulangCode,
    statusPulangLabel: statusPulangLabel
  };
}

function logAuditTrail(sheet, rowIndex, oldData, newData, ownerName, action, alasan) {
  ensureAuditColumns(sheet);
  const isoNow = getJakartaIsoTimestampStr();
  let snapshotValue = "MANUAL_ENTRY";

  if (action !== "MANUAL_ENTRY") {
    const auditRecord = {
      action: action || "UPDATE",
      alasan: alasan || "",
      editedBy: ownerName || "Owner",
      editedAt: isoNow,
      before: oldData || {},
      after: newData || {}
    };
    if (oldData && oldData.previousOriginalSnapshot) {
      auditRecord.previousSnapshot = oldData.previousOriginalSnapshot;
    }
    snapshotValue = JSON.stringify(auditRecord);
  }

  sheet.getRange(rowIndex, 16).setValue(ownerName || "Owner");
  sheet.getRange(rowIndex, 17).setValue(isoNow);
  sheet.getRange(rowIndex, 18).setValue(snapshotValue);
  return {
    editedBy: ownerName || "Owner",
    editedAt: isoNow,
    originalSnapshot: snapshotValue
  };
}

function getAbsensiByDate(paramTanggal, outletFilter, searchQuery, ownerToken) {
  const auth = checkOwnerToken(ownerToken);
  if (!auth.ok) {
    return { status: "error", authRequired: true, message: auth.message, backendVersion: BACKEND_VERSION };
  }

  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName("Data_Absensi");
  const targetDate = (paramTanggal && String(paramTanggal).trim() !== "")
    ? normalizeDateStr(String(paramTanggal).trim())
    : normalizeDateStr(getJakartaDateStr());
  const normOutletFilter = (outletFilter && outletFilter !== "ALL") ? normalizeOutletKey(outletFilter) : "";
  const normSearch = searchQuery ? normalizeTextKey(searchQuery) : "";

  const rows = [];
  if (sheet) {
    const values = sheet.getDataRange().getValues();
    const displayValues = sheet.getDataRange().getDisplayValues();
    for (let i = 1; i < values.length; i++) {
      const nama = String(values[i][1] || "").trim();
      if (!nama) continue;

      const rawTgl = (displayValues[i] && displayValues[i][0]) ? displayValues[i][0] : values[i][0];
      const rowDate = normalizeDateStr(parseSheetDate(rawTgl));
      if (rowDate !== targetDate) continue;

      const rowOutlet = String(values[i][3] || "").trim();
      if (normOutletFilter && normalizeOutletKey(rowOutlet) !== normOutletFilter) continue;
      if (normSearch && normalizeTextKey(nama).indexOf(normSearch) === -1) continue;

      const jamDatangParsed = (displayValues[i] && displayValues[i][4] && displayValues[i][4] !== "-")
        ? parseSheetTime(displayValues[i][4])
        : parseSheetTime(values[i][4]);
      const jamPulangParsed = (displayValues[i] && displayValues[i][5] && displayValues[i][5] !== "-")
        ? parseSheetTime(displayValues[i][5])
        : parseSheetTime(values[i][5]);

      const statusMasuk = String(values[i][7] || "").trim() || "-";
      const statusPulang = String(values[i][8] || "").trim() || "-";
      const editedBy = String(values[i][15] || "").trim();
      const editedAt = String(values[i][16] || "").trim();
      const originalSnapshot = String(values[i][17] || "").trim();

      rows.push({
        rowIndex: i + 1,
        tanggal: rowDate,
        nama: nama,
        posisi: String(values[i][2] || "").trim(),
        outlet: rowOutlet || "-",
        jamDatang: jamDatangParsed,
        jamPulang: jamPulangParsed,
        totalJam: String(values[i][6] || "-"),
        statusMasuk: statusMasuk,
        statusPulang: statusPulang,
        statusPulangLabel: getPulangDisplayLabel(jamPulangParsed, statusPulang),
        lokasiDatang: String(values[i][9] || "-"),
        lokasiPulang: String(values[i][10] || "-"),
        fotoDatang: String(values[i][11] || ""),
        fotoPulang: String(values[i][12] || ""),
        keteranganDatang: String(values[i][13] || "-"),
        keteranganPulang: String(values[i][14] || "-"),
        editedBy: editedBy,
        editedAt: editedAt,
        originalSnapshot: originalSnapshot,
        isCancelled: statusMasuk.toUpperCase() === "DIBATALKAN"
      });
    }
  }

  return {
    status: "success",
    tanggal: targetDate,
    data: rows,
    employees: getActiveEmployeesSafe(ss).map(serializeEmployeeForOwner),
    outlets: getOutlets(),
    positions: getSettings().data.positions,
    toleransiTelat: getToleransiTelat(),
    backendVersion: BACKEND_VERSION
  };
}

function updateAbsensi(data, ownerToken) {
  const auth = checkOwnerToken(ownerToken);
  if (!auth.ok) {
    return { status: "error", authRequired: true, message: auth.message, backendVersion: BACKEND_VERSION };
  }

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName("Data_Absensi");
    if (!sheet) {
      return { status: "error", message: "Sheet Data_Absensi tidak ditemukan.", backendVersion: BACKEND_VERSION };
    }
    ensureAuditColumns(sheet);

    const rowIndex = parseInt(data && data.rowIndex, 10);
    if (!rowIndex || isNaN(rowIndex) || rowIndex < 2 || rowIndex > sheet.getLastRow()) {
      return { status: "error", message: "rowIndex absensi tidak valid.", backendVersion: BACKEND_VERSION };
    }

    const cleanAlasan = data && data.alasanKoreksi ? String(data.alasanKoreksi).trim() : "";
    if (!cleanAlasan) {
      return { status: "error", message: "Alasan koreksi wajib diisi.", backendVersion: BACKEND_VERSION };
    }

    const rowVals = sheet.getRange(rowIndex, 1, 1, 18).getValues()[0];
    const rowDisp = sheet.getRange(rowIndex, 1, 1, 18).getDisplayValues()[0];

    const oldNama = String(rowVals[1] || "").trim();
    const oldStatusMasuk = String(rowVals[7] || "").trim();
    if (!oldNama) {
      return { status: "error", message: "Baris absensi kosong atau tidak ditemukan.", backendVersion: BACKEND_VERSION };
    }
    if (oldStatusMasuk.toUpperCase() === "DIBATALKAN") {
      return { status: "error", message: "Baris absensi sudah dibatalkan sebelumnya.", backendVersion: BACKEND_VERSION };
    }

    const oldTanggal = normalizeDateStr(parseSheetDate(rowDisp[0] || rowVals[0]));
    const oldPosisi = String(rowVals[2] || "").trim();
    const oldOutlet = String(rowVals[3] || "").trim();
    const oldJamDatang = parseSheetTime(rowDisp[4] && rowDisp[4] !== "-" ? rowDisp[4] : rowVals[4]);
    const oldJamPulang = parseSheetTime(rowDisp[5] && rowDisp[5] !== "-" ? rowDisp[5] : rowVals[5]);
    const oldTotalJam = String(rowVals[6] || "-");
    const oldStatusPulang = String(rowVals[8] || "-").trim() || "-";
    const oldKetDatang = String(rowVals[13] || "-");
    const oldKetPulang = String(rowVals[14] || "-");
    const prevEditedBy = String(rowVals[15] || "").trim();
    const prevEditedAt = String(rowVals[16] || "").trim();
    const prevOriginalSnapshot = String(rowVals[17] || "").trim();

    let newJamDatang = oldJamDatang;
    if (data.jamDatang !== undefined) {
      const jdRaw = String(data.jamDatang || "").trim();
      if (!jdRaw || jdRaw === "-") {
        newJamDatang = "-";
      } else {
        const parsedJd = parseSheetTime(jdRaw);
        if (!isValidHHMM(parsedJd)) {
          return { status: "error", message: "Format Jam Datang harus HH:MM.", backendVersion: BACKEND_VERSION };
        }
        newJamDatang = parsedJd;
      }
    }

    let newJamPulang = oldJamPulang;
    if (data.jamPulang !== undefined) {
      const jpRaw = String(data.jamPulang || "").trim();
      if (!jpRaw || jpRaw === "-") {
        newJamPulang = "-";
      } else {
        const parsedJp = parseSheetTime(jpRaw);
        if (!isValidHHMM(parsedJp)) {
          return { status: "error", message: "Format Jam Pulang harus HH:MM.", backendVersion: BACKEND_VERSION };
        }
        newJamPulang = parsedJp;
      }
    }

    if (newJamPulang !== "-" && (!newJamDatang || newJamDatang === "-")) {
      return { status: "error", message: "Jam Pulang tidak dapat diisi jika Jam Datang masih kosong.", backendVersion: BACKEND_VERSION };
    }

    const targets = resolveTargetHoursForRow(ss, oldTanggal, oldNama, oldOutlet, oldPosisi, oldJamDatang);
    const recalc = recalculateAttendanceStatus(
      newJamDatang,
      newJamPulang,
      targets.jamMasukTarget,
      targets.jamPulangTarget,
      targets.toleransiTelat
    );

    if (recalc.invalidOrder) {
      return { status: "error", message: "Jam Pulang (" + newJamPulang + ") tidak boleh lebih awal dari Jam Datang (" + newJamDatang + ").", backendVersion: BACKEND_VERSION };
    }

    const requestedStatus = normalizeStatusMasukInput(data.status);
    let finalStatusMasuk = oldStatusMasuk;
    if (requestedStatus && requestedStatus !== "AUTO") {
      if (requestedStatus === oldStatusMasuk && newJamDatang !== oldJamDatang && newJamDatang !== "-" && oldStatusMasuk !== "IZIN") {
        finalStatusMasuk = recalc.statusMasuk;
      } else {
        finalStatusMasuk = requestedStatus;
      }
    } else if (newJamDatang !== "-" && oldStatusMasuk !== "IZIN") {
      finalStatusMasuk = recalc.statusMasuk;
    }

    const finalTotalJam = (finalStatusMasuk === "IZIN") ? "-" : recalc.totalJam;
    const finalStatusPulang = (finalStatusMasuk === "IZIN") ? "-" : recalc.statusPulang;
    const finalKetDatang = (data.keteranganDatang !== undefined)
      ? (String(data.keteranganDatang || "").trim() || "-")
      : oldKetDatang;
    const finalKetPulang = (data.keteranganPulang !== undefined)
      ? (String(data.keteranganPulang || "").trim() || "-")
      : oldKetPulang;

    const oldData = {
      tanggal: oldTanggal,
      nama: oldNama,
      posisi: oldPosisi,
      outlet: oldOutlet,
      jamDatang: oldJamDatang,
      jamPulang: oldJamPulang,
      totalJam: oldTotalJam,
      statusMasuk: oldStatusMasuk,
      statusPulang: oldStatusPulang,
      keteranganDatang: oldKetDatang,
      keteranganPulang: oldKetPulang,
      previousEditedBy: prevEditedBy,
      previousEditedAt: prevEditedAt,
      previousOriginalSnapshot: prevOriginalSnapshot
    };

    const newData = {
      jamDatang: newJamDatang,
      jamPulang: newJamPulang,
      totalJam: finalTotalJam,
      statusMasuk: finalStatusMasuk,
      statusPulang: finalStatusPulang,
      statusPulangLabel: getPulangDisplayLabel(newJamPulang, finalStatusPulang),
      keteranganDatang: finalKetDatang,
      keteranganPulang: finalKetPulang
    };

    sheet.getRange(rowIndex, 5).setValue(newJamDatang);
    sheet.getRange(rowIndex, 6).setValue(newJamPulang);
    sheet.getRange(rowIndex, 7).setValue(finalTotalJam);
    sheet.getRange(rowIndex, 8).setValue(finalStatusMasuk);
    sheet.getRange(rowIndex, 9).setValue(finalStatusPulang);
    sheet.getRange(rowIndex, 14).setValue(finalKetDatang);
    sheet.getRange(rowIndex, 15).setValue(finalKetPulang);

    const audit = logAuditTrail(sheet, rowIndex, oldData, newData, auth.ownerName, "UPDATE", cleanAlasan);

    return {
      status: "success",
      message: "Koreksi absensi untuk " + oldNama + " berhasil disimpan.",
      data: {
        rowIndex: rowIndex,
        tanggal: oldTanggal,
        nama: oldNama,
        posisi: oldPosisi,
        outlet: oldOutlet,
        jamDatang: newJamDatang,
        jamPulang: newJamPulang,
        totalJam: finalTotalJam,
        statusMasuk: finalStatusMasuk,
        statusPulang: finalStatusPulang,
        statusPulangLabel: getPulangDisplayLabel(newJamPulang, finalStatusPulang),
        keteranganDatang: finalKetDatang,
        keteranganPulang: finalKetPulang,
        editedBy: audit.editedBy,
        editedAt: audit.editedAt,
        originalSnapshot: audit.originalSnapshot,
        isCancelled: false
      },
      backendVersion: BACKEND_VERSION
    };
  } catch (err) {
    return { status: "error", message: "Gagal memperbarui absensi: " + (err.message || err.toString()), backendVersion: BACKEND_VERSION };
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

function deleteAbsensi(data, ownerToken) {
  const auth = checkOwnerToken(ownerToken);
  if (!auth.ok) {
    return { status: "error", authRequired: true, message: auth.message, backendVersion: BACKEND_VERSION };
  }

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName("Data_Absensi");
    if (!sheet) {
      return { status: "error", message: "Sheet Data_Absensi tidak ditemukan.", backendVersion: BACKEND_VERSION };
    }
    ensureAuditColumns(sheet);

    const rowIndex = parseInt(data && data.rowIndex, 10);
    if (!rowIndex || isNaN(rowIndex) || rowIndex < 2 || rowIndex > sheet.getLastRow()) {
      return { status: "error", message: "rowIndex absensi tidak valid.", backendVersion: BACKEND_VERSION };
    }

    const cleanAlasan = data && data.alasanHapus ? String(data.alasanHapus).trim() : "";
    if (!cleanAlasan) {
      return { status: "error", message: "Alasan penghapusan absensi wajib diisi.", backendVersion: BACKEND_VERSION };
    }

    const rowVals = sheet.getRange(rowIndex, 1, 1, 18).getValues()[0];
    const rowDisp = sheet.getRange(rowIndex, 1, 1, 18).getDisplayValues()[0];
    const oldNama = String(rowVals[1] || "").trim();
    const oldStatusMasuk = String(rowVals[7] || "").trim();

    if (!oldNama) {
      return { status: "error", message: "Baris absensi tidak ditemukan.", backendVersion: BACKEND_VERSION };
    }
    if (oldStatusMasuk.toUpperCase() === "DIBATALKAN") {
      return { status: "error", message: "Baris absensi sudah berstatus DIBATALKAN.", backendVersion: BACKEND_VERSION };
    }

    const oldData = {
      tanggal: normalizeDateStr(parseSheetDate(rowDisp[0] || rowVals[0])),
      nama: oldNama,
      posisi: String(rowVals[2] || "").trim(),
      outlet: String(rowVals[3] || "").trim(),
      jamDatang: parseSheetTime(rowDisp[4] && rowDisp[4] !== "-" ? rowDisp[4] : rowVals[4]),
      jamPulang: parseSheetTime(rowDisp[5] && rowDisp[5] !== "-" ? rowDisp[5] : rowVals[5]),
      totalJam: String(rowVals[6] || "-"),
      statusMasuk: oldStatusMasuk,
      statusPulang: String(rowVals[8] || "-"),
      keteranganDatang: String(rowVals[13] || "-"),
      keteranganPulang: String(rowVals[14] || "-"),
      previousOriginalSnapshot: String(rowVals[17] || "").trim()
    };

    sheet.getRange(rowIndex, 8).setValue("DIBATALKAN");
    sheet.getRange(rowIndex, 15).setValue("Dibatalkan Owner: " + cleanAlasan);
    const audit = logAuditTrail(sheet, rowIndex, oldData, { statusMasuk: "DIBATALKAN" }, auth.ownerName, "DELETE", cleanAlasan);

    return {
      status: "success",
      message: "Absensi " + oldNama + " berhasil ditandai DIBATALKAN.",
      rowIndex: rowIndex,
      editedBy: audit.editedBy,
      editedAt: audit.editedAt,
      backendVersion: BACKEND_VERSION
    };
  } catch (err) {
    return { status: "error", message: "Gagal membatalkan absensi: " + (err.message || err.toString()), backendVersion: BACKEND_VERSION };
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

function addManualAbsensi(data, ownerToken) {
  const auth = checkOwnerToken(ownerToken);
  if (!auth.ok) {
    return { status: "error", authRequired: true, message: auth.message, backendVersion: BACKEND_VERSION };
  }

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName("Data_Absensi");
    if (!sheet) {
      return { status: "error", message: "Sheet Data_Absensi tidak ditemukan.", backendVersion: BACKEND_VERSION };
    }
    ensureAuditColumns(sheet);

    const targetYmd = toYmd(data && data.tanggal);
    const todayYmd = toYmd(getJakartaDateStr());
    if (!targetYmd) {
      return { status: "error", message: "Tanggal absensi manual tidak valid.", backendVersion: BACKEND_VERSION };
    }
    if (todayYmd && targetYmd > todayYmd) {
      return { status: "error", message: "Tanggal absensi manual tidak boleh di masa depan.", backendVersion: BACKEND_VERSION };
    }
    const targetDmy = toDmy(targetYmd);

    const cleanAlasanManual = data && data.alasanManual ? String(data.alasanManual).trim() : "";
    if (!cleanAlasanManual) {
      return { status: "error", message: "Alasan penambahan absensi manual wajib diisi.", backendVersion: BACKEND_VERSION };
    }

    const employees = getActiveEmployeesSafe(ss);
    const emp = findEmployeeInList(employees, (data && data.idPegawai) || (data && data.nama), data && data.nama);
    if (!emp) {
      return { status: "error", message: "Pegawai tidak ditemukan atau berstatus nonaktif di DataPegawai.", backendVersion: BACKEND_VERSION };
    }
    if (emp.duplicateName && !emp.idPegawai && !(data && data.idPegawai)) {
      return { status: "error", message: "Nama pegawai duplikat & ID Pegawai kosong. Lengkapi ID Pegawai terlebih dahulu.", backendVersion: BACKEND_VERSION };
    }

    const outlets = getOutlets();
    const rawOutlet = data && data.outlet ? String(data.outlet).trim() : "";
    const matchedOutlet = outlets.find(function(o) { return normalizeOutletKey(o.nama) === normalizeOutletKey(rawOutlet); });
    if (!matchedOutlet) {
      return { status: "error", message: "Outlet \"" + rawOutlet + "\" tidak ditemukan di DataOutlet.", backendVersion: BACKEND_VERSION };
    }
    const canonicalOutlet = matchedOutlet.nama;

    const positionsMap = getPositionsMap(ss);
    const rawPosisi = data && data.posisi ? String(data.posisi).trim() : "";
    const posCfg = positionsMap[normalizeTextKey(rawPosisi)];
    const canonicalPosisi = posCfg ? posCfg.name : rawPosisi;
    if (!canonicalPosisi) {
      return { status: "error", message: "Posisi wajib dipilih.", backendVersion: BACKEND_VERSION };
    }

    const parsedJamDatang = parseSheetTime(data && data.jamDatang);
    if (!isValidHHMM(parsedJamDatang)) {
      return { status: "error", message: "Jam Datang wajib diisi dengan format HH:MM.", backendVersion: BACKEND_VERSION };
    }

    let parsedJamPulang = "-";
    if (data && data.jamPulang && String(data.jamPulang).trim() !== "" && String(data.jamPulang).trim() !== "-") {
      parsedJamPulang = parseSheetTime(data.jamPulang);
      if (!isValidHHMM(parsedJamPulang)) {
        return { status: "error", message: "Format Jam Pulang harus HH:MM.", backendVersion: BACKEND_VERSION };
      }
    }

    // Cek apakah sudah ada absensi DATANG aktif untuk pegawai tersebut di tanggal yang sama
    const dataVals = sheet.getDataRange().getValues();
    const dispVals = sheet.getDataRange().getDisplayValues();
    for (let i = 1; i < dataVals.length; i++) {
      const rowTgl = normalizeDateStr(parseSheetDate(dispVals[i] && dispVals[i][0] ? dispVals[i][0] : dataVals[i][0]));
      const rowSts = String(dataVals[i][7] || "").trim().toUpperCase();
      const rowJd = parseSheetTime(dispVals[i] && dispVals[i][4] !== "-" ? dispVals[i][4] : dataVals[i][4]);
      if (rowTgl === targetDmy && normalizeTextKey(dataVals[i][1]) === normalizeTextKey(emp.nama) && rowSts !== "IZIN" && rowSts !== "DIBATALKAN" && rowJd !== "-") {
        return {
          status: "error",
          message: emp.nama + " sudah memiliki absensi DATANG aktif pada tanggal " + targetDmy + ". Gunakan menu Edit pada baris terkait.",
          backendVersion: BACKEND_VERSION
        };
      }
    }

    const targets = resolveTargetHoursForRow(ss, targetDmy, emp.nama, canonicalOutlet, canonicalPosisi, parsedJamDatang);
    const recalc = recalculateAttendanceStatus(
      parsedJamDatang,
      parsedJamPulang,
      targets.jamMasukTarget,
      targets.jamPulangTarget,
      targets.toleransiTelat
    );

    if (recalc.invalidOrder) {
      return { status: "error", message: "Jam Pulang (" + parsedJamPulang + ") tidak boleh lebih awal dari Jam Datang (" + parsedJamDatang + ").", backendVersion: BACKEND_VERSION };
    }

    const requestedStatus = normalizeStatusMasukInput(data && data.status);
    const finalStatusMasuk = (requestedStatus && requestedStatus !== "AUTO") ? requestedStatus : recalc.statusMasuk;
    const ketDatang = (data && data.keteranganDatang && String(data.keteranganDatang).trim()) ? String(data.keteranganDatang).trim() : ("Input Manual: " + cleanAlasanManual);
    const ketPulang = (data && data.keteranganPulang && String(data.keteranganPulang).trim()) ? String(data.keteranganPulang).trim() : "-";
    const isoNow = getJakartaIsoTimestampStr();

    prependDataRow(sheet, [
      targetDmy,                  // A. Tanggal
      emp.nama,                   // B. Nama
      canonicalPosisi,            // C. Posisi
      canonicalOutlet,            // D. Outlet
      parsedJamDatang,            // E. Jam Datang
      parsedJamPulang,            // F. Jam Pulang
      recalc.totalJam,            // G. Total Jam
      finalStatusMasuk,           // H. Status Masuk
      recalc.statusPulang,        // I. Status Pulang
      "MANUAL_ENTRY",             // J. Lokasi Datang
      parsedJamPulang !== "-" ? "MANUAL_ENTRY" : "-", // K. Lokasi Pulang
      "",                         // L. Foto Datang
      "",                         // M. Foto Pulang
      ketDatang,                  // N. Keterangan Datang
      ketPulang,                  // O. Keterangan Pulang
      auth.ownerName || "Owner",  // P. EditedBy
      isoNow,                     // Q. EditedAt
      "MANUAL_ENTRY"              // R. OriginalSnapshot
    ]);

    // Simpan snapshot penugasan target agar koreksi selanjutnya konsisten
    const snapshotSheet = ensureSnapshotAbsensiSheet(ss);
    const snapshotKey = targetDmy + "|" + normalizeTextKey(emp.nama) + "|" + normalizeOutletKey(canonicalOutlet) + "|" + parsedJamDatang;
    prependDataRow(snapshotSheet, [
      snapshotKey,
      targetDmy,
      emp.idPegawai || "",
      emp.nama,
      "",
      canonicalOutlet,
      canonicalPosisi,
      canonicalPosisi,
      targets.jamMasukTarget,
      targets.jamPulangTarget,
      "NORMAL",
      "MANUAL_ENTRY",
      parsedJamDatang
    ]);

    return {
      status: "success",
      message: "Absensi manual untuk " + emp.nama + " (" + targetDmy + ") berhasil ditambahkan.",
      rowIndex: 2,
      data: {
        rowIndex: 2,
        tanggal: targetDmy,
        nama: emp.nama,
        posisi: canonicalPosisi,
        outlet: canonicalOutlet,
        jamDatang: parsedJamDatang,
        jamPulang: parsedJamPulang,
        totalJam: recalc.totalJam,
        statusMasuk: finalStatusMasuk,
        statusPulang: recalc.statusPulang,
        statusPulangLabel: getPulangDisplayLabel(parsedJamPulang, recalc.statusPulang),
        keteranganDatang: ketDatang,
        keteranganPulang: ketPulang,
        editedBy: auth.ownerName || "Owner",
        editedAt: isoNow,
        originalSnapshot: "MANUAL_ENTRY",
        isCancelled: false
      },
      backendVersion: BACKEND_VERSION
    };
  } catch (err) {
    return { status: "error", message: "Gagal menambahkan absensi manual: " + (err.message || err.toString()), backendVersion: BACKEND_VERSION };
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
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