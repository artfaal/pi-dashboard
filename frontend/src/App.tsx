import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useWebSocket } from './hooks/useWebSocket'
import { ClockWidget } from './widgets/ClockWidget'
import { WIDGET_REGISTRY } from './widgets/registry'
import { DASHBOARD_CONFIG } from './dashboard.config'

// nginx proxies /ws → backend:8000/ws, so we use the same host/port as the page
const WS_PROTOCOL = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
const WS_URL = `${WS_PROTOCOL}//${window.location.host}/ws`

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

function WidgetCard({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="card p-5 flex flex-col overflow-hidden"
      style={{ backdropFilter: 'blur(12px)' }}
    >
      {children}
    </div>
  )
}

// ── App ────────────────────────────────────────────────────────────────────────

export default function App() {
  const { connected, data: wsData } = useWebSocket(WS_URL)
  const [pageIdx, setPageIdx] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const { rotate, pages } = DASHBOARD_CONFIG

  const goToPage = useCallback(
    (idx: number) => {
      setPageIdx(idx)
      // If rotate is on, reset the timer so we continue from the new page
      if (rotate.enabled && timerRef.current !== null) {
        clearInterval(timerRef.current)
        timerRef.current = setInterval(
          () => setPageIdx((p) => (p + 1) % pages.length),
          rotate.intervalSeconds * 1000,
        )
      }
    },
    [rotate.enabled, rotate.intervalSeconds, pages.length],
  )

  // Auto-rotation timer
  useEffect(() => {
    if (!rotate.enabled) return
    timerRef.current = setInterval(
      () => setPageIdx((p) => (p + 1) % pages.length),
      rotate.intervalSeconds * 1000,
    )
    return () => {
      if (timerRef.current !== null) clearInterval(timerRef.current)
    }
  }, [rotate.enabled, rotate.intervalSeconds, pages.length])

  const page    = pages[pageIdx]
  const colCount = Math.min(page.slots.length, 3)

  const nextPage = () => goToPage((pageIdx + 1) % pages.length)

  // Short-tap detection: only navigate if touch lasted < 300ms
  const touchStartRef = useRef<number>(0)
  const handleTouchStart = useCallback(() => {
    touchStartRef.current = Date.now()
  }, [])
  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (pages.length > 1 && Date.now() - touchStartRef.current < 300) {
      e.preventDefault()
      nextPage()
    }
  }, [pages.length, nextPage])

  return (
    <div
      className="w-full h-full flex flex-col bg-[#080c10] select-none"
      onTouchStart={pages.length > 1 ? handleTouchStart : undefined}
      onTouchEnd={pages.length > 1 ? handleTouchEnd : undefined}
      onContextMenu={(e) => e.preventDefault()}
    >

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="flex items-center justify-between px-5 py-2.5 border-b border-white/[0.05]">
        <div className="flex items-center gap-4">
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
      <main
        className="flex-1 grid gap-3 p-3 min-h-0"
        style={{ gridTemplateColumns: `repeat(${colCount}, 1fr)` }}
      >
        {page.slots.map((slot) => {
          const Widget  = WIDGET_REGISTRY[slot.widgetId]
          const payload = wsData[slot.moduleId]
          if (!Widget) return null
          return (
            <WidgetCard key={slot.widgetId}>
              <Widget
                data={payload?.ok ? payload.data : null}
                error={payload?.error}
              />
            </WidgetCard>
          )
        })}
      </main>

    </div>
  )
}
