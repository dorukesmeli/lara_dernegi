/**
 * ============================================================================
 *  LARA Derneği — Üyelik Başvurusu Web App
 *  Google Apps Script (V8)
 *
 *  laraassociation.org üyelik formu  →  bu Web App  →  iki e-posta:
 *    1) İç bildirim : CONFIG.NOTIFY_TO adresine, formdaki tüm alanlarla
 *    2) Teyit maili : başvuru sahibine, formun diline göre Türkçe / İngilizce
 *
 *  YANIT SÖZLEŞMESİ — sayfa yalnızca ilk biçimde başarı gösterir:
 *    { ok: true,  internalNotificationSent: true,  confirmationSent: true }
 *    { ok: false, internalNotificationSent: true,  confirmationSent: false, error: 'CONFIRMATION_FAILED' }
 *    { ok: false, internalNotificationSent: false, confirmationSent: false, error: 'VALIDATION' | 'QUOTA' | ... }
 *
 *  TEKRAR KORUMASI (submissionId + içerik özeti)
 *  - Her submissionId en fazla bir iç bildirim ve bir teyit maili üretir.
 *  - Teyit maili başarısız olursa aynı başvurunun yeniden gönderimi yalnızca
 *    teyit mailini tekrar dener; iç bildirim ikinci kez gönderilmez.
 *  - Birebir aynı içerik 30 dakika içinde yeni bir kimlikle gelirse aynı başvuru sayılır.
 *  - E-posta adresi bazlı sınır yoktur; farklı başvurular engellenmez.
 *
 *  GÜVENLİK
 *  - Bu dosyada şifre, App Password, OAuth token veya secret YOKTUR.
 *  - Web App "Execute as: Me" ile yayınlanır; mailler GmailApp ile script sahibinin
 *    hesabından (info@laraassociation.org) gider.
 *  - Alıcı adres ASLA tarayıcıdan alınmaz. İç bildirim yalnızca CONFIG.NOTIFY_TO'ya,
 *    teyit maili yalnızca doğrulanmış başvuru sahibine gider; içerikler sabit şablondur.
 *  - Kullanıcı verisi temizlenir ve HTML-escape edilir; HTML/JS enjekte edilemez.
 *  - Günlüklere telefon, doğum tarihi veya motivasyon metni yazılmaz.
 *
 *  GOOGLE SHEETS
 *  - Başarılı her yeni başvuru "LARA | Üye Başvuru ve Takip Sistemi" tablosuna
 *    tek satır olarak eklenir. Tablo kimliği kodda DEĞİL, SHEET_ID script
 *    özelliğinde tutulur.
 *  - Yazma, maillerden ÖNCE yapılır: böylece Gmail ve Sheets birbirinden bağımsız
 *    iki yedek olur. Biri çökerse başvuru diğerinde durur.
 *  - Sheets hatası başvuruyu reddetmez; yalnızca iç bildirimin konusuna
 *    [TABLOYA YAZILAMADI] eklenir, yönetim satırı elle girer.
 *  - Mükerrer kayıt, tablodaki Başvuru Kimliği sütunundan engellenir (önbellekten
 *    değil) — bu yüzden 6 saatlik önbellek ömründen bağımsızdır.
 *  - Otomasyon yalnızca satır EKLER. Ödeme/üyelik alanları ilk satırda varsayılanla
 *    yazılır, sonrasında hiçbir koşulda güncellenmez.
 * ============================================================================
 */


/* ============================== AYARLAR ============================== */

const CONFIG = {
  /* İç bildirimin gideceği adres. Kurumsal adrese geçildiğinde yalnızca bunu değiştir. */
  NOTIFY_TO: 'info@laraassociation.org',

  SITE_URL: 'laraassociation.org',
  TIMEZONE: 'Europe/Istanbul',

  /* Gelen kutusunda görünecek gönderen adları */
  NOTIFY_SENDER_NAME: 'LARA Üyelik Formu',
  CONFIRM_SENDER_NAME: { tr: 'LARA Derneği', en: 'LARA Association' },

  MIN_AGE: 18,
  MAX_AGE: 100,

  MAX_LEN: {
    fullName: 80, email: 254, phone: 25, city: 60, occupation: 120,
    languages: 160, experience: 60, motivation: 3000
  },

  /* Tekrar koruması, saniye cinsinden (CacheService en fazla 21600 sn = 6 saat tutar) */
  TTL_SUBMISSION_STATE: 21600,  // başvurunun hangi maillerinin gittiği 6 saat saklanır
  TTL_SAME_CONTENT: 1800,       // birebir aynı içerik 30 dakika boyunca aynı başvuru sayılır

  /* Kötüye kullanıma karşı tüm site için saatlik üst sınır (yeni başvurular) */
  MAX_APPLICATIONS_PER_HOUR: 30,

  /* Cloudflare Turnstile — sunucu tarafı doğrulama.
     Gizli anahtar KODDA TUTULMAZ: Proje Ayarları → Komut Dosyası Özellikleri'nde
     TURNSTILE_SECRET_KEY adıyla saklanır.

     REQUIRED yalnızca "jeton HİÇ gelmediğinde" ne yapılacağını belirler:
       false → jeton yoksa başvuru kabul edilir (site anahtarı yayına alınmadan dağıtım için).
       true  → jeton yoksa başvuru reddedilir.
     Site anahtarı canlıda doğrulandıktan sonra true yapıldı (13.10.2026).

     Jeton GELDİYSE doğrulama hiçbir koşulda atlanmaz: Cloudflare reddederse,
     gizli anahtar tanımlı değilse ya da Cloudflare'a ulaşılamazsa başvuru reddedilir
     ve hiçbir mail gönderilmez. */
  TURNSTILE: {
    REQUIRED: true,
    SECRET_PROPERTY: 'TURNSTILE_SECRET_KEY',
    VERIFY_URL: 'https://challenges.cloudflare.com/turnstile/v0/siteverify',
    MAX_TOKEN_LEN: 2048
  },

  /* Google Sheets takip tablosu.
     Tablo kimliği KODDA TUTULMAZ: Proje Ayarları → Komut Dosyası Özellikleri'nde
     SHEET_ID adıyla saklanır.

     Acil durdurma: SHEETS_ENABLED özelliğine 'false' yazmak Sheets yazımını anında
     durdurur, mailler çalışmaya devam eder ve YENİDEN DAĞITIM GEREKTİRMEZ. */
  SHEETS: {
    ID_PROPERTY: 'SHEET_ID',
    ENABLED_PROPERTY: 'SHEETS_ENABLED',
    SAYFA: 'Üyelik Başvuruları',
    AKTIF_SAYFA: 'Aktif Üyeler',

    /* Sütun başlıkları. Satır yazılırken sütun sırası DEĞİL başlık adı esas alınır;
       yönetim araya sütun eklerse ya da sırayı değiştirirse yanlış hücreye yazılmaz. */
    BASLIK: {
      TARIH:        'Başvuru Tarihi',
      KIMLIK:       'Başvuru Kimliği',
      AD:           'Ad Soyad',
      EPOSTA:       'E-posta',
      TELEFON:      'Telefon',
      DOGUM:        'Doğum Tarihi',
      YAS:          'Yaş',
      SEHIR:        'Şehir',
      MESLEK:       'Meslek / Bölüm',
      DILLER:       'Yabancı Diller',
      DENEYIM:      'Proje Deneyimi',
      ILGI:         'İlgi Alanları',
      MOTIVASYON:   'Motivasyon',
      ILKELER:      'İlkeler Onayı',
      KVKK:         'KVKK Onayı',
      FORM_DILI:    'Form Dili',
      ODEME_DURUM:  'Ödeme Durumu',
      ODEME_TARIH:  'Ödeme Tarihi',
      ODEME_TUTAR:  'Ödeme Tutarı',
      UYELIK_DURUM: 'Üyelik Durumu',
      KARAR_TARIH:  'Karar Tarihi',
      UYELIK_TARIH: 'Üyelik Tarihi',
      NOT:          'Yönetim Notu',
      KAYNAK:       'Kayıt Kaynağı'
    },

    /* Soldan sağa sütun sırası (kurulum bu sırayla yazar) */
    SIRA: ['TARIH', 'KIMLIK', 'AD', 'EPOSTA', 'TELEFON', 'DOGUM', 'YAS', 'SEHIR',
           'MESLEK', 'DILLER', 'DENEYIM', 'ILGI', 'MOTIVASYON', 'ILKELER', 'KVKK',
           'FORM_DILI', 'ODEME_DURUM', 'ODEME_TARIH', 'ODEME_TUTAR', 'UYELIK_DURUM',
           'KARAR_TARIH', 'UYELIK_TARIH', 'NOT', 'KAYNAK'],

    /* Otomasyonun yazdığı sütunlar — biri eksikse yazma yapılmaz (yanlış hücreye
       yazmaktansa durmak güvenlidir). Yönetimin elle doldurduğu tarih/tutar/not
       sütunları burada YOKTUR; otomasyon onlara hiç dokunmaz. */
    ZORUNLU: ['TARIH', 'KIMLIK', 'AD', 'EPOSTA', 'TELEFON', 'DOGUM', 'YAS', 'SEHIR',
              'MESLEK', 'DILLER', 'DENEYIM', 'ILGI', 'MOTIVASYON', 'ILKELER', 'KVKK',
              'FORM_DILI', 'ODEME_DURUM', 'UYELIK_DURUM', 'KAYNAK'],

    /* Yeni satırda yazılan başlangıç değerleri. Yalnızca EKLEME anında yazılır. */
    VARSAYILAN: { ODEME: 'Beklemede', UYELIK: 'Başvuru Alındı', KAYNAK: 'Web formu' },

    ODEME_SECENEKLERI:  ['Beklemede', 'Ödendi', 'Ödenmedi', 'Muaf', 'İade Edildi'],
    UYELIK_SECENEKLERI: ['Başvuru Alındı', 'İnceleniyor', 'Yönetim Onayı Bekliyor',
                         'Onaylandı', 'Reddedildi', 'Üyelikten Ayrıldı'],

    /* Aktif Üyeler sayfasında gösterilecek sütunlar (soldan sağa) */
    AKTIF_SUTUNLAR: ['KIMLIK', 'AD', 'TELEFON', 'EPOSTA', 'SEHIR', 'UYELIK_TARIH'],
    AKTIF_FILTRE: { ODEME: 'Ödendi', UYELIK: 'Onaylandı' },

    /* Kurulumun hazırladığı satır sayısı (açılır liste ve biçimler bu kadar satıra uygulanır) */
    HAZIRLIK_SATIR: 2000,

    /* Sayfa 1'de sola sabitlenen sütun sayısı: Başvuru Tarihi + Kimlik + Ad Soyad.
       Sağa kaydırırken kimin satırına baktığın kaybolmasın diye. */
    DONMUS_SUTUN: 3
  },

  /* true iken hiçbir mail gönderilmez; oluşturulan mailler yalnızca günlüğe yazılır */
  DRY_RUN: false
};

/* "Proje Deneyimi" seçeneği: form dili değişince metin de değişir; ikisi de kabul edilir. */
const EXPERIENCE_LABELS = {
  '': '—',
  'Evet, katıldım': 'Evet, katıldım',
  'Hayır, ilk kez katılacağım': 'Hayır, ilk kez katılacağım',
  'Yes, I have': 'Evet, katıldım',
  'No, this would be my first': 'Hayır, ilk kez katılacağım'
};

/* İlgi alanı kutucuklarının değerleri (formda her iki dilde de Türkçe gönderilir) */
const ALLOWED_INTERESTS = [
  'Uluslararası projeler ve hareketlilik',
  'Eğitim çalışmaları ve atölyeler',
  'Sosyal ve kültürel etkinlikler',
  'Gönüllülük ve dayanışma',
  'İletişim, tasarım ve sosyal medya',
  'Proje yazımı ve hibe başvuruları'
];

/* Ad soyad: harfle başlar/biter; arada harf, birleşik işaret, kesme işareti (' ve ’), nokta, boşluk, tire */
const NAME_RE  = /^\p{L}[\p{L}\p{M}'’. -]*\p{L}\.?$/u;
const EMAIL_RE = /^[^\s@<>()[\]\\,;:"']{1,64}@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*\.[A-Za-z]{2,24}$/;
const PHONE_RE = /^\+?[\d\s().-]+$/;
const SUBMISSION_ID_RE = /^[A-Za-z0-9-]{8,64}$/;

/* Görünmez / yön değiştiren karakterler (sıfır genişlik, bidi override vb.).
   Kaynakta görünmez karakter bulunmasın diye kod noktalarıyla oluşturulur. */
const INVISIBLE_RE = new RegExp('[' +
  String.fromCharCode(0x200B) + '-' + String.fromCharCode(0x200F) +
  String.fromCharCode(0x202A) + '-' + String.fromCharCode(0x202E) +
  String.fromCharCode(0x2066) + '-' + String.fromCharCode(0x2069) +
  String.fromCharCode(0xFEFF) + ']', 'g');


/* ======================== HTTP GİRİŞ NOKTALARI ======================== */

/** Tarayıcıda adres açılınca çalışır: kurulumun doğru yapıldığını gösterir. */
function doGet() {
  return json_({ ok: true, service: 'lara-membership', version: 2 });
}

/** Form buraya POST eder. Gövde düz metin olarak gelen JSON'dur. */
function doPost(e) {
  let raw;
  try {
    raw = JSON.parse((e && e.postData && e.postData.contents) || '');
  } catch (err) {
    console.error(JSON.stringify({ event: 'submission_rejected', reason: 'BAD_REQUEST' }));
    return json_(result_(false, false, false, 'BAD_REQUEST'));
  }
  try {
    return json_(handleSubmission_(raw));
  } catch (err) {
    console.error(JSON.stringify({ event: 'server_error', error: errText_(err) }));
    return json_(result_(false, false, false, 'SERVER'));
  }
}


/* ============================ ANA İŞ AKIŞI ============================ */

function handleSubmission_(raw, deps) {
  deps = deps || defaultDeps_();
  const log = deps.log;

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    log('submission_rejected', { reason: 'BAD_REQUEST' });
    return result_(false, false, false, 'BAD_REQUEST');
  }

  // Bot tuzağı: gizli alan doluysa hiçbir mail gönderme; botu uyarmamak için başarı biçiminde dön.
  if (cleanText_(raw.honey)) {
    log('submission_rejected', { reason: 'HONEYPOT' });
    return result_(true, true, true);
  }

  const d = normalize_(raw);
  const invalid = validate_(d, deps);
  if (invalid.length) {
    log('submission_rejected', { reason: 'VALIDATION', fields: invalid });
    const r = result_(false, false, false, 'VALIDATION');
    r.fields = invalid;
    return r;
  }

  /* Turnstile — buradan geçemeyen başvuru hiçbir mail üretmez. */
  const ts = verifyTurnstile_(d.turnstileToken, deps);
  if (ts !== 'ok') {
    const kod = (ts === 'MISSING') ? 'TURNSTILE_MISSING'
              : (ts === 'FAILED')  ? 'TURNSTILE_FAILED'
              : 'TURNSTILE_UNAVAILABLE';
    log('submission_rejected', { submission_id: d.submissionId, reason: kod });
    return result_(false, false, false, kod);
  }

  log('submission_received', { submission_id: d.submissionId, applicant_email: d.email, lang: d.lang });

  if (!deps.lock.tryLock(15000)) {
    log('submission_rejected', { submission_id: d.submissionId, reason: 'BUSY' });
    return result_(false, false, false, 'BUSY');
  }

  try {
    const cache = deps.cache;
    const contentKey = 'fp:' + deps.digest(fingerprintSource_(d));
    let sid = d.submissionId;

    // Bu başvurunun hangi mailleri daha önce gitti?
    let state = readState_(cache, sid);
    if (!state) {
      // Aynı içerik kısa süre önce başka bir kimlikle geldiyse, o başvurunun devamı say.
      const earlierSid = cache.get(contentKey);
      const earlier = (earlierSid && earlierSid !== sid) ? readState_(cache, earlierSid) : null;
      if (earlier) {
        log('duplicate_content', { submission_id: sid, original_submission_id: earlierSid });
        sid = earlierSid;
        state = earlier;
      }
    }
    const isNew = !state;
    state = state || { internal: false, confirmation: false };

    const hourKey = 'rate:' + deps.formatDate(deps.now, 'yyyyMMddHH');
    const hourCount = Number(cache.get(hourKey) || 0);
    if (isNew && hourCount >= CONFIG.MAX_APPLICATIONS_PER_HOUR) {
      log('submission_rejected', { submission_id: sid, reason: 'RATE_LIMIT' });
      return result_(false, false, false, 'RATE_LIMIT');
    }

    const meta = {
      submissionId: sid,
      receivedAt: deps.formatDate(deps.now, 'dd.MM.yyyy HH:mm'),
      age: ageOf_(d.birthDate, deps)
    };
    /* Sheets yazımı maillerden ÖNCE: Gmail ile Sheets birbirinden bağımsız iki yedek
       olsun diye. Hata burada ASLA başvuruyu reddetmez; yalnızca iç bildirimin konusu
       işaretlenir ve yanıtta sheetSaved:false döner. */
    const sheetDurum = deps.dryRun ? 'dryrun' : kaydetSheets_(d, meta, deps);
    const tabloSorunlu = (sheetDurum === 'error');
    const sheetYazildi = (sheetDurum === 'ok' || sheetDurum === 'duplicate');

    /* Yanıta Sheets durumunu ekler. Site yalnızca ok/internal/confirmation üçlüsüne
       baktığı için bu alan form akışını etkilemez. */
    function son_(r) {
      if (sheetDurum !== 'dryrun') r.sheetSaved = sheetYazildi;
      return r;
    }

    /* Her iki mail de gitmişse YENİ MAİL ÜRETİLMEZ — mükerrer e-posta olmaz.
       Bu kontrol bilerek Sheets yazımından SONRA yapılır: ilk denemede tabloya
       yazılamadıysa, tekrar gelen aynı başvuru eksik satırı tamamlayabilsin.
       Mükerrer satırı tablodaki Başvuru Kimliği kontrolü engeller. */
    if (state.internal && state.confirmation) {
      log('duplicate_submission', { submission_id: sid, sheet: sheetDurum });
      const dup = son_(result_(true, true, true));
      dup.duplicate = true;
      return dup;
    }

    const notice = buildNotification_(d, meta, tabloSorunlu);
    const confirm = buildConfirmation_(d, meta);

    if (deps.dryRun) {
      console.log('KURU ÇALIŞMA — mail gönderilmedi.\n\n' +
        '=== İÇ BİLDİRİM ===\nKime: ' + CONFIG.NOTIFY_TO + '\nYanıtla: ' + d.email +
        '\nKonu: ' + notice.subject + '\n\n' + notice.text +
        '\n\n=== TEYİT MAİLİ ===\nKime: ' + d.email + '\nGönderen adı: ' + CONFIG.CONFIRM_SENDER_NAME[d.lang] +
        '\nKonu: ' + confirm.subject + '\n\n' + confirm.text);
      const dry = result_(true, true, true);
      dry.dryRun = true;
      dry.notice = notice;
      dry.confirm = confirm;
      return dry;
    }

    // Kota, bu başvurunun kalan maillerinin tamamına yetmiyorsa hiç başlama (yarım kalmasın).
    const needed = (state.internal ? 0 : 1) + (state.confirmation ? 0 : 1);
    if (deps.mail.remaining() < needed) {
      log('submission_rejected', { submission_id: sid, reason: 'QUOTA' });
      return son_(result_(false, state.internal, state.confirmation, 'QUOTA'));
    }

    // 1) İç bildirim — yalnızca daha önce gitmediyse
    if (!state.internal) {
      log('internal_notification_attempted', { submission_id: sid });
      try {
        deps.mail.send({
          to: CONFIG.NOTIFY_TO,
          replyTo: d.email,                   // "Yanıtla" doğrudan başvurana gider
          name: CONFIG.NOTIFY_SENDER_NAME,
          subject: notice.subject,
          body: notice.text,
          htmlBody: notice.html
        });
      } catch (err) {
        log('internal_notification_error', { submission_id: sid, error: errText_(err) });
        return son_(result_(false, false, false, 'INTERNAL_NOTIFICATION_FAILED'));
      }
      state.internal = true;
      writeState_(cache, sid, state, log);
      cache.put(contentKey, sid, CONFIG.TTL_SAME_CONTENT);
      if (isNew) cache.put(hourKey, String(hourCount + 1), 3600);
      log('internal_notification_sent', { submission_id: sid });
    }

    // 2) Teyit maili — hata YUTULMAZ: başarısızsa yanıt ok:false döner.
    log('confirmation_attempted', { submission_id: sid, confirmation_recipient: d.email });
    try {
      deps.mail.send({
        to: d.email,
        name: CONFIG.CONFIRM_SENDER_NAME[d.lang],
        subject: confirm.subject,
        body: confirm.text,
        htmlBody: confirm.html
      });
    } catch (err) {
      log('confirmation_error', { submission_id: sid, confirmation_recipient: d.email, error: errText_(err) });
      return son_(result_(false, true, false, 'CONFIRMATION_FAILED'));
    }
    state.confirmation = true;
    writeState_(cache, sid, state, log);
    log('confirmation_sent', { submission_id: sid, confirmation_recipient: d.email });

    return son_(result_(true, true, true));
  } finally {
    deps.lock.releaseLock();
  }
}

/** Yanıt nesnesi — iki mailin durumu her yanıtta açıkça yer alır. */
function result_(ok, internalNotificationSent, confirmationSent, error) {
  const r = { ok: ok, internalNotificationSent: internalNotificationSent, confirmationSent: confirmationSent };
  if (error) r.error = error;
  return r;
}

function readState_(cache, sid) {
  if (!sid) return null;
  const v = cache.get('sub:' + sid);
  if (!v) return null;
  try {
    const s = JSON.parse(v);
    return { internal: s.internal === true, confirmation: s.confirmation === true };
  } catch (err) {
    return null;
  }
}

function writeState_(cache, sid, state, log) {
  try {
    cache.put('sub:' + sid, JSON.stringify(state), CONFIG.TTL_SUBMISSION_STATE);
  } catch (err) {
    log('state_write_error', { submission_id: sid, error: errText_(err) });
  }
}


/* ======================= TEMİZLEME VE DOĞRULAMA ======================= */

/** Metni güvenli hâle getirir: kontrol ve görünmez karakterleri atar, boşlukları sadeleştirir. */
function cleanText_(value, allowNewlines) {
  if (value === null || value === undefined) return '';
  let s = String(value).slice(0, 10000);
  if (s.normalize) s = s.normalize('NFC');
  s = s.replace(INVISIBLE_RE, '');
  if (allowNewlines) {
    s = s.replace(/\r\n?/g, '\n')
         .replace(/[\x00-\x09\x0B-\x1F\x7F]/g, '')
         .replace(/[ \t]+/g, ' ')
         .replace(/\n{3,}/g, '\n\n');
    return s.trim();
  }
  return s.replace(/[\x00-\x1F\x7F]/g, ' ').replace(/\s+/g, ' ').trim();
}

function normalize_(raw) {
  const phone = cleanText_(raw.phone);
  const interests = [];
  if (Array.isArray(raw.interests)) {
    raw.interests.slice(0, 20).forEach(function (v) {
      const c = cleanText_(v);
      if (ALLOWED_INTERESTS.indexOf(c) !== -1 && interests.indexOf(c) === -1) interests.push(c);
    });
  }
  const sid = String(raw.submissionId || '');
  return {
    submissionId: SUBMISSION_ID_RE.test(sid) ? sid : '',
    lang: raw.lang === 'en' ? 'en' : 'tr',
    fullName: cleanText_(raw.fullName),
    email: cleanText_(raw.email),
    phone: phone,
    phoneDigits: phone.replace(/\D/g, ''),
    birthDate: cleanText_(raw.birthDate),
    city: cleanText_(raw.city),
    occupation: cleanText_(raw.occupation),
    languages: cleanText_(raw.languages),
    experience: cleanText_(raw.experience),
    interests: interests,
    motivation: cleanText_(raw.motivation, true),
    consentPrinciples: raw.consentPrinciples === true,
    consentKvkk: raw.consentKvkk === true,
    turnstileToken: String(raw.turnstileToken || '').slice(0, CONFIG.TURNSTILE.MAX_TOKEN_LEN).trim()
  };
}

/** Geçersiz alanların listesini döner. Liste boş değilse hiçbir mail gönderilmez. */
function validate_(d, deps) {
  const bad = [];
  const L = CONFIG.MAX_LEN;

  if (!d.submissionId) bad.push('submissionId');

  // Ad soyad: "site.com" gibi adres benzeri ifadeler de reddedilir.
  if (!d.fullName || d.fullName.length > L.fullName || !NAME_RE.test(d.fullName) ||
      /\p{L}{2,}\.\p{L}{2,}/u.test(d.fullName)) bad.push('fullName');

  if (!d.email || d.email.length > L.email || !EMAIL_RE.test(d.email)) bad.push('email');

  if (!d.phone || d.phone.length > L.phone || !PHONE_RE.test(d.phone) ||
      d.phoneDigits.length < 10 || d.phoneDigits.length > 15) bad.push('phone');

  const age = ageOf_(d.birthDate, deps);
  if (age === null || age < CONFIG.MIN_AGE || age > CONFIG.MAX_AGE) bad.push('birthDate');

  ['city', 'occupation', 'languages', 'motivation'].forEach(function (k) {
    if (d[k].length > L[k]) bad.push(k);
  });

  if (!Object.prototype.hasOwnProperty.call(EXPERIENCE_LABELS, d.experience)) bad.push('experience');

  if (!d.consentPrinciples) bad.push('consentPrinciples');
  if (!d.consentKvkk) bad.push('consentKvkk');

  return bad;
}

/** "YYYY-MM-DD" → İstanbul saatine göre bugünkü yaş. Geçersiz ya da gelecekteki tarihse null. */
function ageOf_(ymd, deps) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd || '');
  if (!m) return null;
  const y = Number(m[1]), mo = Number(m[2]), da = Number(m[3]);
  const dt = new Date(Date.UTC(y, mo - 1, da));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== da) return null;

  const t = /^(\d{4})-(\d{2})-(\d{2})$/.exec(deps.formatDate(deps.now, 'yyyy-MM-dd'));
  const ty = Number(t[1]), tm = Number(t[2]), td = Number(t[3]);
  let age = ty - y;
  if (tm < mo || (tm === mo && td < da)) age--;
  return age < 0 ? null : age;
}

/** Tekrar kontrolü için başvuru içeriğinin özeti (dil ve kimlik hariç). */
function fingerprintSource_(d) {
  return JSON.stringify([
    d.fullName.toLowerCase(), d.email.toLowerCase(), d.phoneDigits, d.birthDate,
    d.city, d.occupation, d.languages, EXPERIENCE_LABELS[d.experience],
    d.interests, d.motivation, d.consentPrinciples, d.consentKvkk
  ]);
}


/* ============================ E-POSTALAR ============================ */

function buildNotification_(d, meta, tabloSorunlu) {
  const intro = 'Yeni bir LARA Derneği üyelik başvurusu alınmıştır.';
  /* Sheets'e yazılamadıysa bu mail başvurunun TEK kaydıdır; yönetim görsün. */
  const uyari = tabloSorunlu
    ? 'DİKKAT: Bu başvuru takip tablosuna yazılamadı. Aşağıdaki bilgileri tabloya elle ekleyiniz.'
    : '';
  const source = 'Bu başvuru ' + CONFIG.SITE_URL + ' üzerindeki üyelik formundan gönderilmiştir.';
  const onaylar =
    (d.consentPrinciples ? '18 yaşından büyük ve ilkeleri benimsiyor ✓' : '✗') + ' · ' +
    (d.consentKvkk ? 'KVKK metni onaylandı ✓' : '✗');

  const rows = [
    ['Ad Soyad', d.fullName],
    ['E-posta', d.email],
    ['Telefon', d.phone],
    ['Doğum Tarihi', formatBirth_(d.birthDate) + ' (' + meta.age + ' yaş)'],
    ['Şehir', d.city || '—'],
    ['Meslek / Bölüm', d.occupation || '—'],
    ['Bildiği Yabancı Diller', d.languages || '—'],
    ['Daha önce Erasmus+ veya gençlik projesine katıldı mı?', EXPERIENCE_LABELS[d.experience]],
    ['İlgi Alanları', d.interests.length ? d.interests.join(', ') : '—'],
    ["Neden LARA'ya Katılmak İstiyor?", d.motivation || '—'],
    ['Onaylar', onaylar],
    ['Başvuru Tarihi ve Saati', meta.receivedAt],
    ['Formun Doldurulduğu Dil', d.lang === 'en' ? 'İngilizce' : 'Türkçe'],
    ['Başvuru Kimliği', meta.submissionId]
  ];

  const text = (uyari ? uyari + '\n\n' : '') + intro + '\n\n' +
    rows.map(function (r) { return r[0] + ': ' + r[1]; }).join('\n') +
    '\n\n' + source;

  const cell = 'padding:10px 0;border-top:1px solid #E1E9EF;vertical-align:top;';
  const htmlRows = rows.map(function (r) {
    let value = escapeHtml_(r[1]).replace(/\n/g, '<br>');
    if (r[0] === 'E-posta') {
      value = '<a href="mailto:' + escapeHtml_(d.email) + '" style="color:#159A9C;text-decoration:none;">' + value + '</a>';
    }
    return '<tr>' +
      '<td style="' + cell + 'padding-right:14px;width:38%;color:#7A8898;">' + escapeHtml_(r[0]) + '</td>' +
      '<td style="' + cell + 'color:#10233B;">' + value + '</td>' +
      '</tr>';
  }).join('');

  const html =
    '<div style="background:#F1F6F8;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;">' +
      '<div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #E1E9EF;border-radius:14px;padding:28px;">' +
        '<p style="margin:0 0 4px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#FF684D;font-weight:bold;">LARA Derneği</p>' +
        '<h2 style="margin:0 0 8px;font-size:19px;color:#0B2D52;">Yeni Üyelik Başvurusu</h2>' +
        (uyari ? '<p style="margin:0 0 14px;padding:10px 12px;border-radius:8px;background:#FFF1EE;border:1px solid #FF684D;font-size:14px;color:#A02F18;"><strong>' + escapeHtml_(uyari) + '</strong></p>' : '') +
        '<p style="margin:0 0 18px;font-size:14px;color:#44546A;">' + escapeHtml_(intro) + '</p>' +
        '<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;font-size:14px;line-height:1.5;">' +
          htmlRows +
        '</table>' +
        '<p style="margin:20px 0 0;font-size:12px;color:#7A8898;">' + escapeHtml_(source) + '</p>' +
      '</div>' +
    '</div>';

  return {
    subject: headerSafe_((tabloSorunlu ? '[TABLOYA YAZILAMADI] ' : '') + 'Yeni Üyelik Başvurusu – ' + d.fullName),
    text: text,
    html: html
  };
}

function buildConfirmation_(d, meta) {
  const first = firstName_(d.fullName);
  const t = d.lang === 'en'
    ? {
        subject: 'LARA Association | Your Membership Application Has Been Received',
        greeting: 'Hello ' + first + ',',
        lines: [
          'Your membership application to LARA Association has been received successfully.',
          'Your application will be reviewed by our board, and we will contact you by email once the evaluation is complete.',
          'Thank you for your interest.'
        ],
        org: 'LARA Association'
      }
    : {
        subject: 'LARA Derneği | Üyelik Başvurunuz Alındı',
        greeting: 'Merhaba ' + first + ',',
        lines: [
          'LARA Derneği üyelik başvurunuz başarıyla alınmıştır.',
          'Başvurunuz yönetim kurulumuz tarafından değerlendirilecek ve değerlendirme sonucunda sizinle e-posta yoluyla iletişime geçilecektir.',
          'İlginiz için teşekkür ederiz.'
        ],
        org: 'LARA Derneği'
      };

  const tagline = 'Learning · Action · Rights · Access';

  const text = t.greeting + '\n\n' + t.lines.join('\n\n') + '\n\n' +
    t.org + '\n' + tagline + '\n' + CONFIG.SITE_URL;

  const p = 'margin:0 0 16px;font-size:15px;line-height:1.65;color:#10233B;';
  const html =
    '<div style="background:#F1F6F8;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;">' +
      '<div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #E1E9EF;border-radius:14px;padding:32px 28px;">' +
        gizliReferans_(meta) +
        '<p style="' + p + '">' + escapeHtml_(t.greeting) + '</p>' +
        t.lines.map(function (l) { return '<p style="' + p + '">' + escapeHtml_(l) + '</p>'; }).join('') +
        '<div style="margin-top:26px;padding-top:18px;border-top:1px solid #E1E9EF;font-size:14px;line-height:1.6;">' +
          '<strong style="color:#0B2D52;">' + escapeHtml_(t.org) + '</strong><br>' +
          '<span style="color:#159A9C;">' + escapeHtml_(tagline) + '</span><br>' +
          '<a href="https://' + CONFIG.SITE_URL + '" style="color:#FF684D;text-decoration:none;">' + CONFIG.SITE_URL + '</a>' +
        '</div>' +
      '</div>' +
    '</div>';

  return { subject: headerSafe_(t.subject), text: text, html: html };
}


/* ============================ YARDIMCILAR ============================ */

/** Okunmayan, yalnızca teyit mailini benzersizleştiren referans.
    Gövde her seferinde birebir aynı olduğunda Gmail tekrar eden kısmı "..." arkasına
    gizliyor; bu satır her maili farklı kılarak o gizlemeyi engeller.
    Görünen içeriği değiştirmez. */
function gizliReferans_(meta) {
  if (!meta || !meta.submissionId) return '';
  const ref = meta.submissionId + ' · ' + (meta.receivedAt || '');
  return '<span style="display:none !important;font-size:0;line-height:0;max-height:0;' +
    'opacity:0;color:transparent;visibility:hidden;">' + escapeHtml_(ref) + '</span>';
}

/* ---------------------------- GOOGLE SHEETS ----------------------------
   Takip tablosuna tek satır ekler. Üç kural:
     1) Yalnızca EKLER. Mevcut hiçbir satırı güncellemez, silmez, sıralamaz.
        Yönetimin ödeme/üyelik alanlarına yazdıkları bu yüzden ezilemez.
     2) Sütunu BAŞLIK ADIYLA bulur, sabit harfle değil. Araya sütun eklenirse
        ya da sıra değişirse yanlış hücreye yazmaz; başlık eksikse hiç yazmaz.
     3) Mükerrer kaydı tablodaki Başvuru Kimliği sütunundan engeller. Önbelleğe
        bağlı olmadığı için 6 saatlik CacheService ömründen etkilenmez.
   Dönüş: 'ok' | 'duplicate' | 'disabled' | 'error'
   Hiçbir durumda istisna fırlatmaz — Sheets sorunu başvuruyu düşürmemelidir. */
function kaydetSheets_(d, meta, deps) {
  const S = CONFIG.SHEETS;
  let sayfa;

  try {
    if (!deps.sheets || !deps.sheets.etkin()) {
      deps.log('sheet_skipped', { submission_id: meta.submissionId, reason: 'DISABLED' });
      return 'disabled';
    }
    sayfa = deps.sheets.sayfa();
  } catch (err) {
    deps.log('sheet_error', { submission_id: meta.submissionId, reason: 'OPEN', error: errText_(err) });
    return 'error';
  }
  if (!sayfa) {
    deps.log('sheet_error', { submission_id: meta.submissionId, reason: 'SHEET_NOT_FOUND' });
    return 'error';
  }

  try {
    const sonSatir = sayfa.getLastRow();
    const sutunSayisi = Math.max(sayfa.getLastColumn(), S.SIRA.length);
    const basliklar = sayfa.getRange(1, 1, 1, sutunSayisi).getValues()[0];

    // başlık adı -> 0 tabanlı sütun indeksi
    const harita = {};
    basliklar.forEach(function (b, i) {
      const ad = String(b === null || b === undefined ? '' : b).trim();
      if (ad && !(ad in harita)) harita[ad] = i;
    });

    const eksik = S.ZORUNLU.filter(function (k) { return !(S.BASLIK[k] in harita); })
                           .map(function (k) { return S.BASLIK[k]; });
    if (eksik.length) {
      deps.log('sheet_error', { submission_id: meta.submissionId, reason: 'HEADERS_MISSING', headers: eksik.join(',') });
      return 'error';
    }

    // mükerrer kontrolü — tablo kalıcı kaynaktır
    const kimlikSutun = harita[S.BASLIK.KIMLIK] + 1;
    if (sonSatir >= 2) {
      const kimlikler = sayfa.getRange(2, kimlikSutun, sonSatir - 1, 1).getValues();
      for (let i = 0; i < kimlikler.length; i++) {
        if (String(kimlikler[i][0]).trim() === meta.submissionId) {
          deps.log('sheet_duplicate', { submission_id: meta.submissionId, row: i + 2 });
          return 'duplicate';
        }
      }
    }

    const degerler = sheetSatiri_(d, meta, deps);
    const satir = [];
    for (let i = 0; i < sutunSayisi; i++) satir.push('');
    Object.keys(degerler).forEach(function (baslik) {
      if (baslik in harita) satir[harita[baslik]] = degerler[baslik];
    });

    sayfa.getRange(sonSatir + 1, 1, 1, sutunSayisi).setValues([satir]);
    deps.log('sheet_row_added', { submission_id: meta.submissionId, row: sonSatir + 1 });
    return 'ok';
  } catch (err) {
    deps.log('sheet_error', { submission_id: meta.submissionId, reason: 'WRITE', error: errText_(err) });
    return 'error';
  }
}

/** Başvurudan { başlık: değer } eşlemesi üretir.
    Yönetime ait tarih/tutar/not sütunları BİLEREK yoktur — otomasyon onlara yazmaz. */
function sheetSatiri_(d, meta, deps) {
  const B = CONFIG.SHEETS.BASLIK;
  const V = CONFIG.SHEETS.VARSAYILAN;
  const o = {};
  o[B.TARIH]        = deps.now;
  o[B.KIMLIK]       = meta.submissionId;
  o[B.AD]           = formulGuvenli_(d.fullName);
  o[B.EPOSTA]       = formulGuvenli_(d.email);
  o[B.TELEFON]      = formulGuvenli_(d.phone);
  o[B.DOGUM]        = tariheCevir_(d.birthDate);
  o[B.YAS]          = (meta.age === null || meta.age === undefined) ? '' : meta.age;
  o[B.SEHIR]        = formulGuvenli_(d.city);
  o[B.MESLEK]       = formulGuvenli_(d.occupation);
  o[B.DILLER]       = formulGuvenli_(d.languages);
  o[B.DENEYIM]      = formulGuvenli_(EXPERIENCE_LABELS[d.experience] || '');
  o[B.ILGI]         = formulGuvenli_(d.interests.join(', '));
  o[B.MOTIVASYON]   = formulGuvenli_(d.motivation);
  o[B.ILKELER]      = d.consentPrinciples ? 'Evet' : 'Hayır';
  o[B.KVKK]         = d.consentKvkk ? 'Evet' : 'Hayır';
  o[B.FORM_DILI]    = (d.lang === 'en') ? 'İngilizce' : 'Türkçe';
  o[B.ODEME_DURUM]  = V.ODEME;
  o[B.UYELIK_DURUM] = V.UYELIK;
  o[B.KAYNAK]       = V.KAYNAK;
  return o;
}

/** Formül enjeksiyonu koruması.
    "=", "+", "-", "@", sekme veya satır başı ile başlayan kullanıcı metni Sheets'te
    formül olarak yorumlanabilir; başına tek tırnak konunca metin olarak kalır.
    Tek tırnak hücrenin değerine dahil olmaz, yalnızca "bunu metin say" işaretidir. */
function formulGuvenli_(deger) {
  if (deger === null || deger === undefined) return '';
  const s = String(deger);
  if (!s) return '';
  return /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
}

/** "YYYY-MM-DD" -> script saat diliminde Date. Geçersizse metni olduğu gibi döner. */
function tariheCevir_(ymd) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd || '');
  if (!m) return formulGuvenli_(ymd);
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/** Sayfada en az bu kadar satır ve sütun olmasını garanti eder (varsa dokunmaz). */
function yeterAlanAc_(sayfa, satirSayisi, sutunSayisi) {
  const mevcutSatir = sayfa.getMaxRows();
  if (mevcutSatir < satirSayisi) sayfa.insertRowsAfter(mevcutSatir, satirSayisi - mevcutSatir);
  const mevcutSutun = sayfa.getMaxColumns();
  if (mevcutSutun < sutunSayisi) sayfa.insertColumnsAfter(mevcutSutun, sutunSayisi - mevcutSutun);
}

/** 1 tabanlı sütun indeksi -> harf (1 -> A, 27 -> AA) */
function sutunHarfi_(n) {
  let s = '';
  while (n > 0) { const k = (n - 1) % 26; s = String.fromCharCode(65 + k) + s; n = (n - k - 1) / 26; }
  return s;
}


/* ---------------------------- TURNSTILE ----------------------------
   Jeton Cloudflare'ın siteverify ucunda doğrulanır. Dönen değerler:
     'ok'           → doğrulandı (ya da doğrulama kapalı ve jeton yok)
     'MISSING'      → jeton yok, ama zorunlu
     'FAILED'       → Cloudflare jetonu reddetti (geçersiz, süresi dolmuş ya da tekrar kullanılmış)
     'UNAVAILABLE'  → gizli anahtar yok ya da Cloudflare'a ulaşılamadı
   Jetonun kendisi ve gizli anahtar hiçbir günlüğe yazılmaz. */
function verifyTurnstile_(token, deps) {
  const cfg = CONFIG.TURNSTILE;

  if (!token) return cfg.REQUIRED ? 'MISSING' : 'ok';

  let secret = '';
  try {
    secret = deps.scriptProperty(cfg.SECRET_PROPERTY) || '';
  } catch (err) {
    deps.log('turnstile_error', { reason: 'PROPERTY_READ', error: errText_(err) });
    return 'UNAVAILABLE';
  }
  if (!secret) {
    deps.log('turnstile_error', { reason: 'SECRET_NOT_SET' });
    return 'UNAVAILABLE';
  }

  let body;
  try {
    body = deps.fetchJson(cfg.VERIFY_URL, { secret: secret, response: token });
  } catch (err) {
    deps.log('turnstile_error', { reason: 'FETCH', error: errText_(err) });
    return 'UNAVAILABLE';
  }

  if (!body || typeof body !== 'object') {
    deps.log('turnstile_error', { reason: 'BAD_RESPONSE' });
    return 'UNAVAILABLE';
  }
  if (body.success === true) return 'ok';

  // Cloudflare'ın hata kodları jeton içermez; günlüğe yazmak güvenlidir.
  deps.log('turnstile_rejected', { codes: (body['error-codes'] || []).join(',') });
  return 'FAILED';
}

function escapeHtml_(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Konu satırı gibi başlık alanlarına satır sonu girmesini engeller. */
function headerSafe_(s) {
  return String(s).replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);
}

function firstName_(fullName) {
  return fullName.split(' ')[0].slice(0, 40);
}

function formatBirth_(ymd) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  return m ? m[3] + '.' + m[2] + '.' + m[1] : ymd;
}

function errText_(err) {
  return String((err && err.message) || err).slice(0, 500);
}

function sha256_(text) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8);
  return bytes.map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function defaultDeps_() {
  return {
    now: new Date(),
    dryRun: CONFIG.DRY_RUN,
    cache: CacheService.getScriptCache(),
    lock: LockService.getScriptLock(),
    digest: sha256_,
    formatDate: function (date, pattern) { return Utilities.formatDate(date, CONFIG.TIMEZONE, pattern); },
    log: function (event, data) {
      const entry = JSON.stringify(Object.assign({ event: event }, data || {}));
      if (event.indexOf('error') !== -1) console.error(entry); else console.log(entry);
    },
    /* Gönderim GmailApp ile yapılır. MailApp ile gönderilen postalar alıcı tarafından
       reddediliyordu ("Message rejected"); aynı hesaptan GmailApp ile gönderilen aynı
       içerik sorunsuz teslim ediliyor. Kalan kota bilgisi iki yolda da ortaktır,
       bu yüzden MailApp.getRemainingDailyQuota kullanılmaya devam eder.
       GmailApp.sendEmail konumsal parametre alır; aşağıdaki sarmalayıcı, çağıran
       koddaki mesaj nesnesini olduğu gibi bırakmak için dönüşümü burada yapar. */
    mail: {
      send: function (message) {
        const options = { htmlBody: message.htmlBody, name: message.name };
        if (message.replyTo) options.replyTo = message.replyTo;
        GmailApp.sendEmail(message.to, message.subject, message.body, options);
      },
      remaining: function () { return MailApp.getRemainingDailyQuota(); }
    },
    /* Google Sheets erişimi. Tablo kimliği KODDA DEĞİL, SHEET_ID script özelliğindedir.
       SHEETS_ENABLED özelliğine 'false' yazmak yazmayı anında durdurur; mailler
       etkilenmez ve yeniden dağıtım gerekmez. */
    sheets: {
      etkin: function () {
        const ozellikler = PropertiesService.getScriptProperties();
        const anahtar = ozellikler.getProperty(CONFIG.SHEETS.ENABLED_PROPERTY);
        if (String(anahtar || '').trim().toLowerCase() === 'false') return false;
        return !!ozellikler.getProperty(CONFIG.SHEETS.ID_PROPERTY);
      },
      sayfa: function () {
        const id = PropertiesService.getScriptProperties().getProperty(CONFIG.SHEETS.ID_PROPERTY);
        if (!id) return null;
        return SpreadsheetApp.openById(id).getSheetByName(CONFIG.SHEETS.SAYFA);
      }
    },
    scriptProperty: function (name) {
      return PropertiesService.getScriptProperties().getProperty(name);
    },
    fetchJson: function (url, payload) {
      const res = UrlFetchApp.fetch(url, {
        method: 'post',
        payload: payload,                 // application/x-www-form-urlencoded
        muteHttpExceptions: true,
        followRedirects: true
      });
      if (res.getResponseCode() !== 200) {
        throw new Error('HTTP ' + res.getResponseCode());
      }
      return JSON.parse(res.getContentText());
    }
  };
}


/* ==================== TABLO KURULUMU (TEK SEFERLİK) ====================
   Apps Script editöründe bir kez çalıştırılır. Yaptıkları:
     - "Üyelik Başvuruları" başlıklarını, biçimlerini ve filtresini kurar
     - Ödeme / Üyelik Durumu açılır listelerini ve renklerini ekler
     - "Aktif Üyeler" sayfasını FILTER formülüyle oluşturur
     - Detay bağlantılarını yazar
   Var olan satırlara DOKUNMAZ; yalnızca başlık satırını, biçimleri ve formülleri kurar.
   İkinci kez çalıştırılırsa uyarır; yine de istiyorsan kurulumYap(true) de.        */
function kurulumYap(zorla) {
  const S = CONFIG.SHEETS;
  const id = PropertiesService.getScriptProperties().getProperty(S.ID_PROPERTY);
  if (!id) {
    console.log('HATA: ' + S.ID_PROPERTY + ' script özelliği tanımlı değil. ' +
                'Proje Ayarları → Komut Dosyası Özellikleri bölümüne tablo kimliğini ekle.');
    return;
  }

  let ss;
  try {
    ss = SpreadsheetApp.openById(id);
  } catch (err) {
    console.log('HATA: Tablo açılamadı. ' + S.ID_PROPERTY + ' doğru mu ve ' +
                'info@laraassociation.org bu Ortak Drive\'a erişebiliyor mu? → ' + errText_(err));
    return;
  }

  const basvuru = ss.getSheetByName(S.SAYFA) || ss.insertSheet(S.SAYFA);
  const basliklar = S.SIRA.map(function (k) { return S.BASLIK[k]; });
  const sutun = function (k) { return S.SIRA.indexOf(k) + 1; };
  const son = S.HAZIRLIK_SATIR;

  /* Yeni bir Google Sheets dosyası 1000 satır × 26 sütunla gelir. Biçimler ve açılır
     listeler HAZIRLIK_SATIR kadar satıra uygulanacağı için önce o satırların VAR
     OLDUĞUNDAN emin olunur; yoksa getRange aralık hatası verip kurulum yarıda kalır. */
  yeterAlanAc_(basvuru, son + 1, basliklar.length);

  /* Formül ayıracı TABLODAN ÖLÇÜLÜR, varsayılmaz. Türkçe bölgesel ayarda Sheets
     argümanları noktalı virgülle ayırır; virgüllü formül "Formül ayrıştırma hatası"
     verir. Fonksiyon ADLARI İngilizce yazılabilir, Sheets onları kendisi çevirir. */
  const ayirac = ayiracBelirle_(ss);

  const kuruluMu = String(basvuru.getRange(1, 1).getValue()).trim() === S.BASLIK.TARIH &&
                   !!ss.getSheetByName(S.AKTIF_SAYFA);
  if (kuruluMu && zorla !== true) {
    console.log('Kurulum zaten yapılmış görünüyor. Yeniden kurmak istiyorsan kurulumYap(true) çalıştır. ' +
                'Veri satırlarına hiçbir durumda dokunulmaz.');
    return;
  }

  /* ---- başlık satırı ---- */
  basvuru.getRange(1, 1, 1, basliklar.length).setValues([basliklar]);
  basvuru.getRange(1, 1, 1, basliklar.length)
         .setFontWeight('bold').setBackground('#0B2D52').setFontColor('#FFFFFF')
         .setVerticalAlignment('middle').setWrap(true);
  /* Fazla sütunlar yalnızca BOŞSA silinir — yönetimin eklediği bir sütun varsa dokunulmaz. */
  if (basvuru.getMaxColumns() > basliklar.length && basvuru.getLastColumn() <= basliklar.length) {
    basvuru.deleteColumns(basliklar.length + 1, basvuru.getMaxColumns() - basliklar.length);
  }

  /* ---- biçimler ----
     Metin sütunları düz metin (@) yapılır: formül enjeksiyonuna karşı ikinci katman. */
  const metinler = ['KIMLIK', 'AD', 'EPOSTA', 'TELEFON', 'SEHIR', 'MESLEK', 'DILLER',
                    'DENEYIM', 'ILGI', 'MOTIVASYON', 'ILKELER', 'KVKK', 'FORM_DILI',
                    'ODEME_DURUM', 'UYELIK_DURUM', 'NOT', 'KAYNAK'];
  metinler.forEach(function (k) { basvuru.getRange(2, sutun(k), son, 1).setNumberFormat('@'); });
  basvuru.getRange(2, sutun('TARIH'), son, 1).setNumberFormat('dd.mm.yyyy hh:mm');
  ['DOGUM', 'ODEME_TARIH', 'KARAR_TARIH', 'UYELIK_TARIH'].forEach(function (k) {
    basvuru.getRange(2, sutun(k), son, 1).setNumberFormat('dd.mm.yyyy');
  });
  basvuru.getRange(2, sutun('YAS'), son, 1).setNumberFormat('0');
  basvuru.getRange(2, sutun('ODEME_TUTAR'), son, 1).setNumberFormat('#,##0.00 "₺"');
  basvuru.getRange(2, sutun('MOTIVASYON'), son, 1).setWrapStrategy(SpreadsheetApp.WrapStrategy.CLIP);

  basvuru.setColumnWidth(sutun('TARIH'), 130);
  basvuru.setColumnWidth(sutun('KIMLIK'), 250);
  basvuru.setColumnWidth(sutun('AD'), 170);
  basvuru.setColumnWidth(sutun('EPOSTA'), 210);
  basvuru.setColumnWidth(sutun('MOTIVASYON'), 260);
  basvuru.setColumnWidth(sutun('NOT'), 220);

  /* ---- açılır listeler (elle metin girilemez) ---- */
  basvuru.getRange(2, sutun('ODEME_DURUM'), son, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(S.ODEME_SECENEKLERI, true)
      .setAllowInvalid(false).setHelpText('Listeden seçiniz.').build());
  basvuru.getRange(2, sutun('UYELIK_DURUM'), son, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(S.UYELIK_SECENEKLERI, true)
      .setAllowInvalid(false).setHelpText('Listeden seçiniz.').build());

  /* ---- durum renkleri ---- */
  const kuralSayisi = bicimKurallariKur_(basvuru, ayirac);

  /* ---- filtre ---- */
  const eskiFiltre = basvuru.getFilter();
  if (eskiFiltre) eskiFiltre.remove();
  // filtre tüm sayfaya kurulur; yoksa sonradan eklenen satırlar filtrenin dışında kalır
  basvuru.getRange(1, 1, basvuru.getMaxRows(), basliklar.length).createFilter();

  /* ---- Aktif Üyeler ---- */
  const aktif = ss.getSheetByName(S.AKTIF_SAYFA) || ss.insertSheet(S.AKTIF_SAYFA);
  const eskiKoruma = aktif.getProtections(SpreadsheetApp.ProtectionType.SHEET);
  eskiKoruma.forEach(function (k) { k.remove(); });
  aktif.clear();
  aktif.clearConditionalFormatRules();

  const aktifBasliklar = S.AKTIF_SUTUNLAR.map(function (k) { return S.BASLIK[k]; }).concat(['Detay Görüntüle']);
  /* FILTER sonucu sayfadaki satır sayısından fazlaysa Sheets "#REF! dizi sonucu
     genişletilemedi" verir. Bu yüzden Sayfa 1 ile aynı satır payı açılır. */
  yeterAlanAc_(aktif, son + 1, aktifBasliklar.length);
  aktif.getRange(1, 1, 1, aktifBasliklar.length).setValues([aktifBasliklar])
       .setFontWeight('bold').setBackground('#159A9C').setFontColor('#FFFFFF');

  const formuller = aktifFormulleri_(ss, basvuru);
  aktif.getRange(2, 1).setFormula(formuller.filtre);
  aktif.getRange(2, S.AKTIF_SUTUNLAR.length + 1).setFormula(formuller.detay);

  aktif.setColumnWidth(1, 250);
  aktif.setColumnWidth(2, 170);
  aktif.setColumnWidth(4, 210);
  if (aktif.getMaxColumns() > aktifBasliklar.length && aktif.getLastColumn() <= aktifBasliklar.length) {
    aktif.deleteColumns(aktifBasliklar.length + 1, aktif.getMaxColumns() - aktifBasliklar.length);
  }

  gorunumAyarla_(basvuru, aktif);

  /* Varsayılan: uyarı koruması. Kimsenin erişimini DEĞİŞTİRMEZ, yanlışlıkla yazmaya
     karşı uyarır. Katı kilit isteniyorsa aktifSayfayiKatiKoru() ayrıca çalıştırılır;
     formül yine de silinirse formulleriOnar() geri yazar. */
  let korumaNotu;
  try {
    aktif.protect().setDescription('Aktif Üyeler — otomatik liste, elle düzenlenmez').setWarningOnly(true);
    korumaNotu = 'uyarı koruması (erişim değişmedi)';
  } catch (err) {
    korumaNotu = 'KURULAMADI → ' + errText_(err);
  }

  console.log([
    'KURULUM TAMAM',
    '  Tablo            : ' + ss.getName(),
    '  Sayfa 1          : ' + S.SAYFA + ' (' + basliklar.length + ' sütun)',
    '  Sayfa 2          : ' + S.AKTIF_SAYFA + ' — ' + korumaNotu,
    '  Açılır listeler  : Ödeme (' + S.ODEME_SECENEKLERI.length + '), Üyelik (' + S.UYELIK_SECENEKLERI.length + ')',
    '  Renk kuralları   : ' + kuralSayisi,
    '  Formül ayıracı   : "' + ayirac + '"',
    '  Donmuş           : Sayfa 1 → 1 satır + ' + CONFIG.SHEETS.DONMUS_SUTUN + ' sütun, Sayfa 2 → 1 satır',
    '',
    'SIRADAKİ ADIM: formulDurumu() çalıştır — formüllerin Sheets üzerinde gerçekten',
    'çalışıp çalışmadığını gösterir. Hata varsa oradaki yönlendirmeyi izle.'
  ].join('\n'));
}

/* ---- FORMÜL AYIRACI -------------------------------------------------------
   Apps Script'in setFormula'sı formülü OLDUĞU GİBİ yazar; onu ayrıştıran taraf
   tablonun bölgesel ayarıdır. Türkçe (tr_TR) ayarda argümanlar NOKTALI VİRGÜLLE
   ayrılır ve virgüllü bir formül "Formül ayrıştırma hatası" (#ERROR!) verir.
   Fonksiyon ADLARI İngilizce yazılabilir — Sheets bunları kendisi çevirir
   (IF → EĞER); sorun yalnızca ayıraçtadır.

   Ayıraç VARSAYILMAZ, ölçülür: geçici bir sayfaya deneme formülü yazılır, sonucuna
   bakılır, sayfa silinir. Veri sayfalarına hiç dokunulmaz.
   Gerekirse FORMULA_SEPARATOR script özelliğine ',' veya ';' yazarak elle dayatılır. */
function ayiracBelirle_(ss) {
  const zorlanan = PropertiesService.getScriptProperties().getProperty('FORMULA_SEPARATOR');
  if (zorlanan === ',' || zorlanan === ';') return zorlanan;

  const ad = '__lara_ayirac__';
  let gecici = ss.getSheetByName(ad);
  try {
    if (!gecici) gecici = ss.insertSheet(ad);
    gecici.getRange(1, 1).setFormula('=IF(1=1,"virgul","hayir")');
    const sonuc = String(gecici.getRange(1, 1).getDisplayValue()).trim();
    return (sonuc === 'virgul') ? ',' : ';';
  } catch (err) {
    return ';';   // ölçemediysek Türkçe ayarı varsay: güvenli taraf
  } finally {
    try { if (gecici) ss.deleteSheet(gecici); } catch (e) {}
  }
}

/* ---- Aktif Üyeler formülleri ----------------------------------------------
   Tek yerde üretilir: kurulum da onarım da aynı metni yazar.
   Argüman ayıracı dışarıdan verilir (ayiracBelirle_ ölçer). */
function aktifFormulleri_(ss, basvuru, ayirac) {
  const S = CONFIG.SHEETS;
  const A = (ayirac === ',' || ayirac === ';') ? ayirac : ayiracBelirle_(ss);
  const sutun = function (k) { return S.SIRA.indexOf(k) + 1; };
  const sayfaAdi = "'" + S.SAYFA.replace(/'/g, "''") + "'";
  const sonHarf = sutunHarfi_(S.SIRA.length);
  const odemeHarf = sutunHarfi_(sutun('ODEME_DURUM'));
  const uyelikHarf = sutunHarfi_(sutun('UYELIK_DURUM'));
  const kimlikHarf = sutunHarfi_(sutun('KIMLIK'));
  const secilen = S.AKTIF_SUTUNLAR.map(function (k) { return sutun(k); }).join(A);
  const kosul = sayfaAdi + '!' + odemeHarf + '2:' + odemeHarf + '="' + S.AKTIF_FILTRE.ODEME + '"' + A +
                sayfaAdi + '!' + uyelikHarf + '2:' + uyelikHarf + '="' + S.AKTIF_FILTRE.UYELIK + '"';

  return {
    ayirac: A,

    /* Birincil: CHOOSECOLS + FILTER. Sütun tiplerini olduğu gibi korur. */
    filtre: '=IFERROR(CHOOSECOLS(FILTER(' + sayfaAdi + '!A2:' + sonHarf + A + kosul + ')' + A + secilen + ')' + A + '"")',

    /* Yedek: CHOOSECOLS bu hesapta yoksa (#NAME?) QUERY sürümü kullanılır.
       QUERY'nin sorgu METNİ her zaman virgüllüdür ("select B,C,E") — o bir metin
       sabiti, bölgesel ayardan etkilenmez. Ayıraç yalnızca argümanlar arasında değişir.
       Uyarı: QUERY bir sütundaki karışık veri tiplerini tek tipe zorlar; azınlıkta
       kalan değerler boş görünebilir. Bu yüzden birincil seçenek değildir. */
    filtreQuery: '=IFERROR(QUERY(' + sayfaAdi + '!A2:' + sonHarf + A + '"select ' +
      S.AKTIF_SUTUNLAR.map(function (k) { return sutunHarfi_(sutun(k)); }).join(',') +
      ' where ' + odemeHarf + "='" + S.AKTIF_FILTRE.ODEME + "' and " +
      uyelikHarf + "='" + S.AKTIF_FILTRE.UYELIK + "'\"" + A + '0)' + A + '"")',

    /* Satır numarası MATCH ile her hesaplamada yeniden bulunur: Sayfa 1 sıralansa,
       araya satır eklense bile bağlantı doğru kişiye gider. */
    detay: '=ARRAYFORMULA(IF($A2:$A=""' + A + '""' + A + 'HYPERLINK("' + ss.getUrl() + '#gid=' + basvuru.getSheetId() +
      '&range=A"&MATCH($A2:$A' + A + sayfaAdi + '!' + kimlikHarf + ':' + kimlikHarf + A + '0)' + A + '"Detay ▸")))',

    detaySutunu: S.AKTIF_SUTUNLAR.length + 1
  };
}

/* ---- Görünüm ayarları -------------------------------------------------------
   Donmuş satır/sütunlar ve Aktif Üyeler'deki tarih biçimi. Yalnızca GÖRÜNÜM yazar;
   hiçbir hücre değerine, formüle ya da açılır listeye dokunmaz. Aynı değerler tekrar
   yazıldığı için defalarca çalıştırılabilir.                                     */
function gorunumAyarla_(basvuru, aktif) {
  const S = CONFIG.SHEETS;

  basvuru.setFrozenRows(1);
  basvuru.setFrozenColumns(S.DONMUS_SUTUN);

  if (!aktif) return;
  aktif.setFrozenRows(1);

  /* Aktif Üyeler'deki Üyelik Tarihi sütunu: FILTER'dan gelen değer tarih olduğu için
     biçim verilmezse seri numarası ya da saatli biçim görünebiliyor. */
  const sutunNo = S.AKTIF_SUTUNLAR.indexOf('UYELIK_TARIH') + 1;
  if (sutunNo > 0) {
    aktif.getRange(2, sutunNo, S.HAZIRLIK_SATIR, 1).setNumberFormat('dd.mm.yyyy');
  }
}

/** Görünümü yeniden uygular. kurulumYap() GEREKTİRMEZ; veriye, formüle ve açılır
    listelere dokunmaz. Donmuş sütunlar ya da tarih biçimi bozulursa bunu çalıştır. */
function gorunumOnarimi() {
  const S = CONFIG.SHEETS;
  const id = PropertiesService.getScriptProperties().getProperty(S.ID_PROPERTY);
  if (!id) { console.log('HATA: ' + S.ID_PROPERTY + ' tanımlı değil.'); return; }

  const ss = SpreadsheetApp.openById(id);
  const basvuru = ss.getSheetByName(S.SAYFA);
  const aktif = ss.getSheetByName(S.AKTIF_SAYFA);
  if (!basvuru) { console.log('HATA: "' + S.SAYFA + '" bulunamadı.'); return; }

  const oncekiSatir = basvuru.getLastRow();
  gorunumAyarla_(basvuru, aktif);
  SpreadsheetApp.flush();

  const sutunNo = S.AKTIF_SUTUNLAR.indexOf('UYELIK_TARIH') + 1;
  console.log([
    'GÖRÜNÜM ONARIMI TAMAM',
    '  Başvuru satırı   : ' + Math.max(oncekiSatir - 1, 0) + ' (değişmedi — veriye dokunulmadı)',
    '  Sayfa 1 donmuş   : 1 satır + ' + S.DONMUS_SUTUN + ' sütun',
    '  Sayfa 2 donmuş   : 1 satır',
    '  Üyelik Tarihi    : ' + (aktif ? sutunHarfi_(sutunNo) + ' sütunu → dd.mm.yyyy' : 'Sayfa 2 yok, atlandı')
  ].join('\n'));
}

/* ---- Koşullu biçim kuralları ----------------------------------------------
   Yalnızca BİÇİM yazar; hiçbir hücre değerine dokunmaz. Özel formül içeren iki
   kural da ayıraca duyarlıdır. Kaç kural kurulduğunu döner. */
function bicimKurallariKur_(basvuru, ayirac) {
  const S = CONFIG.SHEETS;
  const A = ayirac;
  const sutun = function (k) { return S.SIRA.indexOf(k) + 1; };
  const son = S.HAZIRLIK_SATIR;
  const renk = { yesil: '#D9EAD3', sari: '#FFF2CC', kirmizi: '#F4CCCC', gri: '#EFEFEF', turuncu: '#FCE5CD' };
  const kurallar = [];

  const renkKurali = function (k, deger, arka) {
    kurallar.push(SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo(deger).setBackground(arka)
      .setRanges([basvuru.getRange(2, sutun(k), son, 1)]).build());
  };
  renkKurali('ODEME_DURUM', 'Ödendi', renk.yesil);
  renkKurali('ODEME_DURUM', 'Beklemede', renk.sari);
  renkKurali('ODEME_DURUM', 'Ödenmedi', renk.kirmizi);
  renkKurali('ODEME_DURUM', 'İade Edildi', renk.kirmizi);
  renkKurali('ODEME_DURUM', 'Muaf', renk.gri);
  renkKurali('UYELIK_DURUM', 'Onaylandı', renk.yesil);
  renkKurali('UYELIK_DURUM', 'Başvuru Alındı', renk.sari);
  renkKurali('UYELIK_DURUM', 'İnceleniyor', renk.sari);
  renkKurali('UYELIK_DURUM', 'Yönetim Onayı Bekliyor', renk.sari);
  renkKurali('UYELIK_DURUM', 'Reddedildi', renk.kirmizi);
  renkKurali('UYELIK_DURUM', 'Üyelikten Ayrıldı', renk.kirmizi);

  const epostaHarf  = sutunHarfi_(sutun('EPOSTA'));
  const uyelikHarf  = sutunHarfi_(sutun('UYELIK_DURUM'));
  const uyTarihHarf = sutunHarfi_(sutun('UYELIK_TARIH'));

  // aynı e-posta birden fazla satırda ise işaretle (yönetim görsün diye)
  kurallar.push(SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=AND($' + epostaHarf + '2<>""' + A + 'COUNTIF($' + epostaHarf + '$2:$' + epostaHarf + A + '$' + epostaHarf + '2)>1)')
    .setBackground(renk.turuncu)
    .setRanges([basvuru.getRange(2, sutun('EPOSTA'), son, 1)]).build());

  // onaylandı ama Üyelik Tarihi boş -> hatırlatma
  kurallar.push(SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=AND($' + uyelikHarf + '2="Onaylandı"' + A + '$' + uyTarihHarf + '2="")')
    .setBackground(renk.sari)
    .setRanges([basvuru.getRange(2, sutun('UYELIK_TARIH'), son, 1)]).build());

  basvuru.setConditionalFormatRules(kurallar);
  return kurallar.length;
}

/** Tabloyu AÇAR ama DEĞİŞTİRMEZ. Formüller yerinde mi, Sheets onları kabul etmiş mi?
    Kurulumdan sonra ilk çalıştırılacak kontrol budur. */
function formulDurumu() {
  const S = CONFIG.SHEETS;
  const id = PropertiesService.getScriptProperties().getProperty(S.ID_PROPERTY);
  if (!id) { console.log('HATA: ' + S.ID_PROPERTY + ' tanımlı değil.'); return; }

  const ss = SpreadsheetApp.openById(id);
  const basvuru = ss.getSheetByName(S.SAYFA);
  const aktif = ss.getSheetByName(S.AKTIF_SAYFA);
  if (!basvuru || !aktif) { console.log('HATA: Sayfalar bulunamadı. Önce kurulumYap() çalıştır.'); return; }

  const ayirac = ayiracBelirle_(ss);
  const beklenen = aktifFormulleri_(ss, basvuru, ayirac);
  const mevcutFiltre = aktif.getRange(2, 1).getFormula();
  const mevcutDetay = aktif.getRange(2, beklenen.detaySutunu).getFormula();
  const satirlar = Math.max(aktif.getLastRow() - 1, 0);

  const hataliMi = function (v) {
    const t = String(v);
    return t.indexOf('#REF') === 0 || t.indexOf('#N/A') === 0 || t.indexOf('#NAME') === 0 ||
           t.indexOf('#ERROR') === 0 || t.indexOf('#VALUE') === 0;
  };
  const a2 = aktif.getRange(2, 1).getDisplayValue();
  const g2 = aktif.getRange(2, beklenen.detaySutunu).getDisplayValue();

  console.log([
    'Tablo bölgesi     : ' + ss.getSpreadsheetLocale() + '  →  argüman ayıracı: "' + ayirac + '"',
    'A2 filtre formülü : ' + (mevcutFiltre ? (mevcutFiltre === beklenen.filtre ? 'YERİNDE' :
      (mevcutFiltre === beklenen.filtreQuery ? 'YERİNDE (QUERY sürümü)' : 'FARKLI → ' + mevcutFiltre)) : 'YOK / SİLİNMİŞ'),
    'Detay formülü     : ' + (mevcutDetay ? 'YERİNDE' : 'YOK / SİLİNMİŞ'),
    'Listelenen satır  : ' + satirlar,
    'A2 görünen değer  : ' + (a2 === '' ? '(boş — eşleşen üye yok, normal)' : a2),
    'Detay görünen     : ' + (g2 === '' ? '(boş)' : g2),
    '',
    hataliMi(a2) ? '!! A2 HATA veriyor: ' + a2 : '   A2 hata vermiyor',
    hataliMi(g2) ? '!! Detay HATA veriyor: ' + g2 : '   Detay hata vermiyor',
    '',
    'Ne yapmalı:',
    '  #ERROR! → ayıraç yanlış (virgül/noktalı virgül). ayiracOnarimi() çalıştır.',
    '  #NAME?  → CHOOSECOLS desteklenmiyor. aktifFormuluQueryYap() çalıştır.',
    '  #REF!   → dizi genişleyemiyor. Sayfa 2\'de aşağıdaki hücreleri temizle, sonra formulleriOnar().',
    '  YOK     → formulleriOnar() çalıştır.',
    '  Detay tek satırda kalıyorsa → detayLinkleriSatirBazliYap() çalıştır.',
    '',
    'A2\'ye yazılması gereken formül:',
    '  ' + beklenen.filtre,
    'Detay hücresine yazılması gereken formül:',
    '  ' + beklenen.detay
  ].join('\n'));
}

/** TEK ADIMLIK ONARIM — ayıraç hatası (#ERROR!) için bunu çalıştır.
    kurulumYap() GEREKTİRMEZ. Başvuru tablosundaki hiçbir satıra, başlığa, açılır
    listeye veya sütun biçimine dokunmaz. Yalnızca:
      - doğru ayıracı tablodan ölçer
      - Aktif Üyeler'deki A2 filtre ve detay formüllerini yeniden yazar
      - özel formül içeren iki koşullu biçim kuralını yeniden kurar            */
function ayiracOnarimi() {
  const S = CONFIG.SHEETS;
  const id = PropertiesService.getScriptProperties().getProperty(S.ID_PROPERTY);
  if (!id) { console.log('HATA: ' + S.ID_PROPERTY + ' tanımlı değil.'); return; }

  const ss = SpreadsheetApp.openById(id);
  const basvuru = ss.getSheetByName(S.SAYFA);
  const aktif = ss.getSheetByName(S.AKTIF_SAYFA);
  if (!basvuru || !aktif) { console.log('HATA: Sayfalar bulunamadı.'); return; }

  const oncekiSatir = basvuru.getLastRow();          // veri kaybı olmadığını kanıtlamak için
  const ayirac = ayiracBelirle_(ss);
  const f = aktifFormulleri_(ss, basvuru, ayirac);

  yeterAlanAc_(aktif, S.HAZIRLIK_SATIR + 1, f.detaySutunu);
  aktif.getRange(2, 1, aktif.getMaxRows() - 1, f.detaySutunu).clearContent();
  aktif.getRange(2, 1).setFormula(f.filtre);
  aktif.getRange(2, f.detaySutunu).setFormula(f.detay);

  const kuralSayisi = bicimKurallariKur_(basvuru, ayirac);
  SpreadsheetApp.flush();

  const a2 = aktif.getRange(2, 1).getDisplayValue();
  const g2 = aktif.getRange(2, f.detaySutunu).getDisplayValue();
  const hatali = function (v) { return String(v).indexOf('#') === 0; };

  console.log([
    'ONARIM TAMAM',
    '  Tablo bölgesi    : ' + ss.getSpreadsheetLocale() + '  →  ayıraç: "' + ayirac + '"',
    '  Başvuru satırı   : ' + Math.max(oncekiSatir - 1, 0) + ' (değişmedi — tabloya dokunulmadı)',
    '  Koşullu biçim    : ' + kuralSayisi + ' kural yeniden kuruldu',
    '  A2 sonucu        : ' + (a2 === '' ? '(boş — eşleşen üye yok, normal)' : a2) + (hatali(a2) ? '   <-- HÂLÂ HATA' : '   OK'),
    '  Detay sonucu     : ' + (g2 === '' ? '(boş)' : g2) + (hatali(g2) ? '   <-- HÂLÂ HATA' : '   OK'),
    '',
    'A2 formülü:',
    '  ' + f.filtre,
    '',
    hatali(a2) ? 'Hâlâ hata varsa: #NAME? → aktifFormuluQueryYap() | #REF! → Sayfa 2\'yi temizleyip tekrar çalıştır'
               : 'Doğrulamak için formulDurumu() çalıştır.'
  ].join('\n'));
}

/** Aktif Üyeler formüllerini yeniden yazar. Sayfa 1 verisine DOKUNMAZ.
    Formül yanlışlıkla silinirse ya da bozulursa bunu çalıştırmak yeterlidir. */
function formulleriOnar() {
  const S = CONFIG.SHEETS;
  const ss = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty(S.ID_PROPERTY));
  const basvuru = ss.getSheetByName(S.SAYFA);
  const aktif = ss.getSheetByName(S.AKTIF_SAYFA);
  if (!basvuru || !aktif) { console.log('HATA: Sayfalar bulunamadı.'); return; }

  const f = aktifFormulleri_(ss, basvuru);
  yeterAlanAc_(aktif, S.HAZIRLIK_SATIR + 1, f.detaySutunu);
  // dizi formüllerinin genişlemesini engelleyen artıkları temizle
  aktif.getRange(2, 1, aktif.getMaxRows() - 1, f.detaySutunu).clearContent();
  aktif.getRange(2, 1).setFormula(f.filtre);
  aktif.getRange(2, f.detaySutunu).setFormula(f.detay);
  console.log('Formüller yeniden yazıldı. Kontrol için formulDurumu() çalıştır.');
}

/** CHOOSECOLS çalışmazsa (#NAME?) QUERY sürümüne geçer. Sütun sırası aynı kalır. */
function aktifFormuluQueryYap() {
  const S = CONFIG.SHEETS;
  const ss = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty(S.ID_PROPERTY));
  const basvuru = ss.getSheetByName(S.SAYFA);
  const aktif = ss.getSheetByName(S.AKTIF_SAYFA);
  const f = aktifFormulleri_(ss, basvuru);
  aktif.getRange(2, 1, aktif.getMaxRows() - 1, S.AKTIF_SUTUNLAR.length).clearContent();
  aktif.getRange(2, 1).setFormula(f.filtreQuery);
  console.log('QUERY sürümü yazıldı. Kontrol için formulDurumu() çalıştır.\n' +
              'Not: QUERY bir sütundaki karışık veri tiplerini tek tipe zorlar; ' +
              'Telefon ve Üyelik Tarihi sütunlarını gözle doğrula.');
}

/** İSTEĞE BAĞLI — Aktif Üyeler sayfasına katı kilit koyar: yalnızca bu scripti
    çalıştıran hesap düzenleyebilir. Dosya erişimini DEĞİŞTİRMEZ, herkes görmeye
    devam eder. Geri almak için aktifSayfaKorumasiniGevset() çalıştır. */
function aktifSayfayiKatiKoru() {
  const S = CONFIG.SHEETS;
  const ss = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty(S.ID_PROPERTY));
  const aktif = ss.getSheetByName(S.AKTIF_SAYFA);
  aktif.getProtections(SpreadsheetApp.ProtectionType.SHEET).forEach(function (k) { k.remove(); });
  try {
    const koruma = aktif.protect().setDescription('Aktif Üyeler — otomatik liste (katı kilit)');
    const digerleri = koruma.getEditors();          // scripti çalıştıran hesap listede kalır
    if (digerleri.length) koruma.removeEditors(digerleri);
    if (koruma.canDomainEdit()) koruma.setDomainEdit(false);
    console.log('Katı kilit kuruldu. Sayfa 2 artık yalnızca bu hesaptan düzenlenebilir; ' +
                'diğerleri görmeye devam eder. Geri almak: aktifSayfaKorumasiniGevset()');
  } catch (err) {
    console.log('Katı kilit kurulamadı (' + errText_(err) + '). Uyarı korumasına dönülüyor.');
    aktif.protect().setDescription('Aktif Üyeler — otomatik liste').setWarningOnly(true);
  }
}

/** Katı kilidi kaldırır, uyarı korumasına döner. */
function aktifSayfaKorumasiniGevset() {
  const S = CONFIG.SHEETS;
  const ss = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty(S.ID_PROPERTY));
  const aktif = ss.getSheetByName(S.AKTIF_SAYFA);
  aktif.getProtections(SpreadsheetApp.ProtectionType.SHEET).forEach(function (k) { k.remove(); });
  aktif.protect().setDescription('Aktif Üyeler — otomatik liste').setWarningOnly(true);
  console.log('Uyarı korumasına dönüldü.');
}

/** İSTEĞE BAĞLI — formülleri günde bir kez kendiliğinden onaran tetikleyici kurar. */
function onarimTetikleyicisiKur() {
  onarimTetikleyicisiKaldir();
  ScriptApp.newTrigger('formulleriOnarSessiz_').timeBased().everyDays(1).atHour(4).create();
  console.log('Günlük onarım tetikleyicisi kuruldu (her gün ~04:00).');
}

function onarimTetikleyicisiKaldir() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'formulleriOnarSessiz_') ScriptApp.deleteTrigger(t);
  });
}

/** Tetikleyici için: formül eksikse yeniden yazar, yerindeyse hiçbir şey yapmaz. */
function formulleriOnarSessiz_() {
  try {
    const S = CONFIG.SHEETS;
    const ss = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty(S.ID_PROPERTY));
    const basvuru = ss.getSheetByName(S.SAYFA);
    const aktif = ss.getSheetByName(S.AKTIF_SAYFA);
    if (!basvuru || !aktif) return;
    const f = aktifFormulleri_(ss, basvuru);
    if (!aktif.getRange(2, 1).getFormula()) {
      aktif.getRange(2, 1).setFormula(f.filtre);
      console.log(JSON.stringify({ event: 'sheet_formula_repaired', cell: 'A2' }));
    }
    if (!aktif.getRange(2, f.detaySutunu).getFormula()) {
      aktif.getRange(2, f.detaySutunu).setFormula(f.detay);
      console.log(JSON.stringify({ event: 'sheet_formula_repaired', cell: 'detay' }));
    }
  } catch (err) {
    console.error(JSON.stringify({ event: 'sheet_formula_repair_error', error: errText_(err) }));
  }
}

/** Kurulumu değiştirmeden mevcut durumu gösterir. */
function kurulumDurumu() {
  const S = CONFIG.SHEETS;
  const ozellikler = PropertiesService.getScriptProperties();
  const id = ozellikler.getProperty(S.ID_PROPERTY);
  console.log(S.ID_PROPERTY + ' : ' + (id ? 'tanımlı (' + id.length + ' karakter)' : 'TANIMSIZ'));
  console.log(S.ENABLED_PROPERTY + ' : ' + (ozellikler.getProperty(S.ENABLED_PROPERTY) || '(yok → açık)'));
  if (!id) return;
  try {
    const ss = SpreadsheetApp.openById(id);
    const b = ss.getSheetByName(S.SAYFA);
    const a = ss.getSheetByName(S.AKTIF_SAYFA);
    console.log('Tablo      : ' + ss.getName());
    console.log(S.SAYFA + ' : ' + (b ? (b.getLastRow() - 1) + ' kayıt' : 'YOK'));
    console.log(S.AKTIF_SAYFA + ' : ' + (a ? Math.max(a.getLastRow() - 1, 0) + ' aktif üye' : 'YOK'));
  } catch (err) {
    console.log('Tabloya erişilemedi: ' + errText_(err));
  }
}

/** ARRAYFORMULA + HYPERLINK beklendiği gibi çalışmazsa: her satıra ayrı bağlantı yazar. */
function detayLinkleriSatirBazliYap(satirSayisi) {
  const S = CONFIG.SHEETS;
  const n = satirSayisi || 1000;
  const ss = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty(S.ID_PROPERTY));
  const basvuru = ss.getSheetByName(S.SAYFA);
  const aktif = ss.getSheetByName(S.AKTIF_SAYFA);
  const A = ayiracBelirle_(ss);
  const sayfaAdi = "'" + S.SAYFA.replace(/'/g, "''") + "'";
  const kimlikHarf = sutunHarfi_(S.SIRA.indexOf('KIMLIK') + 1);
  const sutunNo = S.AKTIF_SUTUNLAR.length + 1;

  yeterAlanAc_(aktif, n + 1, sutunNo);
  aktif.getRange(2, sutunNo, aktif.getMaxRows() - 1, 1).clearContent();
  const formuller = [];
  for (let r = 2; r < 2 + n; r++) {
    formuller.push(['=IF($A' + r + '=""' + A + '""' + A + 'HYPERLINK("' + ss.getUrl() + '#gid=' + basvuru.getSheetId() +
      '&range=A"&MATCH($A' + r + A + sayfaAdi + '!' + kimlikHarf + ':' + kimlikHarf + A + '0)' + A + '"Detay ▸"))']);
  }
  aktif.getRange(2, sutunNo, n, 1).setFormulas(formuller);
  console.log(n + ' satıra ayrı detay bağlantısı yazıldı (ayıraç: "' + A + '").');
}


/* ==================== EDİTÖRDEN ÇALIŞTIRILACAK TESTLER ====================
   Apps Script editöründe üstteki fonksiyon listesinden seçip "Çalıştır" de.   */

/* testHariciTeyit için test adresi. YALNIZCA Apps Script editöründe doldur;
   kişisel bir adresi repoya yazma. */
const TEST_TEYIT_ADRESI = '';

/* Editör testleri tarayıcıdan geçmediği için Turnstile jetonu üretemez.
   Bu yüzden testlerde doğrulama bilerek atlanır; testi çalıştıran zaten hesabın sahibidir.
   Canlı akış (doPost) her zaman gerçek doğrulamayı kullanır. */
function testDeps_() {
  const deps = defaultDeps_();
  deps.scriptProperty = function () { return 'test'; };
  deps.fetchJson = function () { return { success: true }; };
  /* Editör testleri gerçek tabloya YAZMAZ; tabloyu sahte veriyle kirletmemek için.
     Gerçek yazmayı denemek için testSheetsGercekYazma() kullan. */
  deps.sheets = { etkin: function () { return false; }, sayfa: function () { return null; } };
  return deps;
}

/** Bellekte sahte bir Sheets sayfası — gerçek tabloya dokunmadan yazma mantığını sınar. */
function sahteSayfa_(basliklar, satirlar) {
  const veri = [basliklar.slice()].concat((satirlar || []).map(function (r) { return r.slice(); }));
  return {
    _veri: veri,
    getLastRow: function () { return veri.length; },
    getLastColumn: function () { return basliklar.length; },
    getRange: function (satir, sutun, satirSayisi, sutunSayisi) {
      return {
        getValues: function () {
          const c = [];
          for (let i = 0; i < satirSayisi; i++) {
            const kaynak = veri[satir - 1 + i] || [];
            const p = [];
            for (let j = 0; j < sutunSayisi; j++) p.push(kaynak[sutun - 1 + j] === undefined ? '' : kaynak[sutun - 1 + j]);
            c.push(p);
          }
          return c;
        },
        setValues: function (degerler) {
          for (let i = 0; i < degerler.length; i++) {
            while (veri.length < satir + i) veri.push([]);
            const hedef = veri[satir - 1 + i] || (veri[satir - 1 + i] = []);
            for (let j = 0; j < degerler[i].length; j++) hedef[sutun - 1 + j] = degerler[i][j];
          }
          return this;
        }
      };
    }
  };
}

/** Mail GÖNDERMEZ, gerçek tabloya YAZMAZ. Sahte sayfaya yazılan satırı günlüğe döker. */
function testSheetsSahte() {
  const S = CONFIG.SHEETS;
  const basliklar = S.SIRA.map(function (k) { return S.BASLIK[k]; });
  const sayfa = sahteSayfa_(basliklar, []);
  const deps = testDeps_();
  deps.sheets = { etkin: function () { return true; }, sayfa: function () { return sayfa; } };
  deps.mail = { send: function () {}, remaining: function () { return 100; } };

  const kimlik = 'sahte-' + Date.now();
  const r = handleSubmission_(ornekBasvuru_('tr', kimlik), deps);
  console.log('Yanıt: ' + JSON.stringify({ ok: r.ok, sheetSaved: r.sheetSaved, error: r.error }));
  const satir = sayfa._veri[1] || [];
  basliklar.forEach(function (b, i) { console.log('  ' + b + ': ' + satir[i]); });

  const tekrar = handleSubmission_(ornekBasvuru_('tr', kimlik), deps);
  console.log('Aynı kimlik ikinci kez → toplam satır: ' + (sayfa._veri.length - 1) +
              ' (1 olmalı), sheetSaved: ' + tekrar.sheetSaved);
}

/** GERÇEK TABLOYA YAZAR — tek sahte satır ekler. Gördükten sonra o satırı SİL.
    Mail göndermez. */
function testSheetsGercekYazma() {
  const deps = defaultDeps_();
  deps.now = new Date();
  const kimlik = 'TEST-' + Utilities.formatDate(deps.now, CONFIG.TIMEZONE, 'yyyyMMdd-HHmmss');
  const ornek = normalize_(ornekBasvuru_('tr', kimlik));
  const meta = { submissionId: kimlik, receivedAt: '', age: ageOf_(ornek.birthDate, deps) };
  console.log('Sonuç: ' + kaydetSheets_(ornek, meta, deps));
  console.log('Kimlik: ' + kimlik + '  → tabloda gördükten sonra bu satırı SİL.');
}

/** Formül enjeksiyonu korumasını gösterir. Hiçbir şey yazmaz. */
function testFormulGuvenligi() {
  ['=IMPORTXML("http://x","//a")', '+1+1', '-5', '@foo', 'Ayşe Yılmaz', '+90 555 111 22 33', ''].forEach(function (v) {
    console.log(JSON.stringify(v) + '  →  ' + JSON.stringify(formulGuvenli_(v)));
  });
}

/* Gizli anahtarın tanımlı olup olmadığını gösterir. Anahtarın DEĞERİNİ yazmaz. */
function testTurnstileAyari() {
  const v = PropertiesService.getScriptProperties().getProperty(CONFIG.TURNSTILE.SECRET_PROPERTY);
  console.log(CONFIG.TURNSTILE.SECRET_PROPERTY + ' tanımlı mı: ' + (v ? 'EVET (' + v.length + ' karakter)' : 'HAYIR'));
  console.log('Doğrulama zorunlu (REQUIRED): ' + CONFIG.TURNSTILE.REQUIRED);
}

/** Mail GÖNDERMEZ. Örnek başvuruyu doğrular, iki maili oluşturup Yürütme günlüğüne yazar. */
function testKuruCalisma() {
  const deps = testDeps_();
  deps.dryRun = true;
  const r = handleSubmission_(ornekBasvuru_('tr', 'kuru-' + Date.now()), deps);
  console.log('Sonuç: ' + JSON.stringify({ ok: r.ok, dryRun: r.dryRun, error: r.error, fields: r.fields }));
}

/** Mail GÖNDERMEZ. Hatalı bir başvurunun reddedildiğini gösterir. */
function testHataliBasvuru() {
  const deps = testDeps_();
  deps.dryRun = true;
  const kotu = ornekBasvuru_('tr', 'hatali-' + Date.now());
  kotu.email = 'gecersiz-adres';
  kotu.birthDate = '2015-01-01';
  kotu.consentKvkk = false;
  console.log('Beklenen: VALIDATION → ' + JSON.stringify(handleSubmission_(kotu, deps)));
}

/** GERÇEK MAİL GÖNDERİR — iki mail de CONFIG.NOTIFY_TO adresine düşer. */
function testGercekGonderim() {
  const ornek = ornekBasvuru_('tr', 'test-' + Date.now());
  ornek.email = CONFIG.NOTIFY_TO;
  ornek.motivation = 'Test gönderimi ' + new Date().toISOString();
  console.log('Sonuç: ' + JSON.stringify(handleSubmission_(ornek, testDeps_())));
}

/** GERÇEK MAİL GÖNDERİR — Türkçe teyit maili TEST_TEYIT_ADRESI'ne gider (canlıdaki gerçek yol). */
function testHariciTeyit() {
  hariciTeyitGonder_('tr');
}

/** GERÇEK MAİL GÖNDERİR — İngilizce teyit maili TEST_TEYIT_ADRESI'ne gider. */
function testHariciTeyitEN() {
  hariciTeyitGonder_('en');
}

function hariciTeyitGonder_(lang) {
  if (!TEST_TEYIT_ADRESI) {
    console.log('Önce dosyadaki TEST_TEYIT_ADRESI sabitine bir test adresi yaz (yalnızca editörde).');
    return;
  }
  const ornek = ornekBasvuru_(lang, 'harici-' + lang + '-' + Date.now());
  ornek.email = TEST_TEYIT_ADRESI;
  ornek.motivation = 'Harici teyit testi (' + lang + ') ' + new Date().toISOString();
  console.log('Sonuç (' + lang + '): ' + JSON.stringify(handleSubmission_(ornek, testDeps_())));
}

/** Mail GÖNDERMEZ. Kalan günlük mail kotasını yazar. */
function testMailKotasi() {
  console.log('Kalan günlük mail kotası: ' + MailApp.getRemainingDailyQuota());
}

function ornekBasvuru_(lang, submissionId) {
  return {
    v: 1,
    submissionId: submissionId,
    lang: lang,
    fullName: 'Ayşe Yılmaz',
    email: 'ayse.yilmaz@example.com',
    phone: '+90 555 111 22 33',
    birthDate: '2001-04-12',
    city: 'Antalya',
    occupation: 'Hukuk Fakültesi',
    languages: 'İngilizce (C1)',
    experience: lang === 'en' ? 'Yes, I have' : 'Evet, katıldım',
    interests: ['Uluslararası projeler ve hareketlilik', 'Gönüllülük ve dayanışma'],
    motivation: 'Erasmus+ projelerinde yer almak istiyorum.',
    consentPrinciples: true,
    consentKvkk: true,
    honey: ''
  };
}
