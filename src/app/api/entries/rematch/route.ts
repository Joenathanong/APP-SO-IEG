import { NextRequest, NextResponse } from 'next/server';
import { pesanPrisma } from '@/lib/prisma';
import { tautkanUlang } from '@/lib/match-material';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * POST /api/entries/rematch   { sessionId?: number }
 *
 * Cocokkan ulang scan yang belum tertaut ke master material.
 *
 * Dipanggil otomatis setiap kali master berubah, dan bisa dijalankan manual
 * dari halaman Data SO. Idempoten: menjalankannya dua kali tidak mengubah apa
 * pun pada percobaan kedua, karena hanya baris ber-materialId NULL yang disentuh.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const sessionId = body?.sessionId ? Number(body.sessionId) : null;
    const hasil = await tautkanUlang({ sessionId });
    return NextResponse.json({ success: true, ...hasil });
  } catch (e: any) {
    console.error('[entries/rematch]', e);
    return NextResponse.json({ error: pesanPrisma(e) }, { status: 500 });
  }
}
