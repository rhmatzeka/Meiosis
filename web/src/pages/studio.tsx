/**
 * Studio: merancang agent baru dari nol. Pilihan di kiri, pratinjau langsung
 * di kanan. Genome dihitung di sini dengan fungsi yang sama persis dengan
 * kontrak Studio, jadi yang terlihat adalah yang akan dicetak.
 */
import { useMemo, useState } from "react";
import { LOCUS, TRAITS, express } from "../../../packages/shared/src/genome";
import { NO_TALENT, studioGenome, type Design } from "../../../packages/shared/src/studio";
import { get, same, type Agent } from "../api";
import { TraitList } from "../components/agent";
import { Cell, GenomeStrip, Spinner } from "../components/ui";
import { useActor } from "../hooks/use-actor";
import { useData } from "../hooks/use-data";
import { navigate, useTitle, Link } from "../router";

const DISCIPLINES = [
  { v: 1, label: "Kode", icon: "💻", hint: "menulis program yang jalan" },
  { v: 2, label: "Desain", icon: "🎨", hint: "tampilan dan pengalaman pakai" },
  { v: 3, label: "Riset", icon: "🔎", hint: "mencari tahu dan merangkum" },
  { v: 4, label: "Keamanan", icon: "🛡", hint: "mencari celah dan menutupnya" },
  { v: 5, label: "Data", icon: "📊", hint: "mengolah dan menganalisis data" },
  { v: 0, label: "Serba bisa", icon: "✳️", hint: "tidak menonjol di satu bidang" },
];
const STACKS = [{ v: 1, label: "React" }, { v: 2, label: "Solidity" }, { v: 3, label: "Python" }, { v: 0, label: "Bebas" }];
const VOICES = [{ v: 0, label: "Ringkas", hint: "langsung ke hasil" }, { v: 1, label: "Biasa", hint: "menjelaskan seperlunya" }, { v: 2, label: "Panjang", hint: "menjelaskan dengan rinci" }];
const BRAINS = [{ v: 1, label: "Seimbang", hint: "lebih teliti, sedikit lebih lambat" }, { v: 0, label: "Cepat", hint: "gesit untuk tugas sederhana" }];
const TALENTS = [
  { v: LOCUS.SECURITY_INSTINCT, label: "Keamanan", icon: "🛡" },
  { v: LOCUS.TEST_RIGOR, label: "Ketelitian tes", icon: "🧪" },
  { v: LOCUS.AESTHETIC, label: "Estetika", icon: "🎨" },
  { v: LOCUS.PERSISTENCE, label: "Ketekunan", icon: "🔁" },
];

export function StudioPage() {
  useTitle("Studio");
  const { status, agents, refresh } = useData();
  const actor = useActor();
  const [d, setD] = useState<Design>({ tier: 1, discipline: 1, stack: 1, verbosity: 0, talentA: LOCUS.SECURITY_INSTINCT, talentB: NO_TALENT });
  const [name, setName] = useState("");
  const [sending, setSending] = useState(false);

  const talents = [d.talentA, d.talentB].filter((t) => t !== NO_TALENT);
  const toggleTalent = (t: number) => {
    const next = talents.includes(t) ? talents.filter((x) => x !== t) : [...talents, t].slice(-2);
    setD({ ...d, talentA: next[0] ?? NO_TALENT, talentB: next[1] ?? NO_TALENT });
  };

  // Agent bayangan untuk pratinjau: bentuknya sama dengan yang dikirim server.
  const preview = useMemo(() => {
    const g = studioGenome(d);
    const genome = "0x" + g.toString(16).padStart(64, "0");
    const traits = express(g, 0n).map((t, i) => ({ locus: i, name: String(i), value: TRAITS[i][t] }));
    return { genome, traits } as unknown as Agent;
  }, [d]);

  const nameBytes = new TextEncoder().encode(name.trim()).length;
  const fee = status?.market?.studioFeeEth;
  const unavailable = !status?.market?.studioFeeEth;

  const create = async () => {
    if (actor.mode === "none") { actor.login(); return; }
    setSending(true);
    const r = await actor.act("studioCreate", { design: d, name: name.trim() }, { quietSuccess: true });
    if (r) {
      const fresh = await get<Agent[]>("/api/agents?fresh=1").catch(() => agents);
      await refresh(true);
      const mine = fresh.filter((a) => a.designed && same(a.owner, actor.address) && a.genome === preview.genome).sort((x, y) => y.id - x.id)[0];
      if (mine) { navigate(`/agent/${mine.id}?baru=1`); return; }
    }
    setSending(false);
  };

  return (
    <div className="stack-lg">
      <div className="page-head">
        <h1 className="h-page">Studio</h1>
        <p>
          Rancang agent-mu sendiri. Pilih keahliannya, lalu dua bakat yang paling kamu butuhkan.
          Agent rancangan bisa langsung dipakai, dijual, disewakan, atau dikawinkan untuk mendapat keturunan yang lebih unggul.
        </p>
      </div>

      {unavailable && <div className="banner" style={{ width: "100%", margin: 0 }}><div>Studio belum dipasang di chain ini.</div></div>}

      <div className="studio">
        <div className="studio-form stack-lg">
          <Choice title="Keahlian utama" hint="Bidang yang paling ia kuasai.">
            <div className="choice-grid">
              {DISCIPLINES.map((o) => (
                <button key={o.v} type="button" className="choice" aria-pressed={d.discipline === o.v} onClick={() => setD({ ...d, discipline: o.v })}>
                  <span className="choice-icon">{o.icon}</span><b>{o.label}</b><small>{o.hint}</small>
                </button>
              ))}
            </div>
          </Choice>

          <Choice title="Bakat" hint={`Pilih paling banyak dua. Bakat membuat sifat itu tinggi; yang lain sedang. (${talents.length}/2)`}>
            <div className="choice-row">
              {TALENTS.map((o) => (
                <button key={o.v} type="button" className="choice choice-sm" aria-pressed={talents.includes(o.v)} onClick={() => toggleTalent(o.v)}>
                  {o.icon} {o.label}
                </button>
              ))}
            </div>
          </Choice>

          <Choice title="Stack">
            <div className="choice-row">
              {STACKS.map((o) => (
                <button key={o.v} type="button" className="choice choice-sm" aria-pressed={d.stack === o.v} onClick={() => setD({ ...d, stack: o.v })}>{o.label}</button>
              ))}
            </div>
          </Choice>

          <div className="studio-two">
            <Choice title="Otak">
              <div className="stack" style={{ gap: 8 }}>
                {BRAINS.map((o) => (
                  <button key={o.v} type="button" className="choice choice-line" aria-pressed={d.tier === o.v} onClick={() => setD({ ...d, tier: o.v })}>
                    <b>{o.label}</b><small>{o.hint}</small>
                  </button>
                ))}
                <small className="dim">Otak kuat hanya bisa didapat lewat keturunan.</small>
              </div>
            </Choice>
            <Choice title="Gaya bicara">
              <div className="stack" style={{ gap: 8 }}>
                {VOICES.map((o) => (
                  <button key={o.v} type="button" className="choice choice-line" aria-pressed={d.verbosity === o.v} onClick={() => setD({ ...d, verbosity: o.v })}>
                    <b>{o.label}</b><small>{o.hint}</small>
                  </button>
                ))}
              </div>
            </Choice>
          </div>
        </div>

        <aside className="studio-preview stage">
          <div className="studio-cell"><Cell genome={preview.genome} size={132} /></div>
          <label className="field">
            <span>Nama (boleh dikosongkan)</span>
            <input className="input" value={name} maxLength={40} placeholder="mis. Penjaga Form" onChange={(e) => setName(e.target.value)} />
            {nameBytes > 32 && <small style={{ color: "var(--danger)" }}>Paling panjang 32 byte.</small>}
          </label>
          <GenomeStrip agent={preview} large />
          <TraitList agent={preview} />
          <button className="btn btn-primary btn-lg" disabled={unavailable || sending || !!actor.busy || nameBytes > 32 || (actor.mode === "none" && !!actor.loginProblem)} onClick={create}>
            {sending ? <><Spinner />Membuat…</> : actor.mode === "none" ? "Masuk untuk membuat" : `Buat agent · ${fee ?? "…"} ETH`}
          </button>
          <p className="xs muted">
            Biaya dibayar sekali ke platform. Agent-nya jadi milikmu. <Link to="/panduan#studio">Kenapa ada batasan?</Link>
          </p>
        </aside>
      </div>
    </div>
  );
}

function Choice({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="stack" style={{ gap: 10 }}>
      <div>
        <h2 className="h-sub">{title}</h2>
        {hint && <p className="xs muted">{hint}</p>}
      </div>
      {children}
    </section>
  );
}
