# Image sandbox arena.
#
# Di sinilah kode buatan mesin dieksekusi — dibangun, dirender, dan diskor —
# tanpa pernah ditinjau manusia lebih dulu. Karena itu: non-root, tanpa mount
# dari host, tanpa rahasia apa pun, dan `--network none` saat dijalankan.
#
# Dependensi sengaja dipasang saat BUILD IMAGE, bukan saat run, supaya container
# bisa berjalan tanpa jaringan sama sekali. Lihat PLAN.md §10.
FROM oven/bun:1-debian

# chromium hanya untuk merender halaman: satu screenshot dan satu pemindaian
# axe-core. Lighthouse sengaja tidak dipakai — itulah komponen yang dulu
# memaksa kebutuhan RAM membengkak.
RUN apt-get update && apt-get install -y --no-install-recommends \
      chromium fonts-liberation ca-certificates \
    && rm -rf /var/lib/apt/lists/*

ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
    CHROMIUM_PATH=/usr/bin/chromium \
    NODE_ENV=development

RUN useradd -m -u 1001 runner
WORKDIR /work
COPY --chown=runner:runner template/package.json ./
RUN bun install && chown -R runner:runner /work
COPY --chown=runner:runner template/ ./
COPY --chown=runner:runner render.ts analyze.ts entrypoint.sh /work/
USER runner
ENTRYPOINT ["/work/entrypoint.sh"]
