# Supabase Order Management (Frontend-only)

This site saves paid orders from the browser to Supabase using the **public anon key** (safe to ship). For real production usage, configure **Row Level Security (RLS)** so customer data is not publicly readable.

## Tables expected by the frontend

Create these tables (names must match exactly):

### `customers`
- `id` (uuid, primary key, default `gen_random_uuid()`)
- `name` (text, not null)
- `email` (text, nullable)
- `phone` (text, not null, default `''`)
- `address` (text, not null, default `''`)
- `address_parts` (jsonb, not null, default `'[]'::jsonb`)

### `orders`
- `id` (uuid, primary key, default `gen_random_uuid()`)
- `order_id` (text, unique, not null) — generated on the website (example: `AT-20260519-XXXXXXXX`)
- `customer_id` (uuid, not null, references `customers.id`)
- `payment_id` (text, not null, default `''`)
- `status` (text, not null) — one of: `Order Confirmed`, `Packed`, `Shipped`, `Out for Delivery`, `Delivered`
- `subtotal` (numeric, not null, default `0`)
- `total_amount` (numeric, not null, default `0`)
- `currency` (text, not null, default `'INR'`)
- `order_at` (timestamptz, not null, default `now()`)
- `cart_items` (jsonb, not null, default `'[]'::jsonb`) — full item snapshot

### `order_items`
- `id` (uuid, primary key, default `gen_random_uuid()`)
- `order_id` (uuid, not null, references `orders.id` on delete cascade)
- `product_id` (text, nullable)
- `name` (text, not null)
- `category` (text, not null, default `''`)
- `image` (text, not null, default `''`)
- `unit_price` (numeric, not null, default `0`)
- `quantity` (int, not null, default `1`)
- `line_total` (numeric, not null, default `0`)

### `order_status_events`
- `id` (uuid, primary key, default `gen_random_uuid()`)
- `order_id` (uuid, not null, references `orders.id` on delete cascade)
- `status` (text, not null)
- `at` (timestamptz, nullable) — optional explicit timestamp from client
- `created_at` (timestamptz, not null, default `now()`)

The site writes the initial status event after a successful payment, and reads these rows to render the tracking timeline on `my-orders.html` and `track-order.html`.

## RLS note (important)

Because this is a static GitHub Pages site, there is **no private server** to keep secrets. If you allow `select` on these tables for the anon role, anyone could read orders.

Recommended production approach:
- Keep inserts public (or protected), but do **not** allow unrestricted selects.
- Use Supabase Auth + per-user policies, or an Edge Function to securely fetch orders for a verified user.

