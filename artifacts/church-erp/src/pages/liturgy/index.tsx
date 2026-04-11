import { useState } from "react";
import {
  useListLiturgies,
  useCreateLiturgy,
  useDeleteLiturgy,
} from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth-context";
import {
  BookOpen, Plus, Loader2, X, Trash2, Filter,
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

const TYPE_COLORS: Record<string, string> = {
  culto_domingo: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  culto_semana: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400",
  santa_ceia: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
  casamento: "bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-400",
  funeral: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400",
  batismo: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-400",
  especial: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  outro: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400",
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

const liturgySchema = z.object({
  title: z.string().min(1, "Titulo e obrigatorio"),
  date: z.string().min(1, "Data e obrigatoria"),
  type: z.string().min(1, "Tipo e obrigatorio"),
  notes: z.string().optional(),
});

type LiturgyForm = z.infer<typeof liturgySchema>;

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export default function LiturgyListPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const canManage = user?.role === "admin" || user?.role === "leader";

  const [page, setPage] = useState(1);
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);

  const { data, isLoading } = useListLiturgies({
    page,
    limit: 20,
    ...(typeFilter ? { type: typeFilter } : {}),
    ...(statusFilter ? { status: statusFilter } : {}),
  });

  const form = useForm<LiturgyForm>({
    resolver: zodResolver(liturgySchema),
    defaultValues: { type: "culto_domingo" },
  });

  const createMutation = useCreateLiturgy({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/liturgies"] });
        toast({ title: "Sucesso", description: "Liturgia criada." });
        closeModal();
      },
      onError: () =>
        toast({ title: "Erro", description: "Falha ao criar liturgia.", variant: "destructive" }),
    },
  });

  const deleteMutation = useDeleteLiturgy({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/liturgies"] });
        toast({ title: "Sucesso", description: "Liturgia excluida." });
        setDeleteTarget(null);
      },
      onError: () =>
        toast({ title: "Erro", description: "Falha ao excluir liturgia.", variant: "destructive" }),
    },
  });

  function closeModal() {
    setIsModalOpen(false);
    form.reset({ type: "culto_domingo" });
  }

  function onSubmit(values: LiturgyForm) {
    createMutation.mutate({ data: values });
  }

  function handleDeleteConfirm() {
    if (deleteTarget) {
      deleteMutation.mutate({ id: deleteTarget.id });
    }
  }

  const liturgies = data?.liturgies || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / 20);

  return (
    <AppLayout breadcrumbs={[{ label: "Liturgia" }]}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BookOpen className="h-6 w-6 text-purple-500" /> Liturgias
          </h1>
          <p className="text-muted-foreground text-sm mt-1">{total} liturgia(s)</p>
        </div>
        {canManage && (
          <button
            onClick={() => {
              form.reset({ type: "culto_domingo" });
              setIsModalOpen(true);
            }}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90"
          >
            <Plus className="h-4 w-4" /> Nova Liturgia
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex gap-4 mb-6 flex-wrap">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <select
            value={typeFilter}
            onChange={(e) => {
              setTypeFilter(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2 border rounded-lg bg-background text-sm"
          >
            <option value="">Todos os tipos</option>
            {Object.entries(TYPE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2 border rounded-lg bg-background text-sm"
          >
            <option value="">Todos os status</option>
            {Object.entries(STATUS_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          {(typeFilter || statusFilter) && (
            <button
              onClick={() => {
                setTypeFilter("");
                setStatusFilter("");
                setPage(1);
              }}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      )}

      {/* Liturgies List */}
      {!isLoading && (
        <div className="space-y-3">
          {liturgies.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              Nenhuma liturgia encontrada.
            </div>
          )}
          {liturgies.map((lit: Record<string, unknown>) => (
            <div
              key={lit.id as string}
              onClick={() => setLocation(`/liturgy/${lit.id}`)}
              className="rounded-xl border bg-card p-4 hover:shadow-md transition-shadow cursor-pointer"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <BookOpen className="h-5 w-5 text-purple-500 shrink-0" />
                  <div className="min-w-0">
                    <h3 className="font-semibold truncate">{lit.title as string}</h3>
                    <p className="text-sm text-muted-foreground">
                      {formatDate(lit.date as string)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      TYPE_COLORS[(lit.type as string)] || TYPE_COLORS.outro
                    }`}
                  >
                    {TYPE_LABELS[(lit.type as string)] || lit.type}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      STATUS_COLORS[(lit.status as string)] || STATUS_COLORS.rascunho
                    }`}
                  >
                    {STATUS_LABELS[(lit.status as string)] || lit.status}
                  </span>
                  {isAdmin && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteTarget({ id: lit.id as string, title: lit.title as string });
                      }}
                      className="p-2 hover:bg-destructive/10 rounded-lg text-destructive"
                      title="Excluir"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Pagina {page} de {totalPages}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="px-3 py-1 border rounded-lg text-sm disabled:opacity-50"
            >
              Anterior
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="px-3 py-1 border rounded-lg text-sm disabled:opacity-50"
            >
              Proxima
            </button>
          </div>
        </div>
      )}

      {/* Create Modal */}
      {isModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={closeModal}
        >
          <div
            className="bg-card rounded-2xl border shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b">
              <h2 className="text-lg font-bold">Nova Liturgia</h2>
            </div>
            <form onSubmit={form.handleSubmit(onSubmit)} className="p-6 space-y-4">
              <div>
                <label className="text-sm font-medium">Titulo *</label>
                <input
                  {...form.register("title")}
                  className="w-full mt-1 px-3 py-2 border rounded-lg bg-background"
                  placeholder="Ex: Culto Dominical - Manha"
                />
                {form.formState.errors.title && (
                  <p className="text-xs text-destructive mt-1">
                    {form.formState.errors.title.message}
                  </p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Data *</label>
                  <input
                    type="date"
                    {...form.register("date")}
                    className="w-full mt-1 px-3 py-2 border rounded-lg bg-background"
                  />
                  {form.formState.errors.date && (
                    <p className="text-xs text-destructive mt-1">
                      {form.formState.errors.date.message}
                    </p>
                  )}
                </div>
                <div>
                  <label className="text-sm font-medium">Tipo *</label>
                  <select
                    {...form.register("type")}
                    className="w-full mt-1 px-3 py-2 border rounded-lg bg-background"
                  >
                    {Object.entries(TYPE_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium">Observacoes</label>
                <textarea
                  {...form.register("notes")}
                  rows={3}
                  className="w-full mt-1 px-3 py-2 border rounded-lg bg-background"
                  placeholder="Anotacoes adicionais..."
                />
              </div>
              <div className="flex justify-end gap-3 pt-4 border-t">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2 border rounded-lg text-sm"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm disabled:opacity-50 flex items-center gap-2"
                >
                  {createMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  Criar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setDeleteTarget(null)}
        >
          <div
            className="bg-card rounded-2xl border shadow-xl w-full max-w-sm mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              <h2 className="text-lg font-bold mb-2">Confirmar Exclusao</h2>
              <p className="text-sm text-muted-foreground mb-6">
                Tem certeza que deseja excluir a liturgia "{deleteTarget.title}"? Esta acao nao pode
                ser desfeita.
              </p>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setDeleteTarget(null)}
                  className="px-4 py-2 border rounded-lg text-sm"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleDeleteConfirm}
                  disabled={deleteMutation.isPending}
                  className="px-4 py-2 bg-destructive text-destructive-foreground rounded-lg text-sm disabled:opacity-50 flex items-center gap-2"
                >
                  {deleteMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
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
