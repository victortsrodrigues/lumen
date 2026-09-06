import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useForgotPassword } from '@workspace/api-client-react';
import { Link } from 'wouter';
import { AuthLayout } from '@/components/layout/AuthLayout';
import { useToast } from '@/hooks/use-toast';
import { Loader2, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { motion } from 'framer-motion';

const schema = z.object({
  email: z.string().email('Email inválido'),
});

export default function ForgotPassword() {
  const { toast } = useToast();
  const { mutateAsync: forgotMutation } = useForgotPassword();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: any) => {
    setIsSubmitting(true);
    try {
      await forgotMutation({
        data: { email: data.email }
      });
      setIsSuccess(true);
    } catch (error: any) {
      toast({
        title: "Erro",
        description: error?.message || "Não foi possível processar sua solicitação.",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSuccess) {
    return (
      <AuthLayout title="Email enviado" subtitle="Verifique sua caixa de entrada.">
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="text-center py-6">
          <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          <p className="text-foreground text-lg mb-8">
            Enviamos um link de recuperação para o email informado. Siga as instruções no email para criar uma nova senha.
          </p>
          <Link href="/login" className="inline-flex items-center justify-center px-6 py-3 rounded-xl font-semibold text-primary bg-primary/10 hover:bg-primary/20 transition-colors">
            <ArrowLeft className="w-5 h-5 mr-2" />
            Voltar para o login
          </Link>
        </motion.div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Recuperar senha" subtitle="Informe seu email para receber o link de recuperação.">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">Email da conta</label>
          <input
            {...register('email')}
            type="email"
            placeholder="seu@email.com"
            className="w-full px-4 py-3 rounded-xl bg-background border-2 border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all duration-200"
          />
          {errors.email && <p className="text-sm text-destructive mt-1">{errors.email.message as string}</p>}
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full flex items-center justify-center px-6 py-3.5 mt-4 rounded-xl font-semibold text-white bg-gradient-to-r from-primary to-primary/90 shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 hover:-translate-y-0.5 active:translate-y-0 active:shadow-md disabled:opacity-70 transition-all duration-200"
        >
          {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : "Enviar link de recuperação"}
        </button>
      </form>

      <div className="mt-8 text-center">
        <Link href="/login" className="inline-flex items-center text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Voltar para o login
        </Link>
      </div>
    </AuthLayout>
  );
}
