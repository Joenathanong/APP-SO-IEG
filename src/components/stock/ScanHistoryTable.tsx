'use client';
import { useState } from 'react';
import { StockEntryGB, StockEntryKT } from '@/types';
import { Badge } from '@/components/ui/Badge';
import { ChevronLeft, ChevronRight, Edit2, AlertTriangle } from 'lucide-react';

type Entry = (StockEntryGB | StockEntryKT) & { _sheet?: string };

interface ScanHistoryTableProps {
  entries: Entry[];
  type: 'gb' | 'kt';
  onEdit?: (entry: Entry) => void;
}

const PAGE_SIZE = 10;

function formatTimestamp(ts: string): string {
  try {
    const d = new Date(ts);
    return d.toLocaleString('id-ID', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
  } catch {
    return ts;
  }
}

function statusVariant(status: string): 'green' | 'yellow' | 'red' {
  if (status === 'saved') return 'green';
  if (status === 'pending') return 'yellow';
  return 'red';
}

export function ScanHistoryTable({ entries, type, onEdit }: ScanHistoryTableProps) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(entries.length / PAGE_SIZE));
  const pageEntries = entries.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  if (entries.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-8 text-center">
        <p className="text-gray-500 dark:text-gray-400 text-sm">Belum ada data scan pada sesi ini.</p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
          Riwayat Scan Sesi Ini ({entries.length})
        </h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-750">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Waktu</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Barcode</th>
              {type === 'gb' ? (
                <>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Deskripsi</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Qty Karton</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Qty PCS</th>
                </>
              ) : (
                <>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Kategori</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Qty PCS</th>
                </>
              )}
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Lokasi</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Status</th>
              {onEdit && <th className="px-4 py-3" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
            {pageEntries.map((entry, idx) => {
              const isGB = type === 'gb';
              const gbEntry = entry as StockEntryGB;
              const ktEntry = entry as StockEntryKT;
              const rowClass = entry.potentialDouble
                ? 'bg-yellow-50 dark:bg-yellow-900/10'
                : 'hover:bg-gray-50 dark:hover:bg-gray-750';

              return (
                <tr key={idx} className={rowClass}>
                  <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                    {formatTimestamp(entry.timestamp)}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-900 dark:text-white">
                    <div className="flex items-center gap-1">
                      {entry.potentialDouble && (
                        <AlertTriangle size={12} className="text-yellow-500 flex-shrink-0" />
                      )}
                      {isGB ? gbEntry.barcode : ktEntry.barcode}
                    </div>
                  </td>
                  {isGB ? (
                    <>
                      <td className="px-4 py-3 text-xs text-gray-700 dark:text-gray-300 max-w-xs truncate">
                        {gbEntry.description}
                      </td>
                      <td className="px-4 py-3 text-right text-xs font-medium text-gray-900 dark:text-white">
                        {gbEntry.qtyCarton}
                      </td>
                      <td className="px-4 py-3 text-right text-xs font-medium text-gray-900 dark:text-white">
                        {gbEntry.qtyPcsTotal}
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-4 py-3 text-xs text-gray-700 dark:text-gray-300">
                        {ktEntry.category}
                      </td>
                      <td className="px-4 py-3 text-right text-xs font-medium text-gray-900 dark:text-white">
                        {ktEntry.qtyPcs}
                      </td>
                    </>
                  )}
                  <td className="px-4 py-3 text-xs text-gray-700 dark:text-gray-300">{entry.location}</td>
                  <td className="px-4 py-3">
                    <Badge variant={statusVariant(entry.status)}>
                      {entry.status === 'saved' ? 'Tersimpan' : entry.status === 'pending' ? 'Antrean' : 'Error'}
                    </Badge>
                  </td>
                  {onEdit && (
                    <td className="px-4 py-3">
                      <button
                        onClick={() => onEdit(entry)}
                        className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
                      >
                        <Edit2 size={14} className="text-gray-400 hover:text-blue-600" />
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {/* Pagination */}
      {totalPages > 1 && (
        <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Halaman {page} dari {totalPages}
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
  );
}
