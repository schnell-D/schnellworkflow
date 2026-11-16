import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  ArrowLeft,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Circle,
  Trash2,
  Edit3,
  Check,
  Send,
  Printer,
  Save,
  BookOpen,
  MoreVertical,
  History,
  MessageSquareText,
  ChevronDown,
  ChevronUp,
  StickyNote,
  Zap,
  HelpCircle,
} from 'lucide-react';
import {
  BookJob,
  BookLog,
  LogJenisType,
  LogStatusType,
  StatusProgresType,
  StatusIsbnType,
  HalamanWarnaType,
  PaketType,
} from '../types';
import {
  formatDateIndo,
  formatLogDateShort,
  getStatusProgresConfig,
} from '../utils/formatters';
import {
  getUserDummyStatus,
  setUserDummyStatus,
} from '../utils/userStorage';
import {
  buildCombinedStatusList,
  computeDaysInStatus,
  getTodayIsoDate,
} from '../utils/bookHelpers';
import {
  LOG_DARI_SUGGESTIONS,
  LOG_JENIS_OPTIONS,
  getLogDariBadgeConfig,
  getLogJenisBadgeConfig,
} from '../config/logConstants';
import {
  DEFAULT_STATUS_SELESAI,
  KELENGKAPAN_NASKAH_LIST,
  PAKET_LIST,
  STATUS_GROUPS,
  StatusGroupKey,
  UKURAN_BUKU_LIST,
  isStatusSelesai,
  parseKodeCatatan,
  resolveStatusGroup,
} from '../config/masterData';
import { sortLogsLatestFirst } from '../utils/logHelpers';
import { LogFormModal } from './LogFormModal';

export type DetailTabType = 'progres' | 'naskah' | 'produksi' | 'catatan';

interface BookDetailPageProps {
  book: BookJob | null;
  bookLogs?: BookLog[];
  customStatuses?: string[];
  statusGroupOverrides?: Record<string, StatusGroupKey>;
  statusSelesai?: string;
  isLoading?: boolean;
  initialTab?: DetailTabType;
  onTabChange?: (tab: DetailTabType) => void;
  onBack: () => void;
  onUpdateBook: (book: BookJob, updates: Partial<BookJob>) => Promise<boolean>;
  onQuickStatusChange?: (book: BookJob, nextStatus: StatusProgresType) => Promise<boolean>;
  onDeleteBook: (book: BookJob) => Promise<boolean>;
  onCreateBookLog?: (data: {
    bookId: string;
    bookNo: number;
    tanggal: string | null;
    dari: string;
    isi: string;
    jenis: LogJenisType;
    status: LogStatusType;
  }) => Promise<void>;
  onUpdateBookLog?: (log: BookLog, updates: Partial<BookLog>) => Promise<boolean>;
  onToggleBookLogStatus?: (log: BookLog) => Promise<void>;
  onDeleteBookLog?: (log: BookLog) => Promise<boolean>;
  onMarkAllBookLogsDone?: (logIds: string[]) => Promise<void>;
  currentUid?: string;
}

const VALID_TABS: DetailTabType[] = ['progres', 'naskah', 'produksi', 'catatan'];

function normalizeCheckedItems(raw?: string[]): string[] {
  if (!raw || raw.length === 0) return [];
  return KELENGKAPAN_NASKAH_LIST.filter((item) => raw.includes(item));
}

export const BookDetailPage: React.FC<BookDetailPageProps> = ({
  book,
  bookLogs = [],
  customStatuses = [],
  statusGroupOverrides = {},
  statusSelesai = DEFAULT_STATUS_SELESAI,
  isLoading = false,
  initialTab = 'progres',
  onTabChange,
  onBack,
  onUpdateBook,
  onQuickStatusChange,
  onDeleteBook,
  onCreateBookLog,
  onUpdateBookLog,
  onToggleBookLogStatus,
  onDeleteBookLog,
  onMarkAllBookLogsDone,
  currentUid = '',
}) => {
  const headerRef = useRef<HTMLElement>(null);
  const [headerHeight, setHeaderHeight] = useState<number>(112);

  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const updateHeight = () => {
      setHeaderHeight(el.offsetHeight);
    };
    updateHeight();

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(updateHeight);
      observer.observe(el);
      return () => observer.disconnect();
    }
    window.addEventListener('resize', updateHeight);
    return () => window.removeEventListener('resize', updateHeight);
  }, [book?.id, book?.no, book?.judul]);

  // Active tab state synced with URL hash (#progres, #naskah, #produksi, #catatan)
  const [activeTab, setActiveTab] = useState<DetailTabType>(
    VALID_TABS.includes(initialTab) ? initialTab : 'progres'
  );

  useEffect(() => {
    if (VALID_TABS.includes(initialTab)) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  const handleSelectTab = (tab: DetailTabType) => {
    setActiveTab(tab);
    onTabChange?.(tab);
  };

  // Draft states
  const initialUkuran = book?.ukuran || book?.ukuranBuku || UKURAN_BUKU_LIST[0];
  const [draftJudul, setDraftJudul] = useState<string>(book?.judul || '');
  const [draftPenulis, setDraftPenulis] = useState<string>(book?.penulis || '');
  const [draftStatusProgres, setDraftStatusProgres] = useState<StatusProgresType>(
    book?.statusProgres || 'Di Saya'
  );
  const [draftPaket, setDraftPaket] = useState<PaketType>(book?.paket || 'Standart');
  const [draftHalamanFinal, setDraftHalamanFinal] = useState<number>(
    book ? book.halamanFinal || book.halamanAwal : 0
  );
  const [draftTglTerima, setDraftTglTerima] = useState<string>(book?.tglTerima || '');
  const [draftKodeProduksi, setDraftKodeProduksi] = useState<string>(
    book ? book.kodeProduksi || `PRD-2026-${String(book.no).padStart(3, '0')}` : ''
  );
  const [draftIsbn, setDraftIsbn] = useState<string>(book?.isbn || '');
  const [draftStatusIsbn, setDraftStatusIsbn] = useState<StatusIsbnType>(
    book?.statusIsbn || 'Belum ada ISBN'
  );
  const [draftUkuranBuku, setDraftUkuranBuku] = useState<string>(initialUkuran);
  const [isCustomUkuranMode, setIsCustomUkuranMode] = useState<boolean>(
    () => !UKURAN_BUKU_LIST.includes(initialUkuran)
  );
  const [draftHalamanWarna, setDraftHalamanWarna] = useState<HalamanWarnaType>(
    book?.halamanWarna || 'BW'
  );
  const [draftCatatanBiaya, setDraftCatatanBiaya] = useState<string>(book?.catatanBiaya || '');
  const [draftCatatanLain, setDraftCatatanLain] = useState<string>(book?.catatanLain || '');
  const [draftKelengkapan, setDraftKelengkapan] = useState<string[]>(() =>
    normalizeCheckedItems(book?.kelengkapanNaskah)
  );
  const [draftAdaPertanyaan, setDraftAdaPertanyaan] = useState<boolean>(
    Boolean(book?.adaPertanyaan)
  );

  // Catatan Buku (catatan tetap per buku, tersimpan langsung saat blur/Simpan)
  const [draftCatatanBuku, setDraftCatatanBuku] = useState<string>(book?.catatanBuku || '');
  const [isEditingCatatanBuku, setIsEditingCatatanBuku] = useState<boolean>(false);
  const [isCatatanBukuExpanded, setIsCatatanBukuExpanded] = useState<boolean>(false);
  const [catatanBukuSaveState, setCatatanBukuSaveState] = useState<
    'idle' | 'saving' | 'saved' | 'error'
  >('idle');

  const [draftDummyStatus, setDraftDummyStatus] = useState<'tidak_ada' | 'proses' | 'selesai'>(() => {
    if (!book) return 'tidak_ada';
    const saved = getUserDummyStatus(currentUid, book.no);
    return (saved as 'tidak_ada' | 'proses' | 'selesai') || 'tidak_ada';
  });
  const [savedDummyBaseline, setSavedDummyBaseline] = useState<'tidak_ada' | 'proses' | 'selesai'>(() => {
    if (!book) return 'tidak_ada';
    const saved = getUserDummyStatus(currentUid, book.no);
    return (saved as 'tidak_ada' | 'proses' | 'selesai') || 'tidak_ada';
  });

  // UI sub-states
  const [isEditingProduction, setIsEditingProduction] = useState(false);
  const [isEditingHalaman, setIsEditingHalaman] = useState(false);
  const [halamanInput, setHalamanInput] = useState<string>(String(draftHalamanFinal));

  // State Tab Catatan baru (Firestore users/{uid}/logs)
  const [quickLogInput, setQuickLogInput] = useState<string>('');
  const [isQuickSubmitting, setIsQuickSubmitting] = useState<boolean>(false);
  const [isDetailLogFormOpen, setIsDetailLogFormOpen] = useState<boolean>(false);
  const [logTanggal, setLogTanggal] = useState<string>(getTodayIsoDate());
  const [logDariChip, setLogDariChip] = useState<string>('Saya');
  const [logDariCustom, setLogDariCustom] = useState<string>('');
  const [logJenis, setLogJenis] = useState<LogJenisType>('Revisi');
  const [logIsi, setLogIsi] = useState<string>('');
  const [isSubmittingLog, setIsSubmittingLog] = useState(false);
  const [logSubTab, setLogSubTab] = useState<'Baru' | 'Semua'>('Baru');
  const [showLegacyLogs, setShowLegacyLogs] = useState(false);
  const [openLogMenuId, setOpenLogMenuId] = useState<string | null>(null);
  const [confirmDeleteLogId, setConfirmDeleteLogId] = useState<string | null>(null);
  const [editingLogModal, setEditingLogModal] = useState<BookLog | null>(null);

  const [confirmDeleteBook, setConfirmDeleteBook] = useState(false);
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);

  // Save state feedback: 'idle' | 'saving' | 'saved' | 'error'
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [saveErrorText, setSaveErrorText] = useState<string | null>(null);
  const [isDeletingBook, setIsDeletingBook] = useState(false);

  const availableStatuses = useMemo(
    () => buildCombinedStatusList(customStatuses),
    [customStatuses]
  );

  const groupedStatuses = useMemo(() => {
    const groupsMap = new Map<StatusGroupKey, string[]>();
    STATUS_GROUPS.forEach((g) => groupsMap.set(g.key, []));
    availableStatuses.forEach((st) => {
      const gk = resolveStatusGroup(st, statusGroupOverrides);
      groupsMap.get(gk)?.push(st);
    });
    return STATUS_GROUPS.map((g) => ({
      meta: g,
      statuses: groupsMap.get(g.key) || [],
    })).filter((entry) => entry.statuses.length > 0);
  }, [availableStatuses, statusGroupOverrides]);

  const quickLogParsed = useMemo(() => parseKodeCatatan(quickLogInput), [quickLogInput]);

  // Close 3-dot log menu on outside click
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (openLogMenuId && !(e.target as HTMLElement).closest('[data-detail-log-menu]')) {
        setOpenLogMenuId(null);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [openLogMenuId]);

  // Track which book record was loaded so Firestore optimistic echoes don't clobber active typing
  const loadedBookIdentityRef = useRef<string | null>(null);

  useEffect(() => {
    if (!book) {
      loadedBookIdentityRef.current = null;
      return;
    }

    const identity = `${book.id || book.no}::${currentUid}`;
    const isDifferentBook = loadedBookIdentityRef.current !== identity;

    if (isDifferentBook) {
      loadedBookIdentityRef.current = identity;

      setDraftJudul(book.judul);
      setDraftPenulis(book.penulis);
      setDraftStatusProgres(book.statusProgres);
      setDraftPaket(book.paket);
      const hal = book.halamanFinal || book.halamanAwal;
      setDraftHalamanFinal(hal);
      setHalamanInput(String(hal));
      setDraftTglTerima(book.tglTerima || '');
      setDraftKodeProduksi(
        book.kodeProduksi || `PRD-2026-${String(book.no).padStart(3, '0')}`
      );
      setDraftIsbn(book.isbn || '');
      setDraftStatusIsbn(book.statusIsbn || 'Belum ada ISBN');
      const uk = book.ukuran || book.ukuranBuku || UKURAN_BUKU_LIST[0];
      setDraftUkuranBuku(uk);
      setIsCustomUkuranMode(!UKURAN_BUKU_LIST.includes(uk));
      setDraftHalamanWarna(book.halamanWarna || 'BW');
      setDraftCatatanBiaya(book.catatanBiaya || '');
      setDraftCatatanLain(book.catatanLain || '');
      setDraftKelengkapan(normalizeCheckedItems(book.kelengkapanNaskah));
      setDraftAdaPertanyaan(Boolean(book.adaPertanyaan));

      setDraftCatatanBuku(book.catatanBuku || '');
      setIsEditingCatatanBuku(false);
      setIsCatatanBukuExpanded(false);
      setCatatanBukuSaveState('idle');

      const savedDummy =
        (getUserDummyStatus(currentUid, book.no) as 'tidak_ada' | 'proses' | 'selesai') ||
        'tidak_ada';
      setDraftDummyStatus(savedDummy);
      setSavedDummyBaseline(savedDummy);

      setQuickLogInput('');
      setIsDetailLogFormOpen(false);
      setLogTanggal(getTodayIsoDate());
      setLogDariChip('Saya');
      setLogDariCustom('');
      setLogJenis('Revisi');
      setLogIsi('');
      setLogSubTab('Baru');
      setShowLegacyLogs(false);
      setOpenLogMenuId(null);
      setConfirmDeleteLogId(null);
      setEditingLogModal(null);

      setIsEditingProduction(false);
      setIsEditingHalaman(false);
      setConfirmDeleteBook(false);
      setShowUnsavedDialog(false);
      setSaveState('idle');
      setSaveErrorText(null);
    }
  }, [book, currentUid]);

  // Sinkronkan status progres, kelengkapan, adaPertanyaan & catatanBuku saat berubah via Undo toast atau Firestore
  useEffect(() => {
    if (!book) return;
    setDraftStatusProgres(book.statusProgres);
  }, [book?.statusProgres]);

  useEffect(() => {
    if (!book) return;
    setDraftKelengkapan(normalizeCheckedItems(book.kelengkapanNaskah));
  }, [book?.kelengkapanNaskah]);

  useEffect(() => {
    if (!book) return;
    setDraftAdaPertanyaan(Boolean(book.adaPertanyaan));
  }, [book?.adaPertanyaan]);

  useEffect(() => {
    if (!book || isEditingCatatanBuku) return;
    setDraftCatatanBuku(book.catatanBuku || '');
  }, [book?.catatanBuku, isEditingCatatanBuku]);

  useEffect(() => {
    setHalamanInput(String(draftHalamanFinal));
  }, [draftHalamanFinal]);

  // Konsistensi Kelengkapan Naskah: selalu dihitung dari 10 item pokok
  const checkedKelengkapanCount = useMemo(
    () => KELENGKAPAN_NASKAH_LIST.filter((item) => draftKelengkapan.includes(item)).length,
    [draftKelengkapan]
  );
  const isAllKelengkapanChecked = checkedKelengkapanCount === KELENGKAPAN_NASKAH_LIST.length;

  // Deteksi perubahan form manual yang belum disimpan (status, naskah checklist, catatanBuku, dan log ditulis langsung)
  const hasChanges = useMemo(() => {
    if (!book) return false;
    const baselineUkuran = book.ukuran || book.ukuranBuku || UKURAN_BUKU_LIST[0];

    return (
      draftJudul.trim() !== book.judul.trim() ||
      draftPenulis.trim() !== book.penulis.trim() ||
      draftPaket !== book.paket ||
      draftHalamanFinal !== (book.halamanFinal || book.halamanAwal) ||
      (draftTglTerima || '') !== (book.tglTerima || '') ||
      draftKodeProduksi.trim() !==
        (book.kodeProduksi || `PRD-2026-${String(book.no).padStart(3, '0')}`).trim() ||
      draftIsbn.trim() !== (book.isbn || '').trim() ||
      draftStatusIsbn !== (book.statusIsbn || 'Belum ada ISBN') ||
      draftUkuranBuku.trim() !== baselineUkuran.trim() ||
      draftHalamanWarna !== (book.halamanWarna || 'BW') ||
      draftCatatanBiaya.trim() !== (book.catatanBiaya || '').trim() ||
      draftCatatanLain.trim() !== (book.catatanLain || '').trim() ||
      draftDummyStatus !== savedDummyBaseline
    );
  }, [
    book,
    draftJudul,
    draftPenulis,
    draftPaket,
    draftHalamanFinal,
    draftTglTerima,
    draftKodeProduksi,
    draftIsbn,
    draftStatusIsbn,
    draftUkuranBuku,
    draftHalamanWarna,
    draftCatatanBiaya,
    draftCatatanLain,
    draftDummyStatus,
    savedDummyBaseline,
  ]);

  // Reset status indicator back to 'idle' when user modifies fields after an error/saved state
  useEffect(() => {
    if (hasChanges && saveState === 'saved') {
      setSaveState('idle');
    }
  }, [hasChanges, saveState]);

  const statusConfig = getStatusProgresConfig(draftStatusProgres);

  const daysInStatus = useMemo(() => {
    if (!book) return 1;
    return computeDaysInStatus(book);
  }, [book]);

  const timelineStages = useMemo(() => {
    const isSelesai = draftStatusProgres === 'Selesai';
    const isReadyPrint = draftStatusProgres === 'Sudah siap cetak' || isSelesai;
    const isACC = draftStatusProgres === 'Nunggu ACC Cetak' || isReadyPrint;
    const isIsbn = draftStatusProgres === 'Nunggu ISBN' || isACC;
    const isFinishingKorektor = draftStatusProgres === 'Finishing Korektor' || isIsbn;
    const isPenulis =
      draftStatusProgres === 'Di Penulis' || draftStatusProgres === 'Masalah saat Kor penulis';
    const isFinishingSaya = draftStatusProgres === 'Finishing Saya';
    const isCoped = draftStatusProgres === 'Di Coped';
    const isSaya = draftStatusProgres === 'Di Saya';
    const isLayoutAwalDone = draftStatusProgres !== 'Kirim file awal layout';

    return [
      {
        id: 'terima',
        title: 'Terima Naskah',
        sub: formatDateIndo(draftTglTerima || book?.tglTerima) || 'Naskah Masuk',
        status: 'done' as const,
      },
      {
        id: 'layout_awal',
        title: 'Layout Awal',
        sub: isLayoutAwalDone
          ? `${book?.lamaLayoutAwal ?? 0} hari selesai`
          : 'Kirim File Awal',
        status: isLayoutAwalDone ? ('done' as const) : ('current' as const),
      },
      {
        id: 'review_koreksi',
        title: 'Penulis & Koreksi',
        sub: isPenulis
          ? 'Sedang di Penulis'
          : isCoped
          ? 'Di Coped'
          : isFinishingSaya
          ? 'Finishing Saya'
          : isFinishingKorektor || isIsbn || isACC || isReadyPrint || isSelesai
          ? 'Koreksi Selesai'
          : isSaya
          ? 'Pengerjaan di Saya'
          : 'Menunggu',
        status:
          isFinishingKorektor || isIsbn || isACC || isReadyPrint || isSelesai
            ? ('done' as const)
            : isPenulis || isCoped || isFinishingSaya || isSaya
            ? ('current' as const)
            : ('upcoming' as const),
      },
      {
        id: 'dummy',
        title: 'Cetak Dummy',
        sub:
          draftDummyStatus === 'selesai'
            ? 'Dummy Fisik ACC'
            : draftDummyStatus === 'proses'
            ? 'Sedang Cetak'
            : 'Opsional (Off)',
        status:
          draftDummyStatus === 'selesai'
            ? ('done' as const)
            : draftDummyStatus === 'proses'
            ? ('current' as const)
            : ('optional' as const),
      },
      {
        id: 'finishing',
        title: 'Finishing Korektor',
        sub:
          isIsbn || isACC || isReadyPrint || isSelesai
            ? 'Finishing Siap'
            : draftStatusProgres === 'Finishing Korektor'
            ? 'Korektor Finishing'
            : 'Belum Finishing',
        status:
          isIsbn || isACC || isReadyPrint || isSelesai
            ? ('done' as const)
            : draftStatusProgres === 'Finishing Korektor'
            ? ('current' as const)
            : ('upcoming' as const),
      },
      {
        id: 'isbn_stage',
        title: 'ISBN',
        sub:
          draftStatusIsbn === 'ISBN Terbit'
            ? 'ISBN Terbit'
            : draftStatusProgres === 'Nunggu ISBN' || draftStatusIsbn === 'Pengajuan ISBN'
            ? 'Proses Pengajuan'
            : 'Belum ISBN',
        status:
          draftStatusIsbn === 'ISBN Terbit' || isReadyPrint || isSelesai
            ? ('done' as const)
            : draftStatusProgres === 'Nunggu ISBN'
            ? ('current' as const)
            : ('upcoming' as const),
      },
      {
        id: 'acc_cetak',
        title: 'ACC Cetak',
        sub:
          isReadyPrint || isSelesai
            ? 'Siap Cetak'
            : draftStatusProgres === 'Nunggu ACC Cetak'
            ? 'Menunggu ACC'
            : 'Belum ACC',
        status:
          isReadyPrint || isSelesai
            ? ('done' as const)
            : draftStatusProgres === 'Nunggu ACC Cetak'
            ? ('current' as const)
            : ('upcoming' as const),
      },
    ];
  }, [book, draftTglTerima, draftStatusProgres, draftDummyStatus, draftStatusIsbn]);

  // Handlers satu ketukan status & simpan otomatis checklist naskah
  const handleOneTapStatus = async (nextStatus: StatusProgresType) => {
    if (!book || nextStatus === draftStatusProgres) return;
    const prevStatus = draftStatusProgres;
    setDraftStatusProgres(nextStatus);
    setSaveState('saving');
    setSaveErrorText(null);

    let ok = false;
    if (onQuickStatusChange) {
      ok = await onQuickStatusChange(book, nextStatus);
    } else {
      const today = getTodayIsoDate();
      const updates: Partial<BookJob> = {
        statusProgres: nextStatus,
        updateTerakhir: today,
      };
      if (isStatusSelesai(nextStatus, statusSelesai) && !book.tglSelesaiLayout) {
        updates.tglSelesaiLayout = today;
      }
      ok = await onUpdateBook(book, updates);
    }

    if (ok) {
      setSaveState('saved');
    } else {
      setDraftStatusProgres(prevStatus);
      setSaveState('error');
      setSaveErrorText('Gagal mengubah status buku di Firestore. Periksa koneksi lalu coba lagi.');
    }
  };

  const persistKelengkapanNow = async (nextChecked: string[], prevChecked: string[]) => {
    if (!book) return;
    setSaveState('saving');
    setSaveErrorText(null);
    const ordered = KELENGKAPAN_NASKAH_LIST.filter((item) => nextChecked.includes(item));
    const payload =
      ordered.length === KELENGKAPAN_NASKAH_LIST.length ? [...ordered, 'Lengkap'] : ordered;

    const ok = await onUpdateBook(book, {
      kelengkapanNaskah: payload,
      updateTerakhir: getTodayIsoDate(),
    });
    if (ok) {
      setSaveState('saved');
    } else {
      setDraftKelengkapan(prevChecked);
      setSaveState('error');
      setSaveErrorText('Gagal menyimpan kelengkapan naskah ke Firestore. Silakan coba lagi.');
    }
  };

  const handleToggleKelengkapan = (item: string) => {
    const clean = normalizeCheckedItems(draftKelengkapan);
    const next = clean.includes(item) ? clean.filter((i) => i !== item) : [...clean, item];
    setDraftKelengkapan(next);
    void persistKelengkapanNow(next, clean);
  };

  const handleToggleAllKelengkapan = () => {
    const clean = normalizeCheckedItems(draftKelengkapan);
    const next = isAllKelengkapanChecked ? [] : [...KELENGKAPAN_NASKAH_LIST];
    setDraftKelengkapan(next);
    void persistKelengkapanNow(next, clean);
  };

  const handleToggleAdaPertanyaan = async () => {
    if (!book) return;
    const prev = draftAdaPertanyaan;
    const next = !prev;
    setDraftAdaPertanyaan(next);
    setSaveState('saving');
    setSaveErrorText(null);

    const ok = await onUpdateBook(book, {
      adaPertanyaan: next,
      updateTerakhir: getTodayIsoDate(),
    });
    if (ok) {
      setSaveState('saved');
    } else {
      setDraftAdaPertanyaan(prev);
      setSaveState('error');
      setSaveErrorText('Gagal menyimpan status pertanyaan ke Firestore.');
    }
  };

  const saveCatatanBukuNow = async (rawValue: string) => {
    if (!book) return;
    const cleaned = rawValue.trim();
    const prevCleaned = (book.catatanBuku || '').trim();
    if (cleaned === prevCleaned) {
      setIsEditingCatatanBuku(false);
      return;
    }

    setCatatanBukuSaveState('saving');
    const ok = await onUpdateBook(book, {
      catatanBuku: cleaned || null,
    });
    if (ok) {
      setDraftCatatanBuku(cleaned);
      setIsEditingCatatanBuku(false);
      setCatatanBukuSaveState('saved');
    } else {
      setCatatanBukuSaveState('error');
    }
  };

  const handleApplyHalaman = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const parsed = parseInt(halamanInput, 10);
    if (!isNaN(parsed) && parsed > 0) {
      setDraftHalamanFinal(parsed);
      setIsEditingHalaman(false);
    }
  };

  const sortedBookLogs = useMemo(() => [...bookLogs].sort(sortLogsLatestFirst), [bookLogs]);
  const bookLogsBaruCount = useMemo(
    () => sortedBookLogs.filter((l) => l.status === 'Baru').length,
    [sortedBookLogs]
  );

  const handleQuickLogSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!book || !quickLogInput.trim() || !onCreateBookLog) return;
    const parsed = parseKodeCatatan(quickLogInput);
    if (!parsed.isi) return;

    setIsQuickSubmitting(true);
    try {
      await onCreateBookLog({
        bookId: book.id || String(book.no),
        bookNo: book.no,
        tanggal: getTodayIsoDate(),
        dari: parsed.dari,
        isi: parsed.isi,
        jenis: parsed.jenis,
        status: 'Baru',
      });
      setQuickLogInput('');
    } finally {
      setIsQuickSubmitting(false);
    }
  };

  const handleSubmitBookLog = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!book || !logIsi.trim() || !onCreateBookLog) return;
    const resolvedDari =
      logDariChip === '__custom__' ? logDariCustom.trim() : logDariChip;

    setIsSubmittingLog(true);
    try {
      await onCreateBookLog({
        bookId: book.id || String(book.no),
        bookNo: book.no,
        tanggal: logTanggal || null,
        dari: resolvedDari,
        isi: logIsi.trim(),
        jenis: logJenis,
        status: 'Baru',
      });
      setLogIsi('');
      setLogDariCustom('');
    } finally {
      setIsSubmittingLog(false);
    }
  };

  const performSave = async (): Promise<boolean> => {
    if (!book) return false;
    setSaveState('saving');
    setSaveErrorText(null);

    const today = getTodayIsoDate();
    const statusChanged = draftStatusProgres !== book.statusProgres;
    const checkedItems = KELENGKAPAN_NASKAH_LIST.filter((item) => draftKelengkapan.includes(item));
    const kelengkapanPayload =
      checkedItems.length === KELENGKAPAN_NASKAH_LIST.length
        ? [...checkedItems, 'Lengkap']
        : checkedItems;

    const resolvedUkuran =
      draftUkuranBuku.trim() || book.ukuran || book.ukuranBuku || UKURAN_BUKU_LIST[0];

    const updates: Partial<BookJob> = {
      judul: draftJudul.trim() || book.judul,
      penulis: draftPenulis.trim() || book.penulis,
      statusProgres: draftStatusProgres,
      paket: draftPaket,
      halamanFinal: draftHalamanFinal,
      tglTerima: draftTglTerima.trim() || null,
      kodeProduksi: draftKodeProduksi.trim() || undefined,
      isbn: draftIsbn.trim() || undefined,
      statusIsbn: draftStatusIsbn,
      ukuran: resolvedUkuran,
      ukuranBuku: resolvedUkuran,
      halamanWarna: draftHalamanWarna,
      catatanBiaya: draftCatatanBiaya.trim() || null,
      catatanLain: draftCatatanLain.trim() || null,
      kelengkapanNaskah: kelengkapanPayload,
    };

    if (statusChanged || hasChanges) {
      updates.updateTerakhir = today;
    }

    if (isStatusSelesai(draftStatusProgres, statusSelesai) && !book.tglSelesaiLayout) {
      updates.tglSelesaiLayout = today;
    }

    const ok = await onUpdateBook(book, updates);
    if (ok) {
      setUserDummyStatus(currentUid, book.no, draftDummyStatus);
      setSavedDummyBaseline(draftDummyStatus);
      setSaveState('saved');
      return true;
    } else {
      setSaveState('error');
      setSaveErrorText('Gagal menyimpan perubahan ke Firestore. Periksa koneksi lalu coba lagi.');
      return false;
    }
  };

  const handleBackClick = () => {
    if (hasChanges) {
      setShowUnsavedDialog(true);
    } else {
      onBack();
    }
  };

  const handleDiscardAndBack = () => {
    setShowUnsavedDialog(false);
    onBack();
  };

  const handleSaveAndBack = async () => {
    const ok = await performSave();
    if (ok) {
      setShowUnsavedDialog(false);
      onBack();
    } else {
      setShowUnsavedDialog(false);
    }
  };

  const handleConfirmDeleteBook = async () => {
    if (!book) return;
    setIsDeletingBook(true);
    const ok = await onDeleteBook(book);
    setIsDeletingBook(false);
    if (ok) {
      onBack();
    } else {
      setConfirmDeleteBook(false);
      setSaveState('error');
      setSaveErrorText('Gagal menghapus buku dari Firestore. Silakan coba lagi.');
    }
  };

  // ==========================================
  // LOADING SKELETON STATE
  // ==========================================
  if (isLoading) {
    return (
      <div className="min-h-[100dvh] bg-[#F2F5FA] dark:bg-slate-950 flex flex-col">
        <div className="w-full lg:max-w-[1100px] lg:mx-auto flex-1 flex flex-col bg-white dark:bg-slate-900 lg:my-4 lg:rounded-2xl lg:border lg:border-slate-200/80 lg:dark:border-slate-800 animate-pulse">
          <div className="px-4 sm:px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center gap-3">
            <div className="h-11 w-24 rounded-xl bg-slate-200 dark:bg-slate-800" />
            <div className="flex-1 space-y-2">
              <div className="h-5 w-2/3 rounded bg-slate-200 dark:bg-slate-800" />
              <div className="h-3.5 w-1/3 rounded bg-slate-200 dark:bg-slate-800" />
            </div>
          </div>
          <div className="p-4 sm:p-6 space-y-6 flex-1">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <div className="col-span-2 md:col-span-1 h-20 rounded-xl bg-slate-100 dark:bg-slate-800" />
              <div className="h-20 rounded-xl bg-slate-100 dark:bg-slate-800" />
              <div className="h-20 rounded-xl bg-slate-100 dark:bg-slate-800" />
            </div>
            <div className="h-11 rounded-xl bg-slate-100 dark:bg-slate-800" />
            <div className="h-64 rounded-2xl bg-slate-100 dark:bg-slate-800" />
          </div>
        </div>
      </div>
    );
  }

  // ==========================================
  // NOT FOUND STATE (ID SALAH / DIHAPUS)
  // ==========================================
  if (!book) {
    return (
      <div className="min-h-[100dvh] bg-[#F2F5FA] dark:bg-slate-950 flex items-center justify-center p-4 sm:p-6">
        <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 sm:p-8 text-center space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 mx-auto flex items-center justify-center">
            <BookOpen className="w-6 h-6" />
          </div>
          <div className="space-y-1.5">
            <h1 className="text-lg font-extrabold text-slate-900 dark:text-white">
              Buku Tidak Ditemukan
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
              Data buku dengan ID tersebut tidak tersedia di daftar Anda atau sudah dihapus.
            </p>
          </div>
          <button
            type="button"
            onClick={onBack}
            className="w-full sm:w-auto min-h-[44px] px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-bold inline-flex items-center justify-center gap-2 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Kembali ke Daftar Buku</span>
          </button>
        </div>
      </div>
    );
  }

  const halamanDiff = draftHalamanFinal - book.halamanAwal;

  return (
    <div className="min-h-[100dvh] bg-[#F2F5FA] dark:bg-slate-950 text-slate-800 dark:text-slate-100 flex flex-col font-['Plus_Jakarta_Sans',sans-serif] overflow-x-clip">
      <div className="w-full lg:max-w-[1100px] lg:mx-auto flex-1 flex flex-col bg-white dark:bg-slate-900 lg:my-4 lg:rounded-2xl lg:border lg:border-slate-200/90 lg:dark:border-slate-800 lg:shadow-sm">
        {/* =================================================================
            A. HEADER (Sticky di atas, ringkas, tanpa tombol X terpisah)
            ================================================================= */}
        <header
          ref={headerRef}
          className="sticky top-0 z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 lg:rounded-t-2xl"
        >
          <div className="px-4 sm:px-6 pt-2.5 pb-2 space-y-2">
            {/* Baris Atas: Tombol Kembali, Nomor, Judul (maks 2 baris), Penulis */}
            <div className="flex items-start gap-3">
              <button
                type="button"
                onClick={handleBackClick}
                className="min-h-[44px] min-w-[44px] px-2.5 sm:px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs sm:text-sm font-bold inline-flex items-center justify-center gap-1.5 shrink-0 transition-colors"
                aria-label="Kembali ke daftar buku"
              >
                <ArrowLeft className="w-4 h-4 shrink-0" />
                <span>Kembali</span>
              </button>

              <div className="min-w-0 flex-1">
                <div className="flex items-start gap-2">
                  <span className="mt-0.5 px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-extrabold text-xs tabular-nums shrink-0 border border-blue-100 dark:border-blue-900">
                    #{book.no}
                  </span>
                  <h1 className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white leading-snug line-clamp-2 min-w-0">
                    {draftJudul || book.judul}
                  </h1>
                </div>
                <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5 truncate font-medium">
                  {draftPenulis || book.penulis}
                </p>
              </div>
            </div>

            {/* Baris Badge Kecil: Paket (bisa diganti), Kategori, Status ISBN */}
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-0.5">
              {/* Switcher Paket */}
              <div
                className="inline-flex items-center rounded-xl bg-slate-100 dark:bg-slate-800 p-1 border border-slate-200 dark:border-slate-700 shrink-0"
                role="group"
                aria-label="Pilih paket layanan"
              >
                {PAKET_LIST.map((pkt) => {
                  const isSelected = draftPaket === pkt;
                  return (
                    <button
                      key={pkt}
                      type="button"
                      onClick={() => setDraftPaket(pkt)}
                      className={`min-h-[44px] sm:min-h-[36px] px-3 sm:px-2.5 py-1 rounded-lg text-xs font-bold whitespace-nowrap transition-colors ${
                        isSelected
                          ? pkt === 'Premium'
                            ? 'bg-purple-600 text-white'
                            : pkt === 'Standart'
                            ? 'bg-blue-600 text-white'
                            : 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      {pkt}
                    </button>
                  );
                })}
              </div>

              <span className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 whitespace-nowrap shrink-0">
                {book.kategori}
              </span>

              <span
                className={`px-2.5 py-1 rounded-lg text-xs font-bold whitespace-nowrap shrink-0 border ${
                  draftStatusIsbn === 'ISBN Terbit'
                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                    : draftStatusIsbn === 'Pengajuan ISBN'
                    ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border-amber-200 dark:border-amber-800'
                    : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border-slate-200 dark:border-slate-700'
                }`}
              >
                {draftStatusIsbn}
              </span>

              {book.stuck === 'Ya' && (
                <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-rose-50 text-rose-600 dark:bg-rose-950/50 dark:text-rose-400 border border-rose-200 dark:border-rose-900 inline-flex items-center gap-1 whitespace-nowrap shrink-0">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>Stuck</span>
                </span>
              )}
            </div>
          </div>
        </header>

        {/* =================================================================
            B. RINGKASAN (3 angka ringkas, tanpa kartu besar bersarang)
            ================================================================= */}
        <section
          aria-label="Ringkasan progres buku"
          className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/60"
        >
          <div className="grid grid-cols-2 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-slate-200 dark:divide-slate-800">
            {/* Status Saat Ini (Ambil 1 baris penuh di HP) */}
            <div className="col-span-2 md:col-span-1 px-4 sm:px-6 py-3.5">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 block">
                Status Saat Ini
              </span>
              <span className={`text-sm sm:text-base font-extrabold mt-0.5 block ${statusConfig.text}`}>
                {draftStatusProgres}
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 block">
                Update: {formatDateIndo(book.updateTerakhir)}
              </span>
            </div>

            {/* Lama di Status Ini */}
            <div className="px-4 sm:px-6 py-3.5 border-r border-slate-200 dark:border-slate-800 md:border-r-0">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 block">
                Lama di Status Ini
              </span>
              <span className="text-lg sm:text-xl font-black text-blue-600 dark:text-blue-400 tabular-nums mt-0.5 block">
                {daysInStatus} hari
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 block truncate">
                Sejak update terakhir
              </span>
            </div>

            {/* Hari Berjalan */}
            <div className="px-4 sm:px-6 py-3.5">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 block">
                Hari Berjalan
              </span>
              <span className="text-lg sm:text-xl font-black text-slate-900 dark:text-white tabular-nums mt-0.5 block">
                {book.hariBerjalan} hari
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 block truncate">
                Layout awal {book.lamaLayoutAwal} hari · {formatDateIndo(draftTglTerima || book.tglTerima)}
              </span>
            </div>
          </div>
        </section>

        {/* =================================================================
            B2. CATATAN BUKU (catatan tetap tentang buku ini, bukan log bertanggal)
            ================================================================= */}
        <section
          aria-label="Catatan buku"
          className="px-4 sm:px-6 py-3 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
        >
          <div className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/30 px-3.5 py-2.5">
            <div className="flex items-center justify-between gap-2 mb-1">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-600 dark:text-slate-300">
                <StickyNote className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                <span>Catatan Buku</span>
                {catatanBukuSaveState === 'saving' && (
                  <span className="text-[11px] font-semibold text-blue-600 dark:text-blue-400">
                    Menyimpan...
                  </span>
                )}
                {catatanBukuSaveState === 'saved' && (
                  <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-0.5">
                    <Check className="w-3 h-3" /> Tersimpan
                  </span>
                )}
                {catatanBukuSaveState === 'error' && (
                  <span className="text-[11px] font-semibold text-rose-600 dark:text-rose-400">
                    Gagal menyimpan
                  </span>
                )}
              </div>

              {!isEditingCatatanBuku && draftCatatanBuku.trim() !== '' && (
                <button
                  type="button"
                  onClick={() => {
                    setCatatanBukuSaveState('idle');
                    setIsEditingCatatanBuku(true);
                  }}
                  className="min-h-[32px] px-2 py-1 rounded-lg text-xs font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/50 inline-flex items-center gap-1 transition-colors"
                  aria-label="Ubah catatan buku"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>Ubah</span>
                </button>
              )}
            </div>

            {isEditingCatatanBuku ? (
              <div className="space-y-2 pt-1">
                <textarea
                  value={draftCatatanBuku}
                  onChange={(e) => setDraftCatatanBuku(e.target.value)}
                  onBlur={() => {
                    void saveCatatanBukuNow(draftCatatanBuku);
                  }}
                  rows={2}
                  autoFocus
                  placeholder="Catatan tetap buku ini (mis. Termasuk tambahan ongkir kirim koreksi fisik penulis)..."
                  className="w-full p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-blue-400 text-base sm:text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setDraftCatatanBuku(book.catatanBuku || '');
                      setIsEditingCatatanBuku(false);
                    }}
                    className="min-h-[36px] px-3 py-1 rounded-lg text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-700"
                  >
                    Batal
                  </button>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      void saveCatatanBukuNow(draftCatatanBuku);
                    }}
                    className="min-h-[36px] px-3.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold inline-flex items-center gap-1"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>Simpan</span>
                  </button>
                </div>
              </div>
            ) : draftCatatanBuku.trim() === '' ? (
              <button
                type="button"
                onClick={() => {
                  setCatatanBukuSaveState('idle');
                  setIsEditingCatatanBuku(true);
                }}
                className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline py-0.5 inline-flex items-center gap-1"
              >
                + Tambah catatan buku
              </button>
            ) : (
              <div>
                <p
                  className={`text-xs sm:text-sm text-slate-700 dark:text-slate-200 leading-relaxed whitespace-pre-wrap ${
                    isCatatanBukuExpanded ? '' : 'line-clamp-2'
                  }`}
                >
                  {draftCatatanBuku}
                </p>
                {draftCatatanBuku.length > 110 && (
                  <button
                    type="button"
                    onClick={() => setIsCatatanBukuExpanded((prev) => !prev)}
                    className="text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:underline mt-0.5"
                  >
                    {isCatatanBukuExpanded ? 'Sembunyikan' : 'Selengkapnya'}
                  </button>
                )}
              </div>
            )}
          </div>
        </section>

        {/* =================================================================
            C. TAB NAVIGASI (Segmented control, sticky di bawah header)
            ================================================================= */}
        <nav
          aria-label="Navigasi detail buku"
          style={{ top: `${headerHeight}px` }}
          className="sticky z-20 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 px-4 sm:px-6 py-1.5"
        >
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar p-1 rounded-xl bg-slate-100 dark:bg-slate-800">
            <button
              type="button"
              onClick={() => handleSelectTab('progres')}
              className={`min-h-[44px] flex-1 px-3.5 py-2 rounded-lg text-xs sm:text-sm font-bold whitespace-nowrap shrink-0 transition-colors flex items-center justify-center gap-2 ${
                activeTab === 'progres'
                  ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <span>Progres</span>
            </button>

            <button
              type="button"
              onClick={() => handleSelectTab('naskah')}
              className={`min-h-[44px] flex-1 px-3.5 py-2 rounded-lg text-xs sm:text-sm font-bold whitespace-nowrap shrink-0 transition-colors flex items-center justify-center gap-2 ${
                activeTab === 'naskah'
                  ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <span>Naskah</span>
              <span
                className={`px-1.5 py-0.5 rounded-md text-[11px] font-extrabold tabular-nums ${
                  activeTab === 'naskah'
                    ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300'
                    : 'bg-slate-200/80 dark:bg-slate-700 text-slate-700 dark:text-slate-200'
                }`}
              >
                {checkedKelengkapanCount}/10
              </span>
            </button>

            <button
              type="button"
              onClick={() => handleSelectTab('produksi')}
              className={`min-h-[44px] flex-1 px-3.5 py-2 rounded-lg text-xs sm:text-sm font-bold whitespace-nowrap shrink-0 transition-colors flex items-center justify-center gap-2 ${
                activeTab === 'produksi'
                  ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <span>Produksi</span>
            </button>

            <button
              type="button"
              onClick={() => handleSelectTab('catatan')}
              className={`min-h-[44px] flex-1 px-3.5 py-2 rounded-lg text-xs sm:text-sm font-bold whitespace-nowrap shrink-0 transition-colors flex items-center justify-center gap-2 ${
                activeTab === 'catatan'
                  ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <span>Catatan</span>
              <span
                className={`px-1.5 py-0.5 rounded-md text-[11px] font-extrabold tabular-nums ${
                  bookLogsBaruCount > 0
                    ? 'bg-orange-500 text-white'
                    : activeTab === 'catatan'
                    ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300'
                    : 'bg-slate-200/80 dark:bg-slate-700 text-slate-700 dark:text-slate-200'
                }`}
              >
                {bookLogsBaruCount > 0 ? bookLogsBaruCount : sortedBookLogs.length}
              </span>
            </button>
          </div>
        </nav>

        {/* =================================================================
            KONTEN TAB AKTIF
            ================================================================= */}
        <main className="flex-1 px-4 sm:px-6 py-6 space-y-8">
          {/* Banner Error Simpan jika gagal */}
          {saveErrorText && (
            <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 text-xs sm:text-sm flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
              <p className="font-medium leading-relaxed">{saveErrorText}</p>
            </div>
          )}

          {/* ---------------------------------------------------------------
              TAB 1: PROGRES
              --------------------------------------------------------------- */}
          {activeTab === 'progres' && (
            <div className="space-y-8">
              {/* Ubah Status Satu Ketukan: dikelompokkan per kelompok STATUS_GROUPS */}
              <section className="space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Ubah status
                  </h2>
                  <span className="text-[11px] text-slate-400 dark:text-slate-500">
                    Ketuk status untuk langsung menyimpan
                  </span>
                </div>

                <div className="space-y-4">
                  {groupedStatuses.map(({ meta, statuses }) => (
                    <div key={meta.key} className="space-y-2">
                      <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: meta.hex }}
                        />
                        <span>{meta.label}</span>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                        {statuses.map((st) => {
                          const isSelected = draftStatusProgres === st;
                          return (
                            <button
                              key={st}
                              type="button"
                              onClick={() => handleOneTapStatus(st)}
                              aria-pressed={isSelected}
                              className={`min-h-[48px] sm:min-h-[44px] px-3 py-2 rounded-xl text-xs font-bold text-left border flex items-center justify-between gap-2 transition-colors duration-150 motion-reduce:transition-none ${
                                isSelected
                                  ? 'bg-[#2F6BDE] text-white border-[#2F6BDE]'
                                  : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-blue-400 dark:hover:border-blue-600'
                              }`}
                            >
                              <span className="leading-tight line-clamp-2">{st}</span>
                              {isSelected && <Check className="w-4 h-4 shrink-0" />}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {/* Seksi Garis Waktu Proyek */}
              <section className="space-y-4 pt-2 border-t border-slate-200 dark:border-slate-800">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <Clock className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                      <span>Garis Waktu Proyek</span>
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Alur tahapan produksi dari terima naskah hingga ACC cetak.
                    </p>
                  </div>

                  {/* Toggle Cetak Dummy */}
                  <div className="inline-flex items-center rounded-xl bg-slate-100 dark:bg-slate-800 p-1 border border-slate-200 dark:border-slate-700 self-start sm:self-auto">
                    <span className="px-2 text-xs font-semibold text-slate-500 dark:text-slate-400 inline-flex items-center gap-1">
                      <Printer className="w-3.5 h-3.5" />
                      <span>Dummy:</span>
                    </span>
                    {(
                      [
                        { key: 'tidak_ada', label: 'Off' },
                        { key: 'proses', label: 'Proses' },
                        { key: 'selesai', label: 'ACC' },
                      ] as const
                    ).map((opt) => (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() => setDraftDummyStatus(opt.key)}
                        className={`min-h-[44px] sm:min-h-[36px] px-3 py-1 rounded-lg text-xs font-bold transition-colors ${
                          draftDummyStatus === opt.key
                            ? opt.key === 'selesai'
                              ? 'bg-emerald-600 text-white'
                              : opt.key === 'proses'
                              ? 'bg-blue-600 text-white'
                              : 'bg-slate-800 text-white dark:bg-slate-100 dark:text-slate-900'
                            : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* MOBILE (< 768px): Garis waktu VERTIKAL */}
                <ol className="md:hidden space-y-0">
                  {timelineStages.map((st, idx) => {
                    const isDone = st.status === 'done';
                    const isCurrent = st.status === 'current';
                    const isOptional = st.status === 'optional';
                    const isLast = idx === timelineStages.length - 1;

                    return (
                      <li key={st.id} className="relative flex gap-3.5 pb-5 last:pb-0">
                        {!isLast && (
                          <span
                            aria-hidden="true"
                            className={`absolute left-4 top-9 bottom-0 w-0.5 -translate-x-1/2 ${
                              isDone
                                ? 'bg-emerald-500/50'
                                : 'bg-slate-200 dark:bg-slate-700'
                            }`}
                          />
                        )}
                        <div
                          className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs shrink-0 relative z-10 mt-0.5 ${
                            isDone
                              ? 'bg-emerald-600 text-white'
                              : isCurrent
                              ? 'bg-blue-600 text-white ring-4 ring-blue-100 dark:ring-blue-900/60'
                              : isOptional
                              ? 'bg-slate-100 dark:bg-slate-800 border border-dashed border-slate-300 dark:border-slate-600 text-slate-500 dark:text-slate-400'
                              : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                          }`}
                        >
                          {isDone ? <Check className="w-4 h-4" /> : <span>{idx + 1}</span>}
                        </div>
                        <div className="min-w-0 flex-1 pt-0.5">
                          <div
                            className={`text-sm font-bold ${
                              isCurrent
                                ? 'text-blue-600 dark:text-blue-400'
                                : isDone
                                ? 'text-slate-900 dark:text-white'
                                : 'text-slate-600 dark:text-slate-400'
                            }`}
                          >
                            {st.title}
                          </div>
                          <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                            {st.sub}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ol>

                {/* DESKTOP / TABLET (>= 768px): Garis waktu HORIZONTAL */}
                <div className="hidden md:block pt-2">
                  <div className="flex items-start relative">
                    <div className="absolute top-4 left-6 right-6 h-0.5 bg-slate-200 dark:bg-slate-700 z-0" />
                    {timelineStages.map((st, idx) => {
                      const isDone = st.status === 'done';
                      const isCurrent = st.status === 'current';
                      const isOptional = st.status === 'optional';

                      return (
                        <div
                          key={st.id}
                          className="flex-1 flex flex-col items-center text-center px-1.5 relative z-10"
                        >
                          <div
                            className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs mb-2 ${
                              isDone
                                ? 'bg-emerald-600 text-white'
                                : isCurrent
                                ? 'bg-blue-600 text-white ring-4 ring-blue-100 dark:ring-blue-900/60'
                                : isOptional
                                ? 'bg-slate-100 dark:bg-slate-800 border border-dashed border-slate-300 dark:border-slate-600 text-slate-500 dark:text-slate-400'
                                : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                            }`}
                          >
                            {isDone ? <Check className="w-4 h-4" /> : <span>{idx + 1}</span>}
                          </div>
                          <span
                            className={`text-xs font-bold leading-snug ${
                              isCurrent
                                ? 'text-blue-600 dark:text-blue-400'
                                : isDone
                                ? 'text-slate-900 dark:text-slate-100'
                                : 'text-slate-500 dark:text-slate-400'
                            }`}
                          >
                            {st.title}
                          </span>
                          <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-tight">
                            {st.sub}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </section>
            </div>
          )}

          {/* ---------------------------------------------------------------
              TAB 2: NASKAH
              --------------------------------------------------------------- */}
          {activeTab === 'naskah' && (
            <div className="space-y-8">
              {/* Seksi Kelengkapan Naskah (10 bagian + indikator otomatis Lengkap) */}
              <section className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
                  <div>
                    <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                      Kelengkapan Naskah
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Centang bagian naskah yang sudah diterima. Status Lengkap dihitung otomatis.
                    </p>
                  </div>

                  <div className="flex items-center gap-2.5 flex-wrap">
                    {/* Indikator hasil otomatis (bukan item centang) */}
                    <span
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold tabular-nums border ${
                        isAllKelengkapanChecked
                          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                          : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      {isAllKelengkapanChecked
                        ? 'Lengkap (10/10)'
                        : `${checkedKelengkapanCount}/10 Bagian`}
                    </span>

                    <button
                      type="button"
                      onClick={handleToggleAllKelengkapan}
                      className={`min-h-[44px] px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-colors flex items-center gap-2 ${
                        isAllKelengkapanChecked
                          ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                          : 'bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-200 text-white dark:text-slate-900'
                      }`}
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>{isAllKelengkapanChecked ? 'Batal Lengkap' : 'Tandai Lengkap'}</span>
                    </button>
                  </div>
                </div>

                {/* Grid 1 kolom HP kecil, 2 kolom HP besar/tablet, 3 kolom desktop */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                  {KELENGKAPAN_NASKAH_LIST.map((item) => {
                    const isChecked = draftKelengkapan.includes(item);
                    return (
                      <button
                        key={item}
                        type="button"
                        role="checkbox"
                        aria-checked={isChecked}
                        onClick={() => handleToggleKelengkapan(item)}
                        className={`min-h-[44px] px-3.5 py-2.5 rounded-xl text-left text-sm font-semibold border flex items-center justify-between gap-2 transition-colors ${
                          isChecked
                            ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 border-emerald-300 dark:border-emerald-800'
                            : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-300'
                        }`}
                      >
                        <span className="truncate">{item}</span>
                        {isChecked ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                        ) : (
                          <Circle className="w-4 h-4 text-slate-300 dark:text-slate-600 shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Saklar Ada Pertanyaan (terpisah dari 10 item kelengkapan, simpan otomatis) */}
                <div className="pt-2">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={draftAdaPertanyaan}
                    onClick={() => {
                      void handleToggleAdaPertanyaan();
                    }}
                    className={`w-full min-h-[48px] px-4 py-3 rounded-xl border flex items-center justify-between gap-3 text-left transition-colors ${
                      draftAdaPertanyaan
                        ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800'
                        : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    <div className="flex items-start gap-2.5 min-w-0">
                      <HelpCircle
                        className={`w-4 h-4 shrink-0 mt-0.5 ${
                          draftAdaPertanyaan
                            ? 'text-amber-600 dark:text-amber-400'
                            : 'text-slate-400'
                        }`}
                      />
                      <div className="min-w-0">
                        <span className="text-sm font-bold text-slate-900 dark:text-white block">
                          Ada Pertanyaan
                        </span>
                        <span className="text-xs text-slate-500 dark:text-slate-400 block">
                          Tandai bila masih ada pertanyaan yang menunggu konfirmasi penulis.
                        </span>
                      </div>
                    </div>

                    <span
                      className={`w-11 h-6 rounded-full p-0.5 transition-colors shrink-0 flex items-center ${
                        draftAdaPertanyaan
                          ? 'bg-amber-500 justify-end'
                          : 'bg-slate-300 dark:bg-slate-600 justify-start'
                      }`}
                    >
                      <span className="w-5 h-5 rounded-full bg-white shadow-xs" />
                    </span>
                  </button>
                </div>
              </section>

              {/* Seksi Identitas Naskah */}
              <section className="space-y-4 pt-4 border-t border-slate-200 dark:border-slate-800">
                <div>
                  <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                    Identitas Naskah
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Perubahan judul dan nama penulis akan otomatis memperbarui daftar buku dan faktur.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label
                      htmlFor="detail-judul-buku"
                      className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1.5"
                    >
                      Judul Buku
                    </label>
                    <input
                      id="detail-judul-buku"
                      type="text"
                      value={draftJudul}
                      onChange={(e) => setDraftJudul(e.target.value)}
                      placeholder="Masukkan judul buku lengkap..."
                      className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-base sm:text-sm font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 scroll-mb-24"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="detail-nama-penulis"
                      className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1.5"
                    >
                      Nama Penulis
                    </label>
                    <input
                      id="detail-nama-penulis"
                      type="text"
                      value={draftPenulis}
                      onChange={(e) => setDraftPenulis(e.target.value)}
                      placeholder="Nama penulis / penyusun..."
                      className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-base sm:text-sm font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 scroll-mb-24"
                    />
                  </div>
                </div>
              </section>
            </div>
          )}

          {/* ---------------------------------------------------------------
              TAB 3: PRODUKSI
              --------------------------------------------------------------- */}
          {activeTab === 'produksi' && (
            <div className="space-y-8">
              {/* Seksi Identitas Produksi & ISBN */}
              <section className="space-y-4">
                <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
                  <div>
                    <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                      Identitas Produksi &amp; ISBN
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Spesifikasi ukuran cetak, warna isi, kode produksi, dan status ISBN.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setIsEditingProduction((prev) => !prev)}
                    className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-blue-600 dark:text-blue-400 text-xs sm:text-sm font-bold inline-flex items-center gap-1.5 shrink-0 transition-colors"
                  >
                    <Edit3 className="w-4 h-4" />
                    <span>{isEditingProduction ? 'Selesai Ubah' : 'Ubah'}</span>
                  </button>
                </div>

                {isEditingProduction ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label
                          htmlFor="detail-kode-produksi"
                          className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1.5"
                        >
                          Kode Produksi
                        </label>
                        <input
                          id="detail-kode-produksi"
                          type="text"
                          value={draftKodeProduksi}
                          onChange={(e) => setDraftKodeProduksi(e.target.value)}
                          placeholder="PRD-2026-045"
                          className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-base sm:text-sm font-mono font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 scroll-mb-24"
                        />
                      </div>

                      <div>
                        <label
                          htmlFor="detail-nomor-isbn"
                          className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1.5"
                        >
                          Nomor ISBN
                        </label>
                        <input
                          id="detail-nomor-isbn"
                          type="text"
                          value={draftIsbn}
                          onChange={(e) => setDraftIsbn(e.target.value)}
                          placeholder="978-623-xxx-xxx-x"
                          className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-base sm:text-sm font-mono font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 scroll-mb-24"
                        />
                      </div>
                    </div>

                    <div>
                      <span className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1.5">
                        Status ISBN
                      </span>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        {(['Belum ada ISBN', 'Pengajuan ISBN', 'ISBN Terbit'] as StatusIsbnType[]).map(
                          (st) => (
                            <button
                              key={st}
                              type="button"
                              onClick={() => setDraftStatusIsbn(st)}
                              className={`min-h-[44px] px-3 py-2 rounded-xl text-xs sm:text-sm font-bold border transition-colors ${
                                draftStatusIsbn === st
                                  ? st === 'ISBN Terbit'
                                    ? 'bg-emerald-600 text-white border-emerald-600'
                                    : st === 'Pengajuan ISBN'
                                    ? 'bg-amber-600 text-white border-amber-600'
                                    : 'bg-slate-900 text-white border-slate-900 dark:bg-white dark:text-slate-900'
                                  : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                              }`}
                            >
                              {st}
                            </button>
                          )
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label
                          htmlFor="detail-ukuran-buku"
                          className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1.5"
                        >
                          Ukuran Buku
                        </label>
                        <select
                          id="detail-ukuran-buku"
                          value={
                            isCustomUkuranMode || !UKURAN_BUKU_LIST.includes(draftUkuranBuku)
                              ? '__custom__'
                              : draftUkuranBuku
                          }
                          onChange={(e) => {
                            const val = e.target.value;
                            if (val === '__custom__') {
                              setIsCustomUkuranMode(true);
                              if (UKURAN_BUKU_LIST.includes(draftUkuranBuku)) {
                                setDraftUkuranBuku('');
                              }
                            } else {
                              setIsCustomUkuranMode(false);
                              setDraftUkuranBuku(val);
                            }
                          }}
                          className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-base sm:text-sm font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                        >
                          {UKURAN_BUKU_LIST.map((uk) => (
                            <option key={uk} value={uk}>
                              {uk}
                            </option>
                          ))}
                          <option value="__custom__">Custom...</option>
                        </select>
                        {(isCustomUkuranMode || !UKURAN_BUKU_LIST.includes(draftUkuranBuku)) && (
                          <input
                            type="text"
                            value={draftUkuranBuku}
                            onChange={(e) => setDraftUkuranBuku(e.target.value)}
                            placeholder="mis. 17,5x25"
                            className="mt-2 w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-white dark:bg-slate-900 border border-blue-400 text-base sm:text-sm font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        )}
                      </div>

                      <div>
                        <span className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1.5">
                          Halaman Warna
                        </span>
                        <div className="grid grid-cols-3 gap-2">
                          {(['BW', 'Half BW', 'Full Color'] as HalamanWarnaType[]).map((mode) => (
                            <button
                              key={mode}
                              type="button"
                              onClick={() => setDraftHalamanWarna(mode)}
                              className={`min-h-[44px] px-2.5 py-2 rounded-xl text-xs sm:text-sm font-bold border transition-colors ${
                                draftHalamanWarna === mode
                                  ? 'bg-blue-600 text-white border-blue-600'
                                  : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                              }`}
                            >
                              {mode}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                      <div>
                        <label
                          htmlFor="detail-catatan-biaya"
                          className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1.5"
                        >
                          Note Tambahan Biaya
                        </label>
                        <input
                          id="detail-catatan-biaya"
                          type="text"
                          value={draftCatatanBiaya}
                          onChange={(e) => setDraftCatatanBiaya(e.target.value)}
                          placeholder='Contoh: all clear / +350rb cetak cover...'
                          className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-base sm:text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>

                      <div>
                        <label
                          htmlFor="detail-catatan-lain"
                          className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1.5"
                        >
                          Catatan Lain
                        </label>
                        <input
                          id="detail-catatan-lain"
                          type="text"
                          value={draftCatatanLain}
                          onChange={(e) => setDraftCatatanLain(e.target.value)}
                          placeholder="Misal: cet 2 - acc cetak..."
                          className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-base sm:text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  /* Daftar label-nilai rapi tanpa kartu bersarang */
                  <dl className="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50/40 dark:bg-slate-800/20">
                    <div className="px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                      <dt className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                        Kode Produksi
                      </dt>
                      <dd className="text-sm font-mono font-bold text-slate-900 dark:text-white">
                        {draftKodeProduksi}
                      </dd>
                    </div>
                    <div className="px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                      <dt className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                        Nomor ISBN
                      </dt>
                      <dd className="text-sm font-mono font-bold text-slate-900 dark:text-white">
                        {draftIsbn || 'Belum diisi'}
                      </dd>
                    </div>
                    <div className="px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                      <dt className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                        Status ISBN
                      </dt>
                      <dd className="text-sm font-bold text-slate-900 dark:text-white">
                        {draftStatusIsbn}
                      </dd>
                    </div>
                    <div className="px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                      <dt className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                        Ukuran Buku
                      </dt>
                      <dd className="text-sm font-bold text-slate-900 dark:text-white">
                        {draftUkuranBuku}
                      </dd>
                    </div>
                    <div className="px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                      <dt className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                        Warna Isi
                      </dt>
                      <dd className="text-sm font-bold text-slate-900 dark:text-white">
                        {draftHalamanWarna}
                      </dd>
                    </div>
                    <div className="px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                      <dt className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                        Note Tambahan Biaya
                      </dt>
                      <dd className="text-sm font-bold text-slate-900 dark:text-white">
                        {draftCatatanBiaya.trim().toLowerCase() === 'all clear' ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                            All clear
                          </span>
                        ) : (
                          draftCatatanBiaya || '-'
                        )}
                      </dd>
                    </div>
                    <div className="px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                      <dt className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                        Catatan Lain
                      </dt>
                      <dd className="text-sm font-medium text-slate-900 dark:text-white">
                        {draftCatatanLain || '-'}
                      </dd>
                    </div>
                    {book.customFields &&
                      Object.entries(book.customFields).map(([k, v]) => (
                        <div
                          key={k}
                          className="px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-1"
                        >
                          <dt className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                            {k}
                          </dt>
                          <dd className="text-sm font-semibold text-slate-900 dark:text-white">
                            {v ?? '-'}
                          </dd>
                        </div>
                      ))}
                  </dl>
                )}
              </section>

              {/* Seksi Total Halaman */}
              <section className="space-y-4 pt-4 border-t border-slate-200 dark:border-slate-800">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                      Total Halaman
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Perbandingan jumlah halaman final terhadap estimasi awal naskah.
                    </p>
                  </div>

                  {!isEditingHalaman && (
                    <button
                      type="button"
                      onClick={() => setIsEditingHalaman(true)}
                      className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-blue-600 dark:text-blue-400 text-xs sm:text-sm font-bold inline-flex items-center gap-1.5 shrink-0 transition-colors"
                    >
                      <Edit3 className="w-4 h-4" />
                      <span>Ubah Halaman</span>
                    </button>
                  )}
                </div>

                {isEditingHalaman ? (
                  <form onSubmit={handleApplyHalaman} className="space-y-3">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const val = Math.max(1, (parseInt(halamanInput, 10) || 1) - 2);
                          setHalamanInput(String(val));
                        }}
                        className="min-w-[44px] min-h-[44px] rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 font-bold text-base flex items-center justify-center hover:bg-slate-200 dark:hover:bg-slate-700"
                        aria-label="Kurangi 2 halaman"
                      >
                        -
                      </button>

                      <input
                        type="number"
                        inputMode="numeric"
                        min={1}
                        value={halamanInput}
                        onChange={(e) => setHalamanInput(e.target.value)}
                        className="w-28 min-h-[44px] text-center px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-blue-500 font-extrabold text-base text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 tabular-nums scroll-mb-24"
                        autoFocus
                      />

                      <button
                        type="button"
                        onClick={() => {
                          const val = (parseInt(halamanInput, 10) || 1) + 2;
                          setHalamanInput(String(val));
                        }}
                        className="min-w-[44px] min-h-[44px] rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 font-bold text-base flex items-center justify-center hover:bg-slate-200 dark:hover:bg-slate-700"
                        aria-label="Tambah 2 halaman"
                      >
                        +
                      </button>
                      <span className="text-sm text-slate-500 dark:text-slate-400 font-medium">
                        hlm.
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="submit"
                        className="min-h-[44px] px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-bold inline-flex items-center gap-1.5"
                      >
                        <Check className="w-4 h-4" />
                        <span>Terapkan</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setHalamanInput(String(draftHalamanFinal));
                          setIsEditingHalaman(false);
                        }}
                        className="min-h-[44px] px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs sm:text-sm font-semibold"
                      >
                        Batal
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="text-3xl font-black text-slate-900 dark:text-white tabular-nums">
                      {draftHalamanFinal} hlm.
                    </span>
                    <span className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 font-medium tabular-nums">
                      {halamanDiff !== 0 ? (
                        <>
                          <strong
                            className={
                              halamanDiff > 0
                                ? 'text-blue-600 dark:text-blue-400'
                                : 'text-emerald-600 dark:text-emerald-400'
                            }
                          >
                            {halamanDiff > 0 ? `+${halamanDiff}` : halamanDiff}
                          </strong>{' '}
                          dari estimasi {book.halamanAwal} hlm.
                        </>
                      ) : (
                        <>Sesuai estimasi awal {book.halamanAwal} hlm.</>
                      )}
                    </span>
                  </div>
                )}
              </section>

              {/* Seksi Layout Awal & Tanggal Terima Naskah */}
              <section className="space-y-4 pt-4 border-t border-slate-200 dark:border-slate-800">
                <div>
                  <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                    Waktu Pengerjaan &amp; Tanggal Terima
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Lama layout awal serta tanggal naskah diterima.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-800/20 flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                      Lama Layout Awal
                    </span>
                    <span className="text-base font-extrabold text-slate-900 dark:text-white tabular-nums">
                      {book.lamaLayoutAwal} hari
                    </span>
                  </div>

                  <div>
                    <label
                      htmlFor="detail-tgl-terima"
                      className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1.5"
                    >
                      Tanggal Terima Naskah
                    </label>
                    <input
                      id="detail-tgl-terima"
                      type="date"
                      value={draftTglTerima}
                      onChange={(e) => setDraftTglTerima(e.target.value)}
                      className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-base sm:text-sm font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 scroll-mb-24"
                    />
                  </div>
                </div>
              </section>
            </div>
          )}

          {/* ---------------------------------------------------------------
              TAB 4: CATATAN (Log Catatan Per Buku — Firestore users/{uid}/logs)
              --------------------------------------------------------------- */}
          {activeTab === 'catatan' && (
            <div className="space-y-6">
              {/* KETIK CEPAT + Form Lebih Rinci (collapsible) */}
              <div className="space-y-3 pb-5 border-b border-slate-200 dark:border-slate-800">
                <form onSubmit={handleQuickLogSubmit} className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <label
                      htmlFor="detail-quick-log"
                      className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5"
                    >
                      <Zap className="w-4 h-4 text-amber-500" />
                      <span>Ketik Cepat Catatan</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => setIsDetailLogFormOpen((prev) => !prev)}
                      className="min-h-[36px] px-2.5 py-1 rounded-lg text-xs font-bold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/50 inline-flex items-center gap-1 transition-colors"
                    >
                      <span>Lebih rinci</span>
                      {isDetailLogFormOpen ? (
                        <ChevronUp className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      id="detail-quick-log"
                      type="text"
                      value={quickLogInput}
                      onChange={(e) => setQuickLogInput(e.target.value)}
                      placeholder="Ketik cepat, mis. ER // baru masuk koreksi 1"
                      disabled={isQuickSubmitting || !onCreateBookLog}
                      className="flex-1 min-h-[44px] px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-base sm:text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      type="submit"
                      disabled={!quickLogInput.trim() || !quickLogParsed.isi || isQuickSubmitting || !onCreateBookLog}
                      className="min-h-[44px] min-w-[44px] px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-xs sm:text-sm font-bold inline-flex items-center justify-center gap-1.5 shrink-0 transition-colors"
                      aria-label="Kirim ketik cepat"
                    >
                      <Send className="w-4 h-4" />
                      <span className="hidden sm:inline">Kirim</span>
                    </button>
                  </div>

                  {quickLogInput.trim() !== '' ? (
                    <div className="flex flex-wrap items-center gap-1.5 px-1 text-xs">
                      <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                        Pratinjau:
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-md text-[11px] font-bold border ${
                          quickLogParsed.dari
                            ? getLogDariBadgeConfig(quickLogParsed.dari)
                            : 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700'
                        }`}
                      >
                        {quickLogParsed.dari || 'Tanpa pengirim'}
                      </span>
                      <span className="text-slate-400">·</span>
                      {(() => {
                        const jBadge = getLogJenisBadgeConfig(quickLogParsed.jenis);
                        return (
                          <span
                            className={`px-2 py-0.5 rounded-md text-[11px] font-bold border ${jBadge.bg} ${jBadge.text} ${jBadge.border}`}
                          >
                            {quickLogParsed.jenis}
                          </span>
                        );
                      })()}
                      <span className="text-slate-600 dark:text-slate-300 truncate max-w-full">
                        {quickLogParsed.isi}
                      </span>
                    </div>
                  ) : (
                    <p className="text-[11px] text-slate-400 dark:text-slate-500 px-0.5">
                      Kode cepat: DariJenis // isi (mis. ER // koreksi 1, P // teks) — Dari (P=Penulis, E=Editor, N=Penerbit, S=Saya, C=Coped, K=Korektor, -=kosong) · Jenis (P=Pertanyaan, R=Revisi, T=Tambahan naskah, M=Masalah, I=Info, -=Info)
                    </p>
                  )}
                </form>

                {/* Form Lengkap (Collapsible "Lebih rinci") */}
                {isDetailLogFormOpen && (
                  <form
                    onSubmit={handleSubmitBookLog}
                    className="space-y-4 pt-3 mt-2 border-t border-slate-100 dark:border-slate-800"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <h3 className="text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-2">
                        <MessageSquareText className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                        <span>Form Catatan Lengkap</span>
                      </h3>
                      <div className="flex items-center gap-2">
                        <label htmlFor="detail-log-tanggal" className="text-xs font-semibold text-slate-500">
                          Tanggal:
                        </label>
                        <input
                          id="detail-log-tanggal"
                          type="date"
                          value={logTanggal}
                          onChange={(e) => setLogTanggal(e.target.value)}
                          className="min-h-[44px] sm:min-h-[38px] px-2.5 py-1 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-base sm:text-xs font-semibold text-slate-900 dark:text-white"
                        />
                      </div>
                    </div>

                    {/* Baris Chip Dari (Single-Select + Tanpa pengirim + Lainnya...) */}
                    <div className="space-y-1.5">
                      <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                        Dari:
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          onClick={() => setLogDariChip('')}
                          className={`min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors ${
                            logDariChip === ''
                              ? 'bg-blue-600 text-white border-blue-600'
                              : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                          }`}
                        >
                          Tanpa pengirim
                        </button>
                        {LOG_DARI_SUGGESTIONS.map((item) => {
                          const active = logDariChip === item;
                          return (
                            <button
                              key={item}
                              type="button"
                              onClick={() => setLogDariChip(item)}
                              className={`min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors ${
                                active
                                  ? 'bg-blue-600 text-white border-blue-600'
                                  : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                              }`}
                            >
                              {item}
                            </button>
                          );
                        })}
                        <button
                          type="button"
                          onClick={() => setLogDariChip('__custom__')}
                          className={`min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors ${
                            logDariChip === '__custom__'
                              ? 'bg-blue-600 text-white border-blue-600'
                              : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                          }`}
                        >
                          Lainnya...
                        </button>
                      </div>
                      {logDariChip === '__custom__' && (
                        <input
                          type="text"
                          value={logDariCustom}
                          onChange={(e) => setLogDariCustom(e.target.value)}
                          placeholder="Ketik nama pengirim (misal: Editor Kampus)..."
                          className="mt-2 w-full min-h-[44px] px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-blue-400 text-base sm:text-xs font-semibold text-slate-900 dark:text-white"
                        />
                      )}
                    </div>

                    {/* Segmented Control Jenis (5 pilihan terbungkus rapi di HP) */}
                    <div className="space-y-1.5">
                      <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                        Jenis:
                      </span>
                      <div className="flex flex-wrap gap-1.5 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
                        {LOG_JENIS_OPTIONS.map((opt) => (
                          <button
                            key={opt}
                            type="button"
                            onClick={() => setLogJenis(opt)}
                            className={`flex-1 min-w-[96px] min-h-[38px] px-2.5 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                              logJenis === opt
                                ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs'
                                : 'text-slate-600 dark:text-slate-300'
                            }`}
                          >
                            {opt}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <textarea
                        id="detail-catatan-baru"
                        value={logIsi}
                        onChange={(e) => setLogIsi(e.target.value)}
                        placeholder="Tulis isi catatan / revisi / pertanyaan untuk buku ini..."
                        rows={3}
                        className="w-full p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800 text-base sm:text-sm text-slate-900 dark:text-white placeholder:text-slate-400 border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 scroll-mb-24"
                      />
                    </div>

                    <div className="flex justify-end">
                      <button
                        type="submit"
                        disabled={!logIsi.trim() || isSubmittingLog || !onCreateBookLog}
                        className="w-full sm:w-auto min-h-[44px] px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white font-bold text-xs sm:text-sm transition-colors inline-flex items-center justify-center gap-2"
                      >
                        <Send className="w-4 h-4" />
                        <span>{isSubmittingLog ? 'Menyimpan...' : 'Tambah Catatan'}</span>
                      </button>
                    </div>
                  </form>
                )}
              </div>

              {/* Sub-tabs [Baru] [Semua] + Tandai semua selesai */}
              <section className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="inline-flex items-center p-1 rounded-xl bg-slate-100 dark:bg-slate-800 gap-1">
                    <button
                      type="button"
                      onClick={() => setLogSubTab('Baru')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 transition-colors ${
                        logSubTab === 'Baru'
                          ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs'
                          : 'text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      <span>Baru</span>
                      <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-orange-500 text-white">
                        {bookLogsBaruCount}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setLogSubTab('Semua')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 transition-colors ${
                        logSubTab === 'Semua'
                          ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs'
                          : 'text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      <span>Semua</span>
                      <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200">
                        {sortedBookLogs.length}
                      </span>
                    </button>
                  </div>

                  {bookLogsBaruCount > 0 && onMarkAllBookLogsDone && (
                    <button
                      type="button"
                      onClick={() => {
                        const baruIds = sortedBookLogs
                          .filter((l) => l.status === 'Baru' && l.id)
                          .map((l) => l.id as string);
                        void onMarkAllBookLogsDone(baruIds);
                      }}
                      className="min-h-[38px] px-3 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 hover:bg-emerald-100 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 text-xs font-bold inline-flex items-center gap-1.5"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Tandai semua selesai</span>
                    </button>
                  )}
                </div>

                {(() => {
                  const baseList =
                    logSubTab === 'Baru'
                      ? sortedBookLogs.filter((l) => l.status === 'Baru')
                      : sortedBookLogs;
                  const activeRows =
                    logSubTab === 'Semua'
                      ? baseList.filter((l) => l.dari.trim().toLowerCase() !== 'lama')
                      : baseList;
                  const legacyRows =
                    logSubTab === 'Semua'
                      ? baseList.filter((l) => l.dari.trim().toLowerCase() === 'lama')
                      : [];

                  const renderBookLogRow = (log: BookLog) => {
                    const isBaru = log.status === 'Baru';
                    const hasDari = Boolean(log.dari && log.dari.trim() !== '');
                    const jenisBadge = getLogJenisBadgeConfig(log.jenis);
                    const dariBadge = getLogDariBadgeConfig(log.dari);
                    const highlightBorder =
                      log.jenis === 'Masalah' && isBaru
                        ? 'border-l-4 border-l-rose-500'
                        : isBaru
                        ? 'border-l-4 border-l-orange-500'
                        : '';
                    const isConfirming = confirmDeleteLogId === log.id;

                    return (
                      <div
                        key={log.id}
                        className={`p-3.5 bg-white dark:bg-slate-900 space-y-2 ${highlightBorder}`}
                      >
                        <div className="flex items-start justify-between gap-2.5">
                          <div className="min-w-0 flex-1 space-y-1.5">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                                {formatLogDateShort(log.tanggal)}
                              </span>
                              {hasDari && (
                                <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${dariBadge}`}>
                                  {log.dari}
                                </span>
                              )}
                              <span
                                className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${jenisBadge.bg} ${jenisBadge.text} ${jenisBadge.border}`}
                              >
                                {log.jenis}
                              </span>
                            </div>
                            <p className="text-xs sm:text-sm text-slate-800 dark:text-slate-100 leading-relaxed whitespace-pre-wrap">
                              {log.isi}
                            </p>
                          </div>

                          <div className="flex items-center gap-1 shrink-0" data-detail-log-menu>
                            {onToggleBookLogStatus && (
                              <button
                                type="button"
                                onClick={() => void onToggleBookLogStatus(log)}
                                className={`min-h-[34px] px-2.5 py-1 rounded-full text-[11px] font-bold border transition-colors ${
                                  isBaru
                                    ? 'bg-orange-50 text-orange-700 border-orange-200 hover:bg-orange-100 dark:bg-orange-950/60 dark:text-orange-300 dark:border-orange-800'
                                    : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800'
                                }`}
                              >
                                {log.status}
                              </button>
                            )}

                            <div className="relative">
                              <button
                                type="button"
                                onClick={() =>
                                  setOpenLogMenuId(openLogMenuId === log.id ? null : log.id || null)
                                }
                                className="min-w-[34px] min-h-[34px] rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center"
                                aria-label="Menu log"
                              >
                                <MoreVertical className="w-4 h-4" />
                              </button>

                              {openLogMenuId === log.id && (
                                <div className="absolute right-0 mt-1 w-32 bg-white dark:bg-slate-900 rounded-xl shadow-xl border border-slate-200 dark:border-slate-800 py-1 z-30">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setOpenLogMenuId(null);
                                      setEditingLogModal(log);
                                    }}
                                    className="w-full px-3 py-2 text-left text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2"
                                  >
                                    <Edit3 className="w-3.5 h-3.5 text-blue-600" />
                                    <span>Edit</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setOpenLogMenuId(null);
                                      setConfirmDeleteLogId(log.id || null);
                                    }}
                                    className="w-full px-3 py-2 text-left text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 flex items-center gap-2"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                    <span>Hapus</span>
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>

                        {isConfirming && (
                          <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800">
                            <span className="text-xs font-bold text-rose-800 dark:text-rose-200">
                              Hapus catatan ini?
                            </span>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={async () => {
                                  if (onDeleteBookLog) await onDeleteBookLog(log);
                                  setConfirmDeleteLogId(null);
                                }}
                                className="min-h-[36px] px-3 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold"
                              >
                                Ya, Hapus
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteLogId(null)}
                                className="min-h-[36px] px-3 py-1 rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-semibold"
                              >
                                Batal
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  };

                  if (activeRows.length === 0 && legacyRows.length === 0) {
                    return (
                      <div className="py-10 px-4 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 text-center space-y-1.5">
                        <p className="text-sm font-bold text-slate-700 dark:text-slate-300">
                          {logSubTab === 'Baru'
                            ? 'Tidak Ada Catatan Baru'
                            : 'Belum Ada Catatan Log'}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {logSubTab === 'Baru'
                            ? 'Semua catatan untuk buku ini sudah ditandai selesai.'
                            : 'Tambahkan catatan revisi, pertanyaan, atau informasi baru di atas.'}
                        </p>
                      </div>
                    );
                  }

                  return (
                    <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden divide-y divide-slate-200 dark:divide-slate-800">
                      {activeRows.map(renderBookLogRow)}

                      {legacyRows.length > 0 && (
                        <div>
                          <button
                            type="button"
                            onClick={() => setShowLegacyLogs((prev) => !prev)}
                            className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800/40 text-left text-xs font-bold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 flex items-center gap-2"
                          >
                            <History className="w-3.5 h-3.5" />
                            <span>
                              Riwayat lama ({legacyRows.length}) — {showLegacyLogs ? 'Sembunyikan' : 'Tampilkan'}
                            </span>
                          </button>
                          {showLegacyLogs && (
                            <div className="divide-y divide-slate-200 dark:divide-slate-800 border-t border-slate-200 dark:border-slate-800">
                              {legacyRows.map(renderBookLogRow)}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </section>
            </div>
          )}

          {/* =================================================================
              FOOTER HALAMAN NON-STICKY (Update terakhir, Tgl terima, Hapus Buku)
              ================================================================= */}
          <footer className="pt-6 mt-6 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <span>Update terakhir: {formatDateIndo(book.updateTerakhir)}</span>
              <span>Tgl terima naskah: {formatDateIndo(draftTglTerima || book.tglTerima)}</span>
            </div>

            <div>
              {confirmDeleteBook ? (
                <div className="flex flex-wrap items-center gap-2 p-2 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800">
                  <span className="text-xs font-bold text-rose-700 dark:text-rose-300 px-1">
                    {sortedBookLogs.length > 0
                      ? `Buku ini punya ${sortedBookLogs.length} catatan log. Hapus semua?`
                      : 'Hapus buku ini?'}
                  </span>
                  <button
                    type="button"
                    disabled={isDeletingBook}
                    onClick={handleConfirmDeleteBook}
                    className="min-h-[44px] px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold disabled:opacity-50"
                  >
                    {isDeletingBook ? 'Menghapus...' : 'Ya, Hapus'}
                  </button>
                  <button
                    type="button"
                    disabled={isDeletingBook}
                    onClick={() => setConfirmDeleteBook(false)}
                    className="min-h-[44px] px-3.5 py-1.5 rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold"
                  >
                    Batal
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmDeleteBook(true)}
                  className="min-h-[44px] px-3 py-2 rounded-xl text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 font-bold text-xs inline-flex items-center gap-1.5 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Hapus Buku</span>
                </button>
              )}
            </div>
          </footer>
        </main>

        {/* =================================================================
            3. BAR AKSI STICKY DI BAWAH (Dengan safe-area padding HP)
            ================================================================= */}
        <div
          style={{
            paddingBottom: 'calc(0.625rem + env(safe-area-inset-bottom, 0px))',
          }}
          className="sticky bottom-0 z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 px-4 sm:px-6 pt-2.5 lg:rounded-b-2xl flex items-center justify-between gap-3"
        >
          <div className="min-w-0 text-xs sm:text-sm font-semibold">
            {saveState === 'saving' ? (
              <span className="text-blue-600 dark:text-blue-400">Menyimpan...</span>
            ) : saveState === 'error' ? (
              <span className="text-rose-600 dark:text-rose-400">
                Gagal menyimpan, coba lagi
              </span>
            ) : hasChanges ? (
              <span className="text-amber-600 dark:text-amber-400">Belum disimpan</span>
            ) : (
              <span className="text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>Tersimpan</span>
              </span>
            )}
          </div>

          <button
            type="button"
            disabled={!hasChanges || saveState === 'saving'}
            onClick={performSave}
            className="min-h-[44px] px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400 dark:disabled:bg-slate-800 dark:disabled:text-slate-500 text-white font-bold text-xs sm:text-sm transition-colors inline-flex items-center justify-center gap-2 shrink-0"
          >
            <Save className="w-4 h-4" />
            <span>{saveState === 'saving' ? 'Menyimpan...' : 'Simpan'}</span>
          </button>
        </div>
      </div>

      {/* ===================================================================
          DIALOG KONFIRMASI KEMBALI SAAT ADA PERUBAHAN BELUM DISIMPAN (3 PILIHAN)
          =================================================================== */}
      {showUnsavedDialog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-labelledby="unsaved-dialog-title"
        >
          <div className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl p-6 space-y-4">
            <div className="space-y-1.5">
              <h2
                id="unsaved-dialog-title"
                className="text-base font-extrabold text-slate-900 dark:text-white"
              >
                Perubahan Belum Disimpan
              </h2>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                Anda memiliki perubahan yang belum disimpan pada buku ini. Apa yang ingin Anda lakukan?
              </p>
            </div>

            <div className="flex flex-col gap-2 pt-1">
              <button
                type="button"
                disabled={saveState === 'saving'}
                onClick={handleSaveAndBack}
                className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold transition-colors disabled:opacity-50"
              >
                {saveState === 'saving' ? 'Menyimpan...' : 'Simpan'}
              </button>

              <button
                type="button"
                disabled={saveState === 'saving'}
                onClick={handleDiscardAndBack}
                className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 text-sm font-bold transition-colors"
              >
                Buang perubahan
              </button>

              <button
                type="button"
                disabled={saveState === 'saving'}
                onClick={() => setShowUnsavedDialog(false)}
                className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-sm font-semibold transition-colors"
              >
                Batal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Edit Log dari Tab Catatan Detail Buku */}
      {book && editingLogModal && onUpdateBookLog && (
        <LogFormModal
          isOpen={true}
          onClose={() => setEditingLogModal(null)}
          books={[book]}
          initialBookId={book.id}
          editingLog={editingLogModal}
          onSubmit={async (data) => {
            await onUpdateBookLog(editingLogModal, {
              bookId: data.bookId,
              bookNo: data.bookNo,
              tanggal: data.tanggal,
              dari: data.dari,
              isi: data.isi,
              jenis: data.jenis,
              status: data.status,
            });
          }}
        />
      )}
    </div>
  );
};
