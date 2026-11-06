"use client";

import { useEffect, useState } from "react";
import { cx } from "@/lib/cx";
import { contrast } from "@/lib/contrast";
import { Contour } from "@/components/brand/Contour";
import { Logo } from "@/components/brand/Logo";
import { Ripple } from "@/components/brand/Ripple";
import { Icon, type IconName } from "@/components/icons/Icon";
import { Button } from "@/components/ui/Button";
import { Group, Row, Section, Specimen } from "./Section";
import styles from "./Styleguide.module.css";

/** Membaca nilai token yang sedang berlaku (mengikuti tema), supaya swatch dan rasio selalu akurat. */
function useTokenValues(names: readonly string[]): Record<string, string> {
  const [values, setValues] = useState<Record<string, string>>({});
  useEffect(() => {
    const read = () => {
      const cs = getComputedStyle(document.documentElement);
      const next: Record<string, string> = {};
      for (const n of names) next[n] = cs.getPropertyValue(`--${n}`).trim();
      setValues(next);
    };
    read();
    const mo = new MutationObserver(read);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", read);
    return () => {
      mo.disconnect();
      mq.removeEventListener("change", read);
    };
    // names adalah konstanta modul
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return values;
}

interface SwatchDef {
  token: string;
  role: string;
  /** Latar pasangan untuk rasio kontras, dan ambang yang berlaku. */
  against: string;
  min: 3 | 4.5;
}

const GROUPS: ReadonlyArray<{ title: string; note: string; items: readonly SwatchDef[] }> = [
  {
    title: "Surface",
    note: "Three depths of tint. Layers are separated by tone, not by shadow.",
    items: [
      { token: "surface", role: "Base, page", against: "text", min: 4.5 },
      { token: "surface-2", role: "Raised panels, table hover", against: "text", min: 4.5 },
      { token: "surface-3", role: "Selected, deepest band", against: "text", min: 4.5 },
    ],
  },
  {
    title: "Text",
    note: "Measured against the base surface.",
    items: [
      { token: "text", role: "Primary text", against: "surface", min: 4.5 },
      { token: "text-muted", role: "Secondary text, placeholders", against: "surface", min: 4.5 },
    ],
  },
  {
    title: "Accent",
    note: "Marks the single most important action on a screen. Roughly 5 to 10 percent of any view.",
    items: [
      { token: "accent", role: "Primary action, focus ring", against: "surface", min: 3 },
      { token: "accent-hover", role: "Primary, hover", against: "on-accent", min: 4.5 },
      { token: "accent-active", role: "Primary, pressed", against: "on-accent", min: 4.5 },
      { token: "on-accent", role: "Text on accent", against: "accent", min: 4.5 },
      { token: "contour", role: "Links, chart line, contour motif", against: "surface", min: 4.5 },
    ],
  },
  {
    title: "Status",
    note: "Always paired with an icon and a word, never colour alone.",
    items: [
      { token: "success", role: "Success text", against: "success-bg", min: 4.5 },
      { token: "warning", role: "Warning text", against: "warning-bg", min: 4.5 },
      { token: "danger", role: "Error text and border", against: "danger-bg", min: 4.5 },
      { token: "info", role: "Information text", against: "info-bg", min: 4.5 },
      { token: "success-bg", role: "Success tint", against: "text", min: 4.5 },
      { token: "warning-bg", role: "Warning tint", against: "text", min: 4.5 },
      { token: "danger-bg", role: "Error tint", against: "text", min: 4.5 },
      { token: "info-bg", role: "Information tint", against: "text", min: 4.5 },
    ],
  },
  {
    title: "Lines",
    note: "Component boundaries need 3:1. Soft lines only divide and are decorative.",
    items: [
      { token: "line", role: "Input and control boundary", against: "surface", min: 3 },
      { token: "line-soft", role: "Dividers (decorative)", against: "surface", min: 3 },
      { token: "focus", role: "Keyboard focus ring", against: "surface", min: 3 },
    ],
  },
];

const ALL_TOKENS = GROUPS.flatMap((g) => g.items.flatMap((i) => [i.token, i.against]));

export function ColourSection() {
  const v = useTokenValues(ALL_TOKENS);
  return (
    <Section
      id="colour"
      title="Colour"
      intro="Two full palettes, chart paper by day and chart at night. Use the theme switch in the header to compare. Ratios below are measured live from the active theme."
    >
      {GROUPS.map((g) => (
        <Group key={g.title} title={g.title} note={g.note}>
          <div className={styles.grid}>
            {g.items.map((it) => {
              const fg = v[it.token];
              const bg = v[it.against];
              const ratio = fg && bg ? contrast(fg, bg) : null;
              const decorative = it.token === "line-soft";
              const ok = ratio !== null && ratio >= it.min;
              return (
                <div key={it.token} className={styles.swatch}>
                  <div className={styles.swatchColor} style={{ background: `var(--${it.token})` }} aria-hidden="true" />
                  <div className={styles.swatchBody}>
                    <span className={styles.swatchName}>--{it.token}</span>
                    <span className="type-num muted">{fg || "…"}</span>
                    <span className="muted">{it.role}</span>
                    <span className={cx(styles.pass, "type-num")}>
                      {ratio === null ? (
                        "…"
                      ) : decorative ? (
                        <>
                          <Icon name="info" size={16} style={{ flexShrink: 0 }} />
                          <span>{ratio.toFixed(2)}:1 · decorative</span>
                        </>
                      ) : (
                        <>
                          <Icon name={ok ? "check" : "x"} size={16} style={{ flexShrink: 0 }} />
                          <span>{ratio.toFixed(2)}:1 · needs {it.min}:1 vs --{it.against}</span>
                        </>
                      )}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </Group>
      ))}
    </Section>
  );
}

const TYPE_ROWS: ReadonlyArray<{ cls: string; name: string; meta: string; sample: string }> = [
  { cls: "type-display", name: "Display", meta: "Archivo 500, width 118%, clamp 36 to 60px, line 1.05", sample: "What you hold, and how deep it goes" },
  { cls: "type-h1", name: "Heading 1", meta: "Archivo 500, width 118%, clamp 28 to 44px, line 1.15", sample: "Tesla xStock" },
  { cls: "type-h2", name: "Heading 2", meta: "Archivo 500, width 118%, clamp 24 to 32px, line 1.15", sample: "Holder rights" },
  { cls: "type-h3", name: "Heading 3", meta: "Archivo 500, width 108%, 20px, line 1.35", sample: "Redemption path" },
  { cls: "type-body", name: "Body", meta: "Archivo 400, 16px, line 1.6, measure 68ch", sample: "Issuer documents describe this token as a debt instrument. It gives economic exposure to the stock and no shareholder rights." },
  { cls: "type-small", name: "Small", meta: "Archivo 400, 14px, line 1.5", sample: "Checked 4 Nov 2026 against the issuer prospectus." },
  { cls: "type-label", name: "Label", meta: "Archivo 500, width 87%, 12px, uppercase, tracking 0.06em", sample: "Last checked" },
  { cls: "type-note", name: "Note", meta: "Archivo italic 400, 14px, muted. For annotations, like marginal notes on a chart", sample: "Source: Jupiter quote, 14:05 UTC." },
  { cls: "type-num", name: "Numbers", meta: "Red Hat Mono, tabular, slashed zero. For amounts, addresses, hashes", sample: "1,005.00 USDC  0.0312%  XsDoVf…zoB" },
];

export function TypographySection() {
  return (
    <Section
      id="typography"
      title="Typography"
      intro="Two families. Archivo is variable on weight and width: expanded for headings, normal for text, semi-condensed for labels and tables. Red Hat Mono carries numbers. Both are self-hosted and subset to Latin."
    >
      <Group title="Scale" note="12, 14, 16, 20, 24, 32, 44, 60. Headings fluid between steps with clamp().">
        <div className={styles.typeList}>
          {TYPE_ROWS.map((r) => (
            <div key={r.cls} className={styles.typeRow}>
              <span className={cx(styles.typeMeta, "type-num")}>
                {r.name} · {r.meta}
              </span>
              <p className={r.cls}>{r.sample}</p>
            </div>
          ))}
        </div>
      </Group>
      <Group title="Width axis" note="One font file, five widths. Width carries hierarchy so no third family is needed.">
        <div className={styles.widths}>
          <span className={styles.w75}>Liquidity 75%</span>
          <span className={styles.w87}>Liquidity 87%</span>
          <span className={styles.w100}>Liquidity 100%</span>
          <span className={styles.w118}>Liquidity 118%</span>
          <span className={styles.w125}>Liquidity 125%</span>
        </div>
      </Group>
    </Section>
  );
}

const SPACE: ReadonlyArray<{ name: string; px: number }> = [
  { name: "space-1", px: 4 },
  { name: "space-2", px: 8 },
  { name: "space-3", px: 12 },
  { name: "space-4", px: 16 },
  { name: "space-6", px: 24 },
  { name: "space-8", px: 32 },
  { name: "space-12", px: 48 },
  { name: "space-16", px: 64 },
  { name: "space-24", px: 96 },
];

export function ShapeSection() {
  const [play, setPlay] = useState(0);
  return (
    <Section
      id="shape"
      title="Space, shape, elevation"
      intro="One shape language: 4px corners, 1px hairlines, tint-on-tint layers. Three elevations only. Spacing is a multiple of 4."
    >
      <Group title="Spacing" note="Three rhythms: tight 8, mid 24, wide 64.">
        <div className={styles.spaceList}>
          {SPACE.map((s) => (
            <div key={s.name} className={styles.spaceRow}>
              <span className="type-num">
                {s.px}px
              </span>
              <span className={styles.spaceBar} style={{ width: `var(--${s.name})` }} />
            </div>
          ))}
        </div>
      </Group>

      <Group title="Elevation" note="Flat, raised, floating. Only dialogs, sheets, popovers, and toasts float.">
        <Row>
          <Specimen caption="0 flat · --surface">
            <div className={cx(styles.elev, styles.elev0)}>Page</div>
          </Specimen>
          <Specimen caption="1 raised · --surface-2 + hairline">
            <div className={cx(styles.elev, styles.elev1)}>Panel</div>
          </Specimen>
          <Specimen caption="2 floating · line + soft shadow">
            <div className={cx(styles.elev, styles.elev2)}>Dialog</div>
          </Specimen>
        </Row>
      </Group>

      <Group title="Stroke and radius">
        <Row>
          <Specimen caption="radius 4px · stroke 1px">
            <div className={styles.radiusBox} />
          </Specimen>
        </Row>
      </Group>

      <Group title="Motion" note="One character: settling water. Ease-out, no bounce. Only transform and opacity move.">
        <Row>
          <Specimen caption="micro 120ms · element 200ms · panel 320ms" wide>
            <div className={styles.stack}>
              <div className={styles.motionTrack} aria-hidden="true">
                <span key={play} className={styles.motionDot} />
              </div>
              <Button size="sm" icon="refresh" onClick={() => setPlay((n) => n + 1)}>
                Replay motion
              </Button>
            </div>
          </Specimen>
        </Row>
      </Group>
    </Section>
  );
}

const ICONS: readonly IconName[] = [
  "check", "x", "alert", "info", "arrow-right", "chevron-down", "external", "copy", "menu", "sun", "moon", "wallet",
  "search", "clock", "refresh", "lock", "plus", "minus", "wave",
];

export function MotifSection() {
  const [ripple, setRipple] = useState(0);
  return (
    <Section
      id="motif"
      title="Identity: contour"
      intro="The depth contour is the one motif, used in four places: the home hero, the liquidity meter, empty states and 404, and the swap celebration. It is always decorative and never carries information."
    >
      <Group title="Logo">
        <Row>
          <Specimen caption="mark + word">
            <Logo />
          </Specimen>
        </Row>
      </Group>
      <Group title="Contour field">
        <div style={{ height: "10rem" }}>
          <Contour lines={9} seed={0.8} />
        </div>
      </Group>
      <Group title="Celebration" note="Skippable. With reduced motion, the ripple becomes a 300ms fade.">
        <div className={styles.stack}>
          <div className={styles.celebrate}>
            <Ripple playKey={ripple} />
            <span className="type-h3">Swap confirmed</span>
          </div>
          <Button size="sm" icon="refresh" onClick={() => setRipple((n) => n + 1)}>
            Replay celebration
          </Button>
        </div>
      </Group>
      <Group title="Icons" note="One family: 1.5px stroke, round caps and joins, 24px grid. Drawn in code.">
        <Row>
          {ICONS.map((n) => (
            <Specimen key={n} caption={n}>
              <Icon name={n} size={24} />
            </Specimen>
          ))}
        </Row>
      </Group>
    </Section>
  );
}
