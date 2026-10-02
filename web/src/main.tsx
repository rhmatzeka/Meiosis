import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/components.css";
import "./styles/pages.css";
import "./styles/landing.css";

import { StrictMode, useEffect, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { defineChain, type Chain } from "viem";
import { sepolia } from "viem/chains";
import type { Status } from "./api";
import { App } from "./app";
import { ToastProvider } from "./components/toast";
import { PlainActorProvider } from "./hooks/use-actor";
import { DataProvider } from "./hooks/use-data";
import { PayProvider } from "./components/pay-sheet";

/**
 * Font dilayani server sebagai berkas terpisah (server/static.ts, hanya subset
 * Latin), bukan base64 di dalam CSS yang memblokir tampilan pertama. Ditulis di
 * sini sebagai string supaya bundler tidak menanamnya kembali.
 */
const fontCss = document.createElement("style");
fontCss.textContent = [
  '@font-face{font-family:"Inter Variable";font-style:normal;font-display:swap;font-weight:100 900;src:url("/fonts/inter-latin.woff2") format("woff2-variations")}',
  '@font-face{font-family:"JetBrains Mono";font-style:normal;font-display:swap;font-weight:400;src:url("/fonts/mono-latin.woff2") format("woff2")}',
].join("");
document.head.append(fontCss);

/**
 * App ID Privy dan chain datang dari server, bukan dari build: satu bundel
 * yang sama dipakai di laptop (Anvil) dan di VPS (Sepolia).
 */
const status = await fetch("/api/status").then((r) => r.json() as Promise<Status>).catch(() => null);

const chainOf = (s: Status | null): Chain => s && !s.local ? sepolia : defineChain({
  id: s?.chainId ?? 31337, name: "Anvil (lokal)",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [s?.rpc ?? "http://127.0.0.1:8545"] } },
});

/** Ditulis privy.tsx setelah login berhasil; tanda bahwa SDK Privy perlu dimuat saat halaman dibuka. */
const PRIVY_SESSION = "meiosis:privy";
const hadPrivySession = () => { try { return localStorage.getItem(PRIVY_SESSION) === "1"; } catch { return false; } };

/**
 * SDK Privy (±2 MB) hanya dimuat bila dibutuhkan: pengguna yang pernah masuk
 * (sesinya dipulihkan), atau saat tombol Masuk ditekan. Pengunjung pertama
 * melihat halaman tanpa menunggu SDK itu.
 */
function Auth({ children }: { children: ReactNode }) {
  const appId = status?.privyAppId ?? null;
  const [wanted, setWanted] = useState(() => !!appId && hadPrivySession());
  const [autoLogin, setAutoLogin] = useState(false);
  const [privy, setPrivy] = useState<typeof import("./privy") | null>(null);
  useEffect(() => { if (wanted) import("./privy").then(setPrivy).catch(() => {}); }, [wanted]);
  if (appId && wanted && privy) return <privy.PrivyAuth appId={appId} chain={chainOf(status)} autoLogin={autoLogin}>{children}</privy.PrivyAuth>;
  const onLogin = appId ? () => { setAutoLogin(true); setWanted(true); } : undefined;
  return <PlainActorProvider pending={wanted} onLogin={onLogin}>{children}</PlainActorProvider>;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ToastProvider>
      <DataProvider initial={status}>
        <PayProvider>
        <Auth>
          <App />
        </Auth>
        </PayProvider>
      </DataProvider>
    </ToastProvider>
  </StrictMode>,
);
