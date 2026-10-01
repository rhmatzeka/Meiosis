/**
 * Pohon keluarga. Satu baris per generasi; anak ditaruh di bawah induknya
 * (lib/tree.ts) supaya garis sesedikit mungkin bersilang. Garis dari induk
 * pertama teal, dari induk kedua pink — kode warna yang sama dengan pita genome.
 * Garis redup sampai sebuah agent disorot; saat itu hanya keluarganya yang menyala.
 */
import { useMemo, useState } from "react";
import { same, type Agent } from "../api";
import { Prices, highlights } from "../components/agent";
import { Cell, Empty } from "../components/ui";
import { useActor } from "../hooks/use-actor";
import { useData } from "../hooks/use-data";
import { layoutTree } from "../lib/tree";
import { Link, useTitle } from "../router";

const COL = 126, ROW = 210, NODE = 60, PAD_X = 70, PAD_Y = 56, LABEL = 52;

export function FamilyPage() {
  useTitle("Silsilah");
  const { agents, loading } = useData();
  const actor = useActor();
  const [focus, setFocus] = useState<number | null>(null);
  const [pinned, setPinned] = useState<number | null>(null);
  const active = focus ?? pinned;

  const view = useMemo(() => {
    const { placed, rows } = layoutTree(agents.map((a) => ({ id: a.id, generation: a.generation, parents: a.parents })));
    const widest = Math.max(1, ...rows.map((r) => r.length));
    const W = Math.max(720, (widest - 1) * COL + PAD_X * 2 + NODE);
    const H = (rows.length - 1) * ROW + PAD_Y * 2 + NODE + LABEL;
    const at = (id: number) => {
      const p = placed.get(id)!;
      const n = rows[p.row].length;
      return { x: W / 2 + (p.col - (n - 1) / 2) * COL, y: PAD_Y + NODE / 2 + p.row * ROW };
    };
    const gens = [...new Set(agents.map((a) => a.generation))].sort((a, b) => a - b);
    return { W, H, at, rows, gens };
  }, [agents]);

  if (loading) return <div className="skeleton" style={{ height: 400 }} />;
  if (!agents.length) return <Empty title="Belum ada agent" />;

  const sel = agents.find((a) => a.id === active);
  const family = new Set<number>();
  if (sel) {
    family.add(sel.id);
    sel.parents.filter(Boolean).forEach((p) => family.add(p));
    agents.filter((a) => a.parents.includes(sel.id)).forEach((a) => family.add(a.id));
  }
  const lit = (id: number) => !sel || family.has(id);
  const mine = agents.filter((a) => same(a.owner, actor.address)).length;

  return (
    <div className="stack-lg">
      <div className="page-head">
        <h1 className="h-page">Silsilah</h1>
        <p>Setiap baris satu generasi, dan anak berada di bawah induknya. Sorot sebuah agent untuk melihat keluarganya; klik untuk menahannya.</p>
      </div>

      <div className="tree-stats" data-reveal>
        <div><b>{agents.length}</b><span>agent</span></div>
        <div><b>{view.gens.length}</b><span>generasi</span></div>
        <div><b>{agents.filter((a) => a.parents[0]).length}</b><span>lahir dari kawin</span></div>
        <div><b>{mine}</b><span>milikmu</span></div>
        <div className="legend tree-legend">
          <span><i style={{ background: "var(--teal)" }} />dari induk pertama</span>
          <span><i style={{ background: "var(--pink)" }} />dari induk kedua</span>
        </div>
      </div>

      <div className="tree-layout">
        <div className="stage tree-wrap">
          <div className="tree-canvas" style={{ width: view.W, height: view.H }} onMouseLeave={() => setFocus(null)}>
            {view.rows.map((_, r) => (
              <span key={r} className="tree-gen" style={{ top: PAD_Y + r * ROW + NODE / 2 }}>
                {view.gens[r] === 0 ? "Generasi awal" : `Generasi ${view.gens[r]}`}
              </span>
            ))}
            <svg width={view.W} height={view.H} className="tree-edges" aria-hidden>
              {agents.filter((a) => a.parents[0]).flatMap((a) => a.parents.map((p, k) => {
                if (!p || !agents.some((x) => x.id === p)) return null;
                const from = view.at(p), to = view.at(a.id);
                const on = !sel || sel.id === a.id || sel.id === p;
                const y1 = from.y + NODE / 2 + LABEL, y2 = to.y - NODE / 2 - 8, mid = (y1 + y2) / 2;
                return (
                  <path key={`${a.id}-${k}`}
                    d={`M${from.x} ${y1} C ${from.x} ${mid}, ${to.x} ${mid}, ${to.x} ${y2}`}
                    fill="none" stroke={k === 0 ? "var(--teal)" : "var(--pink)"}
                    strokeWidth={on && sel ? 2.2 : 1.5} strokeLinecap="round"
                    opacity={sel ? (on ? 0.95 : 0.08) : 0.6} />
                );
              }))}
            </svg>
            {agents.map((a) => {
              const p = view.at(a.id);
              return (
                <button
                  key={a.id} type="button"
                  className={`tree-node ${lit(a.id) ? "" : "dim"} ${pinned === a.id ? "pinned" : ""} ${same(a.owner, actor.address) ? "mine" : ""}`}
                  style={{ left: p.x, top: p.y }}
                  onMouseEnter={() => setFocus(a.id)} onFocus={() => setFocus(a.id)} onBlur={() => setFocus(null)}
                  onClick={() => setPinned(pinned === a.id ? null : a.id)}
                  aria-label={`${a.name}, generasi ${a.generation}`}
                >
                  <Cell genome={a.genome} size={NODE} alive={false} />
                  <span className="tree-name">{a.name}</span>
                  <span className="tree-meta">#{a.id}{same(a.owner, actor.address) ? " · milikmu" : ""}</span>
                </button>
              );
            })}
          </div>
        </div>

        <aside className="plate tree-detail">
          {sel ? <Detail a={sel} agents={agents} /> : (
            <div className="stack">
              <h2 className="h-sub">Pilih sebuah agent</h2>
              <p className="small muted">Arahkan kursor ke sebuah sel untuk melihat induk dan anaknya menyala. Klik untuk menahannya di sini.</p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function Detail({ a, agents }: { a: Agent; agents: Agent[] }) {
  const parents = a.parents.filter(Boolean).map((p) => agents.find((x) => x.id === p)).filter(Boolean) as Agent[];
  const kids = agents.filter((x) => x.parents.includes(a.id));
  return (
    <div className="stack">
      <div className="agent-card-top">
        <Cell genome={a.genome} size={52} />
        <div style={{ minWidth: 0 }}>
          <div className="agent-card-name">{a.name}</div>
          <div className="agent-card-meta">#{a.id} · {a.designed ? "rancangan Studio" : a.generation === 0 ? "founder" : `generasi ${a.generation}`}</div>
        </div>
      </div>
      <div className="agent-card-tags">{highlights(a, 4).map((h) => <span key={h.text} className="chip">{h.icon} {h.text}</span>)}</div>
      <Prices agent={a} />
      <dl className="tree-kin">
        <div><dt>Induk</dt><dd>{parents.length ? parents.map((p) => p.name).join(" × ") : "tidak ada (generasi awal)"}</dd></div>
        <div><dt>Anak</dt><dd>{kids.length ? kids.map((k) => k.name).join(", ") : "belum ada"}</dd></div>
      </dl>
      <div className="row">
        <Link to={`/agent/${a.id}`} className="btn btn-primary btn-sm">Buka agent</Link>
        <Link to={`/kawin?a=${a.id}`} className="btn btn-sm btn-outline">Kawinkan</Link>
      </div>
    </div>
  );
}
