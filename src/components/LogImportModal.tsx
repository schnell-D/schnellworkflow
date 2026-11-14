import React, { useState, useRef } from 'react';
import {
  X,
  Upload,
  FileSpreadsheet,
  AlertTriangle,
  RefreshCw,
  Check,
  ShieldCheck,
  FileText,
  Download,
} from 'lucide-react';
import { BookJob, BookLog } from '../types';
import { extractSpreadsheetId } from '../utils/sheetHelpers';
import {
  LogParseResult,
  parseLogWorkbookBuffer,
  parseLogCsvText,
  parseLogSheetRows,
  downloadLogTemplateXlsx,
} from '../utils/logHelpers';
import {
  fetchGoogleSpreadsheetAllTabs,
  GoogleSheetRawTab,
} from '../services/api';
import {
  batchUpsertUserLogs,
  addUserActivity,
  getFirestoreErrorMessage,
  requestOneTimeSheetsImportToken,
  saveUserCloudData,
} from '../services/firebase';
import { formatLogDateShort } from '../utils/formatters';

interface LogImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  books: BookJob[];
  existingLogs: BookLog[];
  currentUid: string;
  onImportSuccess?: (summary: { created: number; affectedBooks: number }) => void;
  onImportError?: (message: string) => void;
}

export const LogImportModal: React.FC<LogImportModalProps> = ({
  isOpen,
  onClose,
  books,
  existingLogs,
  currentUid,
  onImportSuccess,
  onImportError,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [mode, setMode] = useState<'file' | 'sheets'>('file');
  const [selectedFileName, setSelectedFileName] = useState('');
  const [sheetUrlInput, setSheetUrlInput] = useState('');
  const [googleTabs, setGoogleTabs] = useState<GoogleSheetRawTab[]>([]);
  const [selectedTabTitle, setSelectedTabTitle] = useState('');

  const [parseResult, setParseResult] = useState<LogParseResult | null>(null);
  const [isReading, setIsReading] = useState(false);
  const [isWriting, setIsWriting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  React.useEffect(() => {
    if (isOpen) {
      setParseResult(null);
      setSelectedFileName('');
      setGoogleTabs([]);
      setSelectedTabTitle('');
      setLocalError(null);
      setIsReading(false);
      setIsWriting(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLocalError(null);
    setSelectedFileName(file.name);
    setIsReading(true);
    try {
      const isExcel = /\.(xlsx|xls)$/i.test(file.name);
      const res = isExcel
        ? parseLogWorkbookBuffer(await file.arrayBuffer(), books, existingLogs)
        : parseLogCsvText(await file.text(), books, existingLogs);

      if (!res.success) {
        setLocalError(res.errorMessage || 'Format log catatan tidak valid.');
        setParseResult(null);
      } else {
        setParseResult(res);
      }
    } catch (err: any) {
      setLocalError(err?.message || 'Gagal membaca file log catatan.');
      setParseResult(null);
    } finally {
      setIsReading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleReadGoogleSheet = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = sheetUrlInput.trim();
    if (!trimmed) {
      setLocalError('Masukkan tautan atau ID Google Sheet terlebih dahulu.');
      return;
    }
    const spreadsheetId = extractSpreadsheetId(trimmed);
    if (!spreadsheetId) {
      setLocalError('Link Google Sheet tidak valid.');
      return;
    }

    setLocalError(null);
    setParseResult(null);
    setIsReading(true);
    try {
      const token = await requestOneTimeSheetsImportToken();
      const tabs = await fetchGoogleSpreadsheetAllTabs(spreadsheetId, token);
      setGoogleTabs(tabs);

      const preferred =
        tabs.find((t) => t.title.toLowerCase().includes('log')) || tabs[0];
      setSelectedTabTitle(preferred.title);

      const res = parseLogSheetRows(
        preferred.values,
        books,
        existingLogs,
        preferred.title
      );
      if (!res.success) {
        setLocalError(res.errorMessage || 'Header log tidak ditemukan di tab tersebut.');
        setParseResult(null);
      } else {
        setParseResult(res);
      }
    } catch (err: any) {
      setLocalError(err?.message || 'Gagal membaca Google Sheet.');
    } finally {
      setIsReading(false);
    }
  };

  const handleSwitchGoogleTab = (tabTitle: string) => {
    setSelectedTabTitle(tabTitle);
    setLocalError(null);
    const tab = googleTabs.find((t) => t.title === tabTitle);
    if (!tab) return;
    const res = parseLogSheetRows(tab.values, books, existingLogs, tab.title);
    if (!res.success) {
      setLocalError(res.errorMessage || 'Header log tidak ditemukan di tab ini.');
      setParseResult(null);
    } else {
      setParseResult(res);
    }
  };

  const handleConfirmImport = async () => {
    if (!parseResult || parseResult.logsToCreate.length === 0 || !currentUid) return;
    setIsWriting(true);
    setLocalError(null);

    try {
      const importId = `imp_log_${Date.now()}`;
      const batchItems = parseResult.logsToCreate.map((c) => ({
        docId: c.deterministicId,
        data: {
          bookId: c.bookId,
          bookNo: c.bookNo,
          tanggal: c.tanggal,
          dari: c.dari,
          isi: c.isi,
          jenis: c.jenis,
          status: c.status,
          source: 'import' as const,
          importId,
        },
      }));

      const written = await batchUpsertUserLogs(currentUid, batchItems);
      await saveUserCloudData(currentUid, {
        lastImport: {
          importId,
          timestamp: new Date().toISOString(),
          createdBooks: 0,
          updatedBooks: 0,
          createdLogs: written,
          problemRowsCount: parseResult.failedRows.length,
          sourceName:
            mode === 'file' ? selectedFileName : `Google Sheet (${selectedTabTitle})`,
        },
      });
      await addUserActivity(currentUid, {
        type: 'import_batch',
        title: `Impor ${written} Log Catatan`,
        detail: `Mengenai ${parseResult.affectedBookIds.length} buku${
          parseResult.duplicateSkippedCount > 0
            ? ` · ${parseResult.duplicateSkippedCount} duplikat dilewati`
            : ''
        }`,
        importId,
      });

      onImportSuccess?.({
        created: written,
        affectedBooks: parseResult.affectedBookIds.length,
      });
      onClose();
    } catch (err) {
      const msg = getFirestoreErrorMessage(err);
      setLocalError(msg);
      onImportError?.(msg);
    } finally {
      setIsWriting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs">
      <div className="absolute inset-0" onClick={() => !isWriting && onClose()} />
      <div className="relative z-10 w-full max-w-2xl bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col max-h-[92dvh] overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white">
              Impor Log Catatan Per Buku
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Mendukung sheet &quot;LOG CATATAN PER BUKU&quot; (.xlsx, .csv, atau Google Sheet)
            </p>
          </div>
          <button
            type="button"
            disabled={isWriting}
            onClick={onClose}
            className="min-w-[44px] min-h-[44px] rounded-xl text-slate-400 hover:text-slate-600 flex items-center justify-center"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode Switcher */}
        <div className="px-6 pt-4">
          <div className="grid grid-cols-2 gap-2 p-1 rounded-2xl bg-slate-100 dark:bg-slate-800">
            <button
              type="button"
              onClick={() => {
                setMode('file');
                setParseResult(null);
                setLocalError(null);
              }}
              className={`min-h-[40px] py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 ${
                mode === 'file'
                  ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>File Excel / CSV</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('sheets');
                setParseResult(null);
                setLocalError(null);
              }}
              className={`min-h-[40px] py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 ${
                mode === 'sheets'
                  ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Google Sheet</span>
            </button>
          </div>
        </div>

        <div className="px-6 py-4 overflow-y-auto space-y-4">
          {mode === 'file' ? (
            <div className="p-5 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/40 text-center space-y-3">
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileChange}
                className="hidden"
              />
              <div className="space-y-1">
                <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  {selectedFileName
                    ? `File: ${selectedFileName}`
                    : 'Pilih file Excel (.xlsx) atau CSV Log Catatan'}
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Otomatis mendeteksi header (No, Tanggal, Dari, Isi catatan, Jenis, Status), baris judul buku, dan tanggal pendek seperti &quot;27 Okt&quot;.
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2">
                <button
                  type="button"
                  disabled={isReading || isWriting}
                  onClick={() => fileInputRef.current?.click()}
                  className="min-h-[44px] px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold inline-flex items-center gap-1.5"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>{isReading ? 'Membaca...' : 'Pilih File Log'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => downloadLogTemplateXlsx()}
                  className="min-h-[44px] px-3.5 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold inline-flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Download Template Log</span>
                </button>
              </div>
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
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    value={sheetUrlInput}
                    onChange={(e) => setSheetUrlInput(e.target.value)}
                    placeholder="https://docs.google.com/spreadsheets/d/..."
                    className="flex-1 min-h-[44px] px-3.5 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-base sm:text-xs font-mono text-slate-900 dark:text-white"
                  />
                  <button
                    type="submit"
                    disabled={isReading || isWriting || !sheetUrlInput.trim()}
                    className="min-h-[44px] px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isReading ? 'animate-spin' : ''}`} />
                    <span>{isReading ? 'Membaca...' : 'Baca Tab'}</span>
                  </button>
                </div>
              </div>

              {googleTabs.length > 0 && (
                <div>
                  <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">
                    Pilih Tab Log Catatan
                  </label>
                  <select
                    value={selectedTabTitle}
                    onChange={(e) => handleSwitchGoogleTab(e.target.value)}
                    className="w-full min-h-[44px] px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-900 dark:text-white"
                  >
                    {googleTabs.map((t) => (
                      <option key={t.title} value={t.title}>
                        {t.title} ({t.values.length} baris)
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="flex items-start gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                <span>Izin baca Google Sheets diminta satu kali dan tidak disimpan.</span>
              </div>
            </form>
          )}

          {localError && (
            <div className="p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 text-xs flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <p className="font-medium leading-relaxed">{localError}</p>
            </div>
          )}

          {parseResult && (
            <div className="space-y-4">
              {/* Ringkasan */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="p-3 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200/70 dark:border-emerald-900/50">
                  <span className="text-[10px] font-bold uppercase text-emerald-700 dark:text-emerald-400 block">
                    Catatan Baru
                  </span>
                  <span className="text-lg font-black text-slate-900 dark:text-white">
                    {parseResult.logsToCreate.length}
                  </span>
                </div>
                <div className="p-3 rounded-2xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200/70 dark:border-blue-900/50">
                  <span className="text-[10px] font-bold uppercase text-blue-700 dark:text-blue-400 block">
                    Buku Terkena
                  </span>
                  <span className="text-lg font-black text-slate-900 dark:text-white">
                    {parseResult.affectedBookIds.length}
                  </span>
                </div>
                <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                  <span className="text-[10px] font-bold uppercase text-slate-500 block">
                    Duplikat Dilewati
                  </span>
                  <span className="text-lg font-black text-slate-900 dark:text-white">
                    {parseResult.duplicateSkippedCount}
                  </span>
                </div>
                <div className="p-3 rounded-2xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200/70 dark:border-amber-900/50">
                  <span className="text-[10px] font-bold uppercase text-amber-700 dark:text-amber-400 block">
                    Gagal Cocok
                  </span>
                  <span className="text-lg font-black text-slate-900 dark:text-white">
                    {parseResult.failedRows.length}
                  </span>
                </div>
              </div>

              {parseResult.yearGuessedCount > 0 && (
                <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-[11px] text-amber-900 dark:text-amber-200">
                  <strong>{parseResult.yearGuessedCount} tanggal tanpa tahun</strong> (misal &quot;27 Okt&quot;) telah otomatis dilengkapi tahunnya berdasarkan kalender saat ini.
                </div>
              )}

              {parseResult.failedRows.length > 0 && (
                <div className="p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 space-y-1.5 max-h-36 overflow-y-auto">
                  <div className="text-xs font-bold text-rose-800 dark:text-rose-300">
                    Baris Dilewati Karena Buku Belum Ditemukan ({parseResult.failedRows.length}) — impor data buku terlebih dahulu:
                  </div>
                  <ul className="space-y-1 text-[11px] text-rose-900 dark:text-rose-200">
                    {parseResult.failedRows.slice(0, 12).map((f, i) => (
                      <li key={`log-fail-${i}`}>
                        Baris {f.rowNumber}: {f.no ? `#${f.no} ` : ''}
                        <strong>{f.judul}</strong> — &quot;{f.isi}&quot;
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Pratinjau 5 catatan pertama */}
              {parseResult.logsToCreate.length > 0 && (
                <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
                  <div className="px-3.5 py-2 bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 text-[11px] font-bold text-slate-600 dark:text-slate-300">
                    Pratinjau 5 Catatan Pertama yang Akan Diimpor
                  </div>
                  <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                    {parseResult.logsToCreate.slice(0, 5).map((item, idx) => (
                      <div key={`p-log-${idx}`} className="px-3.5 py-2.5 bg-white dark:bg-slate-900 space-y-1">
                        <div className="flex items-center justify-between gap-2 text-[11px]">
                          <span className="font-bold text-slate-900 dark:text-white truncate">
                            #{item.bookNo} {item.bookJudul}
                          </span>
                          <span className="text-slate-500 shrink-0">
                            {formatLogDateShort(item.tanggal)} · {item.dari} · {item.jenis} ({item.status})
                          </span>
                        </div>
                        <p className="text-slate-700 dark:text-slate-300 line-clamp-2">{item.isi}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/80 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-2">
          <button
            type="button"
            disabled={isWriting}
            onClick={onClose}
            className="min-h-[44px] px-4 py-2 rounded-xl bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold"
          >
            Batal
          </button>
          <button
            type="button"
            disabled={!parseResult || parseResult.logsToCreate.length === 0 || isWriting}
            onClick={handleConfirmImport}
            className="min-h-[44px] px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-xs font-bold inline-flex items-center gap-1.5"
          >
            {isWriting ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Mengimpor...</span>
              </>
            ) : (
              <>
                <Check className="w-3.5 h-3.5" />
                <span>Konfirmasi &amp; Impor ({parseResult?.logsToCreate.length || 0})</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
