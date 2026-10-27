# Segurança das dependências

Revisão de 06/09/2026, limitada a vulnerabilidades altas e críticas conhecidas.

## Resultado local da revisão inicial (06/09/2026)

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

## Atualização de 11/09/2026 — js-yaml

O CI do PR de destaque de Cultos identificou o aviso alto
[GHSA-2883-xcg3-v3hh](https://github.com/advisories/GHSA-2883-xcg3-v3hh)
na versão `4.3.1` de `js-yaml`, dependência transitiva do Orval. Fontes vazias de
merge YAML podiam consumir CPU sem serem contabilizadas no limite de trabalho.
O override da linha 4.x e o lockfile foram atualizados para `4.3.2`, sem mudar
outras versões nem desativar a auditoria obrigatória.

Após a atualização, `pnpm audit:security` passou: **0 altas, 0 críticas,
18 moderadas e 7 baixas** no workspace completo. Os testes unitários usam a
dependência resolvida pelo próprio Orval e verificam tanto a rejeição de merges
vazios acima de um limite pequeno quanto a preservação de merges normais.

## Correções e impacto

### Atualização de 27/10/2026 — auditoria semanal de 26/10

A [execução de 26/10](https://github.com/victortsrodrigues/lumen/actions/runs/40363149051)
encontrou seis alertas altos em cinco bibliotecas. O mesmo commit havia passado
em 19/10; os avisos foram incorporados ou revisados na base de segurança depois
daquela aprovação. A auditoria obrigatória foi preservada, sem exceções.

| Dependência | Anterior | Corrigida |
| --- | --- | --- |
| `body-parser` (Express) | `2.2.2` | `2.4.0` |
| `zod` | `3.25.76` | `4.6.6` |
| `vite` | `7.3.5` | `7.3.7` |
| `markdown-it` (Orval/TypeDoc) | `14.3.1` | `14.3.3` |
| `dompurify` (jsPDF) | `3.3.3` | `3.4.17` |

Os pisos transitivos permanecem limitados às respectivas versões principais.
A migração do Zod usa efetivamente a API v4: Orval configurado para v4,
validadores regenerados e `@hookform/resolvers 5.2.2` nos dois consumidores do
workspace. Os formulários distinguem valores de entrada e saída para preservar
coerção de valores monetários, campos opcionais, valores padrão e conversões.
As mensagens customizadas foram adaptadas; a ausência de professor também
recebe a mensagem em português já usada para seleção vazia.

Dois testes HTTP locais verificam que os parsers JSON e de formulário preservam
conteúdo comprimido e encerram o decodificador após a leitura bem-sucedida,
sem deixar o processo exposto a erros posteriores naquele stream. Outro teste
verifica que uma coleção Zod acima do limite é rejeitada antes da validação de
cada elemento. O patch não cria limites automaticamente para coleções sem
`.max()`; nenhum novo limite de negócio foi introduzido nesta atualização.

Nove regressões de navegador cobrem os sete formulários com coerções,
transformações ou valores padrão. A cobertura dos relatórios passou a verificar
também o download de PDF. Isso identificou e corrigiu uma integração existente:
a exportação agora chama `autoTable(doc, options)` explicitamente, conforme a
API do plugin, em vez de depender de instalação global em `doc.autoTable`.

Auditoria local de 27/10: **0 altas, 0 críticas, 16 moderadas e 4 baixas**.
Não há novas migrações do banco, alteração de permissões ou de credenciais.
Os resultados dos testes e limites da validação estão em [ci.md](ci.md).

Avisos oficiais: [body-parser](https://github.com/expressjs/body-parser/security/advisories/GHSA-27r3-jxmh-p828),
[Zod](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5),
[Vite](https://github.com/advisories/GHSA-587h-7wmj-h5pm),
[markdown-it smartquotes](https://github.com/advisories/GHSA-r7fv-28h4-cvq7),
[markdown-it referências](https://github.com/advisories/GHSA-gfr2-rv44-r23c) e
[DOMPurify](https://github.com/advisories/GHSA-mrv2-3pqr-j5jr).
Referências da migração: [Zod 4](https://zod.dev/v4/changelog) e
[jsPDF-AutoTable](https://github.com/simonbengtsson/jsPDF-AutoTable#usage).

### Atualização de 17/10/2026 — alertas da verificação semanal

A execução semanal de 12/10/2026, [Application checks #23](https://github.com/victortsrodrigues/lumen/actions/runs/38300794845),
parou na auditoria com 2 alertas críticos e 7 altos. O lockfile foi atualizado
sem trocar as versões principais do produto, desativar a auditoria ou criar
exceções para avisos:

| Dependência | Resolução anterior | Resolução corrigida |
| --- | --- | --- |
| `compression` | `1.8.1` | `1.8.2` |
| `proxy-addr` (Express) | `2.0.7` | `2.0.8` |
| `shell-quote` (concurrently) | `1.9.0` | `1.11.0` |
| `fast-uri` (geração OpenAPI) | `3.1.6` | `3.1.7` |
| `brace-expansion` (ferramentas do Orval) | `5.0.9` | `5.0.11` |
| `source-map-js` (build do frontend) | `1.2.1` | `1.2.2` |

O piso preventivo de `brace-expansion` na linha 2.x também passou a `2.1.6`.
Os overrides permanecem limitados às linhas compatíveis. A distribuição oficial
do SheetJS `0.20.3` foi preservada.

O aviso de `braces` não tinha versão corrigida indicada. Seu único caminho era
`mockup-sandbox → fast-glob → micromatch → braces`. O plugin auxiliar agora usa
`tinyglobby 0.2.17`, já resolvido no projeto, preservando padrões, exclusões,
diretório base e caminhos de importação. A cadeia antiga saiu do lockfile.
O protótipo continua fora do produto publicado.

Dois testes novos verificam resposta gzip íntegra e destruição do compressor
real quando o cliente encerra a conexão antes do fim da resposta, seguida de
outra resposta bem-sucedida. Dois testes do plugin verificam descoberta de
previews em subpastas, exclusões, arquivos ocultos, links simbólicos, imports
relativos e atualização após adicionar/remover arquivos.

Validação local em 17/10/2026: auditoria completa com **0 altas, 0 críticas,
22 moderadas e 8 baixas**; instalação congelada, geração reproduzível, tipagem,
build e 93 testes aprovados. Ambiente e limites estão em [ci.md](ci.md).
Os resultados não comprovam execução do workflow atualizado no GitHub nem
publicação no Railway. Não foram necessárias novas migrações ou alterações
de dados e permissões.

Avisos oficiais: [compression](https://github.com/advisories/GHSA-vc2v-76pw-4v95),
[proxy-addr](https://github.com/advisories/GHSA-jqcg-44mw-7w3h),
[shell-quote](https://github.com/advisories/GHSA-pqg4-j6r4-53mv),
[fast-uri: porta](https://github.com/advisories/GHSA-qw65-cvwx-89v3),
[fast-uri: host](https://github.com/advisories/GHSA-58mr-gqgx-xq4g),
[brace-expansion: grupos](https://github.com/advisories/GHSA-qhr7-859c-m2p7),
[brace-expansion: vírgulas](https://github.com/advisories/GHSA-6j4f-fj2g-mc7p),
[source-map-js](https://github.com/advisories/GHSA-68fv-2mgg-jv7q) e
[braces](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm).

### Revisão inicial de setembro de 2026

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
- `js-yaml`: `4.3.2` (atualização de segurança em 11/09/2026);
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
