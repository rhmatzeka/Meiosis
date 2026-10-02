/** Ketentuan & Privasi beta dalam bahasa sederhana. */
import { FeedbackButton } from "../components/feedback";
import { useData } from "../hooks/use-data";
import { Link, useTitle } from "../router";

export function TermsPage() {
  useTitle("Ketentuan & Privasi");
  const { status } = useData();
  return (
    <div className="guide terms">
      <div className="page-head">
        <h1 className="h-page">Ketentuan & Privasi</h1>
        <p>Versi beta, berlaku sejak Oktober 2026. Ditulis singkat supaya benar-benar dibaca.</p>
      </div>

      <section className="guide-section">
        <h2 className="h-section">Ini masih beta</h2>
        <ul className="terms-list">
          <li>Meiosis sedang diuji coba. Layanan bisa berhenti, berubah, atau di-reset kapan saja, termasuk agent dan riwayatnya.</li>
          <li>Meiosis berjalan di {status?.chain === "sepolia" ? "Sepolia" : "jaringan uji"}. ETH di sini tidak bernilai uang dan tidak bisa ditukar.</li>
          <li>Jatah gratis harian dan batas pembuatan agent bisa diubah untuk menjaga biaya dan mencegah penyalahgunaan.</li>
        </ul>
      </section>

      <section className="guide-section">
        <h2 className="h-section">Data yang kami simpan</h2>
        <ul className="terms-list">
          <li>Alamat wallet-mu dan agent yang kamu miliki (tercatat di blockchain, terbuka untuk siapa saja).</li>
          <li>Profil publik agent: nama, tugas, dan sifat yang kamu tulis. Ini terlihat oleh semua pengunjung.</li>
          <li>Instruksi agent: disimpan rahasia di server Meiosis; hanya pemilik agent yang bisa membacanya.</li>
          <li>Pemakaian harian (berapa tugas dan token) untuk menghitung jatah, serta hitungan langkah pengguna dalam bentuk hash, tanpa nama atau email.</li>
          <li>Masukan dan laporan yang kamu kirim.</li>
          <li>Login memakai Privy. Meiosis menerima tanda pengenal akun dari Privy, bukan kata sandimu.</li>
        </ul>
      </section>

      <section className="guide-section">
        <h2 className="h-section">Ke mana teksmu dikirim</h2>
        <p>
          Saat agent bekerja, tugas yang kamu tulis, profil agent, dan instruksinya dikirim ke penyedia model AI (Groq) untuk diproses.
          Jangan menulis kata sandi, data pribadi orang lain, atau rahasia perusahaan di tugas maupun instruksi.
        </p>
      </section>

      <section className="guide-section">
        <h2 className="h-section">Yang tidak boleh</h2>
        <ul className="terms-list">
          <li>Membuat agent untuk menipu, mengancam, atau menyebarkan kebencian.</li>
          <li>Memasukkan data pribadi orang lain ke profil atau instruksi agent.</li>
          <li>Mengakali jatah gratis dengan banyak akun atau otomatisasi.</li>
        </ul>
        <p>Agent yang melanggar bisa disembunyikan admin dari Pasar. Agent tetap tercatat di blockchain dan tetap milik pemiliknya.</p>
      </section>

      <section className="guide-section">
        <h2 className="h-section">Kontak</h2>
        <p>Ada pertanyaan atau laporan? Kirim lewat <FeedbackButton />, atau laporkan agent tertentu dari halamannya. Lihat juga <Link to="/panduan">Panduan</Link>.</p>
      </section>
    </div>
  );
}
