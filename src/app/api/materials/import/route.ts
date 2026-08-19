import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { normalizeCode, classifySapCode, cleanValue } from '@/lib/normalize';

export const dynamic = 'force-dynamic';

type Baris = {
  ocsCode: string; name?: string; category?: string;
  sapCodeIeg?: string; sapCodeEji?: string; sapCode?: string;
  barcodeProduct?: string; barcodeBpom?: string; active?: any;
};

/**
 * POST /api/materials/import  { rows: Baris[], nonaktifkanSisanya?: boolean }
 *
 * Upsert berdasarkan kode OCS. Aman dijalankan berulang.
 *
 * Kalau file hanya punya SATU kolom kode SAP (seperti Master_Gudang_Kecil lama
 * yang mencampur keduanya), kolom itu dipilah otomatis memakai prefix:
 * 1222/1227/1228 = EJI, selain itu IEG. Aturan tersebut diuji ke 424 baris
 * Resume_SO — nol pelanggaran di kedua arah.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const rows = (body.rows ?? []) as Baris[];
    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: 'Tidak ada baris untuk di-import' }, { status: 400 });
    }

    let dibuat = 0, diperbarui = 0, dilewati = 0;
    const contohDilewati: string[] = [];
    const kodeMasuk = new Set<string>();

    const UKURAN = 100;
    for (let i = 0; i < rows.length; i += UKURAN) {
      const bagian = rows.slice(i, i + UKURAN);
      for (const r of bagian) {
        const ocsCode = cleanValue(r.ocsCode).trim();
        if (!ocsCode) {
          dilewati++;
          if (contohDilewati.length < 20) contohDilewati.push('(kode kosong)');
          continue;
        }
        const norm = normalizeCode(ocsCode);
        if (kodeMasuk.has(norm)) { dilewati++; continue; }   // kembar di dalam file
        kodeMasuk.add(norm);

        let ieg = cleanValue(r.sapCodeIeg).trim() || null;
        let eji = cleanValue(r.sapCodeEji).trim() || null;
        const tunggal = cleanValue(r.sapCode).trim();
        if (tunggal && !ieg && !eji) {
          if (classifySapCode(tunggal) === 'EJI') eji = tunggal; else ieg = tunggal;
        }

        const barcodeProduct = cleanValue(r.barcodeProduct).trim() || null;
        const barcodeBpom = cleanValue(r.barcodeBpom).trim() || null;
        const aktif = r.active === undefined ? undefined
          : !/^(tidak|no|false|0|nonaktif|tidak aktif)$/i.test(String(r.active).trim());

        const data = {
          ocsCode,
          name: cleanValue(r.name).trim() || ocsCode,
          category: cleanValue(r.category).trim() || null,
          sapCodeIeg: ieg, sapCodeEji: eji,
          barcodeProduct, barcodeBpom,
          normOcsCode: norm,
          normSapIeg: normalizeCode(ieg) || null,
          normSapEji: normalizeCode(eji) || null,
          normBarcodeProduct: normalizeCode(barcodeProduct) || null,
          normBarcodeBpom: normalizeCode(barcodeBpom) || null,
          ...(aktif === undefined ? {} : { active: aktif }),
          source: 'import',
        };

        const ada = await prisma.material.findUnique({ where: { ocsCode }, select: { id: true } });
        if (ada) {
          await prisma.material.update({ where: { id: ada.id }, data });
          diperbarui++;
        } else {
          await prisma.material.create({ data: { ...data, active: aktif ?? true } });
          dibuat++;
        }
      }
    }

    // Menonaktifkan material di luar file adalah tindakan yang bisa menghapus
    // barang dari jangkauan scan, jadi HARUS diminta eksplisit — tidak pernah
    // menjadi perilaku bawaan.
    let dinonaktifkan = 0;
    if (body.nonaktifkanSisanya) {
      const semua = await prisma.material.findMany({ select: { id: true, normOcsCode: true } });
      const idLuar = semua.filter((m) => !kodeMasuk.has(m.normOcsCode)).map((m) => m.id);
      if (idLuar.length > 0) {
        const res = await prisma.material.updateMany({ where: { id: { in: idLuar } }, data: { active: false } });
        dinonaktifkan = res.count;
      }
    }

    return NextResponse.json({
      success: true,
      dibaca: rows.length, dibuat, diperbarui, dilewati, dinonaktifkan,
      contohDilewati,
    });
  } catch (e: any) {
    console.error('[materials/import POST]', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
