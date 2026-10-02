/**
 * Dompet: saldo, royalti yang bisa ditarik, agent milikku, dan kehamilan yang
 * sedang berjalan. Di chain lokal tanpa login, keempat akun demo ditampilkan
 * supaya royalti leluhur bisa dicoba tanpa wallet sama sekali.
 */
import { useEffect, useState } from "react";
import { get, same, short } from "../api";
import { AgentCard } from "../components/agent";
import { ApiKeysCard, CreditsCard } from "../components/claude";
import { Copy, Empty, Spinner } from "../components/ui";
import { useActor } from "../hooks/use-actor";
import { useData } from "../hooks/use-data";
import { Link, useTitle } from "../router";

interface Money { pendingEth: string; pendingWei: string; balanceEth: string }

function useMoney(address?: string) {
  const { status } = useData();
  const [m, setM] = useState<Money | null>(null);
  useEffect(() => {
    if (!address) return;
    let live = true;
    get<Money>(`/api/royalty?address=${address}`).then((x) => live && setM(x)).catch(() => {});
    return () => { live = false; };
  }, [address, status?.block]);
  return m;
}

export function WalletPage() {
  useTitle("Dompet");
  const actor = useActor();
  const { agents, pregnancies, status, byId } = useData();

  if (actor.mode === "none") {
    return (
      <Empty title="Masuk untuk melihat dompetmu" action={actor.loginProblem ? undefined : <button className="btn btn-primary" onClick={actor.login}>Masuk</button>}>
        {actor.loginProblem ?? "Masuk dengan email atau Google. Wallet dibuatkan otomatis kalau kamu belum punya."}
      </Empty>
    );
  }

  const mine = agents.filter((a) => same(a.owner, actor.address));
  const going = pregnancies.filter((p) => same(p.to, actor.address) && !p.hatched).sort((x, y) => y.id - x.id);

  return (
    <div className="stack-lg">
      <div className="page-head">
        <h1 className="h-page">Dompet</h1>
        <p>Agent, saldo, dan penghasilanmu. Penghasilan datang dari penjualan, sewa, tarif kawin, dan bagian leluhur.</p>
      </div>

      <div className="wallet-top">
        <Account address={actor.address!} label={actor.label ?? "Wallet-mu"} />
        {actor.funding && (
          <div className={`banner ${actor.funding.ok ? "banner-info" : ""}`} style={{ width: "100%", margin: 0 }}>
            <div>
              {actor.funding.message}
              {!actor.funding.ok && status?.chain === "sepolia" && <> Isi Sepolia ETH ke alamatmu dari <a href="https://sepolia-faucet.pk910.de" target="_blank" rel="noreferrer noopener">faucet ini</a>.</>}
            </div>
          </div>
        )}
      </div>

      <div className="wallet-claude">
        <CreditsCard />
        <ApiKeysCard />
      </div>

      {going.length > 0 && (
        <section className="stack">
          <h2 className="h-section">Sedang dalam pembuahan</h2>
          <div className="stack">
            {going.map((p) => (
              <Link key={p.id} to={`/kawin/${p.id}`} className="plate spread preg-row">
                <span>{byId(p.parentA)?.name ?? `#${p.parentA}`} × {byId(p.parentB)?.name ?? `#${p.parentB}`}</span>
                <span className="small muted">{p.ready ? "siap menetas" : `±${p.blocksLeft} blok lagi`}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {mine.some((a) => a.sale) && (
        <section className="stack">
          <h2 className="h-section">Sedang dijual</h2>
          <div className="agent-grid">{mine.filter((a) => a.sale).map((a) => <AgentCard key={a.id} agent={a} showPrices />)}</div>
        </section>
      )}

      <section className="stack">
        <h2 className="h-section">Agent milikku ({mine.length})</h2>
        {mine.length
          ? <div className="agent-grid">{mine.map((a) => <AgentCard key={a.id} agent={a} />)}</div>
          : <Empty title="Belum ada agent" action={<div className="row" style={{ justifyContent: "center" }}>
              <Link to="/studio" className="btn btn-primary">Buat di Studio</Link><Link to="/pasar?tab=dijual" className="btn">Beli di Pasar</Link>
            </div>}>Buat agent di Studio, beli di Pasar, atau kawinkan dua agent.</Empty>}
      </section>

          </div>
  );
}

function Account({ address, label, compact }: { address: string; label: string; compact?: boolean }) {
  const actor = useActor();
  const m = useMoney(address);
  const can = Number(m?.pendingWei ?? 0) > 0 && (actor.mode === "privy" || actor.mode === "injected");
  return (
    <div className={`plate stack ${compact ? "" : "wallet-main"}`}>
      <div className="spread">
        <div>
          <div className="small">{label}</div>
          <Copy text={address} label={short(address)} />
        </div>
      </div>
      <dl className="money">
        <div><dt>Saldo</dt><dd>{m ? `${Number(m.balanceEth).toLocaleString("id-ID", { maximumFractionDigits: 4 })} ETH` : "…"}</dd></div>
        <div><dt>Penghasilan siap ditarik</dt><dd>{m ? `${m.pendingEth} ETH` : "…"}</dd></div>
      </dl>
      <button className="btn btn-sm" disabled={!can || !!actor.busy} onClick={() => actor.act("withdraw", {})}>
        {actor.busy === "withdraw" ? <Spinner /> : null}Tarik royalti
      </button>
    </div>
  );
}
