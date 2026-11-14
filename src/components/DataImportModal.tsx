import React, { useState, useMemo, useRef } from 'react';
import {
  X,
  Upload,
  FileSpreadsheet,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Check,
  ShieldCheck,
  FileText,
} from 'lucide-react';
import { BookJob } from '../types';
import {
  ParseResult,
  parseSheetData,
  parseExcelWorkbook,
  extractSpreadsheetId,
} from '../utils/sheetHelpers';
import { fetchDataViaGoogleSheetsApi } from '../services/api';
import {
  BatchImportOperation,
  batchImportUserBooks,
  getFirestoreErrorMessage,
  requestOneTimeSheetsImportToken,
} from '../services/firebase';

export type ImportMode = 'csv' | 'sheets';
export type DuplicateStrategy = 'skip' | 'overwrite';

interface DataImportModalProps {
  isOpen: boolean;
  initialMode: ImportMode;
  onClose: () => void;
  existingBooks: BookJob[];
  currentUid: string;
  onImportSuccess?: (summary: { created: number; updated: number }) => void;
  onImportError?: (message: string) => void;
}

function findMatchingExistingBook(
  candidate: BookJob,
  existingBooks: BookJob[]
): BookJob | undefined {
  const normJudul = candidate.judul.trim().toLowerCase();
  const normPenulis = candidate.penulis.trim().toLowerCase();

  return existingBooks.find((existing) => {
    if (candidate.no > 0 && existing.no === candidate.no) {
      return true;
    }
    return (
      existing.judul.trim().toLowerCase() === normJudul &&
      existing.penulis.trim().toLowerCase() === normPenulis
    );
  });
}

export const DataImportModal: React.FC<DataImportModalProps> = ({
  isOpen,
  initialMode,
  onClose,
  existingBooks,
  currentUid,
  onImportSuccess,
  onImportError,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [mode, setMode] = useState<ImportMode>(initialMode);
  const [selectedFileName, setSelectedFileName] = useState<string>('');
  const [sheetUrlInput, setSheetUrlInput] = useState<string>('');
  const [sheetTabName, setSheetTabName] = useState<string>('Data Dasbor');

  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [duplicateStrategy, setDuplicateStrategy] = useState<DuplicateStrategy>('skip');

  const [isReading, setIsReading] = useState<boolean>(false);
  const [isWriting, setIsWriting] = useState<boolean>(false);
  const [localError, setLocalError] = useState<string | null>(null);

  React.useEffect(() => {
    if (isOpen) {
      setMode(initialMode);
      setParseResult(null);
      setSelectedFileName('');
      setLocalError(null);
      setDuplicateStrategy('skip');
      setIsReading(false);
      setIsWriting(false);
    }
  }, [isOpen, initialMode]);

  const parsedAnalysis = useMemo(() => {
    if (!parseResult || !parseResult.success || !parseResult.books) {
      return null;
    }
    const items = parseResult.books.map((book) => {
      const match = findMatchingExistingBook(book, existingBooks);
      return {
        book,
        duplicateOf: match || null,
      };
    });
    const duplicateCount = items.filter((i) => i.duplicateOf !== null).length;
    const newCount = items.length - duplicateCount;
    return {
      items,
      duplicateCount,
      newCount,
    };
  }, [parseResult, existingBooks]);

  if (!isOpen) return null;

  const handleSelectImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLocalError(null);
    setSelectedFileName(file.name);
    setIsReading(true);

    try {
      const isExcel = /\.(xlsx|xls)$/i.test(file.name);
      const result = isExcel
        ? parseExcelWorkbook(await file.arrayBuffer())
        : parseSheetData(await file.text());

      if (!result.success) {
        setLocalError(
          result.errorMessage ||
            `Format file ${isExcel ? 'Excel' : 'CSV'} tidak valid.`
        );
        setParseResult(null);
      } else if (!result.books || result.books.length === 0) {
        setLocalError(
          `Tidak ada baris buku dengan Judul valid ditemukan di dalam file ${
            isExcel ? 'Excel' : 'CSV'
          }.`
        );
        setParseResult(result);
      } else {
        setParseResult(result);
      }
    } catch (err: any) {
      setLocalError(
        err?.message || 'Gagal membaca file Excel / CSV dari perangkat Anda.'
      );
      setParseResult(null);
    } finally {
      setIsReading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleReadGoogleSheet = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedUrl = sheetUrlInput.trim();
    if (!trimmedUrl) {
      setLocalError('Masukkan tautan atau ID Google Sheet terlebih dahulu.');
      return;
    }

    const spreadsheetId = extractSpreadsheetId(trimmedUrl);
    if (!spreadsheetId) {
      setLocalError(
        'Link Google Sheet tidak valid. Contoh: https://docs.google.com/spreadsheets/d/...'
      );
      return;
    }

    setLocalError(null);
    setParseResult(null);
    setIsReading(true);

    try {
      // Minta izin baca Google Sheets satu kali; token tidak disimpan
      const oneTimeToken = await requestOneTimeSheetsImportToken();
      const result = await fetchDataViaGoogleSheetsApi(
        spreadsheetId,
        oneTimeToken,
        sheetTabName.trim() || 'Data Dasbor'
      );

      if (!result.success) {
        setLocalError(result.errorMessage || 'Format Google Sheet tidak valid.');
        setParseResult(null);
      } else if (!result.books || result.books.length === 0) {
        setLocalError('Google Sheet tidak memiliki baris buku yang valid untuk diimpor.');
        setParseResult(result);
      } else {
        setParseResult(result);
      }
    } catch (err: any) {
      const code = err?.code || '';
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        setLocalError('Popup izin Google Sheets ditutup sebelum selesai.');
      } else if (code === 'auth/popup-blocked') {
        setLocalError(
          'Popup diblokir oleh browser. Mohon izinkan pop-up untuk situs ini lalu coba lagi.'
        );
      } else {
        setLocalError(err?.message || 'Gagal membaca data dari Google Sheet.');
      }
    } finally {
      setIsReading(false);
    }
  };

  const handleConfirmImport = async () => {
    if (!parsedAnalysis || !currentUid) return;

    setLocalError(null);
    setIsWriting(true);

    try {
      let maxNo = existingBooks.reduce((m, b) => (b.no > m ? b.no : m), 0);
      const ops: BatchImportOperation[] = [];

      for (const item of parsedAnalysis.items) {
        if (item.duplicateOf) {
          if (duplicateStrategy === 'skip') {
            continue;
          }
          if (item.duplicateOf.id) {
            ops.push({
              type: 'overwrite',
              bookId: item.duplicateOf.id,
              data: {
                ...item.book,
                no: item.book.no > 0 ? item.book.no : item.duplicateOf.no,
              },
            });
            continue;
          }
        }

        const assignedNo = item.book.no > 0 ? item.book.no : ++maxNo;
        if (assignedNo > maxNo) maxNo = assignedNo;

        ops.push({
          type: 'create',
          data: {
            ...item.book,
            no: assignedNo,
          },
        });
      }

      if (ops.length === 0) {
        setLocalError(
          'Semua baris merupakan duplikat dan opsi "Lewati duplikat" dipilih. Tidak ada data yang ditulis.'
        );
        setIsWriting(false);
        return;
      }

      const summary = await batchImportUserBooks(currentUid, ops);
      onImportSuccess?.(summary);
      onClose();
    } catch (err: any) {
      const msg = getFirestoreErrorMessage(err);
      setLocalError(msg);
      onImportError?.(msg);
    } finally {
      setIsWriting(false);
    }
  };

  const willWriteCount = parsedAnalysis
    ? duplicateStrategy === 'skip'
      ? parsedAnalysis.newCount
      : parsedAnalysis.items.length
    : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-fade-in">
      <div className="absolute inset-0" onClick={() => !isWriting && onClose()} />

      <div className="relative w-full max-w-2xl bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col max-h-[92vh] overflow-hidden z-10 animate-scale-up">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              {mode === 'csv' ? (
                <Upload className="w-5 h-5" />
              ) : (
                <FileSpreadsheet className="w-5 h-5" />
              )}
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                {mode === 'csv' ? 'Impor Data Buku (Excel / CSV)' : 'Impor Satu Kali dari Google Sheet'}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Pratinjau &amp; validasi 24 kolom (kompatibel file lama 20/22 kolom) sebelum disimpan ke Cloud Firestore
              </p>
            </div>
          </div>

          <button
            type="button"
            disabled={isWriting}
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-40"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode Switcher */}
        <div className="px-6 pt-4 shrink-0">
          <div className="grid grid-cols-2 gap-2 p-1 rounded-2xl bg-slate-100 dark:bg-slate-800">
            <button
              type="button"
              onClick={() => {
                setMode('csv');
                setParseResult(null);
                setLocalError(null);
              }}
              className={`py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                mode === 'csv'
                  ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Impor Excel / CSV</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('sheets');
                setParseResult(null);
                setLocalError(null);
              }}
              className={`py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                mode === 'sheets'
                  ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
              }`}
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Impor dari Google Sheet</span>
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="px-6 py-4 overflow-y-auto space-y-4">
          {/* Source Input Section */}
          {mode === 'csv' ? (
            <div className="p-5 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/40 text-center space-y-3">
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
                onChange={handleSelectImportFile}
                className="hidden"
              />
              <div className="w-11 h-11 rounded-2xl bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 mx-auto flex items-center justify-center">
                <Upload className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  {selectedFileName
                    ? `File dipilih: ${selectedFileName}`
                    : 'Pilih file Excel (.xlsx) atau CSV format Schnell'}
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
                  Membaca sheet &quot;Data Dasbor&quot; (atau sheet pertama), deteksi otomatis pemisah CSV (koma, titik koma, tab), pencocokan nama header, dan tanggal YYYY-MM-DD / DD/MM/YYYY / serial Excel / &quot;21 Agu&quot;.
                </p>
              </div>
              <button
                type="button"
                disabled={isReading || isWriting}
                onClick={() => fileInputRef.current?.click()}
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-colors shadow-xs disabled:opacity-50"
              >
                {isReading
                  ? 'Membaca file...'
                  : selectedFileName
                  ? 'Pilih File Lain'
                  : 'Pilih File Excel / CSV'}
              </button>
            </div>
          ) : (
            <form
              onSubmit={handleReadGoogleSheet}
              className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 space-y-3"
            >
              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Link atau Spreadsheet ID Google Sheet
                </label>
                <input
                  type="text"
                  value={sheetUrlInput}
                  onChange={(e) => setSheetUrlInput(e.target.value)}
                  placeholder="https://docs.google.com/spreadsheets/d/.../edit"
                  className="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-base sm:text-xs font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex flex-col sm:flex-row sm:items-end gap-2">
                <div className="flex-1">
                  <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">
                    Nama Tab (default: Data Dasbor)
                  </label>
                  <input
                    type="text"
                    value={sheetTabName}
                    onChange={(e) => setSheetTabName(e.target.value)}
                    placeholder="Data Dasbor"
                    className="w-full min-h-[44px] px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-base sm:text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isReading || isWriting || !sheetUrlInput.trim()}
                  className="min-h-[44px] px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-colors shadow-xs disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isReading ? 'animate-spin' : ''}`} />
                  <span>{isReading ? 'Membaca Sheet...' : 'Otorisasi & Pratinjau'}</span>
                </button>
              </div>

              <div className="flex items-start gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                <span>
                  Izin baca Google Sheets hanya diminta satu kali untuk impor ini dan tidak disimpan.
                </span>
              </div>
            </form>
          )}

          {/* Error Box */}
          {localError && (
            <div className="p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 text-xs flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
              <p className="leading-relaxed font-medium">{localError}</p>
            </div>
          )}

          {/* Preview Section */}
          {parsedAnalysis && parseResult && (
            <div className="space-y-4">
              {/* Ringkasan Angka */}
              <div className="grid grid-cols-3 gap-2.5">
                <div className="p-3 rounded-2xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200/70 dark:border-blue-900/50">
                  <span className="text-[10px] font-bold uppercase text-blue-600 dark:text-blue-400 block">
                    Total Baris Valid
                  </span>
                  <span className="text-lg font-black text-slate-900 dark:text-white">
                    {parsedAnalysis.items.length} Buku
                  </span>
                  <span className="text-[10px] text-slate-500 block">
                    dari {parseResult.totalDataRows ?? parsedAnalysis.items.length} baris dibaca
                  </span>
                </div>

                <div className="p-3 rounded-2xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200/70 dark:border-amber-900/50">
                  <span className="text-[10px] font-bold uppercase text-amber-700 dark:text-amber-400 block">
                    Peringatan / Error
                  </span>
                  <span className="text-lg font-black text-slate-900 dark:text-white">
                    {parseResult.errorCount || 0} Baris
                  </span>
                  <span className="text-[10px] text-slate-500 block">
                    {(parseResult.errorCount || 0) > 0
                      ? 'Nilai tak valid jadi null'
                      : 'Semua format bersih'}
                  </span>
                </div>

                <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                  <span className="text-[10px] font-bold uppercase text-slate-500 block">
                    Duplikat Ditemukan
                  </span>
                  <span className="text-lg font-black text-slate-900 dark:text-white">
                    {parsedAnalysis.duplicateCount} Buku
                  </span>
                  <span className="text-[10px] text-slate-500 block">
                    {parsedAnalysis.newCount} buku baru
                  </span>
                </div>
              </div>

              {/* Info tanggal pendek yang tahunnya ditebak */}
              {(parseResult.yearGuessedCount || 0) > 0 && (
                <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 text-xs text-blue-800 dark:text-blue-200">
                  Terdapat <strong>{parseResult.yearGuessedCount} tanggal tanpa tahun</strong> (misal &ldquo;21 Agu&rdquo;) yang otomatis dilengkapi tahunnya berdasarkan tanggal berjalan.
                </div>
              )}

              {/* Detail Peringatan / Error Validasi Baris */}
              {parseResult.issues && parseResult.issues.length > 0 && (
                <div className="p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 space-y-1.5 max-h-36 overflow-y-auto">
                  <div className="text-xs font-bold text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>Laporan Validasi Baris ({parseResult.issues.length})</span>
                  </div>
                  <ul className="space-y-1 text-[11px] text-amber-900 dark:text-amber-200">
                    {parseResult.issues.map((issue, i) => (
                      <li key={`issue-${issue.rowNumber}-${i}`}>
                        <strong>Baris {issue.rowNumber}</strong> ({issue.judul}):{' '}
                        {issue.messages.join('; ')}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Opsi Penanganan Duplikat */}
              {parsedAnalysis.duplicateCount > 0 && (
                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2.5">
                  <div className="text-xs font-bold text-slate-900 dark:text-white">
                    Ditemukan {parsedAnalysis.duplicateCount} buku dengan No atau Judul + Penulis yang sama:
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setDuplicateStrategy('skip')}
                      className={`p-3 rounded-xl border text-left transition-all ${
                        duplicateStrategy === 'skip'
                          ? 'bg-blue-50 dark:bg-blue-950/40 border-blue-500 text-blue-900 dark:text-blue-200'
                          : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      <div className="text-xs font-bold flex items-center gap-1.5">
                        <CheckCircle2
                          className={`w-3.5 h-3.5 ${
                            duplicateStrategy === 'skip' ? 'text-blue-600' : 'text-slate-400'
                          }`}
                        />
                        <span>Lewati duplikat</span>
                      </div>
                      <div className="text-[11px] opacity-80 mt-0.5">
                        Hanya impor {parsedAnalysis.newCount} buku baru, data lama tetap aman.
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setDuplicateStrategy('overwrite')}
                      className={`p-3 rounded-xl border text-left transition-all ${
                        duplicateStrategy === 'overwrite'
                          ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-500 text-amber-900 dark:text-amber-200'
                          : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      <div className="text-xs font-bold flex items-center gap-1.5">
                        <CheckCircle2
                          className={`w-3.5 h-3.5 ${
                            duplicateStrategy === 'overwrite' ? 'text-amber-600' : 'text-slate-400'
                          }`}
                        />
                        <span>Timpa</span>
                      </div>
                      <div className="text-[11px] opacity-80 mt-0.5">
                        Perbarui {parsedAnalysis.duplicateCount} buku yang sudah ada + tambah {parsedAnalysis.newCount} baru.
                      </div>
                    </button>
                  </div>
                </div>
              )}

              {/* Pratinjau Baris Data */}
              <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
                <div className="px-3.5 py-2 bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 text-[11px] font-bold text-slate-600 dark:text-slate-300 flex items-center justify-between gap-2">
                  <span>
                    Pratinjau Data yang Akan Diimpor
                    {parseResult.sheetNameUsed ? ` (Sheet: ${parseResult.sheetNameUsed})` : ''}
                  </span>
                  <span>Menampilkan {Math.min(parsedAnalysis.items.length, 8)} baris pertama</span>
                </div>
                <div className="max-h-48 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                  {parsedAnalysis.items.slice(0, 8).map((item, idx) => (
                    <div
                      key={`preview-row-${idx}`}
                      className="px-3.5 py-2 flex items-center justify-between gap-3 bg-white dark:bg-slate-900"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="font-bold text-slate-900 dark:text-white truncate">
                          {item.book.no > 0 ? `#${item.book.no} ` : ''}
                          {item.book.judul}
                        </div>
                        <div className="text-[11px] text-slate-500 truncate">
                          {item.book.penulis} · {item.book.paket} · {item.book.statusProgres}
                        </div>
                      </div>
                      <div className="shrink-0">
                        {item.duplicateOf ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                            {duplicateStrategy === 'skip' ? 'Akan Dilewati' : 'Akan Ditimpa'}
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                            Baru
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/80 border-t border-slate-200/80 dark:border-slate-800 flex items-center justify-between gap-3 shrink-0">
          <span className="text-[11px] text-slate-500 dark:text-slate-400">
            {parsedAnalysis
              ? `Siap menulis ${willWriteCount} buku ke Firestore`
              : 'Pilih file Excel / CSV atau baca Google Sheet untuk pratinjau'}
          </span>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={isWriting}
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold hover:bg-slate-300 transition-colors disabled:opacity-50"
            >
              Batal
            </button>

            <button
              type="button"
              disabled={!parsedAnalysis || willWriteCount === 0 || isWriting}
              onClick={handleConfirmImport}
              className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-colors shadow-sm flex items-center gap-1.5 disabled:opacity-40"
            >
              {isWriting ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Menyimpan ke Firestore...</span>
                </>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>Konfirmasi &amp; Impor ({willWriteCount})</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
