import { afterAll, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { serveStatic } from "./static";

const dir = mkdtempSync(join(tmpdir(), "meiosis-static-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
const js = "console.log('halo');".repeat(400);
writeFileSync(join(dir, "app-abc.js"), js);
writeFileSync(join(dir, "index.html"), "<!doctype html><title>Meiosis</title>");
writeFileSync(join(dir, "font.woff2"), Buffer.from([1, 2, 3]));
const req = (path: string, gzip = true) => new Request(`http://x${path}`, { headers: gzip ? { "accept-encoding": "gzip, br" } : {} });

test("JS dikirim gzip bila browser menerimanya, dan isinya utuh", async () => {
  const r = serveStatic(req("/app-abc.js"), dir);
  expect(r.headers.get("content-encoding")).toBe("gzip");
  expect(r.headers.get("cache-control")).toContain("immutable");
  expect(r.headers.get("content-type")).toContain("javascript");
  expect(gunzipSync(Buffer.from(await r.arrayBuffer())).toString()).toBe(js);
});
test("tanpa Accept-Encoding gzip, dikirim apa adanya", async () => {
  const r = serveStatic(req("/app-abc.js", false), dir);
  expect(r.headers.get("content-encoding")).toBeNull();
  expect(await r.text()).toBe(js);
});
test("berkas biner tidak dikompres; rute aplikasi jatuh ke index.html tanpa cache", async () => {
  expect(serveStatic(req("/font.woff2"), dir).headers.get("content-encoding")).toBeNull();
  const r = serveStatic(req("/agent/7"), dir);
  expect(r.headers.get("cache-control")).toBe("no-cache");
  expect(await (r.headers.get("content-encoding") === "gzip" ? Promise.resolve(gunzipSync(Buffer.from(await r.arrayBuffer())).toString()) : r.text())).toContain("<title>Meiosis</title>");
});
test("path keluar folder tidak dilayani", async () => {
  const r = serveStatic(req("/../../etc/passwd"), dir);
  const body = r.headers.get("content-encoding") === "gzip" ? gunzipSync(Buffer.from(await r.arrayBuffer())).toString() : await r.text();
  expect(body).toContain("<title>Meiosis</title>");
});

test("font dilayani dari paket fontsource dengan nama tetap", () => {
  const { fontFile } = require("./static") as typeof import("./static");
  expect(fontFile("inter-latin.woff2")).toEndWith("inter-latin-wght-normal.woff2");
  expect(fontFile("mono-latin.woff2")).toEndWith("jetbrains-mono-latin-400-normal.woff2");
  expect(fontFile("../../.env")).toBeNull();
  expect(fontFile("lain.woff2")).toBeNull();
});
