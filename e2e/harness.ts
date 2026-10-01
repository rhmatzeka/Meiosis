/** Perlengkapan bersama uji e2e: browser, pencatat hasil, dan akses chain lokal. */
import { existsSync } from "node:fs";
import { chromium, type Page } from "playwright-core";

export const BASE = process.env.UI_BASE ?? "http://127.0.0.1:5173";
export const RPC = process.env.RPC ?? "http://127.0.0.1:8545";

/** Chromium di container sandbox, atau Chrome/Chromium yang terpasang di mesin ini. */
export const browserPath = () =>
  process.env.CHROMIUM_PATH
  ?? ["/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome", "/opt/google/chrome/chrome"].find(existsSync);

export async function launch() {
  const executablePath = browserPath();
  if (!executablePath) throw new Error("Tidak ada Chrome/Chromium. Pasang salah satunya atau isi CHROMIUM_PATH.");
  const b = await chromium.launch({ executablePath, args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"] });
  // Animasi dimatikan secara bawaan supaya uji tidak bergantung pada waktu;
  // uji yang memang memeriksa animasi meminta "no-preference" sendiri.
  const newPage = b.newPage.bind(b);
  b.newPage = (o = {}) => newPage({ reducedMotion: "reduce", ...o });
  return b;
}

export const fails: string[] = [];
export const ok = (label: string, cond: boolean, detail = "") => {
  console.log(`  ${cond ? "\x1b[32m✓\x1b[0m" : "\x1b[31m✗\x1b[0m"} ${label}${detail ? `  \x1b[2m${detail}\x1b[0m` : ""}`);
  if (!cond) fails.push(label);
};
export const section = (s: string) => console.log(`\n\x1b[1m${s}\x1b[0m`);

export function finish(): never {
  console.log(fails.length === 0
    ? `\n\x1b[32m\x1b[1mSEMUA LULUS\x1b[0m\n`
    : `\n\x1b[31m\x1b[1m${fails.length} GAGAL:\x1b[0m ${fails.join(", ")}\n`);
  process.exit(fails.length === 0 ? 0 : 1);
}

export const rpc = async (method: string, params: unknown[] = []) =>
  (await (await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) })).json()).result;

export const api = async <T,>(path: string, body?: unknown): Promise<T> =>
  (await fetch(BASE + path, body === undefined ? undefined : {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  })).json() as Promise<T>;

interface AgentRow { id: number; generation: number; owner: string; readyAtBlock: number; stud: { listed: boolean }; manifestHashOnChain: string; manifestHashComputed: string; name: string; soulHash: string | null; soulFrom: number[]; traits: { locus: number; value: string }[] }
export const agents = () => api<AgentRow[]>("/api/agents?fresh=1");
export const block = async () => (await api<{ block: number }>("/api/status")).block;

/** Akun Anvil #1 ("Alice"): pemilik agent bibit uji. Kuncinya dipegang server mode uji. */
export const SEED_OWNER = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";

const SEED_PROFILES = [
  { name: "Kurir Laravel", role: "Pembuat REST API Laravel", traits: [["Keahlian", "backend & API"], ["Stack & alat", "Laravel, MySQL"], ["Gaya bicara", "santai"]] },
  { name: "Tukang Go", role: "Pembuat layanan Go yang cepat", traits: [["Keahlian", "backend"], ["Stack & alat", "Go, PostgreSQL"], ["Bahasa", "Jawa halus"]] },
  { name: "Pelukis Flutter", role: "Perancang aplikasi Flutter", traits: [["Keahlian", "desain antarmuka"], ["Stack & alat", "Flutter, Figma"], ["Kepribadian", "berani eksperimen"]] },
  { name: "Penjaga Kontrak", role: "Auditor smart contract", traits: [["Keahlian", "audit keamanan"], ["Stack & alat", "Solidity, Foundry"], ["Cara kerja", "selalu tulis tes"]] },
];

/**
 * Pasar dimulai kosong (tanpa founder), jadi uji membuat agent Studio sendiri:
 * profil berbeda, milik SEED_OWNER, dan dibuka untuk kawin tanpa tarif.
 */
export async function seedAgents(n = 2): Promise<number[]> {
  const before = new Set((await agents()).map((a) => a.id));
  for (let i = 0; i < n; i++) {
    const p = SEED_PROFILES[(before.size + i) % SEED_PROFILES.length];
    const soul = await api<{ hash: string; loci: number[]; error?: string }>("/api/studio/soul", {
      role: p.role, traits: p.traits.map(([label, value]) => ({ label, value })), instructions: `Kamu ${p.role.toLowerCase()}.`,
    });
    if (soul.error) throw new Error(`soul: ${soul.error}`);
    const r = await api<{ error?: string }>("/api/local-act", { action: "studioCreate", args: { traits: soul.loci, name: p.name, soulHash: soul.hash }, as: SEED_OWNER });
    if (r.error) throw new Error(`studioCreate: ${r.error}`);
  }
  const fresh = (await agents()).filter((a) => !before.has(a.id)).map((a) => a.id);
  for (const id of fresh) {
    const r = await api<{ error?: string }>("/api/local-act", { action: "listForStud", args: { id, feeEth: "0" }, as: SEED_OWNER });
    if (r.error) throw new Error(`listForStud: ${r.error}`);
  }
  return fresh;
}

/** Dua agent bibit (generasi nol, milik SEED_OWNER) yang sedang tidak istirahat; dibuat bila belum ada. */
export async function freePair(): Promise<[number, number]> {
  for (let i = 0; i < 60; i++) {
    const [as, b] = await Promise.all([agents(), block()]);
    const seeds = as.filter((a) => a.generation === 0 && a.owner.toLowerCase() === SEED_OWNER.toLowerCase() && a.stud.listed);
    if (seeds.length < 2) { await seedAgents(2 - seeds.length); continue; }
    const free = seeds.filter((a) => a.readyAtBlock <= b).map((a) => a.id);
    if (free.length >= 2) return [free[0], free[1]];
    await rpc("anvil_mine", ["0x4"]);
  }
  throw new Error("tidak ada dua agent yang siap kawin");
}

/** Galat konsol dan galat halaman; peringatan HMR dev Bun bukan galat. */
export function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on("console", (m) => { if (m.type() === "error" && !/favicon|auth\.privy\.io/.test(m.text())) errors.push(m.text().slice(0, 200)); });
  page.on("pageerror", (e) => errors.push(`pageerror: ${String(e).slice(0, 200)}`));
  return errors;
}

/**
 * Wallet EIP-1193 tiruan: tanda tangan diteruskan ke Node (kunci Anvil yang
 * TIDAK dipegang server), permintaan lain ke Anvil. Jalurnya sama dengan
 * pengguna MetaMask sungguhan.
 */
export async function installFakeWallet(page: Page, key: `0x${string}`) {
  const { createWalletClient, http } = await import("viem");
  const { privateKeyToAccount } = await import("viem/accounts");
  const { foundry } = await import("viem/chains");
  const account = privateKeyToAccount(key);
  const signer = createWalletClient({ account, chain: foundry, transport: http(RPC) });
  await page.exposeFunction("__walletSend", async (tx: { to: string; data: string; value: string }) =>
    signer.sendTransaction({ to: tx.to as `0x${string}`, data: tx.data as `0x${string}`, value: BigInt(tx.value) }));
  await page.exposeFunction("__rpc", rpc);
  await page.exposeFunction("__walletSign", (message: string) => account.signMessage({ message }));
  await page.addInitScript((addr: string) => {
    (window as unknown as { ethereum: unknown }).ethereum = {
      isMetaMask: true,
      on() {},
      async request({ method, params }: { method: string; params?: unknown[] }) {
        const w = window as unknown as { __walletSend: (t: unknown) => Promise<string>; __walletSign: (m: string) => Promise<string>; __rpc: (m: string, p?: unknown[]) => Promise<unknown> };
        if (method === "personal_sign") return w.__walletSign((params as string[])[0]);
        if (method === "eth_requestAccounts" || method === "eth_accounts") return [addr];
        if (method === "eth_chainId") return "0x7a69";
        if (method === "wallet_switchEthereumChain") return null;
        if (method === "eth_sendTransaction") return w.__walletSend((params as unknown[])[0]);
        return w.__rpc(method, params);
      },
    };
  }, account.address);
  return account;
}

/** Masuk dengan wallet tiruan lewat menu akun. */
export async function signIn(page: Page) {
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.click(".account > button");
  await page.click("text=Masuk dengan akunmu sendiri");
  await page.waitForFunction(() => /0x[0-9a-f]{4}/i.test(document.querySelector(".account > button")?.textContent ?? ""));
}
