/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  TabType,
  BookJob,
  BookLog,
  LogJenisType,
  LogStatusType,
  ActivityEntry,
  LastImportRecord,
  AuthUser,
  KeuanganSubTab,
  StatusProgresType,
} from './types';
import { Header } from './components/Header';
import { BottomNav } from './components/BottomNav';
import { DashboardTab } from './components/DashboardTab';
import { BukuTab } from './components/BukuTab';
import { LogTab } from './components/LogTab';
import { KeuanganTab } from './components/KeuanganTab';
import { AkunTab } from './components/AkunTab';
import { BookDetailPage, DetailTabType } from './components/BookDetailPage';
import { LoginScreen } from './components/LoginScreen';
import { DataImportModal, ImportMode } from './components/DataImportModal';
import { LogImportModal } from './components/LogImportModal';
import { WorkbookImportModal } from './components/WorkbookImportModal';
import { AddBookModal } from './components/AddBookModal';
import {
  getUserMonthlyTarget,
  setUserMonthlyTarget,
  getSavedTheme,
  setSavedTheme,
  applyCloudUserData,
  cleanupLegacyLocalStorage,
} from './utils/userStorage';
import {
  fetchUserCloudData,
  subscribeUserCloudData,
  subscribeUserBooks,
  subscribeUserLogs,
  subscribeUserActivity,
  addUserBook,
  updateUserBook,
  deleteUserBook,
  addUserLog,
  updateUserLog,
  deleteUserLog,
  deleteLogsForBook,
  markAllBookLogsDone,
  migrateLegacyNotesToLogsOnce,
  addUserActivity,
  rollbackLastImport,
  SyncedUserData,
  getFirestoreErrorMessage,
  testFirestoreConnection,
  subscribeAuthState,
  signOutFirebase,
} from './services/firebase';
import {
  computeDerivedBookFields,
  getTodayIsoDate,
} from './utils/bookHelpers';
import { countBooksDiSaya } from './config/masterData';
import {
  downloadTemplateXlsx,
} from './utils/sheetHelpers';
import {
  AlertTriangle,
  RefreshCw,
  X,
  BookOpen,
  BookPlus,
  Upload,
  Download,
  CheckCircle2,
  RotateCcw,
} from 'lucide-react';

const VALID_DETAIL_TABS: DetailTabType[] = ['progres', 'naskah', 'produksi', 'catatan'];

function parseDetailRoute(
  pathname: string,
  hash: string
): { bookKey: string | null; tab: DetailTabType } {
  const cleanHash = hash.replace(/^#/, '').toLowerCase() as DetailTabType;
  const tab: DetailTabType = VALID_DETAIL_TABS.includes(cleanHash) ? cleanHash : 'progres';
  const match = pathname.match(/^\/buku\/([^/]+)\/?$/);
  if (match && match[1]) {
    try {
      return { bookKey: decodeURIComponent(match[1]), tab };
    } catch {
      return { bookKey: match[1], tab };
    }
  }
  return { bookKey: null, tab };
}

export default function App() {
  const initialRouteRef = useRef(
    typeof window !== 'undefined'
      ? parseDetailRoute(window.location.pathname, window.location.hash)
      : { bookKey: null, tab: 'progres' as DetailTabType }
  );

  // 1. Sesi Pengguna dikelola langsung oleh Firebase Auth
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [isAuthReady, setIsAuthReady] = useState<boolean>(false);

  const [activeTab, setActiveTab] = useState<TabType>(
    initialRouteRef.current.bookKey ? 'buku' : 'dashboard'
  );
  const [keuanganSubTab, setKeuanganSubTab] = useState<KeuanganSubTab>('ringkasan');
  const [books, setBooks] = useState<BookJob[]>([]);
  const [logs, setLogs] = useState<BookLog[]>([]);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [customStatuses, setCustomStatuses] = useState<string[]>([]);
  const [lastImport, setLastImport] = useState<LastImportRecord | null>(null);
  const [isRollingBackImport, setIsRollingBackImport] = useState<boolean>(false);
  const [cloudProfileData, setCloudProfileData] = useState<SyncedUserData | null>(null);
  const migrationDoneUidRef = useRef<string | null>(null);

  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  // Indikator kecil "Tersimpan" setelah mutasi Firestore berhasil
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  const savedTimerRef = useRef<number | null>(null);

  // Toast global 5 detik untuk aksi Ubah Status Satu Ketukan + Batalkan
  interface StatusUndoToast {
    bookId?: string;
    bookNo: number;
    nextStatus: StatusProgresType;
    prevStatusProgres: StatusProgresType;
    prevUpdateTerakhir: string | null;
    prevTglSelesaiLayout: string | null;
  }
  const [statusUndoToast, setStatusUndoToast] = useState<StatusUndoToast | null>(null);
  const statusToastTimerRef = useRef<number | null>(null);

  // Toast global 5 detik untuk toggle status Log (Baru <-> Selesai)
  interface LogStatusUndoToast {
    logId: string;
    prevStatus: LogStatusType;
    nextStatus: LogStatusType;
  }
  const [logStatusUndoToast, setLogStatusUndoToast] = useState<LogStatusUndoToast | null>(null);
  const logToastTimerRef = useRef<number | null>(null);

  const triggerSavedNotice = useCallback((text = 'Tersimpan') => {
    setSavedNotice(text);
    if (savedTimerRef.current) {
      window.clearTimeout(savedTimerRef.current);
    }
    savedTimerRef.current = window.setTimeout(() => {
      setSavedNotice(null);
      savedTimerRef.current = null;
    }, 2500);
  }, []);

  const dismissStatusUndoToast = useCallback(() => {
    if (statusToastTimerRef.current) {
      window.clearTimeout(statusToastTimerRef.current);
      statusToastTimerRef.current = null;
    }
    setStatusUndoToast(null);
  }, []);

  const dismissLogStatusUndoToast = useCallback(() => {
    if (logToastTimerRef.current) {
      window.clearTimeout(logToastTimerRef.current);
      logToastTimerRef.current = null;
    }
    setLogStatusUndoToast(null);
  }, []);

  // Filter bulan di Dashboard
  const [selectedMonth, setSelectedMonth] = useState<string>('2026-10');

  // Target bulanan per Pengguna
  const [monthlyTarget, setMonthlyTarget] = useState<number>(10);

  // Dark Mode Theme
  const [isDark, setIsDark] = useState<boolean>(() => {
    return getSavedTheme();
  });

  // Halaman Detail Buku (/buku/:id + URL hash #progres/#naskah/#produksi/#catatan)
  const [detailBookKey, setDetailBookKey] = useState<string | null>(
    initialRouteRef.current.bookKey
  );
  const [detailTab, setDetailTab] = useState<DetailTabType>(initialRouteRef.current.tab);
  const savedScrollYRef = useRef<number>(0);
  const pushedDetailHistoryRef = useRef<boolean>(false);

  const [initialStatusFilter, setInitialStatusFilter] = useState<string | null>(null);
  const [selectedInvoiceBookId, setSelectedInvoiceBookId] = useState<number | null>(null);
  // Pengaturan tunggal Tampilkan/Sembunyikan nominal untuk Dashboard & Keuangan (bawaan tersembunyi)
  const [hideNominals, setHideNominals] = useState<boolean>(true);

  // Modal Tambah Buku & Impor Data (CSV / Google Sheet / Log / Workbook)
  const [isAddBookModalOpen, setIsAddBookModalOpen] = useState<boolean>(false);
  const [isLogImportOpen, setIsLogImportOpen] = useState<boolean>(false);
  const [isWorkbookImportOpen, setIsWorkbookImportOpen] = useState<boolean>(false);
  const [importModalState, setImportModalState] = useState<{
    isOpen: boolean;
    mode: ImportMode;
  }>({
    isOpen: false,
    mode: 'csv',
  });

  // Efek Sinkronisasi Dark Mode ke DOM
  useEffect(() => {
    try {
      if (isDark) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
      setSavedTheme(isDark);
    } catch (e) {
      console.warn('Gagal mengubah tema tampilan:', e);
    }
  }, [isDark]);

  // Cleanup timer notifikasi saat unmount
  useEffect(() => {
    return () => {
      if (savedTimerRef.current) {
        window.clearTimeout(savedTimerRef.current);
      }
      if (statusToastTimerRef.current) {
        window.clearTimeout(statusToastTimerRef.current);
      }
      if (logToastTimerRef.current) {
        window.clearTimeout(logToastTimerRef.current);
      }
    };
  }, []);

  // 0. Uji koneksi awal Firestore, bersihkan cache lokal lama, dan pantau sesi Firebase Auth
  useEffect(() => {
    cleanupLegacyLocalStorage();
    testFirestoreConnection().catch((err) =>
      console.warn('Uji koneksi Firestore awal:', err)
    );

    const unsubscribeAuth = subscribeAuthState((fbUser) => {
      if (fbUser) {
        setCurrentUser(fbUser);
      } else {
        setCurrentUser(null);
        setBooks([]);
        setLogs([]);
        setActivity([]);
        setCustomStatuses([]);
        setLastImport(null);
        setCloudProfileData(null);
        migrationDoneUidRef.current = null;
        setError(null);
      }
      setIsAuthReady(true);
    });

    return () => unsubscribeAuth();
  }, []);

  // Sinkronisasi tombol Back/Forward browser untuk rute /buku/:id dan pemulihan scroll
  useEffect(() => {
    const handlePopState = () => {
      const parsed = parseDetailRoute(window.location.pathname, window.location.hash);
      setDetailBookKey(parsed.bookKey);
      setDetailTab(parsed.tab);
      if (!parsed.bookKey) {
        pushedDetailHistoryRef.current = false;
        requestAnimationFrame(() => {
          window.scrollTo({ top: savedScrollYRef.current, behavior: 'auto' });
        });
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const openBookDetail = useCallback((book: BookJob, targetTab: DetailTabType = 'progres') => {
    savedScrollYRef.current = window.scrollY;
    const key = book.id || String(book.no);
    pushedDetailHistoryRef.current = true;
    const nextUrl = `/buku/${encodeURIComponent(key)}#${targetTab}`;
    window.history.pushState({ isBookDetail: true, bookKey: key }, '', nextUrl);
    setDetailBookKey(key);
    setDetailTab(targetTab);
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, []);

  const closeBookDetail = useCallback(() => {
    if (window.location.pathname.startsWith('/buku/')) {
      if (pushedDetailHistoryRef.current) {
        pushedDetailHistoryRef.current = false;
        window.history.back();
        return;
      }
      window.history.replaceState(null, '', '/');
    }
    setDetailBookKey(null);
    requestAnimationFrame(() => {
      window.scrollTo({ top: savedScrollYRef.current, behavior: 'auto' });
    });
  }, []);

  const handleDetailTabChange = useCallback((tab: DetailTabType) => {
    setDetailTab(tab);
    if (window.location.pathname.startsWith('/buku/')) {
      window.history.replaceState(
        window.history.state,
        '',
        `${window.location.pathname}#${tab}`
      );
    }
  }, []);

  // Efek sinkronisasi pengaturan akun (users/{uid}) & listener realtime koleksi buku (users/{uid}/books)
  useEffect(() => {
    if (!isAuthReady || !currentUser) return;

    const uid = currentUser.uid;
    let isMounted = true;

    // A. Muat preferensi lokal non-PII yang sudah ada
    setMonthlyTarget(getUserMonthlyTarget(uid, 10));

    // B. Ambil & langganan data pengaturan akun di users/{uid}
    fetchUserCloudData(uid)
      .then((cloudData) => {
        if (!isMounted || !cloudData) return;
        applyCloudUserData(uid, cloudData);
        setCloudProfileData(cloudData);
        if (cloudData.monthlyTarget !== undefined) {
          setMonthlyTarget(cloudData.monthlyTarget);
        }
        if (Array.isArray(cloudData.customStatuses)) {
          setCustomStatuses(cloudData.customStatuses);
        }
        if (cloudData.lastImport !== undefined) {
          setLastImport(cloudData.lastImport);
        }
      })
      .catch((err) => {
        console.warn('Gagal membaca pengaturan akun Firestore:', err);
      });

    const unsubscribeProfile = subscribeUserCloudData(uid, (cloudData) => {
      if (!isMounted || !cloudData) return;
      applyCloudUserData(uid, cloudData);
      setCloudProfileData(cloudData);
      if (cloudData.monthlyTarget !== undefined) {
        setMonthlyTarget(cloudData.monthlyTarget);
      }
      if (Array.isArray(cloudData.customStatuses)) {
        setCustomStatuses(cloudData.customStatuses);
      }
      if (cloudData.lastImport !== undefined) {
        setLastImport(cloudData.lastImport);
      }
    });

    // C. Satu listener realtime onSnapshot untuk users/{uid}/books, diurutkan berdasarkan no
    setLoading(true);
    setError(null);

    const unsubscribeBooks = subscribeUserBooks(
      uid,
      (loadedBooks) => {
        if (!isMounted) return;
        setBooks(loadedBooks);
        setLoading(false);
        setIsRefreshing(false);
      },
      (errMessage) => {
        if (!isMounted) return;
        setError(errMessage);
        setLoading(false);
        setIsRefreshing(false);
      }
    );

    // D. Satu listener realtime onSnapshot untuk users/{uid}/logs
    const unsubscribeLogs = subscribeUserLogs(
      uid,
      (loadedLogs) => {
        if (!isMounted) return;
        setLogs(loadedLogs);
      },
      (errMessage) => {
        if (!isMounted) return;
        console.warn('Listener log Firestore:', errMessage);
      }
    );

    // E. Listener Aktivitas Terbaru untuk panel Dashboard
    const unsubscribeActivity = subscribeUserActivity(uid, (entries) => {
      if (!isMounted) return;
      setActivity(entries);
    });

    return () => {
      isMounted = false;
      unsubscribeProfile();
      unsubscribeBooks();
      unsubscribeLogs();
      unsubscribeActivity();
    };
  }, [isAuthReady, currentUser?.uid]);

  // Migrasi satu kali (idempoten) dari catatan lama (cloudProfileData.bookNotes) ke users/{uid}/logs
  useEffect(() => {
    if (!currentUser || !cloudProfileData || books.length === 0) return;
    if (cloudProfileData.logsMigrated || migrationDoneUidRef.current === currentUser.uid) {
      return;
    }
    migrationDoneUidRef.current = currentUser.uid;
    void migrateLegacyNotesToLogsOnce(currentUser.uid, books, cloudProfileData.bookNotes);
  }, [currentUser?.uid, cloudProfileData, books]);

  // Handler Login dasar (hanya Auth, tanpa scope Sheets)
  const handleLogin = (user: AuthUser) => {
    setCurrentUser(user);
    setMonthlyTarget(getUserMonthlyTarget(user.uid, 10));
  };

  // Handler Logout
  const handleLogout = async () => {
    try {
      await signOutFirebase();
    } catch (err) {
      console.warn('Gagal logout Firebase:', err);
    }
    setCurrentUser(null);
    setBooks([]);
    setLogs([]);
    setActivity([]);
    setCustomStatuses([]);
    setLastImport(null);
    setCloudProfileData(null);
    migrationDoneUidRef.current = null;
    setDetailBookKey(null);
    if (window.location.pathname.startsWith('/buku/')) {
      window.history.replaceState(null, '', '/');
    }
    setError(null);
    setSavedNotice(null);
    setHideNominals(true);
    dismissStatusUndoToast();
    dismissLogStatusUndoToast();
  };

  // Handler refresh manual (verifikasi koneksi; data utama berjalan realtime via onSnapshot)
  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    setError(null);
    try {
      await testFirestoreConnection();
    } catch (err) {
      setError(getFirestoreErrorMessage(err));
    } finally {
      window.setTimeout(() => setIsRefreshing(false), 350);
    }
  };

  // Handler update buku langsung ke Firestore dengan optimistic update & rollback
  const handleUpdateBook = async (
    targetBook: BookJob,
    updates: Partial<BookJob>
  ): Promise<boolean> => {
    if (!currentUser) return false;

    const today = getTodayIsoDate();
    const statusChanged =
      updates.statusProgres !== undefined &&
      updates.statusProgres !== targetBook.statusProgres;

    const finalUpdates: Partial<BookJob> = { ...updates };
    if (statusChanged && !finalUpdates.updateTerakhir) {
      finalUpdates.updateTerakhir = today;
    }
    if (
      finalUpdates.statusProgres === 'Selesai' &&
      !targetBook.tglSelesaiLayout &&
      !finalUpdates.tglSelesaiLayout
    ) {
      finalUpdates.tglSelesaiLayout = today;
    }

    const previousBooks = books;

    const optimisticUpdated = computeDerivedBookFields({
      ...targetBook,
      ...finalUpdates,
    });

    setBooks((prev) =>
      prev.map((b) =>
        (targetBook.id ? b.id === targetBook.id : b.no === targetBook.no)
          ? optimisticUpdated
          : b
      )
    );
    setError(null);

    try {
      if (!targetBook.id) {
        throw new Error('ID dokumen buku tidak ditemukan di Firestore.');
      }
      await updateUserBook(currentUser.uid, targetBook.id, finalUpdates);
      triggerSavedNotice('Tersimpan');
      return true;
    } catch (err) {
      // Rollback ke state sebelumnya bila penulisan Firestore gagal
      setBooks(previousBooks);
      setError(getFirestoreErrorMessage(err));
      return false;
    }
  };

  // Handler Ubah Status Satu Ketukan dengan toast "Batalkan" 5 detik
  const handleQuickStatusChange = async (
    targetBook: BookJob,
    nextStatus: StatusProgresType
  ): Promise<boolean> => {
    if (!currentUser || nextStatus === targetBook.statusProgres) return true;

    const prevSnapshot: StatusUndoToast = {
      bookId: targetBook.id,
      bookNo: targetBook.no,
      nextStatus,
      prevStatusProgres: targetBook.statusProgres,
      prevUpdateTerakhir: targetBook.updateTerakhir,
      prevTglSelesaiLayout: targetBook.tglSelesaiLayout,
    };

    const today = getTodayIsoDate();
    const updates: Partial<BookJob> = {
      statusProgres: nextStatus,
      updateTerakhir: today,
    };
    if (nextStatus === 'Selesai' && !targetBook.tglSelesaiLayout) {
      updates.tglSelesaiLayout = today;
    }

    const ok = await handleUpdateBook(targetBook, updates);
    if (ok) {
      if (statusToastTimerRef.current) {
        window.clearTimeout(statusToastTimerRef.current);
      }
      setStatusUndoToast(prevSnapshot);
      statusToastTimerRef.current = window.setTimeout(() => {
        setStatusUndoToast(null);
        statusToastTimerRef.current = null;
      }, 5000);
    }
    return ok;
  };

  // Handler tombol "Batalkan" pada toast ubah status
  const handleUndoStatusChange = async () => {
    if (!statusUndoToast || !currentUser) return;
    const snapshot = statusUndoToast;
    dismissStatusUndoToast();

    const targetBook = books.find((b) =>
      snapshot.bookId ? b.id === snapshot.bookId : b.no === snapshot.bookNo
    );
    if (!targetBook) return;

    await handleUpdateBook(targetBook, {
      statusProgres: snapshot.prevStatusProgres,
      updateTerakhir: snapshot.prevUpdateTerakhir,
      tglSelesaiLayout: snapshot.prevTglSelesaiLayout,
    });
  };

  // Handler tambah buku baru langsung ke Firestore (no = tertinggi + 1) dengan optimistic update & rollback
  const handleAddNewBook = async (newBookData: Omit<BookJob, 'no'>) => {
    if (!currentUser) return;

    const nextNo = books.length > 0 ? Math.max(...books.map((b) => b.no)) + 1 : 1;
    const tempId = `temp-${Date.now()}`;
    const optimisticBook = computeDerivedBookFields({
      ...newBookData,
      id: tempId,
      no: nextNo,
    });

    const previousBooks = books;
    setBooks((prev) => [...prev, optimisticBook].sort((a, b) => a.no - b.no));
    setError(null);

    try {
      const createdId = await addUserBook(currentUser.uid, newBookData, nextNo);
      setBooks((prev) =>
        prev.map((b) => (b.id === tempId ? { ...b, id: createdId } : b))
      );
      triggerSavedNotice('Tersimpan');
    } catch (err) {
      // Rollback bila gagal menyimpan ke Firestore
      setBooks(previousBooks);
      setError(getFirestoreErrorMessage(err));
    }
  };

  // Handler hapus buku langsung ke Firestore (deleteDoc) dengan optimistic update & rollback
  const handleDeleteBook = async (targetBook: BookJob): Promise<boolean> => {
    if (!currentUser) return false;

    const previousBooks = books;
    const bookLogs = targetBook.id
      ? logs.filter((l) => l.bookId === targetBook.id || l.bookNo === targetBook.no)
      : [];

    setBooks((prev) =>
      prev.filter((b) =>
        targetBook.id ? b.id !== targetBook.id : b.no !== targetBook.no
      )
    );
    setError(null);

    try {
      if (!targetBook.id) {
        throw new Error('ID dokumen buku tidak ditemukan di Firestore.');
      }
      await deleteUserBook(currentUser.uid, targetBook.id);
      const relatedLogIds = bookLogs.map((l) => l.id).filter(Boolean) as string[];
      if (relatedLogIds.length > 0 || bookLogs.length > 0) {
        await deleteLogsForBook(currentUser.uid, targetBook.id, relatedLogIds);
      }
      triggerSavedNotice('Tersimpan');
      return true;
    } catch (err) {
      // Rollback bila hapus gagal
      setBooks(previousBooks);
      setError(getFirestoreErrorMessage(err));
      return false;
    }
  };

  // ==================== HANDLER LOG CATATAN PER BUKU ====================

  const handleCreateLog = async (data: {
    bookId: string;
    bookNo: number;
    tanggal: string | null;
    dari: string;
    isi: string;
    jenis: LogJenisType;
    status: LogStatusType;
  }) => {
    if (!currentUser) return;
    try {
      await addUserLog(currentUser.uid, {
        ...data,
        source: 'manual',
      });
      const bookRef = books.find((b) => b.id === data.bookId || b.no === data.bookNo);
      await addUserActivity(currentUser.uid, {
        type: 'log_created',
        title: `Log baru: #${data.bookNo} ${bookRef?.judul || ''}`.trim(),
        detail: `${data.dari} (${data.jenis}): ${data.isi}`,
        bookId: data.bookId,
        bookNo: data.bookNo,
      });
      triggerSavedNotice('Catatan ditambahkan');
    } catch (err) {
      setError(getFirestoreErrorMessage(err));
    }
  };

  const handleUpdateLog = async (
    targetLog: BookLog,
    updates: Partial<BookLog>
  ): Promise<boolean> => {
    if (!currentUser || !targetLog.id) return false;
    try {
      await updateUserLog(currentUser.uid, targetLog.id, updates);
      triggerSavedNotice('Catatan diperbarui');
      return true;
    } catch (err) {
      setError(getFirestoreErrorMessage(err));
      return false;
    }
  };

  const handleToggleLogStatus = async (targetLog: BookLog) => {
    if (!currentUser || !targetLog.id) return;
    const prevStatus = targetLog.status;
    const nextStatus: LogStatusType = prevStatus === 'Baru' ? 'Selesai' : 'Baru';

    setLogs((prev) =>
      prev.map((l) => (l.id === targetLog.id ? { ...l, status: nextStatus } : l))
    );

    try {
      await updateUserLog(currentUser.uid, targetLog.id, { status: nextStatus });
      if (nextStatus === 'Selesai') {
        await addUserActivity(currentUser.uid, {
          type: 'log_done',
          title: `Log selesai (#${targetLog.bookNo})`,
          detail: targetLog.isi,
          bookId: targetLog.bookId,
          bookNo: targetLog.bookNo,
        });
      }

      if (logToastTimerRef.current) {
        window.clearTimeout(logToastTimerRef.current);
      }
      setLogStatusUndoToast({
        logId: targetLog.id,
        prevStatus,
        nextStatus,
      });
      logToastTimerRef.current = window.setTimeout(() => {
        setLogStatusUndoToast(null);
        logToastTimerRef.current = null;
      }, 5000);
    } catch (err) {
      setLogs((prev) =>
        prev.map((l) => (l.id === targetLog.id ? { ...l, status: prevStatus } : l))
      );
      setError(getFirestoreErrorMessage(err));
    }
  };

  const handleUndoLogStatusChange = async () => {
    if (!logStatusUndoToast || !currentUser) return;
    const snap = logStatusUndoToast;
    dismissLogStatusUndoToast();
    try {
      await updateUserLog(currentUser.uid, snap.logId, { status: snap.prevStatus });
    } catch (err) {
      setError(getFirestoreErrorMessage(err));
    }
  };

  const handleDeleteLog = async (targetLog: BookLog): Promise<boolean> => {
    if (!currentUser || !targetLog.id) return false;
    try {
      await deleteUserLog(currentUser.uid, targetLog.id);
      triggerSavedNotice('Catatan dihapus');
      return true;
    } catch (err) {
      setError(getFirestoreErrorMessage(err));
      return false;
    }
  };

  const handleMarkAllBookLogsDone = async (logIds: string[]) => {
    if (!currentUser || logIds.length === 0) return;
    try {
      await markAllBookLogsDone(currentUser.uid, logIds);
      triggerSavedNotice(`${logIds.length} catatan ditandai selesai`);
    } catch (err) {
      setError(getFirestoreErrorMessage(err));
    }
  };

  const handleRollbackLastImport = async (importId: string) => {
    if (!currentUser || !importId) return;
    setIsRollingBackImport(true);
    try {
      const res = await rollbackLastImport(currentUser.uid, importId);
      setLastImport(null);
      triggerSavedNotice(
        `Impor dibatalkan (${res.deletedBooks} buku & ${res.deletedLogs} log dihapus)`
      );
    } catch (err) {
      setError(getFirestoreErrorMessage(err));
    } finally {
      setIsRollingBackImport(false);
    }
  };

  const openLogTabOnBaru = useCallback(() => {
    if (typeof window !== 'undefined') {
      window.history.replaceState(window.history.state, '', `${window.location.pathname}#baru`);
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    }
    setActiveTab('log');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  // Simpan Target Bulanan
  const handleSaveMonthlyTarget = (target: number) => {
    if (!currentUser) return;
    setMonthlyTarget(target);
    setUserMonthlyTarget(currentUser.uid, target);
    triggerSavedNotice('Tersimpan');
  };

  // Unduh Template Excel (.xlsx)
  const handleDownloadTemplate = () => {
    void downloadTemplateXlsx('Template_Form_Schnell.xlsx');
  };

  // Hitung buku di posisi "Di Saya" (satu sumber dengan chip filter "Di Saya" di BukuTab)
  const diSayaCount = useMemo(
    () =>
      countBooksDiSaya(
        books,
        cloudProfileData?.statusDiSaya,
        cloudProfileData?.statusSelesai,
        cloudProfileData?.statusGroupOverrides
      ),
    [
      books,
      cloudProfileData?.statusDiSaya,
      cloudProfileData?.statusSelesai,
      cloudProfileData?.statusGroupOverrides,
    ]
  );
  const nextBookNo = books.length > 0 ? Math.max(...books.map((b) => b.no)) + 1 : 1;

  const { newLogsCount, urgentNewLogs } = useMemo(() => {
    const bookMap = new Map<string, BookJob>();
    books.forEach((b) => {
      if (b.id) bookMap.set(b.id, b);
    });
    const baruList = logs
      .filter((l) => l.status === 'Baru')
      .sort((a, b) => {
        const rank = (l: BookLog) =>
          (l.jenis === 'Masalah' ? 4 : 0) +
          (l.dari === 'Penerbit' || l.dari === 'Penulis' ? 2 : 0);
        const diff = rank(b) - rank(a);
        if (diff !== 0) return diff;
        return (b.tanggal || '').localeCompare(a.tanggal || '');
      });
    return {
      newLogsCount: baruList.length,
      urgentNewLogs: baruList.map((log) => ({
        log,
        book: bookMap.get(log.bookId),
      })),
    };
  }, [logs, books]);

  // 0. Tampilkan layar muat singkat saat memeriksa sesi Firebase Auth
  if (!isAuthReady) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-6">
        <div className="flex flex-col items-center gap-3 text-slate-500 dark:text-slate-400">
          <RefreshCw className="w-6 h-6 animate-spin text-blue-600" />
          <span className="text-xs font-semibold">Menyiapkan sesi akun Google...</span>
        </div>
      </div>
    );
  }

  // 1. TAMPILKAN HANYA LOGIN SCREEN BILA BELUM LOGIN
  if (!currentUser) {
    return (
      <LoginScreen
        onLogin={handleLogin}
        isDark={isDark}
        onToggleDark={() => setIsDark(!isDark)}
      />
    );
  }

  const isDetailOpen = detailBookKey !== null;
  const activeDetailBook = isDetailOpen
    ? books.find(
        (b) => b.id === detailBookKey || String(b.no) === detailBookKey
      ) || null
    : null;

  return (
    <>
      <div
        className={
          isDetailOpen
            ? 'hidden'
            : "min-h-screen bg-[#F2F5FA] dark:bg-slate-950 text-slate-800 dark:text-slate-100 flex flex-col font-['Plus_Jakarta_Sans',sans-serif] transition-colors pb-20 md:pb-8"
        }
      >
        {/* 1. Header Aplikasi */}
        <Header
          activeTab={activeTab}
          onTabChange={(tab) => {
            setActiveTab(tab);
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          isDark={isDark}
          onToggleDark={() => setIsDark(!isDark)}
          onRefresh={handleManualRefresh}
          isRefreshing={isRefreshing}
          diSayaCount={diSayaCount}
          newLogsCount={newLogsCount}
          urgentNewLogs={urgentNewLogs}
          onOpenLogBaru={openLogTabOnBaru}
          currentUser={currentUser}
          onLogout={handleLogout}
        />

        {/* Indikator kecil "Tersimpan" */}
        {savedNotice && !isDetailOpen && (
          <div className="no-print print:hidden fixed bottom-20 md:bottom-6 right-4 sm:right-6 z-40 px-3.5 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold shadow-lg shadow-emerald-600/25 flex items-center gap-1.5 animate-fade-in">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>{savedNotice}</span>
          </div>
        )}

      {/* 2. Konten Utama */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 py-5 sm:py-6">
        {/* Banner Error Firestore yang jelas */}
        {error && (
          <div className="mb-5 p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-rose-900 dark:text-rose-200 flex items-start justify-between gap-3 shadow-xs animate-fade-in">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-xl bg-rose-100 dark:bg-rose-900/60 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0 mt-0.5">
                <AlertTriangle className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-900 dark:text-white">
                  Gagal Memproses Data Firestore
                </h4>
                <p className="text-[11px] text-slate-700 dark:text-slate-300 mt-0.5 leading-relaxed">
                  {error}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setError(null)}
              className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg transition-colors shrink-0"
              title="Tutup pesan"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* STATE LOADING PERTAMA KALI */}
        {loading ? (
          <div className="space-y-5 animate-pulse">
            <div className="h-12 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800" />
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <div
                  key={`skeleton-card-${i}`}
                  className="h-24 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-3"
                />
              ))}
            </div>
            <div className="h-44 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800" />
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              <div className="lg:col-span-4 h-64 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800" />
              <div className="lg:col-span-8 h-64 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800" />
            </div>
          </div>
        ) : (
          /* TAB CONTENT */
          <div>
            {activeTab === 'dashboard' && (
              books.length === 0 ? (
                /* State Kosong yang Rapi saat belum ada buku */
                <div className="max-w-2xl mx-auto my-6 p-7 sm:p-10 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-sm text-center space-y-5 animate-fade-in">
                  <div className="w-14 h-14 rounded-2xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 mx-auto flex items-center justify-center">
                    <BookOpen className="w-7 h-7" />
                  </div>
                  <div className="space-y-1.5">
                    <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                      Belum Ada Data Buku di Cloud Firestore
                    </h2>
                    <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto leading-relaxed">
                      Halo, <strong>{currentUser.name}</strong>. Mulai dengan menambahkan buku pertama secara manual atau impor daftar buku Anda dari file Excel (.xlsx), CSV, atau Google Sheet.
                    </p>
                  </div>

                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-2.5 pt-2">
                    <button
                      type="button"
                      onClick={() => setIsAddBookModalOpen(true)}
                      className="min-h-[44px] px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition-colors"
                    >
                      <BookPlus className="w-4 h-4" />
                      <span>Tambah Buku</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setImportModalState({ isOpen: true, mode: 'csv' })}
                      className="min-h-[44px] px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition-colors"
                    >
                      <Upload className="w-4 h-4" />
                      <span>Impor Excel / CSV / Sheet</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleDownloadTemplate}
                      className="min-h-[44px] px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <Download className="w-4 h-4 text-slate-500" />
                      <span>Template Excel (.xlsx)</span>
                    </button>
                  </div>
                </div>
              ) : (
                <DashboardTab
                  books={books}
                  logs={logs}
                  activity={activity}
                  customStatuses={customStatuses}
                  selectedMonth={selectedMonth}
                  onMonthChange={setSelectedMonth}
                  monthlyTarget={monthlyTarget}
                  onTabChange={setActiveTab}
                  onOpenLogBaru={openLogTabOnBaru}
                  onNavigateKeuangan={(subTab) => {
                    setKeuanganSubTab(subTab);
                    setActiveTab('keuangan');
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  onOpenSettings={() => setActiveTab('akun')}
                  onFilterStatusFromChart={(status) => {
                    setInitialStatusFilter(status);
                  }}
                  onSelectBook={(b) => openBookDetail(b)}
                  onQuickStatusChange={(book, nextStatus) => {
                    void handleQuickStatusChange(book, nextStatus);
                  }}
                  hideNominals={hideNominals}
                  onToggleHideNominals={() => setHideNominals((prev) => !prev)}
                />
              )
            )}

            {activeTab === 'buku' && (
              <BukuTab
                books={books}
                logs={logs}
                customStatuses={customStatuses}
                statusGroupOverrides={cloudProfileData?.statusGroupOverrides}
                statusDiSaya={cloudProfileData?.statusDiSaya}
                statusSelesai={cloudProfileData?.statusSelesai}
                onSelectBook={(b) => openBookDetail(b)}
                onAddNewBook={handleAddNewBook}
                onOpenImport={() => setIsWorkbookImportOpen(true)}
                onQuickStatusChange={(book, nextStatus) => {
                  void handleQuickStatusChange(book, nextStatus);
                }}
                initialStatusFilter={initialStatusFilter}
                onClearInitialStatusFilter={() => setInitialStatusFilter(null)}
              />
            )}

            {activeTab === 'log' && (
              <LogTab
                books={books}
                logs={logs}
                onOpenBookCatatan={(b) => openBookDetail(b, 'catatan')}
                onCreateLog={handleCreateLog}
                onUpdateLog={handleUpdateLog}
                onToggleLogStatus={handleToggleLogStatus}
                onDeleteLog={handleDeleteLog}
              />
            )}

            {(activeTab === 'keuangan' || activeTab === 'invoice' || activeTab === 'riwayat') && (
              <KeuanganTab
                books={books}
                onSelectBook={(b) => openBookDetail(b)}
                selectedInvoiceBookId={selectedInvoiceBookId}
                activeSubTab={
                  activeTab === 'invoice'
                    ? 'invoice'
                    : activeTab === 'riwayat'
                    ? 'riwayat'
                    : keuanganSubTab
                }
                onSubTabChange={(sub) => {
                  setKeuanganSubTab(sub);
                  if (activeTab !== 'keuangan') setActiveTab('keuangan');
                }}
                onSelectInvoiceBookId={(id) => setSelectedInvoiceBookId(id)}
                currentUid={currentUser.uid}
                hideNominals={hideNominals}
                onToggleHideNominals={() => setHideNominals((prev) => !prev)}
              />
            )}

            {activeTab === 'akun' && (
              <AkunTab
                currentUser={currentUser}
                onLogout={handleLogout}
                isDark={isDark}
                onToggleDark={() => setIsDark(!isDark)}
                monthlyTarget={monthlyTarget}
                onSaveMonthlyTarget={handleSaveMonthlyTarget}
                books={books}
                logs={logs}
                lastImport={lastImport}
                isRollingBackImport={isRollingBackImport}
                onTabChange={(tab) => {
                  setActiveTab(tab);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                onOpenImportCsv={() => setImportModalState({ isOpen: true, mode: 'csv' })}
                onOpenImportSheets={() => setImportModalState({ isOpen: true, mode: 'sheets' })}
                onOpenImportWorkbook={() => setIsWorkbookImportOpen(true)}
                onOpenImportLogs={() => setIsLogImportOpen(true)}
                onRollbackLastImport={handleRollbackLastImport}
              />
            )}
          </div>
        )}
      </main>

      {/* Modal Tambah Buku Baru (dapat diakses dari Empty State Dashboard) */}
      <AddBookModal
        isOpen={isAddBookModalOpen}
        onClose={() => setIsAddBookModalOpen(false)}
        onAddBook={handleAddNewBook}
        nextBookNo={nextBookNo}
      />

      {/* Modal Impor Data CSV / Google Sheet (20/22 kolom) */}
      <DataImportModal
        isOpen={importModalState.isOpen}
        initialMode={importModalState.mode}
        onClose={() => setImportModalState((prev) => ({ ...prev, isOpen: false }))}
        existingBooks={books}
        currentUid={currentUser.uid}
        onImportSuccess={({ created, updated }) => {
          const total = created + updated;
          triggerSavedNotice(`Tersimpan (${total} buku)`);
        }}
        onImportError={(msg) => setError(msg)}
      />

      {/* Modal Impor Log Catatan Per Buku */}
      <LogImportModal
        isOpen={isLogImportOpen}
        onClose={() => setIsLogImportOpen(false)}
        books={books}
        existingLogs={logs}
        currentUid={currentUser.uid}
        onImportSuccess={({ created }) => {
          triggerSavedNotice(`+${created} log catatan diimpor`);
        }}
        onImportError={(msg) => setError(msg)}
      />

      {/* Modal Impor Workbook Multi-Tab + Pemetaan Kolom */}
      <WorkbookImportModal
        isOpen={isWorkbookImportOpen}
        onClose={() => setIsWorkbookImportOpen(false)}
        existingBooks={books}
        existingLogs={logs}
        customStatuses={customStatuses}
        currentUid={currentUser.uid}
        onCustomStatusesAdded={(merged) => setCustomStatuses(merged)}
        onImportSuccess={(summary) => {
          setLastImport(summary);
          triggerSavedNotice(
            `Impor selesai (+${summary.createdBooks} buku, +${summary.createdLogs} log)`
          );
        }}
        onImportError={(msg) => setError(msg)}
      />

      {/* 4. Navigasi Bawah (Mobile Bottom Tabs) */}
      <BottomNav
        activeTab={activeTab}
        onTabChange={(tab) => {
          setActiveTab(tab);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
        diSayaCount={diSayaCount}
        newLogsCount={newLogsCount}
      />
      </div>

      {/* 3. Halaman / Panel Penuh Detail Buku (/buku/:id) */}
      {isDetailOpen && (
        <BookDetailPage
          book={activeDetailBook}
          bookLogs={
            activeDetailBook
              ? logs.filter(
                  (l) =>
                    l.bookId === activeDetailBook.id || l.bookNo === activeDetailBook.no
                )
              : []
          }
          customStatuses={customStatuses}
          isLoading={loading && books.length === 0}
          initialTab={detailTab}
          onTabChange={handleDetailTabChange}
          onBack={closeBookDetail}
          onUpdateBook={handleUpdateBook}
          onQuickStatusChange={handleQuickStatusChange}
          onDeleteBook={handleDeleteBook}
          onCreateBookLog={handleCreateLog}
          onUpdateBookLog={handleUpdateLog}
          onToggleBookLogStatus={handleToggleLogStatus}
          onDeleteBookLog={handleDeleteLog}
          onMarkAllBookLogsDone={handleMarkAllBookLogsDone}
          currentUid={currentUser.uid}
        />
      )}

      {/* 4. Toast Global 5 Detik untuk Ubah Status Satu Ketukan + Batalkan */}
      {statusUndoToast && (
        <div
          role="status"
          aria-live="polite"
          className="no-print print:hidden fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-1.5rem)] max-w-md px-4 py-3 rounded-2xl bg-slate-900 dark:bg-slate-800 text-white shadow-xl border border-slate-700/80 flex items-center justify-between gap-3"
        >
          <div className="flex items-center gap-2 min-w-0">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span className="text-xs sm:text-sm font-semibold truncate">
              Status diubah ke <strong>{statusUndoToast.nextStatus}</strong>
            </span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={handleUndoStatusChange}
              className="min-h-[36px] px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold inline-flex items-center gap-1 transition-colors duration-150 motion-reduce:transition-none"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Batalkan</span>
            </button>
            <button
              type="button"
              onClick={dismissStatusUndoToast}
              className="min-w-[36px] min-h-[36px] rounded-xl text-slate-400 hover:text-white flex items-center justify-center transition-colors"
              aria-label="Tutup notifikasi"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* 5. Toast Global 5 Detik untuk Toggle Status Log (Baru <-> Selesai) */}
      {logStatusUndoToast && !statusUndoToast && (
        <div
          role="status"
          aria-live="polite"
          className="no-print print:hidden fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-1.5rem)] max-w-md px-4 py-3 rounded-2xl bg-slate-900 dark:bg-slate-800 text-white shadow-xl border border-slate-700/80 flex items-center justify-between gap-3"
        >
          <div className="flex items-center gap-2 min-w-0">
            <CheckCircle2 className="w-4 h-4 text-orange-400 shrink-0" />
            <span className="text-xs sm:text-sm font-semibold truncate">
              Catatan ditandai <strong>{logStatusUndoToast.nextStatus}</strong>
            </span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={handleUndoLogStatusChange}
              className="min-h-[36px] px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold inline-flex items-center gap-1 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Batalkan</span>
            </button>
            <button
              type="button"
              onClick={dismissLogStatusUndoToast}
              className="min-w-[36px] min-h-[36px] rounded-xl text-slate-400 hover:text-white flex items-center justify-center transition-colors"
              aria-label="Tutup notifikasi log"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
