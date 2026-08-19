import { prisma } from '@/lib/prisma';

/**
 * Sesi opname yang sedang terbuka.
 *
 * Hanya boleh ada SATU sesi berstatus OPEN pada satu waktu — ditegakkan database
 * lewat kolom `openGuard` (unique, diisi 1 saat OPEN dan NULL selain itu).
 * Operator tidak memilih sesi; sistem yang menentukan, sehingga alur scan tidak
 * bertambah satu langkah pun.
 */
export async function getActiveSession() {
  return prisma.opnameSession.findFirst({ where: { status: 'OPEN' } });
}

export class NoActiveSessionError extends Error {
  constructor() {
    super('Belum ada sesi opname yang dibuka');
    this.name = 'NoActiveSessionError';
  }
}

/**
 * Nomor sesi berikutnya: SO-<tahun>-<bulan>-<urut 3 digit>.
 * Dihitung dari sesi terakhir di bulan yang sama, bukan dari jumlah total,
 * supaya penomoran tetap benar walau ada sesi yang dihapus.
 */
export async function nextSessionCode(now = new Date()): Promise<string> {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const prefix = `SO-${y}-${m}-`;
  const last = await prisma.opnameSession.findFirst({
    where: { code: { startsWith: prefix } },
    orderBy: { code: 'desc' },
    select: { code: true },
  });
  const n = last ? parseInt(last.code.slice(prefix.length), 10) + 1 : 1;
  return prefix + String(n).padStart(3, '0');
}
