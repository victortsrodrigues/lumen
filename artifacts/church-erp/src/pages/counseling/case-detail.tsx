import { useState } from "react";
import {
  useGetCounselingCaseDetail, useUpdateCounselingCase, useCreateCounselingSession,
} from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth-context";
import { useParams } from "wouter";
import {
  ShieldCheck, Plus, Loader2, X, Lock, Calendar, Clock, FileText, CheckCircle2,
} from "lucide-react";

const STATUS_LABELS: Record<string, string> = {
  aberto: "Aberto", em_andamento: "Em Andamento", encerrado: "Encerrado",
};

const STATUS_COLORS: Record<string, string> = {
  aberto: "bg-blue-100 text-blue-800",
  em_andamento: "bg-yellow-100 text-yellow-800",
  encerrado: "bg-slate-100 text-slate-800",
};

export default function CounselingCaseDetail() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const params = useParams<{ id: string }>();
  const id = params.id!;
  const isMember = user?.role === "member";

  const [showSessionModal, setShowSessionModal] = useState(false);
  const [sessionDate, setSessionDate] = useState("");
  const [sessionNotes, setSessionNotes] = useState("");
  const [sessionDuration, setSessionDuration] = useState("");

  const { data: caseData, isLoading } = useGetCounselingCaseDetail(id);

  const invalidate = () => {
    queryClient.invalidateQueries({ predicate: (q) => (q.queryKey[0] as string)?.startsWith?.("/api/counseling") });
  };

  const updateMutation = useUpdateCounselingCase({
    mutation: {
      onSuccess: () => { invalidate(); toast({ title: "Sucesso", description: "Caso atualizado." }); },
      onError: (err: any) => { toast({ title: "Erro", description: err?.response?.data?.message || "Falha.", variant: "destructive" }); },
    },
  });

  const createSessionMutation = useCreateCounselingSession({
    mutation: {
      onSuccess: () => {
        invalidate();
        toast({ title: "Sucesso", description: "Sessão registrada." });
        setShowSessionModal(false);
        setSessionDate(""); setSessionNotes(""); setSessionDuration("");
      },
      onError: (err: any) => { toast({ title: "Erro", description: err?.response?.data?.message || "Falha.", variant: "destructive" }); },
    },
  });

  const handleAddSession = (e: React.FormEvent) => {
    e.preventDefault();
    if (!sessionDate) {
      toast({ title: "Erro", description: "Data é obrigatória.", variant: "destructive" });
      return;
    }
    createSessionMutation.mutate({
      id,
      data: {
        date: sessionDate,
        notes: sessionNotes || undefined,
        durationMinutes: sessionDuration ? parseInt(sessionDuration) : undefined,
      },
    });
  };

  if (isMember) {
    return (
      <AppLayout breadcrumbs={[{ label: "Aconselhamento", href: "/counseling" }, { label: "Sem permissão" }]}>
        <div className="text-center py-12 text-muted-foreground">
          <ShieldCheck className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p>Você não tem permissão para acessar este módulo.</p>
        </div>
      </AppLayout>
    );
  }

  if (isLoading) {
    return (
      <AppLayout breadcrumbs={[{ label: "Aconselhamento", href: "/counseling" }, { label: "Carregando..." }]}>
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
      </AppLayout>
    );
  }

  if (!caseData) {
    return (
      <AppLayout breadcrumbs={[{ label: "Aconselhamento", href: "/counseling" }, { label: "Não encontrado" }]}>
        <p className="text-center py-12 text-muted-foreground">Caso não encontrado.</p>
      </AppLayout>
    );
  }

  const sessions = caseData.sessions || [];
  const isEncerrado = caseData.status === "encerrado";

  return (
    <AppLayout breadcrumbs={[{ label: "Aconselhamento", href: "/counseling" }, { label: caseData.topic }]}>
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <ShieldCheck className="h-6 w-6" />
              <h1 className="text-2xl font-bold">{caseData.topic}</h1>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[caseData.status] || ""}`}>
                {STATUS_LABELS[caseData.status] || caseData.status}
              </span>
            </div>
            <p className="text-sm text-muted-foreground flex items-center gap-1">
              <Lock className="h-3 w-3" /> Confidencial
            </p>
          </div>
          <div className="flex gap-2">
            {!isEncerrado && (
              <>
                <button onClick={() => setShowSessionModal(true)} className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm hover:bg-primary/90">
                  <Plus className="h-4 w-4" /> Nova Sessão
                </button>
                <button onClick={() => updateMutation.mutate({ id, data: { status: "encerrado" } })}
                  className="flex items-center gap-2 px-4 py-2 border rounded-xl text-sm hover:bg-muted">
                  <CheckCircle2 className="h-4 w-4" /> Encerrar
                </button>
              </>
            )}
          </div>
        </div>

        {/* Case Info */}
        <div className="rounded-xl border bg-card p-4 mb-6">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">Aconselhado</p>
              <p className="font-medium">{caseData.memberName}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Conselheiro</p>
              <p className="font-medium">{caseData.counselorName}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Início</p>
              <p className="font-medium">{new Date(caseData.startDate + "T12:00:00").toLocaleDateString("pt-BR")}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Encerramento</p>
              <p className="font-medium">{caseData.endDate ? new Date(caseData.endDate + "T12:00:00").toLocaleDateString("pt-BR") : "—"}</p>
            </div>
          </div>
        </div>

        {/* Sessions Timeline */}
        <h2 className="text-lg font-semibold mb-4">Sessões ({sessions.length})</h2>

        {sessions.length === 0 && (
          <div className="text-center py-8 text-muted-foreground border rounded-xl">
            <FileText className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p>Nenhuma sessão registrada.</p>
          </div>
        )}

        <div className="space-y-3">
          {sessions.map((s: any, i: number) => (
            <div key={s.id} className="rounded-xl border bg-card p-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                <Calendar className="h-4 w-4" />
                <span>{new Date(s.date + "T12:00:00").toLocaleDateString("pt-BR")}</span>
                {s.durationMinutes && (
                  <>
                    <Clock className="h-4 w-4 ml-2" />
                    <span>{s.durationMinutes} min</span>
                  </>
                )}
                <span className="ml-auto text-xs">Sessão #{sessions.length - i}</span>
              </div>
              {s.notes && <p className="text-sm whitespace-pre-wrap">{s.notes}</p>}
              {!s.notes && <p className="text-sm text-muted-foreground italic">Sem anotações.</p>}
            </div>
          ))}
        </div>
      </div>

      {/* Add Session Modal */}
      {showSessionModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center overflow-y-auto">
          <div className="bg-card rounded-2xl p-6 w-full max-w-md shadow-xl my-8">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-lg">Nova Sessão</h3>
              <button onClick={() => setShowSessionModal(false)} className="p-2 hover:bg-muted rounded-lg"><X className="h-4 w-4" /></button>
            </div>
            <form onSubmit={handleAddSession} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Data *</label>
                <input type="date" value={sessionDate} onChange={(e) => setSessionDate(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm bg-background" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Duração (minutos)</label>
                <input type="number" value={sessionDuration} onChange={(e) => setSessionDuration(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm bg-background" placeholder="Ex: 60" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Anotações</label>
                <textarea value={sessionNotes} onChange={(e) => setSessionNotes(e.target.value)} rows={4} className="w-full border rounded-lg px-3 py-2 text-sm bg-background resize-none" placeholder="Anotações confidenciais da sessão..." />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowSessionModal(false)} className="px-4 py-2 border rounded-xl text-sm hover:bg-muted">Cancelar</button>
                <button type="submit" disabled={createSessionMutation.isPending}
                  className="px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm hover:bg-primary/90 disabled:opacity-50">
                  {createSessionMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Registrar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
