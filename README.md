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
- UPLOAD_DIR — where uploaded images/videos are stored on disk; defaults to `./uploads` (i.e. backend/uploads) for local dev. On the server, point this at a persistent folder outside the repo (e.g. `/home/serverha/hbh-uploads`) so a `git pull` never touches uploaded files.
- MAX_FILE_SIZE_MB, MAX_VIDEO_FILE_SIZE_MB — max upload size; default to 10MB for images and 100MB for videos.
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

Render will ask for the secret values on first creation: `ADMIN_DEFAULT_PASSWORD`, `OZOW_SITE_CODE`, `OZOW_PRIVATE_KEY`, `OZOW_API_KEY`, `PAYFLEX_CLIENT_ID`, `PAYFLEX_CLIENT_SECRET`. `JWT_SECRET` is generated automatically.

If Render gives a service a different `onrender.com` address than its name (because the name was taken), update `PUBLIC_API_URL`, `ALLOWED_ORIGINS` and both `VITE_API_URL` values in the Blueprint to match, then redeploy the static sites with "Clear build cache & deploy".

Custom domains: the Blueprint adds `www.hairbyher.co.za` and `hairbyher.co.za` to the customer site. In Cloudflare, both must be CNAME records pointing to `hairbyher-site.onrender.com`, set to DNS only (grey cloud) until Render shows them verified. Do not use an A record to 216.24.57.1 with Cloudflare, it causes Error 1000.

`OZOW_IS_TEST` stays `true` until a test payment has passed.

If you have existing images/videos still referenced by `res.cloudinary.com` URLs from before this app moved to local disk storage, run `npm run migrate:cloudinary:dry` from backend/ first to see what it would do, then `npm run migrate:cloudinary` to download them into `UPLOAD_DIR` and rewrite the database. It is safe to run more than once.

## Database backups

Render's free Postgres plan has no shell access to run `pg_dump` or cron against it, so backups run from cron on whichever server actually hosts the database (e.g. the Zeecom server), using `backend/scripts/backup.sh`:

1. Set `BACKUP_REPORT_TOKEN` on the backend (any long random string).
2. On the database server, add a crontab entry that sets `DATABASE_URL`, `BACKUP_REPORT_TOKEN` (same value as above) and `REPORT_URL` (the backend's `/api/system/backups/report` URL), then runs `backend/scripts/backup.sh` - see the comments at the top of that script for the exact variables and an example crontab line.
3. Also set `UPLOAD_DIR` on that same crontab line (matching the backend's own `UPLOAD_DIR`) so uploaded images/videos are archived alongside the database dump on every run, not just the database itself.
4. Optionally set `RCLONE_REMOTE` too, for an offsite copy of each backup (database dump and uploads archive) via `rclone`.

## Sales and deleting products

**Putting a product on sale** - on a product's card in the admin Products page, click "Put on Sale" (it becomes "Manage Sale" once anything on it is on sale). There are no start/end dates - you switch a sale on and off yourself.

- A product with no lash length/curl or custom options (shade, size, etc.) gets one sale price.
- A product with options: tick which specific options are on sale and give each its own sale price. The others keep selling at the normal price.
- "End Sale" turns everything on that product off in one tap, but keeps the sale prices you typed in, so turning the same sale back on later doesn't mean retyping every price.
- A pink "ON SALE" tag appears next to the product's name in the admin list once anything on it is on sale.

On the customer site, a product that's fully on sale shows a red "SAVE R X.XX" badge on its photo with the sale price in red and the normal price crossed out next to it. A product where only some options are on sale shows a "SALE" badge and "From R X.XX" until a customer picks a specific option, at which point the price updates to that option's own price (discounted or not). Carts, checkout and order confirmations always show the price actually charged, with the normal price crossed out when it was discounted - orders keep that snapshot forever, so changing or ending a sale later never changes what a past order shows.

**Different prices per option** - for a product where the options genuinely cost different amounts (a wig at 10" vs 14", say, rather than a makeup shade or lash length, which stay one price) - tick "Different price per option" in Manage Options, give each option its own price, and the shop, cart, sales and orders all use that option's price from then on; turning it back off returns to the one product price without losing what you'd typed in.

**Deleting a product** - "Delete" is separate from "Deactivate": Deactivate hides a product temporarily and it can be switched back on; Delete is for duplicates or mistakes and can't be undone from the UI. A product that's never actually been ordered, stocked or pre-ordered is removed completely, including its image. A product with any history instead disappears from the shop exactly like a deactivated one, but can't be brought back - its name and price stay intact on its past orders.

**Managing pre-order products** - the Pre-orders page's "Pre-order products" tab (next to "Customer pre-orders"), grouped by section, is where you add one or several products to pre-order at once (search, tick, then set each one's deposit and an optional expected arrival date before saving them all together), edit or remove one, or select several to remove at once - the exact same fields as the Pre-order checkbox on that product's own Edit form, so whichever one you use, the other always shows the same thing. Taking a product off pre-order only stops new ones; anyone who's already placed one keeps theirs exactly as it was.

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

## Messaging customers

Every order, pre-order and student has a "Message Customer" button that opens a ready-to-send WhatsApp or email message - no more typing these out by hand.

**Using it.** The panel opens with a template already picked to match whatever's currently going on (e.g. confirming an order pre-selects "Order received", marking a pre-order as arrived pre-selects "Stock has arrived"), with the message and email subject already filled in with that customer's name, items, amounts and your bank details. You can pick a different template from the dropdown, or just edit the text box directly for a one-off tweak - editing here never changes the template itself. Then:

- **Send on WhatsApp** - opens the message pre-typed in a WhatsApp chat with that customer (opens WhatsApp Web/Desktop on a computer, the WhatsApp app on a phone). Disabled with a reason shown if there's no usable phone number on file.
- **Send email** - opens it in your email app with the subject and body filled in. If the message is too long for that to work reliably, the button's replaced with a hint to use Copy instead.
- **Copy** - copies the message text so you can paste it anywhere (e.g. into WhatsApp yourself if you'd rather pick the contact manually).

After certain actions - confirming an order, marking a pre-order as arrived or dispatched, recording a payment - a toast pops up asking e.g. "Let Naledi know her order is ready?" with its own [Send on WhatsApp] / [Preview] buttons, so you don't have to go find the Message Customer button yourself. Bulk actions (like marking every pre-order of one product as arrived at once) show one plain toast instead ("5 pre-orders marked as arrived. Message customers from each pre-order.") rather than asking about five customers one at a time.

**Confirmed course dates.** A student's "Preferred start" is just what they typed in when enrolling - unconfirmed. On the Lash Training page, "Set course dates" (shown on every current student) records the actual start date you agreed with them; the end date is calculated from the course's length but you can adjust it (holidays, changes). Once set, both dates show on the student and "Edit dates" lets you correct them later. **Tuition must be fully paid before the end date** - there's no instalment schedule - so reminders and message templates count down from end_date only, never the original preferred start date.

**Reminders due** (Dashboard, owners only) lists students who need a nudge today, counting back from their confirmed end date:
- **Payment reminder** - the end date is within "Payment reminder" days (default 14) but further off than the certificate window.
- **Certificate warning** - the end date is within "Certificate warning" days (default 7) and hasn't passed yet.
- **Overdue** - the end date has already passed with a balance still outstanding (shown as e.g. "Course ended 3 Dec, R 450.00 outstanding").

Each has [Send on WhatsApp], [Preview] and [Done]. Marking one done doesn't log a message history - it just notes when and which type, so the same reminder won't nag again until a few days pass (`reminderSnoozeDays`, below) or the type changes (e.g. payment → overdue shows immediately). A student with no confirmed end date is never reminded - instead they're listed under "Missing course dates" on the same card, with a shortcut straight to "Set course dates".

**Certificate on hold.** If a student still owes money when you click "Finished course", you're warned ("Balance still outstanding... Mark the course as finished anyway?") before confirming, and the student moves to Past Students tagged "Certificate on hold".

Every student is on either Current Students or Past Students has a **Record Payment** button (for an EFT, cash, or anything else that didn't come through Ozow/Payflex) and a **Payment history** list showing every payment - manual or gateway - with a Remove button on each. Recording or removing a payment always recalculates the balance from scratch, and the certificate hold always follows that real balance:

- Recording a manual payment that brings a held student's balance to zero clears the hold **immediately** - the "Balance paid, certificate can now be issued" toast with [Send on WhatsApp] (course-completed template) appears in the same step, no reload needed.
- A gateway payment (the student paying their own "Copy balance link") clears the hold the same way, but since nothing in this app pushes live updates to your screen, that toast instead appears the next time you load the Dashboard after it happens - via the same notification bell as everything else, not instantly.
- Removing a payment (correcting a mistake) that drops a **finished** student's balance back above zero puts the hold back on, with a heads-up toast ("...certificate is on hold again").
- Removing a payment from a student who hasn't finished yet just updates their balance - there's no certificate concept to hold until they're marked finished.

**Editing templates** (Settings → Message Templates, owners only) - grouped by Orders, Pre-orders and Lash Training. Click a template to expand it: the WhatsApp text and email subject are both editable, with clickable chips to insert placeholders like `{customer_name}` or `{balance}` at the cursor, and a live preview underneath showing exactly what a real message would look like. Typing a placeholder that doesn't exist (a typo like `{totl}`) shows a warning when you save, though it still saves - it just renders as nothing rather than showing up as literal `{totl}` in a real message. "Reset to default" discards your edit and goes back to the built-in wording. Staff can use every template to message customers, but only owners (and sysadmin) can edit or reset one - editing changes what everyone sends, so it's kept to the same people who can already change other shop-wide settings.

**Business details** (Settings, owners only) is where the bank account and WhatsApp-for-proof-of-payment numbers used in templates and on the customer site's EFT screen are set, along with the reminder windows above. Changing the **account number** asks you to double-check it first ("Customers will be asked to pay into this new account...") before saving, is logged to the sysadmin Audit Log with the old and new value, and raises a sysadmin-only notification - getting this wrong means customers paying into the wrong account, so it gets extra friction and a paper trail. The public customer-site EFT screen only ever reads the four fields it actually displays (bank, account name, account number, WhatsApp number) from a public endpoint - nothing else from Settings is exposed publicly. If that screen's request fails, it retries once, then shows "We couldn't load our payment details. Please WhatsApp us on 082 685 5399." rather than silently showing stale or blank bank details.

Templates are stored as overrides, not full copies - a template with no edits ever made just uses the built-in wording, so improvements to the defaults in future updates reach anyone who hasn't customised that particular one.

**Phone numbers.** Every phone number in the system - however it was typed in (`082 685 5399`, `0826855399`, `+27 82 685 5399`) - is normalised to the same `27826855399` form before building a `wa.me` link, so messaging always works regardless of how the number was originally entered.

**Privacy.** A customer's phone number and email are only ever returned by authenticated owner/staff/sysadmin routes (`GET /api/admin/preorders` is the only place a pre-order's contact details are returned at all, and it requires owner or sysadmin). Every public, token-based "look up my own order/pre-order/enrolment" endpoint omits contact details entirely, even for the customer looking up their own record, since the token already proves who they are without needing to echo it back - see `backend/test/privacy-public-endpoints.test.js`.

### Developer notes

- Template rendering and phone-number normalisation live in `backend/src/messaging/{templates,phone}.js` and are mirrored in `admin-dashboard/src/messaging/{render,phone}.js` (duplicated rather than shared, since the Vite app and the Express backend don't share a package) so the Settings page's live preview and the Message Customer panel can render instantly without a round-trip. **The admin-dashboard copy is what actually builds every `wa.me`/`mailto`/Copy message a customer receives** - the backend copy is tested but not itself called from any live send path (only `findUnknownPlaceholders`, for save-time validation, actually runs server-side). `shared/messaging-fixtures.json` at the repo root is run against both copies by `backend/test/messaging-fixtures-parity.test.js`, so they can't silently drift apart - update both files together, and add a fixture for anything that depends on their exact output matching.
- `message_templates` (DB table) holds only overrides, keyed by template id (e.g. `order_payment_received`) - no row means "use the built-in default" from `backend/src/messaging/templates.js`.
- `students.start_date` / `students.end_date` are the confirmed course dates (see "Confirmed course dates" above) - backfilled once from `preferred_start_date` + the course's `duration_days` when this column was added (`backend/db.js`, logged at startup as "Course dates backfill"), and are what every reminder and message placeholder (`{due_date}`, `{course_end_date}`) reads from from then on. `preferred_start_date` itself is kept only as the pre-fill default when first setting dates - never read by reminders or templates again.
- `students.last_reminded_at` / `students.last_reminder_type` are the only reminder state kept - there's no message history table. A reminder is re-offered once `reminderSnoozeDays` has passed since the last one, or immediately if the type has changed.
- `student_payments` is the ledger behind a student's `amount_paid` - one row per payment, manual (`source = 'manual'`, via `POST .../students/:id/payments`) or gateway (`'ozow'`/`'payflex'`, inserted by `applyStudentOutcome` in `backend/paymentOutcomes.js`), plus a one-off `'legacy'` row backfilled for whatever a student had already paid before this table existed. `backend/src/students/balance.js`'s `recalculateStudentBalance(client, studentId)` is the **only** place `amount_paid`/`payment_status`/`status`/`certificate_on_hold` are written - it sums the ledger and recomputes all four fresh every time, inside the same transaction as whatever ledger row was just inserted or deleted. `certificate_on_hold` is `true` whenever the student is `completed` and the recomputed balance is still above zero - never a one-way flag, so deleting or correcting a payment that drops a finished student's balance back into debt sets it back on automatically. `PATCH .../complete`/`.../reactivate` go through the same function (setting `status` first, then recalculating), rather than computing the hold separately.
- A manual payment (`POST .../students/:id/payments`) reports `certificateJustCleared`/the gateway path's `applyStudentOutcome` return value and a payment deletion (`DELETE .../payments/:paymentId`) reports `certificateJustReHeld`, both in the same response - that's what lets the frontend show the "certificate can now be issued" toast immediately for a manual payment, never waiting for a reload. A gateway payment has no such response for the Dashboard to react to, so it instead raises a `certificate_cleared` notification that turns into the one-time, next-load toast described above.
- `GET /api/admin/preorders` returns the customer's real name, phone and email (previously the name was masked) - needed for this feature to work, and consistent with orders, which were never masked to begin with. This is the *only* route that does; see "Privacy" above.
- `GET /api/business-details` (public) and `GET /api/admin/system/messaging` (authenticated, any role) read the same `systemSettings.messaging` value but return different subsets - the public one only the four EFT-screen fields, the admin one everything (business name, reminder-day settings included), since staff need `{business_name}`/`{bank_details}`/`{pop_number}` for messaging but have no reason to see reminder-day settings on the public internet.
- The channel-building functions (`whatsappLink` / `emailLink` / `copyToClipboard`) are a small, deliberately uniform interface so a future automated channel (e.g. actually sending via a WhatsApp Business API instead of opening a link) could be dropped in without changing how the Message Customer panel itself works.

### Manual test checklist

- Open Message Customer from an order, a pre-order and a student - confirm the right template is pre-selected for each one's current status, and that the text has real values filled in (no stray `{placeholder}` text).
- Edit the message text, then switch templates - your edit should be replaced by the newly selected template (edits don't carry over, and don't change the template itself).
- Click Send on WhatsApp on a desktop browser with WhatsApp Web or WhatsApp Desktop set up - confirm it opens a chat with that customer and the message pre-filled.
- Open the same panel on a phone and tap Send on WhatsApp - confirm it opens the WhatsApp app directly with the chat and message pre-filled.
- Try it on a customer with no phone number, and one with an invalid one - the WhatsApp button should be disabled with a reason shown either way.
- Click Send email - confirm it opens your mail client with the subject and body filled in; try it on a very long message (e.g. an order with many items) and confirm the "too long, use Copy" fallback appears instead.
- Click Copy and paste somewhere - confirm the full message comes through, and a toast confirms the copy.
- Confirm an order, mark a pre-order as arrived, and record a student payment - confirm each shows a proactive "message customer?" toast afterwards, and that its [Send on WhatsApp]/[Preview] buttons work.
- Use a bulk action (e.g. "mark all pre-orders of this product as arrived") on several at once - confirm you get one plain toast, not one prompt per customer.
- As owner, go to Settings → Message Templates, edit one template's text and save - confirm a toast appears, the change persists on refresh, and "Reset to default" brings back the original wording.
- In a template, type an unknown placeholder like `{totl}` and save - confirm a warning appears, and that a preview or real message shows nothing where that placeholder is (not literal braces).
- As staff, confirm you can open and send from Message Customer, but can't see/use the Settings → Message Templates editor.
- As owner, edit Business Details (e.g. change the WhatsApp proof-of-payment number) and save - confirm a new template preview picks up the change, and the customer site's EFT payment screen shows the updated details too.
- As owner, change the account number and save - confirm the "Change payment account?" dialog appears with the new number shown, and that saving any *other* field (leaving the account number the same) does not show it.
- After changing the account number, check the sysadmin Audit Log - confirm an entry shows both the old and new number - and the sysadmin System Notifications panel - confirm "Payment account number changed" appears there (and does **not** appear in the owner/staff notification bell).
- On a current student, click "Set course dates" - confirm the start date is pre-filled from their preferred start date and the end date auto-fills from the course length; change the start date again and confirm the end date recalculates, unless you've already edited it directly.
- Set a student's end date to a few days from today with a balance still owing (see below for how to do this quickly) - confirm they appear in Reminders Due with the right type (payment/certificate) and reappear in "Missing course dates" if you clear their end date.
- Set a student's end date to a day in the past with a balance owing - confirm they show as "Overdue" with "Course ended [date], R X outstanding" as the reason.
- Click "Finished course" on a student with an outstanding balance - confirm the "Balance still outstanding" warning dialog appears with the right amount, and that confirming tags them "Certificate on hold" under Past Students.
- On a "Certificate on hold" student, click "Record Payment" and enter the exact outstanding amount - confirm the "Balance paid. ...certificate can now be issued" toast with [Send on WhatsApp] appears **immediately**, in the same step, and the "Certificate on hold" tag is gone.
- Instead, send that same scenario's student their "Copy balance link" and pay it off (Ozow/Payflex sandbox), then reload the Dashboard - confirm the tag is gone and the same toast appears, but only after the reload, not before.
- Open "Payment history" on a student with both a manual and a gateway payment recorded - confirm both show up, with the right amount/source/date.
- On a finished, fully-paid student (no hold), click "Payment history" and "Remove" their only payment - confirm the "Certificate on hold" tag reappears with a "...certificate is on hold again" toast, and the balance shown updates to match.
- Remove a payment from a student who hasn't finished the course yet - confirm their balance updates and nothing certificate-related happens (no tag, no toast about it).
- Click "Finished course" on a student with **no** balance owing - confirm the ordinary "Mark as Finished" dialog appears instead, with no certificate warning.

### Testing reminder windows quickly

The fastest way to see each reminder type without waiting days: open a student's "Set course dates" dialog and set the **end date** directly -
- A few days out (e.g. today + 10, with the default 14/7-day settings) → payment reminder.
- Within a week (today + 5) → certificate warning.
- Yesterday or earlier → overdue.

Use a student who hasn't paid (or has only partially paid via the real Ozow/Payflex sandbox flow) - the Payment Status dropdown on its own only changes the label shown, not the actual amount paid the balance is calculated from, so switching it to "Paid" will exclude them from reminders regardless of the end date. Lower `paymentReminderDays`/`certificateWarningDays` in Settings → Business Details if you want the windows themselves to be easier to land inside with real dates instead.
