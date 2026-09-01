import { NextRequest, NextResponse } from 'next/server';
import { prisma, pesanPrisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/** GET /api/book-stock/snapshots/[id] — isi snapshot + daftar yang belum cocok. */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const id = parseInt(params.id, 10);
    if (!Number.isFinite(id)) return NextResponse.json({ error: 'id tidak valid' }, { status: 400 });

    const snap = await prisma.bookStockSnapshot.findUnique({ where: { id } });
    if (!snap) return NextResponse.json({ error: 'Snapshot tidak ditemukan.' }, { status: 404 });

    const items = await prisma.bookStock.findMany({
      where: { snapshotId: id },
      include: { material: { select: { ocsCode: true, name: true, category: true } } },
      orderBy: { rawCode: 'asc' },
      take: 5000,
    });

    return NextResponse.json({
      snapshot: {
        id: snap.id, name: snap.name, source: snap.source, fetchedAt: snap.fetchedAt,
        rowCount: snap.rowCount, matchedCount: snap.matchedCount,
        unmatchedCount: snap.unmatchedCount, totalQty: Number(snap.totalQty),
        createdBy: snap.createdBy, notes: snap.notes,
      },
      items: items.map((b) => ({
        rawCode: b.rawCode,
        ocsCode: b.material?.ocsCode ?? null,
        nama: b.material?.name ?? b.rawName ?? '',
        kategori: b.material?.category ?? null,
        sapCode: b.rawSapCode,
        qtyBook: Number(b.qtyBook),
        qtyKecil: b.qtyKecil === null ? null : Number(b.qtyKecil),
        qtyBesar: b.qtyBesar === null ? null : Number(b.qtyBesar),
        dikenal: b.materialId !== null,
      })),
    });
  } catch (e: any) {
    console.error('[snapshot GET]', e);
    return NextResponse.json({ error: pesanPrisma(e) }, { status: 500 });
  }
}

/** PATCH — ganti nama snapshot. */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const id = parseInt(params.id, 10);
    const body = await req.json();
    const nama = String(body.nama ?? '').trim();
    if (!nama) return NextResponse.json({ error: 'Nama tidak boleh kosong.' }, { status: 400 });
    const s = await prisma.bookStockSnapshot.update({ where: { id }, data: { name: nama.slice(0, 160) } });
    return NextResponse.json({ success: true, snapshot: { id: s.id, name: s.name } });
  } catch (e: any) {
    console.error('[snapshot PATCH]', e);
    return NextResponse.json({ error: pesanPrisma(e) }, { status: 500 });
  }
}

/**
 * DELETE — hapus snapshot beserta isinya.
 *
 * DITOLAK bila masih ada sesi yang memakainya. Menghapus pembanding milik sesi
 * berjalan akan membuat seluruh angka selisihnya berubah tanpa jejak, dan itu
 * jenis kerusakan yang tidak bisa dibatalkan.
 */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const id = parseInt(params.id, 10);
    const dipakai = await prisma.opnameSession.findMany({
      where: { bookSnapshotId: id }, select: { code: true, name: true },
    });
    if (dipakai.length > 0) {
      return NextResponse.json(
        {
          error:
            `Snapshot ini masih dipakai ${dipakai.length} sesi (${dipakai.map((s) => s.code).join(', ')}). ` +
            'Pilih snapshot lain untuk sesi tersebut dulu, baru hapus.',
        },
        { status: 409 }
      );
    }
    // relationMode = "prisma": TiDB tidak menegakkan foreign key, jadi baris
    // anak WAJIB dihapus sendiri. Kalau tidak, isinya jadi yatim selamanya.
    await prisma.bookStock.deleteMany({ where: { snapshotId: id } });
    await prisma.bookStockSnapshot.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error('[snapshot DELETE]', e);
    return NextResponse.json({ error: pesanPrisma(e) }, { status: 500 });
  }
}
