import React, { useState } from 'react';
import {
  Printer,
  Copy,
  Check,
  FileText,
  Calendar,
  Share2,
  BookCheck,
} from 'lucide-react';
import { BookJob } from '../types';
import { AVAILABLE_MONTHS } from '../utils/analytics';
import {
  formatRupiah,
  formatDateIndo,
  formatDateIndoFull,
} from '../utils/formatters';

interface LaporanTabProps {
  books: BookJob[];
}

export const LaporanTab: React.FC<LaporanTabProps> = ({ books }) => {
  // Pilihan bulan laporan (default: Oktober 2026 karena data paling lengkap dan realistis)
  const [selectedReportMonth, setSelectedReportMonth] = useState<string>('2026-10');
  const [copied, setCopied] = useState(false);

  const currentMonthOption = AVAILABLE_MONTHS.find((m) => m.key === selectedReportMonth);
  const monthTitle = currentMonthOption ? currentMonthOption.label : 'Semua Periode';

  // Filter buku yang selesai pada bulan yang dipilih (atau semua jika dipilih 'all')
  const completedBooks = books.filter((b) => {
    if (b.statusProgres !== 'Selesai') return false;
    if (selectedReportMonth === 'all') return true;
    return b.tglSelesaiLayout?.substring(0, 7) === selectedReportMonth;
  });

  // Semua buku yang tercatat di bulan tersebut (masuk/selesai)
  const activeOrIncomingBooks = books.filter((b) => {
    if (selectedReportMonth === 'all') return true;
    const tMonth = b.tglTerima?.substring(0, 7);
    const sMonth = b.tglSelesaiLayout?.substring(0, 7);
    return tMonth === selectedReportMonth || sMonth === selectedReportMonth;
  });

  // Metrik kalkulasi laporan
  const totalCompletedValue = completedBooks.reduce((sum, b) => sum + b.nilaiJasa, 0);
  const totalCompletedPages = completedBooks.reduce((sum, b) => sum + (b.halamanFinal || b.halamanAwal || 0), 0);
  const lunasCount = completedBooks.filter((b) => b.statusBayar === 'Lunas').length;
  const lunasValue = completedBooks
    .filter((b) => b.statusBayar === 'Lunas')
    .reduce((sum, b) => sum + b.nilaiJasa, 0);
  const piutangCount = completedBooks.filter((b) => b.statusBayar === 'Belum Dibayar').length;
  const piutangValue = completedBooks
    .filter((b) => b.statusBayar === 'Belum Dibayar')
    .reduce((sum, b) => sum + b.nilaiJasa, 0);
  const belumDitagihCount = completedBooks.filter((b) => b.statusBayar === 'Belum Ditagih').length;
  const belumDitagihValue = completedBooks
    .filter((b) => b.statusBayar === 'Belum Ditagih')
    .reduce((sum, b) => sum + b.nilaiJasa, 0);

  // Tanggal saat ini (2026)
  const printDateString = '2 November 2026';

  // Handler cetak
  const handlePrint = () => {
    window.print();
  };

  // Handler salin ke WhatsApp
  const handleCopyWhatsApp = () => {
    const textLines = [
      `📑 *LAPORAN BULANAN SCHNELL. (LAYOUT)*`,
      `*Workflow Book Management*`,
      `*Periode:* ${monthTitle}`,
      `*Tanggal:* ${printDateString}`,
      `────────────────────────`,
      `📊 *RINGKASAN PEKERJAAN:*`,
      `• Buku Selesai: *${completedBooks.length} judul*`,
      `• Total Halaman: *${totalCompletedPages.toLocaleString('id-ID')} hal*`,
      `• Total Nilai Jasa: *${formatRupiah(totalCompletedValue)}*`,
      ``,
      `💰 *STATUS KEUANGAN:*`,
      `✅ Lunas: ${formatRupiah(lunasValue)} (${lunasCount} buku)`,
      `⏳ Belum Dibayar (Invoice): ${formatRupiah(piutangValue)} (${piutangCount} buku)`,
      `📝 Belum Ditagih: ${formatRupiah(belumDitagihValue)} (${belumDitagihCount} buku)`,
      `────────────────────────`,
      `📚 *DAFTAR BUKU SELESAI (${monthTitle}):*`,
      ...completedBooks.map((b, idx) => {
        return `${idx + 1}. *${b.judul}*\n   ✍️ ${b.penulis} (${b.paket}) | ${b.halamanFinal || b.halamanAwal} hal | ${formatRupiah(b.nilaiJasa)} [${b.statusBayar}]`;
      }),
      `────────────────────────`,
      `_Laporan dihasilkan otomatis via Dasbor Schnell. (Layout) - Workflow Book Management_`,
    ];

    const message = textLines.join('\n');
    navigator.clipboard.writeText(message);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="space-y-6">
      {/* Top Controls: Pemilih Bulan Laporan & Tombol Aksi */}
      <div className="no-print bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        {/* Pemilih Bulan */}
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-slate-400" />
          <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
            Pilih Bulan Laporan:
          </span>
          <select
            value={selectedReportMonth}
            onChange={(e) => setSelectedReportMonth(e.target.value)}
            className="py-1.5 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100 text-xs font-bold border-none focus:outline-none cursor-pointer"
          >
            {AVAILABLE_MONTHS.map((m) => (
              <option key={m.key} value={m.key}>
                {m.label}
              </option>
            ))}
            <option value="all">Semua Periode (Rekap Total)</option>
          </select>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 self-end sm:self-auto">
          <button
            onClick={handleCopyWhatsApp}
            className="px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors flex items-center gap-1.5"
            title="Salin ringkasan ke format WhatsApp"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-600" />
                <span className="text-emerald-600 dark:text-emerald-400">Tersalin!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Salin Ringkasan WA</span>
              </>
            )}
          </button>

          <button
            onClick={handlePrint}
            className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-all flex items-center gap-2 shadow-sm"
          >
            <Printer className="w-4 h-4" />
            <span>Cetak / Simpan PDF</span>
          </button>
        </div>
      </div>

      {/* Pratinjau Dokumen Cetak Ukuran A4 (Single-Page Style) */}
      <div className="printable-report bg-white text-slate-900 rounded-3xl p-6 sm:p-10 shadow-lg border border-slate-200 dark:border-slate-800 mx-auto max-w-4xl font-sans">
        {/* KOP LAPORAN */}
        <div className="border-b-2 border-slate-900 pb-4 mb-6 flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="w-7 h-7 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold text-xs">
                S.
              </span>
              <h1 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900 uppercase">
                Schnell. <span className="text-blue-600 font-bold">(Layout)</span>
              </h1>
            </div>
            <p className="text-xs text-slate-600 font-semibold uppercase tracking-wider">
              Workflow Book Management · Laporan Pekerjaan & Honor Layout
            </p>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Spesialis Layout InDesign & Penataan Tipografi Non-Fiksi
            </p>
          </div>

          <div className="text-left sm:text-right">
            <span className="inline-block px-3 py-1 rounded-md bg-slate-100 text-slate-800 text-xs font-extrabold uppercase tracking-wider mb-1">
              Periode: {monthTitle}
            </span>
            <p className="text-[11px] text-slate-500">
              Dicetak pada: <strong>{printDateString}</strong>
            </p>
          </div>
        </div>

        {/* RINGKASAN METRIK BULANAN */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6 bg-slate-50 p-4 rounded-xl border border-slate-200">
          <div>
            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">
              Buku Selesai
            </span>
            <span className="text-xl font-extrabold text-slate-900 tabular-nums">
              {completedBooks.length} judul
            </span>
          </div>

          <div>
            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">
              Total Halaman
            </span>
            <span className="text-xl font-extrabold text-slate-900 tabular-nums">
              {totalCompletedPages.toLocaleString('id-ID')} hal
            </span>
          </div>

          <div>
            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">
              Total Nilai Jasa
            </span>
            <span className="text-xl font-extrabold text-blue-700 tabular-nums">
              {formatRupiah(totalCompletedValue)}
            </span>
          </div>

          <div>
            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">
              Status Lunas
            </span>
            <span className="text-xl font-extrabold text-emerald-700 tabular-nums">
              {formatRupiah(lunasValue)}
            </span>
          </div>
        </div>

        {/* TABEL BUKU YANG SELESAI */}
        <div className="mb-6">
          <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-2 flex items-center justify-between">
            <span>Daftar Pekerjaan Selesai ({completedBooks.length} Buku)</span>
            <span className="text-[11px] text-slate-500 font-normal">
              Urut tanggal selesai
            </span>
          </h3>

          {completedBooks.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-xs bg-slate-50 rounded-xl border border-slate-100">
              Tidak ada buku yang tercatat selesai pada periode ini.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b-2 border-slate-200 bg-slate-100 text-[11px] font-bold text-slate-700">
                    <th className="py-2 px-2 text-center w-8">No</th>
                    <th className="py-2 px-2">Judul Buku & Penulis</th>
                    <th className="py-2 px-2">Paket</th>
                    <th className="py-2 px-2 text-right">Hal.</th>
                    <th className="py-2 px-2 text-center">Tgl Selesai</th>
                    <th className="py-2 px-2 text-right">Nilai Jasa</th>
                    <th className="py-2 px-2 text-center">Status Bayar</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {completedBooks.map((book, idx) => (
                    <tr key={book.no} className="hover:bg-slate-50/50">
                      <td className="py-2 px-2 text-center font-bold text-slate-600">
                        {idx + 1}
                      </td>
                      <td className="py-2 px-2">
                        <div className="font-bold text-slate-900">{book.judul}</div>
                        <div className="text-[11px] text-slate-500">{book.penulis}</div>
                      </td>
                      <td className="py-2 px-2">
                        <span className="font-semibold text-slate-700">{book.paket}</span>
                      </td>
                      <td className="py-2 px-2 text-right tabular-nums text-slate-700">
                        {book.halamanFinal || book.halamanAwal}
                      </td>
                      <td className="py-2 px-2 text-center text-slate-600 whitespace-nowrap">
                        {formatDateIndo(book.tglSelesaiLayout)}
                      </td>
                      <td className="py-2 px-2 text-right font-extrabold text-slate-900 tabular-nums">
                        {formatRupiah(book.nilaiJasa)}
                      </td>
                      <td className="py-2 px-2 text-center">
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
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-900 font-extrabold bg-slate-50 text-slate-900">
                    <td colSpan={3} className="py-2.5 px-2 text-right uppercase text-[11px]">
                      Total Keseluruhan:
                    </td>
                    <td className="py-2.5 px-2 text-right tabular-nums">
                      {totalCompletedPages.toLocaleString('id-ID')}
                    </td>
                    <td className="py-2.5 px-2 text-center">
                      {completedBooks.length} Buku
                    </td>
                    <td className="py-2.5 px-2 text-right tabular-nums text-sm text-blue-700">
                      {formatRupiah(totalCompletedValue)}
                    </td>
                    <td className="py-2.5 px-2 text-center text-[10px] text-slate-600">
                      Lunas: {formatRupiah(lunasValue)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>

        {/* TANDA TANGAN / PENGESAHAN LAPORAN */}
        <div className="pt-8 mt-6 border-t border-slate-200 grid grid-cols-2 text-xs">
          <div>
            <p className="font-bold text-slate-800">Catatan:</p>
            <p className="text-[11px] text-slate-500 mt-1 max-w-xs leading-relaxed">
              Honorarium ditransfer via rekening bank terdaftar. Seluruh file PDF siap cetak telah diserahkan sesuai standar pracetak penerbit.
            </p>
          </div>

          <div className="text-right">
            <p className="text-[11px] text-slate-500">Hormat saya,</p>
            <div className="h-14 flex items-center justify-end">
              <span className="font-serif italic text-lg text-slate-700 font-bold">
                Schnell.
              </span>
            </div>
            <p className="font-bold text-slate-900">Workflow Book Management</p>
            <p className="text-[10px] text-slate-400">Freelance Book Layouter</p>
          </div>
        </div>
      </div>
    </div>
  );
};
