import { AppLayout } from '@/components/layout/AppLayout';
import MemberForm from '../components/MemberForm';
import { useAuth } from '@/hooks/use-auth-context';
import { useGetMember } from '@workspace/api-client-react';
import { Redirect, useParams } from 'wouter';
import { Loader2 } from 'lucide-react';

export default function EditMember() {
  const { user } = useAuth();
  const params = useParams();
  const id = params.id as string;

  const { data: member, isLoading, isError } = useGetMember(id, {
    query: { enabled: !!id }
  });

  if (user?.role === 'member') {
    return <Redirect to="/" />;
  }

  return (
    <AppLayout breadcrumbs={[{ label: "Rol de Membros", href: "/members" }, ...(member ? [{ label: member.fullName, href: `/members/${id}` }, { label: "Editar" }] : [{ label: "Editar" }])]}>
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-20 bg-card rounded-2xl border border-border shadow-sm">
          <Loader2 className="w-10 h-10 animate-spin text-primary mb-4" />
          <p className="text-muted-foreground font-medium">Carregando dados...</p>
        </div>
      ) : isError || !member ? (
        <div className="flex flex-col items-center justify-center py-20 bg-card rounded-2xl border border-border shadow-sm">
          <p className="text-destructive font-medium">Erro ao carregar membro ou membro não encontrado.</p>
        </div>
      ) : (
        <MemberForm initialData={member} isEditing={true} />
      )}
    </AppLayout>
  );
}
