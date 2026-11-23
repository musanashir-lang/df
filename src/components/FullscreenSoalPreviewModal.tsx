import React, { useEffect, useRef, useState } from 'react';

export interface PreviewSoalItem {
  idSoal?: string;
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
}

export type SumberFullscreenPreview = 'draft_import' | 'manual' | 'bank_soal';

interface FullscreenSoalPreviewModalProps {
  isOpen: boolean;
  sumber: SumberFullscreenPreview | null;
  items: PreviewSoalItem[];
  initialIndex?: number;
  unit: string;
  kelas: string;
  mapel: string;
  namaFileImport?: string;
  onClose: () => void;
  onSimpanDraftImport?: () => void;
  onSimpanSoalManual?: () => void;
}

export const FullscreenSoalPreviewModal: React.FC<FullscreenSoalPreviewModalProps> = ({
  isOpen,
  sumber,
  items,
  initialIndex = 0,
  unit,
  kelas,
  mapel,
  namaFileImport,
  onClose,
  onSimpanDraftImport,
  onSimpanSoalManual,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [viewMode, setViewMode] = useState<'simulasi' | 'daftar'>('simulasi');
  const [tampilkanKunci, setTampilkanKunci] = useState(true);
  const [jawabanSimulasi, setJawabanSimulasi] = useState<Record<number, 'A' | 'B' | 'C' | 'D'>>({});
  const [isBrowserFullscreen, setIsBrowserFullscreen] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const clampedIdx = Math.max(0, Math.min(initialIndex, Math.max(0, items.length - 1)));
    setActiveIndex(clampedIdx);
    setViewMode('simulasi');
    setJawabanSimulasi({});
  }, [isOpen, initialIndex, sumber, items.length]);

  useEffect(() => {
    if (!isOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleFsChange = () => {
      setIsBrowserFullscreen(Boolean(document.fullscreenElement));
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (!document.fullscreenElement) {
          onClose();
        }
      } else if (viewMode === 'simulasi' && items.length > 1) {
        if (e.key === 'ArrowRight') {
          setActiveIndex((prev) => Math.min(items.length - 1, prev + 1));
        } else if (e.key === 'ArrowLeft') {
          setActiveIndex((prev) => Math.max(0, prev - 1));
        }
      }
    };

    document.addEventListener('fullscreenchange', handleFsChange);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener('fullscreenchange', handleFsChange);
      window.removeEventListener('keydown', handleKeyDown);
      if (document.fullscreenElement === containerRef.current) {
        document.exitFullscreen().catch(() => {});
      }
    };
  }, [isOpen, viewMode, items.length, onClose]);

  if (!isOpen || !sumber || items.length === 0) return null;

  const safeIndex = Math.max(0, Math.min(activeIndex, items.length - 1));
  const soalAktif = items[safeIndex];

  const handleToggleBrowserFullscreen = async () => {
    try {
      if (!document.fullscreenElement && containerRef.current?.requestFullscreen) {
        await containerRef.current.requestFullscreen();
      } else if (document.fullscreenElement && document.exitFullscreen) {
        await document.exitFullscreen();
      }
    } catch {
      // Di beberapa lingkungan iframe, API native fullscreen dibatasi; overlay tetap layar penuh
    }
  };

  const handleCloseModal = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
    onClose();
  };

  const labelSumber =
    sumber === 'draft_import'
      ? `DRAFT HASIL IMPORT FILE / AI${namaFileImport ? ` · ${namaFileImport}` : ''}`
      : sumber === 'manual'
      ? 'DRAFT INPUT SOAL MANUAL'
      : 'BANK SOAL CBT TERSIMPAN (MANUAL & IMPORT)';

  const badgeSumberClass =
    sumber === 'draft_import'
      ? 'bg-[#FF6700] text-white'
      : sumber === 'manual'
      ? 'bg-sky-500 text-white'
      : 'bg-emerald-600 text-white';

  return (
    <div
      ref={containerRef}
      className="no-print fixed inset-0 z-50 bg-slate-100 flex flex-col w-screen h-screen overflow-hidden"
      role="dialog"
      aria-modal="true"
      aria-label="Preview Fullscreen Hasil Pembuatan Soal CBT"
    >
      {/* Top Bar */}
      <header className="bg-[#0A1172] text-white px-4 sm:px-6 py-3.5 border-b border-white/15 flex flex-wrap items-center justify-between gap-3 shrink-0 shadow-sm">
        <div className="space-y-0.5 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`px-2 py-0.5 text-[10px] font-mono font-bold rounded uppercase ${badgeSumberClass}`}>
              {labelSumber}
            </span>
            <span className="text-[11px] font-mono text-amber-300 font-bold">
              {items.length} Butir Soal
            </span>
          </div>
          <h2 className="text-sm sm:text-base font-bold truncate">
            Preview Fullscreen Soal CBT — {mapel} ({unit} · {kelas})
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {items.length > 1 && (
            <div className="inline-flex rounded-lg bg-white/10 border border-white/20 p-0.5 text-xs font-bold">
              <button
                type="button"
                onClick={() => setViewMode('simulasi')}
                className={`px-3 py-1.5 rounded-md transition-colors cursor-pointer ${
                  viewMode === 'simulasi' ? 'bg-white text-[#0A1172]' : 'text-slate-200 hover:text-white'
                }`}
              >
                <i className="fa-solid fa-desktop mr-1.5" />
                Simulasi CBT
              </button>
              <button
                type="button"
                onClick={() => setViewMode('daftar')}
                className={`px-3 py-1.5 rounded-md transition-colors cursor-pointer ${
                  viewMode === 'daftar' ? 'bg-white text-[#0A1172]' : 'text-slate-200 hover:text-white'
                }`}
              >
                <i className="fa-solid fa-list-ol mr-1.5" />
                Semua Soal ({items.length})
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={() => setTampilkanKunci((v) => !v)}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition-colors cursor-pointer ${
              tampilkanKunci
                ? 'bg-emerald-500/20 border-emerald-400 text-emerald-100 hover:bg-emerald-500/30'
                : 'bg-white/10 border-white/25 text-slate-200 hover:bg-white/20'
            }`}
            title="Sembunyikan atau tampilkan sorotan kunci jawaban"
          >
            <i className={`fa-solid ${tampilkanKunci ? 'fa-eye' : 'fa-eye-slash'} mr-1.5`} />
            {tampilkanKunci ? 'Kunci: Tampil' : 'Kunci: Sembunyi'}
          </button>

          {sumber === 'draft_import' && onSimpanDraftImport && (
            <button
              type="button"
              onClick={() => {
                handleCloseModal();
                onSimpanDraftImport();
              }}
              className="px-3.5 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg cursor-pointer"
            >
              <i className="fa-solid fa-check-double mr-1.5" />
              Simpan ke Bank Soal
            </button>
          )}

          {sumber === 'manual' && onSimpanSoalManual && (
            <button
              type="button"
              onClick={() => {
                handleCloseModal();
                onSimpanSoalManual();
              }}
              className="px-3.5 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg cursor-pointer"
            >
              <i className="fa-solid fa-floppy-disk mr-1.5" />
              Simpan Soal Manual
            </button>
          )}

          <button
            type="button"
            onClick={handleToggleBrowserFullscreen}
            className="px-3 py-1.5 text-xs font-bold text-white bg-white/10 hover:bg-white/20 border border-white/25 rounded-lg cursor-pointer"
            title="Masuk atau keluar dari layar penuh browser"
          >
            <i className={`fa-solid ${isBrowserFullscreen ? 'fa-compress' : 'fa-expand'} mr-1.5 text-[#FF6700]`} />
            {isBrowserFullscreen ? 'Keluar Layar Penuh' : 'Layar Penuh Browser'}
          </button>

          <button
            type="button"
            onClick={handleCloseModal}
            className="px-3.5 py-1.5 text-xs font-bold text-white bg-red-600 hover:bg-red-500 rounded-lg cursor-pointer"
          >
            <i className="fa-solid fa-xmark mr-1.5" />
            Tutup
          </button>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
        {viewMode === 'simulasi' ? (
          <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Kartu Soal Utama */}
            <div
              className={`${
                items.length > 1 ? 'lg:col-span-9' : 'lg:col-span-10 lg:col-start-2'
              } bg-white border border-slate-200 rounded-2xl shadow-sm p-6 sm:p-8 space-y-6`}
            >
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
                <div className="flex items-center gap-2.5">
                  <span className="px-3 py-1 text-xs font-mono font-bold bg-[#0A1172] text-white rounded-lg">
                    SOAL #{safeIndex + 1} / {items.length}
                  </span>
                  {soalAktif.idSoal && (
                    <span className="text-xs font-mono font-semibold text-slate-500">
                      ID: {soalAktif.idSoal}
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="px-2.5 py-1 font-mono font-bold bg-slate-100 border border-slate-200 text-slate-700 rounded-lg">
                    Bobot: {soalAktif.bobotSoal}
                  </span>
                  {tampilkanKunci && soalAktif.kunciJawaban && (
                    <span className="px-2.5 py-1 font-mono font-bold bg-emerald-100 border border-emerald-300 text-emerald-900 rounded-lg">
                      Kunci Jawaban: {soalAktif.kunciJawaban}
                    </span>
                  )}
                </div>
              </div>

              <div className="space-y-5">
                <p className="text-base sm:text-lg font-semibold text-slate-900 leading-relaxed whitespace-pre-line">
                  {soalAktif.pertanyaan || '(Pertanyaan belum diisi)'}
                </p>

                {soalAktif.teksArabSoal && (
                  <div
                    dir="rtl"
                    className="p-5 bg-slate-50 border border-slate-200 rounded-xl text-2xl sm:text-3xl font-arabic text-[#0A1172] leading-loose"
                  >
                    {soalAktif.teksArabSoal}
                  </div>
                )}

                {soalAktif.potonganKodeIT && (
                  <pre className="p-5 bg-slate-900 text-slate-100 rounded-xl text-xs sm:text-sm font-mono overflow-x-auto leading-relaxed">
                    <code>{soalAktif.potonganKodeIT}</code>
                  </pre>
                )}

                {soalAktif.gambarSoalUrl && (
                  <div className="flex justify-center bg-slate-50 border border-slate-200 rounded-xl p-3">
                    <img
                      src={soalAktif.gambarSoalUrl}
                      alt={`Lampiran Soal #${safeIndex + 1}`}
                      className="max-h-[420px] w-auto object-contain rounded-lg"
                    />
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-2">
                  {(
                    [
                      { k: 'A', t: soalAktif.opsiA },
                      { k: 'B', t: soalAktif.opsiB },
                      { k: 'C', t: soalAktif.opsiC },
                      { k: 'D', t: soalAktif.opsiD },
                    ] as const
                  ).map((op) => {
                    const adalahKunci = soalAktif.kunciJawaban === op.k;
                    const dipilihSimulasi = jawabanSimulasi[safeIndex] === op.k;
                    const highlightKunci = tampilkanKunci && adalahKunci;

                    return (
                      <button
                        key={op.k}
                        type="button"
                        onClick={() =>
                          setJawabanSimulasi((prev) => ({
                            ...prev,
                            [safeIndex]: op.k,
                          }))
                        }
                        className={`text-left p-4 rounded-xl border-2 transition-all flex items-start gap-3 cursor-pointer ${
                          highlightKunci
                            ? 'bg-emerald-50 border-emerald-500 text-emerald-950 shadow-xs'
                            : dipilihSimulasi
                            ? 'bg-orange-50 border-[#FF6700] text-slate-900'
                            : 'bg-white border-slate-200 hover:border-[#0A1172]/40 text-slate-800'
                        }`}
                      >
                        <span
                          className={`w-7 h-7 rounded-lg font-mono text-xs font-bold flex items-center justify-center shrink-0 ${
                            highlightKunci
                              ? 'bg-emerald-600 text-white'
                              : dipilihSimulasi
                              ? 'bg-[#FF6700] text-white'
                              : 'bg-slate-200 text-slate-700'
                          }`}
                        >
                          {op.k}
                        </span>
                        <div className="flex-1 space-y-1">
                          <div className="text-sm sm:text-base font-medium leading-snug">
                            {op.t || `(Opsi ${op.k} belum diisi)`}
                          </div>
                          {highlightKunci && (
                            <div className="text-[11px] font-bold text-emerald-700">
                              <i className="fa-solid fa-circle-check mr-1" />
                              Kunci Jawaban Benar
                            </div>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Footer Navigasi Soal */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  disabled={safeIndex === 0}
                  onClick={() => setActiveIndex((prev) => Math.max(0, prev - 1))}
                  className="px-4 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 border border-slate-300 rounded-lg cursor-pointer"
                >
                  <i className="fa-solid fa-arrow-left mr-1.5" />
                  Soal Sebelumnya
                </button>

                <span className="text-xs text-slate-500 font-medium hidden sm:inline">
                  Tips: Gunakan tombol panah keyboard <kbd className="px-1.5 py-0.5 bg-slate-100 border border-slate-300 rounded text-[11px] font-mono">←</kbd>{' '}
                  <kbd className="px-1.5 py-0.5 bg-slate-100 border border-slate-300 rounded text-[11px] font-mono">→</kbd> untuk berpindah soal &amp;{' '}
                  <kbd className="px-1.5 py-0.5 bg-slate-100 border border-slate-300 rounded text-[11px] font-mono">ESC</kbd> untuk menutup.
                </span>

                <button
                  type="button"
                  disabled={safeIndex >= items.length - 1}
                  onClick={() => setActiveIndex((prev) => Math.min(items.length - 1, prev + 1))}
                  className="px-4 py-2 text-xs font-bold text-white bg-[#0A1172] hover:bg-[#0A1172]/90 disabled:opacity-40 rounded-lg cursor-pointer"
                >
                  Soal Berikutnya
                  <i className="fa-solid fa-arrow-right ml-1.5" />
                </button>
              </div>
            </div>

            {/* Peta Nomor Soal (Sidebar Kanan) */}
            {items.length > 1 && (
              <aside className="lg:col-span-3 bg-white border border-slate-200 rounded-2xl shadow-sm p-5 space-y-4">
                <div className="border-b border-slate-200 pb-3">
                  <div className="text-[11px] font-mono font-bold text-[#FF6700] uppercase">
                    NAVIGASI SOAL CBT
                  </div>
                  <h3 className="text-sm font-bold text-[#0A1172]">
                    Peta {items.length} Nomor Soal
                  </h3>
                </div>

                <div className="grid grid-cols-5 gap-2 max-h-[60vh] overflow-y-auto pr-1">
                  {items.map((item, idx) => {
                    const aktif = idx === safeIndex;
                    const sudahDipilih = Boolean(jawabanSimulasi[idx]);
                    return (
                      <button
                        key={item.idSoal || idx}
                        type="button"
                        onClick={() => setActiveIndex(idx)}
                        className={`h-10 rounded-lg font-mono text-xs font-bold border transition-colors cursor-pointer flex flex-col items-center justify-center leading-none ${
                          aktif
                            ? 'bg-[#FF6700] border-[#FF6700] text-white'
                            : sudahDipilih
                            ? 'bg-[#0A1172] border-[#0A1172] text-white'
                            : 'bg-slate-50 border-slate-300 text-slate-700 hover:border-[#0A1172]'
                        }`}
                        title={`Soal #${idx + 1}${tampilkanKunci && item.kunciJawaban ? ` (Kunci: ${item.kunciJawaban})` : ''}`}
                      >
                        <span>{idx + 1}</span>
                        {tampilkanKunci && item.kunciJawaban && (
                          <span className={`text-[9px] mt-0.5 ${aktif || sudahDipilih ? 'text-amber-100' : 'text-emerald-700'}`}>
                            {item.kunciJawaban}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>

                <div className="pt-2 border-t border-slate-200 text-[11px] text-slate-500 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded bg-[#FF6700] inline-block" />
                    <span>Sedang Ditampilkan</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded bg-[#0A1172] inline-block" />
                    <span>Sudah Diuji Klik</span>
                  </div>
                </div>
              </aside>
            )}
          </div>
        ) : (
          /* Mode Daftar Lengkap Semua Soal */
          <div className="max-w-6xl mx-auto space-y-5">
            {items.map((soal, idx) => (
              <div
                key={soal.idSoal || idx}
                className="bg-white border border-slate-200 rounded-2xl shadow-xs p-6 space-y-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-1 text-xs font-mono font-bold bg-[#0A1172] text-white rounded-md">
                      SOAL #{idx + 1}
                    </span>
                    {soal.idSoal && (
                      <span className="text-xs font-mono text-slate-500">{soal.idSoal}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="px-2.5 py-0.5 font-mono font-bold bg-slate-100 border border-slate-200 rounded text-slate-700">
                      Bobot: {soal.bobotSoal}
                    </span>
                    {tampilkanKunci && soal.kunciJawaban && (
                      <span className="px-2.5 py-0.5 font-mono font-bold bg-emerald-100 border border-emerald-300 text-emerald-900 rounded">
                        Kunci: {soal.kunciJawaban}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setActiveIndex(idx);
                        setViewMode('simulasi');
                      }}
                      className="px-2.5 py-0.5 text-[11px] font-bold text-[#0A1172] bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded cursor-pointer"
                    >
                      <i className="fa-solid fa-magnifying-glass mr-1" />
                      Fokus Soal Ini
                    </button>
                  </div>
                </div>

                <p className="text-base font-semibold text-slate-900 leading-relaxed whitespace-pre-line">
                  {soal.pertanyaan}
                </p>

                {soal.teksArabSoal && (
                  <div
                    dir="rtl"
                    className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-2xl font-arabic text-[#0A1172] leading-loose"
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
                    alt={`Lampiran Soal #${idx + 1}`}
                    className="max-h-64 rounded-xl border border-slate-200 object-contain bg-slate-50 p-2"
                  />
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                  {(
                    [
                      { k: 'A', t: soal.opsiA },
                      { k: 'B', t: soal.opsiB },
                      { k: 'C', t: soal.opsiC },
                      { k: 'D', t: soal.opsiD },
                    ] as const
                  ).map((op) => {
                    const highlightKunci = tampilkanKunci && soal.kunciJawaban === op.k;
                    return (
                      <div
                        key={op.k}
                        className={`p-3 rounded-xl border flex items-start gap-2.5 ${
                          highlightKunci
                            ? 'bg-emerald-50 border-emerald-400 text-emerald-950 font-bold'
                            : 'bg-slate-50/70 border-slate-200 text-slate-700'
                        }`}
                      >
                        <span
                          className={`w-6 h-6 rounded-md font-mono text-xs font-bold flex items-center justify-center shrink-0 ${
                            highlightKunci ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-700'
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
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
