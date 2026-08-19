# stock-opname-v2 — urutan menjalankan & menguji

Semua kode sudah lengkap. Ikuti urutan ini; melompati langkah akan membuat
langkah berikutnya gagal dengan pesan yang membingungkan.

---

## 0. Bereskan `.env.local` (WAJIB, sering terlewat)

Folder ini masih memuat `.env.local` hasil salinan app lama. **Next.js
memprioritaskan `.env.local` di atas `.env`**, jadi kalau di dalamnya ada
`DATABASE_URL` atau kredensial lama, ia akan menimpa `.env` Anda dan errornya
akan tampak seperti masalah database.

1. Pindahkan seluruh nilai `FIREBASE_*` dan `NEXT_PUBLIC_FIREBASE_*` dari
   `.env.local` ke `.env` (kalau belum ada di sana).
2. Hapus `.env.local`.
3. `npm run check:db` — pastikan masih hijau.

## 1. Perbarui skema

Skema bertambah satu kolom (`Bin.description`) sejak `db:push` terakhir Anda:

```
npx prisma generate
npm run db:push
```

`prisma generate` harus dijalankan lagi karena tipe Prisma Client ikut berubah.

## 2. Seed master

```
npm run seed:master:dry     # lihat dulu, tidak menulis apa pun
npm run seed:master
```

Harus melaporkan sekitar **562 material** dan **816 bin**. Tanpa langkah ini
lookup tidak akan menemukan apa pun dan setiap scan tersimpan tanpa material.

## 3. Jalankan

```
npm run dev
```

Perhatikan baris pertama keluarannya — pastikan tertulis `stock-opname-v2`.

## 4. Buat dan buka sesi

Buka **Sesi Opname** di sidebar (menu admin) → **Sesi Baru** → lalu **Buka**.

Tanpa sesi berstatus OPEN, setiap scan ditolak dengan pesan
"Belum ada sesi opname yang dibuka" dan masuk antrean. Itu perilaku yang benar,
bukan error.

## 5. Import saldo buku

**Saldo Buku (OCS)** → pilih file export OCS (.xlsx).

File diurai di browser dan ditampilkan lebih dulu; tidak ada baris yang masuk
database sebelum Anda menekan Import. Halaman ini mencari kolom `SKU` /
`Material OCS` / `Kode OCS` dan `Qty On Hand` / `Jumlah OCS` di baris mana pun,
serta melewati baris seksi `Area: ...` — jadi export mentah OCS bisa langsung
dipakai tanpa dirapikan.

Perhatikan angka **"tidak dikenal"** di hasil import. Material itu tidak akan
muncul di rekonsiliasi Monitor.

---

## Uji fungsional

| # | Langkah | Yang seharusnya terjadi |
|---|---|---|
| 1 | Scan barcode Gudang Besar yang valid | Kode OCS muncul; tersimpan; toast "Data tersimpan" |
| 2 | Scan barcode yang sama sekali tidak ada di master | Tetap tersimpan, kolom SKU OCS di Data SO bertanda "(belum dikenal)" |
| 3 | Scan ke lokasi yang belum terdaftar | Tetap tersimpan; lokasinya muncul di Status Bin bagian "belum terdaftar" |
| 4 | Matikan WiFi, scan 2–3 kali, nyalakan lagi | Masuk antrean lalu terkirim sendiri; badge antrean kembali nol |
| 5 | Tutup sesi, lalu scan | Ditolak dengan pesan "Belum ada sesi opname yang dibuka" — bukan "jaringan bermasalah" |
| 6 | Buka sesi kedua saat masih ada yang terbuka | Ditolak, menyebut kode sesi yang masih terbuka |
| 7 | Buka **Status Bin** | Bin yang barusan discan muncul dengan nama penghitung dan jumlah baris |
| 8 | Buka **Monitor** | Progress dan selisih terisi (butuh saldo buku dari langkah 5) |
| 9 | Buka **Data Hasil SO**, edit satu baris | Qty/lokasi berubah, dan Status Bin ikut menyesuaikan |
| 10 | `npm run build` | Selesai tanpa error |

### Uji idempotency (yang paling penting)

Ini yang membuktikan data tidak akan ganda maupun hilang:

1. Scan satu barang.
2. Buka DevTools → Network → klik request `POST /api/entries` → **Replay**
   (atau salin sebagai fetch dan jalankan ulang di Console).
3. Respons kedua harus `{"success":true,"duplicate":true}` dan **jumlah baris
   di Data Hasil SO tidak bertambah**.

---

## Yang berubah perilakunya dari app lama

- **Peringatan "potensi double" dihapus.** Kriteria lama (barcode + lokasi)
  menandai 75% baris Gudang Besar — padahal satu SKU di satu bin memang discan
  sekali per karton. Penggantinya halaman **Status Bin**.
- **Barcode BPOM yang menunjuk ke beberapa produk tidak dipilih diam-diam.**
  Operator diberi tahu dan barisnya ditandai untuk ditinjau.
- **Kode SAP dicari di dua kolom** (IEG dan EJI).
- **Semua data terikat ke sesi opname.** Rekonsiliasi tidak pernah mencampur
  periode.

## Batas verifikasi saya

Saya **tidak bisa menjalankan** aplikasi ini: registry npm dan
`binaries.prisma.sh` diblokir di lingkungan saya, dan engine Prisma di mesin
Anda adalah build Windows. Yang sudah saya lakukan:

- `tsc` bersih atas seluruh berkas yang saya tulis (memakai stub tipe)
- validasi struktur `schema.prisma`: semua field relasi ter-index, semua kolom
  teks punya `@db.VarChar` eksplisit
- pemeriksaan silang: setiap endpoint yang dipanggil halaman benar-benar ada
- pemastian tidak ada lagi rujukan `/api/sheets` maupun `googleapis`

Yang **belum** terbukti: perilaku saat benar-benar terhubung ke TiDB, dan
render halaman di browser. Kalau ada yang gagal di langkah mana pun di atas,
kirimkan pesan dari terminal `npm run dev` — di situ error server dicetak
lengkap.
