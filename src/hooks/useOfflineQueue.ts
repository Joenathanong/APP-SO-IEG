'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { getQueue, removeFromQueue, updateAttempts, getQueueCount, QUEUE_CHANGED_EVENT } from '@/lib/offline-queue';
import { toEntryPayload } from '@/lib/save-entry';

// Seberapa sering antrean dicoba ulang saat aplikasi terbuka.
const SYNC_INTERVAL_MS = 30_000;
// Setelah sekian percobaan, item TIDAK dibuang — hanya dilewati agar tidak
// memblokir item lain. Datanya tetap aman di IndexedDB sampai berhasil.
const MAX_ATTEMPTS_BEFORE_BACKOFF = 5;

export function useOfflineQueue() {
  const [isOnline, setIsOnline] = useState(true);
  const [queueCount, setQueueCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);
  // Sebab kegagalan terakhir. Sebelumnya nilai ini DISIMPAN ke IndexedDB tapi
  // tidak pernah ditampilkan di mana pun, sehingga saat semua scan menumpuk di
  // antrean tidak ada satu pun cara bagi operator maupun admin untuk tahu
  // kenapa. Itu membuat masalah nyata jadi tak terlihat berjam-jam.
  const [lastError, setLastError] = useState<string | null>(null);
  const [stuckCount, setStuckCount] = useState(0);

  // Pakai ref, bukan state, sebagai penjaga reentrancy: state 'isSyncing' baru
  // terlihat pada render berikutnya sehingga dua pemicu yang berdekatan
  // (interval + event online) bisa lolos bersamaan.
  const syncingRef = useRef(false);

  const refreshCount = useCallback(async () => {
    const count = await getQueueCount();
    setQueueCount(count);
    return count;
  }, []);

  /**
   * `force` melewati jeda mundur. Dipakai saat PENGGUNA menekan tombol kirim —
   * tindakan manual tidak boleh diperlambat oleh jeda yang dirancang untuk
   * percobaan otomatis. Tanpa ini, item yang sudah gagal beberapa kali terlihat
   * "gagal" padahal sebenarnya hanya sedang menunggu, dan pesan yang tampil
   * adalah error LAMA yang bisa saja sudah tidak relevan.
   */
  const syncQueue = useCallback(async (force = false): Promise<{ sent: number; failed: number; ditunda: number }> => {
    if (syncingRef.current) return { sent: 0, failed: 0, ditunda: 0 };
    syncingRef.current = true;
    setIsSyncing(true);

    let sent = 0, failed = 0, ditunda = 0;
    try {
      const queue = await getQueue();
      for (const item of queue) {
        if (!item.id) continue;

        // Item yang sudah gagal berkali-kali dicoba lebih jarang, tapi TIDAK
        // pernah dibuang. Dihitung terpisah sebagai `ditunda`, bukan `failed` —
        // menyebutnya gagal membuat item yang sekadar menunggu terlihat rusak.
        if (!force && item.attempts >= MAX_ATTEMPTS_BEFORE_BACKOFF) {
          const since = Date.now() - (item.lastAttempt ?? 0);
          if (since < Math.min(item.attempts, 30) * 60_000) { ditunda++; continue; }
        }

        try {
          // Kirim ulang APA ADANYA lewat endpoint yang sama dengan jalur scan.
          // Server menolak duplikat lewat index unik `clientEntryId`, jadi
          // mengulang kiriman ini aman berapa kali pun.
          const res = await fetch('/api/entries', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(toEntryPayload(item.type, item.data)),
          });

          if (res.ok) {
            await removeFromQueue(item.id);
            sent++;
          } else {
            let msg = `HTTP ${res.status}`;
            try {
              const j = await res.json();
              if (j?.error) msg = `${msg}: ${j.error}`;
            } catch { /* respons bukan JSON */ }
            await updateAttempts(item.id, item.attempts + 1, msg);
            failed++;
          }
        } catch (e: any) {
          await updateAttempts(item.id, item.attempts + 1, e?.message || 'network error');
          failed++;
        }
      }
    } finally {
      syncingRef.current = false;
      setIsSyncing(false);
      setLastSyncAt(Date.now());
      await refreshCount();
      // Ambil sebab kegagalan dari item yang paling sering gagal, supaya bisa
      // ditampilkan di TopBar.
      try {
        const sisa = await getQueue();
        const terparah = sisa
          .filter((it) => it.lastError)
          .sort((a, b) => (b.attempts ?? 0) - (a.attempts ?? 0))[0];
        // Kalau antrean sudah kosong, tidak ada sebab kegagalan yang berlaku.
        setLastError(sisa.length === 0 ? null : (terparah?.lastError ?? null));
        setStuckCount(sisa.filter((it) => (it.attempts ?? 0) >= 3).length);
      } catch { /* pembacaan diagnosa tidak boleh menggagalkan sync */ }
    }
    return { sent, failed, ditunda };
  }, [refreshCount]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setIsOnline(navigator.onLine);

    const handleOnline  = () => { setIsOnline(true); void syncQueue(); };
    const handleOffline = () => setIsOnline(false);

    // Sinkron saat tab kembali terlihat — PDT yang keluar-masuk sleep sering
    // TIDAK memicu event 'online' sama sekali.
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && navigator.onLine) void syncQueue();
    };

    const handleQueueChanged = () => { void refreshCount(); };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener(QUEUE_CHANGED_EVENT, handleQueueChanged);
    document.addEventListener('visibilitychange', handleVisibility);

    // PENTING: kuras antrean saat mount. Sebelumnya sync HANYA dipicu event
    // 'online', sehingga item yang mengantre di sesi sebelumnya bisa mengendap
    // selamanya kalau WiFi sudah pulih sebelum aplikasi dibuka lagi.
    void refreshCount().then((count) => {
      if (count > 0 && navigator.onLine) void syncQueue();
    });

    const interval = setInterval(() => {
      if (navigator.onLine) void syncQueue();
    }, SYNC_INTERVAL_MS);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener(QUEUE_CHANGED_EVENT, handleQueueChanged);
      document.removeEventListener('visibilitychange', handleVisibility);
      clearInterval(interval);
    };
  }, [syncQueue, refreshCount]);

  return { isOnline, queueCount, isSyncing, lastSyncAt, lastError, stuckCount, syncQueue, refreshCount };
}
