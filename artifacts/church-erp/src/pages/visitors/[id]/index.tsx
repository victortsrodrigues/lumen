import { useState } from "react";
import {
  useGetVisitor, useDeleteVisitor, useAddVisitorVisit, useRemoveVisitorVisit,
} from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useAuth } from "@/hooks/use-auth-context";
import { Link, Redirect, useLocation, useParams } from "wouter";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Loader2, User, Calendar, Phone, Mail, MapPin, Edit2, Trash2,
  ArrowRight, Plus, AlertTriangle, Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ConvertVisitorModal } from "../components/ConvertVisitorModal";

const STATUS_LABELS: Record<string, string> = {
  recente: "Recente",
  acompanhando: "Acompanhando",
  sem_retorno: "Sem retorno",
  nao_interessado: "Não interessado",
};
const STATUS_COLORS: Record<string, string> = {
  recente: "bg-blue-100 text-blue-700 border-blue-200",
  acompanhando: "bg-amber-100 text-amber-700 border-amber-200",
  sem_retorno: "bg-slate-100 text-slate-700 border-slate-200",
  nao_interessado: "bg-red-100 text-red-700 border-red-200",
};

export default function VisitorDetail() {
  const { user } = useAuth();
  const params = useParams();
  const [, setLocation] = useLocation();
  const id = params.id as string;
  const isAdmin = user?.role === "admin";

  const [showConvert, setShowConvert] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [showAddVisit, setShowAddVisit] = useState(false);
  const [newVisitDate, setNewVisitDate] = useState(new Date().toISOString().slice(0, 10));
  const [newVisitNotes, setNewVisitNotes] = useState("");

  const { data: visitor, isLoading } = useGetVisitor(id, { query: { enabled: !!id } });
  const deleteMut = useDeleteVisitor();
  const addVisitMut = useAddVisitorVisit();
  const removeVisitMut = useRemoveVisitorVisit();

  if (user?.role === "member") return <Redirect to="/" />;

  if (isLoading) {
    return (
      <AppLayout breadcrumbs={[{ label: "Visitantes", href: "/visitors" }, { label: "Detalhe" }]}>
        <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
      </AppLayout>
    );
  }

  if (!visitor) {
    return (
      <AppLayout breadcrumbs={[{ label: "Visitantes", href: "/visitors" }, { label: "Detalhe" }]}>
        <div className="text-center py-12 text-muted-foreground">Visitante não encontrado.</div>
      </AppLayout>
    );
  }

  const v = visitor as any;
  const visits: any[] = v.visits || [];

  function handleAddVisit() {
    addVisitMut.mutate(
      { id, data: { visitDate: newVisitDate, notes: newVisitNotes || undefined } },
      {
        onSuccess: () => {
          setShowAddVisit(false);
          setNewVisitNotes("");
          setNewVisitDate(new Date().toISOString().slice(0, 10));
        },
      },
    );
  }

  return (
    <AppLayout breadcrumbs={[{ label: "Visitantes", href: "/visitors" }, { label: v.fullName }]}>
      {/* Header */}
      <div className="bg-card rounded-3xl border p-6 mb-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-primary/10 text-primary flex items-center justify-center">
              <User className="w-8 h-8" />
            </div>
            <div>
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-2xl font-bold">{v.fullName}</h1>
                <span className={cn("text-xs px-2 py-1 rounded-full font-medium border", STATUS_COLORS[v.status])}>
                  {STATUS_LABELS[v.status]}
                </span>
              </div>
              {v.assignedToMemberName && (
                <p className="text-sm text-muted-foreground mt-1">
                  Acompanhado por <strong className="text-foreground">{v.assignedToMemberName}</strong>
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Link href={`/visitors/${id}/edit`} className="flex items-center gap-2 px-4 py-2 border rounded-xl text-sm hover:bg-muted">
              <Edit2 className="h-4 w-4" /> Editar
            </Link>
            {isAdmin && (
              <>
                <button
                  onClick={() => setShowConvert(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm hover:opacity-90"
                >
                  <ArrowRight className="h-4 w-4" /> Converter em Membro
                </button>
                <button
                  onClick={() => setShowDelete(true)}
                  className="p-2.5 rounded-xl text-destructive hover:bg-destructive/10"
                  title="Excluir"
                >
                  <Trash2 className="h-5 w-5" />
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Dados */}
        <div className="bg-card rounded-2xl border p-6 space-y-4">
          <h3 className="font-semibold">Dados pessoais</h3>
          <div className="space-y-2 text-sm">
            {v.phone && <p className="flex items-center gap-2"><Phone className="h-4 w-4 text-muted-foreground" /> {v.phone}</p>}
            {v.email && <p className="flex items-center gap-2"><Mail className="h-4 w-4 text-muted-foreground" /> {v.email}</p>}
            {v.dateOfBirth && (
              <p className="flex items-center gap-2"><Calendar className="h-4 w-4 text-muted-foreground" /> {format(new Date(v.dateOfBirth), "dd/MM/yyyy")}</p>
            )}
            {(v.addressCity || v.addressState) && (
              <p className="flex items-center gap-2"><MapPin className="h-4 w-4 text-muted-foreground" /> {[v.addressCity, v.addressState].filter(Boolean).join(" / ")}</p>
            )}
            {v.howFoundUs && (
              <p className="text-muted-foreground">Como conheceu: <span className="text-foreground">{v.howFoundUs}</span></p>
            )}
            {v.notes && (
              <p className="text-muted-foreground border-t pt-3 mt-3 whitespace-pre-wrap">{v.notes}</p>
            )}
          </div>
        </div>

        {/* Timeline */}
        <div className="bg-card rounded-2xl border p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">Histórico de visitas ({visits.length})</h3>
            <button
              onClick={() => setShowAddVisit(true)}
              className="flex items-center gap-1 text-sm text-primary hover:underline"
            >
              <Plus className="h-4 w-4" /> Adicionar
            </button>
          </div>
          <div className="space-y-3">
            {visits.length === 0 && <p className="text-sm text-muted-foreground">Sem visitas registradas.</p>}
            {visits.map((vis) => (
              <div key={vis.id} className="flex items-start gap-3 p-3 rounded-lg bg-muted/40">
                <Clock className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">{format(new Date(vis.visitDate), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}</p>
                  {vis.eventTitle && <p className="text-xs text-muted-foreground">📅 {vis.eventTitle}</p>}
                  {vis.notes && <p className="text-xs text-muted-foreground mt-1">{vis.notes}</p>}
                </div>
                {visits.length > 1 && (
                  <button
                    onClick={() => removeVisitMut.mutate({ id, visitId: vis.id })}
                    disabled={removeVisitMut.isPending}
                    className="p-1 text-muted-foreground hover:text-destructive shrink-0"
                    title="Remover visita"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Add visit modal */}
      {showAddVisit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowAddVisit(false)}>
          <div className="bg-card rounded-xl border shadow-xl w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="p-6">
              <h2 className="text-lg font-bold mb-4">Adicionar Visita</h2>
              <div className="space-y-3">
                <div>
                  <label className="text-sm font-medium">Data</label>
                  <input type="date" value={newVisitDate} onChange={(e) => setNewVisitDate(e.target.value)} className="w-full mt-1 px-3 py-2 border rounded-lg bg-background" />
                </div>
                <div>
                  <label className="text-sm font-medium">Observações</label>
                  <textarea value={newVisitNotes} onChange={(e) => setNewVisitNotes(e.target.value)} rows={3} className="w-full mt-1 px-3 py-2 border rounded-lg bg-background" />
                </div>
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button onClick={() => setShowAddVisit(false)} className="px-4 py-2 border rounded-xl text-sm">Cancelar</button>
                <button onClick={handleAddVisit} disabled={addVisitMut.isPending} className="px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm disabled:opacity-50">
                  {addVisitMut.isPending ? "Salvando..." : "Adicionar"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Convert modal */}
      {showConvert && <ConvertVisitorModal visitor={v} onClose={() => setShowConvert(false)} />}

      {/* Delete modal */}
      {showDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowDelete(false)}>
          <div className="bg-card rounded-xl border shadow-xl w-full max-w-sm mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 text-center">
              <AlertTriangle className="h-12 w-12 text-destructive mx-auto mb-4" />
              <h2 className="text-lg font-bold mb-2">Excluir Visitante</h2>
              <p className="text-sm text-muted-foreground mb-6">Tem certeza que deseja excluir o visitante {v.fullName}?</p>
              <div className="flex justify-center gap-3">
                <button onClick={() => setShowDelete(false)} className="px-4 py-2 border rounded-xl text-sm">Cancelar</button>
                <button
                  onClick={() => deleteMut.mutate({ id }, { onSuccess: () => setLocation("/visitors") })}
                  disabled={deleteMut.isPending}
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
