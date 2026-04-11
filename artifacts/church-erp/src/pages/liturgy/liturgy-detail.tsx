import { useState } from "react";
import {
  useGetLiturgyDetail,
  useAddLiturgyItem,
  useUpdateLiturgy,
  useDeleteLiturgyItem,
} from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { useParams } from "wouter";
import { useAuth } from "@/hooks/use-auth-context";
import { MemberSelect } from "@/components/MemberSelect";
import {
  BookOpen, Plus, Loader2, X, Trash2,
  ArrowUp, ArrowDown, CheckCircle2,
} from "lucide-react";

const TYPE_LABELS: Record<string, string> = {
  culto_domingo: "Culto Dominical",
  culto_semana: "Culto de Semana",
  santa_ceia: "Santa Ceia",
  casamento: "Casamento",
  funeral: "Funeral",
  batismo: "Batismo",
  especial: "Especial",
  outro: "Outro",
};

const STATUS_LABELS: Record<string, string> = {
  rascunho: "Rascunho",
  aprovada: "Aprovada",
  realizada: "Realizada",
  cancelada: "Cancelada",
};

const STATUS_COLORS: Record<string, string> = {
  rascunho: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  aprovada: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  realizada: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  cancelada: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
};

const ITEM_TYPE_LABELS: Record<string, string> = {
  louvor: "Louvor",
  oracao: "Oracao",
  pregacao: "Pregacao",
  leitura: "Leitura",
  avisos: "Avisos",
  oferta: "Oferta",
  santa_ceia: "Santa Ceia",
  bencao: "Bencao",
  outro: "Outro",
};

const ITEM_TYPE_COLORS: Record<string, string> = {
  louvor: "bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-400",
  oracao: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  pregacao: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
  leitura: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  avisos: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400",
  oferta: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  santa_ceia: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400",
  bencao: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-400",
  outro: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

export default function LiturgyDetailPage() {
  const params = useParams<{ id: string }>();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const canManage = user?.role === "admin" || user?.role === "leader";

  const [showAddModal, setShowAddModal] = useState(false);
  const [deleteItemTarget, setDeleteItemTarget] = useState<{ id: string; title: string } | null>(
    null,
  );

  // Add item form state
  const [itemType, setItemType] = useState("louvor");
  const [itemTitle, setItemTitle] = useState("");
  const [itemDescription, setItemDescription] = useState("");
  const [itemResponsibleId, setItemResponsibleId] = useState("");
  const [itemResponsibleName, setItemResponsibleName] = useState("");
  const [itemDuration, setItemDuration] = useState("");
  const [itemSongId, setItemSongId] = useState("");

  const { data, isLoading, isError } = useGetLiturgyDetail(params.id!, {
    query: { enabled: !!params.id },
  });

  const updateMutation = useUpdateLiturgy({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/liturgies"] });
        toast({ title: "Sucesso", description: "Liturgia atualizada." });
      },
      onError: () =>
        toast({
          title: "Erro",
          description: "Falha ao atualizar liturgia.",
          variant: "destructive",
        }),
    },
  });

  const addItemMutation = useAddLiturgyItem({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/liturgies"] });
        toast({ title: "Sucesso", description: "Item adicionado." });
        closeAddModal();
      },
      onError: () =>
        toast({
          title: "Erro",
          description: "Falha ao adicionar item.",
          variant: "destructive",
        }),
    },
  });

  const deleteItemMutation = useDeleteLiturgyItem({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/liturgies"] });
        toast({ title: "Sucesso", description: "Item removido." });
        setDeleteItemTarget(null);
      },
      onError: () =>
        toast({ title: "Erro", description: "Falha ao remover item.", variant: "destructive" }),
    },
  });

  function closeAddModal() {
    setShowAddModal(false);
    setItemType("louvor");
    setItemTitle("");
    setItemDescription("");
    setItemResponsibleId("");
    setItemResponsibleName("");
    setItemDuration("");
    setItemSongId("");
  }

  function handleAddItem() {
    if (!itemTitle.trim() || !itemType) return;
    addItemMutation.mutate({
      liturgyId: params.id!,
      data: {
        type: itemType,
        title: itemTitle,
        description: itemDescription || undefined,
        responsibleId: itemResponsibleId || undefined,
        durationMinutes: itemDuration ? Number(itemDuration) : undefined,
        songId: itemSongId || undefined,
      },
    });
  }

  function handleApprove() {
    updateMutation.mutate({
      id: params.id!,
      data: { status: "aprovada" },
    });
  }

  function handleDeleteItemConfirm() {
    if (deleteItemTarget) {
      deleteItemMutation.mutate({ liturgyId: params.id!, id: deleteItemTarget.id });
    }
  }

  if (isLoading) {
    return (
      <AppLayout
        breadcrumbs={[{ label: "Liturgia", href: "/liturgy" }, { label: "Carregando..." }]}
      >
        <div className="flex h-[60vh] items-center justify-center">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  if (isError || !data) {
    return (
      <AppLayout breadcrumbs={[{ label: "Liturgia", href: "/liturgy" }, { label: "Erro" }]}>
        <div className="text-center py-12 text-destructive">Liturgia nao encontrada.</div>
      </AppLayout>
    );
  }

  const items = [...(data.items || [])].sort(
    (a: Record<string, unknown>, b: Record<string, unknown>) =>
      ((a.order as number) || 0) - ((b.order as number) || 0),
  );

  const totalDuration = items.reduce(
    (sum: number, item: Record<string, unknown>) => sum + ((item.durationMinutes as number) || 0),
    0,
  );

  return (
    <AppLayout
      breadcrumbs={[{ label: "Liturgia", href: "/liturgy" }, { label: data.title }]}
    >
      {/* Header */}
      <div className="rounded-2xl border bg-card p-6 mb-8">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <BookOpen className="h-6 w-6 text-purple-500" /> {data.title}
            </h1>
            <p className="text-muted-foreground text-sm mt-1">{formatDate(data.date)}</p>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`px-3 py-1 rounded-full text-xs font-medium ${
                STATUS_COLORS[data.status] || STATUS_COLORS.rascunho
              }`}
            >
              {STATUS_LABELS[data.status] || data.status}
            </span>
            <span className="px-3 py-1 rounded-full text-xs font-medium bg-muted">
              {TYPE_LABELS[data.type] || data.type}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <span>{items.length} item(ns)</span>
          {totalDuration > 0 && <span>{totalDuration} min total</span>}
        </div>

        {/* Approve button — admin only, only if status is rascunho */}
        {isAdmin && data.status === "rascunho" && (
          <div className="mt-4 pt-4 border-t">
            <button
              onClick={handleApprove}
              disabled={updateMutation.isPending}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 disabled:opacity-50"
            >
              {updateMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              Aprovar Liturgia
            </button>
          </div>
        )}

        {data.notes && (
          <div className="mt-4 pt-4 border-t">
            <p className="text-sm text-muted-foreground">{data.notes}</p>
          </div>
        )}
      </div>

      {/* Items Section */}
      <div className="rounded-2xl border bg-card p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Roteiro</h2>
          {canManage && (
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-1 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-sm"
            >
              <Plus className="h-3.5 w-3.5" /> Adicionar Item
            </button>
          )}
        </div>

        {items.length === 0 ? (
          <p className="text-muted-foreground text-sm py-8 text-center">
            Nenhum item na liturgia. Clique em "Adicionar Item" para comecar.
          </p>
        ) : (
          <div className="space-y-2">
            {items.map((item: Record<string, unknown>, index: number) => (
              <div
                key={item.id as string}
                className="flex items-center gap-3 p-3 rounded-xl bg-muted/50 group"
              >
                {/* Order number */}
                <div className="flex flex-col items-center gap-0.5 shrink-0">
                  <ArrowUp className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-50" />
                  <span className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">
                    {(item.order as number) || index + 1}
                  </span>
                  <ArrowDown className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-50" />
                </div>

                {/* Item type badge */}
                <span
                  className={`px-2 py-0.5 rounded-full text-xs font-medium shrink-0 ${
                    ITEM_TYPE_COLORS[(item.type as string)] || ITEM_TYPE_COLORS.outro
                  }`}
                >
                  {ITEM_TYPE_LABELS[(item.type as string)] || item.type}
                </span>

                {/* Title and responsible */}
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{item.title as string}</p>
                  {item.responsibleName && (
                    <p className="text-xs text-muted-foreground">
                      {item.responsibleName as string}
                    </p>
                  )}
                </div>

                {/* Duration */}
                {item.durationMinutes && (
                  <span className="text-xs text-muted-foreground shrink-0">
                    {item.durationMinutes as number} min
                  </span>
                )}

                {/* Delete button */}
                {canManage && (
                  <button
                    onClick={() =>
                      setDeleteItemTarget({
                        id: item.id as string,
                        title: item.title as string,
                      })
                    }
                    className="p-1.5 hover:bg-destructive/10 rounded-lg text-destructive opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                    title="Remover item"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Item Modal */}
      {showAddModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={closeAddModal}
        >
          <div
            className="bg-card rounded-2xl border shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b flex items-center justify-between">
              <h2 className="text-lg font-bold">Adicionar Item</h2>
              <button onClick={closeAddModal} className="p-1 hover:bg-muted rounded-lg">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Tipo *</label>
                  <select
                    value={itemType}
                    onChange={(e) => setItemType(e.target.value)}
                    className="w-full mt-1 px-3 py-2 border rounded-lg bg-background text-sm"
                  >
                    {Object.entries(ITEM_TYPE_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium">Duracao (min)</label>
                  <input
                    type="number"
                    inputMode="numeric"
                    value={itemDuration}
                    onChange={(e) => setItemDuration(e.target.value)}
                    className="w-full mt-1 px-3 py-2 border rounded-lg bg-background text-sm"
                    placeholder="Ex: 15"
                  />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium">Titulo *</label>
                <input
                  value={itemTitle}
                  onChange={(e) => setItemTitle(e.target.value)}
                  className="w-full mt-1 px-3 py-2 border rounded-lg bg-background"
                  placeholder="Ex: Louvor - Grande e o Senhor"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Descricao</label>
                <textarea
                  value={itemDescription}
                  onChange={(e) => setItemDescription(e.target.value)}
                  rows={2}
                  className="w-full mt-1 px-3 py-2 border rounded-lg bg-background"
                  placeholder="Detalhes adicionais..."
                />
              </div>
              <div>
                <label className="text-sm font-medium">Responsavel</label>
                <div className="mt-1">
                  <MemberSelect
                    value={itemResponsibleId}
                    onChange={(id, name) => {
                      setItemResponsibleId(id);
                      setItemResponsibleName(name);
                    }}
                    placeholder="Buscar responsavel por nome..."
                  />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium">ID do Louvor (opcional)</label>
                <input
                  value={itemSongId}
                  onChange={(e) => setItemSongId(e.target.value)}
                  className="w-full mt-1 px-3 py-2 border rounded-lg bg-background text-sm"
                  placeholder="ID do louvor no modulo de musicas"
                />
              </div>
              <div className="flex justify-end gap-3 pt-4 border-t">
                <button
                  type="button"
                  onClick={closeAddModal}
                  className="px-4 py-2 border rounded-lg text-sm"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleAddItem}
                  disabled={addItemMutation.isPending || !itemTitle.trim()}
                  className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm disabled:opacity-50 flex items-center gap-2"
                >
                  {addItemMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  Adicionar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Item Confirmation Modal */}
      {deleteItemTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setDeleteItemTarget(null)}
        >
          <div
            className="bg-card rounded-2xl border shadow-xl w-full max-w-sm mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              <h2 className="text-lg font-bold mb-2">Remover Item</h2>
              <p className="text-sm text-muted-foreground mb-6">
                Tem certeza que deseja remover o item "{deleteItemTarget.title}" da liturgia?
              </p>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setDeleteItemTarget(null)}
                  className="px-4 py-2 border rounded-lg text-sm"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleDeleteItemConfirm}
                  disabled={deleteItemMutation.isPending}
                  className="px-4 py-2 bg-destructive text-destructive-foreground rounded-lg text-sm disabled:opacity-50 flex items-center gap-2"
                >
                  {deleteItemMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  Remover
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
