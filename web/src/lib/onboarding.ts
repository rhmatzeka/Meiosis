/**
 * Langkah pertama pengguna baru: masuk → punya saldo untuk biaya jaringan →
 * buat agent → beri tugas. null bila semuanya sudah dilalui.
 */
export type Step = "masuk" | "saldo" | "buat" | "tugas";

/** 0,0002 ETH: cukup untuk beberapa transaksi biaya jaringan (Studio gratis selama beta). */
export const MIN_BALANCE_WEI = 200_000_000_000_000n;
const RAN_KEY = "meiosis:ran-task";

export function nextStep(p: { signedIn: boolean; balanceWei: bigint; ownsAgent: boolean; ranTask: boolean }): Step | null {
  if (!p.signedIn) return "masuk";
  if (p.ownsAgent && p.ranTask) return null;
  if (p.balanceWei < MIN_BALANCE_WEI) return "saldo";
  if (!p.ownsAgent) return "buat";
  return "tugas";
}

export function hasRunTask() {
  try { return localStorage.getItem(RAN_KEY) === "1"; } catch { return false; }
}
export function markTaskRun() {
  try { localStorage.setItem(RAN_KEY, "1"); } catch { /* penyimpanan diblokir */ }
}
