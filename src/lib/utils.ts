import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { ParsedBarcodeGB } from '@/types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function parseGudangBesarBarcode(raw: string): ParsedBarcodeGB | null {
  // Hapus karakter kontrol PDT (GS, RS, FS, dll) kecuali separator yang dikenal
  const cleaned = raw
    .trim()
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1a\x1c-\x1f\x7f]/g, '') // strip control chars
    .replace(/；/g, ';')   // fullwidth semicolon → regular semicolon
    .replace(/\t/g, ';')   // tab → semicolon
    .replace(/\|/g, ';')   // pipe → semicolon (beberapa PDT pakai pipe)
    .replace(/,/g, ';');   // comma fallback → semicolon

  const fields = cleaned.split(';').map(f => f.trim()).filter((_, i, arr) => {
    // Jangan filter field terakhir yang kosong (WH opsional)
    return i < arr.length - 1 || arr[i] !== '';
  });

  // Minimal 7 field (WH di field ke-8 bersifat opsional)
  if (fields.length < 7) return null;

  const qty = parseFloat(fields[3]);
  if (isNaN(qty) || qty <= 0) return null;

  return {
    materialId:  fields[0],
    batchDoc:    fields[1],
    unitCtn:     fields[2],
    qtyPerBox:   qty,
    unitPcs:     fields[4],
    barcode:     fields[5],
    description: fields[6],
    wh:          fields[7] ?? '',
  };
}

/** Untuk debug: tampilkan karakter hex dari string barcode */
export function debugBarcode(raw: string): string {
  return Array.from(raw)
    .map(c => c.charCodeAt(0) > 31 && c.charCodeAt(0) < 127 ? c : `[${c.charCodeAt(0).toString(16).toUpperCase()}]`)
    .join('');
}

export function formatQty(n: number): string {
  return Number.isInteger(n) ? n.toString() : n.toString();
}

export function formatTimestamp(): string {
  return new Date().toISOString();
}

export function formatDate(): string {
  const d = new Date();
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
}

export function formatCountdown(ms: number): string {
  if (ms <= 0) return '00:00';
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2,'0')}:${String(seconds).padStart(2,'0')}`;
}
