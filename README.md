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

### customer-site and admin-dashboard

Copy .env.example to .env in each app and fill in values.

- VITE_API_URL — base URL of the backend API, no trailing /api (e.g. http://localhost:3002)

## Deploying to Render

Three services: backend as a web service, customer-site and admin-dashboard as static sites, plus a Render Postgres database.

Backend (web service)
- Root directory: backend
- Build command: npm ci
- Start command: node index.js
- Environment: DATABASE_URL, PORT, NODE_ENV=production, JWT_SECRET, ADMIN_DEFAULT_PASSWORD, ALLOWED_ORIGINS, SETMORE_REFRESH_TOKEN

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
