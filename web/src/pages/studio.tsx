/**
 * Studio: membuat agent dengan kata-kata sendiri.
 *
 * Tidak ada daftar pilihan. Pembuat menceritakan agent yang ia butuhkan, AI
 * (atau dirinya sendiri) mengisi "otak" agent: tugas, sifat bebas berbentuk
 * "nama sifat : isi", dan instruksi rahasia. Server menerjemahkan profil itu
 * ke genome saat agent dibuat; model AI-nya dipilih penyelenggara.
 */
import { Hint } from "../components/hint";
import { markTaskRun } from "../lib/onboarding";
import { useEffect, useMemo, useState } from "react";
import { normalizeTraits, type FreeTrait } from "../../../packages/shared/src/profile";
import { studioGenome } from "../../../packages/shared/src/studio";
import { get, post, same, type Agent } from "../api";
import { useToast } from "../components/toast";
import { TraitEditor } from "../components/trait-editor";
import { Cell, Spinner } from "../components/ui";
import { proofFor, useActor, useQuota } from "../hooks/use-actor";
import { useData } from "../hooks/use-data";
import { emptyTraits, studioFormProblems } from "../lib/studio-form";
import { Link, navigate, useLocation, useTitle } from "../router";

const MAX_INSTRUCTIONS = 4000;
const EXAMPLES = [
  "Bikin REST API pakai Laravel dan MySQL, jawab santai",
  "Penulis caption Instagram untuk toko kue, bahasanya hangat",
  "Auditor smart contract Solidity yang teliti mencari celah",
  "Asisten riset yang merangkum jurnal untuk mahasiswa",
];

interface Suggestion { name: string; role: string; traits: FreeTrait[]; instructions: string; source: "ai" | "heuristic" }

/** Hasil AI masuk ke baris yang masih kosong; yang sudah diisi pengguna tidak ditimpa. */
function mergeTraits(current: FreeTrait[], incoming: FreeTrait[]): FreeTrait[] {
  const out = current.map((t) => ({ ...t }));
  for (const s of incoming) {
    const row = out.find((t) => t.label.trim().toLowerCase() === s.label.trim().toLowerCase());
    if (!row) out.push({ ...s });
    else if (!row.value.trim()) row.value = s.value;
  }
  return out.slice(0, 12);
}

export function StudioPage() {
  const { query } = useLocation();
  const editId = Number(query.get("sunting")) || 0;
  useTitle(editId ? "Sunting otak" : "Studio");
  const { status, agents, refresh, byId } = useData();
  const editing = editId ? byId(editId) : undefined;
  const actor = useActor();
  const toast = useToast();
  const [description, setDescription] = useState("");
  const [started, setStarted] = useState(false);
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [traits, setTraits] = useState<FreeTrait[]>(emptyTraits);
  const [instructions, setInstructions] = useState("");
  const [editingSoul, setEditingSoul] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [sending, setSending] = useState(false);
  const [tryTask, setTryTask] = useState("");
  const [trying, setTrying] = useState(false);
  const [tried, setTried] = useState<{ output: string; model: string } | null>(null);
  const quota = useQuota(actor, `${sending}${trying}`);
  const [loadedEdit, setLoadedEdit] = useState(0);

  // Mode sunting: pemilik membuka otak agent-nya (profil + instruksi miliknya sendiri).
  useEffect(() => {
    if (!editId || !editing || loadedEdit === editId || actor.mode === "none" || !same(editing.owner, actor.address)) return;
    setLoadedEdit(editId);
    (async () => {
      try {
        const s = await post<{ role: string; traits: FreeTrait[]; instructions: string }>(`/api/agents/${editId}/soul`, await proofFor(actor, `sunting otak #${editId}`));
        setName(editing.name);
        setRole(s.role);
        setTraits(s.traits.length ? mergeTraits(s.traits, []) : emptyTraits());
        setInstructions(s.instructions);
        setStarted(true);
      } catch (e) {
        toast((e as Error).message, "bad");
      }
    })();
  }, [editId, editing, actor.mode, actor.address, loadedEdit]);

  const problems = studioFormProblems({ name, role, traits, instructions }, agents.filter((a) => a.id !== editId).map((a) => a.name));
  const blocking = problems.filter((p) => p.blocking);
  const filled = normalizeTraits(traits);
  const fee = status?.market?.studioFeeEth ?? null;
  const unavailable = fee === null;
  const free = fee !== null && Number(fee) === 0;
  const studioFull = !editId && quota !== null && quota.studio <= 0;

  // Avatar pratinjau: warna sel ikut berubah saat profil disunting.
  const avatar = useMemo(() => {
    let h = 0n;
    for (const ch of name + role + filled.map((t) => t.value).join("")) h = (h * 131n + BigInt(ch.codePointAt(0)!)) & ((1n << 256n) - 1n);
    return "0x" + h.toString(16).padStart(64, "0");
  }, [name, role, filled]);

  const design = async () => {
    if (!description.trim()) { toast("Ceritakan dulu agent seperti apa yang kamu butuhkan.", "info"); return; }
    setThinking(true);
    try {
      const s = await post<Suggestion>("/api/studio/suggest", { description });
      setTraits((cur) => mergeTraits(cur, s.traits));
      if (!name.trim()) setName(s.name);
      if (!role.trim()) setRole(s.role);
      if (!instructions.trim()) setInstructions(s.instructions);
      setStarted(true);
      toast(s.source === "ai" ? "Rancangan dari AI sudah diisi. Ubah apa saja sesukamu." : "Rancangan awal diisi dari kata-katamu. Ubah apa saja sesukamu.", "ok");
    } catch (e) {
      toast((e as Error).message, "bad");
    } finally {
      setThinking(false);
    }
  };

  const tryIt = async () => {
    if (actor.mode === "none") { actor.login(); return; }
    setTrying(true);
    try {
      setTried(await post<{ output: string; model: string }>("/api/studio/try", { role, traits: filled, instructions, task: tryTask }, await actor.authHeaders()));
      markTaskRun();
    } catch (e) {
      toast((e as Error).message, "bad");
    } finally {
      setTrying(false);
    }
  };

  const save = async () => {
    if (!editing) return;
    setSending(true);
    try {
      const soul = await post<{ hash: string }>("/api/studio/soul", { role, traits: filled, instructions, edit: editing.id }, await actor.authHeaders());
      const r = await actor.act("setSoul", { id: editing.id, soulHash: soul.hash }, { quietSuccess: true });
      if (r && name.trim() && name.trim() !== editing.name) await actor.act("setName", { id: editing.id, name: name.trim() }, { quietSuccess: true });
      if (r) { await refresh(true); toast("Otak agent sudah diperbarui.", "ok"); navigate(`/agent/${editing.id}`); return; }
    } catch (e) {
      toast((e as Error).message, "bad");
    }
    setSending(false);
  };

  const create = async () => {
    if (actor.mode === "none") { actor.login(); return; }
    if (editing) return save();
    setSending(true);
    try {
      const soul = await post<{ hash: string; loci: number[] }>("/api/studio/soul", { role, traits: filled, instructions }, await actor.authHeaders());
      const r = await actor.act("studioCreate", { traits: soul.loci, name: name.trim(), soulHash: soul.hash }, { quietSuccess: true });
      if (r) {
        const genome = "0x" + studioGenome(soul.loci).toString(16).padStart(64, "0");
        const fresh = await get<Agent[]>("/api/agents?fresh=1").catch(() => agents);
        await refresh(true);
        const mine = fresh.filter((a) => a.designed && same(a.owner, actor.address) && a.genome === genome).sort((x, y) => y.id - x.id)[0];
        if (mine) { navigate(`/agent/${mine.id}?baru=1`); return; }
      }
    } catch (e) {
      toast((e as Error).message, "bad");
    }
    setSending(false);
  };

  const notOwner = !!editId && !!editing && actor.mode !== "none" && !same(editing.owner, actor.address);
  const disabled = notOwner || unavailable || sending || !!actor.busy || blocking.length > 0 || studioFull || (actor.mode === "none" && !!actor.loginProblem);
  const cta = editId
    ? (sending ? <><Spinner />Menyimpan…</> : actor.mode === "none" ? "Masuk untuk menyunting" : "Simpan perubahan")
    : sending ? <><Spinner />Membuat…</> : actor.mode === "none" ? "Masuk untuk membuat" : free ? "Buat agent" : `Buat agent · ${fee} ETH`;
  const costNote = free ? "Gratis selama beta. Kamu hanya membayar biaya jaringan yang sangat kecil." : fee ? `Biaya ${fee} ETH sekali bayar, ditambah biaya jaringan.` : "";

  return (
    <div className="stack-lg studio-page">
      <div className="page-head">
        <h1 className="h-page">{editId ? `Sunting otak ${editing?.name ?? `#${editId}`}` : "Studio"}</h1>
        <p>{editId
          ? "Ubah tugas, sifat, dan instruksinya. DNA agent tidak berubah, dan anak yang sudah lahir tetap memakai otak versi saat ia lahir. Anak berikutnya mewarisi versi baru ini."
          : "Ceritakan agent yang kamu butuhkan. Semua isinya kamu tulis sendiri dengan bebas, atau biarkan AI menyusun rancangan awalnya."}</p>
      </div>
      {notOwner && <div className="banner" style={{ width: "100%", margin: 0 }}><div>Hanya pemilik agent ini yang bisa menyunting otaknya.</div></div>}
      {editId > 0 && actor.mode === "none" && <div className="banner banner-info" style={{ width: "100%", margin: 0 }}><div>Masuk dengan wallet pemilik untuk membuka otak agent ini.</div></div>}

      {unavailable && <div className="banner" style={{ width: "100%", margin: 0 }}><div>Studio belum dipasang di chain ini.</div></div>}

      <div className="studio">
        <div className="stack-lg">
          {!editId && <section className="plate studio-ask">
            <label className="h-sub" htmlFor="studio-desc">Agent seperti apa yang kamu butuhkan?</label>
            <textarea
              id="studio-desc" className="textarea" rows={3} value={description} maxLength={2000}
              placeholder="mis. Bikin REST API pakai Laravel dan MySQL, jawab santai"
              onChange={(e) => setDescription(e.target.value)}
            />
            <div className="studio-examples">
              {EXAMPLES.map((x) => <button key={x} type="button" className="idea" onClick={() => setDescription(x)}>{x}</button>)}
            </div>
            <div className="row">
              <button className="btn btn-primary" disabled={thinking} onClick={design}>{thinking ? <><Spinner />Merancang…</> : "Rancang untukku"}</button>
              {!started && <button type="button" className="link-btn" onClick={() => setStarted(true)}>atau isi sendiri dari nol</button>}
            </div>
          </section>}

          {started && (
            <section className="plate studio-sheet" aria-label="Otak agent">
              <div className="sheet-head">
                <Cell genome={avatar} size={56} />
                <div className="sheet-title">
                  <input className="sheet-name" value={name} maxLength={40} placeholder="Nama agent" aria-label="Nama agent" onChange={(e) => setName(e.target.value)} />
                  <input className="sheet-role" value={role} maxLength={120} placeholder="Tugasnya dalam satu kalimat, mis. Pembuat REST API untuk toko online" aria-label="Tugas agent" onChange={(e) => setRole(e.target.value)} />
                </div>
              </div>
              {problems.filter((p) => p.field === "name" || p.field === "role").map((p) => (
                <p key={p.message} className={`xs ${p.blocking ? "text-bad" : "muted"}`}>{p.message}</p>
              ))}

              <div className="sheet-section">
                <h2 className="h-sub">Sifat <Hint k="sifat" /></h2>
                <p className="xs muted">Tulis apa saja. Ganti nama sifatnya, hapus yang tidak perlu, atau tambah sifat baru. Sifat ini yang diwariskan ke anaknya kalau dikawinkan.</p>
                <TraitEditor value={traits} onChange={setTraits} />
                {problems.filter((p) => p.field === "traits").map((p) => <p key={p.message} className={`xs ${p.blocking ? "text-bad" : "muted"}`}>{p.message}</p>)}
              </div>

              <div className="sheet-section">
                <div className="spread">
                  <h2 className="h-sub">Instruksi <Hint k="instruksi" /></h2>
                  <button type="button" className="btn btn-sm" onClick={() => setEditingSoul((v) => !v)}>{editingSoul ? "Selesai" : instructions.trim() ? "Sunting instruksi" : "Tulis instruksi"}</button>
                </div>
                {editingSoul
                  ? <textarea
                      className="textarea studio-soul" rows={9} value={instructions} autoFocus
                      placeholder={"mis.\nKamu spesialis REST API Laravel.\n- Selalu validasi input.\n- Tulis tes untuk setiap endpoint."}
                      onChange={(e) => setInstructions(e.target.value)}
                    />
                  : <p className="studio-soul-preview small">{instructions.trim() || "Belum ada instruksi. Boleh dikosongkan."}</p>}
                <span className={`xs ${instructions.length > MAX_INSTRUCTIONS ? "text-bad" : "dim"}`}>{instructions.length}/{MAX_INSTRUCTIONS} karakter</span>
                <p className="xs muted">
                  Instruksi tidak ditampilkan ke orang lain, tapi dikirim ke penyedia model AI (Groq) saat agent bekerja.
                  Semua agent memakai model AI pilihan Meiosis; isian di atas mengatur cara ia bekerja, bukan modelnya.
                </p>
              </div>

              <div className="sheet-section studio-try">
                <h2 className="h-sub">Coba dulu</h2>
                <p className="xs muted">
                  Beri satu tugas untuk melihat cara agent ini menjawab sebelum dibuat.
                  {quota ? ` Memakai 1 dari ${quota.tasks} tugas gratis yang tersisa hari ini.` : " Memakai 1 tugas dari jatah gratis harianmu."}
                </p>
                <div className="try-row">
                  <input
                    className="input" value={tryTask} maxLength={1000} aria-label="Tugas untuk dicoba"
                    placeholder="mis. Buat endpoint login dengan validasi"
                    onChange={(e) => setTryTask(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && tryTask.trim() && !trying && tryIt()}
                  />
                  <button className="btn" disabled={trying || !tryTask.trim() || blocking.length > 0} onClick={tryIt}>{trying ? <><Spinner />Menjawab…</> : "Coba"}</button>
                </div>
                {tried && <pre className="try-output" aria-live="polite">{tried.output}</pre>}
              </div>
            </section>
          )}
        </div>

        <aside className="studio-summary plate">
          <div className="summary-head">
            <Cell genome={avatar} size={44} alive={false} />
            <div style={{ minWidth: 0 }}>
              <div className="summary-name">{name.trim() || "Agent baru"}</div>
              <div className="xs muted summary-role">{role.trim() || "Belum ada tugas"}</div>
            </div>
          </div>
          {filled.length > 0 && (
            <ul className="summary-traits">
              {filled.slice(0, 6).map((t) => <li key={t.label}><span>{t.label}</span>{t.value}</li>)}
              {filled.length > 6 && <li className="dim">+{filled.length - 6} sifat lain</li>}
            </ul>
          )}
          <button className="btn btn-primary btn-lg" disabled={disabled} onClick={create}>{cta}</button>
          {blocking[0] && started && <p className="xs text-bad">{blocking[0].message}</p>}
          {studioFull && <p className="xs text-bad">Batas {quota!.studioPerDay} agent baru per hari tercapai. Buka lagi besok jam 07.00 WIB.</p>}
          <p className="xs muted">
            {editId ? "Menyimpan perubahan hanya memakai biaya jaringan." : costNote}
            {quota && !studioFull ? ` Sisa ${quota.studio} dari ${quota.studioPerDay} agent baru hari ini.` : ""}
            {" "}Agent-nya jadi milikmu: bisa dipakai, dijual, disewakan, dikawinkan, dan disunting lagi. <Link to="/panduan#studio">Selengkapnya</Link>
          </p>
        </aside>
      </div>

      <div className="sticky-cta" aria-hidden={false}>
        <div style={{ minWidth: 0 }}>
          <div className="summary-name">{name.trim() || "Agent baru"}</div>
          <div className="xs muted">{free ? "Gratis selama beta" : fee ? `${fee} ETH` : ""}</div>
        </div>
        <button className="btn btn-primary" disabled={disabled} onClick={create}>{cta}</button>
      </div>
    </div>
  );
}
