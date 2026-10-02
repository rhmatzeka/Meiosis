/**
 * Sifat agent sebagai baris "nama sifat : isi", semuanya teks bebas.
 * Enam baris bawaan hanya titik awal: namanya boleh diganti, barisnya boleh
 * dihapus, dan sifat baru boleh ditambah. Ide hanya menyalin teks ke kolom.
 */
import { MAX_LABEL, MAX_TRAITS, MAX_VALUE, normalizeStack, slotOf, type FreeTrait } from "../../../packages/shared/src/profile";
import { StackInput } from "./stack-input";

export function TraitEditor({ value, onChange }: { value: FreeTrait[]; onChange: (next: FreeTrait[]) => void }) {
  const set = (i: number, patch: Partial<FreeTrait>) => onChange(value.map((t, k) => (k === i ? { ...t, ...patch } : t)));
  const filled = value.filter((t) => t.label.trim() && t.value.trim()).length;

  return (
    <div className="trait-editor">
      {value.map((t, i) => {
        const slot = slotOf(t.label);
        const use = (idea: string) => set(i, {
          value: slot?.tags ? normalizeStack([...normalizeStack(t.value), idea]).join(", ") : t.value.trim() ? `${t.value.trim()}, ${idea}` : idea,
        });
        return (
          <div className="trait-line" key={i}>
            <div className="trait-name">
              <input
                className="trait-label" value={t.label} maxLength={MAX_LABEL} placeholder="Nama sifat"
                aria-label={`Nama sifat ke-${i + 1}`} onChange={(e) => set(i, { label: e.target.value })}
              />
              {slot && <span className="trait-hint">{slot.hint}</span>}
            </div>
            <div className="trait-value">
              {slot?.tags
                ? <StackInput value={t.value} onChange={(v) => set(i, { value: v })} label={t.label} />
                : <input
                    className="input" value={t.value} maxLength={MAX_VALUE} aria-label={t.label || `Isi sifat ke-${i + 1}`}
                    placeholder={slot ? `mis. ${slot.ideas[0]}` : "tulis bebas"} onChange={(e) => set(i, { value: e.target.value })}
                  />}
              {slot && (slot.tags || !t.value.trim()) && (
                <div className="trait-ideas" aria-label="Ide">
                  {slot.ideas.map((idea) => <button key={idea} type="button" className="idea" onClick={() => use(idea)}>{idea}</button>)}
                </div>
              )}
            </div>
            <button type="button" className="trait-remove" aria-label={`Hapus sifat ${t.label || i + 1}`} onClick={() => onChange(value.filter((_, k) => k !== i))}>×</button>
          </div>
        );
      })}
      <div className="trait-add">
        <button type="button" className="btn btn-sm" disabled={value.length >= MAX_TRAITS} onClick={() => onChange([...value, { label: "", value: "" }])}>+ Tambah sifat</button>
        <span className="xs dim">{filled} dari {MAX_TRAITS} sifat terisi</span>
      </div>
    </div>
  );
}
