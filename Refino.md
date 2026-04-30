# Refino — Church Manager Core (LUMEN)

Lista de refinamentos solicitados para alinhar o sistema à estrutura da Igreja Presbiteriana do Brasil (IPB).

---

## 1. Dashboard

a) Criar abas específicas para:
- Pequenos Grupos
- Eventos do próximo mês
- Cursos em andamento

b) Avaliar a possibilidade de transformar cada item do dashboard em um atalho de acesso rápido.

---

## 2. Membros (renomear para "Rol de Membros")

Na seção de admissão de membros, implementar as seguintes melhorias:

### a) Aba "Status"
- Padronizar os termos para: "ativo", "disciplina", "rol apartado" e "falecido".
- Remover a opção de cadastro de visitantes (sugere-se criar uma aba específica para visitantes).

### b) Aba "Classificação"
- Manter apenas duas categorias: "comungante" e "não comungante".

### c) Aba "Modo de Recepção"
*(Substituir o termo "tipo de arrolamento")*

As opções devem variar conforme a classificação:

**Membros Comungantes:**
- Profissão de Fé (para batizados na infância)
- Profissão de Fé e Batismo (para novos convertidos)
- Carta de Transferência (oriundos de outra IPB ou denominação evangélica)
- Jurisdição a Pedido (oriundos de outra igreja evangélica sem carta)
- Jurisdição *ex officio* (membro de outra IPB residente no local há mais de um ano)
- Restauração (retorno após disciplina ou solicitação prévia de saída)

**Membros Não Comungantes:**
- Batismo Infantil (filhos de membros comungantes)
- Transferência (menores que acompanham os pais transferidos)
- Arrolamento (menores dependentes sob cuidado do Conselho)

### d) Novos campos e ajustes
- Incluir "Procedência religiosa" (denominação ou religião de origem).
- Informar se houve batismo na infância, especificando igreja local e nome do pastor (especialmente em caso de IPB).
- Para membros não comungantes, incluir os nomes dos pais ou responsáveis.
- Alterar "data de batismo" para "data de recepção".
- Adicionar o campo "ano de conversão".

### e) Relacionamentos e vínculos
- Na aba "Agrupamento", permitir vincular membros já cadastrados (modelo de etiquetas).
- Possibilitar a vinculação do membro ao grupo ao qual pertence e aos ministérios em que atua.

### f) Dados pessoais (expandir)
Incluir:
- Estado civil (com possibilidade de vincular outro membro já cadastrado)
- Filhos (com a mesma possibilidade de vínculo)
- Formação acadêmica
- Profissão

### g) Exclusão de membro
Adicionar a funcionalidade "Exclusão de Membro" (preferencialmente integrada à aba "Status", como opção "demitido"), com as seguintes categorias:

**Membros Comungantes:**
- Transferência: saída para outra igreja (com possibilidade de emissão automática de carta)
- Falecimento: baixa por óbito
- Exclusão a Pedido: saída formal sem processo disciplinar (com registro de motivo)
- Exclusão por Disciplina: decorrente de processo eclesiástico (com registro do caso)
- Exclusão por Abandono/Ausência: após tentativas de contato (com registro do histórico)
- Ordenação ao Ministério: transferência para jurisdição do Presbitério

**Membros Não Comungantes:**
- Transferência: quando acompanham pais ou responsáveis
- Falecimento: baixa por óbito
- Profissão de Fé: migração para o rol de comungantes
- Exclusão por Abandono: conforme afastamento dos responsáveis

---

## 3. Mapa de Discipulado (funil de integração)

a) Renomear "etapas" para "áreas" e permitir classificação por cores vinculadas a indicadores de "saúde da membresia" (com possibilidade de uso em relatórios futuros):
- Verde: ativo
- Amarelo: irregular
- Vermelho: ausente

Aplicável às áreas:
- Culto
- Pequeno Grupo
- Ministério
- EBD (incluir)

b) Permitir a vinculação de referências no discipulado, como líderes de ministérios, líderes de pequenos grupos, entre outros.

---

## 4. Culto (substituir a aba "Liturgia")

Criar uma aba principal denominada "Culto", com as seguintes funcionalidades:

a) Possibilitar o registro de cada culto como um evento na agenda anual.

b) Armazenar esses eventos para geração de relatórios anuais com dados indexados.

c) Em cada culto, permitir:
- Visualizar e definir a escala de cada ministério (previamente cadastrado com seus respectivos membros).

d) Na seção de músicas:
- Permitir a vinculação de músicas previamente cadastradas.

e) Estrutura interna do culto:
- Criar uma aba para montagem completa da liturgia, incluindo:
  - Texto de abertura
  - Pregação
  - Músicas
  - Indicação de elementos como Ceia, batismo, recepção de membros, etc.

f) Textos bíblicos:
- Avaliar a inclusão de uma "Bíblia" integrada para seleção de textos.
- Objetivo: indexar referências utilizadas (abertura, dízimos/ofertas e pregação) e gerar relatórios temáticos ao final do ano.

---

## 5. Ministérios

Manter a estrutura atual — está completa e atende plenamente às necessidades.

---

## 6. Ensino (renomear para "Ensino e Pregação")

a) Substituir o termo "adicionar curso" por "adicionar série".

b) Na categorização, incluir:
- Pregação
- Escola Bíblica
- Pequeno Grupo
- Cursos livres (casais, jovens, etc.)

---

## 7. Conselho

Criar uma aba específica denominada "Conselho", com as seguintes funcionalidades:
- Upload de atas em formatos DOC e PDF.
- Campo de busca para pesquisa por palavras-chave e assuntos.
- Registro de reuniões (agenda).
- Inserção de pautas a serem tratadas.
- Espaço para resumo das reuniões realizadas.
- Vinculação direta da ata correspondente a cada reunião registrada.
