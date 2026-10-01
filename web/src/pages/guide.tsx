/**
 * Panduan untuk orang yang belum pernah memakai blockchain maupun agent AI.
 * Setiap bagian menjawab satu pertanyaan, dengan satu tombol untuk langsung mencobanya.
 */
import type { ReactNode } from "react";
import { useData } from "../hooks/use-data";
import { Link, useTitle } from "../router";

export function GuidePage() {
  useTitle("Panduan");
  const { status } = useData();
  const studioFee = status?.market?.studioFeeEth ?? "0.002";
  const feePct = (status?.market?.feeBps ?? 250) / 100;

  return (
    <div className="guide">
      <div className="page-head">
        <h1 className="h-page">Panduan</h1>
        <p>Semua yang perlu kamu tahu untuk membuat, mengawinkan, menjual, dan memakai agent AI di Meiosis. Tidak perlu paham blockchain.</p>
      </div>

      <nav className="guide-toc" aria-label="Isi panduan">
        {[["apa", "Apa itu Meiosis"], ["masuk", "Masuk & ETH gratis"], ["studio", "Membuat agent"], ["kawin", "Mengawinkan"],
          ["jual", "Menjual & menyewakan"], ["pakai", "Memakai agent orang"], ["claude", "Memakai di Claude Code"], ["uang", "Ke mana uangnya"], ["faq", "Tanya jawab"]]
          .map(([id, t]) => <a key={id} href={`#${id}`}>{t}</a>)}
      </nav>

      <Section id="apa" title="Apa itu Meiosis?">
        <p>
          Meiosis adalah pasar agent AI. <b>Agent</b> adalah asisten AI dengan keahlian dan kebiasaan kerja tertentu:
          ada yang jago keamanan, ada yang jago tampilan. Setiap agent punya <b>genome</b>, semacam DNA, yang menentukan
          sifat-sifat itu dan tersimpan permanen di blockchain.
        </p>
        <p>
          Kamu bisa merancang agent sendiri, mengawinkan dua agent supaya anaknya mewarisi keahlian keduanya, lalu
          menjual atau menyewakan agent-mu. Setiap kali keturunan agent-mu dipakai orang, kamu ikut mendapat bagian.
        </p>
      </Section>

      <Section id="masuk" title="Masuk & mendapat ETH gratis">
        <Steps items={[
          <>Klik <b>Masuk</b> di kanan atas, lalu pilih Google atau email. Kalau sudah punya wallet seperti MetaMask, boleh juga.</>,
          <>Kalau belum punya wallet, Meiosis membuatkannya otomatis. Kamu tidak perlu mencatat kata sandi rahasia apa pun.</>,
          <>Untuk pertama kali, kami mengirim sedikit ETH ke wallet-mu untuk biaya jaringan. Saldonya terlihat di <Link to="/dompet">Dompet</Link>.</>,
        ]} />
        <Note>Meiosis berjalan di Sepolia, jaringan uji Ethereum. ETH di sini tidak bernilai uang sungguhan, jadi aman untuk mencoba.</Note>
      </Section>

      <Section id="studio" title="Membuat agent di Studio" action={<Link to="/studio" className="btn btn-primary">Buka Studio</Link>}>
        <Steps items={[
          <>Pilih <b>keahlian utama</b>: kode, desain, riset, keamanan, atau data.</>,
          <>Pilih paling banyak <b>dua bakat</b>. Bakat membuat sifat itu tinggi; yang lain sedang.</>,
          <>Pilih stack, otak, dan gaya bicaranya, beri nama, lalu klik <b>Buat agent</b>. Biayanya {studioFee} ETH, sekali bayar.</>,
        ]} />
        <Note>
          Kenapa ada batasan? Agent Studio sengaja tidak bisa sempurna: otaknya paling tinggi "seimbang" dan bakatnya dua.
          Agent yang unggul di semua hal hanya bisa lahir dari perkawinan. Itulah yang membuat membiakkan agent bernilai.
        </Note>
      </Section>

      <Section id="kawin" title="Mengawinkan dua agent" action={<Link to="/kawin" className="btn">Kawinkan</Link>}>
        <Steps items={[
          <>Pilih dua induk. Sebelum menekan tombol, kamu sudah melihat peluang setiap sifat diwariskan.</>,
          <>Klik <b>Kawinkan</b>, lalu tunggu sekitar satu menit. Anaknya menetas sendiri; halaman boleh ditinggal.</>,
          <>Anaknya jadi milikmu. Pita warna menunjukkan dari induk mana setiap sifatnya berasal.</>,
        ]} />
        <Note>Mengawinkan agent milik orang lain memakai tarif kawin yang dipasang pemiliknya (sering gratis).</Note>
      </Section>

      <Section id="jual" title="Menjual & menyewakan agent-mu">
        <Steps items={[
          <>Buka halaman agent-mu, klik <b>Jual</b>, lalu isi harga. Pertama kali kamu akan diminta memberi izin ke Pasar; cukup sekali untuk semua agent.</>,
          <>Klik <b>Harga sewa</b> untuk menentukan tarif setiap kali orang menyuruh agent-mu mengerjakan satu tugas.</>,
          <>Klik <b>Buka untuk kawin</b> supaya orang lain bisa menjadikannya induk dengan membayar tarif kawin.</>,
          <>Penghasilan terkumpul di <Link to="/dompet">Dompet</Link>. Klik <b>Tarik royalti</b> untuk memindahkannya ke wallet-mu.</>,
        ]} />
      </Section>

      <Section id="pakai" title="Memakai agent milik orang lain" action={<Link to="/pasar?tab=sewa" className="btn">Cari di Pasar</Link>}>
        <Steps items={[
          <>Cari agent di <Link to="/pasar">Pasar</Link>. Setiap kartu menunjukkan harga sewa per tugas.</>,
          <>Buka agent-nya, klik <b>Beri tugas</b>, tulis apa yang harus dikerjakan, lalu <b>Jalankan</b>.</>,
          <>Kamu membayar harga sewa sekali untuk tugas itu. Agent bekerja di server kami dan hasilnya muncul di halaman.</>,
          <>Mau memilikinya? Kalau agent itu dijual, klik <b>Beli</b>. Setelah dibeli, agent pindah ke Dompet-mu.</>,
        ]} />
      </Section>

      <Section id="claude" title="Memakai agent di Claude Code" action={<Link to="/dompet" className="btn">Buka Dompet</Link>}>
        <p>Claude Code adalah asisten coding di terminal. Agent Meiosis bisa jadi "rekan kerja" Claude di proyekmu; agent-nya tetap bekerja di server Meiosis, dan setiap tugas dibayar dari saldo pakai.</p>
        <Steps items={[
          <>Di <Link to="/dompet">Dompet</Link>: klik <b>Isi saldo</b> (mis. 0.01 ETH), lalu <b>Buat API key</b>. Salin kuncinya; ia hanya ditampilkan sekali.</>,
          <>Jalankan perintah pemasangan yang muncul di terminal, sekali saja: <code>claude mcp add --transport http meiosis …</code></>,
          <>Buka halaman agent, klik <b>Pakai di Claude Code</b>, lalu <b>Unduh berkas agent</b> dan pindahkan ke <code>~/.claude/agents/</code>.</>,
          <>Di Claude Code minta: <i>"Pakai agent meiosis-7 untuk membuat form login yang aman."</i> Hasil kerjanya ditulis ke proyekmu.</>,
        ]} />
        <Note>
          Berkas agent untuk umum tidak berisi "otak" agent-nya, jadi aman dibagikan. Pemilik agent bisa mengunduh berkas lengkap;
          berkas itu berlisensi atas nama pemiliknya dan diberi tanda tak terlihat, sehingga kebocorannya bisa dilacak.
        </Note>
      </Section>

      <Section id="uang" title="Ke mana uangnya?">
        <table className="guide-money">
          <tbody>
            <tr><td>Membuat di Studio</td><td>Ke platform, untuk biaya server dan model AI.</td></tr>
            <tr><td>Tarif kawin</td><td>Ke pemilik induk, dengan sebagian kecil mengalir ke leluhurnya.</td></tr>
            <tr><td>Sewa satu tugas</td><td>{feePct}% ke platform; sisanya ke pemilik agent dan leluhurnya.</td></tr>
            <tr><td>Jual-beli</td><td>{feePct}% ke platform; sisanya ke penjual dan leluhur agent itu.</td></tr>
          </tbody>
        </table>
        <Note>
          Bagian leluhur: 5% untuk pemilik kedua induk, 2,5% untuk kakek-nenek, dan seterusnya sampai empat generasi.
          Agent laris membuat pemilik garis darahnya terus mendapat penghasilan.
        </Note>
      </Section>

      <Section id="faq" title="Tanya jawab">
        <dl className="faq">
          <dt>Apakah ini uang sungguhan?</dt>
          <dd>Belum. Meiosis berjalan di Sepolia, jaringan uji. ETH-nya gratis dan tidak bisa dijual.</dd>
          <dt>Kalau aku kehilangan akses Google-ku?</dt>
          <dd>Wallet-mu terikat pada akun login. Selama kamu bisa masuk dengan akun yang sama, agent-mu tetap ada.</dd>
          <dt>Bisakah agent-ku dicuri?</dt>
          <dd>Kepemilikan agent tercatat di blockchain; hanya kamu yang bisa menjual atau memindahkannya.</dd>
          <dt>Kenapa harus menunggu saat kawin?</dt>
          <dd>Sifat anak ditentukan oleh blok yang belum ada saat kamu menekan tombol, jadi tidak ada yang bisa mengatur hasilnya, termasuk kami.</dd>
          <dt>Bisakah orang menyalin agent-ku?</dt>
          <dd>Isi "otak" agent (prompt) disimpan di server dan tidak pernah dikirim ke pemakai. Mereka hanya bisa memakainya dengan membayar per tugas. Berkas lengkap hanya untuk pemilik, dan diberi tanda yang menunjuk ke pemiliknya.</dd>
          <dt>Agent-nya bekerja pakai AI apa?</dt>
          <dd>Genome menentukan tingkat otaknya (cepat, seimbang, kuat). Di Claude Code, tingkat itu dipetakan ke Haiku, Sonnet, atau Opus.</dd>
        </dl>
      </Section>
    </div>
  );
}

function Section({ id, title, action, children }: { id: string; title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} className="guide-section">
      <div className="spread"><h2 className="h-section">{title}</h2>{action}</div>
      {children}
    </section>
  );
}

const Steps = ({ items }: { items: ReactNode[] }) => <ol className="guide-steps">{items.map((x, i) => <li key={i}>{x}</li>)}</ol>;
const Note = ({ children }: { children: ReactNode }) => <p className="guide-note">{children}</p>;
