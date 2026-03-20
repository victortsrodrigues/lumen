import React from 'react';
import { Hexagon } from 'lucide-react';

interface AuthLayoutProps {
  children: React.ReactNode;
  title: string;
  subtitle: string;
}

export function AuthLayout({ children, title, subtitle }: AuthLayoutProps) {
  return (
    <div className="min-h-screen flex bg-background selection:bg-primary/20">
      {/* Left side - Form */}
      <div className="w-full lg:w-[480px] xl:w-[560px] flex flex-col justify-center px-8 sm:px-16 py-12 relative z-10 bg-card shadow-2xl shadow-black/5">
        <div className="absolute top-8 left-8 sm:left-16 flex items-center">
          <Hexagon className="w-8 h-8 text-primary mr-3 fill-primary/10" />
          <span className="font-display font-bold text-xl tracking-tight text-foreground">
            Igreja<span className="text-primary">ERP</span>
          </span>
        </div>
        
        <div className="w-full max-w-md mx-auto">
          <div className="mb-8">
            <h1 className="text-3xl font-display font-bold text-foreground mb-2">{title}</h1>
            <p className="text-muted-foreground">{subtitle}</p>
          </div>
          
          {children}
        </div>
      </div>

      {/* Right side - Image/Decoration */}
      <div className="hidden lg:flex flex-1 relative overflow-hidden bg-slate-900">
        {/* Unsplash fallback in case generated image fails, but using generated image path */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary/80 to-slate-900/90 mix-blend-multiply z-10" />
        <img 
          src={`${import.meta.env.BASE_URL}images/auth-bg.png`}
          alt="Church Architecture" 
          className="absolute inset-0 w-full h-full object-cover object-center opacity-80"
        />
        
        <div className="absolute inset-0 z-20 flex flex-col justify-center p-16 lg:p-24 text-white">
          <div className="max-w-xl">
            <div className="inline-flex items-center px-4 py-2 rounded-full bg-white/10 backdrop-blur-md border border-white/20 mb-6">
              <span className="w-2 h-2 rounded-full bg-green-400 mr-2 animate-pulse"></span>
              <span className="text-sm font-medium">Sistema Operacional</span>
            </div>
            <h2 className="text-4xl lg:text-5xl font-display font-bold leading-tight mb-6 text-transparent bg-clip-text bg-gradient-to-r from-white to-white/70">
              Gestão inteligente para sua comunidade.
            </h2>
            <p className="text-lg text-white/70 leading-relaxed">
              Uma plataforma completa e segura para organizar membros, finanças, eventos e fortalecer a comunicação da sua igreja.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
