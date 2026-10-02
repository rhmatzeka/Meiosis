/** Pemeriksaan formulir Studio: mana yang memblokir pembuatan, mana yang hanya peringatan. */
import { MAX_INSTRUCTIONS, MAX_TRAITS, SLOTS, type FreeTrait } from "../../../packages/shared/src/profile";

export interface StudioForm { name: string; role: string; traits: FreeTrait[]; instructions: string }
export interface Problem { field: "name" | "role" | "traits" | "instructions"; message: string; blocking: boolean }

export const emptyTraits = (): FreeTrait[] => SLOTS.map((s) => ({ label: s.label, value: "" }));

export function studioFormProblems(f: StudioForm, takenNames: string[]): Problem[] {
  const out: Problem[] = [];
  const name = f.name.trim();
  const filled = f.traits.filter((t) => t.label.trim() && t.value.trim());
  if (new TextEncoder().encode(name).length > 32) out.push({ field: "name", message: "Nama paling panjang 32 byte.", blocking: true });
  const same = takenNames.filter((t) => t.toLowerCase() === name.toLowerCase()).length;
  if (name && same) out.push({ field: "name", message: `Sudah ada ${same} agent bernama ${name}. Nama unik lebih mudah dicari.`, blocking: false });
  if (!f.role.trim() && !filled.length && !f.instructions.trim()) out.push({ field: "role", message: "Tulis tugas agent ini, atau isi minimal satu sifat.", blocking: true });
  if (filled.length > MAX_TRAITS) out.push({ field: "traits", message: `Paling banyak ${MAX_TRAITS} sifat.`, blocking: true });
  const labels = filled.map((t) => t.label.trim().toLowerCase());
  if (new Set(labels).size !== labels.length) out.push({ field: "traits", message: "Ada dua sifat dengan nama sama; hanya yang pertama dipakai.", blocking: false });
  if (f.instructions.length > MAX_INSTRUCTIONS) out.push({ field: "instructions", message: `Instruksi paling panjang ${MAX_INSTRUCTIONS} karakter.`, blocking: true });
  return out;
}
