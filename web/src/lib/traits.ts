/**
 * Kamus genome → bahasa manusia.
 *
 * Nama lokus dan trait di packages/shared adalah kontrak dengan Solidity dan
 * runtime, jadi tidak diubah. Di sini hanya ditambahkan cara menyebutnya ke
 * orang yang belum pernah membaca PLAN.md.
 */
import { LOCUS_NAMES } from "../../../packages/shared/src/genome";

export interface Locus {
  index: number;
  key: (typeof LOCUS_NAMES)[number];
  label: string;
  icon: string;
  values: string[];
  /** Lokus ini mengubah prompt atau model agent (punya modul skill). */
  matters: boolean;
}

const LEVEL = ["rendah", "sedang", "tinggi"];
const DISCIPLINE = ["serba bisa", "kode", "desain", "riset", "keamanan", "data"];

const DEFS: Omit<Locus, "index" | "key">[] = [
  { label: "Otak", icon: "🧠", values: ["cepat", "seimbang", "kuat"], matters: true },
  { label: "Keahlian utama", icon: "🎯", values: DISCIPLINE, matters: true },
  { label: "Keahlian kedua", icon: "✳️", values: DISCIPLINE, matters: false },
  { label: "Stack", icon: "⚙️", values: ["—", "React", "Solidity", "Python"], matters: true },
  { label: "Estetika", icon: "🎨", values: ["polos", "sedang", "tinggi"], matters: true },
  { label: "Ketelitian tes", icon: "🧪", values: LEVEL, matters: true },
  { label: "Naluri keamanan", icon: "🛡", values: LEVEL, matters: true },
  { label: "Kebiasaan dokumentasi", icon: "📝", values: LEVEL, matters: false },
  { label: "Perkakas", icon: "🧰", values: ["dasar", "standar", "lengkap"], matters: false },
  { label: "Akses build & berkas", icon: "🔧", values: ["tidak ada", "build", "berkas", "build + berkas"], matters: false },
  { label: "Akses web & data", icon: "🌐", values: ["tidak ada", "web", "data", "web + data"], matters: false },
  { label: "Gaya bicara", icon: "💬", values: ["ringkas", "biasa", "panjang"], matters: true },
  { label: "Keberanian", icon: "🎲", values: LEVEL, matters: false },
  { label: "Kreativitas", icon: "✨", values: LEVEL, matters: false },
  { label: "Ketekunan", icon: "🔁", values: LEVEL, matters: true },
  { label: "Cadangan", icon: "·", values: ["—"], matters: false },
];

export const LOCI: Locus[] = DEFS.map((d, i) => ({ ...d, index: i, key: LOCUS_NAMES[i] }));

export const traitLabel = (locus: number, traitId: number) => LOCI[locus]?.values[traitId] ?? "?";
