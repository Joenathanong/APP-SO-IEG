'use client';
import { useState } from 'react';
import { Calendar } from 'lucide-react';
import { Button } from '@/components/ui/Button';

interface DateRangePickerProps {
  startDate: string;
  endDate: string;
  onChange: (start: string, end: string) => void;
}

export function DateRangePicker({ startDate, endDate, onChange }: DateRangePickerProps) {
  const [start, setStart] = useState(startDate);
  const [end, setEnd] = useState(endDate);

  const handleApply = () => {
    if (start && end && start <= end) {
      onChange(start, end);
    }
  };

  const setPreset = (days: number) => {
    const endD = new Date();
    const startD = new Date();
    startD.setDate(startD.getDate() - (days - 1));
    const fmt = (d: Date) => d.toISOString().split('T')[0];
    setStart(fmt(startD));
    setEnd(fmt(endD));
    onChange(fmt(startD), fmt(endD));
  };

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div>
        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
          Tanggal Mulai
        </label>
        <input
          type="date"
          value={start}
          onChange={(e) => setStart(e.target.value)}
          className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
          Tanggal Akhir
        </label>
        <input
          type="date"
          value={end}
          onChange={(e) => setEnd(e.target.value)}
          className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
      <Button onClick={handleApply} size="sm">
        <Calendar size={14} />
        Terapkan
      </Button>
      <div className="flex gap-1.5">
        {[7, 14, 30].map((d) => (
          <button
            key={d}
            onClick={() => setPreset(d)}
            className="px-2.5 py-1.5 text-xs border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400 transition-colors"
          >
            {d}H
          </button>
        ))}
      </div>
    </div>
  );
}
