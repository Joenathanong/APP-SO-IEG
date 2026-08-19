'use client';
import { useState, useEffect, useCallback } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/useToast';
import {
  Search, Plus, Pencil, Upload, FileDown, Loader2, X,
  ChevronLeft, ChevronRight, AlertTriangle, FileSpreadsheet,
} from 'lucide-react';

interface Material {
  id: number; ocsCode: string; name: string; category: string | null;
  sapCodeIeg: string | null; sapCodeEji: string | null;
  barcodeProduct: string | null; barcodeBpom: string | null;
  active: boolean; source: string | null; reviewNote: string | null;
}

const KOSONG: Partial<Material> = {
  ocsCode: '', name: '', category: '', sapCodeIeg: '', sapCodeEji: '',
  barcodeProduct: '', barcodeBpom: '', active: true,
};

export default function MaterialsPage() {
  const { user } = useAuth();
  const { showSuccess, showError, showWarning } = useToast();
  const isAdmin = user?.role === 'administrator';

  const [items, setItems] = useState<Material[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [q, setQ] = useState('');
  const [filterAktif, setFilterAktif] = useState<'all' | 'true' | 'false'>('all');
  const [loading, setLoading] = useState(false);

  const [edit, setEdit] = useState<Partial<Material> | null>(null);
  const [saving, setSaving] = useState(false);
  const [impor, setImpor] = useState<any[] | null>(null);
  const [namaFile, setNamaFile] = useState('');
  const [nonaktifkanSisanya, setNonaktifkanSisanya] = useState(false);
  const [importing, setImporting] = useState(false);
  const [hasilImpor, setHasilImpor] = useState<any>(null);

  const muat = useCallback(async (p = page, cari = q, aktif = filterAktif) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p), pageSize: String(pageSize) });
      if (cari.trim()) params.set('q', cari.trim());
      if (aktif !== 'all') params.set('active', aktif);
      const res = await fetch(`/api/materials?${params}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = await res.json();
      setItems(j.items); setTotal(j.total); setPage(j.page);
    } catch (e: any) {
      showError('Gagal memuat material', e.message);
    } finally {
      setLoading(false);
    }
  }, [page, q, filterAktif, pageSize]);

  useEffect(() => { muat(1, '', 'all'); }, []);

  const simpan = async () => {
    if (!edit?.ocsCode?.trim()) { showError('Kode OCS wajib diisi'); return; }
    setSaving(true);
    try {
      const baru = !edit.id;
      const res = await fetch('/api/materials', {
        method: baru ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(edit),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Gagal menyimpan');
      showSuccess(baru ? 'Material ditambahkan' : 'Material diperbarui', j.ocsCode);
      setEdit(null);
      muat();
    } catch (e: any) {
      showError('Gagal menyimpan', e.message);
    } finally {
      setSaving(false);
    }
  };

  /** File diurai di browser lalu ditampilkan dulu — tidak ada baris yang masuk
   *  database sebelum Anda menekan tombol Import. */
  const pilihFile = async (file: File) => {
    setHasilImpor(null); setNamaFile(file.name);
    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const grid = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false }) as any[][];

      const cocokKolom = (h: string) => String(h).trim().toLowerCase();
      const idxHeader = grid.findIndex((r) =>
        r.some((c) => /kode\s*ocs|material\s*ocs|^sku$/i.test(String(c).trim()))
      );
      if (idxHeader < 0) {
        showError('Format tidak dikenali', 'Tidak menemukan kolom Kode OCS / Material OCS / SKU.');
        return;
      }
      const H = grid[idxHeader].map(cocokKolom);
      const cari = (...pola: RegExp[]) => H.findIndex((h) => pola.some((p) => p.test(h)));

      const kOcs = cari(/kode\s*ocs/, /material\s*ocs/, /^sku$/);
      const kNama = cari(/nama\s*produk/, /sku\s*name/, /nama\s*barang/, /^nama$/, /deskripsi/);
      const kKat = cari(/kategori/, /^category$/);
      const kIeg = cari(/sap\s*ieg/, /material\s*sap\s*ieg/);
      const kEji = cari(/sap\s*eji/, /material\s*sap\s*eji/);
      const kSap = kIeg < 0 && kEji < 0 ? cari(/kode\s*sap/, /^sap\s*code$/, /material\s*id/) : -1;
      const kBar = cari(/barcode\s*produk/, /^barcode$/);
      const kBpom = cari(/barcode\s*b-?pom/, /barcode\s*pom/);
      const kAktif = cari(/^aktif$/, /^active$/, /^status$/);

      const rows = grid.slice(idxHeader + 1)
        .map((r) => ({
          ocsCode: String(r[kOcs] ?? '').trim(),
          name: kNama >= 0 ? String(r[kNama] ?? '').trim() : '',
          category: kKat >= 0 ? String(r[kKat] ?? '').trim() : '',
          sapCodeIeg: kIeg >= 0 ? String(r[kIeg] ?? '').trim() : '',
          sapCodeEji: kEji >= 0 ? String(r[kEji] ?? '').trim() : '',
          sapCode: kSap >= 0 ? String(r[kSap] ?? '').trim() : '',
          barcodeProduct: kBar >= 0 ? String(r[kBar] ?? '').trim() : '',
          barcodeBpom: kBpom >= 0 ? String(r[kBpom] ?? '').trim() : '',
          active: kAktif >= 0 ? String(r[kAktif] ?? '').trim() : undefined,
        }))
        .filter((r) => r.ocsCode && !/^area\s*:/i.test(r.ocsCode));

      if (rows.length === 0) { showError('Tidak ada baris data'); return; }
      setImpor(rows);
      showSuccess('File terbaca', `${rows.length} baris siap di-import`);
    } catch (e: any) {
      showError('Gagal membaca file', e.message);
    }
  };

  const jalankanImpor = async () => {
    if (!impor) return;
    setImporting(true);
    try {
      const res = await fetch('/api/materials/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: impor, nonaktifkanSisanya }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Import gagal');
      setHasilImpor(j);
      showSuccess('Import selesai', `${j.dibuat} baru, ${j.diperbarui} diperbarui`);
      setImpor(null); setNamaFile(''); setNonaktifkanSisanya(false);
      muat();
    } catch (e: any) {
      showError('Import gagal', e.message);
    } finally {
      setImporting(false);
    }
  };

  const ekspor = async () => {
    try {
      const params = new URLSearchParams({ all: 'true' });
      if (q.trim()) params.set('q', q.trim());
      if (filterAktif !== 'all') params.set('active', filterAktif);
      const res = await fetch(`/api/materials?${params}`, { cache: 'no-store' });
      const j = await res.json();
      const rows: Material[] = j.items ?? [];
      if (rows.length === 0) { showWarning('Tidak ada data untuk diekspor'); return; }

      const XLSX = await import('xlsx');
      // Judul kolom sengaja sama dengan yang diterima fitur Import, sehingga
      // hasil export bisa disunting di Excel lalu langsung di-import kembali.
      const header = ['Kode OCS', 'Nama Produk', 'Kategori', 'SAP IEG', 'SAP EJI',
        'Barcode Produk', 'Barcode BPOM', 'Aktif', 'Sumber', 'Catatan'];
      const data = [header, ...rows.map((m) => [
        m.ocsCode, m.name, m.category ?? '', m.sapCodeIeg ?? '', m.sapCodeEji ?? '',
        m.barcodeProduct ?? '', m.barcodeBpom ?? '', m.active ? 'Ya' : 'Tidak',
        m.source ?? '', m.reviewNote ?? '',
      ])];
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet(data);
      ws['!cols'] = header.map((h, i) => ({
        wch: Math.max(h.length, ...data.slice(1).map((r) => String(r[i] ?? '').length)) + 2,
      }));
      XLSX.utils.book_append_sheet(wb, ws, 'Material');
      XLSX.writeFile(wb, `Master_Material_${new Date().toISOString().slice(0, 10)}.xlsx`);
      showSuccess('Export selesai', `${rows.length} baris`);
    } catch (e: any) {
      showError('Gagal export', e.message);
    }
  };

  const totalHalaman = Math.max(1, Math.ceil(total / pageSize));
  const input = 'px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500';

  return (
    <AppLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Master Material</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              Sumber lookup saat scan. {total.toLocaleString('id-ID')} material terdaftar.
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button onClick={ekspor} variant="outline" size="sm"><FileDown size={14} /> Export</Button>
            {isAdmin && <Button onClick={() => setEdit({ ...KOSONG })} size="sm"><Plus size={14} /> Tambah</Button>}
          </div>
        </div>

        {/* Kalau upload tidak tersedia, KATAKAN SEBABNYA.
            Menyembunyikan elemen tanpa penjelasan membuat orang menyimpulkan
            fiturnya rusak — itu terjadi persis di sesi ini. */}
        {!user && (
          <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2">
            <Loader2 size={13} className="animate-spin" /> Memuat profil pengguna...
          </div>
        )}
        {user && !isAdmin && (
          <div className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
            <AlertTriangle size={13} className="mt-0.5 flex-shrink-0" />
            <span>
              Upload, tambah, dan edit material hanya untuk Administrator.
              Peran akun Anda saat ini: <strong>{user.role}</strong>. Export tetap bisa dipakai.
            </span>
          </div>
        )}
        {isAdmin && (
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-3">
            <label className="flex items-center justify-center gap-3 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl py-6 cursor-pointer hover:border-blue-400 transition-colors">
              <FileSpreadsheet size={20} className="text-gray-400" />
              <span className="text-sm text-gray-600 dark:text-gray-400">
                {namaFile || 'Upload .xlsx untuk menambah / memperbarui material'}
              </span>
              <input type="file" accept=".xlsx,.xls,.csv" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) pilihFile(f); }} />
            </label>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Kolom yang dikenali: Kode OCS · Nama Produk · Kategori · SAP IEG · SAP EJI · Barcode Produk ·
              Barcode BPOM · Aktif. Kalau file hanya punya satu kolom <em>Kode SAP</em>, isinya dipilah
              otomatis ke IEG atau EJI berdasarkan prefix. Hasil <strong>Export</strong> memakai judul
              kolom yang sama, jadi bisa disunting lalu di-import kembali.
            </p>

            {impor && (
              <div className="space-y-3 border-t border-gray-200 dark:border-gray-700 pt-3">
                <div className="text-sm text-gray-700 dark:text-gray-300">
                  <strong>{impor.length.toLocaleString('id-ID')}</strong> baris terbaca. Contoh 3 pertama:
                </div>
                <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 dark:bg-gray-700/50">
                      <tr>{['Kode OCS', 'Nama', 'SAP IEG', 'SAP EJI', 'Barcode'].map((h) => (
                        <th key={h} className="px-2 py-1.5 text-left">{h}</th>))}</tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                      {impor.slice(0, 3).map((r, i) => (
                        <tr key={i}>
                          <td className="px-2 py-1 font-mono">{r.ocsCode}</td>
                          <td className="px-2 py-1 max-w-xs truncate">{r.name}</td>
                          <td className="px-2 py-1 font-mono">{r.sapCodeIeg || r.sapCode}</td>
                          <td className="px-2 py-1 font-mono">{r.sapCodeEji}</td>
                          <td className="px-2 py-1 font-mono">{r.barcodeProduct}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <label className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
                  <input type="checkbox" checked={nonaktifkanSisanya} className="mt-0.5"
                    onChange={(e) => setNonaktifkanSisanya(e.target.checked)} />
                  <span>
                    Nonaktifkan material yang TIDAK ada di file ini
                    <span className="block text-xs text-amber-600 dark:text-amber-400">
                      Hati-hati: material yang dinonaktifkan tidak lagi diprioritaskan saat scan.
                    </span>
                  </span>
                </label>
                <div className="flex gap-3">
                  <Button variant="outline" onClick={() => { setImpor(null); setNamaFile(''); }} className="flex-1">Batal</Button>
                  <Button onClick={jalankanImpor} loading={importing} className="flex-1">
                    <Upload size={14} /> Import {impor.length.toLocaleString('id-ID')} baris
                  </Button>
                </div>
              </div>
            )}

            {hasilImpor && (
              <div className="text-xs text-gray-600 dark:text-gray-400 border-t border-gray-200 dark:border-gray-700 pt-3">
                Dibaca {hasilImpor.dibaca} · Baru <strong>{hasilImpor.dibuat}</strong> ·
                Diperbarui <strong>{hasilImpor.diperbarui}</strong> · Dilewati {hasilImpor.dilewati}
                {hasilImpor.dinonaktifkan > 0 && <> · Dinonaktifkan {hasilImpor.dinonaktifkan}</>}
              </div>
            )}
          </div>
        )}

        <div className="flex flex-wrap gap-3 items-end bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
          <div className="flex-1 min-w-56">
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Cari</label>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input type="text" value={q} onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') muat(1, q, filterAktif); }}
                placeholder="Kode OCS, nama, kode SAP, atau barcode..."
                className={`w-full pl-8 pr-8 ${input}`} />
              {q && (
                <button onClick={() => { setQ(''); muat(1, '', filterAktif); }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  <X size={13} />
                </button>
              )}
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Status</label>
            <select value={filterAktif} className={input}
              onChange={(e) => { const v = e.target.value as any; setFilterAktif(v); muat(1, q, v); }}>
              <option value="all">Semua</option>
              <option value="true">Aktif</option>
              <option value="false">Tidak Aktif</option>
            </select>
          </div>
          <Button onClick={() => muat(1, q, filterAktif)} size="sm" className="self-end">
            <Search size={14} /> Cari
          </Button>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16 gap-3 text-gray-500">
              <Loader2 size={20} className="animate-spin" /> Memuat...
            </div>
          ) : items.length === 0 ? (
            <div className="text-center py-16 text-gray-400 text-sm">
              Tidak ada material dengan filter ini.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700">
                  <tr>
                    {['Kode OCS', 'Nama Produk', 'Kategori', 'SAP IEG', 'SAP EJI', 'Barcode Produk', 'Barcode BPOM', 'Aktif', ''].map((h) => (
                      <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {items.map((m) => (
                    <tr key={m.id} className={`hover:bg-gray-50 dark:hover:bg-gray-700/30 ${!m.active ? 'opacity-60' : ''}`}>
                      <td className="px-3 py-2 font-mono text-xs font-semibold text-gray-900 dark:text-white whitespace-nowrap">{m.ocsCode}</td>
                      <td className="px-3 py-2 text-xs text-gray-700 dark:text-gray-300 max-w-sm truncate" title={m.name}>{m.name}</td>
                      <td className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">{m.category ?? '—'}</td>
                      <td className="px-3 py-2 font-mono text-xs text-gray-600 dark:text-gray-400 whitespace-nowrap">{m.sapCodeIeg ?? '—'}</td>
                      <td className="px-3 py-2 font-mono text-xs text-gray-600 dark:text-gray-400 whitespace-nowrap">{m.sapCodeEji ?? '—'}</td>
                      <td className="px-3 py-2 font-mono text-xs text-gray-600 dark:text-gray-400 whitespace-nowrap">{m.barcodeProduct ?? '—'}</td>
                      <td className="px-3 py-2 font-mono text-xs text-gray-500 dark:text-gray-400 max-w-[12rem] truncate" title={m.barcodeBpom ?? ''}>{m.barcodeBpom ?? '—'}</td>
                      <td className="px-3 py-2">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                          m.active ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                                   : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'}`}>
                          {m.active ? 'Aktif' : 'Tidak'}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        {isAdmin && (
                          <button onClick={() => setEdit({ ...m })}
                            className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-900/20 px-2 py-1 rounded">
                            <Pencil size={12} /> Edit
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

        {total > pageSize && (
          <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 px-1">
            <span>Halaman {page} dari {totalHalaman} · {total.toLocaleString('id-ID')} material</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => muat(page - 1)}>
                <ChevronLeft size={14} /> Sebelumnya
              </Button>
              <Button variant="outline" size="sm" disabled={page >= totalHalaman} onClick={() => muat(page + 1)}>
                Berikutnya <ChevronRight size={14} />
              </Button>
            </div>
          </div>
        )}
      </div>

      <Modal isOpen={Boolean(edit)} title={edit?.id ? 'Edit Material' : 'Material Baru'} onClose={() => setEdit(null)}>
        {edit && (
          <div className="space-y-3">
            {[
              ['Kode OCS *', 'ocsCode', 'ACNE-CLEANSER'],
              ['Nama Produk', 'name', 'Hanasui Acne Treatment...'],
              ['Kategori', 'category', 'REGULAR'],
              ['Kode SAP IEG', 'sapCodeIeg', '1201010408'],
              ['Kode SAP EJI', 'sapCodeEji', '1222010431'],
              ['Barcode Produk', 'barcodeProduct', '8998824552299'],
              ['Barcode BPOM', 'barcodeBpom', '(90)NA18211203479'],
            ].map(([label, key, ph]) => (
              <div key={key}>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">{label}</label>
                <input type="text" placeholder={ph}
                  value={(edit as any)[key] ?? ''}
                  onChange={(e) => setEdit({ ...edit, [key]: e.target.value })}
                  className={`w-full ${input}`} />
              </div>
            ))}
            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
              <input type="checkbox" checked={edit.active !== false}
                onChange={(e) => setEdit({ ...edit, active: e.target.checked })} />
              Aktif
            </label>
            {edit.reviewNote && (
              <div className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
                <AlertTriangle size={13} className="mt-0.5 flex-shrink-0" />
                <span>{edit.reviewNote}</span>
              </div>
            )}
            <div className="flex gap-3 pt-1">
              <Button variant="outline" onClick={() => setEdit(null)} className="flex-1">Batal</Button>
              <Button onClick={simpan} loading={saving} className="flex-1">Simpan</Button>
            </div>
          </div>
        )}
      </Modal>
    </AppLayout>
  );
}
