# Yaver API'sini dışarıdan çağırma (curl)

`/api/...` uçlarının hepsi (giriş ve `/api/health` hariç) **`Authorization: Bearer <token>`** başlığı ister.
Başlık yoksa ya da token geçersizse cevap şudur:

```json
{"detail":"Oturum geçersiz, tekrar giriş yapın","code":"unauthorized"}
```

Token almanın iki yolu var.

| Yol | Ne zaman | Token |
|---|---|---|
| **1. Kullanıcı girişi** | Elle deneme, demo | `POST /api/auth/login` cevabındaki `token` (12 saat geçerli) |
| **2. Ajan token'ı** | Entegrasyon, betik, zamanlanmış iş (oturumsuz) | `yaver-secrets` içindeki `AGENT_TOKEN` (`yvr_…`) |

Aşağıdaki örneklerde adres değişkendir; kendi route/servis adresinizi yazın:

```bash
URL=https://<yaver-adresi>      # ör. OpenShift route'u; pod içinden: http://localhost:8080
```

> Kurum içi sertifika kullanıyorsanız `curl -k` ya da `--cacert <ca.pem>` ekleyin.

---

## 1) Kullanıcı girişiyle

### Adım 1: token al

```bash
TOKEN=$(curl -s -X POST "$URL/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"admin"}' \
  | sed -E 's/.*"token":"([^"]+)".*/\1/')
echo "$TOKEN"   # boş değilse giriş başarılı
```

Cevap: `{"token":"…","username":"…","full_name":"…","role":"admin"}`. Kullanıcı adı veya şifre yanlışsa `401 Kullanıcı adı veya şifre hatalı` döner.

### Adım 2: isteği Bearer başlığıyla at

```bash
curl -s -X POST "$URL/api/bulk-send-mail" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
    "mails": [
      {
        "from_address": "deniz.arslan@firma.com",
        "from_name": "Deniz Arslan",
        "subject": "MQ kuyruğu doldu",
        "body": "PAYMENT.IN kuyruğu doldu, mesajlar DLQ ya düşüyor",
        "importance": "high"
      }
    ]
  }'
```

Örnek verilerle hızlı deneme (havuzdan rastgele N mail):

```bash
curl -s -X POST "$URL/api/bulk-send-mail" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"count":5}'
```

---

## 2) Oturumsuz: ajan token'ı

Entegrasyonlar için giriş yapmanız gerekmez. `yaver-secrets` Secret'ındaki `AGENT_TOKEN` doğrudan Bearer olarak kullanılır
(`yvr_` ile başlar, en az 24 karakter; pod açılışta bunu `yaver-ajan` kullanıcısına tanımlar).

```bash
AGENT_TOKEN=$(oc get secret yaver-secrets -n yaver -o jsonpath='{.data.AGENT_TOKEN}' | base64 -d)

curl -s -X POST "$URL/api/bulk-send-mail" \
  -H "Authorization: Bearer $AGENT_TOKEN" -H 'Content-Type: application/json' \
  -d '{"count":3}'
```

Ek token gerekirse yönetici oturumuyla üretilebilir (düz metin yalnız bu cevapta döner):

```bash
curl -s -X POST "$URL/api/admin/tokens" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"name":"mail-entegrasyonu","scopes":["emails:write","items:write","items:read"]}'
```

Ajan token'ı yalnız verdiği kapsamlarla çalışır: `bulk-send-mail` için `emails:write`, `bulk-import` için `items:write` gerekir.
Ayarlar, LDAP ve token yönetimi ajan token'ıyla çağrılamaz.

---

## `POST /api/bulk-send-mail` gövdesi

| Alan | Zorunlu | Açıklama |
|---|---|---|
| `mails` | — | Mail dizisi. Verilmezse `count` kadar örnek mail üretilir |
| `mails[].from_address` | **evet** | Gönderen e-posta (`@` içermeli). `from` da kabul edilir |
| `mails[].subject` | **evet** | Konu |
| `mails[].from_name` | hayır | Gönderen adı (yoksa kişi rehberinden bulunur) |
| `mails[].body` | hayır | Mail metni (`body_text` da kabul edilir) |
| `mails[].importance` | hayır | `low`, `normal` (varsayılan) ya da `high` |
| `count` | hayır | `mails` yoksa örnek mail sayısı (1–50, varsayılan 5) |
| `create_items` | hayır | `false` verilirse yalnız mail kaydedilir, iş açılmaz |

- Tek istekte en fazla **200** mail.
- Başarılı cevap `201`: `{"count":…, "emails":[…], "work_items":[…]}`. Açılan işler GenAI açıksa AI tarafından yorumlanır.

## `POST /api/bulk-import` (Jira / TFS kalemleri)

```bash
curl -s -X POST "$URL/api/bulk-import" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"items":[{"source_type":"jira","external_ref":"OPS-2001","title":"MQ sertifika yenilemesi","description":"TLS sertifikası 14 gün içinde bitiyor","requester_email":"deniz.arslan@firma.com","priority":"high"}]}'
```

`source_type`: `jira` ya da `tfs`. Aynı `source_type` + `external_ref` ikinci kez eklenmez (`skipped`). Örnek üretmek için `{"count":4}`.

---

## "Oturum geçersiz" alıyorum: kontrol listesi

1. **Başlık var mı?** `-H "Authorization: Bearer $TOKEN"`: `Bearer` ve bir boşluk şart. `echo "$TOKEN"` boşsa giriş adımı başarısızdır.
2. **Pod yeniden başladı mı (rollout)?** Giriş token'ı `TOKEN_SECRET` ile imzalanır. Bu env verilmezse anahtar her açılışta yeniden üretilir ve
   rollout öncesi alınan token geçersiz olur. Ya tekrar giriş yapın ya da `yaver-secrets` içinde sabit bir `TOKEN_SECRET` verin
   (`deploy/k8s/yaver.yaml`'da tanımlı; değer üretmek için `openssl rand -hex 32`).
3. **12 saat geçti mi?** Giriş token'ı 12 saat geçerlidir (`TOKEN_TTL_HOURS` ile değişir). Uzun süreli entegrasyonda ajan token'ını kullanın.
4. **Ajan token'ı tanımlı mı?** Pod logunda `[auth] AGENT_TOKEN ile ajan token'ı tanımlı` satırı görünmeli. Değer 24 karakterden kısaysa yok sayılır.
5. `403 … kapsamı gerekir` alıyorsanız token geçerli ama kapsamı eksik: yeni token'ı gereken kapsamla üretin.

Ajan API'sinin tamamı: [AJAN-API.md](AJAN-API.md) · Demo iş akışı uçları: [DEMO-AKISI.md](DEMO-AKISI.md)
