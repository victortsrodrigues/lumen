# Church Manager Core

ERP para gestao de igrejas com LGPD compliance. React 19 + Express 5 + PostgreSQL + Drizzle ORM.

## Arquitetura

Monorepo pnpm:

```
lib/
  db/                   # Schema Drizzle + conexao PostgreSQL
  api-spec/             # OpenAPI YAML (contrato da API)
  api-client-react/     # Hooks React Query (gerados via Orval)
  api-zod/              # Schemas Zod (gerados via Orval)

artifacts/
  api-server/           # Backend Express 5
  church-erp/           # Frontend React 19 + Vite 7

tests/
  api/                  # Vitest
  e2e/                  # Playwright

scripts/
  seed.ts               # Dados de demonstracao
```

## Como rodar

```bash
pnpm setup            # primeira vez
docker compose up -d  # PostgreSQL na porta 5433
pnpm dev              # backend (3000) + frontend (5173)
pnpm db:seed          # dados de demonstracao
pnpm test:api         # Vitest (backend rodando)
pnpm test:e2e         # Playwright — rodar manualmente, trava Claude Code
```

Variaveis obrigatorias: `DATABASE_URL`, `PORT`, `JWT_SECRET`, `CSRF_SECRET`, `FIELD_ENCRYPTION_KEY`, `STORAGE_PROVIDER`.

## Roles (RBAC)

3 niveis: `admin` > `leader` > `member`. Middleware: `requireAuth`, `requireRole(...)`, `requireMfaVerified`.

- **admin** — acesso total
- **leader** — gestao operacional (ministerios, eventos, ensino, aconselhamento onde e conselheiro, visitas pastorais proprias, planejamento). **Sem acesso a financas** (admin only)
- **member** — dashboard proprio, proprio perfil, eventos/cursos (inscrever), ministerios (ver), artigos (criar com aprovacao), forum, musicas (sugerir)

Frontend filtra sidebar por `roles` por item. Paginas sensiveis redirecionam member/non-admin.

## Modulos

1. **Auth** — JWT httpOnly + MFA/TOTP + CSRF + rate limiting
2. **Membros** — CRUD com AES-256-GCM para PII + pipeline (culto > pequeno_grupo > ministerio)
3. **Perfil** (`/profile`) — member/leader veem e editam proprios dados via `GET/PUT /members/me` (auto-cria na 1a visita). Email nao editavel, pipeline/status ocultos
4. **Financeiro** — **admin only**. Entradas, despesas, fechamento mensal, orcamento, relatorios PDF/Excel, PIX
5. **Ensino** — cursos com ementa, video YouTube, aulas com conteudo e videos, Q&A por aula (`lesson_discussions`), inscricoes, frequencia, certificados. `GET /teaching/courses?mine=true` retorna apenas cursos em que o user esta inscrito
6. **Eventos** — CRUD, inscricoes, presenca, calendario, escala
7. **Ministerios** — departamentos N:N, roles, metas mensuraveis
8. **Acompanhamento pastoral** — visitas com follow-up, confidencial
9. **Aconselhamento** — casos e sessoes com notas criptografadas AES-256
10. **Musicas & Liturgia** — biblioteca de musicas, sugestoes, planejamento de culto
11. **Artigos & Devocionais** — workflow `rascunho -> em_revisao -> publicado`. Member cria direto em `em_revisao`. Admin aprova = publica. Feedback do revisor em `reviewNote`. Notificacoes automaticas
12. **Forum** — topicos e respostas, pin/lock moderado por admin/leader
13. **Patrimonio, Planejamento estrategico, Midias, Paginas institucionais (publico), LGPD, Auditoria, Dashboard**
14. **Notificacoes** — sistema generico reutilizavel (ver abaixo)

## Padroes sistemicos (nao reinventar)

### Query invalidation — automatico
`App.tsx` configura `MutationCache.onSuccess` que **invalida todas as queries `/api/*`** apos qualquer mutation. **Nao chamar `queryClient.invalidateQueries` manualmente** em onSuccess de mutations.

### Erros de mutation — automatico
`App.tsx` configura `MutationCache.onError` que mostra toast com a mensagem real do backend (via `getErrorMessage()` em `src/lib/api-error.ts`). **Nao adicionar `onError` manualmente** — opt-out via `mutation.meta.silentError = true`.

### Helpers de formulario (`src/hooks/use-form-errors.ts`)
```tsx
const onInvalid = useFormErrorHandler();

function onSubmit(values) {
  createMutation.mutate({ data: cleanFormPayload(values) });
}

<form onSubmit={form.handleSubmit(onSubmit, onInvalid)} noValidate>
  <FormErrorSummary errors={form.formState.errors} />
  {/* campos */}
</form>
```
- `FormErrorSummary` — banner com todos os erros
- `useFormErrorHandler` — toast consolidado
- `cleanFormPayload` — remove strings vazias/NaN antes de enviar (evita 500 por datas/numeros vazios)
- **Usar `noValidate` no form** para desabilitar validacao nativa do browser

### Notificacoes — qualquer modulo pode disparar
```ts
import { createNotification, notifyRole } from "../lib/notifications.js";

await notifyRole("admin", {
  type: "article.submitted",
  title: "Novo artigo",
  message: `${name} enviou "${title}" para revisao.`,
  link: `/articles/${id}`,
  entityType: "article",
  entityId: id,
});
```
Helpers falham silenciosamente — notificacoes nunca quebram o fluxo principal. Frontend: `<NotificationBell />` no Header com polling a cada 30s.

### MemberSelect
Componente `src/components/MemberSelect.tsx` — dropdown com busca por nome. Usar em todo form que precisa de ID de membro (professor, responsavel, etc). Integrar com react-hook-form via `Controller`.

## Convencoes

### Backend (Express)
- Rotas em `artifacts/api-server/src/routes/{modulo}.ts`
- **Rotas estaticas ANTES de dinamicas** (ex: `/pipeline/summary` antes de `/:id`) — Express colide
- Sempre `requireAuth`; `createAuditLog()` em mutacoes
- Soft delete com `deletedAt`; amounts como `numeric(12,2)`
- Atualizar `anonymizeMember()` em `lgpd.ts` ao adicionar FK para members
- `user` no JWT tem `userId` (nao `id`)

### Frontend (React)
- Paginas em `src/pages/{modulo}/`; rotas no `App.tsx` (Wouter, em ingles: /members, /finance, etc)
- Sidebar em `components/layout/Sidebar.tsx` — itens tem `roles?: string[]` para filtragem por role
- Hooks gerados pelo Orval — **nao editar** `lib/api-client-react/src/generated/`
- Query keys do Orval sao o path da API (`["/api/..."]`). Para invalidacao manual use `predicate: (q) => (q.queryKey[0] as string)?.startsWith?.("/api/...")`
- **Hooks React** precisam vir antes de returns condicionais. Se precisar bloquear pagina por role, fazer a checagem apos todos os hooks: `if (isMember) return <Access denied />;`
- Apos mudar OpenAPI: `pnpm --filter @workspace/api-spec run codegen`
- **Codegen sobrescreve `lib/api-zod/src/index.ts`** adicionando `export * from "./generated/types"` — remover essa linha toda vez (causa erros de export duplicado)

### Banco de dados
- Schema em `lib/db/src/schema/{modulo}.ts`; exportar em `schema/index.ts`
- `pgEnum` para campos categoricos
- Sempre `createdAt`, `updatedAt`, `createdByUserId`, `updatedByUserId`, `deletedAt`
- `pnpm db:push` | `pnpm db:studio`

### Para adicionar um novo modulo
1. Schema em `lib/db/src/schema/{modulo}.ts` + exportar em `schema/index.ts`
2. `pnpm db:push`
3. Rotas em `artifacts/api-server/src/routes/{modulo}.ts` (estaticas antes de dinamicas)
4. Registrar em `routes/index.ts`
5. `createAuditLog()` em mutacoes
6. Adicionar no `openapi.yaml` + `pnpm --filter @workspace/api-spec run codegen` (remover linha duplicada em api-zod/src/index.ts)
7. Paginas em `src/pages/{modulo}/` + rotas no `App.tsx`
8. Item no `Sidebar.tsx` com `roles` apropriados
9. Se tem FK para members: `anonymizeMember()` em `lgpd.ts`
10. Testes em `tests/api/{NN}-{modulo}.test.ts`
11. Seed em `scripts/seed.ts`

## Bugs conhecidos / limitacoes

- Recorrencia de eventos e apenas metadado
- Formularios legados ainda pedem ID do membro (usar `MemberSelect` em novos forms)
- Playwright trava o Claude Code — usuario roda manualmente
- tsx (backend dev) nao tem hot reload confiavel para mudancas em `@workspace/db` — restart manual
