/* =====================================================================
   MedX site script: the one JavaScript file every page loads.
   Sections, in order (each runs only on the page that has its markup):
     1. Inquiry data      the record, validation, GHL webhook (window.MedXInquiry)
     2. Contact Us form   the guided form in #dlg-contact (window.MedXForm)
     3. Landing page      header, overlays, accordion, reveals
   ===================================================================== */

/* ===================== 1. Inquiry data ===================== */
/* =====================================================================
   MedX inquiry model
   One record shape behind every entry point (the guided form today;
   Messenger or WhatsApp lead capture later). This is the object a future
   GoHighLevel (GHL) integration maps to contact + opportunity fields.
   Nothing here sends data anywhere.
   ===================================================================== */
(() => {
'use strict';

const SERVICES = { hotel: 'Hotel visit', urgent: 'Urgent care', other: 'Other' };
const METHODS  = { whatsapp: 'WhatsApp', messenger: 'Messenger', email: 'Email', phone: 'Phone call' };
// Inquiry types exactly as listed in the onboarding questionnaire.
const TYPES = { appointment: 'Appointment Request', service: 'Service Inquiry', quote: 'Request for Quotation',
                product: 'Product Availability', partnership: 'Partnership Inquiry', general: 'General Inquiry' };
const isCareService = s => s === 'hotel' || s === 'urgent';
// Times are Boracay time (UTC+8), whatever timezone the visitor's phone is set to.
const manilaNow = () => { const n = new Date(); return new Date(n.getTime() + (n.getTimezoneOffset() + 480) * 60000); };
const isoOf = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const fmtTime = v => { if (!v) return ''; const [h, m] = v.split(':').map(Number); return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`; };
// A preferred date and time is asked for clinic appointments, and for hotel visits that aren't needed right away.
const needsSchedule = d => (d.service === 'hotel' && d.timing === 'scheduled') || (d.service === 'other' && d.inquiryType === 'appointment');
const fromIso = v => { const [y, m, dd] = v.split('-').map(Number); return new Date(y, m - 1, dd); };
const niceDate = v => v ? fromIso(v).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : '';
const typeOf = d => isCareService(d.service) ? 'appointment' : d.inquiryType;
// The WhatsApp number, when WhatsApp is the chosen method: the mobile number unless they gave a separate one.
const waNumberOf = d => d.preferredContact !== 'whatsapp' ? '' : ((d.waSame === false ? d.whatsapp : d.mobile) || '').trim();

const draft = {
  service: '', inquiryType: '', productService: '', location: '',
  timing: 'asap', prefDate: '', prefTime: '',
  fullName: '', mobile: '', email: '', preferredContact: '',
  waSame: true, whatsapp: '',   // WhatsApp on the mobile number, or a separate WhatsApp number
  message: ''
};

function buildRecord(source, d) {
  return {
    source,                                           // e.g. 'Website · Landing page form'
    inquiry_type: TYPES[typeOf(d)] || '',
    service_interest: isCareService(d.service) ? SERVICES[d.service] : (d.productService || '').trim(),
    preferred_timing: needsSchedule(d) ? 'Scheduled' : (d.service === 'urgent' || d.service === 'hotel') ? 'As soon as possible' : '',
    preferred_date: needsSchedule(d) ? d.prefDate : '',
    preferred_time: needsSchedule(d) ? fmtTime(d.prefTime) : '',
    booking_status: typeOf(d) === 'appointment' ? 'Requested · to be confirmed' : '',
    full_name: d.fullName || '',
    mobile: d.mobile || '',
    whatsapp_number: waNumberOf(d),
    email: d.email || '',
    preferred_contact: METHODS[d.preferredContact] || '',
    location: d.location || '',
    message: d.message || '',
    consent_to_contact: d.consent ? 'Yes' : 'No',
    created_at: new Date().toISOString()
  };
}
const RECORD_LABELS = {
  source: 'Source', inquiry_type: 'Inquiry type', service_interest: 'Product / service',
  preferred_timing: 'Timing', preferred_date: 'Preferred date', preferred_time: 'Preferred time',
  booking_status: 'Booking status', full_name: 'Full name', mobile: 'Mobile', whatsapp_number: 'WhatsApp', email: 'Email',
  preferred_contact: 'Preferred contact', location: 'Location', message: 'Message',
  consent_to_contact: 'Consent', created_at: 'Created'
};

/* ---------------- Validation ---------------- */
const digitsOf = v => (v || '').replace(/\D/g, '');
const V = {
  fullName(v) { return v.trim() ? '' : 'Enter your name.'; },
  whatsapp(v) { return v.trim() ? V.mobile(v) : 'Enter your WhatsApp number.'; },
  mobile(v) {
    const t = v.trim();
    if (!t) return 'Enter your mobile number.';
    if (!/^\+?[\d\s().-]+$/.test(t)) return 'Use digits, with an optional +.';
    const n = digitsOf(t).length;
    if (n < 7 || n > 15) return 'Check the number and country code.';
    return '';
  },
  email(v, required) {
    const t = v.trim();
    if (!t) return required ? 'Enter your email.' : '';
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(t) ? '' : 'Check your email address.';
  },
  location(v) { return v.trim() ? '' : 'Enter your hotel or location.'; }
};

/* ---------- Integration point ----------
   GoHighLevel (GHL) inbound webhook. Paste the URL from the workflow's
   "Inbound Webhook" trigger below. While it is empty, submissions stay
   simulated (nothing leaves the browser). The GHL endpoint allows
   cross-origin JSON posts, so no server is needed.
   submit() resolves on success and rejects with an Error on failure. */
const GHL_WEBHOOK_URL = 'https://services.leadconnectorhq.com/hooks/9q0CTnhy6NKDzAXMvEWp/webhook-trigger/8215d019-2d27-4d30-8ae3-97a707010f58';

/* Where a successful inquiry lands. Paste the GHL funnel's thank-you step URL here
   (for example 'https://your-domain.com/thank-you'). While it is empty, the form goes
   to thank-you.html in this site's folder, next to index.html. */
const THANK_YOU_URL = '';
const scriptSrc = document.currentScript && document.currentScript.src;
function thankYouUrl() {
  if (THANK_YOU_URL) return THANK_YOU_URL;
  return scriptSrc ? new URL('../thank-you.html', scriptSrc).href : new URL('thank-you.html', location.href).href;
}

const keyOf = (map, label) => Object.keys(map).find(k => map[k] === label) || '';
// The record plus a few fields that make GHL branching and mapping simpler.
function webhookPayload(r) {
  const parts = (r.full_name || '').trim().split(/\s+/);
  const urgent = r.preferred_timing === 'As soon as possible';
  const svcKey = keyOf(SERVICES, r.service_interest) || (r.service_interest ? 'other' : '');
  return {
    ...r,
    first_name: parts[0] || '',
    last_name: parts.slice(1).join(' '),
    service_key: svcKey,                                  // hotel | urgent | other
    inquiry_type_key: keyOf(TYPES, r.inquiry_type),       // appointment | service | quote | ...
    preferred_contact_key: keyOf(METHODS, r.preferred_contact), // whatsapp | messenger | email | phone
    priority: urgent ? 'Urgent' : 'Standard',
    submitted_at_boracay: manilaNow().toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true }),
    page_url: location.href.split('#')[0],
    ...displayFields(r)
  };
}
// Ready-to-print text for the GHL emails, so a field that doesn't apply says why instead of showing blank.
function displayFields(r) {
  const appt = r.inquiry_type === TYPES.appointment;
  return {
    service_display: r.service_interest
      || (r.inquiry_type === TYPES.service ? 'Not specified' : 'Not applicable (appointments, quotes and products only)'),
    timing_display: r.preferred_timing === 'Scheduled'
      ? [niceDate(r.preferred_date), r.preferred_time].filter(Boolean).join(' · ') || 'Scheduled'
      : r.preferred_timing || 'Not applicable (appointments and hotel visits only)',
    location_display: r.location || (appt ? 'Not applicable (clinic appointment)' : 'Not provided'),
    email_display: r.email || 'Not provided',
    whatsapp_display: r.whatsapp_number || 'Not applicable (WhatsApp not chosen)',
    message_display: r.message || 'None added'
  };
}

const outbox = [];
async function submit(record) {
  if (GHL_WEBHOOK_URL) {
    if (!navigator.onLine) throw new Error('offline');
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15000);
    try {
      const res = await fetch(GHL_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(webhookPayload(record)),
        signal: ctrl.signal
      });
      if (!res.ok) throw new Error(`webhook ${res.status}`);
      outbox.push(record);
      return { ok: true, simulated: false };
    } finally { clearTimeout(timer); }
  }
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      if (!navigator.onLine) { reject(new Error('offline')); return; }
      outbox.push(record); resolve({ ok: true, simulated: true });
    }, 1100);
  });
}

window.MedXInquiry = {
  SERVICES, METHODS, TYPES, RECORD_LABELS, V,
  isCareService, manilaNow, isoOf, fmtTime, needsSchedule, fromIso, niceDate, typeOf,
  draft, waNumberOf, buildRecord, webhookPayload, submit, outbox, thankYouUrl
};
})();

/* ===================== 2. Contact Us form ===================== */
/* =====================================================================
   Contact Us: guided inquiry (ported from the prototype)
   The site's overlay system (main.js) opens and closes #dlg-contact and
   calls MedXForm.onOpen / MedXForm.preselect. The record shape and the
   CRM integration point live in inquiry.js (window.MedXInquiry).
   ===================================================================== */
(() => {
'use strict';
  if (!document.getElementById('dlg-contact')) return;   // only on pages with the Contact Us form

const M = window.MedXInquiry;
const { SERVICES, METHODS, TYPES, RECORD_LABELS, V, isCareService, manilaNow, isoOf, fmtTime,
        needsSchedule, fromIso, niceDate, typeOf, draft, waNumberOf, buildRecord } = M;

/* ---------------- Utilities ---------------- */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const root = document.documentElement;
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const coarse = window.matchMedia('(pointer: coarse)');
const firstName = n => (n || '').trim().split(/\s+/)[0] || '';
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const svgUse = (id, cls = 'icon') => { const ns = 'http://www.w3.org/2000/svg'; const s = document.createElementNS(ns, 'svg'); s.setAttribute('class', cls); s.setAttribute('aria-hidden', 'true'); const u = document.createElementNS(ns, 'use'); u.setAttribute('href', '#' + id); s.appendChild(u); return s; };
const wait = ms => new Promise(r => setTimeout(r, ms));
// Break long emails at sensible points (after @, before dots) instead of mid-word.
function breakable(text) {
  const frag = document.createDocumentFragment();
  String(text).split(/(?<=@)|(?=\.)/).forEach((part, i) => { if (i) frag.append(document.createElement('wbr')); frag.append(part); });
  return frag;
}

function renderRecord(rec) {
  const d = el('details', 'f-record');
  const s = el('summary');
  s.append(el('span', null, 'Inquiry record · CRM preview'), svgUse('i-chev', 'icon icon-sm'));
  const body = el('div', 'rec-body');
  const dl = el('dl');
  Object.keys(RECORD_LABELS).forEach(k => {
    const row = el('div');
    const dd = el('dd');
    if (rec[k]) dd.append(k === 'email' ? breakable(rec[k]) : rec[k]); else dd.append(el('code', null, '—'));
    row.append(el('dt', null, RECORD_LABELS[k]), dd);
    dl.append(row);
  });
  body.append(dl);
  d.append(s, body);
  return d;
}

/* ---------------- Visual viewport (keyboard-aware sheets on iOS) ---------------- */
const vv = window.visualViewport;
function syncViewport() {
  if (!vv) return;
  root.style.setProperty('--vv-h', vv.height + 'px');
  root.style.setProperty('--vv-top', vv.offsetTop + 'px');
}
if (vv) { vv.addEventListener('resize', syncViewport); vv.addEventListener('scroll', syncViewport); syncViewport(); }

// Keep focused inputs visible above the on-screen keyboard.
document.addEventListener('focusin', e => {
  if (!coarse.matches || !e.target.matches('.mxf input:not([type=radio]):not([type=checkbox]), .mxf textarea')) return;
  setTimeout(() => e.target.scrollIntoView({ block: 'center', behavior: reduceMotion.matches ? 'auto' : 'smooth' }), 320);
});

/* ======================================================================
   CONTACT US: progressive form
   ====================================================================== */
const form = (() => {
  const f = $('#inquiry-form');
  /* WhatsApp: a "same number" checkbox under Mobile, and a WhatsApp number field for when it isn't.
     Built here rather than in the page markup, so a page pasted into GHL before this existed still gets it. */
  if (!$('#fld-wa') && $('#fld-mobile')) {
    const wa = el('div', 'f-wa');
    wa.id = 'fld-wa'; wa.hidden = true;
    wa.innerHTML =
      '<label class="f-consent f-check"><input type="checkbox" id="waSame" checked>' +
      '<span class="box" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg></span>' +
      '<span>My WhatsApp is on this number</span></label>' +
      '<div class="f-field" id="fld-whatsapp" hidden>' +
      '<label class="lbl" for="whatsapp">WhatsApp number <span class="key-tag" hidden></span></label>' +
      '<input class="input tnum" id="whatsapp" name="whatsapp" type="tel" inputmode="tel" maxlength="24" autocomplete="off" enterkeyhint="next" placeholder="+44 7700 900123" aria-describedby="hint-whatsapp err-whatsapp">' +
      '<p class="hint" id="hint-whatsapp">The number your WhatsApp is on, with country code.</p>' +
      '<p class="field-error" id="err-whatsapp" hidden></p></div>';
    $('#fld-mobile').after(wa);
  }
  const body = $('#form-body');
  const steps = $$('.f-step', f);
  const btnNext = $('#btn-next');
  const btnBack = $('#btn-back');
  const count = $('#contact-count');
  const bars = $$('#progress span');
  const TOTAL = 4;
  let current = 1;
  let editingFromReview = false;
  let isSubmitted = false;
  let consent = false;
  const attempted = new Set();

  const fields = ['productService', 'location', 'fullName', 'mobile', 'whatsapp', 'email', 'message'];
  // Which step-3 field each contact method relies on, and the tag shown on its label.
  const KEY_FIELD = { whatsapp: 'mobile', messenger: 'fullName', email: 'email', phone: 'mobile' };
  const KEY_TAG = { whatsapp: 'For calls and WhatsApp', messenger: 'For Messenger', email: 'For email', phone: 'For calls and texts' };
  const waSeparate = () => draft.preferredContact === 'whatsapp' && draft.waSame === false;
  const keyField = () => (waSeparate() ? 'whatsapp' : KEY_FIELD[draft.preferredContact]);
  const keyTag = () => (waSeparate() ? 'We’ll message you here' : KEY_TAG[draft.preferredContact]);
  // How we'll reach them: the number or email the chosen method uses.
  const contactHandle = () => (draft.preferredContact === 'email' ? draft.email.trim() : waNumberOf(draft) || draft.mobile.trim());

  /* -- bind inputs to the shared draft -- */
  fields.forEach(name => {
    const input = f.elements[name];
    input.addEventListener('input', () => {
      draft[name] = input.value;
      if (input.getAttribute('aria-invalid') === 'true') validateField(name);
      if (name === 'message') $('#msg-count').textContent = input.value.length + '/1000';
      if (name === 'location') syncChips();
    });
    input.addEventListener('blur', () => { if (input.value.trim()) validateField(name); });
  });
  /* -- after a tile pick, scroll the sheet so the question it revealed is in view -- */
  function revealNext(target) {
    if (!target || target.hidden || target.offsetParent === null) return;
    // Wait a frame so the newly shown block has its size, then scroll only as far as needed.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const b = body.getBoundingClientRect(), r = target.getBoundingClientRect();
      const foot = 16, head = 12;
      let delta = 0;
      if (r.bottom > b.bottom - foot) delta = r.bottom - (b.bottom - foot);
      if (r.top - delta < b.top + head) delta = r.top - (b.top + head);   // never push its top out of view
      if (delta > 1) body.scrollBy({ top: delta, behavior: reduceMotion.matches ? 'auto' : 'smooth' });
    }));
  }

  $$('input[name=service]', f).forEach(r => r.addEventListener('change', () => {
    draft.service = r.value; setError('service', ''); syncServiceExtras(true);
    revealNext(r.value === 'urgent' ? $('#urgent-note') : r.value === 'other' ? $('#type-field') : null);
  }));
  /* -- custom dropdown (listbox pattern, keyboard + pointer). Every dropdown uses this. -- */
  function makeDropdown(key, placeholder, onPick) {
    const wrap = $('#dd-' + key), btn = $('#' + key + '-btn'), list = $('#' + key + '-list'), input = f.elements[key];
    const opts = $$('[role=option]', list);
    const valueEl = $('.dd-value', btn);
    let active = -1;
    function setActive(i) {
      active = (i + opts.length) % opts.length;
      opts.forEach((o, k) => o.classList.toggle('is-active', k === active));
      list.setAttribute('aria-activedescendant', opts[active].id);
      opts[active].scrollIntoView({ block: 'nearest' });
    }
    function openList() {
      if (!list.hidden) return;
      list.hidden = false;
      wrap.classList.add('is-open');
      btn.setAttribute('aria-expanded', 'true');
      const sel = opts.findIndex(o => o.dataset.value === input.value);
      setActive(sel > -1 ? sel : 0);
      list.focus({ preventScroll: true });
      requestAnimationFrame(() => list.scrollIntoView({ block: 'nearest', behavior: reduceMotion.matches ? 'auto' : 'smooth' }));
    }
    function closeList(refocus = true) {
      if (list.hidden) return;
      list.hidden = true;
      wrap.classList.remove('is-open');
      btn.setAttribute('aria-expanded', 'false');
      list.removeAttribute('aria-activedescendant');
      if (refocus) btn.focus({ preventScroll: true });
    }
    function set(v, fromUser) {
      input.value = v || '';
      const chosen = opts.find(o => o.dataset.value === input.value);
      opts.forEach(o => o.setAttribute('aria-selected', String(o === chosen)));
      valueEl.textContent = chosen ? chosen.textContent.trim() : placeholder;
      btn.classList.toggle('is-empty', !chosen);
      if (fromUser) onPick(input.value);
    }
    btn.addEventListener('click', () => (list.hidden ? openList() : closeList()));
    btn.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); openList(); }
    });
    list.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown') { e.preventDefault(); setActive(active + 1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(active - 1); }
      else if (e.key === 'Home') { e.preventDefault(); setActive(0); }
      else if (e.key === 'End') { e.preventDefault(); setActive(opts.length - 1); }
      else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); set(opts[active].dataset.value, true); closeList(); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeList(); }   // don't close the sheet
      else if (e.key === 'Tab') closeList(false);
      else if (e.key.length === 1) {
        const i = opts.findIndex(o => o.textContent.trim().toLowerCase().startsWith(e.key.toLowerCase()));
        if (i > -1) setActive(i);
      }
    });
    opts.forEach((o, i) => {
      o.addEventListener('click', () => { set(o.dataset.value, true); closeList(); });
      o.addEventListener('pointermove', () => { if (active !== i) setActive(i); });
    });
    document.addEventListener('pointerdown', e => { if (!list.hidden && !wrap.contains(e.target)) closeList(false); });
    list.addEventListener('focusout', e => { if (!wrap.contains(e.relatedTarget)) closeList(false); });
    return { set, close: () => closeList(false) };
  }
  /* -- inquiry type: option tiles (radios). Falls back to the old dropdown if a page still has that markup. -- */
  const pickType = v => { draft.inquiryType = v; setError('inquiryType', ''); syncServiceExtras(true); };
  const typeDropdown = $('#dd-inquiryType') ? makeDropdown('inquiryType', 'Choose one', pickType) : {
    set: v => $$('input[name=inquiryType]', f).forEach(r => { r.checked = r.value === v; }),
    close: () => {}
  };
  $$('input[name=inquiryType]', f).forEach(r => r.addEventListener('change', () => {
    pickType(r.value);
    revealNext($('#product-field'));
  }));
  const typeTarget = () => $('#grp-inquiryType') || $('#inquiryType-btn');

  /* -- custom date picker (dialog + grid of day buttons). Every date field uses this.
        Days and months out of range use aria-disabled, not disabled: a disabled button loses focus, and losing
        focus used to close the popover. Pressing one now shows a short note in the popover instead. -- */
  const datePicker = (() => {
    const wrap = $('#dp'), btn = $('#prefDate-btn'), pop = $('#dp-pop'), days = $('#dp-days'), title = $('#dp-month'), input = f.elements.prefDate;
    const prev = $('#dp-prev'), next = $('#dp-next');
    const valueEl = $('.dd-value', btn);
    const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const today = () => { const n = manilaNow(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()); };
    const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
    const minD = () => today(), maxD = () => addDays(today(), 60);   // requests up to two months ahead
    const clamp = d => (d < minD() ? minD() : d > maxD() ? maxD() : d);
    const ym = d => d.getFullYear() * 12 + d.getMonth();
    const isOff = b => b.getAttribute('aria-disabled') === 'true';
    const MSG_PAST = 'Dates before today aren’t available.';
    const msgLate = () => `You can request up to ${maxD().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}, two months ahead.`;
    pop.tabIndex = -1;   // a click on empty space inside keeps focus in the popover
    const note = el('p', 'pick-note');
    note.setAttribute('role', 'status'); note.hidden = true;
    pop.append(note);
    const say = msg => { note.hidden = !msg; note.textContent = msg || ''; };
    let view = today(), focusD = today();
    function render() {
      title.textContent = view.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
      const lead = new Date(view.getFullYear(), view.getMonth(), 1).getDay();
      const count = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
      const rows = []; let row = el('tr');
      for (let i = 0; i < lead; i++) row.append(el('td'));
      for (let n = 1; n <= count; n++) {
        const d = new Date(view.getFullYear(), view.getMonth(), n), v = iso(d);
        const b = el('button', 'dp-day', String(n));
        b.type = 'button'; b.dataset.date = v;
        b.setAttribute('aria-label', d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }));
        b.setAttribute('aria-pressed', String(input.value === v));
        if (v === iso(today())) { b.classList.add('is-today'); b.setAttribute('aria-current', 'date'); }
        if (d < minD() || d > maxD()) b.setAttribute('aria-disabled', 'true');
        b.tabIndex = v === iso(focusD) ? 0 : -1;
        const td = el('td'); td.append(b); row.append(td);
        if ((lead + n) % 7 === 0) { rows.push(row); row = el('tr'); }
      }
      if (row.children.length) { while (row.children.length < 7) row.append(el('td')); rows.push(row); }
      days.replaceChildren(...rows);
      prev.setAttribute('aria-disabled', String(ym(view) <= ym(minD())));
      next.setAttribute('aria-disabled', String(ym(view) >= ym(maxD())));
    }
    function moveTo(d, focusIt = true) {
      focusD = clamp(d);
      view = new Date(focusD.getFullYear(), focusD.getMonth(), 1);
      render();
      if (focusIt) { const b = $(`.dp-day[data-date="${iso(focusD)}"]`, days); if (b) b.focus({ preventScroll: true }); }
    }
    // Keyboard moves: stop at the ends of the range and say why.
    function keyTo(d) {
      say(d < minD() ? MSG_PAST : d > maxD() ? msgLate() : '');
      moveTo(d);
    }
    function openPop() {
      if (!pop.hidden) return;
      say('');
      pop.hidden = false; wrap.classList.add('is-open'); btn.setAttribute('aria-expanded', 'true');
      moveTo(input.value ? fromIso(input.value) : today());
      requestAnimationFrame(() => pop.scrollIntoView({ block: 'nearest', behavior: reduceMotion.matches ? 'auto' : 'smooth' }));
    }
    function closePop(refocus = true) {
      if (pop.hidden) return;
      pop.hidden = true; wrap.classList.remove('is-open'); btn.setAttribute('aria-expanded', 'false');
      if (refocus) btn.focus({ preventScroll: true });
    }
    function set(v, fromUser) {
      input.value = v || '';
      valueEl.textContent = v ? niceDate(v) : 'Choose a date';
      btn.classList.toggle('is-empty', !v);
      if (fromUser) { draft.prefDate = input.value; setError('prefDate', ''); timePicker.onDate(); }
    }
    btn.addEventListener('click', () => (pop.hidden ? openPop() : closePop()));
    btn.addEventListener('keydown', e => { if (e.key === 'ArrowDown') { e.preventDefault(); openPop(); } });
    prev.addEventListener('click', () => {
      if (isOff(prev)) { say(MSG_PAST); return; }
      say(''); moveTo(new Date(view.getFullYear(), view.getMonth() - 1, Math.min(focusD.getDate(), 28)), false);
    });
    next.addEventListener('click', () => {
      if (isOff(next)) { say(msgLate()); return; }
      say(''); moveTo(new Date(view.getFullYear(), view.getMonth() + 1, Math.min(focusD.getDate(), 28)), false);
    });
    $$('[data-quick]', pop).forEach(q => q.addEventListener('click', () => { set(iso(addDays(today(), +q.dataset.quick)), true); closePop(); }));
    days.addEventListener('click', e => {
      const b = e.target.closest('.dp-day');
      if (!b) return;
      if (isOff(b)) { say(b.dataset.date < iso(minD()) ? 'That date has passed.' : msgLate()); return; }
      set(b.dataset.date, true); closePop();
    });
    days.addEventListener('keydown', e => {
      const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
      if (step) { e.preventDefault(); keyTo(addDays(focusD, step)); }
      else if (e.key === 'PageUp' || e.key === 'PageDown') { e.preventDefault(); keyTo(new Date(focusD.getFullYear(), focusD.getMonth() + (e.key === 'PageUp' ? -1 : 1), focusD.getDate())); }
      else if (e.key === 'Home') { e.preventDefault(); keyTo(addDays(focusD, -focusD.getDay())); }
      else if (e.key === 'End') { e.preventDefault(); keyTo(addDays(focusD, 6 - focusD.getDay())); }
    });
    pop.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closePop(); } });   // don't close the sheet
    document.addEventListener('pointerdown', e => { if (!pop.hidden && !wrap.contains(e.target)) closePop(false); });
    // Re-rendering a month replaces the focused button, so check focus after the move settles.
    pop.addEventListener('focusout', () => setTimeout(() => { if (!wrap.contains(document.activeElement)) closePop(false); }, 0));
    return { set, close: () => closePop(false) };
  })();

  /* -- custom time picker: the four parts of the day as tabs, then that part's half-hour times (no long scroll).
        On today's date, times that have passed in Boracay are greyed out; pressing one says why. -- */
  const timePicker = (() => {
    const wrap = $('#tp'), btn = $('#prefTime-btn'), pop = $('#tp-pop'), box = $('#tp-slots'), input = f.elements.prefTime;
    const valueEl = $('.dd-value', btn);
    const PERIODS = [
      { name: 'Early', range: '12–6 am', from: 0 },
      { name: 'Morning', range: '6 am–12 nn', from: 6 },
      { name: 'Afternoon', range: '12–6 pm', from: 12 },
      { name: 'Evening', range: '6 pm–12 mn', from: 18 }
    ];
    const pad = n => String(n).padStart(2, '0');
    const slotsOf = p => { const out = []; for (let h = p.from; h < p.from + 6; h++) for (const m of [0, 30]) out.push(`${pad(h)}:${pad(m)}`); return out; };
    const periodOf = v => PERIODS.findIndex(p => +v.slice(0, 2) >= p.from && +v.slice(0, 2) < p.from + 6);
    // On today's date, times that have already passed in Boracay can't be picked.
    const isPast = v => {
      const now = manilaNow();
      if (draft.prefDate !== isoOf(now)) return false;
      const [h, m] = v.split(':').map(Number);
      return h * 60 + m <= now.getHours() * 60 + now.getMinutes();
    };
    const isOff = b => b.getAttribute('aria-disabled') === 'true';
    pop.tabIndex = -1;   // a click on empty space inside keeps focus in the popover
    const tabs = el('div', 'tp-periods');
    tabs.setAttribute('role', 'group'); tabs.setAttribute('aria-label', 'Part of the day');
    const grid = el('div', 'tp-grid');
    grid.setAttribute('role', 'group');
    const note = el('p', 'pick-note');
    note.setAttribute('role', 'status'); note.hidden = true;
    box.classList.add('tp-body');
    box.replaceChildren(tabs, grid, note);
    const say = msg => { note.hidden = !msg; note.textContent = msg || ''; };
    const slots = () => $$('.tp-slot', grid);
    const cols = () => getComputedStyle(grid).gridTemplateColumns.split(' ').length || 3;
    let current = 1;

    function renderTabs() {
      tabs.replaceChildren(...PERIODS.map((p, i) => {
        const b = el('button', 'tp-period');
        b.type = 'button'; b.dataset.i = i;
        b.setAttribute('aria-pressed', String(i === current));
        b.tabIndex = i === current ? 0 : -1;
        b.classList.toggle('is-past', slotsOf(p).every(isPast));
        b.append(el('span', 'tp-period-name', p.name), el('span', 'tp-period-range', p.range));
        return b;
      }));
    }
    function renderGrid() {
      const p = PERIODS[current];
      grid.setAttribute('aria-label', `${p.name}, ${p.range}`);
      grid.replaceChildren(...slotsOf(p).map(v => {
        const [hm, ap] = fmtTime(v).split(' ');
        const b = el('button', 'tp-slot');
        b.type = 'button'; b.dataset.time = v; b.tabIndex = -1;
        b.setAttribute('aria-label', fmtTime(v));
        b.setAttribute('aria-pressed', String(input.value === v));
        if (isPast(v)) b.setAttribute('aria-disabled', 'true');
        b.append(el('span', 'tp-hm', hm), el('span', 'tp-ap', ap));
        return b;
      }));
      const free = slots().filter(b => !isOff(b));
      say(free.length ? '' : 'These times have passed for today. Choose a later part of the day.');
      const first = free.find(b => b.dataset.time === input.value) || free[0];
      if (first) first.tabIndex = 0;
    }
    function showPeriod(i) {
      current = (i + PERIODS.length) % PERIODS.length;
      renderTabs(); renderGrid();
    }
    function focusSlot(b) {
      if (!b) return;
      slots().forEach(x => { x.tabIndex = -1; });
      b.tabIndex = 0; b.focus({ preventScroll: true });
    }
    function openPop() {
      if (!pop.hidden) return;
      // Open on the chosen time's part of the day, else the first part with a free time from the morning on.
      let i = input.value ? periodOf(input.value) : -1;
      if (i < 0) {
        const order = [1, 2, 3, 0];
        i = order.find(k => slotsOf(PERIODS[k]).some(v => !isPast(v)));
        if (i == null) i = 1;
      }
      showPeriod(i);
      pop.hidden = false; wrap.classList.add('is-open'); btn.setAttribute('aria-expanded', 'true');
      const start = slots().find(b => b.tabIndex === 0) || $('.tp-period[aria-pressed="true"]', tabs);
      if (start) start.focus({ preventScroll: true });
      requestAnimationFrame(() => pop.scrollIntoView({ block: 'nearest', behavior: reduceMotion.matches ? 'auto' : 'smooth' }));
    }
    function closePop(refocus = true) {
      if (pop.hidden) return;
      pop.hidden = true; wrap.classList.remove('is-open'); btn.setAttribute('aria-expanded', 'false');
      if (refocus) btn.focus({ preventScroll: true });
    }
    function set(v, fromUser) {
      input.value = v || '';
      valueEl.textContent = v ? fmtTime(v) : 'Choose a time';
      btn.classList.toggle('is-empty', !v);
      if (fromUser) { draft.prefTime = input.value; setError('prefTime', ''); }
    }
    btn.addEventListener('click', () => (pop.hidden ? openPop() : closePop()));
    btn.addEventListener('keydown', e => { if (e.key === 'ArrowDown') { e.preventDefault(); openPop(); } });
    tabs.addEventListener('click', e => {
      const b = e.target.closest('.tp-period');
      if (!b) return;
      showPeriod(+b.dataset.i);
      $('.tp-period[aria-pressed="true"]', tabs).focus({ preventScroll: true });
    });
    tabs.addEventListener('keydown', e => {
      const step = { ArrowLeft: -1, ArrowRight: 1 }[e.key];
      if (step) { e.preventDefault(); showPeriod(current + step); $('.tp-period[aria-pressed="true"]', tabs).focus({ preventScroll: true }); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); focusSlot(slots().find(b => b.tabIndex === 0) || slots()[0]); }
    });
    grid.addEventListener('click', e => {
      const b = e.target.closest('.tp-slot');
      if (!b) return;
      if (isOff(b)) { say('That time has passed. Choose a later time.'); return; }
      set(b.dataset.time, true); closePop();
    });
    grid.addEventListener('keydown', e => {
      const list = slots(), i = list.indexOf(document.activeElement), c = cols();
      const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -c, ArrowDown: c }[e.key];
      if (step) {
        e.preventDefault();
        if (i + step < 0 && e.key === 'ArrowUp') { $('.tp-period[aria-pressed="true"]', tabs).focus({ preventScroll: true }); return; }
        focusSlot(list[Math.min(list.length - 1, Math.max(0, i + step))]);
      }
      else if (e.key === 'Home') { e.preventDefault(); focusSlot(list[0]); }
      else if (e.key === 'End') { e.preventDefault(); focusSlot(list[list.length - 1]); }
    });
    pop.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closePop(); } });   // don't close the sheet
    document.addEventListener('pointerdown', e => { if (!pop.hidden && !wrap.contains(e.target)) closePop(false); });
    // Switching parts of the day replaces the focused button, so check focus after the switch settles.
    pop.addEventListener('focusout', () => setTimeout(() => { if (!wrap.contains(document.activeElement)) closePop(false); }, 0));
    return {
      set,
      close: () => closePop(false),
      // If the date changes to today and the chosen time has passed, clear it.
      onDate() { if (input.value && isPast(input.value)) { set('', true); setError('prefTime', 'That time has passed.'); } }
    };
  })();

  $$('input[name=timing]', f).forEach(r => r.addEventListener('change', () => {
    draft.timing = r.value; syncStep2(true);
    if (r.value === 'scheduled') revealNext($('#schedule-field'));
  }));
  $$('input[name=preferredContact]', f).forEach(r => r.addEventListener('change', () => {
    draft.preferredContact = r.value; setError('preferredContact', ''); syncMethodHints();
    revealNext($('#fld-' + keyField()));
  }));
  $('#waSame').addEventListener('change', e => {
    draft.waSame = e.target.checked; syncMethodHints();
    if (!draft.waSame) { revealNext($('#fld-whatsapp')); f.elements.whatsapp.focus({ preventScroll: true }); }
  });
  $('#consent').addEventListener('change', e => { consent = e.target.checked; if (consent) setError('consent', ''); });

  /* -- area chips -- */
  $$('#area-chips .chip').forEach(chip => chip.addEventListener('click', () => {
    const input = f.elements.location;
    const area = chip.textContent.trim();
    const parts = input.value.split(',').map(s => s.trim()).filter(Boolean);
    const has = parts.some(p => p.toLowerCase() === area.toLowerCase());
    const next = has ? parts.filter(p => p.toLowerCase() !== area.toLowerCase())
                     : parts.filter(p => !$$('#area-chips .chip').some(c => c.textContent.trim().toLowerCase() === p.toLowerCase())).concat(area);
    input.value = next.join(', ');
    draft.location = input.value;
    if (input.value.trim()) validateField('location');
    syncChips();
  }));
  function syncChips() {
    const parts = f.elements.location.value.split(',').map(s => s.trim().toLowerCase());
    $$('#area-chips .chip').forEach(c => c.setAttribute('aria-pressed', String(parts.includes(c.textContent.trim().toLowerCase()))));
  }

  /* -- Enter moves to the next field instead of submitting early -- */
  f.addEventListener('keydown', e => {
    if (e.key !== 'Enter' || e.target.tagName !== 'INPUT' || e.target.type === 'radio' || e.target.type === 'checkbox') return;
    const stepEl = steps[current - 1];
    const inputs = $$('input.input, textarea.input', stepEl).filter(i => i.offsetParent !== null);
    const idx = inputs.indexOf(e.target);
    if (idx > -1 && idx < inputs.length - 1) { e.preventDefault(); inputs[idx + 1].focus(); }
  });

  const PRODUCT_FIELD = {
    appointment: { label: 'What is the appointment for?', required: true, ph: 'e.g. a lab test or a check-up at the clinic', err: 'What is it for?' },
    service: { label: 'Which service?', required: false, ph: 'e.g. a medical certificate or a lab test', err: '' },
    quote:   { label: 'What would you like a quote for?', required: true, ph: 'e.g. a hotel visit for two people', err: 'What should we quote?' },
    product: { label: 'Which product?', required: true, ph: 'Product name', err: 'Enter the product name.' }
  };
  function syncServiceExtras(animate) {
    const care = isCareService(draft.service), other = draft.service === 'other';
    const pf = other ? PRODUCT_FIELD[draft.inquiryType] : null;
    const show = { '#urgent-note': draft.service === 'urgent', '#type-field': other, '#product-field': !!pf };
    Object.entries(show).forEach(([sel, on]) => {
      const box = $(sel);
      if (on && box.hidden && animate) box.classList.add('f-reveal'); else if (!animate) box.classList.remove('f-reveal');
      box.hidden = !on;
    });
    if (pf) {
      $('#product-lbl').textContent = pf.label;
      $('#product-opt').hidden = pf.required;
      f.elements.productService.placeholder = pf.ph;
    }
    if (!other) setError('inquiryType', '');
    if (!pf || !pf.required) setError('productService', '');
    syncStep2();
  }
  // Step 2 asks for a location when MedX needs to find the patient, and for a message otherwise.
  function syncStep2(animate) {
    const care = isCareService(draft.service), hotel = draft.service === 'hotel', none = !draft.service;
    const appt = draft.service === 'other' && draft.inquiryType === 'appointment';
    const sched = needsSchedule(draft);
    $('#s2-title').textContent = hotel ? 'Where and when?'
      : care || none ? 'Where are you staying?'
      : appt ? 'When suits you?' : 'Tell us more';
    $('#loc-block').hidden = appt;
    $('#loc-lbl').textContent = care || none ? 'Hotel or location' : 'Your location';
    $('#loc-opt').hidden = care || none;
    $('#hint-location').textContent = care || none
      ? 'Your hotel name, or where you are now.'
      : 'Your hotel, area or business name.';
    $('#when-field').hidden = !hotel;
    const sf = $('#schedule-field');
    if (animate && sched && sf.hidden) sf.classList.add('f-reveal'); else if (!animate) sf.classList.remove('f-reveal');
    sf.hidden = !sched;
    if (!sched) { setError('prefDate', ''); setError('prefTime', ''); datePicker.close(); timePicker.close(); }
    const msgOptional = care || appt || none;
    $('#msg-lbl').textContent = msgOptional ? 'Anything else?' : 'Your message';
    $('#msg-opt').hidden = !msgOptional;
    f.elements.message.placeholder = appt ? 'Anything we should know'
      : msgOptional ? 'e.g. room number, how many people'
      : 'Tell us what you need';
    if (msgOptional) setError('message', '');
    if (!care) setError('location', '');
  }
  // The name and number must match the app we'll reply on.
  function syncMethodHints() {
    const nameHint = $('#hint-fullName'); // missing on pages pasted before this hint existed
    if (nameHint) nameHint.hidden = draft.preferredContact !== 'messenger';
    $('#hint-mobile').textContent = 'Include your country code.';
    // WhatsApp: ask whether it's on the mobile number; if not, show its own field.
    $('#fld-wa').hidden = draft.preferredContact !== 'whatsapp';
    $('#fld-whatsapp').hidden = !waSeparate();
    if (!waSeparate()) setError('whatsapp', '');
    // Highlight the field (and label) we'll use to reach them.
    const key = keyField();
    ['fullName', 'mobile', 'whatsapp', 'email'].forEach(name => {
      const fld = $('#fld-' + name);
      if (!fld) return;
      const on = name === key;
      fld.classList.toggle('is-key', on);
      const tag = $('.key-tag', fld);
      if (tag) { tag.hidden = !on; tag.textContent = on ? keyTag() : ''; }
    });
    // With a separate WhatsApp number, the mobile number is still the one we call.
    if (waSeparate()) { const t = $('#fld-mobile .key-tag'); if (t) { t.hidden = false; t.textContent = 'For calls'; } }
  }

  /* -- errors -- */
  function setError(name, msg) {
    const err = $('#err-' + name);
    if (!err) return;
    const target = name === 'service' ? $('#grp-service') : name === 'inquiryType' ? typeTarget() : (name === 'prefTime' || name === 'prefDate') ? $('#' + name + '-btn') : name === 'preferredContact' ? $('#grp-method') : name === 'consent' ? $('#consent') : f.elements[name];
    if (msg) {
      err.replaceChildren(svgUse('i-alert', 'icon'), el('span', null, msg));
      err.hidden = false;
      target && target.setAttribute('aria-invalid', 'true');
      if (target && target.classList.contains('f-options')) target.classList.add('is-invalid');
    } else {
      err.hidden = true; err.textContent = '';
      target && target.removeAttribute('aria-invalid');
      if (target && target.classList.contains('f-options')) target.classList.remove('is-invalid');
    }
  }
  function validateField(name) {
    const v = (f.elements[name] && f.elements[name].value) || '';
    const care = isCareService(draft.service);
    let msg = '';
    if (name === 'productService') {
      const pf = draft.service === 'other' ? PRODUCT_FIELD[draft.inquiryType] : null;
      msg = pf && pf.required && !v.trim() ? pf.err : '';
    }
    else if (name === 'location') msg = care ? V.location(v) : '';
    else if (name === 'message') msg = !care && draft.inquiryType !== 'appointment' && !v.trim() ? 'Tell us briefly what you need.' : '';
    else if (name === 'email') msg = V.email(v, true);
    else if (V[name]) msg = V[name](v);
    setError(name, msg);
    return !msg;
  }
  function validateStep(n) {
    const bad = [];
    if (n === 1) {
      if (!draft.service) { setError('service', 'Choose an option.'); bad.push($('input[name=service]', f)); }
      if (draft.service === 'other' && !draft.inquiryType) { setError('inquiryType', 'Choose a topic.'); bad.push($('input[name=inquiryType]', f) || $('#inquiryType-btn')); }
      else if (!validateField('productService')) bad.push(f.elements.productService);
    }
    if (n === 2) {
      if (!validateField('location')) bad.push(f.elements.location);
      if (needsSchedule(draft)) {
        if (!draft.prefDate) { setError('prefDate', 'Choose a preferred date.'); bad.push($('#prefDate-btn')); }
        if (!draft.prefTime) { setError('prefTime', 'Choose a preferred time.'); bad.push($('#prefTime-btn')); }
      }
      if (!validateField('message')) bad.push(f.elements.message);
    }
    if (n === 3) {
      if (!draft.preferredContact) { setError('preferredContact', 'Choose a contact method.'); bad.push($('input[name=preferredContact]', f)); }
      if (!validateField('fullName')) bad.push(f.elements.fullName);
      if (!validateField('mobile')) bad.push(f.elements.mobile);
      if (waSeparate() && !validateField('whatsapp')) bad.push(f.elements.whatsapp);
      if (!validateField('email')) bad.push(f.elements.email);
    }
    if (n === 4 && !consent) { setError('consent', 'Please tick the box to continue.'); bad.push($('#consent')); }
    if (bad.length) {
      const first = bad[0];
      first.focus({ preventScroll: true });
      const anchor = first.closest('.f-field, .f-options, .f-consent') || first;
      anchor.scrollIntoView({ block: 'center', behavior: reduceMotion.matches ? 'auto' : 'smooth' });
    }
    return !bad.length;
  }

  /* -- review -- */
  function renderReview() {
    const r = $('#review');
    r.replaceChildren();
    const group = (title, step, content) => {
      const g = el('section', 'review-group');
      const h = el('h3', null, title);
      const edit = el('button', 'text-btn', 'Edit');
      edit.type = 'button';
      edit.setAttribute('aria-label', 'Edit ' + title.toLowerCase());
      edit.addEventListener('click', () => { editingFromReview = true; go(step); });
      g.append(h, edit, content);
      r.append(g);
    };
    const val = (text, empty) => { const p = el('p', 'val' + (text ? '' : ' empty'), text || empty); return p; };
    const care = isCareService(draft.service);
    if (care) group('Service', 1, val(SERVICES[draft.service]));
    else {
      group('Inquiry', 1, val(TYPES[draft.inquiryType]));
      if (draft.productService.trim()) group('Product / service', 1, val(draft.productService.trim()));
    }
    if (!(draft.service === 'other' && draft.inquiryType === 'appointment')) group('Location', 2, val(draft.location.trim(), 'Not given'));
    if (needsSchedule(draft)) {
      const box = el('div');
      box.append(val(niceDate(draft.prefDate) + ' · ' + fmtTime(draft.prefTime)), el('p', 'val-note', 'To be confirmed by our team.'));
      group('Preferred date & time', 2, box);
    } else if (draft.service === 'hotel') group('When', 2, val('As soon as possible'));
    group('Preferred contact', 3, val(METHODS[draft.preferredContact]));
    const dl = el('dl');
    const rows = [['Name', draft.fullName], ['Mobile', draft.mobile]];
    if (draft.preferredContact === 'whatsapp') rows.push(['WhatsApp', waSeparate() ? draft.whatsapp : 'Same as mobile']);
    rows.push(['Email', draft.email]);
    rows.forEach(([k, v]) => {
      const row = el('div'); const dd = el('dd', v.trim() ? '' : 'empty');
      dd.append(v.trim() ? (k === 'Email' ? breakable(v.trim()) : v.trim()) : 'Not given');
      row.append(el('dt', null, k), dd); dl.append(row);
    });
    group('Contact details', 3, dl);
    group(care || draft.inquiryType === 'appointment' ? 'Additional details' : 'Message', 2, val(draft.message.trim(), 'None added'));
  }

  function renderConfirmation(rec) {
    const fu = $('#followup');
    const how = contactHandle();
    const howEl = el('span', 'tnum'); howEl.append(breakable(how));
    fu.replaceChildren(el('b', null, 'We’ll contact you by ' + METHODS[draft.preferredContact]), howEl);
    if (typeOf(draft) === 'appointment') {
      fu.append(el('span', 'followup-note', needsSchedule(draft)
        ? `Requested: ${niceDate(draft.prefDate)}, ${fmtTime(draft.prefTime)}. We’ll confirm with you.`
        : 'We’ll confirm the details with you.'));
    }
    const recBox = $('#form-record');   // the CRM-preview panel was prototype-only; keep the slot empty
    if (recBox) recBox.replaceChildren();
  }

  /* -- footer per step -- */
  function syncChrome() {
    const n = current;
    btnBack.hidden = n === 1 || n === 5;
    btnNext.className = 'f-btn btn-primary grow';
    btnNext.disabled = false;
    if (n === 5) {
      btnBack.hidden = false; btnBack.textContent = 'New inquiry';
      btnNext.textContent = 'Back to home';
    } else {
      btnBack.textContent = 'Back';
      btnNext.textContent = editingFromReview && n < 4 ? 'Save and review'
        : n === 3 ? 'Review inquiry'
        : n === 4 ? 'Submit inquiry' : 'Continue';
    }
    $('#progress').hidden = n === 5;
    count.textContent = n === 5 ? 'Inquiry sent' : `Step ${n} of ${TOTAL}`;
    bars.forEach((b, i) => b.classList.toggle('done', i < n));
  }

  /* -- step transitions: old leaves while new enters (one container, popLayout) -- */
  // Steps that are still animating out, mapped to the function that finishes their exit.
  const leaving = new Map();
  const finishLeave = step => { const done = leaving.get(step); if (done) done(); };
  function go(n, dir) {
    if (n === current) return;
    dir = dir || (n > current ? 'fwd' : 'back');
    const from = steps[current - 1], to = steps[n - 1];
    if (n === 4) renderReview();
    current = n;
    finishLeave(to);   // coming back to a step that is still on its way out: end that exit first
    // outgoing: taken out of flow immediately so the new step doesn't wait for it
    from.classList.remove('enter-fwd', 'enter-back');
    from.classList.add('leaving', 'leave-' + dir);
    // Finish the exit once: on the step's OWN animationend (not a date picker or checkmark inside it)
    // or after a timeout on slow devices. Never hide the step that is showing now, and never leave
    // a listener behind that could hide a step later (that left the form body blank).
    let timer = 0;
    const onEnd = e => { if (e.target === from) done(); };
    const done = () => {
      clearTimeout(timer);
      from.removeEventListener('animationend', onEnd);
      leaving.delete(from);
      from.classList.remove('leaving', 'leave-fwd', 'leave-back');
      if (from !== steps[current - 1]) from.hidden = true;
    };
    leaving.set(from, done);
    from.addEventListener('animationend', onEnd);
    timer = setTimeout(done, 260);
    to.hidden = false;
    to.classList.remove('enter-fwd', 'enter-back');
    void to.offsetWidth;
    to.classList.add('enter-' + dir);
    body.scrollTop = 0;
    syncChrome();
    $('.step-title', to).focus({ preventScroll: true });
  }

  btnBack.addEventListener('click', () => {
    if (current === 5) { reset(); go(1, 'back'); return; }
    if (editingFromReview) { editingFromReview = false; go(4, 'back'); return; }
    go(current - 1);
  });

  f.addEventListener('submit', async e => {
    e.preventDefault();
    if (current === 5) { $('#dlg-contact [data-close]').click(); return; }
    if (!validateStep(current)) return;
    if (current === 4) return submit();
    if (editingFromReview) { editingFromReview = false; go(4); return; }
    go(current + 1);
  });

  async function submit() {
    const err = $('#submit-error');
    err.hidden = true;
    btnNext.setAttribute('aria-busy', 'true');
    btnBack.disabled = true;
    btnNext.replaceChildren(el('span', 'spinner'), el('span', null, 'Submitting…'));
    const rec = buildRecord('Website · Landing page form', { ...draft, consent: true });
    let failed = false;
    try { await M.submit(rec); } catch (e) { failed = true; }
    btnNext.removeAttribute('aria-busy');
    btnBack.disabled = false;
    if (failed) {
      syncChrome();
      err.replaceChildren(svgUse('i-alert', 'icon icon-sm'), el('span', null, navigator.onLine ? 'Couldn’t send. Your answers are saved. Try again or call +63 969 479 1691.' : 'You seem to be offline. Your answers are saved. Try again once connected.'));
      err.hidden = false;
      err.scrollIntoView({ block: 'center', behavior: reduceMotion.matches ? 'auto' : 'smooth' });
      return;
    }
    isSubmitted = true;
    renderConfirmation(rec);
    go(5);
  }

  function reset() {
    // Keep contact details so the visitor never retypes them; clear the request itself.
    Object.assign(draft, { service: '', inquiryType: '', productService: '', location: '', message: '', timing: 'asap', prefDate: '', prefTime: '' });
    consent = false; isSubmitted = false; editingFromReview = false;
    $('#consent').checked = false;
    ['service', 'inquiryType', 'productService', 'location', 'message', 'prefDate', 'prefTime', 'consent'].forEach(n => setError(n, ''));
    prefill();
  }

  function prefill() {
    $$('input[name=service]', f).forEach(r => r.checked = r.value === draft.service);
    typeDropdown.set(draft.inquiryType); typeDropdown.close();
    timePicker.set(draft.prefTime); timePicker.close();
    datePicker.set(draft.prefDate); datePicker.close();
    $$('input[name=timing]', f).forEach(r => r.checked = r.value === draft.timing);
    $$('input[name=preferredContact]', f).forEach(r => r.checked = r.value === draft.preferredContact);
    $('#waSame').checked = draft.waSame !== false;
    fields.forEach(n => { f.elements[n].value = draft[n]; });
    $('#msg-count').textContent = draft.message.length + '/1000';
    syncServiceExtras(false); syncMethodHints(); syncChips();
  }

  function showOnly(n) {
    [...leaving.values()].forEach(done => done());
    steps.forEach((s, i) => { s.hidden = i !== n - 1; s.classList.remove('leaving', 'leave-fwd', 'leave-back', 'enter-fwd', 'enter-back'); });
    current = n;
    syncChrome();
  }

  return {
    preselect(service) {
      if (isSubmitted) reset();
      draft.service = service;
      editingFromReview = false;
      showOnly(1);
      prefill();
      setError('service', '');
    },
    onOpen() {
      if (isSubmitted && current !== 5) reset();
      prefill();
      syncChrome();
      $('.step-title', steps[current - 1]).focus({ preventScroll: true });
    },
    afterClose() { if (isSubmitted) { reset(); showOnly(1); } },
    refresh: prefill
  };
})();

// After a submitted form closes, the next open starts a fresh inquiry (contact details kept).
$('#dlg-contact').addEventListener('close', () => form.afterClose());

window.MedXForm = { onOpen: () => form.onOpen(), preselect: s => form.preselect(s) };

})();

/* ===================== 3. Landing page ===================== */
/* =====================================================================
   MedX landing page behaviour
   ===================================================================== */
(function () {
  'use strict';
  if (!document.getElementById('dlg-contact')) return;   // landing page only

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

  /* Phone action bar (Contact / Call / Message): appears as soon as the hero's own
     Contact Us / Call buttons scroll up out of view (under the header), and hides again when they return */
  var actionBar = $('.action-bar');
  var heroActions = $('.hero__actions');
  if (actionBar) {
    if ('IntersectionObserver' in window && heroActions) {
      new IntersectionObserver(function (entries) {
        var e = entries[0];
        var passed = !e.isIntersecting && e.boundingClientRect.top < (e.rootBounds ? e.rootBounds.top : 0);
        actionBar.classList.toggle('is-shown', passed);
      }, { rootMargin: '-64px 0px 0px 0px', threshold: 0 }).observe(heroActions);
    } else {
      actionBar.classList.add('is-shown');
    }
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

  /* Announce which app is opening */
  var channelStatus = $('[data-channel-status]');
  $$('[data-channel]').forEach(function (ch) {
    ch.addEventListener('click', function () {
      var c = ch.getAttribute('data-channel');
      channelStatus.textContent = c === 'whatsapp' ? 'Opening WhatsApp…' : c === 'messenger' ? 'Opening Facebook…' : 'Opening Messages…';
    });
  });
})();
