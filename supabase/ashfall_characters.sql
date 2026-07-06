-- Ashfall cloud character slots — run this once in the Supabase SQL editor of
-- the shared Ironvail project (the same project Varath uses). It is SEPARATE
-- from Varath's `characters` table so the two games' saves never collide.
--
-- Three slots per account (0..2). `save_data` holds the whole Ashfall save blob
-- ({ v, seed, name, world }). Row-level security ties every row to its owner,
-- so the client's publishable/anon key can only read and write the signed-in
-- player's own Wardens.

create table if not exists public.ashfall_characters (
  user_id    uuid        not null references auth.users (id) on delete cascade,
  slot       smallint    not null check (slot between 0 and 2),
  name       text        not null default 'Warden',
  save_data  jsonb       not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, slot)
);

alter table public.ashfall_characters enable row level security;

-- One policy per verb, each scoped to the authenticated owner.
create policy "ashfall_characters_select"
  on public.ashfall_characters for select
  using (auth.uid() = user_id);

create policy "ashfall_characters_insert"
  on public.ashfall_characters for insert
  with check (auth.uid() = user_id);

create policy "ashfall_characters_update"
  on public.ashfall_characters for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "ashfall_characters_delete"
  on public.ashfall_characters for delete
  using (auth.uid() = user_id);
