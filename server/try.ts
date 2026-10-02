/** "Coba dulu" di Studio: memeriksa permintaan sebelum agent rancangan dijalankan tanpa dibuat. */
import { MAX_INSTRUCTIONS, normalizeTraits, type FreeTrait } from "../packages/shared/src/profile";

export interface TryRequest { role?: string; traits?: FreeTrait[]; instructions?: string; task?: string }

export function tryRequestProblems(b: TryRequest): string | null {
  const task = String(b.task ?? "").trim();
  if (!task) return "Tulis dulu tugas untuk dicoba.";
  if (task.length > 1000) return "Tugas coba paling panjang 1000 karakter.";
  const instructions = String(b.instructions ?? "");
  if (instructions.length > MAX_INSTRUCTIONS) return `Instruksi paling panjang ${MAX_INSTRUCTIONS} karakter.`;
  const traits = normalizeTraits(Array.isArray(b.traits) ? b.traits : []);
  if (!String(b.role ?? "").trim() && !traits.length && !instructions.trim()) return "Isi dulu otak agent-nya: tugas, sifat, atau instruksi.";
  return null;
}
