import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * GET /api/history?startDate&endDate&type=gb|kt&sessionId
 *
 * ADAPTER TAMPILAN. Mengembalikan bentuk lama (StockEntryGB / StockEntryKT
 * beserta `_sheet`) supaya halaman History dan Dashboard tidak perlu ditulis
 * ulang. Sumber datanya tetap tabel `so_entries` — ini murni lapisan penyajian,
 * bukan penyimpanan bayangan.
 *
 * Kalau suatu saat kedua halaman itu dirapikan, endpoint ini bisa dihapus.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const type = searchParams.get('type');
    const sessionId = searchParams.get('sessionId');

    const dari = startDate ? new Date(`${startDate}T00:00:00`) : undefined;
    const sampai = endDate ? new Date(`${endDate}T23:59:59.999`) : undefined;

    const entries = await prisma.soEntry.findMany({
      where: {
        ...(sessionId ? { sessionId: parseInt(sessionId, 10) } : {}),
        ...(dari || sampai ? { scannedAt: { ...(dari ? { gte: dari } : {}), ...(sampai ? { lte: sampai } : {}) } } : {}),
        ...(type === 'gb' ? { warehouseType: 'BESAR' } : {}),
        ...(type === 'kt' ? { warehouseType: { in: ['KECIL', 'TRANSIT'] } } : {}),
      },
      include: { material: { select: { ocsCode: true, name: true, sapCodeIeg: true, sapCodeEji: true } } },
      orderBy: { scannedAt: 'desc' },
      take: 10000,
    });

    return NextResponse.json(
      entries.map((e) => {
        const ts = e.scannedAt.toISOString();
        const umum = {
          id: String(e.id),
          rowIndex: e.id,               // dipakai modal edit halaman History
          timestamp: ts,
          date: ts.slice(0, 10),
          user: e.userName,
          shift: e.shift,
          location: e.binCode,
          notes: e.notes ?? '',
          status: 'saved' as const,
          potentialDouble: false,       // fitur ini diganti status hitung per bin
        };
        if (e.warehouseType === 'BESAR') {
          return {
            ...umum,
            _sheet: 'Gudang Besar',
            materialId: e.material?.sapCodeIeg ?? e.material?.sapCodeEji ?? e.rawMaterialText ?? '',
            batchDoc: e.batchDoc ?? '',
            unitCtn: 'CTN',
            qtyPerBox: e.qtyPerBox === null ? 0 : Number(e.qtyPerBox),
            unitPcs: 'PCS',
            barcode: e.rawBarcode,
            ocsCode: e.material?.ocsCode ?? '',
            description: e.material?.name ?? '',
            wh: '',
            qtyCarton: e.qtyCarton === null ? 0 : Number(e.qtyCarton),
            qtyPcsTotal: Number(e.qtyPcs),
          };
        }
        return {
          ...umum,
          _sheet: e.warehouseType === 'TRANSIT' ? 'Gudang Transit' : 'Gudang Kecil',
          category: e.warehouseType === 'TRANSIT' ? 'Gudang Transit' : 'Gudang Kecil',
          barcode: e.rawBarcode,
          sapCode: e.material?.sapCodeIeg ?? e.material?.sapCodeEji ?? e.rawMaterialText ?? '',
          ocsCode: e.material?.ocsCode ?? '',
          qtyPcs: Number(e.qtyPcs),
        };
      })
    );
  } catch (e: any) {
    console.error('[history GET]', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
