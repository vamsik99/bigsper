import { useEffect, useState } from 'react'

type Health = { status: string; active_course: string; course_name: string }

export default function App() {
  const [health, setHealth] = useState<Health | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/health')
      .then((r) => r.json())
      .then(setHealth)
      .catch((e: unknown) => setError(String(e)))
  }, [])

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col items-center justify-center gap-8 p-8">
      <div className="text-center space-y-2">
        <h1 className="text-5xl font-bold tracking-tight">BigSper</h1>
        <p className="text-gray-400 text-lg">The future of learning</p>
      </div>

      <div className="rounded-xl border border-gray-800 bg-gray-900 p-6 w-full max-w-sm font-mono text-sm space-y-3">
        <p className="text-gray-500 text-xs uppercase tracking-widest">Backend status</p>
        {error && <p className="text-red-400">error: {error}</p>}
        {!health && !error && (
          <p className="text-gray-500 animate-pulse">connecting...</p>
        )}
        {health && (
          <div className="space-y-1">
            <Row label="status" value={health.status} valueClass="text-green-400" />
            <Row label="course" value={health.active_course} valueClass="text-blue-300" />
            <Row label="name"   value={health.course_name} />
          </div>
        )}
      </div>

      <div className="flex gap-6 text-xs text-gray-600">
        <span>Well-researched</span>
        <span>·</span>
        <span>Adaptive</span>
        <span>·</span>
        <span>Ground-truth verified</span>
      </div>
    </div>
  )
}

function Row({ label, value, valueClass = 'text-white' }: {
  label: string
  value: string
  valueClass?: string
}) {
  return (
    <p>
      <span className="text-gray-500">{label}: </span>
      <span className={valueClass}>{value}</span>
    </p>
  )
}
