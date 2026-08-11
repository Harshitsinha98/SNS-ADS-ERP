/**
 * NotificationBell — mobile-native full-screen notification panel.
 * Replaces the web-style dropdown with a bottom-sheet style panel.
 */

import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, MessageCircle, AlertTriangle, X, Check, ChevronLeft } from "lucide-react";
import { useNotifications } from "../context/NotificationsContext";
import { useAuth } from "../context/AuthContext";

const NOTIFICATION_SOUND_URL = "https://notificationsounds.com/storage/sounds/file-sounds-1150-pristine.mp3";

const typeConfig = {
  chat_assigned: {
    icon: MessageCircle,
    iconColor: "text-teal-600",
    bgColor: "bg-teal-50",
    label: "New Chat",
  },
  chat_escalated: {
    icon: MessageCircle,
    iconColor: "text-orange-600",
    bgColor: "bg-orange-50",
    label: "Escalated",
  },
  escalation_alert: {
    icon: AlertTriangle,
    iconColor: "text-red-600",
    bgColor: "bg-red-50",
    label: "Alert",
  },
  default: {
    icon: Bell,
    iconColor: "text-orange-600",
    bgColor: "bg-orange-50",
    label: "Update",
  },
};

function formatTimeAgo(dateStr) {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  if (diff < 60000) return "now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
  return `${Math.floor(diff / 86400000)}d`;
}

export default function NotificationBell() {
  const { notifications, markRead } = useNotifications();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState(null);
  const prevCountRef = useRef(0);
  const audioRef = useRef(null);

  const unreadCount = notifications.length;

  // Request browser notification permission on mount
  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  // Detect new notifications → play sound + show toast
  useEffect(() => {
    if (unreadCount > prevCountRef.current && prevCountRef.current > 0) {
      const newest = notifications.reduce((a, b) =>
        (new Date(b.at || 0).getTime() > new Date(a.at || 0).getTime() ? b : a), notifications[0]);

      try {
        if (!audioRef.current) {
          audioRef.current = new Audio(NOTIFICATION_SOUND_URL);
          audioRef.current.volume = 0.5;
        }
        audioRef.current.currentTime = 0;
        audioRef.current.play().catch(() => {});
      } catch (e) { /* silent */ }

      setToast(newest);
      setTimeout(() => setToast(null), 4000);

      if ("Notification" in window && Notification.permission === "granted") {
        try {
          new Notification(newest.title || "New Notification", {
            body: newest.text || "",
            icon: "/favicon.ico",
            tag: newest.id,
          });
        } catch (e) { /* silent */ }
      }
    }
    prevCountRef.current = unreadCount;
  }, [unreadCount, notifications]);

  // Prevent body scroll when panel is open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  const handleMarkAllRead = () => {
    if (user?.uid) markRead(user.uid);
  };

  const handleNotificationClick = (notif) => {
    if (notif.type === "chat_assigned") {
      navigate("/app/conversations");
    } else if (notif.type === "escalation_alert" || notif.type === "chat_escalated") {
      navigate("/admin/leads");
    }
    setOpen(false);
  };

  return (
    <>
      {/* Bell Icon Button */}
      <button
        onClick={() => setOpen(true)}
        className="relative w-9 h-9 flex items-center justify-center rounded-full tap-highlight"
      >
        <Bell size={19} className="text-ink-soft" />
        {unreadCount > 0 && (
          <span className="absolute top-0.5 right-0.5 min-w-[16px] h-4 flex items-center justify-center rounded-full bg-danger-500 text-white text-[9px] font-bold px-1">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {/* Full-Screen Notification Panel */}
      {open && (
        <div className="fixed inset-0 z-[60] bg-white animate-slide-left" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
          {/* Header */}
          <div className="flex items-center justify-between px-4 h-14 border-b border-cream-100">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setOpen(false)}
                className="w-9 h-9 flex items-center justify-center rounded-full tap-highlight"
              >
                <ChevronLeft size={22} className="text-ink" />
              </button>
              <h2 className="text-base font-display font-bold text-ink">Notifications</h2>
            </div>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="text-xs font-semibold text-orange-600 flex items-center gap-1 px-3 py-2 rounded-lg tap-highlight"
              >
                <Check size={14} /> Clear all
              </button>
            )}
          </div>

          {/* Notification List */}
          <div className="flex-1 overflow-y-auto scroll-rubber" style={{ height: 'calc(100dvh - 3.5rem - env(safe-area-inset-top))' }}>
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full px-8">
                <div className="w-16 h-16 rounded-full bg-cream-100 flex items-center justify-center mb-4">
                  <Bell size={28} className="text-cream-400" />
                </div>
                <p className="text-base font-semibold text-ink-soft">All caught up!</p>
                <p className="text-sm text-ink-muted mt-1 text-center">No new notifications right now</p>
              </div>
            ) : (
              <div>
                {notifications
                  .sort((a, b) => new Date(b.at || 0) - new Date(a.at || 0))
                  .map((notif) => {
                    const config = typeConfig[notif.type] || typeConfig.default;
                    const Icon = config.icon;
                    return (
                      <button
                        key={notif.id}
                        onClick={() => handleNotificationClick(notif)}
                        className="list-item w-full text-left border-b border-cream-100 py-4"
                      >
                        <div className={`w-10 h-10 rounded-full ${config.bgColor} flex items-center justify-center shrink-0`}>
                          <Icon size={18} className={config.iconColor} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className={`text-[10px] font-bold uppercase tracking-wide ${config.iconColor}`}>
                              {config.label}
                            </span>
                            <span className="text-[10px] text-ink-muted num">{formatTimeAgo(notif.at)}</span>
                          </div>
                          <p className="text-sm font-medium text-ink truncate">
                            {notif.title || "Notification"}
                          </p>
                          <p className="text-xs text-ink-muted mt-0.5 line-clamp-2">
                            {notif.text}
                          </p>
                        </div>
                        <div className="w-2 h-2 rounded-full bg-orange-400 shrink-0" />
                      </button>
                    );
                  })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Toast — top banner style */}
      {toast && !open && (
        <div className="fixed top-0 left-0 right-0 z-[100] animate-slide-down" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
          <div className="mx-3 mt-2 bg-white rounded-2xl shadow-soft border border-cream-200 p-3 flex items-center gap-3">
            <div className={`w-9 h-9 rounded-full ${(typeConfig[toast.type] || typeConfig.default).bgColor} flex items-center justify-center shrink-0`}>
              {(() => {
                const Icon = (typeConfig[toast.type] || typeConfig.default).icon;
                return <Icon size={16} className={(typeConfig[toast.type] || typeConfig.default).iconColor} />;
              })()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-ink truncate">{toast.title || "Notification"}</p>
              <p className="text-xs text-ink-muted truncate">{toast.text}</p>
            </div>
            <button onClick={() => setToast(null)} className="w-7 h-7 flex items-center justify-center rounded-full bg-cream-100 shrink-0">
              <X size={12} className="text-ink-muted" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
