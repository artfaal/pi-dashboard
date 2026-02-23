import { useState, useRef } from 'react'
import type { PlantsData, PlantData, WidgetProps } from '../types'

const PER_PAGE = 3

function HumidityBar({ value, min, max }: { value: number; min: number; max: number }) {
  const clamp = (v: number) => Math.max(0, Math.min(100, v))
  const minPct = clamp(min)
  const maxPct = clamp(max)
  const valPct = clamp(value)

  return (
    <div className="relative h-2 w-full rounded-full bg-slate-700 overflow-hidden">
      <div
        className="absolute top-0 h-full rounded-full bg-emerald-700/60"
        style={{ left: `${minPct}%`, width: `${maxPct - minPct}%` }}
      />
      <div
        className="absolute top-0 h-full w-1 rounded-full bg-white"
        style={{ left: `${valPct}%`, transform: 'translateX(-50%)' }}
      />
    </div>
  )
}

function StatusBadge({ value, min, max }: { value: number; min: number; max: number }) {
  if (value < min) return <span className="text-amber-400 text-xs font-bold">↓</span>
  if (value > max) return <span className="text-sky-400 text-xs font-bold">↑</span>
  return <span className="text-emerald-400 text-xs font-bold">✓</span>
}

function PlantCard({ plant }: { plant: PlantData }) {
  const [imgError, setImgError] = useState(false)

  const humidity = plant.humidity ?? 0
  const hMin = plant.humidity_min ?? 0
  const hMax = plant.humidity_max ?? 100

  return (
    <div className="flex flex-col gap-2 bg-slate-800/60 rounded-xl p-3 flex-1 min-w-0">
      {/* Photo — object-contain so full image is always visible */}
      <div className="w-full aspect-square rounded-lg overflow-hidden bg-slate-700/50 flex items-center justify-center">
        {!imgError ? (
          <img
            src={plant.image_url}
            alt={plant.name}
            className="w-full h-full object-contain"
            onError={() => setImgError(true)}
          />
        ) : (
          <span className="text-4xl">🌿</span>
        )}
      </div>

      {/* Name */}
      <div className="text-slate-200 text-xs font-semibold truncate leading-tight">
        {plant.name}
      </div>

      {/* Humidity bar + status */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-slate-500 uppercase tracking-wide">Влажность</span>
          <div className="flex items-center gap-1">
            <span className="text-xs font-mono text-slate-300">{Math.round(humidity)}%</span>
            <StatusBadge value={humidity} min={hMin} max={hMax} />
          </div>
        </div>
        <HumidityBar value={humidity} min={hMin} max={hMax} />
        <div className="flex justify-between text-[9px] text-slate-600">
          <span>{Math.round(hMin)}%</span>
          <span>{Math.round(hMax)}%</span>
        </div>
      </div>

      {/* Temperature */}
      {plant.temp != null && (
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-slate-500 uppercase tracking-wide">Темп.</span>
          <span className="text-xs font-mono text-slate-300">{plant.temp.toFixed(1)}°C</span>
        </div>
      )}
    </div>
  )
}

function NavButton({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void
  disabled: boolean
  children: React.ReactNode
}) {
  return (
    <button
      className="flex items-center justify-center w-7 shrink-0 rounded-lg text-slate-500 hover:text-slate-200 hover:bg-slate-700/50 disabled:opacity-20 disabled:cursor-not-allowed select-none transition-colors"
      disabled={disabled}
      onPointerDown={e => e.stopPropagation()}
      onPointerUp={e => e.stopPropagation()}
      onPointerCancel={e => e.stopPropagation()}
      onClick={e => { e.stopPropagation(); onClick() }}
    >
      <span className="text-xl leading-none">{children}</span>
    </button>
  )
}

export function PlantsWidget({ data, error }: WidgetProps) {
  const [page, setPage] = useState(0)
  const prevRef = useRef<PlantsData | null>(null)

  const pd = data as PlantsData | null
  if (pd) prevRef.current = pd
  const displayed = pd ?? prevRef.current

  if (!displayed) {
    return (
      <div className="flex flex-col h-full">
        <div className="text-[10px] font-semibold tracking-[0.15em] text-slate-500 uppercase">
          Растения
        </div>
        <div className="flex-1 flex items-center justify-center text-slate-600 text-sm">
          {error ? `Ошибка: ${error}` : 'Ожидание данных…'}
        </div>
      </div>
    )
  }

  const plants = displayed.plants
  const totalPages = Math.ceil(plants.length / PER_PAGE)
  const safePage = Math.min(page, totalPages - 1)
  const currentPlants = plants.slice(safePage * PER_PAGE, (safePage + 1) * PER_PAGE)

  const prev = () => setPage(p => Math.max(0, p - 1))
  const next = () => setPage(p => Math.min(totalPages - 1, p + 1))

  return (
    <div className="flex flex-col h-full gap-2 animate-fadeIn">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="text-[10px] font-semibold tracking-[0.15em] text-slate-500 uppercase">
          Растения
          <span className="ml-2 text-slate-600 normal-case tracking-normal">
            {displayed.count}
          </span>
        </div>
        {totalPages > 1 && (
          <span className="text-[10px] text-slate-600 tabular-nums">
            {safePage + 1}/{totalPages}
          </span>
        )}
      </div>

      {/* Cards + side nav buttons */}
      <div className="flex flex-row gap-1 flex-1 min-h-0">
        {totalPages > 1 && (
          <NavButton onClick={prev} disabled={safePage === 0}>←</NavButton>
        )}

        <div className="flex flex-row gap-2 flex-1 min-w-0">
          {currentPlants.map(plant => (
            <PlantCard key={plant.name} plant={plant} />
          ))}
          {Array.from({ length: PER_PAGE - currentPlants.length }).map((_, i) => (
            <div key={`empty-${i}`} className="flex-1 min-w-0" />
          ))}
        </div>

        {totalPages > 1 && (
          <NavButton onClick={next} disabled={safePage === totalPages - 1}>→</NavButton>
        )}
      </div>
    </div>
  )
}
