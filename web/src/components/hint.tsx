/** Ikon "?" kecil di samping istilah; dibuka dengan klik atau fokus keyboard, ditutup dengan Esc atau klik di luar. */
import { useEffect, useId, useRef, useState } from "react";
import { GLOSSARY, type GlossaryKey } from "../lib/glossary";

export function Hint({ k }: { k: GlossaryKey }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const out = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    addEventListener("keydown", esc);
    addEventListener("mousedown", out);
    return () => { removeEventListener("keydown", esc); removeEventListener("mousedown", out); };
  }, [open]);
  const g = GLOSSARY[k];
  return (
    <span className="hint" ref={ref}>
      <button
        type="button" className="hint-btn" aria-label={`Apa itu ${g.term.toLowerCase()}?`} aria-expanded={open} aria-describedby={open ? id : undefined}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen((o) => !o); }}
      >?</button>
      {open && <span role="tooltip" id={id} className="hint-pop"><b>{g.term}</b> {g.short}</span>}
    </span>
  );
}
