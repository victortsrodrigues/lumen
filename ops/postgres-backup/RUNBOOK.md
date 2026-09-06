# Backups do PostgreSQL da Lumen

Este procedimento protege o banco com dumps lógicos armazenados fora do Railway. Se a Lumen migrar para o plano Pro, também deve habilitar os snapshots nativos e o PITR como uma segunda camada.

No plano Hobby atual, backups nativos e PITR não estão disponíveis. Por isso, o dump externo é obrigatório e não apenas complementar.

Nunca restaure um dump diretamente sobre o banco de produção. A restauração deve ser validada em um banco temporário vazio.

A frequência definida para a Lumen é semanal e mensal: backup todo domingo às 03:00 de Brasília, com uma cópia mensal do backup do primeiro domingo de cada mês. Os semanais são mantidos por 56 dias (8 semanas) e os mensais por 400 dias. Se todos os backups semanais forem concluídos, uma recuperação poderá perder até sete dias de alterações. O serviço foi publicado e testado em 06/09/2026; a próxima execução automática prevista é 13/09/2026 às 03:00 de Brasília. Estes arquivos, sozinhos, não configuram a infraestrutura em um novo ambiente.

## 1. Backups nativos do Railway (somente plano Pro)

Se o projeto for atualizado para o plano Pro, no serviço **Postgres**, abra **Backups** e habilite:

- `Weekly`: retenção de 27 dias; e
- `Monthly`: retenção de 89 dias.

No Hobby, gere e confirme um dump externo imediatamente antes de toda migração destrutiva. Não dependa de backups manuais antigos exibidos no painel, pois eles expiram.

## 2. Bucket externo no Cloudflare R2

Crie um bucket privado chamado `lumen-db-backups`. Não associe domínio público ao bucket.

Crie um token S3 limitado somente a esse bucket e guarde suas credenciais apenas nas variáveis do serviço de backup. Configure duas regras de ciclo de vida:

- expirar objetos sob `lumen/postgres/weekly/` depois de 56 dias; e
- expirar objetos sob `lumen/postgres/monthly/` depois de 400 dias.

As credenciais nunca devem ser adicionadas ao GitHub, aos logs ou a este documento.

As regras de ciclo de vida apenas removem cópias antigas; o agendamento no Railway é que cria os backups. Não crie a regra diária sugerida anteriormente. Se ela já existir, mantenha-a apenas enquanto houver cópias antigas no prefixo diário; não há mais produção de backups diários nesta configuração.

## 3. Serviço cron no Railway

Crie um serviço separado no mesmo projeto usando este repositório:

- nome: `postgres-backup`;
- diretório raiz: `/ops/postgres-backup`;
- Dockerfile: `Dockerfile` dentro do diretório raiz acima;
- comando de início: `/usr/local/bin/lumen-postgres-backup`;
- Railway Config File: sem arquivo associado;
- sem comandos de build ou pré-deploy personalizados e sem healthcheck HTTP;
- watch path: `/ops/postgres-backup/**`;
- sem domínio público;
- cron: `0 6 * * 0` (domingos, 06:00 UTC, 03:00 em Brasília);
- política de reinício: `Never`.

Salve essas opções diretamente nas configurações do serviço. O Railway recusa associar novos arquivos `railway.json`/`railway.toml`, que foram descontinuados. O serviço de backup deve usar o Dockerfile e o comando acima, sem herdar o comando de migração e o healthcheck da aplicação definidos no `railway.json` da raiz. Antes de iniciar o primeiro backup, confira a configuração efetiva do deployment. O Dockerfile executa o script de backup e encerra o processo ao terminar.

Configure as variáveis:

| Variável | Origem |
|---|---|
| `DATABASE_URL` | referência a `Postgres.DATABASE_URL`, pela rede privada |
| `S3_ENDPOINT` | endpoint S3 fornecido pelo R2 |
| `BACKUP_BUCKET` | `lumen-db-backups` |
| `AWS_ACCESS_KEY_ID` | credencial limitada do R2 |
| `AWS_SECRET_ACCESS_KEY` | credencial limitada do R2 |
| `AWS_DEFAULT_REGION` | `auto` |
| `BACKUP_PREFIX` | `lumen/postgres/weekly` |
| `MONTHLY_BACKUP_PREFIX` | `lumen/postgres/monthly` |

Use o **Access Key ID** da seção S3 em `AWS_ACCESS_KEY_ID` e a **Secret Access Key** em `AWS_SECRET_ACCESS_KEY`. O campo **Token value** não é usado por este serviço. Copie o endpoint S3 correspondente à jurisdição do bucket para `S3_ENDPOINT`, sem acrescentar o nome do bucket. Insira os segredos diretamente na aba **Variables** do serviço `postgres-backup`.

### Validação em 06/09/2026

- Bucket `lumen-db-backups` privado e regras de retenção de 56/400 dias confirmados pelo administrador.
- Serviço `postgres-backup` criado no ambiente `production` do projeto `virtuous-abundance`, com o agendamento e as configurações acima.
- Referência a `Postgres.DATABASE_URL`, endpoint S3 e demais variáveis não secretas cadastrados.
- As duas chaves S3 foram cadastradas pelo administrador nas variáveis do serviço.
- Código publicado no commit `2343890` e serviço conectado à branch `main` de `victortsrodrigues/lumen`.
- Build Docker concluído; o serviço executou o script de backup, sem herdar o comando de migrações da aplicação.
- Primeiro backup disparado manualmente às 17:20 de Brasília (20:20 UTC). Confirmados dump e checksum nos prefixos semanal e mensal.
- Arquivo: `lumen-postgres-20260906T202041Z.dump`, com 126.803 bytes. Deployment do backup: `0d700d74-3c14-4309-a5a4-a639f34795d5`.
- Restauração isolada concluída às 17:22 de Brasília. O arquivo foi baixado do R2 e seu SHA-256 validado antes da restauração. Deployment do teste: `4605bb62-888c-42c5-960b-2bf258fbd93f`.
- Resultado: 57 tabelas públicas, 2 migrações, 3 contas (1 administrador ativo e 2 membros ativos), 6 membros, 0 eventos e 5 notificações. Nenhum campo criptografado de membro estava preenchido nessa cópia; a verificação de descriptografia não pôde ser exercitada com dados reais e deverá ser repetida quando houver esses campos.
- O teste não recebeu `DATABASE_URL` de produção, não iniciou a aplicação e não enviou e-mails. O PostgreSQL temporário foi removido automaticamente ao encerrar o processo; o serviço descartável `postgres-backup-restore-test` foi excluído após o registro dos resultados. Os dumps no R2 e os serviços permanentes foram preservados.
- Railway confirmou `nextCronRunAt=2026-09-13T06:00:00.000Z`. A execução automática ainda deve ser conferida na verificação semanal.

O processo falha se uma variável estiver ausente, se o endpoint não usar HTTPS, se o dump estiver vazio ou se o arquivo não puder ser consultado no bucket após o envio. Cada dump recebe um arquivo `.sha256` correspondente. No primeiro domingo de cada mês (domingo entre os dias 1 e 7), o mesmo dump também é armazenado sob o prefixo mensal.

Backups manuais podem ser executados fora da agenda usando o mesmo processo e as variáveis do serviço. Publicar um cron prepara a imagem, mas não substitui a confirmação de uma execução. Pela API do Railway, o disparo manual validado usa `deploymentInstanceExecutionCreate` com `serviceInstanceId` da instância de `postgres-backup` (não o ID do serviço Postgres). Na configuração atual, essa instância é `b11c6c9b-db6b-43af-8ae7-9c28d325d8d1`:

```graphql
mutation {
  deploymentInstanceExecutionCreate(input: {
    serviceInstanceId: "b11c6c9b-db6b-43af-8ae7-9c28d325d8d1"
  })
}
```

Cada execução cria uma cópia com data e hora no prefixo semanal; se ocorrer no primeiro domingo do mês, também cria a cópia mensal. Confirme a conclusão nos logs e a presença dos objetos no R2, especialmente antes de uma migração destrutiva. Uma resposta `true` da API confirma apenas o disparo, não a conclusão.

O log de sucesso termina com:

```text
Backup completed successfully (<tamanho> bytes).
```

## 4. Verificação semanal

Toda segunda-feira, o responsável deve confirmar:

1. que a última execução de `postgres-backup` terminou com sucesso;
2. que o dump e seu `.sha256` aparecem no R2;
3. que o backup mensal foi criado no primeiro domingo do mês; e
4. que não houve aumento inesperado no tamanho ou no custo.

Se o projeto estiver no Pro, confirme também que há um snapshot recente e que o PITR permanece saudável.

Uma falha no cron deve ser tratada no mesmo dia. Se a execução do primeiro domingo falhar, gere um novo backup manual e copie o dump e seu `.sha256` para o prefixo mensal, confirmando a presença de ambos no R2; uma execução em outro dia não fará essa cópia mensal automaticamente. O responsável principal é o administrador da Lumen; o agente de manutenção pode executar e registrar as verificações quando solicitado.

## 5. Teste de restauração

Faça o primeiro teste antes do lançamento e repita-o trimestralmente ou depois de alterar este processo.

### Teste isolado no Railway

Crie um serviço temporário separado usando o mesmo diretório e Dockerfile do backup, sem cron, domínio público, healthcheck ou reinício automático. Use o comando `/usr/local/bin/lumen-restore-from-r2` e configure:

- `CONFIRM_RESTORE_DRILL=RESTORE_TO_NON_PRODUCTION`;
- `S3_ENDPOINT`, `BACKUP_BUCKET`, `AWS_ACCESS_KEY_ID` e `AWS_SECRET_ACCESS_KEY`: referências às variáveis de `postgres-backup`;
- `BACKUP_OBJECT_KEY`: caminho completo de um dump existente no R2, incluindo `lumen/postgres/weekly/` e o nome `.dump`;
- `FIELD_ENCRYPTION_KEY`: referência a `lumen.FIELD_ENCRYPTION_KEY`, somente durante o teste.

Não configure `DATABASE_URL` nesse serviço. O processo baixa o dump e o checksum, confere a integridade, cria um PostgreSQL temporário sem acesso TCP, restaura em uma transação e verifica tabelas, migrações, contagens e uma amostra dos campos criptografados sem registrar dados pessoais. A base temporária é removida ao encerrar. Registre os resultados e remova o serviço temporário depois do teste. Esse teste valida o banco e a chave; não executa a aplicação nem envia e-mails.

### Alternativa em outro PostgreSQL temporário

1. Crie um PostgreSQL temporário separado.
2. Crie nele um banco vazio chamado `restore_drill`.
3. Baixe o dump e o `.sha256` mais recentes do R2.
4. Valide o checksum com `sha256sum --check`.
5. Execute, usando apenas a URL do banco temporário:

```bash
CONFIRM_RESTORE_DRILL=RESTORE_TO_NON_PRODUCTION \
TARGET_DATABASE_URL='<url-do-banco-temporario-restore_drill>' \
BACKUP_FILE='<caminho-do-dump>' \
./ops/postgres-backup/restore-drill.sh
```

O script recusa a restauração se o banco não se chamar `restore_drill` ou se já contiver tabelas.

Depois da restauração, confira:

- quantidade de tabelas e migrações;
- quantidade de contas e membros;
- estados de aprovação, bloqueio e revogação;
- eventos e registros recentes;
- leitura de uma amostra de campos protegidos com a `FIELD_ENCRYPTION_KEY`.

Em um ensaio completo de recuperação da aplicação, valide também sua inicialização em ambiente isolado, com envio de e-mails desativado. Registre a data, o dump utilizado, o resultado e a duração. Remova o banco temporário depois de registrar o resultado do teste.

## 6. Chaves e documentos externos

Mantenha uma cópia da `FIELD_ENCRYPTION_KEY` em um gerenciador de senhas fora do Railway. Sem essa chave, CPFs e telefones restaurados continuam criptografados e ficam ilegíveis.

Os uploads locais estão desativados. O banco guarda apenas as URLs de atas, cartas e conteúdos externos; ele não copia o arquivo apontado pela URL. Esses documentos devem ficar em uma conta institucional com sua própria política de recuperação.
