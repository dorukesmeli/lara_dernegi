# Üyelik Formu — Google Apps Script

laraassociation.org üyelik formu başvuruları bu Web App'e gönderir. Web App her başvuru için:

1. **İç bildirim** — `CONFIG.NOTIFY_TO` adresine, formdaki tüm alanlarla (Reply-To: başvuran)
2. **Teyit maili** — başvuru sahibine, formun diline göre Türkçe / İngilizce

| Dosya | Görevi |
|---|---|
| `Code.gs` | Web App kodu: doğrulama, tekrar koruması, iki mail, günlük kayıtları |
| `appsscript.json` | İstanbul saat dilimi, yalnızca "mail gönderme" izni, Web App erişimi |

**Güvenlik:** Bu dosyalarda şifre, App Password, OAuth token veya secret yoktur. Web App
"Execute as: Me" ile yayınlanır; mailler script sahibinin hesabından gider. Alıcı adres
tarayıcıdan alınmaz. Bu klasör GitHub Pages ile herkese açık yayınlanır; gizli bilgi içermez.

---

## Yanıt sözleşmesi

Sayfa **yalnızca** ilk yanıtta başarı mesajı gösterir; diğer tüm durumlarda hata mesajı gösterir.

```json
{ "ok": true,  "internalNotificationSent": true,  "confirmationSent": true }
{ "ok": false, "internalNotificationSent": true,  "confirmationSent": false, "error": "CONFIRMATION_FAILED" }
{ "ok": false, "internalNotificationSent": false, "confirmationSent": false, "error": "VALIDATION", "fields": ["email"] }
```

Diğer hata kodları: `INTERNAL_NOTIFICATION_FAILED`, `QUOTA`, `RATE_LIMIT`, `BUSY`, `BAD_REQUEST`, `SERVER`.

## Tekrar koruması

- Her `submissionId` en fazla **bir** iç bildirim ve **bir** teyit maili üretir.
- Teyit maili başarısız olursa, aynı başvuru yeniden gönderildiğinde **yalnızca teyit maili**
  tekrar denenir; iç bildirim ikinci kez gitmez.
- Birebir aynı içerik 30 dakika içinde yeni bir kimlikle gelirse aynı başvuru sayılır.
- E-posta adresi bazlı sınır yoktur; aynı adresten gelen farklı başvurular engellenmez.

## Günlük kayıtları

Apps Script → sol menü **Yürütmeler** → ilgili `doPost` satırı. Her başvuru şu olayları JSON olarak yazar:

`submission_received` · `internal_notification_attempted` · `internal_notification_sent` ·
`confirmation_attempted` · `confirmation_sent` · `confirmation_error`

Kayıtlarda `submission_id`, `applicant_email`, `confirmation_recipient` ve hata metni bulunur.
Telefon, doğum tarihi ve motivasyon metni günlüğe yazılmaz. **Teyit maili gitmiyorsa
`confirmation_error` satırındaki `error` alanı gerçek sebebi gösterir.**

---

## İlk kurulum

1. Yalnızca `laradernegi@gmail.com` hesabının açık olduğu bir pencerede **script.google.com → Yeni proje**.
2. **⚙ Proje Ayarları** → "appsscript.json manifest dosyasını düzenleyicide göster".
3. `Code.gs` ve `appsscript.json` içeriklerini bu klasördekilerle tamamen değiştir → **Kaydet**.
4. `testKuruCalisma` → **Çalıştır** → yetkilendir (Gelişmiş → projeye git → İzin ver).
5. **Dağıt → Yeni dağıtım → Web uygulaması** · Şu kullanıcı olarak çalıştır: **Ben** · Erişim: **Herkes** → Dağıt.
6. Web App URL'sini `assets/js/form-config.js` → `appsScriptUrl` alanına yaz.

## Kod güncellendiğinde — yeni sürüm yayınla

Kodu kaydetmek canlı Web App'i **güncellemez**. Değişiklikten sonra:

**Dağıt → Dağıtımları yönet → ✏️ Düzenle → Sürüm: Yeni sürüm → Dağıt**

Böylece URL **aynı kalır**. "Yeni dağıtım" yeni bir URL oluşturur; kullanma.

Dağıtım penceresinde **"Şu kullanıcı olarak çalıştır"** satırında `laradernegi@gmail.com`
yazdığını kontrol et. Başka bir hesap yazıyorsa mailler o hesaptan gider.

## Editör testleri

| Fonksiyon | Mail gönderir mi | Ne yapar |
|---|---|---|
| `testKuruCalisma` | Hayır | Örnek başvuruyu doğrular, iki maili oluşturup günlüğe yazar |
| `testHataliBasvuru` | Hayır | Hatalı başvurunun `VALIDATION` ile reddedildiğini gösterir |
| `testGercekGonderim` | Evet | İki mail de `CONFIG.NOTIFY_TO` adresine |
| `testHariciTeyit` | Evet | Teyit maili **başka bir adrese** — canlıdaki gerçek yol. Önce `TEST_TEYIT_ADRESI` sabitini **yalnızca editörde** doldur |
| `testMailKotasi` | Hayır | Kalan günlük mail kotasını yazar |

## Bilmen gerekenler

- **Günlük kota:** Kişisel Gmail hesabı günde yaklaşık 100 alıcıya mail gönderebilir; her başvuru 2 mail → günde ~50 başvuru.
  Kota iki mail için yetmiyorsa başvuru hiç işlenmez ve `QUOTA` döner (yarım kalmaz).
- **Saatlik sınır:** Tüm site için saatte en fazla 30 yeni başvuru (`CONFIG.MAX_APPLICATIONS_PER_HOUR`).
- **Alıcı adres:** `Code.gs` → `CONFIG.NOTIFY_TO`. Değiştirdikten sonra yeni sürüm yayınla.
