/**
 * Demo P1 — seluruh alur kelahiran, di Anvil lokal.
 *
 *   deploy -> mint 4 founder -> seal -> breed G0 x G1 -> tunggu 5 blok
 *   -> hatch -> verifikasi genome anak secara independen
 *
 * Bagian terakhir itu intinya: kita membaca genome anak dari chain, lalu
 * menghitungnya ulang dari nol memakai implementasi TypeScript. Kalau keduanya
 * sama, seorang anak terbukti sah keturunan kedua parent-nya tanpa perlu
 * mempercayai siapa pun.
 */
import { createWalletClient, createPublicClient, http, parseEther, formatEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { foundry } from "viem/chains";
import { readFileSync } from "node:fs";
import { meiosis, express, LOCUS, LOCUS_NAMES, traitName } from "../packages/shared/src/genome";
import { FOUNDERS } from "../packages/shared/src/founders";

const RPC = "http://127.0.0.1:8545";
const KEYS = [
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80", // deployer
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d", // alice
  "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a", // bob
  "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6", // carol
] as const;

const art = (n: string) => JSON.parse(readFileSync(`contracts/out/${n}.sol/${n}.json`, "utf8"));
const pub = createPublicClient({ chain: foundry, transport: http(RPC) });
const wallet = (k: string) =>
  createWalletClient({ account: privateKeyToAccount(k as `0x${string}`), chain: foundry, transport: http(RPC) });

const [deployer, alice, bob, carol] = KEYS.map(wallet);
const step = (s: string) => console.log(`\n\x1b[1m${s}\x1b[0m`);
const ok = (s: string) => console.log(`  \x1b[32m✓\x1b[0m ${s}`);

async function deploy(name: string, args: unknown[] = []) {
  const a = art(name);
  const hash = await deployer.deployContract({ abi: a.abi, bytecode: a.bytecode.object, args } as never);
  const r = await pub.waitForTransactionReceipt({ hash });
  return { address: r.contractAddress!, abi: a.abi };
}

async function send(c: { address: `0x${string}`; abi: unknown }, w: ReturnType<typeof wallet>,
                    fn: string, args: unknown[] = [], value = 0n) {
  const hash = await w.writeContract({ address: c.address, abi: c.abi, functionName: fn, args, value } as never);
  return pub.waitForTransactionReceipt({ hash });
}
const read = (c: { address: `0x${string}`; abi: unknown }, fn: string, args: unknown[] = []) =>
  pub.readContract({ address: c.address, abi: c.abi, functionName: fn, args } as never);

console.log("\n\x1b[1mMEIOSIS — demo kelahiran di Anvil\x1b[0m");

step("1. Deploy");
const reg = await deploy("AgentRegistry");
const gen = await deploy("Genesis", [reg.address]);
const hat = await deploy("Hatchery", [reg.address]);
const skl = await deploy("SkillRegistry");
ok(`AgentRegistry  ${reg.address}`);
ok(`Genesis        ${gen.address}`);
ok(`Hatchery       ${hat.address}`);
ok(`SkillRegistry  ${skl.address}`);

await send(reg, deployer, "setMinter", [gen.address, true]);
await send(reg, deployer, "setMinter", [hat.address, true]);
ok("Genesis & Hatchery diberi hak mint");

step("2. Mint generasi nol ke tiga alamat berbeda");
const owners = [alice, bob, carol, carol];
for (let i = 0; i < 4; i++) {
  await send(gen, deployer, "mintFounder",
    [owners[i].account.address, FOUNDERS[i].genome, FOUNDERS[i].name]);
  ok(`G${i} ${FOUNDERS[i].name.padEnd(15)} -> ${owners[i].account.address.slice(0, 10)}…`);
}
await send(gen, deployer, "seal");
ok("Genesis disegel — generasi nol terkunci selamanya");

step("3. Bob memasang G1 sebagai pejantan");
await send(hat, bob, "listForStud", [2n, parseEther("0.01")]);
const bobBefore = await pub.getBalance({ address: bob.account.address });
ok("G1 Pixel Sense, biaya kawin 0,01 ETH");

step("4. Alice mengawinkan G0 x G1");
const bred = await send(hat, alice, "breed", [1n, 2n], parseEther("0.01"));
const pid = 1n;
const preg = (await read(hat, "pregnancies", [pid])) as unknown[];
const revealBlock = Number(preg[2]);
ok(`Kehamilan #${pid} dibuat di blok ${bred.blockNumber}`);
ok(`Seed baru ada di blok ${revealBlock} — belum bisa disimulasi sekarang`);
const bobAfter = await pub.getBalance({ address: bob.account.address });
ok(`Bob menerima ${formatEther(bobAfter - bobBefore)} ETH`);

step("5. Menunggu masa kehamilan");
// Ini persis yang akan dikerjakan watcher di orchestrator: tunggu sampai
// revealBlock benar-benar lewat, jangan mengandalkan penambangan paksa.
let now = await pub.getBlockNumber();
while (now <= BigInt(revealBlock)) {
  await new Promise((r) => setTimeout(r, 500));
  now = await pub.getBlockNumber();
}
ok(`blok ${now} > revealBlock ${revealBlock} — seed sekarang sudah ada`);

step("6. Menetaskan");
const hatched = await send(hat, alice, "hatch", [pid]);
const { decodeEventLog } = await import("viem");
let childId = 0n;
for (const log of hatched.logs) {
  try {
    const d = decodeEventLog({ abi: hat.abi, data: log.data, topics: log.topics }) as never;
    if ((d as { eventName: string }).eventName === "Hatched") {
      childId = (d as { args: { childId: bigint } }).args.childId;
    }
  } catch { /* log dari kontrak lain */ }
}
if (childId === 0n) throw new Error("event Hatched tidak ditemukan");
ok(`Anak lahir sebagai agent #${childId} — gas transaksi ${hatched.gasUsed}`);

step("7. Verifikasi independen");
const onChain = (await read(reg, "genomeOf", [childId])) as bigint;
const blk = await pub.getBlock({ blockNumber: BigInt(revealBlock) });
const { keccak256, encodeAbiParameters } = await import("viem");
const seed = BigInt(keccak256(encodeAbiParameters(
  [{ type: "bytes32" }, { type: "uint64" }], [blk.hash!, pid])));
const recomputed = meiosis(FOUNDERS[0].genome, FOUNDERS[1].genome, seed);

console.log(`  genome on-chain  0x${onChain.toString(16).padStart(64, "0")}`);
console.log(`  dihitung ulang   0x${recomputed.toString(16).padStart(64, "0")}`);
if (onChain !== recomputed) { console.log("\n  \x1b[31m✗ TIDAK COCOK\x1b[0m\n"); process.exit(1); }
ok("\x1b[1mCOCOK — anak ini terbukti sah tanpa mempercayai siapa pun\x1b[0m");

step("8. Apa yang diwarisi");
const eA = express(FOUNDERS[0].genome, 0n);
const eB = express(FOUNDERS[1].genome, 0n);
const eC = express(onChain, seed);
const rows = [LOCUS.SECURITY_INSTINCT, LOCUS.AESTHETIC, LOCUS.TEST_RIGOR,
               LOCUS.STACK_AFFINITY, LOCUS.CREATIVITY, LOCUS.VERBOSITY];
console.log(`  ${"lokus".padEnd(20)} ${"G0 Smith".padEnd(11)} ${"G1 Pixel".padEnd(11)} anak`);
for (const l of rows) {
  const a = traitName(l, eA[l]), b = traitName(l, eB[l]), c = traitName(l, eC[l]);
  const from = c === a && c !== b ? "\x1b[36m← dari G0\x1b[0m"
             : c === b && c !== a ? "\x1b[35m← dari G1\x1b[0m" : "";
  console.log(`  ${LOCUS_NAMES[l].toLowerCase().padEnd(20)} ${a.padEnd(11)} ${b.padEnd(11)} \x1b[1m${c.padEnd(9)}\x1b[0m ${from}`);
}
console.log();

// ---------------------------------------------------------------------------
// P2 — genome on-chain menjadi agent, dan hash-nya dicatat kembali ke chain
// ---------------------------------------------------------------------------
step("9. Merakit agent dari genome on-chain");
const { expand, manifestHash, systemPrompt } = await import("../runtime/genome/expand");

const childManifest = expand(onChain, seed);
const childHash = manifestHash(childManifest);
ok(`tier ${childManifest.modelTier}, temperature ${childManifest.params.temperature}, maxSteps ${childManifest.params.maxSteps}`);
ok(`modul aktif: ${childManifest.traits.filter((t) => t.module).map((t) => t.module).join(", ")}`);
ok(`system prompt ${systemPrompt(childManifest).length} karakter`);

step("10. Mencatat manifestHash ke chain");
await send(reg, alice, "setManifestHash", [childId, childHash]);
const stored = (await read(reg, "agentOf", [childId])) as { manifestHash: bigint };
console.log(`  dihitung runtime  0x${childHash.toString(16).padStart(16, "0")}`);
console.log(`  tersimpan di chain 0x${stored.manifestHash.toString(16).padStart(16, "0")}`);
if (stored.manifestHash !== childHash) { console.log("\n  \x1b[31m✗ TIDAK COCOK\x1b[0m\n"); process.exit(1); }
ok("\x1b[1mCOCOK — agent yang dijalankan terbukti agent yang tercatat di chain\x1b[0m");
console.log();
