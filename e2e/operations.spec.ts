import { expect, test, type Page } from "@playwright/test";
import { dayFromNow, signIn, submitAssignment } from "./helpers";

/**
 * Phase 2 operations: a dispatcher runs the day, a customer's history is one click away,
 * recurring work turns into real work orders — and what people may not do is refused by the server.
 */

/** Picks a technician and time in the assignment sheet and submits, giving a reason only if warned. */
async function assignInSheet(page: Page, tech: string, date: string, time: string, reason = "Customer has no other slot") {
  const sheet = page.getByRole("dialog");
  await sheet.getByText(tech, { exact: true }).click();
  await sheet.getByLabel("Date").fill(date);
  await sheet.getByLabel("Start time").fill(time);
  return submitAssignment(page, reason);
}

test("a dispatcher assigns unassigned work and the technician sees it", async ({ browser }) => {
  const dispatcher = await signIn(browser, "Ruwan Silva");
  await dispatcher.goto("/w/abc-engineering/dispatch");
  await expect(dispatcher.getByRole("heading", { name: "Unassigned" })).toBeVisible();
  const card = dispatcher.getByRole("button", { name: /^Assign WO-\d+ Study-room socket sparking/ });
  await card.click();
  await assignInSheet(dispatcher, "Kasun Perera", dayFromNow(4), "10:00");

  // It left the queue and is on Kasun's timeline when we look at that day.
  await dispatcher.goto(`/w/abc-engineering/dispatch?date=${dayFromNow(4)}`);
  await expect(dispatcher.getByRole("link", { name: /Study-room socket sparking/ }).first()).toBeVisible();
  await expect(dispatcher.getByRole("button", { name: /Assign WO-\d+ Study-room socket sparking/ })).toHaveCount(0);

  // The technician has it in their app.
  const tech = await signIn(browser, "Kasun Perera");
  await tech.goto("/field");
  await expect(tech.getByText("Study-room socket sparking").first()).toBeVisible();
});

test("booking someone on leave warns, and only goes ahead with a recorded reason", async ({ browser }) => {
  const dispatcher = await signIn(browser, "Ruwan Silva");
  await dispatcher.goto(`/w/abc-engineering/dispatch?date=${dayFromNow(2)}`);
  await dispatcher.getByRole("button", { name: /^Assign WO-\d+ Reception split AC/ }).click();
  const sheet = dispatcher.getByRole("dialog");
  await sheet.getByText("Chamari Dias", { exact: true }).click();
  await sheet.getByLabel("Date").fill(dayFromNow(2));
  await sheet.getByLabel("Start time").fill("10:00");

  await expect(sheet.getByText(/Chamari is off — annual leave/)).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Assign anyway" })).toBeVisible();
  // The reason is required by the server too, not just the form.
  await sheet.getByLabel("Why go ahead anyway?").fill("Customer insists on this week; Chamari can swap her leave day");
  await sheet.getByRole("button", { name: "Assign anyway" }).click();
  await expect(sheet).toHaveCount(0);

  // The override is on the work order's timeline.
  await dispatcher.goto("/w/abc-engineering/work-orders?view=all&q=Reception split AC");
  await dispatcher.getByRole("link", { name: /Reception split AC/ }).first().click();
  await expect(dispatcher.getByText(/override: Customer insists on this week/)).toBeVisible();
});

test("a customer's history is one click away and starts new work", async ({ browser }) => {
  const page = await signIn(browser, "Ruwan Silva");
  await page.goto("/w/abc-engineering/customers");
  await page.getByRole("link", { name: /Sunrise Dental Clinic/ }).first().click();
  await expect(page.getByRole("heading", { name: "Sunrise Dental Clinic" })).toBeVisible();
  await expect(page.getByText("Active jobs")).toBeVisible();
  // A dispatcher runs work, not money: balances are for people who can see invoices.
  await expect(page.getByText("Open balance")).toHaveCount(0);
  await page.getByRole("link", { name: /^Activity/ }).click();
  await expect(page.getByText(/Invoice INV-\d+ issued/).first()).toBeVisible();
  await page.getByRole("link", { name: /^Notes/ }).click();
  await expect(page.getByText(/prefers a call before any work above Rs 25,000/i)).toBeVisible();

  await page.getByRole("link", { name: "Create work order" }).click();
  await expect(page.getByLabel("Customer", { exact: true })).toHaveValue(/.+/);
  const title = `Waiting-room extractor fan ${Date.now().toString().slice(-5)}`;
  await page.getByLabel("Title").fill(title);
  await page.getByRole("button", { name: "Create work order" }).click();
  await page.waitForURL(/\/work-orders\/\d+/);
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
});

test("a recurring service creates real work orders", async ({ browser }) => {
  const page = await signIn(browser, "Ruwan Silva");
  await page.goto("/w/abc-engineering/recurring");
  await page.getByRole("link", { name: "Create recurring service" }).first().click();
  const title = `Weekly inspection ${Date.now().toString().slice(-5)}`;
  await page.getByLabel("Customer").selectOption({ label: "Green Leaf Café" });
  await page.getByLabel("Service", { exact: true }).fill(title);
  await page.getByLabel("Every", { exact: true }).fill("1");
  await page.getByLabel("Unit").selectOption("week");
  await page.getByLabel("On", { exact: true }).selectOption("0"); // Monday
  await expect(page.getByText(/Every Monday — first visit/)).toBeVisible();
  await page.getByRole("button", { name: "Create recurring service" }).click();

  await page.waitForURL(/\/recurring\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  // The visits inside the next two weeks exist as ordinary work orders.
  const visit = page.getByRole("link", { name: /WO-\d+/ }).first();
  await expect(visit).toBeVisible();
  await visit.click();
  await page.waitForURL(/\/work-orders\/\d+/);
  await expect(page.getByRole("heading", { name: title })).toBeVisible();

  // Pausing stops new visits but leaves history alone.
  await page.goBack();
  await page.getByRole("button", { name: "Pause" }).click();
  await expect(page.getByText("Paused", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: /WO-\d+/ }).first()).toBeVisible();
});

test("the server refuses what a role may not do, whatever the UI shows", async ({ browser }) => {
  // A homeowner cannot see any provider's dispatch, settings or customers.
  const homeowner = await signIn(browser, "Tharushi Wijesinghe");
  for (const path of ["dispatch", "schedule", "customers", "settings", "settings/members", "recurring", "invoices"]) {
    const res = await homeowner.goto(`/w/abc-engineering/${path}`);
    expect(res?.status(), path).toBe(404);
  }

  // Finance has no dispatch tools; a dispatcher has no billing settings.
  const finance = await signIn(browser, "Ruwan Silva");
  expect((await finance.goto("/w/abc-engineering/settings/billing"))?.status()).toBe(404);
  expect((await finance.goto("/w/abc-engineering/settings/members"))?.status()).toBe(200);

  // An independent professional has no dispatch board or enterprise procurement.
  const solo = await signIn(browser, "Nimal Fernando");
  expect((await solo.goto("/w/fernando-plumbing/dispatch"))?.status()).toBe(404);
  expect((await solo.goto("/w/fernando-plumbing/providers"))?.status()).toBe(404);
  // …and cannot open another organization's work.
  expect((await solo.goto("/w/abc-engineering"))?.status()).toBe(404);
});
