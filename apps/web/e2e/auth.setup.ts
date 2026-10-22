import { test as setup } from "@playwright/test";
import { createOwner, ownerState, signIn } from "./fixtures";

// Two owner accounts: A for most specs, B to prove A's data is invisible to another user.
for (const who of ["a", "b"] as const) {
  setup(`owner ${who}`, async ({ page }) => {
    await createOwner(page, `owner-${who}@e2e.test`, `Owner ${who.toUpperCase()}`);
    await signIn(page, `owner-${who}@e2e.test`);
    await page.context().storageState({ path: ownerState(who) });
  });
}
