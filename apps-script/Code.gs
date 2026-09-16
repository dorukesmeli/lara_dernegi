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
 *  - Web App "Execute as: Me" ile yayınlanır; mailler script sahibinin hesabından gider.
 *  - Alıcı adres ASLA tarayıcıdan alınmaz. İç bildirim yalnızca CONFIG.NOTIFY_TO'ya,
 *    teyit maili yalnızca doğrulanmış başvuru sahibine gider; içerikler sabit şablondur.
 *  - Kullanıcı verisi temizlenir ve HTML-escape edilir; HTML/JS enjekte edilemez.
 *  - Günlüklere telefon, doğum tarihi veya motivasyon metni yazılmaz.
 * ============================================================================
 */


/* ============================== AYARLAR ============================== */

const CONFIG = {
  /* İç bildirimin gideceği adres. Kurumsal adrese geçildiğinde yalnızca bunu değiştir. */
  NOTIFY_TO: 'laradernegi@gmail.com',

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

    if (state.internal && state.confirmation) {
      log('duplicate_submission', { submission_id: sid });
      const dup = result_(true, true, true);
      dup.duplicate = true;
      return dup;
    }

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
    const notice = buildNotification_(d, meta);
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
      return result_(false, state.internal, state.confirmation, 'QUOTA');
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
        return result_(false, false, false, 'INTERNAL_NOTIFICATION_FAILED');
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
      return result_(false, true, false, 'CONFIRMATION_FAILED');
    }
    state.confirmation = true;
    writeState_(cache, sid, state, log);
    log('confirmation_sent', { submission_id: sid, confirmation_recipient: d.email });

    return result_(true, true, true);
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
    consentKvkk: raw.consentKvkk === true
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

function buildNotification_(d, meta) {
  const intro = 'Yeni bir LARA Derneği üyelik başvurusu alınmıştır.';
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

  const text = intro + '\n\n' +
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
        '<p style="margin:0 0 18px;font-size:14px;color:#44546A;">' + escapeHtml_(intro) + '</p>' +
        '<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;font-size:14px;line-height:1.5;">' +
          htmlRows +
        '</table>' +
        '<p style="margin:20px 0 0;font-size:12px;color:#7A8898;">' + escapeHtml_(source) + '</p>' +
      '</div>' +
    '</div>';

  return {
    subject: headerSafe_('Yeni Üyelik Başvurusu – ' + d.fullName),
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
    mail: {
      send: function (message) { MailApp.sendEmail(message); },
      remaining: function () { return MailApp.getRemainingDailyQuota(); }
    }
  };
}


/* ==================== EDİTÖRDEN ÇALIŞTIRILACAK TESTLER ====================
   Apps Script editöründe üstteki fonksiyon listesinden seçip "Çalıştır" de.   */

/* testHariciTeyit için test adresi. YALNIZCA Apps Script editöründe doldur;
   kişisel bir adresi repoya yazma. */
const TEST_TEYIT_ADRESI = '';

/** Mail GÖNDERMEZ. Örnek başvuruyu doğrular, iki maili oluşturup Yürütme günlüğüne yazar. */
function testKuruCalisma() {
  const deps = defaultDeps_();
  deps.dryRun = true;
  const r = handleSubmission_(ornekBasvuru_('tr', 'kuru-' + Date.now()), deps);
  console.log('Sonuç: ' + JSON.stringify({ ok: r.ok, dryRun: r.dryRun, error: r.error, fields: r.fields }));
}

/** Mail GÖNDERMEZ. Hatalı bir başvurunun reddedildiğini gösterir. */
function testHataliBasvuru() {
  const deps = defaultDeps_();
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
  console.log('Sonuç: ' + JSON.stringify(handleSubmission_(ornek)));
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
  console.log('Sonuç (' + lang + '): ' + JSON.stringify(handleSubmission_(ornek)));
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
