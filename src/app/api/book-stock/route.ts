import { NextRequest, NextResponse } from 'next/server';
import { prisma, pesanPrisma } from '@/lib/prisma';
import { getActiveSession } from '@/lib/session';
import { simpanSnapshot, BarisSumber } from '@/lib/book-stock';

export const dynamic = 'force-dynamic';

/**
 * GET /api/book-stock?sessionId — saldo buku yang BERLAKU untuk sesi tersebut.
 *
 * Sumbernya kini snapshot yang ditunjuk sesi, bukan baris milik sesi. Sesi tanpa
 * snapshot mengembalikan daftar kosong dengan penjelasannya — bukan error.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const qs = searchParams.get('sessionId');
    const sesi = qs
      ? await prisma.opnameSession.findUnique({ where: { id: parseInt(qs, 10) } })
      : await getActiveSession();
    if (!sesi) return NextResponse.json({ session: null, snapshot: null, items: [] });

    if (!sesi.bookSnapshotId) {
      return NextResponse.json({
        session: { id: sesi.id, code: sesi.code, name: sesi.name, status: sesi.status },
        snapshot: null,
        items: [],
        pesan: 'Sesi ini belum menunjuk snapshot saldo buku.',
      });
    }

    const [snap, items] = await Promise.all([
      prisma.bookStockSnapshot.findUnique({ where: { id: sesi.bookSnapshotId } }),
      prisma.bookStock.findMany({
        where: { snapshotId: sesi.bookSnapshotId },
        include: { material: { select: { ocsCode: true, name: true, category: true } } },
        orderBy: { rawCode: 'asc' },
        take: 5000,
      }),
    ]);

    return NextResponse.json({
      session: { id: sesi.id, code: sesi.code, name: sesi.name, status: sesi.status },
      snapshot: snap && {
        id: snap.id, name: snap.name, source: snap.source, fetchedAt: snap.fetchedAt,
        rowCount: snap.rowCount, matchedCount: snap.matchedCount, unmatchedCount: snap.unmatchedCount,
      },
      items: items.map((b) => ({
        materialId: b.materialId,
        ocsCode: b.material?.ocsCode ?? b.rawCode,
        name: b.material?.name ?? b.rawName ?? '',
        category: b.material?.category ?? null,
        qtyBook: Number(b.qtyBook),
        qtyKecil: b.qtyKecil === null ? null : Number(b.qtyKecil),
        qtyBesar: b.qtyBesar === null ? null : Number(b.qtyBesar),
        rawCode: b.rawCode,
        dikenal: b.materialId !== null,
      })),
    });
  } catch (e: any) {
    console.error('[book-stock GET]', e);
    return NextResponse.json({ error: pesanPrisma(e) }, { status: 500 });
  }
}

/**
 * POST /api/book-stock  { sessionId?, nama?, rows: [{kode, qty}], pakai?: boolean }
 *
 * Jalur CADANGAN lewat file .xlsx, dipertahankan supaya opname tetap jalan saat
 * OCS tidak bisa dihubungi. Hasilnya kini berupa snapshot bernama, sama seperti
 * tarikan OCS — jadi bisa dipakai ulang dan tidak menimpa apa pun.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const rows = (body.rows ?? []) as BarisSumber[];
    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: 'Tidak ada baris untuk di-import' }, { status: 400 });
    }

    const sesi = body.sessionId
      ? await prisma.opnameSession.findUnique({ where: { id: parseInt(String(body.sessionId), 10) } })
      : await getActiveSession();

    const dasar = String(body.nama ?? '').trim() || `upload-${sesi?.name ?? new Date().toISOString().slice(0, 16)}`;
    let nama = dasar.slice(0, 160);
    for (let i = 2; await prisma.bookStockSnapshot.findUnique({ where: { name: nama } }); i++) {
      nama = `${dasar} (${i})`.slice(0, 160);
    }

    const hasil = await simpanSnapshot({
      nama,
      sumber: 'UPLOAD',
      baris: rows,
      originSessionId: sesi?.id ?? null,
      createdBy: body.createdBy ?? null,
      notes: 'Diunggah dari file.',
    });

    // Sengaja TIDAK otomatis dipakai kecuali diminta: mengganti pembanding sesi
    // yang sedang berjalan harus selalu keputusan sadar.
    if (body.pakai && sesi) {
      await prisma.opnameSession.update({ where: { id: sesi.id }, data: { bookSnapshotId: hasil.id } });
    }

    return NextResponse.json({
      success: true,
      session: sesi ? { id: sesi.id, code: sesi.code } : null,
      snapshot: hasil,
      dipakai: Boolean(body.pakai && sesi),
      dibaca: rows.length,
      tersimpan: hasil.rowCount,
      tidakDikenal: hasil.unmatchedCount,
    });
  } catch (e: any) {
    console.error('[book-stock POST]', e);
    return NextResponse.json({ error: pesanPrisma(e) }, { status: 500 });
  }
}
