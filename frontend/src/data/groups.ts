import type { KeywordRule, MgmtLevel, WorkItem } from './types'

/**
 * İşlerin pano/liste gruplaması: Talep eden (Üst Yönetim / Birim Yöneticisi / PO) · Konu (anahtar kelime) · Süre.
 * Sunucu modunda mgmt_level ve keywords sunucudan gelir (contact + keyword_rule tabloları);
 * demo (localStorage) modunda anahtar kelimeler aşağıdaki varsayılan kurallarla tarayıcıda hesaplanır.
 */

export type GroupBy = 'mgmt' | 'keyword' | 'age'
export const GROUP_BY_LABEL: Record<GroupBy, string> = { mgmt: 'Talep eden', keyword: 'Konu', age: 'Süre' }
export interface Group { key: string; label: string; color: string; hint?: string }

export const MGMT_LABEL: Record<MgmtLevel, string> = { ust: 'Üst Yönetim', birim: 'Birim Yöneticisi', po: 'PO', diger: 'Diğer' }
export const MGMT_COLOR: Record<MgmtLevel, string> = { ust: '#E5484D', birim: '#8E4EC6', po: '#2E90FA', diger: '#9A9EA8' }
export const MGMT_GROUPS: Group[] = [
  { key: 'ust', label: 'Üst Yönetim', color: MGMT_COLOR.ust, hint: 'İlk dönüş 4 saat' },
  { key: 'birim', label: 'Birim Yöneticisi', color: MGMT_COLOR.birim, hint: 'İlk dönüş 1 iş günü' },
  { key: 'po', label: 'PO', color: MGMT_COLOR.po, hint: 'Sprint önceliği, 2 iş günü' },
  { key: 'diger', label: 'Diğer talepler', color: MGMT_COLOR.diger },
]
/** Rozet gösterilecek seviyeler (Üst Yönetim, Birim Yöneticisi, PO) */
export const hasMgmtBadge = (w: WorkItem) => (w.mgmt_level ?? 'diger') !== 'diger'

export const AGE_GROUPS: (Group & { maxDays: number })[] = [
  { key: 'd0', label: 'Son 24 saat', color: '#12B76A', maxDays: 1 },
  { key: 'd1', label: '1–3 gün', color: '#2E90FA', maxDays: 3 },
  { key: 'd3', label: '3–7 gün', color: '#F79009', maxDays: 7 },
  { key: 'd7', label: '7 günden eski', color: '#F04438', maxDays: Infinity },
]

export const DEFAULT_KEYWORD_RULES: KeywordRule[] = [
  { key: 'mq', label: 'MQ', terms: ['mq', 'ibm mq', 'qmgr', 'kuyruk', 'queue', 'channel', 'dlq', 'mesaj kuyruğu'], color: '#E2A336', sort_order: 10 },
  { key: 'openshift', label: 'OpenShift Upgrade', terms: ['openshift', 'ocp', 'pod', 'cluster upgrade', 'operator', 'worker node', 'kubernetes', 'k8s'], color: '#E5484D', sort_order: 20 },
  { key: 'server', label: 'Server Upgrade', terms: ['server upgrade', 'sunucu upgrade', 'os upgrade', 'rhel', 'yama', 'patch', 'firmware', 'windows server', 'sunucu güncelleme'], color: '#3E63DD', sort_order: 30 },
  { key: 'decom', label: 'Decom', terms: ['decom', 'decommission', 'devreden çıkar', 'kapatılması', 'sunucu kapatma', 'emekliye'], color: '#5B5F6B', sort_order: 40 },
  { key: 'devops', label: 'DevOps', terms: ['pipeline', 'ci/cd', 'jenkins', 'argocd', 'helm', 'azure devops', 'gitlab', 'build', 'deploy'], color: '#12A594', sort_order: 50 },
  { key: 'failed', label: 'Failed hataları', terms: ['failed', 'başarısız', 'hata', 'error', 'exception', 'crashloop', 'timeout', 'patladı', 'down'], color: '#F76B15', sort_order: 60 },
  { key: 'servis', label: 'Servis Yönetimi', terms: ['incident', 'olay kaydı', 'change', 'değişiklik kaydı', 'cab', 'problem kaydı', 'itsm', 'servicenow', 'sla ihlali', 'sla süresi'], color: '#8E4EC6', sort_order: 70 },
  { key: 'yazilim', label: 'Yazılım', terms: ['yazılım', 'bug ', "bug'", 'bugfix', 'geliştirme', 'release', 'versiyon', 'user story', 'backlog', 'sprint', 'kod'], color: '#2E90FA', sort_order: 80 },
]
const NO_KEYWORD: Group = { key: '_none', label: 'Diğer konular', color: '#9A9EA8' }

export function itemKeywords(w: WorkItem, rules: KeywordRule[]): string[] {
  if (w.keywords) return w.keywords
  const t = `${w.title} ${w.description}`.toLocaleLowerCase('tr')
  return rules.filter((r) => r.terms.some((x) => t.includes(x))).map((r) => r.key)
}

/** Açık iş için geçen süre (gün); kapalı iş için çözüm süresi. */
export const ageDays = (w: WorkItem) =>
  ((w.closed_at ? new Date(w.closed_at).getTime() : Date.now()) - new Date(w.created_at).getTime()) / 86_400_000

export function ageLabel(w: WorkItem) {
  const d = ageDays(w)
  if (d < 1 / 24) return `${Math.max(1, Math.round(d * 1440))} dk`
  if (d < 1) return `${Math.round(d * 24)} sa`
  return `${Math.floor(d)} gün`
}

export function groupsFor(by: GroupBy, rules: KeywordRule[]): Group[] {
  if (by === 'mgmt') return MGMT_GROUPS
  if (by === 'age') return AGE_GROUPS
  return [...rules.map((r) => ({ key: r.key, label: r.label, color: r.color })), NO_KEYWORD]
}

export function groupOf(w: WorkItem, by: GroupBy, rules: KeywordRule[]): string {
  if (by === 'mgmt') { const l = w.mgmt_level ?? 'diger'; return l in MGMT_LABEL ? l : 'diger' }
  if (by === 'age') { const d = ageDays(w); return AGE_GROUPS.find((g) => d < g.maxDays)!.key }
  const order = rules.map((r) => r.key)
  const kw = itemKeywords(w, rules).filter((k) => order.includes(k)).sort((a, b) => order.indexOf(a) - order.indexOf(b))
  return kw[0] ?? NO_KEYWORD.key
}

/** "**kalın**" işaretlerini ayırır (ajan yorumu düz metin + kalın). */
export const boldParts = (s: string) => s.split(/(\*\*[^*]+\*\*)/g).map((p) => (p.startsWith('**') ? { b: true, t: p.slice(2, -2) } : { b: false, t: p }))
export const plain = (s: string | null | undefined) => (s ?? '').replace(/\*\*/g, '')
