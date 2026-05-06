import { useState, useEffect, useRef } from "react";
import { useGetOwnProfile, useUpdateOwnProfile, useLookupCep, useRequestUploadUrl } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { cleanFormPayload } from "@/hooks/use-form-errors";
import {
  User, Loader2, Save, Mail, Phone, MapPin, Calendar, Edit2, X, UploadCloud,
} from "lucide-react";

const SEX_LABELS: Record<string, string> = {
  masculino: "Masculino", feminino: "Feminino",
};

function formatDate(v?: string | null): string {
  if (!v) return "—";
  const d = new Date(v + (v.length === 10 ? "T12:00:00" : ""));
  return d.toLocaleDateString("pt-BR");
}

// Format phone as (XX) XXXXX-XXXX
function formatPhone(digits: string): string {
  const d = digits.replace(/\D/g, "").slice(0, 11);
  if (d.length === 0) return "";
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

const EMPTY_FORM = {
  fullName: "", dateOfBirth: "", sex: "", phone: "",
  addressZip: "", addressStreet: "", addressNumber: "", addressComplement: "",
  addressNeighborhood: "", addressCity: "", addressState: "",
  maritalStatus: "", academicEducation: "", profession: "",
};

export default function ProfilePage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: profile, isLoading } = useGetOwnProfile();

  const [isEditing, setIsEditing] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [cepToLookup, setCepToLookup] = useState("");

  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: cepData } = useLookupCep(cepToLookup, { query: { enabled: cepToLookup.length === 8 } });
  const { mutateAsync: requestUploadUrl } = useRequestUploadUrl();

  useEffect(() => {
    if (cepData && isEditing) {
      setForm(f => ({
        ...f,
        addressStreet: cepData.street || f.addressStreet,
        addressNeighborhood: cepData.neighborhood || f.addressNeighborhood,
        addressCity: cepData.city || f.addressCity,
        addressState: cepData.state || f.addressState,
      }));
    }
  }, [cepData]);

  const currentPhotoUrl = profile?.photoPath ? `/api/storage${profile.photoPath}` : null;

  const updateMutation = useUpdateOwnProfile({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ predicate: (q) => (q.queryKey[0] as string)?.startsWith?.("/api/members") });
        toast({ title: "Sucesso", description: "Perfil atualizado." });
        setIsEditing(false);
        setPhotoFile(null);
        setPhotoPreview(null);
      },
      onError: (err: any) => {
        toast({ title: "Erro", description: err?.response?.data?.message || "Falha ao atualizar.", variant: "destructive" });
      },
    },
  });

  const startEdit = () => {
    if (!profile) return;
    setForm({
      fullName: profile.fullName || "",
      cpf: (profile as any).cpfMasked?.replace(/\D/g, "") || "",
      dateOfBirth: profile.dateOfBirth || "",
      sex: profile.sex || "",
      phone: formatPhone((profile as any).phone || ""),
      addressZip: (profile as any).addressZip || "",
      addressStreet: (profile as any).addressStreet || "",
      addressNumber: profile.addressNumber || "",
      addressComplement: profile.addressComplement || "",
      addressNeighborhood: (profile as any).addressNeighborhood || "",
      addressCity: profile.addressCity || "",
      addressState: profile.addressState || "",
      maritalStatus: (profile as any).maritalStatus || "",
      academicEducation: (profile as any).academicEducation || "",
      profession: (profile as any).profession || "",
    });
    setPhotoPreview(currentPhotoUrl);
    setIsEditing(true);
  };

  const cancelEdit = () => {
    setIsEditing(false);
    setForm({ ...EMPTY_FORM });
    setPhotoFile(null);
    setPhotoPreview(null);
  };

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Erro", description: "Apenas imagens são permitidas.", variant: "destructive" });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "Erro", description: "Arquivo muito grande (máx 5MB).", variant: "destructive" });
      return;
    }
    setPhotoFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setPhotoPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.fullName.trim()) {
      toast({ title: "Erro", description: "Nome é obrigatório.", variant: "destructive" });
      return;
    }

    let finalPhotoPath: string | undefined;
    if (photoFile) {
      try {
        const { uploadURL, objectPath } = await requestUploadUrl({
          data: { name: photoFile.name, size: photoFile.size, contentType: photoFile.type },
        });
        await fetch(uploadURL, {
          method: "PUT",
          headers: { "Content-Type": photoFile.type },
          body: photoFile,
        });
        finalPhotoPath = objectPath;
      } catch {
        toast({ title: "Erro", description: "Falha ao enviar foto.", variant: "destructive" });
        return;
      }
    }

    // Strip phone mask before sending
    const phoneDigits = form.phone.replace(/\D/g, "");

    updateMutation.mutate({
      data: cleanFormPayload({
        fullName: form.fullName,
        dateOfBirth: form.dateOfBirth || undefined,
        sex: (form.sex as any) || undefined,
        phone: phoneDigits || undefined,
        addressZip: form.addressZip || undefined,
        addressStreet: form.addressStreet || undefined,
        addressNumber: form.addressNumber || undefined,
        addressComplement: form.addressComplement || undefined,
        addressNeighborhood: form.addressNeighborhood || undefined,
        addressCity: form.addressCity || undefined,
        addressState: form.addressState || undefined,
        maritalStatus: (form.maritalStatus as any) || undefined,
        academicEducation: form.academicEducation || undefined,
        profession: form.profession || undefined,
        ...(finalPhotoPath ? { photoPath: finalPhotoPath } : {}),
      }) as any,
    });
  };

  if (isLoading) {
    return (
      <AppLayout breadcrumbs={[{ label: "Meu Perfil" }]}>
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  if (!profile) {
    return (
      <AppLayout breadcrumbs={[{ label: "Meu Perfil" }]}>
        <div className="text-center py-12">
          <User className="h-12 w-12 mx-auto mb-3 text-muted-foreground opacity-30" />
          <p className="text-muted-foreground">Seu perfil de membro ainda não foi criado.</p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout breadcrumbs={[{ label: "Meu Perfil" }]}>
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <User className="h-6 w-6" /> Meu Perfil
          </h1>
          {!isEditing && (
            <button onClick={startEdit} className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm hover:bg-primary/90">
              <Edit2 className="h-4 w-4" /> Editar
            </button>
          )}
        </div>

        {!isEditing ? (
          <div className="space-y-6">
            {/* Profile Header */}
            <div className="rounded-2xl border bg-card p-6">
              <div className="flex items-center gap-4">
                <div className="w-20 h-20 rounded-2xl bg-primary/10 text-primary flex items-center justify-center text-3xl font-bold overflow-hidden">
                  {currentPhotoUrl ? (
                    <img src={currentPhotoUrl} alt={profile.fullName} className="w-full h-full object-cover" />
                  ) : (
                    profile.fullName.charAt(0)
                  )}
                </div>
                <div className="flex-1">
                  <h2 className="text-2xl font-bold">{profile.fullName}</h2>
                </div>
              </div>
            </div>

            {/* Contact */}
            <div className="rounded-2xl border bg-card p-6">
              <h3 className="font-semibold mb-4">Contato</h3>
              <div className="space-y-3 text-sm">
                <div className="flex items-center gap-3">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <span>{profile.email || "—"}</span>
                </div>
                <div className="flex items-center gap-3">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <span>{(profile as any).phone ? formatPhone((profile as any).phone) : "—"}</span>
                </div>
              </div>
            </div>

            {/* Personal */}
            <div className="rounded-2xl border bg-card p-6">
              <h3 className="font-semibold mb-4">Dados Pessoais</h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground text-xs">Data de Nascimento</p>
                  <p className="font-medium mt-0.5">{formatDate(profile.dateOfBirth)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">CPF</p>
                  <p className="font-medium mt-0.5">{(profile as any).cpfMasked || "—"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Sexo</p>
                  <p className="font-medium mt-0.5">{profile.sex ? SEX_LABELS[profile.sex] || profile.sex : "—"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Ano de Conversão</p>
                  <p className="font-medium mt-0.5">{(profile as any).conversionYear || "—"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Data de Recepção</p>
                  <p className="font-medium mt-0.5">{formatDate((profile as any).receptionDate)}</p>
                </div>
              </div>
            </div>

            {/* Address */}
            <div className="rounded-2xl border bg-card p-6">
              <h3 className="font-semibold mb-4 flex items-center gap-2">
                <MapPin className="h-4 w-4" /> Endereço
              </h3>
              <div className="space-y-2 text-sm">
                <p>
                  {(profile as any).addressStreet || "—"}
                  {profile.addressNumber && `, ${profile.addressNumber}`}
                  {profile.addressComplement && ` — ${profile.addressComplement}`}
                </p>
                <p className="text-muted-foreground">
                  {(profile as any).addressNeighborhood && `${(profile as any).addressNeighborhood} · `}
                  {profile.addressCity} {profile.addressState && `/ ${profile.addressState}`}
                </p>
                {(profile as any).addressZip && (
                  <p className="text-xs text-muted-foreground">CEP: {(profile as any).addressZip}</p>
                )}
              </div>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Photo + Basic Info */}
            <div className="rounded-2xl border bg-card p-6 space-y-4">
              <h3 className="font-semibold">Dados Básicos</h3>

              {/* Photo */}
              <div className="flex items-center gap-4">
                <div className="w-24 h-24 rounded-2xl bg-primary/10 text-primary flex items-center justify-center text-3xl font-bold overflow-hidden border-2 border-border">
                  {photoPreview ? (
                    <img src={photoPreview} alt="Preview" className="w-full h-full object-cover" />
                  ) : (
                    form.fullName.charAt(0) || profile.fullName.charAt(0)
                  )}
                </div>
                <div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handlePhotoChange}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-2 px-4 py-2 border rounded-xl text-sm hover:bg-muted"
                  >
                    <UploadCloud className="h-4 w-4" />
                    {photoPreview ? "Trocar Foto" : "Enviar Foto"}
                  </button>
                  <p className="text-xs text-muted-foreground mt-1">PNG/JPG até 5MB</p>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Nome Completo *</label>
                <input type="text" value={form.fullName} onChange={(e) => setForm(f => ({ ...f, fullName: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm bg-background" required />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">E-mail</label>
                <input type="email" value={profile.email || ""} disabled className="w-full border rounded-lg px-3 py-2 text-sm bg-muted/50 text-muted-foreground cursor-not-allowed" />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">CPF</label>
                  <input type="text" value={profile.cpfMasked || ""} disabled className="w-full border rounded-lg px-3 py-2 text-sm bg-muted/50 text-muted-foreground cursor-not-allowed" />
                  <p className="text-xs text-muted-foreground mt-1">Para alterar, contate a administração.</p>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Data de Nascimento</label>
                  <input type="date" value={form.dateOfBirth} onChange={(e) => setForm(f => ({ ...f, dateOfBirth: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm bg-background" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Sexo</label>
                  <select value={form.sex} onChange={(e) => setForm(f => ({ ...f, sex: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm bg-background">
                    <option value="">—</option>
                    <option value="masculino">Masculino</option>
                    <option value="feminino">Feminino</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Telefone</label>
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={(e) => setForm(f => ({ ...f, phone: formatPhone(e.target.value) }))}
                    placeholder="(00) 00000-0000"
                    maxLength={16}
                    className="w-full border rounded-lg px-3 py-2 text-sm bg-background"
                  />
                </div>
              </div>
            </div>

            {/* Address */}
            <div className="rounded-2xl border bg-card p-6 space-y-4">
              <h3 className="font-semibold flex items-center gap-2"><MapPin className="h-4 w-4" /> Endereço</h3>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">CEP</label>
                  <input type="text" value={form.addressZip} onChange={(e) => {
                    const digits = e.target.value.replace(/\D/g, "").slice(0, 8);
                    setForm(f => ({ ...f, addressZip: digits }));
                    if (digits.length === 8) setCepToLookup(digits);
                  }} inputMode="numeric" maxLength={8} className="w-full border rounded-lg px-3 py-2 text-sm bg-background" />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium mb-1">Rua</label>
                  <input type="text" value={form.addressStreet} onChange={(e) => setForm(f => ({ ...f, addressStreet: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm bg-background" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Número</label>
                  <input type="text" inputMode="numeric" value={form.addressNumber} onChange={(e) => setForm(f => ({ ...f, addressNumber: e.target.value.replace(/\D/g, "") }))} className="w-full border rounded-lg px-3 py-2 text-sm bg-background" />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium mb-1">Complemento</label>
                  <input type="text" value={form.addressComplement} onChange={(e) => setForm(f => ({ ...f, addressComplement: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm bg-background" />
                </div>
                <div className="col-span-3">
                  <label className="block text-sm font-medium mb-1">Bairro</label>
                  <input type="text" value={form.addressNeighborhood} onChange={(e) => setForm(f => ({ ...f, addressNeighborhood: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm bg-background" />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium mb-1">Cidade</label>
                  <input type="text" value={form.addressCity} onChange={(e) => setForm(f => ({ ...f, addressCity: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm bg-background" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">UF</label>
                  <input type="text" value={form.addressState} onChange={(e) => setForm(f => ({ ...f, addressState: e.target.value.toUpperCase() }))} maxLength={2} className="w-full border rounded-lg px-3 py-2 text-sm bg-background" />
                </div>
              </div>
            </div>

            {/* Profissional/Pessoal */}
            <div className="rounded-2xl border bg-card p-6 space-y-4">
              <h3 className="font-semibold">Dados Pessoais</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Estado Civil</label>
                  <select value={form.maritalStatus} onChange={(e) => setForm(f => ({ ...f, maritalStatus: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm bg-background">
                    <option value="">Não informado</option>
                    <option value="solteiro">Solteiro(a)</option>
                    <option value="casado">Casado(a)</option>
                    <option value="viuvo">Viúvo(a)</option>
                    <option value="divorciado">Divorciado(a)</option>
                    <option value="uniao_estavel">União Estável</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Profissão</label>
                  <input type="text" value={form.profession} onChange={(e) => setForm(f => ({ ...f, profession: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm bg-background" placeholder="Ex: Engenheiro" />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium mb-1">Formação Acadêmica</label>
                  <input type="text" value={form.academicEducation} onChange={(e) => setForm(f => ({ ...f, academicEducation: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm bg-background" placeholder="Ex: Bacharel em Computação" />
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3">
              <button type="button" onClick={cancelEdit} className="flex items-center gap-2 px-4 py-2 border rounded-xl text-sm hover:bg-muted">
                <X className="h-4 w-4" /> Cancelar
              </button>
              <button type="submit" disabled={updateMutation.isPending} className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm hover:bg-primary/90 disabled:opacity-50">
                {updateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar
              </button>
            </div>
          </form>
        )}
      </div>
    </AppLayout>
  );
}
