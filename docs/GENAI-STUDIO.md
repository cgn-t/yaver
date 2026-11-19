# GenAI Studio (Chat Block) Entegrasyonu

> Sürüm **0.8.0**. Yaver'e gelen her iş (Mail, Zoom, TFS Kanban, Jira, manuel, API) arka planda kurum içi
> GenAI Studio **Chat Block** API'sine gönderilir. Dönen cevapla iş **yorumlanır**, **kategorize edilir**
> (konu, kategori) ve gerekiyorsa **durum / öncelik / atama / son tarih** değişikliği önerilir.
>
> Bağlantı bilgileri **yalnız ortam değişkeninden** (OpenShift Secret) okunur. Kodda, manifestte, veritabanında
> ve ekranda değerleri yoktur.

## 1. Akış

```
iş geldi (work_item.created)            mail geldi, işe bağlı değil (email.received)     Zoom toplantısı (meeting.created)
        │                                         │ 5 sn sonra                                    │
        │                                         ▼                                               ▼
        │                                   iş açılır (source_type=mail)                    iş açılır (source_type=zoom)
        │                                         │                                               │
        └──────────────► genai_job kuyruğu ◄──────┴───────────────────────────────────────────────┘
                               │
                               ▼
              bağlam: benzer eski işler (DB), Wiki, göndericinin mailleri, talep eden seviyesi, ekip yükü
                               │
                               ▼
              SSO token (client_credentials, önbellekli)  ──►  POST {application_backend_url}/chat/block
                                                                 app-id, app-identifier, Bearer
                                                                 {"thread_id": "", "msg": "<talimat + bağlam>", "request_context": {...}}
                               │
                               ▼
              cevaptaki JSON (AI-YANIT-FORMATI.md şeması) çıkarılır ve doğrulanır
                               │
       ┌───────────────┬───────┴─────────┬────────────────────────┬──────────────────────┐
       ▼               ▼                 ▼                        ▼                      ▼
   ajan yorumu     konu (MQ, Decom…)   kategori, etiket         durum/öncelik/atama/   sorular → işe yorum
   + kaynaklar     doğrudan atanır     doğrudan (politika)      son tarih → ONAY
   + güven
```

Hata olursa iş en fazla 4 kez (30 sn, 1 dk, 2 dk…) tekrar denenir; her deneme **Ayarlar > GenAI Çağrıları**'nda görünür.

## 2. OpenShift'te kurulum

Değerleri GenAI Studio ortam dosyanızdan (`GENAI_STUDIO.yml`) alın ve **Secret** olarak verin:

```bash
oc -n yaver create secret generic yaver-genai \
  --from-literal=GENAI_APPLICATION_BACKEND_URL='<application_backend_url>' \
  --from-literal=GENAI_SSO_URL='<sso_url>' \
  --from-literal=GENAI_SSO_TOKEN_PATH='<SSO token ucu>' \
  --from-literal=GENAI_CHAT_CLIENT_ID='<chat_client_id>' \
  --from-literal=GENAI_CHAT_CLIENT_SECRET='<chat_client_secret>' \
  --from-literal=GENAI_APP_ID='<app_id>' \
  --from-literal=GENAI_APP_IDENTIFIER='<app_identifier>'
oc -n yaver rollout restart deploy/yaver
```

`deploy/k8s/yaver.yaml` bu Secret'ı `envFrom: secretRef: yaver-genai (optional)` ile okur. Secret yoksa entegrasyon kapalı kalır.

| Değişken | Zorunlu | GenAI Studio karşılığı | Açıklama |
|---|---|---|---|
| `GENAI_APPLICATION_BACKEND_URL` | ✔ | `application_backend_url` | Chat Block'un adresi (sonuna `/chat/block` eklenir) |
| `GENAI_SSO_URL` | ✔ | `sso_url` | SSO adresi |
| `GENAI_SSO_TOKEN_PATH` | ✔ | (token isteği) | `GENAI_SSO_URL`'e eklenen token ucu |
| `GENAI_CHAT_CLIENT_ID` | ✔ | `chat_client_id` | client_credentials |
| `GENAI_CHAT_CLIENT_SECRET` | ✔ | `chat_client_secret` | client_credentials |
| `GENAI_APP_ID` | ✔ | `app_id` | `app-id` başlığı |
| `GENAI_APP_IDENTIFIER` | ✔ | `app_identifier` | `app-identifier` başlığı |
| `GENAI_ENABLED` | – | | `false` → tamamen kapalı |
| `GENAI_CHAT_PATH` | – | | varsayılan `/chat/block` |
| `GENAI_SSO_TOKEN_FORMAT` | – | | token isteğinin gövdesi: `form` (varsayılan, `application/x-www-form-urlencoded`) ya da `json` |
| `GENAI_SSO_SCOPE` | – | | gerekiyorsa `scope` |
| `NODE_EXTRA_CA_CERTS` | – | | kurum içi CA ile imzalı HTTPS için CA dosyasının yolu |

Token isteği: `POST {GENAI_SSO_URL}{GENAI_SSO_TOKEN_PATH}` gövdesi `grant_type=client_credentials&client_id=…&client_secret=…`.
Yanıttan `access_token` (ya da `token`) ve `expires_in` okunur; token süresi dolmadan yeniden kullanılır, Chat Block 401 dönerse yenilenip bir kez tekrar denenir.

> `data_client_id` / `data_client_secret` (content manager) bu sürümde kullanılmıyor.

## 3. Chat Block isteği

```http
POST {application_backend_url}/chat/block
app-id: <app_id>
app-identifier: <app_identifier>
content-type: application/json
Authorization: Bearer <SSO token>
```

```json
{
  "thread_id": "",
  "msg": "Sen Yaver iş takip uygulamasının IT operasyon triyaj asistanısın. Ekibe yeni bir iş geldi (kaynak: Mail).\n…KURALLAR…\nGEÇERLİ DEĞERLER\n- konu anahtarları: mq (MQ), openshift (OpenShift Upgrade), server (Server Upgrade), decom (Decom), devops (DevOps), failed (Failed hataları), servis (Servis Yönetimi), yazilim (Yazılım)\n- kategoriler: Olay, Talep, Değişiklik, …\n- ekip (kullanıcı adı: açık iş): ayse.yilmaz: 1, zeynep.demir: 2, mehmet.kaya: 3, can.ozturk: 4\nŞEMA\n{ …AiYorumYaniti… }\nwork_item_id=56, work_item_version=1\n<baglam>{ item, mail, contact, keywords, similar_items, wiki_pages, sender_mails, team_load, external }</baglam>",
  "request_context": { "source": "yaver", "work_item_id": 56, "work_item_code": "YVR-1056", "source_type": "mail", "schema_version": "1.0" }
}
```

- `msg`: talimatlar + geçerli değerler (konu anahtarları, kategoriler, durumlar, öncelikler, ekip) + şema + bağlam JSON'u.
  Bağlam varsayılan 12.000 karakterle sınırlanır (en az önemli kayıtlar atılır).
- `thread_id`: varsayılan her çağrıda boş (yeni thread). Ayarlardan "Aynı iş aynı thread" seçilirse aynı iş için önceki thread sürdürülür.
- Bağlam paketinin tamamı ve örnekleri: [`AI-ORNEK-ISTEK-YANIT.md`](AI-ORNEK-ISTEK-YANIT.md).

## 4. Chat Block'tan beklenen cevap

Model, `msg` içindeki talimata göre **AiYorumYaniti** JSON'u döndürür ([`AI-YANIT-FORMATI.md`](AI-YANIT-FORMATI.md)).
Chat Block cevabının şekli kuruma göre değişebileceği için Yaver esnek okur:

1. Cevap JSON ise metin şu alanlarda aranır: `msg`, `message`, `answer`, `response`, `content`, `text`, `output`, `result`, `reply`, `data` (iç içe de olabilir; `[{role, content}]` listesinde son asistan mesajı).
2. Metnin içindeki JSON çıkarılır: ```` ```json … ``` ```` bloğu ya da ilk `{` ile son `}` arası. Sondaki fazla virgüller tolere edilir.
3. `thread_id` cevabın herhangi bir seviyesinde varsa saklanır.

Örnek (çalışan cevap):

```json
{
  "thread_id": "c2f1…",
  "msg": "```json\n{\n  \"schema_version\": \"1.0\",\n  \"work_item_id\": 56,\n  \"work_item_version\": 1,\n  \"summary\": \"Üst yönetimden PAYMENT.IN kuyruk doluluğu…\",\n  \"comment\": \"**Üst Yönetim talebi** — …\\n**Öneri:** öncelik Kritik, atanan mehmet.kaya, durum İşlemde.\",\n  \"classification\": { \"topic_keys\": [\"mq\"], \"category\": \"Olay\", \"mgmt_level\": \"ust\", \"is_duplicate_of\": 47, \"is_actionable\": true },\n  \"sources\": [ { \"type\": \"db\", \"id\": 33, \"ref\": \"YVR-1033\", \"title\": \"MQ PAYMENT.IN kuyruğu doldu\" } ],\n  \"confidence\": 0.86,\n  \"changes\": [ { \"kind\": \"priority\", \"payload\": { \"priority\": \"critical\" }, \"confidence\": 0.9, \"reasoning\": \"…\" } ],\n  \"questions\": [], \"warnings\": []\n}\n```"
}
```

`classification.category` bu sürümde eklendi: `Olay`, `Talep`, `Değişiklik` ya da sistemde kullanılan diğer kategorilerden biri.

## 5. Cevap nasıl uygulanır

| Cevaptaki alan | Yaver'de | Onay |
|---|---|---|
| `comment`, `sources`, `confidence`, `summary`, `suggestion` | işin **Ajan yorumu** (`agent_comment_by = "GenAI Studio"`) | yok (bilgi) |
| `classification.topic_keys` | işin **konusu** (pano gruplaması). Metinden otomatik eşleşmenin yerine geçer ve sonradan ezilmez | yok (ayardan kapatılabilir) |
| `classification.category` / `changes[category]` | işin kategorisi | politika `category` (varsayılan doğrudan) |
| `changes[tags]` | etiketler (mevcutlara eklenir) | politika `tags` (varsayılan doğrudan) |
| `changes[status / priority / assign / due_date / edit]` | **Ajan önerisi** → iş detayında Onayla / Reddet | politika (varsayılan onay) |
| `questions` | işe "GenAI Studio sorusu: …" yorumu | yok |
| `warnings` + atılan öneriler | yorumun sonunda "_Uyarı: …_" satırları | yok |

Güvenlik kuralları (Yaver tarafında, modelden bağımsız):

- Yanıt başka bir işe aitse (`work_item_id` farklı) tamamen atılır.
- Bağlamda olmayan kaynak, ekipte olmayan kullanıcı, geçersiz durum/öncelik/tarih/kategori/konu atılır ve uyarı olarak yazılır.
- Genel güven `min_confidence` (varsayılan 0,4) altındaysa yalnız yorum yazılır.
- Değişiklik güveni 0,6 altındaysa, durum `done`/`cancelled` ise ya da bağımlı olduğu öneri onay bekliyorsa politika "doğrudan" olsa bile **onaya düşer**.
- Mail / TFS / Jira metni talimat değil veri olarak işaretlenir; içindeki "işi kapat" gibi ifadeler uygulanmaz.

## 6. Ekranlar

**Ayarlar > Yapay Zekâ > GenAI Studio**

- Hangi ortam değişkeninin tanımlı olduğu (değerler gösterilmez).
- **Bağlantı testi**: SSO'dan token alır, Chat Block'a test mesajı gönderir, cevabı gösterir.
- Davranış: etkin/duraklat, her yeni işi yorumlat, maili/Zoom'u işe çevir, konuyu AI belirlesin, önerileri gönder,
  en düşük güven, zaman aşımı, thread modu, bağlam üst sınırı, deneme sayısı, eşzamanlı çağrı, ek talimatlar.
- **Yorumu olmayan açık işleri yorumlat**: mevcut işleri toplu kuyruğa alır.

**Ayarlar > Yapay Zekâ > GenAI Çağrıları**: her çağrının sonucu, HTTP kodu, süresi, uygulananlar; satıra tıklayınca
ayrıştırılan yanıt ve Chat Block'un ham cevabı. Başarısız çağrı "Tekrar" ile yeniden kuyruğa alınır.

İş detayındaki **"Yeniden yorumlat"** GenAI etkinse Chat Block'a sorar (senkron).

## 7. API

| Yöntem | Yol | Kim | Açıklama |
|---|---|---|---|
| GET | `/api/settings/genai` | K | davranış ayarları + `env: [{name, required, set}]` + `missing` + son 7 gün sayaçları. Değer döndürmez |
| PUT | `/api/settings/genai` | Y | davranış ayarlarını kaydeder (bağlantı bilgisi kabul etmez) |
| POST | `/api/settings/genai/test` | Y | `{test_message?}` → `{ok, steps[], answer, thread_id, raw}` |
| GET | `/api/genai/jobs?work_item_id=&status=&limit=` | K, A `items:read` | çağrı geçmişi |
| GET | `/api/genai/jobs/{id}` | K | tek çağrı: ham yanıt + ayrıştırılan sonuç |
| POST | `/api/genai/jobs/{id}/retry` | K | tekrar kuyruğa al |
| POST | `/api/genai/interpret-open` | K | `{only_missing?: true, limit?: 100}` açık işleri kuyruğa al |
| POST | `/api/work-items/{id}/interpret` | K, A `items:write` | GenAI etkinse Chat Block, değilse pod içi örnek yorumlayıcı |

LangGraph ajanı (AJAN-API.md) ile birlikte de çalışır: ikisi de aynı öneri/onay altyapısını kullanır. GenAI etkinken pod içi örnek yorumlayıcı devre dışı kalır.

## 8. Sorun giderme

| Belirti (GenAI Çağrıları / Bağlantı testi) | Neden |
|---|---|
| `Eksik ortam değişkenleri: …` | Secret oluşturulmamış ya da pod yeniden başlatılmamış |
| `SSO token isteği HTTP 400/401` | token ucu (`GENAI_SSO_TOKEN_PATH`), client id/secret ya da gövde biçimi (`GENAI_SSO_TOKEN_FORMAT=json` deneyin) |
| `… UNABLE_TO_VERIFY_LEAF_SIGNATURE` / `SELF_SIGNED_CERT_IN_CHAIN` | kurum CA'sı: `NODE_EXTRA_CA_CERTS` |
| `ENOTFOUND` / `ECONNREFUSED` / zaman aşımı | pod'dan GenAI adresine ağ erişimi (NetworkPolicy / egress) |
| `Chat Block 403` | `app-id` / `app-identifier` uyuşmuyor ya da uygulamanın yetkisi yok |
| `Yanıtta JSON bulunamadı` | model JSON dışında metin döndürdü; ham yanıta bakın, Ayarlar'daki "Ek talimatlar"a "yalnız JSON döndür" vurgusu ekleyin |

Test: `server/test/genai-e2e.mjs` sahte SSO + Chat Block ile tüm akışı doğrular (CI'da çalışır).
