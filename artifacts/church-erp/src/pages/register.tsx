import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRegister } from '@workspace/api-client-react';
import { useAuth } from '@/hooks/use-auth-context';
import { Link } from 'wouter';
import { AuthLayout } from '@/components/layout/AuthLayout';
import { useToast } from '@/hooks/use-toast';
import { CheckCircle2, Loader2, Eye, EyeOff } from 'lucide-react';
import { motion } from 'framer-motion';

const registerSchema = z.object({
  name: z.string().min(3, 'Nome deve ter pelo menos 3 caracteres'),
  email: z.string().email('Email inválido'),
  password: z.string().min(8, 'Senha deve ter no mínimo 8 caracteres'),
  consentAccepted: z.literal(true, {
    errorMap: () => ({ message: 'Você deve aceitar os termos' })
  })
});

type RegisterForm = z.infer<typeof registerSchema>;

export default function Register() {
  const { toast } = useToast();
  const { getValidCsrfToken } = useAuth();
  const { mutateAsync: registerMutation } = useRegister();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [submission, setSubmission] = useState<{ email: string; verificationRequired: boolean } | null>(null);

  const { register, handleSubmit, formState: { errors } } = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
  });

  const onSubmit = async (data: RegisterForm) => {
    setIsSubmitting(true);
    try {
      const csrfToken = await getValidCsrfToken();
      const response = await registerMutation({
        data: { ...data, csrfToken }
      });

      setSubmission({ email: data.email, verificationRequired: response.emailVerificationRequired === true });
      toast({
        title: "Solicitação enviada",
        description: response.emailVerificationRequired
          ? "Confira seu e-mail e aguarde a aprovação de um administrador."
          : "Aguarde a aprovação de um administrador.",
      });
    } catch (error: any) {
      toast({
        title: "Erro no registro",
        description: error?.message || "Ocorreu um erro ao criar a conta.",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (submission) {
    return (
      <AuthLayout title="Solicitação enviada">
        <div className="text-center space-y-5">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
            <CheckCircle2 className="h-8 w-8" />
          </div>
          <div className="space-y-2">
            <p className="text-foreground font-medium">Seu pedido de acesso foi recebido.</p>
            <p className="text-sm text-muted-foreground">
              {submission.verificationRequired
                ? <>Enviamos uma confirmação para <strong>{submission.email}</strong>. Confirme o endereço e aguarde a aprovação de um administrador.</>
                : <>Um administrador precisa aprovar a conta <strong>{submission.email}</strong> antes do primeiro acesso.</>}
            </p>
          </div>
          <Link href="/login" className="inline-flex w-full items-center justify-center rounded-xl bg-primary px-6 py-3.5 font-semibold text-primary-foreground hover:bg-primary/90">
            Voltar para o login
          </Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Criar conta" subtitle="Preencha os dados abaixo para começar.">
      <motion.form 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        onSubmit={handleSubmit(onSubmit)} 
        className="space-y-4"
      >
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">Nome completo</label>
          <input
            {...register('name')}
            type="text"
            placeholder="João Silva"
            className="w-full px-4 py-3 rounded-xl bg-background border-2 border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all duration-200"
          />
          {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">Email</label>
          <input
            {...register('email')}
            type="email"
            placeholder="seu@email.com"
            className="w-full px-4 py-3 rounded-xl bg-background border-2 border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all duration-200"
          />
          {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">Senha</label>
          <div className="relative">
            <input
              {...register('password')}
              type={showPassword ? 'text' : 'password'}
              placeholder="Mínimo 8 caracteres"
              className="w-full px-4 py-3 pr-12 rounded-xl bg-background border-2 border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all duration-200"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground transition-colors"
              tabIndex={-1}
            >
              {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
          </div>
          {errors.password && <p className="text-sm text-destructive">{errors.password.message}</p>}
        </div>

        <div className="flex items-start pt-2">
          <div className="flex items-center h-5">
            <input
              {...register('consentAccepted')}
              type="checkbox"
              className="w-5 h-5 rounded border-2 border-border text-primary focus:ring-primary focus:ring-offset-2 bg-background transition-all"
            />
          </div>
          <div className="ml-3 text-sm">
            <label className="font-medium text-foreground">Política de Privacidade</label>
            <p className="text-muted-foreground">Eu concordo com o processamento dos meus dados.</p>
          </div>
        </div>
        {errors.consentAccepted && <p className="text-sm text-destructive">{errors.consentAccepted.message}</p>}

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full flex items-center justify-center px-6 py-3.5 mt-6 rounded-xl font-semibold text-white bg-gradient-to-r from-primary to-primary/90 shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 hover:-translate-y-0.5 active:translate-y-0 active:shadow-md disabled:opacity-70 transition-all duration-200"
        >
          {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : "Criar minha conta"}
        </button>
      </motion.form>

      <div className="mt-8 text-center">
        <p className="text-muted-foreground text-sm">
          Já possui conta?{' '}
          <Link href="/login" className="font-semibold text-foreground hover:text-primary transition-colors">
            Fazer login
          </Link>
        </p>
      </div>
    </AuthLayout>
  );
}
