/** Cukupkah saldo untuk membayar harga dan biaya jaringan? Bila perkiraan biaya gagal, dipakai cadangan yang aman. */
export const FEE_FALLBACK_WEI = 200_000_000_000_000n;
export function affordability(balanceWei: bigint, valueWei: bigint, feeWei: bigint | null) {
  const need = valueWei + (feeWei ?? FEE_FALLBACK_WEI);
  return balanceWei >= need ? { ok: true as const } : { ok: false as const, shortWei: need - balanceWei };
}
