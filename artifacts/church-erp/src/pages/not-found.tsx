import { AppLayout } from "@/components/layout/AppLayout";
import { useAuth } from "@/hooks/use-auth-context";
import { Link } from "wouter";
import { FileQuestion, ArrowLeft } from "lucide-react";

export default function NotFound() {
  const { isAuthenticated } = useAuth();

  const Content = (
    <div className="min-h-[60vh] flex flex-col items-center justify-center text-center">
      <div className="w-24 h-24 bg-secondary rounded-3xl flex items-center justify-center mb-8 rotate-3 shadow-sm border border-border">
        <FileQuestion className="w-10 h-10 text-muted-foreground -rotate-3" />
      </div>
      <h1 className="text-4xl font-display font-bold text-foreground mb-4 tracking-tight">Página não encontrada</h1>
      <p className="text-lg text-muted-foreground max-w-md mb-8">
        A página que você está procurando pode ter sido removida, mudou de nome ou está temporariamente indisponível.
      </p>
      <Link href="/" className="inline-flex items-center justify-center px-6 py-3 rounded-xl font-semibold text-white bg-primary hover:bg-primary/90 shadow-lg shadow-primary/25 hover:shadow-xl hover:-translate-y-0.5 transition-all duration-200">
        <ArrowLeft className="w-5 h-5 mr-2" />
        Voltar para o início
      </Link>
    </div>
  );

  if (isAuthenticated) {
    return <AppLayout breadcrumbs={[{ label: "Não Encontrado" }]}>{Content}</AppLayout>;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      {Content}
    </div>
  );
}
