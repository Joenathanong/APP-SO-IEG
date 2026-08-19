# stock-opname-v2 — langkah setup

App baru di atas TiDB. App lama (`stock-opname-app`) tetap berjalan untuk
melihat riwayat. **Tidak ada data transaksi yang dibawa** — hanya master.

Folder ini adalah salinan `stock-opname-app` per 18 Agustus 2026, sudah tanpa
`src/lib/google-sheets.ts` dan `src/app/api/sheets/`.

---

## 1. Pasang dependensi

```
cd "C:\Users\EJI\Claude\Projects\INV IEG\stock-opname-v2"
npm install
```

`package.json` sudah ditambahi `prisma`, `@prisma/client`, dan `tsx`.
`googleapis` sudah dibuang.

## 2. Isi `.env`

```
cp .env.example .env
```

Ambil connection string dari **TiDB Cloud → Connect → Connect With: Prisma**.
Bentuknya:

```
DATABASE_URL="mysql://<user>.root:<password>@gateway01.<region>.prod.aws.tidbcloud.com:4000/stock_opname?sslaccept=strict&connection_limit=5"
```

`sslaccept=strict` wajib. `connection_limit` sengaja rendah karena Vercel
serverless membuka koneksi per invocation.

Salin juga seluruh nilai `FIREBASE_*` dan `NEXT_PUBLIC_FIREBASE_*` dari
`.env.local` app lama — autentikasi **tetap** memakai Firebase.
Nilai `GOOGLE_SHEETS_*` sudah tidak dipakai, hapus saja.

### Periksa dulu bentuk URL-nya

```
npm run check:db
```

Ini mengurai `DATABASE_URL` dan melaporkan komponennya **tanpa menampilkan
password**. Jalankan ini sebelum `db:push` — pesan error Prisma untuk URL yang
salah bentuk sangat menyesatkan (lihat Masalah Umum di bawah).

## 3. Bentuk skema di TiDB

```
npx prisma generate
npm run db:push
```

`db:push` membuat tabel langsung dari `prisma/schema.prisma`. Tidak memakai
migration file — untuk database baru yang belum berisi apa-apa, itu langkah
ekstra tanpa manfaat.

Kalau muncul error soal collation atau case-sensitivity nanti, jalankan sekali:

```sql
ALTER DATABASE stock_opname CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
```

TiDB Serverless default `utf8mb4_bin` yang PEKA huruf besar-kecil. Kolom `norm*`
sudah menyimpan huruf kecil semua, jadi pencarian tetap benar walau langkah ini
dilewati — tapi pencarian teks bebas (nama produk) akan peka huruf.

## 4. Seed master

Letakkan `MASTER_GABUNGAN_v2.xlsx` di folder ini, lalu:

```
npm run seed:master:dry     # lihat dulu apa yang akan dimuat, tidak menulis
npm run seed:master         # jalankan sungguhan
```

Idempoten — aman dijalankan ulang setiap kali Anda memperbarui file tinjauan.
Upsert memakai kunci alami (`ocsCode` untuk material, `normCode` untuk bin),
jadi menjalankan ulang **memperbarui** baris yang ada, bukan menggandakan.

Isi kolom kuning **KEPUTUSAN ANDA** di file itu untuk mengubah perilaku seed:

| Isi kolom | Akibat |
|---|---|
| (kosong) | dimuat apa adanya |
| `hapus` / `buang` / `batal` | baris dilewati, tidak masuk database |
| `nonaktif` / `tidak aktif` | dimuat tapi ditandai tidak aktif |
| teks lain | dianggap catatan, baris tetap dimuat |

Seed akan melaporkan berapa material tanpa barcode (tidak akan pernah bisa
discan) dan berapa yang masih punya catatan konflik.

## 5. Periksa hasilnya

```
npm run db:studio
```

## 6. Kirimkan output ke saya

Saya tidak bisa menjalankan Prisma dari sisi saya — registry npm dan
`binaries.prisma.sh` diblokir di lingkungan saya, dan engine Prisma di mesin
Anda adalah build Windows. Jadi tolong kirim balik keluaran `db:push` dan
`seed:master`, termasuk kalau errornya panjang.

---

## Masalah umum

### `Connections using insecure transport are prohibited`

Pesan ini **hampir selalu bukan** soal sertifikat SSL. Periksa baris tepat di
atasnya di keluaran Prisma:

```
Datasource "db": MySQL database "sslaccept=strict&connection_limit=5" at "gateway01..."
                                 ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
                                 ini terbaca sebagai NAMA DATABASE
```

Kalau nama database berisi `=` atau `&`, berarti tanda `?` sebelum parameter
hilang atau tertulis sebagai `/`. Akibatnya `sslaccept=strict` tidak pernah
terbaca sebagai parameter, koneksi dicoba tanpa TLS, dan TiDB menolaknya.

Yang benar:

```
mysql://<user>.root:<password>@gateway01.ap-southeast-1.prod.aws.tidbcloud.com:4000/stock_opname?sslaccept=strict&connection_limit=5
                                                                                   ^^^^^^^^^^^^ ^
                                                                                   nama database  tanda tanya
```

Tiga hal yang wajib ada: **nama database** di antara `/` dan `?`, tanda **`?`**
(bukan `/` atau `&`) sebelum parameter pertama, dan `&` untuk parameter
berikutnya. Jalankan `npm run check:db` untuk memastikan.

### `Unknown database 'stock_opname'`

Databasenya belum dibuat. `prisma db push` membuat TABEL, bukan database.
Buat dulu lewat TiDB Cloud → SQL Editor:

```sql
CREATE DATABASE stock_opname;
```

Atau pakai database `test` yang sudah disediakan TiDB Cloud, dengan mengganti
nama database di `DATABASE_URL`.

### Password mengandung karakter khusus

TiDB Cloud membuat password acak yang bisa memuat `@`, `/`, `:`, `#`, `?`.
Karakter itu punya arti khusus di dalam URL dan harus di-encode:

| Karakter | Ganti jadi |
|---|---|
| `@` | `%40` |
| `/` | `%2F` |
| `:` | `%3A` |
| `#` | `%23` |
| `?` | `%3F` |
| `%` | `%25` |
| spasi | `%20` |

`npm run check:db` akan memperingatkan kalau mendeteksi hal ini.

---

## Yang sudah ada di folder ini

```
prisma/schema.prisma        skema TiDB lengkap (6 tabel, 3 enum)
scripts/check-db-url.mjs    pemeriksa bentuk DATABASE_URL (tanpa bocorkan password)
prisma/seed-master.ts       seed material + bin dari xlsx
src/lib/normalize.ts        normalisasi kode — dipakai seed DAN lookup runtime
src/lib/prisma.ts           client tunggal + retry write-conflict TiDB
```

## Yang BELUM dikerjakan (menyusul setelah database berdiri)

- endpoint API pengganti `src/app/api/sheets/`
- halaman kelola sesi opname (buka/tutup)
- halaman import saldo buku (.xlsx dari SAP/OCS)
- layar status hitung per bin — pengganti fitur "potensi double"
- query rekonsiliasi pengganti SUMIF `Resume_SO`
- penyesuaian halaman scan ke endpoint baru

Halaman scan, antrean offline, dan penanganan scanner Zebra **sudah terbawa apa
adanya** dari app lama, termasuk seluruh perbaikan write-path 18 Agustus 2026.

## Catatan penting soal skema

**Hanya boleh ada satu sesi OPEN**, dan itu ditegakkan **database** lewat kolom
`openGuard` (diisi `1` saat OPEN, `NULL` selain itu, dengan unique index —
MySQL mengizinkan banyak NULL tapi hanya satu nilai `1`). Pengecekan di
aplikasi saja tidak cukup: dua admin yang menekan tombol bersamaan bisa lolos.

**`materialId` sengaja nullable.** Audit menunjukkan 3,3% scan Gudang Besar dan
7,5% Gudang Kecil tidak menemukan pasangan di master. Scan tetap harus tersimpan
— data tidak boleh hilang hanya karena master belum lengkap.

**Barcode BPOM tidak unik per material.** Satu registrasi BPOM bisa mencakup
beberapa varian ukuran (mis. 130ml dan 300ml). Lookup nanti harus mengutamakan
barcode produk, dan bila barcode BPOM cocok ke lebih dari satu material aktif,
**minta operator memilih** — jangan diam-diam ambil salah satu.
