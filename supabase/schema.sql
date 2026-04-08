-- FinOpSys CRM — Supabase Schema (Auth + Per-user isolation)
-- Run this in: Supabase Dashboard -> SQL Editor -> New Query

create extension if not exists "pgcrypto";

-- 1) Owners
create table if not exists crm_owners (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade default auth.uid(),
  name        text not null,
  sort_order  integer default 0,
  created_at  timestamptz default now()
);

-- 2) Contacts (leads + clients)
create table if not exists crm_contacts (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade default auth.uid(),
  company       text not null,
  contact       text not null,
  email         text,
  phone         text,
  stage         text not null default 'New Lead',
  status        text not null default 'Lead',
  service       text not null default 'Bookkeeping',
  source        text not null default 'Referral',
  monthlyvalue  numeric(12,2) not null default 0,
  owner         text not null,
  nextfollowup  date,
  priority      text not null default 'Medium',
  notes         text,
  created_at    timestamptz default now()
);

-- 3) Tasks
create table if not exists crm_tasks (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade default auth.uid(),
  title       text not null,
  due         date,
  owner       text not null,
  type        text not null default 'Task',
  status      text not null default 'Open',
  created_at  timestamptz default now()
);

-- 4) Activities (timeline per contact)
create table if not exists crm_activities (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade default auth.uid(),
  contact_id  uuid references crm_contacts(id) on delete cascade,
  company     text,
  type        text not null,
  subject     text,
  note        text,
  date        date not null default current_date,
  created_at  timestamptz default now()
);

-- Backward compatibility: existing tables from old schema
alter table if exists crm_owners     add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table if exists crm_contacts   add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table if exists crm_tasks      add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table if exists crm_activities add column if not exists user_id uuid references auth.users(id) on delete cascade;

alter table if exists crm_owners     alter column user_id set default auth.uid();
alter table if exists crm_contacts   alter column user_id set default auth.uid();
alter table if exists crm_tasks      alter column user_id set default auth.uid();
alter table if exists crm_activities alter column user_id set default auth.uid();

-- Helpful indexes
create index if not exists idx_owners_user         on crm_owners(user_id);
create unique index if not exists idx_owners_user_name on crm_owners(user_id, name);
create index if not exists idx_contacts_user       on crm_contacts(user_id);
create index if not exists idx_contacts_stage      on crm_contacts(stage);
create index if not exists idx_contacts_owner      on crm_contacts(owner);
create index if not exists idx_contacts_followup   on crm_contacts(nextfollowup);
create index if not exists idx_tasks_user          on crm_tasks(user_id);
create index if not exists idx_tasks_owner         on crm_tasks(owner);
create index if not exists idx_tasks_status        on crm_tasks(status);
create index if not exists idx_activities_user     on crm_activities(user_id);
create index if not exists idx_activities_contact  on crm_activities(contact_id);

-- RLS: each user can access only their own rows
alter table crm_owners     enable row level security;
alter table crm_contacts   enable row level security;
alter table crm_tasks      enable row level security;
alter table crm_activities enable row level security;

drop policy if exists "Public full access — owners" on crm_owners;
drop policy if exists "Public full access — contacts" on crm_contacts;
drop policy if exists "Public full access — tasks" on crm_tasks;
drop policy if exists "Public full access — activities" on crm_activities;

drop policy if exists "Public full access - owners" on crm_owners;
drop policy if exists "Public full access - contacts" on crm_contacts;
drop policy if exists "Public full access - tasks" on crm_tasks;
drop policy if exists "Public full access - activities" on crm_activities;

drop policy if exists "owners_user_isolation" on crm_owners;
drop policy if exists "contacts_user_isolation" on crm_contacts;
drop policy if exists "tasks_user_isolation" on crm_tasks;
drop policy if exists "activities_user_isolation" on crm_activities;

create policy "owners_user_isolation"
  on crm_owners
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "contacts_user_isolation"
  on crm_contacts
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "tasks_user_isolation"
  on crm_tasks
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "activities_user_isolation"
  on crm_activities
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
