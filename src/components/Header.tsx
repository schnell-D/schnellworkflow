import React, { useState, useRef, useEffect } from 'react';
import { Sun, Moon, RefreshCw, LogOut, ChevronDown, User, Bell } from 'lucide-react';
import { TabType, AuthUser, BookLog, BookJob } from '../types';
import { formatLogDateShort } from '../utils/formatters';
import { APP_VERSION, APP_VERSION_HISTORY } from '../config/appVersion';

interface HeaderProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
  isDark: boolean;
  onToggleDark: () => void;
  onRefresh: () => void;
  isRefreshing: boolean;
  onOpenSettings?: () => void;
  diSayaCount: number;
  newLogsCount?: number;
  urgentNewLogs?: Array<{ log: BookLog; book?: BookJob }>;
  onOpenLogBaru?: () => void;
  currentUser: AuthUser | null;
  onLogout: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  onTabChange,
  isDark,
  onToggleDark,
  onRefresh,
  isRefreshing,
  onOpenSettings,
  diSayaCount,
  newLogsCount = 0,
  urgentNewLogs = [],
  onOpenLogBaru,
  currentUser,
  onLogout,
}) => {
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [isVersionOpen, setIsVersionOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);
  const versionRef = useRef<HTMLDivElement>(null);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setIsUserMenuOpen(false);
      }
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
        setIsNotifOpen(false);
      }
      if (versionRef.current && !versionRef.current.contains(event.target as Node)) {
        setIsVersionOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <header className="no-print print:hidden sticky top-0 z-30 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 transition-colors">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 h-16 flex items-center justify-between gap-2 sm:gap-4">
        {/* Brand Zone + Version Chip */}
        <div className="relative flex items-baseline gap-1.5 min-w-0 shrink-0" ref={versionRef}>
          <span className="font-extrabold text-base sm:text-lg tracking-tight text-slate-900 dark:text-white whitespace-nowrap">
            Layout Tracker
          </span>
          <button
            type="button"
            onClick={() => setIsVersionOpen((prev) => !prev)}
            aria-expanded={isVersionOpen}
            aria-label={`Versi aplikasi v${APP_VERSION}, klik untuk lihat riwayat versi`}
            className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-semibold leading-none bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-200 transition-colors shrink-0 tabular-nums cursor-pointer"
          >
            v{APP_VERSION}
          </button>

          {isVersionOpen && (
            <div className="absolute left-0 top-full mt-2 w-72 max-w-[calc(100vw-1.5rem)] bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 py-2 z-50">
              <div className="px-4 py-2 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <span className="text-xs font-extrabold text-slate-900 dark:text-white">
                  Riwayat Versi
                </span>
                <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 tabular-nums">
                  v{APP_VERSION}
                </span>
              </div>
              <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-64 overflow-y-auto">
                {APP_VERSION_HISTORY.map((entry) => (
                  <div key={entry.version} className="px-4 py-2.5 space-y-0.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-100 tabular-nums">
                        v{entry.version}
                      </span>
                      <span className="text-[11px] text-slate-400 dark:text-slate-500 shrink-0">
                        {entry.date}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-300 truncate">
                      {entry.description}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Desktop Navigation Links */}
        <nav className="hidden md:flex items-center gap-1 bg-slate-100 dark:bg-slate-800/70 p-1 rounded-xl">
          <button
            onClick={() => onTabChange('dashboard')}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all whitespace-nowrap ${
              activeTab === 'dashboard'
                ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Dashboard
          </button>
          <button
            onClick={() => onTabChange('buku')}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === 'buku'
                ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <span>Buku</span>
            {diSayaCount > 0 && (
              <span className="px-1.5 py-0.2 text-[10px] font-bold rounded-full bg-rose-500 text-white tabular-nums">
                {diSayaCount}
              </span>
            )}
          </button>
          <button
            onClick={() => onTabChange('log')}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === 'log'
                ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <span>Log</span>
            {newLogsCount > 0 && (
              <span className="px-1.5 py-0.2 text-[10px] font-bold rounded-full bg-orange-500 text-white">
                {newLogsCount}
              </span>
            )}
          </button>
          <button
            onClick={() => onTabChange('keuangan')}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all whitespace-nowrap ${
              activeTab === 'keuangan' || activeTab === 'invoice' || activeTab === 'riwayat'
                ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Keuangan
          </button>
          <button
            onClick={() => onTabChange('akun')}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all whitespace-nowrap ${
              activeTab === 'akun'
                ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Akun
          </button>
        </nav>

        {/* Right Actions */}
        <div className="flex items-center gap-1 sm:gap-2 shrink-0">
          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            title="Muat ulang data"
            className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
            aria-label="Muat Ulang"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-blue-600' : ''}`} />
          </button>

          <button
            onClick={onToggleDark}
            title={isDark ? 'Mode Terang' : 'Mode Gelap'}
            className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            aria-label="Ubah Tema"
          >
            {isDark ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
          </button>

          {/* Lonceng Notifikasi Catatan Baru */}
          <div className="relative" ref={notifRef}>
            <button
              type="button"
              onClick={() => setIsNotifOpen((prev) => !prev)}
              title="Notifikasi Catatan Baru"
              aria-label="Notifikasi Catatan Baru"
              className="relative w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <Bell className="w-4 h-4" />
              {newLogsCount > 0 && (
                <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 rounded-full bg-orange-500 text-white text-[9px] font-bold flex items-center justify-center">
                  {newLogsCount > 99 ? '99+' : newLogsCount}
                </span>
              )}
            </button>

            {isNotifOpen && (
              <div className="absolute right-0 mt-2 w-72 sm:w-80 bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 py-2 z-50 animate-in fade-in slide-in-from-top-1 duration-150">
                <div className="px-4 py-2.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                  <span className="text-xs font-extrabold text-slate-900 dark:text-white">
                    {newLogsCount > 0 ? `${newLogsCount} Catatan Baru` : 'Tidak Ada Catatan Baru'}
                  </span>
                  {newLogsCount > 0 && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-50 text-orange-700 dark:bg-orange-950/60 dark:text-orange-300">
                      Menunggu ditindaklanjuti
                    </span>
                  )}
                </div>

                {urgentNewLogs.length === 0 ? (
                  <div className="px-4 py-5 text-center text-xs text-slate-500 dark:text-slate-400">
                    Semua catatan log sudah ditandai selesai.
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-64 overflow-y-auto">
                    {urgentNewLogs.slice(0, 3).map(({ log, book }) => (
                      <div key={log.id} className="px-4 py-2.5 space-y-1">
                        <div className="flex items-center justify-between gap-2 text-[10px] font-bold">
                          <span className="text-blue-600 dark:text-blue-400 truncate">
                            {book ? `#${book.no} ${book.judul}` : `#${log.bookNo}`}
                          </span>
                          <span className="text-slate-400 shrink-0">
                            {formatLogDateShort(log.tanggal)}
                          </span>
                        </div>
                        <p className="text-xs text-slate-700 dark:text-slate-300 line-clamp-2">
                          <span className="font-bold">[{log.dari} · {log.jenis}]</span> {log.isi}
                        </p>
                      </div>
                    ))}
                  </div>
                )}

                <div className="px-3 pt-2 pb-1 border-t border-slate-100 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => {
                      setIsNotifOpen(false);
                      if (onOpenLogBaru) {
                        onOpenLogBaru();
                      } else {
                        onTabChange('log');
                      }
                    }}
                    className="w-full min-h-[38px] py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-colors"
                  >
                    Lihat di Log (Baru)
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* User Profile & Sign Out dropdown */}
          {currentUser && (
            <div className="relative ml-1 sm:ml-2" ref={userMenuRef}>
              <button
                type="button"
                onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                className="flex items-center gap-2 p-1 pl-1.5 sm:pr-2.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800/80 transition-colors"
                title={`Akun: ${currentUser.name} (${currentUser.email})`}
              >
                {currentUser.photoUrl ? (
                  <img
                    src={currentUser.photoUrl}
                    alt={currentUser.name}
                    className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg object-cover ring-1 ring-blue-500/30"
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = 'none';
                    }}
                  />
                ) : (
                  <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-blue-600 text-white font-bold text-xs flex items-center justify-center">
                    {currentUser.name.charAt(0)}
                  </div>
                )}
                <div className="hidden lg:block text-left text-xs max-w-[120px] truncate">
                  <div className="font-semibold text-slate-900 dark:text-slate-100 truncate">
                    {currentUser.name}
                  </div>
                  <div className="text-[10px] text-slate-400 truncate">
                    Google Sign-In
                  </div>
                </div>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400 hidden sm:block" />
              </button>

              {/* Dropdown Menu */}
              {isUserMenuOpen && (
                <div className="absolute right-0 mt-2 w-64 bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 py-2 z-50 animate-in fade-in slide-in-from-top-1 duration-150">
                  <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800">
                    <div className="flex items-center gap-2 mb-1">
                      {/* Official Google G mark */}
                      <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                        <path
                          fill="#4285F4"
                          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                        />
                        <path
                          fill="#34A853"
                          d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                        />
                        <path
                          fill="#FBBC05"
                          d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                        />
                        <path
                          fill="#EA4335"
                          d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                        />
                      </svg>
                      <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                        Akun Google Terhubung
                      </span>
                    </div>
                    <div className="font-bold text-sm text-slate-800 dark:text-slate-100 truncate">
                      {currentUser.name}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                      {currentUser.email}
                    </div>
                  </div>

                  <div className="p-1 space-y-0.5">
                    <button
                      type="button"
                      onClick={() => {
                        setIsUserMenuOpen(false);
                        onTabChange('akun');
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
                    >
                      <User className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                      <span>Menu Akun & Preferensi</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setIsUserMenuOpen(false);
                        onLogout();
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl transition-colors"
                    >
                      <LogOut className="w-4 h-4" />
                      <span>Keluar (Sign Out)</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
