export type UserRole = 'administrator' | 'operator';
export type ShiftType = '1' | '2' | '3' | 'Non-Shift';

export interface AppUser {
  uid: string;
  email: string;
  name: string;
  role: UserRole;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ParsedBarcodeGB {
  materialId: string;
  batchDoc: string;
  unitCtn: string;
  qtyPerBox: number;
  unitPcs: string;
  barcode: string;
  description: string;
  wh: string;
}

export interface StockEntryGB {
  id?: string;
  timestamp: string;
  date: string;
  user: string;
  shift: string;
  materialId: string;  // E
  batchDoc: string;    // F
  unitCtn: string;     // G
  qtyPerBox: number;   // H
  unitPcs: string;     // I
  barcode: string;     // J
  ocsCode: string;     // K — dari Master_Gudang_Kecil col D, lookup by SAP
  description: string; // L
  wh: string;          // M
  qtyCarton: number;   // N
  qtyPcsTotal: number; // O
  location: string;    // P
  notes: string;       // Q
  status: 'saved' | 'pending' | 'error'; // R
  potentialDouble: boolean; // S
  rowIndex?: number;
}

export interface StockEntryKT {
  id?: string;
  timestamp: string;
  date: string;
  user: string;
  shift: string;
  category: 'Gudang Kecil' | 'Gudang Transit';
  barcode: string;
  /// Batch / no. dokumen, DIKETIK operator — barcode Gudang Kecil & Transit
  /// tidak membawa field ini seperti barcode Gudang Besar. Opsional dengan
  /// sengaja: batch yang tidak diketahui tidak boleh menghalangi penyimpanan.
  batchDoc?: string;
  sapCode: string;   // G
  ocsCode: string;   // H — nama barang dari Master_Gudang_Kecil (user menyebut ini "SKU OCS")
  qtyPcs: number;    // I
  location: string;  // J
  notes: string;     // K
  status: 'saved' | 'pending' | 'error'; // L
  potentialDouble: boolean; // M
  rowIndex?: number;
}

export interface MasterGudangKecil {
  barcode: string;        // A
  barcodePOM: string;     // B — format (90)NA...
  sapCode: string;        // C
  ocsCode: string;        // D
  namaBarang: string;     // E
  rowIndex?: number;
}

export interface MasterBin {
  binCode: string;
  description: string;
  warehouse: string;
  active: boolean;
  rowIndex?: number;
}
export interface OfflineQueueItem {
  id?: number;
  type: 'gudang-besar' | 'gudang-kecil-transit';
  data: StockEntryGB | StockEntryKT;
  attempts: number;
  createdAt: number;
  lastAttempt?: number;
  lastError?: string;
}

// Unified row for Data SO display page
export interface DataSORow {
  source: 'gudang-besar' | 'gudang-kecil' | 'gudang-transit';
  rowIndex: number;
  tanggal: string;
  user: string;
  shift: string;
  skuSAP: string;
  skuOCS: string;
  batch: string;
  lokasi: string;
  quantity: number;
  uom: string;
  keterangan: string;
  notes: string;
  timestamp: string;
}
