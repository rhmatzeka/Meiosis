import { Fragment, useEffect, useState, type CSSProperties, type ReactNode } from "react";
import type { Agent } from "../api";
import type { GeneOrigin } from "../lib/genetics";
import { cellLook } from "../lib/look";

/** Sel bercahaya; warnanya dari genome. */
export function Cell({ genome, size = 64, alive = true, className = "", style }: {
  genome: string | bigint; size?: number; alive?: boolean; className?: string; style?: CSSProperties;
}) {
  const l = cellLook(typeof genome === "bigint" ? genome : BigInt(genome));
  return (
    <span
      aria-hidden
      className={`cell ${alive ? "cell-alive" : ""} ${className}`}
      style={{ "--size": `${size}px`, "--h": l.h, "--h2": l.h2, "--sat": `${l.sat}%`, "--glow": l.glow, ...style } as CSSProperties}
    />
  );
}

/**
 * 16 garis, satu per gen. Mode asal: teal dari induk pertama, pink dari induk
 * kedua, emas bila bermutasi. Mode biasa: nilai trait sebagai kecerahan.
 */
export function GenomeStrip({ agent, origin, large, reveal }: {
  agent?: Agent; origin?: GeneOrigin[]; large?: boolean; reveal?: boolean;
}) {
  const bars = origin
    ? origin.map((g) => ({ cls: g.mutated ? "o-m" : g.from === "a" ? "o-a" : "o-b", style: undefined as CSSProperties | undefined }))
    : (agent?.traits ?? []).map((t) => {
        const l = cellLook(BigInt(agent!.genome));
        const level = traitLevel(t.locus, t.value);
        return { cls: "", style: { background: `hsl(${l.h} ${l.sat}% ${22 + level * 44}%)` } as CSSProperties };
      });
  return (
    <div className={`strip ${large ? "strip-lg" : ""} ${reveal ? "strip-reveal" : ""}`} role="img" aria-label="pita genome">
      {bars.map((b, i) => <i key={i} className={b.cls} style={{ ...b.style, "--i": i } as CSSProperties} />)}
    </div>
  );
}

/** Kecerahan 0..1 untuk nilai trait, supaya pita tiap agent punya pola sendiri. */
function traitLevel(_locus: number, value: string) {
  const order = ["none", "low", "plain", "basic", "fast", "terse", "generalist", "medium", "balanced", "standard", "normal",
    "code", "design", "research", "security", "data", "react", "solidity", "python", "build", "fs", "web",
    "high", "strong", "full", "verbose", "build+fs", "web+data"];
  const i = order.indexOf(value);
  return i < 0 ? 0.5 : i / (order.length - 1);
}

export function Legend({ a, b }: { a: string; b: string }) {
  return (
    <div className="legend">
      <span><i style={{ background: "var(--teal)" }} />dari {a}</span>
      <span><i style={{ background: "var(--pink)" }} />dari {b}</span>
      <span><i style={{ background: "var(--gold)" }} />mutasi</span>
    </div>
  );
}

export function Stepper({ step }: { step: 1 | 2 | 3 }) {
  const items = ["Pilih induk", "Pembuahan", "Lahir"];
  return (
    <div className="stepper" aria-label={`Langkah ${step} dari 3`}>
      {items.map((t, i) => (
        <Fragment key={t}>
          {i > 0 && <hr />}
          <span data-n={i + 1} className={`step ${i + 1 === step ? "on" : i + 1 < step ? "done" : ""}`}>{t}</span>
        </Fragment>
      ))}
    </div>
  );
}

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

export function Modal({ title, children, onClose, actions }: {
  title: string; children: ReactNode; onClose: () => void; actions: ReactNode;
}) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    addEventListener("keydown", k);
    return () => removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <h3>{title}</h3>
        {children}
        <div className="modal-actions">{actions}</div>
      </div>
    </div>
  );
}

export function Copy({ text, label }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button" className="copy" title="Salin"
      onClick={() => { navigator.clipboard?.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 1200); }); }}
    >
      {label ?? text} <span aria-hidden>{done ? "✓" : "⧉"}</span>
    </button>
  );
}

export const Spinner = () => <span className="spinner" aria-hidden />;

/** Ikon garis sederhana untuk navigasi bawah di ponsel. */
export function Icon({ name }: { name: "breed" | "grid" | "tree" | "task" | "arena" | "shop" | "spark" | "wallet" }) {
  const p = {
    breed: <><circle cx="8" cy="12" r="5" /><circle cx="16" cy="12" r="5" /></>,
    grid: <><rect x="3.5" y="3.5" width="7" height="7" rx="2" /><rect x="13.5" y="3.5" width="7" height="7" rx="2" /><rect x="3.5" y="13.5" width="7" height="7" rx="2" /><rect x="13.5" y="13.5" width="7" height="7" rx="2" /></>,
    tree: <><circle cx="6" cy="5" r="2.5" /><circle cx="18" cy="5" r="2.5" /><circle cx="12" cy="19" r="2.5" /><path d="M6 7.5c0 5 6 4 6 9M18 7.5c0 5-6 4-6 9" /></>,
    task: <><path d="M5 5h14v14H5z" /><path d="m8.5 12 2.5 2.5 4.5-5" /></>,
    arena: <><path d="M4 20V10M10 20V4M16 20v-8M22 20H2" /></>,
    shop: <><path d="M4 9h16l-1.2 10.2a1 1 0 0 1-1 .8H6.2a1 1 0 0 1-1-.8z" /><path d="M8.5 9V7a3.5 3.5 0 0 1 7 0v2" /></>,
    spark: <><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18" /></>,
    wallet: <><rect x="3" y="6" width="18" height="13" rx="2.5" /><path d="M16 12.5h2M3 9.5h18" /></>,
  }[name];
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{p}</svg>;
}

export function BrandMark() {
  return (
    <svg className="brand-mark" viewBox="0 0 32 32" aria-hidden>
      <defs>
        <radialGradient id="bm-a" cx=".35" cy=".3" r=".75"><stop offset="0" stopColor="#d8fff7" /><stop offset=".4" stopColor="#5fe0cb" /><stop offset="1" stopColor="#0b3d3a" /></radialGradient>
        <radialGradient id="bm-b" cx=".35" cy=".3" r=".75"><stop offset="0" stopColor="#ffe3f7" /><stop offset=".4" stopColor="#f08ad8" /><stop offset="1" stopColor="#461b41" /></radialGradient>
      </defs>
      <circle cx="12" cy="16" r="9" fill="url(#bm-a)" />
      <circle cx="21" cy="16" r="9" fill="url(#bm-b)" opacity=".92" />
    </svg>
  );
}
