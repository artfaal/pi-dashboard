import { useEffect, useRef, useState } from 'react'
import type { CO2Data, WidgetProps } from '../types'

// ── CO2 level thresholds ───────────────────────────────────────────────────────

interface Level {
  max: number
  label: string
  color: string
  textColor: string
}

const LEVELS: Level[] = [
  { max: 600,      label: 'Отлично',  color: '#16a34a', textColor: '#4ade80' },
  { max: 800,      label: 'Хорошо',   color: '#22c55e', textColor: '#86efac' },
  { max: 1000,     label: 'Норма',    color: '#ca8a04', textColor: '#fde047' },
  { max: 1500,     label: 'Высокий',  color: '#ea580c', textColor: '#fb923c' },
  { max: Infinity, label: 'Опасно',   color: '#dc2626', textColor: '#f87171' },
]

function getLevel(ppm: number): Level {
  return LEVELS.find((l) => ppm < l.max) ?? LEVELS[LEVELS.length - 1]
}

// ── Circular gauge ─────────────────────────────────────────────────────────────

interface GaugeProps {
  ppm: number
  level: Level
}

function CircularGauge({ ppm, level }: GaugeProps) {
  const cx = 70
  const cy = 70
  const r = 54
  const strokeW = 9
  const circumference = 2 * Math.PI * r
  const MAX_PPM = 2000
  const progress = Math.min(ppm / MAX_PPM, 1)
  const dash = circumference * progress

  return (
    <svg viewBox="0 0 140 140" style={{ width: 140, height: 140 }} aria-hidden>
      {/* Track ring */}
      <circle
        cx={cx} cy={cy} r={r}
        fill="none"
        stroke="rgba(255,255,255,0.06)"
        strokeWidth={strokeW}
      />
      {/* Progress ring */}
      <circle
        cx={cx} cy={cy} r={r}
        fill="none"
        stroke={level.color}
        strokeWidth={strokeW}
        strokeLinecap="round"
        strokeDasharray={`${dash} ${circumference}`}
        transform={`rotate(-90 ${cx} ${cy})`}
        style={{
          transition: 'stroke-dasharray 1.2s ease, stroke 1s ease',
          filter: `drop-shadow(0 0 7px ${level.color})`,
        }}
      />
      {/* Centre label */}
      <text
        x={cx} y={cy - 8}
        textAnchor="middle"
        fill="white"
        fontSize="26"
        fontWeight="700"
        fontFamily="'JetBrains Mono', monospace"
        style={{ transition: 'opacity 0.3s' }}
      >
        {ppm}
      </text>
      <text
        x={cx} y={cy + 12}
        textAnchor="middle"
        fill="#64748b"
        fontSize="11"
        fontFamily="Inter, sans-serif"
      >
        ppm CO₂
      </text>
    </svg>
  )
}

// ── Sparkline ──────────────────────────────────────────────────────────────────

interface SparklineProps {
  values: number[]
  color: string
}

function Sparkline({ values, color }: SparklineProps) {
  if (values.length < 2) return null

  const W = 180
  const H = 36
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1

  const pts = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * W
      const y = H - ((v - min) / range) * (H - 4) - 2
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      style={{ width: '100%', height: H }}
      aria-hidden
    >
      <defs>
        <linearGradient id="spark-fade" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" stopColor={color} stopOpacity="0.1" />
          <stop offset="100%" stopColor={color} stopOpacity="0.7" />
        </linearGradient>
      </defs>
      <polyline
        points={pts}
        fill="none"
        stroke={`url(#spark-fade)`}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Latest dot */}
      {(() => {
        const last = values[values.length - 1]
        const x = W
        const y = H - ((last - min) / range) * (H - 4) - 2
        return (
          <circle
            cx={x} cy={y} r="3"
            fill={color}
            style={{ filter: `drop-shadow(0 0 4px ${color})` }}
          />
        )
      })()}
    </svg>
  )
}

// ── Main CO2 widget ────────────────────────────────────────────────────────────

export function CO2Widget({ data, error }: WidgetProps) {
  const co2Data = data as CO2Data | null
  const [history, setHistory] = useState<number[]>([])
  const prevRef = useRef<CO2Data | null>(null)
  if (co2Data) prevRef.current = co2Data
  const displayed = co2Data ?? prevRef.current

  useEffect(() => {
    if (co2Data?.ppm != null)
      setHistory((prev) => [...prev.slice(-29), co2Data.ppm])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [co2Data?.ppm])

  if (!displayed) {
    return (
      <div className="flex flex-col h-full">
        <WidgetLabel>CO₂</WidgetLabel>
        <div className="flex-1 flex items-center justify-center text-slate-600 text-sm">
          {error ? `Ошибка: ${error}` : 'Ожидание данных…'}
        </div>
      </div>
    )
  }

  const level = getLevel(displayed.ppm)

  return (
    <div className="flex flex-col h-full gap-2 animate-fadeIn">
      <WidgetLabel>CO₂</WidgetLabel>

      {/* Gauge + temp side by side */}
      <div className="flex items-center justify-between gap-2 flex-1">
        <CircularGauge ppm={displayed.ppm} level={level} />

        <div className="flex flex-col items-center gap-3 pr-2">
          {/* Status badge */}
          <div
            className="px-3 py-1 rounded-full text-xs font-semibold tracking-wide"
            style={{
              backgroundColor: `${level.color}22`,
              color: level.textColor,
              border: `1px solid ${level.color}44`,
            }}
          >
            {level.label}
          </div>

          {/* Temperature */}
          <div className="flex flex-col items-center">
            <span className="text-slate-500 text-xs uppercase tracking-widest">Темп.</span>
            <span className="font-mono text-2xl font-bold text-slate-200 leading-none mt-1">
              {displayed.temp}
              <span className="text-slate-500 text-base font-normal">°C</span>
            </span>
          </div>
        </div>
      </div>

      {/* Sparkline */}
      <div className="px-1">
        <Sparkline values={history} color={level.color} />
        <div className="flex justify-between text-[10px] text-slate-600 px-1 mt-0.5">
          <span>история</span>
          <span>{history.length} точек</span>
        </div>
      </div>
    </div>
  )
}

function WidgetLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] font-semibold tracking-[0.15em] text-slate-500 uppercase">
      {children}
    </div>
  )
}
