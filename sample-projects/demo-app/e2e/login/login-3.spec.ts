import { test, expect } from "@playwright/test";
// login-3 - wrong password shows error (intentionally failing)
test("wrong password shows error", async () => { expect("locked").toBe("unlocked"); });
