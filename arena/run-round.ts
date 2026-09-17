/**
 * Satu ronde arena: beberapa agent, tugas identik, beberapa run, ambil median.
 *
 * Median dari beberapa run, bukan satu run. Kemenangan dari sekali jalan bisa
 * kebetulan, dan itu akan ketahuan saat juri minta diulang live.
 */
import { readFileSync } from "node:fs";
import { materialize } from "../runtime/materialize";
import { getProvider, type Provider } from "../runtime/providers";
import { runInSandbox } from "../sandbox/run";
import { parseAgentFiles } from "./parse-output";
import { scoreDeterministic, type Checks, type DeterministicScore } from "./scorers/deterministic";
import { judge, type JudgeScore, RUBRIC_HASH } from "./scorers/judge";

export interface Contestant { id: number; label: string; genome: bigint; seed: bigint }

export interface RunResult {
  run: number;
  deterministic: DeterministicScore;
  judgeScore: JudgeScore | null;
  total: number;
  files: string[];
  outDir: string;
  agentModel: string;
  error?: string;
}

export interface AgentResult {
  contestant: Contestant;
  runs: RunResult[];
  median: number;
  modules: string[];
}

const median = (xs: number[]) => {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round(((s[m - 1] + s[m]) / 2) * 10) / 10;
};

export async function runRound(opts: {
  jobDir: string;
  contestants: Contestant[];
  runsPerAgent?: number;
  provider?: Provider;
  useJudge?: boolean;
  onEvent?: (msg: string) => void;
}): Promise<{ results: AgentResult[]; rubricHash: string }> {
  const runs = opts.runsPerAgent ?? 3;
  const provider = opts.provider ?? getProvider();
  const spec = readFileSync(`${opts.jobDir}/spec.md`, "utf8");
  const checks = JSON.parse(readFileSync(`${opts.jobDir}/checks.json`, "utf8")) as Checks;
  const say = opts.onEvent ?? (() => {});

  const results: AgentResult[] = [];

  for (const c of opts.contestants) {
    const agent = materialize(c.genome, c.seed, { id: c.id, provider });
    const modules = agent.manifest.traits.filter((t) => t.module).map((t) => t.module!) ;
    const runResults: RunResult[] = [];

    for (let i = 1; i <= runs; i++) {
      say(`${c.label} — run ${i}/${runs}`);
      try {
        const receipt = await agent.run(spec);
        const files = parseAgentFiles(receipt.output);

        if (Object.keys(files).length === 0) {
          runResults.push({
            run: i, deterministic: { gated: true, total: 0, max: 70, lines: [], metrics: {} },
            judgeScore: null, total: 0, files: [], outDir: "",
            agentModel: receipt.model, error: "tidak ada berkas yang bisa diurai dari balasan",
          });
          continue;
        }

        const sb = await runInSandbox(files, { timeoutMs: 300_000 });
        const det = scoreDeterministic(sb, checks);

        let js: JudgeScore | null = null;
        if (opts.useJudge !== false && !det.gated && sb.render) {
          js = await judge(provider, { text: sb.render.text, visual: sb.render.visual });
        }

        runResults.push({
          run: i, deterministic: det, judgeScore: js,
          total: Math.round((det.total + (js?.total ?? 0)) * 10) / 10,
          files: Object.keys(files), outDir: sb.outDir, agentModel: receipt.model,
        });
      } catch (e) {
        runResults.push({
          run: i, deterministic: { gated: true, total: 0, max: 70, lines: [], metrics: {} },
          judgeScore: null, total: 0, files: [], outDir: "", agentModel: "-",
          error: (e as Error).message.slice(0, 200),
        });
      }
    }

    results.push({ contestant: c, runs: runResults, median: median(runResults.map((r) => r.total)), modules });
  }

  return { results, rubricHash: RUBRIC_HASH };
}
