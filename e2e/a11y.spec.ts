import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/**
 * WCAG 2.2 A/AA rules (axe-core) over the main screens of every experience, in both themes on a desktop
 * and a phone. Automated rules catch contrast, names, roles, target size and keyboard reachability; they
 * do not replace a manual screen-reader pass.
 */

const abc = "/w/abc-engineering";
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "phone", width: 390, height: 844 },
];

const people: { who: string; paths: string[] }[] = [
  { who: "Ruwan Silva", paths: [abc, `${abc}/dispatch`, `${abc}/schedule`, `${abc}/schedule?view=month`, `${abc}/work-orders?split=1`, `${abc}/customers`, `${abc}/recurring`, `${abc}/notifications`] },
  { who: "Anura Bandara", paths: [`${abc}/invoices`, `${abc}/reports`, `${abc}/settings`, `${abc}/settings/hours`, `${abc}/settings/roles`] },
  { who: "Kasun Perera", paths: ["/field"] },
  { who: "Tharushi Wijesinghe", paths: ["/home", "/home/request"] },
  { who: "Dilani Jayawardena", paths: ["/w/meridian", "/w/meridian/assets"] },
  { who: "Malith Ranasinghe", paths: ["/admin", "/admin/users", "/admin/audit"] },
];

async function scan(page: Page, label: string) {
  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const summary = violations.map((v) => `${v.id} (${v.impact}) ×${v.nodes.length}: ${v.nodes[0]?.target.join(" ")}`);
  expect(summary, label).toEqual([]);
}

for (const theme of ["light", "dark"] as const) {
  for (const vp of VIEWPORTS) {
    test(`no WCAG A/AA violations — ${theme}, ${vp.name}`, async ({ browser }) => {
      test.setTimeout(240_000);
      const newPage = async () => {
        const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, colorScheme: theme });
        await ctx.addInitScript((t) => localStorage.setItem("tc-theme", t), theme);
        return ctx.newPage();
      };

      const visitor = await newPage();
      for (const path of ["/login", "/signup"]) {
        await visitor.goto(path);
        await scan(visitor, `${path} · ${theme} · ${vp.name}`);
      }
      await visitor.context().close();

      for (const { who, paths } of people) {
        const page = await newPage();
        await page.goto("/login");
        await page.getByRole("button", { name: new RegExp(who) }).click();
        await page.waitForURL((u) => !u.pathname.startsWith("/login"));
        for (const path of paths) {
          await page.goto(path, { waitUntil: "networkidle" });
          await scan(page, `${who} · ${path} · ${theme} · ${vp.name}`);
        }
        await page.context().close();
      }
    });
  }
}
