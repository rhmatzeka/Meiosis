/**
 * Keeper: menetaskan kehamilan begitu blok pengungkapnya lewat.
 *
 * Tanpa ini pengguna harus kembali dan menandatangani transaksi kedua, dan
 * juri tidak akan melakukannya. `hatch()` terbuka untuk siapa saja dan anak
 * selalu jatuh ke `p.to`, jadi keeper hanya membayar gas — ia tidak bisa
 * memilih hasil (seed-nya blockhash yang sudah lewat) dan tidak bisa mengambil anak.
 *
 * Kehamilan yang blockhash-nya kedaluwarsa (>256 blok) di-`reroll` supaya
 * tidak tersangkut selamanya.
 */
import type { Abi, Account, Chain, PublicClient, Transport, WalletClient } from "viem";
import type { Deployment } from "./chain";

const BLOCKHASH_WINDOW = 256n;

export function startKeeper(o: {
  pub: PublicClient;
  signer: WalletClient<Transport, Chain, Account>;
  getDep: () => Deployment | null;
  abi: Abi;
  intervalMs: number;
  onHatched?: (pid: number) => Promise<void>;
}) {
  const done = new Set<number>();
  let registry = "";
  let lastHead = -1n;
  let running = false;

  const read = (d: Deployment, fn: string, args: unknown[] = []) =>
    o.pub.readContract({ address: d.hatchery, abi: o.abi, functionName: fn, args } as never);

  const write = async (d: Deployment, fn: string, pid: number) => {
    const hash = await o.signer.writeContract({ address: d.hatchery, abi: o.abi, functionName: fn, args: [pid] } as never);
    const r = await o.pub.waitForTransactionReceipt({ hash });
    return r.status === "success";
  };

  async function tick() {
    const d = o.getDep();
    if (!d || running) return;
    running = true;
    try {
      if (registry !== d.registry) { registry = d.registry; done.clear(); lastHead = -1n; }
      const head = await o.pub.getBlockNumber();
      if (head === lastHead) return;
      lastHead = head;

      const next = Number(await read(d, "nextPregnancyId"));
      for (let pid = 1; pid < next; pid++) {
        if (done.has(pid)) continue;
        const p = (await read(d, "pregnancies", [pid])) as unknown[];
        const reveal = BigInt(p[2] as number), hatched = p[3] as boolean;
        if (hatched) { done.add(pid); continue; }
        if (head <= reveal) continue;
        try {
          if (head > reveal + BLOCKHASH_WINDOW) {
            await write(d, "reroll", pid);
            console.log(`  keeper: kehamilan #${pid} kedaluwarsa, dijadwalkan ulang`);
          } else if (await write(d, "hatch", pid)) {
            done.add(pid);
            console.log(`  keeper: kehamilan #${pid} ditetaskan`);
            await o.onHatched?.(pid).catch(() => {});
          }
        } catch (e) {
          // Paling sering: orang lain menetaskannya lebih dulu. Putaran berikutnya
          // membaca `hatched: true` dan berhenti mencoba.
          console.log(`  keeper: #${pid} dilewati — ${(e as Error).message.split("\n")[0].slice(0, 120)}`);
        }
      }
    } catch { /* chain sedang tidak terjangkau; coba lagi di putaran berikutnya */ }
    finally { running = false; }
  }

  const t = setInterval(tick, o.intervalMs);
  tick();
  return () => clearInterval(t);
}
