import { useState } from "react";
import {
  useCreateVisitor, useUpdateVisitor, useListEvents,
} from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, Save } from "lucide-react";
import { MemberSelect } from "@/components/MemberSelect";
import { useFormErrorHandler, cleanFormPayload } from "@/hooks/use-form-errors";
import { FormErrorSummary } from "@/components/forms/FormErrorSummary";

const STATUS_OPTIONS = [
  { value: "recente", label: "Recente" },
  { value: "acompanhando", label: "Acompanhando" },
  { value: "sem_retorno", label: "Sem retorno" },
  { value: "nao_interessado", label: "Não interessado" },
];

const HOW_FOUND_SUGGESTIONS = ["Indicação", "Evento", "Internet", "Fachada da igreja", "Convite de membro"];

const formSchema = z.object({
  fullName: z.string().min(2, "Nome é obrigatório"),
  phone: z.string().optional(),
  email: z.string().email("E-mail inválido").optional().or(z.literal("")),
  dateOfBirth: z.string().optional(),
  addressCity: z.string().optional(),
  addressState: z.string().optional(),
  howFoundUs: z.string().optional(),
  firstVisitDate: z.string().min(1, "Data da primeira visita é obrigatória"),
  firstVisitEventId: z.string().optional(),
  status: z.enum(["recente", "acompanhando", "sem_retorno", "nao_interessado"]).default("recente"),
  assignedToMemberId: z.string().optional(),
  notes: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

interface VisitorFormProps {
  initialData?: any;
  isEditing?: boolean;
}

export function VisitorForm({ initialData, isEditing = false }: VisitorFormProps) {
  const [, setLocation] = useLocation();
  const onInvalid = useFormErrorHandler();

  const createMut = useCreateVisitor();
  const updateMut = useUpdateVisitor();

  const { data: eventsData } = useListEvents({ limit: 100 });
  const events = (eventsData?.events || []) as any[];

  const [assignedName, setAssignedName] = useState<string>(initialData?.assignedToMemberName || "");

  const { register, handleSubmit, formState: { errors }, watch, setValue } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      fullName: initialData?.fullName || "",
      phone: initialData?.phone || "",
      email: initialData?.email || "",
      dateOfBirth: initialData?.dateOfBirth ? initialData.dateOfBirth.split("T")[0] : "",
      addressCity: initialData?.addressCity || "",
      addressState: initialData?.addressState || "",
      howFoundUs: initialData?.howFoundUs || "",
      firstVisitDate: initialData?.firstVisitDate
        ? initialData.firstVisitDate.split("T")[0]
        : new Date().toISOString().slice(0, 10),
      firstVisitEventId: initialData?.firstVisitEventId || "",
      status: initialData?.status || "recente",
      assignedToMemberId: initialData?.assignedToMemberId || "",
      notes: initialData?.notes || "",
    },
  });

  const assignedToMemberId = watch("assignedToMemberId");

  function onSubmit(values: FormValues) {
    if (isEditing && initialData) {
      // PUT rejeita firstVisitDate/firstVisitEventId — strip
      const { firstVisitDate: _fvd, firstVisitEventId: _fve, ...rest } = values;
      updateMut.mutate(
        { id: initialData.id, data: cleanFormPayload(rest) as any },
        { onSuccess: () => setLocation(`/visitors/${initialData.id}`) },
      );
    } else {
      createMut.mutate(
        { data: cleanFormPayload(values) as any },
        { onSuccess: (visitor: any) => setLocation(`/visitors/${visitor.id}`) },
      );
    }
  }

  const isPending = createMut.isPending || updateMut.isPending;

  return (
    <form onSubmit={handleSubmit(onSubmit, onInvalid)} className="space-y-6" noValidate>
      <FormErrorSummary errors={errors} />

      <div className="bg-card rounded-2xl border p-6 space-y-4">
        <h3 className="font-semibold">Identificação</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className="text-sm font-medium">Nome completo *</label>
            <input {...register("fullName")} className="w-full mt-1 px-3 py-2 border rounded-lg bg-background" />
          </div>
          <div>
            <label className="text-sm font-medium">Telefone</label>
            <input {...register("phone")} className="w-full mt-1 px-3 py-2 border rounded-lg bg-background" placeholder="(11) 99999-9999" />
          </div>
          <div>
            <label className="text-sm font-medium">E-mail</label>
            <input type="email" {...register("email")} className="w-full mt-1 px-3 py-2 border rounded-lg bg-background" />
          </div>
          <div>
            <label className="text-sm font-medium">Data de Nascimento</label>
            <input type="date" {...register("dateOfBirth")} className="w-full mt-1 px-3 py-2 border rounded-lg bg-background" />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2">
              <label className="text-sm font-medium">Cidade</label>
              <input {...register("addressCity")} className="w-full mt-1 px-3 py-2 border rounded-lg bg-background" />
            </div>
            <div>
              <label className="text-sm font-medium">UF</label>
              <input {...register("addressState")} maxLength={2} className="w-full mt-1 px-3 py-2 border rounded-lg bg-background uppercase" />
            </div>
          </div>
        </div>
      </div>

      <div className="bg-card rounded-2xl border p-6 space-y-4">
        <h3 className="font-semibold">Contexto da visita</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium">
              {isEditing ? "Primeira visita (somente leitura)" : "Data da primeira visita *"}
            </label>
            <input
              type="date"
              {...register("firstVisitDate")}
              disabled={isEditing}
              className="w-full mt-1 px-3 py-2 border rounded-lg bg-background disabled:opacity-50 disabled:cursor-not-allowed"
            />
            {isEditing && (
              <p className="text-xs text-muted-foreground mt-1">
                Para alterar, edite as visitas individuais.
              </p>
            )}
          </div>
          <div>
            <label className="text-sm font-medium">
              {isEditing ? "Evento (somente leitura)" : "Evento (opcional)"}
            </label>
            <select
              {...register("firstVisitEventId")}
              disabled={isEditing}
              className="w-full mt-1 px-3 py-2 border rounded-lg bg-background disabled:opacity-50"
            >
              <option value="">Nenhum</option>
              {events.map((e) => (
                <option key={e.id} value={e.id}>{e.title} · {new Date(e.startDate).toLocaleDateString("pt-BR")}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium">Como nos conheceu</label>
            <input
              list="howFoundUs-options"
              {...register("howFoundUs")}
              className="w-full mt-1 px-3 py-2 border rounded-lg bg-background"
              placeholder="Indicação, evento…"
            />
            <datalist id="howFoundUs-options">
              {HOW_FOUND_SUGGESTIONS.map((s) => <option key={s} value={s} />)}
            </datalist>
          </div>
          <div>
            <label className="text-sm font-medium">Status</label>
            <select {...register("status")} className="w-full mt-1 px-3 py-2 border rounded-lg bg-background">
              {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="text-sm font-medium">Responsável pelo acompanhamento</label>
            <div className="mt-1">
              <MemberSelect
                value={assignedToMemberId || ""}
                initialName={assignedName}
                onChange={(id, name) => {
                  setValue("assignedToMemberId", id);
                  setAssignedName(name);
                }}
              />
            </div>
            <p className="text-xs text-muted-foreground mt-1">Será notificado por sino ao salvar.</p>
          </div>
          <div className="sm:col-span-2">
            <label className="text-sm font-medium">Observações</label>
            <textarea {...register("notes")} rows={3} className="w-full mt-1 px-3 py-2 border rounded-lg bg-background" />
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-3">
        <button type="button" onClick={() => setLocation("/visitors")} className="px-4 py-2 border rounded-xl text-sm">
          Cancelar
        </button>
        <button
          type="submit"
          disabled={isPending}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm flex items-center gap-2 disabled:opacity-50"
        >
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {isEditing ? "Salvar alterações" : "Cadastrar visitante"}
        </button>
      </div>
    </form>
  );
}
