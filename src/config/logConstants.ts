import { LogJenisType, LogStatusType } from '../types';
import {
  DEFAULT_STATUS_SELESAI,
  KODE_JENIS_MAP,
  LOG_DARI_LIST,
  LOG_JENIS_LIST,
  LOG_STATUS_LIST,
  STATUS_WORKFLOW_LIST,
  isStatusSelesai,
} from './masterData';

export const LOG_DARI_SUGGESTIONS: readonly string[] = LOG_DARI_LIST;
export const LOG_JENIS_OPTIONS: readonly LogJenisType[] = LOG_JENIS_LIST;
export const LOG_STATUS_OPTIONS: readonly LogStatusType[] = LOG_STATUS_LIST;
export const STANDARD_STATUS_PROGRES_LIST: readonly string[] = STATUS_WORKFLOW_LIST;

export function isBookFinished(
  status: string | undefined | null,
  statusSelesai: string = DEFAULT_STATUS_SELESAI
): boolean {
  return isStatusSelesai(status, statusSelesai);
}

/**
 * Normalisasi jenis log: mendukung kode 1 huruf (P/R/T/M/I/-) maupun teks penuh
 */
export function normalizeLogJenis(raw: unknown): LogJenisType {
  const s = String(raw || '').trim();
  if (!s) return 'Info';
  const upper = s.toUpperCase();
  if (upper in KODE_JENIS_MAP) {
    return KODE_JENIS_MAP[upper];
  }
  const lower = s.toLowerCase();
  if (lower.includes('tambahan')) return 'Tambahan naskah';
  if (lower.includes('revisi') || lower.includes('rev')) return 'Revisi';
  if (lower.includes('tanya') || lower.includes('pertanyaan') || lower.includes('question')) {
    return 'Pertanyaan';
  }
  if (
    lower.includes('masalah') ||
    lower.includes('kendala') ||
    lower.includes('stuck') ||
    lower.includes('error')
  ) {
    return 'Masalah';
  }
  return 'Info';
}

export function normalizeLogStatus(raw: unknown): LogStatusType {
  const s = String(raw || '').trim().toLowerCase();
  if (!s) return 'Selesai';
  if (
    s === 'baru' ||
    s === 'new' ||
    s === 'open' ||
    s === 'belum' ||
    s === 'pending' ||
    s.includes('belum selesai')
  ) {
    return 'Baru';
  }
  return 'Selesai';
}

export function getLogJenisBadgeConfig(jenis: LogJenisType) {
  switch (jenis) {
    case 'Revisi':
      return {
        label: 'Revisi',
        bg: 'bg-orange-50 dark:bg-orange-950/50',
        text: 'text-orange-700 dark:text-orange-300',
        border: 'border-orange-200 dark:border-orange-800',
      };
    case 'Pertanyaan':
      return {
        label: 'Pertanyaan',
        bg: 'bg-blue-50 dark:bg-blue-950/50',
        text: 'text-blue-700 dark:text-blue-300',
        border: 'border-blue-200 dark:border-blue-800',
      };
    case 'Tambahan naskah':
      return {
        label: 'Tambahan naskah',
        bg: 'bg-purple-50 dark:bg-purple-950/50',
        text: 'text-purple-700 dark:text-purple-300',
        border: 'border-purple-200 dark:border-purple-800',
      };
    case 'Masalah':
      return {
        label: 'Masalah',
        bg: 'bg-rose-50 dark:bg-rose-950/50',
        text: 'text-rose-700 dark:text-rose-300',
        border: 'border-rose-200 dark:border-rose-800',
      };
    case 'Info':
    default:
      return {
        label: 'Info',
        bg: 'bg-slate-100 dark:bg-slate-800',
        text: 'text-slate-600 dark:text-slate-300',
        border: 'border-slate-200 dark:border-slate-700',
      };
  }
}

export function getLogDariBadgeConfig(dari: string) {
  const lower = String(dari || '').trim().toLowerCase();
  if (lower === 'penulis') {
    return 'bg-purple-50 text-purple-700 dark:bg-purple-950/50 dark:text-purple-300 border-purple-200 dark:border-purple-800';
  }
  if (lower === 'editor') {
    return 'bg-sky-50 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300 border-sky-200 dark:border-sky-800';
  }
  if (lower === 'coped' || lower === 'korektor') {
    return 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300 border-amber-200 dark:border-amber-800';
  }
  if (lower === 'penerbit') {
    return 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800';
  }
  if (lower === 'lama') {
    return 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400 border-slate-200 dark:border-slate-700';
  }
  return 'bg-teal-50 text-teal-700 dark:bg-teal-950/50 dark:text-teal-300 border-teal-200 dark:border-teal-800';
}
