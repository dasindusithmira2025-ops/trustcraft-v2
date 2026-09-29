import { expect, type Browser, type Page } from "@playwright/test";

/** Signs in through the development demo shortcut, in its own isolated browser session. */
export async function signIn(browser: Browser, name: string | RegExp): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto("/login");
  await page.getByRole("button", { name: typeof name === "string" ? new RegExp(name) : name }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
  return page;
}

/** A calendar day in Sri Lanka, `days` from now, as YYYY-MM-DD (what date inputs want). */
export function dayFromNow(days: number, timeZone = "Asia/Colombo"): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(Date.now() + days * 86_400_000));
}

/**
 * Completes the assignment sheet once it is open. Scheduling warnings depend on the time of day the
 * suite runs (business hours, SLA), so this gives a reason only if — and when — the server asks for one.
 */
export async function submitAssignment(page: Page, reason = "Customer has no other slot") {
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByText("Checking the schedule…")).toHaveCount(0);
  const warned = await sheet.getByLabel("Why go ahead anyway?").isVisible();
  if (warned) await sheet.getByLabel("Why go ahead anyway?").fill(reason);
  await sheet.getByRole("button", { name: warned ? "Assign anyway" : "Assign and notify technician" }).click();
  await expect(sheet).toHaveCount(0);
  return warned;
}
