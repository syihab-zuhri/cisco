/**
 * Sel CSV aman: kutip digandakan dan awalan rumus spreadsheet (= + - @ tab CR) dinetralkan
 * dengan apostrof, supaya nickname buatan siswa tidak dieksekusi saat guru membuka CSV di Excel.
 */
export function csvCell(value: string | number): string {
  const text = String(value);
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}
