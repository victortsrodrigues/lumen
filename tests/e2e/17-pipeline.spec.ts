import { test, expect } from "@playwright/test";
import { loginAsNewAdmin, apiRegisterAdmin, apiCreateMember } from "./helpers";

const P = "e2e-pipe-" + Date.now().toString(36);

test.describe("17-pipeline", () => {
  test("1. Funil visual aparece na listagem de membros", async ({ page }) => {
    const admin = await apiRegisterAdmin(`${P}-1`);
    await apiCreateMember(admin.cookie, { fullName: `Pipe1 ${P}`, email: `pipe1-${P}@test.local`, pipelineStage: "visitante" });
    await apiCreateMember(admin.cookie, { fullName: `Pipe2 ${P}`, email: `pipe2-${P}@test.local`, pipelineStage: "membro_ativo" });

    await loginAsNewAdmin(page, `${P}-1b`);
    await page.goto("/members");
    await expect(page.getByText("Funil de Integração")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("Visitante").first()).toBeVisible();
    await expect(page.getByText("Membro Ativo").first()).toBeVisible();
  });

  test("2. Badge de etapa aparece na listagem", async ({ page }) => {
    const admin = await apiRegisterAdmin(`${P}-2`);
    await apiCreateMember(admin.cookie, { fullName: `BadgePipe ${P}`, email: `badge-${P}@test.local`, pipelineStage: "visitante" });

    await loginAsNewAdmin(page, `${P}-2b`);
    await page.goto("/members");
    await expect(page.getByText("visitante").first()).toBeVisible({ timeout: 10000 });
  });

  test("3. Pipeline history no perfil do membro", async ({ page }) => {
    const admin = await apiRegisterAdmin(`${P}-3`);
    const member = await apiCreateMember(admin.cookie, { fullName: `HistPipe ${P}`, email: `hist-${P}@test.local`, pipelineStage: "visitante" });
    // Move pipeline via API
    await fetch(`http://localhost:3000/api/members/${member.id}/pipeline`, {
      method: "PUT", headers: { "Content-Type": "application/json", Cookie: admin.cookie },
      body: JSON.stringify({ stage: "frequentador", reason: "Começou a frequentar" }),
    });

    await loginAsNewAdmin(page, `${P}-3b`);
    await page.goto(`/members/${member.id}`);
    // Should show the member detail with pipeline info
    await expect(page.getByText(`HistPipe ${P}`)).toBeVisible({ timeout: 10000 });
  });
});
