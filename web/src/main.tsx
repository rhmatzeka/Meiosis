import "@fontsource-variable/inter";
import "@fontsource/jetbrains-mono/400.css";
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
 * App ID Privy dan chain datang dari server, bukan dari build: satu bundel
 * yang sama dipakai di laptop (Anvil) dan di VPS (Sepolia).
 */
const status = await fetch("/api/status").then((r) => r.json() as Promise<Status>).catch(() => null);

const chainOf = (s: Status | null): Chain => s && !s.local ? sepolia : defineChain({
  id: s?.chainId ?? 31337, name: "Anvil (lokal)",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [s?.rpc ?? "http://127.0.0.1:8545"] } },
});

function Auth({ children }: { children: ReactNode }) {
  const [privy, setPrivy] = useState<typeof import("./privy") | null>(null);
  const wanted = !!status?.privyAppId;
  useEffect(() => { if (wanted) import("./privy").then(setPrivy).catch(() => {}); }, [wanted]);
  if (wanted && privy) return <privy.PrivyAuth appId={status!.privyAppId!} chain={chainOf(status)}>{children}</privy.PrivyAuth>;
  return <PlainActorProvider pending={wanted}>{children}</PlainActorProvider>;
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
