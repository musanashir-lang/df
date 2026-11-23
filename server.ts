import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { GoogleGenAI, Type } from '@google/genai';

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '25mb' }));

function getGenAIClient() {
  return new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function extractStatusCodeGemini(err: unknown): number {
  if (!err || typeof err !== 'object') return 500;
  const anyErr = err as { status?: number; code?: number; message?: string };
  if (typeof anyErr.status === 'number') return anyErr.status;
  if (typeof anyErr.code === 'number') return anyErr.code;
  const msg = String(anyErr.message || '');
  const match = msg.match(/"code"\s*:\s*(\d{3})/) || msg.match(/\b(400|401|403|404|413|429|500|502|503|504)\b/);
  return match ? Number(match[1]) : 500;
}

function isTransientGeminiError(err: unknown): boolean {
  const status = extractStatusCodeGemini(err);
  const msg = err instanceof Error ? err.message.toLowerCase() : String(err || '').toLowerCase();
  return (
    status === 503 ||
    status === 429 ||
    status === 502 ||
    status === 504 ||
    msg.includes('unavailable') ||
    msg.includes('high demand') ||
    msg.includes('overloaded') ||
    msg.includes('resource_exhausted') ||
    msg.includes('temporarily') ||
    msg.includes('timeout') ||
    msg.includes('econnreset')
  );
}

function formatErrorGeminiRamah(err: unknown, fallbackMessage: string): { statusCode: number; pesan: string } {
  const status = extractStatusCodeGemini(err);
  const rawMsg = err instanceof Error ? err.message : String(err || '');
  const low = rawMsg.toLowerCase();

  if (status === 503 || low.includes('high demand') || low.includes('unavailable') || low.includes('overloaded')) {
    return {
      statusCode: 503,
      pesan:
        'Server AI sedang mengalami lonjakan permintaan sementara (503). Sistem sudah mencoba ulang otomatis namun layanan masih padat. Silakan tunggu beberapa detik lalu unggah atau proses ulang PDF Anda.',
    };
  }
  if (status === 429 || low.includes('resource_exhausted') || low.includes('quota')) {
    return {
      statusCode: 429,
      pesan:
        'Batas kuota permintaan AI sementara tercapai (429). Silakan tunggu sebentar lalu coba lagi, atau periksa kuota API key di Settings > Secrets.',
    };
  }
  if (
    status === 403 ||
    low.includes('permission_denied') ||
    low.includes('api_key_invalid') ||
    low.includes('api key not valid')
  ) {
    return {
      statusCode: 403,
      pesan:
        'Kunci API AI tidak valid atau tidak memiliki izin akses. Silakan periksa pengaturan API key di panel Settings > Secrets.',
    };
  }
  if (status === 404 || low.includes('not_found')) {
    return {
      statusCode: 404,
      pesan: 'Model AI yang diminta tidak tersedia (404). Silakan coba beberapa saat lagi.',
    };
  }
  if (status === 413 || low.includes('too large') || low.includes('payload')) {
    return {
      statusCode: 413,
      pesan: 'Ukuran file PDF terlalu besar untuk diproses sekaligus. Coba kompres PDF atau pecah per beberapa halaman.',
    };
  }

  return {
    statusCode: status >= 400 && status < 600 ? status : 500,
    pesan: fallbackMessage,
  };
}

const sleepMs = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function generateContentDenganRetryDanFallback(
  ai: GoogleGenAI,
  requestParams: Omit<Parameters<GoogleGenAI['models']['generateContent']>[0], 'model'>
) {
  const modelUrutan = ['gemini-4-hydrogen', 'gemini-3.1-flash-lite'] as const;
  let lastError: unknown;

  for (const modelName of modelUrutan) {
    const maksPercobaan = modelName === 'gemini-4-hydrogen' ? 3 : 2;
    for (let percobaan = 1; percobaan <= maksPercobaan; percobaan++) {
      try {
        return await ai.models.generateContent({
          model: modelName,
          ...requestParams,
        });
      } catch (err) {
        lastError = err;
        if (!isTransientGeminiError(err)) {
          throw err;
        }
        if (percobaan < maksPercobaan) {
          const delay = 1000 * Math.pow(2, percobaan - 1) + Math.floor(Math.random() * 400);
          await sleepMs(delay);
        }
      }
    }
  }

  throw lastError;
}

// ============================================================================
// SERVER-SIDE PERSISTENT DATABASE & SERVER-AUTHORITATIVE CBT SESSION ENGINE
// ============================================================================
const DATA_DIR = path.join(process.cwd(), 'data');
const DB_FILE_PATH = path.join(DATA_DIR, 'pesantren-db.json');

interface ServerCbtSession {
  sessionId: string;
  nis: string;
  namaSantri: string;
  unit: string;
  kelas: string;
  mapel: string;
  startTimeMs: number;
  endTimeMs: number;
  durasiMenit: number;
  pelanggaran: number;
  jawaban: Record<string, 'A' | 'B' | 'C' | 'D'>;
  status: 'AKTIF' | 'SELESAI';
}

interface PersistentStore {
  version: number;
  updatedAt: string;
  payload: Record<string, unknown> | null;
  cbtSessions: Record<string, ServerCbtSession>;
}

function loadPersistentStore(): PersistentStore {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(DB_FILE_PATH)) {
      const raw = fs.readFileSync(DB_FILE_PATH, 'utf-8');
      const parsed = JSON.parse(raw);
      return {
        version: Number(parsed.version) || 1,
        updatedAt: String(parsed.updatedAt || new Date().toISOString()),
        payload: parsed.payload || null,
        cbtSessions: parsed.cbtSessions || {},
      };
    }
  } catch (e) {
    console.error('Gagal membaca database lokal server:', e);
  }
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    payload: null,
    cbtSessions: {},
  };
}

let saveWriteSeq = 0;
let pendingSaveTimer: ReturnType<typeof setTimeout> | null = null;
let saveQueuePromise: Promise<void> = Promise.resolve();
let hasDirtyPendingSave = false;

function writeStoreAtomicSync(store: PersistentStore) {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const tmpPath = `${DB_FILE_PATH}.${process.pid}.${++saveWriteSeq}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(store), 'utf-8');
    fs.renameSync(tmpPath, DB_FILE_PATH);
    hasDirtyPendingSave = false;
  } catch (e) {
    console.error('Gagal menyimpan database lokal server (sync):', e);
  }
}

function enqueueAsyncDiskSave(store: PersistentStore) {
  const snapshotStr = JSON.stringify(store);
  hasDirtyPendingSave = false;
  saveQueuePromise = saveQueuePromise
    .then(async () => {
      await fs.promises.mkdir(DATA_DIR, { recursive: true });
      const tmpPath = `${DB_FILE_PATH}.${process.pid}.${++saveWriteSeq}.tmp`;
      await fs.promises.writeFile(tmpPath, snapshotStr, 'utf-8');
      await fs.promises.rename(tmpPath, DB_FILE_PATH);
    })
    .catch((e) => {
      console.error('Gagal menyimpan database lokal server (async):', e);
    });
}

// Penulisan coalesced (non-blocking) untuk trafik tinggi seperti 65+ santri klik jawaban CBT bersamaan
function scheduleSavePersistentStore(store: PersistentStore, delayMs = 1200) {
  hasDirtyPendingSave = true;
  if (pendingSaveTimer) return;
  pendingSaveTimer = setTimeout(() => {
    pendingSaveTimer = null;
    if (hasDirtyPendingSave) {
      enqueueAsyncDiskSave(store);
    }
  }, delayMs);
}

// Penulisan segera (non-blocking queued) untuk mutasi kritis (submit CBT, simpan/hapus soal, state)
function savePersistentStore(store: PersistentStore) {
  if (pendingSaveTimer) {
    clearTimeout(pendingSaveTimer);
    pendingSaveTimer = null;
  }
  enqueueAsyncDiskSave(store);
}

function sanitizeJawabanMap(raw: unknown): Record<string, 'A' | 'B' | 'C' | 'D'> {
  const out: Record<string, 'A' | 'B' | 'C' | 'D'> = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  const entries = Object.entries(raw as Record<string, unknown>).slice(0, 300);
  for (const [k, v] of entries) {
    const keyClean = String(k || '').trim().slice(0, 80);
    const valUpper = String(v || '').trim().toUpperCase();
    if (keyClean && (valUpper === 'A' || valUpper === 'B' || valUpper === 'C' || valUpper === 'D')) {
      out[keyClean] = valUpper;
    }
  }
  return out;
}

function hitungNilaiAkhirServer(tugas: number, sikap: number, lisan: number, cbt: number): { nilaiAkhir: number; predikat: 'A' | 'B' | 'C' | 'D' } {
  const clamp = (n: number) => Math.min(100, Math.max(0, Number.isFinite(n) ? n : 0));
  const total = clamp(tugas) * 0.2 + clamp(sikap) * 0.2 + clamp(lisan) * 0.2 + clamp(cbt) * 0.4;
  const nilaiAkhir = Math.round(total * 100) / 100;
  const predikat: 'A' | 'B' | 'C' | 'D' =
    nilaiAkhir >= 85 ? 'A' : nilaiAkhir >= 75 ? 'B' : nilaiAkhir >= 60 ? 'C' : 'D';
  return { nilaiAkhir, predikat };
}

interface ServerDeletedRecords {
  santri: string[];
  mapel: string[];
  ustadz: string[];
  nilai: string[];
  tahfidz: string[];
  it: string[];
  soal: string[];
}

function normalizeServerDeleted(raw: unknown): ServerDeletedRecords {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const toArr = (v: unknown, upper = false) =>
    Array.isArray(v)
      ? Array.from(new Set(v.map((x) => (upper ? String(x).toUpperCase() : String(x).toLowerCase()))))
      : [];
  return {
    santri: toArr(obj.santri, true),
    mapel: toArr(obj.mapel, false),
    ustadz: toArr(obj.ustadz, false),
    nilai: toArr(obj.nilai, false),
    tahfidz: toArr(obj.tahfidz, true),
    it: toArr(obj.it, true),
    soal: toArr(obj.soal, true),
  };
}

function mergeDeletedRecords(aRaw: unknown, bRaw: unknown): ServerDeletedRecords {
  const a = normalizeServerDeleted(aRaw);
  const b = normalizeServerDeleted(bRaw);
  return {
    santri: Array.from(new Set([...a.santri, ...b.santri])),
    mapel: Array.from(new Set([...a.mapel, ...b.mapel])),
    ustadz: Array.from(new Set([...a.ustadz, ...b.ustadz])),
    nilai: Array.from(new Set([...a.nilai, ...b.nilai])),
    tahfidz: Array.from(new Set([...a.tahfidz, ...b.tahfidz])),
    it: Array.from(new Set([...a.it, ...b.it])),
    soal: Array.from(new Set([...a.soal, ...b.soal])),
  };
}

function mergeRecordArrayByKey<T extends Record<string, unknown>>(
  existingArr: unknown,
  incomingArr: unknown,
  getKey: (item: T) => string,
  deletedSet: Set<string>,
  preferNewerByTimestamp = false
): T[] {
  const map = new Map<string, T>();
  if (Array.isArray(existingArr)) {
    for (const item of existingArr as T[]) {
      if (!item || typeof item !== 'object') continue;
      const key = getKey(item);
      if (!key || deletedSet.has(key)) continue;
      map.set(key, item);
    }
  }
  if (Array.isArray(incomingArr)) {
    for (const item of incomingArr as T[]) {
      if (!item || typeof item !== 'object') continue;
      const key = getKey(item);
      if (!key || deletedSet.has(key)) continue;
      const prev = map.get(key);
      if (prev && preferNewerByTimestamp) {
        const prevTs = String(prev.updatedAt || '');
        const nextTs = String(item.updatedAt || '');
        if (prevTs && (!nextTs || prevTs > nextTs)) {
          continue;
        }
      }
      map.set(key, prev ? { ...prev, ...item } : item);
    }
  }
  return Array.from(map.values());
}

function mergeServerPayloads(
  existing: Record<string, unknown> | null,
  incoming: Record<string, unknown>,
  options?: { forceReplace?: boolean; replaceLogs?: boolean }
): Record<string, unknown> {
  if (!existing || options?.forceReplace) {
    return {
      ...incoming,
      deletedRecords: normalizeServerDeleted(incoming.deletedRecords),
    };
  }

  const deleted = mergeDeletedRecords(existing.deletedRecords, incoming.deletedRecords);
  const delSantri = new Set(deleted.santri);
  const delMapel = new Set(deleted.mapel);
  const delUstadz = new Set(deleted.ustadz);
  const delNilai = new Set(deleted.nilai);
  const delTahfidz = new Set(deleted.tahfidz);
  const delIT = new Set(deleted.it);
  const delSoal = new Set(deleted.soal);

  const bankSoal = mergeRecordArrayByKey<Record<string, unknown>>(
    existing.bankSoal,
    incoming.bankSoal,
    (s) => String(s.idSoal || '').trim().toUpperCase(),
    delSoal,
    true
  );

  const santriList = mergeRecordArrayByKey<Record<string, unknown>>(
    existing.santriList,
    incoming.santriList,
    (s) => String(s.nis || '').trim().toUpperCase(),
    delSantri
  );

  const mapelList = mergeRecordArrayByKey<Record<string, unknown>>(
    existing.mapelList,
    incoming.mapelList,
    (m) => `${String(m.unit || '')}__${String(m.kelas || '')}__${String(m.namaMapel || '').trim().toLowerCase()}`.toLowerCase(),
    delMapel,
    true
  );

  const ustadzList = mergeRecordArrayByKey<Record<string, unknown>>(
    existing.ustadzList,
    incoming.ustadzList,
    (u) => String(u.id || u.namaUstadz || '').trim().toLowerCase(),
    delUstadz,
    true
  );

  const nilaiAkademik = mergeRecordArrayByKey<Record<string, unknown>>(
    existing.nilaiAkademik,
    incoming.nilaiAkademik,
    (n) => `${String(n.nis || '').trim()}__${String(n.mapel || '').trim().toLowerCase()}`.toLowerCase(),
    delNilai
  ).filter((n) => !delSantri.has(String(n.nis || '').trim().toUpperCase()));

  const dataTahfidz = mergeRecordArrayByKey<Record<string, unknown>>(
    existing.dataTahfidz,
    incoming.dataTahfidz,
    (t) => String(t.nis || '').trim().toUpperCase(),
    new Set([...delTahfidz, ...delSantri])
  );

  const dataIT = mergeRecordArrayByKey<Record<string, unknown>>(
    existing.dataIT,
    incoming.dataIT,
    (i) => String(i.nis || '').trim().toUpperCase(),
    new Set([...delIT, ...delSantri])
  );

  const mergeLogs = (prevLogs: unknown, nextLogs: unknown) => {
    if (options?.replaceLogs && Array.isArray(nextLogs)) return nextLogs;
    const map = new Map<string, Record<string, unknown>>();
    const all = [
      ...(Array.isArray(nextLogs) ? (nextLogs as Array<Record<string, unknown>>) : []),
      ...(Array.isArray(prevLogs) ? (prevLogs as Array<Record<string, unknown>>) : []),
    ];
    for (const item of all) {
      if (!item || typeof item !== 'object') continue;
      const key = String(item.idLog || JSON.stringify(item));
      if (!map.has(key)) map.set(key, item);
    }
    return Array.from(map.values()).slice(0, 400);
  };

  return {
    ...existing,
    ...incoming,
    identitasPesantren:
      incoming.identitasPesantren && typeof incoming.identitasPesantren === 'object'
        ? {
            ...(existing.identitasPesantren && typeof existing.identitasPesantren === 'object'
              ? (existing.identitasPesantren as Record<string, unknown>)
              : {}),
            ...(incoming.identitasPesantren as Record<string, unknown>),
          }
        : existing.identitasPesantren,
    adminList:
      Array.isArray(incoming.adminList) && incoming.adminList.length > 0
        ? incoming.adminList
        : existing.adminList,
    santriList,
    mapelList,
    ustadzList,
    bankSoal,
    nilaiAkademik,
    dataTahfidz,
    dataIT,
    logUjianCBT: mergeLogs(existing.logUjianCBT, incoming.logUjianCBT),
    logAktivitasNilai: mergeLogs(existing.logAktivitasNilai, incoming.logAktivitasNilai),
    deletedRecords: deleted,
  };
}

const serverStore: PersistentStore = loadPersistentStore();

// Flush otomatis ke disk jika server menerima sinyal shutdown (SIGTERM/SIGINT)
const flushBeforeExit = () => {
  if (hasDirtyPendingSave || pendingSaveTimer) {
    if (pendingSaveTimer) clearTimeout(pendingSaveTimer);
    writeStoreAtomicSync(serverStore);
  }
};
process.once('SIGTERM', () => {
  flushBeforeExit();
  process.exit(0);
});
process.once('SIGINT', () => {
  flushBeforeExit();
  process.exit(0);
});

// Endpoint GET & POST Sinkronisasi Database Lintas Perangkat (ETag 304 + Non-Destructive Multi-User Merge)
app.get('/api/db/state', (req, res) => {
  const etag = `"v-${serverStore.version}"`;
  res.setHeader('ETag', etag);
  res.setHeader('Cache-Control', 'no-cache');
  if (req.headers['if-none-match'] === etag) {
    res.status(304).end();
    return;
  }
  res.json({
    sukses: true,
    version: serverStore.version,
    updatedAt: serverStore.updatedAt,
    payload: serverStore.payload,
    state: serverStore.payload
      ? { ...serverStore.payload, updatedAt: serverStore.updatedAt }
      : null,
  });
});

app.post('/api/db/state', (req, res) => {
  const forceReplace = Boolean(req.body && req.body.forceReplace);
  const replaceLogs = Boolean(req.body && req.body.replaceLogs);
  const incoming =
    req.body && typeof req.body.payload === 'object' && req.body.payload !== null
      ? (req.body.payload as Record<string, unknown>)
      : (req.body as Record<string, unknown>);
  if (incoming && typeof incoming === 'object') {
    const cleanIncoming = { ...incoming };
    delete cleanIncoming.forceReplace;
    delete cleanIncoming.replaceLogs;
    serverStore.version += 1;
    serverStore.updatedAt = new Date().toISOString();
    serverStore.payload = mergeServerPayloads(serverStore.payload, cleanIncoming, {
      forceReplace,
      replaceLogs,
    });
    savePersistentStore(serverStore);
  }
  res.json({
    sukses: true,
    version: serverStore.version,
    updatedAt: serverStore.updatedAt,
    payload: serverStore.payload,
  });
});

// Endpoint Atomik Bank Soal CBT: Tambah/Update Soal Seketika Tanpa Menimpa Soal Ustadz Lain
app.post('/api/soal/upsert', (req, res) => {
  const daftarBaru = Array.isArray(req.body?.soalList)
    ? (req.body.soalList as Array<Record<string, unknown>>)
    : req.body?.soal && typeof req.body.soal === 'object'
    ? [req.body.soal as Record<string, unknown>]
    : [];

  if (daftarBaru.length === 0) {
    res.status(400).json({ sukses: false, pesan: 'Tidak ada data soal yang dikirim.' });
    return;
  }

  const respectDeleted = Boolean(req.body?.respectDeleted);
  const basePayload = (serverStore.payload || {}) as Record<string, unknown>;
  const deleted = normalizeServerDeleted(basePayload.deletedRecords);
  const incomingIds = new Set(
    daftarBaru.map((s) => String(s.idSoal || '').trim().toUpperCase()).filter(Boolean)
  );
  // Untuk pembuatan/edit eksplisit (respectDeleted = false), hapus dari tombstone.
  // Untuk sinkronisasi massal (respectDeleted = true), JANGAN hidupkan kembali soal yang sudah dihapus!
  if (!respectDeleted) {
    deleted.soal = deleted.soal.filter((id) => !incomingIds.has(id));
  }

  const nowIso = new Date().toISOString();
  const stamped = daftarBaru.map((s) => ({
    ...s,
    updatedAt: String(s.updatedAt || nowIso),
  }));

  const mergedSoal = mergeRecordArrayByKey<Record<string, unknown>>(
    basePayload.bankSoal,
    stamped,
    (s) => String(s.idSoal || '').trim().toUpperCase(),
    new Set(deleted.soal),
    true
  );

  serverStore.version += 1;
  serverStore.updatedAt = nowIso;
  serverStore.payload = {
    ...basePayload,
    bankSoal: mergedSoal,
    deletedRecords: deleted,
  };
  savePersistentStore(serverStore);

  res.json({
    sukses: true,
    version: serverStore.version,
    updatedAt: serverStore.updatedAt,
    bankSoal: mergedSoal,
    deletedSoal: deleted.soal,
  });
});

// Endpoint Atomik Bank Soal CBT: Hapus Soal Secara Eksplisit dengan Tombstone
app.post('/api/soal/delete', (req, res) => {
  const idList = Array.isArray(req.body?.idSoalList)
    ? (req.body.idSoalList as unknown[]).map((x) => String(x).trim().toUpperCase()).filter(Boolean)
    : req.body?.idSoal
    ? [String(req.body.idSoal).trim().toUpperCase()]
    : [];

  if (idList.length === 0) {
    res.status(400).json({ sukses: false, pesan: 'idSoal wajib disertakan.' });
    return;
  }

  const basePayload = (serverStore.payload || {}) as Record<string, unknown>;
  const deleted = normalizeServerDeleted(basePayload.deletedRecords);
  const idSet = new Set(idList);
  deleted.soal = Array.from(new Set([...deleted.soal, ...idList]));

  const currentSoal = Array.isArray(basePayload.bankSoal)
    ? (basePayload.bankSoal as Array<Record<string, unknown>>)
    : [];
  const filteredSoal = currentSoal.filter(
    (s) => !idSet.has(String(s.idSoal || '').trim().toUpperCase())
  );

  serverStore.version += 1;
  serverStore.updatedAt = new Date().toISOString();
  serverStore.payload = {
    ...basePayload,
    bankSoal: filteredSoal,
    deletedRecords: deleted,
  };
  savePersistentStore(serverStore);

  res.json({
    sukses: true,
    version: serverStore.version,
    updatedAt: serverStore.updatedAt,
    bankSoal: filteredSoal,
    deletedSoal: deleted.soal,
  });
});

// Endpoint Atomik Konfigurasi Mapel, Token Ujian & Durasi (Agar perubahan Token/Durasi tidak pernah kembali ke default)
app.post('/api/mapel/upsert', (req, res) => {
  const daftarBaru = Array.isArray(req.body?.mapelList)
    ? (req.body.mapelList as Array<Record<string, unknown>>)
    : req.body?.mapel && typeof req.body.mapel === 'object'
    ? [req.body.mapel as Record<string, unknown>]
    : [];

  if (daftarBaru.length === 0) {
    res.status(400).json({ sukses: false, pesan: 'Data mata pelajaran wajib disertakan.' });
    return;
  }

  const removeOldKeys: string[] = Array.isArray(req.body?.removeOldKeys)
    ? (req.body.removeOldKeys as unknown[]).map((x) => String(x || '').trim().toLowerCase()).filter(Boolean)
    : [];

  const basePayload = (serverStore.payload || {}) as Record<string, unknown>;
  const deleted = normalizeServerDeleted(basePayload.deletedRecords);
  const nowIso = new Date().toISOString();

  const incomingKeys = new Set(
    daftarBaru.map((m) =>
      `${String(m.unit || '')}__${String(m.kelas || '')}__${String(m.namaMapel || '').trim().toLowerCase()}`.toLowerCase()
    )
  );
  // Tambahkan kunci lama (jika mapel dipindah kelas/unit atau ganti nama) dan bersihkan kunci baru dari tombstone
  const nextDelMapel = new Set(deleted.mapel.filter((k) => !incomingKeys.has(k)));
  removeOldKeys.forEach((k) => {
    if (!incomingKeys.has(k)) nextDelMapel.add(k);
  });
  deleted.mapel = Array.from(nextDelMapel);

  const stamped = daftarBaru.map((m) => ({
    ...m,
    tokenUjian: String(m.tokenUjian || '').trim().toUpperCase(),
    durasiMenit: Math.max(5, Math.min(240, Number(m.durasiMenit) || 40)),
    updatedAt: String(m.updatedAt || nowIso),
  }));

  const mergedMapel = mergeRecordArrayByKey<Record<string, unknown>>(
    basePayload.mapelList,
    stamped,
    (m) => `${String(m.unit || '')}__${String(m.kelas || '')}__${String(m.namaMapel || '').trim().toLowerCase()}`.toLowerCase(),
    nextDelMapel,
    false
  );

  // Opsional: jika klien menyertakan sinkronisasi hak akses ustadz yang terdampak
  let nextUstadzList = basePayload.ustadzList;
  if (Array.isArray(req.body?.ustadzList) && req.body.ustadzList.length > 0) {
    const ustadzStamped = (req.body.ustadzList as Array<Record<string, unknown>>).map((u) => ({
      ...u,
      updatedAt: String(u.updatedAt || nowIso),
    }));
    nextUstadzList = mergeRecordArrayByKey<Record<string, unknown>>(
      basePayload.ustadzList,
      ustadzStamped,
      (u) => String(u.id || u.namaUstadz || '').trim().toLowerCase(),
      new Set(deleted.ustadz),
      false
    );
  }

  serverStore.version += 1;
  serverStore.updatedAt = nowIso;
  serverStore.payload = {
    ...basePayload,
    mapelList: mergedMapel,
    ustadzList: nextUstadzList,
    deletedRecords: deleted,
  };
  savePersistentStore(serverStore);

  res.json({
    sukses: true,
    version: serverStore.version,
    updatedAt: serverStore.updatedAt,
    mapelList: mergedMapel,
    ustadzList: nextUstadzList,
    deletedMapel: deleted.mapel,
  });
});

// Endpoint Atomik Hak Akses Ustadz (Sinkron per Mapel & per Kelas)
app.post('/api/ustadz/upsert', (req, res) => {
  const daftarUstadz = Array.isArray(req.body?.ustadzList)
    ? (req.body.ustadzList as Array<Record<string, unknown>>)
    : req.body?.ustadz && typeof req.body.ustadz === 'object'
    ? [req.body.ustadz as Record<string, unknown>]
    : [];

  if (daftarUstadz.length === 0) {
    res.status(400).json({ sukses: false, pesan: 'Data akun ustadz wajib disertakan.' });
    return;
  }

  const basePayload = (serverStore.payload || {}) as Record<string, unknown>;
  const deleted = normalizeServerDeleted(basePayload.deletedRecords);
  const nowIso = new Date().toISOString();

  const stampedUstadz = daftarUstadz.map((u) => ({
    ...u,
    updatedAt: String(u.updatedAt || nowIso),
  }));

  const mergedUstadz = mergeRecordArrayByKey<Record<string, unknown>>(
    basePayload.ustadzList,
    stampedUstadz,
    (u) => String(u.id || u.namaUstadz || '').trim().toLowerCase(),
    new Set(deleted.ustadz),
    false
  );

  // Opsional: sinkronkan juga nama pengampu di mapelList agar Tabel Token & Hak Akses Ustadz 100% cocok
  let nextMapelList = basePayload.mapelList;
  if (Array.isArray(req.body?.mapelList) && req.body.mapelList.length > 0) {
    const stampedMapel = (req.body.mapelList as Array<Record<string, unknown>>).map((m) => ({
      ...m,
      updatedAt: String(m.updatedAt || nowIso),
    }));
    nextMapelList = mergeRecordArrayByKey<Record<string, unknown>>(
      basePayload.mapelList,
      stampedMapel,
      (m) => `${String(m.unit || '')}__${String(m.kelas || '')}__${String(m.namaMapel || '').trim().toLowerCase()}`.toLowerCase(),
      new Set(deleted.mapel),
      false
    );
  }

  serverStore.version += 1;
  serverStore.updatedAt = nowIso;
  serverStore.payload = {
    ...basePayload,
    ustadzList: mergedUstadz,
    mapelList: nextMapelList,
    deletedRecords: deleted,
  };
  savePersistentStore(serverStore);

  res.json({
    sukses: true,
    version: serverStore.version,
    updatedAt: serverStore.updatedAt,
    ustadzList: mergedUstadz,
    mapelList: nextMapelList,
  });
});

// ============================================================================
// SERVER-AUTHORITATIVE CBT ENDPOINTS (KUNCI JAWABAN AMAN & TIMER ANTI-REFRESH)
// ============================================================================
app.post('/api/cbt/start', (req, res) => {
  const { nis, namaSantri, unit, kelas, mapel, tokenInput, durasiMenit, daftarSoalLengkap } = req.body;
  if (!nis || !mapel) {
    res.status(400).json({ sukses: false, pesan: 'NIS dan Mata Pelajaran wajib diisi.' });
    return;
  }

  const dbPayload = (serverStore.payload || {}) as Record<string, unknown>;
  const santriList = (Array.isArray(dbPayload.santriList) ? dbPayload.santriList : []) as Array<Record<string, unknown>>;
  const mapelList = (Array.isArray(dbPayload.mapelList) ? dbPayload.mapelList : []) as Array<Record<string, unknown>>;
  const bankSoal = (Array.isArray(dbPayload.bankSoal) ? dbPayload.bankSoal : []) as Array<Record<string, unknown>>;

  const nisNormalized = String(nis).trim().toUpperCase();
  const santriExact = santriList.find(
    (s) =>
      String(s.nis || '').trim().toUpperCase() === nisNormalized &&
      (!unit || s.unit === unit) &&
      (!kelas || s.kelas === kelas)
  );

  if (santriList.length > 0 && !santriExact) {
    const santriLainKelas = santriList.find(
      (s) => String(s.nis || '').trim().toUpperCase() === nisNormalized
    );
    res.json({
      sukses: false,
      pesan: santriLainKelas
        ? `NIS ${nis} terdaftar di ${santriLainKelas.unit} - ${santriLainKelas.kelas}, bukan di Unit ${unit} - ${kelas}.`
        : `NIS ${nis} tidak ditemukan pada Unit ${unit} - ${kelas}. Pastikan Anda mengetik NIS Anda sendiri dengan benar.`,
    });
    return;
  }

  const santriFound = santriExact || {
    nis: nisNormalized,
    nama: String(namaSantri || nis),
    unit: String(unit || 'Wustho'),
    kelas: String(kelas || 'Kelas 7'),
  };

  const cfgMapel = mapelList.find(
    (m) => m.unit === unit && m.kelas === kelas && m.namaMapel === mapel
  );

  if (cfgMapel && cfgMapel.tokenUjian) {
    const tokenResmi = String(cfgMapel.tokenUjian).trim().toUpperCase();
    const tokenDiberikan = String(tokenInput || '').trim().toUpperCase();
    if (!tokenDiberikan || tokenResmi !== tokenDiberikan) {
      res.status(403).json({
        sukses: false,
        pesan: 'Token ujian salah atau kosong! Silakan periksa kembali atau tanyakan token resmi kepada pengawas ujian.',
      });
      return;
    }
  }

  // Utamakan soal otoritatif dari database server agar tidak dapat dimanipulasi dari sisi klien
  const soalServerMapel = bankSoal.filter((s) => s.unit === unit && s.kelas === kelas && s.mapel === mapel);
  const soalSumber =
    soalServerMapel.length > 0
      ? soalServerMapel
      : Array.isArray(daftarSoalLengkap) && daftarSoalLengkap.length > 0
      ? daftarSoalLengkap
      : [];

  if (soalSumber.length === 0) {
    res.json({
      sukses: false,
      pesan: `Belum ada soal CBT untuk mata pelajaran ${mapel} (${unit} - ${kelas}). Silakan buat soal di Portal Ustadz terlebih dahulu.`,
    });
    return;
  }

  const sessionKey = `${String(nis).toUpperCase()}__${String(mapel)}`;
  const now = Date.now();
  const durasiValid = Math.max(5, Number(durasiMenit || cfgMapel?.durasiMenit) || 40);

  let session = serverStore.cbtSessions[sessionKey];
  let dilanjutkanDariSesiSebelumnya = false;

  // Jika sudah ada sesi AKTIF yang belum habis waktunya, lanjutkan sesi (Anti-Refresh Reset!)
  if (!session || session.status === 'SELESAI' || session.endTimeMs <= now) {
    session = {
      sessionId: `SESI-${now.toString(36).toUpperCase()}`,
      nis: String(santriFound.nis).toUpperCase(),
      namaSantri: String(santriFound.nama || nis),
      unit: String(santriFound.unit || 'Wustho'),
      kelas: String(santriFound.kelas || 'Kelas 7'),
      mapel: String(mapel),
      startTimeMs: now,
      endTimeMs: now + durasiValid * 60 * 1000,
      durasiMenit: durasiValid,
      pelanggaran: 0,
      jawaban: {},
      status: 'AKTIF',
    };
    serverStore.cbtSessions[sessionKey] = session;
    scheduleSavePersistentStore(serverStore, 800);
  } else {
    dilanjutkanDariSesiSebelumnya = true;
  }

  const sisaDetikServer = Math.max(0, Math.floor((session.endTimeMs - now) / 1000));

  // Sembunyikan kunciJawaban saat dikirim ke frontend santri (Server-Authoritative Security)
  const soalTanpaKunci = soalSumber.map((s: Record<string, unknown>) => ({
    idSoal: s.idSoal,
    unit: s.unit,
    kelas: s.kelas,
    mapel: s.mapel,
    pertanyaan: s.pertanyaan,
    teksArabSoal: s.teksArabSoal || undefined,
    potonganKodeIT: s.potonganKodeIT || undefined,
    gambarSoalUrl: s.gambarSoalUrl || undefined,
    opsiA: s.opsiA,
    opsiB: s.opsiB,
    opsiC: s.opsiC,
    opsiD: s.opsiD,
    bobotSoal: s.bobotSoal,
  }));

  res.json({
    sukses: true,
    santri: santriFound,
    sessionId: session.sessionId,
    sisaDetikServer,
    pelanggaranTercatat: session.pelanggaran,
    jawabanTersimpan: session.jawaban,
    soalAman: soalTanpaKunci,
    soalTanpaKunci,
    sesi: {
      sessionId: session.sessionId,
      sisaDetikServer,
      pelanggaran: session.pelanggaran,
      jawaban: session.jawaban,
      dilanjutkanDariSesiSebelumnya,
    },
  });
});

app.post('/api/cbt/sync', (req, res) => {
  const { nis, mapel, jawaban, pelanggaran } = req.body;
  const sessionKey = `${String(nis || '').trim().toUpperCase()}__${String(mapel || '').trim()}`;
  const session = serverStore.cbtSessions[sessionKey];
  if (!session || session.status === 'SELESAI') {
    res.json({ sukses: false, pesan: 'Sesi ujian tidak ditemukan atau sudah selesai.' });
    return;
  }

  const jawabanBersih = sanitizeJawabanMap(jawaban);
  if (Object.keys(jawabanBersih).length > 0) {
    session.jawaban = { ...session.jawaban, ...jawabanBersih };
  }
  if (typeof pelanggaran === 'number' && Number.isFinite(pelanggaran) && pelanggaran > session.pelanggaran) {
    session.pelanggaran = Math.min(10, Math.floor(pelanggaran));
  }
  // Coalesced async save agar 65+ santri menjawab bersamaan tidak memblokir event loop
  scheduleSavePersistentStore(serverStore, 1500);

  const sisaDetikServer = Math.max(0, Math.floor((session.endTimeMs - Date.now()) / 1000));
  res.json({
    sukses: true,
    sisaDetikServer,
    pelanggaranTercatat: session.pelanggaran,
  });
});

app.post('/api/cbt/submit', (req, res) => {
  const { nis, mapel, jawaban, pelanggaran, pelanggaranFinal, karenaAutoSubmitCurang, daftarSoalServer } = req.body;
  const nisUpper = String(nis || '').trim().toUpperCase();
  const mapelClean = String(mapel || '').trim();
  const sessionKey = `${nisUpper}__${mapelClean}`;
  const session = serverStore.cbtSessions[sessionKey];
  const jmlPelanggaran = Math.min(
    10,
    Math.max(session?.pelanggaran || 0, Math.floor(Number(pelanggaran ?? pelanggaranFinal) || 0))
  );

  const jawabanBersih = sanitizeJawabanMap(jawaban);
  const jawabanSantri: Record<string, string> =
    Object.keys(jawabanBersih).length > 0 ? jawabanBersih : session?.jawaban || {};

  if (session) {
    session.status = 'SELESAI';
    session.pelanggaran = jmlPelanggaran;
    session.jawaban = jawabanSantri as Record<string, 'A' | 'B' | 'C' | 'D'>;
  }

  const dbPayload = (serverStore.payload || {}) as Record<string, unknown>;
  const bankSoal = (Array.isArray(dbPayload.bankSoal) ? dbPayload.bankSoal : []) as Array<Record<string, unknown>>;

  // SELALU utamakan kunci jawaban otoritatif di server agar tidak dapat dipalsukan dari sisi klien
  const soalServer = bankSoal.filter(
    (s) =>
      String(s.mapel || '').trim() === mapelClean &&
      (!session?.unit || s.unit === session.unit) &&
      (!session?.kelas || s.kelas === session.kelas)
  );
  const soalList: Array<Record<string, unknown>> =
    soalServer.length > 0
      ? soalServer
      : Array.isArray(daftarSoalServer) && daftarSoalServer.length > 0
      ? daftarSoalServer
      : [];

  let bobotMaks = 0;
  let bobotDapat = 0;
  let jmlBenar = 0;

  soalList.forEach((s) => {
    const bobot = Number(s.bobotSoal) || 10;
    const idSoal = String(s.idSoal || '');
    const kunci = String(s.kunciJawaban || 'A').toUpperCase();
    bobotMaks += bobot;
    if (String(jawabanSantri[idSoal] || '').toUpperCase() === kunci) {
      bobotDapat += bobot;
      jmlBenar++;
    }
  });

  const skorCBT = bobotMaks > 0 ? Math.round((bobotDapat / bobotMaks) * 100 * 100) / 100 : 0;
  const now = Date.now();
  const kodeVerifikasi = `DF-CBT-${now.toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 5).toUpperCase()}`;

  const statusLog =
    karenaAutoSubmitCurang || jmlPelanggaran >= 3
      ? 'Auto-Submit (Diskualifikasi 3x Pelanggaran Lockdown)'
      : jmlPelanggaran > 0
      ? `Selesai dengan Peringatan (${jmlPelanggaran}x Pelanggaran)`
      : 'Selesai Normal (Jujur & Tertib)';

  const logBaru = {
    idLog: `LOG-${now.toString(36).toUpperCase()}-${nisUpper.slice(-4)}`,
    timestamp: new Date(now).toISOString().replace('T', ' ').substring(0, 19),
    nis: nisUpper || String(session?.nis || '').toUpperCase(),
    namaSantri: String(session?.namaSantri || nisUpper || ''),
    unit: String(session?.unit || 'Wustho'),
    kelas: String(session?.kelas || 'Kelas 7'),
    mapel: mapelClean,
    skorCBT,
    pelanggaran: jmlPelanggaran,
    status: statusLog,
  };

  // Simpan log ujian & nilai CBT santri secara ATOMIK di sisi server agar tahan 65+ submit bersamaan / tutup tab mendadak
  const existingLogs = Array.isArray(dbPayload.logUjianCBT)
    ? (dbPayload.logUjianCBT as Array<Record<string, unknown>>)
    : [];
  const nextLogs = [logBaru, ...existingLogs.filter((l) => String(l.idLog || '') !== logBaru.idLog)].slice(0, 500);

  const existingNilai = Array.isArray(dbPayload.nilaiAkademik)
    ? ([...(dbPayload.nilaiAkademik as Array<Record<string, unknown>>)])
    : [];
  const idxNilai = existingNilai.findIndex(
    (r) =>
      String(r.nis || '').trim().toUpperCase() === logBaru.nis &&
      String(r.mapel || '').trim().toLowerCase() === mapelClean.toLowerCase()
  );

  let nilaiRowTerbaru: Record<string, unknown>;
  if (idxNilai !== -1) {
    const row = existingNilai[idxNilai];
    const calc = hitungNilaiAkhirServer(
      Number(row.tugas) || 0,
      Number(row.sikap) || 0,
      Number(row.lisan) || 0,
      skorCBT
    );
    nilaiRowTerbaru = {
      ...row,
      cbt: skorCBT,
      nilaiAkhir: calc.nilaiAkhir,
      predikat: calc.predikat,
    };
    existingNilai[idxNilai] = nilaiRowTerbaru;
  } else {
    const calc = hitungNilaiAkhirServer(0, 0, 0, skorCBT);
    nilaiRowTerbaru = {
      nis: logBaru.nis,
      mapel: mapelClean,
      tugas: 0,
      sikap: 0,
      lisan: 0,
      cbt: skorCBT,
      nilaiAkhir: calc.nilaiAkhir,
      predikat: calc.predikat,
    };
    existingNilai.push(nilaiRowTerbaru);
  }

  const deletedNorm = normalizeServerDeleted(dbPayload.deletedRecords);
  const keyNilaiNorm = `${logBaru.nis}__${mapelClean.toLowerCase()}`.toLowerCase();
  deletedNorm.nilai = deletedNorm.nilai.filter((k) => k !== keyNilaiNorm);

  serverStore.version += 1;
  serverStore.updatedAt = new Date(now).toISOString();
  serverStore.payload = {
    ...dbPayload,
    logUjianCBT: nextLogs,
    nilaiAkademik: existingNilai,
    deletedRecords: deletedNorm,
  };
  savePersistentStore(serverStore);

  res.json({
    sukses: true,
    serverPersisted: true,
    skorCBT,
    jmlBenar,
    totalSoal: soalList.length,
    pelanggaranFinal: jmlPelanggaran,
    kodeVerifikasiServer: kodeVerifikasi,
    kodeVerifikasi,
    logBaru,
    nilaiRowTerbaru,
  });
});

// ============================================================================
// ENDPOINT AI PEMBUAT & PENGOLAH SOAL CBT (MENDUKUNG TEKS ARAB & BLOK KODE IT)
// ============================================================================
app.post('/api/ai-extract-soal', async (req, res) => {
  try {
    const { rawText, documentText, fileBase64, mimeType, mapel, unit, kelas, jumlahSoal } = req.body;

    const ai = getGenAIClient();
    const parts: Array<{ text?: string; inlineData?: { data: string; mimeType: string } }> = [];

    if (fileBase64 && mimeType) {
      parts.push({
        inlineData: {
          data: fileBase64,
          mimeType,
        },
      });
    }

    const sumberMateriAtauSoal = [documentText, rawText].filter(Boolean).join('\n\n').trim();

    const systemInstruction = `Anda adalah Mesin Pembuat Soal CBT (Computer-Based Test) Otomatis untuk Pondok Pesantren Tahfidz & Ilmu Teknologi Darul Fithrah.
Target Ujian: Mata Pelajaran "${mapel || 'Umum'}", Unit "${unit || 'Wustho'}", Tingkat "${kelas || 'Kelas 7'}".

ATURAN MUTLAK (WAJIB DIPATUHI):
1. FOKUS KEBUTUHAN CBT PILIHAN GANDA:
   - Keluarkan HANYA daftar soal Pilihan Ganda siap ujian CBT yang masing-masing memiliki: pertanyaan, teksArabSoal (opsional jika soal memuat kutipan ayat Al-Qur'an/Hadits/kalimat Arab), potonganKodeIT (opsional jika soal memuat cuplikan kode pemrograman), opsiA, opsiB, opsiC, opsiD, kunciJawaban ('A'/'B'/'C'/'D'), dan bobotSoal.
   - Jika materi sumber berupa soal Esai/Uraian, Isian, atau Pilihan Ganda yang belum lengkap opsinya, langsung ubah dan lengkapi menjadi soal Pilihan Ganda 4 opsi (A, B, C, D) yang utuh dengan 1 jawaban benar dan 3 pengecoh (distractor) yang masuk akal serta berbobot.
   - Jika materi sumber berupa topik/ringkasan materi/kisi-kisi, langsung buatkan ${jumlahSoal || 5} soal Pilihan Ganda CBT yang relevan dengan materi tersebut.
2. ABAIKAN & JANGAN TAMPILKAN TEKS BUKAN SOAL:
   - ABAIKAN SECARA SENYAP semua teks yang bukan soal seperti: Kop surat, nama pesantren/sekolah, judul ujian, tahun ajaran, identitas nama/kelas/nomor induk, petunjuk pengerjaan, basmalah/hamdalah, sub-judul bagian ("I. Pilihan Ganda", "II. Essay"), nomor halaman, catatan kaki, atau ucapan selamat mengerjakan.
   - DILARANG KERAS menampilkan atau membuat baris yang berisi catatan seperti "Bukan bagian dari soal", "Teks ini bukan soal", "Pengantar/Instruksi", atau semacamnya. Semua teks non-soal wajib langsung dibuang dan tidak boleh masuk ke JSON output!
3. FORMAT BERSIH & SCREENING SALAH TULISAN (ANTI-TYPO):
   - Jangan sertakan nomor urut di awal pertanyaan (hapus "1.", "2)", "Soal 1:", dsb.).
   - Jangan sertakan huruf opsi di awal pilihan jawaban (hapus "A.", "b)", dsb.).
   - Wajib melakukan screening ejaan dan mengoreksi otomatis setiap salah ketik (typo), kesalahan huruf kapital, spasi ganda, tanda baca, serta penulisan istilah Fiqih/Tahfidz/Bahasa Arab dan Ilmu Teknologi agar rapi, baku, dan bebas salah tulis.`;

    const userPrompt = sumberMateriAtauSoal
      ? `Susun dan produksi soal Pilihan Ganda CBT siap pakai dari sumber berikut ini (abaikan seluruh teks yang bukan bagian dari soal, serta koreksi semua salah ketik/typo):\n\n${sumberMateriAtauSoal}`
      : `Susun dan produksi seluruh soal Pilihan Ganda CBT siap pakai dari dokumen/gambar terlampir (abaikan seluruh kop, instruksi, atau teks yang bukan bagian dari soal, serta koreksi semua salah ketik/typo).`;

    parts.push({ text: userPrompt });

    const response = await generateContentDenganRetryDanFallback(ai, {
      contents: { parts },
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          description: 'Daftar murni soal pilihan ganda siap ujian CBT (tanpa teks non-soal)',
          items: {
            type: Type.OBJECT,
            properties: {
              pertanyaan: {
                type: Type.STRING,
                description: 'Teks pertanyaan CBT yang utuh, sudah dikoreksi ejaan/typo-nya, tanpa nomor soal di depannya.',
              },
              teksArabSoal: {
                type: Type.STRING,
                description: 'Opsional: Kutipan ayat Al-Qur\'an, Hadits, atau kalimat Bahasa Arab berharakat jika soal berkaitan dengan teks Arab. Kosongkan ("") jika tidak ada.',
              },
              potonganKodeIT: {
                type: Type.STRING,
                description: 'Opsional: Potongan blok kode pemrograman jika soal membahas koding/IT. Kosongkan ("") jika tidak ada.',
              },
              opsiA: {
                type: Type.STRING,
                description: 'Pilihan jawaban A bersih tanpa awalan A dan bebas typo.',
              },
              opsiB: {
                type: Type.STRING,
                description: 'Pilihan jawaban B bersih tanpa awalan B dan bebas typo.',
              },
              opsiC: {
                type: Type.STRING,
                description: 'Pilihan jawaban C bersih tanpa awalan C dan bebas typo.',
              },
              opsiD: {
                type: Type.STRING,
                description: 'Pilihan jawaban D bersih tanpa awalan D dan bebas typo.',
              },
              kunciJawaban: {
                type: Type.STRING,
                description: 'Satu huruf kunci jawaban yang benar: A, B, C, atau D.',
              },
              bobotSoal: {
                type: Type.NUMBER,
                description: 'Bobot nilai soal (angka positif, misalnya 10 atau 20).',
              },
            },
            required: ['pertanyaan', 'opsiA', 'opsiB', 'opsiC', 'opsiD', 'kunciJawaban', 'bobotSoal'],
          },
        },
      },
    });

    const jsonText = response.text?.trim() || '[]';
    const rawArray = JSON.parse(jsonText);
    const listSoal = Array.isArray(rawArray) ? rawArray : [];

    const polaBukanSoal =
      /bukan\s+bagian\s+dari\s+soal|bukan\s+merupakan\s+soal|bukan\s+soal|tidak\s+termasuk\s+soal|tidak\s+ada\s+soal|teks\s+pengantar|petunjuk\s+pengerjaan|petunjuk\s+umum|kop\s+surat|identitas\s+peserta|selamat\s+mengerjakan/i;

    const soalBersih = listSoal
      .map((item: Record<string, unknown>) => {
        const pertanyaan = String(item.pertanyaan || '')
          .replace(/^\s*(?:soal\s*)?\d+[\.\)\-:]\s*/i, '')
          .replace(/\s*\((?:bukan\s+bagian\s+dari\s+soal|[^)]*bukan\s+soal[^)]*)\)\s*/gi, '')
          .replace(/\s{2,}/g, ' ')
          .trim();
        const teksArabSoal = String(item.teksArabSoal || '').trim();
        const potonganKodeIT = String(item.potonganKodeIT || '').trim();
        const opsiA = String(item.opsiA || '').replace(/^\s*[aA][\.\)\-:]\s*/, '').replace(/\s{2,}/g, ' ').trim();
        const opsiB = String(item.opsiB || '').replace(/^\s*[bB][\.\)\-:]\s*/, '').replace(/\s{2,}/g, ' ').trim();
        const opsiC = String(item.opsiC || '').replace(/^\s*[cC][\.\)\-:]\s*/, '').replace(/\s{2,}/g, ' ').trim();
        const opsiD = String(item.opsiD || '').replace(/^\s*[dD][\.\)\-:]\s*/, '').replace(/\s{2,}/g, ' ').trim();
        const kunciRaw = String(item.kunciJawaban || 'A').trim().toUpperCase();
        const kunciJawaban = (['A', 'B', 'C', 'D'].includes(kunciRaw) ? kunciRaw : 'A') as 'A' | 'B' | 'C' | 'D';

        return {
          pertanyaan,
          teksArabSoal,
          potonganKodeIT,
          opsiA,
          opsiB,
          opsiC,
          opsiD,
          kunciJawaban,
          bobotSoal: Number(item.bobotSoal) || 0,
        };
      })
      .filter((s) => {
        if (!s.pertanyaan || s.pertanyaan.length < 4) return false;
        if (!s.opsiA || !s.opsiB || !s.opsiC || !s.opsiD) return false;
        if ([s.opsiA, s.opsiB, s.opsiC, s.opsiD].some((op) => op === '-' || op.toLowerCase() === 'n/a')) {
          return false;
        }
        const gabunganTeks = `${s.pertanyaan} ${s.opsiA} ${s.opsiB} ${s.opsiC} ${s.opsiD}`;
        if (polaBukanSoal.test(gabunganTeks)) return false;
        return true;
      });

    const defaultBobot = soalBersih.length > 0 ? Math.max(1, Math.round(100 / soalBersih.length)) : 10;
    const soalFinal = soalBersih.map((s) => ({
      ...s,
      bobotSoal: s.bobotSoal > 0 ? s.bobotSoal : defaultBobot,
    }));

    res.json({
      sukses: true,
      soal: soalFinal,
    });
  } catch (err: unknown) {
    console.error('Error /api/ai-extract-soal:', err);
    const { statusCode, pesan } = formatErrorGeminiRamah(
      err,
      'Gagal memproduksi soal CBT dengan AI. Pastikan file PDF dapat terbaca dan coba lagi beberapa saat.'
    );
    res.status(statusCode).json({
      sukses: false,
      pesan,
    });
  }
});

// Endpoint Screening & Perbaikan Ejaan/Typo Semua Soal CBT
app.post('/api/ai-proofread-soal', async (req, res) => {
  try {
    const { daftarSoal } = req.body;
    if (!Array.isArray(daftarSoal) || daftarSoal.length === 0) {
      res.json({ sukses: true, soal: [], jumlahDiperbaiki: 0 });
      return;
    }

    const ai = getGenAIClient();
    const systemInstruction = `Anda adalah Editor Bahasa & Kurikulum CBT Pondok Pesantren Tahfidz & Ilmu Teknologi Darul Fithrah.
Tugas Anda adalah melakukan SCREENING & PROOFREADING (Koreksi Salah Tulisan / Typo) pada seluruh daftar soal CBT yang diberikan:
1. Perbaiki setiap salah ketik (typo), spasi berlebih, huruf kapital di awal kalimat, tanda baca di akhir pertanyaan, serta ejaan istilah Bahasa Indonesia (KBBI/EYD), transliterasi Arab/Fiqih/Tahfidz (misal: wudhu, shalat, thaharah, syariat, Al-Qur'an), dan istilah Ilmu Teknologi (misal: JavaScript, Array, HTML5, CSS3).
2. Hapus nomor urut di depan pertanyaan jika masih ada, dan hapus awalan "A.", "B.", "C.", "D." di depan teks opsi.
3. Pertahankan idSoal, kunciJawaban, dan makna asli soal.`;

    const response = await generateContentDenganRetryDanFallback(ai, {
      contents: `Lakukan screening dan perbaiki salah tulisan (typo/ejaan) pada daftar soal JSON berikut:\n${JSON.stringify(
        daftarSoal.map((s) => ({
          idSoal: s.idSoal,
          pertanyaan: s.pertanyaan,
          opsiA: s.opsiA,
          opsiB: s.opsiB,
          opsiC: s.opsiC,
          opsiD: s.opsiD,
          kunciJawaban: s.kunciJawaban,
        }))
      )}`,
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              idSoal: { type: Type.STRING },
              pertanyaan: { type: Type.STRING },
              opsiA: { type: Type.STRING },
              opsiB: { type: Type.STRING },
              opsiC: { type: Type.STRING },
              opsiD: { type: Type.STRING },
              kunciJawaban: { type: Type.STRING },
            },
            required: ['idSoal', 'pertanyaan', 'opsiA', 'opsiB', 'opsiC', 'opsiD', 'kunciJawaban'],
          },
        },
      },
    });

    const hasilAI = JSON.parse(response.text?.trim() || '[]');
    const petaHasil = new Map<string, Record<string, string>>();
    if (Array.isArray(hasilAI)) {
      hasilAI.forEach((h: Record<string, string>) => {
        if (h && h.idSoal) petaHasil.set(String(h.idSoal), h);
      });
    }

    let jumlahDiperbaiki = 0;
    const soalTerscreening = daftarSoal.map((asli: Record<string, unknown>) => {
      const koreksi = petaHasil.get(String(asli.idSoal));
      if (!koreksi) return asli;

      const pertanyaanBaru = String(koreksi.pertanyaan || asli.pertanyaan).trim();
      const opsiABaru = String(koreksi.opsiA || asli.opsiA).trim();
      const opsiBBaru = String(koreksi.opsiB || asli.opsiB).trim();
      const opsiCBaru = String(koreksi.opsiC || asli.opsiC).trim();
      const opsiDBaru = String(koreksi.opsiD || asli.opsiD).trim();

      if (
        pertanyaanBaru !== asli.pertanyaan ||
        opsiABaru !== asli.opsiA ||
        opsiBBaru !== asli.opsiB ||
        opsiCBaru !== asli.opsiC ||
        opsiDBaru !== asli.opsiD
      ) {
        jumlahDiperbaiki++;
      }

      return {
        ...asli,
        pertanyaan: pertanyaanBaru,
        opsiA: opsiABaru,
        opsiB: opsiBBaru,
        opsiC: opsiCBaru,
        opsiD: opsiDBaru,
      };
    });

    res.json({
      sukses: true,
      soal: soalTerscreening,
      jumlahDiperbaiki,
    });
  } catch (err: unknown) {
    console.error('Error /api/ai-proofread-soal:', err);
    const { statusCode, pesan } = formatErrorGeminiRamah(
      err,
      'Gagal melakukan screening ejaan soal. Silakan coba lagi beberapa saat.'
    );
    res.status(statusCode).json({
      sukses: false,
      pesan,
    });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server Darul Fithrah berjalan di http://localhost:${PORT}`);
  });
}

startServer();
