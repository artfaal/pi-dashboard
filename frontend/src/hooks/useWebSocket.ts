import { useEffect, useRef, useState } from 'react'
import type { ModulePayload } from '../types'

type DataMap = Record<string, ModulePayload>

const RECONNECT_DELAY_MS = 3000

export function useWebSocket(url: string) {
  const [data, setData] = useState<DataMap>({})
  const [connected, setConnected] = useState(false)
  const cancelledRef = useRef(false)
  const wsRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    cancelledRef.current = false

    function connect() {
      if (cancelledRef.current) return

      const ws = new WebSocket(url)
      wsRef.current = ws

      ws.onopen = () => {
        setConnected(true)
        console.info('[WS] connected to', url)
      }

      ws.onmessage = (event: MessageEvent) => {
        try {
          const payload = JSON.parse(event.data as string) as ModulePayload
          setData((prev) => ({ ...prev, [payload.module]: payload }))
        } catch (err) {
          console.warn('[WS] failed to parse message', err)
        }
      }

      ws.onclose = () => {
        setConnected(false)
        if (!cancelledRef.current) {
          console.info(`[WS] disconnected — reconnecting in ${RECONNECT_DELAY_MS}ms`)
          setTimeout(connect, RECONNECT_DELAY_MS)
        }
      }

      ws.onerror = () => {
        // onclose will fire after onerror and handle reconnect
        ws.close()
      }
    }

    connect()

    return () => {
      cancelledRef.current = true
      wsRef.current?.close()
    }
  }, [url])

  return { connected, data }
}
