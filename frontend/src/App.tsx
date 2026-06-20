import { useState, useEffect, useCallback, useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts'

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
// Difficulty increases top→bottom
// ---------------------------------------------------------------------------

const NODE_POS: Record<string, { x: number; y: number }> = {
  // difficulty 1  y=30
  data_types:      { x: 55,  y: 30 },
  select_basics:   { x: 195, y: 30 },
  filtering:       { x: 335, y: 30 },
  sorting:         { x: 475, y: 30 },
  // difficulty 2  y=120
  aggregation:     { x: 55,  y: 120 },
  grouping:        { x: 195, y: 120 },
  inner_join:      { x: 335, y: 120 },
  dml:             { x: 475, y: 120 },
  // difficulty 3  y=210
  outer_join:      { x: 5,   y: 210 },
  self_join:       { x: 135, y: 210 },
  subqueries:      { x: 265, y: 210 },
  set_ops:         { x: 395, y: 210 },
  schema_design:   { x: 525, y: 210 },
  // difficulty 4  y=310
  cte:             { x: 55,  y: 310 },
  window_basics:   { x: 195, y: 310 },
  normalization:   { x: 335, y: 310 },
  indexes:         { x: 475, y: 310 },
  // difficulty 5  y=410
  window_advanced: { x: 195, y: 410 },
  transactions:    { x: 335, y: 410 },
}

const NODE_W = 120
const NODE_H = 36

function nodeCenter(id: string) {
  const p = NODE_POS[id] ?? { x: 0, y: 0 }
  return { cx: p.x + NODE_W / 2, cy: p.y + NODE_H / 2 }
}

function masteryColor(score: number | undefined): string {
  if (score === undefined) return '#374151' // gray-700, not assessed
  if (score >= 0.9) return '#166534'        // green-800
  if (score >= 0.25) return '#92400e'       // amber-800
  return '#991b1b'                          // red-800
}

function masteryBorder(score: number | undefined): string {
  if (score === undefined) return '#6B7280' // gray-500
  if (score >= 0.9) return '#4ade80'       // green-400
  if (score >= 0.25) return '#fbbf24'      // amber-400
  return '#f87171'                          // red-400
}

function masteryLabel(score: number | undefined): string {
  if (score === undefined) return ''
  if (score >= 0.9) return '✓'
  if (score >= 0.25) return '~'
  return '✗'
}

// ---------------------------------------------------------------------------
// Simple markdown renderer (handles **bold**, `code`, ```blocks```, \n\n)
// ---------------------------------------------------------------------------

function renderMarkdown(text: string): React.ReactNode[] {
  const blocks = text.split(/\n\n+/)
  return blocks.map((block, bi) => {
    // Code block
    if (block.startsWith('```')) {
      const lines = block.split('\n')
      const lang = lines[0].replace('```', '').trim()
      const code = lines.slice(1).filter(l => l !== '```').join('\n')
      return (
        <pre key={bi} className="bg-gray-950 border border-gray-700 rounded p-3 overflow-x-auto text-xs text-green-300 my-2">
          {lang && <div className="text-gray-500 text-xs mb-1">{lang}</div>}
          <code>{code}</code>
        </pre>
      )
    }
    // Heading
    if (block.startsWith('## ')) {
      return <h3 key={bi} className="text-sm font-semibold text-blue-300 mt-3 mb-1">{block.slice(3)}</h3>
    }
    // Table (basic)
    if (block.includes('|')) {
      const rows = block.split('\n').filter(r => r.trim() && !r.match(/^\|[-| ]+\|$/))
      return (
        <table key={bi} className="text-xs w-full border-collapse my-2">
          <tbody>
            {rows.map((row, ri) => (
              <tr key={ri} className={ri === 0 ? 'text-gray-400 border-b border-gray-700' : 'text-gray-300'}>
                {row.split('|').filter(c => c.trim()).map((cell, ci) => (
                  <td key={ci} className="py-0.5 px-1">{cell.trim()}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )
    }
    // Regular paragraph with inline formatting
    const inlined = inlineMarkdown(block)
    return <p key={bi} className="text-sm text-gray-300 leading-relaxed my-1">{inlined}</p>
  })
}

function inlineMarkdown(text: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g)
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} className="text-white font-semibold">{part.slice(2, -2)}</strong>
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return <code key={i} className="bg-gray-800 text-green-300 px-1 rounded text-xs font-mono">{part.slice(1, -1)}</code>
    }
    return part
  })
}

// ---------------------------------------------------------------------------
// Diagnostic view
// ---------------------------------------------------------------------------

function DiagnosticView({
  onComplete,
}: {
  onComplete: (mastery: Record<string, number>) => void
}) {
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
      <div className="flex flex-col items-center gap-8 mt-10">
        <div className="text-center space-y-4 max-w-sm">
          <h2 className="text-2xl font-bold text-white">SQL Placement Prep</h2>
          <p className="text-gray-400 text-sm leading-relaxed">
            4–6 adaptive questions map your gaps onto a live knowledge graph.
            Click any red node → get a grounded lesson → prove you learned it with a verified SQL exercise.
          </p>
          <div className="flex justify-center items-center gap-2 text-xs text-gray-600 pt-1">
            <span className="px-2 py-1 rounded bg-gray-800 text-gray-400">① Diagnose</span>
            <span>→</span>
            <span className="px-2 py-1 rounded bg-red-950 text-red-400 border border-red-800">② See gaps</span>
            <span>→</span>
            <span className="px-2 py-1 rounded bg-gray-800 text-gray-400">③ Learn</span>
            <span>→</span>
            <span className="px-2 py-1 rounded bg-green-950 text-green-400 border border-green-800">④ Verified</span>
          </div>
        </div>
        <button
          onClick={startDiagnostic}
          disabled={loading}
          className="px-8 py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg transition disabled:opacity-50 text-base"
        >
          {loading ? 'Starting…' : 'Start Diagnostic →'}
        </button>
      </div>
    )
  }

  if (!question) {
    return (
      <div className="flex items-center justify-center mt-16">
        <p className="text-gray-400 animate-pulse">Loading question…</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-6 mt-8 max-w-xl w-full mx-auto px-4">
      <div className="w-full flex justify-between text-xs text-gray-500">
        <span>Question {qNumber}</span>
        <span className="text-gray-600">concept: {question.concept_id.replace(/_/g, ' ')}</span>
      </div>

      <div className="w-full bg-gray-900 border border-gray-700 rounded-xl p-6 space-y-4">
        <p className="text-white font-medium leading-relaxed">{question.stem}</p>

        <div className="space-y-2">
          {question.options.map((opt, i) => {
            const isSelected = selected === i
            const isCorrect = grade && i === question.correct_index
            const isWrong = grade && isSelected && !grade.correct

            let cls = 'w-full text-left px-4 py-2.5 rounded-lg border text-sm transition '
            if (isCorrect) cls += 'bg-green-900 border-green-500 text-green-200'
            else if (isWrong) cls += 'bg-red-900 border-red-500 text-red-200'
            else if (isSelected) cls += 'bg-blue-900 border-blue-500 text-blue-200'
            else cls += 'bg-gray-800 border-gray-600 text-gray-300 hover:border-gray-400 hover:bg-gray-750'

            return (
              <button key={i} className={cls} onClick={() => submitAnswer(i)} disabled={!!grade || loading}>
                <span className="text-gray-500 mr-2">{String.fromCharCode(65 + i)}.</span>
                {opt}
              </button>
            )
          })}
        </div>

        {grade && (
          <div className={`rounded-lg p-3 text-sm ${grade.correct ? 'bg-green-950 text-green-300 border border-green-800' : 'bg-red-950 text-red-300 border border-red-800'}`}>
            {grade.rationale}
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Concept graph SVG — colored as gap heatmap from diagnostic mastery
// ---------------------------------------------------------------------------

function ConceptGraph({
  graphData,
  mastery,
  selectedId,
  onSelect,
}: {
  graphData: GraphData
  mastery: Record<string, number>
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  return (
    <div className="overflow-auto rounded-xl border border-gray-800 bg-gray-900 p-3">
      <div className="text-xs text-gray-500 mb-2 px-1">
        Gap heatmap — red nodes are your weakest concepts. Click any to start learning.
      </div>
      <svg width={660} height={480} className="select-none">
        <defs>
          <marker id="arrow" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
            <polygon points="0 0, 8 3, 0 6" fill="#4B5563" />
          </marker>
        </defs>

        {/* Edges */}
        {graphData.edges.map((edge, i) => {
          const s = nodeCenter(edge.from)
          const t = nodeCenter(edge.to)
          const dy = t.cy - s.cy
          const cpOffset = Math.abs(dy) * 0.4
          const d = `M${s.cx},${s.cy + NODE_H / 2} C${s.cx},${s.cy + NODE_H / 2 + cpOffset} ${t.cx},${t.cy - cpOffset} ${t.cx},${t.cy - NODE_H / 2 - 4}`
          return (
            <path key={i} d={d} fill="none" stroke="#374151" strokeWidth={1.5} markerEnd="url(#arrow)" />
          )
        })}

        {/* Nodes */}
        {graphData.nodes.map(node => {
          const pos = NODE_POS[node.id]
          if (!pos) return null
          const score = mastery[node.id]
          const isSelected = selectedId === node.id
          const fill = masteryColor(score)
          const border = masteryBorder(score)
          const badge = masteryLabel(score)

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
                rx={6}
                fill={fill}
                stroke={isSelected ? '#60a5fa' : border}
                strokeWidth={isSelected ? 2 : 1}
              />
              <text
                x={NODE_W / 2}
                y={NODE_H / 2 + 1}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={10}
                fill={score !== undefined ? '#f3f4f6' : '#d1d5db'}
                fontFamily="sans-serif"
                fontWeight={isSelected ? '700' : '500'}
              >
                {node.label.length > 18 ? node.label.slice(0, 17) + '…' : node.label}
              </text>
              {badge && (
                <text x={NODE_W - 6} y={6} textAnchor="end" fontSize={9} fill={border} fontFamily="sans-serif">
                  {badge}
                </text>
              )}
            </g>
          )
        })}
      </svg>

      {/* Legend */}
      <div className="flex gap-4 mt-2 px-1 text-xs text-gray-500">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-green-800 border border-green-400 inline-block"/>&nbsp;mastered</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-amber-800 border border-amber-400 inline-block"/>&nbsp;partial</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-800 border border-red-400 inline-block"/>&nbsp;gap</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-gray-700 border border-gray-500 inline-block"/>&nbsp;not assessed</span>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Scorecard display — diagnostic mastery + prove-it result side by side
// ---------------------------------------------------------------------------

function ScorecardDisplay({
  data,
  conceptLabel,
  onReset,
}: {
  data: ScorecardData
  conceptLabel: string
  onReset: () => void
}) {
  const { diagnostic, prove_it: pt } = data

  const diagColors: Record<string, string> = {
    mastered: 'bg-green-950 border-green-700 text-green-300',
    partial:  'bg-amber-950 border-amber-700 text-amber-300',
    gap:      'bg-red-950 border-red-700 text-red-300',
    unknown:  'bg-gray-800 border-gray-600 text-gray-400',
  }
  const diagIcon: Record<string, string> = {
    mastered: '✓', partial: '~', gap: '✗', unknown: '?',
  }

  const badgeColorMap: Record<string, string> = {
    green: 'bg-green-950 border-green-600 text-green-300',
    blue:  'bg-blue-950 border-blue-600 text-blue-300',
    gray:  'bg-gray-800 border-gray-600 text-gray-400',
  }
  const proveItCls = badgeColorMap[pt.badge.color] ?? badgeColorMap.gray

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Scorecard heading */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs text-gray-500 uppercase tracking-wide mb-0.5">Scorecard</div>
          <div className="text-sm font-semibold text-white">{conceptLabel}</div>
        </div>
        {pt.passed
          ? <span className="text-xs font-bold text-green-400 bg-green-950 border border-green-700 rounded px-2 py-0.5">PASS</span>
          : <span className="text-xs font-bold text-red-400 bg-red-950 border border-red-700 rounded px-2 py-0.5">FAIL</span>
        }
      </div>

      {/* Side-by-side: diagnostic vs prove-it */}
      <div className="grid grid-cols-2 gap-3">
        {/* Diagnostic mastery */}
        <div className={`rounded-xl border p-3 flex flex-col gap-1 ${diagColors[diagnostic.tier]}`}>
          <div className="text-xs opacity-60 uppercase tracking-wide">Before lesson</div>
          <div className="text-xl font-bold">{diagIcon[diagnostic.tier]}</div>
          <div className="text-sm font-semibold capitalize">{diagnostic.label}</div>
          {diagnostic.score !== null && (
            <div className="text-xs opacity-60">
              Diagnostic score: {Math.round(diagnostic.score * 100)}%
            </div>
          )}
          <div className="text-xs opacity-50 mt-1">from adaptive diagnostic</div>
        </div>

        {/* Prove-it result */}
        <div className={`rounded-xl border p-3 flex flex-col gap-1 ${proveItCls}`}>
          <div className="text-xs opacity-60 uppercase tracking-wide">After lesson</div>
          <div className="text-xl font-bold">{pt.passed ? '✅' : '❌'}</div>
          <div className="text-sm font-semibold">{pt.badge.label}</div>
          <div className="text-xs opacity-60">
            Score: {Math.round(pt.score * 100)}%
          </div>
          <div className="text-xs opacity-50 mt-1">
            {pt.badge.label === 'Verified'
              ? 'deterministically verified'
              : 'ai assessed'}
          </div>
        </div>
      </div>

      {/* SQL error */}
      {pt.error && (
        <div className="bg-red-950 border border-red-800 rounded-lg p-3 text-xs text-red-300 font-mono">
          {pt.error}
        </div>
      )}

      {/* Result diff */}
      {!pt.error && (pt.evidence.expected_rows.length > 0 || pt.evidence.actual_rows.length > 0) && (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <div className="text-xs text-gray-500 mb-1">Expected ({pt.evidence.expected_rows.length} rows)</div>
            <div className="bg-gray-950 border border-gray-800 rounded p-2 text-xs text-gray-300 font-mono max-h-28 overflow-y-auto space-y-0.5">
              {pt.evidence.expected_rows.slice(0, 15).map((row, i) => (
                <div key={i} className="text-green-400">{JSON.stringify(row)}</div>
              ))}
              {pt.evidence.expected_rows.length > 15 && (
                <div className="text-gray-600">…{pt.evidence.expected_rows.length - 15} more</div>
              )}
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-500 mb-1">Your output ({pt.evidence.actual_rows.length} rows)</div>
            <div className="bg-gray-950 border border-gray-800 rounded p-2 text-xs text-gray-300 font-mono max-h-28 overflow-y-auto space-y-0.5">
              {pt.evidence.actual_rows.slice(0, 15).map((row, i) => (
                <div key={i} className={pt.passed ? 'text-green-400' : 'text-red-400'}>
                  {JSON.stringify(row)}
                </div>
              ))}
              {pt.evidence.actual_rows.length > 15 && (
                <div className="text-gray-600">…{pt.evidence.actual_rows.length - 15} more</div>
              )}
              {pt.evidence.actual_rows.length === 0 && !pt.error && (
                <div className="text-gray-700 italic">no rows returned</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* LLM coaching narrative */}
      {pt.narrative && (
        <div className="bg-gray-900 border border-gray-700 rounded-lg p-3">
          <div className="text-xs text-gray-500 mb-1">Coach</div>
          <p className="text-sm text-gray-300 leading-relaxed">{pt.narrative}</p>
        </div>
      )}

      {/* Try again */}
      <button
        onClick={onReset}
        className="text-xs text-gray-500 hover:text-gray-300 underline self-start"
      >
        Try again
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Prove It panel — SQL task + unified scorecard
// ---------------------------------------------------------------------------

function ProveItPanel({
  conceptId,
  conceptLabel,
  mastery,
}: {
  conceptId: string
  conceptLabel: string
  mastery: Record<string, number>
}) {
  const [task, setTask] = useState<TaskData | null>(null)
  const [taskLoading, setTaskLoading] = useState(false)
  const [taskError, setTaskError] = useState<string | null>(null)
  const [sql, setSql] = useState('')
  const [running, setRunning] = useState(false)
  const [scorecard, setScorecard] = useState<ScorecardData | null>(null)

  // Generate a task on mount
  useEffect(() => {
    setTask(null)
    setScorecard(null)
    setSql('')
    setTaskError(null)
    setTaskLoading(true)
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
    setRunning(true)
    setScorecard(null)
    try {
      const res = await fetch('/api/scorecard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task_id: task.task_id,
          submission: sql,
          concept_id: conceptId,
          mastery,
        }),
      })
      const data: ScorecardData = await res.json()
      setScorecard(data)
    } finally {
      setRunning(false)
    }
  }, [task, sql, conceptId, mastery])

  const reset = useCallback(() => {
    setScorecard(null)
    setSql('')
  }, [])

  if (taskLoading) {
    return (
      <div className="flex flex-col gap-3 p-4 mt-4">
        <div className="h-3 bg-gray-800 rounded animate-pulse w-3/4" />
        <div className="h-3 bg-gray-800 rounded animate-pulse w-full" />
        <div className="h-3 bg-gray-800 rounded animate-pulse w-2/3" />
        <div className="text-xs text-gray-600 mt-2 animate-pulse">Generating exercise…</div>
      </div>
    )
  }

  if (taskError || !task) {
    return (
      <div className="p-4 text-xs text-red-400">
        {taskError ?? 'Failed to generate task.'}
      </div>
    )
  }

  // After grading: show unified scorecard
  if (scorecard) {
    return (
      <div className="overflow-y-auto h-full">
        <ScorecardDisplay
          data={scorecard}
          conceptLabel={conceptLabel}
          onReset={reset}
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 p-4 overflow-y-auto h-full">
      {/* Exercise prompt */}
      <div className="bg-gray-900 border border-gray-700 rounded-lg p-3">
        <div className="text-xs text-gray-500 mb-1">Exercise</div>
        <p className="text-sm text-white leading-relaxed">{task.prompt}</p>
        {task.context && (
          <details className="mt-2 group">
            <summary className="cursor-pointer text-xs text-gray-600 hover:text-gray-400 select-none">
              ▶ Schema reference
            </summary>
            <pre className="mt-1 text-xs text-gray-400 bg-gray-950 rounded p-2 overflow-x-auto whitespace-pre-wrap">{task.context}</pre>
          </details>
        )}
      </div>

      {/* SQL input */}
      <div className="flex flex-col gap-2">
        <label className="text-xs text-gray-500">Your SQL</label>
        <textarea
          value={sql}
          onChange={e => setSql(e.target.value)}
          placeholder="SELECT ..."
          rows={5}
          className="w-full bg-gray-950 border border-gray-700 rounded-lg p-3 text-sm text-green-300 font-mono resize-y focus:outline-none focus:border-blue-600 placeholder-gray-700"
        />
        <button
          onClick={runQuery}
          disabled={running || !sql.trim()}
          className="self-end px-5 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-sm font-semibold rounded-lg transition"
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
  depth: ['simpler', 'standard', 'deeper'],
  example_domain: ['ecommerce', 'sports', 'finance'],
  format: ['worked_example', 'analogy', 'step_by_step'],
}

const FORMAT_LABELS: Record<string, string> = {
  worked_example: 'Worked example',
  analogy: 'Analogy first',
  step_by_step: 'Step-by-step',
}

function LessonPanel({
  conceptId,
  nodeLabel,
  difficulty,
  mastery,
}: {
  conceptId: string
  nodeLabel: string
  difficulty: number
  mastery: Record<string, number>
}) {
  const [activeTab, setActiveTab] = useState<'lesson' | 'prove'>('lesson')
  const [profile, setProfile] = useState<Profile>({
    depth: 'standard',
    example_domain: 'ecommerce',
    format: 'worked_example',
  })
  const [lesson, setLesson] = useState<LessonData | null>(null)
  const [loading, setLoading] = useState(false)
  const [rerenderLoading, setRerenderLoading] = useState(false)

  // Fetch fresh lesson when concept changes
  useEffect(() => {
    setLesson(null)
    setLoading(true)
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

  // Re-render when profile changes (after initial load)
  const rerender = useCallback(
    (newProfile: Profile) => {
      if (!lesson) return
      setRerenderLoading(true)
      fetch('/api/lesson/rerender', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          concept_id: conceptId,
          profile: newProfile,
          sources: lesson.sources,
        }),
      })
        .then(r => r.json())
        .then(data => setLesson(data))
        .finally(() => setRerenderLoading(false))
    },
    [lesson, conceptId],
  )

  const updateProfile = useCallback(
    (key: keyof Profile, value: string) => {
      const next = { ...profile, [key]: value }
      setProfile(next)
      rerender(next)
    },
    [profile, rerender],
  )

  const diffStars = '★'.repeat(difficulty) + '☆'.repeat(5 - difficulty)

  // Mastery badge for header
  const conceptScore = mastery[conceptId]
  const masteryTierLabel =
    conceptScore === undefined ? null
    : conceptScore >= 0.9 ? { text: 'mastered', cls: 'text-green-400' }
    : conceptScore >= 0.25 ? { text: 'partial', cls: 'text-amber-400' }
    : { text: 'gap', cls: 'text-red-400' }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-gray-800">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-white">{nodeLabel}</h2>
            {masteryTierLabel && (
              <span className={`text-xs ${masteryTierLabel.cls}`}>
                {masteryTierLabel.text} in diagnostic
              </span>
            )}
          </div>
          <span className="text-amber-400 text-xs mt-0.5 shrink-0">{diffStars}</span>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mt-3 mb-1">
          <button
            onClick={() => setActiveTab('lesson')}
            className={`px-3 py-1 text-xs rounded font-medium transition ${
              activeTab === 'lesson'
                ? 'bg-blue-700 text-white'
                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
            }`}
          >
            Lesson
          </button>
          <button
            onClick={() => setActiveTab('prove')}
            className={`px-3 py-1 text-xs rounded font-medium transition ${
              activeTab === 'prove'
                ? 'bg-blue-700 text-white'
                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
            }`}
          >
            Prove It ✓
          </button>
        </div>

        {/* Preference controls — only shown on lesson tab */}
        {activeTab === 'lesson' && (
          <>
            <div className="flex flex-wrap gap-2 mt-2">
              {(Object.keys(PROFILE_OPTIONS) as Array<keyof typeof PROFILE_OPTIONS>).map(key => (
                <div key={key} className="flex flex-col gap-0.5">
                  <label className="text-gray-500 text-xs capitalize">{key.replace('_', ' ')}</label>
                  <select
                    value={profile[key as keyof Profile]}
                    onChange={e => updateProfile(key as keyof Profile, e.target.value)}
                    disabled={loading || !lesson}
                    className="bg-gray-800 border border-gray-600 text-gray-200 text-xs rounded px-2 py-1 disabled:opacity-50"
                  >
                    {PROFILE_OPTIONS[key].map(opt => (
                      <option key={opt} value={opt}>
                        {key === 'format' ? FORMAT_LABELS[opt] ?? opt : opt}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
            {rerenderLoading && (
              <div className="mt-2 text-xs text-blue-400 animate-pulse">Re-rendering lesson…</div>
            )}
          </>
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
          />
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1">
          {loading && (
            <div className="flex flex-col gap-2 mt-4">
              <div className="h-3 bg-gray-800 rounded animate-pulse w-3/4" />
              <div className="h-3 bg-gray-800 rounded animate-pulse w-full" />
              <div className="h-3 bg-gray-800 rounded animate-pulse w-5/6" />
              <div className="h-3 bg-gray-800 rounded animate-pulse w-2/3 mt-2" />
            </div>
          )}

          {lesson && !loading && (
            <>
              {lesson.no_corpus && (
                <div className="text-xs text-amber-400 bg-amber-950 border border-amber-800 rounded p-2 mb-3">
                  ⚠ No corpus content indexed for this concept.
                </div>
              )}

              <div className="lesson-body opacity-100">
                {renderMarkdown(lesson.lesson)}
              </div>

              {/* Source citations */}
              {lesson.sources.length > 0 && (
                <details className="mt-4 group" open={false}>
                  <summary className="cursor-pointer text-xs text-gray-500 hover:text-gray-300 select-none flex items-center gap-1">
                    <span className="group-open:rotate-90 transition-transform inline-block">▶</span>
                    &nbsp;Sources ({lesson.sources.length} corpus chunk{lesson.sources.length !== 1 ? 's' : ''})
                  </summary>
                  <div className="mt-2 space-y-2">
                    {lesson.sources.map((src, i) => (
                      <div key={i} className="bg-gray-900 border border-gray-700 rounded p-2 text-xs text-gray-400">
                        <div className="text-gray-600 mb-1">
                          chunk {src.chunk_idx} · {src.concept_id.replace(/_/g, ' ')}
                        </div>
                        <p className="line-clamp-4 leading-relaxed">
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
  const [report, setReport] = useState<FacultyReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [sortCol, setSortCol] = useState<SortCol>('readiness')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

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
      if (sortCol === 'name') {
        cmp = a.name.localeCompare(b.name)
      } else if (sortCol === 'readiness') {
        cmp = a.readiness_score - b.readiness_score
      } else {
        cmp = (a.prove_it_score ?? -1) - (b.prove_it_score ?? -1)
      }
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
        <p className="text-gray-500 animate-pulse">Loading cohort report…</p>
      </div>
    )
  }

  if (fetchError || !report) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-red-400 text-sm">{fetchError ?? 'Failed to load report.'}</p>
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

  return (
    <div className="flex-1 overflow-auto p-6 space-y-6">
      {/* Stats row */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Placement Ready</div>
          <div className="text-3xl font-bold text-green-400">{report.placement_ready_count}</div>
          <div className="text-xs text-gray-600 mt-0.5">
            of {report.total_students} students · ≥{Math.round(report.readiness_threshold * 100)}% avg mastery
          </div>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Class Pass Rate</div>
          <div className={`text-3xl font-bold ${passRate >= 50 ? 'text-green-400' : passRate >= 30 ? 'text-amber-400' : 'text-red-400'}`}>
            {passRate}%
          </div>
          <div className="text-xs text-gray-600 mt-0.5">placement-readiness threshold</div>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Top Class Gap</div>
          {report.weakest_concepts[0] ? (
            <>
              <div className="text-lg font-bold text-red-400 leading-tight">{report.weakest_concepts[0].concept_label}</div>
              <div className="text-xs text-gray-600 mt-0.5">
                {report.weakest_concepts[0].gap} gaps · avg{' '}
                {report.weakest_concepts[0].avg_score !== null
                  ? Math.round(report.weakest_concepts[0].avg_score * 100) + '%'
                  : '—'}
              </div>
            </>
          ) : <div className="text-gray-600 text-sm">—</div>}
        </div>
      </div>

      {/* Cohort Mastery Heatmap */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-white mb-0.5">Cohort Mastery by Concept</h3>
        <p className="text-xs text-gray-500 mb-4">
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
            <YAxis tick={{ fontSize: 10, fill: '#6B7280' }} allowDecimals={false} />
            <Tooltip
              contentStyle={{
                backgroundColor: '#111827',
                border: '1px solid #374151',
                borderRadius: 8,
                fontSize: 12,
              }}
              labelStyle={{ color: '#F3F4F6' }}
            />
            <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
            <Bar dataKey="mastered" stackId="a" fill="#166534" name="Mastered" />
            <Bar dataKey="partial"  stackId="a" fill="#92400e" name="Partial" />
            <Bar dataKey="gap"      stackId="a" fill="#991b1b" name="Gap" />
            <Bar dataKey="unknown"  stackId="a" fill="#374151" name="Not assessed" radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Bottom row: weakest concepts + student table */}
      <div className="grid grid-cols-3 gap-4">
        {/* Weakest class-wide concepts */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-white mb-3">Top Class-Wide Gaps</h3>
          <div className="space-y-3">
            {report.weakest_concepts.map((c, i) => (
              <div key={c.concept_id} className="flex items-center gap-2">
                <span className="text-xs text-gray-600 w-4 shrink-0">{i + 1}.</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-gray-200 truncate">{c.concept_label}</div>
                  <div className="flex gap-2 text-xs mt-0.5">
                    <span className="text-red-400">{c.gap} gap</span>
                    <span className="text-amber-400">{c.partial} partial</span>
                    {c.avg_score !== null && (
                      <span className="text-gray-500">avg {Math.round(c.avg_score * 100)}%</span>
                    )}
                  </div>
                  <div className="mt-1 h-1 bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-red-700 rounded-full"
                      style={{ width: `${c.avg_score !== null ? Math.round(c.avg_score * 100) : 0}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Student list */}
        <div className="col-span-2 bg-gray-900 border border-gray-800 rounded-xl p-4 overflow-auto">
          <h3 className="text-sm font-semibold text-white mb-3">Students by Readiness</h3>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-gray-500 border-b border-gray-800">
                <th
                  className="text-left py-1.5 pr-3 cursor-pointer select-none hover:text-gray-300 font-medium"
                  onClick={() => toggleSort('name')}
                >
                  Name{sortArrow('name')}
                </th>
                <th
                  className="text-right py-1.5 pr-3 cursor-pointer select-none hover:text-gray-300 font-medium"
                  onClick={() => toggleSort('readiness')}
                >
                  Readiness{sortArrow('readiness')}
                </th>
                <th
                  className="text-center py-1.5 pr-3 cursor-pointer select-none hover:text-gray-300 font-medium"
                  onClick={() => toggleSort('prove_it')}
                >
                  Prove It{sortArrow('prove_it')}
                </th>
                <th className="text-left py-1.5 font-medium text-gray-600">Concept</th>
              </tr>
            </thead>
            <tbody>
              {sortedStudents.map(student => {
                const ready = student.readiness_score >= report.readiness_threshold
                const pct = Math.round(student.readiness_score * 100)
                return (
                  <tr key={student.id} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition">
                    <td className="py-2 pr-3 text-gray-200 font-medium">
                      {student.name}
                      {ready && <span className="ml-1.5 text-green-400">✓</span>}
                    </td>
                    <td className="py-2 pr-3 text-right">
                      <span className={`font-mono font-semibold ${ready ? 'text-green-400' : pct >= 50 ? 'text-amber-400' : 'text-red-400'}`}>
                        {pct}%
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-center">
                      {student.prove_it_score !== null ? (
                        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-semibold ${
                          student.prove_it_passed
                            ? 'bg-green-950 text-green-400 border border-green-800'
                            : 'bg-red-950 text-red-400 border border-red-800'
                        }`}>
                          {student.prove_it_passed ? '✓' : '✗'} {Math.round(student.prove_it_score * 100)}%
                          {student.prove_it_badge === 'verified' && (
                            <span className="text-blue-400" title="Deterministically verified">⬡</span>
                          )}
                        </span>
                      ) : (
                        <span className="text-gray-700">—</span>
                      )}
                    </td>
                    <td className="py-2 text-gray-500">
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

export default function App() {
  const [role, setRole] = useState<'student' | 'faculty'>('student')
  const [view, setView] = useState<AppView>('idle')
  const [mastery, setMastery] = useState<Record<string, number>>({})
  const [graphData, setGraphData] = useState<GraphData | null>(null)
  const [selectedConcept, setSelectedConcept] = useState<string | null>(null)
  const [authStatus, setAuthStatus] = useState<AuthStatus>({ auth_enabled: false, user: null })

  // When auth is enabled, role comes from the session; otherwise from the toggle.
  const effectiveRole: 'student' | 'faculty' = authStatus.auth_enabled
    ? (authStatus.user?.role ?? 'student')
    : role

  // Fetch graph on mount so it's ready when diagnostic finishes
  useEffect(() => {
    fetch('/api/graph')
      .then(r => r.json())
      .then(setGraphData)
      .catch(console.error)
  }, [])

  useEffect(() => {
    fetch('/api/auth/status')
      .then(r => r.json())
      .then((s: AuthStatus) => setAuthStatus(s))
      .catch(() => { /* keep default no-auth state */ })
  }, [])

  const handleDiagnosticComplete = useCallback((m: Record<string, number>) => {
    setMastery(m)
    setView('graph')
    // Auto-select the weakest assessed concept so the gap→lesson flow starts immediately
    const weakest = Object.entries(m).sort(([, a], [, b]) => a - b)[0]
    if (weakest) setSelectedConcept(weakest[0])
  }, [])

  const selectedNode = graphData?.nodes.find(n => n.id === selectedConcept)

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      {/* Header */}
      <header className="border-b border-gray-800 px-6 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold tracking-tight">BigSper</h1>
          <span className="text-gray-600 text-xs">adaptive SQL placement prep</span>
        </div>
        <div className="flex items-center gap-4">
          {/* Role toggle — shown only when AUTH_ENABLED=false (fallback) */}
          {!authStatus.auth_enabled && (
            <div className="flex text-xs bg-gray-900 border border-gray-700 rounded-lg p-0.5">
              <button
                onClick={() => setRole('student')}
                className={`px-3 py-1 rounded-md font-medium transition ${role === 'student' ? 'bg-blue-700 text-white' : 'text-gray-400 hover:text-gray-200'}`}
              >
                Student
              </button>
              <button
                onClick={() => setRole('faculty')}
                className={`px-3 py-1 rounded-md font-medium transition ${role === 'faculty' ? 'bg-blue-700 text-white' : 'text-gray-400 hover:text-gray-200'}`}
              >
                Faculty
              </button>
            </div>
          )}
          {/* Auth controls — shown only when AUTH_ENABLED=true */}
          {authStatus.auth_enabled && authStatus.user && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-gray-400">{authStatus.user.name}</span>
              <span className={`px-2 py-0.5 rounded font-medium ${authStatus.user.role === 'faculty' ? 'bg-violet-700 text-white' : 'bg-blue-800 text-blue-200'}`}>
                {authStatus.user.role}
              </span>
              <a href="/api/auth/logout" className="text-gray-500 hover:text-gray-300 border border-gray-700 rounded px-2 py-0.5">
                Logout
              </a>
            </div>
          )}
          {authStatus.auth_enabled && !authStatus.user && (
            <a href="/api/auth/login" className="text-xs bg-violet-700 hover:bg-violet-600 text-white px-3 py-1 rounded-md font-medium transition">
              Faculty Login
            </a>
          )}
          <div className="hidden sm:flex gap-3 text-xs text-gray-600">
            <span>Well-researched</span>
            <span>·</span>
            <span>Adaptive</span>
            <span>·</span>
            <span>Ground-truth verified</span>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 flex overflow-hidden">
        {effectiveRole === 'faculty' && <FacultyDashboard />}

        {effectiveRole === 'student' && view === 'idle' && (
          <div className="flex-1 flex flex-col items-center justify-center">
            <DiagnosticView onComplete={handleDiagnosticComplete} />
          </div>
        )}

        {effectiveRole === 'student' && view === 'graph' && graphData && (
          <div className="flex-1 flex overflow-hidden">
            {/* Left: gap heatmap */}
            <div className="flex-1 p-4 overflow-auto">
              <div className="mb-3 flex items-center gap-3">
                <h2 className="text-sm font-semibold text-white">Your SQL Knowledge Map</h2>
                <button
                  onClick={() => { setView('idle'); setMastery({}); setSelectedConcept(null) }}
                  className="text-xs text-gray-500 hover:text-gray-300 border border-gray-700 rounded px-2 py-0.5"
                >
                  Restart
                </button>
              </div>

              {/* Mastery summary */}
              {Object.keys(mastery).length > 0 && (
                <div className="mb-3 flex gap-3 text-xs">
                  <span className="text-green-400">{Object.values(mastery).filter(v => v >= 0.9).length} mastered</span>
                  <span className="text-amber-400">{Object.values(mastery).filter(v => v >= 0.25 && v < 0.9).length} partial</span>
                  <span className="text-red-400">{Object.values(mastery).filter(v => v < 0.25).length} gap</span>
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
            <div className="w-[420px] border-l border-gray-800 flex flex-col overflow-hidden shrink-0">
              {selectedConcept && selectedNode ? (
                <LessonPanel
                  key={selectedConcept}
                  conceptId={selectedConcept}
                  nodeLabel={selectedNode.label}
                  difficulty={selectedNode.difficulty}
                  mastery={mastery}
                />
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-8 gap-3">
                  <div className="text-4xl text-gray-700">←</div>
                  <p className="text-gray-500 text-sm">Click any concept on the gap heatmap to open a grounded micro-lesson.</p>
                  <p className="text-gray-600 text-xs">Red nodes are your gaps. Green nodes are mastered. Lessons are generated from retrieved corpus chunks — sources are always shown.</p>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
