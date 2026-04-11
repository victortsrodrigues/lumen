import { useState, useEffect } from 'react';
import { useListMembers, useRevealMemberCpf, useGetPipelineSummary, ListMembersStatus } from '@workspace/api-client-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAuth } from '@/hooks/use-auth-context';
import { Link, Redirect } from 'wouter';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { 
  Users, Search, Plus, Upload, Filter, 
  ChevronLeft, ChevronRight, Eye, User as UserIcon, Loader2
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

const PIPELINE_STAGES = [
  { key: "culto", label: "Culto", color: "bg-blue-200" },
  { key: "pequeno_grupo", label: "Pequeno Grupo", color: "bg-green-200" },
  { key: "ministerio", label: "Ministério", color: "bg-amber-200" },
];

function PipelineFunnel() {
  const { data } = useGetPipelineSummary();
  if (!data?.summary) return null;
  const maxVal = Math.max(1, ...Object.values(data.summary as Record<string, number>));
  return (
    <div className="mb-6 p-4 rounded-xl border bg-card">
      <h3 className="text-sm font-semibold text-muted-foreground mb-3">Funil de Integração</h3>
      <div className="space-y-1.5">
        {PIPELINE_STAGES.map(s => {
          const val = (data.summary as Record<string, number>)[s.key] || 0;
          const pct = Math.max(5, (val / maxVal) * 100);
          return (
            <div key={s.key} className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground w-24 text-right">{s.label}</span>
              <div className="flex-1 h-5 bg-muted rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${s.color} transition-all`} style={{ width: `${pct}%` }} />
              </div>
              <span className="text-xs font-medium w-8">{val}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function MembersList() {
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [page, setPage] = useState(1);
  const limit = 20;
  
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<ListMembersStatus | undefined>(undefined);
  
  const [cpfRevealDialog, setCpfRevealDialog] = useState<{ isOpen: boolean; memberId: string | null; memberName: string; revealedCpf: string | null; isLoading: boolean }>({
    isOpen: false,
    memberId: null,
    memberName: '',
    revealedCpf: null,
    isLoading: false,
  });

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchQuery(searchInput);
      setPage(1); // Reset page on new search
    }, 500);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const { data, isLoading, isError } = useListMembers({
    page,
    limit,
    search: searchQuery || undefined,
    status: statusFilter,
  }, {
    query: {
      enabled: user?.role === 'admin' || user?.role === 'leader',
      retry: 1
    }
  });

  const { mutateAsync: revealCpf } = useRevealMemberCpf();

  if (user?.role === 'member') {
    return <Redirect to={`/members/${user.id}`} />;
  }

  const handleRevealCpf = async () => {
    if (!cpfRevealDialog.memberId) return;
    
    setCpfRevealDialog(prev => ({ ...prev, isLoading: true }));
    try {
      const response = await revealCpf({ id: cpfRevealDialog.memberId });
      setCpfRevealDialog(prev => ({ ...prev, revealedCpf: response.cpf, isLoading: false }));
      toast({
        title: "CPF Revelado",
        description: "Ação registrada no log de auditoria.",
      });
    } catch (error) {
      setCpfRevealDialog(prev => ({ ...prev, isLoading: false }));
      toast({
        title: "Erro ao revelar CPF",
        description: "Você não tem permissão ou ocorreu um erro.",
        variant: "destructive"
      });
    }
  };

  const getStatusStyle = (status: string) => {
    switch(status) {
      case 'ativo': return 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-300 border-green-200 dark:border-green-500/30';
      case 'inativo': return 'bg-slate-100 text-slate-700 dark:bg-slate-500/20 dark:text-slate-300 border-slate-200 dark:border-slate-500/30';
      case 'visitante': return 'bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-300 border-orange-200 dark:border-orange-500/30';
      case 'falecido': return 'bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-300 border-purple-200 dark:border-purple-500/30';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  const members = data?.members || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / limit);

  return (
    <AppLayout breadcrumbs={[{ label: "Membros" }]}>
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
        <div>
          <h2 className="text-2xl font-display font-bold text-foreground flex items-center">
            <Users className="w-6 h-6 mr-3 text-primary" />
            Membros da Igreja
          </h2>
          <p className="text-muted-foreground mt-1">Gerencie os dados, contatos e histórico da comunidade.</p>
        </div>
        
        <div className="flex items-center gap-3 w-full md:w-auto">
          {(user?.role === 'admin' || user?.role === 'leader') && (
            <>
              <Link href="/members/import" className="flex items-center px-4 py-2.5 rounded-xl font-medium text-sm border border-border bg-card hover:bg-secondary text-foreground transition-all">
                <Upload className="w-4 h-4 mr-2" />
                Importar CSV
              </Link>
              <Link href="/members/new" className="flex items-center px-4 py-2.5 rounded-xl font-medium text-sm bg-primary text-primary-foreground hover:bg-primary/90 shadow-md shadow-primary/20 transition-all">
                <Plus className="w-4 h-4 mr-2" />
                Novo Membro
              </Link>
            </>
          )}
        </div>
      </div>

      <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden flex flex-col mb-8">
        {/* Filters Bar */}
        <div className="p-4 border-b border-border bg-secondary/10 flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input 
              type="text" 
              placeholder="Buscar por nome ou CPF..." 
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="pl-9 pr-4 py-2.5 rounded-xl bg-background border border-border text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 w-full transition-all"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-muted-foreground" />
            <select
              value={statusFilter || ''}
              onChange={(e) => {
                setStatusFilter(e.target.value ? e.target.value as ListMembersStatus : undefined);
                setPage(1);
              }}
              className="px-4 py-2.5 rounded-xl bg-background border border-border text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 w-full sm:w-48 appearance-none transition-all"
            >
              <option value="">Todos os Status</option>
              <option value="visitante">Visitante</option>
              <option value="ativo">Ativo</option>
              <option value="inativo">Inativo</option>
              <option value="falecido">Falecido</option>
            </select>
          </div>
        </div>

        {/* Pipeline Funnel */}
        <PipelineFunnel />

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-secondary/50 border-b border-border text-muted-foreground font-medium uppercase tracking-wider text-xs">
              <tr>
                <th className="px-6 py-4">Membro</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">CPF</th>
                <th className="px-6 py-4">Contato</th>
                <th className="px-6 py-4">Família</th>
                <th className="px-6 py-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-16 text-center">
                    <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-3" />
                    <span className="text-muted-foreground font-medium">Buscando membros...</span>
                  </td>
                </tr>
              ) : isError ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-destructive">
                    <span className="font-medium">Erro ao carregar lista de membros.</span>
                  </td>
                </tr>
              ) : members.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-16 text-center">
                    <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center mx-auto mb-4">
                      <Users className="w-8 h-8 text-muted-foreground" />
                    </div>
                    <h3 className="text-lg font-medium text-foreground mb-1">Nenhum membro encontrado</h3>
                    <p className="text-muted-foreground">Tente alterar os filtros ou adicione um novo membro.</p>
                  </td>
                </tr>
              ) : (
                members.map((member) => (
                  <tr key={member.id} className="hover:bg-secondary/30 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex items-center">
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold overflow-hidden border border-primary/20 shrink-0">
                          {member.photoPath ? (
                            <img src={`/api/storage${member.photoPath}`} alt={member.fullName} className="w-full h-full object-cover" />
                          ) : (
                            <UserIcon className="w-5 h-5 opacity-50" />
                          )}
                        </div>
                        <div className="ml-4">
                          <div className="font-semibold text-foreground">{member.fullName}</div>
                          <div className="text-xs text-muted-foreground mt-0.5">Cadastrado em {format(new Date(member.createdAt), "MMM yyyy", { locale: ptBR })}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={cn("inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold capitalize border", getStatusStyle(member.status))}>
                        {member.status}
                      </span>
                      {(member as any).pipelineStage && (
                        <span className={cn("ml-1.5 inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium", {
                          "bg-blue-100 text-blue-700": (member as any).pipelineStage === "culto",
                          "bg-green-100 text-green-700": (member as any).pipelineStage === "pequeno_grupo",
                          "bg-amber-100 text-amber-700": (member as any).pipelineStage === "ministerio",
                        })}>
                          {(member as any).pipelineStage === "culto" ? "Culto" : (member as any).pipelineStage === "pequeno_grupo" ? "Pequeno Grupo" : "Ministério"}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center font-mono text-sm">
                        <span className="text-muted-foreground">{member.cpfMasked || 'Não informado'}</span>
                        {member.cpfMasked && user?.role === 'admin' && (
                          <button 
                            onClick={() => setCpfRevealDialog({ isOpen: true, memberId: member.id, memberName: member.fullName, revealedCpf: null, isLoading: false })}
                            className="ml-2 p-1.5 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                            title="Revelar CPF completo"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-muted-foreground">
                      {member.email || '-'}
                    </td>
                    <td className="px-6 py-4">
                      {member.familyName ? (
                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-secondary text-secondary-foreground">
                          {member.familyName}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Link 
                        href={`/members/${member.id}`}
                        className="inline-flex items-center justify-center px-3 py-1.5 text-sm font-medium rounded-lg bg-card border border-border hover:bg-secondary hover:text-foreground transition-colors"
                      >
                        Visualizar
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        
        {/* Pagination */}
        {!isLoading && totalPages > 0 && (
          <div className="px-6 py-4 border-t border-border bg-secondary/20 flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              Mostrando <span className="font-medium text-foreground">{(page - 1) * limit + 1}</span> a <span className="font-medium text-foreground">{Math.min(page * limit, total)}</span> de <span className="font-medium text-foreground">{total}</span> membros
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-2 rounded-lg border border-border bg-card hover:bg-secondary disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="p-2 rounded-lg border border-border bg-card hover:bg-secondary disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Reveal CPF Dialog */}
      <Dialog open={cpfRevealDialog.isOpen} onOpenChange={(open) => setCpfRevealDialog(prev => ({ ...prev, isOpen: open }))}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Revelar CPF</DialogTitle>
            <DialogDescription>
              Você está prestes a visualizar o CPF completo de <strong>{cpfRevealDialog.memberName}</strong>.
              Esta ação será registrada no log de auditoria do sistema.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center justify-center py-6">
            {cpfRevealDialog.revealedCpf ? (
              <div className="bg-primary/10 border border-primary/20 p-4 rounded-xl w-full text-center">
                <span className="font-mono text-2xl font-bold tracking-widest text-primary">
                  {cpfRevealDialog.revealedCpf}
                </span>
                <p className="text-xs text-muted-foreground mt-2 uppercase tracking-widest">Documento Descriptografado</p>
              </div>
            ) : (
              <button
                onClick={handleRevealCpf}
                disabled={cpfRevealDialog.isLoading}
                className="flex items-center justify-center w-full px-6 py-4 rounded-xl font-semibold text-white bg-gradient-to-r from-primary to-primary/90 shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {cpfRevealDialog.isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Eye className="w-5 h-5 mr-2" /> Confirmar e Revelar</>}
              </button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
