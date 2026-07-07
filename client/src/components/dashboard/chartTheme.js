// Chart.js paints to <canvas> from JS color literals, so the CSS `.dark` ramp
// inversion can't reach axis ticks, gridlines, legends, tooltips, or segment
// borders — they'd stay light-mode values on a dark card. This returns the
// theme-varying chart colors from one place; brand series colors (emerald,
// indigo, category palette) are identical in both themes and stay inline.
export const chartTheme = (isDark) => ({
  // Canvas text can't inherit the CSS :lang(ar) font override, so pick the
  // Arabic family here off the <html lang> SettingsContext maintains.
  font: (typeof document !== 'undefined' && document.documentElement.lang === 'ar')
    ? "'IBM Plex Sans Arabic', sans-serif"
    : "'DM Sans', sans-serif",
  tick: isDark ? '#8aa0b8' : '#829ab1',                              // navy-400 per ramp
  legend: isDark ? '#bccadb' : '#627d98',                           // heavier axis/legend labels
  grid: isDark ? 'rgba(138,160,184,0.15)' : 'rgba(188,204,220,0.3)',
  tooltipBg: isDark ? '#1f3350' : '#102a43',
  segmentBorder: isDark ? '#14233b' : '#ffffff',                    // = surface-raised, points read as cut-outs
});

// One entrance animation for every dashboard chart — respects reduced-motion.
export const chartMotion = () => {
  const reduced = typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  return reduced ? { animation: false } : { animation: { duration: 900, easing: 'easeOutQuart' } };
};
