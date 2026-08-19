'use client';
import { useState, useEffect, useCallback } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { DateRangePicker } from '@/components/dashboard/DateRangePicker';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/useToast';
import { StockEntryGB, StockEntryKT } from '@/types';
import { Search, Download, ChevronLeft, ChevronRight, AlertTriangle, Edit2, History } from 'lucide-react';
import { format, parseISO, isValid, differenceInMinutes } from 'date-fns';

type CombinedEntry = ((StockEntryGB | StockEntryKT) & { _sheet: string });

const PAGE_SIZE = 20;

function getDefaultDates() {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 6);
  return {
    start: start.toISOString().split('T')[0],
    end: end.toISOString().split('T')[0],
  };
}

function formatTs(ts: string) {
  try {
    const d = new Date(ts);
    if (!isValid(d)) return ts;
    return format(d, 'dd/MM/yy HH:mm:ss');
  } catch {
    return ts;
  }
}

export default function HistoryPage() {
  const { user } = useAuth();
  const { showSuccess, showError } = useToast();

  const { start: defStart, end: defEnd } = getDefaultDates();
  const [startDate, setStartDate] = useState(defStart);
  const [endDate, setEndDate] = useState(defEnd);
  const [typeFilter, setTypeFilter] = useState<'all' | 'gb' | 'kt'>('all');
  const [search, setSearch] = useState('');
  const [userFilter, setUserFilter] = useState('');
  const [data, setData] = useState<CombinedEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [editEntry, setEditEntry] = useState<CombinedEntry | null>(null);
  const [editQty, setEditQty] = useState<number>(0);
  const [editLocation, setEditLocation] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  const fetchData = useCallback(async (start: string, end: string, type: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ startDate: start, endDate: end });
      if (type !== 'all') params.append('type', type);
      const res = await fetch(`/api/history?${params}`);
      if (res.ok) {
        const json = await res.json();
        setData(Array.isArray(json) ? json : []);
        setPage(1);
      }
    } catch (e) {
      showError('Gagal memuat data history.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(startDate, endDate, typeFilter);
  }, []);

  const handleDateChange = (start: string, end: string) => {
    setStartDate(start);
    setEndDate(end);
    fetchData(start, end, typeFilter);
  };

  const handleTypeChange = (t: 'all' | 'gb' | 'kt') => {
    setTypeFilter(t);
    fetchData(startDate, endDate, t);
  };

  // Filter
  const filtered = data.filter((e) => {
    const isGB = e._sheet === 'gudang-besar';
    const gbE = e as StockEntryGB;
    const ktE = e as StockEntryKT;
    const searchLower = search.toLowerCase();
    const matchSearch = !search ||
      (isGB ? gbE.barcode : ktE.barcode).toLowerCase().includes(searchLower) ||
      (isGB ? gbE.description : '').toLowerCase().includes(searchLower) ||
      e.location.toLowerCase().includes(searchLower);
    const matchUser = !userFilter || e.user.toLowerCase().includes(userFilter.toLowerCase());
    return matchSearch && matchUser;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageData = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Determine if an entry can be edited
  const canEdit = (entry: CombinedEntry): boolean => {
    if (user?.role === 'administrator') return true;
    // Operators: only within 30 minutes
    try {
      const diff = differenceInMinutes(new Date(), new Date(entry.timestamp));
      return diff <= 30;
    } catch {
      return false;
    }
  };

  const handleOpenEdit = (entry: CombinedEntry) => {
    setEditEntry(entry);
    const isGB = entry._sheet === 'gudang-besar';
    setEditQty(isGB ? (entry as StockEntryGB).qtyCarton : (entry as StockEntryKT).qtyPcs);
    setEditLocation(entry.location);
    setEditNotes(entry.notes);
  };

  const handleSaveEdit = async () => {
    if (!editEntry) return;
    setIsSavingEdit(true);

    const isGB = editEntry._sheet === 'gudang-besar';
    const rowIndex = editEntry.rowIndex;
    if (rowIndex === undefined) {
      showError('Tidak dapat mengidentifikasi baris data.');
      setIsSavingEdit(false);
      return;
    }

    try {
      let updatedEntry: any;
      if (isGB) {
        const gbE = editEntry as StockEntryGB;
        updatedEntry = {
          ...gbE,
          rowIndex,
          qtyCarton: editQty,
          qtyPcsTotal: Math.round(editQty * gbE.qtyPerBox),
          location: editLocation,
          notes: editNotes,
        };
      } else {
        updatedEntry = {
          ...editEntry,
          rowIndex,
          qtyPcs: editQty,
          location: editLocation,
          notes: editNotes,
        };
      }

      // Koreksi kini lewat satu endpoint, dikunci id baris di database.
      // Versi lama memakai nomor baris sheet — kalau ada baris disisipkan atau
      // dihapus, koreksinya bisa mendarat di baris yang salah.
      const res = await fetch(`/api/entries/${rowIndex}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ qtyPcs: editQty, binCode: editLocation, notes: editNotes }),
      });

      if (res.ok) {
        showSuccess('Data berhasil diupdate!');
        setEditEntry(null);
        fetchData(startDate, endDate, typeFilter);
      } else {
        throw new Error('Server error');
      }
    } catch (e) {
      showError('Gagal mengupdate data.');
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleExport = () => {
    if (filtered.length === 0) return;
    const headers = ['Timestamp', 'User', 'Shift', 'Tipe', 'Barcode', 'Deskripsi/Kategori', 'Qty', 'Lokasi', 'Catatan', 'Status', 'Potensi Double'];
    const rows = filtered.map((e) => {
      const isGB = e._sheet === 'gudang-besar';
      const gbE = e as StockEntryGB;
      const ktE = e as StockEntryKT;
      return [
        e.timestamp,
        e.user,
        e.shift,
        isGB ? 'Gudang Besar' : ktE.category,
        isGB ? gbE.barcode : ktE.barcode,
        isGB ? gbE.description : (ktE.ocsCode || ktE.category),
        isGB ? gbE.qtyPcsTotal : ktE.qtyPcs,
        e.location,
        e.notes,
        e.status,
        e.potentialDouble ? 'Ya' : 'Tidak',
      ].map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',');
    });
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `history-so-${startDate}-${endDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <AppLayout>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <History size={24} className="text-blue-600" />
              History Stock Opname
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              {filtered.length} entri ditemukan
            </p>
          </div>
          <Button onClick={handleExport} variant="outline" size="sm" disabled={filtered.length === 0}>
            <Download size={15} />
            Export CSV
          </Button>
        </div>

        {/* Filters */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-4">
          <DateRangePicker startDate={startDate} endDate={endDate} onChange={handleDateChange} />
          <div className="flex flex-wrap gap-3">
            {/* Type filter */}
            <div className="flex gap-1.5">
              {([['all', 'Semua'], ['gb', 'Gudang Besar'], ['kt', 'Kecil/Transit']] as const).map(([val, label]) => (
                <button
                  key={val}
                  onClick={() => handleTypeChange(val)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${typeFilter === val ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'}`}
                >
                  {label}
                </button>
              ))}
            </div>
            {/* Search */}
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={15} />
              <input
                type="text"
                placeholder="Cari barcode, deskripsi, lokasi..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                className="w-full pl-9 pr-4 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            {/* User filter (admin only) */}
            {user?.role === 'administrator' && (
              <input
                type="text"
                placeholder="Filter user..."
                value={userFilter}
                onChange={(e) => { setUserFilter(e.target.value); setPage(1); }}
                className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            )}
          </div>
        </div>

        {/* Table */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          {loading ? (
            <div className="p-12 flex items-center justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            </div>
          ) : pageData.length === 0 ? (
            <div className="p-12 text-center text-sm text-gray-400">
              Tidak ada data dalam rentang tanggal ini.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-750">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Waktu</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">User</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Shift</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tipe</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Barcode</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Deskripsi/Kat.</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Qty</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Lokasi</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {pageData.map((entry, idx) => {
                    const isGB = entry._sheet === 'gudang-besar';
                    const gbE = entry as StockEntryGB;
                    const ktE = entry as StockEntryKT;
                    const rowClass = entry.potentialDouble
                      ? 'bg-yellow-50 dark:bg-yellow-900/10'
                      : 'hover:bg-gray-50 dark:hover:bg-gray-750';
                    const editable = canEdit(entry);

                    return (
                      <tr key={idx} className={rowClass}>
                        <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                          {formatTs(entry.timestamp)}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-700 dark:text-gray-300">{entry.user}</td>
                        <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-400">{entry.shift}</td>
                        <td className="px-4 py-3">
                          <Badge variant={isGB ? 'blue' : ktE.category === 'Gudang Kecil' ? 'green' : 'orange'}>
                            {isGB ? 'GB' : ktE.category === 'Gudang Kecil' ? 'Kecil' : 'Transit'}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-gray-900 dark:text-white">
                          <div className="flex items-center gap-1">
                            {entry.potentialDouble && <AlertTriangle size={12} className="text-yellow-500" />}
                            {isGB ? gbE.barcode : ktE.barcode}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-700 dark:text-gray-300 max-w-xs truncate">
                          {isGB ? gbE.description : (ktE.ocsCode || ktE.category)}
                        </td>
                        <td className="px-4 py-3 text-right text-xs font-medium text-gray-900 dark:text-white">
                          {isGB ? `${gbE.qtyPcsTotal} PCS` : `${ktE.qtyPcs} PCS`}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-700 dark:text-gray-300">{entry.location}</td>
                        <td className="px-4 py-3">
                          <Badge variant={entry.status === 'saved' ? 'green' : entry.status === 'pending' ? 'yellow' : 'red'}>
                            {entry.status === 'saved' ? 'OK' : entry.status === 'pending' ? 'Antrean' : 'Error'}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          {editable ? (
                            <button
                              onClick={() => handleOpenEdit(entry)}
                              className="p-1.5 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors"
                            >
                              <Edit2 size={14} className="text-blue-600" />
                            </button>
                          ) : (
                            <span className="text-xs text-gray-300 dark:text-gray-600">–</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {!loading && totalPages > 1 && (
            <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <p className="text-xs text-gray-500">
                Halaman {page} dari {totalPages} ({filtered.length} total)
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="p-1.5 rounded border border-gray-300 dark:border-gray-600 disabled:opacity-40 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                  <ChevronLeft size={14} />
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="p-1.5 rounded border border-gray-300 dark:border-gray-600 disabled:opacity-40 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Edit Modal */}
        {editEntry && (
          <Modal
            isOpen={!!editEntry}
            title="Edit Data Stock"
            onClose={() => setEditEntry(null)}
            footer={
              <>
                <Button variant="outline" onClick={() => setEditEntry(null)}>Batal</Button>
                <Button onClick={handleSaveEdit} loading={isSavingEdit}>Simpan Perubahan</Button>
              </>
            }
          >
            <div className="space-y-4">
              <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg text-xs">
                <p><strong>Barcode:</strong> {editEntry._sheet === 'gudang-besar' ? (editEntry as StockEntryGB).barcode : (editEntry as StockEntryKT).barcode}</p>
                <p><strong>Tipe:</strong> {editEntry._sheet === 'gudang-besar' ? 'Gudang Besar' : (editEntry as StockEntryKT).category}</p>
                <p><strong>Timestamp:</strong> {formatTs(editEntry.timestamp)}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  {editEntry._sheet === 'gudang-besar' ? 'Qty Karton' : 'Qty PCS'}
                </label>
                <input
                  type="number"
                  min={1}
                  value={editQty}
                  onChange={(e) => setEditQty(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {editEntry._sheet === 'gudang-besar' && (
                  <p className="text-xs text-gray-500 mt-1">
                    Total PCS: {Math.round(editQty * (editEntry as StockEntryGB).qtyPerBox)}
                  </p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Lokasi</label>
                <input
                  type="text"
                  value={editLocation}
                  onChange={(e) => setEditLocation(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Catatan</label>
                <textarea
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  rows={2}
                  className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none text-sm"
                />
              </div>
            </div>
          </Modal>
        )}
      </div>
    </AppLayout>
  );
}
