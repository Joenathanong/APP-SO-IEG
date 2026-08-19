import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getActiveSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

/**
 * Status hitung per bin — PENGGANTI fitur "potensi double".
 *
 * Fitur lama mencocokkan barcode+lokasi dan menandai 75% baris Gudang Besar
 * sebagai "potensi double", padahal satu SKU di satu bin memang discan sekali
 * per karton. Yang benar-benar perlu dicegah adalah DUA ORANG menghitung bin
 * yang sama — dan itu terlihat dari sini, bukan dari barcode.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const qSession = searchParams.get('sessionId');
    const sesi = qSession
      ? await prisma.opnameSession.findUnique({ where: { id: parseInt(qSession, 10) } })
      : await getActiveSession();
    if (!sesi) return NextResponse.json({ session: null, items: [], stats: null });

    const [counts, binsBelum, takDikenal] = await Promise.all([
      prisma.binCount.findMany({
        where: { sessionId: sesi.id },
        include: { bin: { select: { code: true, binType: true, scanCount: true } } },
        orderBy: { countedAt: 'desc' },
      }),
      prisma.bin.count({ where: { active: true } }),
      // Scan ke bin yang tidak dikenal master — diterima (validasi longgar),
      // tapi harus terlihat supaya tidak menumpuk diam-diam.
      prisma.soEntry.groupBy({
        by: ['binCode'],
        where: { sessionId: sesi.id, binKnown: false },
        _count: { _all: true },
        _sum: { qtyPcs: true },
      }),
    ]);

    const items = counts.map((c) => ({
      id: c.id,
      binCode: c.bin.code,
      binType: c.bin.binType,
      status: c.status,
      countedBy: c.countedBy,
      countedAt: c.countedAt,
      entryCount: c.entryCount,
      totalQty: Number(c.totalQty),
      notes: c.notes,
    }));

    return NextResponse.json({
      session: { id: sesi.id, code: sesi.code, name: sesi.name, status: sesi.status },
      items,
      binTakDikenal: takDikenal.map((t) => ({
        binCode: t.binCode,
        jumlahScan: t._count._all,
        totalQty: Number(t._sum.qtyPcs ?? 0),
      })),
      stats: {
        binAktif: binsBelum,
        sudahDisentuh: items.length,
        selesai: items.filter((i) => i.status === 'SELESAI').length,
        proses: items.filter((i) => i.status === 'PROSES').length,
        belum: Math.max(0, binsBelum - items.length),
      },
    });
  } catch (e: any) {
    console.error('[bin-counts GET]', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

/** PATCH { id, status, notes } — tandai bin selesai dihitung. */
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const id = parseInt(String(body.id), 10);
    if (Number.isNaN(id)) return NextResponse.json({ error: 'id wajib' }, { status: 400 });

    const c = await prisma.binCount.update({
      where: { id },
      data: {
        ...(body.status ? { status: body.status } : {}),
        ...(body.notes !== undefined ? { notes: body.notes } : {}),
        ...(body.status === 'SELESAI' ? { countedAt: new Date() } : {}),
      },
    });
    return NextResponse.json(c);
  } catch (e: any) {
    console.error('[bin-counts PATCH]', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
