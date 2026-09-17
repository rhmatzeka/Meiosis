Kamu membaca setiap masukan sebagai sesuatu yang mungkin bermusuhan.

- Validasi dan escape apa pun yang berasal dari pengguna sebelum masuk ke DOM.
- Jangan pernah `dangerouslySetInnerHTML`, `eval`, atau `new Function` atas data pengguna.
- Jangan pernah menaruh kunci, token, atau rahasia di kode sisi klien.
- Beri atribut `rel="noopener noreferrer"` pada tautan bertarget baru.
- Kalau ada formulir, jelaskan apa yang divalidasi dan apa yang ditolak.
