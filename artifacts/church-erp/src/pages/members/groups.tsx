import { useEffect, useState, useMemo } from "react";
import {
  useListMemberGroups, useCreateMemberGroup, useUpdateMemberGroup, useDeleteMemberGroup,
  useGetMemberGroup, useLinkMemberToGroup, useUnlinkMemberFromGroup,
  useListMembers,
} from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useAuth } from "@/hooks/use-auth-context";
import { Redirect } from "wouter";
import { UsersRound, Plus, Loader2, X, Trash2, Edit2, AlertTriangle, Search, UserPlus } from "lucide-react";

export default function MemberGroupsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const canManage = isAdmin || user?.role === "leader";

  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [form, setForm] = useState({ name: "", description: "" });
  const [memberSearchInput, setMemberSearchInput] = useState("");
  const [memberSearch, setMemberSearch] = useState("");

  // Debounce para evitar refetch a cada tecla
  useEffect(() => {
    const t = setTimeout(() => setMemberSearch(memberSearchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [memberSearchInput]);

  const { data, isLoading } = useListMemberGroups();
  const { data: detailData } = useGetMemberGroup(selectedId!, { query: { enabled: !!selectedId } });

  // Lista de membros pra adicionar (apenas quando o detail está aberto)
  const { data: membersData, isLoading: isLoadingMembers } = useListMembers(
    { search: memberSearch || undefined, status: "ativo" as any, limit: 50, page: 1 } as any,
    { query: { enabled: !!selectedId && (canManage as boolean) } },
  );

  const createMutation = useCreateMemberGroup();
  const updateMutation = useUpdateMemberGroup();
  const deleteMutation = useDeleteMemberGroup();
  const linkMutation = useLinkMemberToGroup();
  const unlinkMutation = useUnlinkMemberFromGroup();

  if (user?.role === "member") return <Redirect to="/" />;

  const groups = (data?.groups || []) as any[];
  const detail = detailData as any;

  function openCreate() {
    setForm({ name: "", description: "" });
    setEditingId(null);
    setShowCreate(true);
  }

  function openEdit(g: any) {
    setForm({ name: g.name, description: g.description || "" });
    setEditingId(g.id);
    setShowCreate(true);
  }

  function handleSave() {
    if (!form.name.trim()) return;
    if (editingId) {
      updateMutation.mutate({ id: editingId, data: form }, {
        onSuccess: () => { setShowCreate(false); setEditingId(null); }
      });
    } else {
      createMutation.mutate({ data: form }, {
        onSuccess: () => { setShowCreate(false); setForm({ name: "", description: "" }); }
      });
    }
  }

  // Reset busca quando trocar de grupo
  useEffect(() => {
    setMemberSearchInput("");
    setMemberSearch("");
  }, [selectedId]);

  // IDs dos membros já no grupo — pra filtrar da lista de adição
  const membersInGroup = useMemo(
    () => new Set<string>((detailData as any)?.members?.map((m: any) => m.id) ?? []),
    [detailData],
  );

  const availableMembers = useMemo(() => {
    const list = ((membersData as any)?.members ?? []) as any[];
    return list.filter((m) => !membersInGroup.has(m.id));
  }, [membersData, membersInGroup]);

  function handleAddMember(memberId: string) {
    if (!selectedId) return;
    linkMutation.mutate({ memberId, groupId: selectedId });
  }

  return (
    <AppLayout breadcrumbs={[{ label: "Rol de Membros", href: "/members" }, { label: "Agrupamentos" }]}>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <UsersRound className="h-6 w-6 text-primary" /> Agrupamentos
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Crie etiquetas reutilizáveis para vincular membros (famílias, equipes, casas).
          </p>
        </div>
        {canManage && (
          <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm hover:opacity-90">
            <Plus className="h-4 w-4" /> Novo Agrupamento
          </button>
        )}
      </div>

      {isLoading && (
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
      )}

      {!isLoading && groups.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <UsersRound className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p>Nenhum agrupamento cadastrado.</p>
        </div>
      )}

      {!isLoading && groups.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {groups.map((g) => (
            <div key={g.id} className="rounded-xl border bg-card p-5 hover:shadow-md transition-shadow cursor-pointer" onClick={() => setSelectedId(g.id)}>
              <div className="flex items-start justify-between gap-2 mb-2">
                <h3 className="font-semibold">{g.name}</h3>
                <span className="text-xs px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground shrink-0">
                  {g.memberCount} membro{g.memberCount === 1 ? "" : "s"}
                </span>
              </div>
              {g.description && (
                <p className="text-sm text-muted-foreground line-clamp-2 mb-4">{g.description}</p>
              )}
              {canManage && (
                <div className="flex justify-end gap-2 pt-3 border-t" onClick={(e) => e.stopPropagation()}>
                  <button onClick={() => openEdit(g)} className="p-2 hover:bg-muted rounded-xl" title="Editar">
                    <Edit2 className="h-4 w-4" />
                  </button>
                  {isAdmin && (
                    <button onClick={() => setDeleteTarget({ id: g.id, name: g.name })} className="p-2 hover:bg-destructive/10 rounded-xl text-destructive" title="Excluir">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowCreate(false)}>
          <div className="bg-card rounded-2xl border shadow-xl w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 border-b flex items-center justify-between">
              <h2 className="text-lg font-bold">{editingId ? "Editar Agrupamento" : "Novo Agrupamento"}</h2>
              <button onClick={() => setShowCreate(false)} className="p-1 hover:bg-muted rounded-lg">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-sm font-medium">Nome *</label>
                <input value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} className="w-full mt-1 px-3 py-2 border rounded-lg bg-background" placeholder="Ex: Família Silva" />
              </div>
              <div>
                <label className="text-sm font-medium">Descrição</label>
                <textarea value={form.description} onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))} rows={3} className="w-full mt-1 px-3 py-2 border rounded-lg bg-background" />
              </div>
            </div>
            <div className="p-6 border-t flex justify-end gap-3">
              <button onClick={() => setShowCreate(false)} className="px-4 py-2 border rounded-xl text-sm">Cancelar</button>
              <button onClick={handleSave} disabled={!form.name.trim() || createMutation.isPending || updateMutation.isPending} className="px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm disabled:opacity-50">
                {(createMutation.isPending || updateMutation.isPending) ? "Salvando..." : "Salvar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detail Drawer */}
      {selectedId && detail && (
        <div className="fixed inset-0 z-50 bg-black/50" onClick={() => setSelectedId(null)}>
          <div className="absolute right-0 top-0 bottom-0 w-full max-w-md bg-card shadow-xl overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 border-b flex items-center justify-between sticky top-0 bg-card">
              <div className="min-w-0">
                <h2 className="text-lg font-bold">{detail.name}</h2>
                {detail.description && <p className="text-sm text-muted-foreground">{detail.description}</p>}
              </div>
              <button onClick={() => setSelectedId(null)} className="p-1 hover:bg-muted rounded-lg shrink-0">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Membros já no grupo */}
              <div>
                <h3 className="text-sm font-semibold mb-2">
                  No grupo ({(detail.members || []).length})
                </h3>
                {(detail.members || []).length === 0 ? (
                  <p className="text-sm text-muted-foreground italic">Nenhum membro vinculado ainda.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {detail.members.map((m: any) => (
                      <li key={m.id} className="flex items-center justify-between p-2.5 rounded-lg bg-muted/40">
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-sm truncate">{m.fullName}</p>
                          {m.email && <p className="text-xs text-muted-foreground truncate">{m.email}</p>}
                        </div>
                        {canManage && (
                          <button
                            onClick={() => unlinkMutation.mutate({ memberId: m.id, groupId: selectedId })}
                            disabled={unlinkMutation.isPending}
                            className="p-1.5 text-muted-foreground hover:text-destructive shrink-0 disabled:opacity-50"
                            title="Remover do grupo"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Adicionar novos */}
              {canManage && (
                <div>
                  <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                    <UserPlus className="h-4 w-4" /> Adicionar membros
                  </h3>
                  <div className="relative mb-2">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <input
                      type="text"
                      value={memberSearchInput}
                      onChange={(e) => setMemberSearchInput(e.target.value)}
                      placeholder="Buscar por nome..."
                      className="w-full pl-9 pr-3 py-2 border rounded-lg bg-background text-sm"
                    />
                  </div>
                  <div className="border rounded-lg overflow-hidden max-h-72 overflow-y-auto">
                    {isLoadingMembers ? (
                      <div className="flex justify-center py-8">
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                      </div>
                    ) : availableMembers.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-8 italic">
                        {memberSearch
                          ? "Nenhum membro encontrado."
                          : "Todos os membros já estão neste grupo."}
                      </p>
                    ) : (
                      <ul className="divide-y">
                        {availableMembers.map((m: any) => (
                          <li key={m.id}>
                            <button
                              type="button"
                              onClick={() => handleAddMember(m.id)}
                              disabled={linkMutation.isPending}
                              className="w-full text-left flex items-center gap-3 p-2.5 hover:bg-muted/50 transition-colors disabled:opacity-50"
                            >
                              <Plus className="h-4 w-4 text-primary shrink-0" />
                              <div className="min-w-0 flex-1">
                                <p className="font-medium text-sm truncate">{m.fullName}</p>
                                {m.email && <p className="text-xs text-muted-foreground truncate">{m.email}</p>}
                              </div>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setDeleteTarget(null)}>
          <div className="bg-card rounded-xl border shadow-xl w-full max-w-sm mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 text-center">
              <AlertTriangle className="h-12 w-12 text-destructive mx-auto mb-4" />
              <h2 className="text-lg font-bold mb-2">Excluir Agrupamento</h2>
              <p className="text-sm text-muted-foreground mb-6">
                Excluir "{deleteTarget.name}"? Os membros vinculados serão desassociados.
              </p>
              <div className="flex justify-center gap-3">
                <button onClick={() => setDeleteTarget(null)} className="px-4 py-2 border rounded-xl text-sm">Cancelar</button>
                <button
                  onClick={() => deleteMutation.mutate({ id: deleteTarget.id }, { onSuccess: () => setDeleteTarget(null) })}
                  disabled={deleteMutation.isPending}
                  className="px-4 py-2 bg-destructive text-destructive-foreground rounded-xl text-sm disabled:opacity-50"
                >
                  Excluir
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
