import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { getDb, recordApiResult } from '../data/store'
import type { ApiServiceConfig } from '../data/types'

/**
 * Periyodik API çağrı servisi.
 * Ayarlar > API Çağrı Servisi'nde tanımlı ve "Etkin" olan her servis, kendi aralığında
 * (varsayılan 60 sn = 1 dk) çağrılır. Dönen JSON dizi (veya {items|data|records: [...]})
 * hedef tabloya (mail / zoom / iş) yazılır; her çağrı Çağrı Geçmişi'ne loglanır.
 *
 * Not: Bu zamanlayıcı tarayıcıda, uygulama açıkken çalışır. Üretimde aynı ayarlar
 * (api_poll_config tablosu) backend'deki zamanlanmış görev tarafından okunup çalıştırılmalıdır;
 * o durumda bu servis yalnız "Şimdi Çalıştır" ve geçmiş görüntüleme için kullanılır.
 */

interface PollerState {
  running: number[]                     // şu an çağrısı süren servisler
  runNow: (id: number) => Promise<void>
  nextRunAt: (cfg: ApiServiceConfig) => number | null
}

const PollerContext = createContext<PollerState>({ running: [], runNow: async () => {}, nextRunAt: () => null })
export const useApiPoller = () => useContext(PollerContext)

function buildHeaders(cfg: ApiServiceConfig): Record<string, string> {
  let headers: Record<string, string> = {}
  if (cfg.headers.trim()) {
    try { headers = JSON.parse(cfg.headers) } catch { throw new Error('Ek başlıklar geçerli JSON değil') }
  }
  if (cfg.auth_type === 'bearer' && cfg.auth_token) headers.Authorization = `Bearer ${cfg.auth_token}`
  if (cfg.auth_type === 'basic') headers.Authorization = `Basic ${btoa(`${cfg.username}:${cfg.password}`)}`
  if (cfg.auth_type === 'api_key' && cfg.auth_token) headers[cfg.auth_header || 'X-API-Key'] = cfg.auth_token
  if (cfg.method !== 'GET' && cfg.body.trim() && !headers['Content-Type']) headers['Content-Type'] = 'application/json'
  return headers
}

function extractRecords(json: unknown): unknown[] {
  if (Array.isArray(json)) return json
  if (json && typeof json === 'object') {
    const o = json as Record<string, unknown>
    for (const k of ['items', 'data', 'records', 'results', 'value'])
      if (Array.isArray(o[k])) return o[k] as unknown[]
  }
  return []
}

export async function callApi(cfg: ApiServiceConfig) {
  const started = Date.now()
  const startedAt = new Date(started).toISOString()
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), Math.max(1, cfg.timeout_sec) * 1000)
  const base = { config_id: cfg.id, config_name: cfg.name, started_at: startedAt }
  try {
    if (!cfg.url) throw new Error('URL tanımlı değil')
    const res = await fetch(cfg.url, {
      method: cfg.method, headers: buildHeaders(cfg), signal: ctrl.signal,
      body: cfg.method !== 'GET' && cfg.body.trim() ? cfg.body : undefined,
    })
    const text = await res.text()
    let json: unknown = null
    try { json = text ? JSON.parse(text) : null } catch { /* JSON değil */ }
    const records = res.ok ? extractRecords(json) : []
    recordApiResult(cfg, {
      ...base, duration_ms: Date.now() - started, http_status: res.status, ok: res.ok, record_count: 0,
      message: res.ok ? (json === null ? 'Cevap JSON değil' : `${records.length} kayıt alındı`) : `HTTP ${res.status} ${res.statusText}`,
    }, records)
  } catch (e) {
    const aborted = e instanceof DOMException && e.name === 'AbortError'
    recordApiResult(cfg, {
      ...base, duration_ms: Date.now() - started, http_status: null, ok: false, record_count: 0,
      message: aborted ? `Zaman aşımı (${cfg.timeout_sec} sn)` : e instanceof Error ? e.message : String(e),
    }, [])
  } finally {
    clearTimeout(timer)
  }
}

export function ApiPollerProvider({ children }: { children: ReactNode }) {
  const [running, setRunning] = useState<number[]>([])
  const inFlight = useRef(new Set<number>())

  const run = useCallback(async (cfg: ApiServiceConfig) => {
    if (inFlight.current.has(cfg.id)) return       // önceki çağrı bitmeden yenisi başlamaz
    inFlight.current.add(cfg.id)
    setRunning([...inFlight.current])
    try { await callApi(cfg) } finally {
      inFlight.current.delete(cfg.id)
      setRunning([...inFlight.current])
    }
  }, [])

  const nextRunAt = useCallback((cfg: ApiServiceConfig) => {
    if (!cfg.enabled) return null
    if (!cfg.last_run_at) return Date.now()
    return new Date(cfg.last_run_at).getTime() + Math.max(10, cfg.interval_sec) * 1000
  }, [])

  // Saniyede bir: süresi gelen etkin servisleri çalıştır. Ayar değişikliği anında devreye girer.
  useEffect(() => {
    const tick = () => {
      for (const cfg of getDb().apiConfigs) {
        const due = nextRunAt(cfg)
        if (due !== null && due <= Date.now()) void run(cfg)
      }
    }
    tick()
    const h = setInterval(tick, 1000)
    return () => clearInterval(h)
  }, [run, nextRunAt])

  const runNow = useCallback(async (id: number) => {
    const cfg = getDb().apiConfigs.find((c) => c.id === id)
    if (cfg) await run(cfg)
  }, [run])

  return <PollerContext.Provider value={{ running, runNow, nextRunAt }}>{children}</PollerContext.Provider>
}
