import { parsePyLiteral } from './pyliteral.js'
/**
 * Yaver AI cevabını okunur metne çevirir (0.9.2).
 * GenAI Studio uygulamasının kendi sistem talimatı modeli JSON'a zorlayabilir (ör. AI yorum şeması).
 * Cevap JSON ise (düz, ```json bloğu içinde ya da metnin içinde) alanlar Türkçe başlıklı, maddeli bir metne dönüştürülür.
 * Çıktı hafif Markdown'dır: "**kalın**", "- madde", "### başlık". Arayüz bunu biçimlendirir.
 */

const PRIORITY = { low: 'Düşük', normal: 'Normal', high: 'Yüksek', critical: 'Kritik' }
const STATUS = { new: 'Yeni', in_progress: 'İşlemde', waiting: 'Bekliyor', done: 'Tamamlandı', cancelled: 'İptal' }
const LEVEL = { ust: 'Üst Yönetim', birim: 'Birim Yöneticisi', po: 'PO', diger: 'Diğer' }
const KIND = { status: 'Durum', priority: 'Öncelik', assign: 'Atama', due_date: 'Son tarih', category: 'Kategori', tags: 'Etiket', edit: 'Düzenleme', topic: 'Konu' }
const LABEL = {
  summary: 'Özet', ozet: 'Özet', answer: 'Cevap', cevap: 'Cevap', yanit: 'Cevap', comment: 'Değerlendirme', yorum: 'Değerlendirme',
  suggestion: 'Öneri', oneri: 'Öneri', recommendation: 'Öneri', recommendations: 'Öneriler', steps: 'Adımlar', actions: 'Aksiyonlar',
  classification: 'Sınıflandırma', sources: 'Kaynaklar', kaynaklar: 'Kaynaklar', changes: 'Önerilen değişiklikler', questions: 'Açık sorular',
  warnings: 'Uyarılar', confidence: 'Güven', priority: 'Öncelik', assignee: 'Atanacak kişi', status: 'Durum', due_date: 'Son tarih',
  eta_days: 'Tahmini süre (gün)', sla: 'SLA', topic_keys: 'Konu', category: 'Kategori', mgmt_level: 'Talep eden seviyesi',
  is_actionable: 'Aksiyon gerekli', is_duplicate_of: 'Tekrarı olduğu iş', similar_items: 'Benzer işler', items: 'İşler', title: 'Başlık',
}
// Gösterilmeyen teknik alanlar
const SKIP = new Set(['schema_version', 'work_item_id', 'work_item_version', 'thread_id', 'id', 'depends_on', 'needs_human', 'score', 'request_context'])
const ANSWER_KEYS = ['last_message', 'lastMessage', 'final_answer', 'answer', 'cevap', 'yanit', 'yanıt', 'response', 'reply', 'text', 'content', 'message', 'msg', 'output', 'result']

// Chat Block zarf alanları (cevap metni yanında gelen durum/meta bilgisi): kullanıcıya gösterilmez
const ENVELOPE = new Set(['status', 'state', 'created_at', 'updated_at', 'createdAt', 'updatedAt', 'timestamp', 'model', 'usage', 'run_id', 'runId',
  'message_id', 'messageId', 'conversation_id', 'finish_reason', 'role', 'type', 'error', 'errors', 'success', 'ok', 'code', 'metadata', 'meta'])
/** {role, content} gibi bir mesaj nesnesinden metni alır. */
const msgText = (v) => typeof v === 'string' ? v
  : v && typeof v === 'object' && !Array.isArray(v) ? ['content', 'text', 'message', 'msg', 'answer'].map((k) => v[k]).find((x) => typeof x === 'string' && x.trim()) ?? null
  : null

const label = (k) => LABEL[k] ?? String(k).replace(/_/g, ' ').replace(/^./, (c) => c.toLocaleUpperCase('tr'))
const nice = (k, v) => {
  if (v === true) return 'Evet'
  if (v === false) return 'Hayır'
  if (k === 'priority') return PRIORITY[v] ?? v
  if (k === 'status') return STATUS[v] ?? v
  if (k === 'mgmt_level') return LEVEL[v] ?? v
  if (k === 'confidence' && typeof v === 'number') return `%${Math.round((v <= 1 ? v * 100 : v))}`
  if (k === 'kind') return KIND[v] ?? v
  return v
}
const isEmpty = (v) => v === null || v === undefined || v === '' || (Array.isArray(v) && !v.length) || (typeof v === 'object' && !Array.isArray(v) && !Object.keys(v).length)

/** Metinden JSON değer(ler)ini bulur: tam metin, ```json bloğu ya da ilk {…son}. */
export function parseJsonLoose(text) {
  const s = String(text ?? '').trim()
  const tries = [s]
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) tries.push(fence[1].trim())
  const a = s.indexOf('{'), b = s.lastIndexOf('}')
  if (a >= 0 && b > a) tries.push(s.slice(a, b + 1))
  for (const t of tries) {
    if (!/^[[{"]/.test(t)) continue
    try { const v = JSON.parse(t); if (v && typeof v === 'object') return v; if (typeof v === 'string') return v } catch { /* sıradaki */ }
    const py = /^[[{]/.test(t) ? parsePyLiteral(t) : null   // Python dict gösterimi
    if (py && typeof py === 'object') return py
  }
  return null
}

/** Tek satırlık kısa gösterim (nesne içindeki öğeler için). */
function inline(o) {
  if (o === null || typeof o !== 'object') return String(nice('', o))
  if (Array.isArray(o)) return o.map(inline).join(', ')
  // Kaynak / iş benzeri nesneler
  const ref = o.code ?? o.ref ?? o.slug ?? null
  const title = o.title ?? o.name ?? null
  if (ref || title) {
    const extra = [o.assignee && `çözen/atanan: ${o.assignee}`, o.resolved_in_days != null && `${o.resolved_in_days} gün`,
                   o.status && STATUS[o.status], o.used_for && `(${o.used_for})`].filter(Boolean).join(', ')
    return [ref && `**${ref}**`, title].filter(Boolean).join(' ') + (extra ? ` — ${extra}` : '')
  }
  // Değişiklik önerisi: {kind, payload, reasoning}
  if (o.kind && o.payload) {
    const p = Object.entries(o.payload).map(([k, v]) => `${nice(k, Array.isArray(v) ? v.join(', ') : v)}`).join(', ')
    return `${KIND[o.kind] ?? o.kind}: ${p}${o.reasoning ? ` — ${o.reasoning}` : ''}`
  }
  return Object.entries(o).filter(([k, v]) => !SKIP.has(k) && !isEmpty(v)).map(([k, v]) => `${label(k)}: ${inline(nice(k, v))}`).join(' · ')
}

function render(o, depth = 0) {
  const L = []
  for (const [k, v] of Object.entries(o)) {
    if (SKIP.has(k) || isEmpty(v)) continue
    if (typeof v === 'string' && ['summary', 'ozet', 'comment', 'yorum', 'answer', 'cevap', 'yanit'].includes(k)) {
      L.push(k === 'summary' || k === 'ozet' ? `**${label(k)}:** ${v}` : v, '')
    } else if (Array.isArray(v)) {
      L.push(`### ${label(k)}`)
      for (const x of v) L.push(`- ${inline(x)}`)
      L.push('')
    } else if (typeof v === 'object') {
      if (depth >= 1) { L.push(`- **${label(k)}:** ${inline(v)}`); continue }
      L.push(`### ${label(k)}`)
      for (const [k2, v2] of Object.entries(v)) {
        if (SKIP.has(k2) || isEmpty(v2)) continue
        L.push(`- **${label(k2)}:** ${Array.isArray(v2) ? v2.map((x) => inline(nice(k2, x))).join(', ') : inline(nice(k2, v2))}`)
      }
      L.push('')
    } else {
      L.push(`**${label(k)}:** ${nice(k, v)}`)
    }
  }
  return L
}

/** Cevap metnini okunur hâle getirir. JSON değilse olduğu gibi döner. */
export function readableAnswer(text) {
  const raw = String(text ?? '').trim()
  const parsed = parseJsonLoose(raw)
  if (parsed === null) return raw
  if (typeof parsed === 'string') return parsed.trim()
  let o = parsed
  // {answer: "..."} gibi tek metin alanı → doğrudan o metin
  if (!Array.isArray(o)) {
    const k = ANSWER_KEYS.find((x) => msgText(o[x])?.trim())
    const others = Object.keys(o).filter((x) => x !== k && !SKIP.has(x) && !ENVELOPE.has(x) && !isEmpty(o[x]))
    // {status: "completed", last_message: "..."} gibi zarf → yalnız cevap metni
    if (k && !others.length) return readableAnswer(msgText(o[k]))
  } else {
    return o.map((x) => `- ${inline(x)}`).join('\n')
  }
  // JSON'dan önce/sonra serbest metin varsa korunur
  const fenceOrObj = raw.match(/```(?:json)?[\s\S]*?```/i)?.[0] ?? raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1)
  const [before, after] = raw.split(fenceOrObj)
  // Sıra: cevap/özet → değerlendirme → öneri → değişiklikler → kaynaklar → sorular → uyarılar → diğerleri
  const ORDER = ['answer', 'cevap', 'yanit', 'summary', 'ozet', 'comment', 'yorum', 'suggestion', 'oneri', 'recommendation', 'recommendations', 'steps', 'actions',
    'changes', 'similar_items', 'items', 'sources', 'kaynaklar', 'questions', 'warnings', 'classification', 'confidence']
  const rank = (k) => { const i = ORDER.indexOf(k); return i < 0 ? ORDER.length : i }
  o = Object.fromEntries(Object.entries(o).sort((x, y) => rank(x[0]) - rank(y[0])))
  const body = render(o)
  const out = [before?.trim(), body.join('\n').replace(/\n{3,}/g, '\n\n').trim(), after?.trim()].filter(Boolean).join('\n\n')
  return out || raw
}
