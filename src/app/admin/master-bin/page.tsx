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
import { Database, Plus, Edit2, RefreshCw, Search } from 'lucide-react';

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
  }, []);

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

  if (user?.role !== 'administrator') {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64 text-gray-500">
          Akses ditolak. Halaman ini hanya untuk Administrator.
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
          <div className="flex gap-2">
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
