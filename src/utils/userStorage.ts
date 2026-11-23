/**
 * Helper penyimpanan preferensi & pengaturan per akun pengguna (u:${uid}:${key})
 * Tidak menyimpan token, API key rahasia, atau data pribadi (nama/email/foto) di localStorage.
 */

import { RevisionNote } from '../types';
import { saveUserCloudData, SyncedUserData } from '../services/firebase';

/**
 * Membaca nilai dari localStorage secara aman dengan try/catch
 */
export function safeGetStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch (err) {
    console.warn(`Gagal membaca storage untuk key "${key}":`, err);
    return null;
  }
}

/**
 * Menyimpan nilai ke localStorage secara aman dengan try/catch
 */
export function safeSetStorage(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch (err) {
    console.warn(`Gagal menulis storage untuk key "${key}":`, err);
  }
}

/**
 * Menghapus nilai dari localStorage secara aman dengan try/catch
 */
export function safeRemoveStorage(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch (err) {
    console.warn(`Gagal menghapus storage untuk key "${key}":`, err);
  }
}

/**
 * Bersihkan sisa data pribadi atau cache sesi lama yang tidak semestinya ada di localStorage
 */
export function cleanupLegacyLocalStorage(): void {
  safeRemoveStorage('schnell_auth_user');
  safeRemoveStorage('schnell_custom_client_id');
}

/**
 * Membaca item spesifik untuk UID pengguna tertentu
 */
export function getUserItem<T>(uid: string, key: string, defaultValue: T): T {
  if (!uid) return defaultValue;
  const storageKey = `u:${uid}:${key}`;
  const raw = safeGetStorage(storageKey);
  if (raw === null || raw === undefined) return defaultValue;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return (raw as unknown) as T;
  }
}

/**
 * Menyimpan item spesifik untuk UID pengguna tertentu
 */
export function setUserItem<T>(uid: string, key: string, value: T): void {
  if (!uid) return;
  const storageKey = `u:${uid}:${key}`;
  try {
    const serialized = typeof value === 'string' ? value : JSON.stringify(value);
    safeSetStorage(storageKey, serialized);
  } catch (err) {
    console.warn(`Gagal menyimpan user item ${storageKey}:`, err);
  }
}

/**
 * Target Buku Bulanan per Pengguna
 */
export function getUserMonthlyTarget(uid: string, defaultTarget = 10): number {
  const val = getUserItem<number>(uid, 'rgp_monthly_target', defaultTarget);
  return typeof val === 'number' && !isNaN(val) && val > 0 ? val : defaultTarget;
}

export function setUserMonthlyTarget(uid: string, target: number): void {
  setUserItem<number>(uid, 'rgp_monthly_target', target);
  if (uid) {
    saveUserCloudData(uid, { monthlyTarget: target }).catch((err) =>
      console.warn('Gagal sinkron monthlyTarget ke Firestore:', err)
    );
  }
}

/**
 * Status Dummy Cetak Buku per Pengguna
 */
export function getUserDummyStatus(uid: string, bookNo: number): string {
  return getUserItem<string>(uid, `schnell_dummy_status_${bookNo}`, 'tidak_ada');
}

export function setUserDummyStatus(uid: string, bookNo: number, status: string): void {
  setUserItem<string>(uid, `schnell_dummy_status_${bookNo}`, status);
  if (uid) {
    const current = getUserItem<Record<number, string>>(uid, 'schnell_all_dummy_statuses', {});
    current[bookNo] = status;
    setUserItem<Record<number, string>>(uid, 'schnell_all_dummy_statuses', current);
    saveUserCloudData(uid, { dummyStatuses: current }).catch((err) =>
      console.warn('Gagal sinkron dummyStatuses ke Firestore:', err)
    );
  }
}

/**
 * Catatan Track Record Buku per Pengguna
 */
export function getUserBookNotes(uid: string, bookNo: number): RevisionNote[] {
  return getUserItem<RevisionNote[]>(uid, `schnell_book_notes_${bookNo}`, []);
}

export function setUserBookNotes(uid: string, bookNo: number, notes: RevisionNote[]): void {
  setUserItem<RevisionNote[]>(uid, `schnell_book_notes_${bookNo}`, notes);
  if (uid) {
    const current = getUserItem<Record<number, RevisionNote[]>>(uid, 'schnell_all_book_notes', {});
    current[bookNo] = notes;
    setUserItem<Record<number, RevisionNote[]>>(uid, 'schnell_all_book_notes', current);
    saveUserCloudData(uid, { bookNotes: current }).catch((err) =>
      console.warn('Gagal sinkron bookNotes ke Firestore:', err)
    );
  }
}

/**
 * Preferensi Tema Tampilan Global (Light / Dark)
 */
export function getSavedTheme(): boolean {
  const saved = safeGetStorage('rgp_theme');
  if (saved) return saved === 'dark';
  try {
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  } catch {
    return false;
  }
}

export function setSavedTheme(isDark: boolean): void {
  safeSetStorage('rgp_theme', isDark ? 'dark' : 'light');
}

/**
 * Tarif Paket Layout per Halaman (untuk fitur Estimasi Biaya Layout Buku)
 */
export interface PackageRates {
  Basic: number;
  Standart: number;
  Premium: number;
}

export const DEFAULT_PACKAGE_RATES: PackageRates = {
  Basic: 2500,
  Standart: 4000,
  Premium: 5000,
};

export function getUserPackageRates(uid: string): PackageRates {
  return getUserItem<PackageRates>(uid, 'schnell_package_rates', DEFAULT_PACKAGE_RATES);
}

export function setUserPackageRates(uid: string, rates: PackageRates): void {
  setUserItem<PackageRates>(uid, 'schnell_package_rates', rates);
  if (uid) {
    saveUserCloudData(uid, { packageRates: rates }).catch((err) =>
      console.warn('Gagal sinkron packageRates ke Firestore:', err)
    );
  }
}

/**
 * Menerapkan pengaturan cloud Firestore ke cache preferensi lokal
 */
export function applyCloudUserData(uid: string, data: SyncedUserData): void {
  if (!uid || !data) return;
  if (data.monthlyTarget !== undefined && data.monthlyTarget !== null) {
    setUserItem<number>(uid, 'rgp_monthly_target', data.monthlyTarget);
  }
  if (data.packageRates !== undefined && data.packageRates !== null) {
    setUserItem<PackageRates>(uid, 'schnell_package_rates', data.packageRates);
  }
  if (data.dummyStatuses) {
    setUserItem<Record<number, string>>(uid, 'schnell_all_dummy_statuses', data.dummyStatuses);
    Object.entries(data.dummyStatuses).forEach(([k, v]) => {
      setUserItem<string>(uid, `schnell_dummy_status_${k}`, String(v));
    });
  }
  if (data.bookNotes) {
    setUserItem<Record<number, RevisionNote[]>>(uid, 'schnell_all_book_notes', data.bookNotes);
    Object.entries(data.bookNotes).forEach(([k, v]) => {
      setUserItem<RevisionNote[]>(uid, `schnell_book_notes_${k}`, v as RevisionNote[]);
    });
  }
  if (data.statusGroupOverrides) {
    setUserItem(uid, 'schnell_status_group_overrides', data.statusGroupOverrides);
  }
  if (data.statusDiSaya) {
    setUserItem(uid, 'schnell_status_di_saya', data.statusDiSaya);
  }
  if (data.statusSelesai) {
    setUserItem(uid, 'schnell_status_selesai', data.statusSelesai);
  }
  if (data.batasHariTerlambat !== undefined) {
    setUserItem(uid, 'schnell_batas_hari_terlambat', data.batasHariTerlambat);
  }
  if (data.bukuViewMode) {
    setUserItem(uid, 'schnell_buku_view_mode', data.bukuViewMode);
  }
}

export interface PersistedInvoiceExtraFee {
  id: string;
  keterangan: string;
  nominal: number;
}

export interface PersistedInvoiceDraft {
  selectedBookIds: number[];
  taskTypes: Record<number, 'Layout' | 'Desain'>;
  customInvoiceNo: string;
  invoiceDate: string;
  dueDateDays: number;
  recipientName: string;
  recipientAddress: string;
  defaultTask: 'Layout' | 'Desain';
  bookExtras: Record<number, PersistedInvoiceExtraFee[]>;
  expandedExtras: Record<number, boolean>;
  bookFilterStatus: 'semua' | 'siapTagih' | 'terpilih';
  bookSearchQuery: string;
}

export function getUserInvoiceDraft(uid: string): PersistedInvoiceDraft | null {
  if (!uid) return null;
  return getUserItem<PersistedInvoiceDraft | null>(uid, 'schnell_invoice_draft', null);
}

export function setUserInvoiceDraft(uid: string, draft: PersistedInvoiceDraft): void {
  if (!uid) return;
  setUserItem<PersistedInvoiceDraft>(uid, 'schnell_invoice_draft', draft);
}

export function clearUserInvoiceDraft(uid: string): void {
  if (!uid) return;
  safeRemoveStorage(`u:${uid}:schnell_invoice_draft`);
}

