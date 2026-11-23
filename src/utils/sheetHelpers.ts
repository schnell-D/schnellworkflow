import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';
import { BookJob, KategoriType, PaketType, StatusProgresType, StatusBayarType } from '../types';
import {
  computeDerivedBookFields,
  normalizeIsoDate,
  normalizeKategori,
  normalizePaket,
  normalizeStatusBayar,
  normalizeStatusProgres,
} from './bookHelpers';

import {
  KATEGORI_BUKU_LIST,
  PAKET_LIST,
  STATUS_WORKFLOW_LIST,
  UKURAN_BUKU_LIST,
} from '../config/masterData';

/**
 * 20 Kolom Inti + 4 Kolom Tambahan (24 Kolom Standar Terbaru):
 * 1-20: No..Lama Layout Awal (kompatibel penuh dengan file lama 20/22 kolom)
 * 21-24: Ukuran Buku, Catatan Buku, Note Tambahan Biaya, Catatan Lain
 */
export const EXPECTED_SHEET_COLUMNS: readonly string[] = [
  'No',
  'Judul',
  'Penulis',
  'Kategori',
  'Paket',
  'Status Progres',
  'Tgl Terima',
  'Tgl Selesai Layout',
  'Update Terakhir',
  'Hari Berjalan',
  'Halaman Awal',
  'Halaman Final',
  'Stuck',
  'Nilai Jasa',
  'Status Bayar',
  'Tgl Invoice',
  'Tgl Dibayar',
  'Umur Piutang',
  'Catatan Belum Selesai',
  'Lama Layout Awal',
] as const;

export const OPTIONAL_TEMPLATE_COLUMNS: readonly string[] = [
  'Ukuran Buku',
  'Catatan Buku',
  'Note Tambahan Biaya',
  'Catatan Lain',
] as const;

export const FULL_TEMPLATE_COLUMNS: readonly string[] = [
  ...EXPECTED_SHEET_COLUMNS,
  ...OPTIONAL_TEMPLATE_COLUMNS,
] as const;

/**
 * Ekstrak Spreadsheet ID dari link Google Sheets secara aman dan tepat
 */
export function extractSpreadsheetId(inputUrl: string): string | null {
  const trimmed = inputUrl.trim();
  if (!trimmed) return null;

  const matchPublished = trimmed.match(/\/spreadsheets\/d\/e\/([a-zA-Z0-9-_]+)/);
  if (matchPublished && matchPublished[1]) {
    return matchPublished[1];
  }

  const matchStandard = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (matchStandard && matchStandard[1] && matchStandard[1] !== 'e') {
    return matchStandard[1];
  }

  if (/^[a-zA-Z0-9-_]{20,}$/.test(trimmed)) {
    return trimmed;
  }

  return null;
}

/**
 * Deteksi otomatis pemisah CSV (koma ',', titik koma ';', atau tab '\t')
 * berdasarkan baris header/baris awal di luar tanda kutip.
 */
export function detectCsvDelimiter(csvText: string): ',' | ';' | '\t' {
  const cleaned = csvText
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');

  const sampleLines: string[] = [];
  let inQuotes = false;
  let currentLine = '';

  for (let i = 0; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (ch === '"') {
      if (inQuotes && cleaned[i + 1] === '"') {
        currentLine += '""';
        i++;
      } else {
        inQuotes = !inQuotes;
        currentLine += ch;
      }
    } else if (ch === '\n' && !inQuotes) {
      if (currentLine.trim().length > 0) {
        sampleLines.push(currentLine);
        if (sampleLines.length >= 3) break;
      }
      currentLine = '';
    } else {
      currentLine += ch;
    }
  }
  if (currentLine.trim().length > 0 && sampleLines.length < 3) {
    sampleLines.push(currentLine);
  }

  const targetLine = sampleLines[0] || '';
  const counts: Record<',' | ';' | '\t', number> = {
    ',': 0,
    ';': 0,
    '\t': 0,
  };

  let quoted = false;
  for (let i = 0; i < targetLine.length; i++) {
    const ch = targetLine[i];
    if (ch === '"') {
      if (quoted && targetLine[i + 1] === '"') {
        i++;
      } else {
        quoted = !quoted;
      }
    } else if (!quoted && (ch === ',' || ch === ';' || ch === '\t')) {
      counts[ch]++;
    }
  }

  if (counts['\t'] > 0 && counts['\t'] >= counts[';'] && counts['\t'] >= counts[',']) {
    return '\t';
  }
  if (counts[';'] > 0 && counts[';'] >= counts[',']) {
    return ';';
  }
  return ',';
}

/**
 * Parse teks CSV mengikuti RFC 4180 (pemisah ',', ';', atau '\t', nilai dalam tanda kutip, baris kosong)
 */
export function parseCsvRows(csvText: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = '';
  let insideQuote = false;

  // Hilangkan BOM UTF-8 jika ada dan samakan newline
  const cleaned = csvText
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');

  const delimiter = detectCsvDelimiter(cleaned);

  for (let i = 0; i < cleaned.length; i++) {
    const char = cleaned[i];
    const nextChar = cleaned[i + 1];

    if (char === '"') {
      if (insideQuote && nextChar === '"') {
        currentCell += '"';
        i++;
      } else {
        insideQuote = !insideQuote;
      }
    } else if (char === delimiter && !insideQuote) {
      currentRow.push(currentCell.trim());
      currentCell = '';
    } else if (char === '\n' && !insideQuote) {
      currentRow.push(currentCell.trim());
      if (currentRow.some((cell) => cell.length > 0)) {
        rows.push(currentRow);
      }
      currentRow = [];
      currentCell = '';
    } else {
      currentCell += char;
    }
  }

  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell.trim());
    if (currentRow.some((cell) => cell.length > 0)) {
      rows.push(currentRow);
    }
  }

  return rows;
}

export interface ImportRowIssue {
  rowNumber: number; // 1-indexed (termasuk header pada baris 1, jadi data mulai baris 2)
  judul: string;
  messages: string[];
  isSkipped: boolean; // true jika kolom Judul kosong (wajib)
}

export interface ParseResult {
  success: boolean;
  books?: BookJob[];
  totalDataRows?: number;
  errorCount?: number;
  yearGuessedCount?: number;
  issues?: ImportRowIssue[];
  missingColumns?: string[];
  foundColumns?: string[];
  sheetNameUsed?: string;
  errorMessage?: string;
}

function normalizeHeaderName(name: string): string {
  return name.trim().toLowerCase().replace(/[\s_\-()./#]+/g, '');
}

export const COLUMN_SYNONYMS: Record<string, string[]> = {
  'No': ['no', 'nomor', 'num', 'number', 'id', 'nomer', 'angka', 'kode'],
  'Judul': ['judul', 'judulbuku', 'title', 'namabuku', 'buku', 'judulnaskah', 'naskah'],
  'Penulis': ['penulis', 'author', 'namapenulis', 'pengarang', 'namaauthor', 'writer'],
  'Kategori': ['kategori', 'category', 'genre', 'tipekategori', 'jenis', 'bidang', 'jenisliteratur'],
  'Paket': ['paket', 'package', 'tipepaket', 'namapaket', 'layanan', 'jenispaket'],
  'Status Progres': [
    'statusprogres',
    'statusprogress',
    'status',
    'progres',
    'progress',
    'statusproyek',
    'statuspekerjaan',
    'posisiterakhir',
    'posisi',
  ],
  'Tgl Terima': [
    'tglterima',
    'tanggalterima',
    'tglmasuk',
    'tanggalmasuk',
    'receiveddate',
    'tglterimanaskah',
    'terima',
    'tglorder',
    'tanggalorder',
    'tglmasuknaskah',
  ],
  'Tgl Selesai Layout': [
    'tglselesailayout',
    'tglselesai',
    'tanggalselesai',
    'selesailayout',
    'layoutselesai',
    'enddate',
    'tglkeluar',
    'tanggallayoutselesai',
    'tglfinishing',
  ],
  'Update Terakhir': [
    'updateterakhir',
    'terakhirupdate',
    'lastupdate',
    'tglupdate',
    'tanggalupdate',
    'update',
    'modified',
    'perubahanterakhir',
  ],
  'Hari Berjalan': [
    'hariberjalan',
    'hari',
    'haripengerjaan',
    'lamahari',
    'days',
    'harikerja',
    'hariproses',
    'totalhari',
    'durasi',
  ],
  'Halaman Awal': [
    'halamanawal',
    'halawal',
    'estimasihalaman',
    'halamanestimasi',
    'halest',
    'estimasi',
    'awal',
    'halmula',
    'estimasihal',
    'halamandraft',
    'targethalaman',
    'targethal',
    'targethlm',
    'targethalamannaskah',
    'targetjumlahhalaman',
    'halamantarget',
  ],
  'Halaman Final': [
    'halamanfinal',
    'halfinal',
    'halamantotal',
    'totalhalaman',
    'halaman',
    'final',
    'hal',
    'haljadi',
    'totalhal',
    'halamancetak',
  ],
  'Stuck': [
    'stuck',
    'terkendala',
    'macet',
    'isstuck',
    'kendala',
    'pending',
    'hambatan',
    'trouble',
    'statusstuck',
  ],
  'Nilai Jasa': [
    'nilaijasa',
    'jasa',
    'biayajasa',
    'biaya',
    'tarif',
    'harga',
    'nominal',
    'totalbiaya',
    'fee',
    'nilaitransaksi',
    'tagihan',
    'hargajasa',
  ],
  'Status Bayar': [
    'statusbayar',
    'statuspembayaran',
    'bayar',
    'pembayaran',
    'paymentstatus',
    'statusinvoice',
    'statustagihan',
    'kondisibayar',
  ],
  'Tgl Invoice': [
    'tglinvoice',
    'tanggalinvoice',
    'tglfaktur',
    'invoicedate',
    'tgltagihan',
    'tanggaltagihan',
    'invoice',
  ],
  'Tgl Dibayar': [
    'tgldibayar',
    'tanggaldibayar',
    'tglbayar',
    'tgllunas',
    'paiddate',
    'tanggallunas',
    'lunas',
    'tglpelunasan',
    'waktubayar',
  ],
  'Umur Piutang': [
    'umurpiutang',
    'piutang',
    'lamapiutang',
    'hariinvoice',
    'aging',
    'durasipiutang',
    'umurtagihan',
  ],
  'Catatan Belum Selesai': [
    'catatanbelumselesai',
    'catatan',
    'keterangan',
    'notes',
    'catatanpengerjaan',
    'catatanrevisi',
    'revisi',
    'catatankelengkapan',
    'memo',
    'keteranganprogres',
  ],
  'Lama Layout Awal': [
    'lamalayoutawal',
    'lamalayout',
    'durasilayout',
    'layoutawal',
    'waktulayout',
    'durasilayoutawal',
    'lamapengerjaanawal',
    'harilayoutawal',
    'waktuawal',
  ],
  'Ukuran Buku': [
    'ukuranbuku',
    'ukuran',
    'size',
    'dimensi',
    'formatukuran',
  ],
  'Catatan Buku': [
    'catatanbuku',
    'catatantetap',
    'notebuku',
    'ringkasanbuku',
  ],
  'Note Tambahan Biaya': [
    'notetambahanbiaya',
    'tambahanbiaya',
    'catatanbiaya',
    'biayatambahan',
    'extrabiaya',
    'notebiaya',
  ],
  'Catatan Lain': [
    'catatanlain',
    'catatanlainnya',
    'catatanumum',
    'infotambahan',
    'keterangantambahan',
  ],
};

function parseNullableNumber(raw: string): { value: number | null; isValid: boolean } {
  const trimmed = raw.trim();
  if (!trimmed || trimmed === '-') return { value: null, isValid: true };

  // Mendukung format mata uang Indonesia & angka: "Rp 1.500.000", "Rp. 1.500.000,-", "1.500.000,00", "1,500,000"
  let cleaned = trimmed
    .replace(/idr/gi, '')
    .replace(/rp\.?/gi, '')
    .replace(/,-$/g, '')
    .replace(/[\s\u00A0]+/g, '');

  if (!cleaned) return { value: null, isValid: true };

  if (/^-?\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(cleaned)) {
    // Format Indonesia: 1.500.000 atau 1.500.000,50
    cleaned = cleaned.replace(/\./g, '').replace(',', '.');
  } else if (/^-?\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(cleaned)) {
    // Format Internasional: 1,500,000 atau 1,500,000.50
    cleaned = cleaned.replace(/,/g, '');
  } else if (/^-?\d+,\d{1,2}$/.test(cleaned)) {
    cleaned = cleaned.replace(',', '.');
  }

  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) {
    return { value: null, isValid: false };
  }
  const num = Number(cleaned);
  if (!Number.isFinite(num)) {
    return { value: null, isValid: false };
  }
  return { value: num, isValid: true };
}

/**
 * Validasi dan petakan data baris matriks ke BookJob[] dengan pencocokan NAMA HEADER
 */
export function parseSheetRows(rawRows: string[][]): ParseResult {
  const rows = [...rawRows];
  while (rows.length > 0 && !rows[0].some((c) => c.trim() !== '')) {
    rows.shift();
  }

  if (rows.length === 0) {
    return {
      success: false,
      errorMessage: 'File atau tabel kosong, tidak ada data ditemukan.',
    };
  }

  const headerRow = rows[0];
  const headerMap: Record<string, number> = {};

  headerRow.forEach((col, index) => {
    headerMap[normalizeHeaderName(col)] = index;
  });

  const missingColumns: string[] = [];
  const columnIndexMap: Record<string, number> = {};

  for (const expectedCol of FULL_TEMPLATE_COLUMNS) {
    const norm = normalizeHeaderName(expectedCol);
    if (headerMap[norm] !== undefined) {
      columnIndexMap[expectedCol] = headerMap[norm];
    } else {
      const synonyms = COLUMN_SYNONYMS[expectedCol] || [];
      const foundSynonym = synonyms.find((s) => headerMap[normalizeHeaderName(s)] !== undefined);
      if (foundSynonym) {
        columnIndexMap[expectedCol] = headerMap[normalizeHeaderName(foundSynonym)];
      } else if (EXPECTED_SHEET_COLUMNS.includes(expectedCol)) {
        missingColumns.push(expectedCol);
      }
    }
  }

  const optIsbnKey = ['isbn', 'nomorisbn', 'kodeisbn'].find((k) => headerMap[k] !== undefined);
  const optStatusIsbnKey = ['statusisbn', 'kondisiisbn'].find((k) => headerMap[k] !== undefined);
  const optKodeProdKey = ['kodeproduksi', 'kodeprod', 'kodenas'].find((k) => headerMap[k] !== undefined);
  const optKelengkapanKey = ['kelengkapannaskah', 'kelengkapan'].find((k) => headerMap[k] !== undefined);

  if (columnIndexMap['Judul'] === undefined) {
    return {
      success: false,
      missingColumns,
      foundColumns: headerRow,
      errorMessage:
        'Header kolom "Judul" wajib ditemukan pada baris pertama. Pastikan file menggunakan template standar Schnell (20, 22, atau 24 kolom).',
    };
  }

  const dataRows = rows.slice(1);
  const parsedBooks: BookJob[] = [];
  const issues: ImportRowIssue[] = [];
  let totalDataRows = 0;
  let yearGuessedCount = 0;

  for (let idx = 0; idx < dataRows.length; idx++) {
    const row = dataRows[idx];
    if (row.length === 0 || !row.some((c) => c.trim() !== '')) continue;

    totalDataRows++;
    const rowNumber = idx + 2; // 1-based dengan baris 1 adalah header
    const rowErrors: string[] = [];

    const getVal = (colName: string): string => {
      const colIdx = columnIndexMap[colName];
      return colIdx !== undefined && row[colIdx] !== undefined ? row[colIdx].trim() : '';
    };

    const judulRaw = getVal('Judul');
    if (!judulRaw) {
      rowErrors.push('Kolom "Judul" kosong (baris dilewati).');
      issues.push({
        rowNumber,
        judul: '(Tanpa Judul)',
        messages: rowErrors,
        isSkipped: true,
      });
      continue;
    }

    const noRes = parseNullableNumber(getVal('No'));
    if (!noRes.isValid) rowErrors.push('Kolom "No" bukan angka valid (diubah ke null/otomatis).');

    const halAwalRes = parseNullableNumber(getVal('Halaman Awal'));
    if (!halAwalRes.isValid) rowErrors.push('Kolom "Halaman Awal" bukan angka valid (diubah ke null/0).');

    const halFinalRes = parseNullableNumber(getVal('Halaman Final'));
    if (!halFinalRes.isValid) rowErrors.push('Kolom "Halaman Final" bukan angka valid (diubah ke null/0).');

    const nilaiJasaRes = parseNullableNumber(getVal('Nilai Jasa'));
    if (!nilaiJasaRes.isValid) rowErrors.push('Kolom "Nilai Jasa" bukan angka valid (diubah ke null/0).');

    const tglTerimaRes = normalizeIsoDate(getVal('Tgl Terima'));
    if (!tglTerimaRes.isValid) rowErrors.push('Format "Tgl Terima" tidak valid (diubah ke null).');
    if (tglTerimaRes.yearGuessed) yearGuessedCount++;

    const tglSelesaiRes = normalizeIsoDate(getVal('Tgl Selesai Layout'));
    if (!tglSelesaiRes.isValid) rowErrors.push('Format "Tgl Selesai Layout" tidak valid (diubah ke null).');
    if (tglSelesaiRes.yearGuessed) yearGuessedCount++;

    const updateTerakhirRes = normalizeIsoDate(getVal('Update Terakhir'));
    if (!updateTerakhirRes.isValid) rowErrors.push('Format "Update Terakhir" tidak valid (diubah ke null).');
    if (updateTerakhirRes.yearGuessed) yearGuessedCount++;

    const tglInvoiceRes = normalizeIsoDate(getVal('Tgl Invoice'));
    if (!tglInvoiceRes.isValid) rowErrors.push('Format "Tgl Invoice" tidak valid (diubah ke null).');
    if (tglInvoiceRes.yearGuessed) yearGuessedCount++;

    const tglDibayarRes = normalizeIsoDate(getVal('Tgl Dibayar'));
    if (!tglDibayarRes.isValid) rowErrors.push('Format "Tgl Dibayar" tidak valid (diubah ke null).');
    if (tglDibayarRes.yearGuessed) yearGuessedCount++;

    if (rowErrors.length > 0) {
      issues.push({
        rowNumber,
        judul: judulRaw,
        messages: rowErrors,
        isSkipped: false,
      });
    }

    const penulis = getVal('Penulis') || 'Tanpa Penulis';
    const kategori: KategoriType = normalizeKategori(getVal('Kategori'));
    const paket: PaketType = normalizePaket(getVal('Paket'));
    const statusProgres: StatusProgresType = normalizeStatusProgres(getVal('Status Progres'));
    const rawStuck = getVal('Stuck').toLowerCase();
    const stuck: 'Ya' | 'Tidak' =
      rawStuck === 'ya' || rawStuck === 'true' || rawStuck === 'y' ? 'Ya' : 'Tidak';
    const statusBayar: StatusBayarType = normalizeStatusBayar(getVal('Status Bayar'));
    const catatanBelumSelesai = getVal('Catatan Belum Selesai');

    const isbn =
      optIsbnKey !== undefined && row[headerMap[optIsbnKey]]
        ? row[headerMap[optIsbnKey]].trim()
        : undefined;
    const statusIsbn =
      optStatusIsbnKey !== undefined && row[headerMap[optStatusIsbnKey]]
        ? (row[headerMap[optStatusIsbnKey]].trim() as any)
        : undefined;
    const kodeProduksi =
      optKodeProdKey !== undefined && row[headerMap[optKodeProdKey]]
        ? row[headerMap[optKodeProdKey]].trim()
        : undefined;
    const rawKelengkapan =
      optKelengkapanKey !== undefined && row[headerMap[optKelengkapanKey]]
        ? row[headerMap[optKelengkapanKey]].trim()
        : undefined;
    const kelengkapanNaskah = rawKelengkapan
      ? rawKelengkapan.split(/[,;|]/).map((k) => k.trim()).filter(Boolean)
      : undefined;

    const ukuranBuku = getVal('Ukuran Buku') || undefined;
    const catatanBuku = getVal('Catatan Buku') || undefined;
    const catatanBiaya = getVal('Note Tambahan Biaya') || undefined;
    const catatanLain = getVal('Catatan Lain') || undefined;

    const bookWithDerived = computeDerivedBookFields({
      no: noRes.value ?? 0,
      judul: judulRaw,
      penulis,
      kategori,
      paket,
      statusProgres,
      tglTerima: tglTerimaRes.value,
      tglSelesaiLayout: tglSelesaiRes.value,
      updateTerakhir: updateTerakhirRes.value,
      halamanAwal: halAwalRes.value ?? 0,
      estimasiHalaman: halAwalRes.value ?? undefined,
      halamanFinal: halFinalRes.value ?? halAwalRes.value ?? 0,
      stuck,
      nilaiJasa: nilaiJasaRes.value ?? 0,
      statusBayar,
      tglInvoice: tglInvoiceRes.value,
      tglDibayar: tglDibayarRes.value,
      catatanBelumSelesai,
      ukuran: ukuranBuku,
      ukuranBuku,
      catatanBuku,
      catatanBiaya,
      catatanLain,
      isbn,
      statusIsbn,
      kodeProduksi,
      kelengkapanNaskah,
    });

    parsedBooks.push(bookWithDerived);
  }

  return {
    success: true,
    books: parsedBooks,
    totalDataRows,
    errorCount: issues.length,
    yearGuessedCount,
    issues,
    missingColumns: missingColumns.length > 0 ? missingColumns : undefined,
    foundColumns: headerRow,
  };
}

/**
 * Parsing teks CSV dan petakan ke BookJob[] + hasil validasi
 */
export function parseSheetData(csvText: string): ParseResult {
  const rawRows = parseCsvRows(csvText);
  return parseSheetRows(rawRows);
}

/**
 * Parsing file Excel (.xlsx / .xls) menggunakan SheetJS:
 * - Membaca sheet bernama "Data Dasbor" (atau fallback sheet pertama jika tidak ada)
 * - Cocokkan kolom berdasarkan NAMA HEADER, bukan posisi
 */
export function parseExcelWorkbook(buffer: ArrayBuffer): ParseResult {
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: false });
  if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
    return {
      success: false,
      errorMessage: 'File Excel tidak memiliki lembar (sheet) yang dapat dibaca.',
    };
  }

  const targetSheetName =
    workbook.SheetNames.find((n) => n === 'Data Dasbor') ||
    workbook.SheetNames.find((n) => n.trim().toLowerCase() === 'data dasbor') ||
    workbook.SheetNames[0];

  const worksheet = workbook.Sheets[targetSheetName];
  if (!worksheet) {
    return {
      success: false,
      errorMessage: `Sheet "${targetSheetName}" tidak dapat dibaca.`,
    };
  }

  const matrix = XLSX.utils.sheet_to_json<any[]>(worksheet, {
    header: 1,
    raw: true,
    defval: '',
  });

  const rawRows: string[][] = matrix.map((row) =>
    Array.isArray(row)
      ? row.map((cell) => {
          if (cell === null || cell === undefined) return '';
          if (cell instanceof Date) {
            const norm = normalizeIsoDate(cell);
            return norm.value || '';
          }
          return String(cell);
        })
      : []
  );

  const parsed = parseSheetRows(rawRows);
  return {
    ...parsed,
    sheetNameUsed: targetSheetName,
  };
}

/**
 * Parsing array 2D values (dari Google Sheets API v4) dan petakan ke BookJob[] + hasil validasi
 */
export function parseSheetValues(values: any[][]): ParseResult {
  if (!values || !Array.isArray(values) || values.length === 0) {
    return {
      success: false,
      errorMessage: 'Google Sheet tidak mengembalikan baris data apa pun.',
    };
  }

  const rawRows: string[][] = values.map((row) =>
    Array.isArray(row)
      ? row.map((cell) => (cell === null || cell === undefined ? '' : String(cell)))
      : []
  );

  return parseSheetRows(rawRows);
}

function escapeCsvCell(cell: string | number | null | undefined): string {
  if (cell === null || cell === undefined) return '';
  const str = String(cell);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

const SHEET_COLUMN_WIDTHS: Array<{ wch: number }> = [
  { wch: 6 },  // 1 No
  { wch: 38 }, // 2 Judul
  { wch: 28 }, // 3 Penulis
  { wch: 22 }, // 4 Kategori
  { wch: 12 }, // 5 Paket
  { wch: 24 }, // 6 Status Progres
  { wch: 14 }, // 7 Tgl Terima
  { wch: 18 }, // 8 Tgl Selesai Layout
  { wch: 16 }, // 9 Update Terakhir
  { wch: 14 }, // 10 Hari Berjalan (otomatis)
  { wch: 14 }, // 11 Halaman Awal
  { wch: 14 }, // 12 Halaman Final
  { wch: 10 }, // 13 Stuck
  { wch: 15 }, // 14 Nilai Jasa
  { wch: 16 }, // 15 Status Bayar
  { wch: 14 }, // 16 Tgl Invoice
  { wch: 14 }, // 17 Tgl Dibayar
  { wch: 14 }, // 18 Umur Piutang (otomatis)
  { wch: 34 }, // 19 Catatan Belum Selesai
  { wch: 17 }, // 20 Lama Layout Awal
  { wch: 16 }, // 21 Ukuran Buku
  { wch: 30 }, // 22 Catatan Buku
  { wch: 28 }, // 23 Note Tambahan Biaya
  { wch: 28 }, // 24 Catatan Lain
];

function bookToRowArray(rawBook: BookJob): Array<string | number> {
  const b = computeDerivedBookFields(rawBook);
  return [
    b.no,
    b.judul,
    b.penulis,
    b.kategori,
    b.paket,
    b.statusProgres,
    b.tglTerima ?? '',
    b.tglSelesaiLayout ?? '',
    b.updateTerakhir ?? '',
    b.hariBerjalan,
    b.halamanAwal,
    b.halamanFinal,
    b.stuck,
    b.nilaiJasa,
    b.statusBayar,
    b.tglInvoice ?? '',
    b.tglDibayar ?? '',
    b.umurPiutang,
    b.catatanBelumSelesai,
    b.lamaLayoutAwal,
    b.ukuran ?? b.ukuranBuku ?? '',
    b.catatanBuku ?? '',
    b.catatanBiaya ?? '',
    b.catatanLain ?? '',
  ];
}

async function buildAndDownloadStyledXlsx(
  dataRows: Array<Array<string | number>>,
  filename: string
): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Schnell';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Data Dasbor', {
    views: [{ state: 'frozen', ySplit: 1, xSplit: 2 }],
  });

  sheet.columns = FULL_TEMPLATE_COLUMNS.map((header, idx) => ({
    header,
    key: `col_${idx}`,
    width: SHEET_COLUMN_WIDTHS[idx]?.wch ?? 16,
  }));

  sheet.autoFilter = 'A1:X1';

  const derivedCols = new Set([10, 18]); // Hari Berjalan & Umur Piutang (dihitung otomatis)
  const headerRow = sheet.getRow(1);
  headerRow.height = 28;
  headerRow.eachCell((cell, colNumber) => {
    const isDerived = derivedCols.has(colNumber);
    cell.font = {
      name: 'Plus Jakarta Sans',
      size: 11,
      bold: true,
      color: { argb: 'FFFFFFFF' },
    };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: isDerived ? 'FF64748B' : 'FF2F6BDE' },
    };
    cell.alignment = {
      vertical: 'middle',
      horizontal: 'left',
      wrapText: false,
    };
    cell.border = {
      bottom: { style: 'thin', color: { argb: isDerived ? 'FF475569' : 'FF1E4FBB' } },
    };
  });

  dataRows.forEach((rowValues, rowIdx) => {
    const row = sheet.addRow(rowValues);
    row.height = 20;
    const nilaiCell = row.getCell(14); // Kolom Nilai Jasa
    if (typeof nilaiCell.value === 'number') {
      nilaiCell.numFmt = '#,##0';
    }
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      if (derivedCols.has(colNumber)) {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF1F5F9' },
        };
      } else if (rowIdx % 2 === 1) {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF8FAFC' },
        };
      }
    });
  });

  // Sheet referensi tersembunyi untuk menghindari batas 255 karakter literal list validation Excel
  const refSheet = workbook.addWorksheet('_Referensi', { state: 'hidden' });
  refSheet.getRow(1).values = ['Kategori', 'Paket', 'Status Progres', 'Stuck', 'Status Bayar', 'Ukuran Buku'];
  const refLists = [
    [...KATEGORI_BUKU_LIST],
    [...PAKET_LIST],
    [...STATUS_WORKFLOW_LIST],
    ['Ya', 'Tidak'],
    ['Belum Ditagih', 'Belum Dibayar', 'Lunas'],
    [...UKURAN_BUKU_LIST],
  ];
  const maxRefLen = Math.max(...refLists.map((l) => l.length));
  for (let i = 0; i < maxRefLen; i++) {
    refSheet.getRow(i + 2).values = refLists.map((l) => l[i] ?? null);
  }

  const katRange = `'_Referensi'!$A$2:$A$${KATEGORI_BUKU_LIST.length + 1}`;
  const pktRange = `'_Referensi'!$B$2:$B$${PAKET_LIST.length + 1}`;
  const stRange = `'_Referensi'!$C$2:$C$${STATUS_WORKFLOW_LIST.length + 1}`;
  const stuckRange = `'_Referensi'!$D$2:$D$3`;
  const bayarRange = `'_Referensi'!$E$2:$E$4`;
  const ukRange = `'_Referensi'!$F$2:$F$${UKURAN_BUKU_LIST.length + 1}`;

  // Validasi dropdown Excel mode peringatan (nilai lain tetap boleh)
  const validationRowsCount = Math.max(dataRows.length + 30, 50);
  for (let r = 2; r <= validationRowsCount; r++) {
    sheet.getCell(r, 4).dataValidation = {
      type: 'list',
      allowBlank: true,
      errorStyle: 'warning',
      showErrorMessage: true,
      errorTitle: 'Kategori di luar daftar',
      error: 'Kategori ini di luar 25 kategori standar, tetapi tetap diperbolehkan.',
      formulae: [katRange],
    };
    sheet.getCell(r, 5).dataValidation = {
      type: 'list',
      allowBlank: true,
      errorStyle: 'warning',
      showErrorMessage: true,
      formulae: [pktRange],
    };
    sheet.getCell(r, 6).dataValidation = {
      type: 'list',
      allowBlank: true,
      errorStyle: 'warning',
      showErrorMessage: true,
      errorTitle: 'Status kustom',
      error: 'Status di luar daftar alur baku, tetap diperbolehkan jika diperlukan.',
      formulae: [stRange],
    };
    sheet.getCell(r, 13).dataValidation = {
      type: 'list',
      allowBlank: true,
      errorStyle: 'warning',
      showErrorMessage: true,
      formulae: [stuckRange],
    };
    sheet.getCell(r, 15).dataValidation = {
      type: 'list',
      allowBlank: true,
      errorStyle: 'warning',
      showErrorMessage: true,
      formulae: [bayarRange],
    };
    sheet.getCell(r, 21).dataValidation = {
      type: 'list',
      allowBlank: true,
      errorStyle: 'warning',
      showErrorMessage: true,
      errorTitle: 'Ukuran Custom',
      error: 'Ukuran di luar preset akan diperlakukan sebagai Custom.',
      formulae: [ukRange],
    };
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.setAttribute('download', filename);
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Unduh file template .xlsx berisi sheet "Data Dasbor" dengan 24 header lengkap,
 * validasi dropdown Excel, baris header & kolom No/Judul dibekukan, filter aktif, lebar kolom rapi, dan tanpa baris contoh.
 */
export async function downloadTemplateXlsx(
  filename = 'Template_Form_Schnell.xlsx'
): Promise<void> {
  await buildAndDownloadStyledXlsx([], filename);
}

/**
 * Unduh file contoh data .xlsx berisi sheet "Data Dasbor" dengan 3 baris contoh
 */
export async function downloadExampleXlsx(
  sampleBooks: BookJob[],
  filename = 'Contoh_Data_Schnell.xlsx'
): Promise<void> {
  const rows = sampleBooks.slice(0, 3).map(bookToRowArray);
  await buildAndDownloadStyledXlsx(rows, filename);
}

/**
 * Ekspor seluruh buku ke file .xlsx berformat 24 kolom (termasuk kolom turunan, ukuran, catatan buku, biaya & lain)
 */
export async function downloadExportXlsx(
  books: BookJob[],
  filename = 'Export_Data_Buku_Schnell.xlsx'
): Promise<void> {
  const rows = books.map(bookToRowArray);
  await buildAndDownloadStyledXlsx(rows, filename);
}

/**
 * Buat template CSV standar 24 kolom dengan pemisah titik koma (;) agar terbaca rapi di Excel Indonesia
 */
export function generateTemplateCsv(includeExample = true): string {
  const headerLine = FULL_TEMPLATE_COLUMNS.join(';');
  if (!includeExample) {
    return `${headerLine}\n`;
  }
  const formatCsvRows = (cells: string[]) =>
    cells
      .map((cell) => {
        const str = String(cell);
        return str.includes(';') || str.includes('"') || str.includes('\n')
          ? `"${str.replace(/"/g, '""')}"`
          : str;
      })
      .join(';');

  const exampleRow1 = formatCsvRows([
    '1',
    'Pengantar Hukum Tata Negara Modern',
    'Prof. Dr. Hendra Wijaya, S.H.',
    'Hukum',
    'Standart',
    'Di Saya',
    '2026-11-01',
    '',
    '2026-11-03',
    '3',
    '180',
    '210',
    'Tidak',
    '1500000',
    'Belum Ditagih',
    '',
    '',
    '0',
    'Sedang tata letak bab pendahuluan',
    '10',
    '15x23',
    'Kirim softcopy ACC bab 1-3 dulu',
    'All clear',
    'Cetakan 1 - Layout Standar',
  ]);

  const exampleRow2 = formatCsvRows([
    '2',
    'Ekonomi Digital dan Ekosistem UMKM',
    'Dr. Hendra Gunawan, S.E., M.Si.',
    'Ekonomi/Manajemen',
    'Premium',
    'Sudah siap cetak',
    '2026-10-15',
    '2026-11-02',
    '2026-11-02',
    '18',
    '220',
    '256',
    'Tidak',
    '2500000',
    'Belum Dibayar',
    '2026-11-05',
    '',
    '9',
    '',
    '14',
    '15,5x23,5',
    'Termasuk tambahan ongkir kirim dummy fisik',
    'Tambahan biaya redaksi indeks Rp150.000',
    'cet 2 - acc cetak',
  ]);

  const exampleRow3 = formatCsvRows([
    '3',
    'Metodologi Penelitian Pendidikan Terapan',
    'Dr. Sari Lestari, M.Pd.',
    'Pendidikan',
    'Basic',
    'Selesai',
    '2026-10-01',
    '2026-10-16',
    '2026-10-18',
    '15',
    '160',
    '176',
    'Tidak',
    '1100000',
    'Lunas',
    '2026-10-18',
    '2026-10-25',
    '0',
    '',
    '11',
    'A5',
    '',
    'All clear',
    '',
  ]);

  return `${headerLine}\n${exampleRow1}\n${exampleRow2}\n${exampleRow3}\n`;
}

/**
 * Ekspor array BookJob[] menjadi CSV berformat 24 kolom (kompatibel impor ulang)
 */
export function exportBooksToCsv(books: BookJob[]): string {
  const headerLine = FULL_TEMPLATE_COLUMNS.join(',');
  const rows = books.map((rawBook) =>
    bookToRowArray(rawBook).map(escapeCsvCell).join(',')
  );

  return [headerLine, ...rows].join('\n');
}

/**
 * Trigger download file di browser dengan UTF-8 BOM agar terbaca rapi di Excel
 */
export function downloadFile(
  content: string,
  filename: string,
  mimeType = 'text/csv;charset=utf-8;'
): void {
  const blob = new Blob(['\uFEFF' + content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.setAttribute('download', filename);
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
