import type { KeywordRule, MgmtLevel, WorkItem } from './types'

/**
 * İşlerin pano/liste gruplaması: Üst Yönetim · Anahtar kelime · Süre.
 * Sunucu modunda mgmt_level ve keywords sunucudan gelir (contact + keyword_rule tabloları);
 * demo (localStorage) modunda anahtar kelimeler aşağıdaki varsayılan kurallarla tarayıcıda hesaplanır.
 */

export type GroupBy = 'mgmt' | 'keyword' | 'age'
export const GROUP_BY_LABEL: Record<GroupBy, string> = { mgmt: 'Üst Yönetim', keyword: 'Anahtar kelime', age: 'Süre' }
export interface Group { key: string; label: string; color: string; hint?: string }

export const MGMT_LABEL: Record<MgmtLevel, string> = { gm: 'Genel Müdür', gmy: 'Genel Müdür Yrd.', direktor: 'Direktör', mudur: 'Müdür', diger: 'Diğer' }
export const MGMT_GROUPS: Group[] = [
  { key: 'gm', label: 'Genel Müdür', color: '#E5484D', hint: 'SLA 4 saat' },
  { key: 'gmy', label: 'Genel Müdür Yrd.', color: '#F76B15', hint: 'SLA 4 saat' },
  { key: 'direktor', label: 'Direktör', color: '#8E4EC6', hint: 'SLA 1 iş günü' },
  { key: 'diger', label: 'Diğer talepler', color: '#9A9EA8' },
]
export const isSenior = (w: WorkItem) => ['gm', 'gmy', 'direktor'].includes(w.mgmt_level ?? 'diger')

export const AGE_GROUPS: (Group & { maxDays: number })[] = [
  { key: 'd0', label: 'Son 24 saat', color: '#12B76A', maxDays: 1 },
  { key: 'd1', label: '1–3 gün', color: '#2E90FA', maxDays: 3 },
  { key: 'd3', label: '3–7 gün', color: '#F79009', maxDays: 7 },
  { key: 'd7', label: '7 günden eski', color: '#F04438', maxDays: Infinity },
]

export const DEFAULT_KEYWORD_RULES: KeywordRule[] = [
  { key: 'acil', label: 'Acil', terms: ['acil', 'ivedi', 'hemen', 'bugün içinde', 'kritik'], color: '#E5484D', sort_order: 10 },
  { key: 'prod', label: 'Prod / Kesinti', terms: ['prod', 'canlı', 'kesinti', 'erişilemiyor', 'çöktü', 'hata veriyor', 'yavaş'], color: '#F76B15', sort_order: 20 },
  { key: 'fatura', label: 'Fatura / Ödeme', terms: ['fatura', 'ödeme', 'tahsilat', 'muhasebe'], color: '#E2A336', sort_order: 30 },
  { key: 'rapor', label: 'Rapor', terms: ['rapor', 'dashboard', 'toplam', 'sorgu', 'kapasite'], color: '#3E63DD', sort_order: 40 },
  { key: 'erisim', label: 'Erişim / Yetki', terms: ['erişim', 'yetki', 'şifre', 'vpn', 'hesap', 'sso', 'giriş'], color: '#8E4EC6', sort_order: 50 },
  { key: 'denetim', label: 'Denetim / Uyum', terms: ['denetim', 'kvkk', 'audit', 'uyum', 'lisans', 'sertifika'], color: '#12A594', sort_order: 60 },
]
const NO_KEYWORD: Group = { key: '_none', label: 'Anahtar kelime yok', color: '#9A9EA8' }

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
  if (by === 'mgmt') { const l = w.mgmt_level ?? 'diger'; return l === 'mudur' ? 'diger' : l }
  if (by === 'age') { const d = ageDays(w); return AGE_GROUPS.find((g) => d < g.maxDays)!.key }
  const order = rules.map((r) => r.key)
  const kw = itemKeywords(w, rules).filter((k) => order.includes(k)).sort((a, b) => order.indexOf(a) - order.indexOf(b))
  return kw[0] ?? NO_KEYWORD.key
}

/** "**kalın**" işaretlerini ayırır (ajan yorumu düz metin + kalın). */
export const boldParts = (s: string) => s.split(/(\*\*[^*]+\*\*)/g).map((p) => (p.startsWith('**') ? { b: true, t: p.slice(2, -2) } : { b: false, t: p }))
export const plain = (s: string | null | undefined) => (s ?? '').replace(/\*\*/g, '')
