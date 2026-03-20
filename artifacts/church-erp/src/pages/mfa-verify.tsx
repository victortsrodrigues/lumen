import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useVerifyMfa } from '@workspace/api-client-react';
import { useAuth } from '@/hooks/use-auth-context';
import { useLocation } from 'wouter';
import { AuthLayout } from '@/components/layout/AuthLayout';
import { useToast } from '@/hooks/use-toast';
import { Loader2, ShieldCheck } from 'lucide-react';
import { motion } from 'framer-motion';

const mfaSchema = z.object({
  code: z.string().length(6, 'O código deve ter 6 dígitos'),
});

export default function MfaVerify() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { getValidCsrfToken, checkSession } = useAuth();
  const { mutateAsync: verifyMutation } = useVerifyMfa();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm({
    resolver: zodResolver(mfaSchema),
  });

  const onSubmit = async (data: any) => {
    setIsSubmitting(true);
    try {
      const csrfToken = await getValidCsrfToken();
      await verifyMutation({
        data: { code: data.code, csrfToken }
      });

      await checkSession();
      toast({ title: "Verificado", description: "Autenticação concluída." });
      setLocation('/');
    } catch (error: any) {
      toast({
        title: "Código inválido",
        description: "Verifique o código e tente novamente.",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthLayout title="Verificação em 2 Etapas" subtitle="Insira o código gerado pelo seu aplicativo autenticador.">
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="flex justify-center mb-8">
        <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center text-primary">
          <ShieldCheck className="w-8 h-8" />
        </div>
      </motion.div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground text-center block">Código de 6 dígitos</label>
          <input
            {...register('code')}
            type="text"
            maxLength={6}
            placeholder="000000"
            className="w-full text-center text-3xl tracking-[0.5em] px-4 py-4 rounded-xl bg-background border-2 border-border text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all duration-200 font-mono font-bold"
          />
          {errors.code && <p className="text-sm text-destructive text-center mt-2">{errors.code.message as string}</p>}
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full flex items-center justify-center px-6 py-3.5 mt-4 rounded-xl font-semibold text-white bg-gradient-to-r from-primary to-primary/90 shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 hover:-translate-y-0.5 active:translate-y-0 active:shadow-md disabled:opacity-70 transition-all duration-200"
        >
          {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : "Verificar código"}
        </button>
      </form>
    </AuthLayout>
  );
}
