'use client';
import { useState, useEffect, useCallback } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/hooks/useToast';
import { useOfflineQueue } from '@/hooks/useOfflineQueue';
import { getQueue, removeFromQueue } from '@/lib/offline-queue';
import { OfflineQueueItem, StockEntryGB, StockEntryKT } from '@/types';
import {
  Inbox, Send, FileDown, Trash2, Loader2, AlertTriangle, RefreshCw, CheckCircle2,
} from 'lucide-react';

function waktu(ms?: number) {
  if (!ms) return '—';
  const d = new Date(ms);
  return isNaN(d.getTime()) ? '—' : d.toLocaleString('id-ID', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

function ringkas(it: OfflineQueueItem) {
  const d = it.data as any;
  const gb = it.type === 'gudang-besar';
  return {
    gudang: gb ? 'Gudang Besar' : (d.category ?? 'Gudang Kecil'),
    kode: gb ? (d.materialId ?? '') : (d.sapCode ?? ''),
    barcode: d.barcode ?? '',
    qty: gb ? (d.qtyPcsTotal ?? 0) : (d.qtyPcs ?? 0),
    lokasi: d.location ?? '',
    user: d.user ?? '',
    shift: d.shift ?? '',
    waktuScan: d.timestamp ?? '',
  };
}

/**
 * Halaman pengelolaan antrean.
 *
 * Antrean disimpan di IndexedDB PERANGKAT MASING-MASING, bukan di server —
 * jadi halaman ini harus dibuka di perangkat yang antreannya menumpuk, bukan
 * di komputer admin. Sebelum ada halaman ini, entry yang tidak bisa terkirim
 * praktis terkurung: tidak terlihat, tidak bisa diselamatkan, tidak bisa dibuang.
 */
export default function AntreanPage() {
  const { showSuccess, showError, showWarning } = useToast();
  const { isOnline, queueCount, isSyncing, lastError, syncQueue } = useOfflineQueue();

  const [items, setItems] = useState<OfflineQueueItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [hapus, setHapus] = useState<OfflineQueueItem | null>(null);

  const muat = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await getQueue());
    } catch (e: any) {
      showError('Gagal membaca antrean', e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { muat(); }, [muat, queueCount]);

  /** Tombol ini SELALU memaksa: tindakan manual tidak boleh tertahan jeda
   *  mundur yang dirancang untuk percobaan otomatis di latar belakang. */
  const kirim = async () => {
    const hasil = await syncQueue(true);
    if (hasil.sent > 0) showSuccess(`${hasil.sent} data terkirim`);
    if (hasil.failed > 0) showWarning(`${hasil.failed} masih gagal`, lastError ?? 'Lihat kolom Sebab Gagal.');
    if (hasil.sent === 0 && hasil.failed === 0) showSuccess('Antrean kosong');
    muat();
  };

  /** Penyelamatan manual: unduh isi antrean supaya datanya tidak terkunci di
   *  perangkat ini kalau ternyata tidak bisa dikirim sama sekali. */
  const ekspor = async () => {
    try {
      const antre = await getQueue();
      if (antre.length === 0) { showWarning('Antrean kosong'); return; }
      const XLSX = await import('xlsx');
      const header = ['Waktu Scan', 'Gudang', 'Kode/SAP', 'Barcode', 'Qty', 'Lokasi',
        'User', 'Shift', 'Percobaan', 'Terakhir Dicoba', 'Sebab Gagal', 'Client Entry ID'];
      const rows = antre.map((it) => {
        const r = ringkas(it);
        return [r.waktuScan, r.gudang, r.kode, r.barcode, r.qty, r.lokasi, r.user, r.shift,
          it.attempts, waktu(it.lastAttempt), it.lastError ?? '', (it.data as any).id ?? ''];
      });
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
      ws['!cols'] = header.map((h, i) => ({
        wch: Math.max(h.length, ...rows.map((r) => String(r[i] ?? '').length)) + 2,
      }));
      XLSX.utils.book_append_sheet(wb, ws, 'Antrean');
      XLSX.writeFile(wb, `Antrean_Pending_${new Date().toISOString().slice(0, 10)}.xlsx`);
      showSuccess('Antrean diekspor', `${antre.length} baris`);
    } catch (e: any) {
      showError('Gagal export', e.message);
    }
  };

  const konfirmasiHapus = async () => {
    if (!hapus?.id) return;
    try {
      await removeFromQueue(hapus.id);
      showSuccess('Item dihapus dari antrean');
      setHapus(null);
      muat();
    } catch (e: any) {
      showError('Gagal menghapus', e.message);
    }
  };

  const macet = items.filter((i) => (i.attempts ?? 0) >= 3);

  return (
    <AppLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Antrean Belum Terkirim</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              Tersimpan di perangkat ini saja. Buka halaman ini di PDT yang antreannya menumpuk.
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button onClick={muat} variant="outline" size="sm" loading={loading}><RefreshCw size={14} /></Button>
            <Button onClick={ekspor} variant="outline" size="sm"><FileDown size={14} /> Export</Button>
            <Button onClick={kirim} size="sm" loading={isSyncing} disabled={items.length === 0 || !isOnline}>
              <Send size={14} /> Kirim Sekarang
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Total Antrean', value: items.length, warna: 'border-blue-500' },
            { label: 'Macet (≥3 gagal)', value: macet.length, warna: macet.length ? 'border-red-500' : 'border-slate-400' },
            { label: 'Koneksi', value: isOnline ? 'Online' : 'Offline', warna: isOnline ? 'border-green-500' : 'border-red-500' },
            { label: 'Status', value: isSyncing ? 'Mengirim...' : 'Diam', warna: 'border-slate-400' },
          ].map((s) => (
            <div key={s.label} className={`bg-white dark:bg-gray-800 rounded-xl border-l-4 ${s.warna} border-y border-r border-gray-200 dark:border-gray-700 p-3`}>
              <div className="text-xs text-gray-500 dark:text-gray-400">{s.label}</div>
              <div className="text-2xl font-bold text-gray-900 dark:text-white mt-0.5">
                {typeof s.value === 'number' ? s.value.toLocaleString('id-ID') : s.value}
              </div>
            </div>
          ))}
        </div>

        {lastError && (
          <div className="flex items-start gap-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4">
            <AlertTriangle size={18} className="text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
            <div className="text-sm">
              <span className="font-semibold text-red-800 dark:text-red-300">Sebab kegagalan terakhir</span>
              <span className="block text-xs text-red-700 dark:text-red-400 mt-0.5 font-mono break-all">{lastError}</span>
            </div>
          </div>
        )}

        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16 gap-3 text-gray-500">
              <Loader2 size={20} className="animate-spin" /> Memuat...
            </div>
          ) : items.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <CheckCircle2 size={32} className="mx-auto mb-3 opacity-30 text-green-500" />
              <p className="text-sm">Antrean kosong — semua scan sudah tersimpan di server.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700">
                  <tr>
                    {['Waktu Scan', 'Gudang', 'Kode', 'Barcode', 'Qty', 'Lokasi', 'User', 'Gagal', 'Sebab', ''].map((h) => (
                      <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {items.map((it) => {
                    const r = ringkas(it);
                    const parah = (it.attempts ?? 0) >= 3;
                    return (
                      <tr key={it.id} className={parah ? 'bg-red-50/50 dark:bg-red-900/10' : 'hover:bg-gray-50 dark:hover:bg-gray-700/30'}>
                        <td className="px-3 py-2 text-xs text-gray-600 dark:text-gray-400 whitespace-nowrap">
                          {r.waktuScan ? new Date(r.waktuScan).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}
                        </td>
                        <td className="px-3 py-2 text-xs text-gray-700 dark:text-gray-300 whitespace-nowrap">{r.gudang}</td>
                        <td className="px-3 py-2 font-mono text-xs text-gray-900 dark:text-white whitespace-nowrap">{r.kode || '—'}</td>
                        <td className="px-3 py-2 font-mono text-xs text-gray-500 dark:text-gray-400 max-w-[10rem] truncate" title={r.barcode}>{r.barcode || '—'}</td>
                        <td className="px-3 py-2 text-right text-xs font-semibold text-gray-900 dark:text-white">{Number(r.qty).toLocaleString('id-ID')}</td>
                        <td className="px-3 py-2 font-mono text-xs text-gray-700 dark:text-gray-300 whitespace-nowrap">{r.lokasi || '—'}</td>
                        <td className="px-3 py-2 text-xs text-gray-600 dark:text-gray-400 whitespace-nowrap">{r.user}</td>
                        <td className="px-3 py-2 text-center text-xs">
                          <span className={`inline-block px-2 py-0.5 rounded-full font-medium ${
                            parah ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                                  : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'}`}>
                            {it.attempts ?? 0}×
                          </span>
                        </td>
                        <td className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400 max-w-[16rem] truncate"
                            title={it.lastError ? `${it.lastError}\n(tercatat ${waktu(it.lastAttempt)})` : ''}>
                          {it.lastError ?? '—'}
                        </td>
                        <td className="px-3 py-2 text-right whitespace-nowrap">
                          <button onClick={() => setHapus(it)}
                            className="inline-flex items-center gap-1 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 px-2 py-1 rounded">
                            <Trash2 size={12} /> Hapus
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {items.length > 0 && (
          <div className="flex items-start gap-2 text-xs text-gray-500 dark:text-gray-400 px-1">
            <Inbox size={13} className="mt-0.5 flex-shrink-0" />
            <span>
              Antrean dicoba ulang otomatis tiap 30 detik selama aplikasi terbuka. Item yang sudah
              gagal ≥5 kali dicoba lebih jarang, jadi <strong>kolom Sebab bisa memuat error lama</strong> —
              tekan <strong>Kirim Sekarang</strong> untuk memaksa mencoba lagi seketika dan melihat
              sebab yang terkini.
              <span className="block mt-1">
                Kalau ada yang benar-benar macet, <strong>Export</strong> dulu sebelum menghapus —
                file itu satu-satunya salinan data tersebut.
              </span>
            </span>
          </div>
        )}
      </div>

      <Modal isOpen={Boolean(hapus)} title="Hapus dari antrean?" onClose={() => setHapus(null)}>
        {hapus && (
          <div className="space-y-4">
            <p className="text-sm text-gray-700 dark:text-gray-300">
              Data ini <strong>belum tersimpan di server</strong>. Menghapusnya berarti hasil scan tersebut
              hilang permanen.
            </p>
            <div className="text-xs bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 space-y-0.5 font-mono">
              {(() => { const r = ringkas(hapus); return (
                <>
                  <div>Kode: {r.kode || '—'}</div>
                  <div>Barcode: {r.barcode || '—'}</div>
                  <div>Qty: {String(r.qty)} @ {r.lokasi}</div>
                  <div>User: {r.user}</div>
                </>
              ); })()}
            </div>
            <p className="text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
              Sebaiknya tekan <strong>Export</strong> dulu supaya datanya masih bisa dimasukkan manual.
            </p>
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setHapus(null)} className="flex-1">Batal</Button>
              <Button onClick={konfirmasiHapus} className="flex-1">Hapus Permanen</Button>
            </div>
          </div>
        )}
      </Modal>
    </AppLayout>
  );
}
