import { ActivityEntry, BookJob, BookLog } from '../types';
import { normalizeIsoDate } from './bookHelpers';
import { DEFAULT_STATUS_SELESAI, isStatusSelesai } from '../config/masterData';

const INVOICE_CUSTOM_FIELD_KEYS = new Set([
  'noinvoice',
  'nomorinvoice',
  'nomerinvoice',
  'invoiceno',
  'invoicenumber',
  'noinv',
  'nomorinv',
  'nofaktur',
  'nomorfaktur',
  'kodeinvoice',
]);

export interface CompletionDateResolveOptions {
  activity?: ActivityEntry[];
  logs?: BookLog[];
  statusSelesai?: string;
}

/**
 * Mengecek apakah status buku termasuk status selesai akhir (Selesai / Finish / custom statusSelesai).
 */
export function isBookCompletedStatus(
  status: string | undefined | null,
  customStatusSelesai: string = DEFAULT_STATUS_SELESAI
): boolean {
  const norm = String(status || '').trim().toLowerCase();
  if (!norm) return false;
  return (
    norm === 'selesai' ||
    norm === 'finish' ||
    isStatusSelesai(status, customStatusSelesai)
  );
}

function normalizeDateLike(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  if (
    typeof raw === 'object' &&
    'toDate' in raw &&
    typeof (raw as { toDate?: unknown }).toDate === 'function'
  ) {
    try {
      const dt = (raw as { toDate: () => Date }).toDate();
      return normalizeIsoDate(dt).value;
    } catch {
      return null;
    }
  }
  return normalizeIsoDate(raw).value;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function textIndicatesTransitionToSelesai(
  rawText: string,
  customStatusSelesai?: string
): boolean {
  const text = rawText.trim().toLowerCase();
  if (!text) return false;
  if (text.includes('belum selesai')) return false;

  const targets = ['selesai', 'finish'];
  const customClean = customStatusSelesai?.trim().toLowerCase();
  if (customClean && !targets.includes(customClean)) {
    targets.push(customClean);
  }

  const targetPattern = targets.map(escapeRegex).join('|');
  const explicitTargetRegex = new RegExp(
    `(?:->|=>|\\bke\\b|\\bmenjadi\\b|:)\\s*(?:${targetPattern})\\b`,
    'i'
  );
  if (explicitTargetRegex.test(text)) return true;

  const fromSelesaiRegex = new RegExp(`\\bdari\\s+(?:${targetPattern})\\b`, 'i');
  if (fromSelesaiRegex.test(text)) return false;

  const bareTargetRegex = new RegExp(`\\b(?:${targetPattern})\\b`, 'i');
  return bareTargetRegex.test(text);
}

function logTextIndicatesStatusToSelesai(
  rawText: string,
  customStatusSelesai?: string
): boolean {
  const text = rawText.trim().toLowerCase();
  if (!text || text.includes('belum selesai')) return false;

  const targets = ['selesai', 'finish'];
  const customClean = customStatusSelesai?.trim().toLowerCase();
  if (customClean && !targets.includes(customClean)) {
    targets.push(customClean);
  }
  const targetPattern = targets.map(escapeRegex).join('|');
  const statusChangeRegex = new RegExp(
    `\\bstatus\\b[^\\n]*?\\b(?:berubah|ubah|diubah|menjadi|ke|->|:)\\s*(?:${targetPattern})\\b`,
    'i'
  );
  return statusChangeRegex.test(text);
}

function matchesBookRef(
  book: BookJob,
  refBookId?: string,
  refBookNo?: number
): boolean {
  if (book.id && refBookId && refBookId === book.id) return true;
  if (book.no > 0 && typeof refBookNo === 'number' && refBookNo === book.no) return true;
  return false;
}

/**
 * Sumber tunggal tanggal selesai buku ("Tgl Selesai"):
 * 1. Field `tglSelesai` pada buku, jika terisi (termasuk yang diisi manual).
 * 2. Riwayat perubahan status ke Selesai/Finish (aktivitas `book_status` dan log status eksplisit); jika ada beberapa, ambil yang terbaru.
 * 3. Tanggal "Update" (`updateTerakhir`, field yang sama dengan "Lama di Status Ini"), hanya jika status buku saat ini Selesai/Finish.
 * 4. Field `tglSelesaiLayout`, hanya jika valid dan tidak sama dengan `tglTerima`.
 * 5. Jika semuanya tidak ada, mengembalikan null (tampil "-") dan TIDAK pernah memakai `tglTerima`.
 */
export function resolveBookCompletionDate(
  book: BookJob,
  options?: CompletionDateResolveOptions
): string | null {
  const tglTerimaNorm = normalizeDateLike(book.tglTerima);

  // 1. Field tglSelesai pada buku jika terisi
  const directCompletion = normalizeDateLike(book.tglSelesai);
  if (directCompletion) {
    return directCompletion;
  }

  // 2. Riwayat perubahan status ke Selesai/Finish (gabungkan activity book_status & log status eksplisit, ambil terbaru)
  const historyDates: string[] = [];

  if (options?.activity && options.activity.length > 0) {
    for (const entry of options.activity) {
      if (
        entry.type === 'book_status' &&
        matchesBookRef(book, entry.bookId, entry.bookNo) &&
        textIndicatesTransitionToSelesai(
          `${entry.title || ''} ${entry.detail || ''}`,
          options.statusSelesai
        )
      ) {
        const dt = normalizeDateLike(entry.createdAt);
        if (dt) historyDates.push(dt);
      }
    }
  }

  if (options?.logs && options.logs.length > 0) {
    for (const log of options.logs) {
      if (
        Boolean(log.tanggal) &&
        matchesBookRef(book, log.bookId, log.bookNo) &&
        logTextIndicatesStatusToSelesai(log.isi || '', options.statusSelesai)
      ) {
        const dt = normalizeDateLike(log.tanggal);
        if (dt) historyDates.push(dt);
      }
    }
  }

  if (historyDates.length > 0) {
    historyDates.sort((a, b) => b.localeCompare(a));
    return historyDates[0];
  }

  // 3. Tanggal "Update" pada Status Saat Ini (updateTerakhir), hanya jika status buku saat ini Selesai/Finish
  if (isBookCompletedStatus(book.statusProgres, options?.statusSelesai)) {
    const updateDate = normalizeDateLike(book.updateTerakhir);
    if (updateDate) {
      return updateDate;
    }
  }

  // 4. Field tglSelesaiLayout hanya jika valid dan tidak sama dengan tglTerima
  const layoutCompletion = normalizeDateLike(book.tglSelesaiLayout);
  if (layoutCompletion && (!tglTerimaNorm || layoutCompletion !== tglTerimaNorm)) {
    return layoutCompletion;
  }

  // 5. Kosong -> tampil "-" (jangan pernah memakai tglTerima)
  return null;
}

/**
 * Mengambil nomor invoice yang SUDAH TERSIMPAN pada data buku tanpa membuat atau mengubah nomor baru.
 */
export function resolveSavedInvoiceNumber(book: BookJob): string | null {
  const direct = book.noInvoice;
  if (typeof direct === 'string') {
    const trimmed = direct.trim();
    if (trimmed && trimmed !== '-' && trimmed.toLowerCase() !== 'null') {
      return trimmed;
    }
  }

  if (book.customFields && typeof book.customFields === 'object') {
    for (const [key, val] of Object.entries(book.customFields)) {
      const normKey = key.toLowerCase().replace(/[\s_.-]+/g, '');
      if (INVOICE_CUSTOM_FIELD_KEYS.has(normKey)) {
        const str = val !== null && val !== undefined ? String(val).trim() : '';
        if (str && str !== '-' && str.toLowerCase() !== 'null') {
          return str;
        }
      }
    }
  }

  return null;
}

export interface InvoiceGroup {
  groupKey: string;
  invoiceNo: string;
  hasSavedInvoiceNo: boolean;
  tglInvoice: string | null;
  tglDibayar: string | null;
  status: 'Belum Dibayar' | 'Lunas';
  books: BookJob[];
  totalTagihan: number;
  latestTglSelesai: string | null;
  maxBookNo: number;
}

export interface InvoiceHistorySections {
  belumDitagih: BookJob[];
  belumDibayar: InvoiceGroup[];
  lunas: InvoiceGroup[];
}

function compareIsoDesc(a: string | null, b: string | null): number {
  const va = a || '0000-00-00';
  const vb = b || '0000-00-00';
  return vb.localeCompare(va);
}

/**
 * Mengelompokkan buku selesai ke 3 bagian:
 * 1. Belum Ditagih (urut tgl selesai terlama -> terbaru)
 * 2. Belum Dibayar (dikelompokkan per nomor invoice tersimpan, urut terbaru -> terlama)
 * 3. Lunas (dikelompokkan per nomor invoice tersimpan, urut terbaru -> terlama)
 */
export function buildInvoiceHistorySections(
  finishedBooks: readonly BookJob[],
  options?: CompletionDateResolveOptions
): InvoiceHistorySections {
  const belumDitagih: BookJob[] = [];
  const groupBuckets = new Map<string, { savedInvNo: string | null; books: BookJob[] }>();

  for (const book of finishedBooks) {
    const savedInvNo = resolveSavedInvoiceNumber(book);

    if (!savedInvNo && book.statusBayar === 'Belum Ditagih') {
      belumDitagih.push(book);
      continue;
    }

    const groupKey = savedInvNo
      ? `inv:${savedInvNo.toLowerCase()}`
      : `unnumbered:${book.id || book.no}`;

    const bucket = groupBuckets.get(groupKey);
    if (bucket) {
      bucket.books.push(book);
    } else {
      groupBuckets.set(groupKey, { savedInvNo, books: [book] });
    }
  }

  // Belum Ditagih: urutkan dari tanggal selesai TERLAMA ke TERBARU
  belumDitagih.sort((a, b) => {
    const da = resolveBookCompletionDate(a, options) || '9999-99-99';
    const db = resolveBookCompletionDate(b, options) || '9999-99-99';
    const cmp = da.localeCompare(db);
    if (cmp !== 0) return cmp;
    return a.no - b.no;
  });

  const belumDibayar: InvoiceGroup[] = [];
  const lunas: InvoiceGroup[] = [];

  for (const [groupKey, bucket] of groupBuckets.entries()) {
    const sortedBooks = [...bucket.books].sort((a, b) => a.no - b.no);
    const totalTagihan = sortedBooks.reduce((sum, b) => sum + (b.nilaiJasa || 0), 0);
    const allLunas = sortedBooks.every((b) => b.statusBayar === 'Lunas');
    const status: 'Belum Dibayar' | 'Lunas' = allLunas ? 'Lunas' : 'Belum Dibayar';

    const tglInvoice =
      sortedBooks.find((b) => Boolean(b.tglInvoice))?.tglInvoice || null;

    let tglDibayar: string | null = null;
    if (status === 'Lunas') {
      const paidDates = sortedBooks
        .map((b) => b.tglDibayar)
        .filter((d): d is string => Boolean(d))
        .sort((a, b) => b.localeCompare(a));
      tglDibayar = paidDates[0] || null;
    }

    const selesaiDates = sortedBooks
      .map((b) => resolveBookCompletionDate(b, options))
      .filter((d): d is string => Boolean(d))
      .sort((a, b) => b.localeCompare(a));

    const maxBookNo = sortedBooks.reduce((m, b) => Math.max(m, b.no), 0);

    const group: InvoiceGroup = {
      groupKey,
      invoiceNo: bucket.savedInvNo || '-',
      hasSavedInvoiceNo: Boolean(bucket.savedInvNo),
      tglInvoice,
      tglDibayar,
      status,
      books: sortedBooks,
      totalTagihan,
      latestTglSelesai: selesaiDates[0] || null,
      maxBookNo,
    };

    if (status === 'Lunas') {
      lunas.push(group);
    } else {
      belumDibayar.push(group);
    }
  }

  // Belum Dibayar & Lunas: urutkan dari yang TERBARU ke TERLAMA
  const sortNewestFirst = (a: InvoiceGroup, b: InvoiceGroup): number => {
    const primaryA = a.tglInvoice || a.latestTglSelesai;
    const primaryB = b.tglInvoice || b.latestTglSelesai;
    const cmp = compareIsoDesc(primaryA, primaryB);
    if (cmp !== 0) return cmp;
    const payCmp = compareIsoDesc(a.tglDibayar, b.tglDibayar);
    if (payCmp !== 0) return payCmp;
    return b.maxBookNo - a.maxBookNo;
  };

  belumDibayar.sort(sortNewestFirst);
  lunas.sort(sortNewestFirst);

  return { belumDitagih, belumDibayar, lunas };
}

export function bookMatchesMonthFilter(
  book: BookJob,
  selectedMonth: string,
  options?: CompletionDateResolveOptions
): boolean {
  if (selectedMonth === 'all') return true;
  const completionDate = resolveBookCompletionDate(book, options);
  return (
    completionDate?.substring(0, 7) === selectedMonth ||
    book.tglInvoice?.substring(0, 7) === selectedMonth ||
    book.tglDibayar?.substring(0, 7) === selectedMonth
  );
}

export function groupMatchesMonthFilter(
  group: InvoiceGroup,
  selectedMonth: string,
  options?: CompletionDateResolveOptions
): boolean {
  if (selectedMonth === 'all') return true;
  if (
    group.tglInvoice?.substring(0, 7) === selectedMonth ||
    group.tglDibayar?.substring(0, 7) === selectedMonth
  ) {
    return true;
  }
  return group.books.some((b) => bookMatchesMonthFilter(b, selectedMonth, options));
}

export function bookMatchesSearchFilter(book: BookJob, rawQuery: string): boolean {
  const q = rawQuery.trim().toLowerCase();
  if (!q) return true;
  const savedInv = resolveSavedInvoiceNumber(book);
  return (
    book.judul.toLowerCase().includes(q) ||
    book.penulis.toLowerCase().includes(q) ||
    (savedInv ? savedInv.toLowerCase().includes(q) : false)
  );
}

export function groupMatchesSearchFilter(group: InvoiceGroup, rawQuery: string): boolean {
  const q = rawQuery.trim().toLowerCase();
  if (!q) return true;
  if (group.hasSavedInvoiceNo && group.invoiceNo.toLowerCase().includes(q)) {
    return true;
  }
  return group.books.some(
    (b) =>
      b.judul.toLowerCase().includes(q) ||
      b.penulis.toLowerCase().includes(q)
  );
}
