import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Activity, ArrowLeft, ArrowRight, Mail, KeyRound, Lock, Eye, EyeOff } from 'lucide-react';
import { authAPI } from '../services/api';
import { getApiErrorMessage } from '../utils/apiErrors';
import { useSettings } from '../contexts/SettingsContext';
import SettingsControls from '../components/common/SettingsControls';
import { Button, Card, FormField, Input, StepProgress } from '../components/ui';

const STEP_ICONS = [Mail, KeyRound, Lock];

export default function ForgotPasswordPage() {
  const navigate = useNavigate();
  const { t } = useSettings();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleOtpChange = (index, value) => {
    if (value.length > 1) value = value.slice(-1);
    if (value && !/^\d$/.test(value)) return;
    const nextOtp = [...otp];
    nextOtp[index] = value;
    setOtp(nextOtp);
    if (value && index < 5) document.getElementById(`fp-otp-${index + 1}`)?.focus();
  };

  const handleOtpKey = (index, e) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      document.getElementById(`fp-otp-${index - 1}`)?.focus();
    }
  };

  const passwordChecks = [
    { label: t('reg.check.len'), ok: password.length >= 8 },
    { label: t('reg.check.upper'), ok: /[A-Z]/.test(password) },
    { label: t('reg.check.lower'), ok: /[a-z]/.test(password) },
    { label: t('reg.check.number'), ok: /\d/.test(password) },
  ];
  const passwordStrength = passwordChecks.filter((check) => check.ok).length;
  const strengthColor = ['bg-coral-500', 'bg-coral-500', 'bg-amber-400', 'bg-amber-400', 'bg-emerald-500'][passwordStrength];

  const handleSendOTP = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await authAPI.forgotPasswordSendOTP(email);
      setStep(1);
    } catch (err) {
      setError(getApiErrorMessage(err, t('fp.err.send')));
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOTP = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await authAPI.forgotPasswordVerifyOTP(email, otp.join(''));
      setStep(2);
    } catch (err) {
      setError(getApiErrorMessage(err, t('fp.err.invalidOtp')));
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async (e) => {
    e.preventDefault();
    if (password !== confirm) {
      setError(t('fp.err.mismatch'));
      return;
    }
    if (passwordStrength < 4) {
      setError(t('fp.err.weak'));
      return;
    }

    setError('');
    setLoading(true);
    try {
      await authAPI.resetPassword(email, password);
      navigate('/login', { state: { message: t('fp.resetSuccess') } });
    } catch (err) {
      setError(getApiErrorMessage(err, t('fp.err.failed')));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface p-6 relative">
      <div className="absolute top-4 end-4 z-20">
        <SettingsControls compact />
      </div>
      <div className="w-full max-w-md">
        <div className="flex items-center gap-3 mb-8 justify-center">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center shadow-md">
            <Activity className="w-6 h-6 text-white" />
          </div>
          <span className="font-display text-2xl font-bold text-navy-900">LifeSync</span>
        </div>

        <StepProgress
          steps={[{ key: 'email', icon: STEP_ICONS[0] }, { key: 'otp', icon: STEP_ICONS[1] }, { key: 'password', icon: STEP_ICONS[2] }]}
          currentStep={step}
          className="mb-8 max-w-[260px] mx-auto"
        />

        <Card padding="lg" className="shadow-lg shadow-navy-900/5">
          {error && (
            <div className="mb-6 p-4 rounded-xl bg-coral-500/10 border border-coral-500/20 text-coral-500 text-sm" role="alert" aria-live="assertive">
              {error}
            </div>
          )}

          {step === 0 && (
            <form onSubmit={handleSendOTP} className="space-y-5">
              <div>
                <h2 className="font-display text-xl font-bold text-navy-900 mb-1">{t('fp.title')}</h2>
                <p className="text-navy-500 text-sm">{t('fp.sub')}</p>
              </div>
              <FormField id="fp-email" label={t('reg.emailAddr')}>
                <Input
                  id="fp-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                  autoComplete="email"
                  placeholder="you@example.com"
                />
              </FormField>
              <Button type="submit" loading={loading} rightIcon={ArrowRight} className="w-full" size="lg">
                {t('fp.sendCode')}
              </Button>
            </form>
          )}

          {step === 1 && (
            <form onSubmit={handleVerifyOTP} className="space-y-5">
              <div>
                <h2 className="font-display text-xl font-bold text-navy-900 mb-1">{t('reg.checkEmail')}</h2>
                <p className="text-navy-500 text-sm">
                  {t('reg.enterCode')} <strong className="text-navy-700">{email}</strong>
                </p>
              </div>
              <div className="flex gap-2 justify-center">
                {otp.map((digit, i) => (
                  <input
                    key={i}
                    id={`fp-otp-${i}`}
                    aria-label={`Verification code digit ${i + 1}`}
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleOtpChange(i, e.target.value)}
                    onKeyDown={(e) => handleOtpKey(i, e)}
                    className="w-12 h-14 text-center text-xl font-bold rounded-xl border border-navy-200 bg-white text-navy-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition-all"
                  />
                ))}
              </div>
              <div className="flex gap-3">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => { setStep(0); setOtp(['', '', '', '', '', '']); setError(''); }}
                  className="flex-1"
                >
                  <ArrowLeft className="w-4 h-4 rtl:rotate-180" /> {t('reg.back')}
                </Button>
                <Button
                  type="submit"
                  loading={loading}
                  disabled={otp.some((digit) => !digit)}
                  rightIcon={ArrowRight}
                  className="flex-1"
                >
                  {t('reg.verify')}
                </Button>
              </div>
              <button
                type="button"
                onClick={handleSendOTP}
                disabled={loading}
                className="w-full text-sm text-emerald-600 hover:text-emerald-700 font-medium transition-colors"
              >
                {t('fp.resend')}
              </button>
            </form>
          )}

          {step === 2 && (
            <form onSubmit={handleReset} className="space-y-5">
              <div>
                <h2 className="font-display text-xl font-bold text-navy-900 mb-1">{t('fp.newPassword')}</h2>
                <p className="text-navy-500 text-sm">{t('fp.newPasswordSub')}</p>
              </div>

              <FormField id="fp-new-password" label={t('fp.newPasswordLabel')}>
                <div className="relative">
                  <Input
                    id="fp-new-password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="new-password"
                    className="pe-12"
                    placeholder={t('fp.newPasswordLabel')}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute end-3 top-1/2 -translate-y-1/2 text-navy-400 hover:text-navy-600 p-1"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    aria-pressed={showPassword}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>

                {password && (
                  <div className="mt-2 space-y-1.5">
                    <div className="flex gap-1">
                      {[0, 1, 2, 3].map((i) => (
                        <div key={i} className={`h-1 flex-1 rounded-full transition-all duration-300 ${i < passwordStrength ? strengthColor : 'bg-navy-100'}`} />
                      ))}
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
                      {passwordChecks.map((check) => (
                        <div key={check.label} className={`text-xs flex items-center gap-1.5 ${check.ok ? 'text-emerald-600' : 'text-navy-400'}`}>
                          <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${check.ok ? 'bg-emerald-500' : 'bg-navy-300'}`} />
                          {check.label}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </FormField>

              <FormField
                id="fp-confirm-password"
                label={t('fp.confirmPassword')}
                error={confirm && password !== confirm ? t('fp.mismatch') : undefined}
              >
                <Input
                  id="fp-confirm-password"
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                  error={Boolean(confirm && password !== confirm)}
                  placeholder={t('fp.confirmPlaceholder')}
                />
              </FormField>

              <Button
                type="submit"
                loading={loading}
                disabled={passwordStrength < 4 || password !== confirm}
                rightIcon={ArrowRight}
                className="w-full"
                size="lg"
              >
                {t('fp.resetBtn')}
              </Button>
            </form>
          )}
        </Card>

        <p className="mt-6 text-center text-navy-500 text-sm">
          {t('fp.remembered')}{' '}
          <Link to="/login" className="text-emerald-600 font-semibold hover:text-emerald-700">{t('auth.signin')}</Link>
        </p>
      </div>
    </div>
  );
}
