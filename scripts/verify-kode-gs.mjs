import assert from 'node:assert/strict';
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
function createGasEnv(initialTimeIso = '2026-11-16T01:30:00.000Z') {
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
    ['owner_password', 'jntowner']
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
  sheets.set('DataPegawai', new MockSheet('DataPegawai', [
    ['Nama', 'ID', 'email', 'password', 'no_Telepon', 'TglAktif', 'TglNonAktif', 'Status', 'SidikWajah', 'FaceDescriptor'],
    ['Riska', 'EMP001', 'riska@jnt.test', 'secret123', '0811', '01/01/2026', '', 'AKTIF', 'fp-riska', '[0.11,0.22]'],
    ['Budi Kurir', 'EMP002', 'budi@jnt.test', 'secret456', '0812', '01/01/2026', '', 'AKTIF', 'fp-budi', '[0.33,0.44]'],
    ['Siti Magang', 'EMP003', 'siti@jnt.test', 'secret789', '0813', '01/01/2026', '', 'AKTIF', 'fp-siti', '[0.55,0.66]'],
    ['Dedi Nonaktif', 'EMP004', 'dedi@jnt.test', 'x', '0814', '01/01/2026', '01/10/2026', 'NONAKTIF', '', '']
  ]));
  sheets.set('Data_Absensi', new MockSheet('Data_Absensi', [
    ['Tanggal', 'Nama', 'Posisi', 'Outlet', 'Jam Datang', 'Jam Pulang', 'Total Jam', 'Status Masuk', 'Status Pulang', 'Lokasi Datang', 'Lokasi Pulang', 'Foto Datang', 'Foto Pulang', 'Ket Datang', 'Ket Pulang']
  ]));
  sheets.set('AbsenIzin', new MockSheet('AbsenIzin', [
    ['Tanggal', 'Nama', 'Posisi', 'Jenis', 'Alasan', 'Jam', 'Bukti']
  ]));

  const cacheStore = new Map();
  const propStore = new Map();
  let uuidCounter = 0;

  const ssMock = {
    getSheetByName: (n) => sheets.get(n) || null,
    insertSheet: (n) => { const s = new MockSheet(n, []); sheets.set(n, s); return s; }
  };

  const sandbox = {
    console,
    Date: MockDate,
    Math, JSON, Number, String, Array, Object, Boolean, parseInt, parseFloat, isNaN, isFinite, RegExp, Error,
    SpreadsheetApp: { openById: () => ssMock },
    LockService: { getScriptLock: () => ({ waitLock: () => {}, releaseLock: () => {} }) },
    CacheService: { getScriptCache: () => ({ put: (k, v) => cacheStore.set(k, v), get: (k) => cacheStore.get(k) || null, remove: (k) => cacheStore.delete(k) }) },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => propStore.get(k) || null,
        setProperty: (k, v) => propStore.set(k, v),
        deleteProperty: (k) => propStore.delete(k),
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
      getUuid: () => `mockuuid-${++uuidCounter}-abcdef`,
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
    setTimeIso: (iso) => { mockNowMs = Date.parse(iso); }
  };
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

const loginRes = ctx.ownerLogin({ password: 'jntowner' });
assert.equal(loginRes.status, 'success');
let token = loginRes.token;
assert.ok(token, 'Owner login must issue session token');

const penempatanInit = ctx.getDataPenempatan();
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

const riskaHistory = ctx.getRiwayatPenempatan('EMP001', 'Riska').data;
assert.equal(riskaHistory.length, 2, 'Historical placement row must be preserved');
assert.equal(riskaHistory[1].tanggalAkhir, '2026-11-15', 'Old placement closed on day before new start');

// Test 4: Riska DATANG at 09:30 WIB (within 08:30 + 60m inclusive tolerance = 09:30 -> TEPAT WAKTU!), then 09:31 would be TELAT
env.setTimeIso('2026-11-16T02:30:00.000Z'); // 09:30 WIB
const datangRiska = ctx.processForm({
  nama: 'Riska', posisi: 'Admin', status: 'DATANG', outlet: 'YZ_ MDP PASIR JAHA BALARAJA',
  lat: -6.201, lng: 106.45, image: 'data:image/jpeg;base64,/9j/4AAQ'
});
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

env.setTimeIso('2026-11-16T11:55:00.000Z'); // 18:55 WIB (before 19:00)
const earlyPulang = ctx.processForm({
  nama: 'Riska', posisi: 'Admin', status: 'PULANG', outlet: 'YZ_ MDP PASIR JAHA BALARAJA',
  lat: -6.201, lng: 106.45, image: 'data:image/jpeg;base64,/9j/4AAQ'
});
assert.equal(earlyPulang.status, 'error', 'PULANG at 18:55 must be rejected against 19:00 snapshot');

env.setTimeIso('2026-11-16T12:00:00.000Z'); // 19:00 WIB
const okPulang = ctx.processForm({
  nama: 'Riska', posisi: 'Admin', status: 'PULANG', outlet: 'YZ_ MDP PASIR JAHA BALARAJA',
  lat: -6.201, lng: 106.45, image: 'data:image/jpeg;base64,/9j/4AAQ'
});
assert.equal(okPulang.status, 'success', okPulang.message);
assert.equal(sheets.get('Data_Absensi').rows.length, 2, 'PULANG updates Row 2 in place without creating a new row');

// Test 6: Token expiry (>8h) enforcement + Sunday Backup + Pickup as Admin Backup without mutating permanent placement/DataPosisi
const expiredAttempt = ctx.saveJadwalHarian({
  idPegawai: 'EMP001', nama: 'Riska', tanggal: '2026-11-22', statusJadwal: 'LIBUR', jenisPenugasan: 'NORMAL', catatan: 'Libur Minggu'
}, token);
assert.equal(expiredAttempt.status, 'error');
assert.equal(expiredAttempt.authRequired, true, 'Expired ownerToken (>8h) must be rejected');

// Re-login after expiry
token = ctx.ownerLogin({ password: 'jntowner' }).token;
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
const budiDetailSun = ctx.getPegawaiDetail('Budi Kurir', 'EMP002', '2026-11-22');
assert.equal(budiDetailSun.effectiveAssignment.posisiPermanen, 'Pickup');
assert.equal(budiDetailSun.effectiveAssignment.posisiPenugasan, 'Admin');
assert.equal(budiDetailSun.effectiveAssignment.jenisPenugasan, 'BACKUP');

// Test 7: Admin absent alert & Conflict IZIN vs BACKUP warning
const conflictIzin = ctx.saveKetidakhadiran({
  idPegawai: 'EMP002', nama: 'Budi Kurir', tanggal: '2026-11-22', status: 'SAKIT', alasan: 'Demam tinggi'
}, token);
assert.equal(conflictIzin.status, 'success', conflictIzin.message);
assert.ok(conflictIzin.scheduleConflictWarning.includes('KONFLIK'), 'Must warn when BACKUP employee is marked SAKIT');

const sunScheduleView = ctx.getJadwalHarian('2026-11-22');
assert.ok(sunScheduleView.alerts.some((a) => a.type === 'SCHEDULE_IZIN_CONFLICT'), 'Must surface SCHEDULE_IZIN_CONFLICT alert');
assert.ok(sunScheduleView.alerts.some((a) => a.type === 'NO_ADMIN' || a.type === 'ADMIN_ABSENT_NO_BACKUP'), 'Must surface missing Admin alert when Admin & backup unavailable');

// Test 8: Employee form IZIN/SAKIT syncs DataKetidakhadiran + AbsenIzin + Data_Absensi without duplicate
env.setTimeIso('2026-11-17T01:00:00.000Z'); // 08:00 WIB Selasa 17 Nov
token = ctx.ownerLogin({ password: 'jntowner' }).token;
const empIzin1 = ctx.processForm({
  nama: 'Siti Magang', posisi: 'Magang', status: 'IZIN', jenisIzin: 'Sakit', alasan: 'Flu berat', image: 'data:image/jpeg;base64,/9j/4AAQ'
});
assert.equal(empIzin1.status, 'success', empIzin1.message);
const empIzin2 = ctx.processForm({
  nama: 'Siti Magang', posisi: 'Magang', status: 'IZIN', jenisIzin: 'Sakit', alasan: 'Flu berat update', image: 'data:image/jpeg;base64,/9j/4AAQ'
});
assert.equal(empIzin2.status, 'success', empIzin2.message);

const ketRowsNov17 = ctx.getKetidakhadiran('2026-11-17').data;
assert.equal(ketRowsNov17.length, 1, 'DataKetidakhadiran deduplicates same-day employee IZIN/SAKIT');
assert.equal(ketRowsNov17[0].status, 'SAKIT');

// Test 9: closeDailyAttendance marks remaining BELUM ABSEN as ALPA without touching SAKIT/LIBUR or creating fake DATANG rows
const absRowsBeforeClose = sheets.get('Data_Absensi').rows.length;
const closeRes = ctx.closeDailyAttendance({ tanggal: '2026-11-17', alasan: 'Tutup shift harian' }, token);
assert.equal(closeRes.status, 'success', closeRes.message);
assert.deepEqual([...closeRes.markedNames].sort(), ['Budi Kurir', 'Riska']);
assert.equal(sheets.get('Data_Absensi').rows.length, absRowsBeforeClose, 'closeDailyAttendance must NOT create fake DATANG rows in Data_Absensi');

const dailyNov17 = ctx.getKehadiranHarian('2026-11-17');
assert.equal(dailyNov17.summary.sakit, 1);
assert.equal(dailyNov17.summary.alpa, 2);

// Test 10: cancelKetidakhadiran removes only DataKetidakhadiran row, preserving Data_Absensi
const cancelAbsenceRes = ctx.cancelKetidakhadiran({ tanggal: '2026-11-17', idPegawai: 'EMP003', nama: 'Siti Magang' }, token);
assert.equal(cancelAbsenceRes.status, 'success', cancelAbsenceRes.message);
assert.equal(ctx.getKetidakhadiran('2026-11-17', '', 'Siti Magang').data.length, 0);
assert.equal(sheets.get('Data_Absensi').rows.length, absRowsBeforeClose, 'Data_Absensi history preserved on cancelKetidakhadiran');

console.log('ALL 10 VERIFICATION SCENARIOS PASSED SUCCESSFULLY');
