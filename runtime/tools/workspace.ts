/**
 * Tempat kerja agent: sebuah direktori berisi kerangka proyek yang bisa dibaca,
 * ditulis, dan diperiksa berkali-kali.
 *
 * Inilah yang membedakan agent dari chatbot. Tanpa tempat kerja, agent hanya
 * bisa menebak sekali lalu berharap benar. Dengan tempat kerja, ia bisa menulis,
 * menjalankan pemeriksaan, membaca galatnya, dan memperbaiki — dan barulah
 * modul seperti persistence-high dan test-rigor-high punya arti.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync, cpSync, rmSync } from "node:fs";
import { join, dirname, normalize } from "node:path";
import { runInSandbox, runCommandInSandbox, type SandboxResult } from "../../sandbox/run";
import { resolve, relative } from "node:path";

/** Agent hanya boleh menyentuh berkas di sini. package.json dan config terkunci. */
const WRITABLE = [/^src\//, /^public\//, /^index\.html$/];
const TEMPLATE = "sandbox/template";

/** Berkas yang tidak boleh dibaca maupun ditulis agent di direktori nyata. */
const FORBIDDEN = [/(^|\/)\.env/, /(^|\/)\.git(\/|$)/, /(^|\/)node_modules(\/|$)/,
                   /(^|\/)\.ssh(\/|$)/, /\.pem$/, /\.key$/];

export class Workspace {
  /**
   * "template" memakai kerangka Vite + React bawaan; pemeriksaannya build penuh.
   * "attached" bekerja langsung di direktori nyata milik pengguna, dan
   * pemeriksaannya perintah yang ia tentukan sendiri.
   */
  readonly mode: "template" | "attached";
  readonly checkCommand?: string;

  constructor(readonly dir: string, opts: { attach?: boolean; checkCommand?: string } = {}) {
    this.mode = opts.attach ? "attached" : "template";
    this.checkCommand = opts.checkCommand;

    if (this.mode === "attached") {
      if (!existsSync(dir)) throw new Error(`direktori tidak ada: ${dir}`);
      return; // jangan sentuh isinya; ini milik pengguna
    }

    mkdirSync(dir, { recursive: true });
    // Mulai dari kerangka yang sama dengan yang ada di dalam image sandbox,
    // supaya apa yang dibaca agent sama dengan apa yang nanti dibangun.
    for (const f of ["src", "index.html"]) {
      const src = join(TEMPLATE, f);
      if (existsSync(src)) cpSync(src, join(dir, f), { recursive: true });
    }
  }

  private safe(path: string): string {
    const p = normalize(path).replace(/^\.\//, "");
    if (p.startsWith("/") || p.includes("..")) throw new Error(`jalur tidak aman: ${path}`);

    // Pengurungan sesungguhnya: apa pun bentuk jalurnya, hasil resolusinya
    // wajib tetap berada di dalam direktori kerja.
    const abs = resolve(this.dir, p);
    const rel = relative(resolve(this.dir), abs);
    if (rel.startsWith("..") || resolve(rel) === rel) {
      throw new Error(`jalur keluar dari tempat kerja: ${path}`);
    }
    if (FORBIDDEN.some((re) => re.test(p))) {
      throw new Error(`berkas ini terlarang: ${p}`);
    }
    return p;
  }

  private writable(path: string) {
    // Di direktori nyata milik pengguna, pengurungan dan daftar terlarang
    // sudah cukup; membatasi ke src/ akan membuatnya tidak berguna.
    if (this.mode === "attached") return;
    if (!WRITABLE.some((re) => re.test(path))) {
      throw new Error(`tidak boleh menulis ${path}. Hanya src/, public/, dan index.html yang bisa diubah.`);
    }
  }

  list(): string[] {
    const out: string[] = [];
    const walk = (rel: string, depth: number) => {
      if (depth > 6 || out.length > 600) return;
      const abs = join(this.dir, rel);
      if (!existsSync(abs)) return;
      for (const e of readdirSync(abs, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
        const r = rel ? `${rel}/${e.name}` : e.name;
        if (FORBIDDEN.some((re) => re.test(r))) continue;
        if (e.isDirectory()) walk(r, depth + 1);
        else out.push(r);
      }
    };
    walk("", 0);
    return out;
  }

  read(path: string): string {
    const p = this.safe(path);
    const abs = join(this.dir, p);
    if (!existsSync(abs)) throw new Error(`berkas tidak ada: ${p}. Pakai list_files untuk melihat yang tersedia.`);
    return readFileSync(abs, "utf8");
  }

  write(path: string, content: string): string {
    const p = this.safe(path);
    this.writable(p);
    const abs = join(this.dir, p);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content, "utf8");
    return p;
  }

  /** Berkas yang dikirim ke sandbox untuk diperiksa. */
  snapshot(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const f of this.list()) {
      if (this.mode === "attached" || WRITABLE.some((re) => re.test(f))) {
        try { out[f] = readFileSync(join(this.dir, f), "utf8"); } catch { /* biner, lewati */ }
      }
    }
    return out;
  }

  /** Membangun isi tempat kerja di sandbox. `quick` melewati render Chromium. */
  async check(opts: { quick?: boolean; outDir?: string } = {}): Promise<SandboxResult> {
    return runInSandbox(this.snapshot(), {
      timeoutMs: 300_000,
      quick: opts.quick,
      outDir: opts.outDir,
    });
  }

  /**
   * Menjalankan perintah pemeriksaan milik pengguna, tetap di dalam sandbox.
   * Dipakai di mode attached, di mana proyeknya belum tentu Vite + React.
   */
  async runCheckCommand(): Promise<{ ok: boolean; output: string }> {
    if (!this.checkCommand) return { ok: true, output: "tidak ada perintah pemeriksaan yang ditentukan." };
    const r = await runCommandInSandbox(this.snapshot(), this.checkCommand, { timeoutMs: 300_000 });
    return {
      ok: r.code === 0 && !r.timedOut,
      output: r.timedOut ? "perintah melewati batas waktu." : r.output,
    };
  }

  destroy() {
    rmSync(this.dir, { recursive: true, force: true });
  }
}
