'use client';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/useToast';
import { Boxes, CheckCircle2, Loader2, RefreshCw, Search, AlertTriangle, X } from 'lucide-react';

interface BinCount {
  id: number; binCode: string; binType: string | null;
  status: 'BELUM' | 'PROSES' | 'SELESAI';
  countedBy: string | null; countedAt: string | null;
  entryCount: number; totalQty: number; notes: string | null;
}

const WARNA: Record<BinCount['status'], string> = {
  BELUM: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
  PROSES: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  SELESAI: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
};

function fmt(ts: string | null) {
  if (!ts) return '—';
  const d = new Date(ts);
  return isNaN(d.getTime()) ? '—' : d.toLocaleString('id-ID', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

export default function BinStatusPage() {
  const { user } = useAuth();
  const { showSuccess, showError } = useToast();

  const [sesi, setSesi] = useState<any>(null);
  const [items, setItems] = useState<BinCount[]>([]);
  const [takDikenal, setTakDikenal] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [cari, setCari] = useState('');

  const muat = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/bin-counts', { cache: 'no-store' });
      const j = await res.json();
      setSesi(j.session); setItems(j.items ?? []);
      setTakDikenal(j.binTakDikenal ?? []); setStats(j.stats);
    } catch (e: any) {
      showError('Gagal memuat status bin', e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { muat(); }, [muat]);

  const tandaiSelesai = async (b: BinCount) => {
    setBusyId(b.id);
    try {
      const res = await fetch('/api/bin-counts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: b.id, status: b.status === 'SELESAI' ? 'PROSES' : 'SELESAI' }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Gagal');
      showSuccess(b.status === 'SELESAI' ? `${b.binCode} dibuka lagi` : `${b.binCode} ditandai selesai`);
      muat();
    } catch (e: any) {
      showError('Gagal mengubah status', e.message);
    } finally {
      setBusyId(null);
    }
  };

  const tersaring = useMemo(() => {
    const q = cari.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) =>
      i.binCode.toLowerCase().includes(q) || (i.countedBy ?? '').toLowerCase().includes(q)
    );
  }, [items, cari]);

  return (
    <AppLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Status Hitung per Bin</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              Menunjukkan bin mana yang sudah dihitung, oleh siapa, dan kapan — supaya dua orang
              tidak menghitung bin yang sama.
            </p>
          </div>
          <Button onClick={muat} variant="outline" size="sm" loading={loading}>
            <RefreshCw size={14} /> Refresh
          </Button>
        </div>

        {!sesi ? (
          <div className="flex items-start gap-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4">
            <AlertTriangle size={18} className="text-amber-600 dark:text-amber-400 mt-0.5" />
            <div className="text-sm text-amber-800 dark:text-amber-300">
              Belum ada sesi opname yang dibuka.
            </div>
          </div>
        ) : (
          <>
            <div className="text-sm text-gray-600 dark:text-gray-400">
              Sesi <span className="font-mono font-semibold text-gray-900 dark:text-white">{sesi.code}</span> — {sesi.name}
            </div>

            {stats && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: 'Bin Aktif', value: stats.binAktif, warna: 'border-slate-400' },
                  { label: 'Sudah Disentuh', value: stats.sudahDisentuh, warna: 'border-blue-500' },
                  { label: 'Ditandai Selesai', value: stats.selesai, warna: 'border-green-500' },
                  { label: 'Belum Tersentuh', value: stats.belum, warna: 'border-amber-500' },
                ].map((s) => (
                  <div key={s.label} className={`bg-white dark:bg-gray-800 rounded-xl border-l-4 ${s.warna} border-y border-r border-gray-200 dark:border-gray-700 p-3`}>
                    <div className="text-xs text-gray-500 dark:text-gray-400">{s.label}</div>
                    <div className="text-2xl font-bold text-gray-900 dark:text-white mt-0.5">
                      {Number(s.value).toLocaleString('id-ID')}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {takDikenal.length > 0 && (
              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-amber-800 dark:text-amber-300">
                  <AlertTriangle size={15} />
                  {takDikenal.length} lokasi discan tapi belum terdaftar di master bin
                </div>
                <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">
                  Scan-nya tetap tersimpan. Daftarkan lokasinya di Master Data Bin, atau perbaiki kalau ini salah ketik.
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {takDikenal.slice(0, 30).map((t) => (
                    <span key={t.binCode} className="inline-flex items-center gap-1 bg-white dark:bg-gray-800 border border-amber-300 dark:border-amber-700 rounded px-2 py-0.5 text-xs font-mono">
                      {t.binCode}
                      <span className="text-amber-600 dark:text-amber-400">({t.jumlahScan})</span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="relative max-w-sm">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text" value={cari} onChange={(e) => setCari(e.target.value)}
                placeholder="Cari kode bin atau nama penghitung..."
                className="w-full pl-8 pr-8 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {cari && (
                <button onClick={() => setCari('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  <X size={13} />
                </button>
              )}
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
              {loading ? (
                <div className="flex items-center justify-center py-16 gap-3 text-gray-500">
                  <Loader2 size={20} className="animate-spin" /> Memuat...
                </div>
              ) : tersaring.length === 0 ? (
                <div className="text-center py-16 text-gray-400">
                  <Boxes size={32} className="mx-auto mb-3 opacity-30" />
                  <p className="text-sm">Belum ada bin yang dihitung di sesi ini.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700">
                      <tr>
                        {['Bin', 'Tipe', 'Status', 'Dihitung oleh', 'Waktu', 'Baris', 'Total Qty', ''].map((h) => (
                          <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                      {tersaring.map((b) => (
                        <tr key={b.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                          <td className="px-3 py-2.5 font-mono text-xs font-semibold text-gray-900 dark:text-white whitespace-nowrap">{b.binCode}</td>
                          <td className="px-3 py-2.5 text-xs text-gray-500 dark:text-gray-400">{b.binType ?? '—'}</td>
                          <td className="px-3 py-2.5">
                            <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${WARNA[b.status]}`}>{b.status}</span>
                          </td>
                          <td className="px-3 py-2.5 text-xs text-gray-700 dark:text-gray-300 whitespace-nowrap">{b.countedBy ?? '—'}</td>
                          <td className="px-3 py-2.5 text-xs text-gray-600 dark:text-gray-400 whitespace-nowrap">{fmt(b.countedAt)}</td>
                          <td className="px-3 py-2.5 text-right text-xs text-gray-700 dark:text-gray-300">{b.entryCount.toLocaleString('id-ID')}</td>
                          <td className="px-3 py-2.5 text-right text-xs font-semibold text-gray-900 dark:text-white">{b.totalQty.toLocaleString('id-ID')}</td>
                          <td className="px-3 py-2.5 text-right whitespace-nowrap">
                            <button
                              onClick={() => tandaiSelesai(b)}
                              disabled={busyId === b.id}
                              className="inline-flex items-center gap-1 text-xs text-green-600 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-900/20 px-2 py-1 rounded disabled:opacity-50"
                            >
                              <CheckCircle2 size={12} />
                              {b.status === 'SELESAI' ? 'Buka lagi' : 'Tandai selesai'}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}
