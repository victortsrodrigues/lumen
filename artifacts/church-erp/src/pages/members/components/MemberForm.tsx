import { useState, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { 
  useCreateMember, 
  useUpdateMember, 
  useLookupCep, 
  useRequestUploadUrl,
  CreateMemberRequestSex,
  MemberStatus,
  MemberDetail
} from '@workspace/api-client-react';
import { useLocation } from 'wouter';
import { useToast } from '@/hooks/use-toast';
import { Loader2, UploadCloud, MapPin, User, Save, ShieldCheck } from 'lucide-react';

const formSchema = z.object({
  fullName: z.string().min(3, 'Nome completo é obrigatório'),
  cpf: z.string().optional(),
  dateOfBirth: z.string().optional(),
  sex: z.enum(['masculino', 'feminino', 'outro']).optional(),
  phone: z.string().optional(),
  email: z.string().email('E-mail inválido').optional().or(z.literal('')),
  addressZip: z.string().optional(),
  addressStreet: z.string().optional(),
  addressNumber: z.string().optional(),
  addressComplement: z.string().optional(),
  addressNeighborhood: z.string().optional(),
  addressCity: z.string().optional(),
  addressState: z.string().optional(),
  conversionDate: z.string().optional(),
  baptismDate: z.string().optional(),
  status: z.enum(['ativo', 'inativo', 'transferido', 'falecido']).default('ativo'),
  familyId: z.string().optional(),
  familyName: z.string().optional(),
  lgpdConsentAccepted: z.boolean().default(false),
});

type FormValues = z.infer<typeof formSchema>;

interface MemberFormProps {
  initialData?: MemberDetail;
  isEditing?: boolean;
}

export default function MemberForm({ initialData, isEditing = false }: MemberFormProps) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(initialData?.photoPath ? `/api/storage${initialData.photoPath}` : null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [cepToLookup, setCepToLookup] = useState<string>('');

  const { mutateAsync: createMember } = useCreateMember();
  const { mutateAsync: updateMember } = useUpdateMember();
  const { mutateAsync: requestUploadUrl } = useRequestUploadUrl();

  const { register, handleSubmit, formState: { errors }, setValue, watch } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      fullName: initialData?.fullName || '',
      cpf: '', // Do not pre-fill raw CPF on edit as it's masked/encrypted
      dateOfBirth: initialData?.dateOfBirth ? initialData.dateOfBirth.split('T')[0] : '',
      sex: initialData?.sex as any || undefined,
      phone: '', // Encrypted field
      email: initialData?.email || '',
      addressZip: '', // Encrypted
      addressStreet: '', // Encrypted
      addressNumber: initialData?.addressNumber || '',
      addressComplement: initialData?.addressComplement || '',
      addressNeighborhood: '', // Encrypted
      addressCity: initialData?.addressCity || '',
      addressState: initialData?.addressState || '',
      conversionDate: initialData?.conversionDate ? initialData.conversionDate.split('T')[0] : '',
      baptismDate: initialData?.baptismDate ? initialData.baptismDate.split('T')[0] : '',
      status: initialData?.status as any || 'ativo',
      familyName: initialData?.familyName || '',
      lgpdConsentAccepted: isEditing ? true : false,
    }
  });

  const lgpdConsent = watch('lgpdConsentAccepted');

  // CEP Lookup trigger
  useLookupCep(cepToLookup, {
    query: {
      enabled: cepToLookup.length === 8,
    }
  }); // Just demonstrating hook usage, but manual fetch is often better for forms
  
  const handleCepBlur = async (e: React.FocusEvent<HTMLInputElement>) => {
    const rawCep = e.target.value.replace(/\D/g, '');
    if (rawCep.length === 8) {
      try {
        const res = await fetch(`/api/utils/cep/${rawCep}`);
        if (res.ok) {
          const data = await res.json();
          if (data.street) setValue('addressStreet', data.street);
          if (data.neighborhood) setValue('addressNeighborhood', data.neighborhood);
          if (data.city) setValue('addressCity', data.city);
          if (data.state) setValue('addressState', data.state);
        }
      } catch (err) {
        // ignore silently
      }
    }
  };

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setPhotoFile(file);
      const url = URL.createObjectURL(file);
      setPhotoPreview(url);
    }
  };

  const onSubmit = async (data: FormValues) => {
    if (!isEditing && !data.lgpdConsentAccepted) {
      toast({ title: "Atenção", description: "O aceite do termo LGPD é obrigatório.", variant: "destructive" });
      return;
    }

    setIsSubmitting(true);
    try {
      let finalPhotoPath = initialData?.photoPath;

      if (photoFile) {
        // 1. Get presigned URL
        const { uploadURL, objectPath } = await requestUploadUrl({
          data: {
            name: photoFile.name,
            size: photoFile.size,
            contentType: photoFile.type
          }
        });

        // 2. Upload to GCS directly
        await fetch(uploadURL, {
          method: 'PUT',
          headers: { 'Content-Type': photoFile.type },
          body: photoFile
        });

        finalPhotoPath = objectPath;
      }

      // Clean up empty strings
      const payload = Object.fromEntries(
        Object.entries(data).map(([k, v]) => [k, v === '' ? undefined : v])
      ) as any;

      if (finalPhotoPath) {
        payload.photoPath = finalPhotoPath;
      }

      if (isEditing && initialData) {
        await updateMember({ id: initialData.id, data: payload });
        toast({ title: "Sucesso", description: "Dados atualizados com sucesso." });
      } else {
        const newMember = await createMember({ data: payload });
        toast({ title: "Sucesso", description: "Membro cadastrado com sucesso." });
        setLocation(`/members/${newMember.id}`);
        return; // prevent setting isSubmitting to false to avoid flicker during redirect
      }
      
      setIsSubmitting(false);
    } catch (error: any) {
      setIsSubmitting(false);
      toast({
        title: "Erro",
        description: error.message || "Ocorreu um erro ao salvar.",
        variant: "destructive"
      });
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-8 pb-12">
      
      {/* Dados Pessoais */}
      <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-border bg-secondary/20 flex items-center">
          <User className="w-5 h-5 mr-2 text-primary" />
          <h3 className="font-semibold text-foreground">Dados Pessoais</h3>
        </div>
        <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div className="md:col-span-2 lg:col-span-1 row-span-2 flex flex-col items-center justify-center p-6 border-2 border-dashed border-border rounded-xl bg-secondary/10 relative group">
            {photoPreview ? (
              <div className="w-32 h-32 rounded-full overflow-hidden mb-4 shadow-md border-4 border-background">
                <img src={photoPreview} alt="Preview" className="w-full h-full object-cover" />
              </div>
            ) : (
              <div className="w-32 h-32 rounded-full bg-secondary flex items-center justify-center mb-4 text-muted-foreground">
                <User className="w-12 h-12" />
              </div>
            )}
            <input 
              type="file" 
              ref={fileInputRef}
              onChange={handlePhotoSelect} 
              accept="image/*" 
              className="hidden" 
            />
            <button 
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center text-sm font-medium text-primary bg-primary/10 hover:bg-primary/20 px-4 py-2 rounded-lg transition-colors"
            >
              <UploadCloud className="w-4 h-4 mr-2" />
              {photoPreview ? 'Trocar Foto' : 'Enviar Foto'}
            </button>
          </div>

          <div className="space-y-2 md:col-span-2">
            <label className="text-sm font-medium text-foreground">Nome Completo *</label>
            <input {...register('fullName')} className="w-full px-4 py-2.5 rounded-xl bg-background border border-border focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all" />
            {errors.fullName && <p className="text-xs text-destructive">{errors.fullName.message}</p>}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">CPF</label>
            <input 
              {...register('cpf')} 
              placeholder={isEditing ? 'Preencha apenas para alterar' : '000.000.000-00'}
              className="w-full px-4 py-2.5 rounded-xl bg-background border border-border focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all" 
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Data de Nascimento</label>
            <input type="date" {...register('dateOfBirth')} className="w-full px-4 py-2.5 rounded-xl bg-background border border-border focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all" />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Sexo</label>
            <select {...register('sex')} className="w-full px-4 py-2.5 rounded-xl bg-background border border-border focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all appearance-none">
              <option value="">Selecione...</option>
              <option value="masculino">Masculino</option>
              <option value="feminino">Feminino</option>
              <option value="outro">Outro</option>
            </select>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Contato e Endereço */}
        <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden h-fit">
          <div className="px-6 py-4 border-b border-border bg-secondary/20 flex items-center">
            <MapPin className="w-5 h-5 mr-2 text-primary" />
            <h3 className="font-semibold text-foreground">Contato e Endereço</h3>
          </div>
          <div className="p-6 grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Telefone</label>
              <input {...register('phone')} placeholder={isEditing ? 'Preencha para alterar' : '(00) 00000-0000'} className="w-full px-4 py-2.5 rounded-xl bg-background border border-border focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">E-mail</label>
              <input type="email" {...register('email')} className="w-full px-4 py-2.5 rounded-xl bg-background border border-border focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all" />
            </div>

            <div className="col-span-2 mt-2 border-t border-border pt-4"></div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">CEP</label>
              <input 
                {...register('addressZip')} 
                onBlur={handleCepBlur}
                placeholder={isEditing ? 'Alterar CEP' : '00000-000'}
                className="w-full px-4 py-2.5 rounded-xl bg-background border border-border focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all" 
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Bairro</label>
              <input {...register('addressNeighborhood')} className="w-full px-4 py-2.5 rounded-xl bg-background border border-border focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all" />
            </div>

            <div className="space-y-2 col-span-2">
              <label className="text-sm font-medium text-foreground">Rua / Logradouro</label>
              <input {...register('addressStreet')} className="w-full px-4 py-2.5 rounded-xl bg-background border border-border focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all" />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Número</label>
              <input {...register('addressNumber')} className="w-full px-4 py-2.5 rounded-xl bg-background border border-border focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Complemento</label>
              <input {...register('addressComplement')} className="w-full px-4 py-2.5 rounded-xl bg-background border border-border focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all" />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Cidade</label>
              <input {...register('addressCity')} className="w-full px-4 py-2.5 rounded-xl bg-background border border-border focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Estado (UF)</label>
              <input {...register('addressState')} maxLength={2} className="w-full px-4 py-2.5 rounded-xl bg-background border border-border focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all uppercase" />
            </div>
          </div>
        </div>

        {/* Informações da Igreja */}
        <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden h-fit">
          <div className="px-6 py-4 border-b border-border bg-secondary/20 flex items-center">
            <ShieldCheck className="w-5 h-5 mr-2 text-primary" />
            <h3 className="font-semibold text-foreground">Informações Eclesiásticas</h3>
          </div>
          <div className="p-6 grid grid-cols-2 gap-4">
            <div className="space-y-2 col-span-2">
              <label className="text-sm font-medium text-foreground">Status do Membro</label>
              <select {...register('status')} className="w-full px-4 py-2.5 rounded-xl bg-background border border-border focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all appearance-none font-medium">
                <option value="ativo">🟢 Ativo</option>
                <option value="inativo">⚪ Inativo</option>
                <option value="transferido">🟠 Transferido</option>
                <option value="falecido">🟣 Falecido</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Data de Conversão</label>
              <input type="date" {...register('conversionDate')} className="w-full px-4 py-2.5 rounded-xl bg-background border border-border focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Data de Batismo</label>
              <input type="date" {...register('baptismDate')} className="w-full px-4 py-2.5 rounded-xl bg-background border border-border focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all" />
            </div>

            <div className="space-y-2 col-span-2">
              <label className="text-sm font-medium text-foreground">Família (Agrupamento)</label>
              <input {...register('familyName')} placeholder="Ex: Família Silva" className="w-full px-4 py-2.5 rounded-xl bg-background border border-border focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all" />
            </div>
          </div>
        </div>
      </div>

      {/* LGPD */}
      {!isEditing && (
        <div className="bg-primary/5 border border-primary/20 rounded-2xl p-6 flex items-start gap-4">
          <input 
            type="checkbox" 
            {...register('lgpdConsentAccepted')} 
            id="lgpd"
            className="mt-1 w-5 h-5 rounded border-primary text-primary focus:ring-primary"
          />
          <div>
            <label htmlFor="lgpd" className="font-semibold text-foreground cursor-pointer">Termo de Consentimento LGPD *</label>
            <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
              Autorizo o armazenamento e uso dos meus dados pessoais para fins de gestão eclesiástica, comunicação e organização interna, conforme as diretrizes da Lei 13.709/2018 (Lei Geral de Proteção de Dados Pessoais). Os dados sensíveis são armazenados com criptografia de ponta a ponta.
            </p>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-end gap-4 pt-4">
        <button 
          type="button" 
          onClick={() => setLocation('/members')}
          className="px-6 py-3 rounded-xl font-medium text-foreground bg-secondary hover:bg-secondary/80 transition-colors"
        >
          Cancelar
        </button>
        <button 
          type="submit" 
          disabled={isSubmitting || (!isEditing && !lgpdConsent)}
          className="flex items-center px-8 py-3 rounded-xl font-semibold text-white bg-gradient-to-r from-primary to-primary/90 shadow-lg shadow-primary/25 hover:shadow-xl hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Save className="w-5 h-5 mr-2" /> Salvar {isEditing ? 'Alterações' : 'Membro'}</>}
        </button>
      </div>

    </form>
  );
}
