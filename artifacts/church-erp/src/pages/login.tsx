import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useLogin } from '@workspace/api-client-react';
import { useAuth } from '@/hooks/use-auth-context';
import { Link, useLocation } from 'wouter';
import { AuthLayout } from '@/components/layout/AuthLayout';
import { useToast } from '@/hooks/use-toast';
import { Loader2, ArrowRight, Eye, EyeOff } from 'lucide-react';
import { motion } from 'framer-motion';

const loginSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(1, 'A senha é obrigatória'),
});

type LoginForm = z.infer<typeof loginSchema>;

export default function Login() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { getValidCsrfToken, checkSession } = useAuth();
  const { mutateAsync: loginMutation } = useLogin();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginForm) => {
    setIsSubmitting(true);
    try {
      const csrfToken = await getValidCsrfToken();
      const response = await loginMutation({
        data: { ...data, csrfToken }
      });

      if (response.requiresMfa) {
        setLocation('/mfa-verify');
      } else {
        await checkSession();
        toast({ title: "Bem-vindo de volta!", description: "Login realizado com sucesso." });
        setLocation('/');
      }
    } catch (error: any) {
      toast({
        title: "Erro no login",
        description: error?.message || "Verifique suas credenciais e tente novamente.",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthLayout title="Acessar conta" centered>
      <motion.form 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        onSubmit={handleSubmit(onSubmit)} 
        className="space-y-5"
      >
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">Email</label>
          <input
            {...register('email')}
            type="email"
            placeholder="seu@email.com"
            className="w-full px-4 py-3 rounded-xl bg-background border-2 border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all duration-200"
          />
          {errors.email && <p className="text-sm text-destructive mt-1">{errors.email.message}</p>}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-foreground">Senha</label>
            <Link href="/forgot-password" className="text-sm font-medium text-primary hover:text-primary/80 hover:underline transition-colors">
              Esqueceu a senha?
            </Link>
          </div>
          <div className="relative">
            <input
              {...register('password')}
              type={showPassword ? 'text' : 'password'}
              placeholder="••••••••"
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
          {errors.password && <p className="text-sm text-destructive mt-1">{errors.password.message}</p>}
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full flex items-center justify-center px-6 py-3.5 mt-4 rounded-xl font-semibold text-white bg-gradient-to-r from-primary to-primary/90 shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 hover:-translate-y-0.5 active:translate-y-0 active:shadow-md disabled:opacity-70 disabled:cursor-not-allowed disabled:transform-none transition-all duration-200 ease-out"
        >
          {isSubmitting ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <>
              Entrar no sistema
              <ArrowRight className="w-5 h-5 ml-2" />
            </>
          )}
        </button>
      </motion.form>

      <div className="mt-8 text-center">
        <p className="text-muted-foreground text-sm">
          Ainda não tem uma conta?{' '}
          <Link href="/register" className="font-semibold text-foreground hover:text-primary transition-colors">
            Criar conta
          </Link>
        </p>
      </div>
    </AuthLayout>
  );
}
