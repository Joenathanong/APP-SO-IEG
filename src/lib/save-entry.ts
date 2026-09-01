import { addToQueue } from '@/lib/offline-queue';
import { StockEntryGB, StockEntryKT } from '@/types';

export type EntryType = 'gudang-besar' | 'gudang-kecil-transit';

export type SaveOutcome =
  | { ok: true;  duplicate: boolean; materialFound?: boolean; binKnown?: boolean }
  | { ok: false; queued: true;  reason: string; kategori: GagalKategori }
  | { ok: false; queued: false; reason: string; kategori: GagalKategori };

/** Membedakan sebab kegagalan supaya pesan ke operator jujur — "jaringan
 *  bermasalah" untuk semua kasus adalah salah dan menyesatkan. */
export type GagalKategori = 'jaringan' | 'tanpa-sesi' | 'server' | 'antrean';

const ENDPOINT = '/api/entries';
const SAVE_TIMEOUT_MS = 12_000;

/** Terjemahkan bentuk lama (StockEntryGB / StockEntryKT) ke payload /api/entries.
 *  Sengaja diletakkan DI SINI supaya ketiga halaman scan tidak perlu diubah
 *  sama sekali — mereka tetap menyusun objek yang bentuknya mereka kenal. */
function toPayload(type: EntryType, e: StockEntryGB | StockEntryKT) {
  const umum = {
    clientEntryId: e.id ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    binCode: e.location,
    userName: e.user,
    shift: e.shift,
    notes: e.notes || null,
    scannedAt: e.timestamp,
  };

  if (type === 'gudang-besar') {
    const g = e as StockEntryGB;
    return {
      ...umum,
      warehouseType: 'BESAR' as const,
      sapCode: g.materialId || null,
      barcode: g.barcode || null,
      rawMaterialText: g.materialId || null,
      rawBarcode: g.barcode || '',
      batchDoc: g.batchDoc?.trim() || null,
      qtyCarton: g.qtyCarton ?? null,
      qtyPerBox: g.qtyPerBox ?? null,
      qtyPcs: g.qtyPcsTotal,
    };
  }

  const k = e as StockEntryKT;
  return {
    ...umum,
    warehouseType: (k.category === 'Gudang Transit' ? 'TRANSIT' : 'KECIL') as 'TRANSIT' | 'KECIL',
    sapCode: k.sapCode && k.sapCode !== 'null' ? k.sapCode : null,
    barcode: k.barcode || null,
    rawMaterialText: k.sapCode && k.sapCode !== 'null' ? k.sapCode : k.barcode || null,
    rawBarcode: k.barcode || '',
    // Sebelumnya dipaku null. Gudang Kecil & Transit kini punya isian batch
    // manual, karena barcode mereka — tidak seperti Gudang Besar — tidak
    // membawa field batch sama sekali.
    batchDoc: k.batchDoc?.trim() || null,
    qtyCarton: null,
    qtyPerBox: null,
    qtyPcs: k.qtyPcs,
  };
}

/**
 * Simpan satu entry, dan JANGAN PERNAH kehilangan datanya.
 *
 * Apa pun sebab kegagalannya — offline, timeout, 5xx, atau belum ada sesi
 * opname yang dibuka — entry masuk IndexedDB dan dikirim ulang otomatis.
 * Pengulangan aman karena `clientEntryId` punya index UNIK di database:
 * duplikat ditolak oleh database, bukan oleh pengecekan sebelum insert.
 * Itu perbedaan penting dari versi Google Sheets, di mana pengecekan tersebut
 * pernah menggagalkan seluruh penyimpanan ketika pembacaannya error.
 */
export async function saveWithQueue(
  type: EntryType,
  entry: StockEntryGB | StockEntryKT
): Promise<SaveOutcome> {
  let reason = 'unknown';
  let kategori: GagalKategori = 'jaringan';

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), SAVE_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(toPayload(type, entry)),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    if (res.ok) {
      let duplicate = false, materialFound: boolean | undefined, binKnown: boolean | undefined;
      try {
        const j = await res.json();
        duplicate = Boolean(j?.duplicate);
        materialFound = j?.materialFound;
        binKnown = j?.binKnown;
      } catch { /* respons kosong dianggap sukses biasa */ }
      return { ok: true, duplicate, materialFound, binKnown };
    }

    reason = `HTTP ${res.status}`;
    kategori = res.status === 409 ? 'tanpa-sesi' : res.status >= 500 ? 'server' : 'server';
    try {
      const j = await res.json();
      if (j?.error) reason = j.error;
      if (j?.code === 'NO_ACTIVE_SESSION') kategori = 'tanpa-sesi';
    } catch { /* respons bukan JSON */ }
  } catch (e: any) {
    reason = e?.name === 'AbortError' ? `timeout ${SAVE_TIMEOUT_MS / 1000} detik` : (e?.message || 'network error');
    kategori = 'jaringan';
  }

  try {
    await addToQueue({
      type,
      data: { ...entry, status: 'pending' } as StockEntryGB | StockEntryKT,
      attempts: 0,
      createdAt: Date.now(),
    });
    return { ok: false, queued: true, reason, kategori };
  } catch (e: any) {
    return {
      ok: false, queued: false, kategori: 'antrean',
      reason: `${reason}; antrean gagal: ${e?.message || 'IndexedDB error'}`,
    };
  }
}

/**
 * Kalimat yang dibaca operator, diturunkan dari SEBAB sebenarnya.
 *
 * Sebelumnya ketiga halaman scan menulis "Jaringan bermasalah" secara mati,
 * sehingga sesi yang belum dibuka, route yang belum ada, dan WiFi yang putus
 * semuanya tampak sama. Itu membuat masalah yang gampang dibereskan terlihat
 * seperti gangguan jaringan, dan menyita waktu diagnosa yang tidak perlu.
 */
export function pesanGagal(o: Extract<SaveOutcome, { ok: false }>): { judul: string; detail: string } {
  switch (o.kategori) {
    case 'tanpa-sesi':
      return {
        judul: 'Belum ada sesi opname',
        detail: 'Minta admin membuka sesi di menu Sesi Opname. Data Anda aman di antrean dan terkirim otomatis setelah sesi dibuka.',
      };
    case 'server':
      return {
        judul: 'Server menolak',
        detail: `${o.reason}. Data aman di antrean.`,
      };
    case 'antrean':
      return {
        judul: 'Gagal simpan DAN gagal antre',
        detail: `${o.reason}. JANGAN tutup halaman ini.`,
      };
    default:
      return {
        judul: 'Jaringan bermasalah',
        detail: `${o.reason}. Data aman di antrean, dikirim otomatis.`,
      };
  }
}

/** Dipakai proses sync antrean — payload-nya sama, tanpa mengantre ulang. */
export function toEntryPayload(type: EntryType, entry: StockEntryGB | StockEntryKT) {
  return toPayload(type, entry);
}
