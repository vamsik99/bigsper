interface TopBarProps {
  title: string
  subtitle?: string
  authEnabled: boolean
  user: { name: string; role: string } | null
  role: 'student' | 'faculty'
  onSetRole: (r: 'student' | 'faculty') => void
}

export function TopBar({ title, subtitle, authEnabled, user, role, onSetRole }: TopBarProps) {
  const initials = user
    ? user.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
    : role === 'faculty' ? 'FA' : 'ST'

  return (
    <header className="h-14 bg-white border-b border-gray-100 flex items-center px-6 gap-4 shrink-0 z-10">
      {/* Page breadcrumb */}
      <div className="flex-1 min-w-0">
        <h1 className="text-sm font-bold leading-tight truncate" style={{ color: 'var(--ink)' }}>
          {title}
        </h1>
        {subtitle && (
          <p className="text-[11px] truncate" style={{ color: 'var(--muted)' }}>{subtitle}</p>
        )}
      </div>

      {/* Search pill */}
      <div className="hidden sm:flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-full px-4 py-1.5">
        <svg className="w-3.5 h-3.5 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z"/>
        </svg>
        <input
          type="text"
          placeholder="Search concepts…"
          readOnly
          className="bg-transparent text-xs outline-none w-36 placeholder-gray-400 cursor-default"
          style={{ color: 'var(--ink)' }}
        />
      </div>

      {/* Role toggle (no-auth mode) */}
      {!authEnabled && (
        <div className="flex items-center gap-1 bg-gray-100 rounded-full p-1 text-xs">
          {(['student', 'faculty'] as const).map(r => (
            <button
              key={r}
              onClick={() => onSetRole(r)}
              className={`px-3 py-1 rounded-full font-semibold capitalize transition ${
                role === r ? 'bg-white shadow-sm' : 'hover:text-gray-700'
              }`}
              style={{ color: role === r ? 'var(--ink)' : 'var(--muted)' }}
            >
              {r}
            </button>
          ))}
        </div>
      )}

      {/* Auth controls */}
      {authEnabled && user && (
        <div className="flex items-center gap-2">
          <span className="text-xs" style={{ color: 'var(--muted)' }}>{user.name}</span>
          <a
            href="/api/auth/logout"
            className="text-xs border border-gray-200 rounded-full px-3 py-1 hover:bg-gray-50 transition"
            style={{ color: 'var(--muted)' }}
          >
            Logout
          </a>
        </div>
      )}
      {authEnabled && !user && (
        <a
          href="/api/auth/login"
          className="text-xs text-white font-semibold px-4 py-1.5 rounded-full transition hover:opacity-90"
          style={{ background: 'var(--accent-blue)' }}
        >
          Faculty Login
        </a>
      )}

      {/* Avatar */}
      <div
        className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-white text-[11px] font-black"
        style={{ background: 'linear-gradient(135deg, var(--accent-blue), var(--accent-coral))' }}
      >
        {initials}
      </div>
    </header>
  )
}
