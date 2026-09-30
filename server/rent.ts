/**
 * Bukti sewa: sebelum server menjalankan agent milik orang lain, penyewa harus
 * menunjukkan tx `Market.rent` untuk agent itu, sebesar harga sewanya, yang
 * belum pernah dipakai untuk tugas lain. Murni supaya bisa diuji tanpa chain.
 */
export interface RentEvent { agentId: number; amount: bigint; market: string }

/** Harga pemilik bila dipasang; selain itu harga bawaan platform (RUN_PRICE_ETH). */
export const effectiveRentWei = (ownerPrice: bigint, platformDefault: bigint) =>
  ownerPrice > 0n ? ownerPrice : platformDefault;

export function checkRent(
  events: RentEvent[],
  o: { agentId: number; priceWei: bigint; market: string; txHash: string; used: Set<string> },
): { ok: true } | { ok: false; error: string } {
  if (o.used.has(o.txHash.toLowerCase())) return { ok: false, error: "bukti bayar ini sudah dipakai untuk tugas lain" };
  const mine = events.filter((e) => e.market.toLowerCase() === o.market.toLowerCase());
  const forAgent = mine.filter((e) => e.agentId === o.agentId);
  if (!forAgent.length) return { ok: false, error: `tx itu bukan sewa untuk agent #${o.agentId}` };
  if (!forAgent.some((e) => e.amount >= o.priceWei)) return { ok: false, error: `pembayaran sewa #${o.agentId} kurang dari harganya` };
  return { ok: true };
}
