import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { tautkanUlangDiamDiam } from '@/lib/match-material';
import { normalizeCode } from '@/lib/normalize';

export const dynamic = 'force-dynamic';

function bentuk(m: any) {
  return {
    id: m.id, ocsCode: m.ocsCode, name: m.name, category: m.category,
    sapCodeIeg: m.sapCodeIeg, sapCodeEji: m.sapCodeEji,
    barcodeProduct: m.barcodeProduct, barcodeBpom: m.barcodeBpom,
    active: m.active, source: m.source, reviewNote: m.reviewNote,
  };
}

/** GET /api/materials?q=&active=&page=&pageSize=&all=true */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const q = (searchParams.get('q') ?? '').trim();
    const filterAktif = searchParams.get('active');
    const semua = searchParams.get('all') === 'true';
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
    const pageSize = Math.min(200, Math.max(10, parseInt(searchParams.get('pageSize') ?? '50', 10)));

    const nq = normalizeCode(q);
    const where: any = {
      ...(filterAktif === 'true' ? { active: true } : filterAktif === 'false' ? { active: false } : {}),
      ...(q
        ? {
            OR: [
              { ocsCode: { contains: q } },
              { name: { contains: q } },
              { category: { contains: q } },
              ...(nq
                ? [
                    { normSapIeg: { contains: nq } },
                    { normSapEji: { contains: nq } },
                    { normBarcodeProduct: { contains: nq } },
                    { normBarcodeBpom: { contains: nq } },
                  ]
                : []),
            ],
          }
        : {}),
    };

    // `all=true` dipakai tombol Export — mengambil seluruh baris sekaligus.
    if (semua) {
      const rows = await prisma.material.findMany({ where, orderBy: { ocsCode: 'asc' }, take: 20000 });
      return NextResponse.json({ total: rows.length, page: 1, pageSize: rows.length, items: rows.map(bentuk) });
    }

    const [total, rows] = await Promise.all([
      prisma.material.count({ where }),
      prisma.material.findMany({
        where, orderBy: { ocsCode: 'asc' },
        skip: (page - 1) * pageSize, take: pageSize,
      }),
    ]);
    return NextResponse.json({ total, page, pageSize, items: rows.map(bentuk) });
  } catch (e: any) {
    console.error('[materials GET]', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

/** Kolom norm* SELALU diturunkan di sini — tidak pernah diisi dari input. */
function turunkan(b: any) {
  return {
    ocsCode: String(b.ocsCode).trim(),
    name: String(b.name ?? b.ocsCode).trim(),
    category: b.category?.trim() || null,
    sapCodeIeg: b.sapCodeIeg?.trim() || null,
    sapCodeEji: b.sapCodeEji?.trim() || null,
    barcodeProduct: b.barcodeProduct?.trim() || null,
    barcodeBpom: b.barcodeBpom?.trim() || null,
    normOcsCode: normalizeCode(b.ocsCode),
    normSapIeg: normalizeCode(b.sapCodeIeg) || null,
    normSapEji: normalizeCode(b.sapCodeEji) || null,
    normBarcodeProduct: normalizeCode(b.barcodeProduct) || null,
    normBarcodeBpom: normalizeCode(b.barcodeBpom) || null,
    active: b.active === undefined ? true : Boolean(b.active),
    reviewNote: b.reviewNote?.trim() || null,
  };
}

export async function POST(req: NextRequest) {
  try {
    const b = await req.json();
    if (!b.ocsCode?.trim()) return NextResponse.json({ error: 'Kode OCS wajib diisi' }, { status: 400 });

    const m = await prisma.material.create({ data: { ...turunkan(b), source: 'manual' } });

    // Master bertambah -> scan lama yang belum dikenal dicoba ditautkan lagi.
    // Tanpa ini, barang yang baru didaftarkan tetap tampil "belum dikenal" di
    // Data SO padahal masternya sudah ada.
    const taut = await tautkanUlangDiamDiam();
    return NextResponse.json({ ...bentuk(m), taut }, { status: 201 });
  } catch (e: any) {
    if (e?.code === 'P2002') {
      return NextResponse.json({ error: 'Kode OCS ini sudah ada.' }, { status: 409 });
    }
    console.error('[materials POST]', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const b = await req.json();
    const id = parseInt(String(b.id), 10);
    if (Number.isNaN(id)) return NextResponse.json({ error: 'id wajib' }, { status: 400 });

    const lama = await prisma.material.findUnique({ where: { id } });
    if (!lama) return NextResponse.json({ error: 'Material tidak ditemukan' }, { status: 404 });

    const m = await prisma.material.update({
      where: { id },
      data: turunkan({ ...lama, ...b, ocsCode: b.ocsCode ?? lama.ocsCode }),
    });

    // Menyunting barcode atau kode SAP bisa membuat scan yang tadinya tidak
    // dikenal jadi cocok. Kolom SKU OCS sendiri tidak perlu disegarkan: ia
    // dibaca lewat relasi, jadi perubahan nama/kode langsung ikut.
    const taut = await tautkanUlangDiamDiam();
    return NextResponse.json({ ...bentuk(m), taut });
  } catch (e: any) {
    if (e?.code === 'P2002') {
      return NextResponse.json({ error: 'Kode OCS ini sudah dipakai material lain.' }, { status: 409 });
    }
    console.error('[materials PATCH]', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
