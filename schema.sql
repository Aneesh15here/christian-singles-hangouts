-- Gather (Christian community hangouts) — database schema for Supabase (Postgres)
--
-- How to use: open your Supabase project's SQL Editor and run this whole
-- file once. It creates all tables, row-level security (RLS) policies,
-- a trigger that auto-creates a profile row on signup, and enables
-- realtime for event group chat.
--
-- Design notes:
--   * Every table has RLS enabled — nothing is readable/writable unless a
--     policy explicitly allows it.
--   * "reports" has no SELECT policy for regular users at all — reports
--     are only visible via the Supabase dashboard (using the service role,
--     which bypasses RLS), so a report's contents stay private between the
--     reporter and whoever administers the project.
--   * There is deliberately no private/direct-messaging table. The only
--     messaging is event_messages, scoped to one event and visible only to
--     that event's host + attendees.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- profiles: one row per user, minimal data (name + optional short bio).
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null,
  bio text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Profiles are viewable by everyone"
  on public.profiles for select
  using (true);

create policy "Users can insert their own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "Users can update their own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- Auto-create a profile row whenever someone signs up, using the display
-- name passed in at signup (falls back to the email's local part).
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ---------------------------------------------------------------------
-- events: hosted by a user, deliberately allow overlapping events at the
-- same place/time — that's a feature, not a conflict to prevent.
-- ---------------------------------------------------------------------
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  description text not null,
  category text not null default 'other',
  event_date date not null,
  event_time time not null,
  location_name text not null,
  -- Optional coordinates for the community activity map, geocoded from
  -- location_name at creation time (best-effort; null if geocoding fails).
  latitude double precision,
  longitude double precision,
  capacity int,
  created_at timestamptz not null default now()
);

-- For databases created before the activity map existed (safe to re-run).
alter table public.events add column if not exists latitude double precision;
alter table public.events add column if not exists longitude double precision;

create index if not exists events_event_date_idx on public.events (event_date);
create index if not exists events_category_idx on public.events (category);

alter table public.events enable row level security;

create policy "Events are viewable by everyone"
  on public.events for select
  using (true);

create policy "Authenticated users can create events"
  on public.events for insert
  with check (auth.uid() = host_id);

create policy "Hosts can update their own events"
  on public.events for update
  using (auth.uid() = host_id);

create policy "Hosts can delete their own events"
  on public.events for delete
  using (auth.uid() = host_id);

-- ---------------------------------------------------------------------
-- rsvps: sign-ups linking a user to an event. One RSVP per user/event.
-- ---------------------------------------------------------------------
create table if not exists public.rsvps (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  intro_line text,
  created_at timestamptz not null default now(),
  unique (event_id, user_id)
);

alter table public.rsvps enable row level security;

create policy "RSVPs are viewable by everyone"
  on public.rsvps for select
  using (true);

create policy "Users can RSVP as themselves"
  on public.rsvps for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own RSVP"
  on public.rsvps for update
  using (auth.uid() = user_id);

create policy "Users can cancel their own RSVP"
  on public.rsvps for delete
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------
-- event_messages: group chat scoped to one event. Visible only to that
-- event's host and its RSVP'd attendees. No private/direct messaging.
-- ---------------------------------------------------------------------
create table if not exists public.event_messages (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists event_messages_event_id_idx on public.event_messages (event_id);

alter table public.event_messages enable row level security;

create policy "Chat viewable by that event's host and attendees"
  on public.event_messages for select
  using (
    exists (select 1 from public.events e where e.id = event_messages.event_id and e.host_id = auth.uid())
    or exists (select 1 from public.rsvps r where r.event_id = event_messages.event_id and r.user_id = auth.uid())
  );

create policy "Host and attendees can post chat messages"
  on public.event_messages for insert
  with check (
    auth.uid() = user_id
    and (
      exists (select 1 from public.events e where e.id = event_messages.event_id and e.host_id = auth.uid())
      or exists (select 1 from public.rsvps r where r.event_id = event_messages.event_id and r.user_id = auth.uid())
    )
  );

-- ---------------------------------------------------------------------
-- reports: a simple v1 way to flag a concerning event or user. Insert-only
-- from the client — no one but an admin using the Supabase dashboard
-- (service role) can read these.
-- ---------------------------------------------------------------------
create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  event_id uuid references public.events (id) on delete set null,
  reported_user_id uuid references public.profiles (id) on delete set null,
  reason text not null,
  details text,
  status text not null default 'open',
  created_at timestamptz not null default now()
);

alter table public.reports enable row level security;

create policy "Users can submit reports"
  on public.reports for insert
  with check (auth.uid() = reporter_id);

-- Intentionally no select/update/delete policy for regular users.

-- ---------------------------------------------------------------------
-- feedback: notes/questions for the admin, sent from the in-app feedback
-- form (footer link). Insert-only from the client — read via the Supabase
-- dashboard, like reports. Logged-out visitors can send feedback too, so
-- user_id is optional; the reply-to email is whatever they choose to give.
-- ---------------------------------------------------------------------
create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete set null,
  email text,
  message text not null,
  created_at timestamptz not null default now()
);

alter table public.feedback enable row level security;

create policy "Anyone can send feedback"
  on public.feedback for insert
  with check (user_id is null or auth.uid() = user_id);

-- Intentionally no select/update/delete policy for regular users.

-- ---------------------------------------------------------------------
-- notifications: in-app notices for attendees when a host changes the
-- date, time, or location of an event they've RSVP'd to. No email/push —
-- these surface in the app's notification bell next time the person is in
-- the app. Recipients read and mark-read their own; only an event's host
-- can create notifications for that event.
-- ---------------------------------------------------------------------
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  message text not null,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists notifications_recipient_idx
  on public.notifications (recipient_id, read);

alter table public.notifications enable row level security;

create policy "Recipients can view their own notifications"
  on public.notifications for select
  using (auth.uid() = recipient_id);

create policy "Recipients can mark their own notifications read"
  on public.notifications for update
  using (auth.uid() = recipient_id);

create policy "Hosts can notify attendees of their own events"
  on public.notifications for insert
  with check (
    exists (select 1 from public.events e where e.id = notifications.event_id and e.host_id = auth.uid())
  );

-- ---------------------------------------------------------------------
-- admin: a single is_admin flag on profiles, gating a read-only admin
-- dashboard in the app (members, events, reports, feedback). There is no
-- UI to grant admin — bootstrapping the first admin always requires a
-- direct SQL update (see README).
-- ---------------------------------------------------------------------
alter table public.profiles add column if not exists is_admin boolean not null default false;

create policy "Admins can view all reports"
  on public.reports for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));

create policy "Admins can update report status"
  on public.reports for update
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));

create policy "Admins can view all feedback"
  on public.feedback for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));

-- Member email lives in auth.users, not public.profiles, and the auth
-- schema isn't exposed over the client API — this function bridges that
-- gap for admins only. security definer lets it read auth.users; the
-- exists() check means a non-admin caller just gets zero rows back
-- rather than an error.
create or replace function public.admin_list_members()
returns table (
  id uuid,
  name text,
  bio text,
  email text,
  is_admin boolean,
  joined_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select p.id, p.name, p.bio, u.email, p.is_admin, p.created_at
  from public.profiles p
  join auth.users u on u.id = p.id
  where exists (select 1 from public.profiles me where me.id = auth.uid() and me.is_admin)
  order by p.created_at desc;
$$;

revoke all on function public.admin_list_members() from public;
grant execute on function public.admin_list_members() to authenticated;

-- ---------------------------------------------------------------------
-- Realtime for event group chat (wrapped so re-running this file is safe)
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'event_messages'
  ) then
    alter publication supabase_realtime add table public.event_messages;
  end if;
end $$;
