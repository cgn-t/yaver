# GenAI Studio — OpenShift ENV rehberi

> Sürüm **0.8.1**. Ayrıntılı akış ve cevap biçimi: [`GENAI-STUDIO.md`](GENAI-STUDIO.md).
> Bu belgede ve repoda **gerçek adres, client id, secret ya da token yoktur**. Değerler yalnız OpenShift Secret'ında durur.

## Akış: önce token, sonra sorgu

1. **Token** — `POST {GENAI_SSO_URL}/auth/realms/genai-studio/protocol/openid-connect/token`
   `Content-Type: application/x-www-form-urlencoded`, gövde `grant_type=client_credentials`, `client_id`, `client_secret`, `scope=openid`.
2. **Sorgu** — `POST {GENAI_APPLICATION_BACKEND_URL}/chat/block`
   başlıklar `app-id`, `app-identifier`, `content-type: application/json`, `Authorization: Bearer <access_token>`;
   gövde `{"thread_id": "", "msg": "…", "request_context": {}}`.

Token `expires_in` süresince (60 sn pay ile) önbellekte tutulur; Chat Block 401 dönerse yenilenip bir kez tekrar denenir.
Curl örneklerindeki `Authorization: Bearer …` ve `Cookie` başlıklarını Secret'a yazmayın: token'ı Yaver kendisi alır, cookie gerekmez.

## Zorunlu ENV (6 adet)

| ENV | Curl örneğinde nereden alınır |
|---|---|
| `GENAI_APPLICATION_BACKEND_URL` | Chat Block adresinin `/chat/block` öncesi (yalnız kök, `https://…`) |
| `GENAI_SSO_URL` | Token adresinin `/auth/realms/…` öncesi (yalnız kök) |
| `GENAI_CHAT_CLIENT_ID` | token isteğindeki `client_id=` |
| `GENAI_CHAT_CLIENT_SECRET` | token isteğindeki `client_secret=` |
| `GENAI_APP_ID` | `app-id:` başlığı |
| `GENAI_APP_IDENTIFIER` | `app-identifier:` başlığı |

## İsteğe bağlı ENV (varsayılanı kodda)

| ENV | Varsayılan | Ne zaman verilir |
|---|---|---|
| `GENAI_SSO_REALM` | `genai-studio` | realm adı farklıysa |
| `GENAI_SSO_SCOPE` | `openid` | farklı scope gerekiyorsa; `none` → scope gönderilmez |
| `GENAI_SSO_TOKEN_PATH` | `/auth/realms/{realm}/protocol/openid-connect/token` | token yolu farklıysa |
| `GENAI_SSO_TOKEN_FORMAT` | `form` | token ucu JSON gövde istiyorsa `json` |
| `GENAI_CHAT_PATH` | `/chat/block` | Chat Block yolu farklıysa |
| `GENAI_ENABLED` | `true` | `false` → entegrasyon tamamen kapalı |
| `NODE_EXTRA_CA_CERTS` | – | HTTPS sertifikası kurum içi CA ile imzalıysa CA dosyasının yolu |

## Kurulum

```bash
# 1) Secret (değerleri yazın; bu komutu ya da doldurulmuş dosyayı repoya koymayın)
oc -n yaver create secret generic yaver-genai \
  --from-literal=GENAI_APPLICATION_BACKEND_URL='<...>' \
  --from-literal=GENAI_SSO_URL='<...>' \
  --from-literal=GENAI_CHAT_CLIENT_ID='<...>' \
  --from-literal=GENAI_CHAT_CLIENT_SECRET='<...>' \
  --from-literal=GENAI_APP_ID='<...>' \
  --from-literal=GENAI_APP_IDENTIFIER='<...>'
#    (alternatif: deploy/k8s/yaver-genai-secret.example.yaml şablonu)

# 2) İmaj ve yeniden başlatma
oc -n yaver set image deploy/yaver yaver=ghcr.io/cgn-t/yaver:0.8.1
oc -n yaver rollout restart deploy/yaver

# 3) Deneme: önce token, sonra Chat Block (token ekrana yazılmaz)
oc -n yaver rsh deploy/yaver node server/scripts/genai-ping.mjs "Merhaba"
```

Secret sonradan değişirse `oc -n yaver rollout restart deploy/yaver` yeterlidir.
Ekrandan kontrol: **Ayarlar → GenAI Studio** (her ENV için tanımlı/eksik, Bağlantı testi) ve **GenAI Çağrıları** (ham cevaplar).

## Sorun giderme

| Belirti | Neden / çözüm |
|---|---|
| Pod `ErrImagePull` / `ImagePullBackOff` | İmaj tag'i `0.8.1` (başında **v yok**; `v0.8.1` yalnız git tag'i). Cluster'ın `ghcr.io`'ya çıkışı / kurum içi mirror senkronu kontrol edin: `oc -n yaver describe pod -l app=yaver` |
| Ayarlarda "eksik" ENV | Secret adı `yaver-genai`, namespace `yaver` olmalı; Secret oluşturulduktan sonra pod yeniden başlatılmalı |
| `SSO token isteği HTTP 400/401` | client id/secret, realm (`GENAI_SSO_REALM`) ya da `GENAI_SSO_URL`'e yanlışlıkla yol eklenmiş |
| `Chat Block 401/403` | `GENAI_APP_ID` / `GENAI_APP_IDENTIFIER` ya da client'ın uygulamaya yetkisi |
| `self-signed certificate` / `unable to verify` | CA'yı ConfigMap olarak bağlayıp `NODE_EXTRA_CA_CERTS=/certs/ca.crt` verin |
| Cevap geliyor ama alanlar boş | Ayarlar → GenAI Studio → "(Demo) boş alanları rastgele doldur" (demo için açık, canlıda kapatın) |
