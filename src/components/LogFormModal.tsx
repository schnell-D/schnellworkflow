import React, { useState, useEffect } from 'react';
import { X, Send, Check, BookOpen } from 'lucide-react';
import { BookJob, BookLog, LogJenisType, LogStatusType } from '../types';
import {
  LOG_DARI_SUGGESTIONS,
  LOG_JENIS_OPTIONS,
  LOG_STATUS_OPTIONS,
} from '../config/logConstants';
import { getTodayIsoDate } from '../utils/bookHelpers';

interface LogFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  books: BookJob[];
  initialBookId?: string;
  editingLog?: BookLog | null;
  onSubmit: (data: {
    id?: string;
    bookId: string;
    bookNo: number;
    tanggal: string | null;
    dari: string;
    isi: string;
    jenis: LogJenisType;
    status: LogStatusType;
  }) => Promise<void> | void;
}

export const LogFormModal: React.FC<LogFormModalProps> = ({
  isOpen,
  onClose,
  books,
  initialBookId,
  editingLog,
  onSubmit,
}) => {
  const [selectedBookId, setSelectedBookId] = useState<string>('');
  const [tanggal, setTanggal] = useState<string>(getTodayIsoDate());
  const [noDate, setNoDate] = useState<boolean>(false);
  const [dariChip, setDariChip] = useState<string>('Saya');
  const [customDari, setCustomDari] = useState<string>('');
  const [jenis, setJenis] = useState<LogJenisType>('Info');
  const [status, setStatus] = useState<LogStatusType>('Baru');
  const [isi, setIsi] = useState<string>('');
  const [isSaving, setIsSaving] = useState<boolean>(false);

  useEffect(() => {
    if (!isOpen) return;
    if (editingLog) {
      setSelectedBookId(editingLog.bookId);
      setTanggal(editingLog.tanggal || getTodayIsoDate());
      setNoDate(editingLog.tanggal === null);
      const trimmedDari = (editingLog.dari || '').trim();
      const isKnown = trimmedDari === '' || LOG_DARI_SUGGESTIONS.includes(trimmedDari);
      if (isKnown) {
        setDariChip(trimmedDari);
        setCustomDari('');
      } else {
        setDariChip('__lainnya__');
        setCustomDari(trimmedDari);
      }
      setJenis(editingLog.jenis);
      setStatus(editingLog.status);
      setIsi(editingLog.isi);
    } else {
      const defaultBook =
        books.find((b) => b.id === initialBookId) || books[0];
      setSelectedBookId(defaultBook?.id || '');
      setTanggal(getTodayIsoDate());
      setNoDate(false);
      setDariChip('Saya');
      setCustomDari('');
      setJenis('Info');
      setStatus('Baru');
      setIsi('');
    }
    setIsSaving(false);
  }, [isOpen, editingLog, initialBookId, books]);

  if (!isOpen) return null;

  const finalDari =
    dariChip === '__lainnya__' ? customDari.trim() : dariChip;

  const matchedBook = books.find((b) => b.id === selectedBookId);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isi.trim() || !matchedBook?.id || isSaving) return;
    setIsSaving(true);
    try {
      await onSubmit({
        ...(editingLog?.id ? { id: editingLog.id } : {}),
        bookId: matchedBook.id,
        bookNo: matchedBook.no,
        tanggal: noDate ? null : tanggal || null,
        dari: finalDari,
        isi: isi.trim(),
        jenis,
        status,
      });
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
    >
      <div className="absolute inset-0" onClick={() => !isSaving && onClose()} />
      <form
        onSubmit={handleSave}
        className="relative z-10 w-full max-w-lg bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[92dvh]"
      >
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div>
            <h2 className="text-base font-extrabold text-slate-900 dark:text-white">
              {editingLog ? 'Edit Catatan Log' : 'Tambah Catatan Log'}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Simpan riwayat revisi, info, pertanyaan, atau masalah buku.
            </p>
          </div>
          <button
            type="button"
            disabled={isSaving}
            onClick={onClose}
            className="min-w-[44px] min-h-[44px] rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 flex items-center justify-center"
            aria-label="Tutup"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-4">
          {/* Pilih Buku */}
          <div>
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1.5">
              Buku
            </label>
            <div className="relative">
              <BookOpen className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <select
                value={selectedBookId}
                onChange={(e) => setSelectedBookId(e.target.value)}
                required
                className="w-full min-h-[44px] pl-9 pr-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-base sm:text-sm font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {books.map((b) => (
                  <option key={b.id || b.no} value={b.id || ''}>
                    #{b.no} — {b.judul}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Tanggal & Status (jika edit) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Tanggal
                </label>
                <label className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={noDate}
                    onChange={(e) => setNoDate(e.target.checked)}
                    className="rounded border-slate-300 text-blue-600"
                  />
                  <span>Tanpa tanggal</span>
                </label>
              </div>
              <input
                type="date"
                disabled={noDate}
                value={noDate ? '' : tanggal}
                onChange={(e) => setTanggal(e.target.value)}
                className="w-full min-h-[44px] px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-base sm:text-sm font-semibold text-slate-900 dark:text-white disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {editingLog && (
              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1.5">
                  Status
                </label>
                <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-slate-800">
                  {LOG_STATUS_OPTIONS.map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setStatus(st)}
                      className={`min-h-[38px] rounded-lg text-xs font-bold transition-colors ${
                        status === st
                          ? st === 'Baru'
                            ? 'bg-orange-500 text-white'
                            : 'bg-emerald-600 text-white'
                          : 'text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      {st}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Dari (chip pilihan + Lainnya) */}
          <div>
            <span className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1.5">
              Dari
            </span>
            <div className="flex flex-wrap gap-1.5">
              {LOG_DARI_SUGGESTIONS.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setDariChip(item)}
                  className={`min-h-[40px] px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors ${
                    dariChip === item
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                  }`}
                >
                  {item}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setDariChip('')}
                className={`min-h-[40px] px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors ${
                  dariChip === ''
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700'
                }`}
              >
                Tanpa pengirim
              </button>
              <button
                type="button"
                onClick={() => setDariChip('__lainnya__')}
                className={`min-h-[40px] px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors ${
                  dariChip === '__lainnya__'
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                }`}
              >
                Lainnya...
              </button>
            </div>
            {dariChip === '__lainnya__' && (
              <input
                type="text"
                value={customDari}
                onChange={(e) => setCustomDari(e.target.value)}
                placeholder="Ketik nama pengirim (opsional, misal: Percetakan)..."
                className="mt-2 w-full min-h-[44px] px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-blue-400 text-base sm:text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
              />
            )}
          </div>

          {/* Jenis (5 opsi termasuk Tambahan naskah) */}
          <div>
            <span className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1.5">
              Jenis Catatan
            </span>
            <div className="flex flex-wrap gap-1.5 p-1.5 rounded-xl bg-slate-100 dark:bg-slate-800">
              {LOG_JENIS_OPTIONS.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setJenis(opt)}
                  className={`flex-1 min-w-[92px] min-h-[40px] px-2.5 rounded-lg text-xs font-bold transition-colors whitespace-nowrap ${
                    jenis === opt
                      ? opt === 'Masalah'
                        ? 'bg-rose-600 text-white'
                        : opt === 'Revisi'
                        ? 'bg-orange-500 text-white'
                        : opt === 'Pertanyaan'
                        ? 'bg-blue-600 text-white'
                        : opt === 'Tambahan naskah'
                        ? 'bg-purple-600 text-white'
                        : 'bg-slate-800 text-white dark:bg-white dark:text-slate-900'
                      : 'text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>

          {/* Isi Catatan */}
          <div>
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1.5">
              Isi catatan
            </label>
            <textarea
              rows={3}
              required
              value={isi}
              onChange={(e) => setIsi(e.target.value)}
              placeholder="Tulis isi catatan revisi, pertanyaan, atau informasi pengerjaan..."
              className="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-base sm:text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="px-5 py-3.5 bg-slate-50 dark:bg-slate-800/80 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-2">
          <button
            type="button"
            disabled={isSaving}
            onClick={onClose}
            className="min-h-[44px] px-4 py-2 rounded-xl bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold"
          >
            Batal
          </button>
          <button
            type="submit"
            disabled={!isi.trim() || !matchedBook?.id || isSaving}
            className="min-h-[44px] px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-xs font-bold inline-flex items-center gap-1.5"
          >
            {editingLog ? <Check className="w-4 h-4" /> : <Send className="w-4 h-4" />}
            <span>{isSaving ? 'Menyimpan...' : editingLog ? 'Simpan Perubahan' : 'Tambah Catatan'}</span>
          </button>
        </div>
      </form>
    </div>
  );
};
