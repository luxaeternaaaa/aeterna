import { MoonStar, SunMedium } from 'lucide-react'

interface ThemeToggleProps {
  onToggle: () => void
  theme: 'dark' | 'light'
}

export function ThemeToggle({ onToggle, theme }: ThemeToggleProps) {
  const dark = theme === 'dark'

  return (
    <button
      aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
      className="inline-flex items-center gap-2 rounded-xl bg-surface-muted/80 px-3 py-2 text-xs font-medium text-text ring-1 ring-inset ring-border/70 transition hover:bg-hover"
      onClick={onToggle}
      type="button"
    >
      {dark ? <SunMedium size={14} /> : <MoonStar size={14} />}
      <span>{dark ? 'Light' : 'Dark'}</span>
    </button>
  )
}
