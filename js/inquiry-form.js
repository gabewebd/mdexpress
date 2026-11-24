/* =====================================================================
   Contact Us: guided inquiry (ported from the prototype)
   The site's overlay system (main.js) opens and closes #dlg-contact and
   calls MedXForm.onOpen / MedXForm.preselect. The record shape and the
   CRM integration point live in inquiry.js (window.MedXInquiry).
   ===================================================================== */
(() => {
'use strict';

const M = window.MedXInquiry;
const { SERVICES, METHODS, TYPES, RECORD_LABELS, V, isCareService, manilaNow, isoOf, fmtTime,
        needsSchedule, fromIso, niceDate, typeOf, draft, buildRecord } = M;

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

  const fields = ['productService', 'location', 'fullName', 'mobile', 'email', 'message'];

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
  $$('input[name=service]', f).forEach(r => r.addEventListener('change', () => {
    draft.service = r.value; setError('service', ''); syncServiceExtras(true);
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
  $$('input[name=inquiryType]', f).forEach(r => r.addEventListener('change', () => pickType(r.value)));
  const typeTarget = () => $('#grp-inquiryType') || $('#inquiryType-btn');

  /* -- custom date picker (dialog + grid of day buttons). Every date field uses this. -- */
  const datePicker = (() => {
    const wrap = $('#dp'), btn = $('#prefDate-btn'), pop = $('#dp-pop'), days = $('#dp-days'), title = $('#dp-month'), input = f.elements.prefDate;
    const valueEl = $('.dd-value', btn);
    const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const today = () => { const n = manilaNow(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()); };
    const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
    const minD = () => today(), maxD = () => addDays(today(), 60);   // requests up to two months ahead
    const clamp = d => (d < minD() ? minD() : d > maxD() ? maxD() : d);
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
        b.disabled = d < minD() || d > maxD();
        b.tabIndex = v === iso(focusD) ? 0 : -1;
        const td = el('td'); td.append(b); row.append(td);
        if ((lead + n) % 7 === 0) { rows.push(row); row = el('tr'); }
      }
      if (row.children.length) { while (row.children.length < 7) row.append(el('td')); rows.push(row); }
      days.replaceChildren(...rows);
      const ym = d => d.getFullYear() * 12 + d.getMonth();
      $('#dp-prev').disabled = ym(view) <= ym(minD());
      $('#dp-next').disabled = ym(view) >= ym(maxD());
    }
    function moveTo(d, focusIt = true) {
      focusD = clamp(d);
      view = new Date(focusD.getFullYear(), focusD.getMonth(), 1);
      render();
      if (focusIt) { const b = $(`.dp-day[data-date="${iso(focusD)}"]`, days); if (b) b.focus({ preventScroll: true }); }
    }
    function openPop() {
      if (!pop.hidden) return;
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
    $('#dp-prev').addEventListener('click', () => moveTo(new Date(view.getFullYear(), view.getMonth() - 1, Math.min(focusD.getDate(), 28)), false));
    $('#dp-next').addEventListener('click', () => moveTo(new Date(view.getFullYear(), view.getMonth() + 1, Math.min(focusD.getDate(), 28)), false));
    $$('[data-quick]', pop).forEach(q => q.addEventListener('click', () => { set(iso(addDays(today(), +q.dataset.quick)), true); closePop(); }));
    days.addEventListener('click', e => {
      const b = e.target.closest('.dp-day');
      if (!b || b.disabled) return;
      set(b.dataset.date, true); closePop();
    });
    days.addEventListener('keydown', e => {
      const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
      if (step) { e.preventDefault(); moveTo(addDays(focusD, step)); }
      else if (e.key === 'PageUp' || e.key === 'PageDown') { e.preventDefault(); moveTo(new Date(focusD.getFullYear(), focusD.getMonth() + (e.key === 'PageUp' ? -1 : 1), focusD.getDate())); }
      else if (e.key === 'Home') { e.preventDefault(); moveTo(addDays(focusD, -focusD.getDay())); }
      else if (e.key === 'End') { e.preventDefault(); moveTo(addDays(focusD, 6 - focusD.getDay())); }
    });
    pop.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closePop(); } });   // don't close the sheet
    document.addEventListener('pointerdown', e => { if (!pop.hidden && !wrap.contains(e.target)) closePop(false); });
    // Re-rendering a month replaces the focused button, so check focus after the move settles.
    pop.addEventListener('focusout', () => setTimeout(() => { if (!wrap.contains(document.activeElement)) closePop(false); }, 0));
    return { set, close: () => closePop(false) };
  })();

  /* -- custom time picker (dialog + grid of time buttons). Every time field uses this. -- */
  const timePicker = (() => {
    const wrap = $('#tp'), btn = $('#prefTime-btn'), pop = $('#tp-pop'), box = $('#tp-slots'), input = f.elements.prefTime;
    const valueEl = $('.dd-value', btn);
    const GROUPS = [['Early morning', 0, 6], ['Morning', 6, 12], ['Afternoon', 12, 18], ['Evening', 18, 24]];
    const pad = n => String(n).padStart(2, '0');
    // On today's date, times that have already passed in Boracay can't be picked.
    const isPast = v => {
      const now = manilaNow();
      if (draft.prefDate !== isoOf(now)) return false;
      const [h, m] = v.split(':').map(Number);
      return h * 60 + m <= now.getHours() * 60 + now.getMinutes();
    };
    const enabled = () => $$('.tp-slot:not(:disabled)', box);
    function render() {
      const parts = [];
      GROUPS.forEach(([name, from, to]) => {
        const grid = el('div', 'tp-grid');
        grid.setAttribute('role', 'group'); grid.setAttribute('aria-label', name);
        for (let h = from; h < to; h++) for (const m of [0, 30]) {
          const v = `${pad(h)}:${pad(m)}`;
          const b = el('button', 'tp-slot', fmtTime(v));
          b.type = 'button'; b.dataset.time = v; b.tabIndex = -1;
          b.setAttribute('aria-pressed', String(input.value === v));
          b.disabled = isPast(v);
          grid.append(b);
        }
        parts.push(el('p', 'tp-group', name), grid);
      });
      box.replaceChildren(...parts);
    }
    function focusSlot(b) {
      enabled().forEach(x => { x.tabIndex = -1; });
      if (!b) return;
      b.tabIndex = 0;
      b.focus({ preventScroll: true });
      const top = b.offsetTop - 44, bottom = b.offsetTop + b.offsetHeight + 4;   // 44 = sticky group label
      if (top < box.scrollTop) box.scrollTop = top;
      else if (bottom > box.scrollTop + box.clientHeight) box.scrollTop = bottom - box.clientHeight;
    }
    function openPop() {
      if (!pop.hidden) return;
      render();
      pop.hidden = false; wrap.classList.add('is-open'); btn.setAttribute('aria-expanded', 'true');
      // Open on the chosen time, else the first free daytime slot (most visits are booked from 6 am on).
      const start = $(`.tp-slot[data-time="${input.value}"]:not(:disabled)`, box)
        || enabled().find(b => b.dataset.time >= '06:00') || enabled()[0];
      if (start) { box.scrollTop = Math.max(0, start.offsetTop - box.clientHeight / 2); focusSlot(start); }
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
    box.addEventListener('click', e => {
      const b = e.target.closest('.tp-slot');
      if (!b || b.disabled) return;
      set(b.dataset.time, true); closePop();
    });
    box.addEventListener('keydown', e => {
      const list = enabled(), i = list.indexOf(document.activeElement);
      const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -4, ArrowDown: 4 }[e.key];
      if (step) { e.preventDefault(); focusSlot(list[Math.min(list.length - 1, Math.max(0, i + step))]); }
      else if (e.key === 'Home') { e.preventDefault(); focusSlot(list[0]); }
      else if (e.key === 'End') { e.preventDefault(); focusSlot(list[list.length - 1]); }
    });
    pop.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closePop(); } });   // don't close the sheet
    document.addEventListener('pointerdown', e => { if (!pop.hidden && !wrap.contains(e.target)) closePop(false); });
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
  }));
  $$('input[name=preferredContact]', f).forEach(r => r.addEventListener('change', () => {
    draft.preferredContact = r.value; setError('preferredContact', ''); syncMethodHints();
  }));
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
    $('#hint-mobile').textContent = draft.preferredContact === 'whatsapp'
      ? 'Your WhatsApp number, with country code.' : 'Include your country code.';
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
      if (!validateField('fullName')) bad.push(f.elements.fullName);
      if (!validateField('mobile')) bad.push(f.elements.mobile);
      if (!validateField('email')) bad.push(f.elements.email);
      if (!draft.preferredContact) { setError('preferredContact', 'Choose a contact method.'); bad.push($('input[name=preferredContact]', f)); }
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
    const dl = el('dl');
    [['Name', draft.fullName], ['Mobile', draft.mobile], ['Email', draft.email]].forEach(([k, v]) => {
      const row = el('div'); const dd = el('dd', v.trim() ? '' : 'empty');
      dd.append(v.trim() ? (k === 'Email' ? breakable(v.trim()) : v.trim()) : 'Not given');
      row.append(el('dt', null, k), dd); dl.append(row);
    });
    group('Contact details', 3, dl);
    group('Preferred contact', 3, val(METHODS[draft.preferredContact]));
    group(care || draft.inquiryType === 'appointment' ? 'Additional details' : 'Message', 2, val(draft.message.trim(), 'None added'));
  }

  function renderConfirmation(rec) {
    const fu = $('#followup');
    const how = draft.preferredContact === 'email' ? draft.email.trim() : draft.mobile.trim();
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
