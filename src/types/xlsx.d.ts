// Minimal type declaration for xlsx (SheetJS) — full types come from the installed package at runtime
declare module 'xlsx' {
  const utils: {
    book_new: () => any;
    aoa_to_sheet: (data: any[][]) => any;
    book_append_sheet: (wb: any, ws: any, name: string) => void;
  };
  function writeFile(wb: any, filename: string): void;
}
