import { useEffect, useState } from "react";
import {
  useGetCouncilMeetingDetail, useUpdateCouncilMeeting,
} from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useAuth } from "@/hooks/use-auth-context";
import { Redirect, useLocation, useParams } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { Gavel, Loader2 } from "lucide-react";

export default function EditConselhoPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const params = useParams();
  const [, setLocation] = useLocation();
  const id = params.id as string;

  const { data, isLoading } = useGetCouncilMeetingDetail(id, { query: { enabled: !!id } });
  const updateMut = useUpdateCouncilMeeting({
    mutation: {
      onSuccess: () => {
        toast({ title: "Reunião atualizada" });
        setLocation(`/conselho/${id}`);
      },
    },
  });

  const meeting = data as any;

  const [meetingDate, setMeetingDate] = useState("");
  const [title, setTitle] = useState("");
  const [agenda, setAgenda] = useState("");
  const [summary, setSummary] = useState("");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState<"agendada" | "realizada" | "cancelada">("agendada");

  useEffect(() => {
    if (!meeting) return;
    setMeetingDate(meeting.meetingDate ?? "");
    setTitle(meeting.title ?? "");
    setAgenda(meeting.agenda ?? "");
    setSummary(meeting.summary ?? "");
    setNotes(meeting.notes ?? "");
    setStatus(meeting.status ?? "agendada");
  }, [meeting?.id]);

  if (user?.role !== "admin") return <Redirect to="/conselho" />;

  if (isLoading || !meeting) {
    return (
      <AppLayout breadcrumbs={[{ label: "Conselho", href: "/conselho" }, { label: "Editar" }]}>
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    updateMut.mutate({
      id,
      data: {
        meetingDate,
        title,
        agenda: agenda || null,
        summary: summary || null,
        notes: notes || null,
        status,
      } as any,
    });
  }

  return (
    <AppLayout breadcrumbs={[{ label: "Conselho", href: "/conselho" }, { label: meeting.title, href: `/conselho/${id}` }, { label: "Editar" }]}>
      <div className="mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Gavel className="h-6 w-6 text-primary" /> Editar Reunião
        </h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6 max-w-3xl">
        <div className="bg-card rounded-2xl border p-6 space-y-4">
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
              className="w-full mt-1 px-3 py-2 border rounded-lg bg-background"
            />
          </div>
          <div>
            <label className="text-sm font-medium">Pauta</label>
            <textarea
              value={agenda}
              onChange={(e) => setAgenda(e.target.value)}
              rows={5}
              className="w-full mt-1 px-3 py-2 border rounded-lg bg-background font-mono text-sm"
            />
          </div>
          <div>
            <label className="text-sm font-medium">Resumo</label>
            <textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              rows={4}
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

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={() => setLocation(`/conselho/${id}`)}
            className="px-4 py-2 border rounded-xl text-sm"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={updateMut.isPending}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm flex items-center gap-2 disabled:opacity-50"
          >
            {updateMut.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Salvar
          </button>
        </div>
      </form>
    </AppLayout>
  );
}
