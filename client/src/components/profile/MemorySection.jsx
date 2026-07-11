// What the assistant remembers about you — list, correct, forget.
// Memory is the model-transfer advantage; without visibility a bad extraction
// poisons every model forever. Rows come straight from /api/memory
// (assistant bookkeeping never crosses the API).
import { useEffect, useState } from 'react';
import { Brain, Pencil, Trash2, Check, X } from 'lucide-react';
import { Card, Alert, Button, Badge, Input } from '../ui';
import { memoryAPI } from '../../services/api';
import { useSettings } from '../../contexts/SettingsContext';

export default function MemorySection() {
  const { t } = useSettings();
  const [memories, setMemories] = useState(null); // null = loading
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);
  const [busy, setBusy] = useState(false);

  // error holds an i18n KEY (translated at render) so this effect runs once.
  useEffect(() => {
    let alive = true;
    memoryAPI.list()
      .then(({ data }) => { if (alive) setMemories(data.data?.memories || []); })
      .catch(() => { if (alive) { setMemories([]); setError('profile.memory.loadFailed'); } });
    return () => { alive = false; };
  }, []);

  const startEdit = (m) => { setEditingId(m.id); setEditValue(m.value); setError(''); };

  const saveEdit = async () => {
    const value = editValue.trim();
    if (!value) return;
    setBusy(true);
    try {
      const { data } = await memoryAPI.update(editingId, value);
      setMemories((rows) => rows.map((m) => (m.id === editingId ? data.data.memory : m)));
      setEditingId(null);
    } catch {
      setError('profile.memory.saveFailed');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id) => {
    setBusy(true);
    try {
      await memoryAPI.remove(id);
      setMemories((rows) => rows.filter((m) => m.id !== id));
    } catch {
      setError('profile.memory.saveFailed');
    } finally {
      setBusy(false);
    }
  };

  const clearAll = async () => {
    setBusy(true);
    try {
      await memoryAPI.clear();
      setMemories([]);
      setConfirmClear(false);
    } catch {
      setError('profile.memory.saveFailed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card data-testid="memory-section">
      <Card.Header icon={Brain} title={t('profile.memory.title')} />
      <Card.Body>
        <div className="space-y-4">
          <p className="text-sm text-navy-500">{t('profile.memory.desc')}</p>
          {error && <Alert tone="error" onDismiss={() => setError('')}>{t(error)}</Alert>}

          {memories === null ? (
            <p className="text-sm text-navy-400">…</p>
          ) : memories.length === 0 ? (
            <p className="text-sm text-navy-400" data-testid="memory-empty">{t('profile.memory.empty')}</p>
          ) : (
            <ul className="divide-y divide-navy-100">
              {memories.map((m) => (
                <li key={m.id} className="py-2.5 flex items-center gap-3" data-testid={`memory-row-${m.id}`}>
                  {editingId === m.id ? (
                    <>
                      <Input
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        maxLength={240}
                        className="flex-1"
                        data-testid="memory-edit-input"
                      />
                      <button type="button" onClick={saveEdit} disabled={busy} className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50" aria-label={t('profile.memory.save')} data-testid="memory-save">
                        <Check className="w-4 h-4" />
                      </button>
                      <button type="button" onClick={() => setEditingId(null)} className="p-1.5 rounded-lg text-navy-400 hover:bg-navy-50" aria-label={t('profile.memory.cancel')}>
                        <X className="w-4 h-4" />
                      </button>
                    </>
                  ) : (
                    <>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-navy-800 truncate">{m.value}</p>
                        <p className="text-[11px] text-navy-400 mt-0.5">
                          {t(`profile.memory.cat.${m.category}`)}
                          {' · '}
                          {m.source === 'user' ? t('profile.memory.sourceUser') : t('profile.memory.sourceChat')}
                        </p>
                      </div>
                      {m.source === 'user' && <Badge tone="emerald">{t('profile.memory.corrected')}</Badge>}
                      <button type="button" onClick={() => startEdit(m)} className="p-1.5 rounded-lg text-navy-400 hover:text-navy-700 hover:bg-navy-50" aria-label={t('profile.memory.edit')} data-testid={`memory-edit-${m.id}`}>
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button type="button" onClick={() => remove(m.id)} disabled={busy} className="p-1.5 rounded-lg text-navy-400 hover:text-coral-500 hover:bg-coral-50" aria-label={t('profile.memory.delete')} data-testid={`memory-delete-${m.id}`}>
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}

          {memories?.length > 0 && (
            !confirmClear ? (
              <button type="button" onClick={() => setConfirmClear(true)} className="text-xs text-navy-400 hover:text-coral-500 underline" data-testid="memory-clear">
                {t('profile.memory.clearAll')}
              </button>
            ) : (
              <div className="flex items-center gap-3 p-3 rounded-xl border border-coral-200 bg-coral-50/50">
                <p className="text-sm text-coral-700 flex-1">{t('profile.memory.clearConfirm')}</p>
                <Button variant="danger" size="sm" onClick={clearAll} disabled={busy} data-testid="memory-clear-confirm">
                  {t('profile.memory.clearYes')}
                </Button>
                <Button variant="secondary" size="sm" onClick={() => setConfirmClear(false)}>
                  {t('profile.memory.cancel')}
                </Button>
              </div>
            )
          )}
        </div>
      </Card.Body>
    </Card>
  );
}
