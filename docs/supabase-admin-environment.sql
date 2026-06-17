-- Aaruni Tech: admin panel, environment toggle, settings, email logs, and test orders.
-- Run this in the Supabase SQL editor for the active storefront project.
-- It is additive/backward-compatible and does not delete or truncate existing orders.

create extension if not exists "pgcrypto";

create table if not exists public.app_settings (
  id text primary key default 'global' check (id = 'global'),
  environment_mode text not null default 'test' check (environment_mode in ('test', 'production')),
  razorpay_test_key_id text not null default 'rzp_test_SpYO2ojU9ZzsNG',
  razorpay_test_key_secret text,
  razorpay_live_key_id text,
  razorpay_live_key_secret text,
  resend_from_email text,
  notification_email text not null default 'tech.aaruni@gmail.com',
  shipping_fee numeric not null default 0 check (shipping_fee >= 0),
  gst_enabled boolean not null default false,
  gst_percent numeric not null default 0 check (gst_percent >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.app_settings (id, environment_mode, notification_email)
values ('global', 'test', 'tech.aaruni@gmail.com')
on conflict (id) do nothing;

create table if not exists public.admin_users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  role text not null default 'admin',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.admin_users (email, role, active)
values ('tech.aaruni@gmail.com', 'owner', true)
on conflict (email) do update
set active = true,
    role = excluded.role,
    updated_at = now();

create table if not exists public.email_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  order_id text not null,
  payment_id text,
  email_type text not null check (email_type in ('owner', 'admin', 'customer')),
  recipient_email text,
  provider text not null default 'resend',
  provider_message_id text,
  status text not null default 'pending',
  resend_attempts int not null default 0 check (resend_attempts >= 0),
  failure_reason text,
  environment_mode text not null default 'production' check (environment_mode in ('test', 'production')),
  source_table text not null default 'orders'
);

create unique index if not exists idx_email_logs_unique_delivery
on public.email_logs(order_id, payment_id, email_type, environment_mode);
create index if not exists idx_email_logs_created_at on public.email_logs(created_at desc);
create index if not exists idx_email_logs_order_id on public.email_logs(order_id);
create index if not exists idx_email_logs_status on public.email_logs(status);

-- Idempotency table used by send-order-notification. This is service-role only
-- and prevents duplicate owner/customer sends for the same order/payment pair.
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

create table if not exists public.test_orders (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  order_at timestamptz not null default now(),
  user_id uuid,
  customer_name text not null,
  customer_email text,
  phone text,
  product_name text not null default 'Cart items',
  quantity int not null default 1 check (quantity > 0),
  subtotal numeric not null default 0,
  shipping_fee numeric not null default 0,
  gst_enabled boolean not null default false,
  gst_percent numeric not null default 0,
  gst_amount numeric not null default 0,
  total_price numeric not null default 0 check (total_price >= 0),
  total_amount numeric not null default 0,
  products jsonb not null default '[]'::jsonb,
  cart_items jsonb not null default '[]'::jsonb,
  shipping_address text,
  payment_id text,
  payment_status text not null default 'Paid',
  order_status text not null default 'Processing',
  status text not null default 'Processing',
  currency text not null default 'INR',
  environment_mode text not null default 'test' check (environment_mode = 'test'),
  db_saved boolean not null default true,
  admin_email_sent boolean not null default false,
  admin_email_sent_at timestamptz,
  customer_email_sent boolean not null default false,
  customer_email_sent_at timestamptz,
  order_id text not null unique
);

alter table public.test_orders add column if not exists order_id text;
alter table public.test_orders add column if not exists user_id uuid;
alter table public.test_orders add column if not exists customer_name text not null default 'Customer';
alter table public.test_orders add column if not exists customer_email text;
alter table public.test_orders add column if not exists phone text;
alter table public.test_orders add column if not exists product_name text not null default 'Cart items';
alter table public.test_orders add column if not exists quantity int not null default 1;
alter table public.test_orders add column if not exists subtotal numeric not null default 0;
alter table public.test_orders add column if not exists shipping_fee numeric not null default 0;
alter table public.test_orders add column if not exists gst_enabled boolean not null default false;
alter table public.test_orders add column if not exists gst_percent numeric not null default 0;
alter table public.test_orders add column if not exists gst_amount numeric not null default 0;
alter table public.test_orders add column if not exists total_amount numeric not null default 0;
alter table public.test_orders add column if not exists products jsonb not null default '[]'::jsonb;
alter table public.test_orders add column if not exists cart_items jsonb not null default '[]'::jsonb;
alter table public.test_orders add column if not exists payment_id text;
alter table public.test_orders add column if not exists payment_status text not null default 'Paid';
alter table public.test_orders add column if not exists order_status text not null default 'Processing';
alter table public.test_orders add column if not exists status text not null default 'Processing';
alter table public.test_orders add column if not exists environment_mode text not null default 'test';
alter table public.test_orders add column if not exists db_saved boolean not null default true;
alter table public.test_orders add column if not exists admin_email_sent boolean not null default false;
alter table public.test_orders add column if not exists admin_email_sent_at timestamptz;
alter table public.test_orders add column if not exists customer_email_sent boolean not null default false;
alter table public.test_orders add column if not exists customer_email_sent_at timestamptz;

create index if not exists idx_test_orders_created_at on public.test_orders(created_at desc);
create index if not exists idx_test_orders_user_id_created_at on public.test_orders(user_id, created_at desc);
create index if not exists idx_test_orders_order_id on public.test_orders(order_id);
create index if not exists idx_test_orders_payment_status on public.test_orders(payment_status);
create index if not exists idx_test_orders_order_status on public.test_orders(order_status);
create unique index if not exists idx_test_orders_order_id_unique on public.test_orders(order_id) where order_id is not null;

-- Add environment/fee fields to the existing production orders table without
-- changing existing rows or removing historical order data.
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  customer_name text not null default 'Customer',
  product_name text not null default 'Cart items',
  quantity int not null default 1,
  total_price numeric not null default 0,
  order_id text unique
);

alter table public.orders add column if not exists created_at timestamptz not null default now();
alter table public.orders add column if not exists order_id text;
alter table public.orders add column if not exists user_id uuid;
alter table public.orders add column if not exists order_at timestamptz not null default now();
alter table public.orders add column if not exists customer_name text not null default 'Customer';
alter table public.orders add column if not exists customer_email text;
alter table public.orders add column if not exists phone text;
alter table public.orders add column if not exists product_name text not null default 'Cart items';
alter table public.orders add column if not exists quantity int not null default 1;
alter table public.orders add column if not exists subtotal numeric not null default 0;
alter table public.orders add column if not exists environment_mode text not null default 'production';
alter table public.orders add column if not exists shipping_fee numeric not null default 0;
alter table public.orders add column if not exists gst_enabled boolean not null default false;
alter table public.orders add column if not exists gst_percent numeric not null default 0;
alter table public.orders add column if not exists gst_amount numeric not null default 0;
alter table public.orders add column if not exists total_price numeric not null default 0;
alter table public.orders add column if not exists total_amount numeric not null default 0;
alter table public.orders add column if not exists products jsonb not null default '[]'::jsonb;
alter table public.orders add column if not exists cart_items jsonb not null default '[]'::jsonb;
alter table public.orders add column if not exists shipping_address text;
alter table public.orders add column if not exists payment_id text;
alter table public.orders add column if not exists payment_status text not null default 'Paid';
alter table public.orders add column if not exists order_status text not null default 'Order Confirmed';
alter table public.orders add column if not exists status text not null default 'Order Confirmed';
alter table public.orders add column if not exists currency text not null default 'INR';
alter table public.orders add column if not exists db_saved boolean not null default true;
alter table public.orders add column if not exists admin_email_sent boolean not null default false;
alter table public.orders add column if not exists admin_email_sent_at timestamptz;
alter table public.orders add column if not exists customer_email_sent boolean not null default false;
alter table public.orders add column if not exists customer_email_sent_at timestamptz;
create index if not exists idx_orders_environment_mode on public.orders(environment_mode);
create index if not exists idx_orders_payment_status on public.orders(payment_status);
create index if not exists idx_orders_order_status on public.orders(order_status);
create unique index if not exists idx_orders_order_id_unique on public.orders(order_id) where order_id is not null;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_app_settings_updated_at on public.app_settings;
create trigger set_app_settings_updated_at
before update on public.app_settings
for each row execute function public.set_updated_at();

drop trigger if exists set_admin_users_updated_at on public.admin_users;
create trigger set_admin_users_updated_at
before update on public.admin_users
for each row execute function public.set_updated_at();

drop trigger if exists set_email_logs_updated_at on public.email_logs;
create trigger set_email_logs_updated_at
before update on public.email_logs
for each row execute function public.set_updated_at();

drop trigger if exists set_order_email_notifications_updated_at on public.order_email_notifications;
create trigger set_order_email_notifications_updated_at
before update on public.order_email_notifications
for each row execute function public.set_updated_at();

alter table public.app_settings enable row level security;
alter table public.admin_users enable row level security;
alter table public.email_logs enable row level security;
alter table public.order_email_notifications enable row level security;
alter table public.test_orders enable row level security;

-- Settings, admins, and email logs are service-role only. The browser reads
-- sanitized settings through the public-config Edge Function and admin data
-- through the admin-api Edge Function.
revoke all on public.app_settings from anon, authenticated;
revoke all on public.admin_users from anon, authenticated;
revoke all on public.email_logs from anon, authenticated;
revoke all on public.order_email_notifications from anon, authenticated;

revoke all on public.test_orders from anon;
grant insert, select on public.test_orders to authenticated;
revoke update, delete on public.test_orders from anon, authenticated;

drop policy if exists "customers_insert_own_test_orders" on public.test_orders;
create policy "customers_insert_own_test_orders"
on public.test_orders
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "customers_select_own_test_orders" on public.test_orders;
create policy "customers_select_own_test_orders"
on public.test_orders
for select
to authenticated
using (user_id = auth.uid());
