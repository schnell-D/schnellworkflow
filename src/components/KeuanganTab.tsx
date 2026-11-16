import React, { useState, useEffect } from 'react';
import {
  Wallet,
  CheckCircle2,
  Clock,
  AlertCircle,
  TrendingUp,
  AlertTriangle,
  ArrowUpRight,
  Calculator,
  ChevronRight,
  Receipt,
  History,
  FileText,
  Eye,
  EyeOff,
} from 'lucide-react';
import { BookJob, KeuanganSubTab, PaketType } from '../types';
import {
  computePaketSummary,
  computeMonthlyIncome,
} from '../utils/analytics';
import { formatRupiah, formatRupiahShort, formatDateIndo } from '../utils/formatters';
import {
  getUserPackageRates,
  setUserPackageRates,
  DEFAULT_PACKAGE_RATES,
  PackageRates,
} from '../utils/userStorage';
import { InvoiceTab } from './InvoiceTab';
import { RiwayatInvoiceTab } from './RiwayatInvoiceTab';

interface KeuanganTabProps {
  books: BookJob[];
  onSelectBook: (book: BookJob) => void;
  selectedInvoiceBookId?: number | null;
  activeSubTab?: KeuanganSubTab;
  onSubTabChange?: (subTab: KeuanganSubTab) => void;
  onSelectInvoiceBookId?: (bookId: number) => void;
  currentUid?: string;
}

interface KeuanganRingkasanProps {
  books: BookJob[];
  onSelectBook: (book: BookJob) => void;
  onGoToInvoice: (bookId: number) => void;
  currentUid?: string;
  hideNominals?: boolean;
}

const KeuanganRingkasanView: React.FC<KeuanganRingkasanProps> = ({
  books,
  onSelectBook,
  onGoToInvoice,
  currentUid = '',
  hideNominals = true,
}) => {
  const displayRupiah = (amount: number) => (hideNominals ? 'Rp •••••' : formatRupiah(amount));
  const displayRupiahShort = (amount: number) =>
    hideNominals ? 'Rp •••••' : formatRupiahShort(amount);
  // Pengaturan Tarif Paket Layout per Halaman (tersimpan di userStorage per akun)
  const [packageRates, setPackageRates] = useState<PackageRates>(() => {
    return getUserPackageRates(currentUid);
  });
  const [ratesSaved, setRatesSaved] = useState(false);
  const [isEditingRates, setIsEditingRates] = useState(false);

  // Estimator per buku
  const [calcMode, setCalcMode] = useState<'buku' | 'manual'>('buku');
  const [selectedCalcBookNo, setSelectedCalcBookNo] = useState<number>(books[0]?.no || 0);
  const [manualTitle, setManualTitle] = useState('Naskah Baru');
  const [manualPages, setManualPages] = useState<number>(180);
  const [manualPaket, setManualPaket] = useState<PaketType>('Standart');

  const selectedCalcBook = books.find((b) => b.no === selectedCalcBookNo) || books[0];
  const currentCalcPaket = calcMode === 'buku' ? (selectedCalcBook?.paket || 'Standart') : manualPaket;
  const currentCalcPages = calcMode === 'buku' ? (selectedCalcBook?.halamanFinal || selectedCalcBook?.halamanAwal || 0) : manualPages;
  const currentRatePerHalaman = packageRates[currentCalcPaket] || DEFAULT_PACKAGE_RATES[currentCalcPaket];
  const calculatedEstimatedCost = currentCalcPages * currentRatePerHalaman;

  const handleSaveRates = (e: React.FormEvent) => {
    e.preventDefault();
    setUserPackageRates(currentUid, packageRates);
    setRatesSaved(true);
    setTimeout(() => setRatesSaved(false), 2000);
  };

  // Perhitungan total
  const totalNilaiJasa = books.reduce((sum, b) => sum + b.nilaiJasa, 0);

  // 3 Kategori status pembayaran
  const lunasBooks = books.filter((b) => b.statusBayar === 'Lunas');
  const belumDibayarBooks = books.filter((b) => b.statusBayar === 'Belum Dibayar');
  const belumDitagihBooks = books.filter((b) => b.statusBayar === 'Belum Ditagih');

  const lunasNominal = lunasBooks.reduce((sum, b) => sum + b.nilaiJasa, 0);
  const belumDibayarNominal = belumDibayarBooks.reduce((sum, b) => sum + b.nilaiJasa, 0);
  const belumDitagihNominal = belumDitagihBooks.reduce((sum, b) => sum + b.nilaiJasa, 0);

  const lunasPct = totalNilaiJasa > 0 ? Math.round((lunasNominal / totalNilaiJasa) * 1000) / 10 : 0;
  const belumDibayarPct = totalNilaiJasa > 0 ? Math.round((belumDibayarNominal / totalNilaiJasa) * 1000) / 10 : 0;
  const belumDitagihPct = totalNilaiJasa > 0 ? Math.round((belumDitagihNominal / totalNilaiJasa) * 1000) / 10 : 0;

  // Ringkasan per Paket
  const paketSummary = computePaketSummary(books);

  // Pembayaran masuk per bulan (chart)
  const monthlyIncomes = computeMonthlyIncome(books);
  const maxMonthlyIncome = Math.max(...monthlyIncomes.map((m) => m.totalDibayar), 1);

  // Daftar Piutang (Belum Dibayar), diurutkan umur terlama
  const piutangList = [...belumDibayarBooks].sort((a, b) => b.umurPiutang - a.umurPiutang);

  // Daftar Belum Ditagih, diurutkan nilai jasa terbesar
  const unInvoicedList = [...belumDitagihBooks].sort((a, b) => b.nilaiJasa - a.nilaiJasa);


  return (
    <div className="space-y-6">
      {/* 1. Kartu Besar: Total Nilai Jasa & 3 Kartu Breakdown dengan Bar Bertumpuk */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 sm:p-6 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-6">
        <div>
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">
              Ringkasan Keuangan Freelance
            </span>
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">
              Total {books.length} Buku
            </span>
          </div>

          <div className="mt-2 flex flex-col sm:flex-row sm:items-baseline justify-between gap-2">
            <div>
              <span className="text-xs text-slate-500 dark:text-slate-400">Total Nilai Jasa Keseluruhan</span>
              <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900 dark:text-white tabular-nums mt-0.5">
                {displayRupiah(totalNilaiJasa)}
              </h2>
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              Rata-rata per buku: <strong className="text-slate-800 dark:text-slate-200">{displayRupiah(Math.round(totalNilaiJasa / (books.length || 1)))}</strong>
            </div>
          </div>
        </div>

        {/* Stacked Progress Bar */}
        <div>
          <div className="w-full h-4 rounded-full bg-slate-100 dark:bg-slate-800 flex overflow-hidden p-0.5 gap-0.5">
            <div
              className="bg-[#1A9E7A] h-full rounded-l-full transition-all duration-500"
              style={{ width: `${lunasPct}%` }}
              title={`Lunas: ${lunasPct}%`}
            />
            <div
              className="bg-[#F59E0B] h-full transition-all duration-500"
              style={{ width: `${belumDibayarPct}%` }}
              title={`Belum Dibayar: ${belumDibayarPct}%`}
            />
            <div
              className="bg-[#64748B] h-full rounded-r-full transition-all duration-500"
              style={{ width: `${belumDitagihPct}%` }}
              title={`Belum Ditagih: ${belumDitagihPct}%`}
            />
          </div>

          <div className="flex items-center justify-between text-[11px] text-slate-400 mt-2">
            <span>0%</span>
            <span>50%</span>
            <span>100% Target Penagihan</span>
          </div>
        </div>

        {/* 3 Kartu Breakdown */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
          {/* Lunas */}
          <div className="p-4 rounded-2xl bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200/60 dark:border-emerald-900/40">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-[#1A9E7A] flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" />
                Lunas
              </span>
              <span className="text-xs font-bold text-[#1A9E7A]">{lunasPct}%</span>
            </div>
            <div className="mt-2">
              <span className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white tabular-nums block">
                {displayRupiah(lunasNominal)}
              </span>
              <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 block">
                {lunasBooks.length} judul buku selesai & dibayar
              </span>
            </div>
          </div>

          {/* Belum Dibayar (Piutang) */}
          <div className="p-4 rounded-2xl bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-900/40">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-[#F59E0B] flex items-center gap-1.5">
                <Clock className="w-4 h-4" />
                Belum Dibayar
              </span>
              <span className="text-xs font-bold text-[#F59E0B]">{belumDibayarPct}%</span>
            </div>
            <div className="mt-2">
              <span className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white tabular-nums block">
                {displayRupiah(belumDibayarNominal)}
              </span>
              <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 block">
                {belumDibayarBooks.length} tagihan menunggu transfer
              </span>
            </div>
          </div>

          {/* Belum Ditagih */}
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4" />
                Belum Ditagih
              </span>
              <span className="text-xs font-bold text-slate-600 dark:text-slate-400">{belumDitagihPct}%</span>
            </div>
            <div className="mt-2">
              <span className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white tabular-nums block">
                {displayRupiah(belumDitagihNominal)}
              </span>
              <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 block">
                {belumDitagihBooks.length} buku berjalan/siap faktur
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Kartu Pendapatan Berdasarkan Paket */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 sm:p-6 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-4">
        <h3 className="text-base font-bold text-slate-900 dark:text-white">
          Komposisi Pendapatan per Paket Layout
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {paketSummary.map((pkt) => {
            const isPremium = pkt.paket === 'Premium';
            const isStandart = pkt.paket === 'Standart';

            return (
              <div
                key={pkt.paket}
                className="p-4 rounded-2xl bg-slate-50/70 dark:bg-slate-800/40 border border-slate-200/70 dark:border-slate-800 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-xs font-bold px-2 py-0.5 rounded-md ${
                        isPremium
                          ? 'bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300'
                          : isStandart
                          ? 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
                          : 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300'
                      }`}
                    >
                      Paket {pkt.paket}
                    </span>
                    <span className="text-xs font-bold text-slate-500">{pkt.persenNilai}%</span>
                  </div>

                  <div className="mt-3">
                    <span className="text-xl font-extrabold text-slate-900 dark:text-white tabular-nums block">
                      {displayRupiah(pkt.nilaiTotal)}
                    </span>
                    <span className="text-xs text-slate-500 mt-0.5 block">
                      {pkt.jumlahBuku} buku ({Math.round(pkt.totalHalaman / (pkt.jumlahBuku || 1))} hlm rata-rata)
                    </span>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-200/60 dark:border-slate-800 text-[11px] text-slate-500 flex justify-between">
                  <span>Rata-rata/buku:</span>
                  <strong className="text-slate-800 dark:text-slate-200">
                    {displayRupiah(Math.round(pkt.nilaiTotal / (pkt.jumlahBuku || 1)))}
                  </strong>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 3. Grafik Pembayaran Masuk Per Bulan */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 sm:p-6 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Arus Kas Pembayaran Masuk
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Honor lunas yang diterima per bulan (Juli - November 2026)
            </p>
          </div>
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-50 text-[#1A9E7A] dark:bg-emerald-950/40 dark:text-emerald-400 self-start sm:self-auto">
            Total Diterima: {displayRupiah(lunasNominal)}
          </span>
        </div>

        {/* Visual Bar Chart */}
        <div className="pt-6 pb-2">
          <div className="h-44 flex items-end justify-between gap-3 sm:gap-6 border-b border-slate-100 dark:border-slate-800 px-2 pb-2">
            {monthlyIncomes.map((item) => {
              const heightPct = Math.round((item.totalDibayar / maxMonthlyIncome) * 100);

              return (
                <div key={item.monthKey} className="flex-1 flex flex-col items-center justify-end h-full group">
                  <div className="w-full max-w-[50px] bg-emerald-50 dark:bg-emerald-950/30 rounded-t-xl relative flex flex-col justify-end h-full">
                    <div
                      className="w-full bg-[#1A9E7A] hover:bg-emerald-600 rounded-t-xl transition-all duration-500 relative flex items-center justify-center cursor-pointer shadow-xs"
                      style={{ height: `${Math.max(heightPct, 8)}%` }}
                    >
                      <span className="text-[10px] font-bold text-white absolute -top-5 whitespace-nowrap tabular-nums">
                        {displayRupiahShort(item.totalDibayar)}
                      </span>
                    </div>
                  </div>
                  <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 mt-2 truncate">
                    {item.label}
                  </span>
                  <span className="text-[10px] text-slate-400 tabular-nums">
                    {item.count} buku
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 4. Dua Kolom: Daftar Piutang (> 30 Hari Merah) & Daftar Belum Ditagih (Nilai Terbesar) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Kolom Kiri: Daftar Piutang (Sudah ditagih belum dibayar) */}
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200/80 dark:border-slate-800 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-amber-50 dark:bg-amber-950/60 text-[#F59E0B] flex items-center justify-center">
                  <Clock className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                    Daftar Piutang Tagihan
                  </h4>
                  <p className="text-[11px] text-slate-500">
                    Urut umur terlama ({piutangList.length} tagihan)
                  </p>
                </div>
              </div>
              <span className="text-xs font-bold text-[#F59E0B] tabular-nums">
                {displayRupiah(belumDibayarNominal)}
              </span>
            </div>

            {piutangList.length === 0 ? (
              <p className="text-xs text-slate-400 py-6 text-center">
                Semua invoice yang diterbitkan sudah lunas.
              </p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {piutangList.map((book, idx) => {
                  const isLate = book.umurPiutang > 30;
                  return (
                    <div
                      key={`piutang-${book.no}-${idx}`}
                      onClick={() => onSelectBook(book)}
                      className="py-3 flex items-center justify-between gap-3 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40 p-2 rounded-xl transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-900 dark:text-white truncate">
                            {book.judul}
                          </span>
                          {isLate && (
                            <span className="px-1.5 py-0.2 rounded-md bg-rose-100 text-[#E5484D] dark:bg-rose-950 dark:text-rose-400 text-[10px] font-bold shrink-0">
                              &gt;30 Hari
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                          Inv: {formatDateIndo(book.tglInvoice)} · Penulis: {book.penulis}
                        </p>
                      </div>

                      <div className="text-right shrink-0">
                        <span className="text-xs font-bold text-slate-900 dark:text-white tabular-nums block">
                          {displayRupiah(book.nilaiJasa)}
                        </span>
                        <span
                          className={`text-[11px] font-semibold tabular-nums ${
                            isLate
                              ? 'text-rose-600 dark:text-rose-400 font-bold'
                              : 'text-amber-600 dark:text-amber-400'
                          }`}
                        >
                          {book.umurPiutang} hari
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <p className="text-[10px] text-slate-400 pt-3 border-t border-slate-100 dark:border-slate-800 mt-2">
            *Merah menandakan piutang melewati toleransi 30 hari kalender.
          </p>
        </div>

        {/* Kolom Kanan: Daftar Belum Ditagih (Urut Nilai Terbesar) */}
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200/80 dark:border-slate-800 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-600 flex items-center justify-center">
                  <ArrowUpRight className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                    Pekerjaan Belum Ditagih
                  </h4>
                  <p className="text-[11px] text-slate-500">
                    Urut nilai jasa terbesar ({unInvoicedList.length} buku)
                  </p>
                </div>
              </div>
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300 tabular-nums">
                {displayRupiah(belumDitagihNominal)}
              </span>
            </div>

            <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-[360px] overflow-y-auto pr-1">
              {unInvoicedList.map((book, idx) => {
                const isReady = book.statusProgres === 'Selesai';
                return (
                  <div
                    key={`uninvoiced-${book.no}-${idx}`}
                    className="py-3 flex items-center justify-between gap-3 p-2 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    <div
                      onClick={() => onSelectBook(book)}
                      className="min-w-0 flex-1 cursor-pointer"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-900 dark:text-white truncate">
                          {book.judul}
                        </span>
                        {isReady && (
                          <span className="px-1.5 py-0.2 rounded-md bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400 text-[10px] font-bold shrink-0">
                            Siap Ditagih
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                        Paket {book.paket} · {book.statusProgres} · Penulis: {book.penulis}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <div className="text-right">
                        <span className="text-xs font-bold text-slate-900 dark:text-white tabular-nums block">
                          {displayRupiah(book.nilaiJasa)}
                        </span>
                        <span className="text-[10px] text-slate-400 block">
                          {book.halamanFinal} hlm
                        </span>
                      </div>

                      {isReady && (
                        <button
                          type="button"
                          onClick={() => onGoToInvoice(book.no)}
                          className="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-300 hover:bg-blue-600 hover:text-white transition-colors"
                          title="Buat Invoice untuk buku ini"
                        >
                          Faktur
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <p className="text-[10px] text-slate-400 pt-3 border-t border-slate-100 dark:border-slate-800 mt-2">
            Klik tombol &apos;Faktur&apos; untuk langsung membuka pembuatan invoice pada naskah yang selesai.
          </p>
        </div>
      </div>

      {/* 5. Kartu Estimasi Biaya Layout Buku & Pengaturan Harga Paket */}
      <div className="p-5 sm:p-7 rounded-3xl bg-gradient-to-br from-slate-900 via-slate-900 to-blue-950 text-white shadow-xl space-y-6 border border-slate-800">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center shrink-0">
              <Calculator className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-black tracking-tight text-white">
                Estimasi Biaya Layout Buku
              </h3>
              <p className="text-xs text-slate-300 mt-0.5">
                Pengaturan harga paket &amp; perhitungan perkiraan biaya: Total Halaman &times; Tarif Paket
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsEditingRates(!isEditingRates)}
            className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-white/10 hover:bg-white/20 border border-white/20 text-white transition-colors self-start sm:self-auto flex items-center gap-1.5"
          >
            <span>{isEditingRates ? 'Tutup Pengaturan Tarif' : 'Ubah Tarif Paket'}</span>
          </button>
        </div>

        {/* 1. Pengaturan Tarif Paket (Bila Diaktifkan / Selalu Tersedia) */}
        {isEditingRates && (
          <form onSubmit={handleSaveRates} className="p-4 rounded-2xl bg-white/5 border border-white/15 space-y-3 animate-fade-in">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-amber-300 uppercase tracking-wider block">
                Atur Harga Paket Layout (per Halaman)
              </span>
              <span className="text-[11px] text-slate-400">
                Disimpan privat di akun Anda
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                  Paket Basic (Rp/hlm):
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">Rp</span>
                  <input
                    type="number"
                    min={500}
                    step={100}
                    value={packageRates.Basic}
                    onChange={(e) =>
                      setPackageRates({
                        ...packageRates,
                        Basic: Math.max(0, parseInt(e.target.value, 10) || 0),
                      })
                    }
                    className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-800 text-white text-xs font-bold border border-white/20 focus:outline-none focus:border-amber-400"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                  Paket Standart (Rp/hlm):
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">Rp</span>
                  <input
                    type="number"
                    min={500}
                    step={100}
                    value={packageRates.Standart}
                    onChange={(e) =>
                      setPackageRates({
                        ...packageRates,
                        Standart: Math.max(0, parseInt(e.target.value, 10) || 0),
                      })
                    }
                    className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-800 text-white text-xs font-bold border border-white/20 focus:outline-none focus:border-amber-400"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                  Paket Premium (Rp/hlm):
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">Rp</span>
                  <input
                    type="number"
                    min={500}
                    step={100}
                    value={packageRates.Premium}
                    onChange={(e) =>
                      setPackageRates({
                        ...packageRates,
                        Premium: Math.max(0, parseInt(e.target.value, 10) || 0),
                      })
                    }
                    className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-800 text-white text-xs font-bold border border-white/20 focus:outline-none focus:border-amber-400"
                    required
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setPackageRates(DEFAULT_PACKAGE_RATES);
                  setUserPackageRates(currentUid, DEFAULT_PACKAGE_RATES);
                }}
                className="px-3 py-1.5 rounded-xl text-[11px] font-bold text-slate-400 hover:text-white"
              >
                Reset Default
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-600 text-slate-950 transition-colors shadow-xs"
              >
                {ratesSaved ? 'Tarif Tersimpan!' : 'Simpan Tarif Paket'}
              </button>
            </div>
          </form>
        )}

        {/* 2. Kartu Tarif Saat Ini (Pill Indicator) */}
        <div className="grid grid-cols-3 gap-2 sm:gap-3 text-center">
          <div className="p-2.5 rounded-2xl bg-white/5 border border-white/10">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
              Paket Basic
            </span>
            <span className="text-sm sm:text-base font-extrabold text-white mt-0.5 block tabular-nums">
              {formatRupiah(packageRates.Basic)}
              <span className="text-[10px] text-slate-400 font-normal"> /hlm</span>
            </span>
          </div>

          <div className="p-2.5 rounded-2xl bg-blue-500/10 border border-blue-400/30">
            <span className="text-[10px] font-bold text-blue-300 uppercase tracking-wider block">
              Paket Standart
            </span>
            <span className="text-sm sm:text-base font-extrabold text-blue-200 mt-0.5 block tabular-nums">
              {formatRupiah(packageRates.Standart)}
              <span className="text-[10px] text-blue-300/70 font-normal"> /hlm</span>
            </span>
          </div>

          <div className="p-2.5 rounded-2xl bg-amber-500/10 border border-amber-400/30">
            <span className="text-[10px] font-bold text-amber-300 uppercase tracking-wider block">
              Paket Premium
            </span>
            <span className="text-sm sm:text-base font-extrabold text-amber-200 mt-0.5 block tabular-nums">
              {formatRupiah(packageRates.Premium)}
              <span className="text-[10px] text-amber-300/70 font-normal"> /hlm</span>
            </span>
          </div>
        </div>

        {/* 3. Kalkulator Perhitungan Estimasi Layout */}
        <div className="bg-white/10 rounded-2xl p-4 sm:p-5 border border-white/15 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-white uppercase tracking-wider">
                Simulasi Perhitungan Per Buku:
              </span>
            </div>

            {/* Mode Pemilihan */}
            <div className="flex items-center gap-1 p-0.5 rounded-xl bg-slate-900/60 border border-white/10 self-start sm:self-auto">
              <button
                type="button"
                onClick={() => setCalcMode('buku')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors ${
                  calcMode === 'buku'
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Pilih Dari Buku ({books.length})
              </button>
              <button
                type="button"
                onClick={() => setCalcMode('manual')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors ${
                  calcMode === 'manual'
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Input Manual
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
            {/* Input Form Column */}
            <div className="md:col-span-7 space-y-3">
              {calcMode === 'buku' ? (
                <div>
                  <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                    Pilih Naskah Buku:
                  </label>
                  <select
                    value={selectedCalcBookNo}
                    onChange={(e) => setSelectedCalcBookNo(Number(e.target.value))}
                    className="w-full py-2 px-3 rounded-xl bg-slate-800 text-white text-xs font-bold border border-white/20 focus:outline-none"
                  >
                    {books.map((b) => (
                      <option key={`opt-book-${b.no}`} value={b.no}>
                        #{b.no} {b.judul} ({b.penulis}) — {b.halamanFinal || b.halamanAwal} hlm [Paket {b.paket}]
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                      Nama / Judul Naskah:
                    </label>
                    <input
                      type="text"
                      value={manualTitle}
                      onChange={(e) => setManualTitle(e.target.value)}
                      placeholder="Contoh: Buku Ajar Ekonomi"
                      className="w-full px-3 py-2 rounded-xl bg-slate-800 text-white text-xs font-bold border border-white/20 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                      Jumlah Halaman:
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={manualPages}
                      onChange={(e) => setManualPages(Math.max(1, parseInt(e.target.value, 10) || 1))}
                      className="w-full px-3 py-2 rounded-xl bg-slate-800 text-white text-xs font-bold border border-white/20 focus:outline-none"
                    />
                  </div>
                </div>
              )}

              {/* Pilihan Paket */}
              <div>
                <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                  Paket Layout Digunakan:
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['Basic', 'Standart', 'Premium'] as const).map((pkt) => {
                    const isSelected =
                      calcMode === 'buku'
                        ? (selectedCalcBook?.paket || 'Standart') === pkt
                        : manualPaket === pkt;

                    return (
                      <button
                        key={`calc-paket-btn-${pkt}`}
                        type="button"
                        onClick={() => {
                          if (calcMode === 'manual') setManualPaket(pkt);
                        }}
                        className={`p-2 rounded-xl text-xs font-bold border transition-all text-center ${
                          isSelected
                            ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-sm'
                            : 'bg-slate-800/80 text-slate-300 border-white/10 hover:border-white/30'
                        } ${calcMode === 'buku' ? 'cursor-default' : 'cursor-pointer'}`}
                      >
                        <div>{pkt}</div>
                        <div className="text-[10px] font-normal opacity-90">
                          @{formatRupiah(packageRates[pkt])}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Hasil Perhitungan Box */}
            <div className="md:col-span-5 bg-gradient-to-br from-blue-600/40 to-indigo-700/40 border border-blue-400/40 p-4 rounded-2xl flex flex-col justify-between">
              <div>
                <span className="text-[11px] font-bold text-blue-200 uppercase tracking-wider block">
                  Estimasi Biaya Layout:
                </span>
                <div className="text-2xl sm:text-3xl font-black text-amber-300 tabular-nums mt-1">
                  {displayRupiah(calculatedEstimatedCost)}
                </div>

                <div className="text-xs text-slate-200 mt-2 space-y-1">
                  <div className="flex items-center justify-between border-b border-white/10 pb-1">
                    <span className="text-slate-300">Total Halaman:</span>
                    <strong className="text-white">{currentCalcPages} hlm</strong>
                  </div>
                  <div className="flex items-center justify-between border-b border-white/10 pb-1">
                    <span className="text-slate-300">Tarif Paket ({currentCalcPaket}):</span>
                    <strong className="text-white">{formatRupiah(currentRatePerHalaman)} /hlm</strong>
                  </div>
                  <div className="flex items-center justify-between pt-0.5 text-[11px] text-amber-200">
                    <span>Rumus:</span>
                    <span>{currentCalcPages} hlm &times; {formatRupiah(currentRatePerHalaman)}</span>
                  </div>
                </div>
              </div>

              {calcMode === 'buku' && selectedCalcBook && (
                <div className="mt-3 pt-2 border-t border-white/10 text-[11px] text-slate-300 flex items-center justify-between">
                  <span>Nilai Jasa di data:</span>
                  <span className="font-bold text-white tabular-nums">
                    {displayRupiah(selectedCalcBook.nilaiJasa)}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export const KeuanganTab: React.FC<KeuanganTabProps> = ({
  books,
  onSelectBook,
  selectedInvoiceBookId,
  activeSubTab = 'ringkasan',
  onSubTabChange,
  onSelectInvoiceBookId,
  currentUid,
}) => {
  const [internalSubTab, setInternalSubTab] = useState<KeuanganSubTab>(activeSubTab);
  const [internalInvoiceBookId, setInternalInvoiceBookId] = useState<number | null>(
    selectedInvoiceBookId || null
  );
  // Default tersembunyi setiap kali tab Keuangan dibuka (pilihan terakhir tidak disimpan)
  const [hideNominals, setHideNominals] = useState<boolean>(true);

  useEffect(() => {
    if (activeSubTab) {
      setInternalSubTab(activeSubTab);
    }
  }, [activeSubTab]);

  useEffect(() => {
    if (selectedInvoiceBookId !== undefined) {
      setInternalInvoiceBookId(selectedInvoiceBookId);
    }
  }, [selectedInvoiceBookId]);

  const handleSubTabChange = (nextSub: KeuanganSubTab) => {
    setInternalSubTab(nextSub);
    onSubTabChange?.(nextSub);
  };

  const handleGoToInvoiceForBook = (bookId: number) => {
    setInternalInvoiceBookId(bookId);
    onSelectInvoiceBookId?.(bookId);
    handleSubTabChange('invoice');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="space-y-6">
      {/* 1. Sub Header Navigasi Keuangan (Disembunyikan saat cetak) */}
      <div className="no-print print:hidden bg-white dark:bg-slate-900 rounded-3xl p-4 sm:p-5 border border-slate-200/80 dark:border-slate-800 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="w-9 h-9 rounded-xl bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 font-bold flex items-center justify-center shrink-0">
              <Wallet className="w-5 h-5" />
            </span>
            <div>
              <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white tracking-tight">
                Manajemen Keuangan &amp; Faktur Tagihan
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Pilih sub-menu untuk melihat ringkasan omzet, membuat faktur, atau cek riwayat penagihan
              </p>
            </div>
          </div>

          {/* Tombol Mata di HP */}
          <button
            type="button"
            onClick={() => setHideNominals((prev) => !prev)}
            aria-pressed={hideNominals}
            aria-label={hideNominals ? 'Tampilkan nominal' : 'Sembunyikan nominal'}
            title={hideNominals ? 'Tampilkan nominal' : 'Sembunyikan nominal'}
            className="lg:hidden min-w-[44px] min-h-[44px] rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 flex items-center justify-center shrink-0 transition-colors"
          >
            {hideNominals ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4 text-blue-600 dark:text-blue-400" />}
          </button>
        </div>

        {/* Sub Tabs Pill Control + Tombol Mata Desktop */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-2xl border border-slate-200/80 dark:border-slate-700/60 overflow-x-auto no-scrollbar flex-1 sm:flex-initial">
            <button
              type="button"
              onClick={() => handleSubTabChange('ringkasan')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 ${
                internalSubTab === 'ringkasan'
                  ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <TrendingUp className="w-3.5 h-3.5" />
              <span>Ringkasan &amp; Piutang</span>
            </button>

            <button
              type="button"
              onClick={() => handleSubTabChange('invoice')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 ${
                internalSubTab === 'invoice'
                  ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Receipt className="w-3.5 h-3.5" />
              <span>Buat &amp; Cetak Invoice</span>
            </button>

            <button
              type="button"
              onClick={() => handleSubTabChange('riwayat')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 ${
                internalSubTab === 'riwayat'
                  ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              <span>Riwayat Invoice</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => setHideNominals((prev) => !prev)}
            aria-pressed={hideNominals}
            aria-label={hideNominals ? 'Tampilkan nominal' : 'Sembunyikan nominal'}
            title={hideNominals ? 'Tampilkan nominal' : 'Sembunyikan nominal'}
            className="hidden lg:flex min-w-[44px] min-h-[38px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 items-center justify-center gap-1.5 text-xs font-bold shrink-0 transition-colors"
          >
            {hideNominals ? (
              <>
                <EyeOff className="w-4 h-4" />
                <span>Tampilkan</span>
              </>
            ) : (
              <>
                <Eye className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span>Sembunyikan</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* 2. Render Sub-view Sesuai Tab yang Dipilih */}
      {internalSubTab === 'ringkasan' && (
        <KeuanganRingkasanView
          books={books}
          onSelectBook={onSelectBook}
          onGoToInvoice={handleGoToInvoiceForBook}
          currentUid={currentUid}
          hideNominals={hideNominals}
        />
      )}

      {internalSubTab === 'invoice' && (
        <InvoiceTab
          books={books}
          selectedBookId={internalInvoiceBookId}
        />
      )}

      {internalSubTab === 'riwayat' && (
        <RiwayatInvoiceTab
          books={books}
          onGoToInvoiceTab={handleGoToInvoiceForBook}
          hideNominals={hideNominals}
        />
      )}
    </div>
  );
};
