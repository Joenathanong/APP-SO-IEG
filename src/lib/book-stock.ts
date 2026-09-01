import { prisma } from '@/lib/prisma';
import { normalizeCode } from '@/lib/normalize';
import { tarikStokOcs, namaSnapshot, BarisStokOcs } from '@/lib/ocs';

/** Satu baris apa adanya dari sumber mana pun (OCS atau file .xlsx). */
export type BarisSumber = {
  kode: string;
  qty: number;
  nama?: string | null;
  sapCode?: string | null;
  qtyKecil?: number | null;
  qtyBesar?: number | null;
};

/**
 * Peta pencarian material: kode OCS -> SAP -> barcode.
 *
 * Urutan pengisian menentukan prioritas, dan yang diisi BELAKANGAN menang.
 * Kode OCS diisi paling akhir karena paling dipercaya — ini kunci alami master.
 */
async function petaMaterial() {
  const materials = await prisma.material.findMany({
    select: {
      id: true, normOcsCode: true, normSapIeg: true, normSapEji: true,
      normBarcodeProduct: true, normBarcodeBpom: true,
    },
  });
  const peta = new Map<string, number>();
  for (const m of materials) if (m.normBarcodeBpom) peta.set('b:' + m.normBarcodeBpom, m.id);
  for (const m of materials) if (m.normBarcodeProduct) peta.set('b:' + m.normBarcodeProduct, m.id);
  for (const m of materials) if (m.normSapEji) peta.set('s:' + m.normSapEji, m.id);
  for (const m of materials) if (m.normSapIeg) peta.set('s:' + m.normSapIeg, m.id);
  for (const m of materials) peta.set('o:' + m.normOcsCode, m.id);
  return peta;
}

export function dariOcs(rows: BarisStokOcs[]): BarisSumber[] {
  return rows.map((r) => ({
    kode: r.sku,
    qty: r.qtyOnHand,
    nama: r.nama || null,
    sapCode: r.sapCode,
    qtyKecil: r.qtyGudangKecil,
    qtyBesar: r.qtyGudangBesar,
  }));
}

export type HasilSnapshot = {
  id: number;
  name: string;
  rowCount: number;
  matchedCount: number;
  unmatchedCount: number;
  totalQty: number;
};

/**
 * Simpan satu snapshot beserta isinya.
 *
 * Baris yang kodenya tidak ketemu di master TETAP DISIMPAN dengan materialId
 * null. Itu keputusan sadar: menghilangkannya membuat saldo pembanding bolong
 * tanpa jejak, dan bolong yang tidak terlihat adalah jenis kesalahan yang
 * paling lama tidak ketahuan.
 */
export async function simpanSnapshot(opts: {
  nama: string;
  sumber: 'OCS' | 'UPLOAD';
  baris: BarisSumber[];
  originSessionId?: number | null;
  createdBy?: string | null;
  notes?: string | null;
}): Promise<HasilSnapshot> {
  const peta = await petaMaterial();

  const siap: {
    rawCode: string; materialId: number | null; qtyBook: number;
    qtyKecil: number | null; qtyBesar: number | null;
    rawName: string | null; rawSapCode: string | null;
  }[] = [];
  const sudah = new Set<string>();
  let cocok = 0, total = 0;

  for (const b of opts.baris) {
    const raw = String(b.kode ?? '').trim().slice(0, 96);
    if (!raw) continue;
    // Kunci alami snapshot adalah rawCode, jadi kembar dalam satu sumber harus
    // dibuang DI SINI — kalau tidak, penulisan massal akan menabrak unique index.
    const kunci = normalizeCode(raw);
    if (!kunci || sudah.has(kunci)) continue;
    sudah.add(kunci);

    const n = normalizeCode(raw);
    const nSap = normalizeCode(b.sapCode);
    const materialId =
      peta.get('o:' + n) ??
      (nSap ? peta.get('s:' + nSap) : undefined) ??
      peta.get('s:' + n) ??
      peta.get('b:' + n) ??
      null;
    if (materialId) cocok++;

    const qty = Number(b.qty) || 0;
    total += qty;
    siap.push({
      rawCode: raw,
      materialId,
      qtyBook: qty,
      qtyKecil: b.qtyKecil == null ? null : Number(b.qtyKecil) || 0,
      qtyBesar: b.qtyBesar == null ? null : Number(b.qtyBesar) || 0,
      rawName: b.nama ? String(b.nama).slice(0, 512) : null,
      rawSapCode: b.sapCode ? String(b.sapCode).slice(0, 32) : null,
    });
  }

  const snap = await prisma.bookStockSnapshot.create({
    data: {
      name: opts.nama.slice(0, 160),
      source: opts.sumber,
      originSessionId: opts.originSessionId ?? null,
      createdBy: opts.createdBy?.slice(0, 64) ?? null,
      notes: opts.notes?.slice(0, 512) ?? null,
      rowCount: siap.length,
      matchedCount: cocok,
      unmatchedCount: siap.length - cocok,
      totalQty: total,
    },
  });

  // Ditulis bertahap: 2.400+ baris dalam satu pernyataan menabrak batas ukuran
  // transaksi TiDB, dan createMany satu kali juga terlalu besar.
  const UKURAN = 500;
  for (let i = 0; i < siap.length; i += UKURAN) {
    await prisma.bookStock.createMany({
      data: siap.slice(i, i + UKURAN).map((r) => ({ ...r, snapshotId: snap.id })),
      skipDuplicates: true,
    });
  }

  return {
    id: snap.id, name: snap.name, rowCount: siap.length,
    matchedCount: cocok, unmatchedCount: siap.length - cocok, totalQty: total,
  };
}

/**
 * Tarik dari OCS lalu simpan sebagai snapshot bernama stock-ocs-(nama sesi).
 *
 * Nama harus unik. Kalau nama itu sudah terpakai — misalnya admin menarik ulang
 * untuk sesi yang sama — diberi akhiran urut, BUKAN menimpa yang lama. Tarikan
 * lama tetap utuh supaya bisa dibandingkan kalau angkanya ternyata mencurigakan.
 */
export async function tarikDanSimpan(opts: {
  namaSesi: string;
  sessionId?: number | null;
  createdBy?: string | null;
}): Promise<HasilSnapshot> {
  const rows = await tarikStokOcs();
  let nama = namaSnapshot(opts.namaSesi);
  const dasar = nama;
  for (let i = 2; await prisma.bookStockSnapshot.findUnique({ where: { name: nama } }); i++) {
    nama = `${dasar} (${i})`.slice(0, 160);
  }
  return simpanSnapshot({
    nama,
    sumber: 'OCS',
    baris: dariOcs(rows),
    originSessionId: opts.sessionId ?? null,
    createdBy: opts.createdBy ?? null,
    notes: `Ditarik otomatis dari OCS, ${rows.length} baris (Bundle dikecualikan).`,
  });
}
