import { useState } from 'react';
import { NavLink, Outlet, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import {
  LayoutDashboard, MessageCircle, Heart, Wallet, Shield,
  LogOut, Menu, X, Activity, ChevronRight, Plug, Globe, FileText,
} from 'lucide-react';

const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/chat', label: 'Assistant', icon: MessageCircle },
  { to: '/health', label: 'Health', icon: Heart },
  { to: '/finance', label: 'Finance', icon: Wallet },
  { to: '/integrations', label: 'Integrations', icon: Plug },
];

const publicPageItems = [
  { to: '/landing', label: 'Landing', icon: Globe },
  { to: '/privacy', label: 'Privacy', icon: Shield },
  { to: '/terms', label: 'Terms', icon: FileText },
];

export default function AppLayout() {
  const { user, logout, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const navLinkClass = ({ isActive }) =>
    `flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 group ${
      isActive
        ? 'bg-emerald-500/10 text-emerald-600'
        : 'text-navy-500 hover:bg-navy-50 hover:text-navy-700'
    }`;

  const userInitial = (user?.name || user?.username || '?')[0].toUpperCase();

  return (
    <div className="flex h-screen bg-surface overflow-hidden">
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-navy-950/40 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside className={`
        fixed lg:static inset-y-0 left-0 z-50 w-72 bg-white border-r border-navy-100
        flex flex-col transition-transform duration-300 ease-out
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        <div className="flex items-center gap-3 px-6 py-5 border-b border-navy-50">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center shadow-md">
            <Activity className="w-5 h-5 text-white" strokeWidth={2.5} />
          </div>
          <div>
            <h1 className="font-display text-lg font-bold text-navy-900 tracking-tight">LifeSync</h1>
            <p className="text-[11px] text-navy-400 -mt-0.5 font-medium">Smart Life Management</p>
          </div>
          <button onClick={() => setSidebarOpen(false)} className="ml-auto lg:hidden text-navy-400">
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 px-4 py-4 space-y-1 overflow-y-auto">
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} className={navLinkClass} onClick={() => setSidebarOpen(false)}>
              <Icon className="w-[18px] h-[18px]" />
              <span>{label}</span>
              <ChevronRight className="w-4 h-4 ml-auto opacity-0 -translate-x-1 group-hover:opacity-50 group-hover:translate-x-0 transition-all" />
            </NavLink>
          ))}

          {isAdmin && (
            <>
              <div className="pt-4 pb-2 px-4">
                <p className="text-[10px] uppercase tracking-widest text-navy-300 font-semibold">Admin</p>
              </div>
              <NavLink to="/admin" className={navLinkClass} onClick={() => setSidebarOpen(false)}>
                <Shield className="w-[18px] h-[18px]" />
                <span>Admin Portal</span>
              </NavLink>
            </>
          )}

          <div className="pt-4 pb-2 px-4">
            <p className="text-[10px] uppercase tracking-widest text-navy-300 font-semibold">Public Pages</p>
          </div>
          {publicPageItems.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} className={navLinkClass} onClick={() => setSidebarOpen(false)}>
              <Icon className="w-[18px] h-[18px]" />
              <span>{label}</span>
              <ChevronRight className="w-4 h-4 ml-auto opacity-0 -translate-x-1 group-hover:opacity-50 group-hover:translate-x-0 transition-all" />
            </NavLink>
          ))}
        </nav>

        <div className="px-4 pb-4">
          <div className="flex items-center gap-3 p-3 rounded-xl bg-navy-50/60">
            <Link to="/profile" className="flex items-center gap-3 flex-1 min-w-0 group">
              <div className="w-9 h-9 rounded-full overflow-hidden bg-gradient-to-br from-navy-300 to-navy-500 flex items-center justify-center text-white text-sm font-bold flex-shrink-0 group-hover:ring-2 group-hover:ring-emerald-400 transition-all">
                {user?.avatar_url ? (
                  <img src={user.avatar_url} alt="Profile avatar" className="w-full h-full object-cover" />
                ) : (
                  userInitial
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-navy-800 truncate group-hover:text-emerald-700 transition-colors">
                  {user?.name || user?.username}
                </p>
                <p className="text-[11px] text-navy-400 truncate">{user?.email}</p>
              </div>
            </Link>
            <button
              onClick={handleLogout}
              className="p-2 rounded-lg hover:bg-navy-100 text-navy-400 hover:text-coral-500 transition-colors"
              title="Sign out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="lg:hidden flex items-center gap-3 px-4 py-3 bg-white border-b border-navy-100">
          <button onClick={() => setSidebarOpen(true)} className="p-2 rounded-lg hover:bg-navy-50 text-navy-600">
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-emerald-500" />
            <span className="font-display font-bold text-navy-800">LifeSync</span>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
