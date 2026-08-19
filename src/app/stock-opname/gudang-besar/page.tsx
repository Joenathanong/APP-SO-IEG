'use client';
import { useState, useCallback } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { BarcodeInput } from '@/components/stock/BarcodeInput';
import { ManualBinSelect } from '@/components/stock/ManualBinSelect';
import { ScanHistoryTable } from '@/components/stock/ScanHistoryTable';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { useAuth } from '@/contexts/AuthContext';
import { useShift } from '@/contexts/ShiftContext';
import { useToast } from '@/hooks/useToast';
import { saveWithQueue, pesanGagal } from '@/lib/save-entry';
import { parseGudangBesarBarcode, debugBarcode, formatTimestamp, formatDate } from '@/lib/utils';
import { StockEntryGB, ParsedBarcodeGB } from '@/types';
import { Package, MapPin, RotateCcw, AlertTriangle, RefreshCw, ScanLine, Edit3, Loader2 } from 'lucide-react';

export default function GudangBesarPage() {
  const { user } = useAuth();
  const { shift } = useShift();
  const { showSuccess, showError, showWarning } = useToast();

  const [step, setStep] = useState<1 | 2>(1);
  const [parsedData, setParsedData] = useState<ParsedBarcodeGB | null>(null);
  const [rawBarcode, setRawBarcode] = useState('');
  const [ocsCode, setOcsCode] = useState('');
  const [ocsLoading, setOcsLoading] = useState(false);
  const [qtyCarton, setQtyCarton] = useState(1);
  const [overrideQtyPerBox, setOverrideQtyPerBox] = useState<number | null>(null);
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');
  const [useManualBin, setUseManualBin] = useState(false);
  const [scanHistory, setScanHistory] = useState<StockEntryGB[]>([]);
  const [showBoxConfirm, setShowBoxConfirm] = useState(false);
  const [showDuplicateWarning, setShowDuplicateWarning] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [failedEntry, setFailedEntry] = useState<StockEntryGB | null>(null);
  const [editBoxQty, setEditBoxQty] = useState(false);
  const [tempBoxQty, setTempBoxQty] = useState<number>(0);

  const effectiveQtyPerBox = overrideQtyPerBox !== null ? overrideQtyPerBox : (parsedData?.qtyPerBox || 0);
  const qtyPcsTotal = Math.round(qtyCarton * effectiveQtyPerBox);

  const resetForm = useCallback(() => {
    setStep(1);
    setParsedData(null);
    setRawBarcode('');
    setOcsCode('');
    setQtyCarton(1);
    setOverrideQtyPerBox(null);
    setLocation('');
    setNotes('');
    setUseManualBin(false);
    setFailedEntry(null);
    setShowBoxConfirm(false);
    setShowDuplicateWarning(false);
  }, []);

  // Lookup OCS Code dari Master_Gudang_Kecil by SAP code (materialId)
  const lookupOcsCode = async (materialId: string): Promise<string> => {
    try {
      setOcsLoading(true);
      // Kode SAP dicari di DUA kolom (IEG dan EJI) oleh server. Master lama
      // menyimpan keduanya bercampur di satu kolom, jadi mencari satu sisi saja
      // membuat sebagian barang tidak pernah ketemu.
      const res = await fetch(`/api/materials/lookup?sap=${encodeURIComponent(materialId)}`);
      if (!res.ok) return '';
      const data = await res.json();
      return data.found ? (data.material?.ocsCode || '') : '';
    } catch {
      return '';
    } finally {
      setOcsLoading(false);
    }
  };

  const handleProductScan = async (raw: string) => {
    const parsed = parseGudangBesarBarcode(raw);
    if (!parsed) {
      const debugInfo = debugBarcode(raw);
      const fieldCount = raw.split(/[;；\t|,]/).length;
      showError(
        'Barcode tidak valid',
        `Jumlah field: ${fieldCount} (minimal 7). Raw: ${debugInfo.substring(0, 80)}`
      );
      return;
    }
    setParsedData(parsed);
    setRawBarcode(raw);
    setQtyCarton(1);
    setOverrideQtyPerBox(null);

    // Lookup OCS code secara async (tidak block scan)
    const ocs = await lookupOcsCode(parsed.materialId);
    setOcsCode(ocs);

    // Validasi isi box dari barcode — jika > 480, langsung popup konfirmasi
    if (parsed.qtyPerBox > 480) {
      setTempBoxQty(parsed.qtyPerBox);
      setEditBoxQty(false);
      setShowBoxConfirm(true);
    }
  };

  const handleProceedToLocation = () => {
    if (!parsedData) {
      showError('Scan barcode produk terlebih dahulu.');
      return;
    }
    if (qtyCarton <= 0) {
      showError('Qty karton harus lebih dari 0.');
      return;
    }
    setStep(2);
  };

  const handleLocationScan = (loc: string) => {
    setLocation(loc);
    handleSave(loc);
  };

  const handleSave = async (loc?: string, potentialDouble = false) => {
    const finalLocation = loc || location;
    if (!finalLocation) {
      showError('Lokasi wajib diisi.');
      return;
    }
    if (!parsedData || !user || !shift) return;

    setIsSaving(true);

    // Peringatan duplikat berbasis barcode+lokasi SENGAJA dihapus.
    // Audit data lama menunjukkan kriteria itu menandai 75% baris Gudang Besar
    // dan 90% Gudang Kecil — padahal satu SKU di satu bin memang discan sekali
    // per karton. Peringatan yang muncul di seperempat scan hanya melatih
    // operator untuk mengabaikannya.
    // Kiriman ganda karena masalah teknis ditutup index unik `clientEntryId`;
    // hitung ganda antar-operator ditangani status hitung per bin.
    try {
      await saveEntry(finalLocation, potentialDouble);
    } catch (e) {
      setIsSaving(false);
      showError('Gagal menyimpan data.');
    }
  };

  const saveEntry = async (finalLocation: string, potentialDouble: boolean) => {
    if (!parsedData || !user || !shift) return;

    const entry: StockEntryGB = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      timestamp: formatTimestamp(),
      date: formatDate(),
      user: user.name,
      shift,
      materialId: parsedData.materialId,
      batchDoc: parsedData.batchDoc,
      unitCtn: parsedData.unitCtn,
      qtyPerBox: effectiveQtyPerBox,
      unitPcs: parsedData.unitPcs,
      barcode: parsedData.barcode,
      ocsCode,
      description: parsedData.description,
      wh: parsedData.wh,
      qtyCarton,
      qtyPcsTotal,
      location: finalLocation,
      notes,
      status: 'saved',
      potentialDouble,
    };

    // saveWithQueue TIDAK PERNAH membuang entry: setiap kegagalan — offline,
    // timeout, 429 kuota Sheets, 5xx — masuk antrean IndexedDB dan dikirim ulang
    // otomatis. Pengulangan aman karena server menolak `id` yang sudah tersimpan.
    const outcome = await saveWithQueue('gudang-besar', entry);

    if (outcome.ok) {
      showSuccess(
        outcome.duplicate ? 'Sudah tersimpan sebelumnya' : 'Data tersimpan',
        `${parsedData.barcode} @ ${finalLocation}`
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
      const failEntry = { ...entry, status: 'error' as const };
      setFailedEntry(failEntry);
      showError(pesanGagal(outcome).judul, pesanGagal(outcome).detail);
    }
    setIsSaving(false);
  };

  const handleRetry = async () => {
    if (!failedEntry) return;
    setIsSaving(true);
    const outcome = await saveWithQueue('gudang-besar', { ...failedEntry, status: 'saved' });
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

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Package size={24} className="text-blue-600" />
            Stock Opname Gudang Besar
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Scan barcode produk kemudian scan lokasi bin
          </p>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-3">
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${step === 1 ? 'bg-blue-600 text-white' : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'}`}>
            <span className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center text-xs font-bold">1</span>
            Scan Produk
          </div>
          <div className="h-px flex-1 bg-gray-300 dark:bg-gray-600" />
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${step === 2 ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'}`}>
            <span className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center text-xs font-bold">2</span>
            Scan Lokasi
          </div>
        </div>

        {/* Failed entry retry banner */}
        {failedEntry && (
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 rounded-xl p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="text-yellow-600 flex-shrink-0 mt-0.5" size={18} />
              <div className="flex-1">
                <p className="text-sm font-medium text-yellow-800 dark:text-yellow-300">
                  Data gagal disimpan. Tersimpan sementara di perangkat.
                </p>
                <p className="text-xs text-yellow-700 dark:text-yellow-400 mt-1">
                  {failedEntry.barcode} @ {failedEntry.location}
                </p>
              </div>
            </div>
            <div className="flex gap-2 mt-3">
              <Button onClick={handleRetry} size="sm" loading={isSaving} variant="primary">
                <RefreshCw size={14} />
                Coba Simpan Ulang
              </Button>
              <Button onClick={() => { setFailedEntry(null); resetForm(); }} size="sm" variant="ghost">
                Batalkan
              </Button>
            </div>
          </div>
        )}

        {/* Step 1: Scan Product */}
        {step === 1 && (
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 space-y-5">
            <BarcodeInput
              label="Scan Barcode Produk"
              placeholder="Scan barcode produk (tekan Enter)..."
              onScan={handleProductScan}
              autoFocus
            />

            {parsedData && (
              <>
                {/* Parsed data card */}
                <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4 border border-blue-200 dark:border-blue-800">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900 dark:text-white text-sm truncate">
                        {parsedData.description}
                      </p>
                      <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                        <div>
                          <span className="text-gray-500">Material ID (SAP):</span>{' '}
                          <span className="font-medium text-gray-900 dark:text-white">{parsedData.materialId}</span>
                        </div>
                        <div>
                          <span className="text-gray-500">Kode OCS:</span>{' '}
                          {ocsLoading
                            ? <span className="inline-flex items-center gap-1 text-gray-400"><Loader2 size={10} className="animate-spin" />loading</span>
                            : <span className="font-medium text-blue-700 dark:text-blue-300">{ocsCode || '—'}</span>
                          }
                        </div>
                        <div>
                          <span className="text-gray-500">Batch/Doc:</span>{' '}
                          <span className="font-medium text-gray-900 dark:text-white">{parsedData.batchDoc}</span>
                        </div>
                        <div>
                          <span className="text-gray-500">Barcode:</span>{' '}
                          <span className="font-mono font-medium text-gray-900 dark:text-white">{parsedData.barcode}</span>
                        </div>
                        <div>
                          <span className="text-gray-500">WH:</span>{' '}
                          <span className="font-medium text-gray-900 dark:text-white">{parsedData.wh}</span>
                        </div>
                        <div>
                          <span className="text-gray-500">Isi per Box:</span>{' '}
                          <span className="font-medium text-gray-900 dark:text-white">
                            {effectiveQtyPerBox} {parsedData.unitPcs}
                          </span>
                          {overrideQtyPerBox !== null && (
                            <Badge variant="orange" className="ml-2">Override</Badge>
                          )}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => { setParsedData(null); setRawBarcode(''); setOcsCode(''); }}
                      className="text-gray-400 hover:text-gray-600 p-1"
                    >
                      ×
                    </button>
                  </div>
                </div>

                {/* Qty Karton */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                    Qty Karton
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={qtyCarton}
                    onChange={(e) => setQtyCarton(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-lg font-semibold"
                  />
                </div>

                {/* Total PCS display */}
                <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4 text-center">
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Total Quantity</p>
                  <p className="text-4xl font-bold text-blue-600 dark:text-blue-400">
                    {qtyPcsTotal.toLocaleString('id-ID')}
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    {parsedData.unitPcs} ({qtyCarton} CTN × {effectiveQtyPerBox} {parsedData.unitPcs})
                  </p>
                </div>

                {/* Notes */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                    Catatan (opsional)
                  </label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Tambahkan catatan jika diperlukan..."
                    rows={2}
                    className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none text-sm"
                  />
                </div>

                <div className="flex gap-3">
                  <Button onClick={resetForm} variant="ghost" size="md">
                    <RotateCcw size={16} />
                    Reset
                  </Button>
                  <Button onClick={handleProceedToLocation} className="flex-1">
                    <MapPin size={16} />
                    Lanjut Scan Lokasi
                  </Button>
                </div>
              </>
            )}
          </div>
        )}

        {/* Step 2: Scan Location */}
        {step === 2 && parsedData && (
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 space-y-5">
            {/* Summary */}
            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-3 border border-gray-200 dark:border-gray-600">
              <div className="flex items-center justify-between gap-2 mb-2">
                <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Ringkasan Produk</p>
                <button onClick={() => setStep(1)} className="text-xs text-blue-600 hover:underline">Edit</button>
              </div>
              <p className="text-sm font-medium text-gray-900 dark:text-white">{parsedData.description}</p>
              <div className="flex flex-wrap gap-3 mt-1 text-xs text-gray-600 dark:text-gray-400">
                <span>{parsedData.materialId}</span>
                {ocsCode && <span className="text-blue-600 dark:text-blue-400 font-medium">OCS: {ocsCode}</span>}
                <span>{qtyCarton} CTN</span>
                <span className="font-semibold text-blue-600 dark:text-blue-400">{qtyPcsTotal} {parsedData.unitPcs}</span>
              </div>
              {notes && <p className="text-xs text-gray-500 mt-1 italic">Catatan: {notes}</p>}
            </div>

            {/* Location input toggle */}
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Mode Input Lokasi</label>
              <button
                type="button"
                onClick={() => { setUseManualBin(!useManualBin); setLocation(''); }}
                className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 font-medium"
              >
                {useManualBin ? <><ScanLine size={14} /> Pakai Scanner</> : <><Edit3 size={14} /> Pilih Manual</>}
              </button>
            </div>

            {!useManualBin ? (
              <BarcodeInput
                label="Scan Barcode Lokasi Bin"
                placeholder="Scan lokasi bin (tekan Enter)..."
                onScan={handleLocationScan}
                autoFocus
                disabled={isSaving}
              />
            ) : (
              <>
                <ManualBinSelect
                  warehouse={parsedData.wh}
                  value={location}
                  onChange={setLocation}
                  onConfirm={(loc) => handleSave(loc)}
                />
                {location && (
                  <Button onClick={() => handleSave(location)} loading={isSaving} className="w-full">
                    Simpan Data
                  </Button>
                )}
              </>
            )}

            <Button onClick={() => setStep(1)} variant="ghost" size="sm" className="w-full">
              <RotateCcw size={14} />
              Kembali ke Step 1
            </Button>
          </div>
        )}

        {/* Scan History */}
        <ScanHistoryTable entries={scanHistory} type="gb" />

        {/* Box Confirm Modal */}
        <Modal isOpen={showBoxConfirm} title="Konfirmasi Jumlah Produk" onClose={() => setShowBoxConfirm(false)}>
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
              <AlertTriangle className="text-yellow-600 flex-shrink-0 mt-0.5" size={18} />
              <p className="text-sm text-yellow-800 dark:text-yellow-300">
                Isi produk per box terdeteksi <strong>{effectiveQtyPerBox.toLocaleString('id-ID')} {parsedData?.unitPcs}</strong>.
                Jumlah ini melebihi 480 PCS. Apakah isi box sudah benar?
              </p>
            </div>

            {editBoxQty ? (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  Edit Isi per Box (PCS)
                </label>
                <input
                  type="number"
                  min={1}
                  value={tempBoxQty}
                  onChange={(e) => setTempBoxQty(parseFloat(e.target.value) || 0)}
                  className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <Button
                  className="w-full mt-2"
                  onClick={() => { setOverrideQtyPerBox(tempBoxQty); setEditBoxQty(false); setShowBoxConfirm(false); }}
                >
                  Terapkan & Lanjutkan
                </Button>
              </div>
            ) : (
              <div className="flex gap-3">
                <Button variant="outline" onClick={() => { setEditBoxQty(true); setTempBoxQty(effectiveQtyPerBox); }} className="flex-1">
                  Edit Isi Box
                </Button>
                <Button onClick={() => { setShowBoxConfirm(false); }} className="flex-1">
                  Ya, Lanjutkan
                </Button>
              </div>
            )}
          </div>
        </Modal>

        {/* Duplicate Warning Modal */}
        <Modal isOpen={showDuplicateWarning} title="Potensi Data Double" onClose={() => setShowDuplicateWarning(false)}>
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-3 bg-orange-50 dark:bg-orange-900/20 rounded-lg">
              <AlertTriangle className="text-orange-600 flex-shrink-0 mt-0.5" size={18} />
              <p className="text-sm text-orange-800 dark:text-orange-300">
                Barcode <strong>{parsedData?.barcode}</strong> dengan lokasi <strong>{location}</strong> sudah pernahpan ulang?
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
      </div>
    </AppLayout>
  );
}
