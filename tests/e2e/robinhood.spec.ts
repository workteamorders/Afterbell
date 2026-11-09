import { expect, test, type Page } from "@playwright/test";
import { decodeFunctionData } from "viem";
import { erc20Abi, permit2Abi } from "../../src/lib/evm/abi";
import { EVM_CHAINS } from "../../src/lib/evm/chains";
import { installFakeEvmWallet } from "./evm";
import { mockRobinhoodNetwork, type RhMockOptions } from "./robinhood";

const RH = EVM_CHAINS.robinhood;
const PAGE = "/e/robinhood/SPY";

async function setup(page: Page, mockOpts: RhMockOptions = {}, walletOpts: { reject?: boolean; chainId?: string; unknownChains?: string[] } = {}) {
  const mock = await mockRobinhoodNetwork(page, mockOpts);
  const sent = await installFakeEvmWallet(page, mock, { chainId: "0x1237", ...walletOpts });
  await page.addInitScript(() => localStorage.setItem("ab-risk-ack-v1", "1"));
  return { ...mock, sent };
}
const panelConnect = (page: Page) => page.getByRole("region", { name: /on Robinhood Chain/ }).getByRole("button", { name: "Connect wallet" });
async function connect(page: Page) {
  await panelConnect(page).click();
  await page.getByRole("button", { name: /Test EVM Wallet/ }).click();
  await expect(page.getByRole("button", { name: /Review buy of SPY/ })).toBeVisible();
}
const hasMethod = (calls: { method: string }[], m: string) => calls.some((c) => c.method === m);

test.describe("Robinhood Chain browsing", () => {
  test("token page shows the contract, its official source, the issuer limits and v4 quotes", async ({ page }) => {
    await mockRobinhoodNetwork(page);
    await page.goto(PAGE);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("SPY");
    await expect(page.getByText("0x117cc2133c37B721F49dE2A7a74833232B3B4C0C").first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Robinhood Stock Token API (/rhj/assets)" })).toHaveAttribute("href", "https://api.robinhood.com/rhj/assets");
    await expect(page.getByText("Independent of Robinhood")).toBeVisible();
    await expect(page.getByText(/cannot be offered or sold to US persons/).first()).toBeVisible();
    await expect(page.getByText("Uniswap v4 quotes on Robinhood Chain")).toBeVisible();
    await expect(page.getByText(/Stock Token for SPY on Robinhood Chain/)).toBeVisible();
  });

  test("explore lists Robinhood Chain rows and filters by network", async ({ page }) => {
    await mockRobinhoodNetwork(page);
    await page.goto("/explore");
    await page.getByRole("button", { name: "Robinhood Chain", exact: true }).click();
    await expect(page.getByRole("link", { name: /^SPY SPDR/ })).toHaveAttribute("href", "/e/robinhood/SPY");
    await expect(page.getByRole("link", { name: /TSLAx/ })).toHaveCount(0);
  });

  test("unknown Robinhood Chain token and the bare chain path show the 404 page", async ({ page }) => {
    expect((await page.goto("/e/robinhood/NOPE"))?.status()).toBe(404);
    expect((await page.goto("/e/robinhood"))?.status()).toBe(404);
  });

  test("methodology and help have the Robinhood Chain anchors", async ({ page }) => {
    await page.goto("/methodology");
    await expect(page.locator("#robinhood")).toHaveCount(1);
    await page.goto("/help");
    await expect(page.locator("#robinhood")).toHaveCount(1);
  });
});

test.describe("Robinhood Chain geoblock", () => {
  test("blocked region is view-only and sends no trade-preparation calls", async ({ page }) => {
    const { calls } = await setup(page, { country: "XX", blocked: true });
    await page.goto(PAGE);
    await expect(page.getByText("Buying and selling are off")).toBeVisible();
    await expect(page.getByRole("button", { name: /Review (buy|sell)/ })).toHaveCount(0);
    expect(hasMethod(calls, "eth_estimateGas")).toBe(false);
  });
});

test.describe("Robinhood Chain swap flow (mocked network, test wallet)", () => {
  test("buy with no allowances: Permit2 approve, router approve, then the v4 swap", async ({ page }) => {
    const { sent } = await setup(page);
    await page.goto(PAGE);
    await connect(page);
    await page.getByLabel("You pay").fill("100");
    await expect(page.getByText(/You receive about/).first()).toBeVisible();
    await page.getByRole("button", { name: "Review buy of SPY" }).click();

    const review = page.getByRole("dialog", { name: /Review: buy SPY/ });
    await expect(review.getByText("Step 1 of 3: approve the exact amount")).toBeVisible();
    await expect(review.getByText(/through Permit2/)).toBeVisible();
    expect(sent).toHaveLength(0);
    await review.getByRole("button", { name: /Approve USDG in wallet/ }).click();

    await expect(review.getByRole("button", { name: "Swap in wallet" })).toBeVisible();
    await expect(review.getByText(/Uniswap v4, 0\.30% fee pool/)).toBeVisible();
    await expect(review.getByText("0 bps")).toBeVisible();
    expect(sent).toHaveLength(2);

    // 1) ERC-20 approve ke Permit2, jumlah pas. 2) Permit2.approve ke Universal Router, jumlah pas, kedaluwarsa singkat.
    expect(sent[0]!.to.toLowerCase()).toBe(RH.usd.address.toLowerCase());
    expect(decodeFunctionData({ abi: erc20Abi, data: sent[0]!.data as `0x${string}` }).args).toEqual([RH.uniswapV4.permit2, 100_000_000n]);
    expect(sent[1]!.to.toLowerCase()).toBe(RH.uniswapV4.permit2.toLowerCase());
    const p2 = decodeFunctionData({ abi: permit2Abi, data: sent[1]!.data as `0x${string}` }).args as unknown as [string, string, bigint, number];
    expect(p2[0]).toBe(RH.usd.address);
    expect(p2[1]).toBe(RH.uniswapV4.universalRouter);
    expect(p2[2]).toBe(100_000_000n);
    expect(p2[3]).toBeLessThan(Math.floor(Date.now() / 1000) + 3600);

    await review.getByRole("button", { name: "Swap in wallet" }).click();
    await expect(page.getByRole("dialog", { name: "Swap confirmed" })).toBeVisible();
    await expect(page.getByText("Confirmed on Robinhood Chain")).toBeVisible();
    await expect(page.getByText(/0\.4 SPY/)).toBeVisible();
    await expect(page.getByRole("link", { name: /Check it yourself in the explorer/ })).toHaveAttribute("href", /^https:\/\/robinhoodchain\.blockscout\.com\/tx\/0x/);
    expect(sent).toHaveLength(3);
    expect(sent[2]!.to.toLowerCase()).toBe(RH.uniswapV4.universalRouter.toLowerCase());
    expect(sent[2]!.data.startsWith("0x3593564c")).toBe(true); // execute(bytes,bytes[],uint256)
    await page.getByRole("button", { name: "Done" }).click();

    await page.goto("/portfolio");
    await expect(page.getByText(/Bought SPY: 100 USDG for 0\.4 SPY/)).toBeVisible();
    await expect(page.getByRole("link", { name: "Explorer" }).first()).toHaveAttribute("href", /robinhoodchain\.blockscout\.com\/tx\//);
  });

  test("with both allowances in place only the swap is asked", async ({ page }) => {
    const { sent } = await setup(page, { erc20Allowance: 10n ** 12n, permit2Amount: 10n ** 12n, permit2Expiration: Math.floor(Date.now() / 1000) + 86_400 });
    await page.goto(PAGE);
    await connect(page);
    await page.getByLabel("You pay").fill("100");
    await page.getByRole("button", { name: "Review buy of SPY" }).click();
    const review = page.getByRole("dialog", { name: /Review: buy SPY/ });
    await expect(review.getByRole("button", { name: "Swap in wallet" })).toBeVisible();
    await expect(review.getByText(/Step 1 of/)).toHaveCount(0);
    expect(sent).toHaveLength(0);
    await review.getByRole("button", { name: "Swap in wallet" }).click();
    await expect(page.getByRole("dialog", { name: "Swap confirmed" })).toBeVisible();
    expect(sent).toHaveLength(1);
  });

  test("an expired Permit2 grant is renewed but the ERC-20 approval is not repeated", async ({ page }) => {
    const { sent } = await setup(page, { erc20Allowance: 10n ** 12n, permit2Amount: 10n ** 12n, permit2Expiration: 1 });
    await page.goto(PAGE);
    await connect(page);
    await page.getByLabel("You pay").fill("100");
    await page.getByRole("button", { name: "Review buy of SPY" }).click();
    const review = page.getByRole("dialog", { name: /Review: buy SPY/ });
    await expect(review.getByText("Step 1 of 2: approve the exact amount")).toBeVisible();
    await review.getByRole("button", { name: /Approve USDG in wallet/ }).click();
    await expect(review.getByRole("button", { name: "Swap in wallet" })).toBeVisible();
    expect(sent).toHaveLength(1);
    expect(sent[0]!.to.toLowerCase()).toBe(RH.uniswapV4.permit2.toLowerCase());
  });

  test("selling sends the stock token in and asks for approvals on the token", async ({ page }) => {
    const { sent } = await setup(page);
    await page.goto(PAGE);
    await connect(page);
    await page.getByRole("button", { name: "Sell", exact: true }).click();
    await page.getByLabel("You sell").fill("1");
    await page.getByRole("button", { name: "Review sell of SPY" }).click();
    const review = page.getByRole("dialog", { name: /Review: sell SPY/ });
    await review.getByRole("button", { name: /Approve SPY in wallet/ }).click();
    await expect(review.getByRole("button", { name: "Swap in wallet" })).toBeVisible();
    expect(sent[0]!.to.toLowerCase()).toBe("0x117cc2133c37b721f49de2a7a74833232b3b4c0c");
    expect(decodeFunctionData({ abi: erc20Abi, data: sent[0]!.data as `0x${string}` }).args).toEqual([RH.uniswapV4.permit2, 10n ** 18n]);
  });

  test("a failed simulation blocks signing and sends nothing", async ({ page }) => {
    const { sent } = await setup(page, { erc20Allowance: 10n ** 12n, permit2Amount: 10n ** 12n, permit2Expiration: Math.floor(Date.now() / 1000) + 86_400, simulateError: "execution reverted: V4TooLittleReceived" });
    await page.goto(PAGE);
    await connect(page);
    await page.getByLabel("You pay").fill("100");
    await page.getByRole("button", { name: "Review buy of SPY" }).click();
    const review = page.getByRole("dialog");
    await expect(review.getByText("This swap cannot go ahead")).toBeVisible();
    await expect(review.getByText(/would fail on Robinhood Chain/)).toBeVisible();
    await expect(review.getByRole("button", { name: "Swap in wallet" })).toHaveCount(0);
    expect(sent).toHaveLength(0);
  });

  test("no live pool: the page and the review explain and nothing is sent", async ({ page }) => {
    const { sent } = await setup(page, { noPool: true });
    await page.goto(PAGE);
    await expect(page.getByText(/Thin pool: some order sizes cannot be filled/)).toBeVisible();
    await expect(page.getByText(/without hooks/)).toBeVisible();
    await connect(page);
    await page.getByLabel("You pay").fill("100");
    await expect(page.getByText(/No Uniswap v4 pool can fill this amount/).first()).toBeVisible();
    await page.getByRole("button", { name: "Review buy of SPY" }).click();
    await expect(page.getByRole("dialog").getByText("This swap cannot go ahead")).toBeVisible();
    expect(sent).toHaveLength(0);
  });

  test("unexpected USDG decimals keep swaps off", async ({ page }) => {
    await setup(page, { usdgDecimals: 18 });
    await page.goto(PAGE);
    await expect(page.getByText("Token details could not be read")).toBeVisible();
    await expect(page.getByText(/reports 18 decimals/).first()).toBeVisible();
  });

  test("a wallet that does not know the chain is asked to add it with the official settings", async ({ page }) => {
    await setup(page, {}, { chainId: "0x1", unknownChains: ["0x1237"] });
    await page.goto(PAGE);
    await panelConnect(page).click();
    await page.getByRole("button", { name: /Test EVM Wallet/ }).click();
    await page.getByRole("button", { name: "Switch wallet to Robinhood Chain" }).click();
    await expect(page.getByRole("button", { name: /Review buy of SPY/ })).toBeVisible();
    const added = (await page.evaluate(() => (window as unknown as { __addedChains: unknown[] }).__addedChains)) as Array<Record<string, unknown>>;
    expect(added).toHaveLength(1);
    expect(added[0]).toMatchObject({
      chainId: "0x1237",
      chainName: "Robinhood Chain",
      nativeCurrency: { symbol: "ETH", decimals: 18 },
      rpcUrls: ["https://rpc.mainnet.chain.robinhood.com"],
      blockExplorerUrls: ["https://robinhoodchain.blockscout.com"],
    });
  });

  test("portfolio shows the Robinhood Chain holding", async ({ page }) => {
    await setup(page);
    await page.goto("/portfolio");
    await page.getByRole("button", { name: "Connect EVM wallet" }).click();
    await page.getByRole("button", { name: /Test EVM Wallet/ }).click();
    await expect(page.getByRole("heading", { name: "On Robinhood Chain" })).toBeVisible();
  });
});
