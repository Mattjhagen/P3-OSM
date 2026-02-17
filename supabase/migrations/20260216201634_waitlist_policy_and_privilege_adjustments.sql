drop policy if exists "waitlist_select_service" on public.waitlist;
create policy "waitlist_select_service" on public.waitlist
for select
using (auth.role() = 'service_role');

drop policy if exists "waitlist_insert_public" on public.waitlist;
create policy "waitlist_insert_public" on public.waitlist
for insert
with check (auth.role() in ('anon', 'authenticated', 'service_role'));

drop policy if exists "waitlist_update_service" on public.waitlist;
create policy "waitlist_update_service" on public.waitlist
for update
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

grant select, insert on table public.waitlist to anon, authenticated;
grant select, insert, update, delete on table public.waitlist to service_role;;
