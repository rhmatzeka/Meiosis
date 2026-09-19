/**
 * Server UI: satu proses yang menyajikan API dan halaman webnya sekaligus.
 *
 * Tanpa build step. Astro menyusul ketika kita butuh ekspor statis untuk
 * cadangan demo (PLAN.md §15.2); untuk sekarang yang dibutuhkan adalah sesuatu
 * yang langsung bisa dijalankan dan dilihat.
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { encodeFunctionData, parseEther, formatEther, decodeEventLog, isAddress, getAddress, type Abi, type Address } from "viem";
import {
  pub, wallets, ownerName, artifact, loadDeployment,
  deploymentValid, isLive, RPC, CHAIN, IS_LOCAL, EXPLORER, chain, type Deployment,
} from "./chain";
import { deployAll } from "./deploy";
import { toClaudeAgent, agentSlug } from "../runtime/export";
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
  royalty: artifact("LineageRoyalty").abi,
};

/**
 * Mode publik: chain Sepolia, atau PUBLIC=1 untuk menguji perilakunya di Anvil.
 * Di mode ini server dibuka ke internet, jadi apa pun yang memakan kuota model
 * atau menyentuh filesystem host dibatasi — lihat /api/run.
 */
const PUBLIC = !IS_LOCAL || process.env.PUBLIC === "1";
const RUN_PRICE = parseEther(process.env.RUN_PRICE_ETH ?? "0");
const RUN_LIMIT_PER_HOUR = Number(process.env.RUN_LIMIT_PER_HOUR ?? 6);

const read = (addr: Address, abi: Abi, fn: string, args: unknown[] = []) =>
  pub.readContract({ address: addr, abi, functionName: fn, args } as never);

async function send(addr: Address, abi: Abi, w: (typeof wallets)[number], fn: string, args: unknown[] = [], value = 0n) {
  const hash = await w.writeContract({ address: addr, abi, functionName: fn, args, value } as never);
  return pub.waitForTransactionReceipt({ hash });
}

// ---------------------------------------------------------------------------

/**
 * Roster dan daftar kehamilan disimpan sebentar di memori.
 *
 * Di Sepolia, setiap tab yang terbuka menarik keduanya tiap beberapa detik;
 * tanpa cache, sepuluh pengunjung sudah cukup membuat RPC publik membalas 429.
 * `?fresh=1` melewati cache — dipakai UI tepat setelah transaksinya ter-mine.
 */
const CACHE_MS = IS_LOCAL ? 0 : 8000;
const cached = <T,>(fn: () => Promise<T>) => {
  let hit: { at: number; data: T } | null = null;
  return async (fresh = false) => {
    if (!fresh && hit && Date.now() - hit.at < CACHE_MS) return hit.data;
    const data = await fn();
    hit = { at: Date.now(), data };
    return data;
  };
};

type AgentRow = Awaited<ReturnType<typeof readAgent>>;

async function readAgent(d: Deployment, id: number) {
  const [a, owner, chosenName, listed, fee] = await Promise.all([
    read(d.registry, abis.registry, "agentOf", [id]) as Promise<{
      genome: bigint; parentA: bigint; parentB: bigint; generation: number;
      breedCount: number; manifestHash: bigint; birthBlock: number;
    }>,
    read(d.registry, abis.registry, "ownerOf", [id]) as Promise<string>,
    read(d.registry, abis.registry, "nameOf", [id]) as Promise<string>,
    read(d.hatchery, abis.hatchery, "studListed", [id]) as Promise<boolean>,
    read(d.hatchery, abis.hatchery, "studFee", [id]) as Promise<bigint>,
  ]);
  const founderName = !chosenName && a.generation === 0
    ? ((await read(d.genesis, abis.genesis, "founderName", [id])) as string) : "";

  // Seed kelahiran tidak tersimpan on-chain; untuk founder ia 0, dan untuk
  // anak kita pakai 0 di tampilan. Ekspresi lokus yang seri bisa berbeda dari
  // saat lahir — ditandai di UI agar tidak menyesatkan.
  const seed = 0n;
  const e = express(a.genome, seed);
  const manifest = expand(a.genome, seed);

  return {
    id,
    name: chosenName || founderName || `Anak #${id}`,
    named: !!chosenName,
    owner, ownerName: ownerName(owner),
    generation: a.generation,
    parents: [Number(a.parentA), Number(a.parentB)],
    breedCount: a.breedCount,
    genome: "0x" + a.genome.toString(16).padStart(64, "0"),
    genomeRaw: a.genome.toString(),
    manifestHashOnChain: "0x" + a.manifestHash.toString(16).padStart(16, "0"),
    manifestHashComputed: "0x" + manifestHash(manifest).toString(16).padStart(16, "0"),
    birthBlock: a.birthBlock,
    stud: { listed, feeWei: fee.toString(), feeEth: formatEther(fee) },
    traits: e.map((t, i) => ({ locus: i, name: LOCUS_NAMES[i], value: traitName(i, t) })),
    modules: manifest.traits.filter((t) => t.module).map((t) => t.module),
    modelTier: manifest.modelTier,
    params: manifest.params,
  };
}

const listAgents = cached(async () => {
  if (!dep) return [] as AgentRow[];
  const d = dep;
  const total = Number(await read(d.registry, abis.registry, "totalMinted"));
  return Promise.all(Array.from({ length: total }, (_, i) => readAgent(d, i + 1)));
});

const listPregnancies = cached(async () => {
  if (!dep) return [];
  const d = dep;
  const [next, head] = await Promise.all([
    read(d.hatchery, abis.hatchery, "nextPregnancyId"),
    pub.getBlockNumber(),
  ]);
  const now = Number(head);
  return Promise.all(Array.from({ length: Number(next) - 1 }, async (_, i) => {
    const pid = i + 1;
    const p = (await read(d.hatchery, abis.hatchery, "pregnancies", [pid])) as unknown[];
    const revealBlock = Number(p[2]);
    return {
      id: pid, parentA: Number(p[0]), parentB: Number(p[1]),
      revealBlock, hatched: p[3] as boolean, to: p[4] as string,
      blocksLeft: Math.max(0, revealBlock - now + 1),
      ready: !p[3] && now > revealBlock,
      expired: !p[3] && now > revealBlock + 256,
    };
  }));
});

// ---------------------------------------------------------------------------
// Transaksi untuk wallet browser

/**
 * Menyusun transaksi yang akan ditandatangani pengguna di wallet-nya sendiri.
 *
 * Server tidak pernah memegang kunci pengguna. Yang ia kerjakan hanya bagian
 * yang merepotkan di browser tanpa build step: meng-encode calldata,
 * menghitung stud fee yang harus dibayar, dan menghitung manifestHash dari
 * genome — yang terakhir itu wajib identik dengan expand() di sini.
 */
async function buildTx(action: string, a: Record<string, unknown>, from?: string) {
  const d = dep!;
  const id = (k = "id") => {
    const v = Number(a[k]);
    if (!Number.isInteger(v) || v < 1) throw new Error(`${k} tidak sah`);
    return v;
  };
  const eth = (k: string) => {
    const v = String(a[k] ?? "0").trim().replace(",", ".");
    if (!/^\d+(\.\d{1,18})?$/.test(v)) throw new Error(`${k} harus angka ETH, mis. 0.01`);
    return parseEther(v);
  };
  const call = (to: Address, abi: Abi, fn: string, args: unknown[], value = 0n, label = fn) =>
    ({ to, data: encodeFunctionData({ abi, functionName: fn, args } as never), value: "0x" + value.toString(16), label });

  switch (action) {
    case "breed": {
      if (!from || !isAddress(from)) throw new Error("hubungkan wallet dulu");
      const pa = id("a"), pb = id("b");
      if (pa === pb) throw new Error("induk tidak boleh sama");
      const head = await pub.getBlockNumber();
      let value = 0n;
      for (const x of [pa, pb]) {
        const [owner, listed, fee, readyAt] = await Promise.all([
          read(d.registry, abis.registry, "ownerOf", [x]) as Promise<string>,
          read(d.hatchery, abis.hatchery, "studListed", [x]) as Promise<boolean>,
          read(d.hatchery, abis.hatchery, "studFee", [x]) as Promise<bigint>,
          read(d.hatchery, abis.hatchery, "readyAt", [x]) as Promise<bigint>,
        ]);
        if (readyAt > head) throw new Error(`#${x} masih masa jeda sampai blok ${readyAt} (sekarang ${head})`);
        if (owner.toLowerCase() === from.toLowerCase()) continue;
        if (!listed) throw new Error(`#${x} bukan milikmu dan belum dipasang sebagai pejantan oleh pemiliknya`);
        value += fee;
      }
      return call(d.hatchery, abis.hatchery, "breed", [pa, pb], value, `kawinkan #${pa} × #${pb}`);
    }
    case "hatch": return call(d.hatchery, abis.hatchery, "hatch", [id("pid")], 0n, `tetaskan kehamilan #${a.pid}`);
    case "reroll": return call(d.hatchery, abis.hatchery, "reroll", [id("pid")], 0n, `jadwalkan ulang kehamilan #${a.pid}`);
    case "listForStud":
      return call(d.hatchery, abis.hatchery, "listForStud", [id(), eth("feeEth")], 0n, `pasang #${a.id} sebagai pejantan`);
    case "unlistStud": return call(d.hatchery, abis.hatchery, "unlistStud", [id()], 0n, `tarik #${a.id} dari pasar pejantan`);
    case "setName": {
      const name = String(a.name ?? "").trim();
      const n = new TextEncoder().encode(name).length;
      if (n < 1 || n > 32) throw new Error("nama 1–32 byte");
      return call(d.registry, abis.registry, "setName", [id(), name], 0n, `beri nama #${a.id}`);
    }
    case "setManifestHash": {
      const genome = (await read(d.registry, abis.registry, "genomeOf", [id()])) as bigint;
      return call(d.registry, abis.registry, "setManifestHash", [id(), manifestHash(expand(genome, 0n))], 0n,
        `catat manifest #${a.id}`);
    }
    case "pay": {
      const value = eth("amountEth");
      if (value === 0n) throw new Error("jumlah pembayaran nol");
      const memo = ("0x" + Buffer.from(String(a.memo ?? "sewa").slice(0, 31)).toString("hex")).padEnd(66, "0");
      return call(d.royalty, abis.royalty, "pay", [id(), memo], value, `bayar agent #${a.id}`);
    }
    case "withdraw": return call(d.royalty, abis.royalty, "withdraw", [], 0n, "tarik saldo royalti");
    default: throw new Error(`aksi tidak dikenal: ${action}`);
  }
}

// ---------------------------------------------------------------------------
// Pembayaran sewa untuk /api/run di mode publik

const USED_PAYMENTS = ".runs/used-payments.json";
const usedPayments = new Set<string>(
  existsSync(USED_PAYMENTS) ? (JSON.parse(readFileSync(USED_PAYMENTS, "utf8")) as string[]) : [],
);

/**
 * Memastikan sebuah tx benar-benar membayar agent `agentId` sebesar harga sewa
 * lewat LineageRoyalty, dan belum pernah dipakai untuk run lain.
 */
async function checkPayment(agentId: number, hash: string) {
  if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) throw new Error(`bukti bayar #${agentId} bukan hash tx`);
  const h = hash.toLowerCase();
  if (usedPayments.has(h)) throw new Error(`tx ${h.slice(0, 10)}… sudah dipakai untuk run lain`);
  const r = await pub.getTransactionReceipt({ hash: h as `0x${string}` });
  if (r.status !== "success") throw new Error(`tx bayar #${agentId} gagal di chain`);
  const paid = r.logs.some((l) => {
    if (l.address.toLowerCase() !== dep!.royalty.toLowerCase()) return false;
    try {
      const ev = decodeEventLog({ abi: abis.royalty, data: l.data, topics: l.topics }) as
        { eventName: string; args: { agentId: bigint; amount: bigint } };
      return ev.eventName === "Paid" && Number(ev.args.agentId) === agentId && ev.args.amount >= RUN_PRICE;
    } catch { return false; }
  });
  if (!paid) throw new Error(`tx itu bukan pembayaran ≥ ${formatEther(RUN_PRICE)} ETH untuk agent #${agentId}`);
  return h;
}

const markPaid = (hashes: string[]) => {
  for (const h of hashes) usedPayments.add(h);
  try {
    mkdirSync(".runs", { recursive: true });
    writeFileSync(USED_PAYMENTS, JSON.stringify([...usedPayments]));
  } catch { /* kehilangan catatan ini hanya membuka peluang pakai ulang, bukan kehilangan dana */ }
};

/** Alasan agent belum bisa dijalankan sungguhan, atau null kalau siap. */
const modelMissing = () => {
  try { getProvider({ ...process.env, MOCK_LLM: "0" }); return null; }
  catch (e) { return (e as Error).message; }
};

/** Batas run per IP per jam — kuota model milik penyelenggara, bukan milik pengunjung. */
const runLog = new Map<string, number[]>();
const allowRun = (ip: string) => {
  const cutoff = Date.now() - 3_600_000;
  const recent = (runLog.get(ip) ?? []).filter((t) => t > cutoff);
  if (recent.length >= RUN_LIMIT_PER_HOUR) return false;
  recent.push(Date.now());
  runLog.set(ip, recent);
  return true;
};

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
  async fetch(req, server) {
    const url = new URL(req.url);
    const p = url.pathname;

    try {
      if (p === "/api/status") {
        const live = await isLive();
        if (live && !(await deploymentValid(dep))) dep = null;
        return json({
          chain: CHAIN, chainId: chain.id, chainName: chain.name, local: IS_LOCAL, public: PUBLIC,
          explorer: EXPLORER, rpc: IS_LOCAL ? RPC : null,
          chainLive: live, deployed: !!dep, addresses: dep,
          block: live ? Number(await pub.getBlockNumber()) : null,
          runPriceEth: formatEther(RUN_PRICE),
          runReady: !modelMissing(),
          accounts: wallets.map((w, i) => ({ name: ["deployer", "Alice", "Bob", "Carol"][i], address: w.account.address })),
        });
      }

      if (p === "/api/deploy" && req.method === "POST") {
        if (!IS_LOCAL) return json({ error: "Di Sepolia deploy dijalankan dari terminal: bun run deploy:sepolia" }, 400);
        if (!(await isLive())) return json({ error: "Anvil tidak berjalan. Jalankan `bun run anvil` lebih dulu." }, 503);
        // Empat founder ke tiga pemilik berbeda, supaya royalti bermakna.
        const [, alice, bob, carol] = wallets.map((w) => w.account.address);
        dep = await deployAll({ deployer: wallets[0], founderOwners: [alice, bob, carol, carol], resume: dep });
        return json({ ok: true, addresses: dep });
      }

      const fresh = url.searchParams.has("fresh");
      if (p === "/api/agents") return json(await listAgents(fresh));
      if (p === "/api/pregnancies") return json(await listPregnancies(fresh));

      if (p === "/api/tx" && req.method === "POST") {
        if (!dep) return json({ error: "belum di-deploy" }, 400);
        const { action, args, from } = (await req.json()) as { action: string; args?: Record<string, unknown>; from?: string };
        try {
          return json({ ...(await buildTx(action, args ?? {}, from)), chainId: dep.chainId });
        } catch (e) {
          return json({ error: (e as Error).message.slice(0, 300) }, 400);
        }
      }

      /**
       * Hanya Anvil: menjalankan aksi yang sama dengan /api/tx, tapi ditandatangani
       * server memakai akun demo pemiliknya. Dengan ini seluruh UI — memberi nama,
       * memasang tarif, membayar, menarik royalti — bisa dicoba tanpa wallet browser.
       */
      if (p === "/api/local-act" && req.method === "POST") {
        if (!IS_LOCAL) return json({ error: "hanya di chain lokal — di Sepolia pakai wallet" }, 400);
        if (!dep) return json({ error: "belum di-deploy" }, 400);
        const { action, args = {}, as } = (await req.json()) as { action: string; args?: Record<string, unknown>; as?: string };
        const byAddr = (a: string) => wallets.find((w) => w.account.address.toLowerCase() === a.toLowerCase());
        let signer = as ? byAddr(as) : undefined;
        if (!signer && args.id && ["setName", "listForStud", "unlistStud", "setManifestHash"].includes(action)) {
          signer = byAddr((await read(dep.registry, abis.registry, "ownerOf", [Number(args.id)])) as string);
        }
        // Tanpa pilihan lain: perkawinan dan penetasan oleh Alice, pembayaran oleh deployer sebagai pelanggan.
        signer ??= ["breed", "hatch", "reroll"].includes(action) ? wallets[1] : wallets[0];
        try {
          const tx = await buildTx(action, args, signer.account.address);
          const hash = await signer.sendTransaction({ to: tx.to, data: tx.data as `0x${string}`, value: BigInt(tx.value) });
          const r = await pub.waitForTransactionReceipt({ hash });
          if (r.status !== "success") return json({ error: `${tx.label} revert` }, 400);
          return json({ ok: true, hash, by: ownerName(signer.account.address) });
        } catch (e) {
          const m = (e as Error).message;
          return json({ error: (m.match(/reverted with the following reason:\n(.+)/)?.[1] ?? m.match(/Error: (\w+\(.*?\))/)?.[1] ?? m).slice(0, 300) }, 400);
        }
      }

      if (p === "/api/royalty") {
        const who = url.searchParams.get("address") ?? "";
        if (!dep || !isAddress(who)) return json({ pendingEth: "0", pendingWei: "0" });
        const v = (await read(dep.royalty, abis.royalty, "pending", [getAddress(who)])) as bigint;
        return json({ pendingEth: formatEther(v), pendingWei: v.toString() });
      }

      // Ekspor: agent hasil perkawinan dibawa keluar sebagai subagent Claude Code.
      const ex = p.match(/^\/api\/agents\/(\d+)\/(agent\.md|manifest\.json)$/);
      if (ex) {
        if (!dep) return json({ error: "belum di-deploy" }, 400);
        const a = (await listAgents()).find((x) => x.id === Number(ex[1]));
        if (!a) return json({ error: "agent tidak ditemukan" }, 404);
        const genome = BigInt(a.genomeRaw);
        if (ex[2] === "manifest.json") {
          return new Response(JSON.stringify(expand(genome, 0n), null, 2) + "\n", {
            headers: {
              "content-type": "application/json",
              "content-disposition": `attachment; filename="meiosis-${a.id}.manifest.json"`,
            },
          });
        }
        const md = toClaudeAgent({
          id: a.id, name: a.name, generation: a.generation, parents: a.parents, owner: a.owner,
          genome, manifestHashOnChain: a.manifestHashOnChain,
          chainId: dep.chainId, chainName: CHAIN, registry: dep.registry, explorer: EXPLORER,
        });
        return new Response(md, {
          headers: {
            "content-type": "text/markdown; charset=utf-8",
            "content-disposition": `attachment; filename="${agentSlug(a.id, a.name)}.md"`,
          },
        });
      }

      if (p === "/api/relatedness") {
        const a = BigInt(url.searchParams.get("a") ?? "0");
        const b = BigInt(url.searchParams.get("b") ?? "0");
        return json({ value: relatedness(a, b) });
      }

      if (p === "/api/breed" && req.method === "POST") {
        if (!dep) return json({ error: "belum di-deploy" }, 400);
        if (!IS_LOCAL) return json({ error: "di chain publik transaksi ditandatangani wallet-mu — pakai /api/tx" }, 400);
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
        if (!IS_LOCAL) return json({ error: "di chain publik transaksi ditandatangani wallet-mu — pakai /api/tx" }, 400);
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
        if (!IS_LOCAL) return json({ error: "di chain publik transaksi ditandatangani wallet-mu — pakai /api/tx" }, 400);
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
        const body = (await req.json()) as {
          ids: number[]; task: string; mock?: boolean;
          mode?: "single" | "agent"; maxSteps?: number;
          /** Direktori nyata tempat agent bekerja. Kosong = kerangka bawaan. */
          workdir?: string;
          /** Perintah pemeriksaan untuk direktori nyata, mis. "bun test". */
          checkCommand?: string;
          /** Mode publik berbayar: agentId → hash tx pembayaran lewat LineageRoyalty. */
          payments?: Record<string, string>;
        };
        const { ids, task, mock, mode, workdir, checkCommand, payments } = body;
        let { maxSteps } = body;
        if (!task?.trim()) return json({ error: "tugas kosong" }, 400);
        if (!ids?.length) return json({ error: "belum ada agent dipilih" }, 400);

        /**
         * Di mode publik server ini terbuka ke internet. Kuota model milik
         * penyelenggara, dan filesystem host bukan milik pengunjung: workdir
         * ditolak, langkah dibatasi, dan setiap run dibayar atau dijatah.
         */
        // Periksa kunci model sebelum apa pun — terutama sebelum menerima bayaran.
        const noModel = modelMissing();
        if (!mock && noModel) return json({ error: `server belum siap menjalankan agent: ${noModel}` }, 503);

        let paid: string[] = [];
        if (PUBLIC) {
          if (workdir) return json({ error: "workdir hanya tersedia di mesin lokal" }, 400);
          if (ids.length > 3) return json({ error: "paling banyak 3 agent sekali jalan" }, 400);
          maxSteps = Math.min(maxSteps ?? 10, 10);
          const ip = (process.env.TRUST_PROXY === "1" && req.headers.get("x-forwarded-for")?.split(",")[0].trim())
            || server.requestIP(req)?.address || "?";
          if (!mock && RUN_PRICE > 0n) {
            try {
              paid = await Promise.all(ids.map((id) => checkPayment(id, payments?.[id] ?? "")));
            } catch (e) {
              return json({ error: (e as Error).message, priceEth: formatEther(RUN_PRICE) }, 402);
            }
            if (new Set(paid).size !== paid.length) return json({ error: "satu tx pembayaran hanya untuk satu agent" }, 400);
            markPaid(paid);
          } else if (!mock && !allowRun(ip)) {
            return json({ error: `batas ${RUN_LIMIT_PER_HOUR} run per jam tercapai, coba lagi nanti` }, 429);
          }
        }

        pruneJobs();
        const jobId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const job: Job = { id: jobId, status: "running", startedAt: Date.now(), task, agents: {} };
        for (const id of ids) job.agents[id] = { steps: [], done: false };
        jobs.set(jobId, job);
        saveJob(job);

        // Dijalankan tanpa ditunggu; kemajuannya diambil lewat /api/job.
        void (async () => {
          const env = { ...process.env, MOCK_LLM: mock ? "1" : "0" };
          try {
            // Di dalam try: galat di sini dulu melempar di luar penanganan dan
            // mematikan seluruh server, bukan hanya job ini.
            const provider = mock ? undefined : getProvider(env);
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
        if (!IS_LOCAL) return json({ error: "blok Sepolia tidak bisa dimajukan" }, 400);
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
