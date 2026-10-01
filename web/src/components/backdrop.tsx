/**
 * Latar di puncak setiap halaman: cahaya biru yang jatuh dari kiri atas dan
 * kisi kotak di kanan atas dengan beberapa kotak yang berkedip pelan. Halaman
 * depan memakai versi tinggi; halaman lain versi pendek, supaya terasa satu dunia.
 */
import { useRef } from "react";
import { MOTION_OK, gsap, useGSAP } from "../motion";

const CELL = 72;
// Kotak yang menyala: [kolom dari kanan, baris dari atas, terang].
const LIT: [number, number, number][] = [
  [1, 1, 0.07], [3, 0, 0.05], [2, 2, 0.045], [5, 1, 0.06], [4, 3, 0.04], [7, 0, 0.045],
  [6, 2, 0.035], [0, 3, 0.05], [8, 2, 0.03], [3, 4, 0.03], [9, 1, 0.03], [1, 5, 0.025],
];

export function Backdrop({ tall }: { tall: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useGSAP(() => {
    gsap.matchMedia().add(MOTION_OK, () => {
      gsap.utils.toArray<HTMLElement>(".backdrop-lit i").forEach((el, i) => {
        gsap.to(el, { opacity: 0.25, duration: 2.4 + (i % 5) * 0.7, ease: "sine.inOut", repeat: -1, yoyo: true, delay: (i % 4) * 0.6 });
      });
      gsap.from(".backdrop-glow", { opacity: 0, scale: 0.9, duration: 1.6, ease: "power2.out" });
    });
  }, { scope: ref });
  return (
    <div className={`backdrop ${tall ? "backdrop-tall" : ""}`} ref={ref} aria-hidden>
      <div className="backdrop-glow" />
      <div className="backdrop-grid" />
      <div className="backdrop-lit">
        {LIT.map(([c, r, o], i) => (
          <i key={i} style={{ right: c * CELL, top: r * CELL, width: CELL, height: CELL, background: `rgba(140, 170, 255, ${o})` }} />
        ))}
      </div>
    </div>
  );
}
