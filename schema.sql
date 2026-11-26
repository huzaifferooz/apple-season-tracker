-- Run once in Supabase > SQL Editor.
create table public.sales (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id      text not null,
  season  int  not null,
  date    date not null,
  variety text not null check (char_length(variety) between 1 and 40),
  boxes   int  not null check (boxes > 0),
  rate    numeric(12,2) not null check (rate > 0),
  buyer   text not null default '' check (char_length(buyer) <= 60),
  primary key (user_id, id)
);

create table public.expenses (
  user_id  uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id       text not null,
  season   int  not null,
  date     date not null,
  category text not null check (char_length(category) between 1 and 40),
  amount   numeric(12,2) not null check (amount > 0),
  note     text not null default '' check (char_length(note) <= 60),
  primary key (user_id, id)
);

-- Row Level Security: each user can only see and change their own rows.
alter table public.sales enable row level security;
alter table public.expenses enable row level security;

create policy "own sales" on public.sales for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "own expenses" on public.expenses for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

revoke all on public.sales, public.expenses from anon, authenticated;
grant select, insert, update, delete on public.sales, public.expenses to authenticated;
