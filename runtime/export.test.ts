import { test, expect } from "bun:test";
import { toClaudeAgent, parseExport, agentSlug } from "./export";
import { expand, systemPrompt } from "./genome/expand";
import { promptsAvailable } from "./genome/catalog";
import { FOUNDERS } from "../packages/shared/src/founders";

const info = (i: number) => ({
  id: i + 1, name: FOUNDERS[i].name, generation: 0, parents: [0, 0], owner: "0x0000000000000000000000000000000000000001",
  genome: FOUNDERS[i].genome, chainId: 31337, chainName: "anvil",
  registry: "0x0000000000000000000000000000000000000002",
});

// Butuh teks prompt privat (private/skills); di klon publik tes ini dilewati.
const needsPrompts = test.skipIf(!promptsAvailable());

needsPrompts("ekspor bisa dibaca balik dan prompt-nya identik dengan hasil expand()", () => {
  for (let i = 0; i < FOUNDERS.length; i++) {
    const md = toClaudeAgent(info(i));
    const x = parseExport(md);
    expect(x.genome).toBe(FOUNDERS[i].genome);
    expect(x.agentId).toBe(i + 1);
    expect(x.prompt).toBe(systemPrompt(expand(FOUNDERS[i].genome, 0n)).trim());
  }
});

needsPrompts("frontmatter selalu membatasi tool — tanpa daftar, Claude Code mewariskan semua tool", () => {
  for (let i = 0; i < FOUNDERS.length; i++) {
    const md = toClaudeAgent(info(i));
    expect(md.startsWith("---\nname: meiosis-")).toBe(true);
    expect(md).toMatch(/^tools: \S/m);
    expect(md).toMatch(/^model: (haiku|sonnet|opus)$/m);
  }
});

test("slug aman untuk nama berkas", () => {
  expect(agentSlug(7, "Pixel Sense!")).toBe("meiosis-7-pixel-sense");
  expect(agentSlug(9, "???")).toBe("meiosis-9-agent");
});

// ---------------------------------------------------------------- bagian B

import { toRemoteAgent } from "./export";
import { catalog } from "./genome/catalog";
import { readWatermark, stripWatermark } from "./watermark";

test("`.md` remote tidak memuat satu kalimat pun dari prompt modul", () => {
  const md = toRemoteAgent(info(0), { mcpUrl: "https://meiosis.example/mcp" });
  expect(md).not.toContain("meiosis:prompt");
  for (const mod of catalog().values()) {
    for (const line of mod.prompt.split("\n").map((l) => l.trim()).filter((l) => l.length > 25)) {
      expect(md).not.toContain(line);
    }
  }
});

test("`.md` remote memanggil MCP Meiosis untuk agent yang benar", () => {
  const md = toRemoteAgent(info(1), { mcpUrl: "https://meiosis.example/mcp" });
  expect(md).toMatch(/^---\nname: meiosis-2-pixel-sense\n/);
  expect(md).toContain("tools: mcp__meiosis__meiosis_run, Read, Write, Edit, Glob, Grep");
  expect(md).toContain("model: haiku");
  expect(md).toContain("agent_id: 2");
  expect(md).toContain("claude mcp add --transport http meiosis https://meiosis.example/mcp");
});

needsPrompts("`.md` lengkap membawa lisensi dan watermark yang terbaca", () => {
  const license = { licenseId: "LIC-00ab12cd", licensee: "0x00000000000000000000000000000000000000aa", issuedAt: "2026-10-01T10:00:00.000Z", signature: "0xsig" };
  const md = toClaudeAgent(info(0), license);
  const p = parseExport(md);
  expect(p.license?.licenseId).toBe("LIC-00ab12cd");
  expect(p.license?.licensee).toBe(license.licensee);
  expect(readWatermark(md)).toBe("LIC-00ab12cd");
  expect(stripWatermark(p.prompt)).toBe(systemPrompt(expand(FOUNDERS[0].genome, 0n)).trim());
});

test("seed kelahiran ikut diekspor dan dipakai merakit prompt; berkas lama tanpa seed = 0", () => {
  const { meiosis } = require("../packages/shared/src/genome") as typeof import("../packages/shared/src/genome");
  const seed = 0xabcdefn;
  const genome = meiosis(FOUNDERS[0].genome, FOUNDERS[1].genome, seed);
  const info = { id: 9, name: "Anak", generation: 1, parents: [1, 2] as [number, number], owner: "0x0000000000000000000000000000000000000001", genome, birthSeed: seed, chainId: 31337, chainName: "anvil", registry: "0x0000000000000000000000000000000000000002" };
  const md = toClaudeAgent(info);
  const x = parseExport(md);
  expect(x.birthSeed).toBe(seed);
  expect(x.prompt).toBe(systemPrompt(expand(genome, seed)).trim());
  expect(parseExport(md.replace(/^birthSeed: .+\n/m, "")).birthSeed).toBe(0n);
});
