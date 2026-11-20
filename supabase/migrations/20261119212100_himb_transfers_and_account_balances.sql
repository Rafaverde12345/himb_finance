alter table public.himb_accounts
  add constraint himb_accounts_id_user_currency_key
  unique (id, user_id, currency);

create table public.himb_transfers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  from_account_id uuid not null,
  to_account_id uuid not null,
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  amount numeric(14, 2) not null check (amount > 0),
  description text not null default '',
  occurred_on date not null default current_date,
  created_at timestamptz not null default now(),
  check (from_account_id <> to_account_id),
  foreign key (from_account_id, user_id, currency)
    references public.himb_accounts (id, user_id, currency) on delete cascade,
  foreign key (to_account_id, user_id, currency)
    references public.himb_accounts (id, user_id, currency) on delete cascade
);

create index himb_transfers_user_date_idx
  on public.himb_transfers (user_id, occurred_on desc);

alter table public.himb_transfers enable row level security;

create policy "himb_transfers_owner_select"
  on public.himb_transfers for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "himb_transfers_owner_insert"
  on public.himb_transfers for insert to authenticated
  with check ((select auth.uid()) = user_id);

revoke all on public.himb_transfers from public, anon, authenticated;
grant select, insert on public.himb_transfers to authenticated;

create view public.himb_account_balances
with (security_invoker = true)
as
with transaction_balances as (
  select
    user_id,
    account_id,
    sum(case when kind = 'income' then amount else -amount end) as movement_total
  from public.himb_transactions
  group by user_id, account_id
),
transfer_balances as (
  select user_id, account_id, sum(amount) as movement_total
  from (
    select user_id, from_account_id as account_id, -amount as amount
    from public.himb_transfers
    union all
    select user_id, to_account_id as account_id, amount
    from public.himb_transfers
  ) as transfer_movements
  group by user_id, account_id
)
select
  account.id,
  account.name,
  account.account_type,
  account.currency,
  account.opening_balance,
  account.opening_balance
    + coalesce(transaction_balances.movement_total, 0)
    + coalesce(transfer_balances.movement_total, 0) as current_balance
from public.himb_accounts as account
left join transaction_balances
  on transaction_balances.user_id = account.user_id
  and transaction_balances.account_id = account.id
left join transfer_balances
  on transfer_balances.user_id = account.user_id
  and transfer_balances.account_id = account.id;

revoke all on public.himb_account_balances from public, anon, authenticated;
grant select on public.himb_account_balances to authenticated;
