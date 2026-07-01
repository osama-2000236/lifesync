import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { externalAPI, healthAPI, financeAPI } from '../services/api';
import { useSettings } from '../contexts/SettingsContext';
import { getApiErrorMessage } from '../utils/apiErrors';
import { getPaginatedItems } from '../utils/paginatedResponse';
import { Card, Alert, Button } from '../components/ui';
import {
  ArrowLeft, RefreshCw, Unlink, CheckCircle,
  Loader2, Download, FileJson, FileSpreadsheet, Heart,
  Smartphone, Cloud, Zap, Info,
} from 'lucide-react';

function StatusBadge({ connected, t }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${
      connected ? 'bg-emerald-50 text-emerald-700' : 'bg-navy-100 text-navy-500'
    }`}>
      <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-emerald-500' : 'bg-navy-400'}`} />
      {connected ? t('integrations.connected') : t('integrations.notConnected')}
    </span>
  );
}

/** Splits a translated "...{token}..." string around a unique marker so a styled
 * value can be inserted at the right position regardless of language word order. */
function splitAroundToken(translated, marker) {
  const idx = translated.indexOf(marker);
  if (idx === -1) return [translated, ''];
  return [translated.slice(0, idx), translated.slice(idx + marker.length)];
}

function GoogleFitPanel({ status, onRefreshStatus }) {
  const { t } = useSettings();
  const connected = status?.connected;
  const connectedAt = status?.connectedAt;
  const [syncing, setSyncing] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [selectedTypes, setSelectedTypes] = useState(['steps', 'sleep']);
  const [days, setDays] = useState(7);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');

  const GOOGLE_FIT_TYPES = [
    { id: 'steps', label: t('health.type.steps') },
    { id: 'calories', label: t('integrations.calories') },
    { id: 'sleep', label: t('health.type.sleep') },
    { id: 'heart_rate', label: t('health.type.heart_rate') },
  ];

  const handleConnect = async () => {
    setConnecting(true);
    setError('');
    try {
      const { data } = await externalAPI.connect('google_fit');
      if (data.data?.url) {
        window.location.href = data.data.url;
      } else {
        setError(t('integrations.connectUrlMissing'));
      }
    } catch (err) {
      setError(getApiErrorMessage(err, t('integrations.connectFailed')));
    } finally {
      setConnecting(false);
    }
  };

  const toggleType = (id) => {
    setSelectedTypes((prev) => (
      prev.includes(id) ? prev.filter((type) => type !== id) : [...prev, id]
    ));
  };

  const handleSync = async () => {
    if (!selectedTypes.length) {
      setError(t('integrations.selectAtLeastOne'));
      return;
    }

    setSyncing(true);
    setError('');
    setOk('');
    try {
      const { data } = await externalAPI.sync('google_fit', { dataTypes: selectedTypes, days });
      const payload = data.data;
      setOk(t('integrations.syncResult', { new: payload.new_entries, dup: payload.duplicates_skipped }));
    } catch (err) {
      setError(getApiErrorMessage(err, t('integrations.syncFailed')));
    } finally {
      setSyncing(false);
    }
  };

  const handleDisconnect = async () => {
    if (!window.confirm(t('integrations.disconnectConfirm'))) return;

    setDisconnecting(true);
    setError('');
    try {
      await externalAPI.disconnect('google_fit');
      setOk(t('integrations.disconnected'));
      onRefreshStatus();
    } catch (err) {
      setError(getApiErrorMessage(err, t('integrations.disconnectFailed')));
    } finally {
      setDisconnecting(false);
    }
  };

  const [daysBefore, daysAfter] = splitAroundToken(t('integrations.syncLastDays', { days: '@@DAYS@@' }), '@@DAYS@@');

  return (
    <Card>
      <Card.Header icon={Heart} iconTone="coral" title={t('integrations.googleFit')} subtitle={t('integrations.googleFitDesc')} />
      <Card.Body className="space-y-4">
        <div className="flex items-center justify-between">
          <StatusBadge connected={connected} t={t} />
          {connected && connectedAt && (
            <span className="text-xs text-navy-400">
              {t('integrations.connectedOn', { date: new Date(connectedAt).toLocaleDateString() })}
            </span>
          )}
        </div>

        {error && <Alert tone="error" onDismiss={() => setError('')}>{error}</Alert>}
        {ok && <Alert tone="success" onDismiss={() => setOk('')}>{ok}</Alert>}

        {!connected ? (
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-navy-50 border border-navy-100 flex gap-3">
              <Info className="w-4 h-4 text-navy-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-navy-500">
                {t('integrations.googleFitInfo')}
              </p>
            </div>
            <Button
              variant="danger"
              className="w-full"
              loading={connecting}
              leftIcon={connecting ? undefined : Heart}
              onClick={handleConnect}
            >
              {t('integrations.connectGoogleFit')}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <p className="text-sm font-medium text-navy-700 mb-2">{t('integrations.dataToSync')}</p>
              <div className="grid grid-cols-2 gap-2">
                {GOOGLE_FIT_TYPES.map(({ id, label }) => (
                  <button
                    key={id}
                    onClick={() => toggleType(id)}
                    className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm transition-all ${
                      selectedTypes.includes(id)
                        ? 'border-emerald-400 bg-emerald-50 text-emerald-700 font-medium'
                        : 'border-navy-200 text-navy-500 hover:border-navy-300'
                    }`}
                  >
                    <div className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                      selectedTypes.includes(id) ? 'bg-emerald-500 border-emerald-500' : 'border-navy-300'
                    }`}
                    >
                      {selectedTypes.includes(id) && (
                        <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 10 10" fill="currentColor">
                          <path d="M8.5 2.5L4 7 1.5 4.5" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round" />
                        </svg>
                      )}
                    </div>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-navy-700">
                {daysBefore}
                <span className="text-emerald-600 font-bold">{days}</span>
                {daysAfter}
              </label>
              <input type="range" min={1} max={30} value={days} onChange={(e) => setDays(Number(e.target.value))} className="w-full mt-2 accent-emerald-500" />
              <div className="flex justify-between text-xs text-navy-400 mt-1">
                <span>{t('integrations.oneDay')}</span><span>{t('integrations.thirtyDays')}</span>
              </div>
            </div>

            <div className="flex gap-3 pt-1">
              <Button
                className="flex-1"
                loading={syncing}
                disabled={!selectedTypes.length}
                leftIcon={syncing ? undefined : RefreshCw}
                onClick={handleSync}
              >
                {t('integrations.syncNow')}
              </Button>
              <Button
                variant="secondary"
                loading={disconnecting}
                leftIcon={disconnecting ? undefined : Unlink}
                onClick={handleDisconnect}
              >
                {t('integrations.disconnect')}
              </Button>
            </div>
          </div>
        )}
      </Card.Body>
    </Card>
  );
}

function AppleHealthPanel() {
  const { t } = useSettings();
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [fileContent, setFileContent] = useState(null);

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target.result);
        setFileContent(Array.isArray(parsed) ? parsed : parsed.data || []);
        setError('');
      } catch {
        setError(t('integrations.invalidJson'));
      }
    };
    reader.readAsText(file);
  };

  const handleSync = async () => {
    if (!fileContent?.length) {
      setError(t('integrations.noDataToSync'));
      return;
    }

    setSyncing(true);
    setError('');
    setOk('');
    try {
      const { data } = await externalAPI.sync('apple_health', { payload: fileContent });
      const payload = data.data;
      setOk(t('integrations.syncResult', { new: payload.new_entries, dup: payload.duplicates_skipped }));
      setFileContent(null);
    } catch (err) {
      setError(getApiErrorMessage(err, t('integrations.appleSyncFailed')));
    } finally {
      setSyncing(false);
    }
  };

  return (
    <Card>
      <Card.Header icon={Smartphone} iconTone="navy" title={t('integrations.appleHealth')} subtitle={t('integrations.appleHealthDesc')} />
      <Card.Body className="space-y-4">
        <div className="p-4 rounded-xl bg-navy-50 border border-navy-100 flex gap-3">
          <Info className="w-4 h-4 text-navy-400 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-navy-500 space-y-1">
            <p>{t('integrations.appleHealthInfo1')}</p>
            <ol className="list-decimal list-inside space-y-0.5 text-xs mt-1">
              <li>{t('integrations.appleStep1')}</li>
              <li>{t('integrations.appleStep2')}</li>
              <li>{t('integrations.appleStep3')}</li>
            </ol>
          </div>
        </div>

        {error && <Alert tone="error" onDismiss={() => setError('')}>{error}</Alert>}
        {ok && <Alert tone="success" onDismiss={() => setOk('')}>{ok}</Alert>}

        <div>
          <label className="block text-sm font-medium text-navy-700 mb-2">{t('integrations.uploadLabel')}</label>
          <label className={`flex flex-col items-center justify-center gap-3 p-6 rounded-xl border-2 border-dashed cursor-pointer transition-all ${
            fileContent ? 'border-emerald-400 bg-emerald-50' : 'border-navy-200 hover:border-navy-300 hover:bg-navy-50'
          }`}
          >
            <input type="file" accept=".json" onChange={handleFileChange} className="sr-only" />
            {fileContent ? (
              <>
                <CheckCircle className="w-8 h-8 text-emerald-500" />
                <div className="text-center">
                  <p className="text-sm font-medium text-emerald-700">{t('integrations.recordsLoaded', { count: fileContent.length })}</p>
                  <p className="text-xs text-emerald-600">{t('integrations.clickToReplace')}</p>
                </div>
              </>
            ) : (
              <>
                <Cloud className="w-8 h-8 text-navy-300" />
                <div className="text-center">
                  <p className="text-sm font-medium text-navy-600">{t('integrations.dropFile')}</p>
                  <p className="text-xs text-navy-400">{t('integrations.orBrowse')}</p>
                </div>
              </>
            )}
          </label>
        </div>

        <Button
          variant="secondary"
          className="w-full"
          loading={syncing}
          disabled={!fileContent?.length}
          leftIcon={syncing ? undefined : RefreshCw}
          onClick={handleSync}
        >
          {t('integrations.importBtn')}
        </Button>
      </Card.Body>
    </Card>
  );
}

function DataExportPanel() {
  const { t } = useSettings();
  const [exporting, setExporting] = useState(null);
  const [error, setError] = useState('');

  const downloadFile = (content, filename, mimeType) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const toCSV = (rows, columns) => {
    if (!rows.length) return `${columns.join(',')}\n`;
    const header = columns.join(',');
    const lines = rows.map((row) => (
      columns.map((column) => {
        const value = row[column] ?? '';
        const stringValue = String(value).replace(/"/g, '""');
        return stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')
          ? `"${stringValue}"`
          : stringValue;
      }).join(',')
    ));
    return [header, ...lines].join('\n');
  };

  const exportData = async (domain, format, domainLabel) => {
    const exportKey = `${domain}-${format}`;
    setExporting(exportKey);
    setError('');

    try {
      const api = domain === 'health' ? healthAPI : financeAPI;
      const { data } = await api.getLogs({ limit: 10000 });
      const rows = getPaginatedItems(data, 'logs');
      const date = new Date().toISOString().slice(0, 10);

      if (format === 'json') {
        downloadFile(JSON.stringify(rows, null, 2), `lifesync-${domain}-${date}.json`, 'application/json');
        return;
      }

      const flatRows = domain === 'health'
        ? rows.map((row) => ({
          id: row.id,
          type: row.type,
          value: row.value,
          value_text: row.value_text,
          duration: row.duration,
          logged_at: row.logged_at,
          source: row.source,
          notes: row.notes,
        }))
        : rows.map((row) => ({
          id: row.id,
          type: row.type,
          amount: row.amount,
          currency: row.currency,
          category_name: row.category?.name || row.category_name || '',
          description: row.description,
          logged_at: row.logged_at,
        }));

      const columns = domain === 'health'
        ? ['id', 'type', 'value', 'value_text', 'duration', 'logged_at', 'source', 'notes']
        : ['id', 'type', 'amount', 'currency', 'category_name', 'description', 'logged_at'];

      downloadFile(toCSV(flatRows, columns), `lifesync-${domain}-${date}.csv`, 'text/csv');
    } catch (err) {
      setError(getApiErrorMessage(err, t('integrations.exportFailed', { domain: domainLabel })));
    } finally {
      setExporting(null);
    }
  };

  const exportCards = [
    {
      domain: 'health',
      label: t('integrations.healthLogs'),
      desc: t('integrations.healthLogsDesc'),
      color: 'text-coral-500',
      bg: 'bg-coral-50',
    },
    {
      domain: 'finance',
      label: t('integrations.financeLogs'),
      desc: t('integrations.financeLogsDesc'),
      color: 'text-amber-500',
      bg: 'bg-amber-50',
    },
  ];

  return (
    <Card>
      <Card.Header icon={Download} iconTone="navy" title={t('integrations.exportTitle')} subtitle={t('integrations.exportSubtitle')} />
      <Card.Body className="space-y-4">
        {error && <Alert tone="error" onDismiss={() => setError('')}>{error}</Alert>}

        {exportCards.map(({ domain, label, desc, color, bg }) => (
          <div key={domain} className="flex items-center gap-4 p-4 rounded-xl border border-navy-100 bg-navy-50/40">
            <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center flex-shrink-0`}>
              <Download className={`w-5 h-5 ${color}`} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-navy-800">{label}</p>
              <p className="text-xs text-navy-400">{desc}</p>
            </div>
            <div className="flex gap-2 flex-shrink-0">
              <button
                onClick={() => exportData(domain, 'json', label)}
                disabled={!!exporting}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-navy-200 text-navy-600 text-xs font-medium hover:bg-white hover:border-navy-300 transition-all disabled:opacity-50"
              >
                {exporting === `${domain}-json` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileJson className="w-3.5 h-3.5" />}
                JSON
              </button>
              <button
                onClick={() => exportData(domain, 'csv', label)}
                disabled={!!exporting}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-navy-200 text-navy-600 text-xs font-medium hover:bg-white hover:border-navy-300 transition-all disabled:opacity-50"
              >
                {exporting === `${domain}-csv` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileSpreadsheet className="w-3.5 h-3.5" />}
                CSV
              </button>
            </div>
          </div>
        ))}

        <p className="text-xs text-navy-400">
          {t('integrations.exportNote')}
        </p>
      </Card.Body>
    </Card>
  );
}

export default function IntegrationsPage() {
  const { t } = useSettings();
  const navigate = useNavigate();
  const [status, setStatus] = useState(null);
  const [loadingStatus, setLoadingStatus] = useState(true);

  const fetchStatus = useCallback(async () => {
    try {
      const { data } = await externalAPI.getStatus();
      setStatus(data.data?.platforms || {});
    } catch {
      setStatus({});
    } finally {
      setLoadingStatus(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const integration = params.get('integration');
    const integrationStatus = params.get('status');
    if (integration && integrationStatus === 'connected') {
      fetchStatus();
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [fetchStatus]);

  return (
    <div className="flex-1 overflow-y-auto">
    <div className="min-h-full bg-surface">
      <div className="bg-white border-b border-navy-100 px-6 py-4">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="p-2 rounded-lg hover:bg-navy-50 text-navy-400 hover:text-navy-700 transition-colors"
          >
            <ArrowLeft className="w-5 h-5 rtl:rotate-180" />
          </button>
          <div>
            <h1 className="font-display text-xl font-bold text-navy-900">{t('integrations.title')}</h1>
            <p className="text-navy-400 text-sm">{t('integrations.subtitle')}</p>
          </div>
          {loadingStatus && <Loader2 className="w-4 h-4 text-navy-400 animate-spin ms-auto" />}
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-6 py-8 space-y-6">
        {!loadingStatus && status && (
          <div className="flex items-center gap-3 p-4 bg-white rounded-2xl border border-navy-100">
            <Zap className="w-5 h-5 text-emerald-500 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-navy-800">
                {t('integrations.platformsConnected', {
                  connected: Object.values(status).filter((platform) => platform.connected).length,
                  total: Object.keys(status).length,
                })}
              </p>
            </div>
            <button onClick={fetchStatus} className="p-1.5 rounded-lg hover:bg-navy-50 text-navy-400 transition-colors">
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        )}

        <GoogleFitPanel status={status?.google_fit} onRefreshStatus={fetchStatus} />
        <AppleHealthPanel />
        <DataExportPanel />
      </div>
    </div>
    </div>
  );
}
