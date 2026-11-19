# YAVER — Takım İş Takip Platformu (önyüz)

Takıma gelen mailleri, Zoom toplantılarını ve diğer tüm işleri tek yerden takip eden uygulamanın önyüzü.
Görünüm ve yapı **Jumbo** (cgn-t/ju) önyüzünden alındı: React + TypeScript + Vite + MUI, kırmızı sol menü,
IBM Plex Sans, açık/koyu tema, gruplu Ayarlar ekranı.

## Çalıştırma

```bash
cd frontend
npm install
npm run dev          # http://localhost:5173
```

Giriş: **admin / admin**

Backend hazır olduğunda: `VITE_API_TARGET=http://localhost:8000 npm run dev` (`/api` istekleri oraya yönlenir).

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

`frontend/src/services/apiPoller.tsx` — oturum açıkken saniyede bir kontrol eder; etkin her servis kendi aralığında
çağrılır, önceki çağrı bitmeden yenisi başlamaz. Dönen JSON dizi (veya `{items|data|records: [...]}`) seçilen
hedefe yazılır (mail → `message_id`, zoom → `zoom_meeting_id`, iş → `id/key` ile tekilleştirilir) ve sonuç
Çağrı Geçmişi'ne loglanır. Üretimde aynı ayarlar backend zamanlayıcısı tarafından çalıştırılmalı (bkz. DB dokümanı).

## Veri

Backend olmadığı için veriler şimdilik tarayıcıda (localStorage) tutulur ve örnek veriyle başlar
(`frontend/src/data/`). Backend gelince yalnız `data/store.ts` API çağrılarına çevrilir.

- DB tablo/kolon önerisi: [docs/DB-SEMA.md](docs/DB-SEMA.md)
- DDL (MSSQL): [db/schema-mssql.sql](db/schema-mssql.sql)
