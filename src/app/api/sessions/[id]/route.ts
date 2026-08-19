import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * PATCH /api/sessions/:id  { action: 'open' | 'close' | 'reopen' }
 *
 * Membuka sesi mengisi `openGuard = 1`. Karena kolom itu unique, percobaan
 * membuka sesi KEDUA ditolak database dengan P2002 — bukan oleh pengecekan
 * aplikasi. Dua admin yang menekan tombol berbarengan tetap tidak bisa
 * menghasilkan dua sesi terbuka.
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const id = parseInt(params.id, 10);
  if (Number.isNaN(id)) return NextResponse.json({ error: 'id tidak valid' }, { status: 400 });

  try {
    const { action } = (await req.json()) as { action: 'open' | 'close' | 'reopen' };
    const sesi = await prisma.opnameSession.findUnique({ where: { id } });
    if (!sesi) return NextResponse.json({ error: 'Sesi tidak ditemukan' }, { status: 404 });

    if (action === 'open' || action === 'reopen') {
      // Sesi yang sudah ditutup BOLEH dibuka kembali — menutup karena salah
      // klik adalah kesalahan yang wajar, dan memaksa membuat sesi baru justru
      // memecah data satu periode ke dua sesi. Penjaga `openGuard` tetap
      // memastikan hanya ada satu sesi terbuka.
      if (sesi.status === 'CLOSED' && action !== 'reopen') {
        return NextResponse.json(
          { error: 'Sesi ini sudah ditutup. Gunakan aksi "reopen" bila memang ingin membukanya kembali.', code: 'NEED_REOPEN' },
          { status: 409 }
        );
      }
      const updated = await prisma.opnameSession.update({
        where: { id },
        data: { status: 'OPEN', openGuard: 1, startedAt: sesi.startedAt ?? new Date(), endedAt: null },
      });
      return NextResponse.json(updated);
    }

    if (action === 'close') {
      const updated = await prisma.opnameSession.update({
        where: { id },
        data: { status: 'CLOSED', openGuard: null, endedAt: new Date() },
      });
      return NextResponse.json(updated);
    }

    return NextResponse.json({ error: 'action harus "open", "reopen", atau "close"' }, { status: 400 });
  } catch (e: any) {
    if (e?.code === 'P2002') {
      const aktif = await prisma.opnameSession.findFirst({
        where: { status: 'OPEN' }, select: { code: true, name: true },
      });
      return NextResponse.json(
        { error: `Masih ada sesi yang terbuka: ${aktif?.code ?? '(tidak diketahui)'} — ${aktif?.name ?? ''}. Tutup dulu sebelum membuka sesi lain.` },
        { status: 409 }
      );
    }
    console.error('[sessions PATCH]', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

/**
 * DELETE /api/sessions/:id   body: { confirmCode, requestedBy }
 *
 * MENGHAPUS PERMANEN sesi beserta SELURUH scan, saldo buku, dan status bin
 * di dalamnya. Tidak ada pembatalan.
 *
 * `confirmCode` harus sama persis dengan kode sesi. Ini bukan sistem izin —
 * ini penghalang agar penghapusan tidak pernah terjadi karena salah klik.
 *
 * CATATAN KEAMANAN: seluruh route di aplikasi ini belum memverifikasi identitas
 * di sisi server; pembatasan "administrator" masih di sisi klien. Siapa pun yang
 * bisa menjangkau URL ini bisa memanggilnya. Kalau aplikasi nanti terbuka ke
 * jaringan yang lebih luas, verifikasi token Firebase di server WAJIB
 * ditambahkan lebih dulu.
 */
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const id = parseInt(params.id, 10);
  if (Number.isNaN(id)) return NextResponse.json({ error: 'id tidak valid' }, { status: 400 });

  try {
    const body = await req.json().catch(() => ({}));
    const sesi = await prisma.opnameSession.findUnique({ where: { id } });
    if (!sesi) return NextResponse.json({ error: 'Sesi tidak ditemukan' }, { status: 404 });

    if (String(body.confirmCode ?? '').trim() !== sesi.code) {
      return NextResponse.json(
        { error: `Kode konfirmasi tidak cocok. Ketik persis: ${sesi.code}` },
        { status: 400 }
      );
    }

    const [jumlahScan, jumlahBuku, jumlahBin] = await Promise.all([
      prisma.soEntry.count({ where: { sessionId: id } }),
      prisma.bookStock.count({ where: { sessionId: id } }),
      prisma.binCount.count({ where: { sessionId: id } }),
    ]);

    // relationMode = "prisma" berarti TiDB tidak menegakkan foreign key, jadi
    // anak-anaknya harus dihapus sendiri — kalau tidak, barisnya jadi yatim dan
    // ikut terhitung di laporan sesi lain.
    await prisma.$transaction([
      prisma.soEntry.deleteMany({ where: { sessionId: id } }),
      prisma.bookStock.deleteMany({ where: { sessionId: id } }),
      prisma.binCount.deleteMany({ where: { sessionId: id } }),
      prisma.opnameSession.delete({ where: { id } }),
    ]);

    console.warn(
      `[sessions DELETE] Sesi ${sesi.code} dihapus oleh ${body.requestedBy ?? '(tidak diketahui)'} ` +
      `— ${jumlahScan} scan, ${jumlahBuku} saldo buku, ${jumlahBin} status bin ikut terhapus.`
    );

    return NextResponse.json({
      success: true,
      code: sesi.code,
      terhapus: { scan: jumlahScan, saldoBuku: jumlahBuku, statusBin: jumlahBin },
    });
  } catch (e: any) {
    console.error('[sessions DELETE]', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
