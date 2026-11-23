import React, { useEffect, useState } from 'react';

interface DeadlineCountdownVisualProps {
  deadlineIso: string;
  tanggalDeadlineFormat: string;
  sudahLengkap: boolean;
  labelLengkap?: string;
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function parseEndOfDeadlineDayMs(iso: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec((iso || '').trim());
  if (!match) {
    return Date.now() + 2 * ONE_DAY_MS;
  }
  const [, y, m, d] = match;
  return new Date(Number(y), Number(m) - 1, Number(d), 23, 59, 59, 999).getTime();
}

function pad2(n: number): string {
  return String(Math.max(0, Math.floor(n))).padStart(2, '0');
}

export const DeadlineCountdownVisual: React.FC<DeadlineCountdownVisualProps> = ({
  deadlineIso,
  tanggalDeadlineFormat,
  sudahLengkap,
  labelLengkap = 'Tuntas 100%',
}) => {
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  const targetEndMs = parseEndOfDeadlineDayMs(deadlineIso);
  const diffMs = targetEndMs - nowMs;
  const isOverdue = diffMs <= 0;
  const absMs = Math.abs(diffMs);

  const totalSeconds = Math.floor(absMs / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  type UrgencyTone = 'green' | 'yellow' | 'red';
  let tone: UrgencyTone = 'green';
  let statusLabel = 'Aman';

  if (sudahLengkap) {
    tone = 'green';
    statusLabel = labelLengkap;
  } else if (isOverdue) {
    tone = 'red';
    statusLabel = 'Melewati Tenggat';
  } else if (diffMs <= ONE_DAY_MS) {
    tone = 'red';
    statusLabel = 'Mendesak (< 24 Jam)';
  } else if (diffMs <= THREE_DAYS_MS) {
    tone = 'yellow';
    statusLabel = 'Mendekati Tenggat';
  } else {
    tone = 'green';
    statusLabel = 'Waktu Aman';
  }

  // Persentase sisa waktu (skala 7 hari menuju 0%; jika lengkap/lewat = 100% penuh)
  const barPercent = sudahLengkap
    ? 100
    : isOverdue
    ? 100
    : Math.max(6, Math.min(100, Math.round((diffMs / SEVEN_DAYS_MS) * 100)));

  const toneStyles: Record<
    UrgencyTone,
    {
      badge: string;
      chip: string;
      barFill: string;
      trackBg: string;
      dot: string;
    }
  > = {
    green: {
      badge: 'bg-emerald-100 text-emerald-800 border-emerald-300',
      chip: 'bg-emerald-50 text-emerald-900 border-emerald-200',
      barFill: 'fill-emerald-500',
      trackBg: 'fill-emerald-100',
      dot: 'bg-emerald-500',
    },
    yellow: {
      badge: 'bg-amber-100 text-amber-900 border-amber-300',
      chip: 'bg-amber-50 text-amber-950 border-amber-300',
      barFill: 'fill-amber-400',
      trackBg: 'fill-amber-100',
      dot: 'bg-amber-500',
    },
    red: {
      badge: 'bg-red-100 text-red-800 border-red-300',
      chip: 'bg-red-50 text-red-900 border-red-200',
      barFill: 'fill-red-500',
      trackBg: 'fill-red-100',
      dot: 'bg-red-500 animate-pulse',
    },
  };

  const st = toneStyles[tone];

  return (
    <div className="space-y-2 pt-1">
      {/* Baris Countdown Real-Time (Hari : Jam : Menit : Detik) & Status */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full shrink-0 ${st.dot}`} />
          <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${st.badge}`}>
            {statusLabel}
          </span>
          <span className="text-[11px] text-slate-500 font-medium">
            · {tanggalDeadlineFormat} (23:59)
          </span>
        </div>

        {!sudahLengkap && (
          <div
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border font-mono text-[11px] font-extrabold tabular-nums ${st.chip}`}
            aria-live="off"
            title={isOverdue ? 'Waktu keterlambatan sejak tenggat berakhir' : 'Hitung mundur real-time menuju tenggat'}
          >
            <i className={`fa-regular fa-clock text-[10px] ${tone === 'red' ? 'text-red-600' : tone === 'yellow' ? 'text-amber-600' : 'text-emerald-600'}`} />
            {isOverdue && <span className="text-[10px] font-bold uppercase mr-0.5">Lewat</span>}
            <span>{days}h</span>
            <span className="opacity-50">:</span>
            <span>{pad2(hours)}j</span>
            <span className="opacity-50">:</span>
            <span>{pad2(minutes)}m</span>
            <span className="opacity-50">:</span>
            <span>{pad2(seconds)}d</span>
          </div>
        )}
      </div>

      {/* Color-Coded Countdown Bar (Hijau -> Kuning -> Merah) */}
      <div className="space-y-1">
        <svg
          className="w-full h-2.5 rounded-full overflow-hidden block"
          role="progressbar"
          aria-label={`Indikator waktu deadline ${statusLabel}`}
          aria-valuenow={barPercent}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <rect className={st.trackBg} width="100%" height="100%" rx="5" />
          <rect
            className={`${st.barFill} transition-all duration-700 ${tone === 'red' && !sudahLengkap ? 'animate-pulse' : ''}`}
            width={`${barPercent}%`}
            height="100%"
            rx="5"
          />
        </svg>

        <div className="flex items-center justify-between text-[10px] font-mono text-slate-500">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
              &gt;3h Hijau
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />
              1–3h Kuning
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block" />
              &le;24j Merah
            </span>
          </div>
          <span className="font-bold text-slate-600">
            {sudahLengkap ? '100% Selesai' : isOverdue ? '0% Sisa Waktu' : `Sisa ${barPercent}%`}
          </span>
        </div>
      </div>
    </div>
  );
};
