/**
 * Periksa bentuk DATABASE_URL tanpa membocorkan password.
 *   node scripts/check-db-url.mjs
 *
 * Dibuat karena `prisma db push` melaporkan nama database yang aneh ketika
 * URL-nya salah bentuk — pesannya menyesatkan (mengeluh soal transport tidak
 * aman) padahal sebabnya parameter SSL tidak pernah terbaca.
 */
import { readFileSync, existsSync } from 'node:fs';

function bacaSatu(f) {
  if (!existsSync(f)) return null;
  for (const line of readFileSync(f, 'utf8').split('\n')) {
    const m = line.match(/^\s*DATABASE_URL\s*=\s*(.*)\s*$/);
    if (m) {
      let v = m[1].trim();
      const quoted = /^["']/.test(v);
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      return { value: v, file: f, quoted };
    }
  }
  return null;
}

function namaDb(u) {
  try { return decodeURIComponent(new URL(u).pathname.replace(/^\//, '')); } catch { return null; }
}

/**
 * PENTING — dua alat membaca berkas yang BERBEDA:
 *   • Prisma CLI (db:push, seed) hanya membaca `.env`
 *   • Next.js (dev, build) memprioritaskan `.env.local` DI ATAS `.env`
 *
 * Kalau keduanya memuat DATABASE_URL yang berbeda, Anda bisa membuat tabel di
 * satu database lalu membacanya dari database lain — dan gejalanya muncul
 * sebagai "tabel tidak ada" padahal db:push jelas berhasil.
 */
function loadEnv() {
  const dariEnv = bacaSatu('.env');
  const dariLocal = bacaSatu('.env.local');

  if (dariEnv && dariLocal) {
    const a = namaDb(dariEnv.value), b = namaDb(dariLocal.value);
    console.log('PERINGATAN     : DATABASE_URL ada di .env DAN .env.local');
    console.log(`                 Prisma CLI (db:push, seed) memakai .env       → database "${a ?? '?'}"`);
    console.log(`                 Next.js (dev, build) memakai .env.local        → database "${b ?? '?'}"`);
    if (a !== b) {
      console.log('                 ✗ KEDUANYA BERBEDA — tabel dibuat di satu tempat,');
      console.log('                   dibaca dari tempat lain. Samakan, atau hapus .env.local.');
    }
    console.log('');
  }
  return dariEnv ?? dariLocal;
}

const found = loadEnv();
if (!found) {
  console.error('DATABASE_URL tidak ditemukan di .env maupun .env.local');
  process.exit(1);
}

const { value: url, file, quoted } = found;
console.log(`Sumber          : ${file}`);
console.log(`Diapit kutip    : ${quoted ? 'ya' : 'TIDAK — sebaiknya diapit kutip ganda'}`);

let u;
try {
  u = new URL(url);
} catch {
  console.error('\nURL TIDAK BISA DIURAI sama sekali. Periksa apakah ada spasi atau baris terpotong.');
  process.exit(1);
}

const dbName = decodeURIComponent(u.pathname.replace(/^\//, ''));
const params = Object.fromEntries(u.searchParams.entries());

console.log(`Protokol        : ${u.protocol.replace(':', '')}`);
console.log(`Host            : ${u.hostname}`);
console.log(`Port            : ${u.port || '(kosong)'}`);
const rawUser = decodeURIComponent(u.username);
const rawPass = u.password ? decodeURIComponent(u.password) : '';
console.log(`User            : ${rawUser || '(kosong)'}`);
console.log(
  `Password        : ${
    u.password
      ? `ada, ${rawPass.length} karakter` +
        (rawPass.length !== u.password.length ? ` (tertulis ${u.password.length} karakter — ada %XX encoding)` : '')
      : 'TIDAK ADA'
  }`
);
console.log(`Nama database   : ${dbName || '(kosong)'}`);
console.log(`Parameter       : ${Object.keys(params).length ? JSON.stringify(params) : '(tidak ada)'}`);

const err = [];
const warn = [];

// Placeholder yang lupa diganti — penyebab "Access denied" yang paling sering,
// dan pesan Prisma tidak pernah menyebut bahwa nilainya masih contoh.
const PLACEHOLDER = /<[^>]*>|^USER$|^PASSWORD$|^user$|^password$|xxxx|YOUR_/;
if (PLACEHOLDER.test(rawUser)) err.push(`user masih berisi contoh/placeholder: "${rawUser}" — ganti dengan prefix asli dari TiDB Cloud`);
if (rawPass && PLACEHOLDER.test(rawPass)) err.push('password masih berisi contoh/placeholder — ganti dengan password asli');
if (u.hostname.includes('<') || u.hostname.includes('region')) err.push(`host masih berisi placeholder: "${u.hostname}"`);
if (dbName.includes('<')) err.push(`nama database masih berisi placeholder: "${dbName}"`);

if (u.protocol !== 'mysql:') err.push(`protokol harus "mysql", bukan "${u.protocol.replace(':', '')}"`);
if (!dbName) err.push('nama database KOSONG — harus ada di antara "/" dan "?"');

// TiDB menolak perubahan skema pada database sistem dengan P3004, dan pesannya
// tidak menyebutkan bahwa yang salah cuma satu kata di URL.
const SISTEM = ['sys', 'mysql', 'information_schema', 'performance_schema', 'metrics_schema'];
if (SISTEM.includes(dbName.toLowerCase())) {
  err.push(
    `"${dbName}" adalah DATABASE SISTEM — Prisma menolak membuat tabel di sini (error P3004). ` +
    `Ganti nama database di URL menjadi database aplikasi Anda, misalnya stock_opname.`
  );
} else if (dbName.toLowerCase() === 'test') {
  warn.push('database bernama "test" adalah bawaan TiDB Cloud — pastikan itu memang yang Anda maksud');
}
if (dbName.includes('=') || dbName.includes('&')) {
  err.push(`nama database berisi "=" atau "&" → tanda "?" sebelum parameter hilang. ` +
           `Sekarang terbaca sebagai nama database: "${dbName}"`);
}
if (params.sslaccept !== 'strict') err.push('parameter sslaccept=strict TIDAK terbaca — TiDB akan menolak koneksi');
if (u.port !== '4000') warn.push(`port ${u.port} tidak biasa untuk TiDB Cloud (umumnya 4000)`);
if (!rawUser.includes('.')) {
  err.push('user TiDB Cloud Serverless WAJIB berbentuk "<prefix>.root" — prefix cluster tidak boleh dihilangkan');
} else {
  const prefix = rawUser.split('.')[0];
  if (!/^[A-Za-z0-9]{4,}$/.test(prefix)) {
    warn.push(`prefix user "${prefix}" tidak seperti prefix TiDB Cloud (biasanya huruf+angka, mis. "3xK9pQmR2sT")`);
  }
}
if (rawPass && /[@/:?#&%+ ]/.test(rawPass) && rawPass === u.password) {
  warn.push('password mengandung karakter khusus dan tampaknya BELUM di-encode — ' +
            'ganti @ → %40, / → %2F, : → %3A, # → %23, ? → %3F');
}

console.log('');
if (err.length) {
  console.log('MASALAH:');
  err.forEach((e) => console.log('  ✗ ' + e));
} else {
  console.log('  ✓ Bentuk URL sudah benar.');
}
if (warn.length) {
  console.log('Perlu diperiksa:');
  warn.forEach((w) => console.log('  ! ' + w));
}

console.log('\nDi mana mengambil nilainya:');
console.log('  TiDB Cloud → cluster Anda → tombol Connect → Connect With: Prisma');
console.log('  Salin UTUH string yang ditampilkan di sana, jangan diketik ulang.');
console.log('  Lupa password? Di layar yang sama ada tombol Reset Password.');
console.log('\nBentuk yang benar:');
console.log('  mysql://<user>.root:<password>@gateway01.ap-southeast-1.prod.aws.tidbcloud.com:4000/<nama_db>?sslaccept=strict');
console.log('                                                                                        ^^^^^^^^^ ^');
console.log('                                                                                        nama db   tanda tanya');
process.exit(err.length ? 1 : 0);
