export interface AppVersionEntry {
  version: string;
  date: string;
  description: string;
}

/**
 * Nomor versi aplikasi (sumber tunggal untuk chip versi di header).
 * Aturan pembaruan:
 * - "Besar:" menaikkan angka depan dan mereset angka belakang ke 0 (mis. 1.0 -> 2.0)
 * - "Kecil:" menaikkan angka belakang saja (mis. 1.0 -> 1.1 -> 1.2)
 */
export const APP_VERSION = '2.2';

/**
 * Riwayat versi aplikasi (diurutkan dari terbaru ke terlama).
 */
export const APP_VERSION_HISTORY: readonly AppVersionEntry[] = [
  {
    version: '2.2',
    date: '17 Nov 2026',
    description: 'Sempurnakan prioritas Tgl Selesai, tambah input manual & isi otomatis tglSelesai, serta peringatan buku tanpa tanggal selesai',
  },
  {
    version: '2.1',
    date: '17 Nov 2026',
    description: 'Perbaiki sumber tanggal Tgl Selesai pada Invoice, Riwayat Invoice, Salin Rekap WA, dan Cetak Rekap A4',
  },
  {
    version: '2.0',
    date: '16 Nov 2026',
    description: 'Desain ulang Riwayat Invoice per nomor invoice, 3 bagian berurutan, dan tombol sembunyikan nominal',
  },
  {
    version: '1.1',
    date: '16 Nov 2026',
    description: 'Perbaiki badge tab Buku agar menghitung buku berstatus Di Saya secara realtime',
  },
  {
    version: '1.0',
    date: '16 Nov 2026',
    description: 'Versi awal',
  },
];
