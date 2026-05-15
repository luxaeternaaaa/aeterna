import { Bot, CloudUpload, FlaskConical, Home, Shield, SlidersHorizontal, Sparkles } from 'lucide-react'
import clsx from 'clsx'

import type { PageId } from '../types'
import { getOptimizationLevelLabel } from '../lib/optimizationLevel'

const items = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'optimize', label: 'Tweaking', icon: Sparkles },
  { id: 'tests', label: 'Tools', icon: FlaskConical },
  { id: 'ml', label: 'Aeterna AI', icon: Bot },
  { id: 'history', label: 'Backup', icon: CloudUpload },
  { id: 'safety', label: 'Security', icon: Shield },
  { id: 'settings', label: 'Settings', icon: SlidersHorizontal },
] as const

interface SidebarProps {
  activePage: PageId
  optimizationLevel: number
  onSelect: (page: PageId) => void
}

export function Sidebar({ activePage, optimizationLevel, onSelect }: SidebarProps) {
  const optimizationLabel = getOptimizationLevelLabel(optimizationLevel)

  return (
    <aside className="flex h-full min-h-0 w-[78px] flex-col rounded-[1.35rem] bg-[#070b1b]/95 px-2 py-4 shadow-panel lg:w-[276px] lg:rounded-[1.55rem] lg:px-8 lg:py-8">
      <div className="mb-8 flex items-center justify-center lg:mb-14">
        <div className="relative h-10 w-10 lg:h-12 lg:w-12">
          <span className="absolute left-1 top-5 h-2 w-8 rotate-[-34deg] rounded-full bg-[#315cff] lg:h-2.5 lg:w-10" />
          <span className="absolute left-1 top-5 h-2 w-8 rotate-[34deg] rounded-full bg-[#315cff] lg:h-2.5 lg:w-10" />
          <span className="absolute left-[15px] top-[9px] h-7 w-2 rotate-[34deg] rounded-full bg-[#315cff] lg:left-[18px] lg:top-[8px] lg:h-8 lg:w-2.5" />
        </div>
      </div>

      <nav className="min-h-0 flex-1 space-y-2 overflow-auto">
        {items.map(({ icon: Icon, id, label }) => (
          <button
            key={id}
            onClick={() => onSelect(id)}
            title={label}
            className={clsx(
              'relative flex h-[54px] w-full items-center justify-center gap-4 rounded-xl px-0 text-lg font-semibold transition lg:justify-start lg:px-4',
              activePage === id
                ? 'bg-[#315cff] text-white shadow-[0_12px_32px_rgba(49,92,255,0.32)]'
                : 'text-white/88 hover:bg-white/7 hover:text-white',
            )}
            type="button"
          >
            <Icon className="shrink-0" size={24} />
            <span className="hidden min-w-0 truncate lg:block">{label}</span>
          </button>
        ))}
      </nav>

      <div className="mt-6 flex items-center justify-center gap-4 lg:justify-start">
        <div
          className="grid h-[58px] w-[58px] shrink-0 place-items-center rounded-full lg:h-[78px] lg:w-[78px]"
          style={{
            background: `conic-gradient(#ff4e5e ${optimizationLevel * 3.6}deg, #315cff ${optimizationLevel * 3.6}deg 360deg)`,
          }}
        >
          <div className="grid h-[48px] w-[48px] place-items-center rounded-full bg-[#070b1b] lg:h-[64px] lg:w-[64px]">
            <span className={`text-sm font-black lg:text-lg ${optimizationLevel > 0 ? 'text-[#ff4e5e]' : 'text-[#6d7da8]'}`}>{optimizationLevel}%</span>
          </div>
        </div>
        <p className="hidden min-w-0 text-base font-semibold leading-5 text-white lg:block">{optimizationLabel}</p>
      </div>
    </aside>
  )
}
