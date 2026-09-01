/**
 * Seed master material & bin dari MASTER_GABUNGAN_v2.xlsx
 *
 *   npx tsx prisma/seed-master.ts [path/ke/MASTER_GABUNGAN_v2.xlsx]
 *   npx tsx prisma/seed-master.ts --dry-run     # hanya laporkan, tidak menulis
 *
 * Idempoten: memakai upsert dengan kunci alami (ocsCode / code bin), jadi aman
 * dijalankan berulang kali. Menjalankan ulang setelah Anda menyunting file
 * tinjauan akan MEMPERBARUI baris yang ada, bukan menggandakannya.
 */
import * as XLSX from 'xlsx';
import { PrismaClient, Prisma } from '@prisma/client';
import { cleanValue, normalizeCode, normalizeBin } from '../src/lib/normalize';

const prisma = new PrismaClient();

const FILE = process.argv.find((a) => a.endsWith('.xlsx')) ?? 'MASTER_GABUNGAN_v2.xlsx';
const DRY = process.argv.includes('--dry-run');

/**
 * Jumlah baris per PERNYATAAN SQL.
 *
 * Riwayat singkat, supaya tidak diulang: versi pertama memakai
 * `prisma.material.upsert()` satu per satu — Prisma menerjemahkan tiap upsert
 * jadi DUA query (cek dulu, baru tulis), sehingga 562 material = 1.124
 * perjalanan bolak-balik ke Singapura. Terukur ~44 detik per 100 baris.
 *
 * Membungkusnya dalam `$transaction([...])` TIDAK menolong: transaksi hanya
 * menyatukan commit, perjalanan jaringannya tetap satu per pernyataan.
 *
 * Yang benar adalah satu pernyataan `INSERT ... ON DUPLICATE KEY UPDATE` berisi
 * banyak baris. 562 material jadi 3 pernyataan, bukan 1.124.
 *
 * 200 baris × ~18 kolom ≈ 3.600 placeholder, jauh di bawah batas 65.535.
 */
const UKURAN_BATCH = 200;

function detik(ms: number) { return (ms / 1000).toFixed(1) + 's'; }

/** Cari baris header berdasarkan kolom yang pasti ada — jangan asumsikan nomor
 *  barisnya, karena file tinjauan punya beberapa baris legenda di atas. */
function readSheet(wb: XLSX.WorkBook, sheetName: string, anchor: string) {
  const ws = wb.Sheets[sheetName];
  if (!ws) throw new Error(`Sheet "${sheetName}" tidak ditemukan di ${FILE}`);
  const grid = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: '', raw: false });
  const headerRow = grid.findIndex((r) => r.some((c) => cleanValue(c) === anchor));
  if (headerRow < 0) throw new Error(`Kolom "${anchor}" tidak ditemukan di sheet ${sheetName}`);
  const headers = grid[headerRow].map((c) => cleanValue(c));
  return grid.slice(headerRow + 1)
    .filter((r) => r.some((c) => cleanValue(c) !== ''))
    .map((r) => Object.fromEntries(headers.map((h, i) => [h, cleanValue(r[i])])));
}

/** Keputusan yang Anda tulis di kolom kuning. Kosong = pakai apa adanya. */
function parseDecision(v: string): 'skip' | 'nonaktif' | 'ok' {
  const s = v.toLowerCase().trim();
  if (!s) return 'ok';
  if (/^(hapus|buang|batal|jangan)/.test(s)) return 'skip';
  if (/nonaktif|non-aktif|tidak aktif/.test(s)) return 'nonaktif';
  return 'ok';
}


/**
 * Tulis banyak baris dalam SATU pernyataan.
 *
 * Nama tabel memakai @@map (materials/bins), tapi nama KOLOM mengikuti nama
 * field Prisma apa adanya karena tidak ada @map di level field — jadi camelCase,
 * dan wajib dikutip backtick di MySQL/TiDB.
 *
 * `createdAt` hanya diisi saat baris baru; `updatedAt` selalu diperbarui.
 * Keduanya diisi eksplisit karena `@updatedAt` adalah perilaku Prisma Client,
 * bukan default kolom — jalur SQL mentah tidak melewatinya.
 *
 * Kalau jalur cepat ini gagal karena alasan apa pun, seed TIDAK berhenti:
 * ia mundur ke upsert per baris yang lebih lambat tapi pasti jalan.
 */
async function tulisMaterial(rows: Prisma.MaterialUncheckedCreateInput[]) {
  try {
    const nilai = rows.map(
      (d) => Prisma.sql`(${d.ocsCode}, ${d.name}, ${d.category ?? null}, ${d.sapCodeIeg ?? null}, ${d.sapCodeEji ?? null},
        ${d.barcodeProduct ?? null}, ${d.barcodeBpom ?? null}, ${d.normOcsCode}, ${d.normSapIeg ?? null},
        ${d.normSapEji ?? null}, ${d.normBarcodeProduct ?? null}, ${d.normBarcodeBpom ?? null},
        ${d.active ?? true}, ${d.source ?? null}, ${d.reviewNote ?? null}, NOW(3), NOW(3))`
    );
    await prisma.$executeRaw`
      INSERT INTO \`materials\`
        (\`ocsCode\`, \`name\`, \`category\`, \`sapCodeIeg\`, \`sapCodeEji\`,
         \`barcodeProduct\`, \`barcodeBpom\`, \`normOcsCode\`, \`normSapIeg\`,
         \`normSapEji\`, \`normBarcodeProduct\`, \`normBarcodeBpom\`,
         \`active\`, \`source\`, \`reviewNote\`, \`createdAt\`, \`updatedAt\`)
      VALUES ${Prisma.join(nilai)}
      ON DUPLICATE KEY UPDATE
        \`name\` = VALUES(\`name\`), \`category\` = VALUES(\`category\`),
        \`sapCodeIeg\` = VALUES(\`sapCodeIeg\`), \`sapCodeEji\` = VALUES(\`sapCodeEji\`),
        \`barcodeProduct\` = VALUES(\`barcodeProduct\`), \`barcodeBpom\` = VALUES(\`barcodeBpom\`),
        \`normOcsCode\` = VALUES(\`normOcsCode\`), \`normSapIeg\` = VALUES(\`normSapIeg\`),
        \`normSapEji\` = VALUES(\`normSapEji\`), \`normBarcodeProduct\` = VALUES(\`normBarcodeProduct\`),
        \`normBarcodeBpom\` = VALUES(\`normBarcodeBpom\`), \`active\` = VALUES(\`active\`),
        \`source\` = VALUES(\`source\`), \`reviewNote\` = VALUES(\`reviewNote\`),
        \`updatedAt\` = NOW(3)`;
  } catch (e: any) {
    console.warn(`[seed] jalur cepat material gagal (${e?.message ?? e}) — mundur ke upsert per baris`);
    for (const d of rows) {
      await prisma.material.upsert({ where: { ocsCode: d.ocsCode }, create: d, update: d });
    }
  }
}

async function tulisBin(rows: Prisma.BinUncheckedCreateInput[]) {
  try {
    const nilai = rows.map(
      (d) => Prisma.sql`(${d.code}, ${d.normCode}, ${d.binType ?? null}, ${d.warehouse ?? null},
        ${d.description ?? null}, ${d.active ?? true}, ${d.needsReview ?? false},
        ${d.scanCount ?? 0}, ${d.variants ?? null}, NOW(3), NOW(3))`
    );
    await prisma.$executeRaw`
      INSERT INTO \`bins\`
        (\`code\`, \`normCode\`, \`binType\`, \`warehouse\`, \`description\`,
         \`active\`, \`needsReview\`, \`scanCount\`, \`variants\`, \`createdAt\`, \`updatedAt\`)
      VALUES ${Prisma.join(nilai)}
      ON DUPLICATE KEY UPDATE
        \`code\` = VALUES(\`code\`), \`binType\` = VALUES(\`binType\`),
        \`warehouse\` = VALUES(\`warehouse\`), \`description\` = VALUES(\`description\`),
        \`active\` = VALUES(\`active\`), \`needsReview\` = VALUES(\`needsReview\`),
        \`scanCount\` = VALUES(\`scanCount\`), \`variants\` = VALUES(\`variants\`),
        \`updatedAt\` = NOW(3)`;
  } catch (e: any) {
    console.warn(`[seed] jalur cepat bin gagal (${e?.message ?? e}) — mundur ke upsert per baris`);
    for (const d of rows) {
      await prisma.bin.upsert({ where: { normCode: d.normCode }, create: d, update: d });
    }
  }
}

async function main() {
  console.log(`[seed] membaca ${FILE}${DRY ? ' (DRY RUN — tidak menulis apa pun)' : ''}`);
  const wb = XLSX.readFile(FILE);
  console.log('[seed] berkas terbaca, menyiapkan data...');

  // ── MATERIAL ─────────────────────────────────────────────────────────────
  const antreanMaterial: Prisma.MaterialUncheckedCreateInput[] = [];
  const antreanBin: Prisma.BinUncheckedCreateInput[] = [];

  const mats = readSheet(wb, 'Material', 'Kode OCS');
  console.log(`[seed] ${mats.length} baris material terbaca dari berkas`);
  let mIn = 0, mSkip = 0, mOff = 0;
  const seenOcs = new Set<string>();

  for (const r of mats) {
    const ocsCode = r['Kode OCS'];
    if (!ocsCode) continue;
    const decision = parseDecision(r['KEPUTUSAN ANDA'] ?? '');
    if (decision === 'skip') { mSkip++; continue; }

    const norm = normalizeCode(ocsCode);
    if (seenOcs.has(norm)) { mSkip++; continue; }   // kembar dalam file itu sendiri
    seenOcs.add(norm);

    const active = decision === 'nonaktif' ? false : r['Aktif'] !== 'Tidak';
    if (!active) mOff++;

    const data = {
      ocsCode,
      name: r['Nama Produk'] || ocsCode,
      category: r['Kategori'] || null,
      sapCodeIeg: r['SAP IEG'] || null,
      sapCodeEji: r['SAP EJI'] || null,
      barcodeProduct: r['Barcode Produk'] || null,
      barcodeBpom: r['Barcode BPOM'] || null,
      normOcsCode: norm,
      normSapIeg: normalizeCode(r['SAP IEG']) || null,
      normSapEji: normalizeCode(r['SAP EJI']) || null,
      normBarcodeProduct: normalizeCode(r['Barcode Produk']) || null,
      normBarcodeBpom: normalizeCode(r['Barcode BPOM']) || null,
      active,
      source: r['Sumber'] || null,
      reviewNote: r['Catatan'] || null,
    } satisfies Prisma.MaterialUncheckedCreateInput;

    antreanMaterial.push(data);
    mIn++;
  }

  if (!DRY && antreanMaterial.length) {
    const t0 = Date.now();
    for (let i = 0; i < antreanMaterial.length; i += UKURAN_BATCH) {
      const bagian = antreanMaterial.slice(i, i + UKURAN_BATCH);
      await tulisMaterial(bagian);
      console.log(`[seed] material ${Math.min(i + bagian.length, antreanMaterial.length)}/${antreanMaterial.length} (${detik(Date.now() - t0)})`);
    }
  }
  console.log(`[seed] material: ${mIn} dimuat, ${mSkip} dilewati, ${mOff} ditandai tidak aktif`);

  // ── BIN ──────────────────────────────────────────────────────────────────
  const bins = readSheet(wb, 'Bin', 'Kode Bin');
  console.log(`[seed] ${bins.length} baris bin terbaca dari berkas`);
  let bIn = 0, bSkip = 0, bReview = 0;
  const seenBin = new Set<string>();

  for (const r of bins) {
    const raw = r['Kode Bin'];
    if (!raw) continue;
    if (parseDecision(r['KEPUTUSAN ANDA'] ?? '') === 'skip') { bSkip++; continue; }

    // Kunci sebenarnya adalah bentuk ternormalisasi; `code` hanya ejaan tampilan.
    const normCode = normalizeBin(raw);
    if (!normCode || seenBin.has(normCode)) { bSkip++; continue; }
    seenBin.add(normCode);
    const code = cleanValue(raw).toUpperCase().trim();

    const needsReview = (r['Status'] || '').toLowerCase() !== 'ok';
    if (needsReview) bReview++;

    const data = {
      code,
      normCode,
      binType: r['Tipe'] || null,
      scanCount: parseInt(r['Jumlah Scan'] || '0', 10) || 0,
      variants: (r['Variasi Penulisan Asli'] || '').slice(0, 255) || null,
      needsReview,
      active: true,
    } satisfies Prisma.BinUncheckedCreateInput;

    antreanBin.push(data);
    bIn++;
  }

  if (!DRY && antreanBin.length) {
    const t0 = Date.now();
    for (let i = 0; i < antreanBin.length; i += UKURAN_BATCH) {
      const bagian = antreanBin.slice(i, i + UKURAN_BATCH);
      await tulisBin(bagian);
      console.log(`[seed] bin ${Math.min(i + bagian.length, antreanBin.length)}/${antreanBin.length} (${detik(Date.now() - t0)})`);
    }
  }
  console.log(`[seed] bin: ${bIn} dimuat, ${bSkip} dilewati, ${bReview} bertanda perlu ditinjau`);

  // ── Peringatan yang layak dibaca ─────────────────────────────────────────
  const tanpaBarcode = mats.filter((r) => !r['Barcode Produk'] && !r['Barcode BPOM']).length;
  const tanpaSap = mats.filter((r) => !r['SAP IEG'] && !r['SAP EJI']).length;
  const konflik = mats.filter((r) => r['Catatan']).length;
  console.log('');
  console.log(`[seed] ${tanpaBarcode} material TANPA barcode apa pun — tidak akan pernah bisa discan`);
  console.log(`[seed] ${tanpaSap} material tanpa kode SAP — tidak akan ketemu dari scan Gudang Besar`);
  console.log(`[seed] ${konflik} material punya catatan konflik yang belum diselesaikan`);
  if (DRY) console.log('\n[seed] DRY RUN selesai — tidak ada yang ditulis ke database.');
}

main()
  .catch((e) => { console.error('[seed] GAGAL:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
