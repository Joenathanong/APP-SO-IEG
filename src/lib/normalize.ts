/**
 * Normalisasi kode untuk pencocokan — SATU sumber kebenaran.
 *
 * Dipakai di dua tempat yang harus selalu sepakat:
 *   1. seed & import master (mengisi kolom norm* di database)
 *   2. lookup saat scan (menyusun WHERE-nya)
 * Kalau keduanya memakai aturan berbeda, lookup gagal tanpa error apa pun —
 * persis penyakit app lama.
 */

/**
 * Bersihkan nilai mentah jadi teks yang bisa dipercaya.
 *
 * Excel/Sheets menyimpan kode numerik sebagai angka, sehingga saat diekspor
 * "1201010408" berubah jadi "1201010408.0" dan "8998824556112" jadi
 * "8998824556112.0". Sufiks itu HARUS dibuang sebelum apa pun, kalau tidak
 * seluruh pencocokan meleset.
 */
export function cleanValue(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = String(v).trim();
  return /^-?\d+\.0$/.test(s) ? s.slice(0, -2) : s;
}

/**
 * Normalisasi untuk pencarian: huruf kecil, tanpa spasi, tanpa nol di depan.
 *
 * Nol di depan dibuang karena barcode SAP di Gudang Besar sering ber-padding
 * ("000000000012345") sementara master menyimpannya sebagai angka ("12345").
 * Itu penyebab langsung kolom Kode OCS banyak yang kosong di app lama.
 *
 * Nilai yang seluruhnya nol dikembalikan sebagai "0", bukan string kosong,
 * supaya bisa dibedakan dari "tidak ada nilai".
 */
export function normalizeCode(v: unknown): string {
  const s = cleanValue(v).toLowerCase().replace(/\s+/g, '');
  if (!s) return '';
  const stripped = s.replace(/^0+/, '');
  return stripped === '' ? '0' : stripped;
}

/**
 * Normalisasi kode bin/lokasi.
 *
 * Audit menemukan 939 lokasi unik untuk jumlah bin sebenarnya yang jauh lebih
 * sedikit, karena penulisannya bervariasi: "RK-01-01-04" vs "RK-01-0104",
 * "RACKING BAK" vs "RACKING-BAK", "RK.02.03.06", "RP.-08-05-01", "RP 10-04-05".
 * Titik dan spasi diseragamkan jadi tanda hubung, lalu hubung ganda dirapatkan.
 */
export function normalizeBin(v: unknown): string {
  let s = cleanValue(v).toUpperCase().trim();
  if (!s) return '';
  s = s.replace(/[.\s]+/g, '-');
  s = s.replace(/-+/g, '-').replace(/^-|-$/g, '');
  return s;
}

/** Prefix kode SAP milik entitas EJI. Selain ini dianggap IEG. */
export const EJI_PREFIXES = ['1222', '1227', '1228'] as const;

/**
 * Tentukan sebuah kode SAP milik IEG atau EJI.
 *
 * `Master_Gudang_Kecil` menyimpan keduanya bercampur di SATU kolom "kode SAP"
 * (352 baris berisi kode IEG, 72 berisi EJI). Aturan prefix di bawah diuji ke
 * seluruh 424 baris Resume_SO yang memisahkan keduanya secara eksplisit:
 * nol pelanggaran di kedua arah.
 *
 * Kalau suatu saat muncul prefix baru, tambahkan ke EJI_PREFIXES — jangan
 * menebak dari panjang atau pola lain.
 */
export function classifySapCode(code: unknown): 'IEG' | 'EJI' | null {
  const c = cleanValue(code);
  if (!c || c === '0') return null;
  return (EJI_PREFIXES as readonly string[]).includes(c.slice(0, 4)) ? 'EJI' : 'IEG';
}

/**
 * Apakah string ini barcode format Gudang Besar?
 *
 * Format GB dipisah titik koma dan punya banyak field. Audit menemukan 261
 * baris (5,2%) barcode GB yang terlanjur masuk ke sheet Gudang Kecil, salah
 * satunya berawalan "Ini" — ciri scanner menembak sebelum field siap. Penjaga
 * ini harus dipakai di KEDUA halaman, bukan hanya Gudang Kecil.
 */
export function looksLikeGudangBesarBarcode(raw: unknown): boolean {
  const s = cleanValue(raw);
  return (s.match(/;/g) || []).length > 1;
}
