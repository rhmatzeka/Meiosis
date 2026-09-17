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

let state = { status: null, agents: [], pregs: [], sel: [], runSel: [], runBusy: false, runOut: null };

const TASK_CONTOH = [
  ["Komponen form", `Buat komponen React "StakeForm" dengan input jumlah dan tombol Stake.\nBalas dengan kode saja.`],
  ["Landing page", `Buat landing page untuk dApp staking bernama Epoch: hero, cara kerja, tabel APY.\nBalas dengan kode saja.`],
  ["Audit singkat", `Tinjau potongan kode ini dan sebutkan masalahnya:\n\nfunction Balance({ html }) { return <div dangerouslySetInnerHTML={{__html: html}} /> }`],
];

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
async function refresh() {
  state.status = await api("/api/status");
  const live = state.status.chainLive;
  $("#dot-chain").classList.toggle("on", live);
  $("#s-chain").textContent = live ? (state.status.deployed ? "anvil · ter-deploy" : "anvil · belum deploy") : "anvil mati";
  $("#s-block").textContent = live ? `blok ${state.status.block}` : "blok —";

  if (live && state.status.deployed) {
    [state.agents, state.pregs] = await Promise.all([api("/api/agents"), api("/api/pregnancies")]);
  } else {
    state.agents = []; state.pregs = [];
  }
  renderRoster(); renderBreed(); renderTree();
  // tab Jalankan hanya digambar ulang saat idle, agar hasil tidak hilang
  if (!state.runBusy && !state.runOut) renderRun();
}

function needChain() {
  if (!state.status?.chainLive) return el(`<div class="note bad">
    <b>Anvil belum jalan.</b> Buka terminal lain lalu jalankan <code>bun run anvil</code>,
    halaman ini akan menyambung sendiri.</div>`);
  if (!state.status.deployed) {
    const n = el(`<div class="note"><b>Kontrak belum ter-deploy.</b>
      Sekali klik: deploy empat kontrak, mint empat founder ke tiga pemilik berbeda, lalu segel generasi nol.
      <div class="row mt"><button class="act" id="btn-deploy">Deploy &amp; mint generasi nol</button></div></div>`);
    n.querySelector("#btn-deploy").onclick = async (e) => {
      e.target.disabled = true; e.target.textContent = "men-deploy…";
      const r = await post("/api/deploy");
      if (r.error) { e.target.disabled = false; e.target.textContent = "Coba lagi"; alert(r.error); return; }
      await refresh();
    };
    return n;
  }
  return null;
}

// --- roster ---
function agentCard(a, opts = {}) {
  const hi = a.traits.filter((t) => KEY_LOCI.includes(t.name));
  const c = el(`<div class="card${opts.sel ? " sel" : ""}">
    <h3><span style="color:${GEN_COLOR[a.generation % 4]}">●</span> ${esc(a.name)}
      <span class="gen">#${a.id} · gen ${a.generation} · ${esc(a.ownerName)}</span></h3>
    <div class="traits">${hi.map((t) => `<span class="trait hi">${t.name.toLowerCase().replace(/_/g, " ")} <b>${esc(t.value)}</b></span>`).join("")}</div>
    <div class="traits">${a.modules.map((m) => `<span class="trait">${esc(m)}</span>`).join("") || '<span class="trait">tanpa modul</span>'}</div>
    <dl class="kv">
      <dt>genome</dt><dd class="mono">${a.genome.slice(0, 22)}…</dd>
      <dt>tier</dt><dd>${a.modelTier} · temp ${a.params.temperature} · ${a.params.maxTokens} token</dd>
      ${a.parents[0] ? `<dt>induk</dt><dd>#${a.parents[0]} × #${a.parents[1]}</dd>` : ""}
      <dt>manifest</dt><dd class="mono">${a.manifestHashOnChain === "0x0000000000000000"
        ? `<button class="act ghost" style="padding:2px 8px;font-size:11px" data-manifest="${a.id}">catat ke chain</button>`
        : (a.manifestHashOnChain === a.manifestHashComputed
            ? `<span style="color:var(--ok)">✓ cocok</span> ${a.manifestHashOnChain.slice(0, 12)}…`
            : `<span style="color:var(--bad)">✗ beda dari hasil hitung ulang</span>`)}</dd>
    </dl>
  </div>`);
  const mb = c.querySelector("[data-manifest]");
  if (mb) mb.onclick = async (ev) => {
    ev.stopPropagation();
    mb.disabled = true; mb.textContent = "mencatat…";
    const r = await post("/api/manifest", { id: a.id });
    if (r.error) { alert(r.error); mb.disabled = false; mb.textContent = "catat ke chain"; return; }
    await refresh();
  };
  if (opts.onClick) c.onclick = (ev) => { if (ev.target.closest('button')) return; opts.onClick(a); };
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

  const pending = state.pregs.filter((p) => !p.hatched);
  if (pending.length) {
    const list = el('<div class="mt"></div>');
    for (const p of pending) {
      const item = el(`<div class="card mt">
        <h3>Kehamilan #${p.id} <span class="gen">#${p.parentA} × #${p.parentB}</span></h3>
        <dl class="kv">
          <dt>reveal</dt><dd>blok ${p.revealBlock}</dd>
          <dt>status</dt><dd>${p.expired ? '<span style="color:var(--bad)">blockhash kedaluwarsa — perlu reroll</span>'
            : p.ready ? '<span style="color:var(--ok)">siap ditetaskan</span>'
            : `menunggu ${p.blocksLeft} blok lagi`}</dd>
        </dl>
        <div class="row mt">
          <button class="act" ${p.ready ? "" : "disabled"} data-hatch="${p.id}">Tetaskan</button>
          <button class="act ghost" data-mine="1">Majukan 6 blok</button>
        </div></div>`);
      item.querySelector("[data-hatch]").onclick = async (e) => {
        e.target.disabled = true; e.target.textContent = "menetaskan…";
        const r = await post("/api/hatch", { pid: p.id });
        if (r.error) alert(r.error);
        await refresh();
      };
      item.querySelector("[data-mine]").onclick = async () => { await post("/api/mine"); await refresh(); };
      list.append(item);
    }
    box.append(list);
  }

  const picker = el(`<div class="mt"><p class="sub">Pilih dua induk:</p><div class="grid" id="pick"></div></div>`);
  state.agents.forEach((a) => picker.querySelector("#pick").append(
    agentCard(a, {
      sel: state.sel.includes(a.id),
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
    const rel = await api(`/api/relatedness?a=${a.genomeRaw}&b=${b.genomeRaw}`);
    const pct = Math.round((rel.value / 255) * 100);
    const panel = el(`<div class="card mt">
      <h3>${esc(a.name)} × ${esc(b.name)}</h3>
      <dl class="kv">
        <dt>kekerabatan</dt><dd>${rel.value}/255 (${pct}%) ${pct > 60
          ? '<span style="color:var(--warn)">— berkerabat dekat, variasi anak akan rendah</span>' : ""}</dd>
        <dt>masa hamil</dt><dd>5 blok</dd>
      </dl>
      <table class="mt"><thead><tr><th>lokus</th><th>${esc(a.name)}</th><th>${esc(b.name)}</th></tr></thead><tbody>
      ${KEY_LOCI.map((k) => {
        const ta = a.traits.find((t) => t.name === k).value, tb = b.traits.find((t) => t.name === k).value;
        return `<tr><td>${k.toLowerCase().replace(/_/g, " ")}</td><td>${esc(ta)}</td><td>${esc(tb)}</td></tr>`;
      }).join("")}
      </tbody></table>
      <div class="row mt"><button class="act" id="go">Kawinkan</button>
        <span class="gen">dipanggil oleh Alice · di chain lokal semua agent dipasang sebagai pejantan dengan biaya 0</span></div>
    </div>`);
    panel.querySelector("#go").onclick = async (e) => {
      e.target.disabled = true; e.target.textContent = "mengirim…";
      const r = await post("/api/breed", { a: a.id, b: b.id, from: 1 });
      if (r.error) { alert(r.error); e.target.disabled = false; e.target.textContent = "Kawinkan"; return; }
      state.sel = []; await refresh();
    };
    box.append(panel);
  }
}

// --- jalankan ---
function renderRun() {
  const box = $("#run"); box.innerHTML = "";
  const n = needChain(); if (n) { box.append(n); return; }

  const picker = el(`<div><p class="sub">Pilih satu atau lebih agent:</p><div class="grid" id="rpick"></div></div>`);
  state.agents.forEach((a) => picker.querySelector("#rpick").append(
    agentCard(a, {
      sel: state.runSel.includes(a.id),
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
        <input type="checkbox" id="build" checked /> bangun &amp; render hasilnya</label>
      <label class="gen" style="display:flex;gap:6px;align-items:center">
        <input type="checkbox" id="mock" /> mode tiruan (tanpa memakai kuota)</label>
      <span class="gen">${state.runBusy ? "generasi 30–60 detik, build di sandbox ~10 detik lagi" : ""}</span>
    </div>
  </div>`);

  panel.querySelectorAll("[data-eg]").forEach((b) => b.onclick = () => {
    panel.querySelector("#task").value = TASK_CONTOH[Number(b.dataset.eg)][1];
  });
  panel.querySelector("#go-run").onclick = async () => {
    const task = panel.querySelector("#task").value.trim();
    if (!task) { alert("tugasnya masih kosong"); return; }
    state.runBusy = true; state.runOut = null; renderRun();
    const r = await post("/api/run", {
      ids: state.runSel, task,
      mock: panel.querySelector("#mock")?.checked,
      build: panel.querySelector("#build")?.checked,
    });
    state.runBusy = false;
    state.runOut = r.error ? { error: r.error } : r;
    renderRun();
  };
  box.append(panel);

  if (!state.runOut) return;
  if (state.runOut.error) { box.append(el(`<div class="note bad">${esc(state.runOut.error)}</div>`)); return; }

  for (const r of state.runOut.results) {
    const a = state.agents.find((x) => x.id === r.id);
    if (!r.ok) { box.append(el(`<div class="note bad"><b>#${r.id}</b> gagal: ${esc(r.error)}</div>`)); continue; }
    box.append(el(`<div class="card mt">
      <h3>${esc(a?.name ?? "#" + r.id)} <span class="gen">${esc(r.model)} · ${r.promptTokens}+${r.completionTokens} token · ${(r.durationMs / 1000).toFixed(1)}s${r.mocked ? " · TIRUAN" : ""}</span></h3>
      <div class="traits">${r.modules.map((m) => `<span class="trait">${esc(m)}</span>`).join("")}</div>
      <dl class="kv">
        <dt>manifest</dt><dd class="mono">${esc(r.manifestHash)}</dd>
        <dt>tool</dt><dd>${r.toolsDeclared.length
          ? `genome memberi <b>${r.toolsDeclared.join(", ")}</b>, runtime menyediakan <b>${r.toolsAvailable.length ? r.toolsAvailable.join(", ") : "belum ada"}</b>`
          : "tidak ada"}</dd>
      </dl>
      ${r.built ? buildBlock(r.built) : ""}
      <details ${r.built ? "" : "open"} class="mt">
        <summary class="gen" style="cursor:pointer">keluaran mentah agent</summary>
        <pre style="background:var(--panel-2);border:1px solid var(--line);border-radius:8px;padding:12px;
          overflow:auto;max-height:420px;font-size:12px;line-height:1.5"><code>${esc(r.output)}</code></pre>
      </details>
    </div>`));
  }
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
      <span class="gen">${b.files.length} berkas · ${(b.durationMs / 1000).toFixed(1)}s di sandbox</span>
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
        ${b.consoleErrors.length ? `${b.consoleErrors.length} galat konsol. ` : ""}
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

refresh();
setInterval(refresh, 4000);
