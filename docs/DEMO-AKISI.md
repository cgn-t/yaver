# Demo iş akışı ve Yaver GenAI sohbet

> Sürüm **0.9.11**. GenAI Studio bağlantısı: [`GENAI-ENV.md`](GENAI-ENV.md) · ayrıntı: [`GENAI-STUDIO.md`](GENAI-STUDIO.md)

## 1. Demo iş akışı

Jira, TFS Kanban, mail ve Zoom'dan "yeni gelmiş" gibi görünen 9 demo iş. Her birinin DB'de geçmişi olan bir konusu var
(MQ, Failed, Decom, OpenShift, DevOps/pipeline, batch, server upgrade), böylece AI benzer eski işlere, çözen kişilere ve
wiki sayfalarına dayanarak yorum yapar.

| Anahtar | Kaynak | Konu |
|---|---|---|
| `mq-payment-out` | Mail (Birim Yöneticisi) | PAYMENT.OUT kuyruğu doluyor |
| `mobil-failed` | Mail (Üst Yönetim) | Mobil transferler failed |
| `rhel-upgrade` | Mail | RHEL 7 server upgrade planı |
| `helm-timeout` | Jira `OPS-1201` | Helm upgrade timeout, pipeline failed |
| `eod-batch` | Jira `ITSM-3315` | EOD_MUTABAKAT ORA-01555 |
| `rapor-decom` | TFS `TFS-48401` | Rapor sunucularının decom'u |
| `mq-cert` | TFS `TFS-48402` | MQ TLS sertifikası bitiyor |
| `ocp-upgrade` | Zoom (Üst Yönetim) | OpenShift prod upgrade planlama |
| `jenkins-incident` | Zoom | Jenkins build'leri kuyrukta |

Akış normal girişle aynıdır: mail → e-posta + iş, Jira/TFS → `bulk-import`, Zoom → toplantı + iş. Sonra iş GenAI kuyruğuna
girer, cevap doğrulanıp yorum, konu, kategori ve öneriler DB'ye yazılır. GenAI kapalıysa pod içi örnek yorumlayıcı yorum yazar.

### API

| Uç | Ne yapar |
|---|---|
| `GET /api/demo/scenarios` | senaryo listesi |
| `POST /api/demo/run` | demo işleri oluşturur ve AI'a yorumlatır. Gövde (hepsi isteğe bağlı): `{"keys": ["mq-payment-out", …], "wait": true, "timeout_sec": 180, "reset": true, "interpret": true}` |
| `GET /api/demo/status` | demo işleri: AI çağrı durumu, yorum, bekleyen öneri sayısı |
| `POST /api/demo/clear` | yalnız demo işlerini (ve bağlı mail/toplantı/yorum/çağrı kayıtlarını) siler |
| `POST /api/demo/reset-all` | (admin) tüm veriyi örnek (seed) hâline döndürür, ayarlar korunur |

`run` tekrar çağrıldığında önce önceki demo işleri silinir; çift kayıt olmaz. `wait: true` verilirse cevap, tüm AI çağrıları
bitene kadar (en çok `timeout_sec`) bekler. Ekrandan: **Ayarlar → GenAI Studio → Demo iş akışı**.

```bash
TOKEN=$(curl -s https://<yaver>/api/auth/login -H 'Content-Type: application/json' -d '{"username":"admin","password":"admin"}' | jq -r .token)
curl -s -X POST https://<yaver>/api/demo/run -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"wait": true}' | jq '.status.items[] | {code, genai_status, agent_comment}'
```

Ajan token'ı (`yvr_…`, `items:write` yetkili) ile de çağrılabilir.

### Pod rollout

| ENV | Varsayılan (`deploy/k8s/yaver.yaml`) | Etki |
|---|---|---|
| `DEMO_RESET_ON_BOOT` | `true` | Her açılışta (rollout, pod yeniden başlaması) işler, mailler, toplantılar, ajan ve GenAI kayıtları **örnek (seed) hâline döner**. Ayarlar (GenAI davranışı, LDAP, API servisleri) korunur. Gerçek kullanımda `false` yapın. |
| `DEMO_AUTORUN` | `false` | `true` ise açılıştan birkaç saniye sonra demo akışı kendiliğinden bir kez çalışır. |

Rollout sonrası demoyu yeniden başlatmak için `POST /api/demo/run` (ya da ekrandaki düğme) yeterlidir.

## 2. Demo akışı 2: mail taslağını AI doldursun

Çok basit bir mail taslağı gelir: **yalnız gönderen ve tek cümle** (konu yok, öncelik yok, kime gideceği belli değil).
Yaver taslağın konusuna göre geçmiş işleri, wiki sayfalarını ve ekip yükünü toplar, GenAI Studio'dan (Chat Block) taslağı doldurmasını ister.
Dönen alanlar doğrulanır; eksik ya da geçersiz olanlar geçmişe dayalı kurallarla tamamlanır ve cevapta `filled` olarak listelenir.
Sonuç **mail + iş** olarak DB'ye yazılır: AI yorumu işin "ajan yorumu"na, taslağın ilk hâli işin yorumlarına eklenir.
GenAI kapalıysa aynı alanlar yerel (kural tabanlı) doldurucu ile üretilir.

Ekrandan: **Ayarlar → GenAI Studio → "Demo akışı 2"** kartı (örnek taslaklar ya da kendi taslağınız).

### AI'dan dönmesi gereken alanlar

| Alan | Zorunlu | Değer | Açıklama |
|---|---|---|---|
| `subject` | **evet** | metin | Mail konusu = iş başlığı (en fazla 120 karakter) |
| `body` | **evet** | metin | Düzenlenmiş mail metni: selamlama, 2-4 cümle net talep, imza |
| `priority` | **evet** | `low` · `normal` · `high` · `critical` | Öncelik (Türkçe "yüksek", "kritik" de kabul edilir) |
| `category` | **evet** | `Olay` · `Talep` · `Değişiklik` | İş kategorisi |
| `summary` | hayır | metin | Tek cümle özet |
| `topic_keys` | hayır | dizi | Konu anahtarları (0-3), yalnız verilen listeden (`mq`, `decom`, `failed` …) |
| `assignee` | hayır | kullanıcı adı | Atanacak kişi, yalnız ekip listesinden |
| `eta_days` | hayır | sayı | Tahmini çözüm süresi (gün) |
| `due_date` | hayır | `YYYY-AA-GG` | Son tarih (yoksa bugün + `eta_days`) |
| `status` | hayır | `new` · `in_progress` · `waiting` | Başlangıç durumu (atanan yoksa `new`) |
| `comment` | hayır | metin | Geçmişe dayalı kısa yorum (en fazla 4 satır, son satır `**Öneri:** …`) |
| `confidence` | hayır | 0-1 | Güven |
| `sources` | hayır | dizi | `[{type: db\|wiki, ref, title}]` |

Kurallar: listede olmayan konu anahtarı atılır, ekipte olmayan kişi atanmaz (yerel öneri kullanılır ve `warnings`'e yazılır),
geçersiz tarih yerine `eta_days`'ten tarih hesaplanır. Cevap `{status, last_message}` zarfıyla ya da ```` ```json ```` bloğu içinde gelebilir.

### Örnek AI yanıtı

```json
{
  "subject": "PAYMENT.OUT kuyruğu doldu, EFT çıkışları gecikiyor",
  "body": "Merhaba ekip,\n\nÖdeme kanalındaki kuyruk yine doldu, EFT çıkışları gecikiyor. Kök nedeni ve aksiyonu bugün paylaşabilir misiniz?\n\nTeşekkürler,\nDeniz Arslan",
  "summary": "Ödeme kuyruğu doldu, EFT'ler gecikiyor",
  "category": "Olay",
  "topic_keys": ["mq"],
  "priority": "high",
  "assignee": "mehmet.kaya",
  "eta_days": 1,
  "due_date": "2026-11-20",
  "status": "in_progress",
  "comment": "**Birim Yöneticisi** talebi, ilk dönüş SLA'sı 1 iş günü.\nBenzer iş **YVR-1033** mehmet.kaya tarafından 1 günde çözüldü.\n**Öneri:** mehmet.kaya üzerine atanması.",
  "confidence": 0.82,
  "sources": [{ "type": "db", "ref": "YVR-1033", "title": "MQ PAYMENT.IN kuyruğu doldu" }]
}
```

### API

```bash
# örnek taslaklar ve alan listesi
curl -s "$URL/api/demo/drafts" -H "Authorization: Bearer $TOKEN"

# örnek taslakların hepsini AI ile doldur (önceki taslak işleri silinir)
curl -s -X POST "$URL/api/demo/draft" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{}'

# kendi taslağınız
curl -s -X POST "$URL/api/demo/draft" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"drafts":[{"from":"deniz.arslan@firma.com","text":"kuyruk yine doldu eftler gecikiyor bakabilir misiniz"}]}'

# aynısı demo/run ile: {"scenario":"taslak", ...}
curl -s "$URL/api/demo/draft/status" -H "Authorization: Bearer $TOKEN"    # oluşan işler
curl -s -X POST "$URL/api/demo/draft/clear" -H "Authorization: Bearer $TOKEN"
```

Cevap (kısaltılmış):

```json
{
  "mode": "genai", "count": 1,
  "results": [{
    "key": "ozel-1",
    "input": { "from": "deniz.arslan@firma.com", "text": "kuyruk yine doldu eftler gecikiyor bakabilir misiniz" },
    "fields": { "subject": "PAYMENT.OUT kuyruğu doldu, EFT çıkışları gecikiyor", "priority": "high", "category": "Olay", "topic_keys": ["mq"],
                "assignee": "mehmet.kaya", "due_date": "2026-11-20", "status": "in_progress", "...": "..." },
    "filled": [], "warnings": [],
    "ai": { "...": "AI'ın ham yanıtı" },
    "email_id": 25, "item": { "id": 56, "code": "YVR-1056", "title": "PAYMENT.OUT kuyruğu doldu, EFT çıkışları gecikiyor" }
  }]
}
```

Kayıtlar `demo-taslak` etiketiyle işaretlenir; `POST /api/demo/clear` ikisini de siler, pod rollout'unda (`DEMO_RESET_ON_BOOT=true`) veri örnek hâline döner.

## 3. Yaver GenAI sohbet

Her sayfanın sağ kenarında **Yaver GenAI** sekmesi. Sekme yalnız yukarı-aşağı sürüklenebilir (konum tarayıcıda hatırlanır). Tıklanınca asistan sağ kenarda tam boy ve geniş (560-640 px) panel olarak açılır; Esc ile kapanır. Selam verilince kendini "takımınızın iş takip asistanı" olarak tanıtır.
Panelde serbest soru sorulur ya da önerilen sorulardan biri seçilir; cevabın altında kaynak işler ve wiki sayfaları listelenir.

- `POST /api/ai/ask` `{"message": "...", "thread_id": "<önceki cevaptaki>", "history": [{"role": "user|assistant", "content": "..."}]}`
  → `{"answer", "thread_id", "mode": "genai|yerel", "sources": [{type: db|wiki, ref, title}], "duration_ms"}`
- `GET /api/ai/suggestions` → demo soruları.

Yaver sorudaki konuya ve kelimelere göre DB'den benzer işleri (kim, kaç günde, çözüm notu), açık işleri, wiki sayfalarını
ve ekip yükünü bulur; soru ile bu bağlamı Chat Block'a gönderir (`request_context.source = "yaver-ai-sohbet"`).
Chat Block'un döndürdüğü `thread_id` bir sonraki soruda gönderilir, konuşma sürer. GenAI kapalıysa aynı bağlamdan yerel bir cevap
yazılır. Cevaptaki iş ve wiki etiketlerine tıklanınca ilgili kayıt açılır. "Yeni konuşma" düğmesi thread'i sıfırlar.

- **JSON cevap:** GenAI Studio uygulamasının talimatı modeli JSON'a zorlasa bile (ör. AI yorum şeması) cevap okunur metne çevrilir: özet, değerlendirme, öneri (öncelik, atanacak kişi, durum, SLA), önerilen değişiklikler, kaynaklar, sorular, uyarılar. Teknik alanlar (`schema_version`, `work_item_id` …) gösterilmez. Chat Block cevabı `{status, last_message}` gibi bir zarfla gelirse yalnız mesaj metni gösterilir; `Durum`, `Last message` gibi zarf alanları gizlenir (`server/src/ai-format.js`).
- **Geçmiş ve rollout:** Konuşma tarayıcı sekmesinde tutulur. Pod yeniden başladığında (rollout) sunucunun açılış kimliği (`boot_id`) değişir; arayüz bunu görünce konuşma geçmişini ve thread'i siler.
