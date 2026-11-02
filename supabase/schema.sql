-- POIN Quest: jalankan SEKALI di Supabase > SQL Editor > New query > Run.
-- Membuat 3 tabel. Setiap akun hanya bisa membaca dan mengubah datanya sendiri (Row Level Security).

-- 1. Pengaturan per akun (target, daftar aksi, hari kerja, nama di rekap)
create table if not exists public.settings (
  user_id    uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- 2. Satu baris = satu ketukan tombol +
create table if not exists public.entries (
  id            uuid primary key,                         -- dibuat di HP supaya aman saat offline
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  entry_date    date not null,                            -- tanggal WIB
  activity_id   text not null,
  activity_name text not null check (char_length(activity_name) between 1 and 40),
  points        smallint not null check (points between 1 and 10),
  note          text not null default '' check (char_length(note) <= 120),
  is_backfill   boolean not null default false,           -- diisi susulan
  min_target    smallint not null check (min_target between 1 and 100),
  ideal_target  smallint not null check (ideal_target between 2 and 200),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz                               -- hapus = isi kolom ini
);
create index if not exists entries_by_day    on public.entries (user_id, entry_date);
create index if not exists entries_by_change on public.entries (user_id, updated_at);

-- 3. Link rahasia untuk Google Sheets (satu per akun)
create table if not exists public.sheet_tokens (
  user_id    uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  token      text not null unique check (token ~ '^[a-f0-9]{32}$'),
  created_at timestamptz not null default now()
);

-- updated_at otomatis
create or replace function public.touch_updated_at() returns trigger
language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists entries_touch on public.entries;
create trigger entries_touch before update on public.entries
  for each row execute function public.touch_updated_at();
drop trigger if exists settings_touch on public.settings;
create trigger settings_touch before update on public.settings
  for each row execute function public.touch_updated_at();

-- Tolak entri untuk hari depan atau lebih dari 7 hari lalu (WIB)
create or replace function public.guard_entry_date() returns trigger
language plpgsql set search_path = public as $$
declare today date := (now() at time zone 'Asia/Jakarta')::date;
begin
  if new.entry_date > today or new.entry_date < today - 7 then
    raise exception 'Tanggal di luar rentang 7 hari' using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists entries_guard on public.entries;
create trigger entries_guard before insert on public.entries
  for each row execute function public.guard_entry_date();

-- Row Level Security: hanya pemilik data
alter table public.settings     enable row level security;
alter table public.entries      enable row level security;
alter table public.sheet_tokens enable row level security;

drop policy if exists settings_own on public.settings;
create policy settings_own on public.settings for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists entries_select on public.entries;
drop policy if exists entries_insert on public.entries;
drop policy if exists entries_update on public.entries;
create policy entries_select on public.entries for select to authenticated using (user_id = (select auth.uid()));
create policy entries_insert on public.entries for insert to authenticated with check (user_id = (select auth.uid()));
create policy entries_update on public.entries for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
-- sengaja tanpa policy delete: entri dihapus dengan mengisi deleted_at

drop policy if exists tokens_own on public.sheet_tokens;
create policy tokens_own on public.sheet_tokens for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- CSV untuk Google Sheets. Hanya bisa dipanggil oleh fungsi "sheet" (kunci rahasia), tidak dari browser.
create or replace function public.csv_cell(v text) returns text
language sql immutable set search_path = public as $$
  select case when v ~ '[",\r\n]' then '"' || replace(v, '"', '""') || '"' else v end
$$;

create or replace function public.sheet_csv(p_token text) returns text
language plpgsql security definer set search_path = public as $$
declare
  uid uuid;
  body text;
begin
  select user_id into uid from public.sheet_tokens where token = p_token;
  if uid is null then return null; end if;
  select string_agg(
           to_char(e.entry_date, 'YYYY-MM-DD') || ',' ||
           to_char(e.created_at at time zone 'Asia/Jakarta', 'HH24:MI') || ',' ||
           public.csv_cell(e.activity_name) || ',' ||
           e.points || ',' ||
           public.csv_cell(e.note) || ',' ||
           case when e.is_backfill then 'ya' else '' end,
           E'\n' order by e.entry_date, e.created_at)
    into body
    from public.entries e
   where e.user_id = uid and e.deleted_at is null;
  return 'tanggal,jam,kegiatan,poin,catatan,susulan' || coalesce(E'\n' || body, '');
end $$;

revoke all on function public.sheet_csv(text) from public, anon, authenticated;
grant execute on function public.sheet_csv(text) to service_role;

-- 4. Catatan harian: satu tulisan bebas per akun per hari
create table if not exists public.journals (
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  day        date not null,
  body       text not null default '' check (char_length(body) <= 2000),
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);
drop trigger if exists journals_touch on public.journals;
create trigger journals_touch before update on public.journals
  for each row execute function public.touch_updated_at();
alter table public.journals enable row level security;
drop policy if exists journals_own on public.journals;
create policy journals_own on public.journals for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- 5. Daftar Nama dan Leads: satu baris = satu orang
create table if not exists public.contacts (
  id           uuid primary key,
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name         text not null check (char_length(name) between 1 and 60),
  phone        text not null default '' check (char_length(phone) <= 20),
  source       text not null default '' check (char_length(source) <= 30),
  note         text not null default '' check (char_length(note) <= 500),
  stage        text not null default 'nama' check (stage in ('nama','chat','janji','presentasi','followup','closing','ditolak')),
  contacted_at timestamptz,                               -- pertama kali dihubungi
  stage_at     timestamptz not null default now(),        -- terakhir status berubah
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);
create index if not exists contacts_by_change on public.contacts (user_id, updated_at);

-- 6. Jadwal: tugas sekali atau berulang, dan centang selesai per hari
create table if not exists public.tasks (
  id          uuid primary key,
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title       text not null check (char_length(title) between 1 and 60),
  at_time     text not null default '' check (at_time = '' or at_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  repeat_days smallint[] not null default '{}',           -- ISO 1 = Senin ... 7 = Minggu; kosong = sekali
  on_date     date,                                       -- tanggal untuk tugas sekali
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  check (cardinality(repeat_days) > 0 or on_date is not null),
  check (repeat_days <@ array[1,2,3,4,5,6,7]::smallint[])
);
create table if not exists public.task_checks (
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  task_id    uuid not null references public.tasks(id) on delete cascade,
  day        date not null,
  done       boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (task_id, day)
);

drop trigger if exists contacts_touch on public.contacts;
create trigger contacts_touch before update on public.contacts for each row execute function public.touch_updated_at();
drop trigger if exists tasks_touch on public.tasks;
create trigger tasks_touch before update on public.tasks for each row execute function public.touch_updated_at();
drop trigger if exists checks_touch on public.task_checks;
create trigger checks_touch before update on public.task_checks for each row execute function public.touch_updated_at();

alter table public.contacts    enable row level security;
alter table public.tasks       enable row level security;
alter table public.task_checks enable row level security;
drop policy if exists contacts_select on public.contacts;
drop policy if exists contacts_insert on public.contacts;
drop policy if exists contacts_update on public.contacts;
create policy contacts_select on public.contacts for select to authenticated using (user_id = (select auth.uid()));
create policy contacts_insert on public.contacts for insert to authenticated with check (user_id = (select auth.uid()));
create policy contacts_update on public.contacts for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists tasks_select on public.tasks;
drop policy if exists tasks_insert on public.tasks;
drop policy if exists tasks_update on public.tasks;
create policy tasks_select on public.tasks for select to authenticated using (user_id = (select auth.uid()));
create policy tasks_insert on public.tasks for insert to authenticated with check (user_id = (select auth.uid()));
create policy tasks_update on public.tasks for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists checks_own on public.task_checks;
create policy checks_own on public.task_checks for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Sinkron langsung antar perangkat (Realtime)
do $$ begin alter publication supabase_realtime add table public.contacts;    exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.tasks;       exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.task_checks; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.entries;  exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.settings; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.journals; exception when duplicate_object then null; end $$;

-- 7. Admin tim: melihat data semua anggota dan mengatur besaran poin untuk seluruh tim
create table if not exists public.admin_emails (
  email      text primary key check (email = lower(email)),
  created_at timestamptz not null default now()
);
insert into public.admin_emails (email) values ('daffaaraihann@gmail.com') on conflict do nothing;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.admin_emails a join auth.users u on lower(u.email) = a.email
     where u.id = (select auth.uid()))
$$;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- Nama dan email setiap anggota, untuk daftar di dashboard admin
create table if not exists public.profiles (
  user_id    uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  name       text not null default '' check (char_length(name) <= 60),
  email      text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (user_id, name, email)
  values (new.id, left(coalesce(new.raw_user_meta_data->>'name', ''), 60), coalesce(new.email, ''))
  on conflict (user_id) do update set email = excluded.email;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();
insert into public.profiles (user_id, name, email)
  select id, left(coalesce(raw_user_meta_data->>'name', ''), 60), coalesce(email, '') from auth.users
  on conflict (user_id) do nothing;
drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();

-- Aturan main tim (target dan besaran poin). Satu baris, hanya admin yang bisa mengubah.
create table if not exists public.team_config (
  id         smallint primary key default 1 check (id = 1),
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
drop trigger if exists team_config_touch on public.team_config;
create trigger team_config_touch before update on public.team_config for each row execute function public.touch_updated_at();

alter table public.admin_emails enable row level security;
alter table public.profiles     enable row level security;
alter table public.team_config  enable row level security;

drop policy if exists admins_read  on public.admin_emails;
drop policy if exists admins_write on public.admin_emails;
create policy admins_read  on public.admin_emails for select to authenticated using ((select public.is_admin()));
create policy admins_write on public.admin_emails for all    to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

drop policy if exists profiles_own   on public.profiles;
drop policy if exists profiles_admin on public.profiles;
create policy profiles_own   on public.profiles for all    to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy profiles_admin on public.profiles for select to authenticated using ((select public.is_admin()));

drop policy if exists team_read  on public.team_config;
drop policy if exists team_write on public.team_config;
create policy team_read  on public.team_config for select to authenticated using (true);
create policy team_write on public.team_config for all    to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

-- Admin boleh MEMBACA semua data anggota (tidak bisa mengubahnya)
drop policy if exists settings_admin on public.settings;
drop policy if exists entries_admin  on public.entries;
drop policy if exists journals_admin on public.journals;
drop policy if exists contacts_admin on public.contacts;
drop policy if exists tasks_admin    on public.tasks;
drop policy if exists checks_admin   on public.task_checks;
create policy settings_admin on public.settings    for select to authenticated using ((select public.is_admin()));
create policy entries_admin  on public.entries     for select to authenticated using ((select public.is_admin()));
create policy journals_admin on public.journals    for select to authenticated using ((select public.is_admin()));
create policy contacts_admin on public.contacts    for select to authenticated using ((select public.is_admin()));
create policy tasks_admin    on public.tasks       for select to authenticated using ((select public.is_admin()));
create policy checks_admin   on public.task_checks for select to authenticated using ((select public.is_admin()));

do $$ begin alter publication supabase_realtime add table public.team_config; exception when duplicate_object then null; end $$;
