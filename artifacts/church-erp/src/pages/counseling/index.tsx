import { useState } from "react";
import {
  useListCounselingCases, useCreateCounselingCase, useGetCounselingSummary,
} from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { MemberSelect } from "@/components/MemberSelect";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth-context";
import { useLocation } from "wouter";
import {
  ShieldCheck, Plus, Loader2, X, Lock,
} from "lucide-react";

const STATUS_LABELS: Record<string, string> = {
  aberto: "Aberto", em_andamento: "Em Andamento", encerrado: "Encerrado",
};

const STATUS_COLORS: Record<string, string> = {
  aberto: "bg-blue-100 text-blue-800",
  em_andamento: "bg-yellow-100 text-yellow-800",
  encerrado: "bg-slate-100 text-slate-800",
};

export default function CounselingPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const isAdmin = user?.role === "admin";

  const [showModal, setShowModal] = useState(false);
  const [filterStatus, setFilterStatus] = useState("");
  const [page, setPage] = useState(1);

  const [memberId, setMemberId] = useState("");
  const [counselorId, setCounselorId] = useState("");
  const [topic, setTopic] = useState("");
  const [startDate, setStartDate] = useState("");

  const { data, isLoading } = useListCounselingCases({
    page, limit: 20,
    ...(filterStatus ? { status: filterStatus as any } : {}),
  });

  const { data: summary } = useGetCounselingSummary();

  const invalidate = () => {
    queryClient.invalidateQueries({ predicate: (q) => (q.queryKey[0] as string)?.startsWith?.("/api/counseling") });
  };

  const createMutation = useCreateCounselingCase({
    mutation: {
      onSuccess: () => {
        invalidate();
        toast({ title: "Sucesso", description: "Caso criado." });
        closeModal();
      },
      onError: (err: any) => {
        toast({ title: "Erro", description: err?.response?.data?.message || "Falha ao criar.", variant: "destructive" });
      },
    },
  });

  const closeModal = () => {
    setShowModal(false);
    setMemberId(""); setCounselorId(""); setTopic(""); setStartDate("");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!memberId || !counselorId || !topic || !startDate) {
      toast({ title: "Erro", description: "Preencha todos os campos obrigatórios.", variant: "destructive" });
      return;
    }
    createMutation.mutate({ data: { memberId, counselorId, topic, startDate } });
  };

  const cases = data?.cases || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / 20);

  if (user?.role === "member") {
    return (
      <AppLayout breadcrumbs={[{ label: "Aconselhamento" }]}>
        <div className="text-center py-12 text-muted-foreground">
          <ShieldCheck className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p>Você não tem permissão para acessar este módulo.</p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout breadcrumbs={[{ label: "Aconselhamento" }]}>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ShieldCheck className="h-6 w-6" /> Aconselhamento Pastoral
        </h1>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground flex items-center gap-1"><Lock className="h-3 w-3" /> Confidencial</span>
          {isAdmin && (
            <button onClick={() => setShowModal(true)} className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm hover:bg-primary/90">
              <Plus className="h-4 w-4" /> Novo Caso
            </button>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="rounded-xl border bg-card p-4">
            <p className="text-xs text-muted-foreground">Abertos</p>
            <p className="text-2xl font-bold text-blue-600">{summary.openCases}</p>
          </div>
          <div className="rounded-xl border bg-card p-4">
            <p className="text-xs text-muted-foreground">Em Andamento</p>
            <p className="text-2xl font-bold text-yellow-600">{summary.inProgressCases}</p>
          </div>
          <div className="rounded-xl border bg-card p-4">
            <p className="text-xs text-muted-foreground">Encerrados</p>
            <p className="text-2xl font-bold">{summary.closedCases}</p>
          </div>
          <div className="rounded-xl border bg-card p-4">
            <p className="text-xs text-muted-foreground">Total Sessões</p>
            <p className="text-2xl font-bold">{summary.totalSessions}</p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3 mb-4">
        <select value={filterStatus} onChange={(e) => { setFilterStatus(e.target.value); setPage(1); }} className="border rounded-lg px-3 py-2 text-sm bg-background">
          <option value="">Todos os status</option>
          {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      {/* List */}
      {isLoading && <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>}

      {!isLoading && cases.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <ShieldCheck className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p>Nenhum caso registrado.</p>
        </div>
      )}

      {!isLoading && cases.length > 0 && (
        <div className="space-y-3">
          {cases.map((c: any) => (
            <div key={c.id} onClick={() => setLocation(`/counseling/${c.id}`)}
              className="rounded-xl border bg-card p-4 cursor-pointer hover:border-primary/40 transition-colors">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-semibold">{c.topic}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[c.status] || ""}`}>
                      {STATUS_LABELS[c.status] || c.status}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    Aconselhado: {c.memberName} | Conselheiro: {c.counselorName}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Início: {new Date(c.startDate + "T12:00:00").toLocaleDateString("pt-BR")}
                    {c.endDate && ` — Encerrado: ${new Date(c.endDate + "T12:00:00").toLocaleDateString("pt-BR")}`}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center gap-2 mt-6">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <button key={p} onClick={() => setPage(p)}
              className={`px-3 py-1 rounded-lg text-sm ${p === page ? "bg-primary text-primary-foreground" : "border hover:bg-muted"}`}>
              {p}
            </button>
          ))}
        </div>
      )}

      {/* Create Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center overflow-y-auto">
          <div className="bg-card rounded-2xl p-6 w-full max-w-lg shadow-xl my-8">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-lg">Novo Caso de Aconselhamento</h3>
              <button onClick={closeModal} className="p-2 hover:bg-muted rounded-lg"><X className="h-4 w-4" /></button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Aconselhado *</label>
                <MemberSelect value={memberId} onChange={(id) => setMemberId(id)} placeholder="Buscar membro..." />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Conselheiro *</label>
                <MemberSelect value={counselorId} onChange={(id) => setCounselorId(id)} placeholder="Buscar conselheiro..." />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Tema *</label>
                <input type="text" value={topic} onChange={(e) => setTopic(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm bg-background" placeholder="Ex: Luto, Conflito familiar..." />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Data de Início *</label>
                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm bg-background" />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={closeModal} className="px-4 py-2 border rounded-xl text-sm hover:bg-muted">Cancelar</button>
                <button type="submit" disabled={createMutation.isPending}
                  className="px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm hover:bg-primary/90 disabled:opacity-50">
                  {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Criar Caso"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
