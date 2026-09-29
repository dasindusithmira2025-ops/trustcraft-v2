import { expect, test } from "@playwright/test";

/** Production auth hardening: throttling, honest-but-uninformative errors, cookie flags, and revocation. */

test("repeated failed sign-ins are throttled per account, and the error never reveals which accounts exist", async ({ page }) => {
  const stamp = Date.now().toString().slice(-6);
  const attempt = async (email: string) => {
    await page.goto("/login");
    await page.getByLabel(/email/i).fill(email);
    await page.getByLabel("Password").fill("definitely-wrong-password");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.locator("#signin-error")).toBeVisible();
  };

  // A real account and a made-up one get the identical message.
  await attempt("nimal@fernandoplumbing.test");
  const real = await page.locator("#signin-error").innerText();
  await attempt(`nobody${stamp}@example.test`);
  const unknown = await page.locator("#signin-error").innerText();
  expect(real).toBe(unknown);
  expect(real).toMatch(/don't match an account/);

  // Six tries are allowed per account; the seventh is blocked — even for an account that does not exist.
  const target = `locked${stamp}@example.test`;
  for (let i = 0; i < 7; i++) await attempt(target);
  await expect(page.locator("#signin-error")).toContainText(/Too many sign-in attempts/);
});

test("the session cookie is locked down, and changing a password signs out other devices", async ({ browser }) => {
  const stamp = Date.now().toString().slice(-6);
  const email = `secure${stamp}@example.test`;
  const password = "first-long-passphrase";

  const phone = await (await browser.newContext()).newPage();
  await phone.goto("/signup?as=consumer");
  await phone.getByLabel("Your name").fill("Security Test");
  await phone.getByLabel("Email").fill(email);
  await phone.getByLabel("Password").fill(password);
  await phone.getByRole("button", { name: "Create account" }).click();
  await phone.waitForURL(/\/home/);

  const cookie = (await phone.context().cookies()).find((c) => c.name.endsWith("tc_session"))!;
  expect(cookie.httpOnly).toBe(true);
  expect(cookie.sameSite).toBe("Lax");
  expect(cookie.secure).toBe(true);
  expect(cookie.name).toBe("__Host-tc_session");

  // A second device signs in with the same account.
  const laptop = await (await browser.newContext()).newPage();
  await laptop.goto("/login");
  await laptop.getByLabel(/email/i).fill(email);
  await laptop.getByLabel("Password").fill(password);
  await laptop.getByRole("button", { name: "Sign in", exact: true }).click();
  await laptop.waitForURL(/\/home/);

  // A wrong current password is refused.
  await phone.goto("/account");
  await phone.getByLabel("Current password").fill("not-my-password");
  await phone.getByLabel("New password").fill("second-long-passphrase");
  await phone.getByRole("button", { name: "Change password" }).click();
  await expect(phone.getByText("That isn't your current password.")).toBeVisible();

  // The phone changes it properly; the laptop is signed out at its next request, the phone stays in.
  await phone.getByLabel("Current password").fill(password);
  await phone.getByLabel("New password").fill("second-long-passphrase");
  await phone.getByRole("button", { name: "Change password" }).click();
  await expect(phone.getByText(/Password changed/)).toBeVisible();
  await laptop.goto("/home");
  await expect(laptop).toHaveURL(/\/login/);
  await phone.goto("/home");
  await expect(phone).toHaveURL(/\/home/);
});
