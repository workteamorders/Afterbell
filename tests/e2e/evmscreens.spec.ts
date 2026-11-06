import { test } from "@playwright/test";
import { installFakeEvmWallet, mockEvmNetwork } from "./evm";

/** Screenshot tinjauan visual alur swap Ethereum. Hanya berjalan dengan SHOTS=1. Semua data adalah contoh dari jaringan palsu. */
test.skip(!process.env.SHOTS, "visual review only");

for (const w of [360, 1440] as const) {
  test(`ethereum review in dark mode at ${w}`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, colorScheme: "dark" });
    const page = await ctx.newPage();
    const mock = await mockEvmNetwork(page, { allowance: 10n ** 12n });
    await installFakeEvmWallet(page, mock);
    await page.addInitScript(() => localStorage.setItem("ab-risk-ack-v1", "1"));
    await page.goto("/e/TSLAx");
    await page.getByRole("region", { name: /on Ethereum/ }).getByRole("button", { name: "Connect wallet" }).click();
    await page.getByRole("button", { name: /Test EVM Wallet/ }).click();
    await page.getByLabel("You pay").fill("100");
    await page.getByRole("button", { name: "Review buy of TSLAx" }).click();
    await page.getByRole("button", { name: "Swap in wallet" }).waitFor();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `docs/screenshots/pages/eth-dark-review-${w}.png` });
    await ctx.close();
  });
}

for (const [w, h] of [[360, 780], [768, 1024], [1440, 900]] as const) {
  test(`ethereum review and receipt at ${w}`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: w, height: h } });
    const page = await ctx.newPage();
    const mock = await mockEvmNetwork(page, { allowance: 10n ** 12n });
    await installFakeEvmWallet(page, mock);
    await page.addInitScript(() => localStorage.setItem("ab-risk-ack-v1", "1"));
    await page.goto("/e/TSLAx");
    await page.getByRole("region", { name: /on Ethereum/ }).getByRole("button", { name: "Connect wallet" }).click();
    await page.getByRole("button", { name: /Test EVM Wallet/ }).click();
    await page.getByLabel("You pay").fill("100");
    await page.waitForTimeout(900);
    await page.screenshot({ path: `docs/screenshots/pages/eth-token-${w}.png`, fullPage: true });
    await page.getByRole("button", { name: "Review buy of TSLAx" }).click();
    await page.getByRole("button", { name: "Swap in wallet" }).waitFor();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `docs/screenshots/pages/eth-review-${w}.png` });
    await page.getByRole("button", { name: "Swap in wallet" }).click();
    await page.getByRole("button", { name: "Done" }).waitFor();
    await page.waitForTimeout(900);
    await page.screenshot({ path: `docs/screenshots/pages/eth-receipt-${w}.png` });
    await ctx.close();
  });
}
