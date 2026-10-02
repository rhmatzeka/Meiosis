/** Potongan tampilan tentang satu agent: kartu, sifat, dan label pemilik. */
import { TRAITS } from "../../../packages/shared/src/genome";
import type { Agent } from "../api";
import { useActor } from "../hooks/use-actor";
import { useData } from "../hooks/use-data";
import type { GeneOrigin } from "../lib/genetics";
import { cooldownLabel } from "../lib/genetics";
import { originLabel, ownerLabel, priceText, summaryLine, traitChips } from "../lib/describe";
import { LOCI, traitLabel } from "../lib/traits";
import { Link } from "../router";
import { Cell } from "./ui";

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
  const actor = useActor();
  const { byId } = useData();
  const body = (
    <>
      <div className="agent-card-top">
        <Cell genome={agent.genome} size={44} alive={false} />
        <div style={{ minWidth: 0 }}>
          <div className="agent-card-name">{agent.name} <span className="agent-card-id">#{agent.id}</span></div>
          <div className="agent-card-meta">{originLabel(agent)} · {ownerLabel(agent.owner, actor.address)}</div>
        </div>
      </div>
      <p className="agent-card-summary">{summaryLine(agent, (id) => byId(id)?.name)}</p>
      <div className="agent-card-tags">
        {traitChips(agent).map((t) => <span key={t} className="chip">{t}</span>)}
      </div>
      {agent.hidden && <span className="chip chip-danger">disembunyikan admin</span>}
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
      {agent.sale && <span className="price price-sale"><small>Dijual{agent.sale.changedAfterListing ? " · otak diubah setelah dipasang" : ""}</small>{eth(agent.sale.priceEth)}</span>}
      <span className="price"><small>Sewa per tugas</small>{rent > 0n ? priceText(agent.rent.priceWei) : "pakai jatah gratis"}</span>
      {agent.stud.listed && <span className="price"><small>Tarif kawin</small>{BigInt(agent.stud.feeWei) > 0n ? priceText(agent.stud.feeWei) : "tanpa tarif"}</span>}
    </div>
  );
}
