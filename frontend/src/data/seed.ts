import type { Activity, ApiServiceConfig, Email, GeneralConfig, LdapConfig, Meeting, WorkItem } from './types'

// Backend yokken ekranlar boş görünmesin diye örnek veri. Tarihler "şimdi"ye göre üretilir.
const H = 3600_000
const iso = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString()
const day = (offsetDays: number) => new Date(Date.now() + offsetDays * 24 * H).toISOString().slice(0, 10)

export const TEAM = ['admin', 'ayse.yilmaz', 'mehmet.kaya', 'zeynep.demir', 'can.ozturk']

export const DEFAULT_LDAP: LdapConfig = {
  enabled: false,
  server: 'ldaps://dc.firma.local',
  port: 636,
  use_ssl: true,
  start_tls: false,
  skip_cert_verify: false,
  ca_cert: '',
  bind_dn: 'CN=svc_yaver,OU=Service Accounts,DC=firma,DC=local',
  bind_password: '',
  base_dn: 'DC=firma,DC=local',
  user_filter: '(&(objectClass=user)(sAMAccountName={username}))',
  user_attr: 'sAMAccountName',
  email_attr: 'mail',
  display_attr: 'displayName',
  group_base: '',
  group_filter: '',
  team_group_ou: 'ScrumGroup',
  timeout_sec: 10,
}

export const DEFAULT_GENERAL: GeneralConfig = {
  app_title: 'Yaver',
  default_assignee: '',
  sla_hours: 24,
  mailbox: 'takim@firma.com',
  team_members: TEAM,
}

export const newApiConfig = (id: number): ApiServiceConfig => ({
  id,
  name: 'Yeni servis',
  enabled: false,
  target: 'generic',
  url: '',
  method: 'GET',
  interval_sec: 60,
  timeout_sec: 15,
  auth_type: 'none',
  auth_token: '',
  auth_header: 'X-API-Key',
  username: '',
  password: '',
  headers: '{\n  "Accept": "application/json"\n}',
  body: '',
  last_run_at: null,
  last_status: null,
})

export function seedApiConfigs(): ApiServiceConfig[] {
  return [
    { ...newApiConfig(1), name: 'Mail kutusu senkronu', target: 'mail', url: '/api/integrations/mail/sync' },
    { ...newApiConfig(2), name: 'Zoom toplantı senkronu', target: 'zoom', url: '/api/integrations/zoom/sync' },
    { ...newApiConfig(3), name: 'TFS Kanban kartları', target: 'tfs', url: 'https://tfs.firma.local/tfs/DefaultCollection/_apis/wit/wiql?api-version=6.0' },
    { ...newApiConfig(4), name: 'Jira kayıtları', target: 'jira', url: 'https://jira.firma.local/rest/api/2/search?jql=project=OPS' },
  ]
}

export function seedData() {
  const emails: Email[] = [
    { id: 1, message_id: '<a1@firma.com>', thread_id: 't1', mailbox: 'takim@firma.com', from_address: 'deniz.arslan@firma.com', from_name: 'Deniz Arslan',
      to_addresses: ['takim@firma.com'], cc_addresses: [], subject: 'MQ channel CRM.TO.CORE RETRY durumunda',
      body_preview: 'Sabahtan beri CRM → Çekirdek MQ channel RETRY durumunda, mesajlar DLQ\'ya düşüyor. Kontrol edebilir misiniz?',
      importance: 'high', has_attachments: false, received_at: iso(-1.5 * H), is_read: false, work_item_id: 1 },
    { id: 2, message_id: '<a2@firma.com>', thread_id: 't2', mailbox: 'takim@firma.com', from_address: 'murat.aydin@firma.com', from_name: 'Murat Aydın',
      to_addresses: ['takim@firma.com'], cc_addresses: ['sistem@firma.com'], subject: 'APPSRV07-09 server upgrade (RHEL 8)',
      body_preview: 'Destek süresi biten üç uygulama sunucusunun RHEL 8\'e server upgrade\'i için bakım penceresi planlayalım. Liste ektedir.',
      importance: 'normal', has_attachments: true, received_at: iso(-4 * H), is_read: true, work_item_id: 2 },
    { id: 3, message_id: '<a3@firma.com>', thread_id: 't3', mailbox: 'takim@firma.com', from_address: 'noreply@monitor.firma.com', from_name: 'İzleme Sistemi',
      to_addresses: ['takim@firma.com'], cc_addresses: [], subject: '[UYARI] OpenShift worker-node-05 disk doluluğu %85',
      body_preview: 'ocp-prod worker-node-05 üzerinde /var/lib/containers %85 doluluğa ulaştı.',
      importance: 'high', has_attachments: false, received_at: iso(-20 * 60_000), is_read: false, work_item_id: null },
    { id: 4, message_id: '<a4@firma.com>', thread_id: 't4', mailbox: 'takim@firma.com', from_address: 'gizem.yildiz@firma.com', from_name: 'Gizem Yıldız',
      to_addresses: ['takim@firma.com'], cc_addresses: [], subject: 'Ödeme platformu release\'i için test ortamı',
      body_preview: 'Cuma günkü sprint demosu için ödeme platformunun son versiyonunun test ortamına deploy edilmesi gerekiyor.',
      importance: 'normal', has_attachments: false, received_at: iso(-26 * H), is_read: true, work_item_id: 4 },
    { id: 5, message_id: '<a5@firma.com>', thread_id: 't5', mailbox: 'takim@firma.com', from_address: 'selin.koc@firma.com', from_name: 'Selin Koç',
      to_addresses: ['takim@firma.com'], cc_addresses: [], subject: 'Teşekkürler — Jenkins sorunu çözüldü',
      body_preview: 'Dünkü Jenkins agent sorunu çözüldü, hızlı dönüşünüz için teşekkürler.',
      importance: 'low', has_attachments: false, received_at: iso(-50 * H), is_read: true, work_item_id: null },
  ]

  const meetings: Meeting[] = [
    { id: 1, zoom_meeting_id: '845 2231 9087', zoom_uuid: 'u1', topic: 'Haftalık DevOps senkronu', agenda: 'Açık işler, upgrade takvimi, engeller',
      host_email: 'ayse.yilmaz@firma.com', host_name: 'Ayşe Yılmaz', start_time: iso(2 * H), duration_min: 45, timezone: 'Europe/Istanbul',
      join_url: 'https://zoom.us/j/84522319087', status: 'scheduled', recording_url: null,
      participants: [{ name: 'Ayşe Yılmaz', email: 'ayse.yilmaz@firma.com', attended: false }, { name: 'Mehmet Kaya', email: 'mehmet.kaya@firma.com', attended: false },
        { name: 'Zeynep Demir', email: 'zeynep.demir@firma.com', attended: false }], notes: '', work_item_id: null },
    { id: 2, zoom_meeting_id: '912 0043 5521', zoom_uuid: 'u2', topic: 'OpenShift upgrade hazırlık toplantısı', agenda: 'Prod cluster upgrade riskleri',
      host_email: 'zeynep.demir@firma.com', host_name: 'Zeynep Demir', start_time: iso(-3 * H), duration_min: 30, timezone: 'Europe/Istanbul',
      join_url: 'https://zoom.us/j/91200435521', status: 'ended', recording_url: 'https://zoom.us/rec/share/ornek',
      participants: [{ name: 'Zeynep Demir', email: 'zeynep.demir@firma.com', attended: true }, { name: 'Selin Koç', email: 'selin.koc@firma.com', attended: true }],
      notes: 'Operator uyumluluk matrisi eksik. Aksiyon: operator sürümlerini doğrula, PDB\'leri gözden geçir.', work_item_id: 3 },
    { id: 3, zoom_meeting_id: '733 8812 0045', zoom_uuid: 'u3', topic: 'CAB — haftalık change değerlendirmesi', agenda: 'Bu haftanın change kayıtları',
      host_email: 'elif.sahin@firma.com', host_name: 'Elif Şahin', start_time: iso(26 * H), duration_min: 60, timezone: 'Europe/Istanbul',
      join_url: 'https://zoom.us/j/73388120045', status: 'scheduled', recording_url: null,
      participants: [{ name: 'Elif Şahin', email: 'elif.sahin@firma.com', attended: false }, { name: 'Ayşe Yılmaz', email: 'ayse.yilmaz@firma.com', attended: false }], notes: '', work_item_id: null },
  ]

  const items: WorkItem[] = [
    { id: 1, code: 'YVR-1001', title: 'MQ channel CRM.TO.CORE RETRY durumunda', description: emails[0].body_preview, source_type: 'mail', source_id: 1,
      status: 'in_progress', priority: 'high', category: 'Olay', assignee: 'mehmet.kaya', requester: 'Deniz Arslan', due_date: day(0), tags: ['mq', 'prod'],
      created_at: iso(-1.4 * H), updated_at: iso(-30 * 60_000), closed_at: null },
    { id: 2, code: 'YVR-1002', title: 'APPSRV07-09 server upgrade (RHEL 8)', description: emails[1].body_preview, source_type: 'mail', source_id: 2,
      status: 'new', priority: 'normal', category: 'Talep', assignee: null, requester: 'Murat Aydın', due_date: day(2), tags: ['upgrade'],
      created_at: iso(-3.9 * H), updated_at: iso(-3.9 * H), closed_at: null },
    { id: 3, code: 'YVR-1003', title: 'OpenShift operator uyumluluk kontrolü', description: 'Upgrade hazırlık toplantısından çıkan aksiyon maddesi.', source_type: 'zoom', source_id: 2,
      status: 'new', priority: 'high', category: 'Aksiyon', assignee: 'zeynep.demir', requester: 'Selin Koç', due_date: day(1), tags: ['openshift'],
      created_at: iso(-2.5 * H), updated_at: iso(-2.5 * H), closed_at: null },
    { id: 4, code: 'YVR-1004', title: 'Ödeme platformu release\'i için test ortamı deploy', description: emails[3].body_preview, source_type: 'mail', source_id: 4,
      status: 'waiting', priority: 'normal', category: 'Talep', assignee: 'can.ozturk', requester: 'Gizem Yıldız', due_date: day(-1), tags: ['release'],
      created_at: iso(-25 * H), updated_at: iso(-6 * H), closed_at: null },
    { id: 5, code: 'YVR-1005', title: 'Q1 sunucu decom listesi', description: 'Kullanılmayan sunucular için decom planı çıkarılacak.', source_type: 'manual', source_id: null,
      status: 'done', priority: 'low', category: 'Planlama', assignee: 'ayse.yilmaz', requester: 'admin', due_date: day(-3), tags: [],
      created_at: iso(-96 * H), updated_at: iso(-30 * H), closed_at: iso(-30 * H) },
    { id: 6, code: 'YVR-1006', title: 'Kart: mobil backend pipeline build adımında failed', description: 'TFS Kanban kartı — build adımında nexus bağımlılık hatası.', source_type: 'tfs', source_id: null,
      external_ref: 'TFS-48190', status: 'in_progress', priority: 'critical', category: 'Kanban', assignee: 'can.ozturk', requester: 'Burak Çetin', due_date: day(0), tags: ['pipeline'],
      created_at: iso(-8 * H), updated_at: iso(-1 * H), closed_at: null },
  ]

  // Geçmiş 14 güne yayılmış ek kayıtlar — grafikler/trendler anlamlı görünsün diye (deterministik)
  const TITLES = ['MQ kuyruk derinliği alarmı', 'Jenkins agent disk doluluğu', 'OpenShift test cluster upgrade', 'RHEL yama (patch) penceresi',
    'Batch job failed — gece mutabakatı', 'Change kaydı için CAB onayı', 'Eski DNS kayıtlarının temizliği (decom)', 'Helm chart versiyon güncellemesi',
    'Incident: API gateway timeout', 'Windows Server 2012 server upgrade', 'MQ sertifika yenilemesi', 'ArgoCD senkron hatası',
    'Backlog: log toplama geliştirmesi', 'Problem kaydı: tekrarlayan pod restart', 'Decom: eski rapor sunucuları', 'Sprint release deploy penceresi']
  const PEOPLE = ['Deniz Arslan', 'Murat Aydın', 'Burak Çetin', 'Selin Koç', 'Elif Şahin', 'Gizem Yıldız', 'Emre Kurt', 'Hakan Erdem']
  const SRC: WorkItem['source_type'][] = ['mail', 'tfs', 'jira', 'mail', 'zoom', 'jira', 'tfs', 'manual']
  const PRI: WorkItem['priority'][] = ['normal', 'normal', 'high', 'low', 'normal', 'critical']
  const ST: WorkItem['status'][] = ['done', 'done', 'done', 'in_progress', 'waiting', 'new', 'done', 'cancelled']
  for (let i = 0; i < 26; i++) {
    const id = items.length + 1
    const ageH = 10 + ((i * 37) % 320)
    const status = ST[i % ST.length]
    const closed = status === 'done' || status === 'cancelled'
    const src = SRC[i % SRC.length]
    items.push({
      id, code: `YVR-${1000 + id}`, title: TITLES[i % TITLES.length],
      description: src === 'tfs' ? 'TFS Kanban kartından gelen iş.' : src === 'jira' ? 'Jira kaydından gelen iş.' : 'Takıma iletilen talep.',
      source_type: src, source_id: null, external_ref: src === 'tfs' ? `TFS-${47000 + i * 17}` : src === 'jira' ? `OPS-${900 + i * 7}` : null,
      status, priority: PRI[(i * 5) % PRI.length],
      category: src === 'tfs' ? 'Kanban' : src === 'jira' ? 'Jira' : ['Talep', 'Olay', 'Aksiyon', 'Planlama'][i % 4], assignee: i % 7 === 0 && !closed ? null : TEAM[(i * 3) % TEAM.length],
      requester: PEOPLE[i % PEOPLE.length], due_date: day(Math.round(-ageH / 24) + 2 + (i % 4)), tags: [],
      created_at: iso(-ageH * H), updated_at: iso(-(ageH * 0.5) * H), closed_at: closed ? iso(-(ageH * 0.4) * H) : null,
    })
  }
  for (let i = 0; i < 9; i++) {
    const p = PEOPLE[(i + 2) % PEOPLE.length]
    emails.push({
      id: emails.length + 1, message_id: `<gen${i}@firma.com>`, thread_id: `g${i}`, mailbox: 'takim@firma.com',
      from_address: p.toLocaleLowerCase('tr').replace(' ', '.').replace(/ş/g, 's').replace(/ı/g, 'i').replace(/ç/g, 'c').replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/ğ/g, 'g') + '@firma.com',
      from_name: p, to_addresses: ['takim@firma.com'], cc_addresses: [], subject: TITLES[(i * 3 + 1) % TITLES.length],
      body_preview: 'Merhaba ekip, konuyla ilgili desteğinizi rica ederim. Detaylar aşağıdadır.', importance: i % 4 === 0 ? 'high' : 'normal',
      has_attachments: i % 3 === 0, received_at: iso(-(6 + i * 9) * H), is_read: i > 1, work_item_id: null,
    })
  }
  const MEET = ['Sprint planlama', 'OpenShift upgrade gözden geçirme', 'Incident sonrası değerlendirme', 'CAB toplantısı', 'MQ mimari gözden geçirme']
  for (let i = 0; i < 6; i++) {
    const off = [-50, -27, 5, 22, 30, 48][i]
    meetings.push({
      id: meetings.length + 1, zoom_meeting_id: `6${i}1 22${i} 90${i}${i}`, zoom_uuid: `gen${i}`, topic: MEET[i % MEET.length], agenda: '',
      host_email: 'ayse.yilmaz@firma.com', host_name: ['Ayşe Yılmaz', 'Mehmet Kaya', 'Can Öztürk'][i % 3], start_time: iso(off * H),
      duration_min: [30, 45, 60][i % 3], timezone: 'Europe/Istanbul', join_url: 'https://zoom.us/j/000', status: off < 0 ? 'ended' : 'scheduled',
      recording_url: null, participants: [{ name: 'Ayşe Yılmaz', email: 'ayse.yilmaz@firma.com', attended: off < 0 },
        { name: 'Zeynep Demir', email: 'zeynep.demir@firma.com', attended: off < 0 }, { name: 'Can Öztürk', email: 'can.ozturk@firma.com', attended: false }],
      notes: '', work_item_id: null,
    })
  }

  const activities: Activity[] = items.map((w, i) => ({
    id: i + 1, work_item_id: w.id, at: w.created_at, actor: 'sistem', action: 'created' as const,
    text: { mail: 'Mailden oluşturuldu', zoom: 'Toplantıdan oluşturuldu', tfs: 'TFS Kanban kartından oluşturuldu', jira: 'Jira kaydından oluşturuldu' }[w.source_type as string] ?? 'Kayıt oluşturuldu',
  }))

  return { emails, meetings, items, activities }
}
