# Deploy — Church Manager Core (LUMEN)

Guia completo para configurar o ambiente de desenvolvimento em uma maquina nova, fazer deploy no Railway e manter o ciclo de desenvolvimento continuo.

---

## 1. Setup em maquina nova

### Pre-requisitos

Instalar antes de comecar:

- **Node.js** 20+ — [nodejs.org](https://nodejs.org/)
- **pnpm** 9+ — `npm install -g pnpm`
- **Docker** — [docker.com](https://www.docker.com/)
- **Git** — [git-scm.com](https://git-scm.com/)

### Clonar e configurar

```bash
# 1. Clonar o repositorio
git clone https://github.com/SEU_USUARIO/church-manager-core.git
cd church-manager-core

# 2. Instalar dependencias
pnpm install

# 3. Configurar variaveis de ambiente
cp .env.example .env
# Editar .env: trocar a porta do PostgreSQL para 5433 se necessario

# 4. Subir o banco + aplicar schema
docker compose up -d
pnpm db:push

# 5. Gerar hooks da API (codegen)
pnpm --filter @workspace/api-spec run codegen

# 6. Rodar
pnpm dev
```

Acessar:
- **Frontend:** http://localhost:5173
- **Backend API:** http://localhost:3000
- **Drizzle Studio:** `pnpm db:studio`

### Criar usuario admin

1. Registre-se pela tela de cadastro
2. Promova para admin:
```bash
PGPASSWORD=church_erp psql -h localhost -p 5433 -U church_erp -d church_erp \
  -c "UPDATE users SET role = 'admin' WHERE email = 'seu@email.com';"
```

### Popular com dados de demonstracao

```bash
pnpm db:seed
```

Logins de demo: `admin@igrejademo.com.br` / `Admin1234!`

---

## 2. Como funciona o deploy

```
Desenvolve local → git push → Railway detecta → Build → Migrate DB → Start
```

### Arquitetura em producao

Em producao, o Express serve tudo em uma unica porta:
- `/api/*` → rotas da API (Express)
- `/*` → frontend React (arquivos estaticos do Vite build)

Nao precisa de Nginx. Um unico servico no Railway.

### O que o Railway faz no deploy

1. Detecta `nixpacks.toml` e instala Node + pnpm
2. Roda `pnpm install`
3. Roda codegen (gera hooks da API)
4. Builda o frontend (`vite build`)
5. Builda o backend (`esbuild`)
6. No start: roda `pnpm db:push` (migra schema) + `node dist/index.cjs`

---

## 3. Configurar o Railway (primeira vez)

### Passo 1 — Criar conta

1. Acesse [railway.app](https://railway.app/)
2. Crie conta com GitHub

### Passo 2 — Criar projeto

1. Clique em "New Project"
2. Selecione "Deploy from GitHub repo"
3. Conecte seu repositorio `church-manager-core`
4. Railway detecta automaticamente o `nixpacks.toml`

### Passo 3 — Adicionar banco PostgreSQL

1. No projeto, clique em "+ New" → "Database" → "PostgreSQL"
2. Railway cria o banco e injeta a variavel `DATABASE_URL` automaticamente

### Passo 4 — Configurar variaveis de ambiente

No painel do servico, va em "Variables" e adicione:

```
NODE_ENV=production
JWT_SECRET=<gerar com: openssl rand -hex 32>
CSRF_SECRET=<gerar com: openssl rand -hex 32>
FIELD_ENCRYPTION_KEY=<gerar com: openssl rand -hex 32>
STORAGE_PROVIDER=local
UPLOAD_DIR=/app/uploads
```

**IMPORTANTE:** `DATABASE_URL` e `PORT` sao injetados automaticamente pelo Railway. Nao adicione manualmente.

**Como gerar as chaves:**
```bash
openssl rand -hex 32
# Repita 3 vezes, uma para cada variavel
```

### Passo 5 — Deploy

O deploy acontece automaticamente apos configurar as variaveis. Acompanhe os logs no painel.

Se precisar forcar um re-deploy: "Settings" → "Redeploy"

### Passo 6 — Dominio

Railway gera uma URL automatica (ex: `church-manager-core-production.up.railway.app`).

Para dominio customizado:
1. Va em "Settings" → "Networking" → "Custom Domain"
2. Adicione `erp.suaigreja.com.br`
3. Configure o DNS do seu dominio com o CNAME que o Railway fornece
4. Railway configura HTTPS automaticamente (Let's Encrypt)

---

## 4. Ciclo de desenvolvimento continuo

### Fluxo diario

```bash
# 1. Desenvolve local
pnpm dev

# 2. Testa
pnpm test:api          # 346 testes de API
pnpm test:e2e          # 128 testes E2E (Playwright)

# 3. Commita e faz push
git add .
git commit -m "feat: descricao da mudanca"
git push

# 4. Railway deploya automaticamente
# Acompanhe em railway.app → Logs
```

### Adicionar nova funcionalidade

1. Criar schema em `lib/db/src/schema/`
2. Exportar em `schema/index.ts`
3. Criar rotas em `artifacts/api-server/src/routes/`
4. Registrar em `routes/index.ts`
5. Adicionar no OpenAPI (`lib/api-spec/openapi.yaml`)
6. Rodar codegen: `pnpm --filter @workspace/api-spec run codegen`
7. Criar paginas frontend em `artifacts/church-erp/src/pages/`
8. Adicionar rotas no `App.tsx` + item no `Sidebar.tsx`
9. Testar localmente
10. `git push` → deploy automatico

### Alterar schema do banco

Mudancas no schema sao aplicadas automaticamente no deploy porque o start command roda `pnpm db:push` antes de iniciar o servidor.

**CUIDADO:** Se remover uma coluna, os dados sao perdidos. Faca backup antes de mudancas destrutivas.

---

## 5. Variaveis de ambiente

| Variavel | Dev (local) | Producao (Railway) | Descricao |
|---|---|---|---|
| DATABASE_URL | `.env` local (porta 5433) | Injetado pelo Railway | Connection string PostgreSQL |
| PORT | 3000 (fixo) | Injetado pelo Railway | Porta do servidor |
| NODE_ENV | development | production | Modo de execucao |
| JWT_SECRET | Valor de dev | `openssl rand -hex 32` | Chave para tokens JWT |
| CSRF_SECRET | Valor de dev | `openssl rand -hex 32` | Chave para tokens CSRF |
| FIELD_ENCRYPTION_KEY | Valor de dev | `openssl rand -hex 32` | Chave AES-256 para criptografia de PII |
| STORAGE_PROVIDER | local | local | Tipo de storage |
| UPLOAD_DIR | ./uploads | /app/uploads | Pasta de uploads |

**IMPORTANTE:** Se trocar `FIELD_ENCRYPTION_KEY` depois de ter dados cadastrados, CPFs e telefones ficam ilegiveis. Defina a chave **antes** de cadastrar dados reais.

---

## 6. Backup

### Banco de dados

**Railway:** O PostgreSQL managed do Railway tem backups automaticos. Para backup manual:

```bash
# Exportar (substitua a URL pela do Railway)
pg_dump "postgresql://USER:PASS@HOST:PORT/DB" > backup_$(date +%Y%m%d).sql

# Importar
psql "postgresql://USER:PASS@HOST:PORT/DB" < backup.sql
```

A connection string esta nas variaveis do servico PostgreSQL no Railway.

### Codigo

O codigo esta no Git/GitHub. Qualquer maquina com Git pode clonar e continuar o desenvolvimento.

---

## 7. Rollback

Se um deploy quebrar:

1. Va no Railway → Deployments
2. Clique no deploy anterior (que funcionava)
3. Clique em "Rollback"

O Railway reverte para a versao anterior imediatamente.

---

## 8. Troubleshooting

### Build falha no Railway

**Erro:** `pnpm: command not found`
**Solucao:** Verifique se `nixpacks.toml` tem `cmds = ["npm install -g pnpm@9"]` na fase setup.

**Erro:** `Cannot find module`
**Solucao:** Verifique se a dependencia esta no `allowlist` do `build.ts` ou nas `dependencies` do `package.json`.

**Erro:** `ECONNREFUSED` no banco
**Solucao:** Verifique se o PostgreSQL add-on esta ativo e se `DATABASE_URL` esta configurado nas variaveis.

### Aplicacao nao carrega no browser

**Erro:** Tela branca
**Solucao:** Verifique se o frontend foi buildado (`artifacts/church-erp/dist/public/` existe). No Railway, veja os logs de build.

**Erro:** 404 nas rotas do React
**Solucao:** O SPA fallback em `app.ts` deve retornar `index.html` para todas as rotas nao-API. Verifique se `NODE_ENV=production` esta configurado.

### Login nao funciona

**Erro:** 500 no `/api/auth/login`
**Solucao:** Verifique se `JWT_SECRET` e `CSRF_SECRET` estao configurados nas variaveis do Railway.

### Dados criptografados ilegiveis

**Causa:** `FIELD_ENCRYPTION_KEY` foi trocada apos cadastrar dados.
**Solucao:** Nao ha solucao. Os dados antigos sao irrecuperaveis. Por isso, defina a chave antes de usar em producao e nunca troque.

---

## 9. Comandos uteis

```bash
# Desenvolvimento
pnpm dev                    # Inicia backend + frontend
pnpm dev:api                # Inicia apenas o backend
pnpm dev:web                # Inicia apenas o frontend
pnpm db:studio              # Interface visual do banco
pnpm db:seed                # Popula com dados de demo

# Build
pnpm build                  # Builda tudo (typecheck + backend + frontend)

# Testes
pnpm test:api               # Testes de API (Vitest)
pnpm test:e2e               # Testes E2E (Playwright)
pnpm test:api:reset          # Limpa banco de testes

# Schema
pnpm db:push                # Aplica mudancas no banco
pnpm --filter @workspace/api-spec run codegen  # Regenera hooks da API
```

---

## 10. Custo estimado (Railway)

| Componente | Custo estimado |
|---|---|
| Servico (backend + frontend) | ~$5-7/mes |
| PostgreSQL managed | ~$5-7/mes |
| **Total** | **~$10-14/mes (~R$ 55-75)** |

O Railway cobra por uso (CPU + RAM + disco). Para uma igreja com 50-200 membros, o custo e minimo.
