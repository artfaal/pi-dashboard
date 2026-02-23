import { useEffect, useState } from 'react'
import { useWebSocket } from './hooks/useWebSocket'
import { ClockWidget } from './widgets/ClockWidget'
import { CO2Widget } from './widgets/CO2Widget'
import { InternetWidget } from './widgets/InternetWidget'
import type { CO2Data, InternetData } from './types'

// nginx proxies /ws → backend:8000/ws, so we use the same host/port as the page
const WS_PROTOCOL = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
const WS_URL = `${WS_PROTOCOL}//${window.location.host}/ws`

const MAX_HISTORY = 30

// ── Connection indicator ───────────────────────────────────────────────────────

function ConnectionDot({ connected }: { connected: boolean }) {
  const color = connected ? '#22c55e' : '#ef4444'
  return (
    <div className="flex items-center gap-2">
      <div
        className={`w-2 h-2 rounded-full ${connected ? 'animate-pulse_glow' : ''}`}
        style={{
          backgroundColor: color,
          boxShadow: `0 0 8px ${color}`,
        }}
      />
      <span className="text-[11px] text-slate-600 font-medium">
        {connected ? 'live' : 'reconnecting…'}
      </span>
    </div>
  )
}

// ── Widget card wrapper ────────────────────────────────────────────────────────

function WidgetCard({
  children,
  className = '',
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={`card p-5 flex flex-col overflow-hidden ${className}`}
      style={{ backdropFilter: 'blur(12px)' }}
    >
      {children}
    </div>
  )
}

// ── App ────────────────────────────────────────────────────────────────────────

export default function App() {
  const { connected, data } = useWebSocket(WS_URL)
  const [co2History, setCo2History] = useState<number[]>([])

  const co2Payload    = data['co2']
  const internetPayload = data['internet']

  const co2Data      = co2Payload?.ok      ? (co2Payload.data as CO2Data)           : null
  const internetData = internetPayload?.ok ? (internetPayload.data as InternetData)  : null

  // Accumulate CO2 ppm history for the sparkline
  useEffect(() => {
    if (co2Data) {
      setCo2History((prev) => [...prev.slice(-(MAX_HISTORY - 1)), co2Data.ppm])
    }
  }, [co2Data])

  return (
    <div className="w-full h-full flex flex-col bg-[#080c10] select-none">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="flex items-center justify-between px-5 py-2.5 border-b border-white/[0.05]">
        <div className="flex items-center gap-4">
          {/* Decorative accent */}
          <div
            className="w-1 h-5 rounded-full"
            style={{ background: 'linear-gradient(to bottom, #6366f1, #3b82f6)' }}
          />
          <span className="text-sm font-semibold text-slate-400 tracking-wide">
            Pi Dashboard
          </span>
          <ConnectionDot connected={connected} />
        </div>
        <ClockWidget />
      </header>

      {/* ── Widget grid ─────────────────────────────────────────────────── */}
      {/*
        Layout for 800×480 display (minus ~48px header = ~432px content area).
        3 columns: CO2 | Temperature | Internet
      */}
      <main className="flex-1 grid grid-cols-3 gap-3 p-3 min-h-0">

        {/* CO2 */}
        <WidgetCard>
          <CO2Widget
            data={co2Data}
            history={co2History}
            error={co2Payload?.error}
          />
        </WidgetCard>

        {/* Temperature (sourced from CO2 sensor) */}
        <WidgetCard>
          <TempWidget data={co2Data} error={co2Payload?.error} />
        </WidgetCard>

        {/* Internet */}
        <WidgetCard>
          <InternetWidget
            data={internetData}
            error={internetPayload?.error}
          />
        </WidgetCard>

      </main>
    </div>
  )
}

// ── Temperature widget (inline — simple enough to not need its own file) ───────

function TempWidget({ data, error }: { data: CO2Data | null; error?: string }) {
  // Comfortable indoor range
  const COLD = 18
  const WARM = 24

  if (!data) {
    return (
      <div className="flex flex-col h-full">
        <WidgetLabelInline>Температура</WidgetLabelInline>
        <div className="flex-1 flex items-center justify-center text-slate-600 text-sm">
          {error ? `Ошибка: ${error}` : 'Ожидание данных…'}
        </div>
      </div>
    )
  }

  const temp  = data.temp
  const color =
    temp < COLD - 2 ? '#60a5fa' :   // cold — blue
    temp > WARM + 2 ? '#f87171' :   // hot  — red
                      '#4ade80'      // comfortable — green

  const comfort =
    temp < COLD ? 'Прохладно' :
    temp > WARM ? 'Жарковато' :
                  'Комфортно'

  // Progress on a 10–40°C scale
  const pct = Math.min(Math.max((temp - 10) / 30, 0), 1) * 100

  return (
    <div className="flex flex-col h-full gap-3 animate-fadeIn">
      <WidgetLabelInline>Температура</WidgetLabelInline>

      {/* Big number */}
      <div className="flex-1 flex flex-col items-center justify-center gap-1">
        <div className="flex items-start leading-none">
          <span
            className="font-mono font-bold"
            style={{ fontSize: 68, color, lineHeight: 1, transition: 'color 1s' }}
          >
            {temp}
          </span>
          <span className="text-slate-500 text-2xl mt-2 ml-1">°C</span>
        </div>

        {/* Comfort badge */}
        <div
          className="mt-2 px-3 py-0.5 rounded-full text-xs font-semibold"
          style={{
            backgroundColor: `${color}20`,
            color,
            border: `1px solid ${color}40`,
            transition: 'all 1s',
          }}
        >
          {comfort}
        </div>
      </div>

      {/* Range bar */}
      <div className="space-y-1.5">
        <div className="h-2 bg-white/[0.06] rounded-full overflow-hidden relative">
          {/* Comfortable zone highlight */}
          <div
            className="absolute top-0 h-full rounded-full opacity-20"
            style={{
              left: `${((COLD - 10) / 30) * 100}%`,
              width: `${((WARM - COLD) / 30) * 100}%`,
              backgroundColor: '#4ade80',
            }}
          />
          {/* Temperature cursor */}
          <div
            className="h-full rounded-full transition-all duration-1000"
            style={{
              width: `${pct}%`,
              backgroundColor: color,
              boxShadow: `0 0 8px ${color}`,
            }}
          />
        </div>
        <div className="flex justify-between text-[10px] text-slate-600">
          <span>10°</span>
          <span className="text-slate-700">{COLD}°–{WARM}° комфорт</span>
          <span>40°</span>
        </div>
      </div>
    </div>
  )
}

function WidgetLabelInline({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] font-semibold tracking-[0.15em] text-slate-500 uppercase">
      {children}
    </div>
  )
}
