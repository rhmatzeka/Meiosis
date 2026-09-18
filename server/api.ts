/**
 * Server UI: satu proses yang menyajikan API dan halaman webnya sekaligus.
 *
 * Tanpa build step. Astro menyusul ketika kita butuh ekspor statis untuk
 * cadangan demo (PLAN.md §15.2); untuk sekarang yang dibutuhkan adalah sesuatu
 * yang langsung bisa dijalankan dan dilihat.
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { Abi, Address } from "viem";
import {
  pub, wallets, ownerName, artifact, loadDeployment, saveDeployment,
  deploymentValid, isLive, RPC, type Deployment,
} from "./chain";
import { express, relatedness, LOCUS_NAMES, traitName, LOCUS_COUNT } from "../packages/shared/src/genome";
import { FOUNDERS } from "../packages/shared/src/founders";
import { expand, manifestHash } from "../runtime/genome/expand";
import { materialize } from "../runtime/materialize";
import { getProvider } from "../runtime/providers";
import { parseAgentFiles } from "../arena/parse-output";
import { BUILD_CONTRACT } from "../arena/build-contract";
import { Workspace } from "../runtime/tools/workspace";
import { runAgentLoop } from "../runtime/agent-loop";
import { toolsFor } from "../runtime/tools";
import { runInSandbox } from "../sandbox/run";
import { scoreDeterministic, type Checks } from "../arena/scorers/deterministic";
import { mkdirSync, writeFileSync } from "node:fs";

const PORT = Number(process.env.UI_PORT ?? 5173);
let dep: Deployment | null = loadDeployment();

/** Rubrik arena dipakai ulang supaya skor di tab Jalankan sebanding dengan skor ronde. */
const checks = (): Checks =>
  JSON.parse(readFileSync("arena/jobs/staking-landing/checks.json", "utf8"));

/**
 * Job berjalan di latar dan melaporkan langkahnya saat itu juga.
 *
 * Versi pertama menunggu seluruh loop selesai baru membalas, dan di free tier
 * itu berarti sepuluh menit layar diam tanpa tanda kehidupan — uji end-to-end
 * pun habis waktunya menunggu. Sekarang POST membalas seketika dengan jobId,
 * dan UI menarik kemajuannya sambil jalan.
 */
interface Job {
  id: string;
  status: "running" | "done" | "error";
  startedAt: number;
  task: string;
  agents: Record<number, {
    label?: string; modules?: string[]; tools?: string[]; model?: string;
    steps: unknown[]; done: boolean; result?: unknown; error?: string;
  }>;
  error?: string;
}
const jobs = new Map<string, Job>();
const JOB_DIR = ".runs/jobs";

/**
 * Job juga ditulis ke disk. Menyimpannya hanya di memori berarti satu restart
 * server menghapus hasil yang sudah dibayar dengan kuota dan waktu — dan itu
 * sempat terjadi pada perbandingan induk vs anak.
 */
const saveJob = (j: Job) => {
  try {
    mkdirSync(JOB_DIR, { recursive: true });
    writeFileSync(`${JOB_DIR}/${j.id}.json`, JSON.stringify(j));
  } catch { /* penyimpanan bukan jalur kritis */ }
};

const loadJob = (id: string): Job | null => {
  try {
    const f = `${JOB_DIR}/${id}.json`;
    return existsSync(f) ? (JSON.parse(readFileSync(f, "utf8")) as Job) : null;
  } catch { return null; }
};

// Job lama dibuang supaya memori tidak menumpuk selama server hidup lama.
const pruneJobs = () => {
  const cutoff = Date.now() - 60 * 60 * 1000;
  for (const [k, j] of jobs) if (j.startedAt < cutoff) jobs.delete(k);
};

/** Ringkasan hasil sandbox yang dipakai baik mode agent maupun mode single. */
function buildInfo(dir: string, sb: { typecheckOk: boolean; buildOk: boolean; rendersOk: boolean;
  timedOut: boolean; durationMs: number; buildLog: string; render: unknown },
  score: { total: number; max: number; gated: boolean; lines: unknown[] }) {
  const r = sb.render as { axeViolations?: unknown[]; consoleErrors?: string[] } | null;
  return {
    dir,
    typecheckOk: sb.typecheckOk, buildOk: sb.buildOk, rendersOk: sb.rendersOk,
    timedOut: sb.timedOut, durationMs: sb.durationMs,
    score: score.total, scoreMax: score.max, gated: score.gated, lines: score.lines,
    axe: r?.axeViolations ?? [], consoleErrors: r?.consoleErrors ?? [],
    shot: existsSync(`${dir}/out/desktop.png`) ? `/artifact/${dir}/out/desktop.png` : null,
    shotMobile: existsSync(`${dir}/out/mobile.png`) ? `/artifact/${dir}/out/mobile.png` : null,
    buildLog: sb.buildLog.split("\n").slice(-14).join("\n"),
    files: [] as string[],
  };
}

const abis = {
  registry: artifact("AgentRegistry").abi,
  genesis: artifact("Genesis").abi,
  hatchery: artifact("Hatchery").abi,
};

const read = (addr: Address, abi: Abi, fn: string, args: unknown[] = []) =>
  pub.readContract({ address: addr, abi, functionName: fn, args } as never);

async function send(addr: Address, abi: Abi, w: (typeof wallets)[number], fn: string, args: unknown[] = [], value = 0n) {
  const hash = await w.writeContract({ address: addr, abi, functionName: fn, args, value } as never);
  return pub.waitForTransactionReceipt({ hash });
}

// ---------------------------------------------------------------------------

async function deployAll(): Promise<Deployment> {
  const d = wallets[0];
  const put = async (name: string, args: unknown[] = []) => {
    const a = artifact(name);
    const hash = await d.deployContract({ abi: a.abi, bytecode: a.bytecode.object, args } as never);
    return (await pub.waitForTransactionReceipt({ hash })).contractAddress!;
  };

  const registry = await put("AgentRegistry");
  const genesis = await put("Genesis", [registry]);
  const hatchery = await put("Hatchery", [registry]);
  const skills = await put("SkillRegistry");

  await send(registry, abis.registry, d, "setMinter", [genesis, true]);
  await send(registry, abis.registry, d, "setMinter", [hatchery, true]);

  // Empat founder ke tiga pemilik berbeda, supaya demo royalti nanti bermakna.
  const owners = [1, 2, 3, 3];
  for (let i = 0; i < 4; i++) {
    await send(genesis, abis.genesis, d, "mintFounder",
      [wallets[owners[i]].account.address, FOUNDERS[i].genome, FOUNDERS[i].name]);
  }
  await send(genesis, abis.genesis, d, "seal");

  // Tiap pemilik memasang founder-nya sebagai pejantan dengan biaya 0.
  // Di chain lokal ini sekadar menghapus friksi: tanpa listing, mengawinkan
  // agent milik orang lain akan revert dengan NotListedForStud, dan itu
  // jebakan pertama yang ditemui siapa pun saat mencoba UI.
  // Di Sepolia nanti, pemasangan ini adalah keputusan pemilik dan harganya
  // ditentukan sendiri — lihat PLAN.md §6.5.
  for (let i = 0; i < 4; i++) {
    await send(hatchery, abis.hatchery, wallets[owners[i]], "listForStud", [i + 1, 0n]);
  }

  /**
   * Catat manifestHash tiap founder saat itu juga.
   *
   * Hash ini turunan murni dari genome yang sudah ada di chain, jadi tidak ada
   * alasan menunggu pengguna mengkliknya satu per satu. Membiarkannya kosong
   * berarti klaim paling penting proyek ini — bahwa agent yang dijalankan
   * terbukti agent yang tercatat — tidak terlihat sama sekali di menit pertama.
   */
  for (let id = 1; id <= 4; id++) {
    const genome = (await read(registry, abis.registry, "genomeOf", [id])) as bigint;
    const hash = manifestHash(expand(genome, 0n));
    await send(registry, abis.registry, wallets[owners[id - 1]], "setManifestHash", [id, hash]);
  }

  const out: Deployment = { registry, genesis, hatchery, skills, block: Number(await pub.getBlockNumber()) };
  saveDeployment(out);
  return out;
}

async function listAgents() {
  if (!dep) return [];
  const total = Number(await read(dep.registry, abis.registry, "totalMinted"));
  const out = [];

  for (let id = 1; id <= total; id++) {
    const a = (await read(dep.registry, abis.registry, "agentOf", [id])) as {
      genome: bigint; parentA: bigint; parentB: bigint; generation: number;
      breedCount: number; manifestHash: bigint; birthBlock: number;
    };
    const owner = (await read(dep.registry, abis.registry, "ownerOf", [id])) as string;
    const founderName = a.generation === 0
      ? ((await read(dep.genesis, abis.genesis, "founderName", [id])) as string) : "";

    // Seed kelahiran tidak tersimpan on-chain; untuk founder ia 0, dan untuk
    // anak kita pakai 0 di tampilan. Ekspresi lokus yang seri bisa berbeda dari
    // saat lahir — ditandai di UI agar tidak menyesatkan.
    const seed = 0n;
    const e = express(a.genome, seed);
    const manifest = expand(a.genome, seed);

    out.push({
      id,
      name: founderName || `Anak #${id}`,
      owner, ownerName: ownerName(owner),
      generation: a.generation,
      parents: [Number(a.parentA), Number(a.parentB)],
      breedCount: a.breedCount,
      genome: "0x" + a.genome.toString(16).padStart(64, "0"),
      genomeRaw: a.genome.toString(),
      manifestHashOnChain: "0x" + a.manifestHash.toString(16).padStart(16, "0"),
      manifestHashComputed: "0x" + manifestHash(manifest).toString(16).padStart(16, "0"),
      birthBlock: a.birthBlock,
      traits: e.map((t, i) => ({ locus: i, name: LOCUS_NAMES[i], value: traitName(i, t) })),
      modules: manifest.traits.filter((t) => t.module).map((t) => t.module),
      modelTier: manifest.modelTier,
      params: manifest.params,
    });
  }
  return out;
}

async function listPregnancies() {
  if (!dep) return [];
  const next = Number(await read(dep.hatchery, abis.hatchery, "nextPregnancyId"));
  const now = Number(await pub.getBlockNumber());
  const out = [];
  for (let pid = 1; pid < next; pid++) {
    const p = (await read(dep.hatchery, abis.hatchery, "pregnancies", [pid])) as unknown[];
    const revealBlock = Number(p[2]);
    out.push({
      id: pid, parentA: Number(p[0]), parentB: Number(p[1]),
      revealBlock, hatched: p[3] as boolean, to: p[4] as string,
      blocksLeft: Math.max(0, revealBlock - now + 1),
      ready: !p[3] && now > revealBlock,
      expired: !p[3] && now > revealBlock + 256,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json", ".svg": "image/svg+xml",
};

Bun.serve({
  port: PORT,
  idleTimeout: 120,
  async fetch(req) {
    const url = new URL(req.url);
    const p = url.pathname;

    try {
      if (p === "/api/status") {
        const live = await isLive();
        if (live && !(await deploymentValid(dep))) dep = null;
        return json({
          rpc: RPC, chainLive: live, deployed: !!dep, addresses: dep,
          block: live ? Number(await pub.getBlockNumber()) : null,
          accounts: wallets.map((w, i) => ({ name: ["deployer", "Alice", "Bob", "Carol"][i], address: w.account.address })),
        });
      }

      if (p === "/api/deploy" && req.method === "POST") {
        if (!(await isLive())) return json({ error: "Anvil tidak berjalan. Jalankan `bun run anvil` lebih dulu." }, 503);
        dep = await deployAll();
        return json({ ok: true, addresses: dep });
      }

      if (p === "/api/agents") return json(await listAgents());
      if (p === "/api/pregnancies") return json(await listPregnancies());

      if (p === "/api/relatedness") {
        const a = BigInt(url.searchParams.get("a") ?? "0");
        const b = BigInt(url.searchParams.get("b") ?? "0");
        return json({ value: relatedness(a, b) });
      }

      if (p === "/api/breed" && req.method === "POST") {
        if (!dep) return json({ error: "belum di-deploy" }, 400);
        const { a, b, from } = (await req.json()) as { a: number; b: number; from: number };

        // Induk hasil kelahiran belum pernah dipasang sebagai pejantan. Pasang
        // otomatis atas nama pemiliknya supaya generasi kedua bisa dicoba.
        for (const id of [a, b]) {
          const listed = (await read(dep.hatchery, abis.hatchery, "studListed", [id])) as boolean;
          if (listed) continue;
          const owner = ((await read(dep.registry, abis.registry, "ownerOf", [id])) as string).toLowerCase();
          const w = wallets.find((x) => x.account.address.toLowerCase() === owner);
          if (w) await send(dep.hatchery, abis.hatchery, w, "listForStud", [id, 0n]);
        }

        const r = await send(dep.hatchery, abis.hatchery, wallets[from], "breed", [a, b]);
        return json({ ok: true, block: Number(r.blockNumber) });
      }

      if (p === "/api/hatch" && req.method === "POST") {
        if (!dep) return json({ error: "belum di-deploy" }, 400);
        const { pid } = (await req.json()) as { pid: number };
        const r = await send(dep.hatchery, abis.hatchery, wallets[1], "hatch", [pid]);

        // Anak yang baru lahir langsung dicatat manifest-nya, sama seperti founder.
        try {
          const id = Number(await read(dep.registry, abis.registry, "totalMinted"));
          const genome = (await read(dep.registry, abis.registry, "genomeOf", [id])) as bigint;
          const owner = ((await read(dep.registry, abis.registry, "ownerOf", [id])) as string).toLowerCase();
          const w = wallets.find((x) => x.account.address.toLowerCase() === owner) ?? wallets[0];
          await send(dep.registry, abis.registry, w, "setManifestHash", [id, manifestHash(expand(genome, 0n))]);
        } catch { /* pencatatan manifest bukan alasan menggagalkan kelahiran */ }

        return json({ ok: true, block: Number(r.blockNumber) });
      }

      if (p === "/api/manifest" && req.method === "POST") {
        // Menghitung manifest dari genome on-chain, lalu mencatat hash-nya
        // kembali ke chain. Inilah yang membuat agent yang DIJALANKAN dapat
        // dibuktikan sebagai agent yang TERCATAT — lihat PLAN.md §8.
        if (!dep) return json({ error: "belum di-deploy" }, 400);
        const { id } = (await req.json()) as { id: number };
        const genome = (await read(dep.registry, abis.registry, "genomeOf", [id])) as bigint;
        const hash = manifestHash(expand(genome, 0n));
        const owner = ((await read(dep.registry, abis.registry, "ownerOf", [id])) as string).toLowerCase();
        const w = wallets.find((x) => x.account.address.toLowerCase() === owner) ?? wallets[0];
        await send(dep.registry, abis.registry, w, "setManifestHash", [id, hash]);
        return json({ ok: true, hash: "0x" + hash.toString(16).padStart(16, "0") });
      }

      if (p === "/api/run" && req.method === "POST") {
        if (!dep) return json({ error: "belum di-deploy" }, 400);
        const { ids, task, mock, mode, maxSteps, workdir, checkCommand } = (await req.json()) as {
          ids: number[]; task: string; mock?: boolean;
          mode?: "single" | "agent"; maxSteps?: number;
          /** Direktori nyata tempat agent bekerja. Kosong = kerangka bawaan. */
          workdir?: string;
          /** Perintah pemeriksaan untuk direktori nyata, mis. "bun test". */
          checkCommand?: string;
        };
        if (!task?.trim()) return json({ error: "tugas kosong" }, 400);
        if (!ids?.length) return json({ error: "belum ada agent dipilih" }, 400);

        pruneJobs();
        const jobId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const job: Job = { id: jobId, status: "running", startedAt: Date.now(), task, agents: {} };
        for (const id of ids) job.agents[id] = { steps: [], done: false };
        jobs.set(jobId, job);
        saveJob(job);

        // Dijalankan tanpa ditunggu; kemajuannya diambil lewat /api/job.
        void (async () => {
          const env = { ...process.env, MOCK_LLM: mock ? "1" : "0" };
          const provider = mock ? undefined : getProvider(env);
          try {
            for (const id of ids) {
              const slot = job.agents[id];
              try {
                const genome = (await read(dep!.registry, abis.registry, "genomeOf", [id])) as bigint;
                const agent = materialize(genome, 0n, { id, provider, env });
                slot.modules = agent.manifest.traits.filter((x) => x.module).map((x) => x.module!);
                slot.model = provider?.modelFor(agent.manifest.modelTier) ?? "mock";

                if (mode === "agent" && !mock) {
                  slot.tools = toolsFor(agent.manifest).map((x) => x.spec.name);
                  const dir = `.runs/${Date.now()}-${id}`;
                  const ws = workdir
                    ? new Workspace(workdir, { attach: true, checkCommand })
                    : new Workspace(`${dir}/ws`);
                  const loop = await runAgentLoop({
                    agent, provider: provider!, ws,
                    task: `${task}\n\n---\n\n${BUILD_CONTRACT}`,
                    maxSteps: maxSteps ?? 10,
                    onStep: (s) => slot.steps.push(s),

                    /**
                     * Agent bertanya kepada agent lain. Yang ditanya dirakit dari
                     * genome-nya sendiri di chain, menjawab sekali, dan tidak
                     * pernah menyentuh tempat kerja si penanya.
                     */
                    consult: async (otherId, question) => {
                      const g = (await read(dep!.registry, abis.registry, "genomeOf", [otherId])) as bigint;
                      const other = materialize(g, 0n, { id: otherId, provider, env });
                      const ans = await other.run(question);
                      slot.steps.push({
                        step: slot.steps.length + 1, kind: "tool", tool: "consult_agent",
                        args: `#${otherId}: ${question.slice(0, 80)}`,
                        result: ans.output.slice(0, 600),
                      });
                      const mods = other.manifest.traits.filter((x) => x.module).map((x) => x.module).join(", ");
                      return `Jawaban agent #${otherId} (${mods}):\n\n${ans.output}`;
                    },
                  });
                  // Di direktori nyata, build dan skor rubrik tidak berlaku —
                  // proyeknya belum tentu Vite + React. Yang dilaporkan adalah
                  // hasil perintah pemeriksaan milik pengguna.
                  let built: unknown = null;
                  if (ws.mode === "attached") {
                    const c = await ws.runCheckCommand();
                    built = {
                      dir: workdir, attached: true, files: Object.keys(ws.snapshot()).slice(0, 80),
                      checkCommand, checkOk: c.ok, checkOutput: c.output.slice(-3000),
                      typecheckOk: c.ok, buildOk: c.ok, rendersOk: c.ok,
                      score: 0, scoreMax: 0, gated: false, lines: [],
                      axe: [], consoleErrors: [], shot: null, shotMobile: null,
                      buildLog: c.output.slice(-1500), durationMs: 0, timedOut: false,
                    };
                  } else {
                    const sb = await ws.check({ outDir: `${dir}/out` });
                    built = buildInfo(dir, sb, scoreDeterministic(sb, checks()));
                  }
                  slot.result = {
                    id, ok: true, mode: "agent", modules: slot.modules, tools: slot.tools,
                    model: slot.model, maxSteps: agent.manifest.params.maxSteps,
                    manifestHash: "0x" + agent.manifestHash.toString(16).padStart(16, "0"),
                    loop: {
                      finished: loop.finished, reason: loop.reason, checks: loop.checks,
                      steps: loop.steps, summary: loop.summary, durationMs: loop.durationMs,
                      promptTokens: loop.totalPromptTokens, completionTokens: loop.totalCompletionTokens,
                    },
                    built,
                    output: loop.summary,
                  };
                } else {
                  const r = await agent.run(`${task}\n\n---\n\n${BUILD_CONTRACT}`);
                  const files = parseAgentFiles(r.output);
                  let built = null;
                  if (Object.keys(files).length) {
                    const dir = `.runs/${Date.now()}-${id}`;
                    mkdirSync(dir, { recursive: true });
                    const sb = await runInSandbox(files, { timeoutMs: 300_000, outDir: `${dir}/out` });
                    built = buildInfo(dir, sb, scoreDeterministic(sb, checks()));
                  }
                  slot.result = {
                    id, ok: true, mode: "single", modules: slot.modules,
                    manifestHash: r.manifestHash, model: r.model, provider: r.provider,
                    toolsDeclared: r.toolsDeclared, toolsAvailable: r.toolsAvailable,
                    promptTokens: r.promptTokens, completionTokens: r.completionTokens,
                    durationMs: r.durationMs, mocked: r.mocked,
                    built, output: r.output,
                  };
                }
              } catch (e) {
                slot.error = (e as Error).message.slice(0, 300);
                slot.result = { id, ok: false, error: slot.error };
              }
              slot.done = true;
              saveJob(job);
            }
            job.status = "done";
            saveJob(job);
          } catch (e) {
            job.status = "error";
            job.error = (e as Error).message.slice(0, 300);
            saveJob(job);
          }
        })();

        return json({ jobId });
      }

      if (p.startsWith("/api/job/")) {
        const jid = p.slice("/api/job/".length);
        const j = jobs.get(jid) ?? loadJob(jid);
        if (!j) return json({ error: "job tidak ditemukan" }, 404);
        return json({
          id: j.id, status: j.status, error: j.error,
          elapsedMs: Date.now() - j.startedAt,
          agents: Object.entries(j.agents).map(([id, a]) => ({
            id: Number(id), done: a.done, error: a.error,
            modules: a.modules, tools: a.tools, model: a.model,
            steps: a.steps, result: a.result,
          })),
          results: Object.values(j.agents).filter((a) => a.result).map((a) => a.result),
        });
      }

      if (p === "/api/mine" && req.method === "POST") {
        // Hanya untuk Anvil: mempercepat masa kehamilan saat menjajal UI.
        await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "anvil_mine", params: ["0x6"] }) });
        return json({ ok: true, block: Number(await pub.getBlockNumber()) });
      }

      if (p === "/api/arena") {
        const f = "arena/results/latest.json";
        return existsSync(f) ? json(JSON.parse(readFileSync(f, "utf8"))) : json({ empty: true });
      }

      if (p === "/api/founders") {
        return json(FOUNDERS.map((f) => ({
          id: f.id, name: f.name,
          genome: "0x" + f.genome.toString(16).padStart(64, "0"),
          traits: express(f.genome, 0n).map((t, i) => ({ name: LOCUS_NAMES[i], value: traitName(i, t) })),
        })));
      }

      // Artefak hasil run: screenshot dan berkas keluaran sandbox.
      if (p.startsWith("/artifact/")) {
        const rel = decodeURIComponent(p.slice("/artifact/".length));
        // hanya boleh dari .runs/, tidak boleh keluar lewat ".."
        if (!rel.startsWith(".runs/") || rel.includes("..")) return new Response("terlarang", { status: 403 });
        if (!existsSync(rel)) return new Response("not found", { status: 404 });
        const ext = rel.slice(rel.lastIndexOf("."));
        return new Response(Bun.file(rel), {
          headers: { "content-type": ext === ".png" ? "image/png" : "text/plain" },
        });
      }

      // Berkas statis, selalu disajikan segar.
      //
      // Tanpa header ini browser menyimpan app.js lama dan tab baru tidak
      // pernah muncul walau server sudah mengirim versi terbaru — persis yang
      // terjadi saat tab Jalankan ditambahkan. Selama UI masih sering berubah,
      // caching hanya menimbulkan kebingungan yang sulit dilacak.
      const file = p === "/" ? "/index.html" : p;
      const path = join("web", file);
      if (existsSync(path)) {
        const ext = file.slice(file.lastIndexOf("."));
        return new Response(Bun.file(path), {
          headers: {
            "content-type": MIME[ext] ?? "text/plain",
            "cache-control": "no-store, must-revalidate",
          },
        });
      }
      return new Response("not found", { status: 404 });
    } catch (e) {
      return json({ error: (e as Error).message.slice(0, 400) }, 500);
    }
  },
});

console.log(`\n  Meiosis UI  →  http://localhost:${PORT}`);
console.log(`  chain       →  ${RPC}`);
console.log(`  ${dep ? "kontrak sudah ter-deploy" : "belum ter-deploy — pakai tombol Deploy di UI"}\n`);
