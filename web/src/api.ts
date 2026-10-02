/** Bentuk data dari server/api.ts dan pembungkus fetch-nya. */

export interface Status {
  chain: "anvil" | "sepolia";
  chainId: number;
  chainName: string;
  local: boolean;
  public: boolean;
  explorer: string | null;
  rpc: string | null;
  chainLive: boolean;
  deployed: boolean;
  block: number | null;
  runPriceEth: string;
  runReady: boolean;
  /** Akun Anvil untuk uji otomatis; kosong di luar mode uji. */
  accounts: { name: string; address: string }[];
  testMode: boolean;
  privyAppId: string | null;
  faucet: { enabled: boolean; amountEth: string };
  keeper: boolean;
  docker: boolean;
  secPerBlock: number;
  /** null bila Pasar & Studio belum di-deploy di chain ini. */
  market: { feeBps: number; studioFeeEth: string | null } | null;
}

export interface Agent {
  id: number;
  name: string;
  named: boolean;
  owner: string;
  ownerName: string;
  generation: number;
  parents: [number, number];
  breedCount: number;
  genome: string;
  genomeRaw: string;
  manifestHashOnChain: string;
  manifestHashComputed: string;
  birthBlock: number;
  /** Seed kelahiran dari event Hatched (hex); 0x0 untuk agent Studio. */
  birthSeed: string;
  stud: { listed: boolean; feeWei: string; feeEth: string };
  readyAtBlock: number;
  cooldownBlocks: number;
  /** Listing jual yang sah, atau null. */
  sale: { seller: string; priceWei: string; priceEth: string } | null;
  /** Harga sewa satu tugas: ownerPriceWei 0 berarti memakai harga bawaan platform. */
  rent: { ownerPriceWei: string; priceWei: string; priceEth: string };
  /** Dirancang di Studio (bukan founder asli, bukan hasil kawin). */
  designed: boolean;
  /** Hash instruksi khusus milik agent ini (hanya rancangan Studio), atau null. */
  soulHash: string | null;
  /** Agent yang instruksi khususnya berlaku untuk agent ini: dirinya, atau leluhurnya. */
  soulFrom: number[];
  /** Disembunyikan admin: tidak tampil di Pasar, Kawinkan, Tugas, atau MCP. */
  hidden: boolean;
  /** Profil publik: milik sendiri, atau warisan kedua induk. Tanpa instruksi. */
  profile: { role: string; traits: { label: string; value: string }[]; inherited: boolean; from?: Record<string, "a" | "b"> };
  traits: { locus: number; name: string; value: string }[];
  modules: string[];
  modelTier: "fast" | "balanced" | "strong";
  params: { temperature: number; maxTokens: number; maxSteps: number };
}

export interface Pregnancy {
  id: number;
  parentA: number;
  parentB: number;
  revealBlock: number;
  hatched: boolean;
  to: string;
  childId: number | null;
  blocksLeft: number;
  ready: boolean;
  expired: boolean;
}

export class ApiError extends Error {
  constructor(message: string, public status: number, public body: Record<string, unknown>) { super(message); }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(path, init);
  const body = await r.json().catch(() => ({}));
  if (!r.ok || (body && typeof body === "object" && "error" in body && body.error)) {
    throw new ApiError(String(body?.error ?? body?.message ?? `HTTP ${r.status}`), r.status, body);
  }
  return body as T;
}

export const get = <T,>(path: string) => call<T>(path);

export const post = <T,>(path: string, body: unknown, headers: Record<string, string> = {}) =>
  call<T>(path, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });

export const same = (a?: string | null, b?: string | null) => !!a && !!b && a.toLowerCase() === b.toLowerCase();
export const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
