/** Dialog kecil untuk aksi pemilik dan pembayaran. Semua lewat actor.act(). */
import { useState } from "react";
import type { Agent } from "../api";
import { useActor } from "../hooks/use-actor";
import { Modal, Spinner } from "./ui";

export function NameDialog({ agent, onClose }: { agent: Agent; onClose: () => void }) {
  const actor = useActor();
  const [name, setName] = useState(agent.named ? agent.name : "");
  const bytes = new TextEncoder().encode(name.trim()).length;
  const ok = bytes >= 1 && bytes <= 32;
  const save = async () => { if (await actor.act("setName", { id: agent.id, name: name.trim() })) onClose(); };
  return (
    <Modal
      title={`Beri nama #${agent.id}`}
      onClose={onClose}
      actions={<>
        <button className="btn btn-quiet" onClick={onClose}>Batal</button>
        <button className="btn btn-primary" disabled={!ok || !!actor.busy} onClick={save}>{actor.busy ? <Spinner /> : null}Simpan nama</button>
      </>}
    >
      <label className="field">
        <span>Nama tersimpan di chain dan terlihat semua orang.</span>
        <input className="input" autoFocus value={name} maxLength={40} placeholder="mis. Penjaga Form"
          onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && ok && save()} />
      </label>
      <span className={`xs ${bytes > 32 ? "" : "dim"}`} style={bytes > 32 ? { color: "var(--danger)" } : undefined}>{bytes}/32 byte</span>
    </Modal>
  );
}

export function StudDialog({ agent, onClose }: { agent: Agent; onClose: () => void }) {
  const actor = useActor();
  const [fee, setFee] = useState(agent.stud.listed ? agent.stud.feeEth : "0");
  const valid = /^\d+(\.\d{1,18})?$/.test(fee.trim().replace(",", "."));
  const save = async () => { if (await actor.act("listForStud", { id: agent.id, feeEth: fee.trim().replace(",", ".") })) onClose(); };
  return (
    <Modal
      title={agent.stud.listed ? "Ubah tarif kawin" : "Buka untuk kawin"}
      onClose={onClose}
      actions={<>
        <button className="btn btn-quiet" onClick={onClose}>Batal</button>
        <button className="btn btn-primary" disabled={!valid || !!actor.busy} onClick={save}>{actor.busy ? <Spinner /> : null}Simpan</button>
      </>}
    >
      <p className="small muted">Orang lain bisa mengawinkan {agent.name} dengan agent mereka dan membayar tarif ini kepadamu. Isi 0 untuk gratis.</p>
      <label className="field">
        <span>Tarif kawin (ETH)</span>
        <input className="input" inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value)} />
      </label>
    </Modal>
  );
}

export function PayDialog({ agent, onClose }: { agent: Agent; onClose: () => void }) {
  const actor = useActor();
  const [amount, setAmount] = useState("0.001");
  const valid = /^\d+(\.\d{1,18})?$/.test(amount.trim().replace(",", ".")) && Number(amount.replace(",", ".")) > 0;
  const save = async () => { if (await actor.act("pay", { id: agent.id, amountEth: amount.trim().replace(",", "."), memo: "sewa" })) onClose(); };
  return (
    <Modal
      title={`Bayar ${agent.name}`}
      onClose={onClose}
      actions={<>
        <button className="btn btn-quiet" onClick={onClose}>Batal</button>
        <button className="btn btn-primary" disabled={!valid || !!actor.busy} onClick={save}>{actor.busy ? <Spinner /> : null}Bayar</button>
      </>}
    >
      <p className="small muted">
        Pembayaran masuk ke pemiliknya. Sebagian mengalir ke leluhurnya: 5% ke pemilik induk, 2,5% ke kakek-nenek, dan seterusnya sampai empat generasi.
      </p>
      <label className="field">
        <span>Jumlah (ETH)</span>
        <input className="input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </label>
    </Modal>
  );
}
