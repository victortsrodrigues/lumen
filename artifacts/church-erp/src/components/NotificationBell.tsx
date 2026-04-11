import { useState, useRef, useEffect } from "react";
import {
  useListNotifications,
  useGetUnreadNotificationsCount,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
  useClearReadNotifications,
  useDeleteNotification,
} from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { Bell, CheckCheck, Inbox, Loader2, Trash2, X } from "lucide-react";

function formatRelative(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min}min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h}h`;
  const days = Math.floor(h / 24);
  if (days < 7) return `há ${days}d`;
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const [, setLocation] = useLocation();

  // Poll unread count every 30s so the badge stays fresh
  const { data: unreadData } = useGetUnreadNotificationsCount({
    query: { refetchInterval: 30000, refetchOnWindowFocus: true },
  });
  const unreadCount = unreadData?.count || 0;

  const { data, isLoading } = useListNotifications(
    { limit: 30 },
    { query: { enabled: open } },
  );

  const markRead = useMarkNotificationRead({ mutation: { meta: { silentError: true } as any } });
  const markAllRead = useMarkAllNotificationsRead({ mutation: { meta: { silentError: true } as any } });
  const clearRead = useClearReadNotifications({ mutation: { meta: { silentError: true } as any } });
  const deleteOne = useDeleteNotification({ mutation: { meta: { silentError: true } as any } });

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const notifications = data?.notifications || [];

  const handleClick = (n: any) => {
    if (!n.readAt) markRead.mutate({ id: n.id });
    setOpen(false);
    if (n.link) setLocation(n.link);
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="p-2 text-muted-foreground hover:text-foreground transition-colors relative rounded-full hover:bg-secondary"
        title="Notificações"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute top-0 right-0 min-w-[18px] h-[18px] px-1 bg-red-500 text-white rounded-full text-[10px] font-bold flex items-center justify-center ring-2 ring-card">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-96 max-h-[70vh] bg-card border rounded-2xl shadow-lg overflow-hidden z-50 flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b gap-2">
            <h3 className="font-semibold text-sm">Notificações</h3>
            <div className="flex items-center gap-3">
              {unreadCount > 0 && (
                <button
                  onClick={() => markAllRead.mutate(undefined as any)}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                  title="Marcar todas como lidas"
                >
                  <CheckCheck className="h-3 w-3" /> Marcar lidas
                </button>
              )}
              {notifications.some((n: any) => n.readAt) && (
                <button
                  onClick={() => clearRead.mutate(undefined as any)}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive"
                  title="Remover notificações já lidas"
                >
                  <Trash2 className="h-3 w-3" /> Limpar lidas
                </button>
              )}
            </div>
          </div>

          <div className="overflow-y-auto flex-1">
            {isLoading && (
              <div className="flex justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            )}

            {!isLoading && notifications.length === 0 && (
              <div className="text-center py-12 text-muted-foreground">
                <Inbox className="h-10 w-10 mx-auto mb-2 opacity-30" />
                <p className="text-sm">Nenhuma notificação ainda.</p>
              </div>
            )}

            {!isLoading && notifications.length > 0 && (
              <ul className="divide-y">
                {notifications.map((n: any) => (
                  <li
                    key={n.id}
                    className={`relative group ${!n.readAt ? "bg-primary/5" : ""}`}
                  >
                    <button
                      onClick={() => handleClick(n)}
                      className="w-full text-left px-4 py-3 pr-10 hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-start gap-3">
                        {!n.readAt && (
                          <div className="w-2 h-2 rounded-full bg-primary mt-1.5 shrink-0" />
                        )}
                        <div className={`flex-1 min-w-0 ${n.readAt ? "pl-5" : ""}`}>
                          <p className={`text-sm ${!n.readAt ? "font-semibold" : "font-medium"}`}>
                            {n.title}
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                            {n.message}
                          </p>
                          <p className="text-[10px] text-muted-foreground mt-1">
                            {formatRelative(n.createdAt)}
                          </p>
                        </div>
                      </div>
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteOne.mutate({ id: n.id }); }}
                      className="absolute top-3 right-3 p-1 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Remover notificação"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
