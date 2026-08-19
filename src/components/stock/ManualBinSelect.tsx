'use client';
import { useState, useEffect } from 'react';
import { RefreshCw, AlertCircle } from 'lucide-react';
import { MasterBin } from '@/types';

interface ManualBinSelectProps {
  warehouse?: string;
  value: string;
  onChange: (value: string) => void;
  onConfirm: (value: string) => void;
}

export function ManualBinSelect({ value, onChange, onConfirm }: ManualBinSelectProps) {
  const [bins, setBins] = useState<MasterBin[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  const fetchBins = () => {
    setLoading(true);
    setError('');
    // Ambil SEMUA bin aktif tanpa filter warehouse — biarkan user cari sendiri
    fetch('/api/bins?active=true')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        const list = Array.isArray(data) ? data : [];
        setBins(list);
        if (list.length === 0) setError('Belum ada data bin. Jalankan seed master atau tambahkan lewat menu Admin.');
      })
      .catch((e) => setError(`Gagal memuat data bin: ${e.message}`))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchBins(); }, []);

  const filtered = search.trim()
    ? bins.filter(
        (b) =>
          b.binCode.toLowerCase().includes(search.toLowerCase()) ||
          b.description.toLowerCase().includes(search.toLowerCase()) ||
          b.warehouse.toLowerCase().includes(search.toLowerCase())
      )
    : bins;

  const handleSelect = (binCode: string) => {
    if (!binCode) return;
    onChange(binCode);
    onConfirm(binCode);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          Pilih Lokasi Bin
          {bins.length > 0 && (
            <span className="ml-2 text-xs text-gray-400 font-normal">({bins.length} bin tersedia)</span>
          )}
        </label>
        <button
          type="button"
          onClick={fetchBins}
          disabled={loading}
          className="text-blue-600 hover:text-blue-700 disabled:opacity-50 p-1"
          title="Refresh daftar bin"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {error && (
        <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-xs text-red-700 dark:text-red-300">
          <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="text-center py-6 text-sm text-gray-500">
          <RefreshCw size={20} className="animate-spin mx-auto mb-2" />
          Memuat data bin...
        </div>
      ) : bins.length > 0 ? (
        <>
          {/* Search filter */}
          {bins.length > 10 && (
            <input
              type="text"
              placeholder="Cari bin..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          )}

          {/* Native <select> — paling reliable di PDT Android */}
          <select
            value={value}
            onChange={(e) => handleSelect(e.target.value)}
            size={Math.min(filtered.length + 1, 8)}
            className="w-full border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-base"
            style={{ minHeight: '120px' }}
          >
            <option value="">-- Pilih Bin --</option>
            {filtered.map((bin) => (
              <option key={bin.binCode} value={bin.binCode}>
                {bin.binCode}{bin.description ? ` — ${bin.description}` : ''}{bin.warehouse ? ` (${bin.warehouse})` : ''}
              </option>
            ))}
          </select>

          {filtered.length === 0 && search && (
            <p className="text-xs text-gray-500 text-center py-2">
              Tidak ada bin yang cocok dengan &quot;{search}&quot;
            </p>
          )}

          {/* Konfirmasi setelah pilih */}
          {value && (
            <div className="flex items-center gap-3 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
              <span className="text-sm font-medium text-blue-700 dark:text-blue-300 flex-1">
                Terpilih: <strong>{value}</strong>
              </span>
              <button
                type="button"
                onClick={() => onConfirm(value)}
                className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
              >
                Konfirmasi
              </button>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
