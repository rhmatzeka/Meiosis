/**
 * MCP server Meiosis.
 *
 * Membuat agent yang hidup di chain bisa dipanggil dari luar — termasuk dari
 * Claude Code, sebagai subagent. Inilah bagian "agent to agent" yang selama ini
 * hilang: tanpanya, agent hasil perkawinan hanya bisa dipakai lewat satu kotak
 * prompt di satu halaman web.
 *
 * Servernya sengaja tipis dan berbicara ke HTTP API yang sudah ada di :5173,
 * bukan mengulang logikanya. Satu sumber kebenaran untuk chain, genome, loop
 * tool, dan sandbox.
 *
 * Protokolnya JSON-RPC 2.0 over stdio, baris per pesan.
 */
const API = process.env.MEIOSIS_API ?? "http://127.0.0.1:5173";
const VERSION = "2024-11-05";

type Json = Record<string, unknown>;

const send = (msg: Json) => process.stdout.write(JSON.stringify(msg) + "\n");
const reply = (id: unknown, result: Json) => send({ jsonrpc: "2.0", id, result });
const fail = (id: unknown, message: string) =>
  send({ jsonrpc: "2.0", id, error: { code: -32000, message } });
const text = (s: string): Json => ({ content: [{ type: "text", text: s }] });

async function api(path: string, init?: RequestInit) {
  const r = await fetch(`${API}${path}`, init);
  if (!r.ok) throw new Error(`${path} -> HTTP ${r.status}`);
  return r.json();
}

const post = (path: string, body: unknown) =>
  api(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

/** Menunggu job agent selesai. Loop tool bisa makan beberapa menit. */
async function waitJob(jobId: string, timeoutMs = 900_000) {
  const until = Date.now() + timeoutMs;
  for (;;) {
    const j = (await api(`/api/job/${jobId}`)) as { status: string; results?: unknown[] };
    if (j.status !== "running") return j;
    if (Date.now() > until) throw new Error("job melewati batas waktu");
    await new Promise((r) => setTimeout(r, 3000));
  }
}

const TOOLS = [
  {
    name: "meiosis_list_agents",
    description:
      "Daftar semua agent Meiosis yang ada di chain, berikut trait warisan, modul skill, " +
      "dan silsilahnya. Pakai ini dulu untuk memilih agent mana yang cocok untuk sebuah tugas.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "meiosis_ask",
    description:
      "Tanya satu agent Meiosis dan dapatkan jawaban teks. Sekali jalan, tanpa tool. " +
      "Cocok untuk meninjau kode, memberi pendapat, atau menjawab pertanyaan. " +
      "Untuk menulis kode yang harus benar-benar jalan, pakai meiosis_run.",
    inputSchema: {
      type: "object",
      properties: {
        agent_id: { type: "number", description: "id agent, lihat meiosis_list_agents" },
        task: { type: "string", description: "pertanyaan atau tugasnya" },
      },
      required: ["agent_id", "task"],
    },
  },
  {
    name: "meiosis_run",
    description:
      "Suruh agent Meiosis mengerjakan tugas coding sungguhan. Agent memakai tool untuk " +
      "membaca dan menulis berkas, menjalankan typecheck dan build, lalu memperbaiki sendiri " +
      "kalau gagal. Hasilnya dibangun di sandbox dan diberi skor. Butuh beberapa menit.",
    inputSchema: {
      type: "object",
      properties: {
        agent_id: { type: "number" },
        task: { type: "string", description: "tugas coding; proyeknya Vite + React + TypeScript" },
      },
      required: ["agent_id", "task"],
    },
  },
  {
    name: "meiosis_breed",
    description:
      "Kawinkan dua agent dan tetaskan anaknya. Anak mewarisi trait dari kedua induk lewat " +
      "meiosis on-chain. Pakai ini kalau butuh kombinasi kemampuan yang belum dimiliki " +
      "satu agent pun — misalnya keamanan dari satu induk dan estetika dari induk lain.",
    inputSchema: {
      type: "object",
      properties: {
        parent_a: { type: "number" },
        parent_b: { type: "number" },
      },
      required: ["parent_a", "parent_b"],
    },
  },
];

async function call(name: string, args: Json): Promise<Json> {
  switch (name) {
    case "meiosis_list_agents": {
      const agents = (await api("/api/agents")) as Record<string, unknown>[];
      const lines = agents.map((a) => {
        const tr = Object.fromEntries(
          (a.traits as { name: string; value: string }[]).map((t) => [t.name, t.value]),
        );
        const par = (a.parents as number[])[0] ? `anak ${(a.parents as number[]).join("×")}` : "founder";
        return [
          `#${a.id} ${a.name} (gen ${a.generation}, ${par})`,
          `   keamanan=${tr.SECURITY_INSTINCT} estetika=${tr.AESTHETIC} stack=${tr.STACK_AFFINITY} test=${tr.TEST_RIGOR}`,
          `   modul: ${(a.modules as string[]).join(", ") || "-"}`,
        ].join("\n");
      });
      return text(`${agents.length} agent di chain:\n\n${lines.join("\n\n")}`);
    }

    case "meiosis_ask": {
      const { jobId } = (await post("/api/run", {
        ids: [args.agent_id], task: args.task, mode: "single",
      })) as { jobId: string };
      const j = (await waitJob(jobId, 300_000)) as { results?: Record<string, unknown>[] };
      const r = j.results?.[0];
      if (!r?.ok) return text(`gagal: ${r?.error ?? "tidak diketahui"}`);
      return text(
        `agent #${r.id} (${(r.modules as string[]).join(", ")})\n` +
        `model ${r.model}\n\n${r.output}`,
      );
    }

    case "meiosis_run": {
      const { jobId } = (await post("/api/run", {
        ids: [args.agent_id], task: args.task, mode: "agent",
      })) as { jobId: string };
      const j = (await waitJob(jobId)) as { results?: Record<string, unknown>[] };
      const r = j.results?.[0];
      if (!r?.ok) return text(`gagal: ${r?.error ?? "tidak diketahui"}`);

      const loop = r.loop as { steps: { step: number; tool?: string; kind: string }[]; finished: boolean; reason: string; checks: number };
      const b = r.built as Record<string, unknown>;
      const jejak = loop.steps.map((s) => `${s.step}. ${s.tool ?? s.kind}`).join("\n");
      const lines = (b.lines as { key: string; points: number; max: number; detail: string }[])
        .map((l) => `  ${l.key}: ${l.points}/${l.max} — ${l.detail}`).join("\n");

      return text([
        `agent #${r.id} (${(r.modules as string[]).join(", ")})`,
        `tool tersedia: ${(r.tools as string[]).join(", ")}`,
        ``,
        `LANGKAH:`, jejak,
        ``,
        `HASIL BUILD:`,
        `  typecheck ${b.typecheckOk ? "lolos" : "GAGAL"}, build ${b.buildOk ? "lolos" : "GAGAL"}, render ${b.rendersOk ? "lolos" : "GAGAL"}`,
        `  skor ${b.score}/${b.scoreMax}`,
        lines,
        ``,
        `berkas ada di ${b.dir}/ws/`,
        b.shot ? `screenshot: ${API}${b.shot}` : "",
      ].filter(Boolean).join("\n"));
    }

    case "meiosis_breed": {
      await post("/api/breed", { a: args.parent_a, b: args.parent_b, from: 1 });
      const pregs = (await api("/api/pregnancies")) as { id: number; hatched: boolean; ready: boolean }[];
      const p = pregs.filter((x) => !x.hatched).at(-1);
      if (!p) return text("kehamilan tidak ditemukan setelah breed");

      // Kehamilan butuh 5 blok; di Anvil blok maju tiap 2 detik.
      for (let i = 0; i < 30 && !(await api(`/api/pregnancies`) as { id: number; ready: boolean }[])
        .find((x) => x.id === p.id)?.ready; i++) {
        await new Promise((r) => setTimeout(r, 2000));
      }
      await post("/api/hatch", { pid: p.id });
      const agents = (await api("/api/agents")) as Record<string, unknown>[];
      const child = agents.at(-1)!;
      const tr = Object.fromEntries(
        (child.traits as { name: string; value: string }[]).map((t) => [t.name, t.value]),
      );
      return text([
        `Anak lahir: #${child.id} (generasi ${child.generation}, induk ${(child.parents as number[]).join("×")})`,
        `keamanan=${tr.SECURITY_INSTINCT} estetika=${tr.AESTHETIC} stack=${tr.STACK_AFFINITY} test=${tr.TEST_RIGOR}`,
        `modul: ${(child.modules as string[]).join(", ")}`,
        `genome: ${child.genome}`,
        ``,
        `Pakai meiosis_run dengan agent_id ${child.id} untuk menyuruhnya bekerja.`,
      ].join("\n"));
    }

    default:
      throw new Error(`tool tidak dikenal: ${name}`);
  }
}

// --- loop JSON-RPC over stdio ---
for await (const line of console) {
  let msg: Json;
  try { msg = JSON.parse(line); } catch { continue; }
  const { id, method, params } = msg as { id?: unknown; method?: string; params?: Json };

  try {
    if (method === "initialize") {
      reply(id, {
        protocolVersion: VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: "meiosis", version: "0.1.0" },
      });
    } else if (method === "tools/list") {
      reply(id, { tools: TOOLS });
    } else if (method === "tools/call") {
      const { name, arguments: args } = (params ?? {}) as { name: string; arguments?: Json };
      reply(id, await call(name, args ?? {}));
    } else if (method === "ping") {
      reply(id, {});
    } else if (method?.startsWith("notifications/")) {
      // notifikasi tidak dijawab
    } else if (id !== undefined) {
      fail(id, `metode tidak didukung: ${method}`);
    }
  } catch (e) {
    if (id !== undefined) fail(id, (e as Error).message.slice(0, 300));
  }
}
