# Supabase Ecommerce Starter (Beginner Friendly)

This guide creates a simple ecommerce backend in Supabase:
- `products` table (storefront catalog)
- `users` table (basic customer profiles)
- `orders` table (order records)
- atomic order RPC (creates order + reduces stock)

## 1) Create schema

1. Open Supabase Dashboard → **SQL Editor**
2. Choose one:
   - Single-product checkout (simple): `docs/supabase-ecommerce-starter.sql`
   - Cart checkout + required fields (Aaruni Tech): `docs/supabase-ecommerce-orders-v2.sql`

## 2) Add products

Supabase Dashboard → **Table Editor** → `products` → **Insert row**:
- If using the Aaruni Tech website cart, set `id` to match the website product IDs (examples: `power-bank-pro`, `fast-charger`)
- `product_name`: Example “Power Bank”
- `price`: Example `1799`
- `image_url`: optional
- `stock`: Example `50`
- `description`: optional

## 3) Connect your frontend (safe keys only)

Put these in `supabase-config.js`:
- `window.SUPABASE_URL`
- `window.SUPABASE_ANON_KEY`

Never ship the Supabase **service role** key in a frontend repo.

## 4) Frontend functions (ready to use)

This repo includes:
- `ecommerce-backend.js` (Supabase calls)
- `ecommerce-frontend.js` (cart + checkout helpers)

The Aaruni Tech checkout uses `supabase-backend.js` and will automatically call the cart RPC (`place_order_cart`) when it exists.

### Example usage

Load scripts:
- `supabase-config.js`
- `ecommerce-backend.js` (module)
- `ecommerce-frontend.js`

Then in JS:
- `EcommerceFrontend.addToCart({ productId, quantity })`
- `EcommerceFrontend.checkout({ productId, quantity, customerName, customerEmail })`
- `EcommerceFrontend.buildOrderConfirmationText(order)`

## 5) Backend dashboard note

With the starter RLS policies, **anon users cannot read orders**, so a real admin dashboard should be one of:
- Supabase Auth + admin-only RLS policies, or
- Supabase Edge Function / server API using service role key (recommended for startups)

This repo includes a demo page `admin-orders.html`, but it will show an RLS warning until you add a secure admin approach.
