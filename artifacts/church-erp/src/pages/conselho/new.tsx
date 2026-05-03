import { useState } from "react";
import { useCreateCouncilMeeting } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useAuth } from "@/hooks/use-auth-context";
import { Redirect, useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { AtaUploader } from "./components/AtaUploader";
import { Gavel, Loader2 } from "lucide-react";

export default function NewConselhoPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const [meetingDate, setMeetingDate] = useState(new Date().toISOString().slice(0, 10));
  const [title, setTitle] = useState("");
  const [agenda, setAgenda] = useState("");
  const [summary, setSummary] = useState("");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState<"agendada" | "realizada" | "cancelada">("agendada");
  const [ataMediaId, setAtaMediaId] = useState<string | null>(null);
  const [ataTitle, setAtaTitle] = useState<string | null>(null);

  const createMut = useCreateCouncilMeeting({
    mutation: {
      onSuccess: (created: any) => {
        toast({ title: "Reunião criada" });
        setLocation(`/conselho/${created.id}`);
      },
    },
  });

  if (user?.role !== "admin") return <Redirect to="/conselho" />;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!meetingDate || !title.trim()) {
      toast({ title: "Campos obrigatórios", description: "Data e título são obrigatórios.", variant: "destructive" });
      return;
    }
    createMut.mutate({
      data: {
        meetingDate,
        title: title.trim(),
        agenda: agenda || undefined,
        summary: summary || undefined,
        notes: notes || undefined,
        status,
        ataMediaId: ataMediaId || undefined,
      } as any,
    });
  }

  return (
    <AppLayout breadcrumbs={[{ label: "Conselho", href: "/conselho" }, { label: "Nova Reunião" }]}>
      <div className="mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Gavel className="h-6 w-6 text-primary" /> Nova Reunião
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Cadastre os dados da reunião. Itens da pauta podem ser adicionados depois no detalhe.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6 max-w-3xl">
        <div className="bg-card rounded-2xl border p-6 space-y-4">
          <h3 className="font-semibold">Dados da Reunião</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">Data *</label>
              <input
                type="date"
                value={meetingDate}
                onChange={(e) => setMeetingDate(e.target.value)}
                required
                className="w-full mt-1 px-3 py-2 border rounded-lg bg-background"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as any)}
                className="w-full mt-1 px-3 py-2 border rounded-lg bg-background"
              >
                <option value="agendada">Agendada</option>
                <option value="realizada">Realizada</option>
                <option value="cancelada">Cancelada</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-sm font-medium">Título *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              placeholder="Ex: Reunião Ordinária — Janeiro 2026"
              className="w-full mt-1 px-3 py-2 border rounded-lg bg-background"
            />
          </div>
          <div>
            <label className="text-sm font-medium">Pauta</label>
            <textarea
              value={agenda}
              onChange={(e) => setAgenda(e.target.value)}
              rows={5}
              placeholder="1. Aprovação da ata anterior&#10;2. Relatório financeiro&#10;3. Avaliação ministerial..."
              className="w-full mt-1 px-3 py-2 border rounded-lg bg-background font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Markdown aceito. Itens individuais detalhados podem ser adicionados depois.
            </p>
          </div>
          <div>
            <label className="text-sm font-medium">Resumo</label>
            <textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              rows={4}
              placeholder="Resumo das decisões e pontos principais..."
              className="w-full mt-1 px-3 py-2 border rounded-lg bg-background"
            />
          </div>
          <div>
            <label className="text-sm font-medium">Observações</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full mt-1 px-3 py-2 border rounded-lg bg-background"
            />
          </div>
        </div>

        <div className="bg-card rounded-2xl border p-6 space-y-3">
          <h3 className="font-semibold">Ata da Reunião</h3>
          <p className="text-xs text-muted-foreground">
            Anexe o documento oficial em PDF, DOC ou DOCX. Opcional ao criar — pode anexar depois.
          </p>
          <AtaUploader
            currentMediaId={ataMediaId}
            currentTitle={ataTitle}
            onUploaded={(id, t) => { setAtaMediaId(id); setAtaTitle(t); }}
            onClear={() => { setAtaMediaId(null); setAtaTitle(null); }}
          />
        </div>

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={() => setLocation("/conselho")}
            className="px-4 py-2 border rounded-xl text-sm"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={createMut.isPending}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm flex items-center gap-2 disabled:opacity-50"
          >
            {createMut.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Criar Reunião
          </button>
        </div>
      </form>
    </AppLayout>
  );
}
