import { afterAll, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { KeyStore } from "./keys";
import { handleMcp, type McpDeps } from "./mcp-http";

const dir = mkdtempSync(join(tmpdir(), "meiosis-mcp-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
const ADDR = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";

function setup(balance: bigint) {
  const keys = new KeyStore(join(dir, `${Math.random()}.json`));
  const { key } = keys.create(ADDR, "t");
  const state = { balance, runs: 0, charges: 0 };
  const deps: McpDeps = {
    keys, allowMock: true,
    agents: async () => [{ id: 1, name: "A", modules: [], generation: 0 }],
    priceOf: async () => 10n,
    balanceOf: async () => state.balance,
    run: async () => { state.runs++; await Bun.sleep(20); return { output: "hasil", model: "mock" }; },
    charge: async (_u, _a, amount) => { if (state.balance < amount) throw new Error("InsufficientBalance"); state.balance -= amount; state.charges++; return "0xtx"; },
  };
  const call = (args: object) => handleMcp(new Request("http://x/mcp", {
    method: "POST", headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "meiosis_run", arguments: args } }),
  }), deps).then((r) => r.json() as Promise<{ result: { isError?: boolean; content: { text: string }[] } }>);
  return { state, call };
}

test("saldo cukup: tugas jalan dan dipotong sekali", async () => {
  const { state, call } = setup(10n);
  const r = await call({ agent_id: 1, task: "x" });
  expect(r.result.isError).toBeUndefined();
  expect(state).toMatchObject({ balance: 0n, runs: 1, charges: 1 });
});

test("saldo kurang: model tidak dijalankan", async () => {
  const { state, call } = setup(5n);
  const r = await call({ agent_id: 1, task: "x" });
  expect(r.result.isError).toBe(true);
  expect(r.result.content[0].text).toContain("Saldo pakai tidak cukup");
  expect(state.runs).toBe(0);
});

test("permintaan serentak tidak bisa memakai saldo yang sama dua kali", async () => {
  const { state, call } = setup(10n); // cukup untuk satu tugas
  const rs = await Promise.all([1, 2, 3, 4].map(() => call({ agent_id: 1, task: "x" })));
  expect(rs.filter((r) => !r.result.isError)).toHaveLength(1);
  expect(state.runs).toBe(1);
  expect(state.charges).toBe(1);
});
