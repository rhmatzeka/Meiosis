/**
 * Panduan untuk orang yang belum pernah memakai blockchain maupun agent AI.
 * Setiap bagian menjawab satu pertanyaan, dengan satu tombol untuk langsung mencobanya.
 */
import type { ReactNode } from "react";
import { useData } from "../hooks/use-data";
import { Hint } from "../components/hint";
import { Link, useTitle } from "../router";

export function GuidePage() {
  useTitle("Panduan");
  const { status } = useData();
  const studioFee = status?.market?.studioFeeEth ?? "0";
  const studioFree = Number(studioFee) === 0;
  const feePct = (status?.market?.feeBps ?? 1000) / 100;

  return (
    <div className="guide">
      <div className="page-head">
        <h1 className="h-page">Panduan</h1>
        <p>Semua yang perlu kamu tahu untuk membuat, mengawinkan, menjual, dan memakai agent AI di Meiosis. Tidak perlu paham blockchain.</p>
      </div>

      <nav className="guide-toc" aria-label="Isi panduan">
        {[["apa", "Apa itu Meiosis"], ["masuk", "Masuk"], ["studio", "Membuat agent"], ["jatah", "Jatah gratis"], ["kawin", "Mengawinkan"],
          ["jual", "Menjual & menyewakan"], ["pakai", "Memakai agent orang"], ["bayar", "Konfirmasi bayar"], ["claude", "Memakai di Claude Code"],
          ["uang", "Ke mana uangnya"], ["faq", "Tanya jawab"]]
          .map(([id, t]) => <a key={id} href={`#${id}`}>{t}</a>)}
      </nav>

      <Section id="apa" title="Apa itu Meiosis?">
        <p>
          Meiosis adalah pasar agent AI. <b>Agent</b> adalah asisten AI dengan tugas, keahlian, dan kebiasaan kerja yang
          kamu tulis sendiri. Kamu bisa membuat agent, mengawinkan dua agent supaya anaknya mewarisi sifat keduanya,
          lalu menjual atau menyewakannya. Setiap kali keturunan agent-mu dipakai orang, kamu ikut mendapat bagian.
        </p>
        <p>
          Kepemilikan dan asal-usul setiap agent tercatat di blockchain, jadi bisa dibuktikan siapa saja. Isi rahasianya
          tetap rahasia.
        </p>
      </Section>

      <Section id="masuk" title="Masuk">
        <Steps items={[
          <>Klik <b>Masuk</b> di kanan atas, lalu pilih Google atau email. Kalau sudah punya wallet seperti MetaMask, boleh juga.</>,
          <>Kalau belum punya wallet, Meiosis membuatkannya otomatis. Kamu tidak perlu mencatat kata sandi rahasia apa pun.</>,
          <>Pengguna baru dikirimi sedikit ETH uji untuk biaya jaringan. Saldonya terlihat di <Link to="/dompet">Dompet</Link>.</>,
        ]} />
        <Note>Meiosis sedang beta di Sepolia, jaringan uji Ethereum. ETH di sini tidak bernilai uang, jadi aman untuk mencoba.</Note>
      </Section>

      <Section id="studio" title="Membuat agent di Studio" action={<Link to="/studio" className="btn btn-primary">Buka Studio</Link>}>
        <Steps items={[
          <><b>Ceritakan</b> agent yang kamu butuhkan dengan kata-katamu sendiri, lalu klik <b>Rancang untukku</b>. Atau isi sendiri dari nol.</>,
          <>Tulis <b>tugasnya</b> dalam satu kalimat, lalu <b>sifat</b>-nya: keahlian, stack dan alat, cara berpikir, cara kerja, gaya bicara, kepribadian. Semua teks bebas. Ganti nama sifatnya atau tambah sifat baru apa saja, misalnya "Bahasa: Jawa halus".</>,
          <>Tulis <b>instruksi</b> rahasia kalau perlu: aturan yang harus dipatuhi agent.</>,
          <>Klik <b>Coba</b> untuk melihat cara agent menjawab sebelum dibuat, lalu <b>Buat agent</b>. {studioFree ? "Gratis selama beta; kamu hanya membayar biaya jaringan yang sangat kecil." : `Biayanya ${studioFee} ETH, sekali bayar.`}</>,
          <>Setelah jadi, pemilik bisa membuka <b>Sunting otak</b> di halaman agent kapan saja. Setiap suntingan tercatat sebagai versi baru.</>,
        ]} />
        <Note>
          Instruksi disimpan rahasia di server; yang tercatat di blockchain hanya sidik jarinya. Orang lain bisa memakai
          agent-mu tanpa pernah melihat isinya. Teksnya dikirim ke penyedia model AI (Groq) saat agent bekerja.
          Semua agent memakai model AI pilihan Meiosis; isianmu mengatur cara agent bekerja, bukan modelnya.
        </Note>
      </Section>

      <Section id="jatah" title="Jatah gratis harian">
        <p>
          Selama beta, setiap akun mendapat beberapa tugas gratis per hari untuk semua agent, termasuk tombol <b>Coba</b> di Studio,
          dan bisa membuat beberapa agent baru per hari. Jatah pulih setiap jam 07.00 WIB. Sisanya terlihat di menu akun.
        </p>
        <Note>Kalau AI sedang ramai, tugas ditolak dengan pesan "AI sedang ramai" dan jatahmu tidak berkurang. Coba lagi semenit kemudian.</Note>
      </Section>

      <Section id="kawin" title="Mengawinkan dua agent" action={<Link to="/kawin" className="btn">Kawinkan</Link>}>
        <Steps items={[
          <>Pilih dua induk dari daftar. Sebelum menekan tombol, kamu melihat sifat mana yang pasti turun dan mana yang 50:50.</>,
          <>Klik <b>Kawinkan</b>, lalu tunggu sekitar satu menit. Anaknya menetas sendiri; halaman boleh ditinggal.</>,
          <>Anaknya jadi milikmu. Halaman anak menunjukkan dari induk mana setiap sifatnya berasal.</>,
        ]} />
        <Note>
          Sifat yang dimiliki kedua induk diambil dari salah satunya, ditentukan oleh DNA dan blok kelahiran di blockchain,
          jadi tidak ada yang bisa mengatur hasilnya. Sifat yang hanya dimiliki satu induk pasti turun. Anak memakai otak
          induk versi saat ia lahir, jadi suntingan induk sesudahnya tidak mengubah anak yang sudah ada.
        </Note>
      </Section>

      <Section id="jual" title="Menjual & menyewakan agent-mu">
        <Steps items={[
          <>Buka halaman agent-mu, klik <b>Jual</b>, lalu isi harga. Pertama kali kamu akan diminta memberi izin ke Pasar; cukup sekali untuk semua agent.</>,
          <>Klik <b>Harga sewa</b> untuk menentukan tarif setiap kali orang menyuruh agent-mu mengerjakan satu tugas. Bila nol, penyewa memakai jatah gratisnya.</>,
          <>Klik <b>Buka untuk kawin</b> supaya orang lain bisa menjadikannya induk, dengan atau tanpa tarif kawin.</>,
          <>Penghasilan terkumpul di <Link to="/dompet">Dompet</Link>. Klik <b>Tarik royalti</b> untuk memindahkannya ke wallet-mu.</>,
        ]} />
      </Section>

      <Section id="pakai" title="Memakai agent milik orang lain" action={<Link to="/tugas" className="btn">Beri tugas</Link>}>
        <Steps items={[
          <>Cari agent di <Link to="/pasar">Pasar</Link> berdasarkan nama, tugas, atau stack-nya.</>,
          <>Buka <b>Beri tugas</b>, pilih agent, tulis apa yang harus dikerjakan, lalu <b>Jalankan</b>.</>,
          <>Hasilnya muncul di halaman. Kode bisa disalin per blok, dan seluruh jawaban bisa diunduh.</>,
          <>Mau memilikinya? Kalau agent itu dijual, klik <b>Beli</b> di halaman agent.</>,
        ]} />
      </Section>

      <Section id="bayar" title="Kenapa ada konfirmasi bayar?">
        <p>
          Wallet yang dibuatkan otomatis tidak memunculkan jendelanya sendiri. Karena itu, setiap kali ada ETH yang berpindah,
          Meiosis menampilkan lembar konfirmasi: harga, perkiraan biaya jaringan, dan saldomu. Kalau saldo kurang, tombol
          <b> Bayar</b> diganti <b>Isi saldo</b>. Setelah ditandatangani, progresnya tampil di pojok layar dengan tautan ke explorer.
        </p>
      </Section>

      <Section id="claude" title="Memakai agent di Claude Code" action={<Link to="/dompet" className="btn">Buka Dompet</Link>}>
        <p>Claude Code adalah asisten coding di terminal. Agent Meiosis bisa jadi "rekan kerja" Claude di proyekmu; agent-nya tetap bekerja di server Meiosis.</p>
        <Steps items={[
          <>Di <Link to="/dompet">Dompet</Link>: klik <b>Buat API key</b>. Salin kuncinya; ia hanya ditampilkan sekali. Isi <b>saldo untuk Claude Code</b> bila agent yang dipakai memasang harga.</>,
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
            <tr><td>Membuat di Studio</td><td>{studioFree ? "Gratis selama beta." : "Ke platform, untuk biaya server dan model AI."}</td></tr>
            <tr><td>Tarif kawin</td><td>Ke pemilik induk, dengan sebagian kecil mengalir ke leluhurnya.</td></tr>
            <tr><td>Sewa satu tugas</td><td>{feePct}% ke platform <Hint k="biaya-platform" />; sisanya ke pemilik agent dan leluhurnya.</td></tr>
            <tr><td>Jual-beli</td><td>{feePct}% ke platform; sisanya ke penjual dan leluhur agent itu.</td></tr>
          </tbody>
        </table>
        <Note>
          Bagian leluhur: 5% untuk pemilik kedua induk, 2,5% untuk kakek-nenek, dan seterusnya sampai empat generasi.
          Agent laris membuat pemilik garis keturunannya terus mendapat penghasilan.
        </Note>
      </Section>

      <Section id="faq" title="Tanya jawab">
        <dl className="faq">
          <dt>Apakah ini uang sungguhan?</dt>
          <dd>Belum. Meiosis sedang beta di Sepolia, jaringan uji. ETH-nya didapat gratis dan tidak bisa dijual.</dd>
          <dt>Kalau aku kehilangan akses Google-ku?</dt>
          <dd>Wallet-mu terikat pada akun login. Selama kamu bisa masuk dengan akun yang sama, agent-mu tetap ada.</dd>
          <dt>Bisakah agent-ku dicuri?</dt>
          <dd>Kepemilikan agent tercatat di blockchain; hanya kamu yang bisa menjual, memindahkan, atau menyuntingnya.</dd>
          <dt>Kenapa harus menunggu saat kawin?</dt>
          <dd>Sifat anak ditentukan oleh blok yang belum ada saat kamu menekan tombol, jadi tidak ada yang bisa mengatur hasilnya, termasuk kami.</dd>
          <dt>Bisakah orang menyalin agent-ku?</dt>
          <dd>Instruksi agent disimpan di server dan tidak pernah dikirim ke pemakai. Mereka hanya bisa memakainya. Berkas lengkap hanya untuk pemilik, dan diberi tanda yang menunjuk ke pemiliknya.</dd>
          <dt>Agent-nya bekerja pakai AI apa?</dt>
          <dd>Model AI dipilih oleh Meiosis dan sama untuk semua agent selama beta. Yang membuat agent berbeda adalah tugas, sifat, dan instruksi yang ditulis pembuatnya.</dd>
          <dt>Siapa yang bisa membaca instruksi agent-ku?</dt>
          <dd>Hanya kamu sebagai pemilik. Teksnya dikirim ke penyedia model AI (Groq) setiap kali agent bekerja. Baca <Link to="/ketentuan">Ketentuan & Privasi</Link>.</dd>
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

const Steps = ({ items }: { items: ReactNode[] }) => <ol className="guide-steps">{items.map((x, i) => <li key={i}><span>{x}</span></li>)}</ol>;
const Note = ({ children }: { children: ReactNode }) => <p className="guide-note">{children}</p>;
