import { G0_SOLIDITY_SMITH, G1_PIXEL_SENSE } from "../../../packages/shared/src/founders";
import { meiosis } from "../../../packages/shared/src/genome";
import { AgentCard } from "../components/agent";
import { Cell, GenomeStrip, Legend } from "../components/ui";
import { useData } from "../hooks/use-data";
import { geneOrigin } from "../lib/genetics";
import { Link, useTitle } from "../router";

// Anak contoh untuk ilustrasi: selalu sama, dihitung dengan meiosis() yang sama dengan kontrak.
const EXAMPLE_CHILD = meiosis(G0_SOLIDITY_SMITH, G1_PIXEL_SENSE, 0x5eedn);
const EXAMPLE_ORIGIN = geneOrigin(EXAMPLE_CHILD, G0_SOLIDITY_SMITH, G1_PIXEL_SENSE);

export function HomePage() {
  useTitle("");
  const { agents, byId } = useData();
  const a = byId(1), b = byId(2);
  const recent = [...agents].sort((x, y) => y.id - x.id).slice(0, 4);

  return (
    <div className="home">
      <section className="hero">
        <div className="hero-copy">
          <h1>Kawinkan dua agent AI. Anaknya mewarisi keahlian keduanya.</h1>
          <p className="hero-lead">
            Setiap agent di Meiosis punya genome di blockchain yang menentukan keahliannya, gaya kerjanya,
            dan otak yang dipakainya. Kawinkan dua agent, dan anaknya lahir membawa gabungan sifat mereka.
            Siapa pun bisa membuktikan asal-usulnya.
          </p>
          <div className="hero-example">
            <p>
              Misalnya kamu butuh agent yang membuat form React yang aman.
              {" "}<b>{a?.name ?? "Solidity Smith"}</b> jago keamanan tapi tidak paham React.
              {" "}<b>{b?.name ?? "Pixel Sense"}</b> jago React dan tampilan, tapi abai soal keamanan.
              Anak mereka bisa punya keduanya.
            </p>
          </div>
          <div className="row">
            <Link to="/kawin?a=1&b=2" className="btn btn-primary btn-lg">Kawinkan mereka berdua</Link>
            <Link to="/kawin" className="btn btn-lg">Pilih induk sendiri</Link>
          </div>
        </div>

        <div className="fusion" aria-label="Ilustrasi: dua sel menyatu dan melahirkan sel baru">
          <div className="fusion-parents">
            <figure className="fusion-a">
              <Cell genome={a?.genome ?? G0_SOLIDITY_SMITH} size={104} />
              <figcaption>{a?.name ?? "Solidity Smith"}</figcaption>
            </figure>
            <figure className="fusion-b">
              <Cell genome={b?.genome ?? G1_PIXEL_SENSE} size={104} />
              <figcaption>{b?.name ?? "Pixel Sense"}</figcaption>
            </figure>
          </div>
          <svg className="fusion-lines" viewBox="0 0 300 80" preserveAspectRatio="none" aria-hidden>
            <path d="M50 0 C 50 50, 150 30, 150 80" /><path d="M250 0 C 250 50, 150 30, 150 80" />
          </svg>
          <figure className="fusion-child">
            <Cell genome={EXAMPLE_CHILD} size={132} />
            <div className="fusion-strip">
              <GenomeStrip origin={EXAMPLE_ORIGIN} large reveal />
              <Legend a={a?.name ?? "Solidity Smith"} b={b?.name ?? "Pixel Sense"} />
            </div>
          </figure>
        </div>
      </section>

      <section className="how" aria-labelledby="how-title">
        <h2 id="how-title">Cara kerjanya</h2>
        <ol className="how-steps">
          <li>
            <h3>Pilih dua induk</h3>
            <p>Sebelum kawin kamu sudah melihat peluang tiap sifat diwariskan: mana yang pasti turun, mana yang untung-untungan.</p>
          </li>
          <li>
            <h3>Tunggu pembuahan</h3>
            <p>Sekitar satu menit. Hasilnya ditentukan oleh blok yang belum ada saat kamu menekan tombol, jadi tidak ada yang bisa mencuranginya.</p>
          </li>
          <li>
            <h3>Pakai anaknya</h3>
            <p>Unduh sebagai subagent Claude Code (berkas <code>.md</code>) untuk proyekmu, atau beri tugas langsung di sini.</p>
          </li>
        </ol>
      </section>

      {recent.length > 0 && (
        <section className="stack-lg">
          <div className="spread">
            <h2>Agent terbaru</h2>
            <Link to="/koleksi">Lihat semua</Link>
          </div>
          <div className="agent-grid">{recent.map((x) => <AgentCard key={x.id} agent={x} />)}</div>
        </section>
      )}
    </div>
  );
}
