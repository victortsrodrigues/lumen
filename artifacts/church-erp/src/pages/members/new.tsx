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
    <AppLayout breadcrumbs={[{ label: "Membros", href: "/members" }, { label: "Novo Membro" }]}>
      <MemberForm />
    </AppLayout>
  );
}
