import React, { useState } from 'react';
import { BarChart3 } from 'lucide-react';
import { WeeklyDataPoint, StatusDistribution } from '../utils/analytics';

/**
 * 1. Gauge Setengah Lingkaran "Target Bulan Ini"
 */
interface TargetGaugeProps {
  completed: number;
  target: number;
  monthLabel: string;
  onEditTarget?: () => void;
}

export const TargetGauge: React.FC<TargetGaugeProps> = ({
  completed,
  target,
  monthLabel,
  onEditTarget,
}) => {
  const percentage = target > 0 ? Math.round((completed / target) * 100) : 0;
  const radius = 64;
  const strokeWidth = 12;
  const arcLength = Math.PI * radius;
  const cappedPercent = Math.min(Math.max(percentage, 0), 100);
  const strokeDashoffset = arcLength - (arcLength * cappedPercent) / 100;

  const getGaugeColor = (pct: number) => {
    if (pct >= 100) return '#1A9E7A';
    if (pct >= 70) return '#2F6BDE';
    if (pct >= 40) return '#F59E0B';
    return '#E5484D';
  };

  const gaugeColor = getGaugeColor(percentage);

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-5 border border-slate-200/80 dark:border-slate-800 shadow-[0_1px_2px_rgba(15,23,42,0.04)] flex flex-col justify-between h-full">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">
            Target Bulan Ini
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
            Buku selesai ({monthLabel})
          </p>
        </div>
        {onEditTarget && (
          <button
            type="button"
            onClick={onEditTarget}
            className="min-h-[32px] px-2.5 py-1 rounded-lg text-xs font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 transition-colors duration-150 motion-reduce:transition-none shrink-0"
          >
            Ubah
          </button>
        )}
      </div>

      <div className="relative flex flex-col items-center justify-center my-3">
        <svg viewBox="0 0 160 90" className="w-44 h-24 overflow-visible">
          <path
            d="M 16 80 A 64 64 0 0 1 144 80"
            fill="none"
            stroke="currentColor"
            className="text-slate-100 dark:text-slate-800"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />
          <path
            d="M 16 80 A 64 64 0 0 1 144 80"
            fill="none"
            stroke={gaugeColor}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={arcLength}
            strokeDashoffset={strokeDashoffset}
            className="transition-[stroke-dashoffset] duration-150 ease-out motion-reduce:transition-none"
          />
        </svg>

        <div className="absolute bottom-0 flex flex-col items-center">
          <span className="text-3xl font-extrabold tracking-tight tabular-nums text-slate-900 dark:text-white">
            {percentage}%
          </span>
          <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
            {completed} dari target {target} buku
          </span>
        </div>
      </div>

      <div className="mt-2 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs gap-2">
        <span className="text-slate-500 dark:text-slate-400">Capaian:</span>
        <span
          className="font-bold px-2.5 py-0.5 rounded-full text-[11px]"
          style={{
            backgroundColor: `${gaugeColor}18`,
            color: gaugeColor,
          }}
        >
          {percentage >= 100
            ? 'Target Terlampaui'
            : percentage >= 70
            ? 'Sesuai Jalur'
            : percentage >= 40
            ? 'Perlu Dikejar'
            : 'Di Bawah Target'}
        </span>
      </div>
    </div>
  );
};

/**
 * 2. Grafik Batang Mingguan: Buku Masuk vs Buku Selesai Layout
 */
interface WeeklyBarChartProps {
  data: WeeklyDataPoint[];
}

export const WeeklyBarChart: React.FC<WeeklyBarChartProps> = ({ data }) => {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const hasAnyActivity = data.some((d) => d.masuk > 0 || d.selesai > 0);
  const maxValue = Math.max(
    ...data.map((d) => Math.max(d.masuk, d.selesai)),
    4
  );

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-5 border border-slate-200/80 dark:border-slate-800 shadow-[0_1px_2px_rgba(15,23,42,0.04)] flex flex-col justify-between h-full">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
        <div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">
            Aktivitas Mingguan
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Buku Masuk vs Selesai Layout
          </p>
        </div>

        <div className="flex items-center gap-4 text-xs font-medium">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-[#2F6BDE]" />
            <span className="text-slate-600 dark:text-slate-300">Masuk</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-[#1A9E7A]" />
            <span className="text-slate-600 dark:text-slate-300">Selesai</span>
          </div>
        </div>
      </div>

      {!hasAnyActivity ? (
        <div className="flex-1 min-h-[176px] flex flex-col items-center justify-center text-center py-6 px-4 rounded-xl bg-slate-50/80 dark:bg-slate-800/30 border border-dashed border-slate-200 dark:border-slate-800">
          <BarChart3 className="w-6 h-6 text-slate-400 dark:text-slate-500 mb-2" />
          <p className="text-xs sm:text-sm font-semibold text-slate-600 dark:text-slate-300">
            Belum ada aktivitas pada periode ini
          </p>
          <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
            Pilih periode lain atau klik Semua untuk melihat riwayat lengkap.
          </p>
        </div>
      ) : (
        <>
          <div className="w-full h-44 flex items-end justify-between gap-2 pt-6 pb-2 px-1 border-b border-slate-100 dark:border-slate-800">
            {data.map((week, idx) => {
              const masukHeightPct =
                week.masuk > 0 ? Math.max(Math.round((week.masuk / maxValue) * 100), 8) : 0;
              const selesaiHeightPct =
                week.selesai > 0 ? Math.max(Math.round((week.selesai / maxValue) * 100), 8) : 0;
              const isHovered = hoveredIdx === idx;

              return (
                <div
                  key={idx}
                  className="flex-1 flex flex-col items-center justify-end h-full group cursor-pointer"
                  onMouseEnter={() => setHoveredIdx(idx)}
                  onMouseLeave={() => setHoveredIdx(null)}
                >
                  <div className="w-full flex items-end justify-center gap-1.5 sm:gap-2.5 h-full relative">
                    {isHovered && (
                      <div className="absolute -top-8 bg-slate-900 dark:bg-slate-800 text-white text-[10px] py-1 px-2 rounded-md shadow-md whitespace-nowrap z-20 pointer-events-none tabular-nums">
                        Masuk: {week.masuk} · Selesai: {week.selesai}
                      </div>
                    )}

                    {/* Batang Masuk */}
                    <div className="w-3.5 sm:w-5 bg-slate-100 dark:bg-slate-800/70 rounded-t-md relative flex flex-col justify-end h-full">
                      {week.masuk > 0 && (
                        <div
                          className="w-full bg-[#2F6BDE] rounded-t-md transition-[height] duration-150 motion-reduce:transition-none relative flex items-center justify-center"
                          style={{ height: `${masukHeightPct}%` }}
                        >
                          <span className="text-[10px] font-bold text-slate-700 dark:text-slate-200 absolute -top-4 tabular-nums">
                            {week.masuk}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Batang Selesai */}
                    <div className="w-3.5 sm:w-5 bg-slate-100 dark:bg-slate-800/70 rounded-t-md relative flex flex-col justify-end h-full">
                      {week.selesai > 0 && (
                        <div
                          className="w-full bg-[#1A9E7A] rounded-t-md transition-[height] duration-150 motion-reduce:transition-none relative flex items-center justify-center"
                          style={{ height: `${selesaiHeightPct}%` }}
                        >
                          <span className="text-[10px] font-bold text-slate-700 dark:text-slate-200 absolute -top-4 tabular-nums">
                            {week.selesai}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  <span className="text-[10px] sm:text-[11px] font-medium text-slate-500 dark:text-slate-400 mt-2 text-center truncate w-full">
                    {week.label.split(' ')[0]} {week.label.split(' ')[1]}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="flex items-center justify-between text-[11px] text-slate-400 dark:text-slate-500 mt-2">
            <span>Minggu berjalan berdasarkan tanggal terima &amp; selesai</span>
            <span className="tabular-nums font-mono">Maks: {maxValue}</span>
          </div>
        </>
      )}
    </div>
  );
};

/**
 * 3. Donut Chart Komposisi Status Progres dengan Legenda Daftar Vertikal
 */
interface StatusDonutChartProps {
  distribution: StatusDistribution[];
  totalBooks: number;
  onSelectStatus?: (status: string) => void;
}

export const StatusDonutChart: React.FC<StatusDonutChartProps> = ({
  distribution,
  totalBooks,
  onSelectStatus,
}) => {
  const [activeStatus, setActiveStatus] = useState<string | null>(null);

  const nonZeroDistribution = distribution.filter((item) => item.count > 0);
  const size = 164;
  const strokeWidth = 24;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  let accumulatedOffset = 0;

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-5 border border-slate-200/80 dark:border-slate-800 shadow-[0_1px_2px_rgba(15,23,42,0.04)] flex flex-col justify-between">
      <div className="mb-3">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white">
          Komposisi Status Progres
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          {totalBooks} buku · Ketuk status untuk memfilter daftar buku
        </p>
      </div>

      {nonZeroDistribution.length === 0 ? (
        <div className="py-8 text-center text-xs text-slate-400 dark:text-slate-500 rounded-xl bg-slate-50/70 dark:bg-slate-800/30 border border-dashed border-slate-200 dark:border-slate-800">
          Tidak ada distribusi status pada periode ini.
        </div>
      ) : (
        <div className="flex flex-col md:flex-row md:items-center gap-5 md:gap-8 my-1">
          {/* SVG Donut berukuran sedang */}
          <div className="relative shrink-0 flex items-center justify-center self-center">
            <svg width={size} height={size} className="transform -rotate-90">
              <circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke="currentColor"
                className="text-slate-100 dark:text-slate-800"
                strokeWidth={strokeWidth}
              />

              {nonZeroDistribution.map((item) => {
                const strokeDasharray = (item.percentage / 100) * circumference;
                const currentOffset = accumulatedOffset;
                accumulatedOffset += strokeDasharray;
                const isSelected = activeStatus === item.status;

                return (
                  <circle
                    key={item.status}
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    fill="none"
                    stroke={item.color}
                    strokeWidth={isSelected ? strokeWidth + 4 : strokeWidth}
                    strokeDasharray={`${strokeDasharray} ${circumference}`}
                    strokeDashoffset={-currentOffset}
                    className="transition-[stroke-width] duration-150 motion-reduce:transition-none cursor-pointer"
                    onMouseEnter={() => setActiveStatus(item.status)}
                    onMouseLeave={() => setActiveStatus(null)}
                    onClick={() => onSelectStatus?.(item.status)}
                  />
                );
              })}
            </svg>

            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center px-4">
              <span className="text-2xl font-extrabold text-slate-900 dark:text-white tabular-nums">
                {activeStatus
                  ? nonZeroDistribution.find((d) => d.status === activeStatus)?.count || totalBooks
                  : totalBooks}
              </span>
              <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 -mt-0.5 truncate max-w-[90px]">
                {activeStatus || 'Total Buku'}
              </span>
            </div>
          </div>

          {/* Legenda sebagai daftar vertikal di samping donut (di bawah pada HP) */}
          <div className="flex-1 min-w-0 flex flex-col divide-y divide-slate-100 dark:divide-slate-800/70">
            {nonZeroDistribution.map((item) => {
              const isHovered = activeStatus === item.status;
              return (
                <button
                  key={item.status}
                  type="button"
                  onMouseEnter={() => setActiveStatus(item.status)}
                  onMouseLeave={() => setActiveStatus(null)}
                  onClick={() => onSelectStatus?.(item.status)}
                  className={`w-full min-h-[38px] px-2.5 py-1.5 flex items-center justify-between gap-3 text-left transition-colors duration-150 motion-reduce:transition-none first:rounded-t-lg last:rounded-b-lg ${
                    isHovered
                      ? 'bg-slate-100 dark:bg-slate-800'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: item.color }}
                    />
                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 truncate">
                      {item.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 tabular-nums text-xs shrink-0">
                    <span className="font-bold text-slate-900 dark:text-white">
                      {item.count}
                    </span>
                    <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400 w-9 text-right">
                      {item.percentage}%
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
