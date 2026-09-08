import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma, withWriteRetry } from '@/lib/prisma';
import { normalizeBin, normalizeCode } from '@/lib/normalize';
import { getActiveSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

type Payload = {
  clientEntryId: string;
  warehouseType: 'BESAR' | 'KECIL' | 'TRANSIT';
  materialId?: number | null;
  sapCode?: string | null;
  barcode?: string | null;
  rawMaterialText?: string | null;
  rawBarcode: string;
  batchDoc?: string | null;
  qtyCarton?: number | null;
  qtyPerBox?: number | null;
  qtyPcs: number;
  binCode: string;
  userName: string;
  shift: string;
  notes?: string | null;
  scannedAt?: string;
};

/**
 * Potong teks ke panjang kolomnya.
 *
 * Kolom di TiDB punya batas VarChar yang tegas; nilai yang melebihi batas
 * membuat Prisma melempar P2000 dan SELURUH entry gagal tersimpan. Entry itu
 * lalu masuk antrean dan dicoba ulang selamanya — selalu gagal dengan sebab
 * yang sama. Jadi catatan yang terpotong jauh lebih baik daripada scan yang
 * hilang: potong di sini, jangan biarkan penyimpanan gagal.
 */
function potong(v: string | null | undefined, maks: number): string | null {
  const t = (v ?? '').trim();
  return t ? t.slice(0, maks) : null;
}

/** Cari material dari materialId, kode SAP, lalu barcode — berhenti di yang pertama ketemu. */
async function resolveMaterial(p: Payload) {
  if (p.materialId) {
    const m = await prisma.material.findUnique({ where: { id: p.materialId } });
    if (m) return m;
  }
  const nSap = normalizeCode(p.sapCode);
  if (nSap) {
    const m = await prisma.material.findFirst({
      where: { OR: [{ normSapIeg: nSap }, { normSapEji: nSap }] },
      orderBy: [{ active: 'desc' }, { id: 'asc' }],
    });
    if (m) return m;
  }
  const nBar = normalizeCode(p.barcode);
  if (nBar) {
    // Barcode produk diutamakan; ia jauh lebih unik daripada barcode BPOM.
    const produk = await prisma.material.findMany({
      where: { normBarcodeProduct: nBar },
      orderBy: [{ active: 'desc' }, { id: 'asc' }], take: 3,
    });
    const produkAktif = produk.filter((m) => m.active);
    if (produkAktif.length === 1) return produkAktif[0];
    if (produkAktif.length === 0 && produk.length === 1) return produk[0];
    if (produkAktif.length > 1) return null;   // ambigu — lihat catatan di bawah

    const bpom = await prisma.material.findMany({
      where: { normBarcodeBpom: nBar },
      orderBy: [{ active: 'desc' }, { id: 'asc' }], take: 3,
    });
    const bpomAktif = bpom.filter((m) => m.active);
    if (bpomAktif.length === 1) return bpomAktif[0];
    if (bpomAktif.length === 0 && bpom.length === 1) return bpom[0];
    // bpomAktif.length > 1 → ambigu, jatuh ke null di bawah.
  }
  // Sengaja mengembalikan null saat AMBIGU, bukan mengambil kandidat pertama.
  // Satu registrasi BPOM bisa mencakup beberapa varian ukuran (mis. 130ml dan
  // 300ml); memilih diam-diam akan menukar hitungan kedua varian tanpa jejak.
  // Entry tetap tersimpan dengan materialId null dan muncul di daftar tinjau —
  // data tidak hilang, tapi juga tidak dibebankan ke material yang salah.
  return null;
}

export async function POST(req: NextRequest) {
  try {
    const p = (await req.json()) as Payload;

    if (!p.clientEntryId) return NextResponse.json({ error: 'clientEntryId wajib' }, { status: 400 });
    if (!p.binCode) return NextResponse.json({ error: 'binCode wajib' }, { status: 400 });

    const sesi = await getActiveSession();
    if (!sesi) {
      // 409 dan BUKAN 500: ini kondisi yang bisa diperbaiki admin, bukan
      // kerusakan. Klien menampilkan pesannya apa adanya dan tetap menyimpan
      // entry di antrean, sehingga scan tidak hilang sambil menunggu sesi dibuka.
      return NextResponse.json(
        { error: 'Belum ada sesi opname yang dibuka. Minta admin membuka sesi.', code: 'NO_ACTIVE_SESSION' },
        { status: 409 }
      );
    }

    const material = await resolveMaterial(p);
    const normBin = normalizeBin(p.binCode);
    const bin = await prisma.bin.findUnique({ where: { normCode: normBin } });

    const data: Prisma.SoEntryUncheckedCreateInput = {
      clientEntryId: p.clientEntryId,
      sessionId: sesi.id,
      warehouseType: p.warehouseType,
      materialId: material?.id ?? null,
      rawMaterialText: potong(p.rawMaterialText ?? p.sapCode ?? p.barcode, 255),
      rawBarcode: (p.rawBarcode ?? '').slice(0, 255),
      batchDoc: potong(p.batchDoc, 32),
      qtyCarton: p.qtyCarton ?? null,
      qtyPerBox: p.qtyPerBox ?? null,
      qtyPcs: p.qtyPcs,
      binCode: p.binCode.trim().toUpperCase().slice(0, 160),
      normBinCode: normBin,
      binKnown: Boolean(bin),
      userName: p.userName,
      shift: p.shift,
      notes: potong(p.notes, 255),
      scannedAt: p.scannedAt ? new Date(p.scannedAt) : new Date(),
    };

    try {
      const entry = await withWriteRetry<{ id: number }>(() => prisma.soEntry.create({ data }));

      // Ringkasan per bin diperbarui setelah entry tersimpan. Kalau langkah ini
      // gagal, entry-nya TETAP tersimpan — angka ringkasan bisa dihitung ulang,
      // data scan tidak bisa dikembalikan.
      if (bin) {
        withWriteRetry(() =>
          prisma.binCount.upsert({
            where: { sessionId_binId: { sessionId: sesi.id, binId: bin.id } },
            create: {
              sessionId: sesi.id, binId: bin.id, status: 'PROSES',
              countedBy: p.userName, countedAt: new Date(),
              entryCount: 1, totalQty: p.qtyPcs,
            },
            update: {
              status: 'PROSES', countedBy: p.userName, countedAt: new Date(),
              entryCount: { increment: 1 },
              totalQty: { increment: p.qtyPcs },
            },
          })
        ).catch((e) => console.error('[entries POST] ringkasan bin gagal diperbarui:', e));
      }

      return NextResponse.json({
        success: true,
        duplicate: false,
        entryId: entry.id,
        materialFound: Boolean(material),
        material: material ? { id: material.id, ocsCode: material.ocsCode, name: material.name } : null,
        binKnown: Boolean(bin),
        sessionCode: sesi.code,
      });
    } catch (e: any) {
      // P2002 = clientEntryId sudah ada. Ini BUKAN error: entry yang sama
      // dikirim ulang dari antrean offline. Idempotency ditegakkan index unik,
      // bukan pengecekan sebelum insert — sehingga tidak ada celah balapan dan
      // tidak ada langkah yang bisa menggagalkan penyimpanan.
      if (e?.code === 'P2002') {
        return NextResponse.json({ success: true, duplicate: true, reason: 'client_entry_id_exists' });
      }
      throw e;
    }
  } catch (e: any) {
    console.error('[entries POST]', e);
    return NextResponse.json({ error: e.message, code: e?.code ?? null }, { status: 500 });
  }
}

/**
 * GET /api/entries?sessionId=&warehouseType=&from=&to=&q= — untuk halaman Data SO.
 *
 * `sessionId` menerima nomor sesi, atau `all` untuk semua sesi sekaligus.
 * Bila tidak diisi: sesi yang sedang OPEN, dan kalau tidak ada yang terbuka,
 * sesi TERBARU. Dulu kasus terakhir mengembalikan array kosong — sehingga
 * sehabis sesi ditutup, halaman Data SO tampak kosong melompong seolah seluruh
 * hasil opname hilang, padahal datanya utuh.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get('sessionId');
    const warehouseType = searchParams.get('warehouseType');
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    const q = searchParams.get('q');

    const semuaSesi = sessionId === 'all';
    let sesi: number | undefined;
    if (!semuaSesi) {
      if (sessionId) {
        const n = parseInt(sessionId, 10);
        if (!Number.isFinite(n)) {
          return NextResponse.json({ error: 'sessionId harus angka atau "all"' }, { status: 400 });
        }
        sesi = n;
      } else {
        sesi =
          (await getActiveSession())?.id ??
          (await prisma.opnameSession.findFirst({ orderBy: { createdAt: 'desc' }, select: { id: true } }))?.id;
      }
      if (!sesi) return NextResponse.json([]);
    }

    const entries = await prisma.soEntry.findMany({
      where: {
        ...(semuaSesi ? {} : { sessionId: sesi }),
        ...(warehouseType ? { warehouseType: warehouseType as any } : {}),
        ...(from || to
          ? { scannedAt: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } }
          : {}),
        ...(q
          ? {
              OR: [
                { binCode: { contains: q } },
                { rawMaterialText: { contains: q } },
                { userName: { contains: q } },
                { material: { is: { ocsCode: { contains: q } } } },
                { material: { is: { name: { contains: q } } } },
              ],
            }
          : {}),
      },
      include: {
        material: { select: { ocsCode: true, name: true, sapCodeIeg: true, sapCodeEji: true } },
        session: { select: { code: true, name: true } },
      },
      orderBy: { scannedAt: 'desc' },
      take: 5000,
    });

    return NextResponse.json(
      entries.map((e) => ({
        id: e.id,
        clientEntryId: e.clientEntryId,
        warehouseType: e.warehouseType,
        sessionId: e.sessionId,
        kodeSO: e.session?.code ?? '',
        namaSesi: e.session?.name ?? '',
        skuOCS: e.material?.ocsCode ?? null,
        namaProduk: e.material?.name ?? null,
        skuSAP: e.material?.sapCodeIeg ?? e.material?.sapCodeEji ?? e.rawMaterialText,
        materialDikenal: e.materialId !== null,
        rawMaterialText: e.rawMaterialText,
        batchDoc: e.batchDoc,
        qtyCarton: e.qtyCarton === null ? null : Number(e.qtyCarton),
        qtyPcs: Number(e.qtyPcs),
        binCode: e.binCode,
        binKnown: e.binKnown,
        userName: e.userName,
        shift: e.shift,
        notes: e.notes,
        scannedAt: e.scannedAt,
      }))
    );
  } catch (e: any) {
    console.error('[entries GET]', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
