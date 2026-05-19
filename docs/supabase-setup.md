# Supabase backend setup (Aaruni Tech)

This website is a static GitHub Pages site, so it uses the Supabase **anon** key from the browser. Do **not** use the `service_role` key in frontend code.

## 1) Create tables (SQL)

Open Supabase Dashboard → **SQL Editor** and run:

- `docs/supabase-schema.sql`

This creates:

- `customers`
- `orders`
- `order_items`

It also enables RLS and allows **insert-only** from the browser (no reads/updates).

## 2) Configure frontend keys

Edit:

- `supabase-config.js`

Set:

- `window.SUPABASE_URL`
- `window.SUPABASE_ANON_KEY`

Get both from Supabase Dashboard → **Project Settings** → **API**.

## 3) Verify

1. Open `index.html`
2. Add items to cart
3. Complete Razorpay checkout (test mode)
4. Confirm you see a success toast after the order is saved
5. In Supabase, check table rows in **Table Editor**

