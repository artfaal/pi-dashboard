import { useRef } from 'react'
import type { TorrentData, TorrentItem, DiskInfo, WidgetProps } from '../types'

// ── helpers ─────────────────────────────────────────────────────────────────

function fmtSpeed(bps: number): string {
  if (bps >= 1024 * 1024) return `${(bps / 1024 / 1024).toFixed(1)}MB/s`
  if (bps >= 1024)        return `${(bps / 1024).toFixed(0)}KB/s`
  return `${bps}B/s`
}

function fmtSize(gb: number): string {
  if (gb >= 1024) return `${(gb / 1024).toFixed(1)}TB`
  return `${gb.toFixed(0)}GB`
}

function statusColor(status: TorrentItem['status']): string {
  switch (status) {
    case 'downloading': return '#3b82f6'  // blue
    case 'seeding':     return '#22c55e'  // green
    case 'checking':    return '#f59e0b'  // amber
    case 'error':       return '#ef4444'  // red
    default:            return '#64748b'  // slate
  }
}

function statusLabel(status: TorrentItem['status']): string {
  switch (status) {
    case 'downloading': return '↓'
    case 'seeding':     return '⇅'
    case 'checking':    return '⟳'
    case 'paused':      return '⏸'
    case 'error':       return '✕'
    default:            return '?'
  }
}

function diskColor(freeGb: number): string {
  if (freeGb < 5)   return '#ef4444'  // red
  if (freeGb < 20)  return '#38bdf8'  // sky
  if (freeGb > 100) return '#22c55e'  // green
  return '#64748b'                    // slate
}

// ── sub-components ───────────────────────────────────────────────────────────

function ActiveDownload({ t }: { t: TorrentItem }) {
  return (
    <div className="bg-blue-950/30 rounded-lg px-2.5 py-2 flex flex-col gap-1.5">
      <div className="text-[10px] text-slate-200 font-medium truncate leading-tight">
        {t.name}
      </div>
      {/* progress bar */}
      <div className="relative h-1.5 w-full rounded-full bg-slate-700 overflow-hidden">
        <div
          className="absolute top-0 left-0 h-full rounded-full bg-blue-500"
          style={{ width: `${t.progress}%` }}
        />
      </div>
      <div className="flex items-center justify-between text-[9px] font-mono">
        <span className="text-blue-400">↓ {fmtSpeed(t.download_speed_bps)}</span>
        <span className="text-slate-400">{t.progress}%</span>
        {t.eta_secs != null && (
          <span className="text-slate-500">{fmtEta(t.eta_secs)}</span>
        )}
      </div>
    </div>
  )
}

function fmtEta(secs: number): string {
  if (secs < 60)   return `${secs}s`
  if (secs < 3600) return `${Math.round(secs / 60)}m`
  return `${Math.floor(secs / 3600)}h ${Math.round((secs % 3600) / 60)}m`
}

function TorrentRow({ t }: { t: TorrentItem }) {
  const color = statusColor(t.status)
  return (
    <div className="flex items-center gap-1.5 min-w-0">
      <span className="text-[10px] shrink-0" style={{ color }}>{statusLabel(t.status)}</span>
      <span className="text-[10px] text-slate-300 truncate flex-1 leading-tight">{t.name}</span>
      {t.status === 'seeding' && (
        <span className="text-[9px] font-mono text-slate-500 shrink-0">
          ↑{fmtSpeed(t.upload_speed_bps)}
        </span>
      )}
    </div>
  )
}

function DiskRow({ d }: { d: DiskInfo }) {
  const color = diskColor(d.free_gb)
  const pct = Math.min(100, d.used_pct)
  return (
    <div className="flex items-center gap-2 min-w-0">
      <span className="text-[9px] text-slate-500 w-8 shrink-0">{d.name}</span>
      <div className="flex-1 relative h-1 rounded-full bg-slate-700 overflow-hidden">
        <div
          className="absolute top-0 left-0 h-full rounded-full"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      <span className="text-[9px] font-mono shrink-0" style={{ color }}>
        {fmtSize(d.free_gb)}
      </span>
    </div>
  )
}

// ── main widget ──────────────────────────────────────────────────────────────

export function TorrentWidget({ data, error }: WidgetProps) {
  const prevRef = useRef<TorrentData | null>(null)
  const td = data as TorrentData | null
  if (td) prevRef.current = td
  const d = td ?? prevRef.current

  if (!d) {
    return (
      <div className="flex flex-col h-full">
        <div className="text-[10px] font-semibold tracking-[0.15em] text-slate-500 uppercase">
          Торренты
        </div>
        <div className="flex-1 flex items-center justify-center text-slate-600 text-sm">
          {error ? `Ошибка: ${error}` : 'Ожидание данных…'}
        </div>
      </div>
    )
  }

  const others = d.recent.filter(t => t.status !== 'downloading').slice(0, 4)

  return (
    <div className="flex flex-col gap-2 h-full animate-fadeIn">

      {/* header */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold tracking-[0.15em] text-slate-500 uppercase">
          Торренты
        </span>
        {d.speed.download_bps > 0 && (
          <span className="text-[9px] font-mono text-blue-400">
            ↓ {fmtSpeed(d.speed.download_bps)}
          </span>
        )}
      </div>

      {/* active download */}
      {d.downloading && <ActiveDownload t={d.downloading} />}

      {/* recent list */}
      {others.length > 0 && (
        <div className="flex flex-col gap-1 flex-1 min-h-0 overflow-hidden">
          {others.map(t => <TorrentRow key={t.id} t={t} />)}
        </div>
      )}

      {/* disk space */}
      {d.disks.length > 0 && (
        <div className="flex flex-col gap-1 border-t border-white/[0.05] pt-2">
          {d.disks.map(disk => <DiskRow key={disk.name} d={disk} />)}
        </div>
      )}
    </div>
  )
}
