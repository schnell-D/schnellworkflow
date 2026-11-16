import { LogJenisType, LogStatusType, PaketType, StatusProgresType } from '../types';

/**
 * TAHAP 0: KONFIGURASI TERPUSAT SCHNELL
 * Satu sumber kebenaran untuk paket, ukuran buku, status, pengelompokan status,
 * kategori (25 pilihan), kelengkapan naskah, log catatan, dan parser KODE_CATATAN.
 */

export interface PaketConfigItem {
  name: PaketType;
  tarif: number; // Referensi saja; JANGAN dipakai menghitung Nilai Jasa otomatis
}

export const PAKET_CONFIG: readonly PaketConfigItem[] = [
  { name: 'Basic', tarif: 2500 },
  { name: 'Standart', tarif: 4000 },
  { name: 'Premium', tarif: 5000 },
] as const;

export const PAKET_LIST: readonly PaketType[] = ['Basic', 'Standart', 'Premium'] as const;

export const UKURAN_BUKU_LIST: readonly string[] = [
  '15x23',
  '15,5x23,5',
  '14x21',
  'B5',
  'A5',
  'A4',
] as const;

export const STATUS_WORKFLOW_LIST: readonly string[] = [
  'Kirim file awal layout',
  'Di Saya',
  'Di Coped',
  'Finishing Saya',
  'Di Penulis',
  'Finishing Korektor',
  'Nunggu ISBN',
  'Nunggu ACC Cetak',
  'Sudah siap cetak',
  'Selesai',
  'Masalah saat Kor penulis',
] as const;

export type StatusGroupKey = 'awal' | 'progres' | 'masalah' | 'finish';

export interface StatusGroupMeta {
  key: StatusGroupKey;
  label: string;
  shortLabel: string;
  hex: string;
  badgeBg: string;
  badgeText: string;
  badgeBorder: string;
  pillBg: string;
}

export const STATUS_GROUPS: readonly StatusGroupMeta[] = [
  {
    key: 'awal',
    label: 'Tahap Awal',
    shortLabel: 'Awal',
    hex: '#38BDF8', // biru muda
    badgeBg: 'bg-sky-50 dark:bg-sky-950/50',
    badgeText: 'text-sky-700 dark:text-sky-300',
    badgeBorder: 'border-sky-200 dark:border-sky-800',
    pillBg: 'bg-sky-500',
  },
  {
    key: 'progres',
    label: 'Progres',
    shortLabel: 'Progres',
    hex: '#F59E0B', // kuning/amber
    badgeBg: 'bg-amber-50 dark:bg-amber-950/50',
    badgeText: 'text-amber-700 dark:text-amber-300',
    badgeBorder: 'border-amber-200 dark:border-amber-800',
    pillBg: 'bg-amber-500',
  },
  {
    key: 'masalah',
    label: 'Masalah',
    shortLabel: 'Masalah',
    hex: '#E5484D', // merah
    badgeBg: 'bg-rose-50 dark:bg-rose-950/50',
    badgeText: 'text-rose-700 dark:text-rose-300',
    badgeBorder: 'border-rose-200 dark:border-rose-800',
    pillBg: 'bg-rose-500',
  },
  {
    key: 'finish',
    label: 'Finish',
    shortLabel: 'Finish',
    hex: '#1A9E7A', // hijau
    badgeBg: 'bg-emerald-50 dark:bg-emerald-950/50',
    badgeText: 'text-emerald-700 dark:text-emerald-300',
    badgeBorder: 'border-emerald-200 dark:border-emerald-800',
    pillBg: 'bg-emerald-600',
  },
] as const;

export const DEFAULT_STATUS_KATEGORI: Record<StatusGroupKey, readonly string[]> = {
  awal: ['Kirim file awal layout'],
  progres: [
    'Di Saya',
    'Di Coped',
    'Finishing Saya',
    'Di Penulis',
    'Finishing Korektor',
    'Nunggu ISBN',
    'Nunggu ACC Cetak',
  ],
  masalah: ['Masalah saat Kor penulis', 'Kendala Penulis'],
  finish: ['Sudah siap cetak', 'Selesai'],
} as const;

export const DEFAULT_STATUS_DI_SAYA: readonly string[] = ['Di Saya', 'Finishing Saya'] as const;
export const DEFAULT_STATUS_SELESAI = 'Selesai';
export const DEFAULT_BATAS_HARI_TERLAMBAT = 3;

/**
 * Mengelompokkan sebuah status progres ke salah satu dari 4 kelompok STATUS_KATEGORI,
 * menghormati custom override dari pengaturan akun pengguna.
 */
export function resolveStatusGroup(
  status: StatusProgresType | string | undefined | null,
  groupOverrides?: Record<string, StatusGroupKey>
): StatusGroupKey {
  const raw = String(status || '').trim();
  if (!raw) return 'progres';

  if (groupOverrides) {
    const exactOverride = groupOverrides[raw];
    if (exactOverride) return exactOverride;
    const lowerOverrideKey = Object.keys(groupOverrides).find(
      (k) => k.trim().toLowerCase() === raw.toLowerCase()
    );
    if (lowerOverrideKey) return groupOverrides[lowerOverrideKey];
  }

  const lower = raw.toLowerCase();
  if (DEFAULT_STATUS_KATEGORI.awal.some((s) => s.toLowerCase() === lower)) return 'awal';
  if (DEFAULT_STATUS_KATEGORI.masalah.some((s) => s.toLowerCase() === lower)) return 'masalah';
  if (DEFAULT_STATUS_KATEGORI.finish.some((s) => s.toLowerCase() === lower)) return 'finish';
  if (lower.startsWith('nunggu')) return 'progres';
  return 'progres';
}

export function getStatusGroupMeta(groupKey: StatusGroupKey): StatusGroupMeta {
  return STATUS_GROUPS.find((g) => g.key === groupKey) || STATUS_GROUPS[1];
}

export const KATEGORI_BUKU_LIST: readonly string[] = [
  'Ilmu Sosial',
  'Olah Raga',
  'Administrasi',
  'Agama',
  'Antropologi & Kebudayaan',
  'Arsitektur',
  'Bahasa & Sastra',
  'Ekonomi Islam',
  'Ekonomi/Manajemen',
  'Ensiklopedia & Kamus',
  'Filsafat',
  'Hukum',
  'Kesehatan/Kedokteran',
  'Komunikasi',
  'Metodologi',
  'Pariwisata',
  'Pendidikan',
  'Perpajakan',
  'Pertanian',
  'Psikologi',
  'Sosiologi dan Politik',
  'Statistik',
  'Teknik dan Ekologi',
  'Teknologi Informasi',
  'Transportasi',
] as const;

export const KELENGKAPAN_NASKAH_LIST: readonly string[] = [
  'Prakata',
  'Kata Sambutan',
  'Prolog',
  'Epilog',
  'Isi Naskah',
  'Daftar Pustaka',
  'Biodata Penulis',
  'Foto Penulis',
  'Sinopsis',
  'Indeks',
] as const;

export const LOG_DARI_LIST: readonly string[] = [
  'Penulis',
  'Editor',
  'Penerbit',
  'Saya',
  'Coped',
  'Korektor',
  'Lama',
] as const;

export const LOG_JENIS_LIST: readonly LogJenisType[] = [
  'Pertanyaan',
  'Revisi',
  'Tambahan naskah',
  'Masalah',
  'Info',
] as const;

export const LOG_STATUS_LIST: readonly LogStatusType[] = ['Baru', 'Selesai'] as const;

export const KODE_DARI_MAP: Record<string, string> = {
  P: 'Penulis',
  E: 'Editor',
  N: 'Penerbit',
  S: 'Saya',
  C: 'Coped',
  K: 'Korektor',
  '-': '',
};

export const KODE_JENIS_MAP: Record<string, LogJenisType> = {
  P: 'Pertanyaan',
  R: 'Revisi',
  T: 'Tambahan naskah',
  M: 'Masalah',
  I: 'Info',
  '-': 'Info',
};

export interface ParsedKodeCatatan {
  dari: string;
  jenis: LogJenisType;
  isi: string;
  matchedCode: boolean;
}

/**
 * Parser KODE_CATATAN:
 * Format: "DariJenis // isi" atau "Dari // isi" (case-insensitive, spasi di sekitar // opsional)
 * Huruf pertama = Dari (P=Penulis, E=Editor, N=Penerbit, S=Saya, C=Coped, K=Korektor, -=kosong)
 * Huruf kedua = Jenis (P=Pertanyaan, R=Revisi, T=Tambahan naskah, M=Masalah, I=Info, -=Info)
 * Jika hanya 1 huruf sebelum //, dianggap Dari dengan Jenis Info.
 * Jika tanpa // (atau kode tidak cocok), seluruh teks menjadi isi dengan Dari "" dan Jenis "Info".
 * Contoh:
 * - "ER // baru masuk koreksi 1" -> dari "Editor", jenis "Revisi", isi "baru masuk koreksi 1"
 * - "SM//kelengkapan belum ada" -> dari "Saya", jenis "Masalah"
 * - "P // teks" -> dari "Penulis", jenis "Info"
 * - "-P // footnote ganda, dibiarkan?" -> dari "", jenis "Pertanyaan"
 * - "antri coped" -> dari "", jenis "Info", isi "antri coped"
 */
export function parseKodeCatatan(rawText: string): ParsedKodeCatatan {
  const trimmed = String(rawText || '').trim();
  const sepIndex = trimmed.indexOf('//');
  if (sepIndex !== -1) {
    const codePart = trimmed.slice(0, sepIndex).trim();
    const isiPart = trimmed.slice(sepIndex + 2).trim();
    const match = codePart.match(/^([PENSCK-])([PRTMI-])?$/i);
    if (match) {
      const dariCode = match[1].toUpperCase();
      const jenisCode = match[2] ? match[2].toUpperCase() : '-';
      return {
        dari: KODE_DARI_MAP[dariCode] ?? '',
        jenis: KODE_JENIS_MAP[jenisCode] ?? 'Info',
        isi: isiPart,
        matchedCode: true,
      };
    }
  }
  return {
    dari: '',
    jenis: 'Info',
    isi: trimmed,
    matchedCode: false,
  };
}

/**
 * Normalisasi input "Dari" saat impor log (mendukung kode 1 huruf P/E/N/S/C/K/- maupun kata penuh)
 */
export function normalizeLogDariInput(raw: unknown): string {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed || trimmed === '-') return '';
  const upper = trimmed.toUpperCase();
  if (upper in KODE_DARI_MAP) {
    return KODE_DARI_MAP[upper];
  }
  const matchedFull = LOG_DARI_LIST.find((d) => d.toLowerCase() === trimmed.toLowerCase());
  return matchedFull || trimmed;
}

/**
 * Cek apakah status buku termasuk dalam daftar "Di Saya" pengguna
 */
export function isBookDiSaya(
  status: string | undefined | null,
  statusDiSayaList: readonly string[] = DEFAULT_STATUS_DI_SAYA
): boolean {
  const norm = String(status || '').trim().toLowerCase();
  if (!norm) return false;
  return statusDiSayaList.some((s) => s.trim().toLowerCase() === norm);
}

/**
 * Cek apakah status buku termasuk posisi "Di Saya" yang masih aktif (bukan Selesai/Finish)
 */
export function isActiveBookDiSaya(
  status: string | undefined | null,
  statusDiSayaList: readonly string[] = DEFAULT_STATUS_DI_SAYA,
  statusSelesai: string = DEFAULT_STATUS_SELESAI,
  groupOverrides?: Record<string, StatusGroupKey>
): boolean {
  if (isStatusSelesai(status, statusSelesai)) return false;
  if (resolveStatusGroup(status, groupOverrides) === 'finish') return false;
  return isBookDiSaya(status, statusDiSayaList);
}

/**
 * Satu sumber kebenaran hitungan jumlah buku di posisi "Di Saya" (tidak termasuk Selesai/Finish).
 * Dipakai bersama oleh badge tab navigasi Buku dan chip filter "Di Saya".
 */
export function countBooksDiSaya(
  books: readonly { statusProgres?: string | null }[],
  statusDiSayaList: readonly string[] = DEFAULT_STATUS_DI_SAYA,
  statusSelesai: string = DEFAULT_STATUS_SELESAI,
  groupOverrides?: Record<string, StatusGroupKey>
): number {
  let count = 0;
  for (const book of books) {
    if (
      isActiveBookDiSaya(
        book.statusProgres,
        statusDiSayaList,
        statusSelesai,
        groupOverrides
      )
    ) {
      count++;
    }
  }
  return count;
}

/**
 * Cek apakah status buku merupakan status selesai akhir (STATUS_SELESAI)
 */
export function isStatusSelesai(
  status: string | undefined | null,
  statusSelesai: string = DEFAULT_STATUS_SELESAI
): boolean {
  const norm = String(status || '').trim().toLowerCase();
  return norm === String(statusSelesai || DEFAULT_STATUS_SELESAI).trim().toLowerCase();
}
