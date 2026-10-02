// web/src/lib/afford.test.ts
import { expect, test } from "bun:test";
import { FEE_FALLBACK_WEI, affordability } from "./afford";

const e = (x: string) => BigInt(Math.round(Number(x) * 1e18));
test("saldo cukup", () => expect(affordability(e("0.003"), e("0.002"), e("0.0001"))).toEqual({ ok: true }));
test("saldo kurang menyebut kekurangannya", () => expect(affordability(e("0.002"), e("0.002"), e("0.0001"))).toEqual({ ok: false, shortWei: e("0.0001") }));
test("perkiraan biaya gagal → cadangan", () => expect(affordability(e("0.002"), e("0.002"), null)).toEqual({ ok: false, shortWei: FEE_FALLBACK_WEI }));
test("transaksi tanpa nilai tetap butuh biaya jaringan", () => expect(affordability(0n, 0n, e("0.0001")).ok).toBe(false));
