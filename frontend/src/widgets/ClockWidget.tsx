import { useState, useEffect } from 'react'

export function ClockWidget() {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  const time = now.toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })

  const date = now.toLocaleDateString('ru-RU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })

  return (
    <div className="flex flex-col items-end select-none">
      <span className="font-mono text-3xl font-bold text-white tracking-tight leading-none">
        {time}
      </span>
      <span className="text-xs text-slate-500 mt-1 capitalize">{date}</span>
    </div>
  )
}
