/** Uji loop agent langsung dari CLI, tanpa UI. */
import { materialize } from "../runtime/materialize";
import { getProvider } from "../runtime/providers";
import { Workspace } from "../runtime/tools/workspace";
import { runAgentLoop } from "../runtime/agent-loop";
import { FOUNDERS } from "../packages/shared/src/founders";

const provider = getProvider();
const agent = materialize(FOUNDERS[0].genome, 0n, { id: 1, provider });
const ws = new Workspace(`.runs/loop-${Date.now()}`);

console.log(`\n\x1b[1m${FOUNDERS[0].name}\x1b[0m  maxSteps ${agent.manifest.params.maxSteps}\n`);

const r = await runAgentLoop({
  agent, provider, ws,
  task: "Ubah src/App.tsx menjadi halaman sambutan untuk dApp staking bernama Epoch: satu judul, satu paragraf, satu tombol. Pastikan lolos typecheck dan build.",
  onStep: (s) => {
    if (s.kind === "tool" || s.kind === "finish") {
      console.log(`  \x1b[36m${String(s.step).padStart(2)}\x1b[0m ${s.tool}(${(s.args ?? "").slice(0, 60)})`);
      console.log(`     \x1b[2m${(s.result ?? "").split("\n").slice(0, 3).join(" | ").slice(0, 110)}\x1b[0m`);
    } else if (s.kind === "message") {
      console.log(`  \x1b[33m${String(s.step).padStart(2)}\x1b[0m teks: ${(s.text ?? "").slice(0, 90)}`);
    } else {
      console.log(`  \x1b[31m${String(s.step).padStart(2)}\x1b[0m ${s.kind}: ${s.text ?? ""}`);
    }
  },
});

console.log(`\n  selesai=${r.finished} alasan=${r.reason} langkah=${r.steps.length} check=${r.checks}`);
console.log(`  token ${r.totalPromptTokens}+${r.totalCompletionTokens} · ${(r.durationMs / 1000).toFixed(1)}s`);
console.log(`  ringkasan: ${r.summary.slice(0, 200)}`);
console.log(`\n  berkas di tempat kerja:`);
for (const f of ws.list()) console.log(`    ${f}`);
