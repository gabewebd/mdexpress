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

const draft = {
  service: '', inquiryType: '', productService: '', location: '',
  timing: 'asap', prefDate: '', prefTime: '',
  fullName: '', mobile: '', email: '', preferredContact: '',
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
  booking_status: 'Booking status', full_name: 'Full name', mobile: 'Mobile', email: 'Email',
  preferred_contact: 'Preferred contact', location: 'Location', message: 'Message',
  consent_to_contact: 'Consent', created_at: 'Created'
};

/* ---------------- Validation ---------------- */
const digitsOf = v => (v || '').replace(/\D/g, '');
const V = {
  fullName(v) { return v.trim() ? '' : 'Enter your name.'; },
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
  draft, buildRecord, webhookPayload, submit, outbox, thankYouUrl
};
})();
