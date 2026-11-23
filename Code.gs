/**
 * ============================================================================
 * SISTEM ALL-IN-ONE CBT WEB-LOCKDOWN & E-RAPOR DIGITAL PESANTREN
 * Backend: Google Apps Script (Code.gs)
 * Database: Google Sheets (4 Sheets Otomatis)
 * ============================================================================
 */

// 1. KONFIGURASI KONSTANTA BOBOT PERSENTASE NILAI
const BOBOT_TUGAS_HARIAN = 0.20; // 20%
const BOBOT_SIKAP        = 0.20; // 20%
const BOBOT_UJIAN_LISAN  = 0.20; // 20%
const BOBOT_UJIAN_CBT    = 0.40; // 40%

// Token default ujian CBT (dapat disesuaikan oleh Ustadz/Panitia)
const TOKEN_UJIAN_DEFAULT = "SANTRI2026";

// Nama-nama Sheet di Google Spreadsheet
const SHEET_SANTRI = "Master_Santri";
const SHEET_SOAL   = "Bank_Soal";
const SHEET_LOG    = "Log_Ujian_CBT";
const SHEET_NILAI  = "Nilai_Mapel";

/**
 * 2. FUNGSI doGet() UNTUK MERENDER HALAMAN WEB Index.html
 */
function doGet(e) {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('CBT Web-Lockdown & e-Rapor Digital Pesantren')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Helper untuk mengambil objek Spreadsheet aktif
 */
function getSpreadsheet_() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

/**
 * Helper untuk menghitung Nilai Akhir (skala 0-100) dan Predikat (A/B/C/D)
 */
function hitungNilaiAkhirDanPredikat_(tugas, sikap, lisan, cbt) {
  const nTugas = parseFloat(tugas) || 0;
  const nSikap = parseFloat(sikap) || 0;
  const nLisan = parseFloat(lisan) || 0;
  const nCBT   = parseFloat(cbt)   || 0;

  const nilaiAkhirRaw = (nTugas * BOBOT_TUGAS_HARIAN) +
                        (nSikap * BOBOT_SIKAP) +
                        (nLisan * BOBOT_UJIAN_LISAN) +
                        (nCBT   * BOBOT_UJIAN_CBT);

  const nilaiAkhir = Math.round(nilaiAkhirRaw * 100) / 100;

  let predikat = "D";
  if (nilaiAkhir >= 85) {
    predikat = "A";
  } else if (nilaiAkhir >= 75) {
    predikat = "B";
  } else if (nilaiAkhir >= 60) {
    predikat = "C";
  } else {
    predikat = "D";
  }

  return {
    nilaiAkhir: nilaiAkhir,
    predikat: predikat
  };
}

/**
 * 3. FUNGSI OTOMATIS setupDatabase()
 * Jalankan fungsi ini 1 kali dari Editor Apps Script untuk membuat ke-4 Sheet,
 * memformat warna header kolom, serta mengisi masing-masing 2 data dummy.
 */
function setupDatabase() {
  const ss = getSpreadsheet_();

  // Definisi struktur ke-4 Sheet beserta warna header dan data dummy awal
  const schemaConfig = [
    {
      name: SHEET_SANTRI,
      headerColor: "#065f46", // Emerald 800
      headers: ["NIS", "Nama_Santri", "Unit_Kelas", "PIN_Akses"],
      dummyRows: [
        ["SNT-202601", "Ahmad Fauzi Al-Farisi", "Kulliyatul Mu'allimin - Kelas 1A", "123456"],
        ["SNT-202602", "Muhammad Заidan Al-Baihaqi", "Kulliyatul Mu'allimin - Kelas 1A", "654321"]
      ]
    },
    {
      name: SHEET_SOAL,
      headerColor: "#1e3a8a", // Blue 900
      headers: [
        "ID_Soal", "Unit_Kelas", "Mapel", "Pertanyaan",
        "Opsi_A", "Opsi_B", "Opsi_C", "Opsi_D", "Kunci_Jawaban", "Bobot_Soal"
      ],
      dummyRows: [
        [
          "SOAL-001",
          "Kulliyatul Mu'allimin - Kelas 1A",
          "Fiqih Ibadah",
          "Air yang suci dan mensucikan serta tidak makruh digunakan untuk bersuci disebut dalam istilah Fiqih sebagai...",
          "Air Mutlak (Thahir Muthahhir)",
          "Air Musta'mal",
          "Air Musyammas",
          "Air Mutanajjis",
          "A",
          50
        ],
        [
          "SOAL-002",
          "Kulliyatul Mu'allimin - Kelas 1A",
          "Fiqih Ibadah",
          "Berapakah jumlah rukun wudhu menurut Mazhab Syafi'i yang wajib dikerjakan secara tertib?",
          "4 Rukun",
          "5 Rukun",
          "6 Rukun",
          "7 Rukun",
          "C",
          50
        ]
      ]
    },
    {
      name: SHEET_LOG,
      headerColor: "#7c2d12", // Amber/Orange 900
      headers: [
        "Timestamp", "NIS", "Nama_Santri", "Unit_Kelas",
        "Mapel", "Skor_CBT", "Jumlah_Pelanggaran", "Status"
      ],
      dummyRows: [
        [
          Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss"),
          "SNT-202601",
          "Ahmad Fauzi Al-Farisi",
          "Kulliyatul Mu'allimin - Kelas 1A",
          "Fiqih Ibadah",
          100,
          0,
          "Selesai Normal"
        ],
        [
          Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss"),
          "SNT-202602",
          "Muhammad Zaidan Al-Baihaqi",
          "Kulliyatul Mu'allimin - Kelas 1A",
          "Fiqih Ibadah",
          50,
          1,
          "Selesai dengan Peringatan"
        ]
      ]
    },
    {
      name: SHEET_NILAI,
      headerColor: "#312e81", // Indigo 900
      headers: [
        "ID_Baris", "NIS", "Nama_Santri", "Unit_Kelas", "Mapel",
        "Nilai_Tugas_Harian", "Nilai_Sikap", "Nilai_Ujian_Lisan",
        "Nilai_CBT", "Nilai_Akhir", "Predikat"
      ],
      dummyRows: [
        [
          "NLI-001",
          "SNT-202601",
          "Ahmad Fauzi Al-Farisi",
          "Kulliyatul Mu'allimin - Kelas 1A",
          "Fiqih Ibadah",
          88,
          92,
          85,
          100,
          93.00,
          "A"
        ],
        [
          "NLI-002",
          "SNT-202602",
          "Muhammad Zaidan Al-Baihaqi",
          "Kulliyatul Mu'allimin - Kelas 1A",
          "Fiqih Ibadah",
          80,
          85,
          78,
          50,
          68.60,
          "C"
        ]
      ]
    }
  ];

  schemaConfig.forEach(function(cfg) {
    let sheet = ss.getSheetByName(cfg.name);
    if (!sheet) {
      sheet = ss.insertSheet(cfg.name);
    } else {
      sheet.clear();
    }

    // Set Header
    const headerRange = sheet.getRange(1, 1, 1, cfg.headers.length);
    headerRange.setValues([cfg.headers]);
    headerRange.setBackground(cfg.headerColor);
    headerRange.setFontColor("#ffffff");
    headerRange.setFontWeight("bold");
    headerRange.setHorizontalAlignment("center");
    headerRange.setVerticalAlignment("middle");
    sheet.setRowHeight(1, 36);
    sheet.setFrozenRows(1);

    // Insert Dummy Data jika ada
    if (cfg.dummyRows && cfg.dummyRows.length > 0) {
      const dataRange = sheet.getRange(2, 1, cfg.dummyRows.length, cfg.headers.length);
      dataRange.setValues(cfg.dummyRows);
      dataRange.setVerticalAlignment("middle");
    }

    // Auto-resize seluruh kolom agar rapi
    for (let col = 1; col <= cfg.headers.length; col++) {
      sheet.autoResizeColumn(col);
    }
  });

  return {
    sukses: true,
    pesan: "Database 4 Sheet (Master_Santri, Bank_Soal, Log_Ujian_CBT, Nilai_Mapel) berhasil dibuat beserta data dummy."
  };
}

/**
 * 4A. FUNGSI simpanSoalUstadz()
 * Menyimpan soal pilihan ganda baru ke Sheet Bank_Soal
 */
function simpanSoalUstadz(payload) {
  try {
    if (!payload || !payload.unitKelas || !payload.mapel || !payload.pertanyaan) {
      throw new Error("Data soal belum lengkap. Pastikan Unit Kelas, Mapel, dan Pertanyaan terisi.");
    }

    const ss = getSpreadsheet_();
    let sheetSoal = ss.getSheetByName(SHEET_SOAL);
    if (!sheetSoal) {
      setupDatabase();
      sheetSoal = ss.getSheetByName(SHEET_SOAL);
    }

    const lastRow = sheetSoal.getLastRow();
    const nomorUrut = lastRow; // Baris 1 adalah header
    const idSoal = payload.idSoal || ("SOAL-" + Utilities.formatString("%03d", nomorUrut));
    const kunci = String(payload.kunciJawaban || "A").trim().toUpperCase();
    const bobot = parseFloat(payload.bobotSoal) || 10;

    const barisBaru = [
      idSoal,
      String(payload.unitKelas).trim(),
      String(payload.mapel).trim(),
      String(payload.pertanyaan).trim(),
      String(payload.opsiA || "").trim(),
      String(payload.opsiB || "").trim(),
      String(payload.opsiC || "").trim(),
      String(payload.opsiD || "").trim(),
      kunci,
      bobot
    ];

    sheetSoal.appendRow(barisBaru);

    return {
      sukses: true,
      idSoal: idSoal,
      pesan: "Soal berhasil disimpan ke Bank_Soal dengan ID: " + idSoal
    };
  } catch (err) {
    return {
      sukses: false,
      pesan: "Gagal menyimpan soal: " + err.message
    };
  }
}

/**
 * 4B. FUNGSI ambilSoalUjian()
 * Mengautentikasi NIS, PIN/Token Ujian, lalu mengambil daftar soal untuk Mapel terkait.
 * PENTING: Kunci_Jawaban TIDAK dikirim ke frontend santri demi keamanan ujian.
 */
function ambilSoalUjian(nis, mapel, tokenUjian, pinAkses) {
  try {
    const cleanNIS   = String(nis || "").trim();
    const cleanMapel = String(mapel || "").trim();
    const cleanToken = String(tokenUjian || "").trim().toUpperCase();

    if (!cleanNIS || !cleanMapel) {
      throw new Error("NIS dan Mata Pelajaran wajib diisi.");
    }

    // Validasi Token Ujian
    if (cleanToken !== TOKEN_UJIAN_DEFAULT) {
      throw new Error("Token Ujian tidak valid. Silakan hubungi Ustadz Pengawas.");
    }

    const ss = getSpreadsheet_();
    const sheetSantri = ss.getSheetByName(SHEET_SANTRI);
    const sheetSoal   = ss.getSheetByName(SHEET_SOAL);

    if (!sheetSantri || !sheetSoal) {
      throw new Error("Database belum diinisialisasi. Jalankan setupDatabase() terlebih dahulu.");
    }

    // Cari data santri berdasarkan NIS
    const dataSantri = sheetSantri.getDataRange().getValues();
    let profilSantri = null;

    for (let i = 1; i < dataSantri.length; i++) {
      if (String(dataSantri[i][0]).trim().toUpperCase() === cleanNIS.toUpperCase()) {
        // Jika PIN Akses dikirimkan, validasi juga PIN Akses santri
        if (pinAkses && String(dataSantri[i][3]).trim() !== String(pinAkses).trim()) {
          throw new Error("PIN Akses Santri tidak sesuai.");
        }
        profilSantri = {
          nis: String(dataSantri[i][0]).trim(),
          namaSantri: String(dataSantri[i][1]).trim(),
          unitKelas: String(dataSantri[i][2]).trim()
        };
        break;
      }
    }

    if (!profilSantri) {
      throw new Error("NIS '" + cleanNIS + "' tidak ditemukan di Master_Santri.");
    }

    // Ambil soal sesuai Unit_Kelas santri & Mapel (TANPA mengirim Kunci_Jawaban ke client)
    const dataSoal = sheetSoal.getDataRange().getValues();
    const daftarSoalSantri = [];

    for (let j = 1; j < dataSoal.length; j++) {
      const rowUnit  = String(dataSoal[j][1]).trim();
      const rowMapel = String(dataSoal[j][2]).trim();

      const cocokMapel = rowMapel.toLowerCase() === cleanMapel.toLowerCase();
      const cocokUnit  = (rowUnit === profilSantri.unitKelas) || (rowUnit.toLowerCase() === "semua");

      if (cocokMapel && cocokUnit) {
        daftarSoalSantri.push({
          idSoal: String(dataSoal[j][0]).trim(),
          unitKelas: rowUnit,
          mapel: rowMapel,
          pertanyaan: String(dataSoal[j][3]),
          opsiA: String(dataSoal[j][4]),
          opsiB: String(dataSoal[j][5]),
          opsiC: String(dataSoal[j][6]),
          opsiD: String(dataSoal[j][7]),
          bobotSoal: parseFloat(dataSoal[j][9]) || 10
          // Kunci_Jawaban (kolom indeks 8) SENGAJA TIDAK DIKIRIM KE FRONTEND
        });
      }
    }

    if (daftarSoalSantri.length === 0) {
      throw new Error("Belum ada soal ujian untuk Mapel '" + cleanMapel + "' pada Unit '" + profilSantri.unitKelas + "'.");
    }

    return {
      sukses: true,
      santri: profilSantri,
      mapel: cleanMapel,
      jumlahSoal: daftarSoalSantri.length,
      soal: daftarSoalSantri
    };
  } catch (err) {
    return {
      sukses: false,
      pesan: err.message
    };
  }
}

/**
 * 5. FUNGSI inputNilaiNonCBT()
 * Digunakan oleh Ustadz untuk menginput/mengupdate Nilai Tugas Harian (20%),
 * Nilai Sikap (20%), dan Nilai Ujian Lisan (20%) sekaligus menghitung ulang Nilai Akhir & Predikat.
 * Menerima objek tunggal maupun array daftar nilai santri sekaligus.
 */
function inputNilaiNonCBT(payload) {
  try {
    const daftarInput = Array.isArray(payload) ? payload : [payload];
    if (daftarInput.length === 0) {
      throw new Error("Data nilai yang dikirim kosong.");
    }

    const ss = getSpreadsheet_();
    let sheetNilai  = ss.getSheetByName(SHEET_NILAI);
    let sheetSantri = ss.getSheetByName(SHEET_SANTRI);

    if (!sheetNilai || !sheetSantri) {
      setupDatabase();
      sheetNilai  = ss.getSheetByName(SHEET_NILAI);
      sheetSantri = ss.getSheetByName(SHEET_SANTRI);
    }

    // Buat peta referensi santri dari Master_Santri
    const dataSantri = sheetSantri.getDataRange().getValues();
    const mapSantri = {};
    for (let i = 1; i < dataSantri.length; i++) {
      const kNis = String(dataSantri[i][0]).trim();
      mapSantri[kNis] = {
        namaSantri: String(dataSantri[i][1]).trim(),
        unitKelas: String(dataSantri[i][2]).trim()
      };
    }

    const dataNilai = sheetNilai.getDataRange().getValues();
    let jumlahDiperbarui = 0;
    let jumlahDitambahkan = 0;

    daftarInput.forEach(function(item) {
      const nis   = String(item.nis || "").trim();
      const mapel = String(item.mapel || "").trim();
      if (!nis || !mapel) return;

      const infoSantri = mapSantri[nis] || {
        namaSantri: String(item.namaSantri || "-").trim(),
        unitKelas: String(item.unitKelas || "-").trim()
      };

      const nilaiTugas = parseFloat(item.nilaiTugasHarian) || 0;
      const nilaiSikap = parseFloat(item.nilaiSikap) || 0;
      const nilaiLisan = parseFloat(item.nilaiUjianLisan) || 0;

      // Cek apakah baris untuk NIS & Mapel sudah ada di Sheet Nilai_Mapel
      let barisDitemukan = -1;
      let nilaiCbtSaatIni = 0;
      let idBarisExisting = "";

      for (let r = 1; r < dataNilai.length; r++) {
        const rowNis   = String(dataNilai[r][1]).trim();
        const rowMapel = String(dataNilai[r][4]).trim();
        if (rowNis.toUpperCase() === nis.toUpperCase() &&
            rowMapel.toLowerCase() === mapel.toLowerCase()) {
          barisDitemukan = r + 1; // 1-indexed untuk Sheet range
          idBarisExisting = String(dataNilai[r][0]);
          nilaiCbtSaatIni = parseFloat(dataNilai[r][8]) || 0;
          break;
        }
      }

      // Hitung ulang Nilai Akhir & Predikat
      const kalkulasi = hitungNilaiAkhirDanPredikat_(
        nilaiTugas,
        nilaiSikap,
        nilaiLisan,
        nilaiCbtSaatIni
      );

      if (barisDitemukan !== -1) {
        // Update baris yang sudah ada
        const rowValues = [[
          idBarisExisting,
          nis,
          infoSantri.namaSantri,
          infoSantri.unitKelas,
          mapel,
          nilaiTugas,
          nilaiSikap,
          nilaiLisan,
          nilaiCbtSaatIni,
          kalkulasi.nilaiAkhir,
          kalkulasi.predikat
        ]];
        sheetNilai.getRange(barisDitemukan, 1, 1, 11).setValues(rowValues);
        jumlahDiperbarui++;
      } else {
        // Buat baris baru jika belum ada
        const nomorBaru = sheetNilai.getLastRow();
        const idBarisBaru = "NLI-" + Utilities.formatString("%03d", nomorBaru);
        const rowBaru = [
          idBarisBaru,
          nis,
          infoSantri.namaSantri,
          infoSantri.unitKelas,
          mapel,
          nilaiTugas,
          nilaiSikap,
          nilaiLisan,
          nilaiCbtSaatIni,
          kalkulasi.nilaiAkhir,
          kalkulasi.predikat
        ];
        sheetNilai.appendRow(rowBaru);
        dataNilai.push(rowBaru);
        jumlahDitambahkan++;
      }
    });

    return {
      sukses: true,
      pesan: "Nilai Non-CBT berhasil disimpan (" + jumlahDiperbarui + " diperbarui, " + jumlahDitambahkan + " baris baru ditambahkan)."
    };
  } catch (err) {
    return {
      sukses: false,
      pesan: "Gagal menyimpan Nilai Non-CBT: " + err.message
    };
  }
}

/**
 * 6. FUNGSI submitUjianCBT()
 * - Memvalidasi jawaban santri dengan Kunci_Jawaban di Bank_Soal (skala 0-100)
 * - Mencatat riwayat & jumlah pelanggaran ke Sheet Log_Ujian_CBT
 * - Mengupdate kolom Nilai_CBT di Sheet Nilai_Mapel pada baris NIS & Mapel terkait
 *   (membuat baris baru jika belum ada)
 * - Menghitung ulang Nilai_Akhir & Predikat (A: 85-100, B: 75-84, C: 60-74, D: <60)
 */
function submitUjianCBT(payload) {
  try {
    if (!payload || !payload.nis || !payload.mapel) {
      throw new Error("Data pengiriman ujian tidak lengkap (NIS dan Mapel wajib ada).");
    }

    const nis               = String(payload.nis).trim();
    const mapel             = String(payload.mapel).trim();
    const jawabanSantri     = payload.jawaban || {}; // Format: { "SOAL-001": "A", "SOAL-002": "C" }
    const jumlahPelanggaran = parseInt(payload.jumlahPelanggaran, 10) || 0;
    const autoSubmitCurang  = Boolean(payload.autoSubmitCurang);

    const ss = getSpreadsheet_();
    const sheetSantri = ss.getSheetByName(SHEET_SANTRI);
    const sheetSoal   = ss.getSheetByName(SHEET_SOAL);
    const sheetLog    = ss.getSheetByName(SHEET_LOG);
    const sheetNilai  = ss.getSheetByName(SHEET_NILAI);

    if (!sheetSantri || !sheetSoal || !sheetLog || !sheetNilai) {
      throw new Error("Sheet database belum lengkap. Jalankan setupDatabase() terlebih dahulu.");
    }

    // 1. Cari identitas santri di Master_Santri
    const dataSantri = sheetSantri.getDataRange().getValues();
    let namaSantri = String(payload.namaSantri || "-").trim();
    let unitKelas  = String(payload.unitKelas || "-").trim();

    for (let i = 1; i < dataSantri.length; i++) {
      if (String(dataSantri[i][0]).trim().toUpperCase() === nis.toUpperCase()) {
        namaSantri = String(dataSantri[i][1]).trim();
        unitKelas  = String(dataSantri[i][2]).trim();
        break;
      }
    }

    // 2. Hitung Skor CBT di Backend (Skala 0-100 berdasarkan Bobot_Soal)
    const dataSoal = sheetSoal.getDataRange().getValues();
    let totalBobotMaksimal = 0;
    let totalBobotDiperoleh = 0;
    let jumlahBenar = 0;
    let totalSoalMapel = 0;

    for (let j = 1; j < dataSoal.length; j++) {
      const idSoal       = String(dataSoal[j][0]).trim();
      const rowUnit      = String(dataSoal[j][1]).trim();
      const rowMapel     = String(dataSoal[j][2]).trim();
      const kunciJawaban = String(dataSoal[j][8]).trim().toUpperCase();
      const bobotSoal    = parseFloat(dataSoal[j][9]) || 10;

      const cocokMapel = rowMapel.toLowerCase() === mapel.toLowerCase();
      const cocokUnit  = (rowUnit === unitKelas) || (rowUnit.toLowerCase() === "semua");

      if (cocokMapel && cocokUnit) {
        totalSoalMapel++;
        totalBobotMaksimal += bobotSoal;

        const pilihanSantri = String(jawabanSantri[idSoal] || "").trim().toUpperCase();
        if (pilihanSantri && pilihanSantri === kunciJawaban) {
          totalBobotDiperoleh += bobotSoal;
          jumlahBenar++;
        }
      }
    }

    let skorCBT = 0;
    if (totalBobotMaksimal > 0) {
      skorCBT = Math.round((totalBobotDiperoleh / totalBobotMaksimal) * 100 * 100) / 100;
    }

    // 3. Tentukan Status Ujian dan catat ke Log_Ujian_CBT
    let statusUjian = "Selesai Normal";
    if (autoSubmitCurang || jumlahPelanggaran >= 3) {
      statusUjian = "Diskualifikasi / Auto-Submit (3x Pelanggaran)";
    } else if (jumlahPelanggaran > 0) {
      statusUjian = "Selesai dengan Peringatan (" + jumlahPelanggaran + "x Pelanggaran)";
    }

    const timestamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss");
    sheetLog.appendRow([
      timestamp,
      nis,
      namaSantri,
      unitKelas,
      mapel,
      skorCBT,
      jumlahPelanggaran,
      statusUjian
    ]);

    // 4. Update atau Buat Baris di Sheet Nilai_Mapel & Hitung Nilai_Akhir + Predikat
    const dataNilai = sheetNilai.getDataRange().getValues();
    let barisTarget = -1;
    let idBaris     = "";
    let nilaiTugas  = 0;
    let nilaiSikap  = 0;
    let nilaiLisan  = 0;

    for (let r = 1; r < dataNilai.length; r++) {
      const rowNis   = String(dataNilai[r][1]).trim();
      const rowMapel = String(dataNilai[r][4]).trim();

      if (rowNis.toUpperCase() === nis.toUpperCase() &&
          rowMapel.toLowerCase() === mapel.toLowerCase()) {
        barisTarget = r + 1;
        idBaris     = String(dataNilai[r][0]);
        nilaiTugas  = parseFloat(dataNilai[r][5]) || 0;
        nilaiSikap  = parseFloat(dataNilai[r][6]) || 0;
        nilaiLisan  = parseFloat(dataNilai[r][7]) || 0;
        break;
      }
    }

    const hasilAkhir = hitungNilaiAkhirDanPredikat_(
      nilaiTugas,
      nilaiSikap,
      nilaiLisan,
      skorCBT
    );

    if (barisTarget !== -1) {
      // Update Nilai_CBT (kolom 9), Nilai_Akhir (kolom 10), dan Predikat (kolom 11)
      sheetNilai.getRange(barisTarget, 9, 1, 3).setValues([[
        skorCBT,
        hasilAkhir.nilaiAkhir,
        hasilAkhir.predikat
      ]]);
    } else {
      const nomorBarisBaru = sheetNilai.getLastRow();
      idBaris = "NLI-" + Utilities.formatString("%03d", nomorBarisBaru);
      sheetNilai.appendRow([
        idBaris,
        nis,
        namaSantri,
        unitKelas,
        mapel,
        nilaiTugas,
        nilaiSikap,
        nilaiLisan,
        skorCBT,
        hasilAkhir.nilaiAkhir,
        hasilAkhir.predikat
      ]);
    }

    return {
      sukses: true,
      nis: nis,
      namaSantri: namaSantri,
      unitKelas: unitKelas,
      mapel: mapel,
      skorCBT: skorCBT,
      jumlahBenar: jumlahBenar,
      totalSoal: totalSoalMapel,
      jumlahPelanggaran: jumlahPelanggaran,
      statusUjian: statusUjian,
      nilaiAkhir: hasilAkhir.nilaiAkhir,
      predikat: hasilAkhir.predikat,
      pesan: "Ujian CBT berhasil disimpan. Skor CBT: " + skorCBT + " | Nilai Akhir: " + hasilAkhir.nilaiAkhir + " (" + hasilAkhir.predikat + ")"
    };
  } catch (err) {
    return {
      sukses: false,
      pesan: "Gagal memproses submit ujian CBT: " + err.message
    };
  }
}

/**
 * 7A. FUNGSI ambilDataMonitoring()
 * Menarik seluruh data Master_Santri, rekapitulasi Nilai_Mapel (4 komponen + Nilai Akhir),
 * daftar Bank_Soal, dan Log_Ujian_CBT untuk ditampilkan pada Portal Ustadz.
 */
function ambilDataMonitoring() {
  try {
    const ss = getSpreadsheet_();
    let sheetSantri = ss.getSheetByName(SHEET_SANTRI);
    let sheetNilai  = ss.getSheetByName(SHEET_NILAI);
    let sheetLog    = ss.getSheetByName(SHEET_LOG);
    let sheetSoal   = ss.getSheetByName(SHEET_SOAL);

    if (!sheetSantri || !sheetNilai || !sheetLog || !sheetSoal) {
      setupDatabase();
      sheetSantri = ss.getSheetByName(SHEET_SANTRI);
      sheetNilai  = ss.getSheetByName(SHEET_NILAI);
      sheetLog    = ss.getSheetByName(SHEET_LOG);
      sheetSoal   = ss.getSheetByName(SHEET_SOAL);
    }

    // 1. Data Master Santri
    const rawSantri = sheetSantri.getDataRange().getValues();
    const daftarSantri = [];
    for (let i = 1; i < rawSantri.length; i++) {
      if (!rawSantri[i][0]) continue;
      daftarSantri.push({
        nis: String(rawSantri[i][0]),
        namaSantri: String(rawSantri[i][1]),
        unitKelas: String(rawSantri[i][2])
      });
    }

    // 2. Data Rekap Nilai Mapel
    const rawNilai = sheetNilai.getDataRange().getValues();
    const daftarNilai = [];
    for (let j = 1; j < rawNilai.length; j++) {
      if (!rawNilai[j][1]) continue;
      daftarNilai.push({
        idBaris: String(rawNilai[j][0]),
        nis: String(rawNilai[j][1]),
        namaSantri: String(rawNilai[j][2]),
        unitKelas: String(rawNilai[j][3]),
        mapel: String(rawNilai[j][4]),
        nilaiTugasHarian: parseFloat(rawNilai[j][5]) || 0,
        nilaiSikap: parseFloat(rawNilai[j][6]) || 0,
        nilaiUjianLisan: parseFloat(rawNilai[j][7]) || 0,
        nilaiCBT: parseFloat(rawNilai[j][8]) || 0,
        nilaiAkhir: parseFloat(rawNilai[j][9]) || 0,
        predikat: String(rawNilai[j][10] || "D")
      });
    }

    // 3. Data Log Pelanggaran & Ujian CBT
    const rawLog = sheetLog.getDataRange().getValues();
    const daftarLog = [];
    for (let k = 1; k < rawLog.length; k++) {
      if (!rawLog[k][1]) continue;
      daftarLog.push({
        timestamp: String(rawLog[k][0]),
        nis: String(rawLog[k][1]),
        namaSantri: String(rawLog[k][2]),
        unitKelas: String(rawLog[k][3]),
        mapel: String(rawLog[k][4]),
        skorCBT: parseFloat(rawLog[k][5]) || 0,
        jumlahPelanggaran: parseInt(rawLog[k][6], 10) || 0,
        status: String(rawLog[k][7])
      });
    }

    // 4. Ringkasan Bank Soal
    const rawSoal = sheetSoal.getDataRange().getValues();
    const daftarSoal = [];
    for (let s = 1; s < rawSoal.length; s++) {
      if (!rawSoal[s][0]) continue;
      daftarSoal.push({
        idSoal: String(rawSoal[s][0]),
        unitKelas: String(rawSoal[s][1]),
        mapel: String(rawSoal[s][2]),
        pertanyaan: String(rawSoal[s][3]),
        opsiA: String(rawSoal[s][4]),
        opsiB: String(rawSoal[s][5]),
        opsiC: String(rawSoal[s][6]),
        opsiD: String(rawSoal[s][7]),
        kunciJawaban: String(rawSoal[s][8]),
        bobotSoal: parseFloat(rawSoal[s][9]) || 10
      });
    }

    return {
      sukses: true,
      bobot: {
        tugasHarian: BOBOT_TUGAS_HARIAN,
        sikap: BOBOT_SIKAP,
        ujianLisan: BOBOT_UJIAN_LISAN,
        ujianCBT: BOBOT_UJIAN_CBT
      },
      tokenUjian: TOKEN_UJIAN_DEFAULT,
      santri: daftarSantri,
      nilaiMapel: daftarNilai,
      logUjian: daftarLog.reverse(), // Terbaru di atas
      bankSoal: daftarSoal
    };
  } catch (err) {
    return {
      sukses: false,
      pesan: "Gagal mengambil data monitoring: " + err.message
    };
  }
}

/**
 * 7B. FUNGSI ambilDataRapor(nis)
 * Menarik profil lengkap santri beserta rincian seluruh mata pelajaran
 * (Tugas Harian 20%, Sikap 20%, Lisan 20%, CBT 40%, Nilai Akhir, Predikat)
 * dan statistik rata-rata untuk Cetak Rapor Digital.
 */
function ambilDataRapor(nis) {
  try {
    const cleanNIS = String(nis || "").trim();
    if (!cleanNIS) {
      throw new Error("Parameter NIS santri wajib diisi.");
    }

    const ss = getSpreadsheet_();
    const sheetSantri = ss.getSheetByName(SHEET_SANTRI);
    const sheetNilai  = ss.getSheetByName(SHEET_NILAI);
    const sheetLog    = ss.getSheetByName(SHEET_LOG);

    if (!sheetSantri || !sheetNilai) {
      throw new Error("Database belum tersedia. Jalankan setupDatabase() terlebih dahulu.");
    }

    // Cari identitas santri
    const rawSantri = sheetSantri.getDataRange().getValues();
    let profilSantri = null;
    for (let i = 1; i < rawSantri.length; i++) {
      if (String(rawSantri[i][0]).trim().toUpperCase() === cleanNIS.toUpperCase()) {
        profilSantri = {
          nis: String(rawSantri[i][0]).trim(),
          namaSantri: String(rawSantri[i][1]).trim(),
          unitKelas: String(rawSantri[i][2]).trim()
        };
        break;
      }
    }

    if (!profilSantri) {
      throw new Error("Data santri dengan NIS '" + cleanNIS + "' tidak ditemukan.");
    }

    // Ambil seluruh baris Nilai_Mapel milik NIS tersebut
    const rawNilai = sheetNilai.getDataRange().getValues();
    const rincianNilai = [];
    let totalNilaiAkhir = 0;

    for (let j = 1; j < rawNilai.length; j++) {
      if (String(rawNilai[j][1]).trim().toUpperCase() === cleanNIS.toUpperCase()) {
        const nTugas = parseFloat(rawNilai[j][5]) || 0;
        const nSikap = parseFloat(rawNilai[j][6]) || 0;
        const nLisan = parseFloat(rawNilai[j][7]) || 0;
        const nCBT   = parseFloat(rawNilai[j][8]) || 0;
        const kalkulasi = hitungNilaiAkhirDanPredikat_(nTugas, nSikap, nLisan, nCBT);

        rincianNilai.push({
          idBaris: String(rawNilai[j][0]),
          mapel: String(rawNilai[j][4]),
          nilaiTugasHarian: nTugas,
          nilaiSikap: nSikap,
          nilaiUjianLisan: nLisan,
          nilaiCBT: nCBT,
          nilaiAkhir: kalkulasi.nilaiAkhir,
          predikat: kalkulasi.predikat
        });

        totalNilaiAkhir += kalkulasi.nilaiAkhir;
      }
    }

    // Ambil riwayat integritas ujian CBT santri
    let totalPelanggaran = 0;
    if (sheetLog) {
      const rawLog = sheetLog.getDataRange().getValues();
      for (let k = 1; k < rawLog.length; k++) {
        if (String(rawLog[k][1]).trim().toUpperCase() === cleanNIS.toUpperCase()) {
          totalPelanggaran += parseInt(rawLog[k][6], 10) || 0;
        }
      }
    }

    const rataRataNilaiAkhir = rincianNilai.length > 0
      ? Math.round((totalNilaiAkhir / rincianNilai.length) * 100) / 100
      : 0;

    let predikatUmum = "D";
    if (rataRataNilaiAkhir >= 85) predikatUmum = "A (Mumtaz)";
    else if (rataRataNilaiAkhir >= 75) predikatUmum = "B (Jayyid Jiddan)";
    else if (rataRataNilaiAkhir >= 60) predikatUmum = "C (Jayyid)";
    else predikatUmum = "D (Maqbul / Perlu Pembinaan)";

    return {
      sukses: true,
      tanggalCetak: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd MMMM yyyy"),
      santri: profilSantri,
      bobotKomponen: {
        tugasHarian: "20%",
        sikap: "20%",
        ujianLisan: "20%",
        ujianCBT: "40%"
      },
      daftarNilai: rincianNilai,
      ringkasan: {
        jumlahMapel: rincianNilai.length,
        rataRataAkhir: rataRataNilaiAkhir,
        predikatUmum: predikatUmum,
        totalPelanggaranCBT: totalPelanggaran
      }
    };
  } catch (err) {
    return {
      sukses: false,
      pesan: "Gagal mengambil data rapor: " + err.message
    };
  }
}
