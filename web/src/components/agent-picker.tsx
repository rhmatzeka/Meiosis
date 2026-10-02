/**
 * Memilih agent dari daftar yang bisa dicari (nama, #id, tugas, sifat), alih-alih
 * grid berisi semua kartu. Dipakai Beri tugas dan Kawinkan.
 */
import { useState, type ReactNode } from "react";
import type { Agent } from "../api";
import { useData } from "../hooks/use-data";
import { summaryLine } from "../lib/describe";
import { matchAgent } from "../lib/search";
import { Cell } from "./ui";

export interface PickMeta { tag?: "a" | "b"; note?: string | null; disabled?: string | null }

export function AgentPicker({ agents, selected, onToggle, meta, aside, placeholder = "Cari agent: nama, tugas, atau stack (mis. laravel)" }: {
  agents: Agent[];
  selected: number[];
  onToggle: (a: Agent) => void;
  meta?: (a: Agent) => PickMeta;
  aside?: (a: Agent) => ReactNode;
  placeholder?: string;
}) {
  const { byId } = useData();
  const [q, setQ] = useState("");
  const shown = agents.filter((a) => matchAgent(a, q));
  return (
    <div className="picker">
      <input className="input" type="search" placeholder={placeholder} aria-label="Cari agent" value={q} onChange={(e) => setQ(e.target.value)} />
      {shown.length ? (
        <ul className="picker-list" aria-label="Daftar agent">
          {shown.slice(0, 60).map((a) => {
            const m = meta?.(a) ?? {};
            const on = selected.includes(a.id);
            return (
              <li key={a.id}>
                <button
                  type="button" className={`picker-row ${on ? "on" : ""} ${m.tag ? `is-${m.tag}` : ""}`} aria-pressed={on}
                  disabled={!!m.disabled} title={m.disabled ?? undefined} onClick={() => onToggle(a)}
                >
                  <Cell genome={a.genome} size={36} alive={false} />
                  <span className="picker-text">
                    <span className="picker-name">{a.name} <span className="agent-card-id">#{a.id}</span></span>
                    <span className="picker-sub">{m.disabled ?? summaryLine(a, (id) => byId(id)?.name)}</span>
                    {m.note && <span className="picker-note">{m.note}</span>}
                  </span>
                  {aside && <span className="picker-aside">{aside(a)}</span>}
                  <span className="picker-check" aria-hidden>{on ? "✓" : ""}</span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : <p className="small muted">Tidak ada agent yang cocok dengan “{q}”.</p>}
    </div>
  );
}
