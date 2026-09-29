import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

// A real 1×1 PNG — small, but a genuine file travelling the whole pipeline.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

test("a technician captures a photo that is uploaded, verified and served only to people on the job", async ({ browser }) => {
  const tech = await signIn(browser, "Kasun Perera");
  await tech.goto("/field");
  await tech.getByRole("link", { name: /HVAC cooling failure/ }).first().click();
  await tech.waitForURL(/\/field\/jobs\/\d+/);

  // Camera first: the shot goes into the hidden camera input, then one tap to save.
  await tech.locator("input[type=file][capture]").setInputFiles({ name: "coil.png", mimeType: "image/png", buffer: PNG });
  await tech.getByLabel("What does it show?").fill("Iced coil, test photo");
  await tech.getByRole("button", { name: "Save photo" }).click();
  await expect(tech.getByText("Saved to the job")).toBeVisible();

  // It is really on the job: after a reload the gallery serves it from the authenticated route.
  await tech.reload();
  const img = tech.getByRole("img", { name: "Iced coil, test photo" });
  await expect(img).toBeVisible();
  await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(0);
  const src = await img.getAttribute("src");
  expect(src).toMatch(/^\/api\/evidence\/[0-9a-f-]{36}$/);

  // Other people cannot fetch it: a homeowner with no link to this job, and someone signed out.
  const outsider = await signIn(browser, "Tharushi Wijesinghe");
  expect((await outsider.request.get(src!)).status()).toBe(404);
  const anon = await (await browser.newContext()).request.get(new URL(src!, tech.url()).toString());
  expect(anon.status()).toBe(401);

  // The upload route itself refuses cross-site and signed-out writes.
  const forged = await tech.request.put("/api/uploads/00000000-0000-4000-8000-000000000000", { headers: { origin: "https://evil.example", "content-type": "image/png" }, data: PNG });
  expect(forged.status()).toBe(403);
  const noSession = await (await browser.newContext()).request.put("/api/uploads/00000000-0000-4000-8000-000000000000", { headers: { origin: new URL(tech.url()).origin, "content-type": "image/png" }, data: PNG });
  expect(noSession.status()).toBe(401);
});

test("parts used and 'on my way' reach the record", async ({ browser }) => {
  const tech = await signIn(browser, "Kasun Perera");
  await tech.goto("/field");
  await tech.getByRole("link", { name: /HVAC cooling failure/ }).first().click();
  await tech.getByLabel("Qty").fill("2");
  await tech.getByLabel("Part or material").fill("Evaporator fan capacitor");
  await tech.getByRole("button", { name: "Add" }).click();
  await expect(tech.getByText("Evaporator fan capacitor")).toBeVisible();
  await expect(tech.getByText("Before you complete")).toBeVisible();

  // Setting off: the button becomes a fact, and the office can see it.
  await tech.goto("/field");
  await tech.getByRole("link", { name: /Waiting-room AC not cooling/ }).first().click();
  await tech.getByRole("button", { name: "On my way" }).click();
  await expect(tech.getByText(/On the way since/)).toBeVisible();

  const dispatcher = await signIn(browser, "Ruwan Silva");
  await dispatcher.goto("/w/abc-engineering/work-orders?view=all&q=Waiting-room AC");
  await dispatcher.getByRole("link", { name: /Waiting-room AC/ }).first().click();
  await expect(dispatcher.getByText("Kasun Perera is on the way")).toBeVisible();
});
