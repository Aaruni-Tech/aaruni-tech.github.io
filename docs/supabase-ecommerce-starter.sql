-- Beginner-friendly Supabase ecommerce starter schema
-- Run in Supabase Dashboard → SQL Editor.
-- Safe for a static frontend when paired with strict RLS policies.

create extension if not exists "pgcrypto";

-- 1) Products
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  product_name text not null,
  price numeric not null check (price >= 0),
  image_url text,
  stock int not null default 0 check (stock >= 0),
  description text
);

create index if not exists idx_products_created_at on public.products(created_at desc);
create index if not exists idx_products_name on public.products(product_name);

-- 2) Orders (one row per checkout; product_name is a human-readable snapshot)
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  customer_name text not null,
  customer_email text,
  product_name text not null,
  quantity int not null check (quantity > 0),
  total_price numeric not null check (total_price >= 0),
  order_status text not null default 'Order Confirmed'
);

create index if not exists idx_orders_created_at on public.orders(created_at desc);
create index if not exists idx_orders_customer_email on public.orders(customer_email);

-- 3) Atomic order placement (insert order + reduce stock)
-- The frontend calls this via supabase.rpc('place_order', {...})
create or replace function public.place_order(
  p_product_id uuid,
  p_customer_name text,
  p_customer_email text,
  p_quantity int
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_product public.products;
  v_total numeric;
  v_order public.orders;
begin
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'quantity must be > 0';
  end if;

  select *
  into v_product
  from public.products
  where id = p_product_id
  for update;

  if not found then
    raise exception 'product not found';
  end if;

  if v_product.stock < p_quantity then
    raise exception 'insufficient stock';
  end if;

  v_total := v_product.price * p_quantity;

  update public.products
  set stock = stock - p_quantity
  where id = v_product.id;

  insert into public.orders (customer_name, customer_email, product_name, quantity, total_price, order_status)
  values (p_customer_name, nullif(p_customer_email, ''), v_product.product_name, p_quantity, v_total, 'Order Confirmed')
  returning * into v_order;

  return v_order;
end;
$$;

revoke all on function public.place_order(uuid, text, text, int) from public;
grant execute on function public.place_order(uuid, text, text, int) to anon;

-- 4) RLS policies
alter table public.products enable row level security;
alter table public.orders enable row level security;

-- Products: public read-only (for storefront)
drop policy if exists "public_read_products" on public.products;
create policy "public_read_products"
on public.products
for select
to anon
using (true);

-- Products: block direct updates/inserts/deletes from anon (stock updates must go via RPC)
drop policy if exists "no_write_products_anon" on public.products;
create policy "no_write_products_anon"
on public.products
as restrictive
for all
to anon
using (false)
with check (false);

-- Orders: allow inserts only via RPC or direct insert (direct insert won't reduce stock)
drop policy if exists "public_insert_orders" on public.orders;
create policy "public_insert_orders"
on public.orders
for insert
to anon
with check (true);

-- Orders: deny reading orders publicly by default (dashboard should use service role on server)
drop policy if exists "no_read_orders_anon" on public.orders;
create policy "no_read_orders_anon"
on public.orders
as restrictive
for select
to anon
using (false);

