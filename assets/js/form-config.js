/* =========================================================================
   ÜYELİK BAŞVURU FORMU — AYARLAR
   Başvurular Google Apps Script Web App'e gönderilir (apps-script/Code.gs).
   Alıcı adres ve mail içerikleri sunucu tarafındadır: apps-script/Code.gs → CONFIG.

   Bu dosyada şifre, token veya gizli anahtar YOKTUR ve olmamalıdır.
   Buradaki değerlerin hepsi herkese açık olabilecek bilgilerdir.
   ========================================================================= */
window.LARA_FORM = {

  /* Google Apps Script Web App adresi (…/exec ile biter). Gizli değildir. */
  appsScriptUrl: "https://script.google.com/macros/s/AKfycbwp8mysEWAYSXiQbAMuPHI7sRWqKep6DFeGFyn7ww68OotDUyHNq17bp0FyzpMN04xq/exec",

  /* Sunucu bu süre içinde yanıt vermezse hata mesajı gösterilir (milisaniye) */
  timeoutMs: 45000,

  /* İsteğe bağlı Cloudflare Turnstile açık site anahtarı. Gizli anahtar buraya yazılmaz. */
  turnstileSiteKey: "",

  /* Aynı tarayıcıdan saatte en fazla kaç başvuru gönderilebilir */
  maxSubmitsPerHour: 3
};
