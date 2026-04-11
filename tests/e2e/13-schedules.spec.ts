import { test, expect } from "@playwright/test";
import { loginAsNewAdmin, apiRegisterAdmin, apiCreateServiceRole, apiCreateEvent, apiCreateMember, apiScheduleVolunteer } from "./helpers";

const P = "e2e-sch-" + Date.now().toString(36);

test.describe("13-schedules", () => {
  test("1. Página de funções de serviço carrega", async ({ page }) => {
    const admin = await apiRegisterAdmin(`${P}-1`);
    await apiCreateServiceRole(admin.cookie, { name: `Louvor ${P}` });

    await loginAsNewAdmin(page, `${P}-1b`);
    await page.goto("/schedules/roles");
    await expect(page.getByText(`Louvor ${P}`)).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("Funções de Serviço")).toBeVisible();
  });

  test("2. Criar função via modal", async ({ page }) => {
    await loginAsNewAdmin(page, `${P}-2`);
    await page.goto("/schedules/roles");
    await page.getByText("Nova Função").click();
    await page.locator('input').first().fill(`Recepção ${P}`);
    await page.getByRole("button", { name: /criar/i }).click();
    await expect(page.getByText("Função criada").first()).toBeVisible({ timeout: 5000 });
  });

  test("3. Escala aparece no detalhe do evento", async ({ page }) => {
    const admin = await apiRegisterAdmin(`${P}-3`);
    const role = await apiCreateServiceRole(admin.cookie, { name: `Som ${P}` });
    const member = await apiCreateMember(admin.cookie, { fullName: `VolE2E ${P}`, email: `vol-${P}@test.local` });
    const future = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    const event = await apiCreateEvent(admin.cookie, {
      title: `Culto ${P}`, type: "culto",
      startDate: future.toISOString(),
      endDate: new Date(future.getTime() + 2 * 60 * 60 * 1000).toISOString(),
    });
    await apiScheduleVolunteer(admin.cookie, event.id, { serviceRoleId: role.id, memberId: member.id });

    await loginAsNewAdmin(page, `${P}-3b`);
    await page.goto(`/events/${event.id}`);
    await expect(page.getByText("Escala de Serviço")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(`VolE2E ${P}`)).toBeVisible();
    await expect(page.getByText("Escalado")).toBeVisible();
  });
});
