'use client';
import { useState, useEffect, useCallback } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { DateRangePicker } from '@/components/dashboard/DateRangePicker';
import { StockEntryGB, StockEntryKT } from '@/types';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts';
import { Warehouse, Package, Truck, TrendingUp, AlertTriangle, RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { format, parseISO, isValid } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';

type CombinedEntry = ((StockEntryGB | StockEntryKT) & { _sheet: string });

const PIE_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

function getDefaultDates() {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 6);
  const fmt = (d: Date) => d.toISOString().split('T')[0];
  return { start: fmt(start), end: fmt(end) };
}

function formatTimestamp(ts: string): string {
  try {
    const d = new Date(ts);
    if (!isValid(d)) return ts;
    return format(d, 'dd/MM/yy HH:mm');
  } catch {
    return ts;
  }
}

export default function DashboardPage() {
  const { start: defaultStart, end: defaultEnd } = getDefaultDates();
  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate, setEndDate] = useState(defaultEnd);
  const [data, setData] = useState<CombinedEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async (start: string, end: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/history?startDate=${start}&endDate=${end}`);
      if (res.ok) {
        const json = await res.json();
        setData(Array.isArray(json) ? json : []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(startDate, endDate);
  }, []);

  const handleDateChange = (start: string, end: string) => {
    setStartDate(start);
    setEndDate(end);
    fetchData(start, end);
  };

  // Stats
  const gbEntries = data.filter((e) => e._sheet === 'gudang-besar') as (StockEntryGB & { _sheet: string })[];
  const ktEntries = data.filter((e) => e._sheet === 'gudang-kecil-transit') as (StockEntryKT & { _sheet: string })[];
  const kecilEntries = ktEntries.filter((e) => e.category === 'Gudang Kecil');
  const transitEntries = ktEntries.filter((e) => e.category === 'Gudang Transit');
  const doubleCount = data.filter((e) => e.potentialDouble).length;

  const today = new Date().toISOString().split('T')[0];
  const todayData = data.filter((e) => e.timestamp.startsWith(today));

  // Daily bar chart data
  const dailyMap: Record<string, number> = {};
  data.forEach((e) => {
    const day = e.timestamp.substring(0, 10);
    dailyMap[day] = (dailyMap[day] || 0) + 1;
  });
  const barData = Object.entries(dailyMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, count]) => ({
      date: (() => {
        try {
          return format(parseISO(date), 'd MMM', { locale: idLocale });
        } catch {
          return date;
        }
      })(),
      count,
    }));

  // Pie chart data
  const pieData = [
    { name: 'Gudang Besar', value: gbEntries.length },
    { name: 'Gudang Kecil', value: kecilEntries.length },
    { name: 'Gudang Transit', value: transitEntries.length },
  ].filter((d) => d.value > 0);

  const recentEntries = [...data].slice(0, 20);

  const statCards = [
    {
      label: 'Gudang Besar',
      value: gbEntries.length,
      icon: Warehouse,
      color: 'text-blue-600',
      bg: 'bg-blue-50 dark:bg-blue-900/20',
    },
    {
      label: 'Gudang Kecil',
      value: kecilEntries.length,
      icon: Package,
      color: 'text-green-600',
      bg: 'bg-green-50 dark:bg-green-900/20',
    },
    {
      label: 'Gudang Transit',
      value: transitEntries.length,
      icon: Truck,
      color: 'text-amber-600',
      bg: 'bg-amber-50 dark:bg-amber-900/20',
    },
    {
      label: 'Hari Ini',
      value: todayData.length,
      icon: TrendingUp,
      color: 'text-purple-600',
      bg: 'bg-purple-50 dark:bg-purple-900/20',
    },
  ];

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Dashboard</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              Ringkasan aktivitas stock opname
            </p>
          </div>
          <button
            onClick={() => fetchData(startDate, endDate)}
            disabled={loading}
            className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 hover:text-blue-600 transition-colors"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>

        {/* Date Range Picker */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
          <DateRangePicker
            startDate={startDate}
            endDate={endDate}
            onChange={handleDateChange}
          />
        </div>

        {/* Stat Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {statCards.map(({ label, value, icon: Icon, color, bg }) => (
            <div
              key={label}
              className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4"
            >
              <div className="flex items-center justify-between mb-3">
                <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center`}>
                  <Icon size={20} className={color} />
                </div>
              </div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {loading ? '–' : value.toLocaleString('id-ID')}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{label}</p>
            </div>
          ))}
        </div>

        {/* Potential Double Alert */}
        {doubleCount > 0 && (
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-xl p-4 flex items-center gap-3">
            <AlertTriangle className="text-yellow-600 flex-shrink-0" size={20} />
            <div>
              <p className="text-sm font-medium text-yellow-800 dark:text-yellow-300">
                {doubleCount} entri potensi double dalam rentang tanggal ini
              </p>
              <p className="text-xs text-yellow-700 dark:text-yellow-400 mt-0.5">
                Periksa halaman History untuk review lebih lanjut.
              </p>
            </div>
          </div>
        )}

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Bar Chart */}
          <div className="lg:col-span-2 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">
              Jumlah Scan per Hari
            </h2>
            {loading ? (
              <div className="h-48 flex items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
              </div>
            ) : barData.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-sm text-gray-400">
                Tidak ada data
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={barData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{
                      background: 'white',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      fontSize: '12px',
                    }}
                  />
                  <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Scan" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Pie Chart */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">
              Distribusi per Gudang
            </h2>
            {loading ? (
              <div className="h-48 flex items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
              </div>
            ) : pieData.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-sm text-gray-400">
                Tidak ada data
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    dataKey="value"
                    label={({ percent }) => `${(percent * 100).toFixed(0)}%`}
                    labelLine={false}
                  >
                    {pieData.map((_, index) => (
                      <Cell key={index} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      background: 'white',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      fontSize: '12px',
                    }}
                  />
                  <Legend iconSize={10} wrapperStyle={{ fontSize: '11px' }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Recent Scans */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">
              20 Scan Terbaru
            </h2>
          </div>
          {loading ? (
            <div className="p-8 flex items-center justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            </div>
          ) : recentEntries.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-400">Tidak ada data scan</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-750">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Waktu</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">User</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Sumber</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Barcode</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Lokasi</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {recentEntries.map((entry, idx) => {
                    const isGB = entry._sheet === 'gudang-besar';
                    const gbE = entry as StockEntryGB & { _sheet: string };
                    const ktE = entry as StockEntryKT & { _sheet: string };
                    return (
                      <tr
                        key={idx}
                        className={`${entry.potentialDouble ? 'bg-yellow-50 dark:bg-yellow-900/10' : 'hover:bg-gray-50 dark:hover:bg-gray-750'}`}
                      >
                        <td className="px-4 py-2.5 text-xs text-gray-500 whitespace-nowrap">
                          {formatTimestamp(entry.timestamp)}
                        </td>
                        <td className="px-4 py-2.5 text-xs text-gray-700 dark:text-gray-300">
                          {entry.user}
                        </td>
                        <td className="px-4 py-2.5">
                          <Badge variant={isGB ? 'blue' : ktE.category === 'Gudang Kecil' ? 'green' : 'orange'}>
                            {isGB ? 'GB' : ktE.category === 'Gudang Kecil' ? 'Kecil' : 'Transit'}
                          </Badge>
                        </td>
                        <td className="px-4 py-2.5 text-xs font-mono text-gray-900 dark:text-white">
                          {isGB ? gbE.barcode : ktE.barcode}
                        </td>
                        <td className="px-4 py-2.5 text-xs text-gray-700 dark:text-gray-300">
                          {entry.location}
                        </td>
                        <td className="px-4 py-2.5">
                          <Badge
                            variant={
                              entry.status === 'saved' ? 'green' :
                              entry.status === 'pending' ? 'yellow' : 'red'
                            }
                          >
                            {entry.status === 'saved' ? 'OK' : entry.status === 'pending' ? 'Antrean' : 'Error'}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
