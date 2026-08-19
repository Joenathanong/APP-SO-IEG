import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { normalizeBin, normalizeCode } from '@/lib/normalize';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const q = searchParams.get('q');
    const aktifSaja = searchParams.get('active') === 'true';

    const bins = await prisma.bin.findMany({
      where: {
        ...(aktifSaja ? { active: true } : {}),
        ...(q ? { normCode: { contains: normalizeCode(normalizeBin(q)) } } : {}),
      },
      orderBy: [{ scanCount: 'desc' }, { code: 'asc' }],
      take: q ? 50 : 2000,
    });

    // `binCode`/`description`/`warehouse` disertakan agar halaman admin lama
    // yang mengenal bentuk Master_Bin tetap bisa membacanya tanpa diubah total.
    return NextResponse.json(
      bins.map((b) => ({
        id: b.id,
        code: b.code,
        binCode: b.code,
        description: b.description ?? '',
        warehouse: b.warehouse ?? '',
        binType: b.binType,
        scanCount: b.scanCount,
        needsReview: b.needsReview,
        active: b.active,
        variants: b.variants,
      }))
    );
  } catch (e: any) {
    console.error('[bins GET]', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const raw = (body.code ?? body.binCode ?? '').toString().trim();
    if (!raw) return NextResponse.json({ error: 'Kode bin wajib diisi' }, { status: 400 });

    const normCode = normalizeBin(raw);
    const code = raw.toUpperCase().slice(0, 160);

    // Bin dikunci oleh bentuk ternormalisasi, sehingga "RACKING BAK" dan
    // "RACKING-BAK" tidak bisa masuk sebagai dua bin berbeda.
    const sudahAda = await prisma.bin.findUnique({ where: { normCode } });
    if (sudahAda) {
      return NextResponse.json(
        { error: `Bin ini sudah ada dengan penulisan "${sudahAda.code}".` },
        { status: 409 }
      );
    }

    const bin = await prisma.bin.create({
      data: {
        code, normCode,
        binType: body.binType ?? null,
        warehouse: body.warehouse ?? null,
        description: body.description ?? null,
        active: body.active === undefined ? true : Boolean(body.active),
        needsReview: false,
      },
    });
    return NextResponse.json(bin, { status: 201 });
  } catch (e: any) {
    console.error('[bins POST]', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const id = parseInt(String(body.id), 10);
    if (Number.isNaN(id)) return NextResponse.json({ error: 'id wajib' }, { status: 400 });

    const data: any = {};
    if (body.code || body.binCode) {
      const raw = (body.code ?? body.binCode).toString().trim();
      data.code = raw.toUpperCase().slice(0, 160);
      data.normCode = normalizeBin(raw);
    }
    if (body.warehouse !== undefined) data.warehouse = body.warehouse || null;
    if (body.description !== undefined) data.description = body.description || null;
    if (body.binType !== undefined) data.binType = body.binType || null;
    if (body.active !== undefined) data.active = Boolean(body.active);
    if (body.needsReview !== undefined) data.needsReview = Boolean(body.needsReview);

    const bin = await prisma.bin.update({ where: { id }, data });
    return NextResponse.json(bin);
  } catch (e: any) {
    if (e?.code === 'P2002') {
      return NextResponse.json({ error: 'Sudah ada bin lain dengan penulisan yang setara.' }, { status: 409 });
    }
    console.error('[bins PATCH]', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
