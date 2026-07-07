import { test, expect } from "@playwright/test";

// sdds - tests
test("tests", async ({ page }) => {
  await page.goto("/");
  // TODO: implement checks for sdds
  await expect(page).toHaveURL(/./);
});
