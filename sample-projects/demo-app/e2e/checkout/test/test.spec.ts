import { test, expect } from "@playwright/test";

// test - test
test("test", async ({ page }) => {
  await page.goto("/");
  // TODO: implement checks for test
  await expect(page).toHaveURL(/./);
});
