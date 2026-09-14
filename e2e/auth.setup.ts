import { expect, test as setup } from "@playwright/test";
import { waitForHydration } from "./hydration";

const authFile = "playwright/.auth/user.json";

setup("authenticate as the seeded owner", async ({ page }) => {
  await page.goto("/auth/signin");
  await waitForHydration(page);

  await page.getByLabel("Email").fill("owner@example.com");
  await page.getByLabel("Password", { exact: true }).fill("haslo12345");
  await page.getByRole("button", { name: "Sign in" }).click();

  await page.waitForURL("**/dashboard");
  await expect(page.getByRole("heading", { name: "Godziny otwarcia" })).toBeVisible();

  await page.context().storageState({ path: authFile });
});
