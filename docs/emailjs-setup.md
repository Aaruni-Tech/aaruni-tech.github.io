# EmailJS order email setup

This project uses EmailJS for development/testing order emails from GitHub Pages.
Production order emails use the Supabase Edge Function described in `docs/order-email-notifications.md`.

## Files

- `email.js` - EmailJS configuration, buyer email send, seller email send, and template variables.
- `order.js` - order object creation, localStorage order history, status tracking, and invoice download.
- `docs/emailjs-buyer-template.html` - buyer template sample.
- `docs/emailjs-seller-template.html` - seller/admin template sample.

## Dashboard setup

1. Create or open your EmailJS account.
2. Add an email service, for example Gmail.
3. Create two templates:
   - Buyer order confirmation
   - Seller new order alert
4. Copy the buyer template HTML from `docs/emailjs-buyer-template.html`.
5. Copy the seller template HTML from `docs/emailjs-seller-template.html`.
6. In the `development.email` block in `aaruni-config.js`, set:

```js
publicKey: "YOUR_PUBLIC_KEY",
serviceId: "YOUR_SERVICE_ID",
buyerTemplateId: "YOUR_TESTING_TEMPLATE_ID",
sellerTemplateId: "YOUR_TESTING_TEMPLATE_ID",
```

7. In EmailJS account security settings, restrict the allowed origin to:

```text
https://aaruni-tech.github.io
```

## Template variables

Both templates receive these variables:

```text
{{order_id}}
{{invoice_number}}
{{order_date}}
{{order_time}}
{{order_timestamp}}
{{order_status}}
{{customer_name}}
{{customer_email}}
{{customer_phone}}
{{delivery_address}}
{{items_text}}
{{items_html}}
{{total_amount}}
{{subtotal_amount}}
{{payment_id}}
{{estimated_delivery_date}}
{{support_email}}
{{tracking_url}}
{{message_html}}
```

## Buyer template settings

- To Email: `{{to_email}}`
- To Name: `{{to_name}}`
- Subject: `Aaruni Tech order confirmed - {{order_id}}`
- Content: paste `docs/emailjs-buyer-template.html`

## Seller template settings

- To Email: `{{seller_email}}`
- To Name: `Aaruni Tech`
- Subject: `New Aaruni Tech order - {{order_id}}`
- Content: paste `docs/emailjs-seller-template.html`

## Testing

1. Set `const ENV = "development";` in `aaruni-config.js`.
2. Replace the development EmailJS placeholders in `aaruni-config.js`.
3. Open `index.html` locally or on GitHub Pages.
4. Sign up with name, email, phone, and delivery address.
5. Add a product to cart.
6. Complete Razorpay test checkout.
7. Check:
   - Buyer inbox receives the confirmation email.
   - Seller/admin inbox receives the new order alert.
   - Order appears in the account order history on the same browser.
   - Tracking link opens `track-order.html`.

## Common mistakes

- Leaving placeholder IDs in `aaruni-config.js`.
- Creating only one EmailJS template instead of buyer and seller templates.
- Forgetting to set the buyer template recipient to `{{to_email}}`.
- Forgetting to set the seller template recipient to `{{seller_email}}`.
- Expecting order history to sync across devices. It is stored in browser localStorage.
- Treating frontend EmailJS keys as private secrets. EmailJS public keys are visible in browser code, so use EmailJS origin restrictions and rate limits.
