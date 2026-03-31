import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Activity, ArrowLeft, Home, Search } from 'lucide-react';

export default function NotFoundPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-surface flex flex-col items-center justify-center px-6 text-center">
      <Link to="/" className="flex items-center gap-2.5 mb-12">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center shadow-md">
          <Activity className="w-5 h-5 text-white" strokeWidth={2.5} />
        </div>
        <span className="font-display text-xl font-bold text-navy-900">LifeSync</span>
      </Link>

      <div className="relative mb-8 select-none">
        <div className="font-display font-bold text-[8rem] sm:text-[12rem] leading-none text-navy-100 tracking-tighter">
          404
        </div>
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center shadow-xl shadow-emerald-500/25">
            <Search className="w-8 h-8 text-white" />
          </div>
        </div>
      </div>

      <h1 className="font-display text-2xl font-bold text-navy-900 mb-2">Page not found</h1>
      <p className="text-navy-500 max-w-sm mb-8 leading-relaxed">
        This page doesn&apos;t exist or was moved. Check the URL or head back to somewhere familiar.
      </p>

      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-navy-200 text-navy-600 font-medium text-sm hover:bg-navy-50 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Go back
        </button>
        <Link
          to={user ? '/dashboard' : '/'}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 text-white font-semibold text-sm shadow-md shadow-emerald-500/20 hover:from-emerald-600 hover:to-emerald-700 transition-all"
        >
          <Home className="w-4 h-4" />
          {user ? 'Dashboard' : 'Home'}
        </Link>
      </div>
    </div>
  );
}
