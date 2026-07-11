// Dashboard card — generate + download weekly PDF report (UC-13).
import { useCallback, useState } from 'react';
import { FileDown, Loader2, Bell } from 'lucide-react';
import { Card, Button, Alert } from '../ui';
import { reportsAPI } from '../../services/api';
import { useSettings } from '../../contexts/SettingsContext';
import { getApiErrorMessage } from '../../utils/apiErrors';

function triggerBlobDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function WeeklyReportCard() {
  const { t } = useSettings();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [lastReport, setLastReport] = useState(null);
  const [info, setInfo] = useState('');

  const generateAndDownload = useCallback(async () => {
    setBusy(true);
    setError('');
    setInfo('');
    try {
      const { data } = await reportsAPI.generate(true);
      const report = data.data?.report;
      if (!report?.id) throw new Error('no_report');
      setLastReport(report);
      setInfo(
        data.data?.created
          ? t('reports.generated')
          : t('reports.alreadyExists'),
      );
      const pdf = await reportsAPI.download(report.id);
      const blob = pdf.data instanceof Blob ? pdf.data : new Blob([pdf.data], { type: 'application/pdf' });
      triggerBlobDownload(blob, `lifesync-week-${report.week_key || report.id}.pdf`);
    } catch (err) {
      setError(getApiErrorMessage(err, t('reports.failed')));
    } finally {
      setBusy(false);
    }
  }, [t]);

  return (
    <Card className="p-5" data-testid="weekly-report-card">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 flex items-center justify-center shrink-0">
          <FileDown className="w-5 h-5 text-emerald-600" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-display font-semibold text-navy-900 text-base">
            {t('reports.cardTitle')}
          </h3>
          <p className="text-sm text-navy-500 mt-0.5">{t('reports.cardDesc')}</p>
          {lastReport && (
            <p className="text-xs text-navy-400 mt-1" data-testid="report-week-key">
              {t('reports.weekLabel', { week: lastReport.week_key })}
            </p>
          )}
          {info && (
            <p className="text-xs text-emerald-600 mt-1 flex items-center gap-1">
              <Bell className="w-3 h-3" aria-hidden />
              {info}
            </p>
          )}
          {error && (
            <div data-testid="report-error">
              <Alert tone="error" className="mt-2">
                {error}
              </Alert>
            </div>
          )}
          <Button
            type="button"
            className="mt-3"
            onClick={generateAndDownload}
            disabled={busy}
            data-testid="report-download-btn"
          >
            {busy ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin me-2" aria-hidden />
                {t('reports.working')}
              </>
            ) : (
              <>
                <FileDown className="w-4 h-4 me-2" aria-hidden />
                {t('reports.downloadCta')}
              </>
            )}
          </Button>
        </div>
      </div>
    </Card>
  );
}
