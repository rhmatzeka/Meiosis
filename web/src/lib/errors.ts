/**
 * Galat dari kontrak, wallet, dan server diterjemahkan jadi satu kalimat yang
 * bisa ditindaklanjuti. "OnCooldown(1, 130)" tidak berarti apa-apa bagi juri;
 * "Solidity Smith sedang istirahat, siap ±6 menit lagi" berarti.
 */
import { formatEther } from "viem";
import { cooldownLabel } from "./genetics";

export interface ErrorCtx { names: Record<number, string>; block: number; secPerBlock: number }

const text = (e: unknown): string => {
  const x = e as { shortMessage?: string; message?: string; data?: { message?: string }; details?: string };
  return [x?.data?.message, x?.details, x?.shortMessage, x?.message, typeof e === "string" ? e : ""]
    .filter(Boolean).join(" | ");
};

export function humanError(e: unknown, ctx: ErrorCtx): { message: string; quiet: boolean } {
  const code = (e as { code?: number })?.code;
  const m = text(e);
  const name = (id: string | number) => ctx.names[Number(id)] ?? `Agent #${id}`;

  if (code === 4001 || /user rejected|user denied|rejected the request|cancell?ed by user/i.test(m)) {
    return { message: "Dibatalkan.", quiet: true };
  }

  const cd = m.match(/OnCooldown\((\d+),\s*(\d+)\)/) ?? m.match(/#(\d+) masih masa jeda sampai blok (\d+)/);
  if (cd) {
    const when = cooldownLabel(Number(cd[2]), ctx.block, ctx.secPerBlock)?.replace("istirahat, ", "") ?? "sebentar lagi";
    return { message: `${name(cd[1])} sedang istirahat, ${when}.`, quiet: false };
  }

  const nl = m.match(/NotListedForStud\((\d+)\)/) ?? m.match(/#(\d+) bukan milikmu dan belum dipasang/);
  if (nl) return { message: `Pemilik ${name(nl[1])} belum membukanya untuk kawin.`, quiet: false };

  const fee = m.match(/InsufficientFee\((\d+),\s*(\d+)\)/);
  if (fee) return { message: `Tarif kawinnya ${formatEther(BigInt(fee[1]))} ETH dan saldomu tidak cukup.`, quiet: false };

  const pay = m.match(/InsufficientPayment\((\d+),\s*(\d+)\)/);
  if (pay) return { message: `Pembayaran kurang. Harganya ${formatEther(BigInt(pay[1]))} ETH.`, quiet: false };
  const market: [RegExp, string][] = [
    [/BadDesign/, "Rancangan agent tidak sah. Periksa pilihan otak dan bakatnya."],
    [/NotApproved\(/, "Izinkan Pasar menjual agent ini dulu."],
    [/StaleListing\(/, "Agent ini sudah tidak dijual oleh pemiliknya."],
    [/OwnListing\(/, "Ini agent milikmu sendiri."],
    [/NotListed\(/, "Agent ini sedang tidak dijual."],
    [/ZeroPrice/, "Harga harus lebih dari 0."],
  ];
  for (const [re, msg] of market) if (re.test(m)) return { message: msg, quiet: false };

  if (/insufficient funds/i.test(m)) return { message: "Saldo ETH-mu tidak cukup untuk biaya jaringan.", quiet: false };
  if (/SameParent/.test(m)) return { message: "Pilih dua agent yang berbeda.", quiet: false };
  if (/NotOwner/.test(m)) return { message: "Hanya pemilik agent ini yang bisa melakukannya.", quiet: false };
  if (/Failed to fetch|NetworkError|ECONNREFUSED/i.test(m)) {
    return { message: "Server tidak terjangkau. Periksa koneksimu lalu coba lagi.", quiet: false };
  }

  const custom = m.match(/custom error '([^']+)'/)?.[1] ?? m.match(/execution reverted:?\s*([^|]*)/)?.[1];
  const first = (custom ?? m.split(" | ")[0] ?? "Terjadi galat.").trim();
  const msg = first.length > 180 ? first.slice(0, 179) + "…" : first;
  return { message: msg || "Terjadi galat.", quiet: false };
}
