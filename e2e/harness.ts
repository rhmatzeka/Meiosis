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
  return chromium.launch({ executablePath, args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"] });
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

interface AgentRow { id: number; owner: string; readyAtBlock: number; stud: { listed: boolean }; manifestHashOnChain: string; manifestHashComputed: string; name: string }
export const agents = () => api<AgentRow[]>("/api/agents?fresh=1");
export const block = async () => (await api<{ block: number }>("/api/status")).block;

/** Dua founder yang sedang tidak istirahat, supaya uji tidak bergantung pada urutan. */
export async function freePair(): Promise<[number, number]> {
  for (let i = 0; i < 60; i++) {
    const [as, b] = await Promise.all([agents(), block()]);
    const free = as.filter((a) => a.readyAtBlock <= b && a.stud.listed).map((a) => a.id);
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
