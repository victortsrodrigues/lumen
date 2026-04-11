import { Link } from "wouter";

export function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-[#0a0a0a] text-white">
        <div className="max-w-4xl mx-auto flex items-center justify-between px-6 h-14">
          <Link href="/site" className="flex items-center gap-2">
            <img src="/lumen-symbol.svg" alt="LUMEN" className="w-6 h-6" />
            <span className="font-bold text-lg tracking-tight">LUMEN</span>
          </Link>
          <div className="flex gap-4 text-sm">
            <Link href="/site" className="text-white/70 hover:text-white">Sobre</Link>
            <Link href="/donate" className="text-white/70 hover:text-white">Contribuir</Link>
            <Link href="/login" className="text-[#00c6d7] hover:text-[#00c6d7]/80">Entrar</Link>
          </div>
        </div>
      </header>
      <main className="max-w-4xl mx-auto px-6 py-8">{children}</main>
    </div>
  );
}
