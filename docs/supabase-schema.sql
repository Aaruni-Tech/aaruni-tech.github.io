-- Supabase schema for Aaruni Tech ecommerce orders
-- Run in Supabase Dashboard → SQL Editor.

create extension if not exists "pgcrypto";

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text not null,
  email text,
  address text not null,
  address_parts jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_id text not null unique,
  customer_id uuid not null references public.customers(id) on delete restrict,
  payment_id text not null,
  status text not null default 'Confirmed',
  subtotal numeric not null default 0,
  total_amount numeric not null default 0,
  currency text not null default 'INR',
  order_at timestamptz not null default now(),
  cart_items jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id text,
  name text not null,
  category text,
  image text,
  unit_price numeric not null default 0,
  quantity int not null default 1,
  line_total numeric not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_orders_order_id on public.orders(order_id);
create index if not exists idx_orders_payment_id on public.orders(payment_id);
create index if not exists idx_order_items_order_id on public.order_items(order_id);
create index if not exists idx_customers_phone on public.customers(phone);

-- RLS: allow public inserts (anon key) but deny reading/updating from the browser.
alter table public.customers enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;

drop policy if exists "public_insert_customers" on public.customers;
create policy "public_insert_customers"
on public.customers
for insert
to anon
with check (true);

drop policy if exists "public_insert_orders" on public.orders;
create policy "public_insert_orders"
on public.orders
for insert
to anon
with check (true);

drop policy if exists "public_insert_order_items" on public.order_items;
create policy "public_insert_order_items"
on public.order_items
for insert
to anon
with check (true);

