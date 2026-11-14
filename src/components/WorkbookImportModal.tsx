import React, { useState, useRef, useMemo, useEffect } from 'react';
import {
  X,
  Upload,
  FileSpreadsheet,
  AlertTriangle,
  RefreshCw,
  Check,
  ShieldCheck,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  Download,
  Layers,
  Columns,
  GitCompare,
  Play,
  CheckCircle2,
  EyeOff,
} from 'lucide-react';
import { BookJob, BookLog, LastImportRecord } from '../types';
import { extractSpreadsheetId } from '../utils/sheetHelpers';
import { buildCombinedStatusList, computeDerivedBookFields } from '../utils/bookHelpers';
import {
  BookImportDiffItem,
  CompiledBukuTabPlan,
  DuplicatePolicy,
  MAPPABLE_FIELD_OPTIONS,
  MappableBookField,
  ProblemRowEntry,
  WorkbookTabInspection,
  WorkbookTabRole,
  compileBooksFromTab,
  compileLogsFromTab,
  downloadProblemRowsCsv,
  inspectExcelWorkbookAllTabs,
  inspectGoogleTabsAllTabs,
  mergeImportedBookWithExisting,
} from '../utils/workbookImportHelpers';
import { fetchGoogleSpreadsheetAllTabs } from '../services/api';
import {
  BatchImportOperation,
  BatchLogWriteItem,
  addUserActivity,
  batchImportBooksWithImportId,
  batchUpsertUserLogs,
  fetchImportMappings,
  getFirestoreErrorMessage,
  requestOneTimeSheetsImportToken,
  saveImportMappingForTab,
  saveUserCloudData,
} from '../services/firebase';
import { formatRupiah } from '../utils/formatters';

interface WorkbookImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  existingBooks: BookJob[];
  existingLogs: BookLog[];
  customStatuses: string[];
  currentUid: string;
  onCustomStatusesAdded: (newStatuses: string[]) => void;
  onImportSuccess?: (summary: LastImportRecord) => void;
  onImportError?: (message: string) => void;
}

type WizardStep = 'source' | 'tabs' | 'mapping' | 'review' | 'executing' | 'done';

const ROLE_LABELS: Record<WorkbookTabRole, string> = {
  buku: 'Buku (Data Utama)',
  log: 'Log Catatan',
  keuangan: 'Keuangan / Invoice',
  lewati: 'Lewati',
};

export const WorkbookImportModal: React.FC<WorkbookImportModalProps> = ({
  isOpen,
  onClose,
  existingBooks,
  existingLogs,
  customStatuses,
  currentUid,
  onCustomStatusesAdded,
  onImportSuccess,
  onImportError,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<WizardStep>('source');
  const [sourceMode, setSourceMode] = useState<'sheets' | 'excel'>('excel');
  const [sourceName, setSourceName] = useState<string>('');
  const [sheetUrlInput, setSheetUrlInput] = useState<string>('');
  const [isLoadingSource, setIsLoadingSource] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const [tabs, setTabs] = useState<WorkbookTabInspection[]>([]);
  const [activeMappingTabIdx, setActiveMappingTabIdx] = useState<number>(0);
  const [saveMappingPref, setSaveMappingPref] = useState<boolean>(true);

  // Resolusi status progres tak dikenal & kebijakan duplikat
  const [statusResolutions, setStatusResolutions] = useState<Record<string, { mode: 'add' | 'map'; mapTo: string }>>({});
  const [duplicatePolicy, setDuplicatePolicy] = useState<DuplicatePolicy>('fill_empty');
  const [expandedDiffKeys, setExpandedDiffKeys] = useState<Record<string, boolean>>({});

  // Progress & Done state
  const [execStageText, setExecStageText] = useState<string>('');
  const [execProgress, setExecProgress] = useState<number>(0);
  const [doneSummary, setDoneSummary] = useState<LastImportRecord | null>(null);
  const [problemRows, setProblemRows] = useState<ProblemRowEntry[]>([]);

  useEffect(() => {
    if (isOpen) {
      setStep('source');
      setSourceName('');
      setLocalError(null);
      setTabs([]);
      setStatusResolutions({});
      setDuplicatePolicy('fill_empty');
      setExpandedDiffKeys({});
      setDoneSummary(null);
      setProblemRows([]);
      setExecStageText('');
      setExecProgress(0);
    }
  }, [isOpen]);

  const combinedStatuses = useMemo(
    () => buildCombinedStatusList(customStatuses),
    [customStatuses]
  );

  // Tab yang dipilih untuk peran Buku / Keuangan (butuh pemetaan kolom)
  const mappableTabs = useMemo(
    () =>
      tabs
        .map((t, idx) => ({ tab: t, origIdx: idx }))
        .filter(({ tab }) => tab.checked && (tab.selectedRole === 'buku' || tab.selectedRole === 'keuangan')),
    [tabs]
  );

  // Pastikan activeMappingTabIdx menunjuk ke tab yang valid
  useEffect(() => {
    if (mappableTabs.length > 0 && !mappableTabs.some((m) => m.origIdx === activeMappingTabIdx)) {
      setActiveMappingTabIdx(mappableTabs[0].origIdx);
    }
  }, [mappableTabs, activeMappingTabIdx]);

  // Hitung rencana pratinjau Buku + Keuangan + Log sebelum dieksekusi
  const statusOverrideMap = useMemo(() => {
    const out: Record<string, string> = {};
    Object.entries(statusResolutions).forEach(([raw, res]) => {
      out[raw] = res.mode === 'add' ? raw : res.mapTo;
    });
    return out;
  }, [statusResolutions]);

  const reviewPlan = useMemo(() => {
    const bukuTabs = tabs.filter((t) => t.checked && t.selectedRole === 'buku');
    const keuTabs = tabs.filter((t) => t.checked && t.selectedRole === 'keuangan');
    const logTabs = tabs.filter((t) => t.checked && t.selectedRole === 'log');

    const bukuPlans: CompiledBukuTabPlan[] = bukuTabs.map((t) =>
      compileBooksFromTab(t, existingBooks, customStatuses, statusOverrideMap)
    );
    const keuPlans: CompiledBukuTabPlan[] = keuTabs.map((t) =>
      compileBooksFromTab(t, existingBooks, customStatuses, statusOverrideMap)
    );

    const allBukuItems = bukuPlans.flatMap((p) => p.books);
    const allKeuItems = keuPlans.flatMap((p) => p.books);

    // Bangun daftar buku virtual setelah tab Buku untuk mengestimasi matching Log
    const virtualBooks: BookJob[] = [...existingBooks];
    allBukuItems.forEach((item) => {
      if (!item.existingBook) {
        virtualBooks.push(
          computeDerivedBookFields({
            ...item.imported,
            id: `virtual_${item.imported.no || Math.random()}`,
            no: item.imported.no || virtualBooks.length + 1,
          })
        );
      }
    });

    const logPlans = logTabs.map((t) => compileLogsFromTab(t, virtualBooks, existingLogs));

    const unrecognizedStatuses = Array.from(
      new Set(bukuPlans.flatMap((p) => p.unrecognizedStatuses))
    );
    const yearGuessedCount =
      bukuPlans.reduce((s, p) => s + p.yearGuessedCount, 0) +
      keuPlans.reduce((s, p) => s + p.yearGuessedCount, 0) +
      logPlans.reduce((s, p) => s + p.yearGuessedCount, 0);

    const problems: ProblemRowEntry[] = [
      ...bukuPlans.flatMap((p) => p.problemRows),
      ...keuPlans.flatMap((p) => p.problemRows),
      ...logPlans.flatMap((p) =>
        p.failedRows.map((fr) => ({
          tabName: tNameFromFailed(logTabs, fr.rowNumber),
          rowNumber: fr.rowNumber,
          identifier: fr.judul || (fr.no ? `#${fr.no}` : 'Log tanpa judul buku'),
          reason: fr.reason,
        }))
      ),
    ];

    const newBooksCount = allBukuItems.filter((i) => !i.existingBook).length;
    const matchedBooksWithDiff = allBukuItems.filter((i) => i.existingBook);
    const keuMatchedCount = allKeuItems.filter((i) => i.existingBook || allBukuItems.some((b) => b.imported.no && b.imported.no === i.imported.no)).length;
    const totalLogsToCreate = logPlans.reduce((s, p) => s + p.logsToCreate.length, 0);
    const totalLogsDupSkipped = logPlans.reduce((s, p) => s + p.duplicateSkippedCount, 0);

    return {
      bukuTabs,
      keuTabs,
      logTabs,
      allBukuItems,
      allKeuItems,
      logPlans,
      unrecognizedStatuses,
      yearGuessedCount,
      problems,
      newBooksCount,
      matchedBooksWithDiff,
      keuMatchedCount,
      totalLogsToCreate,
      totalLogsDupSkipped,
    };
  }, [tabs, existingBooks, existingLogs, customStatuses, statusOverrideMap]);

  function tNameFromFailed(logTabs: WorkbookTabInspection[], _rowNum: number): string {
    return logTabs[0]?.sheetName || 'LOG CATATAN';
  }

  // Inisialisasi resolusi default untuk status yang belum dikenal saat masuk Step Review
  useEffect(() => {
    if (reviewPlan.unrecognizedStatuses.length === 0) return;
    setStatusResolutions((prev) => {
      const next = { ...prev };
      let changed = false;
      reviewPlan.unrecognizedStatuses.forEach((raw) => {
        if (!next[raw]) {
          next[raw] = { mode: 'add', mapTo: combinedStatuses[0] || 'Di Saya' };
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [reviewPlan.unrecognizedStatuses, combinedStatuses]);

  if (!isOpen) return null;

  const handleLoadExcelFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLocalError(null);
    setIsLoadingSource(true);
    try {
      const savedMaps = await fetchImportMappings(currentUid);
      const buffer = await file.arrayBuffer();
      const inspected = inspectExcelWorkbookAllTabs(buffer, savedMaps);
      if (inspected.length === 0) {
        setLocalError('Workbook Excel tidak memiliki sheet/tab apa pun.');
        return;
      }
      setSourceName(file.name);
      setTabs(inspected);
      setStep('tabs');
    } catch (err: any) {
      setLocalError(err?.message || 'Gagal membaca file Excel workbook.');
    } finally {
      setIsLoadingSource(false);
    }
  };

  const handleLoadGoogleSpreadsheet = async () => {
    const sid = extractSpreadsheetId(sheetUrlInput);
    if (!sid) {
      setLocalError('Link atau Spreadsheet ID Google Sheet tidak valid.');
      return;
    }

    setLocalError(null);
    setIsLoadingSource(true);
    try {
      const token = await requestOneTimeSheetsImportToken();
      const [rawTabs, savedMaps] = await Promise.all([
        fetchGoogleSpreadsheetAllTabs(sid, token),
        fetchImportMappings(currentUid),
      ]);
      const inspected = inspectGoogleTabsAllTabs(rawTabs, savedMaps);
      setSourceName(`Google Sheet (${sid.slice(0, 10)}...)`);
      setTabs(inspected);
      setStep('tabs');
    } catch (err: any) {
      setLocalError(err?.message || 'Gagal membaca Google Spreadsheet.');
    } finally {
      setIsLoadingSource(false);
    }
  };

  const updateTabConfig = (idx: number, patch: Partial<WorkbookTabInspection>) => {
    setTabs((prev) =>
      prev.map((t, i) => {
        if (i !== idx) return t;
        const updated = { ...t, ...patch };
        if (patch.selectedRole) {
          updated.checked = patch.selectedRole !== 'lewati';
        }
        return updated;
      })
    );
  };

  const updateColumnMapping = (tabIdx: number, colIdx: number, nextField: MappableBookField) => {
    setTabs((prev) =>
      prev.map((t, i) => {
        if (i !== tabIdx) return t;
        return {
          ...t,
          columns: t.columns.map((c) =>
            c.colIndex === colIdx ? { ...c, mappedField: nextField } : c
          ),
        };
      })
    );
  };

  const goFromTabsToNext = () => {
    const selectedTabs = tabs.filter((t) => t.checked && t.selectedRole !== 'lewati');
    if (selectedTabs.length === 0) {
      setLocalError('Pilih minimal 1 tab untuk diimpor.');
      return;
    }
    setLocalError(null);
    if (mappableTabs.length > 0) {
      setActiveMappingTabIdx(mappableTabs[0].origIdx);
      setStep('mapping');
    } else {
      setStep('review');
    }
  };

  const goFromMappingToReview = async () => {
    setLocalError(null);
    if (saveMappingPref) {
      // Simpan pemetaan kolom secara asinkron agar lain waktu langsung cocok
      await Promise.all(
        mappableTabs.map(({ tab }) => {
          const mapObj: Record<string, string> = {};
          tab.columns.forEach((col) => {
            if (col.mappedField !== '__skip__' || !col.isUnrecognized) {
              mapObj[col.headerName] = col.mappedField;
            }
          });
          return saveImportMappingForTab(currentUid, tab.sheetName, mapObj);
        })
      );
    }
    setStep('review');
  };

  const executeWorkbookImport = async () => {
    setStep('executing');
    setLocalError(null);
    setExecProgress(5);
    setExecStageText('Menyiapkan data impor...');

    const importId = `imp_${Date.now()}`;
    const collectedProblems: ProblemRowEntry[] = [];

    try {
      // 0. Simpan status progres kustom baru jika user memilih "Tambahkan ke daftar status"
      const addedStatuses = Object.entries(statusResolutions)
        .filter(([, res]) => res.mode === 'add')
        .map(([raw]) => raw.trim())
        .filter(Boolean);

      if (addedStatuses.length > 0) {
        const mergedCustom = Array.from(new Set([...customStatuses, ...addedStatuses]));
        await saveUserCloudData(currentUid, { customStatuses: mergedCustom });
        onCustomStatusesAdded(mergedCustom);
      }

      // 1. TAHAP 1: BUKU
      const bukuTabs = tabs.filter((t) => t.checked && t.selectedRole === 'buku');
      let maxNo = existingBooks.reduce((m, b) => Math.max(m, b.no), 0);
      const bookOps: BatchImportOperation[] = [];
      const postImportMap = new Map<string, BookJob>();
      existingBooks.forEach((b) => {
        if (b.id) postImportMap.set(b.id, b);
      });

      const bukuPlans = bukuTabs.map((t) =>
        compileBooksFromTab(t, existingBooks, [...customStatuses, ...addedStatuses], statusOverrideMap)
      );

      bukuPlans.forEach((p) => collectedProblems.push(...p.problemRows));

      const allBukuItems: BookImportDiffItem[] = bukuPlans.flatMap((p) => p.books);
      allBukuItems.forEach((item) => {
        if (item.existingBook && item.existingBook.id) {
          const mergedPatch = mergeImportedBookWithExisting(
            item.existingBook,
            item.imported,
            duplicatePolicy
          );
          if (mergedPatch) {
            bookOps.push({
              type: 'overwrite',
              bookId: item.existingBook.id,
              data: mergedPatch,
            });
            postImportMap.set(
              item.existingBook.id,
              computeDerivedBookFields({ ...item.existingBook, ...mergedPatch })
            );
          }
        } else {
          const assignedNo = item.imported.no && item.imported.no > 0 ? item.imported.no : ++maxNo;
          if (assignedNo > maxNo) maxNo = assignedNo;
          bookOps.push({
            type: 'create',
            data: { ...item.imported, no: assignedNo },
          });
        }
      });

      setExecProgress(25);
      setExecStageText(`Mengimpor data buku (${bookOps.length} operasi)...`);

      let createdBooksCount = 0;
      let updatedBooksCount = 0;
      if (bookOps.length > 0) {
        const res = await batchImportBooksWithImportId(currentUid, bookOps, importId);
        createdBooksCount = res.created;
        updatedBooksCount = res.updated;

        // Tambahkan buku yang baru dibuat ke snapshot untuk tahap Log & Keuangan
        res.createdBookRefs.forEach((ref) => {
          postImportMap.set(
            ref.id,
            computeDerivedBookFields({
              id: ref.id,
              no: ref.no,
              judul: ref.judul,
            })
          );
        });
      }

      const postImportBooks = Array.from(postImportMap.values());

      // 2. TAHAP 2: LOG CATATAN
      setExecProgress(55);
      const logTabs = tabs.filter((t) => t.checked && t.selectedRole === 'log');
      setExecStageText(`Mengimpor log catatan (${logTabs.length} tab)...`);

      let createdLogsCount = 0;
      if (logTabs.length > 0) {
        const logWriteItems: BatchLogWriteItem[] = [];
        const seenLogIds = new Set(existingLogs.map((l) => l.id).filter(Boolean) as string[]);

        logTabs.forEach((tab) => {
          const compiled = compileLogsFromTab(tab, postImportBooks, existingLogs);
          compiled.failedRows.forEach((fr) =>
            collectedProblems.push({
              tabName: tab.sheetName,
              rowNumber: fr.rowNumber,
              identifier: fr.judul || (fr.no ? `#${fr.no}` : `Baris ${fr.rowNumber}`),
              reason: fr.reason,
            })
          );

          compiled.logsToCreate.forEach((cand) => {
            if (seenLogIds.has(cand.deterministicId)) return;
            seenLogIds.add(cand.deterministicId);
            logWriteItems.push({
              docId: cand.deterministicId,
              data: {
                bookId: cand.bookId,
                bookNo: cand.bookNo,
                tanggal: cand.tanggal,
                dari: cand.dari,
                isi: cand.isi,
                jenis: cand.jenis,
                status: cand.status,
                source: 'import',
                importId,
              },
            });
          });
        });

        if (logWriteItems.length > 0) {
          createdLogsCount = await batchUpsertUserLogs(currentUid, logWriteItems);
        }
      }

      // 3. TAHAP 3: KEUANGAN / INVOICE
      setExecProgress(80);
      const keuTabs = tabs.filter((t) => t.checked && t.selectedRole === 'keuangan');
      setExecStageText(`Memperbarui data keuangan (${keuTabs.length} tab)...`);

      let keuUpdatedCount = 0;
      if (keuTabs.length > 0) {
        const keuOps: BatchImportOperation[] = [];
        keuTabs.forEach((tab) => {
          const compiled = compileBooksFromTab(
            tab,
            postImportBooks,
            [...customStatuses, ...addedStatuses],
            statusOverrideMap
          );
          compiled.problemRows.forEach((pr) => collectedProblems.push(pr));

          compiled.books.forEach((item) => {
            if (!item.existingBook || !item.existingBook.id) {
              collectedProblems.push({
                tabName: tab.sheetName,
                rowNumber: item.rowNumber,
                identifier: item.imported.judul || `#${item.imported.no || '?'}`,
                reason: 'Buku tidak ditemukan di koleksi Buku untuk pembaruan keuangan.',
              });
              return;
            }
            const finPatch: Partial<BookJob> = {};
            if (item.imported.nilaiJasa !== undefined && item.imported.nilaiJasa > 0) {
              finPatch.nilaiJasa = item.imported.nilaiJasa;
            }
            if (item.imported.statusBayar) finPatch.statusBayar = item.imported.statusBayar;
            if (item.imported.tglInvoice !== undefined) finPatch.tglInvoice = item.imported.tglInvoice;
            if (item.imported.tglDibayar !== undefined) finPatch.tglDibayar = item.imported.tglDibayar;
            if (item.imported.catatanBiaya) finPatch.catatanBiaya = item.imported.catatanBiaya;

            if (Object.keys(finPatch).length > 0) {
              keuOps.push({
                type: 'overwrite',
                bookId: item.existingBook.id,
                data: finPatch,
              });
            }
          });
        });

        if (keuOps.length > 0) {
          const kRes = await batchImportBooksWithImportId(currentUid, keuOps, importId);
          keuUpdatedCount = kRes.updated;
        }
      }

      // 4. Catat ringkasan impor terakhir & Aktivitas Terbaru
      setExecProgress(95);
      setExecStageText('Menyimpan riwayat impor...');

      const summaryRecord: LastImportRecord = {
        importId,
        timestamp: new Date().toISOString(),
        sourceName: sourceName || 'Workbook',
        createdBooks: createdBooksCount,
        updatedBooks: updatedBooksCount + keuUpdatedCount,
        createdLogs: createdLogsCount,
        problemRowsCount: collectedProblems.length,
      };

      await Promise.all([
        saveUserCloudData(currentUid, { lastImport: summaryRecord }),
        addUserActivity(currentUid, {
          type: 'import_workbook',
          title: `Impor Workbook (${sourceName || 'Spreadsheet'})`,
          detail: `${createdBooksCount} buku baru, ${updatedBooksCount + keuUpdatedCount} buku diperbarui, ${createdLogsCount} log catatan ditambahkan.`,
          importId,
        }),
      ]);

      setExecProgress(100);
      setProblemRows(collectedProblems);
      setDoneSummary(summaryRecord);
      setStep('done');
      onImportSuccess?.(summaryRecord);
    } catch (err: any) {
      const msg = getFirestoreErrorMessage(err);
      setLocalError(msg);
      onImportError?.(msg);
      setStep('review');
    }
  };

  const activeMappingTab = tabs[activeMappingTabIdx];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/60 backdrop-blur-xs">
      <div className="bg-white dark:bg-slate-900 rounded-2xl sm:rounded-3xl max-w-4xl w-full max-h-[92dvh] flex flex-col border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95">
        {/* Header */}
        <div className="px-4 sm:px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3 bg-slate-50/60 dark:bg-slate-900 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white truncate">
                Impor Workbook Multi-Tab &amp; Pemetaan Kolom
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                {step === 'source' && 'Pilih file Excel (.xlsx) atau Google Sheets lengkap dengan semua tab'}
                {step === 'tabs' && 'Langkah 1/3: Pilih tab yang ingin diimpor beserta perannya'}
                {step === 'mapping' && 'Langkah 2/3: Periksa & sesuaikan pemetaan kolom per tab'}
                {step === 'review' && 'Langkah 3/3: Rekonsiliasi status, kebijakan duplikat & diff pratinjau'}
                {step === 'executing' && 'Sedang menuliskan data secara berurutan ke Cloud Firestore...'}
                {step === 'done' && 'Impor workbook selesai'}
              </p>
            </div>
          </div>

          {step !== 'executing' && (
            <button
              type="button"
              onClick={onClose}
              className="min-w-[40px] min-h-[40px] rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800 flex items-center justify-center"
              aria-label="Tutup"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Step Indicator */}
        {step !== 'source' && step !== 'executing' && step !== 'done' && (
          <div className="px-4 sm:px-6 py-2.5 bg-slate-50/40 dark:bg-slate-800/30 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2 text-[11px] font-bold overflow-x-auto no-scrollbar shrink-0">
            <span className={`px-2.5 py-1 rounded-lg flex items-center gap-1 whitespace-nowrap ${step === 'tabs' ? 'bg-blue-600 text-white' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'}`}>
              <Layers className="w-3.5 h-3.5" />
              1. Pilih Tab
            </span>
            <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span className={`px-2.5 py-1 rounded-lg flex items-center gap-1 whitespace-nowrap ${step === 'mapping' ? 'bg-blue-600 text-white' : step === 'review' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300' : 'bg-slate-200 dark:bg-slate-800 text-slate-500'}`}>
              <Columns className="w-3.5 h-3.5" />
              2. Pemetaan Kolom
            </span>
            <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span className={`px-2.5 py-1 rounded-lg flex items-center gap-1 whitespace-nowrap ${step === 'review' ? 'bg-blue-600 text-white' : 'bg-slate-200 dark:bg-slate-800 text-slate-500'}`}>
              <GitCompare className="w-3.5 h-3.5" />
              3. Diff &amp; Konfirmasi
            </span>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
          {localError && (
            <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 text-xs font-medium flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{localError}</span>
            </div>
          )}

          {/* ==================== STEP 0: SOURCE ==================== */}
          {step === 'source' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
                <button
                  type="button"
                  onClick={() => setSourceMode('excel')}
                  className={`min-h-[44px] py-2 rounded-lg text-xs font-bold transition-all ${
                    sourceMode === 'excel'
                      ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  File Excel (.xlsx)
                </button>
                <button
                  type="button"
                  onClick={() => setSourceMode('sheets')}
                  className={`min-h-[44px] py-2 rounded-lg text-xs font-bold transition-all ${
                    sourceMode === 'sheets'
                      ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  Google Sheets URL (Semua Tab)
                </button>
              </div>

              {sourceMode === 'excel' ? (
                <div className="space-y-3">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx,.xls"
                    onChange={handleLoadExcelFile}
                    className="hidden"
                  />
                  <div
                    onClick={() => !isLoadingSource && fileInputRef.current?.click()}
                    className="border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-blue-500 rounded-2xl p-8 text-center cursor-pointer transition-colors space-y-3 bg-slate-50/40 dark:bg-slate-800/20"
                  >
                    <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 mx-auto flex items-center justify-center">
                      {isLoadingSource ? (
                        <RefreshCw className="w-6 h-6 animate-spin" />
                      ) : (
                        <Upload className="w-6 h-6" />
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-900 dark:text-white">
                        {isLoadingSource
                          ? 'Membaca semua tab workbook Excel...'
                          : 'Pilih file Excel (.xlsx) lengkap dengan semua tab'}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                        Mendukung multi-baris header, sel gabungan, sheet/kolom tersembunyi, dan auto-deteksi tab Buku, Log, serta Keuangan.
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1.5">
                      Link atau Spreadsheet ID Google Sheets
                    </label>
                    <input
                      type="text"
                      value={sheetUrlInput}
                      onChange={(e) => setSheetUrlInput(e.target.value)}
                      placeholder="https://docs.google.com/spreadsheets/d/1BxiM..."
                      className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-base sm:text-xs font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <button
                    type="button"
                    disabled={isLoadingSource || !sheetUrlInput.trim()}
                    onClick={handleLoadGoogleSpreadsheet}
                    className="w-full min-h-[44px] py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white font-bold text-xs flex items-center justify-center gap-2 transition-colors"
                  >
                    {isLoadingSource ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <FileSpreadsheet className="w-4 h-4" />
                    )}
                    <span>
                      {isLoadingSource
                        ? 'Membaca seluruh tab Google Sheets...'
                        : 'Beri Izin Satu Kali & Muat Semua Tab'}
                    </span>
                  </button>
                </div>
              )}

              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 flex items-start gap-2.5 text-[11px] text-slate-600 dark:text-slate-400">
                <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                <span>
                  Izin baca Google Sheets hanya diminta satu kali saat impor dan tidak disimpan. Impor dapat dibatalkan kapan saja dari menu Akun (&ldquo;Batalkan impor terakhir&rdquo;).
                </span>
              </div>
            </div>
          )}

          {/* ==================== STEP 1: TABS ==================== */}
          {step === 'tabs' && (
            <div className="space-y-4">
              <div className="text-xs text-slate-600 dark:text-slate-300">
                Ditemukan <strong>{tabs.length} tab</strong> pada <strong>{sourceName}</strong>. Tentukan peran masing-masing tab sebelum memetakan kolom:
              </div>

              <div className="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
                {tabs.map((tab, idx) => (
                  <div
                    key={`${tab.sheetName}-${idx}`}
                    className={`p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                      tab.checked ? 'bg-white dark:bg-slate-900' : 'bg-slate-50/70 dark:bg-slate-900/40 opacity-80'
                    }`}
                  >
                    <label className="flex items-start gap-3 cursor-pointer flex-1 min-w-0">
                      <input
                        type="checkbox"
                        checked={tab.checked}
                        onChange={(e) => {
                          const nextChecked = e.target.checked;
                          updateTabConfig(idx, {
                            checked: nextChecked,
                            selectedRole: nextChecked
                              ? tab.selectedRole === 'lewati'
                                ? 'buku'
                                : tab.selectedRole
                              : 'lewati',
                          });
                        }}
                        className="mt-1 w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-sm font-bold text-slate-900 dark:text-white truncate">
                            {tab.sheetName}
                          </span>
                          {tab.isHidden && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-[10px] font-bold">
                              <EyeOff className="w-3 h-3" />
                              Tersembunyi
                            </span>
                          )}
                          <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 text-[10px] font-mono">
                            {tab.dataRows.length} baris · {tab.columns.length} kol
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                          {tab.roleHintNote}
                        </p>
                      </div>
                    </label>

                    <select
                      value={tab.selectedRole}
                      onChange={(e) =>
                        updateTabConfig(idx, { selectedRole: e.target.value as WorkbookTabRole })
                      }
                      className="min-h-[40px] px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-800 dark:text-slate-100 shrink-0"
                    >
                      {Object.entries(ROLE_LABELS).map(([val, lbl]) => (
                        <option key={val} value={val}>
                          {lbl}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ==================== STEP 2: MAPPING ==================== */}
          {step === 'mapping' && activeMappingTab && (
            <div className="space-y-4">
              {/* Switcher antar tab yang perlu pemetaan */}
              {mappableTabs.length > 1 && (
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
                  {mappableTabs.map(({ tab, origIdx }) => (
                    <button
                      key={`${tab.sheetName}-${origIdx}`}
                      type="button"
                      onClick={() => setActiveMappingTabIdx(origIdx)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-colors ${
                        activeMappingTabIdx === origIdx
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      {tab.sheetName} ({tab.selectedRole === 'keuangan' ? 'Keuangan' : 'Buku'})
                    </button>
                  ))}
                </div>
              )}

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="text-xs text-slate-600 dark:text-slate-300">
                  Pemetaan kolom untuk tab <strong>{activeMappingTab.sheetName}</strong> (header terdeteksi hingga baris ke-{activeMappingTab.headerRowCount}):
                </div>
                <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={saveMappingPref}
                    onChange={(e) => setSaveMappingPref(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-blue-600"
                  />
                  <span>Simpan pemetaan kolom untuk lain waktu</span>
                </label>
              </div>

              <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden divide-y divide-slate-200 dark:divide-slate-800">
                {activeMappingTab.columns.map((col) => {
                  const isNeedsAttention = col.isUnrecognized && col.mappedField === '__skip__';
                  return (
                    <div
                      key={`${activeMappingTab.sheetName}-col-${col.colIndex}`}
                      className={`p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                        isNeedsAttention
                          ? 'bg-amber-50/70 dark:bg-amber-950/25'
                          : 'bg-white dark:bg-slate-900'
                      }`}
                    >
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-xs font-bold text-slate-900 dark:text-white">
                            {col.headerName}
                          </span>
                          <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[10px] font-mono text-slate-500">
                            {col.typeHint}
                          </span>
                          {isNeedsAttention && (
                            <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-200 text-[10px] font-bold">
                              Belum dikenali otomatis
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                          Contoh: {col.samples.length > 0 ? col.samples.join(' · ') : '(kosong)'}
                        </div>
                      </div>

                      <select
                        value={col.mappedField}
                        onChange={(e) =>
                          updateColumnMapping(
                            activeMappingTabIdx,
                            col.colIndex,
                            e.target.value as MappableBookField
                          )
                        }
                        className={`min-h-[40px] sm:w-64 px-3 py-1.5 rounded-xl border text-xs font-semibold ${
                          isNeedsAttention
                            ? 'bg-amber-50 border-amber-300 text-amber-900 dark:bg-amber-950/40 dark:border-amber-700 dark:text-amber-100'
                            : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100'
                        }`}
                      >
                        {MAPPABLE_FIELD_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                })}
              </div>

              {/* Pratinjau 5 Baris Hasil Pemetaan */}
              {activeMappingTab.dataRows.length > 0 && (
                <div className="space-y-1.5">
                  <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    Pratinjau 5 Baris Pertama ({activeMappingTab.sheetName})
                  </h4>
                  <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
                    <table className="w-full text-[11px] text-left">
                      <thead className="bg-slate-50 dark:bg-slate-800 text-slate-500 font-bold">
                        <tr>
                          {activeMappingTab.columns
                            .filter((c) => c.mappedField !== '__skip__')
                            .slice(0, 8)
                            .map((c) => (
                              <th key={c.colIndex} className="px-2.5 py-2 whitespace-nowrap">
                                {c.mappedField === '__custom__' ? c.headerName : c.mappedField}
                              </th>
                            ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {activeMappingTab.dataRows.slice(0, 5).map((row, rIdx) => (
                          <tr key={rIdx}>
                            {activeMappingTab.columns
                              .filter((c) => c.mappedField !== '__skip__')
                              .slice(0, 8)
                              .map((c) => (
                                <td key={c.colIndex} className="px-2.5 py-2 max-w-[160px] truncate">
                                  {row[c.colIndex] || '-'}
                                </td>
                              ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ==================== STEP 3: REVIEW & REKONSILIASI ==================== */}
          {step === 'review' && (
            <div className="space-y-5">
              {/* Ringkasan Angka */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800">
                  <div className="text-[10px] font-bold uppercase text-emerald-700 dark:text-emerald-300">
                    Buku Baru
                  </div>
                  <div className="text-lg font-extrabold text-emerald-800 dark:text-emerald-200">
                    +{reviewPlan.newBooksCount}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800">
                  <div className="text-[10px] font-bold uppercase text-blue-700 dark:text-blue-300">
                    Buku Cocok / Update
                  </div>
                  <div className="text-lg font-extrabold text-blue-800 dark:text-blue-200">
                    {reviewPlan.matchedBooksWithDiff.length + reviewPlan.keuMatchedCount}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800">
                  <div className="text-[10px] font-bold uppercase text-indigo-700 dark:text-indigo-300">
                    Log Baru Siap Impor
                  </div>
                  <div className="text-lg font-extrabold text-indigo-800 dark:text-indigo-200">
                    +{reviewPlan.totalLogsToCreate}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                  <div className="text-[10px] font-bold uppercase text-slate-500">
                    Duplikat / Bermasalah
                  </div>
                  <div className="text-lg font-extrabold text-slate-800 dark:text-slate-100">
                    {reviewPlan.totalLogsDupSkipped} / {reviewPlan.problems.length}
                  </div>
                </div>
              </div>

              {/* Peringatan Tahun Tanggal Diterka */}
              {reviewPlan.yearGuessedCount > 0 && (
                <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 text-xs text-blue-800 dark:text-blue-200">
                  Terdapat <strong>{reviewPlan.yearGuessedCount} tanggal pendek tanpa tahun</strong> (misal &ldquo;27 Okt&rdquo;) yang otomatis dilengkapi tahunnya berdasarkan posisi tanggal saat ini.
                </div>
              )}

              {/* Rekonsiliasi Status Progres Tak Dikenal */}
              {reviewPlan.unrecognizedStatuses.length > 0 && (
                <div className="p-4 rounded-2xl bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 space-y-3">
                  <div>
                    <h4 className="text-xs font-extrabold text-amber-900 dark:text-amber-200">
                      Status Progres Belum Terdaftar ({reviewPlan.unrecognizedStatuses.length})
                    </h4>
                    <p className="text-[11px] text-amber-700 dark:text-amber-300 mt-0.5">
                      Pilih apakah status di bawah ini ditambahkan ke daftar status akun Anda atau dipetakan ke status yang sudah ada:
                    </p>
                  </div>

                  <div className="space-y-2">
                    {reviewPlan.unrecognizedStatuses.map((rawStatus) => {
                      const res = statusResolutions[rawStatus] || {
                        mode: 'add' as const,
                        mapTo: combinedStatuses[0] || 'Di Saya',
                      };
                      return (
                        <div
                          key={rawStatus}
                          className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-amber-200/70 dark:border-amber-800/70 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                        >
                          <span className="text-xs font-bold text-slate-900 dark:text-white">
                            &ldquo;{rawStatus}&rdquo;
                          </span>

                          <div className="flex flex-wrap items-center gap-2">
                            <select
                              value={res.mode}
                              onChange={(e) =>
                                setStatusResolutions((prev) => ({
                                  ...prev,
                                  [rawStatus]: {
                                    ...res,
                                    mode: e.target.value as 'add' | 'map',
                                  },
                                }))
                              }
                              className="min-h-[36px] px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs font-semibold"
                            >
                              <option value="add">Tambahkan ke daftar status</option>
                              <option value="map">Petakan ke status yang ada</option>
                            </select>

                            {res.mode === 'map' && (
                              <select
                                value={res.mapTo}
                                onChange={(e) =>
                                  setStatusResolutions((prev) => ({
                                    ...prev,
                                    [rawStatus]: { ...res, mapTo: e.target.value },
                                  }))
                                }
                                className="min-h-[36px] px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs font-semibold"
                              >
                                {combinedStatuses.map((st) => (
                                  <option key={st} value={st}>
                                    {st}
                                  </option>
                                ))}
                              </select>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Kebijakan Duplikat */}
              {reviewPlan.matchedBooksWithDiff.length > 0 && (
                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 space-y-3">
                  <div>
                    <h4 className="text-xs font-extrabold text-slate-900 dark:text-white">
                      Kebijakan untuk {reviewPlan.matchedBooksWithDiff.length} Buku yang Sudah Ada di Firestore
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-2">
                      {(
                        [
                          {
                            id: 'fill_empty',
                            label: 'Hanya isi field yang kosong',
                            desc: 'Aman: data lama tetap utuh',
                          },
                          {
                            id: 'overwrite_all',
                            label: 'Timpa semua field',
                            desc: 'Pakai semua nilai dari file baru',
                          },
                          {
                            id: 'skip_existing',
                            label: 'Lewati buku yang sudah ada',
                            desc: 'Hanya tambahkan buku baru',
                          },
                        ] as const
                      ).map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setDuplicatePolicy(opt.id)}
                          className={`p-2.5 rounded-xl text-left border transition-colors ${
                            duplicatePolicy === opt.id
                              ? 'bg-blue-50 dark:bg-blue-950/50 border-blue-500 text-blue-900 dark:text-blue-100'
                              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700'
                          }`}
                        >
                          <div className="text-xs font-bold">{opt.label}</div>
                          <div className="text-[10px] text-slate-500 mt-0.5">{opt.desc}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Diff Viewer */}
                  {duplicatePolicy !== 'skip_existing' && (
                    <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
                      {reviewPlan.matchedBooksWithDiff
                        .filter((item) => item.diffs.length > 0)
                        .slice(0, 25)
                        .map((item, idx) => {
                          const key = `${item.existingBook?.id || item.rowNumber}-${idx}`;
                          const isOpenDiff = Boolean(expandedDiffKeys[key]);
                          return (
                            <div
                              key={key}
                              className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 overflow-hidden"
                            >
                              <button
                                type="button"
                                onClick={() =>
                                  setExpandedDiffKeys((prev) => ({
                                    ...prev,
                                    [key]: !isOpenDiff,
                                  }))
                                }
                                className="w-full px-3 py-2 flex items-center justify-between gap-2 text-left text-xs hover:bg-slate-50 dark:hover:bg-slate-800/50"
                              >
                                <span className="font-bold text-slate-900 dark:text-white truncate">
                                  #{item.existingBook?.no} {item.existingBook?.judul}
                                </span>
                                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 dark:text-blue-400 shrink-0">
                                  {item.diffs.length} perbedaan
                                  <ChevronDown
                                    className={`w-3.5 h-3.5 transition-transform ${isOpenDiff ? 'rotate-180' : ''}`}
                                  />
                                </span>
                              </button>
                              {isOpenDiff && (
                                <div className="px-3 pb-2.5 pt-1 border-t border-slate-100 dark:border-slate-800 space-y-1 text-[11px]">
                                  {item.diffs.map((d) => (
                                    <div key={d.field} className="grid grid-cols-12 gap-2 py-0.5">
                                      <span className="col-span-4 font-semibold text-slate-500 truncate">
                                        {d.label}
                                      </span>
                                      <span className="col-span-4 text-rose-600 line-through truncate">
                                        {d.field === 'nilaiJasa' && !isNaN(Number(d.oldVal))
                                          ? formatRupiah(Number(d.oldVal))
                                          : d.oldVal}
                                      </span>
                                      <span className="col-span-4 font-bold text-emerald-600 truncate">
                                        {d.field === 'nilaiJasa' && !isNaN(Number(d.newVal))
                                          ? formatRupiah(Number(d.newVal))
                                          : d.newVal}
                                      </span>
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
              )}
            </div>
          )}

          {/* ==================== STEP 4: EXECUTING ==================== */}
          {step === 'executing' && (
            <div className="py-12 text-center space-y-4">
              <RefreshCw className="w-10 h-10 text-blue-600 animate-spin mx-auto" />
              <div className="space-y-1">
                <p className="text-sm font-bold text-slate-900 dark:text-white">
                  {execStageText || 'Memproses impor...'}
                </p>
                <p className="text-xs text-slate-500">
                  Urutan otomatis: Data Buku &rarr; Log Catatan &rarr; Keuangan
                </p>
              </div>
              <div className="max-w-xs mx-auto h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-600 rounded-full transition-all duration-300"
                  style={{ width: `${execProgress}%` }}
                />
              </div>
            </div>
          )}

          {/* ==================== STEP 5: DONE ==================== */}
          {step === 'done' && doneSummary && (
            <div className="py-6 space-y-5 text-center">
              <div className="w-14 h-14 rounded-2xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 mx-auto flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <div className="space-y-1">
                <h4 className="text-lg font-extrabold text-slate-900 dark:text-white">
                  Impor Workbook Berhasil
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Seluruh tab terpilih telah disimpan ke Cloud Firestore secara berurutan.
                </p>
              </div>

              <div className="grid grid-cols-3 gap-2.5 max-w-lg mx-auto text-left">
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                  <div className="text-[10px] font-bold text-slate-400 uppercase">Buku Baru</div>
                  <div className="text-base font-extrabold text-emerald-600">
                    +{doneSummary.createdBooks}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                  <div className="text-[10px] font-bold text-slate-400 uppercase">Diperbarui</div>
                  <div className="text-base font-extrabold text-blue-600">
                    {doneSummary.updatedBooks}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                  <div className="text-[10px] font-bold text-slate-400 uppercase">Log Masuk</div>
                  <div className="text-base font-extrabold text-indigo-600">
                    +{doneSummary.createdLogs}
                  </div>
                </div>
              </div>

              {problemRows.length > 0 && (
                <div className="max-w-lg mx-auto p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-left">
                  <span className="text-xs text-amber-800 dark:text-amber-200 font-medium">
                    <strong>{problemRows.length} baris</strong> dilewati karena kosong atau tidak cocok.
                  </span>
                  <button
                    type="button"
                    onClick={() => downloadProblemRowsCsv(problemRows)}
                    className="min-h-[38px] px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold inline-flex items-center gap-1.5 shrink-0"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Unduh Laporan (CSV)</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        {step !== 'executing' && (
          <div className="px-4 sm:px-6 py-3.5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900 flex items-center justify-between gap-2 shrink-0">
            <div>
              {step === 'tabs' && (
                <button
                  type="button"
                  onClick={() => setStep('source')}
                  className="min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300 inline-flex items-center gap-1"
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span>Sumber</span>
                </button>
              )}
              {step === 'mapping' && (
                <button
                  type="button"
                  onClick={() => setStep('tabs')}
                  className="min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300 inline-flex items-center gap-1"
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span>Pilih Tab</span>
                </button>
              )}
              {step === 'review' && (
                <button
                  type="button"
                  onClick={() => setStep(mappableTabs.length > 0 ? 'mapping' : 'tabs')}
                  className="min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300 inline-flex items-center gap-1"
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span>Kembali</span>
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              {step === 'done' ? (
                <button
                  type="button"
                  onClick={onClose}
                  className="min-h-[44px] px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold"
                >
                  Selesai &amp; Tutup
                </button>
              ) : step === 'source' ? (
                <button
                  type="button"
                  onClick={onClose}
                  className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300"
                >
                  Batal
                </button>
              ) : step === 'tabs' ? (
                <button
                  type="button"
                  onClick={goFromTabsToNext}
                  className="min-h-[44px] px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold inline-flex items-center gap-1.5"
                >
                  <span>Lanjut</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              ) : step === 'mapping' ? (
                <button
                  type="button"
                  onClick={goFromMappingToReview}
                  className="min-h-[44px] px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold inline-flex items-center gap-1.5"
                >
                  <span>Lanjut ke Pratinjau</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={executeWorkbookImport}
                  className="min-h-[44px] px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold inline-flex items-center gap-1.5 shadow-sm"
                >
                  <Play className="w-3.5 h-3.5" />
                  <span>Jalankan Impor Sekarang</span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
