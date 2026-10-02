/**
 * Konfirmasi pembayaran dan progres transaksi milik Meiosis sendiri.
 *
 * Jendela wallet Privy dimatikan (showWalletUIs: false), jadi tanpa ini klik
 * "Bayar" langsung memindahkan ETH. Lembar ini menyebut apa yang dibayar,
 * perkiraan biaya jaringan, dan saldo; bila kurang, tombol Bayar dimatikan.
 */
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { formatEther } from "viem";
import { useData } from "../hooks/use-data";
import { FEE_FALLBACK_WEI, affordability } from "../lib/afford";
import { navigate } from "../router";
import { Modal, Spinner } from "./ui";

export interface PayRequest { label: string; valueWei: bigint; feeWei: bigint | null; balanceWei: bigint; split?: string }
type TxState = { hash: string; label: string; state: "wait" | "done" | "bad" } | null;
interface Pay { confirm: (r: PayRequest) => Promise<boolean>; progress: (t: TxState) => void }

const PayCtx = createContext<Pay>({ confirm: async () => true, progress: () => {} });
export const usePay = () => useContext(PayCtx);

export const ethText = (wei: bigint) => `${Number(formatEther(wei)).toLocaleString("id-ID", { maximumFractionDigits: 5 })} ETH`;

export function PayProvider({ children }: { children: ReactNode }) {
  const { status } = useData();
  const [req, setReq] = useState<(PayRequest & { resolve: (ok: boolean) => void }) | null>(null);
  const [tx, setTx] = useState<TxState>(null);

  const confirm = useCallback((r: PayRequest) => new Promise<boolean>((resolve) => setReq({ ...r, resolve })), []);
  const progress = useCallback((t: TxState) => setTx(t), []);
  useEffect(() => {
    if (tx?.state !== "done") return;
    const t = setTimeout(() => setTx(null), 5000);
    return () => clearTimeout(t);
  }, [tx]);

  const close = (ok: boolean) => { req?.resolve(ok); setReq(null); };
  const fee = req ? req.feeWei ?? FEE_FALLBACK_WEI : 0n;
  const can = req ? affordability(req.balanceWei, req.valueWei, req.feeWei) : { ok: true as const };
  const secs = Math.round((status?.secPerBlock ?? 12) * 1.25);
  const explorer = status?.explorer && tx ? `${status.explorer}/tx/${tx.hash}` : null;

  return (
    <PayCtx.Provider value={{ confirm, progress }}>
      {children}
      {req && (
        <Modal title={req.label[0].toUpperCase() + req.label.slice(1)} onClose={() => close(false)} actions={<>
          <button className="btn" onClick={() => close(false)}>Batal</button>
          {can.ok
            ? <button className="btn btn-primary" onClick={() => close(true)}>Bayar</button>
            : <button className="btn btn-primary" onClick={() => { close(false); navigate("/dompet#isi"); }}>Isi saldo</button>}
        </>}>
          <dl className="pay-rows">
            <div><dt>Harga</dt><dd>{ethText(req.valueWei)}</dd></div>
            {req.split && <div className="pay-split"><dt /><dd className="xs muted">{req.split}</dd></div>}
            <div><dt>Biaya jaringan</dt><dd>± {ethText(fee)}</dd></div>
            <div className="pay-total"><dt>Total</dt><dd>± {ethText(req.valueWei + fee)}</dd></div>
            <div><dt>Saldo</dt><dd>{ethText(req.balanceWei)}</dd></div>
          </dl>
          {!can.ok && <p className="small text-bad">Kurang {ethText(can.shortWei)}. Isi saldo dulu di Dompet, lalu coba lagi.</p>}
          {status?.chain === "sepolia" && <p className="xs muted">Dibayar dengan ETH uji di jaringan Sepolia; tidak bernilai uang.</p>}
        </Modal>
      )}
      {tx && (
        <div className={`tx-progress tx-${tx.state}`} role="status" aria-live="polite">
          {tx.state === "wait" && <><Spinner /><span>Menunggu jaringan untuk {tx.label}… biasanya ±{secs} detik.</span></>}
          {tx.state === "done" && <span>Selesai: {tx.label}.</span>}
          {tx.state === "bad" && <span>Transaksi {tx.label} gagal.</span>}
          {explorer && <a href={explorer} target="_blank" rel="noreferrer noopener">Lihat di explorer</a>}
          {tx.state !== "wait" && <button className="link-btn" aria-label="Tutup" onClick={() => setTx(null)}>×</button>}
        </div>
      )}
    </PayCtx.Provider>
  );
}
