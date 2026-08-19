/**
 * Periksa bentuk DATABASE_URL tanpa membocorkan password.
 *   node scripts/check-db-url.mjs
 *
 * Dibuat karena `prisma db push` melaporkan nama database yang aneh ketika
 * URL-nya salah bentuk — pesannya menyesatkan (mengeluh soal transport tidak
 * aman) padahal sebabnya parameter SSL tidak pernah terbaca.
 */
import { readFileSync, existsSync } from 'node:fs';

function loadEnv() {
  for (const f of ['.env', '.env.local']) {
    if (!existsSync(f)) continue;
    for (const line of readFileSync(f, 'utf8').split('\n')) {
      const m = line.match(/^\s*DATABASE_URL\s*=\s*(.*)\s*$/);
      if (m) {
        let v = m[1].trim();
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
          v = v.slice(1, -1);
        }
        return { value: v, file: f, quoted: /^["']/.test(m[1].trim()) };
      }
    }
  }
  return null;
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
