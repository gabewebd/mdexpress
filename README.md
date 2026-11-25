# MedX landing page (prototype)

One-page website for MedX, the healthcare brand of MedExpress Medical and Diagnostic Center, Boracay.
Static HTML, CSS and vanilla JavaScript. No build step, no backend, no dependencies.

## Run it

Open `index.html` in a browser, or serve the folder (recommended, so fonts and links behave as they will online):

```
cd website
python -m http.server 5180
# then open http://127.0.0.1:5180/
```

## Files

```
index.html                 all sections, the three contact overlays, the shared SVG defs (symbol, masks, icons)
css/styles.css             the only stylesheet: tokens (:root), sections, overlays, motion, breakpoints,
                           then the Contact Us form (dialog.mxf)
js/main.js                 the only script, in sections that each run only where their markup is:
                           1 inquiry data + GHL webhook, 2 Contact Us form, 3 landing page
assets/brand/              MedExpress logo (original + reversed) and the symbol favicon
assets/svg/                MedX symbol set: illuminated (cover treatment), navy, ivory, single quadrant
assets/icons/              the 1.5px line icon family (also inlined in index.html as a sprite)
assets/images/             PLACEHOLDER photography (see below)
assets/fonts/              Newsreader (display) and Instrument Sans (UI), self-hosted
```

## Replacing the placeholder photos

Every photo is free-licence Unsplash or Pexels stock, graded to one warm, soft treatment, and named `placeholder-*.jpg`.
None of them shows MedX staff or facilities. Replace them with MedX photography using the same file names
(or update the `src` in `index.html`). The origin is also embedded in each JPEG's comment field.

| File | Where it's used | Origin |
|---|---|---|
| `hero-nurse.webp` | Hero, right side: nurse in navy scrubs, from the client's Firefly.png, light-blue scrubs (transparent WebP, 461×744), in front of the glowing MedX cross on navy. AI-generated image supplied by the client team, so not a real MedX nurse. A larger original (about 1000px wide or more) would look sharper on retina screens | client team (AI-generated) |
| `placeholder-hotel-visit-room.jpg` | Services, Hotel visits (square, one fully rounded corner) | unsplash.com/photos/7ZD_JIwl410 |
| `placeholder-urgent-care-consultation.jpg` | Services, Urgent care (square, one fully rounded corner) | unsplash.com/photos/XdErxxR6Xog |
| `medexpress-clinic-storefront.jpg` | Boracay section (#why-medx), full width: the real MedExpress storefront | client team |

## Contact details

- Mobile (call, text, WhatsApp): +63 969 479 1691 (0969 479 1691). `tel:` / `sms:` / `wa.me` links are live.
- Mobile 2 (call): +63 918 926 3112 (0918 926 3112).
- Landline (call only): +63 36 288 6357 ((036) 288-6357).
- Clinic: Nirvana Resort, Balabag, Boracay (across Watsons). Open 24 hours, Monday to Sunday.
  Map: https://maps.app.goo.gl/uoZ6sVfWBKVU8GMU9 (resolves to the "MedExpress Medical And Diagnostic Center" Google Maps pin).
  The footer embeds a keyless Google Maps iframe at that pin (11.9617764, 121.9272301).
- Messenger / Facebook: https://www.facebook.com/MedExpressHealth (footer chip and the Message overlay row).

## CRM (GoHighLevel) integration

Nothing is sent anywhere. The form builds one record (`buildRecord` in `js/main.js`, section 1) and hands it to
`MedXInquiry.submit(record)`, which currently waits 900 ms and resolves. Replace the body of `submit()` with the
GHL call (webhook or inbound-lead endpoint); it must resolve on success and reject on failure, and the form already
shows the error path. Record fields (same as the prototype): source, inquiry_type (questionnaire names), service_interest, care_for,
preferred_timing, preferred_date, preferred_time, booking_status, full_name, mobile, email, preferred_contact,
location, message, consent_to_contact, created_at. Don't add medical-history fields.

The Contact Us form is ported from `prototype/src/medx-inquiry-prototype.src.html`: markup in `#dlg-contact`,
styles in the Contact Us section of `css/styles.css` (scoped to `dialog.mxf`; clashing class names carry an `f-` prefix),
behaviour in section 2 of `js/main.js`. Section 3 (the site's overlay code) opens and closes it and calls `window.MedXForm`.

## Not invented

No testimonials, credentials, response times, prices or coverage areas appear on the page. The clinic address,
hours, phone numbers and map pin were supplied by the user (2026-11-23).
Add them only when MedX confirms them.
