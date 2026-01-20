import { useState, useEffect } from 'react'

interface Container {
  id: string
  name: string
  image: string
  status: string
  state: string
  ports: string
}

interface SystemInfo {
  uptime: string
  memory: { total: string; used: string; percent: number }
  load: string
  disk: { total: string; used: string; available: string; percent: string }
}

function App() {
  const [time, setTime] = useState(new Date())
  const [containers, setContainers] = useState<Container[]>([])
  const [system, setSystem] = useState<SystemInfo | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [containersRes, systemRes] = await Promise.all([
          fetch('/api/containers'),
          fetch('/api/system'),
        ])
        if (containersRes.ok) {
          const data = await containersRes.json()
          setContainers(data.containers)
        }
        if (systemRes.ok) {
          const data = await systemRes.json()
          setSystem(data)
        }
        setError(null)
      } catch {
        setError('Unable to connect to API')
      }
    }
    fetchData()
    const interval = setInterval(fetchData, 5000)
    return () => clearInterval(interval)
  }, [])

  const runningCount = containers.filter((c) => c.state === 'running').length

  return (
    <div className="container">
      <div className="card">
        <div className="status-indicator" />
        <h1>ash1 oasis</h1>
        <p className="subtitle">
          {error ? error : `${runningCount} container${runningCount !== 1 ? 's' : ''} running`}
        </p>
        <div className="time-display">
          <span className="time">{time.toLocaleTimeString()}</span>
          <span className="date">
            {time.toLocaleDateString(undefined, {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </span>
        </div>

        {system && (
          <div className="system-stats">
            <div className="stat">
              <span className="stat-label">Uptime</span>
              <span className="stat-value">{system.uptime}</span>
            </div>
            <div className="stat">
              <span className="stat-label">Memory</span>
              <span className="stat-value">{system.memory.percent}%</span>
            </div>
            <div className="stat">
              <span className="stat-label">Load</span>
              <span className="stat-value">{system.load}</span>
            </div>
            <div className="stat">
              <span className="stat-label">Disk</span>
              <span className="stat-value">{system.disk.percent}</span>
            </div>
          </div>
        )}

        {containers.length > 0 && (
          <div className="containers">
            <h2>Containers</h2>
            <div className="container-list">
              {containers.map((c) => (
                <div key={c.id} className="container-item">
                  <span className={`dot ${c.state === 'running' ? 'active' : 'inactive'}`} />
                  <span className="container-name">{c.name}</span>
                  <span className="container-status">{c.status}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      <footer>
        <span>jamescq.com</span>
      </footer>
    </div>
  )
}

export default App
