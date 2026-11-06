import { describe, expect, it } from "vitest";
import { firstSignature } from "../src/lib/swap";

describe("firstSignature", () => {
  it("reads the first 64-byte signature after the compact-u16 count", () => {
    const sig = new Uint8Array(64).fill(1);
    const tx = new Uint8Array([1, ...sig, 0, 0, 0]);
    expect(firstSignature(tx)).toMatch(/^[1-9A-HJ-NP-Za-km-z]{43,88}$/);
  });
  it("returns null for empty, truncated, or all-zero signatures", () => {
    expect(firstSignature(new Uint8Array([]))).toBeNull();
    expect(firstSignature(new Uint8Array([1, 2, 3]))).toBeNull();
    expect(firstSignature(new Uint8Array([1, ...new Uint8Array(64), 9]))).toBeNull();
    expect(firstSignature(new Uint8Array([0]))).toBeNull();
  });
});

import { getBase58Decoder } from "@solana/kit";
import { base58Encode } from "../src/lib/swap";

describe("base58Encode", () => {
  it("cocok dengan @solana/kit untuk byte acak, nol di depan, dan kosong", () => {
    const cases: Uint8Array[] = [new Uint8Array([]), new Uint8Array([0]), new Uint8Array([0, 0, 1]), new Uint8Array(64).fill(255)];
    for (let i = 0; i < 50; i++) cases.push(Uint8Array.from({ length: 64 }, (_, j) => (i * 37 + j * 91 + (j % 5 === 0 ? 0 : 3)) % 256));
    cases.push(Uint8Array.from({ length: 64 }, (_, j) => (j < 3 ? 0 : j * 7 + 1) % 256));
    const dec = getBase58Decoder();
    for (const c of cases) expect(base58Encode(c)).toBe(dec.decode(c));
  });
});
