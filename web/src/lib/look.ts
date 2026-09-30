/**
 * "Wajah" agent: warna sel diturunkan dari genome, jadi agent yang sama selalu
 * terlihat sama di semua halaman, dan kemiripan warna anak–induk bermakna.
 *
 *   hue       keahlian utama, digeser sedikit oleh stack
 *   saturasi  estetika
 *   cahaya    tier otak
 */
import { LOCUS, express } from "../../../packages/shared/src/genome";

const DISCIPLINE_HUE = [262, 170, 318, 210, 138, 42]; // serba bisa, kode, desain, riset, keamanan, data
const STACK_SHIFT = [0, -16, 12, 26]; // —, React, Solidity, Python

export interface CellLook { h: number; h2: number; sat: number; glow: number }

export function cellLook(genome: bigint): CellLook {
  const t = express(genome, 0n);
  const h = (DISCIPLINE_HUE[t[LOCUS.DISCIPLINE_PRIMARY]] ?? 200) + (STACK_SHIFT[t[LOCUS.STACK_AFFINITY]] ?? 0);
  const hue = ((h % 360) + 360) % 360;
  return {
    h: hue,
    h2: (hue + 28) % 360,
    sat: 55 + (t[LOCUS.AESTHETIC] ?? 0) * 18,
    glow: [0.28, 0.42, 0.6][t[LOCUS.MODEL_TIER]] ?? 0.4,
  };
}
