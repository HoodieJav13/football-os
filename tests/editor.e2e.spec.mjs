import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => window.localStorage.clear());
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Mesh", exact: true })).toBeVisible();
});

test("@desktop structured football filters define the browsing context", async ({ page }) => {
  await page.getByRole("button", { name: /^Filters/ }).click();
  await page.getByLabel("Protection / OL call").selectOption("Texas");
  await page.getByLabel("Play family").selectOption("Mesh");

  await expect(page.getByText("2 matching plays")).toBeVisible();
  await expect(page.getByRole("button", { name: "Open Mesh", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Open Mesh Sit", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Open Trips Right Stick", exact: true })).toHaveCount(0);

  await page.getByRole("button", { name: "Open Mesh Sit", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Mesh Sit", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Open Mesh", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Mesh", exact: true })).toBeVisible();
});

test("@desktop animation and presentation controls remain operational", async ({ page }) => {
  await page.getByRole("button", { name: "Run", exact: true }).click();
  await expect(page.getByRole("button", { name: "Pause", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Present", exact: true }).click();
  await expect(page.getByRole("button", { name: "Exit presentation" })).toBeVisible();
  await page.getByRole("button", { name: "Exit presentation" }).click({ force: true });
  await expect(page.getByRole("button", { name: "Present", exact: true })).toBeVisible();
});

test("@desktop verified reference books are protected and copy independently", async ({ page }) => {
  test.setTimeout(180_000);
  await page.locator(".playbook-trigger").click();
  await expect(page.getByRole("menuitem", { name: /Air Raid Reference/ })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: /LSU 2019 Reference/ })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: /Texas Tech Reference/ })).toBeVisible();
  await page.getByRole("menuitem", { name: /Air Raid Reference/ }).click();
  await expect(page.getByRole("heading", { name: "60 Hitch", exact: true })).toBeVisible();
  await expect(page.getByText("Concept · All Hitch", { exact: true })).toBeVisible();
  await expect(page.getByText("Reference", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Create a new play" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Route", exact: true })).toBeDisabled();

  await page.getByRole("button", { name: "Add to Personal Active" }).click();
  await page.locator(".playbook-trigger").click();
  await page.getByRole("menuitem", { name: /Personal Active/ }).click();
  await page.getByRole("button", { name: "Open 60 Hitch", exact: true }).click();
  await page.getByRole("button", { name: "More" }).click();
  await page.getByRole("menuitem", { name: "Play details" }).click();
  await page.getByLabel("Play name").fill("60 Hitch Edited");
  await page.getByRole("button", { name: "Save details" }).click();
  await expect(page.getByRole("heading", { name: "60 Hitch Edited", exact: true })).toBeVisible();

  await page.locator(".playbook-trigger").click();
  await page.getByRole("menuitem", { name: /Air Raid Reference/ }).click();
  await expect(page.getByRole("heading", { name: "60 Hitch", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "60 Hitch Edited", exact: true })).toHaveCount(0);
});

test("@compact browse opens without covering access to structured filters", async ({ page }) => {
  await page.getByRole("button", { name: /Browse Mesh/ }).click();
  await page.getByRole("button", { name: /^Filters/ }).click();
  await page.getByLabel("Blocking scheme").selectOption("Inside Zone");
  await expect(page.getByText("1 matching play")).toBeVisible();
  await expect(page.getByRole("button", { name: "Open Inside Zone Glance" })).toBeVisible();
});

test("@tablet iPad keeps structured filters available beside the field", async ({ page }) => {
  await page.getByRole("button", { name: /^Filters/ }).click();
  await page.getByLabel("Blocking scheme").selectOption("Inside Zone");
  await expect(page.getByText("1 matching play")).toBeVisible();
  await expect(page.getByRole("button", { name: "Open Inside Zone Glance" })).toBeVisible();
  await expect(page.locator(".play-canvas")).toBeVisible();
});
