// src/components/layout/NotificationBell.jsx
// Notification bell + dropdown (UR9)
import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { notificationsAPI } from '../../services/api';
import { getPaginatedItems } from '../../utils/paginatedResponse';
import { Bell, Check, CheckCheck, Lightbulb, FileText, Clock, AlertCircle } from 'lucide-react';

const typeIcon = {
  insight: <Lightbulb className="w-4 h-4 text-amber-500" />,
  report: <FileText className="w-4 h-4 text-blue-500" />,
  reminder: <Clock className="w-4 h-4 text-emerald-500" />,
  system: <AlertCircle className="w-4 h-4 text-navy-400" />,
};

const POLL_MS = 30_000;

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const ref = useRef(null);
  const navigate = useNavigate();

  const refreshCount = useCallback(async () => {
    try {
      const { data } = await notificationsAPI.unreadCount();
      setUnread(data.data?.count || 0);
    } catch { /* ignore */ }
  }, []);

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await notificationsAPI.list({ limit: 10 });
      setItems(getPaginatedItems(data, 'notifications'));
      setUnread(data.pagination?.unread ?? 0);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshCount();
    const id = setInterval(refreshCount, POLL_MS);
    return () => clearInterval(id);
  }, [refreshCount]);

  // Close on outside click
  useEffect(() => {
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next) loadList();
  };

  const handleClick = async (n) => {
    if (!n.is_read) {
      try { await notificationsAPI.markRead(n.id); } catch { /* ignore */ }
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, is_read: true } : x)));
      setUnread((u) => Math.max(0, u - 1));
    }
    setOpen(false);
    if (n.link) navigate(n.link);
  };

  const markAll = async () => {
    try { await notificationsAPI.markAllRead(); } catch { /* ignore */ }
    setItems((prev) => prev.map((x) => ({ ...x, is_read: true })));
    setUnread(0);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={toggle}
        className="relative p-2 rounded-lg hover:bg-navy-50 text-navy-500 hover:text-navy-700 transition-colors"
        title="Notifications"
        aria-label="Notifications"
      >
        <Bell className="w-5 h-5" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-coral-500 text-white text-[10px] font-bold flex items-center justify-center">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 max-w-[90vw] bg-white rounded-2xl shadow-xl border border-navy-100 z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-navy-50">
            <h3 className="font-display font-bold text-sm text-navy-800">Notifications</h3>
            {unread > 0 && (
              <button onClick={markAll} className="flex items-center gap-1 text-[11px] text-emerald-600 font-semibold hover:text-emerald-700">
                <CheckCheck className="w-3.5 h-3.5" /> Mark all read
              </button>
            )}
          </div>
          <div className="max-h-80 overflow-y-auto">
            {loading ? (
              <div className="p-4"><div className="h-12 skeleton rounded-xl" /></div>
            ) : items.length === 0 ? (
              <p className="text-center text-navy-400 text-sm py-8">You&apos;re all caught up 🎉</p>
            ) : (
              items.map((n) => (
                <button
                  key={n.id}
                  onClick={() => handleClick(n)}
                  className={`w-full text-left px-4 py-3 flex gap-3 hover:bg-navy-50 transition-colors border-b border-navy-50 last:border-0 ${
                    n.is_read ? 'opacity-70' : 'bg-emerald-50/30'
                  }`}
                >
                  <div className="mt-0.5">{typeIcon[n.type] || typeIcon.system}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-navy-800 truncate">{n.title}</p>
                    <p className="text-xs text-navy-500 line-clamp-2">{n.message}</p>
                    <p className="text-[10px] text-navy-400 mt-1">{new Date(n.created_at).toLocaleString()}</p>
                  </div>
                  {!n.is_read && <span className="w-2 h-2 rounded-full bg-emerald-500 mt-1.5 flex-shrink-0" />}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
