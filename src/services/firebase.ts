import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  reauthenticateWithPopup,
  signOut,
  onAuthStateChanged,
  User,
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  collection,
  query,
  orderBy,
  where,
  limit,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  onSnapshot,
  getDocFromServer,
  serverTimestamp,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import {
  ActivityEntry,
  AuthUser,
  BookJob,
  BookLog,
  LastImportRecord,
  RevisionNote,
} from '../types';
import {
  computeDerivedBookFields,
  normalizeIsoDate,
  sanitizeBookUpdatesForFirestore,
  serializeBookForFirestore,
} from '../utils/bookHelpers';
import { normalizeLogJenis, normalizeLogStatus } from '../config/logConstants';
import { StatusGroupKey } from '../config/masterData';

// Inisialisasi Firebase App menggunakan konfigurasi yang sudah ada
const app = initializeApp(firebaseConfig);

// CRITICAL: Gunakan firestoreDatabaseId dari konfigurasi
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);

// Provider login Google dasar (TANPA scope Google Sheets)
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: 'select_account',
});

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

/**
 * Mengubah error Firestore menjadi pesan yang jelas untuk UI
 */
export function getFirestoreErrorMessage(error: unknown): string {
  const rawCode = (error as any)?.code || '';
  const rawMessage = error instanceof Error ? error.message : String(error || '');
  const lower = `${rawCode} ${rawMessage}`.toLowerCase();

  if (
    rawCode === 'permission-denied' ||
    lower.includes('permission-denied') ||
    lower.includes('missing or insufficient permissions')
  ) {
    return 'Akses Firestore ditolak (permission-denied). Periksa aturan Firestore di Firebase Console > Firestore Database > Rules.';
  }
  if (lower.includes('unavailable') || lower.includes('offline')) {
    return 'Koneksi ke Cloud Firestore terganggu atau sedang offline. Coba periksa internet Anda.';
  }
  if (lower.includes('not-found')) {
    return 'Dokumen atau database Firestore tidak ditemukan. Pastikan Cloud Firestore sudah diaktifkan di Firebase Console.';
  }
  return rawMessage || 'Terjadi kesalahan saat mengakses Cloud Firestore.';
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(getFirestoreErrorMessage(error));
}

/**
 * Konversi Firebase User menjadi objek AuthUser aplikasi
 */
export function mapFirebaseUser(fbUser: User): AuthUser {
  const email = fbUser.email || '';
  return {
    uid: fbUser.uid,
    name: fbUser.displayName || (email ? email.split('@')[0] : 'Pengguna Schnell'),
    email,
    photoUrl: fbUser.photoURL || '',
  };
}

/**
 * Login Google menggunakan Firebase Auth dasar (tanpa scope Sheets)
 */
export async function signInWithGooglePopup(): Promise<{ user: AuthUser }> {
  const result = await signInWithPopup(auth, googleProvider);
  return {
    user: mapFirebaseUser(result.user),
  };
}

/**
 * Meminta token izin baca Google Sheets SATU KALI HANYA saat tombol "Impor dari Google Sheet" diklik.
 * Token tidak pernah disimpan di mana pun setelah proses impor selesai.
 */
export async function requestOneTimeSheetsImportToken(): Promise<string> {
  const sheetsImportProvider = new GoogleAuthProvider();
  sheetsImportProvider.addScope('https://www.googleapis.com/auth/spreadsheets.readonly');
  sheetsImportProvider.setCustomParameters({
    prompt: 'consent select_account',
  });

  const result = auth.currentUser
    ? await reauthenticateWithPopup(auth.currentUser, sheetsImportProvider)
    : await signInWithPopup(auth, sheetsImportProvider);

  const credential = GoogleAuthProvider.credentialFromResult(result);
  const token = credential?.accessToken;
  if (!token) {
    throw new Error(
      'Izin baca Google Sheets tidak diberikan. Silakan centang akses Google Sheets pada jendela Google untuk melakukan impor.'
    );
  }
  return token;
}

/**
 * Logout dari Firebase Auth
 */
export async function signOutFirebase(): Promise<void> {
  await signOut(auth);
}

/**
 * Pantau status autentikasi Firebase
 */
export function subscribeAuthState(
  callback: (user: AuthUser | null) => void
): () => void {
  return onAuthStateChanged(auth, (fbUser) => {
    callback(fbUser ? mapFirebaseUser(fbUser) : null);
  });
}

/**
 * Uji koneksi awal ke Firestore saat aplikasi dimuat
 */
export async function testFirestoreConnection(): Promise<boolean> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn('Firestore offline atau koneksi internet belum stabil.');
    }
    return false;
  }
}

// ============================================================================
// KOLEKSI DATA BUKU: users/{uid}/books (Sumber Data Utama)
// ============================================================================

/**
 * Mendengarkan perubahan koleksi users/{uid}/books secara real-time, diurutkan berdasarkan no.
 * Kolom turunan (hariBerjalan, umurPiutang, lamaLayoutAwal) dihitung setiap snapshot diterima.
 */
export function subscribeUserBooks(
  userId: string,
  onBooks: (books: BookJob[]) => void,
  onError: (errorMessage: string) => void
): () => void {
  if (!userId || !auth.currentUser || auth.currentUser.uid !== userId) {
    return () => {};
  }

  const path = `users/${userId}/books`;
  try {
    const booksCol = collection(db, 'users', userId, 'books');
    const q = query(booksCol, orderBy('no', 'asc'));

    return onSnapshot(
      q,
      (snapshot) => {
        const list: BookJob[] = snapshot.docs.map((docSnap) => {
          const data = docSnap.data() as Partial<BookJob>;
          return computeDerivedBookFields({
            ...data,
            id: docSnap.id,
          });
        });
        list.sort((a, b) => a.no - b.no);
        onBooks(list);
      },
      (error) => {
        console.error('Firestore onSnapshot Error:', path, error);
        onError(getFirestoreErrorMessage(error));
      }
    );
  } catch (error) {
    console.error('Firestore subscribeUserBooks Error:', path, error);
    onError(getFirestoreErrorMessage(error));
    return () => {};
  }
}

/**
 * Menambahkan 1 buku baru ke koleksi users/{uid}/books
 */
export async function addUserBook(
  userId: string,
  bookData: Omit<BookJob, 'no'>,
  nextNo: number
): Promise<string> {
  if (!userId || !auth.currentUser || auth.currentUser.uid !== userId) {
    throw new Error('Sesi pengguna tidak aktif. Silakan login kembali.');
  }

  const path = `users/${userId}/books`;
  const payload = {
    ...serializeBookForFirestore({
      ...bookData,
      no: nextNo,
    }),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  try {
    const docRef = await addDoc(collection(db, 'users', userId, 'books'), payload);
    return docRef.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

/**
 * Memperbarui field buku pada users/{uid}/books/{bookId}
 */
export async function updateUserBook(
  userId: string,
  bookId: string,
  updates: Partial<BookJob>
): Promise<void> {
  if (!userId || !auth.currentUser || auth.currentUser.uid !== userId) {
    throw new Error('Sesi pengguna tidak aktif. Silakan login kembali.');
  }
  if (!bookId) {
    throw new Error('ID dokumen buku tidak ditemukan di Firestore.');
  }

  const path = `users/${userId}/books/${bookId}`;
  const sanitized = sanitizeBookUpdatesForFirestore(updates);
  const payload = {
    ...sanitized,
    updatedAt: serverTimestamp(),
  };

  try {
    await updateDoc(doc(db, 'users', userId, 'books', bookId), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

/**
 * Menghapus dokumen buku dari users/{uid}/books/{bookId}
 */
export async function deleteUserBook(userId: string, bookId: string): Promise<void> {
  if (!userId || !auth.currentUser || auth.currentUser.uid !== userId) {
    throw new Error('Sesi pengguna tidak aktif. Silakan login kembali.');
  }
  if (!bookId) {
    throw new Error('ID dokumen buku tidak ditemukan di Firestore.');
  }

  const path = `users/${userId}/books/${bookId}`;
  try {
    await deleteDoc(doc(db, 'users', userId, 'books', bookId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export type BatchImportOperation =
  | { type: 'create'; data: Partial<BookJob> }
  | { type: 'overwrite'; bookId: string; data: Partial<BookJob> };

/**
 * Mengimpor banyak buku sekaligus memakai writeBatch (maksimal 400 operasi per batch)
 */
export async function batchImportUserBooks(
  userId: string,
  operations: BatchImportOperation[]
): Promise<{ created: number; updated: number }> {
  if (!userId || !auth.currentUser || auth.currentUser.uid !== userId) {
    throw new Error('Sesi pengguna tidak aktif. Silakan login kembali.');
  }

  const path = `users/${userId}/books`;
  const CHUNK_SIZE = 400; // Batas aman di bawah limit 500 operasi writeBatch Firestore
  let created = 0;
  let updated = 0;

  try {
    const colRef = collection(db, 'users', userId, 'books');

    for (let i = 0; i < operations.length; i += CHUNK_SIZE) {
      const chunk = operations.slice(i, i + CHUNK_SIZE);
      const batch = writeBatch(db);

      for (const op of chunk) {
        if (op.type === 'create') {
          const newDocRef = doc(colRef);
          const payload = {
            ...serializeBookForFirestore(op.data),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          };
          batch.set(newDocRef, payload);
          created++;
        } else {
          const existingRef = doc(db, 'users', userId, 'books', op.bookId);
          const payload = {
            ...serializeBookForFirestore(op.data),
            updatedAt: serverTimestamp(),
          };
          batch.set(existingRef, payload, { merge: true });
          updated++;
        }
      }

      await batch.commit();
    }

    return { created, updated };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

// ============================================================================
// PENGATURAN AKUN: users/{uid} (Tetap di tempat yang sama)
// ============================================================================

export interface SyncedUserData {
  monthlyTarget?: number;
  packageRates?: {
    Basic: number;
    Standart: number;
    Premium: number;
  };
  dummyStatuses?: Record<number, string>;
  bookNotes?: Record<number, any[]>;
  customStatuses?: string[];
  statusGroupOverrides?: Record<string, StatusGroupKey>;
  statusDiSaya?: string[];
  statusSelesai?: string;
  batasHariTerlambat?: number;
  bukuViewMode?: 'daftar' | 'kartu';
  logsMigrated?: boolean;
  lastImport?: LastImportRecord | null;
  updatedAt?: string;
}

/**
 * Membaca data pengaturan pengguna yang tersinkronisasi di Firestore
 */
export async function fetchUserCloudData(userId: string): Promise<SyncedUserData | null> {
  if (!userId || !auth.currentUser || auth.currentUser.uid !== userId) {
    return null;
  }
  const path = `users/${userId}`;
  try {
    const snap = await getDoc(doc(db, 'users', userId));
    if (snap.exists()) {
      return snap.data() as SyncedUserData;
    }
    return null;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

/**
 * Menyimpan atau memperbarui data pengaturan pengguna ke Firestore
 */
export async function saveUserCloudData(
  userId: string,
  data: Partial<SyncedUserData>
): Promise<void> {
  if (!userId || !auth.currentUser || auth.currentUser.uid !== userId) {
    return;
  }
  const path = `users/${userId}`;
  const payload: Record<string, any> = {
    updatedAt: new Date().toISOString(),
  };

  if (data.monthlyTarget !== undefined) {
    const target = Number(data.monthlyTarget);
    if (!Number.isNaN(target) && target > 0 && target <= 10000) {
      payload.monthlyTarget = target;
    }
  }
  if (data.packageRates !== undefined) {
    payload.packageRates = data.packageRates;
  }
  if (data.dummyStatuses !== undefined) {
    payload.dummyStatuses = data.dummyStatuses;
  }
  if (data.bookNotes !== undefined) {
    payload.bookNotes = data.bookNotes;
  }
  if (data.customStatuses !== undefined) {
    payload.customStatuses = data.customStatuses;
  }
  if (data.statusGroupOverrides !== undefined) {
    payload.statusGroupOverrides = data.statusGroupOverrides;
  }
  if (data.statusDiSaya !== undefined) {
    payload.statusDiSaya = data.statusDiSaya;
  }
  if (data.statusSelesai !== undefined) {
    payload.statusSelesai = String(data.statusSelesai || '').trim() || 'Selesai';
  }
  if (data.batasHariTerlambat !== undefined) {
    const batas = Number(data.batasHariTerlambat);
    if (!Number.isNaN(batas) && batas >= 1 && batas <= 365) {
      payload.batasHariTerlambat = Math.round(batas);
    }
  }
  if (data.bukuViewMode !== undefined) {
    payload.bukuViewMode = data.bukuViewMode === 'kartu' ? 'kartu' : 'daftar';
  }
  if (data.logsMigrated !== undefined) {
    payload.logsMigrated = Boolean(data.logsMigrated);
  }
  if (data.lastImport !== undefined) {
    payload.lastImport = data.lastImport;
  }

  try {
    await setDoc(doc(db, 'users', userId), payload, { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

/**
 * Mendengarkan perubahan data pengaturan pengguna secara real-time antar perangkat
 */
export function subscribeUserCloudData(
  userId: string,
  onData: (data: SyncedUserData) => void
): () => void {
  if (!userId || !auth.currentUser || auth.currentUser.uid !== userId) {
    return () => {};
  }
  const path = `users/${userId}`;
  return onSnapshot(
    doc(db, 'users', userId),
    (snap) => {
      if (snap.exists()) {
        onData(snap.data() as SyncedUserData);
      }
    },
    (error) => {
      console.error('Firestore subscribeUserCloudData error:', path, error);
    }
  );
}

// ============================================================================
// KOLEKSI LOG CATATAN PER BUKU: users/{uid}/logs
// ============================================================================

function sanitizeLogPayload(raw: Partial<BookLog>): Record<string, any> {
  const tanggal =
    raw.tanggal === null || raw.tanggal === undefined
      ? null
      : normalizeIsoDate(raw.tanggal).value;

  const payload: Record<string, any> = {
    bookId: String(raw.bookId ?? '').trim(),
    bookNo: Number.isFinite(Number(raw.bookNo)) ? Number(raw.bookNo) : 0,
    tanggal,
    dari: String(raw.dari ?? '').trim(),
    isi: String(raw.isi ?? '').trim(),
    jenis: normalizeLogJenis(raw.jenis),
    status: normalizeLogStatus(raw.status ?? 'Baru'),
    source: raw.source === 'import' ? 'import' : 'manual',
  };

  if (raw.importId !== undefined) {
    payload.importId = raw.importId ? String(raw.importId) : null;
  }

  return payload;
}

/**
 * Mendengarkan seluruh log catatan pengguna dalam SATU listener onSnapshot (pengelompokan per buku di sisi klien)
 */
export function subscribeUserLogs(
  userId: string,
  onLogs: (logs: BookLog[]) => void,
  onError: (errorMessage: string) => void
): () => void {
  if (!userId || !auth.currentUser || auth.currentUser.uid !== userId) {
    return () => {};
  }

  const path = `users/${userId}/logs`;
  try {
    const logsCol = collection(db, 'users', userId, 'logs');
    return onSnapshot(
      logsCol,
      (snapshot) => {
        const list: BookLog[] = snapshot.docs.map((docSnap) => {
          const data = docSnap.data() as Partial<BookLog>;
          return {
            id: docSnap.id,
            bookId: String(data.bookId || ''),
            bookNo: Number(data.bookNo || 0),
            tanggal: data.tanggal ?? null,
            dari: String(data.dari ?? '').trim(),
            isi: String(data.isi || ''),
            jenis: normalizeLogJenis(data.jenis),
            status: normalizeLogStatus(data.status ?? 'Selesai'),
            source: data.source === 'import' ? 'import' : 'manual',
            ...(data.importId ? { importId: String(data.importId) } : {}),
            createdAt: data.createdAt,
            updatedAt: data.updatedAt,
          };
        });
        onLogs(list);
      },
      (error) => {
        console.error('Firestore subscribeUserLogs error:', path, error);
        onError(getFirestoreErrorMessage(error));
      }
    );
  } catch (error) {
    onError(getFirestoreErrorMessage(error));
    return () => {};
  }
}

export async function addUserLog(
  userId: string,
  logData: Omit<BookLog, 'id' | 'createdAt' | 'updatedAt'>
): Promise<string> {
  if (!userId || !auth.currentUser || auth.currentUser.uid !== userId) {
    throw new Error('Sesi pengguna tidak aktif. Silakan login kembali.');
  }
  const path = `users/${userId}/logs`;
  const payload = {
    ...sanitizeLogPayload(logData),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  try {
    const docRef = await addDoc(collection(db, 'users', userId, 'logs'), payload);
    return docRef.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateUserLog(
  userId: string,
  logId: string,
  updates: Partial<BookLog>
): Promise<void> {
  if (!userId || !auth.currentUser || auth.currentUser.uid !== userId) {
    throw new Error('Sesi pengguna tidak aktif. Silakan login kembali.');
  }
  if (!logId) throw new Error('ID log catatan tidak ditemukan.');

  const path = `users/${userId}/logs/${logId}`;
  const payload: Record<string, any> = {
    updatedAt: serverTimestamp(),
  };

  if ('bookId' in updates) payload.bookId = String(updates.bookId ?? '');
  if ('bookNo' in updates) payload.bookNo = Number(updates.bookNo || 0);
  if ('tanggal' in updates) {
    payload.tanggal =
      updates.tanggal === null || updates.tanggal === undefined
        ? null
        : normalizeIsoDate(updates.tanggal).value;
  }
  if ('dari' in updates) payload.dari = String(updates.dari ?? '').trim();
  if ('isi' in updates) payload.isi = String(updates.isi ?? '').trim();
  if ('jenis' in updates) payload.jenis = normalizeLogJenis(updates.jenis);
  if ('status' in updates) payload.status = normalizeLogStatus(updates.status);

  try {
    await updateDoc(doc(db, 'users', userId, 'logs', logId), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteUserLog(userId: string, logId: string): Promise<void> {
  if (!userId || !auth.currentUser || auth.currentUser.uid !== userId) {
    throw new Error('Sesi pengguna tidak aktif. Silakan login kembali.');
  }
  if (!logId) throw new Error('ID log catatan tidak ditemukan.');

  const path = `users/${userId}/logs/${logId}`;
  try {
    await deleteDoc(doc(db, 'users', userId, 'logs', logId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function deleteLogsForBook(
  userId: string,
  bookId: string,
  logIdsHint?: string[]
): Promise<number> {
  if (!userId || !auth.currentUser || auth.currentUser.uid !== userId) {
    throw new Error('Sesi pengguna tidak aktif. Silakan login kembali.');
  }

  const path = `users/${userId}/logs`;
  try {
    let idsToDelete = logIdsHint ? [...logIdsHint] : [];
    if (idsToDelete.length === 0 && bookId) {
      const q = query(collection(db, 'users', userId, 'logs'), where('bookId', '==', bookId));
      const snap = await getDocs(q);
      idsToDelete = snap.docs.map((d) => d.id);
    }

    const CHUNK = 400;
    for (let i = 0; i < idsToDelete.length; i += CHUNK) {
      const batch = writeBatch(db);
      idsToDelete.slice(i, i + CHUNK).forEach((id) => {
        batch.delete(doc(db, 'users', userId, 'logs', id));
      });
      await batch.commit();
    }
    return idsToDelete.length;
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function markAllBookLogsDone(
  userId: string,
  logIds: string[]
): Promise<void> {
  if (!userId || !auth.currentUser || auth.currentUser.uid !== userId || logIds.length === 0) {
    return;
  }
  const path = `users/${userId}/logs`;
  try {
    const CHUNK = 400;
    for (let i = 0; i < logIds.length; i += CHUNK) {
      const batch = writeBatch(db);
      logIds.slice(i, i + CHUNK).forEach((id) => {
        batch.update(doc(db, 'users', userId, 'logs', id), {
          status: 'Selesai',
          updatedAt: serverTimestamp(),
        });
      });
      await batch.commit();
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export interface BatchLogWriteItem {
  docId: string;
  data: Omit<BookLog, 'id' | 'createdAt' | 'updatedAt'>;
}

export async function batchUpsertUserLogs(
  userId: string,
  items: BatchLogWriteItem[]
): Promise<number> {
  if (!userId || !auth.currentUser || auth.currentUser.uid !== userId || items.length === 0) {
    return 0;
  }

  const path = `users/${userId}/logs`;
  const CHUNK_SIZE = 400;
  let written = 0;

  try {
    for (let i = 0; i < items.length; i += CHUNK_SIZE) {
      const chunk = items.slice(i, i + CHUNK_SIZE);
      const batch = writeBatch(db);
      chunk.forEach((item) => {
        const ref = doc(db, 'users', userId, 'logs', item.docId);
        batch.set(
          ref,
          {
            ...sanitizeLogPayload(item.data),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
        written++;
      });
      await batch.commit();
    }
    return written;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

/**
 * Migrasi satu kali (idempoten) dari catatan lama (`users/{uid}.bookNotes`) ke `users/{uid}/logs`.
 * Pemetaan sesuai spesifikasi:
 * - Revisi Penulis -> dari Penulis, jenis Revisi
 * - Korektor / Coped -> dari Coped, jenis Info
 * - Tag lain -> dari Saya, jenis Info
 * - Status -> Selesai; tanggal dipertahankan; TIDAK menghapus data lama.
 */
export async function migrateLegacyNotesToLogsOnce(
  userId: string,
  books: BookJob[],
  bookNotesMap?: Record<number, RevisionNote[]>
): Promise<number> {
  if (!userId || !auth.currentUser || auth.currentUser.uid !== userId) return 0;
  if (!bookNotesMap || Object.keys(bookNotesMap).length === 0 || books.length === 0) {
    await saveUserCloudData(userId, { logsMigrated: true });
    return 0;
  }

  const bookByNo = new Map<number, BookJob>();
  books.forEach((b) => {
    if (b.id && b.no) bookByNo.set(b.no, b);
  });

  const batchItems: BatchLogWriteItem[] = [];

  Object.entries(bookNotesMap).forEach(([noKey, noteList]) => {
    const bookNo = parseInt(noKey, 10);
    const matchedBook = bookByNo.get(bookNo);
    if (!matchedBook || !matchedBook.id || !Array.isArray(noteList)) return;

    noteList.forEach((note) => {
      const text = String(note?.text || '').trim();
      if (!text) return;

      const cat = String(note?.category || '');
      let dari = 'Saya';
      let jenis: BookLog['jenis'] = 'Info';
      if (cat === 'Revisi Penulis') {
        dari = 'Penulis';
        jenis = 'Revisi';
      } else if (cat === 'Korektor / Coped') {
        dari = 'Coped';
        jenis = 'Info';
      }

      // Ekstrak tanggal dari format timestamp lama (mis. "27 Okt 2026, 14:30 WIB")
      const rawTs = String(note?.timestamp || '').split(',')[0].trim();
      const parsedDate = normalizeIsoDate(rawTs);
      const tanggal = parsedDate.isValid ? parsedDate.value : null;

      const safeNoteId = String(note?.id || Math.random().toString(36).slice(2, 8)).replace(
        /[^a-zA-Z0-9_-]/g,
        '_'
      );

      batchItems.push({
        docId: `mig_${matchedBook.no}_${safeNoteId}`,
        data: {
          bookId: matchedBook.id!,
          bookNo: matchedBook.no,
          tanggal,
          dari,
          isi: text,
          jenis,
          status: 'Selesai',
          source: 'manual',
        },
      });
    });
  });

  if (batchItems.length > 0) {
    await batchUpsertUserLogs(userId, batchItems);
  }
  await saveUserCloudData(userId, { logsMigrated: true });
  return batchItems.length;
}

// ============================================================================
// KOLEKSI AKTIVITAS TERBARU: users/{uid}/activity
// ============================================================================

export function subscribeUserActivity(
  userId: string,
  onActivity: (entries: ActivityEntry[]) => void
): () => void {
  if (!userId || !auth.currentUser || auth.currentUser.uid !== userId) {
    return () => {};
  }
  const path = `users/${userId}/activity`;
  try {
    const q = query(
      collection(db, 'users', userId, 'activity'),
      orderBy('createdAt', 'desc'),
      limit(30)
    );
    return onSnapshot(
      q,
      (snapshot) => {
        const list: ActivityEntry[] = snapshot.docs.map((docSnap) => {
          const d = docSnap.data() as Partial<ActivityEntry>;
          return {
            id: docSnap.id,
            type: d.type || 'log_created',
            title: String(d.title || ''),
            detail: String(d.detail || ''),
            bookId: d.bookId,
            bookNo: d.bookNo,
            judul: d.judul,
            importId: d.importId,
            createdAt: d.createdAt,
          };
        });
        onActivity(list);
      },
      (error) => {
        console.error('Firestore subscribeUserActivity error:', path, error);
      }
    );
  } catch {
    return () => {};
  }
}

export async function addUserActivity(
  userId: string,
  entry: Omit<ActivityEntry, 'id' | 'createdAt'>
): Promise<void> {
  if (!userId || !auth.currentUser || auth.currentUser.uid !== userId) return;
  try {
    const payload: Record<string, any> = {
      type: entry.type,
      title: entry.title,
      detail: entry.detail,
      createdAt: new Date().toISOString(),
    };
    if (entry.bookId !== undefined) payload.bookId = entry.bookId;
    if (entry.bookNo !== undefined) payload.bookNo = entry.bookNo;
    if (entry.judul !== undefined) payload.judul = entry.judul;
    if (entry.importId !== undefined) payload.importId = entry.importId;
    await addDoc(collection(db, 'users', userId, 'activity'), payload);
  } catch (err) {
    console.warn('Gagal mencatat aktivitas terbaru:', err);
  }
}

// ============================================================================
// PEMETAAN KOLOM IMPOR PER TAB: users/{uid}/settings/importMapping
// ============================================================================

export async function fetchImportMappings(
  userId: string
): Promise<Record<string, Record<string, string>>> {
  if (!userId || !auth.currentUser || auth.currentUser.uid !== userId) return {};
  try {
    const snap = await getDoc(doc(db, 'users', userId, 'settings', 'importMapping'));
    if (snap.exists()) {
      const data = snap.data();
      return (data?.mappings as Record<string, Record<string, string>>) || {};
    }
    return {};
  } catch (err) {
    console.warn('Gagal membaca importMapping:', err);
    return {};
  }
}

export async function saveImportMappingForTab(
  userId: string,
  tabName: string,
  columnMap: Record<string, string>
): Promise<void> {
  if (!userId || !auth.currentUser || auth.currentUser.uid !== userId) return;
  const cleanTabKey = tabName.trim() || 'default';
  try {
    const existing = await fetchImportMappings(userId);
    await setDoc(
      doc(db, 'users', userId, 'settings', 'importMapping'),
      {
        mappings: {
          ...existing,
          [cleanTabKey]: columnMap,
        },
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
  } catch (err) {
    console.warn('Gagal menyimpan importMapping:', err);
  }
}

/**
 * Mengimpor operasi buku dengan melampirkan importId & mencatat dokumen ID baru yang dibuat
 */
export async function batchImportBooksWithImportId(
  userId: string,
  operations: BatchImportOperation[],
  importId: string
): Promise<{
  created: number;
  updated: number;
  createdBookRefs: Array<{ id: string; no: number; judul: string }>;
}> {
  if (!userId || !auth.currentUser || auth.currentUser.uid !== userId) {
    throw new Error('Sesi pengguna tidak aktif. Silakan login kembali.');
  }

  const path = `users/${userId}/books`;
  const CHUNK_SIZE = 400;
  let created = 0;
  let updated = 0;
  const createdBookRefs: Array<{ id: string; no: number; judul: string }> = [];

  try {
    const colRef = collection(db, 'users', userId, 'books');

    for (let i = 0; i < operations.length; i += CHUNK_SIZE) {
      const chunk = operations.slice(i, i + CHUNK_SIZE);
      const batch = writeBatch(db);

      for (const op of chunk) {
        if (op.type === 'create') {
          const newDocRef = doc(colRef);
          const serialized = serializeBookForFirestore({ ...op.data, importId });
          const payload = {
            ...serialized,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          };
          batch.set(newDocRef, payload);
          created++;
          createdBookRefs.push({
            id: newDocRef.id,
            no: Number(serialized.no || 0),
            judul: String(serialized.judul || ''),
          });
        } else {
          const existingRef = doc(db, 'users', userId, 'books', op.bookId);
          const payload = {
            ...sanitizeBookUpdatesForFirestore(op.data),
            lastUpdatedImportId: importId,
            updatedAt: serverTimestamp(),
          };
          batch.set(existingRef, payload, { merge: true });
          updated++;
        }
      }

      await batch.commit();
    }

    return { created, updated, createdBookRefs };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

/**
 * Membatalkan impor terakhir dengan menghapus HANYA dokumen yang ditandai importId tersebut
 * (tidak menyentuh data manual pengguna).
 */
export async function rollbackLastImport(
  userId: string,
  importId: string
): Promise<{ deletedBooks: number; deletedLogs: number }> {
  if (!userId || !auth.currentUser || auth.currentUser.uid !== userId) {
    throw new Error('Sesi pengguna tidak aktif. Silakan login kembali.');
  }
  if (!importId) {
    throw new Error('ID impor tidak ditemukan.');
  }

  const CHUNK = 400;
  let deletedBooks = 0;
  let deletedLogs = 0;

  try {
    const booksSnap = await getDocs(
      query(collection(db, 'users', userId, 'books'), where('importId', '==', importId))
    );
    const logsSnap = await getDocs(
      query(collection(db, 'users', userId, 'logs'), where('importId', '==', importId))
    );
    const actSnap = await getDocs(
      query(collection(db, 'users', userId, 'activity'), where('importId', '==', importId))
    );

    const targets: Array<{ col: 'books' | 'logs' | 'activity'; id: string }> = [];
    booksSnap.docs.forEach((d) => targets.push({ col: 'books', id: d.id }));
    logsSnap.docs.forEach((d) => targets.push({ col: 'logs', id: d.id }));
    actSnap.docs.forEach((d) => targets.push({ col: 'activity', id: d.id }));

    for (let i = 0; i < targets.length; i += CHUNK) {
      const batch = writeBatch(db);
      targets.slice(i, i + CHUNK).forEach((t) => {
        batch.delete(doc(db, 'users', userId, t.col, t.id));
      });
      await batch.commit();
    }

    deletedBooks = booksSnap.size;
    deletedLogs = logsSnap.size;
    await saveUserCloudData(userId, { lastImport: null });
    return { deletedBooks, deletedLogs };
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `users/${userId}`);
  }
}

