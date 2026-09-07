import { test, expect } from "@playwright/test";

// The LGPD screens were retired. These public redirects need no database fixtures.
// Authenticated navigation is covered in ui/legal-navigation.spec.ts; API security
// remains covered by the backend integration tests.
test.describe("06-lgpd legacy links", () => {
  for (const path of ["/lgpd", "/lgpd/my-data", "/lgpd/admin-requests"]) {
    test(`${path} redirects to the public privacy policy`, async ({ page }) => {
      const personalDataRequests: string[] = [];
      await page.route("**/api/**", route => {
        if (new URL(route.request().url()).pathname.startsWith("/api/lgpd")) {
          personalDataRequests.push(route.request().url());
        }
        return route.fulfill({ status: 401, json: { error: "UNAUTHORIZED" } });
      });
      await page.goto(path);
      await expect(page).toHaveURL(/\/privacidade$/);
      await expect(page.getByRole("heading", { name: "Política de Privacidade", exact: true })).toBeVisible();
      expect(personalDataRequests).toEqual([]);
    });
  }
});
