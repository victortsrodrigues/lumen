# Refino — Plano de Execução

Master plan macro das fases para implementar os refinamentos descritos em [Refino.md](Refino.md).

> **Princípios**
> - Cada fase é commit-compatível com `main` ao final (sem deixar pela metade).
> - Antes de cada fase: entrar em **plan mode** para detalhar schema, arquivos e RBAC.
> - Reset do banco a qualquer momento — admin é recriado via bootstrap (`victadeu@gmail.com` / `SenhaERP@`).
> - Após cada fase: `git push` → Railway deploya → testar em produção.

---

## Decisões já tomadas

| Decisão | Valor |
|---|---|
| Sequenciamento | Módulo a módulo (Plano A) |
| Visitantes | Módulo separado, com botão "Converter em Membro" |
| Bíblia integrada | **Bloqueado** — pendente de decisão de API/lib |
| Migração de dados | Não há — reset do banco; admin pré-criado via bootstrap |
| Carta de Transferência (PDF) | Sim, geração automática (Fase 1) |
| Busca em atas (Conselho) | Por palavras-chave; full-text search a definir na Fase 6 |

---

## Visão das fases

| # | Fase | Escopo central | Risco | Depende de |
|---|---|---|---|---|
| 1 | Rol de Membros | Refator profundo de schema, 3 enums novos, exclusão de membro, vínculos | 🔴 Alto | — |
| 2 | Visitantes | Módulo novo separado + conversão para membro | 🟡 Médio | Fase 1 |
| 3 | Mapa de Discipulado | "áreas" com EBD, cores de saúde, líderes | 🟡 Médio | Fase 1 |
| 4 | Ensino e Pregação | Renomear, "curso" → "série", novas categorias | 🟢 Baixo | — |
| 5 | Culto | Substitui Liturgia, agenda anual, estrutura completa | 🔴 Alto | Fase 1 (escalas usam membros) |
| 6 | Conselho | Módulo novo: atas, reuniões, busca | 🟡 Médio | — |
| 7 | Dashboard | Atalhos: PGs, eventos próx. mês, cursos em andamento | 🟢 Baixo | Fases 1-6 (lê dados) |

> **Bloqueado** (fora de fase numerada): Bíblia integrada e relatórios temáticos anuais — escopo separado quando definirmos lib/API.

---

## Detalhamento por fase

### Fase 1 — Rol de Membros 🔴
**Status**: pendente

**Escopo**:
- Renomear módulo: "Membros" → "Rol de Membros" (sidebar, breadcrumbs, telas)
- **Status enum** novo: `ativo / disciplina / rol_apartado / falecido`
- **Classificação enum** novo: `comungante / nao_comungante`
- **Modo de Recepção enum** novo (dependente de classificação) — 6 opções comungantes, 3 não comungantes
- Novos campos: procedência religiosa, batismo na infância (igreja + pastor), pais/responsáveis, **data_recepcao** (substitui data_batismo), ano_conversao, estado_civil (FK members), formação acadêmica, profissão
- Vínculos: cônjuge (FK self), filhos (FK self N:N), agrupamentos (tags/grupos)
- **Exclusão de Membro** com workflow:
  - Comungantes: Transferência (gera carta PDF) / Falecimento / Exclusão a Pedido / Disciplina / Abandono / Ordenação ao Ministério
  - Não Comungantes: Transferência / Falecimento / Profissão de Fé (migra para comungante) / Abandono
- Geração automática de **Carta de Transferência** em PDF

**Notas técnicas**:
- Migration destrutiva — reset do banco
- `anonymizeMember` (LGPD) precisa ser atualizado pra cobrir os novos campos
- Telas de cadastro/edição com sub-abas: Status / Classificação / Modo de Recepção / Dados pessoais / Vínculos / Eclesiástica / Exclusão

---

### Fase 2 — Visitantes 🟡
**Status**: pendente — depende da Fase 1

**Escopo**:
- Schema novo `visitors` (leve: nome, contato, data da visita, evento, origem, observações)
- Sidebar: novo item "Visitantes" entre Rol de Membros e Membros
- CRUD simples
- Botão **"Converter em Membro"** — abre o formulário de cadastro de Rol de Membros pré-preenchido, exigindo classificação + modo de recepção; após cadastrar membro, marca o visitante como convertido (com FK pro novo member)

---

### Fase 3 — Mapa de Discipulado 🟡
**Status**: pendente — depende da Fase 1

**Escopo**:
- Renomear conceito: "etapas" → "áreas" (UI + comentários no código)
- **4 áreas**: Culto, Pequeno Grupo, Ministério, **EBD (incluir)**
- Para cada área e membro: cor de saúde `verde / amarelo / vermelho` (ativo / irregular / ausente)
- Mecanismo de cálculo automático da cor (regra a discutir: ex. ausência > 4 semanas → vermelho)
- Permitir vincular **referências** por área: líder de PG, líder de ministério, professor da EBD
- Tela do funil agrupa por cor; relatórios futuros consomem isso

**Pergunta a resolver na plan mode**: cálculo automático de cor vs marcação manual?

---

### Fase 4 — Ensino e Pregação 🟢
**Status**: pendente

**Escopo**:
- Renomear módulo: "Ensino" → "Ensino e Pregação" (sidebar, breadcrumbs)
- "adicionar curso" → "adicionar série" (textos UI, mantém entidade `course`)
- Categorias novas no enum: `pregacao / escola_biblica / pequeno_grupo / cursos_livres` (substitui categorias anteriores se houver)
- Schema mínimo (rotular `course.kind` por exemplo)

---

### Fase 5 — Culto 🔴
**Status**: pendente — depende da Fase 1 (escalas usam membros)

**Escopo**:
- Substitui módulo "Liturgia" — sidebar, rotas (`/liturgy` → `/cultos`)
- Cada culto = evento na **agenda anual** (registrado em `events` ou tabela própria que indexa em events)
- Estrutura interna do culto:
  - Texto de abertura
  - Pregação (texto bíblico — campo livre por enquanto)
  - Músicas (FK songs, múltiplas)
  - Elementos especiais: Ceia, Batismo, Recepção de Membros (checkboxes/flags)
  - **Escala dos ministérios** (reusar `event_schedules` existente)
- Tela de montagem da liturgia em formato editor estruturado
- Relatórios anuais com dados indexados (lista de cultos do ano, frequência, ministérios escalados)
- **Bloqueado**: Bíblia integrada e relatórios temáticos anuais

---

### Fase 6 — Conselho 🟡
**Status**: pendente

**Escopo**:
- Módulo novo `/conselho` (admin/leader-pastor)
- Schema:
  - `council_meetings`: data, pauta, resumo, ata_id (FK media)
  - `council_meeting_items`: pautas individuais, com status (pendente/discutida/decidida)
- Upload de atas em **DOC e PDF** — usa storage existente
- Busca por palavras-chave em pauta e resumo (ILIKE simples; full-text na ata via extração de texto pode ser fase posterior)
- Vinculação direta ata ↔ reunião

**Pergunta a resolver na plan mode**: extrair texto de DOC/PDF para indexar busca, ou só metadados?

---

### Fase 7 — Dashboard 🟢
**Status**: pendente — última fase

**Escopo**:
- Adicionar widgets/atalhos para:
  - Pequenos Grupos ativos
  - Eventos do próximo mês
  - Cursos em andamento (séries)
- Cada item do dashboard se torna **shortcut clicável** que leva direto à tela detalhada
- Layout responsivo (já implementado nas fases anteriores)

---

## Workflow de execução

Para cada fase, repetir o ciclo:

1. **Plan mode**: detalhar schema, arquivos, RBAC, telas, riscos
2. **Aprovar plan**
3. **Reset DB local** (se schema destrutivo): `docker compose down -v && docker compose up -d && pnpm db:push`
4. **Implementar**: backend → openapi → codegen → frontend → testes
5. **Validar local**: `pnpm dev`, criar dados, testar fluxos
6. **Commit + push** → Railway deploya
7. **Validar produção**
8. **Atualizar este arquivo** marcando a fase como ✅ concluída

---

## Status global

- [x] Fase 1 — Rol de Membros _(commits dfe1866, ac7f0c6, fc9cc82, c9dac3a)_
- [ ] Fase 2 — Visitantes
- [ ] Fase 3 — Mapa de Discipulado
- [ ] Fase 4 — Ensino e Pregação
- [ ] Fase 5 — Culto
- [ ] Fase 6 — Conselho
- [ ] Fase 7 — Dashboard
