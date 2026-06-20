import { useState, useEffect, useCallback, useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { Sidebar, type NavItem } from './components/Sidebar'
import { TopBar } from './components/TopBar'
import { AccentCard, Pill, ListRow, Badge } from './components/ui'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AppView = 'idle' | 'graph'

interface QuestionData {
  stem: string
  options: string[]
  correct_index: number
  concept_id: string
  explanation: string
}

interface GraphNode {
  id: string
  label: string
  description: string
  difficulty: number
}

interface GraphEdge {
  from: string
  to: string
}

interface GraphData {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

interface Source {
  text: string
  concept_id: string
  chunk_idx: number
}

interface LessonData {
  concept_id: string
  lesson: string
  sources: Source[]
  profile: Profile
  no_corpus: boolean
}

interface Profile {
  depth: string
  example_domain: string
  format: string
}

interface TaskData {
  task_id: string
  prompt: string
  concept_id: string
  context: string
}

interface BadgeData {
  label: string
  color: string
  icon: string
}

interface VerifyResult {
  passed: boolean
  score: number
  badge: BadgeData
  signals: string
  evidence: { expected_rows: unknown[][]; actual_rows: unknown[][] }
  narrative: string
  error?: string
}

interface ScorecardData {
  concept_id: string
  diagnostic: {
    score: number | null
    tier: 'mastered' | 'partial' | 'gap' | 'unknown'
    label: string
  }
  prove_it: VerifyResult
}

interface AuthUser {
  user_id: string
  email: string
  name: string
  role: 'student' | 'faculty'
}

interface AuthStatus {
  auth_enabled: boolean
  user: AuthUser | null
}

// ---------------------------------------------------------------------------
// Pre-computed node positions for the SQL concept graph (SVG layout)
// Nodes: 120w × 36h  SVG: 660w × 520h
// ---------------------------------------------------------------------------

const NODE_POS: Record<string, { x: number; y: number }> = {
  data_types:      { x: 55,  y: 30  },
  select_basics:   { x: 195, y: 30  },
  filtering:       { x: 335, y: 30  },
  sorting:         { x: 475, y: 30  },
  aggregation:     { x: 55,  y: 120 },
  grouping:        { x: 195, y: 120 },
  inner_join:      { x: 335, y: 120 },
  dml:             { x: 475, y: 120 },
  outer_join:      { x: 5,   y: 210 },
  self_join:       { x: 135, y: 210 },
  subqueries:      { x: 265, y: 210 },
  set_ops:         { x: 395, y: 210 },
  schema_design:   { x: 525, y: 210 },
  cte:             { x: 55,  y: 310 },
  window_basics:   { x: 195, y: 310 },
  normalization:   { x: 335, y: 310 },
  indexes:         { x: 475, y: 310 },
  window_advanced: { x: 195, y: 410 },
  transactions:    { x: 335, y: 410 },
}

const NODE_W = 120
const NODE_H = 36

// Light-theme mastery colours for SVG nodes
function masteryFill(score: number | undefined): string {
  if (score === undefined) return '#F9FAFB'   // gray-50
  if (score >= 0.9)        return '#DCFCE7'   // green-100
  if (score >= 0.25)       return '#FEF3C7'   // amber-100
  return '#FEE2E2'                            // red-100
}

function masteryStroke(score: number | undefined): string {
  if (score === undefined) return '#D1D5DB'   // gray-300
  if (score >= 0.9)        return '#16A34A'   // green-600
  if (score >= 0.25)       return '#D97706'   // amber-600
  return '#DC2626'                            // red-600
}

function masteryTextFill(score: number | undefined): string {
  if (score === undefined) return '#6B7280'   // gray-500
  if (score >= 0.9)        return '#166534'   // green-800
  if (score >= 0.25)       return '#92400E'   // amber-800
  return '#991B1B'                            // red-800
}

function masteryLabel(score: number | undefined): string {
  if (score === undefined) return ''
  if (score >= 0.9)        return '✓'
  if (score >= 0.25)       return '~'
  return '✗'
}

// ---------------------------------------------------------------------------
// Markdown renderer — light theme
// ---------------------------------------------------------------------------

function renderMarkdown(text: string): React.ReactNode[] {
  const blocks = text.split(/\n\n+/)
  return blocks.map((block, bi) => {
    if (block.startsWith('```')) {
      const lines = block.split('\n')
      const lang = lines[0].replace('```', '').trim()
      const code = lines.slice(1).filter(l => l !== '```').join('\n')
      return (
        <pre key={bi} className="bg-slate-50 border border-slate-200 rounded-xl p-3 overflow-x-auto text-xs text-green-800 my-2">
          {lang && <div className="text-slate-400 text-xs mb-1">{lang}</div>}
          <code>{code}</code>
        </pre>
      )
    }
    if (block.startsWith('## ')) {
      return <h3 key={bi} className="text-sm font-bold text-blue-700 mt-3 mb-1">{block.slice(3)}</h3>
    }
    if (block.includes('|')) {
      const rows = block.split('\n').filter(r => r.trim() && !r.match(/^\|[-| ]+\|$/))
      return (
        <table key={bi} className="text-xs w-full border-collapse my-2">
          <tbody>
            {rows.map((row, ri) => (
              <tr key={ri} className={ri === 0 ? 'border-b border-gray-200' : ''}>
                {row.split('|').filter(c => c.trim()).map((cell, ci) => (
                  <td key={ci} className={`py-0.5 px-1.5 ${ri === 0 ? 'text-gray-500 font-medium' : 'text-gray-700'}`}>
                    {cell.trim()}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )
    }
    return <p key={bi} className="text-sm text-gray-700 leading-relaxed my-1">{inlineMarkdown(block)}</p>
  })
}

function inlineMarkdown(text: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g)
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} className="text-gray-900 font-semibold">{part.slice(2, -2)}</strong>
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return <code key={i} className="bg-gray-100 text-green-800 px-1 rounded text-xs font-mono">{part.slice(1, -1)}</code>
    }
    return part
  })
}

function stripMarkdownForTTS(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/##\s*/g, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\|[^\n]+\|/g, '')
    .replace(/\n+/g, '. ')
    .replace(/\s+/g, ' ')
    .trim()
}

function computeNodePositions(nodes: GraphNode[]): Record<string, { x: number; y: number }> {
  const byDiff: Record<number, GraphNode[]> = {}
  for (const n of nodes) {
    const d = n.difficulty ?? 1
    if (!byDiff[d]) byDiff[d] = []
    byDiff[d].push(n)
  }
  const positions: Record<string, { x: number; y: number }> = {}
  const tiers = Object.keys(byDiff).map(Number).sort()
  tiers.forEach((tier, ti) => {
    const row = byDiff[tier]
    const y = 30 + ti * 90
    const gapX = 660 / (row.length + 1)
    row.forEach((node, ni) => {
      positions[node.id] = { x: Math.round(gapX * (ni + 1)) - NODE_W / 2, y }
    })
  })
  return positions
}

// ---------------------------------------------------------------------------
// Diagnostic view
// ---------------------------------------------------------------------------

function DiagnosticView({ onComplete }: { onComplete: (mastery: Record<string, number>) => void }) {
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [question, setQuestion] = useState<QuestionData | null>(null)
  const [qNumber, setQNumber] = useState(1)
  const [selected, setSelected] = useState<number | null>(null)
  const [grade, setGrade] = useState<{ correct: boolean; rationale: string } | null>(null)
  const [loading, setLoading] = useState(false)
  const [started, setStarted] = useState(false)

  const startDiagnostic = useCallback(async () => {
    setLoading(true)
    setStarted(true)
    try {
      const res = await fetch('/api/diagnostic/start', { method: 'POST' })
      const data = await res.json()
      setSessionId(data.session_id)
      setQuestion(data.question)
      setQNumber(data.question_number)
    } finally {
      setLoading(false)
    }
  }, [])

  const submitAnswer = useCallback(
    async (idx: number) => {
      if (!sessionId || !question || grade) return
      setSelected(idx)
      setLoading(true)
      try {
        const res = await fetch('/api/diagnostic/answer', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_id: sessionId, answer_index: idx }),
        })
        const data = await res.json()
        setGrade(data.grade)
        if (data.done) {
          setTimeout(() => onComplete(data.mastery), 1200)
        } else {
          setTimeout(() => {
            setQuestion(data.question)
            setQNumber(n => n + 1)
            setSelected(null)
            setGrade(null)
          }, 1400)
        }
      } finally {
        setLoading(false)
      }
    },
    [sessionId, question, grade, onComplete],
  )

  if (!started) {
    return (
      <div className="flex flex-col items-center gap-6 pt-2">
        <div className="text-center space-y-2 max-w-sm">
          <h2 className="text-xl font-black" style={{ color: 'var(--ink)' }}>Ready to find your gaps?</h2>
          <p className="text-sm leading-relaxed" style={{ color: 'var(--muted)' }}>
            4–6 adaptive questions will map your SQL knowledge. Click any red node to learn, then prove mastery with a verified SQL exercise.
          </p>
        </div>
        <button
          onClick={startDiagnostic}
          disabled={loading}
          className="px-8 py-3 text-white font-bold rounded-2xl transition disabled:opacity-50 text-sm shadow-md hover:opacity-90"
          style={{ background: 'var(--accent-blue)' }}
        >
          {loading ? 'Starting…' : 'Start Diagnostic →'}
        </button>
      </div>
    )
  }

  if (!question) {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="text-sm animate-pulse" style={{ color: 'var(--muted)' }}>Loading question…</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-5 w-full">
      <div className="w-full flex justify-between text-xs" style={{ color: 'var(--muted)' }}>
        <span>Question {qNumber}</span>
        <span>{question.concept_id.replace(/_/g, ' ')}</span>
      </div>

      <div className="w-full bg-white border border-gray-200 rounded-2xl p-6 space-y-4 shadow-card">
        <p className="text-sm font-semibold leading-relaxed" style={{ color: 'var(--ink)' }}>
          {question.stem}
        </p>

        <div className="space-y-2">
          {question.options.map((opt, i) => {
            const isSelected = selected === i
            const isCorrect  = grade && i === question.correct_index
            const isWrong    = grade && isSelected && !grade.correct

            let cls = 'w-full text-left px-4 py-2.5 rounded-xl border text-sm transition font-medium '
            if (isCorrect)      cls += 'bg-green-50 border-green-400 text-green-800'
            else if (isWrong)   cls += 'bg-red-50 border-red-400 text-red-800'
            else if (isSelected) cls += 'bg-blue-50 border-blue-400 text-blue-800'
            else                cls += 'bg-white border-gray-200 text-gray-700 hover:border-gray-300 hover:bg-gray-50'

            return (
              <button key={i} className={cls} onClick={() => submitAnswer(i)} disabled={!!grade || loading}>
                <span className="text-gray-400 mr-2 font-normal">{String.fromCharCode(65 + i)}.</span>
                {opt}
              </button>
            )
          })}
        </div>

        {grade && (
          <div className={`rounded-xl p-3 text-sm border ${
            grade.correct
              ? 'bg-green-50 text-green-800 border-green-200'
              : 'bg-red-50 text-red-800 border-red-200'
          }`}>
            {grade.rationale}
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Concept graph SVG
// ---------------------------------------------------------------------------

function ConceptGraph({
  graphData, mastery, selectedId, onSelect,
}: {
  graphData: GraphData
  mastery: Record<string, number>
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  const effectivePos = useMemo(() => {
    const computed = computeNodePositions(graphData.nodes)
    const result: Record<string, { x: number; y: number }> = {}
    for (const n of graphData.nodes) {
      result[n.id] = NODE_POS[n.id] ?? computed[n.id]
    }
    return result
  }, [graphData.nodes])

  const getCenter = (id: string) => {
    const p = effectivePos[id] ?? { x: 0, y: 0 }
    return { cx: p.x + NODE_W / 2, cy: p.y + NODE_H / 2 }
  }

  const maxY = Math.max(...Object.values(effectivePos).map(p => p.y), 30)
  const svgH = maxY + NODE_H + 60

  return (
    <div className="overflow-auto rounded-2xl border border-gray-200 bg-white shadow-card p-4">
      <div className="text-xs mb-3 px-1 font-medium" style={{ color: 'var(--muted)' }}>
        Gap heatmap — red nodes are your weakest concepts. Click any to start learning.
      </div>
      <svg width={660} height={svgH} className="select-none">
        <defs>
          <marker id="arrow" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
            <polygon points="0 0, 8 3, 0 6" fill="#9CA3AF" />
          </marker>
        </defs>

        {/* Edges */}
        {graphData.edges.map((edge, i) => {
          const s = getCenter(edge.from)
          const t = getCenter(edge.to)
          const dy = t.cy - s.cy
          const cpOffset = Math.abs(dy) * 0.4
          const d = `M${s.cx},${s.cy + NODE_H / 2} C${s.cx},${s.cy + NODE_H / 2 + cpOffset} ${t.cx},${t.cy - cpOffset} ${t.cx},${t.cy - NODE_H / 2 - 4}`
          return (
            <path key={i} d={d} fill="none" stroke="#E5E7EB" strokeWidth={1.5} markerEnd="url(#arrow)" />
          )
        })}

        {/* Nodes */}
        {graphData.nodes.map(node => {
          const pos = effectivePos[node.id]
          if (!pos) return null
          const score    = mastery[node.id]
          const isSelected = selectedId === node.id
          const fill   = masteryFill(score)
          const stroke = masteryStroke(score)
          const tFill  = masteryTextFill(score)
          const badge  = masteryLabel(score)

          return (
            <g
              key={node.id}
              transform={`translate(${pos.x},${pos.y})`}
              className="cursor-pointer"
              onClick={() => onSelect(node.id)}
            >
              <rect
                width={NODE_W}
                height={NODE_H}
                rx={8}
                fill={fill}
                stroke={isSelected ? 'var(--accent-blue)' : stroke}
                strokeWidth={isSelected ? 2 : 1}
              />
              <text
                x={NODE_W / 2}
                y={NODE_H / 2 + 1}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={10}
                fill={isSelected ? 'var(--accent-blue)' : tFill}
                fontFamily="ui-sans-serif, system-ui, sans-serif"
                fontWeight={isSelected ? '700' : '600'}
              >
                {node.label.length > 18 ? node.label.slice(0, 17) + '…' : node.label}
              </text>
              {badge && (
                <text x={NODE_W - 6} y={6} textAnchor="end" fontSize={9} fill={stroke} fontFamily="sans-serif">
                  {badge}
                </text>
              )}
            </g>
          )
        })}
      </svg>

      {/* Legend */}
      <div className="flex gap-5 mt-3 px-1 text-xs" style={{ color: 'var(--muted)' }}>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-green-100 border border-green-500 inline-block"/>mastered
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-amber-100 border border-amber-500 inline-block"/>partial
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-red-100 border border-red-500 inline-block"/>gap
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-gray-100 border border-gray-300 inline-block"/>not assessed
        </span>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Scorecard display
// ---------------------------------------------------------------------------

function ScorecardDisplay({ data, conceptLabel, onReset }: {
  data: ScorecardData
  conceptLabel: string
  onReset: () => void
}) {
  const { diagnostic, prove_it: pt } = data

  const diagBadgeKind = diagnostic.tier as 'mastered' | 'partial' | 'gap' | 'unknown'

  const ptBadgeKind = pt.passed
    ? (pt.badge.label === 'Verified' ? 'verified' : 'pass')
    : 'fail'

  const diagBg: Record<string, string> = {
    mastered: 'bg-green-50 border-green-200',
    partial:  'bg-amber-50 border-amber-200',
    gap:      'bg-red-50 border-red-200',
    unknown:  'bg-gray-50 border-gray-200',
  }
  const diagText: Record<string, string> = {
    mastered: 'text-green-800',
    partial:  'text-amber-800',
    gap:      'text-red-800',
    unknown:  'text-gray-600',
  }
  const diagIcon: Record<string, string> = {
    mastered: '✓', partial: '~', gap: '✗', unknown: '?',
  }

  return (
    <div className="flex flex-col gap-4 p-5">
      {/* Heading */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-widest mb-0.5" style={{ color: 'var(--muted)' }}>Scorecard</div>
          <div className="text-sm font-bold" style={{ color: 'var(--ink)' }}>{conceptLabel}</div>
        </div>
        <Badge kind={pt.passed ? 'pass' : 'fail'} />
      </div>

      {/* Side-by-side */}
      <div className="grid grid-cols-2 gap-3">
        <div className={`rounded-2xl border p-4 flex flex-col gap-1 ${diagBg[diagnostic.tier]}`}>
          <div className="text-[10px] font-bold uppercase tracking-widest opacity-60">Before lesson</div>
          <div className={`text-2xl font-black ${diagText[diagnostic.tier]}`}>{diagIcon[diagnostic.tier]}</div>
          <div className={`text-sm font-bold capitalize ${diagText[diagnostic.tier]}`}>{diagnostic.label}</div>
          {diagnostic.score !== null && (
            <div className="text-xs opacity-60">Diagnostic: {Math.round(diagnostic.score * 100)}%</div>
          )}
          <div className="mt-1"><Badge kind={diagBadgeKind} /></div>
        </div>

        <div className={`rounded-2xl border p-4 flex flex-col gap-1 ${pt.passed ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
          <div className="text-[10px] font-bold uppercase tracking-widest opacity-60">After lesson</div>
          <div className="text-2xl font-black">{pt.passed ? '✅' : '❌'}</div>
          <div className={`text-sm font-bold ${pt.passed ? 'text-green-800' : 'text-red-800'}`}>{pt.badge.label}</div>
          <div className="text-xs opacity-60">Score: {Math.round(pt.score * 100)}%</div>
          <div className="mt-1"><Badge kind={ptBadgeKind} /></div>
        </div>
      </div>

      {/* SQL error */}
      {pt.error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-700 font-mono">
          {pt.error}
        </div>
      )}

      {/* Result diff */}
      {!pt.error && (pt.evidence.expected_rows.length > 0 || pt.evidence.actual_rows.length > 0) && (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <div className="text-xs font-medium mb-1" style={{ color: 'var(--muted)' }}>
              Expected ({pt.evidence.expected_rows.length} rows)
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-2 text-xs font-mono max-h-28 overflow-y-auto space-y-0.5">
              {pt.evidence.expected_rows.slice(0, 15).map((row, i) => (
                <div key={i} className="text-green-700">{JSON.stringify(row)}</div>
              ))}
              {pt.evidence.expected_rows.length > 15 && (
                <div className="text-gray-400">…{pt.evidence.expected_rows.length - 15} more</div>
              )}
            </div>
          </div>
          <div>
            <div className="text-xs font-medium mb-1" style={{ color: 'var(--muted)' }}>
              Your output ({pt.evidence.actual_rows.length} rows)
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-2 text-xs font-mono max-h-28 overflow-y-auto space-y-0.5">
              {pt.evidence.actual_rows.slice(0, 15).map((row, i) => (
                <div key={i} className={pt.passed ? 'text-green-700' : 'text-red-600'}>
                  {JSON.stringify(row)}
                </div>
              ))}
              {pt.evidence.actual_rows.length > 15 && (
                <div className="text-gray-400">…{pt.evidence.actual_rows.length - 15} more</div>
              )}
              {pt.evidence.actual_rows.length === 0 && !pt.error && (
                <div className="text-gray-400 italic">no rows returned</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Coach narrative */}
      {pt.narrative && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-card">
          <div className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--muted)' }}>Coach</div>
          <p className="text-sm leading-relaxed text-gray-700">{pt.narrative}</p>
        </div>
      )}

      <button
        onClick={onReset}
        className="text-xs underline self-start transition hover:opacity-70"
        style={{ color: 'var(--muted)' }}
      >
        Try again
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Prove It panel
// ---------------------------------------------------------------------------

function ProveItPanel({ conceptId, conceptLabel, mastery, onScorecard }: {
  conceptId: string
  conceptLabel: string
  mastery: Record<string, number>
  onScorecard?: (conceptId: string, score: number) => void
}) {
  const [task, setTask]               = useState<TaskData | null>(null)
  const [taskLoading, setTaskLoading] = useState(false)
  const [taskError, setTaskError]     = useState<string | null>(null)
  const [sql, setSql]                 = useState('')
  const [running, setRunning]         = useState(false)
  const [scorecard, setScorecard]     = useState<ScorecardData | null>(null)

  useEffect(() => {
    setTask(null); setScorecard(null); setSql(''); setTaskError(null); setTaskLoading(true)
    fetch('/api/task/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ weak_concepts: [conceptId] }),
    })
      .then(r => r.json())
      .then((data: TaskData) => setTask(data))
      .catch(e => setTaskError(String(e)))
      .finally(() => setTaskLoading(false))
  }, [conceptId])

  const runQuery = useCallback(async () => {
    if (!task || !sql.trim()) return
    setRunning(true); setScorecard(null)
    try {
      const res = await fetch('/api/scorecard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task_id: task.task_id, submission: sql, concept_id: conceptId, mastery }),
      })
      const data: ScorecardData = await res.json()
      setScorecard(data)
      if (data.prove_it.passed) onScorecard?.(conceptId, data.prove_it.score)
    } finally {
      setRunning(false)
    }
  }, [task, sql, conceptId, mastery, onScorecard])

  const reset = useCallback(() => { setScorecard(null); setSql('') }, [])

  if (taskLoading) {
    return (
      <div className="flex flex-col gap-3 p-5 mt-4">
        <div className="h-3 bg-gray-100 rounded-full animate-pulse w-3/4" />
        <div className="h-3 bg-gray-100 rounded-full animate-pulse w-full" />
        <div className="h-3 bg-gray-100 rounded-full animate-pulse w-2/3" />
        <div className="text-xs animate-pulse mt-2" style={{ color: 'var(--muted)' }}>Generating exercise…</div>
      </div>
    )
  }

  if (taskError || !task) {
    return <div className="p-5 text-xs text-red-600">{taskError ?? 'Failed to generate task.'}</div>
  }

  if (scorecard) {
    return (
      <div className="overflow-y-auto h-full">
        <ScorecardDisplay data={scorecard} conceptLabel={conceptLabel} onReset={reset} />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 p-5 overflow-y-auto h-full">
      {/* Exercise */}
      <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-card">
        <div className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--muted)' }}>Exercise</div>
        <p className="text-sm leading-relaxed" style={{ color: 'var(--ink)' }}>{task.prompt}</p>
        {task.context && (
          <details className="mt-3 group">
            <summary className="cursor-pointer text-xs font-medium select-none hover:opacity-70"
                     style={{ color: 'var(--muted)' }}>
              ▶ Schema reference
            </summary>
            <pre className="mt-2 text-xs text-gray-600 bg-slate-50 border border-slate-200 rounded-xl p-3 overflow-x-auto whitespace-pre-wrap">
              {task.context}
            </pre>
          </details>
        )}
      </div>

      {/* Answer */}
      <div className="flex flex-col gap-2">
        <label className="text-xs font-semibold" style={{ color: 'var(--muted)' }}>Your answer</label>
        <textarea
          value={sql}
          onChange={e => setSql(e.target.value)}
          placeholder="Type your SQL here…"
          rows={5}
          className="w-full bg-slate-50 border border-gray-200 rounded-xl p-3 text-sm text-green-800 font-mono resize-y
                     focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 placeholder-gray-300 transition"
        />
        <button
          onClick={runQuery}
          disabled={running || !sql.trim()}
          className="self-end px-5 py-2 text-white text-sm font-bold rounded-xl transition disabled:opacity-40 hover:opacity-90 shadow-sm"
          style={{ background: 'var(--accent-blue)' }}
        >
          {running ? 'Running…' : 'Run →'}
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Lesson panel
// ---------------------------------------------------------------------------

const PROFILE_OPTIONS = {
  depth:          ['simpler', 'standard', 'deeper'],
  example_domain: ['ecommerce', 'sports', 'finance'],
  format:         ['worked_example', 'analogy', 'step_by_step'],
}

const PROFILE_LABELS: Record<string, Record<string, string>> = {
  depth:          { simpler: 'Simpler', standard: 'Standard', deeper: 'Deep dive' },
  example_domain: { ecommerce: 'E-commerce', sports: 'Sports', finance: 'Finance' },
  format:         { worked_example: 'Worked eg.', analogy: 'Analogy', step_by_step: 'Step-by-step' },
}

function LessonPanel({ conceptId, nodeLabel, difficulty, mastery, onScorecard }: {
  conceptId: string
  nodeLabel: string
  difficulty: number
  mastery: Record<string, number>
  onScorecard?: (conceptId: string, score: number) => void
}) {
  const [activeTab, setActiveTab]           = useState<'lesson' | 'prove'>('lesson')
  const [profile, setProfile]               = useState<Profile>({ depth: 'standard', example_domain: 'ecommerce', format: 'worked_example' })
  const [lesson, setLesson]                 = useState<LessonData | null>(null)
  const [loading, setLoading]               = useState(false)
  const [rerenderLoading, setRerenderLoading] = useState(false)
  const [rerenderFlash, setRerenderFlash]   = useState(false)
  const [speaking, setSpeaking]             = useState(false)
  const ttsAvailable = typeof window !== 'undefined' && 'speechSynthesis' in window

  useEffect(() => {
    setLesson(null); setLoading(true); setRerenderFlash(false)
    if (ttsAvailable) window.speechSynthesis.cancel()
    setSpeaking(false)
    fetch('/api/lesson', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ concept_id: conceptId, profile }),
    })
      .then(r => r.json())
      .then(data => setLesson(data))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conceptId])

  useEffect(() => {
    if (ttsAvailable) window.speechSynthesis.cancel()
    setSpeaking(false)
  }, [activeTab, ttsAvailable])

  const rerender = useCallback((newProfile: Profile) => {
    if (!lesson) return
    setRerenderLoading(true); setRerenderFlash(false)
    if (ttsAvailable) window.speechSynthesis.cancel()
    setSpeaking(false)
    fetch('/api/lesson/rerender', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ concept_id: conceptId, profile: newProfile, sources: lesson.sources }),
    })
      .then(r => r.json())
      .then(data => { setLesson(data); setRerenderFlash(true); setTimeout(() => setRerenderFlash(false), 2000) })
      .finally(() => setRerenderLoading(false))
  }, [lesson, conceptId, ttsAvailable])

  const updateProfile = useCallback((key: keyof Profile, value: string) => {
    const next = { ...profile, [key]: value }
    setProfile(next); rerender(next)
  }, [profile, rerender])

  const handleTTS = useCallback(() => {
    if (!lesson || !ttsAvailable) return
    if (speaking) { window.speechSynthesis.cancel(); setSpeaking(false); return }
    const text = stripMarkdownForTTS(lesson.lesson)
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.rate = 0.92
    utterance.onend  = () => setSpeaking(false)
    utterance.onerror = () => setSpeaking(false)
    const speak = () => {
      const voices = window.speechSynthesis.getVoices()
      const tamilVoice = voices.find(v => v.lang.startsWith('ta'))
      if (tamilVoice) { utterance.voice = tamilVoice; utterance.lang = 'ta-IN' }
      setSpeaking(true)
      window.speechSynthesis.speak(utterance)
    }
    if (window.speechSynthesis.getVoices().length === 0) {
      window.speechSynthesis.addEventListener('voiceschanged', speak, { once: true })
    } else {
      speak()
    }
  }, [lesson, speaking, ttsAvailable])

  const diffStars = '★'.repeat(difficulty) + '☆'.repeat(5 - difficulty)

  const conceptScore = mastery[conceptId]
  const masteryTier =
    conceptScore === undefined ? null
    : conceptScore >= 0.9      ? { text: 'mastered', cls: 'text-green-600' }
    : conceptScore >= 0.25     ? { text: 'partial',  cls: 'text-amber-600' }
    :                            { text: 'gap',       cls: 'text-red-600'   }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Panel header */}
      <div className="px-5 pt-5 pb-3 border-b border-gray-100">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-sm font-black" style={{ color: 'var(--ink)' }}>{nodeLabel}</h2>
            {masteryTier && (
              <span className={`text-xs font-semibold ${masteryTier.cls}`}>
                {masteryTier.text} in diagnostic
              </span>
            )}
          </div>
          <span className="text-amber-500 text-xs mt-0.5 shrink-0">{diffStars}</span>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mt-3 p-1 bg-gray-100 rounded-xl w-fit">
          {(['lesson', 'prove'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-1.5 text-xs font-semibold rounded-lg transition ${
                activeTab === tab ? 'bg-white shadow-sm' : 'hover:text-gray-700'
              }`}
              style={{ color: activeTab === tab ? 'var(--ink)' : 'var(--muted)' }}
            >
              {tab === 'lesson' ? 'Lesson' : 'Prove It ✓'}
            </button>
          ))}
        </div>

        {/* Profile pills */}
        {activeTab === 'lesson' && (
          <div className="mt-3 space-y-2">
            {(Object.keys(PROFILE_OPTIONS) as Array<keyof typeof PROFILE_OPTIONS>).map(key => (
              <div key={key} className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wide w-12 shrink-0" style={{ color: 'var(--muted)' }}>
                  {key === 'example_domain' ? 'domain' : key}
                </span>
                <div className="flex gap-1 flex-wrap">
                  {PROFILE_OPTIONS[key].map(opt => (
                    <Pill
                      key={opt}
                      label={PROFILE_LABELS[key]?.[opt] ?? opt}
                      active={profile[key as keyof Profile] === opt}
                      onClick={() => updateProfile(key as keyof Profile, opt)}
                      disabled={loading || !lesson || rerenderLoading}
                    />
                  ))}
                </div>
              </div>
            ))}

            <div className="flex items-center gap-2 pt-0.5">
              {rerenderLoading && (
                <span className="flex items-center gap-1.5 text-xs font-medium" style={{ color: 'var(--accent-blue)' }}>
                  <span className="w-1.5 h-1.5 rounded-full inline-block animate-ping" style={{ background: 'var(--accent-blue)' }} />
                  Adapting…
                </span>
              )}
              {rerenderFlash && !rerenderLoading && (
                <span className="text-xs font-semibold text-green-600">✓ Adapted</span>
              )}
              {ttsAvailable && lesson && !loading && (
                <button
                  onClick={handleTTS}
                  title={speaking ? 'Stop reading' : 'Read aloud (Tamil voice if available)'}
                  className={`ml-auto flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition ${
                    speaking ? 'text-white animate-pulse' : 'bg-gray-100 hover:bg-gray-200'
                  }`}
                  style={speaking ? { background: 'var(--accent-blue)', color: '#fff' } : { color: 'var(--muted)' }}
                >
                  {speaking ? '⏹ Stop' : '🔊 Read'}
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Tab content */}
      {activeTab === 'prove' ? (
        <div className="flex-1 overflow-y-auto">
          <ProveItPanel
            key={conceptId}
            conceptId={conceptId}
            conceptLabel={nodeLabel}
            mastery={mastery}
            onScorecard={onScorecard}
          />
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-1">
          {loading && (
            <div className="flex flex-col gap-2 mt-4">
              <div className="h-3 bg-gray-100 rounded-full animate-pulse w-3/4" />
              <div className="h-3 bg-gray-100 rounded-full animate-pulse w-full" />
              <div className="h-3 bg-gray-100 rounded-full animate-pulse w-5/6" />
              <div className="h-3 bg-gray-100 rounded-full animate-pulse w-2/3 mt-2" />
            </div>
          )}
          {lesson && !loading && (
            <>
              {lesson.no_corpus && (
                <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-3 mb-3">
                  ⚠ No corpus content indexed for this concept.
                </div>
              )}
              <div className={`lesson-body transition-all duration-300 ${rerenderLoading ? 'opacity-30 blur-[1px]' : 'opacity-100 blur-0'}`}>
                {renderMarkdown(lesson.lesson)}
              </div>
              {lesson.sources.length > 0 && (
                <details className="mt-5 group" open={false}>
                  <summary className="cursor-pointer text-xs font-semibold select-none flex items-center gap-1 hover:opacity-70"
                           style={{ color: 'var(--muted)' }}>
                    <span className="group-open:rotate-90 transition-transform inline-block">▶</span>
                    &nbsp;Sources ({lesson.sources.length} corpus chunk{lesson.sources.length !== 1 ? 's' : ''})
                  </summary>
                  <div className="mt-2 space-y-2">
                    {lesson.sources.map((src, i) => (
                      <div key={i} className="bg-white border border-gray-200 rounded-xl p-3 text-xs shadow-card">
                        <div className="font-semibold mb-1" style={{ color: 'var(--muted)' }}>
                          chunk {src.chunk_idx} · {src.concept_id.replace(/_/g, ' ')}
                        </div>
                        <p className="line-clamp-4 leading-relaxed text-gray-600">
                          {src.text.length > 400 ? src.text.slice(0, 400) + '…' : src.text}
                        </p>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Faculty types
// ---------------------------------------------------------------------------

interface ConceptHeatmapRow {
  concept_id: string
  concept_label: string
  mastered: number
  partial: number
  gap: number
  unknown: number
  avg_score: number | null
}

interface StudentReport {
  id: string
  name: string
  readiness_score: number
  prove_it_score: number | null
  prove_it_passed: boolean | null
  prove_it_badge: string | null
  prove_it_concept: string | null
}

interface FacultyReport {
  class_heatmap: ConceptHeatmapRow[]
  placement_ready_count: number
  total_students: number
  weakest_concepts: ConceptHeatmapRow[]
  students: StudentReport[]
  readiness_threshold: number
}

type SortCol = 'name' | 'readiness' | 'prove_it'

// ---------------------------------------------------------------------------
// Faculty Dashboard
// ---------------------------------------------------------------------------

function FacultyDashboard() {
  const [report, setReport]       = useState<FacultyReport | null>(null)
  const [loading, setLoading]     = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [sortCol, setSortCol]     = useState<SortCol>('readiness')
  const [sortDir, setSortDir]     = useState<'asc' | 'desc'>('desc')

  useEffect(() => {
    fetch('/api/faculty/report', { method: 'POST' })
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
      .then(setReport)
      .catch(e => setFetchError(String(e)))
      .finally(() => setLoading(false))
  }, [])

  const sortedStudents = useMemo(() => {
    if (!report) return []
    return [...report.students].sort((a, b) => {
      let cmp = 0
      if (sortCol === 'name')       cmp = a.name.localeCompare(b.name)
      else if (sortCol === 'readiness') cmp = a.readiness_score - b.readiness_score
      else                          cmp = (a.prove_it_score ?? -1) - (b.prove_it_score ?? -1)
      return sortDir === 'desc' ? -cmp : cmp
    })
  }, [report, sortCol, sortDir])

  const toggleSort = (col: SortCol) => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('desc') }
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-sm animate-pulse" style={{ color: 'var(--muted)' }}>Loading cohort report…</p>
      </div>
    )
  }

  if (fetchError || !report) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-sm text-red-600">{fetchError ?? 'Failed to load report.'}</p>
      </div>
    )
  }

  const heatmapData = report.class_heatmap.map(row => ({
    name: row.concept_label.length > 14 ? row.concept_label.slice(0, 13) + '…' : row.concept_label,
    mastered: row.mastered,
    partial: row.partial,
    gap: row.gap,
    unknown: row.unknown,
  }))

  const passRate = report.total_students > 0
    ? Math.round(report.placement_ready_count / report.total_students * 100)
    : 0

  const sortArrow = (col: SortCol) => sortCol === col ? (sortDir === 'desc' ? ' ↓' : ' ↑') : ''

  const weakestLabel = report.weakest_concepts[0]?.concept_label ?? '—'
  const weakestSub   = report.weakest_concepts[0]
    ? `${report.weakest_concepts[0].gap} gaps`
    : ''

  return (
    <div className="flex-1 overflow-auto p-6 space-y-5">
      {/* Stat cards */}
      <div className="grid grid-cols-3 gap-4">
        <AccentCard
          accent="coral"
          icon="🎓"
          title={`${report.placement_ready_count} / ${report.total_students}`}
          body={`students placement-ready · ≥${Math.round(report.readiness_threshold * 100)}% avg mastery`}
        />
        <AccentCard
          accent="blue"
          icon="📊"
          title={`${passRate}%`}
          body="class pass rate on placement-readiness threshold"
        />
        <AccentCard
          accent="ink"
          icon="⚠"
          title={weakestLabel}
          body={weakestSub || 'No gaps identified'}
        />
      </div>

      {/* Cohort heatmap */}
      <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-card">
        <h3 className="text-sm font-black mb-0.5" style={{ color: 'var(--ink)' }}>Cohort Mastery by Concept</h3>
        <p className="text-xs mb-4" style={{ color: 'var(--muted)' }}>
          How many students are mastered / partial / gap on each SQL concept
        </p>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={heatmapData} margin={{ top: 4, right: 8, left: 0, bottom: 72 }}>
            <XAxis
              dataKey="name"
              tick={{ fontSize: 9, fill: '#9CA3AF' }}
              angle={-45}
              textAnchor="end"
              interval={0}
            />
            <YAxis tick={{ fontSize: 10, fill: '#9CA3AF' }} allowDecimals={false} />
            <Tooltip
              contentStyle={{
                backgroundColor: '#FFFFFF',
                border: '1px solid #E5E7EB',
                borderRadius: 12,
                fontSize: 12,
                boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
              }}
              labelStyle={{ color: '#111827', fontWeight: 700 }}
            />
            <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
            <Bar dataKey="mastered" stackId="a" fill="#16A34A" name="Mastered" />
            <Bar dataKey="partial"  stackId="a" fill="#D97706" name="Partial" />
            <Bar dataKey="gap"      stackId="a" fill="#DC2626" name="Gap" />
            <Bar dataKey="unknown"  stackId="a" fill="#D1D5DB" name="Not assessed" radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Bottom row */}
      <div className="grid grid-cols-3 gap-4">
        {/* Weakest concepts */}
        <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-card">
          <h3 className="text-sm font-black mb-4" style={{ color: 'var(--ink)' }}>Top Class-Wide Gaps</h3>
          <div className="space-y-3">
            {report.weakest_concepts.map((c, i) => (
              <ListRow
                key={c.concept_id}
                title={c.concept_label}
                meta={`${c.gap} gap · ${c.partial} partial${c.avg_score !== null ? ` · avg ${Math.round(c.avg_score * 100)}%` : ''}`}
                avatarText={String(i + 1)}
                avatarBg={i === 0 ? 'var(--accent-coral)' : i === 1 ? '#D97706' : '#6B7280'}
              />
            ))}
          </div>
        </div>

        {/* Student table */}
        <div className="col-span-2 bg-white border border-gray-100 rounded-2xl p-5 shadow-card overflow-auto">
          <h3 className="text-sm font-black mb-4" style={{ color: 'var(--ink)' }}>Students by Readiness</h3>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-100">
                {(['name', 'readiness', 'prove_it'] as SortCol[]).map(col => (
                  <th
                    key={col}
                    onClick={() => toggleSort(col)}
                    className="text-left py-2 pr-4 cursor-pointer select-none font-bold uppercase tracking-wide text-[10px] hover:opacity-70 transition"
                    style={{ color: 'var(--muted)' }}
                  >
                    {{name: 'Name', readiness: 'Readiness', prove_it: 'Prove It'}[col]}{sortArrow(col)}
                  </th>
                ))}
                <th className="text-left py-2 font-bold uppercase tracking-wide text-[10px]"
                    style={{ color: 'var(--muted)' }}>Concept</th>
              </tr>
            </thead>
            <tbody>
              {sortedStudents.map(student => {
                const ready = student.readiness_score >= report.readiness_threshold
                const pct   = Math.round(student.readiness_score * 100)
                return (
                  <tr key={student.id} className="border-b border-gray-50 hover:bg-gray-50 transition">
                    <td className="py-2.5 pr-4 font-semibold text-sm" style={{ color: 'var(--ink)' }}>
                      {student.name}
                      {ready && <span className="ml-1.5 text-green-600 text-xs">✓</span>}
                    </td>
                    <td className="py-2.5 pr-4">
                      <span className={`font-mono font-bold text-sm ${ready ? 'text-green-600' : pct >= 50 ? 'text-amber-600' : 'text-red-600'}`}>
                        {pct}%
                      </span>
                    </td>
                    <td className="py-2.5 pr-4">
                      {student.prove_it_score !== null ? (
                        <span className="inline-flex items-center gap-1">
                          <Badge kind={student.prove_it_passed ? 'pass' : 'fail'}
                                 label={`${student.prove_it_passed ? '✓' : '✗'} ${Math.round(student.prove_it_score * 100)}%`} />
                          {student.prove_it_badge === 'verified' && (
                            <Badge kind="verified" label="⬡" />
                          )}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--muted)' }}>—</span>
                      )}
                    </td>
                    <td className="py-2.5 text-xs" style={{ color: 'var(--muted)' }}>
                      {student.prove_it_concept?.replace(/_/g, ' ') ?? '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Root App
// ---------------------------------------------------------------------------

interface CourseInfo {
  id: string
  name: string
  description: string
}

export default function App() {
  const [role, setRole]                   = useState<'student' | 'faculty'>('student')
  const [view, setView]                   = useState<AppView>('idle')
  const [mastery, setMastery]             = useState<Record<string, number>>({})
  const [graphData, setGraphData]         = useState<GraphData | null>(null)
  const [selectedConcept, setSelectedConcept] = useState<string | null>(null)
  const [authStatus, setAuthStatus]       = useState<AuthStatus>({ auth_enabled: false, user: null })
  const [courseInfo, setCourseInfo]       = useState<CourseInfo>({ id: 'sql', name: 'SQL Placement Prep', description: 'adaptive SQL placement prep' })

  const effectiveRole: 'student' | 'faculty' = authStatus.auth_enabled
    ? (authStatus.user?.role ?? 'student')
    : role

  useEffect(() => {
    fetch('/api/course').then(r => r.json()).then(setCourseInfo).catch(console.error)
    fetch('/api/graph').then(r => r.json()).then(setGraphData).catch(console.error)
  }, [])

  useEffect(() => {
    fetch('/api/auth/status')
      .then(r => r.json())
      .then((s: AuthStatus) => setAuthStatus(s))
      .catch(() => {})
  }, [])

  const handleProveItScorecard = useCallback((conceptId: string, score: number) => {
    setMastery(prev => ({ ...prev, [conceptId]: Math.max(prev[conceptId] ?? 0, score) }))
  }, [])

  const handleDiagnosticComplete = useCallback((m: Record<string, number>) => {
    setMastery(m)
    setView('graph')
    const weakest = Object.entries(m).sort(([, a], [, b]) => a - b)[0]
    if (weakest) setSelectedConcept(weakest[0])
  }, [])

  // ── Sidebar nav ──────────────────────────────────────────────────────────
  const hasMastery = Object.keys(mastery).length > 0

  const activeNavItem: NavItem =
    effectiveRole === 'faculty' ? 'faculty'
    : view === 'idle'           ? 'dashboard'
    : 'lesson'

  const handleNav = useCallback((item: NavItem) => {
    if (item === 'faculty') {
      if (!authStatus.auth_enabled) setRole('faculty')
    } else {
      if (!authStatus.auth_enabled) setRole('student')
      if (item === 'dashboard' || item === 'courses') {
        setView('idle')
        setMastery({})
        setSelectedConcept(null)
      } else if ((item === 'lesson' || item === 'practice') && hasMastery) {
        setView('graph')
      }
    }
  }, [authStatus.auth_enabled, hasMastery])

  const selectedNode = graphData?.nodes.find(n => n.id === selectedConcept)

  const topTitle =
    effectiveRole === 'faculty' ? 'Faculty Dashboard'
    : view === 'graph'          ? 'Knowledge Map'
    : courseInfo.name

  return (
    <div className="flex h-screen" style={{ background: 'var(--bg)' }}>
      {/* Fixed sidebar */}
      <Sidebar
        activeItem={activeNavItem}
        onNavigate={handleNav}
        canAccessLesson={hasMastery}
      />

      {/* Main area (offset for sidebar) */}
      <div className="flex-1 flex flex-col overflow-hidden ml-[220px]">
        <TopBar
          title={topTitle}
          subtitle={effectiveRole === 'faculty' ? 'Cohort insights' : courseInfo.description}
          authEnabled={authStatus.auth_enabled}
          user={authStatus.user}
          role={role}
          onSetRole={r => { setRole(r); if (r === 'student' && effectiveRole !== 'student') setView('idle') }}
        />

        <main className="flex-1 overflow-hidden">
          {/* ── Faculty ── */}
          {effectiveRole === 'faculty' && <FacultyDashboard />}

          {/* ── Student idle/diagnostic ── */}
          {effectiveRole === 'student' && view === 'idle' && (
            <div className="h-full overflow-auto p-6 space-y-8">
              {/* How it works — accent cards */}
              <div className="grid grid-cols-4 gap-4">
                <AccentCard
                  accent="coral"
                  icon="🔍"
                  title="① Diagnose"
                  body="4–6 adaptive questions map your gaps onto a live knowledge graph."
                />
                <AccentCard
                  accent="blue"
                  icon="🗺"
                  title="② Gap Map"
                  body="See mastered, partial, and gap concepts on your SQL knowledge graph."
                />
                <AccentCard
                  accent="lime"
                  icon="📖"
                  title="③ Learn"
                  body="RAG-grounded micro-lessons adapted to your preferred depth and domain."
                />
                <AccentCard
                  accent="ink"
                  icon="✓"
                  title="④ Verify"
                  body="Prove mastery with a deterministically verified SQL exercise."
                />
              </div>

              {/* Diagnostic form */}
              <div className="max-w-xl mx-auto">
                <DiagnosticView onComplete={handleDiagnosticComplete} />
              </div>
            </div>
          )}

          {/* ── Student graph view ── */}
          {effectiveRole === 'student' && view === 'graph' && graphData && (
            <div className="flex h-full overflow-hidden">
              {/* Left: gap heatmap */}
              <div className="flex-1 p-5 overflow-auto">
                <div className="mb-4 flex items-center gap-3">
                  <h2 className="text-sm font-black" style={{ color: 'var(--ink)' }}>
                    Your SQL Knowledge Map
                  </h2>
                  <button
                    onClick={() => { setView('idle'); setMastery({}); setSelectedConcept(null) }}
                    className="text-xs font-semibold border border-gray-200 bg-white rounded-full px-3 py-1 hover:bg-gray-50 transition shadow-card"
                    style={{ color: 'var(--muted)' }}
                  >
                    Restart
                  </button>
                </div>

                {/* Mastery summary pills */}
                {Object.keys(mastery).length > 0 && (
                  <div className="mb-4 flex gap-2">
                    <Badge kind="mastered" label={`${Object.values(mastery).filter(v => v >= 0.9).length} mastered`} />
                    <Badge kind="partial"  label={`${Object.values(mastery).filter(v => v >= 0.25 && v < 0.9).length} partial`} />
                    <Badge kind="gap"      label={`${Object.values(mastery).filter(v => v < 0.25).length} gap`} />
                  </div>
                )}

                <ConceptGraph
                  graphData={graphData}
                  mastery={mastery}
                  selectedId={selectedConcept}
                  onSelect={setSelectedConcept}
                />
              </div>

              {/* Right: lesson + prove-it panel */}
              <div
                className="w-[420px] bg-white border-l border-gray-100 flex flex-col overflow-hidden shrink-0"
                style={{ boxShadow: '-2px 0 12px rgba(0,0,0,0.04)' }}
              >
                {selectedConcept && selectedNode ? (
                  <LessonPanel
                    key={selectedConcept}
                    conceptId={selectedConcept}
                    nodeLabel={selectedNode.label}
                    difficulty={selectedNode.difficulty}
                    mastery={mastery}
                    onScorecard={handleProveItScorecard}
                  />
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-center p-8 gap-3">
                    <div className="text-4xl opacity-20">←</div>
                    <p className="text-sm font-semibold" style={{ color: 'var(--muted)' }}>
                      Click any concept on the gap heatmap to open a grounded micro-lesson.
                    </p>
                    <p className="text-xs" style={{ color: 'var(--muted)' }}>
                      Red nodes are your gaps. Green nodes are mastered. Lessons are generated from retrieved corpus chunks — sources are always shown.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
