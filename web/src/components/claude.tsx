/**
 * Semua yang berhubungan dengan memakai agent di Claude Code:
 * dialog langkah pemasangan, unduhan `.md` lengkap untuk pemilik, dan kartu
 * saldo pakai + API key di Dompet.
 */
import { useCallback, useEffect, useState } from "react";
import { get, post, type Agent } from "../api";
import { proofFor, useActor } from "../hooks/use-actor";
import { useData } from "../hooks/use-data";
import { Link } from "../router";
import { useToast } from "./toast";
import { Copy, Modal, Spinner } from "./ui";

const mcpCommand = (url: string, key = "mk_KUNCIMU") =>
  `claude mcp add --transport http meiosis ${url} --header "Authorization: Bearer ${key}"`;

const saveFile = (name: string, body: string) => {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([body], { type: "text/markdown" }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};

/** Pemilik mengunduh `.md` lengkap: wallet menandatangani, server memberi berkas berlisensi. */
export function useDownloadFull() {
  const actor = useActor();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const download = useCallback(async (a: Agent) => {
    setBusy(true);
    try {
      const body = await proofFor(actor, `unduh agent #${a.id}`);
      const r = await fetch(`/api/agents/${a.id}/agent.md`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? `HTTP ${r.status}`);
      const name = /filename="([^"]+)"/.exec(r.headers.get("content-disposition") ?? "")?.[1] ?? `meiosis-${a.id}.lengkap.md`;
      saveFile(name, await r.text());
      toast("Berkas lengkap terunduh. Berkas ini berlisensi atas namamu; jangan dibagikan.", "ok");
    } catch (e) {
      toast((e as Error).message, "bad");
    } finally {
      setBusy(false);
    }
  }, [actor, toast]);
  return { download, busy };
}

export function ClaudeDialog({ agent, onClose }: { agent: Agent; onClose: () => void }) {
  const url = `${location.origin}/mcp`;
  return (
    <Modal
      title={`Pakai ${agent.name} di Claude Code`}
      onClose={onClose}
      actions={<>
        <button className="btn btn-quiet" onClick={onClose}>Tutup</button>
        <a className="btn btn-primary" href={`/api/agents/${agent.id}/agent.md`} download>Unduh berkas agent</a>
      </>}
    >
      <ol className="guide-steps small">
        <li><span>Buat API key dan isi saldo pakai di <Link to="/dompet" onClick={onClose}>Dompet</Link>.</span></li>
        <li><span>Pasang Meiosis di Claude Code sekali saja (ganti dengan kuncimu):<br /><Copy text={mcpCommand(url)} label="salin perintah" /></span></li>
        <li><span>Unduh berkas agent, pindahkan ke <code>~/.claude/agents/</code> atau <code>.claude/agents/</code> proyekmu.</span></li>
        <li><span>Di Claude Code minta: <i>"Pakai agent meiosis-{agent.id} untuk …"</i>. Setiap tugas dibayar {agent.rent.priceEth !== "0" ? `${agent.rent.priceEth} ETH` : "sesuai harga sewanya"} dari saldo pakai.</span></li>
      </ol>
      <p className="xs muted">Berkas ini tidak berisi "otak" agent-nya; agent tetap bekerja di server Meiosis, jadi berkasnya aman dibagikan.</p>
    </Modal>
  );
}

// ---------------------------------------------------------------- Dompet

interface Credits { enabled: boolean; balanceEth?: string; balanceWei?: string; defaultPriceEth?: string }
interface KeyRow { prefix: string; label: string; createdAt: number }

export function CreditsCard() {
  const actor = useActor();
  const { status } = useData();
  const [c, setC] = useState<Credits | null>(null);
  const [amount, setAmount] = useState("0.01");
  const [mode, setMode] = useState<"deposit" | "withdraw" | null>(null);

  const load = useCallback(() => {
    if (actor.address) get<Credits>(`/api/credits?address=${actor.address}`).then(setC).catch(() => {});
  }, [actor.address]);
  useEffect(load, [load, status?.block]);

  if (!c?.enabled) return null;
  const valid = /^\d+(\.\d{1,18})?$/.test(amount.trim().replace(",", ".")) && Number(amount.replace(",", ".")) > 0;
  const go = async () => {
    const r = await actor.act(mode === "deposit" ? "deposit" : "withdrawCredits", { amountEth: amount.trim().replace(",", ".") });
    if (r) { setMode(null); load(); }
  };
  return (
    <div className="plate stack wallet-credits">
      <div className="spread">
        <div>
          <h2 className="h-sub">Saldo pakai</h2>
          <p className="xs muted">Untuk memakai agent dari Claude Code. Setiap tugas memotong harga sewa agent-nya (bawaan {c.defaultPriceEth} ETH).</p>
        </div>
        <b className="mono">{c.balanceEth} ETH</b>
      </div>
      <div className="row">
        <button className="btn btn-primary btn-sm" onClick={() => setMode("deposit")}>Isi saldo</button>
        <button className="btn btn-sm btn-outline" disabled={Number(c.balanceWei ?? 0) === 0} onClick={() => setMode("withdraw")}>Tarik saldo</button>
      </div>
      {mode && (
        <Modal
          title={mode === "deposit" ? "Isi saldo pakai" : "Tarik saldo pakai"}
          onClose={() => setMode(null)}
          actions={<>
            <button className="btn btn-quiet" onClick={() => setMode(null)}>Batal</button>
            <button className="btn btn-primary" disabled={!valid || !!actor.busy} onClick={go}>{actor.busy ? <Spinner /> : null}{mode === "deposit" ? "Isi" : "Tarik"}</button>
          </>}
        >
          <label className="field"><span>Jumlah (ETH)</span>
            <input className="input" inputMode="decimal" autoFocus value={amount} onChange={(e) => setAmount(e.target.value)} />
          </label>
          {mode === "deposit" && <p className="xs muted">Saldo yang tidak terpakai bisa ditarik kembali kapan saja.</p>}
        </Modal>
      )}
    </div>
  );
}

export function ApiKeysCard() {
  const actor = useActor();
  const toast = useToast();
  const [keys, setKeys] = useState<KeyRow[]>([]);
  const [fresh, setFresh] = useState<{ key: string; mcpUrl: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    if (actor.address) get<KeyRow[]>(`/api/keys?address=${actor.address}`).then(setKeys).catch(() => {});
  }, [actor.address]);
  useEffect(load, [load]);

  const create = async () => {
    setBusy(true);
    try {
      const r = await post<{ key: string; mcpUrl: string }>("/api/keys", { ...(await proofFor(actor, "buat API key")), label: "Claude Code" });
      setFresh(r);
      load();
    } catch (e) { toast((e as Error).message, "bad"); }
    finally { setBusy(false); }
  };
  const revoke = async (prefix: string) => {
    try {
      await post("/api/keys/revoke", { ...(await proofFor(actor, "cabut API key")), prefix });
      toast("Kunci dicabut.", "ok");
      load();
    } catch (e) { toast((e as Error).message, "bad"); }
  };

  return (
    <div className="plate stack wallet-keys">
      <div>
        <h2 className="h-sub">API key Claude Code</h2>
        <p className="xs muted">Satu kunci untuk menyambungkan Claude Code ke Meiosis. Kunci hanya ditampilkan sekali.</p>
      </div>
      {fresh && (
        <div className="key-fresh stack">
          <span className="xs">Salin sekarang, kunci ini tidak akan ditampilkan lagi:</span>
          <Copy text={fresh.key} />
          <span className="xs">Lalu jalankan di terminal:</span>
          <Copy text={mcpCommand(fresh.mcpUrl, fresh.key)} label="salin perintah pemasangan" />
        </div>
      )}
      {keys.length > 0 && (
        <ul className="key-list">
          {keys.map((k) => (
            <li key={k.prefix}>
              <span className="mono xs">{k.prefix}…</span>
              <span className="xs dim">{new Date(k.createdAt).toLocaleDateString("id-ID")}</span>
              <button className="btn btn-quiet btn-sm" onClick={() => revoke(k.prefix)}>Cabut</button>
            </li>
          ))}
        </ul>
      )}
      <button className="btn btn-sm btn-outline" disabled={busy} onClick={create}>{busy ? <Spinner /> : null}Buat API key</button>
    </div>
  );
}
