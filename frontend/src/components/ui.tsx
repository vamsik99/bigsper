import { type ReactNode } from 'react'

// ─── AccentCard ──────────────────────────────────────────────────────────────
// Bold solid-color card with white text + optional pill CTA

type AccentColor = 'blue' | 'coral' | 'lime' | 'ink'

const ACCENT_BG: Record<AccentColor, string> = {
  blue:  'var(--accent-blue)',
  coral: 'var(--accent-coral)',
  lime:  'var(--accent-lime)',
  ink:   'var(--accent-ink)',
}

interface AccentCardProps {
  accent: AccentColor
  icon?: string
  title: string
  body: string
  cta?: string
  onCta?: () => void
  className?: string
}

export function AccentCard({ accent, icon, title, body, cta, onCta, className = '' }: AccentCardProps) {
  return (
    <div
      className={`rounded-2xl p-5 flex flex-col gap-3 shadow-md ${className}`}
      style={{ background: ACCENT_BG[accent] }}
    >
      {icon && <div className="text-2xl">{icon}</div>}
      <div>
        <h3 className="text-white font-black text-base leading-snug">{title}</h3>
        <p className="text-white/65 text-xs mt-1 leading-relaxed">{body}</p>
      </div>
      {cta && (
        <button
          onClick={onCta}
          className="self-start text-white text-xs font-bold px-4 py-1.5 rounded-full transition
                     bg-white/20 hover:bg-white/30"
        >
          {cta} →
        </button>
      )}
    </div>
  )
}

// ─── Pill ─────────────────────────────────────────────────────────────────────
// Rounded pill for profile toggles / filter tags

interface PillProps {
  label: string
  active?: boolean
  onClick?: () => void
  disabled?: boolean
}

export function Pill({ label, active, onClick, disabled }: PillProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`px-3 py-1 text-xs rounded-full font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
        active
          ? 'text-white shadow-sm'
          : 'bg-gray-100 hover:bg-gray-200'
      }`}
      style={active ? { background: 'var(--accent-blue)', color: '#fff' } : { color: 'var(--muted)' }}
    >
      {label}
    </button>
  )
}

// ─── ListRow ──────────────────────────────────────────────────────────────────
// White card row: avatar · title + meta · right label

interface ListRowProps {
  title: string
  meta?: string
  avatarText?: string
  avatarBg?: string
  rightSlot?: ReactNode
  onClick?: () => void
  selected?: boolean
}

export function ListRow({ title, meta, avatarText, avatarBg = 'var(--accent-blue)', rightSlot, onClick, selected }: ListRowProps) {
  return (
    <div
      onClick={onClick}
      className={`flex items-center gap-3 bg-white rounded-xl px-4 py-3 shadow-sm border transition-all ${
        onClick ? 'cursor-pointer' : ''
      } ${
        selected
          ? 'border-blue-300 shadow-blue-50'
          : 'border-gray-100 hover:border-gray-200 hover:shadow'
      }`}
    >
      {avatarText && (
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-white text-xs font-black"
          style={{ background: avatarBg }}
        >
          {avatarText}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div
          className="text-sm font-semibold truncate"
          style={{ color: selected ? 'var(--accent-blue)' : 'var(--ink)' }}
        >
          {title}
        </div>
        {meta && <div className="text-xs truncate mt-0.5" style={{ color: 'var(--muted)' }}>{meta}</div>}
      </div>
      {rightSlot && <div className="shrink-0">{rightSlot}</div>}
    </div>
  )
}

// ─── Badge ────────────────────────────────────────────────────────────────────
// Status badge: verified · ai_assessed · mastered · partial · gap · pass · fail

type BadgeKind = 'verified' | 'ai_assessed' | 'mastered' | 'partial' | 'gap' | 'unknown' | 'pass' | 'fail'

const BADGE_STYLE: Record<BadgeKind, { bg: string; text: string; border: string; label: string }> = {
  verified:    { bg: '#F0FDF4', text: '#166534', border: '#BBF7D0', label: '⬡ Verified'     },
  ai_assessed: { bg: '#FFFBEB', text: '#92400E', border: '#FDE68A', label: '◈ AI Assessed'  },
  mastered:    { bg: '#F0FDF4', text: '#166534', border: '#BBF7D0', label: '✓ Mastered'     },
  partial:     { bg: '#FFFBEB', text: '#92400E', border: '#FDE68A', label: '~ Partial'      },
  gap:         { bg: '#FEF2F2', text: '#991B1B', border: '#FECACA', label: '✗ Gap'          },
  unknown:     { bg: '#F9FAFB', text: '#6B7280', border: '#E5E7EB', label: '? Unknown'      },
  pass:        { bg: '#F0FDF4', text: '#166534', border: '#BBF7D0', label: 'PASS'           },
  fail:        { bg: '#FEF2F2', text: '#991B1B', border: '#FECACA', label: 'FAIL'           },
}

interface BadgeProps {
  kind: BadgeKind
  label?: string
}

export function Badge({ kind, label }: BadgeProps) {
  const s = BADGE_STYLE[kind]
  return (
    <span
      className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold border"
      style={{ background: s.bg, color: s.text, borderColor: s.border }}
    >
      {label ?? s.label}
    </span>
  )
}
