# Aaruni Tech Ecommerce Landing Website

Aaruni Tech is a static marketplace-style ecommerce website for GitHub Pages. It uses plain HTML, CSS, and JavaScript to present a modern Indian tech storefront with category browsing, product search, a browser-based cart, Razorpay Checkout, a deal section, trust messaging, and footer policy links.

The site is designed for `https://aaruni-tech.github.io`. The storefront remains static, while production order persistence and admin email notifications use Supabase. The cart is saved in the visitor's browser with `localStorage` and is sent to Razorpay only when the visitor opens checkout.

For payment alerts, use the Google Apps Script webhook in `docs/razorpay-gmail-webhook.gs` and point Razorpay webhook events at it. That path can email `tech.aaruni@gmail.com` when a payment is captured.

Checkout reads the active Razorpay public key ID from `aaruni-config.js`. Do not put the Razorpay key secret in this repository, `index.html`, `script.js`, or any other frontend file; the secret belongs only in Razorpay, Apps Script properties, or a private backend/serverless function.

For production checkout, move order creation and payment signature verification to a backend or serverless function before fulfilling orders. Client-side amounts can be edited by visitors, so Razorpay dashboard/webhook confirmation should be treated as the source of truth.

Production admin order emails are sent through the Supabase Edge Function in `supabase/functions/send-order-notification`. Configure it with Resend using `docs/order-email-notifications.md`; do not put Resend or Supabase service-role secrets in frontend JavaScript.

## Environment Switching

All browser-safe environment settings live in `aaruni-config.js`.

Switch modes with the single toggle near the top of that file:

```js
const ENV = "development";
```

- `development`: Supabase DEV config, Razorpay test key, test products, and EmailJS testing templates.
- `production`: Supabase PROD config, Razorpay live key ID, production products, and real order emails through the Supabase Edge Function.

Fill the DEV Supabase values, EmailJS testing IDs, and Razorpay live key ID before relying on those paths.

Only public values are allowed in `aaruni-config.js`: Supabase URL, Supabase anon/publishable key, Razorpay key ID, and EmailJS public IDs. Never add Supabase service-role keys, Razorpay key secrets, Resend API keys, webhook secrets, or other private credentials to this GitHub Pages repo.

## How to Run Locally

Open `index.html` directly in your browser, or run a simple local static server from the project folder:

```bash
python3 -m http.server 8000
```

Then visit:

```text
http://localhost:8000
```

## GitHub Pages Deployment

For the repository `aaruni-tech.github.io`, GitHub Pages can serve this site directly from the repository root. Make sure these files are committed to the default branch:

- `index.html`
- `aaruni-config.js`
- `supabase-config.js`
- `emailjs-config.js`
- `supabase-backend.js`
- `email.js`
- `order.js`
- `my-orders.js`
- `styles.css`
- `script.js`
- `pwa.js`
- `sw.js`
- `manifest.webmanifest`
- `version.json`
- `icons/icon-192.png`
- `icons/icon-512.png`
- `icons/apple-touch-icon.png`
- `README.md`
- `privacy-policy.html`
- `refund-policy.html`
- `shipping-policy.html`
- `terms-and-conditions.html`
- `contact-us.html`
- `about-us.html`
- `docs/razorpay-gmail-webhook.gs`
- `docs/razorpay-gmail-webhook.md`

Once Pages is enabled, the website should be available at:

```text
https://aaruni-tech.github.io
```

## PWA Versioning

The site is installable as a PWA on supported mobile browsers. Android Chrome shows the native install prompt when the browser confirms the site is installable; iOS Safari shows an in-site prompt with Add to Home Screen instructions.

When shipping website changes that installed app users should receive, bump the version in all three files:

- `version.json`
- `pwa.js`
- `sw.js`

The installed app checks `version.json` on open. If the stored version differs, the site shows an update prompt and asks the service worker to activate the new cached version.

## Future Improvements

- Add real product images and brand photography.
- Add dedicated category pages.
- Add product detail pages.
- Add real customer accounts with authentication.
- Add an admin dashboard for product uploads and order management.
- Add a seller portal for third-party sellers.
- Add secure checkout, payments, invoices, shipping, and refunds.
- Add accessibility testing and browser compatibility checks.
- Connect a backend or ecommerce platform only when real orders are needed.

## Supabase Orders (Optional)

If you want server-backed order history + tracking timelines, configure Supabase and create the required tables described in `docs/supabase-orders.md`. This repo intentionally keeps secrets out of the frontend; for production customer-data privacy, add Supabase Auth or an Edge Function with proper RLS policies.

## Supabase Ecommerce Starter (Optional)

For a minimal startup-style catalog + orders backend (with stock reduction), use:
- `docs/supabase-ecommerce-starter.sql`
- `docs/supabase-ecommerce-orders-v2.sql` (cart checkout + admin-order fields)
- `docs/supabase-ecommerce-setup.md`

If you see Supabase 400/404 errors about missing columns/functions/tables during checkout, run:
- `docs/supabase-production-schema-fix.sql`
