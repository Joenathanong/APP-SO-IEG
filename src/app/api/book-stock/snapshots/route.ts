import { NextRequest, NextResponse } from 'next/server';
import { prisma, pesanPrisma } from '@/lib/prisma';
import { simpanSnapshot, tarikDanSimpan, BarisSumber } from '@/lib/book-stock';
import { OcsError } from '@/lib/ocs';
import { getActiveSession } from '@/lib/session';

export const dynamic = 'force-dynamic';
/*
 * Penarikan OCS memakan waktu: 2.467 baris diambil lewat jaringan, lalu ~2.400
 * baris ditulis ke TiDB Singapura. Batas bawaan fungsi Vercel 10 detik hampir
 * pasti tidak cukup, dan yang muncul nanti hanya "504" tanpa penjelasan.
 * Penulisannya sendiri sudah hemat: createMany = satu INSERT untuk 500 baris,
 * jadi seluruh isi snapshot cuma 5 perjalanan bolak-balik, bukan 2.400.
 */
export const maxDuration = 60;


/** GET /api/book-stock/snapshots — semua snapshot tersimpan, terbaru dulu. */
export async function GET() {
  try {
    const [daftar, sesi] = await Promise.all([
      prisma.bookStockSnapshot.findMany({ orderBy: { fetchedAt: 'desc' }, take: 200 }),
      getActiveSession(),
    ]);
    return NextResponse.json({
      snapshots: daftar.map((s) => ({
        id: s.id, name: s.name, source: s.source,
        fetchedAt: s.fetchedAt, rowCount: s.rowCount,
        matchedCount: s.matchedCount, unmatchedCount: s.unmatchedCount,
        totalQty: Number(s.totalQty), createdBy: s.createdBy, notes: s.notes,
        originSessionId: s.originSessionId,
      })),
      sesiAktif: sesi
        ? { id: sesi.id, code: sesi.code, name: sesi.name, status: sesi.status, bookSnapshotId: sesi.bookSnapshotId }
        : null,
    });
  } catch (e: any) {
    console.error('[snapshots GET]', e);
    return NextResponse.json({ error: pesanPrisma(e) }, { status: 500 });
  }
}

/**
 * POST /api/book-stock/snapshots
 *   { sumber: 'ocs',    nama?, sessionId?, createdBy? }
 *   { sumber: 'upload', nama,  rows: [{kode, qty}], createdBy? }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const createdBy = body.createdBy ?? null;

    if (body.sumber === 'ocs') {
      const sesi = body.sessionId
        ? await prisma.opnameSession.findUnique({ where: { id: Number(body.sessionId) } })
        : await getActiveSession();
      const namaDasar = String(body.nama ?? '').trim() || sesi?.name || new Date().toISOString().slice(0, 16);
      const hasil = await tarikDanSimpan({ namaSesi: namaDasar, sessionId: sesi?.id ?? null, createdBy });
      return NextResponse.json({ success: true, snapshot: hasil }, { status: 201 });
    }

    const rows = (body.rows ?? []) as BarisSumber[];
    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: 'Tidak ada baris untuk disimpan.' }, { status: 400 });
    }
    const nama = String(body.nama ?? '').trim();
    if (!nama) return NextResponse.json({ error: 'Nama snapshot wajib diisi.' }, { status: 400 });

    const hasil = await simpanSnapshot({ nama, sumber: 'UPLOAD', baris: rows, createdBy });
    return NextResponse.json({ success: true, snapshot: hasil }, { status: 201 });
  } catch (e: any) {
    if (e instanceof OcsError) {
      // 502 dan BUKAN 500: masalahnya di sistem seberang, bukan di aplikasi ini.
      // Sebabnya ikut dikirim supaya layar bisa menyarankan tindakan yang tepat.
      return NextResponse.json({ error: e.message, sebab: e.sebab }, { status: 502 });
    }
    console.error('[snapshots POST]', e);
    return NextResponse.json({ error: pesanPrisma(e) }, { status: 500 });
  }
}
