import { useState, type ReactNode } from 'react'
import {
  Activity,
  Bot,
  Check,
  ChevronDown,
  Cpu,
  Database,
  Eye,
  Gauge,
  Info,
  MonitorCog,
  MoonStar,
  Network,
  RefreshCw,
  Shield,
  SlidersHorizontal,
  SunMedium,
  X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import type { BuildMetadata, FeatureFlags, StartupDiagnostics, SystemSettings } from '../types'
import {
  loadMlDenyFunctionList,
  OPTIMIZATION_FUNCTIONS,
  saveMlDenyFunctionList,
} from '../lib/optimizationFunctions'

type SettingsSection = 'general' | 'interface' | 'privacy' | 'safety' | 'ml' | 'runtime'

interface SettingsPageProps {
  build: BuildMetadata
  featureFlags: FeatureFlags
  onToggleFlag: (key: keyof FeatureFlags, value: boolean) => Promise<void> | void
  onUpdateSystemSettings: (settings: SystemSettings) => Promise<void> | void
  onUpdateTheme: (theme: 'dark' | 'light') => Promise<void> | void
  settings: SystemSettings
  startupDiagnostics: StartupDiagnostics | null
  theme: 'dark' | 'light'
}

const sections: Array<{ id: SettingsSection; label: string; icon: LucideIcon }> = [
  { id: 'general', label: 'General', icon: SlidersHorizontal },
  { id: 'interface', label: 'Interface', icon: MonitorCog },
  { id: 'privacy', label: 'Privacy & Data', icon: Shield },
  { id: 'safety', label: 'Safety', icon: Gauge },
  { id: 'ml', label: 'ML Rules', icon: Bot },
  { id: 'runtime', label: 'Runtime', icon: Cpu },
]

function SettingsSwitch({
  checked,
  disabled,
  onChange,
}: {
  checked: boolean
  disabled?: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <button
      aria-checked={checked}
      className={`relative h-7 w-[54px] shrink-0 rounded-full transition disabled:cursor-not-allowed disabled:opacity-40 ${
        checked ? 'bg-[#315cff]' : 'bg-[#e93c41]'
      }`}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      role="switch"
      type="button"
    >
      <span
        className={`absolute top-1 grid h-5 w-5 place-items-center rounded-full bg-white text-[10px] transition-[left] ${
          checked ? 'left-[calc(100%-1.5rem)] text-[#315cff]' : 'left-1 text-[#e93c41]'
        }`}
      >
        {checked ? <Check size={13} /> : <X size={13} />}
      </span>
    </button>
  )
}

function SettingSelect({
  disabled,
  onChange,
  options,
  value,
}: {
  disabled?: boolean
  onChange: (value: string) => void
  options: Array<{ label: string; value: string }>
  value: string
}) {
  return (
    <div className="relative min-w-[180px]">
      <select
        className="h-10 w-full appearance-none rounded-xl bg-[#202942] px-4 pr-9 text-sm font-semibold text-white outline-none"
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-3 text-white/70" size={16} />
    </div>
  )
}

function SettingRow({
  children,
  description,
  icon: Icon,
  title,
}: {
  children: ReactNode
  description?: string
  icon: LucideIcon
  title: string
}) {
  return (
    <article className="rounded-[1.35rem] bg-[#070b1b]/88 px-5 py-4">
      <div className="flex min-w-0 items-center gap-4">
        <Icon className="shrink-0 text-white/92" size={24} />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <h3 className="min-w-0 truncate text-[17px] font-semibold leading-6 text-white">{title}</h3>
            <ChevronDown className="shrink-0 text-white/70" size={15} />
          </div>
          {description ? <p className="mt-1 text-sm leading-5 text-white/50">{description}</p> : null}
        </div>
        <div className="flex shrink-0 items-center gap-3">{children}</div>
      </div>
    </article>
  )
}

function SwitchControl({
  checked,
  disabled,
  onChange,
}: {
  checked: boolean
  disabled?: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <>
      <span className={`text-sm font-bold ${checked ? 'text-[#315cff]' : 'text-[#ff4e5e]'}`}>
        {checked ? 'Enabled' : 'Disabled'}
      </span>
      <SettingsSwitch checked={checked} disabled={disabled} onChange={onChange} />
    </>
  )
}

export function SettingsPage({
  build,
  featureFlags,
  onToggleFlag,
  onUpdateSystemSettings,
  onUpdateTheme,
  settings,
  startupDiagnostics,
  theme,
}: SettingsPageProps) {
  const [section, setSection] = useState<SettingsSection>('general')
  const [busy, setBusy] = useState<string | null>(null)
  const [denyListOpen, setDenyListOpen] = useState(false)
  const [denyList, setDenyList] = useState<Set<string>>(() => loadMlDenyFunctionList())
  const [status, setStatus] = useState<string | null>(null)

  const run = async (key: string, action: () => Promise<void> | void) => {
    if (busy) return
    setBusy(key)
    setStatus(null)
    try {
      await action()
      setStatus('Settings updated.')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Settings update failed.')
    } finally {
      setBusy(null)
    }
  }

  const updateSystem = (key: string, patch: Partial<SystemSettings>) =>
    run(key, () => onUpdateSystemSettings({ ...settings, ...patch }))

  const toggleDeniedFunction = (functionId: string, denied: boolean) => {
    setDenyList((current) => {
      const next = new Set(current)
      if (denied) next.add(functionId)
      else next.delete(functionId)
      saveMlDenyFunctionList(next)
      return next
    })
  }

  const toggleAllowlist = (item: SystemSettings['automation_allowlist'][number], enabled: boolean) => {
    const next = new Set(settings.automation_allowlist)
    if (enabled) next.add(item)
    else next.delete(item)
    void updateSystem(`allowlist-${item}`, { automation_allowlist: Array.from(next) })
  }

  const renderRows = () => {
    if (section === 'general') {
      return (
        <>
          <SettingRow description="Application color mode." icon={theme === 'dark' ? MoonStar : SunMedium} title="Theme">
            <SettingSelect
              disabled={busy !== null}
              onChange={(value) => void run('theme', () => onUpdateTheme(value as 'dark' | 'light'))}
              options={[
                { label: 'Dark', value: 'dark' },
                { label: 'Light', value: 'light' },
              ]}
              value={theme}
            />
          </SettingRow>
          <SettingRow description="Default profile used by recommendations and assisted optimization." icon={Gauge} title="Active profile">
            <SettingSelect
              disabled={busy !== null}
              onChange={(value) => void updateSystem('profile', { active_profile: value })}
              options={[
                { label: 'Balanced', value: 'balanced' },
                { label: 'Performance', value: 'performance' },
                { label: 'Quiet', value: 'quiet' },
              ]}
              value={settings.active_profile}
            />
          </SettingRow>
          <SettingRow description="Live mode uses local counters; disabled mode stops the stream." icon={Activity} title="Telemetry mode">
            <SettingSelect
              disabled={busy !== null}
              onChange={(value) => void updateSystem('telemetry-mode', { telemetry_mode: value as SystemSettings['telemetry_mode'] })}
              options={[
                { label: 'Live', value: 'live' },
                { label: 'Demo', value: 'demo' },
                { label: 'Off', value: 'disabled' },
              ]}
              value={settings.telemetry_mode}
            />
          </SettingRow>
          <SettingRow description="Controls how much the app may do without direct confirmation." icon={SlidersHorizontal} title="Automation mode">
            <SettingSelect
              disabled={busy !== null}
              onChange={(value) => void updateSystem('automation-mode', { automation_mode: value as SystemSettings['automation_mode'] })}
              options={[
                { label: 'Manual', value: 'manual' },
                { label: 'Assisted', value: 'assisted' },
                { label: 'Trusted profiles', value: 'trusted_profiles' },
              ]}
              value={settings.automation_mode}
            />
          </SettingRow>
        </>
      )
    }

    if (section === 'interface') {
      return (
        <>
          <SettingRow
            description="Shows exact registry values and affected scopes inside Optimization."
            icon={Eye}
            title="Show advanced registry details"
          >
            <SwitchControl
              checked={settings.show_advanced_registry_details}
              disabled={busy !== null}
              onChange={(checked) => void updateSystem('advanced-details', { show_advanced_registry_details: checked })}
            />
          </SettingRow>
          <SettingRow
            description="Keeps unsupported or blocked Optimization entries visible with their reason."
            icon={Info}
            title="Show blocked optimization details"
          >
            <SwitchControl
              checked={settings.registry_presets_enabled}
              disabled={busy !== null}
              onChange={(checked) => void updateSystem('preset-catalog', { registry_presets_enabled: checked })}
            />
          </SettingRow>
          <SettingRow description="Backend polling interval for local telemetry sampling." icon={RefreshCw} title="Sampling interval">
            <SettingSelect
              disabled={busy !== null}
              onChange={(value) => void updateSystem('sampling', { sampling_interval_seconds: Number(value) })}
              options={[
                { label: '1 second', value: '1' },
                { label: '3 seconds', value: '3' },
                { label: '5 seconds', value: '5' },
                { label: '10 seconds', value: '10' },
              ]}
              value={String(settings.sampling_interval_seconds)}
            />
          </SettingRow>
        </>
      )
    }

    if (section === 'privacy') {
      return (
        <>
          <SettingRow description="Collects local counters for dashboards, tests, and optimization evidence." icon={Activity} title="Local telemetry collection">
            <SwitchControl
              checked={featureFlags.telemetry_collect}
              disabled={busy !== null}
              onChange={(checked) => void run('telemetry-flag', () => onToggleFlag('telemetry_collect', checked))}
            />
          </SettingRow>
          <SettingRow description="Keeps local risk signals available during tests." icon={Gauge} title="Anomaly review">
            <SwitchControl
              checked={featureFlags.anomaly_detection}
              disabled={busy !== null}
              onChange={(checked) => void run('anomaly-flag', () => onToggleFlag('anomaly_detection', checked))}
            />
          </SettingRow>
          <SettingRow description="Aeterna stays local unless this is explicitly enabled." icon={Network} title="Allow outbound sync">
            <SwitchControl
              checked={settings.allow_outbound_sync}
              disabled={busy !== null}
              onChange={(checked) => void updateSystem('outbound-sync', { allow_outbound_sync: checked })}
            />
          </SettingRow>
          <SettingRow description="How long local telemetry evidence is retained by backend services." icon={Database} title="Telemetry retention">
            <SettingSelect
              disabled={busy !== null}
              onChange={(value) => void updateSystem('retention', { telemetry_retention_days: Number(value) })}
              options={[
                { label: '7 days', value: '7' },
                { label: '14 days', value: '14' },
                { label: '30 days', value: '30' },
                { label: '60 days', value: '60' },
              ]}
              value={String(settings.telemetry_retention_days)}
            />
          </SettingRow>
        </>
      )
    }

    if (section === 'safety') {
      return (
        <>
          <SettingRow description="Allows bounded and reversible optimizer actions." icon={Shield} title="Safe optimizer actions">
            <SwitchControl
              checked={featureFlags.network_optimizer}
              disabled={busy !== null}
              onChange={(checked) => void run('safe-actions', () => onToggleFlag('network_optimizer', checked))}
            />
          </SettingRow>
          <SettingRow description="Runs local checks before risky actions." icon={Shield} title="Pre-action safety scan">
            <SwitchControl
              checked={featureFlags.auto_security_scan}
              disabled={busy !== null}
              onChange={(checked) => void run('safety-scan', () => onToggleFlag('auto_security_scan', checked))}
            />
          </SettingRow>
          <SettingRow description="Allow assisted mode to change process priority." icon={Cpu} title="Automation: process priority">
            <SwitchControl
              checked={settings.automation_allowlist.includes('process_priority')}
              disabled={busy !== null}
              onChange={(checked) => toggleAllowlist('process_priority', checked)}
            />
          </SettingRow>
          <SettingRow description="Allow assisted mode to tune process CPU affinity." icon={Cpu} title="Automation: CPU affinity">
            <SwitchControl
              checked={settings.automation_allowlist.includes('cpu_affinity')}
              disabled={busy !== null}
              onChange={(checked) => toggleAllowlist('cpu_affinity', checked)}
            />
          </SettingRow>
          <SettingRow description="Allow assisted mode to select a Windows power plan." icon={Gauge} title="Automation: power plan">
            <SwitchControl
              checked={settings.automation_allowlist.includes('power_plan')}
              disabled={busy !== null}
              onChange={(checked) => toggleAllowlist('power_plan', checked)}
            />
          </SettingRow>
        </>
      )
    }

    if (section === 'ml') {
      return (
        <>
          <SettingRow
            description={`Blocked for one-click ML optimization: ${denyList.size} of ${OPTIMIZATION_FUNCTIONS.length}.`}
            icon={Bot}
            title="Deny Function List"
          >
            <button
              className="inline-flex h-10 items-center rounded-[0.9rem] border border-[#315cff] px-4 text-sm font-bold text-white hover:bg-[#315cff]/18"
              onClick={() => setDenyListOpen(true)}
              type="button"
            >
              Open
            </button>
          </SettingRow>
          <SettingRow description="The ML page will not auto-apply functions in the deny list." icon={Info} title="Manual confirmation remains required">
            <span className="text-sm font-bold text-[#315cff]">Enabled</span>
          </SettingRow>
        </>
      )
    }

    return (
      <>
        <SettingRow description={build.git_commit || 'development'} icon={Cpu} title="Build">
          <span className="text-sm font-bold text-white/72">{build.version}</span>
        </SettingRow>
        <SettingRow description={`Runtime schema ${build.runtime_schema_version}`} icon={Database} title="Sidecar protocol">
          <span className="text-sm font-bold text-white/72">{build.sidecar_protocol_version}</span>
        </SettingRow>
        <SettingRow description={startupDiagnostics?.sidecar_ready_at || 'Waiting for desktop sidecar'} icon={Activity} title="Sidecar">
          <span className={`text-sm font-bold ${startupDiagnostics?.sidecar_ready_at ? 'text-[#315cff]' : 'text-[#ff4e5e]'}`}>
            {startupDiagnostics?.sidecar_ready_at ? 'Ready' : 'Not ready'}
          </span>
        </SettingRow>
        <SettingRow description={startupDiagnostics?.backend_ready_at || 'Backend starts on demand'} icon={Network} title="Backend">
          <span className={`text-sm font-bold ${startupDiagnostics?.backend_ready_at ? 'text-[#315cff]' : 'text-white/55'}`}>
            {startupDiagnostics?.backend_ready_at ? 'Ready' : 'Lazy start'}
          </span>
        </SettingRow>
      </>
    )
  }

  return (
    <div className="mx-auto grid h-full min-h-0 max-w-[1380px] grid-cols-[minmax(240px,300px)_minmax(0,1fr)] gap-5 px-2 text-white">
      <aside className="flex min-h-0 flex-col gap-5">
        <h1 className="px-3 text-2xl font-black">Settings</h1>
        <div className="rounded-[1.35rem] bg-[#070b1b]/86 p-3">
          <div className="space-y-1">
            {sections.map((item) => {
              const Icon = item.icon
              const active = item.id === section
              return (
                <button
                  key={item.id}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-base font-semibold transition ${
                    active ? 'bg-[#315cff] text-white' : 'text-white hover:bg-white/8'
                  }`}
                  onClick={() => setSection(item.id)}
                  type="button"
                >
                  <Icon size={20} />
                  <span className="min-w-0 truncate">{item.label}</span>
                </button>
              )
            })}
          </div>
        </div>
        {status ? <div className="rounded-[1rem] bg-[#070b1b]/86 px-4 py-3 text-sm font-semibold text-white/72">{status}</div> : null}
      </aside>

      <section className="min-h-0 overflow-y-auto pr-2">
        <div className="space-y-2 pb-5">{renderRows()}</div>
      </section>

      {denyListOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/55 p-4">
          <div className="w-full max-w-5xl overflow-hidden rounded-[1.35rem] border border-[#315cff]/25 bg-[#070b1b] shadow-float">
            <div className="flex items-center justify-between border-b border-white/10 px-6 py-5">
              <h3 className="text-lg font-semibold tracking-tight text-white">Deny Function List ({denyList.size} blocked)</h3>
              <button className="rounded-xl bg-[#202942] px-4 py-2 text-sm font-semibold text-white" onClick={() => setDenyListOpen(false)} type="button">
                Close
              </button>
            </div>
            <div className="max-h-[70vh] overflow-y-auto px-6 py-5">
              <div className="grid gap-2 md:grid-cols-2">
                {OPTIMIZATION_FUNCTIONS.map((item) => {
                  const blocked = denyList.has(item.id)
                  return (
                    <label key={item.id} className="rounded-[1.1rem] bg-[#101735] px-4 py-3 text-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-semibold text-white">{item.title}</p>
                          <p className="mt-1 text-white/58">{item.description}</p>
                        </div>
                        <SettingsSwitch checked={blocked} onChange={(checked) => toggleDeniedFunction(item.id, checked)} />
                      </div>
                    </label>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
