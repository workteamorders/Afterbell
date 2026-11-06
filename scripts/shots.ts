import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { mockEvmNetwork } from "../tests/e2e/evm";
import { mockNetwork } from "../tests/e2e/mocks";

const BASE = process.env.BASE ?? "http://localhost:4173";
const ROUTES: Array<[string, string]> = [
  ["home", "/"],
  ["explore", "/explore"],
  ["token", "/s/TSLAx"],
  ["eth-token", "/e/TSLAx"],
  ["portfolio", "/portfolio"],
  ["methodology", "/methodology"],
  ["help", "/help"],
  ["risk", "/risk"],
  ["terms", "/terms"],
  ["privacy", "/privacy"],
  ["styleguide", "/styleguide"],
  ["notfound", "/nope"],
  ["offline", "/offline"],
];
const SIZES: Array<[number, number]> = [
  [360, 780],
  [768, 1024],
  [1440, 900],
];
const only = process.argv.slice(2);

(async () => {
  mkdirSync("docs/screenshots/pages", { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH });
  const report: string[] = [];
  for (const [name, path] of ROUTES) {
    if (only.length && !only.includes(name)) continue;
    for (const [w, h] of SIZES) {
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
      const page = await ctx.newPage();
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
      await mockEvmNetwork(page); // dulu, karena rute yang didaftarkan belakangan menang
      await mockNetwork(page);
      await page.goto(BASE + path, { waitUntil: "networkidle" });
      await page.waitForTimeout(700);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      await page.screenshot({ path: `docs/screenshots/pages/${name}-${w}.png`, fullPage: true });
      report.push(`${name}@${w}: overflow=${overflow}px errors=${errors.length ? errors.join(" | ") : "none"}`);
      await ctx.close();
    }
  }
  await browser.close();
  console.log(report.join("\n"));
})();
