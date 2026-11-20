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
