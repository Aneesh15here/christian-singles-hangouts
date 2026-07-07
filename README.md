# Gather — Christian Singles Hangouts

A community hangout app for Christian singles: browse and host group
activities (hikes, coffee, board games, Bible study, potlucks, and more),
RSVP, see who's going, and chat with the group before you meet up.

**This is explicitly not a dating app.** There's no swiping, no "who liked
you," no matching algorithm, and no couple-pairing anywhere in the product.
There is also no private/direct messaging between individual members —
the only chat is a group chat scoped to a specific event. The app's own
copy (see the landing page and the Guidelines page) says this plainly.

## ⚠️ Setup required before this app works

Unlike the other two apps in this folder (`aus-trip-weather`,
`voice-log-organizer`), **this app needs a real backend to be a real,
shared, multi-user app.** Out of the box it runs in a local **demo mode**
with sample data stored only in your browser — good for trying out the UI,
but not shared with anyone else. To make it a real app where one person's
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
   `event_messages`, `reports`), sets up Row Level Security policies on
   every table, adds a trigger that auto-creates a profile when someone
   signs up, and enables realtime for event chat. It's safe to re-run.

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
  low-pressure hangouts, explicitly *not* a dating space — then Sign up /
  Log in.
- **Discover**: browse upcoming events, filter by date, location, or
  activity type. Multiple hosts can run different events at the same
  place and overlapping times — that's intentional, not a conflict the
  app warns about.
- **Host**: pick a suggested-plan template (coffee, hike, board games,
  potluck, service/volunteering, Bible study, trivia, pickup sports) to
  prefill a title/description/category, or write your own from scratch.
  Set date, time, location, and an optional capacity.
- **Event detail**: see the full plan, who's going (name + optional
  one-line intro, not contact info), RSVP or cancel, share a one-tap
  link, and chat with the group. Chat is visible only to the host and
  people who've RSVP'd.
- **My Events**: separate Attending / Hosting tabs, plus an inline
  reminder banner for anything you're attending in the next 48 hours.
- **Profile**: name + optional short bio — that's the entire personal data
  footprint.
- **Guidelines**: plain-language community guidelines (kindness, respect,
  safety, and a reminder that this isn't a dating space).
- **Report**: any event page has a Report button. Reports go straight into
  a `reports` table that only an admin using the Supabase dashboard can
  read (no regular user, including the reporter, can read reports back —
  see the RLS notes in `schema.sql`).

## Data model

- **`profiles`** — one row per user (`id` = `auth.users.id`), `name`,
  optional `bio`. Auto-created by a trigger on signup.
- **`events`** — `host_id`, `title`, `description`, `category`,
  `event_date`, `event_time`, `location_name`, optional `capacity`.
  Nothing prevents two events at the same place/time — that's deliberate.
- **`rsvps`** — links a `user_id` to an `event_id`, with an optional
  one-line `intro_line`. Unique per (event, user).
- **`event_messages`** — group chat scoped to one `event_id`. RLS only
  lets the event's host and RSVP'd attendees read or post.
- **`reports`** — `reporter_id`, optional `event_id` / `reported_user_id`,
  `reason`, optional `details`, `status`. Insert-only from the client.

Every table has Row Level Security enabled; see `schema.sql` for the full
policy list and reasoning.

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
