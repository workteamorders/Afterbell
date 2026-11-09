import { expect, test, type Page } from "@playwright/test";
import { mockNetwork } from "./mocks";
import { installFakeWallet } from "./wallet";

async function connect(page: Page) {
  await page.getByRole("button", { name: "Connect wallet" }).last().click();
  await page.getByRole("button", { name: /Test Wallet/ }).click();
  await expect(page.getByRole("button", { name: /Vote.*1111/ }).first()).toBeVisible();
}

test.describe("browsing", () => {
  test("home to explore to a token page, with live depth from mocked quotes", async ({ page }) => {
    await mockNetwork(page);
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Tokenized US stocks");
    await page.getByRole("link", { name: "Explore tokens" }).click();
    await expect(page.getByRole("heading", { level: 1, name: /Tokenized stocks and Stock Tokens/ })).toBeVisible();
    await expect(page.getByText("Deep").first()).toBeVisible();
    await page.getByRole("link", { name: /TSLAx/ }).first().click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("TSLAx");
    await expect(page.getByRole("heading", { name: "What you hold" })).toBeVisible();
    await expect(page.getByText(/Premium or discount.*not available/)).toBeVisible();
  });

  test("explore search filters and shows an empty state", async ({ page }) => {
    await mockNetwork(page);
    await page.goto("/explore");
    await page.getByLabel("Search tokens").fill("zzzz");
    await expect(page.getByText("No tokens match")).toBeVisible();
    await page.getByRole("button", { name: "Clear search and filters" }).click();
    await expect(page.getByRole("link", { name: /NVDAx/ }).first()).toBeVisible();
  });

  test("anchors referenced by the app exist on the methodology page", async ({ page }) => {
    await page.goto("/methodology");
    for (const id of ["rights", "premium", "fees", "liquidity"]) await expect(page.locator(`#${id}`)).toHaveCount(1);
  });

  test("unknown route shows the 404 page", async ({ page }) => {
    const res = await page.goto("/does-not-exist");
    expect(res?.status()).toBe(404);
    await expect(page.getByText("This page does not exist")).toBeVisible();
  });
});

test.describe("geoblock", () => {
  test("blocked region sees view-only: no buy or sell controls, info still readable", async ({ page }) => {
    await mockNetwork(page, { country: "XX", blocked: true });
    await installFakeWallet(page);
    await page.goto("/s/TSLAx");
    await expect(page.getByText("Buying and selling are off")).toBeVisible();
    await expect(page.getByRole("button", { name: /^(Buy|Sell)$/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Review (buy|sell)/ })).toHaveCount(0);
    await expect(page.getByLabel("You pay")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "What you hold" })).toBeVisible();
  });

  test("unknown region fails closed", async ({ page }) => {
    await page.route("**/api/rpc", (r) => r.fulfill({ status: 500, body: "x" }));
    await page.goto("/s/TSLAx");
    await expect(page.getByText("Buying and selling are off")).toBeVisible();
    await expect(page.getByRole("button", { name: /Review (buy|sell)/ })).toHaveCount(0);
  });
});

test.describe("swap flow (mocked network, test wallet)", () => {
  test("validates the amount on blur", async ({ page }) => {
    await mockNetwork(page);
    await installFakeWallet(page);
    await page.goto("/s/TSLAx");
    await connect(page);
    const amount = page.getByLabel("You pay");
    await amount.fill("0");
    await amount.blur();
    await expect(page.getByText("Amount must be more than 0 and no more than your balance")).toBeVisible();
    await amount.fill("999999");
    await amount.blur();
    await expect(page.getByText("Amount must be more than 0 and no more than your balance")).toBeVisible();
  });

  test("buy: risk notice once, full summary, simulation, sign, receipt", async ({ page }) => {
    const calls = await mockNetwork(page);
    await installFakeWallet(page);
    await page.goto("/s/TSLAx");
    await connect(page);
    await page.getByLabel("You pay").fill("100");
    await expect(page.getByText(/You receive about/).first()).toBeVisible();
    await page.getByRole("button", { name: "Review buy of TSLAx" }).click();

    const risk = page.getByRole("dialog", { name: "Before your first swap" });
    await expect(risk).toBeVisible();
    await expect(risk.getByRole("button", { name: "Continue to review" })).toBeDisabled();
    await risk.getByText("I have read this and I understand").click();
    await risk.getByRole("button", { name: "Continue to review" }).click();

    const review = page.getByRole("dialog", { name: /Review: buy TSLAx/ });
    for (const label of ["You pay", "You receive at least", "Route", "Price impact (Jupiter estimate)", "Slippage tolerance", "Afterbell fee", "Network fee"]) {
      await expect(review.locator("dt", { hasText: label }).first()).toBeVisible();
    }
    await expect(review.getByText("0 bps")).toBeVisible(); // referral tidak dikonfigurasi di build uji
    expect(calls.some((c) => c.method === "simulateTransaction")).toBe(true);
    expect(calls.some((c) => c.url.includes("/execute"))).toBe(false); // belum ada yang dikirim

    await review.getByRole("button", { name: "Sign in wallet" }).click();
    await expect(page.getByRole("dialog", { name: "Swap confirmed" })).toBeVisible();
    await expect(page.getByRole("link", { name: /Check it yourself in the explorer/ })).toHaveAttribute("href", /explorer\.solana\.com\/tx\//);
    expect(calls.filter((c) => c.url.includes("/execute"))).toHaveLength(1);
    await page.getByRole("button", { name: "Done" }).click();

    // Pemberitahuan risiko hanya sekali.
    await page.getByLabel("You pay").fill("50");
    await page.getByRole("button", { name: "Review buy of TSLAx" }).click();
    await expect(page.getByRole("dialog", { name: "Before your first swap" })).toHaveCount(0);
    await expect(page.getByRole("dialog", { name: /Review: buy TSLAx/ })).toBeVisible();
  });

  test("a failed simulation blocks signing and sends nothing", async ({ page }) => {
    const calls = await mockNetwork(page, { simulateError: { InstructionError: [0, { Custom: 1 }] } });
    await installFakeWallet(page);
    await page.addInitScript(() => localStorage.setItem("ab-risk-ack-v1", "1"));
    await page.goto("/s/TSLAx");
    await connect(page);
    await page.getByLabel("You pay").fill("100");
    await page.getByRole("button", { name: "Review buy of TSLAx" }).click();
    const review = page.getByRole("dialog");
    await expect(review.getByText("The pre-check failed")).toBeVisible();
    await expect(review.getByRole("button", { name: "Sign in wallet" })).toHaveCount(0);
    expect(calls.some((c) => c.url.includes("/execute"))).toBe(false);
  });

  test("declining in the wallet sends nothing", async ({ page }) => {
    const calls = await mockNetwork(page);
    await installFakeWallet(page, { reject: true });
    await page.addInitScript(() => localStorage.setItem("ab-risk-ack-v1", "1"));
    await page.goto("/s/TSLAx");
    await connect(page);
    await page.getByLabel("You pay").fill("100");
    await page.getByRole("button", { name: "Review buy of TSLAx" }).click();
    await page.getByRole("button", { name: "Sign in wallet" }).click();
    await expect(page.getByText("You declined the request in your wallet.")).toBeVisible();
    expect(calls.some((c) => c.url.includes("/execute"))).toBe(false);
  });

  test("keyboard only: connect, enter amount, review, cancel", async ({ page }) => {
    await mockNetwork(page);
    await installFakeWallet(page);
    await page.addInitScript(() => localStorage.setItem("ab-risk-ack-v1", "1"));
    await page.goto("/s/TSLAx");

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

    await tabTo(/^Connect wallet$/); // tombol di header
    await page.keyboard.press("Enter");
    await tabTo(/Test Wallet/);
    await page.keyboard.press("Enter");
    await expect(page.getByRole("button", { name: /Vote.*1111/ }).first()).toBeVisible();

    await page.getByLabel("You pay").focus();
    await page.keyboard.type("100");
    await tabTo(/Review buy of TSLAx/);
    await page.keyboard.press("Enter");
    const review = page.getByRole("dialog", { name: /Review: buy TSLAx/ });
    await expect(review).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(review).toHaveCount(0);
  });
});

test.describe("portfolio", () => {
  test("empty state before connecting, holdings after", async ({ page }) => {
    await mockNetwork(page);
    await installFakeWallet(page);
    await page.goto("/portfolio");
    await expect(page.getByText("Connect a wallet to see what you hold")).toBeVisible();
    await connect(page);
    await expect(page.getByRole("table")).toBeVisible();
    await expect(page.getByRole("link", { name: /TSLAx/ }).first()).toBeVisible();
    await expect(page.getByText("What this page does not show")).toBeVisible();
  });
});
