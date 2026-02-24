import { useRef } from 'react'
import type { TorrentData, TorrentItem, DiskInfo, WidgetProps } from '../types'

// ── helpers ──────────────────────────────────────────────────────────────────

function fmtSpeed(bps: number): string {
  if (bps >= 1024 * 1024) return `${(bps / 1024 / 1024).toFixed(1)} MB/s`
  if (bps >= 1024)        return `${(bps / 1024).toFixed(0)} KB/s`
  return `${bps} B/s`
}

function fmtSize(bytes: number): string {
  const gb = bytes / 1024 / 1024 / 1024
  if (gb >= 1)    return `${gb.toFixed(1)} GB`
  const mb = bytes / 1024 / 1024
  if (mb >= 1)    return `${mb.toFixed(0)} MB`
  return `${(bytes / 1024).toFixed(0)} KB`
}

function fmtSizeGb(gb: number): string {
  if (gb >= 1024) return `${(gb / 1024).toFixed(1)} TB`
  return `${gb.toFixed(0)} GB`
}

function fmtEta(secs: number): string {
  if (secs < 60)    return `${secs}с`
  if (secs < 3600)  return `${Math.round(secs / 60)}мин`
  const h = Math.floor(secs / 3600)
  const m = Math.round((secs % 3600) / 60)
  return m > 0 ? `${h}ч ${m}мин` : `${h}ч`
}

function statusColor(status: TorrentItem['status']): string {
  switch (status) {
    case 'downloading': return '#3b82f6'
    case 'seeding':     return '#22c55e'
    case 'checking':    return '#f59e0b'
    case 'error':       return '#ef4444'
    default:            return '#64748b'
  }
}

function statusLabel(status: TorrentItem['status']): string {
  switch (status) {
    case 'downloading': return 'Загрузка'
    case 'seeding':     return 'Раздача'
    case 'checking':    return 'Проверка'
    case 'paused':      return 'Пауза'
    case 'error':       return 'Ошибка'
    default:            return '—'
  }
}

function diskColor(freeGb: number): string {
  if (freeGb < 5)   return '#ef4444'
  if (freeGb < 20)  return '#38bdf8'
  if (freeGb > 100) return '#22c55e'
  return '#64748b'
}

// ── Active download (big card) ───────────────────────────────────────────────

function ActiveCard({ t, dlSpeed, ulSpeed }: { t: TorrentItem; dlSpeed: number; ulSpeed: number }) {
  return (
    <div className="bg-blue-950/40 border border-blue-500/20 rounded-xl p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="text-sm text-slate-100 font-semibold leading-snug flex-1 min-w-0">
          {t.name}
        </div>
        <span className="text-xs text-blue-400 font-mono shrink-0">{t.progress}%</span>
      </div>

      {/* progress bar */}
      <div className="relative h-2 w-full rounded-full bg-slate-700 overflow-hidden">
        <div
          className="absolute top-0 left-0 h-full rounded-full bg-blue-500 transition-all duration-500"
          style={{ width: `${t.progress}%` }}
        />
      </div>

      {/* speeds + ETA */}
      <div className="flex items-center justify-between text-xs font-mono">
        <div className="flex items-center gap-4">
          <span className="text-blue-400">↓ {fmtSpeed(dlSpeed)}</span>
          {ulSpeed > 0 && <span className="text-slate-500">↑ {fmtSpeed(ulSpeed)}</span>}
        </div>
        <div className="flex items-center gap-3 text-slate-500">
          {t.eta_secs != null && <span>ETA {fmtEta(t.eta_secs)}</span>}
          <span>{fmtSize(t.size_bytes)}</span>
          {t.peers > 0 && <span>👥 {t.peers}</span>}
        </div>
      </div>
    </div>
  )
}

// ── Torrent list row ─────────────────────────────────────────────────────────

function TorrentRow({ t }: { t: TorrentItem }) {
  const color = statusColor(t.status)
  return (
    <div className="flex items-center gap-3 py-1.5 border-b border-white/[0.04] min-w-0">
      {/* status dot */}
      <div
        className="w-1.5 h-1.5 rounded-full shrink-0"
        style={{ backgroundColor: color }}
      />
      {/* name */}
      <span className="flex-1 text-xs text-slate-300 truncate leading-tight">
        {t.name}
      </span>
      {/* right info */}
      <div className="flex items-center gap-2 shrink-0">
        {t.status === 'downloading' && (
          <>
            <div className="w-16 relative h-1 rounded-full bg-slate-700 overflow-hidden">
              <div
                className="absolute top-0 left-0 h-full rounded-full bg-blue-500"
                style={{ width: `${t.progress}%` }}
              />
            </div>
            <span className="text-[10px] font-mono text-blue-400 w-10 text-right">
              {t.progress}%
            </span>
          </>
        )}
        <span className="text-[10px] font-mono w-14 text-right" style={{ color }}>
          {statusLabel(t.status)}
        </span>
      </div>
    </div>
  )
}

// ── Disk info ────────────────────────────────────────────────────────────────

function DiskCard({ d }: { d: DiskInfo }) {
  const color = diskColor(d.free_gb)
  const pct = Math.min(100, d.used_pct)
  return (
    <div className="flex items-center gap-3 min-w-0">
      <span className="text-xs text-slate-400 w-10 shrink-0 font-medium">{d.name}</span>
      <div className="flex-1 relative h-2 rounded-full bg-slate-700 overflow-hidden">
        <div
          className="absolute top-0 left-0 h-full rounded-full"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      <span className="text-xs font-mono shrink-0" style={{ color }}>
        {fmtSizeGb(d.free_gb)} свободно
      </span>
      <span className="text-[10px] text-slate-600 shrink-0">
        {fmtSizeGb(d.total_gb)}
      </span>
    </div>
  )
}

// ── main ─────────────────────────────────────────────────────────────────────

export function TorrentDetailWidget({ data, error }: WidgetProps) {
  const prevRef = useRef<TorrentData | null>(null)
  const td = data as TorrentData | null
  if (td) prevRef.current = td
  const d = td ?? prevRef.current

  if (!d) {
    return (
      <div className="flex flex-col h-full items-center justify-center text-slate-600 text-sm">
        {error ? `Ошибка: ${error}` : 'Ожидание данных…'}
      </div>
    )
  }

  // Сортировка: downloading → seeding → остальные
  const sortedRecent = [...d.recent].sort((a, b) => {
    const order = { downloading: 0, checking: 1, seeding: 2, paused: 3, error: 4, unknown: 5 }
    return (order[a.status] ?? 5) - (order[b.status] ?? 5)
  })

  return (
    <div className="flex flex-col gap-4 animate-fadeIn">

      {/* Active download */}
      {d.downloading ? (
        <ActiveCard
          t={d.downloading}
          dlSpeed={d.speed.download_bps}
          ulSpeed={d.speed.upload_bps}
        />
      ) : (
        <div className="bg-slate-800/40 rounded-xl px-4 py-3 flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-slate-600" />
          <span className="text-xs text-slate-500">Нет активных загрузок</span>
          {d.speed.upload_bps > 0 && (
            <span className="text-xs font-mono text-slate-500 ml-auto">
              ↑ {fmtSpeed(d.speed.upload_bps)}
            </span>
          )}
        </div>
      )}

      {/* Torrent list */}
      <div className="flex flex-col">
        <div className="text-[10px] font-semibold tracking-[0.15em] text-slate-500 uppercase mb-1">
          Последние {d.recent.length} торрентов
        </div>
        {sortedRecent.map(t => <TorrentRow key={t.id} t={t} />)}
      </div>

      {/* Disk space */}
      {d.disks.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="text-[10px] font-semibold tracking-[0.15em] text-slate-500 uppercase">
            Место на диске
          </div>
          {d.disks.map(disk => <DiskCard key={disk.name} d={disk} />)}
        </div>
      )}

    </div>
  )
}
