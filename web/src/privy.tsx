/**
 * Login Privy. Dimuat terpisah (import dinamis) karena SDK-nya besar: halaman
 * tampil lebih dulu, dan tanpa PRIVY_APP_ID berkas ini tidak pernah diunduh.
 */
import { PrivyProvider, usePrivy, useWallets, type ConnectedWallet } from "@privy-io/react-auth";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { Chain } from "viem";
import { same } from "./api";
import { useToast } from "./components/toast";
import { ActorCtx, demoAddress, useActCore, type Actor, type BuiltTx, type Eip1193 } from "./hooks/use-actor";
import { useData } from "./hooks/use-data";

export function PrivyAuth({ appId, chain, children }: { appId: string; chain: Chain; children: ReactNode }) {
  return (
    <PrivyProvider
      appId={appId}
      config={{
        loginMethods: ["email", "google", "wallet"],
        appearance: {
          theme: "#04080d",
          accentColor: "#5b5cf6",
          landingHeader: "Masuk ke Meiosis",
          loginMessage: "Wallet dibuatkan otomatis kalau kamu belum punya.",
          walletList: ["detected_wallets", "metamask", "rabby_wallet", "coinbase_wallet", "wallet_connect"],
        },
        embeddedWallets: { ethereum: { createOnLogin: "users-without-wallets" }, showWalletUIs: false },
        defaultChain: chain,
        supportedChains: [chain],
      }}
    >
      <PrivyActorProvider>{children}</PrivyActorProvider>
    </PrivyProvider>
  );
}

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

  const signMessage = useCallback(async (message: string) => {
    if (!wallet) throw new Error("Wallet belum siap.");
    const provider = (await wallet.getEthereumProvider()) as Eip1193;
    return (await provider.request({ method: "personal_sign", params: [message, wallet.address] })) as string;
  }, [wallet]);

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
    sign: authenticated && wallet ? signMessage : null,
    loginProblem: stalled ? "Login belum bisa dipakai: Privy tidak merespons. Periksa PRIVY_APP_ID dan daftar origin di dashboard Privy." : null,
  };
  return <ActorCtx.Provider value={value}>{children}</ActorCtx.Provider>;
}
