# Soulful Gather — Christian Community Hangouts

**Meaningful gatherings that nourish the soul.**

**Live at: https://soulfulgather.com** (also served at https://aneesh15here.github.io/christian-singles-hangouts/)
(GitHub Pages, connected to a live Supabase backend)

A community hangout app: browse and host group activities (hikes, coffee,
board games, Bible study, potlucks, and more), RSVP, see who's going, and
chat with the group before you meet up. It's a non-denominational Christian
community open to everyone — any relationship status, any church background
(Catholic, Protestant, Orthodox, non-denominational, or still exploring) —
and members are encouraged to bring friends of any faith or none. The
pitch, in the app's own words: less scrolling, more showing up — the app
plans the hangout, the good part happens in person.

By design there is no private/direct messaging between individual members —
the only chat is a group chat scoped to a specific event — and no
swiping/matching mechanics of any kind. (The repo is named
`christian-singles-hangouts` for historical reasons; the app itself is
simply "Soulful Gather" and is not singles-specific.)

## ⚠️ Setup required before this app works

Unlike the other two apps in this folder (`aus-trip-weather`,
`voice-log-organizer`), **this app needs a real backend to be a real,
shared, multi-user app.** Out of the box it runs in a local **demo mode**
with sample data stored only in your browser — good for trying out the UI,
but not shared with anyone else. (You can also force demo mode at any time
by adding `?demo=1` to the URL, even with a real backend configured —
handy for experimenting without touching shared data.) To make it a real app where one person's
event is visible and joinable by others, you need to connect a free
Supabase project. See **Setup** below — it takes about 5 minutes.

## Why Supabase + plain HTML/CSS/JS (no framework)

The other two apps in this folder are fully static (no backend at all), so
plain HTML/CSS/JS with no build step was a natural fit. This app is
different: events created by one person must be visible and joinable by
*other* people, which means it needs a real shared database and
authentication — a genuine backend, not just local storage.

Supabase was chosen because it gives you a hosted Postgres database, an
auth system (signup/login), auto-generated REST APIs, and realtime
subscriptions (used for event group chat) — all from the client, with no
server code to write or host. That let the frontend stay exactly as plain
as the other two apps: HTML/CSS/JS, no build step, no framework, just the
`@supabase/supabase-js` client loaded from a CDN `<script>` tag. A frontend
framework was considered and deliberately skipped — the view-switching in
`app.js` (a small hash-based router with a handful of show/hide panels) is
simple enough that React/Vue would have added tooling overhead without
solving a real problem here.

## Setup

### 1. Create a free Supabase project

1. Go to [supabase.com](https://supabase.com) and sign up (free tier is
   enough).
2. Create a new project. Pick any name/region; set a database password
   (you won't need it day-to-day — Supabase manages the connection for
   you).
3. Wait a minute or two for the project to finish provisioning.

### 2. Run the database schema

1. In your Supabase project, open the **SQL Editor** (left sidebar).
2. Open [`schema.sql`](schema.sql) from this folder, copy its entire
   contents, paste into a new query, and run it.
3. This creates all tables (`profiles`, `events`, `rsvps`,
   `event_messages`, `reports`, `notifications`), sets up Row Level
   Security policies on every table, adds a trigger that auto-creates a
   profile when someone signs up, and enables realtime for event chat.
   This is for a **brand-new** Supabase project only — the `create policy`
   statements aren't guarded, so running the full file against a project
   that already has these tables will error on the first policy it tries
   to recreate. If you set this app up before the `notifications` table
   existed, don't re-run the whole file — just run its `notifications`
   block (the `create table`, its index, and its three `create policy`
   statements) on its own; that part is additive and won't conflict with
   anything. Until you do, the app simply skips sending edit notifications
   rather than erroring.

### 3. Get your project's API keys

1. In your Supabase project, go to **Project Settings → API**.
2. Copy the **Project URL** and the **anon / public** key (not the
   `service_role` key — that one must never go in client-side code).

### 4. Add the keys to this app

Open [`config.js`](config.js) in this folder and fill in the two values:

```js
window.APP_CONFIG = {
  SUPABASE_URL: 'https://your-project-ref.supabase.co',
  SUPABASE_ANON_KEY: 'your-anon-public-key',
};
```

It's safe to commit these — the anon key is meant to be public; access
control is enforced entirely by the Row Level Security policies in
`schema.sql`, not by keeping this key secret.

### 5. Email confirmation (your choice — the app handles either)

By default, Supabase requires users to confirm their email before they can
log in (**Authentication → Sign In / Providers → Email → "Confirm email"**).

- **Leave it ON** (recommended for a real deployment): after signup the app
  shows a friendly "check your email to confirm" screen, and a
  login-before-confirmation is routed there too. For this to feel right in
  production you'll want a real SMTP provider (the built-in Supabase email
  sender is rate-limited to ~2/hour) and the correct **Site URL** (see the
  Production notes below), so the confirmation link redirects back to your
  real app instead of `localhost:3000`.
- **Turn it OFF** for quick local testing: signups log straight in with no
  email step.

### Production notes (important before going live)

- **Set the Site URL.** In **Authentication → URL Configuration**, set
  **Site URL** to wherever the app is actually hosted (e.g. your GitHub
  Pages / Netlify URL, or `http://localhost:4680` for local dev). It
  defaults to `http://localhost:3000`, which is where confirmation-email
  links currently redirect — update it or confirmation links will bounce
  users to a dead address. Add any other origins you use under **Redirect
  URLs**.
- **Configure a custom SMTP sender** under **Authentication → Emails** if
  you keep email confirmation on, so confirmation emails actually scale
  past the built-in rate limit.

### 6. Run it locally

Any static file server works. From this folder:

```bash
python3 -m http.server 4680
```

Then open **http://localhost:4680**. Once `config.js` has real values,
the demo-mode banner disappears and you're talking to your live Supabase
project — sign up for real, create an event, and open the app in a second
browser (or incognito window) to see it as a second user.

## Using it

- **Landing page** sells the idea before asking for anything — community,
  low-pressure hangouts, bring-your-friends warmth — plus live community
  stats (member count, upcoming events, active-this-week) and an activity
  map showing where events are concentrated. Then Sign up / Log in.
- **Discover**: browse upcoming events, filter by date, location, or
  activity type. Multiple hosts can run different events at the same
  place and overlapping times — that's intentional, not a conflict the
  app warns about.
- **Host**: pick a suggested-plan template (coffee, hike, board games,
  potluck, service/volunteering, Bible study, trivia, pickup sports) to
  prefill a title/description/category, or write your own from scratch.
  Set date, time, location, and an optional capacity. Check "🔒
  Invite-only" to make it visible only to people you invite by email —
  see **Invite-only events** below.
- **Edit an event**: hosts see an "✏️ Edit event" button on their own
  event's page — same form as hosting, prefilled. If the **date, time, or
  location** changes, everyone who's RSVP'd gets an in-app notification;
  trivial edits (typo fixes in the description, capacity tweaks) don't
  notify anyone.
- **Invite**: hosts see an "✉️ Invite" button on their own event's page,
  opening a modal to invite by email and/or phone number (comma-separate
  multiple emails; one phone number at a time). Like the Share menu,
  there's no email/SMS-sending backend — it opens the host's own mail or
  messaging app with a prefilled invite (subject and body for email, a
  shorter body for text) that always includes the host's name, the event
  details, and an optional personal note. If the host has a bio, it's
  included too, so the recipient knows who's inviting them before they
  even open the app.
- **Notifications**: a 🔔 bell in the nav shows an unread count and a
  simple list — currently used for "the host changed the plan" updates on
  events you've joined. In-app only (no email/push); opening the panel
  marks them read.
- **Event detail**: see the full plan, who's going (name + optional
  one-line intro, not contact info), RSVP or cancel, and chat with the
  group. Chat is visible only to the host and people who've RSVP'd. A
  **Share** menu covers Facebook (opens the standard share dialog),
  Instagram (copies a caption + link, since Instagram has no web
  share-intent for posts — paste it into a Story or DM), email (a
  prefilled `mailto:`), and plain copy-link.
- **My Events**: Attending / Hosting / 🔒 Invited tabs, plus an inline
  reminder banner for anything you're attending in the next 48 hours.
- **Profile**: name + optional short bio — that's the entire personal data
  footprint.
- **Map** (`#/map`): a dedicated, larger version of the landing-page
  activity map, plus events-plotted / distinct-spots / most-active-area
  stats. Viewable without logging in, same as Guidelines.
- **Guidelines**: plain-language community guidelines (kindness, respect,
  safety, everyone welcome).
- **Report**: any event page has a Report button. Reports go into a
  `reports` table that no regular user (including the reporter) can read
  back — only an admin, via the in-app **Admin dashboard** or the
  Supabase dashboard, can see them (see the RLS notes in `schema.sql`).
- **Feedback**: a quiet "Feedback" link in the footer of every page opens a
  form to send a note to the admin, with a mailto fallback. See the
  **Feedback / contact admin** section below.
- **Admin** (`#/admin`): visible in the nav only to admins. A read-only
  dashboard — member directory (with email), every event, and the
  moderation queue (reports, with a status dropdown, and feedback). See
  the **Admin dashboard** section below for how to bootstrap your first
  admin.

## Data model

- **`profiles`** — one row per user (`id` = `auth.users.id`), `name`,
  optional `bio`, `is_admin` (default `false`). Auto-created by a trigger
  on signup; see **Admin dashboard** below for how `is_admin` is used.
- **`events`** — `host_id`, `title`, `description`, `category`,
  `event_date`, `event_time`, `location_name`, optional `latitude`/
  `longitude` (geocoded from the location name at creation, for the
  activity map), optional `capacity`, `is_private` (default `false`).
  Nothing prevents two events at the same place/time — that's deliberate.
  See **Invite-only events** below for what `is_private` does.
- **`event_invites`** — `event_id`, `invited_email`, `invited_by`. The
  guest list for a private event; see **Invite-only events** below.
- **`rsvps`** — links a `user_id` to an `event_id`, with an optional
  one-line `intro_line`. Unique per (event, user).
- **`event_messages`** — group chat scoped to one `event_id`. RLS only
  lets the event's host and RSVP'd attendees read or post.
- **`reports`** — `reporter_id`, optional `event_id` / `reported_user_id`,
  `reason`, optional `details`, `status`. Insert-only for regular users;
  admins can view and update `status` (see **Admin dashboard** below).
- **`feedback`** — optional `user_id`, optional reply-to `email`, `message`.
  Insert-only for regular users, same pattern as `reports`; admins can
  view it.
- **`notifications`** — `event_id`, `recipient_id`, `message`, `read`.
  Created by an event's host when they change the date/time/location of an
  event with RSVPs; each recipient can only read and mark-read their own.
  **Databases created before this feature need a migration** — run just
  the `notifications` block from `schema.sql` (don't re-run the whole
  file; its unguarded `create policy` statements will error against
  tables that already exist). Until then the app degrades gracefully:
  edits still save, the bell shows nothing, and no errors surface.

Every table has Row Level Security enabled; see `schema.sql` for the full
policy list and reasoning.

## Community stats & activity map

The landing page shows live community numbers (members, upcoming events,
distinct people who RSVP'd or hosted in the last 7 days) queried straight
from the database, plus a Leaflet/OpenStreetMap map where each circle is a
venue with events — circle size scales with how many events happen there.
There's also a dedicated **Map page** (`#/map`, linked from the nav bar and
from "See the full activity map" on the landing page) with a larger map and
a few extra stats (total events plotted, distinct spots, most active area).
It's built from the same per-event coordinates as the landing-page mini
map — there's no per-member location tracking anywhere in the app, so this
adds no new privacy surface.

- **Coordinates** come from a best-effort geocode of the venue name via
  OpenStreetMap's free [Nominatim](https://nominatim.org/) API when an
  event is created. If geocoding fails or times out (~4s), the event is
  simply created without coordinates and doesn't appear on the map —
  creation never blocks on the map.
- **Existing databases** created before this feature need two columns
  added — run just (re-running the whole `schema.sql` file against an
  existing project will error on its unguarded `create policy`
  statements):

  ```sql
  alter table public.events add column if not exists latitude double precision;
  alter table public.events add column if not exists longitude double precision;
  ```

  Until that's run, the app works normally and the map shows a friendly
  "fills in as events are created" note (the client detects the missing
  columns and degrades gracefully).
- Geocoding by venue *name* is approximate — a specific address or
  "Venue, Suburb/City" geocodes much better than a bare venue name.

## Marketing kit ("Spread the word")

`#/share` (linked from the nav and every page's footer, no login needed) is a
self-serve marketing page:

- A branded **QR code** (`qr.png`, generated offline, points at
  https://soulfulgather.com) with copy-link, native share
  (`navigator.share`, shown only where supported), and a **Print a flyer**
  button — a print stylesheet renders a clean one-page poster with the QR.
- **Copy-paste blurbs** tuned per channel: group chat, Instagram
  caption/story, church bulletin announcement.
- The site also ships **Open Graph / Twitter card tags + `og-image.png`**
  (1200×630, generated offline), a canonical URL, JSON-LD, `robots.txt`,
  and `sitemap.xml`, so links pasted into iMessage/WhatsApp/Instagram/Facebook
  unfurl into a rich branded card and search engines index it properly.
- Event pages additionally offer **Add to calendar** (a standards-compliant
  `.ics` download) and a native share option in the Share menu on devices
  that support it.

Regenerate `qr.png` / `og-image.png` with [`scripts/gen_assets.py`](scripts/gen_assets.py)
(qrcode + Pillow) if the domain or branding changes:

```bash
python3 -m venv /tmp/gen-assets-venv
/tmp/gen-assets-venv/bin/pip install pillow qrcode
/tmp/gen-assets-venv/bin/python3 scripts/gen_assets.py
```

**"Buy me a coffee" donations**: set `DONATE_URL` in `config.js` to a
buymeacoffee.com / ko-fi.com / paypal.me link and a donate card appears on
the Spread-the-word page plus a "☕ Buy me a coffee" link in every page's
footer. Leave it empty (the default) and every donate element stays hidden —
the app never shows a dead button.

## Feedback / contact admin

A low-key "Feedback" link sits in the footer on every page (easy to miss
unless you're looking for it, by design — this isn't a primary nav item).
It opens a small form (message + optional reply-to email) that anyone, logged
in or not, can submit. There's also a permanent "email us directly" mailto
link to the app's public admin address (`soulfulgather@outlook.com`
— a dedicated address for this purpose, not anyone's personal email) right
under the form, since there's no email-sending backend — submissions are also
simply stored in a `feedback` table, readable from the in-app **Admin
dashboard** (see below) or the Supabase dashboard.

- **New table required.** If your Supabase project was set up before this
  feature, run just the new section below (not the whole `schema.sql` —
  its unguarded `create policy` statements will error against tables that
  already exist):

  ```sql
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
  ```

  Until that's run, submitting the form shows a friendly inline error
  pointing at the mailto fallback instead of silently failing.
- Like `reports`, there's intentionally no select/update/delete policy for
  regular users — feedback is insert-only from the client. Only an admin
  (see below) or someone with the Supabase dashboard / a service-role key
  can read submissions.
- Works in demo mode too: submissions are written to `localStorage` under
  the `feedback` key, same pattern as every other mock table.

## Admin dashboard

A read-only `#/admin` page (linked from the nav bar, but only visible to
admins) shows the member directory, every event, and the moderation queue
(reports + feedback) — all from inside the app, no Supabase dashboard
required for day-to-day use.

- **New: `is_admin` flag + policies required.** If your Supabase project
  predates this feature, run just this block (not the whole `schema.sql`):

  ```sql
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

  create or replace function public.admin_list_members()
  returns table (id uuid, name text, bio text, email text, is_admin boolean, joined_at timestamptz)
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
  ```

- **There's no UI to grant admin, by design** — bootstrapping the first
  admin always requires a direct SQL update in the Supabase SQL Editor:

  ```sql
  update public.profiles set is_admin = true
  where id = (select id from auth.users where email = 'you@example.com');
  ```

- Member email lives in `auth.users`, not `public.profiles`, and the
  `auth` schema isn't exposed over the client API — `admin_list_members()`
  bridges that gap with a `security definer` function. Its internal
  `is_admin` check means a non-admin caller who somehow invokes it just
  gets zero rows back, never an error or another member's data.
- Enforcement is server-side (RLS + the function's own admin check) —
  the nav link being hidden and the router redirecting non-admins away
  from `#/admin` is just UX, not the actual security boundary.
- Works in demo mode too: the seeded "Maria" account
  (`maria@example.com` / `demo`) is the demo admin, so you can try the
  whole dashboard without touching Supabase.

## Invite-only events

Hosts can check "🔒 Invite-only" when creating (or editing) an event and
list guests by email in the textarea that appears. A private event is
**invisible at the database level**, not just hidden in the UI — RLS makes
the row unreadable to everyone except its host, the people on its guest
list (matched by their account's email), and admins. Someone who isn't
invited gets the same "couldn't be found" message as a deleted event, on
Discover, on a direct link, or querying the API directly — nothing ever
confirms a private event exists to someone who isn't on the list.

- The invite textarea is the single source of truth for the guest list:
  editing an already-private event pre-fills it with everyone currently
  invited, and saving reconciles the list (removed emails lose access,
  added ones gain it). There's a dedicated **🔒 Invited** tab on My Events
  so invitees can find events they've been invited to without needing to
  keep the original link — invite-only events don't show up on Discover
  for anyone *except* the people who can see them, so this tab is the
  fallback if a link gets lost.
- Guests need a Soulful Gather account with a matching email — there's no
  anonymous/token-based access. This keeps the security model identical
  to the rest of the app (everything already requires login except
  landing/guidelines/map), rather than introducing a second, weaker access
  path.
- **New table + modified policies required.** This migration is different
  from the others in this file — it doesn't just add new policies, it
  **replaces** the original "Events/RSVPs are viewable by everyone"
  policies so they also check `is_private`. For every event that predates
  this feature (`is_private` defaults to `false`), nothing changes —
  `not is_private` alone keeps the row public. Run this in the SQL Editor
  (not the whole `schema.sql`):

  ```sql
  alter table public.events add column if not exists is_private boolean not null default false;

  create table if not exists public.event_invites (
    id uuid primary key default gen_random_uuid(),
    event_id uuid not null references public.events (id) on delete cascade,
    invited_email text not null,
    invited_by uuid not null references public.profiles (id) on delete cascade,
    created_at timestamptz not null default now(),
    unique (event_id, invited_email)
  );

  create index if not exists event_invites_event_id_idx on public.event_invites (event_id);
  create index if not exists event_invites_email_idx on public.event_invites (invited_email);

  alter table public.event_invites enable row level security;

  create policy "Hosts and invitees can view an event's invite list"
    on public.event_invites for select
    using (
      exists (select 1 from public.events e where e.id = event_invites.event_id and e.host_id = auth.uid())
      or invited_email = lower(coalesce(auth.jwt() ->> 'email', ''))
    );

  create policy "Hosts can invite people to their own events"
    on public.event_invites for insert
    with check (
      exists (select 1 from public.events e where e.id = event_invites.event_id and e.host_id = auth.uid())
    );

  create policy "Hosts can remove invites from their own events"
    on public.event_invites for delete
    using (
      exists (select 1 from public.events e where e.id = event_invites.event_id and e.host_id = auth.uid())
    );

  drop policy if exists "Events are viewable by everyone" on public.events;
  create policy "Events are viewable unless invite-only"
    on public.events for select
    using (
      not is_private
      or host_id = auth.uid()
      or exists (
        select 1 from public.event_invites ei
        where ei.event_id = events.id and ei.invited_email = lower(coalesce(auth.jwt() ->> 'email', ''))
      )
      or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
    );

  drop policy if exists "RSVPs are viewable by everyone" on public.rsvps;
  create policy "RSVPs viewable if the event is visible to you"
    on public.rsvps for select
    using (
      exists (
        select 1 from public.events e
        where e.id = rsvps.event_id
          and (
            not e.is_private
            or e.host_id = auth.uid()
            or exists (select 1 from public.event_invites ei where ei.event_id = e.id and ei.invited_email = lower(coalesce(auth.jwt() ->> 'email', '')))
            or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
          )
      )
    );

  drop policy if exists "Users can RSVP as themselves" on public.rsvps;
  create policy "Users can RSVP as themselves to events they can see"
    on public.rsvps for insert
    with check (
      auth.uid() = user_id
      and exists (
        select 1 from public.events e
        where e.id = rsvps.event_id
          and (
            not e.is_private
            or e.host_id = auth.uid()
            or exists (select 1 from public.event_invites ei where ei.event_id = e.id and ei.invited_email = lower(coalesce(auth.jwt() ->> 'email', '')))
          )
      )
    );
  ```

  Until this is run, checking "Invite-only" still creates the event (as an
  ordinary public one — `createEvent`/`updateEvent` silently drop
  `is_private` if the column doesn't exist yet) and the guest-list save
  silently no-ops, same graceful-degradation pattern as every other
  migration in this file.
- Works in demo mode too: create a private event as one seeded account and
  invite the other's email (`maria@example.com` / `james@example.com`,
  both password `demo`) to see it work from both sides — including that a
  third, uninvited account genuinely can't find it.

## What's tested

**Verified end-to-end against a live Supabase project** (real Postgres +
Auth + Realtime, two separate real user accounts, in a browser):
- **Signup + profile trigger** — signing up creates a real `auth.users`
  row and the database trigger auto-creates the matching `profiles` row
  with the name from signup metadata.
- **The nested `profiles(...)` embeds work** — both the flagged-risky
  spots: `events` → `host:profiles(name)` (Discover, event detail, My
  Events) and `rsvps` → `profiles(name)` (the "who's going" attendee
  list). Attendee names and intro lines render correctly.
- **Create event** — persisted to the real `events` table and immediately
  visible to *other* users (the core "shared data across users"
  requirement — a second account saw the first account's event in the
  feed and opened it).
- **RSVP** — a second user RSVP'd, the attendee list and capacity count
  ("1 / 10 spots filled") updated, and cancel works.
- **Group chat over realtime + RLS** — host and an RSVP'd attendee can
  both read and post; messages arrive live via the Supabase realtime
  subscription; a non-attendee cannot (enforced by RLS policy).
- **Report flow + RLS lockdown** — submitting a report succeeds, and a
  client-side read of the `reports` table returns empty (regular users,
  including the reporter, cannot read reports back — only an admin via the
  dashboard/service role can). Both behaviors confirmed live.
- **Email-confirmation flow** — with Supabase's "Confirm email" enabled,
  signup shows a "check your email" pending screen, and logging in before
  confirming routes to that same screen (with a resend option) instead of
  a raw error.

**Bug found and fixed during live testing:** realtime-delivered chat
messages arrive as the raw table row with no joined profile, so the sender
initially rendered as "Someone". Fixed with a per-conversation user-id →
name cache; live messages now show the correct sender name. (This never
surfaced in demo mode because the mock fanned out a fully-hydrated object.)

**Also verified earlier in demo mode** (`mock-api.js`, localStorage): the
same flows plus XSS-escaping of user text (a `<img onerror=...>` payload
rendered as inert text), the share-link → login → return-to-event
redirect, and mobile layout at 375px.

**Edit event + notifications** (new): verified in demo mode with two
seeded accounts — a host editing an event's time and location correctly
creates an in-app notification for the one RSVP'd attendee (and only for
the attendee, not the host); the 🔔 badge shows the unread count on the
attendee's next login; opening the panel shows the change message,
clears the badge, and clicking a notification navigates to that event.
Editing a field that isn't date/time/location (e.g. fixing a typo in the
description) correctly sends no notification. **Not yet re-verified
against the live Supabase project** in this pass — the code degrades
gracefully (silently skips notifications) if the live database hasn't
had the `notifications` migration in `schema.sql` re-run yet, so nothing
breaks either way, but re-run the schema once you deploy this to confirm
notifications actually land for your real users.

**Not exhaustively tested:** realtime fan-out across two *simultaneously
open* browsers (verified the subscription delivers within a single client;
the code path is identical for a second client), and Supabase's
transactional email at scale (the built-in email sender is rate-limited to
a couple of messages per hour — fine for testing, but for production you'll
want to configure a real SMTP provider under Authentication → Emails).

## Notable assumptions / design decisions

- **Email/password auth**, not magic links — one less piece of email
  configuration to get right before the app works. Supabase supports
  magic links too if you'd prefer that; swapping it in would mean adding
  a `signInWithOtp` call and handling the redirect-back-to-app flow.
- **No "communities" entity.** Categories/tags on events plus the
  Discover filters and My Events page were judged enough to give a sense
  of belonging without adding another data model to build and maintain.
- **Client-side "reminders"** are a lightweight inline banner on My Events
  for anything happening in the next 48 hours — not real push
  notifications (which would need a server-side scheduler and the Web
  Push API, out of scope for a no-backend-server v1).
- **No waitlist** when an event hits capacity — the RSVP button just
  disables with "Event full." Worth adding later if it comes up.
- **Demo mode** (`mock-api.js`) is a genuine, permanent fallback, not just
  a test harness — it's how the app behaves automatically whenever
  `config.js` isn't filled in, so anyone can try the whole UI before
  setting up a backend.

## Files

- `index.html` — page structure (landing, auth, discover, event detail,
  create, my events, profile, guidelines, report modal)
- `style.css` — styling
- `config.js` — your Supabase project URL + anon key (fill this in)
- `supabase-client.js` — decides real vs. demo mode, creates the Supabase
  client
- `api.js` — real backend: every data operation, talking to Supabase
- `mock-api.js` — demo backend: the same operations, backed by
  `localStorage`, seeded with sample events
- `app.js` — routing, rendering, and all UI wiring (talks only to
  `window.Api`, never directly to Supabase or localStorage)
- `schema.sql` — run this once in your Supabase project's SQL Editor
- `manifest.json`, `sw.js`, `icon.svg` — PWA installability, matching the
  pattern used by the other apps in this folder
- `scripts/gen_assets.py` — regenerates `og-image.png` / `qr.png` from the
  current branding (dev-only tool, not part of the app's runtime)
