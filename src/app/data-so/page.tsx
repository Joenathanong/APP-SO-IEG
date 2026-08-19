'use client';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/useToast';
import {
  FileDown, Search, Filter, ChevronUp, ChevronDown, ChevronsUpDown,
  Pencil, RefreshCw, Loader2, X, AlertTriangle, Clock,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

type WarehouseFilter = 'all' | 'besar' | 'kecil-transit';

interface DataSORow {
  _id: string;
  source: 'gudang-besar' | 'gudang-kecil' | 'gudang-transit';
  rowIndex: number;
  tanggal: string;   // full ISO timestamp from col A
  user: string;
  shift: string;
  skuSAP: string;
  skuOCS: string;
  batch: string;
  lokasi: string;
  quantity: number;
  uom: string;
  keterangan: string;
  notes: string;
  timestamp: string;
}

type SortField = keyof Pick<DataSORow, 'tanggal' | 'user' | 'shift' | 'skuSAP' | 'skuOCS' | 'batch' | 'lokasi' | 'quantity' | 'keterangan'>;
type SortDir = 'asc' | 'desc';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDateTime(ts: string) {
  if (!ts) return '-';
  const d = new Date(ts);
  if (isNaN(d.getTime())) return ts;
  return d.toLocaleString('id-ID', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

// Parse "HH:MM" to total minutes
function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

// ─── SortIcon ────────────────────────────────────────────────────────────────

function SortIcon({ field, sortField, sortDir }: { field: string; sortField: string; sortDir: SortDir }) {
  if (field !== sortField) return <ChevronsUpDown size={13} className="text-gray-400 ml-0.5" />;
  return sortDir === 'asc'
    ? <ChevronUp size={13} className="text-blue-500 ml-0.5" />
    : <ChevronDown size={13} className="text-blue-500 ml-0.5" />;
}

// ─── Edit Modal ──────────────────────────────────────────────────────────────

interface EditModalProps {
  row: DataSORow | null;
  onClose: () => void;
  onSaved: (updated: DataSORow) => void;
}

function EditModal({ row, onClose, onSaved }: EditModalProps) {
  const { showSuccess, showError } = useToast();
  const [lokasi, setLokasi] = useState('');
  const [quantity, setQuantity] = useState(0);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (row) {
      setLokasi(row.lokasi);
      setQuantity(row.quantity);
      setNotes(row.notes);
    }
  }, [row]);

  const handleSave = async () => {
    if (!row) return;
    setSaving(true);
    try {
      // Satu endpoint untuk kedua gudang, dikunci id baris di database.
      // Versi Sheets memakai nomor baris — kalau ada baris disisipkan atau
      // dihapus di antara membaca dan menyimpan, koreksinya mendarat di baris
      // yang salah tanpa ada yang tahu.
      const res = await fetch(`/api/entries/${row.rowIndex}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ qtyPcs: quantity, binCode: lokasi, notes }),
      });

      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || 'Server error');
      }

      showSuccess('Data berhasil diperbarui');
      onSaved({ ...row, lokasi, quantity, notes });
      onClose();
    } catch (e: any) {
      showError('Gagal menyimpan perubahan', e?.message);
    } finally {
      setSaving(false);
    }
  };

  if (!row) return null;

  return (
    <Modal isOpen={!!row} title="Edit Data SO" onClose={onClose}>
      <div className="space-y-4">
        {/* Info row */}
        <div className="grid grid-cols-2 gap-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg text-xs">
          <div><span className="text-gray-500">SKU SAP:</span> <span className="font-medium">{row.skuSAP || '—'}</span></div>
          <div><span className="text-gray-500">SKU OCS:</span> <span className="font-medium">{row.skuOCS || '—'}</span></div>
          <div><span className="text-gray-500">Batch:</span> <span className="font-medium">{row.batch || '—'}</span></div>
          <div><span className="text-gray-500">Gudang:</span> <span className="font-medium">{row.keterangan}</span></div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Lokasi</label>
          <input
            type="text"
            value={lokasi}
            onChange={(e) => setLokasi(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Quantity ({row.uom})
          </label>
          <input
            type="number"
            min={0}
            value={quantity}
            onChange={(e) => setQuantity(parseFloat(e.target.value) || 0)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {row.source === 'gudang-besar' && (
            <p className="text-xs text-gray-400 mt-1">Mengubah Qty PCS Total (kolom O di sheet)</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Catatan</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="flex gap-3">
          <Button variant="outline" onClick={onClose} className="flex-1">Batal</Button>
          <Button onClick={handleSave} loading={saving} className="flex-1">Simpan</Button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function DataSOPage() {
  const { user } = useAuth();
  const { showError } = useToast();

  const isAdmin = user?.role === 'administrator';

  // Filters — date + time (time is mandatory)
  const [startDate, setStartDate] = useState(todayISO());
  const [endDate, setEndDate] = useState(todayISO());
  const [startTime, setStartTime] = useState('00:00');
  const [endTime, setEndTime] = useState('23:59');
  const [warehouse, setWarehouse] = useState<WarehouseFilter>('all');
  const [search, setSearch] = useState('');

  // Sort
  const [sortField, setSortField] = useState<SortField>('tanggal');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  // Data
  const [rows, setRows] = useState<DataSORow[]>([]);
  const [loading, setLoading] = useState(false);

  // Edit
  const [editRow, setEditRow] = useState<DataSORow | null>(null);

  // ── Validate time filter ──
  const timeValid = startTime !== '' && endTime !== '';

  // ── Fetch ──
  const fetchData = useCallback(async () => {
    if (!timeValid) {
      showError('Jam wajib diisi', 'Isi jam mulai dan jam selesai terlebih dahulu.');
      return;
    }
    setLoading(true);
    try {
      // Satu panggilan menggantikan dua sheet terpisah. Data sudah tergabung
      // di database lewat kolom warehouseType, jadi tidak ada lagi penggabungan
      // dan percabangan di sisi klien.
      const params = new URLSearchParams({
        from: `${startDate}T00:00:00`,
        to: `${endDate}T23:59:59`,
      });
      if (warehouse === 'besar') params.set('warehouseType', 'BESAR');

      const res = await fetch(`/api/entries?${params}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: any[] = await res.json();

      const semua: DataSORow[] = data
        .filter((e) => {
          if (warehouse === 'kecil-transit') return e.warehouseType !== 'BESAR';
          return true;
        })
        .map((e) => ({
          _id: `e-${e.id}`,
          source:
            e.warehouseType === 'BESAR' ? ('gudang-besar' as const)
            : e.warehouseType === 'TRANSIT' ? ('gudang-transit' as const)
            : ('gudang-kecil' as const),
          rowIndex: e.id,
          tanggal: e.scannedAt,
          user: e.userName,
          shift: e.shift,
          skuSAP: e.skuSAP ?? '',
          // Kalau materialnya belum dikenal master, tampilkan teks mentahnya
          // dengan penanda — jangan biarkan barisnya terlihat kosong seolah
          // tidak ada masalah.
          skuOCS: e.skuOCS ?? (e.rawMaterialText ? `${e.rawMaterialText} (belum dikenal)` : ''),
          batch: e.batchDoc || '-',
          lokasi: e.binCode,
          quantity: e.qtyPcs,
          uom: 'PCS',
          keterangan:
            e.warehouseType === 'BESAR' ? 'Gudang Besar'
            : e.warehouseType === 'TRANSIT' ? 'Gudang Transit'
            : 'Gudang Kecil',
          notes: e.notes ?? '',
          timestamp: e.scannedAt,
        }));

      setRows(semua);
    } catch {
      showError('Gagal mengambil data.');
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, warehouse, timeValid]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Filter & Sort ──
  const filteredRows = useMemo(() => {
    let data = [...rows];

    // Time-of-day filter (mandatory)
    if (startTime && endTime) {
      const startMin = timeToMinutes(startTime);
      const endMin   = timeToMinutes(endTime);
      data = data.filter((r) => {
        const d = new Date(r.timestamp);
        if (isNaN(d.getTime())) return true;
        const tsMin = d.getHours() * 60 + d.getMinutes();
        return tsMin >= startMin && tsMin <= endMin;
      });
    }

    // Text search
    if (search) {
      const q = search.toLowerCase();
      data = data.filter((r) =>
        r.skuSAP.toLowerCase().includes(q) ||
        r.skuOCS.toLowerCase().includes(q) ||
        r.batch.toLowerCase().includes(q) ||
        r.lokasi.toLowerCase().includes(q) ||
        r.user.toLowerCase().includes(q) ||
        r.keterangan.toLowerCase().includes(q) ||
        r.notes.toLowerCase().includes(q)
      );
    }

    data.sort((a, b) => {
      const va = a[sortField] ?? '';
      const vb = b[sortField] ?? '';
      const cmp = typeof va === 'number' && typeof vb === 'number'
        ? va - vb
        : String(va).localeCompare(String(vb), 'id');
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return data;
  }, [rows, search, sortField, sortDir, startTime, endTime]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const handleEditSaved = (updated: DataSORow) => {
    setRows((prev) => prev.map((r) => r._id === updated._id ? updated : r));
  };

  // ── Export XLS ──
  const handleExport = async () => {
    if (!timeValid) {
      showError('Jam wajib diisi sebelum export.');
      return;
    }
    try {
      const XLSX = await import('xlsx');
      const headers = ['Tanggal & Jam', 'User', 'Shift', 'SKU SAP', 'SKU OCS', 'Batch', 'Lokasi', 'Quantity', 'UOM', 'Keterangan', 'Catatan'];
      const wsData = [
        headers,
        ...filteredRows.map((r) => [
          formatDateTime(r.tanggal),
          r.user, r.shift, r.skuSAP, r.skuOCS,
          r.batch, r.lokasi, r.quantity, r.uom, r.keterangan, r.notes,
        ]),
      ];
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet(wsData);

      // Auto-width
      const colWidths = headers.map((_, ci) =>
        Math.max(...wsData.map((row) => String(row[ci] ?? '').length), headers[ci].length) + 2
      );
      ws['!cols'] = colWidths.map((w) => ({ wch: w }));

      XLSX.utils.book_append_sheet(wb, ws, 'Data SO');

      const safeTime = (t: string) => t.replace(':', '');
      const fileName = `Data_SO_${startDate}_${safeTime(startTime)}_sd_${endDate}_${safeTime(endTime)}_${warehouse}.xls`;
      XLSX.writeFile(wb, fileName);
    } catch {
      showError('Gagal export XLS.');
    }
  };

  // ── Source badge color ──
  const sourceBadge = (keterangan: string) => {
    if (keterangan === 'Gudang Besar')   return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300';
    if (keterangan === 'Gudang Kecil')   return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300';
    if (keterangan === 'Gudang Transit') return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300';
    return 'bg-gray-100 text-gray-600';
  };

  // ── Column header ──
  const Th = ({ label, field }: { label: string; field: SortField }) => (
    <th
      className="px-3 py-2.5 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 select-none whitespace-nowrap"
      onClick={() => handleSort(field)}
    >
      <span className="inline-flex items-center gap-0.5">
        {label}
        <SortIcon field={field} sortField={sortField} sortDir={sortDir} />
      </span>
    </th>
  );

  const inputClass = "px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500";

  return (
    <AppLayout>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Data Hasil SO</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              {loading ? 'Memuat...' : `${filteredRows.length} dari ${rows.length} data`}
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={fetchData} variant="outline" size="sm" loading={loading} disabled={!timeValid}>
              <RefreshCw size={14} />
              Refresh
            </Button>
            <Button onClick={handleExport} variant="outline" size="sm" disabled={filteredRows.length === 0 || !timeValid}>
              <FileDown size={14} />
              Export XLS
            </Button>
          </div>
        </div>

        {/* Filter bar */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
          <div className="flex flex-wrap gap-3 items-end">

            {/* Date range */}
            <div className="flex items-end gap-2">
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Dari Tanggal</label>
                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={inputClass} />
              </div>
              <span className="text-gray-400 pb-2">—</span>
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Sampai Tanggal</label>
                <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className={inputClass} />
              </div>
            </div>

            {/* Time range — mandatory */}
            <div className="flex items-end gap-2">
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                  <span className="flex items-center gap-1">
                    <Clock size={11} />
                    Jam Mulai <span className="text-red-500">*</span>
                  </span>
                </label>
                <input
                  type="time"
                  required
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className={`${inputClass}${!startTime ? ' border-red-400 ring-1 ring-red-400' : ''}`}
                />
              </div>
              <span className="text-gray-400 pb-2">—</span>
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                  <span className="flex items-center gap-1">
                    <Clock size={11} />
                    Jam Selesai <span className="text-red-500">*</span>
                  </span>
                </label>
                <input
                  type="time"
                  required
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className={`${inputClass}${!endTime ? ' border-red-400 ring-1 ring-red-400' : ''}`}
                />
              </div>
            </div>

            {/* Warehouse filter */}
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Gudang</label>
              <select
                value={warehouse}
                onChange={(e) => setWarehouse(e.target.value as WarehouseFilter)}
                className={inputClass}
              >
                <option value="all">Semua Gudang</option>
                <option value="besar">Gudang Besar</option>
                <option value="kecil-transit">Gudang Kecil &amp; Transit</option>
              </select>
            </div>

            {/* Search */}
            <div className="flex-1 min-w-48">
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Cari</label>
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="SKU, lokasi, user, batch..."
                  className="w-full pl-8 pr-8 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {search && (
                  <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    <X size={13} />
                  </button>
                )}
              </div>
            </div>

            <Button onClick={fetchData} size="sm" className="self-end" disabled={!timeValid}>
              <Filter size={14} />
              Terapkan Filter
            </Button>
          </div>

          {/* Mandatory time notice */}
          {!timeValid && (
            <p className="mt-2 text-xs text-red-500 flex items-center gap-1">
              <AlertTriangle size={12} />
              Jam mulai dan jam selesai wajib diisi.
            </p>
          )}
        </div>

        {/* Admin notice */}
        {!isAdmin && (
          <div className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
            <AlertTriangle size={13} />
            Edit data hanya tersedia untuk Administrator.
          </div>
        )}

        {/* Table */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16 gap-3 text-gray-500">
              <Loader2 size={20} className="animate-spin" />
              Memuat data...
            </div>
          ) : filteredRows.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <Filter size={32} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">Tidak ada data dengan filter ini.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700">
                  <tr>
                    <Th label="Tanggal & Jam" field="tanggal" />
                    <Th label="User"          field="user" />
                    <Th label="Shift"         field="shift" />
                    <Th label="SKU SAP"       field="skuSAP" />
                    <Th label="SKU OCS"       field="skuOCS" />
                    <Th label="Batch"         field="batch" />
                    <Th label="Lokasi"        field="lokasi" />
                    <Th label="Qty"           field="quantity" />
                    <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide whitespace-nowrap">UOM</th>
                    <Th label="Gudang"        field="keterangan" />
                    {isAdmin && (
                      <th className="px-3 py-2.5 text-center text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">Aksi</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {filteredRows.map((row) => (
                    <tr key={row._id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                      <td className="px-3 py-2.5 text-gray-700 dark:text-gray-300 whitespace-nowrap text-xs">
                        {formatDateTime(row.tanggal)}
                      </td>
                      <td className="px-3 py-2.5 text-gray-700 dark:text-gray-300 whitespace-nowrap text-xs">
                        {row.user}
                      </td>
                      <td className="px-3 py-2.5 text-center text-xs">
                        <span className="inline-block px-2 py-0.5 bg-gray-100 dark:bg-gray-700 rounded-full font-medium text-gray-700 dark:text-gray-300">
                          {row.shift}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 font-mono text-xs text-gray-900 dark:text-white whitespace-nowrap">
                        {row.skuSAP || '—'}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-gray-700 dark:text-gray-300 max-w-xs">
                        <span className="block truncate" title={row.skuOCS}>{row.skuOCS || '—'}</span>
                      </td>
                      <td className="px-3 py-2.5 font-mono text-xs text-gray-600 dark:text-gray-400 whitespace-nowrap">
                        {row.batch || '—'}
                      </td>
                      <td className="px-3 py-2.5 font-mono text-xs text-gray-900 dark:text-white whitespace-nowrap">
                        {row.lokasi || '—'}
                      </td>
                      <td className="px-3 py-2.5 text-right font-semibold text-xs text-gray-900 dark:text-white whitespace-nowrap">
                        {row.quantity.toLocaleString('id-ID')}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-gray-500 dark:text-gray-400">PCS</td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${sourceBadge(row.keterangan)}`}>
                          {row.keterangan}
                        </span>
                      </td>
                      {isAdmin && (
                        <td className="px-3 py-2.5 text-center">
                          <button
                            onClick={() => setEditRow(row)}
                            className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-900/20 px-2 py-1 rounded transition-colors"
                          >
                            <Pencil size={12} />
                            Edit
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer summary */}
        {filteredRows.length > 0 && (
          <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 px-1">
            <span>
              Total: <strong className="text-gray-700 dark:text-gray-300">{filteredRows.length}</strong> baris
            </span>
            <span>
              Total Qty: <strong className="text-gray-700 dark:text-gray-300">
                {filteredRows.reduce((s, r) => s + r.quantity, 0).toLocaleString('id-ID')}
              </strong> PCS
            </span>
          </div>
        )}
      </div>

      {/* Edit Modal */}
      <EditModal
        row={editRow}
        onClose={() => setEditRow(null)}
        onSaved={handleEditSaved}
      />
    </AppLayout>
  );
}
