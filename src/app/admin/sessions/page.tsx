'use client';
import { useState, useEffect, useCallback } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/useToast';
import { CalendarClock, Play, Square, Plus, Loader2, AlertTriangle, RefreshCw, Trash2, RotateCcw, ShieldAlert } from 'lucide-react';

interface Sesi {
  id: number;
  code: string;
  name: string;
  status: 'DRAFT' | 'OPEN' | 'CLOSED';
  startedAt: string | null;
  endedAt: string | null;
  createdBy: string;
  notes: string | null;
  jumlahScan: number;
  jumlahSaldoBuku: number;
}

const WARNA: Record<Sesi['status'], string> = {
  DRAFT: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
  OPEN: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  CLOSED: 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
};

function fmt(ts: string | null) {
  if (!ts) return '—';
  const d = new Date(ts);
  return isNaN(d.getTime()) ? '—' : d.toLocaleString('id-ID', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export default function SessionsPage() {
  const { user } = useAuth();
  const { showSuccess, showError, showWarning } = useToast();

  const [sessions, setSessions] = useState<Sesi[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [nama, setNama] = useState('');
  const [catatan, setCatatan] = useState('');
  const [creating, setCreating] = useState(false);
  const [konfirmasiTutup, setKonfirmasiTutup] = useState<Sesi | null>(null);
  // Penghapusan bertahap: 1) yakin? 2) lihat dampaknya 3) ketik kode sesi.
  const [hapus, setHapus] = useState<Sesi | null>(null);
  const [tahap, setTahap] = useState<1 | 2 | 3>(1);
  const [ketikan, setKetikan] = useState('');
  const [menghapus, setMenghapus] = useState(false);

  const isAdmin = user?.role === 'administrator';

  const muat = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/sessions', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSessions(await res.json());
    } catch (e: any) {
      showError('Gagal memuat daftar sesi', e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { muat(); }, [muat]);

  const aktif = sessions.find((s) => s.status === 'OPEN');

  const buat = async () => {
    if (!user) return;
    setCreating(true);
    try {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: nama.trim(), createdBy: user.name, notes: catatan.trim() || null }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Gagal membuat sesi');
      showSuccess('Sesi dibuat', j.code);
      setShowNew(false); setNama(''); setCatatan('');
      muat();
    } catch (e: any) {
      showError('Gagal membuat sesi', e.message);
    } finally {
      setCreating(false);
    }
  };

  const ubah = async (s: Sesi, action: 'open' | 'close' | 'reopen') => {
    setBusyId(s.id);
    try {
      const res = await fetch(`/api/sessions/${s.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Gagal mengubah status');
      showSuccess(action === 'close' ? `Sesi ${s.code} ditutup` : `Sesi ${s.code} dibuka`);
      setKonfirmasiTutup(null);
      muat();
    } catch (e: any) {
      showWarning('Tidak bisa mengubah status', e.message);
    } finally {
      setBusyId(null);
    }
  };

  const mulaiHapus = (s: Sesi) => { setHapus(s); setTahap(1); setKetikan(''); };
  const batalHapus = () => { setHapus(null); setTahap(1); setKetikan(''); };

  const jalankanHapus = async () => {
    if (!hapus || !user) return;
    setMenghapus(true);
    try {
      const res = await fetch(`/api/sessions/${hapus.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmCode: ketikan.trim(), requestedBy: user.name }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Gagal menghapus');
      showSuccess(
        `Sesi ${j.code} dihapus`,
        `${j.terhapus.scan} scan, ${j.terhapus.saldoBuku} saldo buku, ${j.terhapus.statusBin} status bin ikut terhapus.`
      );
      batalHapus();
      muat();
    } catch (e: any) {
      showError('Gagal menghapus', e.message);
    } finally {
      setMenghapus(false);
    }
  };

  return (
    <AppLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Sesi Opname</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              Scan hanya bisa masuk ke sesi yang berstatus OPEN. Hanya boleh ada satu.
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={muat} variant="outline" size="sm" loading={loading}>
              <RefreshCw size={14} /> Refresh
            </Button>
            {isAdmin && (
              <Button onClick={() => setShowNew(true)} size="sm">
                <Plus size={14} /> Sesi Baru
              </Button>
            )}
          </div>
        </div>

        {/* Status sesi aktif — informasi paling penting di halaman ini */}
        <div className={`rounded-xl border p-4 ${
          aktif
            ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
            : 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800'
        }`}>
          {aktif ? (
            <div className="flex items-center gap-3">
              <CalendarClock size={18} className="text-green-600 dark:text-green-400 flex-shrink-0" />
              <div className="text-sm">
                <span className="font-semibold text-green-800 dark:text-green-300">
                  Sesi aktif: {aktif.code} — {aktif.name}
                </span>
                <span className="block text-green-700 dark:text-green-400 text-xs mt-0.5">
                  Dibuka {fmt(aktif.startedAt)} · {aktif.jumlahScan.toLocaleString('id-ID')} scan tersimpan
                </span>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <AlertTriangle size={18} className="text-amber-600 dark:text-amber-400 flex-shrink-0" />
              <div className="text-sm">
                <span className="font-semibold text-amber-800 dark:text-amber-300">
                  Belum ada sesi yang dibuka
                </span>
                <span className="block text-amber-700 dark:text-amber-400 text-xs mt-0.5">
                  Selama tidak ada sesi OPEN, setiap scan akan ditolak dan masuk antrean di perangkat operator.
                </span>
              </div>
            </div>
          )}
        </div>

        {!isAdmin && (
          <div className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
            <AlertTriangle size={13} />
            Membuka dan menutup sesi hanya tersedia untuk Administrator.
          </div>
        )}

        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16 gap-3 text-gray-500">
              <Loader2 size={20} className="animate-spin" /> Memuat...
            </div>
          ) : sessions.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <CalendarClock size={32} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">Belum ada sesi. Buat sesi pertama untuk mulai opname.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700">
                  <tr>
                    {['Kode', 'Nama', 'Status', 'Dibuka', 'Ditutup', 'Scan', 'Saldo Buku', 'Dibuat oleh', ''].map((h) => (
                      <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {sessions.map((s) => (
                    <tr key={s.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                      <td className="px-3 py-2.5 font-mono text-xs font-semibold text-gray-900 dark:text-white whitespace-nowrap">{s.code}</td>
                      <td className="px-3 py-2.5 text-xs text-gray-700 dark:text-gray-300 max-w-xs truncate" title={s.name}>{s.name}</td>
                      <td className="px-3 py-2.5">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${WARNA[s.status]}`}>{s.status}</span>
                      </td>
                      <td className="px-3 py-2.5 text-xs text-gray-600 dark:text-gray-400 whitespace-nowrap">{fmt(s.startedAt)}</td>
                      <td className="px-3 py-2.5 text-xs text-gray-600 dark:text-gray-400 whitespace-nowrap">{fmt(s.endedAt)}</td>
                      <td className="px-3 py-2.5 text-right text-xs font-semibold text-gray-900 dark:text-white">{s.jumlahScan.toLocaleString('id-ID')}</td>
                      <td className="px-3 py-2.5 text-right text-xs text-gray-600 dark:text-gray-400">{s.jumlahSaldoBuku.toLocaleString('id-ID')}</td>
                      <td className="px-3 py-2.5 text-xs text-gray-600 dark:text-gray-400 whitespace-nowrap">{s.createdBy}</td>
                      <td className="px-3 py-2.5 text-right whitespace-nowrap">
                        {isAdmin && s.status === 'CLOSED' && (
                          <button
                            onClick={() => ubah(s, 'reopen')}
                            disabled={busyId === s.id || Boolean(aktif)}
                            title={aktif ? `Tutup dulu sesi ${aktif.code}` : 'Buka kembali sesi ini'}
                            className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-900/20 px-2 py-1 rounded disabled:opacity-40"
                          >
                            <RotateCcw size={12} /> Buka Kembali
                          </button>
                        )}
                        {isAdmin && s.status !== 'CLOSED' && (
                          s.status === 'OPEN' ? (
                            <button
                              onClick={() => setKonfirmasiTutup(s)}
                              disabled={busyId === s.id}
                              className="inline-flex items-center gap-1 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 px-2 py-1 rounded disabled:opacity-50"
                            >
                              <Square size={12} /> Tutup
                            </button>
                          ) : (
                            <button
                              onClick={() => ubah(s, 'open')}
                              disabled={busyId === s.id || Boolean(aktif)}
                              title={aktif ? `Tutup dulu sesi ${aktif.code}` : 'Buka sesi ini'}
                              className="inline-flex items-center gap-1 text-xs text-green-600 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-900/20 px-2 py-1 rounded disabled:opacity-40"
                            >
                              <Play size={12} /> Buka
                            </button>
                          )
                        )}
                        {isAdmin && (
                          <button
                            onClick={() => mulaiHapus(s)}
                            className="inline-flex items-center gap-1 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 px-2 py-1 rounded ml-1"
                          >
                            <Trash2 size={12} /> Hapus
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <Modal isOpen={showNew} title="Sesi Opname Baru" onClose={() => setShowNew(false)}>
        <div className="space-y-4">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Nomor sesi dibuat otomatis (SO-tahun-bulan-urut). Sesi baru berstatus DRAFT —
            buka secara terpisah setelah saldo buku di-import.
          </p>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nama Sesi</label>
            <input
              type="text" value={nama} onChange={(e) => setNama(e.target.value)}
              placeholder="Opname Agustus 2026"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Catatan</label>
            <textarea
              value={catatan} onChange={(e) => setCatatan(e.target.value)} rows={2}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setShowNew(false)} className="flex-1">Batal</Button>
            <Button onClick={buat} loading={creating} className="flex-1">Buat</Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={Boolean(konfirmasiTutup)} title="Tutup Sesi?" onClose={() => setKonfirmasiTutup(null)}>
        {konfirmasiTutup && (
          <div className="space-y-4">
            <p className="text-sm text-gray-700 dark:text-gray-300">
              Menutup <strong>{konfirmasiTutup.code}</strong> menghentikan seluruh scan yang masuk ke sesi ini,
              dan datanya tidak bisa diubah lagi.
            </p>
            <p className="text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
              Pastikan tidak ada operator yang masih punya antrean belum terkirim. Antrean yang tersinkron
              setelah sesi ditutup akan ditolak.
            </p>
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setKonfirmasiTutup(null)} className="flex-1">Batal</Button>
              <Button onClick={() => ubah(konfirmasiTutup, 'close')} loading={busyId === konfirmasiTutup.id} className="flex-1">
                Tutup Sesi
              </Button>
            </div>
          </div>
        )}
      </Modal>
      <Modal
        isOpen={Boolean(hapus)}
        title={tahap === 1 ? 'Hapus sesi?' : tahap === 2 ? 'Lihat dampaknya' : 'Konfirmasi terakhir'}
        onClose={batalHapus}
      >
        {hapus && (
          <div className="space-y-4">
            {tahap === 1 && (
              <>
                <p className="text-sm text-gray-700 dark:text-gray-300">
                  Anda akan menghapus sesi <strong className="font-mono">{hapus.code}</strong> — {hapus.name}.
                </p>
                <p className="text-sm text-red-700 dark:text-red-400">
                  Penghapusan ini <strong>permanen</strong> dan tidak bisa dibatalkan.
                </p>
                <div className="flex gap-3">
                  <Button variant="outline" onClick={batalHapus} className="flex-1">Batal</Button>
                  <Button onClick={() => setTahap(2)} className="flex-1">Yakin, lanjut</Button>
                </div>
              </>
            )}

            {tahap === 2 && (
              <>
                <div className="flex items-start gap-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
                  <ShieldAlert size={18} className="text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
                  <div className="text-sm text-red-800 dark:text-red-300">
                    Data berikut ikut terhapus dan <strong>tidak bisa dikembalikan</strong>:
                  </div>
                </div>
                <ul className="text-sm text-gray-700 dark:text-gray-300 space-y-1 pl-1">
                  <li>• <strong>{hapus.jumlahScan.toLocaleString('id-ID')}</strong> baris hasil scan</li>
                  <li>• <strong>{hapus.jumlahSaldoBuku.toLocaleString('id-ID')}</strong> baris saldo buku</li>
                  <li>• seluruh status hitung per bin di sesi ini</li>
                </ul>
                <p className="text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
                  Kalau datanya masih mungkin dibutuhkan, ekspor dulu dari halaman Data Hasil SO
                  sebelum melanjutkan.
                </p>
                <div className="flex gap-3">
                  <Button variant="outline" onClick={batalHapus} className="flex-1">Batal</Button>
                  <Button onClick={() => setTahap(3)} className="flex-1">Saya mengerti, lanjut</Button>
                </div>
              </>
            )}

            {tahap === 3 && (
              <>
                <p className="text-sm text-gray-700 dark:text-gray-300">
                  Ketik kode sesi berikut untuk mengonfirmasi:
                </p>
                <div className="font-mono text-lg font-bold text-center bg-gray-100 dark:bg-gray-700 rounded-lg py-2 select-all">
                  {hapus.code}
                </div>
                <input
                  type="text"
                  value={ketikan}
                  onChange={(e) => setKetikan(e.target.value)}
                  placeholder="Ketik kode di atas"
                  autoComplete="off"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-red-500"
                />
                <div className="flex gap-3">
                  <Button variant="outline" onClick={batalHapus} className="flex-1">Batal</Button>
                  <Button
                    onClick={jalankanHapus}
                    loading={menghapus}
                    disabled={ketikan.trim() !== hapus.code}
                    className="flex-1"
                  >
                    <Trash2 size={14} /> Hapus Permanen
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </Modal>
    </AppLayout>
  );
}
