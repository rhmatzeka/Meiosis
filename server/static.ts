/**
 * Menyajikan hasil `bun run build:web` (dist/web) di mode publik: berkas teks
 * dikirim gzip (dicache di memori), aset ber-hash di-cache selamanya, dan rute
 * aplikasi lain jatuh ke index.html. Cloudflare/Caddy juga mengompres, tapi
 * server ini tidak boleh bergantung pada itu.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, resolve } from "node:path";

const TYPES: Record<string, string> = {
  ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".html": "text/html; charset=utf-8",
  ".json": "application/json", ".svg": "image/svg+xml", ".map": "application/json", ".txt": "text/plain; charset=utf-8",
};
const gzCache = new Map<string, { mtime: number; body: Uint8Array }>();

function gzipped(path: string) {
  const mtime = statSync(path).mtimeMs;
  const hit = gzCache.get(path);
  if (hit && hit.mtime === mtime) return hit.body;
  const body = Bun.gzipSync(readFileSync(path), { level: 9 });
  gzCache.set(path, { mtime, body });
  return body;
}

export function serveStatic(req: Request, dist: string): Response {
  const root = resolve(dist);
  let path = resolve(root, "." + decodeURIComponent(new URL(req.url).pathname));
  const isAsset = path.startsWith(root + "/") && existsSync(path) && statSync(path).isFile();
  if (!isAsset) path = join(root, "index.html");
  const type = TYPES[extname(path)];
  const headers: Record<string, string> = {
    "cache-control": isAsset && !path.endsWith("index.html") ? "public, max-age=31536000, immutable" : "no-cache",
    ...(type ? { "content-type": type } : {}),
    vary: "accept-encoding",
  };
  if (type && /\bgzip\b/.test(req.headers.get("accept-encoding") ?? "")) {
    return new Response(gzipped(path) as unknown as BodyInit, { headers: { ...headers, "content-encoding": "gzip" } });
  }
  return new Response(Bun.file(path), { headers });
}

/**
 * Font dilayani sebagai berkas terpisah (bukan base64 di dalam CSS) supaya CSS
 * yang memblokir tampilan pertama tetap kecil; namanya tetap, isinya jarang berubah.
 */
const FONTS: Record<string, string> = {
  "inter-latin.woff2": "node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2",
  "mono-latin.woff2": "node_modules/@fontsource/jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff2",
};
export const fontFile = (name: string) => (FONTS[name] && existsSync(FONTS[name]) ? resolve(FONTS[name]) : null);
export function serveFont(req: Request): Response {
  const file = fontFile(new URL(req.url).pathname.replace(/^\/fonts\//, ""));
  return file
    ? new Response(Bun.file(file), { headers: { "content-type": "font/woff2", "cache-control": "public, max-age=2592000" } })
    : new Response("tidak ada", { status: 404 });
}
