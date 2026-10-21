// lib/csv.ts
export const toCSV = (rows: (string | number)[][]) =>
  rows
    .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
    .join("\n");

export function download(name: string, text: string, mime = "text/csv") {
  // UTF-8 BOM so Excel doesn't mangle non-ASCII.
  const blob = new Blob(["\uFEFF" + text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  // Safari needs a tick before revoking.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}