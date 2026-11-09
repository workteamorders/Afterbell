import { useId, type ReactNode } from "react";
import { cx } from "@/lib/cx";
import { Contour } from "@/components/brand/Contour";
import { Badge, type BadgeTone } from "./Badge";
import { Skeleton } from "./Skeleton";
import styles from "./LiquidityMeter.module.css";

/**
 * Meter likuiditas ("sounding"): tiga ukuran order (100, 1.000, 10.000 dolar) dengan price impact masing-masing,
 * label Deep / Medium / Thin, dan grafik kecil dengan sumbu berlabel. Ambang label ditulis di /methodology.
 * Komponen ini hanya menyajikan; label dihitung di logika (tahap berikutnya) dan dikirim lewat props.
 */
export type DepthLevel = "deep" | "medium" | "thin";

export interface DepthPoint {
  notionalUsd: number;
  impactPct: number;
}

interface ReadyProps {
  state?: "ready";
  level: DepthLevel;
  points: readonly [DepthPoint, DepthPoint, DepthPoint];
  /** Nama rute dari Jupiter (mis. "JupiterZ RFQ"), karena kedalaman rute RFQ berbeda dari kolam DEX. */
  route: string;
  /** Sumber dan waktu kuotasi, ditampilkan apa adanya. */
  source: string;
  /** Data contoh diberi label jelas. */
  sample?: boolean;
  onRetry?: undefined;
}

interface LoadingProps {
  state: "loading";
}

interface UnavailableProps {
  state: "unavailable";
  retry?: ReactNode;
  /** Sumber kuotasi yang gagal, mis. "Uniswap v4". Bawaan: Jupiter (Solana). */
  quoteSource?: string;
}

type Props = ReadyProps | LoadingProps | UnavailableProps;

const LEVEL: Record<DepthLevel, { label: string; tone: BadgeTone }> = {
  deep: { label: "Deep", tone: "success" },
  medium: { label: "Medium", tone: "warning" },
  thin: { label: "Thin", tone: "danger" },
};

function usd(n: number): string {
  return `$${n.toLocaleString("en-US")}`;
}

function pct(n: number): string {
  return `${n < 1 ? n.toFixed(2) : n.toFixed(1)}%`;
}

const W = 300;
const H = 132;
const PAD = { l: 44, r: 12, t: 24, b: 28 };

function Chart({ points }: { points: readonly [DepthPoint, DepthPoint, DepthPoint] }) {
  const max = Math.max(...points.map((p) => p.impactPct), 0.1);
  const top = max <= 0.5 ? 0.5 : max <= 1 ? 1 : max <= 2 ? 2 : Math.ceil(max);
  const innerW = W - PAD.l - PAD.r;
  const innerH = H - PAD.t - PAD.b;
  const x = (i: number) => PAD.l + (innerW * (i + 0.5)) / 3;
  const y = (v: number) => PAD.t + innerH - (v / top) * innerH;
  const ticks = [0, top / 2, top];
  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${y(p.impactPct).toFixed(1)}`).join("");

  return (
    <svg className={styles.chart} viewBox={`0 0 ${W} ${H}`} role="img" aria-labelledby="lm-chart-title lm-chart-desc">
      <title id="lm-chart-title">Price impact by order size</title>
      <desc id="lm-chart-desc">
        {points.map((p) => `${pct(p.impactPct)} at ${usd(p.notionalUsd)}`).join(", ")}.
      </desc>
      <text x={PAD.l} y={12} className={styles.axisTitle}>
        Price impact (%)
      </text>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} className={styles.grid} />
          <text x={PAD.l - 6} y={y(t) + 4} textAnchor="end" className={styles.tick}>
            {t.toFixed(t < 1 ? 2 : 1)}
          </text>
        </g>
      ))}
      <path d={line} className={styles.curve} />
      {points.map((p, i) => (
        <g key={p.notionalUsd}>
          <circle cx={x(i)} cy={y(p.impactPct)} r={4} className={styles.dot}>
            <title>{`${usd(p.notionalUsd)}: ${pct(p.impactPct)} price impact`}</title>
          </circle>
          <text x={x(i)} y={H - 8} textAnchor="middle" className={styles.tick}>
            {usd(p.notionalUsd)}
          </text>
        </g>
      ))}
    </svg>
  );
}

export function LiquidityMeter(props: Props) {
  const headId = useId();
  if (props.state === "loading") {
    return (
      <section className={cx(styles.meter, styles.loadingMeter)} aria-busy="true" aria-label="Liquidity, loading">
        <div className={styles.head}>
          <Skeleton shape="pill" />
          <Skeleton shape="pill" />
        </div>
        <div className={styles.bands}>
          {[0, 1, 2].map((i) => (
            <div key={i} className={cx(styles.band, styles[`b${i}`])}>
              <Skeleton shape="line" />
              <Skeleton shape="title" />
            </div>
          ))}
        </div>
        <Skeleton shape="block" />
      </section>
    );
  }

  if (props.state === "unavailable") {
    return (
      <section className={styles.meter} aria-label="Liquidity, unavailable">
        <p className={styles.headline}>Liquidity is unavailable right now.</p>
        <p className="muted type-small">
          {props.quoteSource ?? "Jupiter"} did not return quotes. Your funds are not affected and you can still read this page. Try again in a moment.
        </p>
        {props.retry}
      </section>
    );
  }

  const { level, points, route, source, sample } = props;
  const meta = LEVEL[level];
  const first = points[0];
  const last = points[2];

  return (
    <section className={styles.meter} aria-labelledby={headId}>
      <div className={styles.strip} aria-hidden="true">
        <Contour lines={4} seed={2.1} />
      </div>
      <div className={styles.head}>
        <h3 id={headId} className="type-label">
          Liquidity
        </h3>
        <div className={styles.badges}>
          <Badge tone={meta.tone}>{meta.label}</Badge>
          {sample ? <Badge tone="neutral">Example</Badge> : null}
        </div>
      </div>
      <p className={styles.headline}>
        Price impact is {pct(first.impactPct)} at {usd(first.notionalUsd)} and {pct(last.impactPct)} at {usd(last.notionalUsd)}.
      </p>
      <div className={styles.bands}>
        {points.map((p, i) => (
          <div key={p.notionalUsd} className={cx(styles.band, styles[`b${i}`])}>
            <span className={cx(styles.size, "type-num")}>{usd(p.notionalUsd)}</span>
            <span className={cx(styles.impact, "type-num")}>{pct(p.impactPct)}</span>
          </div>
        ))}
      </div>
      <Chart points={points} />
      <p className={cx(styles.foot, "type-note")}>
        Route: {route}. Source: {source}.
      </p>
    </section>
  );
}
