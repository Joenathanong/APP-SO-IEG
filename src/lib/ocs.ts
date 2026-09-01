/**
 * Klien sistem OCS (IEG Omni Channel System).
 *
 * Kontrak ini DITEMUKAN dengan menelusuri aplikasi OCS-nya langsung, bukan
 * ditebak, dan sudah diuji di peramban:
 *
 *   1) POST /Auth/Login   {username, password, companydb}  ->  { Token: "<JWT>" }
 *   2) GET  /odata/DTO_WmsItemStockLiteV2?$top=100000
 *      dengan header  Authorization: Bearer <Token>
 *
 * Hasil uji autentikasi (tanpa cookie sama sekali):
 *   Authorization: Bearer <token>  -> 200
 *   Authorization: <token>         -> 401   (WAJIB pakai awalan "Bearer ")
 *   tanpa header                   -> 401
 *
 * Seluruh 2.467 baris datang dalam SATU respons — tidak ada @odata.nextLink,
 * jadi tidak perlu paginasi. Sudah diverifikasi: $count=true melaporkan 2467
 * dan permintaan tanpa $top pun mengembalikan jumlah yang sama.
 */

const BASE = (process.env.OCS_BASE_URL ?? 'https://ocs.iegsystem.id').replace(/\/+$/, '');
const DB = process.env.OCS_COMPANY_DB ?? 'EJI_WMS';
const BATAS_LOGIN_MS = 20_000;
const BATAS_TARIK_MS = 60_000;

export class OcsError extends Error {
  constructor(message: string, readonly sebab: 'konfigurasi' | 'kredensial' | 'jaringan' | 'server') {
    super(message);
    this.name = 'OcsError';
  }
}

/** Satu baris stok OCS, sudah dibersihkan dari hal-hal yang tidak kita pakai. */
export type BarisStokOcs = {
  sku: string;
  nama: string;
  sapCode: string | null;
  kategori: string;
  qtyOnHand: number;
  qtyGudangKecil: number;
  qtyGudangBesar: number;
  aktif: boolean;
};

async function ambilDenganBatas(url: string, init: RequestInit, batasMs: number) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), batasMs);
  try {
    return await fetch(url, { ...init, signal: ac.signal, cache: 'no-store' });
  } catch (e: any) {
    if (e?.name === 'AbortError') {
      throw new OcsError(`OCS tidak menjawab dalam ${batasMs / 1000} detik`, 'jaringan');
    }
    throw new OcsError(`Tidak bisa menghubungi OCS: ${e?.message ?? e}`, 'jaringan');
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Token disimpan di memori proses supaya penarikan beruntun tidak login berkali-kali.
 * Sengaja TIDAK disimpan ke database: token ini setara kata sandi, dan umurnya
 * pendek. Kalau proses serverless-nya berganti, login ulang harganya murah.
 */
let cacheToken: { nilai: string; kedaluwarsa: number } | null = null;

async function login(): Promise<string> {
  const user = process.env.OCS_USERNAME;
  const pass = process.env.OCS_PASSWORD;
  if (!user || !pass) {
    throw new OcsError(
      'OCS_USERNAME / OCS_PASSWORD belum diisi di environment variable. ' +
        'Isi di .env untuk lokal dan di Vercel untuk produksi.',
      'konfigurasi'
    );
  }

  const res = await ambilDenganBatas(
    `${BASE}/Auth/Login`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ username: user, password: pass, companydb: DB }),
    },
    BATAS_LOGIN_MS
  );

  if (res.status === 401 || res.status === 400) {
    throw new OcsError('OCS menolak kredensial. Periksa OCS_USERNAME / OCS_PASSWORD / OCS_COMPANY_DB.', 'kredensial');
  }
  if (!res.ok) {
    throw new OcsError(`OCS membalas HTTP ${res.status} saat login.`, 'server');
  }

  let data: any;
  try {
    data = await res.json();
  } catch {
    throw new OcsError('Balasan login OCS bukan JSON.', 'server');
  }

  const token = data?.Token;
  if (typeof token !== 'string' || !token) {
    // Sengaja TIDAK mencetak isi balasan: bisa memuat token atau data akun.
    throw new OcsError('Balasan login OCS tidak memuat field "Token".', 'server');
  }

  // Sengaja TIDAK membaca masa berlaku dari isi JWT-nya. Itu menambah kode
  // penguraian base64 yang berbeda perilakunya antar runtime (Node vs Edge),
  // demi keuntungan yang nol: kalau token ternyata sudah mati, permintaan
  // berikutnya membalas 401 dan kita login ulang sekali. Umur pendek yang
  // pasti benar lebih baik daripada umur tepat yang bisa salah baca.
  cacheToken = { nilai: token, kedaluwarsa: Date.now() + 10 * 60_000 };
  return token;
}

async function token(paksaBaru = false): Promise<string> {
  if (!paksaBaru && cacheToken && cacheToken.kedaluwarsa > Date.now()) return cacheToken.nilai;
  cacheToken = null;
  return login();
}

/**
 * Tarik seluruh stok dari OCS.
 *
 * Baris berkategori "Bundle" DIBUANG. Alasannya terukur, bukan selera: dari
 * 1.806 baris Bundle, NOL yang punya QtyGudangKecil atau QtyGudangBesar bukan
 * nol, padahal 1.661 punya QtyOnHand bukan nol. Artinya Bundle adalah angka
 * turunan dari komponennya, bukan barang yang berdiri sendiri di rak.
 * Memasukkannya berarti menghitung barang yang sama dua kali.
 *
 * Kategori "Gimmick" TETAP DIBAWA — 121 dari 196 baris punya qty gudang nyata,
 * dan master material Anda memang sudah berisi kode GIMMICK-*.
 */
export async function tarikStokOcs(): Promise<BarisStokOcs[]> {
  const url = `${BASE}/odata/DTO_WmsItemStockLiteV2?$top=100000`;

  const minta = async (t: string) =>
    ambilDenganBatas(url, { headers: { Accept: 'application/json', Authorization: `Bearer ${t}` } }, BATAS_TARIK_MS);

  let res = await minta(await token());
  // Token bisa kedaluwarsa lebih cepat dari perkiraan kita. Sekali coba ulang
  // dengan token baru, lalu menyerah — bukan perulangan tanpa batas.
  if (res.status === 401) res = await minta(await token(true));

  if (res.status === 401) {
    throw new OcsError('OCS menolak token walau sudah login ulang. Periksa hak akses akun.', 'kredensial');
  }
  if (!res.ok) {
    throw new OcsError(`OCS membalas HTTP ${res.status} saat mengambil stok.`, 'server');
  }

  let data: any;
  try {
    data = await res.json();
  } catch {
    throw new OcsError('Balasan stok OCS bukan JSON.', 'server');
  }

  const nilai = data?.value;
  if (!Array.isArray(nilai)) {
    throw new OcsError('Balasan stok OCS tidak memuat array "value".', 'server');
  }
  if (data['@odata.nextLink']) {
    // Belum pernah terjadi, tapi kalau OCS suatu saat menyalakan paginasi,
    // diam-diam menyimpan sebagian data jauh lebih buruk daripada berhenti.
    throw new OcsError(
      'OCS mulai memecah hasil ke beberapa halaman (@odata.nextLink). ' +
        'Penarikan dihentikan supaya tidak menyimpan saldo yang tidak lengkap.',
      'server'
    );
  }

  const angka = (v: any) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

  return nilai
    .filter((r: any) => r?.Category !== 'Bundle')
    .map((r: any) => ({
      sku: String(r.Sku ?? '').trim(),
      nama: String(r.Name ?? '').trim(),
      // SapCode "0" dan "" sama-sama berarti tidak ada — 2.008 baris seperti itu.
      sapCode: r.SapCode && String(r.SapCode).trim() !== '0' ? String(r.SapCode).trim() : null,
      kategori: String(r.Category ?? '').trim(),
      qtyOnHand: angka(r.QtyOnHand),
      qtyGudangKecil: angka(r.QtyGudangKecil),
      qtyGudangBesar: angka(r.QtyGudangBesar),
      aktif: Boolean(r.IsActive),
    }))
    .filter((r: BarisStokOcs) => r.sku !== '');
}

/** Nama snapshot yang diminta: stock-ocs-(nama sesi). */
export function namaSnapshot(namaSesi: string): string {
  return `stock-ocs-${namaSesi}`.slice(0, 160);
}
