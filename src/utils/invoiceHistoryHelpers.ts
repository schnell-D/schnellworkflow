import { BookJob } from '../types';

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
  finishedBooks: readonly BookJob[]
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
    const da = a.tglSelesaiLayout || '9999-99-99';
    const db = b.tglSelesaiLayout || '9999-99-99';
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
      .map((b) => b.tglSelesaiLayout)
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

export function bookMatchesMonthFilter(book: BookJob, selectedMonth: string): boolean {
  if (selectedMonth === 'all') return true;
  return (
    book.tglSelesaiLayout?.substring(0, 7) === selectedMonth ||
    book.tglInvoice?.substring(0, 7) === selectedMonth ||
    book.tglDibayar?.substring(0, 7) === selectedMonth
  );
}

export function groupMatchesMonthFilter(group: InvoiceGroup, selectedMonth: string): boolean {
  if (selectedMonth === 'all') return true;
  if (
    group.tglInvoice?.substring(0, 7) === selectedMonth ||
    group.tglDibayar?.substring(0, 7) === selectedMonth
  ) {
    return true;
  }
  return group.books.some((b) => bookMatchesMonthFilter(b, selectedMonth));
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
