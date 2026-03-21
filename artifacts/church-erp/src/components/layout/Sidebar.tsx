import { Link, useLocation } from "wouter";
import { 
  Home, Users, DollarSign, Calendar, 
  Layers, Shield, LogOut, Hexagon,
  ChevronDown, ArrowDownToLine, ArrowUpFromLine, FileBarChart, Lock
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth-context";
import { useState } from "react";

const MENU_ITEMS = [
  { icon: Home, label: "Dashboard", href: "/" },
  { icon: Users, label: "Membros", href: "/members" },
  {
    icon: DollarSign,
    label: "Financeiro",
    href: "/finance",
    subItems: [
      { icon: ArrowDownToLine, label: "Entradas", href: "/finance/entries" },
      { icon: ArrowUpFromLine, label: "Despesas", href: "/finance/expenses" },
      { icon: FileBarChart, label: "Relatórios", href: "/finance/report" },
      { icon: Lock, label: "Fechamentos", href: "/finance/closings" },
    ],
  },
  { icon: Calendar, label: "Eventos", href: "/events", placeholder: true },
  { icon: Layers, label: "Grupos", href: "/groups", placeholder: true },
];

export function Sidebar() {
  const [location] = useLocation();
  const { user, clearSession } = useAuth();
  const [openMenus, setOpenMenus] = useState<Record<string, boolean>>({
    "/finance": location.startsWith("/finance"),
  });

  const getRoleColor = (role?: string) => {
    switch (role) {
      case "admin": return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300";
      case "leader": return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300";
      default: return "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300";
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
    <div className="flex flex-col w-64 h-screen bg-card border-r border-border/50 shadow-sm transition-all duration-300 z-10">
      {/* Logo Area */}
      <div className="flex items-center h-16 px-6 border-b border-border/50">
        <Hexagon className="w-6 h-6 text-primary mr-3 fill-primary/10" />
        <span className="font-display font-bold text-lg tracking-tight text-foreground">
          Igreja<span className="text-primary">ERP</span>
        </span>
      </div>

      {/* Navigation */}
      <div className="flex-1 overflow-y-auto py-6 px-4 space-y-1">
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4 px-2">
          Menu Principal
        </div>

        {MENU_ITEMS.map((item) => {
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
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
                  )}
                >
                  <item.icon
                    className={cn(
                      "w-5 h-5 mr-3 transition-colors",
                      isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
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
                  <div className="mt-1 ml-4 pl-4 border-l border-border/50 space-y-1">
                    {item.subItems!.map((sub) => {
                      const subActive = location === sub.href || location.startsWith(sub.href + "/");
                      return (
                        <Link
                          key={sub.href}
                          href={sub.href}
                          className={cn(
                            "flex items-center px-3 py-2 rounded-xl text-sm font-medium transition-all duration-200 group",
                            subActive
                              ? "bg-primary/10 text-primary"
                              : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
                          )}
                        >
                          <sub.icon
                            className={cn(
                              "w-4 h-4 mr-3 transition-colors",
                              subActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
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
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
              )}
            >
              <item.icon
                className={cn(
                  "w-5 h-5 mr-3 transition-colors",
                  isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
                )}
              />
              {item.label}
              {"placeholder" in item && item.placeholder && (
                <span className="ml-auto text-[10px] font-medium px-2 py-0.5 rounded-full bg-secondary text-muted-foreground">
                  Em breve
                </span>
              )}
            </Link>
          );
        })}

        {user?.role === "admin" && (
          <>
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mt-8 mb-4 px-2">
              Administração
            </div>
            <Link
              href="/audit-logs"
              className={cn(
                "flex items-center px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 group",
                location.startsWith("/audit-logs")
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
              )}
            >
              <Shield
                className={cn(
                  "w-5 h-5 mr-3 transition-colors",
                  location.startsWith("/audit-logs") ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
                )}
              />
              Logs de Auditoria
            </Link>
          </>
        )}
      </div>

      {/* User Profile Footer */}
      <div className="p-4 border-t border-border/50">
        <div className="flex items-center p-3 rounded-2xl bg-secondary/30 border border-border/50">
          <div className="w-10 h-10 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold font-display uppercase">
            {user?.name?.charAt(0) || "U"}
          </div>
          <div className="ml-3 overflow-hidden">
            <p className="text-sm font-semibold text-foreground truncate">{user?.name}</p>
            <div className="flex items-center mt-0.5">
              <span className={cn("text-[10px] px-2 py-0.5 rounded-full font-medium", getRoleColor(user?.role))}>
                {getRoleLabel(user?.role)}
              </span>
            </div>
          </div>
          <button
            onClick={clearSession}
            className="ml-auto p-2 text-muted-foreground hover:text-destructive transition-colors rounded-lg hover:bg-destructive/10"
            title="Sair"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
