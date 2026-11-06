import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { contrast } from "@/lib/contrast";

/**
 * Uji kontras WCAG 2.2 AA untuk semua pasangan token yang dipakai komponen.
 * Membaca src/styles/tokens.css langsung, jadi mengubah token tanpa memeriksa kontras akan gagal di sini.
 */

const css = readFileSync(new URL("../src/styles/tokens.css", import.meta.url), "utf8");

type Tokens = Record<string, string>;

function parseBlock(body: string): Tokens {
  const out: Tokens = {};
  for (const m of body.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) {
    const name = m[1];
    const value = m[2];
    if (name && value) out[name] = value.toLowerCase();
  }
  return out;
}

function blockAfter(marker: string): string {
  const start = css.indexOf(marker);
  if (start < 0) throw new Error(`Blok tidak ditemukan: ${marker}`);
  const open = css.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === "{") depth++;
    if (css[i] === "}") {
      depth--;
      if (depth === 0) return css.slice(open + 1, i);
    }
  }
  throw new Error("Blok tidak ditutup");
}

const light = parseBlock(blockAfter(":root {"));
const dark = parseBlock(blockAfter(':root[data-theme="dark"]'));
const darkMedia = parseBlock(blockAfter(':root:not([data-theme="light"])'));

const surfaces = ["surface", "surface-2", "surface-3"] as const;
const textRoles = ["text", "text-muted", "accent", "contour", "success", "danger", "warning", "info"] as const;
const statusPairs = [
  ["success", "success-bg"],
  ["danger", "danger-bg"],
  ["warning", "warning-bg"],
  ["info", "info-bg"],
] as const;

describe.each([
  ["terang", light],
  ["gelap", dark],
])("kontras mode %s", (_name, t) => {
  const get = (k: string): string => {
    const v = t[k];
    if (!v) throw new Error(`Token hilang: --${k}`);
    return v;
  };

  for (const s of surfaces) {
    for (const r of textRoles) {
      it(`teks --${r} di atas --${s} >= 4.5:1`, () => {
        expect(contrast(get(r), get(s))).toBeGreaterThanOrEqual(4.5);
      });
    }
  }

  for (const [fg, bg] of statusPairs) {
    it(`--${fg} di atas --${bg} >= 4.5:1`, () => {
      expect(contrast(get(fg), get(bg))).toBeGreaterThanOrEqual(4.5);
    });
    it(`--${bg} terbaca di atas --surface (teks --text di atasnya >= 4.5:1)`, () => {
      expect(contrast(get("text"), get(bg))).toBeGreaterThanOrEqual(4.5);
    });
  }

  for (const a of ["accent", "accent-hover", "accent-active"]) {
    it(`--on-accent di atas --${a} >= 4.5:1`, () => {
      expect(contrast(get("on-accent"), get(a))).toBeGreaterThanOrEqual(4.5);
    });
  }

  for (const s of ["surface", "surface-2"] as const) {
    it(`batas komponen --line di atas --${s} >= 3:1`, () => {
      expect(contrast(get("line"), get(s))).toBeGreaterThanOrEqual(3);
    });
  }

  for (const s of surfaces) {
    it(`cincin fokus --focus di atas --${s} >= 3:1`, () => {
      expect(contrast(get("focus"), get(s))).toBeGreaterThanOrEqual(3);
    });
  }

  it("tombol utama: --accent terhadap --surface >= 3:1", () => {
    expect(contrast(get("accent"), get("surface"))).toBeGreaterThanOrEqual(3);
  });
});

describe("mode gelap lewat media query identik dengan [data-theme=dark]", () => {
  it("nilai token sama", () => {
    for (const [k, v] of Object.entries(dark)) {
      if (k === "scrim") continue;
      expect(darkMedia[k], `--${k}`).toBe(v);
    }
  });
});
