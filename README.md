# YAVER — Takım İş Takip Platformu

Takıma gelen mailleri, Zoom toplantılarını ve diğer tüm işleri tek yerden takip eden uygulama.
Başlangıç taslağı **Jumbo** (cgn-t/ju) önyüzü; v0.2'den itibaren kendi tasarım sistemi var.

```
frontend/   React + TypeScript + Vite + MUI arayüz
server/     Node (Express + pg) API: giriş, işler, mail, toplantı, ayarlar, zamanlanmış API servisi; arayüzü de sunar
db/postgres 01-schema.sql (tablolar) + 02-seed.sql (örnek veri) — ilk açılışta otomatik çalışır
deploy/k8s  yaver.yaml: TEK POD (postgres + yaver konteyneri), PVC, Secret, Service
```

## Tek pod kurulumu (arayüz + API + veritabanı)

Pod içinde iki konteyner vardır: **postgres:16-alpine** ve **yaver** (arayüz + API). Aynı pod'da oldukları için
`localhost:5432` üzerinden konuşurlar; veritabanı dışarı açılmaz. İlk açılışta yaver konteyneri tabloları
oluşturur ve örnek veriyi yükler; veriler PVC'de kalır.

İmaj GitHub Actions ile otomatik derlenir (`.github/workflows/docker-image.yml`):

Sürüm kök dizindeki **`VERSION`** dosyasındadır (şu an `0.3.0`).

| Olay | Ne olur | İmaj etiketi |
|---|---|---|
| `VERSION` artırılıp `main`'e push (ör. `0.3.1`) | test + derleme + gönderme, `v0.3.1` git etiketi ve GitHub Release otomatik açılır | `:0.3.1`, `:0.3`, `:latest`, `:sha-abc1234` |
| `VERSION` değişmeden `main`'e push | test + derleme + gönderme; yayınlanmış sürüm etiketi ezilmez | `:latest`, `:sha-abc1234` |
| Pull request | test + derleme (gönderilmez) | — |

Yeni sürüm: `echo 0.3.1 > VERSION && git commit -am "Sürüm 0.3.1" && git push`. Çalışan sürüm `GET /api/health` cevabında görünür.

CI önce arayüzü derler, şema + örnek veriyi gerçek bir PostgreSQL'e yükler, sunucuyu açıp `admin/admin` girişini dener;
hepsi geçerse imajı derleyip gönderir. Ek secret gerekmez (`GITHUB_TOKEN` yeterli).

```bash
# deploy/k8s/yaver.yaml içinde Secret şifrelerini düzenleyin (ghcr paketi gizliyse çekme secret'ı: dosyadaki adım 1)
kubectl apply -f deploy/k8s/yaver.yaml
kubectl -n yaver port-forward svc/yaver 8080:80     # http://localhost:8080  →  admin / admin
```

Kubernetes olmadan aynı ikiliyi denemek için: `docker compose up --build` → http://localhost:8080

| Ortam değişkeni (yaver) | Varsayılan | Açıklama |
|---|---|---|
| `DATABASE_URL` | `postgres://yaver:yaver@localhost:5432/yaver` | Pod içindeki DB |
| `TOKEN_SECRET` | (rastgele) | Oturum imzalama anahtarı; verilmezse pod yeniden başlayınca tekrar giriş gerekir |
| `SEED` | `true` | DB boşsa örnek veriyi yükle. `false` → boş kurulum (yalnız admin) |
| `DEMO_FEEDS` | `true` | Örnek mail/Zoom kaynakları (`/api/integrations/*/sync`). Gerçek entegrasyonda `false` |
| `ADMIN_PASSWORD` | `admin` | `SEED=false` iken oluşturulan admin şifresi |
| `API_LOG_RETENTION_DAYS` | `30` | Çağrı geçmişi saklama süresi |

Örnek veri SQL'i arayüzün demo verisinden üretilir: `node --experimental-strip-types db/tools/gen-seed.ts > db/postgres/02-seed.sql`.
Tarihler `now()`'a görelidir, hangi gün yüklenirse pano dolu görünür.

### Sorun giderme: "veritabanı bekleniyor"

Yaver konteyneri açılınca aynı pod'daki Postgres'e bağlanmayı dener. Bağlanamazsa logda nedeni yazar:

```bash
kubectl -n yaver get pods,pvc                    # pod Running mi, PVC Bound mu?
kubectl -n yaver logs deploy/yaver -c yaver      # "[db] veritabanı bekleniyor… <kod>" satırı + öneri
kubectl -n yaver logs deploy/yaver -c postgres   # Postgres neden açılmıyor?
kubectl -n yaver describe pod -l app=yaver       # Events: imaj çekme, disk bağlama, izin hataları
```

| Logdaki kod | Neden | Çözüm |
|---|---|---|
| `ECONNREFUSED` | **En sık:** Postgres konteyneri açılmadı/çöktü | `logs -c postgres` ve `describe pod`. PVC `Pending` → manifestte `storageClassName`'i kümenizdeki sınıfla açın (`kubectl get storageclass`). `Permission denied` / `Operation not permitted` → disk izinleri (NFS ise `no_root_squash` ya da başka storage class). `ImagePullBackOff` → `postgres:16-alpine` çekilemiyor (Docker Hub limiti / iç ağ) → imajı kendi registry'nize kopyalayıp manifestte adresi değiştirin |
| `28P01` | Şifre hatalı (yalnız harici bir DB kullanıyorsanız; pod içi DB localhost'a şifresiz güvenir) | `PGPASSWORD` / Secret değerini DB'deki şifreyle eşleyin |
| `57P03` | Postgres açılıyor | Bekleyin |
| `ENOTFOUND` / `ETIMEDOUT` | Yanlış DB adresi | Tek pod kurulumunda `PGHOST=127.0.0.1` olmalı |

## Yalnız arayüz (geliştirme)

```bash
cd frontend
npm install
npm run dev          # http://localhost:5173
```

Giriş: **admin / admin**

Sunucu yoksa arayüz **demo modunda** açılır (veriler tarayıcıda). Sunucuyla geliştirmek için:
`cd server && npm install && DATABASE_URL=postgres://… PORT=8000 npm start`, ardından
`VITE_API_TARGET=http://localhost:8000 npm run dev`.

## Tasarım (v0.2)

Kendi görsel kimliği olan modern bir SaaS arayüzü (Linear / Vercel çizgisi):

- **Tasarım sistemi** (`frontend/src/theme.ts`): nötr gri yüzeyler + tek vurgu rengi (indigo `#5148E5`),
  Inter Variable, 1px ince çizgiler, yumuşak gölgeler, odakta 3px halka; tam açık/koyu tema.
- **Yerleşim:** hafif kenar menü (sayaçlar, kayıtlı görünümler, canlı senkron kartı), kenarlıklı içerik paneli,
  yarı saydam üst çubuk (konum, tema, bildirimler, Yeni iş).
- **Hızlı arama ⌘K / Ctrl+K:** iş, mail, toplantı ve sayfalar arasında klavyeyle gezinme. **C** tuşu: yeni iş.
- **Genel Bakış:** kişisel karşılama, 14 günlük trend çizgili KPI kartları, kaynağa göre gelen iş grafiği,
  "Bugün" ajandası, odak listesi, durum dağılımı, ekip yükü.
- **İşler:** duruma göre gruplanmış liste **veya** sürükle-bırak Kanban pano; öncelik/durum simgeleri, avatarlar.
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

Pod kurulumunda zamanlayıcı **sunucuda** çalışır (`server/src/poller.js`), tarayıcı kapalıyken de devam eder:
etkin her servis kendi aralığında (varsayılan 1 dk) çağrılır, önceki çağrı bitmeden yenisi başlamaz. Dönen JSON dizi
(veya `{items|data|records: [...]}`) seçilen hedefe yazılır (mail → `message_id`, zoom → `zoom_uuid`,
iş → `external_ref` ile tekilleştirilir) ve sonuç `api_poll_log` tablosuna yazılır. Göreli URL'ler
(`/api/...`) pod'un kendisine gider. Demo modunda aynı mantık tarayıcıda çalışır (`services/apiPoller.tsx`).

## Veri

Sunucu varsa veriler pod içindeki PostgreSQL'de; yoksa tarayıcıda (demo). Geçişi `frontend/src/data/store.ts` yapar.

- Tablolar ve kolonlar: [docs/DB-SEMA.md](docs/DB-SEMA.md)
- DDL (PostgreSQL): [db/postgres/01-schema.sql](db/postgres/01-schema.sql) · örnek veri: [db/postgres/02-seed.sql](db/postgres/02-seed.sql)
- DDL (MSSQL karşılığı): [db/schema-mssql.sql](db/schema-mssql.sql)
