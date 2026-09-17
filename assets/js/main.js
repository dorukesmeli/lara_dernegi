/* LARA Derneği — arayüz etkileşimleri */
(function () {
  'use strict';

  var header  = document.getElementById('siteHeader');
  var toggle  = document.getElementById('navToggle');
  var nav     = document.getElementById('primaryNav');
  var toTop   = document.getElementById('toTop');
  var links   = Array.prototype.slice.call(nav.querySelectorAll('a[href^="#"]'));
  var year    = document.getElementById('year');

  if (year) year.textContent = new Date().getFullYear();

  /* ================= ANALİTİK ================= */
  /* Gönderim ve kişisel veri filtresi analytics.js'de; burada yalnızca olay adı ve sabit değerler verilir.
     analytics.js yüklenmemişse hiçbir şey yapmaz. */
  function izle(name, params) {
    try { if (window.LaraAnalytics) window.LaraAnalytics.track(name, params); } catch (e) {}
  }
  function izlemeKonumu(el) {
    try { return window.LaraAnalytics ? window.LaraAnalytics.locationOf(el) : undefined; } catch (e) { return undefined; }
  }

  /* ================= DİL (TR / EN) ================= */
  var DICT = window.I18N || { tr: {}, en: {} };
  var STORE_KEY = 'lara-lang';
  var lang = 'tr';

  function t(key) {
    var pack = DICT[lang] || DICT.tr;
    return (pack && pack[key] !== undefined) ? pack[key] : null;
  }

  function applyLang(next) {
    lang = (next === 'en') ? 'en' : 'tr';
    var root = document.documentElement;
    root.setAttribute('lang', lang);
    root.setAttribute('data-lang', lang);

    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      var v = t(el.getAttribute('data-i18n'));
      if (v !== null) el.innerHTML = v;
    });
    document.querySelectorAll('[data-i18n-aria]').forEach(function (el) {
      var v = t(el.getAttribute('data-i18n-aria'));
      if (v !== null) el.setAttribute('aria-label', v);
    });
    document.querySelectorAll('[data-i18n-ph]').forEach(function (el) {
      var v = t(el.getAttribute('data-i18n-ph'));
      if (v !== null) el.setAttribute('placeholder', v);
    });
    document.querySelectorAll('[data-i18n-meta]').forEach(function (el) {
      var v = t(el.getAttribute('data-i18n-meta'));
      if (v !== null) el.setAttribute('content', v);
    });

    var title = t('meta.title');
    if (title) document.title = title;

    // menü açıkken etiket doğru kalsın
    var open = nav.classList.contains('open');
    toggle.setAttribute('aria-label', t(open ? 'a11y.menuClose' : 'a11y.menu') || '');

    document.querySelectorAll('[data-set-lang]').forEach(function (b) {
      b.classList.toggle('is-active', b.getAttribute('data-set-lang') === lang);
      b.setAttribute('aria-pressed', String(b.getAttribute('data-set-lang') === lang));
    });

    // açık bir biyografi varsa onu da çevir
    if (modal && !modal.hidden && modal.dataset.person) fillBio(modal.dataset.person);

    try { localStorage.setItem(STORE_KEY, lang); } catch (e) {}
  }

  var startLang = 'tr';
  try {
    var saved = localStorage.getItem(STORE_KEY);
    if (saved === 'tr' || saved === 'en') startLang = saved;
    else if ((navigator.language || '').slice(0, 2).toLowerCase() !== 'tr') startLang = 'en';
  } catch (e) {}

  /* Menü etiketleri dil değişince genişlik değiştirmesin (header kaymasın): her bağlantı iki dildeki
     etiketi görünmez bir CSS katmanında taşır ve en uzun etiket kadar yer ayırır. Sayfa metnine eklenmez. */
  function sadeMetin(html) {
    var d = document.createElement('div');
    d.innerHTML = html || '';
    return d.textContent || '';
  }
  nav.querySelectorAll('a[data-i18n]').forEach(function (el) {
    var key = el.getAttribute('data-i18n');
    if (!DICT.tr || !DICT.en || DICT.tr[key] === undefined || DICT.en[key] === undefined) return;
    el.setAttribute('data-w-tr', sadeMetin(DICT.tr[key]));
    el.setAttribute('data-w-en', sadeMetin(DICT.en[key]));
    el.classList.add('i18n-stable');
  });

  document.querySelectorAll('[data-set-lang]').forEach(function (b) {
    b.addEventListener('click', function () {
      var onceki = lang;
      applyLang(b.getAttribute('data-set-lang'));
      if (onceki !== lang) izle('language_change', { from_language: onceki, to_language: lang });
    });
  });

  /* ================= BİYOGRAFİ PENCERESİ ================= */
  var modal     = document.getElementById('bioModal');
  var bioName   = document.getElementById('bioName');
  var bioRole   = document.getElementById('bioRole');
  var bioBody   = document.getElementById('bioBody');
  var bioAvatar = document.getElementById('bioAvatar');
  var lastFocus = null;

  function fillBio(id) {
    var card = document.querySelector('.person[data-bio="' + id + '"]');
    if (!card) return;
    modal.dataset.person = id;
    bioName.textContent   = card.dataset.name || '';
    bioRole.innerHTML     = t('bio.' + id + '.role') || '';
    bioBody.innerHTML     = t('bio.' + id + '.body') || '';
    var big = card.dataset.photoLg || card.dataset.photo;
    if (big) {
      bioAvatar.outerHTML = '<img class="modal-photo" id="bioAvatar" src="' + big + '" alt="">';
      bioAvatar = document.getElementById('bioAvatar');
    } else {
      if (bioAvatar.tagName === 'IMG') {
        bioAvatar.outerHTML = '<div class="avatar" id="bioAvatar" aria-hidden="true"></div>';
        bioAvatar = document.getElementById('bioAvatar');
      }
      bioAvatar.textContent = card.dataset.initials || '';
      bioAvatar.className   = 'avatar ' + (card.dataset.avatar || 'av-navy');
    }
  }

  function openBio(id) {
    lastFocus = document.activeElement;
    fillBio(id);
    modal.hidden = false;
    document.body.classList.add('modal-open');
    var closeBtn = modal.querySelector('.modal-close');
    if (closeBtn) closeBtn.focus();
    var kart = document.querySelector('.person[data-bio="' + id + '"]');
    if (kart) izle('team_profile_open', { role: kart.getAttribute('data-track-role') });
  }

  function closeBio() {
    modal.hidden = true;
    delete modal.dataset.person;
    document.body.classList.remove('modal-open');
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  // kartta fotoğraf varsa baş harflerin yerine onu göster (AVIF/WebP destekleyen tarayıcıya küçük sürüm gider)
  document.querySelectorAll('.person[data-photo]').forEach(function (card) {
    var av = card.querySelector('.avatar');
    if (!av) return;
    var img = '<img class="person-photo" src="' + card.dataset.photo + '" alt="" loading="lazy" decoding="async" width="400" height="400">';
    var set = card.dataset.photoSet;
    if (set) {
      var sizes = '(max-width: 640px) 92px, 116px';
      img = '<picture>' +
        '<source type="image/avif" srcset="' + set + '-256.avif 256w, ' + set + '-400.avif 400w" sizes="' + sizes + '">' +
        '<source type="image/webp" srcset="' + set + '-256.webp 256w, ' + set + '-400.webp 400w" sizes="' + sizes + '">' +
        img + '</picture>';
    }
    av.outerHTML = img;
  });

  document.querySelectorAll('.person.has-bio').forEach(function (card) {
    card.addEventListener('click', function () { openBio(card.dataset.bio); });
    var btn = card.querySelector('.person-more');
    if (btn) btn.addEventListener('click', function (e) { e.stopPropagation(); openBio(card.dataset.bio); });
  });

  modal.addEventListener('click', function (e) {
    if (e.target.hasAttribute('data-close')) closeBio();
  });


  /* ================= ÜYELİK BAŞVURU FORMU ================= */
  /* Başvurular Google Apps Script Web App'e gönderilir (form-config.js → appsScriptUrl).
     Kullanıcı yalnızca sunucu hem iç bildirimi hem teyit mailini gönderdiğini
     bildirirse başarı mesajı görür. */
  var joinModal   = document.getElementById('joinModal');
  var joinForm    = document.getElementById('joinForm');
  var joinWrap    = document.getElementById('joinFormWrap');
  var joinOk      = document.getElementById('joinSuccess');
  var joinBtn     = document.getElementById('joinSubmit');
  var joinStatus  = document.getElementById('formStatus');
  var openJoinBtn = document.getElementById('openJoinForm');
  var CFG = window.LARA_FORM || {};
  var sending = false;        // çift gönderimi engeller
  var formOpenedAt = 0;       // form açılır açılmaz gelen gönderimler kısa süre bekletilir
  var turnstileReady = false;
  var submissionId = null;    // aynı başvurunun yeniden denemelerinde aynı kalır (sunucuda tekrar koruması)
  var basariIzlendi = {};     // başarı olayı her başvuru kimliği için yalnızca bir kez gönderilir

  function yeniBasvuruKimligi() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
    var h = '';
    for (var i = 0; i < 32; i++) h += Math.floor(Math.random() * 16).toString(16);
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
  }

  /* Cloudflare Turnstile — sadece form-config.js'de site anahtarı varsa yüklenir. */
  function initTurnstile() {
    var box = document.getElementById('turnstileBox');
    if (!box || !CFG.turnstileSiteKey || turnstileReady) return;
    turnstileReady = true;
    box.hidden = false;
    box.setAttribute('data-sitekey', CFG.turnstileSiteKey);
    var sc = document.createElement('script');
    sc.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
    sc.async = true; sc.defer = true;
    document.head.appendChild(sc);
  }

  /* Aynı tarayıcıdan kısa sürede çok sayıda gönderimi sınırlar */
  function rateLimited() {
    var max = CFG.maxSubmitsPerHour || 3, now = Date.now(), list = [];
    try { list = JSON.parse(localStorage.getItem('lara_form_sent') || '[]'); } catch (e) { list = []; }
    list = list.filter(function (ts) { return now - ts < 3600000; });
    return list.length >= max;
  }
  function markSubmitted() {
    var now = Date.now(), list = [];
    try { list = JSON.parse(localStorage.getItem('lara_form_sent') || '[]'); } catch (e) { list = []; }
    list = list.filter(function (ts) { return now - ts < 3600000; });
    list.push(now);
    try { localStorage.setItem('lara_form_sent', JSON.stringify(list)); } catch (e) {}
  }

  function setStatus(msg, kind) {
    joinStatus.textContent = msg || '';
    joinStatus.className = 'form-status' + (msg ? ' is-' + (kind || 'info') : '');
  }

  function clearErrors() {
    joinForm.querySelectorAll('.field-error').forEach(function (e) { e.textContent = ''; });
    joinForm.querySelectorAll('.has-error').forEach(function (e) { e.classList.remove('has-error'); });
  }

  function fieldError(input, msg) {
    var field = input.closest('.field');
    if (field) {
      field.classList.add('has-error');
      var slot = field.querySelector('.field-error');
      if (slot) slot.textContent = msg;
    }
    return input;
  }

  function openJoin(e) {
    formOpenedAt = Date.now();
    initTurnstile();
    lastFocus = document.activeElement;
    joinModal.hidden = false;
    document.body.classList.add('modal-open');
    var c = joinModal.querySelector('.modal-close');
    if (c) c.focus();
    izle('membership_form_open', { language: lang, trigger_location: izlemeKonumu(e && e.currentTarget) });
  }

  function closeJoin() {
    joinModal.hidden = true;
    document.body.classList.remove('modal-open');
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  if (openJoinBtn) openJoinBtn.addEventListener('click', openJoin);
  joinModal.addEventListener('click', function (e) {
    if (e.target.hasAttribute('data-close')) closeJoin();
  });

  /* Alan kuralları — tüm formda (gönderim) ve tek adımda (Devam Et) aynı kurallar kullanılır.
     Hatalı alanları sırayla döner; hata mesajı yazmaz. */
  function alanHatalari(kapsam) {
    var hatalar = [];

    kapsam.querySelectorAll('input[required], textarea[required]').forEach(function (input) {
      if (input.type === 'checkbox') return;
      if (!input.value.trim()) hatalar.push([input, t('form.required')]);
    });

    var email = kapsam.querySelector('input[type="email"]');
    if (email && email.value.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.value.trim())) {
      hatalar.push([email, t('form.emailInvalid')]);
    }

    var phone = kapsam.querySelector('input[type="tel"]');
    if (phone && phone.value.trim() && phone.value.replace(/\D/g, '').length < 10) {
      hatalar.push([phone, t('form.phoneInvalid')]);
    }

    var birth = kapsam.querySelector('input[type="date"]');
    if (birth && birth.value) {
      var b = new Date(birth.value), now = new Date();
      var age = now.getFullYear() - b.getFullYear();
      var m = now.getMonth() - b.getMonth();
      if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--;
      if (age < 18) hatalar.push([birth, t('form.age18')]);
    }
    return hatalar;
  }

  function validate() {
    clearErrors();
    var first = null;

    alanHatalari(joinForm).forEach(function (h) { first = fieldError(h[0], h[1]) || first; });

    var consentErr = document.getElementById('consentError');
    var p = document.getElementById('chkPrinciples'), k = document.getElementById('chkKvkk');
    if (!p.checked || !k.checked) {
      consentErr.textContent = t('form.checkRequired') || t('form.required');
      if (!first) first = p.checked ? k : p;
    } else {
      consentErr.textContent = '';
    }

    if (first) {
      adimaGit(adimNumarasi(first), false);   // hatalı alan başka bir adımdaysa o adımı göster
      var f = first.closest('.field') || first;
      f.scrollIntoView({ block: 'center', behavior: 'smooth' });
      if (first.focus) first.focus({ preventScroll: true });
    }
    return !first;
  }

  /* ---------- ADIMLAR (yalnızca görünüm) ----------
     Form üç görsel adıma bölünür. Alanlar, adlar, doğrulama kuralları ve gönderim aynıdır;
     son adımdaki "Gönder" mevcut submit akışını çalıştırır. */
  var formAdimlari = Array.prototype.slice.call(joinForm.querySelectorAll('[data-form-step]'));
  var adimGostergesi = Array.prototype.slice.call(document.querySelectorAll('.form-progress li'));
  var adimDuyuru  = document.getElementById('formStepLive');
  var geriBtn     = joinForm.querySelector('[data-form-back]');
  var ileriBtn    = joinForm.querySelector('[data-form-next]');
  var formAdimi   = 1;
  var ADIM_SAYISI = formAdimlari.length || 1;

  function adimNumarasi(el) {
    var kap = el && el.closest ? el.closest('[data-form-step]') : null;
    return kap ? parseInt(kap.getAttribute('data-form-step'), 10) : formAdimi;
  }

  function adimaGit(n, odaklan) {
    if (!formAdimlari.length) return;
    n = Math.max(1, Math.min(ADIM_SAYISI, n));
    var yon = n >= formAdimi ? 'ileri' : 'geri';
    var degisti = n !== formAdimi;
    formAdimi = n;
    formAdimlari.forEach(function (adim, i) {
      var aktif = i + 1 === n;
      adim.hidden = !aktif;
      if (aktif && degisti) {
        adim.classList.remove('adim-ileri', 'adim-geri');
        void adim.offsetWidth;                   // giriş animasyonunu yeniden başlat
        adim.classList.add('adim-' + yon);
      }
    });
    adimGostergesi.forEach(function (li, i) {
      li.classList.toggle('is-current', i + 1 === n);
      li.classList.toggle('is-done', i + 1 < n);
      if (i + 1 === n) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current');
    });
    if (geriBtn) geriBtn.hidden = n === 1;
    if (ileriBtn) ileriBtn.hidden = n === ADIM_SAYISI;
    joinBtn.hidden = n !== ADIM_SAYISI;
    if (!degisti) return;
    if (adimDuyuru) {
      var etiket = adimGostergesi[n - 1] ? adimGostergesi[n - 1].querySelector('.fp-label').textContent : '';
      adimDuyuru.textContent = (t('form.stepLive') || '').replace('{n}', n).replace('{label}', etiket);
    }
    var kart = joinModal.querySelector('.modal-card');
    if (kart) kart.scrollTop = 0;
    if (odaklan) formAdimlari[n - 1].focus({ preventScroll: true });
  }

  /* "Devam Et": yalnızca bulunduğun adımdaki alanlar mevcut kurallarla kontrol edilir */
  function ileriGit() {
    var adim = formAdimlari[formAdimi - 1];
    if (!adim) return;
    adim.querySelectorAll('.field-error').forEach(function (e) { e.textContent = ''; });
    adim.querySelectorAll('.has-error').forEach(function (e) { e.classList.remove('has-error'); });
    var hatalar = alanHatalari(adim);
    if (hatalar.length) {
      hatalar.forEach(function (h) { fieldError(h[0], h[1]); });
      var ilk = hatalar[0][0];
      (ilk.closest('.field') || ilk).scrollIntoView({ block: 'center', behavior: 'smooth' });
      ilk.focus({ preventScroll: true });
      return;
    }
    adimaGit(formAdimi + 1, true);
  }

  if (ileriBtn) ileriBtn.addEventListener('click', ileriGit);

  /* İki onay da işaretlenince önceki "zorunlu" uyarısı hemen kalksın (kural aynı; yalnızca mesaj) */
  ['chkPrinciples', 'chkKvkk'].forEach(function (id) {
    var kutu = document.getElementById(id);
    if (!kutu) return;
    kutu.addEventListener('change', function () {
      var p = document.getElementById('chkPrinciples'), k = document.getElementById('chkKvkk');
      var hata = document.getElementById('consentError');
      if (hata && p.checked && k.checked) hata.textContent = '';
    });
  });
  if (geriBtn) geriBtn.addEventListener('click', function () { adimaGit(formAdimi - 1, true); });

  /* Son adıma gelmeden Enter formu göndermesin; bir sonraki adıma geçsin */
  joinForm.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' || formAdimi >= ADIM_SAYISI) return;
    var el = e.target;
    if (!el || el.tagName === 'TEXTAREA' || el.tagName === 'BUTTON' || el.type === 'checkbox') return;
    e.preventDefault();
    ileriGit();
  });

  /* Sunucuya giden sade veri. Etiketler ve e-posta biçimi sunucuda oluşturulur;
     alıcı adres tarayıcıdan gönderilmez. */
  function basvuruVerisi() {
    function ham(name) {
      var el = joinForm.querySelector('[name="' + name + '"]');
      return el ? el.value.trim() : '';
    }
    var ilgiler = [];
    joinForm.querySelectorAll('input[name="ilgi"]:checked').forEach(function (c) { ilgiler.push(c.value); });
    var p = document.getElementById('chkPrinciples'), k = document.getElementById('chkKvkk');
    if (!submissionId) submissionId = yeniBasvuruKimligi();
    return {
      v: 1,
      submissionId: submissionId,
      lang: (lang === 'en') ? 'en' : 'tr',
      fullName: ham('Ad Soyad'),
      email: ham('E-posta'),
      phone: ham('Telefon'),
      birthDate: ham('Doğum Tarihi'),
      city: ham('Şehir'),
      occupation: ham('Meslek / Bölüm'),
      languages: ham('Yabancı Diller'),
      experience: ham('Proje Deneyimi'),
      interests: ilgiler,
      motivation: ham('Motivasyon'),
      consentPrinciples: !!(p && p.checked),
      consentKvkk: !!(k && k.checked),
      honey: ham('website')
    };
  }

  function showSuccess() {
    joinWrap.hidden = true;
    joinOk.hidden = false;
    joinModal.querySelector('.modal-card').scrollTop = 0;
  }

  /* Başarı yalnızca sunucu iki maili de gönderdiğini açıkça bildirirse */
  function sunucuBasarili(res) {
    return !!res && res.ok === true && res.internalNotificationSent === true && res.confirmationSent === true;
  }

  function gonderimBasarisiz() {
    setStatus(t('form.errBody'), 'err');
    sending = false;
    joinBtn.disabled = false;
    joinBtn.textContent = t('form.submit');
    if (window.turnstile && CFG.turnstileSiteKey) { try { window.turnstile.reset(); } catch (e) {} }
  }

  /* Analitik: sunucunun hata kodu → izin verilen hata türü */
  function hataTuru(res) {
    var map = { VALIDATION: 'validation', CONFIRMATION_FAILED: 'confirmation_failed', INTERNAL_NOTIFICATION_FAILED: 'internal_notification_failed' };
    return (res && map[res.error]) || 'unknown';
  }
  function basvuruHatasi(tur) {
    izle('membership_application_error', { language: lang, error_type: tur });
  }

  joinForm.addEventListener('submit', function (e) {
    e.preventDefault();
    if (formAdimi < ADIM_SAYISI) { ileriGit(); return; }   // son adım değilse gönderme, ilerle
    if (sending) return;                       // çift tıklama koruması
    setStatus('');

    // bot tuzağı: insanların göremediği alan doldurulmuşsa gönderme
    var honey = joinForm.querySelector('input[name="website"]');
    if (honey && honey.value) { showSuccess(); return; }

    if (!validate()) { basvuruHatasi('validation'); return; }

    if (CFG.turnstileSiteKey) {
      var tok = joinForm.querySelector('[name="cf-turnstile-response"]');
      if (!tok || !tok.value) { setStatus(t('form.captchaNeeded'), 'err'); basvuruHatasi('unknown'); return; }
    }

    if (rateLimited()) { setStatus(t('form.tooMany'), 'err'); basvuruHatasi('unknown'); return; }
    if (!CFG.appsScriptUrl) { setStatus(t('form.notConfigured'), 'err'); basvuruHatasi('unknown'); return; }

    var payload = basvuruVerisi();

    sending = true;
    joinBtn.disabled = true;
    joinBtn.textContent = t('form.sending');

    /* Form açılır açılmaz gönderilmişse (tipik bot davranışı) isteği biraz geciktiririz.
       Engellemek yerine geciktirmek, otomatik doldurma kullanan gerçek kişilerin
       başvurusunun kaybolmasını önler. */
    var bekle = Math.max(0, 2500 - (Date.now() - formOpenedAt));
    setTimeout(function () { gonder(payload); }, bekle);
  });

  /* Google Apps Script Web App'e gönderim.
     Gövde JSON'dur ama "text/plain" olarak gönderilir: Apps Script CORS ön kontrolünü (OPTIONS)
     desteklemez, düz metin isteği ise ön kontrol gerektirmez. */
  function gonder(payload) {
    var bitti = false;
    var controller = (typeof AbortController === 'function') ? new AbortController() : null;
    var zamanAsimi = setTimeout(function () {
      if (controller) controller.abort();
      sonuc(false, 'timeout');
    }, CFG.timeoutMs || 45000);

    function sonuc(basarili, hata) {
      if (bitti) return;                       // zaman aşımından sonra gelen geç yanıtı yok say
      bitti = true;
      clearTimeout(zamanAsimi);
      if (basarili) {
        markSubmitted();
        showSuccess();
        if (!basariIzlendi[payload.submissionId]) {
          basariIzlendi[payload.submissionId] = true;
          izle('membership_application_success', { language: payload.lang, submission_id: payload.submissionId });
        }
      } else {
        gonderimBasarisiz();
        izle('membership_application_error', { language: payload.lang, error_type: hata || 'unknown' });
      }
    }

    fetch(CFG.appsScriptUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
      redirect: 'follow',
      cache: 'no-store',
      signal: controller ? controller.signal : undefined
    })
      .then(function (r) {
        if (!r.ok) { sonuc(false, 'network'); return; }
        return r.json().then(
          function (res) { var basarili = sunucuBasarili(res); sonuc(basarili, basarili ? null : hataTuru(res)); },
          function () { sonuc(false, 'unknown'); }
        );
      })
      .catch(function () { sonuc(false, 'network'); });
  }

  /* ================= MOBİL MENÜ ================= */
  function closeNav() {
    nav.classList.remove('open');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', t('a11y.menu') || 'Menüyü aç');
  }

  toggle.addEventListener('click', function () {
    var open = nav.classList.toggle('open');
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', t(open ? 'a11y.menuClose' : 'a11y.menu') || '');
  });

  links.forEach(function (a) { a.addEventListener('click', closeNav); });

  /* Açık pencerede klavye odağı pencerenin içinde döner */
  function odakTuzagi(e) {
    var acik = !joinModal.hidden ? joinModal : (!modal.hidden ? modal : null);
    if (!acik || e.key !== 'Tab') return;
    var odaklanabilir = Array.prototype.filter.call(
      acik.querySelectorAll('a[href], button:not([disabled]), input:not([tabindex="-1"]):not([type="hidden"]), select, textarea, [tabindex]:not([tabindex="-1"])'),
      function (el) { return el.offsetParent !== null || el === document.activeElement; }
    );
    if (!odaklanabilir.length) return;
    var ilk = odaklanabilir[0], son = odaklanabilir[odaklanabilir.length - 1];
    if (!acik.contains(document.activeElement)) { e.preventDefault(); ilk.focus(); return; }
    if (e.shiftKey && (document.activeElement === ilk || !odaklanabilir.includes(document.activeElement))) { e.preventDefault(); son.focus(); }
    else if (!e.shiftKey && document.activeElement === son) { e.preventDefault(); ilk.focus(); }
  }
  document.addEventListener('keydown', odakTuzagi);

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (!joinModal.hidden) { closeJoin(); return; }
    if (!modal.hidden) { closeBio(); return; }
    if (nav.classList.contains('open')) { closeNav(); toggle.focus(); }
  });

  document.addEventListener('click', function (e) {
    if (nav.classList.contains('open') && !nav.contains(e.target) && !toggle.contains(e.target)) closeNav();
  });

  /* ================= SCROLL DAVRANIŞLARI ================= */
  function onScroll() {
    var y = window.scrollY || window.pageYOffset;
    header.classList.toggle('scrolled', y > 16);
    if (toTop) toTop.classList.toggle('show', y > 600);
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  var sections = links
    .map(function (a) { return document.querySelector(a.getAttribute('href')); })
    .filter(Boolean);

  if ('IntersectionObserver' in window && sections.length) {
    var spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var id = entry.target.id;
        links.forEach(function (a) {
          a.classList.toggle('active', a.getAttribute('href') === '#' + id);
        });
      });
    }, { rootMargin: '-45% 0px -50% 0px', threshold: 0 });
    sections.forEach(function (s) { spy.observe(s); });
  }

  /* ================= HAREKET SİSTEMİ ================= */
  /* Bölümler görünüme girerken tek bir sistemle belirir (CSS: [data-motion]):
     rise  — kısa yukarı kayma + belirme (bölüm üst başlığı, giriş metni, kartlar)
     mask  — bölüm başlığının alttan açılması
     slide — soldan kısa kayma (ilkeler ve adımlar gibi listeler)
     scale — çok hafif büyüyerek belirme (öne çıkan kart)
     Aynı anda görünüme giren öğeler sırayla (70 ms arayla) gelir. Hareket bitince özellik
     kaldırılır; öğe kendi stiline döner. Hareket azaltma tercihinde hiç uygulanmaz. */
  var hareketAzalt = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var hareketliler = [];

  function hareketEkle(el, tur) {
    if (!el || el.hasAttribute('data-motion')) return;
    el.setAttribute('data-motion', tur);
    hareketliler.push(el);
  }

  if (!hareketAzalt && 'IntersectionObserver' in window) {
    document.querySelectorAll('main .section').forEach(function (sec) {
      hareketEkle(sec.querySelector('.section-eyebrow'), 'rise');
      hareketEkle(sec.querySelector('.section-title'), 'mask');
      sec.querySelectorAll('.section-intro, .join-lead').forEach(function (el) { hareketEkle(el, 'rise'); });
    });
    hareketEkle(document.querySelector('.steps'), 'line');
    document.querySelectorAll('.steps li').forEach(function (el) { hareketEkle(el, 'slide'); });
    hareketEkle(document.querySelector('.join-card'), 'scale');
    document.querySelectorAll('.lara-item').forEach(function (el) { hareketEkle(el, 'letter'); el.setAttribute('data-motion-step', '140'); });
    hareketEkle(document.querySelector('.org-root'), 'scale');
    hareketEkle(document.querySelector('.org-connector'), 'draw');
    document.querySelectorAll('.reveal').forEach(function (el) { hareketEkle(el, 'rise'); });

    var hareketGozlem = new IntersectionObserver(function (entries) {
      var gelenler = entries
        .filter(function (entry) { return entry.isIntersecting; })
        .map(function (entry) { return entry.target; })
        .sort(function (a, b) { return (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) ? -1 : 1; });
      gelenler.forEach(function (el, sira) {
        hareketGozlem.unobserve(el);
        var gecikme = Math.min(sira, 6) * (parseInt(el.getAttribute('data-motion-step'), 10) || 70);
        el.style.setProperty('--motion-delay', gecikme + 'ms');
        el.classList.add('is-in');
        setTimeout(function () {
          el.removeAttribute('data-motion');
          el.removeAttribute('data-motion-step');
          el.classList.remove('is-in');
          el.style.removeProperty('--motion-delay');
        }, gecikme + 1400);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    hareketliler.forEach(function (el) { hareketGozlem.observe(el); });
  }

  /* ================= KAYDIRMAYA BAĞLI BÖLÜMLER ================= */
  /* Faaliyet Alanları: ekranın ortasındaki satır vurgulanır, yandaki sayaç ve çubuk ilerler.
     İlkeler: bölüm ekrana girdikçe ilkeler sırayla koyulaşır. Yalnızca sınıf ve bir CSS değişkeni
     değişir; tarayıcı kaydırma olayını zaten kare başına en fazla bir kez gönderir. */
  var workList    = document.querySelector('.work-list');
  var workItems   = workList ? Array.prototype.slice.call(workList.querySelectorAll('.work-item')) : [];
  var workCurrent = document.querySelector('.work-current');
  var workBar     = document.querySelector('.work-progress');
  var manifesto   = document.querySelector('.manifesto');
  var maniItems   = manifesto ? Array.prototype.slice.call(manifesto.children) : [];
  var aktifSatir  = -1;

  if (manifesto && !hareketAzalt) manifesto.classList.add('is-live');

  function kaydirmaGuncelle() {
    var vh = window.innerHeight || document.documentElement.clientHeight;

    if (workItems.length) {
      var orta = vh * 0.5, secili = 0;
      workItems.forEach(function (item, i) {
        if (item.getBoundingClientRect().top <= orta) secili = i;
      });
      var r = workList.getBoundingClientRect();
      var ilerleme = Math.min(1, Math.max(0, (orta - r.top) / r.height));
      if (workBar) workBar.style.setProperty('--work-progress', ilerleme.toFixed(3));
      if (secili !== aktifSatir) {
        workItems.forEach(function (item, i) { item.classList.toggle('is-active', i === secili); });
        if (workCurrent) {
          workCurrent.textContent = (secili < 9 ? '0' : '') + (secili + 1);
          workCurrent.classList.remove('is-changing');
          void workCurrent.offsetWidth;          // animasyonu yeniden başlat
          workCurrent.classList.add('is-changing');
        }
        aktifSatir = secili;
      }
    }

    if (maniItems.length && !hareketAzalt) {
      var m = manifesto.getBoundingClientRect();
      var p = (vh * 0.85 - m.top) / (m.height + vh * 0.3);
      var yanik = Math.ceil(Math.min(1, Math.max(0, p)) * maniItems.length);
      maniItems.forEach(function (li, i) { li.classList.toggle('is-lit', i < yanik); });
    }
  }
  if (workItems.length || maniItems.length) {
    window.addEventListener('scroll', kaydirmaGuncelle, { passive: true });
    window.addEventListener('resize', kaydirmaGuncelle);
    kaydirmaGuncelle();
  }

  /* henüz doldurulmamış bağlantılar sayfayı zıplatmasın */
  document.querySelectorAll('a[data-placeholder][href="#"]').forEach(function (a) {
    a.addEventListener('click', function (e) { e.preventDefault(); });
  });

  applyLang(startLang);
})();
