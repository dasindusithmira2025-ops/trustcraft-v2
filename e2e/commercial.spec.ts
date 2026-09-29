import { expect, test } from "@playwright/test";
import { signIn, submitAssignment } from "./helpers";

const PDF = Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF");

// Both tests below revise Nimal's one seeded quote for the blocked sink, and the second one books it. Tests in a file run in
// order, so this file owns that quote — no other spec may touch it, or parallel files would race for it.
test("a quote attachment reaches the customer and no competing provider", async ({ browser }) => {
  const pro = await signIn(browser, "Nimal Fernando");
  await pro.goto("/w/fernando-plumbing/requests?view=quoted");
  await pro.getByRole("link", { name: /Kitchen sink blocked/ }).first().click();
  await pro.waitForURL(/\/requests\/\d+/);
  const requestNumber = pro.url().match(/\/requests\/(\d+)/)![1]!;
  await pro.getByRole("link", { name: "Revise quote" }).click();
  await pro.locator("input[type=file]").setInputFiles({ name: "trap-datasheet.pdf", mimeType: "application/pdf", buffer: PDF });
  await expect(pro.getByText("trap-datasheet.pdf")).toBeVisible();
  await expect(pro.getByLabel("Remove trap-datasheet.pdf")).toBeVisible();
  await expect.poll(() => pro.locator("input[name=attachmentId]").count()).toBe(1); // verified by the server before it counts
  await pro.getByRole("button", { name: "Send revised quote" }).click();
  await expect(pro.getByText("Quote sent")).toBeVisible();

  const customer = await signIn(browser, "Tharushi Wijesinghe");
  await customer.goto(`/home/requests/${requestNumber}`);
  const link = customer.getByRole("link", { name: "trap-datasheet.pdf" });
  await expect(link).toBeVisible();
  const href = (await link.getAttribute("href"))!;
  expect((await customer.request.get(href)).status()).toBe(200);

  // ABC Engineering was invited to the same request but must not see Nimal's file.
  const rival = await signIn(browser, "Ruwan Silva");
  expect((await rival.request.get(href)).status()).toBe(404);
});

/**
 * Phase 2 commercial workflow: a provider revises its quote, the customer books it, the work is
 * done and verified, the invoice carries the quote's own figures, a part-payment is recorded, and
 * the customer settles the rest.
 */
test("quote revision → booking → completion → invoice → part-payment → settled", async ({ browser }) => {
  const pro = await signIn(browser, "Nimal Fernando");
  const customer = await signIn(browser, "Tharushi Wijesinghe");

  // Quote — Nimal already quoted the blocked sink; he revises it with a discount.
  await pro.goto("/w/fernando-plumbing/requests?view=quoted");
  await pro.getByRole("link", { name: /Kitchen sink blocked/ }).first().click();
  await pro.waitForURL(/\/requests\/\d+/);
  const requestNumber = pro.url().match(/\/requests\/(\d+)/)![1]!;
  await expect(pro.getByText("Rs 6,500").first()).toBeVisible();
  await pro.getByRole("link", { name: "Revise quote" }).click();
  await pro.getByLabel("Discount").fill("500");
  await expect(pro.getByLabel("Line 1 total")).toBeVisible();
  await pro.getByRole("button", { name: "Send revised quote" }).click();
  await expect(pro.getByText("Quote sent")).toBeVisible();

  // The customer sees the revised quote — itemised, with what happens next — and books it.
  await customer.goto(`/home/requests/${requestNumber}`);
  await expect(customer.getByText("What happens next").first()).toBeVisible();
  await expect(customer.getByText("Discount")).toBeVisible();
  await customer.getByRole("button", { name: "Book for Rs 6,000" }).click();
  await customer.getByRole("alertdialog").getByRole("button", { name: "Book for Rs 6,000" }).click();
  await customer.waitForURL(/\/home\/work\/\d+/);
  const woNumber = customer.url().split("/").pop()!;

  // Work — scheduled, started, completed with a note.
  await pro.goto(`/w/fernando-plumbing/work-orders/${woNumber}`);
  await pro.getByRole("button", { name: "Assign technician" }).click();
  await pro.getByRole("dialog").getByText("Nimal Fernando", { exact: true }).click();
  await submitAssignment(pro);
  await pro.getByRole("button", { name: "Start job" }).click();
  await pro.getByRole("button", { name: "Complete work" }).click();
  await pro.getByLabel("What was done?").fill("Cleared the blockage with the drain machine and fitted a new PVC trap.");
  await pro.getByRole("dialog").getByRole("button", { name: "Complete work" }).click();
  await expect(pro.getByText(/waiting for the customer to verify/)).toBeVisible();

  // Verification issues the invoice from the quote: same lines, same discount.
  await customer.reload();
  await customer.getByRole("button", { name: "Verify work" }).click();
  await customer.getByRole("alertdialog").getByRole("button", { name: "Verify work" }).click();
  await expect(customer.getByRole("button", { name: "Pay Rs 6,000" })).toBeVisible();

  await pro.goto("/w/fernando-plumbing/invoices");
  await pro.getByRole("link", { name: new RegExp(`for WO-${woNumber}`) }).click();
  await expect(pro.getByRole("heading", { name: /^INV-\d+/ })).toBeVisible();
  await expect(pro.getByText("Clear blockage with drain machine")).toBeVisible();
  await expect(pro.getByText("Discount", { exact: true })).toBeVisible();
  await expect(pro.getByText("Awaiting payment").first()).toBeVisible();

  // A part-payment received outside TrustCraft.
  await pro.getByRole("button", { name: "Record payment" }).click();
  await pro.getByRole("dialog").getByLabel(/Amount received/).fill("2,000");
  await pro.getByRole("dialog").getByRole("button", { name: "Mark as paid" }).click();
  await expect(pro.getByText("Partly paid").first()).toBeVisible();
  await expect(pro.getByText("Balance due").first()).toBeVisible();

  // More than is owed is refused by the server.
  await pro.getByRole("button", { name: "Record payment" }).click();
  await pro.getByRole("dialog").getByLabel(/Amount received/).fill("99,999");
  await pro.getByRole("dialog").getByRole("button", { name: "Mark as paid" }).click();
  await expect(pro.getByRole("dialog").getByText(/more than the balance/)).toBeVisible();
  await pro.keyboard.press("Escape");

  // The customer pays only what is left.
  await customer.reload();
  await expect(customer.getByText(/Rs\s2,000 of Rs\s6,000 already paid/)).toBeVisible();
  await customer.getByRole("button", { name: "Pay Rs 4,000" }).click();
  await expect(customer.getByText(/Paid Rs\s6,000/)).toBeVisible();

  await pro.reload();
  await expect(pro.getByText("Paid", { exact: true }).first()).toBeVisible();
  await expect(pro.getByText("Bank transfer", { exact: true })).toBeVisible();
  await expect(pro.getByText("Card (demo)", { exact: true })).toBeVisible();
});

test("nobody without invoicing rights can touch an invoice", async ({ browser }) => {
  // A dispatcher runs work, not money: the invoices area is not theirs.
  const dispatcher = await signIn(browser, "Ruwan Silva");
  expect((await dispatcher.goto("/w/abc-engineering/invoices"))?.status()).toBe(404);
  // A technician is sent to the field app, never a workspace page.
  const tech = await signIn(browser, "Kasun Perera");
  await tech.goto("/w/abc-engineering/invoices");
  await expect(tech).toHaveURL(/\/field/);
  // The owner can.
  const owner = await signIn(browser, "Anura Bandara");
  expect((await owner.goto("/w/abc-engineering/invoices"))?.status()).toBe(200);
  await expect(owner.getByText("Outstanding").first()).toBeVisible();
  await expect(owner.getByText("Who owes you")).toBeVisible();
});
