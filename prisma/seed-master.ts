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

async function main() {
  console.log(`[seed] membaca ${FILE}${DRY ? ' (DRY RUN — tidak menulis apa pun)' : ''}`);
  const wb = XLSX.readFile(FILE);

  // ── MATERIAL ─────────────────────────────────────────────────────────────
  const mats = readSheet(wb, 'Material', 'Kode OCS');
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

    if (!DRY) {
      await prisma.material.upsert({ where: { ocsCode }, create: data, update: data });
    }
    mIn++;
  }
  console.log(`[seed] material: ${mIn} dimuat, ${mSkip} dilewati, ${mOff} ditandai tidak aktif`);

  // ── BIN ──────────────────────────────────────────────────────────────────
  const bins = readSheet(wb, 'Bin', 'Kode Bin');
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

    if (!DRY) {
      await prisma.bin.upsert({ where: { normCode }, create: data, update: data });
    }
    bIn++;
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
