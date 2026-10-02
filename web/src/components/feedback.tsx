/** Kirim masukan dari mana saja, dan laporkan agent yang bermasalah. Keduanya dibaca admin di /admin. */
import { useState } from "react";
import { post } from "../api";
import { useActor } from "../hooks/use-actor";
import { useToast } from "./toast";
import { Modal, Spinner } from "./ui";

function useSend(path: string, done: string) {
  const actor = useActor();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const send = async (body: Record<string, unknown>) => {
    if (actor.mode === "none") { actor.login(); return false; }
    setBusy(true);
    try { await post(path, body, await actor.authHeaders()); toast(done, "ok"); return true; }
    catch (e) { toast((e as Error).message, "bad"); return false; }
    finally { setBusy(false); }
  };
  return { send, busy };
}

export function FeedbackButton() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const { send, busy } = useSend("/api/feedback", "Terima kasih, masukanmu sudah kami terima.");
  return (
    <>
      <button className="link-btn" onClick={() => setOpen(true)}>Beri masukan</button>
      {open && (
        <Modal title="Beri masukan" onClose={() => setOpen(false)} actions={<>
          <button className="btn" onClick={() => setOpen(false)}>Batal</button>
          <button className="btn btn-primary" disabled={busy || !text.trim()} onClick={async () => { if (await send({ text, page: location.pathname })) { setText(""); setOpen(false); } }}>
            {busy ? <Spinner /> : null}Kirim
          </button>
        </>}>
          <p className="small muted">Apa yang membingungkan, rusak, atau kamu harapkan ada? Ditulis bebas.</p>
          <textarea className="textarea" rows={5} maxLength={1000} value={text} onChange={(e) => setText(e.target.value)} aria-label="Isi masukan" />
        </Modal>
      )}
    </>
  );
}

export function ReportLink({ agentId }: { agentId: number }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const { send, busy } = useSend("/api/report", "Laporan terkirim. Admin akan memeriksanya.");
  return (
    <>
      <button className="link-btn xs" onClick={() => setOpen(true)}>Laporkan agent ini</button>
      {open && (
        <Modal title={`Laporkan agent #${agentId}`} onClose={() => setOpen(false)} actions={<>
          <button className="btn" onClick={() => setOpen(false)}>Batal</button>
          <button className="btn btn-danger" disabled={busy || !reason.trim()} onClick={async () => { if (await send({ id: agentId, reason })) { setReason(""); setOpen(false); } }}>
            {busy ? <Spinner /> : null}Kirim laporan
          </button>
        </>}>
          <p className="small muted">Misalnya: isinya kasar, menipu, atau memuat data pribadi orang lain.</p>
          <textarea className="textarea" rows={4} maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Alasan laporan" />
        </Modal>
      )}
    </>
  );
}
