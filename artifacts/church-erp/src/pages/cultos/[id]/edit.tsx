import { useEffect, useState } from "react";
import { useGetCultoDetail, useUpdateCulto } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useAuth } from "@/hooks/use-auth-context";
import { Redirect, useLocation, useParams } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { MemberSelect } from "@/components/MemberSelect";
import { SpecialElementsCheckboxes } from "../components/SpecialElementsCheckboxes";
import { BookMarked, Loader2 } from "lucide-react";

function toLocalInput(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function EditCultoPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const params = useParams();
  const [, setLocation] = useLocation();
  const id = params.id as string;

  const { data, isLoading } = useGetCultoDetail(id, { query: { enabled: !!id } });
  const updateMut = useUpdateCulto({
    mutation: {
      onSuccess: () => {
        toast({ title: "Culto atualizado" });
        setLocation(`/cultos/${id}`);
      },
    },
  });

  const culto = data as any;

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [location, setLocationField] = useState("");
  const [responsibleId, setResponsibleId] = useState("");
  const [responsibleName, setResponsibleName] = useState("");
  const [openingText, setOpeningText] = useState("");
  const [sermonTitle, setSermonTitle] = useState("");
  const [sermonReference, setSermonReference] = useState("");
  const [sermonNotes, setSermonNotes] = useState("");
  const [hasCommunion, setHasCommunion] = useState(false);
  const [hasBaptism, setHasBaptism] = useState(false);
  const [hasMemberReception, setHasMemberReception] = useState(false);
  const [status, setStatus] = useState<string>("agendado");

  useEffect(() => {
    if (!culto) return;
    setTitle(culto.title ?? "");
    setDescription(culto.description ?? "");
    setStartDate(toLocalInput(culto.startDate));
    setEndDate(toLocalInput(culto.endDate));
    setLocationField(culto.location ?? "");
    setResponsibleId(culto.responsibleId ?? "");
    setResponsibleName(culto.responsibleName ?? "");
    setOpeningText(culto.openingText ?? "");
    setSermonTitle(culto.sermonTitle ?? "");
    setSermonReference(culto.sermonReference ?? "");
    setSermonNotes(culto.sermonNotes ?? "");
    setHasCommunion(!!culto.hasCommunion);
    setHasBaptism(!!culto.hasBaptism);
    setHasMemberReception(!!culto.hasMemberReception);
    setStatus(culto.status ?? "agendado");
  }, [culto?.id]);

  if (user?.role === "member") return <Redirect to="/cultos" />;

  if (isLoading || !culto) {
    return (
      <AppLayout breadcrumbs={[{ label: "Cultos", href: "/cultos" }, { label: "Editar" }]}>
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
        title,
        description: description || null,
        startDate: new Date(startDate).toISOString(),
        endDate: new Date(endDate).toISOString(),
        location: location || null,
        responsibleId: responsibleId || null,
        status,
        openingText: openingText || null,
        sermonTitle: sermonTitle || null,
        sermonReference: sermonReference || null,
        sermonNotes: sermonNotes || null,
        hasCommunion,
        hasBaptism,
        hasMemberReception,
      } as any,
    });
  }

  function handleSpecialChange(field: "hasCommunion" | "hasBaptism" | "hasMemberReception", value: boolean) {
    if (field === "hasCommunion") setHasCommunion(value);
    if (field === "hasBaptism") setHasBaptism(value);
    if (field === "hasMemberReception") setHasMemberReception(value);
  }

  return (
    <AppLayout breadcrumbs={[{ label: "Cultos", href: "/cultos" }, { label: culto.title, href: `/cultos/${id}` }, { label: "Editar" }]}>
      <div className="mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <BookMarked className="h-6 w-6 text-primary" /> Editar Culto
        </h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6 max-w-3xl">
        <div className="bg-card rounded-2xl border p-6 space-y-4">
          <h3 className="font-semibold">Dados do Evento</h3>
          <div>
            <label className="text-sm font-medium">Título *</label>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} required
              className="w-full mt-1 px-3 py-2 border rounded-lg bg-background" />
          </div>
          <div>
            <label className="text-sm font-medium">Descrição</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2}
              className="w-full mt-1 px-3 py-2 border rounded-lg bg-background" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">Data e hora de início *</label>
              <input type="datetime-local" value={startDate} onChange={(e) => setStartDate(e.target.value)} required
                className="w-full mt-1 px-3 py-2 border rounded-lg bg-background" />
            </div>
            <div>
              <label className="text-sm font-medium">Data e hora de fim *</label>
              <input type="datetime-local" value={endDate} onChange={(e) => setEndDate(e.target.value)} required
                className="w-full mt-1 px-3 py-2 border rounded-lg bg-background" />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium">Local</label>
            <input type="text" value={location} onChange={(e) => setLocationField(e.target.value)}
              className="w-full mt-1 px-3 py-2 border rounded-lg bg-background" />
          </div>
          <div>
            <label className="text-sm font-medium">Responsável</label>
            <MemberSelect
              value={responsibleId}
              onChange={(id, name) => { setResponsibleId(id || ""); setResponsibleName(name || ""); }}
              initialName={responsibleName}
              placeholder="Selecionar responsável..."
            />
          </div>
          <div>
            <label className="text-sm font-medium">Status</label>
            <select value={status} onChange={(e) => setStatus(e.target.value)}
              className="w-full mt-1 px-3 py-2 border rounded-lg bg-background">
              <option value="agendado">Agendado</option>
              <option value="em_andamento">Em andamento</option>
              <option value="encerrado">Encerrado</option>
              <option value="cancelado">Cancelado</option>
            </select>
          </div>
        </div>

        <div className="bg-card rounded-2xl border p-6 space-y-4">
          <h3 className="font-semibold">Liturgia</h3>
          <div>
            <label className="text-sm font-medium">Texto de abertura</label>
            <textarea value={openingText} onChange={(e) => setOpeningText(e.target.value)} rows={3}
              className="w-full mt-1 px-3 py-2 border rounded-lg bg-background" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">Título da pregação</label>
              <input type="text" value={sermonTitle} onChange={(e) => setSermonTitle(e.target.value)}
                className="w-full mt-1 px-3 py-2 border rounded-lg bg-background" />
            </div>
            <div>
              <label className="text-sm font-medium">Texto bíblico</label>
              <input type="text" value={sermonReference} onChange={(e) => setSermonReference(e.target.value)}
                className="w-full mt-1 px-3 py-2 border rounded-lg bg-background"
                placeholder="Ex: Romanos 8:28-39" />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium">Notas da pregação</label>
            <textarea value={sermonNotes} onChange={(e) => setSermonNotes(e.target.value)} rows={3}
              className="w-full mt-1 px-3 py-2 border rounded-lg bg-background" />
          </div>
        </div>

        <div className="bg-card rounded-2xl border p-6">
          <SpecialElementsCheckboxes
            hasCommunion={hasCommunion}
            hasBaptism={hasBaptism}
            hasMemberReception={hasMemberReception}
            onChange={handleSpecialChange}
          />
        </div>

        <div className="flex justify-end gap-3">
          <button type="button" onClick={() => setLocation(`/cultos/${id}`)}
            className="px-4 py-2 border rounded-xl text-sm">Cancelar</button>
          <button type="submit" disabled={updateMut.isPending}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm flex items-center gap-2 disabled:opacity-50">
            {updateMut.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Salvar
          </button>
        </div>
      </form>
    </AppLayout>
  );
}
