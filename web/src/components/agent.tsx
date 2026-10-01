/** Potongan tampilan tentang satu agent: kartu, sifat, dan label pemilik. */
import { TRAITS } from "../../../packages/shared/src/genome";
import { same, type Agent } from "../api";
import { useActor } from "../hooks/use-actor";
import { useData } from "../hooks/use-data";
import type { GeneOrigin } from "../lib/genetics";
import { cooldownLabel } from "../lib/genetics";
import { LOCI, traitLabel } from "../lib/traits";
import { Link } from "../router";
import { Cell } from "./ui";

/** Sifat yang paling menonjol, dari trait yang punya modul skill. */
export function highlights(a: Agent, max = 3) {
  const t = Object.fromEntries(a.traits.map((x) => [x.locus, x.value]));
  const out: { icon: string; text: string }[] = [];
  if (t[6] === "high") out.push({ icon: "🛡", text: "aman" });
  if (t[5] === "high") out.push({ icon: "🧪", text: "teliti" });
  if (t[4] === "high") out.push({ icon: "🎨", text: "estetik" });
  if (t[14] === "high") out.push({ icon: "🔁", text: "tekun" });
  const stack = { react: "React", solidity: "Solidity", python: "Python" }[t[3] as string];
  if (stack) out.push({ icon: "⚙️", text: stack });
  const disc = { code: "kode", design: "desain", research: "riset", security: "keamanan", data: "data" }[t[1] as string];
  if (disc && out.length < max) out.push({ icon: "🎯", text: disc });
  if (t[0] === "strong" && out.length < max) out.push({ icon: "🧠", text: "otak kuat" });
  return out.slice(0, max);
}

export function useOwnerLabel() {
  const actor = useActor();
  return (a: Agent) => (same(a.owner, actor.address) ? "milikmu" : a.ownerName);
}

export function useCooldown(a: Agent | undefined) {
  const { status } = useData();
  if (!a || !status?.block) return null;
  return cooldownLabel(a.readyAtBlock, status.block, status.secPerBlock);
}

export function AgentCard({ agent, to, onPick, pickedAs, disabledReason, note, showPrices }: {
  agent: Agent;
  to?: string;
  onPick?: () => void;
  pickedAs?: "a" | "b";
  disabledReason?: string | null;
  note?: string | null;
  showPrices?: boolean;
}) {
  const owner = useOwnerLabel();
  const body = (
    <>
      <div className="agent-card-top">
        <Cell genome={agent.genome} size={44} alive={false} />
        <div style={{ minWidth: 0 }}>
          <div className="agent-card-name">{agent.name}</div>
          <div className="agent-card-meta">#{agent.id} · {agent.designed ? "rancangan Studio" : `generasi ${agent.generation}`} · {owner(agent)}</div>
        </div>
      </div>
      <div className="agent-card-tags">
        {highlights(agent).map((h) => <span key={h.text} className="chip">{h.icon} {h.text}</span>)}
      </div>
      {showPrices && <Prices agent={agent} />}
      {(disabledReason || note) && <div className="agent-card-note">{disabledReason ?? note}</div>}
    </>
  );
  const cls = `agent-card ${pickedAs === "a" ? "is-a" : pickedAs === "b" ? "is-b" : ""}`;
  if (onPick) {
    return <button type="button" className={cls} onClick={onPick} disabled={!!disabledReason} aria-pressed={!!pickedAs}>{body}</button>;
  }
  return <Link to={to ?? `/agent/${agent.id}`} className={cls}>{body}</Link>;
}

/** Daftar sifat dalam bahasa awam. Dengan `origin`, tiap sifat diberi asalnya. */
export function TraitList({ agent, origin, names, all }: {
  agent: Agent; origin?: GeneOrigin[]; names?: { a: string; b: string }; all?: boolean;
}) {
  return (
    <div className={origin ? "traits" : "traits traits-cols"}>
      {LOCI.filter((l) => l.values.length > 1 && (all || l.matters)).map((l) => {
        const g = origin?.[l.index];
        const tid = g?.trait ?? traitIdOf(agent, l.index);
        return (
          <div key={l.index}>
            <span className="ic" aria-hidden>{l.icon}</span>
            <span>{l.label} <span className="v">{traitLabel(l.index, tid)}</span></span>
            {g && names ? (
              <span className={`xs ${g.mutated ? "from-m" : g.from === "a" ? "from-a" : "from-b"}`}>
                {g.mutated ? "mutasi" : `dari ${g.from === "a" ? names.a : names.b}`}
              </span>
            ) : <span />}
          </div>
        );
      })}
    </div>
  );
}

/** traitId dari nama trait server (mis. "high") untuk lokus tertentu. */
export const traitIdOf = (a: Agent, locus: number) => {
  const v = a.traits.find((t) => t.locus === locus)?.value;
  return Math.max(0, TRAITS[locus].indexOf(v ?? ""));
};

const eth = (v: string) => `${Number(v).toLocaleString("id-ID", { maximumFractionDigits: 4 })} ETH`;

/** Harga yang relevan untuk pembeli: jual, sewa per tugas, dan kawin. */
export function Prices({ agent }: { agent: Agent }) {
  const rent = BigInt(agent.rent.priceWei);
  return (
    <div className="prices">
      {agent.sale && <span className="price price-sale"><small>Dijual</small>{eth(agent.sale.priceEth)}</span>}
      <span className="price"><small>Sewa/tugas</small>{rent > 0n ? eth(agent.rent.priceEth) : "gratis"}</span>
      {agent.stud.listed && <span className="price"><small>Kawin</small>{BigInt(agent.stud.feeWei) > 0n ? eth(agent.stud.feeEth) : "gratis"}</span>}
    </div>
  );
}
