/** Pencarian agent dalam bahasa pengguna: nama, #id, peran, dan sifat bebas. Semua kata harus cocok. */
interface Searchable { id: number; name: string; profile: { role: string; traits: { label: string; value: string }[] } }

export function matchAgent(a: Searchable, q: string): boolean {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = [a.name, a.profile.role, ...a.profile.traits.flatMap((t) => [t.label, t.value])].join(" ").toLowerCase();
  return words.every((w) => (w.startsWith("#") ? w === `#${a.id}` : hay.includes(w)));
}
