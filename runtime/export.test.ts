import { test, expect } from "bun:test";
import { toClaudeAgent, parseExport, agentSlug } from "./export";
import { expand, systemPrompt } from "./genome/expand";
import { FOUNDERS } from "../packages/shared/src/founders";

const info = (i: number) => ({
  id: i + 1, name: FOUNDERS[i].name, generation: 0, parents: [0, 0], owner: "0x0000000000000000000000000000000000000001",
  genome: FOUNDERS[i].genome, chainId: 31337, chainName: "anvil",
  registry: "0x0000000000000000000000000000000000000002",
});

test("ekspor bisa dibaca balik dan prompt-nya identik dengan hasil expand()", () => {
  for (let i = 0; i < FOUNDERS.length; i++) {
    const md = toClaudeAgent(info(i));
    const x = parseExport(md);
    expect(x.genome).toBe(FOUNDERS[i].genome);
    expect(x.agentId).toBe(i + 1);
    expect(x.prompt).toBe(systemPrompt(expand(FOUNDERS[i].genome, 0n)).trim());
  }
});

test("frontmatter selalu membatasi tool — tanpa daftar, Claude Code mewariskan semua tool", () => {
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
