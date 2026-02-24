import { useRef } from 'react'
import type { ProxyData, ProxyEntry, WidgetProps } from '../types'

const TYPE_LABELS: Record<string, string> = {
  socks5: 'SOCKS5',
  http:   'HTTP',
  https:  'HTTPS',
  ss:     'SS',
  trojan: 'Trojan',
}

function proxyColor(entry: ProxyEntry): string {
  if (!entry.ok) return '#ef4444'
  const ms = entry.ms ?? 9999
  if (ms < 300)  return '#22c55e'
  if (ms < 800)  return '#eab308'
  return '#f97316'
}

function ProxyRow({ entry }: { entry: ProxyEntry }) {
  const color = proxyColor(entry)
  const badge = TYPE_LABELS[entry.type] ?? entry.type
  const isTcpOnly = entry.type === 'ss' || entry.type === 'trojan'

  return (
    <div className="flex items-center gap-2 py-1">
      <div
        className="w-2 h-2 rounded-full shrink-0"
        style={{ backgroundColor: color, boxShadow: `0 0 6px ${color}` }}
      />
      <span className="text-slate-300 text-xs w-20 truncate">{entry.name}</span>
      <span className="text-[9px] text-slate-600 px-1 py-0.5 bg-white/[0.04] rounded font-mono">
        {badge}
      </span>
      <span className="ml-auto font-mono text-xs tabular-nums" style={{ color }}>
        {entry.ok
          ? (entry.ms != null ? `${entry.ms}ms` : '—')
          : 'fail'
        }
        {isTcpOnly && entry.ok && (
          <span className="text-slate-600 text-[9px] ml-1">tcp</span>
        )}
      </span>
    </div>
  )
}

export function ProxyWidget({ data, error }: WidgetProps) {
  const prevRef = useRef<ProxyData | null>(null)
  const d = data as ProxyData | null
  if (d) prevRef.current = d
  const pd = d ?? prevRef.current

  if (!pd) {
    return (
      <div className="flex flex-col h-full">
        <div className="text-[10px] font-semibold tracking-[0.15em] text-slate-500 uppercase">Proxy / VPN</div>
        <div className="flex-1 flex items-center justify-center text-slate-600 text-sm">
          {error ? `Ошибка: ${error}` : 'Ожидание…'}
        </div>
      </div>
    )
  }

  const okCount = pd.proxies.filter((p) => p.ok).length
  const total   = pd.proxies.length
  const overall = pd.ok

  return (
    <div className="flex flex-col h-full gap-2 animate-fadeIn">

      <div className="flex items-center justify-between">
        <div className="text-[10px] font-semibold tracking-[0.15em] text-slate-500 uppercase">
          Proxy / VPN
        </div>
        <span
          className="text-[10px] font-mono"
          style={{ color: overall ? '#22c55e' : '#ef4444' }}
        >
          {okCount}/{total}
        </span>
      </div>

      <div className="flex flex-col divide-y divide-white/[0.04] flex-1">
        {pd.proxies.map((p) => <ProxyRow key={p.name} entry={p} />)}
      </div>

    </div>
  )
}
