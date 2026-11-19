# YAVER — Takım İş Takip Platformu

Takıma gelen mailleri, Zoom toplantılarını ve diğer tüm işleri tek yerden takip eden uygulama.
Başlangıç taslağı **Jumbo** (cgn-t/ju) önyüzü; v0.2'den itibaren kendi tasarım sistemi var.

```
frontend/   React + TypeScript + Vite + MUI arayüz
server/     Node (Express) API + gömülü veritabanı (PGlite): giriş, işler, mail, toplantı, ayarlar, zamanlanmış API servisi; arayüzü de sunar
db/postgres 01-schema.sql (tablolar) + 02-seed.sql (örnek veri) — ilk açılışta otomatik çalışır
deploy/k8s  yaver.yaml: TEK POD, TEK KONTEYNER, veriler için bir disk (PVC)
```

## Kurulum: tek pod, tek konteyner

Ayrı bir veritabanı sunucusu **yok**. Uygulama, Node süreci içinde çalışan gömülü bir PostgreSQL (PGlite) kullanır;
veriler konteynerdeki `/data` klasöründe dosya olarak durur. k8s'te bu klasör PVC'ye bağlıdır, pod yeniden başlasa da
veriler kalır. İlk açılışta tablolar oluşturulur ve örnek veri yüklenir. Bağlantı ayarı, şifre, ayrı konteyner yok.

```bash
# deploy/k8s/yaver.yaml içinde TOKEN_SECRET'ı değiştirin (ghcr paketi gizliyse çekme secret'ı: dosyadaki adım 1)
kubectl apply -f deploy/k8s/yaver.yaml
kubectl -n yaver port-forward svc/yaver 8080:80     # http://localhost:8080  →  admin / admin
```

Kubernetes olmadan: `docker compose up --build` → http://localhost:8080 · ya da Node ile doğrudan:
`cd server && npm install && npm start` (veriler `./data` klasörüne yazılır).

**Yedek almak:** `/data` klasörünü kopyalamak yeterli. Tutarlı bir kopya için önce uygulamayı durdurun:
`kubectl -n yaver scale deploy/yaver --replicas=0`, PVC'nin kopyasını/anlık görüntüsünü alın, sonra `--replicas=1`.

| Ortam değişkeni | Varsayılan | Açıklama |
|---|---|---|
| `DATA_DIR` | `/data` (imajda) | Verilerin tutulduğu klasör |
| `TOKEN_SECRET` | (rastgele) | Oturum imzalama anahtarı; verilmezse pod yeniden başlayınca tekrar giriş gerekir |
| `SEED` | `true` | İlk açılışta örnek veriyi yükle. `false` → boş kurulum (yalnız admin) |
| `DEMO_FEEDS` | `true` | Örnek mail/Zoom kaynakları (`/api/integrations/*/sync`). Gerçek entegrasyonda `false` |
| `ADMIN_PASSWORD` | `admin` | `SEED=false` iken oluşturulan admin şifresi |
| `API_LOG_RETENTION_DAYS` | `30` | Çağrı geçmişi saklama süresi |

Örnek veri SQL'i arayüzün demo verisinden üretilir: `node --experimental-strip-types db/tools/gen-seed.ts > db/postgres/02-seed.sql`.
Tarihler `now()`'a görelidir, hangi gün yüklenirse pano dolu görünür. Ölçek büyürse aynı SQL dosyalarıyla ayrı bir
PostgreSQL'e geçmek kolaydır (`server/src/db.js` tek değişen dosya olur).

### İmaj ve sürümler (CI)

İmaj GitHub Actions ile otomatik derlenir (`.github/workflows/docker-image.yml`). Sürüm kök dizindeki **`VERSION`** dosyasındadır.

| Olay | Ne olur | İmaj etiketi |
|---|---|---|
| `VERSION` artırılıp `main`'e push (ör. `0.4.1`) | test + derleme + gönderme, `v0.4.1` git etiketi ve GitHub Release otomatik açılır | `:0.4.1`, `:0.4`, `:latest`, `:sha-abc1234` |
| `VERSION` değişmeden `main`'e push | test + derleme + gönderme; yayınlanmış sürüm etiketi ezilmez | `:latest`, `:sha-abc1234` |
| Pull request | test + derleme (gönderilmez) | — |

CI önce arayüzü derler, sunucuyu açıp örnek verinin yüklendiğini ve `admin/admin` girişini dener; hepsi geçerse imajı
derleyip gönderir. Ek secret gerekmez (`GITHUB_TOKEN` yeterli). Çalışan sürüm `GET /api/health` cevabında görünür.

### Sorun giderme

```bash
kubectl -n yaver get pods,pvc                    # pod Running mi, PVC Bound mu?
kubectl -n yaver logs deploy/yaver               # açılış logu: "[db] gömülü veritabanı hazır" görünmeli
kubectl -n yaver describe pod -l app=yaver       # Events: imaj çekme, disk bağlama, izin hataları
```

| Belirti | Neden | Çözüm |
|---|---|---|
| PVC `Pending`, pod `Pending` | Kümede varsayılan disk sınıfı yok | `kubectl get storageclass` → adı manifestteki `storageClassName`'e yazın. Ya da deneme için PVC yerine `emptyDir: {}` |
| Logda `EACCES` / `permission denied` (`/data`) | Disk node kullanıcısına (1000) yazılabilir değil | Manifestteki `fsGroup: 1000` kalsın; NFS ise sunucuda `no_root_squash` ya da başka storage class |
| `ImagePullBackOff` | ghcr.io paketi gizli ve çekme secret'ı yok | Manifestteki adım 1 (ghcr-pull) ya da paketi public yapın |

## LangGraph ajanı entegrasyonu (v0.5)

Mail/toplantı/iş olayları ajana **webhook** (HMAC imzalı) ya da **pull** (`GET /api/agent/events`) ile gider; ajan Yaver'e
**REST** ile bağlanıp okur, iş açar, not yazar, öneri verir. Öncelik/atama/durum gibi riskli değişiklikler **öneri** olarak
kullanıcı onayına düşer. Chat, ajandan **SSE** ile akıtılır. Akış rehberi ve tüm uçlar: **[docs/AJAN-API.md](docs/AJAN-API.md)**.

```bash
T=yvr_...   # AGENT_TOKEN
curl -H "Authorization: Bearer $T" "http://localhost:8080/api/work-items?open=true&sort=priority&limit=5"
```

Uçtan uca test (sahte ajan ile): sunucuyu `AGENT_TOKEN`, `AGENT_WEBHOOK_URL=http://127.0.0.1:9099/hook`,
`AGENT_WEBHOOK_SECRET=s3cret`, `AGENT_CHAT_URL=http://127.0.0.1:9099/chat` ile açıp `node server/test/agent-e2e.mjs`.

### Geçmişe dayalı ajan yorumu ve gruplama (v0.6)

- **Pano / İşler** durum yerine **Üst Yönetim** (GM / GMY / Direktör / Diğer), **Anahtar kelime** (maildeki kelimeler)
  veya **Süre** (açık kalma süresi) ile gruplanır.
- Her gelen işte **Ajan yorumu** alanı: ajan `GET /api/work-items/{id}/context` ile benzer eski işlere (DB), wiki sayfalarına
  ve göndericinin geçmiş maillerine bakar, `PUT /api/work-items/{id}/agent-comment` ile yorumunu yazar. LLM bağlı değilken
  pod içindeki örnek yorumlayıcı aynı paketten kural tabanlı yorum üretir (`AGENT_DEMO_INTERPRETER`).
- **`POST /api/bulk-send-mail`**: toplu mail girişi; her mail pod içindeki veriye mail + iş (+ ajan yorumu) olarak eklenir.
  `{"count": 5}` örnek mail üretir. Genel Bakış'taki "Toplu mail gönder" düğmesi bunu çağırır.
- Örnek veri: kişi rehberi (GM, GMY, direktör…), 10 wiki sayfası, 12 kapanmış geçmiş iş, üst yönetimden 5 açık iş.

## Yalnız arayüz (geliştirme)

```bash
cd frontend
npm install
npm run dev          # http://localhost:5173
```

Giriş: **admin / admin**

Sunucu yoksa arayüz **demo modunda** açılır (veriler tarayıcıda). Sunucuyla geliştirmek için:
`cd server && npm install && PORT=8000 npm start`, ardından `VITE_API_TARGET=http://localhost:8000 npm run dev`.

## Tasarım (v0.2)

Kendi görsel kimliği olan modern bir SaaS arayüzü (Linear / Vercel çizgisi):

- **Tasarım sistemi** (`frontend/src/theme.ts`): nötr gri yüzeyler + tek vurgu rengi (indigo `#5148E5`),
  Inter Variable, 1px ince çizgiler, yumuşak gölgeler, odakta 3px halka; tam açık/koyu tema.
- **Yerleşim:** hafif kenar menü (sayaçlar, kayıtlı görünümler, canlı senkron kartı), kenarlıklı içerik paneli,
  yarı saydam üst çubuk (konum, tema, bildirimler, Yeni iş).
- **Hızlı arama ⌘K / Ctrl+K:** iş, mail, toplantı ve sayfalar arasında klavyeyle gezinme. **C** tuşu: yeni iş.
- **Genel Bakış:** kişisel karşılama, 14 günlük trend çizgili KPI kartları, kaynağa göre gelen iş grafiği,
  "Bugün" ajandası, odak listesi, durum dağılımı, ekip yükü.
- **İşler:** Üst Yönetim / Anahtar kelime / Süre'ye göre gruplanmış liste **veya** pano (v0.6); öncelik/durum simgeleri, avatarlar.
- **Gelen kutusu:** iki panelli okuma düzeni (liste + okuma paneli), tek tıkla işe dönüştürme.
- **Toplantılar:** güne göre ajanda (Bugün, Yarın…), "Şu an" göstergesi, Katıl düğmesi.
- **Giriş:** sade form + ürünü gösteren süzülen önizleme kartları.
- Hareket: [freshtechbro/claudedesignskills](https://github.com/freshtechbro/claudedesignskills) `modern-web-design`
  ilkeleriyle (`motion`), "hareketi azalt" ayarına saygılı.

## Ekranlar

| Ekran | İçerik |
|---|---|
| Giriş | Jumbo giriş ekranı düzeni; lokal `admin/admin` (LDAP backend ile eklenecek) |
| Genel Bakış | Açık iş, termini geçen, okunmamış mail, bugünkü toplantı kartları; son işler; yaklaşan toplantılar; durum/kaynak/kişi dağılımı |
| İşler | Tüm işler tablosu; arama + durum/kaynak/öncelik/atanan filtresi; detay panelinde durum, öncelik, atama, termin, yorum ve tarihçe |
| E-postalar | Gelen mailler; okunmamış/işe dönüşmemiş filtresi; **İşe dönüştür** |
| Zoom Toplantıları | Yaklaşan/geçmiş; katılımcılar, notlar, kayıt linki; toplantıdan **aksiyon (iş) ekleme** |
| Ayarlar › API Çağrı Servisi | Birden çok servis; URL, metot, **çağrı aralığı (varsayılan 60 sn = 1 dk)**, zaman aşımı, kimlik doğrulama (Bearer/Basic/API key), başlıklar, gövde, hedef tablo; etkin/pasif, geri sayım, **Şimdi çalıştır** |
| Ayarlar › Çağrı Geçmişi | Her çağrının zamanı, HTTP kodu, süresi, alınan kayıt sayısı, mesajı |
| Ayarlar › LDAP / Active Directory | Jumbo'daki LDAP alanlarının aynısı + bağlantı testi |
| Ayarlar › Genel | Posta kutusu, takım üyeleri, varsayılan atanan, demo verisini sıfırlama |

## API çağrı servisi nasıl çalışır?

Sunucu kurulumunda zamanlayıcı **sunucuda** çalışır (`server/src/poller.js`), tarayıcı kapalıyken de devam eder:
etkin her servis kendi aralığında (varsayılan 1 dk) çağrılır, önceki çağrı bitmeden yenisi başlamaz. Dönen JSON dizi
(veya `{items|data|records: [...]}`) seçilen hedefe yazılır (mail → `message_id`, zoom → `zoom_uuid`,
iş → `external_ref` ile tekilleştirilir) ve sonuç `api_poll_log` tablosuna yazılır. Göreli URL'ler
(`/api/...`) pod'un kendisine gider. Demo modunda aynı mantık tarayıcıda çalışır (`services/apiPoller.tsx`).

## Veri

Sunucu varsa veriler sunucunun gömülü veritabanında (`/data`); yoksa tarayıcıda (demo). Geçişi `frontend/src/data/store.ts` yapar.

- Tablolar ve kolonlar: [docs/DB-SEMA.md](docs/DB-SEMA.md)
- DDL (PostgreSQL): [db/postgres/01-schema.sql](db/postgres/01-schema.sql) · örnek veri: [db/postgres/02-seed.sql](db/postgres/02-seed.sql)
- DDL (MSSQL karşılığı): [db/schema-mssql.sql](db/schema-mssql.sql)
