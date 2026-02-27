import { useRef } from 'react'
import type { PlexData, PlexMediaItem, WidgetProps } from '../types'

function thumbUrl(path: string | null, w = 300, h = 450): string | null {
  if (!path) return null
  return `/api/plex/thumb?path=${encodeURIComponent(path)}&w=${w}&h=${h}`
}

function PosterCell({ item, badge }: { item: PlexMediaItem; badge?: string }) {
  const url = thumbUrl(item.thumb)
  return (
    <div className="relative rounded-xl overflow-hidden bg-slate-800 w-full h-full">
      {url
        ? <img src={url} alt={item.title} className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
        : <div className="absolute inset-0 flex items-center justify-center text-slate-600 text-2xl">?</div>
      }
      {/* gradient overlay снизу */}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent pt-6 pb-1.5 px-1.5">
        <div className="text-[9px] text-white font-medium leading-tight line-clamp-2">{item.title}</div>
        {item.year && <div className="text-[8px] text-white/50 mt-0.5">{item.year}</div>}
      </div>
      {badge && (
        <div className="absolute top-1.5 left-1.5 bg-black/60 rounded px-1 text-[7px] text-slate-300 font-mono uppercase">
          {badge}
        </div>
      )}
      {item.rating != null && (
        <div className="absolute top-1.5 right-1.5 bg-black/60 rounded px-1 text-[7px] text-yellow-400 font-mono">
          ★{item.rating}
        </div>
      )}
    </div>
  )
}

export function PlexWidget({ data, error }: WidgetProps) {
  const prevRef = useRef<PlexData | null>(null)
  const pd = data as PlexData | null
  if (pd) prevRef.current = pd
  const d = pd ?? prevRef.current

  if (!d) {
    return (
      <div className="flex flex-col h-full">
        <div className="text-[10px] font-semibold tracking-[0.15em] text-slate-500 uppercase">Plex</div>
        <div className="flex-1 flex items-center justify-center text-slate-600 text-sm">
          {error ? `Ошибка: ${error}` : 'Ожидание данных…'}
        </div>
      </div>
    )
  }

  const movies = d.recent_movies.slice(0, 2)
  const shows  = d.recent_shows.slice(0, 2)

  return (
    <div className="flex flex-col h-full gap-1.5 animate-fadeIn">

      {/* header */}
      <div className="flex items-center gap-3 shrink-0">
        <span className="text-[10px] font-semibold tracking-[0.15em] text-slate-500 uppercase">Plex</span>
        <span className="text-[8px] text-slate-600">Фильмы</span>
        <span className="text-[8px] text-slate-700">·</span>
        <span className="text-[8px] text-slate-600">Сериалы</span>
      </div>

      {/* 4 постера в ряд, заполняют оставшуюся высоту */}
      <div className="flex-1 grid grid-cols-4 gap-2 min-h-0">
        {movies.map((m, i) => (
          <PosterCell key={`m${i}`} item={m} />
        ))}
        {shows.map((s, i) => (
          <PosterCell key={`s${i}`} item={s} badge={s.season ? `S${s.season}` : undefined} />
        ))}
      </div>

    </div>
  )
}
