import { describe, expect, it } from "vitest";
import { contourSegments } from "../src/lib/contour";

function grid(nx: number, ny: number, f: (x: number, y: number) => number): Float32Array {
  const out = new Float32Array((nx + 1) * (ny + 1));
  for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) out[j * (nx + 1) + i] = f(i, j);
  return out;
}
const collect = (field: Float32Array, nx: number, ny: number, cell: number, level: number) => {
  const segs: number[][] = [];
  contourSegments(field, nx, ny, cell, level, (a, b, c, d) => segs.push([a, b, c, d]));
  return segs;
};

describe("contourSegments", () => {
  it("draws nothing when the whole field is on one side of the level", () => {
    expect(collect(grid(4, 4, () => 1), 4, 4, 10, 0.5)).toHaveLength(0);
    expect(collect(grid(4, 4, () => 0), 4, 4, 10, 0.5)).toHaveLength(0);
  });
  it("a vertical ramp gives a straight vertical line at the interpolated x", () => {
    // f = x, nivel 2.5 dengan sel 10px: garis di x = 25 px.
    const segs = collect(grid(5, 3, (x) => x), 5, 3, 10, 2.5);
    expect(segs).toHaveLength(3);
    for (const [x1, , x2] of segs) {
      expect(x1).toBeCloseTo(25, 5);
      expect(x2).toBeCloseTo(25, 5);
    }
  });
  it("a horizontal ramp gives a horizontal line", () => {
    const segs = collect(grid(3, 5, (_x, y) => y), 3, 5, 10, 1.5);
    expect(segs).toHaveLength(3);
    for (const [, y1, , y2] of segs) {
      expect(y1).toBeCloseTo(15, 5);
      expect(y2).toBeCloseTo(15, 5);
    }
  });
  it("a single peak gives a closed loop (every segment touches two others)", () => {
    const f = grid(12, 12, (x, y) => Math.exp(-((x - 6) ** 2 + (y - 6) ** 2) / 8));
    const segs = collect(f, 12, 12, 10, 0.5);
    expect(segs.length).toBeGreaterThan(8);
    const key = (x: number, y: number) => `${x.toFixed(3)},${y.toFixed(3)}`;
    const count = new Map<string, number>();
    for (const [x1, y1, x2, y2] of segs) {
      count.set(key(x1!, y1!), (count.get(key(x1!, y1!)) ?? 0) + 1);
      count.set(key(x2!, y2!), (count.get(key(x2!, y2!)) ?? 0) + 1);
    }
    for (const n of count.values()) expect(n).toBe(2);
  });
  it("resolves a saddle without crossing segments", () => {
    // 2x2 titik: a=1 b=0 / d=0 c=1 (kasus 10), tengah rendah dan tinggi harus menghasilkan dua ruas.
    const field = new Float32Array([1, 0, 0, 1]);
    expect(collect(field, 1, 1, 10, 0.5)).toHaveLength(2);
    const field2 = new Float32Array([0, 1, 1, 0]);
    expect(collect(field2, 1, 1, 10, 0.5)).toHaveLength(2);
  });
});
