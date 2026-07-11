import { useEffect, useRef, type RefObject } from "react";

/** footer-sea.svg viewBox */
const SEA_W = 1440;
const SEA_H = 186;
const SEA_ASPECT = SEA_W / SEA_H;

/**
 * Compact island sea (animal-island Footer is 80px).
 * Near tile shows boats; far is a soft higher ghost for depth.
 */
const NEAR_H = 72;
const FAR_H = 56;

function useSeaScroll(
  railRef: RefObject<HTMLDivElement | null>,
  speed: number,
  tileH: number,
  reduced: boolean,
) {
  useEffect(() => {
    const rail = railRef.current;
    if (!rail || reduced) return;

    const tileW = Math.round(tileH * SEA_ASPECT);
    const imgs = Array.from(rail.querySelectorAll<HTMLImageElement>("img"));
    for (const img of imgs) {
      img.style.width = `${tileW}px`;
      img.style.height = `${tileH}px`;
      img.width = tileW;
      img.height = tileH;
    }

    let x = 0;
    let raf = 0;
    let last = performance.now();
    const period = tileW;

    const tick = (now: number) => {
      const dt = Math.min(48, now - last) / 1000;
      last = now;
      x += speed * dt;
      while (x <= -period) x += period;
      while (x > 0) x -= period;
      rail.style.transform = `translate3d(${x}px, 0, 0)`;
      raf = requestAnimationFrame(tick);
    };

    x = -Math.round(period * 0.08);
    rail.style.transform = `translate3d(${x}px, 0, 0)`;
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [railRef, speed, tileH, reduced]);
}

function SeaLayer({
  className,
  speed,
  tileH,
  reduced,
  seaSvg,
}: {
  className: string;
  speed: number;
  tileH: number;
  reduced: boolean;
  seaSvg: string;
}) {
  const railRef = useRef<HTMLDivElement>(null);
  useSeaScroll(railRef, speed, tileH, reduced);
  const tileW = Math.round(tileH * SEA_ASPECT);

  return (
    <div className={`sea-layer ${className}`}>
      <div className="sea-marquee-rail" ref={railRef}>
        {[0, 1, 2].map((i) => (
          <img
            key={i}
            className="sea-marquee-img"
            src={seaSvg}
            alt=""
            draggable={false}
            width={tileW}
            height={tileH}
            style={{ width: tileW, height: tileH }}
          />
        ))}
      </div>
    </div>
  );
}

/** Soft dual-depth sea footer — compact, light, seamless. */
export function SeaMarquee() {
  const seaSvg = `${import.meta.env.BASE_URL}brand/footer-sea.svg`;
  const reduced =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  return (
    <div className="sea-marquee" aria-hidden>
      {/* far: slower opposite, sits a bit higher, soft ghost */}
      <SeaLayer
        className="sea-layer-far"
        speed={-10}
        tileH={FAR_H}
        reduced={reduced}
        seaSvg={seaSvg}
      />
      {/* near: main art, boats visible, drifts right */}
      <SeaLayer
        className="sea-layer-near"
        speed={22}
        tileH={NEAR_H}
        reduced={reduced}
        seaSvg={seaSvg}
      />
    </div>
  );
}
