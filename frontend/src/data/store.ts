import { useSyncExternalStore } from 'react'
import { DEFAULT_GENERAL, DEFAULT_LDAP, newApiConfig, seedApiConfigs, seedData } from './seed'
import type {
  Activity, ApiCallLog, ApiServiceConfig, Email, GeneralConfig, LdapConfig, Meeting, Priority, SourceType,
  WorkItem, WorkStatus,
} from './types'

/**
 * Önyüz veri katmanı. Backend olmadığı için veri tarayıcıda (localStorage) tutulur.
 * Backend hazır olduğunda bu dosyadaki fonksiyonlar /api uçlarına çağrı yapacak şekilde
 * değiştirilir; sayfalar yalnız useDb() + aksiyon fonksiyonlarını kullandığı için etkilenmez.
 * Önerilen uçlar: docs/DB-SEMA.md "API uçları" bölümü.
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
}

const KEY = 'yaver_db_v1'
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

let db: Db = load()
const listeners = new Set<() => void>()

function commit(next: Db) {
  db = next
  try { localStorage.setItem(KEY, JSON.stringify(db)) } catch { /* depolama dolu: yalnız bellekte */ }
  listeners.forEach((l) => l())
}

export function useDb(): Db {
  return useSyncExternalStore((cb) => { listeners.add(cb); return () => listeners.delete(cb) }, () => db)
}
export const getDb = () => db

export function resetDemoData() { commit({ ...initial(), ldap: db.ldap, general: db.general, apiConfigs: db.apiConfigs }) }

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
export const PRIORITY_COLOR: Record<Priority, string> = { low: '#90a4ae', normal: '#42a5f5', high: '#ff9800', critical: '#e53946' }
export const SOURCE_LABEL: Record<SourceType, string> = { mail: 'E-posta', zoom: 'Zoom', manual: 'Manuel', api: 'API' }

export const isOpen = (w: WorkItem) => w.status !== 'done' && w.status !== 'cancelled'
export const isOverdue = (w: WorkItem) => isOpen(w) && !!w.due_date && w.due_date < new Date().toISOString().slice(0, 10)

export type NewWorkItem = Pick<WorkItem, 'title' | 'description' | 'priority' | 'category' | 'assignee' | 'due_date'> & {
  source_type?: SourceType; source_id?: number | null; requester?: string | null; tags?: string[]
}

export function createWorkItem(input: NewWorkItem): WorkItem {
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

export function updateWorkItem(id: number, patch: Partial<WorkItem>) {
  const old = db.items.find((w) => w.id === id)
  if (!old) return
  let acts = db.activities
  if (patch.status && patch.status !== old.status)
    acts = addActivity(acts, id, 'status', `Durum: ${STATUS_LABEL[old.status]} → ${STATUS_LABEL[patch.status]}`)
  if (patch.assignee !== undefined && patch.assignee !== old.assignee)
    acts = addActivity(acts, id, 'assign', `Atanan: ${patch.assignee || '—'}`)
  if (patch.priority && patch.priority !== old.priority)
    acts = addActivity(acts, id, 'priority', `Öncelik: ${PRIORITY_LABEL[patch.priority]}`)
  const closing = patch.status && (patch.status === 'done' || patch.status === 'cancelled')
  const next = { ...old, ...patch, updated_at: now(),
                 closed_at: patch.status ? (closing ? now() : null) : old.closed_at }
  commit({ ...db, items: db.items.map((w) => (w.id === id ? next : w)), activities: acts })
}

export function addComment(id: number, text: string) {
  commit({ ...db, activities: addActivity(db.activities, id, 'comment', text),
           items: db.items.map((w) => (w.id === id ? { ...w, updated_at: now() } : w)) })
}

// ---------- Mail / Zoom ----------
export function markEmailRead(id: number, is_read = true) {
  commit({ ...db, emails: db.emails.map((e) => (e.id === id ? { ...e, is_read } : e)) })
}
export function updateMeeting(id: number, patch: Partial<Meeting>) {
  commit({ ...db, meetings: db.meetings.map((m) => (m.id === id ? { ...m, ...patch } : m)) })
}

// ---------- Ayarlar ----------
export function saveLdap(ldap: LdapConfig) { commit({ ...db, ldap }) }
export function saveGeneral(general: GeneralConfig) { commit({ ...db, general }) }
export function saveApiConfig(cfg: ApiServiceConfig) {
  const exists = db.apiConfigs.some((c) => c.id === cfg.id)
  commit({ ...db, apiConfigs: exists ? db.apiConfigs.map((c) => (c.id === cfg.id ? cfg : c)) : [...db.apiConfigs, cfg] })
}
export function addApiConfig(): ApiServiceConfig {
  const cfg = newApiConfig(nextId(db.apiConfigs))
  commit({ ...db, apiConfigs: [...db.apiConfigs, cfg] })
  return cfg
}
export function deleteApiConfig(id: number) { commit({ ...db, apiConfigs: db.apiConfigs.filter((c) => c.id !== id) }) }
export function clearApiLogs() { commit({ ...db, apiLogs: [] }) }

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
