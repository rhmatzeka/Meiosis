/** Dialog kecil untuk aksi pemilik dan pembayaran. Semua lewat actor.act(). */
import { useEffect, useState } from "react";
import { get, type Agent } from "../api";
import { useData } from "../hooks/use-data";
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

/**
 * Jual: dua langkah. Pasar tidak menahan agent-mu; ia hanya butuh izin untuk
 * memindahkannya saat ada pembeli. Izin itu diberikan sekali untuk semua agent.
 */
export function SellDialog({ agent, onClose }: { agent: Agent; onClose: () => void }) {
  const actor = useActor();
  const [price, setPrice] = useState(agent.sale?.priceEth ?? "0.01");
  const [approved, setApproved] = useState<boolean | null>(null);
  const valid = /^\d+(\.\d{1,18})?$/.test(price.trim().replace(",", ".")) && Number(price.replace(",", ".")) > 0;

  useEffect(() => {
    if (!actor.address) return;
    get<{ marketApproved: boolean }>(`/api/royalty?address=${actor.address}`).then((r) => setApproved(r.marketApproved)).catch(() => setApproved(false));
  }, [actor.address]);

  const save = async () => {
    if (!approved) {
      if (!(await actor.act("approveMarket", { id: agent.id }, { quietSuccess: true }))) return;
      setApproved(true);
    }
    if (await actor.act("list", { id: agent.id, priceEth: price.trim().replace(",", ".") })) onClose();
  };
  return (
    <Modal
      title={agent.sale ? `Ubah harga ${agent.name}` : `Jual ${agent.name}`}
      onClose={onClose}
      actions={<>
        <button className="btn btn-quiet" onClick={onClose}>Batal</button>
        <button className="btn btn-primary" disabled={!valid || approved === null || !!actor.busy} onClick={save}>
          {actor.busy ? <Spinner /> : null}{approved ? "Pasang harga" : "Izinkan & pasang harga"}
        </button>
      </>}
    >
      <p className="small muted">
        Agent tetap di tanganmu sampai ada yang membeli. Dari harga jual, 2,5% untuk platform dan sebagian kecil untuk
        pemilik leluhurnya; sisanya untukmu, bisa ditarik di Dompet.
      </p>
      <label className="field">
        <span>Harga jual (ETH)</span>
        <input className="input" inputMode="decimal" autoFocus value={price} onChange={(e) => setPrice(e.target.value)} />
      </label>
      {approved === false && <p className="xs dim">Langkah pertama memberi izin ke Pasar (sekali saja untuk semua agent-mu).</p>}
    </Modal>
  );
}

export function RentPriceDialog({ agent, onClose }: { agent: Agent; onClose: () => void }) {
  const actor = useActor();
  const { status } = useData();
  const [price, setPrice] = useState(BigInt(agent.rent.ownerPriceWei) > 0n ? agent.rent.priceEth : "0.0005");
  const valid = /^\d+(\.\d{1,18})?$/.test(price.trim().replace(",", "."));
  const save = async () => { if (await actor.act("setRentPrice", { id: agent.id, priceEth: price.trim().replace(",", ".") })) onClose(); };
  return (
    <Modal
      title="Harga sewa per tugas"
      onClose={onClose}
      actions={<>
        <button className="btn btn-quiet" onClick={onClose}>Batal</button>
        <button className="btn btn-primary" disabled={!valid || !!actor.busy} onClick={save}>{actor.busy ? <Spinner /> : null}Simpan</button>
      </>}
    >
      <p className="small muted">
        Setiap kali orang lain menyuruh {agent.name} mengerjakan satu tugas, mereka membayar harga ini kepadamu.
        Isi 0 untuk memakai harga bawaan platform ({Number(status?.runPriceEth ?? 0) > 0 ? `${status!.runPriceEth} ETH` : "gratis"}).
      </p>
      <label className="field">
        <span>Harga per tugas (ETH)</span>
        <input className="input" inputMode="decimal" autoFocus value={price} onChange={(e) => setPrice(e.target.value)} />
      </label>
    </Modal>
  );
}
