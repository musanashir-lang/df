export const CODE_GS_SOURCE = `/**
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

  const schemaConfig = [
    {
      name: SHEET_SANTRI,
      headerColor: "#065f46", // Emerald 800
      headers: ["NIS", "Nama_Santri", "Unit_Kelas", "PIN_Akses"],
      dummyRows: [
        ["SNT-202601", "Ahmad Fauzi Al-Farisi", "Kulliyatul Mu'allimin - Kelas 1A", "123456"],
        ["SNT-202602", "Muhammad Zaidan Al-Baihaqi", "Kulliyatul Mu'allimin - Kelas 1A", "654321"]
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

    const headerRange = sheet.getRange(1, 1, 1, cfg.headers.length);
    headerRange.setValues([cfg.headers]);
    headerRange.setBackground(cfg.headerColor);
    headerRange.setFontColor("#ffffff");
    headerRange.setFontWeight("bold");
    headerRange.setHorizontalAlignment("center");
    headerRange.setVerticalAlignment("middle");
    sheet.setRowHeight(1, 36);
    sheet.setFrozenRows(1);

    if (cfg.dummyRows && cfg.dummyRows.length > 0) {
      const dataRange = sheet.getRange(2, 1, cfg.dummyRows.length, cfg.headers.length);
      dataRange.setValues(cfg.dummyRows);
      dataRange.setVerticalAlignment("middle");
    }

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
    const nomorUrut = lastRow;
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

    if (cleanToken !== TOKEN_UJIAN_DEFAULT) {
      throw new Error("Token Ujian tidak valid. Silakan hubungi Ustadz Pengawas.");
    }

    const ss = getSpreadsheet_();
    const sheetSantri = ss.getSheetByName(SHEET_SANTRI);
    const sheetSoal   = ss.getSheetByName(SHEET_SOAL);

    if (!sheetSantri || !sheetSoal) {
      throw new Error("Database belum diinisialisasi. Jalankan setupDatabase() terlebih dahulu.");
    }

    const dataSantri = sheetSantri.getDataRange().getValues();
    let profilSantri = null;

    for (let i = 1; i < dataSantri.length; i++) {
      if (String(dataSantri[i][0]).trim().toUpperCase() === cleanNIS.toUpperCase()) {
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
          // Kunci_Jawaban SENGAJA TIDAK DIKIRIM KE FRONTEND
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

      let barisDitemukan = -1;
      let nilaiCbtSaatIni = 0;
      let idBarisExisting = "";

      for (let r = 1; r < dataNilai.length; r++) {
        const rowNis   = String(dataNilai[r][1]).trim();
        const rowMapel = String(dataNilai[r][4]).trim();
        if (rowNis.toUpperCase() === nis.toUpperCase() &&
            rowMapel.toLowerCase() === mapel.toLowerCase()) {
          barisDitemukan = r + 1;
          idBarisExisting = String(dataNilai[r][0]);
          nilaiCbtSaatIni = parseFloat(dataNilai[r][8]) || 0;
          break;
        }
      }

      const kalkulasi = hitungNilaiAkhirDanPredikat_(
        nilaiTugas,
        nilaiSikap,
        nilaiLisan,
        nilaiCbtSaatIni
      );

      if (barisDitemukan !== -1) {
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
 * Menghitung skor CBT santri (skala 0-100), mencatat pelanggaran ke Log_Ujian_CBT,
 * mengupdate kolom Nilai_CBT di sheet Nilai_Mapel pada baris NIS & Mapel terkait
 * (buat baris baru jika belum ada), dan langsung menghitung Nilai_Akhir beserta Predikat.
 */
function submitUjianCBT(payload) {
  try {
    if (!payload || !payload.nis || !payload.mapel) {
      throw new Error("Data pengiriman ujian tidak lengkap (NIS dan Mapel wajib ada).");
    }

    const nis               = String(payload.nis).trim();
    const mapel             = String(payload.mapel).trim();
    const jawabanSantri     = payload.jawaban || {};
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
      logUjian: daftarLog.reverse(),
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
}`;


export const INDEX_HTML_SOURCE = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>CBT Web-Lockdown & e-Rapor Digital Pesantren</title>
  <!-- Tailwind CSS CDN -->
  <script src="https://cdn.tailwindcss.com"></script>
  <!-- SweetAlert2 CDN -->
  <script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>
  <!-- Google Fonts -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    body {
      font-family: 'Plus Jakarta Sans', sans-serif;
    }
    .font-mono, .tabular-nums {
      font-family: 'JetBrains Mono', monospace;
      font-variant-numeric: tabular-nums;
    }
    .exam-lockdown {
      -webkit-user-select: none;
      -moz-user-select: none;
      -ms-user-select: none;
      user-select: none;
    }
    .blur-lockscreen {
      filter: blur(14px);
      pointer-events: none;
      user-select: none;
    }
    @media print {
      .no-print {
        display: none !important;
      }
      body {
        background: #ffffff !important;
        color: #000000 !important;
      }
      #rapor-print-area {
        border: none !important;
        box-shadow: none !important;
        padding: 0 !important;
        margin: 0 !important;
        max-width: 100% !important;
      }
    }
  </style>
</head>
<body class="bg-slate-50 text-slate-900 min-h-screen flex flex-col">

  <!-- TOP NAVIGATION BAR (DISEMBUNYIKAN SAAT CETAK PDF & SAAT UJIAN LOCKDOWN AKTIF) -->
  <header id="main-navbar" class="no-print sticky top-0 z-30 bg-white border-b border-slate-200 px-6 py-3.5 flex items-center justify-between gap-6">
    <a href="javascript:void(0)" onclick="navigasiKe('beranda')" class="text-base font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0">
      CBT &amp; e-Rapor Pesantren
    </a>

    <nav class="flex items-center gap-6 text-sm font-medium text-slate-600 overflow-x-auto">
      <button type="button" onclick="navigasiKe('beranda')" id="nav-beranda" class="py-1 border-b-2 border-emerald-700 text-emerald-800 font-semibold whitespace-nowrap shrink-0">
        Beranda
      </button>
      <button type="button" onclick="navigasiKe('ujian')" id="nav-ujian" class="py-1 border-b-2 border-transparent hover:text-slate-900 whitespace-nowrap shrink-0">
        Portal Ujian Santri
      </button>
      <button type="button" onclick="navigasiKe('ustadz')" id="nav-ustadz" class="py-1 border-b-2 border-transparent hover:text-slate-900 whitespace-nowrap shrink-0">
        Dashboard Ustadz
      </button>
      <button type="button" onclick="navigasiKe('rapor')" id="nav-rapor" class="py-1 border-b-2 border-transparent hover:text-slate-900 whitespace-nowrap shrink-0">
        Cetak Rapor Digital
      </button>
    </nav>

    <div class="shrink-0">
      <button type="button" onclick="muatDataMonitoringServer(true)" class="px-3.5 py-2 text-xs font-semibold text-white bg-emerald-800 rounded-lg hover:bg-emerald-700 transition-colors whitespace-nowrap">
        Sinkronisasi Data
      </button>
    </div>
  </header>

  <!-- MAIN CONTAINER -->
  <main class="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-8">

    <!-- 1. HALAMAN BERANDA / PILIH PERAN -->
    <section id="view-beranda" class="space-y-8">
      <div class="bg-white border border-slate-200 rounded-xl p-8 space-y-4">
        <div class="text-xs text-slate-500">
          Sistem Terpadu Akademik Pesantren · Google Sheets Database &amp; Safe Exam Browser
        </div>
        <h1 class="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
          All-in-One CBT Web-Lockdown &amp; e-Rapor Digital Pesantren
        </h1>
        <p class="text-sm text-slate-600 leading-relaxed max-w-3xl">
          Pilih portal akses sesuai peran Anda. Seluruh nilai ujian tulis CBT (bobot 40%) akan otomatis terintegrasi dengan Nilai Tugas Harian (20%), Nilai Sikap/Adab (20%), dan Nilai Ujian Lisan/Setoran (20%) di dalam satu lembar e-Rapor Digital.
        </p>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div class="bg-white border border-slate-200 rounded-xl p-6 flex flex-col justify-between space-y-6">
          <div class="space-y-2">
            <div class="text-xs font-mono text-emerald-800 font-semibold">MODUL SANTRI · BOBOT 40%</div>
            <h2 class="text-lg font-bold text-slate-900">Portal Ujian CBT Santri</h2>
            <p class="text-xs text-slate-600 leading-relaxed">
              Masuk menggunakan NIS, pilih Mata Pelajaran, dan masukkan Token Ujian. Dilengkapi penguncian Fullscreen otomatis, Countdown Timer, dan deteksi kecurangan 3x penalti.
            </p>
          </div>
          <button type="button" onclick="navigasiKe('ujian')" class="w-full py-2.5 px-4 text-xs font-semibold text-white bg-emerald-800 rounded-lg hover:bg-emerald-700 transition-colors">
            Masuk sebagai Santri (Ujian CBT)
          </button>
        </div>

        <div class="bg-white border border-slate-200 rounded-xl p-6 flex flex-col justify-between space-y-6">
          <div class="space-y-2">
            <div class="text-xs font-mono text-slate-700 font-semibold">MODUL DEWAN ASATIDZ · BOBOT 60%</div>
            <h2 class="text-lg font-bold text-slate-900">Dashboard Ustadz (Panel Guru)</h2>
            <p class="text-xs text-slate-600 leading-relaxed">
              Kelola Bank Soal Pilihan Ganda, input nilai Tugas Harian (20%), Sikap (20%), dan Ujian Lisan (20%), serta pantau rekapitulasi nilai dan log pelanggaran ujian CBT santri.
            </p>
          </div>
          <button type="button" onclick="navigasiKe('ustadz')" class="w-full py-2.5 px-4 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors">
            Masuk sebagai Ustadz (Panel Guru)
          </button>
        </div>

        <div class="bg-white border border-slate-200 rounded-xl p-6 flex flex-col justify-between space-y-6">
          <div class="space-y-2">
            <div class="text-xs font-mono text-slate-700 font-semibold">MODUL WALI KELAS / WALI SANTRI</div>
            <h2 class="text-lg font-bold text-slate-900">Cetak e-Rapor Digital</h2>
            <p class="text-xs text-slate-600 leading-relaxed">
              Tampilkan rincian ke-4 komponen nilai per mata pelajaran beserta Nilai Akhir dan Predikat (A/B/C/D). Siap dicetak langsung ke dokumen PDF ukuran A4.
            </p>
          </div>
          <button type="button" onclick="navigasiKe('rapor')" class="w-full py-2.5 px-4 text-xs font-semibold text-slate-900 bg-slate-100 border border-slate-300 rounded-lg hover:bg-slate-200 transition-colors">
            Buka Halaman Rapor Digital
          </button>
        </div>
      </div>
    </section>

    <!-- 2. DASHBOARD USTADZ -->
    <section id="view-ustadz" class="hidden space-y-6">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-200">
        <div>
          <div class="text-xs text-slate-500">Panel Guru &amp; Pengawas Ujian</div>
          <h1 class="text-2xl font-bold text-slate-900 mt-0.5">Dashboard Ustadz</h1>
        </div>

        <div class="flex flex-wrap items-center gap-1 p-1 bg-slate-200/80 rounded-lg">
          <button type="button" onclick="pilihTabUstadz('soal')" id="tab-btn-soal" class="px-3.5 py-1.5 text-xs font-semibold rounded-md bg-white text-slate-900 shadow-sm">
            1. Input Soal CBT
          </button>
          <button type="button" onclick="pilihTabUstadz('noncbt')" id="tab-btn-noncbt" class="px-3.5 py-1.5 text-xs font-semibold rounded-md text-slate-600 hover:text-slate-900">
            2. Input Nilai Non-CBT (60%)
          </button>
          <button type="button" onclick="pilihTabUstadz('monitoring')" id="tab-btn-monitoring" class="px-3.5 py-1.5 text-xs font-semibold rounded-md text-slate-600 hover:text-slate-900">
            3. Monitoring &amp; Log CBT
          </button>
        </div>
      </div>

      <div id="ustadz-panel-soal" class="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <form id="form-input-soal" onsubmit="simpanSoalKeServer(event)" class="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <div class="pb-3 border-b border-slate-100">
            <h2 class="text-base font-bold text-slate-900">Tambah Soal Pilihan Ganda</h2>
            <p class="text-xs text-slate-500">Data otomatis tersimpan ke Sheet <code class="text-emerald-800">Bank_Soal</code>.</p>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label class="block text-xs font-semibold text-slate-700 mb-1">Unit / Kelas</label>
              <input type="text" id="soal-unit" required value="Kulliyatul Mu'allimin - Kelas 1A" class="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg">
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-700 mb-1">Mata Pelajaran</label>
              <input type="text" id="soal-mapel" required value="Fiqih Ibadah" class="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg">
            </div>
          </div>

          <div>
            <label class="block text-xs font-semibold text-slate-700 mb-1">Pertanyaan Soal</label>
            <textarea id="soal-pertanyaan" rows="3" required placeholder="Tuliskan pertanyaan ujian pilihan ganda..." class="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"></textarea>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label class="block text-xs font-semibold text-slate-700 mb-1">Opsi A</label>
              <input type="text" id="soal-opsi-a" required placeholder="Teks jawaban A" class="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg">
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-700 mb-1">Opsi B</label>
              <input type="text" id="soal-opsi-b" required placeholder="Teks jawaban B" class="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg">
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-700 mb-1">Opsi C</label>
              <input type="text" id="soal-opsi-c" required placeholder="Teks jawaban C" class="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg">
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-700 mb-1">Opsi D</label>
              <input type="text" id="soal-opsi-d" required placeholder="Teks jawaban D" class="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg">
            </div>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-xs font-semibold text-slate-700 mb-1">Kunci Jawaban</label>
              <select id="soal-kunci" class="w-full px-3 py-2 text-xs font-mono font-bold bg-white border border-slate-300 rounded-lg">
                <option value="A">Kunci: Opsi A</option>
                <option value="B">Kunci: Opsi B</option>
                <option value="C">Kunci: Opsi C</option>
                <option value="D">Kunci: Opsi D</option>
              </select>
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-700 mb-1">Bobot Soal</label>
              <input type="number" id="soal-bobot" min="1" max="100" required value="50" class="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg">
            </div>
          </div>

          <button type="submit" id="btn-simpan-soal" class="w-full py-2.5 px-4 text-xs font-semibold text-white bg-emerald-800 rounded-lg hover:bg-emerald-700 transition-colors">
            Simpan Soal ke Bank_Soal
          </button>
        </form>

        <div class="lg:col-span-7 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div class="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
            <h2 class="text-base font-bold text-slate-900">Daftar Bank Soal Tersimpan</h2>
            <span id="jumlah-bank-soal" class="text-xs font-mono text-slate-600">0 Soal</span>
          </div>
          <div id="list-bank-soal" class="divide-y divide-slate-200 max-h-[540px] overflow-y-auto p-4 text-xs text-slate-600">
            Memuat data Bank_Soal...
          </div>
        </div>
      </div>

      <div id="ustadz-panel-noncbt" class="hidden bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div class="p-6 border-b border-slate-200 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <h2 class="text-base font-bold text-slate-900">Tabel Input Nilai Non-CBT Per Santri</h2>
            <p class="text-xs text-slate-500 mt-0.5">
              Isi Nilai Tugas Harian (20%), Sikap (20%), dan Ujian Lisan (20%). Sistem otomatis menghitung ulang Nilai Akhir.
            </p>
          </div>
          <div class="flex flex-wrap items-center gap-3">
            <div>
              <label class="block text-xs font-semibold text-slate-600 mb-1">Filter Unit/Kelas</label>
              <select id="noncbt-unit" onchange="renderTabelInputNonCBT()" class="px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg"></select>
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-600 mb-1">Mata Pelajaran</label>
              <input type="text" id="noncbt-mapel" value="Fiqih Ibadah" onchange="renderTabelInputNonCBT()" class="px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg">
            </div>
            <button type="button" onclick="simpanNilaiNonCBTKeServer()" id="btn-simpan-noncbt" class="px-4 py-2 text-xs font-semibold text-white bg-emerald-800 rounded-lg hover:bg-emerald-700 transition-colors">
              Simpan Semua Nilai Non-CBT
            </button>
          </div>
        </div>

        <div class="overflow-x-auto">
          <table class="w-full text-left border-collapse">
            <thead>
              <tr class="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                <th class="py-3 px-4">NIS</th>
                <th class="py-3 px-4">Nama Santri</th>
                <th class="py-3 px-4 text-right">Tugas Harian (20%)</th>
                <th class="py-3 px-4 text-right">Nilai Sikap (20%)</th>
                <th class="py-3 px-4 text-right">Ujian Lisan (20%)</th>
                <th class="py-3 px-4 text-right">Nilai CBT (40%)</th>
                <th class="py-3 px-4 text-right">Preview Nilai Akhir</th>
              </tr>
            </thead>
            <tbody id="tbody-input-noncbt" class="divide-y divide-slate-200 text-sm"></tbody>
          </table>
        </div>
      </div>

      <div id="ustadz-panel-monitoring" class="hidden space-y-6">
        <div class="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div class="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
            <div>
              <h2 class="text-base font-bold text-slate-900">Monitoring Rekapitulasi Nilai Lengkap (4 Komponen)</h2>
              <p class="text-xs text-slate-500">Data langsung dari Sheet <code class="text-emerald-800">Nilai_Mapel</code></p>
            </div>
            <button type="button" onclick="jalankanSetupDatabaseServer()" class="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 border border-slate-300 rounded-lg hover:bg-slate-200">
              Inisialisasi Ulang Database (setupDatabase)
            </button>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full text-left border-collapse">
              <thead>
                <tr class="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                  <th class="py-3 px-4">NIS</th>
                  <th class="py-3 px-4">Nama Santri</th>
                  <th class="py-3 px-4">Unit / Kelas</th>
                  <th class="py-3 px-4">Mapel</th>
                  <th class="py-3 px-3 text-right">Tugas (20%)</th>
                  <th class="py-3 px-3 text-right">Sikap (20%)</th>
                  <th class="py-3 px-3 text-right">Lisan (20%)</th>
                  <th class="py-3 px-3 text-right">CBT (40%)</th>
                  <th class="py-3 px-4 text-right">Nilai Akhir</th>
                  <th class="py-3 px-4 text-center">Predikat</th>
                </tr>
              </thead>
              <tbody id="tbody-monitoring-nilai" class="divide-y divide-slate-200 text-sm"></tbody>
            </table>
          </div>
        </div>

        <div class="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div class="px-6 py-4 border-b border-slate-200">
            <h2 class="text-base font-bold text-slate-900">Log Pelanggaran &amp; Riwayat Ujian CBT Santri</h2>
            <p class="text-xs text-slate-500">Rekaman real-time dari Sheet <code class="text-emerald-800">Log_Ujian_CBT</code></p>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full text-left border-collapse">
              <thead>
                <tr class="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                  <th class="py-3 px-4">Timestamp</th>
                  <th class="py-3 px-4">NIS</th>
                  <th class="py-3 px-4">Nama Santri</th>
                  <th class="py-3 px-4">Mapel</th>
                  <th class="py-3 px-4 text-right">Skor CBT</th>
                  <th class="py-3 px-4 text-right">Jumlah Pelanggaran</th>
                  <th class="py-3 px-4">Status Penyelesaian</th>
                </tr>
              </thead>
              <tbody id="tbody-monitoring-log" class="divide-y divide-slate-200 text-sm"></tbody>
            </table>
          </div>
        </div>
      </div>
    </section>

    <!-- 3. HALAMAN UJIAN SANTRI -->
    <section id="view-ujian" class="hidden space-y-6">
      <div id="panel-login-ujian" class="max-w-lg mx-auto bg-white border border-slate-200 rounded-xl p-8 space-y-6">
        <div class="border-b border-slate-200 pb-4 space-y-1">
          <div class="text-xs font-mono text-emerald-800 font-semibold">SAFE EXAM BROWSER PESANTREN</div>
          <h1 class="text-2xl font-bold text-slate-900">Login Ujian CBT Santri</h1>
          <p class="text-xs text-slate-600">
            Saat klik "Mulai Ujian", layar perangkat otomatis dikunci ke mode Layar Penuh (Fullscreen) dan sensor anti-curang diaktifkan.
          </p>
        </div>

        <form onsubmit="mulaiUjianSantri(event)" class="space-y-4">
          <div>
            <label class="block text-xs font-semibold text-slate-700 mb-1">Nomor Induk Santri (NIS)</label>
            <input type="text" id="login-nis" required value="SNT-202601" placeholder="Contoh: SNT-202601" class="w-full px-3.5 py-2.5 text-sm font-mono border border-slate-300 rounded-lg">
          </div>

          <div>
            <label class="block text-xs font-semibold text-slate-700 mb-1">Mata Pelajaran Ujian</label>
            <input type="text" id="login-mapel" required value="Fiqih Ibadah" placeholder="Contoh: Fiqih Ibadah" class="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg">
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label class="block text-xs font-semibold text-slate-700 mb-1">Token Ujian</label>
              <input type="text" id="login-token" required value="SANTRI2026" class="w-full px-3.5 py-2.5 text-sm font-mono uppercase border border-slate-300 rounded-lg">
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-700 mb-1">Durasi Ujian (Menit)</label>
              <input type="number" id="login-durasi" min="5" max="180" value="30" class="w-full px-3.5 py-2.5 text-sm font-mono border border-slate-300 rounded-lg">
            </div>
          </div>

          <div class="p-4 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-600 space-y-1">
            <div class="font-bold text-slate-900">Peringatan Sistem Anti-Curang:</div>
            <div>1. Keluar dari Fullscreen akan langsung memburamkan (blur) lembar soal.</div>
            <div>2. Pindah tab, split-screen, atau minimize memicu alarm Beep &amp; penalti.</div>
            <div>3. Pelanggaran ke-3 otomatis menghentikan ujian (Auto-Submit nilai seadanya).</div>
          </div>

          <button type="submit" id="btn-mulai-ujian" class="w-full py-3 px-5 text-sm font-semibold text-white bg-emerald-800 rounded-lg hover:bg-emerald-700 transition-colors">
            Mulai Ujian &amp; Kunci Layar Penuh
          </button>
        </form>
      </div>

      <div id="panel-lembar-ujian" class="hidden exam-lockdown space-y-6">
        <div class="bg-slate-900 text-white rounded-xl p-5 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div id="ujian-info-santri" class="text-xs font-mono text-slate-400">SNT-202601 · Kelas 1A</div>
            <h2 id="ujian-judul-mapel" class="text-lg font-bold">Ujian CBT: Fiqih Ibadah</h2>
          </div>

          <div class="flex flex-wrap items-center gap-3">
            <div class="px-3.5 py-1.5 bg-slate-800 rounded-lg text-xs font-mono">
              Sisa Waktu: <strong id="ujian-timer" class="text-emerald-400 text-sm">30:00</strong>
            </div>
            <div class="px-3.5 py-1.5 bg-slate-800 rounded-lg text-xs font-mono">
              Pelanggaran: <strong id="ujian-counter-pelanggaran" class="text-amber-400 text-sm">0 / 3</strong>
            </div>
          </div>
        </div>

        <div id="banner-blur-fullscreen" class="hidden p-6 bg-red-950 text-white rounded-xl border border-red-800 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <div class="font-bold text-sm">Layar Soal Diburamkan Karena Anda Keluar dari Mode Fullscreen!</div>
            <div class="text-xs text-red-200 mt-0.5">Klik tombol di samping untuk mengaktifkan kembali layar penuh dan melanjutkan ujian.</div>
          </div>
          <button type="button" onclick="aktifkanKembaliFullscreen()" class="px-4 py-2 text-xs font-semibold bg-white text-slate-900 rounded-lg hover:bg-slate-100 shrink-0">
            Kembali ke Fullscreen
          </button>
        </div>

        <div id="wadah-butir-soal" class="space-y-4 transition-all duration-200"></div>

        <div class="p-5 bg-white border border-slate-200 rounded-xl flex items-center justify-between">
          <div id="status-terjawab" class="text-xs font-mono text-slate-600">Terjawab: 0 Soal</div>
          <button type="button" onclick="konfirmasiSubmitUjianManual()" id="btn-submit-ujian" class="px-6 py-2.5 text-sm font-semibold text-white bg-emerald-800 rounded-lg hover:bg-emerald-700 transition-colors">
            Selesai &amp; Kumpulkan Jawaban CBT
          </button>
        </div>
      </div>
    </section>

    <!-- 4. HALAMAN RAPOR DIGITAL -->
    <section id="view-rapor" class="hidden space-y-6">
      <div class="no-print flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-200">
        <div>
          <div class="text-xs text-slate-500">Dokumen Resmi Hasil Belajar Santri</div>
          <h1 class="text-2xl font-bold text-slate-900 mt-0.5">Cetak e-Rapor Digital Pesantren</h1>
        </div>

        <div class="flex flex-wrap items-center gap-3">
          <select id="select-santri-rapor" onchange="tarikRaporSantriDariServer()" class="px-3.5 py-2 text-xs font-semibold bg-white border border-slate-300 rounded-lg"></select>
          <button type="button" onclick="window.print()" class="px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors">
            Cetak Rapor (PDF)
          </button>
        </div>
      </div>

      <div id="rapor-print-area" class="bg-white border border-slate-200 rounded-xl p-8 sm:p-10 max-w-4xl mx-auto space-y-8">
        <div class="text-center border-b-2 border-slate-900 pb-6 space-y-1">
          <div class="text-xs font-semibold tracking-widest uppercase text-emerald-800">
            Yayasan Pendidikan Pondok Pesantren Modern
          </div>
          <h2 class="text-2xl font-bold text-slate-900">
            LAPORAN HASIL BELAJAR SANTRI (E-RAPOR DIGITAL)
          </h2>
          <p class="text-xs text-slate-600">
            Komponen Penilaian: Tugas Harian (20%) · Sikap (20%) · Ujian Lisan (20%) · Ujian Tulis CBT (40%)
          </p>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm bg-slate-50 p-5 rounded-lg border border-slate-200">
          <div class="space-y-1.5">
            <div><span class="text-slate-500 inline-block w-36">Nama Santri:</span> <strong id="rapor-nama" class="text-slate-900">-</strong></div>
            <div><span class="text-slate-500 inline-block w-36">Nomor Induk (NIS):</span> <span id="rapor-nis" class="font-mono font-semibold text-slate-800">-</span></div>
          </div>
          <div class="space-y-1.5">
            <div><span class="text-slate-500 inline-block w-36">Unit / Kelas:</span> <strong id="rapor-unit" class="text-slate-900">-</strong></div>
            <div><span class="text-slate-500 inline-block w-36">Integritas Ujian CBT:</span> <span id="rapor-integritas" class="font-mono text-xs font-semibold text-slate-800">-</span></div>
          </div>
        </div>

        <div class="overflow-x-auto">
          <table class="w-full text-left border-collapse border border-slate-300">
            <thead>
              <tr class="bg-slate-900 text-white text-xs">
                <th class="py-3 px-3 border border-slate-700">No</th>
                <th class="py-3 px-4 border border-slate-700">Mata Pelajaran</th>
                <th class="py-3 px-3 text-right border border-slate-700">Tugas Harian (20%)</th>
                <th class="py-3 px-3 text-right border border-slate-700">Nilai Sikap (20%)</th>
                <th class="py-3 px-3 text-right border border-slate-700">Ujian Lisan (20%)</th>
                <th class="py-3 px-3 text-right border border-slate-700">Nilai CBT (40%)</th>
                <th class="py-3 px-4 text-right border border-slate-700">Nilai Akhir</th>
                <th class="py-3 px-4 text-center border border-slate-700">Predikat</th>
              </tr>
            </thead>
            <tbody id="tbody-rapor-nilai" class="divide-y divide-slate-300 text-sm"></tbody>
            <tfoot>
              <tr class="bg-slate-100 font-bold text-sm">
                <td colspan="6" class="py-3 px-4 border border-slate-300 text-right">Rata-Rata Nilai Akhir &amp; Predikat Umum</td>
                <td id="rapor-rata-rata" class="py-3 px-4 border border-slate-300 text-right font-mono tabular-nums text-emerald-900">0.00</td>
                <td id="rapor-predikat-umum" class="py-3 px-4 border border-slate-300 text-center font-mono">-</td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div class="pt-4 flex flex-col sm:flex-row items-start sm:items-end justify-between gap-6 text-xs text-slate-600">
          <div class="space-y-1">
            <div class="font-semibold text-slate-800">Keterangan Rumus &amp; Rentang Predikat:</div>
            <div>Nilai Akhir = (Tugas × 0.20) + (Sikap × 0.20) + (Lisan × 0.20) + (CBT × 0.40)</div>
            <div>A = 85–100 (Mumtaz) · B = 75–84 (Jayyid Jiddan) · C = 60–74 (Jayyid) · D = &lt; 60 (Maqbul)</div>
          </div>
          <div class="text-center space-y-14 min-w-[220px]">
            <div>Tanggal Cetak: <span id="rapor-tanggal">-</span><br>Wali Kelas / Pengasuh Pesantren,</div>
            <div class="font-bold text-slate-900 border-t border-slate-400 pt-1">
              Ustadz H. Abdurrahman, Lc., M.Ag.
            </div>
          </div>
        </div>
      </div>
    </section>

  </main>

  <script>
    let stateMonitoring = {
      santri: [],
      nilaiMapel: [],
      logUjian: [],
      bankSoal: []
    };

    let stateUjian = {
      aktif: false,
      santri: null,
      mapel: '',
      daftarSoal: [],
      jawaban: {},
      pelanggaran: 0,
      sisaDetik: 0,
      timerInterval: null
    };

    window.addEventListener('DOMContentLoaded', function() {
      pasangProteksiAntiCurangGlobal();
      muatDataMonitoringServer(false);
    });

    function navigasiKe(halaman) {
      if (stateUjian.aktif) {
        Swal.fire({
          icon: 'warning',
          title: 'Ujian Sedang Berlangsung!',
          text: 'Anda tidak diizinkan berpindah menu sebelum menyelesaikan dan mengumpulkan ujian CBT.',
          confirmButtonColor: '#065f46'
        });
        return;
      }

      const daftarHalaman = ['beranda', 'ujian', 'ustadz', 'rapor'];
      daftarHalaman.forEach(function(id) {
        const elView = document.getElementById('view-' + id);
        const elNav  = document.getElementById('nav-' + id);
        if (id === halaman) {
          elView.classList.remove('hidden');
          if (elNav) {
            elNav.className = 'py-1 border-b-2 border-emerald-700 text-emerald-800 font-semibold whitespace-nowrap shrink-0';
          }
        } else {
          elView.classList.add('hidden');
          if (elNav) {
            elNav.className = 'py-1 border-b-2 border-transparent hover:text-slate-900 whitespace-nowrap shrink-0';
          }
        }
      });

      if (halaman === 'ustadz') {
        renderSemuaPanelUstadz();
      } else if (halaman === 'rapor') {
        isiDropdownSantriRapor();
        tarikRaporSantriDariServer();
      }
    }

    function pilihTabUstadz(tab) {
      const tabs = ['soal', 'noncbt', 'monitoring'];
      tabs.forEach(function(t) {
        const panel = document.getElementById('ustadz-panel-' + t);
        const btn   = document.getElementById('tab-btn-' + t);
        if (t === tab) {
          panel.classList.remove('hidden');
          btn.className = 'px-3.5 py-1.5 text-xs font-semibold rounded-md bg-white text-slate-900 shadow-sm';
        } else {
          panel.classList.add('hidden');
          btn.className = 'px-3.5 py-1.5 text-xs font-semibold rounded-md text-slate-600 hover:text-slate-900';
        }
      });

      if (tab === 'noncbt') {
        renderTabelInputNonCBT();
      }
    }

    function muatDataMonitoringServer(tampilkanNotif) {
      if (typeof google === 'undefined' || !google.script) {
        return;
      }

      google.script.run
        .withSuccessHandler(function(res) {
          if (res && res.sukses) {
            stateMonitoring.santri     = res.santri || [];
            stateMonitoring.nilaiMapel = res.nilaiMapel || [];
            stateMonitoring.logUjian   = res.logUjian || [];
            stateMonitoring.bankSoal   = res.bankSoal || [];

            renderSemuaPanelUstadz();
            isiDropdownSantriRapor();

            if (tampilkanNotif) {
              Swal.fire({
                icon: 'success',
                title: 'Data Tersinkronisasi',
                text: 'Berhasil memuat data terbaru dari Google Sheets.',
                timer: 1600,
                showConfirmButton: false
              });
            }
          } else {
            Swal.fire('Gagal Memuat Data', (res && res.pesan) || 'Terjadi kesalahan.', 'error');
          }
        })
        .withFailureHandler(function(err) {
          Swal.fire('Error Server GAS', err.message || String(err), 'error');
        })
        .ambilDataMonitoring();
    }

    function jalankanSetupDatabaseServer() {
      Swal.fire({
        title: 'Inisialisasi Database 4 Sheet?',
        text: 'Fungsi setupDatabase() akan membuat/mereset Master_Santri, Bank_Soal, Log_Ujian_CBT, dan Nilai_Mapel beserta data dummy.',
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#065f46',
        confirmButtonText: 'Ya, Jalankan setupDatabase()'
      }).then(function(result) {
        if (!result.isConfirmed) return;

        google.script.run
          .withSuccessHandler(function(res) {
            Swal.fire('Berhasil', res.pesan, 'success');
            muatDataMonitoringServer(false);
          })
          .withFailureHandler(function(err) {
            Swal.fire('Gagal', err.message || String(err), 'error');
          })
          .setupDatabase();
      });
    }

    function simpanSoalKeServer(e) {
      e.preventDefault();
      const btn = document.getElementById('btn-simpan-soal');
      btn.disabled = true;
      btn.textContent = 'Menyimpan Soal...';

      const payload = {
        unitKelas: document.getElementById('soal-unit').value,
        mapel: document.getElementById('soal-mapel').value,
        pertanyaan: document.getElementById('soal-pertanyaan').value,
        opsiA: document.getElementById('soal-opsi-a').value,
        opsiB: document.getElementById('soal-opsi-b').value,
        opsiC: document.getElementById('soal-opsi-c').value,
        opsiD: document.getElementById('soal-opsi-d').value,
        kunciJawaban: document.getElementById('soal-kunci').value,
        bobotSoal: parseFloat(document.getElementById('soal-bobot').value) || 25
      };

      google.script.run
        .withSuccessHandler(function(res) {
          btn.disabled = false;
          btn.textContent = 'Simpan Soal ke Bank_Soal';
          if (res && res.sukses) {
            Swal.fire({
              icon: 'success',
              title: 'Soal Tersimpan',
              text: res.pesan,
              confirmButtonColor: '#065f46'
            });
            document.getElementById('soal-pertanyaan').value = '';
            document.getElementById('soal-opsi-a').value = '';
            document.getElementById('soal-opsi-b').value = '';
            document.getElementById('soal-opsi-c').value = '';
            document.getElementById('soal-opsi-d').value = '';
            muatDataMonitoringServer(false);
          } else {
            Swal.fire('Gagal Menyimpan Soal', (res && res.pesan) || 'Terjadi kesalahan.', 'error');
          }
        })
        .withFailureHandler(function(err) {
          btn.disabled = false;
          btn.textContent = 'Simpan Soal ke Bank_Soal';
          Swal.fire('Error Server', err.message || String(err), 'error');
        })
        .simpanSoalUstadz(payload);
    }

    function renderSemuaPanelUstadz() {
      const wadahSoal = document.getElementById('list-bank-soal');
      const labelJumlah = document.getElementById('jumlah-bank-soal');
      labelJumlah.textContent = stateMonitoring.bankSoal.length + ' Butir Soal';

      if (stateMonitoring.bankSoal.length === 0) {
        wadahSoal.innerHTML = '<div class="py-8 text-center text-slate-400">Belum ada soal di Bank_Soal.</div>';
      } else {
        wadahSoal.innerHTML = stateMonitoring.bankSoal.map(function(s) {
          return (
            '<div class="py-3.5 px-2 space-y-1.5">' +
              '<div class="flex items-center justify-between font-mono text-xs text-slate-500">' +
                '<span><strong class="text-slate-800">' + s.idSoal + '</strong> · ' + s.mapel + ' · ' + s.unitKelas + '</span>' +
                '<span>Kunci: <strong class="text-emerald-800">' + s.kunciJawaban + '</strong> · Bobot: ' + s.bobotSoal + '</span>' +
              '</div>' +
              '<div class="text-sm font-medium text-slate-900">' + s.pertanyaan + '</div>' +
              '<div class="grid grid-cols-2 gap-1 text-xs text-slate-600">' +
                '<div>A. ' + s.opsiA + '</div>' +
                '<div>B. ' + s.opsiB + '</div>' +
                '<div>C. ' + s.opsiC + '</div>' +
                '<div>D. ' + s.opsiD + '</div>' +
              '</div>' +
            '</div>'
          );
        }).join('');
      }

      const selectUnit = document.getElementById('noncbt-unit');
      const unitUnik = [];
      stateMonitoring.santri.forEach(function(s) {
        if (unitUnik.indexOf(s.unitKelas) === -1) {
          unitUnik.push(s.unitKelas);
        }
      });
      if (unitUnik.length > 0 && selectUnit.options.length === 0) {
        selectUnit.innerHTML = unitUnik.map(function(u) {
          return '<option value="' + u + '">' + u + '</option>';
        }).join('');
      }
      renderTabelInputNonCBT();

      const tbodyNilai = document.getElementById('tbody-monitoring-nilai');
      if (stateMonitoring.nilaiMapel.length === 0) {
        tbodyNilai.innerHTML = '<tr><td colspan="10" class="py-6 text-center text-slate-400">Belum ada data nilai.</td></tr>';
      } else {
        tbodyNilai.innerHTML = stateMonitoring.nilaiMapel.map(function(n) {
          return (
            '<tr class="hover:bg-slate-50">' +
              '<td class="py-3 px-4 font-mono text-xs">' + n.nis + '</td>' +
              '<td class="py-3 px-4 font-medium text-slate-900">' + n.namaSantri + '</td>' +
              '<td class="py-3 px-4 text-xs text-slate-600">' + n.unitKelas + '</td>' +
              '<td class="py-3 px-4">' + n.mapel + '</td>' +
              '<td class="py-3 px-3 text-right font-mono">' + n.nilaiTugasHarian + '</td>' +
              '<td class="py-3 px-3 text-right font-mono">' + n.nilaiSikap + '</td>' +
              '<td class="py-3 px-3 text-right font-mono">' + n.nilaiUjianLisan + '</td>' +
              '<td class="py-3 px-3 text-right font-mono font-semibold">' + n.nilaiCBT + '</td>' +
              '<td class="py-3 px-4 text-right font-mono font-bold text-emerald-800">' + Number(n.nilaiAkhir).toFixed(2) + '</td>' +
              '<td class="py-3 px-4 text-center font-mono font-bold">' + n.predikat + '</td>' +
            '</tr>'
          );
        }).join('');
      }

      const tbodyLog = document.getElementById('tbody-monitoring-log');
      if (stateMonitoring.logUjian.length === 0) {
        tbodyLog.innerHTML = '<tr><td colspan="7" class="py-6 text-center text-slate-400">Belum ada log ujian CBT.</td></tr>';
      } else {
        tbodyLog.innerHTML = stateMonitoring.logUjian.map(function(l) {
          return (
            '<tr class="hover:bg-slate-50">' +
              '<td class="py-3 px-4 font-mono text-xs text-slate-500">' + l.timestamp + '</td>' +
              '<td class="py-3 px-4 font-mono text-xs">' + l.nis + '</td>' +
              '<td class="py-3 px-4 font-medium text-slate-900">' + l.namaSantri + '</td>' +
              '<td class="py-3 px-4">' + l.mapel + '</td>' +
              '<td class="py-3 px-4 text-right font-mono font-bold">' + l.skorCBT + '</td>' +
              '<td class="py-3 px-4 text-right font-mono font-semibold text-red-700">' + l.jumlahPelanggaran + 'x</td>' +
              '<td class="py-3 px-4 text-xs font-medium">' + l.status + '</td>' +
            '</tr>'
          );
        }).join('');
      }
    }

    function renderTabelInputNonCBT() {
      const unitPilih  = document.getElementById('noncbt-unit').value;
      const mapelPilih = document.getElementById('noncbt-mapel').value.trim();
      const tbody      = document.getElementById('tbody-input-noncbt');

      const santriUnit = stateMonitoring.santri.filter(function(s) {
        return !unitPilih || s.unitKelas === unitPilih;
      });

      if (santriUnit.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="py-6 text-center text-slate-400">Tidak ada santri pada unit ini.</td></tr>';
        return;
      }

      tbody.innerHTML = santriUnit.map(function(s) {
        const rowExisting = stateMonitoring.nilaiMapel.find(function(n) {
          return n.nis === s.nis && n.mapel.toLowerCase() === mapelPilih.toLowerCase();
        });

        const nTugas = rowExisting ? rowExisting.nilaiTugasHarian : 80;
        const nSikap = rowExisting ? rowExisting.nilaiSikap : 85;
        const nLisan = rowExisting ? rowExisting.nilaiUjianLisan : 80;
        const nCBT   = rowExisting ? rowExisting.nilaiCBT : 0;
        const nAkhir = (nTugas * 0.20) + (nSikap * 0.20) + (nLisan * 0.20) + (nCBT * 0.40);

        return (
          '<tr data-nis="' + s.nis + '" data-nama="' + s.namaSantri + '" data-unit="' + s.unitKelas + '">' +
            '<td class="py-3 px-4 font-mono text-xs">' + s.nis + '</td>' +
            '<td class="py-3 px-4 font-medium text-slate-900">' + s.namaSantri + '</td>' +
            '<td class="py-3 px-4 text-right">' +
              '<input type="number" min="0" max="100" value="' + nTugas + '" onchange="updatePreviewBarisNonCBT(this)" class="input-tugas w-20 px-2.5 py-1.5 text-right font-mono text-xs border border-slate-300 rounded-md">' +
            '</td>' +
            '<td class="py-3 px-4 text-right">' +
              '<input type="number" min="0" max="100" value="' + nSikap + '" onchange="updatePreviewBarisNonCBT(this)" class="input-sikap w-20 px-2.5 py-1.5 text-right font-mono text-xs border border-slate-300 rounded-md">' +
            '</td>' +
            '<td class="py-3 px-4 text-right">' +
              '<input type="number" min="0" max="100" value="' + nLisan + '" onchange="updatePreviewBarisNonCBT(this)" class="input-lisan w-20 px-2.5 py-1.5 text-right font-mono text-xs border border-slate-300 rounded-md">' +
            '</td>' +
            '<td class="py-3 px-4 text-right font-mono text-slate-600 cell-cbt" data-cbt="' + nCBT + '">' + nCBT + '</td>' +
            '<td class="py-3 px-4 text-right font-mono font-bold text-emerald-800 cell-akhir">' + nAkhir.toFixed(2) + '</td>' +
          '</tr>'
        );
      }).join('');
    }

    function updatePreviewBarisNonCBT(inputEl) {
      const tr     = inputEl.closest('tr');
      const tugas  = parseFloat(tr.querySelector('.input-tugas').value) || 0;
      const sikap  = parseFloat(tr.querySelector('.input-sikap').value) || 0;
      const lisan  = parseFloat(tr.querySelector('.input-lisan').value) || 0;
      const cbt    = parseFloat(tr.querySelector('.cell-cbt').getAttribute('data-cbt')) || 0;
      const akhir  = (tugas * 0.20) + (sikap * 0.20) + (lisan * 0.20) + (cbt * 0.40);
      tr.querySelector('.cell-akhir').textContent = akhir.toFixed(2);
    }

    function simpanNilaiNonCBTKeServer() {
      const mapelPilih = document.getElementById('noncbt-mapel').value.trim();
      const rows       = document.querySelectorAll('#tbody-input-noncbt tr[data-nis]');
      const payload    = [];

      rows.forEach(function(tr) {
        payload.push({
          nis: tr.getAttribute('data-nis'),
          namaSantri: tr.getAttribute('data-nama'),
          unitKelas: tr.getAttribute('data-unit'),
          mapel: mapelPilih,
          nilaiTugasHarian: parseFloat(tr.querySelector('.input-tugas').value) || 0,
          nilaiSikap: parseFloat(tr.querySelector('.input-sikap').value) || 0,
          nilaiUjianLisan: parseFloat(tr.querySelector('.input-lisan').value) || 0
        });
      });

      const btn = document.getElementById('btn-simpan-noncbt');
      btn.disabled = true;
      btn.textContent = 'Menyimpan...';

      google.script.run
        .withSuccessHandler(function(res) {
          btn.disabled = false;
          btn.textContent = 'Simpan Semua Nilai Non-CBT';
          if (res && res.sukses) {
            Swal.fire({
              icon: 'success',
              title: 'Nilai Non-CBT Disimpan',
              text: res.pesan,
              confirmButtonColor: '#065f46'
            });
            muatDataMonitoringServer(false);
          } else {
            Swal.fire('Gagal Menyimpan', (res && res.pesan) || 'Terjadi kesalahan.', 'error');
          }
        })
        .withFailureHandler(function(err) {
          btn.disabled = false;
          btn.textContent = 'Simpan Semua Nilai Non-CBT';
          Swal.fire('Error Server', err.message || String(err), 'error');
        })
        .inputNilaiNonCBT(payload);
    }

    function bunyikanAlarmBeep(frekuensi, durasiMs) {
      try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        const ctx  = new AudioCtx();
        const osc  = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(frekuensi || 880, ctx.currentTime);
        gain.gain.setValueAtTime(0.28, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + ((durasiMs || 450) / 1000));
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + ((durasiMs || 450) / 1000));
      } catch (e) {}
    }

    function mulaiUjianSantri(e) {
      e.preventDefault();
      const nis    = document.getElementById('login-nis').value.trim();
      const mapel  = document.getElementById('login-mapel').value.trim();
      const token  = document.getElementById('login-token').value.trim();
      const durasi = parseInt(document.getElementById('login-durasi').value, 10) || 30;

      const btn = document.getElementById('btn-mulai-ujian');
      btn.disabled = true;
      btn.textContent = 'Memverifikasi & Memuat Soal...';

      if (document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().catch(function() {});
      }

      google.script.run
        .withSuccessHandler(function(res) {
          btn.disabled = false;
          btn.textContent = 'Mulai Ujian & Kunci Layar Penuh';

          if (!res || !res.sukses) {
            if (document.fullscreenElement) {
              document.exitFullscreen().catch(function() {});
            }
            Swal.fire({
              icon: 'error',
              title: 'Tidak Dapat Memulai Ujian',
              text: (res && res.pesan) || 'Pastikan NIS, Mapel, dan Token Ujian sesuai.',
              confirmButtonColor: '#065f46'
            });
            return;
          }

          stateUjian.aktif       = true;
          stateUjian.santri      = res.santri;
          stateUjian.mapel       = res.mapel;
          stateUjian.daftarSoal  = res.soal || [];
          stateUjian.jawaban     = {};
          stateUjian.pelanggaran = 0;
          stateUjian.sisaDetik   = durasi * 60;

          document.getElementById('main-navbar').classList.add('hidden');
          document.getElementById('panel-login-ujian').classList.add('hidden');
          document.getElementById('panel-lembar-ujian').classList.remove('hidden');

          document.getElementById('ujian-info-santri').textContent = res.santri.nis + ' · ' + res.santri.namaSantri + ' (' + res.santri.unitKelas + ')';
          document.getElementById('ujian-judul-mapel').textContent = 'Ujian CBT: ' + res.mapel;
          document.getElementById('ujian-counter-pelanggaran').textContent = '0 / 3';

          renderButirSoalUjian();
          mulaiCountdownTimerUjian();
        })
        .withFailureHandler(function(err) {
          btn.disabled = false;
          btn.textContent = 'Mulai Ujian & Kunci Layar Penuh';
          Swal.fire('Error Server', err.message || String(err), 'error');
        })
        .ambilSoalUjian(nis, mapel, token);
    }

    function renderButirSoalUjian() {
      const wadah = document.getElementById('wadah-butir-soal');
      wadah.innerHTML = stateUjian.daftarSoal.map(function(soal, idx) {
        const opsiList = [
          { kode: 'A', teks: soal.opsiA },
          { kode: 'B', teks: soal.opsiB },
          { kode: 'C', teks: soal.opsiC },
          { kode: 'D', teks: soal.opsiD }
        ];

        const tombolOpsi = opsiList.map(function(op) {
          const dipilih = stateUjian.jawaban[soal.idSoal] === op.kode;
          const kelasTombol = dipilih
            ? 'bg-emerald-900 text-white border-emerald-900 font-semibold'
            : 'bg-slate-50 text-slate-800 border-slate-200 hover:bg-slate-100';

          return (
            '<button type="button" onclick="pilihJawabanSantri(\\'' + soal.idSoal + '\\', \\'' + op.kode + '\\')" ' +
              'class="flex items-center gap-3 p-3.5 text-left text-sm rounded-lg border transition-colors ' + kelasTombol + '">' +
              '<span class="w-6 h-6 rounded flex items-center justify-center font-mono text-xs font-bold shrink-0 bg-white text-slate-800 border border-slate-300">' + op.kode + '</span>' +
              '<span>' + op.teks + '</span>' +
            '</button>'
          );
        }).join('');

        return (
          '<div class="p-6 bg-white border border-slate-200 rounded-xl space-y-4">' +
            '<div class="flex items-center justify-between text-xs text-slate-500 font-mono">' +
              '<span>SOAL NOMOR ' + (idx + 1) + ' (' + soal.idSoal + ')</span>' +
              '<span>Bobot: ' + soal.bobotSoal + ' Poin</span>' +
            '</div>' +
            '<p class="text-base font-medium text-slate-900 leading-relaxed">' + soal.pertanyaan + '</p>' +
            '<div class="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">' + tombolOpsi + '</div>' +
          '</div>'
        );
      }).join('');

      const jmlTerjawab = Object.keys(stateUjian.jawaban).length;
      document.getElementById('status-terjawab').textContent = 'Terjawab: ' + jmlTerjawab + ' dari ' + stateUjian.daftarSoal.length + ' Soal';
    }

    function pilihJawabanSantri(idSoal, kodeOpsi) {
      if (!stateUjian.aktif) return;
      stateUjian.jawaban[idSoal] = kodeOpsi;
      renderButirSoalUjian();
    }

    function mulaiCountdownTimerUjian() {
      if (stateUjian.timerInterval) {
        clearInterval(stateUjian.timerInterval);
      }
      perbaruiTampilanTimer();
      stateUjian.timerInterval = setInterval(function() {
        if (!stateUjian.aktif) {
          clearInterval(stateUjian.timerInterval);
          return;
        }
        stateUjian.sisaDetik--;
        perbaruiTampilanTimer();

        if (stateUjian.sisaDetik <= 0) {
          clearInterval(stateUjian.timerInterval);
          kirimJawabanUjianKeServer(false, 'Waktu Ujian Habis (Auto-Submit Timer)');
        }
      }, 1000);
    }

    function perbaruiTampilanTimer() {
      const menit = Math.floor(stateUjian.sisaDetik / 60);
      const detik = stateUjian.sisaDetik % 60;
      const teks  = String(menit).padStart(2, '0') + ':' + String(detik).padStart(2, '0');
      document.getElementById('ujian-timer').textContent = teks;
    }

    function pasangProteksiAntiCurangGlobal() {
      document.addEventListener('visibilitychange', function() {
        if (stateUjian.aktif && document.hidden) {
          catatPelanggaranUjian('Terdeteksi pindah tab atau meminimize browser ujian.');
        }
      });

      window.addEventListener('blur', function() {
        if (stateUjian.aktif) {
          catatPelanggaranUjian('Terdeteksi keluar dari fokus jendela ujian (Split Screen / Aplikasi Lain).');
        }
      });

      document.addEventListener('fullscreenchange', function() {
        if (!stateUjian.aktif) return;
        const wadahSoal  = document.getElementById('wadah-butir-soal');
        const bannerBlur = document.getElementById('banner-blur-fullscreen');

        if (!document.fullscreenElement) {
          wadahSoal.classList.add('blur-lockscreen');
          bannerBlur.classList.remove('hidden');
          catatPelanggaranUjian('Keluar dari mode Layar Penuh (Fullscreen).');
        } else {
          wadahSoal.classList.remove('blur-lockscreen');
          bannerBlur.classList.add('hidden');
        }
      });

      document.addEventListener('contextmenu', function(e) {
        if (stateUjian.aktif) {
          e.preventDefault();
          catatPelanggaranUjian('Mencoba membuka menu klik kanan (Context Menu).');
        }
      });

      ['copy', 'cut', 'paste'].forEach(function(evtName) {
        document.addEventListener(evtName, function(e) {
          if (stateUjian.aktif) {
            e.preventDefault();
            catatPelanggaranUjian('Mencoba melakukan aksi ' + evtName.toUpperCase() + ' pada lembar soal.');
          }
        });
      });

      window.addEventListener('keydown', function(e) {
        if (!stateUjian.aktif) return;
        const keyLower = (e.key || '').toLowerCase();
        if (
          (e.ctrlKey && ['c', 'v', 'x', 'u', 'p', 's'].indexOf(keyLower) !== -1) ||
          e.key === 'F12'
        ) {
          e.preventDefault();
          catatPelanggaranUjian('Menekan pintasan keyboard terlarang (' + e.key + ').');
        }
      });
    }

    function aktifkanKembaliFullscreen() {
      const wadahSoal  = document.getElementById('wadah-butir-soal');
      const bannerBlur = document.getElementById('banner-blur-fullscreen');
      wadahSoal.classList.remove('blur-lockscreen');
      bannerBlur.classList.add('hidden');

      if (document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().catch(function() {});
      }
    }

    function catatPelanggaranUjian(alasan) {
      if (!stateUjian.aktif) return;

      stateUjian.pelanggaran += 1;
      document.getElementById('ujian-counter-pelanggaran').textContent = stateUjian.pelanggaran + ' / 3';

      if (stateUjian.pelanggaran >= 3) {
        bunyikanAlarmBeep(1250, 900);
        kirimJawabanUjianKeServer(true, alasan);
      } else {
        bunyikanAlarmBeep(880, 450);
        Swal.fire({
          icon: 'warning',
          title: 'PERINGATAN PELANGGARAN KE-' + stateUjian.pelanggaran + ' DARI 3!',
          text: alasan + ' Jika mencapai 3x pelanggaran, ujian Anda otomatis dihentikan dan disubmit seadanya!',
          confirmButtonText: 'Saya Mengerti & Kembali Fokus',
          confirmButtonColor: '#b91c1c',
          allowOutsideClick: false
        }).then(function() {
          aktifkanKembaliFullscreen();
        });
      }
    }

    function konfirmasiSubmitUjianManual() {
      if (!stateUjian.aktif) return;
      const terjawab = Object.keys(stateUjian.jawaban).length;
      const total    = stateUjian.daftarSoal.length;

      Swal.fire({
        icon: 'question',
        title: 'Kumpulkan Jawaban Ujian CBT?',
        text: 'Anda telah menjawab ' + terjawab + ' dari ' + total + ' soal. Jawaban yang sudah dikirim tidak dapat diubah kembali.',
        showCancelButton: true,
        confirmButtonColor: '#065f46',
        cancelButtonText: 'Periksa Kembali',
        confirmButtonText: 'Ya, Kumpulkan Sekarang'
      }).then(function(res) {
        if (res.isConfirmed) {
          kirimJawabanUjianKeServer(false, '');
        }
      });
    }

    function kirimJawabanUjianKeServer(autoSubmitCurang, catatanTambahan) {
      if (!stateUjian.aktif) return;
      stateUjian.aktif = false;

      if (stateUjian.timerInterval) {
        clearInterval(stateUjian.timerInterval);
      }

      if (document.fullscreenElement) {
        document.exitFullscreen().catch(function() {});
      }

      const payload = {
        nis: stateUjian.santri.nis,
        namaSantri: stateUjian.santri.namaSantri,
        unitKelas: stateUjian.santri.unitKelas,
        mapel: stateUjian.mapel,
        jawaban: stateUjian.jawaban,
        jumlahPelanggaran: stateUjian.pelanggaran,
        autoSubmitCurang: Boolean(autoSubmitCurang)
      };

      Swal.fire({
        title: autoSubmitCurang ? 'Menghentikan Ujian Otomatis (3x Pelanggaran)...' : 'Menyimpan & Menilai Jawaban CBT...',
        text: 'Mohon tunggu, sistem sedang mengupdate Nilai_CBT dan menghitung ulang Nilai Akhir Rapor.',
        allowOutsideClick: false,
        didOpen: function() {
          Swal.showLoading();
        }
      });

      google.script.run
        .withSuccessHandler(function(res) {
          document.getElementById('main-navbar').classList.remove('hidden');
          document.getElementById('panel-lembar-ujian').classList.add('hidden');
          document.getElementById('panel-login-ujian').classList.remove('hidden');
          document.getElementById('wadah-butir-soal').classList.remove('blur-lockscreen');
          document.getElementById('banner-blur-fullscreen').classList.add('hidden');

          if (res && res.sukses) {
            Swal.fire({
              icon: autoSubmitCurang ? 'error' : 'success',
              title: autoSubmitCurang ? 'Ujian Dihentikan Otomatis (3x Pelanggaran)' : 'Ujian CBT Selesai & Tersimpan',
              html:
                '<div class="text-left text-sm space-y-1.5 mt-2">' +
                  '<p><strong>Nama Santri:</strong> ' + res.namaSantri + ' (' + res.nis + ')</p>' +
                  '<p><strong>Mata Pelajaran:</strong> ' + res.mapel + '</p>' +
                  '<p><strong>Skor Ujian CBT (40%):</strong> <span class="font-mono font-bold">' + res.skorCBT + '</span> (' + res.jumlahBenar + '/' + res.totalSoal + ' benar)</p>' +
                  '<p><strong>Jumlah Pelanggaran:</strong> <span class="font-mono font-bold">' + res.jumlahPelanggaran + 'x</span></p>' +
                  '<p><strong>Nilai Akhir Rapor:</strong> <span class="font-mono font-bold text-emerald-800">' + res.nilaiAkhir + ' (Predikat ' + res.predikat + ')</span></p>' +
                  (catatanTambahan ? '<p class="text-xs text-red-700 mt-1">Catatan: ' + catatanTambahan + '</p>' : '') +
                '</div>',
              confirmButtonColor: '#065f46'
            });
            muatDataMonitoringServer(false);
          } else {
            Swal.fire('Gagal Menyimpan Ujian', (res && res.pesan) || 'Terjadi kesalahan.', 'error');
          }
        })
        .withFailureHandler(function(err) {
          document.getElementById('main-navbar').classList.remove('hidden');
          document.getElementById('panel-lembar-ujian').classList.add('hidden');
          document.getElementById('panel-login-ujian').classList.remove('hidden');
          Swal.fire('Error Server GAS', err.message || String(err), 'error');
        })
        .submitUjianCBT(payload);
    }

    function isiDropdownSantriRapor() {
      const select = document.getElementById('select-santri-rapor');
      if (!select || stateMonitoring.santri.length === 0) return;

      const nilaiSebelumnya = select.value;
      select.innerHTML = stateMonitoring.santri.map(function(s) {
        return '<option value="' + s.nis + '">' + s.nis + ' — ' + s.namaSantri + ' (' + s.unitKelas + ')</option>';
      }).join('');

      if (nilaiSebelumnya) {
        select.value = nilaiSebelumnya;
      }
    }

    function tarikRaporSantriDariServer() {
      const select = document.getElementById('select-santri-rapor');
      const nis    = (select && select.value) ? select.value : 'SNT-202601';

      if (typeof google === 'undefined' || !google.script) return;

      google.script.run
        .withSuccessHandler(function(res) {
          if (!res || !res.sukses) {
            Swal.fire('Gagal Memuat Rapor', (res && res.pesan) || 'Data tidak ditemukan.', 'error');
            return;
          }

          document.getElementById('rapor-nama').textContent    = res.santri.namaSantri;
          document.getElementById('rapor-nis').textContent     = res.santri.nis;
          document.getElementById('rapor-unit').textContent    = res.santri.unitKelas;
          document.getElementById('rapor-tanggal').textContent = res.tanggalCetak;

          const pelanggaran = res.ringkasan.totalPelanggaranCBT || 0;
          document.getElementById('rapor-integritas').textContent =
            pelanggaran === 0 ? '0 Pelanggaran (Jujur & Tertib)' : pelanggaran + 'x Peringatan Sistem';

          const tbody = document.getElementById('tbody-rapor-nilai');
          if (!res.daftarNilai || res.daftarNilai.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="py-6 text-center text-slate-400">Belum ada komponen nilai untuk santri ini.</td></tr>';
          } else {
            tbody.innerHTML = res.daftarNilai.map(function(item, idx) {
              return (
                '<tr>' +
                  '<td class="py-3 px-3 border border-slate-300 font-mono text-xs">' + (idx + 1) + '</td>' +
                  '<td class="py-3 px-4 border border-slate-300 font-semibold text-slate-900">' + item.mapel + '</td>' +
                  '<td class="py-3 px-3 border border-slate-300 text-right font-mono tabular-nums">' + item.nilaiTugasHarian + '</td>' +
                  '<td class="py-3 px-3 border border-slate-300 text-right font-mono tabular-nums">' + item.nilaiSikap + '</td>' +
                  '<td class="py-3 px-3 border border-slate-300 text-right font-mono tabular-nums">' + item.nilaiUjianLisan + '</td>' +
                  '<td class="py-3 px-3 border border-slate-300 text-right font-mono tabular-nums font-semibold">' + item.nilaiCBT + '</td>' +
                  '<td class="py-3 px-4 border border-slate-300 text-right font-mono tabular-nums font-bold text-emerald-900">' + Number(item.nilaiAkhir).toFixed(2) + '</td>' +
                  '<td class="py-3 px-4 border border-slate-300 text-center font-mono font-bold">' + item.predikat + '</td>' +
                '</tr>'
              );
            }).join('');
          }

          document.getElementById('rapor-rata-rata').textContent     = Number(res.ringkasan.rataRataAkhir).toFixed(2);
          document.getElementById('rapor-predikat-umum').textContent = res.ringkasan.predikatUmum;
        })
        .withFailureHandler(function(err) {
          Swal.fire('Error Server', err.message || String(err), 'error');
        })
        .ambilDataRapor(nis);
    }
  </script>
</body>
</html>`;
