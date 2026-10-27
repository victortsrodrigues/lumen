import { test, expect, type Page } from "@playwright/test";

// Exercise the real forms/resolver while keeping all writes inside mocked APIs.
async function adminApi(page: Page) {
  const submitted: { path: string; body: Record<string, unknown> }[] = [];
  await page.route(/^https:\/\//, (route) => route.abort());
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() === "POST") {
      submitted.push({ path, body: route.request().postDataJSON() });
      return route.fulfill({ status: 201, json: { id: "created-test" } });
    }
    let body: unknown = {};
    if (path === "/api/auth/me")
      body = {
        id: "admin-test",
        name: "Admin",
        email: "admin@example.test",
        role: "admin",
        status: "active",
        mfaEnabled: false,
      };
    else if (path === "/api/auth/csrf") body = { csrfToken: "test-csrf" };
    else if (path === "/api/members")
      body = {
        members: [{ id: "teacher-test", fullName: "Professor de Teste" }],
        total: 1,
      };
    else if (path === "/api/events") body = { events: [], total: 0 };
    else if (path === "/api/finance/entries") body = { entries: [], total: 0 };
    else if (path === "/api/finance/expenses")
      body = { expenses: [], total: 0 };
    else if (path === "/api/teaching/courses") body = { courses: [], total: 0 };
    else if (path === "/api/teaching/courses/course-test")
      body = {
        id: "course-test",
        title: "Série de Teste",
        description: "Descrição",
        syllabus: "Ementa",
        category: "escola_biblica",
        status: "aberto",
        teacherId: "teacher-test",
        teacherName: "Professor de Teste",
        startDate: "2026-10-01",
        endDate: "2026-12-31",
        dayOfWeek: "Domingo",
        timeSlot: "09:00",
        lessons: [],
        enrollments: [],
        enrolledCount: 0,
      };
    else if (path.includes("notifications"))
      body = { count: 0, notifications: [], total: 0 };
    else if (path.includes("media")) body = { media: [], total: 0 };
    await route.fulfill({ json: body });
  });
  return submitted;
}

for (const kind of ["entries", "expenses"] as const) {
  test(`Zod 4 preserves monetary validation and decimal submission (${kind})`, async ({
    page,
  }) => {
    const submitted = await adminApi(page);
    await page.goto(`/finance/${kind}`);
    await page
      .getByRole("button", {
        name: kind === "entries" ? "Nova Entrada" : "Nova Despesa",
        exact: true,
      })
      .click();
    if (kind === "expenses")
      await page.locator('[name="description"]').fill("Material de teste");
    const amount = page.getByPlaceholder("0,00");
    await amount.fill("0");
    await page.locator('button[type="submit"]').click();
    await expect(page.getByText("Valor deve ser maior que zero")).toBeVisible();
    expect(submitted).toHaveLength(0);
    await amount.fill("123456");
    await page.locator('button[type="submit"]').click();
    await expect.poll(() => submitted.length).toBe(1);
    expect(submitted[0]).toMatchObject({
      path: `/api/finance/${kind}`,
      body: { amount: 1234.56 },
    });
    if (kind === "entries") expect(submitted[0].body.isAnonymous).toBe(false);
  });
}

for (const slots of ["", "25"]) {
  test(`Zod 4 preserves event validation and optional capacity (${slots || "blank"})`, async ({
    page,
  }) => {
    const submitted = await adminApi(page);
    await page.goto("/events");
    await page
      .getByRole("button", { name: "Novo Evento", exact: true })
      .click();
    await page.locator('button[type="submit"]').click();
    await expect(page.getByText("Título é obrigatório").first()).toBeVisible();
    expect(submitted).toHaveLength(0);
    await page.locator('[name="title"]').fill("Evento de Teste");
    await page.locator('[name="startDate"]').fill("2026-11-15T09:00");
    await page.locator('[name="endDate"]').fill("2026-11-15T11:00");
    await page.locator('[name="maxSlots"]').fill(slots);
    await page.locator('button[type="submit"]').click();
    await expect.poll(() => submitted.length).toBe(1);
    expect(submitted[0].path).toBe("/api/events");
    expect(submitted[0].body.maxSlots).toBe(slots ? 25 : undefined);
  });
}

for (const numbers of [false, true]) {
  test(`Zod 4 preserves course fields and optional numbers (filled=${numbers})`, async ({
    page,
  }) => {
    const submitted = await adminApi(page);
    await page.goto("/teaching/courses");
    await page.getByRole("button", { name: "Nova Série", exact: true }).click();
    await page.locator('button[type="submit"]').click();
    await expect(
      page.getByText("Professor é obrigatório").first(),
    ).toBeVisible();
    expect(submitted).toHaveLength(0);
    for (const [name, value] of Object.entries({
      title: "Série de Teste",
      description: "Descrição de teste",
      syllabus: "Ementa de teste",
      startDate: "2026-11-01",
      endDate: "2026-12-31",
      timeSlot: "09:00",
    }))
      await page.locator(`[name="${name}"]`).fill(value);
    await page.locator('[name="dayOfWeek"]').selectOption("Domingo");
    await page
      .getByPlaceholder("Buscar membro para professor...")
      .fill("Professor");
    await page
      .getByRole("button", { name: "Professor de Teste", exact: true })
      .click();
    for (const [name, value] of Object.entries({
      lessonDurationMinutes: "60",
      totalWeeks: "8",
      maxSlots: "25",
    })) {
      await page.locator(`[name="${name}"]`).fill(numbers ? value : "");
    }
    await page.locator('button[type="submit"]').click();
    await expect.poll(() => submitted.length).toBe(1);
    expect(submitted[0]).toMatchObject({
      path: "/api/teaching/courses",
      body: { teacherId: "teacher-test" },
    });
    for (const [name, value] of Object.entries({
      lessonDurationMinutes: 60,
      totalWeeks: 8,
      maxSlots: 25,
    })) {
      expect(submitted[0].body[name]).toBe(numbers ? value : undefined);
    }
  });
}

test("Zod 4 preserves member defaults and converts the year entered as text", async ({
  page,
}) => {
  const submitted = await adminApi(page);
  await page.goto("/members/new");
  await page.locator('[name="fullName"]').fill("Membro de Teste");
  await page.locator('[name="conversionYear"]').fill("2010");
  await expect(page.locator('button[type="submit"]')).toBeDisabled();
  await page.locator('[name="lgpdConsentAccepted"]').check();
  await page.locator('button[type="submit"]').click();
  await expect.poll(() => submitted.length).toBe(1);
  expect(submitted[0]).toMatchObject({
    path: "/api/members",
    body: {
      fullName: "Membro de Teste",
      conversionYear: 2010,
      classification: "comungante",
      status: "ativo",
    },
  });
  expect(submitted[0].body.receptionMode).toBeUndefined();
});

test("Zod 4 preserves visitor defaults and permits empty optional email", async ({
  page,
}) => {
  const submitted = await adminApi(page);
  await page.goto("/visitors/new");
  await page.locator('[name="fullName"]').fill("Visitante de Teste");
  await page.locator('button[type="submit"]').click();
  await expect.poll(() => submitted.length).toBe(1);
  expect(submitted[0]).toMatchObject({
    path: "/api/visitors",
    body: { fullName: "Visitante de Teste", status: "recente" },
  });
  expect(submitted[0].body.email).toBeUndefined();
});

test("Zod 4 validates lesson order and submits its numeric value", async ({
  page,
}) => {
  const submitted = await adminApi(page);
  await page.goto("/teaching/courses/course-test");
  await page.getByRole("button", { name: "Aula", exact: true }).click();
  await page.locator('[name="title"]').fill("Aula de Teste");
  await page.locator('[name="lessonOrder"]').fill("0");
  await page.locator('button[type="submit"]').click();
  await expect(
    page.getByText("Ordem da aula é obrigatória").first(),
  ).toBeVisible();
  expect(submitted).toHaveLength(0);
  await page.locator('[name="lessonOrder"]').fill("2");
  await page.locator('button[type="submit"]').click();
  await expect.poll(() => submitted.length).toBe(1);
  expect(submitted[0]).toMatchObject({
    path: "/api/teaching/courses/course-test/lessons",
    body: { title: "Aula de Teste", lessonOrder: 2 },
  });
});
