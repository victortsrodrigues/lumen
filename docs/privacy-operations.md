# Privacidade — procedimento mínimo da Lumen

Revisado em 06/09/2026. Documento interno: não é uma certificação de conformidade nem garantia contra responsabilidade. Não adiciona assinatura paga, MFA, plataforma jurídica ou SLA comercial.

## Textos e contato

- Igreja responsável: Igreja Presbiteriana Lumen. Contato informado pelo administrador: Felipe Roth Couri, (32) 98454-9686. CNPJ ainda não informado; não foi inventado nem publicado um número provisório.
- Textos públicos: `/privacidade` e `/termos`, em `artifacts/church-erp/src/pages/public/legal.tsx`. A versão está em `LegalDocumentsVersion`, no OpenAPI.
- Cadastro: aceite dos termos e ciência da política, com caixa inicialmente desmarcada, data, IP e versão registrados no banco existente. Isso não é consentimento para qualquer tratamento de dados sensíveis.
- As contas anteriores não recebem aceite retroativo. Preserve o texto de cada versão no Git; em alterações posteriores à publicação, avance a versão no contrato e informe mudanças relevantes aos usuários. Não altere silenciosamente o significado de uma versão já aceita.

## Antes da liberação geral

1. Confirmar com a igreja que Felipe acompanha esse telefone e encaminha os pedidos. Sua indicação como contato não é, por si só, uma nomeação formal de encarregado. Verificar a obrigação de nomeação ou o enquadramento em eventual dispensa; cem usuários não comprovam dispensa.
2. Definir e documentar a hipótese legal de cada atividade, especialmente rol religioso, aconselhamento e dados de menores. Religião é dado sensível: legítimo interesse e aceite genérico do cadastro não bastam. Se a hipótese escolhida for consentimento, obter prova específica do titular ou responsável, para finalidades determinadas, antes do uso. A declaração do administrador ao importar uma planilha não é essa prova. Não assumir que antigos cadastros estão regularizados pela publicação destes textos.
3. Conferir contratos, locais de processamento e mecanismo legal de eventual transferência internacional com Railway, Resend e Cloudflare. A lista de prestadores na política não substitui essa verificação. Conferir também a configuração dos conteúdos incorporados e recursos de terceiros; os cookies próprios de sessão não justificam automaticamente rastreamento de terceiros.
4. Confirmar os critérios de retenção por finalidade. O sistema não elimina automaticamente todo cadastro antigo. As regras de 56/400 dias são a configuração dos backups, não um prazo imposto pela LGPD nem justificativa para conservar qualquer dado. Revisar a necessidade dos registros e conservar somente o que tenha fundamento documentado. Apoio jurídico pontual é recomendável para estas decisões, sobretudo sobre dados sensíveis.

Base: [LGPD, especialmente arts. 7–11, 14–19, 33 e 41](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709compilado.htm) e [orientações da ANPD para titulares e agentes](https://www.gov.br/anpd/pt-br/acesso-a-informacao/perguntas-frequentes/perguntas-frequentes).

## Quando chegar um pedido de dados

1. Registrar recebimento, pedido, quem vai tratar e conclusão, em local restrito. Confirmar a identidade proporcionalmente, sem pedir senha nem acumular cópias de documentos desnecessárias. Aceitar pedidos também de quem não tem conta.
2. Consultar os dados envolvidos; usar Meu Perfil e Meus Dados quando aplicáveis. Esses recursos não abrangem automaticamente todos os documentos externos, dados de terceiros ou conteúdo publicado. Pedidos de confirmação/acesso têm as modalidades de resposta do art. 19; não confundir seu prazo de até 15 dias para declaração completa com um prazo universal para todos os direitos. Observar os prazos legais aplicáveis e informar o andamento.
3. Para correção ou exclusão, verificar também campos livres, documentos externos e destinatários com quem os dados foram compartilhados, quando aplicável. A exclusão de conta remove ou desassocia vários registros, mas não garante anonimização irreversível de todo conteúdo. Não declarar atendimento integral sem conferir o pedido concreto. Explicar eventual conservação, com fundamento e duração, ou a impossibilidade justificada de atendimento.
4. Backups não são apagados seletivamente pela exclusão de conta. Seguir a retenção do [procedimento de backup](../ops/postgres-backup/RUNBOOK.md) e, antes de disponibilizar uma restauração, conferir e reaplicar exclusões e correções posteriores à cópia. Esse controle de pedidos e reaplicação é operacional, não uma automação já existente.

## Se houver incidente

1. Quem identificar a suspeita avisa Felipe. Ele aciona o administrador técnico e a representação da igreja. Registrar quando houve ciência, preservar evidências com acesso restrito e conter a falha — por exemplo, revogar sessões ou credenciais comprometidas. Não divulgar tokens, senhas ou cópias do banco.
2. Identificar dados, pessoas, consequências e medidas tomadas. Avaliar risco ou dano relevante; religião, saúde, credenciais e dados de menores exigem atenção especial. A decisão e os motivos devem ser documentados mesmo quando não houver comunicação.
3. Quando exigível, a igreja comunica à ANPD e aos titulares. A regra geral é até três dias úteis da ciência do incidente, ressalvadas regras legais específicas. Não aguardar o fim de toda a investigação: pode caber comunicação preliminar e posterior complemento. Não presumir prazo diferenciado para pequeno porte sem verificar enquadramento.
4. Documentar correção e resultado. Manter o registro do incidente, inclusive dos não comunicados, por pelo menos cinco anos, com acesso restrito, conforme o regulamento.

Referências: [canal e procedimento oficial de comunicação de incidentes](https://www.gov.br/anpd/pt-br/canais_atendimento/agente-de-tratamento/comunicado-de-incidente-de-seguranca-cis) e [regulamento de comunicação de incidentes da ANPD](https://www.gov.br/anpd/pt-br/assuntos/noticias/anpd-aprova-o-regulamento-de-comunicacao-de-incidente-de-seguranca).
