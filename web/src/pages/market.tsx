/**
 * Pasar: semua agent yang hidup di chain ini, dengan harganya. Orang datang
 * ke sini untuk mencari agent yang bisa dibeli, disewa untuk satu tugas, atau
 * dijadikan induk.
 */
import { useMemo, useState } from "react";
import { same, type Agent } from "../api";
import { AgentCard } from "../components/agent";
import { Empty } from "../components/ui";
import { useActor } from "../hooks/use-actor";
import { useData } from "../hooks/use-data";
import { Link, navigate, useLocation, useTitle } from "../router";

type Tab = "semua" | "dijual" | "sewa" | "kawin" | "milikku";
type Sort = "terbaru" | "termurah" | "terlaris";

const TABS: Record<Tab, string> = { semua: "Semua", dijual: "Dijual", sewa: "Bisa disewa", kawin: "Bisa dikawinkan", milikku: "Milikku" };
const SORTS: Record<Sort, string> = { terbaru: "Terbaru", termurah: "Termurah", terlaris: "Terlaris" };

/** Harga yang dipakai untuk mengurutkan: harga jual bila dijual, selain itu harga sewa. */
const priceOf = (a: Agent, tab: Tab) =>
  tab === "kawin" ? BigInt(a.stud.feeWei)
  : tab === "sewa" ? BigInt(a.rent.priceWei)
  : a.sale ? BigInt(a.sale.priceWei) : BigInt(a.rent.priceWei);

export function MarketPage() {
  useTitle("Pasar");
  const { agents, loading } = useData();
  const actor = useActor();
  const { query } = useLocation();
  const tab = (query.get("tab") as Tab) in TABS ? (query.get("tab") as Tab) : "semua";
  const [sort, setSort] = useState<Sort>("terbaru");
  const [q, setQ] = useState("");

  const setTab = (t: Tab) => navigate(t === "semua" ? "/pasar" : `/pasar?tab=${t}`, { replace: true });

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return agents.filter((a) => {
      if (tab === "dijual" && !a.sale) return false;
      if (tab === "kawin" && !a.stud.listed) return false;
      if (tab === "milikku" && !same(a.owner, actor.address)) return false;
      return !s || a.name.toLowerCase().includes(s) || String(a.id) === s.replace("#", "")
        || a.modules.some((m) => m.includes(s)) || a.traits.some((t) => t.value.includes(s));
    }).sort((x, y) =>
      sort === "terlaris" ? y.breedCount - x.breedCount || y.id - x.id
      : sort === "termurah" ? Number(priceOf(x, tab) - priceOf(y, tab)) || y.id - x.id
      : y.id - x.id);
  }, [agents, tab, sort, q, actor.address]);

  const forSale = agents.filter((a) => a.sale).length;

  return (
    <div className="stack-lg">
      <div className="page-head">
        <h1 className="h-page">Pasar agent</h1>
        <p>
          {agents.length} agent hidup di sini{forSale ? `, ${forSale} sedang dijual` : ""}. Beli agent untuk dimiliki,
          sewa untuk satu tugas, atau jadikan induk untuk membiakkan agent baru.
          Belum paham? Baca <Link to="/panduan">panduannya</Link>.
        </p>
      </div>

      <div className="toolbar">
        <div className="segmented" role="tablist">
          {(Object.keys(TABS) as Tab[]).map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>{TABS[t]}</button>
          ))}
        </div>
        <select className="input select sort" value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Urutkan">
          {(Object.keys(SORTS) as Sort[]).map((s) => <option key={s} value={s}>{SORTS[s]}</option>)}
        </select>
        <input className="input search" placeholder="Cari nama, #id, atau sifat (mis. react)" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {loading ? <div className="skeleton" style={{ height: 300 }} />
        : shown.length ? <div className="agent-grid">{shown.map((a) => <AgentCard key={a.id} agent={a} showPrices />)}</div>
        : tab === "milikku"
          ? <Empty title="Kamu belum punya agent" action={<div className="row" style={{ justifyContent: "center" }}>
              <Link to="/studio" className="btn btn-primary">Buat di Studio</Link>
              <Link to="/kawin" className="btn">Kawinkan</Link>
            </div>}>Buat agent pertamamu di Studio, atau kawinkan dua agent yang ada.</Empty>
          : tab === "dijual"
            ? <Empty title="Belum ada yang dijual">Pemilik agent bisa memasang harga dari halaman agent-nya.</Empty>
            : <Empty title="Tidak ada yang cocok">Coba kata lain atau ganti tab.</Empty>}

      <p className="xs dim">Ingin melihat agent mana yang paling bagus hasil kerjanya? Lihat <Link to="/arena">Arena</Link>.</p>
    </div>
  );
}
