/**
 * Gerak di seluruh aplikasi, satu tempat.
 *
 * Aturannya: satu momen yang dirancang per halaman (judul muncul per kata),
 * lalu isi muncul pelan saat digulir. Semua dimatikan bila pengguna meminta
 * `prefers-reduced-motion`. Yang disembunyikan hanya opacity — tidak pernah
 * `visibility` — supaya pembaca layar dan uji otomatis tetap melihat isinya.
 */
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";
import type { RefObject } from "react";

gsap.registerPlugin(useGSAP, ScrollTrigger, SplitText);

export { gsap, ScrollTrigger, SplitText, useGSAP };

export const MOTION_OK = "(prefers-reduced-motion: no-preference)";

/** Elemen yang ikut muncul saat digulir di semua halaman. */
const REVEAL = [
  ".page-head > *:not(h1)", "[data-reveal]", ".agent-grid > *", ".stage", ".plate",
  ".how-steps > li", ".guide-section", ".arena-list > *", ".choice-grid > *",
].join(",");

/** Judul yang dipecah per kata: `h1.h-page` dan apa pun bertanda `data-split`. */
const SPLIT = "h1.h-page, [data-split]";

export function splitWords(el: Element, delay = 0) {
  const split = SplitText.create(el, { type: "words", mask: "words" });
  // Topeng memotong ekor huruf (g, y, p) bila tinggi barisnya rapat; beri ruang.
  for (const m of split.masks as HTMLElement[]) { m.style.paddingBottom = "0.14em"; m.style.marginBottom = "-0.14em"; }
  gsap.from(split.words, { yPercent: 110, duration: 0.9, ease: "expo.out", stagger: 0.05, delay });
  return split;
}

/**
 * Dipasang sekali di pembungkus halaman. `key` berganti setiap rute berganti,
 * sehingga animasi lama dibersihkan dan halaman baru mendapat animasinya sendiri.
 */
export function usePageMotion(scope: RefObject<HTMLElement | null>, key: string) {
  useGSAP(() => {
    const root = scope.current;
    if (!root) return;
    const mm = gsap.matchMedia();
    mm.add(MOTION_OK, () => {
      root.querySelectorAll(SPLIT).forEach((el) => splitWords(el));
      const items = gsap.utils.toArray<HTMLElement>(root.querySelectorAll(REVEAL));
      if (!items.length) return;
      gsap.set(items, { opacity: 0, y: 26 });
      ScrollTrigger.batch(items, {
        start: "top 92%",
        once: true,
        onEnter: (batch) => gsap.to(batch, { opacity: 1, y: 0, duration: 0.8, ease: "power3.out", stagger: 0.06, overwrite: true }),
      });
    });
    return () => mm.revert();
  }, { scope, dependencies: [key], revertOnUpdate: true });
}
