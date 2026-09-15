/* =========================================================================
   ÜYELİK BAŞVURU FORMU — AYARLAR
   Bu dosyada ŞİFRE, API SECRET veya SMTP bilgisi YOKTUR ve olmamalıdır.
   Buradaki değerlerin hepsi herkese açık olabilecek bilgilerdir.

   Başvurular FormSubmit (formsubmit.co) üzerinden e-posta olarak iletilir.
   FormSubmit sunucu tarafında çalışır; gizli anahtar gerektirmez.
   ========================================================================= */
window.LARA_FORM = {

  /* ★ ALICI ADRES — SİSTEMDEKİ TEK NOKTA ★
     Başvurular bu adrese düşer. İleride kurumsal bir adrese geçildiğinde
     (örn. uyelik@laraassociation.org) SADECE bu satırı değiştirmek yeterlidir;
     başka hiçbir dosyaya dokunmaya gerek yoktur.
     Yeni adrese geçtiğinde FormSubmit onayı yeni adres için tekrar yapılır. */
  email: "laradernegi@gmail.com",

  /* ÖNERİLİR — e-posta adresini kaynak kodda gizlemek için:
     İlk başarılı gönderimden sonra FormSubmit sana rastgele bir kimlik verir
     (örn. "a1b2c3d4e5f6..."). O kimliği buraya yapıştırdığında adres yerine
     kimlik kullanılır ve Gmail adresi sayfa kaynağında görünmez.
     Boş bırakılırsa yukarıdaki e-posta adresi kullanılır.                     */
  endpointId: "",

  /* E-postanın altında görünecek site adresi */
  siteAdresi: "laraassociation.org",

  /* Konu satırı: "Yeni Üyelik Başvurusu – Ad Soyad" */
  subjectPrefix: "Yeni Üyelik Başvurusu",

  /* İSTEĞE BAĞLI — Cloudflare Turnstile (CAPTCHA) site anahtarı.
     Bu anahtar herkese açıktır, gizli değildir; gizli olan "secret key"
     asla buraya yazılmaz. Boş bırakılırsa Turnstile kapalıdır.               */
  turnstileSiteKey: "",

  /* Aynı tarayıcıdan saatte en fazla kaç başvuru gönderilebilir */
  maxSubmitsPerHour: 3,

  /* "formsubmit" = arka planda gönderilir (önerilen)
     "mailto"     = kişinin kendi e-posta uygulaması dolu bir mesajla açılır  */
  mode: "formsubmit"
};
