import { StatusProgresType, StatusBayarType } from '../types';

/**
 * Format mata uang Rupiah Indonesia (contoh: Rp1.250.000)
 */
export function formatRupiah(amount: number): string {
  if (isNaN(amount) || amount === null || amount === undefined) return 'Rp0';
  return 'Rp' + Math.round(amount).toLocaleString('id-ID');
}

/**
 * Format mata uang Rupiah ringkas untuk grafik & badge kecil (contoh: Rp1,25 jt, Rp850 rb)
 */
export function formatRupiahShort(amount: number): string {
  if (!amount || isNaN(amount)) return 'Rp0';
  if (amount >= 1_000_000_000) {
    return `Rp${(amount / 1_000_000_000).toFixed(1).replace('.', ',')} M`;
  }
  if (amount >= 1_000_000) {
    const val = amount / 1_000_000;
    return `Rp${val % 1 === 0 ? val.toFixed(0) : val.toFixed(1).replace('.', ',')} jt`;
  }
  if (amount >= 1_000) {
    return `Rp${Math.round(amount / 1_000)} rb`;
  }
  return `Rp${amount}`;
}

/**
 * Konversi angka rupiah ke kalimat terbilang Indonesia (contoh: "Satu Juta Lima Ratus Ribu Rupiah")
 */
export function angkaTerbilang(nilai: number): string {
  const bilangan = [
    '', 'Satu', 'Dua', 'Tiga', 'Empat', 'Lima',
    'Enam', 'Tujuh', 'Delapan', 'Sembilan', 'Sepuluh', 'Sebelas'
  ];

  function hitung(n: number): string {
    if (n < 12) return bilangan[n];
    if (n < 20) return hitung(n - 10) + ' Belas';
    if (n < 100) return hitung(Math.floor(n / 10)) + ' Puluh ' + hitung(n % 10);
    if (n < 200) return 'Seratus ' + hitung(n - 100);
    if (n < 1000) return hitung(Math.floor(n / 100)) + ' Ratus ' + hitung(n % 100);
    if (n < 2000) return 'Seribu ' + hitung(n - 1000);
    if (n < 1000000) return hitung(Math.floor(n / 1000)) + ' Ribu ' + hitung(n % 1000);
    if (n < 1000000000) return hitung(Math.floor(n / 1000000)) + ' Juta ' + hitung(n % 1000000);
    if (n < 1000000000000) return hitung(Math.floor(n / 1000000000)) + ' Miliar ' + hitung(n % 1000000000);
    return '';
  }

  const round = Math.round(nilai);
  if (round === 0) return 'Nol Rupiah';
  const hasil = hitung(round).trim().replace(/\s+/g, ' ');
  return `${hasil} Rupiah`;
}

/**
 * Menghasilkan nomor invoice resmi yang konsisten, contoh: INV/SCH/2026/10/025
 */
export function getInvoiceNumber(no: number, dateStr?: string | null): string {
  const padNo = String(no).padStart(3, '0');
  if (dateStr && dateStr.length >= 7) {
    const parts = dateStr.split('-');
    const year = parts[0] || '2026';
    const month = parts[1] || '10';
    return `INV/SCH/${year}/${month}/${padNo}`;
  }
  return `INV/SCH/2026/10/${padNo}`;
}

/**
 * Format tanggal Indonesia (contoh: 22 Okt 2026)
 */
const MONTH_NAMES_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
  'Jul', 'Agt', 'Sep', 'Okt', 'Nov', 'Des'
];

const MONTH_NAMES_FULL = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

export function formatDateIndo(dateStr: string | null | undefined): string {
  if (!dateStr) return '-';
  try {
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      return `${day} ${MONTH_NAMES_SHORT[month] || ''} ${year}`;
    }
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return `${d.getDate()} ${MONTH_NAMES_SHORT[d.getMonth()]} ${d.getFullYear()}`;
  } catch {
    return dateStr;
  }
}

export function formatLogDateShort(dateStr: string | null | undefined): string {
  if (!dateStr) return '-';
  try {
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      const currentYear = new Date().getFullYear();
      const monthLabel = MONTH_NAME_SHORT_FIXED(month);
      return year === currentYear ? `${day} ${monthLabel}` : `${day} ${monthLabel} ${year}`;
    }
    return formatDateIndo(dateStr);
  } catch {
    return dateStr;
  }
}

function MONTH_NAME_SHORT_FIXED(monthIndex: number): string {
  const names = [
    'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
    'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des',
  ];
  return names[monthIndex] || MONTH_NAMES_SHORT[monthIndex] || '';
}

export function formatDateIndoFull(dateStr: string | null | undefined): string {
  if (!dateStr) return '-';
  try {
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      return `${day} ${MONTH_NAMES_FULL[month] || ''} ${year}`;
    }
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return `${d.getDate()} ${MONTH_NAMES_FULL[d.getMonth()]} ${d.getFullYear()}`;
  } catch {
    return dateStr;
  }
}

export function getMonthNameIndo(monthIndex: number): string {
  return MONTH_NAMES_FULL[monthIndex] || '';
}

export function getMonthNameShort(monthIndex: number): string {
  return MONTH_NAMES_SHORT[monthIndex] || '';
}

/**
 * Mendapatkan konfigurasi warna & gaya untuk status progres
 */
export function getStatusProgresConfig(status: StatusProgresType) {
  switch (status) {
    case 'Selesai':
      return {
        label: 'Selesai',
        bg: 'bg-emerald-50 dark:bg-emerald-950/40',
        text: 'text-[#1A9E7A] dark:text-emerald-400',
        border: 'border-emerald-200 dark:border-emerald-800',
        dot: 'bg-[#1A9E7A]',
        hex: '#1A9E7A',
      };
    case 'Sudah siap cetak':
      return {
        label: 'Siap Cetak',
        bg: 'bg-emerald-50 dark:bg-emerald-950/40',
        text: 'text-emerald-700 dark:text-emerald-300',
        border: 'border-emerald-300 dark:border-emerald-700',
        dot: 'bg-emerald-600',
        hex: '#059669',
      };
    case 'Nunggu ACC Cetak':
      return {
        label: 'Nunggu ACC Cetak',
        bg: 'bg-purple-50 dark:bg-purple-950/40',
        text: 'text-purple-600 dark:text-purple-400',
        border: 'border-purple-200 dark:border-purple-800',
        dot: 'bg-purple-500',
        hex: '#A855F7',
      };
    case 'Nunggu ISBN':
      return {
        label: 'Nunggu ISBN',
        bg: 'bg-amber-50 dark:bg-amber-950/40',
        text: 'text-amber-700 dark:text-amber-300',
        border: 'border-amber-300 dark:border-amber-700',
        dot: 'bg-amber-500',
        hex: '#D97706',
      };
    case 'Finishing Korektor':
      return {
        label: 'Finishing Korektor',
        bg: 'bg-indigo-50 dark:bg-indigo-950/40',
        text: 'text-indigo-600 dark:text-indigo-400',
        border: 'border-indigo-200 dark:border-indigo-800',
        dot: 'bg-indigo-600',
        hex: '#6366F1',
      };
    case 'Di Penulis':
      return {
        label: 'Di Penulis',
        bg: 'bg-orange-50 dark:bg-orange-950/40',
        text: 'text-orange-600 dark:text-orange-400',
        border: 'border-orange-200 dark:border-orange-800',
        dot: 'bg-orange-500',
        hex: '#F97316',
      };
    case 'Finishing Saya':
      return {
        label: 'Finishing Saya',
        bg: 'bg-teal-50 dark:bg-teal-950/40',
        text: 'text-teal-700 dark:text-teal-300',
        border: 'border-teal-300 dark:border-teal-700',
        dot: 'bg-teal-500',
        hex: '#0D9488',
      };
    case 'Di Coped':
      return {
        label: 'Di Coped',
        bg: 'bg-amber-50 dark:bg-amber-950/40',
        text: 'text-[#F59E0B] dark:text-amber-400',
        border: 'border-amber-200 dark:border-amber-800',
        dot: 'bg-[#F59E0B]',
        hex: '#F59E0B',
      };
    case 'Di Saya':
      return {
        label: 'Di Saya',
        bg: 'bg-blue-50 dark:bg-blue-950/40',
        text: 'text-[#2F6BDE] dark:text-blue-400',
        border: 'border-blue-200 dark:border-blue-800',
        dot: 'bg-[#2F6BDE]',
        hex: '#2F6BDE',
      };
    case 'Kirim file awal layout':
      return {
        label: 'Kirim file awal',
        bg: 'bg-sky-50 dark:bg-sky-950/40',
        text: 'text-sky-600 dark:text-sky-400',
        border: 'border-sky-200 dark:border-sky-800',
        dot: 'bg-sky-500',
        hex: '#0EA5E9',
      };
    case 'Masalah saat Kor penulis':
      return {
        label: 'Masalah Kor Penulis',
        bg: 'bg-rose-50 dark:bg-rose-950/40',
        text: 'text-[#E5484D] dark:text-rose-400',
        border: 'border-rose-200 dark:border-rose-800',
        dot: 'bg-[#E5484D]',
        hex: '#E5484D',
      };
    default:
      return {
        label: status,
        bg: 'bg-slate-100 dark:bg-slate-800',
        text: 'text-slate-600 dark:text-slate-300',
        border: 'border-slate-200 dark:border-slate-700',
        dot: 'bg-slate-400',
        hex: '#64748B',
      };
  }
}

/**
 * Persentase dan konfigurasi warna progress bar visual berdasarkan status pengerjaan naskah
 */
export function getStatusProgressPercent(status: StatusProgresType): {
  percent: number;
  label: string;
  barBg: string;
  badgeBg: string;
  textClass: string;
} {
  switch (status) {
    case 'Kirim file awal layout':
      return {
        percent: 15,
        label: 'Layout Awal',
        barBg: 'bg-sky-500',
        badgeBg: 'bg-sky-50 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300',
        textClass: 'text-sky-600 dark:text-sky-400',
      };
    case 'Di Saya':
      return {
        percent: 25,
        label: 'Proses Layout',
        barBg: 'bg-blue-600',
        badgeBg: 'bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300',
        textClass: 'text-blue-600 dark:text-blue-400',
      };
    case 'Di Coped':
      return {
        percent: 38,
        label: 'Koreksi Coped',
        barBg: 'bg-amber-500',
        badgeBg: 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300',
        textClass: 'text-amber-600 dark:text-amber-400',
      };
    case 'Finishing Saya':
      return {
        percent: 50,
        label: 'Finishing Layout',
        barBg: 'bg-teal-500',
        badgeBg: 'bg-teal-50 text-teal-700 dark:bg-teal-950/50 dark:text-teal-300',
        textClass: 'text-teal-600 dark:text-teal-400',
      };
    case 'Di Penulis':
      return {
        percent: 62,
        label: 'Review Penulis',
        barBg: 'bg-orange-500',
        badgeBg: 'bg-orange-50 text-orange-700 dark:bg-orange-950/50 dark:text-orange-300',
        textClass: 'text-orange-600 dark:text-orange-400',
      };
    case 'Masalah saat Kor penulis':
      return {
        percent: 62,
        label: 'Kendala Penulis',
        barBg: 'bg-rose-500',
        badgeBg: 'bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300',
        textClass: 'text-rose-600 dark:text-rose-400',
      };
    case 'Finishing Korektor':
      return {
        percent: 75,
        label: 'Finishing Korektor',
        barBg: 'bg-indigo-600',
        badgeBg: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300',
        textClass: 'text-indigo-600 dark:text-indigo-400',
      };
    case 'Nunggu ISBN':
      return {
        percent: 85,
        label: 'Pengajuan ISBN',
        barBg: 'bg-amber-600',
        badgeBg: 'bg-amber-50 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300',
        textClass: 'text-amber-600 dark:text-amber-400',
      };
    case 'Nunggu ACC Cetak':
      return {
        percent: 92,
        label: 'Nunggu ACC Cetak',
        barBg: 'bg-purple-600',
        badgeBg: 'bg-purple-50 text-purple-700 dark:bg-purple-950/50 dark:text-purple-300',
        textClass: 'text-purple-600 dark:text-purple-400',
      };
    case 'Sudah siap cetak':
      return {
        percent: 97,
        label: 'Siap Cetak',
        barBg: 'bg-emerald-600',
        badgeBg: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300',
        textClass: 'text-emerald-600 dark:text-emerald-400',
      };
    case 'Selesai':
      return {
        percent: 100,
        label: 'Selesai Penuh',
        barBg: 'bg-[#1A9E7A]',
        badgeBg: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300',
        textClass: 'text-[#1A9E7A] dark:text-emerald-400',
      };
    default:
      return {
        percent: 10,
        label: status,
        barBg: 'bg-slate-500',
        badgeBg: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
        textClass: 'text-slate-600 dark:text-slate-400',
      };
  }
}

/**
 * Mendapatkan konfigurasi warna untuk status bayar
 */
export function getStatusBayarConfig(status: StatusBayarType) {
  switch (status) {
    case 'Lunas':
      return {
        label: 'Lunas',
        bg: 'bg-emerald-50 dark:bg-emerald-950/40',
        text: 'text-[#1A9E7A] dark:text-emerald-400',
        border: 'border-emerald-200 dark:border-emerald-800',
        hex: '#1A9E7A',
      };
    case 'Belum Dibayar':
      return {
        label: 'Belum Dibayar',
        bg: 'bg-amber-50 dark:bg-amber-950/40',
        text: 'text-[#F59E0B] dark:text-amber-400',
        border: 'border-amber-200 dark:border-amber-800',
        hex: '#F59E0B',
      };
    case 'Belum Ditagih':
      return {
        label: 'Belum Ditagih',
        bg: 'bg-slate-100 dark:bg-slate-800/80',
        text: 'text-slate-600 dark:text-slate-300',
        border: 'border-slate-200 dark:border-slate-700',
        hex: '#64748B',
      };
  }
}

/**
 * Format badge paket (Basic, Standart, Premium)
 */
export function getPaketBadge(paket: string) {
  switch (paket) {
    case 'Premium':
      return 'bg-purple-100/70 text-purple-700 dark:bg-purple-950/50 dark:text-purple-300';
    case 'Standart':
      return 'bg-blue-100/70 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300';
    case 'Basic':
    default:
      return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300';
  }
}
