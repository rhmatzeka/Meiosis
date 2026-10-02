/**
 * Siapa yang bertransaksi, dan bagaimana.
 *
 *   privy     masuk lewat Privy (email/Google → embedded wallet, atau wallet eksternal)
 *   injected  tanpa Privy App ID, memakai window.ethereum (MetaMask dsb.)
 *   none      belum masuk: setiap aksi meminta masuk dulu
 *
 * Halaman tidak peduli mode mana yang aktif: semuanya memanggil `act()`.
 * Server menyusun calldata (/api/tx), wallet menandatangani, dan receipt
 * ditunggu lewat server (/api/receipt) supaya semua wallet berperilaku sama.
 */
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { get, post, same } from "../api";
import { useToast } from "../components/toast";
import { humanError } from "../lib/errors";
import { affordability } from "../lib/afford";
import { addPending, removePending } from "../lib/pending";
import { ethText, usePay } from "../components/pay-sheet";
import { useData } from "./use-data";

type Mode = "privy" | "injected" | "none";

export interface Actor {
  mode: Mode;
  address?: string;
  /** Nama untuk ditampilkan: email, atau kosong (UI memakai alamat pendek). */
  label?: string;
  ready: boolean;
  /** Privy atau wallet injected tersedia untuk masuk. */
  canLogin: boolean;
  login: () => void;
  logout: () => Promise<void>;
  /** Mengirim satu aksi on-chain. null bila dibatalkan atau gagal (pesan sudah ditampilkan). */
  act: (action: string, args?: Record<string, unknown>, opts?: { quietSuccess?: boolean; as?: string; split?: string }) => Promise<{ hash: string } | null>;
  /** Label aksi yang sedang berjalan, untuk menonaktifkan tombol. */
  busy: string | null;
  /** Hasil faucet terakhir untuk ditampilkan di Dompet. */
  funding: { ok: boolean; message: string } | null;
  /** Alasan login tidak bisa dipakai (mis. App ID Privy salah), atau null. */
  loginProblem: string | null;
  /** Menandatangani pesan dengan wallet pengguna (personal_sign). null bila belum masuk. */
  sign: ((message: string) => Promise<string>) | null;
  /** Header identitas untuk endpoint yang memakai jatah gratis (token Privy, atau alamat di mode uji). */
  authHeaders: () => Promise<Record<string, string>>;
}

export interface QuotaLeft { tasks: number; tasksPerDay: number; studio: number; studioPerDay: number; resetsAt: number }

/** Sisa jatah gratis hari ini untuk pengguna yang sedang masuk; null bila belum masuk atau gagal. */
export function useQuota(actor: Actor, refreshKey: unknown = null) {
  const [left, setLeft] = useState<QuotaLeft | null>(null);
  useEffect(() => {
    if (actor.mode === "none") { setLeft(null); return; }
    let live = true;
    actor.authHeaders()
      .then((h) => fetch("/api/quota", { headers: h }))
      .then((r) => (r.ok ? r.json() : null))
      .then((q) => live && setLeft(q))
      .catch(() => live && setLeft(null));
    return () => { live = false; };
  }, [actor.mode, actor.address, refreshKey]);
  return left;
}

/** Bukti siapa peminta untuk endpoint server: tanda tangan wallet pengguna. */
export async function proofFor(actor: Actor, action: string): Promise<Record<string, string>> {
  if (!actor.address || !actor.sign) throw new Error("Masuk dulu.");
  const { getAddress } = await import("viem");
  const message = `Meiosis: ${action} untuk ${getAddress(actor.address)} pada ${new Date().toISOString()}`;
  return { address: actor.address, message, signature: await actor.sign(message) };
}

export const ActorCtx = createContext<Actor | null>(null);
export const useActor = () => {
  const v = useContext(ActorCtx);
  if (!v) throw new Error("useActor di luar ActorProvider");
  return v;
};

export interface Eip1193 { request(a: { method: string; params?: unknown[] }): Promise<unknown>; on?(e: string, f: (x: unknown) => void): void }
export interface BuiltTx { to: string; data: string; value: string; label: string; chainId: number; feeWei?: string | null }

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Menunggu receipt lewat server — sama untuk embedded wallet, MetaMask, dan Anvil. */
async function waitReceipt(hash: string, secPerBlock: number) {
  const deadline = Date.now() + 5 * 60_000;
  while (Date.now() < deadline) {
    const r = await get<{ status: string }>(`/api/receipt/${hash}`).catch(() => ({ status: "pending" }));
    if (r.status === "success") return;
    if (r.status === "reverted") throw new Error("Transaksi ditolak kontrak.");
    await sleep(Math.max(1000, (secPerBlock * 1000) / 3));
  }
  throw new Error("Transaksi belum masuk blok setelah 5 menit. Cek lagi nanti di Dompet.");
}

/** Bagian yang sama untuk semua mode; tiap mode hanya menyediakan cara menandatangani. */
export function useActCore(sign: ((tx: BuiltTx) => Promise<string>) | null, from: string | undefined, onNeedLogin: () => void) {
  const { status, agents, refresh } = useData();
  const toast = useToast();
  const pay = usePay();
  const [busy, setBusy] = useState<string | null>(null);

  const act = useCallback<Actor["act"]>(async (action, args = {}, opts = {}) => {
    if (!status) return null;
    const ctx = {
      names: Object.fromEntries(agents.map((a) => [a.id, a.name])),
      block: status.block ?? 0, secPerBlock: status.secPerBlock,
    };
    setBusy(action);
    let hash = "", label = action;
    try {
      if (!sign || !from) { onNeedLogin(); return null; }
      const tx = await post<BuiltTx>("/api/tx", { action, args, from });
      label = tx.label;
      // Konfirmasi dan cek saldo sebelum wallet diminta tanda tangan.
      const valueWei = BigInt(tx.value), feeWei = tx.feeWei ? BigInt(tx.feeWei) : null;
      const balanceWei = BigInt((await get<{ balanceWei?: string }>(`/api/royalty?address=${from}`).catch(() => ({ balanceWei: "0" }))).balanceWei ?? "0");
      if (valueWei > 0n) {
        if (!(await pay.confirm({ label: tx.label, valueWei, feeWei, balanceWei, split: opts.split }))) return null;
      } else {
        const can = affordability(balanceWei, 0n, feeWei);
        if (!can.ok) { toast(`Saldo kurang ${ethText(can.shortWei)} untuk biaya jaringan. Isi saldo di Dompet, lalu coba lagi.`, "bad"); return null; }
      }
      hash = await sign(tx);
      addPending({ hash, label: tx.label, at: Date.now() });
      pay.progress({ hash, label: tx.label, state: "wait" });
      await waitReceipt(hash, status.secPerBlock);
      removePending(hash);
      pay.progress({ hash, label: tx.label, state: "done" });
      await refresh(true);
      if (!opts.quietSuccess) toast("Beres.", "ok");
      return { hash };
    } catch (e) {
      if (hash) { pay.progress({ hash, label, state: "bad" }); if (/ditolak kontrak/.test((e as Error).message)) removePending(hash); }
      const h = humanError(e, ctx);
      toast(h.message, h.quiet ? "info" : "bad");
      return null;
    } finally {
      setBusy(null);
    }
  }, [status, agents, sign, from, refresh, toast, onNeedLogin, pay]);

  return { act, busy };
}

// --- tanpa Privy: wallet injected --------------------------------------------

const eth = () => (window as unknown as { ethereum?: Eip1193 }).ethereum;
const REMEMBER = "meiosis:wallet";

/**
 * `pending`: Privy sedang dimuat. Jangan tawarkan MetaMask atau menyebut login
 * tidak tersedia; sebentar lagi provider ini diganti PrivyActorProvider.
 */
export function PlainActorProvider({ children, pending = false }: { children: ReactNode; pending?: boolean }) {
  const { status } = useData();
  const toast = useToast();
  const [address, setAddress] = useState<string | undefined>();

  // Wallet yang pernah dihubungkan disambung lagi tanpa jendela izin (eth_accounts
  // tidak memunculkan dialog). Tanpa ini, memuat ulang halaman diam-diam
  // mengeluarkan pengguna.
  useEffect(() => {
    const p = eth();
    if (!p) return;
    p.on?.("accountsChanged", (a) => {
      const next = (a as string[])[0];
      setAddress(next);
      try { next ? localStorage.setItem(REMEMBER, "1") : localStorage.removeItem(REMEMBER); } catch { /* penyimpanan diblokir */ }
    });
    let remembered = false;
    try { remembered = localStorage.getItem(REMEMBER) === "1"; } catch { /* penyimpanan diblokir */ }
    if (remembered) p.request({ method: "eth_accounts" }).then((a) => setAddress((a as string[])[0])).catch(() => {});
  }, []);

  const login = useCallback(async () => {
    const p = eth();
    if (!p) { toast("Tidak ada wallet di browser ini. Pasang MetaMask atau wallet EVM lain.", "bad"); return; }
    try {
      const [a] = (await p.request({ method: "eth_requestAccounts" })) as string[];
      setAddress(a);
      try { localStorage.setItem(REMEMBER, "1"); } catch { /* penyimpanan diblokir */ }
    } catch (e) {
      toast(humanError(e, { names: {}, block: 0, secPerBlock: 12 }).message, "info");
    }
  }, [toast]);

  const sign = useCallback(async (tx: BuiltTx) => {
    const p = eth()!;
    const want = "0x" + tx.chainId.toString(16);
    if ((await p.request({ method: "eth_chainId" })) !== want) {
      try {
        await p.request({ method: "wallet_switchEthereumChain", params: [{ chainId: want }] });
      } catch (e) {
        if ((e as { code?: number }).code !== 4902 || !status?.rpc) throw e;
        await p.request({ method: "wallet_addEthereumChain", params: [{
          chainId: want, chainName: status.chainName, rpcUrls: [status.rpc],
          nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
        }] });
      }
    }
    return (await p.request({ method: "eth_sendTransaction", params: [{ from: address, to: tx.to, data: tx.data, value: tx.value }] })) as string;
  }, [address, status]);

  const { act, busy } = useActCore(address ? sign : null, address, login);

  const value: Actor = {
    mode: address ? "injected" : "none",
    address,
    label: undefined,
    ready: !!status && !pending,
    canLogin: !pending && !!eth(),
    login,
    logout: async () => { setAddress(undefined); try { localStorage.removeItem(REMEMBER); } catch { /* penyimpanan diblokir */ } },
    act, busy, funding: null,
    sign: address ? (async (message: string) => (await eth()!.request({ method: "personal_sign", params: [message, address] })) as string) : null,
    authHeaders: async (): Promise<Record<string, string>> => (status?.testMode && address ? { "x-test-user": address } : {}),
    loginProblem: pending || !status || eth() ? null : "Login belum diaktifkan di server ini (PRIVY_APP_ID kosong) dan browser ini tidak punya wallet.",
  };
  return <ActorCtx.Provider value={value}>{children}</ActorCtx.Provider>;
}

