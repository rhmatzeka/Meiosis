import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { privateKeyToAccount } from "viem/accounts";
import { KeyStore, checkSigned, signedMessage } from "./keys";

const acct = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
const other = privateKeyToAccount("0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a");
const NOW = Date.parse("2026-10-01T10:00:00Z");
const dir = mkdtempSync(join(tmpdir(), "meiosis-keys-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("checkSigned", () => {
  test("pesan bertanda tangan pemilik alamat diterima", async () => {
    const message = signedMessage("buat API key", acct.address, new Date(NOW).toISOString());
    const signature = await acct.signMessage({ message });
    expect(await checkSigned({ address: acct.address, message, signature, action: "buat API key", now: NOW })).toEqual({ ok: true });
  });

  test("tanda tangan alamat lain ditolak", async () => {
    const message = signedMessage("buat API key", acct.address, new Date(NOW).toISOString());
    const signature = await other.signMessage({ message });
    const r = await checkSigned({ address: acct.address, message, signature, action: "buat API key", now: NOW });
    expect(r.ok).toBe(false);
  });

  test("pesan lebih dari 10 menit ditolak", async () => {
    const message = signedMessage("buat API key", acct.address, new Date(NOW - 11 * 60_000).toISOString());
    const signature = await acct.signMessage({ message });
    const r = await checkSigned({ address: acct.address, message, signature, action: "buat API key", now: NOW });
    expect(!r.ok && r.error).toContain("kedaluwarsa");
  });

  test("pesan untuk aksi lain ditolak", async () => {
    const message = signedMessage("unduh agent #7", acct.address, new Date(NOW).toISOString());
    const signature = await acct.signMessage({ message });
    const r = await checkSigned({ address: acct.address, message, signature, action: "buat API key", now: NOW });
    expect(r.ok).toBe(false);
  });

  test("pesan yang menyebut alamat lain ditolak", async () => {
    const message = signedMessage("buat API key", other.address, new Date(NOW).toISOString());
    const signature = await acct.signMessage({ message });
    const r = await checkSigned({ address: acct.address, message, signature, action: "buat API key", now: NOW });
    expect(r.ok).toBe(false);
  });
});

describe("KeyStore", () => {
  test("kunci dibuat, dikenali, dan hanya hash-nya yang disimpan", () => {
    const file = join(dir, "a.json");
    const s = new KeyStore(file);
    const { key } = s.create(acct.address, "laptop");
    expect(key).toMatch(/^mk_[A-Za-z0-9_-]{40,}$/);
    expect(s.find(key)?.address.toLowerCase()).toBe(acct.address.toLowerCase());
    expect(Bun.file(file).size).toBeGreaterThan(0);
    expect(require("node:fs").readFileSync(file, "utf8")).not.toContain(key);
  });

  test("kunci tetap dikenali setelah dimuat ulang dari berkas", () => {
    const file = join(dir, "b.json");
    const { key } = new KeyStore(file).create(acct.address, "x");
    expect(new KeyStore(file).find(key)).not.toBeNull();
  });

  test("daftar hanya berisi awalan, dan pencabutan hanya oleh pemiliknya", () => {
    const s = new KeyStore(join(dir, "c.json"));
    const { key, record } = s.create(acct.address, "ci");
    const list = s.list(acct.address);
    expect(list).toHaveLength(1);
    expect(list[0].prefix).toBe(record.prefix);
    expect(JSON.stringify(list)).not.toContain(key);
    expect(s.revoke(other.address, record.prefix)).toBe(false);
    expect(s.revoke(acct.address, record.prefix)).toBe(true);
    expect(s.find(key)).toBeNull();
  });

  test("kunci palsu tidak dikenali", () => {
    expect(new KeyStore(join(dir, "d.json")).find("mk_palsu")).toBeNull();
  });
});
