# Church Manager Core

ERP completo para gestao de igrejas com LGPD compliance, planejamento estrategico e controle financeiro.

## Stack

- **Frontend:** React 19 + Vite 7 + Tailwind CSS + shadcn/ui + Wouter + React Query
- **Backend:** Express 5 + Drizzle ORM + PostgreSQL 16
- **Codegen:** OpenAPI YAML + Orval (hooks React Query + schemas Zod)
- **Testes:** Vitest (346 testes API) + Playwright (128 testes E2E)

## Modulos

| Modulo | Descricao |
|---|---|
| **Auth** | JWT + MFA/TOTP + CSRF + rate limiting + bcrypt |
| **Membros** | CRUD com criptografia AES-256-GCM para CPF, telefone, endereco. Pipeline de integracao (visitante > lider) |
| **Financeiro** | Dizimos, ofertas, despesas, dashboard com graficos, relatorios PDF/Excel, fechamento mensal, orcamento anual, comparativo orcado vs. realizado |
| **Ensino** | Cursos, aulas, inscricoes, frequencia, certificados (75% minimo) |
| **Eventos** | CRUD com inscricoes, presenca, calendario anual, escala de voluntarios |
| **Ministerios** | Departamentos com membros (N:N), roles (lider/vice/membro/voluntario), metas mensuraveis |
| **Patrimonio** | Inventario de bens com categoria, localizacao, responsavel, status, valor |
| **Planejamento** | Diretrizes estrategicas > objetivos > iniciativas com etapas, orcamento e custo realizado |
| **Midias** | Links de video/documento (YouTube, Vimeo, Drive embed) vinculados a qualquer entidade |
| **LGPD** | Portal do titular, exportacao de dados, anonimizacao completa, solicitacoes |
| **Auditoria** | Log imutavel de todas as acoes sensiveis (requer MFA para consultar) |
| **Dashboard** | KPIs em tempo real: membros, financas, eventos, ensino, ministerios, planejamento |

## Pre-requisitos

- [Node.js](https://nodejs.org/) 22.18+ (linha 22 LTS usada no deploy)
- [pnpm](https://pnpm.io/) 10.33.0 (versão fixada em `packageManager`)
- [Docker](https://www.docker.com/) (para PostgreSQL)

## Setup inicial

```bash
# 1. Clonar e instalar
git clone <repo-url>
cd Church-Manager-Core
pnpm install

# 2. Configurar ambiente
cp .env.example .env
# Editar .env se necessario (porta padrao do PostgreSQL e 5433)

# 3. Subir banco + aplicar schema + gerar hooks
pnpm setup

# 4. (Opcional) Popular com dados de demonstracao
pnpm db:seed
```

## Como usar

```bash
# Iniciar (banco + backend + frontend)
docker compose up -d
pnpm dev
```

- **Frontend:** http://localhost:5173
- **Backend API:** http://localhost:3000
- **Drizzle Studio:** `pnpm db:studio` (interface visual do banco)

### Logins de demonstracao (apos rodar seed)

| Perfil | Email | Senha |
|---|---|---|
| Admin | admin@igrejademo.com.br | Admin1234! |
| Lider | lider@igrejademo.com.br | Lider1234! |
| Membro | membro@igrejademo.com.br | Membro1234! |

### Criar seu proprio usuario admin

1. Registre-se pela tela de cadastro
2. Promova para admin:
```bash
PGPASSWORD=church_erp psql -h localhost -p 5433 -U church_erp -d church_erp \
  -c "UPDATE users SET role = 'admin' WHERE email = 'seu@email.com';"
```

## Scripts disponiveis

| Comando | Descricao |
|---|---|
| `pnpm dev` | Inicia backend (3000) + frontend (5173) |
| `pnpm dev:api` | Inicia apenas o backend |
| `pnpm dev:web` | Inicia apenas o frontend |
| `pnpm db:push` | Aplica mudancas de schema no banco |
| `pnpm db:studio` | Abre Drizzle Studio (interface visual do banco) |
| `pnpm db:seed` | Popula banco com dados de demonstracao |
| `pnpm test:api` | Roda 346 testes de API (Vitest) |
| `pnpm test:e2e` | Roda 128 testes E2E (Playwright) |
| `pnpm test:api:reset` | Limpa banco de testes |
| `pnpm setup` | Setup completo (Docker + install + schema) |
| `pnpm audit:security` | Reprova dependências com vulnerabilidades altas ou críticas |
| `pnpm test:unit` | Testes unitários e regressões de dependências |
| `pnpm test:accounts` | Gestão de contas em banco local isolado |
| `pnpm test:ui` | Gestão de contas, Excel e gráficos com API simulada |

As versões corrigidas, verificações de segurança e rotina de atualização estão em
[Segurança das dependências](docs/dependency-security.md).

## Arquitetura

```
lib/                         # Bibliotecas compartilhadas
  db/                        #   Schema Drizzle + conexao PostgreSQL
  api-spec/                  #   OpenAPI YAML (contrato da API)
  api-client-react/          #   Hooks React Query (gerados via Orval)
  api-zod/                   #   Schemas Zod (gerados via Orval)

artifacts/
  api-server/                # Backend Express 5
    src/routes/              #   Rotas organizadas por modulo
    src/middlewares/          #   Auth, CSRF, rate limit, security headers
    src/lib/                 #   Crypto, audit, storage, logger
  church-erp/                # Frontend React 19 + Vite 7
    src/pages/               #   Paginas organizadas por modulo
    src/components/          #   Componentes reutilizaveis (MediaSection, Sidebar)

tests/
  api/                       # 346 testes de API (Vitest)
  e2e/                       # 128 testes E2E (Playwright)

scripts/
  seed.ts                    # Dados de demonstracao
  migrate-pipeline.ts        # Migracao de pipeline (one-time)
```

## Seguranca

- **Criptografia de PII:** CPF, telefone e endereco sao criptografados com AES-256-GCM no banco
- **Autenticacao:** JWT em HttpOnly cookies + CSRF tokens
- **MFA:** TOTP (Google Authenticator) obrigatorio para admin acessar auditoria
- **Rate limiting:** Protecao contra brute force em login e rotas sensiveis
- **CSP headers:** Content Security Policy com frame-src para YouTube/Vimeo
- **Soft delete:** Dados nunca sao removidos fisicamente
- **LGPD:** Anonimizacao completa em cascata (membros, financas, ministerios, escalas, planejamento)

## Backup

```bash
# Criar backup
PGPASSWORD=church_erp pg_dump -h localhost -p 5433 -U church_erp church_erp > backup_$(date +%Y%m%d).sql

# Restaurar backup
PGPASSWORD=church_erp psql -h localhost -p 5433 -U church_erp church_erp < backup.sql
```

## Variaveis de ambiente

Ver `.env.example`. Principais:

| Variavel | Descricao | Padrao |
|---|---|---|
| DATABASE_URL | Connection string PostgreSQL | postgresql://church_erp:church_erp@localhost:5433/church_erp |
| PORT | Porta do backend | 3000 |
| JWT_SECRET | Chave para tokens JWT | (trocar em producao) |
| CSRF_SECRET | Chave para tokens CSRF | (trocar em producao) |
| FIELD_ENCRYPTION_KEY | Chave AES-256 para criptografia de PII (64 hex chars) | (trocar em producao) |
| EMAIL_PROVIDER | Provedor de e-mail transacional | resend |
| RESEND_API_KEY | Chave da API do Resend | — |
| EMAIL_FROM | Remetente em domínio verificado | — |
| EMAIL_REPLY_TO | Endereço para respostas | — |
| APP_PUBLIC_URL | URL pública usada nos links de autenticação | http://localhost:5173 |
| EMAIL_VERIFICATION_REQUIRED | Exige e-mail confirmado para login | false |
| STORAGE_PROVIDER | `local` ou `cloud` | local |

> **Importante:** Troque as chaves de seguranca ANTES de cadastrar dados reais. Alterar a `FIELD_ENCRYPTION_KEY` depois torna CPFs e telefones ilegiveis.

## Licenca

MIT
