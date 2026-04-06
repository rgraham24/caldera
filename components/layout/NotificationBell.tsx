"use client";

import { useState, useEffect, useRef } from "react";
import { Bell } from "lucide-react";
import { useAppStore } from "@/store";
import { formatRelativeTime } from "@/lib/utils";

type Notification = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  read_at: string | null;
  created_at: string;
};

export function NotificationBell() {
  const { isConnected } = useAppStore();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const unread = notifications.filter((n) => !n.read_at).length;

  useEffect(() => {
    if (!isConnected) return;

    const fetchNotifications = () => {
      fetch("/api/alerts/check").catch(() => {});
      // For now, notifications are populated via the check endpoint
      // In production, fetch from /api/notifications
    };

    fetchNotifications();
    const iv = setInterval(fetchNotifications, 60000);
    return () => clearInterval(iv);
  }, [isConnected]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (!isConnected) return null;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="relative rounded-lg p-1.5 text-text-muted hover:text-text-primary transition-colors"
      >
        <Bell className="h-4 w-4" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-no text-[9px] font-bold text-white">
            {unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 rounded-2xl border border-border-subtle bg-surface-2 shadow-2xl z-50">
          <div className="flex items-center justify-between border-b border-border-subtle/30 px-4 py-3">
            <h4 className="text-sm font-semibold text-text-primary">Notifications</h4>
            {unread > 0 && (
              <button
                onClick={() => setNotifications((n) => n.map((x) => ({ ...x, read_at: new Date().toISOString() })))}
                className="text-[10px] text-caldera hover:text-caldera/80"
              >
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="px-4 py-8 text-center text-xs text-text-muted">
                No notifications yet. Set price alerts to get notified.
              </p>
            ) : (
              notifications.slice(0, 10).map((n) => (
                <div
                  key={n.id}
                  className={`border-b border-border-subtle/20 px-4 py-3 ${!n.read_at ? "bg-caldera/5" : ""}`}
                >
                  <p className="text-sm text-text-primary">{n.title}</p>
                  {n.body && <p className="mt-0.5 text-xs text-text-muted">{n.body}</p>}
                  <p className="mt-1 text-[10px] text-text-faint">{formatRelativeTime(n.created_at)}</p>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
