# Gestão de contas e vínculos

## Uso diário

Em **Administração → Contas e acessos**, somente administradores podem:

- **Rejeitar solicitação** pendente, informando motivo. A conta fica **Rejeitada**;
  o e-mail continua reservado e o histórico é preservado. Nenhum membro é excluído.
- **Reabrir solicitação** rejeitada. Ela volta para **Pendente**, sem aprovação
  automática e sem marcar o e-mail como confirmado.
- **Aprovar** escolhendo um membro, deixando explicitamente sem vínculo ou usando
  a correspondência automática. Esta última só funciona com exatamente um membro
  de e-mail igual (ignorando maiúsculas/espaços externos), ainda disponível.
- **Vincular membro**, **Alterar vínculo** ou **Desvincular**. O seletor permite
  pesquisar nome/e-mail e mostra membros já ocupados. E-mails diferentes são
  permitidos, com aviso para conferir a identidade. Confirme nome, situação e ID
  do membro para evitar confusão entre homônimos.

O vínculo não altera papel, aprovação ou confirmação de e-mail. Não cria, exclui
nem mescla membros. Uma conta pode ter um membro e um membro pode ter uma conta.
Para transferir um membro ocupado, desvincule a conta anterior primeiro.

Alterações de vínculo encerram as sessões anteriores daquela conta. Se alterar
seu próprio vínculo, entre novamente. As permissões administrativas permanecem
as mesmas. Contas em exclusão não aceitam alterações de vínculo.

Uma desvinculação explícita nunca é desfeita automaticamente: perfil, painel,
notificações, Ensino, eventos e demais módulos usam `users.member_id`, não o
e-mail como prova de identidade. Contas antigas ainda sem `member_id` precisam
ser conferidas e vinculadas manualmente. Não há migração automática por nome ou
e-mail. Os registros e históricos dos membros permanecem onde estavam.

Rejeitar/reabrir não dispara e-mail externo. O motivo e as alterações ficam na
auditoria. Não existe exclusão administrativa permanente de solicitação nesta
entrega; uma rejeitada pode ser reaberta para corrigir uma decisão.

## Publicação segura

1. Confirme um backup recente e restaurável antes do deploy.
2. Verifique os vínculos atuais com consultas somente de leitura:

   ```sql
   SELECT member_id, count(*) FROM users
   WHERE member_id IS NOT NULL GROUP BY member_id HAVING count(*) > 1;

   SELECT u.id FROM users u LEFT JOIN members m ON m.id = u.member_id
   WHERE u.member_id IS NOT NULL AND m.id IS NULL;
   ```

   Ambas devem retornar zero linhas. Se houver inconsistência, pare e revise
   com o administrador; não exclua contas nem adivinhe a associação correta.

3. O comando de migrações já usado no deploy aplica, em transações separadas:
   - `0003_rejected_accounts.sql`: acrescenta o estado `rejected`.
   - `0004_account_member_integrity.sql`: marca decisões explícitas de vínculo,
     acrescenta índice único e chave estrangeira para membros.
4. A migração interrompe o deploy se encontrar duplicatas ou vínculos órfãos.
   Não use `drizzle-kit push` em produção para contornar essa proteção.
5. Após o deploy, valide com contas de teste: rejeitar → reabrir → aprovar;
   vincular → alterar → desvincular; login novamente após cada alteração.
   Confirme que o perfil corresponde ao membro escolhido e que e-mail não
   confirmado continua impedindo o login.
6. Confira as contas antigas sem vínculo antes de liberar os usuários.

As novas migrações são aditivas. Em um rollback, não remova o enum, o índice ou a
coluna automaticamente. Uma versão anterior desconhece o estado `rejected` e
pode voltar a usar o e-mail como vínculo; restaure uma versão compatível ou faça
uma correção adiante. Não restaure o banco de produção apenas para testar.

## Validação local

Os testes de integração usam uma API iniciada pelo próprio teste em porta
aleatória e um PostgreSQL **separado e descartável**. Não enviam e-mails. A
configuração recusa hosts remotos e qualquer banco que não se chame
`lumen_accounts_test`. Nunca aponte para o banco local com dados reais.

Em um servidor PostgreSQL exclusivamente de testes, crie o banco vazio e aplique
o schema atual. Substitua a conexão de exemplo pela conexão **local de teste**:

```sh
DATABASE_URL=postgresql://localhost:55439/lumen_accounts_test pnpm --filter @workspace/db exec drizzle-kit push
ACCOUNTS_TEST_DATABASE_URL=postgresql://localhost:55439/lumen_accounts_test pnpm exec vitest run --config tests/vitest.accounts.config.ts
pnpm test:unit
pnpm exec playwright test --config tests/playwright.accounts.config.ts
```

O teste de navegador inicia Vite em `127.0.0.1:5187`, simula a API e não usa
credenciais ou banco. Requer Chromium do Playwright instalado; opcionalmente
`PLAYWRIGHT_CHROMIUM_EXECUTABLE` pode indicar outro executável local de Chromium.

Os testes cobrem validação, autorização, CSRF, preservação de dados, rejeição,
reabertura, confirmação de e-mail sem aprovação, concorrência, integridade do
banco, expiração de sessões, ausência de associação implícita, notificações,
erros legíveis nos diálogos e uso em celular.

Os builds de frontend/backend devem ser executados antes da publicação. A
checagem de tipos global ainda tem erros anteriores a esta entrega, incluindo
exports duplicados em `lib/api-zod/src/index.ts`; não confundir build com
aprovação integral do TypeScript.
