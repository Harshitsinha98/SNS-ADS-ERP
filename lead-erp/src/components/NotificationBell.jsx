/**
 * NotificationBell — header notification icon with unread badge + dropdown panel.
 *
 * Shows real-time notifications for:
 *  - Employee: "chat_assigned" — new customer chat assigned to them
 *  - Admin: "escalation_alert" — employee didn't reply within 3 minutes
 *  - Generic: any text notification
 *
 * Plays a sound and requests browser notification permission on first render.
 * When a NEW notification arrives, plays a chime and shows a browser notification.
 */

import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, MessageCircle, AlertTriangle, X, Check } from "lucide-react";
import { useNotifications } from "../context/NotificationsContext";
import { useAuth } from "../context/AuthContext";

// Notification sound — short pleasant chime (base64 encoded tiny WAV)
const NOTIFICATION_SOUND_URL = "https://notificationsounds.com/storage/sounds/file-sounds-1150-pristine.mp3";

const typeConfig = {
  chat_assigned: {
    icon: MessageCircle,
    iconColor: "text-teal-600",
    bgColor: "bg-teal-50",
    borderColor: "border-teal-200",
    label: "New Chat",
  },
  chat_escalated: {
    icon: MessageCircle,
    iconColor: "text-orange-600",
    bgColor: "bg-orange-50",
    borderColor: "border-orange-200",
    label: "Chat Escalated",
  },
  escalation_alert: {
    icon: AlertTriangle,
    iconColor: "text-red-600",
    bgColor: "bg-red-50",
    borderColor: "border-red-200",
    label: "Escalation",
  },
  default: {
    icon: Bell,
    iconColor: "text-orange-600",
    bgColor: "bg-orange-50",
    borderColor: "border-orange-200",
    label: "Notification",
  },
};

function formatTimeAgo(dateStr) {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  if (diff < 60000) return "Just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

export default function NotificationBell() {
  const { notifications, markRead } = useNotifications();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState(null);
  const prevCountRef = useRef(0);
  const audioRef = useRef(null);
  const dropdownRef = useRef(null);

  const unreadCount = notifications.length;

  // Request browser notification permission on mount
  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  // Detect new notifications → play sound + show toast + browser notification
  useEffect(() => {
    if (unreadCount > prevCountRef.current && prevCountRef.current > 0) {
      // New notification arrived
      const newest = notifications.reduce((a, b) =>
        (new Date(b.at || 0).getTime() > new Date(a.at || 0).getTime() ? b : a), notifications[0]);

      // Play sound
      try {
        if (!audioRef.current) {
          audioRef.current = new Audio(NOTIFICATION_SOUND_URL);
          audioRef.current.volume = 0.5;
        }
        audioRef.current.currentTime = 0;
        audioRef.current.play().catch(() => {});
      } catch (e) { /* silent */ }

      // Show in-app toast
      setToast(newest);
      setTimeout(() => setToast(null), 6000);

      // Browser notification
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

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleMarkAllRead = () => {
    if (user?.uid) markRead(user.uid);
    setOpen(false);
  };

  const handleNotificationClick = (notif) => {
    // Navigate to conversations page for chat-related notifications
    if (notif.type === "chat_assigned") {
      navigate("/app/conversations");
    } else if (notif.type === "escalation_alert" || notif.type === "chat_escalated") {
      navigate("/admin/leads");
    }
    setOpen(false);
  };

  return (
    <>
      {/* Bell Icon */}
      <div className="relative" ref={dropdownRef}>
        <button
          onClick={() => setOpen(!open)}
          className="relative p-2 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors"
          aria-label="Notifications"
        >
          <Bell size={20} />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold px-1 animate-pulse">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </button>

        {/* Dropdown Panel */}
        {open && (
          <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 bg-white rounded-2xl shadow-2xl border border-gray-200 z-50 overflow-hidden animate-in fade-in slide-in-from-top-2">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50/50">
              <h3 className="text-sm font-bold text-gray-800">Notifications</h3>
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllRead}
                  className="text-xs font-medium text-teal-600 hover:text-teal-800 flex items-center gap-1 transition-colors"
                >
                  <Check size={12} /> Mark all read
                </button>
              )}
            </div>

            {/* List */}
            <div className="max-h-80 overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="py-10 text-center">
                  <Bell size={28} className="mx-auto text-gray-300 mb-2" />
                  <p className="text-sm text-gray-500">No new notifications</p>
                  <p className="text-xs text-gray-400 mt-0.5">You're all caught up!</p>
                </div>
              ) : (
                notifications
                  .sort((a, b) => new Date(b.at || 0) - new Date(a.at || 0))
                  .map((notif) => {
                    const config = typeConfig[notif.type] || typeConfig.default;
                    const Icon = config.icon;
                    return (
                      <button
                        key={notif.id}
                        onClick={() => handleNotificationClick(notif)}
                        className="w-full text-left px-4 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors flex items-start gap-3"
                      >
                        <div className={`w-9 h-9 rounded-full ${config.bgColor} flex items-center justify-center shrink-0 mt-0.5`}>
                          <Icon size={16} className={config.iconColor} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={`text-[10px] font-bold uppercase tracking-wide ${config.iconColor}`}>
                              {config.label}
                            </span>
                            <span className="text-[10px] text-gray-400">{formatTimeAgo(notif.at)}</span>
                          </div>
                          <p className="text-sm font-medium text-gray-800 mt-0.5 truncate">
                            {notif.title || "Notification"}
                          </p>
                          <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">
                            {notif.text}
                          </p>
                        </div>
                        <span className="w-2 h-2 rounded-full bg-orange-400 shrink-0 mt-2" />
                      </button>
                    );
                  })
              )}
            </div>
          </div>
        )}
      </div>

      {/* Toast Popup — fixed top-right */}
      {toast && (
        <div className="fixed top-4 right-4 z-[100] animate-in slide-in-from-right fade-in duration-300">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 p-4 w-80 flex items-start gap-3">
            <div className={`w-10 h-10 rounded-full ${(typeConfig[toast.type] || typeConfig.default).bgColor} flex items-center justify-center shrink-0`}>
              {(() => {
                const Icon = (typeConfig[toast.type] || typeConfig.default).icon;
                return <Icon size={18} className={(typeConfig[toast.type] || typeConfig.default).iconColor} />;
              })()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-gray-800">{toast.title || "Notification"}</p>
              <p className="text-xs text-gray-600 mt-0.5 line-clamp-2">{toast.text}</p>
              <button
                onClick={() => {
                  handleNotificationClick(toast);
                  setToast(null);
                }}
                className="text-xs font-semibold text-teal-600 mt-1.5 hover:underline"
              >
                View
              </button>
            </div>
            <button onClick={() => setToast(null)} className="text-gray-400 hover:text-gray-600 shrink-0">
              <X size={14} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
