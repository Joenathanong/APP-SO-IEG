import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getActiveSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

/**
 * Pengganti sheet `Resume_SO`.
 *
 * Di versi Google Sheets, kolom "Hasil SO" dan "Selisih" adalah formula SUMIF
 * yang menjumlahkan seluruh isi sheet tanpa batas waktu. Begitu datanya pindah,
 * formula itu mati dan dashboard menampilkan angka basi TANPA error — kegagalan
 * senyap. Di sini keduanya dihitung dari database, dan selalu terbatas pada
 * SATU sesi opname.
 *
 * Saldo buku diambil dari `book_stocks` (hasil import export SAP/OCS), bukan
 * dari kolom yang bisa tertimpa.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const qSession = searchParams.get('sessionId');
    const sesi = qSession
      ? await prisma.opnameSession.findUnique({ where: { id: parseInt(qSession, 10) } })
      : await getActiveSession();

    const kosong = {
      items: [], stats: { total: 0, dihitung: 0, belum: 0, sesuai: 0, surplus: 0, defisit: 0,
        progress: 0, totalSelisihPlus: 0, totalSelisihMinus: 0 },
      top10Selisih: [], top10Surplus: [], top10Defisit: [], byKategori: [],
      session: null, lastUpdated: new Date().toISOString(),
    };
    if (!sesi) return NextResponse.json(kosong);

    const [buku, hasil] = await Promise.all([
      prisma.bookStock.findMany({
        where: { sessionId: sesi.id },
        include: { material: { select: { id: true, ocsCode: true, name: true, category: true,
          sapCodeIeg: true, sapCodeEji: true, barcodeProduct: true, barcodeBpom: true } } },
      }),
      // Inilah pengganti SUMIF — dibatasi sessionId, jadi periode tidak tercampur.
      prisma.soEntry.groupBy({
        by: ['materialId'],
        where: { sessionId: sesi.id, materialId: { not: null } },
        _sum: { qtyPcs: true },
      }),
    ]);

    const hasilPer = new Map<number, number>();
    for (const h of hasil) if (h.materialId !== null) hasilPer.set(h.materialId, Number(h._sum.qtyPcs ?? 0));

    const items = buku.map((b) => {
      const jumlahOCS = Number(b.qtyBook);
      const hasilSO = hasilPer.get(b.materialId) ?? 0;
      const selisih = hasilSO - jumlahOCS;
      // Konsisten dengan aturan lama: hanya hasilSO > 0 yang dianggap sudah
      // dihitung secara fisik. Nol berarti belum ditemukan, bukan "nol unit".
      let status: 'belum' | 'sesuai' | 'surplus' | 'defisit' = 'belum';
      if (hasilSO > 0) status = selisih === 0 ? 'sesuai' : selisih > 0 ? 'surplus' : 'defisit';
      return {
        materialId: b.materialId,
        materialOCS: b.material.ocsCode,
        namaProduk: b.material.name,
        materialIEG: b.material.sapCodeIeg ?? '',
        materialEJI: b.material.sapCodeEji ?? '',
        kategori: b.material.category || 'Lainnya',
        barcodeProduct: b.material.barcodeProduct ?? '',
        barcodeBPOM: b.material.barcodeBpom ?? '',
        jumlahOCS, hasilSO, selisih, status,
      };
    });

    const total = items.length;
    const dihitung = items.filter((i) => i.hasilSO > 0).length;
    const stats = {
      total, dihitung, belum: total - dihitung,
      sesuai: items.filter((i) => i.status === 'sesuai').length,
      surplus: items.filter((i) => i.status === 'surplus').length,
      defisit: items.filter((i) => i.status === 'defisit').length,
      progress: total > 0 ? Math.round((dihitung / total) * 100) : 0,
      totalSelisihPlus: items.filter((i) => i.selisih > 0).reduce((s, i) => s + i.selisih, 0),
      totalSelisihMinus: items.filter((i) => i.selisih < 0).reduce((s, i) => s + i.selisih, 0),
    };

    const dihitungSaja = items.filter((i) => i.hasilSO > 0);
    const top10Selisih = [...dihitungSaja].filter((i) => i.selisih !== 0)
      .sort((a, b) => Math.abs(b.selisih) - Math.abs(a.selisih)).slice(0, 10);
    const top10Surplus = [...dihitungSaja].filter((i) => i.selisih > 0)
      .sort((a, b) => b.selisih - a.selisih).slice(0, 10);
    const top10Defisit = [...dihitungSaja].filter((i) => i.selisih < 0)
      .sort((a, b) => a.selisih - b.selisih).slice(0, 10);

    const peta: Record<string, any> = {};
    for (const i of items) {
      const k = i.kategori || 'Lainnya';
      peta[k] ??= { kategori: k, total: 0, dihitung: 0, sesuai: 0, surplus: 0, defisit: 0, belum: 0 };
      peta[k].total++;
      if (i.hasilSO > 0) peta[k].dihitung++; else peta[k].belum++;
      if (i.status !== 'belum') peta[k][i.status]++;
    }

    // Scan yang materialnya TIDAK dikenal tidak muncul di rekonsiliasi mana pun.
    // Angkanya dilaporkan supaya tidak diam-diam hilang dari pandangan.
    const takDikenal = await prisma.soEntry.aggregate({
      where: { sessionId: sesi.id, materialId: null },
      _count: { _all: true }, _sum: { qtyPcs: true },
    });

    return NextResponse.json({
      items, stats, top10Selisih, top10Surplus, top10Defisit,
      byKategori: Object.values(peta),
      takDikenal: { jumlahBaris: takDikenal._count._all, totalQty: Number(takDikenal._sum.qtyPcs ?? 0) },
      session: { id: sesi.id, code: sesi.code, name: sesi.name, status: sesi.status },
      lastUpdated: new Date().toISOString(),
    });
  } catch (e: any) {
    console.error('[monitor/resume-so]', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
