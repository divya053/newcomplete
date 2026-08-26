import { test, expect, type Page } from "@playwright/test";

// Every chain stage has a purpose-built surface. This walks the whole chain on
// the most advanced project in the workspace and asserts each surface renders
// its own screen — not an error, and not the generic fallback.

const EMAIL = process.env.E2E_EMAIL ?? "owner@aigcc.group";
const PASSWORD = (() => {
  // No committed default. The seed no longer creates a fixed password, so a
  // literal here would be both a published credential and simply wrong.
  const v = process.env.E2E_PASSWORD;
  if (!v) throw new Error("E2E_PASSWORD is not set. Use the same value the seed was run with.");
  return v;
})();

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/overview/);
}

/** The furthest-along project — the one whose later stages actually have data. */
async function openAdvancedProject(page: Page) {
  await page.getByRole("link", { name: "Projects", exact: true }).click();
  // Rows paint before their graphs arrive; wait for the last one to hydrate so
  // "Ready" is a real status and not a placeholder.
  await page.waitForFunction(() => {
    const body = document.querySelector("tbody");
    return !!body && body.rows.length > 0 && !body.textContent?.includes("…");
  }, { timeout: 30_000 });

  const ready = page.locator("tbody tr", { hasText: "Ready" }).first();
  const target = (await ready.count()) ? ready : page.locator("tbody tr").first();
  await target.click();
  await expect(page.getByRole("heading", { name: "Chain progress" })).toBeVisible();
}

/* Each marker accepts the populated surface OR that stage's own empty state.
   Both prove the purpose-built surface rendered rather than the generic
   fallback, which is what this test is actually asserting.

   Tender was the one stage without its empty-state alternative, so it alone
   depended on the chosen project having requirements. openAdvancedProject
   prefers a "Ready" row but falls back to the first, and which project that is
   varies between runs — so this failed intermittently: the same commit passed
   28/28 at 19:32 and failed here at 20:12. */
const STAGES = [
  { tab: "Tender", url: /modules\/tenderlogix/, marker: /Requirements|No tender read yet/ },
  // BIM Studio is on this surface whether or not anything has been measured —
  // modelling is how the first quantities often get made.
  { tab: "Drawings", url: /modules\/drawlogix/, marker: /BIM Studio/ },
  { tab: "Specs", url: /modules\/doclogix/, marker: /Clauses|Specs not parsed/ },
  { tab: "BOQ", url: /modules\/quantlogix/, marker: /Bill of quantities|BOQ not ready/ },
  { tab: "Estimate", url: /modules\/costlogix/, marker: /Priced bill|Estimate not started/ },
  { tab: "Schedule", url: /modules\/schedulelogix/, marker: /Work programme|Programme not started/ },
  { tab: "Procurement", url: /modules\/procurelogix/, marker: /Procurement packages|No packages yet/ },
];

test("every chain stage renders its own surface", async ({ page }) => {
  await signIn(page);
  await openAdvancedProject(page);

  const tabs = page.locator(".pw-tabs");
  for (const s of STAGES) {
    await tabs.getByText(s.tab, { exact: true }).click();
    await expect(page).toHaveURL(s.url);
    await expect(page.getByText(s.marker).first()).toBeVisible({ timeout: 20_000 });
    // No surface should fall over on real data.
    await expect(page.getByText("Couldn’t load this")).toHaveCount(0);
    await page.screenshot({ path: `test-results/surface-${s.tab.toLowerCase()}.png`, fullPage: true });
  }
});

test("the dashboard and admin screens render", async ({ page }) => {
  await signIn(page);
  await expect(page.getByRole("heading", { name: "Your projects" })).toBeVisible();
  await page.screenshot({ path: "test-results/screen-dashboard.png", fullPage: true });

  await page.getByRole("link", { name: "Admin" }).click();
  await expect(page.getByRole("heading", { name: "People" })).toBeVisible();

  await page.getByRole("button", { name: "Branding" }).click();
  await expect(page.getByRole("heading", { name: "Brand colour" })).toBeVisible();
  await page.screenshot({ path: "test-results/screen-branding.png", fullPage: true });

  await page.getByRole("button", { name: "Plan & usage" }).click();
  await expect(page.getByRole("heading", { name: "Plan", exact: true })).toBeVisible();
});
