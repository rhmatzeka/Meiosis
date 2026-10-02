/**
 * Empat langkah pertama pengguna baru, dihitung dari keadaan nyata: sudah
 * masuk, punya saldo untuk biaya jaringan, punya agent, pernah memberi tugas.
 * Hilang setelah semuanya dilalui.
 */
import { useEffect, useState } from "react";
import { get, same } from "../api";
import { useActor } from "../hooks/use-actor";
import { useData } from "../hooks/use-data";
import { hasRunTask, nextStep, type Step } from "../lib/onboarding";
import { Link } from "../router";

const STEPS: { key: Step; title: string; hint: string }[] = [
  { key: "masuk", title: "Masuk", hint: "Pakai Google atau email. Wallet dibuatkan otomatis." },
  { key: "saldo", title: "Dapat saldo untuk biaya jaringan", hint: "Pengguna baru dikirimi sedikit ETH uji. Bisa juga diisi dari faucet." },
  { key: "buat", title: "Buat agent pertama", hint: "Ceritakan agent yang kamu butuhkan di Studio. Gratis selama beta." },
  { key: "tugas", title: "Beri tugas pertama", hint: "Coba agent-mu atau agent orang lain dengan tugas sungguhan." },
];

export function FirstSteps() {
  const actor = useActor();
  const { agents } = useData();
  const [balanceWei, setBalance] = useState<bigint | null>(null);
  useEffect(() => {
    if (!actor.address) { setBalance(null); return; }
    get<{ balanceWei?: string }>(`/api/royalty?address=${actor.address}`).then((r) => setBalance(BigInt(r.balanceWei ?? "0"))).catch(() => setBalance(0n));
  }, [actor.address, agents.length]);

  const signedIn = actor.mode !== "none";
  if (signedIn && balanceWei === null) return null;
  const step = nextStep({ signedIn, balanceWei: balanceWei ?? 0n, ownsAgent: agents.some((a) => same(a.owner, actor.address)), ranTask: hasRunTask() });
  if (!step) return null;
  const at = STEPS.findIndex((s) => s.key === step);

  const action = {
    masuk: <button className="btn btn-primary btn-sm" onClick={actor.login} disabled={!actor.canLogin && !actor.ready}>Masuk</button>,
    saldo: <Link to="/dompet#isi" className="btn btn-primary btn-sm">Isi saldo</Link>,
    buat: <Link to="/studio" className="btn btn-primary btn-sm">Buka Studio</Link>,
    tugas: <Link to="/tugas" className="btn btn-primary btn-sm">Beri tugas</Link>,
  }[step];

  return (
    <section className="plate first-steps" aria-label="Langkah pertama">
      <h2 className="h-sub">Mulai di sini</h2>
      <ol>
        {STEPS.map((s, i) => (
          <li key={s.key} className={i < at ? "done" : i === at ? "now" : ""} aria-current={i === at ? "step" : undefined}>
            <span className="first-n" aria-hidden>{i < at ? "✓" : i + 1}</span>
            <div>
              <b>{s.title}</b>
              {i === at && <p className="xs muted">{s.hint}</p>}
              {i === at && <div className="first-action">{action}</div>}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
