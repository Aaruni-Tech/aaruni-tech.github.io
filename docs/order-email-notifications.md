# Production order email notifications

Checkout sends the admin email and the customer confirmation email through a Supabase Edge Function named `send-order-notification`.
The frontend invokes it only after Razorpay succeeds and Supabase order save returns `ok: true`.
Development/TEST checkout uses the same Supabase Edge Function so test Razorpay orders verify the real email, retry, and idempotency path.

## Required setup

1. Run `docs/supabase-production-schema-fix.sql` in the Supabase SQL Editor for both active projects:
   - TEST/DEV: `cnsmgxgkxgbeumnvidpk`
   - PROD: `fxoofgnhbvquenbfhdec`
   - This creates `public.order_email_notifications`.
   - It creates temporary `public.checkout_debug_logs` for failing checkout steps.
   - It adds `email_type` and `sent_at` for retry-safe admin/customer email logs.
   - It adds `orders.db_saved`, `orders.admin_email_sent`, `orders.customer_email_sent`, and their sent timestamp fields.
   - It also reloads the PostgREST schema cache.
2. Create and verify a sender domain in Resend.
   - Do not use `onboarding@resend.dev` for production order mail. It is a Resend test sender and delivery is limited to the email address on the Resend account.
   - Use a sender from your verified domain, for example `Aaruni Tech <orders@your-verified-domain.com>`.
3. Set Edge Function secrets in Supabase:

```sh
supabase secrets set \
  RESEND_API_KEY="re_xxxxxxxxx" \
  RESEND_FROM_EMAIL="Aaruni Tech <orders@your-verified-domain.com>" \
  ORDER_NOTIFICATION_TO_EMAIL="tech.aaruni@gmail.com" \
  --project-ref cnsmgxgkxgbeumnvidpk
```

4. Deploy the function with the public invocation flag so the browser can call it after payment:

```sh
supabase functions deploy send-order-notification \
  --project-ref cnsmgxgkxgbeumnvidpk \
  --use-api \
  --no-verify-jwt
```

Repeat the same secrets/deploy commands with `--project-ref fxoofgnhbvquenbfhdec` before enabling production mode. Keep TEST anon keys with the TEST URL and PROD anon keys with the PROD URL; never reuse service role keys in browser JavaScript.

The function also needs Supabase's built-in `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`
environment variables. Do not put the Resend API key or Supabase service role key in frontend
JavaScript.

## Duplicate prevention

The Edge Function uses:

- `public.order_email_notifications.idempotency_key` with a unique constraint.
- Separate idempotency keys for `admin` and `customer` email types.
- Resend's `Idempotency-Key` request header.
- Browser localStorage as a client-side fast path only after both emails are complete.

Refreshing the order page or retrying the same checkout result should not send another email.

## Verification

After deployment, complete a real checkout and confirm:

- A row is inserted into `public.orders`.
- Two rows are inserted into `public.order_email_notifications` with `email_type in ('admin', 'customer')` and `status = 'sent'`.
- `public.orders.db_saved = true`, `admin_email_sent = true`, and `customer_email_sent = true` for the order.
- The admin email arrives at `tech.aaruni@gmail.com`.
- The customer confirmation email arrives at the checkout email address.
- Edge Function logs show `[Email] Function called`, `[Email] Sending admin notification`, `[Email] Resend response`, `[ADMIN EMAIL SENT]`, `[CUSTOMER EMAIL SENT]`, and `[Email] Success`.
- Browser console shows `[ORDER SAVED]`, `[Edge Function invoke]`, `[ADMIN EMAIL SENT]`, `[CUSTOMER EMAIL SENT]`, and no `[SUPABASE INSERT FAILED]` or `[EMAIL FAILED]` entries.
- If anything fails, `public.checkout_debug_logs` contains the failing `step`, `payload`, and exact `error` object.

Useful production checks:

```sh
supabase functions list --project-ref cnsmgxgkxgbeumnvidpk
supabase secrets list --project-ref cnsmgxgkxgbeumnvidpk
supabase functions list --project-ref fxoofgnhbvquenbfhdec
supabase secrets list --project-ref fxoofgnhbvquenbfhdec
```

For runtime logs, open the Supabase Dashboard for the project and inspect
`Edge Functions > send-order-notification > Logs`.
