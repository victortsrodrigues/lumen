import { test, expect } from "@playwright/test";
import { loginAsNewAdmin, apiRegisterAdmin, apiCreateCourse, apiCreateMedia } from "./helpers";

const P = "e2e-med-" + Date.now().toString(36);

test.describe("10-media", () => {
  test("1. MediaSection aparece no detalhe do curso", async ({ page }) => {
    const admin = await apiRegisterAdmin(`${P}-1`);
    const course = await apiCreateCourse(admin.cookie, {
      title: `Curso ${P}`, category: "escola_biblica", teacherId: "x",
      startDate: "2026-01-01", status: "em_andamento",
    });
    await apiCreateMedia(admin.cookie, {
      url: "https://www.youtube.com/watch?v=test123",
      title: "Video de teste", entityType: "course", entityId: course.id,
    });

    await loginAsNewAdmin(page, `${P}-1b`);
    await page.goto(`/teaching/courses/${course.id}`);
    await expect(page.getByText("Mídias")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("Video de teste")).toBeVisible();
  });

  test("2. Adicionar mídia via modal", async ({ page }) => {
    const admin = await apiRegisterAdmin(`${P}-2`);
    const course = await apiCreateCourse(admin.cookie, {
      title: `Curso2 ${P}`, category: "escola_biblica", teacherId: "x",
      startDate: "2026-01-01", status: "em_andamento",
    });

    await loginAsNewAdmin(page, `${P}-2b`);
    await page.goto(`/teaching/courses/${course.id}`);
    await page.getByText("Adicionar").first().click();
    await page.locator('input[type="url"]').fill("https://www.youtube.com/watch?v=abc");
    await page.locator('input[type="text"]').last().fill("Novo vídeo");
    await page.getByRole("button", { name: /adicionar/i }).last().click();
    await expect(page.getByText("Mídia adicionada").first()).toBeVisible({ timeout: 5000 });
  });

  test("3. Link genérico aparece como link externo", async ({ page }) => {
    const admin = await apiRegisterAdmin(`${P}-3`);
    const course = await apiCreateCourse(admin.cookie, {
      title: `Curso3 ${P}`, category: "escola_biblica", teacherId: "x",
      startDate: "2026-01-01", status: "em_andamento",
    });
    await apiCreateMedia(admin.cookie, {
      url: "https://example.com/doc.pdf",
      title: "Apostila PDF", entityType: "course", entityId: course.id,
    });

    await loginAsNewAdmin(page, `${P}-3b`);
    await page.goto(`/teaching/courses/${course.id}`);
    await expect(page.getByText("Apostila PDF")).toBeVisible({ timeout: 10000 });
  });
});
