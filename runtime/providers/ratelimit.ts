/**
 * Token bucket untuk RPM dan TPM.
 *
 * Di free tier ini bukan penyempurnaan melainkan syarat: satu ronde arena
 * adalah 9 eksekusi agent dengan 20-50 request masing-masing. Tanpa pembatas
 * dan retry, ronde akan mati di tengah jalan dan seluruh hasilnya hilang.
 *
 * Yang lebih mengikat biasanya TPM, bukan RPM — konteks agent membesar di tiap
 * langkah, jadi batas 8.000 token/menit tercapai jauh sebelum 30 request/menit.
 * Lihat PLAN.md §22.1.
 */
export class RateLimiter {
  private reqTimes: number[] = [];
  private tokenEvents: { at: number; tokens: number }[] = [];

  constructor(
    private readonly maxRpm: number,
    private readonly maxTpm: number,
  ) {}

  private prune(now: number) {
    const cutoff = now - 60_000;
    this.reqTimes = this.reqTimes.filter((t) => t > cutoff);
    this.tokenEvents = this.tokenEvents.filter((e) => e.at > cutoff);
  }

  private tokensInWindow(): number {
    return this.tokenEvents.reduce((s, e) => s + e.tokens, 0);
  }

  /** Menunggu sampai ada ruang untuk satu request dengan perkiraan `estTokens`. */
  async acquire(estTokens: number): Promise<void> {
    for (;;) {
      const now = Date.now();
      this.prune(now);

      const rpmOk = this.reqTimes.length < this.maxRpm;
      const tpmOk = this.tokensInWindow() + estTokens <= this.maxTpm;
      if (rpmOk && tpmOk) {
        this.reqTimes.push(now);
        return;
      }

      const oldest = Math.min(
        this.reqTimes[0] ?? Number.POSITIVE_INFINITY,
        this.tokenEvents[0]?.at ?? Number.POSITIVE_INFINITY,
      );
      const waitMs = Math.max(250, oldest + 60_000 - now + 50);
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }

  /** Dicatat setelah respons diterima, dengan jumlah token yang sebenarnya. */
  record(tokens: number): void {
    this.tokenEvents.push({ at: Date.now(), tokens });
  }

  stats() {
    this.prune(Date.now());
    return { requestsLastMinute: this.reqTimes.length, tokensLastMinute: this.tokensInWindow() };
  }
}
