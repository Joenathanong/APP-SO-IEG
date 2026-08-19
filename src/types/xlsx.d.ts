// Deklarasi tipe untuk xlsx (SheetJS).
//
// PENTING: berkas ini MEMBAYANGI tipe asli yang ikut di dalam paket
// (`node_modules/xlsx/types/index.d.ts`). Deklarasi ambient `declare module`
// di dalam project selalu menang atas tipe dari node_modules, jadi apa pun yang
// tidak tercantum di sini akan dianggap tidak ada — walaupun fungsinya jelas
// tersedia saat aplikasi berjalan.
//
// Versi sebelumnya hanya mencantumkan empat anggota, sehingga `read`,
// `readFile`, `sheet_to_json`, dan tipe `WorkBook` memicu kegagalan build
// meskipun kodenya benar. Kalau nanti memakai anggota xlsx yang lain,
// TAMBAHKAN di sini juga.
//
// Alternatifnya: hapus berkas ini dan pakai tipe asli paket. Itu lebih akurat,
// tapi tipe asli SheetJS jauh lebih ketat dan bisa memunculkan error baru di
// kode yang sekarang sudah jalan — jadi dibiarkan dibayangi secara sengaja.

declare module 'xlsx' {
  export interface WorkSheet {
    [cell: string]: any;
    '!cols'?: Array<{ wch?: number; width?: number; hidden?: boolean }>;
    '!rows'?: Array<{ hpx?: number; hpt?: number; hidden?: boolean }>;
    '!ref'?: string;
    '!merges'?: any[];
  }

  export interface WorkBook {
    SheetNames: string[];
    Sheets: { [sheetName: string]: WorkSheet };
    Props?: Record<string, any>;
  }

  export interface Sheet2JSONOpts {
    header?: 1 | 'A' | string[];
    range?: any;
    blankrows?: boolean;
    defval?: any;
    raw?: boolean;
    rawNumbers?: boolean;
    skipHidden?: boolean;
  }

  export interface ParsingOptions {
    type?: 'base64' | 'binary' | 'buffer' | 'file' | 'array' | 'string';
    raw?: boolean;
    cellDates?: boolean;
    cellFormula?: boolean;
    cellNF?: boolean;
    cellStyles?: boolean;
    cellText?: boolean;
    sheets?: number | string | Array<number | string>;
    dense?: boolean;
    codepage?: number;
  }

  export interface WritingOptions {
    type?: 'base64' | 'binary' | 'buffer' | 'file' | 'array' | 'string';
    bookType?: 'xlsx' | 'xlsm' | 'xlsb' | 'xls' | 'csv' | 'txt' | 'html' | 'ods';
    bookSST?: boolean;
    compression?: boolean;
    sheet?: string;
  }

  export const utils: {
    book_new(): WorkBook;
    book_append_sheet(wb: WorkBook, ws: WorkSheet, name?: string, roll?: boolean): void;
    aoa_to_sheet(data: any[][], opts?: any): WorkSheet;
    json_to_sheet(data: any[], opts?: any): WorkSheet;
    sheet_to_json<T = any>(ws: WorkSheet, opts?: Sheet2JSONOpts): T[];
    sheet_to_csv(ws: WorkSheet, opts?: any): string;
    sheet_add_aoa(ws: WorkSheet, data: any[][], opts?: any): WorkSheet;
    decode_range(ref: string): any;
    encode_range(range: any): string;
    encode_cell(cell: { c: number; r: number }): string;
    decode_cell(address: string): { c: number; r: number };
  };

  export function read(data: any, opts?: ParsingOptions): WorkBook;
  export function readFile(filename: string, opts?: ParsingOptions): WorkBook;
  export function write(wb: WorkBook, opts?: WritingOptions): any;
  export function writeFile(wb: WorkBook, filename: string, opts?: WritingOptions): void;
}
