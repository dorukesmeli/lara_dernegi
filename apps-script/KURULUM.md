# Üyelik Formu — Google Apps Script Kurulumu

Bu klasör, üyelik formunun Google Apps Script tabanlı e-posta sistemidir.
Sitede **şu an FormSubmit çalışıyor**; bu sistem test edilip onaylandıktan sonra
`assets/js/form-config.js` içinde tek satırla devreye alınır.

| Dosya | Görevi |
|---|---|
| `Code.gs` | Web App kodu: doğrulama, tekrar koruması, iç bildirim + teyit maili |
| `appsscript.json` | Proje ayarları: İstanbul saat dilimi, yalnızca "mail gönderme" izni, Web App erişimi |

**Güvenlik:** Bu dosyalarda şifre, App Password, OAuth token veya secret yoktur.
Web App "Execute as: Me" ile yayınlanır; mailler Google'ın kendi yetkilendirmesiyle
`laradernegi@gmail.com` hesabından gider. Script yalnızca **mail gönderme** iznini ister
(Gmail kutusunu okuma izni istemez).

> Bu klasör GitHub Pages ile birlikte herkese açık yayınlanır. İçinde gizli bilgi olmadığı
> için sorun değildir.

---

## 1. Projeyi oluştur

1. Tarayıcıda **yalnızca `laradernegi@gmail.com` hesabının açık olduğu** bir pencere kullan
   (gizli pencere ya da ayrı bir Chrome profili). Birden fazla Google hesabı açıkken
   Apps Script yetkilendirmesi karışabilir.
2. **https://script.google.com** → **Yeni proje**.
3. Sol üstte "Adsız proje" yazısına tıkla → adını **LARA Üyelik Formu** yap.

## 2. Kodu yapıştır

1. Sol menüden **⚙ Proje Ayarları** → **"appsscript.json" manifest dosyasını düzenleyicide göster** kutusunu işaretle.
2. Sol menüden **< > Düzenleyici**'ye dön.
3. `Code.gs` dosyasının içindekileri tamamen sil, bu klasördeki **`Code.gs`** içeriğini yapıştır.
4. `appsscript.json` dosyasını aç, içindekileri tamamen sil, bu klasördeki **`appsscript.json`** içeriğini yapıştır.
5. **Kaydet** (💾 ya da Cmd+S).

## 3. Yetkilendir ve mail göndermeden test et

1. Üstteki fonksiyon listesinden **`testKuruCalisma`** seç → **Çalıştır**.
2. "Yetkilendirme gerekli" penceresi çıkar → **İzinleri incele** → `laradernegi@gmail.com` hesabını seç.
3. "Google bu uygulamayı doğrulamadı" uyarısı çıkar. Bu, kendi yazdığın scriptler için normaldir:
   **Gelişmiş** → **LARA Üyelik Formu'na git (güvenli değil)** → **İzin ver**.
4. Alttaki **Yürütme günlüğü**'nde iki mailin (iç bildirim + teyit) metni görünmeli. Hiç mail gitmez.
5. **`testHataliBasvuru`** seç → Çalıştır. Günlükte `"error":"VALIDATION"` ve hatalı alanlar görünmeli.

## 4. Gerçek mail testi

1. **`testGercekGonderim`** seç → Çalıştır.
2. `laradernegi@gmail.com` gelen kutusunda **iki mail** olmalı:
   - `Yeni Üyelik Başvurusu – Ayşe Yılmaz` (gönderen adı: LARA Üyelik Formu)
   - `LARA Derneği | Üyelik Başvurunuz Alındı` (gönderen adı: LARA Derneği)
3. Spam klasörünü de kontrol et.

## 5. Web App olarak yayınla

1. Sağ üstte **Dağıt** → **Yeni dağıtım**.
2. ⚙ simgesinden tür olarak **Web uygulaması** seç.
3. Ayarlar:
   - **Açıklama:** `v1`
   - **Şu kullanıcı olarak çalıştır:** **Ben (laradernegi@gmail.com)**
   - **Erişimi olan kullanıcılar:** **Herkes**
4. **Dağıt** → çıkan **Web uygulaması URL'sini** kopyala. `https://script.google.com/macros/s/…/exec` biçimindedir.

## 6. Adresi kontrol et

Kopyaladığın URL'yi tarayıcıda aç. Şunu görmelisin:

```json
{"ok":true,"service":"lara-membership","version":1}
```

**➡ Bu noktada Web App URL'sini geliştiriciye ilet.** Site tarafında
`provider: "appsscript"` ve `appsScriptUrl` ayarlanır, canlı test yapılır.

---

## Kod değişirse yayını güncelleme

Kodu kaydetmek canlı Web App'i **güncellemez**. Değişiklikten sonra:

**Dağıt** → **Dağıtımları yönet** → mevcut dağıtımda ✏️ → **Sürüm: Yeni sürüm** → **Dağıt**.

Böylece URL **aynı kalır**. "Yeni dağıtım" dersen yeni bir URL oluşur ve sitedeki ayarın da değişmesi gerekir.

## Bilmen gerekenler

- **Günlük kota:** Kişisel Gmail hesaplarında Apps Script günde yaklaşık **100 alıcıya** mail gönderebilir.
  Her başvuru 2 mail kullanır → günde yaklaşık **50 başvuru**. Kota dolarsa form hata mesajı gösterir.
- **Tekrar koruması:** Aynı başvuru kimliği 6 saat, birebir aynı içerik 30 dakika boyunca tekrar işlenmez.
  Aynı adrese 6 saat içinde en fazla bir teyit maili gider.
- **Saatlik sınır:** Tüm site için saatte en fazla 30 başvuru (`CONFIG.MAX_APPLICATIONS_PER_HOUR`).
- **Alıcı adres değişikliği:** `Code.gs` en üstteki `CONFIG.NOTIFY_TO`. Değiştirdikten sonra yayını güncellemeyi unutma.
- **Hataları görmek:** Apps Script → sol menü **Yürütmeler**.
