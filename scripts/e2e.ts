/**
 * Menjalankan uji end-to-end di dalam container sandbox.
 *
 * Browser-nya dijalankan di container karena di situlah Chromium dan
 * playwright sudah terpasang — tidak perlu memasang apa pun di host.
 * `--network host` dipakai agar container bisa menjangkau server UI di laptop.
 *
 *   bun run e2e          uji UI saja, cepat, tanpa memakai kuota model
 *   bun run e2e:full     termasuk menjalankan agent sungguhan
 */
const full = process.argv.includes("--full");
const image = "meiosis-sandbox:1";

const sh = async (args: string[], inherit = false) => {
  const p = Bun.spawn(args, { stdout: inherit ? "inherit" : "pipe", stderr: inherit ? "inherit" : "pipe" });
  const out = inherit ? "" : await new Response(p.stdout).text();
  const code = await p.exited;
  return { code, out: out.trim() };
};

const up = await fetch("http://127.0.0.1:5173/api/status").then((r) => r.ok).catch(() => false);
if (!up) {
  console.error("\n  Server UI tidak menjawab di :5173. Jalankan `bun run ui` lebih dulu.\n");
  process.exit(1);
}

const created = await sh([
  "docker", "create", "--network", "host",
  "-e", "HOME=/tmp", "-e", `RUN_AGENT=${full ? "1" : "0"}`,
  "--entrypoint", "sh", image, "-c", "bun run /work/ui.spec.ts",
]);
const cid = created.out;
if (created.code !== 0 || !cid) { console.error("docker create gagal:", created.out); process.exit(1); }

try {
  await sh(["docker", "cp", "e2e/ui.spec.ts", `${cid}:/work/ui.spec.ts`]);
  const run = await sh(["docker", "start", "-a", cid], true);
  await sh(["docker", "cp", `${cid}:/tmp/e2e-run.png`, "e2e/last-run.png"]);
  process.exit(run.code);
} finally {
  await sh(["docker", "rm", "-f", cid]);
}
