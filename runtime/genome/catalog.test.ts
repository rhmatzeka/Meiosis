import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { composePrompt, contentHashOf, loadCatalog } from "./catalog";

const root = mkdtempSync(join(tmpdir(), "meiosis-catalog-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

const meta = { locus: 6, traitId: 2, name: "uji-keamanan", version: "2.0.0", mcpTools: ["bash"], hasPrompt: true };
const PROMPT = "Kamu curiga pada setiap masukan.";

function setup(name: string, opts: { prompt?: string | null; hash?: string } = {}) {
  const pub = join(root, name, "public"), priv = join(root, name, "private");
  mkdirSync(join(pub, meta.name), { recursive: true });
  mkdirSync(join(priv, meta.name), { recursive: true });
  const hash = opts.hash ?? contentHashOf(meta, PROMPT);
  writeFileSync(join(pub, meta.name, "module.json"), JSON.stringify({ ...meta, contentHash: hash }));
  if (opts.prompt !== null) writeFileSync(join(priv, meta.name, "prompt.md"), opts.prompt ?? PROMPT);
  return { pub, priv };
}

describe("loadCatalog", () => {
  test("prompt privat yang cocok dengan hash publik dimuat", () => {
    const { pub, priv } = setup("cocok");
    const m = loadCatalog(pub, priv).get((6 << 8) | 2)!;
    expect(m.prompt).toBe(PROMPT);
    expect(m.promptAvailable).toBe(true);
    expect(m.contentHash).toBe(contentHashOf(meta, PROMPT));
  });

  test("prompt yang disunting tanpa hash baru ditolak", () => {
    const { pub, priv } = setup("beda", { prompt: PROMPT + " Tambahan diam-diam." });
    expect(() => loadCatalog(pub, priv)).toThrow(/hash/);
  });

  test("tanpa prompt privat, hash publik tetap dipakai dan prompt kosong", () => {
    const { pub, priv } = setup("tanpa", { prompt: null });
    const m = loadCatalog(pub, priv).get((6 << 8) | 2)!;
    expect(m.promptAvailable).toBe(false);
    expect(m.prompt).toBe("");
    expect(m.contentHash).toBe(contentHashOf(meta, PROMPT));
  });

  test("hash tidak bergantung pada urutan kunci module.json", () => {
    const shuffled = { version: meta.version, name: meta.name, traitId: meta.traitId, locus: meta.locus, hasPrompt: true, mcpTools: meta.mcpTools };
    expect(contentHashOf(shuffled, PROMPT)).toBe(contentHashOf(meta, PROMPT));
  });
});

describe("composePrompt", () => {
  test("menggabungkan prompt modul berurutan", () => {
    const a = { name: "a", prompt: "Satu.", promptAvailable: true, hasPrompt: true };
    const b = { name: "b", prompt: "Dua.", promptAvailable: true, hasPrompt: true };
    expect(composePrompt([a, b])).toBe("Satu.\n\n---\n\nDua.");
  });

  test("modul tanpa prompt memang (tier) dilewati", () => {
    const tier = { name: "tier-fast", prompt: "", promptAvailable: false, hasPrompt: false };
    expect(composePrompt([tier, { name: "a", prompt: "Satu.", promptAvailable: true, hasPrompt: true }])).toBe("Satu.");
  });

  test("modul berprompt yang prompt privatnya hilang membuat perakitan gagal", () => {
    const missing = { name: "security-instinct-high", prompt: "", promptAvailable: false, hasPrompt: true };
    expect(() => composePrompt([missing])).toThrow(/security-instinct-high/);
  });
});
