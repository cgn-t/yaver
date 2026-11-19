# Yaver — DB tablo / kolon önerisi

DDL: [`db/schema-mssql.sql`](../db/schema-mssql.sql) (MSSQL, Jumbo ile aynı altyapı varsayıldı).

## Temel fikir

Takıma gelen **her iş tek bir merkez tabloda (`work_item`)** tutulur. Mail ve Zoom kendi
ham verisini kendi tablosunda saklar; bir mail ya da toplantı aksiyonu "işe dönüştürülünce"
`work_item.source_type + source_id` ile kaynağına bağlanır. Böylece:

- "Bize gelen tüm işler" tek sorgudur (kaynaktan bağımsız filtre, rapor, SLA).
- Yeni bir kaynak (Jira, ServiceNow, Teams…) eklemek için yeni tablo şart değildir:
  `source_type = 'api'` + `external_ref` yeterlidir.
- Ham veri (mail gövdesi, katılımcı listesi) iş tablosunu şişirmez.

```
app_user ─┬─< work_item >─┬── email (source_type='mail')   ──< email_attachment
          │               ├── meeting (source_type='zoom')  ──< meeting_participant
          │               └── (source_type='api', external_ref)
          ├─< work_item_activity   (tarihçe + yorumlar)
          └─< audit_log
api_poll_config ──< api_poll_log
app_setting (category='ldap' | 'general')
```

## Tablolar

| Tablo | Amaç | Önemli kolonlar |
|---|---|---|
| `app_user` | Lokal admin + LDAP'tan gelen kullanıcılar | `username` (tekil), `auth_source` (local/ldap), `role`, `team_group` |
| `email` | Posta kutusundan çekilen mailler | `message_id` (**tekil**, tekrar çekmede çift kayıt yok), `thread_id`, `from_*`, `subject`, `body_preview`, `importance`, `received_at`, `is_read`, `work_item_id` |
| `email_attachment` | Ek meta verisi | dosya içeriği DB'de değil, `storage_path` |
| `meeting` | Zoom toplantıları | `zoom_uuid` (**tekil**, her oturum), `zoom_meeting_id`, `topic`, `start_time`, `duration_min`, `status`, `recording_url`, `notes` |
| `meeting_participant` | Katılımcılar | `email`, `join_time`, `leave_time`, `attended` |
| `work_item` | **Merkez iş tablosu** | `code` (YVR-1001), `title`, `source_type`, `source_id`, `external_ref`, `status`, `priority`, `category`, `assignee_id`, `requester`, `due_date`, `closed_at` |
| `work_item_tag` | Etiketler | (work_item_id, tag) |
| `work_item_activity` | Tarihçe/yorum | `action` (created/status/assign/priority/comment), `old_value`, `new_value`, `comment` |
| `api_poll_config` | Ayarlar > API Çağrı Servisi | `url`, `method`, `interval_sec` (**varsayılan 60**), `timeout_sec`, `auth_*`, `target`, `last_run_at`, `locked_until` |
| `api_poll_log` | Çağrı geçmişi | `started_at`, `duration_ms`, `http_status`, `ok`, `record_count`, `message` |
| `app_setting` | Anahtar–değer ayarlar (LDAP, genel) | `category`, `key`, `value`, `is_secret` |
| `audit_log` | Kim neyi değiştirdi | `entity`, `entity_id`, `action`, `diff_json` |

### Değer kümeleri

- `work_item.status`: `new` (Yeni) · `in_progress` (Devam Ediyor) · `waiting` (Beklemede) · `done` (Tamamlandı) · `cancelled` (İptal)
- `work_item.priority`: `low` · `normal` · `high` · `critical`
- `work_item.source_type`: `mail` · `zoom` · `manual` · `api`
- `meeting.status`: `scheduled` · `live` · `ended` · `cancelled`

### LDAP ayarları (`app_setting`, category = `ldap`)

Jumbo'daki alanların aynısı: `enabled, server, port, use_ssl, start_tls, skip_cert_verify,
ca_cert, bind_dn, bind_password (is_secret), base_dn, user_filter, user_attr, email_attr,
display_attr, group_base, group_filter, team_group_ou, timeout_sec`.

## Tasarım notları

1. **Tekrar çekmede çift kayıt yok:** `email.message_id`, `meeting.zoom_uuid` ve
   `work_item(source_type, external_ref)` tekil. API servisi her dakika çalışsa da aynı kayıt bir kez yazılır.
2. **Gizli bilgiler şifreli:** `api_poll_config.auth_secret_enc` ve `app_setting.is_secret=1`
   satırları Fernet ile şifrelenir (Jumbo'daki `settings` servisiyle aynı yaklaşım).
3. **Zamanlayıcı backend'de:** Önyüzdeki servis uygulama açıkken tarayıcıda çalışır (demo/geliştirme).
   Üretimde backend zamanlanmış görevi `api_poll_config`'i okuyup çalıştırmalı; çoklu pod'da
   `locked_until` ile aynı servis iki kez çalışmaz.
4. **Tüm tarihler UTC** (`DATETIME2` + `SYSUTCDATETIME()`); ekranda yerel saate çevrilir.
5. **Log temizliği:** `api_poll_log` dakikada bir satır/servis üretir (~1.440/gün). 30 günden eski satırlar
   gecelik bir işle silinmeli.

## Önyüzün beklediği API uçları (backend için)

| Uç | Açıklama |
|---|---|
| `POST /api/auth/login` | `{username, password}` → token (lokal admin + LDAP) |
| `GET /api/work-items?status=&source=&assignee=&q=` · `POST` · `PATCH /api/work-items/{id}` | İşler |
| `GET/POST /api/work-items/{id}/activity` | Tarihçe, yorum ekleme |
| `GET /api/emails` · `PATCH /api/emails/{id}` · `POST /api/emails/{id}/convert` | Mailler, işe dönüştürme |
| `GET /api/meetings` · `PATCH /api/meetings/{id}` | Zoom toplantıları, notlar |
| `GET/POST/PUT/DELETE /api/settings/api-services` · `POST /api/settings/api-services/{id}/run` | API çağrı servisi |
| `GET /api/settings/api-services/logs` | Çağrı geçmişi |
| `GET/PUT /api/settings/ldap` · `POST /api/settings/ldap/test` | LDAP |
| `GET/PUT /api/settings/general` | Genel ayarlar |

Önyüzde bu uçların yerini şimdilik `frontend/src/data/store.ts` (tarayıcı içi veri) tutuyor;
backend gelince yalnız bu dosya değişir, sayfalar etkilenmez.
