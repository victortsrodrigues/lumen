import { Moon, Sun, ArrowLeft, ChevronRight, Menu } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { NotificationBell } from "@/components/NotificationBell";

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export function Header({ breadcrumbs, onMenuClick }: { breadcrumbs?: BreadcrumbItem[]; onMenuClick?: () => void }) {
  const [isDark, setIsDark] = useState(false);
  const [, setLocation] = useLocation();

  useEffect(() => {
    const isDarkMode = document.documentElement.classList.contains('dark');
    setIsDark(isDarkMode);
  }, []);

  const toggleTheme = () => {
    const root = document.documentElement;
    if (root.classList.contains('dark')) {
      root.classList.remove('dark');
      setIsDark(false);
    } else {
      root.classList.add('dark');
      setIsDark(true);
    }
  };

  // Find the last clickable breadcrumb for the back button
  const backHref = breadcrumbs && breadcrumbs.length > 1
    ? breadcrumbs.filter(b => b.href).pop()?.href
    : undefined;

  const currentLabel = breadcrumbs && breadcrumbs.length > 0
    ? breadcrumbs[breadcrumbs.length - 1].label
    : undefined;

  return (
    <header className="h-16 flex items-center justify-between px-4 md:px-8 bg-card/50 backdrop-blur-sm border-b border-border/50 sticky top-0 z-10 gap-2">
      <div className="flex items-center gap-2 text-sm min-w-0">
        <button
          onClick={onMenuClick}
          className="p-2 hover:bg-secondary rounded-lg transition-colors md:hidden"
          aria-label="Abrir menu"
        >
          <Menu className="h-5 w-5" />
        </button>
        {backHref && (
          <button onClick={() => setLocation(backHref)} className="p-1.5 hover:bg-secondary rounded-lg transition-colors mr-1">
            <ArrowLeft className="h-4 w-4" />
          </button>
        )}
        {/* Mobile: show only current page title */}
        {currentLabel && (
          <span className="sm:hidden text-foreground font-medium truncate">{currentLabel}</span>
        )}
        {/* Desktop/tablet: full breadcrumbs */}
        <div className="hidden sm:flex items-center gap-2 min-w-0">
          {breadcrumbs && breadcrumbs.map((item, i) => (
            <span key={i} className="flex items-center gap-2">
              {i > 0 && <ChevronRight className="h-3 w-3 text-muted-foreground" />}
              {item.href ? (
                <button onClick={() => setLocation(item.href!)} className="text-muted-foreground hover:text-foreground transition-colors">
                  {item.label}
                </button>
              ) : (
                <span className="text-foreground font-medium">{item.label}</span>
              )}
            </span>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2 md:gap-4 shrink-0">
        <NotificationBell />

        <div className="w-px h-6 bg-border/50 mx-1"></div>

        <button
          onClick={toggleTheme}
          className="p-2 text-muted-foreground hover:text-foreground transition-colors rounded-full hover:bg-secondary"
        >
          {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
        </button>
      </div>
    </header>
  );
}
