import React, { useState, useMemo } from 'react';
import {
  Printer,
  Copy,
  Check,
  Search,
  Receipt,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  ChevronRight,
} from 'lucide-react';
import { ActivityEntry, BookJob, BookLog } from '../types';
import { getAvailableMonths, MonthOption } from '../utils/analytics';
import { formatRupiah, formatDateIndo, getMonthNameIndo } from '../utils/formatters';
import {
  CompletionDateResolveOptions,
  InvoiceGroup,
  bookMatchesMonthFilter,
  bookMatchesSearchFilter,
  buildInvoiceHistorySections,
  groupMatchesMonthFilter,
  groupMatchesSearchFilter,
  isBookCompletedStatus,
  resolveBookCompletionDate,
} from '../utils/invoiceHistoryHelpers';

interface RiwayatInvoiceTabProps {
  books: BookJob[];
  onSelectBook?: (book: BookJob) => void;
  onGoToInvoiceTab?: (bookId: number) => void;
  hideNominals?: boolean;
  activity?: ActivityEntry[];
  logs?: BookLog[];
  statusSelesai?: string;
}

type RiwayatStatusFilter = 'Semua' | 'Belum Ditagih' | 'Belum Dibayar' | 'Lunas';

const FILTER_OPTIONS: readonly RiwayatStatusFilter[] = [
  'Semua',
  'Belum Ditagih',
  'Belum Dibayar',
  'Lunas',
] as const;

export const RiwayatInvoiceTab: React.FC<RiwayatInvoiceTabProps> = ({
  books,
  onSelectBook,
  hideNominals = true,
  activity,
  logs,
  statusSelesai,
}) => {
  const [selectedMonth, setSelectedMonth] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<RiwayatStatusFilter>('Semua');
  const [searchQuery, setSearchQuery] = useState('');
  const [copied, setCopied] = useState(false);
  const [isMissingDateExpanded, setIsMissingDateExpanded] = useState(false);

  const completionDateOptions = useMemo<CompletionDateResolveOptions>(
    () => ({ activity, logs, statusSelesai }),
    [activity, logs, statusSelesai]
  );

  // Hanya buku berstatus "Selesai" / "Finish" yang tampil di riwayat invoice
  const finishedBooks = useMemo(() => {
    return books.filter((b) => isBookCompletedStatus(b.statusProgres, statusSelesai));
  }, [books, statusSelesai]);

  const booksWithoutCompletionDate = useMemo(() => {
    return finishedBooks.filter(
      (b) => !resolveBookCompletionDate(b, completionDateOptions)
    );
  }, [finishedBooks, completionDateOptions]);

  const monthOptions = useMemo(() => {
    const base = getAvailableMonths(finishedBooks);
    const monthMap = new Map<string, MonthOption>(base.map((m) => [m.key, m]));
    finishedBooks.forEach((b) => {
      const compDate = resolveBookCompletionDate(b, completionDateOptions);
      if (compDate && /^\d{4}-\d{2}/.test(compDate)) {
        const key = compDate.substring(0, 7);
        if (!monthMap.has(key)) {
          const year = parseInt(key.substring(0, 4), 10);
          const month = parseInt(key.substring(5, 7), 10);
          if (year >= 2000 && month >= 1 && month <= 12) {
            monthMap.set(key, {
              key,
              label: `${getMonthNameIndo(month - 1)} ${year}`,
              year,
              month,
            });
          }
        }
      }
    });
    return Array.from(monthMap.values()).sort((a, b) => a.key.localeCompare(b.key));
  }, [finishedBooks, completionDateOptions]);

  // Pengelompokan utama berdasarkan nomor invoice yang sudah tersimpan di data
  const sections = useMemo(() => {
    return buildInvoiceHistorySections(finishedBooks, completionDateOptions);
  }, [finishedBooks, completionDateOptions]);

  // Terapkan filter periode bulan & pencarian (tanpa statusFilter, agar semua 5 kartu ringkasan tetap akurat)
  const periodAndSearchFiltered = useMemo(() => {
    const belumDitagih = sections.belumDitagih.filter(
      (b) =>
        bookMatchesMonthFilter(b, selectedMonth, completionDateOptions) &&
        bookMatchesSearchFilter(b, searchQuery)
    );
    const belumDibayar = sections.belumDibayar.filter(
      (g) =>
        groupMatchesMonthFilter(g, selectedMonth, completionDateOptions) &&
        groupMatchesSearchFilter(g, searchQuery)
    );
    const lunas = sections.lunas.filter(
      (g) =>
        groupMatchesMonthFilter(g, selectedMonth, completionDateOptions) &&
        groupMatchesSearchFilter(g, searchQuery)
    );
    return { belumDitagih, belumDibayar, lunas };
  }, [sections, selectedMonth, searchQuery, completionDateOptions]);

  // Hitungan untuk 5 kartu ringkasan berurutan:
  // 1. Buku Selesai, 2. Total Nilai Jasa, 3. Belum Ditagih, 4. Belum Dibayar, 5. Lunas
  const summaryStats = useMemo(() => {
    const belumDitagihCount = periodAndSearchFiltered.belumDitagih.length;
    const belumDitagihNominal = periodAndSearchFiltered.belumDitagih.reduce(
      (sum, b) => sum + (b.nilaiJasa || 0),
      0
    );

    const belumDibayarInvoiceCount = periodAndSearchFiltered.belumDibayar.length;
    const belumDibayarBookCount = periodAndSearchFiltered.belumDibayar.reduce(
      (sum, g) => sum + g.books.length,
      0
    );
    const belumDibayarNominal = periodAndSearchFiltered.belumDibayar.reduce(
      (sum, g) => sum + g.totalTagihan,
      0
    );

    const lunasInvoiceCount = periodAndSearchFiltered.lunas.length;
    const lunasBookCount = periodAndSearchFiltered.lunas.reduce(
      (sum, g) => sum + g.books.length,
      0
    );
    const lunasNominal = periodAndSearchFiltered.lunas.reduce(
      (sum, g) => sum + g.totalTagihan,
      0
    );

    const bukuSelesaiCount = belumDitagihCount + belumDibayarBookCount + lunasBookCount;
    const totalNilaiJasa = belumDitagihNominal + belumDibayarNominal + lunasNominal;

    return {
      bukuSelesaiCount,
      totalNilaiJasa,
      belumDitagihCount,
      belumDitagihNominal,
      belumDibayarInvoiceCount,
      belumDibayarBookCount,
      belumDibayarNominal,
      lunasInvoiceCount,
      lunasBookCount,
      lunasNominal,
    };
  }, [periodAndSearchFiltered]);

  const monthLabel =
    selectedMonth === 'all'
      ? 'Semua Periode'
      : monthOptions.find((m) => m.key === selectedMonth)?.label || selectedMonth;

  const renderNominal = (amount: number): React.ReactNode => {
    if (!hideNominals) {
      return formatRupiah(amount);
    }
    return (
      <>
        <span className="print:hidden">Rp •••••</span>
        <span className="hidden print:inline">{formatRupiah(amount)}</span>
      </>
    );
  };

  const handlePrint = () => {
    const isDarkActive = document.documentElement.classList.contains('dark');
    if (isDarkActive) {
      document.documentElement.classList.remove('dark');
    }

    setTimeout(() => {
      window.print();
      if (isDarkActive) {
        document.documentElement.classList.add('dark');
      }
    }, 80);
  };

  const handleCopyWhatsApp = () => {
    const showBelumDitagih = statusFilter === 'Semua' || statusFilter === 'Belum Ditagih';
    const showBelumDibayar = statusFilter === 'Semua' || statusFilter === 'Belum Dibayar';
    const showLunas = statusFilter === 'Semua' || statusFilter === 'Lunas';

    const formatInvoiceGroupWA = (group: InvoiceGroup, idx: number): string[] => {
      const lines = [
        `${idx + 1}. *${group.invoiceNo}* | Tgl Inv: ${formatDateIndo(group.tglInvoice)} | *${formatRupiah(group.totalTagihan)}* [${group.status}]${group.status === 'Lunas' && group.tglDibayar ? ` (Bayar: ${formatDateIndo(group.tglDibayar)})` : ''}`,
      ];
      group.books.forEach((b) => {
        lines.push(
          `   - ${b.judul} (${b.penulis}, ${b.halamanFinal || b.halamanAwal} hlm.)`
        );
      });
      return lines;
    };

    const textLines: string[] = [
      `📑 *REKAP RIWAYAT INVOICE BUKU SELESAI*`,
      `*Periode:* ${monthLabel}`,
      `────────────────────────`,
      `📊 *RINGKASAN:*`,
      `• Buku Selesai: *${summaryStats.bukuSelesaiCount} buku*`,
      `• Total Nilai Jasa: *${formatRupiah(summaryStats.totalNilaiJasa)}*`,
      `• Belum Ditagih: *${formatRupiah(summaryStats.belumDitagihNominal)}* (${summaryStats.belumDitagihCount} buku)`,
      `• Belum Dibayar: *${formatRupiah(summaryStats.belumDibayarNominal)}* (${summaryStats.belumDibayarInvoiceCount} invoice / ${summaryStats.belumDibayarBookCount} buku)`,
      `• Lunas: *${formatRupiah(summaryStats.lunasNominal)}* (${summaryStats.lunasInvoiceCount} invoice / ${summaryStats.lunasBookCount} buku)`,
    ];

    if (showBelumDitagih) {
      textLines.push(`────────────────────────`);
      textLines.push(`📝 *BELUM DITAGIH (${periodAndSearchFiltered.belumDitagih.length})*`);
      if (periodAndSearchFiltered.belumDitagih.length === 0) {
        textLines.push(`Tidak ada buku belum ditagih.`);
      } else {
        periodAndSearchFiltered.belumDitagih.forEach((b, idx) => {
          textLines.push(
            `${idx + 1}. *${b.judul}* — ${b.penulis} | Selesai: ${formatDateIndo(resolveBookCompletionDate(b, completionDateOptions))} | *${formatRupiah(b.nilaiJasa)}*`
          );
        });
      }
    }

    if (showBelumDibayar) {
      textLines.push(`────────────────────────`);
      textLines.push(`⏳ *BELUM DIBAYAR (${periodAndSearchFiltered.belumDibayar.length})*`);
      if (periodAndSearchFiltered.belumDibayar.length === 0) {
        textLines.push(`Tidak ada invoice belum dibayar.`);
      } else {
        periodAndSearchFiltered.belumDibayar.forEach((g, idx) => {
          textLines.push(...formatInvoiceGroupWA(g, idx));
        });
      }
    }

    if (showLunas) {
      textLines.push(`────────────────────────`);
      textLines.push(`✅ *LUNAS (${periodAndSearchFiltered.lunas.length})*`);
      if (periodAndSearchFiltered.lunas.length === 0) {
        textLines.push(`Tidak ada invoice lunas.`);
      } else {
        periodAndSearchFiltered.lunas.forEach((g, idx) => {
          textLines.push(...formatInvoiceGroupWA(g, idx));
        });
      }
    }

    navigator.clipboard.writeText(textLines.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const renderInvoiceSection = (
    title: string,
    groups: InvoiceGroup[],
    sectionTotalNominal: number,
    emptyText: string,
    accent: 'amber' | 'emerald'
  ) => {
    const statusBadgeClass =
      accent === 'emerald'
        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
        : 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300';

    return (
      <section className="space-y-3">
        <div className="print-avoid-break-after flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-200 dark:border-slate-700">
          <h3 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white">
            {title} ({groups.length})
          </h3>
          <span className="text-xs font-bold text-slate-600 dark:text-slate-300 tabular-nums">
            Total: {renderNominal(sectionTotalNominal)}
          </span>
        </div>

        {groups.length === 0 ? (
          <div className="p-5 text-center text-xs text-slate-400 dark:text-slate-500 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200/80 dark:border-slate-800">
            {emptyText}
          </div>
        ) : (
          <>
            {/* Tabel Desktop & Cetak A4 (tanpa scroll horizontal, sel digabung per invoice) */}
            <div className="hidden lg:block print:block">
              <table className="w-full text-left text-xs border-collapse border border-slate-200 dark:border-slate-700">
                <thead>
                  <tr className="bg-slate-100 dark:bg-slate-800/90 text-[11px] font-bold text-slate-700 dark:text-slate-200">
                    <th className="py-2.5 px-2.5 text-center border border-slate-200 dark:border-slate-700 w-10">
                      No
                    </th>
                    <th className="py-2.5 px-2.5 border border-slate-200 dark:border-slate-700 whitespace-nowrap">
                      Nomor Invoice
                    </th>
                    <th className="py-2.5 px-2.5 text-center border border-slate-200 dark:border-slate-700 whitespace-nowrap">
                      Tanggal Invoice
                    </th>
                    <th className="py-2.5 px-2.5 border border-slate-200 dark:border-slate-700">
                      Judul Buku
                    </th>
                    <th className="py-2.5 px-2.5 border border-slate-200 dark:border-slate-700">
                      Penulis
                    </th>
                    <th className="py-2.5 px-2 text-center border border-slate-200 dark:border-slate-700 whitespace-nowrap w-14">
                      Hlm
                    </th>
                    <th className="py-2.5 px-2.5 text-right border border-slate-200 dark:border-slate-700 whitespace-nowrap">
                      Jumlah Tagihan
                    </th>
                    <th className="py-2.5 px-2.5 text-center border border-slate-200 dark:border-slate-700 whitespace-nowrap">
                      Status
                    </th>
                    <th className="py-2.5 px-2.5 text-center border border-slate-200 dark:border-slate-700 whitespace-nowrap">
                      Tgl Bayar
                    </th>
                  </tr>
                </thead>
                {groups.map((group, groupIdx) => {
                  const rowCount = group.books.length;
                  const groupBg =
                    groupIdx % 2 === 1
                      ? 'bg-slate-50/70 dark:bg-slate-800/30'
                      : 'bg-white dark:bg-slate-900';

                  return (
                    <tbody key={group.groupKey} className="print-avoid-break">
                      {group.books.map((book, bookIdx) => {
                        const hlm = book.halamanFinal || book.halamanAwal || 0;
                        return (
                          <tr
                            key={`${group.groupKey}-${book.id || book.no}-${bookIdx}`}
                            className={`${groupBg} align-top print-avoid-break`}
                          >
                            {bookIdx === 0 && (
                              <>
                                <td
                                  rowSpan={rowCount}
                                  className="py-2.5 px-2.5 text-center font-bold text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 align-top"
                                >
                                  {groupIdx + 1}
                                </td>
                                <td
                                  rowSpan={rowCount}
                                  className="py-2.5 px-2.5 font-mono text-[11px] font-bold text-slate-900 dark:text-slate-100 whitespace-nowrap border border-slate-200 dark:border-slate-700 align-top"
                                >
                                  {group.invoiceNo}
                                </td>
                                <td
                                  rowSpan={rowCount}
                                  className="py-2.5 px-2.5 text-center text-slate-600 dark:text-slate-300 whitespace-nowrap border border-slate-200 dark:border-slate-700 align-top"
                                >
                                  {formatDateIndo(group.tglInvoice)}
                                </td>
                              </>
                            )}

                            <td className="py-2.5 px-2.5 font-semibold text-slate-900 dark:text-slate-100 whitespace-normal break-words border border-slate-200 dark:border-slate-700">
                              {book.judul}
                            </td>

                            <td className="py-2.5 px-2.5 text-slate-600 dark:text-slate-300 whitespace-normal break-words border border-slate-200 dark:border-slate-700">
                              {book.penulis}
                            </td>

                            <td className="py-2.5 px-2 text-center text-slate-700 dark:text-slate-300 tabular-nums whitespace-nowrap border border-slate-200 dark:border-slate-700">
                              {hlm}
                            </td>

                            {bookIdx === 0 && (
                              <>
                                <td
                                  rowSpan={rowCount}
                                  className="py-2.5 px-2.5 text-right font-extrabold text-slate-900 dark:text-white tabular-nums whitespace-nowrap border border-slate-200 dark:border-slate-700 align-top"
                                >
                                  {renderNominal(group.totalTagihan)}
                                </td>
                                <td
                                  rowSpan={rowCount}
                                  className="py-2.5 px-2.5 text-center whitespace-nowrap border border-slate-200 dark:border-slate-700 align-top"
                                >
                                  <span
                                    className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${statusBadgeClass}`}
                                  >
                                    {group.status}
                                  </span>
                                </td>
                                <td
                                  rowSpan={rowCount}
                                  className="py-2.5 px-2.5 text-center text-slate-600 dark:text-slate-300 whitespace-nowrap border border-slate-200 dark:border-slate-700 align-top"
                                >
                                  {formatDateIndo(group.tglDibayar)}
                                </td>
                              </>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  );
                })}
              </table>
            </div>

            {/* Kartu Bersusun HP & Tablet (tanpa scroll horizontal) */}
            <div className="lg:hidden print:hidden space-y-3">
              {groups.map((group, groupIdx) => (
                <div
                  key={`card-${group.groupKey}`}
                  className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/80 p-3.5 space-y-2.5"
                >
                  <div className="flex items-start justify-between gap-2 pb-2 border-b border-slate-100 dark:border-slate-800">
                    <div className="space-y-0.5 min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[11px] font-bold text-slate-400 tabular-nums">
                          #{groupIdx + 1}
                        </span>
                        <span className="font-mono text-xs font-extrabold text-slate-900 dark:text-white whitespace-nowrap">
                          {group.invoiceNo}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                        <span>Tgl Invoice: {formatDateIndo(group.tglInvoice)}</span>
                        {group.tglDibayar && (
                          <span>Tgl Bayar: {formatDateIndo(group.tglDibayar)}</span>
                        )}
                      </div>
                    </div>

                    <span
                      className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold shrink-0 ${statusBadgeClass}`}
                    >
                      {group.status}
                    </span>
                  </div>

                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {group.books.map((book, bIdx) => (
                      <div
                        key={`card-book-${group.groupKey}-${book.id || book.no}-${bIdx}`}
                        className="py-2 first:pt-0 last:pb-0 space-y-0.5"
                      >
                        <div className="text-xs font-bold text-slate-900 dark:text-slate-100 whitespace-normal break-words">
                          {book.judul}
                        </div>
                        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                          <span className="whitespace-normal break-words">{book.penulis}</span>
                          <span className="font-semibold text-slate-700 dark:text-slate-300 tabular-nums shrink-0">
                            {book.halamanFinal || book.halamanAwal || 0} hlm.
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                      Jumlah Tagihan ({group.books.length} buku)
                    </span>
                    <span className="text-sm font-extrabold text-slate-900 dark:text-white tabular-nums">
                      {renderNominal(group.totalTagihan)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </section>
    );
  };

  const showBelumDitagihSection =
    statusFilter === 'Semua' || statusFilter === 'Belum Ditagih';
  const showBelumDibayarSection =
    statusFilter === 'Semua' || statusFilter === 'Belum Dibayar';
  const showLunasSection = statusFilter === 'Semua' || statusFilter === 'Lunas';

  return (
    <div className="space-y-6">
      {/* 1. Header Filter, Pencarian, & 5 Kartu Ringkasan (Disembunyikan saat cetak) */}
      <div className="no-print bg-white dark:bg-slate-900 rounded-3xl p-4 sm:p-6 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Receipt className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              <span>Data Riwayat Invoice Buku Selesai</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Dikelompokkan berdasarkan nomor invoice tersimpan dan buku selesai yang belum ditagih.
            </p>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
            <button
              type="button"
              onClick={handleCopyWhatsApp}
              className="min-h-[44px] sm:min-h-[38px] px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors flex items-center gap-1.5"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="text-emerald-600 dark:text-emerald-400">Tersalin!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Salin Rekap WA</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handlePrint}
              className="min-h-[44px] sm:min-h-[38px] px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-all flex items-center gap-2 shadow-sm"
            >
              <Printer className="w-4 h-4" />
              <span>Cetak Rekap A4</span>
            </button>
          </div>
        </div>

        {/* Kontrol Cari, Periode Bulan, dan Filter Status */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
          {/* Kolom Cari */}
          <div className="relative lg:col-span-4">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari judul, penulis, nomor invoice..."
              className="w-full min-h-[44px] sm:min-h-[38px] pl-9 pr-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-base sm:text-xs text-slate-900 dark:text-white border-none focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* Filter Periode Bulan */}
          <div className="lg:col-span-3">
            <select
              aria-label="Filter periode bulan"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="w-full min-h-[44px] sm:min-h-[38px] py-2 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100 text-base sm:text-xs font-bold border-none focus:outline-none cursor-pointer"
            >
              <option value="all">Semua Periode Bulan</option>
              {monthOptions.map((m) => (
                <option key={m.key} value={m.key}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>

          {/* Tombol Filter Berurutan: Semua, Belum Ditagih, Belum Dibayar, Lunas */}
          <div className="lg:col-span-5 grid grid-cols-2 sm:grid-cols-4 gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
            {FILTER_OPTIONS.map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`min-h-[38px] sm:min-h-[30px] px-2 py-1 text-[11px] font-bold rounded-lg transition-colors whitespace-nowrap ${
                  statusFilter === st
                    ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {st}
              </button>
            ))}
          </div>
        </div>

        {/* 5 Kartu Ringkasan Berurutan:
            Buku Selesai | Total Nilai Jasa | Belum Ditagih | Belum Dibayar | Lunas */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 pt-1">
          <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-200/70 dark:border-slate-800">
            <span className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider block">
              Buku Selesai
            </span>
            <span className="text-lg sm:text-xl font-extrabold text-slate-900 dark:text-white tabular-nums mt-0.5 block">
              {summaryStats.bukuSelesaiCount} buku
            </span>
          </div>

          <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-200/70 dark:border-slate-800">
            <span className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider block">
              Total Nilai Jasa
            </span>
            <span className="text-lg sm:text-xl font-extrabold text-blue-600 dark:text-blue-400 tabular-nums mt-0.5 block">
              {renderNominal(summaryStats.totalNilaiJasa)}
            </span>
          </div>

          <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700">
            <span className="text-[10px] text-slate-600 dark:text-slate-300 font-bold uppercase tracking-wider block">
              Belum Ditagih ({summaryStats.belumDitagihCount} buku)
            </span>
            <span className="text-lg sm:text-xl font-extrabold text-slate-800 dark:text-slate-100 tabular-nums mt-0.5 block">
              {renderNominal(summaryStats.belumDitagihNominal)}
            </span>
          </div>

          <div className="p-3 bg-amber-50/60 dark:bg-amber-950/20 rounded-2xl border border-amber-200/80 dark:border-amber-900/40">
            <span className="text-[10px] text-amber-800 dark:text-amber-400 font-bold uppercase tracking-wider block">
              Belum Dibayar ({summaryStats.belumDibayarInvoiceCount} inv)
            </span>
            <span className="text-lg sm:text-xl font-extrabold text-[#F59E0B] dark:text-amber-400 tabular-nums mt-0.5 block">
              {renderNominal(summaryStats.belumDibayarNominal)}
            </span>
            <span className="text-[10px] text-amber-700/80 dark:text-amber-300/70 block mt-0.5">
              {summaryStats.belumDibayarBookCount} buku
            </span>
          </div>

          <div className="col-span-2 sm:col-span-1 p-3 bg-emerald-50/60 dark:bg-emerald-950/20 rounded-2xl border border-emerald-200/80 dark:border-emerald-900/40">
            <span className="text-[10px] text-emerald-800 dark:text-emerald-400 font-bold uppercase tracking-wider block">
              Lunas ({summaryStats.lunasInvoiceCount} inv)
            </span>
            <span className="text-lg sm:text-xl font-extrabold text-[#1A9E7A] dark:text-emerald-400 tabular-nums mt-0.5 block">
              {renderNominal(summaryStats.lunasNominal)}
            </span>
            <span className="text-[10px] text-emerald-700/80 dark:text-emerald-300/70 block mt-0.5">
              {summaryStats.lunasBookCount} buku
            </span>
          </div>
        </div>
      </div>

      {/* Peringatan buku selesai yang belum punya tanggal selesai (sembunyi jika N = 0) */}
      {booksWithoutCompletionDate.length > 0 && (
        <div className="no-print print:hidden rounded-2xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/70 dark:bg-amber-950/25 overflow-hidden">
          <button
            type="button"
            onClick={() => setIsMissingDateExpanded((prev) => !prev)}
            aria-expanded={isMissingDateExpanded}
            className="w-full min-h-[44px] px-4 py-2.5 flex items-center justify-between gap-2 text-left hover:bg-amber-100/50 dark:hover:bg-amber-900/25 transition-colors"
          >
            <div className="flex items-center gap-2 min-w-0">
              <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
              <span className="text-xs font-bold text-amber-900 dark:text-amber-200 truncate">
                {booksWithoutCompletionDate.length} buku selesai belum punya tanggal selesai
              </span>
            </div>
            <span className="text-[11px] font-semibold text-amber-700 dark:text-amber-300 inline-flex items-center gap-1 shrink-0">
              <span>{isMissingDateExpanded ? 'Tutup' : 'Lihat'}</span>
              {isMissingDateExpanded ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
            </span>
          </button>

          {isMissingDateExpanded && (
            <div className="border-t border-amber-200/80 dark:border-amber-900/50 divide-y divide-amber-200/60 dark:divide-amber-900/40 bg-white/70 dark:bg-slate-900/50 max-h-64 overflow-y-auto">
              {booksWithoutCompletionDate.map((book, idx) => (
                <button
                  key={`missing-date-${book.id || book.no}-${idx}`}
                  type="button"
                  onClick={() => onSelectBook?.(book)}
                  className="w-full min-h-[44px] px-4 py-2 text-left flex items-center justify-between gap-3 hover:bg-amber-50/80 dark:hover:bg-slate-800/70 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                      {book.judul}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                      {book.penulis}
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 2. Konten Tabel Riwayat Bersih (Tanpa header Schnell, blok periode, catatan, maupun tanda tangan) */}
      <div className="printable-report bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 rounded-3xl p-4 sm:p-6 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-8 print:shadow-none print:border-none print:rounded-none print:p-0 print:bg-white print:text-slate-900">
        {/* Judul ringkas khusus saat cetak A4 */}
        <div className="hidden print:block pb-2 border-b border-slate-300">
          <h1 className="text-base font-extrabold text-slate-900">
            Data Riwayat Invoice Buku Selesai — {monthLabel}
          </h1>
        </div>

        {/* Bagian 1: Belum Ditagih (daftar sederhana, urut tgl selesai terlama ke terbaru) */}
        {showBelumDitagihSection && (
          <section className="space-y-3">
            <div className="print-avoid-break-after flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-200 dark:border-slate-700">
              <h3 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white">
                Belum Ditagih ({periodAndSearchFiltered.belumDitagih.length})
              </h3>
              <span className="text-xs font-bold text-slate-600 dark:text-slate-300 tabular-nums">
                Total: {renderNominal(summaryStats.belumDitagihNominal)}
              </span>
            </div>

            {periodAndSearchFiltered.belumDitagih.length === 0 ? (
              <div className="p-5 text-center text-xs text-slate-400 dark:text-slate-500 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200/80 dark:border-slate-800">
                Tidak ada buku selesai yang belum ditagih.
              </div>
            ) : (
              <>
                {/* Tabel Desktop & Cetak */}
                <div className="hidden lg:block print:block">
                  <table className="w-full text-left text-xs border-collapse border border-slate-200 dark:border-slate-700">
                    <thead>
                      <tr className="bg-slate-100 dark:bg-slate-800/90 text-[11px] font-bold text-slate-700 dark:text-slate-200">
                        <th className="py-2.5 px-2.5 text-center border border-slate-200 dark:border-slate-700 w-10">
                          No
                        </th>
                        <th className="py-2.5 px-3 border border-slate-200 dark:border-slate-700">
                          Judul Buku
                        </th>
                        <th className="py-2.5 px-3 border border-slate-200 dark:border-slate-700">
                          Penulis
                        </th>
                        <th className="py-2.5 px-3 text-center border border-slate-200 dark:border-slate-700 whitespace-nowrap">
                          Tgl Selesai
                        </th>
                        <th className="py-2.5 px-3 text-right border border-slate-200 dark:border-slate-700 whitespace-nowrap">
                          Nilai Jasa
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {periodAndSearchFiltered.belumDitagih.map((book, idx) => (
                        <tr
                          key={`unbilled-${book.id || book.no}-${idx}`}
                          className={`print-avoid-break ${
                            idx % 2 === 1
                              ? 'bg-slate-50/70 dark:bg-slate-800/30'
                              : 'bg-white dark:bg-slate-900'
                          }`}
                        >
                          <td className="py-2.5 px-2.5 text-center font-bold text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 align-top">
                            {idx + 1}
                          </td>
                          <td className="py-2.5 px-3 font-semibold text-slate-900 dark:text-slate-100 whitespace-normal break-words border border-slate-200 dark:border-slate-700 align-top">
                            {book.judul}
                          </td>
                          <td className="py-2.5 px-3 text-slate-600 dark:text-slate-300 whitespace-normal break-words border border-slate-200 dark:border-slate-700 align-top">
                            {book.penulis}
                          </td>
                          <td className="py-2.5 px-3 text-center text-slate-600 dark:text-slate-300 whitespace-nowrap border border-slate-200 dark:border-slate-700 align-top">
                            {formatDateIndo(
                              resolveBookCompletionDate(book, completionDateOptions)
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-right font-extrabold text-slate-900 dark:text-white tabular-nums whitespace-nowrap border border-slate-200 dark:border-slate-700 align-top">
                            {renderNominal(book.nilaiJasa)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Daftar Kartu HP & Tablet */}
                <div className="lg:hidden print:hidden space-y-2.5">
                  {periodAndSearchFiltered.belumDitagih.map((book, idx) => (
                    <div
                      key={`unbilled-card-${book.id || book.no}-${idx}`}
                      className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/80 p-3.5 space-y-1.5"
                    >
                      <div className="text-xs font-bold text-slate-900 dark:text-slate-100 whitespace-normal break-words">
                        {book.judul}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 whitespace-normal break-words">
                        {book.penulis}
                      </div>
                      <div className="pt-1.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2 text-xs">
                        <span className="text-[11px] text-slate-500 dark:text-slate-400">
                          Selesai:{' '}
                          {formatDateIndo(
                            resolveBookCompletionDate(book, completionDateOptions)
                          )}
                        </span>
                        <span className="font-extrabold text-slate-900 dark:text-white tabular-nums">
                          {renderNominal(book.nilaiJasa)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </section>
        )}

        {/* Bagian 2: Belum Dibayar (per invoice, terbaru ke terlama) */}
        {showBelumDibayarSection &&
          renderInvoiceSection(
            'Belum Dibayar',
            periodAndSearchFiltered.belumDibayar,
            summaryStats.belumDibayarNominal,
            'Tidak ada invoice yang belum dibayar.',
            'amber'
          )}

        {/* Bagian 3: Lunas (per invoice, terbaru ke terlama) */}
        {showLunasSection &&
          renderInvoiceSection(
            'Lunas',
            periodAndSearchFiltered.lunas,
            summaryStats.lunasNominal,
            'Tidak ada invoice berstatus lunas pada periode ini.',
            'emerald'
          )}
      </div>
    </div>
  );
};
