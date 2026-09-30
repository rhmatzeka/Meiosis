import { useEffect, useState } from "react";
import { get } from "../api";
import { Empty } from "../components/ui";
import { useTitle } from "../router";

interface Line { key: string; points: number; max: number; detail: string }
interface Run { run: number; model: string; gated: boolean; deterministic: number; judge?: { total: number; alasan: string }; lines: Line[] }
interface ArenaAgent { label: string; modules: string[]; median: number; runs: Run[] }
interface Arena { empty?: boolean; ranAt: string; provider: string; runsPerAgent: number; rubricHash: string; agents: ArenaAgent[] }

export function ArenaPage() {
  useTitle("Arena");
  const [d, setD] = useState<Arena | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { get<Arena>("/api/arena").then(setD).catch((e) => setErr(e.message)); }, []);

  const head = (
    <div className="page-head">
      <h1 className="h-page">Arena</h1>
      <p>Setiap agent mendapat tugas yang persis sama. Yang berbeda hanya genome-nya. 70 poin diukur otomatis di sandbox (build, tes, aksesibilitas), 30 poin dari juri AI yang tidak tahu agent mana yang dinilainya.</p>
    </div>
  );

  if (err) return <>{head}<Empty title="Hasil arena tidak bisa dimuat">{err}</Empty></>;
  if (!d) return <>{head}<div className="skeleton" style={{ height: 300 }} /></>;
  if (d.empty) return <>{head}<Empty title="Belum ada ronde arena">Jalankan <code>MOCK_LLM=0 RUNS=3 bun run arena</code> di server. Satu ronde tiga agent memakan waktu sekitar 20 menit.</Empty></>;

  const finished = d.agents.filter((a) => a.runs.some((r) => !r.gated));
  const best = Math.max(0, ...finished.map((a) => a.median));
  const child = d.agents.find((a) => a.label.toLowerCase().includes("anak"));
  const parents = d.agents.filter((a) => a !== child);
  const childWins = !!child && parents.every((p) => child.median > p.median);
  const avg = (xs: number[]) => (xs.length ? (xs.reduce((s, x) => s + x, 0) / xs.length).toFixed(1) : "—");

  return (
    <div className="stack-lg">
      {head}
      <div className={`banner ${childWins ? "banner-info" : ""}`} style={{ width: "100%", margin: 0 }}>
        <div>
          {childWins
            ? <><b>Anak mengungguli kedua induknya.</b> Keunggulan hibrida yang terukur.</>
            : <><b>Anak belum mengungguli kedua induknya di ronde ini.</b> Hasil ditampilkan apa adanya.</>}
        </div>
      </div>
      <p className="xs dim">Ronde {new Date(d.ranAt).toLocaleString("id-ID")} · {d.provider} · {d.runsPerAgent} kali per agent, diambil median.</p>

      <div className="arena-list">
        {d.agents.map((a) => {
          const done = a.runs.filter((r) => !r.gated);
          const r = done[0];
          return (
            <article key={a.label} className={`plate stack ${a.median === best ? "arena-best" : ""}`}>
              <div className="spread">
                <h3>{a.label}</h3>
                <span className="arena-score">{a.median}<span className="dim">/100</span></span>
              </div>
              <div className="row" style={{ gap: 6 }}>{a.modules.slice(0, 5).map((m) => <span key={m} className="chip chip-dim">{m}</span>)}</div>
              <div className="small muted">
                Otomatis {avg(done.map((x) => x.deterministic))}/70 · juri {avg(done.map((x) => x.judge?.total ?? 0))}/30
                {a.runs.length - done.length > 0 && ` · ${a.runs.length - done.length} dari ${a.runs.length} run gagal build`}
              </div>
              {r && (
                <details className="tech">
                  <summary>Rincian skor</summary>
                  <div className="odds" style={{ marginTop: 12 }}>
                    {r.lines.map((l) => (
                      <div className="odds-row" key={l.key} title={l.detail}>
                        <span className="small">{l.key}</span>
                        <div className="track"><b style={{ width: `${(l.points / l.max) * 100}%` }} /></div>
                        <span className="v">{l.points}/{l.max}</span>
                      </div>
                    ))}
                    {r.judge && <p className="xs muted">Juri: {r.judge.alasan}</p>}
                  </div>
                </details>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}
