import React, { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { Sidebar } from './Sidebar';
import { Header, type BreadcrumbItem } from './Header';
import { useAuth } from '@/hooks/use-auth-context';
import { Redirect } from 'wouter';
import { Loader2 } from 'lucide-react';
import { LegalLinks } from '@/components/legal/LegalLinks';

interface AppLayoutProps {
  children: React.ReactNode;
  breadcrumbs?: BreadcrumbItem[];
  /** @deprecated Use breadcrumbs instead */
  title?: string;
}

export function AppLayout({ children, breadcrumbs }: AppLayoutProps) {
  const { isAuthenticated, isLoading } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [location] = useLocation();

  // Close drawer on navigation (mobile UX)
  useEffect(() => { setSidebarOpen(false); }, [location]);

  // Close drawer on Escape
  useEffect(() => {
    if (!sidebarOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setSidebarOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sidebarOpen]);

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

  const effectiveBreadcrumbs = breadcrumbs || undefined;

  return (
    <div className="flex h-screen bg-background overflow-hidden selection:bg-primary/20">
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 md:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden
        />
      )}
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex-1 flex flex-col min-w-0">
        <Header
          breadcrumbs={effectiveBreadcrumbs}
          onMenuClick={() => setSidebarOpen(true)}
        />
        <main className="flex-1 overflow-y-auto p-4 md:p-8">
          <div className="max-w-6xl mx-auto">
            {children}
            <LegalLinks />
          </div>
        </main>
      </div>
    </div>
  );
}
