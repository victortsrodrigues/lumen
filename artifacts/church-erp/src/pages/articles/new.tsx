import { useState } from "react";
import { useCreateArticle } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth-context";
import { Loader2, FileText, Info } from "lucide-react";

const CATEGORY_OPTIONS = [
  { value: "artigo", label: "Artigo" },
  { value: "devocional", label: "Devocional" },
];

export default function NewArticlePage() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const isMember = user?.role === "member";

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [category, setCategory] = useState<"" | "artigo" | "devocional">("");

  const createMutation = useCreateArticle({
    mutation: {
      onSuccess: () => {
        toast({
          title: isMember ? "Enviado para revisão!" : "Sucesso",
          description: isMember
            ? "Seu envio será analisado por um administrador antes de ser publicado."
            : "Artigo criado com sucesso.",
        });
        setLocation("/articles");
      },
      // Global onError in App.tsx shows the backend error message automatically.
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !body.trim() || !category) {
      toast({ title: "Erro", description: "Preencha todos os campos obrigatorios.", variant: "destructive" });
      return;
    }
    createMutation.mutate({
      data: {
        title: title.trim(),
        body: body.trim(),
        ...(excerpt.trim() ? { excerpt: excerpt.trim() } : {}),
        category,
      },
    });
  }

  return (
    <AppLayout breadcrumbs={[{ label: "Artigos & Devocionais", href: "/articles" }, { label: "Novo" }]}>
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold flex items-center gap-2 mb-2">
          <FileText className="h-6 w-6" /> Novo Artigo ou Devocional
        </h1>
        <p className="text-sm text-muted-foreground mb-6">
          Compartilhe uma reflexão, estudo ou devocional com a comunidade.
        </p>

        {isMember && (
          <div className="mb-6 rounded-xl border border-blue-200 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-900/50 p-4 flex gap-3">
            <Info className="h-5 w-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
            <div className="text-sm text-blue-900 dark:text-blue-100">
              <p className="font-semibold mb-1">Processo de revisão</p>
              <p>Seu envio será analisado por um administrador antes de ser publicado. Você poderá acompanhar o status e receber feedback na página do artigo.</p>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6 rounded-2xl border bg-card p-6">
          {/* Title */}
          <div>
            <label className="block text-sm font-medium mb-1">Titulo *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg bg-background text-sm"
              placeholder="Titulo do artigo"
            />
          </div>

          {/* Body */}
          <div>
            <label className="block text-sm font-medium mb-1">Conteudo *</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={12}
              className="w-full px-3 py-2 border rounded-lg bg-background text-sm resize-y"
              placeholder="Escreva o conteudo do artigo..."
            />
          </div>

          {/* Excerpt */}
          <div>
            <label className="block text-sm font-medium mb-1">Resumo</label>
            <textarea
              value={excerpt}
              onChange={(e) => setExcerpt(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border rounded-lg bg-background text-sm resize-y"
              placeholder="Breve resumo do artigo (opcional)"
            />
          </div>

          {/* Category */}
          <div>
            <label className="block text-sm font-medium mb-1">Categoria *</label>
            <select
              value={category}
              onChange={(e) => {
                const value = e.target.value;
                if (value === "" || value === "artigo" || value === "devocional") setCategory(value);
              }}
              className="w-full px-3 py-2 border rounded-lg bg-background text-sm"
            >
              <option value="">Selecione uma categoria...</option>
              {CATEGORY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t">
            <button
              type="button"
              onClick={() => setLocation("/articles")}
              className="px-4 py-2 border rounded-lg text-sm hover:bg-muted"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm disabled:opacity-50 flex items-center gap-2"
            >
              {createMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Criar Artigo
            </button>
          </div>
        </form>
      </div>
    </AppLayout>
  );
}
