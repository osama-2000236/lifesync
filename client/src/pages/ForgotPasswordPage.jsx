import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Activity, ArrowLeft, ArrowRight, Loader2, Mail, KeyRound, Lock, Eye, EyeOff, Check } from 'lucide-react';
import { authAPI } from '../services/api';
import { getApiErrorMessage } from '../utils/apiErrors';

const STEPS = ['email', 'otp', 'password'];

function StepIndicator({ step }) {
  const icons = [Mail, KeyRound, Lock];
  return (
    <div className="flex items-center justify-center gap-2 mb-8">
      {STEPS.map((_, i) => {
        const Icon = icons[i];
        return (
          <div key={i} className="flex items-center gap-2">
            <div className={`w-9 h-9 rounded-full flex items-center justify-center transition-all text-sm font-bold ${
              i < step ? 'bg-emerald-500 text-white'
                : i === step ? 'bg-emerald-500/10 text-emerald-600 ring-2 ring-emerald-500'
                  : 'bg-navy-100 text-navy-400'
            }`}
            >
              {i < step ? <Check className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
            </div>
            {i < 2 && <div className={`w-8 h-0.5 ${i < step ? 'bg-emerald-500' : 'bg-navy-200'}`} />}
          </div>
        );
      })}
    </div>
  );
}

export default function ForgotPasswordPage() {
  const navigate = useNavigate();
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
    { label: 'At least 8 characters', ok: password.length >= 8 },
    { label: 'Uppercase letter', ok: /[A-Z]/.test(password) },
    { label: 'Lowercase letter', ok: /[a-z]/.test(password) },
    { label: 'Number', ok: /\d/.test(password) },
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
      setError(getApiErrorMessage(err, 'Failed to send reset code.'));
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
      setError(getApiErrorMessage(err, 'Invalid or expired code.'));
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async (e) => {
    e.preventDefault();
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    if (passwordStrength < 4) {
      setError('Password does not meet all requirements.');
      return;
    }

    setError('');
    setLoading(true);
    try {
      await authAPI.resetPassword(email, password);
      navigate('/login', { state: { message: 'Password reset successfully. Please sign in.' } });
    } catch (err) {
      setError(getApiErrorMessage(err, 'Reset failed. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface p-6">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-3 mb-8 justify-center">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center shadow-md">
            <Activity className="w-6 h-6 text-white" />
          </div>
          <span className="font-display text-2xl font-bold text-navy-900">LifeSync</span>
        </div>

        <StepIndicator step={step} />

        <div className="bg-white rounded-2xl shadow-lg shadow-navy-900/5 p-8">
          {error && (
            <div className="mb-6 p-4 rounded-xl bg-coral-500/10 border border-coral-500/20 text-coral-500 text-sm">
              {error}
            </div>
          )}

          {step === 0 && (
            <form onSubmit={handleSendOTP} className="space-y-5">
              <div>
                <h2 className="font-display text-xl font-bold text-navy-900 mb-1">Forgot your password?</h2>
                <p className="text-navy-500 text-sm">Enter your email and we&apos;ll send a reset code.</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-navy-700 mb-1.5">Email address</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                  className="w-full px-4 py-3 rounded-xl border border-navy-200 bg-white text-navy-900 placeholder-navy-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition-all"
                  placeholder="you@example.com"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 text-white font-semibold shadow-lg shadow-emerald-500/20 hover:from-emerald-600 hover:to-emerald-700 transition-all disabled:opacity-50"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <>Send Reset Code <ArrowRight className="w-4 h-4" /></>}
              </button>
            </form>
          )}

          {step === 1 && (
            <form onSubmit={handleVerifyOTP} className="space-y-5">
              <div>
                <h2 className="font-display text-xl font-bold text-navy-900 mb-1">Check your email</h2>
                <p className="text-navy-500 text-sm">
                  Enter the 6-digit code sent to <strong className="text-navy-700">{email}</strong>
                </p>
              </div>
              <div className="flex gap-2 justify-center">
                {otp.map((digit, i) => (
                  <input
                    key={i}
                    id={`fp-otp-${i}`}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleOtpChange(i, e.target.value)}
                    onKeyDown={(e) => handleOtpKey(i, e)}
                    className="w-12 h-14 text-center text-xl font-bold rounded-xl border border-navy-200 bg-white text-navy-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition-all"
                  />
                ))}
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => { setStep(0); setOtp(['', '', '', '', '', '']); setError(''); }}
                  className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border border-navy-200 text-navy-600 font-medium hover:bg-navy-50 transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" /> Back
                </button>
                <button
                  type="submit"
                  disabled={loading || otp.some((digit) => !digit)}
                  className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 text-white font-semibold disabled:opacity-50 transition-all"
                >
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <>Verify <ArrowRight className="w-4 h-4" /></>}
                </button>
              </div>
              <button
                type="button"
                onClick={handleSendOTP}
                disabled={loading}
                className="w-full text-sm text-emerald-600 hover:text-emerald-700 font-medium transition-colors"
              >
                Didn&apos;t receive it? Resend code
              </button>
            </form>
          )}

          {step === 2 && (
            <form onSubmit={handleReset} className="space-y-5">
              <div>
                <h2 className="font-display text-xl font-bold text-navy-900 mb-1">Set new password</h2>
                <p className="text-navy-500 text-sm">Choose a strong password for your account.</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-navy-700 mb-1.5">New password</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="w-full px-4 py-3 pr-12 rounded-xl border border-navy-200 bg-white text-navy-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition-all"
                    placeholder="New password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-navy-400 hover:text-navy-600 p-1"
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
                          <div className={`w-1.5 h-1.5 rounded-full ${check.ok ? 'bg-emerald-500' : 'bg-navy-300'}`} />
                          {check.label}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-navy-700 mb-1.5">Confirm password</label>
                <input
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                  className={`w-full px-4 py-3 rounded-xl border bg-white text-navy-900 focus:outline-none focus:ring-2 transition-all ${
                    confirm && password !== confirm
                      ? 'border-coral-400 focus:ring-coral-500/20'
                      : 'border-navy-200 focus:ring-emerald-500/30 focus:border-emerald-500'
                  }`}
                  placeholder="Repeat new password"
                />
                {confirm && password !== confirm && (
                  <p className="mt-1 text-xs text-coral-500">Passwords don&apos;t match.</p>
                )}
              </div>

              <button
                type="submit"
                disabled={loading || passwordStrength < 4 || password !== confirm}
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 text-white font-semibold shadow-lg shadow-emerald-500/20 hover:from-emerald-600 hover:to-emerald-700 transition-all disabled:opacity-50"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <>Reset Password <ArrowRight className="w-4 h-4" /></>}
              </button>
            </form>
          )}
        </div>

        <p className="mt-6 text-center text-navy-500 text-sm">
          Remembered it?{' '}
          <Link to="/login" className="text-emerald-600 font-semibold hover:text-emerald-700">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
