import { Empty } from "../components/ui";
import { Link, useTitle } from "../router";

export function NotFound() {
  useTitle("Tidak ditemukan");
  return (
    <Empty title="Halaman ini tidak ada" action={<Link to="/" className="btn">Kembali ke beranda</Link>}>
      Mungkin tautannya salah ketik, atau agent-nya ada di chain lain.
    </Empty>
  );
}
