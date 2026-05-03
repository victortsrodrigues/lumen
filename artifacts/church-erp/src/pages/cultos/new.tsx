import { useState } from "react";
import { useCreateCulto } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useAuth } from "@/hooks/use-auth-context";
import { Redirect, useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { MemberSelect } from "@/components/MemberSelect";
import { SpecialElementsCheckboxes } from "./components/SpecialElementsCheckboxes";
import { BookMarked, Loader2 } from "lucide-react";

export default function NewCultoPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

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

  const createMut = useCreateCulto({
    mutation: {
      onSuccess: (created: any) => {
        toast({ title: "Culto criado", description: "Adicione músicas e escala na próxima tela." });
        setLocation(`/cultos/${created.id}`);
      },
    },
  });

  if (user?.role === "member") return <Redirect to="/cultos" />;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title || !startDate || !endDate) {
      toast({
        title: "Campos obrigatórios",
        description: "Preencha título, data de início e data de fim.",
        variant: "destructive",
      });
      return;
    }
    createMut.mutate({
      data: {
        title,
        description: description || undefined,
        startDate: new Date(startDate).toISOString(),
        endDate: new Date(endDate).toISOString(),
        location: location || undefined,
        responsibleId: responsibleId || undefined,
        openingText: openingText || undefined,
        sermonTitle: sermonTitle || undefined,
        sermonReference: sermonReference || undefined,
        sermonNotes: sermonNotes || undefined,
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
    <AppLayout breadcrumbs={[{ label: "Cultos", href: "/cultos" }, { label: "Novo Culto" }]}>
      <div className="mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <BookMarked className="h-6 w-6 text-primary" /> Novo Culto
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Crie um culto na agenda. Você poderá adicionar músicas, escala e frequência depois.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6 max-w-3xl">
        {/* Bloco 1: Evento */}
        <div className="bg-card rounded-2xl border p-6 space-y-4">
          <h3 className="font-semibold">Dados do Evento</h3>
          <div>
            <label className="text-sm font-medium">Título *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full mt-1 px-3 py-2 border rounded-lg bg-background"
              placeholder="Ex: Culto Matutino — Ceia"
              required
            />
          </div>
          <div>
            <label className="text-sm font-medium">Descrição</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full mt-1 px-3 py-2 border rounded-lg bg-background"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">Data e hora de início *</label>
              <input
                type="datetime-local"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full mt-1 px-3 py-2 border rounded-lg bg-background"
                required
              />
            </div>
            <div>
              <label className="text-sm font-medium">Data e hora de fim *</label>
              <input
                type="datetime-local"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full mt-1 px-3 py-2 border rounded-lg bg-background"
                required
              />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium">Local</label>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocationField(e.target.value)}
              className="w-full mt-1 px-3 py-2 border rounded-lg bg-background"
              placeholder="Ex: Templo, Salão Principal"
            />
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
        </div>

        {/* Bloco 2: Liturgia */}
        <div className="bg-card rounded-2xl border p-6 space-y-4">
          <h3 className="font-semibold">Liturgia</h3>
          <div>
            <label className="text-sm font-medium">Texto de abertura</label>
            <textarea
              value={openingText}
              onChange={(e) => setOpeningText(e.target.value)}
              rows={3}
              className="w-full mt-1 px-3 py-2 border rounded-lg bg-background"
              placeholder="Saudação inicial, leitura responsiva..."
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">Título da pregação</label>
              <input
                type="text"
                value={sermonTitle}
                onChange={(e) => setSermonTitle(e.target.value)}
                className="w-full mt-1 px-3 py-2 border rounded-lg bg-background"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Texto bíblico</label>
              <input
                type="text"
                value={sermonReference}
                onChange={(e) => setSermonReference(e.target.value)}
                className="w-full mt-1 px-3 py-2 border rounded-lg bg-background"
                placeholder="Ex: Romanos 8:28-39"
              />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium">Notas da pregação</label>
            <textarea
              value={sermonNotes}
              onChange={(e) => setSermonNotes(e.target.value)}
              rows={3}
              className="w-full mt-1 px-3 py-2 border rounded-lg bg-background"
              placeholder="Esboço, pontos principais..."
            />
          </div>
        </div>

        {/* Bloco 3: Elementos especiais */}
        <div className="bg-card rounded-2xl border p-6">
          <SpecialElementsCheckboxes
            hasCommunion={hasCommunion}
            hasBaptism={hasBaptism}
            hasMemberReception={hasMemberReception}
            onChange={handleSpecialChange}
          />
        </div>

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={() => setLocation("/cultos")}
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
            Criar Culto
          </button>
        </div>
      </form>
    </AppLayout>
  );
}
