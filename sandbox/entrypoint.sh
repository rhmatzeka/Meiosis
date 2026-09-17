#!/bin/sh
# Satu run arena: periksa tipe, bangun, lalu render dan pindai.
#
# Ketiganya dicatat terpisah karena mengukur hal yang berbeda, dan hanya yang
# ketiga yang benar-benar menjawab "halamannya jalan atau tidak":
#
#   tsc --noEmit  menangkap galat tipe. Tanpa ini, `vite build` meloloskan kode
#                 yang merujuk variabel tak ada — ia memang tidak type-check.
#   vite build    menghasilkan bundel.
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

echo "--- build ---"
if bun run build > /work/out/build.log 2>&1; then
  echo '{"buildOk":true}' > /work/out/build.json && echo "build ok"
else
  echo '{"buildOk":false}' > /work/out/build.json && echo "build gagal"
  tail -12 /work/out/build.log
  exit 0
fi

echo "--- render ---"
bun run /work/render.ts >> /work/out/build.log 2>&1 || true
tail -2 /work/out/build.log
