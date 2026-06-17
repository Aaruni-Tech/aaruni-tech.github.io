# Supabase Order Management

This site saves paid orders from the browser to Supabase after the customer logs in with Supabase Auth. Persistent order history is linked by `public.orders.user_id = auth.users.id`.

For the current production schema, run:

- `docs/supabase-production-schema-fix.sql` for the base ecommerce/order tables.
- `docs/supabase-auth-order-history.sql` for Supabase Auth profiles, `orders.user_id`, and customer-only RLS.

## Tables expected by the frontend

Create these tables (names must match exactly):

### `customer_profiles`
- `id` (uuid, primary key, references `auth.users.id`)
- `full_name` (text, not null)
- `email` (text, not null)
- `phone` (text, nullable)
- `address` (text, nullable)
- `address_parts` (jsonb, not null, default `'{}'::jsonb`)
- `created_at` / `updated_at`

### `orders`
- `id` (uuid, primary key, default `gen_random_uuid()`)
- `user_id` (uuid, nullable during migration, references `auth.users.id`)
- `order_id` (text, unique, not null) — generated on the website (example: `AT-20260519-XXXXXXXX`)
- `customer_name`, `customer_email`, `phone`, `shipping_address`
- `payment_id` (text, not null, default `''`)
- `payment_status` (text, not null, default `'Paid'`)
- `order_status` / `status` — one of: `Order Confirmed`, `Packed`, `Shipped`, `Out for Delivery`, `Delivered`
- `subtotal` (numeric, not null, default `0`)
- `total_amount` (numeric, not null, default `0`)
- `currency` (text, not null, default `'INR'`)
- `order_at` (timestamptz, not null, default `now()`)
- `products` / `cart_items` (jsonb, not null, default `'[]'::jsonb`) — full item snapshot

## RLS note (important)

Because this is a static GitHub Pages site, there is **no private server** to keep secrets. Do not allow unrestricted anon reads on customer or order tables.

Recommended production approach:
- Require Supabase Auth before checkout.
- Grant order `select` only to authenticated customers where `orders.user_id = auth.uid()`.
- Keep admin reads behind a service-role Edge Function or a separate admin-only Supabase Auth policy.
