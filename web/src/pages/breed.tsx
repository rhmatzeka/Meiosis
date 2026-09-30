/**
 * Alur utama: pilih induk → pembuahan → lahir.
 *
 * `/kawin?a=&b=` adalah langkah memilih; `/kawin/:pid` adalah kehamilan yang
 * sedang berjalan dan otomatis berubah menjadi layar kelahiran. Karena
 * statusnya dibaca dari chain, halaman itu aman di-refresh dan dibagikan.
 */
import { useEffect, useMemo, useState } from "react";
import { formatEther } from "viem";
import { get, same, type Agent, type Pregnancy } from "../api";
import { AgentCard, TraitList, highlights, useCooldown } from "../components/agent";
import { NameDialog } from "../components/dialogs";
import { Cell, Empty, GenomeStrip, Legend, Spinner, Stepper } from "../components/ui";
import { useActor } from "../hooks/use-actor";
import { useData } from "../hooks/use-data";
import { canPickParent, cooldownLabel, geneOrigin, inheritanceOdds } from "../lib/genetics";
import { LOCI, traitLabel } from "../lib/traits";
import { Link, navigate, useLocation, useTitle } from "../router";

const GESTATION = 5;

export function BreedPage({ pid }: { pid?: number }) {
  return pid ? <Pregnant pid={pid} /> : <Pick />;
}

// --- 1. pilih induk -----------------------------------------------------------

function Pick() {
  useTitle("Kawinkan");
  const { agents, byId, status, loading, refresh } = useData();
  const actor = useActor();
  const { query } = useLocation();
  const a = byId(Number(query.get("a"))), b = byId(Number(query.get("b")));
  const [sending, setSending] = useState(false);

  const setPair = (na?: Agent, nb?: Agent) => {
    const q = new URLSearchParams();
    if (na) q.set("a", String(na.id));
    if (nb) q.set("b", String(nb.id));
    navigate(`/kawin${q.size ? "?" + q : ""}`, { replace: true });
  };

  const pick = (x: Agent) => {
    if (a?.id === x.id) return setPair(b, undefined);
    if (b?.id === x.id) return setPair(a, undefined);
    const next: [Agent | undefined, Agent] | [Agent, Agent] = !a ? [x, b as Agent] : [a, x];
    setPair(next[0], next[1]);
    // Pasangan lengkap: bawa layar kembali ke peluang dan tombol Kawinkan (penting di ponsel).
    if (next[0] && next[1]) requestAnimationFrame(() => document.querySelector(".breed-stage")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  const cdA = useCooldown(a), cdB = useCooldown(b);
  const due = [a, b].reduce((s, x) => s + (x && !same(x.owner, actor.address) ? BigInt(x.stud.feeWei) : 0n), 0n);

  const breed = async () => {
    if (!a || !b) return;
    if (actor.mode === "none") { actor.login(); return; }
    setSending(true);
    const r = await actor.act("breed", { a: a.id, b: b.id }, { quietSuccess: true });
    if (r) {
      const ps = await get<Pregnancy[]>("/api/pregnancies?fresh=1").catch(() => []);
      const mine = ps.filter((p) => p.parentA === a.id && p.parentB === b.id && same(p.to, actor.address)).sort((x, y) => y.id - x.id)[0];
      await refresh(true);
      if (mine) { navigate(`/kawin/${mine.id}`); return; }
    }
    setSending(false);
  };

  if (loading) return <div className="skeleton" style={{ height: 420 }} />;
  if (!agents.length) return <Empty title="Belum ada agent">Pasang kontrak dulu lewat banner di atas.</Empty>;

  const cantLogin = actor.mode === "none" && !!actor.loginProblem;
  const blocked = !a || !b || !!cdA || !!cdB || sending || !!actor.busy || cantLogin;
  const gasNote = actor.mode === "demo" ? "Akun demo, tanpa biaya."
    : status?.faucet.enabled ? "Biaya jaringan ditanggung untuk transaksi pertamamu."
    : "Kamu membayar biaya jaringan yang kecil.";

  return (
    <div className="stack-lg">
      <div className="page-head">
        <Stepper step={1} />
        <h1 className="h-page">Pilih dua induk</h1>
        <p>Klik dua agent di bawah. Sifat yang dominan pada salah satu induk hampir pasti turun; sifat yang tersembunyi bisa muncul atau hilang.</p>
      </div>

      <section className="stage breed-stage">
        <div className="pair">
          <Slot agent={a} role="a" cooldown={cdA} onClear={() => setPair(undefined, b)} />
          <span className="pair-x" aria-hidden>×</span>
          <Slot agent={b} role="b" cooldown={cdB} onClear={() => setPair(a, undefined)} />
        </div>

        {a && b ? <OddsTable a={a} b={b} /> : (
          <p className="muted small pair-hint">{a || b ? "Pilih satu induk lagi untuk melihat peluang warisannya." : "Belum ada induk yang dipilih."}</p>
        )}

        <div className="breed-go">
          <button className="btn btn-primary btn-lg" disabled={blocked} onClick={breed}>
            {sending ? <><Spinner />Mengawinkan…</> : actor.mode === "none" ? "Masuk untuk mengawinkan" : "Kawinkan"}
          </button>
          {cantLogin && <span className="small" style={{ color: "var(--danger)" }}>{actor.loginProblem}</span>}
          <span className="small muted">
            {due > 0n ? `Tarif kawin ${formatEther(due)} ETH. ` : a && b ? "Tarif kawin gratis. " : ""}{gasNote}
          </span>
        </div>
      </section>

      <section className="stack">
        <h2 className="h-section">Koleksi</h2>
        <div className="agent-grid">
          {agents.map((x) => {
            const cd = cooldownLabel(x.readyAtBlock, status?.block ?? 0, status?.secPerBlock ?? 12);
            const picked = a?.id === x.id ? "a" : b?.id === x.id ? "b" : undefined;
            const can = picked ? { ok: true } : canPickParent({ id: x.id, owner: x.owner, studListed: x.stud.listed }, [], actor.address);
            return (
              <AgentCard
                key={x.id} agent={x} onPick={() => pick(x)} pickedAs={picked}
                disabledReason={can.ok ? null : `Tidak bisa dipilih: ${can.reason}`}
                note={cd ?? (x.stud.listed && BigInt(x.stud.feeWei) > 0n && !same(x.owner, actor.address) ? `Tarif ${x.stud.feeEth} ETH` : null)}
              />
            );
          })}
        </div>
      </section>
    </div>
  );
}

function Slot({ agent, role, cooldown, onClear }: { agent?: Agent; role: "a" | "b"; cooldown: string | null; onClear: () => void }) {
  if (!agent) {
    return (
      <div className={`slot slot-empty slot-${role}`}>
        <span className="slot-ghost" aria-hidden />
        <span className="small muted">{role === "a" ? "Induk pertama" : "Induk kedua"}</span>
      </div>
    );
  }
  return (
    <div className={`slot slot-${role}`}>
      <Cell genome={agent.genome} size={88} />
      <div className="slot-name">{agent.name}</div>
      <div className="agent-card-tags" style={{ justifyContent: "center" }}>
        {highlights(agent, 2).map((h) => <span key={h.text} className="chip">{h.icon} {h.text}</span>)}
      </div>
      {cooldown && <div className="xs" style={{ color: "var(--gold)" }}>{cooldown}</div>}
      <button className="btn btn-quiet btn-sm" onClick={onClear}>Ganti</button>
    </div>
  );
}

function OddsTable({ a, b }: { a: Agent; b: Agent }) {
  const odds = useMemo(() => inheritanceOdds(BigInt(a.genome), BigInt(b.genome)), [a.genome, b.genome]);
  return (
    <div className="odds-wrap">
      <h3 className="h-sub">Peluang sifat anak</h3>
      <div className="odds">
        {LOCI.filter((l) => l.matters).map((l) => {
          const o = odds[l.index].odds;
          const top = o[0];
          return (
            <div className="odds-row" key={l.index}>
              <span>{l.icon} {l.label} <b>{traitLabel(l.index, top.trait)}</b>
                {o.length > 1 && <span className="dim xs"> atau {o.slice(1).map((x) => traitLabel(l.index, x.trait)).join(", ")}</span>}
              </span>
              <div className="track"><b style={{ width: `${top.p * 100}%` }} /></div>
              <span className="v">{top.p === 1 ? "pasti" : `${Math.round(top.p * 100)}%`}</span>
            </div>
          );
        })}
      </div>
      <p className="xs dim">Ada peluang kecil (±1% per gen) terjadi mutasi yang memunculkan sifat baru.</p>
    </div>
  );
}

// --- 2 & 3. pembuahan lalu lahir --------------------------------------------------

function Pregnant({ pid }: { pid: number }) {
  const { pregnancies, agents, byId, loading } = useData();
  const p = pregnancies.find((x) => x.id === pid);
  // Bila pemetaan pid → anak dari server belum ada, cari anak dari induk & pemilik yang sama.
  const childId = p?.childId ?? (p?.hatched
    ? agents.filter((x) => x.parents[0] === p.parentA && x.parents[1] === p.parentB && same(x.owner, p.to)).sort((x, y) => y.id - x.id)[0]?.id
    : undefined);
  const child = childId ? byId(childId) : undefined;
  const a = p ? byId(p.parentA) : undefined, b = p ? byId(p.parentB) : undefined;

  if (loading) return <div className="skeleton" style={{ height: 420 }} />;
  if (!p) return <Empty title={`Kehamilan #${pid} tidak ditemukan`} action={<Link to="/kawin" className="btn">Kawinkan agent</Link>}>Mungkin chain lokal baru saja dijalankan ulang.</Empty>;
  if (child && a && b) return <Born child={child} a={a} b={b} />;
  return <Waiting p={p} a={a} b={b} />;
}

function Waiting({ p, a, b }: { p: Pregnancy; a?: Agent; b?: Agent }) {
  useTitle("Pembuahan");
  const { status } = useData();
  const actor = useActor();
  const block = status?.block ?? 0;
  const start = p.revealBlock - GESTATION;
  const progress = Math.min(1, Math.max(0.04, (block - start) / (GESTATION + 1)));
  const leftBlocks = Math.max(0, p.revealBlock + 1 - block);
  const secs = leftBlocks * (status?.secPerBlock ?? 12);

  return (
    <div className="stack-lg">
      <div className="page-head">
        <Stepper step={2} />
        <h1 className="h-page">{p.hatched ? "Menetas…" : "Pembuahan"}</h1>
        <p>{a?.name ?? `#${p.parentA}`} dan {b?.name ?? `#${p.parentB}`} sedang menjadi satu. Halaman ini berubah sendiri begitu anaknya lahir, jadi boleh ditinggal.</p>
      </div>
      <section className="stage waiting">
        <div className="fuse" aria-hidden>
          {a && <Cell genome={a.genome} size={120} className="fuse-a" />}
          {b && <Cell genome={b.genome} size={120} className="fuse-b" />}
        </div>
        <div className="stack" style={{ maxWidth: 520, width: "100%" }}>
          <div className="spread small">
            <span>{p.ready || leftBlocks === 0 ? "Siap menetas" : `${Math.min(GESTATION + 1, Math.max(0, block - start))} dari ${GESTATION + 1} blok`}</span>
            <span className="muted">{p.ready || leftBlocks === 0 ? (status?.keeper ? "sebentar lagi" : "") : `±${secs < 60 ? `${secs} detik` : `${Math.ceil(secs / 60)} menit`} lagi`}</span>
          </div>
          <div className="track" style={{ height: 8 }}><b style={{ width: `${progress * 100}%` }} /></div>
        </div>
        <p className="why">
          Kenapa menunggu? Sifat anak ditentukan oleh blok yang <b>belum ada</b> saat kamu menekan Kawinkan.
          Jadi tidak ada yang bisa mengintip atau mengatur hasilnya, termasuk kami.
        </p>
        {p.expired && (
          <button className="btn" disabled={!!actor.busy} onClick={() => actor.act("reroll", { pid: p.id })}>Jadwalkan ulang kelahiran</button>
        )}
        {p.ready && !p.expired && !status?.keeper && (
          <button className="btn btn-primary" disabled={!!actor.busy} onClick={() => actor.act("hatch", { pid: p.id })}>
            {actor.busy ? <Spinner /> : null}Tetaskan
          </button>
        )}
      </section>
    </div>
  );
}

function Born({ child, a, b }: { child: Agent; a: Agent; b: Agent }) {
  useTitle(`${child.name} lahir`);
  const actor = useActor();
  const [naming, setNaming] = useState(false);
  const origin = useMemo(() => geneOrigin(BigInt(child.genome), BigInt(a.genome), BigInt(b.genome)), [child.genome, a.genome, b.genome]);
  const mine = same(child.owner, actor.address);
  const verified = child.manifestHashOnChain === child.manifestHashComputed;
  const [fresh, setFresh] = useState(true);
  useEffect(() => { const t = setTimeout(() => setFresh(false), 2500); return () => clearTimeout(t); }, []);

  return (
    <div className="stack-lg">
      <div className="page-head">
        <Stepper step={3} />
      </div>
      <section className="stage born">
        <div className="born-head">
          <Cell genome={child.genome} size={136} className={fresh ? "cell-born" : ""} />
          <div className="stack" style={{ gap: 8 }}>
            <h1 className="h-page">{child.name} lahir</h1>
            <div className="row" style={{ gap: 8 }}>
              <span className="chip">generasi {child.generation}</span>
              <span className="chip">anak {a.name} × {b.name}</span>
              {verified
                ? <span className="chip chip-teal">✓ tercatat di chain</span>
                : <span className="chip chip-dim">manifest belum dicatat</span>}
            </div>
          </div>
        </div>

        <div className="stack">
          <GenomeStrip origin={origin} large reveal={fresh} />
          <Legend a={a.name} b={b.name} />
        </div>

        <TraitList agent={child} origin={origin} names={{ a: a.name, b: b.name }} />

        <div className="born-actions">
          <a className="btn btn-primary btn-lg" href={`/api/agents/${child.id}/agent.md`} download>Bawa pulang (.md)</a>
          <Link to={`/tugas?id=${child.id}`} className="btn btn-lg">Beri tugas</Link>
          {mine && <button className="btn btn-lg" onClick={() => setNaming(true)}>Beri nama</button>}
          <Link to={`/kawin?a=${a.id}&b=${b.id}`} className="btn btn-quiet">Kawinkan lagi</Link>
          <Link to={`/agent/${child.id}`} className="btn btn-quiet">Detail lengkap</Link>
        </div>
        <p className="xs muted">
          Berkas <code>.md</code> adalah subagent Claude Code. Taruh di folder <code>.claude/agents/</code> proyekmu dan agent ini langsung bisa dipakai.
        </p>
      </section>
      {naming && <NameDialog agent={child} onClose={() => setNaming(false)} />}
    </div>
  );
}
