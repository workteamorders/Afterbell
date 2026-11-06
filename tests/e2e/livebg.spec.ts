import { expect, test } from "@playwright/test";
import { mockNetwork } from "./mocks";

test.describe("live background", () => {
  test("is decorative, does not block clicks, and reacts to the cursor and clicks", async ({ page }) => {
    await mockNetwork(page);
    await page.goto("/explore");
    const canvas = page.locator("canvas[aria-hidden='true']").first();
    await expect(canvas).toHaveCount(1);
    expect(await canvas.evaluate((el) => getComputedStyle(el).pointerEvents)).toBe("none");
    // Menunggu gambar pertama.
    await page.waitForFunction(() => {
      const c = document.querySelector("canvas[aria-hidden='true']") as HTMLCanvasElement | null;
      return !!c && c.width > 0 && c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data.some((v) => v !== 0);
    });
    const snap = () => canvas.evaluate((el) => (el as HTMLCanvasElement).toDataURL());
    await page.mouse.move(100, 400);
    await page.waitForTimeout(400);
    const a = await snap();
    await page.mouse.move(700, 300, { steps: 12 });
    await page.waitForTimeout(500);
    const b = await snap();
    expect(b).not.toBe(a);
    await page.mouse.click(700, 300);
    await page.waitForTimeout(200);
    expect(await snap()).not.toBe(b);
    // Konten di atasnya tetap bisa diklik.
    await page.getByLabel("Search tokens").fill("tsla");
    await expect(page.getByLabel("Search tokens")).toHaveValue("tsla");
  });

  test("with reduced motion it draws once and stays still", async ({ browser }) => {
    const ctx = await browser.newContext({ reducedMotion: "reduce" });
    const page = await ctx.newPage();
    await mockNetwork(page);
    await page.goto("/explore");
    await page.waitForFunction(() => {
      const c = document.querySelector("canvas[aria-hidden='true']") as HTMLCanvasElement | null;
      return !!c && c.width > 0 && c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data.some((v) => v !== 0);
    });
    const canvas = page.locator("canvas[aria-hidden='true']").first();
    const snap = () => canvas.evaluate((el) => (el as HTMLCanvasElement).toDataURL());
    const a = await snap();
    await page.mouse.move(600, 300, { steps: 8 });
    await page.mouse.click(600, 300);
    await page.waitForTimeout(600);
    expect(await snap()).toBe(a);
    await ctx.close();
  });
});
