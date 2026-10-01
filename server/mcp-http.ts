/**
 * MCP online: Claude Code di mesin siapa pun memakai agent Meiosis lewat
 * `POST /mcp` (JSON-RPC, "Streamable HTTP" dengan balasan JSON biasa).
 *
 * Setiap permintaan membawa API key. `meiosis_run` dibayar dari saldo pakai
 * (Credits.sol): saldo diperiksa SEBELUM model dijalankan, dan dipotong
 * SESUDAH berhasil — pengguna tidak membayar untuk tugas yang gagal.
 * Teks prompt agent tidak pernah keluar dari server; yang kembali hanya hasil kerjanya.
 */
import { randomBytes } from "node:crypto";
import { formatEther } from "viem";
import type { KeyRecord, KeyStore } from "./keys";

export interface McpDeps {
  keys: KeyStore;
  agents: () => Promise<{ id: number; name: string; modules: string[]; generation: number }[]>;
  priceOf: (agentId: number) => Promise<bigint>;
  balanceOf: (address: string) => Promise<bigint>;
  /** Menjalankan agent; mengembalikan jawaban lengkap (termasuk blok kode berkas). */
  run: (agentId: number, task: string, context: string, mock: boolean) => Promise<{ output: string; model: string }>;
  /** Memotong saldo lewat Credits.spend; mengembalikan hash tx. */
  charge: (address: string, agentId: number, amount: bigint, job: `0x${string}`) => Promise<string>;
  /** Mode tiruan hanya diizinkan di chain lokal. */
  allowMock: boolean;
}

const PROTOCOL = "2025-03-26";
const MAX_CONTEXT = 60_000;
const PER_HOUR = 20;
const usage = new Map<string, number[]>();

const TOOLS = [
  {
    name: "meiosis_list_agents",
    description: "Daftar agent Meiosis yang bisa disewa, dengan sifat warisannya dan harga per tugas. Gratis.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "meiosis_balance",
    description: "Saldo pakai pemilik API key ini. Gratis.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "meiosis_run",
    description: "Suruh satu agent Meiosis mengerjakan tugas. Dibayar dari saldo pakai sebesar harga sewa agent itu, hanya bila berhasil. Hasilnya jawaban dan berkas (blok kode berlabel path).",
    inputSchema: {
      type: "object",
      required: ["agent_id", "task"],
      properties: {
        agent_id: { type: "number", description: "Nomor agent, mis. 7" },
        task: { type: "string", description: "Tugas lengkap dalam kalimat jelas" },
        context: { type: "string", description: "Isi berkas relevan dari proyek, masing-masing diawali // path. Paling banyak 60 KB." },
        mock: { type: "boolean", description: "Hanya chain lokal: jawaban tiruan tanpa memakai model." },
      },
    },
  },
];

const ok = (id: unknown, result: unknown) => Response.json({ jsonrpc: "2.0", id, result });
const rpcError = (id: unknown, code: number, message: string, status = 200) =>
  Response.json({ jsonrpc: "2.0", id, error: { code, message } }, { status });
const text = (s: string, isError = false) => ({ content: [{ type: "text", text: s }], ...(isError ? { isError: true } : {}) });

function allowed(prefix: string) {
  const now = Date.now(), recent = (usage.get(prefix) ?? []).filter((t) => now - t < 3_600_000);
  if (recent.length >= PER_HOUR) return false;
  recent.push(now);
  usage.set(prefix, recent);
  return true;
}

export async function handleMcp(req: Request, deps: McpDeps): Promise<Response> {
  if (req.method === "GET") return new Response("Gunakan POST JSON-RPC.", { status: 405, headers: { allow: "POST" } });
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const key = deps.keys.find(token);
  const body = (await req.json().catch(() => null)) as { id?: unknown; method?: string; params?: Record<string, unknown> } | null;
  if (!body?.method) return rpcError(null, -32700, "permintaan JSON-RPC tidak sah", 400);
  if (!key) return rpcError(body.id ?? null, -32001, "API key tidak dikenal. Buat di halaman Dompet Meiosis, lalu pasang ulang MCP-nya.", 401);

  if (body.method.startsWith("notifications/")) return new Response(null, { status: 202 });
  if (body.method === "initialize") {
    return ok(body.id, { protocolVersion: PROTOCOL, capabilities: { tools: {} }, serverInfo: { name: "meiosis", version: "1.0.0" } });
  }
  if (body.method === "ping") return ok(body.id, {});
  if (body.method === "tools/list") return ok(body.id, { tools: TOOLS });
  if (body.method !== "tools/call") return rpcError(body.id, -32601, `metode tidak dikenal: ${body.method}`);

  const name = String(body.params?.name ?? "");
  const args = (body.params?.arguments ?? {}) as Record<string, unknown>;
  try {
    return ok(body.id, await callTool(name, args, key, deps));
  } catch (e) {
    return ok(body.id, text((e as Error).message, true));
  }
}

async function callTool(name: string, args: Record<string, unknown>, key: KeyRecord, deps: McpDeps) {
  if (name === "meiosis_list_agents") {
    const list = await deps.agents();
    const rows = await Promise.all(list.map(async (a) => `#${a.id} ${a.name} — ${formatEther(await deps.priceOf(a.id))} ETH/tugas — ${a.modules.join(", ") || "tanpa modul"}`));
    return text(rows.join("\n") || "Belum ada agent.");
  }
  if (name === "meiosis_balance") {
    return text(`Saldo pakai ${key.address}: ${formatEther(await deps.balanceOf(key.address))} ETH`);
  }
  if (name !== "meiosis_run") return text(`tool tidak dikenal: ${name}`, true);

  const agentId = Number(args.agent_id);
  const task = String(args.task ?? "").trim();
  const context = String(args.context ?? "");
  const mock = args.mock === true;
  if (!Number.isInteger(agentId) || agentId < 1) return text("agent_id harus nomor agent, mis. 7", true);
  if (!task) return text("task masih kosong", true);
  if (context.length > MAX_CONTEXT) return text(`context terlalu besar (${context.length} karakter, batas ${MAX_CONTEXT}). Kirim berkas yang relevan saja.`, true);
  if (mock && !deps.allowMock) return text("mode tiruan hanya tersedia di chain lokal", true);
  if (!allowed(key.prefix)) return text(`batas ${PER_HOUR} tugas per jam untuk API key ini tercapai`, true);

  const price = await deps.priceOf(agentId);
  const balance = await deps.balanceOf(key.address);
  if (balance < price) {
    return text(`Saldo pakai tidak cukup: perlu ${formatEther(price)} ETH, ada ${formatEther(balance)} ETH. Isi saldo di halaman Dompet Meiosis.`, true);
  }

  const result = await deps.run(agentId, task, context, mock);
  const job = ("0x" + randomBytes(32).toString("hex")) as `0x${string}`;
  const tx = price > 0n ? await deps.charge(key.address, agentId, price, job) : null;
  return text([
    result.output,
    "",
    `— agent #${agentId} · ${result.model} · ${price > 0n ? `dibayar ${formatEther(price)} ETH (tx ${tx})` : "gratis"}`,
  ].join("\n"));
}
