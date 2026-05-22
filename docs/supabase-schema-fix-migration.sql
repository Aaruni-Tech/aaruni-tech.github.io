-- Supabase schema fix migration (idempotent)
-- Run in Supabase Dashboard → SQL Editor.
-- Fixes common 400/404 checkout errors:
-- - missing users.full_name
-- - missing users.shipping_address
-- - missing orders.order_status
-- - missing orders.phone
-- - missing customers table
-- - missing RPC public.place_order_cart

create extension if not exists "pgcrypto";

-- 1) users table + required columns
create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now()
);

alter table public.users add column if not exists full_name text;
alter table public.users add column if not exists name text;
alter table public.users add column if not exists email text;
alter table public.users add column if not exists phone text;
alter table public.users add column if not exists shipping_address text;

-- 2) customers table (legacy schema compatibility)
create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text,
  phone text,
  email text,
  address text,
  address_parts jsonb not null default '[]'::jsonb
);

-- 3) orders table + required columns
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now()
);

alter table public.orders add column if not exists order_id text;
alter table public.orders add column if not exists customer_id uuid;
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
alter table public.orders add column if not exists status text;
alter table public.orders add column if not exists subtotal numeric;
alter table public.orders add column if not exists total_amount numeric;
alter table public.orders add column if not exists currency text;
alter table public.orders add column if not exists order_at timestamptz;
alter table public.orders add column if not exists cart_items jsonb not null default '[]'::jsonb;
alter table public.orders add column if not exists products jsonb not null default '[]'::jsonb;
alter table public.orders add column if not exists customer_email_sent boolean not null default false;
alter table public.orders add column if not exists customer_email_sent_at timestamptz;

create unique index if not exists idx_orders_order_id_unique on public.orders(order_id) where order_id is not null;

create table if not exists public.order_email_notifications (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  idempotency_key text not null unique,
  email_type text not null default 'admin',
  order_id text not null,
  payment_id text,
  recipient_email text not null default 'tech.aaruni@gmail.com',
  provider text not null default 'resend',
  provider_message_id text,
  status text not null default 'sending',
  sent_at timestamptz,
  error text
);

alter table public.order_email_notifications add column if not exists email_type text not null default 'admin';
alter table public.order_email_notifications add column if not exists sent_at timestamptz;

create index if not exists idx_order_email_notifications_order_id on public.order_email_notifications(order_id);
create index if not exists idx_order_email_notifications_payment_id on public.order_email_notifications(payment_id);
create index if not exists idx_order_email_notifications_status on public.order_email_notifications(status);
create index if not exists idx_order_email_notifications_email_type on public.order_email_notifications(email_type);

-- 4) products table (needed for stock reduction RPC)
create table if not exists public.products (
  id text primary key,
  created_at timestamptz not null default now(),
  product_name text not null default '',
  product_id text,
  slug text,
  price numeric not null default 0,
  image_url text,
  stock int not null default 0,
  description text
);

alter table public.products add column if not exists product_id text;
alter table public.products add column if not exists slug text;

-- 5) RPC cleanup + canonical production checkout function.
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

-- 6) RLS (enable + allow inserts needed by frontend)
alter table public.users enable row level security;
alter table public.customers enable row level security;
alter table public.orders enable row level security;
alter table public.products enable row level security;
alter table public.order_email_notifications enable row level security;

revoke all on public.order_email_notifications from anon, authenticated;

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

-- Allow reading products for storefront; block product writes except via RPC.
drop policy if exists "public_read_products" on public.products;
create policy "public_read_products" on public.products for select to anon using (true);
drop policy if exists "auth_read_products" on public.products;
create policy "auth_read_products" on public.products for select to authenticated using (true);

drop policy if exists "no_write_products_anon" on public.products;
create policy "no_write_products_anon" on public.products as restrictive for all to anon using (false) with check (false);

-- Refresh PostgREST schema cache so new tables/columns/functions are visible immediately.
select pg_notify('pgrst', 'reload schema');
