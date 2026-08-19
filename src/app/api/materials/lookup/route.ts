import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { normalizeCode } from '@/lib/normalize';

export const dynamic = 'force-dynamic';

function ringkas(m: any) {
  return {
    id: m.id,
    ocsCode: m.ocsCode,
    name: m.name,
    category: m.category,
    sapCodeIeg: m.sapCodeIeg,
    sapCodeEji: m.sapCodeEji,
    barcodeProduct: m.barcodeProduct,
    barcodeBpom: m.barcodeBpom,
    active: m.active,
  };
}

/**
 * GET /api/materials/lookup?sap=...  atau  ?barcode=...  atau  ?ocs=...
 *
 * Dua aturan penting yang lahir dari audit data:
 *
 * 1. Kode SAP dicari di DUA kolom (IEG dan EJI). Master lama menyimpan keduanya
 *    bercampur di satu kolom — 352 baris kode IEG, 72 kode EJI. Mencari satu
 *    kolom saja membuat barang yang tersimpan dengan "kode sisi lain" tidak
 *    pernah ketemu.
 *
 * 2. Barcode produk diutamakan di atas barcode BPOM, dan bila BPOM cocok ke
 *    LEBIH DARI SATU material aktif, hasilnya dikembalikan sebagai pilihan —
 *    bukan diambil salah satu. Satu registrasi BPOM bisa mencakup beberapa
 *    varian ukuran (mis. 130ml dan 300ml); memilih diam-diam akan menukar
 *    hitungan kedua varian tanpa ada yang tahu.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const sap = searchParams.get('sap');
    const barcode = searchParams.get('barcode');
    const ocs = searchParams.get('ocs');

    if (ocs) {
      const n = normalizeCode(ocs);
      const m = await prisma.material.findFirst({ where: { normOcsCode: n } });
      return NextResponse.json(m ? { found: true, material: ringkas(m) } : { found: false, material: null });
    }

    if (sap) {
      const n = normalizeCode(sap);
      if (!n) return NextResponse.json({ found: false, material: null });
      // Aktif diutamakan; kalau tidak ada yang aktif, yang non-aktif tetap
      // dikembalikan agar barang lama di gudang tetap bisa discan.
      const kandidat = await prisma.material.findMany({
        where: { OR: [{ normSapIeg: n }, { normSapEji: n }] },
        orderBy: [{ active: 'desc' }, { id: 'asc' }],
        take: 5,
      });
      if (kandidat.length === 0) return NextResponse.json({ found: false, material: null });
      return NextResponse.json({ found: true, material: ringkas(kandidat[0]), via: 'sap' });
    }

    if (barcode) {
      const n = normalizeCode(barcode);
      if (!n) return NextResponse.json({ found: false, material: null });

      const produk = await prisma.material.findMany({
        where: { normBarcodeProduct: n },
        orderBy: [{ active: 'desc' }, { id: 'asc' }],
        take: 5,
      });
      const produkAktif = produk.filter((m) => m.active);
      if (produkAktif.length === 1) {
        return NextResponse.json({ found: true, material: ringkas(produkAktif[0]), via: 'barcode_produk' });
      }
      if (produkAktif.length > 1) {
        return NextResponse.json({
          found: true, ambiguous: true, via: 'barcode_produk',
          material: null, pilihan: produkAktif.map(ringkas),
        });
      }
      if (produk.length === 1) {
        return NextResponse.json({ found: true, material: ringkas(produk[0]), via: 'barcode_produk_nonaktif' });
      }

      const bpom = await prisma.material.findMany({
        where: { normBarcodeBpom: n },
        orderBy: [{ active: 'desc' }, { id: 'asc' }],
        take: 5,
      });
      const bpomAktif = bpom.filter((m) => m.active);
      if (bpomAktif.length === 1) {
        return NextResponse.json({ found: true, material: ringkas(bpomAktif[0]), via: 'barcode_bpom' });
      }
      if (bpomAktif.length > 1) {
        return NextResponse.json({
          found: true, ambiguous: true, via: 'barcode_bpom',
          material: null, pilihan: bpomAktif.map(ringkas),
        });
      }
      if (bpom.length >= 1) {
        return NextResponse.json({ found: true, material: ringkas(bpom[0]), via: 'barcode_bpom_nonaktif' });
      }

      return NextResponse.json({ found: false, material: null });
    }

    return NextResponse.json({ error: 'Sertakan salah satu: sap, barcode, atau ocs' }, { status: 400 });
  } catch (e: any) {
    console.error('[materials/lookup]', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
