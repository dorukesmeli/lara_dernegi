/* LARA Derneği — Google Analytics 4 özel olayları
   Siteye özel tüm olaylar buradan gönderilir. page_view, scroll, dış bağlantı tıklaması gibi
   olayları GA4 "Gelişmiş ölçüm" zaten topladığı için burada tekrar üretilmez.

   KİŞİSEL VERİ GÖNDERİLMEZ: Her olay yalnızca EVENTS tablosunda izin verilen parametreleri
   taşır ve her değer izin verilen listeye ya da kısa, sabit bir anahtar kalıbına uymak zorundadır
   (ör. "hero", "en"). Ad, e-posta, telefon, doğum tarihi veya form içeriği bu kalıplara uymaz;
   uymayan isteğe bağlı değer atılır, zorunlu değer uymazsa olay hiç gönderilmez.

   gtag yüklenmemiş ya da engellenmişse hiçbir şey bozulmaz; olay sessizce gönderilmez.
   Test için adrese ?ga_debug=1 eklenirse olaylar DebugView'a düşer ve konsola yazılır. */
(function () {
  'use strict';

  var LANG = ['tr', 'en'];
  var ERROR_TYPES = ['validation', 'network', 'timeout', 'confirmation_failed', 'internal_notification_failed', 'unknown'];
  var KEY_RE = /^[a-z0-9_]{1,40}$/;
  var PROJECT_RE = /^[a-z0-9_-]{1,50}$/;
  var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

  /* Olay adı → izin verilen parametreler ve geçerli değerleri.
     OPTIONAL dışındaki parametreler zorunludur: biri eksik ya da geçersizse olay hiç gönderilmez. */
  var EVENTS = {
    join_cta_click:                 { language: LANG, location: KEY_RE },
    membership_form_open:           { language: LANG, trigger_location: KEY_RE },
    membership_form_start:          { language: LANG },
    membership_application_success: { language: LANG, submission_id: UUID_RE },
    membership_application_error:   { language: LANG, error_type: ERROR_TYPES },
    language_change:                { from_language: LANG, to_language: LANG },
    team_profile_open:              { role: KEY_RE },
    project_open:                   { project_key: PROJECT_RE, language: LANG },
    contact_email_click:            { location: KEY_RE },
    social_click:                   { platform: KEY_RE, location: KEY_RE }
  };

  var OPTIONAL = ['submission_id'];

  /* Bölüm kimlikleri → raporlarda görünecek sabit konum adları */
  var SECTION_KEYS = {
    anasayfa: 'hero', hakkimizda: 'about', amaclarimiz: 'goals', faaliyetler: 'activities',
    ilkeler: 'principles', projeler: 'projects', ekip: 'team', 'uye-ol': 'join_section', iletisim: 'contact'
  };

  var PLATFORMS = [
    [/(^|\.)instagram\.com$/, 'instagram'],
    [/(^|\.)(whatsapp\.com|wa\.me)$/, 'whatsapp'],
    [/(^|\.)(youtube\.com|youtu\.be)$/, 'youtube'],
    [/(^|\.)linkedin\.com$/, 'linkedin'],
    [/(^|\.)facebook\.com$/, 'facebook'],
    [/(^|\.)(x\.com|twitter\.com)$/, 'x'],
    [/(^|\.)tiktok\.com$/, 'tiktok']
  ];

  var REPEAT_MS = 1000;     // aynı olay + aynı parametreler bu süre içinde tekrar gelirse gönderilmez
  var lastSent = {};
  var DEBUG = /[?&]ga_debug=1(&|$)/.test(window.location.search);

  function isValid(rule, value) {
    if (Array.isArray(rule)) return rule.indexOf(value) !== -1;
    return typeof value === 'string' && rule.test(value);
  }

  function trackEvent(name, params) {
    try {
      var schema = EVENTS[name];
      if (!schema) return false;

      var clean = {}, signature = name;
      var keys = Object.keys(schema);
      for (var i = 0; i < keys.length; i++) {
        var key = keys[i];
        var value = params ? params[key] : undefined;
        if (value !== undefined && isValid(schema[key], value)) {
          clean[key] = value;
          signature += '|' + key + '=' + value;
        } else if (OPTIONAL.indexOf(key) === -1) {
          return false;
        }
      }

      var now = Date.now();
      if (lastSent[signature] && now - lastSent[signature] < REPEAT_MS) return false;
      lastSent[signature] = now;

      if (DEBUG) {
        clean.debug_mode = true;
        if (window.console) console.info('[LARA analytics]', name, clean);
      }
      if (typeof window.gtag !== 'function') return false;
      window.gtag('event', name, clean);
      return true;
    } catch (e) {
      return false;
    }
  }

  function currentLanguage() {
    return document.documentElement.getAttribute('data-lang') === 'en' ? 'en' : 'tr';
  }

  /* Tıklanan öğenin sayfadaki yeri: header / mobile_menu / footer / modal / bölüm adı */
  function locationOf(el) {
    if (!el || !el.closest) return 'unknown';
    var own = el.closest('[data-track-location]');
    if (own) return own.getAttribute('data-track-location');
    if (el.closest('.site-header')) {
      var nav = document.getElementById('primaryNav');
      return (nav && nav.classList.contains('open')) ? 'mobile_menu' : 'header';
    }
    if (el.closest('.site-footer')) return 'footer';
    if (el.closest('.modal')) return 'modal';
    var section = el.closest('section[id]');
    return (section && SECTION_KEYS[section.id]) || 'unknown';
  }

  function platformOf(a) {
    var host = (a.hostname || '').toLowerCase();
    for (var i = 0; i < PLATFORMS.length; i++) {
      if (PLATFORMS[i][0].test(host)) return PLATFORMS[i][1];
    }
    return null;
  }

  /* Bağlantı tıklamaları — yakalama aşamasında dinlenir; böylece menüyü kapatan
     diğer dinleyicilerden önce çalışır ve mobil menü konumu doğru okunur. */
  document.addEventListener('click', function (e) {
    try {
      var target = e.target;
      if (!target || !target.closest) return;

      var a = target.closest('a[href]');
      if (a) {
        var href = a.getAttribute('href') || '';
        if (href === '#uye-ol') {
          trackEvent('join_cta_click', { language: currentLanguage(), location: locationOf(a) });
        } else if (/^mailto:/i.test(href)) {
          trackEvent('contact_email_click', { location: locationOf(a) });
        } else {
          var platform = platformOf(a);
          if (platform) trackEvent('social_click', { platform: platform, location: locationOf(a) });
        }
      }

      /* Proje detayı açan öğeler: data-track-project="proje-anahtari" */
      var project = target.closest('[data-track-project]');
      if (project) {
        trackEvent('project_open', { project_key: project.getAttribute('data-track-project'), language: currentLanguage() });
      }
    } catch (err) {}
  }, true);

  /* Formdaki ilk gerçek etkileşim (yazma, seçme, işaretleme) — sayfa başına bir kez.
     Yalnızca olayın gerçekleştiği bilgisi gönderilir; alanın adı ya da değeri gönderilmez. */
  var joinForm = document.getElementById('joinForm');
  if (joinForm) {
    var started = false;
    var onFirstInteraction = function (e) {
      if (started || !e.isTrusted) return;
      if (e.target && e.target.name === 'website') return;   // bot tuzağı alanı sayılmaz
      started = true;
      joinForm.removeEventListener('input', onFirstInteraction, true);
      joinForm.removeEventListener('change', onFirstInteraction, true);
      trackEvent('membership_form_start', { language: currentLanguage() });
    };
    joinForm.addEventListener('input', onFirstInteraction, true);
    joinForm.addEventListener('change', onFirstInteraction, true);
  }

  window.LaraAnalytics = { track: trackEvent, locationOf: locationOf };
})();
