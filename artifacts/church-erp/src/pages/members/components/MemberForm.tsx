import { useState, useRef, useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  useCreateMember,
  useUpdateMember,
  useLookupCep,
  useRequestUploadUrl,
  useListMembers,
  useAddMemberChild,
  useRemoveMemberChild,
  useGetMember,
  CreateMemberRequestSex,
  MemberStatus,
  MemberDetail
} from '@workspace/api-client-react';
import { useLocation } from 'wouter';
import { useToast } from '@/hooks/use-toast';
import { Loader2, UploadCloud, MapPin, User, Save, ShieldCheck, Users, Search, Plus, X, Heart } from 'lucide-react';
import { MemberSelect } from '@/components/MemberSelect';

import { ALL_RECEPTION_MODES } from "../../../../../../lib/db/src/schema/member-rules";

const RECEPTION_MODE_DESCRIPTIONS: Record<string, string> = {
  profissao_fe: "Para batizados na infância",
  profissao_fe_batismo: "Para novos convertidos",
  carta_transferencia: "Oriundos de outra IPB ou denominação evangélica",
  jurisdicao_pedido: "Oriundos de outra igreja evangélica sem carta",
  jurisdicao_ex_officio: "Membro de outra IPB residente no local há mais de um ano",
  restauracao: "Retorno após disciplina ou solicitação prévia de saída",
  batismo_infantil: "Filhos de membros comungantes",
  transferencia_menor: "Menores que acompanham os pais transferidos",
  arrolamento_menor: "Menores dependentes sob cuidado do Conselho",
};

const formSchema = z.object({
  fullName: z.string().min(3, 'Nome completo é obrigatório'),
  cpf: z.string().optional(),
  dateOfBirth: z.string().optional(),
  sex: z.union([z.enum(['masculino', 'feminino']), z.literal('')]).optional().transform(v => v === '' ? undefined : v),
  phone: z.string().optional(),
  email: z.string().email('E-mail inválido').optional().or(z.literal('')),
  addressZip: z.string().optional(),
  addressStreet: z.string().optional(),
  addressNumber: z.string().optional(),
  addressComplement: z.string().optional(),
  addressNeighborhood: z.string().optional(),
  addressCity: z.string().optional(),
  addressState: z.string().optional(),
  classification: z.enum(['comungante', 'nao_comungante']).default('comungante'),
  receptionMode: z.union([z.enum(ALL_RECEPTION_MODES), z.literal('')]).optional().transform(v => v === '' ? undefined : v),
  receptionDate: z.string().optional(),
  conversionYear: z.union([z.string(), z.number(), z.literal('')]).optional().transform(v => v === '' || v === undefined ? undefined : Number(v)),
  religiousOrigin: z.string().optional(),
  parentsOrGuardians: z.string().optional(),
  maritalStatus: z.union([z.enum(['solteiro', 'casado', 'viuvo', 'divorciado', 'uniao_estavel']), z.literal('')]).optional().transform(v => v === '' ? undefined : v),
  spouseMemberId: z.string().optional(),
  academicEducation: z.string().optional(),
  profession: z.string().optional(),
  status: z.enum(['ativo', 'disciplina', 'rol_apartado', 'falecido', 'demitido']).default('ativo'),
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
      cpf: '',
      dateOfBirth: initialData?.dateOfBirth ? initialData.dateOfBirth.split('T')[0] : '',
      sex: initialData?.sex as any || undefined,
      phone: initialData?.phone || '',
      email: initialData?.email || '',
      addressZip: initialData?.addressZip || '',
      addressStreet: initialData?.addressStreet || '',
      addressNumber: initialData?.addressNumber || '',
      addressComplement: initialData?.addressComplement || '',
      addressNeighborhood: initialData?.addressNeighborhood || '',
      addressCity: initialData?.addressCity || '',
      addressState: initialData?.addressState || '',
      classification: ((initialData as any)?.classification || 'comungante') as any,
      receptionMode: ((initialData as any)?.receptionMode || '') as any,
      receptionDate: (initialData as any)?.receptionDate ? (initialData as any).receptionDate.split('T')[0] : '',
      conversionYear: (initialData as any)?.conversionYear || undefined,
      religiousOrigin: (initialData as any)?.religiousOrigin || '',
      parentsOrGuardians: (initialData as any)?.parentsOrGuardians || '',
      maritalStatus: ((initialData as any)?.maritalStatus || '') as any,
      spouseMemberId: (initialData as any)?.spouseMemberId || '',
      academicEducation: (initialData as any)?.academicEducation || '',
      profession: (initialData as any)?.profession || '',
      status: initialData?.status as any || 'ativo',
      lgpdConsentAccepted: isEditing ? true : false,
    }
  });

  const lgpdConsent = watch('lgpdConsentAccepted');

  useLookupCep(cepToLookup, {
    query: { enabled: cepToLookup.length === 8 }
  });

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
        const { uploadURL, objectPath } = await requestUploadUrl({
          data: {
            name: photoFile.name,
            size: photoFile.size,
            contentType: photoFile.type
          }
        });

        await fetch(uploadURL, {
          method: 'PUT',
          headers: { 'Content-Type': photoFile.type },
          body: photoFile
        });

        finalPhotoPath = objectPath;
      }

      const payload = Object.fromEntries(
        Object.entries(data).map(([k, v]) => [k, v === '' ? undefined : v])
      ) as any;

      if (finalPhotoPath) {
        payload.photoPath = finalPhotoPath;
      }

      if (isEditing && initialData) {
        await updateMember({ id: initialData.id, data: payload });
        toast({ title: "Sucesso", description: "Dados atualizados com sucesso." });
        setLocation(`/members/${initialData.id}`);
        return;
      } else {
        const newMember = await createMember({ data: payload });
        toast({ title: "Sucesso", description: "Membro cadastrado com sucesso." });
        setLocation(`/members/${newMember.id}`);
        return;
      }
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
    <>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-8 pb-12">

        {/* Dados Pessoais */}
        <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-border bg-secondary/20 flex items-center">
            <User className="w-5 h-5 mr-2 text-primary" />
            <h3 className="font-semibold text-foreground">Dados Pessoais</h3>
          </div>
          <div className="p-6 flex flex-col md:flex-row gap-6">
            {/* Foto */}
            <div className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-border rounded-xl bg-secondary/10 md:w-48 shrink-0">
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

            {/* Campos ao lado da foto */}
            <div className="flex-1 space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Nome Completo *</label>
                <input {...register('fullName')} className="w-full px-4 py-2.5 rounded-xl bg-background border border-border focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all" />
                {errors.fullName && <p className="text-xs text-destructive">{errors.fullName.message}</p>}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">CPF</label>
                  <input
                    {...register('cpf')}
                    placeholder={isEditing ? 'Preencha para alterar' : '000.000.000-00'}
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
                  </select>
                </div>
              </div>

              {/* Estado Civil + Cônjuge (condicional) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Estado Civil</label>
                  <select {...register('maritalStatus')} className="w-full px-4 py-2.5 rounded-xl bg-background border border-border focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all appearance-none">
                    <option value="">Selecione...</option>
                    <option value="solteiro">Solteiro(a)</option>
                    <option value="casado">Casado(a)</option>
                    <option value="viuvo">Viúvo(a)</option>
                    <option value="divorciado">Divorciado(a)</option>
                    <option value="uniao_estavel">União Estável</option>
                  </select>
                </div>
                {(watch('maritalStatus') === 'casado' || watch('maritalStatus') === 'uniao_estavel') && (
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground flex items-center gap-1.5">
                      <Heart className="h-3.5 w-3.5 text-pink-500" /> Cônjuge
                    </label>
                    <MemberSelect
                      value={watch('spouseMemberId') || ''}
                      onChange={(id) => setValue('spouseMemberId', id || undefined, { shouldDirty: true })}
                      initialName={(initialData as any)?.spouseName || ''}
                      excludeIds={initialData?.id ? [initialData.id] : []}
                      placeholder="Selecionar cônjuge..."
                    />
                  </div>
                )}
              </div>

              {/* Profissão + Formação Acadêmica */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Profissão</label>
                  <input {...register('profession')} placeholder="Ex: Engenheiro" className="w-full px-4 py-2.5 rounded-xl bg-background border border-border focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Formação Acadêmica</label>
                  <input {...register('academicEducation')} placeholder="Ex: Bacharel em Computação" className="w-full px-4 py-2.5 rounded-xl bg-background border border-border focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all" />
                </div>
              </div>

              {/* Filhos — só em modo edição */}
              {isEditing && initialData?.id && (
                <ChildrenLinker memberId={initialData.id} />
              )}
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
            <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Telefone</label>
                <input {...register('phone')} placeholder="(00) 00000-0000" className="w-full px-4 py-2.5 rounded-xl bg-background border border-border focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all" />
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
                  inputMode="numeric"
                  onInput={(e) => { (e.target as HTMLInputElement).value = (e.target as HTMLInputElement).value.replace(/[^0-9]/g, ''); }}
                  placeholder="00000000"
                  maxLength={8}
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
                <input
                  {...register('addressNumber')}
                  inputMode="numeric"
                  onInput={(e) => { (e.target as HTMLInputElement).value = (e.target as HTMLInputElement).value.replace(/[^0-9]/g, ''); }}
                  className="w-full px-4 py-2.5 rounded-xl bg-background border border-border focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                />
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
            <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Classificação *</label>
                <select {...register('classification')} className="w-full px-4 py-2.5 rounded-xl bg-background border border-border focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all appearance-none font-medium">
                  <option value="comungante">Comungante</option>
                  <option value="nao_comungante">Não Comungante</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Status do Membro <span className="text-destructive">*</span></label>
                <select {...register('status')} className="w-full px-4 py-2.5 rounded-xl bg-background border border-border focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all appearance-none font-medium">
                  <option value="ativo">Ativo</option>
                  <option value="disciplina">Disciplina</option>
                  <option value="rol_apartado">Rol Apartado</option>
                  <option value="falecido">Falecido</option>
                </select>
              </div>

              <div className="space-y-2 sm:col-span-2">
                <label className="text-sm font-medium text-foreground">Modo de Recepção</label>
                <select {...register('receptionMode')} className="w-full px-4 py-2.5 rounded-xl bg-background border border-border focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all appearance-none">
                  <option value="">Selecione...</option>
                  {watch('classification') === 'comungante' ? (
                    <>
                      <option value="profissao_fe" title="Para batizados na infância">Profissão de Fé</option>
                      <option value="profissao_fe_batismo" title="Para novos convertidos">Profissão de Fé e Batismo</option>
                      <option value="carta_transferencia" title="Oriundos de outra IPB ou denominação evangélica">Carta de Transferência</option>
                      <option value="jurisdicao_pedido" title="Oriundos de outra igreja evangélica sem carta">Jurisdição a Pedido</option>
                      <option value="jurisdicao_ex_officio" title="Membro de outra IPB residente no local há mais de um ano">Jurisdição ex officio</option>
                      <option value="restauracao" title="Retorno após disciplina ou solicitação prévia de saída">Restauração</option>
                    </>
                  ) : (
                    <>
                      <option value="batismo_infantil" title="Filhos de membros comungantes">Batismo Infantil</option>
                      <option value="transferencia_menor" title="Menores que acompanham os pais transferidos">Transferência (menor)</option>
                      <option value="arrolamento_menor" title="Menores dependentes sob cuidado do Conselho">Arrolamento (menor)</option>
                    </>
                  )}
                </select>
                {watch('receptionMode') && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {RECEPTION_MODE_DESCRIPTIONS[watch('receptionMode') as keyof typeof RECEPTION_MODE_DESCRIPTIONS]}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Data de Recepção</label>
                <input type="date" {...register('receptionDate')} className="w-full px-4 py-2.5 rounded-xl bg-background border border-border focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all" />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Ano de Conversão</label>
                <input type="number" min="1900" max="2100" {...register('conversionYear')} placeholder="Ex: 2010" className="w-full px-4 py-2.5 rounded-xl bg-background border border-border focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Procedência Religiosa</label>
                <input {...register('religiousOrigin')} placeholder="Ex: Igreja Batista" className="w-full px-4 py-2.5 rounded-xl bg-background border border-border focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all" />
              </div>

              {watch('classification') === 'nao_comungante' && (
                <div className="space-y-2 sm:col-span-2">
                  <label className="text-sm font-medium text-foreground">Pais ou Responsáveis</label>
                  <input {...register('parentsOrGuardians')} placeholder="Nome dos pais ou responsáveis" className="w-full px-4 py-2.5 rounded-xl bg-background border border-border focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all" />
                </div>
              )}

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
            onClick={() => setLocation(isEditing && initialData ? `/members/${initialData.id}` : '/members')}
            className="px-6 py-3 rounded-xl font-medium text-foreground bg-secondary hover:bg-secondary/80 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={isSubmitting || (!isEditing && !lgpdConsent)}
            className="flex items-center px-8 py-3 rounded-xl font-semibold text-white bg-gradient-to-r from-primary to-primary/90 shadow-lg shadow-primary/25 hover:shadow-xl hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Save className="w-5 h-5 mr-2" /> Salvar {isEditing ? 'Alterações' : ''}</>}
          </button>
        </div>

      </form>
    </>
  );
}

// ─── Children Linker ────────────────────────────────────────────────────────
// Editor de vínculos pai/filho. Lista os filhos atuais e permite adicionar
// outros membros via busca + clique direto. Disponível só em modo edição
// (precisa do memberId pra usar os endpoints).

function ChildrenLinker({ memberId }: { memberId: string }) {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [showSearch, setShowSearch] = useState(false);

  // Debounce
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const { data: detail } = useGetMember(memberId, { query: { enabled: !!memberId } });
  const { data: candidates, isLoading: isLoadingCandidates } = useListMembers(
    { search: search || undefined, status: "ativo" as any, limit: 30, page: 1 } as any,
    { query: { enabled: showSearch } },
  );

  const addMut = useAddMemberChild();
  const removeMut = useRemoveMemberChild();

  const children = ((detail as any)?.children ?? []) as Array<{ id: string; fullName: string }>;
  const childIds = useMemo(() => new Set(children.map(c => c.id)), [children]);

  const availableMembers = useMemo(() => {
    const list = ((candidates as any)?.members ?? []) as any[];
    return list.filter((m) => m.id !== memberId && !childIds.has(m.id));
  }, [candidates, childIds, memberId]);

  return (
    <div className="space-y-3 pt-3 border-t">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Users className="h-4 w-4 text-primary" /> Filhos ({children.length})
        </h4>
        {!showSearch && (
          <button
            type="button"
            onClick={() => setShowSearch(true)}
            className="flex items-center gap-1.5 text-xs text-primary hover:underline"
          >
            <Plus className="h-3.5 w-3.5" /> Adicionar filho
          </button>
        )}
      </div>

      {children.length > 0 ? (
        <ul className="space-y-1.5">
          {children.map((c) => (
            <li key={c.id} className="flex items-center justify-between p-2.5 rounded-lg bg-muted/40">
              <p className="font-medium text-sm truncate">{c.fullName}</p>
              <button
                type="button"
                onClick={() => removeMut.mutate({ id: memberId, childId: c.id })}
                disabled={removeMut.isPending}
                className="p-1 text-muted-foreground hover:text-destructive shrink-0 disabled:opacity-50"
                title="Desvincular filho"
              >
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      ) : !showSearch ? (
        <p className="text-sm text-muted-foreground italic">Nenhum filho vinculado.</p>
      ) : null}

      {showSearch && (
        <div className="rounded-lg border bg-background/50 p-3 space-y-2">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Buscar membro por nome..."
                className="w-full pl-9 pr-3 py-2 border rounded-lg bg-background text-sm"
                autoFocus
              />
            </div>
            <button
              type="button"
              onClick={() => { setShowSearch(false); setSearchInput(""); setSearch(""); }}
              className="px-3 py-2 border rounded-lg text-xs"
            >
              Fechar
            </button>
          </div>
          <div className="border rounded-lg overflow-hidden max-h-60 overflow-y-auto bg-card">
            {isLoadingCandidates ? (
              <div className="flex justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : availableMembers.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6 italic">
                {search ? "Nenhum membro encontrado." : "Digite para buscar..."}
              </p>
            ) : (
              <ul className="divide-y">
                {availableMembers.map((m: any) => (
                  <li key={m.id}>
                    <button
                      type="button"
                      onClick={() => addMut.mutate({ id: memberId, data: { childMemberId: m.id } as any })}
                      disabled={addMut.isPending}
                      className="w-full text-left flex items-center gap-3 p-2.5 hover:bg-muted/50 transition-colors disabled:opacity-50"
                    >
                      <Plus className="h-4 w-4 text-primary shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-sm truncate">{m.fullName}</p>
                        {m.email && <p className="text-xs text-muted-foreground truncate">{m.email}</p>}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
