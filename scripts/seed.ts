/**
 * Seed script — Popula o banco com dados de demonstração realistas.
 *
 * Uso: DATABASE_URL=postgresql://church_erp:church_erp@localhost:5433/church_erp tsx scripts/seed.ts
 *
 * Pré-requisito: backend rodando em http://localhost:3000
 */

import pg from "pg";

const { Pool } = pg;
const BASE_URL = "http://localhost:3000/api";
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || "postgresql://church_erp:church_erp@localhost:5433/church_erp",
});

// ─── HTTP helper ─────────────────────────────────────────────────────────────

let globalCookie = "";

async function api(method: string, path: string, body?: any): Promise<any> {
  const headers: Record<string, string> = {
    ...(body ? { "Content-Type": "application/json" } : {}),
    ...(globalCookie ? { Cookie: globalCookie } : {}),
  };

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    redirect: "manual",
  });

  const setCookie = res.headers.get("set-cookie") || "";
  if (setCookie) globalCookie = setCookie;

  const ct = res.headers.get("content-type") || "";
  const data = ct.includes("json") ? await res.json() : await res.text();

  if (res.status >= 400) {
    console.error(`  ✗ ${method} ${path} → ${res.status}`, typeof data === "object" ? JSON.stringify(data) : data);
  }
  return data;
}

async function getCsrf(): Promise<string> {
  const res = await api("GET", "/auth/csrf");
  return res.csrfToken;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function log(section: string, msg: string) {
  console.log(`[${section}] ${msg}`);
}

function pastDate(daysAgo: number): string {
  const d = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
  return d.toISOString().split("T")[0];
}

function futureDate(daysAhead: number): string {
  const d = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000);
  return d.toISOString();
}

// ═══════════════════════════════════════════════════════════════════════════════
// SEED
// ═══════════════════════════════════════════════════════════════════════════════

async function seed() {
  console.log("\n🌱 Iniciando seed de demonstração...\n");

  // ─── 1. USUÁRIOS ─────────────────────────────────────────────────────────

  log("Auth", "Criando usuários...");

  // Admin
  await api("POST", "/auth/register", {
    email: "admin@igrejademo.com.br", password: "Admin1234!", name: "Pastor Carlos Silva", consentAccepted: true,
  });
  await pool.query("UPDATE users SET role = 'admin' WHERE email = 'admin@igrejademo.com.br'");

  // Leader
  await api("POST", "/auth/register", {
    email: "lider@igrejademo.com.br", password: "Lider1234!", name: "Diácono Roberto Santos", consentAccepted: true,
  });
  await pool.query("UPDATE users SET role = 'leader' WHERE email = 'lider@igrejademo.com.br'");

  // Member
  await api("POST", "/auth/register", {
    email: "membro@igrejademo.com.br", password: "Membro1234!", name: "Ana Paula Oliveira", consentAccepted: true,
  });

  // Login as admin
  const csrf = await getCsrf();
  await api("POST", "/auth/login", { email: "admin@igrejademo.com.br", password: "Admin1234!", csrfToken: csrf });
  log("Auth", "✓ 3 usuários criados (admin, leader, member)");

  // ─── 2. MEMBROS ──────────────────────────────────────────────────────────

  log("Membros", "Cadastrando membros...");

  const membrosData = [
    { fullName: "Carlos Alberto Silva", email: "carlos.silva@email.com", cpf: "12345678901", phone: "11999887766", dateOfBirth: "1975-03-15", sex: "masculino", addressCity: "São Paulo", addressState: "SP", addressZip: "01310-100", addressStreet: "Av. Paulista", addressNumber: "1000", addressNeighborhood: "Bela Vista", classification: "comungante", receptionMode: "profissao_fe_batismo", receptionDate: "1996-01-14", conversionYear: 1995, maritalStatus: "casado", profession: "Engenheiro" },
    { fullName: "Maria Aparecida Santos", email: "maria.santos@email.com", cpf: "98765432100", phone: "11988776655", dateOfBirth: "1980-07-22", sex: "feminino", addressCity: "São Paulo", addressState: "SP", addressZip: "01310-200", addressStreet: "Rua Augusta", addressNumber: "500", addressNeighborhood: "Consolação", classification: "comungante", receptionMode: "profissao_fe_batismo", receptionDate: "2000-12-03", conversionYear: 2000, maritalStatus: "casado", profession: "Professora" },
    { fullName: "Roberto dos Santos", email: "lider@igrejademo.com.br", cpf: "11122233344", phone: "11977665544", dateOfBirth: "1978-11-05", sex: "masculino", addressCity: "São Paulo", addressState: "SP", addressZip: "04001-000", addressStreet: "Rua Vergueiro", addressNumber: "200", addressNeighborhood: "Liberdade", classification: "comungante", receptionMode: "carta_transferencia", receptionDate: "1998-08-15", conversionYear: 1998, religiousOrigin: "Igreja Presbiteriana Independente", maritalStatus: "casado", profession: "Diácono" },
    { fullName: "Ana Paula Oliveira", email: "membro@igrejademo.com.br", cpf: "55566677788", phone: "11966554433", dateOfBirth: "1992-04-18", sex: "feminino", addressCity: "São Paulo", addressState: "SP", addressZip: "05001-000", addressStreet: "Av. Rebouças", addressNumber: "350", addressNeighborhood: "Pinheiros", classification: "comungante", receptionMode: "profissao_fe", receptionDate: "2011-03-20", conversionYear: 2010, infantBaptism: true, infantBaptismChurch: "IPB Pinheiros", infantBaptismPastor: "Rev. José da Silva", maritalStatus: "solteiro", profession: "Designer" },
    { fullName: "João Pedro Ferreira", email: "joao.ferreira@email.com", phone: "11955443322", dateOfBirth: "1985-01-30", sex: "masculino", addressCity: "São Paulo", addressState: "SP", classification: "comungante", receptionMode: "profissao_fe_batismo", receptionDate: "2006-01-08", conversionYear: 2005, maritalStatus: "casado", profession: "Médico" },
    { fullName: "Juliana Costa Lima", email: "juliana.lima@email.com", phone: "11944332211", dateOfBirth: "1990-12-10", sex: "feminino", addressCity: "São Paulo", addressState: "SP", classification: "comungante", receptionMode: "profissao_fe_batismo", receptionDate: "2012-11-18", conversionYear: 2012, maritalStatus: "casado" },
    { fullName: "Pedro Henrique Almeida", email: "pedro.almeida@email.com", phone: "11933221100", dateOfBirth: "1988-06-25", sex: "masculino", addressCity: "São Paulo", addressState: "SP", classification: "comungante", receptionMode: "jurisdicao_pedido", conversionYear: 2008, religiousOrigin: "Igreja Batista" },
    { fullName: "Fernanda Rodrigues", email: "fernanda.rodrigues@email.com", phone: "11922110099", dateOfBirth: "1995-09-14", sex: "feminino", addressCity: "São Paulo", addressState: "SP", classification: "comungante", receptionMode: "profissao_fe_batismo", receptionDate: "2015-12-06", conversionYear: 2015 },
    { fullName: "Lucas Gabriel Souza", email: "lucas.souza@email.com", phone: "11911009988", dateOfBirth: "2000-02-28", sex: "masculino", addressCity: "São Paulo", addressState: "SP", classification: "comungante", receptionMode: "profissao_fe", receptionDate: "2018-03-15", conversionYear: 2018, infantBaptism: true, infantBaptismChurch: "IPB Central", infantBaptismPastor: "Rev. Carlos Mendes" },
    { fullName: "Priscila Mendes", email: "priscila.mendes@email.com", phone: "11900998877", dateOfBirth: "1993-08-07", sex: "feminino", addressCity: "São Paulo", addressState: "SP", classification: "comungante", receptionMode: "profissao_fe_batismo", receptionDate: "2014-06-01", conversionYear: 2013 },
    { fullName: "Marcos Vinícius Barbosa", email: "marcos.barbosa@email.com", phone: "11899887766", dateOfBirth: "1982-05-12", sex: "masculino", addressCity: "Guarulhos", addressState: "SP", classification: "comungante", receptionMode: "profissao_fe_batismo", receptionDate: "2003-02-09", conversionYear: 2002 },
    { fullName: "Raquel de Souza", email: "raquel.souza@email.com", phone: "11888776655", dateOfBirth: "1997-10-03", sex: "feminino", addressCity: "Osasco", addressState: "SP", classification: "nao_comungante", receptionMode: "arrolamento_menor", parentsOrGuardians: "Carlos Alberto Silva e Esposa" },
  ];

  const memberIds: string[] = [];
  for (const m of membrosData) {
    const res = await api("POST", "/members", { ...m, lgpdConsentAccepted: true });
    if (res.id) memberIds.push(res.id);
  }
  log("Membros", `✓ ${memberIds.length} membros cadastrados`);

  // ─── 2.1 DISCIPLESHIP — atribuir cores e líderes ───────────────────────
  log("Discipulado", "Configurando áreas de discipulado...");

  const robertoId = memberIds[2]; // Roberto dos Santos (líder)
  const anaId = memberIds[3];     // Ana Paula (referência EBD)

  const discipleshipUpdates: Array<{ id: string; area: string; data: any }> = [
    // Carlos (0): tudo verde — control case (default já é verde, mas vamos linkar líder PG)
    { id: memberIds[0], area: "pequeno_grupo", data: { healthStatus: "verde", leaderMemberId: robertoId } },
    // Maria (1): líder PG = Roberto
    { id: memberIds[1], area: "pequeno_grupo", data: { healthStatus: "verde", leaderMemberId: robertoId } },
    // João (4): pequeno_grupo amarelo
    { id: memberIds[4], area: "pequeno_grupo", data: { healthStatus: "amarelo", leaderMemberId: robertoId, notes: "Frequência irregular" } },
    // Juliana (5): EBD com Ana
    { id: memberIds[5], area: "ebd", data: { healthStatus: "verde", leaderMemberId: anaId } },
    // Pedro (6): culto vermelho — caso "em risco"
    { id: memberIds[6], area: "culto", data: { healthStatus: "vermelho", reason: "Ausente há mais de 4 semanas" } },
    { id: memberIds[6], area: "ebd", data: { healthStatus: "verde", leaderMemberId: anaId } },
  ];

  for (const upd of discipleshipUpdates) {
    try {
      await api("PUT", `/discipleship/members/${upd.id}/areas/${upd.area}`, upd.data);
    } catch (e) {
      log("Discipulado", `⚠ falha ao atualizar área ${upd.area} de ${upd.id}`);
    }
  }
  log("Discipulado", `✓ áreas configuradas`);

  // ─── 2.5 VISITANTES ──────────────────────────────────────────────────────

  log("Visitantes", "Cadastrando visitantes...");

  const visitorsData = [
    {
      fullName: "Bruno Carvalho", phone: "11988776600", email: "bruno.c@email.com",
      addressCity: "São Paulo", addressState: "SP",
      howFoundUs: "Indicação", firstVisitDate: pastDate(28),
      status: "acompanhando",
      assignedToMemberId: memberIds[2], // Roberto (líder)
      notes: "Primeira vez no culto. Demonstrou interesse no PG do bairro.",
    },
    {
      fullName: "Camila Ferreira", phone: "11977665533",
      addressCity: "Guarulhos", addressState: "SP",
      howFoundUs: "Internet", firstVisitDate: pastDate(7),
      status: "recente",
    },
  ];

  const visitorIds: string[] = [];
  for (const v of visitorsData) {
    const res = await api("POST", "/visitors", v);
    if (res.id) visitorIds.push(res.id);
  }

  // Bruno volta 2x mais
  if (visitorIds[0]) {
    await api("POST", `/visitors/${visitorIds[0]}/visits`, {
      visitDate: pastDate(21), notes: "Veio com a esposa.",
    });
    await api("POST", `/visitors/${visitorIds[0]}/visits`, {
      visitDate: pastDate(14), notes: "Participou do PG.",
    });
  }

  log("Visitantes", `✓ ${visitorIds.length} visitantes cadastrados`);

  // ─── 3. FINANCEIRO ───────────────────────────────────────────────────────

  log("Financeiro", "Criando entradas e despesas...");

  const entradas = [
    { type: "dizimo", amount: "1500.00", memberId: memberIds[0], description: "Dízimo mensal", date: pastDate(5), paymentMethod: "pix" },
    { type: "dizimo", amount: "800.00", memberId: memberIds[1], description: "Dízimo mensal", date: pastDate(5), paymentMethod: "pix" },
    { type: "dizimo", amount: "1200.00", memberId: memberIds[2], description: "Dízimo mensal", date: pastDate(5), paymentMethod: "transferencia" },
    { type: "oferta", amount: "500.00", memberId: memberIds[3], description: "Oferta especial missões", date: pastDate(10), paymentMethod: "dinheiro" },
    { type: "oferta", amount: "200.00", description: "Oferta anônima", date: pastDate(8), paymentMethod: "dinheiro", isAnonymous: true },
    { type: "dizimo", amount: "950.00", memberId: memberIds[4], description: "Dízimo mensal", date: pastDate(3), paymentMethod: "pix" },
    { type: "dizimo", amount: "650.00", memberId: memberIds[5], description: "Dízimo mensal", date: pastDate(3), paymentMethod: "cartao" },
    { type: "oferta", amount: "1000.00", memberId: memberIds[0], description: "Oferta para reforma", date: pastDate(2), paymentMethod: "transferencia" },
    { type: "dizimo", amount: "450.00", memberId: memberIds[6], description: "Dízimo mensal", date: pastDate(1), paymentMethod: "pix" },
    { type: "oferta", amount: "300.00", memberId: memberIds[7], description: "Oferta louvor", date: pastDate(1), paymentMethod: "dinheiro" },
  ];

  for (const e of entradas) {
    await api("POST", "/finance/entries", e);
  }

  const despesas = [
    { category: "aluguel", amount: "3500.00", description: "Aluguel do templo - março", date: pastDate(15), supplier: "Imobiliária Central" },
    { category: "luz", amount: "850.00", description: "Conta de energia elétrica", date: pastDate(12), supplier: "Enel SP" },
    { category: "agua", amount: "120.00", description: "Conta de água", date: pastDate(12), supplier: "Sabesp" },
    { category: "manutencao", amount: "450.00", description: "Manutenção do sistema de som", date: pastDate(7), supplier: "AudioTech" },
    { category: "material", amount: "280.00", description: "Material de limpeza e escritório", date: pastDate(4), supplier: "Kalunga" },
    { category: "benevolencia", amount: "600.00", description: "Cesta básica para famílias", date: pastDate(2), supplier: "Atacadão" },
  ];

  for (const d of despesas) {
    await api("POST", "/finance/expenses", d);
  }
  log("Financeiro", "✓ 10 entradas + 6 despesas criadas");

  // ─── 4. ENSINO E PREGAÇÃO ────────────────────────────────────────────────

  log("Ensino e Pregação", "Criando séries, aulas e inscrições...");

  // Série 1 — Pequeno Grupo (era Discipulado)
  const curso1 = await api("POST", "/teaching/courses", {
    title: "Discipulado para Novos Convertidos",
    description: "Série fundamental de 12 semanas para novos na fé. Cobre fundamentos bíblicos, oração, vida em comunidade.",
    category: "pequeno_grupo", teacherId: memberIds[0], startDate: pastDate(60), endDate: futureDate(30),
    dayOfWeek: "Quarta-feira", timeSlot: "19:30", location: "Sala 1", maxSlots: 30, status: "em_andamento",
  });

  // Aulas do curso 1
  const aulasDiscipulado = [
    "Quem é Deus?", "A Bíblia Sagrada", "O que é pecado?", "Jesus Cristo — Salvação",
    "O Espírito Santo", "A oração", "A igreja local", "Batismo e Santa Ceia",
  ];
  const lessonIds1: string[] = [];
  for (let i = 0; i < aulasDiscipulado.length; i++) {
    const l = await api("POST", `/teaching/courses/${curso1.id}/lessons`, {
      title: aulasDiscipulado[i], lessonOrder: i + 1, lessonDate: pastDate(60 - i * 7),
    });
    if (l.id) lessonIds1.push(l.id);
  }

  // Inscrições
  for (const mid of [memberIds[3], memberIds[7], memberIds[8], memberIds[11]]) {
    await api("POST", `/teaching/courses/${curso1.id}/enroll`, { memberId: mid });
  }

  // Presença (6 de 8 aulas para cada)
  for (const lessonId of lessonIds1.slice(0, 6)) {
    await api("POST", `/teaching/lessons/${lessonId}/attendance`, {
      records: [
        { memberId: memberIds[3], present: true },
        { memberId: memberIds[7], present: true },
        { memberId: memberIds[8], present: Math.random() > 0.2 },
        { memberId: memberIds[11], present: Math.random() > 0.3 },
      ],
    });
  }

  // Série 2 — Escola Bíblica
  const curso2 = await api("POST", "/teaching/courses", {
    title: "Escola Bíblica Dominical — Romanos",
    description: "Estudo expositivo da carta de Paulo aos Romanos. 16 semanas de estudo profundo.",
    category: "escola_biblica", teacherId: memberIds[2], startDate: pastDate(30),
    dayOfWeek: "Domingo", timeSlot: "09:00", location: "Salão Principal", maxSlots: 100, status: "em_andamento",
  });

  for (let i = 0; i < 5; i++) {
    await api("POST", `/teaching/courses/${curso2.id}/lessons`, {
      title: `Romanos ${i + 1} — Estudo ${i + 1}`, lessonOrder: i + 1, lessonDate: pastDate(30 - i * 7),
    });
  }
  for (const mid of [memberIds[0], memberIds[1], memberIds[4], memberIds[5], memberIds[9], memberIds[10]]) {
    await api("POST", `/teaching/courses/${curso2.id}/enroll`, { memberId: mid });
  }

  // Série 3 — Cursos Livres (era Escola de Líderes)
  await api("POST", "/teaching/courses", {
    title: "Formação de Líderes de Célula",
    description: "Capacitação para líderes de células e pequenos grupos.",
    category: "cursos_livres", teacherId: memberIds[0], startDate: futureDate(14),
    dayOfWeek: "Sábado", timeSlot: "14:00", location: "Sala 2", maxSlots: 20, status: "aberto",
  });

  // Série 4 — Pregação (nova categoria)
  await api("POST", "/teaching/courses", {
    title: "Sermões em Romanos 2026",
    description: "Série anual de pregações expositivas na carta de Paulo aos Romanos.",
    category: "pregacao", teacherId: memberIds[0], startDate: pastDate(15),
    dayOfWeek: "Domingo", timeSlot: "19:00", location: "Templo", status: "em_andamento",
  });

  log("Ensino e Pregação", "✓ 4 séries, 13 aulas, 10 inscrições, presença registrada");

  // ─── 4.5 MÚSICAS ──────────────────────────────────────────────────────────

  log("Músicas", "Criando biblioteca de músicas...");
  const songsData = [
    { title: "Em Espírito, Em Verdade", author: "Mim. Diante do Trono", category: "adoracao", youtubeUrl: "https://www.youtube.com/watch?v=example1" },
    { title: "Grandioso És Tu", author: "Stuart K. Hine", category: "hino", youtubeUrl: "https://www.youtube.com/watch?v=example2" },
    { title: "Quão Grande É o Meu Deus", author: "Chris Tomlin", category: "louvor", youtubeUrl: "https://www.youtube.com/watch?v=example3" },
    { title: "Tudo Posso", author: "Celina Borges", category: "louvor", youtubeUrl: "https://www.youtube.com/watch?v=example4" },
    { title: "Aclame ao Senhor", author: "Hillsong", category: "louvor", youtubeUrl: "https://www.youtube.com/watch?v=example5" },
  ];
  const songIds: string[] = [];
  for (const s of songsData) {
    const r = await api("POST", "/songs", s);
    if (r.id) songIds.push(r.id);
  }
  log("Músicas", `✓ ${songIds.length} músicas cadastradas`);

  // ─── 5. EVENTOS + CULTOS ──────────────────────────────────────────────────

  log("Eventos", "Criando eventos e cultos...");

  // Culto dominical (passado) — via /cultos para criar event + culto
  const cultoDomingo = await api("POST", "/cultos", {
    title: "Culto de Domingo", startDate: pastDate(3) + "T10:00:00Z",
    endDate: pastDate(3) + "T12:00:00Z", location: "Templo Principal",
    responsibleId: memberIds[2],
    openingText: "Bem-vindos à casa do Senhor! Salmo 100:1-5",
    sermonTitle: "Graça que transforma",
    sermonReference: "Romanos 8:28-39",
    sermonNotes: "1. A providência divina | 2. O propósito eterno | 3. Mais que vencedores",
    hasCommunion: true,
    status: "encerrado",
  });
  // Adicionar 3 músicas
  for (const sid of songIds.slice(0, 3)) {
    await api("POST", `/cultos/${cultoDomingo.id}/songs`, { songId: sid });
  }

  await api("POST", "/events", {
    title: "Reunião de Oração", type: "reuniao", startDate: pastDate(2) + "T19:30:00Z",
    endDate: pastDate(2) + "T21:00:00Z", location: "Sala de Oração",
    recurrence: "semanal", status: "encerrado",
  });

  // Culto de quarta (futuro) — via /cultos
  const cultoQuarta = await api("POST", "/cultos", {
    title: "Culto de Quarta-Feira", startDate: futureDate(1),
    endDate: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000 + 2 * 60 * 60 * 1000).toISOString(),
    location: "Templo Principal",
    responsibleId: memberIds[0],
    openingText: "Vamos juntos diante do Senhor.",
    sermonTitle: "Quem Tem Sede Venha",
    sermonReference: "Apocalipse 22:17",
    hasBaptism: true,
    hasMemberReception: true,
  });
  for (const sid of songIds.slice(2, 5)) {
    await api("POST", `/cultos/${cultoQuarta.id}/songs`, { songId: sid });
  }

  const conferencia = await api("POST", "/events", {
    title: "Conferência de Missões 2026", type: "conferencia", startDate: futureDate(15),
    endDate: futureDate(17), location: "Templo Principal",
    maxSlots: 500, description: "3 dias de palestras, adoração e compromisso missionário. Preletores convidados de todo o Brasil.",
  });

  const encontroJovens = await api("POST", "/events", {
    title: "Encontro de Jovens", type: "social", startDate: futureDate(5),
    endDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000 + 4 * 60 * 60 * 1000).toISOString(),
    location: "Salão Social", maxSlots: 80,
    description: "Noite de louvor, jogos e pizza. Traga um amigo!",
  });

  await api("POST", "/events", {
    title: "Assembleia Geral Ordinária", type: "reuniao", startDate: futureDate(20),
    endDate: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000 + 3 * 60 * 60 * 1000).toISOString(),
    location: "Templo Principal", description: "Prestação de contas anual e eleição de diáconos.",
  });

  // Inscrições nos eventos futuros
  for (const mid of [memberIds[3], memberIds[7], memberIds[8], memberIds[11]]) {
    await api("POST", `/events/${conferencia.id}/register`, { memberId: mid });
  }
  for (const mid of [memberIds[8], memberIds[11], memberIds[5]]) {
    await api("POST", `/events/${encontroJovens.id}/register`, { memberId: mid });
  }

  // Presença no culto passado (cultoDomingo.eventId vem do POST /cultos)
  await api("POST", `/events/${cultoDomingo.eventId}/attendance`, {
    records: memberIds.slice(0, 8).map(mid => ({ memberId: mid, present: true })),
  });

  log("Eventos", "✓ 2 cultos + 4 eventos, inscrições e presença registradas");

  // ─── 6. MINISTÉRIOS ──────────────────────────────────────────────────────

  log("Ministérios", "Criando ministérios e membros...");

  const minLouvor = await api("POST", "/ministries", {
    name: "Ministério de Louvor", description: "Equipe de louvor e adoração. Ensaios aos sábados.",
    category: "louvor", meetingDay: "Sábado", meetingTime: "15:00", meetingLocation: "Sala de Ensaio",
  });

  const minEnsino = await api("POST", "/ministries", {
    name: "Ministério de Ensino", description: "Professores da EBD e cursos bíblicos.",
    category: "ensino", meetingDay: "Sábado", meetingTime: "09:00", meetingLocation: "Sala 1",
  });

  const minServico = await api("POST", "/ministries", {
    name: "Ministério de Diaconia", description: "Serviço social, cestas básicas, visitas hospitalares.",
    category: "servico", meetingDay: "Terça-feira", meetingTime: "19:00", meetingLocation: "Sala 3",
  });

  const minJovens = await api("POST", "/ministries", {
    name: "Ministério de Jovens", description: "Discipulado e atividades para jovens de 15 a 30 anos.",
    category: "evangelismo", meetingDay: "Sexta-feira", meetingTime: "19:30", meetingLocation: "Salão Social",
  });

  // Membros dos ministérios
  await api("POST", `/ministries/${minLouvor.id}/members`, { memberId: memberIds[4], role: "lider" });
  await api("POST", `/ministries/${minLouvor.id}/members`, { memberId: memberIds[5], role: "vice_lider" });
  await api("POST", `/ministries/${minLouvor.id}/members`, { memberId: memberIds[7], role: "membro" });
  await api("POST", `/ministries/${minLouvor.id}/members`, { memberId: memberIds[8], role: "membro" });

  await api("POST", `/ministries/${minEnsino.id}/members`, { memberId: memberIds[0], role: "lider" });
  await api("POST", `/ministries/${minEnsino.id}/members`, { memberId: memberIds[2], role: "vice_lider" });
  await api("POST", `/ministries/${minEnsino.id}/members`, { memberId: memberIds[9], role: "membro" });

  await api("POST", `/ministries/${minServico.id}/members`, { memberId: memberIds[1], role: "lider" });
  await api("POST", `/ministries/${minServico.id}/members`, { memberId: memberIds[6], role: "membro" });
  await api("POST", `/ministries/${minServico.id}/members`, { memberId: memberIds[10], role: "voluntario" });

  await api("POST", `/ministries/${minJovens.id}/members`, { memberId: memberIds[8], role: "lider" });
  await api("POST", `/ministries/${minJovens.id}/members`, { memberId: memberIds[11], role: "vice_lider" });
  await api("POST", `/ministries/${minJovens.id}/members`, { memberId: memberIds[7], role: "membro" });

  log("Ministérios", "✓ 4 ministérios, 13 vínculos com membros");

  // ─── 7. PATRIMÔNIO ───────────────────────────────────────────────────────

  log("Patrimônio", "Cadastrando bens...");

  await api("POST", "/assets", {
    name: "Teclado Yamaha PSR-S975", category: "instrumento", location: "Sala de Ensaio",
    acquisitionDate: "2022-03-15", acquisitionValue: "4500.00", currentValue: "3800.00",
    serialNumber: "YAM-2022-0451", responsibleId: memberIds[4], status: "ativo",
    description: "Teclado principal do ministério de louvor",
  });
  await api("POST", "/assets", {
    name: "Mesa de Som Behringer X32", category: "som_iluminacao", location: "Templo Principal",
    acquisitionDate: "2021-06-20", acquisitionValue: "12000.00", currentValue: "9500.00",
    serialNumber: "BEH-X32-8821", status: "ativo",
    description: "Mesa de som digital 32 canais",
  });
  await api("POST", "/assets", {
    name: "Projetor Epson PowerLite", category: "informatica", location: "Templo Principal",
    acquisitionDate: "2023-01-10", acquisitionValue: "3200.00", currentValue: "2800.00",
    serialNumber: "EPS-PL-1123", status: "ativo",
  });
  await api("POST", "/assets", {
    name: "Van Fiat Ducato 2020", category: "veiculo", location: "Estacionamento",
    acquisitionDate: "2020-08-01", acquisitionValue: "120000.00", currentValue: "85000.00",
    serialNumber: "FIAT-DUC-2020-SP", responsibleId: memberIds[2], status: "ativo",
    description: "Van para transporte de membros e eventos",
  });
  await api("POST", "/assets", {
    name: "Guitarra Fender Stratocaster", category: "instrumento", location: "Sala de Ensaio",
    acquisitionDate: "2019-12-25", acquisitionValue: "5500.00", currentValue: "4800.00",
    serialNumber: "FEN-STR-7742", responsibleId: memberIds[7], status: "ativo",
  });
  await api("POST", "/assets", {
    name: "Bateria Pearl Export", category: "instrumento", location: "Templo Principal",
    acquisitionDate: "2021-02-14", acquisitionValue: "6800.00", currentValue: "5500.00",
    serialNumber: "PRL-EXP-3390", status: "manutencao",
    notes: "Pele da caixa precisa ser trocada",
  });
  await api("POST", "/assets", {
    name: "Notebook Dell Inspiron", category: "informatica", location: "Secretaria",
    acquisitionDate: "2023-07-01", acquisitionValue: "4200.00", currentValue: "3500.00",
    serialNumber: "DELL-INS-9987", status: "ativo",
    description: "Uso administrativo da secretaria",
  });
  await api("POST", "/assets", {
    name: "Cadeiras de Plástico (lote 200)", category: "mobiliario", location: "Depósito",
    acquisitionDate: "2020-01-15", acquisitionValue: "8000.00", currentValue: "4000.00",
    status: "ativo", description: "Cadeiras brancas para eventos externos",
  });

  log("Patrimônio", "✓ 8 bens cadastrados");

  // ─── 8. MÍDIAS ───────────────────────────────────────────────────────────

  log("Mídias", "Vinculando vídeos e links...");

  if (curso1.id) {
    await api("POST", "/media", { url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", title: "Vídeo de boas-vindas ao curso", entityType: "course", entityId: curso1.id });
    await api("POST", "/media", { url: "https://drive.google.com/file/d/abc123/view", title: "Apostila do Discipulado (PDF)", entityType: "course", entityId: curso1.id });
  }
  if (conferencia.id) {
    await api("POST", "/media", { url: "https://www.youtube.com/watch?v=abc123conf", title: "Convite — Conferência de Missões 2026", entityType: "event", entityId: conferencia.id });
  }
  if (minLouvor.id) {
    await api("POST", "/media", { url: "https://www.youtube.com/watch?v=worship2026", title: "Ensaio ao vivo — Louvor", entityType: "ministry", entityId: minLouvor.id });
    await api("POST", "/media", { url: "https://vimeo.com/123456789", title: "Tutorial de técnica vocal", entityType: "ministry", entityId: minLouvor.id });
  }

  log("Mídias", "✓ 5 mídias vinculadas (cursos, eventos, ministérios)");

  // ─── 9. ESCALA DE VOLUNTÁRIOS ────────────────────────────────────────────

  log("Escalas", "Criando funções e escalas...");

  const roleLouvor = await api("POST", "/schedules/roles", { name: "Louvor", description: "Equipe de louvor no palco", ministryId: minLouvor.id });
  const roleSom = await api("POST", "/schedules/roles", { name: "Som", description: "Operação da mesa de som" });
  const roleRecepcao = await api("POST", "/schedules/roles", { name: "Recepção", description: "Recepção e acolhimento na entrada" });
  const roleProjecao = await api("POST", "/schedules/roles", { name: "Projeção", description: "Projeção de slides e letras" });
  const roleInfantil = await api("POST", "/schedules/roles", { name: "Ministério Infantil", description: "Cuidado das crianças durante o culto" });

  // Escala do culto de quarta (usa eventId do culto)
  const cultoQuartaEventId = cultoQuarta.eventId;
  if (cultoQuartaEventId) {
    await api("POST", `/events/${cultoQuartaEventId}/schedule`, { serviceRoleId: roleLouvor.id, memberId: memberIds[4] });
    await api("POST", `/events/${cultoQuartaEventId}/schedule`, { serviceRoleId: roleLouvor.id, memberId: memberIds[7] });
    await api("POST", `/events/${cultoQuartaEventId}/schedule`, { serviceRoleId: roleSom.id, memberId: memberIds[6] });
    await api("POST", `/events/${cultoQuartaEventId}/schedule`, { serviceRoleId: roleRecepcao.id, memberId: memberIds[1] });
    await api("POST", `/events/${cultoQuartaEventId}/schedule`, { serviceRoleId: roleRecepcao.id, memberId: memberIds[9] });
    await api("POST", `/events/${cultoQuartaEventId}/schedule`, { serviceRoleId: roleProjecao.id, memberId: memberIds[8] });
    await api("POST", `/events/${cultoQuartaEventId}/schedule`, { serviceRoleId: roleInfantil.id, memberId: memberIds[5] });
  }

  // Escala da conferência
  if (conferencia.id) {
    await api("POST", `/events/${conferencia.id}/schedule`, { serviceRoleId: roleLouvor.id, memberId: memberIds[4] });
    await api("POST", `/events/${conferencia.id}/schedule`, { serviceRoleId: roleSom.id, memberId: memberIds[6] });
    await api("POST", `/events/${conferencia.id}/schedule`, { serviceRoleId: roleRecepcao.id, memberId: memberIds[1] });
    await api("POST", `/events/${conferencia.id}/schedule`, { serviceRoleId: roleRecepcao.id, memberId: memberIds[10] });
  }

  log("Escalas", "✓ 5 funções, 11 escalas em 2 eventos");

  // ─── 9.5 CONSELHO ────────────────────────────────────────────────────────

  log("Conselho", "Criando reuniões do conselho...");

  const reuniao1 = await api("POST", "/council", {
    meetingDate: pastDate(30),
    title: "Reunião Ordinária — Janeiro 2026",
    agenda: "1. Aprovação da ata anterior\n2. Relatório financeiro\n3. Avaliação ministerial",
    summary: "Aprovada por unanimidade. Ministério de Louvor recebe nova líder.",
    status: "realizada",
  });
  if (reuniao1.id) {
    await api("POST", `/council/${reuniao1.id}/items`, {
      title: "Aprovação da ata anterior",
      status: "decidida",
      resolution: "Aprovada por unanimidade.",
    });
    await api("POST", `/council/${reuniao1.id}/items`, {
      title: "Relatório financeiro 2025",
      description: "Apresentação do tesoureiro com balanço anual.",
      status: "discutida",
    });
    await api("POST", `/council/${reuniao1.id}/items`, {
      title: "Avaliação ministerial",
      status: "decidida",
      resolution: "Roberto Santos aprovado como líder do Louvor.",
    });
  }

  await api("POST", "/council", {
    meetingDate: futureDate(15),
    title: "Reunião Ordinária — Fevereiro 2026",
    agenda: "1. Planejamento orçamentário do trimestre\n2. Conferência de Missões",
    status: "agendada",
  });

  log("Conselho", "✓ 2 reuniões criadas");

  // ─── 10. LGPD ────────────────────────────────────────────────────────────

  log("LGPD", "Criando solicitação de exemplo...");

  // Login como membro para criar solicitação
  const csrfMembro = await getCsrf();
  await api("POST", "/auth/login", { email: "membro@igrejademo.com.br", password: "Membro1234!", csrfToken: csrfMembro });
  await api("POST", "/lgpd/requests", { requestType: "exportacao", description: "Gostaria de receber uma cópia dos meus dados pessoais." });

  // Voltar para admin
  const csrfAdmin = await getCsrf();
  await api("POST", "/auth/login", { email: "admin@igrejademo.com.br", password: "Admin1234!", csrfToken: csrfAdmin });

  log("LGPD", "✓ 1 solicitação de exportação criada");

  // ─── RESUMO ──────────────────────────────────────────────────────────────

  console.log("\n" + "═".repeat(60));
  console.log("✅ Seed concluído com sucesso!");
  console.log("═".repeat(60));
  console.log(`
  Dados criados:
  • 3 usuários (admin, leader, member)
  • 12 membros com dados completos
  • 10 entradas financeiras + 6 despesas
  • 3 cursos + 13 aulas + 10 inscrições + presença
  • 6 eventos + inscrições + presença
  • 4 ministérios + 13 vínculos
  • 8 bens patrimoniais
  • 5 mídias (YouTube, Vimeo, Drive)
  • 5 funções de serviço + 11 escalas
  • 1 solicitação LGPD

  Login de demonstração:
  ┌──────────────────────────────────────────────┐
  │ Admin:  admin@igrejademo.com.br / Admin1234! │
  │ Líder:  lider@igrejademo.com.br / Lider1234! │
  │ Membro: membro@igrejademo.com.br / Membro1234!│
  └──────────────────────────────────────────────┘
`);

  await pool.end();
}

seed().catch((err) => {
  console.error("Erro no seed:", err);
  process.exit(1);
});
