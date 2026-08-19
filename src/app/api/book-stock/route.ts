import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { normalizeCode } from '@/lib/normalize';
import { getActiveSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

/** GET /api/book-stock?sessionId — saldo buku yang sudah ter-import. */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const qs = searchParams.get('sessionId');
    const sesi = qs
      ? await prisma.opnameSession.findUnique({ where: { id: parseInt(qs, 10) } })
      : await getActiveSession();
    if (!sesi) return NextResponse.json({ session: null, items: [] });

    const items = await prisma.bookStock.findMany({
      where: { sessionId: sesi.id },
      include: { material: { select: { ocsCode: true, name: true, category: true } } },
      orderBy: { material: { ocsCode: 'asc' } },
      take: 5000,
    });

    return NextResponse.json({
      session: { id: sesi.id, code: sesi.code, name: sesi.name, status: sesi.status },
      items: items.map((b) => ({
        materialId: b.materialId,
        ocsCode: b.material.ocsCode,
        name: b.material.name,
        category: b.material.category,
        qtyBook: Number(b.qtyBook),
        rawCode: b.rawCode,
      })),
    });
  } catch (e: any) {
    console.error('[book-stock GET]', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

type BarisImport = { kode: string; qty: number };

/**
 * POST /api/book-stock  { sessionId?, rows: [{kode, qty}], replace?: boolean }
 *
 * Saldo buku = kolom "Qty On Hand" dari export OCS. Audit membuktikan nilai itu
 * identik dengan kolom "Jumlah OCS" yang selama ini dipakai (361 cocok, 0 beda).
 *
 * Kode dicocokkan ke material lewat kode OCS, lalu kode SAP (IEG dan EJI), lalu
 * barcode — sehingga file export dari sumber mana pun tetap terpetakan. Baris
 * yang tidak menemukan material TIDAK diam-diam dibuang: jumlahnya dan
 * contohnya dikembalikan supaya bisa dibereskan.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const rows = (body.rows ?? []) as BarisImport[];
    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: 'Tidak ada baris untuk di-import' }, { status: 400 });
    }

    const sesi = body.sessionId
      ? await prisma.opnameSession.findUnique({ where: { id: parseInt(String(body.sessionId), 10) } })
      : await getActiveSession();
    if (!sesi) {
      return NextResponse.json(
        { error: 'Belum ada sesi opname yang dibuka. Buka sesi dulu sebelum import saldo buku.' },
        { status: 409 }
      );
    }
    if (sesi.status === 'CLOSED') {
      return NextResponse.json({ error: `Sesi ${sesi.code} sudah ditutup.` }, { status: 409 });
    }

    const materials = await prisma.material.findMany({
      select: {
        id: true, normOcsCode: true, normSapIeg: true, normSapEji: true,
        normBarcodeProduct: true, normBarcodeBpom: true,
      },
    });
    const peta = new Map<string, number>();
    // Urutan pengisian menentukan prioritas: kode OCS paling dipercaya.
    for (const m of materials) if (m.normBarcodeBpom) peta.set('b:' + m.normBarcodeBpom, m.id);
    for (const m of materials) if (m.normBarcodeProduct) peta.set('b:' + m.normBarcodeProduct, m.id);
    for (const m of materials) if (m.normSapEji) peta.set('s:' + m.normSapEji, m.id);
    for (const m of materials) if (m.normSapIeg) peta.set('s:' + m.normSapIeg, m.id);
    for (const m of materials) peta.set('o:' + m.normOcsCode, m.id);

    const cocok: { materialId: number; qty: number; raw: string }[] = [];
    const takCocok: string[] = [];
    const sudah = new Set<number>();

    for (const r of rows) {
      const raw = String(r.kode ?? '').trim();
      const n = normalizeCode(raw);
      if (!n) continue;
      const id = peta.get('o:' + n) ?? peta.get('s:' + n) ?? peta.get('b:' + n);
      if (!id) { takCocok.push(raw); continue; }
      if (sudah.has(id)) continue;      // baris kembar dalam file yang sama
      sudah.add(id);
      cocok.push({ materialId: id, qty: Number(r.qty) || 0, raw });
    }

    if (body.replace) {
      await prisma.bookStock.deleteMany({ where: { sessionId: sesi.id } });
    }

    // Ditulis bertahap agar file besar tidak menabrak batas ukuran transaksi TiDB.
    const UKURAN = 200;
    let ditulis = 0;
    for (let i = 0; i < cocok.length; i += UKURAN) {
      const bagian = cocok.slice(i, i + UKURAN);
      await prisma.$transaction(
        bagian.map((c) =>
          prisma.bookStock.upsert({
            where: { sessionId_materialId: { sessionId: sesi.id, materialId: c.materialId } },
            create: { sessionId: sesi.id, materialId: c.materialId, qtyBook: c.qty, rawCode: c.raw.slice(0, 96) },
            update: { qtyBook: c.qty, rawCode: c.raw.slice(0, 96) },
          })
        )
      );
      ditulis += bagian.length;
    }

    return NextResponse.json({
      success: true,
      session: { id: sesi.id, code: sesi.code },
      dibaca: rows.length,
      tersimpan: ditulis,
      tidakDikenal: takCocok.length,
      contohTidakDikenal: takCocok.slice(0, 20),
    });
  } catch (e: any) {
    console.error('[book-stock POST]', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
