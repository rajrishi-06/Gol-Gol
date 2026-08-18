import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, Check, BellRing } from "lucide-react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth.jsx";
import { markNotificationRead, markAllNotificationsRead } from "../lib/notify";
import { enablePush, pushPermission, pushSupported } from "../lib/push";
import { cn } from "../lib/cn";

function timeAgo(iso) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function NotificationBell() {
  const navigate = useNavigate();
  const { userId } = useAuth();
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [perm, setPerm] = useState(() => pushPermission());
  const wrapRef = useRef(null);

  const unread = items.filter((n) => !n.read).length;

  // Load recent notifications and keep them live. Identity comes from the auth
  // context, so the bell can't disagree with the rest of the app about who is
  // signed in.
  useEffect(() => {
    if (!userId) {
      setItems([]);
      return undefined;
    }
    let active = true;
    (async () => {
      const { data } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(20);
      if (active) setItems(data || []);
    })();

    const channel = supabase
      .channel(`notif-bell:${userId}:${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` }, (p) =>
        setItems((prev) => [p.new, ...prev].slice(0, 20))
      )
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` }, (p) =>
        setItems((prev) => prev.map((n) => (n.id === p.new.id ? p.new : n)))
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [userId]);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onClick = (e) => wrapRef.current && !wrapRef.current.contains(e.target) && setOpen(false);
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const openItem = (n) => {
    if (!n.read) markNotificationRead(n.id);
    setOpen(false);
    if (n.url) navigate(n.url);
  };

  const handleEnablePush = async () => {
    const res = await enablePush(userId);
    setPerm(pushPermission());
    return res;
  };

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
        aria-expanded={open}
        className="relative inline-flex h-10 w-10 items-center justify-center rounded-xl text-muted transition-colors hover:bg-surface-2 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute right-1.5 top-1.5 grid min-h-4 min-w-4 place-items-center rounded-full bg-danger px-1 text-[0.6rem] font-bold leading-none text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-12 z-50 w-[min(20rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-border bg-surface shadow-floating">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <p className="text-sm font-semibold text-foreground">Notifications</p>
            {unread > 0 && (
              <button
                onClick={() => markAllNotificationsRead(userId)}
                className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                <Check className="h-3.5 w-3.5" /> Mark all read
              </button>
            )}
          </div>

          {pushSupported() && perm !== "granted" && (
            <button
              onClick={handleEnablePush}
              className="flex w-full items-center gap-2 border-b border-border bg-primary-subtle px-4 py-2.5 text-left text-xs font-medium text-primary-subtle-fg hover:bg-primary-subtle/80"
            >
              <BellRing className="h-4 w-4 shrink-0" />
              {perm === "denied"
                ? "Notifications are blocked in your browser settings."
                : "Turn on push alerts for ride updates"}
            </button>
          )}

          <ul className="max-h-80 divide-y divide-border overflow-y-auto">
            {items.length === 0 && (
              <li className="px-4 py-8 text-center text-sm text-muted">You're all caught up.</li>
            )}
            {items.map((n) => (
              <li key={n.id}>
                <button
                  onClick={() => openItem(n)}
                  className={cn(
                    "flex w-full items-start gap-2.5 px-4 py-3 text-left transition-colors hover:bg-surface-2",
                    !n.read && "bg-primary-subtle/40"
                  )}
                >
                  <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", n.read ? "bg-transparent" : "bg-primary")} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-foreground">{n.title}</span>
                    {n.body && <span className="block truncate text-xs text-muted">{n.body}</span>}
                    <span className="mt-0.5 block text-[0.7rem] text-subtle">{timeAgo(n.created_at)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
