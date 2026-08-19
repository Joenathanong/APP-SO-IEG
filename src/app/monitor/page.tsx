'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from 'recharts';
import { RefreshCw, Play, Pause, ChevronLeft, ChevronRight, Maximize2 } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SOItem {
  materialOCS: string;
  materialIEG: string;
  materialEJI: string;
  kategori: string;
  jumlahOCS: number;
  hasilSO: number | null;
  selisih: number | null;
  status: 'belum' | 'sesuai' | 'surplus' | 'defisit';
}

interface Stats {
  total: number;
  dihitung: number;
  belum: number;
  sesuai: number;
  surplus: number;
  defisit: number;
  progress: number;
  totalSelisihPlus: number;
  totalSelisihMinus: number;
}

interface KategoriData {
  kategori: string;
  total: number;
  dihitung: number;
  sesuai: number;
  surplus: number;
  defisit: number;
  belum: number;
}

interface MonitorData {
  stats: Stats;
  top10Selisih: SOItem[];
  top10Surplus: SOItem[];
  top10Defisit: SOItem[];
  byKategori: KategoriData[];
  lastUpdated: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  n.toLocaleString('id-ID', { maximumFractionDigits: 0 });

const fmtSigned = (n: number) =>
  (n > 0 ? '+' : '') + fmt(n);

function shortLabel(item: SOItem): string {
  return item.materialOCS || item.materialIEG || item.materialEJI || '—';
}

function clock(d: Date) {
  return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function dateStr(d: Date) {
  return d.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

// ─── Colors ───────────────────────────────────────────────────────────────────

const C = {
  sesuai:  '#10b981',
  surplus: '#3b82f6',
  defisit: '#ef4444',
  belum:   '#6b7280',
  warn:    '#f59e0b',
};

// ─── Slides ───────────────────────────────────────────────────────────────────

function SlideKPI({ stats }: { stats: Stats }) {
  const accuracy = stats.dihitung > 0
    ? Math.round((stats.sesuai / stats.dihitung) * 100)
    : 0;

  const pieData = [
    { name: 'Sesuai',  value: stats.sesuai,  color: C.sesuai },
    { name: 'Surplus', value: stats.surplus, color: C.surplus },
    { name: 'Defisit', value: stats.defisit, color: C.defisit },
    { name: 'Belum',   value: stats.belum,   color: C.belum },
  ].filter((d) => d.value > 0);

  return (
    <div className="h-full flex flex-col gap-6">
      <h2 className="text-3xl font-bold text-white tracking-wide">
        📊 Ringkasan Stock Opname
      </h2>

      {/* Progress bar */}
      <div>
        <div className="flex justify-between text-sm text-slate-400 mb-2">
          <span>Progress SO</span>
          <span className="font-mono text-white font-bold">{stats.dihitung} / {stats.total} item</span>
        </div>
        <div className="w-full h-6 bg-slate-700 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-1000"
            style={{
              width: `${stats.progress}%`,
              background: stats.progress >= 90
                ? C.sesuai
                : stats.progress >= 50
                ? C.warn
                : C.defisit,
            }}
          />
        </div>
        <div className="text-right mt-1">
          <span className="text-5xl font-black text-white">{stats.progress}%</span>
          <span className="text-slate-400 ml-2 text-lg">selesai</span>
        </div>
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 flex-1">
        {[
          { label: 'Total Item',  value: fmt(stats.total),    sub: 'dalam Resume SO', color: 'border-slate-500', text: 'text-white' },
          { label: 'Sudah Dihitung', value: fmt(stats.dihitung), sub: `${stats.progress}% progress`, color: 'border-blue-500', text: 'text-blue-300' },
          { label: 'Belum Dihitung', value: fmt(stats.belum),  sub: 'item tersisa', color: 'border-yellow-500', text: 'text-yellow-300' },
          { label: 'Akurasi',    value: `${accuracy}%`,        sub: 'dari yang dihitung', color: 'border-emerald-500', text: 'text-emerald-300' },
        ].map((k) => (
          <div key={k.label} className={`bg-slate-800/60 border-l-4 ${k.color} rounded-xl p-5 flex flex-col justify-between`}>
            <p className="text-slate-400 text-sm font-medium uppercase tracking-wider">{k.label}</p>
            <p className={`text-5xl font-black ${k.text} mt-2`}>{k.value}</p>
            <p className="text-slate-500 text-sm mt-1">{k.sub}</p>
          </div>
        ))}
      </div>

      {/* Status row + Pie */}
      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2 grid grid-cols-3 gap-3">
          {[
            { label: '✅ Sesuai',  value: stats.sesuai,  color: 'text-emerald-400', bg: 'bg-emerald-900/30' },
            { label: '📈 Surplus', value: stats.surplus, color: 'text-blue-400',    bg: 'bg-blue-900/30' },
            { label: '📉 Defisit', value: stats.defisit, color: 'text-red-400',     bg: 'bg-red-900/30' },
          ].map((s) => (
            <div key={s.label} className={`${s.bg} rounded-xl p-4 text-center`}>
              <p className="text-slate-400 text-xs font-semibold uppercase">{s.label}</p>
              <p className={`text-4xl font-black ${s.color} mt-1`}>{fmt(s.value)}</p>
              <p className="text-slate-500 text-xs mt-1">
                {stats.dihitung > 0 ? Math.round((s.value / stats.dihitung) * 100) : 0}%
              </p>
            </div>
          ))}
          <div className="col-span-3 grid grid-cols-2 gap-3">
            <div className="bg-blue-900/20 rounded-xl p-3 flex items-center gap-3">
              <span className="text-blue-400 text-2xl">+</span>
              <div>
                <p className="text-slate-400 text-xs">Total Kelebihan (Surplus)</p>
                <p className="text-blue-300 text-2xl font-bold">+{fmt(stats.totalSelisihPlus)}</p>
              </div>
            </div>
            <div className="bg-red-900/20 rounded-xl p-3 flex items-center gap-3">
              <span className="text-red-400 text-2xl">−</span>
              <div>
                <p className="text-slate-400 text-xs">Total Kekurangan (Defisit)</p>
                <p className="text-red-300 text-2xl font-bold">{fmt(stats.totalSelisihMinus)}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Pie chart */}
        <div className="bg-slate-800/40 rounded-xl flex flex-col items-center justify-center p-2">
          <p className="text-slate-400 text-xs font-semibold uppercase mb-1">Distribusi Status</p>
          <ResponsiveContainer width="100%" height={160}>
            <PieChart>
              <Pie data={pieData} cx="50%" cy="50%" innerRadius={40} outerRadius={70} dataKey="value" paddingAngle={2}>
                {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
              </Pie>
              <Tooltip
                formatter={(v: number) => [fmt(v), '']}
                contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
                labelStyle={{ color: '#94a3b8' }}
                itemStyle={{ color: '#e2e8f0' }}
              />
              <Legend
                iconType="circle"
                iconSize={8}
                formatter={(v) => <span style={{ color: '#94a3b8', fontSize: 11 }}>{v}</span>}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

function SlideTop10Selisih({ data }: { data: SOItem[] }) {
  const chartData = data.map((i) => ({
    name: shortLabel(i).slice(0, 12),
    label: shortLabel(i),
    selisih: i.selisih ?? 0,
    fill: (i.selisih ?? 0) > 0 ? C.surplus : C.defisit,
  }));

  return (
    <div className="h-full flex flex-col gap-5">
      <h2 className="text-3xl font-bold text-white">⚠️ Top 10 Selisih Terbesar</h2>

      <div className="grid grid-cols-5 gap-4 flex-1 min-h-0">
        {/* Chart */}
        <div className="col-span-3 bg-slate-800/40 rounded-xl p-4">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} layout="vertical" margin={{ left: 8, right: 24, top: 4, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" horizontal={false} />
              <XAxis type="number" tick={{ fill: '#94a3b8', fontSize: 12 }} tickFormatter={fmt} />
              <YAxis type="category" dataKey="name" width={90} tick={{ fill: '#cbd5e1', fontSize: 11 }} />
              <Tooltip
                cursor={{ fill: '#334155' }}
                contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
                labelStyle={{ color: '#e2e8f0', fontWeight: 'bold' }}
                formatter={(v: number) => [fmtSigned(v), 'Selisih']}
                labelFormatter={(_, payload) => payload?.[0]?.payload?.label || ''}
              />
              <Bar dataKey="selisih" radius={[0, 4, 4, 0]}>
                {chartData.map((entry, i) => (
                  <Cell key={i} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Table */}
        <div className="col-span-2 overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-slate-400 border-b border-slate-700 text-xs uppercase">
                <th className="text-left py-2 pr-3">#</th>
                <th className="text-left py-2 pr-3">Material OCS</th>
                <th className="text-right py-2 pr-3">OCS</th>
                <th className="text-right py-2 pr-3">SO</th>
                <th className="text-right py-2">Selisih</th>
              </tr>
            </thead>
            <tbody>
              {data.map((item, i) => (
                <tr key={i} className="border-b border-slate-800 hover:bg-slate-800/40">
                  <td className="py-2.5 pr-3 text-slate-500 font-mono text-xs">{i + 1}</td>
                  <td className="py-2.5 pr-3">
                    <p className="text-white font-semibold text-sm leading-tight">{item.materialOCS || item.materialIEG || '—'}</p>
                    {item.materialIEG && item.materialOCS && (
                      <p className="text-slate-500 text-xs">{item.materialIEG}</p>
                    )}
                  </td>
                  <td className="py-2.5 pr-3 text-right font-mono text-slate-300">{fmt(item.jumlahOCS)}</td>
                  <td className="py-2.5 pr-3 text-right font-mono text-slate-300">
                    {item.hasilSO !== null ? fmt(item.hasilSO) : <span className="text-slate-600">—</span>}
                  </td>
                  <td className={`py-2.5 text-right font-mono font-bold text-base ${(item.selisih ?? 0) > 0 ? 'text-blue-400' : 'text-red-400'}`}>
                    {item.selisih !== null ? fmtSigned(item.selisih) : '—'}
                  </td>
                </tr>
              ))}
              {data.length === 0 && (
                <tr><td colSpan={5} className="py-8 text-center text-slate-500">Belum ada data selisih</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function SlideSurplusDefisit({ surplus, defisit }: { surplus: SOItem[]; defisit: SOItem[] }) {
  return (
    <div className="h-full flex flex-col gap-5">
      <h2 className="text-3xl font-bold text-white">📈📉 Surplus &amp; Defisit Terbesar</h2>
      <div className="grid grid-cols-2 gap-5 flex-1 min-h-0">
        {/* Surplus */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-blue-500" />
            <p className="text-blue-300 font-semibold text-lg">Top 10 Surplus (Fisik &gt; OCS)</p>
          </div>
          <div className="bg-slate-800/40 rounded-xl overflow-auto flex-1">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-800">
                <tr className="text-slate-400 border-b border-slate-700 text-xs uppercase">
                  <th className="text-left py-2 px-3">#</th>
                  <th className="text-left py-2 px-3">Material</th>
                  <th className="text-right py-2 px-3">OCS</th>
                  <th className="text-right py-2 px-3">SO</th>
                  <th className="text-right py-2 px-3">+Selisih</th>
                </tr>
              </thead>
              <tbody>
                {surplus.map((item, i) => (
                  <tr key={i} className="border-b border-slate-800/60">
                    <td className="py-2.5 px-3 text-slate-500 text-xs">{i + 1}</td>
                    <td className="py-2.5 px-3">
                      <p className="text-white font-medium text-sm leading-tight">{item.materialOCS || item.materialIEG || '—'}</p>
                      <p className="text-slate-500 text-xs">{item.kategori}</p>
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-slate-400 text-sm">{fmt(item.jumlahOCS)}</td>
                    <td className="py-2.5 px-3 text-right font-mono text-slate-300 text-sm">{item.hasilSO !== null ? fmt(item.hasilSO) : '—'}</td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-blue-400 text-base">
                      +{fmt(item.selisih ?? 0)}
                    </td>
                  </tr>
                ))}
                {surplus.length === 0 && (
                  <tr><td colSpan={5} className="py-8 text-center text-slate-500">Tidak ada surplus</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Defisit */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-red-500" />
            <p className="text-red-300 font-semibold text-lg">Top 10 Defisit (Fisik &lt; OCS)</p>
          </div>
          <div className="bg-slate-800/40 rounded-xl overflow-auto flex-1">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-800">
                <tr className="text-slate-400 border-b border-slate-700 text-xs uppercase">
                  <th className="text-left py-2 px-3">#</th>
                  <th className="text-left py-2 px-3">Material</th>
                  <th className="text-right py-2 px-3">OCS</th>
                  <th className="text-right py-2 px-3">SO</th>
                  <th className="text-right py-2 px-3">−Selisih</th>
                </tr>
              </thead>
              <tbody>
                {defisit.map((item, i) => (
                  <tr key={i} className="border-b border-slate-800/60">
                    <td className="py-2.5 px-3 text-slate-500 text-xs">{i + 1}</td>
                    <td className="py-2.5 px-3">
                      <p className="text-white font-medium text-sm leading-tight">{item.materialOCS || item.materialIEG || '—'}</p>
                      <p className="text-slate-500 text-xs">{item.kategori}</p>
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-slate-400 text-sm">{fmt(item.jumlahOCS)}</td>
                    <td className="py-2.5 px-3 text-right font-mono text-slate-300 text-sm">{item.hasilSO !== null ? fmt(item.hasilSO) : '—'}</td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-red-400 text-base">
                      {fmt(item.selisih ?? 0)}
                    </td>
                  </tr>
                ))}
                {defisit.length === 0 && (
                  <tr><td colSpan={5} className="py-8 text-center text-slate-500">Tidak ada defisit</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function SlideKategori({ byKategori }: { byKategori: KategoriData[] }) {
  const chartData = byKategori.slice(0, 10).map((k) => ({
    name: k.kategori.length > 18 ? k.kategori.slice(0, 18) + '…' : k.kategori,
    fullName: k.kategori,
    sesuai: k.sesuai,
    surplus: k.surplus,
    defisit: k.defisit,
    belum: k.belum,
    pct: k.total > 0 ? Math.round((k.dihitung / k.total) * 100) : 0,
  }));

  return (
    <div className="h-full flex flex-col gap-5">
      <h2 className="text-3xl font-bold text-white">📦 Progress per Kategori Produk</h2>

      <div className="grid grid-cols-5 gap-5 flex-1 min-h-0">
        {/* Stacked bar */}
        <div className="col-span-3 bg-slate-800/40 rounded-xl p-4">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" horizontal={false} />
              <XAxis type="number" tick={{ fill: '#94a3b8', fontSize: 11 }} tickFormatter={fmt} />
              <YAxis type="category" dataKey="name" width={110} tick={{ fill: '#cbd5e1', fontSize: 11 }} />
              <Tooltip
                cursor={{ fill: '#334155' }}
                contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
                labelStyle={{ color: '#e2e8f0', fontWeight: 'bold' }}
                labelFormatter={(_, payload) => payload?.[0]?.payload?.fullName || ''}
                formatter={(v: number, name: string) => [fmt(v), name.charAt(0).toUpperCase() + name.slice(1)]}
              />
              <Legend
                iconType="circle"
                iconSize={8}
                formatter={(v) => <span style={{ color: '#94a3b8', fontSize: 11, textTransform: 'capitalize' }}>{v}</span>}
              />
              <Bar dataKey="sesuai"  stackId="a" fill={C.sesuai}  radius={[0, 0, 0, 0]} />
              <Bar dataKey="surplus" stackId="a" fill={C.surplus} />
              <Bar dataKey="defisit" stackId="a" fill={C.defisit} />
              <Bar dataKey="belum"   stackId="a" fill={C.belum}   radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Table */}
        <div className="col-span-2 overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-slate-400 border-b border-slate-700 text-xs uppercase">
                <th className="text-left py-2 pr-2">Kategori</th>
                <th className="text-right py-2 pr-2">Total</th>
                <th className="text-right py-2 pr-2">Selesai</th>
                <th className="text-right py-2">%</th>
              </tr>
            </thead>
            <tbody>
              {byKategori.map((k, i) => {
                const pct = k.total > 0 ? Math.round((k.dihitung / k.total) * 100) : 0;
                return (
                  <tr key={i} className="border-b border-slate-800">
                    <td className="py-2 pr-2">
                      <p className="text-white text-sm font-medium leading-tight">{k.kategori}</p>
                    </td>
                    <td className="py-2 pr-2 text-right font-mono text-slate-300">{fmt(k.total)}</td>
                    <td className="py-2 pr-2 text-right font-mono text-slate-300">{fmt(k.dihitung)}</td>
                    <td className="py-2 text-right">
                      <span className={`font-bold font-mono text-sm ${pct >= 100 ? 'text-emerald-400' : pct >= 50 ? 'text-yellow-400' : 'text-red-400'}`}>
                        {pct}%
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Slide config ─────────────────────────────────────────────────────────────

const SLIDE_TITLES = [
  'Ringkasan SO',
  'Top 10 Selisih',
  'Surplus & Defisit',
  'Progress Kategori',
];

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function MonitorPage() {
  const [data, setData] = useState<MonitorData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [slide, setSlide] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [progress, setProgress] = useState(0);
  const [now, setNow] = useState(new Date());
  const [transitioning, setTransitioning] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const progressRef = useRef<NodeJS.Timeout | null>(null);

  const SLIDE_COUNT = 4;
  const SLIDE_MS = 8000;
  const TICK_MS = 80;

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/monitor/resume-so', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
      setError('');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial + periodic refresh (every 5 min)
  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [fetchData]);

  // Clock
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const goTo = useCallback((idx: number) => {
    setTransitioning(true);
    setTimeout(() => {
      setSlide(((idx % SLIDE_COUNT) + SLIDE_COUNT) % SLIDE_COUNT);
      setProgress(0);
      setTransitioning(false);
    }, 300);
  }, [SLIDE_COUNT]);

  // Auto-play
  useEffect(() => {
    if (!playing) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (progressRef.current) clearInterval(progressRef.current);
      return;
    }

    setProgress(0);
    progressRef.current = setInterval(() => {
      setProgress((p) => Math.min(p + (TICK_MS / SLIDE_MS) * 100, 100));
    }, TICK_MS);

    intervalRef.current = setInterval(() => {
      goTo(slide + 1);
    }, SLIDE_MS);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (progressRef.current) clearInterval(progressRef.current);
    };
  }, [playing, slide, goTo]);

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') goTo(slide + 1);
      if (e.key === 'ArrowLeft')  goTo(slide - 1);
      if (e.key === ' ') { e.preventDefault(); setPlaying((p) => !p); }
      if (e.key === 'f' || e.key === 'F') {
        if (document.fullscreenElement) document.exitFullscreen();
        else document.documentElement.requestFullscreen();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [slide, goTo]);

  const lastUpdatedStr = data?.lastUpdated
    ? new Date(data.lastUpdated).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
    : '—';

  return (
    <div
      className="min-h-screen flex flex-col select-none"
      style={{ background: 'linear-gradient(135deg, #020617 0%, #0f172a 50%, #020617 100%)' }}
    >
      {/* ── Header ── */}
      <header className="flex items-center justify-between px-8 py-4 border-b border-slate-800">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center">
            <span className="text-white font-black text-sm">SO</span>
          </div>
          <div>
            <p className="text-white font-bold text-lg leading-tight">Stock Opname Monitor</p>
            <p className="text-slate-500 text-xs">PT EJI — Live Dashboard</p>
          </div>
        </div>

        <div className="flex items-center gap-6 text-sm">
          {data && (
            <div className="flex items-center gap-2 text-slate-400">
              <div className={`w-2 h-2 rounded-full ${loading ? 'bg-yellow-500 animate-pulse' : 'bg-emerald-500'}`} />
              <span>Diperbarui {lastUpdatedStr}</span>
            </div>
          )}
          <button
            onClick={fetchData}
            className="text-slate-400 hover:text-white transition-colors p-1"
            title="Refresh data"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
          <div className="text-right">
            <p className="text-white font-mono font-bold text-2xl leading-tight">{clock(now)}</p>
            <p className="text-slate-500 text-xs">{dateStr(now)}</p>
          </div>
        </div>
      </header>

      {/* ── Slide area ── */}
      <main className="flex-1 px-8 py-6 min-h-0 overflow-hidden">
        {loading && (
          <div className="h-full flex flex-col items-center justify-center gap-4">
            <RefreshCw size={48} className="text-blue-500 animate-spin" />
            <p className="text-slate-400 text-lg">Memuat data dari Google Sheets…</p>
          </div>
        )}

        {error && !loading && (
          <div className="h-full flex flex-col items-center justify-center gap-4">
            <p className="text-red-400 text-xl font-semibold">⚠️ Gagal memuat data</p>
            <p className="text-slate-500 font-mono text-sm">{error}</p>
            <button
              onClick={fetchData}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg transition-colors"
            >
              Coba Lagi
            </button>
          </div>
        )}

        {!loading && !error && data && (
          <div
            className="h-full transition-opacity duration-300"
            style={{ opacity: transitioning ? 0 : 1 }}
          >
            {slide === 0 && <SlideKPI stats={data.stats} />}
            {slide === 1 && <SlideTop10Selisih data={data.top10Selisih} />}
            {slide === 2 && <SlideSurplusDefisit surplus={data.top10Surplus} defisit={data.top10Defisit} />}
            {slide === 3 && <SlideKategori byKategori={data.byKategori} />}
          </div>
        )}
      </main>

      {/* ── Footer / Controls ── */}
      <footer className="border-t border-slate-800 px-8 py-3">
        {/* Slide progress bar */}
        <div className="w-full h-1 bg-slate-800 rounded-full mb-3 overflow-hidden">
          <div
            className="h-full bg-blue-500 rounded-full transition-none"
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="flex items-center justify-between">
          {/* Slide dots */}
          <div className="flex items-center gap-2">
            {Array.from({ length: SLIDE_COUNT }).map((_, i) => (
              <button
                key={i}
                onClick={() => goTo(i)}
                className={`rounded-full transition-all duration-300 ${
                  i === slide ? 'w-8 h-2 bg-blue-500' : 'w-2 h-2 bg-slate-600 hover:bg-slate-400'
                }`}
              />
            ))}
          </div>

          {/* Slide name */}
          <p className="text-slate-500 text-sm">{SLIDE_TITLES[slide]}</p>

          {/* Controls */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => goTo(slide - 1)}
              className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              onClick={() => setPlaying((p) => !p)}
              className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              {playing ? <Pause size={18} /> : <Play size={18} />}
            </button>
            <button
              onClick={() => goTo(slide + 1)}
              className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <ChevronRight size={18} />
            </button>
            <button
              onClick={() => {
                if (document.fullscreenElement) document.exitFullscreen();
                else document.documentElement.requestFullscreen();
              }}
              className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors ml-1"
              title="Fullscreen (F)"
            >
              <Maximize2 size={16} />
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
