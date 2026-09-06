import type { ReactNode } from "react";
import { Link } from "wouter";
import { LegalDocumentsVersion } from "@workspace/api-client-react";
import { PublicLayout } from "@/components/layout/PublicLayout";

// The API contract is the source of truth for the version sent at registration.
export const LEGAL_DOCUMENTS_VERSION = Object.values(LegalDocumentsVersion)[0];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-xl font-semibold text-foreground">{title}</h2>
      {children}
    </section>
  );
}

function Contact() {
  return (
    <p>
      A responsável pelo Lumen e pelas decisões sobre os dados é a <strong>Igreja Presbiteriana Lumen</strong>.
      Para dúvidas, pedidos sobre dados pessoais ou relatos de problemas de segurança, fale com
      {" "}<strong>Felipe Roth Couri</strong> pelo telefone{" "}
      <a href="tel:+5532984549686" className="underline underline-offset-4">(32) 98454-9686</a>.
      Não é necessário ter uma conta para fazer contato.
    </p>
  );
}

function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <PublicLayout>
      <article className="mx-auto max-w-3xl space-y-7 leading-relaxed text-foreground/90">
        <header>
          <h1 className="text-3xl font-bold text-foreground">{title}</h1>
          <p className="mt-2 text-sm text-muted-foreground">Versão {LEGAL_DOCUMENTS_VERSION} · Atualizado em 6 de setembro de 2026</p>
        </header>
        {children}
      </article>
    </PublicLayout>
  );
}

export function PrivacyPolicy() {
  return (
    <LegalPage title="Política de Privacidade">
      <Section title="1. Quem cuida dos dados">
        <Contact />
        <p>Este aviso explica o uso de dados no site e no sistema de gestão da igreja.</p>
      </Section>

      <Section title="2. Quais dados usamos e para quê">
        <p>Os dados vêm do próprio usuário, dos responsáveis legais ou de registros inseridos pela equipe da igreja, conforme a atividade:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li><strong>Conta:</strong> nome, e-mail, senha protegida e registros de acesso, para analisar o cadastro, autenticar o usuário, proteger o sistema e enviar mensagens de confirmação e recuperação.</li>
          <li><strong>Cadastro de membros e visitantes:</strong> identificação, CPF, nascimento, contato, endereço, informações familiares e vínculo religioso, quando registrados, para manter o rol e organizar o atendimento e a participação na igreja.</li>
          <li><strong>Atividades:</strong> inscrições, presenças, ministérios, mensagens e registros pastorais ou de aconselhamento, para organizar e acompanhar essas atividades.</li>
          <li><strong>Administração:</strong> contribuições, documentos e registros financeiros, para controle administrativo e contábil.</li>
        </ul>
        <p>Dados de religião e, se registrados, de saúde são sensíveis. Seu uso exige uma base legal própria, como consentimento específico ou outra hipótese aplicável da LGPD. O aceite dos termos e a leitura deste aviso não autorizam qualquer uso desses dados. Dados de crianças e adolescentes exigem proteção de seu melhor interesse e participação do responsável legal quando exigida.</p>
      </Section>

      <Section title="3. Acesso e prestadores">
        <p>O acesso interno depende das permissões da conta. Informações colocadas em áreas públicas, como artigos e páginas institucionais, podem ser vistas por visitantes.</p>
        <p>Usamos Railway para hospedagem e banco de dados, Resend para e-mails e Cloudflare para conexão, segurança e armazenamento de backups. Esses serviços podem envolver processamento fora do Brasil. O uso de fornecedores não retira as responsabilidades da igreja previstas na lei.</p>
        <p>O sistema usa cookies de autenticação e segurança. Fontes do Google e conteúdos externos, como vídeos e documentos do YouTube, Vimeo ou Google Drive, podem receber dados de conexão ao serem carregados e seguir políticas próprias. A consulta de endereço envia o CEP ao ViaCEP.</p>
      </Section>

      <Section title="4. Por quanto tempo">
        <p>Os dados são mantidos enquanto necessários às finalidades informadas. Encerrada a necessidade, devem ser excluídos ou anonimizados, ressalvadas as hipóteses de conservação permitidas pela lei. Não há um prazo único para todos os cadastros e documentos; a necessidade de conservação de cada registro pode ser consultada pelo contato acima.</p>
        <p>Excluir a conta não apaga imediatamente todas as cópias e documentos. Os backups semanais têm retenção configurada de 56 dias e os mensais de 400 dias. Documentos guardados por URL em outra nuvem e conteúdo já publicado exigem análise também nesses locais.</p>
      </Section>

      <Section title="5. Seus direitos e como pedir">
        <p>Você pode pedir confirmação e acesso aos dados, correção, informação sobre compartilhamento, anonimização, bloqueio ou exclusão de dados desnecessários ou irregulares e, quando aplicável, portabilidade, exclusão de dados tratados com consentimento e revogação desse consentimento. Também pode perguntar sobre a possibilidade e as consequências de não consentir, e apresentar reclamação à ANPD.</p>
        <p>Faça o pedido gratuitamente pelo telefone acima. Podemos confirmar sua identidade para proteger seus dados. Quem tem conta pode usar Meu Perfil para excluir a conta e, se tiver cadastro de membro vinculado, Meus Dados para consultar informações e enviar pedidos. O contato continua disponível mesmo sem acesso ao sistema.</p>
      </Section>

      <Section title="6. Segurança e alterações">
        <p>Se suspeitar de acesso indevido ou exposição de dados, avise o contato acima sem enviar senhas. Incidentes serão avaliados e comunicados à ANPD e às pessoas afetadas nos casos e prazos exigidos pela legislação.</p>
        <p>Este aviso pode ser atualizado para refletir mudanças no serviço ou na lei. Alterações relevantes no tratamento serão informadas; publicar uma nova versão não substitui um consentimento específico quando ele for necessário.</p>
      </Section>
    </LegalPage>
  );
}

export function TermsOfUse() {
  return (
    <LegalPage title="Termos de Uso">
      <Section title="1. O serviço">
        <p>O Lumen é o sistema da Igreja Presbiteriana Lumen para comunicação e gestão das atividades da igreja. O acesso às áreas restritas depende de confirmação de e-mail, aprovação e permissões atribuídas à conta.</p>
      </Section>
      <Section title="2. Uso da conta">
        <p>Use informações corretas, mantenha sua senha em sigilo e não compartilhe a conta. Não acesse dados sem permissão, não exponha informações privadas de outras pessoas nem publique conteúdo ilícito ou que viole direitos de terceiros. Ao cadastrar dados de outra pessoa, é necessário ter legitimidade para isso.</p>
        <p>A administração pode restringir acessos para proteger o sistema ou tratar uso indevido. Pedidos de esclarecimento podem ser feitos pelo contato abaixo.</p>
      </Section>
      <Section title="3. Funcionamento e privacidade">
        <p>O serviço pode sofrer interrupções para manutenção ou por falhas técnicas. Links e documentos externos dependem também dos respectivos serviços de origem.</p>
        <p>O uso de dados é explicado na <Link href="/privacidade" className="underline underline-offset-4">Política de Privacidade</Link>. Aceitar estes termos não significa renunciar a direitos nem isentar a igreja das responsabilidades previstas na legislação brasileira.</p>
      </Section>
      <Section title="4. Contato">
        <Contact />
      </Section>
    </LegalPage>
  );
}
