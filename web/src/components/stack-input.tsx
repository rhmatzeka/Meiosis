/**
 * Stack & alat sebagai chip bebas: ketik apa saja lalu Enter atau koma.
 * Saran dari KNOWN_STACKS hanya membantu mengetik; nilai di luar daftar sah.
 * Nilainya tetap satu string "a, b" supaya cocok dengan FreeTrait.value.
 */
import { useRef, useState } from "react";
import { KNOWN_STACKS, MAX_TAGS, normalizeStack } from "../../../packages/shared/src/profile";

export function StackInput({ value, onChange, label = "Stack dan alat" }: { value: string; onChange: (v: string) => void; label?: string }) {
  const tags = normalizeStack(value);
  const [draft, setDraft] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const commit = (text = draft) => {
    if (text.trim()) onChange(normalizeStack([...tags, text]).join(", "));
    setDraft("");
  };
  const remove = (t: string) => onChange(tags.filter((x) => x !== t).join(", "));

  return (
    <div className="stack-input" onClick={() => input.current?.focus()}>
      {tags.map((t) => (
        <span className="stack-tag" key={t}>
          {t}
          <button type="button" aria-label={`Hapus ${t}`} onClick={(e) => { e.stopPropagation(); remove(t); }}>×</button>
        </span>
      ))}
      {tags.length < MAX_TAGS && (
        <input
          ref={input} list="known-stacks" aria-label={label} value={draft}
          placeholder={tags.length ? "tambah lagi…" : "ketik lalu Enter, mis. Laravel"}
          onChange={(e) => (e.target.value.includes(",") ? commit(e.target.value.replace(/,/g, "")) : setDraft(e.target.value))}
          onKeyDown={(e) => {
            if ((e.key === "Enter" || e.key === "Tab") && draft.trim()) { e.preventDefault(); commit(); }
            else if (e.key === "Backspace" && !draft && tags.length) remove(tags[tags.length - 1]);
          }}
          onBlur={() => commit()}
        />
      )}
      <span className="stack-count" aria-live="polite">{tags.length}/{MAX_TAGS}</span>
      <datalist id="known-stacks">{KNOWN_STACKS.map((s) => <option key={s} value={s} />)}</datalist>
    </div>
  );
}
