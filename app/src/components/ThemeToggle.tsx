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
      className="inline-flex items-center gap-2 rounded-full border border-border bg-surface-muted/70 px-3 py-2 text-xs font-medium text-text shadow-panel hover:border-border-strong hover:bg-hover"
      onClick={onToggle}
      type="button"
    >
      {dark ? <SunMedium size={14} /> : <MoonStar size={14} />}
      <span>{dark ? 'Light' : 'Dark'}</span>
    </button>
  )
}
