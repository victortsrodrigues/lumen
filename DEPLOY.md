# Deploy — Church Manager Core (LUMEN)

Guia passo a passo para publicar a aplicação no Railway. Escrito assumindo que **é a primeira vez que você faz deploy**. Nenhum conhecimento de DevOps necessário.

---

## O que você vai ter no final

- App acessível numa URL pública (ex: `lumen-production.up.railway.app` ou domínio próprio)
- Banco PostgreSQL gerenciado pelo Railway
- HTTPS automático
- Deploy automático toda vez que você der `git push`
- Usuário admin pré-criado (`victadeu@gmail.com`) já na primeira subida

---

## Antes de começar — pré-requisitos

- [x] Código já no GitHub → `git@github.com:victortsrodrigues/lumen.git` ✅
- [x] Bootstrap admin implementado ✅
- [ ] Conta no Railway (criamos no passo 1)
- [ ] Cartão de crédito (internacional — o Railway cobra em USD. Nubank, Inter, C6 funcionam)

---

## Passo 1 — Criar conta no Railway

1. Abra https://railway.app/
2. Clique em **Login** (canto superior direito)
3. Escolha **Login with GitHub** — vai te redirecionar pro GitHub, autorize
4. Depois de logar, você cai na tela **Dashboard** (vazia na primeira vez)

### Passo 1.1 — Assinar o plano Hobby ($5/mês)

Railway hoje exige um plano mesmo pra projetos pequenos. Para não ter surpresa:

1. No canto superior direito, clique no seu **avatar** → **Account Settings**
2. Menu esquerdo → **Plans**
3. Clique em **Upgrade to Hobby** (card do meio, $5/mês)
4. Informe o cartão de crédito
5. Confirme

Pronto. Os $5 mensais vêm com $5 de créditos de uso inclusos. Volta pro Dashboard.

---

## Passo 2 — Criar o projeto (conectar ao GitHub)

1. No Dashboard, clique em **+ New Project** (botão roxo, canto superior)
2. Aparece um menu, escolha **Deploy from GitHub repo**
3. Se for a primeira vez, ele vai pedir pra **Configure GitHub App** — clique, abre o GitHub, autorize o Railway a acessar seus repos:
   - Escolha **Only select repositories**
   - Selecione **`victortsrodrigues/lumen`**
   - Clique em **Install & Authorize**
4. Volta pro Railway, agora aparece o repo `lumen` na lista — clique nele
5. Pergunta "Do you want to deploy immediately?" — clique em **Deploy Now**

> 🟡 **Importante:** o primeiro deploy **VAI FALHAR**. É esperado. O app precisa do banco e das env vars, que a gente ainda não configurou. Só ignore o erro e continue.

---

## Passo 3 — Adicionar o banco PostgreSQL

Dentro do projeto recém-criado:

1. Clique no botão **+ Create** (geralmente canto superior direito, dentro do projeto)
2. Escolha **Database** → **Add PostgreSQL**
3. Railway cria um serviço separado chamado **Postgres**. Já fica rodando, pronto pra uso.

Agora você tem **2 serviços** no mesmo projeto:
- **`lumen`** — seu backend+frontend
- **`Postgres`** — o banco

---

## Passo 4 — Conectar o app ao banco

O Railway **não conecta automaticamente**. Vamos apontar a `DATABASE_URL` do app pro Postgres:

1. Clique no serviço **`lumen`** (o card do app)
2. Aba **Variables** (no topo)
3. Clique em **+ New Variable**
4. **Name:** `DATABASE_URL`
5. **Value:** clique no botão **Add Reference** (ícone de link) → selecione **`Postgres.DATABASE_URL`**
   - Isso referencia dinamicamente a URL interna do banco (rede privada, de graça, sem sair pra internet)
6. Clique em **Add**

---

## Passo 5 — Adicionar as demais variáveis de ambiente

Ainda na aba **Variables** do serviço `lumen`, adicione estas variáveis (clique **+ New Variable** pra cada uma):

### 5.1 — Gerar as chaves criptográficas

No seu terminal local, rode:

```bash
openssl rand -hex 32    # cole isso como JWT_SECRET
openssl rand -hex 32    # cole isso como CSRF_SECRET
openssl rand -hex 32    # cole isso como FIELD_ENCRYPTION_KEY
```

Copie cada uma das 3 strings (64 caracteres hex) — você vai precisar delas.

> ⚠️ **IMPORTANTE sobre `FIELD_ENCRYPTION_KEY`:** essa chave criptografa CPFs e telefones dos membros. **Se você trocar depois que tiver dados cadastrados, os dados ficam ilegíveis pra sempre.** Guarde essa chave num lugar seguro (ex: um gerenciador de senhas).

> Em produção, o servidor recusa a inicialização se `JWT_SECRET`, `CSRF_SECRET` ou `FIELD_ENCRYPTION_KEY` estiver ausente ou vazia. Não existem valores padrão para produção.

### 5.2 — Cadastrar cada variável

| Nome | Valor |
|---|---|
| `NODE_ENV` | `production` |
| `JWT_SECRET` | (primeira chave gerada acima) |
| `CSRF_SECRET` | (segunda chave gerada acima) |
| `FIELD_ENCRYPTION_KEY` | (terceira chave gerada acima) |
| `STORAGE_PROVIDER` | `local` (somente compatibilidade com arquivos legados) |
| `UPLOAD_DIR` | `/app/uploads` (opcional; somente arquivos legados) |
| `BOOTSTRAP_ADMIN_EMAIL` | `victadeu@gmail.com` |
| `BOOTSTRAP_ADMIN_PASSWORD` | Gere uma senha forte e exclusiva; nunca a versione |
| `BOOTSTRAP_ADMIN_NAME` | `Victor Tadeu` |

> 🟢 `DATABASE_URL` e `PORT` são automáticos. Não mexer.

O CORS de produção aceita exclusivamente `https://iplumen.com`. Todas as operações `POST`, `PUT`, `PATCH` e `DELETE` da API exigem o par cookie/cabeçalho CSRF emitido pela própria aplicação.

### 5.3 — Salvar e redeployar

Railway detecta que as variáveis mudaram e **redeploya sozinho**. Aguarde ~3 minutos. Acompanhe em:
- Serviço `lumen` → aba **Deployments** → clique no deploy mais recente → **View Logs**

No log, você vai ver:
```
Server listening  port: 3000
Bootstrap: admin user created  email: victadeu@gmail.com
```

Se viu essa mensagem, o admin foi criado ✅

---

## Passo 6 — Expor o app pra internet (gerar URL pública)

Por padrão, o serviço está rodando mas sem URL pública.

1. No serviço `lumen`, aba **Settings**
2. Seção **Networking**
3. Clique em **Generate Domain**
4. Aparece uma URL tipo `lumen-production-a1b2.up.railway.app` (pode demorar uns segundos pra ficar acessível)
5. Clique na URL — deve abrir a tela de login do LUMEN

### Teste o login

- **E-mail:** `victadeu@gmail.com`
- **Senha:** use o valor seguro configurado em `BOOTSTRAP_ADMIN_PASSWORD` no Railway

Logou? 🎉 **Deploy concluído.**

### 🔒 Segurança pós-primeiro-login

Assim que entrar pela primeira vez:

1. Troque a senha pelo menu do app (ou via `/profile`)
2. **Remova `BOOTSTRAP_ADMIN_PASSWORD` do Railway** (aba Variables → ícone lixeira) — a senha já não é mais usada e deixar ela em env var é risco desnecessário
3. Opcional: também pode remover `BOOTSTRAP_ADMIN_EMAIL` e `BOOTSTRAP_ADMIN_NAME`

---

## Passo 7 (opcional) — Domínio customizado

Se você tem um domínio próprio (ex: `lumen.suaigreja.com.br`):

1. Serviço `lumen` → **Settings** → **Networking** → **+ Custom Domain**
2. Digite o domínio (ex: `lumen.suaigreja.com.br`)
3. Railway mostra um registro **CNAME** que você precisa criar no seu provedor de DNS (Registro.br, GoDaddy, Cloudflare, etc)
4. Crie o CNAME no painel do seu domínio, valor exatamente o que o Railway mostrou
5. Aguarde propagar (5–30min). Railway emite HTTPS automaticamente via Let's Encrypt
6. Quando aparecer verde ✅ no painel, já pode acessar pelo domínio custom

---

## Como funciona o deploy contínuo (dia a dia)

Depois do primeiro deploy funcionar, o ciclo é:

```bash
# 1. Você edita código localmente
# 2. Testa local com pnpm dev

# 3. Commit + push
git add -A
git commit -m "descrição da mudança"
git push

# 4. Railway detecta o push e deploya sozinho (~3min)
# Acompanhe: Railway → seu projeto → lumen → Deployments
```

Não precisa clicar em nada. `git push = deploy`.

### Mudanças de schema do banco

Toda mudança de schema deve ter uma migração SQL versionada em `lib/db/migrations`. No próximo deploy, o comando `pnpm db:migrate` aplica apenas as migrações ainda não registradas em `app_migrations`, antes de iniciar a aplicação.

**Cuidado com mudanças destrutivas** (drop column, rename, notNull sem default) — podem travar o deploy ou apagar dados. Em produção:
- Sempre fazer backup antes
- Adicionar colunas como nullable primeiro
- Evitar renomear colunas (criar nova, migrar dados, dropar antiga)

---

## Acessar o banco de dados

### Opção A — Painel visual do Railway

1. Projeto → serviço **Postgres** → aba **Data**
2. Interface tipo TablePlus/pgAdmin, direto no browser
3. Clica na tabela, vê/edita registros

### Opção B — Cliente externo (TablePlus, DBeaver, pgAdmin)

1. Projeto → serviço **Postgres** → aba **Connect**
2. Copie a **Public Network** connection string (formato `postgresql://...`)
3. Cole no TablePlus/DBeaver → conecta direto

### Opção C — Drizzle Studio local (mesma UI do dev)

```bash
DATABASE_URL="<connection-string-publica-do-railway>" pnpm db:studio
```
Abre `localhost:4983` com a UI visual do Drizzle apontada pro banco de produção.

### Opção D — psql via linha de comando

```bash
psql "<connection-string-publica>"
```

---

## Como fazer rollback (voltar pra versão anterior)

Se um deploy quebrar:

1. Serviço `lumen` → aba **Deployments**
2. Encontre o último deploy que funcionou (ícone verde ✅)
3. Clique nos 3 pontinhos → **Redeploy**
4. Em ~1min ele reverte pra aquela versão

O banco **não é revertido** (dados persistem). Se a mudança que quebrou foi de schema, pode precisar de rollback manual via SQL.

---

## Backup do banco

O Railway faz backups automáticos no plano Hobby. Para backup manual:

```bash
# Exportar (use a URL pública da aba Connect do Postgres)
pg_dump "<connection-string-publica>" > backup_$(date +%Y%m%d).sql

# Restaurar (em outro ambiente)
psql "<nova-url>" < backup_20260414.sql
```

Guarde os backups fora do Railway (Google Drive, Dropbox, S3).

---

## Variáveis de ambiente — referência

| Variável | Dev local | Produção Railway | Obrigatória? |
|---|---|---|---|
| `DATABASE_URL` | `.env` local | Referência ao Postgres do Railway | ✅ |
| `PORT` | 3000 | Injetado pelo Railway | ✅ (automático) |
| `NODE_ENV` | development | `production` | ✅ |
| `JWT_SECRET` | dev value | 64 hex chars aleatórios | ✅ |
| `CSRF_SECRET` | dev value | 64 hex chars aleatórios | ✅ |
| `FIELD_ENCRYPTION_KEY` | dev value | 64 hex chars aleatórios (**imutável!**) | ✅ |
| `EMAIL_PROVIDER` | vazio | `resend` | Para envio |
| `RESEND_API_KEY` | vazio | Chave criada no Resend | Para envio |
| `EMAIL_FROM` | vazio | `Lumen <contato@dominio-verificado>` | Para envio |
| `EMAIL_REPLY_TO` | vazio | Endereço que receberá respostas | Opcional |
| `APP_PUBLIC_URL` | localhost | URL pública sem barra final | Para envio |
| `EMAIL_VERIFICATION_REQUIRED` | `false` | `true` somente após validar a entrega | Para verificação |
| `STORAGE_PROVIDER` | local | `local` | Somente arquivos legados |
| `UPLOAD_DIR` | `./uploads` | `/app/uploads` | Somente arquivos legados |
| `BOOTSTRAP_ADMIN_EMAIL` | — | e-mail do admin inicial | Só 1º deploy |
| `BOOTSTRAP_ADMIN_PASSWORD` | — | senha forte e exclusiva, nunca versionada | Só 1º deploy |
| `BOOTSTRAP_ADMIN_NAME` | — | nome do admin | Opcional |

Para testar antes de a Lumen ter um domínio próprio, use `Lumen <onboarding@resend.dev>` em `EMAIL_FROM`, mantenha `EMAIL_VERIFICATION_REQUIRED=false` e envie somente para o endereço associado à conta Resend. Um endereço `@gmail.com` pode ser usado como `EMAIL_REPLY_TO`, mas não como remetente autenticado. Depois de verificar um domínio no Resend, altere `EMAIL_FROM`, valide a entrega e só então ative `EMAIL_VERIFICATION_REQUIRED=true`.

Nunca grave `RESEND_API_KEY` no repositório. Configure-a apenas como variável do serviço no Railway.

Novos uploads locais estão desativados. Fotos de membros não podem ser enviadas no momento; atas e cartas de transferência devem ser armazenadas em um serviço de nuvem e vinculadas por URL HTTPS. O armazenamento local permanece configurável apenas para leitura e remoção de registros antigos.

---

## Troubleshooting comum

### "Repository not found" ao conectar o GitHub
Railway não tem acesso ao repo privado. Reinstale o Railway GitHub App e confirme acesso a `victortsrodrigues/lumen`.

### Deploy build falha com "pnpm not found"
Verifique se `nixpacks.toml` está na raiz com a linha `cmds = ["npm install -g pnpm@9"]` na fase setup.

### Deploy build falha em "Cannot find module '@workspace/db'"
Algum pacote do monorepo não está na allowlist do `artifacts/api-server/build.ts`. Rode `pnpm build` localmente, se passar, o Railway passa também.

### App sobe mas retorna 500 em tudo
Quase sempre é falta de env var. Confira `NODE_ENV=production`, `JWT_SECRET`, `CSRF_SECRET` setados. Veja os logs do deploy.

### Tela branca / 404 em rotas
O backend em produção serve o frontend estático. Se o build do frontend falhou, o `dist/public/` fica vazio. Veja os logs do passo "Build frontend" — procure erros do Vite.

### Login retorna 500
`JWT_SECRET` ou `CSRF_SECRET` não estão configurados ou mudaram. Redefine e faça redeploy.

### "Invalid credentials" ao tentar logar como admin pela primeira vez
Bootstrap não rodou. Verifique nos logs se apareceu `Bootstrap: admin user created`. Se não, confira se as 3 variáveis `BOOTSTRAP_ADMIN_*` estão setadas e faça um redeploy manual (Deployments → 3 pontinhos → Redeploy).

### Dados criptografados ilegíveis depois de mudar `FIELD_ENCRYPTION_KEY`
Sem solução. Nunca troque essa chave depois de cadastrar membros reais. Se trocou por engano, vai precisar zerar os campos criptografados (CPF, telefone) no banco e pedir pros membros cadastrarem de novo.

---

## Custo estimado por mês

Para uma igreja de 50–300 membros, uso típico:

| Item | Custo |
|---|---|
| Plano Hobby (commitment fixo) | $5.00 |
| Uso extra (se passar dos $5 de crédito) | $0–5 |
| **Total esperado** | **$5–10 USD/mês (~R$ 25–50)** |

O Postgres fica ativo 24/7 (~$3), o app hiberna quando ocioso (~$1–2). Bem previsível.

---

## Setup local (para desenvolvimento futuro)

Se você for trabalhar em outra máquina:

```bash
# Clonar
git clone https://github.com/victortsrodrigues/lumen.git
cd lumen

# Pré-requisitos: Node 20+, pnpm 9+, Docker
pnpm install

# Banco local
cp .env.example .env
docker compose up -d
pnpm db:push

# Codegen + rodar
pnpm --filter @workspace/api-spec run codegen
pnpm dev
```

Acessos locais:
- Frontend: http://localhost:5173
- Backend: http://localhost:3000
- Drizzle Studio: `pnpm db:studio` → http://localhost:4983

### Criar admin local

Defina `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_PASSWORD`, `BOOTSTRAP_ADMIN_NAME` no `.env` local (mesmo padrão do Railway). Reinicie o backend — admin é criado automaticamente.

Ou popule com dados de demo:
```bash
pnpm db:seed
# Login: admin@igrejademo.com.br / Admin1234!
```

---

## Comandos de referência rápida

```bash
# Dev
pnpm dev                  # backend + frontend
pnpm db:studio            # UI visual do banco
pnpm db:migrate           # aplicar migrações versionadas

# Build & test
pnpm build                # build completo
pnpm test:api             # testes de API (vitest)

# Codegen (após mudar openapi.yaml)
pnpm --filter @workspace/api-spec run codegen
# ⚠️ remove manualmente a linha duplicada em lib/api-zod/src/index.ts

# Git / deploy
git add -A && git commit -m "..." && git push
# ↑ Railway deploya automaticamente
```
