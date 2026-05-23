-- Aaruni Tech - Supabase Auth + persistent customer order history
-- Run after the matching frontend is deployed. This migration makes checkout
-- authenticated and links new orders to auth.users through orders.user_id.

begin;

create extension if not exists "pgcrypto";

create table if not exists public.customer_profiles (
  id uuid primary key,
  full_name text not null default '',
  email text not null,
  phone text,
  address text,
  address_parts jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'customer_profiles_id_fkey'
      and conrelid = 'public.customer_profiles'::regclass
  ) then
    alter table public.customer_profiles
      add constraint customer_profiles_id_fkey
      foreign key (id) references auth.users(id) on delete cascade;
  end if;
end $$;

create unique index if not exists idx_customer_profiles_email_unique
on public.customer_profiles (lower(email));

create index if not exists idx_customer_profiles_created_at
on public.customer_profiles(created_at desc);

alter table public.orders add column if not exists user_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'orders_user_id_fkey'
      and conrelid = 'public.orders'::regclass
  ) then
    alter table public.orders
      add constraint orders_user_id_fkey
      foreign key (user_id) references auth.users(id) on delete set null;
  end if;
end $$;

create index if not exists idx_orders_user_id_created_at
on public.orders(user_id, created_at desc);

insert into public.customer_profiles (id, full_name, email, phone, address, address_parts, created_at, updated_at)
select
  au.id,
  coalesce(nullif(au.raw_user_meta_data->>'full_name', ''), nullif(au.raw_user_meta_data->>'name', ''), au.email, 'Customer'),
  au.email,
  nullif(au.raw_user_meta_data->>'phone', ''),
  nullif(coalesce(au.raw_user_meta_data->>'address', au.raw_user_meta_data->>'shipping_address'), ''),
  '{}'::jsonb,
  coalesce(au.created_at, now()),
  now()
from auth.users au
where au.email is not null
on conflict (id) do update
set
  email = excluded.email,
  full_name = coalesce(nullif(public.customer_profiles.full_name, ''), excluded.full_name),
  phone = coalesce(public.customer_profiles.phone, excluded.phone),
  address = coalesce(public.customer_profiles.address, excluded.address),
  updated_at = now();

update public.orders o
set user_id = au.id
from auth.users au
where o.user_id is null
  and o.customer_email is not null
  and au.email is not null
  and lower(o.customer_email) = lower(au.email);

create or replace function public.set_customer_profile_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_customer_profile_updated_at on public.customer_profiles;
create trigger set_customer_profile_updated_at
before update on public.customer_profiles
for each row execute function public.set_customer_profile_updated_at();

create or replace function public.handle_new_customer_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.customer_profiles (id, full_name, email, phone, address, address_parts, created_at, updated_at)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'full_name', ''), nullif(new.raw_user_meta_data->>'name', ''), new.email, 'Customer'),
    coalesce(new.email, ''),
    nullif(new.raw_user_meta_data->>'phone', ''),
    nullif(coalesce(new.raw_user_meta_data->>'address', new.raw_user_meta_data->>'shipping_address'), ''),
    '{}'::jsonb,
    now(),
    now()
  )
  on conflict (id) do update
  set
    email = excluded.email,
    full_name = coalesce(nullif(public.customer_profiles.full_name, ''), excluded.full_name),
    phone = coalesce(public.customer_profiles.phone, excluded.phone),
    address = coalesce(public.customer_profiles.address, excluded.address),
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_customer_profile on auth.users;
create trigger on_auth_user_created_customer_profile
after insert on auth.users
for each row execute function public.handle_new_customer_profile();

create or replace function public.claim_customer_orders_for_current_user()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_email text := lower(coalesce(auth.jwt()->>'email', ''));
  v_count integer := 0;
begin
  if v_user_id is null or v_email = '' then
    raise exception 'authentication required';
  end if;

  update public.orders
  set user_id = v_user_id
  where user_id is null
    and customer_email is not null
    and lower(customer_email) = v_email;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

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
  p_total_amount numeric,
  p_user_id uuid default null
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auth_user_id uuid := auth.uid();
  v_order_user_id uuid := coalesce(p_user_id, v_auth_user_id);
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
  if v_auth_user_id is null then
    raise exception 'authentication required';
  end if;

  if p_user_id is not null and p_user_id <> v_auth_user_id then
    raise exception 'cannot create order for another user';
  end if;

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
    user_id,
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
    v_order_user_id,
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

grant usage on schema public to anon, authenticated;
grant select on public.products to anon, authenticated;
grant select, insert, update on public.customer_profiles to authenticated;
grant select, insert on public.orders to authenticated;

revoke insert, update, delete on public.orders from anon;
revoke all on public.customer_profiles from anon;

revoke all on function public.place_order_cart(text, text, text, text, text, text, jsonb, text, numeric, uuid) from public;
grant execute on function public.place_order_cart(text, text, text, text, text, text, jsonb, text, numeric, uuid) to authenticated;

revoke all on function public.claim_customer_orders_for_current_user() from public;
grant execute on function public.claim_customer_orders_for_current_user() to authenticated;

alter table public.customer_profiles enable row level security;
alter table public.orders enable row level security;
alter table public.products enable row level security;

drop policy if exists "customer_profiles_select_own" on public.customer_profiles;
create policy "customer_profiles_select_own"
on public.customer_profiles for select to authenticated
using (id = auth.uid());

drop policy if exists "customer_profiles_insert_own" on public.customer_profiles;
create policy "customer_profiles_insert_own"
on public.customer_profiles for insert to authenticated
with check (id = auth.uid());

drop policy if exists "customer_profiles_update_own" on public.customer_profiles;
create policy "customer_profiles_update_own"
on public.customer_profiles for update to authenticated
using (id = auth.uid())
with check (id = auth.uid());

drop policy if exists "public_insert_orders" on public.orders;
drop policy if exists "auth_insert_orders" on public.orders;
drop policy if exists "customers_select_own_orders" on public.orders;
drop policy if exists "customers_insert_own_orders" on public.orders;

create policy "customers_select_own_orders"
on public.orders for select to authenticated
using (user_id = auth.uid());

create policy "customers_insert_own_orders"
on public.orders for insert to authenticated
with check (user_id = auth.uid());

drop policy if exists "public_read_products" on public.products;
create policy "public_read_products" on public.products for select to anon using (true);

drop policy if exists "auth_read_products" on public.products;
create policy "auth_read_products" on public.products for select to authenticated using (true);

select pg_notify('pgrst', 'reload schema');

commit;

select
  'auth_order_history_ready' as status,
  count(*) filter (where user_id is not null) as linked_orders,
  count(*) as total_orders
from public.orders;
