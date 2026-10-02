/**
 * Studio: membuat agent dengan bebas.
 *
 * Tiga cara, boleh dicampur:
 *   1. ceritakan dengan kata-kata sendiri, lalu "Rancang dengan AI" mengisi sisanya;
 *   2. tulis sendiri instruksi agent-nya (peran, cara kerja, larangan);
 *   3. atur setiap sifat secara manual — tanpa batasan.
 * Instruksi disimpan rahasia di server; yang tercatat di chain hanya hash-nya.
 */
import { useMemo, useState, type ReactNode } from "react";
import { TRAITS, express } from "../../../packages/shared/src/genome";
import { defaultTraits, studioGenome } from "../../../packages/shared/src/studio";
import { get, post, same, type Agent } from "../api";
import { highlights } from "../components/agent";
import { useToast } from "../components/toast";
import { Cell, GenomeStrip, Spinner } from "../components/ui";
import { useActor } from "../hooks/use-actor";
import { useData } from "../hooks/use-data";
import { LOCI } from "../lib/traits";
import { Link, navigate, useTitle } from "../router";

const MAX_SOUL = 4000;
const EXAMPLES = [
  "Agent untuk membuat form React yang aman dan rapi, lengkap dengan tesnya",
  "Auditor smart contract Solidity yang teliti mencari celah",
  "Asisten riset yang merangkum dokumen panjang dengan bahasa sederhana untuk pemula",
  "Perancang landing page yang modern dan berani bereksperimen",
];
const GROUPS: { title: string; hint: string; loci: number[] }[] = [
  { title: "Otak & keahlian", hint: "Seberapa kuat modelnya dan bidang apa yang dikuasai.", loci: [0, 1, 2, 3] },
  { title: "Kualitas kerja", hint: "Kebiasaan yang menentukan mutu hasilnya.", loci: [6, 5, 4, 14, 7] },
  { title: "Gaya", hint: "Cara ia berbicara dan mengambil keputusan.", loci: [11, 13, 12] },
  { title: "Akses", hint: "Perkakas yang boleh dipakainya saat bekerja.", loci: [8, 9, 10] },
];

interface Suggestion { name: string; instructions: string; source: "ai" | "heuristic" }

export function StudioPage() {
  useTitle("Studio");
  const { status, agents, refresh } = useData();
  const actor = useActor();
  const toast = useToast();
  const [description, setDescription] = useState("");
  const [instructions, setInstructions] = useState("");
  const [traits, setTraits] = useState<number[]>(defaultTraits);
  const [name, setName] = useState("");
  const [thinking, setThinking] = useState(false);
  const [sending, setSending] = useState(false);

  // Agent bayangan untuk pratinjau: bentuknya sama dengan yang dikirim server.
  const preview = useMemo(() => {
    const g = studioGenome(traits);
    return {
      genome: "0x" + g.toString(16).padStart(64, "0"),
      traits: express(g, 0n).map((t, i) => ({ locus: i, name: String(i), value: TRAITS[i][t] })),
    } as unknown as Agent;
  }, [traits]);

  const design = async () => {
    if (!description.trim()) { toast("Ceritakan dulu agent seperti apa yang kamu mau.", "info"); return; }
    setThinking(true);
    try {
      const s = await post<Suggestion>("/api/studio/suggest", { description });
      setInstructions(s.instructions);
      if (!name.trim()) setName(s.name);
      toast(s.source === "ai" ? "Rancangan dari AI sudah diisi. Sunting sesukamu." : "Rancangan awal diisi dari kata kuncimu. Sunting sesukamu.", "ok");
    } catch (e) {
      toast((e as Error).message, "bad");
    } finally {
      setThinking(false);
    }
  };

  const nameBytes = new TextEncoder().encode(name.trim()).length;
  const fee = status?.market?.studioFeeEth;
  const unavailable = !fee;
  const tooLong = instructions.length > MAX_SOUL;

  const create = async () => {
    if (actor.mode === "none") { actor.login(); return; }
    setSending(true);
    try {
      const soulHash = instructions.trim() ? (await post<{ hash: string }>("/api/studio/soul", { text: instructions }, await actor.authHeaders())).hash : "";
      const r = await actor.act("studioCreate", { traits, name: name.trim(), soulHash }, { quietSuccess: true });
      if (r) {
        const fresh = await get<Agent[]>("/api/agents?fresh=1").catch(() => agents);
        await refresh(true);
        const mine = fresh.filter((a) => a.designed && same(a.owner, actor.address) && a.genome === preview.genome).sort((x, y) => y.id - x.id)[0];
        if (mine) { navigate(`/agent/${mine.id}?baru=1`); return; }
      }
    } catch (e) {
      toast((e as Error).message, "bad");
    }
    setSending(false);
  };

  return (
    <div className="stack-lg">
      <div className="page-head">
        <h1 className="h-page">Studio</h1>
        <p>
          Buat agent-mu sendiri, sebebas yang kamu mau. Ceritakan dengan kata-katamu, biarkan AI merancangnya,
          atau tulis dan atur semuanya sendiri.
        </p>
      </div>

      {unavailable && <div className="banner" style={{ width: "100%", margin: 0 }}><div>Studio belum dipasang di chain ini.</div></div>}

      <div className="studio">
        <div className="studio-form stack-lg">
          <Block n={1} title="Ceritakan agent yang kamu mau" hint="Tulis bebas, seperti menjelaskan ke teman: untuk apa, gayanya bagaimana, apa yang penting.">
            <textarea
              className="textarea" rows={4} value={description} maxLength={2000}
              placeholder="mis. Agent untuk membuat form React yang aman dan rapi, lengkap dengan tesnya"
              onChange={(e) => setDescription(e.target.value)}
            />
            <div className="choice-row">
              {EXAMPLES.map((x) => <button key={x} type="button" className="chip chip-pick" onClick={() => setDescription(x)}>{x.split(" ").slice(0, 4).join(" ")}…</button>)}
            </div>
            <div className="row">
              <button className="btn btn-primary" disabled={thinking} onClick={design}>{thinking ? <><Spinner />Merancang…</> : "Rancang dengan AI"}</button>
              <span className="xs muted">Mengisi nama, instruksi, dan sifat di bawah. Semuanya tetap bisa kamu ubah.</span>
            </div>
          </Block>

          <Block n={2} title="Instruksi agent" hint="Inilah yang dipatuhi agent-mu. Tulis sendiri, atau sunting hasil AI: peran, cara kerja, hal yang harus dihindari. Isinya rahasia; hanya kamu yang bisa mengunduhnya.">
            <textarea
              className="textarea studio-soul" rows={9} value={instructions}
              placeholder={"mis.\nKamu spesialis form React.\n- Selalu validasi masukan di sisi server.\n- Tulis tes untuk setiap alur gagal.\n- Jangan memakai pustaka UI tanpa diminta."}
              onChange={(e) => setInstructions(e.target.value)}
            />
            <span className="xs" style={{ color: tooLong ? "var(--danger)" : "var(--dim)" }}>{instructions.length}/{MAX_SOUL} karakter · boleh dikosongkan</span>
          </Block>

          <Block n={3} title="Sifat" hint="Setiap sifat bebas kamu atur. Sifat ini yang diwariskan saat agent-mu dikawinkan.">
            <div className="stack-lg">
              {GROUPS.map((g) => (
                <div key={g.title} className="trait-group">
                  <div><h3 className="h-sub">{g.title}</h3><p className="xs muted">{g.hint}</p></div>
                  {g.loci.map((i) => (
                    <div className="trait-row" key={i}>
                      <span className="trait-label">{LOCI[i].icon} {LOCI[i].label}</span>
                      <div className="segmented trait-seg" role="radiogroup" aria-label={LOCI[i].label}>
                        {LOCI[i].values.map((v, t) => (
                          <button key={t} type="button" role="radio" aria-checked={traits[i] === t} aria-selected={traits[i] === t}
                            onClick={() => setTraits(traits.map((x, k) => (k === i ? t : x)))}>{v}</button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </Block>
        </div>

        <aside className="studio-preview stage">
          <div className="studio-cell"><Cell genome={preview.genome} size={132} /></div>
          <label className="field">
            <span>Nama (boleh dikosongkan)</span>
            <input className="input" value={name} maxLength={40} placeholder="mis. Penjaga Form" onChange={(e) => setName(e.target.value)} />
            {nameBytes > 32 && <small style={{ color: "var(--danger)" }}>Paling panjang 32 byte.</small>}
          </label>
          <GenomeStrip agent={preview} large />
          <div className="agent-card-tags">
            {highlights(preview, 6).map((h) => <span key={h.text} className="chip">{h.icon} {h.text}</span>)}
            {instructions.trim() && <span className="chip chip-accent">✍ instruksi khusus</span>}
          </div>
          <button className="btn btn-primary btn-lg" disabled={unavailable || sending || !!actor.busy || nameBytes > 32 || tooLong || (actor.mode === "none" && !!actor.loginProblem)} onClick={create}>
            {sending ? <><Spinner />Membuat…</> : actor.mode === "none" ? "Masuk untuk membuat" : `Buat agent · ${fee ?? "…"} ETH`}
          </button>
          <p className="xs muted">
            Biaya dibayar sekali ke platform. Agent-nya jadi milikmu: bisa dipakai, dijual, disewakan, dan dikawinkan.
            Anak-anaknya mewarisi sifat dan instruksi khususnya. <Link to="/panduan#studio">Selengkapnya</Link>
          </p>
        </aside>
      </div>
    </div>
  );
}

function Block({ n, title, hint, children }: { n: number; title: string; hint: string; children: ReactNode }) {
  return (
    <section className="plate studio-block">
      <div className="studio-block-head">
        <span className="studio-n">{n}</span>
        <div><h2 className="h-sub">{title}</h2><p className="xs muted">{hint}</p></div>
      </div>
      {children}
    </section>
  );
}
