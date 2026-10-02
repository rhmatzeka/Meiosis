/**
 * Jatah gratis beta: biaya model nyata ditanggung penyelenggara, jadi setiap
 * pemakaian model dicatat per akun dan per hari, ditambah satu anggaran token
 * global. Tersimpan di berkas supaya restart tidak mengembalikan jatah.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export interface QuotaConfig { tasksPerDay: number; studioPerDay: number; tokenBudget: number; resetHourUtc: number }
interface Day { tasks: Record<string, number>; studio: Record<string, number>; tokens: Record<string, number>; reserved: Record<string, { user: string; est: number }> }
type Fail = { ok: false; reason: "jatah-akun" | "anggaran-harian"; resetsAt: number };

export const dayKey = (now: number, resetHourUtc: number) => new Date(now - resetHourUtc * 3_600_000).toISOString().slice(0, 10);

export class QuotaLedger {
  private days: Record<string, Day>;
  constructor(private file: string, private cfg: QuotaConfig, private estPerTask = 8_000) {
    this.days = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
  }
  private day(now: number) {
    const k = dayKey(now, this.cfg.resetHourUtc);
    return (this.days[k] ??= { tasks: {}, studio: {}, tokens: {}, reserved: {} });
  }
  private resetsAt(now: number) {
    const k = dayKey(now, this.cfg.resetHourUtc);
    return Date.parse(k + "T00:00:00Z") + 86_400_000 + this.cfg.resetHourUtc * 3_600_000;
  }
  private save() {
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(this.file + ".tmp", JSON.stringify(this.days));
    renameSync(this.file + ".tmp", this.file);
  }
  private spent(d: Day) {
    return Object.values(d.tokens).reduce((s, n) => s + n, 0) + Object.values(d.reserved).reduce((s, r) => s + r.est, 0);
  }
  reserveTask(user: string, now = Date.now()): { ok: true; ticket: string } | Fail {
    const d = this.day(now);
    if ((d.tasks[user] ?? 0) >= this.cfg.tasksPerDay) return { ok: false, reason: "jatah-akun", resetsAt: this.resetsAt(now) };
    if (this.spent(d) + this.estPerTask > this.cfg.tokenBudget) return { ok: false, reason: "anggaran-harian", resetsAt: this.resetsAt(now) };
    const ticket = `${dayKey(now, this.cfg.resetHourUtc)}:${crypto.randomUUID()}`;
    d.tasks[user] = (d.tasks[user] ?? 0) + 1;
    d.reserved[ticket] = { user, est: this.estPerTask };
    this.save();
    return { ok: true, ticket };
  }
  /** Beberapa tugas sekaligus: semua dicadangkan, atau tidak satu pun. */
  reserveTasks(user: string, n: number, now = Date.now()): { ok: true; tickets: string[] } | Fail {
    const tickets: string[] = [];
    for (let i = 0; i < n; i++) {
      const t = this.reserveTask(user, now);
      if (!t.ok) { tickets.forEach((x) => this.release(x)); return t; }
      tickets.push(t.ticket);
    }
    return { ok: true, tickets };
  }

  settle(ticket: string, tokensUsed: number) {
    const d = this.days[ticket.split(":")[0]];
    const r = d?.reserved[ticket];
    if (!d || !r) return;
    delete d.reserved[ticket];
    d.tokens[r.user] = (d.tokens[r.user] ?? 0) + tokensUsed;
    this.save();
  }
  release(ticket: string) {
    const d = this.days[ticket.split(":")[0]];
    const r = d?.reserved[ticket];
    if (!d || !r) return;
    delete d.reserved[ticket];
    d.tasks[r.user] = Math.max(0, (d.tasks[r.user] ?? 1) - 1);
    this.save();
  }
  reserveStudio(user: string, now = Date.now()): { ok: true } | Fail {
    const d = this.day(now);
    if ((d.studio[user] ?? 0) >= this.cfg.studioPerDay) return { ok: false, reason: "jatah-akun", resetsAt: this.resetsAt(now) };
    d.studio[user] = (d.studio[user] ?? 0) + 1;
    this.save();
    return { ok: true };
  }
  /** Pemakaian di luar jatah akun (mis. saran AI di Studio), tetap dihitung ke anggaran harian. */
  addTokens(user: string, tokens: number, now = Date.now()) {
    const d = this.day(now);
    d.tokens[user] = (d.tokens[user] ?? 0) + tokens;
    this.save();
  }
  canSpend(est: number, now = Date.now()) {
    return this.spent(this.day(now)) + est <= this.cfg.tokenBudget;
  }
  left(user: string, now = Date.now()) {
    const d = this.day(now);
    return {
      tasks: Math.max(0, this.cfg.tasksPerDay - (d.tasks[user] ?? 0)), tasksPerDay: this.cfg.tasksPerDay,
      studio: Math.max(0, this.cfg.studioPerDay - (d.studio[user] ?? 0)), studioPerDay: this.cfg.studioPerDay,
      resetsAt: this.resetsAt(now),
    };
  }
  /** Admin mengubah batas tanpa restart. */
  configure(patch: Partial<QuotaConfig>) {
    Object.assign(this.cfg, Object.fromEntries(Object.entries(patch).filter(([, v]) => Number.isFinite(v) && (v as number) >= 0)));
  }
  get config(): Readonly<QuotaConfig> { return this.cfg; }
  snapshot(now = Date.now()) {
    const d = this.day(now);
    const users = new Set([...Object.keys(d.tasks), ...Object.keys(d.studio)].filter((u) => !u.startsWith("sistem:")));
    const byUser = Object.fromEntries([...users].map((u) => [u, { tasks: d.tasks[u] ?? 0, studio: d.studio[u] ?? 0, tokens: d.tokens[u] ?? 0 }]));
    return { day: dayKey(now, this.cfg.resetHourUtc), users: users.size, tasks: Object.values(d.tasks).reduce((s, n) => s + n, 0), tokens: this.spent(d), byUser };
  }
}
