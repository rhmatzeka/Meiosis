/**
 * Halaman depan: menjelaskan Meiosis kepada orang yang belum pernah mendengar
 * soal agent AI maupun blockchain, lalu mengarahkan ke tiga pintu: Studio,
 * Kawinkan, dan Pasar. Susunannya mengikuti referensi yang diberikan pemilik
 * proyek; isinya selalu data sungguhan dari chain — tanpa testimoni karangan.
 */
import { useMemo, useRef, useState, type ReactNode } from "react";
import { G0_SOLIDITY_SMITH, G1_PIXEL_SENSE } from "../../../packages/shared/src/founders";
import { LOCUS, meiosis } from "../../../packages/shared/src/genome";
import type { Agent } from "../api";
import { AgentCard, highlights } from "../components/agent";
import { Cell, GenomeStrip, Legend } from "../components/ui";
import { useData } from "../hooks/use-data";
import { geneOrigin, inheritanceOdds } from "../lib/genetics";
import { LOCI, traitLabel } from "../lib/traits";
import { MOTION_OK, ScrollTrigger, gsap, splitWords, useGSAP } from "../motion";
import { Link, useTitle } from "../router";

const EXAMPLE_CHILD = meiosis(G0_SOLIDITY_SMITH, G1_PIXEL_SENSE, 0x5eedn);
const EXAMPLE_ORIGIN = geneOrigin(EXAMPLE_CHILD, G0_SOLIDITY_SMITH, G1_PIXEL_SENSE);
const EXAMPLE_ODDS = inheritanceOdds(G0_SOLIDITY_SMITH, G1_PIXEL_SENSE);
const ODDS_LOCI: number[] = [LOCUS.SECURITY_INSTINCT, LOCUS.STACK_AFFINITY, LOCUS.AESTHETIC, LOCUS.TEST_RIGOR];

const BUILT_ON = ["Ethereum", "Privy", "Claude", "Foundry", "OpenZeppelin", "Bun", "viem", "React"];

export function HomePage() {
  useTitle("");
  const { agents, status } = useData();
  const root = useRef<HTMLDivElement>(null);
  const living = agents.length;
  const newest = useMemo(() => [...agents].sort((x, y) => y.id - x.id), [agents]);

  useGSAP(() => {
    const mm = gsap.matchMedia();
    mm.add(MOTION_OK, () => {
      // Satu momen pembuka: label, judul per kata, lalu ajakan.
      const tl = gsap.timeline({ defaults: { ease: "expo.out" } });
      tl.from(".hero-pill", { y: 12, opacity: 0, duration: 0.7 });
      const title = root.current?.querySelector(".hero h1");
      if (title) tl.add(() => { splitWords(title); }, 0.1);
      tl.from(".hero-lead, .hero-cta", { y: 18, opacity: 0, duration: 0.9, stagger: 0.1 }, 0.45);

      // Deretan teknologi berjalan terus.
      gsap.to(".marquee-track", { xPercent: -50, duration: 28, ease: "none", repeat: -1 });

      // Batang peluang tumbuh saat terlihat.
      gsap.from(".bento-odds .track b", {
        width: 0, duration: 1.2, ease: "power3.out", stagger: 0.08,
        scrollTrigger: { trigger: ".bento-odds", start: "top 80%" },
      });

      // Angka besar dihitung naik.
      root.current?.querySelectorAll<HTMLElement>("[data-count]").forEach((el) => {
        const end = Number(el.dataset.count);
        const obj = { v: 0 };
        gsap.to(obj, {
          v: end, duration: 1.6, ease: "power2.out",
          scrollTrigger: { trigger: el, start: "top 85%" },
          onUpdate: () => { el.textContent = Math.round(obj.v).toLocaleString("id-ID"); },
        });
      });

      // Angka raksasa di kartu langkah naik lebih lambat dari kartunya.
      gsap.utils.toArray<HTMLElement>(".step-num").forEach((n) => {
        gsap.fromTo(n, { yPercent: 30 }, {
          yPercent: -10, ease: "none",
          scrollTrigger: { trigger: n.closest(".step-card"), start: "top bottom", end: "bottom top", scrub: 1 },
        });
      });

      // Mockup pasar sedikit condong lalu tegak saat digulir.
      gsap.fromTo(".showcase-frame", { rotateX: 14, y: 40, opacity: 0.4 }, {
        rotateX: 0, y: 0, opacity: 1, ease: "none",
        scrollTrigger: { trigger: ".showcase", start: "top 85%", end: "center 60%", scrub: 1 },
      });
    });
    return () => mm.revert();
  }, { scope: root });

  // Layout berubah setelah data agent datang; ScrollTrigger perlu tahu.
  useGSAP(() => { ScrollTrigger.refresh(); }, { dependencies: [living] });

  return (
    <div className="landing" ref={root}>
      {/* ---------------------------------------------------------------- hero */}
      <section className="hero">
        <span className="hero-pill"><i />Pasar agent AI yang bisa dibiakkan</span>
        <h1>Agent AI yang lebih pintar, lahir dari perkawinan</h1>
        <p className="hero-lead">
          Rancang agent-mu sendiri, kawinkan dua agent supaya anaknya mewarisi keahlian keduanya, lalu jual atau
          sewakan. Asal-usul setiap agent tercatat di blockchain.
        </p>
        <div className="hero-cta">
          <Link to="/studio" className="btn btn-primary btn-lg">Buat agent-mu <span className="arrow"><Arrow /></span></Link>
          <div className="hero-proof">
            <div className="cell-stack">
              {newest.slice(0, 4).map((a) => <Cell key={a.id} genome={a.genome} size={34} alive={false} />)}
            </div>
            <div>
              <b>{living} agent</b>
              <small>hidup di {status?.local ? "chain lokal" : "Sepolia"}</small>
            </div>
          </div>
        </div>
      </section>

      <div className="marquee" aria-label="Dibangun di atas">
        <div className="marquee-track">
          {[...BUILT_ON, ...BUILT_ON].map((n, i) => <span key={i}>{n}</span>)}
        </div>
      </div>

      {/* ---------------------------------------------------------------- bento */}
      <section className="block">
        <div className="block-head" data-reveal>
          <h2>Pilih induk yang tepat, dapatkan agent yang kamu butuhkan</h2>
          <p>Setiap agent membawa genome yang menentukan keahlian, kebiasaan kerja, dan otaknya. Kawinkan dua agent, dan kamu sudah tahu peluang sifat anaknya sebelum menekan tombol.</p>
        </div>
        <div className="bento">
          <article className="bento-card bento-odds" data-reveal>
            <h3>Peluang sebelum kawin</h3>
            <p>Solidity Smith × Pixel Sense: mana sifat yang pasti turun.</p>
            <div className="bento-panel odds">
              {LOCI.filter((l) => ODDS_LOCI.includes(l.index)).map((l) => {
                const top = EXAMPLE_ODDS[l.index].odds[0];
                return (
                  <div className="odds-row" key={l.index}>
                    <span>{l.icon} {l.label} <b>{traitLabel(l.index, top.trait)}</b></span>
                    <div className="track"><b style={{ width: `${top.p * 100}%` }} /></div>
                    <span className="v">{top.p === 1 ? "pasti" : `${Math.round(top.p * 100)}%`}</span>
                  </div>
                );
              })}
            </div>
          </article>
          <article className="bento-card bento-birth" data-reveal>
            <h3>Anak lahir, asal-usulnya terlihat</h3>
            <p>Setiap garis menunjukkan dari induk mana sifat itu datang.</p>
            <div className="bento-panel birth">
              <Cell genome={EXAMPLE_CHILD} size={96} />
              <GenomeStrip origin={EXAMPLE_ORIGIN} large />
              <Legend a="Solidity Smith" b="Pixel Sense" />
            </div>
          </article>
          <article className="bento-card bento-number" data-reveal>
            <span className="chip chip-accent">Royalti on-chain</span>
            <div className="big-number"><span data-count={4}>4</span></div>
            <p>generasi leluhur ikut dibayar setiap kali keturunannya dijual, disewa, atau dikawinkan.</p>
          </article>
        </div>
      </section>

      {/* ---------------------------------------------------------------- langkah */}
      <section className="block">
        <div className="block-head" data-reveal>
          <h2>Dari nol sampai dipakai, tiga langkah</h2>
          <p>Tidak perlu paham blockchain. Masuk dengan Google, dan kami kirim sedikit ETH uji coba untuk biaya jaringan.</p>
        </div>
        <div className="steps">
          {[
            { n: 1, t: "Buat atau pilih agent", d: "Rancang di Studio dalam semenit, atau pilih agent yang sudah ada di Pasar.", i: <IconSpark /> },
            { n: 2, t: "Kawinkan", d: "Gabungkan dua agent. Sekitar semenit kemudian anaknya lahir, membawa sifat keduanya.", i: <IconHelix /> },
            { n: 3, t: "Pakai, jual, sewakan", d: "Beri tugas di web, bawa ke Claude Code, atau pasang harga dan dapat penghasilan.", i: <IconCoin /> },
          ].map((s) => (
            <article className="step-card" key={s.n} data-reveal>
              <span className="step-icon">{s.i}</span>
              <span className="step-num" aria-hidden>{s.n}</span>
              <div className="step-text"><h3>{s.t}</h3><p>{s.d}</p></div>
            </article>
          ))}
        </div>
      </section>

      {/* ---------------------------------------------------------------- fitur */}
      <section className="block">
        <div className="block-head" data-reveal>
          <h2>Dibangun supaya bisa dipercaya</h2>
          <p>Semua aturan penting berjalan di kontrak, bukan di server kami.</p>
        </div>
        <div className="features">
          {[
            { t: "Genome on-chain", d: "DNA setiap agent tersimpan permanen dan tidak bisa diubah siapa pun.", i: <IconHelix /> },
            { t: "Studio", d: "Rancang agent generasi nol dengan aturan yang dipaksakan kontrak.", i: <IconSpark /> },
            { t: "Royalti leluhur", d: "5% ke induk, 2,5% ke kakek-nenek, sampai empat generasi.", i: <IconTree /> },
            { t: "Sewa per tugas", d: "Pakai agent orang lain, bayar sekali untuk satu tugas.", i: <IconCoin /> },
            { t: "Claude Code", d: "Jadikan agent rekan kerja Claude di proyekmu sendiri.", i: <IconTerminal /> },
            { t: "Bukti keaslian", d: "Hash manifest dicatat on-chain; siapa pun bisa mencocokkannya.", i: <IconShield /> },
          ].map((f) => (
            <article className="feature" key={f.t} data-reveal>
              <span className="feature-icon">{f.i}</span>
              <h3>{f.t}</h3>
              <p>{f.d}</p>
            </article>
          ))}
        </div>
      </section>

      {/* ---------------------------------------------------------------- showcase */}
      <section className="showcase">
        <div className="showcase-head" data-reveal>
          <h2>Semua agent, satu pasar</h2>
          <p>Cari agent yang bisa dibeli, disewa untuk satu tugas, atau dijadikan induk. Harga tertera di setiap kartu.</p>
        </div>
        <div className="showcase-stage">
          <div className="showcase-frame">
            <div className="frame-bar"><i /><i /><i /><span>meiosis · pasar</span></div>
            <div className="frame-body">
              {newest.length
                ? <div className="agent-grid">{newest.slice(0, 6).map((a) => <AgentCard key={a.id} agent={a} showPrices />)}</div>
                : <div className="skeleton" style={{ height: 260 }} />}
            </div>
          </div>
        </div>
        <div className="showcase-cta"><Link to="/pasar" className="btn btn-light btn-lg">Buka Pasar <span className="arrow"><Arrow /></span></Link></div>
      </section>

      <Pricing studioFee={status?.market?.studioFeeEth ?? "0.002"} feePct={(status?.market?.feeBps ?? 250) / 100} />

      {newest.length > 0 && <AgentCarousel agents={newest.slice(0, 8)} />}

      {/* ---------------------------------------------------------------- panduan */}
      <section className="block">
        <div className="block-head" data-reveal>
          <h2>Baru pertama kali? Mulai dari sini</h2>
          <p>Panduan singkat dalam bahasa sehari-hari.</p>
        </div>
        <div className="guides">
          {[
            { to: "/panduan#studio", t: "Membuat agent pertamamu di Studio", d: "Ceritakan dengan kata-katamu, biarkan AI merancang, lalu sunting sesukamu.", g: G0_SOLIDITY_SMITH },
            { to: "/panduan#jual", t: "Menjual dan menyewakan agent", d: "Pasang harga, beri izin sekali, dan tarik penghasilanmu di Dompet.", g: G1_PIXEL_SENSE },
            { to: "/panduan#claude", t: "Memakai agent di Claude Code", d: "Jadikan agent Meiosis rekan kerja Claude di proyekmu sendiri.", g: EXAMPLE_CHILD },
          ].map((c) => (
            <Link to={c.to} className="guide-card" key={c.to} data-reveal>
              <div className="guide-art"><Cell genome={c.g} size={110} /></div>
              <h3>{c.t}</h3>
              <p>{c.d}</p>
              <span className="btn btn-primary btn-sm">Baca</span>
            </Link>
          ))}
        </div>
      </section>

      {/* ---------------------------------------------------------------- faq */}
      <section className="block faq-block">
        <div className="block-head" data-reveal>
          <h2>Pertanyaan yang paling sering muncul</h2>
          <p>Belum terjawab? Semua ada di <Link to="/panduan">Panduan</Link>.</p>
        </div>
        <Faq />
      </section>
    </div>
  );
}

// -------------------------------------------------------------------------- biaya

function Pricing({ studioFee, feePct }: { studioFee: string; feePct: number }) {
  const [side, setSide] = useState<"pembuat" | "pemakai">("pembuat");
  const cards = side === "pembuat" ? [
    { t: "Studio", s: "Rancang agent baru", p: `${studioFee} ETH`, u: "sekali", l: ["Tulis bebas atau dirancang AI", "Langsung jadi milikmu", "Bisa dijual, disewa, dikawinkan"], to: "/studio", cta: "Buka Studio" },
    { t: "Jual", s: "Pasang harga agent-mu", p: `${feePct}%`, u: "per penjualan", l: ["Agent tetap di tanganmu sampai laku", "Sisanya untukmu dan leluhurnya", "Batal jual kapan saja"], to: "/pasar?tab=milikku", cta: "Jual agent", hot: true },
    { t: "Sewakan", s: "Harga per tugas pilihanmu", p: `${feePct}%`, u: "per tugas", l: ["Orang bayar sekali per tugas", "Penghasilan masuk ke Dompet", "Keturunannya ikut membayarmu"], to: "/pasar?tab=milikku", cta: "Pasang harga" },
  ] : [
    { t: "Kawinkan", s: "Jadikan agent orang sebagai induk", p: "Tarif pemilik", u: "sering gratis", l: ["Lihat peluang sifat dulu", "Anaknya jadi milikmu", "Menetas otomatis"], to: "/kawin", cta: "Kawinkan" },
    { t: "Sewa per tugas", s: "Pakai agent tanpa membelinya", p: "Harga pemilik", u: "per tugas", l: ["Tulis tugas, bayar, selesai", "Hasil muncul di halaman", "Tanpa langganan"], to: "/pasar?tab=sewa", cta: "Cari agent", hot: true },
    { t: "Beli", s: "Miliki agent selamanya", p: "Harga penjual", u: "sekali", l: ["Agent pindah ke Dompet-mu", "Bisa kamu jual lagi", "Unduh .md lengkap"], to: "/pasar?tab=dijual", cta: "Lihat yang dijual" },
  ];
  return (
    <section className="block pricing-block">
      <div className="block-head centered" data-reveal>
        <h2>Biaya yang jelas, tanpa langganan</h2>
        <p>Platform mengambil {feePct}% dari penjualan dan sewa untuk biaya server dan model AI. Sisanya untuk pemilik agent dan leluhurnya.</p>
        <div className="segmented" role="tablist">
          <button role="tab" aria-selected={side === "pembuat"} onClick={() => setSide("pembuat")}>Untuk pembuat</button>
          <button role="tab" aria-selected={side === "pemakai"} onClick={() => setSide("pemakai")}>Untuk pemakai</button>
        </div>
      </div>
      <div className="pricing">
        {cards.map((c) => (
          <article key={c.t} className={`price-card ${c.hot ? "hot" : ""}`}>
            <span className="price-card-icon"><IconSpark /></span>
            <h3>{c.t}</h3>
            <small>{c.s}</small>
            <div className="price-card-price"><b>{c.p}</b><span>{c.u}</span></div>
            <Link to={c.to} className={`btn ${c.hot ? "btn-light" : "btn-outline"}`}>{c.cta}</Link>
            <ul>{c.l.map((x) => <li key={x}>{x}</li>)}</ul>
          </article>
        ))}
      </div>
    </section>
  );
}

// -------------------------------------------------------------------------- agent

/** Kalimat perkenalan dari sifat agent itu sendiri — bukan testimoni karangan. */
function intro(a: Agent) {
  const t = Object.fromEntries(a.traits.map((x) => [x.locus, x.value]));
  const disc = { code: "menulis kode", design: "merancang tampilan", research: "meriset", security: "memburu celah keamanan", data: "mengolah data" }[t[1] as string] ?? "mengerjakan apa saja";
  const stack = { react: " dengan React", solidity: " dengan Solidity", python: " dengan Python" }[t[3] as string] ?? "";
  const extras = [
    t[6] === "high" && "curiga pada setiap masukan",
    t[5] === "high" && "tidak menyebut selesai sebelum tesnya lulus",
    t[4] === "high" && "peduli pada setiap piksel",
    t[14] === "high" && "tidak berhenti di percobaan pertama",
  ].filter(Boolean) as string[];
  return `Aku ${disc}${stack}${extras.length ? `, ${extras.slice(0, 2).join(", dan ")}` : ""}.`;
}

function AgentCarousel({ agents }: { agents: Agent[] }) {
  const [i, setI] = useState(0);
  const ref = useRef<HTMLElement>(null);
  const a = agents[i % agents.length];
  const { contextSafe } = useGSAP({ scope: ref });
  const go = contextSafe((next: number) => {
    const n = (next + agents.length) % agents.length;
    if (!window.matchMedia(MOTION_OK).matches) { setI(n); return; }
    gsap.to(".quote", { opacity: 0, y: -10, duration: 0.2, onComplete: () => {
      setI(n);
      gsap.fromTo(".quote", { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.5, ease: "power3.out" });
    } });
  });
  return (
    <section className="block carousel" ref={ref}>
      <div className="block-head centered" data-reveal><h2>Kenalan dengan penghuni Pasar</h2></div>
      <div className="quote" aria-live="polite">
        <p>“{intro(a)}”</p>
        <b>{a.name}</b>
        <small>#{a.id} · {a.designed ? "rancangan Studio" : a.generation === 0 ? "founder" : `generasi ${a.generation}`} · {highlights(a, 3).map((h) => h.text).join(", ")}</small>
      </div>
      <div className="carousel-row">
        <button className="carousel-arrow" aria-label="Sebelumnya" onClick={() => go(i - 1)}>‹</button>
        {agents.map((x, k) => (
          <button key={x.id} className={`carousel-cell ${k === i % agents.length ? "on" : ""}`} onClick={() => go(k)} aria-label={x.name}>
            <Cell genome={x.genome} size={52} alive={false} />
          </button>
        ))}
        <button className="carousel-arrow" aria-label="Berikutnya" onClick={() => go(i + 1)}>›</button>
      </div>
      <div className="center-row"><Link to={`/agent/${a.id}`} className="btn btn-outline btn-sm">Lihat {a.name}</Link></div>
    </section>
  );
}

// -------------------------------------------------------------------------- faq

const FAQ: [string, string][] = [
  ["Apakah aku perlu wallet crypto?", "Tidak. Masuk dengan Google atau email, dan wallet dibuatkan otomatis. Untuk transaksi pertama kami mengirim sedikit ETH uji coba untuk biaya jaringan."],
  ["Apakah ini uang sungguhan?", "Belum. Meiosis berjalan di Sepolia, jaringan uji Ethereum. ETH-nya gratis dan tidak bisa dijual, jadi aman untuk mencoba."],
  ["Apa bedanya agent Studio dan hasil kawin?", "Agent Studio kamu tulis dan atur sendiri dengan bebas. Agent hasil kawin mewarisi campuran sifat dan instruksi dari dua induknya, jadi bisa menggabungkan keunggulan dua agent yang berbeda."],
  ["Bagaimana aku dapat penghasilan?", "Dari penjualan, sewa per tugas, tarif kawin, dan bagian leluhur setiap kali keturunan agent-mu dipakai. Semuanya terkumpul di Dompet."],
  ["Bisakah agent-ku dipakai di Claude Code?", "Bisa. Buka halaman agent dan ikuti langkah di bagian Claude Code pada Panduan."],
];

function Faq() {
  const [open, setOpen] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const { contextSafe } = useGSAP({ scope: ref });
  const toggle = contextSafe((k: number) => {
    const opening = open !== k;
    setOpen(opening ? k : -1);
    const body = ref.current?.querySelectorAll<HTMLElement>(".faq-a")[k];
    if (body && opening && window.matchMedia(MOTION_OK).matches) {
      gsap.fromTo(body, { height: 0, opacity: 0 }, { height: "auto", opacity: 1, duration: 0.45, ease: "power3.out" });
    }
  });
  return (
    <div className="faq-card" ref={ref} data-reveal>
      {FAQ.map(([q, a], k) => (
        <div className={`faq-item ${open === k ? "open" : ""}`} key={q}>
          <button onClick={() => toggle(k)} aria-expanded={open === k}>{q}<span aria-hidden>{open === k ? "−" : "+"}</span></button>
          <div className="faq-a" hidden={open !== k}><p>{a}</p></div>
        </div>
      ))}
      <div className="faq-foot">
        <span>Pertanyaanmu belum ada?</span>
        <Link to="/panduan" className="btn btn-light btn-sm">Buka Panduan</Link>
      </div>
    </div>
  );
}

// -------------------------------------------------------------------------- ikon

const Arrow = () => <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M2 6h8M6.5 2.5 10 6l-3.5 3.5" /></svg>;
const Svg = ({ children }: { children: ReactNode }) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">{children}</svg>;
const IconSpark = () => <Svg><path d="M12 3l2.2 5.6L20 11l-5.8 2.3L12 19l-2.2-5.7L4 11l5.8-2.4z" /></Svg>;
const IconHelix = () => <Svg><path d="M7 3c0 6 10 6 10 12s-10 3-10 6M17 3c0 6-10 6-10 12s10 3 10 6M8.5 7h7M8.5 17h7" /></Svg>;
const IconCoin = () => <Svg><circle cx="12" cy="12" r="8" /><path d="M14.5 9.5c-.5-1-1.5-1.5-2.5-1.5-1.4 0-2.5.8-2.5 2s1.1 1.6 2.5 2 2.5.9 2.5 2-1.1 2-2.5 2c-1 0-2-.5-2.5-1.5M12 6.5v1.5M12 16v1.5" /></Svg>;
const IconTree = () => <Svg><circle cx="6" cy="5" r="2.2" /><circle cx="18" cy="5" r="2.2" /><circle cx="12" cy="19" r="2.2" /><path d="M6 7.2c0 5 6 4 6 9.6M18 7.2c0 5-6 4-6 9.6" /></Svg>;
const IconTerminal = () => <Svg><rect x="3" y="4.5" width="18" height="15" rx="2.5" /><path d="m7 10 3 2.5L7 15M12.5 15.5H17" /></Svg>;
const IconShield = () => <Svg><path d="M12 3l7 3v5.5c0 4.2-3 7.7-7 9.5-4-1.8-7-5.3-7-9.5V6z" /><path d="m9 12 2.2 2.2L15.5 10" /></Svg>;
