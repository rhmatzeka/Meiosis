import { useMemo, useState } from "react";
import { same } from "../api";
import { AgentCard } from "../components/agent";
import { Empty } from "../components/ui";
import { useActor } from "../hooks/use-actor";
import { useData } from "../hooks/use-data";
import { Link, useTitle } from "../router";

type Filter = "semua" | "milikku" | "founder" | "keturunan" | "terbuka";

export function CollectionPage() {
  useTitle("Koleksi");
  const { agents, loading } = useData();
  const actor = useActor();
  const [filter, setFilter] = useState<Filter>("semua");
  const [q, setQ] = useState("");

  const shown = useMemo(() => agents.filter((a) => {
    if (filter === "milikku" && !same(a.owner, actor.address)) return false;
    if (filter === "founder" && a.generation !== 0) return false;
    if (filter === "keturunan" && a.generation === 0) return false;
    if (filter === "terbuka" && !a.stud.listed) return false;
    const s = q.trim().toLowerCase();
    return !s || a.name.toLowerCase().includes(s) || String(a.id) === s.replace("#", "")
      || a.modules.some((m) => m.includes(s)) || a.traits.some((t) => t.value.includes(s));
  }).sort((x, y) => y.id - x.id), [agents, filter, q, actor.address]);

  const labels: Record<Filter, string> = { semua: "Semua", milikku: "Milikku", founder: "Founder", keturunan: "Keturunan", terbuka: "Terbuka untuk kawin" };

  return (
    <div className="stack-lg">
      <div className="page-head">
        <h1 className="h-page">Koleksi</h1>
        <p>{agents.length} agent hidup di chain ini. Klik salah satu untuk melihat sifatnya, silsilahnya, dan membawanya pulang.</p>
      </div>
      <div className="toolbar">
        <div className="segmented" role="tablist">
          {(Object.keys(labels) as Filter[]).map((f) => (
            <button key={f} role="tab" aria-selected={filter === f} onClick={() => setFilter(f)}>{labels[f]}</button>
          ))}
        </div>
        <input className="input search" placeholder="Cari nama, #id, atau sifat (mis. react)" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {loading ? <div className="skeleton" style={{ height: 300 }} />
        : shown.length ? <div className="agent-grid">{shown.map((a) => <AgentCard key={a.id} agent={a} />)}</div>
        : filter === "milikku"
          ? <Empty title="Kamu belum punya agent" action={<Link to="/kawin" className="btn btn-primary">Kawinkan agent pertamamu</Link>}>Anak dari setiap perkawinan menjadi milikmu.</Empty>
          : <Empty title="Tidak ada yang cocok">Coba kata lain atau ganti saringan.</Empty>}
    </div>
  );
}
