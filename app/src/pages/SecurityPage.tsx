import { useState } from 'react'
import { RotateCcw, ShieldCheck, ShieldQuestion, X } from 'lucide-react'

import type { SecuritySummary } from '../types'
import { requestWindowsRestart } from '../lib/sidecar'

interface SecurityPageProps {
  security: SecuritySummary
  onClose?: () => void
  onVerify?: () => Promise<void> | void
}

interface SecurityControlCard {
  id: string
  title: string
  description: string
  stateChip: { label: string; tone: 'success' | 'warning' | 'neutral' }
  riskChip: { label: string; tone: 'danger' | 'warning' | 'neutral' }
  primaryAction: { label: string; enabled: boolean }
  secondaryAction?: { label: string; enabled: boolean }
  rebootRequired?: boolean
  badge?: { icon: 'guided' | 'firmware' | 'security'; label: string; tone: 'neutral' | 'warning' | 'success' }
}

function chipToneClass(tone: 'success' | 'warning' | 'danger' | 'neutral') {
  if (tone === 'success') return 'bg-success-soft text-success'
  if (tone === 'warning') return 'bg-warning-soft text-warning'
  if (tone === 'danger') return 'bg-danger-soft text-danger'
  return 'bg-surface text-muted'
}

const CONTROL_CARDS: SecurityControlCard[] = [
  {
    id: 'memory-integrity',
    title: 'Memory Integrity (HVCI)',
    description: 'Kernel-mode code integrity hardening against vulnerable or unsigned drivers.',
    stateChip: { label: 'Enabled', tone: 'success' },
    riskChip: { label: 'high risk', tone: 'danger' },
    primaryAction: { label: 'Enable', enabled: false },
    secondaryAction: { label: 'Disable', enabled: true },
    rebootRequired: true,
  },
  {
    id: 'driver-blocklist',
    title: 'Microsoft Vulnerable Driver Blocklist',
    description: 'Blocks known vulnerable drivers commonly abused by cheats and malware.',
    stateChip: { label: 'Disabled', tone: 'warning' },
    riskChip: { label: 'medium risk', tone: 'warning' },
    primaryAction: { label: 'Enable', enabled: true },
    secondaryAction: { label: 'Disable', enabled: false },
    rebootRequired: true,
  },
  {
    id: 'windows-antivirus',
    title: 'Windows Antivirus',
    description: 'Built-in real-time protection for malware, suspicious behavior, and unsafe downloads.',
    stateChip: { label: 'Enabled', tone: 'success' },
    riskChip: { label: 'low risk', tone: 'neutral' },
    primaryAction: { label: 'Open guide', enabled: true },
    badge: { icon: 'security', label: 'System', tone: 'success' },
  },
  {
    id: 'secure-boot',
    title: 'Secure Boot',
    description: 'Validates boot chain integrity before Windows loads.',
    stateChip: { label: 'Firmware', tone: 'neutral' },
    riskChip: { label: 'high risk', tone: 'danger' },
    primaryAction: { label: 'Open guide', enabled: true },
    rebootRequired: true,
    badge: { icon: 'firmware', label: 'Firmware', tone: 'neutral' },
  },
  {
    id: 'smart-app-control',
    title: 'Smart App Control',
    description: 'Blocks untrusted or low-reputation applications at launch.',
    stateChip: { label: 'Policy', tone: 'neutral' },
    riskChip: { label: 'low risk', tone: 'neutral' },
    primaryAction: { label: 'Open guide', enabled: true },
    badge: { icon: 'guided', label: 'Guided', tone: 'neutral' },
  },
]

function renderBadge(card: SecurityControlCard) {
  if (!card.badge) return null

  const icon =
    card.badge.icon === 'firmware' ? (
      <ShieldQuestion size={14} />
    ) : card.badge.icon === 'guided' ? (
      <ShieldQuestion size={14} />
    ) : (
      <ShieldCheck size={14} />
    )

  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-medium ${chipToneClass(card.badge.tone)}`}>
      {icon}
      <span>{card.badge.label}</span>
    </span>
  )
}

export function SecurityPage({ security, onClose, onVerify }: SecurityPageProps) {
  const confidenceLabel = `${Math.round(security.confidence * 100)}%`
  const postureLabel = security.label || 'Hardening recommended'
  const [verifyBusy, setVerifyBusy] = useState(false)
  const [rebootBusy, setRebootBusy] = useState(false)

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
    const confirmed = window.confirm('Windows will restart immediately. Continue?')
    if (!confirmed) return
    setRebootBusy(true)
    try {
      await requestWindowsRestart()
    } finally {
      setRebootBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[1.5rem] bg-surface p-0 md:p-1">
        <div className="flex flex-wrap items-start justify-between gap-3 p-2 md:p-3">
          <h2 className="px-1 pt-1 text-[1.55rem] font-semibold tracking-tight text-text">Security audit</h2>
          <div className="flex items-center gap-2">
            <button className="button-secondary px-4 py-2 text-[13px]" disabled={verifyBusy} onClick={() => void handleVerify()} type="button">
              <RotateCcw size={19} />
              <span className="ml-2">{verifyBusy ? 'Verifying...' : 'Verify'}</span>
            </button>
            <button className="button-primary px-5 py-2 text-[13px]" disabled={rebootBusy} onClick={() => void handleRebootNow()} type="button">
              <RotateCcw size={19} />
              <span className="ml-2">{rebootBusy ? 'Rebooting...' : 'Reboot now'}</span>
            </button>
            <button
              aria-label="Close security panel"
              className="grid h-14 w-14 place-items-center rounded-full border border-border/70 bg-surface text-text/85 transition hover:bg-hover"
              onClick={onClose}
              type="button"
            >
              <X size={24} />
            </button>
          </div>
        </div>

        <div className="grid gap-4 p-2 md:grid-cols-3 md:p-3">
          <div className="rounded-[1.4rem] border border-border/50 bg-surface px-6 py-5">
            <p className="text-xs uppercase tracking-[0.12em] text-muted">Posture</p>
            <p className="mt-2 text-[1.25rem] font-semibold leading-[1.22] tracking-tight text-text">{postureLabel}</p>
          </div>
          <div className="rounded-[1.4rem] border border-border/50 bg-surface px-6 py-5">
            <p className="text-xs uppercase tracking-[0.12em] text-muted">Confidence</p>
            <p className="mt-2 text-[1.25rem] font-semibold leading-[1.22] tracking-tight text-text">{confidenceLabel}</p>
          </div>
          <div className="rounded-[1.4rem] border border-border/50 bg-surface px-6 py-5">
            <p className="text-xs uppercase tracking-[0.12em] text-muted">Session gate</p>
            <p className="mt-2 text-[1.25rem] font-semibold leading-[1.22] tracking-tight text-text">
              {security.auto_scan_enabled ? 'Ready' : 'Review needed'}
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-[1.5rem] bg-surface p-2 md:p-3">
        <h3 className="px-1 pb-3 pt-1 text-[1.45rem] font-semibold tracking-tight text-text">Controls</h3>
        <div className="grid gap-4 md:grid-cols-2">
          {CONTROL_CARDS.map((card) => (
            <article key={card.id} className="rounded-[1.5rem] bg-surface-muted/85 px-6 py-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <h4 className="text-[1.18rem] font-semibold leading-[1.24] tracking-tight text-text">{card.title}</h4>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  {renderBadge(card)}
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${chipToneClass(card.stateChip.tone)}`}>{card.stateChip.label}</span>
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${chipToneClass(card.riskChip.tone)}`}>{card.riskChip.label}</span>
                </div>
              </div>

              <p className="mt-3 max-w-[90ch] text-[15px] leading-[1.5] text-muted">{card.description}</p>

              <div className="mt-5 flex flex-wrap items-center gap-3">
                <button
                  className={card.primaryAction.enabled ? 'button-primary px-5 py-2 text-[13px]' : 'button-primary cursor-not-allowed px-5 py-2 text-[13px] opacity-55'}
                  disabled={!card.primaryAction.enabled}
                  type="button"
                >
                  {card.primaryAction.label}
                </button>

                {card.secondaryAction ? (
                  <button
                    className={card.secondaryAction.enabled ? 'button-secondary px-5 py-2 text-[13px]' : 'button-secondary cursor-not-allowed px-5 py-2 text-[13px] opacity-55'}
                    disabled={!card.secondaryAction.enabled}
                    type="button"
                  >
                    {card.secondaryAction.label}
                  </button>
                ) : null}

                {card.rebootRequired ? (
                  <span className="inline-flex items-center rounded-full bg-warning-soft px-2.5 py-1 text-[11px] font-semibold text-warning">Reboot required</span>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}
