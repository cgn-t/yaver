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
  ]
}

export function seedData() {
  const emails: Email[] = [
    { id: 1, message_id: '<a1@firma.com>', thread_id: 't1', mailbox: 'takim@firma.com', from_address: 'deniz.arslan@firma.com', from_name: 'Deniz Arslan',
      to_addresses: ['takim@firma.com'], cc_addresses: [], subject: 'Prod ortamında rapor servisi yavaş',
      body_preview: 'Merhaba, sabahtan beri aylık rapor ekranı 30 sn üzerinde açılıyor. Kontrol edebilir misiniz?',
      importance: 'high', has_attachments: false, received_at: iso(-1.5 * H), is_read: false, work_item_id: 1 },
    { id: 2, message_id: '<a2@firma.com>', thread_id: 't2', mailbox: 'takim@firma.com', from_address: 'elif.sahin@firma.com', from_name: 'Elif Şahin',
      to_addresses: ['takim@firma.com'], cc_addresses: ['yonetim@firma.com'], subject: 'Yeni kullanıcı yetki talebi',
      body_preview: 'Ekibimize katılan 3 kişi için uygulama erişimi açılmasını rica ederiz. Liste ektedir.',
      importance: 'normal', has_attachments: true, received_at: iso(-4 * H), is_read: true, work_item_id: 2 },
    { id: 3, message_id: '<a3@firma.com>', thread_id: 't3', mailbox: 'takim@firma.com', from_address: 'noreply@monitor.firma.com', from_name: 'İzleme Sistemi',
      to_addresses: ['takim@firma.com'], cc_addresses: [], subject: '[UYARI] Disk doluluk %85 — app-node-03',
      body_preview: 'app-node-03 üzerinde /var bölümü %85 doluluğa ulaştı.',
      importance: 'high', has_attachments: false, received_at: iso(-20 * 60_000), is_read: false, work_item_id: null },
    { id: 4, message_id: '<a4@firma.com>', thread_id: 't4', mailbox: 'takim@firma.com', from_address: 'burak.cetin@firma.com', from_name: 'Burak Çetin',
      to_addresses: ['takim@firma.com'], cc_addresses: [], subject: 'Sprint demo için ortam hazırlığı',
      body_preview: 'Cuma günkü demo için test ortamına son sürümün çıkılması gerekiyor.',
      importance: 'normal', has_attachments: false, received_at: iso(-26 * H), is_read: true, work_item_id: 4 },
    { id: 5, message_id: '<a5@firma.com>', thread_id: 't5', mailbox: 'takim@firma.com', from_address: 'selin.koc@firma.com', from_name: 'Selin Koç',
      to_addresses: ['takim@firma.com'], cc_addresses: [], subject: 'Teşekkürler — sorun çözüldü',
      body_preview: 'Dünkü bağlantı sorunu çözüldü, ilginiz için teşekkürler.',
      importance: 'low', has_attachments: false, received_at: iso(-50 * H), is_read: true, work_item_id: null },
  ]

  const meetings: Meeting[] = [
    { id: 1, zoom_meeting_id: '845 2231 9087', zoom_uuid: 'u1', topic: 'Haftalık takım senkronu', agenda: 'Açık işler, engeller, sprint durumu',
      host_email: 'ayse.yilmaz@firma.com', host_name: 'Ayşe Yılmaz', start_time: iso(2 * H), duration_min: 45, timezone: 'Europe/Istanbul',
      join_url: 'https://zoom.us/j/84522319087', status: 'scheduled', recording_url: null,
      participants: [{ name: 'Ayşe Yılmaz', email: 'ayse.yilmaz@firma.com', attended: false }, { name: 'Mehmet Kaya', email: 'mehmet.kaya@firma.com', attended: false },
        { name: 'Zeynep Demir', email: 'zeynep.demir@firma.com', attended: false }], notes: '', work_item_id: null },
    { id: 2, zoom_meeting_id: '912 0043 5521', zoom_uuid: 'u2', topic: 'Rapor servisi performans analizi', agenda: 'Yavaşlık kök neden analizi',
      host_email: 'mehmet.kaya@firma.com', host_name: 'Mehmet Kaya', start_time: iso(-3 * H), duration_min: 30, timezone: 'Europe/Istanbul',
      join_url: 'https://zoom.us/j/91200435521', status: 'ended', recording_url: 'https://zoom.us/rec/share/ornek',
      participants: [{ name: 'Mehmet Kaya', email: 'mehmet.kaya@firma.com', attended: true }, { name: 'Deniz Arslan', email: 'deniz.arslan@firma.com', attended: true }],
      notes: 'İndeks eksikliği tespit edildi. Aksiyon: indeks ekle, sorguyu optimize et.', work_item_id: 3 },
    { id: 3, zoom_meeting_id: '733 8812 0045', zoom_uuid: 'u3', topic: 'Müşteri entegrasyon toplantısı', agenda: 'API sözleşmesi',
      host_email: 'can.ozturk@firma.com', host_name: 'Can Öztürk', start_time: iso(26 * H), duration_min: 60, timezone: 'Europe/Istanbul',
      join_url: 'https://zoom.us/j/73388120045', status: 'scheduled', recording_url: null,
      participants: [{ name: 'Can Öztürk', email: 'can.ozturk@firma.com', attended: false }], notes: '', work_item_id: null },
  ]

  const items: WorkItem[] = [
    { id: 1, code: 'YVR-1001', title: 'Prod rapor servisi yavaşlığı', description: emails[0].body_preview, source_type: 'mail', source_id: 1,
      status: 'in_progress', priority: 'high', category: 'Olay', assignee: 'mehmet.kaya', requester: 'Deniz Arslan', due_date: day(0), tags: ['prod', 'performans'],
      created_at: iso(-1.4 * H), updated_at: iso(-30 * 60_000), closed_at: null },
    { id: 2, code: 'YVR-1002', title: 'Yeni kullanıcılar için yetki açılması', description: emails[1].body_preview, source_type: 'mail', source_id: 2,
      status: 'new', priority: 'normal', category: 'Talep', assignee: null, requester: 'Elif Şahin', due_date: day(2), tags: ['yetki'],
      created_at: iso(-3.9 * H), updated_at: iso(-3.9 * H), closed_at: null },
    { id: 3, code: 'YVR-1003', title: 'Rapor sorgusuna indeks eklenmesi', description: 'Performans toplantısından çıkan aksiyon maddesi.', source_type: 'zoom', source_id: 2,
      status: 'new', priority: 'high', category: 'Aksiyon', assignee: 'zeynep.demir', requester: 'Mehmet Kaya', due_date: day(1), tags: ['db'],
      created_at: iso(-2.5 * H), updated_at: iso(-2.5 * H), closed_at: null },
    { id: 4, code: 'YVR-1004', title: 'Sprint demo test ortamı hazırlığı', description: emails[3].body_preview, source_type: 'mail', source_id: 4,
      status: 'waiting', priority: 'normal', category: 'Talep', assignee: 'can.ozturk', requester: 'Burak Çetin', due_date: day(-1), tags: ['test'],
      created_at: iso(-25 * H), updated_at: iso(-6 * H), closed_at: null },
    { id: 5, code: 'YVR-1005', title: 'Sertifika yenileme takvimi', description: 'Q1 yenilemeleri için plan çıkarılacak.', source_type: 'manual', source_id: null,
      status: 'done', priority: 'low', category: 'Planlama', assignee: 'ayse.yilmaz', requester: 'admin', due_date: day(-3), tags: [],
      created_at: iso(-96 * H), updated_at: iso(-30 * H), closed_at: iso(-30 * H) },
    { id: 6, code: 'YVR-1006', title: 'Jira kayıtlarının senkronizasyonu', description: 'API servisinden gelen dış kayıt.', source_type: 'api', source_id: null,
      status: 'in_progress', priority: 'critical', category: 'Entegrasyon', assignee: 'admin', requester: 'Jira', due_date: day(0), tags: ['entegrasyon'],
      created_at: iso(-8 * H), updated_at: iso(-1 * H), closed_at: null },
  ]

  // Geçmiş 14 güne yayılmış ek kayıtlar — grafikler/trendler anlamlı görünsün diye (deterministik)
  const TITLES = ['VPN erişim talebi', 'Rapor çıktısında hatalı toplam', 'Yeni ortam için DNS kaydı', 'Log arşivleme politikası',
    'Kullanıcı şifre sıfırlama', 'API yanıt süresi uyarısı', 'Lisans yenileme hatırlatması', 'Test verisi maskeleme',
    'Dashboard yetki düzenlemesi', 'Batch iş gecikmesi', 'Mobil uygulama giriş sorunu', 'Sunucu yama planı',
    'Yedekleme doğrulaması', 'Müşteri veri çekme talebi', 'SSO entegrasyon testi', 'Kapasite raporu hazırlığı']
  const PEOPLE = ['Deniz Arslan', 'Elif Şahin', 'Burak Çetin', 'Selin Koç', 'Murat Aydın', 'Gizem Yıldız']
  const SRC: WorkItem['source_type'][] = ['mail', 'mail', 'mail', 'zoom', 'manual', 'api']
  const PRI: WorkItem['priority'][] = ['normal', 'normal', 'high', 'low', 'normal', 'critical']
  const ST: WorkItem['status'][] = ['done', 'done', 'done', 'in_progress', 'waiting', 'new', 'done', 'cancelled']
  for (let i = 0; i < 26; i++) {
    const id = items.length + 1
    const ageH = 10 + ((i * 37) % 320)
    const status = ST[i % ST.length]
    const closed = status === 'done' || status === 'cancelled'
    items.push({
      id, code: `YVR-${1000 + id}`, title: TITLES[i % TITLES.length], description: 'Takıma iletilen talep.',
      source_type: SRC[i % SRC.length], source_id: null, status, priority: PRI[(i * 5) % PRI.length],
      category: ['Talep', 'Olay', 'Aksiyon', 'Planlama'][i % 4], assignee: i % 7 === 0 && !closed ? null : TEAM[(i * 3) % TEAM.length],
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
  const MEET = ['Sprint planlama', 'Mimari gözden geçirme', 'Olay sonrası değerlendirme', 'Birebir: ekip lideri', 'Ürün demo']
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
    text: w.source_type === 'mail' ? 'Mailden oluşturuldu' : w.source_type === 'zoom' ? 'Toplantıdan oluşturuldu' : 'Kayıt oluşturuldu',
  }))

  return { emails, meetings, items, activities }
}
