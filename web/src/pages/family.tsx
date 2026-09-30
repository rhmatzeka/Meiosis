/**
 * Pohon keluarga: satu baris per generasi, garis dari induk ke anak. Garis dari
 * induk pertama berwarna teal, dari induk kedua pink — kode warna yang sama
 * dengan pita genome.
 */
import { useMemo, useState } from "react";
import { same } from "../api";
import { Cell, Empty } from "../components/ui";
import { useActor } from "../hooks/use-actor";
import { useData } from "../hooks/use-data";
import { cellLook } from "../lib/look";
import { navigate, useTitle } from "../router";

const COL = 132, ROW = 170, R = 26, PAD = 60;

export function FamilyPage() {
  useTitle("Silsilah");
  const { agents, loading } = useData();
  const actor = useActor();
  const [hover, setHover] = useState<number | null>(null);

  const layout = useMemo(() => {
    const byGen = new Map<number, typeof agents>();
    for (const a of [...agents].sort((x, y) => x.id - y.id)) byGen.set(a.generation, [...(byGen.get(a.generation) ?? []), a]);
    const gens = [...byGen.keys()].sort((x, y) => x - y);
    const widest = Math.max(1, ...gens.map((g) => byGen.get(g)!.length));
    const W = Math.max(640, widest * COL + PAD * 2);
    const pos = new Map<number, { x: number; y: number }>();
    gens.forEach((g, gi) => {
      const row = byGen.get(g)!;
      row.forEach((a, i) => pos.set(a.id, { x: PAD + ((i + 0.5) * (W - PAD * 2)) / row.length, y: PAD + gi * ROW }));
    });
    const H = PAD + (gens.length - 1) * ROW + PAD + 30;
    return { W, H, pos, gens: gens.length };
  }, [agents]);

  if (loading) return <div className="skeleton" style={{ height: 400 }} />;
  if (!agents.length) return <Empty title="Belum ada agent" />;

  const related = (id: number) => {
    if (hover === null) return true;
    const h = agents.find((a) => a.id === hover);
    return id === hover || h?.parents.includes(id) || agents.find((a) => a.id === id)?.parents.includes(hover);
  };

  return (
    <div className="stack-lg">
      <div className="page-head">
        <h1 className="h-page">Silsilah</h1>
        <p>Setiap baris satu generasi. Garis teal dari induk pertama, pink dari induk kedua. Arahkan ke sebuah agent untuk menyorot keluarganya, klik untuk membukanya.</p>
      </div>
      <div className="stage tree-wrap">
        <svg className="tree" viewBox={`0 0 ${layout.W} ${layout.H}`} style={{ minWidth: Math.min(layout.W, 900) }} role="img" aria-label="Pohon keluarga agent">
          <defs>
            {agents.map((a) => {
              const l = cellLook(BigInt(a.genome));
              return (
                <radialGradient key={a.id} id={`g${a.id}`} cx=".34" cy=".3" r=".75">
                  <stop offset="0" stopColor={`hsl(${l.h} 100% 94%)`} />
                  <stop offset=".38" stopColor={`hsl(${l.h} ${l.sat}% 64%)`} />
                  <stop offset="1" stopColor={`hsl(${l.h2} 60% 14%)`} />
                </radialGradient>
              );
            })}
          </defs>
          {agents.filter((a) => a.parents[0]).flatMap((a) => a.parents.map((p, k) => {
            const from = layout.pos.get(p), to = layout.pos.get(a.id);
            if (!from || !to) return null;
            const on = hover === null || hover === a.id || hover === p;
            return (
              <path key={`${a.id}-${k}`}
                d={`M${from.x} ${from.y + R} C ${from.x} ${from.y + ROW / 2}, ${to.x} ${to.y - ROW / 2}, ${to.x} ${to.y - R}`}
                fill="none" stroke={k === 0 ? "var(--teal)" : "var(--pink)"} strokeWidth={on ? 2 : 1.2}
                opacity={on ? 0.75 : 0.12} />
            );
          }))}
          {agents.map((a) => {
            const p = layout.pos.get(a.id)!;
            const mine = same(a.owner, actor.address);
            return (
              <g key={a.id} className="tree-node" opacity={related(a.id) ? 1 : 0.25}
                onMouseEnter={() => setHover(a.id)} onMouseLeave={() => setHover(null)}
                onClick={() => navigate(`/agent/${a.id}`)}
                tabIndex={0} role="link" aria-label={`${a.name}, generasi ${a.generation}`}
                onKeyDown={(e) => e.key === "Enter" && navigate(`/agent/${a.id}`)}>
                {mine && <circle cx={p.x} cy={p.y} r={R + 5} fill="none" stroke="var(--teal)" strokeDasharray="3 4" />}
                <circle cx={p.x} cy={p.y} r={R} fill={`url(#g${a.id})`} />
                <text x={p.x} y={p.y + R + 18} textAnchor="middle" className="tree-name">{a.name}</text>
                <text x={p.x} y={p.y + R + 33} textAnchor="middle" className="tree-meta">#{a.id}{mine ? " · milikmu" : ""}</text>
              </g>
            );
          })}
        </svg>
      </div>
      <p className="xs dim"><Cell genome={agents[0].genome} size={10} alive={false} style={{ display: "inline-block", verticalAlign: "middle" }} /> Lingkaran putus-putus menandai agent milikmu.</p>
    </div>
  );
}
