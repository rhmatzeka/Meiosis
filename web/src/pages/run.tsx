/**
 * Beri tugas ke satu atau beberapa agent sekaligus. Dengan tugas yang persis
 * sama, satu-satunya yang berbeda di antara hasil mereka adalah genome-nya.
 */
import { useEffect, useRef, useState } from "react";
import { formatEther } from "viem";
import { get, post, type Agent } from "../api";
import { AgentCard } from "../components/agent";
import { useToast } from "../components/toast";
import { Empty, Spinner } from "../components/ui";
import { useActor } from "../hooks/use-actor";
import { useData } from "../hooks/use-data";
import { Link, useLocation, useTitle } from "../router";

const EXAMPLES: [string, string][] = [
  ["Komponen form", 'Buat komponen React "StakeForm" dengan input jumlah dan tombol Stake.\nBalas dengan kode saja.'],
  ["Landing page", "Buat landing page untuk dApp staking bernama Epoch: hero, cara kerja, tabel APY.\nBalas dengan kode saja."],
  ["Audit singkat", "Tinjau potongan kode ini dan sebutkan masalahnya:\n\nfunction Balance({ html }) { return <div dangerouslySetInnerHTML={{__html: html}} /> }"],
];

interface Step { step: number; kind: string; tool?: string; args?: string; result?: string; text?: string }
interface Built {
  typecheckOk: boolean; buildOk: boolean; rendersOk: boolean; gated: boolean; score: number; scoreMax: number;
  durationMs: number; shot: string | null; shotMobile: string | null; buildLog: string; consoleErrors: string[];
  lines: { key: string; points: number; max: number; detail: string }[];
}
interface Result {
  id: number; ok: boolean; error?: string; model?: string; mocked?: boolean; modules?: string[];
  output?: string; built?: Built | null; tools?: string[];
  loop?: { steps: Step[]; checks: number; finished: boolean; reason: string; promptTokens: number; completionTokens: number; durationMs: number };
  promptTokens?: number; completionTokens?: number; durationMs?: number;
}
interface Job { status: "running" | "done" | "error"; error?: string; elapsedMs: number; agents: { id: number; done: boolean; steps: Step[]; model?: string }[]; results: Result[] }

export function RunPage() {
  useTitle("Beri tugas");
  const { agents, status, byId, loading } = useData();
  const actor = useActor();
  const toast = useToast();
  const { query } = useLocation();
  const [sel, setSel] = useState<number[]>(() => (query.get("id") ? [Number(query.get("id"))] : []));
  const [task, setTask] = useState("");
  const [full, setFull] = useState(!!status?.docker);
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const poll = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => { setFull(!!status?.docker); }, [status?.docker]);
  useEffect(() => () => clearTimeout(poll.current), []);

  const toggle = (a: Agent) => setSel((s) => (s.includes(a.id) ? s.filter((x) => x !== a.id) : [...s, a.id]));
  const priceOf = (id: number) => BigInt(byId(id)?.rent.priceWei ?? "0");
  const total = sel.reduce((s, id) => s + priceOf(id), 0n);
  const limit = status?.public ? 3 : 8;

  const run = async () => {
    setError(null); setJob(null);
    // Setiap agent berharga dibayar lebih dulu lewat Pasar; hash tx-nya jadi bukti bayar.
    const payments: Record<number, string> = {};
    if (total > 0n) {
      if (actor.mode === "none") { actor.login(); return; }
      for (const id of sel) {
        if (priceOf(id) === 0n) continue;
        const r = await actor.act("rent", { id }, { quietSuccess: true });
        if (!r) return;
        payments[id] = r.hash;
      }
    }
    setRunning(true);
    try {
      const { jobId } = await post<{ jobId: string }>("/api/run", { ids: sel, task: task.trim(), mode: full ? "agent" : "single", payments });
      const tick = async () => {
        try {
          const j = await get<Job>(`/api/job/${jobId}`);
          setJob(j);
          if (j.status === "running") { poll.current = setTimeout(tick, 1500); return; }
          if (j.error) setError(j.error);
          setRunning(false);
        } catch (e) { setError((e as Error).message); setRunning(false); }
      };
      tick();
    } catch (e) {
      setError((e as Error).message);
      setRunning(false);
      toast("Tugas tidak bisa dimulai.", "bad");
    }
  };

  if (loading) return <div className="skeleton" style={{ height: 400 }} />;
  if (!agents.length) return <Empty title="Belum ada agent" />;

  return (
    <div className="stack-lg">
      <div className="page-head">
        <h1 className="h-page">Beri tugas</h1>
        <p>Pilih satu agent, atau beberapa sekaligus untuk membandingkan. Genome dibaca dari chain lalu dirakit menjadi agent yang benar-benar bekerja.</p>
      </div>

      {!status?.docker && (
        <div className="banner banner-info" style={{ width: "100%", margin: 0 }}>
          <div>
            <b>Server ini belum bisa membangun hasil kerja agent</b> karena Docker belum terpasang. Agent tetap bisa menjawab
            dalam mode cepat. Untuk kerja penuh (menulis, membangun, memperbaiki sendiri), bawa agent pulang sebagai <code>.md</code> dan
            pakai dari Claude Code.
          </div>
        </div>
      )}
      {status && !status.runReady && (
        <div className="banner" style={{ width: "100%", margin: 0 }}>
          <div><b>Server ini belum punya kunci model</b>, jadi agent hanya bisa jalan dalam mode tiruan. Pemilik server: isi <code>GROQ_API_KEY</code> di <code>.env</code> lalu nyalakan ulang.</div>
        </div>
      )}

      <section className="stage stack">
        <div className="spread">
          <h2 className="h-sub">Tugas</h2>
          <div className="row" style={{ gap: 6 }}>
            {EXAMPLES.map(([label, text]) => <button key={label} className="btn btn-sm" onClick={() => setTask(text)}>{label}</button>)}
          </div>
        </div>
        <textarea className="textarea" value={task} onChange={(e) => setTask(e.target.value)} placeholder="Tulis apa yang harus dikerjakan agent…" rows={5} />
        <div className="run-options">
          <label className="check">
            <input type="checkbox" checked={full} disabled={!status?.docker} onChange={(e) => setFull(e.target.checked)} />
            <span><b>Kerja penuh</b>: agent memakai tool, membangun hasilnya di sandbox, dan memperbaiki sendiri (maks. 10 langkah)</span>
          </label>
        </div>
        <div className="row">
          <button className="btn btn-primary btn-lg" disabled={!sel.length || !task.trim() || running || sel.length > limit} onClick={run}>
            {running ? <><Spinner />Bekerja…</> : `${sel.length > 1 ? `Jalankan di ${sel.length} agent` : "Jalankan"}${total > 0n ? ` · bayar ${formatEther(total)} ETH` : ""}`}
          </button>
          <span className="small muted">
            {!sel.length ? "Pilih agent di bawah." : sel.length > limit ? `Paling banyak ${limit} agent sekali jalan.` : sel.map((id) => byId(id)?.name).join(", ")}
            {total > 0n && " · dibayar ke pemilik agent dan leluhurnya, sekali untuk tugas ini"}
          </span>
        </div>
      </section>

      {job && <JobView job={job} />}
      {error && <div className="banner" style={{ width: "100%", margin: 0 }}><div>{error}</div></div>}

      <section className="stack">
        <h2 className="h-section">Pilih agent</h2>
        <div className="agent-grid">
          {agents.map((a) => <AgentCard key={a.id} agent={a} onPick={() => toggle(a)} pickedAs={sel.includes(a.id) ? "a" : undefined} showPrices />)}
        </div>
      </section>
    </div>
  );
}

function JobView({ job }: { job: Job }) {
  const { byId } = useData();
  if (job.status === "running") {
    return (
      <section className="stack">
        {job.agents.map((a) => (
          <div key={a.id} className="plate stack">
            <div className="spread"><h3>{byId(a.id)?.name ?? `#${a.id}`}</h3><span className="small muted">{a.done ? "selesai" : `${a.steps.length} langkah`}{a.model ? ` · ${a.model}` : ""}</span></div>
            <Steps steps={a.steps.slice(-6)} />
            {!a.done && !a.steps.length && <p className="small muted"><Spinner /> menunggu langkah pertama…</p>}
          </div>
        ))}
        <p className="xs dim">berjalan {Math.round(job.elapsedMs / 1000)} detik</p>
      </section>
    );
  }
  return (
    <section className="stack">
      {job.results.map((r) => <ResultView key={r.id} r={r} />)}
    </section>
  );
}

function ResultView({ r }: { r: Result }) {
  const { byId } = useData();
  const name = byId(r.id)?.name ?? `#${r.id}`;
  if (!r.ok) return <div className="banner" style={{ width: "100%", margin: 0 }}><div><b>{name}</b> gagal: {r.error}</div></div>;
  const tokens = r.loop ? `${r.loop.promptTokens + r.loop.completionTokens} token · ${(r.loop.durationMs / 1000).toFixed(0)} detik`
    : `${(r.promptTokens ?? 0) + (r.completionTokens ?? 0)} token · ${((r.durationMs ?? 0) / 1000).toFixed(1)} detik`;
  return (
    <article className="plate stack">
      <div className="spread">
        <h3><Link to={`/agent/${r.id}`}>{name}</Link></h3>
        <span className="small muted">{r.model ?? "—"} · {tokens}{r.mocked ? " · uji" : ""}</span>
      </div>
      {r.loop && (
        <>
          <div className="row" style={{ gap: 6 }}>
            <span className="chip">{r.loop.steps.length} langkah</span>
            <span className="chip">{r.loop.checks} kali cek build</span>
            <span className={`chip ${r.loop.finished ? "chip-teal" : "chip-gold"}`}>{r.loop.finished ? "selesai" : r.loop.reason}</span>
          </div>
          <details className="tech"><summary>Jejak langkah</summary><Steps steps={r.loop.steps} /></details>
        </>
      )}
      {r.built && <BuiltView b={r.built} />}
      <details className="tech" open={!r.built}>
        <summary>{r.loop ? "Ringkasan agent" : "Jawaban agent"}</summary>
        <pre className="output"><code>{r.output ?? ""}</code></pre>
      </details>
    </article>
  );
}

function Steps({ steps }: { steps: Step[] }) {
  const icon: Record<string, string> = { tool: "▸", finish: "✓", message: "💬", limit: "⏹", error: "✗" };
  return (
    <ol className="steps">
      {steps.map((s) => (
        <li key={s.step}>
          <span className="dim mono">{s.step}</span>
          <span>{icon[s.kind] ?? "·"}</span>
          <div style={{ minWidth: 0 }}>
            <span className="mono"><b>{s.tool ?? s.kind}</b>{s.args && <span className="dim">({s.args.slice(0, 80)}{s.args.length > 80 ? "…" : ""})</span>}</span>
            {(s.result || s.text) && <div className="dim small step-out">{(s.result ?? s.text ?? "").split("\n").slice(0, 3).join("\n").slice(0, 280)}</div>}
          </div>
        </li>
      ))}
    </ol>
  );
}

function BuiltView({ b }: { b: Built }) {
  const mark = (v: boolean) => (v ? "✓" : "✗");
  return (
    <div className="stack">
      <div className="row" style={{ gap: 6 }}>
        <span className={`chip ${b.typecheckOk ? "chip-teal" : ""}`}>{mark(b.typecheckOk)} tipe</span>
        <span className={`chip ${b.buildOk ? "chip-teal" : ""}`}>{mark(b.buildOk)} build</span>
        <span className={`chip ${b.rendersOk ? "chip-teal" : ""}`}>{mark(b.rendersOk)} tampil</span>
        <span className="chip">{b.gated ? "tidak dinilai" : `skor ${b.score}/${b.scoreMax}`}</span>
      </div>
      {b.rendersOk && b.shot ? (
        <div className="shots">
          <figure><figcaption className="xs dim">desktop</figcaption><img src={b.shot} alt="Hasil di layar desktop" loading="lazy" /></figure>
          {b.shotMobile && <figure><figcaption className="xs dim">ponsel</figcaption><img src={b.shotMobile} alt="Hasil di layar ponsel" loading="lazy" /></figure>}
        </div>
      ) : (
        <details className="tech"><summary>Log build</summary><pre className="output"><code>{b.buildLog}</code></pre></details>
      )}
    </div>
  );
}
