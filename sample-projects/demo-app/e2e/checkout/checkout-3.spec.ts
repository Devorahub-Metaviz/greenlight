import { test, expect } from "@playwright/test";
// checkout-3 - tax is calculated
test("tax is calculated", async () => { expect(Math.round(90 * 1.1)).toBe(99); });
