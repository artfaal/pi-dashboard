import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useWebSocket } from './hooks/useWebSocket'
import { ClockWidget } from './widgets/ClockWidget'
import { WIDGET_REGISTRY } from './widgets/registry'
import { DASHBOARD_CONFIG } from './dashboard.config'

const WS_PROTOCOL = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
const WS_URL = `${WS_PROTOCOL}//${window.location.host}/ws`

// ── Connection indicator ───────────────────────────────────────────────────────

function ConnectionDot({ connected }: { connected: boolean }) {
  const color = connected ? '#22c55e' : '#ef4444'
  return (
    <div className="flex items-center gap-2">
      <div
        className={`w-2 h-2 rounded-full ${connected ? 'animate-pulse_glow' : ''}`}
        style={{ backgroundColor: color, boxShadow: `0 0 8px ${color}` }}
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
  const timerRef  = useRef<ReturnType<typeof setInterval> | null>(null)
  const pressRef  = useRef<{ x: number; y: number; t: number } | null>(null)
  const headerRef = useRef<number>(0) // stores pointerdown time for header

  const { rotate, pages } = DASHBOARD_CONFIG

  const goToPage = useCallback(
    (idx: number) => {
      setPageIdx(idx)
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

  useEffect(() => {
    if (!rotate.enabled) return
    timerRef.current = setInterval(
      () => setPageIdx((p) => (p + 1) % pages.length),
      rotate.intervalSeconds * 1000,
    )
    return () => { if (timerRef.current !== null) clearInterval(timerRef.current) }
  }, [rotate.enabled, rotate.intervalSeconds, pages.length])

  // ── Pointer-event handlers for <main> ─────────────────────────────────────
  // ft5x06 DSI touchscreen registers as mouse0, so Chromium fires
  // pointer events (not touch events). onPointerDown/Up works universally.

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    pressRef.current = { x: e.clientX, y: e.clientY, t: Date.now() }
  }, [])

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    const start = pressRef.current
    pressRef.current = null
    if (!start || pages.length <= 1) return

    const dx  = e.clientX - start.x
    const dy  = e.clientY - start.y
    const dt  = Date.now() - start.t
    const adx = Math.abs(dx)
    const ady = Math.abs(dy)

    // Long press → ignore (prevents accidental navigation)
    if (dt > 500) return

    // Swipe: clearly horizontal, far enough
    if (adx > 50 && adx > ady * 1.5) {
      goToPage(
        dx < 0
          ? (pageIdx + 1) % pages.length                // swipe left  → next
          : (pageIdx - 1 + pages.length) % pages.length // swipe right → prev
      )
      return
    }

    // Short tap: didn't move much
    if (adx < 30 && ady < 30) {
      goToPage((pageIdx + 1) % pages.length)
    }
  }, [pageIdx, pages.length, goToPage])

  const handlePointerCancel = useCallback(() => {
    pressRef.current = null
  }, [])

  // ── Header: short tap → exit kiosk ────────────────────────────────────────

  const handleHeaderDown = useCallback(() => {
    headerRef.current = Date.now()
  }, [])

  const handleHeaderUp = useCallback(() => {
    if (Date.now() - headerRef.current < 400) {
      fetch('/api/kiosk/exit').catch(() => {})
    }
  }, [])

  const page     = pages[pageIdx]
  const colCount = Math.min(page.slots.length, 3)

  return (
    <div
      className="w-full h-full flex flex-col bg-[#080c10] select-none"
      onContextMenu={(e) => e.preventDefault()}
    >

      {/* ── Header — tap to exit kiosk ──────────────────────────────────── */}
      <header
        className="flex items-center justify-between px-5 py-2.5 border-b border-white/[0.05]"
        onPointerDown={handleHeaderDown}
        onPointerUp={handleHeaderUp}
      >
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

      {/* ── Widget grid — pointer events for swipe/tap navigation ───────── */}
      <main
        className="flex-1 grid gap-3 p-3 min-h-0"
        style={{
          gridTemplateColumns: `repeat(${colCount}, 1fr)`,
          touchAction: 'none', // deliver all pointer events to JS
        }}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
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
