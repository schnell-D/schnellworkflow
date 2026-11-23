import {
  BookJob,
  KategoriType,
  PaketType,
  StatusProgresType,
  StatusBayarType,
  HalamanWarnaType,
  StatusIsbnType,
} from '../types';
import {
  KATEGORI_BUKU_LIST,
  PAKET_LIST,
  STATUS_WORKFLOW_LIST,
} from '../config/masterData';

export const VALID_STATUS_PROGRES: readonly StatusProgresType[] = [
  ...STATUS_WORKFLOW_LIST,
] as const;

export const VALID_PAKET: readonly PaketType[] = [...PAKET_LIST] as const;

export const VALID_KATEGORI: readonly KategoriType[] = [
  ...KATEGORI_BUKU_LIST,
] as const;

export const VALID_STATUS_BAYAR: readonly StatusBayarType[] = [
  'Belum Ditagih',
  'Belum Dibayar',
  'Lunas',
] as const;

/**
 * Menggabungkan daftar status standar dengan status kustom pengguna (Sudah siap cetak selalu tepat sebelum Selesai)
 */
export function buildCombinedStatusList(customStatuses: string[] = []): StatusProgresType[] {
  const base = [...STATUS_WORKFLOW_LIST];
  const extras = customStatuses
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !base.some((b) => b.toLowerCase() === s.toLowerCase()));

  // Sisipkan status kustom sebelum "Sudah siap cetak" agar alur tetap logis
  const readyIdx = base.indexOf('Sudah siap cetak');
  if (readyIdx >= 0 && extras.length > 0) {
    return [...base.slice(0, readyIdx), ...extras, ...base.slice(readyIdx)];
  }
  return [...base, ...extras];
}

/**
 * Menghasilkan tanggal hari ini dalam format ISO YYYY-MM-DD berdasarkan waktu lokal
 */
export function getTodayIsoDate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const MONTH_NAME_MAP: Record<string, number> = {
  jan: 1, januari: 1, january: 1,
  feb: 2, februari: 2, february: 2,
  mar: 3, maret: 3, march: 3,
  apr: 4, april: 4,
  mei: 5, may: 5,
  jun: 6, juni: 6, june: 6,
  jul: 7, juli: 7, july: 7,
  agu: 8, agt: 8, ags: 8, agus: 8, agust: 8, agustus: 8, aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  okt: 10, oktober: 10, oct: 10, october: 10,
  nov: 11, november: 11,
  des: 12, desember: 12, dec: 12, december: 12,
};

function buildValidatedIso(y: number, m: number, d: number): string | null {
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return null;
  if (y < 1900 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (
    dt.getUTCFullYear() !== y ||
    dt.getUTCMonth() !== m - 1 ||
    dt.getUTCDate() !== d
  ) {
    return null;
  }
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/**
 * Normalisasi input tanggal ke string ISO "YYYY-MM-DD" atau null.
 * Mendukung tanggal pendek Indonesia tanpa tahun ("27 Okt", "21 Agu", "4 Nov"):
 * memakai tahun berjalan, atau tahun sebelumnya bila tanggal > 30 hari di masa depan.
 */
export function normalizeIsoDate(
  raw: unknown,
  refDate: Date = new Date()
): { value: string | null; isValid: boolean; yearGuessed?: boolean } {
  if (raw === null || raw === undefined) return { value: null, isValid: true };

  if (raw instanceof Date) {
    if (isNaN(raw.getTime())) return { value: null, isValid: false };
    const valid = buildValidatedIso(raw.getFullYear(), raw.getMonth() + 1, raw.getDate());
    return { value: valid, isValid: valid !== null };
  }

  const trimmed = String(raw).trim();
  if (!trimmed || trimmed === '-') return { value: null, isValid: true };

  // Angka serial tanggal Excel (misal: 46329 atau 46329.5 -> "2026-11-03")
  if (typeof raw === 'number' || /^\d+(?:\.\d+)?$/.test(trimmed)) {
    const serial = typeof raw === 'number' ? raw : Number(trimmed);
    if (Number.isFinite(serial) && serial >= 1 && serial <= 109574) {
      const wholeDays = Math.floor(serial + 1e-7);
      const excelEpochMs =
        wholeDays <= 60 ? Date.UTC(1899, 11, 31) : Date.UTC(1899, 11, 30);
      const dt = new Date(excelEpochMs + wholeDays * 86400000);
      const valid = buildValidatedIso(
        dt.getUTCFullYear(),
        dt.getUTCMonth() + 1,
        dt.getUTCDate()
      );
      return { value: valid, isValid: valid !== null };
    }
    return { value: null, isValid: false };
  }

  // Format YYYY-MM-DD atau YYYY/MM/DD (opsional dengan jam)
  const isoMatch = trimmed.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[T\s].*)?$/);
  if (isoMatch) {
    const valid = buildValidatedIso(
      parseInt(isoMatch[1], 10),
      parseInt(isoMatch[2], 10),
      parseInt(isoMatch[3], 10)
    );
    return { value: valid, isValid: valid !== null };
  }

  // Format DD/MM/YYYY atau DD-MM-YYYY
  const dmyMatch = trimmed.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})(?:\s.*)?$/);
  if (dmyMatch) {
    const valid = buildValidatedIso(
      parseInt(dmyMatch[3], 10),
      parseInt(dmyMatch[2], 10),
      parseInt(dmyMatch[1], 10)
    );
    return { value: valid, isValid: valid !== null };
  }

  // Format "22 Okt 2026" atau "22 Oktober 2026"
  const indoWithYear = trimmed.match(/^(\d{1,2})[\s\-./]+([a-zA-Z]+)[\s\-./]+(\d{4})$/);
  if (indoWithYear) {
    const monthNum = MONTH_NAME_MAP[indoWithYear[2].toLowerCase()];
    if (monthNum) {
      const valid = buildValidatedIso(
        parseInt(indoWithYear[3], 10),
        monthNum,
        parseInt(indoWithYear[1], 10)
      );
      return { value: valid, isValid: valid !== null };
    }
  }

  // Format pendek tanpa tahun: "27 Okt", "21 Agu", "4 Nov", "13-Nov"
  const indoShort = trimmed.match(/^(\d{1,2})[\s\-./]+([a-zA-Z]+)\.?$/);
  if (indoShort) {
    const monthNum = MONTH_NAME_MAP[indoShort[2].toLowerCase()];
    if (monthNum) {
      const dayNum = parseInt(indoShort[1], 10);
      const currentYear = refDate.getFullYear();
      let candidateYear = currentYear;

      const candidateIso = buildValidatedIso(candidateYear, monthNum, dayNum);
      if (candidateIso) {
        const candidateMs = Date.UTC(candidateYear, monthNum - 1, dayNum);
        const refPlus30Ms =
          Date.UTC(refDate.getFullYear(), refDate.getMonth(), refDate.getDate()) +
          30 * 86400000;
        if (candidateMs > refPlus30Ms) {
          candidateYear = currentYear - 1;
        }
      }

      const finalIso = buildValidatedIso(candidateYear, monthNum, dayNum);
      return {
        value: finalIso,
        isValid: finalIso !== null,
        yearGuessed: finalIso !== null,
      };
    }
  }

  return { value: null, isValid: false };
}

/**
 * Menghitung selisih hari antara dua tanggal ISO YYYY-MM-DD tanpa masalah zona waktu
 */
export function diffIsoDays(fromIso: string | null | undefined, toIso: string | null | undefined): number {
  const fromNorm = normalizeIsoDate(fromIso).value;
  const toNorm = normalizeIsoDate(toIso).value;
  if (!fromNorm || !toNorm) return 0;

  const [fy, fm, fd] = fromNorm.split('-').map(Number);
  const [ty, tm, td] = toNorm.split('-').map(Number);

  const fromUtc = Date.UTC(fy, fm - 1, fd);
  const toUtc = Date.UTC(ty, tm - 1, td);
  return Math.floor((toUtc - fromUtc) / (1000 * 60 * 60 * 24));
}

/**
 * Menghitung lama buku berada pada status progres saat ini (dalam hari, minimal 1 hari)
 */
export function computeDaysInStatus(book: Pick<BookJob, 'updateTerakhir' | 'hariBerjalan'>): number {
  if (!book.updateTerakhir) return Math.max(1, book.hariBerjalan || 1);
  try {
    const updateTime = new Date(book.updateTerakhir).getTime();
    if (isNaN(updateTime)) return Math.max(1, book.hariBerjalan || 1);
    const nowTime = Date.now();
    const refTime = nowTime > updateTime ? nowTime : new Date('2026-11-02').getTime();
    const diffMs = refTime - updateTime;
    return Math.max(1, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
  } catch {
    return Math.max(1, book.hariBerjalan || 1);
  }
}

function toFiniteNumber(val: unknown, fallback = 0): number {
  if (typeof val === 'number') {
    return Number.isFinite(val) ? val : fallback;
  }
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (!trimmed) return fallback;
    const cleaned = trimmed.replace(/[^0-9.-]/g, '');
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

export function normalizeKategori(raw: unknown): KategoriType {
  const s = String(raw || '').trim();
  if (!s) return KATEGORI_BUKU_LIST[0];
  const exact = KATEGORI_BUKU_LIST.find((k) => k.toLowerCase() === s.toLowerCase());
  if (exact) return exact;
  // Nilai kategori lama di luar daftar (misalnya "Kesehatan", "Ekonomi") tetap dipertahankan apa adanya
  return s;
}

export function normalizePaket(raw: unknown): PaketType {
  const lower = String(raw || '').trim().toLowerCase();
  if (lower.includes('prem')) return 'Premium';
  if (lower.includes('stand')) return 'Standart';
  return 'Basic';
}

/**
 * Mencari padanan status progres dari daftar baku & daftar kustom.
 * Mengembalikan { value, isRecognized } agar fitur impor J.6 bisa mendeteksi status baru.
 */
export function matchStatusProgres(
  raw: unknown,
  customStatuses: string[] = []
): { value: StatusProgresType; isRecognized: boolean } {
  const s = String(raw || '').trim();
  if (!s) return { value: 'Di Saya', isRecognized: true };

  const allKnown = buildCombinedStatusList(customStatuses);
  const exact = allKnown.find((st) => st.toLowerCase() === s.toLowerCase());
  if (exact) return { value: exact, isRecognized: true };

  const lower = s.toLowerCase();
  if (lower === 'coped' || lower === 'di coped') return { value: 'Di Coped', isRecognized: true };
  if (lower === 'masalah' || lower.includes('masalah') || (lower.includes('penulis') && lower.includes('kor'))) {
    return { value: 'Masalah saat Kor penulis', isRecognized: true };
  }
  if (lower === 'penulis' || lower === 'di penulis') return { value: 'Di Penulis', isRecognized: true };
  if (lower === 'finishing saya') return { value: 'Finishing Saya', isRecognized: true };
  if (lower === 'finishing korektor') return { value: 'Finishing Korektor', isRecognized: true };
  if (lower === 'kirim file awal' || lower.includes('file awal')) {
    return { value: 'Kirim file awal layout', isRecognized: true };
  }
  if (lower.includes('nunggu isbn') || lower === 'isbn') return { value: 'Nunggu ISBN', isRecognized: true };
  if (lower.includes('acc cetak') || lower === 'nunggu acc') return { value: 'Nunggu ACC Cetak', isRecognized: true };
  if (lower.includes('siap cetak')) return { value: 'Sudah siap cetak', isRecognized: true };
  if (lower === 'selesai' || lower === 'done') return { value: 'Selesai', isRecognized: true };
  if (lower === 'saya' || lower === 'di saya') return { value: 'Di Saya', isRecognized: true };

  return { value: s, isRecognized: false };
}

export function normalizeStatusProgres(
  raw: unknown,
  customStatuses: string[] = []
): StatusProgresType {
  const s = String(raw || '').trim();
  if (!s) return 'Di Saya';
  const matched = matchStatusProgres(s, customStatuses);
  if (matched.isRecognized) return matched.value;
  // Jika sudah tersimpan sebagai status kustom di Firestore, pertahankan nilai teksnya
  if (customStatuses.some((c) => c.toLowerCase() === s.toLowerCase())) {
    return s;
  }
  // Pertahankan nilai apa adanya bila bukan teks kosong agar status kustom tetap terbaca
  return s;
}

export function normalizeStatusBayar(raw: unknown): StatusBayarType {
  const s = String(raw || '').trim();
  const exact = VALID_STATUS_BAYAR.find((st) => st.toLowerCase() === s.toLowerCase());
  if (exact) return exact;

  const lower = s.toLowerCase();
  if (lower.includes('lunas') || lower.includes('paid') || lower.includes('sudah')) return 'Lunas';
  if (
    lower.includes('belum dibayar') ||
    lower.includes('belum bayar') ||
    lower.includes('menunggu') ||
    lower.includes('pending')
  ) {
    return 'Belum Dibayar';
  }
  return 'Belum Ditagih';
}

function parsePageCountValue(rawVal: unknown): number | null {
  if (rawVal === null || rawVal === undefined || rawVal === '') return null;
  if (typeof rawVal === 'number') {
    return Number.isFinite(rawVal) && rawVal >= 0 ? Math.round(rawVal) : null;
  }
  const str = String(rawVal).trim();
  if (!str || str === '-') return null;
  const cleaned = str.replace(/hlm\.?|hal\.?|halaman|pages?/gi, '').replace(/[^0-9]/g, '');
  if (!cleaned) return null;
  const parsed = parseInt(cleaned, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function extractTargetHalamanFromCustomFields(
  customFields?: Record<string, string | number | null>
): number | null {
  if (!customFields || typeof customFields !== 'object') return null;
  const targetKeys = new Set([
    'targethalaman',
    'targethal',
    'targethlm',
    'targethalamannaskah',
    'targetjumlahhalaman',
    'halamantarget',
    'estimasihalaman',
    'halamanestimasi',
    'halamanawal',
    'halawal',
  ]);
  for (const [key, val] of Object.entries(customFields)) {
    const normKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (targetKeys.has(normKey)) {
      const parsed = parsePageCountValue(val);
      if (parsed !== null && parsed > 0) return parsed;
    }
  }
  return null;
}

/**
 * Menghitung 3 kolom turunan (hariBerjalan, umurPiutang, lamaLayoutAwal) secara dinamis
 * saat membaca data dari Firestore atau tampilan, tanpa menyimpannya ke Firestore.
 */
export function computeDerivedBookFields(
  raw: Partial<BookJob> & { id?: string }
): BookJob {
  const todayIso = getTodayIsoDate();
  const rawObj = raw as Record<string, unknown>;

  const no = toFiniteNumber(raw.no, 0);
  const judul = String(raw.judul ?? '').trim() || 'Tanpa Judul';
  const penulis = String(raw.penulis ?? '').trim() || 'Tanpa Penulis';
  const kategori = normalizeKategori(raw.kategori);
  const paket = normalizePaket(raw.paket);
  const statusProgres = raw.statusProgres ? String(raw.statusProgres).trim() || 'Di Saya' : 'Di Saya';

  const tglTerima = normalizeIsoDate(raw.tglTerima).value;
  const tglSelesaiLayout = normalizeIsoDate(raw.tglSelesaiLayout).value;
  const updateTerakhir = normalizeIsoDate(raw.updateTerakhir).value;

  const rawHalAwal = parsePageCountValue(raw.halamanAwal);
  const rawTargetAlias = parsePageCountValue(
    rawObj.targetHalaman ?? rawObj.target_halaman ?? rawObj.targetHal
  );
  const rawCustomTarget = extractTargetHalamanFromCustomFields(raw.customFields);
  const rawEstimasi = parsePageCountValue(raw.estimasiHalaman);

  const halamanAwal =
    rawHalAwal !== null && rawHalAwal > 0
      ? rawHalAwal
      : rawCustomTarget !== null && rawCustomTarget > 0
      ? rawCustomTarget
      : rawTargetAlias !== null && rawTargetAlias > 0
      ? rawTargetAlias
      : rawEstimasi !== null && rawEstimasi > 0
      ? rawEstimasi
      : 0;
  const halamanFinal = toFiniteNumber(raw.halamanFinal, halamanAwal);
  const stuck: 'Ya' | 'Tidak' = raw.stuck === 'Ya' ? 'Ya' : 'Tidak';
  const nilaiJasa = toFiniteNumber(raw.nilaiJasa, 0);
  const statusBayar = normalizeStatusBayar(raw.statusBayar);
  const tglInvoice = normalizeIsoDate(raw.tglInvoice).value;
  const tglDibayar = normalizeIsoDate(raw.tglDibayar).value;
  const catatanBelumSelesai = String(raw.catatanBelumSelesai ?? '');

  // Kolom turunan 1: Hari Berjalan
  let hariBerjalan = 0;
  if (tglTerima) {
    const endDate = tglSelesaiLayout || todayIso;
    hariBerjalan = Math.max(1, diffIsoDays(tglTerima, endDate));
  }

  // Kolom turunan 2: Umur Piutang (hari sejak tglInvoice bila belum dibayar, 0 bila lunas/belum ditagih)
  let umurPiutang = 0;
  if (statusBayar === 'Belum Dibayar' && tglInvoice) {
    umurPiutang = Math.max(0, diffIsoDays(tglInvoice, todayIso));
  }

  // Kolom turunan 3: Lama Layout Awal
  let lamaLayoutAwal = 0;
  if (statusProgres !== 'Kirim file awal layout' && tglTerima) {
    if (tglSelesaiLayout) {
      lamaLayoutAwal = Math.max(1, Math.round(diffIsoDays(tglTerima, tglSelesaiLayout) * 0.75));
    } else if (updateTerakhir) {
      lamaLayoutAwal = Math.max(1, diffIsoDays(tglTerima, updateTerakhir));
    }
  }

  const book: BookJob = {
    ...(raw.id ? { id: raw.id } : {}),
    no,
    judul,
    penulis,
    kategori,
    paket,
    statusProgres,
    tglTerima,
    tglSelesaiLayout,
    updateTerakhir,
    hariBerjalan,
    halamanAwal,
    halamanFinal,
    stuck,
    nilaiJasa,
    statusBayar,
    tglInvoice,
    tglDibayar,
    umurPiutang,
    catatanBelumSelesai,
    lamaLayoutAwal,
  };

  const resolvedUkuran = raw.ukuran
    ? String(raw.ukuran).trim()
    : raw.ukuranBuku
    ? String(raw.ukuranBuku).trim()
    : '';
  if (resolvedUkuran) {
    book.ukuran = resolvedUkuran;
    book.ukuranBuku = resolvedUkuran;
  }
  if (raw.halamanWarna) book.halamanWarna = raw.halamanWarna as HalamanWarnaType;
  if (raw.estimasiHalaman !== undefined && raw.estimasiHalaman !== null) {
    const parsedEst = toFiniteNumber(raw.estimasiHalaman, halamanAwal);
    book.estimasiHalaman = parsedEst > 0 ? parsedEst : halamanAwal;
  } else if (halamanAwal > 0) {
    book.estimasiHalaman = halamanAwal;
  }
  if (raw.kodeProduksi) book.kodeProduksi = String(raw.kodeProduksi);
  if (raw.isbn) book.isbn = String(raw.isbn);
  if (raw.statusIsbn) book.statusIsbn = raw.statusIsbn as StatusIsbnType;
  if (Array.isArray(raw.kelengkapanNaskah)) {
    book.kelengkapanNaskah = raw.kelengkapanNaskah.filter((v) => typeof v === 'string');
  }
  if (typeof raw.adaPertanyaan === 'boolean') {
    book.adaPertanyaan = raw.adaPertanyaan;
  }
  if (raw.catatanBuku !== undefined && raw.catatanBuku !== null && String(raw.catatanBuku).trim() !== '') {
    book.catatanBuku = String(raw.catatanBuku).trim();
  }
  if (raw.catatanBiaya !== undefined && raw.catatanBiaya !== null && String(raw.catatanBiaya).trim() !== '') {
    book.catatanBiaya = String(raw.catatanBiaya).trim();
  }
  if (raw.catatanLain !== undefined && raw.catatanLain !== null && String(raw.catatanLain).trim() !== '') {
    book.catatanLain = String(raw.catatanLain).trim();
  }
  if (raw.customFields && typeof raw.customFields === 'object') {
    book.customFields = { ...raw.customFields };
  }
  if (raw.importId) {
    book.importId = String(raw.importId);
  }

  const rawTglSelesai =
    rawObj.tglSelesai ??
    rawObj.tanggalSelesai ??
    rawObj.tglSelesaiBuku ??
    rawObj.tanggalSelesaiBuku ??
    rawObj.tglFinish ??
    rawObj.tanggalFinish ??
    rawObj.finishDate ??
    rawObj.completedAt ??
    rawObj.selesaiAt ??
    rawObj.finishedAt ??
    rawObj.tglSelesaiFinish;
  const resolvedTglSelesai = normalizeIsoDate(rawTglSelesai).value;
  if (resolvedTglSelesai) {
    book.tglSelesai = resolvedTglSelesai;
  }

  const rawInvNo =
    rawObj.noInvoice ??
    rawObj.nomorInvoice ??
    rawObj.invoiceNo ??
    rawObj.invoiceNumber ??
    rawObj.no_invoice ??
    rawObj.nomor_invoice;
  if (rawInvNo !== undefined && rawInvNo !== null && String(rawInvNo).trim() !== '') {
    book.noInvoice = String(rawInvNo).trim();
  }

  return book;
}

/**
 * Membersihkan & memformat dokumen buku untuk ditulis ke Firestore:
 * - Menghapus kolom turunan (hariBerjalan, umurPiutang, lamaLayoutAwal) dan id
 * - Menghapus semua nilai undefined (diubah ke null atau dihilangkan)
 * - Mengonversi string numerik menjadi number
 * - Memastikan tanggal berformat "YYYY-MM-DD" atau null
 */
export function serializeBookForFirestore(book: Partial<BookJob>): Record<string, any> {
  const payload: Record<string, any> = {
    no: toFiniteNumber(book.no, 0),
    judul: String(book.judul ?? '').trim() || 'Tanpa Judul',
    penulis: String(book.penulis ?? '').trim() || 'Tanpa Penulis',
    kategori: normalizeKategori(book.kategori),
    paket: normalizePaket(book.paket),
    statusProgres: book.statusProgres ? String(book.statusProgres).trim() || 'Di Saya' : 'Di Saya',
    tglTerima: normalizeIsoDate(book.tglTerima).value,
    tglSelesaiLayout: normalizeIsoDate(book.tglSelesaiLayout).value,
    updateTerakhir: normalizeIsoDate(book.updateTerakhir).value,
    halamanAwal: toFiniteNumber(book.halamanAwal, 0),
    halamanFinal: toFiniteNumber(book.halamanFinal, toFiniteNumber(book.halamanAwal, 0)),
    stuck: book.stuck === 'Ya' ? 'Ya' : 'Tidak',
    nilaiJasa: toFiniteNumber(book.nilaiJasa, 0),
    statusBayar: normalizeStatusBayar(book.statusBayar),
    tglInvoice: normalizeIsoDate(book.tglInvoice).value,
    tglDibayar: normalizeIsoDate(book.tglDibayar).value,
    catatanBelumSelesai: String(book.catatanBelumSelesai ?? ''),
  };

  if (book.tglSelesai !== undefined) {
    payload.tglSelesai = normalizeIsoDate(book.tglSelesai).value;
  }
  if (book.noInvoice !== undefined) {
    payload.noInvoice = book.noInvoice ? String(book.noInvoice).trim() : null;
  }

  if (book.ukuran !== undefined || book.ukuranBuku !== undefined) {
    const cleanUkuran = (book.ukuran ?? book.ukuranBuku)
      ? String(book.ukuran ?? book.ukuranBuku).trim()
      : null;
    payload.ukuran = cleanUkuran;
    payload.ukuranBuku = cleanUkuran;
  }
  if (book.halamanWarna !== undefined) {
    payload.halamanWarna = book.halamanWarna ?? null;
  }
  if (book.estimasiHalaman !== undefined) {
    payload.estimasiHalaman =
      book.estimasiHalaman === null ? null : toFiniteNumber(book.estimasiHalaman, 0);
  }
  if (book.kodeProduksi !== undefined) {
    payload.kodeProduksi = book.kodeProduksi ? String(book.kodeProduksi).trim() : null;
  }
  if (book.isbn !== undefined) {
    payload.isbn = book.isbn ? String(book.isbn).trim() : null;
  }
  if (book.statusIsbn !== undefined) {
    payload.statusIsbn = book.statusIsbn ?? null;
  }
  if (book.kelengkapanNaskah !== undefined) {
    payload.kelengkapanNaskah = Array.isArray(book.kelengkapanNaskah)
      ? book.kelengkapanNaskah.filter((v) => typeof v === 'string')
      : [];
  }
  if (book.adaPertanyaan !== undefined) {
    payload.adaPertanyaan = Boolean(book.adaPertanyaan);
  }
  if (book.catatanBuku !== undefined) {
    payload.catatanBuku = book.catatanBuku ? String(book.catatanBuku).trim() : null;
  }
  if (book.catatanBiaya !== undefined) {
    payload.catatanBiaya = book.catatanBiaya ? String(book.catatanBiaya).trim() : null;
  }
  if (book.catatanLain !== undefined) {
    payload.catatanLain = book.catatanLain ? String(book.catatanLain).trim() : null;
  }
  if (book.customFields !== undefined) {
    if (book.customFields && typeof book.customFields === 'object') {
      const cleanCustom: Record<string, string | number | null> = {};
      Object.entries(book.customFields).forEach(([k, v]) => {
        if (k.trim()) {
          cleanCustom[k.trim()] = v === undefined ? null : v;
        }
      });
      payload.customFields = cleanCustom;
    } else {
      payload.customFields = null;
    }
  }
  if (book.importId !== undefined) {
    payload.importId = book.importId ? String(book.importId) : null;
  }

  Object.keys(payload).forEach((key) => {
    if (payload[key] === undefined) {
      payload[key] = null;
    }
  });

  return payload;
}

/**
 * Membersihkan pembaruan parsial (updateDoc) untuk Firestore
 */
export function sanitizeBookUpdatesForFirestore(updates: Partial<BookJob>): Record<string, any> {
  const payload: Record<string, any> = {};

  if ('no' in updates) payload.no = toFiniteNumber(updates.no, 0);
  if ('judul' in updates) payload.judul = String(updates.judul ?? '').trim() || 'Tanpa Judul';
  if ('penulis' in updates) payload.penulis = String(updates.penulis ?? '').trim() || 'Tanpa Penulis';
  if ('kategori' in updates) payload.kategori = normalizeKategori(updates.kategori);
  if ('paket' in updates) payload.paket = normalizePaket(updates.paket);
  if ('statusProgres' in updates) {
    payload.statusProgres = updates.statusProgres
      ? String(updates.statusProgres).trim() || 'Di Saya'
      : 'Di Saya';
  }
  if ('tglTerima' in updates) payload.tglTerima = normalizeIsoDate(updates.tglTerima).value;
  if ('tglSelesaiLayout' in updates) payload.tglSelesaiLayout = normalizeIsoDate(updates.tglSelesaiLayout).value;
  if ('tglSelesai' in updates) payload.tglSelesai = normalizeIsoDate(updates.tglSelesai).value;
  if ('updateTerakhir' in updates) payload.updateTerakhir = normalizeIsoDate(updates.updateTerakhir).value;
  if ('halamanAwal' in updates) payload.halamanAwal = toFiniteNumber(updates.halamanAwal, 0);
  if ('halamanFinal' in updates) payload.halamanFinal = toFiniteNumber(updates.halamanFinal, 0);
  if ('stuck' in updates) payload.stuck = updates.stuck === 'Ya' ? 'Ya' : 'Tidak';
  if ('nilaiJasa' in updates) payload.nilaiJasa = toFiniteNumber(updates.nilaiJasa, 0);
  if ('statusBayar' in updates) payload.statusBayar = normalizeStatusBayar(updates.statusBayar);
  if ('noInvoice' in updates) {
    payload.noInvoice = updates.noInvoice ? String(updates.noInvoice).trim() : null;
  }
  if ('tglInvoice' in updates) payload.tglInvoice = normalizeIsoDate(updates.tglInvoice).value;
  if ('tglDibayar' in updates) payload.tglDibayar = normalizeIsoDate(updates.tglDibayar).value;
  if ('catatanBelumSelesai' in updates) payload.catatanBelumSelesai = String(updates.catatanBelumSelesai ?? '');

  if ('ukuran' in updates || 'ukuranBuku' in updates) {
    const rawUk = 'ukuran' in updates ? updates.ukuran : updates.ukuranBuku;
    const cleanUkuran = rawUk ? String(rawUk).trim() : null;
    payload.ukuran = cleanUkuran;
    payload.ukuranBuku = cleanUkuran;
  }
  if ('halamanWarna' in updates) payload.halamanWarna = updates.halamanWarna ?? null;
  if ('estimasiHalaman' in updates) {
    payload.estimasiHalaman =
      updates.estimasiHalaman === null || updates.estimasiHalaman === undefined
        ? null
        : toFiniteNumber(updates.estimasiHalaman, 0);
  }
  if ('kodeProduksi' in updates) payload.kodeProduksi = updates.kodeProduksi ? String(updates.kodeProduksi).trim() : null;
  if ('isbn' in updates) payload.isbn = updates.isbn ? String(updates.isbn).trim() : null;
  if ('statusIsbn' in updates) payload.statusIsbn = updates.statusIsbn ?? null;
  if ('kelengkapanNaskah' in updates) {
    payload.kelengkapanNaskah = Array.isArray(updates.kelengkapanNaskah)
      ? updates.kelengkapanNaskah.filter((v) => typeof v === 'string')
      : [];
  }
  if ('adaPertanyaan' in updates) {
    payload.adaPertanyaan = Boolean(updates.adaPertanyaan);
  }
  if ('catatanBuku' in updates) {
    payload.catatanBuku = updates.catatanBuku ? String(updates.catatanBuku).trim() : null;
  }
  if ('catatanBiaya' in updates) {
    payload.catatanBiaya = updates.catatanBiaya ? String(updates.catatanBiaya).trim() : null;
  }
  if ('catatanLain' in updates) {
    payload.catatanLain = updates.catatanLain ? String(updates.catatanLain).trim() : null;
  }
  if ('customFields' in updates) {
    if (updates.customFields && typeof updates.customFields === 'object') {
      const cleanCustom: Record<string, string | number | null> = {};
      Object.entries(updates.customFields).forEach(([k, v]) => {
        if (k.trim()) {
          cleanCustom[k.trim()] = v === undefined ? null : v;
        }
      });
      payload.customFields = cleanCustom;
    } else {
      payload.customFields = null;
    }
  }
  if ('importId' in updates) {
    payload.importId = updates.importId ? String(updates.importId) : null;
  }

  Object.keys(payload).forEach((key) => {
    if (payload[key] === undefined) {
      payload[key] = null;
    }
  });

  return payload;
}
