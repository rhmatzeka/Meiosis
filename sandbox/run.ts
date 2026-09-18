/**
 * Sisi host: menjalankan satu run arena di dalam container.
 *
 * Kode buatan agent masuk lewat `docker cp`, bukan bind mount. Ini disengaja —
 * tidak ada satu pun direktori host yang terlihat dari dalam container, bahkan
 * yang read-only. Artefak keluar dengan cara yang sama setelah container mati.
 *
 * Batasan yang diberlakukan di sini, bukan sekadar didokumentasikan:
 *   --network none        tidak ada egress; dependensi sudah dipanggang ke image
 *   --memory / --cpus     batas sumber daya
 *   --pids-limit          mencegah fork bomb
 *   no-new-privileges     tidak bisa naik hak lewat setuid
 *   user non-root         sudah ditetapkan di image
 *   tanpa environment     tidak ada API key yang pernah masuk
 *
 * Catatan soal `--read-only`: sempat dipakai, lalu dilepas. Vite perlu menulis
 * berkas konfigurasi sementara di sebelah vite.config.ts, dan root filesystem
 * yang read-only membuat setiap build gagal. Yang hilang hanyalah satu lapis
 * pertahanan berlebih — container ini tetap fana, tanpa jaringan, tanpa satu
 * pun direktori host yang terlihat, sehingga apa pun yang ditulisnya mati
 * bersama container itu sendiri.
 */
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, normalize } from "node:path";

export const IMAGE = "meiosis-sandbox:1";

export interface SandboxResult {
  /** tsc --noEmit lolos. Terpisah dari buildOk: vite tidak memeriksa tipe. */
  typecheckOk: boolean;
  buildOk: boolean;
  /** Gerbang yang sesungguhnya: halaman benar-benar merender isi tanpa galat. */
  rendersOk: boolean;
  timedOut: boolean;
  buildLog: string;
  render: RenderReport | null;
  outDir: string;
  durationMs: number;
}

export interface RenderReport {
  ok: boolean;
  status?: number;
  consoleErrors: string[];
  axeViolations: { id: string; impact: string; count: number }[];
  domNodes: number;
  horizontalOverflowOnMobile: boolean;
  text: string;
  error?: string;
}

/** Agent hanya boleh menulis di sini. package.json & node_modules terkunci. */
const ALLOWED = [/^src\//, /^index\.html$/, /^public\//];

function assertSafe(path: string) {
  const p = normalize(path);
  if (p.startsWith("/") || p.includes("..")) throw new Error(`jalur tidak aman: ${path}`);
  if (!ALLOWED.some((re) => re.test(p))) {
    throw new Error(`agent tidak boleh menulis ${path} — hanya src/, public/, index.html`);
  }
}

const sh = async (args: string[], timeoutMs?: number) => {
  const proc = Bun.spawn(args, { stdout: "pipe", stderr: "pipe" });
  let timer: Timer | undefined;
  let killed = false;
  if (timeoutMs) timer = setTimeout(() => { killed = true; proc.kill("SIGKILL"); }, timeoutMs);
  const [out, err] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const code = await proc.exited;
  if (timer) clearTimeout(timer);
  return { code, out, err, killed };
};

export async function runInSandbox(
  files: Record<string, string>,
  opts: {
    timeoutMs?: number; memory?: string; cpus?: string; outDir?: string;
    /** Lewati render Chromium. Dipakai saat agent beriterasi — lihat agent-loop.ts. */
    quick?: boolean;
  } = {},
): Promise<SandboxResult> {
  const timeoutMs = opts.timeoutMs ?? 300_000;
  const started = performance.now();

  for (const p of Object.keys(files)) assertSafe(p);

  const stage = mkdtempSync(join(tmpdir(), "meiosis-stage-"));
  const outDir = opts.outDir ?? mkdtempSync(join(tmpdir(), "meiosis-out-"));

  try {
    for (const [rel, content] of Object.entries(files)) {
      const dest = join(stage, rel);
      mkdirSync(dirname(dest), { recursive: true });
      writeFileSync(dest, content, "utf8");
    }

    const created = await sh([
      "docker", "create",
      "--network", "none",
      "--memory", opts.memory ?? "2g",
      "--cpus", opts.cpus ?? "2",
      "--pids-limit", "256",
      "--tmpfs", "/tmp:rw,size=256m",
      ...(opts.quick ? ["-e", "SKIP_RENDER=1"] : []),
      "--security-opt", "no-new-privileges",
      IMAGE,
    ]);
    if (created.code !== 0) throw new Error(`docker create gagal: ${created.err}`);
    const cid = created.out.trim();

    try {
      await sh(["docker", "cp", `${stage}/.`, `${cid}:/work/`]);
      const run = await sh(["docker", "start", "-a", cid], timeoutMs);
      await sh(["docker", "cp", `${cid}:/work/out/.`, outDir]);

      const readFlag = (file: string, key: string) => {
        const p = join(outDir, file);
        return existsSync(p) ? JSON.parse(readFileSync(p, "utf8"))[key] === true : false;
      };
      const renderJson = join(outDir, "render.json");
      const render: RenderReport | null = existsSync(renderJson)
        ? JSON.parse(readFileSync(renderJson, "utf8"))
        : null;

      // Halaman yang lolos build tapi merender kosong dengan galat konsol
      // tetap gagal. Inilah ukuran "jalan atau tidak" yang jujur.
      const rendersOk =
        render?.ok === true &&
        render.consoleErrors.length === 0 &&
        render.text.trim().length > 0;

      return {
        typecheckOk: readFlag("typecheck.json", "typecheckOk"),
        buildOk: readFlag("build.json", "buildOk"),
        rendersOk,
        timedOut: run.killed,
        buildLog: existsSync(join(outDir, "build.log"))
          ? readFileSync(join(outDir, "build.log"), "utf8")
          : run.out + run.err,
        render,
        outDir,
        durationMs: Math.round(performance.now() - started),
      };
    } finally {
      await sh(["docker", "rm", "-f", cid]);
    }
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }
}

/**
 * Menjalankan perintah bebas atas sekumpulan berkas, di dalam container yang
 * sama terisolasinya.
 *
 * Dipakai ketika agent bekerja di direktori nyata milik pengguna, yang belum
 * tentu proyek Vite + React. Perintah pemeriksaannya ditentukan pengguna —
 * misalnya `bun test` atau `npm run build` — tapi tetap dieksekusi di dalam
 * sandbox, bukan di host. Kode buatan mesin tidak pernah dijalankan langsung
 * di mesin siapa pun.
 */
export async function runCommandInSandbox(
  files: Record<string, string>,
  command: string,
  opts: { timeoutMs?: number; memory?: string; cpus?: string } = {},
): Promise<{ code: number; output: string; timedOut: boolean; durationMs: number }> {
  const started = performance.now();
  const stage = mkdtempSync(join(tmpdir(), "meiosis-cmd-"));

  try {
    for (const [rel, content] of Object.entries(files)) {
      const p = normalize(rel);
      if (p.startsWith("/") || p.includes("..")) throw new Error(`jalur tidak aman: ${rel}`);
      const dest = join(stage, p);
      mkdirSync(dirname(dest), { recursive: true });
      writeFileSync(dest, content, "utf8");
    }

    const created = await sh([
      "docker", "create",
      "--network", "none",
      "--memory", opts.memory ?? "2g",
      "--cpus", opts.cpus ?? "2",
      "--pids-limit", "256",
      "--tmpfs", "/tmp:rw,size=256m",
      "--security-opt", "no-new-privileges",
      "--entrypoint", "sh",
      IMAGE, "-c", `cd /work && ${command} 2>&1 | tail -80`,
    ]);
    if (created.code !== 0) throw new Error(`docker create gagal: ${created.err}`);
    const cid = created.out.trim();

    try {
      await sh(["docker", "cp", `${stage}/.`, `${cid}:/work/`]);
      const run = await sh(["docker", "start", "-a", cid], opts.timeoutMs ?? 300_000);
      return {
        code: run.code,
        output: (run.out + run.err).slice(-6000),
        timedOut: run.killed,
        durationMs: Math.round(performance.now() - started),
      };
    } finally {
      await sh(["docker", "rm", "-f", cid]);
    }
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }
}
