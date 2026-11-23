import React, { useState, useMemo } from 'react';
import {
  Printer,
  Copy,
  Check,
  Receipt,
  CreditCard,
  CheckSquare,
  Square,
  Plus,
  Trash2,
  Calendar,
  Building,
  User,
  Tag,
  AlertCircle,
  HelpCircle,
  Search,
  X,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { ActivityEntry, BookJob, BookLog } from '../types';
import {
  formatRupiah,
  formatDateIndo,
  angkaTerbilang,
  getInvoiceNumber,
} from '../utils/formatters';
import {
  isBookCompletedStatus,
  resolveBookCompletionDate,
} from '../utils/invoiceHistoryHelpers';

export interface BookExtraFee {
  id: string;
  keterangan: string;
  nominal: number;
}

interface InvoiceTabProps {
  books: BookJob[];
  selectedBookId?: number | null;
  activity?: ActivityEntry[];
  logs?: BookLog[];
  statusSelesai?: string;
}

export const InvoiceTab: React.FC<InvoiceTabProps> = ({
  books,
  selectedBookId,
  activity,
  logs,
  statusSelesai,
}) => {
  // 1. Saring HANYA BUKU YANG SUDAH SELESAI
  const finishedBooks = useMemo(() => {
    return books.filter((b) => isBookCompletedStatus(b.statusProgres, statusSelesai));
  }, [books, statusSelesai]);

  // ID buku yang dipilih untuk di-invoice
  const [selectedBookIds, setSelectedBookIds] = useState<number[]>(() => {
    if (selectedBookId && finishedBooks.some((b) => b.no === selectedBookId)) {
      return [selectedBookId];
    }
    const readyToBill = finishedBooks.filter((b) => b.statusBayar === 'Belum Ditagih');
    if (readyToBill.length > 0) return [readyToBill[0].no];
    return finishedBooks.length > 0 ? [finishedBooks[0].no] : [];
  });

  // Task per buku ('Layout' atau 'Desain')
  const [taskTypes, setTaskTypes] = useState<Record<number, 'Layout' | 'Desain'>>({});

  // 1. FORM DI ATAS LIST BUKU
  const [customInvoiceNo, setCustomInvoiceNo] = useState('');
  const [invoiceDate, setInvoiceDate] = useState('2026-11-02');
  const [dueDateDays, setDueDateDays] = useState<number>(14); // 7, 14, 30 hari
  const [recipientName, setRecipientName] = useState('');
  const [recipientAddress, setRecipientAddress] = useState('');
  const [defaultTask, setDefaultTask] = useState<'Layout' | 'Desain'>('Layout');

  // 2. TAMBAHAN BIAYA PER BUKU (disimpan dengan kunci bookNo)
  // Contoh: { 1: [{ id: 'e1', keterangan: 'Ongkir kirim revisi fisik', nominal: 50000 }] }
  const [bookExtras, setBookExtras] = useState<Record<number, BookExtraFee[]>>({
    1: [
      {
        id: 'init-1',
        keterangan: 'Ongkir ekspedisi kirim dummy buku cetak revisi fisik',
        nominal: 50000,
      },
    ],
  });

  const [copied, setCopied] = useState(false);

  // Filter & Pencarian Buku
  const [bookSearchQuery, setBookSearchQuery] = useState('');
  const [bookFilterStatus, setBookFilterStatus] = useState<'semua' | 'siapTagih' | 'terpilih'>('semua');
  const [expandedExtras, setExpandedExtras] = useState<Record<number, boolean>>({ 1: true });

  // Jumlah buku siap tagih (belum ditagih)
  const readyToBillCount = useMemo(() => {
    return finishedBooks.filter((b) => b.statusBayar === 'Belum Ditagih').length;
  }, [finishedBooks]);

  // Saring buku selesai berdasarkan pencarian & filter
  const displayedFinishedBooks = useMemo(() => {
    return finishedBooks.filter((book) => {
      // Pencarian (judul, penulis, no)
      if (bookSearchQuery.trim()) {
        const q = bookSearchQuery.toLowerCase();
        const matchTitle = book.judul.toLowerCase().includes(q);
        const matchAuthor = book.penulis.toLowerCase().includes(q);
        const matchNo = `#${book.no}`.includes(q) || String(book.no) === q;
        if (!matchTitle && !matchAuthor && !matchNo) return false;
      }

      // Filter status
      if (bookFilterStatus === 'siapTagih' && book.statusBayar !== 'Belum Ditagih') {
        return false;
      }
      if (bookFilterStatus === 'terpilih' && !selectedBookIds.includes(book.no)) {
        return false;
      }

      return true;
    });
  }, [finishedBooks, bookSearchQuery, bookFilterStatus, selectedBookIds]);

  // Daftar buku yang aktif dipilih dalam invoice ini
  const invoicedBooks = useMemo(() => {
    return finishedBooks.filter((b) => selectedBookIds.includes(b.no));
  }, [finishedBooks, selectedBookIds]);

  // Nomor Invoice Otomatis
  const primaryBookNo = invoicedBooks[0]?.no || 1;
  const autoInvoiceNo = useMemo(() => {
    return getInvoiceNumber(primaryBookNo, invoiceDate);
  }, [primaryBookNo, invoiceDate]);

  const activeInvoiceNo = customInvoiceNo.trim() || autoInvoiceNo;

  // Tanggal Jatuh Tempo
  const dueDateStr = useMemo(() => {
    try {
      const d = new Date(invoiceDate);
      d.setDate(d.getDate() + dueDateDays);
      return d.toISOString().split('T')[0];
    } catch {
      return '2026-11-16';
    }
  }, [invoiceDate, dueDateDays]);

  // Perhitungan Subtotal Jasa Buku dan Biaya Tambahan Per Buku
  const subtotalJasaMurni = invoicedBooks.reduce((sum, b) => sum + b.nilaiJasa, 0);

  const totalExtraAll = invoicedBooks.reduce((sum, b) => {
    const extras = bookExtras[b.no] || [];
    const bookExtraTotal = extras.reduce((eSum, item) => eSum + (item.nominal || 0), 0);
    return sum + bookExtraTotal;
  }, 0);

  const totalTagihan = subtotalJasaMurni + totalExtraAll;

  // Nama Klien Ditagihkan
  const displayClientName = recipientName.trim() || invoicedBooks[0]?.penulis || 'Klien / Penerbit Buku';

  // Toggle pilihan buku
  const toggleSelectBook = (id: number) => {
    if (selectedBookIds.includes(id)) {
      if (selectedBookIds.length > 1) {
        setSelectedBookIds(selectedBookIds.filter((bId) => bId !== id));
      }
    } else {
      setSelectedBookIds([...selectedBookIds, id]);
    }
  };

  // Helper Tambah Biaya Tambahan untuk Buku Tertentu
  const addExtraFeeToBook = (bookNo: number) => {
    const current = bookExtras[bookNo] || [];
    const newEntry: BookExtraFee = {
      id: `extra-${Date.now()}-${Math.random()}`,
      keterangan: '',
      nominal: 0,
    };
    setBookExtras({
      ...bookExtras,
      [bookNo]: [...current, newEntry],
    });
    setExpandedExtras((prev) => ({ ...prev, [bookNo]: true }));
  };

  const toggleExpandExtras = (bookNo: number) => {
    setExpandedExtras((prev) => ({ ...prev, [bookNo]: !prev[bookNo] }));
  };

  const handleSelectAllDisplayed = () => {
    const ids = displayedFinishedBooks.map((b) => b.no);
    const combined = Array.from(new Set([...selectedBookIds, ...ids]));
    setSelectedBookIds(combined);
  };

  const handleDeselectAll = () => {
    if (selectedBookIds.length > 1) {
      setSelectedBookIds([selectedBookIds[0]]);
    }
  };

  const updateExtraFeeField = (
    bookNo: number,
    extraId: string,
    field: 'keterangan' | 'nominal',
    value: string
  ) => {
    const current = bookExtras[bookNo] || [];
    setBookExtras({
      ...bookExtras,
      [bookNo]: current.map((item): BookExtraFee => {
        if (item.id === extraId) {
          if (field === 'nominal') {
            const num = parseInt(value.replace(/[^0-9]/g, ''), 10) || 0;
            return { ...item, nominal: num };
          }
          return { ...item, keterangan: value };
        }
        return item;
      }),
    });
  };

  const removeExtraFeeFromBook = (bookNo: number, extraId: string) => {
    const current = bookExtras[bookNo] || [];
    setBookExtras({
      ...bookExtras,
      [bookNo]: current.filter((item) => item.id !== extraId),
    });
  };

  const handlePrint = () => {
    // Lepas kelas dark sementara saat dialog cetak terbuka agar tidak tercetak hitam
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
    const textLines = [
      `🧾 *FAKTUR INVOICE TAGIHAN LAYOUT BUKU*`,
      `────────────────────────`,
      `📄 *Nomor Invoice:* ${activeInvoiceNo}`,
      `📅 *Tanggal Invoice:* ${formatDateIndo(invoiceDate)}`,
      `⏳ *Jatuh Tempo:* ${formatDateIndo(dueDateStr)} (${dueDateDays} hari)`,
      `👤 *Ditagihkan Kepada:* ${displayClientName}`,
      ...(recipientAddress ? [`🏢 *Alamat Klien:* ${recipientAddress}`] : []),
      `────────────────────────`,
      `📚 *RINCIAN PEKERJAAN & BIAYA PER BUKU:*`,
      ...invoicedBooks.map((b, idx) => {
        const task = taskTypes[b.no] || defaultTask;
        const extras = (bookExtras[b.no] || []).filter(
          (e) => e.nominal > 0 && e.keterangan.trim() !== ''
        );
        const extraSum = extras.reduce((s, e) => s + e.nominal, 0);
        const bookTotal = b.nilaiJasa + extraSum;

        let bookBlock = `${idx + 1}. *${b.judul}*\n   ✍️ ${b.penulis} | Task: ${task} | ${b.paket} | ${b.halamanFinal || b.halamanAwal} hlm. | Jasa: ${formatRupiah(b.nilaiJasa)}`;
        if (extras.length > 0) {
          bookBlock += `\n   📦 *Tambahan Biaya Buku Ini:*`;
          extras.forEach((e) => {
            bookBlock += `\n      • ${e.keterangan}: +${formatRupiah(e.nominal)}`;
          });
          bookBlock += `\n   👉 *Subtotal Buku: ${formatRupiah(bookTotal)}*`;
        }
        return bookBlock;
      }),
      `────────────────────────`,
      `💵 *TOTAL TAGIHAN: ${formatRupiah(totalTagihan)}*`,
      `_(${angkaTerbilang(totalTagihan)})_`,
      ``,
      `💳 *Informasi Pembayaran:*`,
      `Bank Transfer: BCA *604 - 203 - 5544*`,
      `Atas Nama: Achmad Fazri Ramadhani`,
      `────────────────────────`,
      `_Mohon konfirmasi bukti transfer via WhatsApp jika pembayaran telah dilakukan. Terima kasih._`,
    ];

    navigator.clipboard.writeText(textLines.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="space-y-6">
      {/* =========================================================================
          PANEL FORM PENGATURAN INVOICE (DISEMBUNYIKAN SAAT CETAK)
          ========================================================================= */}
      <div className="no-print bg-white dark:bg-slate-900 rounded-3xl p-5 sm:p-6 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-6">
        {/* Header Panel */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold">
              <Receipt className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                Faktur Tagihan (Invoice)
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Data penagihan, pilihan buku selesai, dan biaya tambahan per buku.
              </p>
            </div>
          </div>

          {/* Tombol Aksi Cetak & Salin WA */}
          <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
            <button
              onClick={handleCopyWhatsApp}
              className="px-3.5 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors flex items-center gap-1.5"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="text-emerald-600 dark:text-emerald-400">Tersalin!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Salin Tagihan WA</span>
                </>
              )}
            </button>

            <button
              onClick={handlePrint}
              className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-all flex items-center gap-2 shadow-sm"
            >
              <Printer className="w-4 h-4" />
              <span>Cetak / Simpan PDF</span>
            </button>
          </div>
        </div>

        {/* 1. INFORMASI TAGIHAN & KLIEN (DI ATAS LIST BUKU) */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-blue-600" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
              Informasi Tagihan & Klien
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {/* Nomor Invoice */}
            <div>
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                Nomor Invoice:
              </label>
              <input
                type="text"
                value={customInvoiceNo}
                placeholder={autoInvoiceNo}
                onChange={(e) => setCustomInvoiceNo(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-mono font-bold text-slate-900 dark:text-white border-none focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Tanggal Invoice */}
            <div>
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                Tanggal Invoice:
              </label>
              <input
                type="date"
                value={invoiceDate}
                onChange={(e) => setInvoiceDate(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold text-slate-900 dark:text-white border-none focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Jatuh Tempo (7 hari / 14 hari / 30 hari) */}
            <div>
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                Jatuh Tempo:
              </label>
              <select
                value={dueDateDays}
                onChange={(e) => setDueDateDays(Number(e.target.value))}
                className="w-full px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold text-slate-900 dark:text-white border-none focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
              >
                <option value={7}>7 Hari Kalender</option>
                <option value={14}>14 Hari Kalender (Bawaan)</option>
                <option value={30}>30 Hari Kalender</option>
              </select>
            </div>

            {/* Ditagihkan Kepada (Klien) */}
            <div>
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                Ditagihkan Kepada (Klien):
              </label>
              <input
                type="text"
                value={recipientName}
                placeholder={invoicedBooks[0]?.penulis || 'Nama Penulis / Penerbit'}
                onChange={(e) => setRecipientName(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold text-slate-900 dark:text-white border-none focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Alamat Klien (Alamat Kantor) */}
            <div className="sm:col-span-2">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                Alamat Klien:
              </label>
              <input
                type="text"
                value={recipientAddress}
                placeholder="Jl. / Gedung / Kota kantor penerbit atau instansi klien"
                onChange={(e) => setRecipientAddress(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-medium text-slate-900 dark:text-white border-none focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Opsi Task Bawaan */}
          <div className="pt-2 flex flex-wrap items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-700 dark:text-slate-300">Task Bawaan:</span>
              <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg">
                {(['Layout', 'Desain'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setDefaultTask(t)}
                    className={`px-2.5 py-0.5 rounded-md font-bold text-xs transition-colors ${
                      defaultTask === t
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* 2. LIST BUKU SIAP TAGIH & INPUT BIAYA TAMBAHAN MASUKAN PER BUKU */}
        <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-3">
          {/* Header & Subjudul */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <label className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                Pilih Buku & Tambahan Biaya Per Buku
              </label>
              <span className="text-[11px] font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60 px-2 py-0.5 rounded-md">
                {selectedBookIds.length} buku dipilih ({formatRupiah(totalTagihan)})
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <button
                type="button"
                onClick={handleSelectAllDisplayed}
                className="text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:underline"
              >
                Pilih Semua
              </button>
              <span className="text-slate-300">·</span>
              <button
                type="button"
                onClick={handleDeselectAll}
                className="text-[11px] font-medium text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
              >
                Reset
              </button>
            </div>
          </div>

          {/* BAR PENCARIAN & FILTER CHIP (MEMUDAHKAN PEMILIHAN BUKU) */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            {/* Input Cari */}
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={bookSearchQuery}
                onChange={(e) => setBookSearchQuery(e.target.value)}
                placeholder="Cari judul buku, penulis, no (#1)..."
                className="w-full pl-8 pr-7 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs text-slate-900 dark:text-white border-none focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              {bookSearchQuery && (
                <button
                  type="button"
                  onClick={() => setBookSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Filter Chips: Semua / Siap Tagih / Terpilih */}
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-0.5 rounded-xl self-start sm:self-auto shrink-0">
              <button
                type="button"
                onClick={() => setBookFilterStatus('semua')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors ${
                  bookFilterStatus === 'semua'
                    ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                Semua ({finishedBooks.length})
              </button>
              <button
                type="button"
                onClick={() => setBookFilterStatus('siapTagih')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors ${
                  bookFilterStatus === 'siapTagih'
                    ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                Siap Tagih ({readyToBillCount})
              </button>
              <button
                type="button"
                onClick={() => setBookFilterStatus('terpilih')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors ${
                  bookFilterStatus === 'terpilih'
                    ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                Terpilih ({selectedBookIds.length})
              </button>
            </div>
          </div>

          {/* AREA SCROLL LIST BUKU (DIPENDEKKAN KE max-h-60 AGAR TIDAK MENUMPUK) */}
          {displayedFinishedBooks.length === 0 ? (
            <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 text-center text-xs text-slate-500 border border-slate-100 dark:border-slate-800 space-y-1.5">
              <p className="font-semibold text-slate-700 dark:text-slate-300">
                Tidak ada buku yang cocok dengan filter atau pencarian.
              </p>
              <button
                type="button"
                onClick={() => {
                  setBookSearchQuery('');
                  setBookFilterStatus('semua');
                }}
                className="text-blue-600 dark:text-blue-400 font-bold hover:underline"
              >
                Reset Filter
              </button>
            </div>
          ) : (
            <div className="space-y-2 max-h-60 overflow-y-auto p-1.5 border border-slate-200/80 dark:border-slate-800 rounded-2xl bg-slate-50/50 dark:bg-slate-800/20">
              {displayedFinishedBooks.map((book, idx) => {
                const isSelected = selectedBookIds.includes(book.no);
                const isReadyToBill = book.statusBayar === 'Belum Ditagih';
                const currentTask = taskTypes[book.no] || defaultTask;
                const bookExtraList = bookExtras[book.no] || [];
                const bookExtraTotal = bookExtraList.reduce((s, e) => s + (e.nominal || 0), 0);
                const isExpanded = !!expandedExtras[book.no];

                return (
                  <div
                    key={`inv-book-${book.no}-${idx}`}
                    className={`p-2.5 rounded-xl border text-xs transition-all space-y-2 ${
                      isSelected
                        ? 'bg-white dark:bg-slate-900 border-blue-400 dark:border-blue-700 ring-1 ring-blue-300 dark:ring-blue-900 shadow-xs'
                        : 'bg-white/70 dark:bg-slate-900/70 border-slate-200/80 dark:border-slate-800 hover:border-slate-300'
                    }`}
                  >
                    {/* Baris Ringkas Buku */}
                    <div className="flex items-center gap-2.5">
                      <div
                        onClick={() => toggleSelectBook(book.no)}
                        className="cursor-pointer text-blue-600 shrink-0"
                      >
                        {isSelected ? (
                          <CheckSquare className="w-4 h-4" />
                        ) : (
                          <Square className="w-4 h-4 text-slate-300" />
                        )}
                      </div>

                      <div className="min-w-0 flex-1 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                        <div className="min-w-0 flex-1 pr-2">
                          <div className="flex items-center gap-1.5">
                            <span
                              onClick={() => toggleSelectBook(book.no)}
                              className="font-bold text-slate-900 dark:text-white truncate cursor-pointer text-xs"
                            >
                              #{book.no} {book.judul}
                            </span>
                            {isReadyToBill && (
                              <span className="px-1.5 py-0.2 rounded text-[9px] font-extrabold bg-emerald-100 text-[#1A9E7A] dark:bg-emerald-950 dark:text-emerald-400 shrink-0">
                                Siap Tagih
                              </span>
                            )}
                          </div>
                          <p
                            onClick={() => toggleSelectBook(book.no)}
                            className="text-[11px] text-slate-500 truncate cursor-pointer mt-0.5"
                          >
                            {book.penulis} <span className="opacity-40">·</span> {book.paket} <span className="opacity-40">·</span> {book.halamanFinal || book.halamanAwal} hlm.
                          </p>
                        </div>

                        {/* Kontrol Task, Biaya Ekstra, dan Nominal */}
                        <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                          {/* Task: Layout / Desain */}
                          <select
                            value={currentTask}
                            onChange={(e) =>
                              setTaskTypes({
                                ...taskTypes,
                                [book.no]: e.target.value as 'Layout' | 'Desain',
                              })
                            }
                            className="py-0.5 px-1.5 rounded bg-slate-100 dark:bg-slate-800 text-[10px] font-bold text-slate-800 dark:text-slate-200 border-none focus:outline-none"
                          >
                            <option value="Layout">Layout</option>
                            <option value="Desain">Desain</option>
                          </select>

                          {/* Tombol Toggle / Tambah Biaya Ekstra */}
                          {isSelected && (
                            <button
                              type="button"
                              onClick={() => {
                                if (bookExtraList.length === 0) {
                                  addExtraFeeToBook(book.no);
                                } else {
                                  toggleExpandExtras(book.no);
                                }
                              }}
                              className={`px-2 py-0.5 rounded text-[10px] font-bold transition-colors flex items-center gap-1 ${
                                bookExtraList.length > 0
                                  ? 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300'
                                  : 'bg-slate-100 dark:bg-slate-800 text-blue-600 dark:text-blue-400 hover:bg-blue-50'
                              }`}
                            >
                              <span>
                                {bookExtraList.length > 0
                                  ? `+${bookExtraList.length} Ekstra`
                                  : '+ Ekstra'}
                              </span>
                              {bookExtraList.length > 0 && (
                                isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
                              )}
                            </button>
                          )}

                          {/* Nominal Tarif */}
                          <div className="text-right min-w-[85px]">
                            <span className="font-extrabold text-xs text-slate-900 dark:text-white tabular-nums block">
                              {formatRupiah(book.nilaiJasa + bookExtraTotal)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* DAFTAR BIAYA TAMBAHAN PER BUKU (HANYA DITAMPILKAN JIKA BUKU DIPILIH DAN EXPANDED) */}
                    {isSelected && bookExtraList.length > 0 && isExpanded && (
                      <div className="pl-6 pt-1.5 border-t border-slate-100 dark:border-slate-800 space-y-1.5 animate-fade-in">
                        <div className="flex items-center justify-between text-[10px] font-bold text-amber-800 dark:text-amber-400">
                          <span>Biaya Tambahan Buku #{book.no}:</span>
                          <button
                            type="button"
                            onClick={() => addExtraFeeToBook(book.no)}
                            className="text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-0.5"
                          >
                            <Plus className="w-3 h-3" />
                            <span>Tambah Item</span>
                          </button>
                        </div>

                        {bookExtraList.map((extra) => (
                          <div
                            key={extra.id}
                            className="flex items-center gap-1.5 p-1.5 rounded-lg bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-900/60"
                          >
                            <input
                              type="text"
                              value={extra.keterangan}
                              placeholder="Keterangan (misal: Ongkir revisi fisik dummy)"
                              onChange={(e) =>
                                updateExtraFeeField(book.no, extra.id, 'keterangan', e.target.value)
                              }
                              className="flex-1 px-2 py-0.5 rounded bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-white border border-amber-200 dark:border-amber-800 focus:outline-none"
                            />
                            <div className="flex items-center gap-1 shrink-0">
                              <span className="text-[10px] text-slate-400 font-semibold">Rp</span>
                              <input
                                type="number"
                                value={extra.nominal || ''}
                                placeholder="0"
                                onChange={(e) =>
                                  updateExtraFeeField(book.no, extra.id, 'nominal', e.target.value)
                                }
                                className="w-24 px-1.5 py-0.5 rounded bg-white dark:bg-slate-900 text-xs font-bold text-slate-900 dark:text-white border border-amber-200 dark:border-amber-800 text-right focus:outline-none"
                              />
                              <button
                                type="button"
                                onClick={() => removeExtraFeeFromBook(book.no, extra.id)}
                                className="p-1 text-slate-400 hover:text-rose-500 transition-colors"
                                title="Hapus biaya ekstra ini"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* =========================================================================
          PREVIEW DOKUMEN PDF INVOICE RESMI UKURAN A4
          ========================================================================= */}
      <div className="printable-report bg-white text-slate-900 rounded-3xl p-6 sm:p-10 shadow-lg border border-slate-200 dark:border-slate-800 mx-auto max-w-4xl font-sans print:shadow-none print:border-none print:rounded-none print:p-0 print:m-0 print:bg-white print:text-slate-900">
        {/* KOPSURAT: FAKTUR INVOICE tanpa teks Schnell & tagline */}
        <div className="border-b-2 border-slate-900 pb-5 mb-6 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black tracking-tight text-slate-900 uppercase">
              FAKTUR INVOICE
            </h1>
          </div>

          <div className="text-left sm:text-right">
            <p className="text-xs font-mono font-bold text-slate-900">
              No: {activeInvoiceNo}
            </p>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Tanggal: <strong>{formatDateIndo(invoiceDate)}</strong>
            </p>
          </div>
        </div>

        {/* DITAGIHKAN KEPADA + ALAMAT KANTOR */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6 bg-slate-50 p-4 rounded-xl border border-slate-200">
          <div>
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
              DITAGIHKAN KEPADA:
            </span>
            <p className="text-sm font-extrabold text-slate-900 mt-1">
              {displayClientName}
            </p>
            {recipientAddress ? (
              <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
                {recipientAddress}
              </p>
            ) : (
              <p className="text-xs text-slate-400 italic mt-0.5">
                (Alamat kantor/klien belum diisi)
              </p>
            )}
          </div>

          <div className="sm:text-right">
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
              STATUS & JATUH TEMPO:
            </span>
            <div className="mt-1 flex items-center sm:justify-end gap-2">
              <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-amber-100 text-amber-800 uppercase">
                Menunggu Pembayaran
              </span>
            </div>
            <p className="text-xs font-bold text-rose-600 mt-1">
              Jatuh Tempo: {formatDateIndo(dueDateStr)}
            </p>
            <p className="text-[11px] text-slate-500">
              Masa pelunasan {dueDateDays} hari kalender
            </p>
          </div>
        </div>

        {/* TABEL RINCIAN INVOICE:
            Kolom: No. - Task - Tgl Selesai - Judul Buku dan Penulis - Paket - Halaman - Nilai Jasa
            Tambahan Biaya Memanjang dari Task sampai Halaman (colSpan={5}, teks kecil) */}
        <div className="mb-0">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b-2 border-slate-900 bg-slate-100 text-[11px] font-bold text-slate-700">
                <th className="py-2.5 px-2 text-center w-8">No.</th>
                <th className="py-2.5 px-2 text-center w-16">Task</th>
                <th className="py-2.5 px-2 text-center whitespace-nowrap">Tgl Selesai</th>
                <th className="py-2.5 px-3">Judul Buku dan Penulis</th>
                <th className="py-2.5 px-2 text-center">Paket</th>
                <th className="py-2.5 px-2 text-right whitespace-nowrap">Halaman</th>
                <th className="py-2.5 px-3 text-right whitespace-nowrap">Nilai Jasa</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {invoicedBooks.map((book, idx) => {
                const currentTask = taskTypes[book.no] || defaultTask;
                const bookExtraList = (bookExtras[book.no] || []).filter(
                  (e) => e.nominal > 0 && e.keterangan.trim() !== ''
                );

                return (
                  <React.Fragment key={book.no}>
                    {/* Baris Utama Buku */}
                    <tr className="hover:bg-slate-50/50 align-top print-avoid-break">
                      <td className="py-3 px-2 text-center font-bold text-slate-600">
                        {idx + 1}
                      </td>
                      <td className="py-3 px-2 text-center font-bold text-blue-700">
                        {currentTask}
                      </td>
                      <td className="py-3 px-2 text-center text-slate-600 whitespace-nowrap">
                        {formatDateIndo(
                          resolveBookCompletionDate(book, {
                            activity,
                            logs,
                            statusSelesai,
                          })
                        )}
                      </td>
                      <td className="py-3 px-3">
                        {/* Judul Buku & Penulis */}
                        <div className="font-extrabold text-slate-900 text-sm leading-snug">
                          {book.judul}
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          {book.penulis}
                        </div>
                      </td>
                      <td className="py-3 px-2 text-center">
                        {/* Langsung nama paket tanpa kata "Paket" */}
                        <span className="font-semibold text-slate-800 px-2 py-0.5 bg-slate-100 rounded text-[11px]">
                          {book.paket}
                        </span>
                      </td>
                      <td className="py-3 px-2 text-right tabular-nums text-slate-800 font-semibold whitespace-nowrap">
                        {book.halamanFinal || book.halamanAwal} hlm.
                      </td>
                      <td className="py-3 px-3 text-right tabular-nums whitespace-nowrap">
                        <span className="font-extrabold text-slate-900 text-sm block">
                          {formatRupiah(book.nilaiJasa)}
                        </span>
                      </td>
                    </tr>

                    {/* Baris Biaya Tambahan: Memanjang dari kolom Task sampai Halaman (colSpan=5), teks kecil */}
                    {bookExtraList.map((extra) => (
                      <tr
                        key={extra.id}
                        className="bg-amber-50/70 border-t border-dashed border-amber-200/90 text-slate-700 print-avoid-break"
                      >
                        <td className="py-1.5 px-2 text-center text-amber-500 font-mono text-[10px]">
                          ↳
                        </td>
                        <td colSpan={5} className="py-1.5 px-3">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[9px] font-extrabold uppercase tracking-wider text-amber-800 bg-amber-200/90 px-1.5 py-0.5 rounded">
                              Tambahan Biaya
                            </span>
                            <span className="text-[10px] text-slate-700 font-medium">
                              {extra.keterangan}
                            </span>
                          </div>
                        </td>
                        <td className="py-1.5 px-3 text-right tabular-nums font-bold text-amber-900 text-xs whitespace-nowrap">
                          +{formatRupiah(extra.nominal)}
                        </td>
                      </tr>
                    ))}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* BLOK TOTAL & TERBILANG (SATU KESATUAN, TIDAK TERPOTONG & TIDAK BERULANG) */}
        <div className="print-avoid-break mb-6">
          {/* Total Keseluruhan */}
          <div className="border-t-2 border-slate-900 font-black bg-blue-50/70 text-slate-900 py-3 px-3 flex items-center justify-end gap-4 sm:gap-6 mb-4">
            <span className="uppercase text-xs text-blue-950 font-black text-right">
              TOTAL JUMLAH TAGIHAN:
            </span>
            <span className="tabular-nums text-base sm:text-lg text-blue-700 font-black whitespace-nowrap text-right">
              {formatRupiah(totalTagihan)}
            </span>
          </div>

          {/* TERBILANG KALIMAT INDONESIA */}
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs">
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
              TERBILANG:
            </span>
            <p className="font-serif italic font-bold text-slate-800 mt-0.5 text-xs sm:text-sm">
              # {angkaTerbilang(totalTagihan)} #
            </p>
          </div>
        </div>

        {/* INFORMASI PEMBAYARAN */}
        <div className="print-avoid-break grid grid-cols-1 sm:grid-cols-2 gap-6 pt-4 border-t border-slate-200 text-xs">
          {/* Informasi Pembayaran */}
          <div className="space-y-1.5">
            <span className="text-xs font-bold text-slate-900 uppercase tracking-wider block">
              Informasi Pembayaran:
            </span>
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
              <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-slate-900">
                <span className="flex items-center gap-1.5 text-slate-700">
                  <CreditCard className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                  <span>Bank Transfer: BCA</span>
                </span>
                {/* HIGHLIGHT NOMOR REKENING */}
                <mark className="px-2.5 py-0.5 rounded-md bg-amber-200/95 text-amber-950 font-mono font-black text-xs sm:text-sm tracking-wider border border-amber-300 shadow-2xs">
                  604 - 203 - 5544
                </mark>
              </div>
              <p className="text-xs text-slate-700">
                Atas Nama: <strong className="font-bold text-slate-900">Achmad Fazri Ramadhani</strong>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
