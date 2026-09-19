// UI Meiosis. Tanpa framework dan tanpa build step — server yang sama menyajikan
// API dan halaman ini.

const $ = (s) => document.querySelector(s);
const el = (h) => { const t = document.createElement("template"); t.innerHTML = h.trim(); return t.content.firstChild; };
const api = async (p, opts) => (await fetch(p, opts)).json();
const post = (p, body) => api(p, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body ?? {}) });
const esc = (s) => String(s).replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[c]);

// Lokus yang paling menentukan perbedaan antar agent di arena — disorot.
const KEY_LOCI = ["SECURITY_INSTINCT", "AESTHETIC", "TEST_RIGOR", "STACK_AFFINITY", "DISCIPLINE_PRIMARY"];
const GEN_COLOR = ["var(--g0)", "var(--child)", "var(--g1)", "var(--accent)"];

let state = {
  status: null, agents: [], pregs: [], sel: [], wallet: null, royalty: {},
  runSel: [], runBusy: false, runOut: null,
  jobId: null, jobLive: null,
};

const TASK_CONTOH = [
  ["Komponen form", `Buat komponen React "StakeForm" dengan input jumlah dan tombol Stake.\nBalas dengan kode saja.`],
  ["Landing page", `Buat landing page untuk dApp staking bernama Epoch: hero, cara kerja, tabel APY.\nBalas dengan kode saja.`],
  ["Audit singkat", `Tinjau potongan kode ini dan sebutkan masalahnya:\n\nfunction Balance({ html }) { return <div dangerouslySetInnerHTML={{__html: html}} /> }`],
];

// --- wallet ---
//
// Tanpa pustaka dan tanpa build step: wallet browser (MetaMask dan sejenisnya)
// diajak bicara lewat EIP-1193 apa adanya. Calldata disusun server di /api/tx,
// ditandatangani di sini oleh wallet pengguna — server tidak pernah memegang
// kuncinya.

const eth = () => window.ethereum;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const short = (a) => a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "";
const same = (a, b) => !!a && !!b && a.toLowerCase() === b.toLowerCase();

let toastTimer;
function toast(msg, kind = "") {
  const t = $("#toast");
  t.textContent = msg; t.className = `toast ${kind}`;
  clearTimeout(toastTimer);
  if (kind) toastTimer = setTimeout(() => t.classList.add("hidden"), kind === "bad" ? 9000 : 4000);
}

async function ensureChain() {
  const want = "0x" + state.status.chainId.toString(16);
  if ((await eth().request({ method: "eth_chainId" })) === want) return;
  try {
    await eth().request({ method: "wallet_switchEthereumChain", params: [{ chainId: want }] });
  } catch (e) {
    // 4902: wallet belum mengenal chain ini. Sepolia sudah bawaan; Anvil belum.
    if (e.code !== 4902 || !state.status.local) throw e;
    await eth().request({ method: "wallet_addEthereumChain", params: [{
      chainId: want, chainName: "Anvil lokal", rpcUrls: [state.status.rpc],
      nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    }] });
  }
}

async function connectWallet() {
  if (!eth()) {
    toast("Tidak ada wallet di browser ini. Pasang MetaMask (metamask.io) atau wallet EVM lain, lalu muat ulang.", "bad");
    return;
  }
  try {
    const [addr] = await eth().request({ method: "eth_requestAccounts" });
    await ensureChain();
    state.wallet = addr;
    try { localStorage.setItem("wallet", "1"); } catch {}
    await refresh(true);
  } catch (e) { toast(e.message ?? String(e), "bad"); }
}

function disconnectWallet() {
  state.wallet = null;
  try { localStorage.removeItem("wallet"); } catch {}
  refresh();
}

if (eth()) {
  eth().on?.("accountsChanged", (a) => { state.wallet = a[0] ?? null; refresh(true); });
  eth().on?.("chainChanged", () => refresh(true));
}

/** Pesan galat wallet dan viem yang panjang diringkas jadi satu kalimat. */
const why = (e) => {
  const m = e?.data?.message ?? e?.message ?? String(e);
  if (e?.code === 4001) return "dibatalkan di wallet";
  return (m.match(/reverted with custom error '([^']+)'/)?.[1] ?? m.match(/execution reverted:?\s*(.*)/)?.[1] ?? m).slice(0, 200);
};

async function sendTx(action, args) {
  const tx = await post("/api/tx", { action, args, from: state.wallet });
  if (tx.error) throw new Error(tx.error);
  await ensureChain();
  toast(`konfirmasi di wallet: ${tx.label}…`);
  const hash = await eth().request({ method: "eth_sendTransaction", params: [{ from: state.wallet, to: tx.to, data: tx.data, value: tx.value }] });
  toast(`menunggu blok: ${tx.label}…`);
  for (let i = 0; i < 200; i++) {
    const r = await eth().request({ method: "eth_getTransactionReceipt", params: [hash] });
    if (r) {
      if (r.status !== "0x1") throw new Error(`${tx.label} revert di chain`);
      return { hash, label: tx.label };
    }
    await sleep(1500);
  }
  throw new Error("transaksi belum juga masuk blok — cek di wallet");
}

/**
 * Satu pintu untuk semua aksi on-chain. Dengan wallet: ditandatangani pengguna.
 * Tanpa wallet di Anvil: ditandatangani server memakai akun demo. Tanpa wallet
 * di Sepolia: minta hubungkan wallet dulu.
 */
async function act(action, args = {}, opts = {}) {
  try {
    let done;
    if (state.wallet) done = await sendTx(action, args);
    else if (state.status.local) {
      toast("mengirim transaksi dengan akun demo…");
      const r = await post("/api/local-act", { action, args, as: opts.as });
      if (r.error) throw new Error(r.error);
      done = { hash: r.hash, label: `${action} oleh ${r.by}` };
    } else { toast("Hubungkan wallet dulu untuk bertransaksi.", "bad"); return null; }
    toast(`✓ ${done.label}`, "ok");
    await refresh(true);
    return done;
  } catch (e) {
    toast(why(e), "bad");
    return null;
  }
}

/** Siapa "aku" di halaman ini: wallet yang terhubung, atau Alice di demo lokal. */
const me = () => state.wallet ?? (state.status?.local ? state.status.accounts?.[1]?.address : null);
const canManage = (a) => state.wallet ? same(a.owner, state.wallet) : !!state.status?.local;

$("#btn-wallet").onclick = () => state.wallet ? disconnectWallet() : connectWallet();

// --- tab ---
document.querySelectorAll("nav button").forEach((b) => b.onclick = () => {
  document.querySelectorAll("nav button").forEach((x) => x.classList.toggle("active", x === b));
  ["roster", "breed", "run", "tree", "arena"].forEach((t) => $("#tab-" + t).classList.toggle("hidden", t !== b.dataset.tab));
  if (b.dataset.tab === "arena") renderArena();
  if (b.dataset.tab === "run") renderRun();
});

$("#btn-theme").onclick = () => {
  const root = document.documentElement;
  const next = root.dataset.theme === "dark" ? "light" : "dark";
  root.dataset.theme = next;
  try { localStorage.setItem("theme", next); } catch {}
};
try { const t = localStorage.getItem("theme"); if (t) document.documentElement.dataset.theme = t; } catch {}

// --- status ---
async function refresh(fresh = false) {
  state.status = await api("/api/status");
  const st = state.status;
  const live = st.chainLive;
  const net = st.local ? "anvil" : st.chain;
  $("#dot-chain").classList.toggle("on", live);
  $("#s-chain").textContent = live ? (st.deployed ? `${net} · ter-deploy` : `${net} · belum deploy`) : `${net} tidak terjangkau`;
  $("#s-block").textContent = live ? `blok ${st.block}` : "blok —";
  $("#btn-wallet").textContent = state.wallet ? `${short(state.wallet)} · putus` : "Hubungkan wallet";

  if (live && st.deployed) {
    const q = fresh ? "?fresh=1" : "";
    [state.agents, state.pregs] = await Promise.all([api("/api/agents" + q), api("/api/pregnancies" + q)]);
    const who = state.wallet ? [state.wallet] : st.local ? st.accounts.map((a) => a.address) : [];
    const bal = await Promise.all(who.map((a) => api(`/api/royalty?address=${a}`)));
    state.royalty = Object.fromEntries(who.map((a, i) => [a, bal[i].pendingEth]));
  } else {
    state.agents = []; state.pregs = []; state.royalty = {};
  }
  renderWallet(); renderRoster(); renderBreed(); renderTree();
  // tab Jalankan hanya digambar ulang saat idle, agar hasil tidak hilang
  if (!state.runBusy && !state.runOut && !state.jobLive) renderRun();
}

function needChain() {
  const st = state.status;
  if (!st?.chainLive) return el(st?.local
    ? `<div class="note bad"><b>Anvil belum jalan.</b> Buka terminal lain lalu jalankan <code>bun run anvil</code>,
       halaman ini akan menyambung sendiri.</div>`
    : `<div class="note bad"><b>RPC ${esc(st?.chain ?? "")} tidak terjangkau.</b> Server akan mencoba lagi sendiri.</div>`);
  if (!st.deployed) {
    if (!st.local) return el(`<div class="note"><b>Kontrak belum ter-deploy ke ${esc(st.chain)}.</b>
      Jalankan <code>bun run deploy:sepolia</code> dari terminal, lalu muat ulang halaman ini.</div>`);
    const n = el(`<div class="note"><b>Kontrak belum ter-deploy.</b>
      Sekali klik: deploy lima kontrak, daftarkan modul skill, mint empat founder ke tiga pemilik berbeda, lalu segel generasi nol.
      <div class="row mt"><button class="act" id="btn-deploy">Deploy &amp; mint generasi nol</button></div></div>`);
    n.querySelector("#btn-deploy").onclick = async (e) => {
      e.target.disabled = true; e.target.textContent = "men-deploy… (±1 menit)";
      const r = await post("/api/deploy");
      if (r.error) { e.target.disabled = false; e.target.textContent = "Coba lagi"; toast(r.error, "bad"); return; }
      await refresh(true);
    };
    return n;
  }
  return null;
}

// --- dompet & royalti ---
function renderWallet() {
  const box = $("#wallet-panel"); box.innerHTML = "";
  const st = state.status;
  if (!st?.deployed) return;

  if (!state.wallet && !st.local) {
    const n = el(`<div class="note">Hubungkan wallet (MetaMask atau sejenisnya, jaringan ${esc(st.chainName)})
      untuk mengawinkan agent, memberi nama agent-mu, memasang tarif kawin, dan menarik royalti.
      <div class="row mt"><button class="act" id="wp-connect">Hubungkan wallet</button></div></div>`);
    n.querySelector("#wp-connect").onclick = connectWallet;
    box.append(n);
    return;
  }

  const rows = Object.entries(state.royalty);
  const card = el(`<div class="card" style="margin-bottom:14px">
    <h3>${state.wallet ? "Dompetmu" : "Akun demo"} <span class="gen">${state.wallet
      ? `${esc(short(state.wallet))} · ${state.agents.filter((a) => same(a.owner, state.wallet)).length} agent milikmu`
      : "tanpa wallet, transaksi ditandatangani server dengan akun bawaan Anvil"}</span></h3>
    <table class="mt"><thead><tr><th>akun</th><th class="num">royalti siap ditarik</th><th></th></tr></thead><tbody></tbody></table>
    <div class="gen mt">Setiap bayaran ke sebuah agent — sewa atau tarif kawin — 5% mengalir ke pemilik induknya,
      2,5% ke kakek-neneknya, dan seterusnya sampai empat generasi.</div>
  </div>`);
  const tb = card.querySelector("tbody");
  for (const [addr, v] of rows) {
    const acc = st.accounts?.find((a) => same(a.address, addr));
    const tr = el(`<table><tr><td>${esc(acc?.name ?? "kamu")} <span class="gen mono">${esc(short(addr))}</span></td>
      <td class="num">${esc(v)} ETH</td>
      <td class="num"><button class="act ghost sm" ${Number(v) > 0 ? "" : "disabled"}>Tarik</button></td></tr></table>`).querySelector("tr");
    tr.querySelector("button").onclick = () => act("withdraw", {}, { as: addr });
    tb.append(tr);
  }
  box.append(card);
}

// --- roster ---
function agentCard(a, opts = {}) {
  const hi = a.traits.filter((t) => KEY_LOCI.includes(t.name));
  const mine = state.wallet && same(a.owner, state.wallet);
  const explorer = state.status?.explorer;
  const c = el(`<div class="card${opts.sel ? " sel" : ""}">
    <h3><span style="color:${GEN_COLOR[a.generation % 4]}">●</span> ${esc(a.name)}
      <span class="gen">#${a.id} · gen ${a.generation} · ${mine ? '<span class="mine">milikmu</span>' : esc(a.ownerName)}</span></h3>
    <div class="traits">${hi.map((t) => `<span class="trait hi">${t.name.toLowerCase().replace(/_/g, " ")} <b>${esc(t.value)}</b></span>`).join("")}</div>
    <div class="traits">${a.modules.map((m) => `<span class="trait">${esc(m)}</span>`).join("") || '<span class="trait">tanpa modul</span>'}</div>
    <dl class="kv">
      <dt>genome</dt><dd class="mono">${a.genome.slice(0, 22)}…</dd>
      <dt>tier</dt><dd>${a.modelTier} · temp ${a.params.temperature} · ${a.params.maxTokens} token</dd>
      ${a.parents[0] ? `<dt>induk</dt><dd>#${a.parents[0]} × #${a.parents[1]}</dd>` : ""}
      <dt>kawin</dt><dd>${a.stud.listed
        ? `<span class="badge on">pejantan · ${Number(a.stud.feeEth) ? esc(a.stud.feeEth) + " ETH" : "gratis"}</span>`
        : '<span class="badge">tidak dibuka untuk umum</span>'}</dd>
      <dt>manifest</dt><dd class="mono">${a.manifestHashOnChain === "0x0000000000000000"
        ? (canManage(a) ? `<button class="act ghost sm" data-do="manifest">catat ke chain</button>` : "belum dicatat pemiliknya")
        : (a.manifestHashOnChain === a.manifestHashComputed
            ? `<span style="color:var(--ok)">✓ cocok</span> ${a.manifestHashOnChain.slice(0, 12)}…`
            : `<span style="color:var(--bad)">✗ beda dari hasil hitung ulang</span>`)}</dd>
    </dl>
    ${opts.actions === false ? "" : `<div class="actions">
      <a class="act ghost sm" href="/api/agents/${a.id}/agent.md" download title="subagent Claude Code">Ekspor .md</a>
      <button class="act ghost sm" data-do="pay">Bayar / sewa</button>
      ${canManage(a) ? `
        <button class="act ghost sm" data-do="name">Beri nama</button>
        <button class="act ghost sm" data-do="stud">${a.stud.listed ? "Ubah tarif kawin" : "Buka untuk kawin"}</button>
        ${a.stud.listed ? '<button class="act ghost sm" data-do="unstud">Tutup kawin</button>' : ""}` : ""}
      ${explorer ? `<a class="act ghost sm" href="${explorer}/nft/${state.status.addresses.registry}/${a.id}" target="_blank" rel="noopener noreferrer">Etherscan ↗</a>` : ""}
    </div>`}
  </div>`);

  const on = (k, fn) => { const b = c.querySelector(`[data-do="${k}"]`); if (b) b.onclick = (ev) => { ev.stopPropagation(); fn(b); }; };
  const busy = async (b, p) => { b.disabled = true; await p; b.disabled = false; };
  on("manifest", (b) => busy(b, act("setManifestHash", { id: a.id })));
  on("name", (b) => {
    const name = prompt(`Nama baru untuk agent #${a.id} (maks 32 huruf):`, a.named ? a.name : "");
    if (name?.trim()) busy(b, act("setName", { id: a.id, name: name.trim() }));
  });
  on("stud", (b) => {
    const fee = prompt(`Tarif kawin agent #${a.id} dalam ETH (0 = gratis).\nDibayar oleh siapa pun yang mengawinkan agent-mu; sebagian mengalir ke leluhurnya.`,
      a.stud.listed ? a.stud.feeEth : "0");
    if (fee !== null) busy(b, act("listForStud", { id: a.id, feeEth: fee.trim() || "0" }));
  });
  on("unstud", (b) => busy(b, act("unlistStud", { id: a.id })));
  on("pay", (b) => {
    const amt = prompt(`Bayar agent #${a.id} berapa ETH?\nPemiliknya menerima sisanya setelah bagian untuk leluhur.`, "0.001");
    if (amt?.trim()) busy(b, act("pay", { id: a.id, amountEth: amt.trim(), memo: "sewa" }));
  });
  c.querySelectorAll("a").forEach((x) => x.onclick = (ev) => ev.stopPropagation());

  if (opts.onClick) c.onclick = (ev) => { if (ev.target.closest("button, a")) return; opts.onClick(a); };
  if (opts.onClick) c.style.cursor = "pointer";
  return c;
}

function renderRoster() {
  const box = $("#roster"); box.innerHTML = "";
  const n = needChain(); if (n) { box.append(n); return; }
  if (!state.agents.length) { box.append(el('<div class="empty">belum ada agent</div>')); return; }
  const g = el('<div class="grid"></div>');
  state.agents.forEach((a) => g.append(agentCard(a)));
  box.append(g);
}

// --- kawinkan ---
async function renderBreed() {
  const box = $("#breed"); box.innerHTML = "";
  const n = needChain(); if (n) { box.append(n); return; }
  const local = state.status.local;

  const pending = state.pregs.filter((p) => !p.hatched);
  if (pending.length) {
    const list = el('<div class="mt"></div>');
    for (const p of pending) {
      const forMe = same(p.to, me());
      const item = el(`<div class="card mt">
        <h3>Kehamilan #${p.id} <span class="gen">#${p.parentA} × #${p.parentB}${forMe ? ' · <span class="mine">anaknya untukmu</span>' : ` · untuk ${esc(short(p.to))}`}</span></h3>
        <dl class="kv">
          <dt>reveal</dt><dd>blok ${p.revealBlock}</dd>
          <dt>status</dt><dd>${p.expired ? '<span style="color:var(--bad)">blockhash kedaluwarsa — perlu dijadwalkan ulang</span>'
            : p.ready ? '<span style="color:var(--ok)">siap ditetaskan</span>'
            : `menunggu ${p.blocksLeft} blok lagi${local ? "" : ` (±${p.blocksLeft * 12} detik)`}`}</dd>
        </dl>
        <div class="row mt">
          ${p.expired
            ? `<button class="act" data-reroll="${p.id}">Jadwalkan ulang</button>`
            : `<button class="act" ${p.ready ? "" : "disabled"} data-hatch="${p.id}">Tetaskan</button>`}
          ${local ? '<button class="act ghost" data-mine="1">Majukan 6 blok</button>' : ""}
          <span class="gen">siapa pun boleh menetaskan; anaknya tetap jatuh ke pemesan</span>
        </div></div>`);
      const h = item.querySelector("[data-hatch]");
      if (h) h.onclick = async (e) => { e.target.disabled = true; e.target.textContent = "menetaskan…"; await act("hatch", { pid: p.id }); };
      const rr = item.querySelector("[data-reroll]");
      if (rr) rr.onclick = async (e) => { e.target.disabled = true; await act("reroll", { pid: p.id }); };
      const m = item.querySelector("[data-mine]");
      if (m) m.onclick = async () => { await post("/api/mine"); await refresh(true); };
      list.append(item);
    }
    box.append(list);
  }

  const picker = el(`<div class="mt"><p class="sub">Pilih dua induk. Agent milik orang lain hanya bisa dipakai
    kalau pemiliknya membukanya untuk kawin, dan kamu membayar tarifnya.</p><div class="grid" id="pick"></div></div>`);
  state.agents.forEach((a) => picker.querySelector("#pick").append(
    agentCard(a, {
      sel: state.sel.includes(a.id), actions: false,
      onClick: (x) => {
        const i = state.sel.indexOf(x.id);
        if (i >= 0) state.sel.splice(i, 1);
        else if (state.sel.length < 2) state.sel.push(x.id);
        else state.sel = [state.sel[1], x.id];
        renderBreed();
      },
    })));
  box.append(picker);

  if (state.sel.length === 2) {
    const [a, b] = state.sel.map((id) => state.agents.find((x) => x.id === id));
    if (!a || !b) { state.sel = []; return; }
    const rel = await api(`/api/relatedness?a=${a.genomeRaw}&b=${b.genomeRaw}`);
    const pct = Math.round((rel.value / 255) * 100);

    // Tarif yang harus dibayar: nol untuk agent milik sendiri.
    const who = me();
    const cost = [a, b].map((x) => same(x.owner, who) ? { ok: true, fee: 0 }
      : x.stud.listed ? { ok: true, fee: Number(x.stud.feeEth) } : { ok: false, fee: 0 });
    const blocked = [a, b].filter((x, i) => !cost[i].ok);
    const total = cost.reduce((s, c) => s + c.fee, 0);

    const panel = el(`<div class="card mt">
      <h3>${esc(a.name)} × ${esc(b.name)}</h3>
      <dl class="kv">
        <dt>kekerabatan</dt><dd>${rel.value}/255 (${pct}%) ${pct > 60
          ? '<span style="color:var(--warn)">— berkerabat dekat, variasi anak akan rendah</span>' : ""}</dd>
        <dt>masa hamil</dt><dd>5 blok${local ? "" : " (±1 menit)"}</dd>
        <dt>biaya</dt><dd>${blocked.length ? "—" : total ? `${+total.toFixed(6)} ETH tarif kawin` : "gratis"}</dd>
      </dl>
      <table class="mt"><thead><tr><th>lokus</th><th>${esc(a.name)}</th><th>${esc(b.name)}</th></tr></thead><tbody>
      ${KEY_LOCI.map((k) => {
        const ta = a.traits.find((t) => t.name === k).value, tb = b.traits.find((t) => t.name === k).value;
        return `<tr><td>${k.toLowerCase().replace(/_/g, " ")}</td><td>${esc(ta)}</td><td>${esc(tb)}</td></tr>`;
      }).join("")}
      </tbody></table>
      ${blocked.length ? `<div class="note bad">${blocked.map((x) => `#${x.id}`).join(" dan ")} bukan milikmu dan belum dibuka untuk kawin oleh pemiliknya.</div>` : ""}
      <div class="row mt"><button class="act" id="go" ${blocked.length || (!state.wallet && !local) ? "disabled" : ""}>Kawinkan</button>
        <span class="gen">${state.wallet ? `dari wallet ${esc(short(state.wallet))} — anaknya jadi milikmu`
          : local ? "dipanggil oleh Alice (akun demo)" : "hubungkan wallet untuk mengawinkan"}</span></div>
    </div>`);
    panel.querySelector("#go").onclick = async (e) => {
      e.target.disabled = true; e.target.textContent = "mengirim…";
      const r = await act("breed", { a: a.id, b: b.id });
      if (!r) { e.target.disabled = false; e.target.textContent = "Kawinkan"; return; }
      state.sel = []; renderBreed();
    };
    box.append(panel);
  }
}

// --- jalankan ---
const price = () => state.status?.public && Number(state.status.runPriceEth) > 0;

function renderRun() {
  const box = $("#run"); box.innerHTML = "";
  const n = needChain(); if (n) { box.append(n); return; }

  const picker = el(`<div><p class="sub">Pilih satu atau lebih agent:</p><div class="grid" id="rpick"></div></div>`);
  state.agents.forEach((a) => picker.querySelector("#rpick").append(
    agentCard(a, {
      sel: state.runSel.includes(a.id), actions: false,
      onClick: (x) => {
        const i = state.runSel.indexOf(x.id);
        if (i >= 0) state.runSel.splice(i, 1); else state.runSel.push(x.id);
        renderRun();
      },
    })));
  box.append(picker);

  const panel = el(`<div class="card mt">
    <div class="row">
      <b>Tugas</b>
      ${TASK_CONTOH.map((t, i) => `<button class="act ghost" style="padding:3px 9px;font-size:12px" data-eg="${i}">${t[0]}</button>`).join("")}
    </div>
    <textarea id="task" rows="5" style="width:100%;margin-top:10px;background:var(--panel-2);color:var(--text);
      border:1px solid var(--line);border-radius:8px;padding:10px;font:inherit;resize:vertical"
      placeholder="Tulis tugas untuk agent…"></textarea>
    <div class="row mt">
      <button class="act" id="go-run" ${state.runSel.length && !state.runBusy ? "" : "disabled"}>
        ${state.runBusy ? "menjalankan…" : `Jalankan di ${state.runSel.length} agent`}</button>
      <label class="gen" style="display:flex;gap:6px;align-items:center">
        <input type="checkbox" id="agentmode" checked /> <b>mode agent</b> (pakai tool, bangun, perbaiki sendiri)</label>
      <label class="gen" style="display:flex;gap:6px;align-items:center">
        <input type="checkbox" id="mock" /> mode tiruan (tanpa memakai kuota)</label>
      <span class="gen">${state.runBusy ? "" : "mode agent: maksimal 10 langkah, lalu build dan render"}</span>
    </div>
    ${state.status.runReady ? "" : `<div class="note bad">Server ini belum punya kunci model, jadi agent belum bisa
      bekerja sungguhan — hanya <b>mode tiruan</b> yang jalan. Pemilik server: isi <code>GROQ_API_KEY</code> di <code>.env</code>
      (gratis di console.groq.com/keys) lalu nyalakan ulang server.</div>`}
    ${price() ? `<div class="gen mt">Tiap agent dibayar <b>${esc(state.status.runPriceEth)} ETH</b> dari wallet-mu sebelum bekerja —
      masuk ke pemiliknya, dan sebagian ke pemilik leluhurnya.</div>`
      : state.status.public ? `<div class="gen mt">Server publik: jumlah run per jam dibatasi.</div>` : ""}
  </div>`);

  panel.querySelectorAll("[data-eg]").forEach((b) => b.onclick = () => {
    panel.querySelector("#task").value = TASK_CONTOH[Number(b.dataset.eg)][1];
  });
  panel.querySelector("#go-run").onclick = async () => {
    const task = panel.querySelector("#task").value.trim();
    if (!task) { alert("tugasnya masih kosong"); return; }

    const mock = panel.querySelector("#mock")?.checked;
    const mode = panel.querySelector("#agentmode")?.checked ? "agent" : "single";

    // Server berbayar: setiap agent dibayar lebih dulu, lalu hash tx-nya jadi bukti.
    const payments = {};
    if (price() && !mock) {
      if (!state.wallet) { toast("Hubungkan wallet dulu untuk membayar agent.", "bad"); return; }
      for (const id of state.runSel) {
        const r = await act("pay", { id, amountEth: state.status.runPriceEth, memo: "run" });
        if (!r) return;
        payments[id] = r.hash;
      }
    }

    state.runBusy = true; state.runOut = null; state.jobLive = null;
    renderRun();

    const started = await post("/api/run", { ids: state.runSel, task, mode, mock, payments });
    if (started.error) { state.runBusy = false; state.runOut = { error: started.error }; renderRun(); return; }

    state.jobId = started.jobId;
    // Tarik kemajuannya sambil jalan, supaya langkah agent terlihat saat terjadi
    // dan bukan setelah sepuluh menit layar diam.
    const poll = async () => {
      const j = await api(`/api/job/${state.jobId}`);
      if (j.error) { state.runBusy = false; state.runOut = { error: j.error }; renderRun(); return; }
      state.jobLive = j;
      if (j.status === "running") { renderRun(); setTimeout(poll, 1500); return; }
      state.runBusy = false;
      state.jobLive = null;
      state.runOut = { results: j.results };
      renderRun();
    };
    poll();
  };
  box.append(panel);

  // Kemajuan langsung selagi job berjalan.
  if (state.jobLive) {
    for (const a of state.jobLive.agents) {
      const ag = state.agents.find((x) => x.id === a.id);
      const last = a.steps[a.steps.length - 1];
      box.append(el(`<div class="card mt">
        <h3>${esc(ag?.name ?? "#" + a.id)}
          <span class="gen">${a.done ? "selesai" : `berjalan · ${a.steps.length} langkah`}${a.model ? " · " + esc(a.model) : ""}</span></h3>
        ${a.tools ? `<div class="traits">${a.tools.map((t) => `<span class="trait">${esc(t)}</span>`).join("")}</div>` : ""}
        ${a.steps.length ? `<div class="mt" style="border:1px solid var(--line);border-radius:8px;overflow:hidden">
          ${a.steps.slice(-8).map((s) => `<div style="display:flex;gap:10px;padding:6px 11px;border-bottom:1px solid var(--line);font-size:12px">
            <span class="mono" style="color:var(--faint);min-width:20px">${s.step}</span>
            <span class="mono"><b>${esc(s.tool ?? s.kind)}</b></span>
            <span class="gen mono" style="min-width:0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc((s.result ?? s.text ?? "").split("\n")[0].slice(0, 90))}</span>
          </div>`).join("")}
        </div>` : `<div class="gen mt">menunggu langkah pertama…</div>`}
        ${!a.done && last?.tool === "run_check" ? `<div class="gen mt">membangun di sandbox, ~50 detik…</div>` : ""}
      </div>`));
    }
    box.append(el(`<div class="gen mt">berjalan ${Math.round(state.jobLive.elapsedMs / 1000)} detik · halaman menarik kemajuan tiap 1,5 detik</div>`));
    return;
  }

  if (!state.runOut) return;
  if (state.runOut.error) { box.append(el(`<div class="note bad">${esc(state.runOut.error)}</div>`)); return; }

  for (const r of state.runOut.results) {
    const a = state.agents.find((x) => x.id === r.id);
    if (!r.ok) { box.append(el(`<div class="note bad"><b>#${r.id}</b> gagal: ${esc(r.error)}</div>`)); continue; }
    box.append(el(`<div class="card mt">
      <h3>${esc(a?.name ?? "#" + r.id)} <span class="gen">${esc(r.model ?? "-")}${
        r.loop
          ? ` · ${r.loop.promptTokens}+${r.loop.completionTokens} token · ${(r.loop.durationMs / 1000).toFixed(0)}s`
          : ` · ${r.promptTokens ?? 0}+${r.completionTokens ?? 0} token · ${((r.durationMs ?? 0) / 1000).toFixed(1)}s`
      }${r.mocked ? " · TIRUAN" : ""}</span></h3>
      <div class="traits">${(r.modules ?? []).map((m) => `<span class="trait">${esc(m)}</span>`).join("")}</div>
      <dl class="kv">
        <dt>manifest</dt><dd class="mono">${esc(r.manifestHash ?? "-")}</dd>
        ${r.loop
          ? `<dt>tool</dt><dd>${(r.tools ?? []).join(", ") || "tidak ada"}</dd>
             <dt>batas langkah</dt><dd>genome memberi ${r.maxSteps ?? "-"}, UI membatasi 10</dd>`
          : `<dt>tool</dt><dd>${(r.toolsDeclared ?? []).length
              ? `genome memberi <b>${r.toolsDeclared.join(", ")}</b>, runtime menyediakan <b>${(r.toolsAvailable ?? []).length ? r.toolsAvailable.join(", ") : "belum ada"}</b>`
              : "tidak ada"}</dd>`}
      </dl>
      ${r.loop ? loopBlock(r.loop, r) : ""}
      ${r.built ? buildBlock(r.built) : ""}
      <details ${r.built ? "" : "open"} class="mt">
        <summary class="gen" style="cursor:pointer">${r.loop ? "ringkasan agent" : "keluaran mentah agent"}</summary>
        <pre style="background:var(--panel-2);border:1px solid var(--line);border-radius:8px;padding:12px;
          overflow:auto;max-height:420px;font-size:12px;line-height:1.5"><code>${esc(r.output ?? "")}</code></pre>
      </details>
    </div>`));
  }
}

/** Jejak langkah agent: tiap pemanggilan tool dan hasilnya. */
function loopBlock(l, r) {
  const icon = { tool: "▸", finish: "✓", message: "💬", limit: "⏹", error: "✗" };
  const color = { finish: "var(--ok)", error: "var(--bad)", limit: "var(--warn)" };
  return `
    <div class="row mt" style="gap:12px">
      <span class="pill">${l.steps.length} langkah</span>
      <span class="pill">${l.checks} kali run_check</span>
      <span class="pill">${l.finished ? '<span style="color:var(--ok)">selesai</span>' : '<span style="color:var(--warn)">' + esc(l.reason) + "</span>"}</span>
      <span class="gen">${l.promptTokens}+${l.completionTokens} token · ${(l.durationMs / 1000).toFixed(0)}s</span>
      <span class="gen">tool: ${r.tools?.join(", ") ?? "-"}</span>
    </div>
    <div class="mt" style="border:1px solid var(--line);border-radius:8px;overflow:hidden">
      ${l.steps.map((s) => `
        <div style="display:flex;gap:10px;padding:7px 11px;border-bottom:1px solid var(--line);font-size:12px">
          <span class="mono" style="color:var(--faint);min-width:22px">${s.step}</span>
          <span style="color:${color[s.kind] ?? "var(--accent)"};min-width:14px">${icon[s.kind] ?? "·"}</span>
          <div style="min-width:0;flex:1">
            <span class="mono"><b>${esc(s.tool ?? s.kind)}</b>${s.args ? `<span style="color:var(--faint)">(${esc(s.args.slice(0, 90))}${s.args.length > 90 ? "…" : ""})</span>` : ""}</span>
            ${s.result ? `<div class="gen mono" style="white-space:pre-wrap;margin-top:2px">${esc(s.result.split("\n").slice(0, 4).join("\n").slice(0, 320))}</div>` : ""}
            ${s.text ? `<div class="gen" style="margin-top:2px">${esc(s.text.slice(0, 220))}</div>` : ""}
          </div>
        </div>`).join("")}
    </div>`;
}

/** Hasil build sandbox: status, skor, dan tampilan halaman yang sungguh dirender. */
function buildBlock(b) {
  const ok = (v) => v ? '<span style="color:var(--ok)">✓</span>' : '<span style="color:var(--bad)">✗</span>';
  const gate = b.rendersOk;
  return `
    <div class="row mt" style="gap:14px">
      <span class="pill">${ok(b.typecheckOk)} typecheck</span>
      <span class="pill">${ok(b.buildOk)} build</span>
      <span class="pill">${ok(b.rendersOk)} render</span>
      <span class="pill">${b.gated ? "kena gerbang" : `skor ${b.score}/${b.scoreMax}`}</span>
      <span class="gen">${(b.files ?? []).length} berkas · ${((b.durationMs ?? 0) / 1000).toFixed(1)}s di sandbox</span>
    </div>
    ${gate && b.shot ? `
      <div class="row mt" style="align-items:flex-start;gap:14px">
        <div style="flex:3;min-width:280px">
          <div class="gen">desktop 1280px</div>
          <img src="${b.shot}" style="width:100%;border:1px solid var(--line);border-radius:8px;margin-top:4px" />
        </div>
        <div style="flex:1;min-width:130px">
          <div class="gen">ponsel 390px</div>
          ${b.shotMobile ? `<img src="${b.shotMobile}" style="width:100%;border:1px solid var(--line);border-radius:8px;margin-top:4px" />` : ""}
        </div>
      </div>` : `
      <div class="note bad mt">Halaman tidak berhasil dirender.
        ${(b.consoleErrors ?? []).length ? `${b.consoleErrors.length} galat konsol. ` : ""}
        <pre class="mono" style="margin-top:8px;white-space:pre-wrap;font-size:11px">${esc(b.buildLog)}</pre></div>`}
    ${b.lines?.length ? `<table class="mt"><tbody>${b.lines.map((l) => `<tr>
      <td>${esc(l.key)}</td>
      <td style="width:110px"><div class="bar"><i style="width:${Math.round((l.points / l.max) * 100)}%"></i></div></td>
      <td class="num">${l.points}/${l.max}</td>
      <td class="gen">${esc(l.detail)}</td></tr>`).join("")}</tbody></table>` : ""}`;
}

// --- silsilah ---
function renderTree() {
  const box = $("#tree"); box.innerHTML = "";
  const n = needChain(); if (n) { box.append(n); return; }
  if (!state.agents.length) { box.append(el('<div class="empty">belum ada agent</div>')); return; }

  const byGen = {};
  state.agents.forEach((a) => (byGen[a.generation] ??= []).push(a));
  const gens = Object.keys(byGen).map(Number).sort();
  const W = 940, GAP_Y = 130, R = 26;
  const pos = {};
  gens.forEach((g, gi) => byGen[g].forEach((a, i) => {
    pos[a.id] = { x: ((i + 1) * W) / (byGen[g].length + 1), y: 50 + gi * GAP_Y, a };
  }));
  const H = 50 + (gens.length - 1) * GAP_Y + 70;

  const edges = state.agents.filter((a) => a.parents[0]).flatMap((a) =>
    a.parents.map((p) => ({ from: pos[p], to: pos[a.id] })).filter((e) => e.from && e.to));

  box.append(el(`<div class="card"><svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto">
    ${edges.map((e) => `<path d="M${e.from.x} ${e.from.y + R} C ${e.from.x} ${e.from.y + 70}, ${e.to.x} ${e.to.y - 70}, ${e.to.x} ${e.to.y - R}"
      fill="none" stroke="var(--line)" stroke-width="2" />`).join("")}
    ${Object.values(pos).map(({ x, y, a }) => `
      <g>
        <circle cx="${x}" cy="${y}" r="${R}" fill="var(--panel-2)" stroke="${GEN_COLOR[a.generation % 4]}" stroke-width="2" />
        <text x="${x}" y="${y + 5}" text-anchor="middle" fill="var(--text)" font-size="14" font-weight="600">#${a.id}</text>
        <text x="${x}" y="${y + R + 18}" text-anchor="middle" fill="var(--dim)" font-size="11">${esc(a.name)}</text>
      </g>`).join("")}
  </svg></div>`));
}

// --- arena ---
async function renderArena() {
  const box = $("#arena"); box.innerHTML = "";
  const d = await api("/api/arena");
  if (d.empty) {
    box.append(el(`<div class="note"><b>Belum ada hasil arena.</b>
      Jalankan <code>MOCK_LLM=0 RUNS=3 bun run arena</code> di terminal, lalu buka tab ini lagi.
      Satu ronde tiga agent memakan waktu sekitar 20 menit karena antre kuota model gratis.</div>`));
    return;
  }

  const finished = d.agents.filter((a) => a.runs.some((r) => !r.gated));
  const best = Math.max(...finished.map((a) => a.median), 0);
  const winner = finished.find((a) => a.median === best);
  const child = d.agents.find((a) => a.label.toLowerCase().includes("anak"));
  const parents = d.agents.filter((a) => a !== child);
  const childBeatsBoth = child && parents.every((p) => child.median > p.median);

  box.append(el(`<div class="card">
    <h3>Ronde ${new Date(d.ranAt).toLocaleString("id-ID")}</h3>
    <dl class="kv">
      <dt>penyedia</dt><dd>${esc(d.provider)} · ${d.runsPerAgent} run per agent · median</dd>
      <dt>rubricHash</dt><dd class="mono">${d.rubricHash.slice(0, 26)}…</dd>
    </dl></div>`));

  const t = el(`<div class="card mt"><table>
    <thead><tr><th>agent</th><th>modul</th><th class="num">deterministik</th><th class="num">judge</th><th class="num">median</th></tr></thead>
    <tbody>${d.agents.map((a) => {
      const done = a.runs.filter((r) => !r.gated);
      const det = done.length ? (done.reduce((s, r) => s + r.deterministic, 0) / done.length).toFixed(1) : "—";
      const jg = done.length && done[0].judge ? (done.reduce((s, r) => s + (r.judge?.total ?? 0), 0) / done.length).toFixed(1) : "—";
      const gatedN = a.runs.length - done.length;
      return `<tr class="${a.median === best ? "total" : ""}">
        <td>${esc(a.label)}${a.median === best ? ' <span style="color:var(--accent)">← tertinggi</span>' : ""}
          ${gatedN ? `<div class="gen">${gatedN} dari ${a.runs.length} run kena gerbang</div>` : ""}</td>
        <td><div class="traits">${a.modules.slice(0, 4).map((m) => `<span class="trait">${esc(m)}</span>`).join("")}</div></td>
        <td class="num">${det}/70</td><td class="num">${jg}/30</td>
        <td class="num"><b>${a.median}</b></td></tr>`;
    }).join("")}</tbody></table></div>`);
  box.append(t);

  box.append(el(childBeatsBoth
    ? `<div class="note"><b>Anak mengungguli kedua induknya.</b> Inilah hybrid vigor yang bisa diukur.</div>`
    : `<div class="note bad"><b>Anak belum mengungguli kedua induknya.</b>
        ${winner ? `Tertinggi masih ${esc(winner.label)} (${winner.median}).` : ""}
        Ini hasil apa adanya, bukan kegagalan sistem — lihat PLAN.md §22.2a.</div>`));

  for (const a of d.agents) {
    const r = a.runs.find((x) => !x.gated);
    if (!r) continue;
    box.append(el(`<div class="card mt"><h3>${esc(a.label)} <span class="gen">rincian run ${r.run} · ${esc(r.model)}</span></h3>
      <table class="mt"><tbody>${r.lines.map((l) => `<tr>
        <td>${esc(l.key)}</td>
        <td style="width:120px"><div class="bar"><i style="width:${Math.round((l.points / l.max) * 100)}%"></i></div></td>
        <td class="num">${l.points}/${l.max}</td>
        <td class="gen">${esc(l.detail)}</td></tr>`).join("")}
        ${r.judge ? `<tr><td>judge</td><td><div class="bar"><i style="width:${Math.round((r.judge.total / 30) * 100)}%"></i></div></td>
          <td class="num">${r.judge.total}/30</td><td class="gen">${esc(r.judge.alasan)}</td></tr>` : ""}
      </tbody></table></div>`));
  }
}

// Mendukung tautan langsung seperti /#arena
const initial = location.hash.slice(1);
if (initial) {
  const b = document.querySelector(`nav button[data-tab="${initial}"]`);
  if (b) b.click();
}

// Dibuka untuk uji end-to-end; tidak dipakai logika halaman.
window.__state = state;

// Wallet yang pernah dihubungkan disambung lagi tanpa jendela izin.
(async () => {
  try {
    if (eth() && localStorage.getItem("wallet")) {
      const [a] = await eth().request({ method: "eth_accounts" });
      if (a) state.wallet = a;
    }
  } catch {}
  await refresh();
  // Di chain publik blok datang tiap 12 detik; menarik lebih sering hanya membebani RPC.
  setInterval(() => refresh(), state.status?.local === false ? 12000 : 4000);
})();
