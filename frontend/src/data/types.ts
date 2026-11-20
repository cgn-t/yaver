// Yaver veri modeli — önerilen DB şemasıyla (docs/DB-SEMA.md, db/schema-mssql.sql) birebir.
// Alan adları DB kolon adlarıyla aynı tutuldu; backend geldiğinde API cevapları doğrudan bu tiplere oturur.

export type SourceType = 'mail' | 'zoom' | 'tfs' | 'jira' | 'manual' | 'api'
export type WorkStatus = 'new' | 'in_progress' | 'waiting' | 'done' | 'cancelled'
export type Priority = 'low' | 'normal' | 'high' | 'critical'

/** work_item — takıma gelen her iş tek tabloda; kaynağı (mail/zoom/…) source_type + source_id ile bağlanır */
export interface WorkItem {
  id: number
  code: string                 // YVR-1001 (insan-okunur anahtar)
  title: string
  description: string
  source_type: SourceType
  source_id: number | null     // email.id veya meeting.id
  external_ref?: string | null // TFS / Jira anahtarı (ör. TFS-48213, OPS-1123)
  external_url?: string | null
  status: WorkStatus
  priority: Priority
  category: string
  assignee: string | null      // app_user.username
  requester: string | null     // isteği getiren (mail göndereni / toplantı sahibi)
  due_date: string | null      // ISO tarih
  tags: string[]
  created_at: string
  updated_at: string
  closed_at: string | null
  // ---- v0.6: geçmişe dayalı yorum (sunucu modunda dolu; demo modunda boş olabilir) ----
  version?: number
  requester_email?: string | null
  mgmt_level?: MgmtLevel        // talep edenin seviyesi (contact.mgmt_level)
  keywords?: string[]           // maildeki anahtar kelimeler (keyword_rule.key)
  agent_comment?: string | null // ajanın geçmişe (DB, wiki, mail) bakarak yazdığı yorum
  agent_sources?: AgentSource[]
  agent_confidence?: number | null
  agent_suggestion?: AgentSuggestion | null
  agent_comment_by?: string | null
  agent_comment_at?: string | null
  genai_status?: 'pending' | 'running' | 'done' | 'failed' | 'skipped' | null   // son GenAI yorumlama işinin durumu
  genai_error?: string | null
}

export type MgmtLevel = 'ust' | 'birim' | 'po' | 'diger'
export interface AgentSource { type: 'db' | 'wiki' | 'mail' | 'meeting' | 'tfs' | 'jira'; id: number; ref: string; title: string; url?: string }
export interface AgentSuggestion { priority?: Priority; assignee?: string | null; eta_days?: number; sla?: string | null }
export interface KeywordRule { key: string; label: string; terms: string[]; color: string; sort_order: number }

/** email — posta kutusundan çekilen mailler */
export interface Email {
  id: number
  message_id: string           // RFC 5322 Message-ID (tekil, tekrar çekmede çift kayıt engeli)
  thread_id: string | null     // konuşma (conversation) kimliği
  mailbox: string              // hangi kutudan geldi (ör. takim@firma.com)
  from_address: string
  from_name: string
  to_addresses: string[]
  cc_addresses: string[]
  subject: string
  body_preview: string
  importance: 'low' | 'normal' | 'high'
  has_attachments: boolean
  received_at: string
  is_read: boolean
  work_item_id: number | null
}

export interface MeetingParticipant { name: string; email: string; attended: boolean }

/** meeting — Zoom toplantıları */
export interface Meeting {
  id: number
  zoom_meeting_id: string
  zoom_uuid: string
  topic: string
  agenda: string
  host_email: string
  host_name: string
  start_time: string
  duration_min: number
  timezone: string
  join_url: string
  status: 'scheduled' | 'live' | 'ended' | 'cancelled'
  recording_url: string | null
  participants: MeetingParticipant[]
  notes: string
  work_item_id: number | null
}

/** work_item_activity — işin tarihçesi (durum değişikliği, atama, yorum) */
export interface Activity {
  id: number
  work_item_id: number
  at: string
  actor: string
  action: 'created' | 'status' | 'assign' | 'comment' | 'priority' | 'linked' | 'edit' | 'agent_note' | 'agent_proposal'
  text: string
}

export type HttpMethod = 'GET' | 'POST' | 'PUT'
export type AuthType = 'none' | 'bearer' | 'basic' | 'api_key'

/** api_poll_config — periyodik API çağrı servisi (Ayarlar > API Çağrı Servisi) */
export interface ApiServiceConfig {
  id: number
  name: string
  enabled: boolean
  target: SourceType | 'generic'   // dönen kayıtlar hangi kaynağa yazılsın
  url: string
  method: HttpMethod
  interval_sec: number             // varsayılan 60 sn (1 dk)
  timeout_sec: number
  auth_type: AuthType
  auth_token: string               // bearer token / api key değeri
  auth_header: string              // api_key için başlık adı (ör. X-API-Key)
  username: string                 // basic
  password: string                 // basic
  headers: string                  // ek başlıklar (JSON)
  body: string                     // POST/PUT gövdesi (JSON)
  last_run_at: string | null
  last_status: 'ok' | 'error' | null
}

/** api_poll_log — her çağrının sonucu */
export interface ApiCallLog {
  id: number
  config_id: number
  config_name: string
  started_at: string
  duration_ms: number
  http_status: number | null
  ok: boolean
  record_count: number
  message: string
}

/** app_setting (category='ldap') — Jumbo'daki LDAP ayarlarıyla aynı alanlar */
export interface LdapConfig {
  enabled: boolean
  server: string
  port: number
  use_ssl: boolean
  start_tls: boolean
  skip_cert_verify: boolean
  ca_cert: string
  bind_dn: string
  bind_password: string
  base_dn: string
  user_filter: string
  user_attr: string
  email_attr: string
  display_attr: string
  group_base: string
  group_filter: string
  team_group_ou: string
  timeout_sec: number
}

export interface GeneralConfig {
  app_title: string
  default_assignee: string
  sla_hours: number
  mailbox: string
  team_members: string[]
}
