'use client';
import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { AppLayout } from '@/components/layout/AppLayout';
import { BarcodeInput } from '@/components/stock/BarcodeInput';
import { ManualBinSelect } from '@/components/stock/ManualBinSelect';
import { ScanHistoryTable } from '@/components/stock/ScanHistoryTable';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/contexts/AuthContext';
import { useShift } from '@/contexts/ShiftContext';
import { useToast } from '@/hooks/useToast';
import { saveWithQueue, pesanGagal } from '@/lib/save-entry';
import { formatTimestamp, formatDate } from '@/lib/utils';
import { StockEntryKT, MasterGudangKecil } from '@/types';
import {
  Package, MapPin, RotateCcw, AlertTriangle,
  RefreshCw, ScanLine, Edit3, CheckCircle2, Loader2,
  ArrowRightCircle,
} from 'lucide-react';

/** Bentuk material dari /api/materials/lookup dipetakan ke bentuk lama yang
 *  dipakai komponen di halaman ini, supaya tampilannya tidak perlu diubah.
 *  Catatan: `namaBarang` kini benar-benar nama produk (dari Data OCS), bukan
 *  kode OCS yang diulang seperti di master lama. */
function toMasterShape(m: any): MasterGudangKecil | null {
  if (!m) return null;
  return {
    barcode: m.barcodeProduct ?? '',
    barcodePOM: m.barcodeBpom ?? '',
    sapCode: m.sapCodeIeg ?? m.sapCodeEji ?? '',
    ocsCode: m.ocsCode ?? '',
    namaBarang: m.name ?? m.ocsCode ?? '',
  };
}

export default function GudangKecilPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { shift } = useShift();
  const { showSuccess, showError, showWarning } = useToast();

  // Step: 0 = menunggu scan, 1 = lookup, 2 = qty, 3 = lokasi
  const [step, setStep] = useState<0 | 1 | 2 | 3>(0);
  const [barcode, setBarcode] = useState('');
  const [masterData, setMasterData] = useState<MasterGudangKecil | null>(null);
  const [masterNotFound, setMasterNotFound] = useState(false); // true = barcode tidak ada di master, tapi lanjut
  const [isLooking, setIsLooking] = useState(false);
  const [qtyPcs, setQtyPcs] = useState(1);
  // Batch / no. dokumen. Berbeda dari Gudang Besar, barcode di sini TIDAK
  // membawa field batch, jadi nilainya diketik operator.
  const [batchDoc, setBatchDoc] = useState('');
  // Saat menghitung satu palet, batchnya sama untuk puluhan scan berturut-turut.
  // Mengetik ulang tiap kali membuat operator berhenti mengisinya sama sekali.
  // Default MATI dengan sengaja: batch yang terbawa diam-diam ke barang lain
  // adalah data salah yang tidak terlihat siapa pun.
  const [kunciBatch, setKunciBatch] = useState(false);
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');
  const [useManualBin, setUseManualBin] = useState(false);
  const [scanHistory, setScanHistory] = useState<StockEntryKT[]>([]);
  const [showDuplicateWarning, setShowDuplicateWarning] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [failedEntry, setFailedEntry] = useState<StockEntryKT | null>(null);

  // Modal: barcode terdeteksi sebagai Gudang Besar
  const [showGudangBesarModal, setShowGudangBesarModal] = useState(false);
  const [gbBarcode, setGbBarcode] = useState(''); // simpan barcode yang memicu modal

  const resetForm = useCallback(() => {
    setStep(0);
    setBarcode('');
    setMasterData(null);
    setMasterNotFound(false);
    setIsLooking(false);
    setQtyPcs(1);
    setBatchDoc((b) => (kunciBatch ? b : ''));
    setLocation('');
    setNotes('');
    setUseManualBin(false);
    setFailedEntry(null);
    setShowDuplicateWarning(false);
  }, [kunciBatch]);

  // Step 1: Scan barcode → cek separator → lookup master
  const handleBarcodeScan = async (raw: string) => {
    // Hitung jumlah semicolon
    const semicolonCount = (raw.match(/;/g) || []).length;
    if (semicolonCount > 1) {
      // Format barcode Gudang Besar — tampilkan modal redirect
      setGbBarcode(raw);
      setShowGudangBesarModal(true);
      return;
    }

    setBarcode(raw);
    setMasterData(null);
    setMasterNotFound(false);
    setIsLooking(true);
    setStep(1);

    try {
      const res = await fetch(
        `/api/materials/lookup?barcode=${encodeURIComponent(raw)}`
      );
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'Gagal menghubungi server');

      if (!data.found) {
        // Tidak ditemukan → warning saja, tetap lanjut ke qty
        setMasterNotFound(true);
        setStep(2);
        return;
      }

      // Satu registrasi BPOM bisa mencakup beberapa varian ukuran, sehingga
      // barcode yang sama menunjuk ke lebih dari satu material. Memilih salah
      // satu diam-diam akan menukar hitungan antar varian tanpa ada yang tahu,
      // jadi operator diberi tahu dan barisnya ditandai untuk ditinjau.
      if (data.ambiguous) {
        const nama = (data.pilihan ?? []).map((x: any) => x.ocsCode).join(', ');
        showWarning('Barcode dipakai lebih dari satu produk', `${nama}. Lanjutkan, lalu perbaiki lewat menu tinjau.`);
        setMasterNotFound(true);
        setStep(2);
        return;
      }

      setMasterData(toMasterShape(data.material));
      setStep(2);
    } catch (e: any) {
      showError('Error', e.message);
      setStep(0);
    } finally {
      setIsLooking(false);
    }
  };

  const handleLocationScan = (loc: string) => {
    setLocation(loc);
    handleSave(loc);
  };

  const handleSave = async (loc?: string, potentialDouble = false) => {
    const finalLocation = loc || location;
    if (!finalLocation) { showError('Lokasi wajib diisi.'); return; }
    if (!barcode || !user || !shift) return;
    setIsSaving(true);

    try {
      // Lihat catatan di halaman Gudang Besar: peringatan duplikat
      // barcode+lokasi sengaja dihapus dan diganti status hitung per bin.
      await saveEntry(finalLocation, potentialDouble);
    } catch {
      setIsSaving(false);
      showError('Gagal menyimpan data.');
    }
  };

  const saveEntry = async (finalLocation: string, potentialDouble: boolean) => {
    if (!barcode || !user || !shift) return;

    // Jika master tidak ditemukan, isi kolom lookup dengan 'null'
    const entry: StockEntryKT = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      timestamp: formatTimestamp(),
      date: formatDate(),
      user: user.name,
      shift,
      category: 'Gudang Kecil',
      barcode,
      batchDoc: batchDoc.trim(),
      sapCode:  masterData?.sapCode    ?? 'null',
      ocsCode:  masterData?.namaBarang ?? 'null',
      qtyPcs,
      location: finalLocation,
      notes,
      status: 'saved',
      potentialDouble,
    };

    // Lihat catatan di saveWithQueue: setiap kegagalan diselamatkan ke antrean,
    // bukan hanya saat navigator.onLine === false.
    const outcome = await saveWithQueue('gudang-kecil-transit', entry);

    if (outcome.ok) {
      showSuccess(
        outcome.duplicate ? 'Sudah tersimpan sebelumnya' : 'Data tersimpan',
        `${barcode} @ ${finalLocation}`
      );
      setScanHistory((prev) => [entry, ...prev]);
      resetForm();
    } else if (outcome.queued) {
      const queueEntry = { ...entry, status: 'pending' as const };
      const p = pesanGagal(outcome);
      showWarning(p.judul, p.detail);
      setScanHistory((prev) => [queueEntry, ...prev]);
      resetForm();
    } else {
      setFailedEntry({ ...entry, status: 'error' as const });
      showError(pesanGagal(outcome).judul, pesanGagal(outcome).detail);
    }
    setIsSaving(false);
  };

  const handleRetry = async () => {
    if (!failedEntry) return;
    setIsSaving(true);
    const outcome = await saveWithQueue('gudang-kecil-transit', { ...failedEntry, status: 'saved' });
    if (outcome.ok) {
      showSuccess('Data berhasil disimpan ulang!');
      setScanHistory((prev) => [{ ...failedEntry, status: 'saved' }, ...prev]);
      setFailedEntry(null);
      resetForm();
    } else if (outcome.queued) {
      const p = pesanGagal(outcome);
      showWarning(p.judul, p.detail);
      setScanHistory((prev) => [{ ...failedEntry, status: 'pending' as const }, ...prev]);
      setFailedEntry(null);
      resetForm();
    } else {
      showError('Gagal simpan ulang', outcome.reason);
    }
    setIsSaving(false);
  };

  const stepLabels = ['Scan Barcode', 'Lookup', 'Input Qty', 'Scan Lokasi'];

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Package size={24} className="text-green-600" />
            Stock Opname Gudang Kecil
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Scan barcode → verifikasi master data → qty → lokasi
          </p>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-1.5 text-xs overflow-x-auto pb-1">
          {[0, 1, 2, 3].map((n, i, arr) => (
            <div key={n} className="flex items-center gap-1.5 flex-shrink-0">
              <div className={`flex items-center gap-1 px-2.5 py-1 rounded-full font-medium transition-colors ${
                step === n
                  ? 'bg-green-600 text-white'
                  : step > n
                  ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                  : 'bg-gray-100 text-gray-400 dark:bg-gray-700 dark:text-gray-500'
              }`}>
                {step > n
                  ? <CheckCircle2 size={12} />
                  : <span className="w-4 text-center">{n + 1}</span>
                }
                <span>{stepLabels[n]}</span>
              </div>
              {i < arr.length - 1 && <div className="h-px w-3 bg-gray-300 dark:bg-gray-600 flex-shrink-0" />}
            </div>
          ))}
        </div>

        {/* Retry banner */}
        {failedEntry && (
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 rounded-xl p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="text-yellow-600 flex-shrink-0 mt-0.5" size={18} />
              <div className="flex-1">
                <p className="text-sm font-medium text-yellow-800 dark:text-yellow-300">Data gagal disimpan.</p>
                <p className="text-xs text-yellow-700 dark:text-yellow-400 mt-0.5">
                  {failedEntry.barcode} @ {failedEntry.location}
                </p>
              </div>
            </div>
            <div className="flex gap-2 mt-3">
              <Button onClick={handleRetry} size="sm" loading={isSaving}><RefreshCw size={14} />Coba Simpan Ulang</Button>
              <Button onClick={() => { setFailedEntry(null); resetForm(); }} size="sm" variant="ghost">Batalkan</Button>
            </div>
          </div>
        )}

        {/* Main card */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 space-y-5">

          {/* Step 0 & 1: Scan barcode */}
          {(step === 0 || step === 1) && (
            <div className="space-y-3">
              <BarcodeInput
                label="Scan Barcode Produk"
                placeholder="Scan barcode EAN atau POM-NA..."
                onScan={handleBarcodeScan}
                autoFocus
                disabled={isLooking}
              />
              {isLooking && (
                <div className="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400 py-2">
                  <Loader2 size={16} className="animate-spin" />
                  Mengecek master data...
                </div>
              )}
            </div>
          )}

          {/* Barcode tidak ditemukan di master — WARNING (masih bisa lanjut) */}
          {masterNotFound && step >= 2 && (
            <div className="flex items-start gap-3 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700 rounded-xl">
              <AlertTriangle className="text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" size={20} />
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-amber-800 dark:text-amber-300 text-sm">
                  Barcode tidak ditemukan di master data
                </p>
                <p className="font-mono text-xs text-amber-700 dark:text-amber-400 mt-1 break-all">
                  {barcode}
                </p>
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                  Data tetap dapat disimpan. Kolom SAP Code &amp; Nama Barang akan diisi <strong>"null"</strong>. Hubungi Admin / SPV untuk update master data.
                </p>
              </div>
              <button
                onClick={resetForm}
                className="text-gray-400 hover:text-red-500 text-xs px-2 py-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors flex-shrink-0"
              >
                Ganti
              </button>
            </div>
          )}

          {/* Master data ditemukan — tampilkan info produk */}
          {masterData && step >= 2 && (
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle2 size={16} className="text-green-600 dark:text-green-400 flex-shrink-0" />
                    <p className="font-semibold text-green-800 dark:text-green-300 text-sm">
                      Produk ditemukan di master data
                    </p>
                  </div>
                  <p className="font-bold text-gray-900 dark:text-white text-base leading-tight mb-2">
                    {masterData.namaBarang}
                  </p>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                    <div>
                      <span className="text-gray-500 dark:text-gray-400">SAP Code:</span>{' '}
                      <span className="font-mono font-semibold text-gray-900 dark:text-white">
                        {masterData.sapCode || '—'}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500 dark:text-gray-400">Kode OCS:</span>{' '}
                      <span className="font-mono font-semibold text-gray-900 dark:text-white">
                        {masterData.ocsCode || '—'}
                      </span>
                    </div>
                    <div className="col-span-2">
                      <span className="text-gray-500 dark:text-gray-400">Barcode:</span>{' '}
                      <span className="font-mono text-gray-900 dark:text-white break-all">
                        {barcode}
                      </span>
                    </div>
                  </div>
                </div>
                <button
                  onClick={resetForm}
                  className="text-gray-400 hover:text-red-500 text-xs px-2 py-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors flex-shrink-0"
                >
                  Ganti
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Qty PCS */}
          {step === 2 && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  Qty (PCS)
                </label>
                <input
                  type="number"
                  min={1}
                  value={qtyPcs}
                  onChange={(e) => setQtyPcs(Math.max(1, parseInt(e.target.value) || 1))}
                  onKeyDown={(e) => { if (e.key === 'Enter') setStep(3); }}
                  autoFocus
                  className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-500 text-2xl font-bold text-center"
                />
                <p className="text-xs text-gray-500 mt-1 text-center">Tekan Enter untuk lanjut ke scan lokasi</p>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Batch / No. Dokumen <span className="text-gray-400 font-normal">(opsional)</span>
                  </label>
                  <label className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={kunciBatch}
                      onChange={(e) => setKunciBatch(e.target.checked)}
                      className="rounded border-gray-300 text-green-600 focus:ring-green-500"
                    />
                    Pertahankan untuk scan berikutnya
                  </label>
                </div>
                <input
                  type="text"
                  value={batchDoc}
                  onChange={(e) => setBatchDoc(e.target.value.toUpperCase().slice(0, 32))}
                  onKeyDown={(e) => { if (e.key === 'Enter') setStep(3); }}
                  placeholder="mis. B240815 — kosongkan bila tidak ada"
                  maxLength={32}
                  className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500 font-mono text-sm uppercase"
                />
                {kunciBatch && batchDoc.trim() && (
                  <p className="text-xs text-green-700 dark:text-green-400 mt-1">
                    Batch <strong className="font-mono">{batchDoc.trim()}</strong> akan terpakai lagi pada scan berikutnya sampai Anda mengubahnya.
                  </p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  Catatan (opsional)
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Catatan tambahan..."
                  rows={2}
                  className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500 resize-none text-sm"
                />
              </div>
              <Button onClick={() => setStep(3)} className="w-full bg-green-600 hover:bg-green-700">
                <MapPin size={16} />
                Lanjut Scan Lokasi
              </Button>
            </div>
          )}

          {/* Step 3: Lokasi */}
          {step === 3 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Lokasi Bin</label>
                <button
                  type="button"
                  onClick={() => { setUseManualBin(!useManualBin); setLocation(''); }}
                  className="flex items-center gap-1.5 text-xs text-green-600 hover:text-green-700 font-medium"
                >
                  {useManualBin
                    ? <><ScanLine size={14} /> Pakai Scanner</>
                    : <><Edit3 size={14} /> Pilih Manual</>}
                </button>
              </div>

              {!useManualBin ? (
                <BarcodeInput
                  label="Scan Barcode Lokasi Bin"
                  placeholder="Scan lokasi bin..."
                  onScan={handleLocationScan}
                  autoFocus
                  disabled={isSaving}
                />
              ) : (
                <>
                  <ManualBinSelect value={location} onChange={setLocation} onConfirm={(loc) => handleSave(loc)} />
                  {location && (
                    <Button onClick={() => handleSave(location)} loading={isSaving} className="w-full bg-green-600 hover:bg-green-700">
                      Simpan Data
                    </Button>
                  )}
                </>
              )}

              <Button onClick={() => setStep(2)} variant="ghost" size="sm" className="w-full">
                <RotateCcw size={14} /> Kembali ke Input Qty
              </Button>
            </div>
          )}

          {/* Reset button */}
          {(step > 0 || barcode || masterNotFound) && (
            <Button onClick={resetForm} variant="ghost" size="sm" className="w-full">
              <RotateCcw size={14} /> Reset Semua
            </Button>
          )}
        </div>

        {/* Scan History */}
        <ScanHistoryTable entries={scanHistory} type="kt" />

        {/* ── Duplicate Warning Modal ── */}
        <Modal isOpen={showDuplicateWarning} title="Potensi Data Double" onClose={() => setShowDuplicateWarning(false)}>
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-3 bg-orange-50 dark:bg-orange-900/20 rounded-lg">
              <AlertTriangle className="text-orange-600 flex-shrink-0 mt-0.5" size={18} />
              <p className="text-sm text-orange-800 dark:text-orange-300">
                Barcode <strong>{barcode}</strong> dengan lokasi <strong>{location}</strong> sudah pernah distock sebelumnya. Simpan ulang?
              </p>
            </div>
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setShowDuplicateWarning(false)} className="flex-1">Batal</Button>
              <Button
                onClick={() => { setShowDuplicateWarning(false); setIsSaving(true); saveEntry(location, true); }}
                className="flex-1" variant="danger"
              >
                Simpan Ulang
              </Button>
            </div>
          </div>
        </Modal>

        {/* ── Modal: Barcode Gudang Besar Terdeteksi ── */}
        <Modal
          isOpen={showGudangBesarModal}
          title="Barcode Gudang Besar Terdeteksi"
          onClose={() => setShowGudangBesarModal(false)}
        >
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl">
              <AlertTriangle className="text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" size={20} />
              <div>
                <p className="text-sm font-semibold text-blue-800 dark:text-blue-300">
                  Barcode ini adalah format Gudang Besar
                </p>
                <p className="text-xs text-blue-700 dark:text-blue-400 mt-1.5">
                  Barcode yang di-scan mengandung lebih dari satu field separator (<code className="bg-blue-100 dark:bg-blue-800 px-1 rounded">;</code>), yang merupakan format barcode multi-field Gudang Besar.
                </p>
                <p className="text-xs text-blue-600 dark:text-blue-400 mt-1.5">
                  Saat ini Anda menggunakan menu <strong>Stock Opname Gudang Kecil</strong>. Gunakan menu SO Gudang Besar untuk memproses barcode ini.
                </p>
                <p className="font-mono text-xs text-blue-500 dark:text-blue-400 mt-2 break-all bg-blue-100 dark:bg-blue-900/40 p-2 rounded">
                  {gbBarcode}
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Button
                onClick={() => router.push('/stock-opname/gudang-besar')}
                className="w-full bg-blue-600 hover:bg-blue-700"
              >
                <ArrowRightCircle size={16} />
                Beralih ke SO Gudang Besar
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowGudangBesarModal(false)}
                className="w-full"
              >
                Tetap di Menu Ini
              </Button>
            </div>
          </div>
        </Modal>
      </div>
    </AppLayout>
  );
}
