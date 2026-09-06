import React from 'react';
import { LegalLinks } from '@/components/legal/LegalLinks';

interface AuthLayoutProps {
  children: React.ReactNode;
  title: string;
  subtitle?: string;
}

export function AuthLayout({ children, title, subtitle }: AuthLayoutProps) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-6 py-10 selection:bg-primary/20">
      <div className="w-full max-w-md">
        <div className="mb-10 flex items-center justify-center">
          <img src="/lumen-symbol.svg" alt="" className="mr-3 h-9 w-9" />
          <span className="font-display text-2xl font-bold tracking-tight text-foreground">
            LUMEN
          </span>
        </div>

        <div className="mb-8 text-center">
          <h1 className="font-display text-3xl font-bold text-foreground">{title}</h1>
          {subtitle && <p className="mt-2 text-muted-foreground">{subtitle}</p>}
        </div>

        {children}
        <LegalLinks />
      </div>
    </div>
  );
}
