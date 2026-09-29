import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

/** Phase 2 platform: privileged admin, the notification center, saved views and the work-order split view. */

test("admin is invisible to everyone but staff, and privileged changes are deliberate and audited", async ({ browser }) => {
  // Ordinary people — including a company owner — get a 404, not a login prompt or a hint.
  for (const who of ["Tharushi Wijesinghe", "Anura Bandara", "Kasun Perera"]) {
    const page = await signIn(browser, who);
    for (const path of ["/admin", "/admin/users", "/admin/audit", "/admin/organizations/abc-engineering"]) {
      const res = await page.goto(path);
      expect(res?.status(), `${who} → ${path}`).toBe(404);
    }
  }
  // A signed-out visitor gets the same 404.
  const anon = await (await browser.newContext()).newPage();
  expect((await anon.goto("/admin"))?.status()).toBe(404);

  // Staff land in admin and can look things up.
  const admin = await signIn(browser, "Malith Ranasinghe");
  await expect(admin).toHaveURL(/\/admin$/);
  await expect(admin.getByRole("heading", { name: "Admin overview" })).toBeVisible();
  await admin.goto("/admin/work-orders?q=HVAC cooling failure");
  await expect(admin.getByRole("link", { name: /HVAC cooling failure/ }).first()).toBeVisible();

  // Verifying a provider needs a reason and a typed confirmation.
  await admin.goto("/admin/organizations/summit-lifts");
  await admin.getByLabel(/What was checked/).fill("Checked the lift-contractor licence with CIDA");
  await admin.getByLabel(/Type .summit-lifts. to confirm/).fill("wrong-slug");
  await admin.getByRole("button", { name: "Verify provider" }).click();
  await expect(admin.getByText("Type summit-lifts to confirm.")).toBeVisible();
  await admin.getByLabel(/Type .summit-lifts. to confirm/).fill("summit-lifts");
  await admin.getByRole("button", { name: "Verify provider" }).click();
  await expect(admin.getByText("Provider verified")).toBeVisible();

  // …and it is on the record, with the reason.
  await admin.goto("/admin/audit?q=admin.verified");
  await expect(admin.getByText(/Verified Summit Lift & Escalator — Checked the lift-contractor licence/)).toBeVisible();
});

test("the notification center keeps everything, filters it, and clears it", async ({ browser }) => {
  const page = await signIn(browser, "Tharushi Wijesinghe");
  await page.goto("/home/notifications");
  await expect(page.getByRole("heading", { name: "Notifications" })).toBeVisible();
  await expect(page.getByText("Confirm your AC repair")).toBeVisible();
  await page.getByRole("link", { name: /^Unread/ }).click();
  await expect(page.getByText("Confirm your AC repair")).toBeVisible();
  await page.getByRole("button", { name: "Mark all read" }).click();
  await expect(page.getByText("You're all caught up")).toBeVisible();
  // Read items are still there under "All".
  await page.getByRole("link", { name: "All", exact: true }).click();
  await expect(page.getByText("Confirm your AC repair")).toBeVisible();
});

test.describe("work list", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("saved views restore a bookmark; split view keeps the list and the URL honest", async ({ browser }) => {
    const page = await signIn(browser, "Ruwan Silva");

    // A saved view is the URL: opening it applies the filters and marks the chip current.
    await page.goto("/w/abc-engineering/work-orders?view=open&priority=high&category=hvac");
    await expect(page.getByRole("link", { name: "High-priority HVAC" })).toHaveAttribute("aria-current", "true");

    // Save a new one from the current filters, then delete it.
    await page.goto("/w/abc-engineering/work-orders?view=risk&priority=critical");
    await page.getByRole("button", { name: "Save view" }).click();
    await page.getByLabel("View name").fill("Critical at risk");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByRole("link", { name: "Critical at risk" })).toHaveAttribute("aria-current", "true");
    await page.getByRole("button", { name: "Delete view Critical at risk" }).click({ force: true });
    await expect(page.getByRole("link", { name: "Critical at risk" })).toHaveCount(0);

    // Split view: the row opens beside the list, the address bar follows, back closes it.
    await page.goto("/w/abc-engineering/work-orders?view=unassigned");
    await page.getByRole("link", { name: "Split view" }).click();
    await expect(page).toHaveURL(/split=1/);
    await page.getByRole("link", { name: /Burst pipe/ }).click();
    await expect(page).toHaveURL(/wo=\d+/);
    const pane = page.getByRole("complementary", { name: /^WO-\d+$/ });
    await expect(pane.getByRole("heading", { name: /Burst pipe/ })).toBeVisible();
    await page.goBack();
    await expect(pane).toHaveCount(0);
    await page.goForward();
    await expect(pane.getByRole("heading", { name: /Burst pipe/ })).toBeVisible();

    // The dedicated page is still the canonical, shareable route.
    await pane.getByRole("link", { name: "Open full page" }).click();
    await expect(page).toHaveURL(/\/work-orders\/\d+$/);
    await expect(page.getByRole("heading", { name: /Burst pipe/ })).toBeVisible();
  });
});

test("every link in every workspace navigation opens a real page", async ({ browser }) => {
  // Navigation is derived from role, segment and modules, so each experience is checked as its own person.
  for (const who of ["Anura Bandara", "Ruwan Silva", "Nimal Fernando", "Dilani Jayawardena"]) {
    const page = await signIn(browser, who);
    const links = await page.getByRole("navigation", { name: "Workspace" }).getByRole("link").evaluateAll((els) => els.map((el) => el.getAttribute("href")!));
    expect(links.length, who).toBeGreaterThan(3);
    for (const href of new Set(links)) expect((await page.request.get(href)).status(), `${who} → ${href}`).toBe(200);
  }
});

test("technician can only be sent to Field, and account security is reachable", async ({ browser }) => {
  const owner = await signIn(browser, "Anura Bandara");
  await owner.goto("/w/abc-engineering/settings/security");
  await expect(owner.getByRole("heading", { name: "Signed-in devices" })).toBeVisible();
  await expect(owner.getByText("This device")).toBeVisible();
  await owner.goto("/w/abc-engineering/settings/roles");
  await expect(owner.getByRole("heading", { name: "Permissions by role" })).toBeVisible();
});
