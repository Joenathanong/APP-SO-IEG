'use client';
import { useState, useEffect } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/useToast';
import { MasterBin } from '@/types';
import { Database, Plus, Edit2, RefreshCw, Search, Upload, FileDown, FileSpreadsheet, Loader2 } from 'lucide-react';

export default function MasterBinPage() {
  const { user } = useAuth();
  const { showSuccess, showError } = useToast();

  const [bins, setBins] = useState<MasterBin[]>([]);
  const [loading, setLoading] = useState(false);
  const [warehouseFilter, setWarehouseFilter] = useState('');
  const [search, setSearch] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editBin, setEditBin] = useState<MasterBin | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Form state
  const [formBinCode, setFormBinCode] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formWarehouse, setFormWarehouse] = useState('');
  const [formActive, setFormActive] = useState(true);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  // Upload & export massal. Sebelumnya bin hanya bisa ditambah satu per satu,
  // padahal master bin punya ratusan baris.
  const [imporBin, setImporBin] = useState<any[] | null>(null);
  const [namaFile, setNamaFile] = useState('');
  const [mengimpor, setMengimpor] = useState(false);
  const [hasilImpor, setHasilImpor] = useState<{ dibuat: number; dilewati: number; gagal: string[] } | null>(null);

  const warehouses = Array.from(new Set(bins.map((b) => b.warehouse).filter(Boolean)));

  const fetchBins = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/bins');
      if (res.ok) {
        const data = await res.json();
        setBins(Array.isArray(data) ? data : []);
      }
    } catch {
      showError('Gagal memuat data bin.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.role !== 'administrator') return;
    fetchBins();
    // Bergantung pada `user`: saat halaman pertama dibuka, profil bisa belum
    // termuat, dan tanpa dependensi ini daftar bin tidak pernah diambil.
  }, [user]);

  const filtered = bins.filter((b) => {
    const matchWarehouse = !warehouseFilter || b.warehouse === warehouseFilter;
    const matchSearch = !search ||
      b.binCode.toLowerCase().includes(search.toLowerCase()) ||
      b.description.toLowerCase().includes(search.toLowerCase());
    return matchWarehouse && matchSearch;
  });

  const resetForm = () => {
    setFormBinCode(''); setFormDescription(''); setFormWarehouse(''); setFormActive(true); setFormErrors({});
  };

  const validateForm = () => {
    const errors: Record<string, string> = {};
    if (!formBinCode.trim()) errors.binCode = 'Kode Bin wajib diisi.';
    if (!formWarehouse.trim()) errors.warehouse = 'Gudang wajib diisi.';
    return errors;
  };

  const handleAdd = async () => {
    const errors = validateForm();
    if (Object.keys(errors).length > 0) { setFormErrors(errors); return; }

    setIsSaving(true);
    try {
      const res = await fetch('/api/bins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ binCode: formBinCode, description: formDescription, warehouse: formWarehouse, active: formActive }),
      });
      if (res.ok) {
        showSuccess('Bin berhasil ditambahkan!');
        setShowAddModal(false);
        resetForm();
        fetchBins();
      } else {
        const data = await res.json();
        showError('Gagal menambahkan bin.', data.error);
      }
    } catch {
      showError('Gagal menambahkan bin.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleOpenEdit = (bin: MasterBin) => {
    setEditBin(bin);
    setFormBinCode(bin.binCode);
    setFormDescription(bin.description);
    setFormWarehouse(bin.warehouse);
    setFormActive(bin.active);
    setFormErrors({});
    setShowEditModal(true);
  };

  const handleEdit = async () => {
    if (!editBin || editBin.rowIndex === undefined) return;
    const errors = validateForm();
    if (Object.keys(errors).length > 0) { setFormErrors(errors); return; }

    setIsSaving(true);
    try {
      const res = await fetch('/api/bins', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rowIndex: editBin.rowIndex,
          binCode: formBinCode,
          description: formDescription,
          warehouse: formWarehouse,
          active: formActive,
        }),
      });
      if (res.ok) {
        showSuccess('Bin berhasil diupdate!');
        setShowEditModal(false);
        setEditBin(null);
        resetForm();
        fetchBins();
      } else {
        const data = await res.json();
        showError('Gagal mengupdate bin.', data.error);
      }
    } catch {
      showError('Gagal mengupdate bin.');
    } finally {
      setIsSaving(false);
    }
  };

  // Selama profil belum termuat, `user` masih null — menampilkan "Akses ditolak"
  // di saat itu membuat administrator sekalipun mengira tidak punya hak.
  if (!user) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64 gap-3 text-gray-500">
          <Loader2 size={18} className="animate-spin" /> Memuat profil pengguna...
        </div>
      </AppLayout>
    );
  }
  if (user.role !== 'administrator') {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center h-64 text-gray-500 gap-1 text-center px-6">
          <span className="font-medium">Halaman ini hanya untuk Administrator.</span>
          <span className="text-xs">Peran akun Anda saat ini: <strong>{user.role}</strong>.</span>
        </div>
      </AppLayout>
    );
  }

  const BinForm = () => (
    <div className="space-y-4">
      <Input
        label="Kode Bin"
        value={formBinCode}
        onChange={(e) => setFormBinCode(e.target.value.toUpperCase())}
        error={formErrors.binCode}
        placeholder="Contoh: A-01-01"
      />
      <Input
        label="Deskripsi (opsional)"
        value={formDescription}
        onChange={(e) => setFormDescription(e.target.value)}
        placeholder="Deskripsi lokasi bin"
      />
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Gudang</label>
        <input
          type="text"
          list="warehouse-list"
          value={formWarehouse}
          onChange={(e) => setFormWarehouse(e.target.value)}
          placeholder="Nama gudang"
          className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <datalist id="warehouse-list">
          {warehouses.map((w) => <option key={w} value={w} />)}
        </datalist>
        {formErrors.warehouse && <p className="mt-1 text-xs text-red-600">{formErrors.warehouse}</p>}
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Status</label>
        <div className="flex gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="radio" checked={formActive} onChange={() => setFormActive(true)} className="text-blue-600" />
            <span className="text-sm">Aktif</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="radio" checked={!formActive} onChange={() => setFormActive(false)} className="text-red-600" />
            <span className="text-sm">Nonaktif</span>
          </label>
        </div>
      </div>
    </div>
  );


  /** File diurai di browser lalu ditampilkan dulu — tidak ada baris yang masuk
   *  database sebelum tombol Import ditekan. */
  const pilihFile = async (file: File) => {
    setHasilImpor(null);
    setNamaFile(file.name);
    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const grid = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false }) as any[][];

      // Header dicari, bukan diasumsikan ada di baris pertama.
      const idx = grid.findIndex((r) => r.some((c) => /kode\s*bin|^bin$|^kode$/i.test(String(c).trim())));
      if (idx < 0) {
        showError('Format tidak dikenali', 'Tidak menemukan kolom "Kode Bin".');
        return;
      }
      const H = grid[idx].map((c) => String(c).trim().toLowerCase());
      const cari = (...pola: RegExp[]) => H.findIndex((h) => pola.some((pp) => pp.test(h)));
      const kBin = cari(/kode\s*bin/, /^bin$/, /^kode$/);
      const kDesc = cari(/deskripsi/, /keterangan/, /^description$/);
      const kWh = cari(/gudang/, /^warehouse$/);
      const kAktif = cari(/^aktif$/, /^active$/, /^status$/);

      const rows = grid.slice(idx + 1)
        .map((r) => ({
          binCode: String(r[kBin] ?? '').trim(),
          description: kDesc >= 0 ? String(r[kDesc] ?? '').trim() : '',
          warehouse: kWh >= 0 ? String(r[kWh] ?? '').trim() : '',
          active: kAktif >= 0 ? !/^(tidak|no|false|0|nonaktif)$/i.test(String(r[kAktif] ?? '').trim()) : true,
        }))
        .filter((r) => r.binCode);

      if (rows.length === 0) { showError('Tidak ada baris data'); return; }
      setImporBin(rows);
      showSuccess('File terbaca', `${rows.length} baris siap di-import`);
    } catch (e: any) {
      showError('Gagal membaca file', e.message);
    }
  };

  const jalankanImpor = async () => {
    if (!imporBin) return;
    setMengimpor(true);
    let dibuat = 0, dilewati = 0;
    const gagal: string[] = [];
    try {
      // Dikirim per baris supaya bin yang penulisannya bentrok bisa dilaporkan
      // satu per satu, bukan menggagalkan seluruh berkas.
      for (const r of imporBin) {
        const res = await fetch('/api/bins', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(r),
        });
        if (res.ok) dibuat++;
        else if (res.status === 409) dilewati++;
        else {
          const j = await res.json().catch(() => ({}));
          if (gagal.length < 20) gagal.push(`${r.binCode}: ${j.error ?? res.status}`);
        }
      }
      setHasilImpor({ dibuat, dilewati, gagal });
      showSuccess('Import selesai', `${dibuat} bin baru, ${dilewati} sudah ada`);
      setImporBin(null);
      setNamaFile('');
      fetchBins();
    } catch (e: any) {
      showError('Import gagal', e.message);
    } finally {
      setMengimpor(false);
    }
  };

  const ekspor = async () => {
    try {
      if (bins.length === 0) { showError('Tidak ada data untuk diekspor'); return; }
      const XLSX = await import('xlsx');
      // Judul kolom sama dengan yang diterima Import → bisa disunting lalu dimuat ulang.
      const header = ['Kode Bin', 'Deskripsi', 'Gudang', 'Aktif'];
      const data = [header, ...bins.map((b: any) => [
        b.binCode ?? '', b.description ?? '', b.warehouse ?? '', b.active ? 'Ya' : 'Tidak',
      ])];
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet(data);
      ws['!cols'] = header.map((h, i) => ({
        wch: Math.max(h.length, ...data.slice(1).map((r) => String(r[i] ?? '').length)) + 2,
      }));
      XLSX.utils.book_append_sheet(wb, ws, 'Master Bin');
      XLSX.writeFile(wb, `Master_Bin_${new Date().toISOString().slice(0, 10)}.xlsx`);
      showSuccess('Export selesai', `${bins.length} bin`);
    } catch (e: any) {
      showError('Gagal export', e.message);
    }
  };

  return (
    <AppLayout>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Database size={24} className="text-blue-600" />
              Master Data Bin
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{bins.length} bin terdaftar</p>
          </div>

        {/* Upload massal — halaman ini sudah dijaga admin di atas, jadi tidak
            perlu gerbang tambahan di sini. */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-3">
          <label className="flex items-center justify-center gap-3 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl py-6 cursor-pointer hover:border-blue-400 transition-colors">
            <FileSpreadsheet size={20} className="text-gray-400" />
            <span className="text-sm text-gray-600 dark:text-gray-400">
              {namaFile || 'Upload .xlsx untuk menambah bin secara massal'}
            </span>
            <input type="file" accept=".xlsx,.xls,.csv" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) pilihFile(f); }} />
          </label>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Kolom yang dikenali: Kode Bin · Deskripsi · Gudang · Aktif. Bin yang penulisannya
            setara dengan bin yang sudah ada akan dilewati, bukan diduplikasi — jadi
            &quot;RACKING BAK&quot; dan &quot;RACKING-BAK&quot; tidak bisa masuk dua kali.
            Hasil <strong>Export</strong> memakai judul kolom yang sama, sehingga bisa disunting
            di Excel lalu dimuat ulang.
          </p>

          {imporBin && (
            <div className="space-y-3 border-t border-gray-200 dark:border-gray-700 pt-3">
              <div className="text-sm text-gray-700 dark:text-gray-300">
                <strong>{imporBin.length.toLocaleString('id-ID')}</strong> baris terbaca. Contoh 3 pertama:
              </div>
              <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 dark:bg-gray-700/50">
                    <tr>{['Kode Bin', 'Deskripsi', 'Gudang'].map((h) => (
                      <th key={h} className="px-2 py-1.5 text-left">{h}</th>))}</tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                    {imporBin.slice(0, 3).map((r, i) => (
                      <tr key={i}>
                        <td className="px-2 py-1 font-mono">{r.binCode}</td>
                        <td className="px-2 py-1">{r.description}</td>
                        <td className="px-2 py-1">{r.warehouse}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex gap-3">
                <Button variant="outline" onClick={() => { setImporBin(null); setNamaFile(''); }} className="flex-1">Batal</Button>
                <Button onClick={jalankanImpor} loading={mengimpor} className="flex-1">
                  <Upload size={14} /> Import {imporBin.length.toLocaleString('id-ID')} bin
                </Button>
              </div>
            </div>
          )}

          {hasilImpor && (
            <div className="text-xs text-gray-600 dark:text-gray-400 border-t border-gray-200 dark:border-gray-700 pt-3 space-y-1">
              <div>Bin baru <strong>{hasilImpor.dibuat}</strong> · sudah ada (dilewati) {hasilImpor.dilewati}</div>
              {hasilImpor.gagal.length > 0 && (
                <div className="text-amber-700 dark:text-amber-400">Gagal: {hasilImpor.gagal.join(' · ')}</div>
              )}
            </div>
          )}
        </div>
          <div className="flex gap-2">
            <Button onClick={ekspor} variant="outline" size="sm">
              <FileDown size={14} /> Export
            </Button>
            <Button onClick={fetchBins} variant="outline" size="sm" loading={loading}>
              <RefreshCw size={14} />
            </Button>
            <Button onClick={() => { resetForm(); setShowAddModal(true); }} size="sm">
              <Plus size={15} />
              Tambah Bin
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={15} />
            <input
              type="text"
              placeholder="Cari kode bin atau deskripsi..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <select
            value={warehouseFilter}
            onChange={(e) => setWarehouseFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Semua Gudang</option>
            {warehouses.map((w) => <option key={w} value={w}>{w}</option>)}
          </select>
        </div>

        {/* Table */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          {loading ? (
            <div className="p-12 flex items-center justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center text-sm text-gray-400">Tidak ada data bin.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-750">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Kode Bin</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Deskripsi</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Gudang</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {filtered.map((bin) => (
                    <tr key={bin.binCode} className="hover:bg-gray-50 dark:hover:bg-gray-750">
                      <td className="px-4 py-3 font-mono font-semibold text-gray-900 dark:text-white">{bin.binCode}</td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{bin.description || '–'}</td>
                      <td className="px-4 py-3">
                        <Badge variant="blue">{bin.warehouse}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={bin.active ? 'green' : 'red'}>
                          {bin.active ? 'Aktif' : 'Nonaktif'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => handleOpenEdit(bin)}
                          className="p-1.5 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors"
                        >
                          <Edit2 size={14} className="text-blue-600" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Add Modal */}
        <Modal
          isOpen={showAddModal}
          title="Tambah Bin Baru"
          onClose={() => { setShowAddModal(false); resetForm(); }}
          footer={
            <>
              <Button variant="outline" onClick={() => { setShowAddModal(false); resetForm(); }}>Batal</Button>
              <Button onClick={handleAdd} loading={isSaving}>Tambah Bin</Button>
            </>
          }
        >
          <BinForm />
        </Modal>

        {/* Edit Modal */}
        <Modal
          isOpen={showEditModal}
          title="Edit Bin"
          onClose={() => { setShowEditModal(false); setEditBin(null); resetForm(); }}
          footer={
            <>
              <Button variant="outline" onClick={() => { setShowEditModal(false); setEditBin(null); resetForm(); }}>Batal</Button>
              <Button onClick={handleEdit} loading={isSaving}>Simpan Perubahan</Button>
            </>
          }
        >
          <BinForm />
        </Modal>
      </div>
    </AppLayout>
  );
}
