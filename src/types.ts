/**
 * Tipe data untuk aplikasi Laporan Pekerjaan Layout Buku non-fiksi Schnell
 */

export type PaketType = 'Basic' | 'Standart' | 'Premium';

export type StandardStatusProgresType =
  | 'Kirim file awal layout'
  | 'Di Saya'
  | 'Di Coped'
  | 'Finishing Saya'
  | 'Di Penulis'
  | 'Finishing Korektor'
  | 'Nunggu ISBN'
  | 'Nunggu ACC Cetak'
  | 'Sudah siap cetak'
  | 'Selesai'
  | 'Masalah saat Kor penulis';

export type StatusProgresType = StandardStatusProgresType | (string & {});

export type StatusBayarType = 'Belum Ditagih' | 'Belum Dibayar' | 'Lunas';

export type StandardKategoriType =
  | 'Ilmu Sosial'
  | 'Olah Raga'
  | 'Administrasi'
  | 'Agama'
  | 'Antropologi & Kebudayaan'
  | 'Arsitektur'
  | 'Bahasa & Sastra'
  | 'Ekonomi Islam'
  | 'Ekonomi/Manajemen'
  | 'Ensiklopedia & Kamus'
  | 'Filsafat'
  | 'Hukum'
  | 'Kesehatan/Kedokteran'
  | 'Komunikasi'
  | 'Metodologi'
  | 'Pariwisata'
  | 'Pendidikan'
  | 'Perpajakan'
  | 'Pertanian'
  | 'Psikologi'
  | 'Sosiologi dan Politik'
  | 'Statistik'
  | 'Teknik dan Ekologi'
  | 'Teknologi Informasi'
  | 'Transportasi';

export type KategoriType = StandardKategoriType | (string & {});

export type HalamanWarnaType = 'BW' | 'Half BW' | 'Full Color';
export type StatusIsbnType = 'ISBN Terbit' | 'Pengajuan ISBN' | 'Belum ada ISBN';

export interface BookJob {
  id?: string; // Firestore document ID
  no: number;
  judul: string;
  penulis: string;
  kategori: KategoriType;
  paket: PaketType;
  statusProgres: StatusProgresType;
  tglTerima: string | null; // YYYY-MM-DD atau null
  tglSelesaiLayout: string | null; // YYYY-MM-DD atau null
  tglSelesai?: string | null; // Field tanggal selesai buku tersimpan (opsional, read-only)
  updateTerakhir: string | null; // YYYY-MM-DD atau null
  hariBerjalan: number;
  halamanAwal: number;
  halamanFinal: number;
  stuck: 'Ya' | 'Tidak';
  nilaiJasa: number; // Rupiah
  statusBayar: StatusBayarType;
  tglInvoice: string | null; // YYYY-MM-DD atau null
  tglDibayar: string | null; // YYYY-MM-DD atau null
  noInvoice?: string | null; // Nomor invoice tersimpan (opsional)
  umurPiutang: number; // Hari sejak invoice jika belum dibayar, 0 jika lunas/belum ditagih
  catatanBelumSelesai: string;
  lamaLayoutAwal: number; // Hari
  // Spesifikasi Teknis & Metadata Produksi
  ukuran?: string; // Alias sinkron dari ukuranBuku
  ukuranBuku?: string;
  halamanWarna?: HalamanWarnaType;
  estimasiHalaman?: number;
  kodeProduksi?: string;
  isbn?: string;
  statusIsbn?: StatusIsbnType;
  kelengkapanNaskah?: string[];
  adaPertanyaan?: boolean;
  // Field Tambahan & Metadata Impor
  catatanBuku?: string | null; // Catatan tetap tentang buku ini (bukan log bertanggal)
  catatanBiaya?: string | null;
  catatanLain?: string | null;
  customFields?: Record<string, string | number | null>;
  importId?: string;
}

export interface RevisionNote {
  id: string;
  timestamp: string; // ISO string atau format tanggal
  category:
    | 'Revisi Penulis'
    | 'Korektor / Coped'
    | 'Finishing'
    | 'Cetak Dummy'
    | 'ACC Cetak'
    | 'Kendala'
    | 'Catatan Umum';
  text: string;
}

export type LogJenisType =
  | 'Pertanyaan'
  | 'Revisi'
  | 'Tambahan naskah'
  | 'Masalah'
  | 'Info';
export type LogStatusType = 'Baru' | 'Selesai';

export interface BookLog {
  id?: string;
  bookId: string;
  bookNo: number;
  tanggal: string | null; // "YYYY-MM-DD" atau null
  dari: string; // Boleh string kosong ""
  isi: string;
  jenis: LogJenisType;
  status: LogStatusType;
  source: 'manual' | 'import';
  importId?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface ActivityEntry {
  id?: string;
  type:
    | 'log_created'
    | 'log_status'
    | 'log_done'
    | 'book_status'
    | 'import_batch'
    | 'import_workbook'
    | 'payment_done'
    | 'book_created';
  title: string;
  detail: string;
  bookId?: string;
  bookNo?: number;
  judul?: string;
  importId?: string;
  createdAt?: string;
}

export interface LastImportRecord {
  importId: string;
  timestamp: string;
  sourceName: string;
  createdBooks: number;
  updatedBooks: number;
  createdLogs: number;
  problemRowsCount?: number;
}

export interface AuthUser {
  uid: string;
  name: string;
  email: string;
  photoUrl: string;
}

export type KeuanganSubTab = 'ringkasan' | 'invoice' | 'riwayat';

export type TabType = 'dashboard' | 'buku' | 'log' | 'keuangan' | 'akun' | 'invoice' | 'riwayat';
