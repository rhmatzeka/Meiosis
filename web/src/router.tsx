/**
 * Router kecil di atas History API. Aplikasi ini punya sembilan rute; pustaka
 * router tidak memberi apa pun yang tidak bisa ditulis dalam 50 baris.
 */
import { useEffect, useState, useSyncExternalStore, type AnchorHTMLAttributes, type MouseEvent } from "react";

const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  window.addEventListener("popstate", fn);
  return () => { listeners.delete(fn); window.removeEventListener("popstate", fn); };
};
const snapshot = () => location.pathname + location.search;

export function navigate(to: string, opts: { replace?: boolean } = {}) {
  if (to === snapshot()) return;
  history[opts.replace ? "replaceState" : "pushState"](null, "", to);
  listeners.forEach((l) => l());
  if (!opts.replace) window.scrollTo({ top: 0 });
}

export function useLocation() {
  const href = useSyncExternalStore(subscribe, snapshot);
  const url = new URL(href, location.origin);
  return { path: url.pathname, query: url.searchParams };
}

/** Mencocokkan "/agent/:id" dengan path; mengembalikan parameter atau null. */
export function match(pattern: string, path: string): Record<string, string> | null {
  const a = pattern.split("/"), b = path.replace(/\/+$/, "").split("/");
  if (a.length !== b.length) return null;
  const out: Record<string, string> = {};
  for (let i = 0; i < a.length; i++) {
    if (a[i].startsWith(":")) out[a[i].slice(1)] = decodeURIComponent(b[i]);
    else if (a[i] !== b[i]) return null;
  }
  return out;
}

export function Link({ to, onClick, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }) {
  const go = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    navigate(to);
  };
  return <a href={to} onClick={go} {...rest} />;
}

/** Judul tab mengikuti halaman. */
export function useTitle(title: string) {
  useEffect(() => { document.title = title ? `${title} · Meiosis` : "Meiosis · kawinkan agent AI"; }, [title]);
}

/** Nilai yang bertambah tiap `ms`, untuk hitung mundur yang halus di antara blok. */
export function useNow(ms = 1000) {
  const [now, set] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => set(Date.now()), ms); return () => clearInterval(t); }, [ms]);
  return now;
}
