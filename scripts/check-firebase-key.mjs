/**
 * Periksa bentuk kredensial Firebase Admin tanpa membocorkan kuncinya.
 *   node scripts/check-firebase-key.mjs
 *
 * Hanya bagian header PEM yang ditampilkan (`-----BEGIN PRIVATE KEY-----`),
 * yang bukan rahasia. Isi kuncinya tidak pernah dicetak — cuma panjang dan
 * bentuknya.
 *
 * Dibuat karena pesan bawaan Firebase ("Invalid PEM formatted message") tidak
 * menyebutkan sebabnya, dan penyebab tersering justru soal cara menuliskan
 * nilainya di .env — bukan kuncinya yang salah.
 */
import { readFileSync, existsSync } from 'node:fs';

const VARS = ['FIREBASE_ADMIN_PROJECT_ID', 'FIREBASE_ADMIN_CLIENT_EMAIL', 'FIREBASE_ADMIN_PRIVATE_KEY'];

/** Parser .env sederhana yang meniru perilaku dotenv, termasuk nilai multi-baris
 *  di dalam tanda kutip. */
function parseEnv(teks) {
  const hasil = {};
  const baris = teks.split(/\r?\n/);
  for (let i = 0; i < baris.length; i++) {
    const l = baris[i];
    const m = l.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    const nama = m[1];
    let nilai = m[2];
    const kutip = nilai[0] === '"' ? '"' : nilai[0] === "'" ? "'" : null;
    if (kutip) {
      nilai = nilai.slice(1);
      // kalau kutip penutup belum ada, nilainya berlanjut ke baris berikutnya
      while (!nilai.endsWith(kutip) && i + 1 < baris.length) {
        i++;
        nilai += '\n' + baris[i];
      }
      if (nilai.endsWith(kutip)) nilai = nilai.slice(0, -1);
      hasil[nama] = { nilai, multiBaris: nilai.includes('\n'), diKutip: true };
    } else {
      hasil[nama] = { nilai: nilai.trim(), multiBaris: false, diKutip: false };
    }
  }
  return hasil;
}

const berkas = ['.env.local', '.env'].filter(existsSync);
if (berkas.length === 0) {
  console.error('Tidak ada .env maupun .env.local di folder ini.');
  process.exit(1);
}

const perBerkas = {};
for (const f of berkas) perBerkas[f] = parseEnv(readFileSync(f, 'utf8'));

console.log(`Berkas terbaca : ${berkas.join(', ')}`);
if (berkas.includes('.env.local') && berkas.includes('.env')) {
  console.log('CATATAN        : Next.js memprioritaskan .env.local DI ATAS .env.');
}
console.log('');

let adaMasalah = false;

for (const v of VARS) {
  const sumber = berkas.filter((f) => perBerkas[f][v] !== undefined);
  console.log(`── ${v}`);
  if (sumber.length === 0) {
    console.log('   ✗ TIDAK ADA di berkas mana pun');
    adaMasalah = true;
    continue;
  }
  if (sumber.length > 1) {
    console.log(`   ! ada di ${sumber.join(' DAN ')} — yang dipakai: ${sumber[0]}`);
  }
  const { nilai, diKutip, multiBaris } = perBerkas[sumber[0]][v];

  if (v !== 'FIREBASE_ADMIN_PRIVATE_KEY') {
    // Nilai yang tertukar adalah kesalahan paling berbahaya: project ID dan
    // client email masuk ke URL permintaan, sehingga private key yang salah
    // tempat akan bocor ke log dan halaman error.
    const tampakKunci = /PRIVATE KEY|BEGIN [A-Z]/.test(nilai);
    console.log(`   sumber   : ${sumber[0]}`);
    console.log(`   panjang  : ${nilai.length} karakter`);
    console.log(`   nilai    : ${tampakKunci ? '(TIDAK DICETAK — berisi private key)' : (nilai || '(kosong)')}`);

    if (tampakKunci) {
      adaMasalah = true;
      console.log('');
      console.log('   ✗✗ BAHAYA: variabel ini berisi PRIVATE KEY, bukan nilai yang seharusnya.');
      console.log('      Nilai ini dikirim ke Google sebagai bagian URL permintaan, jadi kuncinya');
      console.log('      berisiko sudah tercatat di log server maupun halaman error.');
      console.log('      → GANTI private key di Google Cloud Console → IAM & Admin →');
      console.log('        Service Accounts → tab Keys → hapus yang lama, buat yang baru.');
      if (v.endsWith('PROJECT_ID')) {
        console.log('      → Isi variabel ini dengan field "project_id" dari file JSON');
        console.log('        (contoh: nama-project-12345).');
      } else {
        console.log('      → Isi variabel ini dengan field "client_email" dari file JSON.');
      }
    } else if (!nilai) {
      console.log('   ✗ KOSONG'); adaMasalah = true;
    } else if (v.endsWith('PROJECT_ID') && !/^[a-z0-9][a-z0-9-]{3,29}$/.test(nilai)) {
      console.log('   ✗ tidak berbentuk ID project (huruf kecil, angka, tanda hubung)'); adaMasalah = true;
    } else if (v.endsWith('CLIENT_EMAIL') && !nilai.endsWith('.iam.gserviceaccount.com')) {
      console.log('   ✗ tidak berbentuk email service account (@<project>.iam.gserviceaccount.com)'); adaMasalah = true;
    }
    console.log('');
    continue;
  }

  // ── Private key: bentuknya saja, isinya tidak dicetak ──────────────────────
  const adaEscapeN = /\\n/.test(nilai);
  const adaNewlineAsli = nilai.includes('\n');
  const awal = nilai.slice(0, 32).replace(/\\n/g, '\\n');

  console.log(`   sumber          : ${sumber[0]}`);
  console.log(`   diapit kutip    : ${diKutip ? 'ya' : 'TIDAK'}`);
  console.log(`   panjang         : ${nilai.length} karakter`);
  console.log(`   32 karakter awal: ${awal}`);
  console.log(`   baris baru asli : ${adaNewlineAsli ? `ya (${nilai.split('\n').length} baris)` : 'tidak'}`);
  console.log(`   teks \\n literal : ${adaEscapeN ? 'ya' : 'tidak'}`);

  // tiru normalisasi di src/lib/firebase-admin.ts
  let k = nilai.trim();
  if ((k.startsWith('"') && k.endsWith('"')) || (k.startsWith("'") && k.endsWith("'"))) k = k.slice(1, -1);
  k = k.replace(/\\\\n/g, '\n').replace(/\\n/g, '\n');
  const punyaBegin = k.includes('BEGIN PRIVATE KEY');
  const punyaEnd = k.includes('END PRIVATE KEY');
  console.log(`   setelah dirapikan → BEGIN: ${punyaBegin ? 'ADA' : 'TIDAK ADA'} · END: ${punyaEnd ? 'ADA' : 'TIDAK ADA'} · ${k.split('\n').length} baris`);

  if (!punyaBegin || !punyaEnd) {
    adaMasalah = true;
    console.log('');
    console.log('   ✗ INI PENYEBAB ERRORNYA. Kemungkinan besar:');
    if (!diKutip && !adaEscapeN) {
      console.log('     → Nilainya TIDAK diapit tanda kutip. Private key memuat spasi dan');
      console.log('       baris baru, jadi tanpa kutip pembacaannya terpotong di baris pertama.');
    }
    if (nilai.length < 200) {
      console.log(`     → Panjangnya hanya ${nilai.length} karakter. Private key utuh biasanya`);
      console.log('       1.600–1.800 karakter. Nilainya terpotong atau salah tempel.');
    }
    if (/^[A-Za-z0-9+/=]+$/.test(nilai) && nilai.length > 200) {
      console.log('     → Nilainya terlihat base64 tanpa header PEM. Kalau memang di-encode,');
      console.log('       decode dulu; yang dibutuhkan adalah PEM lengkap.');
    }
    if (nilai.trim().startsWith('{')) {
      console.log('     → Nilainya terlihat seperti SELURUH isi file JSON service account.');
      console.log('       Yang dibutuhkan hanya isi field "private_key" saja.');
    }
  }
  console.log('');
}

console.log('Bentuk yang benar di .env (satu baris, diapit kutip ganda, \\n sebagai teks):');
console.log('  FIREBASE_ADMIN_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\\nMIIEv...\\n-----END PRIVATE KEY-----\\n"');
console.log('');
console.log('Cara paling aman: buka file service account JSON, salin isi field "private_key"');
console.log('APA ADANYA (sudah memuat \\n sebagai teks), lalu tempel di antara tanda kutip ganda.');

process.exit(adaMasalah ? 1 : 0);
