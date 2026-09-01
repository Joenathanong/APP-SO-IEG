import { NextRequest, NextResponse } from 'next/server';
import { prisma, pesanPrisma } from '@/lib/prisma';
import { nextSessionCode } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const sessions = await prisma.opnameSession.findMany({
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { entries: true, bookStocks: true } } },
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
        jumlahSaldoBuku: s._count.bookStocks,
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
    return NextResponse.json(s, { status: 201 });
  } catch (e: any) {
    console.error('[sessions POST]', e);
    return NextResponse.json({ error: pesanPrisma(e) }, { status: 500 });
  }
}
