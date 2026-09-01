import { NextRequest, NextResponse } from 'next/server';
import { prisma, pesanPrisma } from '@/lib/prisma';
import { nextSessionCode } from '@/lib/session';
import { tarikDanSimpan } from '@/lib/book-stock';
import { OcsError } from '@/lib/ocs';

export const dynamic = 'force-dynamic';
/*
 * Penarikan OCS memakan waktu: 2.467 baris diambil lewat jaringan, lalu ~2.400
 * baris ditulis ke TiDB Singapura. Batas bawaan fungsi Vercel 10 detik hampir
 * pasti tidak cukup, dan yang muncul nanti hanya "504" tanpa penjelasan.
 * Penulisannya sendiri sudah hemat: createMany = satu INSERT untuk 500 baris,
 * jadi seluruh isi snapshot cuma 5 perjalanan bolak-balik, bukan 2.400.
 */
export const maxDuration = 60;


export async function GET() {
  try {
    const sessions = await prisma.opnameSession.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { entries: true } },
        bookSnapshot: { select: { id: true, name: true, rowCount: true, matchedCount: true, unmatchedCount: true, fetchedAt: true } },
      },
    });
    return NextResponse.json(
      sessions.map((s) => ({
        id: s.id,
        code: s.code,
        name: s.name,
        status: s.status,
        startedAt: s.startedAt,
        endedAt: s.endedAt,
        createdBy: s.createdBy,
        notes: s.notes,
        jumlahScan: s._count.entries,
        jumlahSaldoBuku: s.bookSnapshot?.matchedCount ?? 0,
        snapshot: s.bookSnapshot
          ? {
              id: s.bookSnapshot.id, name: s.bookSnapshot.name,
              rowCount: s.bookSnapshot.rowCount, matchedCount: s.bookSnapshot.matchedCount,
              unmatchedCount: s.bookSnapshot.unmatchedCount, fetchedAt: s.bookSnapshot.fetchedAt,
            }
          : null,
      }))
    );
  } catch (e: any) {
    console.error('[sessions GET]', e);
    return NextResponse.json({ error: pesanPrisma(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, createdBy, notes } = body as { name?: string; createdBy?: string; notes?: string };
    if (!createdBy) return NextResponse.json({ error: 'createdBy wajib diisi' }, { status: 400 });

    const code = await nextSessionCode();
    const s = await prisma.opnameSession.create({
      data: { code, name: name?.trim() || code, createdBy, notes: notes || null, status: 'DRAFT' },
    });

    /*
     * Tarik saldo buku dari OCS begitu sesi dibuat.
     *
     * Kegagalannya SENGAJA tidak menggagalkan pembuatan sesi. Sesi yang tidak
     * jadi terbuat berarti operator tidak bisa scan sama sekali; pembanding yang
     * datang terlambat hanya berarti angka selisih belum bisa dilihat. Yang
     * kedua jauh lebih murah, dan bisa dibereskan lewat tombol tarik ulang.
     *
     * Yang dikembalikan memuat status penarikan, supaya layar bisa mengatakan
     * apa yang sebenarnya terjadi alih-alih diam.
     */
    let snapshot: any = null;
    let ocsError: { pesan: string; sebab: string } | null = null;
    if (body.tarikOcs !== false) {
      try {
        const hasil = await tarikDanSimpan({ namaSesi: s.name, sessionId: s.id, createdBy });
        await prisma.opnameSession.update({ where: { id: s.id }, data: { bookSnapshotId: hasil.id } });
        snapshot = hasil;
      } catch (e: any) {
        ocsError = {
          pesan: e instanceof OcsError ? e.message : `Gagal menarik stok OCS: ${e?.message ?? e}`,
          sebab: e instanceof OcsError ? e.sebab : 'server',
        };
        console.error('[sessions POST] tarik OCS gagal', e);
      }
    }

    return NextResponse.json({ ...s, bookSnapshotId: snapshot?.id ?? null, snapshot, ocsError }, { status: 201 });
  } catch (e: any) {
    console.error('[sessions POST]', e);
    return NextResponse.json({ error: pesanPrisma(e) }, { status: 500 });
  }
}
