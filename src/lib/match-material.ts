import { prisma } from '@/lib/prisma';
import { normalizeCode } from '@/lib/normalize';

/**
 * Pencocokan scan ke master material — SATU tempat, dipakai dua jalur.
 *
 * Sebelumnya aturan ini hanya hidup di dalam /api/entries dan dijalankan sekali
 * seumur hidup sebuah scan: saat scan itu masuk. Konsekuensinya, barang yang
 * saat itu belum ada di master akan tetap "belum dikenal" SELAMANYA, walau
 * masternya dilengkapi lima menit kemudian. Kolom SKU OCS-nya kosong permanen —
 * bentuk lain dari persoalan tanda "—" yang jadi keluhan pertama Anda.
 *
 * Karena itu aturannya dipindah ke sini dan bisa dijalankan ulang. Aturannya
 * WAJIB sama persis untuk kedua jalur: kalau pencocokan ulang memakai aturan
 * yang lebih longgar, hasilnya jadi bergantung pada kapan seseorang menekan
 * tombol — dan angka yang berubah tanpa sebab yang jelas adalah angka yang
 * tidak dipercaya siapa pun.
 */

type Kandidat = {
  id: number;
  active: boolean;
  normSapIeg: string | null;
  normSapEji: string | null;
  normBarcodeProduct: string | null;
  normBarcodeBpom: string | null;
};

/** active lebih dulu, lalu id terkecil — sama dengan orderBy di jalur scan. */
function urut(a: Kandidat, b: Kandidat) {
  if (a.active !== b.active) return a.active ? -1 : 1;
  return a.id - b.id;
}

function tambah(peta: Map<string, Kandidat[]>, kunci: string | null, m: Kandidat) {
  if (!kunci) return;
  const daftar = peta.get(kunci);
  if (daftar) daftar.push(m);
  else peta.set(kunci, [m]);
}

export type Pencocok = {
  /** Mengembalikan materialId, atau null bila tidak ketemu ATAU ambigu. */
  cocokkan(sapAtauKode: string | null | undefined, barcode: string | null | undefined): number | null;
  jumlahMaterial: number;
};

/**
 * Muat master SEKALI, lalu cocokkan ribuan baris di memori.
 *
 * Jalur scan boleh bertanya ke database per baris — satu scan, satu baris.
 * Pencocokan ulang tidak boleh: 2.000 baris x 3 query = 6.000 perjalanan ke
 * Singapura. Pelajaran yang sama dengan seed master yang dulu makan 44 detik
 * per 100 baris.
 */
export async function buatPencocok(): Promise<Pencocok> {
  const materials = await prisma.material.findMany({
    select: {
      id: true, active: true,
      normSapIeg: true, normSapEji: true,
      normBarcodeProduct: true, normBarcodeBpom: true,
    },
  });

  const sap = new Map<string, Kandidat[]>();
  const produk = new Map<string, Kandidat[]>();
  const bpom = new Map<string, Kandidat[]>();

  for (const m of materials) {
    tambah(sap, m.normSapIeg, m);
    tambah(sap, m.normSapEji, m);
    tambah(produk, m.normBarcodeProduct, m);
    tambah(bpom, m.normBarcodeBpom, m);
  }
  // Array.from, bukan iterasi langsung: tsconfig proyek tidak menyetel
  // "target", jadi TypeScript memakai ES5 dan menolak iterasi Map.
  for (const peta of [sap, produk, bpom]) for (const d of Array.from(peta.values())) d.sort(urut);

  return {
    jumlahMaterial: materials.length,
    cocokkan(sapAtauKode, barcode) {
      const nSap = normalizeCode(sapAtauKode);
      if (nSap) {
        // Kode SAP: ambil kandidat terbaik, TIDAK dicek ambigu — sama seperti
        // findFirst di jalur scan.
        const d = sap.get(nSap);
        if (d && d.length > 0) return d[0].id;
      }

      const nBar = normalizeCode(barcode);
      if (nBar) {
        // Barcode produk diutamakan; ia jauh lebih unik daripada barcode BPOM.
        const p = (produk.get(nBar) ?? []).slice(0, 3);
        const pAktif = p.filter((m) => m.active);
        if (pAktif.length === 1) return pAktif[0].id;
        if (pAktif.length === 0 && p.length === 1) return p[0].id;
        // Lebih dari satu yang aktif = ambigu. BERHENTI di sini, jangan jatuh
        // ke BPOM — persis seperti jalur scan.
        if (pAktif.length > 1) return null;

        const b = (bpom.get(nBar) ?? []).slice(0, 3);
        const bAktif = b.filter((m) => m.active);
        if (bAktif.length === 1) return bAktif[0].id;
        if (bAktif.length === 0 && b.length === 1) return b[0].id;
      }

      // Ambigu dikembalikan sebagai null, BUKAN kandidat pertama. Satu
      // registrasi BPOM bisa mencakup beberapa varian ukuran; memilih diam-diam
      // akan menukar hitungan antar varian tanpa jejak.
      return null;
    },
  };
}

export type HasilTaut = {
  diperiksa: number;
  tertaut: number;
  masihBelum: number;
  terpotong: boolean;
  jumlahMaterial: number;
};

const BATAS_PERIKSA = 20_000;

/**
 * Cocokkan ulang scan yang belum tertaut ke master.
 *
 * Hanya menyentuh baris ber-materialId NULL. Baris yang sudah tertaut tidak
 * pernah dipindahkan: SKU OCS-nya memang sudah ikut master secara otomatis
 * karena dibaca lewat relasi, bukan disalin saat scan. Memindahkan tautan yang
 * sudah ada berarti mengubah angka hasil hitung yang sudah dipercaya orang.
 */
export async function tautkanUlang(opts?: { sessionId?: number | null }): Promise<HasilTaut> {
  const belum = await prisma.soEntry.findMany({
    where: {
      materialId: null,
      ...(opts?.sessionId ? { sessionId: opts.sessionId } : {}),
    },
    select: { id: true, rawMaterialText: true, rawBarcode: true },
    take: BATAS_PERIKSA,
  });

  const pencocok = await buatPencocok();

  // Dikelompokkan per material supaya penulisannya jadi beberapa pernyataan,
  // bukan satu pernyataan per baris.
  const perMaterial = new Map<number, number[]>();
  for (const e of belum) {
    const id = pencocok.cocokkan(e.rawMaterialText, e.rawBarcode);
    if (id === null) continue;
    const daftar = perMaterial.get(id);
    if (daftar) daftar.push(e.id);
    else perMaterial.set(id, [e.id]);
  }

  let tertaut = 0;
  for (const [materialId, ids] of Array.from(perMaterial.entries())) {
    const UKURAN = 500;
    for (let i = 0; i < ids.length; i += UKURAN) {
      const bagian = ids.slice(i, i + UKURAN);
      const r = await prisma.soEntry.updateMany({
        where: { id: { in: bagian }, materialId: null },
        data: { materialId },
      });
      tertaut += r.count;
    }
  }

  return {
    diperiksa: belum.length,
    tertaut,
    masihBelum: belum.length - tertaut,
    terpotong: belum.length === BATAS_PERIKSA,
    jumlahMaterial: pencocok.jumlahMaterial,
  };
}

/**
 * Versi aman-untuk-dipanggil-sambil-lalu.
 *
 * Dipakai setelah master berubah. Kegagalannya TIDAK BOLEH menggagalkan
 * penyimpanan masternya — material yang batal tersimpan jauh lebih merugikan
 * daripada penautan yang tertunda, dan penautan selalu bisa dijalankan lagi
 * lewat tombol di halaman Data SO.
 */
export async function tautkanUlangDiamDiam(): Promise<HasilTaut | null> {
  try {
    return await tautkanUlang();
  } catch (e) {
    console.error('[tautkanUlang] gagal, master tetap tersimpan', e);
    return null;
  }
}
