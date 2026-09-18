/**
 * Menghentikan anvil dan server yang dinyalakan `bun run start`.
 *
 * `pgrep -f anvil` sempat dipakai dan itu berbahaya: polanya mencocokkan
 * perintah shell apa pun yang kebetulan memuat kata itu — termasuk perintah
 * yang sedang menjalankan skrip ini — lalu membunuhnya. Sekarang anvil dicari
 * dengan pencocokan nama proses persis, dan server lewat port yang ia dengarkan.
 */
const sh = async (args: string[]) => {
  const p = Bun.spawn(args, { stdout: "pipe", stderr: "pipe" });
  const out = await new Response(p.stdout).text();
  await p.exited;
  return out.trim();
};

const kill = async (label: string, pids: string[]) => {
  const clean = pids.filter((x) => x && Number(x) !== process.pid);
  if (!clean.length) { console.log(`  ${label}: tidak jalan`); return; }
  for (const pid of clean) await sh(["kill", pid]);
  console.log(`  ${label}: dihentikan (${clean.join(", ")})`);
};

// Server dicari lewat port, bukan lewat pola perintah.
const listening = await sh(["ss", "-lptnH", "sport = :5173"]);
await kill("server", [...listening.matchAll(/pid=(\d+)/g)].map((m) => m[1]));

// -x mencocokkan NAMA proses persis, bukan seluruh baris perintah.
await kill("anvil", (await sh(["pgrep", "-x", "anvil"])).split("\n"));
