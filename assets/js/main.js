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

  document.querySelectorAll('[data-set-lang]').forEach(function (b) {
    b.addEventListener('click', function () { applyLang(b.getAttribute('data-set-lang')); });
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
  }

  function closeBio() {
    modal.hidden = true;
    delete modal.dataset.person;
    document.body.classList.remove('modal-open');
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  // kartta fotoğraf varsa baş harflerin yerine onu göster
  document.querySelectorAll('.person[data-photo]').forEach(function (card) {
    var av = card.querySelector('.avatar');
    if (av) av.outerHTML = '<img class="person-photo" src="' + card.dataset.photo + '" alt="" loading="lazy" width="400" height="400">';
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
  var joinModal   = document.getElementById('joinModal');
  var joinForm    = document.getElementById('joinForm');
  var joinWrap    = document.getElementById('joinFormWrap');
  var joinOk      = document.getElementById('joinSuccess');
  var joinBtn     = document.getElementById('joinSubmit');
  var joinStatus  = document.getElementById('formStatus');
  var openJoinBtn = document.getElementById('openJoinForm');
  var CFG = window.LARA_FORM || {};
  var sending = false;        // çift gönderimi engeller
  var formOpenedAt = 0;       // bot tuzağı: form anında gönderilmişse şüpheli
  var turnstileReady = false;
  var submissionId = null;    // aynı başvurunun yeniden denemelerinde aynı kalır (sunucuda tekrar koruması)

  function yeniBasvuruKimligi() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
    var h = '';
    for (var i = 0; i < 32; i++) h += Math.floor(Math.random() * 16).toString(16);
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
  }

  /* Hangi gönderim sağlayıcısı kullanılacak? (form-config.js → provider)
     Apps Script seçili ama adres girilmemişse, canlı formu bozmamak için FormSubmit'e döner. */
  function aktifSaglayici() {
    var p = String(CFG.provider || CFG.mode || 'formsubmit').toLowerCase();
    if (p === 'appsscript' && !CFG.appsScriptUrl) {
      if (window.console) console.warn('LARA_FORM: provider "appsscript" seçili ama appsScriptUrl boş — FormSubmit kullanılıyor.');
      return 'formsubmit';
    }
    return p;
  }

  /* Cloudflare Turnstile — sadece form-config.js'de site anahtarı varsa yüklenir.
     Gizli anahtar (secret key) burada KULLANILMAZ, sunucu tarafına aittir. */
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
    if (list.length >= max) return true;
    return false;
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

  function openJoin() {
    formOpenedAt = Date.now();
    initTurnstile();
    lastFocus = document.activeElement;
    joinModal.hidden = false;
    document.body.classList.add('modal-open');
    var c = joinModal.querySelector('.modal-close');
    if (c) c.focus();
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

  function validate() {
    clearErrors();
    var first = null;

    joinForm.querySelectorAll('input[required], textarea[required]').forEach(function (input) {
      if (input.type === 'checkbox') return;
      if (!input.value.trim()) first = fieldError(input, t('form.required')) || first;
    });

    var email = joinForm.querySelector('input[type="email"]');
    if (email.value.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.value.trim())) {
      first = fieldError(email, t('form.emailInvalid')) || first;
    }

    var phone = joinForm.querySelector('input[type="tel"]');
    if (phone.value.trim() && phone.value.replace(/\D/g, '').length < 10) {
      first = fieldError(phone, t('form.phoneInvalid')) || first;
    }

    var birth = joinForm.querySelector('input[type="date"]');
    if (birth.value) {
      var b = new Date(birth.value), now = new Date();
      var age = now.getFullYear() - b.getFullYear();
      var m = now.getMonth() - b.getMonth();
      if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--;
      if (age < 18) first = fieldError(birth, t('form.age18')) || first;
    }

    var consentErr = document.getElementById('consentError');
    var p = document.getElementById('chkPrinciples'), k = document.getElementById('chkKvkk');
    if (!p.checked || !k.checked) {
      consentErr.textContent = t('form.checkRequired') || t('form.required');
      if (!first) first = p.checked ? k : p;
    } else {
      consentErr.textContent = '';
    }

    if (first) {
      var f = first.closest('.field') || first;
      f.scrollIntoView({ block: 'center', behavior: 'smooth' });
      if (first.focus) first.focus({ preventScroll: true });
    }
    return !first;
  }

  function val(name) {
    var el = joinForm.querySelector('[name="' + name + '"]');
    return (el && el.value.trim()) ? el.value.trim() : '—';
  }

  function collect() {
    var adSoyad = val('Ad Soyad');
    var basvuranEposta = val('E-posta');
    var picked = [];
    joinForm.querySelectorAll('input[name="ilgi"]:checked').forEach(function (c) { picked.push(c.value); });

    /* Alan sırası e-postada da aynen korunur */
    var data = {
      _subject: (CFG.subjectPrefix || 'Yeni Üyelik Başvurusu') + ' – ' + adSoyad,
      _template: 'table',
      _captcha: 'false',
      /* Gelen başvuru e-postasında "Yanıtla" denince cevap doğrudan başvurana gider */
      _replyto: basvuranEposta,

      'Bilgilendirme': 'Yeni bir LARA Derneği üyelik başvurusu alınmıştır.',
      'Ad Soyad': adSoyad,
      'E-posta': basvuranEposta,
      'Telefon': val('Telefon'),
      'Doğum Tarihi': val('Doğum Tarihi'),
      'Şehir': val('Şehir'),
      'Meslek / Bölüm': val('Meslek / Bölüm'),
      'Bildiği Yabancı Diller': val('Yabancı Diller'),
      'Daha önce Erasmus+ veya gençlik projesine katıldı mı?': val('Proje Deneyimi'),
      'İlgi Alanları': picked.length ? picked.join(', ') : '—',
      'Neden LARA\'ya Katılmak İstiyor?': val('Motivasyon'),
      'Onaylar': '18 yaşından büyük ve ilkeleri benimsiyor ✓ · KVKK metni onaylandı ✓',
      'Başvuru Tarihi ve Saati': new Date().toLocaleString('tr-TR'),
      'Formun Doldurulduğu Dil': (lang === 'en') ? 'İngilizce' : 'Türkçe',
      'Kaynak': 'Bu başvuru ' + (CFG.siteAdresi || location.hostname) + ' üzerindeki üyelik formundan gönderilmiştir.'
    };

    if (CFG.turnstileSiteKey) {
      var tokenEl = joinForm.querySelector('[name="cf-turnstile-response"]');
      if (tokenEl && tokenEl.value) data['cf-turnstile-response'] = tokenEl.value;
    }
    return data;
  }

  /* Apps Script için sabit anahtarlı sade veri. Etiketler ve e-posta biçimi sunucuda oluşturulur;
     alıcı adres tarayıcıdan gönderilmez. */
  function collectAppsScript() {
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
      honey: ham('_honey')
    };
  }

  function showSuccess() {
    joinWrap.hidden = true;
    joinOk.hidden = false;
    joinModal.querySelector('.modal-card').scrollTop = 0;
  }

  function sendMailto(data) {
    var body = Object.keys(data)
      .filter(function (k) { return k.charAt(0) !== '_'; })
      .map(function (k) { return k + ': ' + data[k]; })
      .join('\n');
    window.location.href = 'mailto:' + CFG.email +
      '?subject=' + encodeURIComponent(data._subject) +
      '&body=' + encodeURIComponent(body);
    setStatus(t('form.mailtoOpened'), 'ok');
  }

  joinForm.addEventListener('submit', function (e) {
    e.preventDefault();
    if (sending) return;                       // çift tıklama koruması
    setStatus('');

    // bot tuzağı: insanların göremediği alan doldurulmuşsa gönderme
    var honey = joinForm.querySelector('input[name="_honey"]');
    if (honey && honey.value) { showSuccess(); return; }

    if (!validate()) return;

    if (CFG.turnstileSiteKey) {
      var tok = joinForm.querySelector('[name="cf-turnstile-response"]');
      if (!tok || !tok.value) { setStatus(t('form.captchaNeeded'), 'err'); return; }
    }

    if (rateLimited()) { setStatus(t('form.tooMany'), 'err'); return; }

    var saglayici = aktifSaglayici();
    if (saglayici !== 'appsscript' && !CFG.email && !CFG.endpointId) { setStatus(t('form.notConfigured'), 'err'); return; }

    var data = (saglayici === 'appsscript') ? collectAppsScript() : collect();
    if (saglayici === 'mailto') { sendMailto(data); return; }

    sending = true;
    joinBtn.disabled = true;
    joinBtn.textContent = t('form.sending');

    /* Form açılır açılmaz gönderilmişse (tipik bot davranışı) isteği biraz geciktiririz.
       Engellemek yerine geciktirmek, otomatik doldurma kullanan gerçek kişilerin
       başvurusunun kaybolmasını önler. */
    var bekle = Math.max(0, 2500 - (Date.now() - formOpenedAt));
    setTimeout(function () {
      if (saglayici === 'appsscript') gonderAppsScript(data);
      else gonder(data);
    }, bekle);
  });

  function gonder(data) {
    var hedef = CFG.endpointId || CFG.email;   // kimlik varsa e-posta kaynakta görünmez
    fetch('https://formsubmit.co/ajax/' + encodeURIComponent(hedef), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(data)
    })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (res) {
        if (res && res.success === 'false') throw new Error('reddedildi');
        gonderimBasarili();
      })
      .catch(gonderimBasarisiz);
  }

  /* Google Apps Script Web App.
     Gövde JSON'dur ama "text/plain" olarak gönderilir: Apps Script CORS ön kontrolünü (OPTIONS)
     desteklemez, düz metin isteği ise ön kontrol gerektirmez. */
  function gonderAppsScript(payload) {
    fetch(CFG.appsScriptUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
      redirect: 'follow'
    })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (res) {
        if (!res || res.ok !== true) throw new Error((res && res.error) || 'reddedildi');
        gonderimBasarili();
      })
      .catch(gonderimBasarisiz);
  }

  function gonderimBasarili() {
    markSubmitted();
    showSuccess();
  }

  function gonderimBasarisiz() {
    setStatus(t('form.errBody'), 'err');
    sending = false;
    joinBtn.disabled = false;
    joinBtn.textContent = t('form.submit');
    if (window.turnstile && CFG.turnstileSiteKey) { try { window.turnstile.reset(); } catch (e) {} }
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
    header.classList.toggle('scrolled', y > 8);
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

  var reveals = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window && reveals.length) {
    var io = new IntersectionObserver(function (entries, obs) {
      entries.forEach(function (entry, i) {
        if (!entry.isIntersecting) return;
        var el = entry.target;
        setTimeout(function () { el.classList.add('visible'); }, Math.min(i * 70, 350));
        obs.unobserve(el);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    Array.prototype.forEach.call(reveals, function (el) { io.observe(el); });
  } else {
    Array.prototype.forEach.call(reveals, function (el) { el.classList.add('visible'); });
  }

  /* henüz doldurulmamış bağlantılar sayfayı zıplatmasın */
  document.querySelectorAll('a[data-placeholder][href="#"]').forEach(function (a) {
    a.addEventListener('click', function (e) { e.preventDefault(); });
  });

  applyLang(startLang);
})();
