export type NavItem = 'dashboard' | 'courses' | 'lesson' | 'practice' | 'faculty'

const NAV: { id: NavItem; icon: string; label: string }[] = [
  { id: 'dashboard',  icon: '⊞',  label: 'Dashboard'  },
  { id: 'courses',    icon: '📚', label: 'My Courses'  },
  { id: 'lesson',     icon: '📖', label: 'Lesson'      },
  { id: 'practice',   icon: '⚡', label: 'Practice'    },
  { id: 'faculty',    icon: '🎓', label: 'Faculty'     },
]

interface SidebarProps {
  activeItem: NavItem
  onNavigate: (item: NavItem) => void
  canAccessLesson: boolean
}

export function Sidebar({ activeItem, onNavigate, canAccessLesson }: SidebarProps) {
  return (
    <div className="fixed left-0 top-0 h-screen w-[220px] bg-white border-r border-gray-100 flex flex-col z-20 shadow-[1px_0_8px_rgba(0,0,0,0.04)]">
      {/* Logo */}
      <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-3">
        <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
             style={{ background: 'var(--accent-blue)' }}>
          <span className="text-white font-black text-sm">B</span>
        </div>
        <span className="font-black text-[15px] tracking-tight" style={{ color: 'var(--ink)' }}>
          BigSper
        </span>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {NAV.map(item => {
          const locked = (item.id === 'lesson' || item.id === 'practice') && !canAccessLesson
          const active = activeItem === item.id
          return (
            <button
              key={item.id}
              onClick={() => !locked && onNavigate(item.id)}
              disabled={locked}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                active
                  ? 'text-white shadow-sm'
                  : locked
                  ? 'text-gray-300 cursor-not-allowed'
                  : 'hover:bg-gray-50'
              }`}
              style={active ? { background: 'var(--accent-blue)', color: '#fff' } : { color: locked ? undefined : 'var(--muted)' }}
            >
              <span className="text-[16px] leading-none">{item.icon}</span>
              <span>{item.label}</span>
              {locked && <span className="ml-auto text-[10px] text-gray-300">lock</span>}
            </button>
          )
        })}
      </nav>

      {/* Footer badge */}
      <div className="p-4 border-t border-gray-100">
        <div className="text-[10px] font-semibold uppercase tracking-widest text-gray-300 text-center">
          Adaptive · Verified · Grounded
        </div>
      </div>
    </div>
  )
}
