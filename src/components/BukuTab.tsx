import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  Search,
  SlidersHorizontal,
  X,
  AlertTriangle,
  Clock,
  ArrowUpDown,
  BookOpen,
  BookPlus,
  Upload,
  LayoutList,
  LayoutGrid,
  MoreVertical,
  StickyNote,
  MessageSquareText,
  HelpCircle,
  Check,
  ExternalLink,
  RefreshCw,
} from 'lucide-react';
import { BookJob, BookLog, StatusProgresType } from '../types';
import {
  DEFAULT_BATAS_HARI_TERLAMBAT,
  DEFAULT_STATUS_DI_SAYA,
  DEFAULT_STATUS_SELESAI,
  KATEGORI_BUKU_LIST,
  PAKET_LIST,
  STATUS_GROUPS,
  StatusGroupKey,
  UKURAN_BUKU_LIST,
  countBooksDiSaya,
  getStatusGroupMeta,
  isActiveBookDiSaya,
  isBookDiSaya,
  isStatusSelesai,
  resolveStatusGroup,
} from '../config/masterData';
import { getPaketBadge } from '../utils/formatters';
import { buildCombinedStatusList, computeDaysInStatus } from '../utils/bookHelpers';
import { BookLogSummary, summarizeBookLogs } from '../utils/logHelpers';
import { AddBookModal } from './AddBookModal';

export type BukuGroupFilter = 'semua' | StatusGroupKey;
export type BukuPaymentFilter = 'semua' | 'belum_ditagih' | 'sudah_ditagih' | 'lunas';
export type BukuSortOption = 'no' | 'updateDesc' | 'lamaStatusDesc' | 'judulAsc';

export interface BukuNavigationPreset {
  group?: BukuGroupFilter;
  diSayaOnly?: boolean;
  stuckOnly?: boolean;
  adaPertanyaanOnly?: boolean;
  activeOnly?: boolean;
  siapDitagihOnly?: boolean;
  perluPerhatianOnly?: boolean;
  status?: string;
  payment?: BukuPaymentFilter;
}

interface BukuTabProps {
  books: BookJob[];
  logs?: BookLog[];
  customStatuses?: string[];
  statusGroupOverrides?: Record<string, StatusGroupKey>;
  statusDiSaya?: string[];
  statusSelesai?: string;
  batasHariTerlambat?: number;
  bukuViewMode?: 'daftar' | 'kartu';
  onBukuViewModeChange?: (mode: 'daftar' | 'kartu') => void;
  onSelectBook: (book: BookJob) => void;
  onAddNewBook?: (newBook: Omit<BookJob, 'no'>) => void;
  onOpenImport?: () => void;
  onQuickStatusChange?: (book: BookJob, nextStatus: StatusProgresType) => void;
  initialStatusFilter?: string | null;
  onClearInitialStatusFilter?: () => void;
  navigationPreset?: BukuNavigationPreset | null;
  onClearNavigationPreset?: () => void;
}

const VALID_GROUP_HASHES: BukuGroupFilter[] = ['semua', 'awal', 'progres', 'masalah', 'finish'];

function parseGroupFromHash(): BukuGroupFilter | null {
  if (typeof window === 'undefined') return null;
  const raw = window.location.hash.replace(/^#/, '').toLowerCase() as BukuGroupFilter;
  return VALID_GROUP_HASHES.includes(raw) ? raw : null;
}

export const BukuTab: React.FC<BukuTabProps> = ({
  books,
  logs = [],
  customStatuses = [],
  statusGroupOverrides = {},
  statusDiSaya = [...DEFAULT_STATUS_DI_SAYA],
  statusSelesai = DEFAULT_STATUS_SELESAI,
  batasHariTerlambat = DEFAULT_BATAS_HARI_TERLAMBAT,
  bukuViewMode,
  onBukuViewModeChange,
  onSelectBook,
  onAddNewBook,
  onOpenImport,
  onQuickStatusChange,
  initialStatusFilter,
  onClearInitialStatusFilter,
  navigationPreset,
  onClearNavigationPreset,
}) => {
  // View mode: Daftar di desktop, Kartu di HP bila belum ada preferensi akun
  const [localViewMode, setLocalViewMode] = useState<'daftar' | 'kartu'>(() => {
    if (bukuViewMode) return bukuViewMode;
    if (typeof window !== 'undefined' && window.innerWidth < 768) return 'kartu';
    return 'daftar';
  });

  useEffect(() => {
    if (bukuViewMode) {
      setLocalViewMode(bukuViewMode);
    }
  }, [bukuViewMode]);

  const handleToggleViewMode = (mode: 'daftar' | 'kartu') => {
    setLocalViewMode(mode);
    onBukuViewModeChange?.(mode);
  };

  // Group & Status filters
  const [selectedGroup, setSelectedGroup] = useState<BukuGroupFilter>(() => parseGroupFromHash() || 'semua');
  const [selectedStatusInGroup, setSelectedStatusInGroup] = useState<string>('Semua');
  const [showSelesai, setShowSelesai] = useState<boolean>(false);
  const [diSayaOnly, setDiSayaOnly] = useState<boolean>(false);

  // Search & Sort
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortBy, setSortBy] = useState<BukuSortOption>('no');

  // Panel Filter applied state
  const [selectedPaket, setSelectedPaket] = useState<string>('Semua');
  const [selectedKategori, setSelectedKategori] = useState<string>('Semua');
  const [selectedUkuran, setSelectedUkuran] = useState<string>('Semua');
  const [stuckOnly, setStuckOnly] = useState<boolean>(false);
  const [adaPertanyaanOnly, setAdaPertanyaanOnly] = useState<boolean>(false);
  const [selectedPayment, setSelectedPayment] = useState<BukuPaymentFilter>('semua');

  // Hidden preset flags from Dashboard (always rendered as removable chips!)
  const [activeOnly, setActiveOnly] = useState<boolean>(false);
  const [siapDitagihOnly, setSiapDitagihOnly] = useState<boolean>(false);
  const [perluPerhatianOnly, setPerluPerhatianOnly] = useState<boolean>(false);

  // Panel Filter draft state (Popover desktop / Bottom sheet HP)
  const [isFilterOpen, setIsFilterOpen] = useState<boolean>(false);
  const [draftPaket, setDraftPaket] = useState<string>('Semua');
  const [draftKategori, setDraftKategori] = useState<string>('Semua');
  const [draftUkuran, setDraftUkuran] = useState<string>('Semua');
  const [draftStuckOnly, setDraftStuckOnly] = useState<boolean>(false);
  const [draftAdaPertanyaanOnly, setDraftAdaPertanyaanOnly] = useState<boolean>(false);
  const [draftPayment, setDraftPayment] = useState<BukuPaymentFilter>('semua');
  const filterContainerRef = useRef<HTMLDivElement>(null);

  // Pagination (20 buku dulu + Muat lebih banyak)
  const [visibleLimit, setVisibleLimit] = useState<number>(20);

  // Modal Tambah Buku & Menu Titik Tiga
  const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false);
  const [openMenuBookKey, setOpenMenuBookKey] = useState<string | null>(null);
  const [quickStatusModalBook, setQuickStatusModalBook] = useState<BookJob | null>(null);

  // Sync URL hash <-> selectedGroup
  useEffect(() => {
    const onHashChange = () => {
      const parsed = parseGroupFromHash();
      if (parsed) {
        setSelectedGroup(parsed);
        setSelectedStatusInGroup('Semua');
      }
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const selectGroupWithHash = (group: BukuGroupFilter) => {
    setSelectedGroup(group);
    setSelectedStatusInGroup('Semua');
    if (typeof window !== 'undefined') {
      window.history.replaceState(
        window.history.state,
        '',
        `${window.location.pathname}#${group}`
      );
    }
  };

  // Apply external navigationPreset (from Dashboard KPIs / Perlu Tindakan / Donut / Aksi)
  useEffect(() => {
    if (!navigationPreset) return;
    setSearchQuery('');
    setSelectedStatusInGroup(navigationPreset.status || 'Semua');
    setSelectedPaket('Semua');
    setSelectedKategori('Semua');
    setSelectedUkuran('Semua');
    setStuckOnly(Boolean(navigationPreset.stuckOnly));
    setAdaPertanyaanOnly(Boolean(navigationPreset.adaPertanyaanOnly));
    setDiSayaOnly(Boolean(navigationPreset.diSayaOnly));
    setActiveOnly(Boolean(navigationPreset.activeOnly));
    setSiapDitagihOnly(Boolean(navigationPreset.siapDitagihOnly));
    setPerluPerhatianOnly(Boolean(navigationPreset.perluPerhatianOnly));
    setSelectedPayment(navigationPreset.payment || 'semua');

    const nextGroup = navigationPreset.group || 'semua';
    selectGroupWithHash(nextGroup);
    if (nextGroup === 'finish') {
      setShowSelesai(true);
    }
  }, [navigationPreset]);

  // Backwards-compatible initialStatusFilter
  useEffect(() => {
    if (!initialStatusFilter) return;
    if (initialStatusFilter === 'Stuck') {
      selectGroupWithHash('semua');
      setSelectedStatusInGroup('Semua');
      setStuckOnly(true);
      setActiveOnly(false);
      setSiapDitagihOnly(false);
      setPerluPerhatianOnly(false);
    } else if (initialStatusFilter === 'Masih Aktif') {
      selectGroupWithHash('semua');
      setSelectedStatusInGroup('Semua');
      setActiveOnly(true);
      setSiapDitagihOnly(false);
      setPerluPerhatianOnly(false);
    } else if (initialStatusFilter === 'Siap Ditagih') {
      selectGroupWithHash('finish');
      setShowSelesai(true);
      setSelectedStatusInGroup('Semua');
      setSiapDitagihOnly(true);
      setActiveOnly(false);
      setPerluPerhatianOnly(false);
    } else if (initialStatusFilter === 'Perlu Perhatian') {
      selectGroupWithHash('semua');
      setSelectedStatusInGroup('Semua');
      setPerluPerhatianOnly(true);
      setActiveOnly(false);
      setSiapDitagihOnly(false);
    } else if (initialStatusFilter !== 'Semua') {
      const grp = resolveStatusGroup(initialStatusFilter, statusGroupOverrides);
      selectGroupWithHash(grp);
      setSelectedStatusInGroup(initialStatusFilter);
      if (isStatusSelesai(initialStatusFilter, statusSelesai)) {
        setShowSelesai(true);
      }
    }
  }, [initialStatusFilter]);

  // Close popover & 3-dot menus on outside click
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (openMenuBookKey && !target.closest('[data-buku-menu]')) {
        setOpenMenuBookKey(null);
      }
      if (
        isFilterOpen &&
        typeof window !== 'undefined' &&
        window.innerWidth >= 768 &&
        filterContainerRef.current &&
        !filterContainerRef.current.contains(target)
      ) {
        setIsFilterOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [openMenuBookKey, isFilterOpen]);

  // Sync draft filter values whenever filter panel opens
  const openFilterPanel = () => {
    setDraftPaket(selectedPaket);
    setDraftKategori(selectedKategori);
    setDraftUkuran(selectedUkuran);
    setDraftStuckOnly(stuckOnly);
    setDraftAdaPertanyaanOnly(adaPertanyaanOnly);
    setDraftPayment(selectedPayment);
    setIsFilterOpen(true);
  };

  const applyFilterPanel = () => {
    setSelectedPaket(draftPaket);
    setSelectedKategori(draftKategori);
    setSelectedUkuran(draftUkuran);
    setStuckOnly(draftStuckOnly);
    setAdaPertanyaanOnly(draftAdaPertanyaanOnly);
    setSelectedPayment(draftPayment);
    setIsFilterOpen(false);
  };

  const resetDraftPanel = () => {
    setDraftPaket('Semua');
    setDraftKategori('Semua');
    setDraftUkuran('Semua');
    setDraftStuckOnly(false);
    setDraftAdaPertanyaanOnly(false);
    setDraftPayment('semua');
  };

  const availableStatuses = useMemo(() => {
    const combined = buildCombinedStatusList(customStatuses);
    const set = new Set<string>(combined);
    books.forEach((b) => {
      if (b.statusProgres && b.statusProgres.trim()) set.add(b.statusProgres.trim());
    });
    return Array.from(set);
  }, [customStatuses, books]);

  const kategoriOptions = useMemo(() => {
    const set = new Set<string>(KATEGORI_BUKU_LIST);
    books.forEach((b) => {
      if (b.kategori && b.kategori.trim()) set.add(b.kategori.trim());
    });
    return ['Semua', ...Array.from(set)];
  }, [books]);

  const ukuranOptions = useMemo(() => {
    const set = new Set<string>(UKURAN_BUKU_LIST);
    books.forEach((b) => {
      const uk = (b.ukuran || b.ukuranBuku || '').trim();
      if (uk) set.add(uk);
    });
    return ['Semua', ...Array.from(set)];
  }, [books]);

  const logSummaryByBook = useMemo(() => {
    const grouped = new Map<string, BookLog[]>();
    logs.forEach((l) => {
      const k = l.bookId || `no_${l.bookNo}`;
      const arr = grouped.get(k);
      if (arr) arr.push(l);
      else grouped.set(k, [l]);
    });
    const summaries = new Map<string, BookLogSummary>();
    grouped.forEach((list, k) => {
      summaries.set(k, summarizeBookLogs(list));
    });
    return summaries;
  }, [logs]);

  // Hitungan untuk baris kelompok status & tombol cepat "Di Saya"
  const groupCounts = useMemo(() => {
    let semua = 0;
    let awal = 0;
    let progres = 0;
    let masalah = 0;
    let finish = 0;

    books.forEach((b) => {
      const finished = isStatusSelesai(b.statusProgres, statusSelesai);
      if (showSelesai || !finished) {
        semua++;
      }
      const grp = resolveStatusGroup(b.statusProgres, statusGroupOverrides);
      if (grp === 'awal') awal++;
      else if (grp === 'progres') progres++;
      else if (grp === 'masalah') masalah++;
      else if (grp === 'finish') finish++;
    });

    const diSaya = countBooksDiSaya(
      books,
      statusDiSaya,
      statusSelesai,
      statusGroupOverrides
    );

    return { semua, awal, progres, masalah, finish, diSaya };
  }, [books, showSelesai, statusSelesai, statusGroupOverrides, statusDiSaya]);

  // Daftar status dalam kelompok yang sedang dipilih (dengan hitungannya)
  const statusesInSelectedGroup = useMemo(() => {
    if (selectedGroup === 'semua') return [];
    const countsMap = new Map<string, number>();
    books.forEach((b) => {
      if (resolveStatusGroup(b.statusProgres, statusGroupOverrides) === selectedGroup) {
        countsMap.set(b.statusProgres, (countsMap.get(b.statusProgres) || 0) + 1);
      }
    });

    return availableStatuses
      .filter((st) => resolveStatusGroup(st, statusGroupOverrides) === selectedGroup)
      .map((st) => ({
        status: st,
        count: countsMap.get(st) || 0,
      }));
  }, [selectedGroup, availableStatuses, books, statusGroupOverrides]);

  // Filter & Sort books
  const filteredBooks = useMemo(() => {
    return books
      .filter((book) => {
        const finished = isStatusSelesai(book.statusProgres, statusSelesai);
        const grp = resolveStatusGroup(book.statusProgres, statusGroupOverrides);

        // Kelompok status & aturan bawaan "Tampilkan Selesai"
        if (selectedGroup === 'semua') {
          if (!showSelesai && finished && !siapDitagihOnly && selectedStatusInGroup === 'Semua') {
            return false;
          }
        } else {
          if (grp !== selectedGroup) return false;
          if (selectedStatusInGroup !== 'Semua' && book.statusProgres !== selectedStatusInGroup) {
            return false;
          }
        }

        // Jika memilih status spesifik di kelompok 'semua' (dari preset)
        if (
          selectedGroup === 'semua' &&
          selectedStatusInGroup !== 'Semua' &&
          book.statusProgres !== selectedStatusInGroup
        ) {
          return false;
        }

        // Quick filter Di Saya
        if (
          diSayaOnly &&
          !isActiveBookDiSaya(
            book.statusProgres,
            statusDiSaya,
            statusSelesai,
            statusGroupOverrides
          )
        ) {
          return false;
        }

        // Search query (judul, penulis, atau no #)
        if (searchQuery.trim()) {
          const rawQ = searchQuery.trim().toLowerCase();
          const noQuery = rawQ.startsWith('#') ? rawQ.slice(1) : rawQ;
          const matchNo = noQuery !== '' && String(book.no).includes(noQuery);
          const matchJudul = book.judul.toLowerCase().includes(rawQ);
          const matchPenulis = book.penulis.toLowerCase().includes(rawQ);
          if (!matchNo && !matchJudul && !matchPenulis) return false;
        }

        // Advanced panel filters
        if (selectedPaket !== 'Semua' && book.paket !== selectedPaket) return false;
        if (selectedKategori !== 'Semua' && book.kategori !== selectedKategori) return false;
        if (selectedUkuran !== 'Semua') {
          const uk = (book.ukuran || book.ukuranBuku || '').trim();
          if (uk !== selectedUkuran) return false;
        }
        if (stuckOnly && book.stuck !== 'Ya') return false;
        if (adaPertanyaanOnly && !book.adaPertanyaan) return false;

        if (selectedPayment === 'belum_ditagih' && book.statusBayar !== 'Belum Ditagih') {
          return false;
        }
        if (selectedPayment === 'sudah_ditagih' && book.statusBayar !== 'Belum Dibayar') {
          return false;
        }
        if (selectedPayment === 'lunas' && book.statusBayar !== 'Lunas') {
          return false;
        }

        // Dashboard preset filters
        if (activeOnly && finished) return false;
        if (siapDitagihOnly && !(finished && book.statusBayar === 'Belum Ditagih')) return false;
        if (perluPerhatianOnly) {
          const needsAttention =
            book.stuck === 'Ya' ||
            grp === 'masalah' ||
            (finished && book.statusBayar === 'Belum Ditagih') ||
            book.statusBayar === 'Belum Dibayar' ||
            (!finished && computeDaysInStatus(book) >= 7);
          if (!needsAttention) return false;
        }

        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'updateDesc') {
          return (b.updateTerakhir || '').localeCompare(a.updateTerakhir || '');
        }
        if (sortBy === 'lamaStatusDesc') {
          return computeDaysInStatus(b) - computeDaysInStatus(a);
        }
        if (sortBy === 'judulAsc') {
          return a.judul.localeCompare(b.judul, 'id');
        }
        return a.no - b.no;
      });
  }, [
    books,
    selectedGroup,
    selectedStatusInGroup,
    showSelesai,
    statusSelesai,
    statusGroupOverrides,
    diSayaOnly,
    statusDiSaya,
    searchQuery,
    selectedPaket,
    selectedKategori,
    selectedUkuran,
    stuckOnly,
    adaPertanyaanOnly,
    selectedPayment,
    activeOnly,
    siapDitagihOnly,
    perluPerhatianOnly,
    sortBy,
  ]);

  // Reset pagination when filter/sort changes
  useEffect(() => {
    setVisibleLimit(20);
  }, [
    selectedGroup,
    selectedStatusInGroup,
    showSelesai,
    diSayaOnly,
    searchQuery,
    selectedPaket,
    selectedKategori,
    selectedUkuran,
    stuckOnly,
    adaPertanyaanOnly,
    selectedPayment,
    activeOnly,
    siapDitagihOnly,
    perluPerhatianOnly,
    sortBy,
  ]);

  const panelActiveCount =
    (selectedPaket !== 'Semua' ? 1 : 0) +
    (selectedKategori !== 'Semua' ? 1 : 0) +
    (selectedUkuran !== 'Semua' ? 1 : 0) +
    (stuckOnly ? 1 : 0) +
    (adaPertanyaanOnly ? 1 : 0) +
    (selectedPayment !== 'semua' ? 1 : 0);

  // Chip filter aktif: SETIAP filter aktif SELALU terlihat agar tidak ada filter tersembunyi
  interface ActiveChip {
    key: string;
    label: string;
    onRemove: () => void;
  }

  const activeChips: ActiveChip[] = [];
  if (selectedGroup !== 'semua') {
    const meta = getStatusGroupMeta(selectedGroup);
    activeChips.push({
      key: 'group',
      label: `Kelompok: ${meta.label}`,
      onRemove: () => selectGroupWithHash('semua'),
    });
  }
  if (selectedStatusInGroup !== 'Semua') {
    activeChips.push({
      key: 'status',
      label: `Status: ${selectedStatusInGroup}`,
      onRemove: () => setSelectedStatusInGroup('Semua'),
    });
  }
  if (diSayaOnly) {
    activeChips.push({
      key: 'diSaya',
      label: 'Di Saya',
      onRemove: () => setDiSayaOnly(false),
    });
  }
  if (selectedPaket !== 'Semua') {
    activeChips.push({
      key: 'paket',
      label: `Paket: ${selectedPaket}`,
      onRemove: () => setSelectedPaket('Semua'),
    });
  }
  if (selectedKategori !== 'Semua') {
    activeChips.push({
      key: 'kategori',
      label: `Kategori: ${selectedKategori}`,
      onRemove: () => setSelectedKategori('Semua'),
    });
  }
  if (selectedUkuran !== 'Semua') {
    activeChips.push({
      key: 'ukuran',
      label: `Ukuran: ${selectedUkuran}`,
      onRemove: () => setSelectedUkuran('Semua'),
    });
  }
  if (stuckOnly) {
    activeChips.push({
      key: 'stuck',
      label: 'Hanya stuck',
      onRemove: () => setStuckOnly(false),
    });
  }
  if (adaPertanyaanOnly) {
    activeChips.push({
      key: 'adaPertanyaan',
      label: 'Ada pertanyaan',
      onRemove: () => setAdaPertanyaanOnly(false),
    });
  }
  if (selectedPayment !== 'semua') {
    const pLabel =
      selectedPayment === 'belum_ditagih'
        ? 'Belum ditagih'
        : selectedPayment === 'sudah_ditagih'
        ? 'Sudah ditagih'
        : 'Lunas';
    activeChips.push({
      key: 'payment',
      label: `Bayar: ${pLabel}`,
      onRemove: () => setSelectedPayment('semua'),
    });
  }
  if (activeOnly) {
    activeChips.push({
      key: 'activeOnly',
      label: 'Masih Aktif',
      onRemove: () => setActiveOnly(false),
    });
  }
  if (siapDitagihOnly) {
    activeChips.push({
      key: 'siapDitagih',
      label: 'Siap Ditagih',
      onRemove: () => setSiapDitagihOnly(false),
    });
  }
  if (perluPerhatianOnly) {
    activeChips.push({
      key: 'perluPerhatian',
      label: 'Perlu Perhatian',
      onRemove: () => setPerluPerhatianOnly(false),
    });
  }

  const hasActiveFilters = activeChips.length > 0 || searchQuery.trim() !== '';

  const resetAllFilters = () => {
    setSearchQuery('');
    selectGroupWithHash('semua');
    setSelectedStatusInGroup('Semua');
    setShowSelesai(false);
    setDiSayaOnly(false);
    setSelectedPaket('Semua');
    setSelectedKategori('Semua');
    setSelectedUkuran('Semua');
    setStuckOnly(false);
    setAdaPertanyaanOnly(false);
    setSelectedPayment('semua');
    setActiveOnly(false);
    setSiapDitagihOnly(false);
    setPerluPerhatianOnly(false);
    onClearInitialStatusFilter?.();
    onClearNavigationPreset?.();
  };

  const paginatedBooks = useMemo(
    () => filteredBooks.slice(0, visibleLimit),
    [filteredBooks, visibleLimit]
  );

  const renderFilterFormBody = () => (
    <div className="space-y-4">
      {/* Paket */}
      <div>
        <span className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1.5">
          Paket
        </span>
        <div className="grid grid-cols-4 gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800">
          {(['Semua', ...PAKET_LIST] as const).map((pkt) => (
            <button
              key={pkt}
              type="button"
              onClick={() => setDraftPaket(pkt)}
              className={`min-h-[38px] rounded-lg text-xs font-bold transition-colors duration-150 motion-reduce:transition-none ${
                draftPaket === pkt
                  ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              {pkt}
            </button>
          ))}
        </div>
      </div>

      {/* Kategori & Ukuran */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label
            htmlFor="filter-kategori-select"
            className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1.5"
          >
            Kategori
          </label>
          <select
            id="filter-kategori-select"
            value={draftKategori}
            onChange={(e) => setDraftKategori(e.target.value)}
            className="w-full min-h-[44px] px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-base sm:text-xs font-semibold text-slate-800 dark:text-slate-100"
          >
            {kategoriOptions.map((kat) => (
              <option key={kat} value={kat}>
                {kat}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor="filter-ukuran-select"
            className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1.5"
          >
            Ukuran Buku
          </label>
          <select
            id="filter-ukuran-select"
            value={draftUkuran}
            onChange={(e) => setDraftUkuran(e.target.value)}
            className="w-full min-h-[44px] px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-base sm:text-xs font-semibold text-slate-800 dark:text-slate-100"
          >
            {ukuranOptions.map((uk) => (
              <option key={uk} value={uk}>
                {uk}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Switch: Hanya yang stuck & Ada pertanyaan */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        <button
          type="button"
          role="switch"
          aria-checked={draftStuckOnly}
          onClick={() => setDraftStuckOnly((p) => !p)}
          className={`min-h-[44px] px-3.5 py-2 rounded-xl border flex items-center justify-between gap-2 text-xs font-bold transition-colors ${
            draftStuckOnly
              ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-300'
              : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200'
          }`}
        >
          <span>Hanya yang stuck</span>
          <span
            className={`w-9 h-5 rounded-full p-0.5 flex items-center transition-colors ${
              draftStuckOnly ? 'bg-rose-600 justify-end' : 'bg-slate-300 dark:bg-slate-600 justify-start'
            }`}
          >
            <span className="w-4 h-4 rounded-full bg-white shadow-xs" />
          </span>
        </button>

        <button
          type="button"
          role="switch"
          aria-checked={draftAdaPertanyaanOnly}
          onClick={() => setDraftAdaPertanyaanOnly((p) => !p)}
          className={`min-h-[44px] px-3.5 py-2 rounded-xl border flex items-center justify-between gap-2 text-xs font-bold transition-colors ${
            draftAdaPertanyaanOnly
              ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800 text-amber-800 dark:text-amber-300'
              : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200'
          }`}
        >
          <span>Ada pertanyaan</span>
          <span
            className={`w-9 h-5 rounded-full p-0.5 flex items-center transition-colors ${
              draftAdaPertanyaanOnly
                ? 'bg-amber-500 justify-end'
                : 'bg-slate-300 dark:bg-slate-600 justify-start'
            }`}
          >
            <span className="w-4 h-4 rounded-full bg-white shadow-xs" />
          </span>
        </button>
      </div>

      {/* Pembayaran */}
      <div>
        <span className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1.5">
          Pembayaran
        </span>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
          {(
            [
              { key: 'semua', label: 'Semua' },
              { key: 'belum_ditagih', label: 'Belum ditagih' },
              { key: 'sudah_ditagih', label: 'Sudah ditagih' },
              { key: 'lunas', label: 'Lunas' },
            ] as const
          ).map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => setDraftPayment(opt.key)}
              className={`min-h-[40px] px-2.5 py-1.5 rounded-xl text-xs font-bold border transition-colors ${
                draftPayment === opt.key
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tombol Aksi */}
      <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
        <button
          type="button"
          onClick={resetDraftPanel}
          className="min-h-[44px] px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold transition-colors"
        >
          Reset
        </button>
        <button
          type="button"
          onClick={applyFilterPanel}
          className="min-h-[44px] px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-colors"
        >
          Terapkan
        </button>
      </div>
    </div>
  );

  const renderBookActionMenu = (book: BookJob) => {
    const key = book.id || String(book.no);
    const isOpen = openMenuBookKey === key;
    return (
      <div
        className="relative shrink-0"
        data-buku-menu
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={() => setOpenMenuBookKey(isOpen ? null : key)}
          className="min-w-[40px] min-h-[40px] rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center transition-colors"
          aria-label={`Menu buku #${book.no}`}
        >
          <MoreVertical className="w-4 h-4" />
        </button>
        {isOpen && (
          <div className="absolute right-0 mt-1 w-40 bg-white dark:bg-slate-900 rounded-xl shadow-xl border border-slate-200 dark:border-slate-800 py-1 z-30">
            <button
              type="button"
              onClick={() => {
                setOpenMenuBookKey(null);
                onSelectBook(book);
              }}
              className="w-full min-h-[40px] px-3 py-2 text-left text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2"
            >
              <ExternalLink className="w-3.5 h-3.5 text-blue-600" />
              <span>Buka detail</span>
            </button>
            {onQuickStatusChange && (
              <button
                type="button"
                onClick={() => {
                  setOpenMenuBookKey(null);
                  setQuickStatusModalBook(book);
                }}
                className="w-full min-h-[40px] px-3 py-2 text-left text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2"
              >
                <RefreshCw className="w-3.5 h-3.5 text-emerald-600" />
                <span>Ganti status</span>
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* =================================================================
          1. BARIS KELOMPOK STATUS (5 kolom sama lebar, tanpa scroll horizontal)
          ================================================================= */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-3 sm:p-4 border border-slate-200/80 dark:border-slate-800 shadow-[0_1px_2px_rgba(15,23,42,0.04)] space-y-3">
        <div
          role="tablist"
          aria-label="Kelompok status buku"
          className="grid grid-cols-5 gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800 w-full"
        >
          {(
            [
              { key: 'semua', label: 'Semua', shortLabel: 'Semua', count: groupCounts.semua, dot: null },
              {
                key: 'awal',
                label: 'Tahap Awal',
                shortLabel: 'Awal',
                count: groupCounts.awal,
                dot: STATUS_GROUPS[0].hex,
              },
              {
                key: 'progres',
                label: 'Progres',
                shortLabel: 'Progres',
                count: groupCounts.progres,
                dot: STATUS_GROUPS[1].hex,
              },
              {
                key: 'masalah',
                label: 'Masalah',
                shortLabel: 'Masalah',
                count: groupCounts.masalah,
                dot: STATUS_GROUPS[2].hex,
              },
              {
                key: 'finish',
                label: 'Finish',
                shortLabel: 'Finish',
                count: groupCounts.finish,
                dot: STATUS_GROUPS[3].hex,
              },
            ] as const
          ).map((item) => {
            const active = selectedGroup === item.key;
            return (
              <button
                key={item.key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => selectGroupWithHash(item.key)}
                className={`min-h-[48px] sm:min-h-[44px] px-1 sm:px-2.5 py-1.5 rounded-lg flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1.5 text-center transition-colors duration-150 motion-reduce:transition-none min-w-0 ${
                  active
                    ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs font-bold'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white font-semibold'
                }`}
              >
                <span className="flex items-center justify-center gap-1 min-w-0 max-w-full">
                  {item.dot && (
                    <span
                      className="hidden sm:inline-block w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: item.dot }}
                    />
                  )}
                  <span className="sm:hidden text-xs truncate">{item.shortLabel}</span>
                  <span className="hidden sm:inline text-xs truncate">{item.label}</span>
                </span>
                <span
                  className={`text-xs font-extrabold tabular-nums leading-none ${
                    active ? 'text-blue-600 dark:text-blue-400' : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  {item.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Sub-bar: Tampilkan Selesai, Tombol cepat Di Saya, & Dropdown status dalam kelompok */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            {/* Tombol cepat oranye "Di Saya N" */}
            <button
              type="button"
              onClick={() => setDiSayaOnly((prev) => !prev)}
              aria-pressed={diSayaOnly}
              className={`min-h-[44px] sm:min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-bold border inline-flex items-center gap-1.5 transition-colors duration-150 motion-reduce:transition-none ${
                diSayaOnly
                  ? 'bg-orange-500 text-white border-orange-500 shadow-xs'
                  : 'bg-orange-50 dark:bg-orange-950/40 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-800 hover:bg-orange-100'
              }`}
            >
              <span>Di Saya</span>
              <span
                className={`px-1.5 py-0.5 rounded-md text-[11px] font-extrabold tabular-nums ${
                  diSayaOnly
                    ? 'bg-white/20 text-white'
                    : 'bg-orange-500 text-white'
                }`}
              >
                {groupCounts.diSaya}
              </span>
            </button>

            {/* Dropdown "Semua status" hanya muncul saat kelompok spesifik dipilih */}
            {selectedGroup !== 'semua' && statusesInSelectedGroup.length > 0 && (
              <select
                aria-label="Filter status dalam kelompok"
                value={selectedStatusInGroup}
                onChange={(e) => setSelectedStatusInGroup(e.target.value)}
                className="min-h-[44px] sm:min-h-[38px] px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-base sm:text-xs font-bold text-slate-800 dark:text-slate-100 cursor-pointer"
              >
                <option value="Semua">Semua status</option>
                {statusesInSelectedGroup.map((item) => (
                  <option key={item.status} value={item.status}>
                    {item.status} ({item.count})
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Saklar "Tampilkan Selesai" */}
          <button
            type="button"
            role="switch"
            aria-checked={showSelesai}
            onClick={() => setShowSelesai((prev) => !prev)}
            className="min-h-[44px] sm:min-h-[38px] px-2.5 py-1 rounded-xl flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <span>Tampilkan Selesai</span>
            <span
              className={`w-9 h-5 rounded-full p-0.5 flex items-center transition-colors ${
                showSelesai ? 'bg-emerald-600 justify-end' : 'bg-slate-300 dark:bg-slate-600 justify-start'
              }`}
            >
              <span className="w-4 h-4 rounded-full bg-white shadow-xs" />
            </span>
          </button>
        </div>

        {/* =================================================================
            2. BARIS KONTROL TUNGGAL
            ================================================================= */}
        <div
          ref={filterContainerRef}
          className="relative flex flex-col sm:flex-row sm:items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800"
        >
          {/* Kolom Cari */}
          <div className="relative flex-1 min-w-0">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari judul, penulis, atau no (#1)..."
              className="w-full min-h-[44px] pl-9 pr-9 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-base sm:text-sm text-slate-900 dark:text-white placeholder:text-slate-400 border border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                aria-label="Hapus pencarian"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Kontrol Baris Kedua di HP / Inline di Desktop */}
          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap shrink-0">
            {/* Tombol Filter */}
            <button
              type="button"
              onClick={() => (isFilterOpen ? setIsFilterOpen(false) : openFilterPanel())}
              className={`min-h-[44px] px-3 py-2 rounded-xl border inline-flex items-center gap-1.5 text-xs font-bold transition-colors shrink-0 ${
                isFilterOpen || panelActiveCount > 0
                  ? 'bg-blue-50 border-blue-200 text-blue-600 dark:bg-blue-950/60 dark:border-blue-900 dark:text-blue-400'
                  : 'bg-slate-50 border-slate-200 text-slate-700 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200'
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>Filter</span>
              {panelActiveCount > 0 && (
                <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-blue-600 text-white text-[10px] font-extrabold inline-flex items-center justify-center tabular-nums">
                  {panelActiveCount}
                </span>
              )}
            </button>

            {/* Dropdown Urut */}
            <div className="relative flex-1 sm:flex-initial min-w-0">
              <select
                aria-label="Urutkan daftar buku"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as BukuSortOption)}
                className="w-full min-h-[44px] appearance-none pl-3 pr-8 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-base sm:text-xs font-semibold border border-transparent focus:outline-none cursor-pointer"
              >
                <option value="no">Urut: No</option>
                <option value="updateDesc">Terbaru diupdate</option>
                <option value="lamaStatusDesc">Terlama di status</option>
                <option value="judulAsc">Judul A-Z</option>
              </select>
              <ArrowUpDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>

            {/* Toggle Daftar / Kartu */}
            <div
              className="inline-flex items-center p-1 rounded-xl bg-slate-100 dark:bg-slate-800 shrink-0"
              role="group"
              aria-label="Pilih tampilan daftar atau kartu"
            >
              <button
                type="button"
                onClick={() => handleToggleViewMode('daftar')}
                className={`min-h-[36px] min-w-[36px] px-2.5 py-1 rounded-lg text-xs font-bold inline-flex items-center gap-1 transition-colors ${
                  localViewMode === 'daftar'
                    ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
                aria-label="Tampilan Daftar"
                aria-pressed={localViewMode === 'daftar'}
              >
                <LayoutList className="w-3.5 h-3.5" />
                <span className="hidden lg:inline">Daftar</span>
              </button>
              <button
                type="button"
                onClick={() => handleToggleViewMode('kartu')}
                className={`min-h-[36px] min-w-[36px] px-2.5 py-1 rounded-lg text-xs font-bold inline-flex items-center gap-1 transition-colors ${
                  localViewMode === 'kartu'
                    ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
                aria-label="Tampilan Kartu"
                aria-pressed={localViewMode === 'kartu'}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span className="hidden lg:inline">Kartu</span>
              </button>
            </div>

            {/* Tombol Tambah Buku (Desktop) */}
            {onAddNewBook && (
              <button
                type="button"
                onClick={() => setIsAddModalOpen(true)}
                className="hidden sm:inline-flex min-h-[44px] px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs items-center gap-1.5 transition-colors shrink-0 shadow-xs"
              >
                <BookPlus className="w-4 h-4" />
                <span>Tambah Buku</span>
              </button>
            )}
          </div>

          {/* Popover Filter Desktop (>= 768px) */}
          {isFilterOpen && (
            <div className="hidden md:block absolute right-0 top-full mt-2 w-[440px] bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-5 z-40">
              <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-100 dark:border-slate-800">
                <span className="text-sm font-extrabold text-slate-900 dark:text-white">
                  Filter Daftar Buku
                </span>
                <button
                  type="button"
                  onClick={() => setIsFilterOpen(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  aria-label="Tutup filter"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              {renderFilterFormBody()}
            </div>
          )}
        </div>

        {/* =================================================================
            3. CHIP FILTER AKTIF & RINGKASAN (muncul HANYA bila ada filter aktif)
            ================================================================= */}
        {hasActiveFilters && (
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2">
            {activeChips.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                {activeChips.map((chip) => (
                  <button
                    key={chip.key}
                    type="button"
                    onClick={chip.onRemove}
                    className="min-h-[32px] pl-2.5 pr-2 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 text-xs font-bold inline-flex items-center gap-1.5 hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors"
                  >
                    <span>{chip.label}</span>
                    <X className="w-3.5 h-3.5" />
                  </button>
                ))}
              </div>
            )}

            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              <span>
                Menampilkan <strong className="tabular-nums">{filteredBooks.length}</strong> dari{' '}
                <span className="tabular-nums">{books.length}</span> buku
              </span>
              <button
                type="button"
                onClick={resetAllFilters}
                className="text-blue-600 dark:text-blue-400 font-bold hover:underline inline-flex items-center gap-1"
              >
                <span>Reset Filter</span>
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Sheet Filter Mobile (< 768px) */}
      {isFilterOpen && (
        <div
          className="md:hidden fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-end"
          onClick={() => setIsFilterOpen(false)}
        >
          <div
            className="w-full bg-white dark:bg-slate-900 rounded-t-3xl border-t border-slate-200 dark:border-slate-800 p-5 max-h-[85dvh] overflow-y-auto pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-100 dark:border-slate-800">
              <span className="text-base font-extrabold text-slate-900 dark:text-white">
                Filter Daftar Buku
              </span>
              <button
                type="button"
                onClick={() => setIsFilterOpen(false)}
                className="min-w-[40px] min-h-[40px] rounded-xl text-slate-400 hover:text-slate-700 flex items-center justify-center"
                aria-label="Tutup filter"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            {renderFilterFormBody()}
          </div>
        </div>
      )}

      {/* =================================================================
          4. KONTEN DAFTAR BUKU (EMPTY / DAFTAR / KARTU)
          ================================================================= */}
      {books.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-10 text-center border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 mx-auto flex items-center justify-center">
            <BookOpen className="w-6 h-6" />
          </div>
          <div>
            <h4 className="text-base font-bold text-slate-900 dark:text-white">
              Belum Ada Data Buku
            </h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto mt-1">
              Tambahkan proyek buku pertama Anda secara manual atau impor daftar buku lama dari Excel, CSV, atau Google Sheet.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2.5 pt-1">
            {onAddNewBook && (
              <button
                type="button"
                onClick={() => setIsAddModalOpen(true)}
                className="min-h-[44px] px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition-colors flex items-center gap-1.5 shadow-sm"
              >
                <BookPlus className="w-4 h-4" />
                <span>Tambah Buku</span>
              </button>
            )}
            {onOpenImport && (
              <button
                type="button"
                onClick={onOpenImport}
                className="min-h-[44px] px-4 py-2 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-700 transition-colors flex items-center gap-1.5"
              >
                <Upload className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span>Impor Data</span>
              </button>
            )}
          </div>
        </div>
      ) : filteredBooks.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-10 text-center border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-3">
          <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 mx-auto flex items-center justify-center">
            <BookOpen className="w-6 h-6" />
          </div>
          <h4 className="text-base font-bold text-slate-800 dark:text-slate-200">
            Tidak Ada Buku yang Cocok
          </h4>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            Tidak ditemukan buku dengan kriteria pencarian atau filter yang dipilih.
          </p>
          <button
            type="button"
            onClick={resetAllFilters}
            className="min-h-[44px] px-4 py-2 bg-blue-600 text-white text-xs font-bold rounded-xl hover:bg-blue-700 transition-colors"
          >
            Reset Semua Filter
          </button>
        </div>
      ) : localViewMode === 'daftar' ? (
        /* TAMPILAN DAFTAR (1 baris rapi per buku) */
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-[0_1px_2px_rgba(15,23,42,0.04)] overflow-visible divide-y divide-slate-100 dark:divide-slate-800">
          {paginatedBooks.map((book) => {
            const grpKey = resolveStatusGroup(book.statusProgres, statusGroupOverrides);
            const grpMeta = getStatusGroupMeta(grpKey);
            const isDiSaya = isBookDiSaya(book.statusProgres, statusDiSaya);
            const daysInStatus = computeDaysInStatus(book);
            const isOverdue = isDiSaya && daysInStatus > batasHariTerlambat;
            const isStuck = book.stuck === 'Ya';
            const logSum =
              (book.id ? logSummaryByBook.get(book.id) : undefined) ||
              logSummaryByBook.get(`no_${book.no}`);

            return (
              <div
                key={book.id || `list-${book.no}`}
                onClick={() => onSelectBook(book)}
                className={`px-3.5 sm:px-4 py-3 flex items-center justify-between gap-3 cursor-pointer hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors duration-150 motion-reduce:transition-none first:rounded-t-2xl last:rounded-b-2xl ${
                  isDiSaya ? 'border-l-4 border-l-orange-500' : ''
                }`}
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[11px] font-bold tabular-nums shrink-0">
                      #{book.no}
                    </span>
                    <h3 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white truncate min-w-0">
                      {book.judul}
                    </h3>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400">
                    <span className="truncate max-w-[180px] sm:max-w-[240px] font-medium">
                      {book.penulis}
                    </span>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${getPaketBadge(book.paket)}`}>
                      {book.paket}
                    </span>
                    <span className="tabular-nums font-semibold">
                      {daysInStatus} hr di status
                    </span>
                    {isDiSaya && (
                      <span
                        className={`font-bold tabular-nums ${
                          isOverdue
                            ? 'text-rose-600 dark:text-rose-400'
                            : 'text-orange-600 dark:text-orange-400'
                        }`}
                      >
                        Menunggu kamu - {daysInStatus} hari
                      </span>
                    )}
                    {isStuck && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-600 dark:bg-rose-950/50 dark:text-rose-400 inline-flex items-center gap-0.5">
                        <AlertTriangle className="w-2.5 h-2.5" />
                        Stuck
                      </span>
                    )}
                    {book.adaPertanyaan && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300 inline-flex items-center gap-0.5">
                        <HelpCircle className="w-2.5 h-2.5" />
                        Tanya
                      </span>
                    )}
                    {logSum && logSum.baruCount > 0 && (
                      <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-orange-500 text-white tabular-nums">
                        {logSum.baruCount} baru
                      </span>
                    )}
                  </div>

                  {book.catatanBuku && book.catatanBuku.trim() !== '' && (
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                      <StickyNote className="w-3 h-3 text-slate-400 shrink-0" />
                      <span className="truncate">{book.catatanBuku}</span>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <span
                    className={`hidden sm:inline-flex px-2.5 py-1 rounded-full text-[11px] font-bold border ${grpMeta.badgeBg} ${grpMeta.badgeText} ${grpMeta.badgeBorder}`}
                  >
                    {book.statusProgres}
                  </span>
                  {renderBookActionMenu(book)}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* TAMPILAN KARTU (2 kolom desktop, 1 kolom HP, ringkas) */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {paginatedBooks.map((book) => {
            const grpKey = resolveStatusGroup(book.statusProgres, statusGroupOverrides);
            const grpMeta = getStatusGroupMeta(grpKey);
            const isDiSaya = isBookDiSaya(book.statusProgres, statusDiSaya);
            const daysInStatus = computeDaysInStatus(book);
            const isOverdue = isDiSaya && daysInStatus > batasHariTerlambat;
            const isStuck = book.stuck === 'Ya';
            const logSum =
              (book.id ? logSummaryByBook.get(book.id) : undefined) ||
              logSummaryByBook.get(`no_${book.no}`);

            return (
              <div
                key={book.id || `card-${book.no}`}
                onClick={() => onSelectBook(book)}
                className={`bg-white dark:bg-slate-900 rounded-2xl p-4 border transition-colors duration-150 motion-reduce:transition-none cursor-pointer flex flex-col justify-between gap-2.5 ${
                  isDiSaya
                    ? 'border-slate-200/80 dark:border-slate-800 border-l-4 border-l-orange-500'
                    : isStuck
                    ? 'border-rose-300 dark:border-rose-800/80'
                    : 'border-slate-200/80 dark:border-slate-800 hover:border-blue-300 dark:hover:border-blue-800'
                }`}
              >
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[11px] font-bold tabular-nums">
                        #{book.no}
                      </span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${getPaketBadge(book.paket)}`}>
                        {book.paket}
                      </span>
                      {isStuck && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-600 dark:bg-rose-950/50 dark:text-rose-400 inline-flex items-center gap-1">
                          <AlertTriangle className="w-2.5 h-2.5" />
                          Stuck
                        </span>
                      )}
                      {book.adaPertanyaan && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300 inline-flex items-center gap-1">
                          <HelpCircle className="w-2.5 h-2.5" />
                          Pertanyaan
                        </span>
                      )}
                      {logSum && logSum.baruCount > 0 && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-500 text-white tabular-nums">
                          {logSum.baruCount} baru
                        </span>
                      )}
                    </div>

                    {renderBookActionMenu(book)}
                  </div>

                  <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white line-clamp-1">
                      {book.judul}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                      {book.penulis}
                    </p>
                  </div>

                  {book.catatanBuku && book.catatanBuku.trim() !== '' && (
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                      <StickyNote className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="truncate">{book.catatanBuku}</span>
                    </div>
                  )}

                  {logSum && logSum.summaryText && (
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                      <MessageSquareText className="w-3.5 h-3.5 text-orange-500 shrink-0" />
                      <span className="truncate">{logSum.summaryText}</span>
                    </div>
                  )}
                </div>

                <div className="pt-2.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border truncate ${grpMeta.badgeBg} ${grpMeta.badgeText} ${grpMeta.badgeBorder}`}
                  >
                    {book.statusProgres}
                  </span>

                  <div className="flex items-center gap-2 text-[11px] font-bold tabular-nums shrink-0">
                    {isDiSaya ? (
                      <span
                        className={
                          isOverdue
                            ? 'text-rose-600 dark:text-rose-400'
                            : 'text-orange-600 dark:text-orange-400'
                        }
                      >
                        Menunggu kamu - {daysInStatus} hari
                      </span>
                    ) : (
                      <span className="text-slate-500 dark:text-slate-400 inline-flex items-center gap-1">
                        <Clock className="w-3 h-3 text-blue-500" />
                        <span>{daysInStatus} hr di status</span>
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Paginasi 20 buku + Muat lebih banyak */}
      {filteredBooks.length > visibleLimit && (
        <div className="flex justify-center pt-2">
          <button
            type="button"
            onClick={() => setVisibleLimit((prev) => prev + 20)}
            className="min-h-[44px] px-6 py-2.5 rounded-xl bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 text-xs sm:text-sm font-bold text-blue-600 dark:text-blue-400 shadow-xs transition-colors"
          >
            Muat lebih banyak ({filteredBooks.length - visibleLimit} buku lagi)
          </button>
        </div>
      )}

      {/* FAB Tambah Buku di HP */}
      {onAddNewBook && (
        <button
          type="button"
          onClick={() => setIsAddModalOpen(true)}
          className="sm:hidden fixed bottom-20 right-4 z-30 w-14 h-14 rounded-full bg-blue-600 hover:bg-blue-700 text-white shadow-xl shadow-blue-600/30 flex items-center justify-center transition-transform active:scale-95"
          aria-label="Tambah Buku Baru"
        >
          <BookPlus className="w-6 h-6" />
        </button>
      )}

      {/* Modal Ganti Status Cepat dari Menu Titik Tiga */}
      {quickStatusModalBook && onQuickStatusChange && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50 backdrop-blur-xs"
          onClick={() => setQuickStatusModalBook(null)}
        >
          <div
            className="w-full sm:max-w-lg bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl p-5 max-h-[80dvh] overflow-y-auto space-y-4 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-2 pb-2 border-b border-slate-100 dark:border-slate-800">
              <div className="min-w-0">
                <span className="text-[11px] font-bold text-blue-600 dark:text-blue-400">
                  #{quickStatusModalBook.no} · Ganti Status
                </span>
                <h3 className="text-sm font-extrabold text-slate-900 dark:text-white truncate">
                  {quickStatusModalBook.judul}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setQuickStatusModalBook(null)}
                className="min-w-[36px] min-h-[36px] rounded-xl text-slate-400 hover:text-slate-700 flex items-center justify-center"
                aria-label="Tutup modal status"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              {STATUS_GROUPS.map((g) => {
                const groupStatuses = availableStatuses.filter(
                  (st) => resolveStatusGroup(st, statusGroupOverrides) === g.key
                );
                if (groupStatuses.length === 0) return null;
                return (
                  <div key={g.key} className="space-y-1.5">
                    <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: g.hex }}
                      />
                      <span>{g.label}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {groupStatuses.map((st) => {
                        const active = quickStatusModalBook.statusProgres === st;
                        return (
                          <button
                            key={st}
                            type="button"
                            onClick={() => {
                              onQuickStatusChange(quickStatusModalBook, st);
                              setQuickStatusModalBook(null);
                            }}
                            className={`min-h-[44px] px-3 py-2 rounded-xl text-xs font-bold text-left border flex items-center justify-between gap-1.5 transition-colors ${
                              active
                                ? 'bg-blue-600 text-white border-blue-600'
                                : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:border-blue-400'
                            }`}
                          >
                            <span className="line-clamp-2 leading-tight">{st}</span>
                            {active && <Check className="w-4 h-4 shrink-0" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Modal Tambah Buku Baru */}
      {onAddNewBook && (
        <AddBookModal
          isOpen={isAddModalOpen}
          onClose={() => setIsAddModalOpen(false)}
          onAddBook={onAddNewBook}
          nextBookNo={books.length > 0 ? Math.max(...books.map((b) => b.no)) + 1 : 1}
        />
      )}
    </div>
  );
};
