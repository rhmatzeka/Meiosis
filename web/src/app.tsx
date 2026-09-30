import { useEffect, useRef, useState } from "react";
import { post, short } from "./api";
import { useToast } from "./components/toast";
import { BrandMark, Copy, Icon, Spinner } from "./components/ui";
import { useActor } from "./hooks/use-actor";
import { useData } from "./hooks/use-data";
import { AgentPage } from "./pages/agent";
import { ArenaPage } from "./pages/arena";
import { BreedPage } from "./pages/breed";
import { CollectionPage } from "./pages/collection";
import { FamilyPage } from "./pages/family";
import { HomePage } from "./pages/home";
import { NotFound } from "./pages/not-found";
import { RunPage } from "./pages/run";
import { WalletPage } from "./pages/wallet";
import { Link, match, useLocation } from "./router";

const NAV = [
  { to: "/kawin", label: "Kawinkan", icon: "breed" },
  { to: "/koleksi", label: "Koleksi", icon: "grid" },
  { to: "/silsilah", label: "Silsilah", icon: "tree" },
  { to: "/tugas", label: "Beri tugas", short: "Tugas", icon: "task" },
  { to: "/arena", label: "Arena", icon: "arena" },
] as const;

export function App() {
  const { path } = useLocation();
  const current = (to: string) => (path === to || path.startsWith(to + "/") ? "page" : undefined);

  return (
    <div className="shell">
      <header className="header">
        <div className="header-inner">
          <Link to="/" className="brand"><BrandMark />Meiosis</Link>
          <nav className="nav" aria-label="Utama">
            {NAV.map((n) => <Link key={n.to} to={n.to} aria-current={current(n.to)}>{n.label}</Link>)}
          </nav>
          <div className="header-end">
            <NetworkBadge />
            <AccountMenu />
          </div>
        </div>
      </header>

      <StatusBanner />

      <main className="page" id="main">
        <Routes path={path} />
      </main>

      <nav className="bottom-nav" aria-label="Utama">
        {NAV.map((n) => (
          <Link key={n.to} to={n.to} aria-current={current(n.to)}>
            <Icon name={n.icon} />{"short" in n ? n.short : n.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

function Routes({ path }: { path: string }) {
  if (path === "/") return <HomePage />;
  if (path === "/kawin") return <BreedPage />;
  const preg = match("/kawin/:pid", path);
  if (preg) return <BreedPage pid={Number(preg.pid)} />;
  const ag = match("/agent/:id", path);
  if (ag) return <AgentPage id={Number(ag.id)} />;
  if (path === "/koleksi") return <CollectionPage />;
  if (path === "/silsilah") return <FamilyPage />;
  if (path === "/tugas") return <RunPage />;
  if (path === "/arena") return <ArenaPage />;
  if (path === "/dompet") return <WalletPage />;
  return <NotFound />;
}

function NetworkBadge() {
  const { status, offline } = useData();
  const live = !offline && status?.chainLive;
  const name = status ? (status.local ? "Lokal" : "Sepolia") : "…";
  return (
    <span className="network" title={live ? `Tersambung ke ${status?.chainName}` : "Chain tidak terjangkau"}>
      <i className={`dot ${live ? "dot-live" : "dot-bad"}`} />
      <span className="label">{name}</span>
    </span>
  );
}

function AccountMenu() {
  const actor = useActor();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    addEventListener("mousedown", close);
    return () => removeEventListener("mousedown", close);
  }, [open]);

  const signedIn = actor.mode === "privy" || actor.mode === "injected";
  if (!signedIn && actor.mode === "none") {
    return <button className="btn btn-primary btn-sm" onClick={actor.login} disabled={!actor.ready}>Masuk</button>;
  }

  return (
    <div className="account" ref={ref}>
      <button className="btn btn-sm" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        {signedIn ? (actor.label ?? (actor.address ? short(actor.address) : "Akun")) : "Akun demo"}
      </button>
      {open && (
        <div className="account-pop" onClick={() => setOpen(false)}>
          <div className="xs dim" style={{ padding: "4px 10px" }}>
            {signedIn ? "Masuk sebagai" : "Belum masuk. Di chain lokal kamu bertindak sebagai"}
          </div>
          <div style={{ padding: "0 10px 6px" }}>
            <div className="small">{actor.label ?? "Wallet"}</div>
            {actor.address && <Copy text={actor.address} label={short(actor.address)} />}
          </div>
          <Link to="/dompet">Dompet & agent milikku</Link>
          {signedIn
            ? <button className="item" onClick={() => actor.logout()}>Keluar</button>
            : actor.canLogin && <button className="item" onClick={actor.login}>Masuk dengan akunmu sendiri</button>}
        </div>
      )}
    </div>
  );
}

function StatusBanner() {
  const { status, offline, refresh } = useData();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  if (offline) {
    return <div className="banner" role="alert"><div><b>Server Meiosis tidak terjangkau.</b> Halaman akan tersambung lagi sendiri begitu server kembali.</div></div>;
  }
  if (!status) return null;
  if (!status.chainLive) {
    return (
      <div className="banner" role="alert">
        <div>
          <b>Chain tidak terjangkau.</b>{" "}
          {status.local ? <>Nyalakan dengan <code>bun run start</code> di folder Meiosis.</> : "RPC Sepolia sedang bermasalah; coba beberapa saat lagi."}
        </div>
      </div>
    );
  }
  if (!status.deployed) {
    const deploy = async () => {
      setBusy(true);
      try { await post("/api/deploy", {}); await refresh(true); toast("Kontrak siap, empat agent pertama sudah lahir.", "ok"); }
      catch (e) { toast((e as Error).message, "bad"); }
      finally { setBusy(false); }
    };
    return (
      <div className="banner banner-info" role="status">
        <div className="spread" style={{ flex: 1 }}>
          <span><b>Kontrak belum dipasang di chain ini.</b> {status.local ? "Pasang sekarang untuk memunculkan empat agent pertama." : "Jalankan bun run deploy:sepolia di server."}</span>
          {status.local && <button className="btn btn-primary btn-sm" onClick={deploy} disabled={busy}>{busy ? <Spinner /> : null}Pasang kontrak</button>}
        </div>
      </div>
    );
  }
  return null;
}
