import React from 'react';
import {
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  TrendingDown,
  BookPlus,
  Clock,
  Receipt,
  CheckCircle2,
  AlertCircle,
  Coins,
  AlertTriangle,
  ChevronDown,
  MessageSquareText,
  Activity,
} from 'lucide-react';
import { ActivityEntry, BookJob, BookLog, KeuanganSubTab, StatusProgresType, TabType } from '../types';
import {
  getAvailableMonths,
  computeDashboardMetrics,
  computeWeeklyComparison,
  computeStatusDistribution,
  computeAttentionItems,
} from '../utils/analytics';
import {
  formatLogDateShort,
  formatRupiah,
  formatRupiahShort,
  getStatusProgresConfig,
} from '../utils/formatters';
import { buildCombinedStatusList } from '../utils/bookHelpers';
import { TargetGauge, WeeklyBarChart, StatusDonutChart } from './DashboardCharts';

interface DashboardTabProps {
  books: BookJob[];
  logs?: BookLog[];
  activity?: ActivityEntry[];
  customStatuses?: string[];
  selectedMonth: string;
  onMonthChange: (monthKey: string) => void;
  monthlyTarget: number;
  onTabChange: (tab: TabType) => void;
  onOpenLogBaru?: () => void;
  onNavigateKeuangan?: (subTab: KeuanganSubTab) => void;
  onOpenSettings: () => void;
  onFilterStatusFromChart?: (status: string) => void;
  onSelectBook?: (book: BookJob) => void;
  onQuickStatusChange?: (book: BookJob, nextStatus: StatusProgresType) => void;
}

export const DashboardTab: React.FC<DashboardTabProps> = ({
  books,
  logs = [],
  activity = [],
  customStatuses = [],
  selectedMonth,
  onMonthChange,
  monthlyTarget,
  onTabChange,
  onOpenLogBaru,
  onNavigateKeuangan,
  onOpenSettings,
  onFilterStatusFromChart,
  onSelectBook,
  onQuickStatusChange,
}) => {
  const availableMonths = getAvailableMonths(books);
  const metrics = computeDashboardMetrics(books, selectedMonth);
  const weeklyData = computeWeeklyComparison(books, selectedMonth);
  const statusDistribution = computeStatusDistribution(
    selectedMonth === 'all'
      ? books
      : books.filter((b) => {
          const tm = b.tglTerima?.substring(0, 7);
          const sm = b.tglSelesaiLayout?.substring(0, 7);
          return tm === selectedMonth || sm === selectedMonth;
        })
  );
  const availableStatuses = buildCombinedStatusList(customStatuses);
  const newLogs = logs
    .filter((l) => l.status === 'Baru')
    .sort((a, b) => {
      const score = (l: BookLog) => {
        let s = 0;
        if (l.dari === 'Penerbit' || l.dari === 'Penulis') s += 2;
        if (l.jenis === 'Masalah') s += 3;
        return s;
      };
      const diff = score(b) - score(a);
      if (diff !== 0) return diff;
      return (b.tanggal || '').localeCompare(a.tanggal || '');
    });
  const bookMapById = new Map<string, BookJob>();
  books.forEach((b) => {
    if (b.id) bookMapById.set(b.id, b);
  });

  const attention = computeAttentionItems(books, 5);

  // Navigasi bulan
  const currentMonthIndex = availableMonths.findIndex((m) => m.key === selectedMonth);
  const isAll = selectedMonth === 'all';
  const currentMonthLabel = isAll
    ? 'Semua Periode'
    : availableMonths[currentMonthIndex]?.label || selectedMonth;

  const handlePrevMonth = () => {
    if (availableMonths.length === 0) return;
    if (isAll) {
      onMonthChange(availableMonths[availableMonths.length - 1].key);
    } else if (currentMonthIndex > 0) {
      onMonthChange(availableMonths[currentMonthIndex - 1].key);
    }
  };

  const handleNextMonth = () => {
    if (availableMonths.length === 0) return;
    if (isAll) {
      onMonthChange(availableMonths[0].key);
    } else if (currentMonthIndex >= 0 && currentMonthIndex < availableMonths.length - 1) {
      onMonthChange(availableMonths[currentMonthIndex + 1].key);
    }
  };

  // Render badge delta HANYA bila ada perbandingan valid (tidak pernah menampilkan 0%)
  const renderDeltaBadge = (delta: number | null) => {
    if (isAll || delta === null || delta === 0) return null;

    if (delta > 0) {
      return (
        <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-[#1A9E7A] bg-emerald-50 dark:bg-emerald-950/50 px-1.5 py-0.5 rounded-md tabular-nums shrink-0">
          <TrendingUp className="w-2.5 h-2.5" />
          <span>+{delta}%</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-[#E5484D] bg-rose-50 dark:bg-rose-950/50 px-1.5 py-0.5 rounded-md tabular-nums shrink-0">
        <TrendingDown className="w-2.5 h-2.5" />
        <span>{delta}%</span>
      </span>
    );
  };

  const goToBukuFilter = (filterKey: string) => {
    onFilterStatusFromChart?.(filterKey);
    onTabChange('buku');
  };

  const goToKeuangan = (subTab: KeuanganSubTab) => {
    if (onNavigateKeuangan) {
      onNavigateKeuangan(subTab);
    } else {
      onTabChange('keuangan');
    }
  };

  return (
    <div className="space-y-5">
      {/* 1. Header 1 Baris (Inline di kanan tanpa kartu terpisah; menumpuk rapi di HP) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-lg sm:text-xl font-extrabold text-slate-900 dark:text-white tracking-tight">
            Dashboard
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Ringkasan {books.length} proyek buku · {currentMonthLabel}
          </p>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="flex items-center flex-1 sm:flex-initial justify-between bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-1 rounded-xl shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
            <button
              type="button"
              onClick={handlePrevMonth}
              disabled={!isAll && currentMonthIndex <= 0}
              className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:pointer-events-none transition-colors duration-150 motion-reduce:transition-none"
              title="Bulan sebelumnya"
              aria-label="Bulan sebelumnya"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-2.5 text-xs font-bold text-slate-800 dark:text-slate-200 whitespace-nowrap text-center min-w-[104px]">
              {isAll ? 'Semua Bulan' : currentMonthLabel}
            </span>
            <button
              type="button"
              onClick={handleNextMonth}
              disabled={!isAll && currentMonthIndex >= availableMonths.length - 1}
              className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:pointer-events-none transition-colors duration-150 motion-reduce:transition-none"
              title="Bulan berikutnya"
              aria-label="Bulan berikutnya"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <button
            type="button"
            onClick={() => onMonthChange('all')}
            className={`min-h-[44px] sm:min-h-[38px] px-3.5 text-xs font-bold rounded-xl transition-colors duration-150 motion-reduce:transition-none border shrink-0 ${
              isAll
                ? 'bg-[#2F6BDE] text-white border-[#2F6BDE]'
                : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200/90 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            Semua
          </button>
        </div>
      </div>

      {/* 2. Strip 6 KPI Ringkas & Dapat Diketuk */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2.5 sm:gap-3">
        {/* KPI 1: Buku Masuk */}
        <button
          type="button"
          onClick={() => goToBukuFilter('Semua')}
          className="text-left bg-white dark:bg-slate-900 rounded-2xl p-3 sm:p-3.5 min-h-[86px] max-h-[96px] border border-slate-200/80 dark:border-slate-800 shadow-[0_1px_2px_rgba(15,23,42,0.04)] hover:border-blue-300 dark:hover:border-blue-800 transition-colors duration-150 motion-reduce:transition-none flex flex-col justify-between"
        >
          <div className="flex items-center justify-between gap-1.5 w-full">
            <div className="flex items-center gap-1.5 min-w-0">
              <BookPlus className="w-3.5 h-3.5 text-[#2F6BDE] shrink-0" />
              <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 truncate">
                Buku Masuk
              </span>
            </div>
            {renderDeltaBadge(metrics.bukuMasukDelta)}
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-xl sm:text-2xl font-extrabold tracking-tight tabular-nums text-slate-900 dark:text-white">
              {metrics.bukuMasuk}
            </span>
            <span className="text-[11px] text-slate-400 font-medium">judul</span>
          </div>
        </button>

        {/* KPI 2: Masih Aktif */}
        <button
          type="button"
          onClick={() => goToBukuFilter('Masih Aktif')}
          className="text-left bg-white dark:bg-slate-900 rounded-2xl p-3 sm:p-3.5 min-h-[86px] max-h-[96px] border border-slate-200/80 dark:border-slate-800 shadow-[0_1px_2px_rgba(15,23,42,0.04)] hover:border-amber-300 dark:hover:border-amber-800 transition-colors duration-150 motion-reduce:transition-none flex flex-col justify-between"
        >
          <div className="flex items-center justify-between gap-1.5 w-full">
            <div className="flex items-center gap-1.5 min-w-0">
              <Clock className="w-3.5 h-3.5 text-[#F59E0B] shrink-0" />
              <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 truncate">
                Masih Aktif
              </span>
            </div>
            {renderDeltaBadge(metrics.masihAktifDelta)}
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-xl sm:text-2xl font-extrabold tracking-tight tabular-nums text-slate-900 dark:text-white">
              {metrics.masihAktif}
            </span>
            <span className="text-[11px] text-slate-400 font-medium">proses</span>
          </div>
        </button>

        {/* KPI 3: Ditagih (Invoice) */}
        <button
          type="button"
          onClick={() => goToKeuangan('ringkasan')}
          className="text-left bg-white dark:bg-slate-900 rounded-2xl p-3 sm:p-3.5 min-h-[86px] max-h-[96px] border border-slate-200/80 dark:border-slate-800 shadow-[0_1px_2px_rgba(15,23,42,0.04)] hover:border-purple-300 dark:hover:border-purple-800 transition-colors duration-150 motion-reduce:transition-none flex flex-col justify-between"
        >
          <div className="flex items-center justify-between gap-1.5 w-full">
            <div className="flex items-center gap-1.5 min-w-0">
              <Receipt className="w-3.5 h-3.5 text-purple-600 shrink-0" />
              <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 truncate">
                Ditagih
              </span>
            </div>
            {renderDeltaBadge(metrics.ditagihDelta)}
          </div>
          <div className="min-w-0 w-full">
            <span className="sm:hidden text-lg font-extrabold tracking-tight tabular-nums text-slate-900 dark:text-white block truncate">
              {formatRupiahShort(metrics.ditagihNominal)}
            </span>
            <span className="hidden sm:block text-sm lg:text-[15px] font-extrabold tracking-tight tabular-nums text-slate-900 dark:text-white truncate">
              {formatRupiah(metrics.ditagihNominal)}
            </span>
          </div>
        </button>

        {/* KPI 4: Dibayar (Lunas) */}
        <button
          type="button"
          onClick={() => goToKeuangan('riwayat')}
          className="text-left bg-white dark:bg-slate-900 rounded-2xl p-3 sm:p-3.5 min-h-[86px] max-h-[96px] border border-slate-200/80 dark:border-slate-800 shadow-[0_1px_2px_rgba(15,23,42,0.04)] hover:border-emerald-300 dark:hover:border-emerald-800 transition-colors duration-150 motion-reduce:transition-none flex flex-col justify-between"
        >
          <div className="flex items-center justify-between gap-1.5 w-full">
            <div className="flex items-center gap-1.5 min-w-0">
              <CheckCircle2 className="w-3.5 h-3.5 text-[#1A9E7A] shrink-0" />
              <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 truncate">
                Dibayar
              </span>
            </div>
            {renderDeltaBadge(metrics.dibayarDelta)}
          </div>
          <div className="min-w-0 w-full">
            <span className="sm:hidden text-lg font-extrabold tracking-tight tabular-nums text-[#1A9E7A] dark:text-emerald-400 block truncate">
              {formatRupiahShort(metrics.dibayarNominal)}
            </span>
            <span className="hidden sm:block text-sm lg:text-[15px] font-extrabold tracking-tight tabular-nums text-[#1A9E7A] dark:text-emerald-400 truncate">
              {formatRupiah(metrics.dibayarNominal)}
            </span>
          </div>
        </button>

        {/* KPI 5: Belum Ditagih */}
        <button
          type="button"
          onClick={() => goToKeuangan('invoice')}
          className="text-left bg-white dark:bg-slate-900 rounded-2xl p-3 sm:p-3.5 min-h-[86px] max-h-[96px] border border-slate-200/80 dark:border-slate-800 shadow-[0_1px_2px_rgba(15,23,42,0.04)] hover:border-rose-300 dark:hover:border-rose-800 transition-colors duration-150 motion-reduce:transition-none flex flex-col justify-between"
        >
          <div className="flex items-center justify-between gap-1.5 w-full">
            <div className="flex items-center gap-1.5 min-w-0">
              <AlertCircle className="w-3.5 h-3.5 text-[#E5484D] shrink-0" />
              <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 truncate">
                Belum Ditagih
              </span>
            </div>
            {renderDeltaBadge(metrics.belumDitagihDelta)}
          </div>
          <div className="min-w-0 w-full">
            <span className="sm:hidden text-lg font-extrabold tracking-tight tabular-nums text-slate-900 dark:text-white block truncate">
              {formatRupiahShort(metrics.belumDitagihNominal)}
            </span>
            <span className="hidden sm:block text-sm lg:text-[15px] font-extrabold tracking-tight tabular-nums text-slate-900 dark:text-white truncate">
              {formatRupiah(metrics.belumDitagihNominal)}
            </span>
          </div>
        </button>

        {/* KPI 6: Siap Ditagih */}
        <button
          type="button"
          onClick={() => goToBukuFilter('Siap Ditagih')}
          className="text-left bg-white dark:bg-slate-900 rounded-2xl p-3 sm:p-3.5 min-h-[86px] max-h-[96px] border border-slate-200/80 dark:border-slate-800 shadow-[0_1px_2px_rgba(15,23,42,0.04)] hover:border-blue-300 dark:hover:border-blue-800 transition-colors duration-150 motion-reduce:transition-none flex flex-col justify-between"
        >
          <div className="flex items-center justify-between gap-1.5 w-full">
            <div className="flex items-center gap-1.5 min-w-0">
              <Coins className="w-3.5 h-3.5 text-[#2F6BDE] shrink-0" />
              <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 truncate">
                Siap Ditagih
              </span>
            </div>
            {renderDeltaBadge(metrics.siapDitagihDelta)}
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-xl sm:text-2xl font-extrabold tracking-tight tabular-nums text-[#2F6BDE] dark:text-blue-400">
              {metrics.siapDitagihCount}
            </span>
            <span className="text-[11px] text-slate-400 font-medium">selesai</span>
          </div>
        </button>
      </div>

      {/* 3. Bagian "Perlu Perhatian" (Action Queue tepat di bawah KPI) */}
      <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-[0_1px_2px_rgba(15,23,42,0.04)] overflow-hidden">
        <div className="px-4 sm:px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <AlertTriangle
              className={`w-4 h-4 shrink-0 ${
                attention.totalCount > 0 ? 'text-amber-500' : 'text-[#1A9E7A]'
              }`}
            />
            <h2 className="text-sm font-bold text-slate-900 dark:text-white truncate">
              Perlu Perhatian
            </h2>
            {attention.totalCount > 0 && (
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400 tabular-nums">
                ({attention.totalCount})
              </span>
            )}
          </div>

          {attention.totalCount > 0 && (
            <button
              type="button"
              onClick={() => goToBukuFilter('Perlu Perhatian')}
              className="text-xs font-bold text-[#2F6BDE] dark:text-blue-400 hover:underline shrink-0"
            >
              Lihat semua
            </button>
          )}
        </div>

        {newLogs.length > 0 && (
          <div className="px-4 sm:px-5 py-3 bg-orange-50/70 dark:bg-orange-950/25 border-b border-orange-100 dark:border-orange-900/50 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-extrabold text-orange-800 dark:text-orange-200">
                <MessageSquareText className="w-4 h-4 text-orange-600 dark:text-orange-400" />
                <span>Catatan Baru ({newLogs.length})</span>
              </div>
              <button
                type="button"
                onClick={() => (onOpenLogBaru ? onOpenLogBaru() : onTabChange('log'))}
                className="text-xs font-bold text-orange-700 dark:text-orange-300 hover:underline"
              >
                Buka Log Baru &rarr;
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              {newLogs.slice(0, 3).map((l) => {
                const bk = bookMapById.get(l.bookId);
                return (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() => {
                      if (bk && onSelectBook) onSelectBook(bk);
                      else onOpenLogBaru?.();
                    }}
                    className="text-left p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-orange-200/80 dark:border-orange-800/60 hover:border-orange-400 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-1.5 text-[10px] font-bold">
                      <span className="text-blue-600 dark:text-blue-400 truncate">
                        #{l.bookNo} {bk?.judul || ''}
                      </span>
                      <span className="text-slate-400 shrink-0">
                        {formatLogDateShort(l.tanggal)}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-700 dark:text-slate-300 line-clamp-1 mt-0.5">
                      <strong>{l.dari}</strong> ({l.jenis}): {l.isi}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {attention.items.length === 0 ? (
          newLogs.length === 0 ? (
            <div className="px-4 sm:px-5 py-5 flex items-center gap-3 text-xs sm:text-sm text-emerald-700 dark:text-emerald-300 bg-emerald-50/40 dark:bg-emerald-950/20">
              <CheckCircle2 className="w-4 h-4 text-[#1A9E7A] shrink-0" />
              <span className="font-semibold">
                Semua beres — tidak ada buku stuck, piutang tertunggak, atau catatan tertunda saat ini.
              </span>
            </div>
          ) : null
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {attention.items.map((item) => {
              const { book, reason, reasonLabel, metricLabel } = item;
              const statusCfg = getStatusProgresConfig(book.statusProgres);

              const reasonTextClass =
                reason === 'stuck'
                  ? 'text-[#E5484D] bg-rose-50 dark:bg-rose-950/40'
                  : reason === 'siap_ditagih'
                  ? 'text-[#2F6BDE] bg-blue-50 dark:bg-blue-950/40'
                  : reason === 'piutang'
                  ? 'text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40'
                  : 'text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800';

              return (
                <div
                  key={book.id || `att-${book.no}`}
                  onClick={() => onSelectBook?.(book)}
                  className="px-4 sm:px-5 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-4 hover:bg-slate-50/80 dark:hover:bg-slate-800/40 cursor-pointer transition-colors duration-150 motion-reduce:transition-none"
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <span className="text-[11px] font-mono font-bold text-slate-400 dark:text-slate-500 tabular-nums shrink-0">
                      #{book.no}
                    </span>
                    <span className="text-xs sm:text-sm font-semibold text-slate-900 dark:text-white truncate min-w-0 flex-1">
                      {book.judul}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-md text-[10px] font-bold shrink-0 ${reasonTextClass}`}
                    >
                      {reasonLabel}
                    </span>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                    <span className="text-xs font-bold tabular-nums text-slate-700 dark:text-slate-300 whitespace-nowrap">
                      {metricLabel}
                    </span>

                    {/* Ganti status cepat satu ketukan langsung dari baris Perlu Perhatian */}
                    <div
                      className="relative"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <select
                        aria-label={`Ubah status ${book.judul}`}
                        value={book.statusProgres}
                        onChange={(e) =>
                          onQuickStatusChange?.(book, e.target.value as StatusProgresType)
                        }
                        className={`min-h-[36px] appearance-none pl-2.5 pr-7 py-1 rounded-lg text-[11px] font-bold border cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 ${statusCfg.bg} ${statusCfg.text} ${statusCfg.border}`}
                      >
                        {availableStatuses.map((st) => (
                          <option
                            key={st}
                            value={st}
                            className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                          >
                            {st}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="w-3.5 h-3.5 opacity-70 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* 4. Grid Analitik 12 Kolom: Target (4 col) & Aktivitas Mingguan (8 col) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-4">
          <TargetGauge
            completed={metrics.selesaiCount}
            target={monthlyTarget}
            monthLabel={currentMonthLabel}
            onEditTarget={onOpenSettings}
          />
        </div>

        <div className="lg:col-span-8">
          <WeeklyBarChart data={weeklyData} />
        </div>
      </div>

      {/* 5. Donut Komposisi Status Progres dengan daftar legenda vertikal */}
      <StatusDonutChart
        distribution={statusDistribution}
        totalBooks={statusDistribution.reduce((acc, curr) => acc + curr.count, 0)}
        onSelectStatus={(status) => goToBukuFilter(status)}
      />

      {/* 6. Panel Aktivitas Terbaru */}
      {activity.length > 0 && (
        <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-[0_1px_2px_rgba(15,23,42,0.04)] overflow-hidden">
          <div className="px-4 sm:px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2">
            <Activity className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">
              Aktivitas Terbaru
            </h2>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {activity.slice(0, 8).map((act) => {
              const dateIso =
                typeof act.createdAt === 'string'
                  ? act.createdAt.slice(0, 10)
                  : null;
              return (
                <div
                  key={act.id}
                  className="px-4 sm:px-5 py-2.5 flex items-start justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
                      {act.title}
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                      {act.detail}
                    </p>
                  </div>
                  <span className="text-[10px] font-semibold text-slate-400 shrink-0 mt-0.5">
                    {formatLogDateShort(dateIso)}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
};
