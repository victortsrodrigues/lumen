import { AppLayout } from '@/components/layout/AppLayout';
import MemberForm from './components/MemberForm';
import { useAuth } from '@/hooks/use-auth-context';
import { Redirect } from 'wouter';

export default function NewMember() {
  const { user } = useAuth();

  if (user?.role === 'member') {
    return <Redirect to="/" />;
  }

  return (
    <AppLayout title="Novo Membro">
      <div className="mb-8">
        <h2 className="text-2xl font-display font-bold text-foreground">Cadastro de Membro</h2>
        <p className="text-muted-foreground mt-1">Preencha os dados abaixo para registrar uma nova pessoa na comunidade.</p>
      </div>

      <MemberForm />
    </AppLayout>
  );
}
