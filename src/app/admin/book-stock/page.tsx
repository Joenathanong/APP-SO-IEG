'use client';
import { useState, useEffect, useCallback } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/useToast';
import { Upload, FileSpreadsheet, Loader2, AlertTriangle, CheckCircle2, RefreshCw } from 'lucide-react';

interface BarisBuku { ocsCode: string; name: string; category: string | null; qtyBook: number }
interface Pratinjau { kode: string; qty: number }

export default function BookStockPage() {
  const { user } = useAuth();
  const { showSuccess, showError, showWarning } = useToast();
  const isAdmin = user?.role === 'administrator';

  const [sesi, setSesi] = useState<any>(null);
  const [items, setItems] = useState<BarisBuku[]>([]);
  const [loading, setLoading] = useState(false);
  const [pratinjau, setPratinjau] = useState<Pratinjau[] | null>(null);
  const [namaFile, setNamaFile] = useState('');
  const [replace, setReplace] = useState(true);
  const [importing, setImporting] = useState(false);
  const [hasil, setHasil] = useState<any>(null);

  const muat = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/book-stock', { cache: 'no-store' });
      const j = await res.json();
      setSesi(j.session); setItems(j.items ?? []);
    } catch (e: any) {
      showError('Gagal memuat saldo buku', e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { muat(); }, [muat]);

  /**
   * File diurai di BROWSER, bukan diunggah mentah. Server hanya menerima
   * pasangan {kode, qty} sehingga tidak perlu menangani unggahan berkas, dan
   * Anda bisa melihat isinya sebelum ada satu baris pun masuk database.
   */
  const pilihFile = async (file: File) => {
    setHasil(null);
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
      if (rows.length === 0) {
        showError('Tidak ada baris data', 'Periksa isi file.');
        return;
      }
      setPratinjau(rows);
      showSuccess('File terbaca', `${rows.length} baris siap di-import`);
    } catch (e: any) {
      showError('Gagal membaca file', e.message);
    }
  };

  const jalankanImport = async () => {
    if (!pratinjau) return;
    setImporting(true);
    try {
      const res = await fetch('/api/book-stock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: pratinjau, replace }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Import gagal');
      setHasil(j);
      if (j.tidakDikenal > 0) {
        showWarning('Import selesai dengan catatan', `${j.tidakDikenal} kode tidak ditemukan di master`);
      } else {
        showSuccess('Import selesai', `${j.tersimpan} baris tersimpan`);
      }
      setPratinjau(null);
      muat();
    } catch (e: any) {
      showError('Import gagal', e.message);
    } finally {
      setImporting(false);
    }
  };

  const total = items.reduce((s, i) => s + i.qtyBook, 0);

  return (
    <AppLayout>
      <div className="space-y-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Saldo Buku (Data OCS)</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Import kolom <strong>Qty On Hand</strong> dari export OCS. Saldo ini yang dibandingkan
            dengan hasil hitung fisik di halaman Monitor.
          </p>
        </div>

        {!sesi ? (
          <div className="flex items-start gap-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4">
            <AlertTriangle size={18} className="text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-amber-800 dark:text-amber-300">
              <strong>Belum ada sesi opname yang dibuka.</strong>
              <span className="block text-xs mt-0.5 text-amber-700 dark:text-amber-400">
                Saldo buku selalu terikat ke satu sesi. Buka sesi dulu di menu Sesi Opname.
              </span>
            </div>
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm">
                <span className="text-gray-500 dark:text-gray-400">Sesi aktif:</span>{' '}
                <span className="font-mono font-semibold text-gray-900 dark:text-white">{sesi.code}</span>{' '}
                <span className="text-gray-600 dark:text-gray-400">— {sesi.name}</span>
              </div>
              <div className="flex items-center gap-4 text-sm">
                <span className="text-gray-500 dark:text-gray-400">
                  Sudah ter-import: <strong className="text-gray-900 dark:text-white">{items.length.toLocaleString('id-ID')}</strong> material
                </span>
                <span className="text-gray-500 dark:text-gray-400">
                  Total qty: <strong className="text-gray-900 dark:text-white">{total.toLocaleString('id-ID')}</strong>
                </span>
                <Button onClick={muat} variant="outline" size="sm" loading={loading}><RefreshCw size={14} /></Button>
              </div>
            </div>
          </div>
        )}

        {isAdmin && sesi && (
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-4">
            <label className="flex items-center justify-center gap-3 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl py-8 cursor-pointer hover:border-blue-400 dark:hover:border-blue-500 transition-colors">
              <FileSpreadsheet size={22} className="text-gray-400" />
              <span className="text-sm text-gray-600 dark:text-gray-400">
                {namaFile || 'Pilih file .xlsx export dari OCS'}
              </span>
              <input
                type="file" accept=".xlsx,.xls,.csv" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) pilihFile(f); }}
              />
            </label>

            {pratinjau && (
              <div className="space-y-3">
                <div className="text-sm text-gray-700 dark:text-gray-300">
                  <strong>{pratinjau.length.toLocaleString('id-ID')}</strong> baris terbaca. Contoh 5 pertama:
                </div>
                <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 dark:bg-gray-700/50">
                      <tr><th className="px-3 py-2 text-left">Kode</th><th className="px-3 py-2 text-right">Qty</th></tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                      {pratinjau.slice(0, 5).map((r, i) => (
                        <tr key={i}>
                          <td className="px-3 py-1.5 font-mono">{r.kode}</td>
                          <td className="px-3 py-1.5 text-right">{r.qty.toLocaleString('id-ID')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                  <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} />
                  Ganti seluruh saldo buku sesi ini (hapus yang lama dulu)
                </label>
                <div className="flex gap-3">
                  <Button variant="outline" onClick={() => { setPratinjau(null); setNamaFile(''); }} className="flex-1">Batal</Button>
                  <Button onClick={jalankanImport} loading={importing} className="flex-1">
                    <Upload size={14} /> Import {pratinjau.length.toLocaleString('id-ID')} baris
                  </Button>
                </div>
              </div>
            )}

            {hasil && (
              <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 text-sm space-y-1">
                <div className="flex items-center gap-2 font-medium text-gray-900 dark:text-white">
                  <CheckCircle2 size={15} className="text-green-600" /> Hasil import
                </div>
                <div className="text-gray-600 dark:text-gray-400 text-xs">
                  Dibaca {hasil.dibaca} · Tersimpan <strong>{hasil.tersimpan}</strong> · Tidak dikenal {hasil.tidakDikenal}
                </div>
                {hasil.tidakDikenal > 0 && (
                  <div className="text-xs text-amber-700 dark:text-amber-400 mt-1">
                    Kode yang tidak ditemukan di master material (contoh):{' '}
                    <span className="font-mono">{(hasil.contohTidakDikenal ?? []).join(', ')}</span>
                    <span className="block mt-1">
                      Material ini tidak akan muncul di rekonsiliasi. Tambahkan ke master lalu import ulang.
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {!isAdmin && (
          <div className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
            <AlertTriangle size={13} /> Import saldo buku hanya tersedia untuk Administrator.
          </div>
        )}

        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16 gap-3 text-gray-500">
              <Loader2 size={20} className="animate-spin" /> Memuat...
            </div>
          ) : items.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <FileSpreadsheet size={32} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">Belum ada saldo buku untuk sesi ini.</p>
            </div>
          ) : (
            <div className="overflow-x-auto max-h-[28rem]">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700 sticky top-0">
                  <tr>
                    {['Kode OCS', 'Nama Produk', 'Kategori', 'Qty Buku'].map((h) => (
                      <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {items.map((i) => (
                    <tr key={i.ocsCode} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                      <td className="px-3 py-2 font-mono text-xs text-gray-900 dark:text-white whitespace-nowrap">{i.ocsCode}</td>
                      <td className="px-3 py-2 text-xs text-gray-700 dark:text-gray-300 max-w-md truncate" title={i.name}>{i.name}</td>
                      <td className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400">{i.category ?? '—'}</td>
                      <td className="px-3 py-2 text-right text-xs font-semibold text-gray-900 dark:text-white">{i.qtyBook.toLocaleString('id-ID')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
