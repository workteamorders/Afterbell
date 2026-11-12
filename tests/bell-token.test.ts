import { describe, expect, it } from "vitest";
import { getAddress, isAddress } from "viem";
import { BELL_TOKEN, bellTokenExplorerUrl } from "@/lib/bell-token";

describe("BELL token contract (D-070)", () => {
  it("is a valid EIP-55 address equal to the one given by the owner", () => {
    expect(isAddress(BELL_TOKEN.address, { strict: true })).toBe(true);
    expect(getAddress(BELL_TOKEN.address)).toBe(BELL_TOKEN.address);
    expect(BELL_TOKEN.address.toLowerCase()).toBe("0x94f06e180395185adf2fa518fc8e542111b7aa00");
  });

  it("links to the Robinhood Chain explorer token page", () => {
    expect(bellTokenExplorerUrl()).toBe(`https://robinhoodchain.blockscout.com/token/${BELL_TOKEN.address}`);
  });
});
