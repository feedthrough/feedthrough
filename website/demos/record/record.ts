import { chromium } from "@playwright/test";
import { mkdirSync, renameSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Thin recorder: open the self-playing harness, capture the viewport to webm,
// stop when the page signals window.__demoComplete. All animation lives in the
// page, so a take can be previewed by just opening the URL in a browser.

const here = dirname(fileURLToPath(import.meta.url));
const RAW = resolve(here, "raw");
const BASE = process.env.DEMO_URL ?? "http://localhost:5173";
const SIZE = { width: 800, height: 450 };

const demos = process.argv.slice(2).length ? process.argv.slice(2) : ["list", "button"];

for (const demo of demos) {
  rmSync(resolve(RAW, `${demo}.webm`), { force: true });
  mkdirSync(RAW, { recursive: true });

  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: SIZE,
    recordVideo: { dir: RAW, size: SIZE },
  });
  const page = await context.newPage();

  await page.goto(`${BASE}/?demo=${demo}&autoplay=1`);
  await page.waitForFunction(() => (window as { __demoComplete?: boolean }).__demoComplete === true, {
    timeout: 120_000,
  });
  await page.waitForTimeout(2500); // sit on the final frame before the loop restarts

  const video = page.video();
  await context.close(); // finalizes the .webm
  await browser.close();

  if (video) {
    renameSync(await video.path(), resolve(RAW, `${demo}.webm`));
  }
  console.log(`recorded ${demo} → record/raw/${demo}.webm`);
}
