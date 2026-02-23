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
  const timerRef    = useRef<ReturnType<typeof setInterval> | null>(null)
  const headerRef   = useRef<HTMLElement>(null)
  const pageIdxRef  = useRef(0)       // mirror of pageIdx for use inside listeners
  const startTouchRef = useRef<{ x: number; y: number; t: number } | null>(null)

  const { rotate, pages } = DASHBOARD_CONFIG

  // Keep ref in sync so listeners always see current page without re-registering
  useEffect(() => { pageIdxRef.current = pageIdx }, [pageIdx])

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

  // Auto-rotation
  useEffect(() => {
    if (!rotate.enabled) return
    timerRef.current = setInterval(
      () => setPageIdx((p) => (p + 1) % pages.length),
      rotate.intervalSeconds * 1000,
    )
    return () => { if (timerRef.current !== null) clearInterval(timerRef.current) }
  }, [rotate.enabled, rotate.intervalSeconds, pages.length])

  // ── Native document-level touch listeners ──────────────────────────────────
  // React synthetic touch events are unreliable on Pi kiosk — use native DOM.
  // Swipe left → next page, swipe right → prev page, short tap → next page.
  // Touches inside the header are excluded (header has its own action).
  useEffect(() => {
    if (pages.length <= 1) return

    const onStart = (e: TouchEvent) => {
      const t = e.touches[0]
      startTouchRef.current = { x: t.clientX, y: t.clientY, t: Date.now() }
    }

    const onEnd = (e: TouchEvent) => {
      const start = startTouchRef.current
      if (!start) return
      startTouchRef.current = null

      // If touch ended inside the header — let the header handle it
      if (headerRef.current?.contains(e.target as Node)) return

      const t   = e.changedTouches[0]
      const dx  = t.clientX - start.x
      const dy  = t.clientY - start.y
      const dt  = Date.now() - start.t
      const adx = Math.abs(dx)
      const ady = Math.abs(dy)
      const idx = pageIdxRef.current

      // Swipe: clearly horizontal, far enough, fast enough
      if (adx > 50 && adx > ady * 1.5 && dt < 600) {
        goToPage(
          dx < 0
            ? (idx + 1) % pages.length                // swipe left  → next
            : (idx - 1 + pages.length) % pages.length // swipe right → prev
        )
        return
      }

      // Short tap: barely moved, quick
      if (adx < 30 && ady < 30 && dt < 300) {
        goToPage((idx + 1) % pages.length)
      }
    }

    document.addEventListener('touchstart', onStart, { passive: true })
    document.addEventListener('touchend',   onEnd,   { passive: true })

    return () => {
      document.removeEventListener('touchstart', onStart)
      document.removeEventListener('touchend',   onEnd)
    }
  }, [pages.length, goToPage]) // stable deps — no re-registration on page change

  // ── Kiosk exit ────────────────────────────────────────────────────────────
  const handleExitKiosk = useCallback((e: TouchEvent) => {
    e.stopPropagation()
    fetch('/api/kiosk/exit').catch(() => {})
  }, [])

  useEffect(() => {
    const el = headerRef.current
    if (!el) return
    el.addEventListener('touchend', handleExitKiosk, { passive: true })
    return () => el.removeEventListener('touchend', handleExitKiosk)
  }, [handleExitKiosk])

  const page     = pages[pageIdx]
  const colCount = Math.min(page.slots.length, 3)

  return (
    <div
      className="w-full h-full flex flex-col bg-[#080c10] select-none"
      onContextMenu={(e) => e.preventDefault()}
    >

      {/* ── Header — touch here to exit kiosk ───────────────────────────── */}
      <header
        ref={headerRef}
        className="flex items-center justify-between px-5 py-2.5 border-b border-white/[0.05]"
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
