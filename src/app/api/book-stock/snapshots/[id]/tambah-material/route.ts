import { NextRequest, NextResponse } from 'next/server';
import { prisma, pesanPrisma } from '@/lib/prisma';
import { normalizeCode, classifySapCode } from '@/lib/normalize';

export const dynamic = 'force-dynamic';

/**
 * POST /api/book-stock/snapshots/[id]/tambah-material
 *
 * Membuat material baru dari baris snapshot yang belum punya pasangan di master,
 * lalu MENYAMBUNGKAN baris-baris itu ke material barunya.
 *
 * Sengaja tidak otomatis saat menarik: sebagian kode di OCS adalah barang
 * kemasan atau varian konsinyasi yang belum tentu ingin Anda hitung. Keputusan
 * itu milik admin, jadi ini dijalankan lewat tombol, bukan diam-diam.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const id = parseInt(params.id, 10);
    if (!Number.isFinite(id)) return NextResponse.json({ error: 'id tidak valid' }, { status: 400 });

    const body = await req.json().catch(() => ({}));
    // Boleh membatasi ke kode tertentu; tanpa daftar, semua yang belum cocok.
    const hanya: string[] | null = Array.isArray(body?.kode) && body.kode.length ? body.kode.map(String) : null;

    const belum = await prisma.bookStock.findMany({
      where: { snapshotId: id, materialId: null },
      select: { id: true, rawCode: true, rawName: true, rawSapCode: true },
      take: 5000,
    });
    const target = hanya ? belum.filter((b) => hanya.includes(b.rawCode)) : belum;
    if (target.length === 0) {
      return NextResponse.json({ success: true, dibuat: 0, disambungkan: 0, pesan: 'Tidak ada baris yang perlu ditambahkan.' });
    }

    let dibuat = 0, disambungkan = 0;

    for (const b of target) {
      const norm = normalizeCode(b.rawCode);
      if (!norm) continue;

      // Bisa saja materialnya sudah dibuat sejak snapshot ini ditarik.
      let material = await prisma.material.findFirst({ where: { normOcsCode: norm }, select: { id: true } });

      if (!material) {
        // Aturan prefix yang sama dengan seed master: 1222/1227/1228 = EJI,
        // selain itu IEG. Diuji ke 424 baris Resume_SO, nol pelanggaran.
        const sap = b.rawSapCode ?? null;
        const milik = sap ? classifySapCode(sap) : null;
        material = await prisma.material.create({
          data: {
            ocsCode: b.rawCode.slice(0, 96),
            name: (b.rawName || b.rawCode).slice(0, 512),
            normOcsCode: norm,
            sapCodeIeg: milik === 'IEG' ? sap!.slice(0, 32) : null,
            sapCodeEji: milik === 'EJI' ? sap!.slice(0, 32) : null,
            normSapIeg: milik === 'IEG' ? normalizeCode(sap) || null : null,
            normSapEji: milik === 'EJI' ? normalizeCode(sap) || null : null,
            active: true,
            source: 'OCS-otomatis',
            reviewNote: 'Dibuat dari tarikan stok OCS — barcode belum diisi, jadi BELUM bisa discan.',
          },
          select: { id: true },
        });
        dibuat++;
      }

      await prisma.bookStock.update({ where: { id: b.id }, data: { materialId: material.id } });
      disambungkan++;
    }

    // Angka ringkasan snapshot ikut disegarkan, kalau tidak layar akan terus
    // menampilkan "44 belum cocok" padahal sudah dibereskan.
    const [cocok, takCocok] = await Promise.all([
      prisma.bookStock.count({ where: { snapshotId: id, materialId: { not: null } } }),
      prisma.bookStock.count({ where: { snapshotId: id, materialId: null } }),
    ]);
    await prisma.bookStockSnapshot.update({
      where: { id }, data: { matchedCount: cocok, unmatchedCount: takCocok },
    });

    return NextResponse.json({ success: true, dibuat, disambungkan, sisaBelumCocok: takCocok });
  } catch (e: any) {
    console.error('[tambah-material]', e);
    return NextResponse.json({ error: pesanPrisma(e) }, { status: 500 });
  }
}
