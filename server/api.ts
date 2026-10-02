/**
 * Server UI: satu proses yang menyajikan API dan halaman webnya sekaligus.
 *
 * Tanpa build step. Astro menyusul ketika kita butuh ekspor statis untuk
 * cadangan demo (PLAN.md §15.2); untuk sekarang yang dibutuhkan adalah sesuatu
 * yang langsung bisa dijalankan dan dilihat.
 */
import { readFileSync, existsSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Server } from "bun";
import app from "../web/index.html";
import { encodeFunctionData, decodeFunctionData, parseEther, formatEther, decodeEventLog, isAddress, getAddress, type Abi, type Address } from "viem";
import {
  pub, wallets, ownerName, artifact, loadDeployment, operatorWallet, SEC_PER_BLOCK,
  deploymentValid, isLive, RPC, CHAIN, IS_LOCAL, EXPLORER, chain, type Deployment,
} from "./chain";
import { deployAll } from "./deploy";
import { startKeeper } from "./keeper";
import { blockRanges } from "./ranges";
import { checkRent, effectiveRentWei, type RentEvent } from "./rent";
import { studioGenome, validateTraits } from "../packages/shared/src/studio";
import { SoulStore, inheritedSoul, profileFor, promptSoul, type ProfileNode } from "./souls";
import { encodeProfile } from "./encode";
import { testMode } from "./mode";
import { QuotaLedger } from "./quota";
import { tryRequestProblems } from "./try";
import { FeedbackStore, HiddenList, isAdmin } from "./admin";
import { Metrics, type MetricEvent } from "./metrics";
import { MAX_INSTRUCTIONS, composeSoul, parseSoul, type FreeTrait } from "../packages/shared/src/profile";
import { parseSuggestion, suggestFromText, suggestPrompt } from "./suggest";
import { faucetDecision, faucetMessage, loadFaucetState, saveFaucetState, verifyPrivyToken } from "./faucet";
import { toClaudeAgent, toRemoteAgent, licenseStatement, agentSlug } from "../runtime/export";
import { catalog, promptsAvailable } from "../runtime/genome/catalog";
import { redactPromptLeak } from "../runtime/guard";
import { KeyStore, checkSigned } from "./keys";
import { handleMcp } from "./mcp-http";
import { randomBytes } from "node:crypto";
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
  studio: artifact("Studio").abi,
  market: artifact("Market").abi,
  credits: artifact("Credits").abi,
};

/** Instruksi khusus agent rancangan Studio: teks rahasia, kuncinya hash yang tercatat di chain. */
const soulStore = new SoulStore(`.runs/souls-${CHAIN}.json`);

/** Jawaban agent tidak boleh memuat prompt modul maupun instruksi khususnya; bila memuat, diganti penolakan. */
const guardOutput = (output: string, soul = "") =>
  redactPromptLeak(output, [...[...catalog().values()].map((m) => m.prompt), soul]);

/** API key Claude Code dan lisensi `.md` lengkap, disimpan per chain. */
const keyStore = new KeyStore(`.runs/api-keys-${CHAIN}.json`);
const LICENSES = `.runs/licenses-${CHAIN}.json`;
const PUBLIC_URL = process.env.PUBLIC_URL?.replace(/\/+$/, "") || "";
const originOf = (req: Request) => PUBLIC_URL || new URL(req.url).origin;

/**
 * Siapa yang meminta: di chain lokal akun demo boleh disebut langsung (`as`)
 * karena kuncinya dipegang server; selain itu wajib pesan bertanda tangan wallet.
 */
async function provenAddress(b: { as?: string; address?: string; message?: string; signature?: string }, action: string) {
  if (TEST && b.as && wallets.some((w) => w.account.address.toLowerCase() === b.as!.toLowerCase())) return { ok: true as const, address: getAddress(b.as) };
  const r = await checkSigned({ address: b.address ?? "", message: b.message ?? "", signature: b.signature ?? "", action });
  return r.ok ? { ok: true as const, address: getAddress(b.address!) } : { ok: false as const, error: r.error };
}

/**
 * Mode publik: chain Sepolia, atau PUBLIC=1 untuk menguji perilakunya di Anvil.
 * Di mode ini server dibuka ke internet, jadi apa pun yang memakan kuota model
 * atau menyentuh filesystem host dibatasi — lihat /api/run.
 */
const PUBLIC = !IS_LOCAL || process.env.PUBLIC === "1";
/** Mode uji (bun run start --test): akun Anvil boleh dipakai server dan LLM tiruan diizinkan. */
const TEST = testMode(process.env, IS_LOCAL);
const RUN_PRICE = parseEther(process.env.RUN_PRICE_ETH ?? "0");
const RUN_LIMIT_PER_HOUR = Number(process.env.RUN_LIMIT_PER_HOUR ?? 6);

const PRIVY_APP_ID = process.env.PRIVY_APP_ID?.trim() || "";
const operator = operatorWallet();

const FAUCET_FILE = `.runs/faucet-${CHAIN}.json`;
const faucetCfg = {
  amountWei: parseEther(process.env.FAUCET_AMOUNT_ETH ?? "0.003"),
  perIpPerDay: Number(process.env.FAUCET_PER_IP_DAY ?? 3),
  dailyCapWei: parseEther(process.env.FAUCET_DAILY_CAP_ETH ?? "0.05"),
};
/** Di Sepolia faucet butuh operator dan Privy (untuk memverifikasi siapa yang meminta). */
const FAUCET_ON = !!operator && faucetCfg.amountWei > 0n && (IS_LOCAL || !!PRIVY_APP_ID);
let faucetBusy = Promise.resolve();

/** Docker dipakai tab Tugas. Dicek sekali; memasang Docker butuh restart server juga. */
const DOCKER = (() => {
  try { return Bun.spawnSync(["docker", "info"], { stdout: "ignore", stderr: "ignore" }).exitCode === 0; }
  catch { return false; }
})();

const clientIp = (req: Request, server: { requestIP(r: Request): { address: string } | null }) =>
  (process.env.TRUST_PROXY === "1" ? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() : null)
    || server.requestIP(req)?.address || "?";

/**
 * Jatah gratis beta (lihat server/quota.ts). Mode uji memakai batas longgar
 * kecuali diisi lewat env, supaya e2e tidak kehabisan jatah.
 */
const quotaNum = (k: string, normal: number, test: number) => (process.env[k] ? Number(process.env[k]) : TEST ? test : normal);
const quota = new QuotaLedger(`.runs/usage-${CHAIN}.json`, {
  tasksPerDay: quotaNum("FREE_TASKS_PER_DAY", 5, 1000),
  studioPerDay: quotaNum("STUDIO_PER_DAY", 3, 1000),
  tokenBudget: quotaNum("DAILY_TOKEN_BUDGET", 300_000, 1e12),
  resetHourUtc: (((Number(process.env.QUOTA_RESET_HOUR_WIB ?? 7) - 7) % 24) + 24) % 24,
}, Number(process.env.MAX_OUTPUT_TOKENS ?? 3000) + 5000);
const FULL_MODE_PUBLIC = process.env.FULL_MODE_PUBLIC === "1";

// --- admin beta: moderasi, metrik minat, masukan --------------------------------
/** Mode uji tanpa ADMIN_ADDRESSES: akun Anvil #9 menjadi admin supaya panel admin bisa diuji e2e. */
const ADMIN_ENV = { ADMIN_ADDRESSES: process.env.ADMIN_ADDRESSES || (TEST ? "0xa0Ee7A142d267C1f36714E4a8F75612F20a79720" : "") };
const METRICS_SALT = process.env.METRICS_SALT || "meiosis";
const hidden = new HiddenList(`.runs/hidden-${CHAIN}.json`);
const feedback = new FeedbackStore(`.runs/feedback-${CHAIN}.json`, METRICS_SALT);
const reports = new FeedbackStore(`.runs/reports-${CHAIN}.json`, METRICS_SALT, 10);
const metrics = new Metrics(`.runs/metrics-${CHAIN}.json`, METRICS_SALT);
const ADMIN_CONFIG = `.runs/admin-config-${CHAIN}.json`;
if (existsSync(ADMIN_CONFIG)) quota.configure(JSON.parse(readFileSync(ADMIN_CONFIG, "utf8")));
const track = (e: MetricEvent, user: string) => { try { metrics.record(e, user); } catch { /* metrik tidak boleh menggagalkan permintaan */ } };
/** Perkiraan biaya: campuran 70% token masuk ($0,15/juta) dan 30% keluar ($0,60/juta) gpt-oss-120b. */
const usdOf = (tokens: number) => (tokens / 1e6) * (0.7 * 0.15 + 0.3 * 0.6);

const jam = (t: number) => new Date(t).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });
const quotaMessage = (f: { reason: "jatah-akun" | "anggaran-harian"; resetsAt: number }) =>
  f.reason === "jatah-akun"
    ? `Jatah gratismu hari ini habis (${quota.config.tasksPerDay} tugas). Buka lagi besok jam ${jam(f.resetsAt)} WIB.`
    : `Jatah AI hari ini sudah habis untuk semua orang. Buka lagi besok jam ${jam(f.resetsAt)} WIB.`;

/**
 * Siapa pemakai jatah. Dengan Privy: akun Privy yang terverifikasi. Mode uji:
 * alamat yang dikirim tes (x-test-user) atau IP. Tanpa Privy di luar mode uji:
 * IP, lapis terlemah, hanya untuk server lokal tanpa login.
 */
async function quotaUser(req: Request, server: { requestIP(r: Request): { address: string } | null }): Promise<{ ok: true; user: string } | { ok: false; error: string }> {
  if (TEST) return { ok: true, user: `test:${(req.headers.get("x-test-user") ?? clientIp(req, server)).toLowerCase()}` };
  if (PRIVY_APP_ID) {
    const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
    try { return { ok: true, user: `privy:${await verifyPrivyToken(token, PRIVY_APP_ID)}` }; }
    catch { return { ok: false, error: "Masuk dulu untuk memakai jatah gratis." }; }
  }
  return { ok: true, user: `ip:${clientIp(req, server)}` };
}

/** Penyedia model menolak karena ramai (429) atau batas kecepatan. */
const busyModel = (m: string) => /\b429\b|rate.?limit|too many requests|quota/i.test(m);
const BUSY_MESSAGE = "AI sedang ramai. Coba lagi dalam 1 menit; jatahmu tidak berkurang.";

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
  const [a, owner, chosenName, listed, fee, readyAt, cooldown] = await Promise.all([
    read(d.registry, abis.registry, "agentOf", [id]) as Promise<{
      genome: bigint; parentA: bigint; parentB: bigint; generation: number;
      breedCount: number; manifestHash: bigint; birthBlock: number;
    }>,
    read(d.registry, abis.registry, "ownerOf", [id]) as Promise<string>,
    read(d.registry, abis.registry, "nameOf", [id]) as Promise<string>,
    read(d.hatchery, abis.hatchery, "studListed", [id]) as Promise<boolean>,
    read(d.hatchery, abis.hatchery, "studFee", [id]) as Promise<bigint>,
    read(d.hatchery, abis.hatchery, "readyAt", [id]) as Promise<bigint>,
    read(d.hatchery, abis.hatchery, "cooldownBlocks", [id]) as Promise<number>,
  ]);
  // Pasar & Studio: deployment lama belum punya, jadi dibaca hanya bila ada.
  const [listing, rentWei, designed] = await Promise.all([
    d.market ? read(d.market, abis.market, "listingOf", [id]) as Promise<[string, bigint, boolean]> : null,
    d.market ? read(d.market, abis.market, "rentPrice", [id]) as Promise<bigint> : 0n,
    d.studio ? read(d.studio, abis.studio, "designed", [id]) as Promise<boolean> : false,
  ]);
  const soulRaw = d.studio ? ((await read(d.studio, abis.studio, "soulOf", [id])) as string) : null;
  const soulVersion = d.studio ? Number(await read(d.studio, abis.studio, "soulVersion", [id]).catch(() => 0)) : 0;
  const ownSoul = soulRaw && !/^0x0+$/.test(soulRaw) ? soulRaw : null;
  const founderName = !chosenName && a.generation === 0 && !designed
    ? ((await read(d.genesis, abis.genesis, "founderName", [id])) as string) : "";

  // Seed kelahiran tidak tersimpan on-chain; untuk founder ia 0, dan untuk
  // anak kita pakai 0 di tampilan. Ekspresi lokus yang seri bisa berbeda dari
  // saat lahir — ditandai di UI agar tidak menyesatkan.
  const seed = hatchScan.registry === d.registry ? hatchScan.seed.get(id) ?? 0n : 0n;
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
    birthSeed: "0x" + seed.toString(16),
    stud: { listed, feeWei: fee.toString(), feeEth: formatEther(fee) },
    readyAtBlock: Number(readyAt),
    sale: listing && listing[2] ? { seller: listing[0], priceWei: listing[1].toString(), priceEth: formatEther(listing[1]) } : null,
    rent: { ownerPriceWei: rentWei.toString(), priceWei: effectiveRentWei(rentWei, RUN_PRICE).toString(), priceEth: formatEther(effectiveRentWei(rentWei, RUN_PRICE)) },
    designed,
    soulHash: ownSoul,
    soulVersion,
    cooldownBlocks: Number(cooldown),
    traits: e.map((t, i) => ({ locus: i, name: LOCUS_NAMES[i], value: traitName(i, t) })),
    modules: manifest.traits.filter((t) => t.module).map((t) => t.module),
    modelTier: manifest.modelTier,
    params: manifest.params,
  };
}

const listAgents = cached(async () => {
  if (!dep) return [];
  const d = dep;
  const total = Number(await read(d.registry, abis.registry, "totalMinted"));
  await scanHatched(d);
  const edits = await scanEdits(d);
  const rows = await Promise.all(Array.from({ length: total }, (_, i) => readAgent(d, i + 1)));
  // Dari agent mana instruksi khususnya berasal (dirinya, atau leluhur). Isinya tidak pernah dikirim.
  const byId = new Map(rows.map((a) => [a.id, a]));
  // Profil publik: soul sendiri, atau warisan kedua induk menurut seed kelahiran. Instruksi tidak ikut.
  const memo = new Map();
  const node = (i: number, at?: number): ProfileNode | undefined => {
    const x = byId.get(i);
    const hash = x && soulHashAt(x.soulHash, i, at);
    return x && { genome: BigInt(x.genomeRaw), seed: BigInt(x.birthSeed), parents: x.parents, birthBlock: x.birthBlock, soulText: hash ? soulStore.get(hash) : null };
  };
  return rows.map((a) => ({
    ...a,
    soulFrom: inheritedSoul(a.id, (i, at) => { const x = byId.get(i); return x && { soulHash: soulHashAt(x.soulHash, i, at), parents: x.parents, birthBlock: x.birthBlock }; }, (h) => soulStore.get(h)).sources,
    profile: profileFor(a.id, node, memo),
    soulUpdatedBlock: edits.soul.get(a.id) ?? null,
    sale: a.sale ? { ...a.sale, changedAfterListing: (edits.soul.get(a.id) ?? 0) > (edits.listed.get(a.id) ?? Infinity) } : null,
    hidden: hidden.has(a.id),
  }));
});

/**
 * pid → id anak. Event Hatched tidak memuat pid, jadi pid dibaca dari calldata
 * `hatch(pid)` pada tx yang memancarkannya. Hasilnya tidak pernah berubah,
 * jadi cukup dipindai sekali per rentang blok.
 */
const hatchScan = { registry: "", to: 0n, child: new Map<number, number>(), seed: new Map<number, bigint>() };
async function scanHatched(d: Deployment) {
  if (hatchScan.registry !== d.registry) Object.assign(hatchScan, { registry: d.registry, to: 0n, child: new Map(), seed: new Map() });
  const head = await pub.getBlockNumber();
  const from = hatchScan.to ? hatchScan.to + 1n : BigInt(d.block);
  // Per potongan, dan kemajuan disimpan tiap potongan: RPC yang gagal di tengah
  // tidak membuat daftar kehamilan gagal, dan putaran berikutnya melanjutkan.
  try {
    for (const [a, b] of blockRanges(from, head, 9_000n)) {
      const logs = await pub.getContractEvents({
        address: d.hatchery, abi: abis.hatchery, eventName: "Hatched", fromBlock: a, toBlock: b,
      }) as unknown as { transactionHash: `0x${string}`; args: { childId: bigint; seed: bigint } }[];
      for (const l of logs) {
        hatchScan.seed.set(Number(l.args.childId), BigInt(l.args.seed));
        const tx = await pub.getTransaction({ hash: l.transactionHash });
        try {
          const call = decodeFunctionData({ abi: abis.hatchery, data: tx.input });
          if (call.functionName === "hatch") hatchScan.child.set(Number(call.args![0]), Number(l.args.childId));
        } catch { /* hatch lewat kontrak lain: tidak bisa dipetakan, UI jatuh ke pencarian induk */ }
      }
      hatchScan.to = b;
    }
  } catch (e) {
    console.warn(`  pemindaian Hatched berhenti di blok ${hatchScan.to}: ${(e as Error).message.split("\n")[0].slice(0, 120)}`);
  }
  return hatchScan.child;
}

/**
 * Kapan soul terakhir disunting (event Studio.SoulSet) dan kapan listing jual
 * terakhir dipasang (event Market.Listed), per agent. Dipindai bertahap seperti
 * Hatched, supaya label "diperbarui" dan "diubah setelah dipasang" bisa dihitung.
 */
const editScan = { key: "", to: 0n, soul: new Map<number, number>(), listed: new Map<number, number>(), history: new Map<number, { block: number; hash: string }[]>() };
async function scanEdits(d: Deployment) {
  const key = `${d.studio}:${d.market}`;
  if (editScan.key !== key) Object.assign(editScan, { key, to: 0n, soul: new Map(), listed: new Map(), history: new Map() });
  if (!d.studio) return editScan;
  const head = await pub.getBlockNumber();
  const from = editScan.to ? editScan.to + 1n : BigInt(d.block);
  try {
    for (const [a, b] of blockRanges(from, head, 9_000n)) {
      const souls = await pub.getContractEvents({ address: d.studio, abi: abis.studio, eventName: "SoulSet", fromBlock: a, toBlock: b }) as unknown as { blockNumber: bigint; args: { id: bigint; soulHash: string } }[];
      for (const l of souls) {
        const id = Number(l.args.id);
        editScan.soul.set(id, Number(l.blockNumber));
        editScan.history.set(id, [...(editScan.history.get(id) ?? []), { block: Number(l.blockNumber), hash: l.args.soulHash }]);
      }
      if (d.market) {
        const listed = await pub.getContractEvents({ address: d.market, abi: abis.market, eventName: "Listed", fromBlock: a, toBlock: b }) as unknown as { blockNumber: bigint; args: { id: bigint } }[];
        for (const l of listed) editScan.listed.set(Number(l.args.id), Number(l.blockNumber));
      }
      editScan.to = b;
    }
  } catch (e) {
    console.warn(`  pemindaian SoulSet/Listed berhenti di blok ${editScan.to}: ${(e as Error).message.split("\n")[0].slice(0, 120)}`);
  }
  return editScan;
}

/** Hash soul agent pada blok `at` (kosong = terbaru); null bila belum punya soul saat itu. */
function soulHashAt(current: string | null, id: number, at?: number): string | null {
  if (at === undefined) return current;
  const h = (editScan.history.get(id) ?? []).filter((x) => x.block <= at);
  const hash = h.length ? h[h.length - 1].hash : null;
  return hash && !/^0x0+$/.test(hash) ? hash : null;
}

/**
 * Soul yang dipakai saat agent bekerja: profil publiknya (milik sendiri atau
 * warisan) dan instruksi rahasia garis keturunannya. `text` = bentuk utuh untuk
 * ekspor; `instructions` = yang dijaga agar tidak bocor di keluaran.
 */
async function soulFor(id: number) {
  const all = await listAgents();
  const byId = new Map(all.map((a) => [a.id, a]));
  const profile = byId.get(id)?.profile ?? { role: "", traits: [] };
  const soul = promptSoul(id, profile, (i, at) => { const a = byId.get(i); return a && { soulHash: soulHashAt(a.soulHash, i, at), parents: a.parents, birthBlock: a.birthBlock }; }, (h) => soulStore.get(h));
  return { soul, text: composeSoul(soul), instructions: soul.instructions };
}

/** Seed kelahiran asli (event Hatched); 0 untuk agent Studio dan generasi nol. */
async function seedOf(id: number): Promise<bigint> {
  if (!dep) return 0n;
  await scanHatched(dep);
  return hatchScan.seed.get(id) ?? 0n;
}

const listPregnancies = cached(async () => {
  if (!dep) return [];
  const d = dep;
  const children = await scanHatched(d);
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
      childId: children.get(pid) ?? null,
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
function parseTraits(x: unknown): number[] {
  const traits = Array.isArray(x) ? x.map(Number) : [];
  const bad = validateTraits(traits);
  if (bad) throw new Error(bad);
  return traits;
}

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
      return call(d.registry, abis.registry, "setManifestHash", [id(), manifestHash(expand(genome, await seedOf(id())))], 0n,
        `catat manifest #${a.id}`);
    }
    case "pay": {
      const value = eth("amountEth");
      if (value === 0n) throw new Error("jumlah pembayaran nol");
      const memo = ("0x" + Buffer.from(String(a.memo ?? "sewa").slice(0, 31)).toString("hex")).padEnd(66, "0");
      return call(d.royalty, abis.royalty, "pay", [id(), memo], value, `bayar agent #${a.id}`);
    }
    case "withdraw": return call(d.royalty, abis.royalty, "withdraw", [], 0n, "tarik saldo royalti");

    // ---- Saldo pakai (Claude Code)
    case "deposit": {
      if (!d.credits) throw new Error("Saldo pakai belum di-deploy di chain ini");
      const v = eth("amountEth");
      if (v === 0n) throw new Error("jumlah setoran nol");
      return call(d.credits, abis.credits, "deposit", [], v, "isi saldo pakai");
    }
    case "withdrawCredits":
      return call(d.credits!, abis.credits, "withdraw", [eth("amountEth")], 0n, "tarik saldo pakai");

    // ---- Studio & Pasar
    case "studioCreate": {
      if (!d.studio) throw new Error("Studio belum di-deploy di chain ini");
      const traits = parseTraits(a.traits);
      const name = String(a.name ?? "").trim();
      if (new TextEncoder().encode(name).length > 32) throw new Error("nama paling panjang 32 byte");
      const soul = String(a.soulHash ?? "");
      if (soul && (!/^0x[0-9a-f]{64}$/i.test(soul) || !soulStore.get(soul))) throw new Error("instruksi belum tersimpan di server, simpan ulang");
      const mh = manifestHash(expand(studioGenome(traits), 0n));
      const fee = (await read(d.studio, abis.studio, "fee")) as bigint;
      return call(d.studio, abis.studio, "create", [traits, name, mh, soul || "0x" + "0".repeat(64)], fee, "buat agent di Studio");
    }
    case "approveMarket":
      if (!d.market) throw new Error("Pasar belum di-deploy di chain ini");
      return call(d.registry, abis.registry, "setApprovalForAll", [d.market, true], 0n, "izinkan Pasar menjual agent-mu");
    case "list":
      return call(d.market!, abis.market, "list", [id(), eth("priceEth")], 0n, `pasang #${a.id} untuk dijual`);
    case "cancelListing":
      return call(d.market!, abis.market, "cancel", [id()], 0n, `batal jual #${a.id}`);
    case "buy": {
      const [, price, valid] = (await read(d.market!, abis.market, "listingOf", [id()])) as [string, bigint, boolean];
      if (!valid) throw new Error(`#${a.id} sedang tidak dijual`);
      return call(d.market!, abis.market, "buy", [id()], price, `beli #${a.id}`);
    }
    case "setSoul": {
      if (!d.studio) throw new Error("Studio belum ter-deploy di chain ini");
      const soul = String(a.soulHash ?? "");
      if (!/^0x[0-9a-f]{64}$/i.test(soul) || !soulStore.get(soul)) throw new Error("isi otak belum tersimpan di server, simpan ulang");
      return call(d.studio, abis.studio, "setSoul", [id(), soul], 0n, `sunting otak #${a.id}`);
    }
    case "setRentPrice":
      return call(d.market!, abis.market, "setRentPrice", [id(), eth("priceEth")], 0n, `pasang harga sewa #${a.id}`);
    case "rent": {
      const price = effectiveRentWei((await read(d.market!, abis.market, "rentPrice", [id()])) as bigint, RUN_PRICE);
      const job = /^0x[0-9a-f]{64}$/i.test(String(a.job)) ? String(a.job) : ("0x" + Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("hex"));
      return call(d.market!, abis.market, "rent", [id(), job], price > 0n ? price : 1n, `sewa #${a.id} untuk satu tugas`);
    }
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
/** Harga sewa satu tugas untuk agent ini: harga pemilik, atau bawaan platform. */
async function rentPriceOf(agentId: number) {
  const own = dep?.market ? ((await read(dep.market, abis.market, "rentPrice", [agentId])) as bigint) : 0n;
  return effectiveRentWei(own, RUN_PRICE);
}

/**
 * Memastikan tx `hash` adalah `Market.rent` untuk agent `agentId` sebesar
 * harga sewanya, dan belum pernah dipakai untuk tugas lain.
 */
async function checkPayment(agentId: number, hash: string) {
  if (!hash) throw new Error(`agent #${agentId} perlu disewa dulu (${formatEther(await rentPriceOf(agentId))} ETH per tugas)`);
  if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) throw new Error(`bukti bayar #${agentId} bukan hash tx`);
  if (!dep?.market) throw new Error("Pasar belum di-deploy, sewa belum bisa dibayar");
  const h = hash.toLowerCase();
  const r = await pub.getTransactionReceipt({ hash: h as `0x${string}` });
  if (r.status !== "success") throw new Error(`tx sewa #${agentId} gagal di chain`);
  const events: RentEvent[] = r.logs.flatMap((l) => {
    try {
      const ev = decodeEventLog({ abi: abis.market, data: l.data, topics: l.topics }) as unknown as
        { eventName: string; args: { id: bigint; amount: bigint } };
      return ev.eventName === "Rented" ? [{ agentId: Number(ev.args.id), amount: ev.args.amount, market: l.address }] : [];
    } catch { return []; }
  });
  const c = checkRent(events, { agentId, priceWei: await rentPriceOf(agentId), market: dep.market, txHash: h, used: usedPayments });
  if (!c.ok) throw new Error(c.error);
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


if (operator) {
  startKeeper({
    pub: pub as never, signer: operator, getDep: () => dep, abi: abis.hatchery,
    intervalMs: SEC_PER_BLOCK * 1000,
    // Di Anvil pemilik anak adalah akun demo yang kuncinya dipegang server, jadi
    // manifest-nya langsung dicatat — sama seperti /api/hatch. Di Sepolia itu
    // hak pemilik sendiri lewat tombol "Catat ke chain".
    onHatched: async (pid) => {
      if (!TEST || !dep) return;
      const id = (await scanHatched(dep)).get(pid);
      if (!id) return;
      const genome = (await read(dep.registry, abis.registry, "genomeOf", [id])) as bigint;
      const owner = ((await read(dep.registry, abis.registry, "ownerOf", [id])) as string).toLowerCase();
      const w = wallets.find((x) => x.account.address.toLowerCase() === owner);
      if (w) await send(dep.registry, abis.registry, w, "setManifestHash", [id, manifestHash(expand(genome, await seedOf(id)))]);
    },
  });
}

/**
 * Di mode publik halaman disajikan dari hasil `bun run build:web`: diminifikasi
 * dan dipecah, sehingga SDK Privy yang besar hanya diunduh saat dibutuhkan
 * (±140 KB gzip untuk layar pertama, bukan ±1,6 MB). Tanpa build, server
 * membundel sendiri seperti di mesin lokal, dan memperingatkannya.
 */
const DIST = resolve("dist/web");
const USE_DIST = PUBLIC && existsSync(join(DIST, "index.html"));
if (PUBLIC && !USE_DIST) console.warn("  ⚠ dist/web belum ada: jalankan `bun run build:web` supaya halaman jauh lebih ringan");
function serveDist(req: Request) {
  const path = resolve(DIST, "." + decodeURIComponent(new URL(req.url).pathname));
  if (path.startsWith(DIST + "/") && existsSync(path) && statSync(path).isFile()) {
    return new Response(Bun.file(path), { headers: { "cache-control": "public, max-age=31536000, immutable" } });
  }
  return new Response(Bun.file(join(DIST, "index.html")), {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" },
  });
}

Bun.serve({
  port: PORT,
  idleTimeout: 120,
  // Bun membundel web/index.html beserta TSX dan CSS-nya. Di mesin lokal dengan
  // HMR dan sourcemap; di mode publik diminifikasi sekali saat server naik.
  development: PUBLIC ? false : { hmr: true, console: true },
  routes: {
    "/api/*": (req, server) => handle(req, server),
    "/artifact/*": (req, server) => handle(req, server),
    "/mcp": (req, server) => handle(req, server),
    // Semua rute lain milik aplikasi (SPA): /kawin/3, /agent/7, dst.
    "/*": USE_DIST ? serveDist : app,
  },
  fetch: (req, server) => handle(req, server),
});

async function handle(req: Request, server: Server<unknown>): Promise<Response> {
  {
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
          accounts: TEST ? wallets.map((w, i) => ({ name: ["deployer", "Alice", "Bob", "Carol"][i], address: w.account.address })) : [],
          testMode: TEST,
          // Mode uji memakai wallet tiruan (window.ethereum); login Privy diuji manual di Sepolia.
          privyAppId: TEST ? null : PRIVY_APP_ID || null,
          faucet: { enabled: FAUCET_ON, amountEth: formatEther(faucetCfg.amountWei) },
          keeper: !!operator,
          docker: DOCKER,
          secPerBlock: SEC_PER_BLOCK,
          credits: dep?.credits ? { defaultPriceEth: formatEther((await read(dep.credits, abis.credits, "defaultPrice")) as bigint) } : null,
          operatorAddress: operator?.account.address ?? null,
          promptsAvailable: promptsAvailable(),
          market: dep?.market ? {
            feeBps: Number(await read(dep.market, abis.market, "feeBps")),
            studioFeeEth: dep.studio ? formatEther((await read(dep.studio, abis.studio, "fee")) as bigint) : null,
          } : null,
        });
      }

      if (p === "/mcp") {
        if (!dep?.credits || !operator) return json({ error: "MCP online belum aktif: saldo pakai atau operator belum disiapkan" }, 503);
        const d = dep, op = operator, credits = dep.credits;
        return handleMcp(req, {
          keys: keyStore,
          allowMock: TEST,
          agents: async () => (await listAgents()).filter((a) => !a.hidden).map((a) => ({ id: a.id, name: a.name, modules: a.modules.filter((m): m is string => !!m), generation: a.generation, role: a.profile.role, traits: a.profile.traits })),
          priceOf: async (id) => (await read(credits, abis.credits, "maxPrice", [id])) as bigint,
          balanceOf: async (addr) => (await read(credits, abis.credits, "balanceOf", [getAddress(addr)])) as bigint,
          run: async (id, task, context, mock, user) => {
            if (hidden.has(id)) throw new Error(`Agent #${id} disembunyikan admin dan tidak bisa disewa.`);
            const ticket = quota.reserveTask(`key:${user.toLowerCase()}`);
            if (!ticket.ok) throw new Error(quotaMessage(ticket));
            try {
              const env = { ...process.env, MOCK_LLM: mock ? "1" : "0" };
              const provider = mock ? undefined : getProvider(env);
              const genome = (await read(d.registry, abis.registry, "genomeOf", [id])) as bigint;
              const { soul, instructions } = await soulFor(id);
              const agent = materialize(genome, await seedOf(id), { id, provider, env, soul });
              const r = await agent.run(context.trim() ? `${task}\n\n---\n\nKonteks dari proyek pemakai:\n${context}` : task);
              quota.settle(ticket.ticket, r.promptTokens + r.completionTokens);
              const g = guardOutput(r.output, instructions);
              return { output: g.output, model: r.model ?? "mock", leaked: g.leaked };
            } catch (e) {
              quota.release(ticket.ticket);
              throw busyModel((e as Error).message) ? new Error(BUSY_MESSAGE) : e;
            }
          },
          charge: async (user, id, amount, job) => {
            const r = await send(credits, abis.credits, op, "spend", [getAddress(user), id, amount, job]);
            return r.transactionHash;
          },
        });
      }

      if (p === "/api/credits") {
        const who = url.searchParams.get("address") ?? "";
        if (!dep?.credits) return json({ enabled: false });
        const [bal, price] = await Promise.all([
          isAddress(who) ? read(dep.credits, abis.credits, "balanceOf", [getAddress(who)]) as Promise<bigint> : 0n,
          read(dep.credits, abis.credits, "defaultPrice") as Promise<bigint>,
        ]);
        return json({ enabled: true, balanceEth: formatEther(bal), balanceWei: bal.toString(), defaultPriceEth: formatEther(price) });
      }

      if (p === "/api/keys" && req.method === "GET") {
        const who = url.searchParams.get("address") ?? "";
        return json(isAddress(who) ? keyStore.list(who) : []);
      }
      if (p === "/api/keys" && req.method === "POST") {
        const b = (await req.json().catch(() => ({}))) as { as?: string; address?: string; message?: string; signature?: string; label?: string };
        const who = await provenAddress(b, "buat API key");
        if (!who.ok) return json({ error: who.error }, 401);
        const { key, record } = keyStore.create(who.address, String(b.label ?? "Claude Code"));
        return json({ key, prefix: record.prefix, mcpUrl: `${originOf(req)}/mcp` });
      }
      if (p === "/api/keys/revoke" && req.method === "POST") {
        const b = (await req.json().catch(() => ({}))) as { as?: string; address?: string; message?: string; signature?: string; prefix?: string };
        const who = await provenAddress(b, "cabut API key");
        if (!who.ok) return json({ error: who.error }, 401);
        return keyStore.revoke(who.address, String(b.prefix ?? "")) ? json({ ok: true }) : json({ error: "kunci tidak ditemukan" }, 404);
      }

      if (p === "/api/quota") {
        const who = await quotaUser(req, server);
        if (!who.ok) return json({ error: who.error }, 401);
        track("masuk", who.user);
        return json(quota.left(who.user));
      }

      if (p === "/api/studio/try" && req.method === "POST") {
        // Menjalankan rancangan Studio sekali tanpa membuatnya: tanpa chain, tanpa bayar, memakai jatah tugas.
        const b = (await req.json().catch(() => ({}))) as { role?: string; traits?: FreeTrait[]; instructions?: string; task?: string };
        const bad = tryRequestProblems(b);
        if (bad) return json({ error: bad }, 400);
        const who = await quotaUser(req, server);
        if (!who.ok) return json({ error: who.error }, 401);
        const mock = TEST && process.env.MOCK_LLM === "1";
        const noModel = modelMissing();
        if (!mock && noModel) return json({ error: `server belum siap menjalankan agent: ${noModel}` }, 503);
        const t = quota.reserveTask(who.user);
        if (!t.ok) return json({ error: quotaMessage(t), quota: quota.left(who.user) }, 429);
        track("coba", who.user);
        try {
          const soul = { role: String(b.role ?? ""), traits: Array.isArray(b.traits) ? b.traits : [], instructions: String(b.instructions ?? "") };
          const { loci } = await encodeProfile(parseSoul(composeSoul(soul)));
          const env = { ...process.env, MOCK_LLM: mock ? "1" : "0" };
          const agent = materialize(studioGenome(loci), 0n, { provider: mock ? undefined : getProvider(env), env, soul });
          const r = await agent.run(String(b.task).trim());
          quota.settle(t.ticket, r.promptTokens + r.completionTokens);
          return json({ output: guardOutput(r.output, soul.instructions).output, model: r.model, durationMs: r.durationMs, quota: quota.left(who.user) });
        } catch (e) {
          quota.release(t.ticket);
          const m = (e as Error).message;
          return json({ error: busyModel(m) ? BUSY_MESSAGE : m.slice(0, 300) }, busyModel(m) ? 503 : 500);
        }
      }

      if (p === "/api/studio/soul" && req.method === "POST") {
        // Profil bebas + instruksi → soul tersimpan, ditambah 16 lokus untuk Studio.create.
        const b = (await req.json().catch(() => ({}))) as { text?: string; role?: string; traits?: FreeTrait[]; instructions?: string; edit?: number };
        try {
          const instructions = String(b.instructions ?? "");
          if (instructions.length > MAX_INSTRUCTIONS) return json({ error: `instruksi paling panjang ${MAX_INSTRUCTIONS} karakter` }, 400);
          const traits = Array.isArray(b.traits) ? b.traits.filter((t) => t && typeof t.label === "string" && typeof t.value === "string") : [];
          const text = typeof b.text === "string" ? b.text : composeSoul({ role: String(b.role ?? ""), traits, instructions });
          if (!text.trim()) return json({ error: "profil dan instruksi masih kosong" }, 400);
          const who = await quotaUser(req, server);
          if (!who.ok) return json({ error: who.error }, 401);
          // Menyunting agent yang sudah ada tidak memakai jatah agent baru; dibatasi per jam saja.
          if (b.edit && !allowRun(`sunting:${who.user}`)) return json({ error: "Terlalu sering menyunting. Coba lagi sebentar lagi." }, 429);
          const slot = b.edit ? { ok: true as const } : quota.reserveStudio(who.user);
          if (!slot.ok) return json({ error: `Batas ${quota.config.studioPerDay} agent baru per hari tercapai. Buka lagi besok jam ${jam(slot.resetsAt)} WIB.`, quota: quota.left(who.user) }, 429);
          const hash = soulStore.put(text);
          if (!b.edit) track("buat", who.user);
          const parsed = parseSoul(text);
          const ai = modelMissing() || process.env.MOCK_LLM === "1" || !quota.canSpend(2_000) ? undefined : async (pr: { system: string; user: string }) => {
            const r = await getProvider({ ...process.env, MOCK_LLM: "0" }).chat("fast", { system: pr.system, messages: [{ role: "user", content: pr.user }], temperature: 0, maxTokens: 400 });
            quota.addTokens("sistem:studio", r.promptTokens + r.completionTokens);
            return r.text;
          };
          const { loci, source } = await encodeProfile(parsed, ai);
          return json({ hash, loci, source });
        } catch (e) { return json({ error: (e as Error).message }, 400); }
      }

      if (p === "/api/studio/suggest" && req.method === "POST") {
        const { description } = (await req.json().catch(() => ({}))) as { description?: string };
        const d = String(description ?? "").slice(0, 2000);
        const fallback = suggestFromText(d);
        if (!d.trim() || modelMissing() || process.env.MOCK_LLM === "1" || !quota.canSpend(3_000)) return json(fallback);
        if (!allowRun(`suggest:${clientIp(req, server)}`)) return json(fallback);
        try {
          const provider = getProvider({ ...process.env, MOCK_LLM: "0" });
          const pr = suggestPrompt(d);
          const r = await provider.chat("balanced", { system: pr.system, messages: [{ role: "user", content: pr.user }], temperature: 0.4, maxTokens: 900 });
          quota.addTokens("sistem:saran", r.promptTokens + r.completionTokens);
          return json(parseSuggestion(r.text, fallback));
        } catch {
          return json(fallback);
        }
      }

      const rc = p.match(/^\/api\/receipt\/(0x[0-9a-fA-F]{64})$/);
      if (rc) {
        const r = await pub.getTransactionReceipt({ hash: rc[1] as `0x${string}` }).catch(() => null);
        return json({ status: r ? (r.status === "success" ? "success" : "reverted") : "pending" });
      }

      if (p === "/api/faucet" && req.method === "POST") {
        if (!FAUCET_ON || !operator) return json({ ok: false, message: "Faucet tidak aktif di server ini." }, 503);
        const { address } = (await req.json().catch(() => ({}))) as { address?: string };
        if (!address || !isAddress(address)) return json({ ok: false, message: "alamat tidak sah" }, 400);

        let userId = `lokal:${address.toLowerCase()}`;
        if (!TEST && !(IS_LOCAL && !PRIVY_APP_ID)) {
          const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
          try { userId = await verifyPrivyToken(token, PRIVY_APP_ID); }
          catch { return json({ ok: false, message: "Sesi masuk tidak sah. Coba keluar lalu masuk lagi." }, 401); }
        }
        track("masuk", userId.startsWith("lokal:") ? userId : `privy:${userId}`);

        // Diproses satu per satu: dua permintaan serentak tidak boleh sama-sama lolos batas.
        const run = faucetBusy.then(async () => {
          const state = loadFaucetState(FAUCET_FILE);
          const balanceWei = await pub.getBalance({ address: getAddress(address) });
          const d = faucetDecision(state, { userId, address, ip: clientIp(req, server), balanceWei, now: Date.now() }, faucetCfg);
          if (!d.ok) return { status: d.reason === "saldo-cukup" ? 200 : 429, body: { ok: d.reason === "saldo-cukup", reason: d.reason, message: faucetMessage(d.reason) } };
          const hash = await operator.sendTransaction({ to: getAddress(address), value: faucetCfg.amountWei });
          state.records.push({ userId, address, ip: clientIp(req, server), at: Date.now(), wei: faucetCfg.amountWei.toString() });
          saveFaucetState(FAUCET_FILE, state);
          await pub.waitForTransactionReceipt({ hash });
          return { status: 200, body: { ok: true, hash, amountEth: formatEther(faucetCfg.amountWei) } };
        });
        faucetBusy = run.then(() => {}, () => {});
        try {
          const r = await run;
          return json(r.body, r.status);
        } catch (e) {
          return json({ ok: false, message: `Gagal mengirim ETH: ${(e as Error).message.slice(0, 160)}` }, 500);
        }
      }

      if (p === "/api/deploy" && req.method === "POST") {
        if (!IS_LOCAL) return json({ error: "Di Sepolia deploy dijalankan dari terminal: bun run deploy:sepolia" }, 400);
        if (!(await isLive())) return json({ error: "Anvil tidak berjalan. Jalankan `bun run anvil` lebih dulu." }, 503);
        // Tanpa founder: pasar dimulai kosong, agent pertama lahir dari Studio.
        dep = await deployAll({
          deployer: wallets[0], resume: dep,
          baseCooldownBlocks: process.env.BASE_COOLDOWN_BLOCKS ? Number(process.env.BASE_COOLDOWN_BLOCKS) : undefined,
          studioFeeWei: parseEther(process.env.STUDIO_FEE_ETH ?? "0"),
          marketFeeBps: Number(process.env.MARKET_FEE_BPS ?? 1000),
        });
        return json({ ok: true, addresses: dep });
      }

      const fresh = url.searchParams.has("fresh");
      if (p === "/api/agents") return json(await listAgents(fresh));
      if (p === "/api/pregnancies") return json(await listPregnancies(fresh));

      // --- admin: semua endpoint butuh tanda tangan wallet admin -------------------
      if (p.startsWith("/api/admin/") && req.method === "POST") {
        const b = (await req.json().catch(() => ({}))) as Record<string, unknown> & { as?: string; address?: string; message?: string; signature?: string };
        const who = await provenAddress(b, "panel admin");
        if (!who.ok) return json({ error: who.error }, 401);
        if (!isAdmin(who.address, ADMIN_ENV)) return json({ error: "Halaman ini khusus admin." }, 403);
        if (p === "/api/admin/overview") {
          const now = Date.now();
          const snap = quota.snapshot(now);
          const day = (t: number) => new Date(t).toISOString().slice(0, 10);
          const faucetToday = loadFaucetState(FAUCET_FILE).records.filter((r) => r.at > now - 86_400_000);
          return json({
            day: snap.day, users: snap.users, tasks: snap.tasks, tokens: snap.tokens, usd: usdOf(snap.tokens),
            config: quota.config,
            operator: operator ? { address: operator.account.address, balanceEth: formatEther(await pub.getBalance({ address: operator.account.address })) } : null,
            faucetToday: { count: faucetToday.length, eth: formatEther(faucetToday.reduce((sum, r) => sum + BigInt(r.wei), 0n)) },
            funnel: metrics.funnel(day(now - 6 * 86_400_000), day(now)),
            hidden: hidden.list(), feedback: feedback.latest(30), reports: reports.latest(30),
          });
        }
        if (p === "/api/admin/hide" || p === "/api/admin/unhide") {
          const id = Number(b.id);
          if (!Number.isInteger(id) || id < 1) return json({ error: "id agent tidak sah" }, 400);
          if (p === "/api/admin/hide") hidden.hide(id, String(b.reason ?? "")); else hidden.unhide(id);
          await listAgents(true);
          return json({ ok: true, hidden: hidden.list() });
        }
        if (p === "/api/admin/config") {
          const patch: Record<string, number> = {};
          for (const k of ["tasksPerDay", "studioPerDay", "tokenBudget"] as const) if (b[k] !== undefined) patch[k] = Number(b[k]);
          quota.configure(patch);
          const saved = existsSync(ADMIN_CONFIG) ? JSON.parse(readFileSync(ADMIN_CONFIG, "utf8")) : {};
          mkdirSync(".runs", { recursive: true });
          writeFileSync(ADMIN_CONFIG, JSON.stringify({ ...saved, ...patch }));
          return json({ ok: true, config: quota.config });
        }
        return json({ error: "aksi admin tidak dikenal" }, 404);
      }

      if ((p === "/api/feedback" || p === "/api/report") && req.method === "POST") {
        const who = await quotaUser(req, server);
        if (!who.ok) return json({ error: who.error }, 401);
        const b = (await req.json().catch(() => ({}))) as { text?: string; page?: string; id?: number; reason?: string };
        const r = p === "/api/feedback"
          ? feedback.add(who.user, String(b.text ?? ""), String(b.page ?? ""))
          : reports.add(who.user, String(b.reason ?? ""), `/agent/${Number(b.id)}`, Date.now(), Number(b.id) || undefined);
        return r.ok ? json({ ok: true }) : json({ error: "Pesan kosong, atau batas harian tercapai. Coba lagi besok." }, 429);
      }

      if (p === "/api/tx" && req.method === "POST") {
        if (!dep) return json({ error: "belum di-deploy" }, 400);
        const { action, args, from } = (await req.json()) as { action: string; args?: Record<string, unknown>; from?: string };
        if (from && action === "breed") track("kawin", `addr:${from.toLowerCase()}`);
        if (from && action === "setRentPrice" && Number(args?.priceEth ?? 0) > 0) track("pasang-harga", `addr:${from.toLowerCase()}`);
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
        if (!TEST) return json({ error: "Endpoint uji. Jalankan server dengan TEST_ACCOUNTS=1." }, 400);
        if (!dep) return json({ error: "belum di-deploy" }, 400);
        const { action, args = {}, as } = (await req.json()) as { action: string; args?: Record<string, unknown>; as?: string };
        const byAddr = (a: string) => wallets.find((w) => w.account.address.toLowerCase() === a.toLowerCase());
        let signer = as ? byAddr(as) : undefined;
        if (!signer && args.id && ["setName", "listForStud", "unlistStud", "setManifestHash", "approveMarket", "list", "cancelListing", "setRentPrice"].includes(action)) {
          signer = byAddr((await read(dep.registry, abis.registry, "ownerOf", [Number(args.id)])) as string);
        }
        // Tanpa pilihan lain: perkawinan dan penetasan oleh Alice, pembayaran oleh deployer sebagai pelanggan.
        signer ??= ["breed", "hatch", "reroll", "studioCreate", "buy", "rent", "deposit", "withdrawCredits"].includes(action) ? wallets[1] : wallets[0];
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
        if (!dep || !isAddress(who)) return json({ pendingEth: "0", pendingWei: "0", balanceEth: "0", marketApproved: false });
        const [v, bal, approved] = await Promise.all([
          read(dep.royalty, abis.royalty, "pending", [getAddress(who)]) as Promise<bigint>,
          pub.getBalance({ address: getAddress(who) }),
          dep.market ? read(dep.registry, abis.registry, "isApprovedForAll", [getAddress(who), dep.market]) as Promise<boolean> : false,
        ]);
        return json({ pendingEth: formatEther(v), pendingWei: v.toString(), balanceEth: formatEther(bal), marketApproved: approved });
      }

      // Ekspor. GET = `.md` remote untuk siapa saja (tanpa prompt).
      // POST = `.md` lengkap untuk pemilik, bertanda tangan dan ber-watermark.
      // Pemilik membuka otak agent-nya untuk disunting: profil + instruksi miliknya sendiri saja.
      const own = p.match(/^\/api\/agents\/(\d+)\/soul$/);
      if (own && req.method === "POST") {
        const a = (await listAgents(true)).find((x) => x.id === Number(own[1]));
        if (!a) return json({ error: "agent tidak ditemukan" }, 404);
        const who = await provenAddress((await req.json().catch(() => ({}))) as Record<string, string>, `sunting otak #${a.id}`);
        if (!who.ok) return json({ error: who.error }, 401);
        if (who.address.toLowerCase() !== a.owner.toLowerCase()) return json({ error: "Hanya pemilik agent ini yang bisa menyuntingnya." }, 403);
        const text = a.soulHash ? soulStore.get(a.soulHash) : null;
        const s = text ? parseSoul(text) : { role: a.profile.role, traits: a.profile.traits, instructions: "" };
        return json({ ...s, version: a.soulVersion, inherited: !text });
      }

      const ex = p.match(/^\/api\/agents\/(\d+)\/(agent\.md|manifest\.json)$/);
      if (ex) {
        if (!dep) return json({ error: "belum di-deploy" }, 400);
        const a = (await listAgents(req.method === "POST")).find((x) => x.id === Number(ex[1]));
        if (!a) return json({ error: "agent tidak ditemukan" }, 404);
        const genome = BigInt(a.genomeRaw);
        if (ex[2] === "manifest.json") {
          return new Response(JSON.stringify(expand(genome, BigInt(a.birthSeed)), null, 2) + "\n", {
            headers: {
              "content-type": "application/json",
              "content-disposition": `attachment; filename="meiosis-${a.id}.manifest.json"`,
            },
          });
        }
        const info = {
          id: a.id, name: a.name, generation: a.generation, parents: a.parents, owner: a.owner,
          genome, birthSeed: BigInt(a.birthSeed), manifestHashOnChain: a.manifestHashOnChain,
          chainId: dep.chainId, chainName: CHAIN, registry: dep.registry, explorer: EXPLORER,
        };
        if (req.method !== "POST") {
          return new Response(toRemoteAgent(info, { mcpUrl: `${originOf(req)}/mcp` }), {
            headers: {
              "content-type": "text/markdown; charset=utf-8",
              "content-disposition": `attachment; filename="${agentSlug(a.id, a.name)}.md"`,
            },
          });
        }
        const b = (await req.json().catch(() => ({}))) as { as?: string; address?: string; message?: string; signature?: string };
        const who = await provenAddress(b, `unduh agent #${a.id}`);
        if (!who.ok) return json({ error: who.error }, 401);
        if (who.address.toLowerCase() !== a.owner.toLowerCase()) return json({ error: "Hanya pemilik agent ini yang bisa mengunduh .md lengkapnya." }, 403);
        if (!promptsAvailable()) return json({ error: "Server ini tidak memegang prompt privat, jadi .md lengkap tidak bisa dirakit." }, 503);
        if (!operator) return json({ error: "Lisensi butuh wallet operator untuk tanda tangan." }, 503);
        const licenseId = "LIC-" + randomBytes(5).toString("hex");
        const issuedAt = new Date().toISOString();
        const signature = await operator.signMessage({ message: licenseStatement(a.id, who.address, licenseId, a.manifestHashComputed) });
        const all = existsSync(LICENSES) ? (JSON.parse(readFileSync(LICENSES, "utf8")) as unknown[]) : [];
        all.push({ licenseId, licensee: who.address, agentId: a.id, issuedAt, manifestHash: a.manifestHashComputed });
        mkdirSync(".runs", { recursive: true });
        writeFileSync(LICENSES, JSON.stringify(all, null, 2));
        const md = toClaudeAgent(info, { licenseId, licensee: who.address, issuedAt, signature }, (await soulFor(a.id)).text);
        return new Response(md, {
          headers: {
            "content-type": "text/markdown; charset=utf-8",
            "content-disposition": `attachment; filename="${agentSlug(a.id, a.name)}.lengkap.md"`,
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
        if (!TEST) return json({ error: "Endpoint uji. Jalankan server dengan TEST_ACCOUNTS=1." }, 400);
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
        if (!TEST) return json({ error: "Endpoint uji. Jalankan server dengan TEST_ACCOUNTS=1." }, 400);
        const { pid } = (await req.json()) as { pid: number };
        const r = await send(dep.hatchery, abis.hatchery, wallets[1], "hatch", [pid]);

        // Anak yang baru lahir langsung dicatat manifest-nya, sama seperti founder.
        try {
          const id = Number(await read(dep.registry, abis.registry, "totalMinted"));
          const genome = (await read(dep.registry, abis.registry, "genomeOf", [id])) as bigint;
          const owner = ((await read(dep.registry, abis.registry, "ownerOf", [id])) as string).toLowerCase();
          const w = wallets.find((x) => x.account.address.toLowerCase() === owner) ?? wallets[0];
          await send(dep.registry, abis.registry, w, "setManifestHash", [id, manifestHash(expand(genome, await seedOf(id)))]);
        } catch { /* pencatatan manifest bukan alasan menggagalkan kelahiran */ }

        return json({ ok: true, block: Number(r.blockNumber) });
      }

      if (p === "/api/manifest" && req.method === "POST") {
        // Menghitung manifest dari genome on-chain, lalu mencatat hash-nya
        // kembali ke chain. Inilah yang membuat agent yang DIJALANKAN dapat
        // dibuktikan sebagai agent yang TERCATAT — lihat PLAN.md §8.
        if (!dep) return json({ error: "belum di-deploy" }, 400);
        if (!TEST) return json({ error: "Endpoint uji. Jalankan server dengan TEST_ACCOUNTS=1." }, 400);
        const { id } = (await req.json()) as { id: number };
        const genome = (await read(dep.registry, abis.registry, "genomeOf", [id])) as bigint;
        const hash = manifestHash(expand(genome, await seedOf(id)));
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
        const { ids, task, mode, workdir, checkCommand, payments } = body;
        // Mode uji selalu memakai LLM tiruan bila MOCK_LLM=1; di luar mode uji tidak pernah.
        const mock = TEST && (!!body.mock || process.env.MOCK_LLM === "1");
        if (mode === "agent" && !mock && !DOCKER && !workdir) {
          return json({ error: "Mode kerja penuh butuh Docker di server untuk membangun hasil agent. Pakai mode jawaban cepat, atau pasang Docker lalu nyalakan ulang server." }, 400);
        }
        let { maxSteps } = body;
        if (!task?.trim()) return json({ error: "tugas kosong" }, 400);
        if (!ids?.length) return json({ error: "belum ada agent dipilih" }, 400);
        if (mode === "agent" && PUBLIC && !FULL_MODE_PUBLIC && !TEST) return json({ error: "Mode kerja penuh belum dibuka selama beta. Pakai mode jawab langsung." }, 400);
        const who = await quotaUser(req, server);
        if (!who.ok) return json({ error: who.error }, 401);

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
          const ip = clientIp(req, server);
          // Setiap agent dengan harga sewa > 0 wajib dibayar lewat Market.rent.
          const prices = mock ? ids.map(() => 0n) : await Promise.all(ids.map(rentPriceOf));
          const due = ids.filter((_, i) => prices[i] > 0n);
          if (due.length) {
            try {
              paid = await Promise.all(due.map((id) => checkPayment(id, payments?.[id] ?? "")));
            } catch (e) {
              return json({ error: (e as Error).message, prices: Object.fromEntries(ids.map((id, i) => [id, formatEther(prices[i])])) }, 402);
            }
            if (new Set(paid).size !== paid.length) return json({ error: "satu tx pembayaran hanya untuk satu agent" }, 400);
            markPaid(paid);
          }
          if (due.length < ids.length && !mock && !allowRun(ip)) {
            return json({ error: `batas ${RUN_LIMIT_PER_HOUR} run per jam tercapai, coba lagi nanti` }, 429);
          }
        }

        const hiddenId = ids.find((id) => hidden.has(Number(id)));
        if (hiddenId) return json({ error: `Agent #${hiddenId} disembunyikan admin dan tidak bisa disewa.` }, 403);
        // Satu agent = satu tugas dari jatah. Semua dicadangkan dulu; bila satu gagal, semuanya dikembalikan.
        const tickets: Record<number, string> = {};
        for (const id of ids) {
          const t = quota.reserveTask(who.user);
          if (!t.ok) {
            Object.values(tickets).forEach((x) => quota.release(x));
            return json({ error: quotaMessage(t), quota: quota.left(who.user) }, 429);
          }
          tickets[id] = t.ticket;
        }
        track("tugas", who.user);
        if (paid.length) track("tugas-berbayar", who.user);

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
                const { soul: soulData, instructions: soul } = await soulFor(id);
                const agent = materialize(genome, await seedOf(id), { id, provider, env, soul: soulData });
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
                      const other = materialize(g, await seedOf(otherId), { id: otherId, provider, env, soul: (await soulFor(otherId)).soul });
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
                    output: guardOutput(loop.summary, soul).output,
                  };
                } else {
                  const r = await agent.run(`${task}\n\n---\n\n${BUILD_CONTRACT}`);
                  const files = parseAgentFiles(r.output);
                  let built = null;
                  // Tanpa Docker jawabannya tetap dikembalikan, hanya tidak dibangun dan dinilai.
                  if (Object.keys(files).length && DOCKER) {
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
                    built, output: guardOutput(r.output, soul).output,
                  };
                }
                const used = slot.result as { promptTokens?: number; completionTokens?: number; loop?: { promptTokens: number; completionTokens: number } };
                quota.settle(tickets[id], (used.loop?.promptTokens ?? used.promptTokens ?? 0) + (used.loop?.completionTokens ?? used.completionTokens ?? 0));
              } catch (e) {
                quota.release(tickets[id]);
                const m = (e as Error).message;
                slot.error = busyModel(m) ? BUSY_MESSAGE : m.slice(0, 300);
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
        if (!TEST) return json({ error: "Endpoint uji. Jalankan server dengan TEST_ACCOUNTS=1." }, 400);
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

      if (p.startsWith("/api/")) return json({ error: `tidak ada rute ${p}` }, 404);
      return new Response("not found", { status: 404 });
    } catch (e) {
      return json({ error: (e as Error).message.slice(0, 400) }, 500);
    }
  }
}

console.log(`\n  Meiosis UI  →  http://localhost:${PORT}`);
console.log(`  chain       →  ${RPC}`);
console.log(`  ${dep ? "kontrak sudah ter-deploy" : "belum ter-deploy — pakai tombol Deploy di UI"}\n`);
