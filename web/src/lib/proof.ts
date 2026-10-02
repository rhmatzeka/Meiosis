/**
 * Waktu untuk pesan bertanda tangan. Server menerima setiap pesan sekali saja,
 * jadi dua permintaan yang ditandatangani di milidetik yang sama (mis. halaman
 * memuat data dua kali) harus tetap menghasilkan pesan yang berbeda.
 */
let last = 0;
export function proofStamp(now = Date.now()) {
  last = Math.max(now, last + 1);
  return new Date(last).toISOString();
}
