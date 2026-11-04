/**
 * Main flow on the seeded demo data (npx prisma db seed): agent reserves -> sells -> records a payment;
 * accountant confirms -> receipt PDF; and an agent cannot open another agent's sale.
 */
import { test, expect, type Page } from "@playwright/test";

async function login(page: Page, email: string) {
  await page.context().clearCookies();
  await page.goto("/login");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', "password123");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/dashboard/);
}

test("lead to receipt", async ({ page, request }, info) => {
  const tag = `${info.project.name}-${Date.now() % 1_000_000}`;
  const buyer = `E2E Buyer ${tag}`;
  page.on("dialog", (d) => d.accept());
  await login(page, "agent@demo.et");
  await page.goto("/inventory");
  await page.getByRole("link", { name: /Bole Heights/ }).first().click();
  await page.getByRole("link", { name: "Reserve →" }).first().click();
  await page.fill('input[name="fullName"]', buyer);
  await page.fill('input[name="phone"]', `097${String(Date.now()).slice(-7)}`);
  await page.getByRole("button", { name: "Reserve unit" }).click();
  await expect(page.getByText(/reserved for \d+ days/)).toBeVisible();

  await page.goto("/reservations");
  await page.locator("tr", { hasText: buyer }).getByRole("link", { name: "Make it a sale" }).click();
  await page.fill('input[name="contractNo"]', `E2E-${tag}`);
  await page.selectOption('select[name="planType"]', "INSTALLMENT");
  await page.getByRole("button", { name: /Create sale/ }).click();
  await expect(page.getByText("Sale created")).toBeVisible();
  const saleUrl = page.url().split("?")[0];

  await page.fill('#pay input[name="amount"]', "100000");
  await page.selectOption('#pay select[name="method"]', "TELEBIRR");
  await page.fill('#pay input[name="reference"]', `TB${tag}`);
  await page.locator("#pay").getByRole("button", { name: "Record payment" }).click();
  await expect(page.getByText(/counts toward the balance once the accountant confirms/)).toBeVisible();

  await login(page, "accountant@demo.et");
  await page.goto(saleUrl);
  await page.locator("tr", { hasText: `TB${tag}` }).getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByText(/Receipt no\. \d+ issued/)).toBeVisible();
  const pdfHref = await page.locator("tr", { hasText: `TB${tag}` }).getByRole("link", { name: "PDF" }).getAttribute("href");
  const res = await request.get(pdfHref!, { headers: { cookie: (await page.context().cookies()).map((c) => `${c.name}=${c.value}`).join("; ") } });
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toBe("application/pdf");
  expect((await res.body()).subarray(0, 4).toString()).toBe("%PDF");

  // Confirmed payments are locked: no reverse button for agents, reverse button for the accountant.
  await expect(page.locator("tr", { hasText: `TB${tag}` }).getByRole("button", { name: "Reverse" })).toBeVisible();
});

test("an agent cannot open another agent's sale", async ({ page }) => {
  await login(page, "agent2@demo.et");
  await page.goto("/deals");
  const href = await page.locator('a[href^="/deals/c"]').first().getAttribute("href");
  await login(page, "agent@demo.et");
  const res = await page.goto(href!);
  expect(res?.status()).toBe(404);
});
