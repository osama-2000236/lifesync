// Gamification widget: logging streak + lifetime stats + bilingual achievement
// badges. Data from GET /api/insights/gamification (gamificationService). Badge
// titles switch language with the UI locale (Arabic is native, not translated).
import { Flame, Trophy, Lock } from 'lucide-react';
import { useSettings } from '../../contexts/SettingsContext';
import { SkeletonCard } from '../ui/Skeleton';

export default function StreakCard({ data, loading }) {
  const { t, locale } = useSettings();
  if (loading) return <SkeletonCard />;
  if (!data) return null;

  const { streak = {}, stats = {}, achievements = [], unlocked_count = 0 } = data;
  const current = streak.current || 0;
  const dayWord = current === 1 ? t('streak.day') : t('streak.days');
  const badgeTitle = (a) => (locale === 'ar' ? a.title_ar : a.title);

  return (
    <div className="bg-white rounded-2xl border border-navy-100 p-5 shadow-card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-display text-base font-bold text-navy-800 flex items-center gap-2">
          <Flame className="w-5 h-5 text-coral-500" />
          {t('streak.title')}
        </h3>
        <span className="text-[11px] text-navy-400">
          {t('streak.unlockedOf', { n: unlocked_count, total: achievements.length })}
        </span>
      </div>

      {/* Streak numbers */}
      <div className="flex items-stretch gap-3 mb-5">
        <div className="flex-1 rounded-xl bg-gradient-to-br from-coral-50 to-amber-50 border border-coral-200/60 p-4 text-center">
          <div className="flex items-center justify-center gap-1.5">
            <Flame className="w-6 h-6 text-coral-500" />
            <span className="text-3xl font-bold text-navy-900 tabular-nums">{current}</span>
          </div>
          <p className="text-[11px] text-navy-500 mt-1">{t('streak.current')} · {dayWord}</p>
        </div>
        <div className="flex-1 rounded-xl bg-navy-50/70 p-4 text-center flex flex-col justify-center">
          <p className="text-xl font-bold text-navy-800 tabular-nums">{streak.longest || 0}</p>
          <p className="text-[11px] text-navy-500 mt-0.5">{t('streak.longest')}</p>
          <p className="text-[11px] text-navy-400 mt-1">{streak.active_days || 0} {t('streak.activeDays')}</p>
        </div>
      </div>

      {/* Achievements */}
      <div className="flex items-center gap-1.5 mb-2.5">
        <Trophy className="w-4 h-4 text-amber-500" />
        <p className="text-xs font-semibold text-navy-600">{t('streak.achievements')}</p>
      </div>
      {current === 0 && unlocked_count === 0 ? (
        <p className="text-xs text-navy-400 py-2">{t('streak.keepGoing')}</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {achievements.map((a) => (
            <div
              key={a.id}
              title={badgeTitle(a)}
              className={`flex items-center gap-2 rounded-xl border px-2.5 py-2 transition-colors ${
                a.unlocked
                  ? 'border-emerald-200 bg-emerald-50'
                  : 'border-navy-100 bg-navy-50/40 opacity-60'
              }`}
            >
              <span className="text-lg leading-none" aria-hidden="true">
                {a.unlocked ? a.icon : <Lock className="w-3.5 h-3.5 text-navy-300" />}
              </span>
              <span className={`text-[11px] font-medium truncate ${a.unlocked ? 'text-emerald-700' : 'text-navy-400'}`}>
                {badgeTitle(a)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
