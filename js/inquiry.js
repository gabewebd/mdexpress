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
   Replace the body of submit() with the GHL call (for example a webhook or
   the inbound-lead endpoint) when the client approves the integration.
   It must resolve on success and reject with an Error on failure. */
const outbox = [];
function submit(record) {
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
  draft, buildRecord, submit, outbox
};
})();
