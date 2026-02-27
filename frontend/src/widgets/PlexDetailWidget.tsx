import { useRef } from 'react'
import type { PlexData, PlexMediaItem, WidgetProps } from '../types'

function thumbUrl(path: string | null, w = 300, h = 450): string | null {
  if (!path) return null
  return `/api/plex/thumb?path=${encodeURIComponent(path)}&w=${w}&h=${h}`
}

function PosterCard({ item, showSeason = false }: { item: PlexMediaItem; showSeason?: boolean }) {
  const url = thumbUrl(item.thumb)
  const sub = showSeason && item.season ? `S${item.season}` : item.year ? String(item.year) : null

  return (
    <div className="flex flex-col gap-1.5 min-w-0">
      <div className="w-full aspect-[2/3] rounded-xl overflow-hidden bg-slate-800 relative">
        {url
          ? <img src={url} alt={item.title} className="w-full h-full object-cover" loading="lazy" />
          : <div className="w-full h-full flex items-center justify-center text-slate-600 text-3xl">🎬</div>
        }
        {item.rating != null && (
          <div className="absolute bottom-1 right-1 bg-black/70 rounded px-1 text-[8px] text-yellow-400 font-mono">
            ★{item.rating}
          </div>
        )}
      </div>
      <div>
        <div className="text-[10px] text-slate-200 leading-tight truncate font-medium">{item.title}</div>
        {sub && <div className="text-[9px] text-slate-500">{sub}</div>}
      </div>
    </div>
  )
}

function Section({ label, items, showSeason = false }: {
  label: string
  items: PlexMediaItem[]
  showSeason?: boolean
}) {
  if (items.length === 0) return null
  return (
    <div>
      <div className="text-[10px] font-semibold tracking-[0.15em] text-slate-500 uppercase mb-3">
        {label}
      </div>
      <div className="grid grid-cols-5 gap-3">
        {items.map((item, i) => (
          <PosterCard key={i} item={item} showSeason={showSeason} />
        ))}
      </div>
    </div>
  )
}

export function PlexDetailWidget({ data, error }: WidgetProps) {
  const prevRef = useRef<PlexData | null>(null)
  const pd = data as PlexData | null
  if (pd) prevRef.current = pd
  const d = pd ?? prevRef.current

  if (!d) {
    return (
      <div className="flex items-center justify-center p-8 text-slate-600">
        {error ? `Ошибка: ${error}` : 'Ожидание данных…'}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6 animate-fadeIn">

      <Section label="Фильмы · Последние" items={d.recent_movies.slice(0, 10)} />
      <Section label="Сериалы" items={d.recent_shows.slice(0, 10)} showSeason />

    </div>
  )
}
