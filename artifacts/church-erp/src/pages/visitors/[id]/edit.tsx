import { useGetVisitor } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useAuth } from "@/hooks/use-auth-context";
import { Redirect, useParams } from "wouter";
import { Loader2 } from "lucide-react";
import { VisitorForm } from "../components/VisitorForm";

export default function EditVisitor() {
  const { user } = useAuth();
  const params = useParams();
  const id = params.id as string;

  const { data: visitor, isLoading } = useGetVisitor(id, { query: { enabled: !!id } });

  if (user?.role === "member") return <Redirect to="/" />;

  if (isLoading) {
    return (
      <AppLayout breadcrumbs={[{ label: "Visitantes", href: "/visitors" }, { label: "Editar" }]}>
        <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
      </AppLayout>
    );
  }

  if (!visitor) {
    return (
      <AppLayout breadcrumbs={[{ label: "Visitantes", href: "/visitors" }, { label: "Editar" }]}>
        <div className="text-center py-12 text-muted-foreground">Visitante não encontrado.</div>
      </AppLayout>
    );
  }

  return (
    <AppLayout breadcrumbs={[
      { label: "Visitantes", href: "/visitors" },
      { label: visitor.fullName, href: `/visitors/${id}` },
      { label: "Editar" },
    ]}>
      <h1 className="text-2xl font-bold mb-6">Editar Visitante</h1>
      <VisitorForm initialData={visitor} isEditing />
    </AppLayout>
  );
}
