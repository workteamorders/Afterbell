import { cx } from "@/lib/cx";
import styles from "./Contour.module.css";

/**
 * Motif khas Afterbell: garis kontur kedalaman. Dekoratif, statis, dibuat deterministik
 * (tanpa Math.random) agar render server dan klien identik. Dipakai hemat: hero, meter likuiditas,
 * keadaan kosong, 404, perayaan swap.
 */
const WIDTH = 600;
const HEIGHT = 200;

function buildPaths(lines: number, seed: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < lines; i++) {
    const base = 14 + (i * (HEIGHT - 28)) / Math.max(lines - 1, 1);
    const amp = 6 + i * 1.6;
    const phase = seed + i * 0.55;
    let d = "";
    for (let x = 0; x <= WIDTH; x += 10) {
      const y = base + amp * Math.sin(x / 78 + phase) + (amp / 2.4) * Math.sin(x / 31 + phase * 1.7);
      d += `${x === 0 ? "M" : "L"}${x} ${y.toFixed(1)}`;
    }
    out.push(d);
  }
  return out;
}

interface ContourProps {
  lines?: number;
  seed?: number;
  className?: string;
}

export function Contour({ lines = 8, seed = 0.6, className }: ContourProps) {
  const paths = buildPaths(lines, seed);
  return (
    <svg
      className={cx(styles.contour, className)}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
    >
      {paths.map((d, i) => (
        <path key={i} d={d} vectorEffect="non-scaling-stroke" />
      ))}
    </svg>
  );
}
