import { Moon, Sun, ArrowLeft, ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { NotificationBell } from "@/components/NotificationBell";

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export function Header({ breadcrumbs }: { breadcrumbs?: BreadcrumbItem[] }) {
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

  return (
    <header className="h-16 flex items-center justify-between px-8 bg-card/50 backdrop-blur-sm border-b border-border/50 sticky top-0 z-10">
      <div className="flex items-center gap-2 text-sm">
        {backHref && (
          <button onClick={() => setLocation(backHref)} className="p-1.5 hover:bg-secondary rounded-lg transition-colors mr-1">
            <ArrowLeft className="h-4 w-4" />
          </button>
        )}
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

      <div className="flex items-center gap-4">
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
