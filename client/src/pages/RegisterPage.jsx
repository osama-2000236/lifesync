import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';
import SettingsControls from '../components/common/SettingsControls';
import { authAPI } from '../services/api';
import { Activity, ArrowRight, ArrowLeft, Mail, KeyRound, User } from 'lucide-react';
import GoogleSignInButton from '../components/auth/GoogleSignInButton';
import { getApiErrorMessage } from '../utils/apiErrors';
import { Button, Card, FormField, Input, StepProgress } from '../components/ui';

const STEPS = [{ key: 'email', icon: Mail }, { key: 'otp', icon: KeyRound }, { key: 'credentials', icon: User }];

export default function RegisterPage() {
  const { register, loginWithGoogle, googleAuthEnabled } = useAuth();
  const { t } = useSettings();
  const navigate = useNavigate();

  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [googleLoading, setGoogleLoading] = useState(false);

  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');

  const handleSendOTP = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await authAPI.sendOTP(email);
      setStep(1);
    } catch (err) {
      setError(getApiErrorMessage(err, t('reg.err.sendOtp')));
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOTP = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const code = otp.join('');
    try {
      await authAPI.verifyOTP(email, code);
      setStep(2);
    } catch (err) {
      setError(getApiErrorMessage(err, t('reg.err.invalidOtp')));
    } finally {
      setLoading(false);
    }
  };

  const handleOtpChange = (index, value) => {
    if (value.length > 1) value = value.slice(-1);
    if (value && !/^\d$/.test(value)) return;
    const nextOtp = [...otp];
    nextOtp[index] = value;
    setOtp(nextOtp);
    if (value && index < 5) {
      document.getElementById(`otp-${index + 1}`)?.focus();
    }
  };

  const handleOtpKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      document.getElementById(`otp-${index - 1}`)?.focus();
    }
  };

  const handleComplete = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await register({ email, username, password, name: name || undefined });
      navigate('/dashboard');
    } catch (err) {
      setError(getApiErrorMessage(err, t('reg.err.failed')));
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSuccess = async ({ credential }) => {
    if (!credential) {
      setError('Google did not return a credential. Please try again.');
      return;
    }

    setError('');
    setGoogleLoading(true);

    try {
      await loginWithGoogle(credential);
      navigate('/dashboard');
    } catch (err) {
      setError(getApiErrorMessage(err, 'Google sign-up failed. Please try again.'));
    } finally {
      setGoogleLoading(false);
    }
  };

  const passwordChecks = [
    { label: t('reg.check.len'), ok: password.length >= 8 },
    { label: t('reg.check.upper'), ok: /[A-Z]/.test(password) },
    { label: t('reg.check.lower'), ok: /[a-z]/.test(password) },
    { label: t('reg.check.number'), ok: /\d/.test(password) },
  ];
  const passwordStrength = passwordChecks.filter((item) => item.ok).length;
  const strengthColor = ['bg-coral-500', 'bg-coral-500', 'bg-amber-400', 'bg-amber-400', 'bg-emerald-500'][passwordStrength];

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

        <StepProgress steps={STEPS} currentStep={step} className="mb-8 max-w-[260px] mx-auto" />

        <Card padding="lg" className="shadow-lg shadow-navy-900/5">
          {googleAuthEnabled && step === 0 && (
            <div className="mb-6">
              <GoogleSignInButton
                text="signup_with"
                onSuccess={handleGoogleSuccess}
                onError={() => setError('Google sign-up is unavailable right now. Please use email.')}
              />
              {googleLoading && (
                <p className="mt-3 text-center text-sm text-navy-500" role="status" aria-live="polite">{t('reg.creatingGoogle')}</p>
              )}
              <div className="mt-6 flex items-center gap-3 text-xs uppercase tracking-[0.22em] text-navy-300">
                <div className="h-px flex-1 bg-navy-200" />
                <span>{t('reg.orVerifyEmail')}</span>
                <div className="h-px flex-1 bg-navy-200" />
              </div>
            </div>
          )}

          {error && (
            <div id="register-form-error" className="mb-6 p-4 rounded-xl bg-coral-500/10 border border-coral-500/20 text-coral-500 text-sm" role="alert" aria-live="assertive">
              {error}
            </div>
          )}

          {step === 0 && (
            <form onSubmit={handleSendOTP} className="space-y-5">
              <div>
                <h2 className="font-display text-xl font-bold text-navy-900 mb-1">{t('reg.createAccount')}</h2>
                <p className="text-navy-500 text-sm">{t('reg.sendSub')}</p>
              </div>
              <FormField id="register-email" label={t('reg.emailAddr')}>
                <Input
                  id="register-email"
                  name="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  error={Boolean(error)}
                  aria-describedby={error ? 'register-form-error' : undefined}
                  placeholder="you@example.com"
                />
              </FormField>
              <Button type="submit" loading={loading} disabled={googleLoading} rightIcon={ArrowRight} className="w-full" size="lg">
                {t('reg.sendCode')}
              </Button>
            </form>
          )}

          {step === 1 && (
            <form onSubmit={handleVerifyOTP} className="space-y-5">
              <div>
                <h2 className="font-display text-xl font-bold text-navy-900 mb-1">{t('reg.checkEmail')}</h2>
                <p className="text-navy-500 text-sm">{t('reg.enterCode')} <strong className="text-navy-700">{email}</strong></p>
              </div>
              <div className="flex gap-2 justify-center">
                {otp.map((digit, i) => (
                  <input
                    key={i}
                    id={`otp-${i}`}
                    aria-label={`Verification code digit ${i + 1}`}
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleOtpChange(i, e.target.value)}
                    onKeyDown={(e) => handleOtpKeyDown(i, e)}
                    className="w-12 h-14 text-center text-xl font-bold rounded-xl border border-navy-200 bg-white text-navy-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
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
                  disabled={googleLoading || otp.some((digit) => !digit)}
                  rightIcon={ArrowRight}
                  className="flex-1"
                >
                  {t('reg.verify')}
                </Button>
              </div>
            </form>
          )}

          {step === 2 && (
            <form onSubmit={handleComplete} className="space-y-5">
              <div>
                <h2 className="font-display text-xl font-bold text-navy-900 mb-1">{t('reg.almostThere')}</h2>
                <p className="text-navy-500 text-sm">{t('reg.chooseCreds')}</p>
              </div>
              <FormField id="register-name" label={<>{t('reg.fullName')} <span className="text-navy-400">{t('reg.optional')}</span></>}>
                <Input
                  id="register-name"
                  name="name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="name"
                  placeholder={t('reg.yourName')}
                />
              </FormField>
              <FormField id="register-username" label={t('reg.username')}>
                <Input
                  id="register-username"
                  name="username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  minLength={3}
                  autoComplete="username"
                  error={Boolean(error)}
                  aria-describedby={error ? 'register-form-error' : undefined}
                  placeholder={t('reg.chooseUsername')}
                />
              </FormField>
              <FormField id="register-password" label={t('auth.password')}>
                <Input
                  id="register-password"
                  name="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  autoComplete="new-password"
                  error={Boolean(error)}
                  aria-describedby={error ? 'register-form-error' : undefined}
                  placeholder={t('reg.passwordHint')}
                />
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
              <Button type="submit" loading={loading} disabled={googleLoading} rightIcon={ArrowRight} className="w-full" size="lg">
                {t('reg.createAccountBtn')}
              </Button>
            </form>
          )}
        </Card>

        <p className="mt-6 text-center text-navy-500 text-sm">
          {t('reg.haveAccount')}{' '}
          <Link to="/login" className="text-emerald-600 font-semibold hover:text-emerald-700">{t('auth.signin')}</Link>
        </p>
      </div>
    </div>
  );
}
