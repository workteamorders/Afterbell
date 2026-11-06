"use client";

import { useEffect, useRef } from "react";
import { contourSegments } from "@/lib/contour";
import styles from "./LiveBackground.module.css";

/**
 * Latar hidup: peta kedalaman (garis kontur) yang mengalir pelan di belakang semua halaman.
 * - Kursor adalah "gunung laut": garis merapat melingkar di sekitarnya dan mengikuti dengan lembut.
 * - Gerakan cepat meninggalkan jejak gelombang yang memudar; klik atau ketuk memancarkan riak.
 * - Scroll menggeser medan sedikit agar terasa hidup.
 * Murni dekoratif (aria-hidden, tidak menangkap pointer). Dengan prefers-reduced-motion hanya satu gambar statis.
 * Menjaga performa: resolusi sel menyesuaikan diri bila bingkai lambat, berhenti saat tab tersembunyi, dan
 * tidak menggambar saat dialog terbuka. Tidak ada pustaka eksternal dan tidak ada permintaan jaringan.
 */
interface Bump {
  x: number;
  y: number;
  amp: number;
  born: number;
  ring: boolean;
}

const LEVELS = 11;
const MAX_BUMPS = 16;
const WAKE_SPACING = 30;

function cssVar(name: string, fallback: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

export function LiveBackground() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    let w = 0;
    let h = 0;
    let dpr = 1;
    let cell = 16;
    let nx = 0;
    let ny = 0;
    let field = new Float32Array(0);
    let lineColor = "#1c6b74";
    let raf = 0;
    let last = 0;
    let ema = 6;
    let started = false;

    const ptr = { x: -9999, y: -9999, sx: -9999, sy: -9999, strength: 0, target: 0, wx: -9999, wy: -9999, moved: 0 };
    const bumps: Bump[] = [];

    const readColors = () => {
      lineColor = cssVar("--contour", "#1c6b74");
    };

    const resize = () => {
      w = window.innerWidth;
      h = window.innerHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      nx = Math.ceil(w / cell);
      ny = Math.ceil(h / cell);
      field = new Float32Array((nx + 1) * (ny + 1));
    };

    const compute = (t: number, scrollY: number, now: number) => {
      const stride = nx + 1;
      // Gelombang: pilih yang masih hidup.
      for (let k = bumps.length - 1; k >= 0; k--) {
        const b = bumps[k]!;
        if (now - b.born > (b.ring ? 2200 : 1400)) bumps.splice(k, 1);
      }
      const cx = ptr.sx;
      const cy = ptr.sy;
      const peak = 0.95 * ptr.strength;
      const two = 2 * 135 * 135;
      for (let j = 0; j <= ny; j++) {
        const y = j * cell;
        const yy = y + scrollY * 0.22;
        for (let i = 0; i <= nx; i++) {
          const x = i * cell;
          // Medan dasar: tiga gelombang yang saling membelit, pelan.
          let v =
            Math.sin(x * 0.0062 + t * 0.00022 + Math.sin(yy * 0.0041 + t * 0.00013) * 1.7) * 0.5 +
            Math.sin(yy * 0.0072 - t * 0.00017 + Math.sin(x * 0.0036 - t * 0.0001) * 1.3) * 0.35 +
            Math.sin((x + yy) * 0.0043 + t * 0.00011) * 0.25;
          // Kursor: gunung laut yang halus.
          if (peak > 0.001) {
            const dx = x - cx;
            const dy = y - cy;
            v += peak * Math.exp(-(dx * dx + dy * dy) / two);
          }
          for (let k = 0; k < bumps.length; k++) {
            const b = bumps[k]!;
            const age = now - b.born;
            const dx = x - b.x;
            const dy = y - b.y;
            const d2 = dx * dx + dy * dy;
            if (b.ring) {
              const d = Math.sqrt(d2);
              const r = age * 0.34;
              const e = d - r;
              v += b.amp * Math.exp(-age / 1300) * Math.exp(-(e * e) / (2 * 36 * 36));
            } else {
              v += b.amp * Math.exp(-age / 650) * Math.exp(-d2 / (2 * 75 * 75));
            }
          }
          field[j * stride + i] = v;
        }
      }
    };

    const draw = () => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.strokeStyle = lineColor;
      for (let L = 0; L < LEVELS; L++) {
        const level = -1.05 + (L * 2.1) / (LEVELS - 1);
        const index = L % 5 === 0; // kontur indeks lebih tebal, seperti di peta laut
        ctx.globalAlpha = index ? 0.4 : 0.22;
        ctx.lineWidth = index ? 1.4 : 0.9;
        ctx.beginPath();
        contourSegments(field, nx, ny, cell, level, (x1, y1, x2, y2) => {
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
        });
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    };

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (now - last < 15) return;
      const dt = now - last;
      last = now;
      // Dialog terbuka: latar tertutup scrim, hemat tenaga.
      if (document.body.classList.contains("scroll-locked")) return;
      // Kursor mengikuti dengan lembut; kekuatan naik dan turun mulus.
      const k = 1 - Math.exp(-dt / 90);
      if (ptr.sx < -9000) {
        ptr.sx = ptr.x;
        ptr.sy = ptr.y;
      } else {
        ptr.sx += (ptr.x - ptr.sx) * k;
        ptr.sy += (ptr.y - ptr.sy) * k;
      }
      ptr.strength += (ptr.target - ptr.strength) * (1 - Math.exp(-dt / 220));
      const t0 = performance.now();
      compute(now, window.scrollY, now);
      draw();
      const cost = performance.now() - t0;
      ema = ema * 0.9 + cost * 0.1;
      // Bila lambat, sel dibuat lebih kasar (garis tetap halus karena interpolasi).
      if (ema > 9 && cell < 32) {
        cell += 4;
        ema = 5;
        resize();
      }
    };

    const onMove = (e: PointerEvent) => {
      ptr.x = e.clientX;
      ptr.y = e.clientY;
      ptr.target = 1;
      const dx = e.clientX - ptr.wx;
      const dy = e.clientY - ptr.wy;
      if (ptr.wx < -9000 || dx * dx + dy * dy > WAKE_SPACING * WAKE_SPACING) {
        if (ptr.wx > -9000) {
          bumps.push({ x: e.clientX, y: e.clientY, amp: 0.45, born: performance.now(), ring: false });
          if (bumps.length > MAX_BUMPS) bumps.shift();
        }
        ptr.wx = e.clientX;
        ptr.wy = e.clientY;
      }
    };
    const onDown = (e: PointerEvent) => {
      ptr.x = e.clientX;
      ptr.y = e.clientY;
      ptr.target = 1;
      bumps.push({ x: e.clientX, y: e.clientY, amp: 0.75, born: performance.now(), ring: true });
      if (bumps.length > MAX_BUMPS) bumps.shift();
    };
    const onLeave = () => {
      ptr.target = 0;
      ptr.wx = -9999;
    };

    let resizeTimer = 0;
    const onResize = () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        resize();
        if (reduce.matches) {
          compute(0, 0, 0);
          draw();
        }
      }, 120);
    };

    const stop = () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
      document.documentElement.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("blur", onLeave);
    };

    const start = () => {
      stop();
      readColors();
      resize();
      if (reduce.matches) {
        // Satu gambar statis, tanpa gerak dan tanpa reaksi kursor.
        compute(0, 0, 0);
        draw();
        return;
      }
      window.addEventListener("pointermove", onMove, { passive: true });
      window.addEventListener("pointerdown", onDown, { passive: true });
      document.documentElement.addEventListener("pointerleave", onLeave);
      window.addEventListener("blur", onLeave);
      last = performance.now();
      raf = requestAnimationFrame(frame);
    };

    // Mulai setelah cat pertama agar tidak menunda konten.
    const begin = () => {
      if (started) return;
      started = true;
      start();
    };
    const idle = (window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
    const idleHandle = idle ? idle(begin, { timeout: 1200 }) : window.setTimeout(begin, 300);

    const onTheme = () => {
      readColors();
      if (reduce.matches && started) {
        compute(0, 0, 0);
        draw();
      }
    };
    const mo = new MutationObserver(onTheme);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    const scheme = window.matchMedia("(prefers-color-scheme: dark)");
    scheme.addEventListener("change", onTheme);
    reduce.addEventListener("change", start);
    window.addEventListener("resize", onResize);

    return () => {
      if (idle) (window as unknown as { cancelIdleCallback?: (h: number) => void }).cancelIdleCallback?.(idleHandle);
      else window.clearTimeout(idleHandle);
      window.clearTimeout(resizeTimer);
      stop();
      mo.disconnect();
      scheme.removeEventListener("change", onTheme);
      reduce.removeEventListener("change", start);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return <canvas ref={ref} className={styles.canvas} aria-hidden="true" />;
}
