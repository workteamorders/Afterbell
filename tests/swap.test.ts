import { describe, expect, it } from "vitest";
import { base64ToBytes, bytesToBase64, explainSimulationError, networkFee, orderProblem } from "../src/lib/swap";

describe("simulation errors in plain language", () => {
  it("returns null when the simulation succeeded", () => {
    expect(explainSimulationError({ err: null, logs: [] })).toBeNull();
  });
  it("explains an expired blockhash", () => {
    const e = explainSimulationError({ err: "BlockhashNotFound", logs: [] });
    expect(e?.what).toMatch(/expired/i);
    expect(e?.safety).toMatch(/nothing was sent/i);
  });
  it("explains missing SOL", () => {
    expect(explainSimulationError({ err: "InsufficientFundsForFee", logs: null })?.what).toMatch(/SOL/);
  });
  it("detects slippage from the logs", () => {
    const e = explainSimulationError({ err: { InstructionError: [3, { Custom: 6001 }] }, logs: ["Program log: Error: Slippage tolerance exceeded"] });
    expect(e?.what).toMatch(/slippage/i);
  });
  it("detects low balance from token program custom error 1", () => {
    const e = explainSimulationError({ err: { InstructionError: [1, { Custom: 1 }] }, logs: [] });
    expect(e?.what).toMatch(/balance is too low/i);
  });
  it("falls back to a safe, specific message", () => {
    const e = explainSimulationError({ err: { InstructionError: [0, "Weird"] }, logs: [] });
    expect(e?.safety).toMatch(/nothing was sent/i);
    expect(e?.next).toBeTruthy();
  });
});

describe("order problems", () => {
  const base = { inputMint: "a", outputMint: "b", inAmount: "1", outAmount: "1" };
  it("accepts an order that has a transaction", () => {
    expect(orderProblem({ ...base, transaction: "AAAA" })).toBeNull();
  });
  it("maps aggregator and JupiterZ error codes", () => {
    expect(orderProblem({ ...base, transaction: "", router: "metis", errorCode: 2 })?.what).toMatch(/SOL/);
    expect(orderProblem({ ...base, transaction: "", router: "jupiterz", errorCode: 2 })?.what).toMatch(/token account/);
    expect(orderProblem({ ...base, transaction: "" })?.what).toMatch(/could not build/i);
  });
});

describe("network fee", () => {
  it("counts signature, priority and rent fees paid by the taker", () => {
    const f = networkFee({ inputMint: "a", outputMint: "b", inAmount: "1", outAmount: "1", signatureFeeLamports: 5000, prioritizationFeeLamports: 1000, rentFeeLamports: 0, signatureFeePayer: "me" }, "me");
    expect(f).toEqual({ lamports: 6000, sponsored: false });
  });
  it("excludes the signature fee when someone else pays it", () => {
    const f = networkFee({ inputMint: "a", outputMint: "b", inAmount: "1", outAmount: "1", signatureFeeLamports: 5000, prioritizationFeeLamports: 1000, signatureFeePayer: "jupiter" }, "me");
    expect(f.sponsored).toBe(true);
    expect(f.lamports).toBe(1000);
  });
});

describe("base64", () => {
  it("round-trips bytes", () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 255]);
    expect(Array.from(base64ToBytes(bytesToBase64(bytes)))).toEqual(Array.from(bytes));
  });
});
