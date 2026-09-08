import { expect, test, type Browser, type Page } from "@playwright/test";

const E2E_SCENARIO_HEADER = "x-e2e-scenario";
const TEST_ADMIN_PASSWORD = "e2e-admin-password";

async function gotoScenario(page: Page, scenario: "bracket" | "champion") {
  await page.setExtraHTTPHeaders({ [E2E_SCENARIO_HEADER]: scenario });
  await page.goto("/");
}

test("race phase renders standings, lock countdown, and projected pairings", async ({
  page,
}) => {
  await page.goto("/");

  await expect(page.getByRole("banner").getByText("Race to the Bottom")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Lander's League Loser Bowl", level: 1 }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Regular Season Standings" }),
  ).toBeVisible();
  await expect(page.getByRole("banner").getByText(/Bowl weeks/)).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Round 1 Pairings" }),
  ).toBeVisible();
  await expect(page.getByText("E2E Team 09").first()).toBeVisible();
  await expect(page.getByText("Seed 16").first()).toBeVisible();
});

test("bracket phase renders mixed matchup states and TBD slots", async ({ page }) => {
  await gotoScenario(page, "bracket");

  await expect(page.getByRole("banner").getByText("Loser Bowl Bracket")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Loser Bowl Bracket", level: 2 }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Round 1", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Semifinals", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Final", exact: true }).first(),
  ).toBeVisible();
  await expect(page.getByText("final").first()).toBeVisible();
  await expect(page.getByText("provisional").first()).toBeVisible();
  await expect(page.getByText("under review").first()).toBeVisible();
  await expect(page.getByText("pending").first()).toBeVisible();
  await expect(page.getByText("TBD").first()).toBeVisible();
  await expect(page.getByText("Commissioner review in progress")).toBeVisible();
});

test("champion phase renders winner, final link, and final detail page", async ({
  page,
}) => {
  await gotoScenario(page, "champion");

  await expect(page.getByRole("banner").getByText("Champion Crowned")).toBeVisible();
  await expect(page.getByText("E2E Team 16").first()).toBeVisible();
  await expect(page.getByText("Final settled")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Full Bracket" }),
  ).toBeVisible();

  await page.getByRole("link", { name: "View the final matchup" }).click();

  await expect(page).toHaveURL(/\/matchup\/final$/);
  await expect(page.getByRole("heading", { name: "Final" })).toBeVisible();
  await expect(
    page.getByText("Final result: E2E Team 16 advanced"),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Category Stat Lines" }),
  ).toBeVisible();
});

test("admin password gate authenticates per browser context", async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();

  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/login$/);

  await page.getByLabel("Admin password").fill("wrong-password");
  await page.getByRole("button", { name: "Enter admin" }).click();

  await expect(page).toHaveURL(/\/admin\/login\?error=invalid$/);
  await expect(page.getByText("Password did not match.")).toBeVisible();

  await page.getByLabel("Admin password").fill(TEST_ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Enter admin" }).click();

  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole("heading", { name: "Admin" })).toBeVisible();

  const freshPage = await newUnauthenticatedAdminPage(browser, baseURL);

  await freshPage.goto("/admin");
  await expect(freshPage).toHaveURL(/\/admin\/login$/);
  await expect(
    freshPage.getByRole("heading", { name: "Loser Bowl Admin" }),
  ).toBeVisible();

  await freshPage.context().close();
  await context.close();
});

async function newUnauthenticatedAdminPage(
  browser: Browser,
  baseURL: string | undefined,
): Promise<Page> {
  const context = await browser.newContext({ baseURL });

  return context.newPage();
}
