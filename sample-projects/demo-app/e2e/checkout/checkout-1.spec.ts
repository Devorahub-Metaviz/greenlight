import { test, expect } from "@playwright/test";

// checkout-1 - deliberately failing demo test to show a red badge
test("checkout total is correct", async ({}) => {
  const total = 100 + 20;
  expect(total).toBe(999); // intentionally wrong
});
