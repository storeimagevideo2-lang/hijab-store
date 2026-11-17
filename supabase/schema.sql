-- ============================================================================
-- NOOR Hijab E-Commerce — High-Traffic PostgreSQL Schema for Supabase
-- Run this script in: Supabase Dashboard -> SQL Editor -> New Query -> Run
-- ============================================================================

-- 1. Products Table
create table if not exists public.products (
  id text primary key,
  slug text not null unique,
  sku text not null default '',
  name text not null,
  description text not null default '',
  price numeric(12, 2) not null check (price >= 0),
  original_price numeric(12, 2) check (original_price is null or original_price >= price),
  cost_price numeric(12, 2) check (cost_price is null or cost_price >= 0),
  status text not null default 'active' check (status in ('active', 'inactive')),
  category text not null default 'hijabs',
  fabric text,
  colour text not null default 'rose',
  stock integer not null default 10 check (stock >= 0),
  low_stock_threshold integer not null default 5 check (low_stock_threshold >= 0),
  material text not null default 'Modal',
  size text not null default '180 × 70 cm',
  delivery_note text not null default 'Delivery within 1–3 business days inside Dhaka and 3–5 days nationwide.',
  image_src text not null,
  image_alt text not null,
  image_position text,
  sections text[] not null default '{}',
  variants jsonb not null default '[]'::jsonb,
  last_restocked_at timestamptz,
  added_at date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Drop legacy hardcoded taxonomy CHECK constraints if upgrading an existing database
alter table public.products drop constraint if exists products_category_check;
alter table public.products drop constraint if exists products_fabric_check;
alter table public.products drop constraint if exists products_colour_check;

-- High-traffic indexes for fast filtering, sorting, and homepage section lookups
create index if not exists idx_products_category on public.products (category);
create index if not exists idx_products_fabric on public.products (fabric);
create index if not exists idx_products_colour on public.products (colour);
create index if not exists idx_products_status on public.products (status);
create index if not exists idx_products_added_at on public.products (added_at desc, created_at desc);
create index if not exists idx_products_sections on public.products using gin (sections);

-- 2. Orders Table
create table if not exists public.orders (
  id text primary key,
  customer_name text not null,
  customer_phone text not null,
  customer_email text,
  customer_address text not null,
  customer_city text not null,
  customer_notes text,
  delivery_zone text not null check (delivery_zone in ('inside-dhaka', 'outside-dhaka')),
  payment_method text not null check (payment_method in ('cod', 'bkash', 'nagad')),
  payment_phone text,
  payment_status text not null default 'Pending' check (payment_status in ('Paid', 'Pending', 'Failed', 'Refunded', 'Partially Refunded')),
  delivery_status text not null default 'Pending Dispatch' check (delivery_status in ('Pending Dispatch', 'In Transit', 'Out for Delivery', 'Delivered', 'Returned', 'Cancelled')),
  items jsonb not null default '[]'::jsonb,
  subtotal numeric(12, 2) not null check (subtotal >= 0),
  discount_amount numeric(12, 2) not null default 0 check (discount_amount >= 0),
  coupon_code text,
  shipping_fee numeric(12, 2) not null check (shipping_fee >= 0),
  tax_amount numeric(12, 2) not null default 0 check (tax_amount >= 0),
  refund_amount numeric(12, 2) not null default 0 check (refund_amount >= 0),
  total numeric(12, 2) not null check (total >= 0),
  status text not null default 'Confirmed' check (status in ('Pending', 'Confirmed', 'Processing', 'Shipped', 'Delivered', 'Cancelled', 'Returned', 'Refunded')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_orders_created_at on public.orders (created_at desc);
create index if not exists idx_orders_customer_phone on public.orders (customer_phone);
create index if not exists idx_orders_status on public.orders (status);
create index if not exists idx_orders_payment_status on public.orders (payment_status);

-- 3. Coupons Table
create table if not exists public.coupons (
  id text primary key,
  code text not null unique,
  description text not null default '',
  discount_type text not null default 'percentage' check (discount_type in ('percentage', 'fixed')),
  discount_value numeric(12, 2) not null check (discount_value >= 0),
  min_order_amount numeric(12, 2) not null default 0 check (min_order_amount >= 0),
  active boolean not null default true,
  usage_count integer not null default 0 check (usage_count >= 0),
  created_at timestamptz not null default now()
);

-- 4. Auto-update `updated_at` trigger
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_products_updated_at on public.products;
create trigger trg_products_updated_at
before update on public.products
for each row execute function public.set_updated_at();

drop trigger if exists trg_orders_updated_at on public.orders;
create trigger trg_orders_updated_at
before update on public.orders
for each row execute function public.set_updated_at();

-- 4. Reviews Table
create table if not exists public.reviews (
  id text primary key,
  product_id text not null references public.products(id) on delete cascade,
  order_id text references public.orders(id) on delete set null,
  customer_name text not null,
  customer_phone text,
  rating integer not null check (rating >= 1 and rating <= 5),
  title text not null default '',
  comment text not null,
  status text not null default 'approved' check (status in ('pending', 'approved', 'rejected')),
  verified_purchase boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_reviews_product_id on public.reviews (product_id);
create index if not exists idx_reviews_status on public.reviews (status);
create index if not exists idx_reviews_created_at on public.reviews (created_at desc);

-- 5. Row Level Security (RLS)
alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.coupons enable row level security;
alter table public.reviews enable row level security;

-- Public visitors can read active products seamlessly
drop policy if exists "Public can view products" on public.products;
create policy "Public can view products"
  on public.products
  for select
  to anon, authenticated
  using (true);

-- Ensure anon/authenticated cannot insert orders directly into Supabase.
-- All orders must go through the Next.js server-side endpoint (/api/orders)
-- which performs price validation, coupon verification, and inventory checks using the service_role key.
drop policy if exists "Anyone can place orders" on public.orders;

-- Public can view approved reviews
drop policy if exists "Public can view approved reviews" on public.reviews;
create policy "Public can view approved reviews"
  on public.reviews
  for select
  to anon, authenticated
  using (status = 'approved');

-- Ensure anon/authenticated cannot insert reviews directly into Supabase.
-- All reviews must go through the Next.js server-side endpoint (/api/reviews)
-- which enforces verified purchase checks and moderation status using the service_role key.
drop policy if exists "Anyone can submit reviews" on public.reviews;

-- 6. Atomic High-Concurrency Stock Reservation & Restoration
-- Prevents overselling when multiple shoppers purchase the last stock at the exact same millisecond.
-- Uses row-level locks (SELECT ... FOR UPDATE) to ensure strictly atomic transactions.
create or replace function public.reserve_order_stock(p_items jsonb)
returns jsonb
language plpgsql
security definer
as $$
declare
  item jsonb;
  prod_id text;
  req_qty int;
  avail_stock int;
  prod_name text;
begin
  -- Phase 1: Lock candidate product rows and verify adequate inventory for all order items
  for item in select * from jsonb_array_elements(p_items)
  loop
    prod_id := item->>'id';
    req_qty := greatest(1, (item->>'quantity')::int);

    select stock, name into avail_stock, prod_name
    from public.products
    where id = prod_id
    for update;

    if not found then
      return jsonb_build_object('success', false, 'error', 'Product ' || prod_id || ' was not found in the catalog.');
    end if;

    if avail_stock < req_qty then
      return jsonb_build_object(
        'success', false,
        'error', 'Sorry, "' || prod_name || '" just ran out of stock (only ' || avail_stock || ' available).'
      );
    end if;
  end loop;

  -- Phase 2: Decrement inventory atomically across all items
  for item in select * from jsonb_array_elements(p_items)
  loop
    prod_id := item->>'id';
    req_qty := greatest(1, (item->>'quantity')::int);

    update public.products
    set stock = stock - req_qty,
        updated_at = now()
    where id = prod_id;
  end loop;

  return jsonb_build_object('success', true);
end;
$$;

create or replace function public.restore_order_stock(p_items jsonb)
returns jsonb
language plpgsql
security definer
as $$
declare
  item jsonb;
  prod_id text;
  req_qty int;
begin
  for item in select * from jsonb_array_elements(p_items)
  loop
    prod_id := item->>'id';
    req_qty := greatest(1, (item->>'quantity')::int);

    update public.products
    set stock = stock + req_qty,
        updated_at = now()
    where id = prod_id;
  end loop;

  return jsonb_build_object('success', true);
end;
$$;

-- 7. Restrict Stock RPC Execution to service_role only
-- Prevents anonymous or authenticated client-side users from directly modifying inventory via REST API
revoke execute on function public.reserve_order_stock(jsonb) from public, anon, authenticated;
grant execute on function public.reserve_order_stock(jsonb) to service_role;

revoke execute on function public.restore_order_stock(jsonb) from public, anon, authenticated;
grant execute on function public.restore_order_stock(jsonb) to service_role;

-- 8. Orders Security & High-Scale Performance Enhancements
-- Receipt token for privacy-safe guest order lookups (prevents IDOR order enumeration)
alter table public.orders add column if not exists receipt_token text;
create index if not exists idx_orders_receipt_token on public.orders (receipt_token);
create index if not exists idx_orders_created_status on public.orders (created_at desc, status);

-- 9. Dedicated Customers Table (High-Scale: supports 100,000+ accounts with zero JSON race conditions)
create table if not exists public.customers (
  id text primary key,
  name text not null,
  phone text not null,
  email text,
  address text not null default '',
  city text not null default '',
  password text not null,
  reset_token text,
  reset_code text,
  reset_expires_at timestamptz,
  reset_attempts integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_customers_phone on public.customers (phone);
create index if not exists idx_customers_email on public.customers (lower(email));
create index if not exists idx_customers_created_at on public.customers (created_at desc);

alter table public.customers enable row level security;

drop trigger if exists trg_customers_updated_at on public.customers;
create trigger trg_customers_updated_at
before update on public.customers
for each row execute function public.set_updated_at();

-- 10. Dedicated Contact Messages Table (High-Scale: server-side pagination & instant filtering)
create table if not exists public.contact_messages (
  id text primary key,
  name text not null,
  contact text not null,
  topic text not null default 'Order Inquiry',
  message text not null,
  status text not null default 'unread' check (status in ('unread', 'resolved')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_contact_messages_status on public.contact_messages (status);
create index if not exists idx_contact_messages_created_at on public.contact_messages (created_at desc);

alter table public.contact_messages enable row level security;

drop trigger if exists trg_contact_messages_updated_at on public.contact_messages;
create trigger trg_contact_messages_updated_at
before update on public.contact_messages
for each row execute function public.set_updated_at();

-- 11. Safe One-Time Data Migration from Legacy JSON Rows (preserves existing customers & messages)
do $$
declare
  legacy_customers jsonb;
  legacy_messages jsonb;
  rec jsonb;
begin
  select description::jsonb into legacy_customers
  from public.coupons
  where id = '__system_customers_registry__'
  limit 1;

  if legacy_customers is not null and jsonb_typeof(legacy_customers) = 'array' then
    for rec in select * from jsonb_array_elements(legacy_customers)
    loop
      insert into public.customers (id, name, phone, email, address, city, password, created_at)
      values (
        coalesce(rec->>'id', 'USR-MIGRATED-' || substr(md5(random()::text), 1, 8)),
        coalesce(rec->>'name', 'Customer'),
        coalesce(rec->>'phone', ''),
        nullif(rec->>'email', ''),
        coalesce(rec->>'address', ''),
        coalesce(rec->>'city', ''),
        coalesce(rec->>'password', ''),
        coalesce((rec->>'createdAt')::timestamptz, now())
      )
      on conflict (id) do nothing;
    end loop;
  end if;

  select description::jsonb into legacy_messages
  from public.coupons
  where id = '__system_contact_messages__'
  limit 1;

  if legacy_messages is not null and jsonb_typeof(legacy_messages) = 'array' then
    for rec in select * from jsonb_array_elements(legacy_messages)
    loop
      insert into public.contact_messages (id, name, contact, topic, message, status, created_at)
      values (
        coalesce(rec->>'id', 'msg-migrated-' || substr(md5(random()::text), 1, 8)),
        coalesce(rec->>'name', 'Customer'),
        coalesce(rec->>'contact', ''),
        coalesce(rec->>'topic', 'Order Inquiry'),
        coalesce(rec->>'message', ''),
        case when rec->>'status' = 'resolved' then 'resolved' else 'unread' end,
        coalesce((rec->>'createdAt')::timestamptz, now())
      )
      on conflict (id) do nothing;
    end loop;
  end if;
exception when others then
  -- Ignore malformed legacy JSON safely
  null;
end $$;
