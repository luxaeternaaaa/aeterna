import { useState, type ReactNode } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  Cpu,
  Database,
  HardDrive,
  Lock,
  Network,
  RefreshCw,
  RotateCcw,
  Shield,
  ShieldAlert,
  ShieldCheck,
  ShieldQuestion,
  SlidersHorizontal,
  Sparkles,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { useConfirmDialog } from '../components/ConfirmDialogContext'
import { requestWindowsRestart } from '../lib/sidecar'
import type { SecurityCheck, SecuritySummary } from '../types'

interface SecurityPageProps {
  security: SecuritySummary
  onClose?: () => void
  onOpenBackup?: () => void
  onOpenOptimization?: () => void
  onOpenSettings?: () => void
  onVerify?: () => Promise<void> | void
}

type Tone = 'good' | 'watch' | 'danger' | 'neutral' | 'accent'

interface SecurityCard {
  description: string
  icon: LucideIcon
  label: string
  title: string
  tone: Tone
}

interface Guardrail {
  description: string
  icon: LucideIcon
  title: string
}

function toneClasses(tone: Tone) {
  if (tone === 'good') return 'bg-[#123d2d] text-[#4dff9b]'
  if (tone === 'watch') return 'bg-[#3b2911] text-[#ffcf5a]'
  if (tone === 'danger') return 'bg-[#3a151d] text-[#ff6268]'
  if (tone === 'accent') return 'bg-[#152b5c] text-[#7ba2ff]'
  return 'bg-[#202942] text-white/70'
}

function iconTone(tone: Tone) {
  if (tone === 'good') return 'text-[#4dff9b] bg-[#123d2d]'
  if (tone === 'watch') return 'text-[#ffcf5a] bg-[#3b2911]'
  if (tone === 'danger') return 'text-[#ff6268] bg-[#3a151d]'
  if (tone === 'accent') return 'text-[#7ba2ff] bg-[#152b5c]'
  return 'text-white/72 bg-[#202942]'
}

function postureFromSecurity(security: SecuritySummary) {
  if (security.status === 'high') {
    return {
      label: security.label || 'Immediate review',
      detail: 'Aeterna detected a high-risk security posture. Verify Windows protection before applying more tweaks.',
      tone: 'danger' as Tone,
    }
  }
  if (security.status === 'medium') {
    return {
      label: security.label || 'Review recommended',
      detail: 'Security posture is usable, but pre-action review should stay enabled before optimizer changes.',
      tone: 'watch' as Tone,
    }
  }
  return {
    label: security.label || 'Protected session',
    detail: 'Core protection is treated as active. Aeterna will not silently weaken Windows security controls.',
    tone: 'good' as Tone,
  }
}

function toneFromCheck(status: SecurityCheck['status']): Tone {
  if (status === 'pass') return 'good'
  if (status === 'fail') return 'danger'
  if (status === 'warn') return 'watch'
  return 'neutral'
}

function iconFromCheck(check: SecurityCheck): LucideIcon {
  if (check.id.includes('firewall')) return Shield
  if (check.id.includes('service')) return Database
  if (check.id.includes('memory')) return Cpu
  if (check.id.includes('secure-boot')) return HardDrive
  if (check.id.includes('uac')) return Lock
  if (check.status === 'fail') return ShieldAlert
  if (check.status === 'warn' || check.status === 'unknown') return ShieldQuestion
  return ShieldCheck
}

function checkToCard(check: SecurityCheck): SecurityCard {
  return {
    title: check.title,
    label: check.label,
    tone: toneFromCheck(check.status),
    icon: iconFromCheck(check),
    description: check.detail,
  }
}

function ActionButton({
  children,
  disabled,
  onClick,
  tone = 'secondary',
  wide,
}: {
  children: ReactNode
  disabled?: boolean
  onClick?: () => void
  tone?: 'primary' | 'secondary' | 'danger'
  wide?: boolean
}) {
  const className =
    tone === 'primary'
      ? 'bg-[#315cff] text-white hover:bg-[#416aff]'
      : tone === 'danger'
        ? 'bg-[#e93c41] text-white hover:bg-[#f04b50]'
        : 'bg-[#202942] text-white hover:bg-[#2a3657]'

  return (
    <button
      className={`${wide ? 'flex w-full' : 'inline-flex'} min-h-11 items-center justify-center gap-2 rounded-[1rem] px-5 text-base font-semibold transition disabled:cursor-not-allowed disabled:opacity-45 ${className}`}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  )
}

function StatusPill({ children, tone }: { children: ReactNode; tone: Tone }) {
  return <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-black ${toneClasses(tone)}`}>{children}</span>
}

function SecurityControlCard({ item }: { item: SecurityCard }) {
  const Icon = item.icon
  return (
    <article className="rounded-[1.25rem] bg-[#070b1b]/88 px-5 py-4">
      <div className="flex min-w-0 items-start gap-4">
        <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${iconTone(item.tone)}`}>
          <Icon size={22} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h3 className="min-w-0 text-[17px] font-black leading-6 text-white">{item.title}</h3>
            <StatusPill tone={item.tone}>{item.label}</StatusPill>
          </div>
          <p className="mt-2 text-sm leading-6 text-white/56">{item.description}</p>
        </div>
      </div>
    </article>
  )
}

function GuardrailCard({ item }: { item: Guardrail }) {
  const Icon = item.icon
  return (
    <article className="rounded-[1.15rem] bg-[#111936] px-4 py-4">
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 shrink-0 text-[#7ba2ff]" size={20} />
        <div>
          <h3 className="text-[15px] font-black text-white">{item.title}</h3>
          <p className="mt-1 text-sm leading-5 text-white/52">{item.description}</p>
        </div>
      </div>
    </article>
  )
}

export function SecurityPage({
  security,
  onClose,
  onOpenBackup,
  onOpenOptimization,
  onOpenSettings,
  onVerify,
}: SecurityPageProps) {
  const requestConfirmation = useConfirmDialog()
  const [verifyBusy, setVerifyBusy] = useState(false)
  const [rebootBusy, setRebootBusy] = useState(false)
  const posture = postureFromSecurity(security)
  const confidence = Math.max(0, Math.min(100, Math.round(security.confidence * 100)))
  const scanCards = (security.checks ?? []).map(checkToCard)
  const scanSource = security.source === 'windows-security-scan' ? 'Windows scan' : security.source === 'windows-scan-error' ? 'Scan error' : 'Fallback'

  const handleVerify = async () => {
    if (verifyBusy || !onVerify) return
    setVerifyBusy(true)
    try {
      await onVerify()
    } finally {
      setVerifyBusy(false)
    }
  }

  const handleRebootNow = async () => {
    if (rebootBusy) return
    const confirmed = await requestConfirmation({
      confirmLabel: 'Restart now',
      description: 'Windows will restart immediately. Save open work before continuing.',
      eyebrow: 'Restart required',
      title: 'Restart Windows now?',
      tone: 'warning',
    })
    if (!confirmed) return
    setRebootBusy(true)
    try {
      await requestWindowsRestart()
    } finally {
      setRebootBusy(false)
    }
  }

  const fallbackControls: SecurityCard[] = [
    {
      title: 'Windows Defender Antivirus',
      label: 'Protected',
      tone: 'good',
      icon: ShieldCheck,
      description: 'Aeterna never disables real-time antivirus. Unsafe antivirus-off optimization entries stay blocked.',
    },
    {
      title: 'Windows Firewall',
      label: 'Protected',
      tone: 'good',
      icon: Shield,
      description: 'Firewall bypass and traffic-bypass tweaks are not automated because they can break VPN, Xbox, and network safety.',
    },
    {
      title: 'Security Center',
      label: 'Keep enabled',
      tone: 'good',
      icon: CheckCircle2,
      description: 'The app keeps Windows Security Center visible so protection state remains inspectable after optimization.',
    },
    {
      title: 'SmartScreen',
      label: 'Keep enabled',
      tone: 'good',
      icon: ShieldCheck,
      description: 'SmartScreen is treated as a protective default. Optimization presets reinforce it instead of suppressing it.',
    },
    {
      title: 'Memory Integrity (VBS)',
      label: 'Review',
      tone: 'watch',
      icon: Cpu,
      description: 'Latency-sensitive changes are marked as security tradeoffs, require restart, and are not selected by balanced ML mode.',
    },
    {
      title: 'Secure Boot',
      label: 'Firmware',
      tone: 'neutral',
      icon: HardDrive,
      description: 'Firmware-level protection is shown as a manual check because it cannot be safely changed from the app.',
    },
    {
      title: 'UAC and Code Integrity',
      label: 'Blocked',
      tone: 'good',
      icon: Lock,
      description: 'Privilege reduction, AMSI bypass, Code Integrity disable, and UAC downgrade actions are intentionally blocked.',
    },
    {
      title: 'Anti-cheat compatibility',
      label: 'Guarded',
      tone: 'accent',
      icon: Sparkles,
      description: 'Game-aware ML avoids kernel/security downgrades that can conflict with anti-cheat or make test results unreliable.',
    },
  ]
  const controls = scanCards.length > 0 ? scanCards : fallbackControls

  const guardrails: Guardrail[] = [
    {
      title: 'No silent security downgrades',
      icon: ShieldAlert,
      description: 'Antivirus, firewall, AMSI, UAC, and Code Integrity changes are treated as blocked or manual-only.',
    },
    {
      title: 'Restart gate',
      icon: RotateCcw,
      description: 'Restart-required changes are called out before apply and surfaced after apply with a restart action.',
    },
    {
      title: 'Rollback-first workflow',
      icon: Database,
      description: 'Optimization writes snapshots so changes can be restored from Backup if a tuning pass causes problems.',
    },
    {
      title: 'Local evidence',
      icon: Network,
      description: 'Security and performance signals stay local by default. Cloud or sync behavior belongs in Settings.',
    },
  ]

  const reviewItems: SecurityCard[] = [
    {
      title: 'Pre-action safety scan',
      label: security.auto_scan_enabled ? 'Enabled' : 'Disabled',
      tone: security.auto_scan_enabled ? 'good' : 'watch',
      icon: SlidersHorizontal,
      description: security.auto_scan_enabled
        ? 'Automatic review is enabled before sensitive optimization flows.'
        : 'Enable this in Settings so the app verifies safety signals before risky optimizer actions.',
    },
    {
      title: 'Optimizer security lane',
      label: 'Balanced',
      tone: 'accent',
      icon: Sparkles,
      description: 'Open Optimization > Security to review protected defaults and manual-only security tradeoffs.',
    },
    {
      title: 'Backup coverage',
      label: 'Recommended',
      tone: 'watch',
      icon: Database,
      description: 'Take a profile snapshot before trying maximum-mode or restart-required security-adjacent changes.',
    },
  ]

  return (
    <div className="mx-auto flex h-full min-h-0 max-w-[1440px] flex-col gap-5 px-2 text-white">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black">Security</h1>
          <p className="mt-1 text-sm font-semibold text-white/50">
            Protection-first controls for gaming optimization, rollback, restart gates, and unsafe tweak blocking.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 rounded-[1.35rem] bg-[#070b1b]/88 p-2">
          <ActionButton disabled={verifyBusy} onClick={() => void handleVerify()} tone="primary">
            <RefreshCw className={verifyBusy ? 'animate-spin' : ''} size={18} />
            <span>{verifyBusy ? 'Verifying' : 'Verify'}</span>
          </ActionButton>
          <ActionButton onClick={onOpenOptimization}>
            <Sparkles size={18} />
            <span>Optimization</span>
          </ActionButton>
          <ActionButton onClick={onOpenSettings}>
            <SlidersHorizontal size={18} />
            <span>Settings</span>
          </ActionButton>
          <ActionButton onClick={onClose}>
            <Shield size={18} />
            <span>Home</span>
          </ActionButton>
        </div>
      </header>

      <main className="grid min-h-0 flex-1 grid-cols-[minmax(310px,390px)_minmax(0,1fr)] gap-5">
        <aside className="flex min-h-0 flex-col gap-5 overflow-y-auto pr-1">
          <section className="rounded-[1.35rem] bg-[#070b1b]/86 p-5">
            <div className="flex items-start gap-4">
              <span className={`grid h-14 w-14 shrink-0 place-items-center rounded-2xl ${iconTone(posture.tone)}`}>
                {posture.tone === 'danger' ? <ShieldAlert size={27} /> : posture.tone === 'watch' ? <ShieldQuestion size={27} /> : <ShieldCheck size={27} />}
              </span>
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase text-white/36">Current posture</p>
                <h2 className="mt-2 text-2xl font-black leading-7">{posture.label}</h2>
                <p className="mt-2 text-sm leading-6 text-white/56">{posture.detail}</p>
              </div>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-[#111936] p-4">
                <p className="text-xs font-bold uppercase text-white/36">Confidence</p>
                <p className="mt-2 text-2xl font-black">{confidence}%</p>
              </div>
              <div className="rounded-xl bg-[#111936] p-4">
                <p className="text-xs font-bold uppercase text-white/36">Auto scan</p>
                <p className={`mt-2 text-2xl font-black ${security.auto_scan_enabled ? 'text-[#4dff9b]' : 'text-[#ffcf5a]'}`}>
                  {security.auto_scan_enabled ? 'On' : 'Off'}
                </p>
              </div>
              <div className="col-span-2 rounded-xl bg-[#111936] p-4">
                <p className="text-xs font-bold uppercase text-white/36">Scan source</p>
                <p className="mt-2 text-base font-black">{scanSource}</p>
                <p className="mt-1 truncate text-xs text-white/42">{security.checked_at ?? 'Not scanned yet'}</p>
              </div>
            </div>
          </section>

          <section className="rounded-[1.35rem] bg-[#070b1b]/86 p-5">
            <h2 className="text-xl font-black">Quick actions</h2>
            <div className="mt-4 space-y-2">
              <ActionButton disabled={verifyBusy} onClick={() => void handleVerify()} tone="primary" wide>
                <RefreshCw className={verifyBusy ? 'animate-spin' : ''} size={18} />
                <span>Verify protection</span>
              </ActionButton>
              <ActionButton onClick={onOpenBackup} wide>
                <Database size={18} />
                <span>Open Backup</span>
              </ActionButton>
              <ActionButton disabled={rebootBusy} onClick={() => void handleRebootNow()} wide>
                <RotateCcw className={rebootBusy ? 'animate-spin' : ''} size={18} />
                <span>{rebootBusy ? 'Restarting' : 'Restart PC'}</span>
              </ActionButton>
            </div>
            <p className="mt-4 text-sm leading-6 text-white/50">
              Restart only after applying restart-required changes. Backup is the safest first step before maximum-mode tuning.
            </p>
          </section>

          <section className="rounded-[1.35rem] bg-[#070b1b]/86 p-5">
            <h2 className="text-xl font-black">Security queue</h2>
            <div className="mt-4 space-y-3">
              {reviewItems.map((item) => (
                <SecurityControlCard item={item} key={item.title} />
              ))}
            </div>
          </section>
        </aside>

        <section className="min-h-0 min-w-0 overflow-y-auto pr-2">
          <div className="grid gap-5">
            <section>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-black">Protected defaults</h2>
                  <p className="mt-1 text-sm text-white/48">
                    {security.source === 'windows-security-scan'
                      ? 'Live Windows protection signals collected locally from this PC.'
                      : 'Security-sensitive areas that Aeterna keeps enabled or manual-only.'}
                  </p>
                </div>
                <StatusPill tone={posture.tone}>{posture.tone === 'danger' ? 'Inspect now' : posture.tone === 'watch' ? 'Review' : 'Ready'}</StatusPill>
              </div>
              <div className="grid gap-3 xl:grid-cols-2">
                {controls.map((item) => (
                  <SecurityControlCard item={item} key={item.title} />
                ))}
              </div>
            </section>

            <section className="rounded-[1.35rem] bg-[#070b1b]/80 p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-black">Aeterna guardrails</h2>
                  <p className="mt-1 text-sm text-white/48">Rules that keep performance work from becoming unsafe system hardening changes.</p>
                </div>
                <AlertTriangle className="text-[#ffcf5a]" size={24} />
              </div>
              <div className="grid gap-3 xl:grid-cols-2">
                {guardrails.map((item) => (
                  <GuardrailCard item={item} key={item.title} />
                ))}
              </div>
            </section>

            <section className="rounded-[1.35rem] bg-[#070b1b]/80 p-5">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-black">Safe optimization path</h2>
                  <p className="mt-1 max-w-3xl text-sm leading-6 text-white/52">
                    Use this sequence when tuning a PC for games: verify protection, take a backup snapshot, apply balanced or ML-selected changes, then restart only when prompted.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <ActionButton onClick={onOpenBackup}>
                    <Database size={18} />
                    <span>Backup</span>
                  </ActionButton>
                  <ActionButton onClick={onOpenOptimization} tone="primary">
                    <Sparkles size={18} />
                    <span>Open Optimization</span>
                  </ActionButton>
                </div>
              </div>
              <div className="mt-5 grid gap-3 lg:grid-cols-4">
                {[
                  ['1', 'Verify', 'Refresh the security summary before changes.'],
                  ['2', 'Snapshot', 'Save a local restore point in Backup.'],
                  ['3', 'Apply', 'Use balanced or ML-selected safe functions.'],
                  ['4', 'Restart', 'Only restart when a completed action asks for it.'],
                ].map(([step, title, description]) => (
                  <article className="rounded-[1rem] bg-[#111936] p-4" key={step}>
                    <span className="grid h-8 w-8 place-items-center rounded-full bg-[#315cff] text-sm font-black">{step}</span>
                    <h3 className="mt-3 text-base font-black">{title}</h3>
                    <p className="mt-1 text-sm leading-5 text-white/50">{description}</p>
                  </article>
                ))}
              </div>
            </section>
          </div>
        </section>
      </main>
    </div>
  )
}
