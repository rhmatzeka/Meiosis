/**
 * Membuktikan sebuah berkas agent hasil ekspor memang agent yang tercatat di chain.
 *
 *   bun run verify-agent ~/.claude/agents/meiosis-5-anak-5.md
 *
 * Genome dibaca ulang langsung dari AgentRegistry, dirakit ulang dengan expand(),
 * lalu dibandingkan dengan isi berkas. Tidak perlu mempercayai server Meiosis,
 * pemilik agent, maupun orang yang mengirim berkasnya.
 */
import { readFileSync } from "node:fs";
import { createPublicClient, http, parseAbi } from "viem";
import { foundry, sepolia } from "viem/chains";
import { parseExport } from "../runtime/export";
import { expand, manifestHash, systemPrompt } from "../runtime/genome/expand";

const file = process.argv[2];
if (!file) { console.log("pakai: bun run verify-agent <berkas.md>"); process.exit(1); }

const ok = (s: string) => console.log(`  \x1b[32m✓\x1b[0m ${s}`);
const bad = (s: string) => { console.log(`  \x1b[31m✗\x1b[0m ${s}`); failed++; };
let failed = 0;

const x = parseExport(readFileSync(file, "utf8"));
const chain = x.chainId === sepolia.id ? sepolia : foundry;
const rpc = x.chainId === sepolia.id
  ? process.env.SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com"
  : process.env.LOCAL_RPC || "http://127.0.0.1:8545";
const pub = createPublicClient({ chain, transport: http(rpc) });
const abi = parseAbi([
  "function genomeOf(uint64) view returns (uint256)",
  "function agentOf(uint64) view returns ((uint256 genome,uint64 parentA,uint64 parentB,uint32 birthBlock,uint16 generation,uint16 breedCount,uint64 manifestHash))",
]);

console.log(`\nagent #${x.agentId} di ${chain.name}, registry ${x.registry}\n`);

const onChain = await pub.readContract({ address: x.registry as `0x${string}`, abi, functionName: "agentOf", args: [BigInt(x.agentId)] });
onChain.genome === x.genome ? ok("genome di berkas sama dengan genome di chain") : bad("genome di berkas BERBEDA dari chain");

const m = expand(onChain.genome, 0n);
const h = "0x" + manifestHash(m).toString(16).padStart(16, "0");
h === x.manifestHash ? ok(`manifestHash cocok ${h}`) : bad(`manifestHash berkas ${x.manifestHash}, hasil hitung ${h}`);

const recorded = "0x" + onChain.manifestHash.toString(16).padStart(16, "0");
if (onChain.manifestHash === 0n) console.log("  \x1b[33m⊘\x1b[0m manifestHash belum dicatat pemiliknya di chain");
else recorded === h ? ok("manifestHash yang tercatat on-chain cocok") : bad(`tercatat on-chain ${recorded}`);

systemPrompt(m).trim() === x.prompt ? ok("system prompt identik dengan hasil rakit ulang dari genome")
  : bad("system prompt sudah DIUBAH dari yang diturunkan genome");

console.log(failed ? `\n\x1b[31m\x1b[1mTIDAK SAH\x1b[0m\n` : `\n\x1b[32m\x1b[1mSAH\x1b[0m — berkas ini adalah agent #${x.agentId} apa adanya\n`);
process.exit(failed ? 1 : 0);
