import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  Search,
  Filter,
  X,
  Plus,
  ChevronDown,
  ChevronRight,
  MoreVertical,
  Edit3,
  Trash2,
  CheckCircle2,
  MessageSquareText,
  History,
  ArrowUpDown,
} from 'lucide-react';
import { BookJob, BookLog, LogJenisType, LogStatusType } from '../types';
import {
  LOG_DARI_SUGGESTIONS,
  LOG_JENIS_OPTIONS,
  getLogDariBadgeConfig,
  getLogJenisBadgeConfig,
} from '../config/logConstants';
import { formatLogDateShort } from '../utils/formatters';
import { LogFormModal } from './LogFormModal';

type LogStatusFilterTab = 'Baru' | 'Semua' | 'Selesai';

interface LogTabProps {
  books: BookJob[];
  logs: BookLog[];
  onOpenBookCatatan: (book: BookJob) => void;
  onCreateLog: (data: {
    bookId: string;
    bookNo: number;
    tanggal: string | null;
    dari: string;
    isi: string;
    jenis: LogJenisType;
    status: LogStatusType;
  }) => Promise<void>;
  onUpdateLog: (log: BookLog, updates: Partial<BookLog>) => Promise<boolean>;
  onToggleLogStatus: (log: BookLog) => Promise<void>;
  onDeleteLog: (log: BookLog) => Promise<boolean>;
}

function getHashLogTab(): LogStatusFilterTab {
  if (typeof window === 'undefined') return 'Baru';
  const h = window.location.hash.replace(/^#/, '').toLowerCase();
  if (h === 'semua' || h === 'log-semua') return 'Semua';
  if (h === 'selesai' || h === 'log-selesai') return 'Selesai';
  return 'Baru';
}

export const LogTab: React.FC<LogTabProps> = ({
  books,
  logs,
  onOpenBookCatatan,
  onCreateLog,
  onUpdateLog,
  onToggleLogStatus,
  onDeleteLog,
}) => {
  const [statusTab, setStatusTab] = useState<LogStatusFilterTab>(getHashLogTab);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');

  // Filter state
  const [filterJenis, setFilterJenis] = useState<string>('Semua');
  const [filterDari, setFilterDari] = useState<string>('Semua');
  const [filterBookId, setFilterBookId] = useState<string>('Semua');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  // Accordion collapse state per buku & bagian Riwayat lama
  const [collapsedBookIds, setCollapsedBookIds] = useState<Record<string, boolean>>({});
  const [expandedLegacyBookIds, setExpandedLegacyBookIds] = useState<Record<string, boolean>>({});

  // Menu titik tiga & modal tambah/edit & konfirmasi hapus
  const [openMenuLogId, setOpenMenuLogId] = useState<string | null>(null);
  const [confirmDeleteLogId, setConfirmDeleteLogId] = useState<string | null>(null);
  const [formModalState, setFormModalState] = useState<{
    isOpen: boolean;
    editingLog: BookLog | null;
  }>({ isOpen: false, editingLog: null });

  const filterBtnRef = useRef<HTMLDivElement>(null);

  // Sinkronkan perubahan URL hash untuk status tab [Baru / Semua / Selesai]
  useEffect(() => {
    const onHashChange = () => {
      setStatusTab(getHashLogTab());
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const handleSelectStatusTab = (tab: LogStatusFilterTab) => {
    setStatusTab(tab);
    if (typeof window !== 'undefined') {
      const nextHash = tab === 'Baru' ? '#baru' : tab === 'Semua' ? '#semua' : '#selesai';
      window.history.replaceState(window.history.state, '', `${window.location.pathname}${nextHash}`);
    }
  };

  // Close desktop popover / 3-dot menu on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (openMenuLogId && !(e.target as HTMLElement).closest('[data-log-menu]')) {
        setOpenMenuLogId(null);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [openMenuLogId]);

  const bookMap = useMemo(() => {
    const map = new Map<string, BookJob>();
    books.forEach((b) => {
      if (b.id) map.set(b.id, b);
    });
    return map;
  }, [books]);

  const allDariOptions = useMemo(() => {
    const set = new Set<string>(LOG_DARI_SUGGESTIONS);
    logs.forEach((l) => {
      if (l.dari.trim()) set.add(l.dari.trim());
    });
    return Array.from(set);
  }, [logs]);

  const counts = useMemo(() => {
    const baru = logs.filter((l) => l.status === 'Baru').length;
    const selesai = logs.filter((l) => l.status === 'Selesai').length;
    return { baru, semua: logs.length, selesai };
  }, [logs]);

  const activeFiltersCount =
    (filterJenis !== 'Semua' ? 1 : 0) +
    (filterDari !== 'Semua' ? 1 : 0) +
    (filterBookId !== 'Semua' ? 1 : 0) +
    (dateFrom || dateTo ? 1 : 0);

  const filteredLogs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return logs.filter((log) => {
      if (statusTab === 'Baru' && log.status !== 'Baru') return false;
      if (statusTab === 'Selesai' && log.status !== 'Selesai') return false;

      if (filterJenis !== 'Semua' && log.jenis !== filterJenis) return false;
      if (filterDari !== 'Semua' && log.dari.toLowerCase() !== filterDari.toLowerCase()) return false;
      if (filterBookId !== 'Semua' && log.bookId !== filterBookId) return false;

      if (dateFrom && (!log.tanggal || log.tanggal < dateFrom)) return false;
      if (dateTo && (!log.tanggal || log.tanggal > dateTo)) return false;

      if (q) {
        const bookTitle = (bookMap.get(log.bookId)?.judul || '').toLowerCase();
        const matchIsi = log.isi.toLowerCase().includes(q);
        const matchDari = log.dari.toLowerCase().includes(q);
        const matchJudul = bookTitle.includes(q);
        if (!matchIsi && !matchDari && !matchJudul) return false;
      }

      return true;
    });
  }, [logs, statusTab, filterJenis, filterDari, filterBookId, dateFrom, dateTo, searchQuery, bookMap]);

  // Pengelompokan per buku: buku yg punya log Baru di atas, lalu no buku naik
  const groupedBooks = useMemo(() => {
    const map = new Map<
      string,
      {
        bookId: string;
        book: BookJob | undefined;
        bookNo: number;
        judul: string;
        regularLogs: BookLog[];
        legacyLogs: BookLog[];
        baruCountInGroup: number;
      }
    >();

    filteredLogs.forEach((log) => {
      const b = bookMap.get(log.bookId);
      const key = log.bookId || `no-${log.bookNo}`;
      if (!map.has(key)) {
        map.set(key, {
          bookId: log.bookId,
          book: b,
          bookNo: b?.no ?? log.bookNo,
          judul: b?.judul ?? `Buku #${log.bookNo}`,
          regularLogs: [],
          legacyLogs: [],
          baruCountInGroup: 0,
        });
      }
      const grp = map.get(key)!;
      if (log.status === 'Baru') grp.baruCountInGroup++;
      if (log.dari.trim().toLowerCase() === 'lama') {
        grp.legacyLogs.push(log);
      } else {
        grp.regularLogs.push(log);
      }
    });

    const sortFn = (a: BookLog, b: BookLog) => {
      const ta = a.tanggal || '';
      const tb = b.tanggal || '';
      if (ta !== tb) {
        return sortOrder === 'newest' ? tb.localeCompare(ta) : ta.localeCompare(tb);
      }
      return sortOrder === 'newest'
        ? (b.id || '').localeCompare(a.id || '')
        : (a.id || '').localeCompare(b.id || '');
    };

    const groups = Array.from(map.values());
    groups.forEach((g) => {
      g.regularLogs.sort(sortFn);
      g.legacyLogs.sort(sortFn);
    });

    groups.sort((a, b) => {
      const aHasBaru = a.baruCountInGroup > 0 ? 0 : 1;
      const bHasBaru = b.baruCountInGroup > 0 ? 0 : 1;
      if (aHasBaru !== bHasBaru) return aHasBaru - bHasBaru;
      return a.bookNo - b.bookNo;
    });

    return groups;
  }, [filteredLogs, bookMap, sortOrder]);

  const toggleGroupCollapse = (key: string) => {
    setCollapsedBookIds((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const renderLogRow = (log: BookLog, isLegacyStyle = false) => {
    const jenisCfg = getLogJenisBadgeConfig(log.jenis);
    const dariBadge = getLogDariBadgeConfig(log.dari);
    const isBaru = log.status === 'Baru';
    const isMasalahBaru = isBaru && log.jenis === 'Masalah';
    const isMenuOpen = openMenuLogId === log.id;
    const isDeleting = confirmDeleteLogId === log.id;

    const leftBorderClass = isMasalahBaru
      ? 'border-l-4 border-l-rose-500'
      : isBaru
      ? 'border-l-4 border-l-orange-500'
      : 'border-l-4 border-l-transparent';

    return (
      <div
        key={log.id}
        className={`px-3.5 sm:px-4 py-3 bg-white dark:bg-slate-900 ${leftBorderClass} ${
          isLegacyStyle ? 'opacity-75 bg-slate-50/70 dark:bg-slate-900/60' : ''
        } transition-colors`}
      >
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2.5">
          {/* Kiri: Tanggal + Dari + Jenis + Isi */}
          <div className="flex-1 min-w-0 space-y-1.5">
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="font-mono font-bold text-[11px] text-slate-500 dark:text-slate-400 tabular-nums shrink-0 min-w-[46px]">
                {formatLogDateShort(log.tanggal)}
              </span>
              {log.dari.trim() !== '' && (
                <span
                  className={`px-2 py-0.5 rounded-md text-[11px] font-bold border ${dariBadge}`}
                >
                  {log.dari}
                </span>
              )}
              <span
                className={`px-2 py-0.5 rounded-md text-[11px] font-bold border ${jenisCfg.bg} ${jenisCfg.text} ${jenisCfg.border}`}
              >
                {jenisCfg.label}
              </span>
            </div>

            <p
              className={`text-xs sm:text-sm leading-relaxed whitespace-pre-wrap break-words ${
                isLegacyStyle
                  ? 'text-slate-500 dark:text-slate-400'
                  : 'text-slate-800 dark:text-slate-200'
              }`}
            >
              {log.isi}
            </p>
          </div>

          {/* Kanan: Status 1-ketukan & Menu 3 Titik */}
          <div className="flex items-center justify-end gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => void onToggleLogStatus(log)}
              className={`min-h-[44px] sm:min-h-[34px] px-3 py-1.5 rounded-xl text-xs font-bold border inline-flex items-center gap-1.5 transition-colors ${
                isBaru
                  ? 'bg-orange-50 text-orange-700 border-orange-200 hover:bg-orange-100 dark:bg-orange-950/50 dark:text-orange-300 dark:border-orange-800'
                  : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800'
              }`}
              title={isBaru ? 'Klik untuk tandai Selesai' : 'Klik untuk buka kembali (Baru)'}
            >
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
              <span>{log.status}</span>
            </button>

            <div className="relative" data-log-menu>
              <button
                type="button"
                onClick={() => setOpenMenuLogId(isMenuOpen ? null : log.id || null)}
                className="min-w-[44px] min-h-[44px] sm:min-w-[34px] sm:min-h-[34px] rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center"
                aria-label="Opsi catatan"
              >
                <MoreVertical className="w-4 h-4" />
              </button>

              {isMenuOpen && (
                <div className="absolute right-0 mt-1 w-36 bg-white dark:bg-slate-900 rounded-xl shadow-xl border border-slate-200 dark:border-slate-800 py-1 z-30">
                  <button
                    type="button"
                    onClick={() => {
                      setOpenMenuLogId(null);
                      setFormModalState({ isOpen: true, editingLog: log });
                    }}
                    className="w-full min-h-[40px] px-3 py-1.5 text-left text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2"
                  >
                    <Edit3 className="w-3.5 h-3.5 text-blue-600" />
                    <span>Edit</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setOpenMenuLogId(null);
                      setConfirmDeleteLogId(log.id || null);
                    }}
                    className="w-full min-h-[40px] px-3 py-1.5 text-left text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 flex items-center gap-2"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Hapus</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Inline konfirmasi hapus */}
        {isDeleting && (
          <div className="mt-2.5 p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-bold text-rose-800 dark:text-rose-200">
              Hapus catatan log ini?
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={async () => {
                  await onDeleteLog(log);
                  setConfirmDeleteLogId(null);
                }}
                className="min-h-[38px] px-3 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold"
              >
                Ya, Hapus
              </button>
              <button
                type="button"
                onClick={() => setConfirmDeleteLogId(null)}
                className="min-h-[38px] px-3 py-1 rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold"
              >
                Batal
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderFilterFormContent = () => (
    <div className="space-y-3.5">
      <div>
        <label className="text-[11px] font-bold uppercase text-slate-500 block mb-1">
          Jenis Catatan
        </label>
        <select
          value={filterJenis}
          onChange={(e) => setFilterJenis(e.target.value)}
          className="w-full min-h-[44px] px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-base sm:text-xs font-semibold text-slate-900 dark:text-white"
        >
          <option value="Semua">Semua Jenis</option>
          {LOG_JENIS_OPTIONS.map((j) => (
            <option key={j} value={j}>
              {j}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="text-[11px] font-bold uppercase text-slate-500 block mb-1">
          Dari (Pengirim)
        </label>
        <select
          value={filterDari}
          onChange={(e) => setFilterDari(e.target.value)}
          className="w-full min-h-[44px] px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-base sm:text-xs font-semibold text-slate-900 dark:text-white"
        >
          <option value="Semua">Semua Pengirim</option>
          {allDariOptions.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="text-[11px] font-bold uppercase text-slate-500 block mb-1">
          Buku
        </label>
        <select
          value={filterBookId}
          onChange={(e) => setFilterBookId(e.target.value)}
          className="w-full min-h-[44px] px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-base sm:text-xs font-semibold text-slate-900 dark:text-white"
        >
          <option value="Semua">Semua Buku</option>
          {books.map((b) => (
            <option key={b.id || b.no} value={b.id || ''}>
              #{b.no} — {b.judul}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[11px] font-bold uppercase text-slate-500 block mb-1">
            Dari Tgl
          </label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="w-full min-h-[44px] px-2.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-base sm:text-xs text-slate-900 dark:text-white"
          />
        </div>
        <div>
          <label className="text-[11px] font-bold uppercase text-slate-500 block mb-1">
            Sampai Tgl
          </label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="w-full min-h-[44px] px-2.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-base sm:text-xs text-slate-900 dark:text-white"
          />
        </div>
      </div>

      <div className="flex items-center justify-between pt-2">
        <button
          type="button"
          onClick={() => {
            setFilterJenis('Semua');
            setFilterDari('Semua');
            setFilterBookId('Semua');
            setDateFrom('');
            setDateTo('');
          }}
          className="min-h-[40px] px-3 py-1.5 rounded-xl text-xs font-bold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
        >
          Reset
        </button>
        <button
          type="button"
          onClick={() => setIsFilterOpen(false)}
          className="min-h-[40px] px-4 py-1.5 rounded-xl bg-blue-600 text-white text-xs font-bold"
        >
          Terapkan
        </button>
      </div>
    </div>
  );

  return (
    <div className="space-y-4 pb-16 sm:pb-8">
      {/* Header & Tab [Baru N] [Semua M] [Selesai K] */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-lg sm:text-xl font-extrabold text-slate-900 dark:text-white tracking-tight">
            Log Catatan Per Buku
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Pantau revisi, pertanyaan, dan kendala lintas semua naskah buku.
          </p>
        </div>

        <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700 self-start sm:self-auto">
          {(
            [
              { key: 'Baru', count: counts.baru },
              { key: 'Semua', count: counts.semua },
              { key: 'Selesai', count: counts.selesai },
            ] as const
          ).map((t) => {
            const active = statusTab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => handleSelectStatusTab(t.key)}
                className={`min-h-[40px] px-3.5 py-1.5 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 transition-colors ${
                  active
                    ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <span>{t.key}</span>
                <span
                  className={`px-1.5 py-0.5 rounded-md text-[10px] font-extrabold tabular-nums ${
                    active && t.key === 'Baru' && t.count > 0
                      ? 'bg-orange-100 text-orange-700 dark:bg-orange-950/60 dark:text-orange-300'
                      : 'bg-slate-200/80 dark:bg-slate-700 text-slate-700 dark:text-slate-200'
                  }`}
                >
                  {t.count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Satu Baris Kontrol: Cari, Filter, Urutkan, Tambah Catatan */}
      <div className="bg-white dark:bg-slate-900 p-3 sm:p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-2.5">
        <div className="flex flex-wrap sm:flex-nowrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari isi catatan atau judul buku..."
              className="w-full min-h-[44px] pl-9 pr-9 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-base sm:text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center text-slate-400"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="relative" ref={filterBtnRef}>
            <button
              type="button"
              onClick={() => setIsFilterOpen((v) => !v)}
              className={`min-h-[44px] px-3 py-2 rounded-xl border text-xs font-bold inline-flex items-center gap-1.5 shrink-0 ${
                activeFiltersCount > 0 || isFilterOpen
                  ? 'bg-blue-50 border-blue-200 text-blue-600 dark:bg-blue-950/60 dark:border-blue-800 dark:text-blue-400'
                  : 'bg-slate-50 border-slate-200 text-slate-700 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300'
              }`}
            >
              <Filter className="w-3.5 h-3.5" />
              <span>Filter</span>
              {activeFiltersCount > 0 && (
                <span className="px-1.5 py-0.5 rounded-full bg-blue-600 text-white text-[10px] font-extrabold tabular-nums">
                  {activeFiltersCount}
                </span>
              )}
            </button>

            {/* Popover di Desktop (>= 768px) */}
            {isFilterOpen && (
              <div className="hidden md:block absolute right-0 mt-2 w-80 bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-4 z-40">
                {renderFilterFormContent()}
              </div>
            )}
          </div>

          <div className="relative shrink-0">
            <select
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value as 'newest' | 'oldest')}
              aria-label="Urutkan catatan"
              className="min-h-[44px] appearance-none pl-3 pr-8 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-base sm:text-xs font-bold cursor-pointer focus:outline-none"
            >
              <option value="newest">Terbaru di atas</option>
              <option value="oldest">Terlama di atas</option>
            </select>
            <ArrowUpDown className="w-3 h-3 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          {/* Tombol Tambah Catatan (Desktop) */}
          <button
            type="button"
            disabled={books.length === 0}
            onClick={() => setFormModalState({ isOpen: true, editingLog: null })}
            className="hidden sm:inline-flex min-h-[44px] px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-xs font-bold items-center gap-1.5 shrink-0 shadow-xs"
          >
            <Plus className="w-4 h-4" />
            <span>Tambah Catatan</span>
          </button>
        </div>

        {/* Chip Filter Aktif yang bisa dihapus satu per satu */}
        {activeFiltersCount > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            {filterJenis !== 'Semua' && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 text-xs font-semibold">
                <span>Jenis: {filterJenis}</span>
                <button type="button" onClick={() => setFilterJenis('Semua')} aria-label="Hapus filter jenis">
                  <X className="w-3.5 h-3.5" />
                </button>
              </span>
            )}
            {filterDari !== 'Semua' && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 text-xs font-semibold">
                <span>Dari: {filterDari}</span>
                <button type="button" onClick={() => setFilterDari('Semua')} aria-label="Hapus filter pengirim">
                  <X className="w-3.5 h-3.5" />
                </button>
              </span>
            )}
            {filterBookId !== 'Semua' && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 text-xs font-semibold max-w-xs truncate">
                <span className="truncate">
                  Buku: #{bookMap.get(filterBookId)?.no} {bookMap.get(filterBookId)?.judul}
                </span>
                <button type="button" onClick={() => setFilterBookId('Semua')} aria-label="Hapus filter buku">
                  <X className="w-3.5 h-3.5 shrink-0" />
                </button>
              </span>
            )}
            {(dateFrom || dateTo) && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 text-xs font-semibold">
                <span>
                  Tanggal: {dateFrom || '...'} – {dateTo || '...'}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setDateFrom('');
                    setDateTo('');
                  }}
                  aria-label="Hapus filter tanggal"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </span>
            )}
          </div>
        )}
      </div>

      {/* Bottom Sheet Filter di HP (< 768px) */}
      {isFilterOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex items-end bg-black/50 backdrop-blur-xs">
          <div className="absolute inset-0" onClick={() => setIsFilterOpen(false)} />
          <div className="relative z-10 w-full bg-white dark:bg-slate-900 rounded-t-3xl p-5 border-t border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
                Filter Log Catatan
              </h3>
              <button
                type="button"
                onClick={() => setIsFilterOpen(false)}
                className="min-w-[44px] min-h-[44px] flex items-center justify-center text-slate-400"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            {renderFilterFormContent()}
          </div>
        </div>
      )}

      {/* Daftar Log Dikelompokkan Per Buku */}
      {groupedBooks.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-10 text-center border border-slate-200/80 dark:border-slate-800 space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-400 mx-auto flex items-center justify-center">
            <MessageSquareText className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-slate-900 dark:text-white">
            {statusTab === 'Baru' && activeFiltersCount === 0 && !searchQuery
              ? 'Tidak ada catatan baru'
              : 'Tidak ada catatan yang cocok'}
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
            {statusTab === 'Baru' && activeFiltersCount === 0 && !searchQuery
              ? 'Semua catatan log buku sudah berstatus Selesai. Tambah catatan baru atau buka tab Semua.'
              : 'Coba ubah filter atau kata kunci pencarian untuk melihat catatan lainnya.'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {groupedBooks.map((group) => {
            const gKey = group.bookId || String(group.bookNo);
            const isCollapsed = Boolean(collapsedBookIds[gKey]);
            const isLegacyExpanded = Boolean(expandedLegacyBookIds[gKey]);

            return (
              <section
                key={gKey}
                className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs overflow-hidden"
              >
                {/* Header Grup Buku */}
                <div className="px-4 py-3 bg-slate-50/80 dark:bg-slate-800/50 border-b border-slate-200/80 dark:border-slate-800 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <button
                      type="button"
                      onClick={() => toggleGroupCollapse(gKey)}
                      className="min-w-[36px] min-h-[36px] rounded-lg text-slate-500 hover:bg-slate-200/70 dark:hover:bg-slate-700 flex items-center justify-center shrink-0"
                      aria-label={isCollapsed ? 'Tampilkan catatan buku' : 'Sembunyikan catatan buku'}
                    >
                      {isCollapsed ? (
                        <ChevronRight className="w-4 h-4" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )}
                    </button>

                    <span className="px-2 py-0.5 rounded-md bg-slate-200/80 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-mono text-xs font-extrabold shrink-0">
                      #{group.bookNo}
                    </span>

                    <button
                      type="button"
                      disabled={!group.book}
                      onClick={() => group.book && onOpenBookCatatan(group.book)}
                      className="text-left text-sm font-extrabold text-slate-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 truncate transition-colors"
                      title="Buka halaman detail buku tab Catatan"
                    >
                      {group.judul}
                    </button>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {group.baruCountInGroup > 0 && (
                      <span className="px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 dark:bg-orange-950/60 dark:text-orange-300 text-[11px] font-bold">
                        {group.baruCountInGroup} baru
                      </span>
                    )}
                    <span className="text-[11px] font-semibold text-slate-400">
                      {group.regularLogs.length + group.legacyLogs.length} log
                    </span>
                  </div>
                </div>

                {/* Daftar Baris Catatan Grup */}
                {!isCollapsed && (
                  <div>
                    <div className="divide-y divide-slate-100 dark:divide-slate-800">
                      {group.regularLogs.map((log) => renderLogRow(log, false))}
                    </div>

                    {/* Riwayat lama (dari = 'Lama') dilipat di bagian bawah */}
                    {group.legacyLogs.length > 0 && (
                      <div className="border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40">
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedLegacyBookIds((prev) => ({
                              ...prev,
                              [gKey]: !prev[gKey],
                            }))
                          }
                          className="w-full min-h-[44px] px-4 py-2 flex items-center justify-between text-xs font-bold text-slate-500 dark:text-slate-400 hover:bg-slate-100/80 dark:hover:bg-slate-800/50 transition-colors"
                        >
                          <span className="inline-flex items-center gap-1.5">
                            <History className="w-3.5 h-3.5" />
                            <span>Riwayat lama ({group.legacyLogs.length})</span>
                          </span>
                          {isLegacyExpanded ? (
                            <ChevronDown className="w-4 h-4" />
                          ) : (
                            <ChevronRight className="w-4 h-4" />
                          )}
                        </button>

                        {isLegacyExpanded && (
                          <div className="divide-y divide-slate-100 dark:divide-slate-800 border-t border-slate-100 dark:border-slate-800">
                            {group.legacyLogs.map((log) => renderLogRow(log, true))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      {/* Floating Action Button Tambah Catatan di HP */}
      {books.length > 0 && (
        <button
          type="button"
          onClick={() => setFormModalState({ isOpen: true, editingLog: null })}
          className="sm:hidden fixed bottom-20 right-4 z-30 h-12 px-4 rounded-full bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-lg shadow-blue-600/30 inline-flex items-center gap-1.5"
        >
          <Plus className="w-4 h-4" />
          <span>Tambah Catatan</span>
        </button>
      )}

      {/* Modal Tambah / Edit Catatan Log */}
      <LogFormModal
        isOpen={formModalState.isOpen}
        onClose={() => setFormModalState({ isOpen: false, editingLog: null })}
        books={books}
        editingLog={formModalState.editingLog}
        onSubmit={async (data) => {
          if (data.id && formModalState.editingLog) {
            await onUpdateLog(formModalState.editingLog, {
              bookId: data.bookId,
              bookNo: data.bookNo,
              tanggal: data.tanggal,
              dari: data.dari,
              isi: data.isi,
              jenis: data.jenis,
              status: data.status,
            });
          } else {
            await onCreateLog({
              bookId: data.bookId,
              bookNo: data.bookNo,
              tanggal: data.tanggal,
              dari: data.dari,
              isi: data.isi,
              jenis: data.jenis,
              status: data.status,
            });
          }
        }}
      />
    </div>
  );
};
