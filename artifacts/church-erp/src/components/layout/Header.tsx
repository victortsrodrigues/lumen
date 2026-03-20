import { Bell, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

export function Header({ title }: { title: string }) {
  const [isDark, setIsDark] = useState(false);

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

  return (
    <header className="h-16 flex items-center justify-between px-8 bg-card/50 backdrop-blur-sm border-b border-border/50 sticky top-0 z-10">
      <h1 className="text-xl font-bold text-foreground font-display tracking-tight">{title}</h1>
      
      <div className="flex items-center gap-4">
        <button className="p-2 text-muted-foreground hover:text-foreground transition-colors relative rounded-full hover:bg-secondary">
          <Bell className="w-5 h-5" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-primary rounded-full ring-2 ring-card"></span>
        </button>
        
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
