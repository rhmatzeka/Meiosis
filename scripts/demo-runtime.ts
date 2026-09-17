/**
 * Demo P2 — genome menjadi agent yang sungguh bekerja.
 *
 * Ketiga agent menerima tugas yang identik. Satu-satunya yang berbeda adalah
 * genome mereka. Kalau keluarannya berbeda secara sistematis, berarti modul
 * skill yang diwariskan benar-benar berpengaruh — dan itulah prasyarat agar
 * hybrid vigor bisa diukur di P3.
 */
import { meiosis } from "../packages/shared/src/genome";
import { FOUNDERS } from "../packages/shared/src/founders";
import { materialize } from "../runtime/materialize";
import { getProvider } from "../runtime/providers";

const TASK = `Buat satu komponen React "StakeButton" untuk dApp staking.
Komponen menerima props: amount (string dari input pengguna) dan onStake().
Balas dengan kode saja, tanpa penjelasan panjang.`;

const seed = 0x5eedn;
const child = meiosis(FOUNDERS[0].genome, FOUNDERS[1].genome, seed);

const cast = [
  { id: 1, name: "G0 Solidity Smith", genome: FOUNDERS[0].genome, seed: 0n },
  { id: 2, name: "G1 Pixel Sense", genome: FOUNDERS[1].genome, seed: 0n },
  { id: 5, name: "Anak G0 x G1", genome: child, seed },
];

const provider = getProvider();
console.log(`\n\x1b[1mMEIOSIS — demo runtime\x1b[0m`);
console.log(`penyedia: ${provider.name}\n`);

for (const c of cast) {
  const agent = materialize(c.genome, c.seed, { id: c.id, provider });
  const mods = agent.manifest.traits.filter((t) => t.module).map((t) => t.module);

  console.log(`\x1b[1m${c.name}\x1b[0m`);
  console.log(`  tier ${agent.manifest.modelTier} -> ${provider.modelFor(agent.manifest.modelTier)}`);
  console.log(`  temp ${agent.manifest.params.temperature}  maxTokens ${agent.manifest.params.maxTokens}`);
  console.log(`  modul: ${mods.join(", ")}`);
  console.log(`  manifestHash 0x${agent.manifestHash.toString(16).padStart(16, "0")}`);

  try {
    const r = await agent.run(TASK);
    const lines = r.output.trim().split("\n");
    console.log(`  \x1b[32m✓\x1b[0m ${r.model}  ${r.promptTokens}+${r.completionTokens} token  ${(r.durationMs / 1000).toFixed(1)}s`);
    console.log(`  \x1b[2m${lines.length} baris keluaran, cuplikan:\x1b[0m`);
    for (const l of lines.slice(0, 6)) console.log(`    \x1b[2m${l.slice(0, 88)}\x1b[0m`);

    // penanda kasar yang nanti digantikan scorer sungguhan di P3
    const o = r.output.toLowerCase();
    const marks = [
      ["validasi input", /validat|sanit|isnan|number\(|parsefloat|trim\(/.test(o)],
      ["penanganan galat", /try|catch|error|disabled/.test(o)],
      ["perhatian visual", /classname|tailwind|style|css|aria-/.test(o)],
      ["ada tes", /test\(|describe\(|expect\(/.test(o)],
    ] as const;
    console.log(`  penanda: ${marks.map(([n, v]) => `${v ? "\x1b[32m+\x1b[0m" : "\x1b[31m-\x1b[0m"}${n}`).join("  ")}`);
  } catch (e) {
    console.log(`  \x1b[31m✗\x1b[0m ${(e as Error).message}`);
  }
  console.log();
}
