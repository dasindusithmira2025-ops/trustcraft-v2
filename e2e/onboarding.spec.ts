import { expect, test } from "@playwright/test";

/**
 * Phase 2A: an independent professional creates an account and is guided to a working
 * workspace — progressively, resumably, with everything they chose actually saved.
 */
test("a solo professional signs up, sets up their services and area, and reaches their workspace", async ({ page }) => {
  const stamp = Date.now().toString().slice(-6);
  await page.goto("/signup?as=professional");
  await page.getByLabel("Your name").fill("Kamal Test");
  await page.getByLabel("Email").fill(`kamal${stamp}@solo.test`);
  await page.getByLabel("Password").fill("a-long-enough-passphrase");
  await page.getByRole("button", { name: "Create account" }).click();

  await page.waitForURL(/\/onboarding/);
  await expect(page.getByRole("heading", { name: "About you and your work" })).toBeVisible();
  await page.getByLabel("Business or trading name").fill(`Kamal Electrical ${stamp}`);
  await page.getByRole("button", { name: "Continue" }).click();

  // Services
  await expect(page.getByRole("heading", { name: "What do you do?" })).toBeVisible();
  await page.getByLabel("Electrical").check({ force: true });
  await page.getByRole("button", { name: "Continue" }).click();

  // Where — and leaving part-way is fine: setup resumes.
  await expect(page.getByRole("heading", { name: "Where do you work?" })).toBeVisible();
  await page.getByLabel("Nugegoda").check({ force: true });
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "When are you available?" })).toBeVisible();

  await page.goto("/"); // "Save and finish later" → the workspace, with a checklist for what is left
  await expect(page).toHaveURL(/\/w\/kamal-electrical/);
  await expect(page.getByRole("link", { name: "Today" }).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: /Finish setting up/ })).toBeVisible();
  await page.getByRole("link", { name: "Continue guided setup" }).click();
  await expect(page.getByRole("heading", { name: "When are you available?" })).toBeVisible();

  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Get ready to be verified" })).toBeVisible();
  await page.getByRole("link", { name: "Skip for now" }).click();
  await expect(page.getByRole("heading", { name: "You're set up" })).toBeVisible();
  await expect(page.getByText("Electrical", { exact: true })).toBeVisible();
  await expect(page.getByText("Nugegoda", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /^Open Kamal Electrical/ }).click();
  await expect(page).toHaveURL(/\/w\/kamal-electrical/);

  // What they chose is really saved.
  await page.goto(page.url().replace(/\/w\/([^/]+).*/, "/w/$1/settings/areas"));
  await expect(page.getByRole("checkbox", { name: "Nugegoda" })).toBeChecked();
});

test("an invitation only works for the person it was sent to", async ({ browser }) => {
  const owner = await (await browser.newContext()).newPage();
  await owner.goto("/login");
  await owner.getByRole("button", { name: /Nimal Fernando/ }).click();
  await owner.waitForURL((u) => !u.pathname.startsWith("/login"));
  await owner.goto("/w/fernando-plumbing/settings/members");
  const email = `helper${Date.now().toString().slice(-6)}@fernando.test`;
  await owner.getByLabel("Email address").fill(email);
  await owner.getByRole("button", { name: "Create invitation" }).click();
  const link = await owner.locator("code").innerText();
  expect(link).toContain("/invite/");

  // Someone else, signed in as a different account, is refused.
  const other = await (await browser.newContext()).newPage();
  await other.goto("/login");
  await other.getByRole("button", { name: /Tharushi Wijesinghe/ }).click();
  await other.waitForURL((u) => !u.pathname.startsWith("/login"));
  await other.goto(link);
  await expect(other.getByText(/this invitation is for/)).toBeVisible();

  // The invitee signs up from the link and joins.
  const invitee = await (await browser.newContext()).newPage();
  await invitee.goto(link);
  await invitee.getByRole("link", { name: "Create an account to join" }).click();
  await invitee.getByLabel("Your name").fill("Helper Test");
  await invitee.getByLabel("Email").fill(email);
  await invitee.getByLabel("Password").fill("a-long-enough-passphrase");
  await invitee.getByRole("button", { name: "Create account" }).click();
  await invitee.getByRole("button", { name: /^Join Nimal Fernando Plumbing/ }).click();
  await invitee.waitForURL(/\/field|\/w\/fernando-plumbing/);
});
