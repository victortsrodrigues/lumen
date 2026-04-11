import { useState } from "react";
import {
  useGetMinistryDetail, useAddMinistryMember,
  useUpdateMinistryMemberRole, useRemoveMinistryMember,
  useUpdateMinistry, useDeleteMinistry,
  useListMinistryGoals, useCreateMinistryGoal, useUpdateMinistryGoal, useDeleteMinistryGoal,
} from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { MediaSection } from "@/components/MediaSection";
import { MemberSelect } from "@/components/MemberSelect";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth-context";
import {
  UsersRound, Plus, Loader2, X, Trash2, AlertTriangle,
  UserPlus, Edit2, Save, Target,
} from "lucide-react";

const ROLE_LABELS: Record<string, string> = {
  lider: "Líder", membro: "Membro",
};

const ROLE_COLORS: Record<string, string> = {
  lider: "bg-blue-100 text-blue-800",
  membro: "bg-slate-100 text-slate-800",
};

export default function MinistryDetailPage() {
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const [showAddMemberModal, setShowAddMemberModal] = useState(false);
  const [newMemberId, setNewMemberId] = useState("");
  const [newMemberRole, setNewMemberRole] = useState("membro");

  const [editingRole, setEditingRole] = useState<string | null>(null);
  const [editRoleValue, setEditRoleValue] = useState("");
  const [showGoalModal, setShowGoalModal] = useState(false);
  const [goalForm, setGoalForm] = useState({ title: "", description: "", targetValue: "", unit: "", deadline: "" });
  const [showEditModal, setShowEditModal] = useState(false);
  const [editForm, setEditForm] = useState({ name: "", description: "" });
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const { data, isLoading, isError } = useGetMinistryDetail(params.id!, {
    query: { enabled: !!params.id },
  });

  const addMemberMutation = useAddMinistryMember({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ predicate: (q) => (q.queryKey[0] as string)?.startsWith?.("/api/ministries") });
        toast({ title: "Sucesso", description: "Membro adicionado ao ministério." });
        setShowAddMemberModal(false);
        setNewMemberId("");
        setNewMemberRole("membro");
      },
      onError: (err: any) => {
        const msg = err?.response?.data?.error || "Falha ao adicionar membro.";
        toast({ title: "Erro", description: msg, variant: "destructive" });
      },
    },
  });

  const updateRoleMutation = useUpdateMinistryMemberRole({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ predicate: (q) => (q.queryKey[0] as string)?.startsWith?.("/api/ministries") });
        toast({ title: "Sucesso", description: "Função atualizada." });
        setEditingRole(null);
      },
      onError: (err: any) => {
        const msg = err?.response?.data?.error || "Falha ao atualizar função.";
        toast({ title: "Erro", description: msg, variant: "destructive" });
      },
    },
  });

  const removeMemberMutation = useRemoveMinistryMember({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ predicate: (q) => (q.queryKey[0] as string)?.startsWith?.("/api/ministries") });
        toast({ title: "Sucesso", description: "Membro removido do ministério." });
      },
    },
  });

  const updateMinistryMut = useUpdateMinistry({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ predicate: (q) => (q.queryKey[0] as string)?.startsWith?.("/api/ministries") });
        toast({ title: "Sucesso", description: "Ministério atualizado." });
        setShowEditModal(false);
      },
    },
  });

  const deleteMinistryMut = useDeleteMinistry({
    mutation: {
      onSuccess: () => {
        toast({ title: "Sucesso", description: "Ministério removido." });
        setLocation("/ministries");
      },
    },
  });

  const { data: goalsData } = useListMinistryGoals(params.id!, { query: { enabled: !!params.id } });

  const createGoalMut = useCreateMinistryGoal({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ predicate: (q) => (q.queryKey[0] as string)?.startsWith?.("/api/ministries") });
        toast({ title: "Sucesso", description: "Meta criada." });
        setShowGoalModal(false);
        setGoalForm({ title: "", description: "", targetValue: "", unit: "", deadline: "" });
      },
      onError: (err: any) => toast({ title: "Erro", description: err?.response?.data?.error || "Falha.", variant: "destructive" }),
    },
  });

  const updateGoalMut = useUpdateMinistryGoal({
    mutation: { onSuccess: () => { queryClient.invalidateQueries({ predicate: (q) => (q.queryKey[0] as string)?.startsWith?.("/api/ministries") }); toast({ title: "Sucesso", description: "Meta atualizada." }); } },
  });

  const deleteGoalMut = useDeleteMinistryGoal({
    mutation: { onSuccess: () => { queryClient.invalidateQueries({ predicate: (q) => (q.queryKey[0] as string)?.startsWith?.("/api/ministries") }); toast({ title: "Sucesso", description: "Meta removida." }); } },
  });

  const handleAddMember = () => {
    if (!newMemberId.trim()) return;
    addMemberMutation.mutate({
      id: params.id!,
      data: { memberId: newMemberId.trim(), role: newMemberRole as any },
    });
  };

  const handleUpdateRole = (memberId: string) => {
    updateRoleMutation.mutate({
      id: params.id!,
      memberId,
      data: { role: editRoleValue as any },
    });
  };

  const [removeMemberTarget, setRemoveMemberTarget] = useState<{ memberId: string; memberName: string } | null>(null);

  const canEdit = user?.role === "admin" || user?.role === "leader";

  if (isLoading) {
    return (
      <AppLayout breadcrumbs={[{ label: "Ministérios", href: "/ministries" }, { label: "Carregando..." }]}>
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  if (isError || !data) {
    return (
      <AppLayout breadcrumbs={[{ label: "Ministérios", href: "/ministries" }, { label: "Erro" }]}>
        <div className="text-center py-12 text-muted-foreground">
          Ministério não encontrado.
          <button onClick={() => setLocation("/ministries")} className="block mx-auto mt-4 text-primary text-sm">
            Voltar
          </button>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout breadcrumbs={[{ label: "Ministérios", href: "/ministries" }, { label: data.name }]}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <UsersRound className="h-6 w-6" /> {data.name}
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${data.status === "ativo" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
              {data.status === "ativo" ? "Ativo" : "Inativo"}
            </span>
          </h1>
        </div>
        {canEdit && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setEditForm({ name: data.name || "", description: data.description || "" }); setShowEditModal(true); }}
              className="flex items-center gap-1 px-4 py-2 border rounded-xl text-sm font-medium hover:bg-secondary transition-colors"
            >
              <Edit2 className="h-4 w-4" /> Editar
            </button>
            <button
              onClick={() => updateMinistryMut.mutate({ id: params.id!, data: { status: data.status === "ativo" ? "inativo" : "ativo" } })}
              disabled={updateMinistryMut.isPending}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${data.status === "ativo" ? "border border-red-200 text-red-700 hover:bg-red-50" : "bg-green-600 text-white hover:bg-green-700"}`}
            >
              {data.status === "ativo" ? "Desativar" : "Reativar"}
            </button>
            {user?.role === "admin" && (
              <button
                onClick={() => setShowDeleteModal(true)}
                className="p-2 border border-red-200 text-red-700 rounded-xl hover:bg-red-50 transition-colors"
                title="Remover ministério"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Info */}
        <div className="space-y-6">
          <div className="rounded-2xl border bg-card p-6">
            <h2 className="text-lg font-semibold mb-4">Informações</h2>
            {data.description && <p className="text-sm text-muted-foreground mb-4">{data.description}</p>}
          </div>

          {/* Media */}
          <div className="rounded-2xl border bg-card p-6">
            <MediaSection entityType="ministry" entityId={params.id!} canEdit={canEdit} />
          </div>

          {/* Goals */}
          <div className="rounded-2xl border bg-card p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Target className="h-5 w-5" /> Metas
              </h2>
              {canEdit && (
                <button onClick={() => setShowGoalModal(true)} className="flex items-center gap-1 text-sm text-primary hover:text-primary/80 font-medium">
                  <Plus className="w-4 h-4" /> Nova Meta
                </button>
              )}
            </div>
            {(!goalsData?.goals || goalsData.goals.length === 0) ? (
              <p className="text-sm text-muted-foreground">Nenhuma meta definida.</p>
            ) : (
              <div className="space-y-3">
                {goalsData.goals.map((g: any) => {
                  const progress = g.targetValue && parseFloat(g.targetValue) > 0
                    ? Math.min(100, Math.round((parseFloat(g.currentValue || "0") / parseFloat(g.targetValue)) * 100))
                    : 0;
                  return (
                    <div key={g.id} className="p-3 rounded-xl bg-muted/50">
                      <div className="flex items-center justify-between mb-1">
                        <p className="font-medium text-sm">{g.title}</p>
                        <div className="flex items-center gap-2">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${g.status === "concluida" ? "bg-green-100 text-green-800" : g.status === "cancelada" ? "bg-red-100 text-red-800" : "bg-blue-100 text-blue-800"}`}>
                            {g.status === "em_andamento" ? "Em andamento" : g.status === "concluida" ? "Concluída" : "Cancelada"}
                          </span>
                          {canEdit && (
                            <button onClick={() => { if (confirm("Remover meta?")) deleteGoalMut.mutate({ id: params.id!, goalId: g.id }); }} className="p-0.5 text-destructive hover:bg-destructive/10 rounded">
                              <Trash2 className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="mt-2">
                        <div className="flex justify-between text-xs text-muted-foreground mb-1">
                          <span>{g.currentValue || 0} / {g.targetValue} {g.unit || ""}</span>
                          <span>{progress}%</span>
                        </div>
                        <div className="w-full bg-muted rounded-full h-2">
                          <div className={`h-2 rounded-full ${progress >= 100 ? "bg-green-500" : progress >= 50 ? "bg-blue-500" : "bg-amber-500"}`} style={{ width: `${progress}%` }} />
                        </div>
                      </div>
                      {g.deadline && <p className="text-xs text-muted-foreground mt-1">Prazo: {new Date(g.deadline).toLocaleDateString("pt-BR")}</p>}
                      {canEdit && g.status === "em_andamento" && (
                        <div className="flex gap-2 mt-2">
                          <input type="number" inputMode="numeric" placeholder="Atualizar progresso" className="flex-1 px-2 py-1 border rounded text-xs bg-background"
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                const val = (e.target as HTMLInputElement).value;
                                if (val) updateGoalMut.mutate({ id: params.id!, goalId: g.id, data: { currentValue: Number(val) } });
                              }
                            }} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Members */}
        <div className="rounded-2xl border bg-card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <UsersRound className="h-5 w-5" /> Membros ({data.members?.length || 0})
            </h2>
            {canEdit && (
              <button onClick={() => setShowAddMemberModal(true)} className="flex items-center gap-1 px-3 py-1 bg-primary text-primary-foreground rounded-lg text-sm">
                <UserPlus className="h-3.5 w-3.5" /> Adicionar
              </button>
            )}
          </div>

          {(!data.members || data.members.length === 0) ? (
            <p className="text-muted-foreground text-sm">Nenhum membro ativo.</p>
          ) : (
            <div className="space-y-2">
              {data.members.map((mm: any) => (
                <div key={mm.id} className="flex items-center justify-between p-3 rounded-xl bg-muted/50">
                  <div className="flex items-center gap-3">
                    <div>
                      <p className="font-medium text-sm">{mm.memberName || "Membro"}</p>
                      <p className="text-xs text-muted-foreground">
                        Desde {mm.joinedAt ? new Date(mm.joinedAt).toLocaleDateString("pt-BR") : "—"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {editingRole === mm.memberId ? (
                      <div className="flex items-center gap-1">
                        <select
                          value={editRoleValue}
                          onChange={(e) => setEditRoleValue(e.target.value)}
                          className="text-xs px-2 py-1 border rounded bg-background"
                        >
                          {Object.entries(ROLE_LABELS).map(([k, v]) => (
                            <option key={k} value={k}>{v}</option>
                          ))}
                        </select>
                        <button onClick={() => handleUpdateRole(mm.memberId)} className="p-1 text-primary hover:bg-primary/10 rounded">
                          <Save className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => setEditingRole(null)} className="p-1 text-muted-foreground hover:bg-secondary rounded">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : (
                      <>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ROLE_COLORS[mm.role] || ROLE_COLORS.membro}`}>
                          {ROLE_LABELS[mm.role] || mm.role}
                        </span>
                        {canEdit && (
                          <>
                            <button
                              onClick={() => { setEditingRole(mm.memberId); setEditRoleValue(mm.role); }}
                              className="p-1 text-muted-foreground hover:text-foreground hover:bg-secondary rounded"
                              title="Alterar função"
                            >
                              <Edit2 className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => setRemoveMemberTarget({ memberId: mm.memberId, memberName: mm.memberName })}
                              className="p-1 text-destructive hover:bg-destructive/10 rounded"
                              title="Remover"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </>
                        )}
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Add Member Modal */}
      {showAddMemberModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowAddMemberModal(false)}>
          <div className="bg-card rounded-2xl border shadow-xl w-full max-w-sm mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 border-b flex items-center justify-between">
              <h2 className="text-lg font-bold">Adicionar Membro</h2>
              <button onClick={() => setShowAddMemberModal(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-6 space-y-3">
              <div>
                <label className="text-sm font-medium">Membro *</label>
                <div className="mt-1">
                  <MemberSelect
                    value={newMemberId}
                    onChange={(id) => setNewMemberId(id)}
                    excludeIds={(data?.members || []).map((mm: any) => mm.memberId)}
                  />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium">Função</label>
                <select
                  value={newMemberRole}
                  onChange={(e) => setNewMemberRole(e.target.value)}
                  className="w-full mt-1 px-3 py-2 border rounded-lg bg-background text-sm"
                >
                  {Object.entries(ROLE_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="p-6 border-t flex justify-end gap-3">
              <button onClick={() => setShowAddMemberModal(false)} className="px-4 py-2 border rounded-lg text-sm">Cancelar</button>
              <button onClick={handleAddMember} disabled={addMemberMutation.isPending || !newMemberId.trim()} className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm flex items-center gap-2 disabled:opacity-50">
                {addMemberMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Adicionar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Goal Modal */}
      {showGoalModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowGoalModal(false)}>
          <div className="bg-card rounded-2xl border shadow-xl w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 border-b flex items-center justify-between">
              <h2 className="text-lg font-bold">Nova Meta</h2>
              <button onClick={() => setShowGoalModal(false)} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
            </div>
            <div className="p-6 space-y-3">
              <div><label className="text-sm font-medium">Título *</label><input value={goalForm.title} onChange={e => setGoalForm(f => ({ ...f, title: e.target.value }))} className="w-full mt-1 px-3 py-2 border rounded-lg bg-background text-sm" placeholder="Ex: Formar 5 novos músicos" /></div>
              <div><label className="text-sm font-medium">Descrição</label><textarea value={goalForm.description} onChange={e => setGoalForm(f => ({ ...f, description: e.target.value }))} className="w-full mt-1 px-3 py-2 border rounded-lg bg-background text-sm" rows={2} /></div>
              <div className="grid grid-cols-3 gap-3">
                <div><label className="text-sm font-medium">Meta *</label><input type="number" inputMode="numeric" value={goalForm.targetValue} onChange={e => setGoalForm(f => ({ ...f, targetValue: e.target.value }))} className="w-full mt-1 px-3 py-2 border rounded-lg bg-background text-sm" /></div>
                <div><label className="text-sm font-medium">Unidade</label><input value={goalForm.unit} onChange={e => setGoalForm(f => ({ ...f, unit: e.target.value }))} className="w-full mt-1 px-3 py-2 border rounded-lg bg-background text-sm" placeholder="músicos" /></div>
                <div><label className="text-sm font-medium">Prazo</label><input type="date" value={goalForm.deadline} onChange={e => setGoalForm(f => ({ ...f, deadline: e.target.value }))} className="w-full mt-1 px-3 py-2 border rounded-lg bg-background text-sm" /></div>
              </div>
            </div>
            <div className="p-6 border-t flex justify-end gap-3">
              <button onClick={() => setShowGoalModal(false)} className="px-4 py-2 border rounded-lg text-sm">Cancelar</button>
              <button onClick={() => createGoalMut.mutate({ id: params.id!, data: { title: goalForm.title, description: goalForm.description || undefined, targetValue: Number(goalForm.targetValue), unit: goalForm.unit || undefined, deadline: goalForm.deadline || undefined } as any })} disabled={!goalForm.title.trim() || !goalForm.targetValue || createGoalMut.isPending} className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm disabled:opacity-50 flex items-center gap-2">
                {createGoalMut.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Criar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Remove Member Confirmation Modal */}
      {removeMemberTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setRemoveMemberTarget(null)}>
          <div className="bg-card rounded-2xl border shadow-xl w-full max-w-sm mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center">
                  <AlertTriangle className="h-5 w-5 text-destructive" />
                </div>
                <div>
                  <h2 className="text-lg font-bold">Remover Membro</h2>
                  <p className="text-sm text-muted-foreground">Esta ação não pode ser desfeita.</p>
                </div>
              </div>
              <p className="text-sm mb-6">
                Tem certeza que deseja remover <strong>"{removeMemberTarget.memberName || "este membro"}"</strong> do ministério?
              </p>
              <div className="flex justify-end gap-3">
                <button onClick={() => setRemoveMemberTarget(null)} className="px-4 py-2 border rounded-lg text-sm">Cancelar</button>
                <button
                  onClick={() => {
                    removeMemberMutation.mutate({ id: params.id!, memberId: removeMemberTarget.memberId });
                    setRemoveMemberTarget(null);
                  }}
                  disabled={removeMemberMutation.isPending}
                  className="px-4 py-2 bg-destructive text-destructive-foreground rounded-lg text-sm flex items-center gap-2 disabled:opacity-50"
                >
                  {removeMemberMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Remover
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Ministry Modal */}
      {showEditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowEditModal(false)}>
          <div className="bg-card rounded-2xl border shadow-xl w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 border-b flex items-center justify-between">
              <h2 className="text-lg font-bold">Editar Ministério</h2>
              <button onClick={() => setShowEditModal(false)} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
            </div>
            <div className="p-6 space-y-3">
              <div>
                <label className="text-sm font-medium">Nome *</label>
                <input value={editForm.name} onChange={(e) => setEditForm(f => ({ ...f, name: e.target.value }))} className="w-full mt-1 px-3 py-2 border rounded-lg bg-background text-sm" />
              </div>
              <div>
                <label className="text-sm font-medium">Informações</label>
                <textarea value={editForm.description} onChange={(e) => setEditForm(f => ({ ...f, description: e.target.value }))} className="w-full mt-1 px-3 py-2 border rounded-lg bg-background text-sm" rows={2} />
              </div>
            </div>
            <div className="p-6 border-t flex justify-end gap-3">
              <button onClick={() => setShowEditModal(false)} className="px-4 py-2 border rounded-lg text-sm">Cancelar</button>
              <button
                onClick={() => updateMinistryMut.mutate({ id: params.id!, data: editForm as any })}
                disabled={updateMinistryMut.isPending || !editForm.name.trim()}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm flex items-center gap-2 disabled:opacity-50"
              >
                {updateMinistryMut.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Salvar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Ministry Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowDeleteModal(false)}>
          <div className="bg-card rounded-2xl border shadow-xl w-full max-w-sm mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center">
                  <AlertTriangle className="h-5 w-5 text-destructive" />
                </div>
                <div>
                  <h2 className="text-lg font-bold">Remover Ministério</h2>
                  <p className="text-sm text-muted-foreground">Esta ação não pode ser desfeita.</p>
                </div>
              </div>
              <p className="text-sm mb-6">
                Tem certeza que deseja remover o ministério <strong>"{data.name}"</strong>? Todos os membros serão desvinculados.
              </p>
              <div className="flex justify-end gap-3">
                <button onClick={() => setShowDeleteModal(false)} className="px-4 py-2 border rounded-lg text-sm">Cancelar</button>
                <button
                  onClick={() => deleteMinistryMut.mutate({ id: params.id! })}
                  disabled={deleteMinistryMut.isPending}
                  className="px-4 py-2 bg-destructive text-destructive-foreground rounded-lg text-sm flex items-center gap-2 disabled:opacity-50"
                >
                  {deleteMinistryMut.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Remover
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
