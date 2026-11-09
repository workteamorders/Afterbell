import { expect, test, type Page } from "@playwright/test";
import { installFakeEvmWallet, mockEvmNetwork, type EvmMockOptions } from "./evm";

async function setup(page: Page, mockOpts: EvmMockOptions = {}, walletOpts: { reject?: boolean; chainId?: string } = {}) {
  const mock = await mockEvmNetwork(page, mockOpts);
  const sent = await installFakeEvmWallet(page, mock, walletOpts);
  await page.addInitScript(() => localStorage.setItem("ab-risk-ack-v1", "1"));
  return { ...mock, sent };
}
/** Tombol Connect milik panel swap (bukan tombol Solana di header). Menunggu panel selesai memuat wilayah. */
const panelConnect = (page: Page) => page.getByRole("region", { name: /on Ethereum/ }).getByRole("button", { name: "Connect wallet" });

async function connect(page: Page) {
  await panelConnect(page).click();
  await page.getByRole("button", { name: /Test EVM Wallet/ }).click();
  await expect(page.getByRole("button", { name: /Review buy of TSLAx/ })).toBeVisible();
}
const hasMethod = (calls: { method: string }[], m: string) => calls.some((c) => c.method === m);

test.describe("Ethereum browsing", () => {
  test("token page shows the contract address, its source, and live Uniswap quotes", async ({ page }) => {
    await mockEvmNetwork(page);
    await page.goto("/e/TSLAx");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("TSLAx");
    await expect(page.getByText("Contract address", { exact: true })).toBeVisible();
    await expect(page.getByText("0x8aD3c73F833d3F9A523aB01476625F269aEB7Cf0").first()).toBeVisible();
    await expect(page.getByText("Uniswap v3 quotes on Ethereum")).toBeVisible();
    await expect(page.getByRole("link", { name: "Solana" }).first()).toHaveAttribute("href", "/s/TSLAx");
  });

  test("explore lists Ethereum rows and filters by network", async ({ page }) => {
    await mockEvmNetwork(page);
    await page.goto("/explore");
    await page.getByRole("button", { name: "Ethereum", exact: true }).click();
    await expect(page.getByRole("link", { name: /TSLAx/ })).toHaveAttribute("href", "/e/TSLAx");
    await expect(page.getByRole("link", { name: /CRCLx/ })).toHaveAttribute("href", "/e/CRCLx");
    await page.getByRole("button", { name: "Solana", exact: true }).click();
    await expect(page.getByRole("link", { name: /TSLAx/ })).toHaveAttribute("href", "/s/TSLAx");
  });

  test("unknown Ethereum token shows the 404 page", async ({ page }) => {
    const res = await page.goto("/e/NOPE");
    expect(res?.status()).toBe(404);
  });

  test("methodology has the Ethereum anchor", async ({ page }) => {
    await page.goto("/methodology");
    await expect(page.locator("#ethereum")).toHaveCount(1);
  });
});

test.describe("Ethereum geoblock", () => {
  test("blocked region is view-only and sends no trade-preparation calls", async ({ page }) => {
    const { calls } = await setup(page, { country: "XX", blocked: true });
    await page.goto("/e/TSLAx");
    await expect(page.getByText("Buying and selling are off")).toBeVisible();
    await expect(page.getByRole("button", { name: /Review (buy|sell)/ })).toHaveCount(0);
    await expect(page.getByLabel("You pay")).toHaveCount(0);
    expect(hasMethod(calls, "eth_estimateGas")).toBe(false);
  });
  test("unknown region fails closed", async ({ page }) => {
    await page.route("**/api/rpc", (r) => r.fulfill({ status: 500, body: "x" }));
    await page.goto("/e/TSLAx");
    await expect(page.getByText("Buying and selling are off")).toBeVisible();
  });
});

test.describe("Ethereum swap flow (mocked network, test wallet)", () => {
  test("validates the amount on blur", async ({ page }) => {
    await setup(page);
    await page.goto("/e/TSLAx");
    await connect(page);
    const amount = page.getByLabel("You pay");
    await amount.fill("0");
    await amount.blur();
    await expect(page.getByText("Amount must be more than 0 and no more than your balance")).toBeVisible();
    await amount.fill("999999");
    await amount.blur();
    await expect(page.getByText("Amount must be more than 0 and no more than your balance")).toBeVisible();
  });

  test("buy with approval: exact-amount approve, then simulated swap, then receipt", async ({ page }) => {
    const { calls, sent } = await setup(page);
    await page.goto("/e/TSLAx");
    await connect(page);
    await page.getByLabel("You pay").fill("100");
    await expect(page.getByText(/You receive about/).first()).toBeVisible();
    await page.getByRole("button", { name: "Review buy of TSLAx" }).click();

    const review = page.getByRole("dialog", { name: /Review: buy TSLAx/ });
    await expect(review.getByText("Step 1 of 2: approve the exact amount")).toBeVisible();
    expect(sent).toHaveLength(0); // nothing sent before the user confirms
    await review.getByRole("button", { name: /Approve USDC in wallet/ }).click();

    for (const label of ["You pay", "You receive at least", "Route", "Slippage tolerance", "Afterbell fee", "Network fee"]) {
      await expect(review.locator("dt", { hasText: label }).first()).toBeVisible();
    }
    await expect(review.getByText("0 bps")).toBeVisible();
    await expect(review.getByText(/Uniswap v3, 0\.30% fee tier/)).toBeVisible();
    expect(sent).toHaveLength(1);
    // Approval is for the exact amount (100 USDC = 100_000_000), never unlimited.
    expect(BigInt("0x" + sent[0]!.data.slice(-64))).toBe(100_000_000n);
    expect(hasMethod(calls, "eth_estimateGas")).toBe(true);

    await review.getByRole("button", { name: "Swap in wallet" }).click();
    await expect(page.getByRole("dialog", { name: "Swap confirmed" })).toBeVisible();
    await expect(page.getByText("Confirmed on Ethereum")).toBeVisible();
    await expect(page.getByText(/0\.4 TSLAx/)).toBeVisible();
    await expect(page.getByRole("link", { name: /Check it yourself in the explorer/ })).toHaveAttribute("href", /^https:\/\/etherscan\.io\/tx\/0x/);
    expect(sent).toHaveLength(2);
    await page.getByRole("button", { name: "Done" }).click();

    await page.goto("/portfolio");
    await expect(page.getByText(/Bought TSLAx: 100 USDC for 0\.4 TSLAx/)).toBeVisible();
    await expect(page.getByRole("link", { name: "Explorer" }).first()).toHaveAttribute("href", /etherscan\.io\/tx\//);
  });

  test("buy with enough allowance skips the approval", async ({ page }) => {
    const { sent } = await setup(page, { allowance: 10n ** 12n });
    await page.goto("/e/TSLAx");
    await connect(page);
    await page.getByLabel("You pay").fill("100");
    await page.getByRole("button", { name: "Review buy of TSLAx" }).click();
    const review = page.getByRole("dialog", { name: /Review: buy TSLAx/ });
    await expect(review.getByRole("button", { name: "Swap in wallet" })).toBeVisible();
    await expect(review.getByText("Step 1 of 2")).toHaveCount(0);
    expect(sent).toHaveLength(0);
    await review.getByRole("button", { name: "Swap in wallet" }).click();
    await expect(page.getByRole("dialog", { name: "Swap confirmed" })).toBeVisible();
    expect(sent).toHaveLength(1);
  });

  test("a failed simulation blocks signing and sends nothing", async ({ page }) => {
    const { sent } = await setup(page, { allowance: 10n ** 12n, simulateError: "execution reverted: Too little received" });
    await page.goto("/e/TSLAx");
    await connect(page);
    await page.getByLabel("You pay").fill("100");
    await page.getByRole("button", { name: "Review buy of TSLAx" }).click();
    const review = page.getByRole("dialog");
    await expect(review.getByText("This swap cannot go ahead")).toBeVisible();
    await expect(review.getByText(/slippage tolerance/).first()).toBeVisible();
    await expect(review.getByRole("button", { name: "Swap in wallet" })).toHaveCount(0);
    expect(sent).toHaveLength(0);
  });

  test("declining in the wallet sends nothing", async ({ page }) => {
    const { sent } = await setup(page, { allowance: 10n ** 12n }, { reject: true });
    await page.goto("/e/TSLAx");
    await connect(page);
    await page.getByLabel("You pay").fill("100");
    await page.getByRole("button", { name: "Review buy of TSLAx" }).click();
    await page.getByRole("button", { name: "Swap in wallet" }).click();
    await expect(page.getByText("You declined the request in your wallet.")).toBeVisible();
    expect(sent).toHaveLength(0);
  });

  test("a reverted swap says so and links the explorer", async ({ page }) => {
    await setup(page, { allowance: 10n ** 12n, receiptFailed: true });
    await page.goto("/e/TSLAx");
    await connect(page);
    await page.getByLabel("You pay").fill("100");
    await page.getByRole("button", { name: "Review buy of TSLAx" }).click();
    await page.getByRole("button", { name: "Swap in wallet" }).click();
    await expect(page.getByText("The swap transaction failed on Ethereum.")).toBeVisible();
    await expect(page.getByRole("link", { name: /Open this transaction in the explorer/ })).toHaveAttribute("href", /etherscan\.io\/tx\//);
  });

  test("no pool: the review explains and nothing is sent", async ({ page }) => {
    const { sent } = await setup(page, { noPool: true });
    await page.goto("/e/TSLAx");
    await connect(page);
    await page.getByLabel("You pay").fill("100");
    await expect(page.getByText(/No Uniswap v3 pool can fill this amount/).first()).toBeVisible();
    await page.getByRole("button", { name: "Review buy of TSLAx" }).click();
    await expect(page.getByRole("dialog").getByText("This swap cannot go ahead")).toBeVisible();
    expect(sent).toHaveLength(0);
  });

  test("wrong network: the wallet is asked to switch", async ({ page }) => {
    await setup(page, {}, { chainId: "0x89" });
    await page.goto("/e/TSLAx");
    await panelConnect(page).click();
    await page.getByRole("button", { name: /Test EVM Wallet/ }).click();
    await page.getByRole("button", { name: "Switch wallet to Ethereum" }).click();
    await expect(page.getByRole("button", { name: /Review buy of TSLAx/ })).toBeVisible();
  });

  test("keyboard only: connect, enter amount, review, cancel", async ({ page }) => {
    await setup(page, { allowance: 10n ** 12n });
    await page.goto("/e/TSLAx");
    const tabTo = async (name: RegExp) => {
      for (let i = 0; i < 60; i++) {
        await page.keyboard.press("Tab");
        const label = await page.evaluate(() => {
          const el = document.activeElement as HTMLElement | null;
          return (el?.getAttribute("aria-label") || el?.innerText || (el as HTMLInputElement | null)?.labels?.[0]?.innerText || "").trim();
        });
        if (name.test(label)) return;
      }
      throw new Error(`Could not reach ${name} by keyboard`);
    };
    await panelConnect(page).focus();
    await page.keyboard.press("Enter");
    await tabTo(/Test EVM Wallet/);
    await page.keyboard.press("Enter");
    await expect(page.getByRole("button", { name: /Review buy of TSLAx/ })).toBeVisible();
    await page.getByLabel("You pay").focus();
    await page.keyboard.type("100");
    await tabTo(/Review buy of TSLAx/);
    await page.keyboard.press("Enter");
    const review = page.getByRole("dialog", { name: /Review: buy TSLAx/ });
    await expect(review).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(review).toHaveCount(0);
  });

  test("portfolio shows the Ethereum holding when an Ethereum wallet is connected", async ({ page }) => {
    await setup(page);
    await page.goto("/portfolio");
    await page.getByRole("button", { name: "Connect EVM wallet" }).click();
    await page.getByRole("button", { name: /Test EVM Wallet/ }).click();
    await expect(page.getByRole("table", { name: /wallet on Ethereum/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /TSLAx/ }).first()).toHaveAttribute("href", "/e/TSLAx");
  });
});
