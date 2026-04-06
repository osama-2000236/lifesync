import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Activity, Eye, EyeOff, ArrowRight, Loader2 } from 'lucide-react';
import GoogleSignInButton from '../components/auth/GoogleSignInButton';
import { getApiErrorMessage } from '../utils/apiErrors';

export default function LoginPage() {
  const { login, loginWithGoogle, googleAuthEnabled } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const successMessage = location.state?.message || '';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login(email, password);
      navigate('/dashboard');
    } catch (err) {
      setError(getApiErrorMessage(err, 'Login failed. Please try again.'));
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
      setError(getApiErrorMessage(err, 'Google sign-in failed. Please try again.'));
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-navy-900 via-navy-800 to-navy-950 relative overflow-hidden flex-col justify-between p-12">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-20 w-72 h-72 rounded-full bg-emerald-400 blur-3xl" />
          <div className="absolute bottom-40 right-20 w-96 h-96 rounded-full bg-emerald-600 blur-3xl" />
        </div>

        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center backdrop-blur">
              <Activity className="w-6 h-6 text-emerald-400" />
            </div>
            <span className="font-display text-xl font-bold text-white">LifeSync</span>
          </div>
        </div>

        <div className="relative z-10">
          <h2 className="font-display text-4xl font-bold text-white leading-tight mb-4">
            Your health and finances,<br />
            <span className="text-emerald-400">one conversation away.</span>
          </h2>
          <p className="text-navy-300 text-lg max-w-md leading-relaxed">
            Track spending, monitor wellness, and discover hidden patterns — all through natural language.
          </p>
        </div>

        <div className="relative z-10">
          <p className="text-navy-400 text-sm">Birzeit University · Graduation Project 2025</p>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-8 bg-surface">
        <div className="w-full max-w-md">
          <div className="lg:hidden flex items-center gap-3 mb-8 justify-center">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center">
              <Activity className="w-6 h-6 text-white" />
            </div>
            <span className="font-display text-2xl font-bold text-navy-900">LifeSync</span>
          </div>

          <h1 className="font-display text-2xl font-bold text-navy-900 mb-1">Welcome back</h1>
          <p className="text-navy-500 mb-8">Sign in to continue to your dashboard.</p>

          {googleAuthEnabled && (
            <div className="mb-6">
              <GoogleSignInButton
                onSuccess={handleGoogleSuccess}
                onError={() => setError('Google sign-in is unavailable right now. Please try email login.')}
              />
              {googleLoading && (
                <p className="mt-3 text-center text-sm text-navy-500" role="status" aria-live="polite">Completing Google sign-in...</p>
              )}
              <div className="mt-6 flex items-center gap-3 text-xs uppercase tracking-[0.22em] text-navy-300">
                <div className="h-px flex-1 bg-navy-200" />
                <span>Email sign in</span>
                <div className="h-px flex-1 bg-navy-200" />
              </div>
            </div>
          )}

          {successMessage && (
            <div className="mb-6 p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm flex items-center gap-2" role="status" aria-live="polite">
              <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              {successMessage}
            </div>
          )}

          {error && (
            <div id="login-form-error" className="mb-6 p-4 rounded-xl bg-coral-500/10 border border-coral-500/20 text-coral-500 text-sm" role="alert" aria-live="assertive">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="login-email" className="block text-sm font-medium text-navy-700 mb-1.5">Email</label>
              <input
                id="login-email"
                name="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                aria-invalid={Boolean(error)}
                aria-describedby={error ? 'login-form-error' : undefined}
                className="w-full px-4 py-3 rounded-xl border border-navy-200 bg-white text-navy-900 placeholder-navy-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition-all"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="login-password" className="block text-sm font-medium text-navy-700">Password</label>
                <Link to="/forgot-password" className="text-xs text-emerald-600 hover:text-emerald-700 font-medium">
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <input
                  id="login-password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  aria-invalid={Boolean(error)}
                  aria-describedby={error ? 'login-form-error' : undefined}
                  className="w-full px-4 py-3 rounded-xl border border-navy-200 bg-white text-navy-900 placeholder-navy-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition-all pr-12"
                  placeholder="Enter your password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-navy-400 hover:text-navy-600 p-1"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showPassword}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || googleLoading}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 text-white font-semibold shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/30 hover:from-emerald-600 hover:to-emerald-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>Sign in <ArrowRight className="w-4 h-4" /></>
              )}
            </button>
          </form>

          <p className="mt-8 text-center text-navy-500 text-sm">
            Don&apos;t have an account?{' '}
            <Link to="/register" className="text-emerald-600 font-semibold hover:text-emerald-700">
              Create one
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
