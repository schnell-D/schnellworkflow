import * as XLSX from 'xlsx';
import {
  BookJob,
  BookLog,
  PaketType,
  StatusBayarType,
} from '../types';
import { GoogleSheetMergeRange, GoogleSheetRawTab } from '../services/api';
import {
  computeDerivedBookFields,
  matchStatusProgres,
  normalizeIsoDate,
  normalizeKategori,
  normalizePaket,
  normalizeStatusBayar,
} from './bookHelpers';
import { parseLogSheetRows, ParsedLogCandidate, UnmatchedLogRow } from './logHelpers';

export type WorkbookTabRole = 'buku' | 'log' | 'keuangan' | 'lewati';

export type MappableBookField =
  | '__skip__'
  | '__custom__'
  | 'no'
  | 'judul'
  | 'penulis'
  | 'kategori'
  | 'paket'
  | 'statusProgres'
  | 'tglTerima'
  | 'tglSelesaiLayout'
  | 'updateTerakhir'
  | 'halamanAwal'
  | 'halamanFinal'
  | 'stuck'
  | 'nilaiJasa'
  | 'statusBayar'
  | 'tglInvoice'
  | 'tglDibayar'
  | 'catatanBelumSelesai'
  | 'catatanBiaya'
  | 'catatanLain'
  | 'kodeProduksi'
  | 'isbn'
  | 'statusIsbn'
  | 'ukuranBuku'
  | 'catatanBuku';

export const MAPPABLE_FIELD_OPTIONS: Array<{ value: MappableBookField; label: string }> = [
  { value: '__skip__', label: 'Lewati (jangan impor)' },
  { value: 'no', label: 'No' },
  { value: 'judul', label: 'Judul Buku' },
  { value: 'penulis', label: 'Penulis' },
  { value: 'kategori', label: 'Kategori' },
  { value: 'paket', label: 'Paket' },
  { value: 'statusProgres', label: 'Status Progres' },
  { value: 'tglTerima', label: 'Tgl Terima' },
  { value: 'tglSelesaiLayout', label: 'Tgl Selesai Layout' },
  { value: 'updateTerakhir', label: 'Update Terakhir' },
  { value: 'halamanAwal', label: 'Halaman Awal' },
  { value: 'halamanFinal', label: 'Halaman Final' },
  { value: 'stuck', label: 'Stuck (Ya/Tidak)' },
  { value: 'nilaiJasa', label: 'Nilai Jasa' },
  { value: 'statusBayar', label: 'Status Bayar' },
  { value: 'tglInvoice', label: 'Tgl Invoice' },
  { value: 'tglDibayar', label: 'Tgl Dibayar' },
  { value: 'catatanBelumSelesai', label: 'Catatan Belum Selesai' },
  { value: 'catatanBuku', label: 'Catatan Buku' },
  { value: 'catatanBiaya', label: 'Note Tambahan Biaya' },
  { value: 'catatanLain', label: 'Catatan Lain' },
  { value: 'kodeProduksi', label: 'Kode Produksi' },
  { value: 'isbn', label: 'Nomor ISBN' },
  { value: 'statusIsbn', label: 'Status ISBN' },
  { value: 'ukuranBuku', label: 'Ukuran Buku' },
  { value: '__custom__', label: 'Simpan sebagai field tambahan' },
];

export interface ParsedHeaderColumn {
  colIndex: number;
  headerName: string;
  samples: string[];
  mappedField: MappableBookField;
  isUnrecognized: boolean;
  typeHint: 'tanggal' | 'angka' | 'teks' | 'kosong';
}

export interface WorkbookTabInspection {
  sheetName: string;
  isHidden: boolean;
  detectedRole: WorkbookTabRole;
  selectedRole: WorkbookTabRole;
  checked: boolean;
  rawMatrix: string[][];
  headerRowCount: number;
  dataStartRowIndex: number;
  columns: ParsedHeaderColumn[];
  dataRows: string[][];
  roleHintNote: string;
}

export type DuplicatePolicy = 'overwrite_all' | 'fill_empty' | 'skip_existing';

export interface BookFieldDiff {
  field: string;
  label: string;
  oldVal: string;
  newVal: string;
}

export interface BookImportDiffItem {
  imported: Partial<BookJob>;
  existingBook: BookJob | null;
  diffs: BookFieldDiff[];
  sourceTab: string;
  rowNumber: number;
}

export interface ProblemRowEntry {
  tabName: string;
  rowNumber: number;
  identifier: string;
  reason: string;
}

function colIndexToLetter(colIdx: number): string {
  let letter = '';
  let num = colIdx + 1;
  while (num > 0) {
    const rem = (num - 1) % 26;
    letter = String.fromCharCode(65 + rem) + letter;
    num = Math.floor((num - 1) / 26);
  }
  return letter;
}

function normStr(val: string): string {
  return String(val || '')
    .trim()
    .toLowerCase()
    .replace(/[\s_\-./()]+/g, '');
}

function expandMergedMatrix(
  rawMatrix: string[][],
  merges: GoogleSheetMergeRange[],
  maxHeaderScanRows = 12
): string[][] {
  const maxCols = rawMatrix.reduce((m, r) => Math.max(m, r.length), 0);
  const copy = rawMatrix.map((row) => {
    const padded = [...row];
    while (padded.length < maxCols) padded.push('');
    return padded;
  });

  merges.forEach((m) => {
    if (m.startRowIndex >= Math.min(copy.length, maxHeaderScanRows)) return;
    const topLeft = (copy[m.startRowIndex]?.[m.startColumnIndex] || '').trim();
    if (!topLeft) return;
    const endR = Math.min(m.endRowIndex, copy.length);
    const endC = Math.min(m.endColumnIndex, maxCols);
    for (let r = m.startRowIndex; r < endR; r++) {
      for (let c = m.startColumnIndex; c < endC; c++) {
        if (!copy[r][c]) copy[r][c] = topLeft;
      }
    }
  });

  return copy;
}

function detectTabRole(sheetName: string, matrix: string[][]): {
  role: WorkbookTabRole;
  checked: boolean;
  note: string;
} {
  const lower = sheetName.trim().toLowerCase();

  if (
    lower.includes('data dasbor') ||
    lower === 'data' ||
    lower.includes('ringkasan posisi') ||
    lower.includes('summary')
  ) {
    return {
      role: 'lewati',
      checked: false,
      note: 'Tab turunan / ringkasan — dilewati bawaan',
    };
  }

  if (lower.includes('log')) {
    return {
      role: 'log',
      checked: true,
      note: 'Terdeteksi format LOG CATATAN PER BUKU',
    };
  }

  if (lower.includes('list progress') || lower.includes('progress layout') || lower.includes('buku')) {
    return {
      role: 'buku',
      checked: true,
      note: 'Terdeteksi daftar progres naskah buku',
    };
  }

  if (lower.includes('invoice') || lower.includes('keuangan') || lower.includes('laporan keuangan')) {
    const flatHeaderText = matrix
      .slice(0, 6)
      .flat()
      .join(' ')
      .toLowerCase();
    const looksStructured =
      (flatHeaderText.includes('judul') || flatHeaderText.includes('no')) &&
      (flatHeaderText.includes('nilai') ||
        flatHeaderText.includes('nominal') ||
        flatHeaderText.includes('invoice') ||
        flatHeaderText.includes('bayar') ||
        flatHeaderText.includes('paid'));
    return {
      role: looksStructured ? 'keuangan' : 'lewati',
      checked: looksStructured,
      note: looksStructured
        ? 'Terdeteksi tabel transaksi keuangan / invoice'
        : 'Struktur tabel keuangan non-standar — disarankan Lewati',
    };
  }

  // Fallback inspeksi isi
  const flatTop = matrix
    .slice(0, 6)
    .flat()
    .map((c) => c.toLowerCase());
  if (flatTop.some((c) => c.includes('isi catatan')) && flatTop.some((c) => c === 'dari')) {
    return { role: 'log', checked: true, note: 'Terdeteksi kolom Log Catatan' };
  }
  if (flatTop.some((c) => c.includes('judul')) && flatTop.some((c) => c.includes('penulis'))) {
    return { role: 'buku', checked: true, note: 'Terdeteksi tabel data buku' };
  }

  return {
    role: 'lewati',
    checked: false,
    note: 'Pilih peran tab ini jika ingin diimpor',
  };
}

function isSummaryOrFooterRow(row: string[]): boolean {
  const joined = row.join(' ').trim().toLowerCase();
  if (!joined) return true;
  const firstNonEmpty = row.find((c) => c.trim() !== '')?.trim().toLowerCase() || '';
  if (
    firstNonEmpty === 'total' ||
    firstNonEmpty === 'jumlah' ||
    firstNonEmpty === 'grand total' ||
    firstNonEmpty.startsWith('total ')
  ) {
    return true;
  }
  return false;
}

function inferTypeHint(samples: string[]): 'tanggal' | 'angka' | 'teks' | 'kosong' {
  const nonEmpty = samples.filter((s) => s.trim() !== '');
  if (nonEmpty.length === 0) return 'kosong';

  let dateHits = 0;
  let numHits = 0;

  nonEmpty.forEach((s) => {
    const cleanedNum = s.replace(/rp\.?|idr|[.,\s]/gi, '');
    if (/^\d{4,}$/.test(cleanedNum)) {
      numHits++;
      return;
    }
    const dt = normalizeIsoDate(s);
    if (dt.isValid && dt.value !== null && !/^\d{1,3}$/.test(s.trim())) {
      dateHits++;
    } else if (/^\d+$/.test(s.trim())) {
      numHits++;
    }
  });

  if (dateHits >= Math.ceil(nonEmpty.length / 2)) return 'tanggal';
  if (numHits >= Math.ceil(nonEmpty.length / 2)) return 'angka';
  return 'teks';
}

const BOOK_HEADER_MAP_RULES: Array<{ field: MappableBookField; synonyms: string[] }> = [
  { field: 'no', synonyms: ['no', 'nomor', 'nobuku', 'nomer'] },
  { field: 'judul', synonyms: ['judul', 'judulbuku', 'namabuku', 'judulnaskah', 'title'] },
  { field: 'penulis', synonyms: ['penulis', 'namapenulis', 'author', 'pengarang'] },
  { field: 'kategori', synonyms: ['kategori', 'category', 'bidang', 'genre'] },
  { field: 'paket', synonyms: ['paket', 'package', 'layanan', 'jenispaket'] },
  {
    field: 'statusProgres',
    synonyms: ['statusprogres', 'statusprogress', 'status', 'progres', 'progress', 'posisi'],
  },
  {
    field: 'tglTerima',
    synonyms: [
      'tglterima',
      'tanggalterima',
      'terimanaskah',
      'tglmasuk',
      'tanggalmasuk',
      'tglorder',
    ],
  },
  {
    field: 'tglSelesaiLayout',
    synonyms: [
      'tglselesailayout',
      'tglselesai',
      'tanggalselesai',
      'selesailayout',
      'tglfinishing',
    ],
  },
  {
    field: 'updateTerakhir',
    synonyms: ['updateterakhir', 'lastupdate', 'tglupdate', 'tanggalupdate'],
  },
  {
    field: 'halamanAwal',
    synonyms: ['halamanawal', 'halawal', 'estimasihalaman', 'halawalnaskah'],
  },
  {
    field: 'halamanFinal',
    synonyms: ['halamanfinal', 'halfinal', 'totalhalaman', 'jumlahhalaman', 'halaman'],
  },
  { field: 'stuck', synonyms: ['stuck', 'kendala', 'terkendala', 'macet', 'hambatan'] },
  {
    field: 'nilaiJasa',
    synonyms: ['nilaijasa', 'nominal', 'biayajasa', 'jasa', 'tarif', 'harga', 'totalbiaya'],
  },
  {
    field: 'statusBayar',
    synonyms: ['statusbayar', 'statuspembayaran', 'pembayaran', 'statustagihan'],
  },
  {
    field: 'tglInvoice',
    synonyms: ['tglinvoice', 'tanggalinvoice', 'payoutinvoice', 'invoice', 'tgltagihan'],
  },
  {
    field: 'tglDibayar',
    synonyms: ['tgldibayar', 'tanggaldibayar', 'payoutpaid', 'paid', 'tglbayar', 'tgllunas'],
  },
  {
    field: 'catatanBelumSelesai',
    synonyms: ['catatanbelumselesai', 'catatanprogres', 'catatanrevisi'],
  },
  {
    field: 'catatanBiaya',
    synonyms: ['notetambahanbiaya', 'tambahanbiaya', 'catatanbiaya', 'biayatambahan'],
  },
  {
    field: 'catatanLain',
    synonyms: ['catatanlain', 'catatanlainnya', 'infotambahan'],
  },
  { field: 'kodeProduksi', synonyms: ['kodeproduksi', 'kodeprod'] },
  { field: 'isbn', synonyms: ['isbn', 'nomorisbn'] },
  { field: 'statusIsbn', synonyms: ['statusisbn', 'kondisiisbn'] },
  { field: 'ukuranBuku', synonyms: ['ukuranbuku', 'ukuran'] },
  { field: 'catatanBuku', synonyms: ['catatanbuku', 'notebuku', 'catatantetap'] },
];

export function autoMapColumnName(
  headerName: string,
  samples: string[],
  savedTabMap?: Record<string, string>
): { field: MappableBookField; isUnrecognized: boolean } {
  if (savedTabMap && savedTabMap[headerName]) {
    const savedVal = savedTabMap[headerName] as MappableBookField;
    return { field: savedVal, isUnrecognized: false };
  }

  const norm = normStr(headerName);

  // Kolom "Keterangan" atau kolom turunan otomatis -> Lewati
  if (
    norm === 'keterangan' ||
    norm === 'ket' ||
    norm === 'hariberjalan' ||
    norm === 'umurpiutang' ||
    norm === 'lamalayoutawal'
  ) {
    return { field: '__skip__', isUnrecognized: false };
  }

  // Pencocokan sinonim langsung
  for (const rule of BOOK_HEADER_MAP_RULES) {
    if (rule.synonyms.some((syn) => norm === syn || norm.endsWith(syn))) {
      return { field: rule.field, isUnrecognized: false };
    }
  }

  // Deteksi kasus J.4: kolom tanpa header (Kolom X) yang isinya teks produksi seperti "cet 2 - acc cetak"
  if (/^kolom[a-z]+$/i.test(norm)) {
    const joinedSamples = samples.join(' ').toLowerCase();
    if (
      joinedSamples.includes('cet') ||
      joinedSamples.includes('acc') ||
      joinedSamples.includes('revisi') ||
      samples.some((s) => s.trim().length > 2)
    ) {
      return { field: 'catatanLain', isUnrecognized: false };
    }
    return { field: '__skip__', isUnrecognized: false };
  }

  return { field: '__skip__', isUnrecognized: true };
}

/**
 * Resolusi multi-baris header + sel gabungan untuk 1 tab
 */
function parseStructuredTabMatrix(
  sheetName: string,
  isHidden: boolean,
  rawMatrix: string[][],
  merges: GoogleSheetMergeRange[],
  savedTabMap?: Record<string, string>
): WorkbookTabInspection {
  const expanded = expandMergedMatrix(rawMatrix, merges);
  const { role, checked, note } = detectTabRole(sheetName, expanded);

  // Cari kolom "No" pada baris 0..8 untuk menentukan batas akhir multi-baris header
  let noColIndex = -1;
  for (let r = 0; r < Math.min(expanded.length, 8); r++) {
    const idx = expanded[r].findIndex((cell) => {
      const n = normStr(cell);
      return n === 'no' || n === 'nomor';
    });
    if (idx !== -1) {
      noColIndex = idx;
      break;
    }
  }
  if (noColIndex === -1) noColIndex = 0;

  // Baris data dimulai dari baris PERTAMA di mana kolom No berisi angka murni
  let dataStartRowIndex = 1;
  for (let r = 0; r < Math.min(expanded.length, 20); r++) {
    const cell = (expanded[r][noColIndex] || '').trim();
    if (/^\d+$/.test(cell)) {
      dataStartRowIndex = r;
      break;
    }
  }

  if (dataStartRowIndex === 0) dataStartRowIndex = 1;
  const headerRows = expanded.slice(0, dataStartRowIndex);
  const rawDataRows = expanded
    .slice(dataStartRowIndex)
    .filter((row) => row.some((c) => c.trim() !== '') && !isSummaryOrFooterRow(row));

  // Filter baris data pada tab Buku/Keuangan agar baris bukan angka No (kecuali tanpa kolom No) diabaikan
  const validDataRows =
    role === 'buku' || role === 'keuangan'
      ? rawDataRows.filter((row) => {
          const noVal = (row[noColIndex] || '').trim();
          if (!noVal) {
            // Izinkan bila kolom No kosong tapi judul ada
            return row.filter((c) => c.trim() !== '').length >= 2;
          }
          return /^\d+$/.test(noVal);
        })
      : rawDataRows;

  const colCount = expanded.reduce((m, r) => Math.max(m, r.length), 0);
  const columns: ParsedHeaderColumn[] = [];

  for (let c = 0; c < colCount; c++) {
    // Kumpulkan label header vertikal yang unik secara berurutan
    const parts: string[] = [];
    headerRows.forEach((hRow) => {
      const text = (hRow[c] || '').trim();
      if (!text) return;
      if (parts.length === 0 || parts[parts.length - 1].toLowerCase() !== text.toLowerCase()) {
        parts.push(text);
      }
    });

    // Jika baris 0 adalah judul besar sheet (misal "LIST PROGRESS LAYOUT BUKU") yang membentang ke semua kolom,
    // buang judul besar tersebut agar nama kolom menjadi bersih ("No", "Payout / Invoice")
    const cleanedParts =
      parts.length > 1 &&
      (parts[0].toLowerCase().includes('list progress') ||
        parts[0].toLowerCase().includes('laporan') ||
        parts[0].toLowerCase().includes('log catatan'))
        ? parts.slice(1)
        : parts;

    const headerName =
      cleanedParts.length > 0 ? cleanedParts.join(' / ') : `Kolom ${colIndexToLetter(c)}`;

    const samples = validDataRows
      .slice(0, 6)
      .map((r) => (r[c] || '').trim())
      .filter(Boolean)
      .slice(0, 3);

    const hasAnyDataInCol = validDataRows.some((r) => (r[c] || '').trim() !== '');
    if (cleanedParts.length === 0 && !hasAnyDataInCol) {
      continue; // Abaikan kolom paling kanan yang benar-benar kosong
    }

    const typeHint = inferTypeHint(samples);
    const { field, isUnrecognized } = autoMapColumnName(headerName, samples, savedTabMap);

    columns.push({
      colIndex: c,
      headerName,
      samples,
      mappedField: field,
      isUnrecognized,
      typeHint,
    });
  }

  return {
    sheetName,
    isHidden,
    detectedRole: role,
    selectedRole: role,
    checked,
    rawMatrix: expanded,
    headerRowCount: dataStartRowIndex,
    dataStartRowIndex,
    columns,
    dataRows: validDataRows,
    roleHintNote: note,
  };
}

/**
 * Membaca workbook Excel (.xlsx) termasuk sheet, baris, dan kolom tersembunyi + merged cells
 */
export function inspectExcelWorkbookAllTabs(
  buffer: ArrayBuffer,
  savedMappings: Record<string, Record<string, string>> = {}
): WorkbookTabInspection[] {
  const wb = XLSX.read(buffer, { type: 'array', cellDates: false });
  const sheetProps = wb.Workbook?.Sheets || [];

  return wb.SheetNames.map((name, idx) => {
    const ws = wb.Sheets[name];
    const hidden = Boolean(sheetProps[idx]?.Hidden);
    const merges: GoogleSheetMergeRange[] = Array.isArray(ws['!merges'])
      ? ws['!merges'].map((m) => ({
          startRowIndex: m.s.r,
          endRowIndex: m.e.r + 1,
          startColumnIndex: m.s.c,
          endColumnIndex: m.e.c + 1,
        }))
      : [];

    const matrix = XLSX.utils.sheet_to_json<any[]>(ws, {
      header: 1,
      raw: true,
      defval: '',
    });

    const strMatrix: string[][] = matrix.map((row) =>
      Array.isArray(row)
        ? row.map((cell) => {
            if (cell === null || cell === undefined) return '';
            if (cell instanceof Date) return normalizeIsoDate(cell).value || '';
            return String(cell);
          })
        : []
    );

    return parseStructuredTabMatrix(name, hidden, strMatrix, merges, savedMappings[name]);
  });
}

export function inspectGoogleTabsAllTabs(
  rawTabs: GoogleSheetRawTab[],
  savedMappings: Record<string, Record<string, string>> = {}
): WorkbookTabInspection[] {
  return rawTabs.map((tab) =>
    parseStructuredTabMatrix(
      tab.title,
      tab.hidden,
      tab.values,
      tab.merges,
      savedMappings[tab.title]
    )
  );
}

function parseMoneyNumber(raw: string): number {
  const trimmed = String(raw || '').trim();
  if (!trimmed || trimmed === '-') return 0;
  let cleaned = trimmed
    .replace(/idr/gi, '')
    .replace(/rp\.?/gi, '')
    .replace(/,-$/g, '')
    .replace(/[\s\u00A0]+/g, '');
  if (/^-?\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(cleaned)) {
    cleaned = cleaned.replace(/\./g, '').replace(',', '.');
  } else if (/^-?\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(cleaned)) {
    cleaned = cleaned.replace(/,/g, '');
  } else if (/^-?\d+,\d{1,2}$/.test(cleaned)) {
    cleaned = cleaned.replace(',', '.');
  }
  const num = Number(cleaned.replace(/[^0-9.-]/g, ''));
  return Number.isFinite(num) ? Math.round(num) : 0;
}

export interface CompiledBukuTabPlan {
  books: BookImportDiffItem[];
  unrecognizedStatuses: string[];
  yearGuessedCount: number;
  problemRows: ProblemRowEntry[];
}

export function compileBooksFromTab(
  tab: WorkbookTabInspection,
  existingBooks: BookJob[],
  customStatuses: string[],
  statusOverrideMap: Record<string, string> = {}
): CompiledBukuTabPlan {
  const resultBooks: BookImportDiffItem[] = [];
  const unrecognizedSet = new Set<string>();
  const problemRows: ProblemRowEntry[] = [];
  let yearGuessedCount = 0;

  tab.dataRows.forEach((row, idx) => {
    const rowNum = tab.dataStartRowIndex + idx + 1;
    const draft: Partial<BookJob> = {};
    const customFields: Record<string, string | number | null> = {};
    let hasCustom = false;

    tab.columns.forEach((col) => {
      if (col.mappedField === '__skip__') return;
      const cellVal = (row[col.colIndex] || '').trim();
      if (!cellVal) return;

      if (col.mappedField === '__custom__') {
        customFields[col.headerName] = cellVal;
        hasCustom = true;
        return;
      }

      switch (col.mappedField) {
        case 'no': {
          const parsed = parseInt(cellVal.replace(/[^\d]/g, ''), 10);
          if (!isNaN(parsed) && parsed > 0) draft.no = parsed;
          break;
        }
        case 'judul':
          draft.judul = cellVal;
          break;
        case 'penulis':
          draft.penulis = cellVal;
          break;
        case 'kategori':
          draft.kategori = normalizeKategori(cellVal);
          break;
        case 'paket':
          draft.paket = normalizePaket(cellVal) as PaketType;
          break;
        case 'statusProgres': {
          const override = statusOverrideMap[cellVal];
          if (override) {
            draft.statusProgres = override;
          } else {
            const matched = matchStatusProgres(cellVal, customStatuses);
            if (!matched.isRecognized) {
              unrecognizedSet.add(cellVal);
            }
            draft.statusProgres = matched.value;
          }
          break;
        }
        case 'tglTerima': {
          const res = normalizeIsoDate(cellVal);
          if (res.isValid) {
            draft.tglTerima = res.value;
            if (res.yearGuessed) yearGuessedCount++;
          }
          break;
        }
        case 'tglSelesaiLayout': {
          const res = normalizeIsoDate(cellVal);
          if (res.isValid) {
            draft.tglSelesaiLayout = res.value;
            if (res.yearGuessed) yearGuessedCount++;
          }
          break;
        }
        case 'updateTerakhir': {
          const res = normalizeIsoDate(cellVal);
          if (res.isValid) {
            draft.updateTerakhir = res.value;
            if (res.yearGuessed) yearGuessedCount++;
          }
          break;
        }
        case 'tglInvoice': {
          const res = normalizeIsoDate(cellVal);
          if (res.isValid) {
            draft.tglInvoice = res.value;
            if (res.yearGuessed) yearGuessedCount++;
          }
          break;
        }
        case 'tglDibayar': {
          const res = normalizeIsoDate(cellVal);
          if (res.isValid) {
            draft.tglDibayar = res.value;
            if (res.yearGuessed) yearGuessedCount++;
          }
          break;
        }
        case 'halamanAwal':
          draft.halamanAwal = parseMoneyNumber(cellVal);
          break;
        case 'halamanFinal':
          draft.halamanFinal = parseMoneyNumber(cellVal);
          break;
        case 'nilaiJasa':
          draft.nilaiJasa = parseMoneyNumber(cellVal);
          break;
        case 'stuck': {
          const lower = cellVal.toLowerCase();
          draft.stuck = lower === 'ya' || lower === 'true' || lower === 'y' ? 'Ya' : 'Tidak';
          break;
        }
        case 'statusBayar':
          draft.statusBayar = normalizeStatusBayar(cellVal) as StatusBayarType;
          break;
        case 'catatanBelumSelesai':
          draft.catatanBelumSelesai = cellVal;
          break;
        case 'catatanBiaya':
          draft.catatanBiaya = cellVal;
          break;
        case 'catatanLain':
          draft.catatanLain = draft.catatanLain
            ? `${draft.catatanLain}; ${cellVal}`
            : cellVal;
          break;
        case 'kodeProduksi':
          draft.kodeProduksi = cellVal;
          break;
        case 'isbn':
          draft.isbn = cellVal;
          break;
        case 'statusIsbn':
          draft.statusIsbn = cellVal as any;
          break;
        case 'ukuranBuku':
          draft.ukuran = cellVal;
          draft.ukuranBuku = cellVal;
          break;
        case 'catatanBuku':
          draft.catatanBuku = cellVal;
          break;
      }
    });

    if (!draft.judul || !draft.judul.trim()) {
      problemRows.push({
        tabName: tab.sheetName,
        rowNumber: rowNum,
        identifier: draft.no ? `#${draft.no}` : `Baris ${rowNum}`,
        reason: 'Kolom Judul kosong (baris dilewati).',
      });
      return;
    }

    if (hasCustom) {
      draft.customFields = customFields;
    }

    // Pencocokan buku eksisting berdasarkan No lalu Judul yang dinormalisasi
    const normTitle = draft.judul.trim().toLowerCase().replace(/\s+/g, ' ');
    const matched =
      (draft.no && draft.no > 0
        ? existingBooks.find((b) => b.no === draft.no)
        : undefined) ||
      existingBooks.find((b) => b.judul.trim().toLowerCase().replace(/\s+/g, ' ') === normTitle) ||
      null;

    const diffs: BookFieldDiff[] = [];
    if (matched) {
      const comparePairs: Array<{ key: keyof BookJob; label: string }> = [
        { key: 'judul', label: 'Judul' },
        { key: 'penulis', label: 'Penulis' },
        { key: 'statusProgres', label: 'Status Progres' },
        { key: 'paket', label: 'Paket' },
        { key: 'halamanFinal', label: 'Halaman Final' },
        { key: 'nilaiJasa', label: 'Nilai Jasa' },
        { key: 'statusBayar', label: 'Status Bayar' },
        { key: 'tglInvoice', label: 'Tgl Invoice' },
        { key: 'tglDibayar', label: 'Tgl Dibayar' },
        { key: 'catatanBuku', label: 'Catatan Buku' },
        { key: 'catatanBiaya', label: 'Note Tambahan Biaya' },
        { key: 'catatanLain', label: 'Catatan Lain' },
      ];

      comparePairs.forEach(({ key, label }) => {
        const incomingVal = draft[key];
        if (incomingVal === undefined || incomingVal === null || incomingVal === '') return;
        const oldValStr = String(matched[key] ?? '').trim();
        const newValStr = String(incomingVal).trim();
        if (oldValStr !== newValStr) {
          diffs.push({
            field: String(key),
            label,
            oldVal: oldValStr || '(kosong)',
            newVal: newValStr,
          });
        }
      });
    }

    resultBooks.push({
      imported: draft,
      existingBook: matched,
      diffs,
      sourceTab: tab.sheetName,
      rowNumber: rowNum,
    });
  });

  return {
    books: resultBooks,
    unrecognizedStatuses: Array.from(unrecognizedSet),
    yearGuessedCount,
    problemRows,
  };
}

/**
 * Menggabungkan buku lama + baru berdasarkan kebijakan duplikat
 */
export function mergeImportedBookWithExisting(
  existing: BookJob,
  incoming: Partial<BookJob>,
  policy: DuplicatePolicy
): Partial<BookJob> | null {
  if (policy === 'skip_existing') return null;

  if (policy === 'overwrite_all') {
    return {
      ...incoming,
      customFields: incoming.customFields
        ? { ...(existing.customFields || {}), ...incoming.customFields }
        : existing.customFields,
    };
  }

  // 'fill_empty': hanya isi field yang kosong di Firestore
  const patch: Partial<BookJob> = {};
  const fields: Array<keyof BookJob> = [
    'penulis',
    'kategori',
    'paket',
    'statusProgres',
    'tglTerima',
    'tglSelesaiLayout',
    'updateTerakhir',
    'halamanAwal',
    'halamanFinal',
    'nilaiJasa',
    'statusBayar',
    'tglInvoice',
    'tglDibayar',
    'catatanBelumSelesai',
    'catatanBuku',
    'catatanBiaya',
    'catatanLain',
    'kodeProduksi',
    'isbn',
    'statusIsbn',
    'ukuran',
    'ukuranBuku',
  ];

  fields.forEach((f) => {
    const curVal = existing[f];
    const incVal = incoming[f];
    const isEmptyCur =
      curVal === undefined ||
      curVal === null ||
      curVal === '' ||
      curVal === 0 ||
      curVal === 'Tanpa Penulis';
    if (isEmptyCur && incVal !== undefined && incVal !== null && incVal !== '') {
      (patch as any)[f] = incVal;
    }
  });

  if (incoming.customFields) {
    const mergedCustom = { ...(existing.customFields || {}) };
    let changed = false;
    Object.entries(incoming.customFields).forEach(([k, v]) => {
      if ((mergedCustom[k] === undefined || mergedCustom[k] === null || mergedCustom[k] === '') && v !== null) {
        mergedCustom[k] = v;
        changed = true;
      }
    });
    if (changed) patch.customFields = mergedCustom;
  }

  return Object.keys(patch).length > 0 ? patch : null;
}

export interface CompiledLogTabPlan {
  logsToCreate: ParsedLogCandidate[];
  duplicateSkippedCount: number;
  failedRows: UnmatchedLogRow[];
  yearGuessedCount: number;
}

export function compileLogsFromTab(
  tab: WorkbookTabInspection,
  allBooksSnapshot: BookJob[],
  existingLogs: BookLog[]
): CompiledLogTabPlan {
  const res = parseLogSheetRows(
    tab.rawMatrix,
    allBooksSnapshot,
    existingLogs,
    tab.sheetName
  );
  return {
    logsToCreate: res.logsToCreate,
    duplicateSkippedCount: res.duplicateSkippedCount,
    failedRows: res.failedRows,
    yearGuessedCount: res.yearGuessedCount,
  };
}

export function buildPreviewBookFromPartial(partial: Partial<BookJob>): BookJob {
  return computeDerivedBookFields(partial);
}

/**
 * Mengunduh CSV laporan baris bermasalah / gagal diimpor
 */
export function downloadProblemRowsCsv(
  problems: ProblemRowEntry[],
  filename = 'Laporan_Baris_Bermasalah_Impor.csv'
): void {
  const header = ['Tab', 'Baris', 'Identitas / Judul', 'Alasan'].join(';');
  const lines = problems.map((p) =>
    [p.tabName, p.rowNumber, p.identifier, p.reason]
      .map((cell) => {
        const s = String(cell ?? '');
        return s.includes(';') || s.includes('"') || s.includes('\n')
          ? `"${s.replace(/"/g, '""')}"`
          : s;
      })
      .join(';')
  );
  const content = [header, ...lines].join('\n');
  const blob = new Blob(['\uFEFF' + content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.setAttribute('download', filename);
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
