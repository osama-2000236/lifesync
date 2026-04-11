import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { externalAPI, healthAPI, financeAPI } from '../services/api';
import { getApiErrorMessage } from '../utils/apiErrors';
import { getPaginatedItems } from '../utils/paginatedResponse';
import {
  ArrowLeft, RefreshCw, Unlink, CheckCircle, AlertCircle,
  Loader2, Download, FileJson, FileSpreadsheet, Heart,
  Smartphone, Cloud, Zap, Info,
} from 'lucide-react';

function Card({ children, className = '' }) {
  return (
    <div className={`bg-white rounded-2xl border border-navy-100 overflow-hidden ${className}`}>
      {children}
    </div>
  );
}

function CardHeader({ icon: Icon, iconBg = 'bg-emerald-50', iconColor = 'text-emerald-600', title, subtitle }) {
  return (
    <div className="flex items-center gap-3 px-6 py-4 border-b border-navy-50">
      <div className={`w-9 h-9 rounded-xl ${iconBg} flex items-center justify-center flex-shrink-0`}>
        <Icon className={`w-5 h-5 ${iconColor}`} />
      </div>
      <div>
        <h2 className="font-display font-semibold text-navy-900">{title}</h2>
        {subtitle && <p className="text-xs text-navy-400 mt-0.5">{subtitle}</p>}
      </div>
    </div>
  );
}

function StatusBadge({ connected }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${
      connected ? 'bg-emerald-50 text-emerald-700' : 'bg-navy-100 text-navy-500'
    }`}>
      <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-emerald-500' : 'bg-navy-400'}`} />
      {connected ? 'Connected' : 'Not connected'}
    </span>
  );
}

function Alert({ type, message, onClose }) {
  if (!message) return null;
  const isError = type === 'error';
  return (
    <div className={`flex items-start gap-2.5 p-3.5 rounded-xl text-sm ${
      isError ? 'bg-coral-50 border border-coral-200 text-coral-700' : 'bg-emerald-50 border border-emerald-200 text-emerald-700'
    }`}>
      {isError ? <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" /> : <CheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />}
      <span className="flex-1">{message}</span>
      {onClose && <button onClick={onClose} className="opacity-50 hover:opacity-100 text-base leading-none">&times;</button>}
    </div>
  );
}

const GOOGLE_FIT_TYPES = [
  { id: 'steps', label: 'Steps' },
  { id: 'calories', label: 'Calories' },
  { id: 'sleep', label: 'Sleep' },
  { id: 'heart_rate', label: 'Heart Rate' },
];

function GoogleFitPanel({ status, onRefreshStatus }) {
  const connected = status?.connected;
  const connectedAt = status?.connectedAt;
  const [syncing, setSyncing] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [selectedTypes, setSelectedTypes] = useState(['steps', 'sleep']);
  const [days, setDays] = useState(7);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');

  const handleConnect = async () => {
    setConnecting(true);
    setError('');
    try {
      const { data } = await externalAPI.connect('google_fit');
      if (data.data?.url) {
        window.location.href = data.data.url;
      } else {
        setError('Google Fit connection URL not available. Ensure GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are set on Railway.');
      }
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to start Google Fit connection.'));
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
      setError('Select at least one data type.');
      return;
    }

    setSyncing(true);
    setError('');
    setOk('');
    try {
      const { data } = await externalAPI.sync('google_fit', { dataTypes: selectedTypes, days });
      const payload = data.data;
      setOk(`Synced ${payload.new_entries} new entries (${payload.duplicates_skipped} already up to date).`);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Sync failed. Try reconnecting.'));
    } finally {
      setSyncing(false);
    }
  };

  const handleDisconnect = async () => {
    if (!window.confirm('Disconnect Google Fit? Your existing health logs will be kept.')) return;

    setDisconnecting(true);
    setError('');
    try {
      await externalAPI.disconnect('google_fit');
      setOk('Google Fit disconnected.');
      onRefreshStatus();
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to disconnect.'));
    } finally {
      setDisconnecting(false);
    }
  };

  return (
    <Card>
      <CardHeader
        icon={Heart}
        iconBg="bg-red-50"
        iconColor="text-red-500"
        title="Google Fit"
        subtitle="Sync steps, sleep, calories, and heart rate"
      />
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <StatusBadge connected={connected} />
          {connected && connectedAt && (
            <span className="text-xs text-navy-400">
              Connected {new Date(connectedAt).toLocaleDateString()}
            </span>
          )}
        </div>

        <Alert type="error" message={error} onClose={() => setError('')} />
        <Alert type="success" message={ok} onClose={() => setOk('')} />

        {!connected ? (
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-navy-50 border border-navy-100 flex gap-3">
              <Info className="w-4 h-4 text-navy-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-navy-500">
                Connect Google Fit to automatically import your health data. This requires OAuth credentials on the backend and a Google account with Fit data.
              </p>
            </div>
            <button
              onClick={handleConnect}
              disabled={connecting}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r from-red-500 to-red-600 text-white font-semibold text-sm shadow-md shadow-red-500/20 hover:from-red-600 hover:to-red-700 transition-all disabled:opacity-50"
            >
              {connecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Heart className="w-4 h-4" />}
              Connect Google Fit
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <p className="text-sm font-medium text-navy-700 mb-2">Data to sync</p>
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
                Sync last <span className="text-emerald-600 font-bold">{days}</span> days
              </label>
              <input type="range" min={1} max={30} value={days} onChange={(e) => setDays(Number(e.target.value))} className="w-full mt-2 accent-emerald-500" />
              <div className="flex justify-between text-xs text-navy-400 mt-1">
                <span>1 day</span><span>30 days</span>
              </div>
            </div>

            <div className="flex gap-3 pt-1">
              <button
                onClick={handleSync}
                disabled={syncing || !selectedTypes.length}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 text-white font-semibold text-sm shadow-md shadow-emerald-500/20 hover:from-emerald-600 hover:to-emerald-700 transition-all disabled:opacity-50"
              >
                {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                Sync now
              </button>
              <button
                onClick={handleDisconnect}
                disabled={disconnecting}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-navy-200 text-navy-500 text-sm font-medium hover:border-coral-300 hover:text-coral-500 hover:bg-coral-50 transition-all disabled:opacity-50"
              >
                {disconnecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Unlink className="w-4 h-4" />}
                Disconnect
              </button>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

function AppleHealthPanel() {
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
        setError('Invalid JSON file. Export from your health app as JSON.');
      }
    };
    reader.readAsText(file);
  };

  const handleSync = async () => {
    if (!fileContent?.length) {
      setError('No data to sync.');
      return;
    }

    setSyncing(true);
    setError('');
    setOk('');
    try {
      const { data } = await externalAPI.sync('apple_health', { payload: fileContent });
      const payload = data.data;
      setOk(`Synced ${payload.new_entries} new entries (${payload.duplicates_skipped} already up to date).`);
      setFileContent(null);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Sync failed. Check your file format.'));
    } finally {
      setSyncing(false);
    }
  };

  return (
    <Card>
      <CardHeader
        icon={Smartphone}
        iconBg="bg-gray-100"
        iconColor="text-gray-600"
        title="Apple Health"
        subtitle="Import from iPhone Health export"
      />
      <div className="p-6 space-y-4">
        <div className="p-4 rounded-xl bg-navy-50 border border-navy-100 flex gap-3">
          <Info className="w-4 h-4 text-navy-400 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-navy-500 space-y-1">
            <p>Apple HealthKit requires a native iOS app to read data. To import:</p>
            <ol className="list-decimal list-inside space-y-0.5 text-xs mt-1">
              <li>Export your data from Health app</li>
              <li>Convert the export to JSON</li>
              <li>Upload the JSON file below</li>
            </ol>
          </div>
        </div>

        <Alert type="error" message={error} onClose={() => setError('')} />
        <Alert type="success" message={ok} onClose={() => setOk('')} />

        <div>
          <label className="block text-sm font-medium text-navy-700 mb-2">Upload health data (JSON)</label>
          <label className={`flex flex-col items-center justify-center gap-3 p-6 rounded-xl border-2 border-dashed cursor-pointer transition-all ${
            fileContent ? 'border-emerald-400 bg-emerald-50' : 'border-navy-200 hover:border-navy-300 hover:bg-navy-50'
          }`}
          >
            <input type="file" accept=".json" onChange={handleFileChange} className="sr-only" />
            {fileContent ? (
              <>
                <CheckCircle className="w-8 h-8 text-emerald-500" />
                <div className="text-center">
                  <p className="text-sm font-medium text-emerald-700">{fileContent.length} records loaded</p>
                  <p className="text-xs text-emerald-600">Click to replace file</p>
                </div>
              </>
            ) : (
              <>
                <Cloud className="w-8 h-8 text-navy-300" />
                <div className="text-center">
                  <p className="text-sm font-medium text-navy-600">Drop JSON file here</p>
                  <p className="text-xs text-navy-400">or click to browse</p>
                </div>
              </>
            )}
          </label>
        </div>

        <button
          onClick={handleSync}
          disabled={syncing || !fileContent?.length}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r from-navy-700 to-navy-900 text-white font-semibold text-sm hover:from-navy-800 hover:to-navy-950 transition-all disabled:opacity-50"
        >
          {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          Import to LifeSync
        </button>
      </div>
    </Card>
  );
}

function DataExportPanel() {
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

  const exportData = async (domain, format) => {
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
      setError(getApiErrorMessage(err, `Failed to export ${domain} data.`));
    } finally {
      setExporting(null);
    }
  };

  const exportCards = [
    {
      domain: 'health',
      label: 'Health Logs',
      desc: 'Steps, sleep, mood, water, exercise',
      color: 'text-coral-500',
      bg: 'bg-coral-50',
    },
    {
      domain: 'finance',
      label: 'Finance Logs',
      desc: 'Transactions, categories, amounts',
      color: 'text-amber-500',
      bg: 'bg-amber-50',
    },
  ];

  return (
    <Card>
      <CardHeader
        icon={Download}
        iconBg="bg-navy-50"
        iconColor="text-navy-600"
        title="Export Your Data"
        subtitle="Download your data in JSON or CSV format"
      />
      <div className="p-6 space-y-4">
        <Alert type="error" message={error} onClose={() => setError('')} />

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
                onClick={() => exportData(domain, 'json')}
                disabled={!!exporting}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-navy-200 text-navy-600 text-xs font-medium hover:bg-white hover:border-navy-300 transition-all disabled:opacity-50"
              >
                {exporting === `${domain}-json` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileJson className="w-3.5 h-3.5" />}
                JSON
              </button>
              <button
                onClick={() => exportData(domain, 'csv')}
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
          JSON preserves the full payload. CSV is flattened for spreadsheet use.
        </p>
      </div>
    </Card>
  );
}

export default function IntegrationsPage() {
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
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="font-display text-xl font-bold text-navy-900">Integrations & Export</h1>
            <p className="text-navy-400 text-sm">Connect health platforms and download your data</p>
          </div>
          {loadingStatus && <Loader2 className="w-4 h-4 text-navy-400 animate-spin ml-auto" />}
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-6 py-8 space-y-6">
        {!loadingStatus && status && (
          <div className="flex items-center gap-3 p-4 bg-white rounded-2xl border border-navy-100">
            <Zap className="w-5 h-5 text-emerald-500 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-navy-800">
                {Object.values(status).filter((platform) => platform.connected).length} of {Object.keys(status).length} platforms connected
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
