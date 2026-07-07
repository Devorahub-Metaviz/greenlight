import { test, expect } from "@playwright/test";
// search-2 - empty query shows hint (intentionally failing)
test("empty query shows hint", async () => { expect("").toBe("please type"); });
