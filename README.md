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
- PUBLIC_API_URL — this backend's own public https URL, no trailing slash; used to build the Ozow return and notify URLs
- CUSTOMER_SITE_URL — the customer site's public URL, no trailing slash; used to redirect the customer back after paying with Ozow

Ozow counts as configured only when OZOW_SITE_CODE, OZOW_PRIVATE_KEY, OZOW_API_KEY, PUBLIC_API_URL and CUSTOMER_SITE_URL are all set. Leave any of them unset and checkout only offers EFT.

### customer-site and admin-dashboard

Copy .env.example to .env in each app and fill in values.

- VITE_API_URL — base URL of the backend API, no trailing /api (e.g. http://localhost:3002)

## Deploying to Render

Three services: backend as a web service, customer-site and admin-dashboard as static sites, plus a Render Postgres database.

Backend (web service)
- Root directory: backend
- Build command: npm ci
- Start command: node index.js
- Environment: DATABASE_URL, PORT, NODE_ENV=production, JWT_SECRET, ADMIN_DEFAULT_PASSWORD, ALLOWED_ORIGINS, SETMORE_REFRESH_TOKEN, CLOUDINARY_URL, OZOW_SITE_CODE, OZOW_PRIVATE_KEY, OZOW_API_KEY, OZOW_IS_TEST, PUBLIC_API_URL, CUSTOMER_SITE_URL

If you have existing images under backend/uploads from before CLOUDINARY_URL was set, run `npm run migrate:uploads` from backend/ (with CLOUDINARY_URL set in your environment) to upload them to Cloudinary and update the database. It is safe to run more than once.

Customer site (static site)
- Root directory: customer-site
- Build command: npm ci && npm run build
- Publish directory: dist
- Environment: VITE_API_URL

Admin dashboard (static site)
- Root directory: admin-dashboard
- Build command: npm ci && npm run build
- Publish directory: dist
- Environment: VITE_API_URL
