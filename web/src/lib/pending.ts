/**
 * Transaksi yang sudah ditandatangani tapi belum terlihat selesai, supaya
 * pengguna yang menutup tab masih bisa melacaknya di Dompet. Hanya kenyamanan
 * per browser; status sebenarnya selalu dibaca dari /api/receipt.
 */
export interface PendingTx { hash: string; label: string; at: number }
const KEY = "meiosis:pending";
const MAX = 20;

function read(): PendingTx[] {
  try { return JSON.parse(localStorage.getItem(KEY) ?? "[]") as PendingTx[]; } catch { return []; }
}
function write(list: PendingTx[]) {
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* penyimpanan diblokir */ }
}

export const listPending = (): PendingTx[] => [...read()].sort((a, b) => b.at - a.at);
export function addPending(tx: PendingTx) {
  write([...read().filter((x) => x.hash !== tx.hash), tx].sort((a, b) => a.at - b.at).slice(-MAX));
}
export function removePending(hash: string) {
  write(read().filter((x) => x.hash !== hash));
}
