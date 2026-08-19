import { NextRequest, NextResponse } from 'next/server';
import { prisma, withWriteRetry } from '@/lib/prisma';
import { normalizeBin } from '@/lib/normalize';

export const dynamic = 'force-dynamic';

/**
 * PATCH /api/entries/:id  — koreksi qty, lokasi, atau catatan oleh administrator.
 *
 * Perubahan qty/bin ikut menyesuaikan ringkasan `BinCount` supaya angka di layar
 * status bin tidak melenceng dari isi tabel entry.
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const id = parseInt(params.id, 10);
  if (Number.isNaN(id)) return NextResponse.json({ error: 'id tidak valid' }, { status: 400 });

  try {
    const body = (await req.json()) as { qtyPcs?: number; binCode?: string; notes?: string | null };
    const lama = await prisma.soEntry.findUnique({ where: { id } });
    if (!lama) return NextResponse.json({ error: 'Entry tidak ditemukan' }, { status: 404 });

    const sesi = await prisma.opnameSession.findUnique({ where: { id: lama.sessionId } });
    if (sesi?.status === 'CLOSED') {
      return NextResponse.json(
        { error: `Sesi ${sesi.code} sudah ditutup — data di dalamnya tidak bisa diubah.` },
        { status: 409 }
      );
    }

    const binCodeBaru = body.binCode?.trim().toUpperCase();
    const normBaru = binCodeBaru ? normalizeBin(binCodeBaru) : lama.normBinCode;
    const binBaru = binCodeBaru ? await prisma.bin.findUnique({ where: { normCode: normBaru } }) : null;

    const qtyLama = Number(lama.qtyPcs);
    const qtyBaru = body.qtyPcs ?? qtyLama;

    const updated = await withWriteRetry<{ id: number }>(() =>
      prisma.soEntry.update({
        where: { id },
        data: {
          qtyPcs: qtyBaru,
          ...(binCodeBaru
            ? { binCode: binCodeBaru.slice(0, 160), normBinCode: normBaru, binKnown: Boolean(binBaru) }
            : {}),
          ...(body.notes !== undefined ? { notes: body.notes } : {}),
        },
      })
    );

    // Ringkasan bin diperbarui setelah entry tersimpan. Kalau langkah ini gagal,
    // koreksinya TETAP tersimpan — angka ringkasan bisa dihitung ulang.
    try {
      const binLama = await prisma.bin.findUnique({ where: { normCode: lama.normBinCode } });
      const pindahBin = binCodeBaru && normBaru !== lama.normBinCode;
      if (pindahBin) {
        if (binLama) {
          await prisma.binCount.updateMany({
            where: { sessionId: lama.sessionId, binId: binLama.id },
            data: { entryCount: { decrement: 1 }, totalQty: { decrement: qtyLama } },
          });
        }
        if (binBaru) {
          await prisma.binCount.upsert({
            where: { sessionId_binId: { sessionId: lama.sessionId, binId: binBaru.id } },
            create: {
              sessionId: lama.sessionId, binId: binBaru.id, status: 'PROSES',
              entryCount: 1, totalQty: qtyBaru,
            },
            update: { entryCount: { increment: 1 }, totalQty: { increment: qtyBaru } },
          });
        }
      } else if (binLama && qtyBaru !== qtyLama) {
        await prisma.binCount.updateMany({
          where: { sessionId: lama.sessionId, binId: binLama.id },
          data: { totalQty: { increment: qtyBaru - qtyLama } },
        });
      }
    } catch (e) {
      console.error('[entries PATCH] ringkasan bin gagal diperbarui:', e);
    }

    return NextResponse.json({ success: true, id: updated.id });
  } catch (e: any) {
    console.error('[entries PATCH]', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
