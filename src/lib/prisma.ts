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


/**
 * Terjemahkan error Prisma jadi kalimat yang menyebutkan APA YANG HARUS
 * DILAKUKAN.
 *
 * Kode mentah seperti P2021 muncul di layar sebagai "HTTP 500", dan pesan
 * aslinya ("The table `opname_sessions` does not exist") hanya ada di log
 * server. Padahal perbaikannya satu perintah. Jarak antara gejala dan tindakan
 * itulah yang paling banyak memakan waktu selama pengembangan ini.
 */
export function pesanPrisma(e: any): string {
  const kode = e?.code;
  const pesan = String(e?.message ?? e ?? '');

  // KOLOM diperiksa LEBIH DULU: pesan P2022 memuat frasa yang sama dengan P2021
  // ("does not exist in the current database"), jadi urutan terbalik akan
  // melaporkan kolom yang hilang sebagai tabel yang hilang.
  if (kode === 'P2022' || /column `?[\w.]+`? does not exist/i.test(pesan)) {
    const kolom = pesan.match(/column `?([\w.]+)`?/i)?.[1];
    return (
      `Kolom${kolom ? ` \`${kolom}\`` : ''} belum ada di database. ` +
      `Skema berubah tapi belum diterapkan — jalankan: npm run db:push`
    );
  }
  if (kode === 'P2021' || /table `?[\w.]+`? does not exist/i.test(pesan)) {
    const tabel = pesan.match(/table `?([\w.]+)`?/i)?.[1];
    return (
      `Tabel${tabel ? ` \`${tabel}\`` : ''} belum ada di database. ` +
      `Skema belum pernah diterapkan — jalankan: npm run db:push`
    );
  }
  if (kode === 'P1001' || /Can't reach database server/i.test(pesan)) {
    return (
      'Database tidak terjangkau. Periksa apakah cluster TiDB hidup, jaringan Anda ' +
      'mengizinkan port 4000, dan IP Access List di TiDB Cloud mengizinkan alamat Anda.'
    );
  }
  if (kode === 'P1000' || /Authentication failed/i.test(pesan)) {
    return 'Kredensial database ditolak. Periksa user dan password di DATABASE_URL — jalankan: npm run check:db';
  }
  if (/Environment variable not found: DATABASE_URL/i.test(pesan)) {
    return 'DATABASE_URL belum terisi. Periksa .env (dan pastikan .env.local tidak menimpanya).';
  }
  if (kode === 'P2002') return 'Data dengan nilai unik yang sama sudah ada.';
  if (kode === 'P2025') return 'Data yang dituju tidak ditemukan.';
  return pesan || 'Kesalahan tidak dikenal pada database.';
}
