import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
try {
  const sesi = await p.opnameSession.findMany({
    select: { id: true, code: true, name: true, status: true, createdAt: true, bookSnapshotId: true },
    orderBy: { createdAt: 'desc' }, take: 10,
  });
  const total = await p.soEntry.count();
  const perSesi = await p.soEntry.groupBy({ by: ['sessionId'], _count: { _all: true }, _min: { scannedAt: true }, _max: { scannedAt: true } });
  console.log('SESI:', JSON.stringify(sesi, null, 1));
  console.log('TOTAL soEntry:', total);
  console.log('PER SESI:', JSON.stringify(perSesi, null, 1));
  console.log('SEKARANG (UTC):', new Date().toISOString());
} catch (e) {
  console.log('GAGAL:', e.message.split('\n')[0]);
} finally { await p.$disconnect(); }
