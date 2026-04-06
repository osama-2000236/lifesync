import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { authAPI } from '../services/api';
import { Activity, ArrowRight, ArrowLeft, Loader2, Mail, KeyRound, User, Check } from 'lucide-react';
import GoogleSignInButton from '../components/auth/GoogleSignInButton';
import { getApiErrorMessage } from '../utils/apiErrors';

const STEPS = ['email', 'otp', 'credentials'];

export default function RegisterPage() {
  const { register, loginWithGoogle, googleAuthEnabled } = useAuth();
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
      setError(getApiErrorMessage(err, 'Failed to send verification code.'));
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
      setError(getApiErrorMessage(err, 'Invalid verification code.'));
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
      setError(getApiErrorMessage(err, 'Registration failed.'));
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

  const stepIcons = [
    <Mail key="mail" className="w-5 h-5" />,
    <KeyRound key="key" className="w-5 h-5" />,
    <User key="user" className="w-5 h-5" />,
  ];

  const passwordChecks = [
    { label: '8+ characters', ok: password.length >= 8 },
    { label: 'Uppercase', ok: /[A-Z]/.test(password) },
    { label: 'Lowercase', ok: /[a-z]/.test(password) },
    { label: 'Number', ok: /\d/.test(password) },
  ];
  const passwordStrength = passwordChecks.filter((item) => item.ok).length;
  const strengthColor = ['bg-coral-500', 'bg-coral-500', 'bg-amber-400', 'bg-amber-400', 'bg-emerald-500'][passwordStrength];

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface p-6">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-3 mb-8 justify-center">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center shadow-md">
            <Activity className="w-6 h-6 text-white" />
          </div>
          <span className="font-display text-2xl font-bold text-navy-900">LifeSync</span>
        </div>

        <div className="flex items-center justify-center gap-2 mb-8">
          {STEPS.map((_, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className={`w-9 h-9 rounded-full flex items-center justify-center transition-all text-sm font-bold ${
                i < step ? 'bg-emerald-500 text-white'
                  : i === step ? 'bg-emerald-500/10 text-emerald-600 ring-2 ring-emerald-500'
                    : 'bg-navy-100 text-navy-400'
              }`}
              >
                {i < step ? <Check className="w-4 h-4" /> : stepIcons[i]}
              </div>
              {i < 2 && <div className={`w-8 h-0.5 ${i < step ? 'bg-emerald-500' : 'bg-navy-200'}`} />}
            </div>
          ))}
        </div>

        <div className="bg-white rounded-2xl shadow-lg shadow-navy-900/5 p-8">
          {googleAuthEnabled && step === 0 && (
            <div className="mb-6">
              <GoogleSignInButton
                text="signup_with"
                onSuccess={handleGoogleSuccess}
                onError={() => setError('Google sign-up is unavailable right now. Please use email.')}
              />
              {googleLoading && (
                <p className="mt-3 text-center text-sm text-navy-500" role="status" aria-live="polite">Creating your account with Google...</p>
              )}
              <div className="mt-6 flex items-center gap-3 text-xs uppercase tracking-[0.22em] text-navy-300">
                <div className="h-px flex-1 bg-navy-200" />
                <span>Or verify by email</span>
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
                <h2 className="font-display text-xl font-bold text-navy-900 mb-1">Create your account</h2>
                <p className="text-navy-500 text-sm">We&apos;ll send a verification code to your email.</p>
              </div>
              <div>
                <label htmlFor="register-email" className="block text-sm font-medium text-navy-700 mb-1.5">Email address</label>
                <input
                  id="register-email"
                  name="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  aria-invalid={Boolean(error)}
                  aria-describedby={error ? 'register-form-error' : undefined}
                  className="w-full px-4 py-3 rounded-xl border border-navy-200 bg-white text-navy-900 placeholder-navy-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
                  placeholder="you@example.com"
                />
              </div>
              <button
                type="submit"
                disabled={loading || googleLoading}
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 text-white font-semibold shadow-lg shadow-emerald-500/20 hover:from-emerald-600 hover:to-emerald-700 transition-all disabled:opacity-50"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <>Send Code <ArrowRight className="w-4 h-4" /></>}
              </button>
            </form>
          )}

          {step === 1 && (
            <form onSubmit={handleVerifyOTP} className="space-y-5">
              <div>
                <h2 className="font-display text-xl font-bold text-navy-900 mb-1">Check your email</h2>
                <p className="text-navy-500 text-sm">Enter the 6-digit code sent to <strong className="text-navy-700">{email}</strong></p>
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
                <button
                  type="button"
                  onClick={() => { setStep(0); setOtp(['', '', '', '', '', '']); setError(''); }}
                  className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border border-navy-200 text-navy-600 font-medium hover:bg-navy-50 transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" /> Back
                </button>
                <button
                  type="submit"
                  disabled={loading || googleLoading || otp.some((digit) => !digit)}
                  className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 text-white font-semibold shadow-lg shadow-emerald-500/20 disabled:opacity-50"
                >
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <>Verify <ArrowRight className="w-4 h-4" /></>}
                </button>
              </div>
            </form>
          )}

          {step === 2 && (
            <form onSubmit={handleComplete} className="space-y-5">
              <div>
                <h2 className="font-display text-xl font-bold text-navy-900 mb-1">Almost there!</h2>
                <p className="text-navy-500 text-sm">Choose a username and set your password.</p>
              </div>
              <div>
                <label htmlFor="register-name" className="block text-sm font-medium text-navy-700 mb-1.5">Full Name <span className="text-navy-400">(optional)</span></label>
                <input
                  id="register-name"
                  name="name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="name"
                  className="w-full px-4 py-3 rounded-xl border border-navy-200 bg-white text-navy-900 placeholder-navy-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
                  placeholder="Your name"
                />
              </div>
              <div>
                <label htmlFor="register-username" className="block text-sm font-medium text-navy-700 mb-1.5">Username</label>
                <input
                  id="register-username"
                  name="username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  minLength={3}
                  autoComplete="username"
                  aria-invalid={Boolean(error)}
                  aria-describedby={error ? 'register-form-error' : undefined}
                  className="w-full px-4 py-3 rounded-xl border border-navy-200 bg-white text-navy-900 placeholder-navy-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
                  placeholder="Choose a username"
                />
              </div>
              <div>
                <label htmlFor="register-password" className="block text-sm font-medium text-navy-700 mb-1.5">Password</label>
                <input
                  id="register-password"
                  name="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  autoComplete="new-password"
                  aria-invalid={Boolean(error)}
                  aria-describedby={error ? 'register-form-error' : undefined}
                  className="w-full px-4 py-3 rounded-xl border border-navy-200 bg-white text-navy-900 placeholder-navy-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
                  placeholder="Min 8 chars, uppercase, lowercase, number"
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
              </div>
              <button
                type="submit"
                disabled={loading || googleLoading}
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 text-white font-semibold shadow-lg shadow-emerald-500/20 hover:from-emerald-600 hover:to-emerald-700 transition-all disabled:opacity-50"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <>Create Account <ArrowRight className="w-4 h-4" /></>}
              </button>
            </form>
          )}
        </div>

        <p className="mt-6 text-center text-navy-500 text-sm">
          Already have an account?{' '}
          <Link to="/login" className="text-emerald-600 font-semibold hover:text-emerald-700">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
