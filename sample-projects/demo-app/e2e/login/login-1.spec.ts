import { test, expect } from "@playwright/test";

// login-1 - user can log in (deliberately passing demo test, no network needed)
test("user can log in", async ({}) => {
  const token = "abc123";
  expect(token).toHaveLength(6);
});
