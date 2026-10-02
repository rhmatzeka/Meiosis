/**
 * Panel admin beta: biaya model hari ini, jatah, saldo operator, minat
 * pengguna, laporan, dan masukan. Tidak ditautkan dari menu; aksesnya
 * dibuktikan dengan tanda tangan wallet yang terdaftar di ADMIN_ADDRESSES.
 */
import { useCallback, useEffect, useState } from "react";
import { ApiError, post } from "../api";
import { useToast } from "../components/toast";
import { Empty, Spinner } from "../components/ui";
import { proofFor, useActor } from "../hooks/use-actor";
import { Link, useTitle } from "../router";

interface Note { at: number; page: string; text: string; agentId?: number }
interface Overview {
  day: string; users: number; tasks: number; tokens: number; usd: number;
  config: { tasksPerDay: number; studioPerDay: number; tokenBudget: number };
  operator: { address: string; balanceEth: string } | null;
  faucetToday: { count: number; eth: string };
  funnel: { steps: Record<string, number>; d7: { cohort: number; returned: number } };
  hidden: { id: number; reason: string; at: number }[];
  feedback: Note[]; reports: Note[];
}

const STEPS: [string, string][] = [["masuk", "Masuk"], ["buat", "Buat agent"], ["coba", "Coba di Studio"], ["tugas", "Beri tugas"], ["kawin", "Kawinkan"], ["pasang-harga", "Pasang harga"], ["tugas-berbayar", "Tugas berbayar"]];
const when = (t: number) => new Date(t).toLocaleString("id-ID", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Jakarta" });

export function AdminPage() {
  useTitle("Admin");
  const actor = useActor();
  const toast = useToast();
  const [data, setData] = useState<Overview | null>(null);
  const [denied, setDenied] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cfg, setCfg] = useState({ tasksPerDay: "", tokenBudget: "" });

  const call = useCallback(async <T,>(path: string, body: Record<string, unknown> = {}) =>
    post<T>(path, { ...body, ...(await proofFor(actor, "panel admin")) }), [actor]);

  const load = useCallback(async () => {
    setBusy(true);
    try { setData(await call<Overview>("/api/admin/overview")); setDenied(null); }
    catch (e) { setDenied(e instanceof ApiError && e.status === 403 ? "Halaman ini khusus admin." : (e as Error).message); }
    finally { setBusy(false); }
  }, [call]);

  useEffect(() => { if (actor.mode !== "none") load(); }, [actor.mode, actor.address]);

  if (actor.mode === "none") {
    return <Empty title="Panel admin" action={<button className="btn btn-primary" onClick={actor.login}>Masuk dengan wallet admin</button>}>Masuk dengan wallet yang terdaftar sebagai admin.</Empty>;
  }
  if (denied) return <Empty title={denied} action={<Link to="/" className="btn">Ke beranda</Link>}>Alamat {actor.address} tidak terdaftar sebagai admin.</Empty>;
  if (!data) return <div className="skeleton" style={{ height: 420 }} />;

  const act = async (path: string, body: Record<string, unknown>, ok: string) => {
    try { await call(path, body); toast(ok, "ok"); await load(); } catch (e) { toast((e as Error).message, "bad"); }
  };
  const used = Math.min(1, data.tokens / Math.max(1, data.config.tokenBudget));
  const lowGas = data.operator && Number(data.operator.balanceEth) < 0.01;

  return (
    <div className="stack-lg admin">
      <div className="page-head spread">
        <div><h1 className="h-page">Admin</h1><p>Hari ini ({data.day}, mulai 07.00 WIB). Angka biaya adalah perkiraan.</p></div>
        <button className="btn btn-sm" onClick={load} disabled={busy}>{busy ? <Spinner /> : null}Muat ulang</button>
      </div>

      <div className="admin-cards">
        <section className="plate stack">
          <h2 className="h-sub">Pemakaian AI</h2>
          <div className="admin-big">{data.tasks} <small>tugas · {data.users} akun</small></div>
          <div className="meter" role="meter" aria-valuemin={0} aria-valuemax={data.config.tokenBudget} aria-valuenow={data.tokens} aria-label="Token terpakai hari ini">
            <b style={{ width: `${used * 100}%` }} className={used > 0.85 ? "hot" : ""} />
          </div>
          <span className="small muted">{data.tokens.toLocaleString("id-ID")} dari {data.config.tokenBudget.toLocaleString("id-ID")} token · ±${data.usd.toFixed(3)}</span>
        </section>
        <section className={`plate stack ${lowGas ? "admin-warn" : ""}`}>
          <h2 className="h-sub">Wallet operator</h2>
          <div className="admin-big">{data.operator ? `${Number(data.operator.balanceEth).toLocaleString("id-ID", { maximumFractionDigits: 4 })} ETH` : "—"}</div>
          <span className="small muted">{lowGas ? "Saldo menipis. Isi Sepolia ETH supaya faucet dan penetasan otomatis tetap jalan. " : ""}Faucet 24 jam: {data.faucetToday.count}× · {data.faucetToday.eth} ETH</span>
        </section>
        <section className="plate stack">
          <h2 className="h-sub">Jatah</h2>
          <form className="stack" onSubmit={(e) => { e.preventDefault(); act("/api/admin/config", { ...(cfg.tasksPerDay ? { tasksPerDay: Number(cfg.tasksPerDay) } : {}), ...(cfg.tokenBudget ? { tokenBudget: Number(cfg.tokenBudget) } : {}) }, "Jatah diperbarui."); }}>
            <label className="field"><span>Tugas gratis per akun per hari (sekarang {data.config.tasksPerDay})</span><input className="input" inputMode="numeric" value={cfg.tasksPerDay} onChange={(e) => setCfg({ ...cfg, tasksPerDay: e.target.value })} /></label>
            <label className="field"><span>Anggaran token harian (sekarang {data.config.tokenBudget.toLocaleString("id-ID")})</span><input className="input" inputMode="numeric" value={cfg.tokenBudget} onChange={(e) => setCfg({ ...cfg, tokenBudget: e.target.value })} /></label>
            <button className="btn btn-sm btn-primary" type="submit">Simpan</button>
          </form>
        </section>
      </div>

      <section className="plate stack">
        <h2 className="h-sub">Minat 7 hari terakhir</h2>
        <div className="funnel">
          {STEPS.map(([k, label]) => {
            const n = data.funnel.steps[k] ?? 0, top = Math.max(1, data.funnel.steps.masuk ?? 0);
            return (
              <div className="funnel-row" key={k}>
                <span>{label}</span>
                <div className="meter"><b style={{ width: `${Math.min(1, n / top) * 100}%` }} /></div>
                <span className="v">{n}</span>
              </div>
            );
          })}
        </div>
        <span className="small muted">Kembali setelah 7 hari: {data.funnel.d7.returned} dari {data.funnel.d7.cohort} akun.</span>
      </section>

      <section className="plate stack">
        <h2 className="h-sub">Laporan pengguna</h2>
        {data.reports.length ? data.reports.map((r) => (
          <div className="admin-note spread" key={r.at + r.page}>
            <div><Link to={r.page}>{r.page}</Link> · <span className="xs muted">{when(r.at)}</span><p className="small">{r.text}</p></div>
            {r.agentId && !data.hidden.some((h) => h.id === r.agentId) && (
              <button className="btn btn-sm btn-danger" onClick={() => act("/api/admin/hide", { id: r.agentId, reason: r.text }, `Agent #${r.agentId} disembunyikan.`)}>Sembunyikan</button>
            )}
          </div>
        )) : <p className="small muted">Belum ada laporan.</p>}
        {data.hidden.length > 0 && (
          <div className="stack">
            <h3 className="h-sub">Disembunyikan</h3>
            {data.hidden.map((h) => (
              <div className="admin-note spread" key={h.id}>
                <span className="small"><Link to={`/agent/${h.id}`}>#{h.id}</Link> · {h.reason || "tanpa alasan"}</span>
                <button className="btn btn-sm" onClick={() => act("/api/admin/unhide", { id: h.id }, `Agent #${h.id} tampil lagi.`)}>Tampilkan lagi</button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="plate stack">
        <h2 className="h-sub">Masukan terbaru</h2>
        {data.feedback.length ? data.feedback.map((f) => (
          <div className="admin-note" key={f.at + f.text.slice(0, 10)}>
            <span className="xs muted">{when(f.at)} · {f.page || "/"}</span>
            <p className="small">{f.text}</p>
          </div>
        )) : <p className="small muted">Belum ada masukan.</p>}
      </section>
    </div>
  );
}
