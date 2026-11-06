import { test } from "@playwright/test";
import { mockNetwork } from "./mocks";
import { installFakeWallet } from "./wallet";

/** Screenshot tinjauan visual alur swap. Hanya berjalan dengan SHOTS=1. Semua data adalah contoh dari jaringan palsu. */
test.skip(!process.env.SHOTS, "visual review only");

for (const [w, h] of [[360, 780], [768, 1024], [1440, 900]] as const) {
  test(`review and receipt at ${w}`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: w, height: h } });
    const page = await ctx.newPage();
    await mockNetwork(page);
    await installFakeWallet(page);
    await page.addInitScript(() => localStorage.setItem("ab-risk-ack-v1", "1"));
    await page.goto("/s/TSLAx");
    await page.getByRole("main").getByRole("button", { name: "Connect wallet" }).click();
    await page.getByRole("button", { name: /Test Wallet/ }).click();
    await page.getByLabel("You pay").fill("100");
    await page.getByRole("button", { name: "Review buy of TSLAx" }).click();
    await page.getByRole("button", { name: "Sign in wallet" }).waitFor();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `docs/screenshots/pages/review-${w}.png` });
    await page.getByRole("button", { name: "Sign in wallet" }).click();
    await page.getByRole("button", { name: "Done" }).waitFor();
    await page.waitForTimeout(900);
    await page.screenshot({ path: `docs/screenshots/pages/receipt-${w}.png` });
    await ctx.close();
  });
}
