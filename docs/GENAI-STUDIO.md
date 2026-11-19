# GenAI Studio (Chat Block) Entegrasyonu

> Sürüm **0.8.2**. Yaver'e gelen her iş (Mail, Zoom, TFS Kanban, Jira, manuel, API) arka planda kurum içi
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

> Kısa ENV rehberi ve sorun giderme: [`GENAI-ENV.md`](GENAI-ENV.md).

Değerleri GenAI Studio ortam dosyanızdan (`GENAI_STUDIO.yml`) alın ve **Secret** olarak verin:

```bash
oc -n yaver create secret generic yaver-genai \
  --from-literal=GENAI_APPLICATION_BACKEND_URL='<application_backend_url>' \
  --from-literal=GENAI_SSO_URL='<sso_url>' \
  --from-literal=GENAI_CHAT_CLIENT_ID='<chat_client_id>' \
  --from-literal=GENAI_CHAT_CLIENT_SECRET='<chat_client_secret>' \
  --from-literal=GENAI_APP_ID='<app_id>' \
  --from-literal=GENAI_APP_IDENTIFIER='<app_identifier>'
oc -n yaver rollout restart deploy/yaver

# bağlantı denemesi (önce token, sonra Chat Block; token ekrana yazılmaz)
oc -n yaver rsh deploy/yaver node server/scripts/genai-ping.mjs "Merhaba"
```

`deploy/k8s/yaver.yaml` bu Secret'ı `envFrom: secretRef: yaver-genai (optional)` ile okur. Secret yoksa entegrasyon kapalı kalır.

| Değişken | Zorunlu | GenAI Studio karşılığı | Açıklama |
|---|---|---|---|
| `GENAI_APPLICATION_BACKEND_URL` | ✔ | `application_backend_url` | Chat Block'un adresi (sonuna `/chat/block` eklenir) |
| `GENAI_SSO_URL` | ✔ | `sso_url` | SSO kök adresi (yol yok) |
| `GENAI_CHAT_CLIENT_ID` | ✔ | `chat_client_id` | client_credentials |
| `GENAI_CHAT_CLIENT_SECRET` | ✔ | `chat_client_secret` | client_credentials |
| `GENAI_APP_ID` | ✔ | `app_id` | `app-id` başlığı |
| `GENAI_APP_IDENTIFIER` | ✔ | `app_identifier` | `app-identifier` başlığı |
| `GENAI_ENABLED` | – | | `false` → tamamen kapalı |
| `GENAI_CHAT_PATH` | – | | varsayılan `/chat/block` |
| `GENAI_SSO_REALM` | – | | varsayılan `genai-studio` |
| `GENAI_SSO_TOKEN_PATH` | – | | varsayılan `/auth/realms/{realm}/protocol/openid-connect/token` (`{realm}` yerine `GENAI_SSO_REALM` konur) |
| `GENAI_SSO_SCOPE` | – | | varsayılan `openid`; `none` verilirse scope gönderilmez |
| `GENAI_SSO_TOKEN_FORMAT` | – | | token isteğinin gövdesi: `form` (varsayılan, `application/x-www-form-urlencoded`) ya da `json` |
| `GENAI_CA_CERT` | – | | kurum içi CA (PEM metni), yalnız GenAI çağrılarında |
| `GENAI_TLS_INSECURE` | – | | `true` → GenAI çağrılarında sertifika doğrulanmaz (yalnız demo) |
| `NODE_EXTRA_CA_CERTS` | – | | kurum içi CA ile imzalı HTTPS için CA dosyasının yolu |

Akış: **önce token, sonra sorgu.**

```http
POST {GENAI_SSO_URL}/auth/realms/genai-studio/protocol/openid-connect/token
Content-Type: application/x-www-form-urlencoded

grant_type=client_credentials&client_id={GENAI_CHAT_CLIENT_ID}&client_secret={GENAI_CHAT_CLIENT_SECRET}&scope=openid
```
```http
POST {GENAI_APPLICATION_BACKEND_URL}/chat/block
app-id: {GENAI_APP_ID}
app-identifier: {GENAI_APP_IDENTIFIER}
content-type: application/json
Authorization: Bearer {access_token}

{"thread_id": "", "msg": "…", "request_context": {}}
```
Curl örneklerindeki `Cookie` başlığı yük dengeleyicinin oturum çerezidir; gerekmez, Yaver göndermez.
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

### Playground'da görülen gerçek cevap ve Yaver'in okuması

GenAI Studio Playground'da model cevabı **düz JSON** olarak döndü (kod bloğu yok). Şemadan farkları ve Yaver'in yaptığı:

| Gerçek cevapta | Yaver ne yapar |
|---|---|
| `sources[]` içinde `id` yok, `ref: "25"` (mail id), `type: "mail"` | `ref` sayıysa id kabul edilir; `mail-25`, `YVR-1033`, wiki slug da çözülür. Bağlamda yoksa atılır, uyarı yazılır |
| Konu değişikliği `{"kind": "edit", "payload": {"topic_keys": ["mq", "failed"]}}` | `edit` içindeki alanlar türlerine bölünür: `topic_keys` → konu, `status` → durum, `priority` → öncelik, `assignee` → atama, `category`, `tags`, `title`/`requester` → düzenleme |
| Öncelik ve durum yalnız `suggestion` içinde (`"priority": "high", "status": "waiting"`), `changes`'te yok | `promote_suggestion` (varsayılan açık): `changes`'te olmayan öncelik/durum/atama/son tarih, genel güvenle **öneri** yapılır (onaya düşer) |
| `"high"`, `"waiting"`, `"diger"` | Yaver değerleriyle aynı. Türkçe yazımlar da çevrilir: `Yüksek`/`Kritik`, `İşlemde`/`Bekliyor`/`Tamamlandı`/`İptal` |
| `classification.mgmt_level: "diger"` + `warnings: ["Yönetici seviyesi (mgmt_level) belirlenemedi"]` | seviye kişi rehberinden gelir, AI değiştiremez. Farklıysa uyarı eklenir; uyarılar yorumun sonunda görünür |
| `classification.category` yok | kategori değişmez |

`classification.category` bu sürümde eklendi: `Olay`, `Talep`, `Değişiklik` ya da sistemde kullanılan diğer kategorilerden biri.

### Boş kalan alanların rastgele doldurulması (demo)

Ayar `fill_missing` (Ayarlar → GenAI Studio → "(Demo) Cevapta boş kalan alanları rastgele doldur", varsayılan **açık**).
Cevapta boş, `null` ya da hiç olmayan alanlar doğrulamadan önce doldurulur. Değerler bağlama uygun seçilir, bağlamda karşılığı yoksa rastgele seçilir:

| Alan | Nasıl doldurulur |
|---|---|
| `summary` | işin başlığı |
| `comment` | "<başlık> talebi incelendi. Benzer kayıt: YVR-…" |
| `confidence` | 0.60–0.90 arası rastgele |
| `classification.topic_keys` | işin mevcut konusu, yoksa tanımlı konulardan rastgele biri (changes'te konu değişikliği varsa dokunulmaz) |
| `classification.category` | işin mevcut kategorisi, yoksa `Olay` / `Talep` / `Değişiklik` / kayıtlı kategorilerden rastgele |
| `classification.mgmt_level` | kişi rehberindeki seviye (boşsa ya da AI `diger` dediyse ve rehberde farklıysa), yoksa rastgele |
| `classification.is_actionable` | `true` |
| `suggestion.priority` | Üst Yönetim ise `high`/`critical`, değilse `normal`/`high` rastgele |
| `suggestion.assignee` | işin atananı, yoksa ekipten rastgele biri |
| `suggestion.status` | işin durumu `new` değilse aynısı, değilse `in_progress` |
| `suggestion.eta_days` | 1, 2, 3 ya da 5 gün rastgele |
| `suggestion.due_date` | bugün + `eta_days` |
| `suggestion.sla` | talep edenin seviyesine göre SLA |
| `sources` | bağlamdaki benzer işlerden ya da wiki sayfalarından rastgele biri |

Doldurulmayanlar (boş olması anlamlı): `questions`, `warnings`, `changes`, `is_duplicate_of`.
Doldurulan alanlar yorumun sonunda "Uyarı: Boş alanlar rastgele dolduruldu: …" olarak görünür. GenAI Çağrıları detayında
`ai` modelin ham cevabıdır, `ai_filled` doldurulmuş hâlidir. Doldurulan öncelik/durum/atama/son tarih `promote_suggestion`
açıksa öneri olarak onaya düşer. Canlı kullanımda bu ayarı kapatın.

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
- Davranış: etkin/duraklat, her yeni işi yorumlat, maili/Zoom'u işe çevir, konuyu AI belirlesin, önerileri gönder, suggestion'dakileri de öner,
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
| `SSO token isteği HTTP 400/401` | realm / token ucu (`GENAI_SSO_REALM`, `GENAI_SSO_TOKEN_PATH`), client id/secret ya da gövde biçimi (`GENAI_SSO_TOKEN_FORMAT=json` deneyin) |
| `… UNABLE_TO_VERIFY_LEAF_SIGNATURE` / `SELF_SIGNED_CERT_IN_CHAIN` | kurum CA'sı: `NODE_EXTRA_CA_CERTS` |
| `ENOTFOUND` / `ECONNREFUSED` / zaman aşımı | pod'dan GenAI adresine ağ erişimi (NetworkPolicy / egress) |
| `Chat Block 403` | `app-id` / `app-identifier` uyuşmuyor ya da uygulamanın yetkisi yok |
| `Yanıtta JSON bulunamadı` | model JSON dışında metin döndürdü; ham yanıta bakın, Ayarlar'daki "Ek talimatlar"a "yalnız JSON döndür" vurgusu ekleyin |

Test: `server/test/genai-e2e.mjs` sahte SSO + Chat Block ile tüm akışı doğrular (CI'da çalışır).
