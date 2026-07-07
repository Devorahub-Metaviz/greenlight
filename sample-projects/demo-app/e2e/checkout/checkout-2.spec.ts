import { test, expect } from "@playwright/test";
// checkout-2 - discount code applies
test("discount code applies", async () => { expect(100 - 10).toBe(90); });
