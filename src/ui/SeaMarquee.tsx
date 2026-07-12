import { useEffect, useRef, useState, type RefObject } from "react";

/** footer-sea.svg viewBox — keep aspect; never stretch X independently. */
const SEA_W = 1440;
const SEA_H = 186;
const SEA_ASPECT = SEA_W / SEA_H;

const NEAR_H = 72;
const FAR_H = 56;

/**
 * Seamless infinite strip (classic marquee pattern):
 * - Tile width = height * aspect (same SVG, no non-uniform scale)
 * - copies = ceil(viewport / tileW) + 2  (always cover + wrap slack)
 * - translate by -tileW then wrap — no gap if tiles are edge-adjacent
 * - Do NOT use widthScale≠1 (breaks seam of tiled art)
 *
 * Refs: continuous CSS/JS marquee with duplicated content; modular wrap.
 */

/** Cubic Bezier (CSS-like) for speed envelopes. */
function cubicBezier(
  t: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
  let u = t;
  for (let i = 0; i < 6; i++) {
    const u2 = u * u;
    const u3 = u2 * u;
    const x = 3 * x1 * (u - 2 * u2 + u3) + 3 * x2 * (u2 - u3) + u3;
    const dx =
      3 * x1 * (1 - 4 * u + 3 * u2) + 3 * x2 * (2 * u - 3 * u2) + 3 * u2;
    if (Math.abs(dx) < 1e-6) break;
    u -= (x - t) / dx;
    u = Math.min(1, Math.max(0, u));
  }
  const u2 = u * u;
  const u3 = u2 * u;
  return 3 * y1 * (u - 2 * u2 + u3) + 3 * y2 * (u2 - u3) + u3;
}

function easeInOutCubic(t: number): number {
  return cubicBezier(t, 0.42, 0, 0.58, 1);
}

function easeOutEmphasized(t: number): number {
  return cubicBezier(t, 0.05, 0.7, 0.1, 1);
}

function seaSpeedPxPerSec(
  nowMs: number,
  base: number,
  phase: number,
): number {
  const cycle = 7200;
  const t = ((nowMs / cycle + phase) % 1 + 1) % 1;
  let mul: number;
  if (t < 0.35) {
    const u = t / 0.35;
    mul = 0.55 + 0.2 * easeInOutCubic(u);
  } else if (t < 0.55) {
    const u = (t - 0.35) / 0.2;
    mul = 0.75 + 0.95 * easeInOutCubic(u);
  } else if (t < 0.78) {
    const u = (t - 0.55) / 0.23;
    mul = 1.55 + 0.45 * Math.sin(u * Math.PI);
  } else {
    const u = (t - 0.78) / 0.22;
    mul = 1.7 - 1.15 * easeOutEmphasized(u);
  }
  const ripple = 1 + 0.04 * Math.sin(nowMs / 1100 + phase * Math.PI * 2);
  return base * mul * ripple;
}

function tileWidthForHeight(tileH: number): number {
  return Math.round(tileH * SEA_ASPECT);
}

/** Enough tiles to cover viewport width + 2 for wrap; min 3. */
function copiesForViewport(viewportW: number, tileW: number): number {
  if (tileW <= 0) return 3;
  return Math.max(3, Math.ceil(viewportW / tileW) + 2);
}

function useViewportWidth(): number {
  const [w, setW] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth : 1280,
  );
  useEffect(() => {
    const onResize = () => setW(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return w;
}

function useSeaScroll(
  railRef: RefObject<HTMLDivElement | null>,
  baseSpeed: number,
  phase: number,
  tileH: number,
  reduced: boolean,
) {
  useEffect(() => {
    const rail = railRef.current;
    if (!rail || reduced) return;

    const applyTileSize = () => {
      const w = tileWidthForHeight(tileH);
      const imgs = Array.from(rail.querySelectorAll<HTMLImageElement>("img"));
      for (const img of imgs) {
        img.style.width = `${w}px`;
        img.style.height = `${tileH}px`;
        img.style.margin = "0";
        img.style.padding = "0";
        img.width = w;
        img.height = tileH;
      }
      return w;
    };

    let period = applyTileSize();
    let x = -Math.round(period * 0.08);
    let raf = 0;
    let last = performance.now();

    const onResize = () => {
      period = applyTileSize();
      // keep x in (-period, 0]
      while (x <= -period) x += period;
      while (x > 0) x -= period;
    };
    window.addEventListener("resize", onResize);

    const tick = (now: number) => {
      const dt = Math.min(48, now - last) / 1000;
      last = now;
      const speed = seaSpeedPxPerSec(now, baseSpeed, phase);
      x += speed * dt;
      // modular wrap on one tile width — seamless iff tiles are seamless & adjacent
      if (period > 0) {
        x = ((x % period) + period) % period;
        if (x > 0) x -= period; // keep in (-period, 0]
      }
      rail.style.transform = `translate3d(${x.toFixed(2)}px, 0, 0)`;
      raf = requestAnimationFrame(tick);
    };

    rail.style.transform = `translate3d(${x}px, 0, 0)`;
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, [railRef, baseSpeed, phase, tileH, reduced]);
}

function SeaLayer({
  className,
  baseSpeed,
  phase,
  tileH,
  reduced,
  seaSvg,
  viewportW,
}: {
  className: string;
  baseSpeed: number;
  phase: number;
  tileH: number;
  reduced: boolean;
  seaSvg: string;
  viewportW: number;
}) {
  const railRef = useRef<HTMLDivElement>(null);
  useSeaScroll(railRef, baseSpeed, phase, tileH, reduced);
  const tileW = tileWidthForHeight(tileH);
  const copies = copiesForViewport(viewportW, tileW);

  return (
    <div className={`sea-layer ${className}`}>
      <div className="sea-marquee-rail" ref={railRef}>
        {Array.from({ length: copies }, (_, i) => (
          <img
            key={`${copies}-${i}`}
            className="sea-marquee-img"
            src={seaSvg}
            alt=""
            draggable={false}
            width={tileW}
            height={tileH}
            decoding="async"
            style={{
              width: tileW,
              height: tileH,
              margin: 0,
              padding: 0,
              display: "block",
              flex: "0 0 auto",
            }}
          />
        ))}
      </div>
    </div>
  );
}

/** Soft dual-depth sea footer — seamless strip + eased drift. */
export function SeaMarquee() {
  const seaSvg = `${import.meta.env.BASE_URL}brand/footer-sea.svg`;
  const reduced =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const viewportW = useViewportWidth();

  return (
    <div className="sea-marquee" aria-hidden>
      <SeaLayer
        className="sea-layer-far"
        baseSpeed={-11}
        phase={0.37}
        tileH={FAR_H}
        reduced={reduced}
        seaSvg={seaSvg}
        viewportW={viewportW}
      />
      <SeaLayer
        className="sea-layer-near"
        baseSpeed={20}
        phase={0.0}
        tileH={NEAR_H}
        reduced={reduced}
        seaSvg={seaSvg}
        viewportW={viewportW}
      />
    </div>
  );
}
