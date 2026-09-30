/**
 * Satu sumber data untuk seluruh aplikasi: status chain, daftar agent, dan
 * kehamilan. Status ditarik berkala; agent dan kehamilan hanya ditarik ulang
 * saat blok berganti atau setelah transaksi (`refresh(true)`), karena di
 * Sepolia setiap tab yang terbuka ikut membebani RPC publik.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { get, type Agent, type Pregnancy, type Status } from "../api";

interface Data {
  status: Status | null;
  agents: Agent[];
  pregnancies: Pregnancy[];
  /** true sampai data pertama tiba. */
  loading: boolean;
  /** Galat terakhir saat menghubungi server, atau null. */
  offline: string | null;
  refresh: (fresh?: boolean) => Promise<void>;
  byId: (id: number) => Agent | undefined;
}

const Ctx = createContext<Data | null>(null);

/** `initial` adalah status yang sudah diambil main.tsx, supaya layar pertama tidak berkedip. */
export function DataProvider({ children, initial = null }: { children: ReactNode; initial?: Status | null }) {
  const [status, setStatus] = useState<Status | null>(initial);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [pregnancies, setPregnancies] = useState<Pregnancy[]>([]);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState<string | null>(null);
  const lastBlock = useRef<number | null>(null);

  const loadLists = useCallback(async (fresh: boolean) => {
    const q = fresh ? "?fresh=1" : "";
    const [a, p] = await Promise.all([get<Agent[]>(`/api/agents${q}`), get<Pregnancy[]>(`/api/pregnancies${q}`)]);
    setAgents(a);
    setPregnancies(p);
  }, []);

  const refresh = useCallback(async (fresh = false) => {
    try {
      const s = await get<Status>("/api/status");
      setStatus(s);
      setOffline(null);
      if (s.chainLive && s.deployed && (fresh || s.block !== lastBlock.current)) {
        lastBlock.current = s.block;
        await loadLists(fresh);
      }
      if (!s.deployed) { setAgents([]); setPregnancies([]); }
    } catch (e) {
      setOffline((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [loadLists]);

  useEffect(() => {
    refresh(true);
    let t: ReturnType<typeof setTimeout>;
    const loop = () => {
      const ms = document.hidden ? 15000 : (status?.local ? 2000 : 6000);
      t = setTimeout(async () => { await refresh(); loop(); }, ms);
    };
    loop();
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status?.local]);

  const value = useMemo<Data>(() => ({
    status, agents, pregnancies, loading, offline, refresh,
    byId: (id) => agents.find((a) => a.id === id),
  }), [status, agents, pregnancies, loading, offline, refresh]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useData() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useData di luar DataProvider");
  return v;
}
