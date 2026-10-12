/* =========================================================================
   ÜYELİK BAŞVURU FORMU — AYARLAR
   Başvurular Google Apps Script Web App'e gönderilir (apps-script/Code.gs).
   Alıcı adres ve mail içerikleri sunucu tarafındadır: apps-script/Code.gs → CONFIG.

   Bu dosyada şifre, token veya gizli anahtar YOKTUR ve olmamalıdır.
   Buradaki değerlerin hepsi herkese açık olabilecek bilgilerdir.
   ========================================================================= */
window.LARA_FORM = {

  /* Google Apps Script Web App adresi (…/exec ile biter). Gizli değildir. */
  appsScriptUrl: "https://script.google.com/macros/s/AKfycbzDsDwd7wbQL88bT3zU3tp0orTw6-p9OrQZm200TUZwqnnZycSSjmOL8XDThkT2mwdP/exec",

  /* Sunucu bu süre içinde yanıt vermezse hata mesajı gösterilir (milisaniye) */
  timeoutMs: 45000,

  /* Cloudflare Turnstile AÇIK site anahtarı — "LARA Membership Form" widget'ı.
     Herkese açıktır, sayfa kaynağında görünür; sakıncası yoktur.
     Yalnızca laraassociation.org alan adında geçerlidir.
     Boş bırakılırsa widget yüklenmez ve form doğrulamasız çalışır.

     GİZLİ ANAHTAR (Secret Key) BURAYA YAZILMAZ. O, Apps Script tarafında
     Script Properties içinde TURNSTILE_SECRET_KEY adıyla saklanır. */
  turnstileSiteKey: "0x4AAAAAAFUtjBfJNRjWw6eD",

  /* Aynı tarayıcıdan saatte en fazla kaç başvuru gönderilebilir */
  maxSubmitsPerHour: 3
};
