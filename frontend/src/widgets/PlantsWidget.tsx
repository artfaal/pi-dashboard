import { useState, useRef } from 'react'
import type { PlantsData, PlantData, WidgetProps } from '../types'

function statusColor(value: number, min: number, max: number): string {
  if (value < min) return '#f59e0b'  // amber — сухо
  if (value > max) return '#38bdf8'  // sky — сыро
  return '#22c55e'                   // emerald — норма
}

function PlantTile({ plant }: { plant: PlantData }) {
  const [imgError, setImgError] = useState(false)
  const humidity = plant.humidity ?? 0
  const hMin = plant.humidity_min ?? 0
  const hMax = plant.humidity_max ?? 100
  const color = statusColor(humidity, hMin, hMax)

  return (
    <div className="relative rounded-lg overflow-hidden bg-slate-800/50 min-w-0 min-h-0">
      {/* Image */}
      <div className="absolute inset-0 flex items-center justify-center p-1">
        {!imgError ? (
          <img
            src={plant.image_url}
            alt={plant.name}
            className="w-full h-full object-contain"
            onError={() => setImgError(true)}
          />
        ) : (
          <span className="text-2xl">🌿</span>
        )}
      </div>

      {/* Bottom overlay: name + humidity% */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent px-1.5 pb-1 pt-4">
        <div className="flex items-center justify-between gap-0.5">
          <span className="text-[7px] text-slate-300 truncate leading-tight">{plant.name}</span>
          <span className="text-[9px] font-mono font-bold shrink-0" style={{ color }}>
            {Math.round(humidity)}%
          </span>
        </div>
      </div>
    </div>
  )
}

export function PlantsWidget({ data, error }: WidgetProps) {
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
  const cols = 5
  const rows = Math.ceil(plants.length / cols)

  return (
    <div
      className="grid h-full gap-1.5 animate-fadeIn"
      style={{
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gridTemplateRows: `repeat(${rows}, 1fr)`,
      }}
    >
      {plants.map(plant => (
        <PlantTile key={plant.name} plant={plant} />
      ))}
    </div>
  )
}
