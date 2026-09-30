import { describe, expect, test } from "bun:test";
import { parseEther } from "viem";
import { faucetDecision, faucetMessage, type FaucetRecord } from "./faucet";

const cfg = { amountWei: parseEther("0.003"), perIpPerDay: 3, dailyCapWei: parseEther("0.009") };
const NOW = 1_800_000_000_000;
const H = 3_600_000;
const rec = (o: Partial<FaucetRecord>): FaucetRecord => ({
  userId: "u-lain", address: "0x0000000000000000000000000000000000000abc", ip: "9.9.9.9",
  at: NOW - H, wei: cfg.amountWei.toString(), ...o,
});
const req = (o: Partial<Parameters<typeof faucetDecision>[1]> = {}) => ({
  userId: "did:privy:juri", address: "0x00000000000000000000000000000000000000Aa",
  ip: "1.2.3.4", balanceWei: 0n, now: NOW, ...o,
});

describe("faucetDecision", () => {
  test("pengguna baru dengan saldo kosong dapat ETH", () => {
    expect(faucetDecision({ records: [] }, req(), cfg)).toEqual({ ok: true });
  });

  test("saldo sudah separuh jatah atau lebih: tidak perlu", () => {
    expect(faucetDecision({ records: [] }, req({ balanceWei: cfg.amountWei / 2n }), cfg))
      .toEqual({ ok: false, reason: "saldo-cukup" });
  });

  test("user Privy yang sama hanya sekali, walau alamat berbeda", () => {
    const state = { records: [rec({ userId: "did:privy:juri", at: NOW - 30 * 24 * H })] };
    expect(faucetDecision(state, req(), cfg)).toEqual({ ok: false, reason: "sudah" });
  });

  test("alamat yang sama hanya sekali (huruf besar/kecil tidak berpengaruh)", () => {
    const state = { records: [rec({ address: "0x00000000000000000000000000000000000000aA" })] };
    expect(faucetDecision(state, req(), cfg)).toEqual({ ok: false, reason: "alamat" });
  });

  test("lebih dari batas per IP dalam 24 jam ditolak", () => {
    const state = { records: [0, 1, 2].map((i) => rec({ ip: "1.2.3.4", address: `0x${"1".repeat(39)}${i}` })) };
    expect(faucetDecision(state, req(), cfg)).toEqual({ ok: false, reason: "ip" });
  });

  test("batas per IP dihitung 24 jam terakhir saja", () => {
    const state = { records: [0, 1, 2].map((i) => rec({ ip: "1.2.3.4", at: NOW - 25 * H, address: `0x${"1".repeat(39)}${i}` })) };
    expect(faucetDecision(state, req(), cfg)).toEqual({ ok: true });
  });

  test("total harian habis: ditolak", () => {
    const state = { records: [0, 1, 2].map((i) => rec({ ip: `5.5.5.${i}`, address: `0x${"2".repeat(39)}${i}` })) };
    expect(faucetDecision(state, req(), cfg)).toEqual({ ok: false, reason: "harian" });
  });
});

test("setiap alasan punya pesan untuk manusia", () => {
  for (const r of ["sudah", "alamat", "ip", "harian", "saldo-cukup"] as const) {
    expect(faucetMessage(r).length).toBeGreaterThan(10);
  }
});
