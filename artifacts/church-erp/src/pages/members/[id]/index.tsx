import { useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAuth } from '@/hooks/use-auth-context';
import { useGetMember, useGetMemberHistory, useRevealMemberCpf, useDeleteMember, useMoveMemberPipeline, useGetMemberPipelineHistory } from '@workspace/api-client-react';
import { Redirect, useParams, Link, useLocation } from 'wouter';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Loader2, User, Edit, Trash2, Calendar, MapPin,
  Phone, Mail, Heart, Activity, Clock, ShieldCheck, Eye
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';

export default function MemberProfile() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const params = useParams();
  const id = params.id as string;

  const [activeTab, setActiveTab] = useState<'details' | 'history'>('details');
  const [revealedCpf, setRevealedCpf] = useState<string | null>(null);
  const [isRevealing, setIsRevealing] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showPipelineModal, setShowPipelineModal] = useState(false);
  const [newStage, setNewStage] = useState("");
  const [stageReason, setStageReason] = useState("");

  const { data: member, isLoading, isError } = useGetMember(id, {
    query: { enabled: !!id }
  });

  const { data: historyData, isLoading: historyLoading } = useGetMemberHistory(id, {
    query: { enabled: activeTab === 'history' && !!id }
  });

  const { mutateAsync: revealCpf } = useRevealMemberCpf();
  const { mutateAsync: deleteMember } = useDeleteMember();

  const { data: pipelineData } = useGetMemberPipelineHistory(id, { query: { enabled: !!id } });
  const movePipelineMut = useMoveMemberPipeline({
    mutation: {
      onSuccess: () => {
        toast({ title: "Sucesso", description: "Etapa atualizada." });
        setShowPipelineModal(false);
        setNewStage("");
        setStageReason("");
        // Refresh member data
        window.location.reload();
      },
      onError: (err: any) => {
        toast({ title: "Erro", description: err?.response?.data?.error || "Falha.", variant: "destructive" });
      },
    },
  });

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

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await deleteMember({ id });
      toast({ title: "Sucesso", description: "Membro excluído do sistema." });
      setLocation('/members');
    } catch (err) {
      toast({ title: "Erro", description: "Falha ao excluir registro.", variant: "destructive" });
      setIsDeleting(false);
      setDeleteDialogOpen(false);
    }
  };

  const getStatusStyle = (status: string) => {
    switch(status) {
      case 'ativo': return 'bg-green-100 text-green-700 border-green-200';
      case 'inativo': return 'bg-slate-100 text-slate-700 border-slate-200';
      case 'visitante': return 'bg-orange-100 text-orange-700 border-orange-200';
      case 'falecido': return 'bg-purple-100 text-purple-700 border-purple-200';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  if (isLoading) {
    return (
      <AppLayout breadcrumbs={[{ label: "Membros", href: "/members" }, { label: member?.fullName || "Membro" }]}>
        <div className="flex justify-center py-32"><Loader2 className="w-10 h-10 animate-spin text-primary" /></div>
      </AppLayout>
    );
  }

  if (isError || !member) {
    return (
      <AppLayout breadcrumbs={[{ label: "Membros", href: "/members" }, { label: member?.fullName || "Membro" }]}>
        <div className="bg-destructive/10 text-destructive p-6 rounded-xl border border-destructive/20 text-center">
          Membro não encontrado ou acesso negado.
        </div>
      </AppLayout>
    );
  }

  const canEdit = user?.role === 'admin' || user?.role === 'leader';
  const canDelete = user?.role === 'admin';

  return (
    <AppLayout breadcrumbs={[{ label: "Membros", href: "/members" }, { label: member?.fullName || "Membro" }]}>
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
                {member.status}
              </span>
            </div>
            <p className="text-muted-foreground flex items-center gap-2">
              <Calendar className="w-4 h-4" /> Cadastrado em {format(new Date(member.createdAt), "dd 'de' MMMM, yyyy", { locale: ptBR })}
            </p>
          </div>

          {canEdit && (
            <div className="flex items-center gap-3 w-full sm:w-auto mt-4 sm:mt-0">
              <Link href={`/members/${id}/edit`} className="flex-1 sm:flex-none flex items-center justify-center px-5 py-2.5 rounded-xl font-medium text-sm bg-secondary hover:bg-secondary/80 text-foreground transition-all">
                <Edit className="w-4 h-4 mr-2" /> Editar
              </Link>
              {canDelete && (
                <button 
                  onClick={() => setDeleteDialogOpen(true)}
                  className="p-2.5 rounded-xl text-destructive hover:bg-destructive/10 transition-colors border border-transparent hover:border-destructive/20"
                  title="Excluir membro"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              )}
            </div>
          )}
        </div>
      </div>

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
          onClick={() => setActiveTab('history')}
          className={cn("pb-4 text-sm font-semibold transition-colors relative", activeTab === 'history' ? "text-primary" : "text-muted-foreground hover:text-foreground")}
        >
          Histórico de Alterações
          {activeTab === 'history' && <span className="absolute bottom-0 left-0 w-full h-0.5 bg-primary rounded-t-full"></span>}
        </button>
      </div>

      {/* Content */}
      {activeTab === 'details' ? (
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
                  <p className="text-sm text-muted-foreground mb-1">Família</p>
                  <p className="font-medium text-foreground">{member.familyName || '-'}</p>
                </div>
              </div>
            </div>

            <div className="bg-card rounded-2xl border border-border shadow-sm p-6">
              <h3 className="text-lg font-display font-semibold flex items-center mb-6">
                <Heart className="w-5 h-5 mr-2 text-primary" /> Eclesiástico
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-6 gap-x-4">
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Data de Conversão</p>
                  <p className="font-medium text-foreground">
                    {member.conversionDate ? format(new Date(member.conversionDate), "dd/MM/yyyy") : '-'}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Data de Batismo</p>
                  <p className="font-medium text-foreground">
                    {member.baptismDate ? format(new Date(member.baptismDate), "dd/MM/yyyy") : '-'}
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
      ) : (
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

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir Membro</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja excluir <strong>{member.fullName}</strong> permanentemente? Esta ação não pode ser desfeita e registrará um evento crítico de auditoria.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-6">
            <button onClick={() => setDeleteDialogOpen(false)} className="px-4 py-2 bg-secondary text-foreground rounded-lg font-medium">Cancelar</button>
            <button onClick={handleDelete} disabled={isDeleting} className="px-4 py-2 bg-destructive text-destructive-foreground rounded-lg font-medium flex items-center">
              {isDeleting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />} Confirmar Exclusão
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Pipeline Section - below tabs content */}
      {canEdit && (
        <div className="mt-8 rounded-2xl border bg-card p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Activity className="h-5 w-5" /> Funil de Integração
            </h3>
            <button onClick={() => { setNewStage((member as any).pipelineStage || "culto"); setShowPipelineModal(true); }} className="px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90">
              Mover Etapa
            </button>
          </div>
          <div className="flex items-center gap-4 mb-4">
            {["culto", "pequeno_grupo", "ministerio"].map((stage, i) => {
              const labels: Record<string, string> = { culto: "Culto", pequeno_grupo: "Pequeno Grupo", ministerio: "Ministério" };
              const isCurrent = (member as any).pipelineStage === stage;
              const isPast = ["culto", "pequeno_grupo", "ministerio"].indexOf((member as any).pipelineStage) > i;
              return (
                <div key={stage} className="flex items-center gap-2">
                  {i > 0 && <div className={`w-8 h-0.5 ${isPast || isCurrent ? "bg-primary" : "bg-border"}`} />}
                  <div className={`px-3 py-1.5 rounded-full text-sm font-medium ${isCurrent ? "bg-primary text-primary-foreground" : isPast ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"}`}>
                    {labels[stage]}
                  </div>
                </div>
              );
            })}
          </div>
          {pipelineData?.history && pipelineData.history.length > 0 && (
            <div className="border-t pt-4 space-y-2">
              <p className="text-sm font-medium text-muted-foreground mb-2">Histórico</p>
              {(pipelineData.history as any[]).slice(0, 5).map((h: any) => {
                const labels: Record<string, string> = { culto: "Culto", pequeno_grupo: "Pequeno Grupo", ministerio: "Ministério" };
                return (
                  <div key={h.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{labels[h.fromStage] || h.fromStage || "—"}</span>
                    <span>→</span>
                    <span className="font-medium text-foreground">{labels[h.toStage] || h.toStage}</span>
                    {h.reason && <span className="text-muted-foreground">— {h.reason}</span>}
                    <span className="ml-auto">{h.createdAt ? new Date(h.createdAt).toLocaleDateString("pt-BR") : ""}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Move Pipeline Modal */}
      {showPipelineModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowPipelineModal(false)}>
          <div className="bg-card rounded-2xl border shadow-xl w-full max-w-sm mx-4" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b"><h2 className="text-lg font-bold">Mover Etapa</h2></div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-sm font-medium">Nova Etapa</label>
                <select value={newStage} onChange={e => setNewStage(e.target.value)} className="w-full mt-1 px-3 py-2 border rounded-lg bg-background text-sm">
                  <option value="culto">Culto</option>
                  <option value="pequeno_grupo">Pequeno Grupo</option>
                  <option value="ministerio">Ministério</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium">Motivo (opcional)</label>
                <input value={stageReason} onChange={e => setStageReason(e.target.value)} className="w-full mt-1 px-3 py-2 border rounded-lg bg-background text-sm" placeholder="Ex: Entrou no grupo de jovens" />
              </div>
            </div>
            <div className="p-6 border-t flex justify-end gap-3">
              <button onClick={() => setShowPipelineModal(false)} className="px-4 py-2 border rounded-lg text-sm">Cancelar</button>
              <button
                onClick={() => movePipelineMut.mutate({ id, data: { stage: newStage, reason: stageReason || undefined } as any })}
                disabled={movePipelineMut.isPending}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm flex items-center gap-2 disabled:opacity-50"
              >
                {movePipelineMut.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Mover
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
