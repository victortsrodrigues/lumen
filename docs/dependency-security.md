# Segurança das dependências

Revisão de 06/09/2026, limitada a vulnerabilidades altas e críticas conhecidas.

## Resultado local

| Auditoria | Altas | Críticas | Moderadas | Baixas |
| --- | ---: | ---: | ---: | ---: |
| `pnpm audit --prod` | 0 | 0 | 15 | 5 |
| `pnpm audit` (workspace completo) | 0 | 0 | 16 | 7 |

A auditoria anterior de produção apontava quatro altas. Ao incluir o workspace
completo, foram encontradas outras altas e também críticas em ferramentas de
desenvolvimento/geração. Elas foram incluídas na correção. Nenhum aviso foi
silenciado ou colocado em lista de exceções.

Esses números descrevem o lockfile local e os avisos publicados na data da
consulta, não uma garantia de ausência de falhas nem o estado do deploy atual.
Moderadas e baixas continuam fora do escopo desta rodada.

## Correções e impacto

| Componente | Risco e contexto | Correção |
| --- | --- | --- |
| Drizzle ORM | Identificadores SQL mal escapados podem permitir injeção quando nomes são derivados de entradas não confiáveis. Valores continuam devendo ser parametrizados. | Catálogo fixado em `0.45.2`; teste de aspas em identificadores e de parâmetros. |
| `path-to-regexp` | Combinações excessivas de grupos opcionais podem consumir recursos na compilação de rotas. Na aplicação, as rotas são definidas pelo código, não recebidas dos usuários. | Versão transitiva `8.4.0`; testes do limite e das rotas parametrizadas/fallback. |
| SheetJS / `xlsx` | Prototype pollution e ReDoS no processamento de planilhas maliciosas. O uso encontrado no produto é exportação financeira, não importação de arquivos do usuário. | `0.18.5` do npm substituído por `0.20.3` do CDN oficial, com URL versionada e integridade no lockfile. Exportação mantida. |
| Lodash | Nomes de importação não confiáveis em templates podem permitir injeção de código. A dependência chega ao frontend por Recharts; não foi encontrado uso de templates fornecidos por usuários. | Override para `4.18.1`; teste de rejeição de nome inválido e renderização dos gráficos. |
| Orval | Conteúdo OpenAPI malicioso podia resultar em injeção/execução de código no gerador ou no código gerado. É risco para o ambiente de build e não apenas para requisições em produção. | `8.22.0`, geração refeita, referências externas desabilitadas e saída Zod 3 explícita. |
| Vite | Avisos altos no servidor de desenvolvimento justificam atualização e redução da exposição desse servidor. O site de produção usa o build estático servido pelo backend. | `7.3.5` em todas as resoluções; dev/preview limitados a loopback e hosts permitidos, sem `allowedHosts: true`. |
| Ferramentas transitivas | Outros avisos altos/críticos também estavam em utilitários do gerador, de padrões e de execução de comandos. | `concurrently` atualizado para `9.2.4` (resolvendo `shell-quote` corrigido) e pisos de segurança transitivos abaixo. |

Os overrides em `pnpm-workspace.yaml` ficam limitados às respectivas linhas de
versão, evitando substituir indiscriminadamente versões principais:

- `picomatch`: `2.3.2` e `4.0.7`;
- `postcss`: `8.5.18`;
- `nanoid`: `3.3.18`;
- `browserslist`: `4.28.7`;
- `brace-expansion`: `2.1.4`;
- `js-yaml`: `4.3.1`;
- `fast-uri`: `3.1.6`;
- `linkify-it`: `5.0.2`.

O pacote `xlsx` do registro npm permanece desatualizado. Não substituir sua URL
por `xlsx@latest` durante uma atualização automática: isso pode reintroduzir
`0.18.5`. A distribuição oficial, não um fork de terceiros, foi usada. Novas
versões devem ser conferidas também no canal do fornecedor, pois uma auditoria
do registro sozinha não basta para acompanhar pacotes distribuídos por URL.

Fontes: [aviso do Drizzle](https://github.com/drizzle-team/drizzle-orm/security/advisories/GHSA-gpj5-g38j-94v9),
[aviso do path-to-regexp](https://github.com/pillarjs/path-to-regexp/security/advisories/GHSA-j3q9-mxjg-w52f),
[distribuição oficial SheetJS](https://docs.sheetjs.com/docs/getting-started/installation/nodejs/)
e [avisos do Orval](https://github.com/orval-labs/orval/security/advisories).

## Rotina de desenvolvimento e publicação

- Usar Node `22.23.2` (`.nvmrc`) e pnpm `10.33.0`. Orval exige Node `22.18+`.
  O Nixpacks fixa o arquivo de pacotes que fornece essa versão do Node 22 e
  instala o pnpm em um prefixo próprio. A verificação de integridade do Corepack
  não é desabilitada.
- Instalar com `pnpm install --frozen-lockfile --ignore-scripts` no CI/deploy.
  Ao atualizar uma dependência que realmente precise de um script de instalação,
  revisar esse script antes de alterar essa política.
- Rodar `pnpm audit:security`: qualquer alta ou crítica faz o comando falhar.
  Não usar `--ignore-registry-errors`; falha na consulta também impede o build.
- O workflow `Application checks` faz auditoria completa, geração reproduzível,
  typecheck, builds, testes unitários, testes críticos em PostgreSQL isolado e testes de UI
  com API simulada. Roda em pull requests, push em `main`, manualmente e às
  segundas-feiras às 10:30 UTC.
- O build do Railway também começa pela auditoria. Assim, não depende apenas do
  resultado do GitHub para impedir um novo build com alta/crítica conhecida.
  Isso passa a valer quando estas alterações forem publicadas.
- Não limitar o gate a `--prod`: há bibliotecas usadas pelo navegador declaradas
  como `devDependencies`, além das ferramentas executadas durante o build.
- Conferir o workflow semanal. Se surgir um aviso novo, revisar a dependência,
  atualizar lockfile/overrides e repetir os testes. Não contornar o bloqueio só
  para fazer o deploy passar.
- O Vite agora é acessível apenas no próprio computador por padrão. Acesso de
  outro dispositivo deve ser habilitado deliberadamente, com host e lista de
  hosts específicos; não expor o servidor de desenvolvimento na internet.

Os clientes/validadores em `lib/api-client-react/src/generated` e
`lib/api-zod/src/generated` são gerados. Alterar `openapi.yaml` ou a configuração
do Orval e executar codegen; não editar esses arquivos manualmente.

## Verificação

Na rodada original de dependências, a validação com Node `22.23.2` aprovou os
builds, 14 testes unitários, 16 testes de contas e 7 testes de navegador.
Os resultados atualizados de tipagem e CI estão em [ci.md](ci.md).
A geração foi executada novamente sem modificar a saída. A instalação congelada
também passou, sem alterar o lockfile.

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm audit:security
pnpm --filter @workspace/api-spec codegen
pnpm --filter @workspace/church-erp build
pnpm --filter @workspace/api-server build
pnpm test:unit
pnpm test:ui
```

Os testes de UI precisam do Chromium instalado (`pnpm exec playwright install
chromium`) ou de `PLAYWRIGHT_CHROMIUM_EXECUTABLE` apontando para um navegador
local compatível. Não usam o banco de produção nem enviam e-mails.

Para `pnpm test:accounts`, provisionar **somente** um banco local descartável
chamado `lumen_accounts_test`, informar `ACCOUNTS_TEST_DATABASE_URL` e executar
`pnpm db:test:prepare`. Esse comando cria a estrutura inicial apenas se o banco
isolado estiver vazio e depois aplica as migrações. A configuração recusa hosts
remotos, outros nomes de banco e opções extras na URL. O CI usa esse mesmo comando.

Na rodada seguinte, os erros de TypeScript da aplicação de produção foram
zerados, e o typecheck passou a ser obrigatório no CI e no build do Railway.
O protótipo auxiliar `mockup-sandbox` não faz parte do produto publicado.

O build Linux completo do Nixpacks e os testes do GitHub precisam ser confirmados
após a publicação; o Docker local estava indisponível durante esta validação.
Nenhuma migração em produção, envio de e-mail, alteração de credenciais ou
mudança nas regras de acesso/MFA é necessária para esta correção.
