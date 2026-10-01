import { describe, expect, test } from "bun:test";
import { LOCUS } from "../packages/shared/src/genome";
import { validateTraits } from "../packages/shared/src/studio";
import { parseSuggestion, suggestFromText } from "./suggest";

describe("suggestFromText (aturan kata kunci, tanpa model)", () => {
  test("deskripsi React yang aman menghasilkan sifat yang cocok", () => {
    const s = suggestFromText("Agent untuk bikin form React yang aman, rapi, dan ada tesnya");
    expect(validateTraits(s.traits)).toBeNull();
    expect(s.traits[LOCUS.STACK_AFFINITY]).toBe(1);      // React
    expect(s.traits[LOCUS.SECURITY_INSTINCT]).toBe(2);
    expect(s.traits[LOCUS.TEST_RIGOR]).toBe(2);
    expect(s.traits[LOCUS.AESTHETIC]).toBe(2);
    expect(s.traits[LOCUS.DISCIPLINE_PRIMARY]).toBe(1);  // kode
  });

  test("deskripsi kontrak pintar memilih Solidity dan keamanan", () => {
    const s = suggestFromText("audit smart contract solidity, cari celah reentrancy");
    expect(s.traits[LOCUS.STACK_AFFINITY]).toBe(2);
    expect(s.traits[LOCUS.DISCIPLINE_PRIMARY]).toBe(4);  // keamanan
  });

  test("deskripsi riset data memilih Python", () => {
    const s = suggestFromText("analisis data penjualan pakai pandas lalu rangkum hasil risetnya");
    expect(s.traits[LOCUS.STACK_AFFINITY]).toBe(3);
    expect([3, 5]).toContain(s.traits[LOCUS.DISCIPLINE_PRIMARY]);
  });

  test("instruksi memuat deskripsi pengguna dan nama tidak kosong", () => {
    const s = suggestFromText("Bantu aku menulis dokumentasi API yang jelas");
    expect(s.instructions).toContain("dokumentasi API");
    expect(s.name.length).toBeGreaterThan(2);
    expect(new TextEncoder().encode(s.name).length).toBeLessThanOrEqual(32);
  });

  test("deskripsi kosong tetap menghasilkan rancangan yang sah", () => {
    expect(validateTraits(suggestFromText("").traits)).toBeNull();
  });
});

describe("parseSuggestion (keluaran model)", () => {
  const fallback = suggestFromText("form react");

  test("JSON sah di dalam teks dipakai", () => {
    const out = 'Tentu!\n```json\n{"name":"Penjaga Form","instructions":"Kamu fokus pada form.","traits":[1,1,0,1,2,2,2,1,1,3,0,0,1,1,2,0]}\n```';
    const s = parseSuggestion(out, fallback);
    expect(s.name).toBe("Penjaga Form");
    expect(s.traits[LOCUS.SECURITY_INSTINCT]).toBe(2);
    expect(s.source).toBe("ai");
  });

  test("sifat tidak sah dari model jatuh ke aturan kata kunci", () => {
    const out = '{"name":"X","instructions":"y","traits":[9,9,9]}';
    expect(parseSuggestion(out, fallback)).toEqual({ ...fallback, source: "heuristic" });
  });

  test("keluaran yang bukan JSON jatuh ke aturan kata kunci", () => {
    expect(parseSuggestion("maaf saya tidak bisa", fallback).source).toBe("heuristic");
  });

  test("nama dan instruksi dari model dipangkas ke batas", () => {
    const out = JSON.stringify({ name: "N".repeat(80), instructions: "i".repeat(9000), traits: fallback.traits });
    const s = parseSuggestion(out, fallback);
    expect(new TextEncoder().encode(s.name).length).toBeLessThanOrEqual(32);
    expect(s.instructions.length).toBeLessThanOrEqual(4000);
  });
});
