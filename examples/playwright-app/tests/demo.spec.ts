/**
 * Demo spec: the Feedthrough bridge is injected before every page load via the
 * custom `test` fixture from @feedthrough/playwright.
 *
 * While these tests run, the MCP server can observe console logs, network
 * requests, and DOM state in real time — allowing an AI agent to diagnose bugs
 * as they're triggered by the test actions.
 *
 * Start the MCP server in a separate terminal before connecting an AI agent:
 *   cd packages/mcp && node dist/index.js
 */
import { test, expect } from "@feedthrough/playwright";

test("counter increments (displays wrong value — off-by-one bug)", async ({ page }) => {
  await page.goto("/");

  await page.click("#record-view-btn");
  await page.click("#record-view-btn");
  await page.click("#record-view-btn");

  // The counter logs +1 each click but the displayed value increases by 2.
  // An AI agent watching via get_console_logs() will see the discrepancy.
  const displayed = await page.textContent("#view-count");
  expect(Number(displayed)).toBe(6); // 3 clicks × 2 = 6 (the bug)
});

test("team search is case-sensitive (bug: 'alice' finds nothing)", async ({ page }) => {
  await page.goto("/");

  await page.fill("#search-input", "alice");
  const count = await page.textContent("#result-count");

  // Bug: 'alice' matches 0 members because the name comparison is case-sensitive.
  // An AI agent can confirm via query_dom('#member-list li') and get_console_logs().
  expect(count).toContain("0 of 6");
});

test("activity feed fetch fails silently (wrong URL bug)", async ({ page }) => {
  await page.goto("/");

  await page.click("#refresh-btn");
  await page.waitForTimeout(500);

  // The fetch goes to /api/events (404). The error is caught and swallowed.
  // An AI agent will find it via get_network_requests() and get_console_logs().
  const status = await page.textContent("#feed-status");
  expect(status).toContain("No events");
});
