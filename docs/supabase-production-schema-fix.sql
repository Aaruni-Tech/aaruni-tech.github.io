-- Aaruni Tech - FINAL production-safe schema fix (idempotent)
-- Run in Supabase Dashboard → SQL Editor.
-- Fixes PostgREST schema mismatch errors (PGRST204/PGRST202/PGRST205) without deleting data.
-- Creates missing tables/columns, creates RPC `place_order_cart`, enables RLS, adds permissive insert policies,
-- grants RPC execute, reloads PostgREST schema cache, and includes verification queries.

begin;

create extension if not exists "pgcrypto";

-- 1) Required tables
create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now()
);

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now()
);

create table if not exists public.products (
  id text primary key,
  created_at timestamptz not null default now(),
  product_name text not null default '',
  price numeric not null default 0 check (price >= 0),
  stock int not null default 0 check (stock >= 0),
  image_url text,
  description text
);

-- 2) Required columns (additive only)
alter table public.users add column if not exists full_name text;
alter table public.users add column if not exists shipping_address text;
alter table public.users add column if not exists email text;
alter table public.users add column if not exists phone text;

alter table public.customers add column if not exists name text;
alter table public.customers add column if not exists email text;
alter table public.customers add column if not exists phone text;
alter table public.customers add column if not exists address text;
alter table public.customers add column if not exists address_parts jsonb not null default '[]'::jsonb;

alter table public.orders add column if not exists order_id text;
alter table public.orders add column if not exists customer_name text;
alter table public.orders add column if not exists customer_email text;
alter table public.orders add column if not exists phone text;
alter table public.orders add column if not exists product_name text;
alter table public.orders add column if not exists quantity int;
alter table public.orders add column if not exists total_price numeric;
alter table public.orders add column if not exists shipping_address text;
alter table public.orders add column if not exists payment_id text;
alter table public.orders add column if not exists payment_status text default 'Paid';
alter table public.orders add column if not exists order_status text default 'pending';

create unique index if not exists idx_orders_order_id_unique
on public.orders(order_id)
where order_id is not null;

-- 3) RPC for cart checkout (matches frontend payload exactly)
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
    created_at,
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
    now(),
    trim(p_customer_name),
    nullif(trim(coalesce(p_customer_email, '')), ''),
    nullif(trim(coalesce(p_phone, '')), ''),
    nullif(trim(coalesce(v_products_text, '')), ''),
    v_total_qty,
    v_total,
    nullif(trim(coalesce(p_shipping_address, '')), ''),
    nullif(trim(coalesce(p_payment_status, 'Paid')), ''),
    'pending',
    v_order_id
  )
  returning * into v_order;

  return v_order;
end;
$$;

revoke all on function public.place_order_cart(text, text, text, text, jsonb, text) from public;
grant execute on function public.place_order_cart(text, text, text, text, jsonb, text) to anon;
grant execute on function public.place_order_cart(text, text, text, text, jsonb, text) to authenticated;

-- Compatibility overload for the currently deployed production RPC signature.
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
  v_total_qty int := 0;
  v_qty int;
  v_product_id text;
  v_item_name text;
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
      coalesce(value->>'name', '')::text as name
    from jsonb_array_elements(p_products)
  loop
    v_product_id := coalesce(v_item.product_id, '');
    v_qty := coalesce(v_item.quantity, 0);
    v_item_name := coalesce(v_item.name, '');

    if v_product_id = '' then
      raise exception 'product_id is required';
    end if;
    if v_qty <= 0 then
      raise exception 'quantity must be > 0';
    end if;

    select id, product_name, stock
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

    v_total_qty := v_total_qty + v_qty;
    v_item_name := nullif(v_product.product_name, '');
    if v_item_name is null then
      v_item_name := v_product_id;
    end if;

    if v_products_text = '' then
      v_products_text := v_item_name || ' x ' || v_qty;
    else
      v_products_text := v_products_text || ', ' || v_item_name || ' x ' || v_qty;
    end if;
  end loop;

  insert into public.orders (
    created_at,
    customer_name,
    customer_email,
    phone,
    product_name,
    quantity,
    total_price,
    shipping_address,
    payment_id,
    payment_status,
    order_status,
    order_id
  )
  values (
    now(),
    trim(p_customer_name),
    nullif(trim(coalesce(p_customer_email, '')), ''),
    nullif(trim(coalesce(p_phone, '')), ''),
    nullif(trim(coalesce(v_products_text, '')), ''),
    v_total_qty,
    coalesce(p_total_amount, 0),
    nullif(trim(coalesce(p_shipping_address, '')), ''),
    nullif(trim(coalesce(p_payment_id, '')), ''),
    nullif(trim(coalesce(p_payment_status, 'Paid')), ''),
    'pending',
    coalesce(nullif(trim(p_order_id), ''), 'AT-' || to_char(now() at time zone 'Asia/Kolkata', 'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)))
  )
  returning * into v_order;

  return v_order;
end;
$$;

revoke all on function public.place_order_cart(text, text, text, text, text, text, jsonb, text, numeric) from public;
grant execute on function public.place_order_cart(text, text, text, text, text, text, jsonb, text, numeric) to anon;
grant execute on function public.place_order_cart(text, text, text, text, text, text, jsonb, text, numeric) to authenticated;

-- 4) RLS + permissive insert policies for checkout
alter table public.users enable row level security;
alter table public.customers enable row level security;
alter table public.orders enable row level security;
alter table public.products enable row level security;

drop policy if exists "public_insert_users" on public.users;
create policy "public_insert_users" on public.users for insert to anon with check (true);
drop policy if exists "auth_insert_users" on public.users;
create policy "auth_insert_users" on public.users for insert to authenticated with check (true);

drop policy if exists "public_insert_customers" on public.customers;
create policy "public_insert_customers" on public.customers for insert to anon with check (true);
drop policy if exists "auth_insert_customers" on public.customers;
create policy "auth_insert_customers" on public.customers for insert to authenticated with check (true);

drop policy if exists "public_insert_orders" on public.orders;
create policy "public_insert_orders" on public.orders for insert to anon with check (true);
drop policy if exists "auth_insert_orders" on public.orders;
create policy "auth_insert_orders" on public.orders for insert to authenticated with check (true);

-- Product reads for storefront; block direct writes (stock changes only in RPC)
drop policy if exists "public_read_products" on public.products;
create policy "public_read_products" on public.products for select to anon using (true);
drop policy if exists "auth_read_products" on public.products;
create policy "auth_read_products" on public.products for select to authenticated using (true);

drop policy if exists "no_write_products_anon" on public.products;
create policy "no_write_products_anon" on public.products as restrictive for all to anon using (false) with check (false);
drop policy if exists "no_write_products_auth" on public.products;
create policy "no_write_products_auth" on public.products as restrictive for all to authenticated using (false) with check (false);

-- 5) Reload PostgREST schema cache (fixes lingering PGRST* after migration)
select pg_notify('pgrst', 'reload schema');

commit;

-- 6) Verification queries (outputs should show tables/columns/function)
select table_name
from information_schema.tables
where table_schema='public' and table_name in ('users','customers','orders','products')
order by table_name;

select table_name, column_name
from information_schema.columns
where table_schema='public'
  and (
    (table_name='users' and column_name in ('full_name','shipping_address'))
    or
    (table_name='orders' and column_name in ('order_status','phone'))
  )
order by table_name, column_name;

select n.nspname as schema, p.proname as function_name
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname='place_order_cart';
