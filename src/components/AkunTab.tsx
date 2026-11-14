import React, { useState } from 'react';
import {
  Mail,
  ShieldCheck,
  LogOut,
  Sun,
  Moon,
  Target,
  FileSpreadsheet,
  BookOpen,
  Wallet,
  CheckCircle2,
  Sparkles,
  Download,
  Upload,
  Database,
  MessageSquareText,
  Layers,
  RotateCcw,
  Clock,
  SlidersHorizontal,
  ChevronDown,
} from 'lucide-react';
import { AuthUser, BookJob, BookLog, LastImportRecord, TabType } from '../types';
import { formatLogDateShort, formatRupiah } from '../utils/formatters';
import { MOCK_BOOK_JOBS } from '../services/api';
import {
  DEFAULT_BATAS_HARI_TERLAMBAT,
  DEFAULT_STATUS_DI_SAYA,
  DEFAULT_STATUS_SELESAI,
  STATUS_GROUPS,
  StatusGroupKey,
  getStatusGroupMeta,
  resolveStatusGroup,
} from '../config/masterData';
import { buildCombinedStatusList } from '../utils/bookHelpers';
import {
  FULL_TEMPLATE_COLUMNS,
  downloadTemplateXlsx,
  downloadExampleXlsx,
  downloadExportXlsx,
  exportBooksToCsv,
  generateTemplateCsv,
  downloadFile,
} from '../utils/sheetHelpers';
import {
  downloadLogExportXlsx,
  downloadLogTemplateXlsx,
} from '../utils/logHelpers';

interface AkunTabProps {
  currentUser: AuthUser | null;
  onLogout: () => void;
  isDark: boolean;
  onToggleDark: () => void;
  monthlyTarget: number;
  onSaveMonthlyTarget: (target: number) => void;
  books: BookJob[];
  logs?: BookLog[];
  lastImport?: LastImportRecord | null;
  isRollingBackImport?: boolean;
  customStatuses?: string[];
  statusGroupOverrides?: Record<string, StatusGroupKey>;
  onSaveStatusGroupOverrides?: (next: Record<string, StatusGroupKey>) => Promise<void> | void;
  statusDiSaya?: string[];
  onSaveStatusDiSaya?: (next: string[]) => Promise<void> | void;
  statusSelesai?: string;
  onSaveStatusSelesai?: (next: string) => Promise<void> | void;
  batasHariTerlambat?: number;
  onSaveBatasHariTerlambat?: (days: number) => Promise<void> | void;
  onTabChange: (tab: TabType) => void;
  onOpenImportCsv?: () => void;
  onOpenImportSheets?: () => void;
  onOpenImportWorkbook?: () => void;
  onOpenImportLogs?: () => void;
  onRollbackLastImport?: (importId: string) => Promise<void>;
}

export const AkunTab: React.FC<AkunTabProps> = ({
  currentUser,
  onLogout,
  isDark,
  onToggleDark,
  monthlyTarget,
  onSaveMonthlyTarget,
  books,
  logs = [],
  lastImport = null,
  isRollingBackImport = false,
  customStatuses = [],
  statusGroupOverrides = {},
  onSaveStatusGroupOverrides,
  statusDiSaya = [...DEFAULT_STATUS_DI_SAYA],
  onSaveStatusDiSaya,
  statusSelesai = DEFAULT_STATUS_SELESAI,
  onSaveStatusSelesai,
  batasHariTerlambat = DEFAULT_BATAS_HARI_TERLAMBAT,
  onSaveBatasHariTerlambat,
  onTabChange,
  onOpenImportCsv,
  onOpenImportSheets,
  onOpenImportWorkbook,
  onOpenImportLogs,
  onRollbackLastImport,
}) => {
  const [isEditingTarget, setIsEditingTarget] = useState(false);
  const [targetInput, setTargetInput] = useState<number>(monthlyTarget);
  const [batasInput, setBatasInput] = useState<string>(String(batasHariTerlambat));
  const [isEditingBatas, setIsEditingBatas] = useState(false);
  const [isGroupEditorOpen, setIsGroupEditorOpen] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [confirmRollback, setConfirmRollback] = useState(false);

  const allStatuses = React.useMemo(() => {
    const combined = buildCombinedStatusList(customStatuses);
    const set = new Set<string>(combined);
    books.forEach((b) => {
      if (b.statusProgres && b.statusProgres.trim()) set.add(b.statusProgres.trim());
    });
    return Array.from(set);
  }, [customStatuses, books]);

  // Statistik Ringkas Akun
  const totalJudul = books.length;
  const selesaiJudul = books.filter((b) => b.statusProgres === 'Selesai').length;
  const lunasNominal = books
    .filter((b) => b.statusBayar === 'Lunas')
    .reduce((sum, b) => sum + b.nilaiJasa, 0);
  const totalNominal = books.reduce((sum, b) => sum + b.nilaiJasa, 0);
  const stuckCount = books.filter((b) => b.stuck === 'Ya').length;

  const handleSaveTarget = (e: React.FormEvent) => {
    e.preventDefault();
    if (targetInput > 0) {
      onSaveMonthlyTarget(targetInput);
      setIsEditingTarget(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-in pb-12">
      {/* 1. Kartu Profil Utama Akun */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 border border-slate-200/80 dark:border-slate-800 shadow-sm relative overflow-hidden">
        {/* Dekorasi Aksen Latar */}
        <div className="absolute -top-12 -right-12 w-48 h-48 bg-gradient-to-br from-blue-500/10 to-indigo-500/10 rounded-full blur-2xl pointer-events-none" />

        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5 sm:gap-6 relative z-10">
          {/* Avatar Google Profile */}
          <div className="relative shrink-0">
            {currentUser?.photoUrl ? (
              <img
                src={currentUser.photoUrl}
                alt={currentUser.name}
                className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl object-cover ring-4 ring-blue-500/20 shadow-md"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />
            ) : (
              <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white font-extrabold text-3xl flex items-center justify-center shadow-md">
                {currentUser?.name?.charAt(0) || 'S'}
              </div>
            )}
            <span
              className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-slate-900 flex items-center justify-center"
              title="Sesi Aktif"
            >
              <span className="w-2 h-2 rounded-full bg-white" />
            </span>
          </div>

          {/* Info Detail Akun */}
          <div className="flex-1 text-center sm:text-left min-w-0">
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 mb-1.5">
              <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                {currentUser?.name || 'Schnell Desain'}
              </h2>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                <ShieldCheck className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                <span>Google Verified</span>
              </span>
            </div>

            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 flex items-center justify-center sm:justify-start gap-1.5 font-medium">
              <Mail className="w-4 h-4 text-slate-400 shrink-0" />
              <span className="truncate">{currentUser?.email || 'schnell.desain@gmail.com'}</span>
            </p>

            <div className="mt-3 flex flex-wrap items-center justify-center sm:justify-start gap-2">
              <span className="text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                Peran: <strong>Desainer Utama & Admin Billing</strong>
              </span>
              <span className="text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300">
                Status: <strong>Online &amp; Terotorisasi</strong>
              </span>
              <span className="text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-purple-500" />
                <span>Cloud Sync: <strong>Firestore Aktif</strong></span>
              </span>
            </div>
          </div>

          {/* Tombol Logout Cepat */}
          <div className="shrink-0 self-center sm:self-start">
            <button
              onClick={() => setShowLogoutConfirm(true)}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/40 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900 flex items-center gap-1.5 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              <span>Keluar Akun</span>
            </button>
          </div>
        </div>

        {/* Statistik Ringkas Akun */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-6 border-t border-slate-100 dark:border-slate-800/80">
          <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200/60 dark:border-slate-800">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
              TOTAL BUKU
            </span>
            <span className="text-lg sm:text-xl font-extrabold text-slate-900 dark:text-white mt-0.5 block">
              {totalJudul} Judul
            </span>
            <span className="text-[10px] text-slate-500">{selesaiJudul} selesai dikerjakan</span>
          </div>

          <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200/60 dark:border-slate-800">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
              TOTAL NILAI JASA
            </span>
            <span className="text-lg sm:text-xl font-extrabold text-blue-600 dark:text-blue-400 mt-0.5 block">
              {formatRupiah(totalNominal)}
            </span>
            <span className="text-[10px] text-slate-500">Nilai proyek tercatat</span>
          </div>

          <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200/60 dark:border-slate-800">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
              PENDAPATAN LUNAS
            </span>
            <span className="text-lg sm:text-xl font-extrabold text-emerald-600 dark:text-emerald-400 mt-0.5 block">
              {formatRupiah(lunasNominal)}
            </span>
            <span className="text-[10px] text-slate-500">Dana sudah diterima</span>
          </div>

          <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200/60 dark:border-slate-800">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
              BUKU KENDALA (STUCK)
            </span>
            <span className={`text-lg sm:text-xl font-extrabold mt-0.5 block ${stuckCount > 0 ? 'text-rose-600' : 'text-slate-900 dark:text-white'}`}>
              {stuckCount} Buku
            </span>
            <span className="text-[10px] text-slate-500">{stuckCount > 0 ? 'Perlu follow-up' : 'Semua lancar'}</span>
          </div>
        </div>
      </div>

      {/* 2. Preferensi Akun & Tampilan */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-7 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-5">
        <h3 className="text-sm font-extrabold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          <span>Preferensi & Personalisasi Akun</span>
        </h3>

        <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
          {/* Mode Tampilan Gelap / Terang */}
          <div className="py-4 flex items-center justify-between gap-4">
            <div>
              <div className="font-bold text-sm text-slate-900 dark:text-white">
                Tema Tampilan Dasbor
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Pilih tampilan {isDark ? 'Mode Gelap (Dark Mode)' : 'Mode Terang (Light Mode)'} sesuai kenyamanan Anda
              </div>
            </div>

            <button
              onClick={onToggleDark}
              className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 border transition-all ${
                isDark
                  ? 'bg-slate-800 text-amber-400 border-slate-700 shadow-xs'
                  : 'bg-slate-100 text-slate-700 border-slate-200 shadow-xs'
              }`}
            >
              {isDark ? (
                <>
                  <Sun className="w-4 h-4 text-amber-400" />
                  <span>Mode Gelap Aktif</span>
                </>
              ) : (
                <>
                  <Moon className="w-4 h-4 text-slate-600" />
                  <span>Mode Terang Aktif</span>
                </>
              )}
            </button>
          </div>

          {/* Target Produksi Bulanan */}
          <div className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-1.5">
                <Target className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span>Target Produksi Buku Bulanan</span>
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Acuan indikator pencapaian di kartu Target Bulanan pada Dashboard
              </div>
            </div>

            {isEditingTarget ? (
              <form onSubmit={handleSaveTarget} className="flex items-center gap-2">
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={100}
                  value={targetInput}
                  onChange={(e) => setTargetInput(parseInt(e.target.value, 10) || 1)}
                  className="w-20 min-h-[44px] px-3 py-1.5 rounded-xl border border-blue-500 bg-white dark:bg-slate-800 text-base sm:text-sm font-extrabold text-slate-900 dark:text-white text-center focus:outline-none"
                  autoFocus
                />
                <button
                  type="submit"
                  className="min-h-[44px] px-3 py-1.5 bg-blue-600 text-white font-bold text-xs rounded-xl hover:bg-blue-700"
                >
                  Simpan
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditingTarget(false)}
                  className="min-h-[44px] px-2.5 py-1.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold text-xs rounded-xl"
                >
                  Batal
                </button>
              </form>
            ) : (
              <div className="flex items-center gap-3">
                <span className="text-base font-extrabold text-blue-600 dark:text-blue-400">
                  {monthlyTarget} Buku / Bulan
                </span>
                <button
                  onClick={() => {
                    setTargetInput(monthlyTarget);
                    setIsEditingTarget(true);
                  }}
                  className="min-h-[44px] sm:min-h-[36px] px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200"
                >
                  Ubah
                </button>
              </div>
            )}
          </div>

          {/* Batas Hari Terlambat */}
          <div className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-rose-500" />
                <span>Batas Hari Terlambat</span>
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Buku &ldquo;Di Saya&rdquo; atau terlama di proses ditandai merah bila melewati batas hari ini (bawaan: 3 hari)
              </div>
            </div>

            {isEditingBatas ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const val = Math.max(1, Math.min(365, parseInt(batasInput, 10) || DEFAULT_BATAS_HARI_TERLAMBAT));
                  onSaveBatasHariTerlambat?.(val);
                  setIsEditingBatas(false);
                }}
                className="flex items-center gap-2"
              >
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={365}
                  value={batasInput}
                  onChange={(e) => setBatasInput(e.target.value.replace(/[^0-9]/g, ''))}
                  className="w-20 min-h-[44px] px-3 py-1.5 rounded-xl border border-blue-500 bg-white dark:bg-slate-800 text-base sm:text-sm font-extrabold text-slate-900 dark:text-white text-center focus:outline-none tabular-nums"
                  autoFocus
                />
                <button
                  type="submit"
                  className="min-h-[44px] px-3 py-1.5 bg-blue-600 text-white font-bold text-xs rounded-xl hover:bg-blue-700"
                >
                  Simpan
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditingBatas(false)}
                  className="min-h-[44px] px-2.5 py-1.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold text-xs rounded-xl"
                >
                  Batal
                </button>
              </form>
            ) : (
              <div className="flex items-center gap-3">
                <span className="text-base font-extrabold text-slate-900 dark:text-white tabular-nums">
                  {batasHariTerlambat} Hari
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setBatasInput(String(batasHariTerlambat));
                    setIsEditingBatas(true);
                  }}
                  className="min-h-[44px] sm:min-h-[36px] px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200"
                >
                  Ubah
                </button>
              </div>
            )}
          </div>

          {/* Daftar Status "Di Saya" & Status Selesai */}
          <div className="py-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <div className="font-bold text-sm text-slate-900 dark:text-white">
                  Daftar Status &ldquo;Di Saya&rdquo; &amp; Status Selesai
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Pilih status yang dihitung sebagai antrean tindakan saya (badge oranye &amp; menu Buku)
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs font-semibold text-slate-500">Status Selesai:</span>
                <select
                  value={statusSelesai}
                  onChange={(e) => onSaveStatusSelesai?.(e.target.value)}
                  className="min-h-[44px] sm:min-h-[36px] px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-base sm:text-xs font-bold text-slate-800 dark:text-white"
                >
                  {allStatuses.map((st) => (
                    <option key={st} value={st}>
                      {st}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {allStatuses.map((st) => {
                const isSelected = statusDiSaya.some(
                  (item) => item.trim().toLowerCase() === st.trim().toLowerCase()
                );
                return (
                  <button
                    key={st}
                    type="button"
                    onClick={() => {
                      if (!onSaveStatusDiSaya) return;
                      const next = isSelected
                        ? statusDiSaya.filter((i) => i.trim().toLowerCase() !== st.trim().toLowerCase())
                        : [...statusDiSaya, st];
                      onSaveStatusDiSaya(next);
                    }}
                    className={`min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors ${
                      isSelected
                        ? 'bg-orange-500 text-white border-orange-500'
                        : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-300'
                    }`}
                  >
                    {st}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Kelompok Status */}
          <div className="py-4 space-y-3">
            <button
              type="button"
              onClick={() => setIsGroupEditorOpen((p) => !p)}
              className="w-full min-h-[44px] flex items-center justify-between gap-3 text-left"
            >
              <div>
                <div className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-1.5">
                  <SlidersHorizontal className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  <span>Kelompok Status</span>
                  {Object.keys(statusGroupOverrides).length > 0 && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300">
                      {Object.keys(statusGroupOverrides).length} diubah
                    </span>
                  )}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Atur pemetaan tiap status ke kelompok Tahap Awal, Progres, Masalah, atau Finish
                </div>
              </div>
              <ChevronDown
                className={`w-4 h-4 text-slate-400 shrink-0 transition-transform duration-150 ${
                  isGroupEditorOpen ? 'rotate-180' : ''
                }`}
              />
            </button>

            {isGroupEditorOpen && (
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800 space-y-2.5">
                <div className="flex items-center justify-between gap-2 pb-1">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    Status ({allStatuses.length})
                  </span>
                  {Object.keys(statusGroupOverrides).length > 0 && onSaveStatusGroupOverrides && (
                    <button
                      type="button"
                      onClick={() => onSaveStatusGroupOverrides({})}
                      className="text-xs font-bold text-rose-600 dark:text-rose-400 hover:underline"
                    >
                      Reset ke bawaan
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {allStatuses.map((st) => {
                    const currentGroup = resolveStatusGroup(st, statusGroupOverrides);
                    const meta = getStatusGroupMeta(currentGroup);
                    return (
                      <div
                        key={st}
                        className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: meta.hex }}
                          />
                          <span className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                            {st}
                          </span>
                        </div>
                        <select
                          value={currentGroup}
                          onChange={(e) => {
                            if (!onSaveStatusGroupOverrides) return;
                            const nextGroup = e.target.value as StatusGroupKey;
                            const nextOverrides = {
                              ...statusGroupOverrides,
                              [st]: nextGroup,
                            };
                            onSaveStatusGroupOverrides(nextOverrides);
                          }}
                          className="min-h-[38px] px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-base sm:text-xs font-bold text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-700 shrink-0"
                        >
                          {STATUS_GROUPS.map((g) => (
                            <option key={g.key} value={g.key}>
                              {g.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Kartu Data & Cadangan */}
          <div className="py-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <div className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-1.5">
                  <Database className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  <span>Data &amp; Cadangan</span>
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Impor data buku (.xlsx / .csv / Google Sheet) ke Cloud Firestore atau ekspor cadangan CSV
                </div>
              </div>

              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 self-start sm:self-auto">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <span>Cloud Firestore ({books.length} Buku)</span>
              </span>
            </div>

            {/* Tombol Utama Impor & Ekspor */}
            <div className="space-y-2.5">
              {onOpenImportWorkbook && (
                <button
                  type="button"
                  onClick={onOpenImportWorkbook}
                  className="w-full min-h-[46px] py-2.5 px-4 rounded-xl bg-gradient-to-r from-blue-600 to-emerald-600 hover:from-blue-700 hover:to-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-sm"
                >
                  <Layers className="w-4 h-4" />
                  <span>Impor Workbook (Semua Tab: Buku, Log &amp; Keuangan)</span>
                </button>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                <button
                  type="button"
                  onClick={onOpenImportCsv}
                  className="min-h-[44px] py-2.5 px-3.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-colors shadow-xs"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Impor Excel / CSV</span>
                </button>

                <button
                  type="button"
                  onClick={onOpenImportSheets}
                  className="min-h-[44px] py-2.5 px-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-colors shadow-xs"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  <span>Impor Google Sheet</span>
                </button>

                <button
                  type="button"
                  disabled={books.length === 0}
                  onClick={() => downloadExportXlsx(books, 'Export_Data_Buku_Schnell.xlsx')}
                  className="min-h-[44px] py-2.5 px-3.5 rounded-xl bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 font-bold text-xs flex items-center justify-center gap-1.5 border border-slate-200 dark:border-slate-700 transition-colors disabled:opacity-40"
                >
                  <Download className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                  <span>Ekspor Excel (.xlsx)</span>
                </button>

                <button
                  type="button"
                  disabled={books.length === 0}
                  onClick={() => {
                    const csvContent = exportBooksToCsv(books);
                    downloadFile(csvContent, 'Export_Data_Buku_Schnell.csv');
                  }}
                  className="min-h-[44px] py-2.5 px-3.5 rounded-xl bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs flex items-center justify-center gap-1.5 border border-slate-200 dark:border-slate-700 transition-colors disabled:opacity-40"
                >
                  <Download className="w-3.5 h-3.5 text-slate-500" />
                  <span>Ekspor CSV</span>
                </button>
              </div>
            </div>

            {/* Impor / Ekspor / Template LOG CATATAN PER BUKU */}
            <div className="bg-orange-50/60 dark:bg-orange-950/20 p-4 rounded-2xl border border-orange-200/70 dark:border-orange-900/50 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 font-bold text-xs text-slate-900 dark:text-white">
                  <MessageSquareText className="w-4 h-4 text-orange-600 dark:text-orange-400 shrink-0" />
                  <span>Log Catatan Per Buku ({logs.length} Catatan)</span>
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300">
                  6 Kolom (No–Status)
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {onOpenImportLogs && (
                  <button
                    type="button"
                    onClick={onOpenImportLogs}
                    className="min-h-[42px] py-2 px-3 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>Impor Log Catatan</span>
                  </button>
                )}
                <button
                  type="button"
                  disabled={logs.length === 0}
                  onClick={() => downloadLogExportXlsx(books, logs, 'Log_Catatan_Per_Buku_Schnell.xlsx')}
                  className="min-h-[42px] py-2 px-3 rounded-xl bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 font-bold text-xs flex items-center justify-center gap-1.5 border border-slate-200 dark:border-slate-700 transition-colors disabled:opacity-40"
                >
                  <Download className="w-3.5 h-3.5 text-orange-600" />
                  <span>Ekspor Log (.xlsx)</span>
                </button>
                <button
                  type="button"
                  onClick={() => downloadLogTemplateXlsx('Template_Log_Catatan_Schnell.xlsx')}
                  className="min-h-[42px] py-2 px-3 rounded-xl bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs flex items-center justify-center gap-1.5 border border-slate-200 dark:border-slate-700 transition-colors"
                >
                  <Download className="w-3.5 h-3.5 text-slate-400" />
                  <span>Template Log (.xlsx)</span>
                </button>
              </div>
            </div>

            {/* Referensi Format 24 Kolom & Template / Contoh Data */}
            <div className="bg-slate-50 dark:bg-slate-800/40 p-4 rounded-2xl border border-slate-200/70 dark:border-slate-800 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 font-bold text-xs text-slate-900 dark:text-white">
                  <FileSpreadsheet className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span>Format Kolom Excel / CSV / Sheet (24 Kolom, kompatibel 20/22 kolom):</span>
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 shrink-0">
                  Sheet: Data Dasbor
                </span>
              </div>

              <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/80 text-[10.5px] font-mono text-slate-700 dark:text-slate-300 leading-relaxed break-words select-all">
                {FULL_TEMPLATE_COLUMNS.join(', ')}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => downloadTemplateXlsx('Template_Form_Schnell.xlsx')}
                  className="min-h-[44px] py-2 px-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 font-bold text-xs flex items-center justify-center gap-1.5 border border-emerald-200 dark:border-emerald-800 transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download Form Template (.xlsx)</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const csv = generateTemplateCsv(false);
                    downloadFile(csv, 'Template_Form_Schnell_24_Kolom.csv');
                  }}
                  className="min-h-[44px] py-2 px-3 rounded-xl bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs flex items-center justify-center gap-1.5 border border-slate-200 dark:border-slate-700 transition-colors"
                >
                  <Download className="w-3.5 h-3.5 text-emerald-500" />
                  <span>Template CSV (;)</span>
                </button>

                <button
                  type="button"
                  onClick={() => downloadExampleXlsx(MOCK_BOOK_JOBS.slice(0, 3), 'Contoh_Data_Schnell.xlsx')}
                  className="min-h-[44px] py-2 px-3 rounded-xl bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs flex items-center justify-center gap-1.5 border border-slate-200 dark:border-slate-700 transition-colors"
                >
                  <Download className="w-3.5 h-3.5 text-slate-400" />
                  <span>Download Contoh Data (.xlsx)</span>
                </button>
              </div>
            </div>

            {/* Batalkan Impor Terakhir (jika tersedia) */}
            {lastImport && onRollbackLastImport && (
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs font-extrabold text-slate-900 dark:text-white">
                    Impor Terakhir: {lastImport.sourceName}
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    {formatLogDateShort(lastImport.timestamp.slice(0, 10))} · +{lastImport.createdBooks} buku baru, {lastImport.updatedBooks} diperbarui, +{lastImport.createdLogs} log
                  </p>
                </div>

                {confirmRollback ? (
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      disabled={isRollingBackImport}
                      onClick={async () => {
                        await onRollbackLastImport(lastImport.importId);
                        setConfirmRollback(false);
                      }}
                      className="min-h-[38px] px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold disabled:opacity-50"
                    >
                      {isRollingBackImport ? 'Membatalkan...' : 'Ya, Hapus Data Impor'}
                    </button>
                    <button
                      type="button"
                      disabled={isRollingBackImport}
                      onClick={() => setConfirmRollback(false)}
                      className="min-h-[38px] px-3 py-1.5 rounded-xl bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold"
                    >
                      Batal
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmRollback(true)}
                    className="min-h-[40px] px-3.5 py-2 rounded-xl bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 text-xs font-bold inline-flex items-center gap-1.5 shrink-0"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Batalkan Impor Terakhir</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 3. Pintasan Navigasi Cepat Akun */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <button
          onClick={() => onTabChange('dashboard')}
          className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 text-left hover:border-blue-500 dark:hover:border-blue-500 transition-all group"
        >
          <BookOpen className="w-5 h-5 text-blue-600 dark:text-blue-400 mb-2 group-hover:scale-110 transition-transform" />
          <div className="font-bold text-sm text-slate-900 dark:text-white">Buka Dashboard</div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
            Lihat grafik produksi & status 11 tahap
          </div>
        </button>

        <button
          onClick={() => onTabChange('buku')}
          className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 text-left hover:border-blue-500 dark:hover:border-blue-500 transition-all group"
        >
          <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 mb-2 group-hover:scale-110 transition-transform" />
          <div className="font-bold text-sm text-slate-900 dark:text-white">Katalog & Naskah Buku</div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
            Kelola judul, penulis, ISBN & revisi
          </div>
        </button>

        <button
          onClick={() => onTabChange('keuangan')}
          className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 text-left hover:border-blue-500 dark:hover:border-blue-500 transition-all group"
        >
          <Wallet className="w-5 h-5 text-purple-600 dark:text-purple-400 mb-2 group-hover:scale-110 transition-transform" />
          <div className="font-bold text-sm text-slate-900 dark:text-white">Keuangan & Invoice</div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
            Faktur cetak & pemantauan piutang
          </div>
        </button>
      </div>

      {/* 4. Keamanan & Kebijakan Privasi Sesi */}
      <div className="bg-slate-100/70 dark:bg-slate-800/40 rounded-2xl p-4 sm:p-5 border border-slate-200/60 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400 space-y-2">
        <div className="flex items-center gap-2 font-bold text-slate-800 dark:text-slate-200">
          <ShieldCheck className="w-4 h-4 text-emerald-500" />
          <span>Keamanan Sesi & Perlindungan Data</span>
        </div>
        <p className="leading-relaxed">
          Akun Anda diautentikasi melalui <strong>Firebase Authentication (Google Sign-In)</strong> dan data buku disimpan secara privat di <strong>Cloud Firestore</strong> pada akun Anda masing-masing.
        </p>
      </div>

      {/* Dialog Konfirmasi Keluar */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 max-w-sm w-full border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4 animate-in fade-in zoom-in-95">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center mx-auto">
              <LogOut className="w-6 h-6" />
            </div>

            <div className="text-center">
              <h4 className="text-base font-bold text-slate-900 dark:text-white">
                Konfirmasi Keluar Akun
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Apakah Anda yakin ingin keluar dari akun <strong>{currentUser?.email}</strong>? Seluruh data sesi di memori akan dibersihkan.
              </p>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowLogoutConfirm(false)}
                className="flex-1 py-2.5 text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowLogoutConfirm(false);
                  onLogout();
                }}
                className="flex-1 py-2.5 text-xs font-bold rounded-xl bg-rose-600 text-white hover:bg-rose-700 shadow-sm shadow-rose-600/30"
              >
                Ya, Keluar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
