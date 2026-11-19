create table public.himb_categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) > 0),
  kind text not null check (kind in ('income', 'expense')),
  created_at timestamptz not null default now(),
  unique (id, user_id),
  unique (user_id, name, kind)
);

create table public.himb_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) > 0),
  account_type text not null check (
    account_type in ('checking', 'savings', 'cash', 'credit', 'investment', 'other')
  ),
  currency text not null default 'BRL' check (currency ~ '^[A-Z]{3}$'),
  opening_balance numeric(14, 2) not null default 0,
  created_at timestamptz not null default now(),
  unique (id, user_id)
);

create table public.himb_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  account_id uuid not null,
  category_id uuid,
  kind text not null check (kind in ('income', 'expense')),
  amount numeric(14, 2) not null check (amount > 0),
  description text not null default '',
  occurred_on date not null default current_date,
  created_at timestamptz not null default now(),
  foreign key (account_id, user_id)
    references public.himb_accounts (id, user_id) on delete cascade,
  foreign key (category_id, user_id)
    references public.himb_categories (id, user_id),
  unique (id, user_id)
);

create table public.himb_budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) > 0),
  category_id uuid,
  monthly_limit numeric(14, 2) not null check (monthly_limit > 0),
  period_start date not null check (extract(day from period_start) = 1),
  created_at timestamptz not null default now(),
  foreign key (category_id, user_id)
    references public.himb_categories (id, user_id),
  unique (user_id, name, period_start)
);

create table public.himb_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) > 0),
  target_amount numeric(14, 2) not null check (target_amount > 0),
  current_amount numeric(14, 2) not null default 0 check (current_amount >= 0),
  target_date date,
  created_at timestamptz not null default now()
);

create index himb_categories_user_kind_idx
  on public.himb_categories (user_id, kind);
create index himb_accounts_user_idx
  on public.himb_accounts (user_id);
create index himb_transactions_user_date_idx
  on public.himb_transactions (user_id, occurred_on desc);
create index himb_budgets_user_period_idx
  on public.himb_budgets (user_id, period_start desc);
create index himb_goals_user_idx
  on public.himb_goals (user_id);

alter table public.himb_categories enable row level security;
alter table public.himb_accounts enable row level security;
alter table public.himb_transactions enable row level security;
alter table public.himb_budgets enable row level security;
alter table public.himb_goals enable row level security;

create policy "himb_categories_owner_all"
  on public.himb_categories for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "himb_accounts_owner_all"
  on public.himb_accounts for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "himb_transactions_owner_all"
  on public.himb_transactions for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "himb_budgets_owner_all"
  on public.himb_budgets for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "himb_goals_owner_all"
  on public.himb_goals for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

revoke all on public.himb_categories, public.himb_accounts,
  public.himb_transactions, public.himb_budgets, public.himb_goals
  from public, anon, authenticated;

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.himb_categories,
  public.himb_accounts, public.himb_transactions, public.himb_budgets,
  public.himb_goals to authenticated;
