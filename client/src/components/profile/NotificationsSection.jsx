// Profile: report notification preference + inbox (UC-14).
import { useEffect, useState } from 'react';
import { Bell, Check, Loader2 } from 'lucide-react';
import { Card, Alert, Button } from '../ui';
import { reportsAPI } from '../../services/api';
import { useSettings } from '../../contexts/SettingsContext';
import { getApiErrorMessage } from '../../utils/apiErrors';

export default function NotificationsSection() {
  const { t } = useSettings();
  const [items, setItems] = useState(null);
  const [unread, setUnread] = useState(0);
  const [notifyEnabled, setNotifyEnabled] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const { data } = await reportsAPI.listNotifications({ limit: 20 });
      setItems(data.data?.notifications || []);
      setUnread(data.data?.unread_count || 0);
    } catch (err) {
      setItems([]);
      setError(getApiErrorMessage(err, t('reports.notifyLoadFailed')));
    }
  };

  useEffect(() => {
    load();
  }, []);

  const toggleNotify = async () => {
    setBusy(true);
    setError('');
    try {
      const next = !notifyEnabled;
      await reportsAPI.updatePreferences({ report_notify_enabled: next });
      setNotifyEnabled(next);
    } catch (err) {
      setError(getApiErrorMessage(err, t('reports.prefFailed')));
    } finally {
      setBusy(false);
    }
  };

  const markAll = async () => {
    setBusy(true);
    try {
      await reportsAPI.markAllNotificationsRead();
      await load();
    } catch (err) {
      setError(getApiErrorMessage(err, t('reports.notifyLoadFailed')));
    } finally {
      setBusy(false);
    }
  };

  const markOne = async (id) => {
    try {
      await reportsAPI.markNotificationRead(id);
      await load();
    } catch {
      /* ignore single-row race */
    }
  };

  return (
    <Card className="p-5" data-testid="notifications-section">
      <div className="flex items-center gap-2 mb-3">
        <Bell className="w-5 h-5 text-emerald-600" aria-hidden />
        <h3 className="font-display font-semibold text-navy-900">{t('reports.notifyTitle')}</h3>
        {unread > 0 && (
          <span className="text-xs bg-emerald-100 text-emerald-800 rounded-full px-2 py-0.5" data-testid="unread-count">
            {unread}
          </span>
        )}
      </div>
      <p className="text-sm text-navy-500 mb-4">{t('reports.notifyDesc')}</p>

      <label className="flex items-center gap-2 text-sm text-navy-700 mb-4 cursor-pointer">
        <input
          type="checkbox"
          checked={notifyEnabled}
          onChange={toggleNotify}
          disabled={busy}
          data-testid="notify-toggle"
          className="rounded border-navy-300"
        />
        {t('reports.notifyEnabled')}
      </label>

      {error && <Alert tone="error" className="mb-3">{error}</Alert>}

      <div className="flex justify-end mb-2">
        <Button type="button" variant="ghost" size="sm" onClick={markAll} disabled={busy || unread === 0} data-testid="mark-all-read">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : t('reports.markAllRead')}
        </Button>
      </div>

      {items === null ? (
        <p className="text-sm text-navy-400">{t('common.loading')}</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-navy-400" data-testid="notify-empty">{t('reports.notifyEmpty')}</p>
      ) : (
        <ul className="space-y-2" data-testid="notify-list">
          {items.map((n) => (
            <li
              key={n.id}
              className={`rounded-lg border p-3 text-sm ${n.read_at ? 'border-navy-100 opacity-70' : 'border-emerald-200 bg-emerald-50/40'}`}
            >
              <div className="font-medium text-navy-900">{n.title}</div>
              <p className="text-navy-600 mt-0.5">{n.body}</p>
              {!n.read_at && (
                <button
                  type="button"
                  className="mt-2 text-xs text-emerald-700 flex items-center gap-1"
                  onClick={() => markOne(n.id)}
                  data-testid={`mark-read-${n.id}`}
                >
                  <Check className="w-3 h-3" /> {t('reports.markRead')}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
