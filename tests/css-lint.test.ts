import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** Semua nilai visual berasal dari token. CSS komponen tidak boleh memuat warna mentah. */
function cssFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return cssFiles(p);
    return p.endsWith(".css") && !p.endsWith("tokens.css") ? [p] : [];
  });
}

const FILES = cssFiles(join(process.cwd(), "src"));
const RAW_COLOUR = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/;

describe("component CSS", () => {
  it("finds stylesheets to lint", () => {
    expect(FILES.length).toBeGreaterThan(10);
  });

  for (const file of FILES) {
    const rel = file.replace(process.cwd() + "/", "");
    const css = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

    it(`${rel} has no raw colours`, () => {
      const lines = css.split("\n").filter((l) => RAW_COLOUR.test(l) && !l.includes("var(--"));
      // Boleh: rgb() di dalam definisi bayangan yang memang memakai var; selain itu tidak.
      expect(lines).toEqual([]);
    });

    it(`${rel} has no shadows outside floating layers`, () => {
      const floating = /Dialog|Toast|Tooltip|Styleguide/.test(rel);
      if (floating) return;
      // Cincin 0 blur (garis tambahan, mis. fokus) diperbolehkan; bayangan lembut tidak.
      const soft = css.split("\n").filter((l) => /box-shadow:/.test(l) && !/box-shadow:\s*(inset\s+)?0 0 0 /.test(l) && !/none/.test(l));
      expect(soft).toEqual([]);
    });
  }
});
