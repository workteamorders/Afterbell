import { test } from "@playwright/test";
import { mockNetwork } from "./mocks";
test.skip(!process.env.MEASURE, "dev only");
for (const w of [360, 768, 1440]) {
  test(`m${w}`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: 900 });
    await mockNetwork(page);
    await page.goto("/s/TSLAx");
    await page.waitForTimeout(1200);
    const h = await page.evaluate(() => {
      const q = (s: string) => Math.round(document.querySelector(s)?.getBoundingClientRect().height ?? -1);
      return { swap: q('section[aria-labelledby="swap-h"]'), depth: q('section[aria-labelledby="depth-h"]'), meter: q('section[aria-label^="Liquidity"], section:has(> div > h3)') };
    });
    console.log(w, JSON.stringify(h));
  });
}
