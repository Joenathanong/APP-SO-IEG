import * as admin from 'firebase-admin';

/**
 * Firebase Admin dengan inisialisasi TERTUNDA.
 *
 * Versi sebelumnya memanggil `initializeApp()` dan `admin.auth()` di level modul.
 * Akibatnya `next build` gagal di tahap "Collecting page data": Next mengimpor
 * setiap route untuk dianalisis, impor itu menjalankan inisialisasi, dan
 * inisialisasi butuh kredensial yang memang tidak seharusnya ada saat build.
 *
 * Build tidak boleh bergantung pada rahasia runtime. Sekarang kredensial baru
 * dibaca saat handler benar-benar dipanggil.
 */

let cachedApp: admin.app.App | null = null;

/**
 * Rapikan private key PEM dari environment variable.
 *
 * Nilai ini paling sering salah bentuk, dan pesan bawaan Firebase
 * ("Invalid PEM formatted message") tidak menyebutkan sebabnya. Tiga kekeliruan
 * yang ditangani di sini:
 *   1. dibungkus tanda kutip saat ditempel  → kutipnya dibuang
 *   2. baris baru masih berupa teks `\n`     → diubah jadi baris baru sungguhan
 *   3. ter-escape ganda jadi `\\n`           → dinormalkan lebih dulu
 */
function rapikanPem(raw: string): string {
  let k = raw.trim();
  if ((k.startsWith('"') && k.endsWith('"')) || (k.startsWith("'") && k.endsWith("'"))) {
    k = k.slice(1, -1);
  }
  k = k.replace(/\\\\n/g, '\n').replace(/\\n/g, '\n');
  return k.trim() + '\n';
}

function getApp(): admin.app.App {
  if (cachedApp) return cachedApp;
  if (admin.apps.length && admin.apps[0]) {
    cachedApp = admin.apps[0] as admin.app.App;
    return cachedApp;
  }

  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID?.trim();
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL?.trim();
  const privateKeyRaw = process.env.FIREBASE_ADMIN_PRIVATE_KEY;

  // Sebutkan variabel mana yang kosong. Menebak-nebak dari pesan Firebase
  // memakan waktu yang tidak perlu.
  const kurang: string[] = [];
  if (!projectId) kurang.push('FIREBASE_ADMIN_PROJECT_ID');
  if (!clientEmail) kurang.push('FIREBASE_ADMIN_CLIENT_EMAIL');
  if (!privateKeyRaw) kurang.push('FIREBASE_ADMIN_PRIVATE_KEY');
  if (kurang.length) {
    throw new Error(
      `Konfigurasi Firebase Admin belum lengkap — variabel berikut kosong: ${kurang.join(', ')}. ` +
      `Isi di Vercel → Project Settings → Environment Variables, lalu deploy ulang.`
    );
  }

  const privateKey = rapikanPem(privateKeyRaw!);
  if (!privateKey.includes('BEGIN PRIVATE KEY')) {
    throw new Error(
      'FIREBASE_ADMIN_PRIVATE_KEY tidak berbentuk PEM yang benar — tidak memuat "BEGIN PRIVATE KEY". ' +
      'Tempel isi private_key dari file service account JSON secara UTUH, termasuk baris BEGIN dan END.'
    );
  }

  cachedApp = admin.initializeApp({
    credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
  });
  return cachedApp;
}

export function getAdminAuth() {
  return admin.auth(getApp());
}

export function getAdminDb() {
  return admin.firestore(getApp());
}

export default admin;
