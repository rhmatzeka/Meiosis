import "@fontsource-variable/bricolage-grotesque";
import "@fontsource-variable/inter";
import "@fontsource/jetbrains-mono/400.css";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/components.css";
import "./styles/pages.css";

import { PrivyProvider } from "@privy-io/react-auth";
import { StrictMode, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { defineChain, type Chain } from "viem";
import { sepolia } from "viem/chains";
import type { Status } from "./api";
import { App } from "./app";
import { ToastProvider } from "./components/toast";
import { PlainActorProvider, PrivyActorProvider } from "./hooks/use-actor";
import { DataProvider } from "./hooks/use-data";

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
  if (!status?.privyAppId) return <PlainActorProvider>{children}</PlainActorProvider>;
  const chain = chainOf(status);
  return (
    <PrivyProvider
      appId={status.privyAppId}
      config={{
        loginMethods: ["email", "google", "wallet"],
        appearance: {
          theme: "#04080d",
          accentColor: "#5fe0cb",
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

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ToastProvider>
      <DataProvider initial={status}>
        <Auth>
          <App />
        </Auth>
      </DataProvider>
    </ToastProvider>
  </StrictMode>,
);
