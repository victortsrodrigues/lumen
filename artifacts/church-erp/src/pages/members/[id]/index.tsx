import { useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAuth } from '@/hooks/use-auth-context';
import { useGetMember, useGetMemberHistory, useRevealMemberCpf, useRevertMemberExclusion } from '@workspace/api-client-react';
import { ExclusionModal } from '../components/ExclusionModal';
import { TransferLetterModal } from '../components/TransferLetterModal';
import { MemberAreasTab } from '../components/MemberAreasTab';
import { Redirect, useParams, Link } from 'wouter';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Loader2, User, Edit, Trash2, Calendar, MapPin,
  Phone, Mail, Heart, Activity, Clock, ShieldCheck, Eye, AlertTriangle, FileText, Undo2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { CloudDocumentPreview, getDocumentHref } from '@/components/CloudDocumentPreview';

export default function MemberProfile() {
  const { user } = useAuth();
  const { toast } = useToast();
  const params = useParams();
  const id = params.id as string;

  const [activeTab, setActiveTab] = useState<'details' | 'history' | 'areas'>('details');
  const [revealedCpf, setRevealedCpf] = useState<string | null>(null);
  const [isRevealing, setIsRevealing] = useState(false);
  const [showExclusionModal, setShowExclusionModal] = useState(false);
  const [showTransferLetterModal, setShowTransferLetterModal] = useState(false);

  const revertExclusion = useRevertMemberExclusion();

  const { data: member, isLoading, isError } = useGetMember(id, {
    query: { enabled: !!id }
  });

  const { data: historyData, isLoading: historyLoading } = useGetMemberHistory(id, {
    query: { enabled: activeTab === 'history' && !!id }
  });

  const { mutateAsync: revealCpf } = useRevealMemberCpf();

  if (user?.role === 'member' && user.id !== id) {
    // Membros só podem ver o próprio perfil
    return <Redirect to={`/members/${user.id}`} />;
  }

  const handleRevealCpf = async () => {
    setIsRevealing(true);
    try {
      const res = await revealCpf({ id });
      setRevealedCpf(res.cpf);
      toast({ title: "Auditoria", description: "Visualização de documento registrada." });
    } catch (err) {
      toast({ title: "Erro", description: "Não foi possível revelar o documento.", variant: "destructive" });
    } finally {
      setIsRevealing(false);
    }
  };

  const getStatusStyle = (status: string) => {
    switch(status) {
      case 'ativo': return 'bg-green-100 text-green-700 border-green-200';
      case 'disciplina': return 'bg-amber-100 text-amber-700 border-amber-200';
      case 'rol_apartado': return 'bg-slate-100 text-slate-700 border-slate-200';
      case 'falecido': return 'bg-purple-100 text-purple-700 border-purple-200';
      case 'demitido': return 'bg-red-100 text-red-700 border-red-200';
      default: return 'bg-gray-100 text-gray-700';
    }
  };
  const getStatusLabel = (status: string) => status === 'rol_apartado' ? 'Rol Apartado' : status;
  const EXCLUSION_REASON_LABELS: Record<string, string> = {
    transferencia: "Transferência",
    falecimento: "Falecimento",
    exclusao_pedido: "Exclusão a Pedido",
    exclusao_disciplina: "Exclusão por Disciplina",
    exclusao_abandono: "Exclusão por Abandono",
    ordenacao_ministerio: "Ordenação ao Ministério",
    transferencia_responsaveis: "Transferência (responsáveis)",
    profissao_fe_migracao: "Profissão de Fé (migração)",
    exclusao_abandono_responsaveis: "Abandono dos Responsáveis",
  };

  if (isLoading) {
    return (
      <AppLayout breadcrumbs={[{ label: "Rol de Membros", href: "/members" }, { label: member?.fullName || "Membro" }]}>
        <div className="flex justify-center py-32"><Loader2 className="w-10 h-10 animate-spin text-primary" /></div>
      </AppLayout>
    );
  }

  if (isError || !member) {
    return (
      <AppLayout breadcrumbs={[{ label: "Rol de Membros", href: "/members" }, { label: member?.fullName || "Membro" }]}>
        <div className="bg-destructive/10 text-destructive p-6 rounded-xl border border-destructive/20 text-center">
          Membro não encontrado ou acesso negado.
        </div>
      </AppLayout>
    );
  }

  const canEdit = user?.role === 'admin' || user?.role === 'leader';
  const canDelete = user?.role === 'admin';
  const transferLetterPath = (member as any).exclusionLetterPath as string | null;

  return (
    <AppLayout breadcrumbs={[{ label: "Rol de Membros", href: "/members" }, { label: member?.fullName || "Membro" }]}>
      {/* Header Profile */}
      <div className="bg-card rounded-3xl border border-border shadow-sm p-6 sm:p-8 mb-8 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-32 bg-gradient-to-r from-primary/20 to-primary/5"></div>
        
        <div className="relative flex flex-col sm:flex-row items-start sm:items-center gap-6 mt-12">
          <div className="w-28 h-28 rounded-full bg-background border-4 border-card shadow-lg flex items-center justify-center text-primary font-bold overflow-hidden shrink-0">
            {member.photoPath ? (
              <img src={`/api/storage${member.photoPath}`} alt={member.fullName} className="w-full h-full object-cover" />
            ) : (
              <User className="w-12 h-12 opacity-40" />
            )}
          </div>
          
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-3 mb-1">
              <h1 className="text-3xl font-display font-bold text-foreground">{member.fullName}</h1>
              <span className={cn("px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider border", getStatusStyle(member.status))}>
                {getStatusLabel(member.status)}
              </span>
              <span className="px-3 py-1 rounded-full text-xs font-medium border bg-cyan-50 text-cyan-800 border-cyan-200">
                {(member as any).classification === 'comungante' ? 'Comungante' : 'Não Comungante'}
              </span>
            </div>
            <p className="text-muted-foreground flex items-center gap-2">
              <Calendar className="w-4 h-4" /> Cadastrado em {format(new Date(member.createdAt), "dd 'de' MMMM, yyyy", { locale: ptBR })}
            </p>
          </div>

          {canEdit && (
            <div className="flex items-center gap-3 w-full sm:w-auto mt-4 sm:mt-0 flex-wrap">
              <Link href={`/members/${id}/edit`} className="flex items-center justify-center px-5 py-2.5 rounded-xl font-medium text-sm bg-secondary hover:bg-secondary/80 text-foreground transition-all">
                <Edit className="w-4 h-4 mr-2" /> Editar
              </Link>
              {canDelete && member.status !== 'demitido' && (
                <button
                  onClick={() => setShowExclusionModal(true)}
                  className="flex items-center justify-center px-4 py-2.5 rounded-xl font-medium text-sm border border-destructive/40 text-destructive hover:bg-destructive/10 transition-all"
                  title="Excluir membro (configurar motivo)"
                >
                  <Trash2 className="w-4 h-4 mr-2" /> Excluir
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Exclusion banner (visible when demitido) */}
      {member.status === 'demitido' && (member as any).exclusionReason && (
        <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 rounded-2xl p-5 mb-6 flex items-start gap-4 flex-wrap">
          <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-red-900 dark:text-red-200">
              Membro excluído — {EXCLUSION_REASON_LABELS[(member as any).exclusionReason] || (member as any).exclusionReason}
            </p>
            {(member as any).exclusionDate && (
              <p className="text-sm text-red-700 dark:text-red-300 mt-1">
                Em {format(new Date((member as any).exclusionDate), "dd/MM/yyyy")}
              </p>
            )}
            {(member as any).exclusionNotes && (
              <p className="text-sm text-red-700 dark:text-red-300 mt-2 italic">"{(member as any).exclusionNotes}"</p>
            )}
            {transferLetterPath && (
              <div className="mt-4 space-y-3">
                <a
                  href={getDocumentHref(transferLetterPath)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sm text-red-700 dark:text-red-300 hover:underline"
                >
                  <FileText className="w-4 h-4" /> Abrir carta de transferência
                </a>
                <CloudDocumentPreview
                  url={transferLetterPath}
                  title={`Carta de transferência — ${member.fullName}`}
                />
              </div>
            )}
          </div>
          {canDelete && (
            <div className="flex flex-col gap-2 shrink-0">
              {(member as any).exclusionReason === 'transferencia' && !transferLetterPath && (
                <button
                  onClick={() => setShowTransferLetterModal(true)}
                  className="flex items-center gap-2 px-3 py-2 bg-primary text-primary-foreground rounded-xl text-sm hover:opacity-90"
                >
                  <FileText className="w-4 h-4" /> Vincular carta
                </button>
              )}
              <button
                onClick={() => revertExclusion.mutate({ id })}
                disabled={revertExclusion.isPending}
                className="flex items-center gap-2 px-3 py-2 border border-red-300 dark:border-red-700 text-red-700 dark:text-red-300 rounded-xl text-sm hover:bg-red-100 dark:hover:bg-red-950/30 disabled:opacity-50"
              >
                {revertExclusion.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Undo2 className="w-4 h-4" />}
                Reverter
              </button>
            </div>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-6 border-b border-border mb-8 px-2">
        <button 
          onClick={() => setActiveTab('details')}
          className={cn("pb-4 text-sm font-semibold transition-colors relative", activeTab === 'details' ? "text-primary" : "text-muted-foreground hover:text-foreground")}
        >
          Visão Geral
          {activeTab === 'details' && <span className="absolute bottom-0 left-0 w-full h-0.5 bg-primary rounded-t-full"></span>}
        </button>
        <button
          onClick={() => setActiveTab('areas')}
          className={cn("pb-4 text-sm font-semibold transition-colors relative", activeTab === 'areas' ? "text-primary" : "text-muted-foreground hover:text-foreground")}
        >
          Áreas
          {activeTab === 'areas' && <span className="absolute bottom-0 left-0 w-full h-0.5 bg-primary rounded-t-full"></span>}
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={cn("pb-4 text-sm font-semibold transition-colors relative", activeTab === 'history' ? "text-primary" : "text-muted-foreground hover:text-foreground")}
        >
          Histórico de Alterações
          {activeTab === 'history' && <span className="absolute bottom-0 left-0 w-full h-0.5 bg-primary rounded-t-full"></span>}
        </button>
      </div>

      {/* Content */}
      {activeTab === 'areas' && (
        canEdit ? (
          <MemberAreasTab memberId={id} memberName={member.fullName} />
        ) : (
          <div className="bg-card rounded-2xl border border-border shadow-sm p-6 text-center text-muted-foreground">
            Sem permissão para editar áreas deste membro.
          </div>
        )
      )}
      {activeTab === 'details' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Col - Data */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-card rounded-2xl border border-border shadow-sm p-6">
              <h3 className="text-lg font-display font-semibold flex items-center mb-6">
                <User className="w-5 h-5 mr-2 text-primary" /> Informações Pessoais
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-6 gap-x-4">
                <div>
                  <p className="text-sm text-muted-foreground mb-1">CPF</p>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-foreground font-mono">
                      {revealedCpf || member.cpfMasked || 'Não informado'}
                    </span>
                    {!revealedCpf && member.cpfMasked && user?.role === 'admin' && (
                      <button onClick={handleRevealCpf} disabled={isRevealing} className="p-1 text-primary hover:bg-primary/10 rounded-md transition-colors">
                        {isRevealing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
                      </button>
                    )}
                  </div>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Data de Nascimento</p>
                  <p className="font-medium text-foreground">
                    {member.dateOfBirth ? format(new Date(member.dateOfBirth), "dd/MM/yyyy") : '-'}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Sexo</p>
                  <p className="font-medium text-foreground capitalize">{member.sex || '-'}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Classificação</p>
                  <p className="font-medium text-foreground">
                    {(member as any).classification === 'comungante' ? 'Comungante'
                      : (member as any).classification === 'nao_comungante' ? 'Não Comungante'
                      : '-'}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-card rounded-2xl border border-border shadow-sm p-6">
              <h3 className="text-lg font-display font-semibold flex items-center mb-6">
                <Heart className="w-5 h-5 mr-2 text-primary" /> Eclesiástico
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-6 gap-x-4">
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Ano de Conversão</p>
                  <p className="font-medium text-foreground">
                    {(member as any).conversionYear || '-'}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Data de Recepção</p>
                  <p className="font-medium text-foreground">
                    {(member as any).receptionDate ? format(new Date((member as any).receptionDate), "dd/MM/yyyy") : '-'}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Right Col - Contact & Address */}
          <div className="space-y-6">
            <div className="bg-card rounded-2xl border border-border shadow-sm p-6">
              <h3 className="text-lg font-display font-semibold flex items-center mb-6">
                <Phone className="w-5 h-5 mr-2 text-primary" /> Contato
              </h3>
              <div className="space-y-4">
                <div className="flex items-start">
                  <Phone className="w-4 h-4 mr-3 mt-1 text-muted-foreground shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground">Telefone Principal</p>
                    <p className="font-medium text-foreground">{member.phone || 'Não informado'}</p>
                  </div>
                </div>
                <div className="flex items-start">
                  <Mail className="w-4 h-4 mr-3 mt-1 text-muted-foreground shrink-0" />
                  <div className="break-all">
                    <p className="text-xs text-muted-foreground">E-mail</p>
                    <p className="font-medium text-foreground">{member.email || 'Não informado'}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-card rounded-2xl border border-border shadow-sm p-6">
              <h3 className="text-lg font-display font-semibold flex items-center mb-6">
                <MapPin className="w-5 h-5 mr-2 text-primary" /> Endereço
              </h3>
              {(member.addressStreet || member.addressCity) ? (
                <div className="text-sm space-y-1">
                  <p className="font-medium text-foreground text-base mb-2">
                    {member.addressStreet} {member.addressNumber ? `, ${member.addressNumber}` : ''}
                  </p>
                  {member.addressComplement && <p className="text-muted-foreground">{member.addressComplement}</p>}
                  <p className="text-muted-foreground">{member.addressNeighborhood}</p>
                  <p className="text-muted-foreground">{member.addressCity} - {member.addressState}</p>
                  <p className="text-muted-foreground pt-2">CEP: <span className="font-mono">{member.addressZip}</span></p>
                </div>
              ) : (
                <p className="text-muted-foreground text-sm">Endereço não cadastrado.</p>
              )}
            </div>
            
            <div className="bg-primary/5 rounded-xl p-4 border border-primary/10 flex items-center gap-3">
              <ShieldCheck className="w-8 h-8 text-primary shrink-0" />
              <p className="text-xs text-muted-foreground leading-tight">
                Dados protegidos por criptografia de ponta a ponta em conformidade com a LGPD.
              </p>
            </div>
          </div>
        </div>
      )}
      {activeTab === 'history' && (
        <div className="bg-card rounded-2xl border border-border shadow-sm p-6 sm:p-8">
          <h3 className="text-xl font-display font-bold mb-8">Trilha de Auditoria do Membro</h3>
          
          {historyLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
          ) : historyData?.history.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">Nenhum histórico encontrado para este membro.</p>
          ) : (
            <div className="relative border-l-2 border-secondary ml-4 md:ml-6 space-y-8 pb-4">
              {historyData?.history.map((entry, idx) => (
                <div key={entry.id} className="relative pl-8">
                  <div className="absolute -left-[9px] top-1 w-4 h-4 rounded-full bg-background border-2 border-primary"></div>
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-foreground capitalize">
                      {entry.changeType === 'created' ? 'Cadastro Original' : entry.changeType === 'updated' ? 'Atualização de Dados' : 'Ação de Sistema'}
                    </span>
                    <span className="text-xs text-muted-foreground flex items-center">
                      <Clock className="w-3 h-3 mr-1" />
                      {format(new Date(entry.createdAt), "dd MMM yyyy 'às' HH:mm", { locale: ptBR })}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground mb-3">
                    Modificado por: <span className="font-medium text-foreground">{entry.changedByUserId}</span>
                  </p>
                  
                  {entry.fieldChanges && Object.keys(entry.fieldChanges).length > 0 && (
                    <div className="bg-secondary/30 rounded-xl p-4 text-xs font-mono text-muted-foreground overflow-x-auto border border-border/50">
                      <pre>{JSON.stringify(entry.fieldChanges, null, 2)}</pre>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {showExclusionModal && (
        <ExclusionModal
          memberId={id}
          memberName={member.fullName}
          classification={((member as any).classification || 'comungante') as 'comungante' | 'nao_comungante'}
          onClose={() => setShowExclusionModal(false)}
          onTransferSuccess={() => {
            setShowExclusionModal(false);
            setShowTransferLetterModal(true);
          }}
        />
      )}

      {showTransferLetterModal && (
        <TransferLetterModal
          memberId={id}
          memberName={member.fullName}
          receptionMode={(member as any).receptionMode || null}
          receptionDate={(member as any).receptionDate || null}
          classification={(member as any).classification || 'comungante'}
          onClose={() => setShowTransferLetterModal(false)}
        />
      )}
    </AppLayout>
  );
}
