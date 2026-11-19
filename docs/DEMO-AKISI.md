# Demo iş akışı ve Yaver AI sohbet

> Sürüm **0.9.6**. GenAI Studio bağlantısı: [`GENAI-ENV.md`](GENAI-ENV.md) · ayrıntı: [`GENAI-STUDIO.md`](GENAI-STUDIO.md)

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

## 2. Yaver AI sohbet

Her sayfanın sağ kenarında **Yaver AI** sekmesi. Sekme yalnız yukarı-aşağı sürüklenebilir (konum tarayıcıda hatırlanır). Tıklanınca asistan sağ kenarda tam boy panel olarak açılır; Esc ile kapanır. Selam verilince kendini "takımınızın iş takip asistanı" olarak tanıtır.
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
