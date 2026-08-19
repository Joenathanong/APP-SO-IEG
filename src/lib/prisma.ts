import { PrismaClient } from '@prisma/client';

/**
 * Prisma client tunggal.
 *
 * Di Vercel serverless, setiap invocation berpotensi membuat client baru dan
 * menghabiskan kuota koneksi TiDB. Menyimpannya di globalThis membuat instance
 * yang sama dipakai ulang selama container masih hangat. Ini penyebab kegagalan
 * paling umum pada kombinasi Prisma + serverless + database serverless, jadi
 * jangan diganti dengan `new PrismaClient()` di tiap route.
 *
 * Batas koneksi diatur lewat DATABASE_URL, mis. `&connection_limit=1`.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

/**
 * Jalankan operasi tulis dengan retry untuk write conflict TiDB.
 *
 * TiDB memakai optimistic transaction; dua transaksi yang menyentuh baris sama
 * bisa gagal dengan error 9007 "Write conflict" atau 8027. Pada beban dua shift
 * ini bukan kemungkinan teoretis. Retry dipasang sejak awal — bukan ditambal
 * setelah kejadian pertama di lapangan.
 */
export async function withWriteRetry<T>(fn: () => Promise<T>, attempts = 4): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err: any) {
      lastErr = err;
      const msg = String(err?.message ?? '');
      const retryable =
        msg.includes('9007') ||
        msg.includes('8027') ||
        /write conflict/i.test(msg) ||
        /try again later/i.test(msg);
      if (!retryable || i === attempts - 1) break;
      await new Promise((r) => setTimeout(r, 60 * Math.pow(2, i) + Math.floor(Math.random() * 40)));
    }
  }
  throw lastErr;
}
