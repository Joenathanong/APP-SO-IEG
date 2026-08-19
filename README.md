# Stock Opname App — EJI

Aplikasi web Stock Opname (Warehouse Inventory Counting) berbasis Next.js 14 dengan integrasi Firebase Auth, Google Sheets sebagai data store, dan dukungan offline menggunakan Dexie.js (IndexedDB).

---

## Tech Stack

| Layer | Teknologi |
|---|---|
| Framework | Next.js 14 (App Router, TypeScript) |
| Styling | Tailwind CSS + next-themes (dark/light mode) |
| Auth | Firebase Authentication + Firestore |
| Data Storage | Google Sheets API v4 |
| Offline Queue | Dexie.js (IndexedDB) |
| Charts | Recharts |
| Icons | Lucide React |
| Notifications | react-hot-toast |

---

## Struktur Direktori

```
src/
├── app/
│   ├── api/
│   │   ├── firebase/users/          # CRUD user via Firebase Admin
│   │   └── sheets/
│   │       ├── gudang-besar/        # GET/POST/PUT Gudang Besar
│   │       ├── gudang-kecil-transit/ # GET/POST/PUT Gudang Kecil & Transit
│   │       ├── history/             # GET combined history
│   │       ├── master-bin/          # GET/POST/PUT Master Bin
│   │       └── check-duplicate/     # POST duplicate check
│   ├── admin/
│   │   ├── master-bin/             # Halaman Master Data Bin
│   │   └── users/                  # Halaman User Management
│   ├── dashboard/                  # Halaman Dashboard + Charts
│   ├── history/                    # Halaman History + Export CSV
│   ├── login/                      # Halaman Login
│   └── stock-opname/
│       ├── gudang-besar/           # Scan Gudang Besar (2-step)
│       ├── gudang-kecil/           # Scan Gudang Kecil
│       └── gudang-transit/         # Scan Gudang Transit
├── components/
│   ├── dashboard/DateRangePicker   # Filter rentang tanggal
│   ├── layout/                     # AppLayout, TopBar, Sidebar
│   ├── stock/                      # BarcodeInput, ManualBinSelect, ScanHistoryTable
│   └── ui/                         # Button, Input, Modal, Badge, Select
├── contexts/
│   ├── AuthContext.tsx             # Firebase Auth + session management
│   └── ShiftContext.tsx            # Shift state (localStorage)
├── hooks/
│   ├── useOfflineQueue.ts          # Online/offline sync
│   └── useToast.ts                 # Notification helpers
├── lib/
│   ├── firebase.ts                 # Firebase client config
│   ├── firebase-admin.ts           # Firebase Admin (server-only)
│   ├── google-sheets.ts            # Google Sheets API helpers
│   ├── offline-queue.ts            # Dexie IndexedDB wrapper
│   └── utils.ts                    # Barcode parser, formatters
└── types/index.ts                  # TypeScript interfaces
```

---

## Setup & Konfigurasi

### 1. Clone & Install

```bash
cd stock-opname-app
npm install
```

### 2. Konfigurasi Firebase

1. Buka https://console.firebase.google.com
2. Buat project baru atau gunakan yang ada
3. Aktifkan **Authentication** > Email/Password provider
4. Aktifkan **Firestore Database**
5. Buat **Service Account** di Project Settings > Service Accounts > Generate New Private Key

**Firestore Security Rules** (copy ke Firebase Console > Firestore > Rules):

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null
        && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'administrator';
    }
  }
}
```

**Buat user pertama (administrator)** melalui Firebase Console > Authentication > Add user.
Setelah itu buat dokumen Firestore di koleksi `users` dengan document ID = UID user tersebut:

```json
{
  "email": "admin@perusahaan.com",
  "name": "Administrator",
  "role": "administrator",
  "active": true,
  "createdAt": "2024-01-01T00:00:00.000Z",
  "updatedAt": "2024-01-01T00:00:00.000Z"
}
```

### 3. Konfigurasi Google Sheets

1. Buka https://console.cloud.google.com
2. Aktifkan **Google Sheets API**
3. Buat **Service Account** > buat JSON key
4. Buka Google Spreadsheet target > Share ke email service account (Editor)
5. Copy Spreadsheet ID dari URL:
   `https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit`

**Sheet yang diperlukan** (buat manual di Google Sheets):
- `SO_Gudang_Besar`
- `SO_Gudang_Kecil_Transit`
- `Master_Bin`

Header akan dibuat otomatis saat data pertama kali disimpan.

### 4. Environment Variables

```bash
cp .env.example .env.local
```

Isi semua nilai di `.env.local`:

```env
# Firebase Client (NEXT_PUBLIC_ = exposed to browser)
NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSy...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789
NEXT_PUBLIC_FIREBASE_APP_ID=1:123456789:web:abc123

# Firebase Admin (server-side only)
FIREBASE_ADMIN_PROJECT_ID=your-project-id
FIREBASE_ADMIN_CLIENT_EMAIL=firebase-adminsdk@your-project.iam.gserviceaccount.com
FIREBASE_ADMIN_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvQ....\n-----END PRIVATE KEY-----\n"

# Google Sheets
GOOGLE_SHEETS_SPREADSHEET_ID=1BxiM...
GOOGLE_SHEETS_CLIENT_EMAIL=sheets-service@your-project.iam.gserviceaccount.com
GOOGLE_SHEETS_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvQ....\n-----END PRIVATE KEY-----\n"
```

CATATAN PENTING untuk PRIVATE_KEY:
- Nilai harus dikelilingi tanda kutip ganda "
- Newline di dalam key ditulis sebagai \n (dua karakter: backslash + n)
- Jangan copy newline literal dari file JSON

### 5. Jalankan Development Server

```bash
npm run dev
```

Buka http://localhost:3000

---

## Panduan Deployment

### Deploy ke Vercel (Direkomendasikan)

1. Push kode ke GitHub/GitLab
2. Import project di https://vercel.com
3. Settings > Environment Variables: tambahkan semua variabel dari .env.local
4. Deploy

Atau via CLI:
```bash
npm install -g vercel
vercel --prod
```

CATATAN untuk PRIVATE_KEY di Vercel UI:
Masukkan value tanpa tanda kutip luar. Vercel menangani escaping secara otomatis.

### Build Manual (Self-host)

```bash
npm run build
npm run start
```

### Deploy ke VPS dengan PM2 + Nginx

```bash
# Install dependencies & build
npm install
npm run build

# Jalankan dengan PM2
npm install -g pm2
pm2 start "npm run start" --name "stock-opname"
pm2 save
pm2 startup
```

Nginx config (/etc/nginx/sites-available/stock-opname):
```
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
ln -s /etc/nginx/sites-available/stock-opname /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
```

---

## Fitur Utama

### Autentikasi & Sesi
- Login via Firebase Email/Password
- Sesi otomatis expired setelah 1 jam — countdown timer di TopBar
- Warna timer: hijau (>20 menit), kuning (10-20 menit), merah berkedip (<10 menit)
- Akun nonaktif ditolak saat login
- Pilih Shift (1/2/3/Non-Shift) sekali per sesi — disimpan di localStorage

### Stock Opname Gudang Besar
- Step 1: Scan barcode produk → input Qty Karton → auto-hitung Total PCS
- Konfirmasi jika total PCS > 480, dengan opsi edit isi per box
- Step 2: Scan lokasi bin ATAU pilih manual dari Master Bin
- Cek duplikat otomatis sebelum simpan
- Offline: data masuk antrean IndexedDB, sync otomatis saat online

### Stock Opname Gudang Kecil & Transit
- 3 step: scan barcode → input qty PCS → scan/pilih lokasi
- Logika duplikat & offline queue sama

### Dashboard
- Rentang tanggal (preset 7/14/30 hari)
- 4 stat cards + bar chart harian + pie chart per gudang
- Alert potensi double
- Tabel 20 scan terbaru

### History
- Filter rentang tanggal, tipe gudang, search, user (admin)
- Edit: operator 30 menit, admin kapan saja
- Export CSV (BOM untuk Excel Indonesia)

### Admin
- User Management: tambah/edit user, kelola aktif/nonaktif
- Master Data Bin: kelola kode bin per gudang

### Offline Queue
- IndexedDB via Dexie.js
- Auto-sync saat reconnect
- Cek duplikat ulang saat sync

---

## Format Barcode Gudang Besar

Format (dipisah titik koma):
```
materialId;batchDoc;unitCtn;qtyPerBox;unitPcs;barcode;description;wh
```

Contoh input scanner:
```
1201020711;D26158;CTN;12.00000;PCS;852600153;Hanasui Glow Expert Package 4pack x 12;WH
```

---

## Roles & Permissions

| Fitur                      | Operator | Administrator |
|----------------------------|----------|---------------|
| Stock Opname semua gudang  | Ya       | Ya            |
| History data sendiri       | Ya       | Ya            |
| History semua user         | Tidak    | Ya            |
| Edit data (30 menit)       | Ya       | Ya            |
| Edit data (kapan saja)     | Tidak    | Ya            |
| User Management            | Tidak    | Ya            |
| Master Data Bin            | Tidak    | Ya            |

---

## Google Sheets Schema

### SO_Gudang_Besar (18 kolom A-R)
Timestamp | Tanggal | User | Shift | Material ID | Batch/Doc | Unit CTN | Qty Per Box | Unit PCS | Barcode | Deskripsi | WH | Qty Karton | Qty PCS Total | Lokasi | Catatan | Status | Potensi Double

### SO_Gudang_Kecil_Transit (11 kolom A-K)
Timestamp | Tanggal | User | Shift | Kategori | Barcode | Qty PCS | Lokasi | Catatan | Status | Potensi Double

### Master_Bin (4 kolom A-D)
Kode Bin | Deskripsi | Gudang | Aktif

---

## Troubleshooting

**FIREBASE_ADMIN_PRIVATE_KEY error**
Pastikan value di .env.local dikelilingi tanda kutip ganda, dan \n adalah dua karakter (bukan newline).

**Google Sheets 403 Forbidden**
Pastikan email service account sudah di-share ke spreadsheet sebagai Editor, dan Google Sheets API aktif.

**Barcode tidak ter-parse**
Format harus dipisah ; dan minimal 8 field. Pastikan scanner mengirim Enter setelah scan.

**Build error: firebase-admin module**
Jangan import firebase-admin atau lib/firebase-admin.ts di komponen client. Hanya gunakan di API routes (server-side).

---

Lisensi: Internal use only — PT EJI 2024
