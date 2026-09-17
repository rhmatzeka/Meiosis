#!/bin/sh
# Satu run arena. Tiap tahap mencatat hasilnya sendiri dan tidak pernah
# menjatuhkan tahap berikutnya — kegagalan adalah informasi penilaian yang sah,
# bukan alasan container berhenti.
#
#   tsc --noEmit  galat tipe. Tanpa ini `vite build` meloloskan kode yang
#                 merujuk variabel tak ada — ia memang tidak type-check.
#   eslint        pola tidak aman pada kode buatan agent.
#   vite build    menghasilkan bundel.
#   analyze.ts    ukuran bundel dan pola berbahaya.
#   render.ts     merender halaman sungguhan. Halaman yang lolos build tapi
#                 kosong dengan galat konsol tetap gagal, dan itu yang penting.
set -u
mkdir -p /work/out

echo "--- typecheck ---"
if bunx tsc --noEmit > /work/out/typecheck.log 2>&1; then
  echo '{"typecheckOk":true}' > /work/out/typecheck.json && echo "typecheck ok"
else
  echo '{"typecheckOk":false}' > /work/out/typecheck.json && echo "typecheck gagal"
  tail -8 /work/out/typecheck.log
fi

echo "--- lint keamanan ---"
bunx eslint src --format json > /work/out/eslint.json 2> /work/out/eslint.log || true
[ -s /work/out/eslint.json ] || echo '[]' > /work/out/eslint.json
echo "lint selesai"

echo "--- build ---"
if bun run build > /work/out/build.log 2>&1; then
  echo '{"buildOk":true}' > /work/out/build.json && echo "build ok"
else
  echo '{"buildOk":false}' > /work/out/build.json && echo "build gagal"
  tail -12 /work/out/build.log
  bun run /work/analyze.ts >> /work/out/build.log 2>&1 || true
  exit 0
fi

echo "--- analisis ---"
bun run /work/analyze.ts >> /work/out/build.log 2>&1 || true

# Saat agent sedang beriterasi, render dilewati: Chromium adalah bagian
# termahal, dan yang dibutuhkan agent di tengah loop hanyalah tahu apakah
# kodenya lolos typecheck dan build.
if [ "${SKIP_RENDER:-0}" = "1" ]; then
  echo "--- render dilewati (mode cepat) ---"
  exit 0
fi

echo "--- render ---"
bun run /work/render.ts >> /work/out/build.log 2>&1 || true
tail -3 /work/out/build.log
