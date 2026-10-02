/**
 * Metrik minat beta: berapa akun unik melewati tiap langkah per hari, dan
 * berapa yang kembali setelah 7 hari. Hanya hash akun yang disimpan.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { hashUser } from "./admin";

export const EVENTS = ["masuk", "buat", "coba", "tugas", "kawin", "pasang-harga", "tugas-berbayar"] as const;
export type MetricEvent = (typeof EVENTS)[number];

type Days = Record<string, Partial<Record<MetricEvent, string[]>>>;
const dayOf = (t: number) => new Date(t).toISOString().slice(0, 10);

export class Metrics {
  private days: Days;
  constructor(private file: string, private salt: string) {
    this.days = existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as Days) : {};
  }
  record(event: MetricEvent, user: string, now = Date.now()) {
    const d = (this.days[dayOf(now)] ??= {});
    const list = (d[event] ??= []);
    const h = hashUser(user, this.salt);
    if (list.includes(h)) return;
    list.push(h);
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(this.file + ".tmp", JSON.stringify(this.days));
    renameSync(this.file + ".tmp", this.file);
  }
  funnel(fromDay: string, toDay: string) {
    const inRange = Object.keys(this.days).filter((d) => d >= fromDay && d <= toDay);
    const steps = Object.fromEntries(EVENTS.map((e) => [e, new Set(inRange.flatMap((d) => this.days[d][e] ?? [])).size])) as Record<MetricEvent, number>;
    // D7: akun yang pertama masuk di rentang ini (paling lambat 7 hari sebelum akhir), dan masuk lagi tepat 7 hari kemudian.
    const first = new Map<string, string>();
    for (const d of Object.keys(this.days).sort()) for (const h of this.days[d].masuk ?? []) if (!first.has(h)) first.set(h, d);
    const plus7 = (d: string) => new Date(Date.parse(d + "T00:00:00Z") + 7 * 86_400_000).toISOString().slice(0, 10);
    const cohort = [...first].filter(([, d]) => d >= fromDay && plus7(d) <= toDay);
    const returned = cohort.filter(([h, d]) => (this.days[plus7(d)]?.masuk ?? []).includes(h)).length;
    return { steps, d7: { cohort: cohort.length, returned } };
  }
}
