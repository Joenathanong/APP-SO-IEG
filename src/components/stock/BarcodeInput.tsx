'use client';
import { useRef, useEffect } from 'react';
import { ScanLine } from 'lucide-react';

interface BarcodeInputProps {
  label: string;
  placeholder?: string;
  onScan: (value: string) => void;
  disabled?: boolean;
  autoFocus?: boolean;
}

export function BarcodeInput({ label, placeholder, onScan, disabled, autoFocus }: BarcodeInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus && !disabled) {
      const timer = setTimeout(() => inputRef.current?.focus(), 100);
      return () => clearTimeout(timer);
    }
  }, [autoFocus, disabled]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && inputRef.current?.value.trim()) {
      onScan(inputRef.current.value.trim());
      inputRef.current.value = '';
    }
  };

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
        {label}
      </label>
      <div className="relative">
        <ScanLine className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
        <input
          ref={inputRef}
          type="text"
          disabled={disabled}
          placeholder={placeholder || 'Scan barcode...'}
          onKeyDown={handleKeyDown}
          className="w-full pl-10 pr-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-lg font-mono transition-colors"
        />
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Tekan Enter setelah scan</p>
    </div>
  );
}
