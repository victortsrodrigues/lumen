# Validação essencial para publicação

Revisão inicial de 06/09/2026. Escopo: aplicação de produção, sem MFA, mudanças
visuais ou reescrita dos módulos. Os resultados dessa revisão são históricos;
a validação mais recente está abaixo.

## Validação local de 17/10/2026

Após as correções de dependências descritas em [dependency-security.md](dependency-security.md):

| Verificação | Resultado |
| --- | --- |
| Instalação congelada sem scripts | Aprovada |
| Auditoria do workspace completo | 0 altas, 0 críticas; 22 moderadas e 8 baixas |
| Geração da API | Sem alterações nos clientes e validadores versionados |
| Tipagem e build do produto | Aprovados |
| Testes unitários | 25 aprovados |
| Integração com banco descartável | 31 aprovados |
| Navegador com API simulada | 37 aprovados |

Total: **93 testes aprovados**, incluindo quatro regressões novas de compressão
e descoberta de previews. Os fluxos existentes exercitam autenticação,
recuperação de senha, gestão e vínculo de contas, autorização, proteção de atas,
finanças, Cultos, exportação de planilhas e navegação jurídica.

Ambiente: macOS arm64, Node `22.23.2`, pnpm `10.33.0`, Chromium do Playwright
`1.58.2` e PostgreSQL `18.6` temporário restrito a loopback. O banco exclusivo
`lumen_accounts_test` foi criado vazio e preparado com `pnpm db:test:prepare`,
aplicando as cinco migrações existentes. O CI continua usando PostgreSQL 16.
Não foram usados banco de produção ou envio real de e-mail. Os avisos já
existentes de sourcemap e tamanho do bundle continuam sem bloquear o build.

O workflow foi atualizado para `actions/checkout v7.0.1` e
`actions/setup-node v7.1.0`, ambos fixados por SHA e com runtime Node 24 interno.
O Node da aplicação permanece definido pela `.nvmrc`. O cache automático de
pacotes foi explicitamente desativado e o runner foi fixado em `ubuntu-24.04`
para controlar a transição anunciada de `ubuntu-latest`. Permissões mínimas,
credenciais não persistidas e todos os bloqueios de segurança foram mantidos.

Esta seção registra a validação local anterior à publicação. O resultado das
novas actions deve ser conferido no CI do PR e da `main`; a publicação Linux
deve ser confirmada pelo deployment correspondente no Railway e pelo healthcheck.

## Varredura e correções

| Projeto | Antes desta rodada | Após correções |
| --- | ---: | ---: |
| Backend | 388 erros | 0 |
| Frontend | 149 erros | 0 |
| Bibliotecas compartilhadas e scripts | 0 | 0 |

A maior parte veio de parâmetros de rotas do Express 5 tipados genericamente
como `string | string[]` e do Orval sem versão explícita do React Query 5.
Os parâmetros nomeados agora seguem as rotas reais; wildcards continuam sendo
tratados como arrays. Não foram desligados `strict`, `noImplicitReturns` nem
adicionadas supressões para fazer a validação passar.

Outros ajustes alinham os contratos do dashboard às respostas do servidor,
usam os tipos reais em listas e filtros e corrigem nomes de campos do fórum,
o nome do destinatário PIX, um ícone ausente e a tipagem dos links de conteúdo.
O helper não utilizado `objectAcl.ts` foi removido; não foram removidos uploads
nem dados de usuários. O arquivo anterior permanece recuperável pelo Git.

A migração `0005_council_media_type.sql` inclui no enum do PostgreSQL o tipo de
mídia já usado pelas atas via URL. É aditiva e idempotente. Foi testada somente
no banco descartável; será aplicada em produção pelo fluxo normal do deploy.

## Comandos e rotina

Usar Node `22.23.2` e pnpm `10.33.0`.

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm audit:security
pnpm build
pnpm test:unit
pnpm test:ui
```

`pnpm build` regenera o cliente, exige `pnpm typecheck` e compila frontend e
backend. `pnpm typecheck` verifica todas as bibliotecas, backend, frontend e
scripts. O comando antigo abrangente foi preservado como `pnpm typecheck:all`:
ele também inclui o protótipo `mockup-sandbox`, que ainda tem dois erros de
imports de plugins Replit ausentes e não é compilado/publicado no Railway.

Para integração, criar um PostgreSQL local **descartável**, com banco
`lumen_accounts_test`, e definir `ACCOUNTS_TEST_DATABASE_URL` no terminal:

```sh
pnpm db:test:prepare
pnpm test:accounts
```

Não usar credenciais de produção. A preparação recusa destinos remotos, outros
nomes de banco e parâmetros extras de conexão. Usa `drizzle-kit push` somente
para criar a estrutura em um banco de teste vazio, pois as migrações existentes
partem de um schema legado. Não altera `db:migrate` nem o comando de produção.
Uma segunda preparação executa apenas as migrações pendentes.

Validação local: 19 testes unitários, 23 de integração e 10 de navegador
aprovados com Node 22.23.2; backend/frontend e bibliotecas sem erros de tipos.
PostgreSQL local 14 em instância temporária; o CI usa PostgreSQL 16. A geração
dos 465 arquivos do cliente/validadores foi repetida sem alterações. A auditoria
reconsultada manteve zero altas e zero críticas. Os avisos de tamanho do bundle
e sourcemap já existentes não foram tratados nesta rodada.

Testes críticos cobrem cadastro pendente sem duplicar membro, confirmação e
aprovação separadas, token de recuperação de uso único/expiração, invalidação de
sessões antigas, permissões de contas, vínculo manual, finanças e mês fechado,
isolamento de perfil/LGPD, CSRF em logout/upload e CORS. Somente a entrega externa
de e-mail é simulada; tokens, criptografia, transações e rotas usam o código real.
Os testes de navegador usam API simulada e não acessam produção.

## O que bloqueia a publicação

- CI `Application checks`, job `security`: auditoria de altas/críticas, geração
  reproduzível, typecheck, builds, testes unitários, integração e navegador.
- Nixpacks/Railway: auditoria, testes unitários e build com typecheck obrigatório.
  Falhar em qualquer um interrompe o build, mesmo sem proteção de branch.
- Para impedir integração de código reprovado na `main`, configurar proteção de
  branch/ruleset exigindo pull request e o check `security` do GitHub Actions,
  inclusive para administradores/sem bypass. Manter a branch atualizada.
- No serviço `lumen` do Railway, ativar **Wait for CI**, para que integração e
  navegador também sejam condições para o autodeploy.

O CI roda depois de um push: sozinho não impede o envio de commits. Proteção de
branch controla a entrada na `main`; Wait for CI controla o autodeploy. Não há
hook local tratado como garantia de segurança.

Na consulta desta rodada, `main` estava sem proteção e a conta autenticada no
GitHub CLI tinha apenas leitura do repositório. Essas configurações externas
não foram alteradas nem confirmadas como ativas. Após publicar esta rodada,
confirmar o workflow verde antes da liberação. A execução anterior falhou ao
aplicar migrações num banco vazio; `db:test:prepare` corrige esse preparo no CI.

Fontes oficiais: [proteção de branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)
e [Railway Wait for CI](https://docs.railway.com/deployments/github-autodeploys#wait-for-ci).
