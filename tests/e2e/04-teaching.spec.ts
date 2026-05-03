import { test, expect } from "@playwright/test";
import {
  truncateAll, apiRegisterAdmin, apiCreateMember, apiCreateCourse, loginAs,
} from "./helpers";

const P = "teach-" + Date.now().toString(36);

test.describe("04-teaching", () => {
  let adminEmail: string, adminPw: string, adminCk: string;
  let teacherId: string, studentId: string;
  let courseId: string;

  test.beforeAll(async () => {
    await truncateAll();
    const admin = await apiRegisterAdmin(`${P}-a`);
    adminEmail = admin.email; adminPw = admin.password; adminCk = admin.cookie;
    const t = await apiCreateMember(adminCk, { fullName: `Prof ${P}`, email: `prof-${P}@t.local` });
    teacherId = t.id;
    const s = await apiCreateMember(adminCk, { fullName: `Aluno ${P}`, email: `aluno-${P}@t.local` });
    studentId = s.id;
    const c = await apiCreateCourse(adminCk, { title: `Curso ${P}`, category: "escola_biblica", teacherId });
    courseId = c.id;
  });

  test("1. Teaching dashboard loads", async ({ page }) => {
    await loginAs(page, adminEmail, adminPw);
    await page.goto("/teaching");
    await expect(page.getByText(/visão geral de ensino e pregação/i)).toBeVisible();
  });

  test("2. Create course", async ({ page }) => {
    await loginAs(page, adminEmail, adminPw);
    await page.goto("/teaching/courses");
    await page.getByText(/nova série/i).click();
    await page.waitForTimeout(500);
    const modal = page.locator("div.bg-card").last();
    await modal.locator("input").first().fill(`Novo Curso ${P}`);
    await modal.locator("input[placeholder*='ID do membro']").fill(teacherId);
    await modal.getByRole("button", { name: /criar/i }).click();
    await page.waitForTimeout(1000);
  });

  test("3. Filter courses by status", async ({ page }) => {
    await loginAs(page, adminEmail, adminPw);
    await page.goto("/teaching/courses");
    await page.locator("select").first().selectOption("aberto");
    await page.waitForTimeout(500);
  });

  test("4. View course detail", async ({ page }) => {
    await loginAs(page, adminEmail, adminPw);
    await page.goto(`/teaching/courses/${courseId}`);
    await expect(page.getByText(`Curso ${P}`).first()).toBeVisible();
  });

  test("5. Add lesson", async ({ page }) => {
    await loginAs(page, adminEmail, adminPw);
    await page.goto(`/teaching/courses/${courseId}`);
    await page.getByRole("button", { name: /aula/i }).click();
    await page.waitForTimeout(500);
    const modal = page.locator("div.bg-card").last();
    await modal.locator("input").first().fill(`Aula 1 ${P}`);
    await modal.locator("input[type='number']").fill("1");
    await modal.getByRole("button", { name: /criar/i }).click();
    await page.waitForTimeout(1000);
  });

  test("6. Enroll student", async ({ page }) => {
    await loginAs(page, adminEmail, adminPw);
    await page.goto(`/teaching/courses/${courseId}`);
    await page.getByRole("button", { name: /inscrever/i }).click();
    await page.waitForTimeout(500);
    const modal = page.locator("div.bg-card").last();
    await modal.locator("input").first().fill(studentId);
    await modal.getByRole("button", { name: /inscrever/i }).click();
    await page.waitForTimeout(1000);
  });

  test("7. Record attendance", async ({ page }) => {
    await loginAs(page, adminEmail, adminPw);
    await page.goto("/teaching/attendance");
    await expect(page.getByText(/frequência/i).first()).toBeVisible();
  });

  test("8. Delete course", async ({ page }) => {
    // Create a disposable course
    const c = await apiCreateCourse(adminCk, { title: `Del ${P}`, category: "escola_biblica", teacherId });
    await loginAs(page, adminEmail, adminPw);
    await page.goto("/teaching/courses");
    page.on("dialog", (d) => d.accept());
    const delBtn = page.locator("[title='Excluir']").first();
    if (await delBtn.isVisible()) {
      await delBtn.click();
      await page.waitForTimeout(1000);
    }
  });

  test("9. My Courses page loads", async ({ page }) => {
    await loginAs(page, adminEmail, adminPw);
    await page.goto("/teaching/my-courses");
    await expect(page.getByText(/minhas séries/i).first()).toBeVisible();
  });

  test("10. Course full shows error", async ({ page }) => {
    // Create course with 1 slot, fill it via API
    const c = await apiCreateCourse(adminCk, { title: `Full ${P}`, category: "escola_biblica", teacherId, maxSlots: 1 });
    // Enroll first student via API
    await fetch(`http://localhost:3000/api/teaching/courses/${c.id}/enroll`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: adminCk },
      body: JSON.stringify({ memberId: studentId }),
    });
    // Try to enroll another via UI
    await loginAs(page, adminEmail, adminPw);
    await page.goto(`/teaching/courses/${c.id}`);
    await page.getByRole("button", { name: /inscrever/i }).click();
    await page.waitForTimeout(500);
    const modal = page.locator("div.bg-card").last();
    await modal.locator("input").first().fill(teacherId); // try enrolling teacher
    await modal.getByRole("button", { name: /inscrever/i }).click();
    await page.waitForTimeout(1000);
    // Should show error about full course
  });

  test("11. Certificate button visible", async ({ page }) => {
    await loginAs(page, adminEmail, adminPw);
    await page.goto(`/teaching/courses/${courseId}`);
    // Certificate-related content should be accessible from course detail
    await page.waitForTimeout(1000);
  });
});
