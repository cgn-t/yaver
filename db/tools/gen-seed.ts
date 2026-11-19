// Örnek veri SQL'ini frontend/src/data/seed.ts'ten üretir (tek kaynak).
// Çalıştırma: node --experimental-strip-types db/tools/gen-seed.ts > db/postgres/02-seed.sql
import { scryptSync, randomBytes } from 'node:crypto'
import { seedData, seedApiConfigs, DEFAULT_LDAP, DEFAULT_GENERAL, TEAM } from '../../frontend/src/data/seed.ts'

const NOW = Date.now()
const q = (v: unknown): string => {
  if (v === null || v === undefined || v === '') return 'NULL'
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE'
  if (typeof v === 'number') return String(v)
  return `'${String(v).replace(/'/g, "''")}'`
}
const qs = (v: string) => `'${v.replace(/'/g, "''")}'` // boş string de string kalsın
const ts = (iso: string | null) => {
  if (!iso) return 'NULL'
  const min = Math.round((Date.parse(iso) - NOW) / 60000)
  if (min === 0) return 'now()'
  return `now() ${min < 0 ? '-' : '+'} interval '${Math.abs(min)} minutes'`
}
const today = Date.parse(new Date(NOW).toISOString().slice(0, 10))
const dt = (d: string | null) => {
  if (!d) return 'NULL'
  const days = Math.round((Date.parse(d) - today) / 86400000)
  return days === 0 ? 'current_date' : `current_date ${days < 0 ? '-' : '+'} ${Math.abs(days)}`
}
const js = (a: string[]) => qs(JSON.stringify(a)) + '::jsonb'
const user = (u: string | null) => (u ? `(SELECT id FROM app_user WHERE username = ${q(u)})` : 'NULL')

const { emails, meetings, items, activities } = seedData()
const out: string[] = []
const P = (s = '') => out.push(s)

P('-- =====================================================================')
P('-- YAVER — örnek veri (PostgreSQL)')
P('-- Otomatik üretildi: db/tools/gen-seed.ts  (kaynak: frontend/src/data/seed.ts)')
P("-- Tarihler now()/current_date'e göre görelidir: hangi gün yüklenirse yüklensin")
P('-- pano "bugün" verisiyle dolu görünür.')
P('-- Uygulama ilk açılışta work_item tablosu BOŞSA bu dosyayı çalıştırır.')
P('-- =====================================================================')
P('BEGIN;')
P()
P('-- ---------- Kullanıcılar ----------')
P('-- admin / admin  (lokal hesap, scrypt özeti). Diğerleri LDAP üzerinden giriş yapar.')
const salt = randomBytes(16).toString('hex')
const hash = scryptSync('admin', salt, 32).toString('hex')
const FULL: Record<string, string> = {
  admin: 'Yönetici', 'ayse.yilmaz': 'Ayşe Yılmaz', 'mehmet.kaya': 'Mehmet Kaya', 'zeynep.demir': 'Zeynep Demir', 'can.ozturk': 'Can Öztürk',
}
P('INSERT INTO app_user (username, full_name, email, auth_source, password_hash, role, team_group) VALUES')
P(TEAM.map((u) => {
  const admin = u === 'admin'
  return `  (${q(u)}, ${q(FULL[u])}, ${q(`${u}@firma.com`)}, ${q(admin ? 'local' : 'ldap')}, ${admin ? q(`scrypt$${salt}$${hash}`) : 'NULL'}, ${q(admin ? 'admin' : 'member')}, 'ScrumGroup')`
}).join(',\n'))
P('ON CONFLICT (username) DO NOTHING;')
P()

P('-- ---------- İşler ----------')
P('-- id sabit verilir ki mail/toplantı bağlantıları okunabilir olsun; sonra sequence ilerletilir.')
P('INSERT INTO work_item (id, title, description, source_type, external_ref, status, priority, category, assignee_id, requester, due_date, created_at, updated_at, closed_at) VALUES')
P(items.map((w) => `  (${w.id}, ${q(w.title)}, ${q(w.description)}, ${q(w.source_type)}, ${q(w.external_ref ?? null)}, ${q(w.status)}, ${q(w.priority)}, ${q(w.category)}, ${user(w.assignee)}, ${q(w.requester)}, ${dt(w.due_date)}, ${ts(w.created_at)}, ${ts(w.updated_at)}, ${ts(w.closed_at)})`).join(',\n') + ';')
P("SELECT setval(pg_get_serial_sequence('work_item','id'), (SELECT max(id) FROM work_item));")
P()
const tags = items.flatMap((w) => w.tags.map((t) => `  (${w.id}, ${q(t)})`))
if (tags.length) { P('INSERT INTO work_item_tag (work_item_id, tag) VALUES'); P(tags.join(',\n') + ';'); P() }

P('-- ---------- E-postalar ----------')
P('INSERT INTO email (id, message_id, thread_id, mailbox, from_address, from_name, to_addresses, cc_addresses, subject, body_preview, importance, has_attachments, received_at, is_read, work_item_id) VALUES')
P(emails.map((e) => `  (${e.id}, ${q(e.message_id)}, ${q(e.thread_id)}, ${q(e.mailbox)}, ${q(e.from_address)}, ${q(e.from_name)}, ${js(e.to_addresses)}, ${js(e.cc_addresses)}, ${q(e.subject)}, ${q(e.body_preview)}, ${q(e.importance)}, ${q(e.has_attachments)}, ${ts(e.received_at)}, ${q(e.is_read)}, ${q(e.work_item_id)})`).join(',\n') + ';')
P("SELECT setval(pg_get_serial_sequence('email','id'), (SELECT max(id) FROM email));")
P("INSERT INTO email_attachment (email_id, file_name, content_type, size_bytes) VALUES (2, 'yeni_kullanicilar.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 18432);")
P()

P('-- ---------- Zoom toplantıları ----------')
P('INSERT INTO meeting (id, zoom_meeting_id, zoom_uuid, topic, agenda, host_email, host_name, start_time, duration_min, timezone, join_url, status, recording_url, notes, work_item_id) VALUES')
P(meetings.map((m) => `  (${m.id}, ${q(m.zoom_meeting_id)}, ${q(m.zoom_uuid)}, ${q(m.topic)}, ${q(m.agenda)}, ${q(m.host_email)}, ${q(m.host_name)}, ${ts(m.start_time)}, ${m.duration_min}, ${q(m.timezone)}, ${q(m.join_url)}, ${q(m.status)}, ${q(m.recording_url)}, ${qs(m.notes)}, ${q(m.work_item_id)})`).join(',\n') + ';')
P("SELECT setval(pg_get_serial_sequence('meeting','id'), (SELECT max(id) FROM meeting));")
P('INSERT INTO meeting_participant (meeting_id, name, email, attended) VALUES')
P(meetings.flatMap((m) => m.participants.map((p) => `  (${m.id}, ${q(p.name)}, ${q(p.email)}, ${q(p.attended)})`)).join(',\n') + ';')
P()

P('-- İş ↔ kaynak bağlantıları (mail/toplantıdan açılan işler)')
for (const w of items) if (w.source_id) P(`UPDATE work_item SET source_id = ${w.source_id} WHERE id = ${w.id};`)
P("UPDATE meeting SET work_item_id = 3 WHERE id = 2;")
P()

P('-- ---------- İş tarihçesi ----------')
P('INSERT INTO work_item_activity (work_item_id, actor_id, action, old_value, new_value, comment, created_at) VALUES')
const acts = activities.map((a) => `  (${a.work_item_id}, NULL, 'created', NULL, NULL, ${q(a.text)}, ${ts(a.at)})`)
acts.push(`  (1, ${user('admin')}, 'status', 'new', 'in_progress', 'Durum: Yeni → Devam ediyor', now() - interval '60 minutes')`)
acts.push(`  (1, ${user('mehmet.kaya')}, 'comment', NULL, NULL, 'Yavaş sorgu tespit edildi, indeks analizi yapılıyor.', now() - interval '40 minutes')`)
acts.push(`  (4, ${user('can.ozturk')}, 'status', 'in_progress', 'waiting', 'Durum: Devam ediyor → Beklemede', now() - interval '360 minutes')`)
P(acts.join(',\n') + ';')
P()

P('-- ---------- API çağrı servisleri (varsayılan 1 dk) ----------')
P('INSERT INTO api_poll_config (name, enabled, target, url, method, interval_sec, timeout_sec, auth_type, headers_json) VALUES')
P(seedApiConfigs().map((c) => `  (${q(c.name)}, FALSE, ${q(c.target)}, ${q(c.url)}, ${q(c.method)}, ${c.interval_sec}, ${c.timeout_sec}, ${q(c.auth_type)}, ${q(c.headers)})`).join(',\n') + ';')
P()

P('-- ---------- Ayarlar ----------')
const set = (cat: string, o: Record<string, unknown>, secret: string[] = []) =>
  Object.entries(o).map(([k, v]) => `  (${q(cat)}, ${q(k)}, ${qs(Array.isArray(v) ? JSON.stringify(v) : String(v))}, ${secret.includes(k) ? 'TRUE' : 'FALSE'})`)
P('INSERT INTO app_setting (category, key, value, is_secret) VALUES')
P([...set('ldap', DEFAULT_LDAP as never, ['bind_password']), ...set('general', DEFAULT_GENERAL as never)].join(',\n'))
P('ON CONFLICT (category, key) DO NOTHING;')
P()
P('COMMIT;')
console.log(out.join('\n'))
