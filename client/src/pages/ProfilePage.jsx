import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { authAPI } from '../services/api';
import { getApiErrorMessage } from '../utils/apiErrors';
import {
  User, Mail, Lock, Trash2, Save, Eye, EyeOff, Loader2,
  CheckCircle, AlertTriangle, LogOut, ArrowLeft, Shield,
} from 'lucide-react';

function Card({ title, icon: Icon, iconColor = 'text-emerald-600', iconBg = 'bg-emerald-50', children }) {
  return (
    <div className="bg-white rounded-2xl border border-navy-100 overflow-hidden">
      <div className="flex items-center gap-3 px-6 py-4 border-b border-navy-50">
        <div className={`w-8 h-8 rounded-lg ${iconBg} flex items-center justify-center`}>
          <Icon className={`w-4 h-4 ${iconColor}`} />
        </div>
        <h2 className="font-display font-semibold text-navy-900">{title}</h2>
      </div>
      <div className="p-6">{children}</div>
    </div>
  );
}

function Alert({ type, message, onClose }) {
  if (!message) return null;
  const isError = type === 'error';
  return (
    <div className={`flex items-start gap-3 p-4 rounded-xl text-sm mb-4 ${
      isError ? 'bg-coral-500/10 border border-coral-500/20 text-coral-600' : 'bg-emerald-50 border border-emerald-200 text-emerald-700'
    }`}>
      {isError ? <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" /> : <CheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />}
      <span className="flex-1">{message}</span>
      {onClose && <button onClick={onClose} className="ml-auto opacity-60 hover:opacity-100 text-lg leading-none">&times;</button>}
    </div>
  );
}

function PasswordField({ label, value, onChange, placeholder }) {
  const [show, setShow] = useState(false);
  return (
    <div>
      <label className="block text-sm font-medium text-navy-700 mb-1.5">{label}</label>
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={onChange}
          required
          className="w-full px-4 py-3 pr-12 rounded-xl border border-navy-200 bg-white text-navy-900 placeholder-navy-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition-all"
          placeholder={placeholder}
        />
        <button
          type="button"
          onClick={() => setShow(!show)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-navy-400 hover:text-navy-600 p-1"
        >
          {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}

function ProfileInfoSection({ user, onUpdate }) {
  const [name, setName] = useState(user?.name || '');
  const [avatarUrl, setAvatarUrl] = useState(user?.avatar_url || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');

  useEffect(() => {
    setName(user?.name || '');
    setAvatarUrl(user?.avatar_url || '');
  }, [user]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setOk('');
    setLoading(true);
    try {
      const { data } = await authAPI.updateProfile({ name: name || null, avatar_url: avatarUrl || null });
      onUpdate(data.data.user);
      setOk('Profile updated successfully.');
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to update profile.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card title="Profile Information" icon={User}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Alert type="error" message={error} onClose={() => setError('')} />
        <Alert type="success" message={ok} onClose={() => setOk('')} />

        <div className="flex items-center gap-4 pb-4 border-b border-navy-50">
          <div className="w-16 h-16 rounded-2xl overflow-hidden bg-gradient-to-br from-navy-300 to-navy-500 flex-shrink-0">
            {avatarUrl ? (
              <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-white text-2xl font-bold">
                {(name || user?.username || '?')[0].toUpperCase()}
              </div>
            )}
          </div>
          <div>
            <p className="font-semibold text-navy-900">{user?.username}</p>
            <p className="text-sm text-navy-400">{user?.email}</p>
            <span className={`inline-block mt-1 text-xs font-medium px-2 py-0.5 rounded-full ${
              user?.role === 'admin' ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'
            }`}>
              {user?.role}
            </span>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-navy-700 mb-1.5">Full name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-4 py-3 rounded-xl border border-navy-200 bg-white text-navy-900 placeholder-navy-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition-all"
            placeholder="Your name"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-navy-700 mb-1.5">Avatar URL <span className="text-navy-400">(optional)</span></label>
          <input
            type="url"
            value={avatarUrl}
            onChange={(e) => setAvatarUrl(e.target.value)}
            className="w-full px-4 py-3 rounded-xl border border-navy-200 bg-white text-navy-900 placeholder-navy-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition-all"
            placeholder="https://..."
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-navy-700 mb-1.5">Username</label>
          <input
            type="text"
            value={user?.username || ''}
            disabled
            className="w-full px-4 py-3 rounded-xl border border-navy-100 bg-navy-50 text-navy-400 cursor-not-allowed"
          />
          <p className="text-xs text-navy-400 mt-1">Username cannot be changed.</p>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 text-white font-semibold text-sm shadow-md shadow-emerald-500/20 hover:from-emerald-600 hover:to-emerald-700 transition-all disabled:opacity-50"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save changes
        </button>
      </form>
    </Card>
  );
}

function EmailChangeSection({ user, isGoogleUser, onUpdate }) {
  const [newEmail, setNewEmail] = useState('');
  const [code, setCode] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');

  const handleSend = async (e) => {
    e.preventDefault();
    setError('');
    setOk('');
    setSending(true);
    try {
      await authAPI.changeEmailSendOTP(newEmail);
      setOtpSent(true);
      setOk('Verification code sent to your new email.');
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to send verification code.'));
    } finally {
      setSending(false);
    }
  };

  const handleVerify = async (e) => {
    e.preventDefault();
    setError('');
    setOk('');
    setVerifying(true);
    try {
      const { data } = await authAPI.changeEmailVerifyOTP(newEmail, code);
      onUpdate(data.data.user);
      setOk('Email updated successfully.');
      setNewEmail('');
      setCode('');
      setOtpSent(false);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to verify code.'));
    } finally {
      setVerifying(false);
    }
  };

  if (isGoogleUser) {
    return (
      <Card title="Email" icon={Mail} iconColor="text-navy-600" iconBg="bg-navy-50">
        <div className="flex items-start gap-3 p-4 rounded-xl bg-navy-50 border border-navy-100">
          <Shield className="w-5 h-5 text-navy-400 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-navy-700">Google-managed email</p>
            <p className="text-sm text-navy-500 mt-0.5">This account uses Google Sign-In. Email changes are handled by Google.</p>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card title="Change Email" icon={Mail} iconColor="text-sky-600" iconBg="bg-sky-50">
      <div className="space-y-4">
        <Alert type="error" message={error} onClose={() => setError('')} />
        <Alert type="success" message={ok} onClose={() => setOk('')} />

        <div>
          <label className="block text-sm font-medium text-navy-700 mb-1.5">Current email</label>
          <input
            type="email"
            value={user?.email || ''}
            disabled
            className="w-full px-4 py-3 rounded-xl border border-navy-100 bg-navy-50 text-navy-400 cursor-not-allowed"
          />
        </div>

        <form onSubmit={handleSend} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-navy-700 mb-1.5">New email</label>
            <input
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              required
              className="w-full px-4 py-3 rounded-xl border border-navy-200 bg-white text-navy-900 placeholder-navy-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition-all"
              placeholder="new@example.com"
            />
          </div>
          <button
            type="submit"
            disabled={sending || !newEmail}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-sky-500 to-sky-600 text-white font-semibold text-sm shadow-md shadow-sky-500/20 hover:from-sky-600 hover:to-sky-700 transition-all disabled:opacity-50"
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
            Send code
          </button>
        </form>

        {otpSent && (
          <form onSubmit={handleVerify} className="space-y-4 pt-4 border-t border-navy-50">
            <div>
              <label className="block text-sm font-medium text-navy-700 mb-1.5">Verification code</label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                required
                className="w-full px-4 py-3 rounded-xl border border-navy-200 bg-white text-navy-900 placeholder-navy-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition-all tracking-[0.35em]"
                placeholder="123456"
              />
            </div>
            <button
              type="submit"
              disabled={verifying || code.length !== 6}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 text-white font-semibold text-sm shadow-md shadow-emerald-500/20 hover:from-emerald-600 hover:to-emerald-700 transition-all disabled:opacity-50"
            >
              {verifying ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
              Verify & update email
            </button>
          </form>
        )}
      </div>
    </Card>
  );
}

function ChangePasswordSection({ isGoogleUser }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');

  const passwordChecks = [
    { label: 'At least 8 characters', ok: newPassword.length >= 8 },
    { label: 'Uppercase letter', ok: /[A-Z]/.test(newPassword) },
    { label: 'Lowercase letter', ok: /[a-z]/.test(newPassword) },
    { label: 'Number', ok: /\d/.test(newPassword) },
  ];
  const passwordStrength = passwordChecks.filter((item) => item.ok).length;
  const strengthColor = ['bg-coral-500', 'bg-coral-500', 'bg-amber-400', 'bg-amber-400', 'bg-emerald-500'][passwordStrength];

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (newPassword !== confirm) {
      setError('New passwords do not match.');
      return;
    }
    if (passwordStrength < 4) {
      setError('Password does not meet all requirements.');
      return;
    }

    setError('');
    setOk('');
    setLoading(true);
    try {
      await authAPI.changePassword(currentPassword, newPassword);
      setOk('Password changed successfully.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirm('');
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to change password.'));
    } finally {
      setLoading(false);
    }
  };

  if (isGoogleUser) {
    return (
      <Card title="Password" icon={Lock} iconColor="text-navy-600" iconBg="bg-navy-50">
        <div className="flex items-start gap-3 p-4 rounded-xl bg-navy-50 border border-navy-100">
          <Shield className="w-5 h-5 text-navy-400 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-navy-700">Google account</p>
            <p className="text-sm text-navy-500 mt-0.5">Your account uses Google Sign-In. Password management is handled by Google.</p>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card title="Change Password" icon={Lock} iconColor="text-navy-600" iconBg="bg-navy-50">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Alert type="error" message={error} onClose={() => setError('')} />
        <Alert type="success" message={ok} onClose={() => setOk('')} />

        <PasswordField label="Current password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} placeholder="Your current password" />
        <PasswordField label="New password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="New password" />

        {newPassword && (
          <div className="space-y-1.5">
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

        <PasswordField label="Confirm new password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Repeat new password" />
        {confirm && newPassword !== confirm && <p className="text-xs text-coral-500 -mt-2">Passwords don&apos;t match.</p>}

        <button
          type="submit"
          disabled={loading || passwordStrength < 4 || newPassword !== confirm}
          className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-navy-700 to-navy-900 text-white font-semibold text-sm hover:from-navy-800 hover:to-navy-950 transition-all disabled:opacity-50"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
          Update password
        </button>
      </form>
    </Card>
  );
}

function DangerZoneSection({ onDeleteAccount }) {
  const [confirm, setConfirm] = useState('');
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleDelete = async () => {
    if (confirm !== 'DELETE') {
      setError('Type DELETE to confirm.');
      return;
    }

    setLoading(true);
    try {
      await onDeleteAccount();
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to delete account.'));
      setLoading(false);
    }
  };

  return (
    <Card title="Danger Zone" icon={Trash2} iconColor="text-coral-500" iconBg="bg-coral-50">
      <div className="space-y-4">
        <p className="text-sm text-navy-500">
          Deleting your account deactivates sign-in immediately. Existing data stays unavailable to the user after deletion.
        </p>

        {!open ? (
          <button
            onClick={() => setOpen(true)}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-coral-300 text-coral-600 font-medium text-sm hover:bg-coral-50 transition-colors"
          >
            <Trash2 className="w-4 h-4" /> Delete my account
          </button>
        ) : (
          <div className="space-y-3 p-4 rounded-xl border border-coral-200 bg-coral-50/50">
            <Alert type="error" message={error} onClose={() => setError('')} />
            <p className="text-sm font-medium text-coral-700">Type <code className="font-mono bg-coral-100 px-1 rounded">DELETE</code> to confirm account deletion:</p>
            <input
              type="text"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-coral-300 bg-white text-navy-900 focus:outline-none focus:ring-2 focus:ring-coral-400/30 focus:border-coral-400 transition-all text-sm"
              placeholder="DELETE"
            />
            <div className="flex gap-3">
              <button
                onClick={() => { setOpen(false); setConfirm(''); setError(''); }}
                className="flex-1 py-2.5 rounded-xl border border-navy-200 text-navy-600 text-sm font-medium hover:bg-navy-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={loading || confirm !== 'DELETE'}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-coral-500 text-white text-sm font-semibold hover:bg-coral-600 transition-colors disabled:opacity-50"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                Delete account
              </button>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

export default function ProfilePage() {
  const { user, logout, updateCurrentUser } = useAuth();
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState(user);

  useEffect(() => {
    setCurrentUser(user);
  }, [user]);

  const isGoogleUser = currentUser?.auth_provider === 'google';

  const handleUpdate = useCallback((updatedUser) => {
    setCurrentUser(updatedUser);
    updateCurrentUser(updatedUser);
  }, [updateCurrentUser]);

  const handleDeleteAccount = async () => {
    await authAPI.deleteAccount();
    logout();
    navigate('/');
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

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
            <h1 className="font-display text-xl font-bold text-navy-900">Account Settings</h1>
            <p className="text-navy-400 text-sm">Manage your profile and account</p>
          </div>
          <button
            onClick={handleLogout}
            className="ml-auto flex items-center gap-2 px-4 py-2 rounded-xl text-sm text-navy-500 hover:text-coral-500 hover:bg-coral-50 border border-navy-200 hover:border-coral-200 transition-all font-medium"
          >
            <LogOut className="w-4 h-4" />
            Sign out
          </button>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-6 py-8 space-y-6">
        <ProfileInfoSection user={currentUser} onUpdate={handleUpdate} />
        <EmailChangeSection user={currentUser} isGoogleUser={isGoogleUser} onUpdate={handleUpdate} />
        <ChangePasswordSection isGoogleUser={isGoogleUser} />
        <DangerZoneSection onDeleteAccount={handleDeleteAccount} />
      </div>
    </div>
    </div>
  );
}
