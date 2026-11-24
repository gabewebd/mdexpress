/* =====================================================================
   MedX landing page behaviour
   ===================================================================== */
(function () {
  'use strict';

  var $ = function (s, el) { return (el || document).querySelector(s); };
  var $$ = function (s, el) { return Array.prototype.slice.call((el || document).querySelectorAll(s)); };
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  var Inquiry = window.MedXForm;

  /* ---------- Reduced motion: stop the symbol's drifting light ---------- */
  var sprite = $('.sprite');
  function syncMotion() {
    if (!sprite || !sprite.pauseAnimations) return;
    if (reduceMotion.matches) sprite.pauseAnimations(); else sprite.unpauseAnimations();
  }
  syncMotion();
  if (reduceMotion.addEventListener) reduceMotion.addEventListener('change', syncMotion);

  /* ---------- Toast ---------- */
  var toastEl = $('[data-toast]');
  var toastTimer;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('is-on'); }, 3200);
  }

  /* ---------- Header: transparent at the very top, filled navy once the page scrolls, ivory after the hero ---------- */
  var header = $('[data-header]');
  var hero = $('.hero');
  function syncFill() { header.classList.toggle('is-filled', window.scrollY > 4); }
  syncFill();
  window.addEventListener('scroll', syncFill, { passive: true });
  if ('IntersectionObserver' in window && hero) {
    new IntersectionObserver(function (entries) {
      header.classList.toggle('is-solid', !entries[0].isIntersecting);
    }, { rootMargin: '-64px 0px 0px 0px', threshold: 0 }).observe(hero);
  }

  /* Active section in the nav */
  var navLinks = $$('.site-nav a');
  var sectionMap = {};
  navLinks.forEach(function (a) { sectionMap[a.getAttribute('href').slice(1)] = a; });
  if ('IntersectionObserver' in window) {
    var navIO = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        var link = sectionMap[e.target.id];
        if (!link) return;
        if (e.isIntersecting) {
          navLinks.forEach(function (l) { l.removeAttribute('aria-current'); });
          link.setAttribute('aria-current', 'true');
        } else if (link.getAttribute('aria-current')) {
          link.removeAttribute('aria-current');
        }
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    Object.keys(sectionMap).forEach(function (id) { var s = document.getElementById(id); if (s) navIO.observe(s); });
  }

  /* ---------- Scroll reveals ---------- */
  var revealTargets = $$('.reveal, .reveal-mask, .reveal-wipe, [data-steps], .desk, .mx--closing');
  if ('IntersectionObserver' in window && !reduceMotion.matches) {
    var revealIO = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('is-in'); revealIO.unobserve(e.target); }
      });
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.08 });
    revealTargets.forEach(function (el) { revealIO.observe(el); });
  } else {
    revealTargets.forEach(function (el) { el.classList.add('is-in'); });
  }

  /* ---------- Oversized symbol crops drift a few pixels with scroll ---------- */
  var drifters = $$('[data-drift]');
  var ticking = false;
  function drift() {
    ticking = false;
    var vh = window.innerHeight;
    drifters.forEach(function (el) {
      var r = el.getBoundingClientRect();
      if (r.bottom < -200 || r.top > vh + 200) return;
      var offset = (r.top + r.height / 2 - vh / 2) * -0.06;
      el.style.setProperty('--drift', offset.toFixed(1) + 'px');
      el.style.translate = el.classList.contains('mx--closing') && window.innerWidth >= 1024
        ? '0 calc(-50% + ' + offset.toFixed(1) + 'px)'
        : '0 ' + offset.toFixed(1) + 'px';
    });
  }
  if (!reduceMotion.matches && drifters.length) {
    window.addEventListener('scroll', function () { if (!ticking) { ticking = true; requestAnimationFrame(drift); } }, { passive: true });
    window.addEventListener('resize', drift);
    drift();
  }

  /* ---------- Accordion ---------- */
  $$('[data-accordion] .acc__btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var open = btn.getAttribute('aria-expanded') === 'true';
      btn.setAttribute('aria-expanded', String(!open));
      document.getElementById(btn.getAttribute('aria-controls')).setAttribute('data-open', String(!open));
    });
  });

  /* =====================================================================
     Overlays
     ===================================================================== */
  // Call and Message share one popup: 'Call or message MedX'.
  var reach = $('#dlg-reach');
  var dialogs = { contact: $('#dlg-contact'), call: reach, message: reach, menu: $('#dlg-menu') };
  var lastTrigger = null;
  var closeTimers = new WeakMap();

  function openOverlay(name, trigger) {
    var dlg = dialogs[name];
    if (!dlg) return;
    // Only one overlay at a time: close any other immediately.
    Object.keys(dialogs).forEach(function (k) {
      var d = dialogs[k];
      if (d !== dlg && d.open) { clearTimeout(closeTimers.get(d)); d.classList.remove('is-open', 'is-closing'); d.close(); }
    });
    if (trigger && !trigger.closest('dialog')) lastTrigger = trigger;
    if (dlg.open) { dlg.classList.remove('is-closing'); dlg.classList.add('is-open'); return; }
    clearTimeout(closeTimers.get(dlg));
    dlg.classList.remove('is-closing');
    // Locking page scroll removes a classic scrollbar; pad by its width so nothing shifts.
    document.documentElement.style.setProperty('--sbw', (window.innerWidth - document.documentElement.clientWidth) + 'px');
    dlg.showModal();
    // Flush the panel's resting offset, then open: the transition starts on this frame, not two frames later.
    var panel = $('.overlay__panel', dlg);
    if (panel) void panel.getBoundingClientRect();
    dlg.classList.add('is-open');
    if (name === 'contact') Inquiry.onOpen();
    else {
      var first = $('.overlay__body a, .overlay__body button, .menu a', dlg);
      if (first && name !== 'menu') { var close = $('[data-close]', dlg); if (close) close.focus(); }
    }
  }

  function closeOverlay(dlg, then) {
    if (!dlg || !dlg.open) { if (then) then(); return; }
    dlg.classList.remove('is-open');
    dlg.classList.add('is-closing');
    var ms = reduceMotion.matches ? 0 : 310;
    closeTimers.set(dlg, setTimeout(function () {
      dlg.classList.remove('is-closing');
      dlg.close();
      if (then) then();
      else if (lastTrigger && document.contains(lastTrigger)) lastTrigger.focus({ preventScroll: true });
    }, ms));
  }

  document.addEventListener('click', function (e) {
    var opener = e.target.closest('[data-open]');
    if (opener) {
      e.preventDefault();
      var name = opener.getAttribute('data-open');
      if (name === 'contact' && opener.dataset.service) Inquiry.preselect(opener.dataset.service);
      openOverlay(name, opener);
      return;
    }
    var closer = e.target.closest('[data-close]');
    if (closer) {
      var dlg = closer.closest('dialog');
      var href = closer.getAttribute('href');
      if (href && href.charAt(0) === '#') {
        e.preventDefault();
        closeOverlay(dlg, function () {
          var target = document.getElementById(href.slice(1));
          if (target) {
            target.scrollIntoView({ behavior: reduceMotion.matches ? 'auto' : 'smooth' });
            history.replaceState(null, '', href);
          }
        });
      } else {
        closeOverlay(dlg);
      }
    }
  });

  [dialogs.contact, reach, dialogs.menu].forEach(function (dlg) {
    // Esc: animate out instead of the native instant close.
    dlg.addEventListener('cancel', function (e) { e.preventDefault(); closeOverlay(dlg); });
    // Tap on the dimmed area outside the panel.
    dlg.addEventListener('click', function (e) { if (e.target === dlg) closeOverlay(dlg); });
  });

  /* Copy a phone number (useful on desktop, where tel: links may do nothing) */
  $$('[data-copy]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var text = btn.getAttribute('data-copy');
      var done = function () {
        var st = $('[data-channel-status]', btn.closest('dialog') || document);
        if (st) st.textContent = 'Copied ' + text;
        else toast('Copied ' + text);
        btn.classList.add('is-copied');
        setTimeout(function () { btn.classList.remove('is-copied'); }, 1600);
      };
      if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done, function () { toast('Couldn’t copy. The number is ' + text); });
      else {
        var ta = document.createElement('textarea');
        ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
        btn.closest('dialog').appendChild(ta); ta.select();
        try { document.execCommand('copy'); done(); } catch (err) { toast('The number is ' + text); }
        ta.remove();
      }
    });
  });

  /* Messenger is not connected yet: say so instead of opening anything */
  var channelStatus = $('[data-channel-status]');
  $$('[data-channel]').forEach(function (ch) {
    ch.addEventListener('click', function () {
      var c = ch.getAttribute('data-channel');
      if (c === 'messenger') {
        channelStatus.textContent = 'Messenger isn’t connected yet. Use WhatsApp or text for now.';
      } else {
        channelStatus.textContent = c === 'whatsapp' ? 'Opening WhatsApp…' : 'Opening Messages…';
      }
    });
  });
})();
