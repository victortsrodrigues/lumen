import React from 'react';
import { Sidebar } from './Sidebar';
import { Header, type BreadcrumbItem } from './Header';
import { useAuth } from '@/hooks/use-auth-context';
import { Redirect } from 'wouter';
import { Loader2 } from 'lucide-react';

interface AppLayoutProps {
  children: React.ReactNode;
  breadcrumbs?: BreadcrumbItem[];
  /** @deprecated Use breadcrumbs instead */
  title?: string;
}

export function AppLayout({ children, breadcrumbs, title }: AppLayoutProps) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-muted-foreground font-medium animate-pulse">Carregando sistema...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Redirect to="/login" />;
  }

  // Backwards compatibility: if title is passed without breadcrumbs, don't show breadcrumbs
  const effectiveBreadcrumbs = breadcrumbs || undefined;

  return (
    <div className="flex h-screen bg-background overflow-hidden selection:bg-primary/20">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Header breadcrumbs={effectiveBreadcrumbs} />
        <main className="flex-1 overflow-y-auto p-8">
          <div className="max-w-6xl mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
