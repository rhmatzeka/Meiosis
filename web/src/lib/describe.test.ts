import { expect, test } from "bun:test";
import { originLabel, ownerLabel, priceText, summaryLine, traitChips } from "./describe";

const agent = (o: Partial<{ id: number; designed: boolean; generation: number; parents: [number, number]; role: string; traits: { label: string; value: string }[] }> = {}) => ({
  id: o.id ?? 7, designed: o.designed ?? true, generation: o.generation ?? 0, parents: o.parents ?? [0, 0] as [number, number],
  profile: { role: o.role ?? "", traits: o.traits ?? [], inherited: false },
});

test("asal-usul dalam bahasa awam", () => {
  expect(originLabel({ designed: true, generation: 0 })).toBe("Dibuat di Studio");
  expect(originLabel({ designed: false, generation: 2 })).toBe("Keturunan generasi 2");
});

test("pemilik: milikmu atau alamat pendek", () => {
  const a = "0x976EA74026E726554dB657fA54763abd0C3a0aa9";
  expect(ownerLabel(a, a.toLowerCase())).toBe("milikmu");
  expect(ownerLabel(a)).toBe("0x976E…0aa9");
});

test("harga: nol berarti memakai jatah gratis", () => {
  expect(priceText("0")).toBe("pakai jatah gratis");
  expect(priceText("500000000000000")).toBe("0,0005 ETH uji");
});

test("ringkasan tidak pernah kosong", () => {
  expect(summaryLine(agent({ role: "Pembuat API Laravel" }))).toBe("Pembuat API Laravel");
  expect(summaryLine(agent({ designed: false, generation: 1, parents: [1, 2] }), (id) => (id === 1 ? "Kurir" : "Pelukis"))).toBe("Keturunan Kurir × Pelukis");
  expect(summaryLine(agent({ id: 9 }))).toBe("Agent #9");
});

test("chip sifat: stack dulu, isi panjang dipotong, sisanya dihitung", () => {
  const chips = traitChips(agent({ traits: [
    { label: "Gaya bicara", value: "santai sekali seperti ngobrol dengan teman lama" },
    { label: "Stack & alat", value: "Laravel, MySQL" },
    { label: "Bahasa", value: "Jawa" },
    { label: "Hobi", value: "bola" },
  ] }), 4);
  expect(chips.slice(0, 2)).toEqual(["Laravel", "MySQL"]);
  expect(chips[2]).toBe("Gaya bicara: santai sekali sep…");
  expect(chips[3]).toBe("+2");
});
