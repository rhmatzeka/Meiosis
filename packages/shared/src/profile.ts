/**
 * Profil agent: peran satu kalimat dan sifat bebas `label = isi`.
 *
 * Ditulis di awal teks soul, jadi hash di Studio.soulOf mengikat profil dan
 * instruksi sekaligus. Peran dan sifat publik; instruksi rahasia. Kolom
 * bawaan (SLOTS) terikat ke satu lokus supaya pewarisannya mengikuti DNA
 * (inherit.ts). Tidak ada kolom yang terikat ke lokus model: model diatur admin.
 */
import { LOCUS } from "./genome";

export const MAX_ROLE = 120;
export const MAX_TRAITS = 12;
export const MAX_LABEL = 32;
export const MAX_VALUE = 200;
export const MAX_TAGS = 8;
export const MAX_TAG = 24;
export const MAX_INSTRUCTIONS = 4000;

export interface FreeTrait { label: string; value: string }
export interface Profile { role: string; traits: FreeTrait[] }
export interface Soul extends Profile { instructions: string }
export interface Slot { label: string; locus: number; hint: string; ideas: string[]; tags?: true }

export const SLOTS: Slot[] = [
  { label: "Keahlian", locus: LOCUS.DISCIPLINE_PRIMARY, hint: "Bidang yang paling dikuasainya", ideas: ["backend & API", "copywriting iklan", "analisis data penjualan", "audit smart contract"] },
  { label: "Stack & alat", locus: LOCUS.STACK_AFFINITY, hint: "Bahasa, framework, atau alat apa saja", ideas: ["Laravel", "Go", "Flutter", "Figma"], tags: true },
  { label: "Cara berpikir", locus: LOCUS.RISK_APPETITE, hint: "Bagaimana ia menimbang sebelum menjawab", ideas: ["teliti, cek dua kali", "cepat dan praktis", "selalu jelaskan alasannya"] },
  { label: "Cara kerja", locus: LOCUS.TEST_RIGOR, hint: "Kebiasaan yang menentukan mutu hasilnya", ideas: ["selalu tulis tes dulu", "cek keamanan di setiap langkah", "rapi dan terdokumentasi"] },
  { label: "Gaya bicara", locus: LOCUS.VERBOSITY, hint: "Cara ia menjawab", ideas: ["singkat dan langsung", "santai, bahasa gaul", "detail seperti guru"] },
  { label: "Kepribadian", locus: LOCUS.CREATIVITY, hint: "Sifat yang membuatnya unik", ideas: ["berani eksperimen", "hati-hati dan konservatif", "suka analogi sepak bola"] },
];

export const KNOWN_STACKS = ["React", "Next.js", "Vue", "Nuxt", "Svelte", "Angular", "Laravel", "PHP", "Node.js", "Express", "NestJS",
  "Go", "Rust", "Java", "Spring", "Kotlin", "Swift", "Flutter", "Dart", "React Native", "Python", "Django", "FastAPI", "Flask",
  "Solidity", "Foundry", "Hardhat", "PostgreSQL", "MySQL", "MongoDB", "Redis", "Docker", "Kubernetes", "Tailwind", "TypeScript", "Figma"];

const OPEN = "[profil]";
const CLOSE = "[/profil]";
const oneLine = (s: string) => s.replace(/\s+/g, " ").trim();
const clean = (s: string, max: number) => oneLine(s.replace(/[[\]]/g, " ")).slice(0, max).trim();

export const slotOf = (label: string) => SLOTS.find((s) => s.label.toLowerCase() === label.trim().toLowerCase());

export function normalizeStack(input: string[] | string): string[] {
  const raw = Array.isArray(input) ? input : input.split(/[,\n]/);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const r of raw) {
    const t = clean(r.replace(/,/g, " "), MAX_TAG);
    if (!t || seen.has(t.toLowerCase())) continue;
    seen.add(t.toLowerCase());
    out.push(t);
    if (out.length === MAX_TAGS) break;
  }
  return out;
}

export function normalizeTraits(traits: FreeTrait[]): FreeTrait[] {
  const out: FreeTrait[] = [];
  const seen = new Set<string>();
  for (const t of traits) {
    const label = clean(t.label.replace(/=/g, " "), MAX_LABEL);
    const value = slotOf(label)?.tags ? normalizeStack(t.value).join(", ") : clean(t.value, MAX_VALUE);
    if (!label || !value || seen.has(label.toLowerCase())) continue;
    seen.add(label.toLowerCase());
    out.push({ label, value });
    if (out.length === MAX_TRAITS) break;
  }
  return out;
}

export function composeSoul(s: Soul): string {
  const role = clean(s.role, MAX_ROLE);
  const traits = normalizeTraits(s.traits);
  const body = s.instructions.replace(/\r\n/g, "\n").trim();
  const head = role || traits.length
    ? [OPEN, `peran: ${role}`, ...traits.map((t) => `sifat: ${t.label} = ${t.value}`), CLOSE].join("\n")
    : "";
  return [head, body].filter(Boolean).join("\n\n");
}

export function parseSoul(text: string): Soul {
  const t = text.replace(/\r\n/g, "\n").trim();
  const end = t.indexOf("\n" + CLOSE);
  if (!t.startsWith(OPEN + "\n") || end < 0) return { role: "", traits: [], instructions: t };
  const lines = t.slice(OPEN.length + 1, end).split("\n");
  const role = lines.find((l) => l.startsWith("peran:"))?.slice(6).trim() ?? "";
  const traits = lines.filter((l) => l.startsWith("sifat:")).map((l) => {
    const body = l.slice(6);
    const i = body.indexOf(" = ");
    return i < 0 ? { label: "", value: "" } : { label: body.slice(0, i).trim(), value: body.slice(i + 3).trim() };
  });
  return { role, traits: normalizeTraits(traits), instructions: t.slice(end + 1 + CLOSE.length).trim() };
}

export const stackOf = (p: Profile) => normalizeStack(p.traits.find((t) => slotOf(t.label)?.tags)?.value ?? "");

const STACK_HINTS: [number, RegExp][] = [
  [1, /\breact\b|next\.?js|remix/i],
  [2, /solidity|foundry|hardhat|\bevm\b|smart contract/i],
  [3, /python|django|fastapi|flask|pandas|pytorch/i],
];
export function stackLocus(stack: string[]): number {
  for (const tag of stack) for (const [v, re] of STACK_HINTS) if (re.test(tag)) return v;
  return 0;
}