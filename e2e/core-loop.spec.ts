import { expect, test } from "@playwright/test";
import { signIn, submitAssignment } from "./helpers";

/**
 * Phase 1 proof: Need → Provider → Quote → Work → Evidence → Completion → Payment → Trust,
 * driven by two real accounts in separate sessions. Runs against the seeded demo world
 * and creates fresh records each time.
 */

test("a homeowner gets a plumbing job quoted, done, verified, paid and reviewed", async ({ browser }) => {
  const customer = await signIn(browser, "Tharushi Wijesinghe");
  const pro = await signIn(browser, "Nimal Fernando");
  const stamp = Date.now().toString().slice(-5);

  // Need — described in plain words; the classifier picks the trade.
  await customer.goto("/home");
  await customer.getByLabel("Describe the problem").fill(`Bathroom tap dripping constantly and the basin drain is slow (${stamp})`);
  await customer.getByRole("button", { name: "Find help" }).click();
  await expect(customer.getByRole("radio", { name: "Plumbing" })).toBeChecked();
  await customer.getByLabel("Area").selectOption("Nugegoda");
  await customer.getByLabel("Address").fill("No. 27/3, Stanley Thilakaratne Mawatha");
  await customer.getByRole("button", { name: "See matched professionals" }).click();

  // Provider — matched and explained; ask two for quotes.
  await expect(customer.getByText("Why we suggest them").first()).toBeVisible();
  await customer.getByRole("button", { name: "Ask for quotes" }).click();
  await customer.waitForURL(/\/home\/requests\/\d+/);
  const requestNumber = customer.url().split("/").pop()!;

  // Quote — the independent plumber prices it line by line.
  await pro.goto(`/w/fernando-plumbing/requests/${requestNumber}`);
  await pro.getByLabel("Line 1 amount").fill("1,500");
  await pro.getByLabel("Line 2 amount").fill("3,500");
  await expect(pro.getByText("Rs 5,000").last()).toBeVisible(); // subtotal and total
  await pro.getByRole("button", { name: "Send quote" }).click();
  await expect(pro.getByRole("heading", { name: /^Quote Q-/ })).toBeVisible();

  // Book — accepting creates the work order.
  await customer.reload();
  await customer.getByRole("button", { name: "Book for Rs 5,000" }).click();
  await customer.getByRole("alertdialog").getByRole("button", { name: "Book for Rs 5,000" }).click();
  await customer.waitForURL(/\/home\/work\/\d+/);
  const woNumber = customer.url().split("/").pop()!;

  // Work — schedule, check in, complete with a note the customer will read.
  await pro.goto(`/w/fernando-plumbing/work-orders/${woNumber}`);
  await pro.getByRole("button", { name: "Assign technician" }).click();
  await pro.getByText("Nimal Fernando", { exact: true }).last().click();
  await submitAssignment(pro);
  await expect(pro.getByText("Scheduled").first()).toBeVisible();
  await pro.getByRole("button", { name: "Start job" }).click();
  await expect(pro.getByRole("button", { name: "Complete work" })).toBeVisible();
  await pro.getByRole("button", { name: "Complete work" }).click();
  await pro.getByLabel("What was done?").fill("Replaced the tap washer and cleared the basin trap. No more drips.");
  await pro.getByRole("dialog").getByRole("button", { name: "Complete work" }).click();
  await expect(pro.getByText(/waiting for the customer to verify/)).toBeVisible();

  // The provider can never verify its own work.
  await expect(pro.getByRole("button", { name: "Verify work" })).toHaveCount(0);

  // Completion → payment → review, by the customer.
  await customer.reload();
  await expect(customer.getByText("Replaced the tap washer")).toBeVisible();
  await customer.getByRole("button", { name: "Verify work" }).click();
  await customer.getByRole("alertdialog").getByRole("button", { name: "Verify work" }).click();
  await customer.getByRole("button", { name: "Pay Rs 5,000" }).click();
  await expect(customer.getByText(/Paid Rs\s5,000/)).toBeVisible(); // currency uses a non-breaking space
  await customer.getByLabel("5 — Excellent").check({ force: true });
  const review = `Quick, tidy and exactly the quoted price (${stamp}).`;
  await customer.getByLabel("Anything others should know?").fill(review);
  await customer.getByRole("button", { name: "Post review" }).click();
  await expect(customer.getByText("You rated this job 5 out of 5")).toBeVisible();

  // Trust — the verified job now shows on the public profile.
  await customer.goto("/pros/fernando-plumbing");
  await expect(customer.getByText(review)).toBeVisible();

  // Audit — every step is on the provider's timeline.
  await pro.reload();
  for (const event of ["Booked by Tharushi Wijesinghe", "Assigned to Nimal Fernando", "Checked in on site", "Verified by Tharushi Wijesinghe", "Rated 5 out of 5"]) {
    await expect(pro.getByText(event, { exact: false }).first()).toBeVisible();
  }
});

test("people outside an organization cannot open its workspace or work orders", async ({ browser }) => {
  const customer = await signIn(browser, "Tharushi Wijesinghe");
  const res = await customer.goto("/w/abc-engineering/work-orders");
  expect(res?.status()).toBe(404);
  const api = await customer.request.get("/api/search?org=abc-engineering&q=hvac");
  expect(api.status()).toBe(404);
});
