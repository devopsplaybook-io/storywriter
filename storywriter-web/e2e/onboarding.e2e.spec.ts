import { expect, test } from "@playwright/test";

/**
 * First-run onboarding flow on the login page. The initialization-status
 * request is intercepted with page.route so the tests are deterministic and
 * independent of the (shared, already bootstrapped) throwaway database that
 * e2e/serve.sh boots — see xss-media.e2e.spec.ts which creates the first user.
 */

const INIT_URL = "**/api/users/status/initialization";

test("a fresh (uninitialized) server offers admin account creation", async ({
  page,
}) => {
  let requestedUrl = "";
  await page.route(INIT_URL, async (route) => {
    requestedUrl = route.request().url();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ initialized: false }),
    });
  });

  await page.goto("/login");

  const button = page.getByRole("button", { name: "Create Admin Account" });
  await expect(button).toBeVisible();
  await expect(page.getByText("Create your admin account to get started")).toBeVisible();
  await expect(page.getByLabel("Confirm Password")).toBeVisible();
  expect(requestedUrl).toContain("/api/users/status/initialization");
});

test("a failed initialization check surfaces an error instead of hiding setup", async ({
  page,
}) => {
  await page.route(INIT_URL, async (route) => {
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: "boom" }),
    });
  });

  await page.goto("/login");

  await expect(
    page.getByText("Could not determine setup state"),
  ).toBeVisible();
  // The plain login form stays usable
  await expect(page.getByRole("button", { name: "Login" })).toBeVisible();
});

test("an initialized server shows the plain login form", async ({ page }) => {
  await page.route(INIT_URL, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ initialized: true }),
    });
  });

  await page.goto("/login");

  await expect(page.getByRole("button", { name: "Login" })).toBeVisible();
  await expect(page.getByLabel("Confirm Password")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Create Admin Account" }),
  ).toHaveCount(0);
});
