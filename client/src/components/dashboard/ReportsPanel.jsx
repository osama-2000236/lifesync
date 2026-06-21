// src/components/dashboard/ReportsPanel.jsx
// Weekly report generation + download (UR12)
import { useState, useEffect, useCallback } from 'react';
import { reportsAPI } from '../../services/api';
import { getPaginatedItems } from '../../utils/paginatedResponse';
import { FileText, Loader2, FileSpreadsheet, Plus, FileJson, Printer } from 'lucide-react';

const triggerBlobDownload = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export default function ReportsPanel() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    try {
      const { data } = await reportsAPI.list({ limit: 5 });
      setReports(getPaginatedItems(data, 'reports'));
    } catch {
      setReports([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      await reportsAPI.generate();
      await load();
    } catch (err) {
      console.warn('Report generation failed:', err?.message);
    } finally {
      setGenerating(false);
    }
  };

  const handleDownload = async (report, format) => {
    setBusyId(`${report.id}-${format}`);
    try {
      const { data } = await reportsAPI.download(report.id, format);
      const base = `lifesync-report-${report.id}-${report.period_end}`;
      if (format === 'html') {
        // open printable report in a new tab
        const url = URL.createObjectURL(new Blob([data], { type: 'text/html' }));
        window.open(url, '_blank', 'noopener');
        setTimeout(() => URL.revokeObjectURL(url), 4000);
      } else {
        triggerBlobDownload(data, `${base}.${format}`);
      }
    } catch (err) {
      console.warn('Report download failed:', err?.message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-navy-50">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <FileText className="w-5 h-5 text-navy-500" />
          <h2 className="font-display text-base font-bold text-navy-800">Reports</h2>
        </div>
        <button
          onClick={handleGenerate}
          disabled={generating}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-600 text-xs font-semibold hover:bg-emerald-100 transition-colors disabled:opacity-50"
        >
          {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
          {generating ? 'Generating…' : 'New report'}
        </button>
      </div>

      {loading ? (
        <div className="h-16 skeleton rounded-xl" />
      ) : reports.length === 0 ? (
        <p className="text-sm text-navy-400 py-4 text-center">
          No reports yet. Generate your first weekly report.
        </p>
      ) : (
        <div className="space-y-2">
          {reports.map((r) => (
            <div key={r.id} className="p-3 rounded-xl border border-navy-100 hover:shadow-sm transition-shadow">
              <p className="text-sm font-medium text-navy-800 truncate">{r.title}</p>
              <div className="flex items-center justify-between mt-2">
                <span className="text-[11px] text-navy-400">
                  {new Date(r.generated_at).toLocaleDateString()}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleDownload(r, 'html')}
                    disabled={busyId === `${r.id}-html`}
                    title="Open printable report (Save as PDF)"
                    className="p-1.5 rounded-lg text-navy-400 hover:text-navy-700 hover:bg-navy-50 transition-colors"
                  >
                    <Printer className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDownload(r, 'csv')}
                    disabled={busyId === `${r.id}-csv`}
                    title="Download CSV"
                    className="p-1.5 rounded-lg text-navy-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors"
                  >
                    <FileSpreadsheet className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDownload(r, 'json')}
                    disabled={busyId === `${r.id}-json`}
                    title="Download JSON"
                    className="p-1.5 rounded-lg text-navy-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                  >
                    <FileJson className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
