/* =========================================================================
   ÜYELİK BAŞVURU FORMU — AYARLAR
   Bu dosyada ŞİFRE, API SECRET, SMTP bilgisi veya OAuth token YOKTUR ve olmamalıdır.
   Buradaki değerlerin hepsi herkese açık olabilecek bilgilerdir.
   ========================================================================= */
window.LARA_FORM = {

  /* ★ SAĞLAYICI — TEK SATIRLA GEÇİŞ ★
     "formsubmit" → mevcut sistem (şu an canlı)
     "appsscript" → Google Apps Script Web App. Aşağıdaki appsScriptUrl dolu olmalıdır;
                    boş bırakılırsa form canlıda bozulmasın diye otomatik FormSubmit ile çalışır.
     "mailto"     → kişinin kendi e-posta uygulaması dolu bir mesajla açılır            */
  provider: "formsubmit",


  /* ------------------------ Google Apps Script ------------------------ */

  /* Apps Script yayınlandıktan sonra verilen Web App adresi (…/exec ile biter).
     Bu adres gizli değildir. Apps Script kullanılırken alıcı adres ve mail içerikleri
     sunucu tarafındadır: apps-script/Code.gs → CONFIG. Tarayıcı alıcı adres göndermez. */
  appsScriptUrl: "",


  /* -------------------- FormSubmit (mevcut sistem) -------------------- */

  /* ★ ALICI ADRES (FormSubmit için) ★
     FormSubmit kullanılırken başvurular bu adrese düşer. Yeni adrese geçildiğinde
     FormSubmit onayı yeni adres için tekrar yapılır.
     Apps Script'e geçiş tamamlanınca alıcı adres yalnızca Code.gs → CONFIG.NOTIFY_TO olur. */
  email: "laradernegi@gmail.com",

  /* İsteğe bağlı: FormSubmit'in verdiği rastgele kimlik. Doldurulursa Gmail adresi
     sayfa kaynağında görünmez. Boşsa yukarıdaki e-posta adresi kullanılır. */
  endpointId: "",

  /* E-postanın altındaki "şu site üzerinden gönderilmiştir" satırı (FormSubmit) */
  siteAdresi: "laraassociation.org",

  /* Konu satırı öneki: "Yeni Üyelik Başvurusu – Ad Soyad" (FormSubmit) */
  subjectPrefix: "Yeni Üyelik Başvurusu",


  /* ------------------------------ Ortak ------------------------------ */

  /* İsteğe bağlı Cloudflare Turnstile açık site anahtarı. Gizli anahtar buraya yazılmaz. */
  turnstileSiteKey: "",

  /* Aynı tarayıcıdan saatte en fazla kaç başvuru gönderilebilir */
  maxSubmitsPerHour: 3
};
