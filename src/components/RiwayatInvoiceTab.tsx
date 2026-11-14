import React, { useState, useMemo } from 'react';
import {
  Printer,
  Copy,
  Check,
  Search,
  Calendar,
  CheckCircle2,
  Clock,
  AlertCircle,
  FileText,
  ArrowUpRight,
  Receipt,
  ArrowRight,
} from 'lucide-react';
import { BookJob, TabType } from '../types';
import { AVAILABLE_MONTHS } from '../utils/analytics';
import {
  formatRupiah,
  formatDateIndo,
  getInvoiceNumber,
  getStatusBayarConfig,
} from '../utils/formatters';

interface RiwayatInvoiceTabProps {
  books: BookJob[];
  onGoToInvoiceTab: (bookId: number) => void;
}

export const RiwayatInvoiceTab: React.FC<RiwayatInvoiceTabProps> = ({
  books,
  onGoToInvoiceTab,
}) => {
  const [selectedMonth, setSelectedMonth] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'Semua' | 'Lunas' | 'Belum Dibayar' | 'Belum Ditagih'>('Semua');
  const [searchQuery, setSearchQuery] = useState('');
  const [copied, setCopied] = useState(false);

  // KETENTUAN PENTING: Hanya buku yang sudah SELESAI yang muncul di riwayat invoice!
  const finishedBooks = useMemo(() => {
    return books.filter((b) => b.statusProgres === 'Selesai');
  }, [books]);

  // Filtering data riwayat invoice
  const filteredInvoiceHistory = useMemo(() => {
    return finishedBooks.filter((book) => {
      // Filter periode bulan berdasarkan tanggal selesai atau tanggal invoice
      if (selectedMonth !== 'all') {
        const selesaiMonth = book.tglSelesaiLayout?.substring(0, 7);
        const invoiceMonth = book.tglInvoice?.substring(0, 7);
        if (selesaiMonth !== selectedMonth && invoiceMonth !== selectedMonth) {
          return false;
        }
      }

      // Filter status bayar
      if (statusFilter !== 'Semua' && book.statusBayar !== statusFilter) {
        return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const invNo = getInvoiceNumber(book.no, book.tglInvoice).toLowerCase();
        const matchTitle = book.judul.toLowerCase().includes(q);
        const matchAuthor = book.penulis.toLowerCase().includes(q);
        const matchInv = invNo.includes(q);
        if (!matchTitle && !matchAuthor && !matchInv) return false;
      }

      return true;
    });
  }, [finishedBooks, selectedMonth, statusFilter, searchQuery]);

  // Perhitungan Ringkasan Riwayat
  const totalFinishedCount = finishedBooks.length;
  const filteredTotalValue = filteredInvoiceHistory.reduce((s, b) => s + b.nilaiJasa, 0);

  const lunasBooks = filteredInvoiceHistory.filter((b) => b.statusBayar === 'Lunas');
  const belumDibayarBooks = filteredInvoiceHistory.filter((b) => b.statusBayar === 'Belum Dibayar');
  const belumDitagihBooks = filteredInvoiceHistory.filter((b) => b.statusBayar === 'Belum Ditagih');

  const lunasNominal = lunasBooks.reduce((s, b) => s + b.nilaiJasa, 0);
  const belumDibayarNominal = belumDibayarBooks.reduce((s, b) => s + b.nilaiJasa, 0);
  const belumDitagihNominal = belumDitagihBooks.reduce((s, b) => s + b.nilaiJasa, 0);

  const monthLabel =
    selectedMonth === 'all'
      ? 'Semua Periode'
      : AVAILABLE_MONTHS.find((m) => m.key === selectedMonth)?.label || selectedMonth;

  const printDateString = '2 November 2026';

  const handlePrint = () => {
    window.print();
  };

  const handleCopyWhatsApp = () => {
    const textLines = [
      `📑 *REKAP RIWAYAT INVOICE BUKU SELESAI*`,
      `*Schnell. (Layout)*`,
      `*Periode:* ${monthLabel}`,
      `*Tanggal Rekap:* ${printDateString}`,
      `────────────────────────`,
      `📊 *RINGKASAN DATA INVOICE:*`,
      `• Total Buku Selesai: *${filteredInvoiceHistory.length} judul*`,
      `• Total Nilai Jasa: *${formatRupiah(filteredTotalValue)}*`,
      `✅ Lunas: *${formatRupiah(lunasNominal)}* (${lunasBooks.length} buku)`,
      `⏳ Piutang (Belum Dibayar): *${formatRupiah(belumDibayarNominal)}* (${belumDibayarBooks.length} buku)`,
      `📝 Belum Ditagih: *${formatRupiah(belumDitagihNominal)}* (${belumDitagihBooks.length} buku)`,
      `────────────────────────`,
      `📋 *DAFTAR RIWAYAT INVOICE:*`,
      ...filteredInvoiceHistory.map((b, idx) => {
        const invNo = getInvoiceNumber(b.no, b.tglInvoice);
        return `${idx + 1}. *${b.judul}*\n   📄 ${invNo} | Tgl Inv: ${formatDateIndo(b.tglInvoice)} | *${formatRupiah(b.nilaiJasa)}* [${b.statusBayar}]`;
      }),
      `────────────────────────`,
      `_Rekap diarsipkan via Dasbor Schnell. (Layout)_`,
    ];

    navigator.clipboard.writeText(textLines.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="space-y-6">
      {/* 1. Header Filter & Pencarian Riwayat Invoice (Disembunyikan saat cetak) */}
      <div className="no-print bg-white dark:bg-slate-900 rounded-3xl p-5 sm:p-6 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Receipt className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              <span>Data Riwayat Invoice Buku Selesai</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Menampilkan riwayat penagihan dan status pembayaran khusus buku yang telah rampung layout.
            </p>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
            <button
              onClick={handleCopyWhatsApp}
              className="px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors flex items-center gap-1.5"
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
              onClick={handlePrint}
              className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-all flex items-center gap-2 shadow-sm"
            >
              <Printer className="w-4 h-4" />
              <span>Cetak Rekap A4</span>
            </button>
          </div>
        </div>

        {/* Kontrol Filter & Pencarian */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Kolom Cari */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari judul, penulis, no invoice..."
              className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs text-slate-900 dark:text-white border-none focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* Filter Bulan */}
          <div className="flex items-center gap-2">
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="w-full py-2 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100 text-xs font-bold border-none focus:outline-none cursor-pointer"
            >
              <option value="all">Semua Periode Bulan</option>
              {AVAILABLE_MONTHS.map((m) => (
                <option key={m.key} value={m.key}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>

          {/* Filter Status Bayar */}
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
            {(['Semua', 'Lunas', 'Belum Dibayar', 'Belum Ditagih'] as const).map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`flex-1 py-1 text-[11px] font-bold rounded-lg transition-colors whitespace-nowrap ${
                  statusFilter === st
                    ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                {st === 'Belum Dibayar' ? 'Piutang' : st}
              </button>
            ))}
          </div>
        </div>

        {/* 4 Kartu Angka Ringkasan Riwayat */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
          <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-100 dark:border-slate-800">
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
              Buku Selesai
            </span>
            <span className="text-xl font-extrabold text-slate-900 dark:text-white tabular-nums mt-0.5 block">
              {filteredInvoiceHistory.length} judul
            </span>
          </div>

          <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-100 dark:border-slate-800">
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
              Total Nilai Jasa
            </span>
            <span className="text-xl font-extrabold text-blue-600 dark:text-blue-400 tabular-nums mt-0.5 block">
              {formatRupiah(filteredTotalValue)}
            </span>
          </div>

          <div className="p-3 bg-emerald-50/60 dark:bg-emerald-950/20 rounded-2xl border border-emerald-200/80 dark:border-emerald-900/40">
            <span className="text-[10px] text-emerald-800 dark:text-emerald-400 font-bold uppercase tracking-wider block">
              Lunas ({lunasBooks.length})
            </span>
            <span className="text-xl font-extrabold text-[#1A9E7A] dark:text-emerald-400 tabular-nums mt-0.5 block">
              {formatRupiah(lunasNominal)}
            </span>
          </div>

          <div className="p-3 bg-amber-50/60 dark:bg-amber-950/20 rounded-2xl border border-amber-200/80 dark:border-amber-900/40">
            <span className="text-[10px] text-amber-800 dark:text-amber-400 font-bold uppercase tracking-wider block">
              Piutang ({belumDibayarBooks.length})
            </span>
            <span className="text-xl font-extrabold text-[#F59E0B] dark:text-amber-400 tabular-nums mt-0.5 block">
              {formatRupiah(belumDibayarNominal)}
            </span>
          </div>
        </div>
      </div>

      {/* 2. Pratinjau Dokumen Rekap Riwayat Invoice (Format Kop Resmi A4) */}
      <div className="printable-report bg-white text-slate-900 rounded-3xl p-6 sm:p-10 shadow-lg border border-slate-200 dark:border-slate-800 mx-auto max-w-4xl font-sans">
        {/* KOP RIWAYAT INVOICE */}
        <div className="border-b-2 border-slate-900 pb-4 mb-6 flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="w-7 h-7 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold text-xs">
                S
              </span>
              <h1 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900 uppercase">
                Schnell.
              </h1>
            </div>
            <p className="text-xs text-slate-600 font-bold uppercase tracking-wider">
              Data Riwayat Invoice & Arsip Penagihan Buku Selesai
            </p>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Layanan Desain & Tata Letak Buku · Monitoring Pembayaran Honor Layout
            </p>
          </div>

          <div className="text-left sm:text-right">
            <span className="inline-block px-3 py-1 rounded-md bg-slate-100 text-slate-800 text-xs font-extrabold uppercase tracking-wider mb-1">
              Periode: {monthLabel}
            </span>
            <p className="text-[11px] text-slate-500">
              Dicetak pada: <strong>{printDateString}</strong>
            </p>
          </div>
        </div>

        {/* TABEL DATA RIWAYAT INVOICE */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
              Daftar Riwayat Invoice ({filteredInvoiceHistory.length} Buku Selesai)
            </h3>
            <span className="text-[11px] text-slate-500">
              *Hanya memuat buku berstatus "Selesai"
            </span>
          </div>

          {filteredInvoiceHistory.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-xs bg-slate-50 rounded-xl border border-slate-100">
              Tidak ada data riwayat invoice yang sesuai kriteria filter.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b-2 border-slate-900 bg-slate-100 text-[11px] font-bold text-slate-700">
                    <th className="py-2.5 px-2 text-center w-8">No</th>
                    <th className="py-2.5 px-2">No. Invoice</th>
                    <th className="py-2.5 px-2">Judul Buku & Penulis</th>
                    <th className="py-2.5 px-2 text-center">Tgl Selesai</th>
                    <th className="py-2.5 px-2 text-center">Tgl Invoice</th>
                    <th className="py-2.5 px-2 text-center">Tgl Bayar</th>
                    <th className="py-2.5 px-2 text-right">Nilai Jasa</th>
                    <th className="py-2.5 px-2 text-center">Status</th>
                    <th className="py-2.5 px-2 text-center no-print">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filteredInvoiceHistory.map((book, idx) => {
                    const invNo = getInvoiceNumber(book.no, book.tglInvoice);
                    const isLate = book.umurPiutang > 30;
                    const bayarConfig = getStatusBayarConfig(book.statusBayar);

                    return (
                      <tr key={book.no} className="hover:bg-slate-50/60 transition-colors">
                        <td className="py-2.5 px-2 text-center font-bold text-slate-600">
                          {idx + 1}
                        </td>
                        <td className="py-2.5 px-2 font-mono text-[11px] font-bold text-slate-800 whitespace-nowrap">
                          {invNo}
                        </td>
                        <td className="py-2.5 px-2 min-w-[200px]">
                          <div className="font-bold text-slate-900 line-clamp-1">{book.judul}</div>
                          <div className="text-[11px] text-slate-500 line-clamp-1">
                            {book.penulis} · {book.halamanFinal || book.halamanAwal} hlm. ({book.paket})
                          </div>
                        </td>
                        <td className="py-2.5 px-2 text-center text-slate-600 whitespace-nowrap">
                          {formatDateIndo(book.tglSelesaiLayout)}
                        </td>
                        <td className="py-2.5 px-2 text-center text-slate-600 whitespace-nowrap">
                          {formatDateIndo(book.tglInvoice)}
                        </td>
                        <td className="py-2.5 px-2 text-center text-slate-600 whitespace-nowrap">
                          {formatDateIndo(book.tglDibayar)}
                        </td>
                        <td className="py-2.5 px-2 text-right font-extrabold text-slate-900 tabular-nums">
                          {formatRupiah(book.nilaiJasa)}
                        </td>
                        <td className="py-2.5 px-2 text-center">
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                              book.statusBayar === 'Lunas'
                                ? 'bg-emerald-100 text-emerald-800'
                                : book.statusBayar === 'Belum Dibayar'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {book.statusBayar}
                          </span>
                          {isLate && (
                            <span className="block text-[9px] font-bold text-rose-600 mt-0.5">
                              {book.umurPiutang} hari
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-2 text-center no-print">
                          <button
                            onClick={() => onGoToInvoiceTab(book.no)}
                            className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-600 font-bold rounded-lg text-[10px] transition-colors whitespace-nowrap"
                            title="Buka Faktur Invoice"
                          >
                            Cetak Invoice
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-900 font-extrabold bg-slate-50 text-slate-900">
                    <td colSpan={3} className="py-2.5 px-2 text-right uppercase text-[11px]">
                      Total Rekapitulasi:
                    </td>
                    <td colSpan={3} className="py-2.5 px-2 text-center text-xs">
                      {filteredInvoiceHistory.length} Buku Selesai
                    </td>
                    <td className="py-2.5 px-2 text-right tabular-nums text-sm text-blue-700">
                      {formatRupiah(filteredTotalValue)}
                    </td>
                    <td colSpan={2} className="py-2.5 px-2 text-center text-[10px] text-slate-600">
                      Lunas: {formatRupiah(lunasNominal)} · Piutang: {formatRupiah(belumDibayarNominal)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>

        {/* PENGESAHAN REKAP */}
        <div className="pt-6 mt-6 border-t border-slate-200 grid grid-cols-2 text-xs">
          <div>
            <p className="font-bold text-slate-800">Catatan Riwayat:</p>
            <p className="text-[11px] text-slate-500 mt-1 max-w-xs leading-relaxed">
              Data di atas adalah arsip resmi pekerjaan buku non-fiksi yang telah diselesaikan oleh Schnell. (Layout).
            </p>
          </div>

          <div className="text-right">
            <p className="text-[11px] text-slate-500">Mengetahui,</p>
            <div className="h-12 flex items-center justify-end">
              <span className="font-serif italic text-lg text-slate-700 font-bold">
                Schnell.
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
