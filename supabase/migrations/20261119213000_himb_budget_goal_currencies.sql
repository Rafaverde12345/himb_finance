alter table public.himb_budgets
  add column currency text not null default 'BRL'
  check (currency ~ '^[A-Z]{3}$');

alter table public.himb_goals
  add column currency text not null default 'BRL'
  check (currency ~ '^[A-Z]{3}$');

create policy "himb_transfers_owner_update"
  on public.himb_transfers for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "himb_transfers_owner_delete"
  on public.himb_transfers for delete to authenticated
  using ((select auth.uid()) = user_id);

grant update, delete on public.himb_transfers to authenticated;

create function public.himb_validate_transaction_category_kind()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  category_kind text;
begin
  if new.category_id is null then
    return new;
  end if;

  select category.kind
    into category_kind
    from public.himb_categories as category
    where category.id = new.category_id
      and category.user_id = new.user_id;

  if category_kind is null then
    raise exception 'Category not found or not accessible.';
  end if;

  if category_kind <> new.kind then
    raise exception 'Category type must match transaction type.';
  end if;

  return new;
end;
$$;

revoke all on function public.himb_validate_transaction_category_kind()
  from public, anon;
grant execute on function public.himb_validate_transaction_category_kind()
  to authenticated;

create trigger himb_transactions_category_kind_check
  before insert or update of category_id, kind, user_id
  on public.himb_transactions
  for each row
  execute function public.himb_validate_transaction_category_kind();
