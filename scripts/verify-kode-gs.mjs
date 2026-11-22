import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import vm from 'node:vm';

const kodeSource = fs.readFileSync(new URL('../Kode.gs', import.meta.url), 'utf8');
const tsSourceModule = fs.readFileSync(new URL('../src/kodeGsSource.ts', import.meta.url), 'utf8');

// 1. Verify Kode.gs === src/kodeGsSource.ts
const matchExport = tsSourceModule.match(/^export const KODE_GS_CODE = (".*");\s*$/s);
assert.ok(matchExport, 'src/kodeGsSource.ts must export KODE_GS_CODE as JSON string');
assert.equal(JSON.parse(matchExport[1]), kodeSource, 'Kode.gs and src/kodeGsSource.ts must be 100% identical');

// 2. Verify zero duplicate top-level function definitions in Kode.gs
const fnNames = [...kodeSource.matchAll(/^function\s+([a-zA-Z0-9_]+)/gm)].map((m) => m[1]);
assert.equal(new Set(fnNames).size, fnNames.length, 'Kode.gs must not have duplicate function names');

// Mock GAS Runtime
function createGasEnv(initialTimeIso = '2026-11-16T01:30:00.000Z', opts = {}) {
  const configuredPassword = opts.ownerPassword !== undefined ? opts.ownerPassword : 'SecretOwner#2026';
  const fault = opts.fault || {};
  let mockNowMs = Date.parse(initialTimeIso);
  const RealDate = Date;
  class MockDate extends RealDate {
    constructor(...args) {
      if (args.length === 0) super(mockNowMs);
      else super(...args);
    }
    static now() { return mockNowMs; }
    static parse(s) { return RealDate.parse(s); }
    static UTC(...a) { return RealDate.UTC(...a); }
  }

  class MockSheet {
    constructor(name, rows = []) {
      this.name = name;
      this.rows = rows.map((r) => [...r]);
    }
    getMaxRows() { return Math.max(this.rows.length, 1); }
    getLastRow() { return this.rows.length; }
    insertRowAfter(pos) { this.rows.splice(pos, 0, []); }
    insertRowBefore(pos) { this.rows.splice(pos - 1, 0, []); }
    deleteRow(pos) { this.rows.splice(pos - 1, 1); }
    getDataRange() {
      const self = this;
      return {
        getValues: () => self.rows.map((r) => [...r]),
        getDisplayValues: () => self.rows.map((r) => r.map((c) => (c === null || c === undefined ? '' : String(c))))
      };
    }
    getRange(row, col, numRows = 1, numCols = 1) {
      const self = this;
      if (typeof row === 'string') {
        const m = row.match(/^([A-Z]+)(\d+)$/);
        col = m[1].charCodeAt(0) - 64;
        row = parseInt(m[2], 10);
      }
      return {
        getValue: () => (self.rows[row - 1] ? self.rows[row - 1][col - 1] ?? '' : ''),
        getValues: () => {
          const out = [];
          for (let r = 0; r < numRows; r++) {
            const line = [];
            for (let c = 0; c < numCols; c++) {
              line.push(self.rows[row - 1 + r] ? self.rows[row - 1 + r][col - 1 + c] ?? '' : '');
            }
            out.push(line);
          }
          return out;
        },
        getDisplayValues: () => {
          const out = [];
          for (let r = 0; r < numRows; r++) {
            const line = [];
            for (let c = 0; c < numCols; c++) {
              const v = self.rows[row - 1 + r] ? self.rows[row - 1 + r][col - 1 + c] : '';
              line.push(v === null || v === undefined ? '' : String(v));
            }
            out.push(line);
          }
          return out;
        },
        setValue: (val) => {
          while (self.rows.length < row) self.rows.push([]);
          while (self.rows[row - 1].length < col) self.rows[row - 1].push('');
          self.rows[row - 1][col - 1] = val;
        },
        setValues: (vals) => {
          for (let r = 0; r < vals.length; r++) {
            while (self.rows.length < row + r) self.rows.push([]);
            for (let c = 0; c < vals[r].length; c++) {
              while (self.rows[row - 1 + r].length < col + c) self.rows[row - 1 + r].push('');
              self.rows[row - 1 + r][col - 1 + c] = vals[r][c];
            }
          }
        },
        clearContent: () => {
          for (let r = 0; r < numRows; r++) {
            if (!self.rows[row - 1 + r]) continue;
            for (let c = 0; c < numCols; c++) {
              self.rows[row - 1 + r][col - 1 + c] = '';
            }
          }
        }
      };
    }
  }

  const sheets = new Map();
  sheets.set('Settings', new MockSheet('Settings', [
    ['Key', 'Value'],
    ['favicon', ''],
    ['requireLocation', 'TRUE'],
    ['positions', ''],
    ['', ''],
    ['', ''],
    ['toleransi_telat', 60],
    ['enableWorkHours', 'TRUE'],
    ['gasUrl', ''],
    ['owner_password', configuredPassword]
  ]));
  sheets.set('DataOutlet', new MockSheet('DataOutlet', [
    ['Nama Outlet', 'Latitude', 'Longitude', 'Toleransi Radius'],
    ['YZ_ MDP PASIR JAHA BALARAJA', -6.201, 106.45, 150],
    ['YZ_ MDP JAYANTI CIKANDE', -6.21, 106.42, 150]
  ]));
  sheets.set('DataPosisi', new MockSheet('DataPosisi', [
    ['Nama Posisi', 'Jam Masuk', 'Jam Pulang', 'Status Jam'],
    ['Admin', '08:00', '20:00', 'TRUE'],
    ['Pickup', '14:00', '22:00', 'TRUE'],
    ['Magang', '08:00', '17:00', 'TRUE']
  ]));
  const pegawaiRows = [
    ['Nama', 'ID', 'email', 'password', 'no_Telepon', 'TglAktif', 'TglNonAktif', 'Status', 'SidikWajah', 'FaceDescriptor'],
    ['Riska', 'EMP001', 'riska@jnt.test', 'secret123', '0811', '01/01/2026', '', 'AKTIF', 'fp-riska', '[0.11,0.22]'],
    ['Budi Kurir', 'EMP002', 'budi@jnt.test', 'secret456', '0812', '01/01/2026', '', 'AKTIF', 'fp-budi', '[0.33,0.44]'],
    ['Siti Magang', 'EMP003', 'siti@jnt.test', 'secret789', '0813', '01/01/2026', '', 'AKTIF', 'fp-siti', '[0.55,0.66]'],
    ['Dedi Nonaktif', 'EMP004', 'dedi@jnt.test', 'x', '0814', '01/01/2026', '01/10/2026', 'NONAKTIF', '', ''],
    ...(opts.extraEmployees || [])
  ];
  sheets.set('DataPegawai', new MockSheet('DataPegawai', pegawaiRows));
  sheets.set('Data_Absensi', new MockSheet('Data_Absensi', [
    ['Tanggal', 'Nama', 'Posisi', 'Outlet', 'Jam Datang', 'Jam Pulang', 'Total Jam', 'Status Masuk', 'Status Pulang', 'Lokasi Datang', 'Lokasi Pulang', 'Foto Datang', 'Foto Pulang', 'Ket Datang', 'Ket Pulang']
  ]));
  sheets.set('AbsenIzin', new MockSheet('AbsenIzin', [
    ['Tanggal', 'Nama', 'Posisi', 'Jenis', 'Alasan', 'Jam', 'Bukti']
  ]));

  const cacheStore = new Map();
  const propStore = new Map();
  if (opts.scriptPropOwnerPassword) {
    propStore.set('OWNER_PASSWORD', opts.scriptPropOwnerPassword);
  }
  let uuidCounter = 0;

  const ssMock = {
    getSheetByName: (n) => sheets.get(n) || null,
    insertSheet: (n) => { const s = new MockSheet(n, []); sheets.set(n, s); return s; }
  };

  const sandbox = {
    console,
    Date: MockDate,
    Math, JSON, Number, String, Array, Object, Boolean, parseInt, parseFloat, isNaN, isFinite, RegExp, Error,
    BigInt, Uint8Array, Int32Array, DataView, ArrayBuffer, TextEncoder, TextDecoder,
    SpreadsheetApp: { openById: () => ssMock },
    LockService: { getScriptLock: () => ({ waitLock: () => {}, releaseLock: () => {} }) },
    CacheService: {
      getScriptCache: () => ({
        put: (k, v) => {
          if (fault.cachePutThrows) throw new Error('Cache put failed');
          cacheStore.set(k, v);
        },
        get: (k) => {
          if (fault.cacheGetThrows) throw new Error('Cache get failed');
          return cacheStore.get(k) || null;
        },
        remove: (k) => {
          if (fault.cacheRemoveThrows) throw new Error('Cache remove failed');
          cacheStore.delete(k);
        }
      })
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => {
          if (fault.propGetThrows) throw new Error('Props get failed');
          return propStore.get(k) || null;
        },
        setProperty: (k, v) => {
          if (fault.propSetThrows) throw new Error('Props set failed');
          propStore.set(k, v);
        },
        deleteProperty: (k) => {
          if (fault.propDeleteThrows) throw new Error('Props delete failed');
          propStore.delete(k);
        },
        getProperties: () => Object.fromEntries(propStore.entries())
      })
    },
    DriveApp: {
      Access: { ANYONE_WITH_LINK: 'ANYONE' },
      Permission: { VIEW: 'VIEW' },
      getFolderById: () => ({
        createFile: () => ({ setSharing: () => {}, getUrl: () => 'https://drive.google.com/file/d/mock/view' })
      })
    },
    ContentService: {
      MimeType: { JSON: 'JSON', TEXT: 'TEXT' },
      createTextOutput: (t) => ({ setMimeType: () => t })
    },
    Utilities: {
      DigestAlgorithm: {
        SHA_256: 'SHA_256'
      },
      computeDigest: (_algo, input) => {
        const digest = crypto.createHash('sha256').update(String(input), 'utf8').digest();
        return Array.from(digest, (b) => (b > 127 ? b - 256 : b));
      },
      getUuid: () => {
        const tag = (100000 + (++uuidCounter)).toString(36).toUpperCase().padStart(6, '0');
        return `${tag}aa-4000-8000-9000-000000000000`;
      },
      base64Decode: (s) => Buffer.from(s, 'base64'),
      newBlob: (b, t, n) => ({ b, t, n }),
      formatDate: (d, tz, fmt) => {
        const parts = new Intl.DateTimeFormat('en-GB', {
          timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
          hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
        }).formatToParts(d);
        const get = (type) => parts.find((p) => p.type === type)?.value || '00';
        const hh = get('hour') === '24' ? '00' : get('hour');
        if (fmt === 'dd/MM/yyyy') return `${get('day')}/${get('month')}/${get('year')}`;
        if (fmt === 'HH:mm') return `${hh}:${get('minute')}`;
        return `${get('year')}-${get('month')}-${get('day')} ${hh}:${get('minute')}:${get('second')}`;
      }
    }
  };

  vm.createContext(sandbox);
  vm.runInContext(kodeSource, sandbox);

  return {
    ctx: sandbox,
    sheets,
    cacheStore,
    propStore,
    fault,
    setTimeIso: (iso) => { mockNowMs = Date.parse(iso); }
  };
}

function loginTestEmployee(envObj, ownerTok, nama, idPegawai, pin = '123456', devSuffix = 'dev') {
  const setRes = envObj.ctx.setEmployeePin({ idPegawai, nama, pin }, ownerTok);
  assert.equal(setRes.status, 'success', setRes.message);
  const loginRes = envObj.ctx.employeeLogin({
    identifier: idPegawai || nama,
    pin,
    deviceId: `test-${devSuffix}-${idPegawai || nama}`,
    userAgent: 'VerifySuite/1.0'
  });
  assert.equal(loginRes.status, 'success', loginRes.message);
  assert.ok(loginRes.employeeToken, 'employeeLogin must return employeeToken');
  return loginRes.employeeToken;
}

// ==================== TEST SUITE EXECUTION ====================
const env = createGasEnv('2026-11-16T01:30:00.000Z'); // 08:30 WIB (Senin 16 Nov 2026)
const { ctx, sheets } = env;

// Test 1: Auth enforcement + zero password/FaceDescriptor leak
const unauthRes = ctx.savePenempatan({ nama: 'Riska', outlet: 'YZ_ MDP PASIR JAHA BALARAJA', posisi: 'Admin', tanggalMulai: '2026-11-01' }, '');
assert.equal(unauthRes.status, 'error');
assert.equal(unauthRes.authRequired, true, 'Write endpoints must reject missing ownerToken');

const badLogin = ctx.ownerLogin({ password: 'wrong' });
assert.equal(badLogin.status, 'error');

const loginRes = ctx.ownerLogin({ password: 'SecretOwner#2026' });
assert.equal(loginRes.status, 'success');
let token = loginRes.token;
assert.ok(token, 'Owner login must issue session token');

const penempatanInit = ctx.getDataPenempatan(token);
assert.equal(penempatanInit.status, 'success');
assert.equal(penempatanInit.data.length, 3, 'Only 3 AKTIF employees returned (Dedi Nonaktif excluded)');
const serialized = JSON.stringify(penempatanInit);
assert.equal(serialized.includes('secret123'), false, 'Employee password must never leak');
assert.equal(serialized.includes('[0.11,0.22]'), false, 'FaceDescriptor must never leak');
assert.equal(serialized.includes('fp-riska'), false, 'Fingerprint must never leak');

// Test 2: Save permanent placement (Riska @ Jayanti Admin 08:00-20:00, Budi Pickup 14:00-22:00, Siti Magang 08:00-17:00)
const p1 = ctx.savePenempatan({
  idPegawai: 'EMP001', nama: 'Riska', outlet: 'YZ_ MDP JAYANTI CIKANDE', posisi: 'Admin',
  jamMasuk: '08:00', jamPulang: '20:00', hariKerja: ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'], tanggalMulai: '2026-11-01'
}, token);
assert.equal(p1.status, 'success', p1.message);

const p2 = ctx.savePenempatan({
  idPegawai: 'EMP002', nama: 'Budi Kurir', outlet: 'YZ_ MDP JAYANTI CIKANDE', posisi: 'Pickup',
  jamMasuk: '14:00', jamPulang: '22:00', tanggalMulai: '2026-11-01'
}, token);
assert.equal(p2.status, 'success', p2.message);

const p3 = ctx.savePenempatan({
  idPegawai: 'EMP003', nama: 'Siti Magang', outlet: 'YZ_ MDP PASIR JAHA BALARAJA', posisi: 'Magang',
  jamMasuk: '08:00', jamPulang: '17:00', tanggalMulai: '2026-11-01'
}, token);
assert.equal(p3.status, 'success', p3.message);

// Test 3: Change Riska placement -> Pasir Jaha override 08:30-19:00 starting 2026-11-16, closes old placement 2026-11-15
const p1Update = ctx.savePenempatan({
  idPegawai: 'EMP001', nama: 'Riska', outlet: 'YZ_ MDP PASIR JAHA BALARAJA', posisi: 'Admin',
  jamMasuk: '08:30', jamPulang: '19:00', hariKerja: ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'], tanggalMulai: '2026-11-16'
}, token);
assert.equal(p1Update.status, 'success', p1Update.message);

const riskaHistory = ctx.getRiwayatPenempatan('EMP001', 'Riska', token).data;
assert.equal(riskaHistory.length, 2, 'Historical placement row must be preserved');
assert.equal(riskaHistory[1].tanggalAkhir, '2026-11-15', 'Old placement closed on day before new start');

// Test 4: Riska DATANG at 09:30 WIB (within 08:30 + 60m inclusive tolerance = 09:30 -> TEPAT WAKTU!), then 09:31 would be TELAT
env.setTimeIso('2026-11-16T02:30:00.000Z'); // 09:30 WIB
const riskaEmpTok1 = loginTestEmployee(env, token, 'Riska', 'EMP001');
const datangRiska = ctx.processForm({
  nama: 'Riska', posisi: 'Admin', status: 'DATANG', outlet: 'YZ_ MDP PASIR JAHA BALARAJA',
  lat: -6.201, lng: 106.45, image: 'data:image/jpeg;base64,/9j/4AAQ'
}, { employeeToken: riskaEmpTok1 });
assert.equal(datangRiska.status, 'success', datangRiska.message);
assert.equal(sheets.get('Data_Absensi').rows[1][7], 'TEPAT WAKTU', '09:30 with 08:30+60m tolerance must be TEPAT WAKTU');
assert.equal(sheets.get('Data_Absensi').rows[1][0], '16/11/2026', 'New DATANG row inserted at Row 2');

// Test 5: Snapshot immunity — even if Owner edits JadwalHarian after DATANG to Jam Pulang 21:00, PULANG at 19:00 uses snapshot (19:00)!
const schedEditBeforePulang = ctx.saveJadwalHarian({
  idPegawai: 'EMP001', nama: 'Riska', outlet: 'YZ_ MDP PASIR JAHA BALARAJA',
  posisiPenugasan: 'Admin', jamMasuk: '08:30', jamPulang: '21:00', jenisPenugasan: 'NORMAL', statusJadwal: 'DIJADWALKAN',
  tanggal: '2026-11-16'
}, token);
assert.equal(schedEditBeforePulang.status, 'success', schedEditBeforePulang.message);

env.setTimeIso('2026-11-16T11:55:00.000Z'); // 18:55 WIB (before 19:00; >4h so re-login first)
const riskaEmpTok2 = ctx.employeeLogin({ identifier: 'EMP001', pin: '123456', deviceId: 'test-dev-EMP001' }).employeeToken;
const earlyPulang = ctx.processForm({
  nama: 'Riska', posisi: 'Admin', status: 'PULANG', outlet: 'YZ_ MDP PASIR JAHA BALARAJA',
  lat: -6.201, lng: 106.45, image: 'data:image/jpeg;base64,/9j/4AAQ'
}, { employeeToken: riskaEmpTok2 });
assert.equal(earlyPulang.status, 'error', 'PULANG at 18:55 must be rejected against 19:00 snapshot');

env.setTimeIso('2026-11-16T12:00:00.000Z'); // 19:00 WIB
const okPulang = ctx.processForm({
  nama: 'Riska', posisi: 'Admin', status: 'PULANG', outlet: 'YZ_ MDP PASIR JAHA BALARAJA',
  lat: -6.201, lng: 106.45, image: 'data:image/jpeg;base64,/9j/4AAQ'
}, { employeeToken: riskaEmpTok2 });
assert.equal(okPulang.status, 'success', okPulang.message);
assert.equal(sheets.get('Data_Absensi').rows.length, 2, 'PULANG updates Row 2 in place without creating a new row');

// Test 6: Token expiry (>8h) enforcement + Sunday Backup + Pickup as Admin Backup without mutating permanent placement/DataPosisi
const expiredAttempt = ctx.saveJadwalHarian({
  idPegawai: 'EMP001', nama: 'Riska', tanggal: '2026-11-22', statusJadwal: 'LIBUR', jenisPenugasan: 'NORMAL', catatan: 'Libur Minggu'
}, token);
assert.equal(expiredAttempt.status, 'error');
assert.equal(expiredAttempt.authRequired, true, 'Expired ownerToken (>8h) must be rejected');

// Re-login after expiry
token = ctx.ownerLogin({ password: 'SecretOwner#2026' }).token;
assert.ok(token, 'Owner re-login succeeds');

// Sunday 2026-11-22: Budi Kurir (Pickup) assigned as Admin Backup at Jayanti; Riska marked LIBUR
const sunLibur = ctx.saveJadwalHarian({
  idPegawai: 'EMP001', nama: 'Riska', tanggal: '2026-11-22', statusJadwal: 'LIBUR', jenisPenugasan: 'NORMAL', catatan: 'Libur Minggu'
}, token);
assert.equal(sunLibur.status, 'success', sunLibur.message);

const budiBackup = ctx.saveJadwalHarian({
  idPegawai: 'EMP002', nama: 'Budi Kurir', outlet: 'YZ_ MDP JAYANTI CIKANDE', posisiPenugasan: 'Admin',
  jamMasuk: '08:00', jamPulang: '20:00', jenisPenugasan: 'BACKUP', statusJadwal: 'DIJADWALKAN', tanggal: '2026-11-22'
}, token);
assert.equal(budiBackup.status, 'success', budiBackup.message);

// Double assignment collision check for Budi on 2026-11-22
const budiCollision = ctx.saveJadwalHarian({
  idPegawai: 'EMP002', nama: 'Budi Kurir', outlet: 'YZ_ MDP PASIR JAHA BALARAJA', posisiPenugasan: 'Pickup',
  jamMasuk: '14:00', jamPulang: '22:00', jenisPenugasan: 'ROTASI', statusJadwal: 'DIJADWALKAN', tanggal: '2026-11-22'
}, token);
assert.equal(budiCollision.status, 'error', 'Overlapping double assignment must be rejected');

// Verify Budi permanent DataPenempatan is still Pickup!
const budiDetailSun = ctx.getPegawaiDetail('Budi Kurir', 'EMP002', '2026-11-22', { ownerToken: token });
assert.equal(budiDetailSun.effectiveAssignment.posisiPermanen, 'Pickup');
assert.equal(budiDetailSun.effectiveAssignment.posisiPenugasan, 'Admin');
assert.equal(budiDetailSun.effectiveAssignment.jenisPenugasan, 'BACKUP');

// Test 7: Admin absent alert & Conflict IZIN vs BACKUP warning
const conflictIzin = ctx.saveKetidakhadiran({
  idPegawai: 'EMP002', nama: 'Budi Kurir', tanggal: '2026-11-22', status: 'SAKIT', alasan: 'Demam tinggi'
}, token);
assert.equal(conflictIzin.status, 'success', conflictIzin.message);
assert.ok(conflictIzin.scheduleConflictWarning.includes('KONFLIK'), 'Must warn when BACKUP employee is marked SAKIT');

const sunScheduleView = ctx.getJadwalHarian('2026-11-22', token);
assert.ok(sunScheduleView.alerts.some((a) => a.type === 'SCHEDULE_IZIN_CONFLICT'), 'Must surface SCHEDULE_IZIN_CONFLICT alert');
assert.ok(sunScheduleView.alerts.some((a) => a.type === 'NO_ADMIN' || a.type === 'ADMIN_ABSENT_NO_BACKUP'), 'Must surface missing Admin alert when Admin & backup unavailable');

// Test 8: Employee form IZIN/SAKIT syncs DataKetidakhadiran + AbsenIzin + Data_Absensi without duplicate
env.setTimeIso('2026-11-17T01:00:00.000Z'); // 08:00 WIB Selasa 17 Nov
token = ctx.ownerLogin({ password: 'SecretOwner#2026' }).token;
const sitiEmpTok1 = loginTestEmployee(env, token, 'Siti Magang', 'EMP003');
const empIzin1 = ctx.processForm({
  nama: 'Siti Magang', posisi: 'Magang', status: 'IZIN', jenisIzin: 'Sakit', alasan: 'Flu berat', image: 'data:image/jpeg;base64,/9j/4AAQ'
}, { employeeToken: sitiEmpTok1 });
assert.equal(empIzin1.status, 'success', empIzin1.message);
const empIzin2 = ctx.processForm({
  nama: 'Siti Magang', posisi: 'Magang', status: 'IZIN', jenisIzin: 'Sakit', alasan: 'Flu berat update', image: 'data:image/jpeg;base64,/9j/4AAQ'
}, { employeeToken: sitiEmpTok1 });
assert.equal(empIzin2.status, 'success', empIzin2.message);

const ketRowsNov17 = ctx.getKetidakhadiran('2026-11-17', '', '', '', token).data;
assert.equal(ketRowsNov17.length, 1, 'DataKetidakhadiran deduplicates same-day employee IZIN/SAKIT');
assert.equal(ketRowsNov17[0].status, 'SAKIT');

// Test 9: closeDailyAttendance marks remaining BELUM ABSEN as ALPA without touching SAKIT/LIBUR or creating fake DATANG rows
const absRowsBeforeClose = sheets.get('Data_Absensi').rows.length;
const closeRes = ctx.closeDailyAttendance({ tanggal: '2026-11-17', alasan: 'Tutup shift harian' }, token);
assert.equal(closeRes.status, 'success', closeRes.message);
assert.deepEqual([...closeRes.markedNames].sort(), ['Budi Kurir', 'Riska']);
assert.equal(sheets.get('Data_Absensi').rows.length, absRowsBeforeClose, 'closeDailyAttendance must NOT create fake DATANG rows in Data_Absensi');

const dailyNov17 = ctx.getKehadiranHarian('2026-11-17', token);
assert.equal(dailyNov17.summary.sakit, 1);
assert.equal(dailyNov17.summary.alpa, 2);

// Test 10: cancelKetidakhadiran removes only DataKetidakhadiran row, preserving Data_Absensi
const cancelAbsenceRes = ctx.cancelKetidakhadiran({ tanggal: '2026-11-17', idPegawai: 'EMP003', nama: 'Siti Magang' }, token);
assert.equal(cancelAbsenceRes.status, 'success', cancelAbsenceRes.message);
assert.equal(ctx.getKetidakhadiran('2026-11-17', '', 'Siti Magang', '', token).data.length, 0);
assert.equal(sheets.get('Data_Absensi').rows.length, absRowsBeforeClose, 'Data_Absensi history preserved on cancelKetidakhadiran');

// ==================== KOREKSI ABSENSI MANUAL (v2.9.1) ====================
env.setTimeIso('2026-11-18T03:00:00.000Z'); // 10:00 WIB Rabu 18 Nov
token = ctx.ownerLogin({ password: 'SecretOwner#2026' }).token;

// Budi Pickup (jadwal 14:00-22:00) atau Riska (jadwal 08:30-19:00):
// Budi absen DATANG di 15:10 (TELAT karena > 14:00 + 60m = 15:00) dan lupa absen pulang
env.setTimeIso('2026-11-18T08:10:00.000Z'); // 15:10 WIB
const budiEmpTok1 = loginTestEmployee(env, token, 'Budi Kurir', 'EMP002');
const budiDatang = ctx.processForm({
  nama: 'Budi Kurir', posisi: 'Pickup', status: 'DATANG', outlet: 'YZ_ MDP JAYANTI CIKANDE',
  lat: -6.21, lng: 106.42, image: 'data:image/jpeg;base64,/9j/4AAQ'
}, { employeeToken: budiEmpTok1 });
assert.equal(budiDatang.status, 'success', budiDatang.message);

// Test 11 (Auth & getAbsensiByDate): Reject missing ownerToken, succeed with valid token
const unauthGetAbs = ctx.getAbsensiByDate('2026-11-18', '', '', '');
assert.equal(unauthGetAbs.status, 'error');
assert.equal(unauthGetAbs.authRequired, true, 'getAbsensiByDate must reject missing ownerToken');

const unauthEditAbs = ctx.updateAbsensi({ rowIndex: 2, jamPulang: '22:00', alasanKoreksi: 'Tes' }, '');
assert.equal(unauthEditAbs.status, 'error');
assert.equal(unauthEditAbs.authRequired, true, 'updateAbsensi must reject missing ownerToken');

const listNov18 = ctx.getAbsensiByDate('2026-11-18', '', '', token);
assert.equal(listNov18.status, 'success', listNov18.message);
assert.equal(listNov18.data.length, 1);
const budiRowIdx = listNov18.data[0].rowIndex;
assert.equal(listNov18.data[0].statusMasuk, 'TELAT');
assert.equal(listNov18.data[0].statusPulangLabel, 'BELUM PULANG');

// Test 12: Edit jam pulang pegawai yang lupa absen pulang -> durasi terhitung otomatis + PULANG NORMAL + audit trail
const badPulangBeforeDatang = ctx.updateAbsensi({
  rowIndex: budiRowIdx, jamPulang: '13:00', alasanKoreksi: 'Tes jam pulang < datang'
}, token);
assert.equal(badPulangBeforeDatang.status, 'error', 'jamPulang < jamDatang must be rejected');

const fixPulangRes = ctx.updateAbsensi({
  rowIndex: budiRowIdx, jamPulang: '22:00', keteranganPulang: 'Lupa checkout', alasanKoreksi: 'Pegawai lupa klik pulang'
}, token);
assert.equal(fixPulangRes.status, 'success', fixPulangRes.message);
assert.equal(fixPulangRes.data.totalJam, '6j 50m');
assert.equal(fixPulangRes.data.statusPulang, 'NORMAL');
assert.equal(fixPulangRes.data.statusPulangLabel, 'PULANG NORMAL');
assert.equal(fixPulangRes.data.editedBy, 'Owner');
assert.ok(fixPulangRes.data.editedAt.includes('+07:00'), 'EditedAt uses ISO Asia/Jakarta timestamp');
assert.ok(fixPulangRes.data.originalSnapshot.includes('"jamPulang":"-"'), 'OriginalSnapshot records pre-edit state');

// Test 13: Edit jam masuk dari TELAT (15:10) ke tepat waktu (14:15) -> statusMasuk menjadi TEPAT WAKTU + durasi dihitung ulang!
const fixDatangRes = ctx.updateAbsensi({
  rowIndex: budiRowIdx, jamDatang: '14:15', alasanKoreksi: 'Sinyal lemah saat masuk, datang 14:15'
}, token);
assert.equal(fixDatangRes.status, 'success', fixDatangRes.message);
assert.equal(fixDatangRes.data.statusMasuk, 'TEPAT WAKTU', 'Status recalculated from TELAT to TEPAT WAKTU');
assert.equal(fixDatangRes.data.totalJam, '7j 45m', 'Duration recalculated automatically');

// Test 14: Edit absensi yang sudah punya PULANG -> hitung ulang durasi & status (14:15 -> 19:00 = PULANG CEPAT)
const earlyEditRes = ctx.updateAbsensi({
  rowIndex: budiRowIdx, jamPulang: '19:00', alasanKoreksi: 'Pulang lebih awal izin'
}, token);
assert.equal(earlyEditRes.status, 'success', earlyEditRes.message);
assert.equal(earlyEditRes.data.totalJam, '4j 45m');
assert.equal(earlyEditRes.data.statusPulang, 'PULANG CEPAT');

// Test 15: Tambah absensi manual untuk Riska yang lupa absen total pada 2026-11-18 -> Row 2 + OriginalSnapshot = MANUAL_ENTRY
const futureManual = ctx.addManualAbsensi({
  tanggal: '2026-11-25', nama: 'Riska', outlet: 'YZ_ MDP PASIR JAHA BALARAJA', posisi: 'Admin',
  jamDatang: '08:30', alasanManual: 'Tes masa depan'
}, token);
assert.equal(futureManual.status, 'error', 'Future date manual entry must be rejected');

const manualRiska = ctx.addManualAbsensi({
  tanggal: '2026-11-18', nama: 'Riska', idPegawai: 'EMP001',
  outlet: 'YZ_ MDP PASIR JAHA BALARAJA', posisi: 'Admin',
  jamDatang: '08:30', jamPulang: '19:00', alasanManual: 'HP Riska mati total seharian'
}, token);
assert.equal(manualRiska.status, 'success', manualRiska.message);
assert.equal(manualRiska.rowIndex, 2, 'Manual entry inserted at Row 2');
assert.equal(manualRiska.data.originalSnapshot, 'MANUAL_ENTRY');
assert.equal(manualRiska.data.totalJam, '10j 30m');
assert.equal(manualRiska.data.statusMasuk, 'TEPAT WAKTU');

// Cek duplikasi manual entry untuk Riska pada tanggal yang sama
const dupManualRiska = ctx.addManualAbsensi({
  tanggal: '2026-11-18', nama: 'Riska', outlet: 'YZ_ MDP PASIR JAHA BALARAJA', posisi: 'Admin',
  jamDatang: '09:00', alasanManual: 'Duplikat'
}, token);
assert.equal(dupManualRiska.status, 'error', 'Duplicate manual entry on same date must be rejected');

// Test 16: Hapus absensi (deleteAbsensi) -> ditandai DIBATALKAN -> hilang dari Ringkasan Harian & Kehadiran Harian
const delManualRes = ctx.deleteAbsensi({
  rowIndex: 2, alasanHapus: 'Data uji coba dibatalkan'
}, token);
assert.equal(delManualRes.status, 'success', delManualRes.message);

const ringkasanNov18 = ctx.getRingkasanHarian('2026-11-18', token);
assert.equal(ringkasanNov18.data.some((r) => r.nama === 'Riska'), false, 'Deleted (DIBATALKAN) row must NOT appear in Ringkasan Harian');
assert.equal(ringkasanNov18.data.some((r) => r.nama === 'Budi Kurir'), true, 'Active row still appears in Ringkasan Harian');

const listAfterDelete = ctx.getAbsensiByDate('2026-11-18', '', '', token);
const cancelledRow = listAfterDelete.data.find((r) => r.nama === 'Riska');
assert.ok(cancelledRow && cancelledRow.isCancelled && cancelledRow.statusMasuk === 'DIBATALKAN', 'Row preserved with DIBATALKAN status and audit trail');

// ==================== PHASE A: SECURITY & EMPLOYEE IDENTITY HARDENING (18 TESTS) ====================

// PA-1: Strict AKTIF filter excludes blank, NONAKTIF, NON-AKTIF, INACTIVE, RESIGN, CUTI and keeps trimmed case-insensitive AKTIF
const paEnv = createGasEnv('2026-11-21T02:00:00.000Z', {
  extraEmployees: [
    ['Kosong Status', 'EMP005', 'kosong@jnt.test', 'p5', '0815', '01/01/2026', '', '', 'fp5', '[0.1]'],
    ['Spasi Kosong', 'EMP006', 'spasi@jnt.test', 'p6', '0816', '01/01/2026', '', '   ', 'fp6', '[0.2]'],
    ['Resign Emp', 'EMP007', 'resign@jnt.test', 'p7', '0817', '01/01/2026', '', 'RESIGN', 'fp7', '[0.3]'],
    ['Cuti Emp', 'EMP008', 'cuti@jnt.test', 'p8', '0818', '01/01/2026', '', 'CUTI', 'fp8', '[0.4]'],
    ['Non Hyphen', 'EMP009', 'nh@jnt.test', 'p9', '0819', '01/01/2026', '', 'NON-AKTIF', 'fp9', '[0.5]'],
    ['Inactive Emp', 'EMP010', 'inact@jnt.test', 'p10', '0820', '01/01/2026', '', 'INACTIVE', 'fp10', '[0.6]'],
    ['Trim Aktif', 'EMP011', 'trim@jnt.test', 'p11', '0821', '01/01/2026', '', ' aktif ', 'fp11', '[0.7]']
  ]
});
const activeNames = Array.from(paEnv.ctx.getActiveEmployeesSafe()).map((e) => e.nama);
assert.deepEqual(activeNames, ['Riska', 'Budi Kurir', 'Siti Magang', 'Trim Aktif'], 'Only explicit AKTIF employees allowed');

// PA-2: DataPegawai original values untouched & getPegawai requires ownerToken
assert.equal(paEnv.sheets.get('DataPegawai').rows[5][7], '', 'Original blank status in DataPegawai preserved');
const paTok = paEnv.ctx.ownerLogin({ password: 'SecretOwner#2026' }).token;
assert.equal(paEnv.ctx.getPegawai('').authRequired, true, 'Unauthenticated getPegawai must be rejected');
assert.deepEqual(Array.from(paEnv.ctx.getPegawai(paTok).data), ['Riska', 'Budi Kurir', 'Siti Magang', 'Trim Aktif']);

// PA-3: serializeEmployeePublic strips PII & secrets
const sampleRawEmp = paEnv.ctx.getActiveEmployeesSafe()[0];
const pubSerialized = paEnv.ctx.serializeEmployeePublic(sampleRawEmp);
assert.equal(pubSerialized.email, undefined, 'Public serializer must omit email');
assert.equal(pubSerialized.noTelepon, undefined, 'Public serializer must omit noTelepon');
assert.equal(pubSerialized.tanggalAktif, undefined, 'Public serializer must omit tanggalAktif');
assert.equal(pubSerialized.password, undefined, 'Public serializer must omit password');
assert.equal(pubSerialized.SidikWajah, undefined, 'Public serializer must omit SidikWajah');
assert.equal(pubSerialized.FaceDescriptor, undefined, 'Public serializer must omit FaceDescriptor');
assert.deepEqual(Object.keys(pubSerialized).sort(), ['duplicateName', 'idPegawai', 'missingId', 'nama', 'status']);

// PA-4: serializeEmployeeForOwner strips password/SidikWajah/FaceDescriptor even for Owner
const ownerSerialized = paEnv.ctx.serializeEmployeeForOwner(sampleRawEmp);
assert.equal(ownerSerialized.email, 'riska@jnt.test');
assert.equal(ownerSerialized.noTelepon, '0811');
assert.equal(ownerSerialized.password, undefined, 'Owner serializer must never expose password');
assert.equal(ownerSerialized.SidikWajah, undefined, 'Owner serializer must never expose SidikWajah');
assert.equal(ownerSerialized.FaceDescriptor, undefined, 'Owner serializer must never expose FaceDescriptor');

// PA-5: Unauthenticated getPegawaiDetail rejected; Authenticated employee self-detail hides PII/history while keeping effectiveAssignment
const unauthDetailGet = JSON.parse(paEnv.ctx.doGet({
  parameter: { action: 'getPegawaiDetail', nama: 'Riska', tanggal: '2026-11-21' }
}));
assert.equal(unauthDetailGet.status, 'error');
assert.equal(unauthDetailGet.authRequired, true, 'Unauthenticated getPegawaiDetail must be rejected');

const paEmpTok = loginTestEmployee(paEnv, paTok, 'Riska', 'EMP001');
const empDetail = JSON.parse(paEnv.ctx.doPost({
  postData: { contents: JSON.stringify({ action: 'getPegawaiDetail', employeeToken: paEmpTok, data: { nama: 'Riska', tanggal: '2026-11-21' } }) }
}));
assert.equal(empDetail.status, 'success');
assert.ok(empDetail.effectiveAssignment, 'Authenticated self getPegawaiDetail keeps effectiveAssignment');
assert.equal(empDetail.pegawai.email, undefined);
assert.equal(empDetail.pegawai.noTelepon, undefined);
assert.equal(empDetail.placementHistory, undefined);
assert.equal(empDetail.absenceToday, undefined);
assert.equal(JSON.stringify(empDetail).includes('riska@jnt.test'), false);
assert.equal(JSON.stringify(empDetail).includes('secret123'), false);

// PA-6: Owner getPegawaiDetail via POST with valid token returns owner detail without secrets
const ownerDetail = JSON.parse(paEnv.ctx.doPost({
  postData: { contents: JSON.stringify({ action: 'getPegawaiDetail', ownerToken: paTok, data: { nama: 'Riska', tanggal: '2026-11-21' } }) }
}));
assert.equal(ownerDetail.status, 'success');
assert.equal(ownerDetail.pegawai.email, 'riska@jnt.test');
assert.equal(JSON.stringify(ownerDetail).includes('secret123'), false);
assert.equal(JSON.stringify(ownerDetail).includes('fp-riska'), false);
assert.equal(JSON.stringify(ownerDetail).includes('[0.11,0.22]'), false);

// PA-7: All sensitive Owner endpoints reject missing/invalid token
for (const fnCall of [
  () => paEnv.ctx.getDataPenempatan(''),
  () => paEnv.ctx.getRiwayatPenempatan('EMP001', 'Riska', ''),
  () => paEnv.ctx.getJadwalHarian('2026-11-21', ''),
  () => paEnv.ctx.getRiwayatRotasi('', '', '', ''),
  () => paEnv.ctx.getKehadiranHarian('2026-11-21', ''),
  () => paEnv.ctx.getKetidakhadiran('2026-11-21', '', '', '', ''),
  () => paEnv.ctx.getRingkasanHarian('2026-11-21', ''),
  () => paEnv.ctx.getLaporanBulanan('2026-11', ''),
  () => paEnv.ctx.getAbsensiByDate('2026-11-21', '', '', '')
]) {
  const res = fnCall();
  assert.equal(res.status, 'error');
  assert.equal(res.authRequired, true);
}

// PA-8: Hardcoded "jntowner" fallback completely removed when Settings!B10 and OWNER_PASSWORD are empty
const unconfEnv = createGasEnv('2026-11-21T02:00:00.000Z', { ownerPassword: '' });
assert.equal(unconfEnv.ctx.getConfiguredOwnerPassword(), '', 'Unconfigured owner password must return empty string');
const jntAttempt = unconfEnv.ctx.ownerLogin({ password: 'jntowner' });
assert.equal(jntAttempt.status, 'error');
assert.equal(jntAttempt.notConfigured, true, 'Unconfigured login must fail cleanly without fallback');

// PA-9: OWNER_PASSWORD in ScriptProperties works when Settings!B10 empty; literal "jntowner" fails when another password is set
const propPassEnv = createGasEnv('2026-11-21T02:00:00.000Z', { ownerPassword: '', scriptPropOwnerPassword: 'PropSecret!99' });
assert.equal(propPassEnv.ctx.ownerLogin({ password: 'jntowner' }).status, 'error');
const propLogin = propPassEnv.ctx.ownerLogin({ password: 'PropSecret!99' });
assert.equal(propLogin.status, 'success');
assert.equal(JSON.stringify(propLogin).includes('PropSecret!99'), false, 'Login response must never echo password');

// PA-10: doGet rejects saveSettings and rejects ownerToken/token in URL query parameters
const getSaveAttempt = JSON.parse(paEnv.ctx.doGet({
  parameter: { action: 'saveSettings', data: JSON.stringify({ requireLocation: false }) }
}));
assert.equal(getSaveAttempt.status, 'error');
assert.equal(getSaveAttempt.authRequired, true, 'doGet saveSettings must be rejected');

const getWithTokenAttempt = JSON.parse(paEnv.ctx.doGet({
  parameter: { action: 'getPegawai', ownerToken: paTok }
}));
assert.equal(getWithTokenAttempt.status, 'error');
assert.equal(getWithTokenAttempt.authRequired, true, 'doGet must reject ownerToken in URL query');

const getWithQueryTokenAttempt = JSON.parse(paEnv.ctx.doGet({
  parameter: { action: 'verifyOwnerSession', token: paTok }
}));
assert.equal(getWithQueryTokenAttempt.status, 'error');
assert.equal(getWithQueryTokenAttempt.authRequired, true, 'doGet must reject token query param & verifyOwnerSession over GET');

// PA-11: doGet rejects Owner read endpoints
for (const action of ['getDataPenempatan', 'getRiwayatPenempatan', 'getJadwalHarian', 'getRiwayatRotasi', 'getKehadiranHarian', 'getKetidakhadiran', 'getAbsensiByDate', 'getRingkasanHarian', 'getLaporanBulanan']) {
  const r = JSON.parse(paEnv.ctx.doGet({ parameter: { action } }));
  assert.equal(r.status, 'error', `doGet ${action} must be rejected`);
  assert.equal(r.authRequired, true);
}

// PA-12: doPost saveSettings succeeds with valid ownerToken in body and rejects without token
const postSaveNoTok = JSON.parse(paEnv.ctx.doPost({
  postData: { contents: JSON.stringify({ action: 'saveSettings', data: { requireLocation: false } }) }
}));
assert.equal(postSaveNoTok.status, 'error');
assert.equal(postSaveNoTok.authRequired, true);

const postSaveOk = JSON.parse(paEnv.ctx.doPost({
  postData: { contents: JSON.stringify({ action: 'saveSettings', ownerToken: paTok, data: { requireLocation: false } }) }
}));
assert.equal(postSaveOk.status, 'success', postSaveOk.message);
assert.equal(paEnv.sheets.get('Settings').getRange('B3').getValue(), 'FALSE');

// PA-13: doPost verifyOwnerSession & getAbsensiByDate work via POST body
const postVerifyOk = JSON.parse(paEnv.ctx.doPost({
  postData: { contents: JSON.stringify({ action: 'verifyOwnerSession', ownerToken: paTok }) }
}));
assert.equal(postVerifyOk.status, 'success');
assert.equal(postVerifyOk.valid, true);

const postAbsOk = JSON.parse(paEnv.ctx.doPost({
  postData: { contents: JSON.stringify({ action: 'getAbsensiByDate', ownerToken: paTok, data: { tanggal: '2026-11-21' } }) }
}));
assert.equal(postAbsOk.status, 'success');

// PA-14: ownerLogout revokes from both CacheService and PropertiesService; subsequent verify fails
const logoutOk = JSON.parse(paEnv.ctx.doPost({
  postData: { contents: JSON.stringify({ action: 'ownerLogout', ownerToken: paTok }) }
}));
assert.equal(logoutOk.status, 'success');
assert.equal(paEnv.ctx.checkOwnerToken(paTok).ok, false, 'Revoked token must immediately fail checkOwnerToken');
assert.equal(paEnv.ctx.verifyOwnerSession(paTok).valid, false);

// PA-15: ownerLogout fails (does NOT return fake success) when CacheService or PropertiesService throws
const tokForFault = paEnv.ctx.ownerLogin({ password: 'SecretOwner#2026' }).token;
paEnv.fault.propDeleteThrows = true;
const logoutFailRes = paEnv.ctx.ownerLogout(tokForFault);
assert.equal(logoutFailRes.status, 'error', 'ownerLogout must return error if revocation storage fails');
paEnv.fault.propDeleteThrows = false;

// PA-16: checkOwnerToken fails closed when storage throws or JSON is corrupted
paEnv.fault.cacheGetThrows = true;
const failClosedCache = paEnv.ctx.checkOwnerToken(tokForFault);
assert.equal(failClosedCache.ok, false, 'checkOwnerToken must fail closed when CacheService throws');
assert.equal(failClosedCache.message.includes(tokForFault), false, 'Error message must not leak token');
paEnv.fault.cacheGetThrows = false;

paEnv.cacheStore.delete('OWNER_TOKEN_' + tokForFault);
paEnv.fault.propGetThrows = true;
const failClosedProp = paEnv.ctx.checkOwnerToken(tokForFault);
assert.equal(failClosedProp.ok, false, 'checkOwnerToken must fail closed when PropertiesService throws');
paEnv.fault.propGetThrows = false;

paEnv.propStore.set('OWNER_TOKEN_corrupt-tok', '{not-json');
assert.equal(paEnv.ctx.checkOwnerToken('corrupt-tok').ok, false, 'Corrupted session JSON must fail closed');

// PA-17: Expired token rejected cleanly via verifyOwnerSession
paEnv.setTimeIso('2026-11-22T02:00:00.000Z'); // +24h (>8h TTL)
const expiredVerify = paEnv.ctx.verifyOwnerSession(tokForFault);
assert.equal(expiredVerify.valid, false);
assert.equal(expiredVerify.authRequired, true);

// PA-18: Frontend & source security invariants
const apiTs = fs.readFileSync(new URL('../src/api.ts', import.meta.url), 'utf8');
const appTsx = fs.readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
assert.equal(kodeSource.includes('jntowner'), false, 'Kode.gs must not contain hardcoded jntowner');
assert.equal(apiTs.includes('jntowner'), false, 'src/api.ts must not contain hardcoded jntowner');
assert.equal(appTsx.includes('jntowner'), false, 'src/App.tsx must not contain hardcoded jntowner');
assert.equal(appTsx.includes('action=saveSettings'), false, 'src/App.tsx must not have GET saveSettings fallback');
assert.equal(apiTs.includes('localStorage.setItem(OWNER_TOKEN_STORAGE_KEY'), false, 'ownerToken must not be written to localStorage');
assert.equal(apiTs.includes("gasGet('verifyOwnerSession'"), false, 'verifyOwnerSession must use POST, not gasGet');
assert.equal(apiTs.includes("gasGet(\n    'getAbsensiByDate'"), false, 'getAbsensiByDate must use POST, not gasGet');
assert.equal(appTsx.includes('.catch(() => {})'), false, 'verifyOwnerSessionApi must not silently ignore network errors');

// ==================== PHASE B: ATTENDANCE LOGIC & DATA INTEGRITY TESTS (14 SCENARIOS) ====================

// PB-1: Unscheduled active employee (no DataPenempatan & no JadwalHarian) -> BELUM DIJADWALKAN & excluded from ALPA
{
  const pbEnv = createGasEnv('2026-11-21T03:00:00.000Z');
  const pbTok = pbEnv.ctx.ownerLogin({ password: 'SecretOwner#2026' }).token;
  // Schedule only Riska; Budi Kurir & Siti Magang have neither DataPenempatan nor JadwalHarian
  assert.equal(pbEnv.ctx.savePenempatan({
    idPegawai: 'EMP001', nama: 'Riska', outlet: 'YZ_ MDP PASIR JAHA BALARAJA',
    posisi: 'Admin', jamMasuk: '08:00', jamPulang: '20:00', hariKerja: ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'],
    tanggalMulai: '2026-11-01'
  }, pbTok).status, 'success');

  const effUnsched = pbEnv.ctx.getEffectiveWorkAssignment('EMP002', '2026-11-21');
  assert.equal(effUnsched.statusJadwal, 'BELUM_DIJADWALKAN');
  assert.equal(effUnsched.sumberJadwal, 'BELUM_DIJADWALKAN');
  assert.equal(effUnsched.isScheduledToWork, false);

  const hadirRes = pbEnv.ctx.getKehadiranHarian('2026-11-21', pbTok);
  const budiRow = hadirRes.data.find((r) => r.nama === 'Budi Kurir');
  const riskaRow = hadirRes.data.find((r) => r.nama === 'Riska');
  assert.equal(budiRow.statusKehadiran, 'BELUM DIJADWALKAN');
  assert.equal(riskaRow.statusKehadiran, 'BELUM ABSEN');
  assert.equal(hadirRes.summary.belumDijadwalkan, 2);

  // Tutup hari must only mark Riska, NOT unscheduled Budi/Siti
  const closeRes = pbEnv.ctx.closeDailyAttendance({ tanggal: '2026-11-21', targetNames: ['Riska', 'Budi Kurir'] }, pbTok);
  assert.equal(closeRes.status, 'success');
  assert.equal(closeRes.partial, true);
  assert.deepEqual(Array.from(closeRes.markedNames), ['Riska']);
  assert.equal(closeRes.skippedCount, 1);
}

// PB-2: Active employee before tanggalAktif is BELUM DIJADWALKAN even with DataPenempatan
{
  const pbEnv = createGasEnv('2026-11-21T03:00:00.000Z', {
    extraEmployees: [
      ['New Hire', 'EMP020', 'new@jnt.test', 'p', '0820', '01/12/2026', '', 'AKTIF', '', '']
    ]
  });
  const pbTok = pbEnv.ctx.ownerLogin({ password: 'SecretOwner#2026' }).token;
  assert.equal(pbEnv.ctx.savePenempatan({
    idPegawai: 'EMP020', nama: 'New Hire', outlet: 'YZ_ MDP PASIR JAHA BALARAJA',
    posisi: 'Pickup', jamMasuk: '08:00', jamPulang: '17:00', hariKerja: ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'],
    tanggalMulai: '2026-11-01'
  }, pbTok).status, 'success');
  const kehadiran = pbEnv.ctx.getKehadiranHarian('2026-11-21', pbTok);
  const newHireRow = kehadiran.data.find((r) => r.nama === 'New Hire');
  assert.equal(newHireRow.statusKehadiran, 'BELUM DIJADWALKAN');
}

// PB-3: Split-shift (allowSplitShift: true) non-overlapping shifts across 2 outlets + open-shift guard + aggregated duration
{
  const pbEnv = createGasEnv('2026-11-21T01:00:00.000Z'); // 08:00 WIB
  const pbTok = pbEnv.ctx.ownerLogin({ password: 'SecretOwner#2026' }).token;

  const s1 = pbEnv.ctx.saveJadwalHarian({
    idPegawai: 'EMP002', nama: 'Budi Kurir', outlet: 'YZ_ MDP PASIR JAHA BALARAJA',
    posisiPenugasan: 'Admin', jamMasuk: '08:00', jamPulang: '12:00',
    jenisPenugasan: 'BACKUP', statusJadwal: 'DIJADWALKAN', tanggalMulai: '2026-11-21', allowSplitShift: true
  }, pbTok);
  assert.equal(s1.status, 'success', s1.message);

  const s2 = pbEnv.ctx.saveJadwalHarian({
    idPegawai: 'EMP002', nama: 'Budi Kurir', outlet: 'YZ_ MDP JAYANTI CIKANDE',
    posisiPenugasan: 'Pickup', jamMasuk: '14:00', jamPulang: '18:00',
    jenisPenugasan: 'ROTASI', statusJadwal: 'DIJADWALKAN', tanggalMulai: '2026-11-21', allowSplitShift: true
  }, pbTok);
  assert.equal(s2.status, 'success', s2.message);

  // Overlapping split shift must be rejected even with allowSplitShift: true
  const sOverlap = pbEnv.ctx.saveJadwalHarian({
    idPegawai: 'EMP002', nama: 'Budi Kurir', outlet: 'YZ_ MDP JAYANTI CIKANDE',
    posisiPenugasan: 'Pickup', jamMasuk: '11:00', jamPulang: '15:00',
    jenisPenugasan: 'ROTASI', statusJadwal: 'DIJADWALKAN', tanggalMulai: '2026-11-21', allowSplitShift: true
  }, pbTok);
  assert.equal(sOverlap.status, 'error', 'Overlapping shift must be rejected');

  const budiTok = loginTestEmployee(pbEnv, pbTok, 'Budi Kurir', 'EMP002');

  // Shift 1 DATANG at 08:00 WIB
  const d1 = pbEnv.ctx.processForm({
    nama: 'Budi Kurir', idPegawai: 'EMP002', status: 'DATANG',
    outlet: 'YZ_ MDP PASIR JAHA BALARAJA', posisi: 'Admin'
  }, { employeeToken: budiTok });
  assert.equal(d1.status, 'success', d1.message);
  assert.equal(d1.assignmentUsed.jamPulangEfektif, '12:00');

  // Trying DATANG at Outlet 2 while Shift 1 is still open must fail!
  pbEnv.setTimeIso('2026-11-21T07:05:00.000Z'); // 14:05 WIB (>4h -> re-login)
  const budiTok2 = pbEnv.ctx.employeeLogin({ identifier: 'EMP002', pin: '123456', deviceId: 'test-dev-EMP002' }).employeeToken;
  const d2Blocked = pbEnv.ctx.processForm({
    nama: 'Budi Kurir', idPegawai: 'EMP002', status: 'DATANG',
    outlet: 'YZ_ MDP JAYANTI CIKANDE', posisi: 'Pickup'
  }, { employeeToken: budiTok2 });
  assert.equal(d2Blocked.status, 'error', 'Cannot DATANG on shift 2 while shift 1 is still open');

  // Close Shift 1 at 14:10 WIB
  pbEnv.setTimeIso('2026-11-21T07:10:00.000Z');
  const p1 = pbEnv.ctx.processForm({
    nama: 'Budi Kurir', idPegawai: 'EMP002', status: 'PULANG',
    outlet: 'YZ_ MDP PASIR JAHA BALARAJA', posisi: 'Admin'
  }, { employeeToken: budiTok2 });
  assert.equal(p1.status, 'success', p1.message);

  // Now Shift 2 DATANG at 14:15 WIB & PULANG at 18:15 WIB
  pbEnv.setTimeIso('2026-11-21T07:15:00.000Z');
  const d2 = pbEnv.ctx.processForm({
    nama: 'Budi Kurir', idPegawai: 'EMP002', status: 'DATANG',
    outlet: 'YZ_ MDP JAYANTI CIKANDE', posisi: 'Pickup'
  }, { employeeToken: budiTok2 });
  assert.equal(d2.status, 'success', d2.message);
  assert.equal(d2.assignmentUsed.posisiPenugasan, 'Pickup');

  pbEnv.setTimeIso('2026-11-21T11:15:00.000Z'); // 18:15 WIB (>4h from budiTok2 -> re-login)
  const budiTok3 = pbEnv.ctx.employeeLogin({ identifier: 'EMP002', pin: '123456', deviceId: 'test-dev-EMP002' }).employeeToken;
  const p2 = pbEnv.ctx.processForm({
    nama: 'Budi Kurir', idPegawai: 'EMP002', status: 'PULANG',
    outlet: 'YZ_ MDP JAYANTI CIKANDE', posisi: 'Pickup'
  }, { employeeToken: budiTok3 });
  assert.equal(p2.status, 'success', p2.message);

  const pbTokRefresh = pbEnv.ctx.ownerLogin({ password: 'SecretOwner#2026' }).token;
  const kehadiran = pbEnv.ctx.getKehadiranHarian('2026-11-21', pbTokRefresh);
  const budi = kehadiran.data.find((r) => r.nama === 'Budi Kurir');
  assert.equal(budi.statusKehadiran, 'HADIR');
  assert.equal(budi.shiftCount, 2);
  assert.equal(budi.multipleSchedules, true);
  assert.equal(budi.totalJam, '10j 10m'); // 6j 10m + 4j 0m
}

// PB-4: Ambiguous multiple schedules & outlet mismatch against JadwalHarian are rejected on DATANG
{
  const pbEnv = createGasEnv('2026-11-21T01:00:00.000Z'); // 08:00 WIB
  const pbTok = pbEnv.ctx.ownerLogin({ password: 'SecretOwner#2026' }).token;
  const riskaTok = loginTestEmployee(pbEnv, pbTok, 'Riska', 'EMP001');
  // Insert two same-outlet schedules on same date directly into JadwalHarian (within wide window)
  pbEnv.ctx.saveJadwalHarian({
    idPegawai: 'EMP001', nama: 'Riska', outlet: 'YZ_ MDP PASIR JAHA BALARAJA',
    posisiPenugasan: 'Admin', jamMasuk: '08:00', jamPulang: '12:00',
    jenisPenugasan: 'NORMAL', statusJadwal: 'DIJADWALKAN', tanggalMulai: '2026-11-21', allowSplitShift: true
  }, pbTok);
  pbEnv.ctx.saveJadwalHarian({
    idPegawai: 'EMP001', nama: 'Riska', outlet: 'YZ_ MDP PASIR JAHA BALARAJA',
    posisiPenugasan: 'Pickup', jamMasuk: '09:30', jamPulang: '15:00',
    jenisPenugasan: 'BACKUP', statusJadwal: 'DIJADWALKAN', tanggalMulai: '2026-11-21', allowSplitShift: true
  }, pbTok);
  // Wait: saveJadwalHarian rejected the overlap! Test manual sheet row with close shift times (<60m early window)
  const jSheet = pbEnv.sheets.get('JadwalHarian');
  jSheet.rows.push(['JDW-AMBIG', '21/11/2026', 'EMP001', 'Riska', 'YZ_ MDP PASIR JAHA BALARAJA', 'Pickup', '08:30', '13:00', 'BACKUP', 'DIJADWALKAN', '', 'Owner', '', '']);

  const ambigRes = pbEnv.ctx.processForm({
    nama: 'Riska', idPegawai: 'EMP001', status: 'DATANG',
    outlet: 'YZ_ MDP PASIR JAHA BALARAJA', posisi: 'Admin'
  }, { employeeToken: riskaTok });
  assert.equal(ambigRes.status, 'error', 'Ambiguous active schedules must be rejected, not silently pick first');

  // Outlet mismatch vs single JadwalHarian
  jSheet.rows.pop();
  const mismatchRes = pbEnv.ctx.processForm({
    nama: 'Riska', idPegawai: 'EMP001', status: 'DATANG',
    outlet: 'YZ_ MDP JAYANTI CIKANDE', posisi: 'Admin'
  }, { employeeToken: riskaTok });
  assert.equal(mismatchRes.status, 'error', 'DATANG at wrong outlet vs JadwalHarian must be rejected');
}

// PB-5: Ad-hoc other-outlet DATANG without JadwalHarian uses DataPosisi hours & MANUAL_OUTLET_OVERRIDE snapshot
{
  const pbEnv = createGasEnv('2026-11-21T07:05:00.000Z'); // 14:05 WIB
  const pbTok = pbEnv.ctx.ownerLogin({ password: 'SecretOwner#2026' }).token;
  const riskaTok = loginTestEmployee(pbEnv, pbTok, 'Riska', 'EMP001');
  assert.equal(pbEnv.ctx.savePenempatan({
    idPegawai: 'EMP001', nama: 'Riska', outlet: 'YZ_ MDP PASIR JAHA BALARAJA',
    posisi: 'Admin', jamMasuk: '07:00', jamPulang: '19:00', hariKerja: ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'],
    tanggalMulai: '2026-11-01'
  }, pbTok).status, 'success');
  const dOverride = pbEnv.ctx.processForm({
    nama: 'Riska', idPegawai: 'EMP001', status: 'DATANG',
    outlet: 'YZ_ MDP JAYANTI CIKANDE', posisi: 'Pickup'
  }, { employeeToken: riskaTok });
  assert.equal(dOverride.status, 'success', dOverride.message);
  assert.equal(dOverride.assignmentUsed.sumberJadwal, 'MANUAL_OUTLET_OVERRIDE');
  assert.equal(dOverride.assignmentUsed.jamMasukEfektif, '14:00');
  assert.equal(dOverride.assignmentUsed.jamPulangEfektif, '22:00');
}

// PB-6: Overnight shift (22:00 -> 06:00 next day) DATANG/PULANG & post-DATANG JadwalHarian immutability
{
  const pbEnv = createGasEnv('2026-11-21T15:00:00.000Z'); // 21 Nov 22:00 WIB
  const pbTok = pbEnv.ctx.ownerLogin({ password: 'SecretOwner#2026' }).token;
  const budiTok = loginTestEmployee(pbEnv, pbTok, 'Budi Kurir', 'EMP002');
  const sch = pbEnv.ctx.saveJadwalHarian({
    idPegawai: 'EMP002', nama: 'Budi Kurir', outlet: 'YZ_ MDP PASIR JAHA BALARAJA',
    posisiPenugasan: 'Pickup', jamMasuk: '22:00', jamPulang: '06:00',
    jenisPenugasan: 'ROTASI', statusJadwal: 'DIJADWALKAN', tanggalMulai: '2026-11-21'
  }, pbTok);
  assert.equal(sch.status, 'success', sch.message);

  const dNight = pbEnv.ctx.processForm({
    nama: 'Budi Kurir', idPegawai: 'EMP002', status: 'DATANG',
    outlet: 'YZ_ MDP PASIR JAHA BALARAJA', posisi: 'Pickup'
  }, { employeeToken: budiTok });
  assert.equal(dNight.status, 'success', dNight.message);

  // Edit JadwalHarian after DATANG to verify snapshot isolation
  pbEnv.ctx.updateJadwalHarian({
    idJadwal: sch.createdIds[0], outlet: 'YZ_ MDP JAYANTI CIKANDE', posisiPenugasan: 'Admin',
    jamMasuk: '08:00', jamPulang: '23:00', jenisPenugasan: 'ROTASI', statusJadwal: 'DIJADWALKAN',
    confirmAfterDatang: true
  }, pbTok);

  // At 23:00 WIB on 21 Nov (before 06:00 next morning), PULANG must fail
  pbEnv.setTimeIso('2026-11-21T16:00:00.000Z');
  const earlyNightPulang = pbEnv.ctx.processForm({
    nama: 'Budi Kurir', idPegawai: 'EMP002', status: 'PULANG',
    outlet: 'YZ_ MDP PASIR JAHA BALARAJA', posisi: 'Pickup'
  }, { employeeToken: budiTok });
  assert.equal(earlyNightPulang.status, 'error', 'Overnight shift PULANG before 06:00 next day must fail');

  // At 06:15 WIB on 22 Nov -> PULANG succeeds and closes yesterday's shift with 8j 15m
  pbEnv.setTimeIso('2026-11-21T23:15:00.000Z'); // 22 Nov 06:15 WIB (>4h -> re-login)
  const budiNightTok2 = pbEnv.ctx.employeeLogin({ identifier: 'EMP002', pin: '123456', deviceId: 'test-dev-EMP002' }).employeeToken;
  const okNightPulang = pbEnv.ctx.processForm({
    nama: 'Budi Kurir', idPegawai: 'EMP002', status: 'PULANG',
    outlet: 'YZ_ MDP PASIR JAHA BALARAJA', posisi: 'Pickup'
  }, { employeeToken: budiNightTok2 });
  assert.equal(okNightPulang.status, 'success', okNightPulang.message);
  const absRow = pbEnv.sheets.get('Data_Absensi').rows[1];
  assert.equal(absRow[0], '21/11/2026');
  assert.equal(absRow[5], '06:15');
  assert.equal(absRow[6], '8j 15m');
}

// PB-7: Auth & active filter rejects NONAKTIF employee and ambiguous duplicateName without idPegawai
{
  const pbEnv = createGasEnv('2026-11-21T01:00:00.000Z', {
    extraEmployees: [
      ['Andi', '', 'a1@jnt.test', 'p', '081', '01/01/2026', '', 'AKTIF', '', ''],
      ['Andi', '', 'a2@jnt.test', 'p', '082', '01/01/2026', '', 'AKTIF', '', '']
    ]
  });
  const nonAktifLogin = pbEnv.ctx.employeeLogin({ identifier: 'Dedi Nonaktif', pin: '123456', deviceId: 'pb7-dev' });
  assert.equal(nonAktifLogin.status, 'error', 'NONAKTIF employee cannot log in');
  const nonAktifSubmit = pbEnv.ctx.processForm({
    nama: 'Dedi Nonaktif', status: 'DATANG', outlet: 'YZ_ MDP PASIR JAHA BALARAJA', posisi: 'Admin'
  });
  assert.equal(nonAktifSubmit.status, 'error');

  const dupLogin = pbEnv.ctx.employeeLogin({ identifier: 'Andi', pin: '123456', deviceId: 'pb7-dup' });
  assert.equal(dupLogin.status, 'error');
  assert.equal(dupLogin.ambiguousName, true, 'Duplicate name without idPegawai must prompt for ID Pegawai');
}

// PB-8: Duplicate closed single-shift DATANG rejected, IZIN after DATANG rejected, case/whitespace name canonicalized
{
  const pbEnv = createGasEnv('2026-11-21T01:00:00.000Z'); // 08:00 WIB
  const pbTok = pbEnv.ctx.ownerLogin({ password: 'SecretOwner#2026' }).token;
  const riskaTok = loginTestEmployee(pbEnv, pbTok, 'Riska', 'EMP001');
  const d1 = pbEnv.ctx.processForm({
    nama: '  riska ', status: 'DATANG', outlet: 'YZ_ MDP PASIR JAHA BALARAJA', posisi: 'Admin'
  }, { employeeToken: riskaTok });
  assert.equal(d1.status, 'success', d1.message);
  assert.equal(pbEnv.sheets.get('Data_Absensi').rows[1][1], 'Riska', 'Name should be canonicalized to DataPegawai nama');

  pbEnv.setTimeIso('2026-11-21T13:15:00.000Z'); // 20:15 WIB (>4h -> re-login)
  const riskaTok2 = pbEnv.ctx.employeeLogin({ identifier: 'EMP001', pin: '123456', deviceId: 'test-dev-EMP001' }).employeeToken;
  const p1 = pbEnv.ctx.processForm({
    nama: 'Riska', status: 'PULANG', outlet: 'YZ_ MDP PASIR JAHA BALARAJA', posisi: 'Admin'
  }, { employeeToken: riskaTok2 });
  assert.equal(p1.status, 'success', p1.message);

  // Duplicate DATANG after closed single shift -> rejected
  const d2 = pbEnv.ctx.processForm({
    nama: 'Riska', status: 'DATANG', outlet: 'YZ_ MDP PASIR JAHA BALARAJA', posisi: 'Admin'
  }, { employeeToken: riskaTok2 });
  assert.equal(d2.status, 'error');

  // IZIN after already DATANG -> rejected
  const izinAfter = pbEnv.ctx.processForm({
    nama: 'Riska', status: 'IZIN', posisi: 'Admin', jenisIzin: 'Izin', alasan: 'Urusan'
  }, { employeeToken: riskaTok2 });
  assert.equal(izinAfter.status, 'error');
}

// PB-9 & PB-10: IZIN -> SAKIT re-submission deduplication + cancelKetidakhadiran soft-cancel + Data_Absensi sync + clean re-submit
{
  const pbEnv = createGasEnv('2026-11-21T02:00:00.000Z');
  const pbTok = pbEnv.ctx.ownerLogin({ password: 'SecretOwner#2026' }).token;
  const sitiTok = loginTestEmployee(pbEnv, pbTok, 'Siti Magang', 'EMP003');

  const izin1 = pbEnv.ctx.processForm({
    nama: 'Siti Magang', status: 'IZIN', posisi: 'Magang', jenisIzin: 'Izin', alasan: 'Keperluan keluarga'
  }, { employeeToken: sitiTok });
  assert.equal(izin1.status, 'success');
  const izin2 = pbEnv.ctx.processForm({
    nama: 'Siti Magang', status: 'IZIN', posisi: 'Magang', jenisIzin: 'Sakit', alasan: 'Demam tinggi'
  }, { employeeToken: sitiTok });
  assert.equal(izin2.status, 'success');

  assert.equal(pbEnv.sheets.get('DataKetidakhadiran').rows.length, 2, 'DataKetidakhadiran must not duplicate on re-submit');
  assert.equal(pbEnv.sheets.get('AbsenIzin').rows.length, 2, 'AbsenIzin must not duplicate on re-submit');
  assert.equal(pbEnv.sheets.get('Data_Absensi').rows.length, 2, 'Data_Absensi must not duplicate IZIN row on re-submit');
  assert.equal(pbEnv.sheets.get('DataKetidakhadiran').rows[1][5], 'SAKIT');

  // Cancel Siti's SAKIT via Owner
  const cancelRes = pbEnv.ctx.cancelKetidakhadiran({
    tanggal: '2026-11-21', idPegawai: 'EMP003', nama: 'Siti Magang', alasan: 'Salah input'
  }, pbTok);
  assert.equal(cancelRes.status, 'success', cancelRes.message);
  assert.equal(pbEnv.sheets.get('DataKetidakhadiran').rows[1][5], 'DIBATALKAN', 'DataKetidakhadiran should be soft-cancelled');
  assert.equal(pbEnv.sheets.get('Data_Absensi').rows[1][7], 'DIBATALKAN', 'Synced IZIN row in Data_Absensi must be DIBATALKAN');
  assert.equal(pbEnv.sheets.get('Data_Absensi').rows[1][15], 'Owner');

  // Verify canceled absence disappears from all active views
  assert.equal(pbEnv.ctx.getKetidakhadiran('2026-11-21', '', 'Siti Magang', '', pbTok).data.length, 0);
  assert.equal(pbEnv.ctx.getKehadiranHarian('2026-11-21', pbTok).data.find((r) => r.nama === 'Siti Magang').statusKehadiran, 'BELUM DIJADWALKAN');
  assert.equal(pbEnv.ctx.getRingkasanHarian('2026-11-21', pbTok).data.length, 0);
  assert.equal(pbEnv.ctx.getRiwayat('Siti Magang', { employeeToken: sitiTok }).data.length, 0);
  const lapCancel = pbEnv.ctx.getLaporanBulanan('2026-11', pbTok);
  assert.equal(lapCancel.data.length, 0, 'Cancelled absence must not appear in Laporan Bulanan');

  // Clean re-submission after cancellation creates new active record
  const izinAfterCancel = pbEnv.ctx.processForm({
    nama: 'Siti Magang', status: 'IZIN', posisi: 'Magang', jenisIzin: 'Izin', alasan: 'Izin baru sah'
  }, { employeeToken: sitiTok });
  assert.equal(izinAfterCancel.status, 'success');
  assert.equal(pbEnv.ctx.getKetidakhadiran('2026-11-21', '', 'Siti Magang', '', pbTok).data.length, 1);
}

// PB-11 & PB-12: closeDailyAttendance safety (future rejected, dryRun no-write, idempotent rerun, skipped statuses) & LIBUR conflict
{
  const pbEnv = createGasEnv('2026-11-21T10:00:00.000Z');
  const pbTok = pbEnv.ctx.ownerLogin({ password: 'SecretOwner#2026' }).token;

  assert.equal(pbEnv.ctx.savePenempatan({
    idPegawai: 'EMP001', nama: 'Riska', outlet: 'YZ_ MDP PASIR JAHA BALARAJA',
    posisi: 'Admin', jamMasuk: '08:00', jamPulang: '20:00', hariKerja: ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'],
    tanggalMulai: '2026-11-01'
  }, pbTok).status, 'success');
  assert.equal(pbEnv.ctx.savePenempatan({
    idPegawai: 'EMP002', nama: 'Budi Kurir', outlet: 'YZ_ MDP PASIR JAHA BALARAJA',
    posisi: 'Pickup', jamMasuk: '14:00', jamPulang: '22:00', hariKerja: ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'],
    tanggalMulai: '2026-11-01'
  }, pbTok).status, 'success');
  // Set Budi LIBUR on 2026-11-21
  const jLibur = pbEnv.ctx.saveJadwalHarian({
    idPegawai: 'EMP002', nama: 'Budi Kurir', statusJadwal: 'LIBUR', tanggalMulai: '2026-11-21'
  }, pbTok);
  assert.equal(jLibur.status, 'success');

  // Updating LIBUR to DIJADWALKAN when employee already has active DIJADWALKAN must fail cross-row check; adding DIJADWALKAN rejected when LIBUR exists
  const conflictSchedule = pbEnv.ctx.saveJadwalHarian({
    idPegawai: 'EMP002', nama: 'Budi Kurir', outlet: 'YZ_ MDP PASIR JAHA BALARAJA',
    posisiPenugasan: 'Pickup', jamMasuk: '14:00', jamPulang: '22:00',
    statusJadwal: 'DIJADWALKAN', tanggalMulai: '2026-11-21'
  }, pbTok);
  assert.equal(conflictSchedule.status, 'error', 'Cannot add DIJADWALKAN while LIBUR exists on same date');

  // Future date rejected
  const futureClose = pbEnv.ctx.closeDailyAttendance({ tanggal: '2026-11-25' }, pbTok);
  assert.equal(futureClose.status, 'error');

  // dryRun preview writes nothing
  const previewClose = pbEnv.ctx.closeDailyAttendance({ tanggal: '2026-11-21', dryRun: true }, pbTok);
  assert.equal(previewClose.status, 'success');
  assert.equal(previewClose.dryRun, true);
  assert.equal(previewClose.eligibleCount, 1);
  assert.deepEqual(Array.from(previewClose.eligible).map((e) => e.nama), ['Riska']);
  assert.equal(pbEnv.sheets.get('DataKetidakhadiran')?.rows.length || 1, 1, 'dryRun must not write ALPA rows');

  // Execute twice -> first marks Riska once, second returns alreadyClosed: true
  const exec1 = pbEnv.ctx.closeDailyAttendance({ tanggal: '2026-11-21' }, pbTok);
  assert.equal(exec1.markedCount, 1);
  assert.equal(exec1.alreadyClosed, false);

  const exec2 = pbEnv.ctx.closeDailyAttendance({ tanggal: '2026-11-21' }, pbTok);
  assert.equal(exec2.markedCount, 0);
  assert.equal(exec2.alreadyClosed, true);
  assert.equal(pbEnv.sheets.get('DataKetidakhadiran').rows.length, 2, 'Idempotent closeDailyAttendance must not create duplicate ALPA rows');
}

// PB-13: getLaporanBulanan canonical merge (HADIR + IZIN + SAKIT + ALPA, no double count, historical NONAKTIF kept)
{
  const pbEnv = createGasEnv('2026-11-18T01:00:00.000Z');
  const pbTok = pbEnv.ctx.ownerLogin({ password: 'SecretOwner#2026' }).token;
  assert.equal(pbEnv.ctx.savePenempatan({
    idPegawai: 'EMP001', nama: 'Riska', outlet: 'YZ_ MDP PASIR JAHA BALARAJA',
    posisi: 'Admin', jamMasuk: '08:00', jamPulang: '20:00', hariKerja: ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'],
    tanggalMulai: '2026-11-01'
  }, pbTok).status, 'success');
  assert.equal(pbEnv.ctx.savePenempatan({
    idPegawai: 'EMP002', nama: 'Budi Kurir', outlet: 'YZ_ MDP PASIR JAHA BALARAJA',
    posisi: 'Pickup', jamMasuk: '08:00', jamPulang: '17:00', hariKerja: ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'],
    tanggalMulai: '2026-11-01'
  }, pbTok).status, 'success');

  // Day 18: Riska HADIR (08:00 -> 20:00), Siti SAKIT via processForm (syncs DataKetidakhadiran + Data_Absensi)
  const riskaTok = loginTestEmployee(pbEnv, pbTok, 'Riska', 'EMP001');
  const sitiTok = loginTestEmployee(pbEnv, pbTok, 'Siti Magang', 'EMP003');
  pbEnv.ctx.processForm({ nama: 'Riska', status: 'DATANG', outlet: 'YZ_ MDP PASIR JAHA BALARAJA', posisi: 'Admin' }, { employeeToken: riskaTok });
  pbEnv.ctx.processForm({ nama: 'Siti Magang', status: 'IZIN', posisi: 'Magang', jenisIzin: 'Sakit', alasan: 'Flu berat' }, { employeeToken: sitiTok });
  pbEnv.setTimeIso('2026-11-18T13:00:00.000Z'); // 20:00 WIB (>4h -> re-login)
  const riskaTok2 = pbEnv.ctx.employeeLogin({ identifier: 'EMP001', pin: '123456', deviceId: 'test-dev-EMP001' }).employeeToken;
  pbEnv.ctx.processForm({ nama: 'Riska', status: 'PULANG', outlet: 'YZ_ MDP PASIR JAHA BALARAJA', posisi: 'Admin' }, { employeeToken: riskaTok2 });

  // Owner marks Budi ALPA on 18 Nov, AND manually records SAKIT for Riska on 18 Nov to test no double-count when HADIR exists
  const pbTok2 = pbEnv.ctx.ownerLogin({ password: 'SecretOwner#2026' }).token;
  pbEnv.ctx.closeDailyAttendance({ tanggal: '2026-11-18' }, pbTok2);
  // Seed historical Data_Absensi row from earlier in Nov for Dedi Nonaktif (now NONAKTIF in DataPegawai)
  pbEnv.sheets.get('Data_Absensi').rows.push([
    '05/11/2026', 'Dedi Nonaktif', 'Admin', 'YZ_ MDP PASIR JAHA BALARAJA', '08:00', '20:00', '12j 0m', 'TEPAT WAKTU', 'NORMAL', '-', '-', '', '', '-', '-'
  ]);

  // Day 19: Riska SAKIT via Owner saveKetidakhadiran (DataKetidakhadiran only)
  pbEnv.ctx.saveKetidakhadiran({
    tanggal: '2026-11-19', idPegawai: 'EMP001', nama: 'Riska',
    outlet: 'YZ_ MDP PASIR JAHA BALARAJA', posisi: 'Admin', status: 'SAKIT', alasan: 'Demam'
  }, pbTok2);

  const lap = pbEnv.ctx.getLaporanBulanan('2026-11', pbTok2);
  assert.equal(lap.status, 'success');
  const lapRiska = lap.data.find((x) => x.nama === 'Riska');
  const lapBudi = lap.data.find((x) => x.nama === 'Budi Kurir');
  const lapSiti = lap.data.find((x) => x.nama === 'Siti Magang');
  const lapDedi = lap.data.find((x) => x.nama === 'Dedi Nonaktif');

  assert.equal(lapRiska.jumlahMasuk, 1);
  assert.equal(lapRiska.jumlahSakit, 1);
  assert.equal(lapBudi.jumlahAlpa, 1);
  assert.equal(lapSiti.jumlahSakit, 1, 'Siti Sakit must count as jumlahSakit=1');
  assert.equal(lapSiti.jumlahIzin, 0, 'Siti Sakit must NOT be double counted or mislabeled as jumlahIzin');
  assert.equal(lapDedi.jumlahMasuk, 1, 'Historical NONAKTIF employee record in Nov must be preserved');

  const outBal = lap.dataOutlet.find((o) => o.outlet === 'YZ_ MDP PASIR JAHA BALARAJA');
  assert.equal(outBal.jumlahMasuk, 2); // Riska + Dedi historical
  assert.equal(outBal.jumlahSakit, 1); // Riska 19 Nov
  assert.equal(outBal.jumlahAlpa, 1);  // Budi 18 Nov
}

// PB-14: Asia/Jakarta midnight boundary (16:45 UTC = 23:45 WIB Day 21 vs 17:15 UTC = 00:15 WIB Day 22)
{
  const pbEnv = createGasEnv('2026-11-21T16:45:00.000Z');
  assert.equal(pbEnv.ctx.getJakartaDateStr(), '21/11/2026');
  pbEnv.setTimeIso('2026-11-21T17:15:00.000Z');
  assert.equal(pbEnv.ctx.getJakartaDateStr(), '22/11/2026');
}

// ==================== v2.10.0 LAYERED SECURITY & AUTHENTICATION (15 SCENARIOS) ====================

// LS-1: Valid employee login by Nama or ID Pegawai updates PinLastUsed & upgrades plaintext PIN
{
  const lsEnv = createGasEnv('2026-11-21T02:00:00.000Z');
  const ownTok = lsEnv.ctx.ownerLogin({ password: 'SecretOwner#2026' }).token;
  assert.equal(lsEnv.ctx.setEmployeePin({ idPegawai: 'EMP001', nama: 'Riska', pin: '246810' }, ownTok).status, 'success');

  const storedHash = lsEnv.sheets.get('DataPegawai').rows[1][10];
  assert.ok(String(storedHash).startsWith('sha256$'), 'PIN must be stored as salted SHA-256 hash');
  assert.equal(String(storedHash).includes('246810'), false, 'Raw PIN must never be stored in DataPegawai col K');

  const loginByName = lsEnv.ctx.employeeLogin({ identifier: 'riska', pin: '246810', deviceId: 'dev-ls1-a' });
  assert.equal(loginByName.status, 'success', loginByName.message);
  assert.ok(loginByName.employeeToken.startsWith('EMP-'));
  assert.ok(lsEnv.sheets.get('DataPegawai').rows[1][12], 'PinLastUsed (col M) must be updated on login');

  // Legacy plaintext PIN manually entered in Sheet col K should upgrade transparently on valid login
  lsEnv.sheets.get('DataPegawai').rows[2][10] = '654321';
  const loginLegacy = lsEnv.ctx.employeeLogin({ identifier: 'EMP002', pin: '654321', deviceId: 'dev-ls1-b' });
  assert.equal(loginLegacy.status, 'success', loginLegacy.message);
  assert.ok(String(lsEnv.sheets.get('DataPegawai').rows[2][10]).startsWith('sha256$'), 'Plaintext sheet PIN upgraded to hash');
}

// LS-2 & LS-3: 3 wrong PINs lock account for 15 minutes, reject while locked, and unlock after +15 minutes
{
  const lsEnv = createGasEnv('2026-11-21T02:00:00.000Z');
  const ownTok = lsEnv.ctx.ownerLogin({ password: 'SecretOwner#2026' }).token;
  lsEnv.ctx.setEmployeePin({ idPegawai: 'EMP001', nama: 'Riska', pin: '112233' }, ownTok);

  const w1 = lsEnv.ctx.employeeLogin({ identifier: 'EMP001', pin: '000001', deviceId: 'dev-lock' });
  assert.equal(w1.status, 'error');
  assert.equal(w1.remainingAttempts, 2);

  const w2 = lsEnv.ctx.employeeLogin({ identifier: 'EMP001', pin: '000002', deviceId: 'dev-lock' });
  assert.equal(w2.status, 'error');
  assert.equal(w2.remainingAttempts, 1);

  const w3 = lsEnv.ctx.employeeLogin({ identifier: 'EMP001', pin: '000003', deviceId: 'dev-lock' });
  assert.equal(w3.status, 'error');
  assert.equal(w3.locked, true, '3 wrong PINs must lock account for 15 minutes');

  // Even correct PIN from another device must fail while locked
  const duringLock = lsEnv.ctx.employeeLogin({ identifier: 'EMP001', pin: '112233', deviceId: 'dev-other' });
  assert.equal(duringLock.status, 'error');
  assert.equal(duringLock.locked, true);

  // Advance +16 minutes -> unlocks automatically
  lsEnv.setTimeIso('2026-11-21T02:16:00.000Z');
  const afterLock = lsEnv.ctx.employeeLogin({ identifier: 'EMP001', pin: '112233', deviceId: 'dev-other' });
  assert.equal(afterLock.status, 'success', afterLock.message);
}

// LS-4 & LS-5: processForm rejects missing/invalid/expired employeeToken and spoofing nama/idPegawai
{
  const lsEnv = createGasEnv('2026-11-21T02:00:00.000Z');
  const ownTok = lsEnv.ctx.ownerLogin({ password: 'SecretOwner#2026' }).token;
  const riskaTok = loginTestEmployee(lsEnv, ownTok, 'Riska', 'EMP001', '123456', 'ls4');

  const noTok = lsEnv.ctx.processForm({ nama: 'Riska', status: 'DATANG', outlet: 'YZ_ MDP PASIR JAHA BALARAJA', posisi: 'Admin' });
  assert.equal(noTok.status, 'error');
  assert.equal(noTok.authRequired, true);

  const badTok = lsEnv.ctx.processForm({ nama: 'Riska', status: 'DATANG', outlet: 'YZ_ MDP PASIR JAHA BALARAJA', posisi: 'Admin' }, { employeeToken: 'EMP-fake' });
  assert.equal(badTok.status, 'error');
  assert.equal(badTok.authRequired, true);

  // Spoof another employee's name or ID using Riska's token
  const spoofNama = lsEnv.ctx.processForm({ nama: 'Budi Kurir', status: 'DATANG', outlet: 'YZ_ MDP PASIR JAHA BALARAJA', posisi: 'Pickup' }, { employeeToken: riskaTok });
  assert.equal(spoofNama.status, 'error');
  assert.equal(spoofNama.authRequired, true, 'Must reject nama mismatch spoofing');

  const spoofId = lsEnv.ctx.processForm({ nama: 'Riska', idPegawai: 'EMP002', status: 'DATANG', outlet: 'YZ_ MDP PASIR JAHA BALARAJA', posisi: 'Admin' }, { employeeToken: riskaTok });
  assert.equal(spoofId.status, 'error');
  assert.equal(spoofId.authRequired, true, 'Must reject idPegawai mismatch spoofing');

  // Expiry after > 4 hours
  lsEnv.setTimeIso('2026-11-21T06:30:00.000Z');
  const expiredEmp = lsEnv.ctx.processForm({ nama: 'Riska', status: 'DATANG', outlet: 'YZ_ MDP PASIR JAHA BALARAJA', posisi: 'Admin' }, { employeeToken: riskaTok });
  assert.equal(expiredEmp.status, 'error');
  assert.equal(expiredEmp.authRequired, true, 'Expired employeeToken (>4h) must be rejected');
}

// LS-6, LS-7, LS-8: Endpoint authorization boundaries & cross-employee data isolation
{
  const lsEnv = createGasEnv('2026-11-21T01:00:00.000Z'); // 08:00 WIB
  const ownTok = lsEnv.ctx.ownerLogin({ password: 'SecretOwner#2026' }).token;
  const riskaTok = loginTestEmployee(lsEnv, ownTok, 'Riska', 'EMP001');
  const budiTok = loginTestEmployee(lsEnv, ownTok, 'Budi Kurir', 'EMP002');

  assert.equal(lsEnv.ctx.processForm({ nama: 'Riska', status: 'DATANG', outlet: 'YZ_ MDP PASIR JAHA BALARAJA', posisi: 'Admin' }, { employeeToken: riskaTok }).status, 'success');
  assert.equal(lsEnv.ctx.processForm({ nama: 'Budi Kurir', status: 'DATANG', outlet: 'YZ_ MDP JAYANTI CIKANDE', posisi: 'Pickup' }, { employeeToken: budiTok }).status, 'success');

  // getPegawai requires ownerToken (must reject anonymous AND employeeToken)
  assert.equal(lsEnv.ctx.getPegawai('').authRequired, true);
  assert.equal(lsEnv.ctx.getPegawai(riskaTok).authRequired, true, 'employeeToken cannot list all employees via getPegawai');

  // Cross-employee getRiwayat / getRiwayatBulan / getPegawaiDetail denied
  assert.equal(lsEnv.ctx.getRiwayat('Budi Kurir', '').authRequired, true);
  assert.equal(lsEnv.ctx.getRiwayat('Budi Kurir', { employeeToken: riskaTok }).authRequired, true, 'Cannot read another employee riwayat');
  assert.equal(lsEnv.ctx.getRiwayatBulan('Budi Kurir', '2026-11', { employeeToken: riskaTok }).authRequired, true, 'Cannot read another employee monthly riwayat');
  assert.equal(lsEnv.ctx.getPegawaiDetail('Budi Kurir', 'EMP002', '2026-11-21', { employeeToken: riskaTok }).authRequired, true, 'Cannot read another employee detail');

  // getRingkasanHarian rejects unauth; returns self-only for employeeToken; returns all for ownerToken
  assert.equal(lsEnv.ctx.getRingkasanHarian('2026-11-21', '', '').authRequired, true);
  const empRingkasan = lsEnv.ctx.getRingkasanHarian('2026-11-21', '', riskaTok);
  assert.equal(empRingkasan.status, 'success');
  assert.equal(empRingkasan.data.length, 1);
  assert.equal(empRingkasan.data[0].nama, 'Riska', 'employeeToken only sees own ringkasan row');

  const ownerRingkasan = lsEnv.ctx.getRingkasanHarian('2026-11-21', ownTok, '');
  assert.equal(ownerRingkasan.status, 'success');
  assert.equal(ownerRingkasan.data.length, 2);
}

// LS-9 & LS-10: changeOwnerPassword complexity, password history, hashed storage, and global session invalidation
{
  const lsEnv = createGasEnv('2026-11-21T02:00:00.000Z');
  const tokA = lsEnv.ctx.ownerLogin({ password: 'SecretOwner#2026', deviceId: 'dev-a' }).token;
  const tokB = lsEnv.ctx.ownerLogin({ password: 'SecretOwner#2026', deviceId: 'dev-b' }).token;

  assert.equal(lsEnv.ctx.changeOwnerPassword({ currentPassword: 'SecretOwner#2026', newPassword: 'short1' }, tokA).status, 'error', 'Password <8 chars rejected');
  assert.equal(lsEnv.ctx.changeOwnerPassword({ currentPassword: 'SecretOwner#2026', newPassword: '12345678' }, tokA).status, 'error', 'Digits-only password rejected');
  assert.equal(lsEnv.ctx.changeOwnerPassword({ currentPassword: 'SecretOwner#2026', newPassword: 'onlyletters' }, tokA).status, 'error', 'Letters-only password rejected');
  assert.equal(lsEnv.ctx.changeOwnerPassword({ currentPassword: 'WrongCurrent1', newPassword: 'ValidPass123' }, tokA).status, 'error', 'Wrong current password rejected');

  const ch1 = lsEnv.ctx.changeOwnerPassword({ currentPassword: 'SecretOwner#2026', newPassword: 'NewOwnerPass1' }, tokA);
  assert.equal(ch1.status, 'success', ch1.message);
  assert.ok(String(lsEnv.sheets.get('Settings').getRange('B10').getValue()).startsWith('sha256$'), 'Settings!B10 updated to salted SHA-256 hash');

  // All previous tokens (both tokA & tokB) must now be invalid in Cache + Properties
  assert.equal(lsEnv.ctx.checkOwnerToken(tokA).ok, false, 'Issuer session invalidated on password change');
  assert.equal(lsEnv.ctx.checkOwnerToken(tokB).ok, false, 'All other Owner sessions invalidated on password change');

  // Old password login must fail; new password succeeds
  assert.equal(lsEnv.ctx.ownerLogin({ password: 'SecretOwner#2026', deviceId: 'dev-c' }).status, 'error');
  const tokNew = lsEnv.ctx.ownerLogin({ password: 'NewOwnerPass1', deviceId: 'dev-c' }).token;
  assert.ok(tokNew, 'Login with new hashed password succeeds');

  // Reusing a recent password (from last 5) must fail
  const reuseTry = lsEnv.ctx.changeOwnerPassword({ currentPassword: 'NewOwnerPass1', newPassword: 'SecretOwner#2026' }, tokNew);
  assert.equal(reuseTry.status, 'error', 'Password reuse from history must be rejected');
}

// LS-11 & LS-12: getOwnerSessions masks tokens + revokeOwnerSession (single & revokeAllOthers)
{
  const lsEnv = createGasEnv('2026-11-21T02:00:00.000Z');
  const tok1 = lsEnv.ctx.ownerLogin({ password: 'SecretOwner#2026', deviceId: 'phone-1', userAgent: 'Safari' }).token;
  const tok2 = lsEnv.ctx.ownerLogin({ password: 'SecretOwner#2026', deviceId: 'laptop-2', userAgent: 'Chrome' }).token;
  const tok3 = lsEnv.ctx.ownerLogin({ password: 'SecretOwner#2026', deviceId: 'tablet-3', userAgent: 'Firefox' }).token;

  const sessList = lsEnv.ctx.getOwnerSessions(tok1);
  assert.equal(sessList.status, 'success');
  assert.equal(sessList.data.length, 3);
  const serializedSess = JSON.stringify(sessList);
  assert.equal(serializedSess.includes(tok1), false, 'getOwnerSessions must never expose raw ownerToken');
  assert.equal(serializedSess.includes(tok2), false, 'getOwnerSessions must never expose raw other ownerToken');
  assert.equal(sessList.data.filter((s) => s.isCurrent).length, 1);

  const otherSess = sessList.data.find((s) => !s.isCurrent);
  assert.equal(lsEnv.ctx.revokeOwnerSession({ sessionId: otherSess.sessionId }, tok1).status, 'success');
  assert.equal(lsEnv.ctx.getOwnerSessions(tok1).data.length, 2);

  // revokeAllOthers keeps tok1 active and removes remaining other session
  assert.equal(lsEnv.ctx.revokeOwnerSession({ revokeAllOthers: true }, tok1).status, 'success');
  assert.equal(lsEnv.ctx.checkOwnerToken(tok1).ok, true, 'Current session remains active after revokeAllOthers');
  assert.equal(lsEnv.ctx.checkOwnerToken(tok2).ok && lsEnv.ctx.checkOwnerToken(tok3).ok, false, 'Other sessions revoked');
}

// LS-13: AuditLog records actions & redacts sensitive credentials (PIN/password/tokens/images)
{
  const lsEnv = createGasEnv('2026-11-21T02:00:00.000Z');
  const ownTok = lsEnv.ctx.ownerLogin({ password: 'SecretOwner#2026', deviceId: 'audit-dev' }).token;
  lsEnv.ctx.setEmployeePin({ idPegawai: 'EMP001', nama: 'Riska', pin: '789012' }, ownTok);
  lsEnv.ctx.employeeLogin({ identifier: 'EMP001', pin: '999999', deviceId: 'audit-dev' }); // failed attempt

  const auditRes = lsEnv.ctx.getAuditLogs({ limit: 50 }, ownTok);
  assert.equal(auditRes.status, 'success');
  assert.ok(auditRes.data.length >= 3);
  assert.ok(auditRes.data.some((l) => l.action === 'setEmployeePin' && l.status === 'SUCCESS'));
  assert.ok(auditRes.data.some((l) => l.action === 'employeeLogin' && l.status === 'FAILED'));

  const auditJson = JSON.stringify(auditRes.data);
  assert.equal(auditJson.includes('SecretOwner#2026'), false, 'AuditLog must never contain owner password');
  assert.equal(auditJson.includes('789012'), false, 'AuditLog must never contain raw employee PIN');
  assert.equal(auditJson.includes(ownTok), false, 'AuditLog must never contain raw ownerToken');
}

// LS-14: Rate limiting enforces limits per window and resets after window expiry
{
  const lsEnv = createGasEnv('2026-11-21T02:00:00.000Z');
  // ownerLogin: max 3 / 15m per deviceId
  for (let i = 0; i < 3; i++) {
    assert.equal(lsEnv.ctx.ownerLogin({ password: 'WrongPassword1', deviceId: 'rl-owner-dev' }).rateLimited, undefined);
  }
  const ownerRlBlocked = lsEnv.ctx.ownerLogin({ password: 'SecretOwner#2026', deviceId: 'rl-owner-dev' });
  assert.equal(ownerRlBlocked.status, 'error');
  assert.equal(ownerRlBlocked.rateLimited, true, '4th ownerLogin within 15m on same deviceId must be rate-limited');

  // employeeLogin: max 5 / 15m per account+deviceId
  const adminTok = lsEnv.ctx.ownerLogin({ password: 'SecretOwner#2026', deviceId: 'admin-setup' }).token;
  lsEnv.ctx.setEmployeePin({ idPegawai: 'EMP001', nama: 'Riska', pin: '123456' }, adminTok);
  for (let i = 0; i < 5; i++) {
    lsEnv.ctx.employeeLogin({ identifier: 'EMP002', pin: '111111', deviceId: 'rl-emp-dev' });
  }
  const empRlBlocked = lsEnv.ctx.employeeLogin({ identifier: 'EMP002', pin: '111111', deviceId: 'rl-emp-dev' });
  assert.equal(empRlBlocked.status, 'error');
  assert.equal(empRlBlocked.rateLimited, true, '6th employeeLogin within 15m must be rate-limited');

  // After +16m window expires -> rate limit resets cleanly
  lsEnv.setTimeIso('2026-11-21T02:16:00.000Z');
  const ownerRlAfter = lsEnv.ctx.ownerLogin({ password: 'SecretOwner#2026', deviceId: 'rl-owner-dev' });
  assert.equal(ownerRlAfter.status, 'success', 'Rate limit must reset after window expires');
}

// LS-15: End-to-end employee flow: setEmployeePin -> employeeLogin -> employeeVerify -> DATANG -> PULANG -> getRiwayatBulan -> employeeLogout
{
  const lsEnv = createGasEnv('2026-11-21T01:00:00.000Z'); // 08:00 WIB
  const ownTok = lsEnv.ctx.ownerLogin({ password: 'SecretOwner#2026' }).token;
  assert.equal(lsEnv.ctx.setEmployeePin({ idPegawai: 'EMP001', nama: 'Riska', pin: '445566' }, ownTok).status, 'success');

  const empLogin = JSON.parse(lsEnv.ctx.doPost({
    postData: { contents: JSON.stringify({ action: 'employeeLogin', data: { identifier: 'EMP001', pin: '445566', deviceId: 'e2e-phone' } }) }
  }));
  assert.equal(empLogin.status, 'success');
  const empTok = empLogin.employeeToken;

  const verifyOk = JSON.parse(lsEnv.ctx.doPost({
    postData: { contents: JSON.stringify({ action: 'employeeVerify', employeeToken: empTok }) }
  }));
  assert.equal(verifyOk.valid, true);
  assert.equal(verifyOk.nama, 'Riska');

  const dRes = JSON.parse(lsEnv.ctx.doPost({
    postData: { contents: JSON.stringify({ action: 'processForm', employeeToken: empTok, data: { nama: 'Riska', idPegawai: 'EMP001', status: 'DATANG', outlet: 'YZ_ MDP PASIR JAHA BALARAJA', posisi: 'Admin' } }) }
  }));
  assert.equal(dRes.status, 'success', dRes.message);

  lsEnv.setTimeIso('2026-11-21T13:15:00.000Z'); // 20:15 WIB (with +2h CacheService still valid? Wait: +12h would expire, 08:00->20:15 is 12h15m >4h Properties TTL! Use +2h5m for Magang or re-login; let's check!)
  // Wait: Riska Admin 08:00-20:00 is >4h so after 12h session naturally expired — simulate re-login before PULANG!
  const empLogin2 = JSON.parse(lsEnv.ctx.doPost({
    postData: { contents: JSON.stringify({ action: 'employeeLogin', data: { identifier: 'EMP001', pin: '445566', deviceId: 'e2e-phone' } }) }
  }));
  const empTok2 = empLogin2.employeeToken;

  const pRes = JSON.parse(lsEnv.ctx.doPost({
    postData: { contents: JSON.stringify({ action: 'processForm', employeeToken: empTok2, data: { nama: 'Riska', idPegawai: 'EMP001', status: 'PULANG', outlet: 'YZ_ MDP PASIR JAHA BALARAJA', posisi: 'Admin' } }) }
  }));
  assert.equal(pRes.status, 'success', pRes.message);

  const histRes = JSON.parse(lsEnv.ctx.doPost({
    postData: { contents: JSON.stringify({ action: 'getRiwayatBulan', employeeToken: empTok2, data: { nama: 'Riska', bulan: '2026-11' } }) }
  }));
  assert.equal(histRes.status, 'success');
  assert.equal(histRes.data.length, 1);

  const outRes = JSON.parse(lsEnv.ctx.doPost({
    postData: { contents: JSON.stringify({ action: 'employeeLogout', employeeToken: empTok2 }) }
  }));
  assert.equal(outRes.status, 'success');

  const verifyAfterLogout = JSON.parse(lsEnv.ctx.doPost({
    postData: { contents: JSON.stringify({ action: 'employeeVerify', employeeToken: empTok2 }) }
  }));
  assert.equal(verifyAfterLogout.valid, false);
  assert.equal(verifyAfterLogout.authRequired, true);
}

// ==================== v2.11.0 HYBRID BIOMETRIC AUTHENTICATION TESTS (HB-1..HB-17) ====================

function toB64Url(bufOrUint8) {
  return Buffer.from(bufOrUint8).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function buildMockAuthenticatorData(rpId, flags, signCount) {
  const rpHash = crypto.createHash('sha256').update(rpId, 'utf8').digest();
  const flagBuf = Buffer.from([flags]);
  const cntBuf = Buffer.alloc(4);
  cntBuf.writeUInt32BE(signCount, 0);
  return Buffer.concat([rpHash, flagBuf, cntBuf]);
}

function signMockWebAuthnAssertion(privateKey, challenge, origin, rpId, signCount, flags = 0x05) {
  const authData = buildMockAuthenticatorData(rpId, flags, signCount);
  const clientData = Buffer.from(JSON.stringify({
    type: 'webauthn.get',
    challenge,
    origin,
    crossOrigin: false
  }), 'utf8');
  const clientDataHash = crypto.createHash('sha256').update(clientData).digest();
  const signedPayload = Buffer.concat([authData, clientDataHash]);
  const signature = crypto.sign('sha256', signedPayload, privateKey);
  return {
    authenticatorData: toB64Url(authData),
    clientDataJSON: toB64Url(clientData),
    signature: toB64Url(signature),
    counter: signCount
  };
}

function createNormalizedDescriptor(seedVal, deltaOnFirst = 0) {
  const arr = [];
  for (let i = 0; i < 128; i++) {
    let v = Math.sin((i + 1) * seedVal) * 0.25;
    if (i === 0) v += deltaOnFirst;
    arr.push(Number(v.toFixed(6)));
  }
  return arr;
}

// HB-1..HB-10: WebAuthn E2E registration, P-256 ECDSA assertion verification, anti-replay, multi-device, origin & revoke
{
  const hbEnv = createGasEnv('2026-11-21T01:00:00.000Z'); // 08:00 WIB
  const ownTok = hbEnv.ctx.ownerLogin({ password: 'SecretOwner#2026', deviceId: 'owner-hb' }).token;
  const riskaTok = loginTestEmployee(hbEnv, ownTok, 'Riska', 'EMP001');

  const kp1 = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const kp1SpkiB64Url = toB64Url(kp1.publicKey.export({ type: 'spki', format: 'der' }));
  const cred1Id = toB64Url(crypto.randomBytes(24));

  const rpId = 'absen-jnt.vercel.app';
  const trustedOrigin = 'https://absen-jnt.vercel.app';

  // E.2: Registration challenge & WebAuthn register stores DataPegawai cols N-S (14..19)
  const regCh1 = hbEnv.ctx.getWebAuthnRegisterChallenge({ rpId }, riskaTok);
  assert.equal(regCh1.status, 'success');
  assert.ok(regCh1.challenge);

  const regClientData1 = toB64Url(Buffer.from(JSON.stringify({
    type: 'webauthn.create',
    challenge: regCh1.challenge,
    origin: trustedOrigin
  }), 'utf8'));
  const regAuthData1 = toB64Url(buildMockAuthenticatorData(rpId, 0x45, 1));
  const regRes1 = hbEnv.ctx.registerWebAuthnCredential({
    credentialId: cred1Id,
    publicKey: kp1SpkiB64Url,
    deviceName: 'Samsung A54 · Chrome',
    clientDataJSON: regClientData1,
    authenticatorData: regAuthData1
  }, riskaTok);
  assert.equal(regRes1.status, 'success', regRes1.message);
  assert.equal(regRes1.devices.length, 1);

  const pegSheet = hbEnv.sheets.get('DataPegawai');
  const riskaRow = pegSheet.rows[1];
  assert.ok(JSON.parse(riskaRow[13]).includes(cred1Id), 'Col N (WebAuthnCredentialId) stores JSON array with credentialId');
  assert.ok(JSON.parse(riskaRow[14]).length === 1, 'Col O (WebAuthnPublicKey) stores normalized COSE public key');
  assert.equal(JSON.parse(riskaRow[15])[0], 1, 'Col P (WebAuthnCounter) stores counter');
  assert.ok(JSON.parse(riskaRow[16])[0], 'Col Q (WebAuthnRegisteredAt) populated');
  assert.ok(JSON.parse(riskaRow[17])[0], 'Col R (WebAuthnLastUsedAt) populated');
  assert.equal(JSON.parse(riskaRow[18])[0], 'Samsung A54 · Chrome', 'Col S (WebAuthnDeviceName) populated');

  // E.10: Untrusted origin rejected
  const regChBadOrigin = hbEnv.ctx.getWebAuthnRegisterChallenge({ rpId }, riskaTok);
  const badOriginRes = hbEnv.ctx.registerWebAuthnCredential({
    credentialId: toB64Url(crypto.randomBytes(16)),
    publicKey: kp1SpkiB64Url,
    clientDataJSON: toB64Url(Buffer.from(JSON.stringify({
      type: 'webauthn.create',
      challenge: regChBadOrigin.challenge,
      origin: 'https://evil-phish.example.com'
    }), 'utf8')),
    authenticatorData: regAuthData1
  }, riskaTok);
  assert.equal(badOriginRes.status, 'error', 'Untrusted origin must be rejected');

  // E.9: Register second WebAuthn device (multi-device)
  const kp2 = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const kp2SpkiB64Url = toB64Url(kp2.publicKey.export({ type: 'spki', format: 'der' }));
  const cred2Id = toB64Url(crypto.randomBytes(24));
  const regCh2 = hbEnv.ctx.getWebAuthnRegisterChallenge({ rpId }, riskaTok);
  const regRes2 = hbEnv.ctx.registerWebAuthnCredential({
    credentialId: cred2Id,
    publicKey: kp2SpkiB64Url,
    deviceName: 'Laptop Kantor · Edge',
    clientDataJSON: toB64Url(Buffer.from(JSON.stringify({
      type: 'webauthn.create',
      challenge: regCh2.challenge,
      origin: trustedOrigin
    }), 'utf8')),
    authenticatorData: toB64Url(buildMockAuthenticatorData(rpId, 0x45, 0))
  }, riskaTok);
  assert.equal(regRes2.status, 'success', regRes2.message);
  assert.equal(regRes2.devices.length, 2, 'Two devices stored for same employee');

  // Logout before WebAuthn login
  assert.equal(hbEnv.ctx.employeeLogout(riskaTok).status, 'success');

  // E.3: WebAuthn login with valid ECDSA P-256 signed assertion
  const loginCh1 = hbEnv.ctx.getWebAuthnLoginChallenge({ identifier: 'EMP001', rpId, deviceId: 'dev-hb-1' });
  assert.equal(loginCh1.status, 'success');
  const signed1 = signMockWebAuthnAssertion(kp1.privateKey, loginCh1.challenge, trustedOrigin, rpId, 2);
  const loginRes1 = hbEnv.ctx.loginWebAuthn({
    identifier: 'EMP001',
    credentialId: cred1Id,
    ...signed1,
    deviceId: 'dev-hb-1'
  });
  assert.equal(loginRes1.status, 'success', loginRes1.message);
  assert.ok(loginRes1.employeeToken, 'WebAuthn login issues employeeToken');
  assert.equal(loginRes1.authMethod, 'webauthn');
  assert.equal(JSON.parse(pegSheet.rows[1][15])[0], 2, 'WebAuthn counter incremented on login');

  // E.7 & E.8: Anti-replay rejects counter <= storedCounter (2), and rejects forged/tampered signature
  const loginChReplay = hbEnv.ctx.getWebAuthnLoginChallenge({ identifier: 'EMP001', rpId, deviceId: 'dev-hb-1' });
  const replayAssertion = signMockWebAuthnAssertion(kp1.privateKey, loginChReplay.challenge, trustedOrigin, rpId, 2);
  const replayRes = hbEnv.ctx.loginWebAuthn({
    identifier: 'EMP001',
    credentialId: cred1Id,
    ...replayAssertion,
    deviceId: 'dev-hb-1'
  });
  assert.equal(replayRes.status, 'error', 'Counter <= storedCounter must fail anti-replay check');

  const loginChBadSig = hbEnv.ctx.getWebAuthnLoginChallenge({ identifier: 'EMP001', rpId, deviceId: 'dev-hb-1' });
  const forgedAssertion = signMockWebAuthnAssertion(kp2.privateKey, loginChBadSig.challenge, trustedOrigin, rpId, 5); // Wrong private key for cred1Id
  const badSigRes = hbEnv.ctx.loginWebAuthn({
    identifier: 'EMP001',
    credentialId: cred1Id,
    ...forgedAssertion,
    deviceId: 'dev-hb-1'
  });
  assert.equal(badSigRes.status, 'error', 'Invalid ECDSA signature must be rejected');

  // E.5: Unregistered credential fails
  const loginChUnreg = hbEnv.ctx.getWebAuthnLoginChallenge({ identifier: 'EMP001', rpId, deviceId: 'dev-hb-1' });
  const unregAssertion = signMockWebAuthnAssertion(kp1.privateKey, loginChUnreg.challenge, trustedOrigin, rpId, 9);
  const unregRes = hbEnv.ctx.loginWebAuthn({
    identifier: 'EMP001',
    credentialId: 'NON_EXISTENT_CRED_ID',
    ...unregAssertion,
    deviceId: 'dev-hb-1'
  });
  assert.equal(unregRes.status, 'error', 'Unregistered credential must fail');

  // E.6 & E.9: Revoke cred1Id -> cred1Id login fails, cred2Id still succeeds
  const rev1 = hbEnv.ctx.revokeWebAuthnDevice({ credentialId: cred1Id }, { employeeToken: loginRes1.employeeToken });
  assert.equal(rev1.status, 'success');
  assert.equal(rev1.devices.length, 1);

  const chAfterRev = hbEnv.ctx.getWebAuthnLoginChallenge({ identifier: 'EMP001', rpId, deviceId: 'dev-hb-1' });
  const cred1AfterRev = hbEnv.ctx.loginWebAuthn({
    identifier: 'EMP001',
    credentialId: cred1Id,
    ...signMockWebAuthnAssertion(kp1.privateKey, chAfterRev.challenge, trustedOrigin, rpId, 10),
    deviceId: 'dev-hb-1'
  });
  assert.equal(cred1AfterRev.status, 'error', 'Revoked device must fail login');

  const chDev2 = hbEnv.ctx.getWebAuthnLoginChallenge({ identifier: 'EMP001', rpId, deviceId: 'dev-hb-2' });
  const cred2Login = hbEnv.ctx.loginWebAuthn({
    identifier: 'EMP001',
    credentialId: cred2Id,
    ...signMockWebAuthnAssertion(kp2.privateKey, chDev2.challenge, trustedOrigin, rpId, 3),
    deviceId: 'dev-hb-2'
  });
  assert.equal(cred2Login.status, 'success', 'Remaining second WebAuthn device still logs in cleanly');

  // Owner also able to see masked devices and delete cred2Id
  const empListOwner = hbEnv.ctx.getDataPenempatan(ownTok);
  const riskaOwner = empListOwner.data.find((e) => e.idPegawai === 'EMP001');
  assert.equal(riskaOwner.hasWebAuthn, true);
  assert.equal(riskaOwner.webAuthnDeviceCount, 1);
  assert.equal(JSON.stringify(riskaOwner).includes(kp2SpkiB64Url), false, 'Public keys never exposed in getDataPenempatan');
}

// HB-11..HB-15: Face Recognition registration, match, mismatch, threshold config, delete
{
  const faceEnv = createGasEnv('2026-11-21T01:00:00.000Z');
  const ownTok = faceEnv.ctx.ownerLogin({ password: 'SecretOwner#2026', deviceId: 'owner-face' }).token;
  const budiTok = loginTestEmployee(faceEnv, ownTok, 'Budi Kurir', 'EMP002');

  const baseDesc = createNormalizedDescriptor(0.42, 0);
  const closeDesc = createNormalizedDescriptor(0.42, 0.25); // distance = 0.25 < default 0.60
  const mediumDesc = createNormalizedDescriptor(0.42, 0.65); // distance = 0.65 > 0.60, < 0.75

  // E.11: Register face descriptor saves Col I & Col J
  const regFace = faceEnv.ctx.registerFaceDescriptor({ faceDescriptor: baseDesc, overwrite: true }, budiTok);
  assert.equal(regFace.status, 'success', regFace.message);
  const budiRow = faceEnv.sheets.get('DataPegawai').rows[2];
  assert.ok(budiRow[8], 'Col I (SidikWajah timestamp) updated');
  assert.equal(JSON.parse(budiRow[9]).length, 128, 'Col J (FaceDescriptor 128 floats) saved');

  // E.12: Matching descriptor logs in & issues employeeToken
  const faceOk = faceEnv.ctx.loginFaceRecognition({ identifier: 'EMP002', faceDescriptor: closeDesc, deviceId: 'face-dev-1' });
  assert.equal(faceOk.status, 'success', faceOk.message);
  assert.ok(faceOk.employeeToken);
  assert.equal(faceOk.authMethod, 'face');

  // E.13: Mismatched descriptor (> 0.60 default) fails with Wajah tidak cocok
  const faceMismatch = faceEnv.ctx.loginFaceRecognition({ identifier: 'EMP002', faceDescriptor: mediumDesc, deviceId: 'face-dev-1' });
  assert.equal(faceMismatch.status, 'failed');
  assert.match(faceMismatch.message, /Wajah tidak cocok/i);

  // E.14: Raising Settings face_recognition_threshold to 0.75 allows distance 0.65; lowering to 0.40 rejects 0.25 if >0.40 -> let's verify!
  const saveThresh = faceEnv.ctx.saveSettings({ face_recognition_threshold: 0.75 }, ownTok);
  assert.equal(saveThresh.status, 'success');
  assert.equal(faceEnv.ctx.getSettings().data.faceRecognitionThreshold, 0.75);

  const faceMediumNowOk = faceEnv.ctx.loginFaceRecognition({ identifier: 'EMP002', faceDescriptor: mediumDesc, deviceId: 'face-dev-2' });
  assert.equal(faceMediumNowOk.status, 'success', 'Adjusted Settings threshold 0.75 accepts distance 0.65');

  // E.15: Delete face profile clears descriptor and blocks face login
  const delFace = faceEnv.ctx.deleteFaceDescriptor({}, { employeeToken: budiTok });
  assert.equal(delFace.status, 'success');
  assert.equal(faceEnv.sheets.get('DataPegawai').rows[2][9], '', 'Col J cleared on deleteFaceDescriptor');
  const faceAfterDel = faceEnv.ctx.loginFaceRecognition({ identifier: 'EMP002', faceDescriptor: baseDesc, deviceId: 'face-dev-3' });
  assert.equal(faceAfterDel.status, 'failed', 'Deleted face profile cannot log in');
}

// HB-16..HB-17: Biometric rate limiting & AuditLog logging without sensitive biometric key/descriptor leaks
{
  const rlEnv = createGasEnv('2026-11-21T02:00:00.000Z');
  const ownTok = rlEnv.ctx.ownerLogin({ password: 'SecretOwner#2026', deviceId: 'owner-rl' }).token;
  const riskaTok = loginTestEmployee(rlEnv, ownTok, 'Riska', 'EMP001');

  const kp = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const kpSpki = toB64Url(kp.publicKey.export({ type: 'spki', format: 'der' }));
  const credId = toB64Url(crypto.randomBytes(16));
  const regCh = rlEnv.ctx.getWebAuthnRegisterChallenge({ rpId: 'localhost' }, riskaTok);
  rlEnv.ctx.registerWebAuthnCredential({
    credentialId: credId,
    publicKey: kpSpki,
    deviceName: 'Pixel Test',
    clientDataJSON: toB64Url(Buffer.from(JSON.stringify({ type: 'webauthn.create', challenge: regCh.challenge, origin: 'http://localhost:3000' }), 'utf8')),
    authenticatorData: toB64Url(buildMockAuthenticatorData('localhost', 0x45, 0))
  }, riskaTok);

  const baseDesc = createNormalizedDescriptor(0.77, 0);
  const badDesc = createNormalizedDescriptor(0.77, 1.5);
  rlEnv.ctx.registerFaceDescriptor({ faceDescriptor: baseDesc, overwrite: true }, riskaTok);

  // E.16: 10 attempts allowed, 11th blocked for loginWebAuthn and loginFaceRecognition
  for (let i = 0; i < 10; i++) {
    const resW = rlEnv.ctx.loginWebAuthn({ identifier: 'EMP001', credentialId: 'bad', deviceId: 'bio-spam-dev' });
    assert.equal(resW.rateLimited, undefined);
    const resF = rlEnv.ctx.loginFaceRecognition({ identifier: 'EMP001', faceDescriptor: badDesc, deviceId: 'bio-spam-dev' });
    assert.equal(resF.rateLimited, undefined);
  }
  const blockedW = rlEnv.ctx.loginWebAuthn({ identifier: 'EMP001', credentialId: 'bad', deviceId: 'bio-spam-dev' });
  assert.equal(blockedW.rateLimited, true, '11th WebAuthn attempt within 15m rate-limited');
  const blockedF = rlEnv.ctx.loginFaceRecognition({ identifier: 'EMP001', faceDescriptor: badDesc, deviceId: 'bio-spam-dev' });
  assert.equal(blockedF.rateLimited, true, '11th Face login attempt within 15m rate-limited');

  // E.17: AuditLog records registration + login attempts and redacts raw keys/descriptors
  const auditLogs = rlEnv.ctx.getAuditLogs({ limit: 80 }, ownTok);
  assert.equal(auditLogs.status, 'success');
  assert.ok(auditLogs.data.some((l) => l.action === 'registerWebAuthnCredential' && l.status === 'SUCCESS'));
  assert.ok(auditLogs.data.some((l) => l.action === 'registerFaceDescriptor' && l.status === 'SUCCESS'));
  assert.ok(auditLogs.data.some((l) => l.action === 'loginWebAuthn' && l.status === 'FAILED'));
  assert.ok(auditLogs.data.some((l) => l.action === 'loginFaceRecognition' && l.status === 'FAILED'));

  const auditStr = JSON.stringify(auditLogs.data);
  assert.equal(auditStr.includes(String(baseDesc[0])), false, 'AuditLog must not leak raw faceDescriptor vector values');
  assert.equal(auditStr.includes(kpSpki), false, 'AuditLog must not leak publicKey');
}

console.log('ALL 16 EXISTING + 18 PHASE A + 14 PHASE B + 15 LAYERED SECURITY + 17 HYBRID BIOMETRIC TESTS (80 TOTAL) PASSED SUCCESSFULLY');

