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

function WidgetCard({
  children,
  selected,
  onClick,
}: {
  children: React.ReactNode
  selected?: boolean
  onClick?: () => void
}) {
  return (
    <div
      className={[
        'card p-5 flex flex-col overflow-hidden transition-all duration-150',
        selected
          ? 'ring-2 ring-indigo-500/80 shadow-[0_0_16px_2px_rgba(99,102,241,0.25)]'
          : '',
      ].join(' ')}
      style={{ backdropFilter: 'blur(12px)' }}
      onClick={onClick}
    >
      {children}
    </div>
  )
}

// ── App ────────────────────────────────────────────────────────────────────────

export default function App() {
  const { connected, data: wsData } = useWebSocket(WS_URL)
  const [pageIdx, setPageIdx]               = useState(0)
  const [selectedSlotIdx, setSelectedSlotIdx] = useState(0)
  const [expandedSlotIdx, setExpandedSlotIdx] = useState<number | null>(null)

  const timerRef          = useRef<ReturnType<typeof setInterval> | null>(null)
  const pressRef          = useRef<{ x: number; y: number; t: number } | null>(null)
  const headerRef         = useRef<number>(0)
  const expandedScrollRef = useRef<HTMLDivElement>(null)
  // Expanded widget can register a key handler for A/C/D keys.
  const widgetKeyRef      = useRef<((code: string) => boolean) | null>(null)

  const { rotate, pages } = DASHBOARD_CONFIG
  const isExpanded = expandedSlotIdx !== null

  // Reset widget selection/expansion when page changes
  const goToPage = useCallback(
    (idx: number) => {
      setPageIdx(idx)
      setSelectedSlotIdx(0)
      setExpandedSlotIdx(null)
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

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    pressRef.current = { x: e.clientX, y: e.clientY, t: Date.now() }
  }, [])

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    const start = pressRef.current
    pressRef.current = null
    if (!start) return

    const dx  = e.clientX - start.x
    const dy  = e.clientY - start.y
    const dt  = Date.now() - start.t
    const adx = Math.abs(dx)
    const ady = Math.abs(dy)

    // Long press → ignore
    if (dt > 500) return

    // When expanded: any tap/swipe exits the expanded widget
    if (isExpanded) {
      setExpandedSlotIdx(null)
      return
    }

    if (pages.length <= 1) return

    // Swipe: clearly horizontal, far enough
    if (adx > 50 && adx > ady * 1.5) {
      goToPage(
        dx < 0
          ? (pageIdx + 1) % pages.length
          : (pageIdx - 1 + pages.length) % pages.length,
      )
      return
    }

    // Short tap: navigate pages
    if (adx < 30 && ady < 30) {
      goToPage((pageIdx + 1) % pages.length)
    }
  }, [pageIdx, pages.length, goToPage, isExpanded])

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

  // ── Macro keyboard (3 buttons + rotary encoder) ───────────────────────────
  // Physical key mapping:
  //   Button A → KeyA    Button B → KeyB    Button C → KeyC
  //   Knob press → KeyD  Knob left → KeyE   Knob right → KeyF
  //
  // Widget selection/expansion mode:
  //   A — select widget to the LEFT (cyclic)
  //   B — enter selected widget / exit expanded back to page
  //   C — select widget to the RIGHT (cyclic)
  //   D — exit expanded widget OR exit kiosk (if at page level)
  //   E — previous page (exits expanded if any)
  //   F — next page (exits expanded if any)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const page   = pages[pageIdx]
      const slots  = page?.slots ?? []
      const nSlots = slots.length

      switch (e.code) {
        case 'KeyA': // button A → выбор влево / фокус в виджете влево
          e.preventDefault()
          if (isExpanded) {
            widgetKeyRef.current?.('KeyA')
          } else if (nSlots > 1) {
            setSelectedSlotIdx((i) => (i - 1 + nSlots) % nSlots)
          }
          break

        case 'KeyB': // button B → enter / exit
          e.preventDefault()
          if (isExpanded) {
            setExpandedSlotIdx(null)
          } else {
            setExpandedSlotIdx(selectedSlotIdx)
          }
          break

        case 'KeyC': // button C → выбор вправо / фокус в виджете вправо
          e.preventDefault()
          if (isExpanded) {
            widgetKeyRef.current?.('KeyC')
          } else if (nSlots > 1) {
            setSelectedSlotIdx((i) => (i + 1) % nSlots)
          }
          break

        case 'KeyD': // knob press → действие кнопки / выход / kiosk exit
          e.preventDefault()
          if (isExpanded) {
            const consumed = widgetKeyRef.current?.('KeyD') ?? false
            if (!consumed) setExpandedSlotIdx(null)
          } else {
            fetch('/api/kiosk/exit').catch(() => {})
          }
          break

        case 'KeyE': // knob left → прокрутка вверх (если expanded) | предыдущая страница
          e.preventDefault()
          if (isExpanded) {
            const el = expandedScrollRef.current
            el?.scrollBy({ top: -(el.clientHeight), behavior: 'smooth' })
          } else {
            setExpandedSlotIdx(null)
            setSelectedSlotIdx(0)
            setPageIdx((p) => (p - 1 + pages.length) % pages.length)
          }
          break

        case 'KeyF': // knob right → прокрутка вниз (если expanded) | следующая страница
          e.preventDefault()
          if (isExpanded) {
            const el = expandedScrollRef.current
            el?.scrollBy({ top: el.clientHeight, behavior: 'smooth' })
          } else {
            setExpandedSlotIdx(null)
            setSelectedSlotIdx(0)
            setPageIdx((p) => (p + 1) % pages.length)
          }
          break
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [pages, pageIdx, isExpanded, selectedSlotIdx])
  // ── End macro keyboard ─────────────────────────────────────────────────────

  const page     = pages[pageIdx]
  const colCount = Math.min(page.slots.length, 3)

  // ── Expanded widget rendering ──────────────────────────────────────────────
  const renderExpanded = () => {
    const slot        = page.slots[expandedSlotIdx!]
    const detailId    = slot.detailWidgetId ?? slot.widgetId
    const DetailWidget = WIDGET_REGISTRY[detailId] ?? WIDGET_REGISTRY[slot.widgetId]
    const payload     = wsData[slot.moduleId]
    if (!DetailWidget) return null
    return (
      <main
        className="flex-1 flex flex-col p-3 min-h-0"
        style={{ touchAction: 'none' }}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
      >
        <div
          ref={expandedScrollRef}
          className="flex-1 card p-5 overflow-y-auto"
          style={{ backdropFilter: 'blur(12px)' }}
        >
          <DetailWidget
            data={payload?.ok ? payload.data : null}
            error={payload?.error}
            keyActionRef={widgetKeyRef}
          />
        </div>
      </main>
    )
  }

  return (
    <div
      className="w-full h-full flex flex-col bg-[#080c10] select-none"
      onContextMenu={(e) => e.preventDefault()}
    >

      {/* ── Header ──────────────────────────────────────────────────────── */}
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

        <div className="flex items-center gap-3">
          {/* Breadcrumb when expanded */}
          {isExpanded && (
            <span className="text-[11px] text-slate-600 font-mono">
              {page.slots[expandedSlotIdx!].widgetId} · A/C = фокус · D = назад/действие · E/F = скролл
            </span>
          )}
          <ClockWidget />
        </div>
      </header>

      {/* ── Expanded view ───────────────────────────────────────────────── */}
      {isExpanded && renderExpanded()}

      {/* ── Normal grid ─────────────────────────────────────────────────── */}
      {!isExpanded && (
        <main
          className="flex-1 grid gap-3 p-3 min-h-0"
          style={{
            gridTemplateColumns: `repeat(${colCount}, 1fr)`,
            touchAction: 'none',
          }}
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
        >
          {page.slots.map((slot, idx) => {
            const Widget  = WIDGET_REGISTRY[slot.widgetId]
            const payload = wsData[slot.moduleId]
            if (!Widget) return null
            return (
              <WidgetCard
                key={slot.widgetId}
                selected={selectedSlotIdx === idx}
                onClick={() => {
                  setSelectedSlotIdx(idx)
                  setExpandedSlotIdx(idx)
                }}
              >
                <Widget
                  data={payload?.ok ? payload.data : null}
                  error={payload?.error}
                />
              </WidgetCard>
            )
          })}
        </main>
      )}

    </div>
  )
}
