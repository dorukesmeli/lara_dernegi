/* =========================================================================
   ÜYELİK BAŞVURU FORMU AYARLARI
   Formu yayına almak için tek yapman gereken: aşağıya e-posta adresini yaz.
   Başvurular bu adrese "ÜYELİK BAŞVURUSU" konu başlığıyla gelir.

   ÖNEMLİ — ilk kurulum (yalnızca bir kez):
   E-postayı yazıp siteyi yayına aldıktan sonra formu bir kez kendin doldur
   ve gönder. FormSubmit sana bir onay e-postası yollayacak; oradaki bağlantıya
   tıkladığında adres aktifleşir ve tüm başvurular gelmeye başlar.
   ========================================================================= */
window.LARA_FORM = {

  // ← BURAYA DERNEĞİN E-POSTA ADRESİNİ YAZ  (örn: "uyelik@laradernegi.org")
  email: "",

  // "formsubmit" = başvuru arka planda gönderilir, kişi sayfadan ayrılmaz (önerilen)
  // "mailto"     = kişinin kendi e-posta uygulaması dolu bir mesajla açılır (sunucu gerektirmez)
  mode: "formsubmit",

  // E-postanın konu başlığı
  subject: "ÜYELİK BAŞVURUSU"
};
