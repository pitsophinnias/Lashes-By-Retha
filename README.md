# Lashes By Retha Business Platform

Stack: Vite + React (customer site + admin), Node.js + Express (backend, port 3002), PostgreSQL, Render, Cloudflare, GitHub

Sections: Product marketplace, Beauty class enrolment, Setmore API integration (appointments read-only)

## Run order

1. cd backend && npm install && npm run dev — http://localhost:3002
2. cd admin-dashboard && npm install && npm run dev — http://localhost:5274
3. cd customer-site && npm install && npm run dev — http://localhost:5273

## Environment variables

### backend

Copy backend/.env.example to backend/.env and fill in values.

- DATABASE_URL — PostgreSQL connection string
- TEST_DATABASE_URL — a separate local database `npm test` runs against, never DATABASE_URL - must be on localhost/127.0.0.1 with a name ending in `_test` (e.g. `postgresql://hbh_admin:hbh_password@localhost:5432/hairbyher_test`), or the suite refuses to run. Create it once with `psql -U postgres -c "CREATE DATABASE hairbyher_test OWNER hbh_admin;"`. Every table in it is truncated and reseeded before each test file runs, so it only ever holds whatever that file creates.
- PORT — port the API listens on (defaults to 3002)
- NODE_ENV — development or production; production enforces the required secrets below
- JWT_SECRET — signs auth tokens; required in production, must be at least 32 characters
- ADMIN_DEFAULT_PASSWORD — password for the seeded sysadmin account; required in production
- ADMIN_IDLE_TIMEOUT_MINUTES — admin session idle timeout; defaults to 5
- ADMIN_IDLE_WARNING_SECONDS — how long before idle timeout the "are you still there?" warning appears; defaults to 60
- ADMIN_MAX_SESSION_HOURS — hard ceiling on a session's age regardless of activity; defaults to 12
- ADMIN_SESSION_GRACE_SECONDS — tolerance for clock/network drift between the frontend's idle timer and this server's; defaults to 30. See "Admin session security" below.
- ALLOWED_ORIGINS — comma-separated list of frontend origins allowed to call the API
- SETMORE_REFRESH_TOKEN — from the Setmore dashboard, needed for appointment API access
- CLOUDINARY_URL — from your Cloudinary dashboard; when set, product/class/gallery uploads go to Cloudinary instead of local disk (needed on Render, since its free tier disk is wiped on every restart or sleep). Leave unset for local dev to keep using local disk storage.
- OZOW_SITE_CODE, OZOW_PRIVATE_KEY — from the Ozow dashboard's Sites tab
- OZOW_API_KEY — from the Ozow dashboard's Merchant Details tab
- OZOW_IS_TEST — true or false; defaults to true (test mode) when unset, so nothing goes live by accident
- OZOW_API_BASE — defaults to https://api.ozow.com
- OZOW_TEST_API_BASE — defaults to https://stagingapi.ozow.com; test (IsTest=true) transactions are only queryable there, not on the live API
- PUBLIC_API_URL — this backend's own public https URL, no trailing slash; used to build the Ozow and Payflex return/callback URLs
- CUSTOMER_SITE_URL — the customer site's public URL, no trailing slash; used to redirect the customer back after paying with Ozow or Payflex
- PAYFLEX_CLIENT_ID, PAYFLEX_CLIENT_SECRET — issued by the Payflex Integrations Team
- PAYFLEX_API_URL — defaults to the sandbox (UAT) base, https://api.uat.payflex.co.za; use https://api.payflex.co.za in production
- PAYFLEX_AUTH_URL — defaults to the sandbox auth endpoint, https://auth-uat.payflex.co.za/auth/merchant; use https://auth.payflex.co.za/auth/merchant in production
- PAYFLEX_AUDIENCE — defaults to the sandbox audience, https://auth-dev.payflex.co.za; use https://auth-production.payflex.co.za in production
- BACKUP_REPORT_TOKEN — shared secret backend/scripts/backup.sh sends as a Bearer token when it reports each backup run to POST /api/system/backups/report. Leave unset to disable that endpoint entirely.

Ozow counts as configured only when OZOW_SITE_CODE, OZOW_PRIVATE_KEY, OZOW_API_KEY, PUBLIC_API_URL and CUSTOMER_SITE_URL are all set. Payflex counts as configured only when PAYFLEX_CLIENT_ID, PAYFLEX_CLIENT_SECRET, PAYFLEX_API_URL, PAYFLEX_AUTH_URL, PAYFLEX_AUDIENCE, PUBLIC_API_URL and CUSTOMER_SITE_URL are all set. Checkout only offers whichever of Ozow/Payflex is configured; if neither is, ordering is blocked with a message to contact Retha on WhatsApp instead.

### customer-site and admin-dashboard

Copy .env.example to .env in each app and fill in values.

- VITE_API_URL — base URL of the backend API, no trailing /api (e.g. http://localhost:3002)

## Deploying to Render

The repo has a `render.yaml` Blueprint. On Render: New, Blueprint, pick this repo, and it creates `hairbyher-db`, `hairbyher-api`, `hairbyher-site` and `hairbyher-admin` in one go.

Render will ask for the secret values on first creation: `ADMIN_DEFAULT_PASSWORD`, `CLOUDINARY_URL`, `OZOW_SITE_CODE`, `OZOW_PRIVATE_KEY`, `OZOW_API_KEY`, `PAYFLEX_CLIENT_ID`, `PAYFLEX_CLIENT_SECRET`. `JWT_SECRET` is generated automatically.

If Render gives a service a different `onrender.com` address than its name (because the name was taken), update `PUBLIC_API_URL`, `ALLOWED_ORIGINS` and both `VITE_API_URL` values in the Blueprint to match, then redeploy the static sites with "Clear build cache & deploy".

Custom domains: the Blueprint adds `www.hairbyher.co.za` and `hairbyher.co.za` to the customer site. In Cloudflare, both must be CNAME records pointing to `hairbyher-site.onrender.com`, set to DNS only (grey cloud) until Render shows them verified. Do not use an A record to 216.24.57.1 with Cloudflare, it causes Error 1000.

`OZOW_IS_TEST` stays `true` until a test payment has passed.

If you have existing images under backend/uploads from before CLOUDINARY_URL was set, run `npm run migrate:uploads` from backend/ (with CLOUDINARY_URL set in your environment) to upload them to Cloudinary and update the database. It is safe to run more than once.

## Database backups

Render's free Postgres plan has no shell access to run `pg_dump` or cron against it, so backups run from cron on whichever server actually hosts the database (e.g. the Zeecom server), using `backend/scripts/backup.sh`:

1. Set `BACKUP_REPORT_TOKEN` on the backend (any long random string).
2. On the database server, add a crontab entry that sets `DATABASE_URL`, `BACKUP_REPORT_TOKEN` (same value as above) and `REPORT_URL` (the backend's `/api/system/backups/report` URL), then runs `backend/scripts/backup.sh` - see the comments at the top of that script for the exact variables and an example crontab line.
3. Optionally set `RCLONE_REMOTE` too, for an offsite copy of each backup via `rclone`.

## Sales and deleting products

**Putting a product on sale** - on a product's card in the admin Products page, click "Put on Sale" (it becomes "Manage Sale" once anything on it is on sale). There are no start/end dates - you switch a sale on and off yourself.

- A product with no lash length/curl or custom options (shade, size, etc.) gets one sale price.
- A product with options: tick which specific options are on sale and give each its own sale price. The others keep selling at the normal price.
- "End Sale" turns everything on that product off in one tap, but keeps the sale prices you typed in, so turning the same sale back on later doesn't mean retyping every price.
- A pink "ON SALE" tag appears next to the product's name in the admin list once anything on it is on sale.

On the customer site, a product that's fully on sale shows a red "SAVE R X.XX" badge on its photo with the sale price in red and the normal price crossed out next to it. A product where only some options are on sale shows a "SALE" badge and "From R X.XX" until a customer picks a specific option, at which point the price updates to that option's own price (discounted or not). Carts, checkout and order confirmations always show the price actually charged, with the normal price crossed out when it was discounted - orders keep that snapshot forever, so changing or ending a sale later never changes what a past order shows.

**Deleting a product** - "Delete" is separate from "Deactivate": Deactivate hides a product temporarily and it can be switched back on; Delete is for duplicates or mistakes and can't be undone from the UI. A product that's never actually been ordered, stocked or pre-ordered is removed completely, including its image. A product with any history instead disappears from the shop exactly like a deactivated one, but can't be brought back - its name and price stay intact on its past orders.

The sysadmin Backups page reads only what the script reports - it shows "Backups aren't set up on this server yet" until the first run reports in, and a warning if the last successful backup is over 26 hours old or the most recent run failed.

## Admin navigation and refresh

The owner/staff admin dashboard (admin-dashboard, not the sysadmin view) keeps its current section in the URL - `/products`, `/orders`, `/preorders`, `/lash-training`, `/image-management`, `/website-content`, `/notifications`, `/settings`, and `/` for Dashboard. Refreshing, or hitting the browser back/forward buttons, stays on (or returns to) the same section, and each page's own filter/tab (Orders' active/archived view, Image Management's tab, Notifications' tab) is kept in a query param too, so a refresh restores that as well.

This is a small hand-rolled `history.pushState`/`popstate` router (see `admin-dashboard/src/router.js`), not react-router - the whole app already renders from one component via `activePage === 'x' && (...)` blocks rather than `<Route>` elements, so adding a real router would mean restructuring that render tree; a thin pushState wrapper gets the same real URLs (not a `#/` hash) for far less churn. Production (Render) and the Vite dev server both already serve `index.html` for any unmatched path, so a deep link like `/products` survives a hard refresh in both; nothing extra was needed there.

An unknown or no-longer-visible-to-this-role URL falls back to Dashboard. Visiting while logged out keeps the intended page as `?next=/products` and returns there after signing in - `next` is only ever accepted if it's one of the known admin page paths above, never an arbitrary string, to avoid it being used as an open redirect.

**The sysadmin dashboard** (`SysAdminDashboard.jsx` - a separate component, not a page inside admin-dashboard's own App.jsx) gets the same treatment, under its own `/sysadmin` prefix so nothing clashes with the owner/staff paths above (both have a Settings page): `/sysadmin` (Overview), `/sysadmin/users`, `/sysadmin/roles`, `/sysadmin/audit-log`, `/sysadmin/system-controls`, `/sysadmin/payments`, `/sysadmin/system-health`, `/sysadmin/errors`, `/sysadmin/test-data`, `/sysadmin/backups`, `/sysadmin/login-activity`, `/sysadmin/settings`. The two page sets are kept as entirely separate maps in `router.js` (`PAGE_TO_PATH` / `SYSADMIN_PAGE_TO_PATH`) rather than one shared one, since both dashboards already use the same page-value string (`'settings'`) for different things. Audit Log's page number, and the Payments/Errors filters, are kept in query params the same way. A sysadmin can only ever reach the sysadmin pages and vice versa for owner/staff - this was already true structurally (`main.jsx` renders one dashboard component or the other purely from `user.role`, regardless of URL), and is now also enforced for the URL itself: landing on, or being sent `?next=` to, a path outside your role's namespace redirects to your own home (`/sysadmin` or `/`) instead, corrected before that dashboard ever mounts so there's no flash of the wrong one. This is frontend routing only - every sysadmin-only API route already requires `requireRole('sysadmin')` (or `requireRole('sysadmin', 'owner')` where owner genuinely shares access, e.g. user management) independently of anything the URL does.

## Admin session security

Because the admin dashboard holds sales records, sessions end automatically:

- **Idle timeout** (`ADMIN_IDLE_TIMEOUT_MINUTES`, default 5) - signed out after this many minutes with no activity.
- **Maximum session length** (`ADMIN_MAX_SESSION_HOURS`, default 12) - signed out this many hours after logging in, no matter how active.
- **Idle warning** (`ADMIN_IDLE_WARNING_SECONDS`, default 60) - how long before the idle timeout a "Are you still there?" dialog appears, with a live countdown and "Stay signed in" / "Sign out".
- **Grace margin** (`ADMIN_SESSION_GRACE_SECONDS`, default 30) - absorbs normal clock/network drift between the browser's own idle timer and this check, so a session is never rejected just because its last heartbeat hasn't arrived yet. Matches the frontend's own 30-second activity-ping throttle.

**How it's enforced.** Each login creates a row in a new `sessions` table (`user_id`, `issued_at`, `last_activity_at`, `revoked_at`) - the JWT stays the same stateless token as before (re-validated against the user's own row on every request, as it always was), just now carrying that session row's id too. `authenticate()` (backend/auth.js) checks the session's age and idle time on every authenticated request, independently of the browser - a request past either limit gets `401 { code: "SESSION_EXPIRED", reason: "idle" | "max_age" | "revoked" | "not_found" }`, whether or not the frontend's own timer has caught up yet. A request with the header `X-Background: 1` is still checked, but never counts as the activity that keeps a session alive - nothing in this app polls yet, but the plumbing is there for anything that does later. `POST /api/auth/logout` revokes one session; the sysadmin's existing "log out everywhere" now also revokes every session row for that user, not just the token_version bump it already did.

**Frontend.** `admin-dashboard/src/SessionManager.jsx`, mounted once at the app root for as long as someone's signed in (regardless of which of the two dashboards), tracks mouse/key/touch/scroll activity, re-derives the idle/max deadlines from shared localStorage timestamps on every check (so a laptop sleeping or a tab backgrounded is caught up on wake/focus by comparing real timestamps, not a stale `setTimeout`), and shows the warning dialog. It also installs a scoped `window.fetch` interceptor for its own lifetime, so a `SESSION_EXPIRED` 401 from *any* request - including the sysadmin dashboard's own ad-hoc `fetch` calls, which don't go through a shared helper the way admin-dashboard's `apiFetch` does - triggers the same sign-out, without having to rewire every call site individually. Multiple tabs stay in sync via `BroadcastChannel` (with a `localStorage`-event fallback for browsers without it): activity in one tab keeps all of them alive (they share the same localStorage clock), and signing out in one signs out all of them.

**Token storage.** The JWT still lives in plain `localStorage`, not an httpOnly cookie - deliberately left as-is rather than migrated. The admin and API are on different Render services with no shared parent domain today (and `http://localhost:5274` vs `:3002` in dev isn't same-site either), so a cookie would need `SameSite=None; Secure`, which is genuinely cross-site: subject to browsers' third-party-cookie blocking (increasingly on by default), and `SameSite=None` gives no CSRF protection on its own, so it'd need its own CSRF scheme plus `credentials: true` CORS everywhere. That's a real availability risk for a bigger security win than this internal, 1-3-user tool needs right now. It becomes straightforward and worth doing once the admin and API share a parent domain (e.g. `admin.hairbyher.co.za` + `api.hairbyher.co.za` under `hairbyher.co.za`) - noted here as a follow-up, not done.

**Testing with short timeouts.** Set these in `backend/.env` (or export them before `npm run dev`) and restart the backend - the frontend reads them from `GET /api/auth/session-config`, so nothing on the frontend needs to change:

```
ADMIN_IDLE_TIMEOUT_MINUTES=1
ADMIN_IDLE_WARNING_SECONDS=20
ADMIN_MAX_SESSION_HOURS=0.083
```

(`0.083` hours ≈ 5 minutes - fractional values are accepted.) Remove them (or set back to the defaults above) when you're done; they're not meant to be committed.

### Manual test checklist

- Refresh (F5 / Ctrl+R / Ctrl+Shift+R) on several sections (Products, Orders, Settings, etc.) - each should reload on the same page, not Dashboard.
- Click through several sidebar links, then use the browser's back and forward buttons - they should step between the pages you visited, in order.
- Switch the Orders view (active/archived) or the Image Management tab, refresh - it should still be on the same filter/tab.
- Log out, then visit an admin URL directly (e.g. `/products`) - you should land on Login with `?next=/products` in the address bar, and end up back on Products after signing in.
- Visit an unknown path (e.g. `/nonsense`) - falls back to Dashboard.
- With a short idle timeout set (see above), leave the tab alone - the "Are you still there?" dialog should appear with a live countdown, and clicking "Stay signed in" should dismiss it and reset the clock.
- Let the countdown run out without clicking anything - you should land back on Login with the inactivity message, and `?next=` set to whatever page you were on.
- With a short max session length set, stay active the whole time - you should still be signed out when the max session time is up, with the different "session has ended for security" message.
- Open the admin in two tabs; interact in one - the other's idle timer should reset too (no warning appears if you're active in either). Sign out in one tab - the other should sign out as well within a second or two.
- Put the laptop to sleep (or just leave the tab backgrounded a while) past the idle timeout, then wake it / refocus the tab - it should sign out immediately rather than waiting for a delayed timer.
- As a sysadmin: refresh on several sysadmin pages (Audit Log, Payments, Errors, etc.) - each should reload on the same page, not Overview.
- As a sysadmin: set an Audit Log page number, or a Payments/Errors filter, then refresh - it should still show the same page/filter.
- As a sysadmin: click through sysadmin sidebar links, then use back/forward - they should step between the sysadmin pages you visited.
- Log in as an owner/staff user, then manually visit a `/sysadmin/*` URL - you should be redirected to `/` (Dashboard), never see sysadmin content.
- Log in as sysadmin, then manually visit an owner/staff URL (e.g. `/products`) - you should be redirected to `/sysadmin` (Overview).
- Log out as sysadmin from a sysadmin page, then sign back in - you should return to that same sysadmin page, not Overview or Dashboard.
- While logged out, visit an owner/staff URL, then log in as sysadmin - you should land on `/sysadmin` (your own home), not the owner/staff page you weren't allowed into; and vice versa for an owner/staff login after visiting a `/sysadmin/*` URL while logged out.
