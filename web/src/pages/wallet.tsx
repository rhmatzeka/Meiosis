/**
 * Dompet: saldo, royalti yang bisa ditarik, agent milikku, dan kehamilan yang
 * sedang berjalan. Di chain lokal tanpa login, keempat akun demo ditampilkan
 * supaya royalti leluhur bisa dicoba tanpa wallet sama sekali.
 */
import { useEffect, useState } from "react";
import { get, same, short } from "../api";
import { AgentCard } from "../components/agent";
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
      <Empty title="Masuk untuk melihat dompetmu" action={<button className="btn btn-primary" onClick={actor.login}>Masuk</button>}>
        Masuk dengan email atau Google. Wallet dibuatkan otomatis kalau kamu belum punya.
      </Empty>
    );
  }

  const mine = agents.filter((a) => same(a.owner, actor.address));
  const going = pregnancies.filter((p) => same(p.to, actor.address) && !p.hatched).sort((x, y) => y.id - x.id);
  const demo = actor.mode === "demo";

  return (
    <div className="stack-lg">
      <div className="page-head">
        <h1 className="h-page">Dompet</h1>
        <p>{demo ? "Kamu belum masuk. Di chain lokal kamu bertindak sebagai Alice, salah satu akun demo." : "Agent, saldo, dan royalti milikmu."}</p>
      </div>

      <div className="wallet-top">
        <Account address={actor.address!} label={actor.label ?? "Wallet-mu"} as={demo ? actor.address : undefined} />
        {actor.funding && (
          <div className={`banner ${actor.funding.ok ? "banner-info" : ""}`} style={{ width: "100%", margin: 0 }}>
            <div>
              {actor.funding.message}
              {!actor.funding.ok && status?.chain === "sepolia" && <> Isi Sepolia ETH ke alamatmu dari <a href="https://sepolia-faucet.pk910.de" target="_blank" rel="noreferrer noopener">faucet ini</a>.</>}
            </div>
          </div>
        )}
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

      <section className="stack">
        <h2 className="h-section">Agent milikku ({mine.length})</h2>
        {mine.length
          ? <div className="agent-grid">{mine.map((a) => <AgentCard key={a.id} agent={a} />)}</div>
          : <Empty title="Belum ada agent" action={<Link to="/kawin" className="btn btn-primary">Kawinkan agent pertamamu</Link>}>Setiap anak yang lahir dari perkawinanmu menjadi milikmu.</Empty>}
      </section>

      {demo && status && (
        <section className="stack">
          <h2 className="h-section">Akun demo lain</h2>
          <p className="small muted">Setiap bayaran ke sebuah agent, sewa atau tarif kawin, mengalir 5% ke pemilik induknya, 2,5% ke kakek-neneknya, dan seterusnya sampai empat generasi.</p>
          <div className="wallet-accounts">
            {status.accounts.filter((x) => !same(x.address, actor.address)).map((x) => (
              <Account key={x.address} address={x.address} label={x.name} as={x.address} compact />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Account({ address, label, as, compact }: { address: string; label: string; as?: string; compact?: boolean }) {
  const actor = useActor();
  const m = useMoney(address);
  const can = Number(m?.pendingWei ?? 0) > 0 && (!!as || actor.mode === "privy" || actor.mode === "injected");
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
        <div><dt>Royalti siap ditarik</dt><dd>{m ? `${m.pendingEth} ETH` : "…"}</dd></div>
      </dl>
      <button className="btn btn-sm" disabled={!can || !!actor.busy} onClick={() => actor.act("withdraw", {}, { as })}>
        {actor.busy === "withdraw" ? <Spinner /> : null}Tarik royalti
      </button>
    </div>
  );
}
