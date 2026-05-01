import { AppLayout } from "@/components/layout/AppLayout";
import { useAuth } from "@/hooks/use-auth-context";
import { Redirect } from "wouter";
import { VisitorForm } from "./components/VisitorForm";

export default function NewVisitor() {
  const { user } = useAuth();
  if (user?.role === "member") return <Redirect to="/" />;

  return (
    <AppLayout breadcrumbs={[{ label: "Visitantes", href: "/visitors" }, { label: "Novo Visitante" }]}>
      <h1 className="text-2xl font-bold mb-6">Novo Visitante</h1>
      <VisitorForm />
    </AppLayout>
  );
}
