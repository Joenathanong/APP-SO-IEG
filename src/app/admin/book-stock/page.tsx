'use client';
import { useState, useEffect, useCallback } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/useToast';
import {
  Upload, FileSpreadsheet, Loader2, AlertTriangle, CheckCircle2,
  RefreshCw, Download, Database, Trash2, Check,
} from 'lucide-react';

interface Snapshot {
  id: number; name: string; source: 'OCS' | 'UPLOAD'; fetchedAt: string;
  rowCount: number; matchedCount: number; unmatchedCount: number;
  totalQty: number; createdBy: string | null; notes: string | null;
}
interface SesiAktif {
  id: number; code: string; name: string; status: string; bookSnapshotId: number | null;
}
interface Pratinjau { kode: string; qty: number }

function waktu(iso: string) {
  try { return new Date(iso).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }
  catch { return iso; }
}

export default function BookStockPage() {
  const { user, loading: authLoading } = useAuth();
  const { showSuccess, showError, showWarning } = useToast();
  const isAdmin = user?.role === 'administrator';

  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [sesi, setSesi] = useState<SesiAktif | null>(null);
  const [loading, setLoading] = useState(false);
  const [menarik, setMenarik] = useState(false);
  const [mengganti, setMengganti] = useState<number | null>(null);
  const [merapikan, setMerapikan] = useState<number | null>(null);

  const [pratinjau, setPratinjau] = useState<Pratinjau[] | null>(null);
  const [namaFile, setNamaFile] = useState('');
  const [importing, setImporting] = useState(false);

  const muat = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/book-stock/snapshots', { cache: 'no-store' });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      setSnapshots(j.snapshots ?? []);
      setSesi(j.sesiAktif ?? null);
    } catch (e: any) {
      showError('Gagal memuat daftar snapshot', e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { muat(); }, [muat]);

  const tarikOcs = async () => {
    setMenarik(true);
    try {
      const res = await fetch('/api/book-stock/snapshots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sumber: 'ocs', nama: sesi?.name, sessionId: sesi?.id, createdBy: user?.name }),
      });
      const j = await res.json();
      if (!res.ok) {
        // Sebab kegagalan dibedakan supaya saran tindakannya benar — "jaringan
        // bermasalah" untuk semua kasus adalah pesan yang menyesatkan.
        const saran =
          j.sebab === 'konfigurasi' ? 'Isi OCS_USERNAME / OCS_PASSWORD di environment variable.'
          : j.sebab === 'kredensial' ? 'Akun OCS ditolak — periksa user, password, dan hak aksesnya.'
          : j.sebab === 'jaringan' ? 'OCS tidak menjawab. Coba lagi; kalau berulang, cek sistem OCS-nya.'
          : 'Coba lagi beberapa saat lagi.';
        throw new Error(`${j.error}\n${saran}`);
      }
      showSuccess('Snapshot tersimpan', `${j.snapshot.name} — ${j.snapshot.rowCount} baris`);
      if (j.snapshot.unmatchedCount > 0) {
        showWarning(
          `${j.snapshot.unmatchedCount} item belum ada di master`,
          'Angkanya tetap tersimpan. Tekan "Tambahkan ke master" pada baris snapshot untuk melengkapinya.'
        );
      }
      muat();
    } catch (e: any) {
      showError('Gagal menarik dari OCS', e.message);
    } finally {
      setMenarik(false);
    }
  };

  const pakaiSnapshot = async (id: number) => {
    if (!sesi) { showError('Belum ada sesi opname yang dibuka.'); return; }
    setMengganti(id);
    try {
      const res = await fetch(`/api/sessions/${sesi.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'set-snapshot', snapshotId: id }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Gagal mengganti pembanding');
      showSuccess('Pembanding diganti', 'Angka selisih dihitung ulang; hasil scan tidak tersentuh.');
      muat();
    } catch (e: any) {
      showError('Gagal mengganti pembanding', e.message);
    } finally {
      setMengganti(null);
    }
  };

  const tambahKeMaster = async (id: number) => {
    setMerapikan(id);
    try {
      const res = await fetch(`/api/book-stock/snapshots/${id}/tambah-material`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Gagal menambahkan');
      showSuccess('Master diperbarui', `${j.dibuat} material baru dibuat, ${j.disambungkan} baris tersambung.`);
      showWarning('Barcode belum terisi', 'Material baru belum punya barcode, jadi belum bisa discan. Lengkapi di menu Master Material.');
      muat();
    } catch (e: any) {
      showError('Gagal menambahkan ke master', e.message);
    } finally {
      setMerapikan(null);
    }
  };

  const hapus = async (s: Snapshot) => {
    if (!window.confirm(`Hapus snapshot "${s.name}" beserta ${s.rowCount} barisnya?`)) return;
    try {
      const res = await fetch(`/api/book-stock/snapshots/${s.id}`, { method: 'DELETE' });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Gagal menghapus');
      showSuccess('Snapshot dihapus');
      muat();
    } catch (e: any) {
      showError('Gagal menghapus', e.message);
    }
  };

  /**
   * File diurai di BROWSER, bukan diunggah mentah. Server hanya menerima
   * pasangan {kode, qty} sehingga tidak perlu menangani unggahan berkas, dan
   * Anda bisa melihat isinya sebelum ada satu baris pun masuk database.
   */
  const pilihFile = async (file: File) => {
    setNamaFile(file.name);
    try {
      const XLSX = await import('xlsx');
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const grid = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false }) as any[][];

      // Header bisa tidak di baris pertama — export OCS menaruh tanggal di atas
      // dan menyelipkan baris seksi "Area: ...". Cari barisnya, jangan asumsikan.
      const idxHeader = grid.findIndex((r) =>
        r.some((c) => /^sku$/i.test(String(c).trim())) ||
        r.some((c) => /material\s*ocs/i.test(String(c))) ||
        r.some((c) => /kode\s*ocs/i.test(String(c)))
      );
      if (idxHeader < 0) {
        showError('Format tidak dikenali', 'Tidak menemukan kolom SKU / Material OCS / Kode OCS.');
        return;
      }
      const headers = grid[idxHeader].map((c) => String(c).trim());
      const kolKode = headers.findIndex((h) => /^sku$|material\s*ocs|kode\s*ocs/i.test(h));
      const kolQty = headers.findIndex((h) => /qty\s*on\s*hand|jumlah\s*ocs|qty\s*buku/i.test(h));
      if (kolQty < 0) {
        showError('Kolom jumlah tidak ditemukan', 'Cari kolom "Qty On Hand" atau "Jumlah OCS".');
        return;
      }

      const rows: Pratinjau[] = [];
      for (const r of grid.slice(idxHeader + 1)) {
        const kode = String(r[kolKode] ?? '').trim();
        if (!kode || /^area\s*:/i.test(kode)) continue;   // lewati baris seksi
        const qty = parseFloat(String(r[kolQty] ?? '0').replace(/,/g, '.')) || 0;
        rows.push({ kode, qty });
      }
      if (rows.length === 0) { showError('Tidak ada baris data', 'Periksa isi file.'); return; }
      setPratinjau(rows);
      showSuccess('File terbaca', `${rows.length} baris siap disimpan sebagai snapshot`);
    } catch (e: any) {
      showError('Gagal membaca file', e.message);
    }
  };

  const simpanUpload = async () => {
    if (!pratinjau) return;
    setImporting(true);
    try {
      const res = await fetch('/api/book-stock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: pratinjau, nama: `upload-${namaFile.replace(/\.[^.]+$/, '')}`, createdBy: user?.name }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Gagal menyimpan');
      showSuccess('Snapshot tersimpan', `${j.snapshot.name} — ${j.tersimpan} baris`);
      if (j.tidakDikenal > 0) showWarning(`${j.tidakDikenal} kode belum ada di master`, 'Tetap tersimpan; bisa dilengkapi lewat tombol di baris snapshot.');
      setPratinjau(null); setNamaFile('');
      muat();
    } catch (e: any) {
      showError('Gagal menyimpan', e.message);
    } finally {
      setImporting(false);
    }
  };

  // Penjaga akses menunggu auth selesai dulu. Menampilkan "Akses ditolak"
  // selagi `user` masih null adalah kebohongan sesaat yang bikin panik.
  if (authLoading) {
    return <AppLayout><div className="p-12 flex justify-center"><Loader2 className="animate-spin text-gray-400" /></div></AppLayout>;
  }
  if (!isAdmin) {
    return (
      <AppLayout>
        <div className="max-w-lg mx-auto mt-12 p-6 bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700 rounded-xl">
          <p className="font-semibold text-amber-800 dark:text-amber-300">Halaman ini khusus administrator</p>
          <p className="text-sm text-amber-700 dark:text-amber-400 mt-1">
            Akun Anda ({user?.email ?? 'belum masuk'}) berperan <strong>{user?.role ?? '—'}</strong>.
            Minta admin mengubah peran bila Anda memang perlu mengelola saldo buku.
          </p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-5 max-w-5xl mx-auto">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Database size={24} className="text-blue-600" />
              Saldo Buku (Snapshot)
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              Potret stok OCS yang dipakai sebagai pembanding hasil opname.
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={muat} variant="ghost" size="sm" disabled={loading}>
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Muat ulang
            </Button>
            <Button onClick={tarikOcs} loading={menarik} className="bg-blue-600 hover:bg-blue-700">
              <Download size={15} /> Tarik dari OCS sekarang
            </Button>
          </div>
        </div>

        {/* Sesi aktif & pembanding yang sedang dipakai */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
          {!sesi ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Belum ada sesi opname yang terbuka. Snapshot tetap bisa ditarik dan disimpan sekarang,
              lalu dipilih setelah sesi dibuka.
            </p>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Sesi terbuka</p>
                <p className="font-semibold text-gray-900 dark:text-white">{sesi.code} — {sesi.name}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-500 dark:text-gray-400">Pembanding dipakai</p>
                <p className="font-semibold text-gray-900 dark:text-white">
                  {snapshots.find((s) => s.id === sesi.bookSnapshotId)?.name ?? <span className="text-amber-600">belum dipilih</span>}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Daftar snapshot */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">
              Snapshot tersimpan ({snapshots.length})
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Semuanya tetap tersimpan walau tidak dipakai. Pembanding boleh diganti kapan saja, termasuk saat SO berjalan —
              yang berubah hanya penunjuknya, hasil scan tidak tersentuh.
            </p>
          </div>

          {loading ? (
            <div className="p-10 flex justify-center"><Loader2 className="animate-spin text-gray-400" /></div>
          ) : snapshots.length === 0 ? (
            <div className="p-10 text-center text-sm text-gray-400">
              Belum ada snapshot. Tekan &quot;Tarik dari OCS sekarang&quot; untuk membuat yang pertama.
            </div>
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-gray-700">
              {snapshots.map((s) => {
                const dipakai = sesi?.bookSnapshotId === s.id;
                return (
                  <li key={s.id} className={`p-4 ${dipakai ? 'bg-blue-50/60 dark:bg-blue-900/10' : ''}`}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-gray-900 dark:text-white break-all">{s.name}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                            s.source === 'OCS'
                              ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
                              : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
                          }`}>{s.source === 'OCS' ? 'dari OCS' : 'dari file'}</span>
                          {dipakai && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300 flex items-center gap-1">
                              <Check size={10} /> sedang dipakai
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          {waktu(s.fetchedAt)} · {s.rowCount} baris · total {s.totalQty.toLocaleString('id-ID')} pcs
                          {s.createdBy ? ` · oleh ${s.createdBy}` : ''}
                        </p>
                        {s.unmatchedCount > 0 && (
                          <div className="mt-2 flex items-start gap-2 text-xs text-amber-700 dark:text-amber-400">
                            <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" />
                            <span>
                              <strong>{s.unmatchedCount}</strong> item punya stok di OCS tapi belum ada di master material.
                              Angkanya tetap tersimpan — kalau tidak ditambahkan, hasil hitung barang itu akan tampak sebagai selisih penuh.
                            </span>
                          </div>
                        )}
                      </div>

                      <div className="flex flex-col gap-1.5 items-end flex-shrink-0">
                        <Button
                          size="sm"
                          variant={dipakai ? 'ghost' : 'outline'}
                          disabled={dipakai || !sesi}
                          loading={mengganti === s.id}
                          onClick={() => pakaiSnapshot(s.id)}
                        >
                          {dipakai ? 'Terpakai' : 'Pakai untuk sesi ini'}
                        </Button>
                        {s.unmatchedCount > 0 && (
                          <Button size="sm" variant="outline" loading={merapikan === s.id} onClick={() => tambahKeMaster(s.id)}>
                            Tambahkan {s.unmatchedCount} ke master
                          </Button>
                        )}
                        <button
                          onClick={() => hapus(s)}
                          disabled={dipakai}
                          className="text-xs text-gray-400 hover:text-red-500 disabled:opacity-40 disabled:hover:text-gray-400 flex items-center gap-1 px-2 py-1"
                        >
                          <Trash2 size={12} /> Hapus
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Jalur cadangan: unggah file */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <FileSpreadsheet size={16} className="text-gray-500" /> Unggah file (cadangan)
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Dipakai kalau OCS sedang tidak bisa dihubungi. Hasilnya jadi snapshot bernama, sama seperti tarikan OCS.
            </p>
          </div>

          <label className="flex items-center gap-2 text-sm cursor-pointer text-blue-600 hover:text-blue-700">
            <Upload size={15} />
            <span>{namaFile || 'Pilih file .xlsx'}</span>
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) pilihFile(f); }}
            />
          </label>

          {pratinjau && (
            <div className="p-3 bg-gray-50 dark:bg-gray-700/40 rounded-lg space-y-2">
              <p className="text-sm text-gray-700 dark:text-gray-300 flex items-center gap-2">
                <CheckCircle2 size={15} className="text-green-600" />
                {pratinjau.length} baris terbaca dari {namaFile}
              </p>
              <div className="flex gap-2">
                <Button size="sm" onClick={simpanUpload} loading={importing}>Simpan sebagai snapshot</Button>
                <Button size="sm" variant="ghost" onClick={() => { setPratinjau(null); setNamaFile(''); }}>Batal</Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
