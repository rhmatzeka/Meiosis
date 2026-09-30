/**
 * Siapa yang bertransaksi, dan bagaimana.
 *
 *   privy     masuk lewat Privy (email/Google → embedded wallet, atau wallet eksternal)
 *   injected  tanpa Privy App ID, memakai window.ethereum (MetaMask dsb.)
 *   demo      chain lokal, belum masuk: server menandatangani dengan akun demo Anvil
 *   none      chain publik, belum masuk
 *
 * Halaman tidak peduli mode mana yang aktif: semuanya memanggil `act()`.
 * Server menyusun calldata (/api/tx), wallet menandatangani, dan receipt
 * ditunggu lewat server (/api/receipt) supaya semua wallet berperilaku sama.
 */
import { usePrivy, useWallets, type ConnectedWallet } from "@privy-io/react-auth";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { get, post, same } from "../api";
import { useToast } from "../components/toast";
import { humanError } from "../lib/errors";
import { useData } from "./use-data";

type Mode = "privy" | "injected" | "demo" | "none";

export interface Actor {
  mode: Mode;
  address?: string;
  /** Nama untuk ditampilkan: "Alice (akun demo)", alamat pendek, atau email. */
  label?: string;
  ready: boolean;
  /** Privy atau wallet injected tersedia untuk masuk. */
  canLogin: boolean;
  login: () => void;
  logout: () => Promise<void>;
  /** Mengirim satu aksi on-chain. null bila dibatalkan atau gagal (pesan sudah ditampilkan). */
  act: (action: string, args?: Record<string, unknown>, opts?: { quietSuccess?: boolean; as?: string }) => Promise<{ hash: string } | null>;
  /** Label aksi yang sedang berjalan, untuk menonaktifkan tombol. */
  busy: string | null;
  /** Hasil faucet terakhir untuk ditampilkan di Dompet. */
  funding: { ok: boolean; message: string } | null;
  /** Alasan login tidak bisa dipakai (mis. App ID Privy salah), atau null. */
  loginProblem: string | null;
}

const Ctx = createContext<Actor | null>(null);
export const useActor = () => {
  const v = useContext(Ctx);
  if (!v) throw new Error("useActor di luar ActorProvider");
  return v;
};

interface Eip1193 { request(a: { method: string; params?: unknown[] }): Promise<unknown>; on?(e: string, f: (x: unknown) => void): void }
interface BuiltTx { to: string; data: string; value: string; label: string; chainId: number }

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
function useActCore(sign: ((tx: BuiltTx) => Promise<string>) | null, from: string | undefined, onNeedLogin: () => void) {
  const { status, agents, refresh } = useData();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  const act = useCallback<Actor["act"]>(async (action, args = {}, opts = {}) => {
    if (!status) return null;
    const ctx = {
      names: Object.fromEntries(agents.map((a) => [a.id, a.name])),
      block: status.block ?? 0, secPerBlock: status.secPerBlock,
    };
    setBusy(action);
    try {
      let hash: string;
      if (sign && from) {
        const tx = await post<BuiltTx>("/api/tx", { action, args, from });
        hash = await sign(tx);
      } else if (status.local) {
        const r = await post<{ hash: string }>("/api/local-act", { action, args, as: opts.as });
        hash = r.hash;
      } else {
        onNeedLogin();
        return null;
      }
      await waitReceipt(hash, status.secPerBlock);
      await refresh(true);
      if (!opts.quietSuccess) toast("Beres.", "ok");
      return { hash };
    } catch (e) {
      const h = humanError(e, ctx);
      toast(h.message, h.quiet ? "info" : "bad");
      return null;
    } finally {
      setBusy(null);
    }
  }, [status, agents, sign, from, refresh, toast, onNeedLogin]);

  return { act, busy };
}

// --- Privy -----------------------------------------------------------------

export function PrivyActorProvider({ children }: { children: ReactNode }) {
  const { ready, authenticated, login, logout, user, getAccessToken } = usePrivy();
  const { wallets } = useWallets();
  const { status, refresh } = useData();
  const toast = useToast();
  const [funding, setFunding] = useState<Actor["funding"]>(null);
  const funded = useRef(new Set<string>());

  // Privy yang tidak kunjung siap hampir selalu berarti App ID salah atau
  // origin belum didaftarkan di dashboard Privy. Katakan itu, jangan diam.
  const [stalled, setStalled] = useState(false);
  useEffect(() => {
    if (ready) { setStalled(false); return; }
    const t = setTimeout(() => setStalled(true), 10_000);
    return () => clearTimeout(t);
  }, [ready]);

  // Wallet yang dipakai: yang tertaut ke akun, embedded lebih dulu.
  const wallet: ConnectedWallet | undefined = authenticated
    ? wallets.find((w) => w.walletClientType === "privy") ?? wallets.find((w) => same(w.address, user?.wallet?.address)) ?? wallets[0]
    : undefined;
  const address = wallet?.address;

  const sign = useCallback(async (tx: BuiltTx) => {
    if (!wallet) throw new Error("Wallet belum siap.");
    if (wallet.chainId !== `eip155:${tx.chainId}`) await wallet.switchChain(tx.chainId);
    const provider = (await wallet.getEthereumProvider()) as Eip1193;
    return (await provider.request({
      method: "eth_sendTransaction",
      params: [{ from: wallet.address, to: tx.to, data: tx.data, value: tx.value }],
    })) as string;
  }, [wallet]);

  const { act, busy } = useActCore(wallet ? sign : null, address, login);

  // Pengguna baru mendapat ETH untuk biaya jaringan, sekali per alamat.
  useEffect(() => {
    if (!address || !status?.faucet.enabled || funded.current.has(address)) return;
    funded.current.add(address);
    (async () => {
      const token = await getAccessToken().catch(() => null);
      const r = await fetch("/api/faucet", {
        method: "POST",
        headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ address }),
      }).then((x) => x.json()).catch(() => ({ ok: false, message: "Faucet tidak terjangkau." }));
      if (r.hash) {
        setFunding({ ok: true, message: `Kami mengirim ${r.amountEth} ETH untuk biaya jaringan.` });
        toast(`Kami mengirim ${r.amountEth} ETH ke wallet-mu untuk biaya jaringan.`, "ok");
        refresh(true);
      } else if (r.reason !== "saldo-cukup") {
        setFunding({ ok: false, message: r.message ?? "Faucet menolak permintaan." });
      }
    })();
  }, [address, status?.faucet.enabled, getAccessToken, toast, refresh]);

  const email = user?.email?.address ?? user?.google?.email;
  const value: Actor = {
    mode: authenticated && address ? "privy" : status?.local ? "demo" : "none",
    address: authenticated ? address : demoAddress(status),
    label: authenticated ? (email ?? undefined) : status?.local ? "Alice (akun demo)" : undefined,
    ready: ready && !!status,
    canLogin: true,
    login,
    logout: async () => { await logout(); setFunding(null); },
    act, busy, funding,
    loginProblem: stalled ? "Login belum bisa dipakai: Privy tidak merespons. Periksa PRIVY_APP_ID dan daftar origin di dashboard Privy." : null,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

// --- tanpa Privy: wallet injected atau akun demo ------------------------------

const eth = () => (window as unknown as { ethereum?: Eip1193 }).ethereum;
const REMEMBER = "meiosis:wallet";

export function PlainActorProvider({ children }: { children: ReactNode }) {
  const { status } = useData();
  const toast = useToast();
  const [address, setAddress] = useState<string | undefined>();

  // Wallet yang pernah dihubungkan disambung lagi tanpa jendela izin (eth_accounts
  // tidak memunculkan dialog). Tanpa ini, memuat ulang halaman diam-diam
  // mengembalikan pengguna ke akun demo.
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
    mode: address ? "injected" : status?.local ? "demo" : "none",
    address: address ?? demoAddress(status),
    label: address ? undefined : status?.local ? "Alice (akun demo)" : undefined,
    ready: !!status,
    canLogin: !!eth(),
    login,
    logout: async () => { setAddress(undefined); try { localStorage.removeItem(REMEMBER); } catch { /* penyimpanan diblokir */ } },
    act, busy, funding: null,
    loginProblem: !status || eth() || status.local ? null : "Login belum diaktifkan di server ini (PRIVY_APP_ID kosong) dan browser ini tidak punya wallet.",
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Di chain lokal tanpa login, "aku" adalah Alice — akun yang dipakai /api/local-act untuk kawin. */
const demoAddress = (s: ReturnType<typeof useData>["status"]) => (s?.local ? s.accounts[1]?.address : undefined);
