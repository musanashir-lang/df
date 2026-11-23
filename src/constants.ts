export type UnitPendidikan = 'Wustho' | 'Ulya' | 'MDA';

export const UNIT_KELAS_MAP: Record<UnitPendidikan, string[]> = {
  Wustho: ['Kelas 7', 'Kelas 8', 'Kelas 9'],
  Ulya: ['Kelas 10', 'Kelas 11', 'Kelas 12'],
  MDA: ['Junior', 'Senior', 'Putri'],
};

export interface UstadzSeedItem {
  id: string;
  namaUstadz: string;
  unitAmpuan: UnitPendidikan[];
  kelasAmpuan: string[];
  mapelAmpuan: string[];
  jamUlya: number;
  jamWustho: number;
  jamMDA: number;
  jamMA: number;
  totalJam: number;
  bidang: string;
  pinLogin: string;
}

export interface MapelSeedItem {
  id: string;
  namaMapel: string;
  unit: UnitPendidikan;
  kelas: string;
  pengampu: string;
  tokenUjian: string;
  durasiMenit: number;
}

export const INITIAL_USTADZ_2026: UstadzSeedItem[] = [
  {
    id: 'UST-01',
    namaUstadz: 'Ust. Musana',
    unitAmpuan: ['Ulya', 'Wustho'],
    kelasAmpuan: ['Kelas 7', 'Kelas 8', 'Kelas 9', 'Kelas 10', 'Kelas 11', 'Kelas 12'],
    mapelAmpuan: ['Bahasa Inggris', 'Psikologi Terapan (PsiTer)', 'Literasi', 'Litbang'],
    jamUlya: 15,
    jamWustho: 6,
    jamMDA: 0,
    jamMA: 0,
    totalJam: 21,
    bidang: 'Bahasa Inggris, Literasi, PsiTer & Litbang (Ulya & Wustho)',
    pinLogin: 'UST123',
  },
  {
    id: 'UST-02',
    namaUstadz: 'Ust. Fadlurrahman',
    unitAmpuan: ['Ulya'],
    kelasAmpuan: ['Kelas 10', 'Kelas 11', 'Kelas 12'],
    mapelAmpuan: ['Fiqih', 'Siroh', "Imla'"],
    jamUlya: 15,
    jamWustho: 0,
    jamMDA: 0,
    jamMA: 0,
    totalJam: 15,
    bidang: "Fiqih, Siroh & Imla' (Unit Ulya)",
    pinLogin: 'UST123',
  },
  {
    id: 'UST-03',
    namaUstadz: 'Ust. Muadz',
    unitAmpuan: ['Ulya', 'Wustho'],
    kelasAmpuan: ['Kelas 7', 'Kelas 10', 'Kelas 11', 'Kelas 12'],
    mapelAmpuan: ['ABY (Al-Arabiyyah Baina Yadaik)', 'Tahsin', 'Hadits', "Adab & Do'a", "Imla'"],
    jamUlya: 7,
    jamWustho: 6,
    jamMDA: 0,
    jamMA: 0,
    totalJam: 13,
    bidang: "ABY, Tahsin, Hadits, Imla' & Adab Do'a (Ulya & Wustho)",
    pinLogin: 'UST123',
  },
  {
    id: 'UST-04',
    namaUstadz: 'Ust. Azmi',
    unitAmpuan: ['Wustho', 'Ulya', 'MDA'],
    kelasAmpuan: ['Kelas 7', 'Kelas 8', 'Kelas 9', 'Kelas 12', 'Junior', 'Putri'],
    mapelAmpuan: ['Fiqih', 'Nahwu', 'Shorof', 'Aqidah', 'Bidayatul Hidayah', 'Bank Konten & Dakwah Digital'],
    jamUlya: 2,
    jamWustho: 6,
    jamMDA: 10,
    jamMA: 0,
    totalJam: 18,
    bidang: 'Fiqih, Nahwu, Shorof, Aqidah, Bidayatul Hidayah & Dakwah Konten (Wustho, Ulya & MDA)',
    pinLogin: 'UST123',
  },
  {
    id: 'UST-05',
    namaUstadz: 'Ust. Mustaqim',
    unitAmpuan: ['Wustho', 'Ulya'],
    kelasAmpuan: ['Kelas 7', 'Kelas 8', 'Kelas 9'],
    mapelAmpuan: ['Aqidah', 'ABY (Al-Arabiyyah Baina Yadaik)'],
    jamUlya: 7,
    jamWustho: 9,
    jamMDA: 0,
    jamMA: 0,
    totalJam: 16,
    bidang: 'Aqidah & ABY (Wustho & Ulya)',
    pinLogin: 'UST123',
  },
  {
    id: 'UST-06',
    namaUstadz: 'Ust. Marzuki (Ust. Juki)',
    unitAmpuan: ['Ulya', 'Wustho'],
    kelasAmpuan: ['Kelas 7', 'Kelas 8', 'Kelas 9', 'Kelas 10', 'Kelas 11', 'Kelas 12'],
    mapelAmpuan: ['Aqidah', 'Nahwu', 'Shorof', 'Akhlaq'],
    jamUlya: 10,
    jamWustho: 3,
    jamMDA: 0,
    jamMA: 0,
    totalJam: 13,
    bidang: 'Aqidah, Nahwu, Shorof & Akhlaq (Ulya & Wustho)',
    pinLogin: 'UST123',
  },
  {
    id: 'UST-07',
    namaUstadz: 'Ust. Shiddiq',
    unitAmpuan: ['Ulya', 'Wustho', 'MDA'],
    kelasAmpuan: ['Kelas 7', 'Kelas 9', 'Kelas 11', 'Kelas 12', 'Junior', 'Putri'],
    mapelAmpuan: ['IT (Ilmu Teknologi)', "Adab & Do'a", 'Office Tools', 'Affiliate Practice'],
    jamUlya: 5,
    jamWustho: 4,
    jamMDA: 2,
    jamMA: 8,
    totalJam: 19,
    bidang: "IT, Office Tools, Affiliate Practice & Adab Do'a (Ulya, Wustho & MDA)",
    pinLogin: 'UST123',
  },
  {
    id: 'UST-08',
    namaUstadz: 'Ust. Yahya',
    unitAmpuan: ['Ulya', 'MDA'],
    kelasAmpuan: ['Kelas 12', 'Junior', 'Putri'],
    mapelAmpuan: ['Menejemen', 'Karakter & Menejemen'],
    jamUlya: 2,
    jamWustho: 0,
    jamMDA: 2,
    jamMA: 0,
    totalJam: 4,
    bidang: 'Menejemen & Pembentukan Karakter (Ulya & MDA)',
    pinLogin: 'UST123',
  },
  {
    id: 'UST-09',
    namaUstadz: 'Ust. Rizqi (Ust. Rizky)',
    unitAmpuan: ['MDA', 'Ulya', 'Wustho'],
    kelasAmpuan: ['Kelas 7', 'Kelas 8', 'Kelas 11', 'Kelas 12', 'Junior', 'Senior'],
    mapelAmpuan: ['IT (Ilmu Teknologi)', 'Canva & Infinity Design', 'Tahsin / Al-Jazariyyah'],
    jamUlya: 4,
    jamWustho: 4,
    jamMDA: 9,
    jamMA: 0,
    totalJam: 17,
    bidang: 'IT, Canva & Infinity Design, Tahsin Al-Jazariyyah (MDA, Ulya & Wustho)',
    pinLogin: 'UST123',
  },
  {
    id: 'UST-10',
    namaUstadz: 'Ust. Taufiq',
    unitAmpuan: ['Wustho', 'Ulya'],
    kelasAmpuan: ['Kelas 8', 'Kelas 10', 'Kelas 11'],
    mapelAmpuan: ['IT (Ilmu Teknologi)', "Adab & Do'a"],
    jamUlya: 2,
    jamWustho: 3,
    jamMDA: 0,
    jamMA: 0,
    totalJam: 5,
    bidang: "IT & Adab Do'a (Wustho & Ulya)",
    pinLogin: 'UST123',
  },
  {
    id: 'UST-11',
    namaUstadz: 'Ust. Teguh',
    unitAmpuan: ['MDA', 'Ulya'],
    kelasAmpuan: ['Kelas 10', 'Junior', 'Senior'],
    mapelAmpuan: ['UI/UX Design', 'Graphic Design', 'IT (Ilmu Teknologi)', 'Full-Stack Web Engineering'],
    jamUlya: 2,
    jamWustho: 0,
    jamMDA: 14,
    jamMA: 0,
    totalJam: 16,
    bidang: 'UI/UX Design, Graphic Design & IT (MDA & Ulya)',
    pinLogin: 'UST123',
  },
  {
    id: 'UST-12',
    namaUstadz: 'Ust. Ammar',
    unitAmpuan: ['Wustho'],
    kelasAmpuan: ['Kelas 7', 'Kelas 8', 'Kelas 9'],
    mapelAmpuan: ['Nahwu', 'ABY (Al-Arabiyyah Baina Yadaik)', 'Tarikh', 'Literasi', "Imla' & Khot", 'Mufrodat'],
    jamUlya: 0,
    jamWustho: 18,
    jamMDA: 0,
    jamMA: 0,
    totalJam: 18,
    bidang: "ABY, Nahwu, Tarikh, Literasi, Imla' Khot & Mufrodat (Unit Wustho)",
    pinLogin: 'UST123',
  },
  {
    id: 'UST-13',
    namaUstadz: 'Ust. Mujahid',
    unitAmpuan: ['Wustho'],
    kelasAmpuan: ['Kelas 7', 'Kelas 8', 'Kelas 9'],
    mapelAmpuan: ['ABY (Al-Arabiyyah Baina Yadaik)', 'Shorof', "Adab & Do'a"],
    jamUlya: 0,
    jamWustho: 7,
    jamMDA: 0,
    jamMA: 0,
    totalJam: 7,
    bidang: "ABY, Shorof & Adab Do'a (Unit Wustho)",
    pinLogin: 'UST123',
  },
  {
    id: 'UST-14',
    namaUstadz: 'Ust. Wildan',
    unitAmpuan: ['Wustho'],
    kelasAmpuan: ['Kelas 7', 'Kelas 8', 'Kelas 9'],
    mapelAmpuan: ['Hadits', "Adab & Do'a"],
    jamUlya: 0,
    jamWustho: 4,
    jamMDA: 0,
    jamMA: 0,
    totalJam: 4,
    bidang: "Hadits & Adab Do'a (Unit Wustho)",
    pinLogin: 'UST123',
  },
  {
    id: 'UST-15',
    namaUstadz: 'Ust. Saiful (Ust. Saif)',
    unitAmpuan: ['Wustho', 'MDA'],
    kelasAmpuan: ['Kelas 9', 'Junior'],
    mapelAmpuan: ['IT (Ilmu Teknologi)', 'Safinah (Fiqih Dasar)'],
    jamUlya: 0,
    jamWustho: 2,
    jamMDA: 1,
    jamMA: 5,
    totalJam: 8,
    bidang: 'IT Wustho & Safinah Fiqih (Wustho & MDA)',
    pinLogin: 'UST123',
  },
  {
    id: 'UST-16',
    namaUstadz: 'Ust. Rifqi',
    unitAmpuan: ['Ulya'],
    kelasAmpuan: ['Kelas 10', 'Kelas 11', 'Kelas 12'],
    mapelAmpuan: ['Akhlak'],
    jamUlya: 3,
    jamWustho: 0,
    jamMDA: 1,
    jamMA: 15,
    totalJam: 19,
    bidang: 'Akhlak & Pembinaan Adab (Unit Ulya & MA)',
    pinLogin: 'UST123',
  },
  {
    id: 'UST-17',
    namaUstadz: 'Pak Azzam (Ust. Azzam)',
    unitAmpuan: ['MDA'],
    kelasAmpuan: ['Putri', 'Junior', 'Senior'],
    mapelAmpuan: ['Digital Marketing (DM)', 'Tugas Konten / Live Streaming'],
    jamUlya: 0,
    jamWustho: 0,
    jamMDA: 7,
    jamMA: 2,
    totalJam: 9,
    bidang: 'Digital Marketing (DM) & Live Content (Unit MDA)',
    pinLogin: 'UST123',
  },
  {
    id: 'UST-18',
    namaUstadz: 'Pak Afif (Ust. Afif)',
    unitAmpuan: ['MDA'],
    kelasAmpuan: ['Senior'],
    mapelAmpuan: ['Multimedia Production'],
    jamUlya: 0,
    jamWustho: 0,
    jamMDA: 6,
    jamMA: 2,
    totalJam: 8,
    bidang: 'Multimedia Production & Video Editing (MDA Senior)',
    pinLogin: 'UST123',
  },
  {
    id: 'UST-19',
    namaUstadz: 'Ust. Anwar H',
    unitAmpuan: ['Wustho'],
    kelasAmpuan: ['Kelas 7', 'Kelas 8', 'Kelas 9'],
    mapelAmpuan: ["Tahfidz Al-Qur'an"],
    jamUlya: 0,
    jamWustho: 4,
    jamMDA: 0,
    jamMA: 0,
    totalJam: 4,
    bidang: "Halaqah Tahfidz Al-Qur'an (Unit Wustho)",
    pinLogin: 'UST123',
  },
  {
    id: 'UST-20',
    namaUstadz: 'Ust. Sabardi',
    unitAmpuan: ['MDA'],
    kelasAmpuan: ['Junior', 'Senior'],
    mapelAmpuan: ['Karakter & Mentoring MDA'],
    jamUlya: 0,
    jamWustho: 0,
    jamMDA: 2,
    jamMA: 4,
    totalJam: 6,
    bidang: 'Karakter Building & Mentoring (Unit MDA)',
    pinLogin: 'UST123',
  },
  {
    id: 'UST-21',
    namaUstadz: 'Ust. Hilmi',
    unitAmpuan: ['MDA'],
    kelasAmpuan: ['Junior', 'Senior'],
    mapelAmpuan: ['Karakter & Mentoring MDA'],
    jamUlya: 0,
    jamWustho: 0,
    jamMDA: 2,
    jamMA: 2,
    totalJam: 4,
    bidang: 'Mentoring & Kemandirian Santri (Unit MDA)',
    pinLogin: 'UST123',
  },
];

export const INITIAL_MAPEL_2026: MapelSeedItem[] = [
  // ==================== UNIT WUSTHO - KELAS 7 (VII) ====================
  { id: 'MPL-W7-01', namaMapel: 'Aqidah', unit: 'Wustho', kelas: 'Kelas 7', pengampu: 'Ust. Mustaqim', tokenUjian: 'AQIDAH7', durasiMenit: 40 },
  { id: 'MPL-W7-02', namaMapel: 'Tahsin', unit: 'Wustho', kelas: 'Kelas 7', pengampu: 'Ust. Muadz', tokenUjian: 'TAHSIN7', durasiMenit: 40 },
  { id: 'MPL-W7-03', namaMapel: 'ABY (Al-Arabiyyah Baina Yadaik)', unit: 'Wustho', kelas: 'Kelas 7', pengampu: 'Ust. Mujahid', tokenUjian: 'ABY7', durasiMenit: 45 },
  { id: 'MPL-W7-04', namaMapel: 'Akhlaq', unit: 'Wustho', kelas: 'Kelas 7', pengampu: 'Ust. Marzuki (Ust. Juki)', tokenUjian: 'AKHLAQ7', durasiMenit: 40 },
  { id: 'MPL-W7-05', namaMapel: 'Tarikh', unit: 'Wustho', kelas: 'Kelas 7', pengampu: 'Ust. Ammar', tokenUjian: 'TARIKH7', durasiMenit: 40 },
  { id: 'MPL-W7-06', namaMapel: 'Shorof', unit: 'Wustho', kelas: 'Kelas 7', pengampu: 'Ust. Mujahid', tokenUjian: 'SHOROF7', durasiMenit: 45 },
  { id: 'MPL-W7-07', namaMapel: 'Hadits', unit: 'Wustho', kelas: 'Kelas 7', pengampu: 'Ust. Wildan', tokenUjian: 'HADITS7', durasiMenit: 40 },
  { id: 'MPL-W7-08', namaMapel: 'Bahasa Inggris', unit: 'Wustho', kelas: 'Kelas 7', pengampu: 'Ust. Musana', tokenUjian: 'INGGRIS7', durasiMenit: 45 },
  { id: 'MPL-W7-09', namaMapel: 'IT (Ilmu Teknologi)', unit: 'Wustho', kelas: 'Kelas 7', pengampu: 'Ust. Rizqi & Ust. Shiddiq', tokenUjian: 'ITWUSTHO7', durasiMenit: 45 },
  { id: 'MPL-W7-10', namaMapel: "Imla' & Khot", unit: 'Wustho', kelas: 'Kelas 7', pengampu: 'Ust. Ammar', tokenUjian: 'IMLA7', durasiMenit: 40 },
  { id: 'MPL-W7-11', namaMapel: 'Fiqih', unit: 'Wustho', kelas: 'Kelas 7', pengampu: 'Ust. Azmi', tokenUjian: 'FIQIH7', durasiMenit: 45 },
  { id: 'MPL-W7-12', namaMapel: 'Mufrodat', unit: 'Wustho', kelas: 'Kelas 7', pengampu: 'Ust. Ammar', tokenUjian: 'MUFRODAT7', durasiMenit: 40 },
  { id: 'MPL-W7-13', namaMapel: "Adab & Do'a", unit: 'Wustho', kelas: 'Kelas 7', pengampu: 'Ust. Mujahid', tokenUjian: 'ADAB7', durasiMenit: 40 },

  // ==================== UNIT WUSTHO - KELAS 8 (VIII) ====================
  { id: 'MPL-W8-01', namaMapel: 'Nahwu', unit: 'Wustho', kelas: 'Kelas 8', pengampu: 'Ust. Ammar', tokenUjian: 'NAHWU8', durasiMenit: 45 },
  { id: 'MPL-W8-02', namaMapel: 'Akhlaq', unit: 'Wustho', kelas: 'Kelas 8', pengampu: 'Ust. Marzuki (Ust. Juki)', tokenUjian: 'AKHLAQ8', durasiMenit: 40 },
  { id: 'MPL-W8-03', namaMapel: 'Literasi', unit: 'Wustho', kelas: 'Kelas 8', pengampu: 'Ust. Ammar', tokenUjian: 'LITERASI8', durasiMenit: 40 },
  { id: 'MPL-W8-04', namaMapel: 'ABY (Al-Arabiyyah Baina Yadaik)', unit: 'Wustho', kelas: 'Kelas 8', pengampu: 'Ust. Mustaqim', tokenUjian: 'ABY8', durasiMenit: 45 },
  { id: 'MPL-W8-05', namaMapel: 'Hadits', unit: 'Wustho', kelas: 'Kelas 8', pengampu: 'Ust. Wildan', tokenUjian: 'HADITS8', durasiMenit: 40 },
  { id: 'MPL-W8-06', namaMapel: 'Shorof', unit: 'Wustho', kelas: 'Kelas 8', pengampu: 'Ust. Mujahid', tokenUjian: 'SHOROF8', durasiMenit: 45 },
  { id: 'MPL-W8-07', namaMapel: 'Tarikh', unit: 'Wustho', kelas: 'Kelas 8', pengampu: 'Ust. Ammar', tokenUjian: 'TARIKH8', durasiMenit: 40 },
  { id: 'MPL-W8-08', namaMapel: 'IT (Ilmu Teknologi)', unit: 'Wustho', kelas: 'Kelas 8', pengampu: 'Ust. Rizqi & Ust. Taufiq', tokenUjian: 'ITWUSTHO8', durasiMenit: 45 },
  { id: 'MPL-W8-09', namaMapel: 'Aqidah', unit: 'Wustho', kelas: 'Kelas 8', pengampu: 'Ust. Mustaqim', tokenUjian: 'AQIDAH8', durasiMenit: 40 },
  { id: 'MPL-W8-10', namaMapel: "Adab & Do'a", unit: 'Wustho', kelas: 'Kelas 8', pengampu: 'Ust. Wildan', tokenUjian: 'ADAB8', durasiMenit: 40 },
  { id: 'MPL-W8-11', namaMapel: 'Fiqih', unit: 'Wustho', kelas: 'Kelas 8', pengampu: 'Ust. Azmi', tokenUjian: 'FIQIH8', durasiMenit: 45 },
  { id: 'MPL-W8-12', namaMapel: 'Bahasa Inggris', unit: 'Wustho', kelas: 'Kelas 8', pengampu: 'Ust. Musana', tokenUjian: 'INGGRIS8', durasiMenit: 45 },

  // ==================== UNIT WUSTHO - KELAS 9 (IX) ====================
  { id: 'MPL-W9-01', namaMapel: 'Fiqih', unit: 'Wustho', kelas: 'Kelas 9', pengampu: 'Ust. Azmi', tokenUjian: 'FIQIH9', durasiMenit: 45 },
  { id: 'MPL-W9-02', namaMapel: 'IT (Ilmu Teknologi)', unit: 'Wustho', kelas: 'Kelas 9', pengampu: 'Ust. Saiful & Ust. Shiddiq', tokenUjian: 'ITWUSTHO9', durasiMenit: 45 },
  { id: 'MPL-W9-03', namaMapel: 'ABY (Al-Arabiyyah Baina Yadaik)', unit: 'Wustho', kelas: 'Kelas 9', pengampu: 'Ust. Ammar', tokenUjian: 'ABY9', durasiMenit: 45 },
  { id: 'MPL-W9-04', namaMapel: 'Hadits', unit: 'Wustho', kelas: 'Kelas 9', pengampu: 'Ust. Wildan', tokenUjian: 'HADITS9', durasiMenit: 40 },
  { id: 'MPL-W9-05', namaMapel: 'Nahwu', unit: 'Wustho', kelas: 'Kelas 9', pengampu: 'Ust. Ammar', tokenUjian: 'NAHWU9', durasiMenit: 45 },
  { id: 'MPL-W9-06', namaMapel: 'Tarikh', unit: 'Wustho', kelas: 'Kelas 9', pengampu: 'Ust. Ammar', tokenUjian: 'TARIKH9', durasiMenit: 40 },
  { id: 'MPL-W9-07', namaMapel: "Adab & Do'a", unit: 'Wustho', kelas: 'Kelas 9', pengampu: 'Ust. Wildan', tokenUjian: 'ADAB9', durasiMenit: 40 },
  { id: 'MPL-W9-08', namaMapel: 'Shorof', unit: 'Wustho', kelas: 'Kelas 9', pengampu: 'Ust. Mujahid', tokenUjian: 'SHOROF9', durasiMenit: 45 },
  { id: 'MPL-W9-09', namaMapel: 'Literasi', unit: 'Wustho', kelas: 'Kelas 9', pengampu: 'Ust. Ammar', tokenUjian: 'LITERASI9', durasiMenit: 40 },
  { id: 'MPL-W9-10', namaMapel: 'Aqidah', unit: 'Wustho', kelas: 'Kelas 9', pengampu: 'Ust. Mustaqim', tokenUjian: 'AQIDAH9', durasiMenit: 40 },
  { id: 'MPL-W9-11', namaMapel: 'Akhlaq', unit: 'Wustho', kelas: 'Kelas 9', pengampu: 'Ust. Marzuki (Ust. Juki)', tokenUjian: 'AKHLAQ9', durasiMenit: 40 },
  { id: 'MPL-W9-12', namaMapel: 'Bahasa Inggris', unit: 'Wustho', kelas: 'Kelas 9', pengampu: 'Ust. Musana', tokenUjian: 'INGGRIS9', durasiMenit: 45 },

  // ==================== UNIT ULYA - KELAS 10 (X) ====================
  { id: 'MPL-U10-01', namaMapel: 'IT (Ilmu Teknologi)', unit: 'Ulya', kelas: 'Kelas 10', pengampu: 'Ust. Taufiq & Ust. Teguh', tokenUjian: 'ITULYA10', durasiMenit: 45 },
  { id: 'MPL-U10-02', namaMapel: "Imla'", unit: 'Ulya', kelas: 'Kelas 10', pengampu: 'Ust. Fadlurrahman', tokenUjian: 'IMLA10', durasiMenit: 40 },
  { id: 'MPL-U10-03', namaMapel: 'Akhlak', unit: 'Ulya', kelas: 'Kelas 10', pengampu: 'Ust. Rifqi', tokenUjian: 'AKHLAK10', durasiMenit: 40 },
  { id: 'MPL-U10-04', namaMapel: 'Aqidah', unit: 'Ulya', kelas: 'Kelas 10', pengampu: 'Ust. Marzuki (Ust. Juki)', tokenUjian: 'AQIDAH10', durasiMenit: 45 },
  { id: 'MPL-U10-05', namaMapel: 'Bahasa Inggris', unit: 'Ulya', kelas: 'Kelas 10', pengampu: 'Ust. Musana', tokenUjian: 'INGGRIS10', durasiMenit: 45 },
  { id: 'MPL-U10-06', namaMapel: 'Psikologi Terapan (PsiTer)', unit: 'Ulya', kelas: 'Kelas 10', pengampu: 'Ust. Musana', tokenUjian: 'PSITER10', durasiMenit: 40 },
  { id: 'MPL-U10-07', namaMapel: 'Fiqih', unit: 'Ulya', kelas: 'Kelas 10', pengampu: 'Ust. Fadlurrahman', tokenUjian: 'FIQIH10', durasiMenit: 45 },
  { id: 'MPL-U10-08', namaMapel: 'Literasi', unit: 'Ulya', kelas: 'Kelas 10', pengampu: 'Ust. Musana', tokenUjian: 'LITERASI10', durasiMenit: 40 },
  { id: 'MPL-U10-09', namaMapel: 'Siroh', unit: 'Ulya', kelas: 'Kelas 10', pengampu: 'Ust. Fadlurrahman', tokenUjian: 'SIROH10', durasiMenit: 45 },
  { id: 'MPL-U10-10', namaMapel: 'Nahwu', unit: 'Ulya', kelas: 'Kelas 10', pengampu: 'Ust. Marzuki (Ust. Juki)', tokenUjian: 'NAHWU10', durasiMenit: 45 },
  { id: 'MPL-U10-11', namaMapel: 'Shorof', unit: 'Ulya', kelas: 'Kelas 10', pengampu: 'Ust. Marzuki (Ust. Juki)', tokenUjian: 'SHOROF10', durasiMenit: 45 },
  { id: 'MPL-U10-12', namaMapel: 'Hadits', unit: 'Ulya', kelas: 'Kelas 10', pengampu: 'Ust. Muadz', tokenUjian: 'HADITS10', durasiMenit: 45 },
  { id: 'MPL-U10-13', namaMapel: "Adab & Do'a", unit: 'Ulya', kelas: 'Kelas 10', pengampu: 'Ust. Muadz', tokenUjian: 'ADAB10', durasiMenit: 40 },
  { id: 'MPL-U10-14', namaMapel: 'Litbang', unit: 'Ulya', kelas: 'Kelas 10', pengampu: 'Ust. Musana', tokenUjian: 'LITBANG10', durasiMenit: 45 },
  { id: 'MPL-U10-15', namaMapel: 'ABY (Al-Arabiyyah Baina Yadaik)', unit: 'Ulya', kelas: 'Kelas 10', pengampu: 'Ust. Muadz', tokenUjian: 'ABY10', durasiMenit: 45 },

  // ==================== UNIT ULYA - KELAS 11 (XI) ====================
  { id: 'MPL-U11-01', namaMapel: 'Siroh', unit: 'Ulya', kelas: 'Kelas 11', pengampu: 'Ust. Fadlurrahman', tokenUjian: 'SIROH11', durasiMenit: 45 },
  { id: 'MPL-U11-02', namaMapel: 'IT (Ilmu Teknologi)', unit: 'Ulya', kelas: 'Kelas 11', pengampu: 'Ust. Shiddiq & Ust. Rizqi', tokenUjian: 'ITULYA11', durasiMenit: 45 },
  { id: 'MPL-U11-03', namaMapel: 'Bahasa Inggris', unit: 'Ulya', kelas: 'Kelas 11', pengampu: 'Ust. Musana', tokenUjian: 'INGGRIS11', durasiMenit: 45 },
  { id: 'MPL-U11-04', namaMapel: 'Akhlak', unit: 'Ulya', kelas: 'Kelas 11', pengampu: 'Ust. Rifqi', tokenUjian: 'AKHLAK11', durasiMenit: 40 },
  { id: 'MPL-U11-05', namaMapel: 'Psikologi Terapan (PsiTer)', unit: 'Ulya', kelas: 'Kelas 11', pengampu: 'Ust. Musana', tokenUjian: 'PSITER11', durasiMenit: 40 },
  { id: 'MPL-U11-06', namaMapel: 'Aqidah', unit: 'Ulya', kelas: 'Kelas 11', pengampu: 'Ust. Marzuki (Ust. Juki)', tokenUjian: 'AQIDAH11', durasiMenit: 45 },
  { id: 'MPL-U11-07', namaMapel: "Imla'", unit: 'Ulya', kelas: 'Kelas 11', pengampu: 'Ust. Fadlurrahman', tokenUjian: 'IMLA11', durasiMenit: 40 },
  { id: 'MPL-U11-08', namaMapel: 'Literasi', unit: 'Ulya', kelas: 'Kelas 11', pengampu: 'Ust. Musana', tokenUjian: 'LITERASI11', durasiMenit: 40 },
  { id: 'MPL-U11-09', namaMapel: 'Nahwu', unit: 'Ulya', kelas: 'Kelas 11', pengampu: 'Ust. Marzuki (Ust. Juki)', tokenUjian: 'NAHWU11', durasiMenit: 45 },
  { id: 'MPL-U11-10', namaMapel: 'Shorof', unit: 'Ulya', kelas: 'Kelas 11', pengampu: 'Ust. Marzuki (Ust. Juki)', tokenUjian: 'SHOROF11', durasiMenit: 45 },
  { id: 'MPL-U11-11', namaMapel: 'Hadits', unit: 'Ulya', kelas: 'Kelas 11', pengampu: 'Ust. Muadz', tokenUjian: 'HADITS11', durasiMenit: 45 },
  { id: 'MPL-U11-12', namaMapel: 'Litbang', unit: 'Ulya', kelas: 'Kelas 11', pengampu: 'Ust. Musana', tokenUjian: 'LITBANG11', durasiMenit: 45 },
  { id: 'MPL-U11-13', namaMapel: 'Fiqih', unit: 'Ulya', kelas: 'Kelas 11', pengampu: 'Ust. Fadlurrahman', tokenUjian: 'FIQIH11', durasiMenit: 45 },
  { id: 'MPL-U11-14', namaMapel: "Adab & Do'a", unit: 'Ulya', kelas: 'Kelas 11', pengampu: 'Ust. Taufiq', tokenUjian: 'ADAB11', durasiMenit: 40 },
  { id: 'MPL-U11-15', namaMapel: 'ABY (Al-Arabiyyah Baina Yadaik)', unit: 'Ulya', kelas: 'Kelas 11', pengampu: 'Ust. Muadz', tokenUjian: 'ABY11', durasiMenit: 45 },

  // ==================== UNIT ULYA - KELAS 12 (XII) ====================
  { id: 'MPL-U12-01', namaMapel: 'Siroh', unit: 'Ulya', kelas: 'Kelas 12', pengampu: 'Ust. Fadlurrahman', tokenUjian: 'SIROH12', durasiMenit: 45 },
  { id: 'MPL-U12-02', namaMapel: 'Hadits', unit: 'Ulya', kelas: 'Kelas 12', pengampu: 'Ust. Muadz', tokenUjian: 'HADITS12', durasiMenit: 45 },
  { id: 'MPL-U12-03', namaMapel: "Imla'", unit: 'Ulya', kelas: 'Kelas 12', pengampu: 'Ust. Fadlurrahman', tokenUjian: 'IMLA12', durasiMenit: 40 },
  { id: 'MPL-U12-04', namaMapel: 'Fiqih', unit: 'Ulya', kelas: 'Kelas 12', pengampu: 'Ust. Fadlurrahman', tokenUjian: 'FIQIH12', durasiMenit: 45 },
  { id: 'MPL-U12-05', namaMapel: 'IT (Ilmu Teknologi)', unit: 'Ulya', kelas: 'Kelas 12', pengampu: 'Ust. Shiddiq & Ust. Rizqi', tokenUjian: 'ITULYA12', durasiMenit: 45 },
  { id: 'MPL-U12-06', namaMapel: 'Bahasa Inggris', unit: 'Ulya', kelas: 'Kelas 12', pengampu: 'Ust. Musana', tokenUjian: 'INGGRIS12', durasiMenit: 45 },
  { id: 'MPL-U12-07', namaMapel: 'Akhlak', unit: 'Ulya', kelas: 'Kelas 12', pengampu: 'Ust. Rifqi', tokenUjian: 'AKHLAK12', durasiMenit: 40 },
  { id: 'MPL-U12-08', namaMapel: 'Literasi', unit: 'Ulya', kelas: 'Kelas 12', pengampu: 'Ust. Musana', tokenUjian: 'LITERASI12', durasiMenit: 40 },
  { id: 'MPL-U12-09', namaMapel: 'Nahwu', unit: 'Ulya', kelas: 'Kelas 12', pengampu: 'Ust. Azmi', tokenUjian: 'NAHWU12', durasiMenit: 45 },
  { id: 'MPL-U12-10', namaMapel: 'Shorof', unit: 'Ulya', kelas: 'Kelas 12', pengampu: 'Ust. Azmi', tokenUjian: 'SHOROF12', durasiMenit: 45 },
  { id: 'MPL-U12-11', namaMapel: 'Aqidah', unit: 'Ulya', kelas: 'Kelas 12', pengampu: 'Ust. Marzuki (Ust. Juki)', tokenUjian: 'AQIDAH12', durasiMenit: 45 },
  { id: 'MPL-U12-12', namaMapel: "Adab & Do'a", unit: 'Ulya', kelas: 'Kelas 12', pengampu: 'Ust. Shiddiq', tokenUjian: 'ADAB12', durasiMenit: 40 },
  { id: 'MPL-U12-13', namaMapel: 'Menejemen', unit: 'Ulya', kelas: 'Kelas 12', pengampu: 'Ust. Yahya', tokenUjian: 'MENEJEMEN12', durasiMenit: 45 },
  { id: 'MPL-U12-14', namaMapel: 'Psikologi Terapan (PsiTer)', unit: 'Ulya', kelas: 'Kelas 12', pengampu: 'Ust. Musana', tokenUjian: 'PSITER12', durasiMenit: 40 },
  { id: 'MPL-U12-15', namaMapel: 'Litbang', unit: 'Ulya', kelas: 'Kelas 12', pengampu: 'Ust. Musana', tokenUjian: 'LITBANG12', durasiMenit: 45 },

  // ==================== UNIT MDA - JUNIOR ====================
  { id: 'MPL-MDAJ-01', namaMapel: 'Safinah (Fiqih Dasar)', unit: 'MDA', kelas: 'Junior', pengampu: 'Ust. Saiful (Ust. Saif)', tokenUjian: 'SAFINAHJR', durasiMenit: 45 },
  { id: 'MPL-MDAJ-02', namaMapel: 'UI/UX Design', unit: 'MDA', kelas: 'Junior', pengampu: 'Ust. Teguh', tokenUjian: 'UIUXJR', durasiMenit: 60 },
  { id: 'MPL-MDAJ-03', namaMapel: 'Bidayatul Hidayah', unit: 'MDA', kelas: 'Junior', pengampu: 'Ust. Azmi', tokenUjian: 'BIDAYAHJR', durasiMenit: 45 },
  { id: 'MPL-MDAJ-04', namaMapel: 'Karakter & Menejemen', unit: 'MDA', kelas: 'Junior', pengampu: 'Ust. Yahya', tokenUjian: 'KARAKTERJR', durasiMenit: 45 },
  { id: 'MPL-MDAJ-05', namaMapel: 'Canva & Infinity Design', unit: 'MDA', kelas: 'Junior', pengampu: 'Ust. Rizqi (Ust. Rizky)', tokenUjian: 'CANVAJR', durasiMenit: 60 },
  { id: 'MPL-MDAJ-06', namaMapel: 'Tahsin / Al-Jazariyyah', unit: 'MDA', kelas: 'Junior', pengampu: 'Ust. Rizqi (Ust. Rizky)', tokenUjian: 'JAZARIJR', durasiMenit: 45 },
  { id: 'MPL-MDAJ-07', namaMapel: 'Aqidah', unit: 'MDA', kelas: 'Junior', pengampu: 'Ust. Azmi', tokenUjian: 'AQIDAHJR', durasiMenit: 45 },
  { id: 'MPL-MDAJ-08', namaMapel: 'Bank Konten & Dakwah Digital', unit: 'MDA', kelas: 'Junior', pengampu: 'Ust. Azmi', tokenUjian: 'KONTENJR', durasiMenit: 45 },
  { id: 'MPL-MDAJ-09', namaMapel: 'Office Tools', unit: 'MDA', kelas: 'Junior', pengampu: 'Ust. Shiddiq', tokenUjian: 'OFFICEJR', durasiMenit: 45 },

  // ==================== UNIT MDA - SENIOR ====================
  { id: 'MPL-MDAS-01', namaMapel: 'Multimedia Production', unit: 'MDA', kelas: 'Senior', pengampu: 'Pak Afif (Ust. Afif)', tokenUjian: 'MULTISR', durasiMenit: 60 },
  { id: 'MPL-MDAS-02', namaMapel: 'Graphic Design', unit: 'MDA', kelas: 'Senior', pengampu: 'Ust. Teguh', tokenUjian: 'GRAPHICSR', durasiMenit: 60 },
  { id: 'MPL-MDAS-03', namaMapel: 'Full-Stack Web Engineering', unit: 'MDA', kelas: 'Senior', pengampu: 'Ust. Teguh & Ust. Rizqi', tokenUjian: 'MDACODE', durasiMenit: 60 },

  // ==================== UNIT MDA - PUTRI ====================
  { id: 'MPL-MDAP-01', namaMapel: 'Digital Marketing (DM)', unit: 'MDA', kelas: 'Putri', pengampu: 'Pak Azzam (Ust. Azzam)', tokenUjian: 'DMPUTRI', durasiMenit: 60 },
  { id: 'MPL-MDAP-02', namaMapel: 'Tugas Konten / Live Streaming', unit: 'MDA', kelas: 'Putri', pengampu: 'Pak Azzam (Ust. Azzam)', tokenUjian: 'LIVEPUTRI', durasiMenit: 60 },
  { id: 'MPL-MDAP-03', namaMapel: 'Bidayatul Hidayah', unit: 'MDA', kelas: 'Putri', pengampu: 'Ust. Azmi', tokenUjian: 'BIDAYAHPR', durasiMenit: 45 },
  { id: 'MPL-MDAP-04', namaMapel: 'Aqidah', unit: 'MDA', kelas: 'Putri', pengampu: 'Ust. Azmi', tokenUjian: 'AQIDAHPR', durasiMenit: 45 },
  { id: 'MPL-MDAP-05', namaMapel: 'Karakter & Menejemen', unit: 'MDA', kelas: 'Putri', pengampu: 'Ust. Yahya', tokenUjian: 'KARAKTERPR', durasiMenit: 45 },
  { id: 'MPL-MDAP-06', namaMapel: 'Affiliate Practice', unit: 'MDA', kelas: 'Putri', pengampu: 'Ust. Shiddiq', tokenUjian: 'AFFILIATEPR', durasiMenit: 60 },

  // ==================== HALAQAH TAHFIDZ & MENTORING MDA ====================
  { id: 'MPL-W7-14', namaMapel: "Tahfidz Al-Qur'an", unit: 'Wustho', kelas: 'Kelas 7', pengampu: 'Ust. Anwar H', tokenUjian: 'TAHFIDZ7', durasiMenit: 45 },
  { id: 'MPL-W8-13', namaMapel: "Tahfidz Al-Qur'an", unit: 'Wustho', kelas: 'Kelas 8', pengampu: 'Ust. Anwar H', tokenUjian: 'TAHFIDZ8', durasiMenit: 45 },
  { id: 'MPL-W9-13', namaMapel: "Tahfidz Al-Qur'an", unit: 'Wustho', kelas: 'Kelas 9', pengampu: 'Ust. Anwar H', tokenUjian: 'TAHFIDZ9', durasiMenit: 45 },
  { id: 'MPL-MDAJ-10', namaMapel: 'Karakter & Mentoring MDA', unit: 'MDA', kelas: 'Junior', pengampu: 'Ust. Sabardi & Ust. Hilmi', tokenUjian: 'MENTORJR', durasiMenit: 45 },
  { id: 'MPL-MDAS-04', namaMapel: 'Karakter & Mentoring MDA', unit: 'MDA', kelas: 'Senior', pengampu: 'Ust. Sabardi & Ust. Hilmi', tokenUjian: 'MENTORSR', durasiMenit: 45 },
];

export const DAFTAR_114_SURAT_QURAN: string[] = [
  '1. Al-Fatihah',
  '2. Al-Baqarah',
  "3. Ali 'Imran",
  '4. An-Nisa',
  "5. Al-Ma'idah",
  "6. Al-An'am",
  "7. Al-A'raf",
  '8. Al-Anfal',
  '9. At-Taubah',
  '10. Yunus',
  '11. Hud',
  '12. Yusuf',
  "13. Ar-Ra'd",
  '14. Ibrahim',
  '15. Al-Hijr',
  '16. An-Nahl',
  '17. Al-Isra',
  '18. Al-Kahf',
  '19. Maryam',
  '20. Ta-Ha',
  '21. Al-Anbiya',
  '22. Al-Hajj',
  "23. Al-Mu'minun",
  '24. An-Nur',
  '25. Al-Furqan',
  "26. Asy-Syu'ara",
  '27. An-Naml',
  '28. Al-Qasas',
  '29. Al-Ankabut',
  '30. Ar-Rum',
  '31. Luqman',
  '32. As-Sajdah',
  '33. Al-Ahzab',
  '34. Saba',
  '35. Fatir',
  '36. Ya-Sin',
  '37. As-Saffat',
  '38. Sad',
  '39. Az-Zumar',
  '40. Ghafir',
  '41. Fussilat',
  '42. Asy-Syura',
  '43. Az-Zukhruf',
  '44. Ad-Dukhan',
  '45. Al-Jasiyah',
  '46. Al-Ahqaf',
  '47. Muhammad',
  '48. Al-Fath',
  '49. Al-Hujurat',
  '50. Qaf',
  '51. Az-Zariyat',
  '52. At-Tur',
  '53. An-Najm',
  '54. Al-Qamar',
  '55. Ar-Rahman',
  "56. Al-Waqi'ah",
  '57. Al-Hadid',
  '58. Al-Mujadilah',
  '59. Al-Hasyr',
  '60. Al-Mumtahanah',
  '61. As-Saff',
  "62. Al-Jumu'ah",
  '63. Al-Munafiqun',
  '64. At-Taghabun',
  '65. At-Talaq',
  '66. At-Tahrim',
  '67. Al-Mulk',
  '68. Al-Qalam',
  '69. Al-Haqqah',
  "70. Al-Ma'arij",
  '71. Nuh',
  '72. Al-Jinn',
  '73. Al-Muzzammil',
  '74. Al-Muddassir',
  '75. Al-Qiyamah',
  '76. Al-Insan',
  '77. Al-Mursalat',
  '78. An-Naba',
  "79. An-Nazi'at",
  "80. 'Abasa",
  '81. At-Takwir',
  '82. Al-Infitar',
  '83. Al-Mutaffifin',
  '84. Al-Insyiqaq',
  '85. Al-Buruj',
  '86. At-Tariq',
  "87. Al-A'la",
  '88. Al-Ghasyiyah',
  '89. Al-Fajr',
  '90. Al-Balad',
  '91. Asy-Syams',
  '92. Al-Lail',
  '93. Ad-Duha',
  '94. Asy-Syarh',
  '95. At-Tin',
  "96. Al-'Alaq",
  '97. Al-Qadr',
  '98. Al-Bayyinah',
  '99. Az-Zalzalah',
  "100. Al-'Adiyat",
  "101. Al-Qari'ah",
  '102. At-Takasur',
  "103. Al-'Asr",
  '104. Al-Humazah',
  '105. Al-Fil',
  '106. Quraisy',
  "107. Al-Ma'un",
  '108. Al-Kausar',
  '109. Al-Kafirun',
  '110. An-Nasr',
  '111. Al-Lahab',
  '112. Al-Ikhlas',
  '113. Al-Falaq',
  '114. An-Nas',
];

export const PURE_JS_SIMULATION_CODE = `/**
 * Fungsi JavaScript Murni (Pure Function)
 * Menghitung Nilai Akhir (Skala 0-100) dari 4 Komponen Penilaian Pesantren
 * beserta penentuan Predikat Akademik (A, B, C, D).
 *
 * Bobot Komponen:
 * - Nilai Tugas Harian : 20% (0.20)
 * - Nilai Sikap / Adab : 20% (0.20)
 * - Nilai Ujian Lisan  : 20% (0.20)
 * - Nilai Ujian CBT    : 40% (0.40)
 */
function hitungNilaiAkhirPesantren(nilaiTugas, nilaiSikap, nilaiLisan, nilaiCBT) {
  // 1. Konversi & sanitasi input agar berada di rentang valid (0 - 100)
  const clampNilai = (val) => {
    const num = parseFloat(val);
    if (Number.isNaN(num)) return 0;
    return Math.min(100, Math.max(0, num));
  };

  const tugas = clampNilai(nilaiTugas);
  const sikap = clampNilai(nilaiSikap);
  const lisan = clampNilai(nilaiLisan);
  const cbt   = clampNilai(nilaiCBT);

  // 2. Konstanta bobot masing-masing komponen (Total = 1.00 / 100%)
  const BOBOT = {
    TUGAS: 0.20,
    SIKAP: 0.20,
    LISAN: 0.20,
    CBT:   0.40
  };

  // 3. Hitung kontribusi poin tiap komponen
  const kontribusiTugas = tugas * BOBOT.TUGAS;
  const kontribusiSikap = sikap * BOBOT.SIKAP;
  const kontribusiLisan = lisan * BOBOT.LISAN;
  const kontribusiCBT   = cbt   * BOBOT.CBT;

  // 4. Jumlahkan menjadi Nilai Akhir (dibulatkan 2 angka di belakang koma)
  const totalMentah = kontribusiTugas + kontribusiSikap + kontribusiLisan + kontribusiCBT;
  const nilaiAkhir  = Math.round(totalMentah * 100) / 100;

  // 5. Tentukan Predikat & Keterangan Kelulusan
  let predikat = "D";
  let sebutan  = "Maqbul (Perlu Pembinaan)";

  if (nilaiAkhir >= 85) {
    predikat = "A";
    sebutan  = "Mumtaz (Sangat Baik)";
  } else if (nilaiAkhir >= 75) {
    predikat = "B";
    sebutan  = "Jayyid Jiddan (Baik)";
  } else if (nilaiAkhir >= 60) {
    predikat = "C";
    sebutan  = "Jayyid (Cukup)";
  }

  return {
    rincianInput: { tugas, sikap, lisan, cbt },
    kontribusiBobot: {
      tugas20Persen: Number(kontribusiTugas.toFixed(2)),
      sikap20Persen: Number(kontribusiSikap.toFixed(2)),
      lisan20Persen: Number(kontribusiLisan.toFixed(2)),
      cbt40Persen:   Number(kontribusiCBT.toFixed(2))
    },
    nilaiAkhir,
    predikat,
    sebutan,
    statusLulus: nilaiAkhir >= 60
  };
}`;
