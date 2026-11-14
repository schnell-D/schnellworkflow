import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';
import { BookJob, BookLog, LogJenisType, LogStatusType } from '../types';
import {
  LOG_DARI_SUGGESTIONS,
  LOG_JENIS_OPTIONS,
  LOG_STATUS_OPTIONS,
  normalizeLogJenis,
  normalizeLogStatus,
} from '../config/logConstants';
import { normalizeLogDariInput } from '../config/masterData';
import { normalizeIsoDate } from './bookHelpers';
import { formatLogDateShort } from './formatters';
import { parseCsvRows } from './sheetHelpers';

/**
 * Hash deterministik FNV-1a 64-bit hex untuk mencegah duplikasi saat impor ulang log
 */
export function buildDeterministicLogDocId(
  bookId: string,
  tanggal: string | null,
  dari: string,
  isi: string
): string {
  const normalizedIsi = isi.trim().toLowerCase().replace(/\s+/g, ' ');
  const normalizedDari = dari.trim().toLowerCase().replace(/\s+/g, ' ');
  const key = `${bookId}::${tanggal || 'null'}::${normalizedDari}::${normalizedIsi}`;

  let h1 = 0xdeadbeef ^ key.length;
  let h2 = 0x41c6ce57 ^ key.length;
  for (let i = 0; i < key.length; i++) {
    const ch = key.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const combined = (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
  return `log_${combined}_${(h1 >>> 0).toString(36)}`;
}

export interface BookLogSummary {
  totalCount: number;
  baruCount: number;
  selesaiCount: number;
  latestTanggal: string | null;
  latestIsi: string;
  summaryText: string | null;
}

export function sortLogsLatestFirst(a: BookLog, b: BookLog): number {
  const ta = a.tanggal || '';
  const tb = b.tanggal || '';
  if (ta !== tb) return tb.localeCompare(ta);
  return (b.id || '').localeCompare(a.id || '');
}

export function summarizeBookLogs(logs: BookLog[]): BookLogSummary {
  if (!logs || logs.length === 0) {
    return {
      totalCount: 0,
      baruCount: 0,
      selesaiCount: 0,
      latestTanggal: null,
      latestIsi: '',
      summaryText: null,
    };
  }

  const sorted = [...logs].sort(sortLogsLatestFirst);
  const latest = sorted[0];
  const baruCount = logs.filter((l) => l.status === 'Baru').length;
  const totalCount = logs.length;
  const selesaiCount = totalCount - baruCount;

  const tglLabel = latest.tanggal ? formatLogDateShort(latest.tanggal) : 'Tanpa tgl';
  const isiSnippet =
    latest.isi.length > 52 ? `${latest.isi.slice(0, 52).trim()}...` : latest.isi;
  const countsLabel =
    baruCount > 0
      ? `${totalCount} catatan, ${baruCount} belum selesai`
      : `${totalCount} catatan`;

  return {
    totalCount,
    baruCount,
    selesaiCount,
    latestTanggal: latest.tanggal,
    latestIsi: latest.isi,
    summaryText: `${tglLabel} · ${isiSnippet} · ${countsLabel}`,
  };
}

export interface ParsedLogCandidate {
  deterministicId: string;
  bookId: string;
  bookNo: number;
  bookJudul: string;
  tanggal: string | null;
  dari: string;
  isi: string;
  jenis: LogJenisType;
  status: LogStatusType;
  yearGuessed: boolean;
  isDuplicate: boolean;
  rowNumber: number;
}

export interface UnmatchedLogRow {
  rowNumber: number;
  no: number | null;
  judul: string;
  isi: string;
  reason: string;
}

export interface LogParseResult {
  success: boolean;
  sheetNameUsed?: string;
  logsToCreate: ParsedLogCandidate[];
  duplicateSkippedCount: number;
  failedRows: UnmatchedLogRow[];
  affectedBookIds: string[];
  yearGuessedCount: number;
  totalRowsRead: number;
  errorMessage?: string;
}

function normHeader(raw: string): string {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[\s_\-./()]+/g, '');
}

function normTitle(raw: string): string {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function findMatchingBookForLog(
  bookNo: number | null,
  bookTitle: string,
  books: BookJob[]
): BookJob | undefined {
  if (bookNo !== null && bookNo > 0) {
    const byNo = books.find((b) => b.no === bookNo);
    if (byNo) return byNo;
  }
  const norm = normTitle(bookTitle);
  if (!norm) return undefined;
  return books.find((b) => normTitle(b.judul) === norm);
}

/**
 * Parsing matriks 2D baris sheet "LOG CATATAN PER BUKU" sesuai spesifikasi I.4:
 * - Lewati judul & baris kosong; cari header yg punya "Tanggal" dan ("Isi catatan" / "Isi" / "Catatan")
 * - Baris judul buku (punya No/judul teks, kolom Dari & Isi kosong) memperbarui buku aktif, bukan log
 * - Baris catatan (Isi tidak kosong) dicocokkan ke buku berdasarkan No lalu fallback Judul
 */
export function parseLogSheetRows(
  rawRows: string[][],
  books: BookJob[],
  existingLogs: BookLog[],
  sheetNameUsed?: string
): LogParseResult {
  const rows = rawRows.map((r) => (Array.isArray(r) ? r.map((c) => String(c ?? '')) : []));

  // Cari baris header (mengandung "Tanggal" dan salah satu "Isi catatan"/"Isi"/"Catatan")
  let headerRowIdx = -1;
  let colNo = -1;
  let colJudul = -1;
  let colTanggal = -1;
  let colDari = -1;
  let colIsi = -1;
  let colJenis = -1;
  let colStatus = -1;

  for (let i = 0; i < Math.min(rows.length, 25); i++) {
    const row = rows[i];
    const normCells = row.map(normHeader);
    const tglIdx = normCells.findIndex((c) => c === 'tanggal' || c === 'tgl');
    const isiIdx = normCells.findIndex(
      (c) => c === 'isicatatan' || c === 'isi' || c === 'catatan' || c === 'note'
    );

    if (tglIdx !== -1 && isiIdx !== -1) {
      headerRowIdx = i;
      colTanggal = tglIdx;
      colIsi = isiIdx;
      colNo = normCells.findIndex((c) => c === 'no' || c === 'nomor' || c === 'nobuku');
      colJudul = normCells.findIndex(
        (c) => c === 'judul' || c === 'judulbuku' || c === 'buku' || c === 'namabuku'
      );
      colDari = normCells.findIndex((c) => c === 'dari' || c === 'pengirim' || c === 'sumber');
      colJenis = normCells.findIndex((c) => c === 'jenis' || c === 'kategori' || c === 'tipe');
      colStatus = normCells.findIndex((c) => c === 'status');
      break;
    }
  }

  if (headerRowIdx === -1) {
    return {
      success: false,
      sheetNameUsed,
      logsToCreate: [],
      duplicateSkippedCount: 0,
      failedRows: [],
      affectedBookIds: [],
      yearGuessedCount: 0,
      totalRowsRead: 0,
      errorMessage:
        'Header tabel log tidak ditemukan. Pastikan tabel memiliki kolom "Tanggal" dan "Isi catatan" (atau "Isi" / "Catatan").',
    };
  }

  const existingIds = new Set<string>(
    existingLogs.map((l) =>
      buildDeterministicLogDocId(l.bookId, l.tanggal, l.dari, l.isi)
    )
  );
  // Sertakan juga ID aktual jika cocok
  existingLogs.forEach((l) => {
    if (l.id) existingIds.add(l.id);
  });

  const seenInImport = new Set<string>();
  const logsToCreate: ParsedLogCandidate[] = [];
  const failedRows: UnmatchedLogRow[] = [];
  const affectedSet = new Set<string>();

  let duplicateSkippedCount = 0;
  let yearGuessedCount = 0;
  let totalRowsRead = 0;

  let currentGroupNo: number | null = null;
  let currentGroupTitle = '';
  const noToTitleMap = new Map<number, string>();

  for (let i = headerRowIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    const hasAnyValue = row.some((c) => c.trim() !== '');
    if (!hasAnyValue) continue;

    const rawNoStr = colNo >= 0 ? (row[colNo] || '').trim() : '';
    const rawJudulStr = colJudul >= 0 ? (row[colJudul] || '').trim() : '';
    const rawTglStr = colTanggal >= 0 ? (row[colTanggal] || '').trim() : '';
    const rawDariStr = colDari >= 0 ? (row[colDari] || '').trim() : '';
    const rawIsiStr = colIsi >= 0 ? (row[colIsi] || '').trim() : '';
    const rawJenisStr = colJenis >= 0 ? (row[colJenis] || '').trim() : '';
    const rawStatusStr = colStatus >= 0 ? (row[colStatus] || '').trim() : '';

    // Parse nomor jika ada
    const parsedNo = /^\d+$/.test(rawNoStr) ? parseInt(rawNoStr, 10) : null;

    // Deteksi baris header grup judul buku: punya No atau Judul, tapi Dari dan Isi kosong
    if (!rawIsiStr && !rawDariStr) {
      let groupTitleCandidate = rawJudulStr;
      if (!groupTitleCandidate) {
        // Pada layout 6 kolom user (No, Tanggal, Dari, Isi catatan, Jenis, Status),
        // judul grup sering ditaruh di kolom sebelah No (kolom Tanggal atau col 1..2)
        for (let c = 0; c < row.length; c++) {
          if (c === colNo) continue;
          const val = (row[c] || '').trim();
          if (val) {
            groupTitleCandidate = val;
            break;
          }
        }
      }

      if (parsedNo !== null || groupTitleCandidate) {
        if (parsedNo !== null) currentGroupNo = parsedNo;
        if (groupTitleCandidate) {
          currentGroupTitle = groupTitleCandidate;
          if (currentGroupNo !== null) {
            noToTitleMap.set(currentGroupNo, currentGroupTitle);
          }
        }
      }
      continue;
    }

    if (!rawIsiStr) {
      // Baris punya Dari atau tanggal tapi isi kosong
      continue;
    }

    totalRowsRead++;
    const rowNumber = i + 1;

    // Tentukan buku untuk baris catatan ini
    const rowBookNo = parsedNo !== null ? parsedNo : currentGroupNo;
    const rowBookTitle =
      rawJudulStr ||
      (rowBookNo !== null ? noToTitleMap.get(rowBookNo) || currentGroupTitle : currentGroupTitle);

    const matchedBook = findMatchingBookForLog(rowBookNo, rowBookTitle, books);

    if (!matchedBook || !matchedBook.id) {
      failedRows.push({
        rowNumber,
        no: rowBookNo,
        judul: rowBookTitle || '(Judul grup tidak terbaca)',
        isi: rawIsiStr.slice(0, 80),
        reason: 'Buku belum ada di daftar — impor tab Buku terlebih dahulu.',
      });
      continue;
    }

    const dateRes = normalizeIsoDate(rawTglStr);
    const tanggal = dateRes.isValid ? dateRes.value : null;
    if (dateRes.yearGuessed) {
      yearGuessedCount++;
    }

    const dari = rawDariStr
      ? normalizeLogDariInput(rawDariStr)
      : tanggal === null
      ? 'Lama'
      : '';
    const jenis = normalizeLogJenis(rawJenisStr);
    const status = normalizeLogStatus(rawStatusStr);
    const isi = rawIsiStr.trim();

    const deterministicId = buildDeterministicLogDocId(
      matchedBook.id,
      tanggal,
      dari,
      isi
    );

    const isDuplicate =
      existingIds.has(deterministicId) || seenInImport.has(deterministicId);
    seenInImport.add(deterministicId);

    if (isDuplicate) {
      duplicateSkippedCount++;
      continue;
    }

    affectedSet.add(matchedBook.id);
    logsToCreate.push({
      deterministicId,
      bookId: matchedBook.id,
      bookNo: matchedBook.no,
      bookJudul: matchedBook.judul,
      tanggal,
      dari,
      isi,
      jenis,
      status,
      yearGuessed: Boolean(dateRes.yearGuessed),
      isDuplicate: false,
      rowNumber,
    });
  }

  return {
    success: true,
    sheetNameUsed,
    logsToCreate,
    duplicateSkippedCount,
    failedRows,
    affectedBookIds: Array.from(affectedSet),
    yearGuessedCount,
    totalRowsRead,
  };
}

export function parseLogWorkbookBuffer(
  buffer: ArrayBuffer,
  books: BookJob[],
  existingLogs: BookLog[]
): LogParseResult {
  const wb = XLSX.read(buffer, { type: 'array', cellDates: false });
  if (!wb.SheetNames || wb.SheetNames.length === 0) {
    return {
      success: false,
      logsToCreate: [],
      duplicateSkippedCount: 0,
      failedRows: [],
      affectedBookIds: [],
      yearGuessedCount: 0,
      totalRowsRead: 0,
      errorMessage: 'File Excel tidak memiliki lembar kerja (sheet).',
    };
  }

  const targetSheetName =
    wb.SheetNames.find((n) => n.trim().toLowerCase().includes('log')) || wb.SheetNames[0];
  const ws = wb.Sheets[targetSheetName];
  if (!ws) {
    return {
      success: false,
      logsToCreate: [],
      duplicateSkippedCount: 0,
      failedRows: [],
      affectedBookIds: [],
      yearGuessedCount: 0,
      totalRowsRead: 0,
      errorMessage: `Sheet "${targetSheetName}" tidak dapat dibaca.`,
    };
  }

  const matrix = XLSX.utils.sheet_to_json<any[]>(ws, {
    header: 1,
    raw: true,
    defval: '',
  });

  const rawRows: string[][] = matrix.map((row) =>
    Array.isArray(row)
      ? row.map((cell) => {
          if (cell === null || cell === undefined) return '';
          if (cell instanceof Date) return normalizeIsoDate(cell).value || '';
          return String(cell);
        })
      : []
  );

  return parseLogSheetRows(rawRows, books, existingLogs, targetSheetName);
}

export function parseLogCsvText(
  csvText: string,
  books: BookJob[],
  existingLogs: BookLog[]
): LogParseResult {
  const rows = parseCsvRows(csvText);
  return parseLogSheetRows(rows, books, existingLogs, 'CSV');
}

// ============================================================================
// EKSPOR & TEMPLATE LOG EXCEL (.xlsx) — Sesuai Layout "LOG CATATAN PER BUKU"
// ============================================================================

async function generateLogWorkbookAndDownload(
  groups: Array<{ no: number; judul: string; logs: Array<{ tanggal: string | null; dari: string; isi: string; jenis: string; status: string }> }>,
  filename: string
): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Schnell';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('LOG CATATAN PER BUKU', {
    views: [{ state: 'frozen', ySplit: 2 }],
  });

  // Baris 1: Judul Sheet
  sheet.mergeCells('A1:F1');
  const titleCell = sheet.getCell('A1');
  titleCell.value = 'LOG CATATAN PER BUKU';
  titleCell.font = {
    name: 'Plus Jakarta Sans',
    size: 13,
    bold: true,
    color: { argb: 'FF0F172A' },
  };
  titleCell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE2E8F0' },
  };
  titleCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  sheet.getRow(1).height = 30;

  // Baris 2: Header Kolom Standar
  const headers = ['No', 'Tanggal', 'Dari', 'Isi catatan', 'Jenis', 'Status'];
  const widths = [7, 15, 16, 60, 16, 15];

  widths.forEach((w, idx) => {
    sheet.getColumn(idx + 1).width = w;
  });

  const headerRow = sheet.getRow(2);
  headerRow.values = headers;
  headerRow.height = 26;
  headerRow.eachCell((cell) => {
    cell.font = {
      name: 'Plus Jakarta Sans',
      size: 11,
      bold: true,
      color: { argb: 'FFFFFFFF' },
    };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF2F6BDE' },
    };
    cell.alignment = { vertical: 'middle', horizontal: 'left' };
  });

  const dariFormula = `"${LOG_DARI_SUGGESTIONS.join(',')}"`;
  const jenisFormula = `"${LOG_JENIS_OPTIONS.join(',')}"`;
  const statusFormula = `"${LOG_STATUS_OPTIONS.join(',')}"`;

  groups.forEach((grp) => {
    // Baris header grup buku
    const groupRow = sheet.addRow([grp.no, grp.judul, '', '', '', '']);
    sheet.mergeCells(groupRow.number, 2, groupRow.number, 6);
    groupRow.height = 23;
    groupRow.eachCell({ includeEmpty: true }, (cell) => {
      cell.font = {
        name: 'Plus Jakarta Sans',
        size: 10.5,
        bold: true,
        color: { argb: 'FF1E293B' },
      };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF1F5F9' },
      };
      cell.alignment = { vertical: 'middle', horizontal: 'left' };
    });

    // Baris catatan log milik buku tersebut
    grp.logs.forEach((item) => {
      const logRow = sheet.addRow([
        '',
        item.tanggal ? formatLogDateShort(item.tanggal) : '',
        item.dari,
        item.isi,
        item.jenis,
        item.status,
      ]);
      logRow.height = 22;
      logRow.getCell(4).alignment = { wrapText: true, vertical: 'top' };

      // Validasi dropdown Excel untuk Dari (warning agar teks bebas tetap boleh), Jenis, Status
      logRow.getCell(3).dataValidation = {
        type: 'list',
        allowBlank: true,
        errorStyle: 'warning',
        showErrorMessage: true,
        formulae: [dariFormula],
      };
      logRow.getCell(5).dataValidation = {
        type: 'list',
        allowBlank: true,
        errorStyle: 'warning',
        showErrorMessage: true,
        formulae: [jenisFormula],
      };
      logRow.getCell(6).dataValidation = {
        type: 'list',
        allowBlank: true,
        errorStyle: 'warning',
        showErrorMessage: true,
        formulae: [statusFormula],
      };
    });
  });

  // Tambahkan data validation dropdown untuk beberapa baris kosong berikutnya di template
  const lastRowNum = sheet.rowCount;
  for (let r = lastRowNum + 1; r <= lastRowNum + 20; r++) {
    sheet.getCell(r, 3).dataValidation = {
      type: 'list',
      allowBlank: true,
      errorStyle: 'warning',
      showErrorMessage: true,
      formulae: [dariFormula],
    };
    sheet.getCell(r, 5).dataValidation = {
      type: 'list',
      allowBlank: true,
      errorStyle: 'warning',
      showErrorMessage: true,
      formulae: [jenisFormula],
    };
    sheet.getCell(r, 6).dataValidation = {
      type: 'list',
      allowBlank: true,
      errorStyle: 'warning',
      showErrorMessage: true,
      formulae: [statusFormula],
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
 * Unduh file template log catatan (.xlsx) dengan 3 baris contoh kode catatan & dropdown Excel
 */
export async function downloadLogTemplateXlsx(
  filename = 'Template_Log_Catatan_Schnell.xlsx'
): Promise<void> {
  const sampleGroups = [
    {
      no: 1,
      judul: 'Contoh Judul Buku Pertama (sesuaikan dengan No buku Anda)',
      logs: [
        {
          tanggal: '2026-10-27',
          dari: 'E',
          isi: 'baru masuk koreksi 1 (contoh kode Dari E=Editor, Jenis R=Revisi)',
          jenis: 'R',
          status: 'Baru',
        },
        {
          tanggal: '2026-11-04',
          dari: 'S',
          isi: 'kelengkapan belum ada (contoh kode S=Saya, M=Masalah)',
          jenis: 'M',
          status: 'Selesai',
        },
      ],
    },
    {
      no: 2,
      judul: 'Contoh Judul Buku Kedua',
      logs: [
        {
          tanggal: '2026-11-10',
          dari: 'Penerbit',
          isi: 'Tambahan subbab & contoh penulisan kata penuh atau kode -/P',
          jenis: 'Tambahan naskah',
          status: 'Baru',
        },
      ],
    },
  ];

  await generateLogWorkbookAndDownload(sampleGroups, filename);
}

/**
 * Ekspor seluruh log catatan dikelompokkan per buku ke .xlsx agar bisa diimpor ulang tanpa kehilangan data
 */
export async function downloadLogExportXlsx(
  books: BookJob[],
  logs: BookLog[],
  filename = 'Export_Log_Catatan_Schnell.xlsx'
): Promise<void> {
  const bookMap = new Map<string, BookJob>();
  books.forEach((b) => {
    if (b.id) bookMap.set(b.id, b);
  });

  const grouped = new Map<
    string,
    { no: number; judul: string; logs: BookLog[] }
  >();

  logs.forEach((log) => {
    const b = bookMap.get(log.bookId);
    const key = log.bookId || `no-${log.bookNo}`;
    if (!grouped.has(key)) {
      grouped.set(key, {
        no: b?.no ?? log.bookNo,
        judul: b?.judul ?? `Buku #${log.bookNo}`,
        logs: [],
      });
    }
    grouped.get(key)!.logs.push(log);
  });

  const sortedGroups = Array.from(grouped.values())
    .sort((a, b) => a.no - b.no)
    .map((g) => ({
      no: g.no,
      judul: g.judul,
      logs: [...g.logs].sort(sortLogsLatestFirst).map((item) => ({
        tanggal: item.tanggal,
        dari: item.dari,
        isi: item.isi,
        jenis: item.jenis,
        status: item.status,
      })),
    }));

  await generateLogWorkbookAndDownload(sortedGroups, filename);
}
