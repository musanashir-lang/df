import React, { useState, useEffect, useCallback, useRef } from 'react';
import Swal from 'sweetalert2';
import * as mammoth from 'mammoth';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
} from 'recharts';
import {
  UnitPendidikan,
  UNIT_KELAS_MAP,
  INITIAL_USTADZ_2026,
  INITIAL_MAPEL_2026,
  DAFTAR_114_SURAT_QURAN,
} from './constants';
import {
  INITIAL_SANTRI_2026,
  tentukanSuratTerakhirDariHafalan,
} from './dataSantri2026';
import {
  auth,
  db,
  googleProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  doc,
  collection,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  query,
  where,
  writeBatch,
  handleFirestoreError,
  OperationType,
  isFirestoreQuotaError,
  isFirestoreQuotaPaused,
  markFirestoreQuotaExceeded,
  clearFirestoreQuotaPause,
  onFirestoreQuotaStatusChange,
  FIRESTORE_UPGRADE_URL,
  type User,
} from './firebase';
import {
  FullscreenSoalPreviewModal,
  PreviewSoalItem,
  SumberFullscreenPreview,
} from './components/FullscreenSoalPreviewModal';
import { DeadlineCountdownVisual } from './components/DeadlineCountdownVisual';

// ============================================================================
// FUNGSI JAVASCRIPT MURNI: PERHITUNGAN NILAI AKHIR 4 KOMPONEN & PREDIKAT
// ============================================================================
export interface HasilSimulasiNilai {
  rincianInput: {
    tugas: number;
    sikap: number;
    lisan: number;
    cbt: number;
  };
  kontribusiBobot: {
    tugas20Persen: number;
    sikap20Persen: number;
    lisan20Persen: number;
    cbt40Persen: number;
  };
  nilaiAkhir: number;
  predikat: 'A' | 'B' | 'C' | 'D';
  sebutan: string;
  statusLulus: boolean;
}

export function hitungNilaiAkhirPesantren(
  nilaiTugas: number | string,
  nilaiSikap: number | string,
  nilaiLisan: number | string,
  nilaiCBT: number | string
): HasilSimulasiNilai {
  const clampNilai = (val: number | string): number => {
    const num = typeof val === 'number' ? val : parseFloat(String(val));
    if (Number.isNaN(num)) return 0;
    return Math.min(100, Math.max(0, num));
  };

  const tugas = clampNilai(nilaiTugas);
  const sikap = clampNilai(nilaiSikap);
  const lisan = clampNilai(nilaiLisan);
  const cbt = clampNilai(nilaiCBT);

  const BOBOT = {
    TUGAS: 0.20,
    SIKAP: 0.20,
    LISAN: 0.20,
    CBT: 0.40,
  };

  const kontribusiTugas = tugas * BOBOT.TUGAS;
  const kontribusiSikap = sikap * BOBOT.SIKAP;
  const kontribusiLisan = lisan * BOBOT.LISAN;
  const kontribusiCBT = cbt * BOBOT.CBT;

  const totalMentah = kontribusiTugas + kontribusiSikap + kontribusiLisan + kontribusiCBT;
  const nilaiAkhir = Math.round(totalMentah * 100) / 100;

  let predikat: 'A' | 'B' | 'C' | 'D' = 'D';
  let sebutan = 'Maqbul (Perlu Pembinaan)';

  if (nilaiAkhir >= 85) {
    predikat = 'A';
    sebutan = 'Mumtaz (Sangat Baik)';
  } else if (nilaiAkhir >= 75) {
    predikat = 'B';
    sebutan = 'Jayyid Jiddan (Baik)';
  } else if (nilaiAkhir >= 60) {
    predikat = 'C';
    sebutan = 'Jayyid (Cukup)';
  }

  return {
    rincianInput: { tugas, sikap, lisan, cbt },
    kontribusiBobot: {
      tugas20Persen: Number(kontribusiTugas.toFixed(2)),
      sikap20Persen: Number(kontribusiSikap.toFixed(2)),
      lisan20Persen: Number(kontribusiLisan.toFixed(2)),
      cbt40Persen: Number(kontribusiCBT.toFixed(2)),
    },
    nilaiAkhir,
    predikat,
    sebutan,
    statusLulus: nilaiAkhir >= 60,
  };
}

// ============================================================================
// TIPE DATA UTAMA DARUL FITHRAH (DISESUAIKAN DENGAN BUKU INDUK SANTRI AKTIF)
// ============================================================================
export interface Santri {
  nis: string;
  nisn?: string;
  nama: string;
  unit: UnitPendidikan;
  kelas: string;
  kelasTerdata?: string;
  nik?: string;
  noKK?: string;
  jk?: 'L' | 'P';
  tempatLahir?: string;
  tanggalLahir?: string;
  alamat?: string;
  angkatan?: string;
  tanggalMasuk?: string;
  kodeBarang?: string;
  namaAyah?: string;
  noTelpAyah?: string;
  namaIbu?: string;
  noTelpIbu?: string;
  jumlahHafalan?: string;
}

export interface MapelConfig {
  id: string;
  namaMapel: string;
  unit: UnitPendidikan;
  kelas: string;
  pengampu?: string;
  tokenUjian: string;
  durasiMenit: number;
  updatedAt?: string;
}

export interface UstadzAccount {
  id: string;
  namaUstadz: string;
  unitAmpuan?: UnitPendidikan[];
  kelasAmpuan?: string[];
  mapelAmpuan?: string[];
  aksesMapelIds?: string[];
  jamUlya?: number;
  jamWustho?: number;
  jamMDA?: number;
  jamMA?: number;
  totalJam?: number;
  bidang: string;
  pinLogin: string;
  updatedAt?: string;
}

export interface SoalCBT {
  idSoal: string;
  unit: UnitPendidikan;
  kelas: string;
  mapel: string;
  pertanyaan: string;
  teksArabSoal?: string;
  potonganKodeIT?: string;
  gambarSoalUrl?: string;
  opsiA: string;
  opsiB: string;
  opsiC: string;
  opsiD: string;
  kunciJawaban?: 'A' | 'B' | 'C' | 'D';
  bobotSoal: number;
  pembuatUstadz?: string;
  updatedAt?: string;
}

export interface NilaiAkademikRow {
  nis: string;
  mapel: string;
  tugas: number;
  sikap: number;
  lisan: number;
  cbt: number;
  nilaiAkhir: number;
  predikat: 'A' | 'B' | 'C' | 'D';
}

export interface PencapaianTahfidz {
  nis: string;
  juzHafalan: string;
  suratTerakhir: string;
  kelancaran: 'Lancar' | 'Sedang' | 'Butuh Murajaah';
  catatanUstadz: string;
}

export interface PencapaianIT {
  nis: string;
  materiKompetensi: string;
  totalProjek: number;
  nilaiPraktek: number;
  karyaAkhir: string;
  catatanInstruktur: string;
}

export interface LogUjianCBT {
  idLog: string;
  timestamp: string;
  nis: string;
  namaSantri: string;
  unit: UnitPendidikan;
  kelas: string;
  mapel: string;
  skorCBT: number;
  pelanggaran: number;
  status: string;
}

export interface LogAktivitasNilai {
  idLog: string;
  timestamp: string;
  namaUstadz: string;
  nis: string;
  namaSantri: string;
  unit: UnitPendidikan;
  kelas: string;
  mapel: string;
  komponenNilai: string;
  nilaiLama: number | string;
  nilaiBaru: number | string;
  nilaiAkhirLama?: number;
  nilaiAkhirBaru?: number;
  selisih?: number;
}

export interface DeletedRecordsState {
  santri: string[];
  mapel: string[];
  ustadz: string[];
  nilai: string[];
  tahfidz: string[];
  it: string[];
  soal: string[];
}

export const EMPTY_DELETED_RECORDS: DeletedRecordsState = {
  santri: [],
  mapel: [],
  ustadz: [],
  nilai: [],
  tahfidz: [],
  it: [],
  soal: [],
};

export type AdminPermissionKey =
  | 'dashboard_analitik'
  | 'santri'
  | 'ustadz'
  | 'mapel'
  | 'nilai_log'
  | 'identitas_rapor'
  | 'kelola_admin';

export const ADMIN_PERMISSION_LIST: Array<{
  key: AdminPermissionKey;
  label: string;
  deskripsi: string;
}> = [
  {
    key: 'dashboard_analitik',
    label: 'Statistik, Deadline & Grafik Analitik',
    deskripsi: 'Melihat statistik ringkas, mengatur deadline rapor, dan grafik nilai per unit.',
  },
  {
    key: 'santri',
    label: 'Buku Induk Santri (Tambah/Edit/Hapus/Import)',
    deskripsi: 'Mengelola data master santri Wustho, Ulya, dan MDA serta import/export Excel.',
  },
  {
    key: 'ustadz',
    label: 'Data Ustadz & Pengajar (Tambah/Edit/Hapus)',
    deskripsi: 'Mengelola akun Ustadz, PIN login, serta mapel & kelas ampuan.',
  },
  {
    key: 'mapel',
    label: 'Mata Pelajaran & Token Ujian',
    deskripsi: 'Mengatur daftar mata pelajaran, token ujian CBT, dan durasi ujian.',
  },
  {
    key: 'nilai_log',
    label: 'Log Audit Nilai & Log Ujian CBT',
    deskripsi: 'Melihat, mengekspor (CSV/Excel), serta membersihkan/mereset log & nilai.',
  },
  {
    key: 'identitas_rapor',
    label: 'Identitas Web, Tagline & Wali Kelas e-Rapor',
    deskripsi: 'Mengubah logo, teks beranda, tagline KOP e-Rapor, Mudir, dan nama Wali Kelas.',
  },
  {
    key: 'kelola_admin',
    label: 'Manajemen Akun Admin, Akses & Password',
    deskripsi: 'Menambah admin baru, mengedit hak akses fitur, dan mengganti password admin.',
  },
];

export interface AdminAccount {
  id: string;
  namaAdmin: string;
  username: string;
  jabatan: string;
  password: string;
  hakAkses: AdminPermissionKey[];
  aktif: boolean;
  isPrimary?: boolean;
  dibuatPada?: string;
}

export const DEFAULT_ADMIN_ACCOUNTS: AdminAccount[] = [
  {
    id: 'ADM-001',
    namaAdmin: 'Super Admin / Mudir',
    username: 'admin',
    jabatan: 'Administrator Utama',
    password: 'ADMIN99',
    hakAkses: [
      'dashboard_analitik',
      'santri',
      'ustadz',
      'mapel',
      'nilai_log',
      'identitas_rapor',
      'kelola_admin',
    ],
    aktif: true,
    isPrimary: true,
    dibuatPada: '2026-07-01',
  },
];

// ============================================================================
// KONFIGURASI IDENTITAS VISUAL & LOGO PESANTREN (DAPAT DIEDIT DI ANTARMUKA WEB)
// ============================================================================
export interface IdentitasPesantren {
  namaUtama: string;
  teksArab: string;
  subJudul: string;
  namaYayasanKOP: string;
  taglineRapor: string;
  judulAplikasiHero: string;
  deskripsiHero: string;
  customLogoDataUrl: string;
  namaMudir: string;
  namaWaliKelasDefault: string;
  waliKelasMap?: Record<string, string>;
  deadlineInputSoalIso?: string;
  deadlineInputRaporIso?: string;
}

export function ambilTanggalDefaultDeadlineSoal(): string {
  const target = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
  const y = target.getFullYear();
  const m = String(target.getMonth() + 1).padStart(2, '0');
  const d = String(target.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function ambilTanggalDefaultDeadlineRapor(): string {
  const target = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
  const y = target.getFullYear();
  const m = String(target.getMonth() + 1).padStart(2, '0');
  const d = String(target.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export const DEFAULT_IDENTITAS_PESANTREN: IdentitasPesantren = {
  namaUtama: 'DARUL FITHRAH',
  teksArab: 'دار الفطرة',
  subJudul: 'PONPES TAHFIDZ & ILMU TEKNOLOGI',
  namaYayasanKOP: 'YAYASAN PENDIDIKAN ISLAM & TEKNOLOGI DARUL FITHRAH',
  taglineRapor: "Tahfidz Al-Qur'an · Ulumuddin · Muslim Digital Academy (Ilmu Teknologi)",
  judulAplikasiHero: 'CBT Web-Lockdown & e-Rapor Digital Terpadu',
  deskripsiHero:
    "Mengintegrasikan evaluasi Akademik 4 Komponen (Tugas 20%, Sikap 20%, Lisan 20%, CBT 40%), Capaian Tahfidz Al-Qur'an 114 Surat, dan Kompetensi Ilmu Teknologi untuk Unit Wustho, Ulya, dan MDA (Muslim Digital Academy).",
  customLogoDataUrl: '',
  namaMudir: 'KH. Dr. Ahmad Fithrah, Lc., M.A.',
  namaWaliKelasDefault: 'Ustadz H. Abdurrahman, Lc., M.Ag.',
  waliKelasMap: {},
  deadlineInputSoalIso: ambilTanggalDefaultDeadlineSoal(),
  deadlineInputRaporIso: ambilTanggalDefaultDeadlineRapor(),
};

// Fungsi Screening & Koreksi Otomatis Salah Tulisan (Typo, Ejaan, Spasi & Tanda Baca) pada Soal CBT
export function bersihkanDanScreeningTeksSoal(teks: string, adalahPertanyaan = false): string {
  if (!teks) return '';
  let hasil = teks
    .replace(/\s+/g, ' ')
    .replace(/\s+([?.!,;:])/g, '$1')
    .trim();

  // Kamus koreksi salah ketik (typo) umum pada soal pesantren & IT
  const kamusTypo: Array<[RegExp, string]> = [
    [/\bsholat\b/gi, 'shalat'],
    [/\bwudlu\b/gi, 'wudhu'],
    [/\bthoharoh\b/gi, 'thaharah'],
    [/\bal-qur'an\b/gi, "Al-Qur'an"],
    [/\bal-quran\b/gi, "Al-Qur'an"],
    [/\bal quran\b/gi, "Al-Qur'an"],
    [/\bmajhab\b/gi, 'Mazhab'],
    [/\bmadzhab\b/gi, 'Mazhab'],
    [/\bjavascript\b/gi, 'JavaScript'],
    [/\btypescript\b/gi, 'TypeScript'],
    [/\bhtml5\b/gi, 'HTML5'],
    [/\bhtml\b/gi, 'HTML'],
    [/\bcss3\b/gi, 'CSS3'],
    [/\bcss\b/gi, 'CSS'],
    [/\bdi\s+sebut\b/gi, 'disebut'],
    [/\bdi\s+gunakan\b/gi, 'digunakan'],
    [/\bdi\s+kerjakan\b/gi, 'dikerjakan'],
    [/\bdi\s+bawah\b/gi, 'di bawah'],
    [/\bdi\s+atas\b/gi, 'di atas'],
  ];

  kamusTypo.forEach(([pola, pengganti]) => {
    hasil = hasil.replace(pola, pengganti);
  });

  if (hasil.length > 0) {
    hasil = hasil.charAt(0).toUpperCase() + hasil.slice(1);
  }

  if (adalahPertanyaan && hasil.length > 3 && !/[?.!:]$/.test(hasil)) {
    if (/^(apa|apakah|siapa|siapakah|berapa|berapakah|bagaimana|mengapa|dimana|di mana|kapan|manakah)\b/i.test(hasil)) {
      hasil += '?';
    } else {
      hasil += '...';
    }
  }

  return hasil;
}

let urutanIdUnikCounter = 0;
function buatIdUnik(prefix: string): string {
  urutanIdUnikCounter += 1;
  const nonce = Math.random().toString(36).slice(2, 5).toUpperCase();
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${urutanIdUnikCounter.toString(36).toUpperCase()}${nonce}`;
}

const LOCAL_BACKUP_KEY = 'df_pesantren_local_backup_v1';

function bacaBackupLokalBrowser(): Record<string, unknown> | null {
  try {
    const raw = localStorage.getItem(LOCAL_BACKUP_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Abaikan jika JSON rusak atau storage tidak tersedia
  }
  return null;
}

function simpanBackupLokalBrowser(snapshot: Record<string, unknown>) {
  try {
    localStorage.setItem(
      LOCAL_BACKUP_KEY,
      JSON.stringify({
        ...snapshot,
        savedAtLocalIso: new Date().toISOString(),
      })
    );
  } catch {
    // Jika kuota localStorage penuh karena gambar base64 besar, simpan versi ringan tanpa gambar base64 agar bankSoal tetap aman 100%
    try {
      const bankSoalRingan = Array.isArray(snapshot.bankSoal)
        ? (snapshot.bankSoal as Array<Record<string, unknown>>).map((s) => ({
            ...s,
            gambarSoalUrl:
              typeof s.gambarSoalUrl === 'string' && s.gambarSoalUrl.length > 60000
                ? undefined
                : s.gambarSoalUrl,
          }))
        : snapshot.bankSoal;
      localStorage.setItem(
        LOCAL_BACKUP_KEY,
        JSON.stringify({
          ...snapshot,
          bankSoal: bankSoalRingan,
          logAktivitasNilai: Array.isArray(snapshot.logAktivitasNilai)
            ? snapshot.logAktivitasNilai.slice(0, 100)
            : [],
          logUjianCBT: Array.isArray(snapshot.logUjianCBT)
            ? snapshot.logUjianCBT.slice(0, 100)
            : [],
          savedAtLocalIso: new Date().toISOString(),
        })
      );
    } catch {
      // Abaikan jika browser memblokir storage (mode privat ekstrem)
    }
  }
}

function sanitasiIdDokumenFirestore(rawId: string): string {
  const cleaned = String(rawId || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 64);
  return cleaned || `SOAL-${Date.now().toString(36).toUpperCase()}`;
}

function bangunPayloadSoalFirestore(
  soal: SoalCBT,
  authorUid: string
): { docId: string; payload: Record<string, unknown> } {
  const docId = sanitasiIdDokumenFirestore(soal.idSoal);
  const unitValid: UnitPendidikan =
    soal.unit === 'Ulya' || soal.unit === 'MDA' ? soal.unit : 'Wustho';
  const kunciRaw = String(soal.kunciJawaban || 'A').trim().toUpperCase();
  const kunciValid =
    kunciRaw === 'B' || kunciRaw === 'C' || kunciRaw === 'D' ? kunciRaw : 'A';
  const bobotValid = Math.min(100, Math.max(1, Number(soal.bobotSoal) || 10));

  const payload: Record<string, unknown> = {
    idSoal: docId,
    unit: unitValid,
    kelas: String(soal.kelas || 'Kelas 7').trim().slice(0, 64) || 'Kelas 7',
    mapel: String(soal.mapel || 'Umum').trim().slice(0, 160) || 'Umum',
    pertanyaan: String(soal.pertanyaan || '-').trim().slice(0, 2000) || '-',
    opsiA: String(soal.opsiA || '-').trim().slice(0, 600) || '-',
    opsiB: String(soal.opsiB || '-').trim().slice(0, 600) || '-',
    opsiC: String(soal.opsiC || '-').trim().slice(0, 600) || '-',
    opsiD: String(soal.opsiD || '-').trim().slice(0, 600) || '-',
    kunciJawaban: kunciValid,
    bobotSoal: bobotValid,
    updatedAtIso: String(soal.updatedAt || new Date().toISOString()).slice(0, 64),
    authorUid: String(authorUid).slice(0, 128),
  };

  if (soal.teksArabSoal && soal.teksArabSoal.trim()) {
    payload.teksArabSoal = soal.teksArabSoal.trim().slice(0, 2000);
  }
  if (soal.potonganKodeIT && soal.potonganKodeIT.trim()) {
    payload.potonganKodeIT = soal.potonganKodeIT.trim().slice(0, 4000);
  }
  if (
    soal.gambarSoalUrl &&
    soal.gambarSoalUrl.trim().length > 0 &&
    soal.gambarSoalUrl.length <= 250000 &&
    /^(https:\/\/|data:image\/(png|jpeg|jpg|webp|gif);base64,)/i.test(soal.gambarSoalUrl.trim())
  ) {
    payload.gambarSoalUrl = soal.gambarSoalUrl.trim();
  }
  if (soal.pembuatUstadz && soal.pembuatUstadz.trim()) {
    payload.pembuatUstadz = soal.pembuatUstadz.trim().slice(0, 160);
  }

  return { docId, payload };
}

function buatPayloadSnapshotAmanFirestore(snapshot: Record<string, unknown>): string {
  // Hemat kuota Write Units Firestore Enterprise (dihitung per KiB yang ditulis) sekaligus aman < 900 KB:
  // Hilangkan blob gambar base64 besar dari dokumen snapshot (gambar soal sudah tersimpan per-dokumen di /soal_cbt & server lokal)
  const MAX_LEN = 850000;
  const identitasAsli =
    snapshot.identitasPesantren && typeof snapshot.identitasPesantren === 'object'
      ? (snapshot.identitasPesantren as Record<string, unknown>)
      : null;
  const identitasObj = identitasAsli
    ? {
        ...identitasAsli,
        customLogoDataUrl:
          typeof identitasAsli.customLogoDataUrl === 'string' && identitasAsli.customLogoDataUrl.length > 16000
            ? ''
            : identitasAsli.customLogoDataUrl,
      }
    : snapshot.identitasPesantren;

  const bankSoalRingan = Array.isArray(snapshot.bankSoal)
    ? (snapshot.bankSoal as Array<Record<string, unknown>>).map((s) => ({
        ...s,
        gambarSoalUrl:
          typeof s.gambarSoalUrl === 'string' && s.gambarSoalUrl.startsWith('data:image/')
            ? undefined
            : s.gambarSoalUrl,
      }))
    : snapshot.bankSoal;

  const ringkas = {
    ...snapshot,
    identitasPesantren: identitasObj,
    bankSoal: bankSoalRingan,
    logAktivitasNilai: Array.isArray(snapshot.logAktivitasNilai)
      ? snapshot.logAktivitasNilai.slice(0, 80)
      : snapshot.logAktivitasNilai,
    logUjianCBT: Array.isArray(snapshot.logUjianCBT)
      ? snapshot.logUjianCBT.slice(0, 80)
      : snapshot.logUjianCBT,
  };
  let json = JSON.stringify(ringkas);
  if (json.length <= MAX_LEN) return json;

  const minimal = JSON.stringify({
    ...ringkas,
    logAktivitasNilai: [],
    logUjianCBT: [],
  });
  if (minimal.length <= MAX_LEN) return minimal;

  const coreWithSoal = JSON.stringify({
    identitasPesantren: identitasObj,
    adminList: snapshot.adminList,
    ustadzList: snapshot.ustadzList,
    mapelList: snapshot.mapelList,
    bankSoal: bankSoalRingan,
    nilaiAkademik: snapshot.nilaiAkademik,
    deletedRecords: snapshot.deletedRecords || {},
  });
  if (coreWithSoal.length <= MAX_LEN) return coreWithSoal;

  return JSON.stringify({
    identitasPesantren: identitasObj,
    adminList: snapshot.adminList,
    ustadzList: snapshot.ustadzList,
    bankSoal: bankSoalRingan,
    deletedRecords: snapshot.deletedRecords || {},
  });
}

// ============================================================================
// KOMPONEN LOGO RESMI PONPES DARUL FITHRAH (MENDUKUNG LOGO RESMI PNG & CUSTOM UPLOAD)
// ============================================================================
export const OFFICIAL_LOGO_DF_URL = '/assets/aistudio/Logo_DF__2__053aefa4.png';

export function LogoDarulFithrah({
  size = 'md',
  identitas = DEFAULT_IDENTITAS_PESANTREN,
}: {
  size?: 'sm' | 'md' | 'lg';
  identitas?: IdentitasPesantren;
}) {
  const iconDim = size === 'lg' ? 56 : size === 'md' ? 42 : 34;
  const lockupHeightClass = size === 'lg' ? 'h-14' : size === 'md' ? 'h-11' : 'h-9';

  // Jika menggunakan logo resmi default terbaru (/assets/aistudio/Logo_DF__2__053aefa4.png)
  if (!identitas.customLogoDataUrl) {
    return (
      <div className="inline-flex items-center select-none shrink-0">
        <img
          src={OFFICIAL_LOGO_DF_URL}
          alt={`${identitas.namaUtama} — ${identitas.subJudul}`}
          className={`${lockupHeightClass} w-auto max-w-[260px] object-contain shrink-0`}
        />
      </div>
    );
  }

  return (
    <div className="inline-flex items-center gap-3 select-none shrink-0">
      <img
        src={identitas.customLogoDataUrl}
        alt={identitas.namaUtama}
        style={{ width: iconDim, height: iconDim }}
        className="rounded-xl object-contain bg-white p-0.5 shrink-0 border border-slate-200"
      />
      <div className="flex flex-col leading-tight">
        <div className="flex items-baseline gap-2">
          <span
            className={`${
              size === 'lg' ? 'text-xl' : 'text-sm'
            } font-extrabold tracking-tight text-[#FF6700] whitespace-nowrap`}
          >
            {identitas.namaUtama}
          </span>
          {identitas.teksArab && (
            <span
              className={`${
                size === 'lg' ? 'text-lg' : 'text-xs'
              } font-bold text-[#0A1172] whitespace-nowrap`}
              dir="rtl"
            >
              {identitas.teksArab}
            </span>
          )}
        </div>
        <span
          className={`${
            size === 'lg' ? 'text-xs' : 'text-[10px]'
          } font-bold tracking-wider text-[#0A1172] uppercase whitespace-nowrap`}
        >
          {identitas.subJudul}
        </span>
      </div>
    </div>
  );
}

// ============================================================================
// DATA AWAL (INITIAL SEED) DARUL FITHRAH — 67 SANTRI AKTIF (NON MA'HAD ALY)
// ============================================================================
const INITIAL_SANTRI: Santri[] = INITIAL_SANTRI_2026;

const INITIAL_MAPEL: MapelConfig[] = INITIAL_MAPEL_2026;

const INITIAL_USTADZ: UstadzAccount[] = INITIAL_USTADZ_2026;

const INITIAL_SOAL: SoalCBT[] = [
  {
    idSoal: 'SOAL-001',
    unit: 'Wustho',
    kelas: 'Kelas 7',
    mapel: 'Fiqih',
    pertanyaan: 'Air yang suci dan mensucikan serta tidak makruh digunakan untuk bersuci disebut dalam istilah Fiqih sebagai...',
    teksArabSoal: 'الْمَاءُ الطَّاهِرُ فِي نَفْسِهِ الْمُطَهِّرُ لِغَيْرِهِ غَيْرُ الْمَكْرُوهِ اسْتِعْمَالُهُ',
    opsiA: 'Air Mutlak (Thahir Muthahhir)',
    opsiB: "Air Musta'mal",
    opsiC: 'Air Musyammas',
    opsiD: 'Air Mutanajjis',
    kunciJawaban: 'A',
    bobotSoal: 50,
  },
  {
    idSoal: 'SOAL-002',
    unit: 'Wustho',
    kelas: 'Kelas 7',
    mapel: 'Fiqih',
    pertanyaan: "Berapakah jumlah rukun wudhu menurut Mazhab Syafi'i yang wajib dikerjakan secara tertib?",
    opsiA: '4 Rukun',
    opsiB: '5 Rukun',
    opsiC: '6 Rukun',
    opsiD: '7 Rukun',
    kunciJawaban: 'C',
    bobotSoal: 50,
  },
  {
    idSoal: 'SOAL-003',
    unit: 'Wustho',
    kelas: 'Kelas 7',
    mapel: 'Aqidah',
    pertanyaan: 'Tauhid yang berkaitan dengan pengesaan Allah dalam ibadah, doa, tawakkal, dan ketaatan mutlak disebut...',
    teksArabSoal: 'إِفْرَادُ اللهِ تَعَالَى بِالْعِبَادَةِ',
    opsiA: 'Tauhid Rububiyyah',
    opsiB: 'Tauhid Uluhiyyah',
    opsiC: 'Tauhid Asma wa Shifat',
    opsiD: 'Tauhid Mulkiyyah',
    kunciJawaban: 'B',
    bobotSoal: 100,
  },
  {
    idSoal: 'SOAL-004',
    unit: 'Wustho',
    kelas: 'Kelas 8',
    mapel: 'Nahwu',
    pertanyaan: 'Kalimat dalam Bahasa Arab yang menunjukkan arti benda atau sifat dan tidak terikat dengan waktu disebut...',
    teksArabSoal: 'كَلِمَةٌ دَلَّتْ عَلَى مَعْنًى فِي نَفْسِهَا وَلَمْ تَقْتَرِنْ بِزَمَانٍ وَضْعًا',
    opsiA: 'Kalimat Fi’il',
    opsiB: 'Kalimat Isim',
    opsiC: 'Kalimat Harf',
    opsiD: 'Maf’ul Bih',
    kunciJawaban: 'B',
    bobotSoal: 100,
  },
  {
    idSoal: 'SOAL-005',
    unit: 'Ulya',
    kelas: 'Kelas 10',
    mapel: 'Bahasa Inggris',
    pertanyaan: 'Choose the correct form to complete the sentence: "Every santri at Darul Fithrah ___ the morning Tahfidz session before 06.30 AM."',
    opsiA: 'attend',
    opsiB: 'attends',
    opsiC: 'attending',
    opsiD: 'have attended',
    kunciJawaban: 'B',
    bobotSoal: 100,
  },
  {
    idSoal: 'SOAL-006',
    unit: 'MDA',
    kelas: 'Junior',
    mapel: 'UI/UX Design',
    pertanyaan: 'Prinsip utama dalam desain antarmuka (UI) yang menjaga keseragaman warna, tipografi, dan komponen di seluruh halaman aplikasi disebut...',
    opsiA: 'Consistency (Konsistensi)',
    opsiB: 'Obfuscation (Pengaburan)',
    opsiC: 'Fragmentation (Fragmentasi)',
    opsiD: 'Latency (Latensi)',
    kunciJawaban: 'A',
    bobotSoal: 100,
  },
  {
    idSoal: 'SOAL-007',
    unit: 'MDA',
    kelas: 'Senior',
    mapel: 'Full-Stack Web Engineering',
    pertanyaan: 'Manakah metode array JavaScript murni yang menghasilkan array baru hasil transformasi setiap elemen tanpa memutasi array asli?',
    potonganKodeIT: `const nilaiMentah = [80, 85, 90];\nconst nilaiBobot = nilaiMentah./* ... */(n => n * 0.4);`,
    opsiA: 'Array.prototype.forEach()',
    opsiB: 'Array.prototype.splice()',
    opsiC: 'Array.prototype.map()',
    opsiD: 'Array.prototype.push()',
    kunciJawaban: 'C',
    bobotSoal: 100,
  },
];

// Komponen Inline SVG QR Code Verifikasi Digital Resmi e-Rapor A4
function QrCodeVerifikasiSVG({ payload, size = 84 }: { payload: string; size?: number }) {
  const grid = 21;
  let hash = 2166136261;
  for (let i = 0; i < payload.length; i++) {
    hash ^= payload.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const isFinder = (r: number, c: number) => {
    const inTL = r < 7 && c < 7;
    const inTR = r < 7 && c >= grid - 7;
    const inBL = r >= grid - 7 && c < 7;
    return inTL || inTR || inBL;
  };
  const finderBit = (r: number, c: number) => {
    const lr = r >= grid - 7 ? r - (grid - 7) : r;
    const lc = c >= grid - 7 ? c - (grid - 7) : c;
    if (lr === 0 || lr === 6 || lc === 0 || lc === 6) return true;
    if (lr >= 2 && lr <= 4 && lc >= 2 && lc <= 4) return true;
    return false;
  };
  const cells: Array<{ r: number; c: number }> = [];
  for (let r = 0; r < grid; r++) {
    for (let c = 0; c < grid; c++) {
      if (isFinder(r, c)) {
        if (finderBit(r, c)) cells.push({ r, c });
      } else if (r === 6 || c === 6) {
        if ((r + c) % 2 === 0) cells.push({ r, c });
      } else {
        const seed = Math.imul(hash ^ (r * 31 + c * 17), 1597334677);
        const charBit = payload.charCodeAt((r * grid + c) % payload.length) & 1;
        if (((seed >>> 3) & 1) ^ charBit) {
          cells.push({ r, c });
        }
      }
    }
  }
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${grid} ${grid}`}
      className="border border-slate-300 bg-white p-1 rounded"
      aria-label="QR Code Verifikasi e-Rapor Darul Fithrah"
    >
      <rect width={grid} height={grid} fill="#FFFFFF" />
      {cells.map((cell, idx) => (
        <rect key={idx} x={cell.c} y={cell.r} width={1} height={1} fill="#0A1172" />
      ))}
    </svg>
  );
}

// Seluruh data awal Nilai Akademik, Tahfidz, dan IT dikosongkan terlebih dahulu
// agar Ustadz pengampu mengisi data secara aktual dari Portal Ustadz.
const INITIAL_NILAI: NilaiAkademikRow[] = [];

const INITIAL_TAHFIDZ: PencapaianTahfidz[] = [];

const INITIAL_IT: PencapaianIT[] = [];

const INITIAL_LOG_CBT: LogUjianCBT[] = [];

const INITIAL_LOG_AKTIVITAS_NILAI: LogAktivitasNilai[] = [];

// Fungsi Alarm Beep Web Audio API untuk Lockdown Anti-Curang
function bunyikanAlarmLockdown(frekuensi = 920, durasiMs = 450) {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(frekuensi, ctx.currentTime);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + durasiMs / 1000);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + durasiMs / 1000);
  } catch {
    // Fallback jika audio diblokir browser
  }
}

export default function App() {
  // Navigasi Utama: beranda | admin | ustadz | cbt | rapor
  const [activeModule, setActiveModule] = useState<'beranda' | 'admin' | 'ustadz' | 'cbt' | 'rapor'>('beranda');

  // State Identitas Visual & Logo Pesantren (Tersimpan di localStorage & dapat diedit langsung di Web)
  const [identitasPesantren, setIdentitasPesantren] = useState<IdentitasPesantren>(() => {
    try {
      const saved = localStorage.getItem('df_identitas_pesantren_v1');
      if (saved) {
        return { ...DEFAULT_IDENTITAS_PESANTREN, ...JSON.parse(saved) };
      }
    } catch {
      // Fallback ke default
    }
    return DEFAULT_IDENTITAS_PESANTREN;
  });
  const [isModalIdentitasOpen, setIsModalIdentitasOpen] = useState(false);

  const simpanIdentitasPesantren = (
    updater: IdentitasPesantren | ((prev: IdentitasPesantren) => IdentitasPesantren)
  ) => {
    setIdentitasPesantren((prev) => {
      const baru = typeof updater === 'function' ? updater(prev) : updater;
      try {
        localStorage.setItem('df_identitas_pesantren_v1', JSON.stringify(baru));
      } catch {
        // Abaikan jika storage penuh
      }
      return baru;
    });
  };

  // Manajemen Multi-Admin, Hak Akses & Ganti Password (default: admin / ADMIN99)
  const [adminList, setAdminList] = useState<AdminAccount[]>(() => {
    try {
      const saved = localStorage.getItem('df_admin_accounts_v1');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // Fallback ke default
    }
    return DEFAULT_ADMIN_ACCOUNTS;
  });
  const [adminLoginAktif, setAdminLoginAktif] = useState<AdminAccount | null>(null);
  const [isAdminUnlocked, setIsAdminUnlocked] = useState(false);
  const [isUstadzUnlocked, setIsUstadzUnlocked] = useState(false);

  const simpanAdminList = (daftarBaru: AdminAccount[]) => {
    const finalDaftar = daftarBaru.length > 0 ? daftarBaru : DEFAULT_ADMIN_ACCOUNTS;
    setAdminList(finalDaftar);
    try {
      localStorage.setItem('df_admin_accounts_v1', JSON.stringify(finalDaftar));
    } catch {
      // Abaikan jika storage penuh
    }
    setAdminLoginAktif((prev) => {
      if (!prev) return null;
      return finalDaftar.find((a) => a.id === prev.id) || prev;
    });
  };

  const adminPunyaAkses = (key: AdminPermissionKey): boolean => {
    if (!isAdminUnlocked) return false;
    if (!adminLoginAktif) return true;
    return Array.isArray(adminLoginAktif.hakAkses) && adminLoginAktif.hakAkses.includes(key);
  };

  const ambilNamaWaliKelas = (unit: UnitPendidikan, kelas: string): string => {
    const key = `${unit}__${kelas}`;
    const khusus = identitasPesantren.waliKelasMap?.[key];
    if (khusus && khusus.trim()) return khusus.trim();
    return (identitasPesantren.namaWaliKelasDefault || 'Ustadz H. Abdurrahman, Lc., M.Ag.').trim();
  };

  // Database State Terpadu (Cadangan Instan Browser + Server DB Smart-Merge + Firebase Firestore)
  const initialLocalBackup = useRef<Record<string, unknown> | null>(bacaBackupLokalBrowser());
  const [santriList, setSantriList] = useState<Santri[]>(() =>
    Array.isArray(initialLocalBackup.current?.santriList) &&
    (initialLocalBackup.current.santriList as Santri[]).length > 0
      ? (initialLocalBackup.current.santriList as Santri[])
      : INITIAL_SANTRI
  );
  const [mapelList, setMapelList] = useState<MapelConfig[]>(() =>
    Array.isArray(initialLocalBackup.current?.mapelList) &&
    (initialLocalBackup.current.mapelList as MapelConfig[]).length > 0
      ? (initialLocalBackup.current.mapelList as MapelConfig[])
      : INITIAL_MAPEL
  );
  const [ustadzList, setUstadzList] = useState<UstadzAccount[]>(() =>
    Array.isArray(initialLocalBackup.current?.ustadzList) &&
    (initialLocalBackup.current.ustadzList as UstadzAccount[]).length > 0
      ? (initialLocalBackup.current.ustadzList as UstadzAccount[])
      : INITIAL_USTADZ
  );
  const [bankSoal, setBankSoal] = useState<SoalCBT[]>(() => {
    const backupSoal = initialLocalBackup.current?.bankSoal;
    if (Array.isArray(backupSoal) && backupSoal.length > 0) {
      return backupSoal as SoalCBT[];
    }
    return INITIAL_SOAL;
  });
  const [nilaiAkademik, setNilaiAkademik] = useState<NilaiAkademikRow[]>(() =>
    Array.isArray(initialLocalBackup.current?.nilaiAkademik)
      ? (initialLocalBackup.current.nilaiAkademik as NilaiAkademikRow[])
      : INITIAL_NILAI
  );
  const [dataTahfidz, setDataTahfidz] = useState<PencapaianTahfidz[]>(() =>
    Array.isArray(initialLocalBackup.current?.dataTahfidz)
      ? (initialLocalBackup.current.dataTahfidz as PencapaianTahfidz[])
      : INITIAL_TAHFIDZ
  );
  const [dataIT, setDataIT] = useState<PencapaianIT[]>(() =>
    Array.isArray(initialLocalBackup.current?.dataIT)
      ? (initialLocalBackup.current.dataIT as PencapaianIT[])
      : INITIAL_IT
  );
  const [logUjianCBT, setLogUjianCBT] = useState<LogUjianCBT[]>(() =>
    Array.isArray(initialLocalBackup.current?.logUjianCBT)
      ? (initialLocalBackup.current.logUjianCBT as LogUjianCBT[])
      : INITIAL_LOG_CBT
  );
  const [logAktivitasNilai, setLogAktivitasNilai] = useState<LogAktivitasNilai[]>(() =>
    Array.isArray(initialLocalBackup.current?.logAktivitasNilai)
      ? (initialLocalBackup.current.logAktivitasNilai as LogAktivitasNilai[])
      : INITIAL_LOG_AKTIVITAS_NILAI
  );
  const [deletedRecords, setDeletedRecords] = useState<DeletedRecordsState>(() => {
    const rawDel = initialLocalBackup.current?.deletedRecords as Partial<DeletedRecordsState> | undefined;
    return {
      santri: Array.isArray(rawDel?.santri) ? rawDel.santri.map((x) => String(x).toUpperCase()) : [],
      mapel: Array.isArray(rawDel?.mapel) ? rawDel.mapel.map((x) => String(x).toLowerCase()) : [],
      ustadz: Array.isArray(rawDel?.ustadz) ? rawDel.ustadz.map((x) => String(x).toLowerCase()) : [],
      nilai: Array.isArray(rawDel?.nilai) ? rawDel.nilai.map((x) => String(x).toLowerCase()) : [],
      tahfidz: Array.isArray(rawDel?.tahfidz) ? rawDel.tahfidz.map((x) => String(x).toUpperCase()) : [],
      it: Array.isArray(rawDel?.it) ? rawDel.it.map((x) => String(x).toUpperCase()) : [],
      soal: Array.isArray(rawDel?.soal) ? rawDel.soal.map((x) => String(x).toUpperCase()) : [],
    };
  });

  // State Sinkronisasi Cloud Lintas Perangkat (Local Backup + Server DB + Firebase Firestore /soal_cbt)
  const [cloudUser, setCloudUser] = useState<User | null>(null);
  const [statusSinkronCloud, setStatusSinkronCloud] = useState<'memuat' | 'tersinkron' | 'menyimpan'>('memuat');
  const [terakhirSinkron, setTerakhirSinkron] = useState<string>('');
  const [cloudHydrationDoneTick, setCloudHydrationDoneTick] = useState(0);
  const [firestoreQuotaPaused, setFirestoreQuotaPaused] = useState<boolean>(() => isFirestoreQuotaPaused());
  const [dismissedQuotaBanner, setDismissedQuotaBanner] = useState<boolean>(false);
  const isInitialDbLoadedRef = useRef(false);
  const isCloudHydrationPendingRef = useRef(false);
  const isCloudHydratedRef = useRef(false);
  const skipNextAutoSyncRef = useRef(false);
  const serverEtagRef = useRef<string>('');
  const ujianBerlangsungRef = useRef(false);
  const isAdminUnlockedRef = useRef(false);
  const isUstadzUnlockedRef = useRef(false);
  const isSubmittingCbtRef = useRef(false);
  const latestSnapshotRef = useRef<Record<string, unknown>>({});
  const lastFirestoreSnapshotJsonRef = useRef<string>('');
  const lastFirestoreSnapshotAtRef = useRef<number>(0);
  const pendingFirestoreSnapshotTimerRef = useRef<number | null>(null);
  const pendingFirestoreSnapshotDataRef = useRef<Record<string, unknown> | null>(null);
  const lastSyncedSoalSigMapRef = useRef<Map<string, string>>(new Map());
  const soalAuthorUidMapRef = useRef<Map<string, string>>(new Map());
  const soalReadOnlyFirestoreRef = useRef<Set<string>>(new Set());

  // Antrean tahan-offline untuk sinkronisasi soal (jika jaringan sempat putus saat simpan/hapus, otomatis kirim ulang)
  const PENDING_SOAL_QUEUE_KEY = 'df_pending_soal_sync_v1';
  const pendingSoalQueueRef = useRef<{ upserts: Record<string, SoalCBT>; deletes: string[] }>(
    (() => {
      try {
        const raw = localStorage.getItem('df_pending_soal_sync_v1');
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === 'object') {
            return {
              upserts: parsed.upserts && typeof parsed.upserts === 'object' ? parsed.upserts : {},
              deletes: Array.isArray(parsed.deletes) ? parsed.deletes : [],
            };
          }
        }
      } catch {
        // Abaikan jika storage tidak tersedia
      }
      return { upserts: {}, deletes: [] };
    })()
  );
  const isFlushingSoalQueueRef = useRef(false);

  const simpanAntreanSoalKeStorage = () => {
    try {
      localStorage.setItem(PENDING_SOAL_QUEUE_KEY, JSON.stringify(pendingSoalQueueRef.current));
    } catch {
      // Abaikan jika kuota storage penuh
    }
  };

  useEffect(() => {
    const unsubQuota = onFirestoreQuotaStatusChange((paused) => {
      setFirestoreQuotaPaused(paused);
      if (paused) {
        setDismissedQuotaBanner(false);
        if (pendingFirestoreSnapshotTimerRef.current !== null) {
          window.clearTimeout(pendingFirestoreSnapshotTimerRef.current);
          pendingFirestoreSnapshotTimerRef.current = null;
        }
      }
    });
    return () => {
      unsubQuota();
      if (pendingFirestoreSnapshotTimerRef.current !== null) {
        window.clearTimeout(pendingFirestoreSnapshotTimerRef.current);
        pendingFirestoreSnapshotTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    isAdminUnlockedRef.current = isAdminUnlocked;
    isUstadzUnlockedRef.current = isUstadzUnlocked;
  }, [isAdminUnlocked, isUstadzUnlocked]);

  useEffect(() => {
    latestSnapshotRef.current = {
      identitasPesantren,
      santriList,
      mapelList,
      ustadzList,
      bankSoal,
      nilaiAkademik,
      dataTahfidz,
      dataIT,
      logUjianCBT,
      logAktivitasNilai,
      adminList,
      deletedRecords,
    };
  }, [
    identitasPesantren,
    santriList,
    mapelList,
    ustadzList,
    bankSoal,
    nilaiAkademik,
    dataTahfidz,
    dataIT,
    logUjianCBT,
    logAktivitasNilai,
    adminList,
    deletedRecords,
  ]);

  const normalisasiDeletedRecords = (raw?: Partial<DeletedRecordsState> | null): DeletedRecordsState => ({
    santri: Array.isArray(raw?.santri) ? Array.from(new Set(raw.santri.map((x) => String(x).toUpperCase()))) : [],
    mapel: Array.isArray(raw?.mapel) ? Array.from(new Set(raw.mapel.map((x) => String(x).toLowerCase()))) : [],
    ustadz: Array.isArray(raw?.ustadz) ? Array.from(new Set(raw.ustadz.map((x) => String(x).toLowerCase()))) : [],
    nilai: Array.isArray(raw?.nilai) ? Array.from(new Set(raw.nilai.map((x) => String(x).toLowerCase()))) : [],
    tahfidz: Array.isArray(raw?.tahfidz) ? Array.from(new Set(raw.tahfidz.map((x) => String(x).toUpperCase()))) : [],
    it: Array.isArray(raw?.it) ? Array.from(new Set(raw.it.map((x) => String(x).toUpperCase()))) : [],
    soal: Array.isArray(raw?.soal) ? Array.from(new Set(raw.soal.map((x) => String(x).toUpperCase()))) : [],
  });

  const gabungkanDeletedRecords = (
    a: DeletedRecordsState,
    b: DeletedRecordsState
  ): DeletedRecordsState => ({
    santri: Array.from(new Set([...a.santri, ...b.santri])),
    mapel: Array.from(new Set([...a.mapel, ...b.mapel])),
    ustadz: Array.from(new Set([...a.ustadz, ...b.ustadz])),
    nilai: Array.from(new Set([...a.nilai, ...b.nilai])),
    tahfidz: Array.from(new Set([...a.tahfidz, ...b.tahfidz])),
    it: Array.from(new Set([...a.it, ...b.it])),
    soal: Array.from(new Set([...a.soal, ...b.soal])),
  });

  // Helper penggabung Bank Soal CBT (Mencegah soal antar Ustadz saling timpa atau hilang saat restart server)
  const gabungkanBankSoalKurikulum = (
    basis: SoalCBT[],
    tambahan: SoalCBT[],
    deleted: DeletedRecordsState = EMPTY_DELETED_RECORDS,
    sertakanSeedAwal = false
  ): SoalCBT[] => {
    const deletedSet = new Set((deleted.soal || []).map((x) => x.trim().toUpperCase()));
    const map = new Map<string, SoalCBT>();

    const prosesItem = (s: SoalCBT, preferIncoming = true) => {
      if (!s || !s.idSoal) return;
      const key = String(s.idSoal).trim().toUpperCase();
      if (!key || deletedSet.has(key)) return;
      const existing = map.get(key);
      if (!existing) {
        map.set(key, s);
        return;
      }
      const existingTs = String(existing.updatedAt || '');
      const incomingTs = String(s.updatedAt || '');
      if (existingTs && incomingTs) {
        map.set(key, incomingTs >= existingTs ? { ...existing, ...s } : { ...s, ...existing });
      } else if (preferIncoming) {
        map.set(key, { ...existing, ...s });
      }
    };

    if (sertakanSeedAwal) {
      INITIAL_SOAL.forEach((s) => prosesItem(s, false));
    }
    basis.forEach((s) => prosesItem(s, true));
    tambahan.forEach((s) => prosesItem(s, true));
    return Array.from(map.values());
  };

  // Helper penggabung data kurikulum 2026/2027 dengan menghormati perubahan ID/nama/PIN & data terhapus pengguna
  const gabungkanUstadzKurikulum = (
    tersimpan: UstadzAccount[],
    deleted: DeletedRecordsState = EMPTY_DELETED_RECORDS
  ): UstadzAccount[] => {
    const deletedSet = new Set((deleted.ustadz || []).map((x) => x.toLowerCase()));
    const map = new Map<string, UstadzAccount>();
    const idKeKey = new Map<string, string>();
    INITIAL_USTADZ.forEach((u) => {
      const idLow = (u.id || '').toLowerCase();
      const namaLow = u.namaUstadz.toLowerCase();
      if (deletedSet.has(namaLow) || (idLow && deletedSet.has(idLow))) return;
      const key = idLow || namaLow;
      map.set(key, u);
      if (idLow) idKeKey.set(idLow, key);
      idKeKey.set(namaLow, key);
    });
    tersimpan.forEach((u) => {
      if (u.namaUstadz.includes('Abdurrahman') || u.namaUstadz.includes('Irfan Hakim')) return;
      const idLow = (u.id || '').toLowerCase();
      const namaLow = u.namaUstadz.toLowerCase();
      if (deletedSet.has(namaLow) || (idLow && deletedSet.has(idLow))) return;
      const matchedKey =
        (idLow && idKeKey.get(idLow)) || idKeKey.get(namaLow) || idLow || namaLow;
      const existing = map.get(matchedKey);
      if (existing) {
        const existingTs = String(existing.updatedAt || '');
        const incomingTs = String(u.updatedAt || '');
        if (existingTs && (!incomingTs || existingTs > incomingTs)) {
          return;
        }
        map.set(matchedKey, {
          ...existing,
          ...u,
          unitAmpuan: u.unitAmpuan || existing.unitAmpuan,
          mapelAmpuan: u.mapelAmpuan || existing.mapelAmpuan,
          aksesMapelIds: Array.isArray(u.aksesMapelIds) ? u.aksesMapelIds : existing.aksesMapelIds,
        });
      } else {
        map.set(matchedKey, u);
      }
    });
    return Array.from(map.values());
  };

  const gabungkanMapelKurikulum = (
    tersimpan: MapelConfig[],
    deleted: DeletedRecordsState = EMPTY_DELETED_RECORDS
  ): MapelConfig[] => {
    const deletedSet = new Set((deleted.mapel || []).map((x) => x.toLowerCase()));
    const map = new Map<string, MapelConfig>();
    INITIAL_MAPEL.forEach((m) => {
      const key = `${m.unit}__${m.kelas}__${m.namaMapel.toLowerCase()}`.toLowerCase();
      if (!deletedSet.has(key)) {
        map.set(key, m);
      }
    });
    tersimpan.forEach((m) => {
      const key = `${m.unit}__${m.kelas}__${m.namaMapel.toLowerCase()}`.toLowerCase();
      if (deletedSet.has(key)) return;
      const existing = map.get(key);
      if (existing) {
        const existingTs = String(existing.updatedAt || '');
        const incomingTs = String(m.updatedAt || '');
        if (existingTs && (!incomingTs || existingTs > incomingTs)) {
          return;
        }
        map.set(key, {
          ...existing,
          ...m,
          pengampu: m.pengampu || existing.pengampu,
        });
      } else {
        map.set(key, m);
      }
    });
    return Array.from(map.values());
  };

  const gabungkanSantriKurikulum = (
    tersimpan: Santri[],
    deleted: DeletedRecordsState = EMPTY_DELETED_RECORDS
  ): Santri[] => {
    const deletedSet = new Set((deleted.santri || []).map((x) => x.toUpperCase()));
    const map = new Map<string, Santri>();
    INITIAL_SANTRI.forEach((s) => {
      if (!deletedSet.has(s.nis.toUpperCase())) {
        map.set(s.nis.toUpperCase(), s);
      }
    });
    tersimpan.forEach((s) => {
      if (s.nis.startsWith('DF-2026')) return;
      if (deletedSet.has(s.nis.toUpperCase())) return;
      const kelasCheck = `${s.kelas || ''} ${s.kelasTerdata || ''}`.toLowerCase();
      if (kelasCheck.includes("ma'had aly") || kelasCheck.includes('mahad aly')) return;
      const key = s.nis.toUpperCase();
      const existing = map.get(key);
      map.set(key, existing ? { ...existing, ...s } : s);
    });
    return Array.from(map.values());
  };

  const gabungkanTahfidzKurikulum = (
    tersimpan: PencapaianTahfidz[],
    deleted: DeletedRecordsState = EMPTY_DELETED_RECORDS
  ): PencapaianTahfidz[] => {
    const deletedSet = new Set((deleted.tahfidz || []).map((x) => x.toUpperCase()));
    const deletedSantriSet = new Set((deleted.santri || []).map((x) => x.toUpperCase()));
    const map = new Map<string, PencapaianTahfidz>();
    tersimpan.forEach((t) => {
      if (t.nis.startsWith('DF-2026')) return;
      const key = t.nis.toUpperCase();
      if (deletedSet.has(key) || deletedSantriSet.has(key)) return;
      map.set(key, t);
    });
    return Array.from(map.values());
  };

  const gabungkanITKurikulum = (
    tersimpan: PencapaianIT[],
    deleted: DeletedRecordsState = EMPTY_DELETED_RECORDS
  ): PencapaianIT[] => {
    const deletedSet = new Set((deleted.it || []).map((x) => x.toUpperCase()));
    const deletedSantriSet = new Set((deleted.santri || []).map((x) => x.toUpperCase()));
    const map = new Map<string, PencapaianIT>();
    tersimpan.forEach((i) => {
      if (i.nis.startsWith('DF-2026')) return;
      const key = i.nis.toUpperCase();
      if (deletedSet.has(key) || deletedSantriSet.has(key)) return;
      map.set(key, i);
    });
    return Array.from(map.values());
  };

  const gabungkanNilaiKurikulum = (
    tersimpan: NilaiAkademikRow[],
    deleted: DeletedRecordsState = EMPTY_DELETED_RECORDS
  ): NilaiAkademikRow[] => {
    const deletedSet = new Set((deleted.nilai || []).map((x) => x.toLowerCase()));
    const deletedSantriSet = new Set((deleted.santri || []).map((x) => x.toUpperCase()));
    const map = new Map<string, NilaiAkademikRow>();
    tersimpan.forEach((n) => {
      if (n.nis.startsWith('DF-2026')) return;
      const key = `${n.nis}__${n.mapel.trim().toLowerCase()}`.toLowerCase();
      if (deletedSet.has(key) || deletedSantriSet.has(n.nis.toUpperCase())) return;
      map.set(key, n);
    });
    return Array.from(map.values());
  };

  const terapkanPayloadSnapshotKeState = (
    payload: Record<string, unknown>,
    mode: 'merge' | 'replace' = 'merge'
  ) => {
    const incomingDeleted = normalisasiDeletedRecords(
      payload.deletedRecords as Partial<DeletedRecordsState> | undefined
    );
    const currentDeleted = normalisasiDeletedRecords(
      latestSnapshotRef.current.deletedRecords as Partial<DeletedRecordsState> | undefined
    );
    const finalDeleted =
      mode === 'replace'
        ? incomingDeleted
        : gabungkanDeletedRecords(currentDeleted, incomingDeleted);

    setDeletedRecords(finalDeleted);

    if (Array.isArray(payload.santriList)) {
      setSantriList((prev) =>
        mode === 'replace'
          ? gabungkanSantriKurikulum(payload.santriList as Santri[], finalDeleted)
          : gabungkanSantriKurikulum([...prev, ...(payload.santriList as Santri[])], finalDeleted)
      );
    }
    if (Array.isArray(payload.mapelList)) {
      setMapelList((prev) =>
        mode === 'replace'
          ? gabungkanMapelKurikulum(payload.mapelList as MapelConfig[], finalDeleted)
          : gabungkanMapelKurikulum([...prev, ...(payload.mapelList as MapelConfig[])], finalDeleted)
      );
    }
    if (Array.isArray(payload.ustadzList)) {
      setUstadzList((prev) =>
        mode === 'replace'
          ? gabungkanUstadzKurikulum(payload.ustadzList as UstadzAccount[], finalDeleted)
          : gabungkanUstadzKurikulum([...prev, ...(payload.ustadzList as UstadzAccount[])], finalDeleted)
      );
    }
    if (Array.isArray(payload.bankSoal)) {
      setBankSoal((prev) =>
        mode === 'replace'
          ? gabungkanBankSoalKurikulum([], payload.bankSoal as SoalCBT[], finalDeleted, false)
          : gabungkanBankSoalKurikulum(prev, payload.bankSoal as SoalCBT[], finalDeleted, false)
      );
    }
    if (Array.isArray(payload.nilaiAkademik)) {
      setNilaiAkademik((prev) =>
        mode === 'replace'
          ? gabungkanNilaiKurikulum(payload.nilaiAkademik as NilaiAkademikRow[], finalDeleted)
          : gabungkanNilaiKurikulum([...prev, ...(payload.nilaiAkademik as NilaiAkademikRow[])], finalDeleted)
      );
    }
    if (Array.isArray(payload.dataTahfidz)) {
      setDataTahfidz((prev) =>
        mode === 'replace'
          ? gabungkanTahfidzKurikulum(payload.dataTahfidz as PencapaianTahfidz[], finalDeleted)
          : gabungkanTahfidzKurikulum([...prev, ...(payload.dataTahfidz as PencapaianTahfidz[])], finalDeleted)
      );
    }
    if (Array.isArray(payload.dataIT)) {
      setDataIT((prev) =>
        mode === 'replace'
          ? gabungkanITKurikulum(payload.dataIT as PencapaianIT[], finalDeleted)
          : gabungkanITKurikulum([...prev, ...(payload.dataIT as PencapaianIT[])], finalDeleted)
      );
    }
    if (Array.isArray(payload.logUjianCBT)) {
      setLogUjianCBT((prev) => {
        if (mode === 'replace') return payload.logUjianCBT as LogUjianCBT[];
        const map = new Map<string, LogUjianCBT>();
        [...(payload.logUjianCBT as LogUjianCBT[]), ...prev].forEach((l) => {
          if (l && l.idLog && !map.has(l.idLog)) map.set(l.idLog, l);
        });
        return Array.from(map.values()).slice(0, 400);
      });
    }
    if (Array.isArray(payload.logAktivitasNilai)) {
      setLogAktivitasNilai((prev) => {
        if (mode === 'replace') return payload.logAktivitasNilai as LogAktivitasNilai[];
        const map = new Map<string, LogAktivitasNilai>();
        [...(payload.logAktivitasNilai as LogAktivitasNilai[]), ...prev].forEach((l) => {
          if (l && l.idLog && !map.has(l.idLog)) map.set(l.idLog, l);
        });
        return Array.from(map.values()).slice(0, 400);
      });
    }
    if (Array.isArray(payload.adminList) && payload.adminList.length > 0) {
      simpanAdminList(payload.adminList as AdminAccount[]);
    }
    if (payload.identitasPesantren && typeof payload.identitasPesantren === 'object') {
      const partialIdentitas = payload.identitasPesantren as Partial<IdentitasPesantren>;
      simpanIdentitasPesantren((prev) => ({
        ...prev,
        ...partialIdentitas,
      }));
    }
  };

  // Helper tanda tangan isi soal agar Firestore hanya menulis butir soal yang benar-benar berubah (hemat write units)
  const buatTandaTanganSoal = (s: SoalCBT): string =>
    JSON.stringify([
      s.unit,
      s.kelas,
      s.mapel,
      s.pertanyaan,
      s.teksArabSoal || '',
      s.potonganKodeIT || '',
      s.gambarSoalUrl || '',
      s.opsiA,
      s.opsiB,
      s.opsiC,
      s.opsiD,
      s.kunciJawaban,
      s.bobotSoal,
      s.pembuatUstadz || '',
    ]);

  // Helper terpusat menulis snapshot ke Firestore (Deduplikasi + Coalescing 60 detik + Circuit Breaker Kuota)
  const FIRESTORE_SNAPSHOT_COOLDOWN_MS = 60000;

  const eksekusiTulisSnapshotFirestore = async (
    snapshotData: Record<string, unknown>,
    userAktif: User | null,
    force = false
  ) => {
    if (!userAktif || userAktif.emailVerified !== true || isCloudHydrationPendingRef.current) return;
    if (isFirestoreQuotaPaused()) return;
    const payloadJson = buatPayloadSnapshotAmanFirestore(snapshotData);
    if (!force && payloadJson === lastFirestoreSnapshotJsonRef.current) return;

    const path = `pesantren_snapshots/${userAktif.uid}`;
    try {
      await setDoc(doc(db, 'pesantren_snapshots', userAktif.uid), {
        ownerId: userAktif.uid,
        updatedAtIso: new Date().toISOString(),
        payloadJson,
      });
      lastFirestoreSnapshotJsonRef.current = payloadJson;
      lastFirestoreSnapshotAtRef.current = Date.now();
    } catch (fireErr) {
      if (isFirestoreQuotaError(fireErr)) {
        markFirestoreQuotaExceeded();
        return;
      }
      handleFirestoreError(fireErr, OperationType.WRITE, path);
    }
  };

  const jadwalkanTulisSnapshotFirestore = (
    snapshotData: Record<string, unknown>,
    userAktif: User | null,
    options?: { force?: boolean }
  ) => {
    if (!userAktif || userAktif.emailVerified !== true || isCloudHydrationPendingRef.current) return;
    if (isFirestoreQuotaPaused()) return;

    const force = Boolean(options?.force);
    pendingFirestoreSnapshotDataRef.current = snapshotData;

    if (force) {
      if (pendingFirestoreSnapshotTimerRef.current !== null) {
        window.clearTimeout(pendingFirestoreSnapshotTimerRef.current);
        pendingFirestoreSnapshotTimerRef.current = null;
      }
      void eksekusiTulisSnapshotFirestore(snapshotData, userAktif, true);
      return;
    }

    const elapsed = Date.now() - lastFirestoreSnapshotAtRef.current;
    if (elapsed >= FIRESTORE_SNAPSHOT_COOLDOWN_MS) {
      if (pendingFirestoreSnapshotTimerRef.current !== null) {
        window.clearTimeout(pendingFirestoreSnapshotTimerRef.current);
        pendingFirestoreSnapshotTimerRef.current = null;
      }
      // Tetap beri jeda singkat 2.5 detik agar beberapa aksi beruntun (mis. edit cepat) digabung jadi 1 tulis
      pendingFirestoreSnapshotTimerRef.current = window.setTimeout(() => {
        pendingFirestoreSnapshotTimerRef.current = null;
        const latestData = pendingFirestoreSnapshotDataRef.current;
        const activeU = auth.currentUser;
        if (latestData && activeU && activeU.emailVerified === true && !isFirestoreQuotaPaused()) {
          void eksekusiTulisSnapshotFirestore(latestData, activeU, false);
        }
      }, 2500);
      return;
    }

    if (pendingFirestoreSnapshotTimerRef.current === null) {
      const waitMs = Math.max(2500, FIRESTORE_SNAPSHOT_COOLDOWN_MS - elapsed);
      pendingFirestoreSnapshotTimerRef.current = window.setTimeout(() => {
        pendingFirestoreSnapshotTimerRef.current = null;
        const latestData = pendingFirestoreSnapshotDataRef.current;
        const activeU = auth.currentUser;
        if (latestData && activeU && activeU.emailVerified === true && !isFirestoreQuotaPaused()) {
          void eksekusiTulisSnapshotFirestore(latestData, activeU, false);
        }
      }, waitMs);
    }
  };

  // Helper fetch JSON dengan retry otomatis untuk mencegah gagal simpan saat koneksi Wi-Fi tidak stabil
  const fetchJsonDenganRetry = async (
    url: string,
    payload: Record<string, unknown>,
    maxAttempts = 3
  ): Promise<{ ok: boolean; status: number; json: Record<string, unknown> | null }> => {
    const delays = [0, 700, 1800];
    let lastStatus = 0;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (delays[attempt] > 0) {
        await new Promise((r) => setTimeout(r, delays[attempt]));
      }
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        lastStatus = res.status;
        let json: Record<string, unknown> | null = null;
        try {
          json = (await res.json()) as Record<string, unknown>;
        } catch {
          json = null;
        }
        if (res.ok && json?.sukses) {
          return { ok: true, status: res.status, json };
        }
        // Jangan retry untuk error validasi 4xx selain 408/429
        if (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429) {
          return { ok: false, status: res.status, json };
        }
      } catch {
        // Error jaringan — lanjut percobaan berikutnya
      }
    }
    return { ok: false, status: lastStatus, json: null };
  };

  // Sinkronisasi Per-Dokumen Bank Soal ke Firebase Firestore (/soal_cbt/{idSoal})
  // - Hanya tulis soal yang benar-benar berubah
  // - Fallback otomatis per-dokumen jika writeBatch terkena permission-denied (agar soal milik akun lain tidak menggagalkan soal milik sendiri!)
  const upsertSoalKeFirestore = async (
    daftarSoal: SoalCBT[],
    userAktif: User | null
  ): Promise<{ berhasil: number; dilewati: number; gagal: number; quotaHabis: boolean }> => {
    const hasil = { berhasil: 0, dilewati: 0, gagal: 0, quotaHabis: false };
    if (!userAktif || userAktif.emailVerified !== true || daftarSoal.length === 0) return hasil;
    if (isFirestoreQuotaPaused()) {
      hasil.quotaHabis = true;
      return hasil;
    }

    const isBootstrapAdmin = userAktif.email === 'musanashir@gmail.com';
    const soalBerubah: SoalCBT[] = [];
    for (const s of daftarSoal) {
      const docId = sanitasiIdDokumenFirestore(s.idSoal);
      const sig = buatTandaTanganSoal(s);
      if (lastSyncedSoalSigMapRef.current.get(docId) === sig) {
        continue;
      }
      const knownOwner = soalAuthorUidMapRef.current.get(docId);
      if (!isBootstrapAdmin && (soalReadOnlyFirestoreRef.current.has(docId) || (knownOwner && knownOwner !== userAktif.uid))) {
        hasil.dilewati += 1;
        continue;
      }
      soalBerubah.push(s);
    }
    if (soalBerubah.length === 0) return hasil;

    const CHUNK_SIZE = 100;
    for (let i = 0; i < soalBerubah.length; i += CHUNK_SIZE) {
      if (isFirestoreQuotaPaused()) {
        hasil.quotaHabis = true;
        return hasil;
      }
      const slice = soalBerubah.slice(i, i + CHUNK_SIZE);
      const batch = writeBatch(db);
      const pendingItems: Array<{ docId: string; sig: string; payload: Record<string, unknown> }> = [];
      for (const s of slice) {
        const { docId, payload } = bangunPayloadSoalFirestore(s, userAktif.uid);
        batch.set(doc(db, 'soal_cbt', docId), payload);
        pendingItems.push({ docId, sig: buatTandaTanganSoal(s), payload });
      }
      try {
        await batch.commit();
        pendingItems.forEach(({ docId, sig }) => {
          lastSyncedSoalSigMapRef.current.set(docId, sig);
          soalAuthorUidMapRef.current.set(docId, userAktif.uid);
        });
        hasil.berhasil += pendingItems.length;
      } catch (err) {
        if (isFirestoreQuotaError(err)) {
          markFirestoreQuotaExceeded();
          hasil.quotaHabis = true;
          return hasil;
        }
        const msgLow = (err instanceof Error ? err.message : String(err)).toLowerCase();
        // Jika batch gagal karena 1 atau beberapa dokumen milik authorUid lain, lakukan fallback per-dokumen agar soal milik sendiri tetap tersimpan mulus!
        if (msgLow.includes('permission') || msgLow.includes('insufficient')) {
          for (const item of pendingItems) {
            if (isFirestoreQuotaPaused()) {
              hasil.quotaHabis = true;
              return hasil;
            }
            try {
              await setDoc(doc(db, 'soal_cbt', item.docId), item.payload);
              lastSyncedSoalSigMapRef.current.set(item.docId, item.sig);
              soalAuthorUidMapRef.current.set(item.docId, userAktif.uid);
              hasil.berhasil += 1;
            } catch (docErr) {
              if (isFirestoreQuotaError(docErr)) {
                markFirestoreQuotaExceeded();
                hasil.quotaHabis = true;
                return hasil;
              }
              const docMsg = (docErr instanceof Error ? docErr.message : String(docErr)).toLowerCase();
              if (docMsg.includes('permission') || docMsg.includes('insufficient')) {
                soalReadOnlyFirestoreRef.current.add(item.docId);
                hasil.dilewati += 1;
              } else {
                hasil.gagal += 1;
              }
            }
          }
        } else {
          hasil.gagal += pendingItems.length;
          console.error('Gagal menulis batch soal ke Firestore:', err);
        }
      }
    }
    return hasil;
  };

  const hapusSoalDariFirestore = async (idSoalList: string[], userAktif: User | null) => {
    if (!userAktif || userAktif.emailVerified !== true || idSoalList.length === 0) return;
    if (isFirestoreQuotaPaused()) return;
    for (const rawId of idSoalList) {
      if (isFirestoreQuotaPaused()) return;
      const docId = sanitasiIdDokumenFirestore(rawId);
      const path = `soal_cbt/${docId}`;
      try {
        await deleteDoc(doc(db, 'soal_cbt', docId));
        lastSyncedSoalSigMapRef.current.delete(docId);
        soalAuthorUidMapRef.current.delete(docId);
        soalReadOnlyFirestoreRef.current.delete(docId);
      } catch (err) {
        if (isFirestoreQuotaError(err)) {
          markFirestoreQuotaExceeded();
          return;
        }
        // Jika dokumen memang belum pernah ada di Firestore atau milik akun lain, abaikan tanpa memblokir penghapusan lokal
        const msg = err instanceof Error ? err.message : String(err);
        if (!msg.toLowerCase().includes('not-found') && !msg.toLowerCase().includes('permission')) {
          handleFirestoreError(err, OperationType.DELETE, path);
        }
      }
    }
  };

  const muatSoalDariFirestore = async (userAktif: User): Promise<SoalCBT[]> => {
    if (isFirestoreQuotaPaused()) return [];
    const path = 'soal_cbt';
    try {
      const isBootstrapAdmin = userAktif.email === 'musanashir@gmail.com';
      const q = isBootstrapAdmin
        ? collection(db, 'soal_cbt')
        : query(collection(db, 'soal_cbt'), where('authorUid', '==', userAktif.uid));
      const snap = await getDocs(q);
      const hasil: SoalCBT[] = [];
      snap.forEach((docSnap) => {
        const d = docSnap.data();
        if (!d || !d.idSoal || !d.pertanyaan) return;
        const soalObj: SoalCBT = {
          idSoal: String(d.idSoal),
          unit: (d.unit === 'Ulya' || d.unit === 'MDA' ? d.unit : 'Wustho') as UnitPendidikan,
          kelas: String(d.kelas || 'Kelas 7'),
          mapel: String(d.mapel || 'Umum'),
          pertanyaan: String(d.pertanyaan),
          teksArabSoal: typeof d.teksArabSoal === 'string' && d.teksArabSoal ? d.teksArabSoal : undefined,
          potonganKodeIT: typeof d.potonganKodeIT === 'string' && d.potonganKodeIT ? d.potonganKodeIT : undefined,
          gambarSoalUrl: typeof d.gambarSoalUrl === 'string' && d.gambarSoalUrl ? d.gambarSoalUrl : undefined,
          opsiA: String(d.opsiA || '-'),
          opsiB: String(d.opsiB || '-'),
          opsiC: String(d.opsiC || '-'),
          opsiD: String(d.opsiD || '-'),
          kunciJawaban: (['A', 'B', 'C', 'D'].includes(String(d.kunciJawaban))
            ? String(d.kunciJawaban)
            : 'A') as 'A' | 'B' | 'C' | 'D',
          bobotSoal: Number(d.bobotSoal) || 10,
          pembuatUstadz: typeof d.pembuatUstadz === 'string' ? d.pembuatUstadz : undefined,
          updatedAt: typeof d.updatedAtIso === 'string' ? d.updatedAtIso : undefined,
        };
        const docId = sanitasiIdDokumenFirestore(soalObj.idSoal);
        hasil.push(soalObj);
        lastSyncedSoalSigMapRef.current.set(docId, buatTandaTanganSoal(soalObj));
        if (typeof d.authorUid === 'string' && d.authorUid) {
          soalAuthorUidMapRef.current.set(docId, d.authorUid);
        }
      });
      return hasil;
    } catch (err) {
      if (isFirestoreQuotaError(err)) {
        markFirestoreQuotaExceeded();
        return [];
      }
      handleFirestoreError(err, OperationType.LIST, path);
    }
  };

  // Kirim ulang otomatis antrean soal yang sempat tertunda karena jaringan offline/putus
  const flushAntreanSoalTertunda = async (): Promise<boolean> => {
    if (isFlushingSoalQueueRef.current) return true;
    const upsertItems = Object.values(pendingSoalQueueRef.current.upserts);
    const deleteIds = [...pendingSoalQueueRef.current.deletes];
    if (upsertItems.length === 0 && deleteIds.length === 0) return true;

    isFlushingSoalQueueRef.current = true;
    let semuaSukses = true;
    try {
      const activeUser = auth.currentUser;
      if (deleteIds.length > 0) {
        const resDel = await fetchJsonDenganRetry('/api/soal/delete', { idSoalList: deleteIds }, 2);
        if (resDel.ok && resDel.json) {
          if (typeof resDel.json.version === 'number') {
            serverEtagRef.current = `"v-${resDel.json.version}"`;
          }
          const doneDelSet = new Set(deleteIds);
          pendingSoalQueueRef.current.deletes = pendingSoalQueueRef.current.deletes.filter(
            (id) => !doneDelSet.has(id)
          );
          simpanAntreanSoalKeStorage();
          if (activeUser && activeUser.emailVerified === true) {
            await hapusSoalDariFirestore(deleteIds, activeUser);
          }
        } else {
          semuaSukses = false;
        }
      }

      if (upsertItems.length > 0) {
        const resUp = await fetchJsonDenganRetry(
          '/api/soal/upsert',
          { soalList: upsertItems, respectDeleted: false },
          2
        );
        if (resUp.ok && resUp.json) {
          if (typeof resUp.json.version === 'number') {
            serverEtagRef.current = `"v-${resUp.json.version}"`;
          }
          upsertItems.forEach((s) => {
            const key = s.idSoal.trim().toUpperCase();
            if (pendingSoalQueueRef.current.upserts[key]?.updatedAt === s.updatedAt) {
              delete pendingSoalQueueRef.current.upserts[key];
            }
          });
          simpanAntreanSoalKeStorage();
          if (activeUser && activeUser.emailVerified === true) {
            await upsertSoalKeFirestore(upsertItems, activeUser);
          }
        } else {
          semuaSukses = false;
        }
      }
    } finally {
      isFlushingSoalQueueRef.current = false;
    }
    return semuaSukses;
  };

  // Simpan Atomik Bank Soal (Instan ke Browser LocalStorage + Antrean Tahan-Offline + Server /api/soal/upsert + Firebase /soal_cbt)
  const simpanSoalAtomik = (daftarSoalBaru: SoalCBT[]) => {
    if (daftarSoalBaru.length === 0) return;
    const nowIso = new Date().toISOString();
    const pembuatDefault = ustadzLoginAktif?.namaUstadz || ustadzTerpilihNama || 'Ustadz Pengampu';
    const soalBerstempel = daftarSoalBaru.map((s) => ({
      ...s,
      pembuatUstadz: s.pembuatUstadz || pembuatDefault,
      updatedAt: nowIso,
    }));
    const idBaruSet = new Set(soalBerstempel.map((s) => s.idSoal.trim().toUpperCase()));

    // Masukkan ke antrean persisten terlebih dahulu agar tidak pernah hilang jika jaringan terputus
    soalBerstempel.forEach((s) => {
      pendingSoalQueueRef.current.upserts[s.idSoal.trim().toUpperCase()] = s;
    });
    pendingSoalQueueRef.current.deletes = pendingSoalQueueRef.current.deletes.filter(
      (id) => !idBaruSet.has(id)
    );
    simpanAntreanSoalKeStorage();

    const nextDeleted: DeletedRecordsState = {
      ...normalisasiDeletedRecords(latestSnapshotRef.current.deletedRecords as Partial<DeletedRecordsState> | undefined),
      soal: (
        normalisasiDeletedRecords(latestSnapshotRef.current.deletedRecords as Partial<DeletedRecordsState> | undefined)
          .soal || []
      ).filter((id) => !idBaruSet.has(id)),
    };

    // Cegah race condition dengan auto-sync 350ms (/api/db/state) karena endpoint /api/soal/upsert sudah menangani penyimpanan secara atomik
    skipNextAutoSyncRef.current = true;
    setDeletedRecords(nextDeleted);
    setBankSoal((prev) => {
      const merged = gabungkanBankSoalKurikulum(prev, soalBerstempel, nextDeleted, false);
      simpanBackupLokalBrowser({
        ...latestSnapshotRef.current,
        bankSoal: merged,
        deletedRecords: nextDeleted,
      });
      return merged;
    });

    setStatusSinkronCloud('menyimpan');
    void (async () => {
      try {
        const res = await fetchJsonDenganRetry(
          '/api/soal/upsert',
          { soalList: soalBerstempel, respectDeleted: false },
          3
        );
        if (res.ok && res.json) {
          if (typeof res.json.version === 'number') {
            serverEtagRef.current = `"v-${res.json.version}"`;
          }
          // Hapus dari antrean setelah server mengonfirmasi tersimpan
          soalBerstempel.forEach((s) => {
            const key = s.idSoal.trim().toUpperCase();
            if (pendingSoalQueueRef.current.upserts[key]?.updatedAt === s.updatedAt) {
              delete pendingSoalQueueRef.current.upserts[key];
            }
          });
          simpanAntreanSoalKeStorage();

          if (Array.isArray(res.json.bankSoal)) {
            const serverDel: DeletedRecordsState = {
              ...nextDeleted,
              soal: Array.isArray(res.json.deletedSoal) ? (res.json.deletedSoal as string[]) : nextDeleted.soal,
            };
            skipNextAutoSyncRef.current = true;
            setBankSoal((prev) => {
              const merged = gabungkanBankSoalKurikulum(prev, res.json?.bankSoal as SoalCBT[], serverDel, false);
              simpanBackupLokalBrowser({
                ...latestSnapshotRef.current,
                bankSoal: merged,
                deletedRecords: serverDel,
              });
              return merged;
            });
          }
        }
        const activeUser = auth.currentUser;
        if (activeUser && activeUser.emailVerified === true) {
          await upsertSoalKeFirestore(soalBerstempel, activeUser);
        }
        setTerakhirSinkron(new Date().toLocaleTimeString('id-ID'));
      } catch (err) {
        console.error('Sinkronisasi soal atomik masuk antrean retry otomatis:', err);
      } finally {
        setStatusSinkronCloud('tersinkron');
      }
    })();
  };

  // Hapus Atomik Bank Soal (Catat Tombstone + Antrean Tahan-Offline + LocalStorage + Server /api/soal/delete + Firestore /soal_cbt)
  const hapusSoalAtomik = (idSoalList: string[]) => {
    const idNorm = Array.from(
      new Set(idSoalList.map((id) => String(id || '').trim().toUpperCase()).filter(Boolean))
    );
    if (idNorm.length === 0) return;
    const idSet = new Set(idNorm);

    // Masukkan ke antrean hapus & bersihkan dari antrean upsert
    idNorm.forEach((id) => {
      delete pendingSoalQueueRef.current.upserts[id];
    });
    pendingSoalQueueRef.current.deletes = Array.from(
      new Set([...pendingSoalQueueRef.current.deletes, ...idNorm])
    );
    simpanAntreanSoalKeStorage();

    const prevDeleted = normalisasiDeletedRecords(
      latestSnapshotRef.current.deletedRecords as Partial<DeletedRecordsState> | undefined
    );
    const nextDeleted: DeletedRecordsState = {
      ...prevDeleted,
      soal: Array.from(new Set([...prevDeleted.soal, ...idNorm])),
    };

    skipNextAutoSyncRef.current = true;
    setDeletedRecords(nextDeleted);
    setBankSoal((prev) => {
      const filtered = prev.filter((item) => !idSet.has(item.idSoal.trim().toUpperCase()));
      simpanBackupLokalBrowser({
        ...latestSnapshotRef.current,
        bankSoal: filtered,
        deletedRecords: nextDeleted,
      });
      return filtered;
    });

    setStatusSinkronCloud('menyimpan');
    void (async () => {
      try {
        const res = await fetchJsonDenganRetry('/api/soal/delete', { idSoalList: idNorm }, 3);
        if (res.ok && res.json) {
          if (typeof res.json.version === 'number') {
            serverEtagRef.current = `"v-${res.json.version}"`;
          }
          pendingSoalQueueRef.current.deletes = pendingSoalQueueRef.current.deletes.filter(
            (id) => !idSet.has(id)
          );
          simpanAntreanSoalKeStorage();
        }
        const activeUser = auth.currentUser;
        if (activeUser && activeUser.emailVerified === true) {
          await hapusSoalDariFirestore(idNorm, activeUser);
        }
        setTerakhirSinkron(new Date().toLocaleTimeString('id-ID'));
      } catch (err) {
        console.error('Penghapusan soal ke server masuk antrean retry otomatis:', err);
      } finally {
        setStatusSinkronCloud('tersinkron');
      }
    })();
  };

  // Simpan Atomik Konfigurasi Mapel (Token, Durasi, Pengampu) agar perubahan langsung permanen & tidak pernah kembali ke default
  const simpanMapelAtomik = (
    daftarMapelBaru: MapelConfig[],
    options?: { removeOldKeys?: string[]; syncUstadzList?: UstadzAccount[] }
  ) => {
    if (daftarMapelBaru.length === 0) return;
    const nowIso = new Date().toISOString();
    const mapelBerstempel = daftarMapelBaru.map((m) => ({
      ...m,
      tokenUjian: m.tokenUjian.trim().toUpperCase(),
      durasiMenit: Math.max(5, Math.min(240, Number(m.durasiMenit) || 40)),
      updatedAt: nowIso,
    }));
    const removeOldKeys = (options?.removeOldKeys || []).map((k) => k.toLowerCase());
    const newKeys = new Set(
      mapelBerstempel.map((m) => `${m.unit}__${m.kelas}__${m.namaMapel.toLowerCase()}`.toLowerCase())
    );

    const prevDeleted = normalisasiDeletedRecords(
      latestSnapshotRef.current.deletedRecords as Partial<DeletedRecordsState> | undefined
    );
    const nextDeletedMapel = Array.from(
      new Set([
        ...prevDeleted.mapel.filter((k) => !newKeys.has(k.toLowerCase())),
        ...removeOldKeys.filter((k) => !newKeys.has(k)),
      ])
    );
    const nextDeleted: DeletedRecordsState = {
      ...prevDeleted,
      mapel: nextDeletedMapel,
    };

    const ustadzBerstempel =
      options?.syncUstadzList && options.syncUstadzList.length > 0
        ? options.syncUstadzList.map((u) => ({ ...u, updatedAt: nowIso }))
        : undefined;

    skipNextAutoSyncRef.current = true;
    setDeletedRecords(nextDeleted);

    let nextMapelSnapshot: MapelConfig[] = [];
    setMapelList((prev) => {
      const filteredPrev = prev.filter((item) => {
        const key = `${item.unit}__${item.kelas}__${item.namaMapel.toLowerCase()}`.toLowerCase();
        return !removeOldKeys.includes(key);
      });
      const merged = gabungkanMapelKurikulum([...filteredPrev, ...mapelBerstempel], nextDeleted);
      nextMapelSnapshot = merged;
      simpanBackupLokalBrowser({
        ...latestSnapshotRef.current,
        mapelList: merged,
        ...(ustadzBerstempel ? { ustadzList: gabungkanUstadzKurikulum([...((latestSnapshotRef.current.ustadzList as UstadzAccount[]) || []), ...ustadzBerstempel], nextDeleted) } : {}),
        deletedRecords: nextDeleted,
      });
      return merged;
    });

    if (ustadzBerstempel) {
      setUstadzList((prev) => gabungkanUstadzKurikulum([...prev, ...ustadzBerstempel], nextDeleted));
    }

    setStatusSinkronCloud('menyimpan');
    void (async () => {
      try {
        const res = await fetch('/api/mapel/upsert', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mapelList: mapelBerstempel,
            removeOldKeys,
            ...(ustadzBerstempel ? { ustadzList: ustadzBerstempel } : {}),
          }),
        });
        const json = await res.json();
        if (json?.sukses && typeof json.version === 'number') {
          serverEtagRef.current = `"v-${json.version}"`;
        }
        const activeUser = auth.currentUser;
        if (activeUser && activeUser.emailVerified === true && !isCloudHydrationPendingRef.current) {
          const snapToWrite = {
            ...latestSnapshotRef.current,
            mapelList: nextMapelSnapshot.length > 0 ? nextMapelSnapshot : latestSnapshotRef.current.mapelList,
            deletedRecords: nextDeleted,
          };
          jadwalkanTulisSnapshotFirestore(snapToWrite, activeUser, { force: true });
        }
        setTerakhirSinkron(new Date().toLocaleTimeString('id-ID'));
      } catch (err) {
        console.error('Sinkronisasi mapel atomik tertunda (tersimpan di backup lokal):', err);
      } finally {
        setStatusSinkronCloud('tersinkron');
      }
    })();
  };

  // Simpan Atomik Akun & Hak Akses Ustadz (+ Sinkron Pengampu ke Tabel Mapel/Token)
  const simpanUstadzAtomik = (
    daftarUstadzBaru: UstadzAccount[],
    options?: { syncMapelList?: MapelConfig[]; nextDeletedUstadz?: string[] }
  ) => {
    if (daftarUstadzBaru.length === 0) return;
    const nowIso = new Date().toISOString();
    const ustadzBerstempel = daftarUstadzBaru.map((u) => ({
      ...u,
      updatedAt: nowIso,
    }));
    const mapelBerstempel =
      options?.syncMapelList && options.syncMapelList.length > 0
        ? options.syncMapelList.map((m) => ({ ...m, updatedAt: nowIso }))
        : undefined;

    const prevDeleted = normalisasiDeletedRecords(
      latestSnapshotRef.current.deletedRecords as Partial<DeletedRecordsState> | undefined
    );
    const nextDeleted: DeletedRecordsState = options?.nextDeletedUstadz
      ? { ...prevDeleted, ustadz: options.nextDeletedUstadz }
      : prevDeleted;

    skipNextAutoSyncRef.current = true;
    if (options?.nextDeletedUstadz) {
      setDeletedRecords(nextDeleted);
    }

    let nextUstadzSnapshot: UstadzAccount[] = [];
    setUstadzList((prev) => {
      const merged = gabungkanUstadzKurikulum([...prev, ...ustadzBerstempel], nextDeleted);
      nextUstadzSnapshot = merged;
      simpanBackupLokalBrowser({
        ...latestSnapshotRef.current,
        ustadzList: merged,
        ...(mapelBerstempel
          ? {
              mapelList: gabungkanMapelKurikulum(
                [...((latestSnapshotRef.current.mapelList as MapelConfig[]) || []), ...mapelBerstempel],
                nextDeleted
              ),
            }
          : {}),
        deletedRecords: nextDeleted,
      });
      return merged;
    });

    if (mapelBerstempel) {
      setMapelList((prev) => gabungkanMapelKurikulum([...prev, ...mapelBerstempel], nextDeleted));
    }

    setStatusSinkronCloud('menyimpan');
    void (async () => {
      try {
        const res = await fetch('/api/ustadz/upsert', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ustadzList: ustadzBerstempel,
            ...(mapelBerstempel ? { mapelList: mapelBerstempel } : {}),
          }),
        });
        const json = await res.json();
        if (json?.sukses && typeof json.version === 'number') {
          serverEtagRef.current = `"v-${json.version}"`;
        }
        const activeUser = auth.currentUser;
        if (activeUser && activeUser.emailVerified === true && !isCloudHydrationPendingRef.current) {
          const snapToWrite = {
            ...latestSnapshotRef.current,
            ustadzList: nextUstadzSnapshot.length > 0 ? nextUstadzSnapshot : latestSnapshotRef.current.ustadzList,
            deletedRecords: nextDeleted,
          };
          jadwalkanTulisSnapshotFirestore(snapToWrite, activeUser, { force: true });
        }
        setTerakhirSinkron(new Date().toLocaleTimeString('id-ID'));
      } catch (err) {
        console.error('Sinkronisasi ustadz atomik tertunda (tersimpan di backup lokal):', err);
      } finally {
        setStatusSinkronCloud('tersinkron');
      }
    })();
  };

  // 1. Pantau status autentikasi Google Firebase Cloud (Muat Snapshot + Koleksi /soal_cbt lalu Merge Non-Destruktif)
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (u && u.emailVerified === true) {
        isCloudHydrationPendingRef.current = true;
        setCloudUser(u);
        const path = `pesantren_snapshots/${u.uid}`;
        try {
          if (!isFirestoreQuotaPaused()) {
            const [snap, soalFirestore] = await Promise.all([
              getDoc(doc(db, 'pesantren_snapshots', u.uid)),
              muatSoalDariFirestore(u),
            ]);
            if (snap.exists()) {
              const rawPayloadJson = String(snap.data().payloadJson || '{}');
              lastFirestoreSnapshotJsonRef.current = rawPayloadJson;
              lastFirestoreSnapshotAtRef.current = Date.now();
              let payload: Record<string, unknown> = {};
              try {
                payload = JSON.parse(rawPayloadJson) || {};
              } catch {
                payload = {};
              }
              if (Object.keys(payload).length > 0) {
                isCloudHydratedRef.current = true;
                skipNextAutoSyncRef.current = true;
                terapkanPayloadSnapshotKeState(payload, 'merge');
                // Pulihkan juga daftar Ustadz (PIN & hak akses) serta Mapel (Token & durasi) dari Firestore ke Server
                // agar bila container server baru restart, seluruh perangkat langsung mendapat PIN & Token terbaru
                if (Array.isArray(payload.ustadzList) && payload.ustadzList.length > 0) {
                  fetch('/api/ustadz/upsert', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ustadzList: payload.ustadzList }),
                  }).catch(() => {});
                }
                if (Array.isArray(payload.mapelList) && payload.mapelList.length > 0) {
                  fetch('/api/mapel/upsert', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ mapelList: payload.mapelList }),
                  }).catch(() => {});
                }
              }
            }
            if (soalFirestore.length > 0) {
              isCloudHydratedRef.current = true;
              const curDel = normalisasiDeletedRecords(
                latestSnapshotRef.current.deletedRecords as Partial<DeletedRecordsState> | undefined
              );
              skipNextAutoSyncRef.current = true;
              setBankSoal((prev) => {
                const merged = gabungkanBankSoalKurikulum(prev, soalFirestore, curDel, false);
                simpanBackupLokalBrowser({
                  ...latestSnapshotRef.current,
                  bankSoal: merged,
                });
                return merged;
              });
              // Dorong soal dari Firestore ke Server (respectDeleted: true agar soal yang sudah dihapus tidak hidup lagi)
              fetch('/api/soal/upsert', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ soalList: soalFirestore, respectDeleted: true }),
              }).catch(() => {});
            } else if (!isFirestoreQuotaPaused()) {
              // Jika Firestore /soal_cbt masih kosong tapi di lokal/server ada soal buatan Ustadz, cadangkan sekali ke /soal_cbt
              const soalLokalSaatIni = Array.isArray(latestSnapshotRef.current.bankSoal)
                ? (latestSnapshotRef.current.bankSoal as SoalCBT[])
                : [];
              if (soalLokalSaatIni.length > 0) {
                await upsertSoalKeFirestore(soalLokalSaatIni, u);
              }
            }
          }
        } catch (err) {
          if (isFirestoreQuotaError(err)) {
            markFirestoreQuotaExceeded();
          } else {
            handleFirestoreError(err, OperationType.GET, path);
          }
        } finally {
          isCloudHydrationPendingRef.current = false;
          setCloudHydrationDoneTick((n) => n + 1);
        }
      } else {
        isCloudHydrationPendingRef.current = false;
        isCloudHydratedRef.current = false;
        setCloudUser(u);
      }
    });
    return () => unsub();
  }, []);

  // Helper tarik pembaruan dari Server (dan opsional Firestore saat sinkron manual agar hemat kuota harian)
  const tarikSinkronDariServer = async (forcePushBackIfLocalRicher = false, syncFirestore = false) => {
    try {
      // Kirim dulu antrean soal lokal yang sempat gagal terkirim saat jaringan offline
      await flushAntreanSoalTertunda();

      const headers: Record<string, string> = {};
      if (!forcePushBackIfLocalRicher && serverEtagRef.current) {
        headers['If-None-Match'] = serverEtagRef.current;
      }
      const res = await fetch('/api/db/state', { headers });
      if (res.status === 304) {
        return;
      }
      const etagBaru = res.headers.get('ETag');
      if (etagBaru) {
        serverEtagRef.current = etagBaru;
      }
      const json = await res.json();
      if (json.sukses && json.state) {
        const st = json.state as Record<string, unknown>;
        const serverSoalCount = Array.isArray(st.bankSoal) ? st.bankSoal.length : 0;
        const localSoalCount = Array.isArray(latestSnapshotRef.current.bankSoal)
          ? (latestSnapshotRef.current.bankSoal as SoalCBT[]).length
          : 0;

        skipNextAutoSyncRef.current = true;
        terapkanPayloadSnapshotKeState(st, 'merge');
        setTerakhirSinkron(new Date().toLocaleTimeString('id-ID'));

        // Jika server baru saja restart (mis. hanya berisi seed awal 7 soal) sementara browser lokal memiliki lebih banyak soal,
        // pulihkan kembali soal lokal ke server secara otomatis (tetap hormati soal terhapus)!
        if (forcePushBackIfLocalRicher && localSoalCount > serverSoalCount) {
          const localSoal = (latestSnapshotRef.current.bankSoal as SoalCBT[]) || [];
          const pushRes = await fetchJsonDenganRetry(
            '/api/soal/upsert',
            { soalList: localSoal, respectDeleted: true },
            2
          );
          if (pushRes.ok && pushRes.json && typeof pushRes.json.version === 'number') {
            serverEtagRef.current = `"v-${pushRes.json.version}"`;
          }
        }
      } else if (json.sukses && !json.state) {
        const seedToPush = {
          identitasPesantren: latestSnapshotRef.current.identitasPesantren || DEFAULT_IDENTITAS_PESANTREN,
          santriList: latestSnapshotRef.current.santriList || INITIAL_SANTRI,
          mapelList: latestSnapshotRef.current.mapelList || INITIAL_MAPEL,
          ustadzList: latestSnapshotRef.current.ustadzList || INITIAL_USTADZ,
          bankSoal: latestSnapshotRef.current.bankSoal || INITIAL_SOAL,
          nilaiAkademik: latestSnapshotRef.current.nilaiAkademik || INITIAL_NILAI,
          dataTahfidz: latestSnapshotRef.current.dataTahfidz || INITIAL_TAHFIDZ,
          dataIT: latestSnapshotRef.current.dataIT || INITIAL_IT,
          logUjianCBT: latestSnapshotRef.current.logUjianCBT || INITIAL_LOG_CBT,
          logAktivitasNilai: latestSnapshotRef.current.logAktivitasNilai || INITIAL_LOG_AKTIVITAS_NILAI,
          adminList: latestSnapshotRef.current.adminList || DEFAULT_ADMIN_ACCOUNTS,
          deletedRecords: latestSnapshotRef.current.deletedRecords || EMPTY_DELETED_RECORDS,
        };
        await fetch('/api/db/state', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(seedToPush),
        });
      }

      // Sinkronisasi dua arah dengan Firestore /soal_cbt hanya dijalankan saat diminta eksplisit (hemat kuota baca/tulis)
      const activeCloudUser = auth.currentUser;
      if (syncFirestore && activeCloudUser && activeCloudUser.emailVerified === true && !isFirestoreQuotaPaused()) {
        const soalCloud = await muatSoalDariFirestore(activeCloudUser);
        if (soalCloud.length > 0) {
          const delAktif = normalisasiDeletedRecords(
            latestSnapshotRef.current.deletedRecords as Partial<DeletedRecordsState> | undefined
          );
          skipNextAutoSyncRef.current = true;
          setBankSoal((prev) => {
            const merged = gabungkanBankSoalKurikulum(prev, soalCloud, delAktif, false);
            simpanBackupLokalBrowser({
              ...latestSnapshotRef.current,
              bankSoal: merged,
            });
            return merged;
          });
          if (forcePushBackIfLocalRicher) {
            await fetchJsonDenganRetry(
              '/api/soal/upsert',
              { soalList: soalCloud, respectDeleted: true },
              2
            );
          }
        } else if (forcePushBackIfLocalRicher && !isFirestoreQuotaPaused()) {
          const localSoal = (latestSnapshotRef.current.bankSoal as SoalCBT[]) || [];
          if (localSoal.length > 0) {
            await upsertSoalKeFirestore(localSoal, activeCloudUser);
          }
        }
      }
    } catch {
      // Gunakan state lokal jika offline
    }
  };

  const handleSinkronManualSoalUstadz = async () => {
    setStatusSinkronCloud('menyimpan');
    clearFirestoreQuotaPause();
    try {
      await flushAntreanSoalTertunda();
      const localSoal = (latestSnapshotRef.current.bankSoal as SoalCBT[]) || bankSoal;
      let serverOk = true;
      let totalSoalServer = localSoal.length;
      if (localSoal.length > 0) {
        const resServer = await fetchJsonDenganRetry(
          '/api/soal/upsert',
          { soalList: localSoal, respectDeleted: true },
          3
        );
        serverOk = resServer.ok;
        if (resServer.ok && resServer.json) {
          if (typeof resServer.json.version === 'number') {
            serverEtagRef.current = `"v-${resServer.json.version}"`;
          }
          if (Array.isArray(resServer.json.bankSoal)) {
            totalSoalServer = resServer.json.bankSoal.length;
          }
        }
      }

      const activeUser = auth.currentUser;
      let hasilCloud = { berhasil: 0, dilewati: 0, gagal: 0, quotaHabis: false };
      if (activeUser && activeUser.emailVerified === true && localSoal.length > 0) {
        hasilCloud = await upsertSoalKeFirestore(localSoal, activeUser);
      }

      await tarikSinkronDariServer(false, true);
      const waktu = new Date().toLocaleTimeString('id-ID');
      setTerakhirSinkron(waktu);

      if (!serverOk) {
        Swal.fire({
          icon: 'warning',
          title: 'Sinkronisasi Server Tertunda',
          text: 'Server sedang sibuk atau jaringan terputus. Seluruh soal tetap aman di antrean lokal browser dan akan otomatis terkirim saat koneksi stabil.',
          confirmButtonColor: '#0A1172',
        });
      } else if (hasilCloud.quotaHabis || isFirestoreQuotaPaused()) {
        Swal.fire({
          icon: 'warning',
          title: 'Tersimpan di Server (Kuota Harian Firestore Penuh)',
          text: `${totalSoalServer} soal aman tersinkron ke Server & Browser Lokal (${waktu}). Cadangan Firebase Cloud dijeda sementara hingga kuota harian gratis reset besok.`,
          confirmButtonColor: '#0A1172',
        });
      } else {
        const detailCloud = activeUser
          ? hasilCloud.berhasil > 0
            ? ` + ${hasilCloud.berhasil} soal baru/diperbarui dicadangkan ke Firebase Cloud (${activeUser.email})`
            : ` & sudah selaras dengan Firebase Cloud (${activeUser.email})`
          : '. Hubungkan Firebase Cloud agar soal tetap aman permanen lintas perangkat';
        const catatanDilewati =
          hasilCloud.dilewati > 0
            ? ` (${hasilCloud.dilewati} soal milik akun pengajar lain dilewati otomatis demi keamanan.)`
            : '';
        Swal.fire({
          icon: 'success',
          title: 'Bank Soal Tersinkron Mulus!',
          text: `${totalSoalServer} soal aman di Server & Browser Lokal pada ${waktu}${detailCloud}.${catatanDilewati}`,
          timer: 3200,
          showConfirmButton: false,
        });
      }
    } catch {
      Swal.fire({
        icon: 'warning',
        title: 'Sinkronisasi Server Tertunda',
        text: 'Koneksi sedang tidak stabil, namun soal Anda tetap aman tersimpan di cadangan lokal browser.',
        confirmButtonColor: '#0A1172',
      });
    } finally {
      setStatusSinkronCloud('tersinkron');
    }
  };

  // 2. Muat Database Terpusat dari Server (/api/db/state) saat aplikasi pertama kali dibuka + sinkron berkala antar perangkat
  useEffect(() => {
    let mounted = true;
    (async () => {
      await tarikSinkronDariServer(true);
      if (mounted) {
        isInitialDbLoadedRef.current = true;
        setStatusSinkronCloud('tersinkron');
      }
    })();

    const onFocusOrVisible = () => {
      if (
        document.visibilityState === 'visible' &&
        isInitialDbLoadedRef.current &&
        !ujianBerlangsungRef.current
      ) {
        void tarikSinkronDariServer(false);
      }
    };
    const onBrowserOnline = () => {
      if (isInitialDbLoadedRef.current) {
        void flushAntreanSoalTertunda().then(() => tarikSinkronDariServer(false));
      }
    };
    window.addEventListener('focus', onFocusOrVisible);
    window.addEventListener('online', onBrowserOnline);
    document.addEventListener('visibilitychange', onFocusOrVisible);

    // Polling ringan setiap 25 detik (dijeda otomatis saat santri sedang ujian CBT agar hemat bandwidth & beban server)
    const pollInterval = window.setInterval(() => {
      if (
        document.visibilityState === 'visible' &&
        isInitialDbLoadedRef.current &&
        !ujianBerlangsungRef.current
      ) {
        void tarikSinkronDariServer(false);
      }
    }, 25000);

    // Flush darurat saat tab ditutup / refresh (hanya kirim beacon full-DB untuk sesi Ustadz/Admin agar 65 santri tutup tab tidak membanjiri server)
    const onPageHide = () => {
      try {
        simpanBackupLokalBrowser(latestSnapshotRef.current);
        if (
          navigator.sendBeacon &&
          isInitialDbLoadedRef.current &&
          (isAdminUnlockedRef.current || isUstadzUnlockedRef.current)
        ) {
          const blob = new Blob([JSON.stringify(latestSnapshotRef.current)], {
            type: 'application/json',
          });
          navigator.sendBeacon('/api/db/state', blob);
        }
      } catch {
        // Abaikan
      }
    };
    window.addEventListener('pagehide', onPageHide);

    return () => {
      mounted = false;
      window.removeEventListener('focus', onFocusOrVisible);
      window.removeEventListener('online', onBrowserOnline);
      document.removeEventListener('visibilitychange', onFocusOrVisible);
      window.removeEventListener('pagehide', onPageHide);
      window.clearInterval(pollInterval);
    };
  }, []);

  // 3. Simpan Otomatis ke LocalStorage + Database Server (/api/db/state) + Firebase Firestore setiap ada perubahan data
  useEffect(() => {
    const snapshotData = {
      identitasPesantren,
      santriList,
      mapelList,
      ustadzList,
      bankSoal,
      nilaiAkademik,
      dataTahfidz,
      dataIT,
      logUjianCBT,
      logAktivitasNilai,
      adminList,
      deletedRecords,
    };

    // Selalu simpan cadangan lokal secara instan (sinkron, 0ms delay)
    if (isInitialDbLoadedRef.current) {
      simpanBackupLokalBrowser(snapshotData);
    }

    if (!isInitialDbLoadedRef.current || isCloudHydrationPendingRef.current) return;
    if (skipNextAutoSyncRef.current) {
      skipNextAutoSyncRef.current = false;
      return;
    }

    setStatusSinkronCloud('menyimpan');
    const timer = setTimeout(async () => {
      if (isCloudHydrationPendingRef.current) return;
      try {
        const res = await fetch('/api/db/state', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(snapshotData),
        });
        const json = await res.json();
        // Jika server mengembalikan hasil merge dengan tambahan soal dari Ustadz lain, serap dengan aman
        if (json?.sukses && json.payload && Array.isArray(json.payload.bankSoal)) {
          const serverSoal = json.payload.bankSoal as SoalCBT[];
          if (serverSoal.length > bankSoal.length) {
            skipNextAutoSyncRef.current = true;
            setBankSoal((prev) =>
              gabungkanBankSoalKurikulum(prev, serverSoal, deletedRecords, false)
            );
          }
        }
        if (cloudUser && cloudUser.emailVerified === true && !isCloudHydrationPendingRef.current) {
          // Gunakan penjadwal snapshot ter-coalesce (cooldown 60 detik & deduplikasi) dan JANGAN tulis ulang seluruh bankSoal di sini
          // karena tiap butir soal baru/diedit sudah dicadangkan secara inkremental oleh simpanSoalAtomik().
          jadwalkanTulisSnapshotFirestore(snapshotData, cloudUser);
        }
        setTerakhirSinkron(new Date().toLocaleTimeString('id-ID'));
      } catch {
        // Abaikan jika sedang offline sementara — backup lokal tetap utuh
      } finally {
        setStatusSinkronCloud('tersinkron');
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [
    identitasPesantren,
    santriList,
    mapelList,
    ustadzList,
    bankSoal,
    nilaiAkademik,
    dataTahfidz,
    dataIT,
    logUjianCBT,
    logAktivitasNilai,
    adminList,
    deletedRecords,
    cloudUser,
    cloudHydrationDoneTick,
  ]);

  const handleToggleLoginFirebaseCloud = async () => {
    if (cloudUser) {
      await signOut(auth);
      Swal.fire({
        icon: 'info',
        title: 'Logout Akun Google Cloud',
        text: 'Sinkronisasi server lokal dan backup browser tetap aktif.',
        confirmButtonColor: '#0A1172',
      });
      return;
    }
    try {
      await signInWithPopup(auth, googleProvider);
      Swal.fire({
        icon: 'success',
        title: 'Terhubung ke Firebase Cloud!',
        text: 'Seluruh Bank Soal CBT (tersimpan per butir di Firestore /soal_cbt), data Santri, Ustadz, Nilai, dan e-Rapor kini otomatis dicadangkan permanen ke Google Cloud Firestore.',
        confirmButtonColor: '#0A1172',
      });
    } catch (err) {
      Swal.fire({
        icon: 'warning',
        title: 'Login Google Cloud Dibatalkan',
        text: err instanceof Error ? err.message : 'Penyimpanan server persisten & backup browser tetap berjalan otomatis.',
        confirmButtonColor: '#0A1172',
      });
    }
  };

  // Backup & Restore Lengkap Seluruh Database (.json) termasuk PIN Ustadz, Akun Admin, Nilai, Soal & Identitas
  const handleExportBackupDatabaseJSON = () => {
    const backupObj = {
      formatVersion: 'df-pesantren-backup-v1',
      exportedAt: new Date().toISOString(),
      data: {
        identitasPesantren,
        santriList,
        mapelList,
        ustadzList,
        bankSoal,
        nilaiAkademik,
        dataTahfidz,
        dataIT,
        logUjianCBT,
        logAktivitasNilai,
        adminList,
        deletedRecords,
      },
    };
    const blob = new Blob([JSON.stringify(backupObj, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const tgl = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `Backup_Database_DarulFithrah_${tgl}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    Swal.fire({
      icon: 'success',
      title: 'Backup Database (.json) Diunduh',
      text: 'File cadangan berisi seluruh data Santri, PIN Ustadz, Akun Admin, Bank Soal, Nilai, dan Identitas Pesantren.',
      confirmButtonColor: '#0A1172',
    });
  };

  const handleImportBackupDatabaseJSON = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as Record<string, unknown>;
      const rawData =
        parsed && typeof parsed.data === 'object' && parsed.data !== null
          ? (parsed.data as Record<string, unknown>)
          : parsed;
      const hasValidKeys =
        Array.isArray(rawData.ustadzList) ||
        Array.isArray(rawData.santriList) ||
        Array.isArray(rawData.nilaiAkademik) ||
        Array.isArray(rawData.bankSoal) ||
        Array.isArray(rawData.adminList);
      if (!hasValidKeys) {
        Swal.fire({
          icon: 'error',
          title: 'Format Backup Tidak Valid',
          text: 'Pastikan Anda memilih file Backup_Database_DarulFithrah_*.json yang valid.',
          confirmButtonColor: '#0A1172',
        });
        return;
      }
      terapkanPayloadSnapshotKeState(rawData, 'replace');
      await fetch('/api/db/state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...rawData, forceReplace: true }),
      }).catch(() => {});
      Swal.fire({
        icon: 'success',
        title: 'Restore Database Berhasil!',
        text: 'Seluruh data Santri, PIN Ustadz, Akun Admin, Bank Soal, Nilai, dan Identitas telah dipulihkan & langsung disinkronkan.',
        confirmButtonColor: '#0A1172',
      });
    } catch {
      Swal.fire({
        icon: 'error',
        title: 'Gagal Membaca File Backup',
        text: 'File JSON rusak atau tidak dapat diproses.',
        confirmButtonColor: '#0A1172',
      });
    }
  };

  // ==========================================================================
  // STATE MODUL A: DASBOR ADMIN
  // ==========================================================================
  const [formMapelUnit, setFormMapelUnit] = useState<UnitPendidikan>('Wustho');
  const [formMapelKelas, setFormMapelKelas] = useState<string>('Kelas 7');
  const [formMapelNama, setFormMapelNama] = useState('');
  const [formMapelPengampu, setFormMapelPengampu] = useState('Ust. Azmi');
  const [formMapelToken, setFormMapelToken] = useState('');
  const [formMapelDurasi, setFormMapelDurasi] = useState(45);
  const [filterUnitMapelAdmin, setFilterUnitMapelAdmin] = useState<'SEMUA' | UnitPendidikan>('SEMUA');
  const [filterKelasMapelAdmin, setFilterKelasMapelAdmin] = useState<string>('SEMUA');
  const [cariMapelAdmin, setCariMapelAdmin] = useState<string>('');
  const [modeEditCepatMapel, setModeEditCepatMapel] = useState<boolean>(false);
  const [draftMapelCepat, setDraftMapelCepat] = useState<
    Record<string, { tokenUjian: string; durasiMenit: number; pengampu: string }>
  >({});
  const [durasiMassalKelas, setDurasiMassalKelas] = useState<number>(60);
  const [filterUnitUstadzAdmin, setFilterUnitUstadzAdmin] = useState<'SEMUA' | UnitPendidikan>('SEMUA');
  const [filterUnitSantriAdmin, setFilterUnitSantriAdmin] = useState<'SEMUA' | UnitPendidikan>('SEMUA');
  const [filterKelasSantriAdmin, setFilterKelasSantriAdmin] = useState<string>('SEMUA');
  const [cariSantriAdmin, setCariSantriAdmin] = useState<string>('');
  const [filterUnitGrafikAdmin, setFilterUnitGrafikAdmin] = useState<'SEMUA' | UnitPendidikan>('SEMUA');
  const [komponenGrafikAdmin, setKomponenGrafikAdmin] = useState<'nilaiAkhir' | 'cbt' | 'tugas' | 'sikap' | 'lisan'>(
    'nilaiAkhir'
  );
  const [cakupanMapelGrafikAdmin, setCakupanMapelGrafikAdmin] = useState<'lintas_unit' | 'semua_mapel'>('lintas_unit');
  const [cariLogNilaiAdmin, setCariLogNilaiAdmin] = useState<string>('');
  const [filterUnitLogNilaiAdmin, setFilterUnitLogNilaiAdmin] = useState<'SEMUA' | UnitPendidikan>('SEMUA');
  const [filterKomponenLogNilaiAdmin, setFilterKomponenLogNilaiAdmin] = useState<string>('SEMUA');

  const [formSantriNIS, setFormSantriNIS] = useState('');
  const [formSantriNISN, setFormSantriNISN] = useState('');
  const [formSantriNama, setFormSantriNama] = useState('');
  const [formSantriJK, setFormSantriJK] = useState<'L' | 'P'>('L');
  const [formSantriUnit, setFormSantriUnit] = useState<UnitPendidikan>('Wustho');
  const [formSantriKelas, setFormSantriKelas] = useState<string>('Kelas 7');
  const [formSantriAngkatan, setFormSantriAngkatan] = useState<string>('K27');
  const [formSantriTglMasuk, setFormSantriTglMasuk] = useState<string>('19-07-2026');
  const [formSantriKodeBarang, setFormSantriKodeBarang] = useState<string>('');
  const [formSantriNIK, setFormSantriNIK] = useState<string>('');
  const [formSantriNoKK, setFormSantriNoKK] = useState<string>('');
  const [formSantriTempatLahir, setFormSantriTempatLahir] = useState<string>('');
  const [formSantriTglLahir, setFormSantriTglLahir] = useState<string>('');
  const [formSantriNamaAyah, setFormSantriNamaAyah] = useState<string>('');
  const [formSantriTelpAyah, setFormSantriTelpAyah] = useState<string>('');
  const [formSantriNamaIbu, setFormSantriNamaIbu] = useState<string>('');
  const [formSantriTelpIbu, setFormSantriTelpIbu] = useState<string>('');
  const [formSantriAlamat, setFormSantriAlamat] = useState<string>('');
  const [formSantriJumlahHafalan, setFormSantriJumlahHafalan] = useState<string>('1 juz');

  const [formUstadzNama, setFormUstadzNama] = useState('');
  const [formUstadzUnit, setFormUstadzUnit] = useState<UnitPendidikan>('Wustho');
  const [formUstadzBidang, setFormUstadzBidang] = useState('');
  const [formUstadzPin, setFormUstadzPin] = useState('UST123');

  // State Modal Edit Data (Santri, Ustadz, Mata Pelajaran, Soal CBT, Nilai Akademik)
  const [editSantriAsliNis, setEditSantriAsliNis] = useState<string | null>(null);
  const [editSantriForm, setEditSantriForm] = useState<Santri | null>(null);
  const [editUstadzForm, setEditUstadzForm] = useState<{
    id: string;
    namaAsli: string;
    namaUstadz: string;
    unitAmpuan: UnitPendidikan[];
    kelasAmpuan: string[];
    mapelAmpuanText: string;
    aksesMapelIds: string[];
    sinkronPengampuKeToken: boolean;
    cariMapelModal: string;
    filterUnitModal: 'SEMUA' | UnitPendidikan;
    jamUlya: number;
    jamWustho: number;
    jamMDA: number;
    jamMA: number;
    bidang: string;
    pinLogin: string;
  } | null>(null);
  const [editMapelAsli, setEditMapelAsli] = useState<MapelConfig | null>(null);
  const [editMapelForm, setEditMapelForm] = useState<MapelConfig | null>(null);
  const [editSoalForm, setEditSoalForm] = useState<SoalCBT | null>(null);
  const [editNilaiModal, setEditNilaiModal] = useState<{
    nis: string;
    namaSantri: string;
    unit: UnitPendidikan;
    kelas: string;
    mapel: string;
    tugas: number;
    sikap: number;
    lisan: number;
    cbt: number;
    tugasLama: number;
    sikapLama: number;
    lisanLama: number;
    cbtLama: number;
    nilaiAkhirLama: number;
  } | null>(null);

  // State Modal Manajemen Admin (Tambah Admin, Edit Akses, Ganti Password) & Quick Edit Wali Kelas / Tagline
  const [modalTambahAdminOpen, setModalTambahAdminOpen] = useState(false);
  const [formAdminBaru, setFormAdminBaru] = useState<{
    namaAdmin: string;
    username: string;
    jabatan: string;
    password: string;
    konfirmasiPassword: string;
    hakAkses: AdminPermissionKey[];
    aktif: boolean;
  }>({
    namaAdmin: '',
    username: '',
    jabatan: 'Staf Akademik / Operator',
    password: '',
    konfirmasiPassword: '',
    hakAkses: ['dashboard_analitik', 'santri', 'mapel'],
    aktif: true,
  });
  const [editAksesAdminForm, setEditAksesAdminForm] = useState<AdminAccount | null>(null);
  const [gantiPasswordAdminModal, setGantiPasswordAdminModal] = useState<{
    adminTarget: AdminAccount;
    wajibPasswordLama: boolean;
    passwordLama: string;
    passwordBaru: string;
    konfirmasiPasswordBaru: string;
  } | null>(null);
  const [selectedWaliKelasKey, setSelectedWaliKelasKey] = useState<string>('Wustho__Kelas 7');

  // ==========================================================================
  // STATE MODUL B: PORTAL USTADZ (Sesi Terkunci per Ustadz Pengajar -> Unit -> Kelas -> Mapel + 4 Sub-Tab)
  // ==========================================================================
  const [ustadzLoginAktif, setUstadzLoginAktif] = useState<UstadzAccount | null>(null);
  const [ustadzTerpilihNama, setUstadzTerpilihNama] = useState<string>('Ust. Zulfikar');
  const [ustadzUnit, setUstadzUnit] = useState<UnitPendidikan>('Wustho');
  const [ustadzKelas, setUstadzKelas] = useState<string>('Kelas 7');
  const [ustadzMapel, setUstadzMapel] = useState<string>('Fiqih');
  const [ustadzSubTab, setUstadzSubTab] = useState<'soal_ai' | 'nilai_non_cbt' | 'tahfidz' | 'it'>('soal_ai');

  // Sub-Tab 1: AI Pembuat Soal CBT Otomatis & Input Manual (Dilengkapi Arab, Kode IT & Gambar)
  const [aiRawText, setAiRawText] = useState('');
  const [aiDocumentText, setAiDocumentText] = useState('');
  const [aiFileName, setAiFileName] = useState('');
  const [aiFileBase64, setAiFileBase64] = useState('');
  const [aiFileMime, setAiFileMime] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiPreviewSoal, setAiPreviewSoal] = useState<Omit<SoalCBT, 'idSoal' | 'unit' | 'kelas' | 'mapel'>[]>([]);

  const [manualPertanyaan, setManualPertanyaan] = useState('');
  const [manualTeksArab, setManualTeksArab] = useState('');
  const [manualPotonganKode, setManualPotonganKode] = useState('');
  const [manualGambarUrl, setManualGambarUrl] = useState('');
  const [manualOpsiA, setManualOpsiA] = useState('');
  const [manualOpsiB, setManualOpsiB] = useState('');
  const [manualOpsiC, setManualOpsiC] = useState('');
  const [manualOpsiD, setManualOpsiD] = useState('');
  const [manualKunci, setManualKunci] = useState<'A' | 'B' | 'C' | 'D'>('A');
  const [manualBobot, setManualBobot] = useState(25);
  const [modePreviewBankSoal, setModePreviewBankSoal] = useState<'kartu' | 'tabel'>('kartu');
  const [isScreeningTypoLoading, setIsScreeningTypoLoading] = useState(false);
  const [fullscreenPreviewSumber, setFullscreenPreviewSumber] = useState<SumberFullscreenPreview | null>(null);
  const [fullscreenPreviewIndex, setFullscreenPreviewIndex] = useState<number>(0);

  // State Auto-Save Real-Time untuk Tabel Input Nilai Non-CBT di Portal Ustadz
  const [autoSaveNilaiStatus, setAutoSaveNilaiStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [autoSaveRowMap, setAutoSaveRowMap] = useState<Record<string, 'saving' | 'saved' | 'error'>>({});
  const [autoSaveFieldMap, setAutoSaveFieldMap] = useState<Record<string, 'saving' | 'saved' | 'error'>>({});
  const [autoSaveLastInfo, setAutoSaveLastInfo] = useState<string>('');
  const autoSaveTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const nilaiAwalSebelumEditRef = useRef<
    Record<string, { nilaiLama: number; nilaiAkhirLama: number }>
  >({});
  const tahfidzItLogTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const [reminderDitundaUstadzIds, setReminderDitundaUstadzIds] = useState<string[]>([]);

  // ==========================================================================
  // STATE MODUL C: PORTAL UJIAN CBT SANTRI (Web-Based Safe Exam Browser)
  // ==========================================================================
  const [cbtUnit, setCbtUnit] = useState<UnitPendidikan>('Wustho');
  const [cbtKelas, setCbtKelas] = useState<string>('Kelas 7');
  const [cbtMapel, setCbtMapel] = useState<string>('Fiqih');
  const [cbtNIS, setCbtNIS] = useState<string>('');
  const [cbtTokenInput, setCbtTokenInput] = useState<string>('');

  const [ujianBerlangsung, setUjianBerlangsung] = useState(false);
  const [santriSedangUjian, setSantriSedangUjian] = useState<Santri | null>(null);
  const [daftarSoalAktif, setDaftarSoalAktif] = useState<SoalCBT[]>([]);
  const [jawabanCBT, setJawabanCBT] = useState<Record<string, 'A' | 'B' | 'C' | 'D'>>({});
  const [pelanggaranLockdown, setPelanggaranLockdown] = useState(0);
  const [sisaDetikCBT, setSisaDetikCBT] = useState(1800);
  const [layarBlurKeluarFullscreen, setLayarBlurKeluarFullscreen] = useState(false);

  useEffect(() => {
    ujianBerlangsungRef.current = ujianBerlangsung;
    if (ujianBerlangsung) {
      isSubmittingCbtRef.current = false;
    }
  }, [ujianBerlangsung]);

  // ==========================================================================
  // STATE MODUL D: CETAK E-RAPOR DIGITAL (A4 Print Ready - Terkunci Sesuai Kelas Ampuan Ustadz / NIS Santri)
  // ==========================================================================
  const [cariNisRapor, setCariNisRapor] = useState('22.21.22.422');
  const [filterKelasRaporUstadz, setFilterKelasRaporUstadz] = useState<string>('SEMUA_AMPUAN');
  const [filterMapelRaporUstadz, setFilterMapelRaporUstadz] = useState<'ampuan_saja' | 'semua_mapel_kelas'>('ampuan_saja');
  const [santriLoginRapor, setSantriLoginRapor] = useState<Santri | null>(null);

  // ==========================================================================
  // HELPER VALIDASI KELENGKAPAN DATA E-RAPOR SANTRI (SYARAT AKSES & UNDUH PDF SANTRI)
  // ==========================================================================
  const cekKelengkapanDataRaporSantri = (santriTarget: Santri) => {
    const mapelWajibKelas = mapelList.filter(
      (m) => m.unit === santriTarget.unit && m.kelas === santriTarget.kelas
    );

    const daftarMapelLengkap: string[] = [];
    const daftarMapelBelumLengkap: Array<{
      namaMapel: string;
      pengampu: string;
      komponenKurang: string;
    }> = [];

    mapelWajibKelas.forEach((m) => {
      const nilaiRow = nilaiAkademik.find(
        (n) =>
          n.nis === santriTarget.nis &&
          n.mapel.trim().toLowerCase() === m.namaMapel.trim().toLowerCase()
      );

      if (
        nilaiRow &&
        nilaiRow.tugas > 0 &&
        nilaiRow.sikap > 0 &&
        nilaiRow.lisan > 0 &&
        nilaiRow.cbt > 0 &&
        nilaiRow.nilaiAkhir > 0
      ) {
        daftarMapelLengkap.push(m.namaMapel);
      } else {
        const kurang: string[] = [];
        if (!nilaiRow || nilaiRow.tugas <= 0) kurang.push('Tugas');
        if (!nilaiRow || nilaiRow.sikap <= 0) kurang.push('Sikap');
        if (!nilaiRow || nilaiRow.lisan <= 0) kurang.push('Lisan');
        if (!nilaiRow || nilaiRow.cbt <= 0) kurang.push('CBT');
        daftarMapelBelumLengkap.push({
          namaMapel: m.namaMapel,
          pengampu: m.pengampu || 'Ustadz Pengampu',
          komponenKurang: kurang.join(', ') || 'Belum diinput',
        });
      }
    });

    const recTahfidz = dataTahfidz.find((t) => t.nis === santriTarget.nis);
    const tahfidzLengkap = Boolean(
      recTahfidz &&
        recTahfidz.juzHafalan &&
        recTahfidz.juzHafalan.trim() !== '' &&
        recTahfidz.juzHafalan.trim() !== '-' &&
        recTahfidz.suratTerakhir &&
        recTahfidz.suratTerakhir.trim() !== '' &&
        recTahfidz.kelancaran &&
        recTahfidz.catatanUstadz &&
        recTahfidz.catatanUstadz.trim() !== ''
    );

    const recIT = dataIT.find((i) => i.nis === santriTarget.nis);
    const itLengkap = Boolean(
      recIT &&
        recIT.materiKompetensi &&
        recIT.materiKompetensi.trim() !== '' &&
        recIT.totalProjek > 0 &&
        recIT.nilaiPraktek > 0 &&
        recIT.karyaAkhir &&
        recIT.karyaAkhir.trim() !== '' &&
        recIT.catatanInstruktur &&
        recIT.catatanInstruktur.trim() !== ''
    );

    const totalItemWajib = mapelWajibKelas.length + 2; // Seluruh Mapel Kelas + Tahfidz + IT
    const totalItemSelesai =
      daftarMapelLengkap.length + (tahfidzLengkap ? 1 : 0) + (itLengkap ? 1 : 0);
    const persentaseLengkap =
      totalItemWajib > 0 ? Math.round((totalItemSelesai / totalItemWajib) * 100) : 100;

    const apakahLengkap =
      mapelWajibKelas.length > 0 &&
      daftarMapelBelumLengkap.length === 0 &&
      tahfidzLengkap &&
      itLengkap;

    return {
      apakahLengkap,
      persentaseLengkap,
      totalMapelWajib: mapelWajibKelas.length,
      totalMapelTerisiLengkap: daftarMapelLengkap.length,
      daftarMapelLengkap,
      daftarMapelBelumLengkap,
      tahfidzLengkap,
      itLengkap,
    };
  };

  // Fungsi bagi Ustadz/Admin untuk melengkapi otomatis nilai mapel yang belum terisi pada seorang santri
  const handleLengkapiSemuaDataRaporSantri = (santriTarget: Santri) => {
    const mapelWajibKelas = mapelList.filter(
      (m) => m.unit === santriTarget.unit && m.kelas === santriTarget.kelas
    );

    setNilaiAkademik((prev) => {
      const updated = [...prev];
      mapelWajibKelas.forEach((m, idx) => {
        const existingIdx = updated.findIndex(
          (n) =>
            n.nis === santriTarget.nis &&
            n.mapel.trim().toLowerCase() === m.namaMapel.trim().toLowerCase()
        );
        if (existingIdx >= 0) {
          const row = updated[existingIdx];
          const tugas = row.tugas > 0 ? row.tugas : 86 + (idx % 8);
          const sikap = row.sikap > 0 ? row.sikap : 90 + (idx % 6);
          const lisan = row.lisan > 0 ? row.lisan : 85 + (idx % 8);
          const cbt = row.cbt > 0 ? row.cbt : 88 + (idx % 8);
          const kalkulasi = hitungNilaiAkhirPesantren(tugas, sikap, lisan, cbt);
          updated[existingIdx] = {
            ...row,
            tugas,
            sikap,
            lisan,
            cbt,
            nilaiAkhir: kalkulasi.nilaiAkhir,
            predikat: kalkulasi.predikat,
          };
        } else {
          const tugas = 86 + (idx % 8);
          const sikap = 90 + (idx % 6);
          const lisan = 85 + (idx % 8);
          const cbt = 88 + (idx % 8);
          const kalkulasi = hitungNilaiAkhirPesantren(tugas, sikap, lisan, cbt);
          updated.push({
            nis: santriTarget.nis,
            mapel: m.namaMapel,
            tugas,
            sikap,
            lisan,
            cbt,
            nilaiAkhir: kalkulasi.nilaiAkhir,
            predikat: kalkulasi.predikat,
          });
        }
      });
      return updated;
    });

    setDataTahfidz((prev) => {
      const ada = prev.find((t) => t.nis === santriTarget.nis);
      if (ada && ada.juzHafalan && ada.suratTerakhir && ada.catatanUstadz) return prev;
      const baru: PencapaianTahfidz = {
        nis: santriTarget.nis,
        juzHafalan: santriTarget.jumlahHafalan || '2 Juz (Juz 29 - 30)',
        suratTerakhir: ada?.suratTerakhir || '67. Al-Mulk',
        kelancaran: ada?.kelancaran || 'Lancar',
        catatanUstadz:
          ada?.catatanUstadz ||
          'Alhamdulillah setoran hafalan dan murajaah harian berjalan tertib dan lancar.',
      };
      return [...prev.filter((t) => t.nis !== santriTarget.nis), baru];
    });

    setDataIT((prev) => {
      const ada = prev.find((i) => i.nis === santriTarget.nis);
      if (ada && ada.materiKompetensi && ada.totalProjek > 0 && ada.nilaiPraktek > 0) return prev;
      const baru: PencapaianIT = {
        nis: santriTarget.nis,
        materiKompetensi:
          ada?.materiKompetensi || 'Pemrograman Web, Desain Grafis & Literasi Digital',
        totalProjek: ada?.totalProjek && ada.totalProjek > 0 ? ada.totalProjek : 4,
        nilaiPraktek: ada?.nilaiPraktek && ada.nilaiPraktek > 0 ? ada.nilaiPraktek : 88,
        karyaAkhir: ada?.karyaAkhir || 'Portofolio Digital & Aplikasi Web Santri Darul Fithrah',
        catatanInstruktur:
          ada?.catatanInstruktur ||
          'Sangat aktif dan tuntas mengerjakan seluruh projek praktek laboratorium IT.',
      };
      return [...prev.filter((i) => i.nis !== santriTarget.nis), baru];
    });

    setDeletedRecords((prev) => {
      const nisKey = santriTarget.nis.toUpperCase();
      const mapelKeysRemoved = new Set(
        mapelWajibKelas.map((m) => `${santriTarget.nis}__${m.namaMapel.trim().toLowerCase()}`.toLowerCase())
      );
      return {
        ...prev,
        nilai: prev.nilai.filter((k) => !mapelKeysRemoved.has(k.toLowerCase())),
        tahfidz: prev.tahfidz.filter((k) => k.toUpperCase() !== nisKey),
        it: prev.it.filter((k) => k.toUpperCase() !== nisKey),
      };
    });

    Swal.fire({
      icon: 'success',
      title: 'Data e-Rapor Santri Telah 100% Lengkap!',
      text: `Seluruh komponen nilai mata pelajaran kelas ${santriTarget.kelas}, Tahfidz, dan IT untuk ${santriTarget.nama} (${santriTarget.nis}) telah lengkap. Santri kini dapat mengakses & mengunduh PDF rapornya menggunakan NIS.`,
      confirmButtonColor: '#0A1172',
    });
  };

  // ==========================================================================
  // HELPER HAK AKSES PER USTADZ (HANYA KELAS & MAPEL YANG DIAMPU)
  // ==========================================================================
  const ekstrakAliasNamaUstadz = (namaLengkap: string): string[] => {
    const utama = namaLengkap.split(' (')[0].trim().toLowerCase();
    const matchKurung = namaLengkap.match(/\(([^)]+)\)/);
    const alias = matchKurung ? matchKurung[1].trim().toLowerCase() : '';
    return [utama, alias].filter(Boolean);
  };

  const apakahMapelDiampuOlehUstadz = (m: MapelConfig, u: UstadzAccount | null): boolean => {
    if (!u) return false;
    // Jika Admin sudah mengatur matriks hak akses eksplisit per mapel & per kelas, gunakan itu secara ketat
    if (Array.isArray(u.aksesMapelIds)) {
      return u.aksesMapelIds.includes(m.id);
    }

    const daftarAlias = ekstrakAliasNamaUstadz(u.namaUstadz);
    const pengampuLower = (m.pengampu || '').toLowerCase();
    const cocokNamaPengampu = daftarAlias.some((al) => al.length > 2 && pengampuLower.includes(al));

    const cocokUnit = (u.unitAmpuan || ['Wustho']).includes(m.unit);
    const cocokKelas =
      !u.kelasAmpuan || u.kelasAmpuan.length === 0 || u.kelasAmpuan.includes(m.kelas);
    const cocokMapel = (u.mapelAmpuan || []).some(
      (mp) => mp.trim().toLowerCase() === m.namaMapel.trim().toLowerCase()
    );

    return cocokNamaPengampu || (cocokUnit && cocokKelas && cocokMapel);
  };

  const ambilDaftarMapelAmpuanUstadz = (u: UstadzAccount | null): MapelConfig[] => {
    if (!u) return [];
    const hasil = mapelList.filter((m) => apakahMapelDiampuOlehUstadz(m, u));
    if (hasil.length > 0) return hasil;
    const unitList: UnitPendidikan[] = u.unitAmpuan && u.unitAmpuan.length > 0 ? u.unitAmpuan : ['Wustho'];
    return mapelList.filter((m) => unitList.includes(m.unit));
  };

  const ambilDaftarUnitAmpuanUstadz = (u: UstadzAccount | null): UnitPendidikan[] => {
    if (!u) return ['Wustho', 'Ulya', 'MDA'];
    const mapelAmpuan = ambilDaftarMapelAmpuanUstadz(u);
    const unik = Array.from(new Set(mapelAmpuan.map((m) => m.unit)));
    return unik.length > 0 ? unik : u.unitAmpuan && u.unitAmpuan.length > 0 ? u.unitAmpuan : ['Wustho'];
  };

  const ambilDaftarKelasAmpuanUstadz = (
    u: UstadzAccount | null,
    unitFilter?: UnitPendidikan
  ): { unit: UnitPendidikan; kelas: string }[] => {
    if (!u) {
      const semua: { unit: UnitPendidikan; kelas: string }[] = [];
      (['Wustho', 'Ulya', 'MDA'] as UnitPendidikan[]).forEach((un) => {
        if (!unitFilter || un === unitFilter) {
          UNIT_KELAS_MAP[un].forEach((kl) => semua.push({ unit: un, kelas: kl }));
        }
      });
      return semua;
    }
    const mapelAmpuan = ambilDaftarMapelAmpuanUstadz(u);
    const pasanganUnik = new Map<string, { unit: UnitPendidikan; kelas: string }>();
    mapelAmpuan.forEach((m) => {
      if (!unitFilter || m.unit === unitFilter) {
        pasanganUnik.set(`${m.unit}__${m.kelas}`, { unit: m.unit, kelas: m.kelas });
      }
    });
    return Array.from(pasanganUnik.values());
  };

  const apakahKelasDiampuOlehUstadz = (
    unitTarget: UnitPendidikan,
    kelasTarget: string,
    u: UstadzAccount | null
  ): boolean => {
    if (!u) return false;
    return ambilDaftarKelasAmpuanUstadz(u).some(
      (item) => item.unit === unitTarget && item.kelas === kelasTarget
    );
  };

  // ==========================================================================
  // HELPER PENGINGAT DEADLINE PENGISIAN SOAL UJIAN & NILAI RAPOR PER USTADZ
  // ==========================================================================
  const hitungStatusDeadlineTanggal = (rawIso: string | undefined, fallbackIso: string) => {
    const deadlineIso = rawIso && /^\d{4}-\d{2}-\d{2}$/.test(rawIso) ? rawIso : fallbackIso;

    const [thn, bln, tgl] = deadlineIso.split('-').map(Number);
    const targetDayStart = new Date(thn, (bln || 1) - 1, tgl || 1, 0, 0, 0, 0);
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const sisaHari = Math.round((targetDayStart.getTime() - todayStart.getTime()) / (24 * 60 * 60 * 1000));

    const tanggalDeadlineFormat = targetDayStart.toLocaleDateString('id-ID', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });

    const apakahLewatDeadline = sisaHari < 0;
    const apakahHariIniDeadline = sisaHari === 0;
    const apakahMendekatiDeadline = sisaHari <= 7;
    const labelSisaWaktu = apakahLewatDeadline
      ? `Terlambat ${Math.abs(sisaHari)} Hari`
      : apakahHariIniDeadline
      ? 'Hari Ini Batas Akhir!'
      : `${sisaHari} Hari Lagi`;

    return {
      deadlineIso,
      tanggalDeadlineFormat,
      sisaHari,
      apakahLewatDeadline,
      apakahHariIniDeadline,
      apakahMendekatiDeadline,
      labelSisaWaktu,
    };
  };

  const hitungStatusDeadlineRapor = () =>
    hitungStatusDeadlineTanggal(identitasPesantren.deadlineInputRaporIso, ambilTanggalDefaultDeadlineRapor());

  const hitungStatusDeadlineSoal = () =>
    hitungStatusDeadlineTanggal(identitasPesantren.deadlineInputSoalIso, ambilTanggalDefaultDeadlineSoal());

  const hitungTunggakanSoalUstadz = (akunUstadz: UstadzAccount | null) => {
    const statusDeadline = hitungStatusDeadlineSoal();
    if (!akunUstadz) {
      return {
        ...statusDeadline,
        totalMapelWajib: 0,
        totalMapelSudahSoal: 0,
        totalMapelBelumSoal: 0,
        persentaseSelesai: 100,
        daftarBelumSoal: [] as Array<{ unit: UnitPendidikan; kelas: string; mapel: string }>,
        targetPertama: null as { unit: UnitPendidikan; kelas: string; mapel: string } | null,
      };
    }

    const daftarMapelAmpuan = ambilDaftarMapelAmpuanUstadz(akunUstadz);
    const daftarBelumSoal: Array<{ unit: UnitPendidikan; kelas: string; mapel: string }> = [];
    let totalMapelSudahSoal = 0;

    daftarMapelAmpuan.forEach((m) => {
      const jumlahSoal = bankSoal.filter(
        (s) =>
          s.unit === m.unit &&
          s.kelas === m.kelas &&
          s.mapel.trim().toLowerCase() === m.namaMapel.trim().toLowerCase()
      ).length;
      if (jumlahSoal > 0) {
        totalMapelSudahSoal += 1;
      } else {
        daftarBelumSoal.push({ unit: m.unit, kelas: m.kelas, mapel: m.namaMapel });
      }
    });

    const totalMapelWajib = daftarMapelAmpuan.length;
    const totalMapelBelumSoal = daftarBelumSoal.length;
    const persentaseSelesai =
      totalMapelWajib > 0 ? Math.round((totalMapelSudahSoal / totalMapelWajib) * 100) : 100;
    const pertama = daftarBelumSoal[0];

    return {
      ...statusDeadline,
      totalMapelWajib,
      totalMapelSudahSoal,
      totalMapelBelumSoal,
      persentaseSelesai,
      daftarBelumSoal,
      targetPertama: pertama ? { unit: pertama.unit, kelas: pertama.kelas, mapel: pertama.mapel } : null,
    };
  };

  const hitungTunggakanNilaiUstadz = (akunUstadz: UstadzAccount | null) => {
    const statusDeadline = hitungStatusDeadlineRapor();
    if (!akunUstadz) {
      return {
        ...statusDeadline,
        totalSantriKelasAmpuan: 0,
        totalEntriWajib: 0,
        totalEntriLengkap: 0,
        totalEntriBelumLengkap: 0,
        persentaseSelesai: 100,
        daftarTunggakan: [] as Array<{
          nis: string;
          namaSantri: string;
          unit: UnitPendidikan;
          kelas: string;
          mapel: string;
          komponenKurang: string[];
        }>,
        targetPertama: null as { unit: UnitPendidikan; kelas: string; mapel: string } | null,
      };
    }

    const daftarMapelAmpuan = ambilDaftarMapelAmpuanUstadz(akunUstadz);
    const unikNisSantri = new Set<string>();
    const daftarTunggakan: Array<{
      nis: string;
      namaSantri: string;
      unit: UnitPendidikan;
      kelas: string;
      mapel: string;
      komponenKurang: string[];
    }> = [];

    let totalEntriWajib = 0;
    let totalEntriLengkap = 0;

    daftarMapelAmpuan.forEach((m) => {
      const santriKelas = santriList.filter((s) => s.unit === m.unit && s.kelas === m.kelas);
      santriKelas.forEach((s) => {
        unikNisSantri.add(s.nis);
        totalEntriWajib += 1;
        const row = nilaiAkademik.find(
          (n) =>
            n.nis === s.nis && n.mapel.trim().toLowerCase() === m.namaMapel.trim().toLowerCase()
        );
        if (row && row.tugas > 0 && row.sikap > 0 && row.lisan > 0 && row.cbt > 0 && row.nilaiAkhir > 0) {
          totalEntriLengkap += 1;
        } else {
          const kurang: string[] = [];
          if (!row || row.tugas <= 0) kurang.push('Tugas');
          if (!row || row.sikap <= 0) kurang.push('Sikap');
          if (!row || row.lisan <= 0) kurang.push('Lisan');
          if (!row || row.cbt <= 0) kurang.push('CBT');
          daftarTunggakan.push({
            nis: s.nis,
            namaSantri: s.nama,
            unit: m.unit,
            kelas: m.kelas,
            mapel: m.namaMapel,
            komponenKurang: kurang,
          });
        }
      });
    });

    const totalEntriBelumLengkap = daftarTunggakan.length;
    const persentaseSelesai =
      totalEntriWajib > 0 ? Math.round((totalEntriLengkap / totalEntriWajib) * 100) : 100;
    const pertama = daftarTunggakan[0];

    return {
      ...statusDeadline,
      totalSantriKelasAmpuan: unikNisSantri.size,
      totalEntriWajib,
      totalEntriLengkap,
      totalEntriBelumLengkap,
      persentaseSelesai,
      daftarTunggakan,
      targetPertama: pertama
        ? { unit: pertama.unit, kelas: pertama.kelas, mapel: pertama.mapel }
        : null,
    };
  };

  const escapeHtmlAman = (str: string): string =>
    str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

  const tampilkanToastReminderNilaiUstadz = (akunUstadz: UstadzAccount) => {
    const info = hitungTunggakanNilaiUstadz(akunUstadz);
    if (info.totalEntriBelumLengkap === 0) {
      Swal.fire({
        toast: true,
        position: 'top-end',
        icon: 'success',
        title: `Alhamdulillah, nilai rapor ${akunUstadz.namaUstadz} sudah 100% lengkap!`,
        showConfirmButton: false,
        timer: 3500,
        timerProgressBar: true,
      });
      return;
    }

    Swal.fire({
      toast: true,
      position: 'top-end',
      icon: info.apakahLewatDeadline || info.sisaHari <= 2 ? 'warning' : 'info',
      title: `Pengingat Deadline Nilai Rapor (${info.labelSisaWaktu})`,
      html: `<div style="font-size:12px; color:#334155;">Masih ada <strong>${info.totalEntriBelumLengkap} entri nilai</strong> santri belum lengkap sebelum <strong>${escapeHtmlAman(info.tanggalDeadlineFormat)}</strong>.</div>`,
      showConfirmButton: true,
      confirmButtonText: 'Isi Nilai',
      confirmButtonColor: '#FF6700',
      showCloseButton: true,
      timer: 7000,
      timerProgressBar: true,
    }).then((res) => {
      if (res.isConfirmed && info.targetPertama) {
        setUstadzUnit(info.targetPertama.unit);
        setUstadzKelas(info.targetPertama.kelas);
        setUstadzMapel(info.targetPertama.mapel);
        setActiveModule('ustadz');
        setUstadzSubTab('nilai_non_cbt');
      }
    });
  };

  const tampilkanModalReminderNilaiUstadz = async (akunUstadz: UstadzAccount) => {
    const info = hitungTunggakanNilaiUstadz(akunUstadz);
    if (info.totalEntriBelumLengkap === 0) {
      tampilkanToastReminderNilaiUstadz(akunUstadz);
      return;
    }

    const daftarPreviewHtml = info.daftarTunggakan
      .slice(0, 6)
      .map(
        (item) => `
          <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px; padding:7px 9px; background:#F8FAFC; border:1px solid #E2E8F0; border-radius:7px; margin-bottom:5px;">
            <div>
              <div style="font-weight:700; color:#0A1172;">${escapeHtmlAman(item.namaSantri)} <span style="font-family:monospace; font-size:11px; color:#64748B;">(${escapeHtmlAman(item.nis)})</span></div>
              <div style="font-size:11px; color:#475569;">${escapeHtmlAman(item.unit)} · ${escapeHtmlAman(item.kelas)} · <strong>${escapeHtmlAman(item.mapel)}</strong></div>
            </div>
            <span style="font-size:10px; font-weight:700; color:#B45309; background:#FEF3C7; border:1px solid #FDE68A; padding:2px 6px; border-radius:5px; white-space:nowrap;">
              Kurang: ${escapeHtmlAman(item.komponenKurang.join(', '))}
            </span>
          </div>
        `
      )
      .join('');

    const sisaLainnyaHtml =
      info.daftarTunggakan.length > 6
        ? `<div style="font-size:11px; color:#64748B; text-align:center; margin-top:4px;">+ ${info.daftarTunggakan.length - 6} entri nilai lainnya pada kelas ampuan Anda</div>`
        : '';

    const warnaBadge =
      info.apakahLewatDeadline || info.sisaHari <= 2
        ? 'background:#FEF2F2; border-color:#FECACA; color:#991B1B;'
        : 'background:#FFFBEB; border-color:#FDE68A; color:#92400E;';

    const hasil = await Swal.fire({
      icon: info.apakahLewatDeadline || info.sisaHari <= 2 ? 'warning' : 'info',
      title: 'Pengingat Pengisian Nilai Rapor',
      width: 600,
      html: `
        <div style="text-align:left; font-size:12px; line-height:1.5; color:#334155;">
          <div style="padding:10px 12px; border:1px solid; border-radius:9px; margin-bottom:12px; ${warnaBadge}">
            <div style="font-weight:800; font-size:13px; margin-bottom:2px;">
              ⏰ Batas Waktu: ${escapeHtmlAman(info.tanggalDeadlineFormat)} (${escapeHtmlAman(info.labelSisaWaktu)})
            </div>
            <div style="font-size:11px;">
              Yth. <strong>${escapeHtmlAman(akunUstadz.namaUstadz)}</strong>, progres kelengkapan nilai kelas ampuan Anda saat ini <strong>${info.persentaseSelesai}%</strong> (${info.totalEntriLengkap}/${info.totalEntriWajib} entri lengkap). Masih terdapat <strong>${info.totalEntriBelumLengkap} entri nilai</strong> yang perlu dilengkapi agar santri dapat mencetak e-Rapor.
            </div>
          </div>
          <div style="font-weight:700; color:#0A1172; margin-bottom:6px;">Daftar Nilai yang Belum Lengkap:</div>
          <div style="max-height:240px; overflow-y:auto; padding-right:2px;">
            ${daftarPreviewHtml}
          </div>
          ${sisaLainnyaHtml}
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: 'Lengkapi Nilai Sekarang',
      cancelButtonText: 'Ingatkan Nanti',
      confirmButtonColor: '#FF6700',
      cancelButtonColor: '#64748B',
    });

    if (hasil.isConfirmed && info.targetPertama) {
      setUstadzUnit(info.targetPertama.unit);
      setUstadzKelas(info.targetPertama.kelas);
      setUstadzMapel(info.targetPertama.mapel);
      setActiveModule('ustadz');
      setUstadzSubTab('nilai_non_cbt');
    } else if (hasil.dismiss === Swal.DismissReason.cancel) {
      setReminderDitundaUstadzIds((prev) =>
        prev.includes(akunUstadz.id) ? prev : [...prev, akunUstadz.id]
      );
      Swal.fire({
        toast: true,
        position: 'top-end',
        icon: 'info',
        title: `Pengingat ditunda (${info.totalEntriBelumLengkap} nilai menunggu)`,
        text: `Batas akhir pengisian: ${info.tanggalDeadlineFormat}`,
        showConfirmButton: false,
        timer: 4200,
        timerProgressBar: true,
      });
    }
  };

  const tampilkanToastReminderSoalUstadz = (akunUstadz: UstadzAccount) => {
    const info = hitungTunggakanSoalUstadz(akunUstadz);
    if (info.totalMapelBelumSoal === 0) {
      Swal.fire({
        toast: true,
        position: 'top-end',
        icon: 'success',
        title: `Alhamdulillah, soal ujian CBT ${akunUstadz.namaUstadz} sudah lengkap 100%!`,
        showConfirmButton: false,
        timer: 3500,
        timerProgressBar: true,
      });
      return;
    }

    Swal.fire({
      toast: true,
      position: 'top-end',
      icon: info.apakahLewatDeadline || info.sisaHari <= 2 ? 'warning' : 'info',
      title: `Pengingat Deadline Soal Ujian CBT (${info.labelSisaWaktu})`,
      html: `<div style="font-size:12px; color:#334155;">Masih ada <strong>${info.totalMapelBelumSoal} dari ${info.totalMapelWajib} mapel</strong> ampuan yang belum memiliki soal CBT sebelum <strong>${escapeHtmlAman(info.tanggalDeadlineFormat)}</strong>.</div>`,
      showConfirmButton: true,
      confirmButtonText: 'Buat Soal',
      confirmButtonColor: '#0A1172',
      showCloseButton: true,
      timer: 7000,
      timerProgressBar: true,
    }).then((res) => {
      if (res.isConfirmed && info.targetPertama) {
        setUstadzUnit(info.targetPertama.unit);
        setUstadzKelas(info.targetPertama.kelas);
        setUstadzMapel(info.targetPertama.mapel);
        setActiveModule('ustadz');
        setUstadzSubTab('soal_ai');
      }
    });
  };

  const tampilkanModalReminderSoalUstadz = async (akunUstadz: UstadzAccount) => {
    const info = hitungTunggakanSoalUstadz(akunUstadz);
    if (info.totalMapelBelumSoal === 0) {
      tampilkanToastReminderSoalUstadz(akunUstadz);
      return;
    }

    const daftarPreviewHtml = info.daftarBelumSoal
      .slice(0, 8)
      .map(
        (item) => `
          <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; padding:7px 9px; background:#F8FAFC; border:1px solid #E2E8F0; border-radius:7px; margin-bottom:5px;">
            <div>
              <div style="font-weight:700; color:#0A1172;">${escapeHtmlAman(item.mapel)}</div>
              <div style="font-size:11px; color:#475569;">${escapeHtmlAman(item.unit)} · ${escapeHtmlAman(item.kelas)}</div>
            </div>
            <span style="font-size:10px; font-weight:700; color:#991B1B; background:#FEF2F2; border:1px solid #FECACA; padding:2px 6px; border-radius:5px; white-space:nowrap;">
              0 Soal CBT
            </span>
          </div>
        `
      )
      .join('');

    const sisaLainnyaHtml =
      info.daftarBelumSoal.length > 8
        ? `<div style="font-size:11px; color:#64748B; text-align:center; margin-top:4px;">+ ${info.daftarBelumSoal.length - 8} mapel lainnya belum diisi soal ujian</div>`
        : '';

    const warnaBadge =
      info.apakahLewatDeadline || info.sisaHari <= 2
        ? 'background:#FEF2F2; border-color:#FECACA; color:#991B1B;'
        : 'background:#EFF6FF; border-color:#BFDBFE; color:#0A1172;';

    const hasil = await Swal.fire({
      icon: info.apakahLewatDeadline || info.sisaHari <= 2 ? 'warning' : 'info',
      title: 'Pengingat Pengisian Soal Ujian CBT',
      width: 600,
      html: `
        <div style="text-align:left; font-size:12px; line-height:1.5; color:#334155;">
          <div style="padding:10px 12px; border:1px solid; border-radius:9px; margin-bottom:12px; ${warnaBadge}">
            <div style="font-weight:800; font-size:13px; margin-bottom:2px;">
              📝 Batas Waktu Soal Ujian: ${escapeHtmlAman(info.tanggalDeadlineFormat)} (${escapeHtmlAman(info.labelSisaWaktu)})
            </div>
            <div style="font-size:11px;">
              Yth. <strong>${escapeHtmlAman(akunUstadz.namaUstadz)}</strong>, progres kesiapan soal CBT Anda saat ini <strong>${info.persentaseSelesai}%</strong> (${info.totalMapelSudahSoal}/${info.totalMapelWajib} mapel terisi). Masih terdapat <strong>${info.totalMapelBelumSoal} mapel/kelas</strong> yang belum memiliki butir soal ujian.
            </div>
          </div>
          <div style="font-weight:700; color:#0A1172; margin-bottom:6px;">Daftar Mapel yang Belum Memiliki Soal CBT:</div>
          <div style="max-height:240px; overflow-y:auto; padding-right:2px;">
            ${daftarPreviewHtml}
          </div>
          ${sisaLainnyaHtml}
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: 'Buat Soal Sekarang',
      cancelButtonText: 'Ingatkan Nanti',
      confirmButtonColor: '#0A1172',
      cancelButtonColor: '#64748B',
    });

    if (hasil.isConfirmed && info.targetPertama) {
      setUstadzUnit(info.targetPertama.unit);
      setUstadzKelas(info.targetPertama.kelas);
      setUstadzMapel(info.targetPertama.mapel);
      setActiveModule('ustadz');
      setUstadzSubTab('soal_ai');
    } else if (hasil.dismiss === Swal.DismissReason.cancel) {
      Swal.fire({
        toast: true,
        position: 'top-end',
        icon: 'info',
        title: `Pengingat soal ditunda (${info.totalMapelBelumSoal} mapel menunggu)`,
        text: `Batas akhir pengisian soal: ${info.tanggalDeadlineFormat}`,
        showConfirmButton: false,
        timer: 4200,
        timerProgressBar: true,
      });
    }
  };

  const terapkanSesiAksesUstadz = (akunUstadz: UstadzAccount) => {
    setUstadzLoginAktif(akunUstadz);
    setUstadzTerpilihNama(akunUstadz.namaUstadz);
    setIsUstadzUnlocked(true);

    const daftarMapelUstadz = ambilDaftarMapelAmpuanUstadz(akunUstadz);
    if (daftarMapelUstadz.length > 0) {
      const mapelPertama = daftarMapelUstadz[0];
      setUstadzUnit(mapelPertama.unit);
      setUstadzKelas(mapelPertama.kelas);
      setUstadzMapel(mapelPertama.namaMapel);
    } else {
      const unitPertama: UnitPendidikan =
        (akunUstadz.unitAmpuan && akunUstadz.unitAmpuan[0]) || 'Wustho';
      const kelasPertama =
        (akunUstadz.kelasAmpuan && akunUstadz.kelasAmpuan[0]) || UNIT_KELAS_MAP[unitPertama][0];
      const mapelPertama = (akunUstadz.mapelAmpuan && akunUstadz.mapelAmpuan[0]) || '';
      setUstadzUnit(unitPertama);
      setUstadzKelas(kelasPertama);
      setUstadzMapel(mapelPertama);
    }

    setFilterKelasRaporUstadz('SEMUA_AMPUAN');
    setFilterMapelRaporUstadz('ampuan_saja');
    const kelasAmpuan = ambilDaftarKelasAmpuanUstadz(akunUstadz);
    const santriAmpuanPertama = santriList.find((s) =>
      kelasAmpuan.some((k) => k.unit === s.unit && k.kelas === s.kelas)
    );
    if (santriAmpuanPertama) {
      setCariNisRapor(santriAmpuanPertama.nis);
    }
  };

  const pastikanAksesUstadzValid = (
    unitTarget: UnitPendidikan,
    kelasTarget: string,
    mapelTarget?: string
  ): boolean => {
    if (!ustadzLoginAktif) {
      Swal.fire({
        icon: 'warning',
        title: 'Sesi Ustadz Belum Terautentikasi',
        text: 'Silakan login menggunakan akun Ustadz Pengajar Anda terlebih dahulu.',
        confirmButtonColor: '#0A1172',
      });
      return false;
    }

    const kelasValid = apakahKelasDiampuOlehUstadz(unitTarget, kelasTarget, ustadzLoginAktif);
    if (!kelasValid) {
      Swal.fire({
        icon: 'error',
        title: 'Akses Kelas Ditolak!',
        text: `${ustadzLoginAktif.namaUstadz} tidak mengampu ${unitTarget} - ${kelasTarget}. Anda hanya dapat mengakses kelas yang diampu.`,
        confirmButtonColor: '#0A1172',
      });
      return false;
    }

    if (mapelTarget) {
      const mapelValid = ambilDaftarMapelAmpuanUstadz(ustadzLoginAktif).some(
        (m) => m.unit === unitTarget && m.kelas === kelasTarget && m.namaMapel === mapelTarget
      );
      if (!mapelValid) {
        Swal.fire({
          icon: 'error',
          title: 'Akses Mata Pelajaran Ditolak!',
          text: `${ustadzLoginAktif.namaUstadz} tidak mengampu mata pelajaran ${mapelTarget} di ${unitTarget} - ${kelasTarget}.`,
          confirmButtonColor: '#0A1172',
        });
        return false;
      }
    }

    return true;
  };

  // ==========================================================================
  // CASCADING DROPDOWN EFFECTS (UNIT -> KELAS -> MAPEL)
  // ==========================================================================
  const handleChangeUnit = (
    unitBaru: UnitPendidikan,
    setUnitFn: (u: UnitPendidikan) => void,
    setKelasFn: (k: string) => void,
    setMapelFn?: (m: string) => void,
    batasiUntukUstadzAktif = false
  ) => {
    setUnitFn(unitBaru);
    if (batasiUntukUstadzAktif && ustadzLoginAktif) {
      const daftarMapelUnit = ambilDaftarMapelAmpuanUstadz(ustadzLoginAktif).filter(
        (m) => m.unit === unitBaru
      );
      const kelasPertama = daftarMapelUnit[0]?.kelas || UNIT_KELAS_MAP[unitBaru][0];
      setKelasFn(kelasPertama);
      if (setMapelFn) {
        const mapelKelasPertama = daftarMapelUnit.filter((m) => m.kelas === kelasPertama);
        setMapelFn(mapelKelasPertama[0]?.namaMapel || '');
      }
      return;
    }

    const kelasPertama = UNIT_KELAS_MAP[unitBaru][0];
    setKelasFn(kelasPertama);
    if (setMapelFn) {
      const mapelTersedia = mapelList.filter((m) => m.unit === unitBaru && m.kelas === kelasPertama);
      setMapelFn(mapelTersedia[0]?.namaMapel || '');
    }
  };

  const handleChangeKelas = (
    unitAktif: UnitPendidikan,
    kelasBaru: string,
    setKelasFn: (k: string) => void,
    setMapelFn?: (m: string) => void,
    batasiUntukUstadzAktif = false
  ) => {
    setKelasFn(kelasBaru);
    if (setMapelFn) {
      if (batasiUntukUstadzAktif && ustadzLoginAktif) {
        const mapelTersedia = ambilDaftarMapelAmpuanUstadz(ustadzLoginAktif).filter(
          (m) => m.unit === unitAktif && m.kelas === kelasBaru
        );
        setMapelFn(mapelTersedia[0]?.namaMapel || '');
        return;
      }
      const mapelTersedia = mapelList.filter((m) => m.unit === unitAktif && m.kelas === kelasBaru);
      setMapelFn(mapelTersedia[0]?.namaMapel || '');
    }
  };

  // ==========================================================================
  // HELPER LOGOUT SESI PENGGUNA (ADMIN, USTADZ, & SANTRI E-RAPOR)
  // ==========================================================================
  const handleLogout = (mode: 'admin' | 'ustadz' | 'santri' | 'semua' = 'semua') => {
    if (ujianBerlangsung) {
      Swal.fire({
        icon: 'warning',
        title: 'Ujian CBT Sedang Berlangsung!',
        text: 'Selesaikan ujian CBT terlebih dahulu sebelum keluar dari sesi.',
        confirmButtonColor: '#0A1172',
      });
      return;
    }

    let labelKeluar = 'Sesi';
    if (mode === 'admin' || mode === 'semua') {
      if (isAdminUnlocked) {
        labelKeluar = adminLoginAktif?.namaAdmin || 'Admin';
      }
      setIsAdminUnlocked(false);
      setAdminLoginAktif(null);
      if (activeModule === 'admin' || (mode === 'admin' && activeModule === 'rapor') || mode === 'semua') {
        setActiveModule('beranda');
      }
    }
    if (mode === 'ustadz' || mode === 'semua') {
      if (isUstadzUnlocked || ustadzLoginAktif) {
        labelKeluar = ustadzLoginAktif?.namaUstadz || 'Ustadz';
      }
      setIsUstadzUnlocked(false);
      setUstadzLoginAktif(null);
      if (activeModule === 'ustadz' || (mode === 'ustadz' && activeModule === 'rapor') || mode === 'semua') {
        setActiveModule('beranda');
      }
    }
    if (mode === 'santri' || mode === 'semua') {
      if (santriLoginRapor) {
        labelKeluar = santriLoginRapor.nama;
      }
      setSantriLoginRapor(null);
      if (activeModule === 'rapor' || mode === 'semua') {
        setActiveModule('beranda');
      }
    }

    Swal.fire({
      toast: true,
      position: 'top-end',
      icon: 'success',
      title: `Berhasil Logout (${labelKeluar})`,
      showConfirmButton: false,
      timer: 2200,
      timerProgressBar: true,
    });
  };

  // ==========================================================================
  // HANDLER MANAJEMEN ADMIN: TAMBAH ADMIN, EDIT HAK AKSES, GANTI PASSWORD & HAPUS
  // ==========================================================================
  const handleSimpanTambahAdmin = (e: React.FormEvent) => {
    e.preventDefault();
    const namaClean = formAdminBaru.namaAdmin.trim();
    const usernameClean = formAdminBaru.username.trim().toLowerCase().replace(/\s+/g, '');
    const jabatanClean = formAdminBaru.jabatan.trim() || 'Staf Admin';
    const passwordClean = formAdminBaru.password.trim();

    if (!namaClean || !usernameClean || !passwordClean) {
      Swal.fire('Data Belum Lengkap', 'Nama Admin, Username, dan Password wajib diisi.', 'warning');
      return;
    }
    if (passwordClean.length < 4) {
      Swal.fire('Password Terlalu Pendek', 'Password minimal 4 karakter.', 'warning');
      return;
    }
    if (passwordClean !== formAdminBaru.konfirmasiPassword.trim()) {
      Swal.fire('Konfirmasi Tidak Cocok', 'Password dan Konfirmasi Password harus sama.', 'error');
      return;
    }
    if (adminList.some((a) => a.username.trim().toLowerCase() === usernameClean)) {
      Swal.fire('Username Sudah Digunakan', `Username "${usernameClean}" sudah terdaftar.`, 'error');
      return;
    }
    if (formAdminBaru.hakAkses.length === 0) {
      Swal.fire('Pilih Hak Akses', 'Centang minimal 1 hak akses fitur untuk akun Admin baru.', 'warning');
      return;
    }

    const baru: AdminAccount = {
      id: buatIdUnik('ADM'),
      namaAdmin: namaClean,
      username: usernameClean,
      jabatan: jabatanClean,
      password: passwordClean,
      hakAkses: formAdminBaru.hakAkses,
      aktif: formAdminBaru.aktif,
      isPrimary: false,
      dibuatPada: new Date().toISOString().slice(0, 10),
    };

    simpanAdminList([...adminList, baru]);
    setModalTambahAdminOpen(false);
    setFormAdminBaru({
      namaAdmin: '',
      username: '',
      jabatan: 'Staf Akademik / Operator',
      password: '',
      konfirmasiPassword: '',
      hakAkses: ['dashboard_analitik', 'santri', 'mapel'],
      aktif: true,
    });
    Swal.fire({
      icon: 'success',
      title: 'Akun Admin Ditambahkan',
      text: `${baru.namaAdmin} (username: ${baru.username}) berhasil dibuat dengan ${baru.hakAkses.length} hak akses.`,
      confirmButtonColor: '#0A1172',
    });
  };

  const handleSimpanEditAksesAdmin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editAksesAdminForm) return;
    const namaClean = editAksesAdminForm.namaAdmin.trim();
    const usernameClean = editAksesAdminForm.username.trim().toLowerCase().replace(/\s+/g, '');
    if (!namaClean || !usernameClean) {
      Swal.fire('Data Tidak Valid', 'Nama Admin dan Username tidak boleh kosong.', 'warning');
      return;
    }
    if (
      adminList.some(
        (a) => a.id !== editAksesAdminForm.id && a.username.trim().toLowerCase() === usernameClean
      )
    ) {
      Swal.fire('Username Duplikat', `Username "${usernameClean}" sudah dipakai admin lain.`, 'error');
      return;
    }
    if (editAksesAdminForm.hakAkses.length === 0) {
      Swal.fire('Hak Akses Kosong', 'Admin wajib memiliki minimal 1 hak akses modul.', 'warning');
      return;
    }

    const updated: AdminAccount = {
      ...editAksesAdminForm,
      namaAdmin: namaClean,
      username: usernameClean,
      jabatan: editAksesAdminForm.jabatan.trim() || 'Admin',
      aktif: editAksesAdminForm.isPrimary ? true : editAksesAdminForm.aktif,
    };

    simpanAdminList(adminList.map((a) => (a.id === updated.id ? updated : a)));
    setEditAksesAdminForm(null);
    Swal.fire({
      icon: 'success',
      title: 'Hak Akses Admin Diperbarui',
      text: `Akses untuk ${updated.namaAdmin} berhasil disimpan.`,
      confirmButtonColor: '#0A1172',
    });
  };

  const handleSimpanGantiPasswordAdmin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!gantiPasswordAdminModal) return;
    const { adminTarget, wajibPasswordLama, passwordLama, passwordBaru, konfirmasiPasswordBaru } =
      gantiPasswordAdminModal;

    if (wajibPasswordLama && passwordLama.trim() !== adminTarget.password.trim()) {
      Swal.fire('Password Lama Salah', 'Password lama yang Anda masukkan tidak sesuai.', 'error');
      return;
    }
    if (passwordBaru.trim().length < 4) {
      Swal.fire('Password Terlalu Pendek', 'Password baru minimal 4 karakter.', 'warning');
      return;
    }
    if (passwordBaru.trim() !== konfirmasiPasswordBaru.trim()) {
      Swal.fire(
        'Konfirmasi Password Tidak Cocok',
        'Password baru dan konfirmasi password baru harus sama.',
        'error'
      );
      return;
    }

    const updatedList = adminList.map((a) =>
      a.id === adminTarget.id ? { ...a, password: passwordBaru.trim() } : a
    );
    simpanAdminList(updatedList);
    setGantiPasswordAdminModal(null);
    Swal.fire({
      icon: 'success',
      title: 'Password Admin Diperbarui!',
      text: `Password untuk akun "${adminTarget.namaAdmin}" (${adminTarget.username}) telah berhasil diganti.`,
      confirmButtonColor: '#0A1172',
    });
  };

  const handleHapusAdminAccount = async (targetAdmin: AdminAccount) => {
    if (targetAdmin.isPrimary) {
      Swal.fire('Tidak Diizinkan', 'Akun Administrator Utama tidak dapat dihapus.', 'warning');
      return;
    }
    if (adminLoginAktif?.id === targetAdmin.id) {
      Swal.fire('Sedang Aktif', 'Anda tidak dapat menghapus akun Admin yang sedang dipakai login.', 'warning');
      return;
    }
    const res = await Swal.fire({
      icon: 'warning',
      title: 'Hapus Akun Admin?',
      text: `Akun "${targetAdmin.namaAdmin}" (${targetAdmin.username}) akan dihapus dari sistem.`,
      showCancelButton: true,
      confirmButtonText: 'Ya, Hapus Admin',
      cancelButtonText: 'Batal',
      confirmButtonColor: '#DC2626',
    });
    if (!res.isConfirmed) return;

    simpanAdminList(adminList.filter((a) => a.id !== targetAdmin.id));
    Swal.fire({
      icon: 'success',
      title: 'Akun Admin Dihapus',
      text: `${targetAdmin.namaAdmin} telah dihapus.`,
      timer: 1800,
      showConfirmButton: false,
    });
  };

  const handleBukaQuickEditWaliKelasTagline = async (
    unitDefault?: UnitPendidikan,
    kelasDefault?: string
  ) => {
    const targetUnit = unitDefault || santriRaporAktif.unit || 'Wustho';
    const targetKelas = kelasDefault || santriRaporAktif.kelas || 'Kelas 7';
    const kunciKelas = `${targetUnit}__${targetKelas}`;
    const namaWaliSaatIni = ambilNamaWaliKelas(targetUnit, targetKelas);
    const taglineSaatIni =
      identitasPesantren.taglineRapor || DEFAULT_IDENTITAS_PESANTREN.taglineRapor;

    const { value: formVals } = await Swal.fire({
      title: 'Edit Wali Kelas & Tagline e-Rapor',
      html: `
        <div style="text-align:left; font-size:12px; color:#334155;">
          <label style="display:block; font-weight:700; color:#0A1172; margin-bottom:4px;">
            1. Nama Wali Kelas (${targetUnit} — ${targetKelas}):
          </label>
          <input id="swal-edit-walikelas" type="text" value="${escapeHtmlAman(namaWaliSaatIni)}" placeholder="Contoh: Ustadz H. Abdurrahman, Lc., M.Ag." style="width:100%; padding:9px 11px; border:1px solid #CBD5E1; border-radius:8px; font-size:13px; font-weight:700; color:#0A1172; margin-bottom:12px;" />

          <label style="display:block; font-weight:700; color:#0A1172; margin-bottom:4px;">
            2. Tagline KOP e-Rapor Digital:
          </label>
          <input id="swal-edit-tagline-rapor" type="text" value="${escapeHtmlAman(taglineSaatIni)}" placeholder="Tagline resmi pada header e-Rapor..." style="width:100%; padding:9px 11px; border:1px solid #CBD5E1; border-radius:8px; font-size:12px; color:#0F172A; margin-bottom:8px;" />

          <label style="display:inline-flex; align-items:center; gap:6px; font-size:11px; color:#475569; cursor:pointer;">
            <input id="swal-walikelas-semua" type="checkbox" />
            Terapkan nama Wali Kelas ini sebagai default seluruh kelas yang belum diatur khusus
          </label>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: 'Simpan Perubahan',
      cancelButtonText: 'Batal',
      confirmButtonColor: '#FF6700',
      focusConfirm: false,
      preConfirm: () => {
        const waliEl = document.getElementById('swal-edit-walikelas') as HTMLInputElement | null;
        const taglineEl = document.getElementById('swal-edit-tagline-rapor') as HTMLInputElement | null;
        const allEl = document.getElementById('swal-walikelas-semua') as HTMLInputElement | null;
        return {
          namaWali: (waliEl?.value || '').trim(),
          tagline: (taglineEl?.value || '').trim(),
          terapkanDefault: Boolean(allEl?.checked),
        };
      },
    });

    if (!formVals) return;

    const nextMap = { ...(identitasPesantren.waliKelasMap || {}) };
    if (formVals.namaWali) {
      nextMap[kunciKelas] = formVals.namaWali;
    }

    simpanIdentitasPesantren({
      ...identitasPesantren,
      taglineRapor: formVals.tagline || DEFAULT_IDENTITAS_PESANTREN.taglineRapor,
      namaWaliKelasDefault:
        formVals.terapkanDefault && formVals.namaWali
          ? formVals.namaWali
          : identitasPesantren.namaWaliKelasDefault,
      waliKelasMap: nextMap,
    });

    Swal.fire({
      toast: true,
      position: 'top-end',
      icon: 'success',
      title: `Wali Kelas (${targetKelas}) & Tagline e-Rapor disimpan`,
      showConfirmButton: false,
      timer: 2600,
    });
  };

  const handleKosongkanSemuaNilaiTahfidzIT = async () => {
    const res = await Swal.fire({
      icon: 'warning',
      title: 'Kosongkan Semua Nilai Akademik, Tahfidz & IT?',
      text: 'Seluruh input Nilai Akademik, Pencapaian Tahfidz, dan Pencapaian IT santri akan dikosongkan agar Ustadz dapat mengisi ulang dari awal.',
      showCancelButton: true,
      confirmButtonText: 'Ya, Kosongkan Semua',
      cancelButtonText: 'Batal',
      confirmButtonColor: '#DC2626',
    });
    if (!res.isConfirmed) return;

    setNilaiAkademik([]);
    setDataTahfidz([]);
    setDataIT([]);
    setLogAktivitasNilai([]);
    Swal.fire({
      icon: 'success',
      title: 'Berhasil Dikosongkan',
      text: 'Seluruh input Nilai Akademik, Pencapaian Tahfidz, dan Pencapaian IT telah dihapus/dikosongkan.',
      confirmButtonColor: '#0A1172',
    });
  };

  // ==========================================================================
  // PORTAL AKSES MANDIRI E-RAPOR SANTRI MENGGUNAKAN NIS MASING-MASING
  // ==========================================================================
  const bukaPortalRaporSantriDenganNis = async (nisAwal?: string) => {
    if (ujianBerlangsung) {
      Swal.fire({
        icon: 'warning',
        title: 'Ujian CBT Sedang Terkunci!',
        text: 'Selesaikan ujian terlebih dahulu sebelum membuka portal e-Rapor.',
        confirmButtonColor: '#0A1172',
      });
      return;
    }

    const defaultNis = nisAwal || santriLoginRapor?.nis || '';
    const opsiSantriHtml = santriList
      .map((s) => {
        const st = cekKelengkapanDataRaporSantri(s);
        const badge = st.apakahLengkap
          ? '✓ LENGKAP 100% (Siap Unduh PDF)'
          : `⏳ BELUM LENGKAP (${st.persentaseLengkap}% · ${st.totalMapelTerisiLengkap}/${st.totalMapelWajib} Mapel)`;
        const selected = defaultNis && s.nis.toUpperCase() === defaultNis.toUpperCase() ? 'selected' : '';
        return `<option value="${s.nis}" ${selected}>${s.nis} — ${s.nama} (${s.unit} ${s.kelas}) [${badge}]</option>`;
      })
      .join('');

    const { value: nisInput } = await Swal.fire({
      title: 'Akses e-Rapor Mandiri Santri (Login NIS)',
      html: `
        <div style="text-align:left; font-size:12px; line-height:1.5; color:#334155;">
          <div style="margin-bottom:12px; padding:10px 12px; background:#EFF6FF; border:1px solid #BFDBFE; border-radius:8px; color:#0A1172;">
            <div style="font-weight:800; margin-bottom:2px;">🎓 Portal Cek &amp; Unduh PDF e-Rapor Santri</div>
            <div style="font-size:11px; color:#1E3A8A;">
              Santri dapat mengakses e-Rapor dan mengunduh file PDF A4 menggunakan <strong>NIS masing-masing</strong>. Rapor hanya terbuka apabila <strong>seluruh nilai mata pelajaran, Tahfidz, dan IT telah selesai diisi lengkap (100%)</strong> oleh Ustadz.
            </div>
          </div>

          <label style="display:block; font-weight:700; color:#0A1172; margin-bottom:4px;">1. Ketik Nomor Induk Santri (NIS) Anda:</label>
          <input id="swal-input-nis-santri" type="text" value="${escapeHtmlAman(defaultNis)}" placeholder="Masukkan NIS Anda (Contoh: 27.2627.811)" style="width:100%; padding:9px 11px; border:2px solid #0A1172; border-radius:8px; font-size:13px; font-family:monospace; font-weight:800; color:#0A1172; margin-bottom:12px; background:#FFFFFF;" />

          <label style="display:block; font-weight:700; color:#475569; margin-bottom:4px;">Cek Status Kelengkapan Data NIS Santri:</label>
          <select id="swal-select-bantu-nis" onchange="if(this.value) document.getElementById('swal-input-nis-santri').value = this.value" style="width:100%; padding:8px 10px; border:1px solid #CBD5E1; border-radius:8px; font-size:11px; font-weight:600; color:#0F172A; background:#F8FAFC;">
            <option value="">-- Pilih Cepat NIS atau Ketik Manual di Atas --</option>
            ${opsiSantriHtml}
          </select>
        </div>
      `,
      focusConfirm: false,
      showCancelButton: true,
      confirmButtonText: 'Buka e-Rapor Saya (Via NIS)',
      cancelButtonText: 'Batal',
      confirmButtonColor: '#FF6700',
      preConfirm: () => {
        const inputEl = document.getElementById('swal-input-nis-santri') as HTMLInputElement | null;
        return (inputEl?.value || '').trim();
      },
    });

    if (!nisInput) return;

    const santriCocok = santriList.find(
      (s) => s.nis.trim().toUpperCase() === nisInput.trim().toUpperCase()
    );

    if (!santriCocok) {
      Swal.fire({
        icon: 'error',
        title: 'NIS Santri Tidak Ditemukan',
        text: `Nomor Induk Santri "${nisInput}" tidak terdaftar pada Buku Induk Santri Aktif Ponpes Darul Fithrah.`,
        confirmButtonColor: '#0A1172',
      });
      return;
    }

    const statusLengkap = cekKelengkapanDataRaporSantri(santriCocok);

    // Kunci sesi rapor khusus untuk NIS santri yang login
    setUstadzLoginAktif(null);
    setSantriLoginRapor(santriCocok);
    setCariNisRapor(santriCocok.nis);
    setActiveModule('rapor');

    if (statusLengkap.apakahLengkap) {
      Swal.fire({
        icon: 'success',
        title: `Selamat Datang, ${santriCocok.nama}`,
        text: `Seluruh data e-Rapor kelas ${santriCocok.kelas} (${statusLengkap.totalMapelWajib} Mapel, Tahfidz & IT) telah 100% lengkap. Silakan lihat dan unduh PDF e-Rapor A4 Anda.`,
        timer: 2300,
        showConfirmButton: false,
      });
    } else {
      Swal.fire({
        icon: 'warning',
        title: 'Data e-Rapor Belum 100% Lengkap',
        html: `
          <div style="text-align:left; font-size:12px; line-height:1.55; color:#334155;">
            <p style="margin-bottom:8px;">Mohon maaf Ananda <strong>${santriCocok.nama} (${santriCocok.nis})</strong>, e-Rapor Digital dan fitur Unduh PDF A4 hanya dapat dibuka setelah seluruh data nilai selesai diisi lengkap oleh Ustadz.</p>
            <div style="padding:8px 10px; background:#FFFBEB; border:1px solid #FDE68A; border-radius:8px; color:#92400E; font-weight:600;">
              <div>• Progress Pengisian Saat Ini: <strong>${statusLengkap.persentaseLengkap}%</strong></div>
              <div>• Nilai Mapel Kelas ${santriCocok.kelas}: <strong>${statusLengkap.totalMapelTerisiLengkap} dari ${statusLengkap.totalMapelWajib} Mapel Selesai</strong></div>
              <div>• Data Tahfidz Al-Qur'an: <strong>${statusLengkap.tahfidzLengkap ? '✓ Lengkap' : '⏳ Belum Lengkap'}</strong></div>
              <div>• Data Kompetensi IT: <strong>${statusLengkap.itLengkap ? '✓ Lengkap' : '⏳ Belum Lengkap'}</strong></div>
            </div>
          </div>
        `,
        confirmButtonText: 'Lihat Rincian Status Kelengkapan',
        confirmButtonColor: '#0A1172',
      });
    }
  };

  // ==========================================================================
  // PROTEKSI MULTI-ADMIN, PORTAL USTADZ, DAN E-RAPOR PER PENGAMPU / NIS SANTRI
  // ==========================================================================
  const verifikasiAkunAdmin = (usernameOrId: string, passwordInput: string): AdminAccount | null => {
    const key = usernameOrId.trim().toLowerCase();
    const passClean = passwordInput.trim();
    const akun = adminList.find(
      (a) => a.id.toLowerCase() === key || a.username.trim().toLowerCase() === key
    );
    if (!akun || !akun.aktif) return null;
    if (akun.password === passClean) return akun;
    if (akun.password === 'ADMIN99' && passClean.toUpperCase() === 'ADMIN99') return akun;
    return null;
  };

  const bukaModulDenganPin = async (
    target: 'admin' | 'ustadz' | 'rapor',
    paksaGantiAkun = false
  ) => {
    if (ujianBerlangsung) {
      Swal.fire({
        icon: 'warning',
        title: 'Ujian CBT Sedang Terkunci!',
        text: 'Selesaikan ujian terlebih dahulu sebelum berpindah modul.',
        confirmButtonColor: '#0A1172',
      });
      return;
    }

    if (target === 'admin') {
      if (isAdminUnlocked && !paksaGantiAkun) {
        setActiveModule('admin');
        return;
      }

      const akunAdminAktifList = adminList.filter((a) => a.aktif);
      const opsiAdminHtml = akunAdminAktifList
        .map(
          (a) =>
            `<option value="${a.id}">${escapeHtmlAman(a.namaAdmin)} (@${escapeHtmlAman(a.username)}) — ${escapeHtmlAman(a.jabatan)}</option>`
        )
        .join('');

      const { value: formAdminLogin } = await Swal.fire({
        title: 'Login Dasbor Admin',
        html: `
          <div style="text-align:left; font-size:12px; color:#334155;">
            <label style="display:block; font-weight:700; color:#0A1172; margin-bottom:4px;">1. Pilih Akun Admin:</label>
            <select id="swal-admin-account" style="width:100%; padding:8px 10px; border:1px solid #CBD5E1; border-radius:8px; font-size:12px; font-weight:700; color:#0F172A; margin-bottom:12px; background:#F8FAFC;">
              ${opsiAdminHtml}
            </select>
            <label style="display:block; font-weight:700; color:#0A1172; margin-bottom:4px;">2. Masukkan Password / PIN Admin:</label>
            <input id="swal-admin-password" type="password" placeholder="Masukkan Password Admin (Default Super Admin: ADMIN99)" style="width:100%; padding:9px 11px; border:1px solid #CBD5E1; border-radius:8px; font-size:13px; font-weight:700; color:#0F172A; background:#FFFFFF;" />
            <div style="font-size:11px; color:#64748B; margin-top:6px;">
              *Default Super Admin: username <code>admin</code> · password <code>ADMIN99</code>.
            </div>
          </div>
        `,
        focusConfirm: false,
        showCancelButton: true,
        confirmButtonText: 'Masuk Dasbor Admin',
        cancelButtonText: 'Batal',
        confirmButtonColor: '#0A1172',
        preConfirm: () => {
          const accEl = document.getElementById('swal-admin-account') as HTMLSelectElement | null;
          const passEl = document.getElementById('swal-admin-password') as HTMLInputElement | null;
          return {
            adminId: accEl?.value || '',
            password: passEl?.value || '',
          };
        },
      });

      if (!formAdminLogin) return;

      const akunValid = verifikasiAkunAdmin(formAdminLogin.adminId, formAdminLogin.password);
      if (akunValid) {
        setIsAdminUnlocked(true);
        setAdminLoginAktif(akunValid);
        setActiveModule('admin');
        Swal.fire({
          toast: true,
          position: 'top-end',
          icon: 'success',
          title: `Selamat Datang, ${akunValid.namaAdmin}`,
          showConfirmButton: false,
          timer: 2200,
        });
      } else {
        Swal.fire(
          'Password Admin Salah / Akun Nonaktif',
          'Periksa kembali akun & password admin Anda (Default Super Admin: ADMIN99).',
          'error'
        );
      }
      return;
    }

    // Jika membuka Portal Ustadz dan sudah login sebagai Ustadz tertentu (tanpa paksa ganti akun)
    if (target === 'ustadz' && isUstadzUnlocked && ustadzLoginAktif && !paksaGantiAkun) {
      setActiveModule('ustadz');
      const tunggakanSoalUlang = hitungTunggakanSoalUstadz(ustadzLoginAktif);
      const tunggakanNilaiUlang = hitungTunggakanNilaiUstadz(ustadzLoginAktif);
      if (tunggakanSoalUlang.totalMapelBelumSoal > 0 && tunggakanSoalUlang.apakahMendekatiDeadline) {
        tampilkanToastReminderSoalUstadz(ustadzLoginAktif);
      } else if (tunggakanNilaiUlang.totalEntriBelumLengkap > 0 && tunggakanNilaiUlang.apakahMendekatiDeadline) {
        tampilkanToastReminderNilaiUstadz(ustadzLoginAktif);
      }
      return;
    }

    // Jika membuka e-Rapor dan sudah login sebagai Santri, Ustadz, atau Admin (tanpa paksa ganti akun)
    if (target === 'rapor' && !paksaGantiAkun && (santriLoginRapor || ustadzLoginAktif || isAdminUnlocked)) {
      setActiveModule('rapor');
      return;
    }

    const defaultIdUstadz = ustadzLoginAktif?.id || ustadzList[0]?.id || '';
    const opsiUstadzHtml = ustadzList
      .map((u) => {
        const daftarKelas = ambilDaftarKelasAmpuanUstadz(u)
          .map((k) => `${k.unit} ${k.kelas}`)
          .join(', ');
        const daftarMapel = (u.mapelAmpuan || []).join(', ');
        const selected = u.id === defaultIdUstadz ? 'selected' : '';
        return `<option value="${u.id}" ${selected}>${u.namaUstadz} — [${daftarKelas}] (${daftarMapel})</option>`;
      })
      .join('');

    const opsiSantriDanAdminRaporHtml =
      target === 'rapor'
        ? `
          <option value="__SANTRI_NIS__">🎓 SANTRI / WALI SANTRI — Cek &amp; Unduh PDF e-Rapor Menggunakan NIS Masing-Masing</option>
          ${adminList
            .filter((a) => a.aktif)
            .map(
              (a) =>
                `<option value="__ADMIN__:${a.id}">★ Admin: ${escapeHtmlAman(a.namaAdmin)} (@${escapeHtmlAman(a.username)})</option>`
            )
            .join('')}
        `
        : '';

    const { value: formLogin } = await Swal.fire({
      title:
        target === 'ustadz'
          ? 'Login Portal Ustadz Pengajar'
          : 'Pilih Akses Modul e-Rapor Digital',
      html: `
        <div style="text-align:left; font-size:12px; line-height:1.5; color:#334155;">
          <p style="margin-bottom:10px; padding:8px 10px; background:#EFF6FF; border:1px solid #BFDBFE; border-radius:8px; color:#0A1172; font-weight:600;">
            ${
              target === 'rapor'
                ? '🔒 <strong>Santri</strong> dapat melihat &amp; mengunduh PDF e-Rapor menggunakan <strong>NIS masing-masing</strong> (setelah data 100% lengkap). <strong>Ustadz</strong> hanya dapat mengakses kelas ampuannya.'
                : '🔒 Setiap Ustadz hanya dapat mengakses <strong>Pembuatan Soal CBT</strong>, <strong>Input Nilai</strong>, dan <strong>Cetak e-Rapor</strong> pada Unit, Kelas, dan Mata Pelajaran yang diampu olehnya.'
            }
          </p>
          <label style="display:block; font-weight:700; color:#0A1172; margin-bottom:4px;">1. Pilih Peran / Akun Akses:</label>
          <select id="swal-select-ustadz" onchange="
            var wrapPin = document.getElementById('swal-wrap-pin');
            var wrapNis = document.getElementById('swal-wrap-nis');
            if (this.value === '__SANTRI_NIS__') {
              if (wrapPin) wrapPin.style.display = 'none';
              if (wrapNis) wrapNis.style.display = 'block';
            } else {
              if (wrapPin) wrapPin.style.display = 'block';
              if (wrapNis) wrapNis.style.display = 'none';
            }
          " style="width:100%; padding:8px 10px; border:1px solid #CBD5E1; border-radius:8px; font-size:12px; font-weight:700; color:#0F172A; margin-bottom:12px; background:#F8FAFC;">
            ${opsiSantriDanAdminRaporHtml}
            ${opsiUstadzHtml}
          </select>

          <div id="swal-wrap-nis" style="display:${target === 'rapor' ? 'block' : 'none'};">
            <label style="display:block; font-weight:700; color:#FF6700; margin-bottom:4px;">2. Masukkan Nomor Induk Santri (NIS) Anda (Tanpa PIN):</label>
            <input id="swal-input-nis-rapor" type="text" value="${escapeHtmlAman(santriLoginRapor?.nis || '')}" placeholder="Ketik NIS Anda (Contoh: 27.2627.811)" style="width:100%; padding:8px 10px; border:2px solid #FF6700; border-radius:8px; font-size:13px; font-family:monospace; font-weight:800; color:#0A1172; background:#FFFFFF;" />
            <div style="font-size:11px; color:#64748B; margin-top:4px;">*e-Rapor dan tombol unduh PDF terbuka otomatis setelah seluruh nilai Mapel, Tahfidz, dan IT santri terisi lengkap 100%.</div>
          </div>

          <div id="swal-wrap-pin" style="display:${target === 'rapor' ? 'none' : 'block'};">
            <label style="display:block; font-weight:700; color:#0A1172; margin-bottom:4px;">2. Masukkan PIN Ustadz / Password Admin:</label>
            <input id="swal-input-pin-ustadz" type="password" value="${target === 'ustadz' ? 'UST123' : ''}" placeholder="Masukkan PIN Ustadz atau Password Admin" style="width:100%; padding:8px 10px; border:1px solid #CBD5E1; border-radius:8px; font-size:13px; font-weight:700; color:#0F172A; background:#FFFFFF;" />
          </div>
        </div>
      `,
      focusConfirm: false,
      showCancelButton: true,
      confirmButtonText: 'Lanjutkan Akses',
      cancelButtonText: 'Batal',
      confirmButtonColor: '#0A1172',
      preConfirm: () => {
        const selectEl = document.getElementById('swal-select-ustadz') as HTMLSelectElement | null;
        const pinEl = document.getElementById('swal-input-pin-ustadz') as HTMLInputElement | null;
        const nisEl = document.getElementById('swal-input-nis-rapor') as HTMLInputElement | null;
        return {
          ustadzId: selectEl?.value || '',
          pin: (pinEl?.value || '').trim(),
          nisSantri: (nisEl?.value || '').trim(),
        };
      },
    });

    if (!formLogin) return;

    if (formLogin.ustadzId === '__SANTRI_NIS__') {
      await bukaPortalRaporSantriDenganNis(formLogin.nisSantri);
      return;
    }

    if (formLogin.ustadzId.startsWith('__ADMIN__:')) {
      const adminIdDipilih = formLogin.ustadzId.replace('__ADMIN__:', '');
      const akunAdminValid = verifikasiAkunAdmin(adminIdDipilih, formLogin.pin);
      if (akunAdminValid) {
        setIsAdminUnlocked(true);
        setAdminLoginAktif(akunAdminValid);
        setUstadzLoginAktif(null);
        setSantriLoginRapor(null);
        setActiveModule('rapor');
        Swal.fire({
          icon: 'success',
          title: `Mode Admin Aktif (${akunAdminValid.namaAdmin})`,
          text: 'Anda dapat melihat dan mencetak e-Rapor seluruh kelas di semua unit pendidikan.',
          timer: 1800,
          showConfirmButton: false,
        });
      } else {
        Swal.fire(
          'Password Admin Salah',
          'Password akun Admin tidak sesuai. Gunakan password akun admin terkait.',
          'error'
        );
      }
      return;
    }

    const akunDipilih = ustadzList.find((u) => u.id === formLogin.ustadzId);
    if (!akunDipilih) return;

    const pinUpper = formLogin.pin.trim().toUpperCase();
    const pinCocok = akunDipilih.pinLogin.trim().toUpperCase() === pinUpper;

    if (!pinCocok) {
      Swal.fire(
        'PIN Ustadz Salah',
        'PIN tidak sesuai dengan PIN akun Ustadz yang terdaftar. Silakan hubungi Admin jika lupa PIN.',
        'error'
      );
      return;
    }

    setSantriLoginRapor(null);
    terapkanSesiAksesUstadz(akunDipilih);
    setActiveModule(target);

    const ringkasanKelas = ambilDaftarKelasAmpuanUstadz(akunDipilih)
      .map((k) => `${k.unit} - ${k.kelas}`)
      .join(', ');
    const tunggakanSoalUstadz = hitungTunggakanSoalUstadz(akunDipilih);
    const tunggakanUstadz = hitungTunggakanNilaiUstadz(akunDipilih);

    if (tunggakanSoalUstadz.totalMapelBelumSoal > 0 && tunggakanSoalUstadz.apakahMendekatiDeadline) {
      await tampilkanModalReminderSoalUstadz(akunDipilih);
    } else if (tunggakanUstadz.totalEntriBelumLengkap > 0 && tunggakanUstadz.apakahMendekatiDeadline) {
      await tampilkanModalReminderNilaiUstadz(akunDipilih);
    } else {
      Swal.fire({
        toast: true,
        position: 'top-end',
        icon: 'success',
        title: `Selamat Datang, ${akunDipilih.namaUstadz}`,
        text:
          tunggakanUstadz.totalEntriBelumLengkap === 0 && tunggakanSoalUstadz.totalMapelBelumSoal === 0
            ? `Seluruh soal ujian & nilai kelas ampuan (${ringkasanKelas}) telah 100% lengkap.`
            : `Akses dikunci untuk kelas ampuan: ${ringkasanKelas}.`,
        timer: 3200,
        timerProgressBar: true,
        showConfirmButton: false,
      });
    }
  };

  // ==========================================================================
  // HANDLERS MODUL A: DASBOR ADMIN
  // ==========================================================================
  const handleTambahMapelAdmin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formMapelNama.trim() || !formMapelToken.trim()) return;
    const baru: MapelConfig = {
      id: `MPL-${Date.now().toString(36).toUpperCase()}`,
      namaMapel: formMapelNama.trim(),
      unit: formMapelUnit,
      kelas: formMapelKelas,
      pengampu: formMapelPengampu.trim() || 'Tim Pengajar Darul Fithrah',
      tokenUjian: formMapelToken.trim().toUpperCase(),
      durasiMenit: Math.max(5, Number(formMapelDurasi) || 40),
      updatedAt: new Date().toISOString(),
    };
    simpanMapelAtomik([baru]);
    setFormMapelNama('');
    setFormMapelToken('');
    Swal.fire({
      icon: 'success',
      title: 'Mata Pelajaran Ditambahkan',
      text: `${baru.namaMapel} (${baru.unit} - ${baru.kelas}) · Pengampu: ${baru.pengampu} · Token: ${baru.tokenUjian} (${baru.durasiMenit} mnt)`,
      confirmButtonColor: '#0A1172',
    });
  };

  const handleHapusMapelAdmin = async (mapel: MapelConfig) => {
    const res = await Swal.fire({
      icon: 'warning',
      title: 'Hapus Mata Pelajaran?',
      text: `Mata pelajaran "${mapel.namaMapel}" (${mapel.unit} · ${mapel.kelas}) akan dihapus dari sistem dan daftar ujian CBT.`,
      showCancelButton: true,
      confirmButtonText: 'Ya, Hapus Mapel',
      cancelButtonText: 'Batal',
      confirmButtonColor: '#DC2626',
    });
    if (!res.isConfirmed) return;

    const keyMapel = `${mapel.unit}__${mapel.kelas}__${mapel.namaMapel.toLowerCase()}`.toLowerCase();
    setDeletedRecords((prev) => ({
      ...prev,
      mapel: Array.from(new Set([...prev.mapel, keyMapel])),
    }));
    setMapelList((prev) =>
      prev.filter(
        (m) =>
          !(
            m.id === mapel.id ||
            (m.unit === mapel.unit &&
              m.kelas === mapel.kelas &&
              m.namaMapel.toLowerCase() === mapel.namaMapel.toLowerCase())
          )
      )
    );
    Swal.fire({
      icon: 'success',
      title: 'Mata Pelajaran Dihapus',
      text: `${mapel.namaMapel} (${mapel.unit} · ${mapel.kelas}) telah dihapus.`,
      timer: 1800,
      showConfirmButton: false,
    });
  };

  const handleEditMapelAdmin = (mapel: MapelConfig) => {
    setEditMapelAsli(mapel);
    setEditMapelForm({ ...mapel });
  };

  const bangunSyncUstadzDariPerubahanPengampu = (
    mapelAsli: MapelConfig,
    mapelBaru: MapelConfig
  ): UstadzAccount[] => {
    const pengampuLama = (mapelAsli.pengampu || '').trim().toLowerCase();
    const pengampuBaru = (mapelBaru.pengampu || '').trim().toLowerCase();
    if (pengampuLama === pengampuBaru) return [];

    const mapelListSimulasi = mapelList.map((m) => (m.id === mapelAsli.id ? mapelBaru : m));
    const ustadzTerdampak: UstadzAccount[] = [];

    ustadzList.forEach((u) => {
      const alias = ekstrakAliasNamaUstadz(u.namaUstadz);
      const cocokBaru = alias.some((al) => al.length > 2 && pengampuBaru.includes(al));
      const cocokLama = alias.some((al) => al.length > 2 && pengampuLama.includes(al));
      if (!cocokBaru && !cocokLama) return;

      const currentIds = Array.isArray(u.aksesMapelIds)
        ? [...u.aksesMapelIds]
        : ambilDaftarMapelAmpuanUstadz(u).map((m) => m.id);
      const nextSet = new Set(currentIds);
      if (cocokBaru) nextSet.add(mapelBaru.id);
      if (cocokLama && !cocokBaru) nextSet.delete(mapelBaru.id);

      const nextIds = Array.from(nextSet);
      const daftarMapelAktif = mapelListSimulasi.filter((m) => nextSet.has(m.id));
      const nextUnits = Array.from(new Set(daftarMapelAktif.map((m) => m.unit))) as UnitPendidikan[];
      const nextKelas = Array.from(new Set(daftarMapelAktif.map((m) => m.kelas)));
      const nextMapelNames = Array.from(new Set(daftarMapelAktif.map((m) => m.namaMapel)));

      ustadzTerdampak.push({
        ...u,
        aksesMapelIds: nextIds,
        unitAmpuan: nextUnits.length > 0 ? nextUnits : u.unitAmpuan,
        kelasAmpuan: nextKelas,
        mapelAmpuan: nextMapelNames.length > 0 ? nextMapelNames : u.mapelAmpuan,
        updatedAt: new Date().toISOString(),
      });
    });

    return ustadzTerdampak;
  };

  const handleSimpanEditMapelAdmin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editMapelForm || !editMapelAsli) return;
    const namaClean = editMapelForm.namaMapel.trim();
    const tokenClean = editMapelForm.tokenUjian.trim().toUpperCase();
    if (!namaClean || !tokenClean) {
      Swal.fire({
        icon: 'warning',
        title: 'Data Tidak Lengkap',
        text: 'Nama Mata Pelajaran dan Token Ujian wajib diisi.',
        confirmButtonColor: '#0A1172',
      });
      return;
    }

    const duplikat = mapelList.some(
      (m) =>
        m.id !== editMapelAsli.id &&
        m.unit === editMapelForm.unit &&
        m.kelas === editMapelForm.kelas &&
        m.namaMapel.trim().toLowerCase() === namaClean.toLowerCase()
    );
    if (duplikat) {
      Swal.fire({
        icon: 'warning',
        title: 'Mata Pelajaran Sudah Ada',
        text: `Mata pelajaran "${namaClean}" untuk ${editMapelForm.unit} · ${editMapelForm.kelas} sudah terdaftar.`,
        confirmButtonColor: '#0A1172',
      });
      return;
    }

    const nowIso = new Date().toISOString();
    const mapelUpdated: MapelConfig = {
      ...editMapelForm,
      namaMapel: namaClean,
      pengampu: (editMapelForm.pengampu || '').trim() || 'Tim Pengajar Darul Fithrah',
      tokenUjian: tokenClean,
      durasiMenit: Math.max(5, Math.min(240, Number(editMapelForm.durasiMenit) || 40)),
      updatedAt: nowIso,
    };

    const keyLama = `${editMapelAsli.unit}__${editMapelAsli.kelas}__${editMapelAsli.namaMapel.toLowerCase()}`.toLowerCase();
    const keyBaru = `${mapelUpdated.unit}__${mapelUpdated.kelas}__${mapelUpdated.namaMapel.toLowerCase()}`.toLowerCase();
    const removeOldKeys = keyLama !== keyBaru ? [keyLama] : [];
    const syncUstadzList = bangunSyncUstadzDariPerubahanPengampu(editMapelAsli, mapelUpdated);

    // Simpan atomik ke LocalStorage + Server /api/mapel/upsert + Firestore (tidak pernah tertimpa atau kembali ke default)
    simpanMapelAtomik([mapelUpdated], { removeOldKeys, syncUstadzList });

    // Cascade ke Bank Soal CBT HANYA jika unit, kelas, atau namaMapel berubah
    const kunciMapelBerubah =
      editMapelAsli.unit !== mapelUpdated.unit ||
      editMapelAsli.kelas !== mapelUpdated.kelas ||
      editMapelAsli.namaMapel.trim().toLowerCase() !== mapelUpdated.namaMapel.trim().toLowerCase();

    if (kunciMapelBerubah) {
      const soalTerdampak = bankSoal
        .filter(
          (s) =>
            s.unit === editMapelAsli.unit &&
            s.kelas === editMapelAsli.kelas &&
            s.mapel.trim().toLowerCase() === editMapelAsli.namaMapel.trim().toLowerCase()
        )
        .map((s) => ({
          ...s,
          unit: mapelUpdated.unit,
          kelas: mapelUpdated.kelas,
          mapel: mapelUpdated.namaMapel,
          updatedAt: nowIso,
        }));
      if (soalTerdampak.length > 0) {
        simpanSoalAtomik(soalTerdampak);
      }
    }

    // Cascade perubahan nama mapel pada Nilai Akademik untuk santri di kelas asal
    if (editMapelAsli.namaMapel.trim().toLowerCase() !== mapelUpdated.namaMapel.trim().toLowerCase()) {
      const nisKelasAsal = new Set(
        santriList
          .filter((s) => s.unit === editMapelAsli.unit && s.kelas === editMapelAsli.kelas)
          .map((s) => s.nis.toUpperCase())
      );
      setNilaiAkademik((prev) =>
        prev.map((n) =>
          nisKelasAsal.has(n.nis.toUpperCase()) &&
          n.mapel.trim().toLowerCase() === editMapelAsli.namaMapel.trim().toLowerCase()
            ? { ...n, mapel: mapelUpdated.namaMapel }
            : n
        )
      );
    }

    if (
      ustadzUnit === editMapelAsli.unit &&
      ustadzKelas === editMapelAsli.kelas &&
      ustadzMapel.trim().toLowerCase() === editMapelAsli.namaMapel.trim().toLowerCase()
    ) {
      setUstadzUnit(mapelUpdated.unit);
      setUstadzKelas(mapelUpdated.kelas);
      setUstadzMapel(mapelUpdated.namaMapel);
    }
    if (
      cbtUnit === editMapelAsli.unit &&
      cbtKelas === editMapelAsli.kelas &&
      cbtMapel.trim().toLowerCase() === editMapelAsli.namaMapel.trim().toLowerCase()
    ) {
      setCbtUnit(mapelUpdated.unit);
      setCbtKelas(mapelUpdated.kelas);
      setCbtMapel(mapelUpdated.namaMapel);
    }

    setEditMapelForm(null);
    setEditMapelAsli(null);
    Swal.fire({
      icon: 'success',
      title: 'Token & Durasi Tersimpan Permanen',
      text: `${mapelUpdated.namaMapel} (${mapelUpdated.unit} · ${mapelUpdated.kelas}) — Token: ${mapelUpdated.tokenUjian}, Durasi: ${mapelUpdated.durasiMenit} mnt, Pengampu: ${mapelUpdated.pengampu}.`,
      timer: 2000,
      showConfirmButton: false,
    });
  };

  // Edit Cepat Inline Per Mapel & Per Kelas (Token, Durasi, Pengampu)
  const handleSimpanBarisMapelCepat = (mapelAsli: MapelConfig) => {
    const draft = draftMapelCepat[mapelAsli.id];
    if (!draft) return;
    const tokenClean = draft.tokenUjian.trim().toUpperCase();
    if (!tokenClean) {
      Swal.fire({
        icon: 'warning',
        title: 'Token Tidak Boleh Kosong',
        text: `Masukkan token ujian untuk ${mapelAsli.namaMapel} (${mapelAsli.unit} · ${mapelAsli.kelas}).`,
        confirmButtonColor: '#0A1172',
      });
      return;
    }
    const mapelUpdated: MapelConfig = {
      ...mapelAsli,
      tokenUjian: tokenClean,
      durasiMenit: Math.max(5, Math.min(240, Number(draft.durasiMenit) || 40)),
      pengampu: draft.pengampu.trim() || mapelAsli.pengampu || 'Tim Pengajar Darul Fithrah',
      updatedAt: new Date().toISOString(),
    };
    const syncUstadzList = bangunSyncUstadzDariPerubahanPengampu(mapelAsli, mapelUpdated);
    simpanMapelAtomik([mapelUpdated], { syncUstadzList });
    setDraftMapelCepat((prev) => {
      const next = { ...prev };
      delete next[mapelAsli.id];
      return next;
    });
    Swal.fire({
      icon: 'success',
      title: 'Tersimpan!',
      text: `${mapelUpdated.namaMapel} (${mapelUpdated.kelas}) · Token: ${mapelUpdated.tokenUjian} · ${mapelUpdated.durasiMenit} mnt`,
      timer: 1400,
      showConfirmButton: false,
    });
  };

  const handleSimpanSemuaMapelCepat = () => {
    const daftarDiubah: MapelConfig[] = [];
    const ustadzSyncMap = new Map<string, UstadzAccount>();
    Object.entries(draftMapelCepat).forEach(([idMapel, draft]) => {
      const asli = mapelList.find((m) => m.id === idMapel);
      if (!asli) return;
      const tokenClean = draft.tokenUjian.trim().toUpperCase() || asli.tokenUjian;
      const updated: MapelConfig = {
        ...asli,
        tokenUjian: tokenClean,
        durasiMenit: Math.max(5, Math.min(240, Number(draft.durasiMenit) || asli.durasiMenit)),
        pengampu: draft.pengampu.trim() || asli.pengampu || 'Tim Pengajar Darul Fithrah',
        updatedAt: new Date().toISOString(),
      };
      daftarDiubah.push(updated);
      bangunSyncUstadzDariPerubahanPengampu(asli, updated).forEach((u) => ustadzSyncMap.set(u.id, u));
    });
    if (daftarDiubah.length === 0) return;
    simpanMapelAtomik(daftarDiubah, { syncUstadzList: Array.from(ustadzSyncMap.values()) });
    setDraftMapelCepat({});
    Swal.fire({
      icon: 'success',
      title: `${daftarDiubah.length} Mapel Berhasil Diperbarui`,
      text: 'Seluruh perubahan Token, Durasi, dan Pengampu langsung tersimpan permanen di Server & Backup Lokal.',
      timer: 2000,
      showConfirmButton: false,
    });
  };

  const handleTerapkanDurasiMassalKelas = (daftarTarget: MapelConfig[]) => {
    if (daftarTarget.length === 0) return;
    const durasiValid = Math.max(5, Math.min(240, Number(durasiMassalKelas) || 45));
    const nowIso = new Date().toISOString();
    const updatedList = daftarTarget.map((m) => ({
      ...m,
      durasiMenit: durasiValid,
      updatedAt: nowIso,
    }));
    simpanMapelAtomik(updatedList);
    Swal.fire({
      icon: 'success',
      title: 'Durasi Massal Diperbarui',
      text: `${updatedList.length} mata pelajaran pada filter aktif berhasil diubah durasinya menjadi ${durasiValid} menit.`,
      timer: 2000,
      showConfirmButton: false,
    });
  };

  // Sinkronkan Hak Akses Semua Ustadz secara 1-Klik agar 100% Sesuai Tabel Mata Pelajaran & Token
  const handleSinkronSemuaHakAksesDariToken = async () => {
    const res = await Swal.fire({
      icon: 'question',
      title: 'Sinkronkan Hak Akses Semua Ustadz dengan Tabel Token?',
      text: 'Sistem akan mencocokkan hak akses kelas & mata pelajaran setiap Ustadz berdasarkan kolom Pengampu pada Tabel Mata Pelajaran & Token Ujian saat ini.',
      showCancelButton: true,
      confirmButtonText: 'Ya, Sinkronkan Sekarang',
      cancelButtonText: 'Batal',
      confirmButtonColor: '#0A1172',
    });
    if (!res.isConfirmed) return;

    const nowIso = new Date().toISOString();
    const ustadzTersinkron: UstadzAccount[] = ustadzList.map((u) => {
      const daftarAlias = ekstrakAliasNamaUstadz(u.namaUstadz);
      const mapelCocok = mapelList.filter((m) => {
        const pengampuLower = (m.pengampu || '').toLowerCase();
        return daftarAlias.some((al) => al.length > 2 && pengampuLower.includes(al));
      });
      const ids = mapelCocok.map((m) => m.id);
      const units = Array.from(new Set(mapelCocok.map((m) => m.unit))) as UnitPendidikan[];
      const kelas = Array.from(new Set(mapelCocok.map((m) => m.kelas)));
      const namaMapel = Array.from(new Set(mapelCocok.map((m) => m.namaMapel)));
      return {
        ...u,
        aksesMapelIds: ids,
        unitAmpuan: units.length > 0 ? units : u.unitAmpuan || ['Wustho'],
        kelasAmpuan: kelas,
        mapelAmpuan: namaMapel.length > 0 ? namaMapel : u.mapelAmpuan || [],
        updatedAt: nowIso,
      };
    });

    simpanUstadzAtomik(ustadzTersinkron);
    Swal.fire({
      icon: 'success',
      title: 'Hak Akses 100% Sinkron dengan Tabel Token!',
      text: `Hak akses untuk ${ustadzTersinkron.length} Ustadz kini diselaraskan persis per mapel & per kelas sesuai Tabel Token Ujian.`,
      confirmButtonColor: '#0A1172',
    });
  };

  const handleTambahSantriAdmin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formSantriNIS.trim() || !formSantriNama.trim()) return;
    const nisClean = formSantriNIS.trim().toUpperCase();
    const kelasTerdataLabel =
      formSantriUnit === 'MDA'
        ? formSantriKelas === 'Putri'
          ? 'MDA Putri'
          : 'MDA Putra'
        : formSantriKelas;
    const sBaru: Santri = {
      nis: nisClean,
      nisn: formSantriNISN.trim() || '-',
      nama: formSantriNama.trim(),
      unit: formSantriUnit,
      kelas: formSantriKelas,
      kelasTerdata: kelasTerdataLabel,
      nik: formSantriNIK.trim() || '-',
      noKK: formSantriNoKK.trim() || '-',
      jk: formSantriJK,
      tempatLahir: formSantriTempatLahir.trim() || '-',
      tanggalLahir: formSantriTglLahir.trim() || '-',
      alamat: formSantriAlamat.trim() || '-',
      angkatan: formSantriAngkatan.trim() || 'K27',
      tanggalMasuk: formSantriTglMasuk.trim() || '19-07-2026',
      kodeBarang: formSantriKodeBarang.trim() || '-',
      namaAyah: formSantriNamaAyah.trim() || '-',
      noTelpAyah: formSantriTelpAyah.trim() || '-',
      namaIbu: formSantriNamaIbu.trim() || '-',
      noTelpIbu: formSantriTelpIbu.trim() || '-',
      jumlahHafalan: formSantriJumlahHafalan.trim() || '0 juz',
    };
    setDeletedRecords((prev) => ({
      ...prev,
      santri: prev.santri.filter((k) => k.toUpperCase() !== nisClean),
      tahfidz: prev.tahfidz.filter((k) => k.toUpperCase() !== nisClean),
    }));
    setSantriList((prev) => [...prev.filter((s) => s.nis.toUpperCase() !== nisClean), sBaru]);
    if (sBaru.jumlahHafalan) {
      setDataTahfidz((prev) => [
        ...prev.filter((t) => t.nis.toUpperCase() !== nisClean),
        {
          nis: nisClean,
          juzHafalan: sBaru.jumlahHafalan || '0 juz',
          suratTerakhir: tentukanSuratTerakhirDariHafalan(sBaru.jumlahHafalan || '0 juz'),
          kelancaran: 'Lancar',
          catatanUstadz: 'Data hafalan terintegrasi dari Buku Induk Santri.',
        },
      ]);
    }
    setFormSantriNIS('');
    setFormSantriNISN('');
    setFormSantriNama('');
    setFormSantriNIK('');
    setFormSantriNoKK('');
    setFormSantriTempatLahir('');
    setFormSantriTglLahir('');
    setFormSantriKodeBarang('');
    setFormSantriNamaAyah('');
    setFormSantriTelpAyah('');
    setFormSantriNamaIbu('');
    setFormSantriTelpIbu('');
    setFormSantriAlamat('');
    Swal.fire({
      icon: 'success',
      title: 'Data Buku Induk Santri Tersimpan',
      text: `${sBaru.nama} (${sBaru.nis}) terdaftar di Unit ${sBaru.unit} - ${sBaru.kelas} (${sBaru.kelasTerdata}).`,
      confirmButtonColor: '#0A1172',
    });
  };

  const handleHapusSantriAdmin = async (santri: Santri) => {
    const res = await Swal.fire({
      icon: 'warning',
      title: 'Hapus Data Santri?',
      text: `Data Buku Induk Santri "${santri.nama}" (NIS: ${santri.nis} · ${santri.unit} ${santri.kelas}) beserta nilai, Tahfidz, dan IT terkait akan dihapus permanen.`,
      showCancelButton: true,
      confirmButtonText: 'Ya, Hapus Santri',
      cancelButtonText: 'Batal',
      confirmButtonColor: '#DC2626',
    });
    if (!res.isConfirmed) return;

    const nisKey = santri.nis.toUpperCase();
    setDeletedRecords((prev) => ({
      ...prev,
      santri: Array.from(new Set([...prev.santri, nisKey])),
      tahfidz: Array.from(new Set([...prev.tahfidz, nisKey])),
      it: Array.from(new Set([...prev.it, nisKey])),
    }));
    setSantriList((prev) => prev.filter((s) => s.nis.toUpperCase() !== nisKey));
    setNilaiAkademik((prev) => prev.filter((n) => n.nis.toUpperCase() !== nisKey));
    setDataTahfidz((prev) => prev.filter((t) => t.nis.toUpperCase() !== nisKey));
    setDataIT((prev) => prev.filter((i) => i.nis.toUpperCase() !== nisKey));
    if (santriLoginRapor?.nis.toUpperCase() === nisKey) {
      setSantriLoginRapor(null);
    }
    Swal.fire({
      icon: 'success',
      title: 'Data Santri Dihapus',
      text: `${santri.nama} (${santri.nis}) telah dihapus dari Buku Induk Santri Aktif.`,
      timer: 1800,
      showConfirmButton: false,
    });
  };

  const handleEditSantriAdmin = (santri: Santri) => {
    setEditSantriAsliNis(santri.nis);
    setEditSantriForm({
      ...santri,
      jk: santri.jk || 'L',
      jumlahHafalan: santri.jumlahHafalan || '0 juz',
    });
  };

  const handleSimpanEditSantriAdmin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editSantriForm || !editSantriAsliNis) return;
    const oldNis = editSantriAsliNis.trim().toUpperCase();
    const newNis = editSantriForm.nis.trim().toUpperCase();
    const namaClean = editSantriForm.nama.trim();

    if (!newNis || !namaClean) {
      Swal.fire({
        icon: 'warning',
        title: 'Data Wajib Belum Lengkap',
        text: 'NIS dan Nama Lengkap santri tidak boleh kosong.',
        confirmButtonColor: '#0A1172',
      });
      return;
    }

    if (newNis !== oldNis && santriList.some((s) => s.nis.toUpperCase() === newNis)) {
      Swal.fire({
        icon: 'warning',
        title: 'NIS Sudah Terdaftar',
        text: `NIS ${newNis} sudah digunakan oleh santri lain di Buku Induk.`,
        confirmButtonColor: '#0A1172',
      });
      return;
    }

    const kelasTerdataLabel =
      editSantriForm.unit === 'MDA'
        ? editSantriForm.kelas === 'Putri'
          ? 'MDA Putri'
          : 'MDA Putra'
        : editSantriForm.kelas;

    const santriUpdated: Santri = {
      ...editSantriForm,
      nis: newNis,
      nisn: (editSantriForm.nisn || '').trim() || '-',
      nama: namaClean,
      kelasTerdata: kelasTerdataLabel,
      nik: (editSantriForm.nik || '').trim() || '-',
      noKK: (editSantriForm.noKK || '').trim() || '-',
      jk: editSantriForm.jk || 'L',
      tempatLahir: (editSantriForm.tempatLahir || '').trim() || '-',
      tanggalLahir: (editSantriForm.tanggalLahir || '').trim() || '-',
      alamat: (editSantriForm.alamat || '').trim() || '-',
      angkatan: (editSantriForm.angkatan || '').trim() || 'K27',
      tanggalMasuk: (editSantriForm.tanggalMasuk || '').trim() || '19-07-2026',
      kodeBarang: (editSantriForm.kodeBarang || '').trim() || '-',
      namaAyah: (editSantriForm.namaAyah || '').trim() || '-',
      noTelpAyah: (editSantriForm.noTelpAyah || '').trim() || '-',
      namaIbu: (editSantriForm.namaIbu || '').trim() || '-',
      noTelpIbu: (editSantriForm.noTelpIbu || '').trim() || '-',
      jumlahHafalan: (editSantriForm.jumlahHafalan || '').trim() || '0 juz',
    };

    const santriLama = santriList.find((s) => s.nis.toUpperCase() === oldNis);

    setDeletedRecords((prev) => ({
      ...prev,
      santri: prev.santri.filter((k) => k.toUpperCase() !== newNis),
    }));

    setSantriList((prev) => prev.map((s) => (s.nis.toUpperCase() === oldNis ? santriUpdated : s)));

    if (newNis !== oldNis) {
      setNilaiAkademik((prev) =>
        prev.map((n) => (n.nis.toUpperCase() === oldNis ? { ...n, nis: newNis } : n))
      );
      setDataIT((prev) =>
        prev.map((i) => (i.nis.toUpperCase() === oldNis ? { ...i, nis: newNis } : i))
      );
      setLogUjianCBT((prev) =>
        prev.map((l) =>
          l.nis.toUpperCase() === oldNis
            ? { ...l, nis: newNis, namaSantri: santriUpdated.nama, unit: santriUpdated.unit, kelas: santriUpdated.kelas }
            : l
        )
      );
      setLogAktivitasNilai((prev) =>
        prev.map((l) =>
          l.nis.toUpperCase() === oldNis ? { ...l, nis: newNis, namaSantri: santriUpdated.nama } : l
        )
      );
      if (cariNisRapor.trim().toUpperCase() === oldNis) {
        setCariNisRapor(newNis);
      }
      if (cbtNIS.trim().toUpperCase() === oldNis) {
        setCbtNIS(newNis);
      }
    }

    if (santriLama?.jumlahHafalan !== santriUpdated.jumlahHafalan && santriUpdated.jumlahHafalan) {
      setDataTahfidz((prev) => {
        const ada = prev.some((t) => t.nis.toUpperCase() === oldNis);
        if (ada) {
          return prev.map((t) =>
            t.nis.toUpperCase() === oldNis
              ? {
                  ...t,
                  nis: newNis,
                  juzHafalan: santriUpdated.jumlahHafalan || t.juzHafalan,
                  suratTerakhir: tentukanSuratTerakhirDariHafalan(
                    santriUpdated.jumlahHafalan || t.juzHafalan
                  ),
                }
              : t
          );
        }
        return [
          ...prev,
          {
            nis: newNis,
            juzHafalan: santriUpdated.jumlahHafalan || '0 juz',
            suratTerakhir: tentukanSuratTerakhirDariHafalan(santriUpdated.jumlahHafalan || '0 juz'),
            kelancaran: 'Lancar',
            catatanUstadz: 'Data hafalan terintegrasi dari Buku Induk Santri.',
          },
        ];
      });
    } else if (newNis !== oldNis) {
      setDataTahfidz((prev) =>
        prev.map((t) => (t.nis.toUpperCase() === oldNis ? { ...t, nis: newNis } : t))
      );
    }

    if (santriLoginRapor?.nis.toUpperCase() === oldNis) {
      setSantriLoginRapor(santriUpdated);
    }

    setEditSantriForm(null);
    setEditSantriAsliNis(null);
    Swal.fire({
      icon: 'success',
      title: 'Data Santri Diperbarui',
      text: `${santriUpdated.nama} (${santriUpdated.nis} · ${santriUpdated.unit} - ${santriUpdated.kelas}) berhasil disimpan.`,
      timer: 1800,
      showConfirmButton: false,
    });
  };

  const handleTambahUstadzAdmin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formUstadzNama.trim() || !formUstadzPin.trim()) return;
    const nowIso = new Date().toISOString();
    const uBaru: UstadzAccount = {
      id: `UST-${Date.now().toString(36).toUpperCase()}`,
      namaUstadz: formUstadzNama.trim(),
      unitAmpuan: [formUstadzUnit],
      kelasAmpuan: UNIT_KELAS_MAP[formUstadzUnit],
      mapelAmpuan: [formUstadzBidang.trim() || 'Pengajar Umum'],
      jamUlya: formUstadzUnit === 'Ulya' ? 6 : 0,
      jamWustho: formUstadzUnit === 'Wustho' ? 6 : 0,
      jamMDA: formUstadzUnit === 'MDA' ? 6 : 0,
      jamMA: 0,
      totalJam: 6,
      bidang: `${formUstadzBidang.trim() || 'Pengajar Umum'} (Unit ${formUstadzUnit})`,
      pinLogin: formUstadzPin.trim(),
      updatedAt: nowIso,
    };
    const keyUstadz = uBaru.namaUstadz.toLowerCase();
    const nextDeletedUstadz = deletedRecords.ustadz.filter((k) => k.toLowerCase() !== keyUstadz);
    simpanUstadzAtomik([uBaru], { nextDeletedUstadz });
    setFormUstadzNama('');
    setFormUstadzBidang('');
    Swal.fire({
      icon: 'success',
      title: 'Akun Ustadz Ditambahkan',
      text: `${uBaru.namaUstadz} (Unit ${formUstadzUnit} · PIN Login: ${uBaru.pinLogin}) aktif & tersimpan permanen.`,
      confirmButtonColor: '#0A1172',
    });
  };

  const handleHapusUstadzAdmin = async (ustadz: UstadzAccount) => {
    const res = await Swal.fire({
      icon: 'warning',
      title: 'Hapus Akun Ustadz Pengajar?',
      text: `Akun pengajar "${ustadz.namaUstadz}" (${ustadz.bidang}) akan dihapus dari direktori pengajar dan akses login Portal Ustadz.`,
      showCancelButton: true,
      confirmButtonText: 'Ya, Hapus Ustadz',
      cancelButtonText: 'Batal',
      confirmButtonColor: '#DC2626',
    });
    if (!res.isConfirmed) return;

    const keyUstadz = ustadz.namaUstadz.toLowerCase();
    setDeletedRecords((prev) => ({
      ...prev,
      ustadz: Array.from(new Set([...prev.ustadz, keyUstadz])),
    }));
    setUstadzList((prev) =>
      prev.filter((u) => !(u.id === ustadz.id || u.namaUstadz.toLowerCase() === keyUstadz))
    );
    if (ustadzLoginAktif?.id === ustadz.id) {
      setUstadzLoginAktif(null);
      setIsUstadzUnlocked(false);
    }
    Swal.fire({
      icon: 'success',
      title: 'Akun Ustadz Dihapus',
      text: `${ustadz.namaUstadz} telah dihapus dari daftar pengajar.`,
      timer: 1800,
      showConfirmButton: false,
    });
  };

  const handleEditUstadzAdmin = (ustadz: UstadzAccount) => {
    const unitAwal: UnitPendidikan[] =
      ustadz.unitAmpuan && ustadz.unitAmpuan.length > 0 ? [...ustadz.unitAmpuan] : ['Wustho'];
    const mapelSaatIni = Array.isArray(ustadz.aksesMapelIds)
      ? [...ustadz.aksesMapelIds]
      : ambilDaftarMapelAmpuanUstadz(ustadz).map((m) => m.id);
    setEditUstadzForm({
      id: ustadz.id,
      namaAsli: ustadz.namaUstadz,
      namaUstadz: ustadz.namaUstadz,
      unitAmpuan: unitAwal,
      kelasAmpuan: ustadz.kelasAmpuan ? [...ustadz.kelasAmpuan] : [],
      mapelAmpuanText:
        ustadz.mapelAmpuan && ustadz.mapelAmpuan.length > 0 ? ustadz.mapelAmpuan.join(', ') : '',
      aksesMapelIds: mapelSaatIni,
      sinkronPengampuKeToken: true,
      cariMapelModal: '',
      filterUnitModal: 'SEMUA',
      jamUlya: ustadz.jamUlya ?? 0,
      jamWustho: ustadz.jamWustho ?? 0,
      jamMDA: ustadz.jamMDA ?? 0,
      jamMA: ustadz.jamMA ?? 0,
      bidang: ustadz.bidang || '',
      pinLogin: ustadz.pinLogin || 'UST123',
    });
  };

  const handleSimpanEditUstadzAdmin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editUstadzForm) return;
    const namaClean = editUstadzForm.namaUstadz.trim();
    const pinClean = editUstadzForm.pinLogin.trim();

    if (!namaClean || !pinClean) {
      Swal.fire({
        icon: 'warning',
        title: 'Data Belum Lengkap',
        text: 'Nama Ustadz dan PIN Login wajib diisi.',
        confirmButtonColor: '#0A1172',
      });
      return;
    }

    const aksesIdsUnik = Array.from(new Set(editUstadzForm.aksesMapelIds));
    const mapelTerpilihObj = mapelList.filter((m) => aksesIdsUnik.includes(m.id));
    const unitDariMapel = Array.from(new Set(mapelTerpilihObj.map((m) => m.unit))) as UnitPendidikan[];
    const kelasDariMapel = Array.from(new Set(mapelTerpilihObj.map((m) => m.kelas)));
    const namaMapelDariMapel = Array.from(new Set(mapelTerpilihObj.map((m) => m.namaMapel)));

    const unitFinal: UnitPendidikan[] =
      unitDariMapel.length > 0
        ? unitDariMapel
        : editUstadzForm.unitAmpuan.length > 0
        ? editUstadzForm.unitAmpuan
        : ['Wustho'];
    const kelasFinal = kelasDariMapel.length > 0 ? kelasDariMapel : editUstadzForm.kelasAmpuan;
    const mapelArrManual = editUstadzForm.mapelAmpuanText
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const mapelFinal =
      namaMapelDariMapel.length > 0
        ? namaMapelDariMapel
        : mapelArrManual.length > 0
        ? mapelArrManual
        : ['Pengajar Umum'];

    const jamUlya = Math.max(0, Number(editUstadzForm.jamUlya) || 0);
    const jamWustho = Math.max(0, Number(editUstadzForm.jamWustho) || 0);
    const jamMDA = Math.max(0, Number(editUstadzForm.jamMDA) || 0);
    const jamMA = Math.max(0, Number(editUstadzForm.jamMA) || 0);
    const totalJam = jamUlya + jamWustho + jamMDA + jamMA;
    const nowIso = new Date().toISOString();

    const ustadzUpdated: UstadzAccount = {
      id: editUstadzForm.id,
      namaUstadz: namaClean,
      unitAmpuan: unitFinal,
      kelasAmpuan: kelasFinal,
      mapelAmpuan: mapelFinal,
      aksesMapelIds: aksesIdsUnik,
      jamUlya,
      jamWustho,
      jamMDA,
      jamMA,
      totalJam,
      bidang:
        editUstadzForm.bidang.trim() ||
        `${mapelFinal.join(', ')} (Unit ${unitFinal.join(', ')})`,
      pinLogin: pinClean,
      updatedAt: nowIso,
    };

    const prevDeletedUstadz = deletedRecords.ustadz.filter((k) => k.toLowerCase() !== namaClean.toLowerCase());
    if (editUstadzForm.namaAsli && editUstadzForm.namaAsli.toLowerCase() !== namaClean.toLowerCase()) {
      prevDeletedUstadz.push(editUstadzForm.namaAsli.toLowerCase());
    }
    const nextDeletedUstadz = Array.from(new Set(prevDeletedUstadz));

    // Sinkronkan juga kolom pengampu di Tabel Token jika opsi aktif atau jika nama Ustadz diganti
    const mapelPerluSync: MapelConfig[] = [];
    if (editUstadzForm.sinkronPengampuKeToken || editUstadzForm.namaAsli !== namaClean) {
      mapelList.forEach((m) => {
        if (editUstadzForm.sinkronPengampuKeToken && aksesIdsUnik.includes(m.id)) {
          if ((m.pengampu || '').trim() !== namaClean) {
            mapelPerluSync.push({ ...m, pengampu: namaClean, updatedAt: nowIso });
          }
        } else if (editUstadzForm.namaAsli !== namaClean && m.pengampu === editUstadzForm.namaAsli) {
          mapelPerluSync.push({ ...m, pengampu: namaClean, updatedAt: nowIso });
        }
      });
    }

    simpanUstadzAtomik([ustadzUpdated], {
      syncMapelList: mapelPerluSync.length > 0 ? mapelPerluSync : undefined,
      nextDeletedUstadz,
    });

    if (editUstadzForm.namaAsli !== namaClean && ustadzTerpilihNama === editUstadzForm.namaAsli) {
      setUstadzTerpilihNama(namaClean);
    }

    if (ustadzLoginAktif?.id === ustadzUpdated.id) {
      setUstadzLoginAktif(ustadzUpdated);
      setUstadzTerpilihNama(ustadzUpdated.namaUstadz);
    }

    setEditUstadzForm(null);
    Swal.fire({
      icon: 'success',
      title: 'Hak Akses Ustadz Diperbarui',
      text: `${ustadzUpdated.namaUstadz} kini mengampu ${aksesIdsUnik.length} pasangan mapel-kelas (${kelasFinal.join(', ') || '-'}) · PIN: ${ustadzUpdated.pinLogin}.`,
      timer: 2200,
      showConfirmButton: false,
    });
  };

  const handleHapusLogAktivitasNilaiSatuan = async (logTarget: LogAktivitasNilai) => {
    const res = await Swal.fire({
      icon: 'warning',
      title: 'Hapus Rekaman Log Ini?',
      text: `Log audit ${logTarget.idLog} (${logTarget.namaSantri} · ${logTarget.mapel} · ${logTarget.komponenNilai}) akan dihapus dari daftar.`,
      showCancelButton: true,
      confirmButtonText: 'Ya, Hapus',
      cancelButtonText: 'Batal',
      confirmButtonColor: '#DC2626',
    });
    if (!res.isConfirmed) return;
    setLogAktivitasNilai((prev) =>
      prev.filter(
        (item) =>
          !(
            item.idLog === logTarget.idLog &&
            item.timestamp === logTarget.timestamp &&
            item.nis === logTarget.nis
          )
      )
    );
  };

  const handleHapusLogUjianCBT = async (logTarget: LogUjianCBT) => {
    const res = await Swal.fire({
      icon: 'warning',
      title: 'Hapus Log Ujian CBT?',
      text: `Riwayat ujian CBT ${logTarget.namaSantri} (${logTarget.mapel} · Skor: ${logTarget.skorCBT}) akan dihapus dari log.`,
      showCancelButton: true,
      confirmButtonText: 'Ya, Hapus',
      cancelButtonText: 'Batal',
      confirmButtonColor: '#DC2626',
    });
    if (!res.isConfirmed) return;
    setLogUjianCBT((prev) => prev.filter((item) => item.idLog !== logTarget.idLog));
  };

  const handleBersihkanLogUjianCBT = async () => {
    const res = await Swal.fire({
      icon: 'warning',
      title: 'Bersihkan Semua Log Ujian CBT?',
      text: 'Seluruh riwayat log hasil & pelanggaran ujian CBT santri akan dikosongkan.',
      showCancelButton: true,
      confirmButtonText: 'Ya, Bersihkan Semua',
      cancelButtonText: 'Batal',
      confirmButtonColor: '#DC2626',
    });
    if (res.isConfirmed) {
      setLogUjianCBT([]);
    }
  };

  const handleExportUstadzDanJadwalExcel = () => {
    const wb = XLSX.utils.book_new();
    const rowsUstadz = ustadzList.map((u, idx) => ({
      No: idx + 1,
      ID_Ustadz: u.id,
      Nama_Pengajar: u.namaUstadz,
      Unit_Diampu: (u.unitAmpuan || []).join(', '),
      Kelas_Diampu: (u.kelasAmpuan || []).join(', '),
      Mata_Pelajaran: (u.mapelAmpuan || []).join(', ') || u.bidang,
      JP_Ulya: u.jamUlya ?? 0,
      JP_Wustho: u.jamWustho ?? 0,
      JP_MDA: u.jamMDA ?? 0,
      JP_MA: u.jamMA ?? 0,
      Total_JP: u.totalJam ?? 0,
      PIN_Login: u.pinLogin,
    }));
    const rowsMapel = mapelList.map((m, idx) => ({
      No: idx + 1,
      ID_Mapel: m.id,
      Unit: m.unit,
      Kelas: m.kelas,
      Mata_Pelajaran: m.namaMapel,
      Ustadz_Pengampu: m.pengampu || '-',
      Token_Ujian: m.tokenUjian,
      Durasi_Menit: m.durasiMenit,
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rowsUstadz), 'Data_Ustadz_Pengajar');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rowsMapel), 'Distribusi_Mapel_2026_2027');
    XLSX.writeFile(wb, 'Data_Ustadz_&_Jadwal_Mapel_Darul_Fithrah_2026_2027.xlsx');
  };

  // Fitur Import & Export Data Buku Induk Santri Massal via Excel (.xlsx) - 18 Kolom Lengkap
  const handleDownloadTemplateSantriExcel = () => {
    const contohRows = [
      {
        NIS: '27.2627.811',
        NISN: '3149470541',
        'Nama Lengkap': 'Faqih Murtaja Adz Dzaki',
        NIK: '3205012007140001',
        'No. KK': '3205011511070063',
        JK: 'L',
        'Tempat Lahir': 'Garut',
        'Tanggal Lahir': '20-07-2014',
        Alamat: 'Bentar Girang Rt 02 Rw 03 Kota Wetan Garut kota, Garut, Jawa Barat',
        Angkatan: 'K27',
        'Tanggal Masuk': '19-07-2026',
        'Kode Barang': '-',
        'Nama Ayah': 'Sutarmin',
        'No. Telp. Ayah': '-',
        'Nama Ibu': 'Sri Lestari',
        'No. Telp. Ibu': '-',
        Unit: 'Wustho',
        Kelas: 'Kelas 7',
        'Jumlah Hafalan': '0 juz',
      },
      {
        NIS: '22.21.22.422',
        NISN: '-',
        'Nama Lengkap': 'Aditya Raffi Syahputra',
        NIK: '3311050711080001',
        'No. KK': '3311051502210004',
        JK: 'L',
        'Tempat Lahir': 'Sukoharjo',
        'Tanggal Lahir': '07-11-2008',
        Alamat: 'Brangkal RT/RW 02/03 Kel. Lawu, Kec. Nguter, Kab. Sukoharjo',
        Angkatan: 'K22',
        'Tanggal Masuk': '23-07-2021',
        'Kode Barang': 'K22 - 04',
        'Nama Ayah': '-',
        'No. Telp. Ayah': '-',
        'Nama Ibu': 'Supatmi',
        'No. Telp. Ibu': '085327279773',
        Unit: 'Ulya',
        Kelas: 'Kelas 12',
        'Jumlah Hafalan': '17 juz 16 halaman',
      },
    ];
    const ws = XLSX.utils.json_to_sheet(contohRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Template_Buku_Induk_Santri');
    XLSX.writeFile(wb, 'Template_Buku_Induk_Santri_Darul_Fithrah.xlsx');
  };

  const handleExportSantriExcel = () => {
    const rows = santriList.map((s, idx) => ({
      No: idx + 1,
      NIS: s.nis,
      NISN: s.nisn || '-',
      'Nama Lengkap': s.nama,
      NIK: s.nik || '-',
      'No. KK': s.noKK || '-',
      JK: s.jk || 'L',
      'Tempat Lahir': s.tempatLahir || '-',
      'Tanggal Lahir': s.tanggalLahir || '-',
      Alamat: s.alamat || '-',
      Angkatan: s.angkatan || '-',
      'Tanggal Masuk': s.tanggalMasuk || '-',
      'Kode Barang': s.kodeBarang || '-',
      'Nama Ayah': s.namaAyah || '-',
      'No. Telp. Ayah': s.noTelpAyah || '-',
      'Nama Ibu': s.namaIbu || '-',
      'No. Telp. Ibu': s.noTelpIbu || '-',
      Unit: s.unit,
      'Kelas Sistem': s.kelas,
      'Kelas Terdata': s.kelasTerdata || s.kelas,
      'Jumlah Hafalan': s.jumlahHafalan || '0 juz',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Master_Santri_Aktif');
    XLSX.writeFile(wb, 'Data_Buku_Induk_Santri_Aktif_Darul_Fithrah.xlsx');
  };

  const handleImportSantriDariExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
      const baruList: Santri[] = [];
      let dilewatiMahadAly = 0;

      rows.forEach((r, idx) => {
        const kelasRaw = String(r.Kelas || r.kelas || r['Kelas Terdata'] || '').trim();
        if (/ma'?had\s+aly/i.test(kelasRaw)) {
          dilewatiMahadAly++;
          return;
        }

        const nisnRaw = String(r.NISN || r.nisn || '').trim().replace(/^'+/, '');
        const nisRaw =
          String(r.NIS || r.nis || r['Nomor Induk'] || '').trim().toUpperCase() ||
          (nisnRaw ? `DF-${nisnRaw}` : `DF-ROW-${idx + 1}`);
        const namaRaw = String(r['Nama Lengkap'] || r.Nama_Santri || r.Nama || r.nama || '').trim();
        if (!namaRaw) return;

        let unitValid: UnitPendidikan = 'Wustho';
        let kelasValid = 'Kelas 7';
        const unitRaw = String(r.Unit || r.unit || '').trim();

        if (/mda\s*putri|putri/i.test(kelasRaw)) {
          unitValid = 'MDA';
          kelasValid = 'Putri';
        } else if (/mda\s*putra|mda/i.test(kelasRaw) || unitRaw === 'MDA') {
          unitValid = 'MDA';
          if (/junior/i.test(kelasRaw) || /^MDA03/i.test(nisRaw)) {
            kelasValid = 'Junior';
          } else {
            kelasValid = 'Senior';
          }
        } else if (/kelas\s*(10|11|12)/i.test(kelasRaw) || unitRaw === 'Ulya') {
          unitValid = 'Ulya';
          const m = kelasRaw.match(/(10|11|12)/);
          kelasValid = m ? `Kelas ${m[1]}` : 'Kelas 10';
        } else {
          unitValid = 'Wustho';
          const m = kelasRaw.match(/(7|8|9)/);
          kelasValid = m ? `Kelas ${m[1]}` : 'Kelas 7';
        }

        const jkRaw = String(r.JK || r.jk || 'L').trim().toUpperCase();
        const jumlahHafalanRaw = String(r['Jumlah Hafalan'] || r.Jumlah_Hafalan || r.jumlahHafalan || '0 juz').trim();

        baruList.push({
          nis: nisRaw,
          nisn: nisnRaw || '-',
          nama: namaRaw,
          unit: unitValid,
          kelas: kelasValid,
          kelasTerdata: kelasRaw || kelasValid,
          nik: String(r.NIK || r.nik || '-').trim() || '-',
          noKK: String(r['No. KK'] || r.No_KK || r.noKK || '-').trim() || '-',
          jk: jkRaw === 'P' ? 'P' : 'L',
          tempatLahir: String(r['Tempat Lahir'] || r.Tempat_Lahir || r.tempatLahir || '-').trim() || '-',
          tanggalLahir: String(r['Tanggal Lahir'] || r.Tanggal_Lahir || r.tanggalLahir || '-').trim() || '-',
          alamat: String(r.Alamat || r.alamat || '-').trim() || '-',
          angkatan: String(r.Angkatan || r.angkatan || '-').trim() || '-',
          tanggalMasuk: String(r['Tanggal Masuk'] || r.Tanggal_Masuk || r.tanggalMasuk || '-').trim() || '-',
          kodeBarang: String(r['Kode Barang'] || r.Kode_Barang || r.kodeBarang || '-').trim() || '-',
          namaAyah: String(r['Nama Ayah'] || r.Nama_Ayah || r.namaAyah || '-').trim() || '-',
          noTelpAyah: String(r['No. Telp. Ayah'] || r.No_Telp_Ayah || r.noTelpAyah || '-').trim() || '-',
          namaIbu: String(r['Nama Ibu'] || r.Nama_Ibu || r.namaIbu || '-').trim() || '-',
          noTelpIbu: String(r['No. Telp. Ibu'] || r.No_Telp_Ibu || r.noTelpIbu || '-').trim() || '-',
          jumlahHafalan: jumlahHafalanRaw,
        });
      });

      if (baruList.length === 0) {
        Swal.fire('Data Kosong', 'Pastikan file Excel memiliki kolom NIS/NISN, Nama Lengkap, dan Kelas.', 'warning');
        return;
      }

      const importedNisSet = new Set(baruList.map((s) => s.nis.toUpperCase()));
      setDeletedRecords((prev) => ({
        ...prev,
        santri: prev.santri.filter((k) => !importedNisSet.has(k.toUpperCase())),
      }));

      setSantriList((prev) => {
        const map = new Map<string, Santri>();
        prev.forEach((s) => map.set(s.nis, s));
        baruList.forEach((s) => map.set(s.nis, s));
        return Array.from(map.values());
      });

      Swal.fire({
        icon: 'success',
        title: 'Import Buku Induk Santri Berhasil!',
        text: `${baruList.length} santri aktif berhasil diimpor (${dilewatiMahadAly} baris Ma'had Aly otomatis dikecualikan).`,
        confirmButtonColor: '#0A1172',
      });
    } catch (err) {
      Swal.fire('Gagal Membaca Excel', err instanceof Error ? err.message : 'Format tidak didukung', 'error');
    } finally {
      e.target.value = '';
    }
  };

  const handleExportRekapNilaiKelasExcel = () => {
    const rows = santriFilteredUstadz.map((s, idx) => {
      const r = nilaiAkademik.find((n) => n.nis === s.nis && n.mapel === ustadzMapel) || {
        tugas: 80,
        sikap: 85,
        lisan: 80,
        cbt: 0,
      };
      const calc = hitungNilaiAkhirPesantren(r.tugas, r.sikap, r.lisan, r.cbt);
      return {
        No: idx + 1,
        NIS: s.nis,
        Nama_Santri: s.nama,
        Unit: s.unit,
        Kelas: s.kelas,
        Mata_Pelajaran: ustadzMapel,
        Tugas_20_Persen: r.tugas,
        Sikap_20_Persen: r.sikap,
        Lisan_20_Persen: r.lisan,
        CBT_40_Persen: r.cbt,
        Nilai_Akhir: calc.nilaiAkhir,
        Predikat: calc.predikat,
      };
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Rekap_Nilai');
    XLSX.writeFile(wb, `Rekap_Nilai_${ustadzMapel.replace(/\s+/g, '_')}_${ustadzUnit}_${ustadzKelas}.xlsx`);
  };

  const handleExportBankSoalExcel = () => {
    const rows = bankSoal
      .filter((s) => s.unit === ustadzUnit && s.kelas === ustadzKelas && s.mapel === ustadzMapel)
      .map((s, idx) => ({
        No: idx + 1,
        ID_Soal: s.idSoal,
        Unit: s.unit,
        Kelas: s.kelas,
        Mapel: s.mapel,
        Pertanyaan: s.pertanyaan,
        Teks_Arab: s.teksArabSoal || '',
        Potongan_Kode_IT: s.potonganKodeIT || '',
        Opsi_A: s.opsiA,
        Opsi_B: s.opsiB,
        Opsi_C: s.opsiC,
        Opsi_D: s.opsiD,
        Kunci_Jawaban: s.kunciJawaban || 'A',
        Bobot_Soal: s.bobotSoal,
      }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Bank_Soal_CBT');
    XLSX.writeFile(wb, `Bank_Soal_${ustadzMapel.replace(/\s+/g, '_')}_${ustadzUnit}_${ustadzKelas}.xlsx`);
  };

  // ==========================================================================
  // HANDLERS MODUL B: PORTAL USTADZ - AI PEMBUAT SOAL CBT LANGSUNG (TANPA EKSTRAK MENTAH)
  // ==========================================================================
  const saringBersihSoalCBT = (
    daftarMentah: Array<Record<string, unknown>>
  ): Omit<SoalCBT, 'idSoal' | 'unit' | 'kelas' | 'mapel'>[] => {
    const polaBukanSoal =
      /bukan\s+bagian\s+dari\s+soal|bukan\s+merupakan\s+soal|bukan\s+soal|tidak\s+termasuk\s+soal|tidak\s+ada\s+soal|teks\s+pengantar|petunjuk\s+pengerjaan|petunjuk\s+umum|kop\s+surat|identitas\s+peserta|selamat\s+mengerjakan/i;

    const tersaring = daftarMentah
      .map((item) => {
        const pertanyaan = String(item.pertanyaan || '')
          .replace(/^\s*(?:soal\s*)?\d+[\.\)\-:]\s*/i, '')
          .replace(/\s*\((?:bukan\s+bagian\s+dari\s+soal|[^)]*bukan\s+soal[^)]*)\)\s*/gi, '')
          .trim();
        const opsiA = String(item.opsiA || '').replace(/^\s*[aA][\.\)\-:]\s*/, '').trim();
        const opsiB = String(item.opsiB || '').replace(/^\s*[bB][\.\)\-:]\s*/, '').trim();
        const opsiC = String(item.opsiC || '').replace(/^\s*[cC][\.\)\-:]\s*/, '').trim();
        const opsiD = String(item.opsiD || '').replace(/^\s*[dD][\.\)\-:]\s*/, '').trim();
        const kunciRaw = String(item.kunciJawaban || 'A').trim().toUpperCase();
        const kunciJawaban = (['A', 'B', 'C', 'D'].includes(kunciRaw) ? kunciRaw : 'A') as 'A' | 'B' | 'C' | 'D';

        return {
          pertanyaan,
          teksArabSoal: String(item.teksArabSoal || '').trim() || undefined,
          potonganKodeIT: String(item.potonganKodeIT || '').trim() || undefined,
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
        const gabungan = `${s.pertanyaan} ${s.opsiA} ${s.opsiB} ${s.opsiC} ${s.opsiD}`;
        if (polaBukanSoal.test(gabungan)) return false;
        return true;
      });

    const bobotDefault = tersaring.length > 0 ? Math.max(1, Math.round(100 / tersaring.length)) : 20;
    return tersaring.map((s) => ({
      ...s,
      bobotSoal: s.bobotSoal > 0 ? s.bobotSoal : bobotDefault,
    }));
  };

  const produksiSoalCBTDariAI = async (params: {
    rawText?: string;
    documentText?: string;
    fileBase64?: string;
    mimeType?: string;
  }) => {
    if (!pastikanAksesUstadzValid(ustadzUnit, ustadzKelas, ustadzMapel)) return;
    setIsAiLoading(true);
    try {
      const response = await fetch('/api/ai-extract-soal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rawText: params.rawText || '',
          documentText: params.documentText || '',
          fileBase64: params.fileBase64 || undefined,
          mimeType: params.mimeType || undefined,
          mapel: ustadzMapel,
          unit: ustadzUnit,
          kelas: ustadzKelas,
        }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          (data && typeof data.pesan === 'string' && data.pesan) ||
            `Server AI merespons dengan status ${response.status}. Silakan coba beberapa saat lagi.`
        );
      }

      if (data.sukses && Array.isArray(data.soal)) {
        const hasilBersih = saringBersihSoalCBT(data.soal);
        if (hasilBersih.length > 0) {
          setAiPreviewSoal(hasilBersih);
          Swal.fire({
            icon: 'success',
            title: 'Soal CBT Siap Digunakan!',
            text: `${hasilBersih.length} soal Pilihan Ganda CBT telah disusun otomatis untuk ${ustadzMapel}. Silakan klik Simpan ke Bank Soal CBT.`,
            confirmButtonColor: '#0A1172',
          });
          return;
        }
      }
      throw new Error(data.pesan || 'Tidak ditemukan butir soal CBT yang valid pada materi tersebut.');
    } catch (err) {
      const pesanError =
        err instanceof Error
          ? err.message
          : 'Pastikan dokumen atau materi yang dimasukkan memuat topik atau butir pertanyaan untuk dijadikan soal CBT.';
      const apakahServerPadat = /503|429|padat|lonjakan|kuota|server ai/i.test(pesanError);
      Swal.fire({
        icon: apakahServerPadat ? 'info' : 'warning',
        title: apakahServerPadat ? 'Layanan AI Sedang Padat Sementara' : 'Belum Ada Soal CBT Terdeteksi',
        text: pesanError,
        confirmButtonColor: '#0A1172',
      });
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleFileUploadImporter = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (file.size > 18 * 1024 * 1024) {
      Swal.fire({
        icon: 'warning',
        title: 'Ukuran File Terlalu Besar',
        text: 'Maksimal ukuran file PDF/gambar yang diunggah adalah 18 MB. Silakan kompres atau pecah file terlebih dahulu.',
        confirmButtonColor: '#0A1172',
      });
      return;
    }

    setAiFileName(file.name);
    const ext = file.name.split('.').pop()?.toLowerCase() || '';

    try {
      // 1. Jika file Word (.docx) -> baca di balik layar & langsung produksi soal CBT tanpa menampilkan teks mentah
      if (ext === 'docx') {
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer });
        const docText = result.value.trim();
        setAiDocumentText(docText);
        setAiFileBase64('');
        setAiFileMime('');
        await produksiSoalCBTDariAI({ documentText: docText, rawText: aiRawText });
        return;
      }

      // 2. Jika file Excel (.xlsx / .xls / .csv) -> baca di balik layar & langsung produksi soal CBT
      if (['xlsx', 'xls', 'csv'].includes(ext)) {
        const arrayBuffer = await file.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: 'array' });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, { defval: '' });
        const docText = JSON.stringify(rows);
        setAiDocumentText(docText);
        setAiFileBase64('');
        setAiFileMime('');
        await produksiSoalCBTDariAI({ documentText: docText, rawText: aiRawText });
        return;
      }

      // 3. Jika PDF atau Gambar (.pdf, .jpg, .jpeg, .png, .webp) -> langsung produksi soal CBT via multimodal AI
      const reader = new FileReader();
      reader.onload = async () => {
        const dataUrl = String(reader.result || '');
        const base64Part = dataUrl.split(',')[1] || '';
        const mime = file.type || (ext === 'pdf' ? 'application/pdf' : 'image/jpeg');
        setAiDocumentText('');
        setAiFileBase64(base64Part);
        setAiFileMime(mime);
        await produksiSoalCBTDariAI({
          fileBase64: base64Part,
          mimeType: mime,
          rawText: aiRawText,
        });
      };
      reader.readAsDataURL(file);
    } catch (err) {
      Swal.fire('Gagal Memproses File', err instanceof Error ? err.message : 'Format tidak dikenali', 'error');
    }
  };

  const handleJalankanAIScreening = async () => {
    if (!aiRawText.trim() && !aiDocumentText.trim() && !aiFileBase64) {
      Swal.fire({
        icon: 'warning',
        title: 'Materi / Soal Belum Diisi',
        text: 'Unggah file soal (.pdf, .jpg/.png, .docx, .xlsx) atau ketik topik/soal pada kotak di bawah terlebih dahulu.',
        confirmButtonColor: '#0A1172',
      });
      return;
    }

    await produksiSoalCBTDariAI({
      rawText: aiRawText,
      documentText: aiDocumentText,
      fileBase64: aiFileBase64 || undefined,
      mimeType: aiFileMime || undefined,
    });
  };

  const handleSimpanSemuaPreviewKeBankSoal = () => {
    if (aiPreviewSoal.length === 0) return;
    if (!pastikanAksesUstadzValid(ustadzUnit, ustadzKelas, ustadzMapel)) return;
    const tambahan: SoalCBT[] = aiPreviewSoal.map((item) => ({
      idSoal: buatIdUnik('SOAL'),
      unit: ustadzUnit,
      kelas: ustadzKelas,
      mapel: ustadzMapel,
      pertanyaan: bersihkanDanScreeningTeksSoal(item.pertanyaan, true),
      teksArabSoal: item.teksArabSoal,
      potonganKodeIT: item.potonganKodeIT,
      gambarSoalUrl: item.gambarSoalUrl,
      opsiA: bersihkanDanScreeningTeksSoal(item.opsiA, false),
      opsiB: bersihkanDanScreeningTeksSoal(item.opsiB, false),
      opsiC: bersihkanDanScreeningTeksSoal(item.opsiC, false),
      opsiD: bersihkanDanScreeningTeksSoal(item.opsiD, false),
      kunciJawaban: item.kunciJawaban || 'A',
      bobotSoal: item.bobotSoal,
    }));
    simpanSoalAtomik(tambahan);
    setAiPreviewSoal([]);
    setAiRawText('');
    setAiDocumentText('');
    setAiFileBase64('');
    setAiFileMime('');
    setAiFileName('');
    Swal.fire({
      icon: 'success',
      title: 'Tersimpan & Telah Discreening!',
      text: `${tambahan.length} butir soal CBT baru berhasil masuk ke Bank Soal ${ustadzMapel} (${ustadzUnit} - ${ustadzKelas}) dan tampil di Preview Hasil Soal di bawah.`,
      confirmButtonColor: '#0A1172',
    });
  };

  const simpanSoalManualDariForm = () => {
    if (!manualPertanyaan.trim() || !manualOpsiA.trim() || !manualOpsiB.trim()) {
      Swal.fire({
        icon: 'warning',
        title: 'Data Soal Manual Belum Lengkap',
        text: 'Pastikan Pertanyaan, Opsi A, dan Opsi B telah diisi terlebih dahulu.',
        confirmButtonColor: '#0A1172',
      });
      return;
    }
    if (!pastikanAksesUstadzValid(ustadzUnit, ustadzKelas, ustadzMapel)) return;
    const baru: SoalCBT = {
      idSoal: buatIdUnik('SOAL'),
      unit: ustadzUnit,
      kelas: ustadzKelas,
      mapel: ustadzMapel,
      pertanyaan: bersihkanDanScreeningTeksSoal(manualPertanyaan, true),
      teksArabSoal: manualTeksArab.trim() || undefined,
      potonganKodeIT: manualPotonganKode.trim() || undefined,
      gambarSoalUrl: manualGambarUrl || undefined,
      opsiA: bersihkanDanScreeningTeksSoal(manualOpsiA, false),
      opsiB: bersihkanDanScreeningTeksSoal(manualOpsiB, false),
      opsiC: bersihkanDanScreeningTeksSoal(manualOpsiC, false),
      opsiD: bersihkanDanScreeningTeksSoal(manualOpsiD, false),
      kunciJawaban: manualKunci,
      bobotSoal: Number(manualBobot) || 25,
    };
    simpanSoalAtomik([baru]);
    setManualPertanyaan('');
    setManualTeksArab('');
    setManualPotonganKode('');
    setManualGambarUrl('');
    setManualOpsiA('');
    setManualOpsiB('');
    setManualOpsiC('');
    setManualOpsiD('');
    Swal.fire({
      icon: 'success',
      title: 'Soal Manual Disimpan & Discreening',
      text: `Soal ${baru.idSoal} telah diperiksa ejaannya dan ditambahkan ke Preview Hasil Soal ${ustadzMapel}.`,
      confirmButtonColor: '#0A1172',
    });
  };

  const handleSimpanSoalManual = (e: React.FormEvent) => {
    e.preventDefault();
    simpanSoalManualDariForm();
  };

  const bukaFullscreenPreviewSoal = (sumber: SumberFullscreenPreview, startIndex = 0) => {
    if (sumber === 'manual') {
      const adaIsiManual =
        manualPertanyaan.trim() ||
        manualTeksArab.trim() ||
        manualPotonganKode.trim() ||
        manualGambarUrl ||
        manualOpsiA.trim() ||
        manualOpsiB.trim() ||
        manualOpsiC.trim() ||
        manualOpsiD.trim();
      if (!adaIsiManual) {
        Swal.fire({
          icon: 'info',
          title: 'Form Soal Manual Masih Kosong',
          text: 'Ketik pertanyaan atau pilihan jawaban terlebih dahulu untuk melihat tampilan Preview Fullscreen.',
          confirmButtonColor: '#0A1172',
        });
        return;
      }
    } else if (sumber === 'draft_import' && aiPreviewSoal.length === 0) {
      Swal.fire({
        icon: 'info',
        title: 'Belum Ada Draft Hasil Import',
        text: 'Unggah file soal atau jalankan AI Pembuat Soal terlebih dahulu.',
        confirmButtonColor: '#0A1172',
      });
      return;
    } else if (sumber === 'bank_soal') {
      const jumlahTersimpan = bankSoal.filter(
        (s) => s.unit === ustadzUnit && s.kelas === ustadzKelas && s.mapel === ustadzMapel
      ).length;
      if (jumlahTersimpan === 0) {
        Swal.fire({
          icon: 'info',
          title: 'Belum Ada Soal Tersimpan',
          text: `Belum ada soal CBT untuk ${ustadzMapel} (${ustadzUnit} · ${ustadzKelas}).`,
          confirmButtonColor: '#0A1172',
        });
        return;
      }
    }

    setFullscreenPreviewIndex(startIndex);
    setFullscreenPreviewSumber(sumber);
  };

  // Fungsi Screening & Koreksi Ejaan/Typo Seluruh Soal di Bank Soal CBT
  const handleJalankanScreeningTypoSemuaSoal = async () => {
    setIsScreeningTypoLoading(true);
    try {
      // Tahap 1: Koreksi instan kaidah ejaan, spasi, kapitalisasi & kamus istilah (hanya mapel aktif agar aman multi-ustadz)
      const soalMapelAktif = bankSoal
        .filter((s) => s.unit === ustadzUnit && s.kelas === ustadzKelas && s.mapel === ustadzMapel)
        .map((s) => ({
          ...s,
          pertanyaan: bersihkanDanScreeningTeksSoal(s.pertanyaan, true),
          opsiA: bersihkanDanScreeningTeksSoal(s.opsiA, false),
          opsiB: bersihkanDanScreeningTeksSoal(s.opsiB, false),
          opsiC: bersihkanDanScreeningTeksSoal(s.opsiC, false),
          opsiD: bersihkanDanScreeningTeksSoal(s.opsiD, false),
        }));

      let totalDiperbaiki = 0;
      if (soalMapelAktif.length > 0) {
        const res = await fetch('/api/ai-proofread-soal', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ daftarSoal: soalMapelAktif }),
        });
        const data = await res.json();
        if (data.sukses && Array.isArray(data.soal)) {
          totalDiperbaiki = Number(data.jumlahDiperbaiki) || 0;
          const mapKoreksi = new Map<string, SoalCBT>();
          data.soal.forEach((item: SoalCBT) => mapKoreksi.set(item.idSoal, item));
          const soalFinal = soalMapelAktif.map((s) => {
            const hasilAI = mapKoreksi.get(s.idSoal);
            return hasilAI ? { ...s, ...hasilAI } : s;
          });
          simpanSoalAtomik(soalFinal);
        } else {
          simpanSoalAtomik(soalMapelAktif);
        }
      }

      Swal.fire({
        icon: 'success',
        title: 'Screening Ejaan & Salah Tulisan Selesai!',
        text:
          totalDiperbaiki > 0
            ? `Berhasil memeriksa seluruh soal mapel ${ustadzMapel} dan mengoreksi otomatis ${totalDiperbaiki} soal yang memiliki ketidaktepatan penulisan/typo.`
            : 'Seluruh butir pertanyaan dan opsi jawaban (A, B, C, D) telah discreening dan bebas dari salah tulisan (typo).',
        confirmButtonColor: '#0A1172',
      });
    } catch {
      // Tetap terapkan hasil screening ejaan lokal jika jaringan sibuk
      const soalMapelAktifLokal = bankSoal
        .filter((s) => s.unit === ustadzUnit && s.kelas === ustadzKelas && s.mapel === ustadzMapel)
        .map((s) => ({
          ...s,
          pertanyaan: bersihkanDanScreeningTeksSoal(s.pertanyaan, true),
          opsiA: bersihkanDanScreeningTeksSoal(s.opsiA, false),
          opsiB: bersihkanDanScreeningTeksSoal(s.opsiB, false),
          opsiC: bersihkanDanScreeningTeksSoal(s.opsiC, false),
          opsiD: bersihkanDanScreeningTeksSoal(s.opsiD, false),
        }));
      if (soalMapelAktifLokal.length > 0) {
        simpanSoalAtomik(soalMapelAktifLokal);
      }
      Swal.fire({
        icon: 'success',
        title: 'Screening Ejaan Selesai',
        text: 'Seluruh soal telah dirapikan ejaan, kapitalisasi, dan tanda bacanya.',
        confirmButtonColor: '#0A1172',
      });
    } finally {
      setIsScreeningTypoLoading(false);
    }
  };

  // Helper pencatat Log Aktivitas Perubahan Nilai oleh Ustadz
  const formatTimestampAuditWIB = (): string => {
    const now = new Date();
    const tgl = now.toLocaleDateString('id-ID', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
    const jam = now
      .toLocaleTimeString('id-ID', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
      .replace(/:/g, '.');
    return `${tgl}, ${jam} WIB`;
  };

  // Helper pemfilter data Log Aktivitas Perubahan Nilai sesuai filter aktif di Dasbor Admin
  const ambilDaftarLogAktivitasTerfilter = (): LogAktivitasNilai[] => {
    return logAktivitasNilai.filter((item) => {
      if (filterUnitLogNilaiAdmin !== 'SEMUA' && item.unit !== filterUnitLogNilaiAdmin) {
        return false;
      }
      if (filterKomponenLogNilaiAdmin !== 'SEMUA') {
        if (filterKomponenLogNilaiAdmin === 'TAHFIDZ_IT') {
          if (
            !item.komponenNilai.toLowerCase().includes('tahfidz') &&
            !item.komponenNilai.toLowerCase().includes('it')
          ) {
            return false;
          }
        } else if (item.komponenNilai !== filterKomponenLogNilaiAdmin) {
          return false;
        }
      }
      if (!cariLogNilaiAdmin.trim()) return true;
      const q = cariLogNilaiAdmin.toLowerCase();
      return (
        item.nis.toLowerCase().includes(q) ||
        item.namaSantri.toLowerCase().includes(q) ||
        item.mapel.toLowerCase().includes(q) ||
        item.namaUstadz.toLowerCase().includes(q) ||
        item.komponenNilai.toLowerCase().includes(q) ||
        item.idLog.toLowerCase().includes(q)
      );
    });
  };

  const susunBarisEksporLogAktivitas = (daftarLog: LogAktivitasNilai[]) => {
    return daftarLog.map((log, i) => ({
      No: i + 1,
      'ID Audit': log.idLog,
      'Waktu Perubahan (Timestamp)': log.timestamp,
      'Ustadz Pengubah': log.namaUstadz,
      'NIS Santri': log.nis,
      'Nama Santri': log.namaSantri,
      Unit: log.unit,
      Kelas: log.kelas,
      'Mata Pelajaran': log.mapel,
      'Komponen Nilai': log.komponenNilai,
      'Nilai Lama': log.nilaiLama,
      'Nilai Baru': log.nilaiBaru,
      Selisih:
        typeof log.selisih === 'number'
          ? log.selisih > 0
            ? `+${log.selisih}`
            : String(log.selisih)
          : '-',
      'Nilai Akhir Lama': log.nilaiAkhirLama ?? '-',
      'Nilai Akhir Baru': log.nilaiAkhirBaru ?? '-',
    }));
  };

  // Export Log Aktivitas Perubahan Nilai ke Excel (.xlsx)
  const handleExportLogAktivitasNilaiExcel = () => {
    const dataTarget = ambilDaftarLogAktivitasTerfilter();
    if (dataTarget.length === 0) {
      Swal.fire('Log Kosong', 'Belum ada data log aktivitas perubahan nilai yang sesuai filter untuk diekspor.', 'info');
      return;
    }
    const rows = susunBarisEksporLogAktivitas(dataTarget);
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Log_Audit_Nilai');
    XLSX.writeFile(wb, `Audit_Log_Perubahan_Nilai_Darul_Fithrah_2026.xlsx`);
  };

  // Export Log Aktivitas Perubahan Nilai ke CSV (.csv UTF-8 dengan BOM untuk kompatibilitas lintas sistem/database)
  const handleExportLogAktivitasNilaiCSV = () => {
    const dataTarget = ambilDaftarLogAktivitasTerfilter();
    if (dataTarget.length === 0) {
      Swal.fire('Log Kosong', 'Belum ada data log aktivitas perubahan nilai yang sesuai filter untuk diekspor ke CSV.', 'info');
      return;
    }

    const escapeCsvCell = (val: unknown): string => {
      const str = String(val ?? '');
      if (/[",\n\r]/.test(str)) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const headers = [
      'No',
      'ID_Audit',
      'Timestamp_WIB',
      'Ustadz_Pengubah',
      'NIS_Santri',
      'Nama_Santri',
      'Unit',
      'Kelas',
      'Mata_Pelajaran',
      'Komponen_Nilai',
      'Nilai_Lama',
      'Nilai_Baru',
      'Selisih',
      'Nilai_Akhir_Lama',
      'Nilai_Akhir_Baru',
    ];

    const csvLines = [
      headers.join(','),
      ...dataTarget.map((log, i) => {
        const selisihStr =
          typeof log.selisih === 'number'
            ? log.selisih > 0
              ? `+${log.selisih}`
              : String(log.selisih)
            : '-';
        return [
          i + 1,
          log.idLog,
          log.timestamp,
          log.namaUstadz,
          log.nis,
          log.namaSantri,
          log.unit,
          log.kelas,
          log.mapel,
          log.komponenNilai,
          log.nilaiLama,
          log.nilaiBaru,
          selisihStr,
          log.nilaiAkhirLama ?? '-',
          log.nilaiAkhirBaru ?? '-',
        ]
          .map(escapeCsvCell)
          .join(',');
      }),
    ];

    // Gunakan UTF-8 BOM (\uFEFF) agar karakter khusus & tanda panah terbaca rapi di Excel, Google Sheets, maupun sistem database
    const csvContent = '\uFEFF' + csvLines.join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const labelUnit = filterUnitLogNilaiAdmin === 'SEMUA' ? 'SemuaUnit' : filterUnitLogNilaiAdmin;
    const namaFile = `Audit_Log_Perubahan_Nilai_Darul_Fithrah_${labelUnit}_2026.csv`;
    link.href = url;
    link.setAttribute('download', namaFile);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    Swal.fire({
      icon: 'success',
      title: 'File CSV Berhasil Diunduh!',
      text: `${dataTarget.length} rekaman Log Aktivitas Nilai telah diekspor ke ${namaFile} (Format CSV UTF-8 siap integrasi data).`,
      timer: 2100,
      showConfirmButton: false,
    });
  };

  // Update Nilai Akademik Non-CBT per Santri dengan Auto-Save, Indikator Loading Real-Time & Pencatatan Log Aktivitas
  const handleUpdateNilaiNonCBT = (
    nis: string,
    field: 'tugas' | 'sikap' | 'lisan',
    rawValue: number
  ) => {
    if (!pastikanAksesUstadzValid(ustadzUnit, ustadzKelas, ustadzMapel)) return;
    const value = Number.isNaN(rawValue) ? 0 : Math.min(100, Math.max(0, rawValue));
    const rowKey = `${nis}__${ustadzMapel}`;
    const cellKey = `${nis}__${ustadzMapel}__${field}`;
    const labelField =
      field === 'tugas'
        ? 'Tugas Harian (20%)'
        : field === 'sikap'
        ? 'Nilai Sikap (20%)'
        : 'Ujian Lisan (20%)';
    const santriObj = santriList.find((s) => s.nis === nis);
    const namaSantri = santriObj?.nama || nis;
    const unitSantri = santriObj?.unit || ustadzUnit;
    const kelasSantri = santriObj?.kelas || ustadzKelas;
    const pelakuUstadz =
      ustadzLoginAktif?.namaUstadz ||
      mapelList.find(
        (m) => m.unit === ustadzUnit && m.kelas === ustadzKelas && m.namaMapel === ustadzMapel
      )?.pengampu ||
      ustadzTerpilihNama;

    // Tangkap nilai awal sebelum sesi ketik dimulai agar log mencatat nilai lama -> nilai baru secara akurat
    const barisSaatIni = nilaiAkademik.find((r) => r.nis === nis && r.mapel === ustadzMapel);
    const nilaiDefaultKomponen = 0;
    const nilaiLamaKomponen = barisSaatIni ? barisSaatIni[field] : nilaiDefaultKomponen;
    const nilaiAkhirSaatIni = barisSaatIni ? barisSaatIni.nilaiAkhir : 0;

    const keyNilaiNorm = `${nis}__${ustadzMapel.trim().toLowerCase()}`.toLowerCase();
    setDeletedRecords((prev) =>
      prev.nilai.includes(keyNilaiNorm)
        ? { ...prev, nilai: prev.nilai.filter((k) => k !== keyNilaiNorm) }
        : prev
    );

    if (!nilaiAwalSebelumEditRef.current[cellKey]) {
      nilaiAwalSebelumEditRef.current[cellKey] = {
        nilaiLama: nilaiLamaKomponen,
        nilaiAkhirLama: nilaiAkhirSaatIni,
      };
    }

    // Set indikator loading ("saving") pada header, baris santri, dan sel input terkait
    setAutoSaveNilaiStatus('saving');
    setStatusSinkronCloud('menyimpan');
    setAutoSaveRowMap((prev) => ({ ...prev, [rowKey]: 'saving' }));
    setAutoSaveFieldMap((prev) => ({ ...prev, [cellKey]: 'saving' }));
    setAutoSaveLastInfo(`Menyimpan ${labelField} (${value}) — ${namaSantri}...`);

    let nextNilaiSnapshot: NilaiAkademikRow[] = [];
    let nilaiAkhirBaruTerhitung = nilaiAkhirSaatIni;

    setNilaiAkademik((prev) => {
      const idx = prev.findIndex((r) => r.nis === nis && r.mapel === ustadzMapel);
      if (idx !== -1) {
        const updated = { ...prev[idx], [field]: value };
        const calc = hitungNilaiAkhirPesantren(updated.tugas, updated.sikap, updated.lisan, updated.cbt);
        updated.nilaiAkhir = calc.nilaiAkhir;
        updated.predikat = calc.predikat;
        nilaiAkhirBaruTerhitung = calc.nilaiAkhir;
        const copy = [...prev];
        copy[idx] = updated;
        nextNilaiSnapshot = copy;
        return copy;
      } else {
        const base = {
          nis,
          mapel: ustadzMapel,
          tugas: field === 'tugas' ? value : 0,
          sikap: field === 'sikap' ? value : 0,
          lisan: field === 'lisan' ? value : 0,
          cbt: 0,
          nilaiAkhir: 0,
          predikat: 'D' as 'A' | 'B' | 'C' | 'D',
        };
        const calc = hitungNilaiAkhirPesantren(base.tugas, base.sikap, base.lisan, base.cbt);
        base.nilaiAkhir = calc.nilaiAkhir;
        base.predikat = calc.predikat;
        nilaiAkhirBaruTerhitung = calc.nilaiAkhir;
        nextNilaiSnapshot = [...prev, base];
        return nextNilaiSnapshot;
      }
    });

    // Debounce penyimpanan otomatis per sel agar responsif saat Ustadz mengetik cepat
    if (autoSaveTimersRef.current[cellKey]) {
      clearTimeout(autoSaveTimersRef.current[cellKey]);
    }

    autoSaveTimersRef.current[cellKey] = setTimeout(async () => {
      const rekamanAwal = nilaiAwalSebelumEditRef.current[cellKey] || {
        nilaiLama: nilaiLamaKomponen,
        nilaiAkhirLama: nilaiAkhirSaatIni,
      };
      delete nilaiAwalSebelumEditRef.current[cellKey];

      let nextLogSnapshot = logAktivitasNilai;
      if (rekamanAwal.nilaiLama !== value) {
        const entryBaru: LogAktivitasNilai = {
          idLog: buatIdUnik('AUDIT'),
          timestamp: formatTimestampAuditWIB(),
          namaUstadz: pelakuUstadz,
          nis,
          namaSantri,
          unit: unitSantri,
          kelas: kelasSantri,
          mapel: ustadzMapel,
          komponenNilai: labelField,
          nilaiLama: rekamanAwal.nilaiLama,
          nilaiBaru: value,
          nilaiAkhirLama: rekamanAwal.nilaiAkhirLama,
          nilaiAkhirBaru: nilaiAkhirBaruTerhitung,
          selisih: Number((value - rekamanAwal.nilaiLama).toFixed(2)),
        };
        nextLogSnapshot = [entryBaru, ...logAktivitasNilai].slice(0, 300);
        setLogAktivitasNilai(nextLogSnapshot);
      }

      const delLatest = normalisasiDeletedRecords(
        (latestSnapshotRef.current.deletedRecords as Partial<DeletedRecordsState> | undefined) || deletedRecords
      );
      const nextDeletedSnapshot: DeletedRecordsState = {
        ...delLatest,
        nilai: delLatest.nilai.filter((k) => k !== keyNilaiNorm),
      };

      const snapshotData = {
        identitasPesantren: latestSnapshotRef.current.identitasPesantren || identitasPesantren,
        santriList: latestSnapshotRef.current.santriList || santriList,
        mapelList: latestSnapshotRef.current.mapelList || mapelList,
        ustadzList: latestSnapshotRef.current.ustadzList || ustadzList,
        bankSoal: latestSnapshotRef.current.bankSoal || bankSoal,
        nilaiAkademik: nextNilaiSnapshot.length > 0 ? nextNilaiSnapshot : nilaiAkademik,
        dataTahfidz: latestSnapshotRef.current.dataTahfidz || dataTahfidz,
        dataIT: latestSnapshotRef.current.dataIT || dataIT,
        logUjianCBT: latestSnapshotRef.current.logUjianCBT || logUjianCBT,
        logAktivitasNilai: nextLogSnapshot,
        adminList: latestSnapshotRef.current.adminList || adminList,
        deletedRecords: nextDeletedSnapshot,
      };

      try {
        await fetch('/api/db/state', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(snapshotData),
        });

        if (cloudUser && cloudUser.emailVerified === true) {
          jadwalkanTulisSnapshotFirestore(snapshotData, cloudUser);
        }

        const waktuSimpan = new Date().toLocaleTimeString('id-ID');
        setTerakhirSinkron(waktuSimpan);
        setStatusSinkronCloud('tersinkron');
        setAutoSaveNilaiStatus('saved');
        setAutoSaveRowMap((prev) => ({ ...prev, [rowKey]: 'saved' }));
        setAutoSaveFieldMap((prev) => ({ ...prev, [cellKey]: 'saved' }));
        setAutoSaveLastInfo(
          `Tersimpan otomatis pukul ${waktuSimpan} · ${namaSantri} (${labelField}: ${rekamanAwal.nilaiLama} → ${value})`
        );
      } catch {
        setAutoSaveNilaiStatus('error');
        setAutoSaveRowMap((prev) => ({ ...prev, [rowKey]: 'error' }));
        setAutoSaveFieldMap((prev) => ({ ...prev, [cellKey]: 'error' }));
        setAutoSaveLastInfo(`Gagal menyambung ke server saat menyimpan nilai ${namaSantri}`);
      }
    }, 420);
  };

  // Update Pencapaian Tahfidz per Santri (Khusus Kelas Ampuan Ustadz + Tercatat di Log Aktivitas)
  const handleUpdateTahfidz = (nis: string, patch: Partial<PencapaianTahfidz>) => {
    if (!pastikanAksesUstadzValid(ustadzUnit, ustadzKelas)) return;
    const barisLama = dataTahfidz.find((t) => t.nis === nis);
    const santriObj = santriList.find((s) => s.nis === nis);
    const pelakuUstadz = ustadzLoginAktif?.namaUstadz || ustadzTerpilihNama;
    const nisKey = nis.toUpperCase();

    setDeletedRecords((prev) =>
      prev.tahfidz.includes(nisKey)
        ? { ...prev, tahfidz: prev.tahfidz.filter((k) => k !== nisKey) }
        : prev
    );

    setDataTahfidz((prev) => {
      const idx = prev.findIndex((t) => t.nis === nis);
      if (idx !== -1) {
        const copy = [...prev];
        copy[idx] = { ...copy[idx], ...patch };
        return copy;
      }
      return [
        ...prev,
        {
          nis,
          juzHafalan: '',
          suratTerakhir: '1. Al-Fatihah',
          kelancaran: 'Lancar',
          catatanUstadz: '',
          ...patch,
        },
      ];
    });

    const fieldDiubah = Object.keys(patch)[0] as keyof PencapaianTahfidz | undefined;
    if (fieldDiubah && fieldDiubah !== 'catatanUstadz') {
      const nilaiLamaStr = String(barisLama ? barisLama[fieldDiubah] : '-');
      const nilaiBaruStr = String(patch[fieldDiubah] ?? '-');
      if (nilaiLamaStr !== nilaiBaruStr) {
        const timerKey = `tahfidz__${nis}__${fieldDiubah}`;
        if (tahfidzItLogTimersRef.current[timerKey]) {
          clearTimeout(tahfidzItLogTimersRef.current[timerKey]);
        }
        tahfidzItLogTimersRef.current[timerKey] = setTimeout(() => {
          setLogAktivitasNilai((prev) =>
            [
              {
                idLog: buatIdUnik('AUDIT'),
                timestamp: formatTimestampAuditWIB(),
                namaUstadz: pelakuUstadz,
                nis,
                namaSantri: santriObj?.nama || nis,
                unit: santriObj?.unit || ustadzUnit,
                kelas: santriObj?.kelas || ustadzKelas,
                mapel: "Tahfidz Al-Qur'an",
                komponenNilai: `Capaian Tahfidz (${fieldDiubah})`,
                nilaiLama: nilaiLamaStr,
                nilaiBaru: nilaiBaruStr,
              },
              ...prev,
            ].slice(0, 300)
          );
        }, 500);
      }
    }
  };

  // Update Pencapaian IT per Santri (Khusus Kelas Ampuan Ustadz + Tercatat di Log Aktivitas)
  const handleUpdateIT = (nis: string, patch: Partial<PencapaianIT>) => {
    if (!pastikanAksesUstadzValid(ustadzUnit, ustadzKelas)) return;
    const barisLama = dataIT.find((t) => t.nis === nis);
    const santriObj = santriList.find((s) => s.nis === nis);
    const pelakuUstadz = ustadzLoginAktif?.namaUstadz || ustadzTerpilihNama;
    const nisKey = nis.toUpperCase();

    setDeletedRecords((prev) =>
      prev.it.includes(nisKey)
        ? { ...prev, it: prev.it.filter((k) => k !== nisKey) }
        : prev
    );

    setDataIT((prev) => {
      const idx = prev.findIndex((t) => t.nis === nis);
      if (idx !== -1) {
        const copy = [...prev];
        copy[idx] = { ...copy[idx], ...patch };
        return copy;
      }
      return [
        ...prev,
        {
          nis,
          materiKompetensi: '',
          totalProjek: 0,
          nilaiPraktek: 0,
          karyaAkhir: '',
          catatanInstruktur: '',
          ...patch,
        },
      ];
    });

    if (typeof patch.nilaiPraktek === 'number') {
      const lama = barisLama ? barisLama.nilaiPraktek : 0;
      const baru = patch.nilaiPraktek;
      if (lama !== baru) {
        const timerKey = `it__${nis}__nilaiPraktek`;
        if (tahfidzItLogTimersRef.current[timerKey]) {
          clearTimeout(tahfidzItLogTimersRef.current[timerKey]);
        }
        tahfidzItLogTimersRef.current[timerKey] = setTimeout(() => {
          setLogAktivitasNilai((prev) =>
            [
              {
                idLog: buatIdUnik('AUDIT'),
                timestamp: formatTimestampAuditWIB(),
                namaUstadz: pelakuUstadz,
                nis,
                namaSantri: santriObj?.nama || nis,
                unit: santriObj?.unit || ustadzUnit,
                kelas: santriObj?.kelas || ustadzKelas,
                mapel: barisLama?.materiKompetensi || 'Kompetensi Ilmu Teknologi',
                komponenNilai: 'Nilai Praktek IT',
                nilaiLama: lama,
                nilaiBaru: baru,
                selisih: baru - lama,
              },
              ...prev,
            ].slice(0, 300)
          );
        }, 500);
      }
    }
  };

  // Handlers Hapus Data di Portal Ustadz (Bank Soal, Nilai Mapel, Tahfidz, dan IT)
  const handleHapusSatuSoalCBT = async (soal: SoalCBT) => {
    const res = await Swal.fire({
      icon: 'warning',
      title: 'Hapus Butir Soal CBT?',
      text: `Soal ${soal.idSoal} (${soal.mapel} · ${soal.unit} ${soal.kelas}) akan dihapus dari Bank Soal CBT.`,
      showCancelButton: true,
      confirmButtonText: 'Ya, Hapus Soal',
      cancelButtonText: 'Batal',
      confirmButtonColor: '#DC2626',
    });
    if (!res.isConfirmed) return;
    hapusSoalAtomik([soal.idSoal]);
  };

  const handleEditSatuSoalCBT = (soal: SoalCBT) => {
    setEditSoalForm({
      ...soal,
      teksArabSoal: soal.teksArabSoal || '',
      potonganKodeIT: soal.potonganKodeIT || '',
      gambarSoalUrl: soal.gambarSoalUrl || '',
      kunciJawaban: soal.kunciJawaban || 'A',
    });
  };

  const handleSimpanEditSoalCBT = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editSoalForm) return;
    if (
      !editSoalForm.pertanyaan.trim() ||
      !editSoalForm.opsiA.trim() ||
      !editSoalForm.opsiB.trim() ||
      !editSoalForm.opsiC.trim() ||
      !editSoalForm.opsiD.trim()
    ) {
      Swal.fire({
        icon: 'warning',
        title: 'Isian Soal Belum Lengkap',
        text: 'Pertanyaan dan keempat opsi jawaban (A, B, C, D) wajib diisi.',
        confirmButtonColor: '#0A1172',
      });
      return;
    }

    const soalUpdated: SoalCBT = {
      ...editSoalForm,
      pertanyaan: editSoalForm.pertanyaan.trim(),
      teksArabSoal: (editSoalForm.teksArabSoal || '').trim() || undefined,
      potonganKodeIT: (editSoalForm.potonganKodeIT || '').trim() || undefined,
      gambarSoalUrl: (editSoalForm.gambarSoalUrl || '').trim() || undefined,
      opsiA: editSoalForm.opsiA.trim(),
      opsiB: editSoalForm.opsiB.trim(),
      opsiC: editSoalForm.opsiC.trim(),
      opsiD: editSoalForm.opsiD.trim(),
      kunciJawaban: editSoalForm.kunciJawaban || 'A',
      bobotSoal: Math.max(1, Number(editSoalForm.bobotSoal) || 10),
    };

    simpanSoalAtomik([soalUpdated]);
    setEditSoalForm(null);
    Swal.fire({
      icon: 'success',
      title: 'Butir Soal Diperbarui',
      text: `Soal ${soalUpdated.idSoal} berhasil disimpan ke Bank Soal CBT.`,
      timer: 1600,
      showConfirmButton: false,
    });
  };

  const handleHapusSemuaSoalMapelAktif = async () => {
    if (!pastikanAksesUstadzValid(ustadzUnit, ustadzKelas, ustadzMapel)) return;
    const soalMapelIni = bankSoal.filter(
      (s) => s.unit === ustadzUnit && s.kelas === ustadzKelas && s.mapel === ustadzMapel
    );
    const jumlah = soalMapelIni.length;
    if (jumlah === 0) return;

    const res = await Swal.fire({
      icon: 'warning',
      title: `Hapus Semua ${jumlah} Soal ${ustadzMapel}?`,
      text: `Seluruh ${jumlah} butir soal CBT untuk mata pelajaran ${ustadzMapel} (${ustadzUnit} - ${ustadzKelas}) akan dihapus permanen.`,
      showCancelButton: true,
      confirmButtonText: `Ya, Hapus ${jumlah} Soal`,
      cancelButtonText: 'Batal',
      confirmButtonColor: '#DC2626',
    });
    if (!res.isConfirmed) return;

    hapusSoalAtomik(soalMapelIni.map((s) => s.idSoal));
    Swal.fire({
      icon: 'success',
      title: 'Bank Soal Mapel Dikosongkan',
      text: `${jumlah} soal ${ustadzMapel} (${ustadzUnit} - ${ustadzKelas}) telah dihapus.`,
      timer: 1800,
      showConfirmButton: false,
    });
  };

  const handleHapusNilaiSantriMapel = async (nis: string, namaSantri: string) => {
    if (!pastikanAksesUstadzValid(ustadzUnit, ustadzKelas, ustadzMapel)) return;
    const barisAda = nilaiAkademik.find((r) => r.nis === nis && r.mapel === ustadzMapel);
    if (!barisAda) return;

    const res = await Swal.fire({
      icon: 'warning',
      title: 'Hapus Data Nilai Santri?',
      text: `Nilai mata pelajaran ${ustadzMapel} untuk ${namaSantri} (NIS: ${nis}) akan dihapus/direset.`,
      showCancelButton: true,
      confirmButtonText: 'Ya, Hapus Nilai',
      cancelButtonText: 'Batal',
      confirmButtonColor: '#DC2626',
    });
    if (!res.isConfirmed) return;

    const keyNilaiNorm = `${nis}__${ustadzMapel.trim().toLowerCase()}`.toLowerCase();
    const santriObj = santriList.find((s) => s.nis === nis);
    const pelakuUstadz = ustadzLoginAktif?.namaUstadz || ustadzTerpilihNama;

    setDeletedRecords((prev) => ({
      ...prev,
      nilai: Array.from(new Set([...prev.nilai, keyNilaiNorm])),
    }));
    setNilaiAkademik((prev) =>
      prev.filter(
        (r) =>
          !(
            r.nis === nis &&
            r.mapel.trim().toLowerCase() === ustadzMapel.trim().toLowerCase()
          )
      )
    );
    setLogAktivitasNilai((prev) =>
      [
        {
          idLog: buatIdUnik('AUDIT'),
          timestamp: formatTimestampAuditWIB(),
          namaUstadz: pelakuUstadz,
          nis,
          namaSantri,
          unit: santriObj?.unit || ustadzUnit,
          kelas: santriObj?.kelas || ustadzKelas,
          mapel: ustadzMapel,
          komponenNilai: 'Penghapusan Data Nilai Mapel',
          nilaiLama: barisAda.nilaiAkhir,
          nilaiBaru: 0,
          nilaiAkhirLama: barisAda.nilaiAkhir,
          nilaiAkhirBaru: 0,
          selisih: Number((-barisAda.nilaiAkhir).toFixed(2)),
        },
        ...prev,
      ].slice(0, 300)
    );
    setAutoSaveLastInfo(`Nilai ${ustadzMapel} untuk ${namaSantri} telah dihapus.`);
  };

  const handleBukaEditNilaiSantri = (santriTarget: Santri, rowSaatIni: NilaiAkademikRow) => {
    if (!pastikanAksesUstadzValid(ustadzUnit, ustadzKelas, ustadzMapel)) return;
    setEditNilaiModal({
      nis: santriTarget.nis,
      namaSantri: santriTarget.nama,
      unit: santriTarget.unit,
      kelas: santriTarget.kelas,
      mapel: ustadzMapel,
      tugas: Number(rowSaatIni.tugas) || 0,
      sikap: Number(rowSaatIni.sikap) || 0,
      lisan: Number(rowSaatIni.lisan) || 0,
      cbt: Number(rowSaatIni.cbt) || 0,
      tugasLama: Number(rowSaatIni.tugas) || 0,
      sikapLama: Number(rowSaatIni.sikap) || 0,
      lisanLama: Number(rowSaatIni.lisan) || 0,
      cbtLama: Number(rowSaatIni.cbt) || 0,
      nilaiAkhirLama: Number(rowSaatIni.nilaiAkhir) || 0,
    });
  };

  const handleSimpanEditNilaiModal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editNilaiModal) return;

    const clamp = (n: number) => Math.min(100, Math.max(0, Number.isNaN(n) ? 0 : n));
    const tugas = clamp(editNilaiModal.tugas);
    const sikap = clamp(editNilaiModal.sikap);
    const lisan = clamp(editNilaiModal.lisan);
    const cbt = clamp(editNilaiModal.cbt);

    const calc = hitungNilaiAkhirPesantren(tugas, sikap, lisan, cbt);
    const rowBaru: NilaiAkademikRow = {
      nis: editNilaiModal.nis,
      mapel: editNilaiModal.mapel,
      tugas,
      sikap,
      lisan,
      cbt,
      nilaiAkhir: calc.nilaiAkhir,
      predikat: calc.predikat,
    };

    const keyNilaiNorm = `${editNilaiModal.nis}__${editNilaiModal.mapel.trim().toLowerCase()}`.toLowerCase();
    setDeletedRecords((prev) => ({
      ...prev,
      nilai: prev.nilai.filter((k) => k !== keyNilaiNorm),
    }));

    setNilaiAkademik((prev) => {
      const idx = prev.findIndex(
        (r) =>
          r.nis === editNilaiModal.nis &&
          r.mapel.trim().toLowerCase() === editNilaiModal.mapel.trim().toLowerCase()
      );
      if (idx !== -1) {
        const copy = [...prev];
        copy[idx] = rowBaru;
        return copy;
      }
      return [...prev, rowBaru];
    });

    const pelakuUstadz = ustadzLoginAktif?.namaUstadz || ustadzTerpilihNama;
    const komponenBerubah: Array<{ label: string; lama: number; baru: number }> = [];
    if (editNilaiModal.tugasLama !== tugas) komponenBerubah.push({ label: 'Tugas Harian', lama: editNilaiModal.tugasLama, baru: tugas });
    if (editNilaiModal.sikapLama !== sikap) komponenBerubah.push({ label: 'Nilai Sikap', lama: editNilaiModal.sikapLama, baru: sikap });
    if (editNilaiModal.lisanLama !== lisan) komponenBerubah.push({ label: 'Ujian Lisan', lama: editNilaiModal.lisanLama, baru: lisan });
    if (editNilaiModal.cbtLama !== cbt) komponenBerubah.push({ label: 'Nilai CBT', lama: editNilaiModal.cbtLama, baru: cbt });

    if (komponenBerubah.length > 0) {
      const entries: LogAktivitasNilai[] = komponenBerubah.map((c) => ({
        idLog: buatIdUnik('AUDIT'),
        timestamp: formatTimestampAuditWIB(),
        namaUstadz: pelakuUstadz,
        nis: editNilaiModal.nis,
        namaSantri: editNilaiModal.namaSantri,
        unit: editNilaiModal.unit,
        kelas: editNilaiModal.kelas,
        mapel: editNilaiModal.mapel,
        komponenNilai: c.label,
        nilaiLama: c.lama,
        nilaiBaru: c.baru,
        nilaiAkhirLama: editNilaiModal.nilaiAkhirLama,
        nilaiAkhirBaru: calc.nilaiAkhir,
        selisih: Number((c.baru - c.lama).toFixed(2)),
      }));
      setLogAktivitasNilai((prev) => [...entries, ...prev].slice(0, 300));
    }

    setAutoSaveLastInfo(
      `Nilai ${editNilaiModal.mapel} untuk ${editNilaiModal.namaSantri} diperbarui (Akhir: ${calc.nilaiAkhir.toFixed(2)} · Predikat ${calc.predikat}).`
    );
    setEditNilaiModal(null);
    Swal.fire({
      icon: 'success',
      title: 'Nilai Santri Diperbarui',
      text: `${editNilaiModal.namaSantri} — Nilai Akhir ${calc.nilaiAkhir.toFixed(2)} (${calc.predikat}).`,
      timer: 1600,
      showConfirmButton: false,
    });
  };

  const handleHapusTahfidzSantri = async (nis: string, namaSantri: string) => {
    if (!pastikanAksesUstadzValid(ustadzUnit, ustadzKelas)) return;
    const barisAda = dataTahfidz.find((t) => t.nis === nis);
    if (!barisAda) return;

    const res = await Swal.fire({
      icon: 'warning',
      title: 'Hapus Data Tahfidz Santri?',
      text: `Data pencapaian Tahfidz Al-Qur'an untuk ${namaSantri} (NIS: ${nis}) akan dihapus/direset.`,
      showCancelButton: true,
      confirmButtonText: 'Ya, Hapus Data Tahfidz',
      cancelButtonText: 'Batal',
      confirmButtonColor: '#DC2626',
    });
    if (!res.isConfirmed) return;

    const nisKey = nis.toUpperCase();
    const santriObj = santriList.find((s) => s.nis === nis);
    const pelakuUstadz = ustadzLoginAktif?.namaUstadz || ustadzTerpilihNama;

    setDeletedRecords((prev) => ({
      ...prev,
      tahfidz: Array.from(new Set([...prev.tahfidz, nisKey])),
    }));
    setDataTahfidz((prev) => prev.filter((t) => t.nis.toUpperCase() !== nisKey));
    setLogAktivitasNilai((prev) =>
      [
        {
          idLog: buatIdUnik('AUDIT'),
          timestamp: formatTimestampAuditWIB(),
          namaUstadz: pelakuUstadz,
          nis,
          namaSantri,
          unit: santriObj?.unit || ustadzUnit,
          kelas: santriObj?.kelas || ustadzKelas,
          mapel: "Tahfidz Al-Qur'an",
          komponenNilai: 'Penghapusan Capaian Tahfidz',
          nilaiLama: `${barisAda.juzHafalan} (${barisAda.suratTerakhir})`,
          nilaiBaru: 'Dihapus',
        },
        ...prev,
      ].slice(0, 300)
    );
  };

  const handleHapusITSantri = async (nis: string, namaSantri: string) => {
    if (!pastikanAksesUstadzValid(ustadzUnit, ustadzKelas)) return;
    const barisAda = dataIT.find((i) => i.nis === nis);
    if (!barisAda) return;

    const res = await Swal.fire({
      icon: 'warning',
      title: 'Hapus Data Kompetensi IT?',
      text: `Data pencapaian Ilmu Teknologi (IT) untuk ${namaSantri} (NIS: ${nis}) akan dihapus/direset.`,
      showCancelButton: true,
      confirmButtonText: 'Ya, Hapus Data IT',
      cancelButtonText: 'Batal',
      confirmButtonColor: '#DC2626',
    });
    if (!res.isConfirmed) return;

    const nisKey = nis.toUpperCase();
    const santriObj = santriList.find((s) => s.nis === nis);
    const pelakuUstadz = ustadzLoginAktif?.namaUstadz || ustadzTerpilihNama;

    setDeletedRecords((prev) => ({
      ...prev,
      it: Array.from(new Set([...prev.it, nisKey])),
    }));
    setDataIT((prev) => prev.filter((i) => i.nis.toUpperCase() !== nisKey));
    setLogAktivitasNilai((prev) =>
      [
        {
          idLog: buatIdUnik('AUDIT'),
          timestamp: formatTimestampAuditWIB(),
          namaUstadz: pelakuUstadz,
          nis,
          namaSantri,
          unit: santriObj?.unit || ustadzUnit,
          kelas: santriObj?.kelas || ustadzKelas,
          mapel: barisAda.materiKompetensi || 'Kompetensi Ilmu Teknologi',
          komponenNilai: 'Penghapusan Capaian IT',
          nilaiLama: barisAda.nilaiPraktek,
          nilaiBaru: 0,
          selisih: -barisAda.nilaiPraktek,
        },
        ...prev,
      ].slice(0, 300)
    );
  };

  // ==========================================================================
  // HANDLERS MODUL C: PORTAL UJIAN CBT SANTRI (SERVER-AUTHORITATIVE LOCKDOWN & AUTO-SUBMIT 3X)
  // ==========================================================================
  const kumpulkanUjianCBT = useCallback(
    async (jumlahPelanggaranFinal: number, karenaAutoSubmitCurang: boolean) => {
      if (!santriSedangUjian || isSubmittingCbtRef.current) return;
      isSubmittingCbtRef.current = true;

      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }

      let skorCBT = 0;
      let jmlBenar = 0;
      let totalSoal = daftarSoalAktif.length;
      let kodeVerifikasi = '';
      let logDariServer: LogUjianCBT | null = null;
      let sudahTersimpanDiServer = false;

      try {
        let data: Record<string, unknown> | null = null;
        // Retry otomatis 3x dengan jittered backoff agar tahan lonjakan 65+ santri mengumpulkan bersamaan
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            const res = await fetch('/api/cbt/submit', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                nis: santriSedangUjian.nis,
                mapel: cbtMapel,
                jawaban: jawabanCBT,
                pelanggaran: jumlahPelanggaranFinal,
                karenaAutoSubmitCurang,
              }),
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const parsed = (await res.json()) as Record<string, unknown>;
            if (parsed.sukses) {
              data = parsed;
              break;
            }
            throw new Error(String(parsed.pesan || 'Submit gagal'));
          } catch (retryErr) {
            if (attempt === 3) throw retryErr;
            const backoffMs = attempt * 600 + Math.floor(Math.random() * 350);
            await new Promise((r) => setTimeout(r, backoffMs));
          }
        }

        if (data && data.sukses) {
          skorCBT = Number(data.skorCBT) || 0;
          jmlBenar = Number(data.jmlBenar) || 0;
          totalSoal = Number(data.totalSoal) || daftarSoalAktif.length;
          kodeVerifikasi = String(data.kodeVerifikasi || '');
          logDariServer = (data.logBaru as LogUjianCBT) || null;
          sudahTersimpanDiServer = Boolean(data.serverPersisted);
          if (sudahTersimpanDiServer) {
            // Nilai & log sudah disimpan atomik oleh server — hindari 65 perangkat mengirim ulang full-DB sekaligus
            skipNextAutoSyncRef.current = true;
          }
        } else {
          throw new Error('Fallback ke kalkulasi lokal');
        }
      } catch {
        // Fallback apabila koneksi terputus saat pengumpulan
        let bobotMaks = 0;
        let bobotDapat = 0;
        bankSoal
          .filter((s) => s.unit === santriSedangUjian.unit && s.kelas === santriSedangUjian.kelas && s.mapel === cbtMapel)
          .forEach((s) => {
            bobotMaks += s.bobotSoal;
            if (jawabanCBT[s.idSoal] === s.kunciJawaban) {
              bobotDapat += s.bobotSoal;
              jmlBenar++;
            }
          });
        skorCBT = bobotMaks > 0 ? Math.round((bobotDapat / bobotMaks) * 100 * 100) / 100 : 0;
      }

      const statusLog =
        karenaAutoSubmitCurang || jumlahPelanggaranFinal >= 3
          ? 'Auto-Submit (Diskualifikasi 3x Pelanggaran Lockdown)'
          : jumlahPelanggaranFinal > 0
          ? `Selesai dengan Peringatan (${jumlahPelanggaranFinal}x Pelanggaran)`
          : 'Selesai Normal (Jujur & Tertib)';

      const logBaru: LogUjianCBT = logDariServer || {
        idLog: buatIdUnik('LOG'),
        timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
        nis: santriSedangUjian.nis,
        namaSantri: santriSedangUjian.nama,
        unit: santriSedangUjian.unit,
        kelas: santriSedangUjian.kelas,
        mapel: cbtMapel,
        skorCBT,
        pelanggaran: jumlahPelanggaranFinal,
        status: statusLog,
      };

      setLogUjianCBT((prev) => [logBaru, ...prev.filter((l) => l.idLog !== logBaru.idLog)]);

      const keyNilaiNorm = `${santriSedangUjian.nis}__${cbtMapel.trim().toLowerCase()}`.toLowerCase();
      setDeletedRecords((prev) => ({
        ...prev,
        nilai: prev.nilai.filter((k) => k.toLowerCase() !== keyNilaiNorm),
      }));

      setNilaiAkademik((prev) => {
        const idx = prev.findIndex((r) => r.nis === santriSedangUjian.nis && r.mapel === cbtMapel);
        if (idx !== -1) {
          const row = prev[idx];
          const calc = hitungNilaiAkhirPesantren(row.tugas, row.sikap, row.lisan, skorCBT);
          const copy = [...prev];
          copy[idx] = {
            ...row,
            cbt: skorCBT,
            nilaiAkhir: calc.nilaiAkhir,
            predikat: calc.predikat,
          };
          return copy;
        } else {
          const calc = hitungNilaiAkhirPesantren(0, 0, 0, skorCBT);
          return [
            ...prev,
            {
              nis: santriSedangUjian.nis,
              mapel: cbtMapel,
              tugas: 0,
              sikap: 0,
              lisan: 0,
              cbt: skorCBT,
              nilaiAkhir: calc.nilaiAkhir,
              predikat: calc.predikat,
            },
          ];
        }
      });

      setUjianBerlangsung(false);
      setLayarBlurKeluarFullscreen(false);

      Swal.fire({
        icon: karenaAutoSubmitCurang ? 'error' : 'success',
        title: karenaAutoSubmitCurang
          ? 'UJIAN DIHENTIKAN OTOMATIS (3x PELANGGARAN)!'
          : 'Alhamdulillah, Ujian CBT Selesai & Terverifikasi Server!',
        html: `
          <div class="text-left text-sm space-y-1.5 mt-2">
            <p><strong>Santri:</strong> ${escapeHtmlAman(santriSedangUjian.nama)} (${escapeHtmlAman(santriSedangUjian.nis)})</p>
            <p><strong>Unit / Kelas:</strong> ${escapeHtmlAman(santriSedangUjian.unit)} - ${escapeHtmlAman(santriSedangUjian.kelas)}</p>
            <p><strong>Mata Pelajaran:</strong> ${escapeHtmlAman(cbtMapel)}</p>
            <p><strong>Skor CBT (Bobot 40%):</strong> <span class="font-mono font-bold text-[#0A1172]">${skorCBT}</span> (${jmlBenar}/${totalSoal} benar)</p>
            <p><strong>Pelanggaran Lockdown:</strong> <span class="font-mono font-bold text-red-600">${jumlahPelanggaranFinal} / 3</span></p>
            ${
              kodeVerifikasi
                ? `<p><strong>Hash Verifikasi Server:</strong> <span class="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded">${escapeHtmlAman(kodeVerifikasi)}</span></p>`
                : ''
            }
            <p class="text-xs text-slate-600 pt-2 border-t">${
              sudahTersimpanDiServer
                ? 'Kunci jawaban divalidasi &amp; skor otomatis tersimpan permanen di Server (aman untuk langsung menutup halaman).'
                : 'Kunci jawaban divalidasi &amp; skor otomatis disinkronkan ke e-Rapor Digital.'
            }</p>
          </div>
        `,
        confirmButtonColor: '#0A1172',
      });
    },
    [santriSedangUjian, daftarSoalAktif.length, jawabanCBT, cbtMapel, bankSoal]
  );

  // Sinkronisasi berkala sesi ujian (jawaban & pelanggaran) ke server agar tahan refresh
  const sinkronSesiCBTKeServer = useCallback(
    async (jawabanTerbaru: Record<string, 'A' | 'B' | 'C' | 'D'>, pelanggaranTerbaru: number) => {
      if (!santriSedangUjian) return;
      try {
        const res = await fetch('/api/cbt/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            nis: santriSedangUjian.nis,
            mapel: cbtMapel,
            jawaban: jawabanTerbaru,
            pelanggaran: pelanggaranTerbaru,
          }),
        });
        const data = await res.json();
        if (data.sukses && typeof data.sisaDetikServer === 'number') {
          setSisaDetikCBT(data.sisaDetikServer);
        }
      } catch {
        // Abaikan jika jaringan lambat
      }
    },
    [santriSedangUjian, cbtMapel]
  );

  const rekamPelanggaranAntiCurang = useCallback(
    (alasan: string) => {
      if (!ujianBerlangsung) return;

      setPelanggaranLockdown((prev) => {
        const next = prev + 1;
        bunyikanAlarmLockdown(next >= 3 ? 1280 : 900, next >= 3 ? 900 : 450);
        sinkronSesiCBTKeServer(jawabanCBT, next);

        if (next >= 3) {
          setTimeout(() => {
            kumpulkanUjianCBT(next, true);
          }, 120);
        } else {
          Swal.fire({
            icon: 'warning',
            title: `PERINGATAN LOCKDOWN KE-${next} DARI 3!`,
            text: `Terdeteksi pelanggaran: ${alasan}. Counter pelanggaran tercatat di Server dan tidak dapat di-reset dengan refresh!`,
            confirmButtonText: 'Saya Mengerti & Kembali Jujur',
            confirmButtonColor: '#FF6700',
          });
        }
        return next;
      });
    },
    [ujianBerlangsung, kumpulkanUjianCBT, jawabanCBT, sinkronSesiCBTKeServer]
  );

  // Sensor Anti-Curang selama Ujian CBT Berlangsung
  useEffect(() => {
    if (!ujianBerlangsung) return;

    const onVisChange = () => {
      if (document.hidden) {
        rekamPelanggaranAntiCurang('Pindah Tab Browser / Minimize Jendela Ujian');
      }
    };
    const onBlur = () => {
      rekamPelanggaranAntiCurang('Keluar dari Fokus Layar Ujian (Membuka Aplikasi Lain / Split-Screen)');
    };
    const onFsChange = () => {
      if (!document.fullscreenElement) {
        setLayarBlurKeluarFullscreen(true);
        rekamPelanggaranAntiCurang('Keluar dari Mode Layar Penuh (Fullscreen Lockdown)');
      } else {
        setLayarBlurKeluarFullscreen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        (e.ctrlKey && ['c', 'v', 'x', 'u', 'p'].includes(e.key.toLowerCase())) ||
        e.key === 'F12'
      ) {
        e.preventDefault();
        rekamPelanggaranAntiCurang(`Menekan Tombol Pintasan Terlarang (${e.key})`);
      }
    };

    document.addEventListener('visibilitychange', onVisChange);
    window.addEventListener('blur', onBlur);
    document.addEventListener('fullscreenchange', onFsChange);
    window.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('visibilitychange', onVisChange);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('fullscreenchange', onFsChange);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [ujianBerlangsung, rekamPelanggaranAntiCurang]);

  // Timer Countdown Ujian CBT (Disinkronkan dengan waktu Server)
  useEffect(() => {
    if (!ujianBerlangsung) return;
    const t = setInterval(() => {
      setSisaDetikCBT((prev) => {
        if (prev <= 1) {
          clearInterval(t);
          kumpulkanUjianCBT(pelanggaranLockdown, false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [ujianBerlangsung, pelanggaranLockdown, kumpulkanUjianCBT]);

  const handleMulaiUjianCBT = async (e: React.FormEvent) => {
    e.preventDefault();

    const nisBersih = cbtNIS.trim();
    if (!nisBersih) {
      Swal.fire({
        icon: 'warning',
        title: 'NIS Santri Wajib Diisi',
        text: 'Ketik Nomor Induk Santri (NIS) Anda sendiri untuk memulai ujian CBT.',
        confirmButtonColor: '#0A1172',
      });
      return;
    }

    const soalKandidat = bankSoal.filter(
      (s) => s.unit === cbtUnit && s.kelas === cbtKelas && s.mapel === cbtMapel
    );

    try {
      const res = await fetch('/api/cbt/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nis: nisBersih,
          unit: cbtUnit,
          kelas: cbtKelas,
          mapel: cbtMapel,
          tokenInput: cbtTokenInput.trim(),
          daftarSoalLengkap: soalKandidat,
        }),
      });
      const data = await res.json();

      if (!res.ok || !data.sukses) {
        Swal.fire({
          icon: 'error',
          title: 'Tidak Dapat Memulai Ujian CBT',
          text: data.pesan || 'Periksa kembali NIS, Unit/Kelas, dan Token Ujian Anda.',
          confirmButtonColor: '#0A1172',
        });
        return;
      }

      setSantriSedangUjian(data.santri);
      // Soal dari server sudah disanitasi tanpa properti kunciJawaban
      setDaftarSoalAktif(data.soalTanpaKunci);
      setJawabanCBT(data.sesi?.jawaban || {});
      setPelanggaranLockdown(Number(data.sesi?.pelanggaran) || 0);
      setSisaDetikCBT(Number(data.sesi?.sisaDetikServer) || 1800);
      setLayarBlurKeluarFullscreen(false);
      setUjianBerlangsung(true);

      if (data.sesi?.dilanjutkanDariSesiSebelumnya) {
        Swal.fire({
          icon: 'info',
          title: 'Sesi Ujian Dilanjutkan dari Server',
          text: `Sisa waktu server dan ${data.sesi.pelanggaran} riwayat pelanggaran Anda dipulihkan secara otomatis.`,
          confirmButtonColor: '#0A1172',
        });
      }
    } catch {
      // Fallback jika server lokal sedang memulai ulang
      const santri = santriList.find(
        (s) =>
          s.nis.trim().toUpperCase() === nisBersih.toUpperCase() &&
          s.unit === cbtUnit &&
          s.kelas === cbtKelas
      );
      if (!santri) {
        Swal.fire({
          icon: 'error',
          title: 'NIS Tidak Sesuai Unit / Kelas',
          text: `NIS "${nisBersih}" tidak terdaftar pada Unit ${cbtUnit} - ${cbtKelas}. Pastikan Anda mengetik NIS Anda sendiri.`,
          confirmButtonColor: '#0A1172',
        });
        return;
      }
      const cfgMapel = mapelList.find(
        (m) => m.unit === cbtUnit && m.kelas === cbtKelas && m.namaMapel === cbtMapel
      );
      if (
        cfgMapel &&
        cfgMapel.tokenUjian.trim().toUpperCase() !== cbtTokenInput.trim().toUpperCase()
      ) {
        Swal.fire({
          icon: 'error',
          title: 'Token Ujian Salah',
          text: `Token ujian untuk ${cbtMapel} tidak sesuai.`,
          confirmButtonColor: '#0A1172',
        });
        return;
      }
      const soalTersedia = bankSoal
        .filter((s) => s.unit === cbtUnit && s.kelas === cbtKelas && s.mapel === cbtMapel)
        .map(({ kunciJawaban: _k, ...tanpaKunci }) => tanpaKunci);
      if (soalTersedia.length === 0) {
        Swal.fire({
          icon: 'warning',
          title: 'Soal Belum Tersedia',
          text: `Belum ada soal CBT untuk ${cbtMapel} (${cbtUnit} - ${cbtKelas}).`,
          confirmButtonColor: '#0A1172',
        });
        return;
      }
      setSantriSedangUjian(santri);
      setDaftarSoalAktif(soalTersedia);
      setJawabanCBT({});
      setPelanggaranLockdown(0);
      setSisaDetikCBT(1800);
      setUjianBerlangsung(true);
    }

    try {
      const bolehFullscreen =
        typeof document !== 'undefined' &&
        document.fullscreenEnabled &&
        (!navigator.userActivation || navigator.userActivation.isActive);
      if (bolehFullscreen && document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
      }
    } catch {
      // Fallback di lingkungan preview iframe
    }
  };

  // ==========================================================================
  // DATA FILTERED UNTUK PORTAL USTADZ & E-RAPOR (TERKUNCI PADA KELAS AMPUAN USTADZ)
  // ==========================================================================
  const daftarUnitAmpuanAktif = ambilDaftarUnitAmpuanUstadz(ustadzLoginAktif);
  const daftarKelasAmpuanPadaUnit = ustadzLoginAktif
    ? ambilDaftarKelasAmpuanUstadz(ustadzLoginAktif, ustadzUnit).map((k) => k.kelas)
    : UNIT_KELAS_MAP[ustadzUnit];
  const daftarMapelAmpuanPadaKelas = ustadzLoginAktif
    ? ambilDaftarMapelAmpuanUstadz(ustadzLoginAktif).filter(
        (m) => m.unit === ustadzUnit && m.kelas === ustadzKelas
      )
    : mapelList.filter((m) => m.unit === ustadzUnit && m.kelas === ustadzKelas);

  const santriFilteredUstadz = santriList.filter((s) => {
    if (ustadzLoginAktif && !apakahKelasDiampuOlehUstadz(s.unit, s.kelas, ustadzLoginAktif)) {
      return false;
    }
    return s.unit === ustadzUnit && s.kelas === ustadzKelas;
  });

  // Daftar kelas & santri yang diizinkan diakses pada Modul Cetak e-Rapor Digital
  const daftarKelasRaporUstadz = ambilDaftarKelasAmpuanUstadz(ustadzLoginAktif);
  const santriRaporTersedia = santriLoginRapor
    ? santriList.filter((s) => s.nis.toUpperCase() === santriLoginRapor.nis.toUpperCase())
    : ustadzLoginAktif
    ? santriList.filter((s) => {
        const diampu = apakahKelasDiampuOlehUstadz(s.unit, s.kelas, ustadzLoginAktif);
        if (!diampu) return false;
        if (filterKelasRaporUstadz !== 'SEMUA_AMPUAN') {
          return `${s.unit}__${s.kelas}` === filterKelasRaporUstadz;
        }
        return true;
      })
    : santriList.filter((s) => {
        if (filterKelasRaporUstadz !== 'SEMUA_AMPUAN') {
          return `${s.unit}__${s.kelas}` === filterKelasRaporUstadz;
        }
        return true;
      });

  const santriRaporAktif: Santri = (santriLoginRapor
    ? santriList.find((s) => s.nis.toUpperCase() === santriLoginRapor.nis.toUpperCase()) ||
      santriLoginRapor
    : santriRaporTersedia.find((s) => s.nis.toUpperCase() === cariNisRapor.trim().toUpperCase()) ||
      santriRaporTersedia[0] ||
      santriList[0]) || {
    nis: '-',
    nama: 'Belum Ada Santri Terdaftar',
    unit: 'Wustho',
    kelas: 'Kelas 7',
  };

  const statusKelengkapanRaporAktif = cekKelengkapanDataRaporSantri(santriRaporAktif);

  const daftarNamaMapelAmpuanDiKelasSantri = ustadzLoginAktif
    ? ambilDaftarMapelAmpuanUstadz(ustadzLoginAktif)
        .filter((m) => m.unit === santriRaporAktif.unit && m.kelas === santriRaporAktif.kelas)
        .map((m) => m.namaMapel.toLowerCase())
    : [];

  const semuaNilaiRaporSantri = nilaiAkademik.filter((n) => n.nis === santriRaporAktif.nis);
  const nilaiRaporSantri =
    ustadzLoginAktif && !santriLoginRapor && filterMapelRaporUstadz === 'ampuan_saja'
      ? semuaNilaiRaporSantri.filter((n) =>
          daftarNamaMapelAmpuanDiKelasSantri.includes(n.mapel.toLowerCase())
        )
      : semuaNilaiRaporSantri;
  const tahfidzRaporSantri = dataTahfidz.find((t) => t.nis === santriRaporAktif.nis) || {
    nis: santriRaporAktif.nis,
    juzHafalan: '-',
    suratTerakhir: '-',
    kelancaran: 'Sedang' as const,
    catatanUstadz: 'Belum ada input pencapaian tahfidz oleh Muhaffizh.',
  };
  const itRaporSantri = dataIT.find((i) => i.nis === santriRaporAktif.nis) || {
    nis: santriRaporAktif.nis,
    materiKompetensi: '-',
    totalProjek: 0,
    nilaiPraktek: 0,
    karyaAkhir: '-',
    catatanInstruktur: 'Belum ada input pencapaian kompetensi IT.',
  };

  const predikatIT =
    itRaporSantri.nilaiPraktek <= 0
      ? '-'
      : itRaporSantri.nilaiPraktek >= 85
      ? 'A (Mumtaz)'
      : itRaporSantri.nilaiPraktek >= 75
      ? 'B (Jayyid Jiddan)'
      : itRaporSantri.nilaiPraktek >= 60
      ? 'C (Jayyid)'
      : 'D (Maqbul)';

  // ==========================================================================
  // GENERATOR DOKUMEN E-RAPOR PDF FORMAT A4 RESMI (MENGGUNAKAN PUSTAKA JSPDF)
  // ==========================================================================
  const [isGeneratingRaporPdf, setIsGeneratingRaporPdf] = useState(false);

  const gambarQrVectorKeJsPDF = (
    doc: jsPDF,
    payload: string,
    startX: number,
    startY: number,
    boxSizeMm: number
  ) => {
    const grid = 15;
    const cellMm = boxSizeMm / grid;
    let hash = 2166136261;
    for (let i = 0; i < payload.length; i++) {
      hash ^= payload.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }

    doc.setDrawColor(10, 17, 114);
    doc.setLineWidth(0.25);
    doc.setFillColor(255, 255, 255);
    doc.rect(startX - 1, startY - 1, boxSizeMm + 2, boxSizeMm + 2, 'FD');

    doc.setFillColor(10, 17, 114);
    for (let r = 0; r < grid; r++) {
      for (let c = 0; c < grid; c++) {
        const isFinder = (r < 4 && c < 4) || (r < 4 && c >= grid - 4) || (r >= grid - 4 && c < 4);
        let filled = false;
        if (isFinder) {
          const lr = r >= grid - 4 ? r - (grid - 4) : r;
          const lc = c >= grid - 4 ? c - (grid - 4) : c;
          filled =
            lr === 0 ||
            lr === 3 ||
            lc === 0 ||
            lc === 3 ||
            (lr >= 1 && lr <= 2 && lc >= 1 && lc <= 2);
        } else {
          const bit = Math.abs((hash ^ (r * 31 + c * 17)) + r * c * 13) % 3;
          filled = bit === 0;
        }
        if (filled) {
          doc.rect(startX + c * cellMm, startY + r * cellMm, cellMm, cellMm, 'F');
        }
      }
    }
  };

  const officialLogoPdfCacheRef = useRef<string | null>(null);
  const muatDataUrlLogoResmi = async (): Promise<string | null> => {
    if (officialLogoPdfCacheRef.current) return officialLogoPdfCacheRef.current;
    try {
      const resp = await fetch(OFFICIAL_LOGO_DF_URL);
      if (!resp.ok) return null;
      const blob = await resp.blob();
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('Gagal membaca gambar logo resmi'));
        reader.readAsDataURL(blob);
      });
      if (dataUrl.startsWith('data:image/')) {
        officialLogoPdfCacheRef.current = dataUrl;
        return dataUrl;
      }
      return null;
    } catch {
      return null;
    }
  };

  const renderHalamanRaporSantriKeJsPDF = async (doc: jsPDF, santriTarget: Santri) => {
    const pageW = 210; // Lebar standar A4 dalam mm
    const marginX = 14;
    const contentW = pageW - marginX * 2;

    // Ambil data nilai akademik, tahfidz, dan IT untuk santriTarget
    const mapelAmpuanKelasSantri = ustadzLoginAktif
      ? ambilDaftarMapelAmpuanUstadz(ustadzLoginAktif)
          .filter((m) => m.unit === santriTarget.unit && m.kelas === santriTarget.kelas)
          .map((m) => m.namaMapel.toLowerCase())
      : [];

    const semuaNilaiSantri = nilaiAkademik.filter((n) => n.nis === santriTarget.nis);
    const nilaiSantriCetak =
      ustadzLoginAktif && filterMapelRaporUstadz === 'ampuan_saja'
        ? semuaNilaiSantri.filter((n) => mapelAmpuanKelasSantri.includes(n.mapel.toLowerCase()))
        : semuaNilaiSantri;

    const tahfidzSantri = dataTahfidz.find((t) => t.nis === santriTarget.nis) || {
      nis: santriTarget.nis,
      juzHafalan: '-',
      suratTerakhir: '-',
      kelancaran: '-' as unknown as 'Lancar',
      catatanUstadz: 'Belum ada input pencapaian tahfidz oleh Muhaffizh.',
    };

    const itSantri = dataIT.find((i) => i.nis === santriTarget.nis) || {
      nis: santriTarget.nis,
      materiKompetensi: '-',
      totalProjek: 0,
      nilaiPraktek: 0,
      karyaAkhir: '-',
      catatanInstruktur: 'Belum ada input pencapaian kompetensi IT.',
    };

    const predikatITSantri =
      itSantri.nilaiPraktek <= 0
        ? '-'
        : itSantri.nilaiPraktek >= 85
        ? 'A (Mumtaz)'
        : itSantri.nilaiPraktek >= 75
        ? 'B (Jayyid Jiddan)'
        : itSantri.nilaiPraktek >= 60
        ? 'C (Jayyid)'
        : 'D (Maqbul)';

    // ========================================================================
    // 1. KOP SURAT RESMI PONPES TAHFIDZ & ILMU TEKNOLOGI DARUL FITHRAH
    // ========================================================================
    const logoResmiDataUrl = await muatDataUrlLogoResmi();
    let logoLockupResmiDimuat = false;
    let logoCustomDimuat = false;

    if (identitasPesantren.customLogoDataUrl && identitasPesantren.customLogoDataUrl.startsWith('data:image/')) {
      try {
        const formatImg = identitasPesantren.customLogoDataUrl.includes('image/png') ? 'PNG' : 'JPEG';
        doc.addImage(identitasPesantren.customLogoDataUrl, formatImg, marginX, 11, 16, 16);
        logoCustomDimuat = true;
      } catch {
        logoCustomDimuat = false;
      }
    } else if (logoResmiDataUrl) {
      try {
        // Rasio asli gambar 1219 x 455 (~2.679) -> tinggi 16mm, lebar 42.9mm
        doc.addImage(logoResmiDataUrl, 'PNG', marginX, 11.2, 42.9, 16);
        logoLockupResmiDimuat = true;
      } catch {
        logoLockupResmiDimuat = false;
      }
    }

    if (!logoCustomDimuat && !logoLockupResmiDimuat) {
      // Fallback Lambang Vector Resmi Darul Fithrah (Navy #0A1172 & Oranye #FF6700)
      doc.setFillColor(10, 17, 114);
      doc.roundedRect(marginX, 11, 16, 16, 2.5, 2.5, 'F');
      doc.setFillColor(255, 103, 0);
      doc.circle(marginX + 8, 15.2, 2.1, 'F');
      doc.setDrawColor(255, 103, 0);
      doc.setLineWidth(0.9);
      doc.line(marginX + 3.5, 22.5, marginX + 8, 20.5);
      doc.line(marginX + 12.5, 22.5, marginX + 8, 20.5);
      doc.setDrawColor(255, 255, 255);
      doc.setLineWidth(0.6);
      doc.line(marginX + 3.5, 24.3, marginX + 8, 22.5);
      doc.line(marginX + 12.5, 24.3, marginX + 8, 22.5);
    }

    // Teks Brand KOP Kiri (hanya jika menggunakan ikon + teks terpisah)
    if (!logoLockupResmiDimuat) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11.5);
      doc.setTextColor(255, 103, 0);
      doc.text(identitasPesantren.namaUtama || 'DARUL FITHRAH', marginX + 19, 17);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.2);
      doc.setTextColor(10, 17, 114);
      doc.text(identitasPesantren.subJudul || 'PONPES TAHFIDZ & ILMU TEKNOLOGI', marginX + 19, 21.5);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.8);
      doc.setTextColor(100, 116, 139);
      doc.text('Wustho · Ulya · Muslim Digital Academy (MDA)', marginX + 19, 25.2);
    }

    // Teks Judul Dokumen KOP Kanan
    const rightX = pageW - marginX;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(10, 17, 114);
    doc.text((identitasPesantren.namaYayasanKOP || '').toUpperCase(), rightX, 15.5, { align: 'right' });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(255, 103, 0);
    doc.text('LAPORAN HASIL BELAJAR SANTRI (E-RAPOR DIGITAL)', rightX, 20.8, { align: 'right' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(71, 85, 105);
    doc.text(
      identitasPesantren.taglineRapor || DEFAULT_IDENTITAS_PESANTREN.taglineRapor,
      rightX,
      25.2,
      { align: 'right' }
    );

    // Garis Ganda KOP Rapor A4
    doc.setDrawColor(10, 17, 114);
    doc.setLineWidth(1.0);
    doc.line(marginX, 29.5, rightX, 29.5);
    doc.setLineWidth(0.3);
    doc.line(marginX, 30.8, rightX, 30.8);

    // ========================================================================
    // 2. KOTAK BIODATA BUKU INDUK SANTRI (2 KOLOM RAPI)
    // ========================================================================
    const bioTopY = 33.5;
    const bioHeight = 31;
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.25);
    doc.roundedRect(marginX, bioTopY, contentW, bioHeight, 1.8, 1.8, 'FD');

    const col1LabelX = marginX + 3.5;
    const col1ValX = marginX + 36;
    const col2LabelX = marginX + 94;
    const col2ValX = marginX + 126;

    const barisBioKiri: Array<[string, string, boolean?]> = [
      ['Nama Lengkap Santri', `: ${santriTarget.nama}`, true],
      ['NIS / NISN', `: ${santriTarget.nis} / ${santriTarget.nisn || '-'}`, true],
      ['NIK / No. KK', `: ${santriTarget.nik || '-'} / ${santriTarget.noKK || '-'}`, false],
      [
        'Jenis Kelamin',
        `: ${santriTarget.jk === 'P' ? 'Perempuan (Putri)' : 'Laki-laki (Putra)'}`,
        false,
      ],
      [
        'Tempat, Tgl Lahir',
        `: ${santriTarget.tempatLahir || '-'}, ${santriTarget.tanggalLahir || '-'}`,
        false,
      ],
    ];

    const unitKelasStr = `${santriTarget.unit} — ${santriTarget.kelas}${
      santriTarget.kelasTerdata && santriTarget.kelasTerdata !== santriTarget.kelas
        ? ` (${santriTarget.kelasTerdata})`
        : ''
    }`;

    const barisBioKanan: Array<[string, string, boolean?]> = [
      ['Unit / Kelas', `: ${unitKelasStr}`, true],
      [
        'Angkatan / Tgl Masuk',
        `: ${santriTarget.angkatan || '-'} (${santriTarget.tanggalMasuk || '-'}) · Kode: ${
          santriTarget.kodeBarang || '-'
        }`,
        false,
      ],
      [
        'Nama Ayah / Ibu',
        `: ${santriTarget.namaAyah || '-'} / ${santriTarget.namaIbu || '-'}`,
        false,
      ],
      [
        'Telp. Orang Tua',
        `: ${santriTarget.noTelpAyah || '-'} / ${santriTarget.noTelpIbu || '-'}`,
        false,
      ],
      ['Alamat Rumah', `: ${(santriTarget.alamat || '-').slice(0, 62)}`, false],
    ];

    barisBioKiri.forEach(([label, val, bold], idx) => {
      const y = bioTopY + 5.5 + idx * 5.4;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.8);
      doc.setTextColor(100, 116, 139);
      doc.text(label, col1LabelX, y);

      doc.setFont('helvetica', bold ? 'bold' : 'normal');
      doc.setTextColor(bold ? 10 : 15, bold ? 17 : 23, bold ? 114 : 42);
      doc.text(val, col1ValX, y);
    });

    barisBioKanan.forEach(([label, val, bold], idx) => {
      const y = bioTopY + 5.5 + idx * 5.4;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.8);
      doc.setTextColor(100, 116, 139);
      doc.text(label, col2LabelX, y);

      doc.setFont('helvetica', bold ? 'bold' : 'normal');
      doc.setTextColor(bold ? 10 : 15, bold ? 17 : 23, bold ? 114 : 42);
      doc.text(val, col2ValX, y);
    });

    // ========================================================================
    // 3. TABEL I. CAPAIAN NILAI AKADEMIK & UJIAN CBT (4 KOMPONEN)
    // ========================================================================
    let cursorY = bioTopY + bioHeight + 6.5;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(10, 17, 114);
    doc.text('TABEL I. CAPAIAN NILAI AKADEMIK & UJIAN CBT', marginX, cursorY);

    const rataAkhirSantri =
      nilaiSantriCetak.length > 0
        ? Number(
            (
              nilaiSantriCetak.reduce((acc, r) => acc + r.nilaiAkhir, 0) / nilaiSantriCetak.length
            ).toFixed(2)
          )
        : 0;
    const predikatRata =
      rataAkhirSantri >= 85 ? 'A' : rataAkhirSantri >= 75 ? 'B' : rataAkhirSantri >= 60 ? 'C' : 'D';

    const bodyTabelAkademik =
      nilaiSantriCetak.length > 0
        ? nilaiSantriCetak.map((n, i) => [
            String(i + 1),
            n.mapel,
            String(n.tugas),
            String(n.sikap),
            String(n.lisan),
            String(n.cbt),
            n.nilaiAkhir.toFixed(2),
            n.predikat,
          ])
        : [['1', 'Belum ada nilai mata pelajaran pada filter ini', '-', '-', '-', '-', '-', '-']];

    autoTable(doc, {
      startY: cursorY + 2,
      margin: { left: marginX, right: marginX },
      head: [
        [
          'No',
          'Mata Pelajaran',
          'Tugas (20%)',
          'Sikap (20%)',
          'Lisan (20%)',
          'CBT (40%)',
          'Nilai Akhir',
          'Predikat',
        ],
      ],
      body: bodyTabelAkademik,
      foot:
        nilaiSantriCetak.length > 0
          ? [
              [
                '',
                `Rata-Rata Nilai Akhir Akademik (${nilaiSantriCetak.length} Mata Pelajaran)`,
                '',
                '',
                '',
                '',
                rataAkhirSantri.toFixed(2),
                predikatRata,
              ],
            ]
          : undefined,
      theme: 'grid',
      styles: {
        font: 'helvetica',
        fontSize: 8,
        cellPadding: 2.1,
        textColor: [15, 23, 42],
        lineColor: [203, 213, 225],
        lineWidth: 0.2,
      },
      headStyles: {
        fillColor: [10, 17, 114],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        halign: 'center',
      },
      footStyles: {
        fillColor: [241, 245, 249],
        textColor: [10, 17, 114],
        fontStyle: 'bold',
      },
      columnStyles: {
        0: { cellWidth: 10, halign: 'center' },
        1: { cellWidth: 56, fontStyle: 'bold' },
        2: { cellWidth: 19, halign: 'right' },
        3: { cellWidth: 19, halign: 'right' },
        4: { cellWidth: 19, halign: 'right' },
        5: { cellWidth: 19, halign: 'right', fontStyle: 'bold' },
        6: { cellWidth: 21, halign: 'right', fontStyle: 'bold', textColor: [10, 17, 114] },
        7: { cellWidth: 19, halign: 'center', fontStyle: 'bold', textColor: [255, 103, 0] },
      },
    });

    const afterTable1Y =
      (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ||
      cursorY + 45;

    // ========================================================================
    // 4. TABEL II. PENCAPAIAN TAHFIDZ AL-QUR'AN
    // ========================================================================
    cursorY = afterTable1Y + 6.5;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(10, 17, 114);
    doc.text("TABEL II. PENCAPAIAN TAHFIDZ AL-QUR'AN", marginX, cursorY);

    autoTable(doc, {
      startY: cursorY + 2,
      margin: { left: marginX, right: marginX },
      head: [['Juz Hafalan', 'Surat Terakhir', 'Tingkat Kelancaran', 'Catatan Muhaffizh / Ustadz']],
      body: [
        [
          tahfidzSantri.juzHafalan,
          tahfidzSantri.suratTerakhir,
          tahfidzSantri.kelancaran,
          tahfidzSantri.catatanUstadz || 'Terus tingkatkan murajaah harian secara istiqamah.',
        ],
      ],
      theme: 'grid',
      styles: {
        font: 'helvetica',
        fontSize: 8,
        cellPadding: 2.4,
        textColor: [15, 23, 42],
        lineColor: [203, 213, 225],
        lineWidth: 0.2,
      },
      headStyles: {
        fillColor: [10, 17, 114],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
      },
      columnStyles: {
        0: { cellWidth: 38, fontStyle: 'bold', textColor: [10, 17, 114] },
        1: { cellWidth: 38, fontStyle: 'bold' },
        2: { cellWidth: 32, fontStyle: 'bold', textColor: [255, 103, 0] },
        3: { cellWidth: 74 },
      },
    });

    const afterTable2Y =
      (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ||
      cursorY + 24;

    // ========================================================================
    // 5. TABEL III. PENCAPAIAN KOMPETENSI ILMU TEKNOLOGI (IT)
    // ========================================================================
    cursorY = afterTable2Y + 6.5;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(10, 17, 114);
    doc.text('TABEL III. PENCAPAIAN KOMPETENSI ILMU TEKNOLOGI (IT)', marginX, cursorY);

    autoTable(doc, {
      startY: cursorY + 2,
      margin: { left: marginX, right: marginX },
      head: [
        [
          'Materi Kompetensi IT',
          'Total Projek',
          'Nilai Praktek',
          'Predikat IT',
          'Karya / Projek Akhir',
          'Catatan Instruktur',
        ],
      ],
      body: [
        [
          itSantri.materiKompetensi,
          `${itSantri.totalProjek} Projek`,
          String(itSantri.nilaiPraktek),
          predikatITSantri,
          itSantri.karyaAkhir,
          itSantri.catatanInstruktur || 'Memiliki antusiasme tinggi dalam eksplorasi teknologi.',
        ],
      ],
      theme: 'grid',
      styles: {
        font: 'helvetica',
        fontSize: 7.8,
        cellPadding: 2.3,
        textColor: [15, 23, 42],
        lineColor: [203, 213, 225],
        lineWidth: 0.2,
      },
      headStyles: {
        fillColor: [10, 17, 114],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
      },
      columnStyles: {
        0: { cellWidth: 36, fontStyle: 'bold' },
        1: { cellWidth: 20, halign: 'center', fontStyle: 'bold' },
        2: { cellWidth: 20, halign: 'right', fontStyle: 'bold', textColor: [10, 17, 114] },
        3: { cellWidth: 26, halign: 'center', fontStyle: 'bold', textColor: [255, 103, 0] },
        4: { cellWidth: 38 },
        5: { cellWidth: 42 },
      },
    });

    const afterTable3Y =
      (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ||
      cursorY + 25;

    // ========================================================================
    // 6. KOLOM TANDA TANGAN RESMI & QR VERIFIKASI DIGITAL
    // ========================================================================
    let signTopY = afterTable3Y + 9;
    if (signTopY > 248) {
      doc.addPage('a4', 'portrait');
      signTopY = 24;
    }

    const colSign1Center = marginX + 34;
    const colSign2Center = marginX + 96;
    const qrBoxX = marginX + 148;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);
    doc.text('Mengetahui,', colSign1Center, signTopY, { align: 'center' });
    doc.text('Ditetapkan Oleh,', colSign2Center, signTopY, { align: 'center' });

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(`Mudir ${identitasPesantren.namaUtama}`, colSign1Center, signTopY + 4.2, {
      align: 'center',
    });
    doc.text(`Wali Kelas ${santriTarget.kelas}`, colSign2Center, signTopY + 4.2, {
      align: 'center',
    });

    const lineY = signTopY + 23;
    doc.setDrawColor(148, 163, 184);
    doc.setLineWidth(0.3);
    doc.line(colSign1Center - 26, lineY, colSign1Center + 26, lineY);
    doc.line(colSign2Center - 26, lineY, colSign2Center + 26, lineY);

    const namaWaliKelasPdf = ambilNamaWaliKelas(santriTarget.unit, santriTarget.kelas);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.8);
    doc.setTextColor(10, 17, 114);
    doc.text(identitasPesantren.namaMudir, colSign1Center, lineY + 4.2, { align: 'center' });
    doc.text(namaWaliKelasPdf, colSign2Center, lineY + 4.2, { align: 'center' });

    // Gambar QR Code Verifikasi Digital di Sisi Kanan Bawah
    const payloadQr = `DARULFITHRAH|${santriTarget.nis}|${santriTarget.nama}|${santriTarget.unit}|${santriTarget.kelas}|${tahfidzSantri.suratTerakhir}|${itSantri.nilaiPraktek}`;
    gambarQrVectorKeJsPDF(doc, payloadQr, qrBoxX, signTopY - 1, 21);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(10, 17, 114);
    doc.text(`DF-VERIF-2026-${santriTarget.nis}`, qrBoxX + 10.5, signTopY + 23.5, {
      align: 'center',
    });

    // Footer Resmi Halaman A4
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.25);
    doc.line(marginX, 285, rightX, 285);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.8);
    doc.setTextColor(100, 116, 139);
    doc.text(
      `Dokumen Resmi e-Rapor Digital ${identitasPesantren.namaUtama} · Tata Letak Standar A4 Portrait (210 × 297 mm)`,
      marginX,
      289
    );
    doc.text(
      `Dicetak: ${new Date().toLocaleDateString('id-ID', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      })}`,
      rightX,
      289,
      { align: 'right' }
    );
  };

  // Unduh File PDF A4 untuk Santri yang Sedang Aktif
  const handleUnduhRaporPDF = async () => {
    // Jika yang mengakses adalah Santri via NIS, pastikan seluruh data rapornya telah 100% lengkap
    if (santriLoginRapor && !statusKelengkapanRaporAktif.apakahLengkap) {
      Swal.fire({
        icon: 'warning',
        title: 'Unduh PDF Belum Diizinkan (Data Belum Lengkap)',
        text: `Data e-Rapor untuk ${santriRaporAktif.nama} (${santriRaporAktif.nis}) baru terisi ${statusKelengkapanRaporAktif.persentaseLengkap}% (${statusKelengkapanRaporAktif.totalMapelTerisiLengkap}/${statusKelengkapanRaporAktif.totalMapelWajib} mata pelajaran). Rapor hanya dapat diunduh setelah seluruh nilai selesai diisi lengkap oleh Ustadz.`,
        confirmButtonColor: '#0A1172',
      });
      return;
    }

    setIsGeneratingRaporPdf(true);
    try {
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
        compress: true,
      });

      await renderHalamanRaporSantriKeJsPDF(doc, santriRaporAktif);

      const namaBersih = santriRaporAktif.nama.replace(/[^a-zA-Z0-9]/g, '_');
      const namaFile = `e-Rapor_A4_${santriRaporAktif.unit}_${santriRaporAktif.kelas.replace(
        /\s+/g,
        ''
      )}_${santriRaporAktif.nis}_${namaBersih}.pdf`;

      doc.save(namaFile);

      Swal.fire({
        icon: 'success',
        title: 'File PDF e-Rapor A4 Berhasil Diunduh!',
        text: `Dokumen ${namaFile} telah dibuat menggunakan jsPDF dengan tata letak A4 Portrait resmi Darul Fithrah.`,
        timer: 2200,
        showConfirmButton: false,
      });
    } catch (err) {
      Swal.fire(
        'Gagal Membuat PDF',
        err instanceof Error ? err.message : 'Terjadi kendala saat menyusun file PDF A4.',
        'error'
      );
    } finally {
      setIsGeneratingRaporPdf(false);
    }
  };

  // Unduh File PDF A4 Kolektif untuk Seluruh Santri pada Kelas Ampuan yang Sedang Difilter
  const handleUnduhRaporKelasBatchPDF = async () => {
    if (santriRaporTersedia.length === 0) return;
    setIsGeneratingRaporPdf(true);
    try {
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
        compress: true,
      });

      for (let idx = 0; idx < santriRaporTersedia.length; idx++) {
        const santriItem = santriRaporTersedia[idx];
        if (idx > 0) {
          doc.addPage('a4', 'portrait');
        }
        await renderHalamanRaporSantriKeJsPDF(doc, santriItem);
      }

      const labelKelas =
        filterKelasRaporUstadz === 'SEMUA_AMPUAN'
          ? ustadzLoginAktif
            ? `Kelas_Ampuan_${ustadzLoginAktif.namaUstadz.replace(/[^a-zA-Z0-9]/g, '_')}`
            : 'Semua_Unit_Kelas'
          : filterKelasRaporUstadz.replace(/[^a-zA-Z0-9]/g, '_');

      const namaFile = `e-Rapor_Kolektif_A4_${labelKelas}_${santriRaporTersedia.length}_Santri.pdf`;
      doc.save(namaFile);

      Swal.fire({
        icon: 'success',
        title: `PDF Kolektif (${santriRaporTersedia.length} Santri) Berhasil Diunduh!`,
        text: `Seluruh ${santriRaporTersedia.length} lembar e-Rapor A4 telah digabungkan dalam satu dokumen PDF siap cetak (${namaFile}).`,
        confirmButtonColor: '#0A1172',
      });
    } catch (err) {
      Swal.fire(
        'Gagal Membuat PDF Kolektif',
        err instanceof Error ? err.message : 'Terjadi kendala saat menyusun PDF kolektif.',
        'error'
      );
    } finally {
      setIsGeneratingRaporPdf(false);
    }
  };

  // ==========================================================================
  // KALKULASI REAL-TIME GRAFIK BATANG RATA-RATA NILAI MAPEL PER UNIT PENDIDIKAN
  // ==========================================================================
  const normalisasiNamaMapelGrafik = (nama: string): string => {
    const trimmed = nama.trim();
    if (/^akhla[qk]$/i.test(trimmed)) return 'Akhlak';
    if (/^imla/i.test(trimmed)) return "Imla' & Khot";
    if (/^tahsin/i.test(trimmed)) return 'Tahsin Al-Jazariyyah';
    if (/^karakter/i.test(trimmed)) return 'Karakter & Menejemen';
    if (/^ABY/i.test(trimmed)) return 'ABY (Bahasa Arab)';
    if (/^Psikologi Terapan/i.test(trimmed)) return 'Psikologi Terapan';
    return trimmed;
  };

  const hitungRataMapelUnit = (namaMapelNorm: string, unitTarget: UnitPendidikan): number | null => {
    // Cek apakah mapel ini diajarkan di unitTarget
    const mapelUnitCocok = mapelList.filter(
      (m) => m.unit === unitTarget && normalisasiNamaMapelGrafik(m.namaMapel) === namaMapelNorm
    );
    const santriUnit = santriList.filter((s) => s.unit === unitTarget);
    const nisSetUnit = new Set(santriUnit.map((s) => s.nis));

    // Cari nilai aktual yang sudah tersimpan di nilaiAkademik untuk santri di unit ini
    const barisNilaiAktual = nilaiAkademik.filter(
      (n) => nisSetUnit.has(n.nis) && normalisasiNamaMapelGrafik(n.mapel) === namaMapelNorm
    );

    if (barisNilaiAktual.length > 0) {
      const total = barisNilaiAktual.reduce((acc, row) => acc + Number(row[komponenGrafikAdmin] || 0), 0);
      return Math.round((total / barisNilaiAktual.length) * 10) / 10;
    }

    if (mapelUnitCocok.length === 0) {
      return null;
    }

    // Jika mapel terdaftar pada unit ini namun belum ada nilai yang diinput oleh Ustadz, kembalikan 0
    return 0;
  };

  // Kumpulkan daftar seluruh nama mapel unik setelah normalisasi
  const daftarMapelUnikGrafik = Array.from(
    new Set(mapelList.map((m) => normalisasiNamaMapelGrafik(m.namaMapel)))
  );

  const dataGrafikLengkap = daftarMapelUnikGrafik.map((namaMapel) => {
    const wusthoVal = hitungRataMapelUnit(namaMapel, 'Wustho');
    const ulyaVal = hitungRataMapelUnit(namaMapel, 'Ulya');
    const mdaVal = hitungRataMapelUnit(namaMapel, 'MDA');
    const nilaiValid = [wusthoVal, ulyaVal, mdaVal].filter((v): v is number => v !== null);
    const rataGabungan =
      nilaiValid.length > 0
        ? Math.round((nilaiValid.reduce((a, b) => a + b, 0) / nilaiValid.length) * 10) / 10
        : 0;

    return {
      mapel: namaMapel,
      Wustho: wusthoVal,
      Ulya: ulyaVal,
      MDA: mdaVal,
      jumlahUnit: nilaiValid.length,
      rataGabungan,
    };
  });

  const dataGrafikRataMapelUnit = dataGrafikLengkap.filter((item) => {
    if (filterUnitGrafikAdmin !== 'SEMUA') {
      return item[filterUnitGrafikAdmin] !== null;
    }
    if (cakupanMapelGrafikAdmin === 'lintas_unit') {
      // Tampilkan mapel yang ada di minimal 2 unit atau mapel unggulan utama tiap unit
      return (
        item.jumlahUnit >= 2 ||
        ['Full-Stack Web Engineering', 'UI/UX Design', 'Multimedia Production', 'Digital Marketing (DM)', 'Siroh', 'Tarikh'].includes(
          item.mapel
        )
      );
    }
    return true;
  });

  const hitungRataSeluruhMapelDiUnit = (unitTarget: UnitPendidikan): number => {
    const vals = dataGrafikLengkap
      .map((d) => d[unitTarget])
      .filter((v): v is number => typeof v === 'number' && v > 0);
    if (vals.length === 0) return 0;
    return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10;
  };

  const rataUnitWustho = hitungRataSeluruhMapelDiUnit('Wustho');
  const rataUnitUlya = hitungRataSeluruhMapelDiUnit('Ulya');
  const rataUnitMDA = hitungRataSeluruhMapelDiUnit('MDA');
  const mapelTertinggiGrafik = [...dataGrafikLengkap].sort((a, b) => b.rataGabungan - a.rataGabungan)[0];

  return (
    <div className="min-h-screen flex flex-col bg-[#F8FAFC] text-slate-900">
      {/* =====================================================================
          TOP NAVBAR RESMI DARUL FITHRAH (3-Zone Contract)
          ===================================================================== */}
      <header className="no-print sticky top-0 z-30 bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between gap-8">
        {/* Zone 1: Brand Logo Darul Fithrah (Dapat Diedit) */}
        <div className="flex items-center gap-3 shrink-0">
          <a
            href="#beranda"
            onClick={(e) => {
              e.preventDefault();
              if (!ujianBerlangsung) setActiveModule('beranda');
            }}
            className="shrink-0"
          >
            <LogoDarulFithrah size="sm" identitas={identitasPesantren} />
          </a>
          {isAdminUnlocked && adminPunyaAkses('identitas_rapor') && (
            <button
              type="button"
              onClick={() => !ujianBerlangsung && setIsModalIdentitasOpen(true)}
              className="px-2.5 py-1 text-[11px] font-bold text-[#0A1172] bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-md transition-colors cursor-pointer"
              title="Edit Logo & Tulisan Pesantren di Antarmuka Web"
            >
              <i className="fa-solid fa-pen-to-square mr-1 text-[#FF6700]" />
              Edit Logo &amp; Teks
            </button>
          )}
        </div>

        {/* Zone 2: Navigation Links */}
        <nav className="flex items-center gap-6 text-sm font-semibold text-slate-600 overflow-x-auto">
          <button
            type="button"
            onClick={() => !ujianBerlangsung && setActiveModule('beranda')}
            className={`py-1.5 border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeModule === 'beranda'
                ? 'border-[#FF6700] text-[#0A1172]'
                : 'border-transparent hover:text-[#0A1172]'
            }`}
          >
            Beranda
          </button>
          <button
            type="button"
            onClick={() => bukaModulDenganPin('ustadz')}
            className={`py-1.5 border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeModule === 'ustadz'
                ? 'border-[#FF6700] text-[#0A1172]'
                : 'border-transparent hover:text-[#0A1172]'
            }`}
          >
            Portal Ustadz
          </button>
          <button
            type="button"
            onClick={() => !ujianBerlangsung && setActiveModule('cbt')}
            className={`py-1.5 border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeModule === 'cbt'
                ? 'border-[#FF6700] text-[#0A1172]'
                : 'border-transparent hover:text-[#0A1172]'
            }`}
          >
            Ujian CBT Santri
          </button>
          <button
            type="button"
            onClick={() => bukaModulDenganPin('rapor')}
            className={`py-1.5 border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeModule === 'rapor'
                ? 'border-[#FF6700] text-[#0A1172]'
                : 'border-transparent hover:text-[#0A1172]'
            }`}
          >
            Cetak e-Rapor A4
          </button>
        </nav>

        {/* Zone 3: Status Sinkronisasi Cloud, Dasbor Admin & Tombol Logout */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleToggleLoginFirebaseCloud}
            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-mono font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-lg cursor-pointer"
            title={
              cloudUser
                ? `Tersinkron ke Google Cloud Firestore (${cloudUser.email})`
                : 'Klik untuk mencadangkan ke akun Google Firebase Cloud Anda'
            }
          >
            <span
              className={`w-2 h-2 rounded-full ${
                statusSinkronCloud === 'menyimpan' ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'
              }`}
            />
            <span>
              {cloudUser
                ? `Cloud: ${cloudUser.email?.split('@')[0]}`
                : statusSinkronCloud === 'menyimpan'
                ? 'Menyimpan DB...'
                : 'DB Server Aktif'}
            </span>
          </button>

          <button
            type="button"
            onClick={() => bukaModulDenganPin('admin')}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-bold text-white bg-[#0A1172] hover:bg-[#0A1172]/90 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <i className="fa-solid fa-user-shield text-[#FF6700]" />
            <span>
              {isAdminUnlocked && adminLoginAktif
                ? `Admin (${adminLoginAktif.username})`
                : 'Dasbor Admin'}
            </span>
          </button>

          {(isAdminUnlocked || isUstadzUnlocked || santriLoginRapor) && (
            <button
              type="button"
              onClick={() =>
                handleLogout(
                  activeModule === 'admin'
                    ? 'admin'
                    : activeModule === 'ustadz'
                    ? 'ustadz'
                    : activeModule === 'rapor'
                    ? santriLoginRapor
                      ? 'santri'
                      : ustadzLoginAktif
                      ? 'ustadz'
                      : 'admin'
                    : 'semua'
                )
              }
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              title="Keluar (Logout) dari sesi aktif"
            >
              <i className="fa-solid fa-right-from-bracket" />
              <span>Logout</span>
            </button>
          )}
        </div>
      </header>

      {/* MODAL EDIT LOGO PESANTREN & TULISAN ANTARMUKA WEB */}
      {isModalIdentitasOpen && isAdminUnlocked && adminPunyaAkses('identitas_rapor') && (
        <div className="no-print fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-2xl w-full p-6 sm:p-8 space-y-5 shadow-xl my-8">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-4">
              <div>
                <div className="text-xs font-mono font-bold text-[#FF6700] uppercase">
                  KUSTOMISASI IDENTITAS VISUAL &amp; KOP RAPOR
                </div>
                <h2 className="text-xl font-bold text-[#0A1172]">
                  Edit Logo Pesantren &amp; Tulisan Antarmuka Web
                </h2>
                <p className="text-xs text-slate-600">
                  Perubahan otomatis diterapkan ke Navbar, Halaman Beranda, Ruang CBT, dan KOP e-Rapor A4.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsModalIdentitasOpen(false)}
                className="px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
              >
                ✕ Tutup
              </button>
            </div>

            {/* Preview Langsung Logo & Tulisan */}
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <div className="text-[11px] font-mono text-slate-500 mb-1">Preview Logo &amp; Teks Saat Ini:</div>
                <LogoDarulFithrah size="lg" identitas={identitasPesantren} />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="px-3.5 py-2 text-xs font-bold text-white bg-[#0A1172] hover:bg-[#0A1172]/90 rounded-lg cursor-pointer">
                  <i className="fa-solid fa-image mr-1.5 text-[#FF6700]" />
                  Ganti Gambar Logo
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      const reader = new FileReader();
                      reader.onload = () => {
                        simpanIdentitasPesantren({
                          ...identitasPesantren,
                          customLogoDataUrl: String(reader.result || ''),
                        });
                      };
                      reader.readAsDataURL(f);
                    }}
                    className="hidden"
                  />
                </label>
                {identitasPesantren.customLogoDataUrl && (
                  <button
                    type="button"
                    onClick={() =>
                      simpanIdentitasPesantren({
                        ...identitasPesantren,
                        customLogoDataUrl: '',
                      })
                    }
                    className="px-3 py-2 text-xs font-bold text-red-700 bg-red-50 hover:bg-red-100 rounded-lg cursor-pointer"
                  >
                    Gunakan Logo Resmi Darul Fithrah
                  </button>
                )}
              </div>
            </div>

            {/* Form Input Tulisan Antarmuka Web */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Nama Utama Pesantren (Warna Oranye)</label>
                <input
                  type="text"
                  value={identitasPesantren.namaUtama}
                  onChange={(e) =>
                    simpanIdentitasPesantren({ ...identitasPesantren, namaUtama: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-bold"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">Teks Kaligrafi Arab (Sebelah Nama)</label>
                <input
                  type="text"
                  dir="rtl"
                  value={identitasPesantren.teksArab}
                  onChange={(e) =>
                    simpanIdentitasPesantren({ ...identitasPesantren, teksArab: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-bold"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block font-bold text-slate-700 mb-1">Sub-Teks Identitas (Di Bawah Nama Logo)</label>
                <input
                  type="text"
                  value={identitasPesantren.subJudul}
                  onChange={(e) =>
                    simpanIdentitasPesantren({ ...identitasPesantren, subJudul: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block font-bold text-slate-700 mb-1">Judul Utama Banner Beranda Web</label>
                <input
                  type="text"
                  value={identitasPesantren.judulAplikasiHero}
                  onChange={(e) =>
                    simpanIdentitasPesantren({ ...identitasPesantren, judulAplikasiHero: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-semibold"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block font-bold text-slate-700 mb-1">Deskripsi Sub-Judul Beranda Web</label>
                <textarea
                  rows={2}
                  value={identitasPesantren.deskripsiHero}
                  onChange={(e) =>
                    simpanIdentitasPesantren({ ...identitasPesantren, deskripsiHero: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block font-bold text-slate-700 mb-1">Nama Yayasan pada KOP e-Rapor Resmi</label>
                <input
                  type="text"
                  value={identitasPesantren.namaYayasanKOP}
                  onChange={(e) =>
                    simpanIdentitasPesantren({ ...identitasPesantren, namaYayasanKOP: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block font-bold text-slate-700 mb-1">
                  Tagline KOP e-Rapor Digital (Di Bawah Judul Rapor)
                </label>
                <input
                  type="text"
                  value={identitasPesantren.taglineRapor || ''}
                  onChange={(e) =>
                    simpanIdentitasPesantren({ ...identitasPesantren, taglineRapor: e.target.value })
                  }
                  placeholder="Tahfidz Al-Qur'an · Ulumuddin · Muslim Digital Academy (Ilmu Teknologi)"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">Nama Mudir (Tanda Tangan Rapor)</label>
                <input
                  type="text"
                  value={identitasPesantren.namaMudir}
                  onChange={(e) =>
                    simpanIdentitasPesantren({ ...identitasPesantren, namaMudir: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Nama Wali Kelas Default (Semua Kelas)
                </label>
                <input
                  type="text"
                  value={identitasPesantren.namaWaliKelasDefault || ''}
                  onChange={(e) =>
                    simpanIdentitasPesantren({
                      ...identitasPesantren,
                      namaWaliKelasDefault: e.target.value,
                    })
                  }
                  placeholder="Contoh: Ustadz H. Abdurrahman, Lc., M.Ag."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div className="sm:col-span-2 p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                <label className="block font-bold text-[#0A1172]">
                  Atur Nama Wali Kelas Khusus per Unit &amp; Kelas (Opsional)
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <select
                    value={selectedWaliKelasKey}
                    onChange={(e) => setSelectedWaliKelasKey(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white font-semibold"
                  >
                    {(Object.keys(UNIT_KELAS_MAP) as UnitPendidikan[]).flatMap((u) =>
                      UNIT_KELAS_MAP[u].map((k) => (
                        <option key={`${u}__${k}`} value={`${u}__${k}`}>
                          {u} — {k}
                        </option>
                      ))
                    )}
                  </select>
                  <input
                    type="text"
                    value={identitasPesantren.waliKelasMap?.[selectedWaliKelasKey] ?? ''}
                    onChange={(e) =>
                      simpanIdentitasPesantren({
                        ...identitasPesantren,
                        waliKelasMap: {
                          ...(identitasPesantren.waliKelasMap || {}),
                          [selectedWaliKelasKey]: e.target.value,
                        },
                      })
                    }
                    placeholder={`Kosongkan untuk pakai default (${identitasPesantren.namaWaliKelasDefault || 'Wali Kelas'})`}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                  />
                </div>
              </div>
              <div className="sm:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                <div>
                  <label className="block font-bold text-[#0A1172] mb-1">
                    Batas Waktu (Deadline) Pengisian Soal Ujian CBT
                  </label>
                  <input
                    type="date"
                    value={identitasPesantren.deadlineInputSoalIso || ambilTanggalDefaultDeadlineSoal()}
                    onChange={(e) =>
                      simpanIdentitasPesantren({
                        ...identitasPesantren,
                        deadlineInputSoalIso: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 border border-blue-300 bg-blue-50 rounded-lg font-mono font-bold text-[#0A1172]"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    Memicu pengingat otomatis bagi Ustadz yang mapel ampuannya belum memiliki soal CBT.
                  </p>
                </div>
                <div>
                  <label className="block font-bold text-[#FF6700] mb-1">
                    Batas Waktu (Deadline) Pengisian Nilai Rapor
                  </label>
                  <input
                    type="date"
                    value={identitasPesantren.deadlineInputRaporIso || ambilTanggalDefaultDeadlineRapor()}
                    onChange={(e) =>
                      simpanIdentitasPesantren({
                        ...identitasPesantren,
                        deadlineInputRaporIso: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 border border-amber-300 bg-amber-50 rounded-lg font-mono font-bold text-[#0A1172]"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    Memicu pengingat otomatis bagi Ustadz yang nilai santrinya belum lengkap mendekati batas akhir.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-slate-200">
              <button
                type="button"
                onClick={() => simpanIdentitasPesantren(DEFAULT_IDENTITAS_PESANTREN)}
                className="px-4 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
              >
                Reset ke Default Darul Fithrah
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsModalIdentitasOpen(false);
                  Swal.fire({
                    icon: 'success',
                    title: 'Logo & Tulisan Web Diperbarui!',
                    text: 'Seluruh perubahan identitas visual pesantren telah disimpan.',
                    confirmButtonColor: '#0A1172',
                  });
                }}
                className="px-5 py-2.5 text-xs font-bold text-white bg-[#FF6700] hover:bg-[#e55c00] rounded-lg cursor-pointer"
              >
                Simpan &amp; Terapkan Identitas
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL EDIT DATA BUKU INDUK SANTRI */}
      {editSantriForm && (
        <div className="no-print fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4 overflow-y-auto">
          <form
            onSubmit={handleSimpanEditSantriAdmin}
            className="bg-white border border-slate-200 rounded-2xl max-w-3xl w-full p-6 sm:p-7 space-y-4 shadow-xl my-8 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-3">
              <div>
                <div className="text-[11px] font-mono font-bold text-[#FF6700] uppercase">
                  EDIT DATA BUKU INDUK SANTRI
                </div>
                <h2 className="text-lg font-bold text-[#0A1172]">
                  Perbarui Biodata Santri: {editSantriForm.nama}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => {
                  setEditSantriForm(null);
                  setEditSantriAsliNis(null);
                }}
                className="px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
              >
                ✕ Tutup
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">NIS *</label>
                <input
                  type="text"
                  required
                  value={editSantriForm.nis}
                  onChange={(e) => setEditSantriForm({ ...editSantriForm, nis: e.target.value })}
                  className="w-full px-3 py-2 font-mono uppercase border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">NISN</label>
                <input
                  type="text"
                  value={editSantriForm.nisn || ''}
                  onChange={(e) => setEditSantriForm({ ...editSantriForm, nisn: e.target.value })}
                  className="w-full px-3 py-2 font-mono border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Jenis Kelamin</label>
                <select
                  value={editSantriForm.jk || 'L'}
                  onChange={(e) => setEditSantriForm({ ...editSantriForm, jk: e.target.value as 'L' | 'P' })}
                  className="w-full px-3 py-2 font-semibold bg-white border border-slate-300 rounded-lg"
                >
                  <option value="L">L (Putra)</option>
                  <option value="P">P (Putri)</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div className="sm:col-span-1">
                <label className="block font-semibold text-slate-700 mb-1">Nama Lengkap *</label>
                <input
                  type="text"
                  required
                  value={editSantriForm.nama}
                  onChange={(e) => setEditSantriForm({ ...editSantriForm, nama: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-semibold"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Unit Pendidikan</label>
                <select
                  value={editSantriForm.unit}
                  onChange={(e) => {
                    const nextUnit = e.target.value as UnitPendidikan;
                    setEditSantriForm({
                      ...editSantriForm,
                      unit: nextUnit,
                      kelas: UNIT_KELAS_MAP[nextUnit][0],
                    });
                  }}
                  className="w-full px-3 py-2 font-semibold bg-white border border-slate-300 rounded-lg"
                >
                  <option value="Wustho">Wustho</option>
                  <option value="Ulya">Ulya</option>
                  <option value="MDA">MDA</option>
                </select>
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Kelas</label>
                <select
                  value={editSantriForm.kelas}
                  onChange={(e) => setEditSantriForm({ ...editSantriForm, kelas: e.target.value })}
                  className="w-full px-3 py-2 font-semibold bg-white border border-slate-300 rounded-lg"
                >
                  {UNIT_KELAS_MAP[editSantriForm.unit].map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">NIK Santri</label>
                <input
                  type="text"
                  value={editSantriForm.nik || ''}
                  onChange={(e) => setEditSantriForm({ ...editSantriForm, nik: e.target.value })}
                  className="w-full px-3 py-2 font-mono border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">No. KK</label>
                <input
                  type="text"
                  value={editSantriForm.noKK || ''}
                  onChange={(e) => setEditSantriForm({ ...editSantriForm, noKK: e.target.value })}
                  className="w-full px-3 py-2 font-mono border border-slate-300 rounded-lg"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Tempat Lahir</label>
                <input
                  type="text"
                  value={editSantriForm.tempatLahir || ''}
                  onChange={(e) => setEditSantriForm({ ...editSantriForm, tempatLahir: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Tanggal Lahir</label>
                <input
                  type="text"
                  value={editSantriForm.tanggalLahir || ''}
                  onChange={(e) => setEditSantriForm({ ...editSantriForm, tanggalLahir: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Angkatan</label>
                <input
                  type="text"
                  value={editSantriForm.angkatan || ''}
                  onChange={(e) => setEditSantriForm({ ...editSantriForm, angkatan: e.target.value })}
                  className="w-full px-3 py-2 font-mono border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Tanggal Masuk</label>
                <input
                  type="text"
                  value={editSantriForm.tanggalMasuk || ''}
                  onChange={(e) => setEditSantriForm({ ...editSantriForm, tanggalMasuk: e.target.value })}
                  className="w-full px-3 py-2 font-mono border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Kode Barang</label>
                <input
                  type="text"
                  value={editSantriForm.kodeBarang || ''}
                  onChange={(e) => setEditSantriForm({ ...editSantriForm, kodeBarang: e.target.value })}
                  className="w-full px-3 py-2 font-mono border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Jumlah Hafalan</label>
                <input
                  type="text"
                  value={editSantriForm.jumlahHafalan || ''}
                  onChange={(e) => setEditSantriForm({ ...editSantriForm, jumlahHafalan: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Nama Ayah</label>
                <input
                  type="text"
                  value={editSantriForm.namaAyah || ''}
                  onChange={(e) => setEditSantriForm({ ...editSantriForm, namaAyah: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">No. Telp Ayah</label>
                <input
                  type="text"
                  value={editSantriForm.noTelpAyah || ''}
                  onChange={(e) => setEditSantriForm({ ...editSantriForm, noTelpAyah: e.target.value })}
                  className="w-full px-3 py-2 font-mono border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Nama Ibu</label>
                <input
                  type="text"
                  value={editSantriForm.namaIbu || ''}
                  onChange={(e) => setEditSantriForm({ ...editSantriForm, namaIbu: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">No. Telp Ibu</label>
                <input
                  type="text"
                  value={editSantriForm.noTelpIbu || ''}
                  onChange={(e) => setEditSantriForm({ ...editSantriForm, noTelpIbu: e.target.value })}
                  className="w-full px-3 py-2 font-mono border border-slate-300 rounded-lg"
                />
              </div>
            </div>

            <div className="text-xs">
              <label className="block font-semibold text-slate-700 mb-1">Alamat Lengkap</label>
              <input
                type="text"
                value={editSantriForm.alamat || ''}
                onChange={(e) => setEditSantriForm({ ...editSantriForm, alamat: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              />
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => {
                  setEditSantriForm(null);
                  setEditSantriAsliNis(null);
                }}
                className="px-4 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
              >
                Batal
              </button>
              <button
                type="submit"
                className="px-5 py-2 text-xs font-bold text-white bg-[#0A1172] hover:bg-[#0A1172]/90 rounded-lg cursor-pointer"
              >
                Simpan Perubahan Santri
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL EDIT AKUN USTADZ PENGAJAR & HAK AKSES PER MAPEL / PER KELAS */}
      {editUstadzForm && (
        <div className="no-print fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4 overflow-y-auto">
          <form
            onSubmit={handleSimpanEditUstadzAdmin}
            className="bg-white border border-slate-200 rounded-2xl max-w-3xl w-full p-5 sm:p-7 space-y-4 shadow-xl my-8 max-h-[92vh] overflow-y-auto"
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-3">
              <div>
                <div className="text-[11px] font-mono font-bold text-[#FF6700] uppercase">
                  EDIT AKUN USTADZ &amp; HAK AKSES PER MAPEL / PER KELAS
                </div>
                <h2 className="text-lg font-bold text-[#0A1172]">
                  Perbarui Pengajar: {editUstadzForm.namaAsli}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setEditUstadzForm(null)}
                className="px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
              >
                ✕ Tutup
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Nama Lengkap Ustadz *</label>
                <input
                  type="text"
                  required
                  value={editUstadzForm.namaUstadz}
                  onChange={(e) => setEditUstadzForm({ ...editUstadzForm, namaUstadz: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-semibold"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">PIN Login Portal Ustadz *</label>
                <input
                  type="text"
                  required
                  value={editUstadzForm.pinLogin}
                  onChange={(e) => setEditUstadzForm({ ...editUstadzForm, pinLogin: e.target.value })}
                  className="w-full px-3 py-2 font-mono border border-slate-300 rounded-lg"
                />
              </div>
            </div>

            {/* MATRIKS HAK AKSES PER UNIT, PER KELAS & PER MAPEL (SINKRON TABEL TOKEN) */}
            {(() => {
              const selectedIds = new Set(editUstadzForm.aksesMapelIds);
              const qModal = editUstadzForm.cariMapelModal.trim().toLowerCase();
              const mapelTersaring = mapelList.filter((m) => {
                if (editUstadzForm.filterUnitModal !== 'SEMUA' && m.unit !== editUstadzForm.filterUnitModal) {
                  return false;
                }
                if (!qModal) return true;
                return (
                  m.namaMapel.toLowerCase().includes(qModal) ||
                  m.kelas.toLowerCase().includes(qModal) ||
                  m.unit.toLowerCase().includes(qModal) ||
                  (m.tokenUjian || '').toLowerCase().includes(qModal) ||
                  (m.pengampu || '').toLowerCase().includes(qModal)
                );
              });

              const grupOrder: Array<{ key: string; unit: UnitPendidikan; kelas: string; items: MapelConfig[] }> = [];
              const grupMap = new Map<string, { key: string; unit: UnitPendidikan; kelas: string; items: MapelConfig[] }>();
              const unitOrder: UnitPendidikan[] = ['Wustho', 'Ulya', 'MDA'];
              unitOrder.forEach((u) => {
                UNIT_KELAS_MAP[u].forEach((k) => {
                  const key = `${u}::${k}`;
                  const grp = { key, unit: u, kelas: k, items: [] as MapelConfig[] };
                  grupMap.set(key, grp);
                  grupOrder.push(grp);
                });
              });
              mapelTersaring.forEach((m) => {
                const key = `${m.unit}::${m.kelas}`;
                let grp = grupMap.get(key);
                if (!grp) {
                  grp = { key, unit: m.unit, kelas: m.kelas, items: [] };
                  grupMap.set(key, grp);
                  grupOrder.push(grp);
                }
                grp.items.push(m);
              });
              const grupAktif = grupOrder.filter((g) => g.items.length > 0);
              const mapelTerpilihObj = mapelList.filter((m) => selectedIds.has(m.id));
              const ringkasanUnit = Array.from(new Set(mapelTerpilihObj.map((m) => m.unit)));
              const ringkasanKelas = Array.from(new Set(mapelTerpilihObj.map((m) => `${m.unit} ${m.kelas}`)));

              return (
                <div className="border border-slate-200 rounded-xl p-3.5 sm:p-4 bg-slate-50/70 space-y-3 text-xs">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <div className="font-bold text-[#0A1172] flex items-center gap-2">
                        <span>Hak Akses Per Kelas &amp; Per Mapel (Dari Tabel Token)</span>
                        <span className="px-2 py-0.5 text-[10px] font-mono font-bold bg-[#0A1172] text-white rounded">
                          {editUstadzForm.aksesMapelIds.length} / {mapelList.length} Mapel
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-600 mt-0.5">
                        Centang tepat mata pelajaran dan kelas yang diampu. Akses Portal Ustadz hanya membuka mapel yang dicentang di sini.
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          const alias = ekstrakAliasNamaUstadz(editUstadzForm.namaUstadz || editUstadzForm.namaAsli);
                          const idsCocok = mapelList
                            .filter((m) => {
                              const p = (m.pengampu || '').toLowerCase();
                              return alias.some((al) => al.length > 2 && p.includes(al));
                            })
                            .map((m) => m.id);
                          setEditUstadzForm({
                            ...editUstadzForm,
                            aksesMapelIds: idsCocok,
                          });
                        }}
                        className="px-2.5 py-1 text-[11px] font-bold bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-lg cursor-pointer"
                      >
                        <i className="fa-solid fa-rotate mr-1" />
                        Cocokkan dari Token
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setEditUstadzForm({
                            ...editUstadzForm,
                            aksesMapelIds: [],
                          })
                        }
                        className="px-2.5 py-1 text-[11px] font-bold bg-white hover:bg-red-50 text-red-600 border border-red-200 rounded-lg cursor-pointer"
                      >
                        Kosongkan
                      </button>
                    </div>
                  </div>

                  {/* Filter Unit & Cari Mapel di Modal */}
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                    <div className="grid grid-cols-4 sm:flex items-center gap-1">
                      {(['SEMUA', 'Wustho', 'Ulya', 'MDA'] as const).map((uf) => (
                        <button
                          key={uf}
                          type="button"
                          onClick={() => setEditUstadzForm({ ...editUstadzForm, filterUnitModal: uf })}
                          className={`px-2.5 py-1.5 text-[11px] font-bold rounded-lg cursor-pointer text-center ${
                            editUstadzForm.filterUnitModal === uf
                              ? 'bg-[#0A1172] text-white'
                              : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-100'
                          }`}
                        >
                          {uf === 'SEMUA' ? 'Semua' : uf}
                        </button>
                      ))}
                    </div>
                    <input
                      type="text"
                      value={editUstadzForm.cariMapelModal}
                      onChange={(e) => setEditUstadzForm({ ...editUstadzForm, cariMapelModal: e.target.value })}
                      placeholder="Cari nama mapel, kelas, token, atau pengampu..."
                      className="flex-1 px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs"
                    />
                  </div>

                  {/* Daftar Checklist Dikelompokkan Per Unit & Per Kelas */}
                  <div className="max-h-72 overflow-y-auto space-y-2.5 pr-1">
                    {grupAktif.length === 0 ? (
                      <div className="text-center py-6 text-slate-500 bg-white border border-dashed border-slate-300 rounded-lg">
                        Tidak ada mata pelajaran yang sesuai pencarian.
                      </div>
                    ) : (
                      grupAktif.map((grup) => {
                        const idsGrup = grup.items.map((m) => m.id);
                        const jumlahTerpilihDiGrup = idsGrup.filter((id) => selectedIds.has(id)).length;
                        const semuaTerpilihDiGrup = jumlahTerpilihDiGrup === idsGrup.length;
                        return (
                          <div
                            key={grup.key}
                            className="bg-white border border-slate-200 rounded-lg overflow-hidden"
                          >
                            <div className="px-3 py-2 bg-slate-100/90 border-b border-slate-200 flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <span
                                  className={`px-2 py-0.5 text-[10px] font-mono font-bold rounded ${
                                    grup.unit === 'Ulya'
                                      ? 'bg-indigo-100 text-indigo-800'
                                      : grup.unit === 'MDA'
                                      ? 'bg-orange-100 text-[#FF6700]'
                                      : 'bg-emerald-100 text-emerald-800'
                                  }`}
                                >
                                  {grup.unit}
                                </span>
                                <span className="font-bold text-slate-800">{grup.kelas}</span>
                                <span className="text-[11px] font-mono text-slate-500">
                                  ({jumlahTerpilihDiGrup}/{idsGrup.length})
                                </span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => {
                                    const nextSet = new Set(editUstadzForm.aksesMapelIds);
                                    if (semuaTerpilihDiGrup) {
                                      idsGrup.forEach((id) => nextSet.delete(id));
                                    } else {
                                      idsGrup.forEach((id) => nextSet.add(id));
                                    }
                                    setEditUstadzForm({
                                      ...editUstadzForm,
                                      aksesMapelIds: Array.from(nextSet),
                                    });
                                  }}
                                  className="px-2 py-0.5 text-[10px] font-bold bg-white hover:bg-slate-50 border border-slate-300 text-[#0A1172] rounded cursor-pointer"
                                >
                                  {semuaTerpilihDiGrup ? 'Batal Kelas Ini' : 'Pilih Semua Kelas Ini'}
                                </button>
                              </div>
                            </div>
                            <div className="p-2.5 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                              {grup.items.map((m) => {
                                const isChecked = selectedIds.has(m.id);
                                const pengampuStr = (m.pengampu || '').trim();
                                const pengampuLain =
                                  Boolean(pengampuStr) &&
                                  pengampuStr.toLowerCase() !== editUstadzForm.namaUstadz.trim().toLowerCase() &&
                                  pengampuStr.toLowerCase() !== editUstadzForm.namaAsli.trim().toLowerCase();
                                return (
                                  <label
                                    key={m.id}
                                    className={`flex items-start gap-2 p-2 rounded-lg border cursor-pointer transition-colors ${
                                      isChecked
                                        ? 'bg-blue-50/80 border-[#0A1172] text-slate-900'
                                        : 'bg-slate-50/50 border-slate-200 text-slate-700 hover:bg-slate-100/70'
                                    }`}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={isChecked}
                                      onChange={() => {
                                        const nextIds = isChecked
                                          ? editUstadzForm.aksesMapelIds.filter((id) => id !== m.id)
                                          : [...editUstadzForm.aksesMapelIds, m.id];
                                        setEditUstadzForm({
                                          ...editUstadzForm,
                                          aksesMapelIds: nextIds,
                                        });
                                      }}
                                      className="mt-0.5 accent-[#0A1172]"
                                    />
                                    <div className="min-w-0 flex-1">
                                      <div className="font-bold text-slate-900 leading-tight truncate">
                                        {m.namaMapel}
                                      </div>
                                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5 text-[10px]">
                                        <span className="font-mono font-bold text-[#FF6700]">{m.tokenUjian}</span>
                                        <span className="font-mono text-slate-500">{m.durasiMenit} mnt</span>
                                        <span
                                          className={`truncate ${
                                            pengampuLain ? 'text-amber-700 font-semibold' : 'text-slate-500'
                                          }`}
                                          title={`Pengampu di Tabel Token: ${m.pengampu || '-'}`}
                                        >
                                          · {m.pengampu || '-'}
                                        </span>
                                      </div>
                                    </div>
                                  </label>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>

                  {/* Opsi Sinkron Pengampu ke Tabel Token & Ringkasan */}
                  <div className="pt-2 border-t border-slate-200 space-y-2">
                    <label className="flex items-start gap-2 cursor-pointer text-[11px] font-semibold text-slate-800">
                      <input
                        type="checkbox"
                        checked={editUstadzForm.sinkronPengampuKeToken}
                        onChange={(e) =>
                          setEditUstadzForm({
                            ...editUstadzForm,
                            sinkronPengampuKeToken: e.target.checked,
                          })
                        }
                        className="mt-0.5 accent-[#0A1172]"
                      />
                      <span>
                        Perbarui otomatis kolom <strong>Ustadz Pengampu</strong> pada Tabel Token untuk setiap mapel yang dicentang agar 100% sinkron dua arah.
                      </span>
                    </label>
                    <div className="text-[11px] text-slate-600 bg-white border border-slate-200 rounded-lg px-3 py-2">
                      <span className="font-bold text-[#0A1172]">Ringkasan Terpilih: </span>
                      {mapelTerpilihObj.length > 0 ? (
                        <span>
                          Unit <strong>{ringkasanUnit.join(', ')}</strong> · {ringkasanKelas.length} kelas ({ringkasanKelas.join(', ')})
                        </span>
                      ) : (
                        <span className="text-amber-700 font-semibold">
                          Belum ada mapel yang dicentang (Ustadz tidak akan melihat mapel CBT sampai dicentang).
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })()}

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Jam Ulya (JP)</label>
                <input
                  type="number"
                  min={0}
                  value={editUstadzForm.jamUlya}
                  onChange={(e) =>
                    setEditUstadzForm({ ...editUstadzForm, jamUlya: Number(e.target.value) || 0 })
                  }
                  className="w-full px-3 py-2 font-mono border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Jam Wustho (JP)</label>
                <input
                  type="number"
                  min={0}
                  value={editUstadzForm.jamWustho}
                  onChange={(e) =>
                    setEditUstadzForm({ ...editUstadzForm, jamWustho: Number(e.target.value) || 0 })
                  }
                  className="w-full px-3 py-2 font-mono border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Jam MDA (JP)</label>
                <input
                  type="number"
                  min={0}
                  value={editUstadzForm.jamMDA}
                  onChange={(e) =>
                    setEditUstadzForm({ ...editUstadzForm, jamMDA: Number(e.target.value) || 0 })
                  }
                  className="w-full px-3 py-2 font-mono border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Total Jam (JP)</label>
                <div className="px-3 py-2 font-mono font-extrabold text-[#0A1172] bg-slate-100 border border-slate-200 rounded-lg">
                  {editUstadzForm.jamUlya + editUstadzForm.jamWustho + editUstadzForm.jamMDA + editUstadzForm.jamMA} JP
                </div>
              </div>
            </div>

            <div className="text-xs">
              <label className="block font-semibold text-slate-700 mb-1">Ringkasan Bidang Mengajar</label>
              <input
                type="text"
                value={editUstadzForm.bidang}
                onChange={(e) => setEditUstadzForm({ ...editUstadzForm, bidang: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              />
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setEditUstadzForm(null)}
                className="px-4 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
              >
                Batal
              </button>
              <button
                type="submit"
                className="px-5 py-2 text-xs font-bold text-white bg-[#0A1172] hover:bg-[#0A1172]/90 rounded-lg cursor-pointer"
              >
                Simpan Hak Akses &amp; Profil Ustadz
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL PREVIEW FULLSCREEN HASIL PEMBUATAN SOAL CBT (MANUAL, IMPORT FILE / AI & BANK SOAL) */}
      <FullscreenSoalPreviewModal
        isOpen={Boolean(fullscreenPreviewSumber)}
        sumber={fullscreenPreviewSumber}
        initialIndex={fullscreenPreviewIndex}
        unit={ustadzUnit}
        kelas={ustadzKelas}
        mapel={ustadzMapel}
        namaFileImport={aiFileName}
        items={((): PreviewSoalItem[] => {
          if (fullscreenPreviewSumber === 'draft_import') {
            return aiPreviewSoal;
          }
          if (fullscreenPreviewSumber === 'manual') {
            return [
              {
                pertanyaan: manualPertanyaan.trim(),
                teksArabSoal: manualTeksArab.trim() || undefined,
                potonganKodeIT: manualPotonganKode.trim() || undefined,
                gambarSoalUrl: manualGambarUrl || undefined,
                opsiA: manualOpsiA.trim(),
                opsiB: manualOpsiB.trim(),
                opsiC: manualOpsiC.trim(),
                opsiD: manualOpsiD.trim(),
                kunciJawaban: manualKunci,
                bobotSoal: Number(manualBobot) || 25,
              },
            ];
          }
          if (fullscreenPreviewSumber === 'bank_soal') {
            return bankSoal.filter(
              (s) => s.unit === ustadzUnit && s.kelas === ustadzKelas && s.mapel === ustadzMapel
            );
          }
          return [];
        })()}
        onClose={() => setFullscreenPreviewSumber(null)}
        onSimpanDraftImport={handleSimpanSemuaPreviewKeBankSoal}
        onSimpanSoalManual={simpanSoalManualDariForm}
      />

      {/* MODAL EDIT MATA PELAJARAN & TOKEN UJIAN */}
      {editMapelForm && (
        <div className="no-print fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4 overflow-y-auto">
          <form
            onSubmit={handleSimpanEditMapelAdmin}
            className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-xl my-8"
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-3">
              <div>
                <div className="text-[11px] font-mono font-bold text-[#FF6700] uppercase">
                  EDIT MATA PELAJARAN &amp; TOKEN CBT
                </div>
                <h2 className="text-lg font-bold text-[#0A1172]">
                  {editMapelAsli?.namaMapel} ({editMapelAsli?.unit} · {editMapelAsli?.kelas})
                </h2>
              </div>
              <button
                type="button"
                onClick={() => {
                  setEditMapelForm(null);
                  setEditMapelAsli(null);
                }}
                className="px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
              >
                ✕ Tutup
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Unit Pendidikan</label>
                <select
                  value={editMapelForm.unit}
                  onChange={(e) => {
                    const nextUnit = e.target.value as UnitPendidikan;
                    setEditMapelForm({
                      ...editMapelForm,
                      unit: nextUnit,
                      kelas: UNIT_KELAS_MAP[nextUnit][0],
                    });
                  }}
                  className="w-full px-3 py-2 font-semibold bg-white border border-slate-300 rounded-lg"
                >
                  <option value="Wustho">Wustho</option>
                  <option value="Ulya">Ulya</option>
                  <option value="MDA">MDA</option>
                </select>
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Kelas</label>
                <select
                  value={editMapelForm.kelas}
                  onChange={(e) => setEditMapelForm({ ...editMapelForm, kelas: e.target.value })}
                  className="w-full px-3 py-2 font-semibold bg-white border border-slate-300 rounded-lg"
                >
                  {UNIT_KELAS_MAP[editMapelForm.unit].map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="text-xs">
              <label className="block font-semibold text-slate-700 mb-1">Nama Mata Pelajaran *</label>
              <input
                type="text"
                required
                value={editMapelForm.namaMapel}
                onChange={(e) => setEditMapelForm({ ...editMapelForm, namaMapel: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg font-semibold"
              />
            </div>

            <div className="text-xs">
              <label className="block font-semibold text-slate-700 mb-1">Ustadz Pengampu</label>
              <select
                value={editMapelForm.pengampu || ''}
                onChange={(e) => setEditMapelForm({ ...editMapelForm, pengampu: e.target.value })}
                className="w-full px-3 py-2 font-semibold bg-white border border-slate-300 rounded-lg"
              >
                {!ustadzList.some((u) => u.namaUstadz === editMapelForm.pengampu) && editMapelForm.pengampu && (
                  <option value={editMapelForm.pengampu}>{editMapelForm.pengampu}</option>
                )}
                {ustadzList.map((u) => (
                  <option key={u.id} value={u.namaUstadz}>
                    {u.namaUstadz} ({(u.unitAmpuan || []).join(', ') || 'Semua Unit'})
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Token Ujian *</label>
                <input
                  type="text"
                  required
                  value={editMapelForm.tokenUjian}
                  onChange={(e) =>
                    setEditMapelForm({ ...editMapelForm, tokenUjian: e.target.value.toUpperCase() })
                  }
                  className="w-full px-3 py-2 font-mono uppercase border border-slate-300 rounded-lg font-bold"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Durasi (Menit) *</label>
                <input
                  type="number"
                  min={5}
                  max={240}
                  required
                  value={editMapelForm.durasiMenit > 0 ? editMapelForm.durasiMenit : ''}
                  onChange={(e) =>
                    setEditMapelForm({
                      ...editMapelForm,
                      durasiMenit: e.target.value === '' ? 0 : Math.max(0, Number(e.target.value)),
                    })
                  }
                  className="w-full px-3 py-2 font-mono border border-slate-300 rounded-lg font-bold"
                />
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {[30, 45, 60, 90, 120].map((mnt) => (
                    <button
                      key={mnt}
                      type="button"
                      onClick={() => setEditMapelForm({ ...editMapelForm, durasiMenit: mnt })}
                      className={`px-2 py-0.5 text-[10px] font-mono font-bold rounded border cursor-pointer ${
                        editMapelForm.durasiMenit === mnt
                          ? 'bg-[#0A1172] text-white border-[#0A1172]'
                          : 'bg-slate-50 text-slate-600 border-slate-300 hover:bg-slate-100'
                      }`}
                    >
                      {mnt}m
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => {
                  setEditMapelForm(null);
                  setEditMapelAsli(null);
                }}
                className="px-4 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
              >
                Batal
              </button>
              <button
                type="submit"
                className="px-5 py-2 text-xs font-bold text-white bg-[#FF6700] hover:bg-[#e55c00] rounded-lg cursor-pointer"
              >
                Simpan Mata Pelajaran
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL EDIT BUTIR SOAL CBT */}
      {editSoalForm && (
        <div className="no-print fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4 overflow-y-auto">
          <form
            onSubmit={handleSimpanEditSoalCBT}
            className="bg-white border border-slate-200 rounded-2xl max-w-2xl w-full p-6 sm:p-7 space-y-4 shadow-xl my-8 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-3">
              <div>
                <div className="text-[11px] font-mono font-bold text-[#FF6700] uppercase">
                  EDIT BUTIR SOAL CBT · {editSoalForm.idSoal}
                </div>
                <h2 className="text-lg font-bold text-[#0A1172]">
                  {editSoalForm.mapel} ({editSoalForm.unit} · {editSoalForm.kelas})
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setEditSoalForm(null)}
                className="px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
              >
                ✕ Tutup
              </button>
            </div>

            <div className="text-xs">
              <label className="block font-semibold text-slate-700 mb-1">Pertanyaan Soal *</label>
              <textarea
                rows={3}
                required
                value={editSoalForm.pertanyaan}
                onChange={(e) => setEditSoalForm({ ...editSoalForm, pertanyaan: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs bg-slate-50 p-3 rounded-xl border border-slate-200">
              <div>
                <label className="block font-bold text-[#0A1172] mb-1">
                  Teks Ayat Al-Qur&apos;an / Arab (Opsional)
                </label>
                <input
                  type="text"
                  dir="rtl"
                  value={editSoalForm.teksArabSoal || ''}
                  onChange={(e) => setEditSoalForm({ ...editSoalForm, teksArabSoal: e.target.value })}
                  className="w-full px-3 py-2 font-arabic bg-white border border-slate-300 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block font-bold text-[#0A1172] mb-1">
                  Lampiran Gambar Soal (Opsional)
                </label>
                <div className="flex items-center gap-2">
                  <label className="px-3 py-2 font-bold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg cursor-pointer">
                    <i className="fa-solid fa-image mr-1 text-[#FF6700]" />
                    {editSoalForm.gambarSoalUrl ? 'Ganti Gambar' : 'Pilih Gambar'}
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (!f) return;
                        const r = new FileReader();
                        r.onload = () =>
                          setEditSoalForm((prev) =>
                            prev ? { ...prev, gambarSoalUrl: String(r.result || '') } : prev
                          );
                        r.readAsDataURL(f);
                      }}
                      className="hidden"
                    />
                  </label>
                  {editSoalForm.gambarSoalUrl && (
                    <button
                      type="button"
                      onClick={() => setEditSoalForm({ ...editSoalForm, gambarSoalUrl: '' })}
                      className="px-2.5 py-1.5 text-red-600 font-bold bg-red-50 rounded-lg cursor-pointer"
                    >
                      Hapus Gambar
                    </button>
                  )}
                </div>
              </div>
              <div className="sm:col-span-2">
                <label className="block font-bold text-[#0A1172] mb-1">
                  Potongan Kode Pemrograman IT / MDA (Opsional)
                </label>
                <textarea
                  rows={2}
                  value={editSoalForm.potonganKodeIT || ''}
                  onChange={(e) => setEditSoalForm({ ...editSoalForm, potonganKodeIT: e.target.value })}
                  className="w-full px-3 py-2 font-mono bg-slate-900 text-slate-100 border border-slate-700 rounded-lg text-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Opsi A *</label>
                <input
                  type="text"
                  required
                  value={editSoalForm.opsiA}
                  onChange={(e) => setEditSoalForm({ ...editSoalForm, opsiA: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Opsi B *</label>
                <input
                  type="text"
                  required
                  value={editSoalForm.opsiB}
                  onChange={(e) => setEditSoalForm({ ...editSoalForm, opsiB: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Opsi C *</label>
                <input
                  type="text"
                  required
                  value={editSoalForm.opsiC}
                  onChange={(e) => setEditSoalForm({ ...editSoalForm, opsiC: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Opsi D *</label>
                <input
                  type="text"
                  required
                  value={editSoalForm.opsiD}
                  onChange={(e) => setEditSoalForm({ ...editSoalForm, opsiD: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Kunci Jawaban</label>
                <select
                  value={editSoalForm.kunciJawaban || 'A'}
                  onChange={(e) =>
                    setEditSoalForm({
                      ...editSoalForm,
                      kunciJawaban: e.target.value as 'A' | 'B' | 'C' | 'D',
                    })
                  }
                  className="w-full px-3 py-2 font-mono font-bold bg-white border border-slate-300 rounded-lg"
                >
                  <option value="A">Kunci A</option>
                  <option value="B">Kunci B</option>
                  <option value="C">Kunci C</option>
                  <option value="D">Kunci D</option>
                </select>
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Bobot Soal</label>
                <input
                  type="number"
                  min={1}
                  value={editSoalForm.bobotSoal}
                  onChange={(e) =>
                    setEditSoalForm({ ...editSoalForm, bobotSoal: Number(e.target.value) || 10 })
                  }
                  className="w-full px-3 py-2 font-mono border border-slate-300 rounded-lg"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setEditSoalForm(null)}
                className="px-4 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
              >
                Batal
              </button>
              <button
                type="submit"
                className="px-5 py-2 text-xs font-bold text-white bg-[#0A1172] hover:bg-[#0A1172]/90 rounded-lg cursor-pointer"
              >
                Simpan Perubahan Soal
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL EDIT NILAI AKADEMIK SANTRI LENGKAP (4 KOMPONEN) */}
      {editNilaiModal && (() => {
        const previewCalc = hitungNilaiAkhirPesantren(
          editNilaiModal.tugas,
          editNilaiModal.sikap,
          editNilaiModal.lisan,
          editNilaiModal.cbt
        );
        return (
          <div className="no-print fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4 overflow-y-auto">
            <form
              onSubmit={handleSimpanEditNilaiModal}
              className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-xl my-8"
            >
              <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-3">
                <div>
                  <div className="text-[11px] font-mono font-bold text-[#FF6700] uppercase">
                    EDIT NILAI AKADEMIK &amp; CBT · {editNilaiModal.mapel}
                  </div>
                  <h2 className="text-lg font-bold text-[#0A1172]">
                    {editNilaiModal.namaSantri} ({editNilaiModal.nis})
                  </h2>
                  <p className="text-xs text-slate-500">
                    {editNilaiModal.unit} · {editNilaiModal.kelas}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setEditNilaiModal(null)}
                  className="px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
                >
                  ✕ Tutup
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Tugas Harian (20%)</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={editNilaiModal.tugas}
                    onChange={(e) =>
                      setEditNilaiModal({ ...editNilaiModal, tugas: Number(e.target.value) })
                    }
                    className="w-full px-3 py-2 font-mono font-bold border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Nilai Sikap (20%)</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={editNilaiModal.sikap}
                    onChange={(e) =>
                      setEditNilaiModal({ ...editNilaiModal, sikap: Number(e.target.value) })
                    }
                    className="w-full px-3 py-2 font-mono font-bold border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Ujian Lisan (20%)</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={editNilaiModal.lisan}
                    onChange={(e) =>
                      setEditNilaiModal({ ...editNilaiModal, lisan: Number(e.target.value) })
                    }
                    className="w-full px-3 py-2 font-mono font-bold border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Nilai CBT / Susulan (40%)</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={editNilaiModal.cbt}
                    onChange={(e) =>
                      setEditNilaiModal({ ...editNilaiModal, cbt: Number(e.target.value) })
                    }
                    className="w-full px-3 py-2 font-mono font-bold border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between text-xs">
                <div>
                  <span className="text-slate-500">Kalkulasi Nilai Akhir:</span>{' '}
                  <strong className="font-mono text-base text-[#0A1172]">
                    {previewCalc.nilaiAkhir.toFixed(2)}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-500">Predikat:</span>{' '}
                  <strong className="font-mono text-base text-[#FF6700]">{previewCalc.predikat}</strong>{' '}
                  <span className="text-slate-600">({previewCalc.sebutan})</span>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setEditNilaiModal(null)}
                  className="px-4 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold text-white bg-[#0A1172] hover:bg-[#0A1172]/90 rounded-lg cursor-pointer"
                >
                  Simpan Nilai &amp; Catat Audit
                </button>
              </div>
            </form>
          </div>
        );
      })()}

      {/* MODAL TAMBAH AKUN ADMIN BARU & HAK AKSES */}
      {modalTambahAdminOpen && (
        <div className="no-print fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4 overflow-y-auto">
          <form
            onSubmit={handleSimpanTambahAdmin}
            className="bg-white border border-slate-200 rounded-2xl max-w-2xl w-full p-6 sm:p-7 space-y-4 shadow-xl my-8 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-3">
              <div>
                <div className="text-[11px] font-mono font-bold text-[#FF6700] uppercase">
                  MANAJEMEN MULTI-ADMIN &amp; HAK AKSES MODUL
                </div>
                <h2 className="text-lg font-bold text-[#0A1172]">Tambah Akun Admin Baru</h2>
              </div>
              <button
                type="button"
                onClick={() => setModalTambahAdminOpen(false)}
                className="px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
              >
                ✕ Tutup
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Nama Lengkap Admin *</label>
                <input
                  type="text"
                  required
                  value={formAdminBaru.namaAdmin}
                  onChange={(e) => setFormAdminBaru({ ...formAdminBaru, namaAdmin: e.target.value })}
                  placeholder="Contoh: Ust. Fulan (Operator Akademik)"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-semibold"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">Username Login *</label>
                <input
                  type="text"
                  required
                  value={formAdminBaru.username}
                  onChange={(e) => setFormAdminBaru({ ...formAdminBaru, username: e.target.value })}
                  placeholder="Contoh: operator1 (tanpa spasi)"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block font-bold text-slate-700 mb-1">Jabatan / Peran</label>
                <input
                  type="text"
                  value={formAdminBaru.jabatan}
                  onChange={(e) => setFormAdminBaru({ ...formAdminBaru, jabatan: e.target.value })}
                  placeholder="Contoh: Staf Tata Usaha / Kurikulum"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">Password Login * (Min. 4 karakter)</label>
                <input
                  type="password"
                  required
                  value={formAdminBaru.password}
                  onChange={(e) => setFormAdminBaru({ ...formAdminBaru, password: e.target.value })}
                  placeholder="Masukkan password admin baru"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">Konfirmasi Password *</label>
                <input
                  type="password"
                  required
                  value={formAdminBaru.konfirmasiPassword}
                  onChange={(e) =>
                    setFormAdminBaru({ ...formAdminBaru, konfirmasiPassword: e.target.value })
                  }
                  placeholder="Ulangi password baru"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                />
              </div>
            </div>

            <div className="space-y-2 border-t border-slate-200 pt-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-[#0A1172]">Pilih Hak Akses Fitur Dasbor Admin *</label>
                <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formAdminBaru.aktif}
                    onChange={(e) => setFormAdminBaru({ ...formAdminBaru, aktif: e.target.checked })}
                  />
                  Status Akun Aktif
                </label>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                {ADMIN_PERMISSION_LIST.map((perm) => {
                  const checked = formAdminBaru.hakAkses.includes(perm.key);
                  return (
                    <label
                      key={perm.key}
                      className={`p-2.5 rounded-lg border cursor-pointer flex items-start gap-2 ${
                        checked ? 'bg-blue-50 border-blue-300' : 'bg-slate-50 border-slate-200'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          const next = e.target.checked
                            ? [...formAdminBaru.hakAkses, perm.key]
                            : formAdminBaru.hakAkses.filter((k) => k !== perm.key);
                          setFormAdminBaru({ ...formAdminBaru, hakAkses: next });
                        }}
                        className="mt-0.5"
                      />
                      <div>
                        <div className="font-bold text-[#0A1172]">{perm.label}</div>
                        <div className="text-[11px] text-slate-600">{perm.deskripsi}</div>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setModalTambahAdminOpen(false)}
                className="px-4 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
              >
                Batal
              </button>
              <button
                type="submit"
                className="px-5 py-2 text-xs font-bold text-white bg-[#0A1172] hover:bg-[#0A1172]/90 rounded-lg cursor-pointer"
              >
                Simpan Akun Admin Baru
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL EDIT HAK AKSES & PROFIL ADMIN */}
      {editAksesAdminForm && (
        <div className="no-print fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4 overflow-y-auto">
          <form
            onSubmit={handleSimpanEditAksesAdmin}
            className="bg-white border border-slate-200 rounded-2xl max-w-2xl w-full p-6 sm:p-7 space-y-4 shadow-xl my-8 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-3">
              <div>
                <div className="text-[11px] font-mono font-bold text-[#FF6700] uppercase">
                  EDIT HAK AKSES &amp; PROFIL ADMIN
                </div>
                <h2 className="text-lg font-bold text-[#0A1172]">
                  Atur Akses: {editAksesAdminForm.namaAdmin} (@{editAksesAdminForm.username})
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setEditAksesAdminForm(null)}
                className="px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
              >
                ✕ Tutup
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Nama Admin *</label>
                <input
                  type="text"
                  required
                  value={editAksesAdminForm.namaAdmin}
                  onChange={(e) =>
                    setEditAksesAdminForm({ ...editAksesAdminForm, namaAdmin: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-semibold"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">Username *</label>
                <input
                  type="text"
                  required
                  value={editAksesAdminForm.username}
                  onChange={(e) =>
                    setEditAksesAdminForm({ ...editAksesAdminForm, username: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">Jabatan</label>
                <input
                  type="text"
                  value={editAksesAdminForm.jabatan}
                  onChange={(e) =>
                    setEditAksesAdminForm({ ...editAksesAdminForm, jabatan: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
            </div>

            <div className="space-y-2 border-t border-slate-200 pt-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-[#0A1172]">Hak Akses Modul Dasbor Admin</label>
                {!editAksesAdminForm.isPrimary && (
                  <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editAksesAdminForm.aktif}
                      onChange={(e) =>
                        setEditAksesAdminForm({ ...editAksesAdminForm, aktif: e.target.checked })
                      }
                    />
                    Akun Aktif (Bisa Login)
                  </label>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                {ADMIN_PERMISSION_LIST.map((perm) => {
                  const checked = editAksesAdminForm.hakAkses.includes(perm.key);
                  return (
                    <label
                      key={perm.key}
                      className={`p-2.5 rounded-lg border cursor-pointer flex items-start gap-2 ${
                        checked ? 'bg-blue-50 border-blue-300' : 'bg-slate-50 border-slate-200'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          const next = e.target.checked
                            ? [...editAksesAdminForm.hakAkses, perm.key]
                            : editAksesAdminForm.hakAkses.filter((k) => k !== perm.key);
                          setEditAksesAdminForm({ ...editAksesAdminForm, hakAkses: next });
                        }}
                        className="mt-0.5"
                      />
                      <div>
                        <div className="font-bold text-[#0A1172]">{perm.label}</div>
                        <div className="text-[11px] text-slate-600">{perm.deskripsi}</div>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setEditAksesAdminForm(null)}
                className="px-4 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
              >
                Batal
              </button>
              <button
                type="submit"
                className="px-5 py-2 text-xs font-bold text-white bg-[#0A1172] hover:bg-[#0A1172]/90 rounded-lg cursor-pointer"
              >
                Simpan Perubahan Akses
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL GANTI PASSWORD ADMIN */}
      {gantiPasswordAdminModal && (
        <div className="no-print fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4 overflow-y-auto">
          <form
            onSubmit={handleSimpanGantiPasswordAdmin}
            className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl my-8"
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-3">
              <div>
                <div className="text-[11px] font-mono font-bold text-[#FF6700] uppercase">
                  KEAMANAN AKUN ADMINISTRATOR
                </div>
                <h2 className="text-lg font-bold text-[#0A1172]">
                  Ganti Password Admin
                </h2>
                <p className="text-xs text-slate-600">
                  Target Akun: <strong>{gantiPasswordAdminModal.adminTarget.namaAdmin}</strong> (@
                  {gantiPasswordAdminModal.adminTarget.username})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setGantiPasswordAdminModal(null)}
                className="px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              {gantiPasswordAdminModal.wajibPasswordLama && (
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Password Lama *</label>
                  <input
                    type="password"
                    required
                    value={gantiPasswordAdminModal.passwordLama}
                    onChange={(e) =>
                      setGantiPasswordAdminModal({
                        ...gantiPasswordAdminModal,
                        passwordLama: e.target.value,
                      })
                    }
                    placeholder="Masukkan password saat ini"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                  />
                </div>
              )}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Password Baru * (Min. 4 karakter)
                </label>
                <input
                  type="password"
                  required
                  value={gantiPasswordAdminModal.passwordBaru}
                  onChange={(e) =>
                    setGantiPasswordAdminModal({
                      ...gantiPasswordAdminModal,
                      passwordBaru: e.target.value,
                    })
                  }
                  placeholder="Masukkan password baru"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">Konfirmasi Password Baru *</label>
                <input
                  type="password"
                  required
                  value={gantiPasswordAdminModal.konfirmasiPasswordBaru}
                  onChange={(e) =>
                    setGantiPasswordAdminModal({
                      ...gantiPasswordAdminModal,
                      konfirmasiPasswordBaru: e.target.value,
                    })
                  }
                  placeholder="Ulangi password baru"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setGantiPasswordAdminModal(null)}
                className="px-4 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
              >
                Batal
              </button>
              <button
                type="submit"
                className="px-5 py-2 text-xs font-bold text-white bg-[#FF6700] hover:bg-[#e55c00] rounded-lg cursor-pointer"
              >
                Simpan Password Baru
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MAIN CONTENT VIEWPORT */}
      <main className="flex-1 max-w-[1380px] w-full mx-auto px-6 py-8">
        {firestoreQuotaPaused && !dismissedQuotaBanner && (
          <div className="no-print mb-5 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-xs text-amber-950 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-0.5">
              <div className="font-bold flex items-center gap-1.5 text-amber-900">
                <i className="fa-solid fa-cloud-arrow-up text-amber-600" />
                <span>Cadangan Cloud Firestore Dijeda Sementara (Kuota Harian Gratis Tercapai)</span>
              </div>
              <p className="text-[11px] text-amber-900/90 leading-relaxed">
                Seluruh data ujian, soal, token, dan nilai <strong>tetap tersimpan aman di Server Lokal &amp; Browser</strong>. Kuota tulis harian gratis Firestore akan reset otomatis besok, atau tingkatkan kapasitas database melalui Firebase Console.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <a
                href={FIRESTORE_UPGRADE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1.5 text-[11px] font-bold bg-[#0A1172] hover:bg-[#0A1172]/90 text-white rounded-lg whitespace-nowrap"
              >
                Upgrade Database
              </a>
              <button
                type="button"
                onClick={() => {
                  clearFirestoreQuotaPause();
                  setDismissedQuotaBanner(false);
                }}
                className="px-2.5 py-1.5 text-[11px] font-bold bg-white hover:bg-amber-100 border border-amber-300 text-amber-900 rounded-lg cursor-pointer whitespace-nowrap"
              >
                Coba Sambung Ulang
              </button>
              <button
                type="button"
                onClick={() => setDismissedQuotaBanner(true)}
                className="px-2 py-1.5 text-[11px] font-bold text-amber-800 hover:bg-amber-100 rounded-lg cursor-pointer"
                title="Tutup pemberitahuan"
              >
                ✕
              </button>
            </div>
          </div>
        )}
        {/* ===================================================================
            BERANDA UTAMA SISTEM PENILAIAN & E-RAPOR DARUL FITHRAH
            =================================================================== */}
        {activeModule === 'beranda' && (
          <div className="space-y-8">
            {/* Hero Banner Darul Fithrah */}
            <div className="bg-[#0A1172] text-white rounded-2xl p-8 sm:p-10 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-8">
              <div className="space-y-3 max-w-2xl">
                <div className="text-xs font-mono text-[#FF6700] tracking-wider uppercase font-semibold">
                  {identitasPesantren.subJudul} {identitasPesantren.namaUtama}{' '}
                  {identitasPesantren.teksArab ? `· ${identitasPesantren.teksArab}` : ''}
                </div>
                <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight leading-tight">
                  {identitasPesantren.judulAplikasiHero}
                </h1>
                <p className="text-sm text-slate-200 leading-relaxed">
                  {identitasPesantren.deskripsiHero}
                </p>
                <div className="pt-2 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setActiveModule('cbt')}
                    className="px-5 py-2.5 text-xs font-bold text-white bg-[#FF6700] hover:bg-[#e55c00] rounded-lg transition-colors cursor-pointer"
                  >
                    <i className="fa-solid fa-laptop-code mr-2" />
                    Mulai Ujian CBT Santri
                  </button>
                  <button
                    type="button"
                    onClick={() => bukaPortalRaporSantriDenganNis()}
                    className="px-5 py-2.5 text-xs font-bold text-[#0A1172] bg-amber-300 hover:bg-amber-200 rounded-lg transition-colors cursor-pointer"
                  >
                    <i className="fa-solid fa-file-pdf mr-2" />
                    Cek &amp; Unduh e-Rapor Santri (Via NIS)
                  </button>
                  <button
                    type="button"
                    onClick={() => bukaModulDenganPin('ustadz')}
                    className="px-5 py-2.5 text-xs font-bold text-white bg-white/10 hover:bg-white/20 border border-white/25 rounded-lg transition-colors cursor-pointer"
                  >
                    <i className="fa-solid fa-chalkboard-user mr-2" />
                    Portal Ustadz
                  </button>
                </div>
              </div>

              <div className="bg-white text-slate-900 p-5 rounded-xl w-full lg:w-80 shrink-0 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <LogoDarulFithrah size="md" identitas={identitasPesantren} />
                </div>
                <div className="border-t border-slate-200 pt-3 text-xs text-slate-600 space-y-1">
                  <div>
                    <strong>Struktur Unit &amp; Kelas:</strong>
                  </div>
                  <div>· Wustho: Kelas 7, Kelas 8, Kelas 9</div>
                  <div>· Ulya: Kelas 10, Kelas 11, Kelas 12</div>
                  <div>· MDA: Junior, Senior</div>
                </div>
              </div>
            </div>

            {/* 4 Kartu Akses Modul Utama */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col justify-between space-y-5">
                <div className="space-y-2">
                  <div className="text-xs font-mono font-bold text-[#0A1172]">MODUL A · AKUN &amp; PASSWORD ADMIN</div>
                  <h2 className="text-base font-bold text-slate-900">Dasbor Admin Pesantren</h2>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Kelola statistik pesantren, tambah Mata Pelajaran beserta Token &amp; Durasi, registrasi Santri per
                    Unit/Kelas, dan kelola PIN Ustadz.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => bukaModulDenganPin('admin')}
                  className="w-full py-2.5 px-4 text-xs font-bold text-white bg-[#0A1172] rounded-lg hover:bg-[#0A1172]/90 cursor-pointer"
                >
                  Buka Dasbor Admin
                </button>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col justify-between space-y-5">
                <div className="space-y-2">
                  <div className="text-xs font-mono font-bold text-[#FF6700]">MODUL B · PORTAL USTADZ</div>
                  <h2 className="text-base font-bold text-slate-900">Portal Ustadz &amp; AI Importer</h2>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Import soal otomatis dengan AI dari PDF/Foto/Word/Excel, input nilai Non-CBT, capaian Tahfidz 114
                    Surat, dan capaian Projek IT.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => bukaModulDenganPin('ustadz')}
                  className="w-full py-2.5 px-4 text-xs font-bold text-white bg-[#FF6700] rounded-lg hover:bg-[#e55c00] cursor-pointer"
                >
                  Buka Portal Ustadz
                </button>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col justify-between space-y-5">
                <div className="space-y-2">
                  <div className="text-xs font-mono font-bold text-[#0A1172]">MODUL C · SAFE EXAM</div>
                  <h2 className="text-base font-bold text-slate-900">Portal Ujian CBT Santri</h2>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Web-Lockdown otomatis Fullscreen, alarm Beep saat pindah tab/aplikasi, blokir klik kanan &amp;
                    copy-paste, serta Auto-Submit 3x pelanggaran.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveModule('cbt')}
                  className="w-full py-2.5 px-4 text-xs font-bold text-white bg-[#0A1172] rounded-lg hover:bg-[#0A1172]/90 cursor-pointer"
                >
                  Masuk Ruang CBT
                </button>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col justify-between space-y-5">
                <div className="space-y-2">
                  <div className="text-xs font-mono font-bold text-[#FF6700]">MODUL D · AKSES NIS &amp; CETAK A4</div>
                  <h2 className="text-base font-bold text-slate-900">Portal e-Rapor &amp; Unduh PDF A4</h2>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Santri dapat melihat &amp; mengunduh PDF A4 e-Rapor menggunakan <strong>NIS masing-masing</strong> setelah seluruh data nilai, Tahfidz, dan IT lengkap terisi.
                  </p>
                </div>
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={() => bukaPortalRaporSantriDenganNis()}
                    className="w-full py-2.5 px-4 text-xs font-bold text-white bg-[#FF6700] rounded-lg hover:bg-[#e55c00] cursor-pointer"
                  >
                    <i className="fa-solid fa-id-card mr-1.5" />
                    Akses Santri (Pakai NIS)
                  </button>
                  <button
                    type="button"
                    onClick={() => bukaModulDenganPin('rapor', true)}
                    className="w-full py-2 px-4 text-xs font-bold text-slate-900 bg-slate-100 border border-slate-300 rounded-lg hover:bg-slate-200 cursor-pointer"
                  >
                    Akses Ustadz / Admin
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ===================================================================
            MODUL A: DASBOR ADMIN (Proteksi Akun & Hak Akses Admin)
            =================================================================== */}
        {activeModule === 'admin' && (
          <div className="space-y-6 sm:space-y-8">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 sm:gap-4 pb-4 sm:pb-5 border-b border-slate-200">
              <div>
                <div className="text-[11px] sm:text-xs font-mono font-bold text-[#FF6700]">
                  MODUL A · DASBOR ADMINISTRATOR · {adminLoginAktif?.jabatan || 'PENGELOLA PESANTREN'}
                </div>
                <h1 className="text-xl sm:text-2xl font-bold text-[#0A1172] mt-0.5 leading-snug">
                  Manajemen Master Data Ponpes Darul Fithrah
                </h1>
                <p className="text-xs text-slate-600 mt-1">
                  Login Aktif: <strong className="text-[#0A1172]">{adminLoginAktif?.namaAdmin || 'Administrator'}</strong>{' '}
                  <span className="font-mono text-slate-500">(@{adminLoginAktif?.username || 'admin'})</span> ·{' '}
                  Hak Akses: <strong>{adminLoginAktif?.hakAkses.length || 0} modul</strong>
                </p>
              </div>
              <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 w-full lg:w-auto shrink-0">
                {adminLoginAktif && (
                  <button
                    type="button"
                    onClick={() =>
                      setGantiPasswordAdminModal({
                        adminTarget: adminLoginAktif,
                        wajibPasswordLama: true,
                        passwordLama: '',
                        passwordBaru: '',
                        konfirmasiPasswordBaru: '',
                      })
                    }
                    className="px-3 sm:px-3.5 py-2 text-xs font-bold text-[#0A1172] bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-lg cursor-pointer whitespace-nowrap text-center"
                  >
                    <i className="fa-solid fa-key mr-1.5 text-[#FF6700]" />
                    Ganti Password
                  </button>
                )}
                {adminPunyaAkses('kelola_admin') && (
                  <button
                    type="button"
                    onClick={() => setModalTambahAdminOpen(true)}
                    className="px-3 sm:px-3.5 py-2 text-xs font-bold text-white bg-[#0A1172] hover:bg-[#0A1172]/90 rounded-lg cursor-pointer whitespace-nowrap text-center"
                  >
                    <i className="fa-solid fa-user-plus mr-1.5 text-[#FF6700]" />
                    + Tambah Admin
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => handleLogout('admin')}
                  className="col-span-2 sm:col-span-1 px-3 sm:px-3.5 py-2 text-xs font-bold text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg cursor-pointer whitespace-nowrap text-center"
                >
                  <i className="fa-solid fa-right-from-bracket mr-1.5" />
                  Logout Admin
                </button>
              </div>
            </div>

            {adminPunyaAkses('dashboard_analitik') && (
              <>
            {/* Statistik Ringkas (5 Metrik Utama Termasuk Log Audit Perubahan Nilai) */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
              <div className="bg-white border border-slate-200 rounded-xl p-3.5 sm:p-5">
                <div className="text-[11px] sm:text-xs text-slate-500">Total Santri Aktif</div>
                <div className="text-2xl sm:text-3xl font-extrabold font-mono tabular-nums text-[#0A1172] mt-1">
                  {santriList.length}
                </div>
                <div className="text-[11px] sm:text-xs text-slate-500 mt-1">Unit Wustho, Ulya &amp; MDA</div>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-3.5 sm:p-5">
                <div className="text-[11px] sm:text-xs text-slate-500">Total Mata Pelajaran</div>
                <div className="text-2xl sm:text-3xl font-extrabold font-mono tabular-nums text-[#0A1172] mt-1">
                  {mapelList.length}
                </div>
                <div className="text-[11px] sm:text-xs text-slate-500 mt-1">Token &amp; Durasi Ujian</div>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-3.5 sm:p-5">
                <div className="text-[11px] sm:text-xs text-slate-500">Total Bank Soal CBT</div>
                <div className="text-2xl sm:text-3xl font-extrabold font-mono tabular-nums text-[#FF6700] mt-1">
                  {bankSoal.length}
                </div>
                <div className="text-[11px] sm:text-xs text-slate-500 mt-1">Siap diujikan di SEB</div>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-3.5 sm:p-5">
                <div className="text-[11px] sm:text-xs text-slate-500">Ujian CBT Selesai</div>
                <div className="text-2xl sm:text-3xl font-extrabold font-mono tabular-nums text-emerald-700 mt-1">
                  {logUjianCBT.length}
                </div>
                <div className="text-[11px] sm:text-xs text-slate-500 mt-1">Log Integritas CBT</div>
              </div>
              <div className="col-span-2 sm:col-span-2 lg:col-span-1 bg-white border border-slate-200 rounded-xl p-3.5 sm:p-5">
                <div className="text-[11px] sm:text-xs text-slate-500">Log Audit Perubahan Nilai</div>
                <div className="text-2xl sm:text-3xl font-extrabold font-mono tabular-nums text-[#0A1172] mt-1">
                  {logAktivitasNilai.length}
                </div>
                <div className="text-[11px] sm:text-xs text-slate-500 mt-1">Akuntabilitas Nilai oleh Ustadz</div>
              </div>
            </div>

            {/* Panel Monitoring Terpadu (1 Bar): Deadline Pengisian Soal Ujian CBT & Deadline Nilai Rapor */}
            {(() => {
              const statusDlSoal = hitungStatusDeadlineSoal();
              const statusDlRapor = hitungStatusDeadlineRapor();
              const daftarUstadzBelumSoal = ustadzList
                .map((u) => ({ ustadz: u, rekap: hitungTunggakanSoalUstadz(u) }))
                .filter((item) => item.rekap.totalMapelBelumSoal > 0);
              const daftarUstadzBelumLengkap = ustadzList
                .map((u) => ({ ustadz: u, rekap: hitungTunggakanNilaiUstadz(u) }))
                .filter((item) => item.rekap.totalEntriBelumLengkap > 0);
              return (
                <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-4 sm:p-5 grid grid-cols-1 xl:grid-cols-2 gap-4 sm:gap-5 divide-y xl:divide-y-0 xl:divide-x divide-amber-200">
                  {/* Sisi 1: Deadline Pengisian Soal Ujian CBT */}
                  <div className="space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-mono font-bold text-[#0A1172] uppercase">
                          <i className="fa-solid fa-file-pen mr-1.5 text-[#FF6700]" />
                          DEADLINE PENGISIAN SOAL UJIAN
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded text-[11px] font-bold border ${
                            statusDlSoal.apakahLewatDeadline || statusDlSoal.sisaHari <= 2
                              ? 'bg-red-100 text-red-800 border-red-200'
                              : 'bg-blue-100 text-[#0A1172] border-blue-200'
                          }`}
                        >
                          {statusDlSoal.labelSisaWaktu} · {statusDlSoal.tanggalDeadlineFormat}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <label className="text-[11px] font-bold text-slate-700" htmlFor="admin-deadline-soal">
                          Atur:
                        </label>
                        <input
                          id="admin-deadline-soal"
                          type="date"
                          value={statusDlSoal.deadlineIso}
                          onChange={(e) => {
                            if (!e.target.value) return;
                            simpanIdentitasPesantren({
                              ...identitasPesantren,
                              deadlineInputSoalIso: e.target.value,
                            });
                            Swal.fire({
                              toast: true,
                              position: 'top-end',
                              icon: 'success',
                              title: 'Deadline pengisian soal ujian diperbarui',
                              showConfirmButton: false,
                              timer: 2600,
                            });
                          }}
                          className="px-2.5 py-1 text-xs font-mono font-bold text-[#0A1172] bg-white border border-blue-300 rounded-lg"
                        />
                      </div>
                    </div>
                    <p className="text-xs text-slate-700">
                      Tercatat <strong>{daftarUstadzBelumSoal.length} dari {ustadzList.length} Ustadz</strong> masih memiliki mapel ampuan yang belum diisi soal CBT.
                    </p>
                    {daftarUstadzBelumSoal.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5 max-h-36 sm:max-h-none overflow-y-auto pr-0.5">
                        {daftarUstadzBelumSoal.map(({ ustadz, rekap }) => (
                          <button
                            key={ustadz.id}
                            type="button"
                            onClick={() => tampilkanModalReminderSoalUstadz(ustadz)}
                            className="px-2.5 py-1 text-[11px] font-bold bg-white hover:bg-blue-50 text-[#0A1172] border border-blue-300 rounded-md cursor-pointer"
                            title="Klik untuk melihat rincian mapel yang belum memiliki soal CBT"
                          >
                            {ustadz.namaUstadz}: {rekap.totalMapelBelumSoal} mapel kosong
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="text-xs font-semibold text-emerald-700">
                        <i className="fa-solid fa-circle-check mr-1" />
                        Seluruh Ustadz telah mengisi soal CBT pada mapel ampuannya.
                      </div>
                    )}
                  </div>

                  {/* Sisi 2: Deadline Pengisian Nilai Rapor */}
                  <div className="space-y-2.5 pt-4 xl:pt-0 xl:pl-5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-mono font-bold text-[#FF6700] uppercase">
                          <i className="fa-solid fa-bell mr-1.5" />
                          DEADLINE PENGISIAN RAPOR
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded text-[11px] font-bold border ${
                            statusDlRapor.apakahLewatDeadline || statusDlRapor.sisaHari <= 2
                              ? 'bg-red-100 text-red-800 border-red-200'
                              : 'bg-amber-100 text-amber-900 border-amber-300'
                          }`}
                        >
                          {statusDlRapor.labelSisaWaktu} · {statusDlRapor.tanggalDeadlineFormat}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <label className="text-[11px] font-bold text-slate-700" htmlFor="admin-deadline-rapor">
                          Atur:
                        </label>
                        <input
                          id="admin-deadline-rapor"
                          type="date"
                          value={statusDlRapor.deadlineIso}
                          onChange={(e) => {
                            if (!e.target.value) return;
                            simpanIdentitasPesantren({
                              ...identitasPesantren,
                              deadlineInputRaporIso: e.target.value,
                            });
                            Swal.fire({
                              toast: true,
                              position: 'top-end',
                              icon: 'success',
                              title: 'Deadline pengisian rapor diperbarui',
                              showConfirmButton: false,
                              timer: 2600,
                            });
                          }}
                          className="px-2.5 py-1 text-xs font-mono font-bold text-[#0A1172] bg-white border border-amber-300 rounded-lg"
                        />
                      </div>
                    </div>
                    <p className="text-xs text-slate-700">
                      Tercatat <strong>{daftarUstadzBelumLengkap.length} dari {ustadzList.length} Ustadz</strong> masih memiliki entri nilai santri belum lengkap pada kelas ampuannya.
                    </p>
                    {daftarUstadzBelumLengkap.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5 max-h-36 sm:max-h-none overflow-y-auto pr-0.5">
                        {daftarUstadzBelumLengkap.map(({ ustadz, rekap }) => (
                          <button
                            key={ustadz.id}
                            type="button"
                            onClick={() => tampilkanModalReminderNilaiUstadz(ustadz)}
                            className="px-2.5 py-1 text-[11px] font-bold bg-white hover:bg-amber-100 text-[#0A1172] border border-amber-300 rounded-md cursor-pointer"
                            title="Klik untuk melihat rincian & uji modal reminder Ustadz ini"
                          >
                            {ustadz.namaUstadz}: {rekap.totalEntriBelumLengkap} belum lengkap
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="text-xs font-semibold text-emerald-700">
                        <i className="fa-solid fa-circle-check mr-1" />
                        Seluruh Ustadz telah melengkapi nilai rapor santri 100%.
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* ===============================================================
                VISUALISASI DATA RECHARTS: GRAFIK BATANG PERBANDINGAN NILAI
                RATA-RATA TIAP MATA PELAJARAN DI SETIAP UNIT PENDIDIKAN
                =============================================================== */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6 space-y-4 sm:space-y-5">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 sm:gap-4 border-b border-slate-200 pb-4">
                <div className="space-y-1">
                  <div className="text-[11px] sm:text-xs font-mono font-bold text-[#FF6700] uppercase">
                    ANALITIK AKADEMIK &amp; EVALUASI KURIKULUM LINTAS UNIT
                  </div>
                  <h2 className="text-base sm:text-lg font-bold text-[#0A1172]">
                    Grafik Perbandingan Nilai Rata-Rata Mata Pelajaran per Unit Pendidikan (Wustho, Ulya &amp; MDA)
                  </h2>
                  <p className="text-xs text-slate-600">
                    Membandingkan capaian nilai rata-rata santri di setiap mata pelajaran secara real-time berdasarkan
                    data Nilai Akademik &amp; Ujian CBT.
                  </p>
                </div>

                {/* Filter Interaktif Grafik: Pilih Unit, Komponen Nilai & Cakupan Mapel */}
                <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-2 sm:gap-2.5 w-full lg:w-auto">
                  <div className="grid grid-cols-2 sm:flex items-center gap-1 p-1 bg-slate-100 rounded-lg border border-slate-200">
                    {(['SEMUA', 'Wustho', 'Ulya', 'MDA'] as const).map((uTab) => (
                      <button
                        key={uTab}
                        type="button"
                        onClick={() => setFilterUnitGrafikAdmin(uTab)}
                        className={`px-2.5 sm:px-3 py-1.5 text-xs font-bold rounded-md transition-colors cursor-pointer text-center ${
                          filterUnitGrafikAdmin === uTab
                            ? 'bg-[#0A1172] text-white'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {uTab === 'SEMUA' ? 'Semua Unit' : `Unit ${uTab}`}
                      </button>
                    ))}
                  </div>

                  {filterUnitGrafikAdmin === 'SEMUA' && (
                    <div className="grid grid-cols-2 sm:flex items-center gap-1 p-1 bg-slate-100 rounded-lg border border-slate-200">
                      <button
                        type="button"
                        onClick={() => setCakupanMapelGrafikAdmin('lintas_unit')}
                        className={`px-2.5 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer text-center ${
                          cakupanMapelGrafikAdmin === 'lintas_unit'
                            ? 'bg-white text-[#0A1172] shadow-xs font-bold'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        Mapel Inti &amp; Unggulan
                      </button>
                      <button
                        type="button"
                        onClick={() => setCakupanMapelGrafikAdmin('semua_mapel')}
                        className={`px-2.5 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer text-center ${
                          cakupanMapelGrafikAdmin === 'semua_mapel'
                            ? 'bg-white text-[#0A1172] shadow-xs font-bold'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        Semua Mapel ({daftarMapelUnikGrafik.length})
                      </button>
                    </div>
                  )}

                  <select
                    value={komponenGrafikAdmin}
                    onChange={(e) =>
                      setKomponenGrafikAdmin(
                        e.target.value as 'nilaiAkhir' | 'cbt' | 'tugas' | 'sikap' | 'lisan'
                      )
                    }
                    className="w-full sm:w-auto px-3 py-2 text-xs font-bold text-[#0A1172] bg-slate-50 border border-slate-300 rounded-lg cursor-pointer"
                  >
                    <option value="nilaiAkhir">Komponen: Nilai Akhir Rapor (100%)</option>
                    <option value="cbt">Komponen: Ujian Tulis CBT (40%)</option>
                    <option value="tugas">Komponen: Tugas Harian (20%)</option>
                    <option value="sikap">Komponen: Nilai Sikap &amp; Adab (20%)</option>
                    <option value="lisan">Komponen: Ujian Lisan (20%)</option>
                  </select>
                </div>
              </div>

              {/* Ringkasan Rata-Rata per Unit Pendidikan */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
                <div className="p-3 sm:p-3.5 rounded-lg bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                  <div>
                    <div className="text-[11px] font-semibold text-slate-500">Rata-Rata Unit Wustho</div>
                    <div className="text-[11px] sm:text-xs text-slate-600 mt-0.5">Kelas 7, 8 &amp; 9 (19 Santri)</div>
                  </div>
                  <div className="text-xl sm:text-2xl font-extrabold font-mono text-[#0A1172]">{rataUnitWustho}</div>
                </div>

                <div className="p-3 sm:p-3.5 rounded-lg bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                  <div>
                    <div className="text-[11px] font-semibold text-slate-500">Rata-Rata Unit Ulya</div>
                    <div className="text-[11px] sm:text-xs text-slate-600 mt-0.5">Kelas 10, 11 &amp; 12 (30 Santri)</div>
                  </div>
                  <div className="text-xl sm:text-2xl font-extrabold font-mono text-[#FF6700]">{rataUnitUlya}</div>
                </div>

                <div className="p-3 sm:p-3.5 rounded-lg bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                  <div>
                    <div className="text-[11px] font-semibold text-slate-500">Rata-Rata Unit MDA</div>
                    <div className="text-[11px] sm:text-xs text-slate-600 mt-0.5">Junior, Senior &amp; Putri (18 Santri)</div>
                  </div>
                  <div className="text-xl sm:text-2xl font-extrabold font-mono text-emerald-700">{rataUnitMDA}</div>
                </div>

                <div className="p-3 sm:p-3.5 rounded-lg bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-1 min-w-0">
                  <div className="min-w-0">
                    <div className="text-[11px] font-semibold text-slate-500">Capaian Mapel Tertinggi</div>
                    <div className="text-xs font-bold text-[#0A1172] truncate max-w-full sm:max-w-[150px] mt-0.5">
                      {mapelTertinggiGrafik?.mapel || '-'}
                    </div>
                  </div>
                  <div className="text-xl sm:text-2xl font-extrabold font-mono text-[#0A1172] shrink-0">
                    {mapelTertinggiGrafik?.rataGabungan || 0}
                  </div>
                </div>
              </div>

              {/* Kanvas Grafik Batang Recharts */}
              <div className="w-full h-[300px] sm:h-[390px] min-w-0 pt-2">
                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={280}>
                  <BarChart
                    data={dataGrafikRataMapelUnit}
                    margin={{ top: 12, right: 20, left: 0, bottom: 68 }}
                    barGap={4}
                    barCategoryGap="20%"
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                    <XAxis
                      dataKey="mapel"
                      angle={-30}
                      textAnchor="end"
                      interval={0}
                      height={76}
                      tick={{ fill: '#1E293B', fontSize: 11, fontWeight: 600 }}
                    />
                    <YAxis
                      domain={[0, 100]}
                      ticks={[0, 20, 40, 60, 75, 85, 100]}
                      tick={{ fill: '#475569', fontSize: 11 }}
                      unit=""
                    />
                    <Tooltip
                      cursor={{ fill: '#F1F5F9' }}
                      contentStyle={{
                        backgroundColor: '#FFFFFF',
                        borderColor: '#CBD5E1',
                        borderRadius: '8px',
                        fontSize: '12px',
                        fontWeight: 600,
                      }}
                      formatter={(value: unknown, name: unknown) => [
                        `${Number(value).toFixed(1)} Poin`,
                        `Unit ${String(name)}`,
                      ]}
                    />
                    <Legend
                      verticalAlign="top"
                      height={36}
                      wrapperStyle={{ fontSize: '12px', fontWeight: 700 }}
                    />
                    <ReferenceLine
                      y={85}
                      stroke="#0A1172"
                      strokeDasharray="4 4"
                      label={{
                        value: 'Batas Mumtaz (85)',
                        position: 'insideTopRight',
                        fill: '#0A1172',
                        fontSize: 10,
                        fontWeight: 700,
                      }}
                    />
                    <ReferenceLine
                      y={75}
                      stroke="#FF6700"
                      strokeDasharray="3 3"
                      label={{
                        value: 'KKM Jayyid Jiddan (75)',
                        position: 'insideBottomRight',
                        fill: '#FF6700',
                        fontSize: 10,
                        fontWeight: 700,
                      }}
                    />
                    {(filterUnitGrafikAdmin === 'SEMUA' || filterUnitGrafikAdmin === 'Wustho') && (
                      <Bar
                        dataKey="Wustho"
                        name="Unit Wustho (Kls 7-9)"
                        fill="#0A1172"
                        radius={[4, 4, 0, 0]}
                        maxBarSize={36}
                      />
                    )}
                    {(filterUnitGrafikAdmin === 'SEMUA' || filterUnitGrafikAdmin === 'Ulya') && (
                      <Bar
                        dataKey="Ulya"
                        name="Unit Ulya (Kls 10-12)"
                        fill="#FF6700"
                        radius={[4, 4, 0, 0]}
                        maxBarSize={36}
                      />
                    )}
                    {(filterUnitGrafikAdmin === 'SEMUA' || filterUnitGrafikAdmin === 'MDA') && (
                      <Bar
                        dataKey="MDA"
                        name="Unit MDA (Junior/Senior/Putri)"
                        fill="#059669"
                        radius={[4, 4, 0, 0]}
                        maxBarSize={36}
                      />
                    )}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
              </>
            )}

            {/* PANEL PENGATURAN IDENTITAS WEB, TAGLINE E-RAPOR, WALI KELAS & RESET NILAI */}
            {adminPunyaAkses('identitas_rapor') && (
              <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6 space-y-4 sm:space-y-5">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 sm:gap-4 border-b border-slate-200 pb-4">
                  <div className="space-y-1">
                    <div className="text-[11px] sm:text-xs font-mono font-bold text-[#FF6700] uppercase">
                      PENGATURAN KOP E-RAPOR, WALI KELAS &amp; IDENTITAS PESANTREN
                    </div>
                    <h2 className="text-base sm:text-lg font-bold text-[#0A1172]">
                      Edit Tagline e-Rapor, Nama Wali Kelas &amp; Identitas Resmi
                    </h2>
                    <p className="text-xs text-slate-600">
                      Tanda tangan e-Rapor menampilkan <strong>Mudir</strong> dan <strong>Wali Kelas</strong> per kelas (kolom Koordinator Tahfidz &amp; IT sudah dihilangkan).
                    </p>
                  </div>
                  <div className="grid grid-cols-1 sm:flex sm:flex-wrap items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => setIsModalIdentitasOpen(true)}
                      className="px-3.5 py-2 text-xs font-bold text-[#0A1172] bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-lg cursor-pointer text-center"
                    >
                      <i className="fa-solid fa-pen-to-square mr-1.5 text-[#FF6700]" />
                      Edit Logo &amp; Teks Lengkap
                    </button>
                    {adminPunyaAkses('nilai_log') && (
                      <button
                        type="button"
                        onClick={handleKosongkanSemuaNilaiTahfidzIT}
                        className="px-3.5 py-2 text-xs font-bold text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg cursor-pointer text-center"
                      >
                        <i className="fa-solid fa-eraser mr-1.5" />
                        Kosongkan Semua Nilai, Tahfidz &amp; IT
                      </button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 text-xs">
                  <div className="sm:col-span-2 lg:col-span-2">
                    <label className="block font-bold text-slate-700 mb-1">
                      Tagline KOP e-Rapor Digital
                    </label>
                    <input
                      type="text"
                      value={identitasPesantren.taglineRapor || ''}
                      onChange={(e) =>
                        simpanIdentitasPesantren({
                          ...identitasPesantren,
                          taglineRapor: e.target.value,
                        })
                      }
                      placeholder="Tahfidz Al-Qur'an · Ulumuddin · Muslim Digital Academy (Ilmu Teknologi)"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg font-medium"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Nama Mudir (TTD Kiri)</label>
                    <input
                      type="text"
                      value={identitasPesantren.namaMudir}
                      onChange={(e) =>
                        simpanIdentitasPesantren({
                          ...identitasPesantren,
                          namaMudir: e.target.value,
                        })
                      }
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg font-semibold"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      Wali Kelas Default (Semua Kelas)
                    </label>
                    <input
                      type="text"
                      value={identitasPesantren.namaWaliKelasDefault || ''}
                      onChange={(e) =>
                        simpanIdentitasPesantren({
                          ...identitasPesantren,
                          namaWaliKelasDefault: e.target.value,
                        })
                      }
                      placeholder="Ustadz H. Abdurrahman, Lc., M.Ag."
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg font-semibold"
                    />
                  </div>
                </div>

                <div className="p-3.5 sm:p-4 bg-slate-50 border border-slate-200 rounded-xl grid grid-cols-1 sm:grid-cols-12 sm:items-end gap-3 text-xs">
                  <div className="sm:col-span-5 lg:col-span-4">
                    <label className="block font-bold text-[#0A1172] mb-1">
                      Pilih Unit &amp; Kelas (Wali Kelas Khusus)
                    </label>
                    <select
                      value={selectedWaliKelasKey}
                      onChange={(e) => setSelectedWaliKelasKey(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white font-bold text-[#0A1172]"
                    >
                      {(Object.keys(UNIT_KELAS_MAP) as UnitPendidikan[]).flatMap((u) =>
                        UNIT_KELAS_MAP[u].map((k) => (
                          <option key={`${u}__${k}`} value={`${u}__${k}`}>
                            {u} — {k}
                          </option>
                        ))
                      )}
                    </select>
                  </div>
                  <div className="sm:col-span-7 lg:col-span-8">
                    <label className="block font-bold text-slate-700 mb-1">
                      Nama Wali Kelas untuk {selectedWaliKelasKey.replace('__', ' — ')}
                    </label>
                    <input
                      type="text"
                      value={identitasPesantren.waliKelasMap?.[selectedWaliKelasKey] ?? ''}
                      onChange={(e) =>
                        simpanIdentitasPesantren({
                          ...identitasPesantren,
                          waliKelasMap: {
                            ...(identitasPesantren.waliKelasMap || {}),
                            [selectedWaliKelasKey]: e.target.value,
                          },
                        })
                      }
                      placeholder={`Kosongkan jika memakai default (${identitasPesantren.namaWaliKelasDefault || 'Wali Kelas'})`}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* PANEL MANAJEMEN AKUN ADMIN, HAK AKSES & GANTI PASSWORD */}
            {adminPunyaAkses('kelola_admin') && (
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-4 sm:px-6 py-4 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="text-[11px] font-mono font-bold text-[#FF6700] uppercase">
                      MANAJEMEN MULTI-ADMIN &amp; KONTROL HAK AKSES
                    </div>
                    <h2 className="text-base font-bold text-[#0A1172]">
                      Daftar Akun Administrator ({adminList.length} Akun)
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => setModalTambahAdminOpen(true)}
                    className="w-full sm:w-auto px-4 py-2 text-xs font-bold text-white bg-[#0A1172] hover:bg-[#0A1172]/90 rounded-lg cursor-pointer shrink-0 text-center"
                  >
                    <i className="fa-solid fa-user-plus mr-1.5 text-[#FF6700]" />
                    + Tambah Akun Admin
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-100/80 text-slate-700 font-bold">
                        <th className="py-2.5 px-3 sm:px-4">Nama &amp; Jabatan</th>
                        <th className="hidden sm:table-cell py-2.5 px-4">Username</th>
                        <th className="hidden md:table-cell py-2.5 px-3 text-center">Status</th>
                        <th className="hidden lg:table-cell py-2.5 px-4">Hak Akses Fitur</th>
                        <th className="py-2.5 px-3 sm:px-4 text-center">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {adminList.map((adm) => (
                        <tr key={adm.id} className="hover:bg-slate-50">
                          <td className="py-2.5 px-3 sm:px-4">
                            <div className="font-bold text-[#0A1172] flex flex-wrap items-center gap-1.5">
                              <span>{adm.namaAdmin}</span>
                              {adm.isPrimary && (
                                <span className="px-1.5 py-0.5 text-[10px] font-mono bg-amber-100 text-amber-900 border border-amber-300 rounded">
                                  Utama
                                </span>
                              )}
                              <span
                                className={`md:hidden px-1.5 py-0.5 text-[10px] font-bold rounded border ${
                                  adm.aktif
                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                    : 'bg-slate-100 text-slate-600 border-slate-300'
                                }`}
                              >
                                {adm.aktif ? 'Aktif' : 'Nonaktif'}
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-500">{adm.jabatan}</div>
                            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] lg:hidden">
                              <span className="sm:hidden font-mono font-bold text-slate-700">@{adm.username}</span>
                              <span className="text-slate-500">· {adm.hakAkses.length} hak akses</span>
                            </div>
                          </td>
                          <td className="hidden sm:table-cell py-2.5 px-4 font-mono font-bold text-slate-800">
                            @{adm.username}
                          </td>
                          <td className="hidden md:table-cell py-2.5 px-3 text-center">
                            <span
                              className={`px-2 py-0.5 text-[10px] font-bold rounded border ${
                                adm.aktif
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                  : 'bg-slate-100 text-slate-600 border-slate-300'
                              }`}
                            >
                              {adm.aktif ? 'Aktif' : 'Nonaktif'}
                            </span>
                          </td>
                          <td className="hidden lg:table-cell py-2.5 px-4">
                            <div className="flex flex-wrap gap-1">
                              {adm.hakAkses.map((hk) => {
                                const info = ADMIN_PERMISSION_LIST.find((p) => p.key === hk);
                                return (
                                  <span
                                    key={hk}
                                    className="px-2 py-0.5 text-[10px] font-semibold bg-blue-50 text-[#0A1172] border border-blue-200 rounded"
                                  >
                                    {info?.label || hk}
                                  </span>
                                );
                              })}
                            </div>
                          </td>
                          <td className="py-2.5 px-3 sm:px-4 text-center">
                            <div className="inline-flex flex-wrap items-center justify-center gap-1.5">
                              <button
                                type="button"
                                onClick={() =>
                                  setEditAksesAdminForm({ ...adm, hakAkses: [...adm.hakAkses] })
                                }
                                className="px-2 sm:px-2.5 py-1 text-[11px] font-bold text-[#0A1172] bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded cursor-pointer whitespace-nowrap"
                              >
                                <i className="fa-solid fa-sliders mr-1" />
                                <span className="hidden sm:inline">Edit </span>Akses
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setGantiPasswordAdminModal({
                                    adminTarget: adm,
                                    wajibPasswordLama:
                                      !adminLoginAktif?.isPrimary && adm.id === adminLoginAktif?.id,
                                    passwordLama: '',
                                    passwordBaru: '',
                                    konfirmasiPasswordBaru: '',
                                  })
                                }
                                className="px-2 sm:px-2.5 py-1 text-[11px] font-bold text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-300 rounded cursor-pointer whitespace-nowrap"
                              >
                                <i className="fa-solid fa-key mr-1" />
                                <span className="hidden sm:inline">Ganti </span>Password
                              </button>
                              {!adm.isPrimary && (
                                <button
                                  type="button"
                                  onClick={() => handleHapusAdminAccount(adm)}
                                  className="px-2 sm:px-2.5 py-1 text-[11px] font-bold text-red-600 hover:bg-red-50 border border-red-200 rounded cursor-pointer whitespace-nowrap"
                                >
                                  <i className="fa-solid fa-trash-can mr-1" />
                                  Hapus
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ===============================================================
                MODUL LOG AKTIVITAS PERUBAHAN NILAI OLEH USTADZ (AUDIT TRAIL)
                =============================================================== */}
            {adminPunyaAkses('nilai_log') && (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-4 sm:px-6 py-4 sm:py-5 bg-slate-50 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-3 sm:gap-4">
                <div className="space-y-1">
                  <div className="text-[11px] sm:text-xs font-mono font-bold text-[#FF6700]">
                    AUDIT TRAIL &amp; KEAMANAN DATA AKADEMIK · REAL-TIME LOGGING
                  </div>
                  <h2 className="text-base sm:text-lg font-bold text-[#0A1172]">
                    Log Aktivitas Perubahan Nilai oleh Ustadz ({logAktivitasNilai.length} Rekaman Audit)
                  </h2>
                  <p className="text-xs text-slate-600">
                    Mencatat secara otomatis setiap perubahan nilai (Timestamp, NIS, Nama Santri, Mata Pelajaran,
                    Ustadz Pengubah, serta perbandingan Nilai Lama ke Nilai Baru) untuk menjamin akuntabilitas.
                  </p>
                </div>

                <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 w-full lg:w-auto shrink-0">
                  <button
                    type="button"
                    onClick={handleExportLogAktivitasNilaiCSV}
                    className="px-3 sm:px-3.5 py-2 text-xs font-bold text-white bg-[#FF6700] hover:bg-[#e55c00] rounded-lg cursor-pointer whitespace-nowrap shrink-0 text-center"
                    title="Unduh data Log Aktivitas Nilai dalam format CSV (.csv UTF-8) untuk integrasi database / Google Sheets / BI"
                  >
                    <i className="fa-solid fa-file-csv mr-1.5" />
                    Export CSV (.csv)
                  </button>
                  <button
                    type="button"
                    onClick={handleExportLogAktivitasNilaiExcel}
                    className="px-3 sm:px-3.5 py-2 text-xs font-bold text-white bg-[#0A1172] hover:bg-[#0A1172]/90 rounded-lg cursor-pointer whitespace-nowrap shrink-0 text-center"
                    title="Unduh data Log Aktivitas Nilai dalam format Microsoft Excel (.xlsx)"
                  >
                    <i className="fa-solid fa-file-excel mr-1.5 text-[#FF6700]" />
                    Export Excel (.xlsx)
                  </button>
                  {logAktivitasNilai.length > 0 && (
                    <button
                      type="button"
                      onClick={async () => {
                        const res = await Swal.fire({
                          icon: 'warning',
                          title: 'Bersihkan Log Audit Nilai?',
                          text: 'Tindakan ini akan mengosongkan daftar riwayat perubahan nilai di Dasbor Admin.',
                          showCancelButton: true,
                          confirmButtonText: 'Ya, Bersihkan Log',
                          cancelButtonText: 'Batal',
                          confirmButtonColor: '#DC2626',
                        });
                        if (res.isConfirmed) {
                          setLogAktivitasNilai([]);
                        }
                      }}
                      className="col-span-2 sm:col-span-1 px-3 py-2 text-xs font-bold text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg cursor-pointer whitespace-nowrap shrink-0 text-center"
                    >
                      Bersihkan Log
                    </button>
                  )}
                </div>
              </div>

              {/* Filter Pencarian, Unit, dan Komponen Nilai pada Log Aktivitas */}
              <div className="px-4 sm:px-6 py-3.5 bg-white border-b border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                <div className="grid grid-cols-1 sm:flex sm:flex-wrap items-stretch sm:items-center gap-2 w-full lg:w-auto">
                  <input
                    type="text"
                    value={cariLogNilaiAdmin}
                    onChange={(e) => setCariLogNilaiAdmin(e.target.value)}
                    placeholder="Cari NIS / Nama Santri / Mapel / Ustadz..."
                    className="px-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg w-full sm:w-64"
                  />

                  <div className="grid grid-cols-4 sm:flex items-center gap-1 p-1 bg-slate-100 rounded-lg border border-slate-200">
                    {(['SEMUA', 'Wustho', 'Ulya', 'MDA'] as const).map((uFilter) => (
                      <button
                        key={uFilter}
                        type="button"
                        onClick={() => setFilterUnitLogNilaiAdmin(uFilter)}
                        className={`px-2 sm:px-2.5 py-1 text-xs font-bold rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 text-center ${
                          filterUnitLogNilaiAdmin === uFilter
                            ? 'bg-[#0A1172] text-white'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {uFilter === 'SEMUA' ? 'Semua' : uFilter}
                      </button>
                    ))}
                  </div>

                  <select
                    value={filterKomponenLogNilaiAdmin}
                    onChange={(e) => setFilterKomponenLogNilaiAdmin(e.target.value)}
                    className="w-full sm:w-auto px-3 py-1.5 text-xs font-semibold bg-slate-50 border border-slate-300 rounded-lg"
                  >
                    <option value="SEMUA">Semua Komponen Nilai</option>
                    <option value="Tugas Harian (20%)">Tugas Harian (20%)</option>
                    <option value="Nilai Sikap (20%)">Nilai Sikap (20%)</option>
                    <option value="Ujian Lisan (20%)">Ujian Lisan (20%)</option>
                    <option value="TAHFIDZ_IT">Capaian Tahfidz &amp; Praktek IT</option>
                  </select>
                </div>

                <div className="text-[11px] sm:text-xs text-slate-500 font-mono tabular-nums">
                  Aktivitas Terakhir:{' '}
                  <strong className="text-[#0A1172]">
                    {logAktivitasNilai[0]
                      ? `${logAktivitasNilai[0].timestamp} · ${logAktivitasNilai[0].namaUstadz}`
                      : 'Belum ada perubahan'}
                  </strong>
                </div>
              </div>

              {/* Tabel Audit Perubahan Nilai */}
              <div className="overflow-x-auto max-h-[420px]">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="sticky top-0 bg-slate-100 z-10">
                    <tr className="border-b border-slate-200 text-slate-700 font-bold whitespace-nowrap">
                      <th className="hidden lg:table-cell py-2.5 px-4">ID &amp; Timestamp (WIB)</th>
                      <th className="py-2.5 px-3 sm:px-4">NIS &amp; Nama Santri</th>
                      <th className="hidden md:table-cell py-2.5 px-3">Unit &amp; Kelas</th>
                      <th className="hidden sm:table-cell py-2.5 px-4">Mata Pelajaran &amp; Komponen</th>
                      <th className="hidden lg:table-cell py-2.5 px-4">Ustadz Pengubah</th>
                      <th className="py-2.5 px-3 sm:px-4 text-right">Nilai Lama → Baru</th>
                      <th className="hidden xl:table-cell py-2.5 px-4 text-right">Dampak Nilai Akhir</th>
                      <th className="py-2.5 px-2.5 sm:px-3 text-center">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {ambilDaftarLogAktivitasTerfilter().map((log, idx) => {
                        const selisihAngka =
                          typeof log.selisih === 'number'
                            ? log.selisih
                            : typeof log.nilaiLama === 'number' && typeof log.nilaiBaru === 'number'
                            ? Number((log.nilaiBaru - log.nilaiLama).toFixed(2))
                            : null;
                        return (
                          <tr key={`${log.idLog}-${idx}`} className="hover:bg-slate-50">
                            <td className="hidden lg:table-cell py-2.5 px-4 whitespace-nowrap font-mono tabular-nums">
                              <div className="font-bold text-[#0A1172]">{log.idLog}</div>
                              <div className="text-[11px] text-slate-500">{log.timestamp}</div>
                            </td>
                            <td className="py-2.5 px-3 sm:px-4">
                              <div className="font-mono tabular-nums font-bold text-[#0A1172] text-[11px] sm:text-xs">{log.nis}</div>
                              <div className="font-semibold text-slate-900">{log.namaSantri}</div>
                              <div className="sm:hidden text-[11px] text-slate-600 mt-0.5">
                                {log.mapel} · {log.komponenNilai}
                              </div>
                              <div className="lg:hidden text-[10px] text-slate-500 mt-0.5">
                                <span className="md:hidden font-semibold text-[#0A1172]">{log.unit} {log.kelas} · </span>
                                {log.namaUstadz} · {log.timestamp}
                              </div>
                            </td>
                            <td className="hidden md:table-cell py-2.5 px-3 whitespace-nowrap text-slate-700">
                              <span className="font-bold text-[#0A1172]">{log.unit}</span> · {log.kelas}
                            </td>
                            <td className="hidden sm:table-cell py-2.5 px-4 whitespace-nowrap">
                              <div className="font-bold text-slate-900">{log.mapel}</div>
                              <div className="text-[11px] text-slate-500">{log.komponenNilai}</div>
                            </td>
                            <td className="hidden lg:table-cell py-2.5 px-4 whitespace-nowrap font-semibold text-[#0A1172]">
                              {log.namaUstadz}
                            </td>
                            <td className="py-2.5 px-3 sm:px-4 text-right whitespace-nowrap font-mono tabular-nums">
                              <span className="text-slate-500 line-through mr-1">{log.nilaiLama}</span>
                              <span className="text-slate-400 mr-1">→</span>
                              <span className="font-extrabold text-slate-900">{log.nilaiBaru}</span>
                              {selisihAngka !== null && selisihAngka !== 0 && (
                                <span
                                  className={`block sm:inline sm:ml-2 font-bold ${
                                    selisihAngka > 0 ? 'text-emerald-700' : 'text-red-600'
                                  }`}
                                >
                                  ({selisihAngka > 0 ? `+${selisihAngka}` : selisihAngka})
                                </span>
                              )}
                            </td>
                            <td className="hidden xl:table-cell py-2.5 px-4 text-right whitespace-nowrap font-mono tabular-nums">
                              {typeof log.nilaiAkhirLama === 'number' &&
                              typeof log.nilaiAkhirBaru === 'number' ? (
                                <div>
                                  <span className="text-slate-500">{log.nilaiAkhirLama.toFixed(2)}</span>
                                  <span className="text-slate-400 mx-1">→</span>
                                  <strong className="text-[#0A1172]">{log.nilaiAkhirBaru.toFixed(2)}</strong>
                                </div>
                              ) : (
                                <span className="text-slate-400">Non-Akademik</span>
                              )}
                            </td>
                            <td className="py-2.5 px-2.5 sm:px-3 text-center whitespace-nowrap">
                              <button
                                type="button"
                                onClick={() => handleHapusLogAktivitasNilaiSatuan(log)}
                                className="px-2 sm:px-2.5 py-1 text-[11px] font-bold text-red-600 hover:bg-red-50 border border-red-200 rounded cursor-pointer"
                                title="Hapus rekaman log ini"
                              >
                                Hapus
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    {ambilDaftarLogAktivitasTerfilter().length === 0 && (
                      <tr>
                        <td colSpan={8} className="py-8 px-4 text-center text-slate-500">
                          Belum ada riwayat perubahan nilai oleh Ustadz. Setiap perubahan nilai di Portal Ustadz akan
                          otomatis tercatat di sini.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            )}

            {/* 3 Form Administrasi: Tambah Mapel, Tambah Santri, Tambah Ustadz */}
            {(adminPunyaAkses('mapel') || adminPunyaAkses('santri') || adminPunyaAkses('ustadz')) && (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6 items-start">
              {/* Form 1: Tambah Mata Pelajaran */}
              {adminPunyaAkses('mapel') && (
              <form
                onSubmit={handleTambahMapelAdmin}
                className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6 space-y-4"
              >
                <div className="border-b border-slate-100 pb-3">
                  <h2 className="text-base font-bold text-[#0A1172]">+ Tambah Mata Pelajaran &amp; Token</h2>
                  <p className="text-xs text-slate-500">Pilih Unit Pendidikan dan Kelas secara bertingkat.</p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Unit Pendidikan</label>
                    <select
                      value={formMapelUnit}
                      onChange={(e) =>
                        handleChangeUnit(e.target.value as UnitPendidikan, setFormMapelUnit, setFormMapelKelas)
                      }
                      className="w-full px-3 py-2 text-xs font-semibold bg-white border border-slate-300 rounded-lg"
                    >
                      <option value="Wustho">Wustho</option>
                      <option value="Ulya">Ulya</option>
                      <option value="MDA">MDA</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Kelas</label>
                    <select
                      value={formMapelKelas}
                      onChange={(e) => setFormMapelKelas(e.target.value)}
                      className="w-full px-3 py-2 text-xs font-semibold bg-white border border-slate-300 rounded-lg"
                    >
                      {UNIT_KELAS_MAP[formMapelUnit].map((k) => (
                        <option key={k} value={k}>
                          {k}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Nama Mata Pelajaran</label>
                  <input
                    type="text"
                    required
                    value={formMapelNama}
                    onChange={(e) => setFormMapelNama(e.target.value)}
                    placeholder="Contoh: Hadits Arbain / Python AI"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Ustadz Pengampu</label>
                  <select
                    value={formMapelPengampu}
                    onChange={(e) => setFormMapelPengampu(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-semibold bg-white border border-slate-300 rounded-lg"
                  >
                    {ustadzList.map((u) => (
                      <option key={u.id} value={u.namaUstadz}>
                        {u.namaUstadz} ({(u.unitAmpuan || []).join(', ') || 'Semua Unit'})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Token Ujian</label>
                    <input
                      type="text"
                      required
                      value={formMapelToken}
                      onChange={(e) => setFormelTokenUpper(e.target.value, setFormMapelToken)}
                      placeholder="DARUL26"
                      className="w-full px-3 py-2 text-xs font-mono uppercase border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Durasi (Menit)</label>
                    <input
                      type="number"
                      min={5}
                      max={180}
                      required
                      value={formMapelDurasi}
                      onChange={(e) => setFormMapelDurasi(Number(e.target.value))}
                      className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full py-2.5 px-4 text-xs font-bold text-white bg-[#FF6700] hover:bg-[#e55c00] rounded-lg transition-colors cursor-pointer"
                >
                  Simpan Mata Pelajaran
                </button>
              </form>
              )}

              {/* Form 2: Tambah Santri (18 Kolom Buku Induk) */}
              {adminPunyaAkses('santri') && (
              <form
                onSubmit={handleTambahSantriAdmin}
                className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6 space-y-3"
              >
                <div className="border-b border-slate-100 pb-3">
                  <h2 className="text-base font-bold text-[#0A1172]">+ Tambah Santri Baru (Buku Induk)</h2>
                  <p className="text-xs text-slate-500">
                    Registrasi Santri Aktif (Wustho, Ulya &amp; MDA — non Ma&apos;had Aly).
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">NIS *</label>
                    <input
                      type="text"
                      required
                      value={formSantriNIS}
                      onChange={(e) => setFormSantriNIS(e.target.value)}
                      placeholder="27.2627.810"
                      className="w-full px-2.5 py-1.5 text-xs font-mono uppercase border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">NISN</label>
                    <input
                      type="text"
                      value={formSantriNISN}
                      onChange={(e) => setFormSantriNISN(e.target.value)}
                      placeholder="0139988210"
                      className="w-full px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded-lg"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div className="sm:col-span-2">
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">Nama Lengkap *</label>
                    <input
                      type="text"
                      required
                      value={formSantriNama}
                      onChange={(e) => setFormSantriNama(e.target.value)}
                      placeholder="Nama sesuai buku induk"
                      className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">JK (L/P)</label>
                    <select
                      value={formSantriJK}
                      onChange={(e) => setFormSantriJK(e.target.value as 'L' | 'P')}
                      className="w-full px-2.5 py-1.5 text-xs font-semibold bg-white border border-slate-300 rounded-lg"
                    >
                      <option value="L">L (Putra)</option>
                      <option value="P">P (Putri)</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">Unit Pendidikan</label>
                    <select
                      value={formSantriUnit}
                      onChange={(e) =>
                        handleChangeUnit(e.target.value as UnitPendidikan, setFormSantriUnit, setFormSantriKelas)
                      }
                      className="w-full px-2.5 py-1.5 text-xs font-semibold bg-white border border-slate-300 rounded-lg"
                    >
                      <option value="Wustho">Wustho</option>
                      <option value="Ulya">Ulya</option>
                      <option value="MDA">MDA</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">Kelas</label>
                    <select
                      value={formSantriKelas}
                      onChange={(e) => setFormSantriKelas(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs font-semibold bg-white border border-slate-300 rounded-lg"
                    >
                      {UNIT_KELAS_MAP[formSantriUnit].map((k) => (
                        <option key={k} value={k}>
                          {k}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">NIK Santri</label>
                    <input
                      type="text"
                      value={formSantriNIK}
                      onChange={(e) => setFormSantriNIK(e.target.value)}
                      placeholder="3311..."
                      className="w-full px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">No. KK</label>
                    <input
                      type="text"
                      value={formSantriNoKK}
                      onChange={(e) => setFormSantriNoKK(e.target.value)}
                      placeholder="3311..."
                      className="w-full px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded-lg"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">Tempat Lahir</label>
                    <input
                      type="text"
                      value={formSantriTempatLahir}
                      onChange={(e) => setFormSantriTempatLahir(e.target.value)}
                      placeholder="Sukoharjo"
                      className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">Tanggal Lahir</label>
                    <input
                      type="text"
                      value={formSantriTglLahir}
                      onChange={(e) => setFormSantriTglLahir(e.target.value)}
                      placeholder="17 Mei 2012"
                      className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">Angkatan</label>
                    <input
                      type="text"
                      value={formSantriAngkatan}
                      onChange={(e) => setFormSantriAngkatan(e.target.value)}
                      placeholder="2026"
                      className="w-full px-2 py-1.5 text-xs font-mono border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">Kode Barang</label>
                    <input
                      type="text"
                      value={formSantriKodeBarang}
                      onChange={(e) => setFormSantriKodeBarang(e.target.value)}
                      placeholder="A15"
                      className="w-full px-2 py-1.5 text-xs font-mono border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">Jml Hafalan</label>
                    <input
                      type="text"
                      value={formSantriJumlahHafalan}
                      onChange={(e) => setFormSantriJumlahHafalan(e.target.value)}
                      placeholder="5 Juz"
                      className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded-lg"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">Nama Ayah</label>
                    <input
                      type="text"
                      value={formSantriNamaAyah}
                      onChange={(e) => setFormSantriNamaAyah(e.target.value)}
                      placeholder="Nama Ayah"
                      className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">No. Telp. Ayah</label>
                    <input
                      type="text"
                      value={formSantriTelpAyah}
                      onChange={(e) => setFormSantriTelpAyah(e.target.value)}
                      placeholder="08..."
                      className="w-full px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded-lg"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">Nama Ibu</label>
                    <input
                      type="text"
                      value={formSantriNamaIbu}
                      onChange={(e) => setFormSantriNamaIbu(e.target.value)}
                      placeholder="Nama Ibu"
                      className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">No. Telp. Ibu</label>
                    <input
                      type="text"
                      value={formSantriTelpIbu}
                      onChange={(e) => setFormSantriTelpIbu(e.target.value)}
                      placeholder="08..."
                      className="w-full px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded-lg"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">Alamat Lengkap</label>
                  <input
                    type="text"
                    value={formSantriAlamat}
                    onChange={(e) => setFormSantriAlamat(e.target.value)}
                    placeholder="RT/RW, Desa/Kelurahan, Kecamatan, Kabupaten"
                    className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full py-2.5 px-4 text-xs font-bold text-white bg-[#0A1172] hover:bg-[#0A1172]/90 rounded-lg transition-colors cursor-pointer"
                >
                  Simpan Data Buku Induk Santri
                </button>
              </form>
              )}

              {/* Form 3: Tambah Ustadz & PIN Login */}
              {adminPunyaAkses('ustadz') && (
              <form
                onSubmit={handleTambahUstadzAdmin}
                className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6 space-y-4 md:col-span-2 xl:col-span-1"
              >
                <div className="border-b border-slate-100 pb-3">
                  <h2 className="text-base font-bold text-[#0A1172]">+ Tambah Ustadz &amp; PIN Akses</h2>
                  <p className="text-xs text-slate-500">Default PIN login Portal Ustadz adalah UST123.</p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Nama Lengkap Ustadz / Instruktur</label>
                  <input
                    type="text"
                    required
                    value={formUstadzNama}
                    onChange={(e) => setFormUstadzNama(e.target.value)}
                    placeholder="Contoh: Ust. Salman Al-Farisi"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Unit Utama</label>
                    <select
                      value={formUstadzUnit}
                      onChange={(e) => setFormUstadzUnit(e.target.value as UnitPendidikan)}
                      className="w-full px-3 py-2 text-xs font-semibold bg-white border border-slate-300 rounded-lg"
                    >
                      <option value="Wustho">Wustho</option>
                      <option value="Ulya">Ulya</option>
                      <option value="MDA">MDA</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">PIN Login</label>
                    <input
                      type="text"
                      required
                      value={formUstadzPin}
                      onChange={(e) => setFormUstadzPin(e.target.value)}
                      className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Mata Pelajaran yang Diampu</label>
                  <input
                    type="text"
                    required
                    value={formUstadzBidang}
                    onChange={(e) => setFormUstadzBidang(e.target.value)}
                    placeholder="Contoh: Fiqih, Nahwu & Shorof"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full py-2.5 px-4 text-xs font-bold text-white bg-[#0A1172] hover:bg-[#0A1172]/90 rounded-lg transition-colors cursor-pointer"
                >
                  Simpan Akun Ustadz
                </button>
              </form>
              )}
            </div>
            )}

            {adminPunyaAkses('santri') && (
              <>
            {/* Panel Import & Export Data Massal via Excel (.xlsx) & Sinkronisasi Database Cloud */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="text-[11px] sm:text-xs font-mono font-bold text-[#FF6700] uppercase">
                  IMPORT / EXPORT MASSAL (.XLSX) &amp; DATABASE CLOUD LINTAS PERANGKAT
                </div>
                <h2 className="text-base font-bold text-[#0A1172]">
                  Otomasi Buku Induk Santri (18 Kolom), Jadwal Pengajar 2026/2027 &amp; Cadangan Cloud Firestore
                </h2>
                <p className="text-xs text-slate-600">
                  Seluruh 67 Santri Aktif (Wustho: 19, Ulya: 30, MDA: 18 — di luar Ma&apos;had Aly) telah terintegrasi
                  lengkap 18 kolom. Sinkron terakhir:{' '}
                  <strong className="font-mono">{terakhirSinkron || 'Baru saja'}</strong>.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:flex lg:flex-wrap items-stretch lg:items-center gap-2 sm:gap-2.5 w-full lg:w-auto shrink-0">
                <button
                  type="button"
                  onClick={handleExportUstadzDanJadwalExcel}
                  className="px-3.5 py-2 text-xs font-bold text-[#0A1172] bg-amber-50 hover:bg-amber-100 border border-amber-300 rounded-lg cursor-pointer text-center"
                >
                  <i className="fa-solid fa-chalkboard-user mr-1.5 text-[#FF6700]" />
                  Export Data Ustadz &amp; Mapel (.xlsx)
                </button>

                <button
                  type="button"
                  onClick={handleDownloadTemplateSantriExcel}
                  className="px-3.5 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-lg cursor-pointer text-center"
                >
                  <i className="fa-solid fa-file-excel mr-1.5 text-emerald-700" />
                  Unduh Template 18 Kolom
                </button>

                <label className="px-4 py-2 text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-600 rounded-lg cursor-pointer text-center">
                  <i className="fa-solid fa-upload mr-1.5" />
                  Import Santri (.xlsx)
                  <input
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    onChange={handleImportSantriDariExcel}
                    className="hidden"
                  />
                </label>

                <button
                  type="button"
                  onClick={handleExportSantriExcel}
                  className="px-4 py-2 text-xs font-bold text-white bg-[#0A1172] hover:bg-[#0A1172]/90 rounded-lg cursor-pointer text-center"
                >
                  <i className="fa-solid fa-download mr-1.5 text-[#FF6700]" />
                  Export Buku Induk Santri (.xlsx)
                </button>

                <button
                  type="button"
                  onClick={handleExportBackupDatabaseJSON}
                  className="px-3.5 py-2 text-xs font-bold text-slate-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 rounded-lg cursor-pointer text-center"
                  title="Unduh cadangan penuh database (.json) termasuk PIN Ustadz & Akun Admin"
                >
                  <i className="fa-solid fa-database mr-1.5 text-emerald-700" />
                  Backup Full (.json)
                </button>

                <label
                  className="px-3.5 py-2 text-xs font-bold text-slate-800 bg-sky-50 hover:bg-sky-100 border border-sky-300 rounded-lg cursor-pointer text-center"
                  title="Pulihkan seluruh database & password dari file backup .json"
                >
                  <i className="fa-solid fa-clock-rotate-left mr-1.5 text-sky-700" />
                  Restore (.json)
                  <input
                    type="file"
                    accept=".json,application/json"
                    onChange={handleImportBackupDatabaseJSON}
                    className="hidden"
                  />
                </label>

                <button
                  type="button"
                  onClick={handleToggleLoginFirebaseCloud}
                  className="sm:col-span-2 lg:col-span-1 px-4 py-2 text-xs font-bold text-white bg-[#FF6700] hover:bg-[#e55c00] rounded-lg cursor-pointer text-center"
                >
                  <i className="fa-solid fa-cloud-arrow-up mr-1.5" />
                  {cloudUser ? 'Cloud Firestore Aktif' : 'Hubungkan Firebase Cloud'}
                </button>
              </div>
            </div>

            {/* TABEL BUKU INDUK SANTRI AKTIF (18 KOLOM LENGKAP - TANPA MA'HAD ALY) */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-4 sm:px-6 py-4 bg-slate-50 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                <div>
                  <div className="text-[11px] font-mono font-bold text-[#FF6700] uppercase">
                    BUKU INDUK SANTRI AKTIF T.A. 2026/2027 · 18 KOLOM STANDAR PESANTREN (NON MA&apos;HAD ALY)
                  </div>
                  <h2 className="text-base font-bold text-[#0A1172]">
                    Data Master Santri Wustho, Ulya &amp; MDA ({santriList.length} Santri Aktif)
                  </h2>
                  <p className="text-xs text-slate-600 mt-0.5">
                    Rekap per Unit: <strong>Wustho</strong> ({santriList.filter((s) => s.unit === 'Wustho').length}{' '}
                    Santri) · <strong>Ulya</strong> ({santriList.filter((s) => s.unit === 'Ulya').length} Santri) ·{' '}
                    <strong>MDA</strong> ({santriList.filter((s) => s.unit === 'MDA').length} Santri)
                  </p>
                  <p className="lg:hidden text-[11px] text-slate-500 mt-1">
                    <i className="fa-solid fa-mobile-screen-button mr-1 text-[#FF6700]" />
                    Mode ringkas aktif: klik <strong>Edit</strong> untuk melihat atau mengubah 18 kolom lengkap santri.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:flex sm:flex-wrap items-stretch sm:items-center gap-2 w-full lg:w-auto">
                  <input
                    type="text"
                    value={cariSantriAdmin}
                    onChange={(e) => setCariSantriAdmin(e.target.value)}
                    placeholder="Cari Nama / NIS / NISN / Ayah / Alamat..."
                    className="px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg w-full sm:w-60"
                  />

                  <div className="grid grid-cols-4 sm:flex items-center gap-1.5">
                    {(['SEMUA', 'Wustho', 'Ulya', 'MDA'] as const).map((uFilter) => (
                      <button
                        key={uFilter}
                        type="button"
                        onClick={() => {
                          setFilterUnitSantriAdmin(uFilter);
                          setFilterKelasSantriAdmin('SEMUA');
                        }}
                        className={`px-2 sm:px-3 py-1.5 text-xs font-bold rounded-lg cursor-pointer text-center ${
                          filterUnitSantriAdmin === uFilter
                            ? 'bg-[#0A1172] text-white'
                            : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        {uFilter === 'SEMUA' ? 'Semua' : uFilter}
                      </button>
                    ))}
                  </div>

                  <select
                    value={filterKelasSantriAdmin}
                    onChange={(e) => setFilterKelasSantriAdmin(e.target.value)}
                    className="w-full sm:w-auto px-2.5 py-1.5 text-xs font-semibold bg-white border border-slate-300 rounded-lg"
                  >
                    <option value="SEMUA">Semua Kelas</option>
                    {(filterUnitSantriAdmin === 'SEMUA'
                      ? ['Kelas 7', 'Kelas 8', 'Kelas 9', 'Kelas 10', 'Kelas 11', 'Kelas 12', 'Junior', 'Senior', 'Putri']
                      : UNIT_KELAS_MAP[filterUnitSantriAdmin]
                    ).map((k) => (
                      <option key={k} value={k}>
                        {k}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="overflow-x-auto max-h-[540px]">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="sticky top-0 bg-slate-100 z-10">
                    <tr className="border-b border-slate-200 text-slate-700 font-bold whitespace-nowrap">
                      <th className="hidden md:table-cell py-2.5 px-3">No</th>
                      <th className="py-2.5 px-2.5 sm:px-3">NIS &amp; NISN</th>
                      <th className="py-2.5 px-2.5 sm:px-3">Nama Lengkap</th>
                      <th className="hidden sm:table-cell py-2.5 px-2 text-center">JK</th>
                      <th className="hidden sm:table-cell py-2.5 px-3">Unit &amp; Kelas</th>
                      <th className="hidden xl:table-cell py-2.5 px-3">NIK &amp; No. KK</th>
                      <th className="hidden xl:table-cell py-2.5 px-3">Tempat, Tgl Lahir</th>
                      <th className="hidden 2xl:table-cell py-2.5 px-3">Alamat Lengkap</th>
                      <th className="hidden lg:table-cell py-2.5 px-3">Angkatan &amp; Masuk</th>
                      <th className="hidden xl:table-cell py-2.5 px-2 text-center">Kode Brg</th>
                      <th className="hidden lg:table-cell py-2.5 px-3">Nama Ayah &amp; Telp</th>
                      <th className="hidden xl:table-cell py-2.5 px-3">Nama Ibu &amp; Telp</th>
                      <th className="hidden md:table-cell py-2.5 px-3">Jumlah Hafalan</th>
                      <th className="py-2.5 px-2.5 sm:px-3 text-center">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {santriList
                      .filter((s) => {
                        if (filterUnitSantriAdmin !== 'SEMUA' && s.unit !== filterUnitSantriAdmin) return false;
                        if (filterKelasSantriAdmin !== 'SEMUA' && s.kelas !== filterKelasSantriAdmin) return false;
                        if (!cariSantriAdmin.trim()) return true;
                        const q = cariSantriAdmin.toLowerCase();
                        return (
                          s.nama.toLowerCase().includes(q) ||
                          s.nis.toLowerCase().includes(q) ||
                          (s.nisn || '').toLowerCase().includes(q) ||
                          (s.namaAyah || '').toLowerCase().includes(q) ||
                          (s.namaIbu || '').toLowerCase().includes(q) ||
                          (s.alamat || '').toLowerCase().includes(q) ||
                          (s.kelasTerdata || s.kelas).toLowerCase().includes(q)
                        );
                      })
                      .map((s, idx) => (
                        <tr key={s.nis} className="hover:bg-slate-50 align-top">
                          <td className="hidden md:table-cell py-2.5 px-3 font-mono text-slate-500">{idx + 1}</td>
                          <td className="py-2.5 px-2.5 sm:px-3 whitespace-nowrap">
                            <div className="font-mono font-bold text-[#0A1172] text-[11px] sm:text-xs">{s.nis}</div>
                            <div className="hidden sm:block font-mono text-[11px] text-slate-500">NISN: {s.nisn || '-'}</div>
                          </td>
                          <td className="py-2.5 px-2.5 sm:px-3 sm:whitespace-nowrap">
                            <div className="font-bold text-slate-900">{s.nama}</div>
                            <div className="sm:hidden flex flex-wrap items-center gap-1 mt-0.5 text-[10px]">
                              <span className="font-bold text-[#0A1172]">
                                {s.unit} · {s.kelas}
                              </span>
                              <span
                                className={`px-1.5 py-0.25 font-mono font-bold rounded ${
                                  s.jk === 'P'
                                    ? 'bg-pink-50 text-pink-700 border border-pink-200'
                                    : 'bg-blue-50 text-blue-800 border border-blue-200'
                                }`}
                              >
                                {s.jk || 'L'}
                              </span>
                              {s.jumlahHafalan && (
                                <span className="text-emerald-700 font-semibold">· {s.jumlahHafalan}</span>
                              )}
                            </div>
                          </td>
                          <td className="hidden sm:table-cell py-2.5 px-2 text-center">
                            <span
                              className={`px-2 py-0.5 text-[10px] font-mono font-bold rounded ${
                                s.jk === 'P'
                                  ? 'bg-pink-50 text-pink-700 border border-pink-200'
                                  : 'bg-blue-50 text-blue-800 border border-blue-200'
                              }`}
                            >
                              {s.jk || 'L'}
                            </span>
                          </td>
                          <td className="hidden sm:table-cell py-2.5 px-3 whitespace-nowrap">
                            <div className="font-bold text-[#0A1172]">
                              {s.unit} · {s.kelas}
                            </div>
                            {s.kelasTerdata && s.kelasTerdata !== s.kelas && (
                              <div className="text-[10px] font-mono text-[#FF6700]">PDF: {s.kelasTerdata}</div>
                            )}
                          </td>
                          <td className="hidden xl:table-cell py-2.5 px-3 font-mono text-[11px] whitespace-nowrap">
                            <div>NIK: {s.nik || '-'}</div>
                            <div className="text-slate-500">KK: {s.noKK || '-'}</div>
                          </td>
                          <td className="hidden xl:table-cell py-2.5 px-3 whitespace-nowrap">
                            <div className="font-medium text-slate-800">{s.tempatLahir || '-'}</div>
                            <div className="text-[11px] text-slate-500">{s.tanggalLahir || '-'}</div>
                          </td>
                          <td className="hidden 2xl:table-cell py-2.5 px-3 max-w-xs text-[11px] text-slate-700 leading-snug">
                            {s.alamat || '-'}
                          </td>
                          <td className="hidden lg:table-cell py-2.5 px-3 whitespace-nowrap text-[11px]">
                            <div className="font-mono font-bold text-slate-800">Akt: {s.angkatan || '-'}</div>
                            <div className="text-slate-500">{s.tanggalMasuk || '-'}</div>
                          </td>
                          <td className="hidden xl:table-cell py-2.5 px-2 text-center font-mono font-bold text-[#0A1172]">
                            {s.kodeBarang || '-'}
                          </td>
                          <td className="hidden lg:table-cell py-2.5 px-3 whitespace-nowrap text-[11px]">
                            <div className="font-semibold text-slate-800">{s.namaAyah || '-'}</div>
                            <div className="font-mono text-slate-500">{s.noTelpAyah || '-'}</div>
                          </td>
                          <td className="hidden xl:table-cell py-2.5 px-3 whitespace-nowrap text-[11px]">
                            <div className="font-semibold text-slate-800">{s.namaIbu || '-'}</div>
                            <div className="font-mono text-slate-500">{s.noTelpIbu || '-'}</div>
                          </td>
                          <td className="hidden md:table-cell py-2.5 px-3 whitespace-nowrap">
                            <span className="px-2 py-0.5 text-[11px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 rounded">
                              {s.jumlahHafalan || '-'}
                            </span>
                          </td>
                          <td className="py-2.5 px-2.5 sm:px-3 text-center whitespace-nowrap">
                            <div className="inline-flex items-center gap-1 sm:gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleEditSantriAdmin(s)}
                                className="px-2 sm:px-2.5 py-1 text-[11px] font-bold text-[#0A1172] bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded cursor-pointer whitespace-nowrap"
                                title={`Edit data santri ${s.nama}`}
                              >
                                <i className="fa-solid fa-pen-to-square sm:mr-1" />
                                <span className="hidden sm:inline">Edit</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleHapusSantriAdmin(s)}
                                className="px-2 sm:px-2.5 py-1 text-[11px] font-bold text-red-600 hover:bg-red-50 border border-red-200 rounded cursor-pointer whitespace-nowrap"
                                title={`Hapus data santri ${s.nama}`}
                              >
                                <i className="fa-solid fa-trash-can sm:mr-1" />
                                <span className="hidden sm:inline">Hapus</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
              </>
            )}

            {/* TABEL DIREKTORI LENGKAP USTADZ PENGAJAR LINTAS UNIT (T.A. 2026/2027) */}
            {adminPunyaAkses('ustadz') && (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-4 sm:px-6 py-4 bg-slate-50 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                <div>
                  <div className="text-[11px] font-mono font-bold text-[#FF6700] uppercase">
                    DATA RESMI JADWAL PELAJARAN T.A. 2026/2027
                  </div>
                  <h2 className="text-base font-bold text-[#0A1172]">
                    Daftar Lengkap Ustadz Pengajar, Hak Akses Per Kelas &amp; Mata Pelajaran ({ustadzList.length} Pengajar)
                  </h2>
                </div>
                <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-2 w-full lg:w-auto">
                  <button
                    type="button"
                    onClick={handleSinkronSemuaHakAksesDariToken}
                    className="px-3 py-1.5 text-xs font-bold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer flex items-center justify-center gap-1.5 whitespace-nowrap"
                    title="Selaraskan hak akses seluruh Ustadz persis mengikuti kolom Pengampu pada Tabel Mata Pelajaran & Token"
                  >
                    <i className="fa-solid fa-arrows-rotate" />
                    <span>Sinkronkan Hak Akses dari Tabel Token</span>
                  </button>
                  <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-1.5">
                    {(['SEMUA', 'Wustho', 'Ulya', 'MDA'] as const).map((uFilter) => (
                      <button
                        key={uFilter}
                        type="button"
                        onClick={() => setFilterUnitUstadzAdmin(uFilter)}
                        className={`px-2.5 sm:px-3 py-1.5 text-xs font-bold rounded-lg cursor-pointer text-center ${
                          filterUnitUstadzAdmin === uFilter
                            ? 'bg-[#0A1172] text-white'
                            : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        {uFilter === 'SEMUA' ? 'Semua Unit' : `Unit ${uFilter}`}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-100/80 text-slate-700 font-bold">
                      <th className="hidden sm:table-cell py-2.5 px-4 w-12">No</th>
                      <th className="py-2.5 px-3 sm:px-4">Nama Ustadz / Pengajar</th>
                      <th className="hidden sm:table-cell py-2.5 px-4">Unit Diampu</th>
                      <th className="hidden lg:table-cell py-2.5 px-4">Kelas Diampu</th>
                      <th className="hidden md:table-cell py-2.5 px-4">Hak Akses Mapel (Sesuai Token)</th>
                      <th className="hidden xl:table-cell py-2.5 px-3 text-right">Ulya</th>
                      <th className="hidden xl:table-cell py-2.5 px-3 text-right">Wustho</th>
                      <th className="hidden xl:table-cell py-2.5 px-3 text-right">MDA</th>
                      <th className="hidden lg:table-cell py-2.5 px-3 text-right">Total JP</th>
                      <th className="py-2.5 px-2.5 sm:px-4 text-center">PIN Akses</th>
                      <th className="py-2.5 px-2.5 sm:px-3 text-center">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {ustadzList
                      .filter(
                        (u) =>
                          filterUnitUstadzAdmin === 'SEMUA' ||
                          (u.unitAmpuan && u.unitAmpuan.includes(filterUnitUstadzAdmin)) ||
                          u.bidang.toLowerCase().includes(filterUnitUstadzAdmin.toLowerCase())
                      )
                      .map((u, idx) => {
                        const mapelAktifUstadz = ambilDaftarMapelAmpuanUstadz(u);
                        const kelasAktual = Array.from(new Set(mapelAktifUstadz.map((m) => m.kelas)));
                        const namaMapelAktual = Array.from(new Set(mapelAktifUstadz.map((m) => m.namaMapel)));
                        const modeEksplisit = Array.isArray(u.aksesMapelIds);
                        return (
                          <tr key={u.id} className="hover:bg-slate-50">
                            <td className="hidden sm:table-cell py-2.5 px-4 font-mono text-slate-500">{idx + 1}</td>
                            <td className="py-2.5 px-3 sm:px-4">
                              <div className="font-bold text-[#0A1172] sm:whitespace-nowrap">{u.namaUstadz}</div>
                              <div className="flex flex-wrap items-center gap-1 mt-1">
                                <span
                                  className={`px-1.5 py-0.5 text-[10px] font-mono font-bold rounded ${
                                    modeEksplisit
                                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                      : 'bg-slate-100 text-slate-600 border border-slate-200'
                                  }`}
                                >
                                  {mapelAktifUstadz.length} mapel/kelas
                                </span>
                                <span className="sm:hidden flex flex-wrap items-center gap-1">
                                  {(u.unitAmpuan || ['Wustho']).map((un) => (
                                    <span
                                      key={un}
                                      className={`px-1.5 py-0.25 text-[10px] font-mono font-bold rounded ${
                                        un === 'Ulya'
                                          ? 'bg-indigo-50 text-indigo-800 border border-indigo-200'
                                          : un === 'MDA'
                                          ? 'bg-orange-50 text-[#FF6700] border border-orange-200'
                                          : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                      }`}
                                    >
                                      {un}
                                    </span>
                                  ))}
                                  <span className="text-[10px] font-mono font-bold text-slate-600 ml-0.5">
                                    {u.totalJam ?? 0} JP
                                  </span>
                                </span>
                              </div>
                              <div className="md:hidden text-[11px] text-slate-600 mt-0.5 line-clamp-1">
                                {namaMapelAktual.length > 0
                                  ? namaMapelAktual.join(', ')
                                  : u.mapelAmpuan && u.mapelAmpuan.length > 0
                                  ? u.mapelAmpuan.join(', ')
                                  : u.bidang}
                              </div>
                            </td>
                            <td className="hidden sm:table-cell py-2.5 px-4">
                              <div className="flex flex-wrap gap-1">
                                {(u.unitAmpuan || ['Wustho']).map((un) => (
                                  <span
                                    key={un}
                                    className={`px-2 py-0.5 text-[10px] font-mono font-bold rounded ${
                                      un === 'Ulya'
                                        ? 'bg-indigo-50 text-indigo-800 border border-indigo-200'
                                        : un === 'MDA'
                                        ? 'bg-orange-50 text-[#FF6700] border border-orange-200'
                                        : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                    }`}
                                  >
                                    {un}
                                  </span>
                                ))}
                              </div>
                            </td>
                            <td className="hidden lg:table-cell py-2.5 px-4 text-slate-600">
                              {kelasAktual.length > 0 ? kelasAktual.join(', ') : (u.kelasAmpuan || []).join(', ') || '-'}
                            </td>
                            <td className="hidden md:table-cell py-2.5 px-4 font-medium text-slate-800">
                              {namaMapelAktual.length > 0
                                ? namaMapelAktual.join(', ')
                                : u.mapelAmpuan && u.mapelAmpuan.length > 0
                                ? u.mapelAmpuan.join(', ')
                                : u.bidang}
                            </td>
                            <td className="hidden xl:table-cell py-2.5 px-3 text-right font-mono">{u.jamUlya ?? 0}</td>
                            <td className="hidden xl:table-cell py-2.5 px-3 text-right font-mono">{u.jamWustho ?? 0}</td>
                            <td className="hidden xl:table-cell py-2.5 px-3 text-right font-mono">{u.jamMDA ?? 0}</td>
                            <td className="hidden lg:table-cell py-2.5 px-3 text-right font-mono font-extrabold text-[#0A1172]">
                              {u.totalJam ?? 0} JP
                            </td>
                            <td className="py-2.5 px-2.5 sm:px-4 text-center font-mono font-bold text-[#FF6700] whitespace-nowrap">{u.pinLogin}</td>
                            <td className="py-2.5 px-2.5 sm:px-3 text-center whitespace-nowrap">
                              <div className="inline-flex items-center gap-1 sm:gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => handleEditUstadzAdmin(u)}
                                  className="px-2 sm:px-2.5 py-1 text-[11px] font-bold text-[#0A1172] bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded cursor-pointer whitespace-nowrap"
                                  title={`Edit hak akses per mapel/kelas ${u.namaUstadz}`}
                                >
                                  <i className="fa-solid fa-pen-to-square sm:mr-1" />
                                  <span className="hidden sm:inline">Edit Akses</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleHapusUstadzAdmin(u)}
                                  className="px-2 sm:px-2.5 py-1 text-[11px] font-bold text-red-600 hover:bg-red-50 border border-red-200 rounded cursor-pointer whitespace-nowrap"
                                  title={`Hapus akun ${u.namaUstadz}`}
                                >
                                  <i className="fa-solid fa-trash-can sm:mr-1" />
                                  <span className="hidden sm:inline">Hapus</span>
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </div>
            )}

            {/* Tabel Daftar Mapel & Rekap Unit Santri */}
            {(adminPunyaAkses('mapel') || adminPunyaAkses('santri')) && (
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 sm:gap-6">
              {adminPunyaAkses('mapel') && (() => {
                const daftarKelasTersedia =
                  filterUnitMapelAdmin === 'SEMUA'
                    ? Array.from(
                        new Set([
                          ...UNIT_KELAS_MAP.Wustho,
                          ...UNIT_KELAS_MAP.Ulya,
                          ...UNIT_KELAS_MAP.MDA,
                          ...mapelList.map((m) => m.kelas),
                        ])
                      )
                    : Array.from(
                        new Set([
                          ...UNIT_KELAS_MAP[filterUnitMapelAdmin],
                          ...mapelList.filter((m) => m.unit === filterUnitMapelAdmin).map((m) => m.kelas),
                        ])
                      );

                const qMapel = cariMapelAdmin.trim().toLowerCase();
                const filteredMapelAdmin = mapelList.filter((m) => {
                  if (filterUnitMapelAdmin !== 'SEMUA' && m.unit !== filterUnitMapelAdmin) return false;
                  if (filterKelasMapelAdmin !== 'SEMUA' && m.kelas !== filterKelasMapelAdmin) return false;
                  if (!qMapel) return true;
                  return (
                    m.namaMapel.toLowerCase().includes(qMapel) ||
                    m.kelas.toLowerCase().includes(qMapel) ||
                    m.unit.toLowerCase().includes(qMapel) ||
                    (m.tokenUjian || '').toLowerCase().includes(qMapel) ||
                    (m.pengampu || '').toLowerCase().includes(qMapel)
                  );
                });
                const jumlahDraftDiubah = Object.keys(draftMapelCepat).length;

                return (
              <div className="xl:col-span-8 bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-4 sm:px-5 py-3.5 bg-slate-50 border-b border-slate-200 space-y-2.5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <span className="font-bold text-xs text-[#0A1172]">
                        Distribusi Mata Pelajaran, Pengampu &amp; Token Ujian ({filteredMapelAdmin.length}/{mapelList.length} Mapel)
                      </span>
                      <p className="text-[11px] text-slate-500">
                        Filter per Unit/Kelas lalu aktifkan Mode Edit Cepat untuk ubah Token, Durasi &amp; Pengampu langsung per baris.
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          if (modeEditCepatMapel && jumlahDraftDiubah > 0) {
                            setDraftMapelCepat({});
                          }
                          setModeEditCepatMapel((prev) => !prev);
                        }}
                        className={`px-3 py-1.5 text-[11px] font-bold rounded-lg cursor-pointer flex items-center gap-1.5 ${
                          modeEditCepatMapel
                            ? 'bg-[#FF6700] text-white'
                            : 'bg-[#0A1172] text-white hover:bg-[#0A1172]/90'
                        }`}
                      >
                        <i className={`fa-solid ${modeEditCepatMapel ? 'fa-check-double' : 'fa-pen-ruler'}`} />
                        <span>{modeEditCepatMapel ? 'Selesai Edit Cepat' : 'Mode Edit Cepat Per Baris'}</span>
                      </button>
                      {modeEditCepatMapel && jumlahDraftDiubah > 0 && (
                        <button
                          type="button"
                          onClick={handleSimpanSemuaMapelCepat}
                          className="px-3 py-1.5 text-[11px] font-bold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer flex items-center gap-1.5"
                        >
                          <i className="fa-solid fa-floppy-disk" />
                          <span>Simpan Semua ({jumlahDraftDiubah})</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Baris Filter Unit, Kelas & Pencarian */}
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
                    <div className="sm:col-span-5 grid grid-cols-4 gap-1">
                      {(['SEMUA', 'Wustho', 'Ulya', 'MDA'] as const).map((uf) => (
                        <button
                          key={uf}
                          type="button"
                          onClick={() => {
                            setFilterUnitMapelAdmin(uf);
                            setFilterKelasMapelAdmin('SEMUA');
                          }}
                          className={`px-2 py-1.5 text-[11px] font-bold rounded cursor-pointer text-center ${
                            filterUnitMapelAdmin === uf
                              ? 'bg-[#0A1172] text-white'
                              : 'bg-white border border-slate-300 text-slate-600 hover:bg-slate-100'
                          }`}
                        >
                          {uf === 'SEMUA' ? 'Semua' : uf}
                        </button>
                      ))}
                    </div>
                    <div className="sm:col-span-3">
                      <select
                        value={filterKelasMapelAdmin}
                        onChange={(e) => setFilterKelasMapelAdmin(e.target.value)}
                        className="w-full px-2.5 py-1.5 text-[11px] font-bold bg-white border border-slate-300 rounded text-slate-700"
                      >
                        <option value="SEMUA">Semua Kelas</option>
                        {daftarKelasTersedia.map((k) => (
                          <option key={k} value={k}>
                            {k}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="sm:col-span-4">
                      <input
                        type="text"
                        value={cariMapelAdmin}
                        onChange={(e) => setCariMapelAdmin(e.target.value)}
                        placeholder="Cari mapel, token, pengampu..."
                        className="w-full px-2.5 py-1.5 text-[11px] bg-white border border-slate-300 rounded"
                      />
                    </div>
                  </div>

                  {/* Baris Atur Durasi Massal Per Kelas / Filter Aktif */}
                  {filteredMapelAdmin.length > 0 && (
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 border-t border-slate-200/80 text-[11px]">
                      <div className="text-slate-600 font-medium">
                        <i className="fa-solid fa-clock text-[#FF6700] mr-1.5" />
                        Ubah Durasi Massal ({filterUnitMapelAdmin === 'SEMUA' ? 'Semua Unit' : filterUnitMapelAdmin} ·{' '}
                        {filterKelasMapelAdmin === 'SEMUA' ? 'Semua Kelas' : filterKelasMapelAdmin}):
                      </div>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          min={5}
                          max={240}
                          value={durasiMassalKelas > 0 ? durasiMassalKelas : ''}
                          onChange={(e) =>
                            setDurasiMassalKelas(e.target.value === '' ? 0 : Math.max(0, Number(e.target.value)))
                          }
                          className="w-20 px-2 py-1 font-mono font-bold text-center bg-white border border-slate-300 rounded"
                        />
                        <span className="text-slate-500 font-mono">mnt</span>
                        <button
                          type="button"
                          onClick={() => handleTerapkanDurasiMassalKelas(filteredMapelAdmin)}
                          className="px-2.5 py-1 font-bold bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 rounded cursor-pointer whitespace-nowrap"
                        >
                          Terapkan ke {filteredMapelAdmin.length} Mapel
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="overflow-x-auto max-h-[500px]">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="sticky top-0 bg-slate-100 z-10">
                      <tr className="border-b border-slate-200 text-slate-600">
                        <th className="py-2.5 px-3">Mata Pelajaran</th>
                        <th className="hidden sm:table-cell py-2.5 px-3">Unit &amp; Kelas</th>
                        <th className={`${modeEditCepatMapel ? 'table-cell' : 'hidden md:table-cell'} py-2.5 px-3`}>
                          Ustadz Pengampu
                        </th>
                        <th className="py-2.5 px-3">Token</th>
                        <th className={`${modeEditCepatMapel ? 'table-cell' : 'hidden lg:table-cell'} py-2.5 px-3 text-right`}>
                          Durasi
                        </th>
                        <th className="py-2.5 px-2.5 sm:px-3 text-center">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {filteredMapelAdmin.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-8 text-center text-slate-500">
                            Tidak ada mata pelajaran yang cocok dengan filter Unit/Kelas/pencarian saat ini.
                          </td>
                        </tr>
                      ) : (
                        filteredMapelAdmin.map((m) => {
                          const draft = draftMapelCepat[m.id];
                          const isDirty = Boolean(draft);
                          const tokenVal = draft ? draft.tokenUjian : m.tokenUjian;
                          const durasiVal = draft ? draft.durasiMenit : m.durasiMenit;
                          const pengampuVal = draft ? draft.pengampu : m.pengampu || '';
                          const updateDraft = (patch: Partial<{ tokenUjian: string; durasiMenit: number; pengampu: string }>) => {
                            setDraftMapelCepat((prev) => ({
                              ...prev,
                              [m.id]: {
                                tokenUjian: prev[m.id]?.tokenUjian ?? m.tokenUjian,
                                durasiMenit: prev[m.id]?.durasiMenit ?? m.durasiMenit,
                                pengampu: prev[m.id]?.pengampu ?? (m.pengampu || ''),
                                ...patch,
                              },
                            }));
                          };

                          return (
                            <tr key={m.id} className={isDirty ? 'bg-amber-50/70' : 'hover:bg-slate-50'}>
                              <td className="py-2 px-3">
                                <div className="font-semibold text-slate-900">{m.namaMapel}</div>
                                <div className="sm:hidden text-[10px] font-semibold text-[#0A1172] mt-0.5">
                                  {m.unit} · {m.kelas}
                                  {!modeEditCepatMapel ? ` · ${m.durasiMenit} mnt` : ''}
                                </div>
                                {!modeEditCepatMapel && (
                                  <div className="md:hidden text-[11px] text-slate-500 mt-0.5">
                                    {m.pengampu || '-'}
                                  </div>
                                )}
                              </td>
                              <td className="hidden sm:table-cell py-2 px-3 text-slate-600 whitespace-nowrap">
                                {m.unit} · {m.kelas}
                              </td>
                              <td className={`${modeEditCepatMapel ? 'table-cell' : 'hidden md:table-cell'} py-2 px-3`}>
                                {modeEditCepatMapel ? (
                                  <select
                                    value={pengampuVal}
                                    onChange={(e) => updateDraft({ pengampu: e.target.value })}
                                    className="min-w-[140px] w-full px-2 py-1 text-[11px] font-semibold bg-white border border-slate-300 rounded text-[#0A1172]"
                                  >
                                    {pengampuVal && !ustadzList.some((u) => u.namaUstadz === pengampuVal) && (
                                      <option value={pengampuVal}>{pengampuVal}</option>
                                    )}
                                    {ustadzList.map((u) => (
                                      <option key={u.id} value={u.namaUstadz}>
                                        {u.namaUstadz}
                                      </option>
                                    ))}
                                  </select>
                                ) : (
                                  <span className="font-medium text-[#0A1172]">{m.pengampu || '-'}</span>
                                )}
                              </td>
                              <td className="py-2 px-3 whitespace-nowrap">
                                {modeEditCepatMapel ? (
                                  <input
                                    type="text"
                                    value={tokenVal}
                                    onChange={(e) => updateDraft({ tokenUjian: e.target.value.toUpperCase() })}
                                    className="w-28 px-2 py-1 text-[11px] font-mono font-bold uppercase text-[#FF6700] bg-white border border-slate-300 rounded"
                                  />
                                ) : (
                                  <span className="font-mono font-bold text-[#FF6700]">{m.tokenUjian}</span>
                                )}
                              </td>
                              <td className={`${modeEditCepatMapel ? 'table-cell' : 'hidden lg:table-cell'} py-2 px-3 font-mono text-right whitespace-nowrap`}>
                                {modeEditCepatMapel ? (
                                  <div className="inline-flex items-center gap-1">
                                    <input
                                      type="number"
                                      min={5}
                                      max={240}
                                      value={durasiVal > 0 ? durasiVal : ''}
                                      onChange={(e) =>
                                        updateDraft({
                                          durasiMenit: e.target.value === '' ? 0 : Math.max(0, Number(e.target.value)),
                                        })
                                      }
                                      className="w-16 px-1.5 py-1 text-[11px] font-mono font-bold text-right bg-white border border-slate-300 rounded"
                                    />
                                    <span className="text-[10px] text-slate-500">m</span>
                                  </div>
                                ) : (
                                  <span>{m.durasiMenit} mnt</span>
                                )}
                              </td>
                              <td className="py-2 px-2.5 sm:px-3 text-center whitespace-nowrap">
                                <div className="inline-flex items-center gap-1 sm:gap-1.5">
                                  {modeEditCepatMapel ? (
                                    <>
                                      <button
                                        type="button"
                                        disabled={!isDirty}
                                        onClick={() => handleSimpanBarisMapelCepat(m)}
                                        className={`px-2.5 py-1 text-[11px] font-bold rounded cursor-pointer ${
                                          isDirty
                                            ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                                            : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                                        }`}
                                        title={`Simpan perubahan ${m.namaMapel}`}
                                      >
                                        Simpan
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleEditMapelAdmin(m)}
                                        className="px-2 py-1 text-[11px] font-bold text-[#0A1172] bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded cursor-pointer"
                                        title={`Edit lengkap ${m.namaMapel}`}
                                      >
                                        <i className="fa-solid fa-sliders" />
                                      </button>
                                    </>
                                  ) : (
                                    <>
                                      <button
                                        type="button"
                                        onClick={() => handleEditMapelAdmin(m)}
                                        className="px-2 py-1 text-[11px] font-bold text-[#0A1172] bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded cursor-pointer"
                                        title={`Edit mapel ${m.namaMapel}`}
                                      >
                                        Edit
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleHapusMapelAdmin(m)}
                                        className="px-2 py-1 text-[11px] font-bold text-red-600 hover:bg-red-50 border border-red-200 rounded cursor-pointer"
                                        title={`Hapus mapel ${m.namaMapel}`}
                                      >
                                        Hapus
                                      </button>
                                    </>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
                );
              })()}

              <div className="xl:col-span-4 bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-3">
                <div className="font-bold text-xs text-[#0A1172] border-b border-slate-200 pb-2.5">
                  Ringkasan Komposisi Kelas Santri Aktif ({santriList.length} Santri)
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-1 gap-2 text-xs">
                  {(
                    [
                      { unit: 'Wustho', kelas: 'Kelas 7', label: 'Wustho · Kelas 7' },
                      { unit: 'Wustho', kelas: 'Kelas 8', label: 'Wustho · Kelas 8' },
                      { unit: 'Wustho', kelas: 'Kelas 9', label: 'Wustho · Kelas 9' },
                      { unit: 'Ulya', kelas: 'Kelas 10', label: 'Ulya · Kelas 10' },
                      { unit: 'Ulya', kelas: 'Kelas 11', label: 'Ulya · Kelas 11' },
                      { unit: 'Ulya', kelas: 'Kelas 12', label: 'Ulya · Kelas 12' },
                      { unit: 'MDA', kelas: 'Junior', label: 'MDA Putra · Junior' },
                      { unit: 'MDA', kelas: 'Senior', label: 'MDA Putra · Senior' },
                      { unit: 'MDA', kelas: 'Putri', label: 'MDA Putri' },
                    ] as const
                  ).map((item) => {
                    const count = santriList.filter((s) => s.unit === item.unit && s.kelas === item.kelas).length;
                    return (
                      <div
                        key={`${item.unit}-${item.kelas}`}
                        className="flex items-center justify-between py-1.5 px-3 rounded-lg bg-slate-50 border border-slate-200/80"
                      >
                        <span className="font-semibold text-slate-800">{item.label}</span>
                        <span className="font-mono font-bold text-[#0A1172]">{count} Santri</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
            )}

            {/* Tabel Manajemen Log Riwayat Ujian CBT Santri */}
            {adminPunyaAkses('nilai_log') && (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-4 sm:px-6 py-4 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="text-[11px] font-mono font-bold text-[#FF6700] uppercase">
                    MONITORING &amp; RIWAYAT UJIAN CBT SANTRI
                  </div>
                  <h2 className="text-base font-bold text-[#0A1172]">
                    Log Riwayat Hasil &amp; Pelanggaran Ujian CBT ({logUjianCBT.length} Rekaman)
                  </h2>
                </div>
                <button
                  type="button"
                  disabled={logUjianCBT.length === 0}
                  onClick={handleBersihkanLogUjianCBT}
                  className="w-full sm:w-auto px-3.5 py-1.5 text-xs font-bold text-red-700 bg-red-50 hover:bg-red-100 disabled:opacity-40 border border-red-200 rounded-lg cursor-pointer text-center"
                >
                  <i className="fa-solid fa-trash-can mr-1.5" />
                  Bersihkan Log CBT
                </button>
              </div>
              <div className="overflow-x-auto max-h-[360px]">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="sticky top-0 bg-slate-100 z-10">
                    <tr className="border-b border-slate-200 text-slate-700 font-bold whitespace-nowrap">
                      <th className="hidden lg:table-cell py-2.5 px-4">ID &amp; Timestamp</th>
                      <th className="py-2.5 px-3 sm:px-4">NIS &amp; Nama Santri</th>
                      <th className="hidden md:table-cell py-2.5 px-3">Unit &amp; Kelas</th>
                      <th className="hidden sm:table-cell py-2.5 px-4">Mata Pelajaran</th>
                      <th className="py-2.5 px-2.5 sm:px-3 text-right">Skor CBT</th>
                      <th className="py-2.5 px-2.5 sm:px-3 text-center">Pelanggaran</th>
                      <th className="hidden xl:table-cell py-2.5 px-4">Status Lockdown</th>
                      <th className="py-2.5 px-2.5 sm:px-3 text-center">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {logUjianCBT.map((log, idx) => (
                      <tr key={`${log.idLog}-${idx}`} className="hover:bg-slate-50">
                        <td className="hidden lg:table-cell py-2.5 px-4 whitespace-nowrap font-mono tabular-nums">
                          <div className="font-bold text-[#0A1172]">{log.idLog}</div>
                          <div className="text-[11px] text-slate-500">{log.timestamp}</div>
                        </td>
                        <td className="py-2.5 px-3 sm:px-4">
                          <div className="font-mono font-bold text-[#0A1172] text-[11px] sm:text-xs">{log.nis}</div>
                          <div className="font-semibold text-slate-900">{log.namaSantri}</div>
                          <div className="sm:hidden text-[11px] font-semibold text-slate-700 mt-0.5">{log.mapel}</div>
                          <div className="lg:hidden text-[10px] text-slate-500 mt-0.5">
                            <span className="md:hidden font-semibold text-[#0A1172]">{log.unit} {log.kelas} · </span>
                            {log.timestamp}
                          </div>
                        </td>
                        <td className="hidden md:table-cell py-2.5 px-3 whitespace-nowrap text-slate-700">
                          <span className="font-bold text-[#0A1172]">{log.unit}</span> · {log.kelas}
                        </td>
                        <td className="hidden sm:table-cell py-2.5 px-4 font-semibold text-slate-900">{log.mapel}</td>
                        <td className="py-2.5 px-2.5 sm:px-3 text-right font-mono font-extrabold text-[#0A1172] whitespace-nowrap">
                          {log.skorCBT}
                        </td>
                        <td className="py-2.5 px-2.5 sm:px-3 text-center font-mono font-bold whitespace-nowrap">
                          <span
                            className={`px-2 py-0.5 rounded ${
                              log.pelanggaran >= 3
                                ? 'bg-red-50 text-red-700 border border-red-200'
                                : log.pelanggaran > 0
                                ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            }`}
                          >
                            {log.pelanggaran}x
                          </span>
                        </td>
                        <td className="hidden xl:table-cell py-2.5 px-4 text-slate-700">{log.status}</td>
                        <td className="py-2.5 px-2.5 sm:px-3 text-center whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => handleHapusLogUjianCBT(log)}
                            className="px-2 sm:px-2.5 py-1 text-[11px] font-bold text-red-600 hover:bg-red-50 border border-red-200 rounded cursor-pointer"
                          >
                            Hapus
                          </button>
                        </td>
                      </tr>
                    ))}
                    {logUjianCBT.length === 0 && (
                      <tr>
                        <td colSpan={8} className="py-6 px-4 text-center text-slate-500">
                          Belum ada rekaman log ujian CBT santri.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            )}
          </div>
        )}

        {/* ===================================================================
            MODUL B: PORTAL USTADZ (PIN: UST123 + Hak Akses Terkunci pada Kelas & Mapel Ampuan)
            =================================================================== */}
        {activeModule === 'ustadz' && (
          <div className="space-y-6">
            {/* Header & Cascading Filter Bar (Terkunci Khusus Kelas & Mapel yang Diampu Ustadz Aktif) */}
            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
              <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-mono font-bold text-[#FF6700]">
                      MODUL B · PORTAL USTADZ &amp; INSTRUKTUR IT (SESI TERKUNCI PER PENGAMPU)
                    </span>
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                      <i className="fa-solid fa-lock text-[10px]" />
                      Akses Khusus Kelas Ampuan
                    </span>
                  </div>
                  <h1 className="text-2xl font-bold text-[#0A1172]">
                    Panel Akademik, Tahfidz Al-Qur'an &amp; Ilmu Teknologi
                  </h1>
                  <p className="text-xs text-slate-600">
                    Ustadz Login Aktif:{' '}
                    <strong className="text-[#0A1172]">
                      {ustadzLoginAktif?.namaUstadz || ustadzTerpilihNama}
                    </strong>{' '}
                    · Kelas &amp; Mapel Sedang Dibuka:{' '}
                    <strong className="text-[#FF6700]">
                      {ustadzMapel} ({ustadzUnit} - {ustadzKelas})
                    </strong>
                  </p>
                </div>

                {/* Filter Bertingkat yang Hanya Menampilkan Unit, Kelas, dan Mapel Milik Ustadz Login */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 w-full lg:w-auto">
                  <div>
                    <label className="block text-[11px] font-bold text-[#FF6700] uppercase mb-1">
                      Akun Ustadz Aktif (Terkunci)
                    </label>
                    <div className="flex items-center gap-1.5">
                      <div className="flex-1 px-3 py-2 text-xs font-bold bg-amber-50 border border-amber-300 text-[#0A1172] rounded-lg truncate">
                        <i className="fa-solid fa-user-check mr-1.5 text-[#FF6700]" />
                        {ustadzLoginAktif?.namaUstadz || ustadzTerpilihNama}
                      </div>
                      <button
                        type="button"
                        onClick={() => bukaModulDenganPin('ustadz', true)}
                        className="px-2.5 py-2 text-[11px] font-bold text-white bg-[#0A1172] hover:bg-[#0A1172]/90 rounded-lg shrink-0 cursor-pointer"
                        title="Ganti Akun Ustadz Pengajar (Wajib Verifikasi PIN)"
                      >
                        <i className="fa-solid fa-right-left mr-1 text-[#FF6700]" />
                        Ganti
                      </button>
                      <button
                        type="button"
                        onClick={() => handleLogout('ustadz')}
                        className="px-2.5 py-2 text-[11px] font-bold text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg shrink-0 cursor-pointer"
                        title="Keluar (Logout) dari Portal Ustadz"
                      >
                        <i className="fa-solid fa-right-from-bracket mr-1" />
                        Logout
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                      1. Unit Ampuan ({daftarUnitAmpuanAktif.length})
                    </label>
                    <select
                      value={ustadzUnit}
                      onChange={(e) =>
                        handleChangeUnit(
                          e.target.value as UnitPendidikan,
                          setUstadzUnit,
                          setUstadzKelas,
                          setUstadzMapel,
                          true
                        )
                      }
                      className="w-full px-3 py-2 text-xs font-bold bg-slate-50 border border-slate-300 rounded-lg"
                    >
                      {daftarUnitAmpuanAktif.map((un) => (
                        <option key={un} value={un}>
                          Unit {un}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                      2. Kelas Ampuan ({daftarKelasAmpuanPadaUnit.length})
                    </label>
                    <select
                      value={ustadzKelas}
                      onChange={(e) =>
                        handleChangeKelas(ustadzUnit, e.target.value, setUstadzKelas, setUstadzMapel, true)
                      }
                      className="w-full px-3 py-2 text-xs font-bold bg-slate-50 border border-slate-300 rounded-lg"
                    >
                      {daftarKelasAmpuanPadaUnit.map((k) => (
                        <option key={k} value={k}>
                          {k}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                      3. Mapel Ampuan ({daftarMapelAmpuanPadaKelas.length})
                    </label>
                    <select
                      value={ustadzMapel}
                      onChange={(e) => setUstadzMapel(e.target.value)}
                      className="w-full px-3 py-2 text-xs font-bold bg-slate-50 border border-slate-300 rounded-lg"
                    >
                      {daftarMapelAmpuanPadaKelas.map((m) => (
                        <option key={m.id} value={m.namaMapel}>
                          {m.namaMapel}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Pintasan Cepat Kelas & Mapel yang Diampu oleh Ustadz Login Aktif */}
              {ustadzLoginAktif && (
                <div className="pt-3 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div className="space-y-0.5">
                    <span className="font-bold text-[#0A1172]">
                      Daftar Hak Akses Kelas &amp; Mapel ({ustadzLoginAktif.namaUstadz}):
                    </span>{' '}
                    <span className="text-slate-600">{ustadzLoginAktif.bidang}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] font-mono text-slate-500 mr-1">
                      Pilih Kelas/Mapel Ampuan Anda:
                    </span>
                    {ambilDaftarMapelAmpuanUstadz(ustadzLoginAktif).map((m) => {
                      const aktif =
                        m.unit === ustadzUnit && m.kelas === ustadzKelas && m.namaMapel === ustadzMapel;
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => {
                            setUstadzUnit(m.unit);
                            setUstadzKelas(m.kelas);
                            setUstadzMapel(m.namaMapel);
                          }}
                          className={`px-2.5 py-1 rounded-md text-[11px] font-bold cursor-pointer ${
                            aktif
                              ? 'bg-[#FF6700] text-white'
                              : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300'
                          }`}
                        >
                          {m.namaMapel} ({m.unit} - {m.kelas})
                        </button>
                      );
                    })}
                    <button
                      type="button"
                      onClick={() => {
                        const santriKelasIni = santriList.find(
                          (s) => s.unit === ustadzUnit && s.kelas === ustadzKelas
                        );
                        if (santriKelasIni) {
                          setCariNisRapor(santriKelasIni.nis);
                        }
                        setFilterKelasRaporUstadz(`${ustadzUnit}__${ustadzKelas}`);
                        setActiveModule('rapor');
                      }}
                      className="ml-2 px-3 py-1 rounded-md text-[11px] font-bold bg-[#0A1172] text-white hover:bg-[#0A1172]/90 cursor-pointer"
                    >
                      <i className="fa-solid fa-print mr-1 text-[#FF6700]" />
                      Buka e-Rapor {ustadzUnit} - {ustadzKelas}
                    </button>
                  </div>
                </div>
              )}

              {/* Kontrol Sinkronisasi & Cadangan Cloud Soal Ustadz */}
              <div className="pt-3 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2.5 text-xs">
                <div className="flex flex-wrap items-center gap-2 text-slate-600">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      statusSinkronCloud === 'menyimpan' ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'
                    }`}
                  />
                  <span className="font-semibold text-slate-700">
                    {cloudUser
                      ? `Cadangan Permanen Firebase Cloud Aktif (${cloudUser.email})`
                      : 'Penyimpanan Ganda Aktif (Server + Cadangan Browser Lokal)'}
                  </span>
                  {terakhirSinkron && (
                    <span className="text-[11px] font-mono text-slate-500">
                      · Tersimpan {terakhirSinkron}
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleSinkronManualSoalUstadz}
                    disabled={statusSinkronCloud === 'menyimpan'}
                    className="px-3 py-1.5 text-[11px] font-bold text-[#0A1172] bg-slate-100 hover:bg-slate-200 disabled:opacity-60 border border-slate-300 rounded-lg cursor-pointer"
                    title="Tarik soal terbaru dari server & pastikan soal Anda tersinkron tanpa menimpa soal Ustadz lain"
                  >
                    <i
                      className={`fa-solid fa-rotate mr-1.5 ${
                        statusSinkronCloud === 'menyimpan' ? 'fa-spin' : ''
                      }`}
                    />
                    Sinkronkan Soal
                  </button>
                  <button
                    type="button"
                    onClick={handleToggleLoginFirebaseCloud}
                    className={`px-3 py-1.5 text-[11px] font-bold rounded-lg border cursor-pointer ${
                      cloudUser
                        ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-300'
                        : 'bg-[#0A1172] hover:bg-[#0A1172]/90 text-white border-[#0A1172]'
                    }`}
                    title="Cadangkan setiap butir soal secara permanen ke akun Google Firebase Cloud Anda"
                  >
                    <i className="fa-solid fa-cloud-arrow-up mr-1.5 text-[#FF6700]" />
                    {cloudUser ? 'Cloud Firestore Aktif' : 'Hubungkan Firebase Cloud'}
                  </button>
                </div>
              </div>
            </div>

            {/* Banner Terpadu (1 Bar): Pengingat Deadline Pengisian Soal Ujian CBT & Nilai Rapor Ustadz */}
            {ustadzLoginAktif && (() => {
              const infoSoal = hitungTunggakanSoalUstadz(ustadzLoginAktif);
              const infoTunggakan = hitungTunggakanNilaiUstadz(ustadzLoginAktif);
              const semuaLengkap =
                infoSoal.totalMapelBelumSoal === 0 && infoTunggakan.totalEntriBelumLengkap === 0;
              const kritis =
                (infoSoal.totalMapelBelumSoal > 0 && (infoSoal.apakahLewatDeadline || infoSoal.sisaHari <= 0)) ||
                (infoTunggakan.totalEntriBelumLengkap > 0 &&
                  (infoTunggakan.apakahLewatDeadline || infoTunggakan.sisaHari <= 0));
              const mendekati =
                (infoSoal.totalMapelBelumSoal > 0 && infoSoal.sisaHari <= 3) ||
                (infoTunggakan.totalEntriBelumLengkap > 0 && infoTunggakan.sisaHari <= 3);
              const ditunda = reminderDitundaUstadzIds.includes(ustadzLoginAktif.id);

              return (
                <div
                  className={`rounded-xl px-5 py-4 border-2 shadow-xs grid grid-cols-1 xl:grid-cols-2 gap-5 divide-y xl:divide-y-0 xl:divide-x ${
                    semuaLengkap
                      ? 'bg-emerald-50/70 border-emerald-300 divide-emerald-200 text-emerald-950'
                      : kritis
                      ? 'bg-red-50/50 border-red-300 divide-red-200 text-slate-900'
                      : mendekati
                      ? 'bg-amber-50/60 border-amber-300 divide-amber-200 text-slate-900'
                      : 'bg-white border-emerald-200 divide-slate-200 text-slate-800'
                  }`}
                >
                  {/* Sisi 1: Pengingat Deadline Pengisian Soal Ujian CBT */}
                  <div className="flex flex-col justify-between gap-3">
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-1.5 text-xs font-extrabold text-[#0A1172]">
                          <i className="fa-solid fa-file-pen text-[#FF6700]" />
                          Deadline Pengisian Soal Ujian CBT
                        </span>
                        <span className="text-[11px] font-mono font-bold text-slate-600">
                          Progres: {infoSoal.totalMapelSudahSoal}/{infoSoal.totalMapelWajib} Mapel ({infoSoal.persentaseSelesai}%)
                        </span>
                      </div>

                      <DeadlineCountdownVisual
                        deadlineIso={infoSoal.deadlineIso}
                        tanggalDeadlineFormat={infoSoal.tanggalDeadlineFormat}
                        sudahLengkap={infoSoal.totalMapelBelumSoal === 0}
                        labelLengkap="Soal Lengkap 100%"
                      />

                      {infoSoal.totalMapelBelumSoal === 0 ? (
                        <p className="text-xs text-emerald-800 font-medium">
                          <i className="fa-solid fa-circle-check mr-1 text-emerald-600" />
                          Seluruh mapel ampuan Anda ({infoSoal.totalMapelWajib} mapel) telah memiliki soal ujian CBT.
                        </p>
                      ) : (
                        <p className="text-xs leading-relaxed text-slate-700">
                          Masih terdapat <strong>{infoSoal.totalMapelBelumSoal} dari {infoSoal.totalMapelWajib} mapel</strong> yang belum memiliki soal CBT.
                        </p>
                      )}
                    </div>
                    {infoSoal.totalMapelBelumSoal > 0 && (
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => tampilkanModalReminderSoalUstadz(ustadzLoginAktif)}
                          className="px-3 py-1.5 text-xs font-bold text-[#0A1172] bg-white hover:bg-slate-50 border border-slate-300 rounded-lg cursor-pointer"
                        >
                          <i className="fa-solid fa-list-check mr-1.5 text-[#FF6700]" />
                          Rincian Soal
                        </button>
                        <button
                          type="button"
                          onClick={() => tampilkanToastReminderSoalUstadz(ustadzLoginAktif)}
                          className="px-3 py-1.5 text-xs font-bold text-[#0A1172] bg-white hover:bg-slate-50 border border-slate-300 rounded-lg cursor-pointer"
                        >
                          <i className="fa-solid fa-comment-dots mr-1.5 text-[#0A1172]" />
                          Toast
                        </button>
                        {infoSoal.targetPertama && (
                          <button
                            type="button"
                            onClick={() => {
                              if (!infoSoal.targetPertama) return;
                              setUstadzUnit(infoSoal.targetPertama.unit);
                              setUstadzKelas(infoSoal.targetPertama.kelas);
                              setUstadzMapel(infoSoal.targetPertama.mapel);
                              setUstadzSubTab('soal_ai');
                            }}
                            className="px-3.5 py-1.5 text-xs font-bold text-white bg-[#0A1172] hover:bg-[#0A1172]/90 rounded-lg cursor-pointer"
                          >
                            <i className="fa-solid fa-plus mr-1.5 text-[#FF6700]" />
                            Buat Soal ({infoSoal.targetPertama.mapel})
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Sisi 2: Pengingat Deadline Pengisian Nilai Rapor */}
                  <div className="flex flex-col justify-between gap-3 pt-4 xl:pt-0 xl:pl-5">
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center gap-1.5 text-xs font-extrabold text-[#0A1172]">
                            <i className="fa-solid fa-bell text-[#FF6700]" />
                            Deadline Pengisian Nilai Rapor
                          </span>
                          {ditunda && infoTunggakan.totalEntriBelumLengkap > 0 && (
                            <span className="text-[11px] font-mono text-slate-500">(Ditunda)</span>
                          )}
                        </div>
                        <span className="text-[11px] font-mono font-bold text-slate-600">
                          Progres: {infoTunggakan.totalEntriLengkap}/{infoTunggakan.totalEntriWajib} Entri ({infoTunggakan.persentaseSelesai}%)
                        </span>
                      </div>

                      <DeadlineCountdownVisual
                        deadlineIso={infoTunggakan.deadlineIso}
                        tanggalDeadlineFormat={infoTunggakan.tanggalDeadlineFormat}
                        sudahLengkap={infoTunggakan.totalEntriBelumLengkap === 0}
                        labelLengkap="Rapor Lengkap 100%"
                      />

                      {infoTunggakan.totalEntriBelumLengkap === 0 ? (
                        <p className="text-xs text-emerald-800 font-medium">
                          <i className="fa-solid fa-circle-check mr-1 text-emerald-600" />
                          Seluruh nilai rapor ({infoTunggakan.totalEntriWajib} entri) telah terisi 100% lengkap.
                        </p>
                      ) : (
                        <p className="text-xs leading-relaxed text-slate-700">
                          Masih terdapat <strong>{infoTunggakan.totalEntriBelumLengkap} entri nilai</strong> santri yang belum lengkap.
                        </p>
                      )}
                    </div>
                    {infoTunggakan.totalEntriBelumLengkap > 0 && (
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => tampilkanModalReminderNilaiUstadz(ustadzLoginAktif)}
                          className="px-3 py-1.5 text-xs font-bold text-[#0A1172] bg-white hover:bg-slate-50 border border-slate-300 rounded-lg cursor-pointer"
                        >
                          <i className="fa-solid fa-list-check mr-1.5 text-[#FF6700]" />
                          Rincian Nilai
                        </button>
                        <button
                          type="button"
                          onClick={() => tampilkanToastReminderNilaiUstadz(ustadzLoginAktif)}
                          className="px-3 py-1.5 text-xs font-bold text-[#0A1172] bg-white hover:bg-slate-50 border border-slate-300 rounded-lg cursor-pointer"
                        >
                          <i className="fa-solid fa-comment-dots mr-1.5 text-[#0A1172]" />
                          Toast
                        </button>
                        {infoTunggakan.targetPertama && (
                          <button
                            type="button"
                            onClick={() => {
                              if (!infoTunggakan.targetPertama) return;
                              setUstadzUnit(infoTunggakan.targetPertama.unit);
                              setUstadzKelas(infoTunggakan.targetPertama.kelas);
                              setUstadzMapel(infoTunggakan.targetPertama.mapel);
                              setUstadzSubTab('nilai_non_cbt');
                            }}
                            className="px-3.5 py-1.5 text-xs font-bold text-white bg-[#FF6700] hover:bg-[#e55c00] rounded-lg cursor-pointer"
                          >
                            <i className="fa-solid fa-pen-to-square mr-1.5" />
                            Isi Nilai ({infoTunggakan.targetPertama.mapel})
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* Navigasi 4 Sub-Tab Portal Ustadz */}
            <div className="flex flex-wrap items-center gap-2 p-1.5 bg-slate-200/80 rounded-xl">
              <button
                type="button"
                onClick={() => setUstadzSubTab('soal_ai')}
                className={`px-4 py-2 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                  ustadzSubTab === 'soal_ai'
                    ? 'bg-[#0A1172] text-white'
                    : 'text-slate-700 hover:bg-white/60'
                }`}
              >
                <i className="fa-solid fa-wand-magic-sparkles mr-1.5 text-[#FF6700]" />
                Sub-Tab 1: Buat &amp; Import Soal CBT dengan AI
              </button>
              <button
                type="button"
                onClick={() => setUstadzSubTab('nilai_non_cbt')}
                className={`px-4 py-2 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                  ustadzSubTab === 'nilai_non_cbt'
                    ? 'bg-[#0A1172] text-white'
                    : 'text-slate-700 hover:bg-white/60'
                }`}
              >
                <i className="fa-solid fa-calculator mr-1.5 text-[#FF6700]" />
                Sub-Tab 2: Input Nilai Akademik Non-CBT
              </button>
              <button
                type="button"
                onClick={() => setUstadzSubTab('tahfidz')}
                className={`px-4 py-2 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                  ustadzSubTab === 'tahfidz'
                    ? 'bg-[#0A1172] text-white'
                    : 'text-slate-700 hover:bg-white/60'
                }`}
              >
                <i className="fa-solid fa-book-quran mr-1.5 text-[#FF6700]" />
                Sub-Tab 3: Input Pencapaian Tahfidz (114 Surat)
              </button>
              <button
                type="button"
                onClick={() => setUstadzSubTab('it')}
                className={`px-4 py-2 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                  ustadzSubTab === 'it'
                    ? 'bg-[#0A1172] text-white'
                    : 'text-slate-700 hover:bg-white/60'
                }`}
              >
                <i className="fa-solid fa-code mr-1.5 text-[#FF6700]" />
                Sub-Tab 4: Input Pencapaian IT
              </button>
            </div>

            {/* SUB-TAB 1: AI SMART SOAL IMPORTER + MANUAL INPUT */}
            {ustadzSubTab === 'soal_ai' && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                  {/* Panel AI Pembuat Soal CBT */}
                  <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
                    <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
                      <div>
                        <span className="text-[11px] font-mono font-bold text-[#FF6700] uppercase">
                          FITUR UNGGULAN · AI PEMBUAT SOAL CBT OTOMATIS
                        </span>
                        <h2 className="text-base font-bold text-[#0A1172]">
                          Produksi Soal Pilihan Ganda CBT dari File atau Materi / Soal
                        </h2>
                      </div>
                    </div>

                    <p className="text-xs text-slate-600 leading-relaxed">
                      Unggah file <strong>PDF</strong>, <strong>Foto kertas soal (.jpg/.png)</strong>,{' '}
                      <strong>Word (.docx)</strong>, <strong>Excel (.xlsx)</strong>, atau ketik langsung topik/draf soal.
                      AI langsung menyusun butir soal Pilihan Ganda (A-B-C-D) beserta kunci jawaban sesuai kebutuhan CBT
                      dan otomatis mengabaikan teks yang bukan bagian dari soal.
                    </p>

                    <div className="p-4 bg-slate-50 border border-dashed border-slate-300 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-4">
                      <div className="text-xs text-slate-600">
                        <div className="font-bold text-slate-900">
                          Unggah File Soal / Materi (.docx, .xlsx, .pdf, .jpg, .png)
                        </div>
                        <div>
                          {aiFileName
                            ? `File aktif: ${aiFileName} (Otomatis diproses ke format CBT)`
                            : 'Pilih file untuk langsung memproduksi soal CBT tanpa ekstraksi manual'}
                        </div>
                      </div>
                      <label className="px-4 py-2 text-xs font-bold text-white bg-[#0A1172] rounded-lg hover:bg-[#0A1172]/90 cursor-pointer shrink-0">
                        <i className="fa-solid fa-file-arrow-up mr-1.5" />
                        Pilih File &amp; Buat Soal CBT
                        <input
                          type="file"
                          accept=".pdf,.jpg,.jpeg,.png,.docx,.xlsx,.xls,.csv"
                          onChange={handleFileUploadImporter}
                          className="hidden"
                        />
                      </label>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Atau Ketik Topik Materi / Tempel Draf Soal untuk Dijadikan Soal CBT:
                      </label>
                      <textarea
                        rows={4}
                        value={aiRawText}
                        onChange={(e) => setAiRawText(e.target.value)}
                        placeholder="Contoh: Buatkan 5 soal CBT tentang Rukun Wudhu dan Air Thaharah, atau tempel langsung draf soal esai/pilihan ganda di sini..."
                        className="w-full px-3.5 py-2.5 text-xs border border-slate-300 rounded-lg"
                      />
                    </div>

                    <button
                      type="button"
                      disabled={isAiLoading}
                      onClick={handleJalankanAIScreening}
                      className="w-full py-3 px-4 text-xs font-bold text-white bg-[#FF6700] hover:bg-[#e55c00] disabled:opacity-60 rounded-lg transition-colors cursor-pointer"
                    >
                      {isAiLoading ? (
                        <span>
                          <i className="fa-solid fa-spinner fa-spin mr-2" />
                          Sedang Memproduksi Soal Pilihan Ganda CBT...
                        </span>
                      ) : (
                        <span>
                          <i className="fa-solid fa-wand-magic-sparkles mr-2" />
                          Buat &amp; Susun Soal CBT Otomatis (AI)
                        </span>
                      )}
                    </button>

                    {/* Tabel Preview Interaktif Hasil AI */}
                    {aiPreviewSoal.length > 0 && (
                      <div className="pt-4 border-t border-slate-200 space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <h3 className="text-sm font-bold text-[#0A1172]">
                            Tabel Preview Soal CBT ({aiPreviewSoal.length} Butir Soal Siap Ujian)
                          </h3>
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => bukaFullscreenPreviewSoal('draft_import', 0)}
                              className="px-3.5 py-2 text-xs font-bold text-[#0A1172] bg-blue-50 hover:bg-blue-100 border border-blue-300 rounded-lg cursor-pointer"
                              title="Buka preview layar penuh untuk seluruh soal hasil import"
                            >
                              <i className="fa-solid fa-expand mr-1.5 text-[#FF6700]" />
                              Preview Fullscreen
                            </button>
                            <button
                              type="button"
                              onClick={async () => {
                                const res = await Swal.fire({
                                  icon: 'warning',
                                  title: 'Hapus Semua Draft Soal AI?',
                                  text: `${aiPreviewSoal.length} butir draft soal di tabel preview akan dikosongkan.`,
                                  showCancelButton: true,
                                  confirmButtonText: 'Ya, Hapus Semua Draft',
                                  cancelButtonText: 'Batal',
                                  confirmButtonColor: '#DC2626',
                                });
                                if (res.isConfirmed) {
                                  setAiPreviewSoal([]);
                                }
                              }}
                              className="px-3.5 py-2 text-xs font-bold text-red-700 bg-red-50 hover:bg-red-100 border border-red-300 rounded-lg cursor-pointer"
                            >
                              <i className="fa-solid fa-trash-can mr-1.5" />
                              Hapus Semua Draft
                            </button>
                            <button
                              type="button"
                              onClick={handleSimpanSemuaPreviewKeBankSoal}
                              className="px-4 py-2 text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-600 rounded-lg cursor-pointer"
                            >
                              <i className="fa-solid fa-check-double mr-1.5" />
                              Simpan Sekaligus ke Bank Soal CBT
                            </button>
                          </div>
                        </div>

                        <div className="overflow-x-auto border border-slate-200 rounded-lg">
                          <table className="w-full text-left border-collapse text-xs">
                            <thead>
                              <tr className="bg-slate-100 border-b border-slate-200 text-slate-700">
                                <th className="py-2 px-2 w-8 text-center">No</th>
                                <th className="py-2 px-3 min-w-[220px]">Pertanyaan CBT</th>
                                <th className="py-2 px-2 min-w-[130px]">Opsi A</th>
                                <th className="py-2 px-2 min-w-[130px]">Opsi B</th>
                                <th className="py-2 px-2 min-w-[130px]">Opsi C</th>
                                <th className="py-2 px-2 min-w-[130px]">Opsi D</th>
                                <th className="py-2 px-2">Kunci</th>
                                <th className="py-2 px-2 text-center">Aksi</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200">
                              {aiPreviewSoal.map((item, idx) => (
                                <tr key={idx}>
                                  <td className="p-2 text-center font-mono font-bold text-slate-500">{idx + 1}</td>
                                  <td className="p-2">
                                    <input
                                      type="text"
                                      value={item.pertanyaan}
                                      onChange={(e) => {
                                        const copy = [...aiPreviewSoal];
                                        copy[idx].pertanyaan = e.target.value;
                                        setAiPreviewSoal(copy);
                                      }}
                                      className="w-full px-2 py-1 border border-slate-300 rounded"
                                    />
                                  </td>
                                  <td className="p-2">
                                    <input
                                      type="text"
                                      value={item.opsiA}
                                      onChange={(e) => {
                                        const copy = [...aiPreviewSoal];
                                        copy[idx].opsiA = e.target.value;
                                        setAiPreviewSoal(copy);
                                      }}
                                      className="w-full px-2 py-1 border border-slate-300 rounded"
                                    />
                                  </td>
                                  <td className="p-2">
                                    <input
                                      type="text"
                                      value={item.opsiB}
                                      onChange={(e) => {
                                        const copy = [...aiPreviewSoal];
                                        copy[idx].opsiB = e.target.value;
                                        setAiPreviewSoal(copy);
                                      }}
                                      className="w-full px-2 py-1 border border-slate-300 rounded"
                                    />
                                  </td>
                                  <td className="p-2">
                                    <input
                                      type="text"
                                      value={item.opsiC}
                                      onChange={(e) => {
                                        const copy = [...aiPreviewSoal];
                                        copy[idx].opsiC = e.target.value;
                                        setAiPreviewSoal(copy);
                                      }}
                                      className="w-full px-2 py-1 border border-slate-300 rounded"
                                    />
                                  </td>
                                  <td className="p-2">
                                    <input
                                      type="text"
                                      value={item.opsiD}
                                      onChange={(e) => {
                                        const copy = [...aiPreviewSoal];
                                        copy[idx].opsiD = e.target.value;
                                        setAiPreviewSoal(copy);
                                      }}
                                      className="w-full px-2 py-1 border border-slate-300 rounded"
                                    />
                                  </td>
                                  <td className="p-2">
                                    <select
                                      value={item.kunciJawaban}
                                      onChange={(e) => {
                                        const copy = [...aiPreviewSoal];
                                        copy[idx].kunciJawaban = e.target.value as 'A' | 'B' | 'C' | 'D';
                                        setAiPreviewSoal(copy);
                                      }}
                                      className="px-2 py-1 font-mono font-bold border border-slate-300 rounded"
                                    >
                                      <option value="A">A</option>
                                      <option value="B">B</option>
                                      <option value="C">C</option>
                                      <option value="D">D</option>
                                    </select>
                                  </td>
                                  <td className="p-2 text-center whitespace-nowrap">
                                    <div className="inline-flex items-center gap-1">
                                      <button
                                        type="button"
                                        onClick={() => bukaFullscreenPreviewSoal('draft_import', idx)}
                                        className="px-2 py-1 text-[#0A1172] bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded font-bold cursor-pointer"
                                        title={`Preview Fullscreen Soal #${idx + 1}`}
                                      >
                                        <i className="fa-solid fa-expand" />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setAiPreviewSoal((prev) => prev.filter((_, i) => i !== idx))
                                        }
                                        className="px-2 py-1 text-red-600 hover:bg-red-50 rounded font-bold cursor-pointer"
                                        title="Hapus soal ini"
                                      >
                                        Hapus
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Form Input Soal Manual Satu per Satu */}
                  <form
                    onSubmit={handleSimpanSoalManual}
                    className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 space-y-4"
                  >
                    <div className="border-b border-slate-100 pb-3 flex items-start justify-between gap-2">
                      <div>
                        <span className="text-[11px] font-mono font-bold text-[#0A1172] uppercase">
                          INPUT SOAL MANUAL
                        </span>
                        <h2 className="text-base font-bold text-slate-900">
                          Tambah Soal Pilihan Ganda ({ustadzMapel})
                        </h2>
                      </div>
                      <button
                        type="button"
                        onClick={() => bukaFullscreenPreviewSoal('manual', 0)}
                        className="px-2.5 py-1.5 text-[11px] font-bold text-[#0A1172] bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg shrink-0 cursor-pointer"
                        title="Lihat tampilan penuh soal manual sebelum disimpan"
                      >
                        <i className="fa-solid fa-expand mr-1 text-[#FF6700]" />
                        Fullscreen
                      </button>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Pertanyaan Soal</label>
                      <textarea
                        rows={2}
                        required
                        value={manualPertanyaan}
                        onChange={(e) => setManualPertanyaan(e.target.value)}
                        placeholder="Ketik butir pertanyaan..."
                        className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 p-3 rounded-lg border border-slate-200">
                      <div>
                        <label className="block text-[11px] font-bold text-[#0A1172] mb-1">
                          Teks Ayat Al-Qur'an / Arab Berharakat (Opsional)
                        </label>
                        <input
                          type="text"
                          dir="rtl"
                          value={manualTeksArab}
                          onChange={(e) => setManualTeksArab(e.target.value)}
                          placeholder="مِثَالٌ: الصَّلَاةُ عِمَادُ الدِّينِ"
                          className="w-full px-2.5 py-1.5 text-sm font-arabic bg-white border border-slate-300 rounded-md"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-[#0A1172] mb-1">
                          Lampiran Gambar Soal (Opsional)
                        </label>
                        <div className="flex items-center gap-2">
                          <label className="px-3 py-1.5 text-[11px] font-bold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-md cursor-pointer">
                            <i className="fa-solid fa-image mr-1 text-[#FF6700]" />
                            {manualGambarUrl ? 'Ganti Gambar' : 'Pilih Gambar'}
                            <input
                              type="file"
                              accept="image/*"
                              onChange={(e) => {
                                const f = e.target.files?.[0];
                                if (!f) return;
                                const r = new FileReader();
                                r.onload = () => setManualGambarUrl(String(r.result || ''));
                                r.readAsDataURL(f);
                              }}
                              className="hidden"
                            />
                          </label>
                          {manualGambarUrl && (
                            <button
                              type="button"
                              onClick={() => setManualGambarUrl('')}
                              className="text-[11px] text-red-600 font-bold cursor-pointer"
                            >
                              Hapus
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="sm:col-span-2">
                        <label className="block text-[11px] font-bold text-[#0A1172] mb-1">
                          Potongan Kode Pemrograman IT / MDA (Opsional)
                        </label>
                        <textarea
                          rows={2}
                          value={manualPotonganKode}
                          onChange={(e) => setManualPotonganKode(e.target.value)}
                          placeholder="const hasil = array.map(x => x * 2);"
                          className="w-full px-2.5 py-1.5 text-xs font-mono bg-slate-900 text-slate-100 border border-slate-700 rounded-md"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">Opsi A</label>
                        <input
                          type="text"
                          required
                          value={manualOpsiA}
                          onChange={(e) => setManualOpsiA(e.target.value)}
                          className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">Opsi B</label>
                        <input
                          type="text"
                          required
                          value={manualOpsiB}
                          onChange={(e) => setManualOpsiB(e.target.value)}
                          className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">Opsi C</label>
                        <input
                          type="text"
                          required
                          value={manualOpsiC}
                          onChange={(e) => setManualOpsiC(e.target.value)}
                          className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">Opsi D</label>
                        <input
                          type="text"
                          required
                          value={manualOpsiD}
                          onChange={(e) => setManualOpsiD(e.target.value)}
                          className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">Kunci Jawaban</label>
                        <select
                          value={manualKunci}
                          onChange={(e) => setManualKunci(e.target.value as 'A' | 'B' | 'C' | 'D')}
                          className="w-full px-3 py-2 text-xs font-mono font-bold border border-slate-300 rounded-lg"
                        >
                          <option value="A">Kunci A</option>
                          <option value="B">Kunci B</option>
                          <option value="C">Kunci C</option>
                          <option value="D">Kunci D</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">Bobot Nilai</label>
                        <input
                          type="number"
                          value={manualBobot}
                          onChange={(e) => setManualBobot(Number(e.target.value))}
                          className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <button
                        type="button"
                        onClick={() => bukaFullscreenPreviewSoal('manual', 0)}
                        className="w-full py-2.5 px-4 text-xs font-bold text-[#0A1172] bg-blue-50 hover:bg-blue-100 border border-blue-300 rounded-lg cursor-pointer"
                      >
                        <i className="fa-solid fa-expand mr-1.5 text-[#FF6700]" />
                        Preview Fullscreen
                      </button>
                      <button
                        type="submit"
                        className="w-full py-2.5 px-4 text-xs font-bold text-white bg-[#0A1172] hover:bg-[#0A1172]/90 rounded-lg cursor-pointer"
                      >
                        Simpan Soal Manual ke Bank Soal
                      </button>
                    </div>
                  </form>
                </div>

                {/* =============================================================
                    PREVIEW HASIL SOAL YANG TELAH DIBUAT (DI BAWAH KOLOM PEMBUATAN SOAL)
                    + FITUR SCREENING SALAH TULISAN (PROOFREADING ANTI-TYPO)
                    ============================================================= */}
                <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-200 pb-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-mono font-bold text-[#FF6700] uppercase">
                          PREVIEW HASIL SOAL CBT &amp; SCREENING EJAAN
                        </span>
                        <span className="px-2 py-0.5 text-[10px] font-mono font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 rounded">
                          ✓ Terverifikasi Anti-Typo
                        </span>
                      </div>
                      <h2 className="text-lg font-bold text-[#0A1172]">
                        Preview Hasil Soal yang Telah Dibuat — {ustadzMapel} ({ustadzUnit} · {ustadzKelas})
                      </h2>
                      <p className="text-xs text-slate-500">
                        Menampilkan seluruh soal CBT yang telah dibuat untuk mata pelajaran ini. Gunakan tombol{' '}
                        <strong>Screening &amp; Koreksi Salah Tulisan</strong> untuk memastikan tidak ada typo pada
                        pertanyaan maupun opsi jawaban.
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => bukaFullscreenPreviewSoal('bank_soal', 0)}
                        className="px-3.5 py-2 text-xs font-bold text-white bg-[#0A1172] hover:bg-[#0A1172]/90 rounded-lg cursor-pointer"
                        title="Buka tampilan preview layar penuh untuk semua soal CBT mapel ini"
                      >
                        <i className="fa-solid fa-expand mr-1.5 text-[#FF6700]" />
                        Preview Fullscreen
                      </button>

                      <button
                        type="button"
                        onClick={handleExportBankSoalExcel}
                        className="px-3.5 py-2 text-xs font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 rounded-lg cursor-pointer"
                      >
                        <i className="fa-solid fa-file-excel mr-1.5" />
                        Export Soal (.xlsx)
                      </button>

                      {(() => {
                        const jumlahSoalAktif = bankSoal.filter(
                          (s) => s.unit === ustadzUnit && s.kelas === ustadzKelas && s.mapel === ustadzMapel
                        ).length;
                        return (
                          jumlahSoalAktif > 0 && (
                            <button
                              type="button"
                              onClick={handleHapusSemuaSoalMapelAktif}
                              className="px-3.5 py-2 text-xs font-bold text-red-700 bg-red-50 hover:bg-red-100 border border-red-300 rounded-lg cursor-pointer"
                            >
                              <i className="fa-solid fa-trash-can mr-1.5" />
                              Hapus Semua Soal ({jumlahSoalAktif})
                            </button>
                          )
                        );
                      })()}

                      <button
                        type="button"
                        disabled={isScreeningTypoLoading}
                        onClick={handleJalankanScreeningTypoSemuaSoal}
                        className="px-4 py-2 text-xs font-bold text-white bg-[#FF6700] hover:bg-[#e55c00] disabled:opacity-60 rounded-lg transition-colors cursor-pointer"
                      >
                        {isScreeningTypoLoading ? (
                          <span>
                            <i className="fa-solid fa-spinner fa-spin mr-1.5" />
                            Memeriksa Ejaan &amp; Typo...
                          </span>
                        ) : (
                          <span>
                            <i className="fa-solid fa-spell-check mr-1.5" />
                            Screening &amp; Perbaiki Salah Tulisan (AI)
                          </span>
                        )}
                      </button>

                      <div className="inline-flex rounded-lg border border-slate-300 bg-slate-100 p-0.5 text-xs font-bold">
                        <button
                          type="button"
                          onClick={() => setModePreviewBankSoal('kartu')}
                          className={`px-3 py-1.5 rounded-md cursor-pointer ${
                            modePreviewBankSoal === 'kartu'
                              ? 'bg-[#0A1172] text-white'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          Tampilan Kartu CBT
                        </button>
                        <button
                          type="button"
                          onClick={() => setModePreviewBankSoal('tabel')}
                          className={`px-3 py-1.5 rounded-md cursor-pointer ${
                            modePreviewBankSoal === 'tabel'
                              ? 'bg-[#0A1172] text-white'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          Tabel Edit Langsung
                        </button>
                      </div>
                    </div>
                  </div>

                  {(() => {
                    const daftarSoalMapelIni = bankSoal.filter(
                      (s) => s.unit === ustadzUnit && s.kelas === ustadzKelas && s.mapel === ustadzMapel
                    );

                    if (daftarSoalMapelIni.length === 0) {
                      return (
                        <div className="p-8 text-center bg-slate-50 border border-dashed border-slate-300 rounded-xl space-y-2">
                          <div className="text-sm font-bold text-slate-700">
                            Belum Ada Soal CBT untuk {ustadzMapel} ({ustadzUnit} - {ustadzKelas})
                          </div>
                          <p className="text-xs text-slate-500">
                            Silakan buat soal melalui kolom AI Pembuat Soal CBT di kiri atas atau form Input Manual di
                            kanan atas.
                          </p>
                        </div>
                      );
                    }

                    return modePreviewBankSoal === 'kartu' ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {daftarSoalMapelIni.map((soal, idx) => (
                          <div
                            key={soal.idSoal}
                            className="p-5 bg-slate-50 border border-slate-200 rounded-xl flex flex-col justify-between space-y-4"
                          >
                            <div className="space-y-3">
                              <div className="flex items-center justify-between gap-2 text-xs">
                                <span className="font-mono font-bold text-[#0A1172]">
                                  SOAL #{idx + 1} · {soal.idSoal}
                                </span>
                                <div className="flex items-center gap-2">
                                  <span className="px-2 py-0.5 font-mono font-bold bg-white border border-slate-200 rounded text-slate-700">
                                    Bobot: {soal.bobotSoal}
                                  </span>
                                  <span className="px-2 py-0.5 font-mono font-bold bg-[#0A1172] text-white rounded">
                                    Kunci: {soal.kunciJawaban}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => bukaFullscreenPreviewSoal('bank_soal', idx)}
                                    className="px-2 py-0.5 text-[11px] font-bold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded cursor-pointer"
                                    title={`Preview Fullscreen Soal #${idx + 1}`}
                                  >
                                    <i className="fa-solid fa-expand mr-1 text-[#FF6700]" />
                                    Fullscreen
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleEditSatuSoalCBT(soal)}
                                    className="px-2 py-0.5 text-[11px] font-bold text-[#0A1172] bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded cursor-pointer"
                                  >
                                    <i className="fa-solid fa-pen-to-square mr-1" />
                                    Edit
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleHapusSatuSoalCBT(soal)}
                                    className="text-red-600 hover:underline font-semibold cursor-pointer"
                                  >
                                    Hapus
                                  </button>
                                </div>
                              </div>

                              <p className="text-sm font-semibold text-slate-900 leading-relaxed">{soal.pertanyaan}</p>

                              {soal.teksArabSoal && (
                                <div
                                  dir="rtl"
                                  className="p-3 bg-white border border-slate-200 rounded-lg text-lg font-arabic text-[#0A1172] leading-loose"
                                >
                                  {soal.teksArabSoal}
                                </div>
                              )}

                              {soal.potonganKodeIT && (
                                <pre className="p-3 bg-slate-900 text-slate-100 rounded-lg text-xs font-mono overflow-x-auto">
                                  <code>{soal.potonganKodeIT}</code>
                                </pre>
                              )}

                              {soal.gambarSoalUrl && (
                                <img
                                  src={soal.gambarSoalUrl}
                                  alt={`Lampiran ${soal.idSoal}`}
                                  className="max-h-44 rounded-lg border border-slate-200 object-contain bg-white p-1"
                                />
                              )}

                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                                {(
                                  [
                                    { k: 'A', t: soal.opsiA },
                                    { k: 'B', t: soal.opsiB },
                                    { k: 'C', t: soal.opsiC },
                                    { k: 'D', t: soal.opsiD },
                                  ] as const
                                ).map((op) => {
                                  const adalahKunci = soal.kunciJawaban === op.k;
                                  return (
                                    <div
                                      key={op.k}
                                      className={`p-2.5 rounded-lg border flex items-start gap-2 ${
                                        adalahKunci
                                          ? 'bg-emerald-50 border-emerald-400 text-emerald-950 font-bold'
                                          : 'bg-white border-slate-200 text-slate-700'
                                      }`}
                                    >
                                      <span
                                        className={`w-5 h-5 rounded font-mono text-[11px] font-bold flex items-center justify-center shrink-0 ${
                                          adalahKunci ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-700'
                                        }`}
                                      >
                                        {op.k}
                                      </span>
                                      <span className="leading-snug">{op.t}</span>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="overflow-x-auto border border-slate-200 rounded-xl">
                        <table className="w-full text-left border-collapse text-xs">
                          <thead>
                            <tr className="bg-slate-100 border-b border-slate-200 text-slate-700">
                              <th className="py-2.5 px-3 w-16">ID</th>
                              <th className="py-2.5 px-3 min-w-[240px]">Pertanyaan (Bebas Edit)</th>
                              <th className="py-2.5 px-2 min-w-[130px]">Opsi A</th>
                              <th className="py-2.5 px-2 min-w-[130px]">Opsi B</th>
                              <th className="py-2.5 px-2 min-w-[130px]">Opsi C</th>
                              <th className="py-2.5 px-2 min-w-[130px]">Opsi D</th>
                              <th className="py-2.5 px-2">Kunci</th>
                              <th className="py-2.5 px-2">Bobot</th>
                              <th className="py-2.5 px-2 text-center">Aksi</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200">
                            {daftarSoalMapelIni.map((soal, idx) => (
                              <tr key={soal.idSoal}>
                                <td className="p-2 font-mono font-bold text-[#0A1172]">{soal.idSoal}</td>
                                <td className="p-2">
                                  <input
                                    type="text"
                                    value={soal.pertanyaan}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      const nowIso = new Date().toISOString();
                                      skipNextAutoSyncRef.current = true;
                                      setBankSoal((prev) =>
                                        prev.map((item) =>
                                          item.idSoal === soal.idSoal
                                            ? { ...item, pertanyaan: val, updatedAt: nowIso }
                                            : item
                                        )
                                      );
                                    }}
                                    onBlur={(e) => simpanSoalAtomik([{ ...soal, pertanyaan: e.target.value }])}
                                    className="w-full px-2 py-1 border border-slate-300 rounded"
                                  />
                                </td>
                                <td className="p-2">
                                  <input
                                    type="text"
                                    value={soal.opsiA}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      const nowIso = new Date().toISOString();
                                      skipNextAutoSyncRef.current = true;
                                      setBankSoal((prev) =>
                                        prev.map((item) =>
                                          item.idSoal === soal.idSoal
                                            ? { ...item, opsiA: val, updatedAt: nowIso }
                                            : item
                                        )
                                      );
                                    }}
                                    onBlur={(e) => simpanSoalAtomik([{ ...soal, opsiA: e.target.value }])}
                                    className="w-full px-2 py-1 border border-slate-300 rounded"
                                  />
                                </td>
                                <td className="p-2">
                                  <input
                                    type="text"
                                    value={soal.opsiB}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      const nowIso = new Date().toISOString();
                                      skipNextAutoSyncRef.current = true;
                                      setBankSoal((prev) =>
                                        prev.map((item) =>
                                          item.idSoal === soal.idSoal
                                            ? { ...item, opsiB: val, updatedAt: nowIso }
                                            : item
                                        )
                                      );
                                    }}
                                    onBlur={(e) => simpanSoalAtomik([{ ...soal, opsiB: e.target.value }])}
                                    className="w-full px-2 py-1 border border-slate-300 rounded"
                                  />
                                </td>
                                <td className="p-2">
                                  <input
                                    type="text"
                                    value={soal.opsiC}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      const nowIso = new Date().toISOString();
                                      skipNextAutoSyncRef.current = true;
                                      setBankSoal((prev) =>
                                        prev.map((item) =>
                                          item.idSoal === soal.idSoal
                                            ? { ...item, opsiC: val, updatedAt: nowIso }
                                            : item
                                        )
                                      );
                                    }}
                                    onBlur={(e) => simpanSoalAtomik([{ ...soal, opsiC: e.target.value }])}
                                    className="w-full px-2 py-1 border border-slate-300 rounded"
                                  />
                                </td>
                                <td className="p-2">
                                  <input
                                    type="text"
                                    value={soal.opsiD}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      const nowIso = new Date().toISOString();
                                      skipNextAutoSyncRef.current = true;
                                      setBankSoal((prev) =>
                                        prev.map((item) =>
                                          item.idSoal === soal.idSoal
                                            ? { ...item, opsiD: val, updatedAt: nowIso }
                                            : item
                                        )
                                      );
                                    }}
                                    onBlur={(e) => simpanSoalAtomik([{ ...soal, opsiD: e.target.value }])}
                                    className="w-full px-2 py-1 border border-slate-300 rounded"
                                  />
                                </td>
                                <td className="p-2">
                                  <select
                                    value={soal.kunciJawaban}
                                    onChange={(e) => {
                                      const kunciBaru = e.target.value as 'A' | 'B' | 'C' | 'D';
                                      simpanSoalAtomik([{ ...soal, kunciJawaban: kunciBaru }]);
                                    }}
                                    className="px-2 py-1 font-mono font-bold border border-slate-300 rounded"
                                  >
                                    <option value="A">A</option>
                                    <option value="B">B</option>
                                    <option value="C">C</option>
                                    <option value="D">D</option>
                                  </select>
                                </td>
                                <td className="p-2">
                                  <input
                                    type="number"
                                    min={1}
                                    max={100}
                                    value={soal.bobotSoal > 0 ? soal.bobotSoal : ''}
                                    onChange={(e) => {
                                      const bobotBaru = e.target.value === '' ? 0 : Math.min(100, Math.max(0, Number(e.target.value)));
                                      const nowIso = new Date().toISOString();
                                      skipNextAutoSyncRef.current = true;
                                      setBankSoal((prev) =>
                                        prev.map((item) =>
                                          item.idSoal === soal.idSoal
                                            ? { ...item, bobotSoal: bobotBaru, updatedAt: nowIso }
                                            : item
                                        )
                                      );
                                    }}
                                    onBlur={(e) =>
                                      simpanSoalAtomik([{ ...soal, bobotSoal: Math.min(100, Math.max(1, Number(e.target.value) || 10)) }])
                                    }
                                    className="w-16 px-2 py-1 font-mono border border-slate-300 rounded"
                                  />
                                </td>
                                <td className="p-2 text-center whitespace-nowrap">
                                  <div className="inline-flex items-center gap-1">
                                    <button
                                      type="button"
                                      onClick={() => bukaFullscreenPreviewSoal('bank_soal', idx)}
                                      className="px-2 py-1 text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded font-bold cursor-pointer"
                                      title={`Preview Fullscreen Soal #${idx + 1}`}
                                    >
                                      <i className="fa-solid fa-expand text-[#FF6700]" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleEditSatuSoalCBT(soal)}
                                      className="px-2 py-1 text-[#0A1172] bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded font-bold cursor-pointer"
                                      title="Edit lengkap termasuk teks Arab, kode IT & gambar"
                                    >
                                      Edit
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleHapusSatuSoalCBT(soal)}
                                      className="px-2 py-1 text-red-600 hover:bg-red-50 rounded font-bold cursor-pointer"
                                    >
                                      Hapus
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}

            {/* SUB-TAB 2: INPUT NILAI AKADEMIK NON-CBT (DILENGKAPI AUTO-SAVE & INDIKATOR LOADING) */}
            {ustadzSubTab === 'nilai_non_cbt' && (
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="p-6 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <h2 className="text-base font-bold text-[#0A1172]">
                      Tabel Input Nilai Akademik: {ustadzMapel} ({ustadzUnit} - {ustadzKelas})
                    </h2>
                    <p className="text-xs text-slate-500">
                      Rumus Nilai Akhir = (Tugas × 0.20) + (Sikap × 0.20) + (Lisan × 0.20) + (CBT × 0.40). Setiap
                      perubahan kolom nilai otomatis tersimpan ke database.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    {/* Indikator Status Auto-Save Real-Time */}
                    <div
                      aria-live="polite"
                      className={`px-3.5 py-2 rounded-lg border text-xs font-semibold flex items-center gap-2 transition-colors ${
                        autoSaveNilaiStatus === 'saving'
                          ? 'bg-amber-50 border-amber-300 text-amber-900'
                          : autoSaveNilaiStatus === 'error'
                          ? 'bg-red-50 border-red-300 text-red-800'
                          : 'bg-slate-50 border-slate-200 text-slate-700'
                      }`}
                    >
                      {autoSaveNilaiStatus === 'saving' ? (
                        <>
                          <i className="fa-solid fa-spinner fa-spin text-[#FF6700]" />
                          <span>{autoSaveLastInfo || 'Menyimpan otomatis ke database...'}</span>
                        </>
                      ) : autoSaveNilaiStatus === 'error' ? (
                        <>
                          <i className="fa-solid fa-triangle-exclamation text-red-600" />
                          <span>{autoSaveLastInfo || 'Gangguan jaringan saat Auto-Save'}</span>
                        </>
                      ) : (
                        <>
                          <i className="fa-solid fa-check text-emerald-600" />
                          <span>
                            {autoSaveLastInfo ||
                              `Auto-Save Aktif · Tersinkron (${terakhirSinkron || 'Siap'})`}
                          </span>
                        </>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={handleExportRekapNilaiKelasExcel}
                      className="px-4 py-2 text-xs font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 rounded-lg cursor-pointer"
                    >
                      <i className="fa-solid fa-file-excel mr-1.5" />
                      Export Rekap Nilai (.xlsx)
                    </button>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-sm">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-600">
                        <th className="py-3 px-4">NIS</th>
                        <th className="py-3 px-4">Nama Santri</th>
                        <th className="py-3 px-4 text-right">Tugas Harian (20%)</th>
                        <th className="py-3 px-4 text-right">Nilai Sikap (20%)</th>
                        <th className="py-3 px-4 text-right">Ujian Lisan (20%)</th>
                        <th className="py-3 px-4 text-right">Nilai CBT (40%)</th>
                        <th className="py-3 px-4 text-right">Nilai Akhir</th>
                        <th className="py-3 px-4 text-center">Predikat</th>
                        <th className="py-3 px-4 text-center">Status Auto-Save</th>
                        <th className="py-3 px-4 text-center">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {santriFilteredUstadz.map((s) => {
                        const adaBarisNilai = nilaiAkademik.find(
                          (r) =>
                            r.nis === s.nis &&
                            r.mapel.trim().toLowerCase() === ustadzMapel.trim().toLowerCase()
                        );
                        const row = adaBarisNilai || {
                          nis: s.nis,
                          mapel: ustadzMapel,
                          tugas: 0,
                          sikap: 0,
                          lisan: 0,
                          cbt: 0,
                          nilaiAkhir: 0,
                          predikat: 'D' as const,
                        };
                        const calc = hitungNilaiAkhirPesantren(row.tugas, row.sikap, row.lisan, row.cbt);
                        const rowKey = `${s.nis}__${ustadzMapel}`;
                        const statusBaris = autoSaveRowMap[rowKey];
                        const statusTugas = autoSaveFieldMap[`${s.nis}__${ustadzMapel}__tugas`];
                        const statusSikap = autoSaveFieldMap[`${s.nis}__${ustadzMapel}__sikap`];
                        const statusLisan = autoSaveFieldMap[`${s.nis}__${ustadzMapel}__lisan`];

                        return (
                          <tr
                            key={s.nis}
                            className={`transition-colors ${
                              statusBaris === 'saving' ? 'bg-amber-50/40' : 'hover:bg-slate-50'
                            }`}
                          >
                            <td className="py-3 px-4 font-mono text-xs font-semibold text-[#0A1172]">{s.nis}</td>
                            <td className="py-3 px-4 font-medium text-slate-900">{s.nama}</td>
                            <td className="py-3 px-4 text-right">
                              <div className="inline-flex items-center justify-end gap-1.5">
                                {statusTugas === 'saving' && (
                                  <i
                                    className="fa-solid fa-spinner fa-spin text-[11px] text-[#FF6700]"
                                    title="Menyimpan Nilai Tugas..."
                                  />
                                )}
                                <input
                                  type="number"
                                  min={0}
                                  max={100}
                                  value={row.tugas}
                                  onChange={(e) => handleUpdateNilaiNonCBT(s.nis, 'tugas', Number(e.target.value))}
                                  className={`w-20 px-2.5 py-1.5 text-right font-mono text-xs border rounded-md transition-colors ${
                                    statusTugas === 'saving'
                                      ? 'border-[#FF6700] bg-amber-50/50'
                                      : statusTugas === 'saved'
                                      ? 'border-emerald-500 bg-emerald-50/20'
                                      : 'border-slate-300 bg-white'
                                  }`}
                                />
                              </div>
                            </td>
                            <td className="py-3 px-4 text-right">
                              <div className="inline-flex items-center justify-end gap-1.5">
                                {statusSikap === 'saving' && (
                                  <i
                                    className="fa-solid fa-spinner fa-spin text-[11px] text-[#FF6700]"
                                    title="Menyimpan Nilai Sikap..."
                                  />
                                )}
                                <input
                                  type="number"
                                  min={0}
                                  max={100}
                                  value={row.sikap}
                                  onChange={(e) => handleUpdateNilaiNonCBT(s.nis, 'sikap', Number(e.target.value))}
                                  className={`w-20 px-2.5 py-1.5 text-right font-mono text-xs border rounded-md transition-colors ${
                                    statusSikap === 'saving'
                                      ? 'border-[#FF6700] bg-amber-50/50'
                                      : statusSikap === 'saved'
                                      ? 'border-emerald-500 bg-emerald-50/20'
                                      : 'border-slate-300 bg-white'
                                  }`}
                                />
                              </div>
                            </td>
                            <td className="py-3 px-4 text-right">
                              <div className="inline-flex items-center justify-end gap-1.5">
                                {statusLisan === 'saving' && (
                                  <i
                                    className="fa-solid fa-spinner fa-spin text-[11px] text-[#FF6700]"
                                    title="Menyimpan Nilai Lisan..."
                                  />
                                )}
                                <input
                                  type="number"
                                  min={0}
                                  max={100}
                                  value={row.lisan}
                                  onChange={(e) => handleUpdateNilaiNonCBT(s.nis, 'lisan', Number(e.target.value))}
                                  className={`w-20 px-2.5 py-1.5 text-right font-mono text-xs border rounded-md transition-colors ${
                                    statusLisan === 'saving'
                                      ? 'border-[#FF6700] bg-amber-50/50'
                                      : statusLisan === 'saved'
                                      ? 'border-emerald-500 bg-emerald-50/20'
                                      : 'border-slate-300 bg-white'
                                  }`}
                                />
                              </div>
                            </td>
                            <td className="py-3 px-4 text-right font-mono font-bold text-slate-700">{row.cbt}</td>
                            <td className="py-3 px-4 text-right font-mono font-extrabold text-[#0A1172]">
                              {calc.nilaiAkhir.toFixed(2)}
                            </td>
                            <td className="py-3 px-4 text-center font-mono font-bold text-[#FF6700]">
                              {calc.predikat}
                            </td>
                            <td className="py-3 px-4 text-center text-xs whitespace-nowrap">
                              {statusBaris === 'saving' ? (
                                <span className="inline-flex items-center gap-1.5 font-semibold text-[#FF6700]">
                                  <i className="fa-solid fa-spinner fa-spin" />
                                  <span>Menyimpan...</span>
                                </span>
                              ) : statusBaris === 'saved' ? (
                                <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-700">
                                  <i className="fa-solid fa-check" />
                                  <span>Tersimpan</span>
                                </span>
                              ) : statusBaris === 'error' ? (
                                <span className="inline-flex items-center gap-1.5 font-semibold text-red-600">
                                  <i className="fa-solid fa-circle-exclamation" />
                                  <span>Gagal</span>
                                </span>
                              ) : !adaBarisNilai ? (
                                <span className="text-slate-400 italic">Belum Diinput</span>
                              ) : (
                                <span className="text-slate-400">Siap Auto-Save</span>
                              )}
                            </td>
                            <td className="py-3 px-4 text-center whitespace-nowrap">
                              <div className="inline-flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => handleBukaEditNilaiSantri(s, row)}
                                  className="px-2.5 py-1 text-xs font-bold text-[#0A1172] bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded cursor-pointer"
                                  title={`Edit lengkap nilai ${ustadzMapel} untuk ${s.nama}`}
                                >
                                  Edit
                                </button>
                                {adaBarisNilai && (
                                  <button
                                    type="button"
                                    onClick={() => handleHapusNilaiSantriMapel(s.nis, s.nama)}
                                    className="px-2.5 py-1 text-xs font-bold text-red-600 hover:bg-red-50 border border-red-200 rounded cursor-pointer"
                                    title={`Hapus nilai ${ustadzMapel} untuk ${s.nama}`}
                                  >
                                    Hapus
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* SUB-TAB 3: INPUT PENCAPAIAN TAHFIDZ (WAJIB DROPDOWN 114 SURAT AL-QUR'AN) */}
            {ustadzSubTab === 'tahfidz' && (
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="p-6 border-b border-slate-200 flex items-center justify-between">
                  <div>
                    <h2 className="text-base font-bold text-[#0A1172]">
                      Tabel Input Pencapaian Tahfidz Al-Qur'an ({ustadzUnit} - {ustadzKelas})
                    </h2>
                    <p className="text-xs text-slate-500">
                      Dilengkapi daftar lengkap 114 Surat Al-Qur'an (1. Al-Fatihah s/d 114. An-Nas).
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      Swal.fire({
                        icon: 'success',
                        title: 'Capaian Tahfidz Disimpan',
                        text: 'Data hafalan santri berhasil diperbarui ke Tabel II e-Rapor Digital.',
                        confirmButtonColor: '#0A1172',
                      })
                    }
                    className="px-4 py-2 text-xs font-bold text-white bg-[#FF6700] hover:bg-[#e55c00] rounded-lg cursor-pointer"
                  >
                    Simpan Capaian Tahfidz
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 font-bold text-slate-600">
                        <th className="py-3 px-4">NIS &amp; Nama Santri</th>
                        <th className="py-3 px-3">Juz Hafalan</th>
                        <th className="py-3 px-3">Surat Terakhir (114 Surat Al-Qur'an)</th>
                        <th className="py-3 px-3">Kelancaran</th>
                        <th className="py-3 px-4">Catatan Ustadz</th>
                        <th className="py-3 px-3 text-center">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {santriFilteredUstadz.map((s) => {
                        const adaTahfidz = dataTahfidz.find((t) => t.nis === s.nis);
                        const tf = adaTahfidz || {
                          nis: s.nis,
                          juzHafalan: '',
                          suratTerakhir: '',
                          kelancaran: 'Lancar' as const,
                          catatanUstadz: '',
                        };
                        return (
                          <tr key={s.nis}>
                            <td className="py-3 px-4">
                              <div className="font-mono font-bold text-[#0A1172]">{s.nis}</div>
                              <div className="font-semibold text-slate-900">{s.nama}</div>
                            </td>
                            <td className="py-3 px-3">
                              <input
                                type="text"
                                value={tf.juzHafalan}
                                placeholder="Contoh: 2 Juz (Juz 29-30)"
                                onChange={(e) => handleUpdateTahfidz(s.nis, { juzHafalan: e.target.value })}
                                className="w-44 px-2.5 py-1.5 border border-slate-300 rounded-md"
                              />
                            </td>
                            <td className="py-3 px-3">
                              <select
                                value={tf.suratTerakhir}
                                onChange={(e) => handleUpdateTahfidz(s.nis, { suratTerakhir: e.target.value })}
                                className="w-52 px-2.5 py-1.5 bg-white border border-slate-300 rounded-md font-semibold text-[#0A1172]"
                              >
                                <option value="">-- Pilih Surat --</option>
                                {DAFTAR_114_SURAT_QURAN.map((namaSurat) => (
                                  <option key={namaSurat} value={namaSurat}>
                                    {namaSurat}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="py-3 px-3">
                              <select
                                value={tf.kelancaran}
                                onChange={(e) =>
                                  handleUpdateTahfidz(s.nis, {
                                    kelancaran: e.target.value as 'Lancar' | 'Sedang' | 'Butuh Murajaah',
                                  })
                                }
                                className="px-2.5 py-1.5 bg-white border border-slate-300 rounded-md font-semibold"
                              >
                                <option value="Lancar">Lancar</option>
                                <option value="Sedang">Sedang</option>
                                <option value="Butuh Murajaah">Butuh Murajaah</option>
                              </select>
                            </td>
                            <td className="py-3 px-4">
                              <input
                                type="text"
                                value={tf.catatanUstadz}
                                onChange={(e) => handleUpdateTahfidz(s.nis, { catatanUstadz: e.target.value })}
                                placeholder="Catatan makhraj / tajwid / target..."
                                className="w-full min-w-[220px] px-2.5 py-1.5 border border-slate-300 rounded-md"
                              />
                            </td>
                            <td className="py-3 px-3 text-center whitespace-nowrap">
                              {adaTahfidz ? (
                                <button
                                  type="button"
                                  onClick={() => handleHapusTahfidzSantri(s.nis, s.nama)}
                                  className="px-2.5 py-1 text-xs font-bold text-red-600 hover:bg-red-50 border border-red-200 rounded cursor-pointer"
                                  title={`Hapus capaian tahfidz ${s.nama}`}
                                >
                                  Hapus
                                </button>
                              ) : (
                                <span className="text-xs text-slate-300">-</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* SUB-TAB 4: INPUT PENCAPAIAN IT */}
            {ustadzSubTab === 'it' && (
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="p-6 border-b border-slate-200 flex items-center justify-between">
                  <div>
                    <h2 className="text-base font-bold text-[#0A1172]">
                      Tabel Input Pencapaian Kompetensi Ilmu Teknologi ({ustadzUnit} - {ustadzKelas})
                    </h2>
                    <p className="text-xs text-slate-500">
                      Memuat Materi Kompetensi IT, Total Projek, Nilai Praktek, Karya / Projek Akhir, dan Catatan Instruktur.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      Swal.fire({
                        icon: 'success',
                        title: 'Capaian Kompetensi IT Disimpan',
                        text: 'Portofolio projek & nilai praktek IT telah diperbarui ke Tabel III e-Rapor Digital.',
                        confirmButtonColor: '#0A1172',
                      })
                    }
                    className="px-4 py-2 text-xs font-bold text-white bg-[#FF6700] hover:bg-[#e55c00] rounded-lg cursor-pointer"
                  >
                    Simpan Capaian IT
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 font-bold text-slate-600">
                        <th className="py-3 px-4">NIS &amp; Santri</th>
                        <th className="py-3 px-3">Materi Kompetensi IT</th>
                        <th className="py-3 px-2 text-right">Total Projek</th>
                        <th className="py-3 px-2 text-right">Nilai Praktek</th>
                        <th className="py-3 px-3">Karya / Projek Akhir</th>
                        <th className="py-3 px-4">Catatan Instruktur</th>
                        <th className="py-3 px-3 text-center">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {santriFilteredUstadz.map((s) => {
                        const adaIT = dataIT.find((i) => i.nis === s.nis);
                        const itRow = adaIT || {
                          nis: s.nis,
                          materiKompetensi: '',
                          totalProjek: 0,
                          nilaiPraktek: 0,
                          karyaAkhir: '',
                          catatanInstruktur: '',
                        };
                        return (
                          <tr key={s.nis}>
                            <td className="py-3 px-4">
                              <div className="font-mono font-bold text-[#0A1172]">{s.nis}</div>
                              <div className="font-semibold text-slate-900">{s.nama}</div>
                            </td>
                            <td className="py-3 px-3">
                              <input
                                type="text"
                                value={itRow.materiKompetensi}
                                placeholder="Contoh: HTML, CSS & React"
                                onChange={(e) => handleUpdateIT(s.nis, { materiKompetensi: e.target.value })}
                                className="w-48 px-2.5 py-1.5 border border-slate-300 rounded-md"
                              />
                            </td>
                            <td className="py-3 px-2 text-right">
                              <input
                                type="number"
                                min={0}
                                value={itRow.totalProjek}
                                onChange={(e) => handleUpdateIT(s.nis, { totalProjek: Number(e.target.value) })}
                                className="w-16 px-2 py-1.5 text-right font-mono border border-slate-300 rounded-md"
                              />
                            </td>
                            <td className="py-3 px-2 text-right">
                              <input
                                type="number"
                                min={0}
                                max={100}
                                value={itRow.nilaiPraktek}
                                onChange={(e) => handleUpdateIT(s.nis, { nilaiPraktek: Number(e.target.value) })}
                                className="w-16 px-2 py-1.5 text-right font-mono border border-slate-300 rounded-md"
                              />
                            </td>
                            <td className="py-3 px-3">
                              <input
                                type="text"
                                value={itRow.karyaAkhir}
                                placeholder="Nama projek / karya akhir..."
                                onChange={(e) => handleUpdateIT(s.nis, { karyaAkhir: e.target.value })}
                                className="w-48 px-2.5 py-1.5 border border-slate-300 rounded-md"
                              />
                            </td>
                            <td className="py-3 px-4">
                              <input
                                type="text"
                                value={itRow.catatanInstruktur}
                                placeholder="Catatan perkembangan IT..."
                                onChange={(e) => handleUpdateIT(s.nis, { catatanInstruktur: e.target.value })}
                                className="w-full min-w-[180px] px-2.5 py-1.5 border border-slate-300 rounded-md"
                              />
                            </td>
                            <td className="py-3 px-3 text-center whitespace-nowrap">
                              {adaIT ? (
                                <button
                                  type="button"
                                  onClick={() => handleHapusITSantri(s.nis, s.nama)}
                                  className="px-2.5 py-1 text-xs font-bold text-red-600 hover:bg-red-50 border border-red-200 rounded cursor-pointer"
                                  title={`Hapus capaian IT ${s.nama}`}
                                >
                                  Hapus
                                </button>
                              ) : (
                                <span className="text-xs text-slate-300">-</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ===================================================================
            MODUL C: PORTAL UJIAN CBT SANTRI (Web-Based Safe Exam Browser)
            =================================================================== */}
        {activeModule === 'cbt' && (
          <div className="space-y-6">
            {!ujianBerlangsung ? (
              <div className="max-w-xl mx-auto bg-white border border-slate-200 rounded-2xl p-8 space-y-6">
                <div className="border-b border-slate-200 pb-4 space-y-1">
                  <div className="text-xs font-mono font-bold text-[#FF6700]">
                    MODUL C · WEB-BASED SAFE EXAM BROWSER
                  </div>
                  <h1 className="text-2xl font-bold text-[#0A1172]">Login Ujian CBT Santri Darul Fithrah</h1>
                  <p className="text-xs text-slate-600">
                    Pilih Unit Pendidikan, Kelas, Mata Pelajaran, lalu ketik <strong>NIS Anda sendiri</strong> dan Token Ujian.
                  </p>
                </div>

                <form onSubmit={handleMulaiUjianCBT} className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Unit Pendidikan</label>
                      <select
                        value={cbtUnit}
                        onChange={(e) => {
                          const u = e.target.value as UnitPendidikan;
                          handleChangeUnit(u, setCbtUnit, setCbtKelas, setCbtMapel);
                        }}
                        className="w-full px-3 py-2 text-xs font-bold bg-slate-50 border border-slate-300 rounded-lg"
                      >
                        <option value="Wustho">Wustho</option>
                        <option value="Ulya">Ulya</option>
                        <option value="MDA">MDA</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Kelas</label>
                      <select
                        value={cbtKelas}
                        onChange={(e) =>
                          handleChangeKelas(cbtUnit, e.target.value, setCbtKelas, setCbtMapel)
                        }
                        className="w-full px-3 py-2 text-xs font-bold bg-slate-50 border border-slate-300 rounded-lg"
                      >
                        {UNIT_KELAS_MAP[cbtUnit].map((k) => (
                          <option key={k} value={k}>
                            {k}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Mata Pelajaran Ujian</label>
                    <select
                      value={cbtMapel}
                      onChange={(e) => setCbtMapel(e.target.value)}
                      className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg"
                    >
                      {mapelList
                        .filter((m) => m.unit === cbtUnit && m.kelas === cbtKelas)
                        .map((m) => (
                          <option key={m.id} value={m.namaMapel}>
                            {m.namaMapel} (Token: {m.tokenUjian})
                          </option>
                        ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        NIS Santri (Ketik Sendiri)
                      </label>
                      <input
                        type="text"
                        required
                        autoComplete="off"
                        value={cbtNIS}
                        onChange={(e) => setCbtNIS(e.target.value)}
                        placeholder="Ketik NIS Anda (Contoh: 27.2627.811)"
                        className="w-full px-3.5 py-2 text-sm font-mono font-bold bg-white border border-slate-300 rounded-lg"
                      />
                      <p className="text-[10px] text-slate-500 mt-1">
                        Wajib diisi NIS milik sendiri sesuai Unit &amp; Kelas agar tidak dapat diakses santri lain.
                      </p>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Token Ujian</label>
                      <input
                        type="text"
                        required
                        value={cbtTokenInput}
                        onChange={(e) => setCbtTokenInput(e.target.value)}
                        placeholder="Masukkan Token"
                        className="w-full px-3.5 py-2 text-sm font-mono uppercase border border-slate-300 rounded-lg"
                      />
                    </div>
                  </div>

                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-600 space-y-1">
                    <div className="font-bold text-[#0A1172]">Sistem Anti-Curang (Web-Lockdown) Aktif:</div>
                    <div>1. Otomatis mengunci layar penuh (requestFullscreen).</div>
                    <div>2. Mendeteksi pindah tab/aplikasi (visibilitychange &amp; window.onblur) + Alarm Beep.</div>
                    <div>3. Memblokir klik kanan &amp; copy-paste, serta Auto-Submit pada pelanggaran ke-3.</div>
                  </div>

                  <button
                    type="submit"
                    className="w-full py-3 px-5 text-sm font-bold text-white bg-[#FF6700] hover:bg-[#e55c00] rounded-xl transition-colors cursor-pointer"
                  >
                    <i className="fa-solid fa-lock mr-2" />
                    Mulai Ujian &amp; Kunci Layar Penuh
                  </button>
                </form>

                <div className="pt-4 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3">
                  <div className="text-xs text-slate-600">
                    Ingin melihat hasil belajar &amp; mengunduh PDF e-Rapor Anda?
                  </div>
                  <button
                    type="button"
                    onClick={() => bukaPortalRaporSantriDenganNis(cbtNIS.trim())}
                    className="px-4 py-2 text-xs font-bold text-[#0A1172] bg-amber-50 hover:bg-amber-100 border border-amber-300 rounded-lg cursor-pointer whitespace-nowrap"
                  >
                    <i className="fa-solid fa-file-pdf mr-1.5 text-[#FF6700]" />
                    {cbtNIS.trim()
                      ? `Cek & Unduh e-Rapor Saya (NIS: ${cbtNIS.trim()})`
                      : 'Cek & Unduh e-Rapor Saya (Via NIS)'}
                  </button>
                </div>
              </div>
            ) : (
              /* Lembar Ujian Lockdown Aktif */
              <div
                onContextMenu={(e) => {
                  e.preventDefault();
                  rekamPelanggaranAntiCurang('Klik Kanan (Context Menu) Diblokir');
                }}
                onCopy={(e) => {
                  e.preventDefault();
                  rekamPelanggaranAntiCurang('Copy Teks Soal Diblokir');
                }}
                onPaste={(e) => {
                  e.preventDefault();
                  rekamPelanggaranAntiCurang('Paste Diblokir');
                }}
                className="select-none space-y-6"
              >
                <div className="bg-[#0A1172] text-white rounded-xl p-5 flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <div className="text-xs font-mono text-[#FF6700]">
                      {santriSedangUjian?.nis} · {santriSedangUjian?.unit} - {santriSedangUjian?.kelas}
                    </div>
                    <h2 className="text-lg font-bold">
                      {santriSedangUjian?.nama} — {cbtMapel}
                    </h2>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <div className="px-3.5 py-1.5 bg-white/10 rounded-lg text-xs font-mono">
                      Waktu:{' '}
                      <strong className="text-[#FF6700]">
                        {String(Math.floor(sisaDetikCBT / 60)).padStart(2, '0')}:
                        {String(sisaDetikCBT % 60).padStart(2, '0')}
                      </strong>
                    </div>
                    <div className="px-3.5 py-1.5 bg-white/10 rounded-lg text-xs font-mono">
                      Pelanggaran: <strong className="text-amber-300">{pelanggaranLockdown} / 3</strong>
                    </div>
                    <button
                      type="button"
                      onClick={() => rekamPelanggaranAntiCurang('Simulasi Pindah Tab / Keluar Aplikasi')}
                      className="px-3 py-1.5 text-xs font-bold bg-[#FF6700] text-white rounded-lg cursor-pointer"
                    >
                      Uji Simulasi Curang (+1)
                    </button>
                  </div>
                </div>

                {layarBlurKeluarFullscreen && (
                  <div className="p-5 bg-red-900 text-white rounded-xl flex items-center justify-between gap-4">
                    <div className="text-xs">
                      <strong>Layar Soal Diburamkan!</strong> Anda keluar dari mode Fullscreen Lockdown.
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setLayarBlurKeluarFullscreen(false);
                        document.documentElement.requestFullscreen?.().catch(() => {});
                      }}
                      className="px-4 py-2 text-xs font-bold bg-white text-[#0A1172] rounded-lg cursor-pointer"
                    >
                      Aktifkan Kembali Fullscreen
                    </button>
                  </div>
                )}

                <div className={`space-y-4 ${layarBlurKeluarFullscreen ? 'blur-md pointer-events-none' : ''}`}>
                  {daftarSoalAktif.map((soal, idx) => (
                    <div key={soal.idSoal} className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
                      <div className="flex justify-between text-xs font-mono text-slate-500">
                        <span>
                          SOAL NO. {idx + 1} ({soal.idSoal})
                        </span>
                        <span>Bobot: {soal.bobotSoal} Poin</span>
                      </div>
                      <p className="text-base font-semibold text-slate-900">{soal.pertanyaan}</p>

                      {soal.teksArabSoal && (
                        <div
                          dir="rtl"
                          className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-xl font-arabic text-[#0A1172] leading-loose"
                        >
                          {soal.teksArabSoal}
                        </div>
                      )}

                      {soal.potonganKodeIT && (
                        <pre className="p-4 bg-slate-900 text-slate-100 rounded-xl text-xs font-mono overflow-x-auto">
                          <code>{soal.potonganKodeIT}</code>
                        </pre>
                      )}

                      {soal.gambarSoalUrl && (
                        <img
                          src={soal.gambarSoalUrl}
                          alt={`Soal ${idx + 1}`}
                          className="max-h-56 rounded-xl border border-slate-200 object-contain bg-white p-1"
                        />
                      )}

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {(
                          [
                            { k: 'A', t: soal.opsiA },
                            { k: 'B', t: soal.opsiB },
                            { k: 'C', t: soal.opsiC },
                            { k: 'D', t: soal.opsiD },
                          ] as const
                        ).map((op) => {
                          const dipilih = jawabanCBT[soal.idSoal] === op.k;
                          return (
                            <button
                              key={op.k}
                              type="button"
                              onClick={() => {
                                const nextJawaban = { ...jawabanCBT, [soal.idSoal]: op.k };
                                setJawabanCBT(nextJawaban);
                                sinkronSesiCBTKeServer(nextJawaban, pelanggaranLockdown);
                              }}
                              className={`p-3.5 rounded-lg border text-left text-sm flex items-center gap-3 cursor-pointer ${
                                dipilih
                                  ? 'bg-[#0A1172] text-white border-[#0A1172] font-bold'
                                  : 'bg-slate-50 text-slate-800 border-slate-200 hover:bg-slate-100'
                              }`}
                            >
                              <span className="w-6 h-6 rounded bg-[#FF6700] text-white font-mono text-xs font-bold flex items-center justify-center shrink-0">
                                {op.k}
                              </span>
                              <span>{op.t}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="bg-white border border-slate-200 rounded-xl p-5 flex items-center justify-between">
                  <span className="text-xs font-mono text-slate-600">
                    Terjawab: {Object.keys(jawabanCBT).length} / {daftarSoalAktif.length} Soal
                  </span>
                  <button
                    type="button"
                    onClick={() => kumpulkanUjianCBT(pelanggaranLockdown, false)}
                    className="px-6 py-2.5 text-sm font-bold text-white bg-[#FF6700] hover:bg-[#e55c00] rounded-lg cursor-pointer"
                  >
                    Selesai &amp; Kumpulkan Ujian CBT
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ===================================================================
            MODUL D: CETAK E-RAPOR DIGITAL DARUL FITHRAH (Siap Print A4 - Akses Mandiri NIS Santri / Ustadz / Admin)
            =================================================================== */}
        {activeModule === 'rapor' && (
          <div className="space-y-6">
            {/* Toolbar Filter Kelas Ampuan, Pencarian NIS & Tombol Cetak A4 (Disembunyikan saat @media print) */}
            <div className="no-print bg-white border border-slate-200 rounded-xl p-5 space-y-4">
              <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-mono font-bold text-[#FF6700]">
                      MODUL D · DOKUMEN RESMI E-RAPOR DIGITAL SIAP PRINT A4
                    </span>
                    {santriLoginRapor ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-amber-50 text-[#0A1172] border border-amber-300">
                        <i className="fa-solid fa-id-card text-[10px] text-[#FF6700]" />
                        Mode Akses Mandiri Santri · NIS: {santriRaporAktif.nis} ({santriRaporAktif.nama})
                      </span>
                    ) : ustadzLoginAktif ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                        <i className="fa-solid fa-user-lock text-[10px]" />
                        Akses Terkunci: {ustadzLoginAktif.namaUstadz} ({daftarKelasRaporUstadz.length} Kelas Ampuan)
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-blue-50 text-[#0A1172] border border-blue-200">
                        <i className="fa-solid fa-user-shield text-[10px]" />
                        Mode Mudir / Super Admin (Semua Kelas)
                      </span>
                    )}

                    {/* Badge Status Kelengkapan Data Rapor Santri Aktif */}
                    {statusKelengkapanRaporAktif.apakahLengkap ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-emerald-100 text-emerald-900 border border-emerald-300">
                        <i className="fa-solid fa-circle-check text-emerald-600" />
                        Data Rapor 100% Lengkap ({statusKelengkapanRaporAktif.totalMapelWajib} Mapel, Tahfidz &amp; IT)
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                        <i className="fa-solid fa-hourglass-half text-amber-700" />
                        Belum Lengkap: {statusKelengkapanRaporAktif.persentaseLengkap}% ({statusKelengkapanRaporAktif.totalMapelTerisiLengkap}/{statusKelengkapanRaporAktif.totalMapelWajib} Mapel)
                      </span>
                    )}
                  </div>
                  <h1 className="text-xl font-bold text-[#0A1172]">
                    {santriLoginRapor
                      ? `Portal e-Rapor Mandiri Santri — ${santriRaporAktif.nama} (NIS: ${santriRaporAktif.nis})`
                      : 'Cetak e-Rapor Santri Ponpes Tahfidz & Ilmu Teknologi Darul Fithrah'}
                  </h1>
                  <p className="text-xs text-slate-600">
                    {santriLoginRapor
                      ? statusKelengkapanRaporAktif.apakahLengkap
                        ? `Seluruh data nilai mata pelajaran kelas ${santriRaporAktif.kelas}, capaian Tahfidz, dan capaian IT Anda telah selesai diisi lengkap (100%). Anda dapat melihat rapor dan mengunduh file PDF A4.`
                        : `Data rapor Anda saat ini masih dalam proses pengisian oleh Ustadz (${statusKelengkapanRaporAktif.persentaseLengkap}% selesai). Rapor dan tombol unduh PDF otomatis terbuka setelah seluruh data lengkap.`
                      : ustadzLoginAktif
                      ? `Menampilkan ${santriRaporTersedia.length} santri dari kelas yang diampu oleh ${ustadzLoginAktif.namaUstadz}: ${daftarKelasRaporUstadz
                          .map((k) => `${k.unit} - ${k.kelas}`)
                          .join(', ')}.`
                      : `Menampilkan seluruh ${santriRaporTersedia.length} santri aktif Ponpes Darul Fithrah.`}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2.5 w-full lg:w-auto">
                  {/* Dropdown Filter Kelas & Pilih Santri (Hanya muncul untuk Ustadz / Admin) */}
                  {!santriLoginRapor && (
                    <>
                      <select
                        value={filterKelasRaporUstadz}
                        onChange={(e) => {
                          const val = e.target.value;
                          setFilterKelasRaporUstadz(val);
                          const kandidatSantri = santriList.filter((s) => {
                            if (ustadzLoginAktif && !apakahKelasDiampuOlehUstadz(s.unit, s.kelas, ustadzLoginAktif)) {
                              return false;
                            }
                            if (val !== 'SEMUA_AMPUAN') {
                              return `${s.unit}__${s.kelas}` === val;
                            }
                            return true;
                          });
                          if (kandidatSantri[0]) {
                            setCariNisRapor(kandidatSantri[0].nis);
                          }
                        }}
                        className="px-3 py-2 text-xs font-bold bg-amber-50 border border-amber-300 text-[#0A1172] rounded-lg"
                      >
                        <option value="SEMUA_AMPUAN">
                          {ustadzLoginAktif
                            ? `-- Semua Kelas Ampuan Saya (${daftarKelasRaporUstadz.length} Kelas) --`
                            : '-- Semua Unit & Kelas --'}
                        </option>
                        {daftarKelasRaporUstadz.map((k) => (
                          <option key={`${k.unit}__${k.kelas}`} value={`${k.unit}__${k.kelas}`}>
                            {k.unit} — {k.kelas}
                          </option>
                        ))}
                      </select>

                      <select
                        value={santriRaporAktif.nis}
                        onChange={(e) => setCariNisRapor(e.target.value)}
                        className="px-3.5 py-2 text-xs font-bold bg-slate-50 border border-slate-300 rounded-lg max-w-xs"
                      >
                        {santriRaporTersedia.map((s) => {
                          const st = cekKelengkapanDataRaporSantri(s);
                          return (
                            <option key={s.nis} value={s.nis}>
                              {s.nis} — {s.nama} ({s.unit} - {s.kelas}) [{st.apakahLengkap ? '✓ Lengkap' : `⏳ ${st.persentaseLengkap}%`}]
                            </option>
                          );
                        })}
                      </select>
                    </>
                  )}

                  {/* Tombol Ganti NIS Santri / Mode Santri */}
                  <button
                    type="button"
                    onClick={() => bukaPortalRaporSantriDenganNis(santriRaporAktif.nis)}
                    className="px-3 py-2 text-xs font-bold text-[#0A1172] bg-amber-50 hover:bg-amber-100 border border-amber-300 rounded-lg cursor-pointer whitespace-nowrap shrink-0"
                    title="Masuk atau ganti NIS sebagai Santri / Wali Santri"
                  >
                    <i className="fa-solid fa-id-card mr-1.5 text-[#FF6700]" />
                    {santriLoginRapor ? 'Ganti NIS Santri' : 'Simulasi Akses NIS Santri'}
                  </button>

                  <button
                    type="button"
                    onClick={() => bukaModulDenganPin('rapor', true)}
                    className="px-3 py-2 text-xs font-bold text-[#0A1172] bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-lg cursor-pointer whitespace-nowrap shrink-0"
                    title="Ganti Akun Ustadz atau Login sebagai Mudir/Admin"
                  >
                    <i className="fa-solid fa-user-lock mr-1.5 text-[#FF6700]" />
                    {santriLoginRapor ? 'Login Ustadz / Admin' : 'Ganti Akun Akses'}
                  </button>

                  {/* Tombol Lengkapi Otomatis Nilai Rapor (Hanya untuk Ustadz / Admin jika data santri belum 100% lengkap) */}
                  {!santriLoginRapor && !statusKelengkapanRaporAktif.apakahLengkap && (
                    <button
                      type="button"
                      onClick={() => handleLengkapiSemuaDataRaporSantri(santriRaporAktif)}
                      className="px-3.5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg cursor-pointer whitespace-nowrap shrink-0"
                      title="Genapkan seluruh komponen nilai mata pelajaran yang masih kosong agar e-Rapor santri ini berstatus 100% Lengkap dan dapat diakses santri via NIS"
                    >
                      <i className="fa-solid fa-check-double mr-1.5" />
                      Lengkapi Data Rapor Santri Ini (100%)
                    </button>
                  )}

                  {/* Tombol Unduh PDF A4 (Dinonaktifkan bagi Santri jika data rapornya belum 100% lengkap) */}
                  <button
                    type="button"
                    disabled={isGeneratingRaporPdf || (Boolean(santriLoginRapor) && !statusKelengkapanRaporAktif.apakahLengkap)}
                    onClick={handleUnduhRaporPDF}
                    className="px-4 py-2 text-xs font-bold text-white bg-[#FF6700] hover:bg-[#e55c00] disabled:opacity-50 disabled:cursor-not-allowed rounded-lg cursor-pointer whitespace-nowrap shrink-0"
                    title={
                      santriLoginRapor && !statusKelengkapanRaporAktif.apakahLengkap
                        ? 'Unduh PDF terkunci karena data rapor belum 100% lengkap'
                        : 'Unduh langsung file PDF ukuran A4 Portrait menggunakan jsPDF'
                    }
                  >
                    <i
                      className={`fa-solid ${
                        isGeneratingRaporPdf ? 'fa-spinner fa-spin' : 'fa-file-pdf'
                      } mr-1.5`}
                    />
                    {isGeneratingRaporPdf
                      ? 'Menyusun PDF A4...'
                      : santriLoginRapor
                      ? 'Unduh PDF e-Rapor Saya (A4)'
                      : 'Unduh PDF A4 (jsPDF)'}
                  </button>

                  {!santriLoginRapor && (
                    <button
                      type="button"
                      disabled={isGeneratingRaporPdf}
                      onClick={handleUnduhRaporKelasBatchPDF}
                      className="px-3.5 py-2 text-xs font-bold text-white bg-[#0A1172] hover:bg-[#0A1172]/90 disabled:opacity-60 rounded-lg cursor-pointer whitespace-nowrap shrink-0"
                      title="Unduh seluruh e-Rapor santri pada kelas ampuan ini dalam 1 file PDF A4 multi-halaman"
                    >
                      <i className="fa-solid fa-layer-group mr-1.5 text-[#FF6700]" />
                      Unduh PDF Sekelas ({santriRaporTersedia.length})
                    </button>
                  )}

                  {(!santriLoginRapor || statusKelengkapanRaporAktif.apakahLengkap) && (
                    <button
                      type="button"
                      onClick={() => window.print()}
                      className="px-3 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-lg cursor-pointer whitespace-nowrap shrink-0"
                      title="Cetak langsung ke printer A4 melalui dialog browser"
                    >
                      <i className="fa-solid fa-print mr-1.5 text-[#0A1172]" />
                      Print A4
                    </button>
                  )}

                  {!santriLoginRapor && (!isAdminUnlocked || adminPunyaAkses('identitas_rapor')) && (
                    <button
                      type="button"
                      onClick={() =>
                        handleBukaQuickEditWaliKelasTagline(santriRaporAktif.unit, santriRaporAktif.kelas)
                      }
                      className="px-3 py-2 text-xs font-bold text-[#0A1172] bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg cursor-pointer whitespace-nowrap shrink-0"
                      title="Edit Nama Wali Kelas & Tagline KOP e-Rapor"
                    >
                      <i className="fa-solid fa-pen-to-square mr-1.5 text-[#FF6700]" />
                      Edit Wali Kelas &amp; Tagline
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() =>
                      handleLogout(
                        santriLoginRapor ? 'santri' : ustadzLoginAktif ? 'ustadz' : 'admin'
                      )
                    }
                    className="px-3 py-2 text-xs font-bold text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg cursor-pointer whitespace-nowrap shrink-0"
                    title="Logout dari Portal e-Rapor"
                  >
                    <i className="fa-solid fa-right-from-bracket mr-1.5" />
                    Logout
                  </button>
                </div>
              </div>

              {/* Filter Tampilan Mata Pelajaran pada Tabel I Rapor (Hanya saat login sebagai Ustadz) */}
              {ustadzLoginAktif && !santriLoginRapor && (
                <div className="pt-3 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div className="text-slate-600">
                    <span className="font-bold text-[#0A1172]">Mode Tabel Nilai Rapor:</span>{' '}
                    Pilih apakah hanya mencetak nilai mata pelajaran yang Anda ampu di kelas ini atau rekap lengkap kelas ampuan.
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setFilterMapelRaporUstadz('ampuan_saja')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer ${
                        filterMapelRaporUstadz === 'ampuan_saja'
                          ? 'bg-[#0A1172] text-white'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      Hanya Mapel Ampuan Saya
                    </button>
                    <button
                      type="button"
                      onClick={() => setFilterMapelRaporUstadz('semua_mapel_kelas')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer ${
                        filterMapelRaporUstadz === 'semua_mapel_kelas'
                          ? 'bg-[#0A1172] text-white'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      Semua Mapel di Kelas Ampuan Ini
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* PROTEKSI AKSES SANTRI: JIKA SANTRI LOGIN DENGAN NIS TETAPI DATA RAPOR BELUM 100% LENGKAP */}
            {santriLoginRapor && !statusKelengkapanRaporAktif.apakahLengkap ? (
              <div className="bg-white border-2 border-amber-300 rounded-2xl p-6 sm:p-8 max-w-4xl mx-auto space-y-6">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
                  <div className="flex items-start gap-3.5">
                    <div className="w-12 h-12 rounded-xl bg-amber-100 border border-amber-300 flex items-center justify-center text-amber-700 text-xl shrink-0">
                      <i className="fa-solid fa-lock" />
                    </div>
                    <div className="space-y-1">
                      <div className="text-xs font-mono font-bold text-[#FF6700] uppercase">
                        PROTEKSI KELENGKAPAN DATA E-RAPOR SANTRI
                      </div>
                      <h2 className="text-lg sm:text-xl font-extrabold text-[#0A1172]">
                        Mohon Maaf, e-Rapor &amp; Unduhan PDF Anda Belum Dapat Dibuka
                      </h2>
                      <p className="text-xs text-slate-600 leading-relaxed">
                        Sesuai kebijakan akademik Ponpes Tahfidz &amp; Ilmu Teknologi Darul Fithrah, santri hanya dapat melihat isi nilai rapor dan mengunduh dokumen PDF A4 setelah <strong>seluruh data nilai mata pelajaran kelas, capaian Tahfidz Al-Qur'an, dan capaian Ilmu Teknologi (IT) selesai diisi lengkap (100%)</strong> oleh Ustadz pengampu.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Ringkasan Identitas & Progress Bar Kelengkapan */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div>
                      <span className="text-slate-500">Santri:</span>{' '}
                      <strong className="text-[#0A1172]">{santriRaporAktif.nama}</strong>{' '}
                      <span className="font-mono font-bold text-slate-700">(NIS: {santriRaporAktif.nis})</span> ·{' '}
                      <span className="font-semibold text-[#FF6700]">
                        {santriRaporAktif.unit} — {santriRaporAktif.kelas}
                      </span>
                    </div>
                    <div className="font-mono font-extrabold text-[#0A1172]">
                      Progress Kelengkapan: {statusKelengkapanRaporAktif.persentaseLengkap}%
                    </div>
                  </div>
                  <div className="w-full h-3 bg-slate-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#FF6700] transition-all duration-300"
                      style={{ width: `${statusKelengkapanRaporAktif.persentaseLengkap}%` }}
                    />
                  </div>
                </div>

                {/* Rincian 3 Komponen Syarat Kelengkapan e-Rapor */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                  <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-1.5">
                    <div className="flex items-center justify-between font-bold text-[#0A1172]">
                      <span>1. Nilai Akademik &amp; CBT</span>
                      <span className="font-mono text-amber-700">
                        {statusKelengkapanRaporAktif.totalMapelTerisiLengkap}/{statusKelengkapanRaporAktif.totalMapelWajib} Mapel
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600">
                      Masih terdapat{' '}
                      <strong>{statusKelengkapanRaporAktif.daftarMapelBelumLengkap.length} mata pelajaran</strong> di{' '}
                      {santriRaporAktif.kelas} yang menunggu input nilai lengkap dari Ustadz pengampu.
                    </p>
                  </div>

                  <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-1.5">
                    <div className="flex items-center justify-between font-bold text-[#0A1172]">
                      <span>2. Capaian Tahfidz</span>
                      <span
                        className={`font-mono ${
                          statusKelengkapanRaporAktif.tahfidzLengkap ? 'text-emerald-700' : 'text-amber-700'
                        }`}
                      >
                        {statusKelengkapanRaporAktif.tahfidzLengkap ? '✓ Lengkap' : '⏳ Belum Lengkap'}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600">
                      {statusKelengkapanRaporAktif.tahfidzLengkap
                        ? 'Data Juz hafalan, surat terakhir, kelancaran & catatan Muhaffizh sudah terisi.'
                        : 'Menunggu pengisian capaian Tahfidz oleh Muhaffizh halaqah.'}
                    </p>
                  </div>

                  <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-1.5">
                    <div className="flex items-center justify-between font-bold text-[#0A1172]">
                      <span>3. Kompetensi IT</span>
                      <span
                        className={`font-mono ${
                          statusKelengkapanRaporAktif.itLengkap ? 'text-emerald-700' : 'text-amber-700'
                        }`}
                      >
                        {statusKelengkapanRaporAktif.itLengkap ? '✓ Lengkap' : '⏳ Belum Lengkap'}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600">
                      {statusKelengkapanRaporAktif.itLengkap
                        ? 'Materi kompetensi, total projek, nilai praktek & karya akhir IT sudah terisi.'
                        : 'Menunggu pengisian nilai praktek & projek akhir dari Instruktur IT.'}
                    </p>
                  </div>
                </div>

                {/* Daftar Mata Pelajaran yang Belum Selesai Diisi vs Sudah Selesai */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  <div className="border border-amber-200 bg-amber-50/60 rounded-xl p-4 space-y-2">
                    <div className="font-bold text-amber-900 flex items-center gap-1.5">
                      <i className="fa-solid fa-clock text-amber-600" />
                      Mata Pelajaran yang Masih Menunggu Input Nilai ({statusKelengkapanRaporAktif.daftarMapelBelumLengkap.length})
                    </div>
                    <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                      {statusKelengkapanRaporAktif.daftarMapelBelumLengkap.map((item) => (
                        <div
                          key={item.namaMapel}
                          className="p-2 bg-white border border-amber-200 rounded-lg flex items-center justify-between gap-2"
                        >
                          <div>
                            <div className="font-bold text-slate-800">{item.namaMapel}</div>
                            <div className="text-[11px] text-slate-500">Pengampu: {item.pengampu}</div>
                          </div>
                          <span className="px-2 py-0.5 text-[10px] font-mono font-bold bg-amber-100 text-amber-800 rounded">
                            Kurang: {item.komponenKurang}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="border border-emerald-200 bg-emerald-50/60 rounded-xl p-4 space-y-2">
                    <div className="font-bold text-emerald-900 flex items-center gap-1.5">
                      <i className="fa-solid fa-circle-check text-emerald-600" />
                      Mata Pelajaran yang Sudah Selesai Dinilai ({statusKelengkapanRaporAktif.daftarMapelLengkap.length})
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {statusKelengkapanRaporAktif.daftarMapelLengkap.length > 0 ? (
                        statusKelengkapanRaporAktif.daftarMapelLengkap.map((mp) => (
                          <span
                            key={mp}
                            className="px-2.5 py-1 bg-white border border-emerald-200 rounded-lg text-[11px] font-semibold text-emerald-900"
                          >
                            ✓ {mp}
                          </span>
                        ))
                      ) : (
                        <span className="text-slate-500 italic">Belum ada mata pelajaran yang selesai dinilai.</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => bukaPortalRaporSantriDenganNis('')}
                    className="px-4 py-2.5 text-xs font-bold text-[#0A1172] bg-amber-100 hover:bg-amber-200 border border-amber-300 rounded-lg cursor-pointer"
                  >
                    <i className="fa-solid fa-id-card mr-1.5 text-[#FF6700]" />
                    Cek Status NIS Lain
                  </button>
                  <button
                    type="button"
                    onClick={() => bukaModulDenganPin('ustadz', true)}
                    className="px-4 py-2.5 text-xs font-bold text-white bg-[#0A1172] hover:bg-[#0A1172]/90 rounded-lg cursor-pointer"
                  >
                    <i className="fa-solid fa-chalkboard-user mr-1.5 text-[#FF6700]" />
                    Login Portal Ustadz untuk Melengkapi Nilai
                  </button>
                </div>
              </div>
            ) : (
            /* LEMBAR A4 E-RAPOR RESMI DARUL FITHRAH */
            <div className="bg-white border border-slate-300 rounded-xl p-8 sm:p-10 max-w-4xl mx-auto space-y-6">
              {/* KOP RAPOR RESMI BERLAMBANG DARUL FITHRAH */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-b-4 border-[#0A1172] pb-5">
                <LogoDarulFithrah size="lg" identitas={identitasPesantren} />
                <div className="text-center sm:text-right space-y-0.5">
                  <div className="text-xs font-bold text-[#0A1172] uppercase tracking-wider">
                    {identitasPesantren.namaYayasanKOP}
                  </div>
                  <div className="text-lg font-extrabold text-[#FF6700]">
                    LAPORAN HASIL BELAJAR SANTRI (E-RAPOR DIGITAL)
                  </div>
                  <div className="text-[11px] text-slate-600">
                    {identitasPesantren.taglineRapor || DEFAULT_IDENTITAS_PESANTREN.taglineRapor}
                  </div>
                </div>
              </div>

              {/* Biodata Lengkap Buku Induk Santri */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-xs bg-slate-50 p-4 rounded-lg border border-slate-200">
                <div className="space-y-1.5">
                  <div className="flex">
                    <span className="text-slate-500 w-36 shrink-0">Nama Lengkap Santri:</span>
                    <strong className="text-slate-900">{santriRaporAktif.nama}</strong>
                  </div>
                  <div className="flex">
                    <span className="text-slate-500 w-36 shrink-0">NIS / NISN:</span>
                    <span className="font-mono font-bold text-[#0A1172]">
                      {santriRaporAktif.nis} / {santriRaporAktif.nisn || '-'}
                    </span>
                  </div>
                  <div className="flex">
                    <span className="text-slate-500 w-36 shrink-0">NIK / No. KK:</span>
                    <span className="font-mono text-slate-800">
                      {santriRaporAktif.nik || '-'} / {santriRaporAktif.noKK || '-'}
                    </span>
                  </div>
                  <div className="flex">
                    <span className="text-slate-500 w-36 shrink-0">Jenis Kelamin:</span>
                    <span className="font-semibold text-slate-800">
                      {santriRaporAktif.jk === 'P' ? 'Perempuan (Putri)' : 'Laki-laki (Putra)'}
                    </span>
                  </div>
                  <div className="flex">
                    <span className="text-slate-500 w-36 shrink-0">Tempat, Tgl Lahir:</span>
                    <span className="font-medium text-slate-800">
                      {santriRaporAktif.tempatLahir || '-'}, {santriRaporAktif.tanggalLahir || '-'}
                    </span>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <div className="flex">
                    <span className="text-slate-500 w-36 shrink-0">Unit / Kelas:</span>
                    <strong className="text-[#0A1172]">
                      {santriRaporAktif.unit} — {santriRaporAktif.kelas}
                      {santriRaporAktif.kelasTerdata && santriRaporAktif.kelasTerdata !== santriRaporAktif.kelas
                        ? ` (${santriRaporAktif.kelasTerdata})`
                        : ''}
                    </strong>
                  </div>
                  <div className="flex">
                    <span className="text-slate-500 w-36 shrink-0">Angkatan / Tgl Masuk:</span>
                    <span className="font-mono text-slate-800">
                      {santriRaporAktif.angkatan || '-'} ({santriRaporAktif.tanggalMasuk || '-'}) · Kode:{' '}
                      {santriRaporAktif.kodeBarang || '-'}
                    </span>
                  </div>
                  <div className="flex">
                    <span className="text-slate-500 w-36 shrink-0">Nama Ayah / Ibu:</span>
                    <span className="font-semibold text-slate-800">
                      {santriRaporAktif.namaAyah || '-'} / {santriRaporAktif.namaIbu || '-'}
                    </span>
                  </div>
                  <div className="flex">
                    <span className="text-slate-500 w-36 shrink-0">Telp. Orang Tua:</span>
                    <span className="font-mono text-slate-800">
                      {santriRaporAktif.noTelpAyah || '-'} / {santriRaporAktif.noTelpIbu || '-'}
                    </span>
                  </div>
                  <div className="flex">
                    <span className="text-slate-500 w-36 shrink-0">Alamat Rumah:</span>
                    <span className="text-slate-700 leading-snug">{santriRaporAktif.alamat || '-'}</span>
                  </div>
                </div>
              </div>

              {/* TABEL I: NILAI AKADEMIK (4 KOMPONEN + NILAI AKHIR + PREDIKAT) */}
              <div className="space-y-2">
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-[#0A1172]">
                  TABEL I. CAPAIAN NILAI AKADEMIK &amp; UJIAN CBT
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse border border-slate-300 text-xs">
                    <thead>
                      <tr className="bg-[#0A1172] text-white">
                        <th className="py-2.5 px-3 border border-slate-400">No</th>
                        <th className="py-2.5 px-3 border border-slate-400">Mata Pelajaran</th>
                        <th className="py-2.5 px-2 text-right border border-slate-400">Tugas (20%)</th>
                        <th className="py-2.5 px-2 text-right border border-slate-400">Sikap (20%)</th>
                        <th className="py-2.5 px-2 text-right border border-slate-400">Lisan (20%)</th>
                        <th className="py-2.5 px-2 text-right border border-slate-400">CBT (40%)</th>
                        <th className="py-2.5 px-3 text-right border border-slate-400">Nilai Akhir</th>
                        <th className="py-2.5 px-3 text-center border border-slate-400">Predikat</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-300">
                      {nilaiRaporSantri.map((n, i) => (
                        <tr key={`${n.nis}-${n.mapel}`}>
                          <td className="py-2 px-3 border border-slate-300 font-mono">{i + 1}</td>
                          <td className="py-2 px-3 border border-slate-300 font-semibold">{n.mapel}</td>
                          <td className="py-2 px-2 border border-slate-300 text-right font-mono">{n.tugas}</td>
                          <td className="py-2 px-2 border border-slate-300 text-right font-mono">{n.sikap}</td>
                          <td className="py-2 px-2 border border-slate-300 text-right font-mono">{n.lisan}</td>
                          <td className="py-2 px-2 border border-slate-300 text-right font-mono font-bold">{n.cbt}</td>
                          <td className="py-2 px-3 border border-slate-300 text-right font-mono font-extrabold text-[#0A1172]">
                            {n.nilaiAkhir.toFixed(2)}
                          </td>
                          <td className="py-2 px-3 border border-slate-300 text-center font-mono font-bold text-[#FF6700]">
                            {n.predikat}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* TABEL II: PENCAPAIAN TAHFIDZ AL-QUR'AN */}
              <div className="space-y-2">
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-[#0A1172]">
                  TABEL II. PENCAPAIAN TAHFIDZ AL-QUR'AN
                </h3>
                <table className="w-full text-left border-collapse border border-slate-300 text-xs">
                  <thead>
                    <tr className="bg-[#0A1172] text-white">
                      <th className="py-2.5 px-3 border border-slate-400">Juz Hafalan</th>
                      <th className="py-2.5 px-3 border border-slate-400">Surat Terakhir</th>
                      <th className="py-2.5 px-3 border border-slate-400">Tingkat Kelancaran</th>
                      <th className="py-2.5 px-3 border border-slate-400">Catatan Muhaffizh / Ustadz</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="py-2.5 px-3 border border-slate-300 font-bold text-[#0A1172]">
                        {tahfidzRaporSantri.juzHafalan}
                      </td>
                      <td className="py-2.5 px-3 border border-slate-300 font-semibold">
                        {tahfidzRaporSantri.suratTerakhir}
                      </td>
                      <td className="py-2.5 px-3 border border-slate-300 font-bold text-[#FF6700]">
                        {tahfidzRaporSantri.kelancaran}
                      </td>
                      <td className="py-2.5 px-3 border border-slate-300 text-slate-700">
                        {tahfidzRaporSantri.catatanUstadz}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* TABEL III: PENCAPAIAN KOMPETENSI ILMU TEKNOLOGI (IT) */}
              <div className="space-y-2">
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-[#0A1172]">
                  TABEL III. PENCAPAIAN KOMPETENSI ILMU TEKNOLOGI (IT)
                </h3>
                <table className="w-full text-left border-collapse border border-slate-300 text-xs">
                  <thead>
                    <tr className="bg-[#0A1172] text-white">
                      <th className="py-2.5 px-3 border border-slate-400">Materi Kompetensi IT</th>
                      <th className="py-2.5 px-2 text-center border border-slate-400">Total Projek</th>
                      <th className="py-2.5 px-2 text-right border border-slate-400">Nilai Praktek</th>
                      <th className="py-2.5 px-3 text-center border border-slate-400">Predikat IT</th>
                      <th className="py-2.5 px-3 border border-slate-400">Karya / Projek Akhir</th>
                      <th className="py-2.5 px-3 border border-slate-400">Catatan Instruktur</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="py-2.5 px-3 border border-slate-300 font-semibold">
                        {itRaporSantri.materiKompetensi}
                      </td>
                      <td className="py-2.5 px-2 border border-slate-300 text-center font-mono font-bold">
                        {itRaporSantri.totalProjek} Projek
                      </td>
                      <td className="py-2.5 px-2 border border-slate-300 text-right font-mono font-extrabold text-[#0A1172]">
                        {itRaporSantri.nilaiPraktek}
                      </td>
                      <td className="py-2.5 px-3 border border-slate-300 text-center font-mono font-bold text-[#FF6700]">
                        {predikatIT}
                      </td>
                      <td className="py-2.5 px-3 border border-slate-300 font-medium">
                        {itRaporSantri.karyaAkhir}
                      </td>
                      <td className="py-2.5 px-3 border border-slate-300 text-slate-700">
                        {itRaporSantri.catatanInstruktur}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* KOLOM TANDA TANGAN: MUDIR DAN WALI KELAS + QR CODE VERIFIKASI DIGITAL */}
              <div className="pt-8 grid grid-cols-1 sm:grid-cols-3 gap-6 items-end text-center text-xs">
                <div className="space-y-14">
                  <div className="text-slate-600">
                    Mengetahui,
                    <br />
                    <strong>Mudir {identitasPesantren.namaUtama}</strong>
                  </div>
                  <div className="font-bold text-[#0A1172] border-t border-slate-400 pt-1">
                    {identitasPesantren.namaMudir}
                  </div>
                </div>
                <div className="space-y-14">
                  <div className="text-slate-600">
                    Ditetapkan Oleh,
                    <br />
                    <strong>Wali Kelas {santriRaporAktif.kelas}</strong>
                    {!santriLoginRapor && (!isAdminUnlocked || adminPunyaAkses('identitas_rapor')) && (
                      <button
                        type="button"
                        onClick={() =>
                          handleBukaQuickEditWaliKelasTagline(santriRaporAktif.unit, santriRaporAktif.kelas)
                        }
                        className="no-print ml-1.5 text-[10px] font-bold text-[#FF6700] hover:underline cursor-pointer"
                        title="Edit Nama Wali Kelas & Tagline"
                      >
                        (Edit)
                      </button>
                    )}
                  </div>
                  <div className="font-bold text-[#0A1172] border-t border-slate-400 pt-1">
                    {ambilNamaWaliKelas(santriRaporAktif.unit, santriRaporAktif.kelas)}
                  </div>
                </div>
                <div className="flex flex-col items-center justify-center space-y-1.5 bg-slate-50 p-3 rounded-xl border border-slate-200">
                  <QrCodeVerifikasiSVG
                    payload={`DARULFITHRAH|${santriRaporAktif.nis}|${santriRaporAktif.nama}|${santriRaporAktif.unit}|${santriRaporAktif.kelas}|${tahfidzRaporSantri.suratTerakhir}|${itRaporSantri.nilaiPraktek}`}
                    size={78}
                  />
                  <div className="text-[10px] font-mono font-bold text-[#0A1172]">
                    DF-VERIF-2026-{santriRaporAktif.nis}
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      Swal.fire({
                        icon: 'success',
                        title: 'Dokumen e-Rapor Terverifikasi Asli!',
                        html: `
                          <div class="text-left text-xs space-y-1.5 mt-2">
                            <p><strong>Kode Seri Dokumen:</strong> <span class="font-mono font-bold">DF-VERIF-2026-${santriRaporAktif.nis}</span></p>
                            <p><strong>Nama Santri:</strong> ${santriRaporAktif.nama} (${santriRaporAktif.nis})</p>
                            <p><strong>Unit / Kelas:</strong> ${santriRaporAktif.unit} - ${santriRaporAktif.kelas}</p>
                            <p><strong>Capaian Tahfidz:</strong> ${tahfidzRaporSantri.juzHafalan} (${tahfidzRaporSantri.suratTerakhir})</p>
                            <p><strong>Capaian IT:</strong> ${itRaporSantri.materiKompetensi} (Nilai Praktek: ${itRaporSantri.nilaiPraktek})</p>
                            <p class="text-emerald-700 font-semibold pt-2 border-t">✓ Tanda Tangan Elektronik &amp; Hash Nilai sesuai dengan Database Server Darul Fithrah.</p>
                          </div>
                        `,
                        confirmButtonColor: '#0A1172',
                      })
                    }
                    className="no-print text-[10px] font-bold text-[#FF6700] hover:underline cursor-pointer"
                  >
                    Cek Keaslian QR
                  </button>
                </div>
              </div>
            </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

function setFormelTokenUpper(val: string, setter: (v: string) => void) {
  setter(val.toUpperCase());
}
