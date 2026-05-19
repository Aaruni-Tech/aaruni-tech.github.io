-- Aaruni Tech: ecommerce orders v2 (cart + stock reduction)
-- Run in Supabase Dashboard → SQL Editor.
-- This creates:
--  - `products` table (if missing)
--  - `users` table (basic customer profiles)
--  - `orders` table (as requested)
--  - `place_order_cart()` RPC to insert order + reduce stock atomically
--
-- IMPORTANT: For an admin dashboard, do NOT open `orders` SELECT to anon.
-- Use Supabase Auth + admin policies, or an Edge Function/server using service role.

create extension if not exists "pgcrypto";

-- Products catalog (used for stock reduction).
create table if not exists public.products (
  id text primary key,
  created_at timestamptz not null default now(),
  product_name text not null,
  price numeric not null check (price >= 0),
  image_url text,
  stock int not null default 0 check (stock >= 0),
  description text
);

-- Users table (basic profiles captured from checkout/account form).
-- NOTE: This is NOT Supabase Auth. It’s just a simple table for storing customer details.
create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  full_name text not null,
  email text,
  phone text,
  shipping_address text
);

create index if not exists idx_users_created_at on public.users(created_at desc);
create index if not exists idx_users_email on public.users(email);
create index if not exists idx_users_phone on public.users(phone);

-- Orders table (exact fields requested)
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  customer_name text not null,
  customer_email text,
  phone text,
  product_name text not null,
  quantity int not null check (quantity > 0),
  total_price numeric not null check (total_price >= 0),
  shipping_address text,
  payment_status text not null default 'Paid',
  order_status text not null default 'Order Confirmed',
  order_id text not null unique
);

create index if not exists idx_orders_created_at on public.orders(created_at desc);
create index if not exists idx_orders_order_id on public.orders(order_id);
create index if not exists idx_products_created_at on public.products(created_at desc);

-- RPC: place order for a cart (multiple items)
-- p_items example:
--   [{"product_id":"power-bank-pro","quantity":2},{"product_id":"fast-charger","quantity":1}]
create or replace function public.place_order_cart(
  p_customer_name text,
  p_customer_email text,
  p_phone text,
  p_shipping_address text,
  p_items jsonb,
  p_payment_status text
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item record;
  v_product record;
  v_total numeric := 0;
  v_total_qty int := 0;
  v_products_text text := '';
  v_order public.orders;
  v_order_id text;
  v_qty int;
  v_product_id text;
begin
  if p_customer_name is null or length(trim(p_customer_name)) = 0 then
    raise exception 'customer_name is required';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'items must be a non-empty json array';
  end if;

  -- Generate unique human-friendly order ID (no secrets).
  v_order_id :=
    'AT-' ||
    to_char(now() at time zone 'Asia/Kolkata', 'YYYYMMDD') ||
    '-' ||
    upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));

  for v_item in
    select
      (value->>'product_id')::text as product_id,
      (value->>'quantity')::int as quantity
    from jsonb_array_elements(p_items)
  loop
    v_product_id := coalesce(v_item.product_id, '');
    v_qty := coalesce(v_item.quantity, 0);

    if v_product_id = '' then
      raise exception 'item product_id is required';
    end if;

    if v_qty <= 0 then
      raise exception 'item quantity must be > 0';
    end if;

    -- Lock the product row for atomic stock decrement.
    select id, product_name, price, stock
    into v_product
    from public.products
    where id = v_product_id
    for update;

    if not found then
      raise exception 'product not found: %', v_product_id;
    end if;

    if v_product.stock < v_qty then
      raise exception 'insufficient stock for % (available %, requested %)', v_product.product_name, v_product.stock, v_qty;
    end if;

    update public.products
    set stock = stock - v_qty
    where id = v_product_id;

    v_total := v_total + (v_product.price * v_qty);
    v_total_qty := v_total_qty + v_qty;

    if v_products_text = '' then
      v_products_text := v_product.product_name || ' x ' || v_qty;
    else
      v_products_text := v_products_text || ', ' || v_product.product_name || ' x ' || v_qty;
    end if;
  end loop;

  insert into public.orders (
    customer_name,
    customer_email,
    phone,
    product_name,
    quantity,
    total_price,
    shipping_address,
    payment_status,
    order_status,
    order_id
  )
  values (
    trim(p_customer_name),
    nullif(trim(coalesce(p_customer_email, '')), ''),
    nullif(trim(coalesce(p_phone, '')), ''),
    nullif(trim(coalesce(v_products_text, '')), ''),
    v_total_qty,
    v_total,
    nullif(trim(coalesce(p_shipping_address, '')), ''),
    nullif(trim(coalesce(p_payment_status, 'Paid')), ''),
    'Order Confirmed',
    v_order_id
  )
  returning * into v_order;

  return v_order;
end;
$$;

revoke all on function public.place_order_cart(text, text, text, text, jsonb, text) from public;
grant execute on function public.place_order_cart(text, text, text, text, jsonb, text) to anon;

-- RLS policies
alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.users enable row level security;

-- Storefront: allow reading products
drop policy if exists "public_read_products" on public.products;
create policy "public_read_products"
on public.products
for select
to anon
using (true);

-- Lock down product writes from the browser (stock changes only via RPC)
drop policy if exists "no_write_products_anon" on public.products;
create policy "no_write_products_anon"
on public.products
as restrictive
for all
to anon
using (false)
with check (false);

-- Allow inserting orders only via RPC / insert (select remains blocked)
drop policy if exists "public_insert_orders" on public.orders;
create policy "public_insert_orders"
on public.orders
for insert
to anon
with check (true);

-- Do not allow public reads of orders (admin must use secure method)
drop policy if exists "no_read_orders_anon" on public.orders;
create policy "no_read_orders_anon"
on public.orders
as restrictive
for select
to anon
using (false);

-- Users: allow inserts (so checkout can save the profile), but block public reads by default.
drop policy if exists "public_insert_users" on public.users;
create policy "public_insert_users"
on public.users
for insert
to anon
with check (true);

drop policy if exists "no_read_users_anon" on public.users;
create policy "no_read_users_anon"
on public.users
as restrictive
for select
to anon
using (false);
