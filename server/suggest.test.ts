import { describe, expect, test } from "bun:test";
import { MAX_INSTRUCTIONS, MAX_ROLE } from "../packages/shared/src/profile";
import { parseSuggestion, stacksIn, suggestFromText } from "./suggest";

const trait = (s: { traits: { label: string; value: string }[] }, label: string) => s.traits.find((t) => t.label === label)?.value;

describe("suggestFromText (aturan kata kunci, tanpa model)", () => {
  test("stack apa pun yang dikenal diambil sesuai urutan di teks, termasuk di luar React/Solidity/Python", () => {
    const s = suggestFromText("Bikin REST API pakai Laravel dan MySQL, gaya santai");
    expect(trait(s, "Stack & alat")).toBe("Laravel, MySQL");
    expect(trait(s, "Gaya bicara")).toBeTruthy();
    expect(s.role.length).toBeGreaterThan(0);
    expect(s.role.length).toBeLessThanOrEqual(MAX_ROLE);
    expect((s as unknown as Record<string, unknown>).loci).toBeUndefined();
    expect(s.traits.every((t) => typeof t.value === "string")).toBe(true);
  });

  test("keahlian diisi dari deskripsi", () => {
    expect(trait(suggestFromText("audit smart contract solidity, cari celah reentrancy"), "Keahlian")).toBeTruthy();
  });

  test("instruksi memuat deskripsi pengguna dan nama tidak kosong", () => {
    const s = suggestFromText("Bantu aku menulis dokumentasi API yang jelas");
    expect(s.instructions).toContain("dokumentasi API");
    expect(s.name.length).toBeGreaterThan(2);
    expect(new TextEncoder().encode(s.name).length).toBeLessThanOrEqual(32);
  });

  test("deskripsi kosong tetap menghasilkan rancangan tanpa galat", () => {
    const s = suggestFromText("");
    expect(s.traits).toEqual([]);
    expect(s.instructions).toBe("");
  });
});

test("stacksIn tidak salah tangkap kata biasa", () => {
  expect(stacksIn("pergi ke pasar, go!")).toEqual(["Go"]);
  expect(stacksIn("saya suka javascript")).toEqual([]);
  expect(stacksIn("Next.js dan React Native")).toEqual(["Next.js", "React Native"]);
});

describe("parseSuggestion (keluaran model)", () => {
  const fallback = suggestFromText("form react");

  test("JSON sah di dalam teks dipakai, label bebas diterima, stack dinormalisasi", () => {
    const out = 'Tentu!\n```json\n' + JSON.stringify({
      name: "Kurir API", role: "Pembuat API Go", instructions: "Kamu fokus pada API.",
      traits: [{ label: "Stack & alat", value: "Go, go, PostgreSQL" }, { label: "Bahasa", value: "Jawa halus" }],
    }) + "\n```";
    const s = parseSuggestion(out, fallback);
    expect(s.source).toBe("ai");
    expect(s.name).toBe("Kurir API");
    expect(s.role).toBe("Pembuat API Go");
    expect(trait(s, "Stack & alat")).toBe("Go, PostgreSQL");
    expect(trait(s, "Bahasa")).toBe("Jawa halus");
  });

  test("traits bukan daftar label/isi → aturan kata kunci", () => {
    expect(parseSuggestion('{"name":"X","instructions":"y","traits":[9,9,9]}', fallback)).toEqual({ ...fallback, source: "heuristic" });
  });

  test("keluaran yang bukan JSON → aturan kata kunci", () => {
    expect(parseSuggestion("maaf saya tidak bisa", fallback).source).toBe("heuristic");
  });

  test("nama, peran, dan instruksi dari model dipangkas ke batas", () => {
    const out = JSON.stringify({ name: "N".repeat(80), role: "r".repeat(300), instructions: "i".repeat(9000), traits: [] });
    const s = parseSuggestion(out, fallback);
    expect(new TextEncoder().encode(s.name).length).toBeLessThanOrEqual(32);
    expect(s.role.length).toBeLessThanOrEqual(MAX_ROLE);
    expect(s.instructions.length).toBeLessThanOrEqual(MAX_INSTRUCTIONS);
  });
});
