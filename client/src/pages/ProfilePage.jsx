import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';
import { authAPI, aiAPI } from '../services/api';
import { getApiErrorMessage } from '../utils/apiErrors';
import { MODEL_OPTIONS } from '../config/models';
import { Card, Alert, Button, FormField, Input } from '../components/ui';
import {
  User, Mail, Lock, Trash2, Save, Loader2, Eye, EyeOff,
  CheckCircle, LogOut, ArrowLeft, Shield,
  BrainCircuit, Cpu,
} from 'lucide-react';

function PasswordFieldRow({ id, label, value, onChange, placeholder }) {
  const [show, setShow] = useState(false);
  const { t } = useSettings();
  return (
    <FormField id={id} label={label}>
      <div className="relative">
        <Input
          id={id}
          type={show ? 'text' : 'password'}
          value={value}
          onChange={onChange}
          required
          className="pe-12"
          placeholder={placeholder}
        />
        <button
          type="button"
          onClick={() => setShow(!show)}
          className="absolute end-3 top-1/2 -translate-y-1/2 text-navy-400 hover:text-navy-600 p-1"
          aria-label={show ? t('a11y.hidePassword') : t('a11y.showPassword')}
          aria-pressed={show}
        >
          {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
    </FormField>
  );
}

function ProfileInfoSection({ user, onUpdate }) {
  const { t } = useSettings();
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
      setOk(t('profile.info.updated'));
    } catch (err) {
      setError(getApiErrorMessage(err, t('profile.info.updateFailed')));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <Card.Header icon={User} title={t('profile.info.title')} />
      <Card.Body>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <Alert tone="error" onDismiss={() => setError('')}>{error}</Alert>}
          {ok && <Alert tone="success" onDismiss={() => setOk('')}>{ok}</Alert>}

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

          <FormField id="profile-name" label={t('profile.info.fullName')}>
            <Input id="profile-name" type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('profile.info.namePlaceholder')} />
          </FormField>

          <FormField id="profile-avatar" label={<>{t('profile.info.avatarUrl')} <span className="text-navy-400">{t('reg.optional')}</span></>}>
            <Input id="profile-avatar" type="url" value={avatarUrl} onChange={(e) => setAvatarUrl(e.target.value)} placeholder="https://..." />
          </FormField>

          <FormField id="profile-username" label={t('reg.username')} hint={t('profile.info.usernameLocked')}>
            <Input id="profile-username" type="text" value={user?.username || ''} disabled className="bg-navy-50 text-navy-400 cursor-not-allowed" />
          </FormField>

          <Button type="submit" loading={loading} leftIcon={loading ? undefined : Save}>
            {t('profile.info.save')}
          </Button>
        </form>
      </Card.Body>
    </Card>
  );
}

function AssistantModelSection({ user, onUpdate }) {
  const { t } = useSettings();
  const [selected, setSelected] = useState(user?.preferred_model || 'bert_local');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');

  useEffect(() => {
    setSelected(user?.preferred_model || 'bert_local');
  }, [user]);

  const save = async (modelId) => {
    if (loading) return;
    setSelected(modelId);
    setError('');
    setOk('');
    setLoading(true);
    try {
      const { data } = await authAPI.updateProfile({ preferred_model: modelId });
      onUpdate(data.data.user);
      aiAPI.start(modelId).catch(() => {});
      setOk(t('profile.model.updated'));
    } catch (err) {
      setError(getApiErrorMessage(err, t('profile.model.updateFailed')));
      setSelected(user?.preferred_model || 'bert_local');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <Card.Header icon={BrainCircuit} iconTone="navy" title={t('profile.model.title')} />
      <Card.Body>
        <div className="space-y-3">
          {error && <Alert tone="error" onDismiss={() => setError('')}>{error}</Alert>}
          {ok && <Alert tone="success" onDismiss={() => setOk('')}>{ok}</Alert>}
          <p className="text-sm text-navy-500 flex items-start gap-2">
            <Cpu className="w-4 h-4 mt-0.5 flex-shrink-0 text-navy-400" />
            {t('profile.model.note')}
          </p>
          {MODEL_OPTIONS.map((m) => {
            const active = selected === m.id;
            return (
              <button
                key={m.id}
                type="button"
                disabled={loading}
                onClick={() => save(m.id)}
                className={`w-full text-start p-4 rounded-xl border-2 transition-all duration-200 ease-[var(--ease-out-snap)] disabled:opacity-60 ${
                  active ? 'border-emerald-500 bg-emerald-50/60' : 'border-navy-100 bg-white hover:border-navy-200 hover:-translate-y-0.5 hover:shadow-[var(--shadow-card-hover)]'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-navy-800 flex items-center gap-2">
                    {m.label}
                    {m.tag && <span className="text-[10px] font-medium text-navy-400 uppercase tracking-wider">{m.tag}</span>}
                  </span>
                  {active && (loading
                    ? <Loader2 className="w-4 h-4 animate-spin text-emerald-500" />
                    : <CheckCircle className="w-4 h-4 text-emerald-500" />)}
                </div>
                <p className="text-xs text-navy-500 mt-1">{m.desc}</p>
              </button>
            );
          })}
        </div>
      </Card.Body>
    </Card>
  );
}

function EmailChangeSection({ user, isGoogleUser, onUpdate }) {
  const { t } = useSettings();
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
      setOk(t('profile.email.codeSent'));
    } catch (err) {
      setError(getApiErrorMessage(err, t('profile.email.sendFailed')));
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
      setOk(t('profile.email.updated'));
      setNewEmail('');
      setCode('');
      setOtpSent(false);
    } catch (err) {
      setError(getApiErrorMessage(err, t('profile.email.verifyFailed')));
    } finally {
      setVerifying(false);
    }
  };

  if (isGoogleUser) {
    return (
      <Card>
        <Card.Header icon={Mail} iconTone="navy" title={t('profile.email.title')} />
        <Card.Body>
          <div className="flex items-start gap-3 p-4 rounded-xl bg-navy-50 border border-navy-100">
            <Shield className="w-5 h-5 text-navy-400 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-navy-700">{t('profile.email.googleManaged')}</p>
              <p className="text-sm text-navy-500 mt-0.5">{t('profile.email.googleManagedDesc')}</p>
            </div>
          </div>
        </Card.Body>
      </Card>
    );
  }

  return (
    <Card>
      <Card.Header icon={Mail} iconTone="blue" title={t('profile.email.changeTitle')} />
      <Card.Body>
        <div className="space-y-4">
          {error && <Alert tone="error" onDismiss={() => setError('')}>{error}</Alert>}
          {ok && <Alert tone="success" onDismiss={() => setOk('')}>{ok}</Alert>}

          <FormField id="profile-current-email" label={t('profile.email.current')}>
            <Input id="profile-current-email" type="email" value={user?.email || ''} disabled className="bg-navy-50 text-navy-400 cursor-not-allowed" />
          </FormField>

          <form onSubmit={handleSend} className="space-y-4">
            <FormField id="profile-new-email" label={t('profile.email.new')}>
              <Input
                id="profile-new-email"
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                required
                placeholder="new@example.com"
              />
            </FormField>
            <Button type="submit" variant="secondary" loading={sending} disabled={!newEmail} leftIcon={sending ? undefined : Mail}>
              {t('profile.email.sendCode')}
            </Button>
          </form>

          {otpSent && (
            <form onSubmit={handleVerify} className="space-y-4 pt-4 border-t border-navy-50">
              <FormField id="profile-email-code" label={t('profile.email.verifyCode')}>
                <Input
                  id="profile-email-code"
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  required
                  className="tracking-[0.35em]"
                  placeholder="123456"
                />
              </FormField>
              <Button type="submit" loading={verifying} disabled={code.length !== 6} leftIcon={verifying ? undefined : CheckCircle}>
                {t('profile.email.verifyAndUpdate')}
              </Button>
            </form>
          )}
        </div>
      </Card.Body>
    </Card>
  );
}

function ChangePasswordSection({ isGoogleUser }) {
  const { t } = useSettings();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');

  const passwordChecks = [
    { label: t('reg.check.len'), ok: newPassword.length >= 8 },
    { label: t('reg.check.upper'), ok: /[A-Z]/.test(newPassword) },
    { label: t('reg.check.lower'), ok: /[a-z]/.test(newPassword) },
    { label: t('reg.check.number'), ok: /\d/.test(newPassword) },
  ];
  const passwordStrength = passwordChecks.filter((item) => item.ok).length;
  const strengthColor = ['bg-coral-500', 'bg-coral-500', 'bg-amber-400', 'bg-amber-400', 'bg-emerald-500'][passwordStrength];

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (newPassword !== confirm) {
      setError(t('profile.password.newMismatch'));
      return;
    }
    if (passwordStrength < 4) {
      setError(t('fp.err.weak'));
      return;
    }

    setError('');
    setOk('');
    setLoading(true);
    try {
      await authAPI.changePassword(currentPassword, newPassword);
      setOk(t('profile.password.changed'));
      setCurrentPassword('');
      setNewPassword('');
      setConfirm('');
    } catch (err) {
      setError(getApiErrorMessage(err, t('profile.password.changeFailed')));
    } finally {
      setLoading(false);
    }
  };

  if (isGoogleUser) {
    return (
      <Card>
        <Card.Header icon={Lock} iconTone="navy" title={t('profile.password.title')} />
        <Card.Body>
          <div className="flex items-start gap-3 p-4 rounded-xl bg-navy-50 border border-navy-100">
            <Shield className="w-5 h-5 text-navy-400 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-navy-700">{t('profile.password.googleAccount')}</p>
              <p className="text-sm text-navy-500 mt-0.5">{t('profile.password.googleAccountDesc')}</p>
            </div>
          </div>
        </Card.Body>
      </Card>
    );
  }

  return (
    <Card>
      <Card.Header icon={Lock} iconTone="navy" title={t('profile.password.title')} />
      <Card.Body>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <Alert tone="error" onDismiss={() => setError('')}>{error}</Alert>}
          {ok && <Alert tone="success" onDismiss={() => setOk('')}>{ok}</Alert>}

          <PasswordFieldRow id="profile-current-password" label={t('profile.password.current')} value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} placeholder={t('profile.password.currentPlaceholder')} />
          <PasswordFieldRow id="profile-new-password" label={t('fp.newPasswordLabel')} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder={t('fp.newPasswordLabel')} />

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

          <PasswordFieldRow id="profile-confirm-password" label={t('profile.password.confirmNew')} value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder={t('fp.confirmPlaceholder')} />
          {confirm && newPassword !== confirm && <p className="text-xs text-coral-500 -mt-2">{t('fp.mismatch')}</p>}

          <Button type="submit" variant="secondary" loading={loading} disabled={passwordStrength < 4 || newPassword !== confirm} leftIcon={loading ? undefined : Lock}>
            {t('profile.password.update')}
          </Button>
        </form>
      </Card.Body>
    </Card>
  );
}

function DangerZoneSection({ onDeleteAccount }) {
  const { t } = useSettings();
  const [confirm, setConfirm] = useState('');
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleDelete = async () => {
    if (confirm !== 'DELETE') {
      setError(t('profile.danger.typeDelete'));
      return;
    }

    setLoading(true);
    try {
      await onDeleteAccount();
    } catch (err) {
      setError(getApiErrorMessage(err, t('profile.danger.deleteFailed')));
      setLoading(false);
    }
  };

  return (
    <Card>
      <Card.Header icon={Trash2} iconTone="coral" title={t('profile.danger.title')} />
      <Card.Body>
        <div className="space-y-4">
          <p className="text-sm text-navy-500">
            {t('profile.danger.desc')}
          </p>

          {!open ? (
            <Button variant="danger" leftIcon={Trash2} onClick={() => setOpen(true)}>
              {t('profile.danger.deleteBtn')}
            </Button>
          ) : (
            <div className="space-y-3 p-4 rounded-xl border border-coral-200 bg-coral-50/50">
              {error && <Alert tone="error" onDismiss={() => setError('')}>{error}</Alert>}
              <p className="text-sm font-medium text-coral-700">
                {t('profile.danger.confirmPrompt')} <code className="font-mono bg-coral-100 px-1 rounded">DELETE</code>
              </p>
              <Input
                type="text"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                error
                placeholder="DELETE"
              />
              <div className="flex gap-3">
                <Button variant="secondary" className="flex-1" onClick={() => { setOpen(false); setConfirm(''); setError(''); }}>
                  {t('profile.danger.cancel')}
                </Button>
                <Button
                  variant="danger"
                  className="flex-1"
                  loading={loading}
                  disabled={confirm !== 'DELETE'}
                  leftIcon={loading ? undefined : Trash2}
                  onClick={handleDelete}
                >
                  {t('profile.danger.deleteAccount')}
                </Button>
              </div>
            </div>
          )}
        </div>
      </Card.Body>
    </Card>
  );
}

export default function ProfilePage() {
  const { user, logout, updateCurrentUser } = useAuth();
  const { t } = useSettings();
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
            <ArrowLeft className="w-5 h-5 rtl:rotate-180" />
          </button>
          <div>
            <h1 className="font-display text-xl font-bold text-navy-900">{t('profile.title')}</h1>
            <p className="text-navy-400 text-sm">{t('profile.subtitle')}</p>
          </div>
          <button
            onClick={handleLogout}
            className="ms-auto flex items-center gap-2 px-4 py-2 rounded-xl text-sm text-navy-500 hover:text-coral-500 hover:bg-coral-50 border border-navy-200 hover:border-coral-200 transition-all font-medium"
          >
            <LogOut className="w-4 h-4" />
            {t('nav.signOut')}
          </button>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-6 py-8 space-y-6">
        <ProfileInfoSection user={currentUser} onUpdate={handleUpdate} />
        <AssistantModelSection user={currentUser} onUpdate={handleUpdate} />
        <EmailChangeSection user={currentUser} isGoogleUser={isGoogleUser} onUpdate={handleUpdate} />
        <ChangePasswordSection isGoogleUser={isGoogleUser} />
        <DangerZoneSection onDeleteAccount={handleDeleteAccount} />
      </div>
    </div>
    </div>
  );
}
