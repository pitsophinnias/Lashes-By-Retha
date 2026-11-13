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
- PORT — port the API listens on (defaults to 3002)
- NODE_ENV — development or production; production enforces the required secrets below
- JWT_SECRET — signs auth tokens; required in production, must be at least 32 characters
- ADMIN_DEFAULT_PASSWORD — password for the seeded sysadmin account; required in production
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
