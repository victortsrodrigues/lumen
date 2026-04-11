import { Link, useLocation } from "wouter";
import {
  Home, Users, DollarSign, Calendar,
  Layers, Shield, ShieldCheck, LogOut,
  ChevronDown, ArrowDownToLine, ArrowUpFromLine, FileBarChart, Lock,
  BookOpen, Library, ClipboardCheck, GraduationCap, User, UsersRound, Package, CalendarCheck, PiggyBank, BarChart3, Target, FileText,
  HeartHandshake, Music, BookMarked, Newspaper, MessageSquare, Globe, QrCode,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth-context";
import { useState } from "react";

// roles: undefined = visible to all, otherwise only visible to listed roles
const MENU_ITEMS = [
  { icon: Home, label: "Dashboard", href: "/" },
  { icon: User, label: "Meu Perfil", href: "/profile", roles: ["leader", "member"] },
  { icon: Users, label: "Membros", href: "/members", roles: ["admin"] },
  {
    icon: DollarSign,
    label: "Financeiro",
    href: "/finance",
    roles: ["admin"],
    subItems: [
      { icon: ArrowDownToLine, label: "Entradas", href: "/finance/entries" },
      { icon: ArrowUpFromLine, label: "Despesas", href: "/finance/expenses" },
      { icon: FileBarChart, label: "Relatórios", href: "/finance/report" },
      { icon: Lock, label: "Fechamentos", href: "/finance/closings" },
      { icon: PiggyBank, label: "Orçamento", href: "/finance/budget" },
      { icon: BarChart3, label: "Orçado vs. Real", href: "/finance/budget/comparison" },
      { icon: QrCode, label: "PIX", href: "/finance/pix" },
    ],
  },
  {
    icon: BookOpen,
    label: "Ensino",
    href: "/teaching",
    subItems: [
      { icon: Library, label: "Cursos", href: "/teaching/courses" },
      { icon: ClipboardCheck, label: "Frequência", href: "/teaching/attendance", roles: ["admin", "leader"] },
      { icon: GraduationCap, label: "Meus Cursos", href: "/teaching/my-courses" },
      { icon: FileText, label: "Conteúdos", href: "/teaching/contents" },
    ],
  },
  { icon: UsersRound, label: "Ministérios", href: "/ministries" },
  { icon: Calendar, label: "Calendário", href: "/events" },
  { icon: HeartHandshake, label: "Acompanhamento", href: "/pastoral", roles: ["admin", "leader"] },
  { icon: ShieldCheck, label: "Aconselhamento", href: "/counseling", roles: ["admin", "leader"] },
  { icon: Music, label: "Músicas", href: "/songs" },
  { icon: BookMarked, label: "Liturgia", href: "/liturgy", roles: ["admin", "leader"] },
  { icon: QrCode, label: "Contribuições", href: "/contributions", roles: ["member", "leader"] },
  { icon: Newspaper, label: "Artigos & Devocionais", href: "/articles" },
  { icon: MessageSquare, label: "Fórum", href: "/forum" },
  { icon: Package, label: "Patrimônio", href: "/assets", roles: ["admin", "leader"] },
  { icon: CalendarCheck, label: "Escalas", href: "/schedules/roles", roles: ["admin"] },
  { icon: Target, label: "Planejamento", href: "/planning", roles: ["admin", "leader"] },
  {
    icon: Shield,
    label: "LGPD",
    href: "/lgpd",
    subItems: [
      { icon: User, label: "Meus Dados", href: "/lgpd/my-data" },
      { icon: Shield, label: "Solicitações", href: "/lgpd/admin-requests", roles: ["admin"] },
    ],
  },
];

export function Sidebar() {
  const [location] = useLocation();
  const { user, clearSession } = useAuth();
  const [openMenus, setOpenMenus] = useState<Record<string, boolean>>({
    "/finance": location.startsWith("/finance"),
    "/teaching": location.startsWith("/teaching"),
    "/lgpd": location.startsWith("/lgpd"),
  });

  // Expand sidebar menus based on current location


  const getRoleColor = (role?: string) => {
    switch (role) {
      case "admin": return "bg-cyan-900/40 text-cyan-300";
      case "leader": return "bg-emerald-900/40 text-emerald-300";
      default: return "bg-white/10 text-white/70";
    }
  };

  const getRoleLabel = (role?: string) => {
    switch (role) {
      case "admin": return "Administrador";
      case "leader": return "Líder";
      default: return "Membro";
    }
  };

  const toggleMenu = (href: string) => {
    setOpenMenus((prev) => ({ ...prev, [href]: !prev[href] }));
  };

  return (
    <div className="flex flex-col w-64 h-screen bg-[#0a0a0a] text-white transition-all duration-300 z-10">
      {/* Logo Area */}
      <div className="flex items-center h-16 px-6 border-b border-white/10">
        <img src="/lumen-symbol.svg" alt="LUMEN" className="w-7 h-7 mr-3" />
        <span className="font-display font-bold text-lg tracking-tight text-white">
          LUMEN
        </span>
      </div>

      {/* Navigation */}
      <div className="flex-1 overflow-y-auto py-6 px-4 space-y-1">
        <div className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-4 px-2">
          Menu Principal
        </div>

        {MENU_ITEMS.filter((item) => !(item as any).roles || (item as any).roles.includes(user?.role)).map((item) => {
          const isActive =
            item.href === "/"
              ? location === "/"
              : location.startsWith(item.href);
          const hasSubItems = "subItems" in item && item.subItems && item.subItems.length > 0;
          const isOpen = openMenus[item.href];

          if (hasSubItems) {
            return (
              <div key={item.href}>
                <button
                  onClick={() => {
                    toggleMenu(item.href);
                    if (!isOpen) {
                      // Navigate to parent on first open
                    }
                  }}
                  className={cn(
                    "w-full flex items-center px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 group relative",
                    isActive
                      ? "bg-[#00c6d7]/15 text-[#00c6d7]"
                      : "text-white/60 hover:bg-white/5 hover:text-white"
                  )}
                >
                  <item.icon
                    className={cn(
                      "w-5 h-5 mr-3 transition-colors",
                      isActive ? "text-[#00c6d7]" : "text-white/40 group-hover:text-white"
                    )}
                  />
                  <Link href={item.href} className="flex-1 text-left" onClick={(e) => e.stopPropagation()}>
                    {item.label}
                  </Link>
                  <ChevronDown
                    className={cn(
                      "w-4 h-4 transition-transform duration-200",
                      isOpen ? "rotate-180" : ""
                    )}
                  />
                </button>

                {isOpen && (
                  <div className="mt-1 ml-4 pl-4 border-l border-white/10 space-y-1">
                    {item.subItems!.filter((sub) => !(sub as any).roles || (sub as any).roles.includes(user?.role)).map((sub) => {
                      const subActive = location === sub.href || location.startsWith(sub.href + "/");
                      return (
                        <Link
                          key={sub.href}
                          href={sub.href}
                          className={cn(
                            "flex items-center px-3 py-2 rounded-xl text-sm font-medium transition-all duration-200 group",
                            subActive
                              ? "bg-[#00c6d7]/15 text-[#00c6d7]"
                              : "text-white/50 hover:bg-white/5 hover:text-white"
                          )}
                        >
                          <sub.icon
                            className={cn(
                              "w-4 h-4 mr-3 transition-colors",
                              subActive ? "text-[#00c6d7]" : "text-white/30 group-hover:text-white"
                            )}
                          />
                          {sub.label}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          }

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 group relative",
                isActive
                  ? "bg-[#00c6d7]/15 text-[#00c6d7]"
                  : "text-white/60 hover:bg-white/5 hover:text-white"
              )}
            >
              <item.icon
                className={cn(
                  "w-5 h-5 mr-3 transition-colors",
                  isActive ? "text-[#00c6d7]" : "text-white/40 group-hover:text-white"
                )}
              />
              {item.label}
              {"placeholder" in item && item.placeholder && (
                <span className="ml-auto text-[10px] font-medium px-2 py-0.5 rounded-full bg-white/10 text-white/50">
                  Em breve
                </span>
              )}
            </Link>
          );
        })}

        {user?.role === "admin" && (
          <>
            <div className="text-xs font-semibold text-white/40 uppercase tracking-wider mt-8 mb-4 px-2">
              Administração
            </div>
            <Link
              href="/pages"
              className={cn(
                "flex items-center px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 group",
                location.startsWith("/pages")
                  ? "bg-[#00c6d7]/15 text-[#00c6d7]"
                  : "text-white/60 hover:bg-white/5 hover:text-white"
              )}
            >
              <Globe
                className={cn(
                  "w-5 h-5 mr-3 transition-colors",
                  location.startsWith("/pages") ? "text-[#00c6d7]" : "text-white/40 group-hover:text-white"
                )}
              />
              Páginas
            </Link>
            <Link
              href="/audit-logs"
              className={cn(
                "flex items-center px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 group",
                location.startsWith("/audit-logs")
                  ? "bg-[#00c6d7]/15 text-[#00c6d7]"
                  : "text-white/60 hover:bg-white/5 hover:text-white"
              )}
            >
              <Shield
                className={cn(
                  "w-5 h-5 mr-3 transition-colors",
                  location.startsWith("/audit-logs") ? "text-[#00c6d7]" : "text-white/40 group-hover:text-white"
                )}
              />
              Logs de Auditoria
            </Link>
          </>
        )}
      </div>

      {/* User Profile Footer */}
      <div className="p-4 border-t border-white/10">
        <div className="flex items-center p-3 rounded-2xl bg-white/5">
          <div className="w-10 h-10 rounded-full bg-[#00c6d7]/20 text-[#00c6d7] flex items-center justify-center font-bold font-display uppercase">
            {user?.name?.charAt(0) || "U"}
          </div>
          <div className="ml-3 overflow-hidden">
            <p className="text-sm font-semibold text-white truncate">{user?.name}</p>
            <div className="flex items-center mt-0.5">
              <span className={cn("text-[10px] px-2 py-0.5 rounded-full font-medium", getRoleColor(user?.role))}>
                {getRoleLabel(user?.role)}
              </span>
            </div>
          </div>
          <button
            onClick={clearSession}
            className="ml-auto p-2 text-white/40 hover:text-red-400 transition-colors rounded-lg hover:bg-white/5"
            title="Sair"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
