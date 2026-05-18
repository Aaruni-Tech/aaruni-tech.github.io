# Firebase order + email system (Firestore + Functions)

This repo is a static GitHub Pages site. To get Amazon-style order emails + a real admin dashboard, order creation and payment verification must run on a backend. This implementation uses:

- Firebase Authentication (anonymous for customers, email/password for admin)
- Firestore (`orders`, `customers`, `payments`)
- Firebase Cloud Functions callable function `createOrderAfterPayment`
- Razorpay Payments API fetch-by-id verification
- EmailJS REST API (from Cloud Functions) for buyer + admin emails

## 1) Firebase setup

1. Create a Firebase project.
2. Enable Authentication providers:
   - Anonymous (customers)
   - Email/Password (admin)
3. Create a Web App in Firebase and copy the config into `firebase-config.js`.
4. Create Firestore in production mode.
5. Set Firestore rules to `firestore.rules`.

## 2) Functions config (secrets live in Firebase, not this repo)

Deploy the `functions/` directory with Firebase CLI. Before deploying, set config values:

```bash
firebase functions:config:set \
  razorpay.key_id="YOUR_RAZORPAY_KEY_ID" \
  razorpay.key_secret="YOUR_RAZORPAY_KEY_SECRET" \
  emailjs.service_id="YOUR_EMAILJS_SERVICE_ID" \
  emailjs.user_id="YOUR_EMAILJS_PUBLIC_KEY" \
  emailjs.access_token="YOUR_EMAILJS_PRIVATE_KEY" \
  emailjs.buyer_template_id="YOUR_BUYER_TEMPLATE_ID" \
  emailjs.seller_template_id="YOUR_SELLER_TEMPLATE_ID" \
  store.admin_email="tech.aaruni@gmail.com"
```

Then deploy:

```bash
firebase deploy --only functions
```

## 3) EmailJS templates

Use the same variables described in `docs/emailjs-setup.md`.

Important: In this implementation, the function sends fully-rendered HTML in `{{message_html}}`:

- Buyer email subject: `Your Aaruni Tech Order is Confirmed - {{order_id}}`
- Seller email subject: `New Aaruni Tech order - {{order_id}}`

## 4) Prevent duplicate orders

The Cloud Function uses `payments/{paymentId}` as an idempotency key. If the payment already exists, it returns the existing order instead of creating a duplicate.

## 5) Admin dashboard

Open `admin-orders.html` and sign in with an admin account (Email/Password).

### Making a user admin

Firestore rules expect a Firebase Auth **custom claim** `admin=true`.

Set it using the Admin SDK (example snippet):

```js
// Run in a trusted admin environment (not in the browser).
admin.auth().setCustomUserClaims(uid, { admin: true });
```

Once the user signs in again, the dashboard can read/update orders.

