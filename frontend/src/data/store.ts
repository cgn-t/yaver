import { useSyncExternalStore } from 'react'
import { enqueueSnackbar } from 'notistack'
import { DEFAULT_GENERAL, DEFAULT_LDAP, newApiConfig, seedApiConfigs, seedData } from './seed'
import type {
  Activity, ApiCallLog, ApiServiceConfig, Email, GeneralConfig, KeywordRule, LdapConfig, Meeting, Priority, SourceType,
  WorkItem, WorkStatus,
} from './types'
import { DEFAULT_KEYWORD_RULES } from './groups'

/**
 * Önyüz veri katmanı — iki modda çalışır:
 *  - 'api'  : Yaver sunucusu (server/) erişilebilir → veri PostgreSQL'den gelir (GET /api/state),
 *             her değişiklik ilgili /api ucuna gönderilir. Ekran anında güncellenir (iyimser),
 *             ardından sunucudaki gerçek durum yeniden okunur.
 *  - 'local': Sunucu yoksa (ör. yalnız `npm run dev`) veri tarayıcıda (localStorage) tutulur — demo modu.
 * Sayfalar yalnız useDb() + aksiyon fonksiyonlarını kullandığı için iki modda da aynı çalışır.
 */

export interface Db {
  items: WorkItem[]
  emails: Email[]
  meetings: Meeting[]
  activities: Activity[]
  apiConfigs: ApiServiceConfig[]
  apiLogs: ApiCallLog[]
  ldap: LdapConfig
  general: GeneralConfig
  keywordRules?: KeywordRule[]   // sunucu modunda keyword_rule tablosundan
}

export const rulesOf = (d: Db) => (d.keywordRules?.length ? d.keywordRules : DEFAULT_KEYWORD_RULES)

const KEY = 'yaver_db_v2'
const MAX_LOGS = 500

function initial(): Db {
  const s = seedData()
  return {
    items: s.items, emails: s.emails, meetings: s.meetings, activities: s.activities,
    apiConfigs: seedApiConfigs(), apiLogs: [], ldap: DEFAULT_LDAP, general: DEFAULT_GENERAL,
  }
}

function load(): Db {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return { ...initial(), ...JSON.parse(raw) }
  } catch { /* bozuk kayıt → baştan */ }
  return initial()
}

// ---------- Mod / sunucu bağlantısı ----------
export type Backend = 'api' | 'local'
export let backend: Backend = 'local'
/** Sunucu açık ama veritabanı hazır değilse nedeni (giriş ekranında gösterilir) */
export let dbWaiting: string | null = null
const TOKEN_KEY = 'yaver_token'
export const getToken = () => localStorage.getItem(TOKEN_KEY)

const EMPTY: Db = { items: [], emails: [], meetings: [], activities: [], apiConfigs: [], apiLogs: [], ldap: DEFAULT_LDAP, general: DEFAULT_GENERAL }

/** Açılışta bir kez: sunucu varsa API moduna geç ve (oturum varsa) veriyi yükle. */
export async function initBackend() {
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 2500)
    const res = await fetch('/api/health', { signal: ctrl.signal })
    clearTimeout(t)
    // 503 de olsa mode:'db' dönüyorsa sunucu var demektir (DB henüz hazır değil) → demo moduna düşme
    const d = await res.json().catch(() => null)
    if (d?.mode === 'db') backend = 'api'
    if (d?.mode === 'db' && !d.ok) dbWaiting = d.detail ?? 'veritabanı bekleniyor'
  } catch { /* sunucu yok → demo modu */ }
  if (backend === 'api') {
    db = EMPTY
    if (getToken()) await refresh().catch(() => {})
  }
}

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) { super(message); this.status = status }
}

/** Oturum token'ı ile /api çağrısı. 401 → oturumu kapatıp giriş ekranına döner. */
export async function apiFetch<T = unknown>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: init.method ?? 'GET',
    headers: { 'Content-Type': 'application/json', ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}) },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  })
  if (res.status === 401 && path !== '/auth/login') {
    clearSession()
    if (location.pathname !== '/login') location.assign('/login')
  }
  const text = await res.text()
  const data = text ? JSON.parse(text) : null
  if (!res.ok) throw new ApiError(data?.detail ?? `HTTP ${res.status}`, res.status)
  return data as T
}

export function setSession(token: string) { localStorage.setItem(TOKEN_KEY, token) }
export function clearSession() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem('yaver_username')
  localStorage.removeItem('yaver_fullname')
  if (backend === 'api') { db = EMPTY; listeners.forEach((l) => l()) }
}

/** Sunucudaki güncel durumu okur (API modunda; periyodik olarak da çağrılır). */
export async function refresh() {
  if (backend !== 'api') return
  const next = await apiFetch<Db>('/state')
  db = next
  listeners.forEach((l) => l())
}

/** İyimser güncellemeden sonra sunucu çağrısını yapar, sonra gerçek durumu yeniden okur. Hata → mesaj + geri al. */
async function sync<T>(call: () => Promise<T>): Promise<T | undefined> {
  try {
    return await call()
  } catch (e) {
    enqueueSnackbar(e instanceof Error ? e.message : 'Sunucu hatası', { variant: 'error' })
    return undefined
  } finally {
    await refresh().catch(() => {})
  }
}

let db: Db = load()
const listeners = new Set<() => void>()

function commit(next: Db) {
  db = next
  if (backend === 'local') {
    try { localStorage.setItem(KEY, JSON.stringify(db)) } catch { /* depolama dolu: yalnız bellekte */ }
  }
  listeners.forEach((l) => l())
}

export function useDb(): Db {
  return useSyncExternalStore((cb) => { listeners.add(cb); return () => listeners.delete(cb) }, () => db)
}
export const getDb = () => db

export async function resetDemoData() {
  if (backend === 'api') { await sync(() => apiFetch('/admin/reset-demo', { method: 'POST' })); return }
  commit({ ...initial(), ldap: db.ldap, general: db.general, apiConfigs: db.apiConfigs })
}

// ---------- Toplu mail (bulk-send-mail) ----------
export interface BulkResult { count: number; interpreted: boolean; work_items: WorkItem[] }

/** Sunucuya örnek mailler gönderir: her biri mail + iş + ajan yorumu olarak eklenir. Demo modunda tarayıcıda eklenir. */
export async function bulkSendMail(count = 5): Promise<BulkResult | undefined> {
  if (backend === 'api') {
    const r = await sync(() => apiFetch<BulkResult>('/bulk-send-mail', { method: 'POST', body: { count } }))
    if (r) enqueueSnackbar(`${r.count} mail eklendi${r.interpreted ? ', ajan yorumları yazıldı' : ''}`, { variant: 'success' })
    return r
  }
  const SAMPLES: [string, string, string][] = [
    ['Hakan Erdem', 'Ödeme kanalında MQ kuyrukları doluyor', 'Acil: PAYMENT.IN kuyruğu dolmuş, işlemler beklemede.'],
    ['Selin Koç', 'OpenShift prod cluster upgrade planı', 'Upgrade için bakım penceresi ve geri dönüş planı rica ederim.'],
    ['Murat Aydın', 'RHEL 7 sunucuların server upgrade takvimi', 'Destek süresi biten sunucular için OS upgrade takvimi.'],
    ['Burak Çetin', 'Release pipeline failed', 'Mobil backend release pipeline build adımında failed oluyor.'],
  ]
  const made: WorkItem[] = []
  for (let i = 0; i < count; i++) {
    const [who, title, desc] = SAMPLES[i % SAMPLES.length]
    made.push(createWorkItemLocal({ title, description: desc, priority: 'normal', category: 'Talep', assignee: null, due_date: null,
                                    source_type: 'mail', requester: who }))
  }
  enqueueSnackbar(`${count} örnek mail eklendi (demo modu)`, { variant: 'success' })
  return { count, interpreted: false, work_items: made }
}

/** TFS Kanban / Jira kalemlerini içe aktarır (örnek: count adet). */
export async function bulkImportTickets(count = 4): Promise<BulkResult | undefined> {
  if (backend === 'api') {
    const r = await sync(() => apiFetch<BulkResult>('/bulk-import', { method: 'POST', body: { count } }))
    if (r) enqueueSnackbar(`${r.count} TFS / Jira kalemi eklendi${r.interpreted ? ', ajan yorumları yazıldı' : ''}`, { variant: 'success' })
    return r
  }
  const SAMPLES: [SourceType, string, string, string][] = [
    ['tfs', 'Burak Çetin', 'Ödeme servisi deploy pipeline\'ı helm adımında failed', 'Kanban kartı: helm upgrade timeout.'],
    ['jira', 'Deniz Arslan', 'MQ QMGR_PROD2 sertifika yenilemesi', 'TLS sertifikası 14 gün içinde bitiyor.'],
    ['jira', 'Murat Aydın', 'Legacy FTP sunucusunun decom edilmesi', 'Decom öncesi bağımlılık analizi.'],
    ['tfs', 'Gizem Yıldız', 'Ödeme platformu 3.8 release hazırlığı', 'Sprint release kartı, deploy penceresi talebi.'],
  ]
  const made: WorkItem[] = []
  for (let i = 0; i < count; i++) {
    const [src, who, title, desc] = SAMPLES[i % SAMPLES.length]
    made.push(createWorkItemLocal({ title, description: desc, priority: 'normal', category: src === 'tfs' ? 'Kanban' : 'Jira', assignee: null, due_date: null,
                                    source_type: src, requester: who }))
  }
  enqueueSnackbar(`${count} örnek TFS / Jira kalemi eklendi (demo modu)`, { variant: 'success' })
  return { count, interpreted: false, work_items: made }
}

/** Ajanın örnek yorumlayıcısını bu iş için yeniden çalıştırır (yalnız sunucu modunda). */
export async function reinterpret(id: number) {
  if (backend !== 'api') return
  await sync(() => apiFetch(`/work-items/${id}/interpret`, { method: 'POST' }))
}

const now = () => new Date().toISOString()
const nextId = (rows: { id: number }[]) => rows.reduce((m, r) => Math.max(m, r.id), 0) + 1
const currentUser = () => localStorage.getItem('yaver_username') ?? 'admin'

function addActivity(acts: Activity[], work_item_id: number, action: Activity['action'], text: string): Activity[] {
  return [...acts, { id: nextId(acts), work_item_id, at: now(), actor: currentUser(), action, text }]
}

// ---------- İş kalemleri ----------
export const STATUS_LABEL: Record<WorkStatus, string> = {
  new: 'Yeni', in_progress: 'Devam Ediyor', waiting: 'Beklemede', done: 'Tamamlandı', cancelled: 'İptal',
}
export const STATUS_COLOR: Record<WorkStatus, 'info' | 'primary' | 'warning' | 'success' | 'default'> = {
  new: 'info', in_progress: 'primary', waiting: 'warning', done: 'success', cancelled: 'default',
}
export const PRIORITY_LABEL: Record<Priority, string> = { low: 'Düşük', normal: 'Normal', high: 'Yüksek', critical: 'Kritik' }
export const PRIORITY_COLOR: Record<Priority, string> = { low: '#9A9EA8', normal: '#2E90FA', high: '#F79009', critical: '#F04438' }
export const STATUS_HEX: Record<WorkStatus, string> = { new: '#2E90FA', in_progress: '#DC0005', waiting: '#F79009', done: '#12B76A', cancelled: '#9A9EA8' }
export const STATUS_ORDER: WorkStatus[] = ['new', 'in_progress', 'waiting', 'done', 'cancelled']
export const SOURCE_LABEL: Record<SourceType, string> = { mail: 'E-posta', zoom: 'Zoom', tfs: 'TFS Kanban', jira: 'Jira', manual: 'Manuel', api: 'API' }

export const isOpen = (w: WorkItem) => w.status !== 'done' && w.status !== 'cancelled'
export const isOverdue = (w: WorkItem) => isOpen(w) && !!w.due_date && w.due_date < new Date().toISOString().slice(0, 10)

export type NewWorkItem = Pick<WorkItem, 'title' | 'description' | 'priority' | 'category' | 'assignee' | 'due_date'> & {
  source_type?: SourceType; source_id?: number | null; requester?: string | null; tags?: string[]
}

export async function createWorkItem(input: NewWorkItem): Promise<WorkItem> {
  const local = createWorkItemLocal(input)
  if (backend !== 'api') return local
  return (await sync(() => apiFetch<WorkItem>('/work-items', { method: 'POST', body: input }))) ?? local
}

function createWorkItemLocal(input: NewWorkItem): WorkItem {
  const id = nextId(db.items)
  const item: WorkItem = {
    id, code: `YVR-${1000 + id}`, title: input.title, description: input.description,
    source_type: input.source_type ?? 'manual', source_id: input.source_id ?? null,
    status: 'new', priority: input.priority, category: input.category, assignee: input.assignee || null,
    requester: input.requester ?? currentUser(), due_date: input.due_date || null, tags: input.tags ?? [],
    created_at: now(), updated_at: now(), closed_at: null,
  }
  let emails = db.emails
  let meetings = db.meetings
  if (item.source_type === 'mail' && item.source_id)
    emails = emails.map((e) => (e.id === item.source_id ? { ...e, work_item_id: id } : e))
  if (item.source_type === 'zoom' && item.source_id)
    meetings = meetings.map((m) => (m.id === item.source_id ? { ...m, work_item_id: m.work_item_id ?? id } : m))
  commit({ ...db, items: [item, ...db.items], emails, meetings,
           activities: addActivity(db.activities, id, 'created', 'Kayıt oluşturuldu') })
  return item
}

// Tamamlandı'ya geçişte çözüm açıklaması zorunlu: arayüz diyaloğu açar, onaylanınca aynı patch resolution ile tekrar gönderilir.
type ResolutionRequest = { item: WorkItem; patch: Partial<WorkItem> }
let resolutionListener: ((r: ResolutionRequest | null) => void) | null = null
export function onResolutionRequest(fn: (r: ResolutionRequest | null) => void) {
  resolutionListener = fn
  return () => { if (resolutionListener === fn) resolutionListener = null }
}

export function updateWorkItem(id: number, patch: Partial<WorkItem>) {
  const cur = db.items.find((w) => w.id === id)
  if (cur && patch.status === 'done' && cur.status !== 'done' && !patch.resolution?.trim() && !cur.resolution && resolutionListener) {
    resolutionListener({ item: cur, patch })
    return
  }
  if (backend === 'api') void sync(() => apiFetch(`/work-items/${id}`, { method: 'PATCH', body: patch }))
  const old = db.items.find((w) => w.id === id)
  if (!old) return
  let acts = db.activities
  if (patch.status && patch.status !== old.status)
    acts = addActivity(acts, id, 'status', `Durum: ${STATUS_LABEL[old.status]} → ${STATUS_LABEL[patch.status]}`)
  if (patch.assignee !== undefined && patch.assignee !== old.assignee)
    acts = addActivity(acts, id, 'assign', `Atanan: ${patch.assignee || '—'}`)
  if (patch.priority && patch.priority !== old.priority)
    acts = addActivity(acts, id, 'priority', `Öncelik: ${PRIORITY_LABEL[patch.priority]}`)
  if (patch.resolution && patch.resolution !== old.resolution) {
    acts = addActivity(acts, id, 'comment', `**Çözüm:** ${patch.resolution}`)
    patch = { ...patch, resolved_at: now(), resolved_by: patch.resolved_by ?? currentUser() }
  }
  const closing = patch.status && (patch.status === 'done' || patch.status === 'cancelled')
  const next = { ...old, ...patch, updated_at: now(),
                 closed_at: patch.status ? (closing ? now() : null) : old.closed_at }
  commit({ ...db, items: db.items.map((w) => (w.id === id ? next : w)), activities: acts })
}

export function addComment(id: number, text: string) {
  if (backend === 'api') void sync(() => apiFetch(`/work-items/${id}/comments`, { method: 'POST', body: { text } }))
  commit({ ...db, activities: addActivity(db.activities, id, 'comment', text),
           items: db.items.map((w) => (w.id === id ? { ...w, updated_at: now() } : w)) })
}

// ---------- Mail / Zoom ----------
export function markEmailRead(id: number, is_read = true) {
  if (backend === 'api') void sync(() => apiFetch(`/emails/${id}`, { method: 'PATCH', body: { is_read } }))
  commit({ ...db, emails: db.emails.map((e) => (e.id === id ? { ...e, is_read } : e)) })
}
export function updateMeeting(id: number, patch: Partial<Meeting>) {
  if (backend === 'api') void sync(() => apiFetch(`/meetings/${id}`, { method: 'PATCH', body: patch }))
  commit({ ...db, meetings: db.meetings.map((m) => (m.id === id ? { ...m, ...patch } : m)) })
}

// ---------- Ayarlar ----------
export function saveLdap(ldap: LdapConfig) {
  if (backend === 'api') void sync(() => apiFetch('/settings/ldap', { method: 'PUT', body: ldap }))
  commit({ ...db, ldap })
}
export function saveGeneral(general: GeneralConfig) {
  if (backend === 'api') void sync(() => apiFetch('/settings/general', { method: 'PUT', body: general }))
  commit({ ...db, general })
}
export function saveApiConfig(cfg: ApiServiceConfig) {
  if (backend === 'api') void sync(() => apiFetch(`/settings/api-services/${cfg.id}`, { method: 'PUT', body: cfg }))
  const exists = db.apiConfigs.some((c) => c.id === cfg.id)
  commit({ ...db, apiConfigs: exists ? db.apiConfigs.map((c) => (c.id === cfg.id ? cfg : c)) : [...db.apiConfigs, cfg] })
}
export async function addApiConfig(): Promise<ApiServiceConfig> {
  if (backend === 'api') {
    const created = await sync(() => apiFetch<ApiServiceConfig>('/settings/api-services', { method: 'POST', body: newApiConfig(0) }))
    if (created) return created
  }
  const cfg = newApiConfig(nextId(db.apiConfigs))
  commit({ ...db, apiConfigs: [...db.apiConfigs, cfg] })
  return cfg
}
export function deleteApiConfig(id: number) {
  if (backend === 'api') void sync(() => apiFetch(`/settings/api-services/${id}`, { method: 'DELETE' }))
  commit({ ...db, apiConfigs: db.apiConfigs.filter((c) => c.id !== id) })
}
export function clearApiLogs() {
  if (backend === 'api') void sync(() => apiFetch('/settings/api-logs', { method: 'DELETE' }))
  commit({ ...db, apiLogs: [] })
}

/** "Şimdi çalıştır" — API modunda çağrıyı sunucu yapar (tarayıcının CORS/ağ kısıtı olmadan). */
export async function runApiServiceOnServer(id: number) {
  await sync(() => apiFetch(`/settings/api-services/${id}/run`, { method: 'POST' }))
}

/** API servisinden dönen kayıtları ilgili tabloya yazar (çift kayıt: dış anahtar ile engellenir). */
export function recordApiResult(cfg: ApiServiceConfig, log: Omit<ApiCallLog, 'id'>, records: unknown[]) {
  let { items, emails, meetings } = db
  let imported = 0
  for (const r of records) {
    if (!r || typeof r !== 'object') continue
    const o = r as Record<string, unknown>
    if (cfg.target === 'mail') {
      const mid = String(o.message_id ?? o.id ?? '')
      if (!mid || emails.some((e) => e.message_id === mid)) continue
      emails = [{ id: nextId(emails), message_id: mid, thread_id: (o.thread_id as string) ?? null, mailbox: String(o.mailbox ?? db.general.mailbox),
        from_address: String(o.from_address ?? o.from ?? ''), from_name: String(o.from_name ?? o.from ?? ''),
        to_addresses: (o.to_addresses as string[]) ?? [], cc_addresses: (o.cc_addresses as string[]) ?? [],
        subject: String(o.subject ?? '(konu yok)'), body_preview: String(o.body_preview ?? o.body ?? '').slice(0, 500),
        importance: (o.importance as Email['importance']) ?? 'normal', has_attachments: !!o.has_attachments,
        received_at: String(o.received_at ?? now()), is_read: false, work_item_id: null }, ...emails]
      imported++
    } else if (cfg.target === 'zoom') {
      const zid = String(o.zoom_meeting_id ?? o.id ?? '')
      if (!zid || meetings.some((m) => m.zoom_meeting_id === zid)) continue
      meetings = [{ id: nextId(meetings), zoom_meeting_id: zid, zoom_uuid: String(o.uuid ?? ''), topic: String(o.topic ?? '(başlıksız)'),
        agenda: String(o.agenda ?? ''), host_email: String(o.host_email ?? ''), host_name: String(o.host_name ?? o.host_email ?? ''),
        start_time: String(o.start_time ?? now()), duration_min: Number(o.duration ?? o.duration_min ?? 30), timezone: String(o.timezone ?? 'Europe/Istanbul'),
        join_url: String(o.join_url ?? ''), status: (o.status as Meeting['status']) ?? 'scheduled', recording_url: null,
        participants: [], notes: '', work_item_id: null }, ...meetings]
      imported++
    } else {
      const ext = String(o.code ?? o.key ?? o.id ?? '')
      if (!o.title || (ext && items.some((w) => w.tags.includes(`ext:${ext}`)))) continue
      const id = nextId(items)
      items = [{ id, code: `YVR-${1000 + id}`, title: String(o.title), description: String(o.description ?? ''),
        source_type: 'api', source_id: null, status: 'new', priority: (o.priority as Priority) ?? 'normal',
        category: String(o.category ?? 'Entegrasyon'), assignee: (o.assignee as string) ?? null, requester: cfg.name,
        due_date: (o.due_date as string) ?? null, tags: ext ? [`ext:${ext}`] : [], created_at: now(), updated_at: now(), closed_at: null }, ...items]
      imported++
    }
  }
  const entry: ApiCallLog = { ...log, id: nextId(db.apiLogs), record_count: imported }
  commit({
    ...db, items, emails, meetings,
    apiLogs: [entry, ...db.apiLogs].slice(0, MAX_LOGS),
    apiConfigs: db.apiConfigs.map((c) => (c.id === cfg.id ? { ...c, last_run_at: log.started_at, last_status: log.ok ? 'ok' : 'error' } : c)),
  })
}
