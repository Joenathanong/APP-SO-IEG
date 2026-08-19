import Dexie, { Table } from 'dexie';
import { OfflineQueueItem } from '@/types';

class StockOpnameDB extends Dexie {
  offlineQueue!: Table<OfflineQueueItem>;
  constructor() {
    super('StockOpnameDB');
    this.version(1).stores({
      offlineQueue: '++id, type, createdAt, attempts',
    });
    // Catatan: `lastError` sengaja TIDAK di-index, jadi tidak perlu menaikkan
    // versi skema — Dexie menyimpan field non-index apa adanya dan data lama
    // tetap terbaca.
  }
}

export const db = typeof window !== 'undefined' ? new StockOpnameDB() : null;

/** Dipancarkan setiap kali isi antrean berubah agar badge di TopBar langsung akurat. */
export const QUEUE_CHANGED_EVENT = 'so-queue-changed';

function notifyQueueChanged() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(QUEUE_CHANGED_EVENT));
}

export async function addToQueue(item: Omit<OfflineQueueItem, 'id'>): Promise<number | undefined> {
  if (!db) return undefined;
  const key = await db.offlineQueue.add(item as OfflineQueueItem);
  notifyQueueChanged();
  return key as number;
}

export async function getQueue(): Promise<OfflineQueueItem[]> {
  if (!db) return [];
  return await db.offlineQueue.orderBy('createdAt').toArray();
}

export async function removeFromQueue(id: number): Promise<void> {
  if (!db) return;
  await db.offlineQueue.delete(id);
  notifyQueueChanged();
}

export async function updateAttempts(id: number, attempts: number, lastError?: string): Promise<void> {
  if (!db) return;
  await db.offlineQueue.update(id, { attempts, lastAttempt: Date.now(), lastError });
}

export async function getQueueCount(): Promise<number> {
  if (!db) return 0;
  return await db.offlineQueue.count();
}

/** Antrean diekspor apa adanya untuk penyelamatan manual bila sync mentok. */
export async function exportQueue(): Promise<string> {
  const items = await getQueue();
  return JSON.stringify(items, null, 2);
}
