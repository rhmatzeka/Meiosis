import { useState } from "react";
import { same } from "../api";
import { AgentCard, TraitList, highlights, useCooldown, useOwnerLabel } from "../components/agent";
import { ClaudeDialog, useDownloadFull } from "../components/claude";
import { NameDialog, RentPriceDialog, SellDialog, StudDialog } from "../components/dialogs";
import { Cell, Copy, Empty, GenomeStrip, Spinner } from "../components/ui";
import { useActor } from "../hooks/use-actor";
import { useData } from "../hooks/use-data";
import { Link, useLocation, useTitle } from "../router";

type Dialog = "name" | "stud" | "sell" | "rent" | "claude" | null;

export function AgentPage({ id }: { id: number }) {
  const { byId, agents, loading, status } = useData();
  const actor = useActor();
  const owner = useOwnerLabel();
  const a = byId(id);
  const cooldown = useCooldown(a);
  const [dialog, setDialog] = useState<Dialog>(null);
  const full = useDownloadFull();
  const { query } = useLocation();
  useTitle(a?.name ?? `Agent #${id}`);

  if (loading) return <div className="skeleton" style={{ height: 480 }} />;
  if (!a) return <Empty title={`Agent #${id} tidak ada di chain ini`} action={<Link to="/koleksi" className="btn">Lihat koleksi</Link>} />;

  const mine = same(a.owner, actor.address);
  const canManage = mine && actor.mode !== "none";
  const parents = a.parents[0] ? [byId(a.parents[0]), byId(a.parents[1])] : [];
  const children = agents.filter((x) => x.parents.includes(a.id));
  const verified = a.manifestHashOnChain === a.manifestHashComputed;
  const unrecorded = /^0x0+$/.test(a.manifestHashOnChain);
  const tierName = { fast: "cepat", balanced: "seimbang", strong: "kuat" }[a.modelTier];

  return (
    <div className="stack-lg">
      <section className="stage agent-hero">
        <Cell genome={a.genome} size={148} />
        <div className="stack" style={{ gap: 10, minWidth: 0 }}>
          <h1 className="h-page">{a.name}</h1>
          <p className="muted">
            Agent #{a.id}, {a.designed ? "rancangan Studio" : a.generation === 0 ? "generasi pertama (founder)" : `generasi ${a.generation}`}, {owner(a) === "milikmu" ? "milikmu" : `dimiliki ${owner(a)}`}.
          </p>
          <div className="row" style={{ gap: 8 }}>
            {highlights(a, 5).map((h) => <span key={h.text} className="chip">{h.icon} {h.text}</span>)}
          </div>
          <div className="row" style={{ gap: 8 }}>
            {a.stud.listed
              ? <span className="chip chip-teal">terbuka untuk kawin · {Number(a.stud.feeEth) > 0 ? `${a.stud.feeEth} ETH` : "gratis"}</span>
              : <span className="chip chip-dim">tertutup untuk kawin</span>}
            {cooldown && <span className="chip chip-gold">{cooldown}</span>}
            {a.sale && <span className="chip chip-gold">dijual {a.sale.priceEth} ETH</span>}
            {a.soulFrom.length > 0 && (
              <span className="chip chip-accent" title="Isi instruksinya rahasia; hanya pemilik yang bisa mengunduhnya.">
                ✍ instruksi khusus{a.soulHash ? "" : ` warisan ${a.soulFrom.map((i) => `#${i}`).join(", ")}`}
              </span>
            )}
          </div>
        </div>
      </section>

      {query.has("baru") && mine && (
        <div className="banner banner-info" style={{ width: "100%", margin: 0 }}>
          <div><b>{a.name} sudah jadi dan milikmu.</b> Beri tugas, jual, sewakan, atau kawinkan untuk mendapat keturunan yang lebih unggul.</div>
        </div>
      )}

      <div className="agent-body">
        <section className="stack-lg">
          <div className="plate stack">
            <h2 className="h-sub">Sifat</h2>
            <GenomeStrip agent={a} large />
            <TraitList agent={a} all />
          </div>

          {(parents.length > 0 || children.length > 0) && (
            <div className="stack">
              {parents.length > 0 && <>
                <h2 className="h-sub">Induk</h2>
                <div className="agent-grid">{parents.map((p) => p && <AgentCard key={p.id} agent={p} />)}</div>
              </>}
              {children.length > 0 && <>
                <h2 className="h-sub">Anak ({children.length})</h2>
                <div className="agent-grid">{children.map((c) => <AgentCard key={c.id} agent={c} />)}</div>
              </>}
            </div>
          )}
        </section>

        <aside className="stack agent-side">
          <div className="plate stack">
            <h2 className="h-sub">Pakai agent ini</h2>
            {a.sale && !mine && (
              <button className="btn btn-primary" disabled={!!actor.busy} onClick={() => actor.mode === "none" ? actor.login() : actor.act("buy", { id: a.id })}>
                {actor.busy === "buy" ? <Spinner /> : null}Beli · {a.sale.priceEth} ETH
              </button>
            )}
            <Link to={`/tugas?id=${a.id}`} className={`btn ${a.sale && !mine ? "" : "btn-primary"}`}>
              Beri tugas{BigInt(a.rent.priceWei) > 0n && !mine ? ` · ${a.rent.priceEth} ETH` : ""}
            </Link>
            <Link to={`/kawin?a=${a.id}`} className="btn">Kawinkan dengan…</Link>
            <button className="btn" onClick={() => setDialog("claude")}>Pakai di Claude Code</button>
            {mine && actor.mode !== "none" && (
              <button className="btn btn-outline" disabled={full.busy} onClick={() => full.download(a)}>{full.busy ? <Spinner /> : null}Unduh .md lengkap</button>
            )}
            <p className="xs muted">{mine ? "Berkas lengkap berlisensi atas namamu dan diberi watermark; jangan dibagikan." : "Agent bekerja di server Meiosis; pemakaian dibayar per tugas."}</p>
          </div>

          {canManage && (
            <div className="plate stack owner-actions">
              <h2 className="h-sub">Milikmu</h2>
              <button className="btn" onClick={() => setDialog("sell")} disabled={!status?.market}>{a.sale ? "Ubah harga jual" : "Jual"}</button>
              {a.sale && (
                <button className="btn btn-quiet" disabled={!!actor.busy} onClick={() => actor.act("cancelListing", { id: a.id })}>Batal jual</button>
              )}
              <button className="btn" onClick={() => setDialog("rent")} disabled={!status?.market}>
                Harga sewa · {BigInt(a.rent.ownerPriceWei) > 0n ? `${a.rent.priceEth} ETH` : "bawaan"}
              </button>
              <button className="btn" onClick={() => setDialog("name")}>Beri nama</button>
              <button className="btn" onClick={() => setDialog("stud")}>{a.stud.listed ? "Ubah tarif kawin" : "Buka untuk kawin"}</button>
              {a.stud.listed && (
                <button className="btn btn-quiet" disabled={!!actor.busy} onClick={() => actor.act("unlistStud", { id: a.id })}>Tutup untuk kawin</button>
              )}
              {!verified && (
                <button className="btn btn-quiet" disabled={!!actor.busy} onClick={() => actor.act("setManifestHash", { id: a.id })}>
                  {actor.busy === "setManifestHash" ? <Spinner /> : null}Catat manifest ke chain
                </button>
              )}
            </div>
          )}

          <details className="tech plate">
            <summary>Detail teknis</summary>
            <dl>
              <dt>genome</dt><dd><Copy text={a.genome} label={`${a.genome.slice(0, 18)}…`} /></dd>
              <dt>otak</dt><dd>{tierName} · suhu {a.params.temperature} · {a.params.maxTokens} token · {a.params.maxSteps} langkah</dd>
              <dt>modul</dt><dd>{a.modules.join(", ") || "—"}</dd>
              <dt>manifest</dt><dd>{a.manifestHashComputed}</dd>
              <dt>di chain</dt><dd>{unrecorded ? "belum dicatat" : verified ? "✓ cocok" : `✗ berbeda (${a.manifestHashOnChain})`}</dd>
              <dt>pemilik</dt><dd><Copy text={a.owner} /></dd>
              <dt>lahir di blok</dt><dd>{a.birthBlock}</dd>
              {status?.explorer && status.deployed && <><dt>explorer</dt><dd><a href={`${status.explorer}/address/${a.owner}`} target="_blank" rel="noreferrer noopener">lihat pemilik</a></dd></>}
              <dt>verifikasi</dt><dd>bun run verify-agent {`meiosis-${a.id}.lengkap.md`}</dd>
            </dl>
            <p className="xs"><a href={`/api/agents/${a.id}/manifest.json`} download>Unduh manifest.json</a></p>
          </details>
        </aside>
      </div>

      {dialog === "name" && <NameDialog agent={a} onClose={() => setDialog(null)} />}
      {dialog === "stud" && <StudDialog agent={a} onClose={() => setDialog(null)} />}
      {dialog === "sell" && <SellDialog agent={a} onClose={() => setDialog(null)} />}
      {dialog === "claude" && <ClaudeDialog agent={a} onClose={() => setDialog(null)} />}
      {dialog === "rent" && <RentPriceDialog agent={a} onClose={() => setDialog(null)} />}
    </div>
  );
}
