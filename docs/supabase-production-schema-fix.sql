-- Aaruni Tech - FINAL production-safe Supabase schema fix (idempotent)
-- Run in Supabase Dashboard -> SQL Editor against project fxoofgnhbvquenbfhdec.
-- Fixes checkout schema-cache failures without deleting existing production data.

begin;

create extension if not exists "pgcrypto";

-- 1) Required tables. Existing tables are preserved.
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
  product_id text,
  slug text,
  price numeric not null default 0,
  stock int not null default 0,
  image_url text,
  description text
);

-- 2) Users/customers compatibility columns.
alter table public.users add column if not exists full_name text;
alter table public.users add column if not exists name text;
alter table public.users add column if not exists shipping_address text;
alter table public.users add column if not exists email text;
alter table public.users add column if not exists phone text;

alter table public.customers add column if not exists name text;
alter table public.customers add column if not exists email text;
alter table public.customers add column if not exists phone text;
alter table public.customers add column if not exists address text;
alter table public.customers add column if not exists address_parts jsonb not null default '[]'::jsonb;

-- 3) Orders compatibility columns used by current and older checkout scripts.
alter table public.orders add column if not exists order_id text;
alter table public.orders add column if not exists customer_id uuid;
alter table public.orders add column if not exists customer_name text;
alter table public.orders add column if not exists customer_email text;
alter table public.orders add column if not exists phone text;
alter table public.orders add column if not exists product_name text;
alter table public.orders add column if not exists quantity int;
alter table public.orders add column if not exists total_price numeric;
alter table public.orders add column if not exists total_amount numeric;
alter table public.orders add column if not exists subtotal numeric;
alter table public.orders add column if not exists shipping_address text;
alter table public.orders add column if not exists payment_id text;
alter table public.orders add column if not exists payment_status text;
alter table public.orders add column if not exists order_status text;
alter table public.orders add column if not exists status text;
alter table public.orders add column if not exists currency text;
alter table public.orders add column if not exists order_at timestamptz;
alter table public.orders add column if not exists cart_items jsonb;
alter table public.orders add column if not exists products jsonb;
alter table public.orders add column if not exists customer_email_sent boolean not null default false;
alter table public.orders add column if not exists customer_email_sent_at timestamptz;

-- Convert an older text `orders.products` column to jsonb safely.
do $$
declare
  v_products_type text;
  v_cart_items_type text;
begin
  select udt_name
  into v_products_type
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'orders'
    and column_name = 'products';

  if v_products_type is not null and v_products_type <> 'jsonb' then
    execute 'alter table public.orders alter column products drop default';
    execute 'alter table public.orders alter column products type jsonb using case when products is null or trim(products::text) = '''' then ''[]''::jsonb else jsonb_build_array(products::text) end';
  end if;

  select udt_name
  into v_cart_items_type
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'orders'
    and column_name = 'cart_items';

  if v_cart_items_type is not null and v_cart_items_type <> 'jsonb' then
    execute 'alter table public.orders alter column cart_items drop default';
    execute 'alter table public.orders alter column cart_items type jsonb using case when cart_items is null or trim(cart_items::text) = '''' then ''[]''::jsonb else jsonb_build_array(cart_items::text) end';
  end if;
end $$;

alter table public.orders alter column customer_name set default 'Customer';
alter table public.orders alter column product_name set default '';
alter table public.orders alter column quantity set default 0;
alter table public.orders alter column total_price set default 0;
alter table public.orders alter column total_amount set default 0;
alter table public.orders alter column subtotal set default 0;
alter table public.orders alter column payment_id set default '';
alter table public.orders alter column payment_status set default 'Paid';
alter table public.orders alter column order_status set default 'Order Confirmed';
alter table public.orders alter column status set default 'Order Confirmed';
alter table public.orders alter column currency set default 'INR';
alter table public.orders alter column order_at set default now();
alter table public.orders alter column cart_items set default '[]'::jsonb;
alter table public.orders alter column products set default '[]'::jsonb;

update public.orders set products = '[]'::jsonb where products is null;
update public.orders set cart_items = '[]'::jsonb where cart_items is null;
update public.orders set customer_name = 'Customer' where customer_name is null;
update public.orders set product_name = '' where product_name is null;
update public.orders set quantity = 0 where quantity is null;
update public.orders set total_price = coalesce(total_price, total_amount, subtotal, 0) where total_price is null;
update public.orders set total_amount = coalesce(total_amount, total_price, subtotal, 0) where total_amount is null;
update public.orders set subtotal = coalesce(subtotal, total_price, total_amount, 0) where subtotal is null;
update public.orders set payment_status = 'Paid' where payment_status is null;
update public.orders set order_status = 'Order Confirmed' where order_status is null;
update public.orders set status = coalesce(status, order_status, 'Order Confirmed') where status is null;
update public.orders set currency = 'INR' where currency is null;
update public.orders set order_at = coalesce(order_at, created_at, now()) where order_at is null;

alter table public.orders alter column products set not null;
alter table public.orders alter column cart_items set not null;
alter table public.orders alter column customer_id drop not null;

create unique index if not exists idx_orders_order_id_unique
on public.orders(order_id)
where order_id is not null;

create index if not exists idx_orders_customer_email on public.orders(customer_email);
create index if not exists idx_orders_phone on public.orders(phone);
create index if not exists idx_orders_created_at on public.orders(created_at desc);

-- Order email notification idempotency log. This is used only by the
-- send-order-notification Edge Function with the service role key.
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
update public.order_email_notifications set email_type = 'admin' where email_type is null or trim(email_type) = '';

create index if not exists idx_order_email_notifications_order_id on public.order_email_notifications(order_id);
create index if not exists idx_order_email_notifications_payment_id on public.order_email_notifications(payment_id);
create index if not exists idx_order_email_notifications_status on public.order_email_notifications(status);
create index if not exists idx_order_email_notifications_email_type on public.order_email_notifications(email_type);

-- 4) Products compatibility columns. The live table currently has legacy names like
-- "product name", "product id", "image url", and "discription"; keep them and add canonical names.
alter table public.products add column if not exists id text;
alter table public.products add column if not exists created_at timestamptz not null default now();
alter table public.products add column if not exists product_name text;
alter table public.products add column if not exists product_id text;
alter table public.products add column if not exists slug text;
alter table public.products add column if not exists price numeric;
alter table public.products add column if not exists stock int;
alter table public.products add column if not exists image_url text;
alter table public.products add column if not exists description text;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'products' and column_name = 'product name'
  ) then
    execute 'update public.products set product_name = nullif(trim("product name"::text), '''') where (product_name is null or trim(product_name) = '''') and "product name" is not null';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'products' and column_name = 'product id'
  ) then
    execute 'update public.products set product_id = nullif(trim("product id"::text), '''') where (product_id is null or trim(product_id) = '''') and "product id" is not null';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'products' and column_name = 'image url'
  ) then
    execute 'update public.products set image_url = nullif(trim("image url"::text), '''') where (image_url is null or trim(coalesce(image_url, '''')) = '''') and "image url" is not null';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'products' and column_name = 'discription'
  ) then
    execute 'update public.products set description = nullif(trim(discription::text), '''') where (description is null or trim(coalesce(description, '''')) = '''') and discription is not null';
  end if;
end $$;

update public.products
set slug = nullif(trim(both '-' from regexp_replace(lower(trim(product_name)), '[^a-z0-9]+', '-', 'g')), '')
where (slug is null or trim(slug) = '')
  and product_name is not null
  and trim(product_name) <> '';

do $$
declare
  v_id_type text;
begin
  select data_type
  into v_id_type
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'products'
    and column_name = 'id';

  if v_id_type in ('text', 'character varying', 'character') then
    execute 'update public.products set id = slug where (id is null or trim(id::text) = '''') and slug is not null and trim(slug) <> ''''';
    execute 'update public.products set id = product_id where (id is null or trim(id::text) = '''') and product_id is not null and trim(product_id) <> ''''';
    execute 'update public.products set id = upper(substr(replace(gen_random_uuid()::text, ''-'', ''''), 1, 12)) where id is null or trim(id::text) = ''''';
  end if;
end $$;

update public.products set product_id = coalesce(nullif(product_id, ''), nullif(slug, ''), id::text) where product_id is null or trim(product_id) = '';
update public.products set product_name = coalesce(nullif(product_name, ''), nullif(slug, ''), product_id, id::text, 'Product') where product_name is null or trim(product_name) = '';
update public.products set price = 0 where price is null;
update public.products set stock = 0 where stock is null;

alter table public.products alter column product_name set default '';
alter table public.products alter column price set default 0;
alter table public.products alter column stock set default 0;
alter table public.products alter column product_name set not null;
alter table public.products alter column price set not null;
alter table public.products alter column stock set not null;

create index if not exists idx_products_product_id on public.products(product_id);
create index if not exists idx_products_slug on public.products(slug);
create index if not exists idx_products_created_at on public.products(created_at desc);

-- 5) RPC cleanup: remove every obsolete place_order_cart overload before
-- creating the single production signature. This also clears older functions
-- where p_products was text and failed against orders.products jsonb.
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

-- 6) RPC: canonical production checkout payload used by supabase-backend.js.
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

-- 7) Grants + RLS policies needed by GitHub Pages anon checkout.
grant usage on schema public to anon, authenticated;
grant insert on public.users to anon, authenticated;
grant insert on public.customers to anon, authenticated;
grant insert on public.orders to anon, authenticated;
grant select on public.products to anon, authenticated;

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

drop policy if exists "public_read_products" on public.products;
create policy "public_read_products" on public.products for select to anon using (true);
drop policy if exists "auth_read_products" on public.products;
create policy "auth_read_products" on public.products for select to authenticated using (true);

-- Remove older restrictive policies that accidentally blocked product SELECT.
drop policy if exists "no_write_products_anon" on public.products;
drop policy if exists "no_write_products_auth" on public.products;

-- 8) Reload PostgREST schema cache.
select pg_notify('pgrst', 'reload schema');

commit;

-- 9) Verification queries. Run after the commit completes.
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in ('users', 'customers', 'orders', 'products', 'order_email_notifications')
order by table_name;

select table_name, column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and (
    (table_name = 'users' and column_name in ('full_name', 'shipping_address', 'email', 'phone'))
    or
    (table_name = 'orders' and column_name in ('order_id', 'product_name', 'quantity', 'total_price', 'total_amount', 'products', 'order_status', 'phone'))
    or
    (table_name = 'products' and column_name in ('id', 'product_id', 'slug', 'product_name', 'price', 'stock', 'image_url', 'description'))
  )
order by table_name, column_name;

select n.nspname as schema, p.proname as function_name, pg_get_function_identity_arguments(p.oid) as arguments
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'place_order_cart'
order by arguments;

select count(*) as place_order_cart_overload_count
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'place_order_cart';

select order_id, payment_id, jsonb_typeof(products) as products_jsonb_type, products
from public.orders
where order_id is not null
order by created_at desc
limit 5;
