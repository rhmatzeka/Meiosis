import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Hint } from "./components/hint";
import { post, short } from "./api";
import { useToast } from "./components/toast";
import { Backdrop } from "./components/backdrop";
import { BrandMark, Copy, Spinner } from "./components/ui";
import { MOTION_OK, gsap, useGSAP, usePageMotion } from "./motion";
import { useActor, useQuota } from "./hooks/use-actor";
import { useData } from "./hooks/use-data";
import { FeedbackButton } from "./components/feedback";
import { HomePage } from "./pages/home";
import { NotFound } from "./pages/not-found";
import { Link, Redirect, match, useLocation } from "./router";

/** Setiap halaman selain beranda dimuat terpisah: layar pertama tidak membawa kode Studio, Admin, dan lainnya. */
const AgentPage = lazy(() => import("./pages/agent").then((m) => ({ default: m.AgentPage })));
const ArenaPage = lazy(() => import("./pages/arena").then((m) => ({ default: m.ArenaPage })));
const BreedPage = lazy(() => import("./pages/breed").then((m) => ({ default: m.BreedPage })));
const GuidePage = lazy(() => import("./pages/guide").then((m) => ({ default: m.GuidePage })));
const MarketPage = lazy(() => import("./pages/market").then((m) => ({ default: m.MarketPage })));
const StudioPage = lazy(() => import("./pages/studio").then((m) => ({ default: m.StudioPage })));
const AdminPage = lazy(() => import("./pages/admin").then((m) => ({ default: m.AdminPage })));
const FamilyPage = lazy(() => import("./pages/family").then((m) => ({ default: m.FamilyPage })));
const TermsPage = lazy(() => import("./pages/terms").then((m) => ({ default: m.TermsPage })));
const RunPage = lazy(() => import("./pages/run").then((m) => ({ default: m.RunPage })));
const WalletPage = lazy(() => import("./pages/wallet").then((m) => ({ default: m.WalletPage })));

const NAV = [
  { to: "/pasar", label: "Pasar" },
  { to: "/studio", label: "Studio" },
  { to: "/kawin", label: "Kawinkan" },
  { to: "/tugas", label: "Beri tugas" },
  { to: "/silsilah", label: "Silsilah" },
  { to: "/panduan", label: "Panduan" },
] as const;

export function App() {
  const { path } = useLocation();
  const current = (to: string) => (path === to || path.startsWith(to + "/") ? "page" : undefined);
  const [menu, setMenu] = useState(false);
  const main = useRef<HTMLElement>(null);
  usePageMotion(main, path);
  useEffect(() => setMenu(false), [path]);
  // Header tembus pandang di puncak halaman supaya cahaya latar tidak terpotong.
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 12);
    on();
    addEventListener("scroll", on, { passive: true });
    return () => removeEventListener("scroll", on);
  }, []);

  return (
    <div className="shell">
      <Backdrop tall={path === "/"} />
      <header className={`header ${scrolled ? "is-scrolled" : ""}`}>
        <div className="header-inner">
          <Link to="/" className="brand"><BrandMark />Meiosis</Link>
          <nav className="nav" aria-label="Utama">
            {NAV.map((n) => <Link key={n.to} to={n.to} aria-current={current(n.to)}>{n.label}</Link>)}
          </nav>
          <div className="header-end">
            <NetworkBadge />
            <AccountMenu />
            <button className="menu-btn" aria-label="Menu" aria-expanded={menu} onClick={() => setMenu((m) => !m)}>
              <span /><span />
            </button>
          </div>
        </div>
      </header>
      {menu && <MobileMenu current={current} />}

      <StatusBanner />

      <main className="page" id="main" ref={main} key={path}>
        <Routes path={path} />
      </main>

      <Footer />
    </div>
  );
}

function MobileMenu({ current }: { current: (to: string) => "page" | undefined }) {
  const ref = useRef<HTMLDivElement>(null);
  useGSAP(() => {
    gsap.matchMedia().add(MOTION_OK, () => {
      gsap.from(ref.current, { opacity: 0, duration: 0.25 });
      gsap.from("a", { y: 24, opacity: 0, duration: 0.6, ease: "expo.out", stagger: 0.05 });
    });
  }, { scope: ref });
  return (
    <div className="mobile-menu" ref={ref}>
      {[...NAV, { to: "/dompet", label: "Dompet" }, { to: "/arena", label: "Arena" }].map((n) => (
        <Link key={n.to} to={n.to} aria-current={current(n.to)}>{n.label}</Link>
      ))}
    </div>
  );
}

function Footer() {
  const ref = useRef<HTMLElement>(null);
  useGSAP(() => {
    gsap.matchMedia().add(MOTION_OK, () => {
      gsap.from(".footer-giant", {
        yPercent: 40, opacity: 0, ease: "none",
        scrollTrigger: { trigger: ref.current, start: "top bottom", end: "bottom bottom", scrub: 1 },
      });
    });
  }, { scope: ref });
  return (
    <footer className="footer" ref={ref}>
      <div className="footer-inner">
        <div className="footer-about">
          <b>Agent AI yang lahir, bukan dibuat.</b>
          <p className="small muted">Rancang, kawinkan, jual, dan sewakan agent AI. Asal-usul setiap agent tercatat di blockchain dan bisa dibuktikan siapa saja.</p>
        </div>
        <nav className="footer-links" aria-label="Tambahan">
          <div><Link to="/pasar">Pasar</Link><Link to="/studio">Studio</Link><Link to="/kawin">Kawinkan</Link></div>
          <div><Link to="/panduan">Panduan</Link><Link to="/dompet">Dompet</Link><Link to="/ketentuan">Ketentuan & Privasi</Link><FeedbackButton /></div>
        </nav>
      </div>
      <div className="footer-giant" aria-hidden>Meiosis</div>
    </footer>
  );
}

function Routes({ path }: { path: string }) {
  return <Suspense fallback={<div className="skeleton" style={{ height: 420 }} />}><Route path={path} /></Suspense>;
}

function Route({ path }: { path: string }) {
  if (path === "/") return <HomePage />;
  if (path === "/kawin") return <BreedPage />;
  const preg = match("/kawin/:pid", path);
  if (preg) return <BreedPage pid={Number(preg.pid)} />;
  const ag = match("/agent/:id", path);
  if (ag) return <AgentPage id={Number(ag.id)} />;
  if (path === "/pasar") return <MarketPage />;
  if (path === "/koleksi") return <Redirect to="/pasar" />;
  if (path === "/studio") return <StudioPage />;
  if (path === "/panduan") return <GuidePage />;
  if (path === "/silsilah") return <FamilyPage />;
  if (path === "/tugas") return <RunPage />;
  if (path === "/arena") return <ArenaPage />;
  if (path === "/dompet") return <WalletPage />;
  if (path === "/admin") return <AdminPage />;
  if (path === "/ketentuan") return <TermsPage />;
  return <NotFound />;
}

function NetworkBadge() {
  const { status, offline } = useData();
  const live = !offline && status?.chainLive;
  const name = status ? (status.local ? "Lokal" : "Sepolia · uji coba") : "…";
  return (
    <span className="network" title={live ? `Tersambung ke ${status?.chainName}` : "Chain tidak terjangkau"}>
      <i className={`dot ${live ? "dot-live" : "dot-bad"}`} />
      <span className="label">{name}</span>
      {status && !status.local && <Hint k="jaringan-uji" />}
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
  const quotaLeft = useQuota(actor, open);

  const signedIn = actor.mode === "privy" || actor.mode === "injected";
  if (!signedIn) {
    if (actor.loginProblem) return <button className="btn btn-sm" disabled title={actor.loginProblem}>Login tidak tersedia</button>;
    return <button className="btn btn-primary btn-sm" onClick={actor.login} disabled={!actor.ready}>{actor.ready ? "Masuk" : <Spinner />}</button>;
  }

  return (
    <div className="account" ref={ref}>
      <button className="btn btn-sm btn-outline" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        {actor.label ?? (actor.address ? short(actor.address) : "Akun")}
      </button>
      {open && (
        <div className="account-pop" onClick={() => setOpen(false)}>
          <div className="xs dim" style={{ padding: "4px 10px" }}>Masuk sebagai</div>
          <div style={{ padding: "0 10px 6px" }}>
            <div className="small">{actor.label ?? "Wallet"}</div>
            {actor.address && <Copy text={actor.address} label={short(actor.address)} />}
          </div>
          {quotaLeft && (
            <div className="xs muted account-quota" style={{ padding: "0 10px 8px" }}>
              {quotaLeft.tasks} dari {quotaLeft.tasksPerDay} tugas gratis hari ini · {quotaLeft.studio} dari {quotaLeft.studioPerDay} agent baru
            </div>
          )}
          <Link to="/dompet">Dompet & agent milikku</Link>
          <button className="item" onClick={() => actor.logout()}>Keluar</button>
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
      try { await post("/api/deploy", {}); await refresh(true); toast("Kontrak siap. Buat agent pertamamu di Studio.", "ok"); }
      catch (e) { toast((e as Error).message, "bad"); }
      finally { setBusy(false); }
    };
    return (
      <div className="banner banner-info" role="status">
        <div className="spread" style={{ flex: 1 }}>
          <span><b>Kontrak belum dipasang di chain ini.</b> {status.local ? "Pasang kontrak. Pasar dimulai kosong; agent pertama dibuat di Studio." : "Jalankan bun run deploy:sepolia di server."}</span>
          {status.local && <button className="btn btn-primary btn-sm" onClick={deploy} disabled={busy}>{busy ? <Spinner /> : null}Pasang kontrak</button>}
        </div>
      </div>
    );
  }
  return null;
}
