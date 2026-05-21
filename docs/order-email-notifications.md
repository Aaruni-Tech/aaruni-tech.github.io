# Production order email notifications

Checkout sends the admin email through a Supabase Edge Function named `send-order-notification`.
The frontend invokes it only after Razorpay succeeds and Supabase order save returns `ok: true`.

## Required setup

1. Run `docs/supabase-production-schema-fix.sql` in the Supabase SQL Editor.
   - This creates `public.order_email_notifications`.
   - It also reloads the PostgREST schema cache.
2. Create and verify a sender domain in Resend.
3. Set Edge Function secrets in Supabase:

```sh
supabase secrets set \
  RESEND_API_KEY="re_xxxxxxxxx" \
  RESEND_FROM_EMAIL="Aaruni Tech <orders@your-verified-domain.com>" \
  ORDER_NOTIFICATION_TO_EMAIL="tech.aaruni@gmail.com" \
  --project-ref cnsmgxgkxgbeumnvidpk
```

4. Deploy the function:

```sh
supabase functions deploy send-order-notification --project-ref cnsmgxgkxgbeumnvidpk
```

The function also needs Supabase's built-in `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`
environment variables. Do not put the Resend API key or Supabase service role key in frontend
JavaScript.

## Duplicate prevention

The Edge Function uses:

- `public.order_email_notifications.idempotency_key` with a unique constraint.
- Resend's `Idempotency-Key` request header.
- Browser localStorage as a client-side fast path after the function accepts a notification.

Refreshing the order page or retrying the same checkout result should not send another email.

## Verification

After deployment, complete a real checkout and confirm:

- A row is inserted into `public.orders`.
- A row is inserted into `public.order_email_notifications` with `status = 'sent'`.
- The email arrives at `tech.aaruni@gmail.com`.
- Browser console shows `[OrderEmail] Admin notification accepted` and no new errors.
