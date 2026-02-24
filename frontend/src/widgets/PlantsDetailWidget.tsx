import { useState, useRef, useLayoutEffect } from 'react'
import type { PlantsData, PlantData, WidgetProps } from '../types'

function HumidityBar({ value, min, max }: { value: number; min: number; max: number }) {
  const clamp = (v: number) => Math.max(0, Math.min(100, v))
  return (
    <div className="relative h-2 w-full rounded-full bg-slate-700 overflow-hidden">
      <div
        className="absolute top-0 h-full rounded-full bg-emerald-700/60"
        style={{ left: `${clamp(min)}%`, width: `${clamp(max) - clamp(min)}%` }}
      />
      <div
        className="absolute top-0 h-full w-1 rounded-full bg-white"
        style={{ left: `${clamp(value)}%`, transform: 'translateX(-50%)' }}
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
      {/* Photo — flex-1 fills available height */}
      <div className="flex-1 rounded-lg overflow-hidden bg-slate-700/50 flex items-center justify-center min-h-0">
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

// Разбить массив на чанки по N элементов
function chunk<T>(arr: T[], size: number): T[][] {
  const result: T[][] = []
  for (let i = 0; i < arr.length; i += size) result.push(arr.slice(i, i + size))
  return result
}

export function PlantsDetailWidget({ data, error }: WidgetProps) {
  const prevRef = useRef<PlantsData | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const [pageHeight, setPageHeight] = useState(0)

  // Измеряем точную высоту scroll-контейнера (родительского элемента),
  // чтобы каждая «страница» из 3 карточек занимала ровно один экран.
  useLayoutEffect(() => {
    const parent = rootRef.current?.parentElement
    if (!parent) return
    setPageHeight(parent.clientHeight)
    const ro = new ResizeObserver(() => setPageHeight(parent.clientHeight))
    ro.observe(parent)
    return () => ro.disconnect()
  }, [])

  const pd = data as PlantsData | null
  if (pd) prevRef.current = pd
  const displayed = pd ?? prevRef.current

  if (!displayed) {
    return (
      <div className="flex flex-col h-full items-center justify-center text-slate-600 text-sm">
        {error ? `Ошибка: ${error}` : 'Ожидание данных…'}
      </div>
    )
  }

  const pages = chunk(displayed.plants, 3)
  // Fallback: header (~40px) + main p-3 (24px) = 64px
  const h = pageHeight > 0 ? `${pageHeight}px` : 'calc(100dvh - 64px)'

  return (
    // Отрицательные вертикальные отступы «съедают» padding родителя (p-5 = 20px),
    // чтобы страницы начинались с y=0. Тогда scrollBy(clientHeight) = ровно одна страница.
    <div
      ref={rootRef}
      className="flex flex-col animate-fadeIn"
      style={{ marginTop: '-20px', marginBottom: '-20px' }}
    >
      {pages.map((page, pi) => (
        <div
          key={pi}
          className="flex flex-row gap-3 py-5 flex-shrink-0"
          style={{ height: h }}
        >
          {page.map(plant => <PlantCard key={plant.name} plant={plant} />)}
          {/* Пустые слоты чтобы карточки не растягивались на последней неполной странице */}
          {Array.from({ length: 3 - page.length }).map((_, i) => (
            <div key={`empty-${i}`} className="flex-1 min-w-0" />
          ))}
        </div>
      ))}
    </div>
  )
}
