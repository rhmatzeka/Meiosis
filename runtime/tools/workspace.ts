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
import { runInSandbox, type SandboxResult } from "../../sandbox/run";

/** Agent hanya boleh menyentuh berkas di sini. package.json dan config terkunci. */
const WRITABLE = [/^src\//, /^public\//, /^index\.html$/];
const TEMPLATE = "sandbox/template";

export class Workspace {
  constructor(readonly dir: string) {
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
    return p;
  }

  private writable(path: string) {
    if (!WRITABLE.some((re) => re.test(path))) {
      throw new Error(`tidak boleh menulis ${path}. Hanya src/, public/, dan index.html yang bisa diubah.`);
    }
  }

  list(): string[] {
    const out: string[] = [];
    const walk = (rel: string) => {
      const abs = join(this.dir, rel);
      if (!existsSync(abs)) return;
      for (const e of readdirSync(abs, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
        const r = rel ? `${rel}/${e.name}` : e.name;
        if (e.isDirectory()) walk(r);
        else out.push(r);
      }
    };
    walk("");
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

  /** Berkas yang akan dikirim ke sandbox: hanya yang boleh ditulis agent. */
  snapshot(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const f of this.list()) {
      if (WRITABLE.some((re) => re.test(f))) out[f] = readFileSync(join(this.dir, f), "utf8");
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

  destroy() {
    rmSync(this.dir, { recursive: true, force: true });
  }
}
