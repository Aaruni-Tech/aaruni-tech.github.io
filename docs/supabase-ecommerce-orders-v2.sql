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
  product_id text,
  slug text,
  price numeric not null check (price >= 0),
  image_url text,
  stock int not null default 0 check (stock >= 0),
  description text
);

alter table public.products add column if not exists product_id text;
alter table public.products add column if not exists slug text;

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
  order_at timestamptz not null default now(),
  customer_name text not null,
  customer_email text,
  phone text,
  product_name text not null,
  quantity int not null check (quantity > 0),
  subtotal numeric not null default 0,
  total_price numeric not null check (total_price >= 0),
  total_amount numeric not null default 0,
  products jsonb not null default '[]'::jsonb,
  cart_items jsonb not null default '[]'::jsonb,
  shipping_address text,
  payment_id text,
  payment_status text not null default 'Paid',
  order_status text not null default 'Order Confirmed',
  status text not null default 'Order Confirmed',
  currency text not null default 'INR',
  order_id text not null unique
);

alter table public.orders add column if not exists order_at timestamptz not null default now();
alter table public.orders add column if not exists subtotal numeric not null default 0;
alter table public.orders add column if not exists total_amount numeric not null default 0;
alter table public.orders add column if not exists products jsonb not null default '[]'::jsonb;
alter table public.orders add column if not exists cart_items jsonb not null default '[]'::jsonb;
alter table public.orders add column if not exists payment_id text;
alter table public.orders add column if not exists status text not null default 'Order Confirmed';
alter table public.orders add column if not exists currency text not null default 'INR';

create index if not exists idx_orders_created_at on public.orders(created_at desc);
create index if not exists idx_orders_order_id on public.orders(order_id);
create index if not exists idx_products_created_at on public.products(created_at desc);

-- RPC cleanup + canonical production checkout function.
do $$
declare
  v_function text;
begin
  for v_function in
    select p.oid::regprocedure::text
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'place_order_cart'
  loop
    execute format('drop function if exists %s', v_function);
  end loop;
end $$;

create or replace function public.place_order_cart(
  p_customer_email text,
  p_customer_name text,
  p_order_id text,
  p_payment_id text,
  p_payment_status text,
  p_phone text,
  p_products jsonb,
  p_shipping_address text,
  p_total_amount numeric
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item record;
  v_product record;
  v_products_text text := '';
  v_products_json jsonb := '[]'::jsonb;
  v_total_qty int := 0;
  v_qty int;
  v_product_id text;
  v_item_name text;
  v_unit_price numeric;
  v_line_total numeric;
  v_computed_total numeric := 0;
  v_order_total numeric := 0;
  v_order public.orders;
begin
  if p_customer_name is null or length(trim(p_customer_name)) = 0 then
    raise exception 'customer_name is required';
  end if;

  if p_products is null or jsonb_typeof(p_products) <> 'array' or jsonb_array_length(p_products) = 0 then
    raise exception 'products must be a non-empty json array';
  end if;

  for v_item in
    select
      coalesce(value->>'product_id', value->>'id')::text as product_id,
      coalesce((value->>'quantity')::int, 0) as quantity,
      coalesce(value->>'name', '')::text as name,
      coalesce((value->>'price')::numeric, 0) as price,
      coalesce((value->>'line_total')::numeric, 0) as line_total
    from jsonb_array_elements(p_products)
  loop
    v_product_id := coalesce(v_item.product_id, '');
    v_qty := coalesce(v_item.quantity, 0);
    v_item_name := nullif(trim(coalesce(v_item.name, '')), '');
    v_unit_price := coalesce(v_item.price, 0);
    v_line_total := coalesce(v_item.line_total, v_unit_price * v_qty);

    if v_product_id = '' then
      raise exception 'product_id is required';
    end if;
    if v_qty <= 0 then
      raise exception 'quantity must be > 0';
    end if;

    select ctid as row_ctid, id::text as id_text, product_id, slug, product_name, price, stock
    into v_product
    from public.products
    where id::text = v_product_id
       or product_id = v_product_id
       or slug = v_product_id
    order by
      case
        when id::text = v_product_id then 0
        when product_id = v_product_id then 1
        when slug = v_product_id then 2
        else 3
      end
    limit 1
    for update;

    if found then
      update public.products
      set stock = greatest(stock - v_qty, 0)
      where ctid = v_product.row_ctid;

      v_item_name := coalesce(nullif(v_product.product_name, ''), v_item_name, v_product_id);
      if v_unit_price = 0 then
        v_unit_price := coalesce(v_product.price, 0);
      end if;
      if v_line_total = 0 then
        v_line_total := v_unit_price * v_qty;
      end if;
    else
      v_item_name := coalesce(v_item_name, v_product_id);
    end if;

    v_total_qty := v_total_qty + v_qty;
    v_computed_total := v_computed_total + v_line_total;
    v_products_text := concat_ws(', ', nullif(v_products_text, ''), v_item_name || ' x ' || v_qty);
    v_products_json := v_products_json || jsonb_build_array(jsonb_build_object(
      'product_id', v_product_id,
      'name', v_item_name,
      'quantity', v_qty,
      'price', v_unit_price,
      'line_total', v_line_total
    ));
  end loop;

  v_order_total := coalesce(nullif(p_total_amount, 0), v_computed_total, 0);

  insert into public.orders (
    created_at,
    order_at,
    customer_name,
    customer_email,
    phone,
    product_name,
    quantity,
    subtotal,
    total_price,
    total_amount,
    products,
    cart_items,
    shipping_address,
    payment_id,
    payment_status,
    order_status,
    status,
    currency,
    order_id
  )
  values (
    now(),
    now(),
    trim(p_customer_name),
    nullif(trim(coalesce(p_customer_email, '')), ''),
    nullif(trim(coalesce(p_phone, '')), ''),
    nullif(trim(coalesce(v_products_text, '')), ''),
    v_total_qty,
    v_order_total,
    v_order_total,
    v_order_total,
    v_products_json,
    v_products_json,
    nullif(trim(coalesce(p_shipping_address, '')), ''),
    nullif(trim(coalesce(p_payment_id, '')), ''),
    nullif(trim(coalesce(p_payment_status, 'Paid')), ''),
    'Order Confirmed',
    'Order Confirmed',
    'INR',
    coalesce(nullif(trim(p_order_id), ''), 'AT-' || to_char(now() at time zone 'Asia/Kolkata', 'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)))
  )
  returning * into v_order;

  return v_order;
end;
$$;

revoke all on function public.place_order_cart(text, text, text, text, text, text, jsonb, text, numeric) from public;
grant execute on function public.place_order_cart(text, text, text, text, text, text, jsonb, text, numeric) to anon;
grant execute on function public.place_order_cart(text, text, text, text, text, text, jsonb, text, numeric) to authenticated;

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
