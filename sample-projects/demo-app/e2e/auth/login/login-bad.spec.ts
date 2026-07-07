import { test, expect } from "@playwright/test";
// auth/login - wrong credentials (intentionally failing)
test("login with wrong password", async () => { expect("denied").toBe("granted"); });
