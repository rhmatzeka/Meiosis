/**
 * Memecah rentang blok untuk eth_getLogs. RPC publik Sepolia menolak rentang
 * yang terlalu lebar (umumnya 10k–50k blok), jadi pemindaian dari blok deploy
 * sampai sekarang harus dilakukan sepotong-sepotong.
 */
export function blockRanges(from: bigint, to: bigint, size: bigint): [bigint, bigint][] {
  const out: [bigint, bigint][] = [];
  for (let a = from; a <= to; a += size) out.push([a, a + size - 1n < to ? a + size - 1n : to]);
  return out;
}
